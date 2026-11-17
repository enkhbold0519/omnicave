#!/usr/bin/env bash
# Test/demo session: start vLLM with the 4 persona LoRAs (reachable only inside the pod) and the gateway
# in front of it (public, port 8001). Both keep running after the SSH session closes.
#   GATEWAY_API_KEY=<secret> ./serve.sh     start; the pod must expose HTTP port 8001
#   ./serve.sh stop                         stop both
# The backend then uses  VLLM_BASE_URL=https://<pod-id>-8001.proxy.runpod.net/v1  and  VLLM_API_KEY=<secret>.
# Needs in /root/omnicave: adapters/, personas.json, prompts.py, evidence7b.py, gateway.py, data/pool.jsonl.
cd /root/omnicave
export PATH=/root/venv/bin:$PATH HF_HOME=/root/hf HF_HUB_OFFLINE=1 OMNICAVE_PERSONAS=/root/omnicave/personas.json
if [ "$1" = "stop" ]; then
  for f in gateway.pid vllm.pid; do [ -f $f ] && kill "$(cat $f)" 2>/dev/null; rm -f $f; done
  echo "stopped"
  exit 0
fi
mods=""
for d in adapters/persona-*; do mods="$mods $(basename "$d")=$PWD/$d"; done
setsid nohup vllm serve Qwen/Qwen2.5-7B-Instruct --host 127.0.0.1 --port 8000 --enable-lora --max-lora-rank 16 \
  --max-loras 4 --max-model-len 4096 --lora-modules $mods > vllm_serve.log 2>&1 < /dev/null &
echo $! > vllm.pid
for i in $(seq 1 120); do
  curl -sf http://127.0.0.1:8000/v1/models > /dev/null && break
  sleep 5
done
curl -sf http://127.0.0.1:8000/v1/models > /dev/null || { echo "vLLM did not start, see vllm_serve.log"; exit 1; }
setsid nohup python gateway.py --port 8001 > gateway.log 2>&1 < /dev/null &
echo $! > gateway.pid
sleep 2
curl -s http://127.0.0.1:8001/health
echo
echo "== serving: gateway :8001 -> vLLM :8000 (logs: gateway.log, vllm_serve.log)"
