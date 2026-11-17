#!/usr/bin/env bash
# Start vLLM with the 4 persona LoRAs, wait until ready, stream one turn per persona, stop the server.
cd /root/omnicave
export PATH=/root/venv/bin:$PATH HF_HOME=/root/hf HF_HUB_OFFLINE=1 OMNICAVE_PERSONAS=/root/omnicave/personas.json
mods=""
for d in adapters/persona-*; do mods="$mods $(basename "$d")=$PWD/$d"; done
vllm serve Qwen/Qwen2.5-7B-Instruct --port 8000 --enable-lora --max-lora-rank 16 --max-loras 4 \
  --max-model-len 4096 --lora-modules $mods > vllm_serve.log 2>&1 &
pid=$!
for i in $(seq 1 120); do
  curl -sf http://127.0.0.1:8000/v1/models > /dev/null && break
  sleep 5
done
python serve_check7b.py --url http://127.0.0.1:8000/v1
python serve_check7b.py --url http://127.0.0.1:8000/v1 | grep 'max TTFT'
kill $pid
wait $pid 2>/dev/null
echo "== serve check done"
