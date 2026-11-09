"""Cellars, racks, zones and bottles with free 3D placement."""
from __future__ import annotations

import random
import secrets
from datetime import date

from . import db, geometry as geo, market
from .catalog import CATALOG
from .common import ApiError, notify, utc

WINE_FIELDS = ("name", "producer", "region", "country", "grape", "color", "vintage", "drink_from", "drink_to", "base_price")
COLORS = ("red", "white", "sparkling", "rose")

# Generic cabinet presets (not vendor specs). Racks are evenly spaced; all can be pulled out.
PRESETS = {
    "tall":    {"label": "Tall dual-zone (78×160×55 cm, 8 racks)", "width_cm": 78, "height_cm": 160, "depth_cm": 55, "racks": 8, "capacity": 10},
    "compact": {"label": "Compact (60×85×50 cm, 4 racks)", "width_cm": 60, "height_cm": 85, "depth_cm": 50, "racks": 4, "capacity": 7},
    "under":   {"label": "Under-counter (60×82×57 cm, 5 racks)", "width_cm": 60, "height_cm": 82, "depth_cm": 57, "racks": 5, "capacity": 7},
}

BOTTLE_SQL = """SELECT b.*, w.name, w.producer, w.region, w.country, w.grape, w.color, w.vintage,
                       w.drink_from, w.drink_to, w.base_price, c.name AS cellar_name, r.name AS rack_name, r.depth_cm AS rack_depth
                FROM bottles b JOIN wines w ON w.id=b.wine_id JOIN cellars c ON c.id=b.cellar_id
                LEFT JOIN racks r ON r.id=b.rack_id"""


# ---------------------------------------------------------------- cellars
def create_cellar_row(c, uid: int, name: str, preset: str = "tall", model: str | None = None,
                      dims: dict | None = None, racks: int | None = None, capacity: int | None = None) -> int:
    p = dict(PRESETS.get(preset) or PRESETS["tall"])
    if dims:
        for k in ("width_cm", "height_cm", "depth_cm"):
            if dims.get(k):
                p[k] = float(dims[k])
    if not (30 <= p["width_cm"] <= 200 and 40 <= p["height_cm"] <= 250 and 30 <= p["depth_cm"] <= 100):
        raise ApiError(400, "Cellar size out of range (W 30-200, H 40-250, D 30-100 cm)")
    n = int(racks or p["racks"])
    cap = int(capacity or p["capacity"])
    cid = c.execute(
        "INSERT INTO cellars(user_id,name,model,width_cm,height_cm,depth_cm) VALUES(?,?,?,?,?,?)",
        (uid, name[:40], model or p.get("label"), p["width_cm"], p["height_cm"], p["depth_cm"]),
    ).lastrowid
    c.execute("INSERT INTO racks(cellar_id,name,kind,y_cm,depth_cm,capacity,present) VALUES(?,?,?,?,?,?,1)",
              (cid, "Floor", "floor", 0.0, p["depth_cm"] - 4, cap))
    step = (p["height_cm"] - 12) / (n + 0.5)
    for i in range(n):
        c.execute("INSERT INTO racks(cellar_id,name,kind,y_cm,depth_cm,capacity,present) VALUES(?,?,?,?,?,?,1)",
                  (cid, f"Rack {n - i}", "shelf", round(step * (i + 1), 1), p["depth_cm"] - 6, cap))
    split = round(p["height_cm"] * 0.55, 1)
    zone_sql = "INSERT INTO zones(cellar_id,name,y_from,y_to,target_temp,target_hum,temp_min,temp_max,hum_min,hum_max) VALUES(?,?,?,?,?,?,?,?,?,?)"
    c.execute(zone_sql, (cid, "Upper · Sparkling & White", split, p["height_cm"], 8.0, 70.0, 6.0, 11.0, 55.0, 80.0))
    c.execute(zone_sql, (cid, "Lower · Red", 0.0, split, 14.0, 68.0, 12.0, 17.0, 55.0, 80.0))
    return cid


