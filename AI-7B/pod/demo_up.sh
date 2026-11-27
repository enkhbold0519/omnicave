#!/usr/bin/env bash
# Demo pod: vLLM (Qwen2.5-7B + the 4 persona LoRAs) behind the gateway.
#
#   bash demo_up.sh        start (about 6-8 min: installs vLLM, downloads the model and LoRAs, starts both)
#   bash demo_up.sh stop   stop both
#
# Run it after every Start of the pod. Get the script onto a fresh container with
#   curl -sLO https://raw.githubusercontent.com/enkhbold0519/omnicave/main/AI-7B/pod/demo_up.sh
#
# The network volume on /workspace is S3-backed (geesefs): no chmod, no executable files, slow for many small
# files. So it keeps only plain files that must survive Stop/Start:
#   /workspace/omnicave/gateway_key      the API key (created once; the backend .env uses it)
#   /workspace/omnicave/data/pool.jsonl  debate evidence (PC1 only, not in git; without it debates get the
#                                        "no evidence" blocks)
#   /workspace/omnicave/logs/            vLLM and gateway logs
# Everything else (repo, venv, model, LoRA weights) goes to the container disk under /root/omnicave and is
# rebuilt on each start.
#
# The gateway listens on port 8888, the only HTTP port the PyTorch template exposes (Jupyter is stopped). The backend
# uses VLLM_BASE_URL=https://<pod-id>-8888.proxy.runpod.net/v1 and VLLM_API_KEY=<contents of gateway_key>. The pod
# id stays the same across Stop/Start, so the backend .env is set once. Only Terminate changes it.
set -euo pipefail
V=/workspace/omnicave            # persistent, plain files only
R=/root/omnicave                 # container disk, rebuilt after each Start
KEY_FILE=$V/gateway_key
PORT=${PORT:-8888}
MODEL=Qwen/Qwen2.5-7B-Instruct
LORA_URL=https://github.com/enkhbold0519/omnicave/releases/download/lora-7b-2026-11-16/omnicave-lora-7b-r16.zip
LORA_SHA=d3ad96804949f43420f81958a59262836ecb7cf1475d7918f567fa2a432e2c76
export HF_HOME=$R/hf HF_HUB_ENABLE_HF_TRANSFER=1 PIP_ROOT_USER_ACTION=ignore OMNICAVE_PERSONAS=$R/repo/AI-7B/personas.json
mkdir -p "$V/data" "$V/logs" "$R"

if [ "${1:-}" = "stop" ]; then
  pkill -f "python gateway.py" || true
  pkill -f "vllm serve" || true
  echo "stopped"
  exit 0
fi

# 1. repo (for gateway.py, prompts.py, evidence7b.py, personas.json)
if [ -d "$R/repo/.git" ]; then git -C "$R/repo" pull -q --ff-only || true
else git clone -q --depth 1 https://github.com/enkhbold0519/omnicave "$R/repo"; fi

# 2. venv with vLLM
if [ ! -x "$R/venv/bin/vllm" ]; then
  echo "== installing vLLM ($(date -Is))"
  python3 -m venv "$R/venv" 2>/dev/null || { apt-get update -qq && apt-get install -y -qq python3-venv >/dev/null; python3 -m venv "$R/venv"; }
  "$R/venv/bin/pip" install -q -U pip
  "$R/venv/bin/pip" install -q vllm hf_transfer huggingface_hub ninja
fi
export PATH=$R/venv/bin:$PATH

# 3. model and LoRA weights
echo "== downloading $MODEL ($(date -Is))"
hf download "$MODEL" --quiet
if [ ! -d "$R/adapters/persona-power-critic" ]; then
  echo "== downloading the persona LoRAs"
  curl -sL -o "$R/lora.zip" "$LORA_URL"
  echo "$LORA_SHA  $R/lora.zip" | sha256sum -c - || { echo "LoRA zip checksum mismatch"; exit 1; }
  python -c "import zipfile; zipfile.ZipFile('$R/lora.zip').extractall('$R')"
  rm -f "$R/lora.zip"
fi
export HF_HUB_OFFLINE=1

# 4. gateway key: created once on the volume, then reused so the backend .env never changes
if [ ! -s "$KEY_FILE" ]; then
  python -c "import secrets; print(secrets.token_hex(16))" > "$KEY_FILE"
  echo "== new gateway key written to $KEY_FILE (put it in the backend .env as VLLM_API_KEY)"
fi
[ -f "$V/data/pool.jsonl" ] || echo "WARNING: $V/data/pool.jsonl is missing; debates will run without evidence"

# 5. vLLM (inside the pod only) and the gateway (public, with the key)
pkill -f "jupyter" || true
pkill -f "python gateway.py" || true
pkill -f "vllm serve" || true
sleep 3
mods=""
for d in "$R"/adapters/persona-*; do mods="$mods $(basename "$d")=$d"; done
setsid nohup vllm serve "$MODEL" --host 127.0.0.1 --port 8000 --enable-lora --max-lora-rank 16 --max-loras 4 \
  --max-model-len 4096 --lora-modules $mods > "$V/logs/vllm.log" 2>&1 < /dev/null &
echo "== starting vLLM ($(date -Is))"
for i in $(seq 1 120); do curl -sf http://127.0.0.1:8000/v1/models > /dev/null && break; sleep 5; done
curl -sf http://127.0.0.1:8000/v1/models > /dev/null || { echo "vLLM did not start"; tail -30 "$V/logs/vllm.log"; exit 1; }
cd "$R/repo/AI-7B"
setsid nohup python gateway.py --port "$PORT" --api-key "$(cat "$KEY_FILE")" --pool "$V/data/pool.jsonl" \
  > "$V/logs/gateway.log" 2>&1 < /dev/null &
sleep 3
head -2 "$V/logs/gateway.log"
curl -s "http://127.0.0.1:$PORT/health"; echo
echo "== serving on port $PORT ($(date -Is)). Backend .env:"
echo "   VLLM_BASE_URL=https://${RUNPOD_POD_ID:-<pod-id>}-$PORT.proxy.runpod.net/v1"
echo "   VLLM_API_KEY=\$(cat $KEY_FILE)"
