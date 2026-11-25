#!/usr/bin/env bash
# Demo pod: vLLM (Qwen2.5-7B + the 4 persona LoRAs) behind the gateway, everything kept on the network volume.
#
#   bash /workspace/omnicave/repo/AI-7B/pod/demo_up.sh        start (first run installs, about 10 min)
#   bash /workspace/omnicave/repo/AI-7B/pod/demo_up.sh stop   stop both
#
# Everything lives under /workspace (the volume), so it survives Stop/Start: the venv, the model cache, the LoRA
# weights, data/pool.jsonl and the gateway key. On a fresh volume, bootstrap it once:
#   git clone --depth 1 https://github.com/enkhbold0519/omnicave /workspace/omnicave/repo
# Then copy data/pool.jsonl (PC1 only, not in git) to /workspace/omnicave/data/pool.jsonl. Without it the gateway
# still runs, but every debate gets the "no evidence" blocks.
#
# The gateway listens on port 8888, the only HTTP port the PyTorch template exposes (Jupyter is stopped). The backend
# then uses VLLM_BASE_URL=https://<pod-id>-8888.proxy.runpod.net/v1 and VLLM_API_KEY=<contents of the key file>.
# The pod id stays the same across Stop/Start, so the backend .env is set once. Only Terminate changes it.
set -euo pipefail
W=/workspace/omnicave
REPO=$W/repo/AI-7B
KEY_FILE=$W/gateway_key
PORT=${PORT:-8888}
MODEL=Qwen/Qwen2.5-7B-Instruct
LORA_URL=https://github.com/enkhbold0519/omnicave/releases/download/lora-7b-2026-11-16/omnicave-lora-7b-r16.zip
LORA_SHA=d3ad96804949f43420f81958a59262836ecb7cf1475d7918f567fa2a432e2c76
export HF_HOME=$W/hf HF_HUB_ENABLE_HF_TRANSFER=1 PIP_ROOT_USER_ACTION=ignore OMNICAVE_PERSONAS=$REPO/personas.json
mkdir -p "$W/data" "$W/logs"
cd "$W"

if [ "${1:-}" = "stop" ]; then
  pkill -f "python gateway.py" || true
  pkill -f "vllm serve" || true
  echo "stopped"
  exit 0
fi

[ -d "$REPO" ] || { echo "No repo at $W/repo. Run: git clone --depth 1 https://github.com/enkhbold0519/omnicave $W/repo"; exit 1; }
git -C "$W/repo" pull -q --ff-only || echo "(could not update the repo, using what is there)"

# 1. venv on the volume (first run only)
if [ ! -x "$W/venv/bin/vllm" ]; then
  echo "== installing vLLM into $W/venv (first run)"
  python3 -m venv "$W/venv" 2>/dev/null || { apt-get update -qq && apt-get install -y -qq python3-venv >/dev/null; python3 -m venv "$W/venv"; }
  "$W/venv/bin/pip" install -q -U pip
  "$W/venv/bin/pip" install -q vllm hf_transfer huggingface_hub ninja
fi
export PATH=$W/venv/bin:$PATH

# 2. model and LoRA weights on the volume (first run only)
if [ ! -f "$W/.model_ok" ]; then
  echo "== downloading $MODEL"
  hf download "$MODEL" --quiet
  touch "$W/.model_ok"
fi
if [ ! -d "$W/adapters/persona-power-critic" ]; then
  echo "== downloading the persona LoRAs"
  curl -sL -o "$W/lora.zip" "$LORA_URL"
  echo "$LORA_SHA  $W/lora.zip" | sha256sum -c - || { echo "LoRA zip checksum mismatch"; exit 1; }
  python -c "import zipfile; zipfile.ZipFile('$W/lora.zip').extractall('$W')"
  rm -f "$W/lora.zip"
fi
export HF_HUB_OFFLINE=1

# 3. gateway key: created once, then reused so the backend .env never changes
if [ ! -s "$KEY_FILE" ]; then
  (umask 077; python -c "import secrets; print(secrets.token_hex(16))" > "$KEY_FILE")
  echo "== new gateway key written to $KEY_FILE (put it in the backend .env as VLLM_API_KEY)"
fi
[ -f "$W/data/pool.jsonl" ] || echo "WARNING: $W/data/pool.jsonl is missing; debates will run without evidence"

# 4. vLLM (inside the pod only) and the gateway (public, with the key)
pkill -f "jupyter" || true
pkill -f "python gateway.py" || true
pkill -f "vllm serve" || true
sleep 3
mods=""
for d in "$W"/adapters/persona-*; do mods="$mods $(basename "$d")=$d"; done
setsid nohup vllm serve "$MODEL" --host 127.0.0.1 --port 8000 --enable-lora --max-lora-rank 16 --max-loras 4 \
  --max-model-len 4096 --lora-modules $mods > "$W/logs/vllm.log" 2>&1 < /dev/null &
echo "== starting vLLM (logs: $W/logs/vllm.log)"
for i in $(seq 1 120); do curl -sf http://127.0.0.1:8000/v1/models > /dev/null && break; sleep 5; done
curl -sf http://127.0.0.1:8000/v1/models > /dev/null || { echo "vLLM did not start"; tail -30 "$W/logs/vllm.log"; exit 1; }
cd "$REPO"
setsid nohup python gateway.py --port "$PORT" --api-key "$(cat "$KEY_FILE")" --pool "$W/data/pool.jsonl" \
  > "$W/logs/gateway.log" 2>&1 < /dev/null &
sleep 3
head -2 "$W/logs/gateway.log"
curl -s "http://127.0.0.1:$PORT/health"; echo
echo "== serving on port $PORT. Backend .env:"
echo "   VLLM_BASE_URL=https://${RUNPOD_POD_ID:-<pod-id>}-$PORT.proxy.runpod.net/v1"
echo "   VLLM_API_KEY=\$(cat $KEY_FILE)"
