"""OpenAI-compatible chat server: RAG evidence + per-request LoRA switching (Windows-native).

A local stand-in for `vllm serve --enable-lora`, plus the retrieval step in front of it. The webOS
backend (LLM_PROVIDER=vllm) sends the persona's LoRA name as `model`; this server activates that
LoRA for the request. For critic-debate prompts it also finds the wine in the prompt and appends
the retrieved-evidence block (evidence.py), so facts come from retrieval and style from the LoRA.
The base model is loaded once; every persona LoRA under adapters/ stays resident on the GPU.
(PEFT calls a trained LoRA an "adapter"; each adapters/<name>/ folder is one LoRA.)

  model=<adapter name>  -> that LoRA adapter (e.g. persona-power-critic)
  model=<base model id> -> base model with adapters disabled (prompt-only baseline)
  anything else         -> 404, which makes the backend fall back to its offline text

Endpoints: GET /health, GET /v1/models, POST /v1/chat/completions (stream and non-stream).
One GPU, so a lock runs one generation at a time.

Usage (from ai/lora):
  .venv\\Scripts\\python serve.py                      # http://127.0.0.1:8001/v1
  .venv\\Scripts\\python serve.py --api-key SECRET     # require "Authorization: Bearer SECRET"
"""
from __future__ import annotations

import argparse
import json
import threading
import time
import uuid
from contextlib import nullcontext
from pathlib import Path

import torch
import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from transformers import (AutoModelForCausalLM, AutoTokenizer, StoppingCriteria, StoppingCriteriaList,
                          TextIteratorStreamer)

import evidence
import prompts

HERE = Path(__file__).resolve().parent
DEFAULT_MODEL = "Qwen/Qwen2.5-1.5B-Instruct"


class Cancelled(StoppingCriteria):
    """Stops generation when the client disconnects mid-stream."""

    def __init__(self, event: threading.Event):
        self.event = event

    def __call__(self, input_ids, scores, **kwargs) -> bool:
        return self.event.is_set()


class Engine:
    def __init__(self, model_id: str, adapters_dir: Path):
        self.model_id = model_id
        self.tok = AutoTokenizer.from_pretrained(model_id)
        base = AutoModelForCausalLM.from_pretrained(model_id, dtype=torch.bfloat16).cuda().eval()
        self.adapters: dict[str, Path] = {}
        for cfg in sorted(adapters_dir.glob("*/adapter_config.json")):
            trained_on = json.loads(cfg.read_text(encoding="utf-8")).get("base_model_name_or_path")
            if trained_on != model_id:
                raise SystemExit(f"{cfg.parent.name} was trained on {trained_on}, not {model_id}. "
                                 "An adapter only works on the base model it was trained on.")
            self.adapters[cfg.parent.name] = cfg.parent
        if self.adapters:
            from peft import PeftModel
            names = list(self.adapters)
            self.model = PeftModel.from_pretrained(base, self.adapters[names[0]], adapter_name=names[0])
            for n in names[1:]:
                self.model.load_adapter(self.adapters[n], adapter_name=n)
            self.model.eval()
        else:
            self.model = base
        self.lock = threading.Lock()
        print(f"Loaded {model_id} with adapters: {list(self.adapters) or 'none'} "
              f"(VRAM {torch.cuda.memory_allocated() / 2**30:.2f} GiB)")

    def model_ids(self) -> list[str]:
        return [self.model_id] + list(self.adapters)

    def stream(self, name: str, messages: list[dict], max_tokens: int, temperature: float, top_p: float,
               cancel: threading.Event):
        """Yields text pieces. Holds the GPU lock until generation finishes."""
        inputs = self.tok.apply_chat_template(messages, add_generation_prompt=True, return_tensors="pt",
                                              return_dict=True).to("cuda")
        streamer = TextIteratorStreamer(self.tok, skip_prompt=True, skip_special_tokens=True, timeout=120)
        sampling = dict(do_sample=True, temperature=temperature, top_p=top_p) if temperature > 0 else dict(do_sample=False)
        kwargs = dict(**inputs, streamer=streamer, max_new_tokens=max_tokens,
                      stopping_criteria=StoppingCriteriaList([Cancelled(cancel)]),
                      pad_token_id=self.tok.pad_token_id, **sampling)

        self.lock.acquire()
        try:
            if name in self.adapters:
                self.model.set_adapter(name)
                ctx = nullcontext()
            else:
                ctx = self.model.disable_adapter() if self.adapters else nullcontext()
        except Exception:
            self.lock.release()
            raise

        def run() -> None:
            try:
                with ctx, torch.inference_mode():
                    self.model.generate(**kwargs)
            except Exception as e:  # surface in the server log; the streamer ends below
                print(f"generation error: {e}")
                streamer.end()
            finally:
                self.lock.release()

        threading.Thread(target=run, daemon=True).start()
        yield from streamer