def list_cellars(user: dict) -> list[dict]:
    with db.tx() as c:
        cel = db.rows(c, """SELECT c.*, (SELECT COUNT(*) FROM bottles b WHERE b.cellar_id=c.id AND b.status='stored') AS bottle_count
                            FROM cellars c WHERE c.user_id=? ORDER BY c.id""", (user["id"],))
        devs = db.rows(c, "SELECT id, uid, name, kind, cellar_id, last_seen FROM devices WHERE user_id=?", (user["id"],))
    for x in cel:
        ds = [d for d in devs if d["cellar_id"] == x["id"]]
        x["devices"] = [d | {"online": bool(d["last_seen"]) and d["last_seen"] > utc(-60)} for d in ds]
    return cel


def create_cellar(user: dict, body: dict) -> dict:
    with db.tx() as c:
        cid = create_cellar_row(c, user["id"], str(body.get("name") or "New Cellar"), body.get("preset", "tall"),
                                dims=body, racks=body.get("racks"), capacity=body.get("capacity"))
    return get_cellar(user, cid)


def update_cellar(user: dict, cid: int, body: dict) -> dict:
    with db.tx() as c:
        own_cellar(c, user, cid)
        if "name" in body:
            c.execute("UPDATE cellars SET name=? WHERE id=?", (str(body["name"])[:40], cid))
    return get_cellar(user, cid)


def delete_cellar(user: dict, cid: int) -> dict:
    with db.tx() as c:
        own_cellar(c, user, cid)
        if db.one(c, "SELECT COUNT(*) n FROM cellars WHERE user_id=?", (user["id"],))["n"] <= 1:
            raise ApiError(400, "You need at least one cellar")
        c.execute("DELETE FROM cellars WHERE id=?", (cid,))
    return {"deleted": cid}


def own_cellar(c, user: dict, cid: int) -> dict:
    cel = db.one(c, "SELECT * FROM cellars WHERE id=? AND user_id=?", (cid, user["id"]))
    if not cel:
        raise ApiError(404, "Cellar not found")
    return cel


def racks_of(c, cid: int) -> list[dict]:
    return db.rows(c, "SELECT * FROM racks WHERE cellar_id=? ORDER BY y_cm", (cid,))


def zone_for_y(zones: list[dict], y: float) -> dict | None:
    return next((z for z in zones if z["y_from"] <= y <= z["y_to"]), None)


def latest_reading(c, zone_id: int) -> dict | None:
    return db.one(c, "SELECT temp, hum, ts FROM sensor_readings WHERE zone_id=? ORDER BY ts DESC, id DESC LIMIT 1", (zone_id,))


def window_status(b: dict) -> str:
    year = date.today().year
    if b["drink_from"] and year < b["drink_from"]:
        return "young"
    if b["drink_to"] and year > b["drink_to"]:
        return "past-peak"
    return "ready"


def bottle_out(b: dict, zones: list[dict] | None = None, latest: dict | None = None) -> dict:
    depth = b.get("rack_depth") or 50
    out = {
        "id": b["id"], "serial": b["serial"], "cellar_id": b["cellar_id"], "cellar_name": b.get("cellar_name"),
        "x": b["x"], "y": b["y"], "z": b["z"], "orientation": b["orientation"], "level": b["level"],
        "rack_id": b["rack_id"], "rack_name": b.get("rack_name"), "layer": geo.layer(b["z"], depth),
        "location": geo.location_text(b, b.get("rack_name")),
        "source": b["source"], "confidence": b["confidence"], "added_at": b["added_at"], "status": b["status"],
        "wine": {k: b[k] for k in WINE_FIELDS} | {"id": b["wine_id"]},
        "window_status": window_status(b),
        "market": market.current(b),
    }
    if zones is not None:
        z = zone_for_y(zones, b["y"])
        out["zone"] = {"id": z["id"], "name": z["name"], "latest": (latest or {}).get(z["id"])} if z else None
    return out


def stored_bottles(c, cid: int) -> list[dict]:
    return db.rows(c, BOTTLE_SQL + " WHERE b.cellar_id=? AND b.status='stored' ORDER BY b.y DESC, b.x", (cid,))


