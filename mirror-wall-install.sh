#!/usr/bin/env bash
# Instala/remove o fundo vivo (bola preta/branca) no Omarchy. Ver docs/omarchy-wall-os.md.
#   ./mirror-wall-install.sh install    compila, cria os 2 fundos e o hook de arranque, lança o watcher
#   ./mirror-wall-install.sh uninstall  pára tudo e apaga o que o install pôs FORA desta repo
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
THEME=sakura-mochi
BGDIR="$HOME/.config/omarchy/backgrounds/$THEME"
HOOK="$HOME/.config/omarchy/hooks/post-boot.d/mirrorball-wall"
PLUGIN_ID=mirrorball.wall
PLUGIN_DIR="$HOME/.config/omarchy/plugins/$PLUGIN_ID"
case "$1" in
  install)
    (cd "$ROOT/wall" && qmake6 && make -j"$(nproc)") || { echo "falhou a compilação (precisa de qt6-webengine, layer-shell-qt, qt6-declarative)"; exit 1; }
    mkdir -p "$BGDIR" "$(dirname "$HOOK")"
    ffmpeg -loglevel error -y -f lavfi -i color=c=0x0a0a0a:s=1920x1080 -frames:v 1 "$BGDIR/mirrorball-black.png"
    ffmpeg -loglevel error -y -f lavfi -i color=c=0xf3f7f9:s=1920x1080 -frames:v 1 "$BGDIR/mirrorball-white.png"
    printf '#!/bin/bash\nsetsid nohup "%s/mirror-wall-watch.sh" >/dev/null 2>&1 &\n' "$ROOT" > "$HOOK"
    (setsid nohup "$ROOT/mirror-wall-watch.sh" >/dev/null 2>&1 &)
    mkdir -p "$PLUGIN_DIR" && cp "$ROOT/omarchy-plugin/$PLUGIN_ID/"* "$PLUGIN_DIR/" && sed -i "s|@CTL@|$ROOT/mirror-wall-ctl.sh|" "$PLUGIN_DIR/Wall.qml"
    [ -f "$HOME/.config/omarchy/shell.json" ] && cp -n "$HOME/.config/omarchy/shell.json" "$HOME/.config/omarchy/shell.json.pre-mirrorball"
    omarchy-shell shell rescanPlugins; sleep 1
    omarchy plugin enable "$PLUGIN_ID" --section right
    echo "instalado. Muda o fundo para mirrorball-black/white (omarchy theme bg next)." ;;
  uninstall)
    pkill -f "$ROOT/mirror-wall-watch.sh"; "$ROOT/mirror-wall.sh" off
    omarchy plugin disable "$PLUGIN_ID"; rm -rf "$PLUGIN_DIR"
    rm -f "$HOOK" "$BGDIR"/mirrorball-black.png "$BGDIR"/mirrorball-white.png
    rmdir "$BGDIR" 2>/dev/null
    cur=$(readlink -f "$HOME/.local/state/omarchy/current/background" 2>/dev/null)
    case "$cur" in *mirrorball-*) omarchy-theme-bg-next ;; esac   # não deixar o fundo apontar para um ficheiro apagado
    echo "removido (a repo fica intacta; apaga wall/mirror-wall se quiseres)." ;;
  *) echo "uso: $0 install|uninstall"; exit 2 ;;
esac
