"""llm.stream_chat against a tiny fake GPU server: streamed answers, adapter names, and the silent fallback."""
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from app import config, llm


class FakeVllm(BaseHTTPRequestHandler):
    status = 200
    seen: list = []

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        FakeVllm.seen.append((body["model"], self.headers.get("Authorization")))
        if FakeVllm.status != 200:
            self.send_response(FakeVllm.status)
            self.end_headers()
            self.wfile.write(b"overloaded")
            return
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.end_headers()
        for piece in ("Dark cherry ", "and cassis."):
            self.wfile.write(f"data: {json.dumps({'choices': [{'delta': {'content': piece}}]})}\n\n".encode())
        self.wfile.write(b"data: [DONE]\n\n")

    def log_message(self, *a):
        pass


@pytest.fixture
def vllm(monkeypatch):
    srv = ThreadingHTTPServer(("127.0.0.1", 0), FakeVllm)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    FakeVllm.status, FakeVllm.seen = 200, []
    monkeypatch.setattr(config, "LLM_PROVIDER", "vllm")
    monkeypatch.setattr(config, "VLLM_BASE_URL", f"http://127.0.0.1:{srv.server_address[1]}/v1")
    monkeypatch.setattr(config, "VLLM_API_KEY", "secret")
    monkeypatch.setitem(llm._vllm, "down_until", 0.0)
    monkeypatch.setitem(llm._vllm, "last_error", None)
    yield srv
    srv.shutdown()
    srv.server_close()


MSG = [{"role": "user", "content": "Taste this."}]


def test_answer_streams_with_the_adapter_and_key(vllm):
    assert "".join(llm.stream_chat(MSG, "fallback", adapter="critic-victor")) == "Dark cherry and cassis."
    assert "".join(llm.stream_chat(MSG, "fallback")) == "Dark cherry and cassis."
    assert FakeVllm.seen == [("critic-victor", "Bearer secret"), (config.VLLM_BASE_MODEL, "Bearer secret")]
    assert llm.provider_info()["last_error"] is None


def test_server_error_falls_back_silently(vllm):
    FakeVllm.status = 503
    assert "".join(llm.stream_chat(MSG, "Stand-in answer.")) == "Stand-in answer."   # no error text shown
    assert "503" in llm.provider_info()["last_error"]
    assert llm._vllm["down_until"] == 0.0                                            # reachable: try again next time


def test_pod_off_is_skipped_for_a_while(vllm, monkeypatch):
    port = vllm.server_address[1]
    vllm.shutdown()
    vllm.server_close()                                                              # nothing listens any more
    assert "".join(llm.stream_chat(MSG, "Stand-in answer.")) == "Stand-in answer."
    assert llm._vllm["down_until"] > 0 and "unavailable" in llm.provider_info()["last_error"]
    # while the pause runs, the server is not contacted at all, even if it is back
    srv = ThreadingHTTPServer(("127.0.0.1", port), FakeVllm)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    assert "".join(llm.stream_chat(MSG, "Stand-in answer.")) == "Stand-in answer." and FakeVllm.seen == []
    monkeypatch.setitem(llm._vllm, "down_until", 0.0)                                # pause over
    assert "".join(llm.stream_chat(MSG, "Stand-in answer.")) == "Dark cherry and cassis."
    srv.shutdown()
    srv.server_close()


def test_mock_provider_never_uses_the_network(vllm, monkeypatch):
    monkeypatch.setattr(config, "LLM_PROVIDER", "mock")
    assert "".join(llm.stream_chat(MSG, "Offline text.")) == "Offline text." and FakeVllm.seen == []