def get_cellar(user: dict, cid: int) -> dict:
    with db.tx() as c:
        cel = own_cellar(c, user, cid)
        racks = racks_of(c, cid)
        zones = db.rows(c, "SELECT * FROM zones WHERE cellar_id=? ORDER BY y_from DESC", (cid,))
        latest = {z["id"]: latest_reading(c, z["id"]) for z in zones}
        bottles = stored_bottles(c, cid)
        devices = db.rows(c, "SELECT id, uid, name, kind, last_seen, last_scan, last_telemetry FROM devices WHERE cellar_id=?", (cid,))
        out_with_rack = db.one(c, "SELECT COUNT(*) n FROM bottles WHERE cellar_id=? AND status='with_rack'", (cid,))["n"]
    return {
        **cel,
        "racks": [r | geo.rack_stats(r, bottles) for r in racks],
        "zones": [z | {"latest": latest[z["id"]]} for z in zones],
        "bottles": [bottle_out(b, zones, latest) for b in bottles],
        "devices": [d | {"online": bool(d["last_seen"]) and d["last_seen"] > utc(-60)} for d in devices],
        "bottles_out_with_racks": out_with_rack,
        "geometry": {"bottle_d": geo.D, "bottle_l": geo.L, "stack_step": geo.STACK_STEP},
    }


# ---------------------------------------------------------------- racks
def _resnap_rack(c, cel: dict, rack: dict) -> None:
    for b in db.rows(c, "SELECT * FROM bottles WHERE rack_id=? AND status='stored'", (rack["id"],)):
        c.execute("UPDATE bottles SET y=? WHERE id=?", (round(rack["y_cm"] + geo.R + b["level"] * geo.STACK_STEP, 1), b["id"]))


def add_rack(user: dict, cid: int, body: dict) -> dict:
    with db.tx() as c:
        cel = own_cellar(c, user, cid)
        y = float(body.get("y_cm", cel["height_cm"] / 2))
        if not (5 <= y <= cel["height_cm"] - 10):
            raise ApiError(400, f"Rack height must be 5-{cel['height_cm'] - 10:.0f} cm")
        c.execute("INSERT INTO racks(cellar_id,name,kind,y_cm,depth_cm,capacity,present) VALUES(?,?,?,?,?,?,1)",
                  (cid, str(body.get("name") or f"Rack @{y:.0f}cm")[:30], "shelf", y, cel["depth_cm"] - 6, int(body.get("capacity", 10))))
        _reassign_all(c, cel)
    return get_cellar(user, cid)


def update_rack(user: dict, rid: int, body: dict) -> dict:
    """Rename / move / change nominal capacity / pull out or put back a rack.

    Pulling out a rack that holds bottles needs `bottles`:
      "with_rack" -> bottles leave the cellar with the rack (serving / display) and come back when it's reinserted
      "relocate"  -> the bottles were taken off first; they are re-snapped onto the next support below
    """
    with db.tx() as c:
        r = db.one(c, "SELECT r.* FROM racks r JOIN cellars c ON c.id=r.cellar_id WHERE r.id=? AND c.user_id=?", (rid, user["id"]))
        if not r:
            raise ApiError(404, "Rack not found")
        cel = db.one(c, "SELECT * FROM cellars WHERE id=?", (r["cellar_id"],))
        if r["kind"] == "floor" and ("present" in body or "y_cm" in body):
            raise ApiError(400, "The floor can't be moved or removed")
        if "name" in body:
            c.execute("UPDATE racks SET name=? WHERE id=?", (str(body["name"])[:30], rid))
        if "capacity" in body:
            c.execute("UPDATE racks SET capacity=? WHERE id=?", (max(1, int(body["capacity"])), rid))
        if "y_cm" in body:
            y = float(body["y_cm"])
            if not (5 <= y <= cel["height_cm"] - 10):
                raise ApiError(400, "Rack height out of range")
            c.execute("UPDATE racks SET y_cm=? WHERE id=?", (y, rid))
            _resnap_rack(c, cel, r | {"y_cm": y})
        if "present" in body:
            present = bool(body["present"])
            if not present and r["present"]:
                n = db.one(c, "SELECT COUNT(*) n FROM bottles WHERE rack_id=? AND status='stored'", (rid,))["n"]
                mode = body.get("bottles")
                if n and mode not in ("with_rack", "relocate"):
                    raise ApiError(409, f"{n} bottle(s) on this rack — choose bottles='with_rack' or 'relocate'")
                c.execute("UPDATE racks SET present=0 WHERE id=?", (rid,))
                if n and mode == "with_rack":
                    c.execute("UPDATE bottles SET status='with_rack' WHERE rack_id=? AND status='stored'", (rid,))
                elif n:
                    _reassign_all(c, cel, only_rack=rid)
                notify(c, user["id"], "inventory", "info", f"{cel['name']}: {r['name']} pulled out"
                       + (f" with {n} bottle(s)" if n and mode == "with_rack" else ""), push=False)
            elif present and not r["present"]:
                c.execute("UPDATE racks SET present=1 WHERE id=?", (rid,))
                back = c.execute("UPDATE bottles SET status='stored' WHERE rack_id=? AND status='with_rack'", (rid,)).rowcount
                _reassign_all(c, cel)
                notify(c, user["id"], "inventory", "info", f"{cel['name']}: {r['name']} put back" + (f" with {back} bottle(s)" if back else ""), push=False)
    return get_cellar(user, r["cellar_id"])


