"""Zero-dependency fallback server (stdlib only) exposing the same routes.
Useful when pip is unavailable:   python -m app.devserver   (from backend/)"""
import json
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qsl, urlsplit

from . import db, simulator
from .routes import ROUTES, run, sse
from .services import ApiError

_compiled = [(r, re.compile("^" + re.sub(r"\{(\w+)\}", r"(?P<\1>[^/]+)", r.path) + "$")) for r in ROUTES]


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        sys.stderr.write("[dev] " + fmt % args + "\n")

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS")

    def _json(self, status: int, obj):
        data = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.send_header("Content-Length", "0"); self.end_headers()

    def _handle(self):
        u = urlsplit(self.path)
        for route, rx in _compiled:
            m = rx.match(u.path)
            if m and route.method == self.command:
                break
        else:
            return self._json(404, {"detail": "Not found"})
        body = {}
        n = int(self.headers.get("Content-Length") or 0)
        if n:
            try:
                body = json.loads(self.rfile.read(n))
            except json.JSONDecodeError:
                return self._json(400, {"detail": "Body must be JSON"})
        auth = self.headers.get("Authorization", "")
        token = auth[7:] if auth.lower().startswith("bearer ") else None
        try:
            result = run(route, token, m.groupdict(), dict(parse_qsl(u.query)), body)
            if route.stream:
                gen = iter(result)
                first = next(gen, None)
                self.send_response(200)
                self._cors()
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Cache-Control", "no-cache")
                self.send_header("Connection", "close")
                self.end_headers()

                def chain():
                    if first is not None:
                        yield first
                    yield from gen

                for chunk in sse(chain()):
                    self.wfile.write(chunk)
                    self.wfile.flush()
                self.close_connection = True
                return
            self._json(200, result)
        except ApiError as e:
            self._json(e.status, {"detail": e.message})

    do_GET = do_POST = do_PATCH = do_DELETE = _handle


def main(port: int = 8000):
    db.init()
    simulator.start()
    srv = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"dev server on http://localhost:{port}  (Ctrl+C to stop)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 8000)
