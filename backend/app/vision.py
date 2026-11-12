"""Vision AI integration point.

Real deployment
  camera module inside the cellar ──(frame)──▶ POST /api/device/vision/frame
                                              └▶ VISION_PROVIDER=http  → your model server (VISION_ENDPOINT)
  or, if detection already runs on the edge ──▶ POST /api/device/vision/detections
Both paths end in `reconcile()`, which turns a list of detections into inventory changes.

Detection contract (what a model server must return, cellar coordinates in cm):
  {
    "track_id":   "CC-1A2B3C4D" | null,     # stable ID if the bottle carries a tag / visual fingerprint
    "position":   {"x": 31.2, "y": 56.0, "z": 6.0},   # x from left wall, y from floor, z from door
    "orientation":"lying" | "standing",
    "confidence": 0.93,                    # detection × label-OCR confidence
    "label": {"name": "...", "producer": "...", "vintage": 2019, "region": "...", "grape": "...", "color": "red"} | null
  }
"""
from __future__ import annotations

import json
import math
import random
import re
import urllib.request

from . import config, db, geometry as geo
from .catalog import CATALOG
from .common import ApiError, notify, utc
from .inventory import (BOTTLE_SQL, WINE_FIELDS, new_serial, racks_of, settle_above, stored_bottles)

MATCH_RADIUS = 6.0      # cm: same label within this distance = same bottle
DRIFT_TOLERANCE = 2.5   # cm: smaller differences are detection noise, position is not updated


def provider_info() -> dict:
    return {"provider": config.VISION_PROVIDER, "endpoint": config.VISION_ENDPOINT if config.VISION_PROVIDER == "http" else None,
            "missing_scans_to_remove": config.VISION_MISSING_SCANS}


# ------------------------------------------------------------------ providers
def analyze_frame(c, cel: dict, image_b64: str, content_type: str = "image/jpeg") -> tuple[list[dict], str]:
    if not image_b64:
        raise ApiError(400, "image_b64 is required")
    if len(image_b64) > 12_000_000:
        raise ApiError(413, "Image too large (max ~9 MB)")
    if config.VISION_PROVIDER == "http":
        payload = {
            "image_b64": image_b64, "content_type": content_type,
            "cellar": {k: cel[k] for k in ("id", "width_cm", "height_cm", "depth_cm")} | {
                "racks": [{k: r[k] for k in ("id", "name", "y_cm", "depth_cm", "present")} for r in racks_of(c, cel["id"])]},
        }
        headers = {"Content-Type": "application/json"}
        if config.VISION_API_KEY:
            headers["Authorization"] = f"Bearer {config.VISION_API_KEY}"
        req = urllib.request.Request(config.VISION_ENDPOINT, data=json.dumps(payload).encode(), headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read()).get("detections", []), "http"
        except Exception as e:
            raise ApiError(502, f"Vision server error: {e}")
    # mock: we can't see the photo, so pretend the camera saw the current state plus a random change
    try:
        dets, _ = simulate_detections(c, cel, "random")
    except ApiError:  # e.g. empty cellar: the only possible change is a new bottle
        try:
            dets, _ = simulate_detections(c, cel, "insert")
        except ApiError:
            dets, _ = simulate_detections(c, cel, "none")
    return dets, "mock"


# ------------------------------------------------------------------ matching helpers
def _tokens(s) -> set[str]:
    return {t for t in re.sub(r"[^a-z0-9]+", " ", str(s or "").lower()).split() if len(t) > 1}


def label_similarity(label: dict | None, b: dict) -> float:
    """0..1; 0.5 means 'unknown' (no label read)."""
    if not label:
        return 0.5
    def jac(a, b):
        a, b = _tokens(a), _tokens(b)
        return len(a & b) / len(a | b) if a and b else 0.0
    s = 0.55 * jac(label.get("producer"), b["producer"]) + 0.45 * jac(label.get("name"), b["name"])
    v = label.get("vintage")
    if v not in (None, "") and b["vintage"] and abs(int(v) - int(b["vintage"])) > 1:
        s *= 0.4  # different vintage: probably a different bottle of the same wine
    return s