def delete_rack(user: dict, rid: int) -> dict:
    with db.tx() as c:
        r = db.one(c, "SELECT r.* FROM racks r JOIN cellars c ON c.id=r.cellar_id WHERE r.id=? AND c.user_id=?", (rid, user["id"]))
        if not r:
            raise ApiError(404, "Rack not found")
        if r["kind"] == "floor":
            raise ApiError(400, "The floor can't be deleted")
        if db.one(c, "SELECT COUNT(*) n FROM bottles WHERE rack_id=? AND status IN ('stored','with_rack')", (rid,))["n"]:
            raise ApiError(409, "Move the bottles off this rack first")
        c.execute("DELETE FROM racks WHERE id=?", (rid,))
    return get_cellar(user, r["cellar_id"])


def _reassign_all(c, cel: dict, only_rack: int | None = None) -> None:
    """Re-snap bottles to whatever rack now supports them (after racks change).
    With only_rack: those bottles lost their rack, so each gets a new free spot."""
    racks = racks_of(c, cel["id"])
    if only_rack:
        zones = db.rows(c, "SELECT * FROM zones WHERE cellar_id=?", (cel["id"],))
        moving = db.rows(c, BOTTLE_SQL + " WHERE b.rack_id=? AND b.status='stored'", (only_rack,))
        for b in moving:
            others = [o for o in stored_bottles(c, cel["id"]) if o["id"] != b["id"] and o["rack_id"] != only_rack]
            spot = geo.find_free_spot(racks, others, cel["width_cm"], lambda r: prefers_zone(r, zones, b["color"]))
            s = geo.snap(racks, spot["x"], spot["y"], spot["z"], cel["width_cm"], cel["height_cm"], cel["depth_cm"]) if spot \
                else geo.snap(racks, b["x"], 0, b["z"], cel["width_cm"], cel["height_cm"], cel["depth_cm"])
            c.execute("UPDATE bottles SET x=?, y=?, z=?, rack_id=?, level=? WHERE id=?", (s["x"], s["y"], s["z"], s["rack_id"], s["level"], b["id"]))
        return
    for b in db.rows(c, "SELECT * FROM bottles WHERE cellar_id=? AND status='stored'", (cel["id"],)):
        s = geo.snap(racks, b["x"], b["y"], b["z"], cel["width_cm"], cel["height_cm"], cel["depth_cm"])
        c.execute("UPDATE bottles SET x=?, y=?, z=?, rack_id=?, level=? WHERE id=?", (s["x"], s["y"], s["z"], s["rack_id"], s["level"], b["id"]))


# ---------------------------------------------------------------- wines & bottles
def upsert_wine(c, w: dict) -> int:
    w = {k: w.get(k) for k in WINE_FIELDS}
    if not w["name"] or not w["producer"]:
        raise ApiError(400, "Wine name and producer are required")
    w["color"] = (w["color"] or "red").lower()
    if w["color"] not in COLORS:
        raise ApiError(400, f"color must be one of {COLORS}")
    w["vintage"] = int(w["vintage"] or 0)
    yr = w["vintage"] or date.today().year
    w["drink_from"] = int(w["drink_from"] or yr + 2)
    w["drink_to"] = int(w["drink_to"] or w["drink_from"] + 10)
    w["base_price"] = float(w["base_price"] or 50)
    ex = db.one(c, "SELECT id FROM wines WHERE name=? AND producer=? AND vintage=?", (w["name"], w["producer"], w["vintage"]))
    if ex:
        c.execute(
            "UPDATE wines SET region=COALESCE(?,region), country=COALESCE(?,country), grape=COALESCE(?,grape), color=?, drink_from=?, drink_to=? WHERE id=?",
            (w["region"], w["country"], w["grape"], w["color"], w["drink_from"], w["drink_to"], ex["id"]),
        )
        return ex["id"]
    return c.execute(f"INSERT INTO wines({','.join(WINE_FIELDS)}) VALUES({','.join('?' * len(WINE_FIELDS))})",
                     tuple(w[k] for k in WINE_FIELDS)).lastrowid


