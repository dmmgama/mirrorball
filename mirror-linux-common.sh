#!/usr/bin/env bash
# Partilhado pelos mirror-*.sh (Linux). Não correr diretamente.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SIDECAR="$ROOT/audio-sidecar"
LOGDIR="${XDG_STATE_HOME:-$HOME/.local/state}/mirrorball"; mkdir -p "$LOGDIR"

port_up() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

open_url() {
  if command -v xdg-open >/dev/null; then xdg-open "$1" >/dev/null 2>&1 &
  else echo "  abre no browser: $1"; fi
}

start_sidecar() {
  if port_up 3739; then echo "  [=] audio-sidecar já a correr (:3739)"; return; fi
  command -v node >/dev/null || { echo "  [!] falta o node: sudo pacman -S nodejs npm"; exit 1; }
  if [ ! -d "$SIDECAR/node_modules/ws" ]; then
    echo "  [+] npm install (sidecar, 1ª vez)..."
    (cd "$SIDECAR" && npm install --omit=optional --no-audit --no-fund) || exit 1
  fi
  command -v parec >/dev/null || command -v pw-record >/dev/null || \
    echo "  [!] nem parec nem pw-record no PATH — sem áudio. sudo pacman -S libpulse (parec) ou pipewire (pw-record)"
  echo "  [+] audio-sidecar (:3739), log em $LOGDIR/sidecar.log"
  (cd "$SIDECAR" && AUDIO_APP_DIR="$ROOT/web" nohup node server.js >"$LOGDIR/sidecar.log" 2>&1 &)
  for _ in $(seq 20); do port_up 3739 && return; sleep 0.25; done
  echo "  [!] o sidecar não abriu a porta 3739 — ver $LOGDIR/sidecar.log"; exit 1
}
