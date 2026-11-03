# READ-ME — correr a bola no Linux (Omarchy)

> Branch `mirrorball-linux`. O que mudou face ao Windows, e porquê, está em
> [`mirrorball-linux.md`](mirrorball-linux.md).

## Atalho (já está instalado no `ai-host-omarchy`)

```bash
cd ~/Projects/David/Mirrorball-Hub/mirrorball-linux
git pull                      # traz o que houver de novo no GitHub
./mirror-2d-start.sh          # bola 2D com música  (ou ./mirror-v3-start.sh para a V3)
./mirror-kill.sh              # parar
```
Põe música a tocar no PC antes de abrir. No browser, a tecla `m` abre o HUD do motor: a linha
BOMBO tem de mexer. Se não mexer, ver "Se não houver áudio", mais abaixo.

Antes do primeiro teste: a saída de som por omissão do Omarchy é a digital (`iec958`, S/PDIF).
Se as colunas estiverem noutra saída, escolhe-a no `wiremix`/`pavucontrol`. Senão o sidecar ouve
a saída errada e só recebe zeros.

---

Branch `mirrorball-linux`. O sidecar de áudio vem copiado para `audio-sidecar/` (origem:
`agent-os/audio-sidecar/server.js`). Em Linux, captura o monitor da saída de som por omissão com
`parec` (ou com `pw-record`, se o primeiro falhar) e não usa o WASAPI. O formato é o mesmo
(s16le, estéreo, 48 kHz) e o contrato das features é igual ao do Windows.

## Instalar noutra máquina Linux (uma vez)

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

A `web/music-config.json` deste branch traz a afinação ao vivo do David, copiada do Windows a
2026-11-03. Se a afinação mudar numa das máquinas, faz commit e pull para a levar à outra.

## Se não houver áudio (HUD `m` parado, `silence` sempre ligado)

1. Confirmar que o monitor tem som: `parec -d @DEFAULT_MONITOR@ --raw | head -c 400000 | od -An -tx2 | sort -u | head`.
   Se só aparecerem zeros, o som está a sair por outro sink. Escolhe a saída certa no `wiremix`/`pavucontrol`.
2. Forçar outro comando: `AUDIO_CAPTURE_CMD='pw-record -P "{ stream.capture.sink=true }" --format s16 --rate 48000 --channels 2 -' ./mirror-2d-start.sh`
   (tem de escrever s16le/48k/estéreo no stdout). Para o comando ser aplicado, é preciso parar o sidecar antes (`./mirror-kill.sh`).
3. Se o processo de captura morrer, o watcher do sidecar volta a lançá-lo ao fim de 3 s. Também
   volta a lançá-lo a cada 15 s quando só chegam zeros (por exemplo, depois de trocares a saída de som).

## Manter em sincronia

Ver [`mirrorball-linux.md`](mirrorball-linux.md) §Sincronizar.
