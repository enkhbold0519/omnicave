"""Tasting table (Android companion's Sommelier model): 2–5 sommeliers discuss a wine or a question.

One request = one round: every sommelier at the table speaks once (or only the @mentioned one), seeing the
conversation so far. The client keeps the conversation and sends it back; the server keeps the sommeliers
(built-in ones from personas.json, plus the user's own) and what each has learned about the user.

Wine topics: each turn ends with "Score: <score on its own scale>. Peak: <year>." so clients can build the verdict.
Question topics: each sommelier picks one bottle from the cellar and names it as #<bottle id>; the server
resolves it and sends a `pick` event.
"""
from __future__ import annotations

import json
import re
import zlib
from datetime import date
from typing import Iterator

from . import db, inventory, llm
from .common import ApiError


SCALES = {"hundred": "100 points", "twenty": "20 points", "stars": "5 stars"}
FOCUS = {"old-world": "Old World", "new-world": "New World", "everywhere": "everywhere"}
LOVES = {"power": "power", "elegance": "elegance", "acidity": "freshness", "oak": "oak", "fruit": "ripe fruit",
         "age": "bottle age", "value": "value", "terroir": "terroir"}
TONES = {"formal": "formal", "warm": "warm", "playful": "playful", "blunt": "blunt"}
STRICT = {1: "generous", 2: "kind", 3: "balanced", 4: "exacting", 5: "severe"}
COLORS = ["#7A3340", "#2F5D50", "#3E4F7A", "#7A5A2B", "#5B3F6E", "#2E6070", "#6B4A3A", "#4A4F55"]
MAX_TABLE = 5
LANG_HINT = "Answer in the same language as the owner (Korean if they write Korean)."


# ---------------------------------------------------------------- personas
def _builtins() -> list[dict]:
    from .services import load_personas
    return [p | {"built_in": True} for p in load_personas()]


def _clean_traits(t: dict) -> dict:
    loves = [x for x in (t.get("loves") or []) if x in LOVES][:3] or ["elegance"]
    try:
        strict = min(5, max(1, int(t.get("strictness") or 3)))
    except (TypeError, ValueError):
        strict = 3
    return {
        "scoring": t.get("scoring") if t.get("scoring") in SCALES else "hundred",
        "focus": t.get("focus") if t.get("focus") in FOCUS else "everywhere",
        "loves": loves,
        "strictness": strict,
        "tone": t.get("tone") if t.get("tone") in TONES else "warm",
        "description": str(t.get("description") or "")[:400],
    }


def _philosophy(p: dict) -> str:
    if p.get("philosophy") and p.get("built_in"):
        return p["philosophy"]
    t = p["traits"]
    s = (f"Scores on a {SCALES[t['scoring']]} scale. Looks mostly at {FOCUS[t['focus']]} wines. "
         f"Values {', '.join(LOVES[x] for x in t['loves'])}. Is {STRICT[t['strictness']]} when judging. Speaks in a {t['tone']} tone.")
    return s + (f" {t['description']}" if t["description"] else "")


def _memory(c, uid: int) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for r in db.rows(c, "SELECT persona_id, text FROM persona_memory WHERE user_id=? ORDER BY id DESC", (uid,)):
        out.setdefault(r["persona_id"], []).append(r["text"])
    return out


def list_personas(user: dict) -> list[dict]:
    with db.tx() as c:
        mem = _memory(c, user["id"])
        own = db.rows(c, "SELECT id, data FROM user_personas WHERE user_id=? ORDER BY id", (user["id"],))
    res = [p | {"memory": mem.get(p["id"], [])} for p in _builtins()]
    for r in own:
        d = json.loads(r["data"])
        pid = f"u{r['id']}"
        res.append(d | {"id": pid, "built_in": False, "memory": mem.get(pid, []), "philosophy": _philosophy(d | {"built_in": False})})
    return res


def _persona_body(body: dict) -> dict:
    name = str(body.get("name") or "").strip()[:40]
    if not name:
        raise ApiError(400, "Give the sommelier a name")
    color = body.get("color") if body.get("color") in COLORS else COLORS[0]
    return {"name": name, "title": str(body.get("title") or "").strip()[:60] or "Sommelier", "color": color,
            "traits": _clean_traits(body.get("traits") or {})}


def create_persona(user: dict, body: dict) -> dict:
    d = _persona_body(body)
    with db.tx() as c:
        cur = c.execute("INSERT INTO user_personas (user_id, data) VALUES (?, ?)", (user["id"], db.dumps(d)))
        pid = cur.lastrowid
    return d | {"id": f"u{pid}", "built_in": False, "memory": [], "philosophy": _philosophy(d)}


