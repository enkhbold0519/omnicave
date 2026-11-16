#!/usr/bin/env bash
# One-time setup on the RunPod pod: venv + packages + model downloads. Logs to /root/setup.log.
set -euo pipefail
export HF_HOME=/root/hf HF_HUB_ENABLE_HF_TRANSFER=1 PIP_ROOT_USER_ACTION=ignore
mkdir -p /root/omnicave /root/hf
echo "== venv $(date -Is)"
if ! python3 -m venv /root/venv 2>/dev/null; then
  apt-get update -qq && apt-get install -y -qq python3-venv >/dev/null
  python3 -m venv /root/venv
fi
source /root/venv/bin/activate
echo "== pip $(date -Is)"
pip install -q -U pip
pip install -q vllm peft accelerate hf_transfer huggingface_hub
python - <<'EOF'
import torch, transformers, peft, vllm
print("torch", torch.__version__, "cuda", torch.version.cuda, torch.cuda.is_available())
print("transformers", transformers.__version__, "peft", peft.__version__, "vllm", vllm.__version__)
EOF
pip freeze > /root/omnicave/pip-freeze.txt
echo "== download $(date -Is)"
hf download Qwen/Qwen2.5-7B-Instruct --quiet
hf download Qwen/Qwen2.5-32B-Instruct-AWQ --quiet
for m in Qwen/Qwen2.5-7B-Instruct Qwen/Qwen2.5-32B-Instruct-AWQ; do
  f=$(hf download "$m" LICENSE --quiet)
  grep -q "Apache License" "$f" && echo "$m: Apache-2.0" || { echo "$m: LICENSE is not Apache-2.0"; exit 1; }
done
du -sh /root/hf
echo "== done $(date -Is)"
