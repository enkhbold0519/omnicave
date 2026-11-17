"""Business logic. Pure Python + SQL via db.py (SQLite or PostgreSQL); no web framework imports here."""
from __future__ import annotations

import json
import random
import re
import secrets
import statistics
from datetime import date, datetime, timedelta, timezone
from typing import Iterator

from . import config, db, geometry as geo, inventory, llm, market, news, security
from .catalog import CATALOG
from .common import ApiError, notify, utc
from .inventory import WINE_FIELDS, COLORS, BOTTLE_SQL  # noqa: F401  (re-exported)

_notify = notify


def _loc(b: dict) -> str:
    return geo.location_text(b, b.get("rack_name"))


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# =====================================================================
# Users & auth
# =====================================================================
def register(username: str, email: str, password: str, seed_demo: bool = True) -> dict:
    username = (username or "").strip()
    email = (email or "").strip().lower()
    if not re.fullmatch(r"[A-Za-z0-9_.-]{3,32}", username):
        raise ApiError(400, "Username must be 3-32 chars (letters, digits, _ . -)")
    if not EMAIL_RE.match(email):
        raise ApiError(400, "Invalid email")
    if len(password or "") < 8:
        raise ApiError(400, "Password must be at least 8 characters")
    with db.tx() as c:
        if db.one(c, "SELECT 1 FROM users WHERE username=? OR email=?", (username, email)):
            raise ApiError(409, "Username or email already registered")
        cur = c.execute(
            "INSERT INTO users(username,email,pw_hash,display_name) VALUES(?,?,?,?)",
            (username, email, security.hash_password(password), username),
        )
        uid = cur.lastrowid
        cid = inventory.create_cellar_row(c, uid, "Main Cellar", "tall")
        if seed_demo:
            inventory.seed_demo(c, uid, cid)
    return login(username, password)


def login(username: str, password: str) -> dict:
    with db.tx() as c:
        u = db.one(c, "SELECT * FROM users WHERE username=? OR email=?", (username, (username or "").lower()))
        if not u or not security.verify_password(password or "", u["pw_hash"]):
            raise ApiError(401, "Invalid username or password")
        token = security.new_token()
        c.execute(
            "INSERT INTO tokens(token_hash,user_id,expires_at) VALUES(?,?,?)",
            (security.token_hash(token), u["id"], utc(config.TOKEN_TTL_HOURS * 3600)),
        )
        c.execute("DELETE FROM tokens WHERE expires_at < ?", (utc(),))
    return {"access_token": token, "token_type": "bearer", "user": _public_user(u)}


def logout(token: str) -> dict:
    with db.tx() as c:
        c.execute("DELETE FROM tokens WHERE token_hash=?", (security.token_hash(token),))
    return {"ok": True}


def user_from_token(token: str | None) -> dict:
    if not token:
        raise ApiError(401, "Not authenticated")
    with db.tx() as c:
        u = db.one(
            c,
            "SELECT u.* FROM tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=? AND t.expires_at > ?",
            (security.token_hash(token), utc()),
        )
    if not u:
        raise ApiError(401, "Session expired, please log in again")
    return u


def _public_user(u: dict) -> dict:
    return {
        "id": u["id"],
        "username": u["username"],
        "email": u["email"],
        "display_name": u["display_name"],
        "preferences": json.loads(u["preferences"] or "{}"),
        "briefing_time": u["briefing_time"],
    }


def get_me(user: dict) -> dict:
    return _public_user(user)


