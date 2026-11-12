"""Framework-agnostic route table, mounted by main.py (FastAPI) and devserver.py (stdlib)."""
from dataclasses import dataclass
from typing import Any, Callable
from . import devices as dv, inventory as inv, llm, services as s, tasting as t, vision as vi


@dataclass
class Ctx:
    user: dict | None
    device: dict | None
    token: str | None
    path: dict
    query: dict
    body: dict


@dataclass
class Route:
    method: str
    path: str
    handler: Callable[[Ctx], Any]
    auth: str = "user"   # user | device | none
    stream: bool = False


def _i(x) -> int:
    return int(x)


ROUTES: list[Route] = [
    Route("GET", "/api/health", lambda c: {"status": "ok", "llm": llm.provider_info(), "vision": vi.provider_info()}, auth="none"),
    # ---- auth / user (FR1)
    Route("POST", "/api/auth/register", lambda c: s.register(c.body.get("username"), c.body.get("email"), c.body.get("password"), c.body.get("seed_demo", True)), auth="none"),
    Route("POST", "/api/auth/login", lambda c: s.login(c.body.get("username"), c.body.get("password")), auth="none"),
    Route("POST", "/api/auth/logout", lambda c: s.logout(c.token)),
    Route("GET", "/api/me", lambda c: s.get_me(c.user)),
    Route("PATCH", "/api/me", lambda c: s.update_me(c.user, c.body)),
    Route("GET", "/api/me/export", lambda c: s.export_me(c.user)),
    Route("DELETE", "/api/me", lambda c: s.delete_me(c.user)),
    # ---- cellars, racks (free 3D mapping), zones (FR3, FR4, FR8)
    Route("GET", "/api/cellars", lambda c: inv.list_cellars(c.user)),
    Route("POST", "/api/cellars", lambda c: inv.create_cellar(c.user, c.body)),
    Route("GET", "/api/cellar-presets", lambda c: dv.presets(), auth="none"),
    Route("GET", "/api/cellars/{cid}", lambda c: inv.get_cellar(c.user, _i(c.path["cid"]))),
    Route("PATCH", "/api/cellars/{cid}", lambda c: inv.update_cellar(c.user, _i(c.path["cid"]), c.body)),
    Route("DELETE", "/api/cellars/{cid}", lambda c: inv.delete_cellar(c.user, _i(c.path["cid"]))),
    Route("POST", "/api/cellars/{cid}/racks", lambda c: inv.add_rack(c.user, _i(c.path["cid"]), c.body)),
    Route("PATCH", "/api/racks/{rid}", lambda c: inv.update_rack(c.user, _i(c.path["rid"]), c.body)),
    Route("DELETE", "/api/racks/{rid}", lambda c: inv.delete_rack(c.user, _i(c.path["rid"]))),
    Route("GET", "/api/cellars/{cid}/environment", lambda c: s.environment(c.user, _i(c.path["cid"]), int(c.query.get("minutes", 30)))),
    Route("PATCH", "/api/zones/{zid}", lambda c: s.update_zone(c.user, _i(c.path["zid"]), c.body)),
    Route("POST", "/api/simulator/sensors", lambda c: s.simulator_control(c.user, c.body)),
    # ---- inventory (FR2, FR3)
    Route("GET", "/api/bottles", lambda c: inv.search(c.user, c.query.get("q", ""), c.query.get("field", "all"),
                                                       int(c.query["cellar_id"]) if c.query.get("cellar_id") else None)),
    Route("POST", "/api/bottles", lambda c: inv.add_bottle(c.user, c.body)),
    Route("GET", "/api/bottles/{bid}", lambda c: inv.get_bottle(c.user, _i(c.path["bid"]))),
    Route("PATCH", "/api/bottles/{bid}", lambda c: inv.update_bottle(c.user, _i(c.path["bid"]), c.body)),
    Route("DELETE", "/api/bottles/{bid}", lambda c: inv.remove_bottle(c.user, _i(c.path["bid"]), c.query.get("reason", "removed"))),
    Route("GET", "/api/bottles/{bid}/price-history", lambda c: s.bottle_price_history(c.user, _i(c.path["bid"]))),
    Route("POST", "/api/recommendations/storage", lambda c: inv.recommend_storage(c.user, c.body)),
    # ---- Vision AI (FR2)
    Route("POST", "/api/cellars/{cid}/vision/scan", lambda c: vi.simulate_scan(c.user, _i(c.path["cid"]), c.body.get("event", "random"))),
    Route("POST", "/api/cellars/{cid}/vision/frame", lambda c: vi.upload_frame(c.user, _i(c.path["cid"]), c.body)),
    Route("GET", "/api/cellars/{cid}/vision/scans", lambda c: vi.recent_scans(c.user, _i(c.path["cid"]))),
    Route("GET", "/api/detections", lambda c: vi.list_detections(c.user, c.query.get("status", "pending"))),
    Route("POST", "/api/detections/{did}/confirm", lambda c: vi.confirm_detection(c.user, _i(c.path["did"]), c.body)),
    Route("POST", "/api/detections/{did}/reject", lambda c: vi.reject_detection(c.user, _i(c.path["did"]))),
    # ---- linking cellar appliances (FR8)
    Route("POST", "/api/devices/register", lambda c: dv.register(c.body), auth="none"),
    Route("POST", "/api/devices/status", lambda c: dv.status(c.body), auth="none"),
    Route("POST", "/api/devices/pair", lambda c: dv.pair(c.user, c.body)),
    Route("GET", "/api/devices", lambda c: dv.list_devices(c.user)),
    Route("PATCH", "/api/devices/{did}", lambda c: dv.update_device(c.user, _i(c.path["did"]), c.body)),
    Route("DELETE", "/api/devices/{did}", lambda c: dv.unlink(c.user, _i(c.path["did"]))),
    # ---- endpoints the appliance itself calls (Authorization: Bearer dev_...)
    Route("GET", "/api/device/cellar", lambda c: dv.device_cellar(c.device), auth="device"),
    Route("POST", "/api/device/telemetry", lambda c: dv.telemetry(c.device, c.body), auth="device"),
    Route("POST", "/api/device/vision/frame", lambda c: dv.vision_frame(c.device, c.body), auth="device"),
    Route("POST", "/api/device/vision/detections", lambda c: dv.vision_detections(c.device, c.body), auth="device"),
    # ---- notifications
    Route("GET", "/api/notifications", lambda c: s.notifications(c.user, c.query.get("unread") == "1")),
    Route("POST", "/api/notifications/read", lambda c: s.mark_read(c.user, c.body.get("id"))),
    # ---- recommendations (FR5) & AI (FR9) — streamed as Server-Sent Events
    Route("GET", "/api/recommendations/windows", lambda c: s.drinking_windows(c.user)),
    Route("POST", "/api/ai/pairing/meal", lambda c: s.ai_meal_pairing(c.user, c.body), stream=True),
    Route("POST", "/api/ai/pairing/wine", lambda c: s.ai_wine_pairing(c.user, c.body), stream=True),
    Route("POST", "/api/ai/curate", lambda c: s.ai_curate(c.user, c.body), stream=True),
    Route("POST", "/api/ai/personal", lambda c: s.ai_personal(c.user, c.body), stream=True),
    Route("POST", "/api/ai/ask", lambda c: s.ai_ask(c.user, c.body), stream=True),
    Route("POST", "/api/ai/dialogue", lambda c: s.ai_dialogue(c.user, c.body), stream=True),
    # ---- tasting table: sommeliers (built-in + the user's own) and one streamed round per request
    Route("GET", "/api/personas", lambda c: t.list_personas(c.user)),
    Route("POST", "/api/personas", lambda c: t.create_persona(c.user, c.body)),
    Route("PATCH", "/api/personas/{pid}", lambda c: t.update_persona(c.user, c.path["pid"], c.body)),
    Route("DELETE", "/api/personas/{pid}", lambda c: t.delete_persona(c.user, c.path["pid"])),
    Route("DELETE", "/api/personas/{pid}/memory", lambda c: t.clear_memory(c.user, c.path["pid"])),
    Route("POST", "/api/ai/table", lambda c: t.ai_table(c.user, c.body), stream=True),
    # ---- briefing (FR6) & market (FR7)
    Route("GET", "/api/briefing", lambda c: s.briefing(c.user)),
    Route("GET", "/api/market/summary", lambda c: s.market_summary(c.user)),
]


def run(route: Route, token: str | None, path: dict, query: dict, body: dict):
    user = s.user_from_token(token) if route.auth == "user" else None
    device = dv.device_from_token(token) if route.auth == "device" else None
    return route.handler(Ctx(user=user, device=device, token=token, path=path, query=query, body=body or {}))


def sse(gen):
    """Wrap an event generator as SSE byte chunks; errors become an 'error' event."""
    import json
    try:
        for ev in gen:
            yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n".encode()
    except s.ApiError as e:
        yield f"data: {json.dumps({'type': 'error', 'message': e.message})}\n\n".encode()
