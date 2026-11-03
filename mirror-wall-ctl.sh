#!/usr/bin/env bash
# Controlo do fundo vivo (usado pelo widget da barra e pelo launcher :3700).
#   mirror-wall-ctl.sh status|on [black|white]|off|toggle|skin|theme   (status: `off|black|white` + ` theme-ball|theme-noball` se o fundo segue o tema; `theme` roda off → on-ball → on-noball)
# Truque: liga/desliga = mudar o FUNDO do tema; o mirror-wall-watch.sh trata da bola e do sidecar.
BGDIR="$HOME/.config/omarchy/backgrounds/sakura-mochi"
STATE="${XDG_STATE_HOME:-$HOME/.local/state}/mirrorball"; mkdir -p "$STATE"
cur() { basename "$(readlink -f "$HOME/.local/state/omarchy/current/background" 2>/dev/null)"; }
base() { case "$(cur)" in mirrorball-black.*) echo black;; mirrorball-white.*) echo white;; *) echo off;; esac; }
tmode() { case "$(cat "$STATE/wall-themebg" 2>/dev/null)" in 1) echo ball;; 2) echo noball;; *) echo off;; esac; }   # fundo do tema: off | ball | noball
status() { local b t; b=$(base); t=$(tmode); [ "$t" = off ] && echo "$b" || echo "$b theme-$t"; }
last_skin() { cat "$STATE/wall-skin" 2>/dev/null || echo black; }
on() {
  local skin=${1:-$(last_skin)}; [ "$skin" = white ] || skin=black
  [ "$(base)" = off ] && readlink -f "$HOME/.local/state/omarchy/current/background" > "$STATE/wall-prev-bg"
  echo "$skin" > "$STATE/wall-skin"
  omarchy-theme-bg-set "$BGDIR/mirrorball-$skin.png"
}
off() {
  [ "$(base)" = off ] && return
  local prev; prev=$(cat "$STATE/wall-prev-bg" 2>/dev/null)
  if [ ! -f "$prev" ]; then   # sem fundo guardado: o 1.º fundo do tema
    prev=$(find -L "$HOME/.local/state/omarchy/current/theme/backgrounds" -maxdepth 1 -type f -print 2>/dev/null | sort | head -1)
  fi
  [ -f "$prev" ] && omarchy-theme-bg-set "$prev" || omarchy-theme-bg-next
}
case "$1" in
  status) status ;;
  on) on "$2" ;;
  off) off ;;
  toggle) [ "$(base)" = off ] && on || off ;;
  skin) s=$(base); [ "$s" = off ] && s=$(last_skin); [ "$s" = black ] && on white || on black ;;
  theme) n=$(case "$(tmode)" in off) echo 1;; ball) echo 2;; *) echo 0;; esac)   # ler ANTES de escrever (o > trunca o ficheiro)
         echo "$n" > "$STATE/wall-themebg"
         s=$(base); [ "$s" != off ] && "$(dirname "${BASH_SOURCE[0]}")/mirror-wall.sh" on "$s" ;;   # relança já com o novo fundo
  *) echo "uso: $0 status|on [black|white]|off|toggle|skin|theme"; exit 2 ;;
esac