def _own_id(pid: str) -> int:
    if not re.fullmatch(r"u\d+", pid or ""):
        raise ApiError(403, "Built-in sommeliers can't be changed")
    return int(pid[1:])


def update_persona(user: dict, pid: str, body: dict) -> dict:
    d = _persona_body(body)
    with db.tx() as c:
        n = c.execute("UPDATE user_personas SET data=? WHERE id=? AND user_id=?", (db.dumps(d), _own_id(pid), user["id"])).rowcount
        mem = _memory(c, user["id"]).get(pid, [])
    if not n:
        raise ApiError(404, "Sommelier not found")
    return d | {"id": pid, "built_in": False, "memory": mem, "philosophy": _philosophy(d)}


def delete_persona(user: dict, pid: str) -> dict:
    with db.tx() as c:
        n = c.execute("DELETE FROM user_personas WHERE id=? AND user_id=?", (_own_id(pid), user["id"])).rowcount
        c.execute("DELETE FROM persona_memory WHERE user_id=? AND persona_id=?", (user["id"], pid))
    if not n:
        raise ApiError(404, "Sommelier not found")
    return {"ok": True}


def clear_memory(user: dict, pid: str) -> dict:
    with db.tx() as c:
        c.execute("DELETE FROM persona_memory WHERE user_id=? AND persona_id=?", (user["id"], pid))
    return {"ok": True}


PREF_RE = re.compile(r"\bI\s+(?:really\s+|do\s+)?(love|like|prefer|enjoy|adore|hate|dislike|avoid|don'?t like|do not like|can'?t stand)\s+"
                     r"(.{2,60}?)(?=\s+(?:and|but)\s+I\b|[.!?\n,;]|$)", re.I)


def _remember(c, uid: int, persona_ids: list[str], text: str) -> None:
    """Stated preferences ("I love Riesling") are remembered by every sommelier who heard them."""
    for verb, what in PREF_RE.findall(text or ""):
        neg = verb.lower().replace("'", "") in ("hate", "dislike", "avoid", "dont like", "do not like", "cant stand")
        note = f"{'Avoids' if neg else 'Likes'} {what.strip()}"
        for pid in persona_ids:
            if not db.one(c, "SELECT 1 FROM persona_memory WHERE user_id=? AND persona_id=? AND text=?", (uid, pid, note)):
                c.execute("INSERT INTO persona_memory (user_id, persona_id, text) VALUES (?, ?, ?)", (uid, pid, note))


# ---------------------------------------------------------------- the table
def _label(b: dict) -> str:
    prod = "" if b["name"].startswith(b["producer"]) else b["producer"] + " "
    return f"{prod}{b['name']} {b['vintage'] or 'NV'}"


def _traits(p: dict) -> dict:
    return p.get("traits") or {"scoring": "hundred", "focus": "everywhere", "loves": ["elegance"], "strictness": 3, "tone": "warm", "description": ""}


def _seed(*parts) -> int:
    return zlib.crc32("|".join(map(str, parts)).encode())


def _score(p: dict, w: dict) -> tuple[str, int]:
    """Mock score on the persona's own scale, plus the 0–100 value it came from."""
    t = _traits(p)
    year = date.today().year
    n = 89 + (2 if w["drink_from"] <= year <= w["drink_to"] else 0) - (t["strictness"] - 3) * 1.5
    if "power" in t["loves"] and w["color"] == "red": n += 2
    if ("elegance" in t["loves"] or "acidity" in t["loves"]) and w["color"] in ("white", "sparkling"): n += 2
    if "fruit" in t["loves"] and w["color"] in ("rose", "red"): n += 1
    if "age" in t["loves"] and w["vintage"] and year - w["vintage"] >= 10: n += 2
    n = int(max(80, min(98, round(n + _seed(p["id"], w["name"]) % 3 - 1))))
    if t["scoring"] == "twenty":
        return f"{round(n / 5 * 2) / 2:.1f}/20", n
    if t["scoring"] == "stars":
        k = max(1, min(5, round((n - 75) / 4.5)))
        return "★" * k + "☆" * (5 - k), n
    return str(n), n


def _peak(p: dict, w: dict) -> int:
    t = _traits(p)
    span = max(1, w["drink_to"] - w["drink_from"])
    frac = 0.5 + (0.2 if "power" in t["loves"] or "age" in t["loves"] else 0) - (0.2 if "fruit" in t["loves"] else 0)
    return int(w["drink_from"] + span * frac)


