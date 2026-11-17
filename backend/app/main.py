"""FastAPI entry point.

    cd backend
    .venv\\Scripts\\activate
    uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

API docs: http://localhost:8000/docs
"""
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from . import config, db, live, simulator
from .routes import ROUTES, Route, run, sse
from .services import ApiError, user_from_token


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init()
    simulator.start()
    yield
    simulator.stop()


app = FastAPI(title="Wine Cellar Dev Backend", version="0.2.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])


def _token(req: Request) -> str | None:
    h = req.headers.get("authorization", "")
    return h[7:] if h.lower().startswith("bearer ") else None


def _make(route: Route):
    async def endpoint(request: Request):
        body = {}
        if request.method in ("POST", "PATCH", "PUT"):
            raw = await request.body()
            if raw:
                try:
                    body = await request.json()
                except Exception:
                    return JSONResponse({"detail": "Body must be JSON"}, status_code=400)
        try:
            result = await run_in_threadpool(run, route, _token(request), dict(request.path_params), dict(request.query_params), body)
            if route.stream:
                # pull the first event now so validation errors return a proper HTTP status
                gen = iter(result)
                first = await run_in_threadpool(next, gen, None)

                def chain():
                    if first is not None:
                        yield first
                    yield from gen

                return StreamingResponse(sse(chain()), media_type="text/event-stream",
                                         headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
            return JSONResponse(result)
        except ApiError as e:
            return JSONResponse({"detail": e.message}, status_code=e.status)

    endpoint.__name__ = f"{route.method.lower()}_{route.path.strip('/').replace('/', '_').replace('{', '').replace('}', '')}"
    return endpoint


for r in ROUTES:
    app.add_api_route(r.path, _make(r), methods=[r.method])


@app.websocket("/api/ws")
async def live_updates(sock: WebSocket):
    """Live updates (see live.py). The client's first message is {"token": "..."}: browsers can't set headers
    on a WebSocket, and a token in the URL would end up in access logs."""
    await sock.accept()
    try:
        first = await asyncio.wait_for(sock.receive_json(), timeout=10)
        user = await run_in_threadpool(user_from_token, first.get("token"))
    except Exception:
        await sock.close(code=4401)   # not logged in
        return
    q = live.subscribe(user["id"])
    try:
        while True:
            try:
                msg = await asyncio.wait_for(q.get(), timeout=25)
            except asyncio.TimeoutError:
                msg = {"type": "ping"}   # keeps proxies from closing an idle connection
            await sock.send_json(msg)
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        live.unsubscribe(user["id"], q)
