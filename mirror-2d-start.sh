#!/usr/bin/env bash
# Bola 2D (web/index-v2.html) em modo música, servida pelo sidecar em :3739/app/. Parar: ./mirror-kill.sh
source "$(dirname "$0")/mirror-linux-common.sh"
start_sidecar
open_url "http://127.0.0.1:3739/app/index-v2.html?src=music"
echo "Bola 2D aberta. Teclas: m HUD do motor, p perfil, w skin, d sliders."
