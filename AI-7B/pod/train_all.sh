#!/usr/bin/env bash
# Rebalance -> train the 4 persona LoRAs on Qwen2.5-7B -> evaluate. Logs to /root/omnicave/pipeline.log.
set -euo pipefail
cd /root/omnicave
export PATH=/root/venv/bin:$PATH HF_HOME=/root/hf HF_HUB_OFFLINE=1 OMNICAVE_PERSONAS=/root/omnicave/personas.json
echo "== rebalance $(date -Is)"
python rebalance.py --max-share 0.35
echo "== train $(date -Is)"
python lora/train.py --persona all --model Qwen/Qwen2.5-7B-Instruct --data-dir data --out-dir adapters \
  --r 16 --alpha 32 --dropout 0.05 --lr 2e-4 --epochs 3 --batch 8 --grad-accum 2 --max-len 1536
echo "== eval $(date -Is)"
python eval7b.py --limit 40
echo "== done $(date -Is)"