def with_evidence(messages: list[dict]) -> tuple[list[dict], str]:
    """RAG step: append retrieved evidence to critic-debate prompts; other prompts pass through."""
    label = prompts.parse_label(messages)
    if label is None:
        return messages, "no debate prompt"
    block, note = evidence.block_for(prompts.parse_persona(messages), label)
    return prompts.add_evidence(messages, block), note


def build_app(engine: Engine, api_key: str | None, rag: bool) -> FastAPI:
    app = FastAPI(title="OmniCave persona LoRA server")

    def error(status: int, message: str, kind: str) -> JSONResponse:
        return JSONResponse({"error": {"message": message, "type": kind}}, status_code=status)

    def authorized(request: Request) -> bool:
        return not api_key or request.headers.get("authorization", "") == f"Bearer {api_key}"

    @app.get("/health")
    def health():
        return {"ok": True, "base_model": engine.model_id, "adapters": list(engine.adapters), "rag": rag}

    @app.get("/v1/models")
    def models(request: Request):
        if not authorized(request):
            return error(401, "invalid api key", "authentication_error")
        now = int(time.time())
        return {"object": "list", "data": [{"id": m, "object": "model", "created": now, "owned_by": "omnicave"}
                                           for m in engine.model_ids()]}

    @app.post("/v1/chat/completions")
    async def chat(request: Request):
        if not authorized(request):
            return error(401, "invalid api key", "authentication_error")
        body = await request.json()
        name = body.get("model") or engine.model_id
        if name not in engine.model_ids():
            return error(404, f"model '{name}' not found; available: {engine.model_ids()}", "not_found_error")
        messages = body.get("messages") or []
        rag_note = "rag off"
        if rag:
            messages, rag_note = with_evidence(messages)
        max_tokens = int(body.get("max_tokens") or 256)
        temperature = float(body.get("temperature", 0.8))
        top_p = float(body.get("top_p", 0.9))
        rid, created = f"chatcmpl-{uuid.uuid4().hex[:24]}", int(time.time())
        cancel = threading.Event()

        def chunk(delta: dict, finish: str | None = None) -> str:
            return "data: " + json.dumps({"id": rid, "object": "chat.completion.chunk", "created": created,
                                          "model": name, "choices": [{"index": 0, "delta": delta,
                                                                      "finish_reason": finish}]}) + "\n\n"

        def events():
            start, first = time.perf_counter(), None
            try:
                yield chunk({"role": "assistant"})
                for piece in engine.stream(name, messages, max_tokens, temperature, top_p, cancel):
                    if not piece:
                        continue
                    if first is None:
                        first = time.perf_counter() - start
                    yield chunk({"content": piece})
                yield chunk({}, "stop")
                yield "data: [DONE]\n\n"
            finally:
                cancel.set()
                ttft = f"{first:.3f}s" if first is not None else "-"
                print(f"[{name}] {rag_note}; stream TTFT {ttft}, total {time.perf_counter() - start:.2f}s")

        if body.get("stream"):
            return StreamingResponse(events(), media_type="text/event-stream")

        start = time.perf_counter()
        text = "".join(engine.stream(name, messages, max_tokens, temperature, top_p, cancel))
        print(f"[{name}] {rag_note}; non-stream total {time.perf_counter() - start:.2f}s")
        return {"id": rid, "object": "chat.completion", "created": created, "model": name,
                "choices": [{"index": 0, "message": {"role": "assistant", "content": text}, "finish_reason": "stop"}]}

    return app


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--adapters-dir", type=Path, default=HERE / "adapters")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8001)
    ap.add_argument("--api-key", default=None, help="require this bearer token (off by default for localhost)")
    ap.add_argument("--no-rag", action="store_true", help="do not append retrieved evidence (ablation)")
    args = ap.parse_args()
    if not torch.cuda.is_available():
        raise SystemExit("CUDA is not available. Run this with ai/lora/.venv, not the global Python.")
    engine = Engine(args.model, args.adapters_dir)
    uvicorn.run(build_app(engine, args.api_key, not args.no_rag), host=args.host, port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
