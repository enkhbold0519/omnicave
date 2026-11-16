#!/usr/bin/env bash
# Block until no process runs the given script, then print the last lines of its log.
# Usage: wait.sh <script.py> <logfile> [lines]
script=$1
log=$2
lines=${3:-40}
while pgrep -f "python ${script}" > /dev/null; do sleep 15; done
grep -vE 'WARNING|INFO|it/s\]|FutureWarning|warnings.warn' "/root/omnicave/${log}" | tail -n "$lines"
