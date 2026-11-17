"""LLM client for any OpenAI-compatible chat-completions endpoint (streaming).

Providers
  mock   : no network; streams the caller-supplied fallback text
  hf     : Hugging Face Inference Providers  https://router.huggingface.co/v1
  openai : OpenAI                             https://api.openai.com/v1
  vllm   : self-hosted (vLLM --enable-lora, behind AI-7B/gateway.py). The persona's LoRA adapter name
           is sent as `model`, so the server hot-swaps adapters per persona.
On any provider error we fall back to the mock text so the UI never breaks. hf/openai show the error
in the answer. The vllm server is a rented GPU that is switched off most of the time, so there the
fallback is silent: the reason goes to the log and to /api/health (llm.last_error), and the server
is not tried again for VLLM_RETRY_AFTER seconds.
"""
import json
import time
import urllib.error
import urllib.request
from typing import Iterator
from . import config

VLLM_RETRY_AFTER = 60   # seconds to skip the vllm server after it could not be reached
_vllm = {"down_until": 0.0, "last_error": None}


def provider_info() -> dict:
    p = config.LLM_PROVIDER
    model = {"hf": config.HF_MODEL, "openai": config.OPENAI_MODEL, "vllm": config.VLLM_BASE_MODEL}.get(p, "mock")
    configured = {
        "mock": True,
        "hf": bool(config.HF_TOKEN),
        "openai": bool(config.OPENAI_API_KEY),
        "vllm": True,
    }.get(p, False)
    info = {"provider": p, "model": model, "configured": configured, "lora_swapping": p == "vllm"}
    if p == "vllm":
        info["last_error"] = _vllm["last_error"]   # None -> the last request reached the server
    return info


def _endpoint(adapter: str | None) -> tuple[str, str, str]:
    p = config.LLM_PROVIDER
    if p == "hf":
        return "https://router.huggingface.co/v1", config.HF_TOKEN, config.HF_MODEL
    if p == "openai":
        return "https://api.openai.com/v1", config.OPENAI_API_KEY, config.OPENAI_MODEL
    if p == "vllm":
        return config.VLLM_BASE_URL.rstrip("/"), config.VLLM_API_KEY or "EMPTY", adapter or config.VLLM_BASE_MODEL
    raise RuntimeError(f"unknown provider {p}")


def _mock_stream(text: str) -> Iterator[str]:
    words = text.split(" ")
    for i, w in enumerate(words):
        time.sleep(0.015)
        yield w if i == len(words) - 1 else w + " "


def stream_chat(
    messages: list[dict],
    fallback: str,
    adapter: str | None = None,
    max_tokens: int = 350,
    temperature: float = 0.8,
) -> Iterator[str]:
    if config.LLM_PROVIDER == "mock":
        yield from _mock_stream(fallback)
        return
    vllm = config.LLM_PROVIDER == "vllm"
    if vllm and time.time() < _vllm["down_until"]:
        yield from _mock_stream(fallback)
        return
    got_any = False
    try:
        base, key, model = _endpoint(adapter)
        if not key:
            raise RuntimeError(f"{config.LLM_PROVIDER} key is empty (set it in backend/.env)")
        body = {
            "model": model,
            "messages": messages,
            "stream": True,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        req = urllib.request.Request(
            f"{base}/chat/completions",
            data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=20 if vllm else 60) as resp:
            for raw in resp:
                line = raw.decode("utf-8", "ignore").strip()
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    chunk = json.loads(data)
                except json.JSONDecodeError:
                    continue
                choices = chunk.get("choices") or []
                if not choices:
                    continue
                piece = (choices[0].get("delta") or {}).get("content")
                if piece:
                    got_any = True
                    yield piece
        if not got_any:
            raise RuntimeError("empty response")
        if vllm:
            _vllm["last_error"] = None
    except Exception as e:  # network down, bad key, unknown model, etc.
        if isinstance(e, urllib.error.HTTPError):
            reason = f"LLM error {e.code}: {e.read().decode('utf-8', 'ignore')[:200]}"
        else:
            reason = f"LLM unavailable: {e}"
        if vllm:
            print(f"[llm] vllm model={adapter or config.VLLM_BASE_MODEL}: {reason}", flush=True)
            _vllm["last_error"] = reason
            if not isinstance(e, urllib.error.HTTPError):   # server unreachable: don't make every turn wait
                _vllm["down_until"] = time.time() + VLLM_RETRY_AFTER
        if got_any:      # the answer broke off midway: keep what was said, don't append the offline text
            return
        if not vllm:
            yield f"[{reason}] — showing offline answer. "
        yield from _mock_stream(fallback)
