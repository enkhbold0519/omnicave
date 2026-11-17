"""Linking physical cellar appliances (and their camera / sensor modules) to an account.

Pairing flow (like a smart TV or a router):
  1. appliance boots  -> POST /api/devices/register {uid, model}      -> {pairing_code, device_secret}
                        (shows the 6-digit code on its own display)
  2. owner, logged in -> POST /api/devices/pair {code, cellar_id?|preset}  (new cellar or link to existing)
  3. appliance polls  -> POST /api/devices/status {uid, device_secret} -> {paired, device_token} (token issued once)
  4. appliance sends  -> /api/device/telemetry, /api/device/vision/frame|detections  with  Authorization: Bearer dev_...
"""
from __future__ import annotations

import secrets

from . import db, security
from .common import ApiError, notify, utc
from .inventory import PRESETS, create_cellar_row, get_cellar

PAIRING_TTL_S = 600


def register(body: dict) -> dict:
    uid = str(body.get("uid") or "").strip()
    if not (4 <= len(uid) <= 64):
        raise ApiError(400, "uid (device serial) is required")
    code = f"{secrets.randbelow(1_000_000):06d}"
    secret = secrets.token_urlsafe(24)
    with db.tx() as c:
        d = db.one(c, "SELECT * FROM devices WHERE uid=?", (uid,))
        if d and d["user_id"]:
            raise ApiError(409, "Device already linked to an account — unlink it from the app first")
        if d:
            c.execute("UPDATE devices SET pairing_code=?, pairing_expires=?, secret_hash=?, model=?, kind=? WHERE id=?",
                      (code, utc(PAIRING_TTL_S), security.token_hash(secret), body.get("model"), body.get("kind", "cellar"), d["id"]))
        else:
            c.execute("INSERT INTO devices(uid,model,kind,secret_hash,pairing_code,pairing_expires) VALUES(?,?,?,?,?,?)",
                      (uid, body.get("model"), body.get("kind", "cellar"), security.token_hash(secret), code, utc(PAIRING_TTL_S)))
    return {"uid": uid, "pairing_code": code, "expires_in": PAIRING_TTL_S, "device_secret": secret}


def status(body: dict) -> dict:
    with db.tx() as c:
        d = db.one(c, "SELECT * FROM devices WHERE uid=?", (str(body.get("uid") or ""),))
        if not d or d["secret_hash"] != security.token_hash(str(body.get("device_secret") or "")):
            raise ApiError(401, "Unknown device")
        out = {"paired": bool(d["user_id"]), "cellar_id": d["cellar_id"]}
        if d["token_pending"]:
            out["device_token"] = d["token_pending"]
            c.execute("UPDATE devices SET token_pending=NULL WHERE id=?", (d["id"],))  # hand out once
        c.execute("UPDATE devices SET last_seen=? WHERE id=?", (utc(), d["id"]))
    return out


def pair(user: dict, body: dict) -> dict:
    code = str(body.get("code") or "").strip()
    with db.tx() as c:
        d = db.one(c, "SELECT * FROM devices WHERE pairing_code=? AND pairing_expires > ? AND user_id IS NULL", (code, utc()))
        if not d:
            raise ApiError(404, "Code not found or expired — check the code on the cellar's screen")
        if body.get("cellar_id"):
            cel = db.one(c, "SELECT * FROM cellars WHERE id=? AND user_id=?", (int(body["cellar_id"]), user["id"]))
            if not cel:
                raise ApiError(404, "Cellar not found")
            cid = cel["id"]
        else:
            name = str(body.get("name") or f"Cellar {d['uid'][-4:]}")
            cid = create_cellar_row(c, user["id"], name, body.get("preset", "tall"), model=d["model"])
        token = "dev_" + security.new_token()
        c.execute("UPDATE devices SET user_id=?, cellar_id=?, name=?, token_hash=?, token_pending=?, pairing_code=NULL, last_seen=? WHERE id=?",
                  (user["id"], cid, body.get("device_name") or d["model"] or d["uid"], security.token_hash(token), token, utc(), d["id"]))
        notify(c, user["id"], "device", "info", f"Linked {d['model'] or 'device'} ({d['uid']})", push=True)
    return {"cellar": get_cellar(user, cid), "device_uid": d["uid"]}


def list_devices(user: dict) -> list[dict]:
    with db.tx() as c:
        rs = db.rows(c, """SELECT d.id, d.uid, d.model, d.kind, d.name, d.cellar_id, c.name AS cellar_name,
                                  d.last_seen, d.last_telemetry, d.last_scan, d.created_at
                           FROM devices d LEFT JOIN cellars c ON c.id=d.cellar_id WHERE d.user_id=? ORDER BY d.id""", (user["id"],))
    return [r | {"online": bool(r["last_seen"]) and r["last_seen"] > utc(-60)} for r in rs]


