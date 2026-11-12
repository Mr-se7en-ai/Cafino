#!/usr/bin/env bash
# بنچمارک بار واقعی: mode=before (مهاجرت تا 004، بدون cache گزارش) | after (همهٔ مهاجرت‌ها + cache)
# bash bench/run.sh <mode> <outdir> [scale] [dur] [think]
set -euo pipefail
MODE=$1; OUT=$2; SCALE=${3:-1}; DUR=${4:-30s}; THINK=${5:-0.2}
K6=${K6:-/opt/k6x/k6}; PORT=3911; mkdir -p "$OUT"
cd "$(dirname "$0")/.."
case "$MODE" in before) UPTO="004"; CACHE=0;; idx) UPTO=""; CACHE=0;; *) UPTO=""; CACHE=15000;; esac   # before=بدون ایندکس/cache  idx=ایندکس بدون cache  after=ایندکس+cache
rm -f "$OUT/$MODE.samples.jsonl"
node bench/serve.mjs --upto "$UPTO" --cache "$CACHE" --scale "$SCALE" --port $PORT --creds "$OUT/$MODE.creds.json" --samples "$OUT/$MODE.samples.jsonl" > "$OUT/$MODE.serve.log" 2>&1 &
SP=$!
for i in $(seq 1 120); do grep -q READY "$OUT/$MODE.serve.log" 2>/dev/null && break; sleep 1; done
grep -q READY "$OUT/$MODE.serve.log" || { echo "server not ready"; kill $SP; exit 1; }
for V in 10 50 100; do
  S=$(date +%s%3N)
  $K6 run -q -e BASE=http://127.0.0.1:$PORT -e VUS=$V -e DUR=$DUR -e THINK=$THINK -e CREDS="$OUT/$MODE.creds.json" --summary-export "$OUT/$MODE.vus$V.json" bench/load.k6.js > "$OUT/$MODE.vus$V.txt" 2>&1 || true
  E=$(date +%s%3N); echo "{\"vus\":$V,\"from\":$S,\"to\":$E}" >> "$OUT/$MODE.windows.jsonl"
  sleep 3
done
kill -TERM $SP; wait $SP 2>/dev/null || true