def new_serial() -> str:
    return "CC-" + secrets.token_hex(4).upper()


def prefers_zone(rack: dict, zones: list[dict], color: str) -> bool:
    z = zone_for_y(zones, rack["y_cm"] + geo.R)
    if not z:
        return False
    cool = color in ("white", "sparkling", "rose")
    return ("Upper" in z["name"]) == cool


def resolve_position(c, cel: dict, pos: dict | None, color: str, ignore_id: int | None = None) -> dict:
    """pos may be {x,y,z} (free point, snapped), {rack_id,x,z,level} or None (recommend)."""
    racks = racks_of(c, cel["id"])
    others = [o for o in stored_bottles(c, cel["id"]) if o["id"] != ignore_id]
    if not pos:
        zones = db.rows(c, "SELECT * FROM zones WHERE cellar_id=?", (cel["id"],))
        spot = geo.find_free_spot(racks, stored_bottles(c, cel["id"]), cel["width_cm"], lambda r: prefers_zone(r, zones, color))
        if not spot:
            raise ApiError(409, "No free space found — free mapping still lets you place it manually")
        return geo.snap(racks, spot["x"], spot["y"], spot["z"], cel["width_cm"], cel["height_cm"], cel["depth_cm"])
    if pos.get("rack_id"):
        rack = next((r for r in racks if r["id"] == int(pos["rack_id"])), None)
        if not rack or not rack["present"]:
            raise ApiError(400, "Rack not found or pulled out")
        lvl = int(pos.get("level") or 0)
        y = rack["y_cm"] + geo.R + lvl * geo.STACK_STEP
        return geo.snap(racks, float(pos.get("x", geo.R)), y, float(pos.get("z", 6)), cel["width_cm"], cel["height_cm"], cel["depth_cm"], others)
    try:
        x, y, z = float(pos["x"]), float(pos["y"]), float(pos.get("z", 6))
    except (KeyError, TypeError, ValueError):
        raise ApiError(400, "position needs x, y (and z) in cm")
    if not (0 <= x <= cel["width_cm"] and 0 <= y <= cel["height_cm"] and 0 <= z <= cel["depth_cm"]):
        raise ApiError(400, f"Position outside the cellar ({cel['width_cm']:.0f}×{cel['height_cm']:.0f}×{cel['depth_cm']:.0f} cm)")
    return geo.snap(racks, x, y, z, cel["width_cm"], cel["height_cm"], cel["depth_cm"], others)


def overlap_warnings(c, cid: int, p: dict, ignore_id: int | None = None) -> list[str]:
    warn = []
    for b in stored_bottles(c, cid):
        if b["id"] == ignore_id:
            continue
        if b["level"] == p["level"] and b["rack_id"] == p["rack_id"] and abs(b["z"] - p["z"]) < 15 and abs(b["x"] - p["x"]) < geo.MIN_GAP:
            warn.append(f"Very close to {b['producer']} {b['name']} ({b['serial']}) — check the spot")
    if p["rack_id"]:
        r = db.one(c, "SELECT * FROM racks WHERE id=?", (p["rack_id"],))
        n = db.one(c, "SELECT COUNT(*) n FROM bottles WHERE rack_id=? AND status='stored'", (p["rack_id"],))["n"]
        if r and n + (0 if ignore_id else 1) > r["capacity"]:
            warn.append(f"{r['name']} now holds {n + (0 if ignore_id else 1)} bottles (nominal {r['capacity']}) — fine if they physically fit")
    return warn


