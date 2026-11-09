"""Edge agent: the small program that would run on the cellar's internal computer
(thin client — no AI here). Standard library only.

  python edge_agent.py --server http://<backend>:8000 --uid WC-0001-ABCD
    1. registers the appliance and prints a 6-digit pairing code
       (enter it in the display app: Settings → Linked cellars → Link)
    2. waits until paired, stores its device token in edge_state.json
    3. every --interval s: sends temperature/humidity        (replace read_sensors())
       every --scan-every s: sends a camera frame to the cloud (replace capture_frame())

Camera sources (first that works): --images DIR (cycles through jpg/png), --webcam (needs opencv-python),
otherwise no frames are sent (telemetry only).
"""
import argparse
import base64
import json
import random
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


def http(server: str, method: str, path: str, body=None, token: str | None = None):
    req = urllib.request.Request(server.rstrip("/") + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": f"Bearer {token}"} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"null")
        except json.JSONDecodeError:
            return e.code, None


# ------------------------------------------------------------- hardware hooks (replace on the real appliance)
def read_sensors(zones: list[dict]) -> list[dict]:
    """Return one reading per sensor. Real hardware: read SHT3x/BME280 over I2C, etc."""
    return [{"zone_id": z["id"], "temp": round(z["target_temp"] + random.gauss(0, 0.15), 2),
             "hum": round(z["target_hum"] + random.gauss(0, 0.8), 1)} for z in zones]


class Camera:
    def __init__(self, images: str | None, webcam: bool):
        self.files = sorted(p for p in Path(images).glob("*") if p.suffix.lower() in (".jpg", ".jpeg", ".png")) if images else []
        self.i = 0
        self.cap = None
        if webcam:
            try:
                import cv2  # type: ignore
                self.cv2 = cv2
                self.cap = cv2.VideoCapture(0)
            except ImportError:
                print("[edge] opencv-python not installed; --webcam ignored")

    def capture_frame(self) -> tuple[bytes, str] | None:
        if self.files:
            f = self.files[self.i % len(self.files)]
            self.i += 1
            return f.read_bytes(), "image/png" if f.suffix.lower() == ".png" else "image/jpeg"
        if self.cap is not None:
            ok, frame = self.cap.read()
            if ok:
                ok, buf = self.cv2.imencode(".jpg", frame, [self.cv2.IMWRITE_JPEG_QUALITY, 85])
                if ok:
                    return buf.tobytes(), "image/jpeg"
        return None


# ------------------------------------------------------------- main loop
def pair(server: str, uid: str, model: str, state_file: Path) -> dict:
    st, reg = http(server, "POST", "/api/devices/register", {"uid": uid, "model": model})
    if st != 200:
        sys.exit(f"[edge] register failed: {st} {reg}")
    print("\n" + "=" * 44)
    print(f"   PAIRING CODE:  {reg['pairing_code']}     (valid {reg['expires_in'] // 60} min)")
    print("   Display app → Settings → Linked cellars → Link")
    print("=" * 44 + "\n", flush=True)
    deadline = time.time() + reg["expires_in"]
    while time.time() < deadline:
        time.sleep(3)
        st, s = http(server, "POST", "/api/devices/status", {"uid": uid, "device_secret": reg["device_secret"]})
        if st == 200 and s.get("device_token"):
            state = {"uid": uid, "token": s["device_token"], "cellar_id": s["cellar_id"]}
            state_file.write_text(json.dumps(state))
            print(f"[edge] paired with cellar {s['cellar_id']}")
            return state
    sys.exit("[edge] pairing code expired — run again")


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--server", default="http://localhost:8000")
    ap.add_argument("--uid", default="WC-" + "".join(random.choices("0123456789ABCDEF", k=8)))
    ap.add_argument("--model", default="Smart wine cellar (edge agent)")
    ap.add_argument("--state", default="edge_state.json")
    ap.add_argument("--interval", type=float, default=5)
    ap.add_argument("--scan-every", type=float, default=30)
    ap.add_argument("--images")
    ap.add_argument("--webcam", action="store_true")
    ap.add_argument("--max-loops", type=int, default=0, help="stop after N loops (testing)")
    a = ap.parse_args(argv)

    state_file = Path(a.state)
    state = json.loads(state_file.read_text()) if state_file.exists() else None
    if not state:
        state = pair(a.server, a.uid, a.model, state_file)
    cam = Camera(a.images, a.webcam)
    last_scan, loops = 0.0, 0
    while True:
        st, cel = http(a.server, "GET", "/api/device/cellar", token=state["token"])
        if st == 401:
            print("[edge] device was unlinked — pairing again")
            state_file.unlink(missing_ok=True)
            state = pair(a.server, state["uid"], a.model, state_file)
            continue
        if st != 200:
            print(f"[edge] backend unreachable ({st}); retrying"); time.sleep(a.interval); continue
        st, r = http(a.server, "POST", "/api/device/telemetry", {"readings": read_sensors(cel["zones"])}, state["token"])
        print(f"[edge] telemetry {st} stored={r and r.get('stored')}", flush=True)
        if time.time() - last_scan >= a.scan_every:
            last_scan = time.time()
            frame = cam.capture_frame()
            if frame:
                st, r = http(a.server, "POST", "/api/device/vision/frame",
                             {"image_b64": base64.b64encode(frame[0]).decode(), "content_type": frame[1]}, state["token"])
                if st == 200:
                    print(f"[edge] scan: {r['unchanged']} unchanged, {len(r['moved'])} moved, {len(r['new'])} new, {len(r['removed'])} removed ({r.get('provider')})")
                else:
                    print(f"[edge] scan failed {st} {r}")
        loops += 1
        if a.max_loops and loops >= a.max_loops:
            return state
        time.sleep(a.interval)


if __name__ == "__main__":
    main()