def _dist(p: dict, b: dict) -> float:
    return math.dist((p["x"], p["y"], p["z"]), (b["x"], b["y"], b["z"]))


def _occluded(b: dict, dets: list[dict]) -> bool:
    """A bottle behind (higher z) another detected bottle at the same spot can't be seen from the door."""
    for d in dets:
        p = d["position"]
        if abs(p["x"] - b["x"]) < geo.D and abs(p["y"] - b["y"]) < geo.D and p["z"] < b["z"] - 5:
            return True
    return False


# ------------------------------------------------------------------ reconcile
def reconcile(c, uid: int, cel: dict, detections: list[dict], source: str = "vision") -> dict:
    racks = racks_of(c, cel["id"])
    bottles = stored_bottles(c, cel["id"])
    dets = []
    for d in detections:
        try:
            p = d["position"]
            dets.append(d | {"position": {"x": float(p["x"]), "y": float(p["y"]), "z": float(p.get("z", 6))}})
        except (KeyError, TypeError, ValueError):
            continue
    free_b = {b["id"]: b for b in bottles}
    free_d = list(range(len(dets)))
    res = {"detections": len(dets), "unchanged": 0, "moved": [], "new": [], "removed": [], "occluded": 0, "missing": []}

    def apply_match(i: int, b: dict, moved: bool):
        d = dets[i]
        if moved or _dist(d["position"], b) > DRIFT_TOLERANCE:
            s = geo.snap(racks, d["position"]["x"], d["position"]["y"], d["position"]["z"], cel["width_cm"], cel["height_cm"], cel["depth_cm"])
            c.execute("UPDATE bottles SET x=?, y=?, z=?, rack_id=?, level=?, missing_scans=0, orientation=? WHERE id=?",
                      (s["x"], s["y"], s["z"], s["rack_id"], s["level"], d.get("orientation") or b["orientation"], b["id"]))
        else:  # sub-centimetre detection noise: keep the stored position so noise doesn't accumulate
            s = {"x": b["x"], "y": b["y"], "z": b["z"]}
            c.execute("UPDATE bottles SET missing_scans=0 WHERE id=?", (b["id"],))
        if moved:
            res["moved"].append({"bottle_id": b["id"], "serial": b["serial"], "label": f"{b['producer']} {b['name']} {b['vintage'] or 'NV'}",
                                 "from": [b["x"], b["y"], b["z"]], "to": [s["x"], s["y"], s["z"]]})
        else:
            res["unchanged"] += 1
        free_b.pop(b["id"], None)
        free_d.remove(i)

    # 1) stable IDs
    for i in list(free_d):
        tid = dets[i].get("track_id")
        b = next((b for b in free_b.values() if tid and b["serial"] == tid), None)
        if b:
            apply_match(i, b, moved=_dist(dets[i]["position"], b) > MATCH_RADIUS)
    # 2) same spot, compatible label -> unchanged (small drift is corrected)
    pairs = sorted(((_dist(dets[i]["position"], b), i, b["id"]) for i in free_d for b in free_b.values()), key=lambda t: t[0])
    for dist, i, bid in pairs:
        if dist > MATCH_RADIUS:
            break
        if i in free_d and bid in free_b and label_similarity(dets[i].get("label"), free_b[bid]) >= 0.35:
            apply_match(i, free_b[bid], moved=False)
    # 3) same label elsewhere -> moved
    pairs = sorted(((label_similarity(dets[i].get("label"), b), i, b["id"]) for i in free_d for b in free_b.values()
                    if dets[i].get("label")), key=lambda t: -t[0])
    for sim, i, bid in pairs:
        if sim < 0.6:
            break
        if i in free_d and bid in free_b:
            apply_match(i, free_b[bid], moved=True)
    # 4) unseen bottles: occluded, missing, or removed after N consecutive scans
    for b in list(free_b.values()):
        if _occluded(b, dets):
            res["occluded"] += 1
            continue
        n = b["missing_scans"] + 1
        if n >= config.VISION_MISSING_SCANS:
            c.execute("UPDATE bottles SET status='removed', removed_at=?, missing_scans=? WHERE id=?", (utc(), n, b["id"]))
            c.execute("INSERT INTO consumption(user_id,wine_id,consumed_at) VALUES(?,?,?)", (uid, b["wine_id"], utc()))
            settle_above(c, b)
            res["removed"].append({"bottle_id": b["id"], "serial": b["serial"], "label": f"{b['producer']} {b['name']} {b['vintage'] or 'NV'}"})
        else:
            c.execute("UPDATE bottles SET missing_scans=? WHERE id=?", (n, b["id"]))
            res["missing"].append(b["serial"])
    # 5) new bottles -> pending review (unless an identical pending detection already exists)
    pending = [json.loads(r["payload"]) for r in db.rows(c, "SELECT payload FROM detections WHERE cellar_id=? AND status='pending'", (cel["id"],))]
    for i in free_d:
        d = dets[i]
        s = geo.snap(racks, d["position"]["x"], d["position"]["y"], d["position"]["z"], cel["width_cm"], cel["height_cm"], cel["depth_cm"])
        if any(math.dist((s["x"], s["y"], s["z"]), (p["x"], p["y"], p["z"])) < MATCH_RADIUS for p in pending):
            continue
        label = d.get("label") or {}
        wine = {k: label.get(k) for k in WINE_FIELDS if label.get(k) not in (None, "")}
        note = d.get("note")
        if not wine.get("name") or not wine.get("producer"):
            wine = {"name": wine.get("name") or "", "producer": wine.get("producer") or "", "color": wine.get("color") or "red"} | wine
            note = note or "Label unreadable — please fill in the wine details"
        rack = next((r for r in racks if r["id"] == s["rack_id"]), None)
        payload = {"wine": wine, **s, "rack_name": rack["name"] if rack else "Floor", "stacked": s["level"] > 0,
                   "confidence": round(float(d.get("confidence") or 0.5), 2), "note": note,
                   "tag": d.get("track_id") or new_serial(), "orientation": d.get("orientation") or "lying"}
        did = c.execute("INSERT INTO detections(user_id,cellar_id,kind,payload) VALUES(?,?,?,?)",
                        (uid, cel["id"], "stack" if s["level"] else "insert", db.dumps(payload))).lastrowid
        res["new"].append({"detection_id": did} | payload)
        pending.append(payload)
    # notifications
    for m in res["moved"]:
        notify(c, uid, "inventory", "info", f"{cel['name']}: moved {m['label']}", push=False)
    for r_ in res["removed"]:
        notify(c, uid, "inventory", "info", f"{cel['name']}: taken out {r_['label']}", push=True)
    if res["new"]:
        notify(c, uid, "inventory", "info", f"{cel['name']}: {len(res['new'])} new bottle(s) detected — review on the display", push=True)
    c.execute("UPDATE devices SET last_scan=? WHERE cellar_id=?", (utc(), cel["id"]))
    c.execute("INSERT INTO detections(user_id,cellar_id,kind,payload,status) VALUES(?,?,?,?,'scan')",
              (uid, cel["id"], source, db.dumps({k: v for k, v in res.items() if k != "new"} | {"new": len(res["new"])})))
    return res