def add_bottle(user: dict, body: dict) -> dict:
    cid = int(body.get("cellar_id") or 0)
    with db.tx() as c:
        cel = own_cellar(c, user, cid)
        wid = upsert_wine(c, body.get("wine") or {})
        color = db.one(c, "SELECT color FROM wines WHERE id=?", (wid,))["color"]
        p = resolve_position(c, cel, body.get("position"), color)
        warns = overlap_warnings(c, cid, p)
        bid = c.execute(
            "INSERT INTO bottles(serial,user_id,cellar_id,wine_id,x,y,z,orientation,rack_id,level,source) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
            (new_serial(), user["id"], cid, wid, p["x"], p["y"], p["z"], body.get("orientation", "lying"), p["rack_id"], p["level"], "manual"),
        ).lastrowid
    return get_bottle(user, bid) | {"warnings": warns}


def get_bottle(user: dict, bid: int) -> dict:
    with db.tx() as c:
        b = db.one(c, BOTTLE_SQL + " WHERE b.id=? AND b.user_id=?", (bid, user["id"]))
        if not b:
            raise ApiError(404, "Bottle not found")
        zones = db.rows(c, "SELECT * FROM zones WHERE cellar_id=?", (b["cellar_id"],))
        latest = {z["id"]: latest_reading(c, z["id"]) for z in zones}
    return bottle_out(b, zones, latest)


def update_bottle(user: dict, bid: int, body: dict) -> dict:
    warns: list[str] = []
    with db.tx() as c:
        b = db.one(c, BOTTLE_SQL + " WHERE b.id=? AND b.user_id=? AND b.status='stored'", (bid, user["id"]))
        if not b:
            raise ApiError(404, "Bottle not found")
        if "wine" in body:
            merged = {k: b[k] for k in WINE_FIELDS} | {k: v for k, v in body["wine"].items() if k in WINE_FIELDS}
            wid = upsert_wine(c, merged)  # re-point this bottle; other bottles of the old product untouched
            if "base_price" in body["wine"]:
                c.execute("UPDATE wines SET base_price=? WHERE id=?", (float(body["wine"]["base_price"]), wid))
            c.execute("UPDATE bottles SET wine_id=? WHERE id=?", (wid, bid))
        if "position" in body or "cellar_id" in body:
            cid = int(body.get("cellar_id") or b["cellar_id"])
            cel = own_cellar(c, user, cid)  # can move to another linked cellar
            p = resolve_position(c, cel, body.get("position"), b["color"], ignore_id=bid)
            warns = overlap_warnings(c, cid, p, ignore_id=bid)
            c.execute("UPDATE bottles SET cellar_id=?, x=?, y=?, z=?, rack_id=?, level=? WHERE id=?",
                      (cid, p["x"], p["y"], p["z"], p["rack_id"], p["level"], bid))
        if "orientation" in body:
            c.execute("UPDATE bottles SET orientation=? WHERE id=?", ("standing" if body["orientation"] == "standing" else "lying", bid))
    return get_bottle(user, bid) | {"warnings": warns}


def remove_bottle(user: dict, bid: int, reason: str = "removed") -> dict:
    with db.tx() as c:
        b = db.one(c, "SELECT * FROM bottles WHERE id=? AND user_id=? AND status='stored'", (bid, user["id"]))
        if not b:
            raise ApiError(404, "Bottle not found")
        c.execute("UPDATE bottles SET status='removed', removed_at=? WHERE id=?", (utc(), bid))
        if reason == "consumed":
            c.execute("INSERT INTO consumption(user_id,wine_id,consumed_at) VALUES(?,?,?)", (user["id"], b["wine_id"], utc()))
        settle_above(c, b)
    return {"removed": bid, "reason": reason}


def settle_above(c, gone: dict) -> None:
    """Bottles stacked on a removed bottle drop one level (gravity)."""
    for o in db.rows(c, "SELECT * FROM bottles WHERE cellar_id=? AND rack_id IS ? AND status='stored' AND level > ? AND abs(x-?) < ? AND abs(z-?) < 15",
                     (gone["cellar_id"], gone["rack_id"], gone["level"], gone["x"], geo.D, gone["z"])):
        c.execute("UPDATE bottles SET level=level-1, y=round(y-?,1) WHERE id=?", (geo.STACK_STEP, o["id"]))


SEARCH_FIELDS = {
    "name": ["w.name"], "winery": ["w.producer"], "region": ["w.region", "w.country"],
    "vintage": ["CAST(w.vintage AS TEXT)"], "grape": ["w.grape"],
}


