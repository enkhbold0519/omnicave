#!/usr/bin/env bash
# Run a Python script from /root/omnicave in the background with the venv, model cache and persona file.
# Usage: run.sh <logfile> <script.py> [args...]   (returns immediately; the job survives the SSH session)
cd /root/omnicave
export PATH=/root/venv/bin:$PATH HF_HOME=/root/hf HF_HUB_OFFLINE=1 OMNICAVE_PERSONAS=/root/omnicave/personas.json
log=$1
shift
setsid nohup python "$@" > "$log" 2>&1 < /dev/null &
echo "started pid $! -> $log"