def update_me(user: dict, body: dict) -> dict:
    sets, params = [], []
    if "display_name" in body:
        sets.append("display_name=?"); params.append(str(body["display_name"])[:64])
    if "email" in body:
        email = str(body["email"]).strip().lower()
        if not EMAIL_RE.match(email):
            raise ApiError(400, "Invalid email")
        sets.append("email=?"); params.append(email)
    if "preferences" in body and isinstance(body["preferences"], dict):
        sets.append("preferences=?"); params.append(db.dumps(body["preferences"]))
    if "briefing_time" in body:
        if not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", str(body["briefing_time"])):
            raise ApiError(400, "briefing_time must be HH:MM")
        sets.append("briefing_time=?"); params.append(body["briefing_time"])
    if "password" in body:
        if len(body["password"]) < 8:
            raise ApiError(400, "Password must be at least 8 characters")
        sets.append("pw_hash=?"); params.append(security.hash_password(body["password"]))
    if sets:
        with db.tx() as c:
            try:
                c.execute(f"UPDATE users SET {', '.join(sets)} WHERE id=?", (*params, user["id"]))
            except Exception:
                raise ApiError(409, "Email already in use")
            user = db.one(c, "SELECT * FROM users WHERE id=?", (user["id"],))
    return _public_user(user)


def export_me(user: dict) -> dict:
    """GDPR data export: everything stored for this user."""
    uid = user["id"]
    with db.tx() as c:
        return {
            "exported_at": utc(),
            "user": _public_user(user),
            "cellars": db.rows(c, "SELECT * FROM cellars WHERE user_id=?", (uid,)),
            "zones": db.rows(c, "SELECT z.* FROM zones z JOIN cellars c ON c.id=z.cellar_id WHERE c.user_id=?", (uid,)),
            "racks": db.rows(c, "SELECT r.* FROM racks r JOIN cellars c ON c.id=r.cellar_id WHERE c.user_id=?", (uid,)),
            "devices": db.rows(c, "SELECT id, uid, model, name, cellar_id, created_at FROM devices WHERE user_id=?", (uid,)),
            "bottles": db.rows(c, "SELECT b.*, w.name, w.producer, w.vintage FROM bottles b JOIN wines w ON w.id=b.wine_id WHERE b.user_id=?", (uid,)),
            "consumption": db.rows(c, "SELECT * FROM consumption WHERE user_id=?", (uid,)),
            "notifications": db.rows(c, "SELECT * FROM notifications WHERE user_id=?", (uid,)),
            "sommeliers": db.rows(c, "SELECT * FROM user_personas WHERE user_id=?", (uid,)),
            "sommelier_memory": db.rows(c, "SELECT * FROM persona_memory WHERE user_id=?", (uid,)),
        }


def delete_me(user: dict) -> dict:
    """GDPR right to erasure (cascades to all owned rows)."""
    with db.tx() as c:
        c.execute("DELETE FROM users WHERE id=?", (user["id"],))
    return {"deleted": True}


# =====================================================================
# Environment & notifications
# =====================================================================
def update_zone(user: dict, zid: int, body: dict) -> dict:
    allowed = ("target_temp", "target_hum", "temp_min", "temp_max", "hum_min", "hum_max", "alert_minutes")
    with db.tx() as c:
        z = db.one(c, "SELECT z.* FROM zones z JOIN cellars c ON c.id=z.cellar_id WHERE z.id=? AND c.user_id=?", (zid, user["id"]))
        if not z:
            raise ApiError(404, "Zone not found")
        vals = {k: float(body[k]) for k in allowed if k in body}
        merged = z | vals
        if not (merged["temp_min"] < merged["target_temp"] < merged["temp_max"]):
            raise ApiError(400, "target_temp must be between temp_min and temp_max")
        if not (merged["hum_min"] < merged["target_hum"] < merged["hum_max"]):
            raise ApiError(400, "target_hum must be between hum_min and hum_max")
        if vals:
            c.execute(f"UPDATE zones SET {', '.join(f'{k}=?' for k in vals)} WHERE id=?", (*vals.values(), zid))
        return db.one(c, "SELECT * FROM zones WHERE id=?", (zid,))


