# Correr a bola em Linux (Omarchy / Arch + PipeWire)

Branch `mirrorball-linux`. O sidecar de áudio vem copiado para `audio-sidecar/` (origem:
`agent-os/audio-sidecar/server.js`). Em Linux, captura o monitor da saída de som por omissão com
`parec` (ou com `pw-record`, se o primeiro falhar) e não usa o WASAPI. O formato é o mesmo
(s16le, estéreo, 48 kHz) e o contrato das features é igual ao do Windows.

## Uma vez

```bash
sudo pacman -S --needed git nodejs npm python libpulse   # libpulse = parec (pipewire-pulse já vem no Omarchy)
git clone -b mirrorball-linux https://github.com/dmmgama/mirrorball.git
cd mirrorball
```
O `npm install` do sidecar faz-se sozinho no primeiro arranque (`--omit=optional`, que salta o
addon WASAPI).

## Correr

| | |
|---|---|
| Bola 2D, música | `./mirror-2d-start.sh` → `http://127.0.0.1:3739/app/index-v2.html?src=music` |
| V3 (Babylon), música | `./mirror-v3-start.sh` → `http://127.0.0.1:8099/app/spike/v2/index.html?src=music` |
| V3 manual | `./mirror-v3-start.sh manual` |
| Parar tudo | `./mirror-kill.sh` |

Logs: `~/.local/state/mirrorball/sidecar.log` e `serve.log`.

## Afinação

A `web/music-config.json` que vem no git é a versão commitada. Para levar a afinação ao vivo do
Windows, copia o ficheiro de lá para `web/`.

## Se não houver áudio (HUD `m` parado, `silence` sempre ligado)

1. Confirmar que o monitor tem som: `parec -d @DEFAULT_MONITOR@ --raw | head -c 400000 | od -An -tx2 | sort -u | head`.
   Se só aparecerem zeros, o som está a sair por outro sink. Escolhe a saída certa no `wiremix`/`pavucontrol`.
2. Forçar outro comando: `AUDIO_CAPTURE_CMD='pw-record -P "{ stream.capture.sink=true }" --format s16 --rate 48000 --channels 2 -' ./mirror-2d-start.sh`
   (tem de escrever s16le/48k/estéreo no stdout). Para o comando ser aplicado, é preciso parar o sidecar antes (`./mirror-kill.sh`).
3. Se o processo de captura morrer, o watcher do sidecar volta a lançá-lo ao fim de 3 s. Também
   volta a lançá-lo a cada 15 s quando só chegam zeros (por exemplo, depois de trocares a saída de som).

## Manter em sincronia com o agent-os

Este `server.js` é uma cópia. Se o original mudar (`agent-os/audio-sidecar/server.js`), é preciso
voltar a aplicar o diff: `startLinuxCapture` + `IS_WIN` + `APP_DIR` relativo. O cabeçalho do ficheiro lista as diferenças.
