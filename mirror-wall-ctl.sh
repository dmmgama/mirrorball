#!/usr/bin/env bash
# Controlo do fundo vivo (usado pelo widget da barra e pelo launcher :3700).
#   mirror-wall-ctl.sh status|on [black|white]|off|toggle|skin|theme|tone|beams   (status: `off|black|white` + ` theme-ball|theme-noball` se o fundo segue o tema; `theme` roda off → on-ball → on-noball)
# Truque: liga/desliga = mudar o FUNDO do tema; o mirror-wall-watch.sh trata da bola e do sidecar.
BGDIR="$HOME/.config/omarchy/backgrounds/sakura-mochi"
STATE="${XDG_STATE_HOME:-$HOME/.local/state}/mirrorball"; mkdir -p "$STATE"
cur() { basename "$(readlink -f "$HOME/.local/state/omarchy/current/background" 2>/dev/null)"; }
base() { case "$(cur)" in mirrorball-black.*) echo black;; mirrorball-white.*) echo white;; *) echo off;; esac; }
tmode() { case "$(cat "$STATE/wall-themebg" 2>/dev/null)" in 1) echo ball;; 2) echo noball;; *) echo off;; esac; }   # fundo do tema: off | ball | noball
# Paleta do tema atual: "nome #hex", sem cores repetidas; `background` primeiro (tom 0), o resto pela ordem do colors.toml
palette() {
  local f="$HOME/.local/state/omarchy/current/theme/colors.toml"
  { grep -m1 '^background *= *"#' "$f"; grep '^[a-z_0-9]* *= *"#[0-9a-fA-F]\{6\}"' "$f"; } 2>/dev/null \
    | sed 's/^\([a-z_0-9]*\) *= *"\(#[0-9a-fA-F]\{6\}\)".*/\1 \2/' | awk '!seen[$2]++'
}
tone_idx() { local n i; n=$(palette | wc -l); i=$(cat "$STATE/wall-themetone" 2>/dev/null || echo 0); [ "$n" -gt 0 ] && echo $(( i % n )) || echo 0; }
tone() { palette | sed -n "$(( $(tone_idx) + 1 ))p"; }   # "nome #hex"
beams() { [ "$(cat "$STATE/wall-beams" 2>/dev/null)" = 1 ] && echo flip || echo same; }   # feixes (e tudo fora da bola) com o tom da skin oposta
status() { local b t o; b=$(base); t=$(tmode); o=$(tone); [ "$t" = off ] && echo "$b tone=${o%% *}:${o##* } beams=$(beams)" || echo "$b theme-$t tone=${o%% *}:${o##* } beams=$(beams)"; }
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
  beams) n=$([ "$(beams)" = flip ] && echo 0 || echo 1); echo "$n" > "$STATE/wall-beams"
         s=$(base); [ "$s" != off ] && "$(dirname "${BASH_SOURCE[0]}")/mirror-wall.sh" on "$s" ;;
  color) tone | cut -d' ' -f2 | tr -d '#' ;;
  tone) echo $(( $(tone_idx) + 1 )) > "$STATE/wall-themetone"
        s=$(base); [ "$s" != off ] && [ "$(tmode)" != off ] && "$(dirname "${BASH_SOURCE[0]}")/mirror-wall.sh" on "$s" ;;   # relança com o novo tom
  *) echo "uso: $0 status|on [black|white]|off|toggle|skin|theme|tone|beams|color"; exit 2 ;;
esac