def update_device(user: dict, did: int, body: dict) -> dict:
    with db.tx() as c:
        d = db.one(c, "SELECT * FROM devices WHERE id=? AND user_id=?", (did, user["id"]))
        if not d:
            raise ApiError(404, "Device not found")
        if "name" in body:
            c.execute("UPDATE devices SET name=? WHERE id=?", (str(body["name"])[:40], did))
        if "cellar_id" in body:
            if not db.one(c, "SELECT 1 FROM cellars WHERE id=? AND user_id=?", (int(body["cellar_id"]), user["id"])):
                raise ApiError(404, "Cellar not found")
            c.execute("UPDATE devices SET cellar_id=? WHERE id=?", (int(body["cellar_id"]), did))
    return next(x for x in list_devices(user) if x["id"] == did)


def unlink(user: dict, did: int) -> dict:
    with db.tx() as c:
        n = c.execute("UPDATE devices SET user_id=NULL, cellar_id=NULL, token_hash=NULL, token_pending=NULL WHERE id=? AND user_id=?",
                      (did, user["id"])).rowcount
    if not n:
        raise ApiError(404, "Device not found")
    return {"unlinked": did}


def device_from_token(token: str | None) -> dict:
    if not token or not token.startswith("dev_"):
        raise ApiError(401, "Device token required")
    with db.tx() as c:
        d = db.one(c, "SELECT * FROM devices WHERE token_hash=? AND user_id IS NOT NULL", (security.token_hash(token),))
        if not d:
            raise ApiError(401, "Device not linked")
        c.execute("UPDATE devices SET last_seen=? WHERE id=?", (utc(), d["id"]))
    return d


def presets() -> dict:
    return {k: v["label"] for k, v in PRESETS.items()}


# ------------------------------------------------------------- device-authenticated ingestion
def _device_cellar(c, d: dict) -> dict:
    cel = db.one(c, "SELECT * FROM cellars WHERE id=?", (d["cellar_id"],))
    if not cel:
        raise ApiError(409, "Device is not attached to a cellar")
    return cel


def telemetry(d: dict, body: dict) -> dict:
    """readings: [{zone_id | y_cm, temp, hum}]  (y_cm = sensor mounting height)."""
    with db.tx() as c:
        cel = _device_cellar(c, d)
        zones = db.rows(c, "SELECT * FROM zones WHERE cellar_id=?", (cel["id"],))
        n = 0
        for r in body.get("readings") or []:
            z = next((z for z in zones if z["id"] == r.get("zone_id")), None)
            if not z and r.get("y_cm") is not None:
                z = next((z for z in zones if z["y_from"] <= float(r["y_cm"]) <= z["y_to"]), None)
            if not z:
                continue
            c.execute("INSERT INTO sensor_readings(zone_id,temp,hum,ts) VALUES(?,?,?,?)", (z["id"], float(r["temp"]), float(r["hum"]), utc()))
            n += 1
        c.execute("UPDATE devices SET last_telemetry=? WHERE id=?", (utc(), d["id"]))
        settings = [{k: z[k] for k in ("id", "name", "y_from", "y_to", "target_temp", "target_hum")} for z in zones]
    # the response carries the current set-points so the appliance's compressor/humidifier can follow remote changes
    return {"stored": n, "zones": settings}


def vision_frame(d: dict, body: dict) -> dict:
    from .vision import analyze_frame, reconcile
    with db.tx() as c:
        cel = _device_cellar(c, d)
        dets, provider = analyze_frame(c, cel, body.get("image_b64", ""), body.get("content_type", "image/jpeg"))
        return reconcile(c, d["user_id"], cel, dets, source=f"device:{d['uid']}:{provider}") | {"provider": provider}


def vision_detections(d: dict, body: dict) -> dict:
    from .vision import reconcile
    with db.tx() as c:
        cel = _device_cellar(c, d)
        return reconcile(c, d["user_id"], cel, body.get("detections") or [], source=f"device:{d['uid']}:edge")


def device_cellar(d: dict) -> dict:
    """Geometry for the edge agent (rack heights etc. to convert camera → cellar coordinates)."""
    with db.tx() as c:
        cel = _device_cellar(c, d)
        racks = db.rows(c, "SELECT id, name, kind, y_cm, depth_cm, capacity, present FROM racks WHERE cellar_id=? ORDER BY y_cm", (cel["id"],))
        zones = db.rows(c, "SELECT * FROM zones WHERE cellar_id=?", (cel["id"],))
    return {k: cel[k] for k in ("id", "name", "width_cm", "height_cm", "depth_cm")} | {"racks": racks, "zones": zones}