# ------------------------------------------------------------------ simulator (stands in for the camera)
def _ocr(truth: dict, rnd: random.Random) -> tuple[dict, str | None, float]:
    ocr = {k: truth.get(k) for k in WINE_FIELDS}
    roll = rnd.random()
    if roll < 0.25 and truth.get("vintage"):
        ocr["vintage"] = truth["vintage"] + rnd.choice([-1, 1])
        return ocr, "Vintage digits partly hidden by the capsule — please verify", rnd.uniform(0.62, 0.8)
    if roll < 0.4:
        ocr["producer"] = truth["producer"].split(" ")[-1]
        return ocr, "Producer name partially occluded", rnd.uniform(0.62, 0.8)
    return ocr, None, rnd.uniform(0.86, 0.98)


def simulate_detections(c, cel: dict, event: str) -> tuple[list[dict], dict]:
    """What a front camera would report now, plus one random physical change."""
    rnd = random.Random()
    racks = racks_of(c, cel["id"])
    bottles = stored_bottles(c, cel["id"])
    dets = [{"position": {"x": b["x"] + rnd.uniform(-0.8, 0.8), "y": b["y"] + rnd.uniform(-0.5, 0.5), "z": b["z"] + rnd.uniform(-1, 1)},
             "orientation": b["orientation"], "confidence": round(rnd.uniform(0.88, 0.99), 2),
             "label": {k: b[k] for k in ("name", "producer", "vintage", "region", "country", "grape", "color")},
             "_id": b["id"]} for b in bottles]
    # back-row bottles hidden behind a front bottle are not visible to the camera
    dets = [d for d in dets if not _occluded(next(b for b in bottles if b["id"] == d["_id"]), [o for o in dets if o is not d])]
    if event == "random":
        event = rnd.choice(["insert", "insert", "stack", "move", "remove"])
    shelves = [r for r in racks if r["present"]]
    on_top = [b for b in bottles if not any(o["level"] > b["level"] and abs(o["x"] - b["x"]) < geo.D and o["rack_id"] == b["rack_id"]
                                            and abs(o["z"] - b["z"]) < 15 for o in bottles)]
    info = {"event": event}
    if event in ("insert", "stack"):
        truth = dict(rnd.choice(CATALOG))
        spot = None
        if event == "stack":
            for r in rnd.sample(shelves, len(shelves)):
                row = sorted(b["x"] for b in bottles if b["rack_id"] == r["id"] and b["level"] == 0 and b["z"] < 20)
                taken = [b["x"] for b in bottles if b["rack_id"] == r["id"] and b["level"] == 1 and b["z"] < 20]
                grooves = [(a + b_) / 2 for a, b_ in zip(row, row[1:])
                           if b_ - a <= geo.D * 1.3 and not any(abs(t - (a + b_) / 2) < geo.D * 0.6 for t in taken)]
                if grooves:
                    spot = {"x": rnd.choice(grooves), "y": r["y_cm"] + geo.R + geo.STACK_STEP, "z": 6.0, "level": 1}
                    break
            if not spot:
                raise ApiError(409, "No row with two neighbouring bottles to stack on")
        else:
            r = rnd.choice(shelves)
            spot = geo.find_free_spot(racks, bottles, cel["width_cm"], lambda x: x["id"] == r["id"])
            if not spot:
                raise ApiError(409, "No free space")
        ocr, note, conf = _ocr(truth, rnd)
        dets.append({"position": {"x": spot["x"], "y": spot["y"], "z": spot["z"]}, "orientation": "lying",
                     "confidence": round(conf, 2), "label": ocr, "note": note})
        info["wine"] = f"{truth['producer']} {truth['name']}"
    elif event == "move":
        if not on_top:
            raise ApiError(409, "Nothing to move")
        b = rnd.choice(on_top)
        r = rnd.choice([x for x in shelves if x["id"] != b["rack_id"]] or shelves)
        spot = geo.find_free_spot(racks, bottles, cel["width_cm"], lambda x: x["id"] == r["id"])
        if not spot:
            raise ApiError(409, "No free space")
        for d in dets:
            if d["_id"] == b["id"]:
                d["position"] = {"x": spot["x"], "y": spot["y"], "z": spot["z"]}
        info["wine"] = f"{b['producer']} {b['name']}"
    elif event == "remove":
        if not on_top:
            raise ApiError(409, "Cellar is empty")
        b = rnd.choice(on_top)
        dets = [d for d in dets if d.get("_id") != b["id"]]
        info["wine"] = f"{b['producer']} {b['name']}"
    elif event != "none":
        raise ApiError(400, "event must be random|insert|stack|move|remove|none")
    for d in dets:
        d.pop("_id", None)
    return dets, info


