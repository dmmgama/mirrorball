#!/usr/bin/env bash
# Fundo vivo do Omarchy: ./mirror-wall.sh on black|white   |   ./mirror-wall.sh off
# on  = sidecar (:3739) + bola 2D layer-shell (wall/mirror-wall) com a skin pedida.
# off = fecha a bola e o sidecar. Quem chama é o mirror-wall-watch.sh (muda o fundo do tema).
source "$(dirname "${BASH_SOURCE[0]}")/mirror-linux-common.sh"
BIN="$ROOT/wall/mirror-wall"
stop_wall() { pkill -x mirror-wall 2>/dev/null; }
stop_sidecar() { pids=$(ss -ltnpH "sport = :3739" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u); [ -n "$pids" ] && kill $pids; }
case "$1" in
  on)
    skin=${2:-black}; [ "$skin" = white ] || skin=dark
    [ -x "$BIN" ] || { echo "falta compilar: (cd wall && qmake6 && make)"; exit 1; }
    start_sidecar
    stop_wall; sleep 0.3
    extra=""   # modo tema (flag em $LOGDIR/wall-themebg): fundo com a cor do tema do Omarchy
    tb=$(cat "$LOGDIR/wall-themebg" 2>/dev/null)   # 0 off | 1 on-ball | 2 on-noball
    if [ "$tb" = 1 ] || [ "$tb" = 2 ]; then
      c=$("$ROOT/mirror-wall-ctl.sh" color 2>/dev/null)   # tom escolhido da paleta do tema (hex sem #)
      [ -n "$c" ] && extra="&bgcolor=$c"; [ "$tb" = 2 ] && extra="$extra&bgmode=noball"
    fi
    (setsid nohup "$BIN" "http://127.0.0.1:3739/app/index-v2.html?src=music&wall=1&skin=$skin$extra" >"$LOGDIR/wall.log" 2>&1 &)
    ;;
  off) stop_wall; stop_sidecar ;;
  *) echo "uso: $0 on black|white | off"; exit 2 ;;
esac