NOTES = {"red": ["dark cherry", "cassis", "firm tannin", "earthy spice", "cedar"],
         "white": ["citrus", "white flowers", "bright acidity", "mineral", "toasted oak"],
         "sparkling": ["brioche", "green apple", "fine mousse", "chalky mineral", "fresh acidity"],
         "rose": ["wild strawberry", "peach", "crisp acidity", "herbal lift", "saline"]}
OPEN = {"formal": "", "warm": "Lovely to taste this. ", "playful": "Now we're talking! ", "blunt": ""}


def _mock_wine(p: dict, w: dict, last_user: str, turn: int) -> str:
    t = _traits(p)
    score, _ = _score(p, w)
    peak = _peak(p, w)
    notes = NOTES.get(w["color"], NOTES["red"])
    a, b = notes[(turn * 2 + _seed(p["id"]) % 3) % 5], notes[(turn * 2 + 1 + _seed(p["id"]) % 3) % 5]
    q = last_user.lower()
    if "simpl" in q:
        body = f"Simply put: it tastes of {a}, and it will be at its best around {peak}."
    elif "eat" in q or "food" in q or "pair" in q:
        dish = {"red": "roast lamb or a mushroom risotto", "white": "butter-poached fish or roast chicken",
                "sparkling": "oysters or anything fried", "rose": "grilled prawns or a niçoise salad"}[w["color"]]
        body = f"With food, I'd serve it alongside {dish}; the {a} needs something to lean on."
    elif "open" in q or "when" in q:
        body = f"Open it around {peak}. Before that the {b} still dominates; after {w['drink_to']} it starts to fade."
    elif "right" in q:
        body = f"We're all partly right, but I stand by my view: {', '.join(LOVES[x] for x in t['loves'])} is what this wine is about."
    elif turn == 0:
        body = f"{_label(w)}: {a} and {b}. " + {
            "power": "Concentrated and built to last.", "elegance": "Poised rather than heavy.",
            "acidity": "The freshness keeps it lively.", "fruit": "The fruit is ripe and generous.",
            "oak": "The oak is well judged.", "age": "It will reward patience.",
            "value": "Good wine for the money.", "terroir": "It tastes of its place."}[t["loves"][0]]
    else:
        body = f"On reflection, the {b} is what stays with me. I'd still keep my score."
    return f"{OPEN[t['tone']]}{body}\nScore: {score}. Peak: {peak}."


SWEET = re.compile(r"Sauternes|Barsac|Tokaj|Port\b|Eiswein|Ice ?wine|Late Harvest|Vin Santo|Moscato|Beerenauslese", re.I)


def _pick(p: dict, bottles: list[dict], intent: str, text: str, taken: set[int]) -> dict | None:
    from .services import _flavor_score, _score_for_meal
    t = _traits(p)
    year = date.today().year

    def score(b: dict) -> float:
        s = 0.0
        if intent == "pairing":
            s += _score_for_meal(b, text) * 2
        elif intent == "open":
            s += _flavor_score(b, text) * 2
        if b["drink_from"] <= year <= b["drink_to"]:
            s += 2 + (1.5 if b["drink_to"] <= year + 1 else 0)   # tonight: drink what is at its peak and won't wait
        s += 1.5 if ("power" in t["loves"] and b["color"] == "red") else 0
        s += 1.5 if ("acidity" in t["loves"] or "elegance" in t["loves"]) and b["color"] in ("white", "sparkling") else 0
        s += 1 if "fruit" in t["loves"] and b["color"] in ("rose", "red") else 0
        s -= 1 if b["id"] in taken else 0   # agreeing is fine, but prefer a different bottle when it is close
        if SWEET.search(f"{b['name']} {b['region']}") and not re.search(r"dessert|sweet|cheese|blue|foie", text, re.I):
            s -= 4                            # don't send a dessert wine to the dinner table
        return s + (_seed(p["id"], b["id"]) % 100) / 1000
    return max(bottles, key=score) if bottles else None


def _mock_question(p: dict, b: dict | None, intent: str, text: str, last_user: str) -> str:
    t = _traits(p)
    if not b:
        return "Your cellar is empty — add a few bottles and ask me again."
    why = {"tonight": f"it is right in its window ({b['drink_from']}–{b['drink_to']})",
           "pairing": f"its {b['color']} {b['grape'] or 'style'} suits {text or 'the dish'}",
           "open": f"it fits what you asked: {b['region']}, {b['grape']}"}[intent]
    q = last_user.lower()
    if "why" in q:
        why = f"{why}, and {', '.join(LOVES[x] for x in t['loves'])} is what I look for"
    elif "light" in q:
        why = "it is the lighter choice — " + why
    elif "value" in q:
        why = "it gives the most pleasure for its price — " + why
    return f"{OPEN[t['tone']]}I'd open #{b['id']} — {_label(b)} — because {why}."


