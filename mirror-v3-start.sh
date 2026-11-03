#!/usr/bin/env bash
# Spike V3 (Babylon): sidecar :3739 + serve.py :8099. `./mirror-v3-start.sh manual` = sem motor. Parar: ./mirror-kill.sh
source "$(dirname "$0")/mirror-linux-common.sh"
start_sidecar
if port_up 8099; then echo "  [=] serve.py já a correr (:8099)"
else
  echo "  [+] serve.py (:8099), log em $LOGDIR/serve.log"
  (cd "$ROOT/spike-babylon" && nohup python serve.py 8099 >"$LOGDIR/serve.log" 2>&1 &)
  for _ in $(seq 20); do port_up 8099 && break; sleep 0.25; done
fi
if [ "$1" = "manual" ]; then open_url "http://127.0.0.1:8099/v2/index.html"
else open_url "http://127.0.0.1:8099/app/spike/v2/index.html?src=music"; fi
echo "Bola V3 aberta. Teclas: h HUD, k tuner do motor, d painel, w skin."
