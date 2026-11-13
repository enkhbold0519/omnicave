"""End-to-end smoke test against the stdlib dev server (no pip needed).
    cd backend && python -m tests.test_api
"""
import json
import os
import tempfile
import threading
import time
import urllib.request

os.environ["DB_PATH"] = os.path.join(tempfile.mkdtemp(), "test.db")
os.environ["SENSOR_INTERVAL"] = "0.5"
os.environ["LLM_PROVIDER"] = "mock"

from app import config, db, simulator  # noqa: E402
from app.devserver import Handler  # noqa: E402
from http.server import ThreadingHTTPServer  # noqa: E402

BASE = ""
TOKEN = ""


def call(method, path, body=None, stream=False, expect=200):
    req = urllib.request.Request(BASE + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": f"Bearer {TOKEN}"} if TOKEN else {})})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read().decode()
            status = r.status
    except urllib.error.HTTPError as e:
        raw, status = e.read().decode(), e.code
    assert status == expect, f"{method} {path} -> {status} {raw[:300]}"
    if stream:
        return [json.loads(l[5:]) for l in raw.split("\n") if l.startswith("data:")]
    return json.loads(raw) if raw else None


def main():
    global BASE, TOKEN
    db.init()
    simulator.start()
    srv = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    BASE = f"http://127.0.0.1:{srv.server_address[1]}"

    assert call("GET", "/api/health")["status"] == "ok"
    call("POST", "/api/auth/register", {"username": "x", "email": "bad", "password": "1"}, expect=400)
    r = call("POST", "/api/auth/register", {"username": "charlie", "email": "c@example.com", "password": "password123"})
    TOKEN = r["access_token"]
    call("POST", "/api/auth/register", {"username": "charlie", "email": "c@example.com", "password": "password123"}, expect=409)
    assert call("PATCH", "/api/me", {"display_name": "Charlie", "briefing_time": "07:30"})["briefing_time"] == "07:30"

    cellars = call("GET", "/api/cellars")
    cid = cellars[0]["id"]
    cel = call("GET", f"/api/cellars/{cid}")
    n0 = len(cel["bottles"])
    assert n0 >= 20 and len(cel["zones"]) == 2 and len(cel["racks"]) == 9
    over = [r for r in cel["racks"] if r["over_capacity"]]
    assert over and over[0]["count"] == 12 and over[0]["capacity"] == 10, "10-bottle rack holding 12 (free mapping)"
    assert any(b["level"] == 1 for b in cel["bottles"]), "stacked bottles seeded"
    assert all(0 <= b["x"] <= cel["width_cm"] and 0 <= b["y"] <= cel["height_cm"] for b in cel["bottles"])

    # search across all fields
    assert call("GET", "/api/bottles?q=Pinot&field=grape")
    assert call("GET", "/api/bottles?q=2019&field=vintage")
    assert call("GET", "/api/bottles?q=Burgundy")

    # manual add with storage recommendation (sparkling -> upper zone)
    rec = call("POST", "/api/recommendations/storage", {"cellar_id": cid, "color": "sparkling"})
    assert rec["zone_match"] and "Upper" in rec["zone"], rec
    b = call("POST", "/api/bottles", {"cellar_id": cid, "wine": {"name": "Test Cuvée", "producer": "Test", "color": "sparkling", "vintage": 2020}})
    assert b["serial"].startswith("CC-") and b["zone"]["name"].startswith("Upper"), b
    # free placement by point: snaps onto the rack below
    rack = next(r for r in cel["racks"] if r["kind"] == "shelf" and r["count"] == 0) if any(r["kind"] == "shelf" and r["count"] == 0 for r in cel["racks"]) else cel["racks"][1]
    fp = call("POST", "/api/bottles", {"cellar_id": cid, "wine": {"name": "Free Red", "producer": "Free", "color": "red"},
                                        "position": {"x": 33, "y": rack["y_cm"] + 9, "z": 7}})
    assert fp["rack_id"] == rack["id"] and fp["level"] == 0 and abs(fp["y"] - (rack["y_cm"] + 3.8)) < 0.2, fp
    # rack placement with stacking level
    st = call("POST", "/api/bottles", {"cellar_id": cid, "wine": {"name": "Stack Red", "producer": "Free", "color": "red"},
                                        "position": {"rack_id": rack["id"], "x": 36.8, "z": 7, "level": 1}})
    assert st["level"] == 1
    call("POST", "/api/bottles", {"cellar_id": cid, "wine": {"name": "X", "producer": "Y"}, "position": {"x": 999, "y": 10}}, expect=400)
    b2 = call("PATCH", f"/api/bottles/{b['id']}", {"wine": {"vintage": 2018, "base_price": 99}})
    assert b2["wine"]["vintage"] == 2018
    mv = call("PATCH", f"/api/bottles/{fp['id']}", {"position": {"x": 60, "y": rack["y_cm"] + 4, "z": 7}})
    assert mv["x"] == 60
    # removing the base bottle drops the stacked one (gravity)
    call("DELETE", f"/api/bottles/{fp['id']}?reason=removed")

    # racks: pull out with bottles (they leave with the rack) and put back
    full = over[0]
    call("PATCH", f"/api/racks/{full['id']}", {"present": False}, expect=409)
    r1 = call("PATCH", f"/api/racks/{full['id']}", {"present": False, "bottles": "with_rack"})
    assert len(r1["bottles"]) == len(call("GET", f"/api/cellars/{cid}")["bottles"]) and r1["bottles_out_with_racks"] == 12
    r2 = call("PATCH", f"/api/racks/{full['id']}", {"present": True})
    assert r2["bottles_out_with_racks"] == 0
    # relocate: bottles move to free spots elsewhere
    small = next(r for r in r2["racks"] if r["kind"] == "shelf" and 0 < r["count"] <= 3 and not r["over_capacity"])
    r3 = call("PATCH", f"/api/racks/{small['id']}", {"present": False, "bottles": "relocate"})
    assert not any(b["rack_id"] == small["id"] for b in r3["bottles"])
    call("PATCH", f"/api/racks/{small['id']}", {"present": True})
    nr = call("POST", f"/api/cellars/{cid}/racks", {"y_cm": 147, "capacity": 6})
    new_rack = max(nr["racks"], key=lambda r: r["y_cm"])
    call("PATCH", f"/api/racks/{new_rack['id']}", {"y_cm": 145, "name": "Top tray"})
    call("DELETE", f"/api/racks/{new_rack['id']}")
    call("PATCH", f"/api/racks/{nr['racks'][0]['id']}", {"present": False}, expect=400)  # floor

    # vision: simulated camera scan -> reconcile
    before = len(call("GET", f"/api/cellars/{cid}")["bottles"])
    pos0 = {x["id"]: (x["x"], x["y"], x["z"]) for x in call("GET", f"/api/cellars/{cid}")["bottles"]}
    for _ in range(8):  # repeated no-change scans: detection noise must not accumulate
        sc = call("POST", f"/api/cellars/{cid}/vision/scan", {"event": "none"})
        assert sc["unchanged"] + sc["occluded"] == before and not sc["removed"] and not sc["new"], sc
    assert pos0 == {x["id"]: (x["x"], x["y"], x["z"]) for x in call("GET", f"/api/cellars/{cid}")["bottles"]}
    sc = call("POST", f"/api/cellars/{cid}/vision/scan", {"event": "insert"})
    assert len(sc["new"]) == 1, sc
    d = call("GET", "/api/detections")[0]
    conf = call("POST", f"/api/detections/{d['id']}/confirm", {"wine": {"vintage": 2019}})
    assert conf["bottle"]["source"] == "vision" and conf["bottle"]["wine"]["vintage"] == 2019
    call("POST", f"/api/detections/{d['id']}/confirm", {}, expect=404)
    sc = call("POST", f"/api/cellars/{cid}/vision/scan", {"event": "stack"})
    assert sc["new"] and sc["new"][0]["level"] == 1, sc
    call("POST", f"/api/detections/{sc['new'][0]['detection_id']}/reject")
    sc = call("POST", f"/api/cellars/{cid}/vision/scan", {"event": "move"})
    assert len(sc["moved"]) == 1 and not sc["new"], sc
    sc = call("POST", f"/api/cellars/{cid}/vision/scan", {"event": "remove"})
    assert len(sc["removed"]) == 1, sc
    fr = call("POST", f"/api/cellars/{cid}/vision/frame", {"image_b64": "aGVsbG8="})
    assert fr["provider"] == "mock"
    for p_ in call("GET", "/api/detections"):
        call("POST", f"/api/detections/{p_['id']}/reject")
    assert call("GET", f"/api/cellars/{cid}/vision/scans")

    # linking a second physical cellar (pairing code flow) + device telemetry / detections
    reg = call("POST", "/api/devices/register", {"uid": "WC-TEST-0001", "model": "Test cellar"})
    assert len(reg["pairing_code"]) == 6
    st0 = call("POST", "/api/devices/status", {"uid": "WC-TEST-0001", "device_secret": reg["device_secret"]})
    assert st0["paired"] is False
    call("POST", "/api/devices/pair", {"code": "000000x"}, expect=404)
    pr = call("POST", "/api/devices/pair", {"code": reg["pairing_code"], "name": "Kitchen", "preset": "compact"})
    c3 = pr["cellar"]["id"]
    st1 = call("POST", "/api/devices/status", {"uid": "WC-TEST-0001", "device_secret": reg["device_secret"]})
    assert st1["paired"] and st1["device_token"].startswith("dev_")
    assert "device_token" not in call("POST", "/api/devices/status", {"uid": "WC-TEST-0001", "device_secret": reg["device_secret"]})
    user_tok = TOKEN
    TOKEN = st1["device_token"]
    geo_ = call("GET", "/api/device/cellar")
    assert geo_["id"] == c3 and geo_["racks"]
    tel = call("POST", "/api/device/telemetry", {"readings": [{"y_cm": 70, "temp": 9.1, "hum": 66}, {"y_cm": 10, "temp": 13.8, "hum": 67}]})
    assert tel["stored"] == 2
    rk = [r for r in geo_["racks"] if r["kind"] == "shelf"][0]
    dd = call("POST", "/api/device/vision/detections", {"detections": [
        {"position": {"x": 10, "y": rk["y_cm"] + 4, "z": 6}, "confidence": 0.9, "label": {"name": "Barolo", "producer": "G.D. Vajra", "vintage": 2018, "color": "red"}},
        {"position": {"x": 20, "y": rk["y_cm"] + 4, "z": 6}, "confidence": 0.4, "label": None}]})
    assert len(dd["new"]) == 2 and dd["new"][1]["note"].startswith("Label unreadable")
    call("GET", "/api/me", expect=401)  # device token can't act as a user
    TOKEN = user_tok
    devs = call("GET", "/api/devices")
    assert devs[0]["online"] and devs[0]["cellar_id"] == c3
    assert any(c["id"] == c3 and c["devices"] for c in call("GET", "/api/cellars"))
    for p_ in call("GET", "/api/detections"):
        call("POST", f"/api/detections/{p_['id']}/confirm", {"wine": {"name": p_["payload"]["wine"].get("name") or "Mystery", "producer": p_["payload"]["wine"].get("producer") or "Unknown"}})
    # move a bottle between linked cellars
    bb = call("GET", f"/api/cellars/{c3}")["bottles"][0]
    moved = call("PATCH", f"/api/bottles/{bb['id']}", {"cellar_id": cid})
    assert moved["cellar_id"] == cid
    call("DELETE", f"/api/devices/{devs[0]['id']}")
    TOKEN = st1["device_token"]
    call("GET", "/api/device/cellar", expect=401)
    TOKEN = user_tok

    # environment + alerts
    time.sleep(1.5)
    env = call("GET", f"/api/cellars/{cid}/environment")
    z = env["zones"][0]
    assert z["latest"] and z["sensor_online"], z
    call("PATCH", f"/api/zones/{z['id']}", {"alert_minutes": 0.02, "target_temp": 9})
    call("PATCH", f"/api/zones/{z['id']}", {"target_temp": 50}, expect=400)
    call("POST", "/api/simulator/sensors", {"zone_id": z["id"], "action": "spike"})
    call("POST", "/api/simulator/sensors", {"zone_id": env["zones"][1]["id"], "action": "disconnect"})
    time.sleep(3)
    config.SENSOR_INTERVAL = 0.5
    nots = call("GET", "/api/notifications")
    kinds = {n["kind"] for n in nots["items"]}
    assert "environment" in kinds, nots
    call("POST", "/api/simulator/sensors", {"zone_id": z["id"], "action": "normal"})
    call("POST", "/api/notifications/read", {})
    assert call("GET", "/api/notifications")["unread"] == 0

    # recommendations + AI (mock streaming)
    w = call("GET", "/api/recommendations/windows")
    assert w["ready"]
    ev = call("POST", "/api/ai/pairing/meal", {"meal": "소고기 스테이크"}, stream=True)
    assert ev[0]["type"] == "items" and ev[0]["items"][0]["wine"]["color"] == "red" and ev[-1]["type"] == "done"
    ev = call("POST", "/api/ai/pairing/wine", {"bottle_id": call("GET", f"/api/cellars/{cid}")["bottles"][0]["id"]}, stream=True)
    assert any(e["type"] == "delta" for e in ev)
    ev = call("POST", "/api/ai/curate", {"budget": 100, "flavor": "light", "theme": "birthday party"}, stream=True)
    assert all(i["market"]["price"] <= 100 for i in ev[0]["items"])
    ev = call("POST", "/api/ai/personal", {}, stream=True)
    assert ev[0]["profile"]["total"] >= 8
    ev = call("POST", "/api/ai/ask", {"query": "오늘 마실 와인?"}, stream=True)
    assert ev[-1]["type"] == "done"
    call("POST", "/api/ai/ask", {"query": ""}, expect=400)
    ev = call("POST", "/api/ai/dialogue", {"bottle_id": call("GET", f"/api/cellars/{cid}")["bottles"][0]["id"]}, stream=True)
    turns = [e for e in ev if e["type"] == "turn"]
    personas = json.loads(config.PERSONAS_PATH.read_text(encoding="utf-8"))
    assert len(turns) == len(personas) and ev[0]["type"] == "meta"

    # briefing + market
    br = call("GET", "/api/briefing")
    assert br["insights"] and br["news"]
    m = call("GET", "/api/market/summary")
    assert m["total"] > 0 and len(m["history"]) == 25
    ph = call("GET", f"/api/bottles/{call('GET', f'/api/cellars/{cid}')['bottles'][0]['id']}/price-history")
    assert len(ph["history"]) == 25

    # multi-cellar + cross search + isolation
    c2 = call("POST", "/api/cellars", {"name": "Office", "preset": "compact"})
    call("POST", "/api/bottles", {"cellar_id": c2["id"], "wine": {"name": "Office Red", "producer": "Zed", "color": "red"}})
    res = call("GET", "/api/bottles?q=")
    assert {cid, c2["id"], c3} <= {r["cellar_id"] for r in res}
    tok1 = TOKEN
    TOKEN = call("POST", "/api/auth/register", {"username": "mallory", "email": "m@example.com", "password": "password123", "seed_demo": False})["access_token"]
    call("GET", f"/api/cellars/{cid}", expect=404)
    assert call("GET", "/api/bottles?q=") == []
    TOKEN = tok1

    # GDPR export / logout / delete
    ex = call("GET", "/api/me/export")
    assert ex["bottles"] and ex["user"]["username"] == "charlie"
    call("POST", "/api/auth/logout")
    call("GET", "/api/me", expect=401)
    TOKEN = call("POST", "/api/auth/login", {"username": "charlie", "password": "password123"})["access_token"]
    call("DELETE", "/api/me")
    call("POST", "/api/auth/login", {"username": "charlie", "password": "password123"}, expect=401)
    print("ALL TESTS PASSED")


if __name__ == "__main__":
    main()
