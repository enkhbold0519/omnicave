"""Background loop standing in for the cellar hardware.

- writes a temperature/humidity reading per zone every SENSOR_INTERVAL seconds
- 'disconnect' a zone -> no readings -> stale-sensor alert
- 'spike' a zone -> out-of-range readings -> threshold alert after alert_minutes
- checks drinking windows and sends the daily briefing push at each user's time
"""
import random
import threading
import time
from datetime import datetime
from . import config, db, inventory, services


class _State:
    def __init__(self):
        self.disconnected: set[int] = set()
        self.spike: set[int] = set()
        self.running = False
        self.drift: dict[int, float] = {}


state = _State()


def _tick() -> None:
    now = services.utc()
    with db.tx() as c:
        zones = db.rows(c, "SELECT z.*, c.user_id, c.name AS cellar_name FROM zones z JOIN cellars c ON c.id=z.cellar_id")
        # cellars with a real appliance sending telemetry are not simulated
        real = {r["cellar_id"] for r in db.rows(c, "SELECT cellar_id FROM devices WHERE last_telemetry > ?", (services.utc(-30),))}
        for z in zones:
            zid = z["id"]
            if config.SIMULATE_SENSORS and zid not in state.disconnected and z["cellar_id"] not in real:
                d = state.drift.get(zid, 0.0) * 0.9 + random.gauss(0, 0.08)
                state.drift[zid] = d
                t = z["target_temp"] + d + random.gauss(0, 0.12)
                h = z["target_hum"] + d * 3 + random.gauss(0, 0.6)
                if zid in state.spike:
                    t += 6.5
                    h -= 18
                c.execute("INSERT INTO sensor_readings(zone_id,temp,hum,ts) VALUES(?,?,?,?)", (zid, round(t, 2), round(h, 1), now))

            # threshold exceeded for the whole user-defined duration?
            win = db.rows(c, "SELECT temp, hum FROM sensor_readings WHERE zone_id=? AND ts > ?",
                          (zid, services.utc(-z["alert_minutes"] * 60)))
            if len(win) >= 2:
                if all(r["temp"] > z["temp_max"] for r in win):
                    services._notify(c, z["user_id"], "environment", "critical",
                                     f"{z['cellar_name']} · {z['name']}: temperature above {z['temp_max']}°C for {z['alert_minutes']:g} min",
                                     dedupe_key=f"temp-high:{zid}")
                if all(r["temp"] < z["temp_min"] for r in win):
                    services._notify(c, z["user_id"], "environment", "critical",
                                     f"{z['cellar_name']} · {z['name']}: temperature below {z['temp_min']}°C for {z['alert_minutes']:g} min",
                                     dedupe_key=f"temp-low:{zid}")
                if all(not (z["hum_min"] <= r["hum"] <= z["hum_max"]) for r in win):
                    services._notify(c, z["user_id"], "environment", "warning",
                                     f"{z['cellar_name']} · {z['name']}: humidity outside {z['hum_min']:g}–{z['hum_max']:g}% for {z['alert_minutes']:g} min",
                                     dedupe_key=f"hum:{zid}")
            last = inventory.latest_reading(c, zid)
            stale_after = max(3 * config.SENSOR_INTERVAL, 20)
            if not last or last["ts"] < services.utc(-stale_after):
                services._notify(c, z["user_id"], "sensor", "warning",
                                 f"{z['cellar_name']} · {z['name']}: sensor disconnected / data older than {stale_after:g}s",
                                 dedupe_key=f"stale:{zid}")
        c.execute("DELETE FROM sensor_readings WHERE ts < ?", (services.utc(-86400),))


def _daily() -> None:
    today = datetime.now().strftime("%Y-%m-%d")
    hhmm = datetime.now().strftime("%H:%M")
    with db.tx() as c:
        users = db.rows(c, "SELECT * FROM users")
    for u in users:
        services.check_drinking_windows(u["id"])
        if hhmm >= (u["briefing_time"] or "08:00") and u["last_briefing_push"] != today:
            b = services.briefing(u)
            with db.tx() as c:
                services._notify(c, u["id"], "briefing", "info", "Daily Wine Briefing — " + b["summary"], push=True)
                c.execute("UPDATE users SET last_briefing_push=? WHERE id=?", (today, u["id"]))


def _loop() -> None:
    last_daily = 0.0
    while state.running:
        try:
            _tick()
            if time.time() - last_daily > 60:
                _daily()
                last_daily = time.time()
        except Exception as e:  # keep the simulator alive
            print("[simulator]", e)
        time.sleep(config.SENSOR_INTERVAL)


def start() -> None:
    if state.running:
        return
    state.running = True
    threading.Thread(target=_loop, name="cellar-simulator", daemon=True).start()


def stop() -> None:
    state.running = False
