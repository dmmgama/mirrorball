#!/usr/bin/env bash
# Vigia o fundo atual do Omarchy. mirrorball-black.* / mirrorball-white.* ligam a bola + sidecar;
# qualquer outro fundo desliga. Idempotente (só uma instância).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIR="$HOME/.local/state/omarchy/current"
exec 9>"${XDG_RUNTIME_DIR:-/tmp}/mirror-wall-watch.lock"; flock -n 9 || exit 0
apply() {
  local t; t=$(basename "$(readlink -f "$DIR/background" 2>/dev/null)")
  case "$t" in
    mirrorball-black.*) "$ROOT/mirror-wall.sh" on black 9>&- ;;
    mirrorball-white.*) "$ROOT/mirror-wall.sh" on white 9>&- ;;
    *) "$ROOT/mirror-wall.sh" off 9>&- ;;
  esac
}
last=$(readlink "$DIR/background"); apply
# 9>&-: o inotifywait não herda o lock (senão sobrevive ao watcher e impede o seguinte de arrancar)
inotifywait -m -q -e create -e moved_to -e delete "$DIR" --format '%f' 9>&- | while read -r f; do
  [ "$f" = background ] || continue
  sleep 0.3; cur=$(readlink "$DIR/background"); [ "$cur" = "$last" ] && continue; last=$cur; apply
done
