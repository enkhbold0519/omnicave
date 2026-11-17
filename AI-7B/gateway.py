"""7B gateway: the RAG step in front of `vllm serve` (OpenAI-compatible proxy, standard library only).

vLLM only switches LoRAs; it does not add evidence. The backend (LLM_PROVIDER=vllm) sends its request
here instead. For a critic-debate prompt the gateway finds the wine and the persona in the prompt, looks
the wine up in data/pool.jsonl and appends that persona's evidence block, exactly as generate.py did for
the training data. Then it forwards the request to vLLM and streams the answer back unchanged.

  debate prompt, persona known  -> evidence appended (unknown wine: the "no evidence" block)
  anything else                 -> passed through as it is (table questions, base-model turns)

Endpoints: GET /health (no key), GET /v1/models, POST /v1/chat/completions (stream and non-stream).

Usage (on the pod, after vLLM is up on 127.0.0.1:8000; files in /root/omnicave):
  OMNICAVE_PERSONAS=personas.json python gateway.py --api-key SECRET      # http://0.0.0.0:8001/v1
  OMNICAVE_PERSONAS=personas.json python gateway.py --check               # served prompt == training prompt
The persona file must be AI-7B/personas.json: the persona is found by its name in the system prompt.
The key can also come from the GATEWAY_API_KEY environment variable. Without a key anyone can use the pod.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import evidence7b
import prompts

HERE = Path(__file__).resolve().parent
POOL: dict[str, dict] = {}


def load_pool(path: Path) -> dict[str, dict]:
    """label -> pool row. A missing file is allowed: every wine then gets the "no evidence" block."""
    if not path.exists():
        print(f"WARNING: {path} not found; every wine gets the 'no evidence' block", flush=True)
        return {}
    rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    return {r["label"]: r for r in rows}


def with_evidence(messages: list[dict], pool: dict[str, dict]) -> tuple[list[dict], str]:
    """RAG step: append retrieved evidence to critic-debate prompts; other prompts pass through."""
    label = prompts.parse_label(messages)
    if label is None:
        return messages, "no debate prompt"
    persona_id = prompts.parse_persona(messages)
    if persona_id is None:
        return messages, "debate prompt, unknown persona"
    if any(evidence7b.EVIDENCE_HEADER in (m.get("content") or "") for m in messages):
        return messages, "evidence already present"
    row = pool.get(label)
    block = evidence7b.block_for(persona_id, row or {})
    return prompts.add_evidence(messages, block), f"{persona_id}: {'evidence' if row else 'wine not in pool'}"


def check(pool: dict[str, dict], eval_path: Path) -> int:
    """Every eval row: the prompt this gateway would serve must equal the prompt the LoRA was trained on."""
    rows = [json.loads(line) for line in eval_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    bad = 0
    for r in rows:
        served, note = with_evidence(r["backend_messages"], pool)
        if served != r["messages"][:2]:
            bad += 1
            if bad <= 3:
                print(f"MISMATCH {r['id']} ({note})\n--- served\n{served[-1]['content']}\n--- trained\n{r['messages'][1]['content']}\n")
    print(f"{len(rows) - bad}/{len(rows)} eval prompts are identical to training")
    return 1 if bad or not rows else 0


class Handler(BaseHTTPRequestHandler):
    upstream = ""
    api_key = ""

    def log_message(self, fmt, *args):   # one line per request is printed by the handlers instead
        pass

    def _json(self, status: int, obj: dict) -> None:
        data = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _authorized(self) -> bool:
        if not self.api_key or self.headers.get("Authorization", "") == f"Bearer {self.api_key}":
            return True
        self._json(401, {"error": {"message": "invalid api key", "type": "authentication_error"}})
        return False

    def _relay(self, req: urllib.request.Request, note: str) -> None:
        """Send the request to vLLM and copy the answer back line by line, so streamed tokens are not held back."""
        start, first, name = time.perf_counter(), None, note
        try:
            with urllib.request.urlopen(req, timeout=300) as resp:
                self.send_response(resp.status)
                self.send_header("Content-Type", resp.headers.get("Content-Type", "application/json"))
                self.send_header("Cache-Control", "no-cache")
                self.send_header("X-Accel-Buffering", "no")
                self.end_headers()
                for raw in resp:
                    if first is None:
                        first = time.perf_counter() - start
                    self.wfile.write(raw)
                    self.wfile.flush()
        except urllib.error.HTTPError as e:          # vLLM's own error (e.g. unknown model): pass it on
            body = e.read()
            self.send_response(e.code)
            self.send_header("Content-Type", e.headers.get("Content-Type", "application/json"))
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            name += f"; upstream {e.code}"
        except (urllib.error.URLError, OSError) as e:
            if first is None:                         # nothing sent yet: vLLM is not reachable
                try:
                    self._json(502, {"error": {"message": f"vLLM not reachable: {e}", "type": "upstream_error"}})
                except OSError:
                    pass
            name += f"; {type(e).__name__}"           # otherwise the client went away mid-stream
        ttft = f"{first:.3f}s" if first is not None else "-"
        print(f"[{name}] first byte {ttft}, total {time.perf_counter() - start:.2f}s", flush=True)

    def do_GET(self):
        path = self.path.split("?")[0].rstrip("/")
        if path == "/health":
            return self._json(200, {"ok": True, "pool": len(POOL), "upstream": self.upstream,
                                    "personas": [p["id"] for p in prompts.load_personas()]})
        if path == "/v1/models":
            if self._authorized():
                self._relay(urllib.request.Request(f"{self.upstream}/models"), "models")
            return None
        return self._json(404, {"error": {"message": "not found", "type": "not_found_error"}})

    def do_POST(self):
        if self.path.split("?")[0].rstrip("/") != "/v1/chat/completions":
            return self._json(404, {"error": {"message": "not found", "type": "not_found_error"}})
        if not self._authorized():
            return None
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)))
            messages = body["messages"]
        except (ValueError, KeyError, TypeError):
            return self._json(400, {"error": {"message": "expected a JSON body with 'messages'", "type": "invalid_request_error"}})
        body["messages"], note = with_evidence(messages, POOL)
        req = urllib.request.Request(f"{self.upstream}/chat/completions", data=json.dumps(body).encode(),
                                     headers={"Content-Type": "application/json"}, method="POST")
        return self._relay(req, f"{body.get('model')}] [{note}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--upstream", default="http://127.0.0.1:8000/v1", help="vLLM's OpenAI base URL")
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--port", type=int, default=8001)
    ap.add_argument("--api-key", default=os.environ.get("GATEWAY_API_KEY", ""))
    ap.add_argument("--pool", type=Path, default=HERE / "data" / "pool.jsonl")
    ap.add_argument("--check", action="store_true", help="compare served prompts with data/eval.jsonl and exit")
    args = ap.parse_args()
    POOL.update(load_pool(args.pool))
    if args.check:
        return check(POOL, HERE / "data" / "eval.jsonl")
    Handler.upstream, Handler.api_key = args.upstream.rstrip("/"), args.api_key
    if not args.api_key:
        print("WARNING: no --api-key; anyone who knows the address can use this server", flush=True)
    print(f"gateway on http://{args.host}:{args.port}/v1 -> {Handler.upstream}; pool {len(POOL)} wines; "
          f"personas {[p['id'] for p in prompts.load_personas()]}", flush=True)
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main())