def ai_table(user: dict, body: dict) -> Iterator[dict]:
    topic = body.get("topic") or {}
    kind = topic.get("kind")
    if kind not in ("wine", "question"):
        raise ApiError(400, "Choose a wine or ask a question")
    personas = {p["id"]: p for p in list_personas(user)}
    ids = [i for i in (body.get("persona_ids") or [p["id"] for p in _builtins()]) if i in personas][:MAX_TABLE]
    if not ids:
        raise ApiError(400, "Seat at least one sommelier")
    mention = body.get("mention")
    speakers = [mention] if mention in ids else ids
    history = [h for h in (body.get("history") or []) if isinstance(h, dict) and h.get("text")][-30:]
    last_user = next((str(h["text"]) for h in reversed(history) if h.get("speaker") == "user"), "")
    intent = topic.get("intent") if topic.get("intent") in ("tonight", "pairing", "open") else "open"
    text = str(topic.get("text") or "")[:300]

    with db.tx() as c:
        if history and history[-1].get("speaker") == "user":
            _remember(c, user["id"], ids, last_user)
        mem = _memory(c, user["id"])
        from .services import _user_context, _all_bottles
        uctx = _user_context(c, user)
        bottles = _all_bottles(c, user["id"]) if kind == "question" else []
    if kind == "wine":
        w = inventory.get_bottle(user, int(topic.get("bottle_id") or 0))["wine"]
        subject = f"The wine on the table: {_label(w)} ({w['region']}, {w['grape']}, {w['color']}, drinking window {w['drink_from']}–{w['drink_to']})."
        rule = "End with exactly one line: 'Score: <your score on your own scale>. Peak: <year>.'"
    else:
        lines = [f"#{b['id']} {_label(b)} | {b['color']} | {b['region']}, {b['grape']} | window {b['drink_from']}-{b['drink_to']}" for b in bottles[:40]]
        ask = {"tonight": "What should the owner open tonight?", "pairing": f"The owner is eating: {text}. Which bottle?",
               "open": f"The owner asks: {text}"}[intent]
        subject = f"{ask}\nThe owner's cellar:\n" + ("\n".join(lines) or "(empty)")
        rule = "Recommend exactly ONE bottle from the cellar and write its number as #<number>."

    names = {pid: personas[pid]["name"] for pid in ids}
    convo = "\n".join(f"{'Owner' if h.get('speaker') == 'user' else names.get(h.get('speaker'), 'Sommelier')}: {str(h['text'])[:600]}" for h in history)
    yield {"type": "meta", "provider": llm.provider_info()}
    taken: set[int] = set()
    for pid in speakers:
        p = personas[pid]
        turn = sum(1 for h in history if h.get("speaker") == pid)
        yield {"type": "turn", "persona": pid, "name": p["name"], "title": p["title"], "color": p["color"], "adapter": p.get("lora_adapter")}
        known = "; ".join(mem.get(pid, [])[:8])
        msgs = [
            {"role": "system", "content": f"You are {p['name']}, a fictional sommelier ({p['title']}). {_philosophy(p)} "
                                          f"{'What you know about the owner: ' + known + '. ' if known else ''}"
                                          f"Stay in character. 2-3 short sentences. React to the others or answer the owner if they spoke last. {rule} {LANG_HINT}"},
            {"role": "user", "content": f"{subject}\nOwner context: {uctx}\nConversation so far:\n{convo or '(you speak first)'}"},
        ]
        pick = _pick(p, bottles, intent, text, taken) if kind == "question" else None
        fallback = _mock_wine(p, w, last_user, turn) if kind == "wine" else _mock_question(p, pick, intent, text, last_user)
        out = ""
        for piece in llm.stream_chat(msgs, fallback, adapter=p.get("lora_adapter"), max_tokens=200):
            out += piece
            yield {"type": "delta", "text": piece, "persona": pid}
        if kind == "question":
            by_id = {b["id"]: b for b in bottles}
            ref = next((int(m) for m in re.findall(r"#(\d+)", out) if int(m) in by_id), None)
            if ref is not None:
                taken.add(ref)
                yield {"type": "pick", "persona": pid, "bottle": inventory.bottle_out(by_id[ref])}
        convo += f"\n{p['name']}: {out.strip()}"
        yield {"type": "turn_end", "persona": pid}
    yield {"type": "done"}