def simulate_scan(user: dict, cid: int, event: str) -> dict:
    with db.tx() as c:
        cel = db.one(c, "SELECT * FROM cellars WHERE id=? AND user_id=?", (cid, user["id"]))
        if not cel:
            raise ApiError(404, "Cellar not found")
        dets, info = simulate_detections(c, cel, event)
        res = reconcile(c, user["id"], cel, dets, source="simulated-camera")
        if info["event"] == "remove":
            # removal needs N consecutive scans without the bottle (avoids false removals from a hand blocking the view)
            for _ in range(config.VISION_MISSING_SCANS - 1):
                again = reconcile(c, user["id"], cel, dets, source="simulated-camera")
                res["removed"] += again["removed"]
    return res | {"simulated": info}


def upload_frame(user: dict, cid: int, body: dict) -> dict:
    """Same pipeline as a cellar camera, triggered from the display (e.g. a photo upload)."""
    with db.tx() as c:
        cel = db.one(c, "SELECT * FROM cellars WHERE id=? AND user_id=?", (cid, user["id"]))
        if not cel:
            raise ApiError(404, "Cellar not found")
        dets, provider = analyze_frame(c, cel, body.get("image_b64", ""), body.get("content_type", "image/jpeg"))
        res = reconcile(c, user["id"], cel, dets, source=f"frame:{provider}")
    return res | {"provider": provider}