def search(user: dict, q: str, field: str = "all", cellar_id: int | None = None) -> list[dict]:
    q = (q or "").strip()
    cols = SEARCH_FIELDS.get(field) or [c for v in SEARCH_FIELDS.values() for c in v]
    where, params = ["b.user_id=?", "b.status='stored'"], [user["id"]]
    if q:
        where.append("(" + " OR ".join(f"{col} LIKE ?" for col in cols) + ")")
        params += [f"%{q}%"] * len(cols)
    if cellar_id:
        where.append("b.cellar_id=?"); params.append(cellar_id)
    with db.tx() as c:
        res = db.rows(c, BOTTLE_SQL + " WHERE " + " AND ".join(where) + " ORDER BY c.id, b.y DESC, b.x LIMIT 300", params)
    return [bottle_out(b) for b in res]


def recommend_storage(user: dict, body: dict) -> dict:
    color = (body.get("color") or "red").lower()
    with db.tx() as c:
        cel = own_cellar(c, user, int(body.get("cellar_id") or 0))
        racks = racks_of(c, cel["id"])
        zones = db.rows(c, "SELECT * FROM zones WHERE cellar_id=?", (cel["id"],))
        spot = geo.find_free_spot(racks, stored_bottles(c, cel["id"]), cel["width_cm"], lambda r: prefers_zone(r, zones, color))
    if not spot:
        raise ApiError(409, "No free spot found")
    rack = next(r for r in racks if r["id"] == spot["rack_id"])
    match = prefers_zone(rack, zones, color)
    zone = zone_for_y(zones, spot["y"])
    why = f"{zone['name'] if zone else rack['name']} suits {color} wine" if match else "preferred zone is full"
    why += f"; {spot['rack_name']}, {spot['x']:.0f} cm from left, {spot['layer']}"
    if spot["level"]:
        why += " — stacked on top of the row (rack is full at base level)"
    return spot | {"reason": why, "zone": zone["name"] if zone else None, "zone_match": match}


# ---------------------------------------------------------------- demo seed
def seed_demo(c, uid: int, cid: int) -> None:
    rnd = random.Random(uid)
    cel = db.one(c, "SELECT * FROM cellars WHERE id=?", (cid,))
    racks = racks_of(c, cid)
    shelves = [r for r in racks if r["kind"] == "shelf"]

    def put(idx: int, rack: dict, x: float, z: float = 6.0, level: int = 0, source="manual"):
        wid = upsert_wine(c, CATALOG[idx])
        y = rack["y_cm"] + geo.R + level * geo.STACK_STEP
        c.execute("INSERT INTO bottles(serial,user_id,cellar_id,wine_id,x,y,z,rack_id,level,source) VALUES(?,?,?,?,?,?,?,?,?,?)",
                  (new_serial(), uid, cid, wid, round(x, 1), round(y, 1), z, rack["id"], level, source))

    top = shelves[-1]   # highest rack: sparkling & white
    put(4, top, 4.5); put(5, top, 12.5); put(6, top, 20.5); put(1, top, 40)
    put(2, shelves[-2], 8); put(10, shelves[-2], 16); put(14, shelves[-2], 30, z=30)
    put(11, shelves[-3], 6); put(18, shelves[-3], 50)
    # one "10-bottle" rack holding 12: a full base row plus two nested on top
    full = shelves[2]
    reds = [0, 3, 12, 13, 8, 9, 15, 16, 19, 7]
    for i, idx in enumerate(reds):
        put(idx, full, geo.R + 0.2 + i * geo.D)
    put(0, full, geo.R + 0.2 + 0.5 * geo.D, level=1)
    put(12, full, geo.R + 0.2 + 4.5 * geo.D, level=1)
    put(9, shelves[1], 10); put(17, shelves[1], 26); put(16, shelves[0], 35, z=28)
    floor = racks[0]
    put(17, floor, 60)  # a bottle standing loose on the floor area
    for idx in [0, 3, 0, 12, 4, 0, 13, 1]:
        wid = upsert_wine(c, CATALOG[idx])
        c.execute("INSERT INTO consumption(user_id,wine_id,consumed_at) VALUES(?,?,?)", (uid, wid, utc(-rnd.randint(3, 200) * 86400)))
