# mirrorball-linux — o que muda para Linux (exclusivo deste branch)

Branch `mirrorball-linux`, criado a 2026-11-03 a partir do `Mirror-Ball-V3` @ `9eb3e7e`.

**Onde vive:**
- Windows: worktree `../MirrorBall-linux`.
- Linux: clone em `~/Projects/David/Mirrorball-Hub/mirrorball-linux` no `ai-host-omarchy`
  (Tailscale, utilizador `dmmgama`).

Como correr: [`README-linux.md`](README-linux.md).

## Porque é preciso

A bola (2D e V3) é só HTML/JS e funciona em qualquer browser. O que prendia o projeto ao Windows
era o **audio-sidecar** (`agent-os/audio-sidecar`, porta 3739), por três razões:

1. Capturava o som do sistema com `loopback-capture`, um addon nativo WASAPI que só existe em
   Windows.
2. O caminho da pasta `web/` servida em `/app/` estava escrito à mão em formato Windows.
3. Vivia noutra repo (agent-os) e arrancava pelos `.bat`.

## Alterações (só existem neste branch)

| Ficheiro | O quê |
|---|---|
| `audio-sidecar/server.js` | **Cópia** de `agent-os/audio-sidecar/server.js` com 3 diferenças (abaixo). |
| `audio-sidecar/package.json` | `loopback-capture` passa para `optionalDependencies`. Em Linux instala-se com `npm install --omit=optional`. |
| `mirror-linux-common.sh` | Funções partilhadas: deteta portas, faz `npm install` na 1.ª vez, arranca o sidecar com `nohup` e escreve os logs em `~/.local/state/mirrorball/`. |
| `mirror-2d-start.sh` | Equivalente ao `Mirror-2D-Start.bat`: sidecar e bola 2D em `:3739/app/index-v2.html?src=music`. |
| `mirror-v3-start.sh` | Equivalente ao `Mirror-V3-Start.bat`: sidecar, `serve.py` em :8099 e a V3. O argumento `manual` abre sem motor. |
| `mirror-kill.sh` | Equivalente ao `Mirror-V3-Kill.bat`. Usa SIGTERM (via `ss`), por isso o sidecar fecha limpo e apaga o token e o pid. |
| `README-linux.md` | Como correr e o que fazer se não houver áudio. |
| `README.md`, `CLAUDE.md` | Avisos de que este é o branch Linux. |
| `web/music-config.json` | Afinação ao vivo do David, commitada aqui de propósito (no `Mirror-Ball-V3` não se commita) para chegar à máquina Linux. |

### As 3 diferenças no `server.js`

1. **Captura em Linux por processo externo.** `startLinuxCapture()` lança, por esta ordem:
   - `AUDIO_CAPTURE_CMD`, se estiver definido (override: um comando qualquer que escreva
     s16le/48 kHz/estéreo no stdout);
   - `parec -d @DEFAULT_MONITOR@ --format=s16le --rate=48000 --channels=2 --raw`
     (pipewire-pulse);
   - `pw-record -P '{ stream.capture.sink=true }' ...`, se o `parec` não arrancar.

   O stdout vai direto para o `handlePcmChunk()` que já existia. O formato é idêntico ao do
   WASAPI, por isso **o pipeline de features e o contrato com o `music.js` ficam iguais**. Se o
   processo morrer, o watcher que já existia relança-o: ao fim de 3 s sem buffers, ou a cada 15 s
   enquanto só chegarem zeros.
2. **WASAPI só em Windows.** `const loopback = IS_WIN ? require('loopback-capture') : null`. Em
   Windows o comportamento é o de antes.
3. **`APP_DIR` relativo.** Por omissão é `path.join(__dirname, '..', 'web')`, isto é, a `web/`
   desta checkout. Continua a aceitar `AUDIO_APP_DIR`. Isto também resolve o bug antigo das
   worktrees: o `.bat` servia sempre a `web/` da checkout principal.

Tudo o resto (`web/`, `spike-babylon/`, motor, knobs) é **igual ao `Mirror-Ball-V3`**.

## Verificação feita (2026-11-03)

- **Windows, caminho Linux simulado** (`process.platform` forçado, um gerador de bombo a 120 bpm
  no lugar do `parec`): 50 msg/s, sem `silence`, `subOnset` no ritmo do bombo, `/app/` serve 200.
- **Omarchy, a sério:** o `parec` arranca e chegam 99 msg em 2 s sem `silence`. O `rms` deu 0
  porque não havia música a tocar. **Falta o teste com música** (HUD `m`, linha BOMBO).

## Sincronizar

- **Mudanças na bola/motor:** fazem-se no `Mirror-Ball-V3` e trazem-se para aqui com
  `git merge Mirror-Ball-V3`. Os ficheiros acima não existem lá, por isso não há conflitos, exceto
  em `README.md`, `CLAUDE.md` e `music-config.json`.
- **Mudanças no sidecar do agent-os:** este `server.js` é uma cópia e **não acompanha o original
  sozinho**. Para atualizar, copia o original por cima e volta a aplicar as 3 diferenças. O
  cabeçalho do ficheiro lista-as. Para ver o que mudou:
  `diff <agent-os>/audio-sidecar/server.js audio-sidecar/server.js`.
- **Não fazer merge deste branch para o `Mirror-Ball-V3`** sem o David decidir (trazia o sidecar
  para a repo principal e a `music-config.json` commitada).
