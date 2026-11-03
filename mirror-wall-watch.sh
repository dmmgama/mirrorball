#!/usr/bin/env bash
# Vigia o fundo atual do Omarchy. mirrorball-black.* / mirrorball-white.* ligam a bola + sidecar;
# qualquer outro fundo desliga. Idempotente (só uma instância).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIR="$HOME/.local/state/omarchy/current"
exec 9>"${XDG_RUNTIME_DIR:-/tmp}/mirror-wall-watch.lock"; flock -n 9 || exit 0
apply() {
  local t; t=$(basename "$(readlink -f "$DIR/background" 2>/dev/null)")
  case "$t" in
    mirrorball-black.*) "$ROOT/mirror-wall.sh" on black ;;
    mirrorball-white.*) "$ROOT/mirror-wall.sh" on white ;;
    *) "$ROOT/mirror-wall.sh" off ;;
  esac
}
last=$(readlink "$DIR/background"); apply
inotifywait -m -q -e create -e moved_to -e delete "$DIR" --format '%f' | while read -r f; do
  [ "$f" = background ] || continue
  sleep 0.3; cur=$(readlink "$DIR/background"); [ "$cur" = "$last" ] && continue; last=$cur; apply
done
