"""LLM client for any OpenAI-compatible chat-completions endpoint (streaming).

Providers
  mock   : no network; streams the caller-supplied fallback text
  hf     : Hugging Face Inference Providers  https://router.huggingface.co/v1
  openai : OpenAI                             https://api.openai.com/v1
  vllm   : self-hosted (vLLM --enable-lora). The persona's LoRA adapter name is
           sent as `model`, so the server hot-swaps adapters per persona.
On any provider error we fall back to the mock text so the UI never breaks.
"""
import json
import time
import urllib.error
import urllib.request
from typing import Iterator
from . import config


def provider_info() -> dict:
    p = config.LLM_PROVIDER
    model = {"hf": config.HF_MODEL, "openai": config.OPENAI_MODEL, "vllm": config.VLLM_BASE_MODEL}.get(p, "mock")
    configured = {
        "mock": True,
        "hf": bool(config.HF_TOKEN),
        "openai": bool(config.OPENAI_API_KEY),
        "vllm": True,
    }.get(p, False)
    return {"provider": p, "model": model, "configured": configured, "lora_swapping": p == "vllm"}


def _endpoint(adapter: str | None) -> tuple[str, str, str]:
    p = config.LLM_PROVIDER
    if p == "hf":
        return "https://router.huggingface.co/v1", config.HF_TOKEN, config.HF_MODEL
    if p == "openai":
        return "https://api.openai.com/v1", config.OPENAI_API_KEY, config.OPENAI_MODEL
    if p == "vllm":
        return config.VLLM_BASE_URL.rstrip("/"), "EMPTY", adapter or config.VLLM_BASE_MODEL
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
        got_any = False
        with urllib.request.urlopen(req, timeout=60) as resp:
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
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "ignore")[:200]
        yield f"[LLM error {e.code}: {detail}] — showing offline answer. "
        yield from _mock_stream(fallback)
    except Exception as e:  # network down, bad key, etc.
        yield f"[LLM unavailable: {e}] — showing offline answer. "
        yield from _mock_stream(fallback)