def recent_scans(user: dict, cid: int) -> list[dict]:
    with db.tx() as c:
        rs = db.rows(c, "SELECT id, kind, payload, created_at FROM detections WHERE user_id=? AND cellar_id=? AND status='scan' ORDER BY id DESC LIMIT 10",
                     (user["id"], cid))
    return [r | {"payload": json.loads(r["payload"])} for r in rs]


def confirm_detection(user: dict, did: int, body: dict) -> dict:
    from .inventory import get_bottle, own_cellar, overlap_warnings, resolve_position, upsert_wine
    with db.tx() as c:
        d = db.one(c, "SELECT * FROM detections WHERE id=? AND user_id=? AND status='pending'", (did, user["id"]))
        if not d:
            raise ApiError(404, "Detection not found or already handled")
        p = json.loads(d["payload"])
        wine = p["wine"] | {k: v for k, v in (body.get("wine") or {}).items() if k in WINE_FIELDS}
        cel = own_cellar(c, user, d["cellar_id"])
        if db.one(c, "SELECT id FROM bottles WHERE serial=? AND status='stored'", (p["tag"],)):
            c.execute("UPDATE detections SET status='duplicate' WHERE id=?", (did,))
            return {"duplicate": True}
        wid = upsert_wine(c, wine)
        pos = body.get("position") or {"x": p["x"], "y": p["y"], "z": p["z"]}
        s = resolve_position(c, cel, pos, wine.get("color") or "red")
        warns = overlap_warnings(c, cel["id"], s)
        bid = c.execute(
            "INSERT INTO bottles(serial,user_id,cellar_id,wine_id,x,y,z,orientation,rack_id,level,source,confidence) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
            (p["tag"], user["id"], cel["id"], wid, s["x"], s["y"], s["z"], p.get("orientation", "lying"), s["rack_id"], s["level"], "vision", p["confidence"]),
        ).lastrowid
        c.execute("UPDATE detections SET status='confirmed', payload=? WHERE id=?", (db.dumps(p | {"wine": wine}), did))
    return {"bottle": get_bottle(user, bid), "warnings": warns}


def reject_detection(user: dict, did: int) -> dict:
    with db.tx() as c:
        c.execute("UPDATE detections SET status='rejected' WHERE id=? AND user_id=? AND status='pending'", (did, user["id"]))
    return {"rejected": did}


def list_detections(user: dict, status: str = "pending") -> list[dict]:
    with db.tx() as c:
        rs = db.rows(c, "SELECT * FROM detections WHERE user_id=? AND status=? ORDER BY id DESC LIMIT 50", (user["id"], status))
    return [r | {"payload": json.loads(r["payload"])} for r in rs]


__all__ = ["reconcile", "simulate_scan", "upload_frame", "analyze_frame", "confirm_detection", "reject_detection",
           "list_detections", "recent_scans", "provider_info", "BOTTLE_SQL"]