def environment(user: dict, cid: int, minutes: int = 30) -> dict:
    from . import simulator
    with db.tx() as c:
        inventory.own_cellar(c, user, cid)
        zones = db.rows(c, "SELECT * FROM zones WHERE cellar_id=? ORDER BY y_from DESC", (cid,))
        out = []
        for z in zones:
            hist = db.rows(c, "SELECT temp, hum, ts FROM sensor_readings WHERE zone_id=? AND ts > ? ORDER BY ts", (z["id"], utc(-minutes * 60)))
            latest = hist[-1] if hist else inventory.latest_reading(c, z["id"])
            stale_after = max(3 * config.SENSOR_INTERVAL, 20)
            online = bool(latest) and latest["ts"] > utc(-stale_after)
            hums = [h["hum"] for h in hist]
            out.append(z | {
                # at most 120 points spread over the whole period (newest kept), so a 24 h chart really covers 24 h
                "latest": latest, "history": hist[::-1][::-(-len(hist) // 120) or 1][::-1], "sensor_online": online,
                "simulated_disconnect": z["id"] in simulator.state.disconnected,
                "simulated_spike": z["id"] in simulator.state.spike,
                "hum_stability": round(statistics.pstdev(hums), 2) if len(hums) > 1 else None,
                "in_range": bool(latest) and z["temp_min"] <= latest["temp"] <= z["temp_max"] and z["hum_min"] <= latest["hum"] <= z["hum_max"],
            })
    return {"cellar_id": cid, "zones": out, "interval_s": config.SENSOR_INTERVAL}


def simulator_control(user: dict, body: dict) -> dict:
    from . import simulator
    zid = int(body.get("zone_id") or 0)
    with db.tx() as c:
        if not db.one(c, "SELECT 1 FROM zones z JOIN cellars c ON c.id=z.cellar_id WHERE z.id=? AND c.user_id=?", (zid, user["id"])):
            raise ApiError(404, "Zone not found")
    action = body.get("action")
    s = simulator.state
    if action == "disconnect": s.disconnected.add(zid)
    elif action == "reconnect": s.disconnected.discard(zid)
    elif action == "spike": s.spike.add(zid)
    elif action == "normal": s.spike.discard(zid)
    else: raise ApiError(400, "action must be disconnect|reconnect|spike|normal")
    return {"zone_id": zid, "disconnected": zid in s.disconnected, "spike": zid in s.spike}


def notifications(user: dict, unread_only: bool = False) -> dict:
    with db.tx() as c:
        q = "SELECT * FROM notifications WHERE user_id=?" + (" AND read=0" if unread_only else "") + " ORDER BY id DESC LIMIT 50"
        items = db.rows(c, q, (user["id"],))
        unread = db.one(c, "SELECT COUNT(*) n FROM notifications WHERE user_id=? AND read=0", (user["id"],))["n"]
    return {"items": items, "unread": unread}


def mark_read(user: dict, nid: int | None) -> dict:
    with db.tx() as c:
        if nid:
            c.execute("UPDATE notifications SET read=1 WHERE id=? AND user_id=?", (nid, user["id"]))
        else:
            c.execute("UPDATE notifications SET read=1 WHERE user_id=?", (user["id"],))
    return {"ok": True}


# =====================================================================
# Recommendations (rule-based part)
# =====================================================================
def _all_bottles(c, uid: int) -> list[dict]:
    return db.rows(c, BOTTLE_SQL + " WHERE b.user_id=? AND b.status='stored' ORDER BY b.cellar_id, b.y DESC, b.x", (uid,))


def drinking_windows(user: dict) -> dict:
    year = date.today().year
    with db.tx() as c:
        bs = [inventory.bottle_out(b) for b in _all_bottles(c, user["id"])]
    ready = sorted([b for b in bs if b["window_status"] == "ready"], key=lambda b: b["wine"]["drink_to"])
    approaching = [b for b in bs if b["window_status"] == "young" and b["wine"]["drink_from"] <= year + 1]
    past = [b for b in bs if b["window_status"] == "past-peak"]
    return {"ready": ready, "approaching": approaching, "past_peak": past, "year": year}


def check_drinking_windows(uid: int) -> None:
    """Called by the simulator loop: notify once a year per bottle."""
    year = date.today().year
    with db.tx() as c:
        for b in _all_bottles(c, uid):
            if b["drink_from"] == year + 1:
                _notify(c, uid, "window", "info",
                        f"Approaching its window next year: {b['producer']} {b['name']} {b['vintage'] or 'NV'} ({_loc(b)})",
                        dedupe_key=f"approach:{b['id']}:{year}", within_minutes=60 * 24 * 365)
            elif b["drink_to"] == year:
                _notify(c, uid, "window", "warning",
                        f"Last peak year: {b['producer']} {b['name']} {b['vintage'] or 'NV'} — drink soon ({_loc(b)})",
                        dedupe_key=f"peakend:{b['id']}:{year}", within_minutes=60 * 24 * 365)


def consumption_profile(c, uid: int) -> dict:
    rs = db.rows(c, "SELECT w.color, w.region, w.grape, w.producer FROM consumption k JOIN wines w ON w.id=k.wine_id WHERE k.user_id=?", (uid,))

    def top(key: str) -> list[tuple[str, int]]:
        counts: dict[str, int] = {}
        for r in rs:
            for part in str(r[key] or "").split(","):
                part = part.strip()
                if part:
                    counts[part] = counts.get(part, 0) + 1
        return sorted(counts.items(), key=lambda x: -x[1])[:3]

    return {"total": len(rs), "colors": top("color"), "regions": top("region"), "grapes": top("grape")}


MEAL_RULES = [
    (r"steak|beef|lamb|bbq|galbi|갈비|소고기|양고기|스테이크|bulgogi|불고기", {"red": 3}, ["Cabernet", "Syrah", "Nebbiolo", "Tempranillo"]),
    (r"pork|duck|mushroom|돼지|오리|버섯|truffle", {"red": 2}, ["Pinot Noir", "Grenache", "Sangiovese"]),
    (r"fish|salmon|tuna|sushi|seafood|oyster|회|초밥|연어|생선|굴|해산물|shrimp|새우", {"white": 3, "sparkling": 2}, ["Chardonnay", "Sauvignon", "Riesling"]),
    (r"spicy|curry|thai|매운|떡볶이|tteok|kimchi|김치", {"white": 2, "rose": 2}, ["Riesling"]),
    (r"chicken|치킨|닭|fried|튀김|tempura", {"sparkling": 3, "white": 2}, ["Chardonnay", "Pinot Noir"]),
    (r"cheese|치즈", {"red": 1, "white": 1}, ["Chardonnay", "Pinot Noir"]),
    (r"dessert|cake|디저트|케이크|chocolate|초콜릿", {"sparkling": 1, "red": 1}, ["Sémillon", "Touriga"]),
    (r"salad|vegetable|샐러드|채소|pasta|파스타|pizza|피자", {"white": 1, "rose": 2, "red": 1}, ["Sangiovese", "Sauvignon"]),
]


def _score_for_meal(b: dict, meal: str) -> float:
    s = 0.0
    for pat, colors, grapes in MEAL_RULES:
        if re.search(pat, meal, re.I):
            s += colors.get(b["color"], 0)
            s += sum(1.5 for g in grapes if g.lower() in (b["grape"] or "").lower())
    year = date.today().year
    if b["drink_from"] <= year <= b["drink_to"]:
        s += 1  # prefer bottles that are ready now
    return s


FLAVOR_RULES = {
    r"light|가벼|fresh|상큼|crisp": {"colors": ["white", "sparkling", "rose"], "grapes": ["Pinot Noir", "Riesling", "Sauvignon"]},
    r"bold|full|진한|묵직|powerful|tannic": {"colors": ["red"], "grapes": ["Cabernet", "Syrah", "Nebbiolo", "Touriga"]},
    r"fruity|과일|soft|부드": {"colors": ["red", "rose"], "grapes": ["Grenache", "Pinot Noir", "Merlot"]},
    r"bubbl|sparkl|celebrat|축하|파티|party|기념": {"colors": ["sparkling"], "grapes": []},
    r"sweet|달콤|dessert": {"colors": ["white"], "grapes": ["Sémillon", "Riesling", "Touriga"]},
}


def _flavor_score(w: dict, text: str) -> float:
    s = 0.0
    for pat, rule in FLAVOR_RULES.items():
        if re.search(pat, text, re.I):
            if w["color"] in rule["colors"]:
                s += 2
            s += sum(1 for g in rule["grapes"] if g.lower() in (w.get("grape") or "").lower())
    return s


# =====================================================================
# AI (LLM) — every function yields SSE event dicts
# =====================================================================
LANG_HINT = "Answer in the same language as the user's request (Korean if the user writes Korean). Be concise."


def _inventory_context(c, uid: int, limit: int = 40) -> str:
    lines = []
    for b in _all_bottles(c, uid)[:limit]:
        p = market.current(b)["price"]
        lines.append(f"- [{b['serial']}] {b['producer']} {b['name']} {b['vintage'] or 'NV'} | {b['color']} | {b['region']}, {b['grape']} | "
                     f"window {b['drink_from']}-{b['drink_to']} | ${p:.0f} | {b['cellar_name']} · {_loc(b)}")
    return "\n".join(lines) or "(empty cellar)"


def _user_context(c, user: dict) -> str:
    prof = consumption_profile(c, user["id"])
    prefs = json.loads(user.get("preferences") or "{}")
    return (f"User preferences: {json.dumps(prefs, ensure_ascii=False)}. "
            f"Consumption history ({prof['total']} bottles): colors {prof['colors']}, regions {prof['regions']}, grapes {prof['grapes']}.")


def _wine_label(b: dict) -> str:
    prod = "" if b["name"].startswith(b["producer"]) else b["producer"] + " "
    return f"{prod}{b['name']} {b['vintage'] or 'NV'}"


def _stream_text(messages: list[dict], fallback: str, adapter: str | None = None, max_tokens: int = 350) -> Iterator[dict]:
    for piece in llm.stream_chat(messages, fallback, adapter=adapter, max_tokens=max_tokens):
        yield {"type": "delta", "text": piece}


def ai_meal_pairing(user: dict, body: dict) -> Iterator[dict]:
    meal = str(body.get("meal") or "").strip()
    if not meal:
        raise ApiError(400, "Describe the meal")
    with db.tx() as c:
        bs = _all_bottles(c, user["id"])
        ctx = _inventory_context(c, user["id"])
    ranked = sorted(bs, key=lambda b: -_score_for_meal(b, meal))[:3]
    yield {"type": "items", "items": [inventory.bottle_out(b) for b in ranked]}
    fb = "Top picks from your cellar for “" + meal + "”: " + "; ".join(
        f"{_wine_label(b)} ({_loc(b)}) — {b['color']} {b['grape']} matches the dish's weight" for b in ranked
    ) + ". Serve reds slightly cool (14–16°C) and whites at 8–10°C."
    msgs = [
        {"role": "system", "content": f"You are a sommelier for a home wine cellar. Recommend ONLY bottles from the inventory, cite their location. {LANG_HINT}"},
        {"role": "user", "content": f"Inventory:\n{ctx}\n\nMeal: {meal}\nRank the best 3 bottles and explain each pairing in one or two sentences."},
    ]
    yield from _stream_text(msgs, fb)
    yield {"type": "done"}


def ai_wine_pairing(user: dict, body: dict) -> Iterator[dict]:
    b = inventory.get_bottle(user, int(body.get("bottle_id") or 0))
    w = b["wine"]
    label = f"{w['producer']} {w['name']} {w['vintage'] or 'NV'}"
    ideas = {
        "red": ("Roast duck with cherry sauce", "Mushroom risotto", "Korean BBQ / steak delivery"),
        "white": ("Butter-poached salmon", "Lemon roast chicken", "Sushi / seafood delivery"),
        "sparkling": ("Tempura and fried chicken", "Oysters", "Fried chicken delivery"),
        "rose": ("Salade niçoise", "Grilled prawns", "Mediterranean / pizza delivery"),
    }[w["color"]]
    fb = (f"For {label}: 1) {ideas[0]} — recipe: sear, rest, finish with a pan sauce built on the wine's acidity. "
          f"2) {ideas[1]} — keep seasoning gentle so the {w['grape']} fruit stays in front. "
          f"Delivery category tonight: {ideas[2]}.")
    msgs = [
        {"role": "system", "content": f"You are a sommelier and chef. {LANG_HINT}"},
        {"role": "user", "content": f"Wine: {label} ({w['color']}, {w['grape']}, {w['region']}). "
                                    "Suggest 2 dishes with a short recipe outline each, and 1 food-delivery menu category."},
    ]
    yield from _stream_text(msgs, fb)
    yield {"type": "done"}


def ai_curate(user: dict, body: dict) -> Iterator[dict]:
    budget = float(body.get("budget") or 0)
    flavor = str(body.get("flavor") or "")
    theme = str(body.get("theme") or "")
    text = f"{flavor} {theme}"
    with db.tx() as c:
        bs = _all_bottles(c, user["id"])
        owned_keys = {(b["name"], b["producer"], b["vintage"]) for b in bs}
    def ok_price(w): return not budget or market.current(w)["price"] <= budget
    owned = sorted([b for b in bs if ok_price(b)], key=lambda b: -_flavor_score(b, text))[:4]
    buy = sorted(
        [w for w in CATALOG if (w["name"], w["producer"], w["vintage"]) not in owned_keys and ok_price(w)],
        key=lambda w: -_flavor_score(w, text),
    )[:3]
    yield {"type": "items", "items": [inventory.bottle_out(b) for b in owned],
           "purchase": [w | {"market": market.current(w)} for w in buy]}
    fb = (f"Curated list (budget {'≤ $' + str(int(budget)) if budget else 'any'}, flavor '{flavor or 'any'}', theme '{theme or 'any'}'): "
          f"from your cellar — {', '.join(_wine_label(b) for b in owned) or 'nothing fits'}; "
          f"worth buying — {', '.join(w['producer'] + ' ' + w['name'] for w in buy) or 'none in budget'}.")
    msgs = [
        {"role": "system", "content": f"You curate wine lists. {LANG_HINT}"},
        {"role": "user", "content": f"Constraints: budget per bottle {budget or 'any'} USD, flavor '{flavor}', event theme '{theme}'.\n"
                                    f"From cellar: {[_wine_label(b) for b in owned]}\nTo buy: {[w['producer'] + ' ' + w['name'] for w in buy]}\n"
                                    "Write a short serving order for the event and why each wine fits."},
    ]
    yield from _stream_text(msgs, fb)
    yield {"type": "done"}


def ai_personal(user: dict, body: dict) -> Iterator[dict]:
    with db.tx() as c:
        prof = consumption_profile(c, user["id"])
        bs = _all_bottles(c, user["id"])
        uctx = _user_context(c, user)
        ctx = _inventory_context(c, user["id"])
    fav_colors = {k for k, _ in prof["colors"]}
    fav_regions = {k for k, _ in prof["regions"]}
    fav_grapes = {k for k, _ in prof["grapes"]}

    def sc(b):
        s = (2 if b["color"] in fav_colors else 0) + (2 if b["region"] in fav_regions else 0)
        s += sum(1 for g in (b["grape"] or "").split(",") if g.strip() in fav_grapes)
        y = date.today().year
        return s + (1.5 if b["drink_from"] <= y <= b["drink_to"] else 0)

    picks = sorted(bs, key=lambda b: -sc(b))[:3]
    yield {"type": "items", "items": [inventory.bottle_out(b) for b in picks], "profile": prof}
    fb = (f"You've opened {prof['total']} bottles, mostly {', '.join(k for k, _ in prof['colors']) or '—'} from "
          f"{', '.join(k for k, _ in prof['regions']) or '—'}. Tonight's picks: " + "; ".join(_wine_label(b) for b in picks) + ".")
    msgs = [
        {"role": "system", "content": f"You are a personal sommelier. Use the user's drinking history. {LANG_HINT}"},
        {"role": "user", "content": f"{uctx}\nInventory:\n{ctx}\nRecommend 3 bottles for this week and explain the link to their history."},
    ]
    yield from _stream_text(msgs, fb)
    yield {"type": "done"}


def ai_ask(user: dict, body: dict) -> Iterator[dict]:
    q = str(body.get("query") or "").strip()
    if not q:
        raise ApiError(400, "Ask something")
    with db.tx() as c:
        ctx = _inventory_context(c, user["id"])
        uctx = _user_context(c, user)
    fb = (f"(offline answer) For “{q}”, start with a bottle that is inside its drinking window — "
          "check the Ready-to-drink list. Set LLM_PROVIDER=hf and HF_TOKEN in backend/.env for real AI answers.")
    msgs = [
        {"role": "system", "content": f"You are the AI sommelier inside a smart wine cellar. Prefer bottles from the inventory and cite location; "
                                      f"if suggesting purchases, say so. {LANG_HINT}"},
        {"role": "user", "content": f"{uctx}\nInventory:\n{ctx}\n\nQuestion: {q}"},
    ]
    yield from _stream_text(msgs, fb, max_tokens=450)
    yield {"type": "done"}


def load_personas() -> list[dict]:
    return json.loads(config.PERSONAS_PATH.read_text(encoding="utf-8"))


def _mock_turn(p: dict, w: dict, i: int) -> str:
    year = date.today().year
    v = w["vintage"] or "NV"
    if p["id"] == "power-critic":
        style = {"red": "dense, layered", "white": "rich, textured", "sparkling": "vinous, powerful",
                 "rose": "bright but lightweight"}[w["color"]]
        score = "88–90" if w["color"] == "rose" else "93–95"
        return (f"{w['producer']} {w['name']} {v}: {style} {w['grape']}. "
                f"I'd put it at {score} points; drink by {w['drink_to']}.")
    if p["id"] == "fruit-purist":
        return (f"I disagree on the emphasis — what matters is fruit quality versus structure. "
                f"The fruit here is ripe and clean; at {year - (w['vintage'] or year)} years it is "
                f"{'already giving pleasure' if w['drink_from'] <= year else 'still a little tight'}.")
    return (f"Balance first: the acidity carries it. On my 20-point scale, 17.5. "
            f"Best window {w['drink_from']}–{w['drink_to']}; serve with food rather than alone.")


def ai_dialogue(user: dict, body: dict) -> Iterator[dict]:
    """Multi-agent critic debate. Each persona sees prior turns.
    With LLM_PROVIDER=vllm the persona's LoRA adapter is requested per turn."""
    b = inventory.get_bottle(user, int(body.get("bottle_id") or 0))
    w = b["wine"]
    personas = load_personas()
    with db.tx() as c:
        uctx = _user_context(c, user)
    label = f"{w['producer']} {w['name']} {w['vintage'] or 'NV'} ({w['region']}, {w['grape']}, {w['color']})"
    transcript: list[str] = []
    yield {"type": "meta", "bottle": b, "personas": personas, "provider": llm.provider_info()}
    for i, p in enumerate(personas):
        yield {"type": "turn", "persona": p["id"], "name": p["name"], "title": p["title"], "color": p["color"],
               "adapter": p.get("lora_adapter")}
        msgs = [
            {"role": "system", "content": f"You are {p['name']}, a fictional wine critic ({p['title']}). Philosophy: {p['philosophy']} "
                                          f"Stay in character. 2-3 sentences. Give tasting notes and an aging prediction. "
                                          f"React to the previous critics if any. {LANG_HINT}"},
            {"role": "user", "content": f"Wine on the table: {label}. Owner context: {uctx}\n"
                                        f"Debate so far:\n" + ("\n".join(transcript) or "(you speak first)")},
        ]
        text = ""
        for ev in _stream_text(msgs, _mock_turn(p, w, i), adapter=p.get("lora_adapter"), max_tokens=180):
            text += ev["text"]
            yield ev | {"persona": p["id"]}
        transcript.append(f"{p['name']}: {text.strip()}")
        yield {"type": "turn_end", "persona": p["id"]}
    yield {"type": "done"}


# =====================================================================
# Daily briefing & market
# =====================================================================
def briefing(user: dict) -> dict:
    items, sample = news.get_news()
    with db.tx() as c:
        bs = _all_bottles(c, user["id"])
        zones = db.rows(c, "SELECT z.* FROM zones z JOIN cellars c ON c.id=z.cellar_id WHERE c.user_id=?", (user["id"],))
        hum_std = {}
        for z in zones:
            hs = [r["hum"] for r in db.rows(c, "SELECT hum FROM sensor_readings WHERE zone_id=? AND ts > ?", (z["id"], utc(-86400)))]
            hum_std[z["name"]] = round(statistics.pstdev(hs), 2) if len(hs) > 1 else None
    keywords: dict[str, int] = {}
    for b in bs:
        for k in [b["region"], b["country"], b["producer"], *str(b["grape"] or "").split(",")]:
            k = (k or "").strip()
            if len(k) > 2:
                keywords[k] = keywords.get(k, 0) + 1

    def rel(it):
        text = f"{it['title']} {it['summary']}".lower()
        hits = [k for k in keywords if k.lower() in text]
        return hits

    scored = []
    for it in items:
        hits = rel(it)
        scored.append(it | {"relevance": len(hits), "matched": hits[:4]})
    scored.sort(key=lambda x: -x["relevance"])
    win = drinking_windows(user)
    insights = []
    for b in win["ready"][:3]:
        w = b["wine"]
        insights.append(f"At peak now: {w['producer']} {w['name']} {w['vintage'] or 'NV'} ({b['location']})")
    for b in win["approaching"][:2]:
        w = b["wine"]
        insights.append(f"Opens next year: {w['producer']} {w['name']} {w['vintage'] or 'NV'}")
    for name, sd in hum_std.items():
        if sd is not None:
            insights.append(f"Humidity {name}: {'stable' if sd < 2 else 'fluctuating'} (σ {sd}% over 24h)")
    val = market_summary(user)
    insights.append(f"Collection value ${val['total']:,.0f} ({val['change_12m']:+.1f}% 12m, {val['source']})")
    summary = f"{len(win['ready'])} bottles at peak, {len(win['approaching'])} approaching. Top story: {scored[0]['title'] if scored else '—'}"
    return {"date": date.today().isoformat(), "news": scored[:8], "news_is_sample": sample,
            "insights": insights, "summary": summary, "briefing_time": user["briefing_time"]}


def market_summary(user: dict) -> dict:
    with db.tx() as c:
        bs = _all_bottles(c, user["id"])
    rows_ = []
    total = total_then = 0.0
    for b in bs:
        h = market.history(b, 12)
        now, then = h[-1]["price"], h[0]["price"]
        total += now; total_then += then
        rows_.append({"bottle_id": b["id"], "label": _wine_label(b), "price": now,
                      "change_12m": round((now - then) / then * 100, 1) if then else 0, "cellar": b["cellar_name"]})
    rows_.sort(key=lambda r: -r["price"])
    # aggregated monthly history of the whole collection
    agg: dict[str, float] = {}
    for b in bs:
        for p in market.history(b, 24):
            agg[p["date"]] = agg.get(p["date"], 0) + p["price"]
    return {
        "total": round(total, 2), "change_12m": round((total - total_then) / total_then * 100, 1) if total_then else 0,
        "count": len(bs), "bottles": rows_, "history": [{"date": k, "value": round(v, 2)} for k, v in sorted(agg.items())],
        "currency": "USD", "source": "wine-searcher" if config.WINE_SEARCHER_API_KEY else "simulated",
    }


def bottle_price_history(user: dict, bid: int) -> dict:
    b = inventory.get_bottle(user, bid)
    w = b["wine"]
    return {"bottle_id": bid, "history": market.history(w, 24), "source": b["market"]["source"]}


