# Brief F5 — Sonnet: `?src=music` a carregar `core.js`/`music.js`/`tuner.js` sem os tocar; servir do sidecar `/app/`; HUD `m`; knobs ↔ ficheiro

Estado: F1-F4 aprovadas/commitadas (`ceeae55`). O Opus faz em paralelo `briefs/f5-opus.md` (`choreo.js`, flashes, estrobo,
`health`, `window.MIRRORBALL` completo, disjuntores; dispara `mb2-ready` quando `window.MIRRORBALL` existe) — não toques em
`ball.js`, `choreo.js`, nem no bloco `// ---- F5 choreo/API ----` do `main.js`; o teu bloco no `main.js` é `// ---- F5 music ----`.
Coordenação pelo ficheiro `briefs/f5-sync.md` (ex.: ele precisa de `knobsGet/knobsSet` do `panel.js` — escreve lá os nomes; lê-o
de vez em quando).
**Tab de Chrome dedicado teu. Não mates processos `python.exe` globalmente (só o `serve.py` que tu lançaste, pelo PID) — na F4 um
`taskkill /IM python.exe` matou processos alheios.**

Lê **só isto**: `CLAUDE.md` (secções "O áudio vem de fora" + "Como testar") · `docs/plan-babylon-v2.md` linha da fase 5 ·
`docs/parity-canvas2d.md` §4 ("o que o motor escreve") e §5 (persistência, botões, `mb.knobs`) · `web/index-v2.html` **176-186**
(query params), **820-870** (PERSIST, `knobFile`, `knobsGet/knobsSet`, botões "repor ficheiro gravado" / "repor knobs (defaults)" /
"gravar (music-config.json)"), **905-916** (scripts carregados e ordem) · `web/core.js` **1-50** (`MB_SOURCE`, `?src=`) ·
`web/music.js` **1-60** (contrato), **740-790** (carrega `music-config.json` via `/app-config/locations` + `knobs.set(j.ball)`),
**990-1010** (driver autónomo: só se `location.pathname` começa por `/app/`; `/app-token` same-origin → WS), **2385-2400** (HUD
`#mus`), **2570-2585** (gravar via `/app-config`) · `v2/panel.js` **1-60** e o fim do ficheiro (persistência) · `v2/index.html`.
Grep `getElementById`/`querySelector` em `core.js`, `music.js`, `tuner.js` para saber que ids de DOM esperam.

## Entrega
1. **Servir do sidecar.** O sidecar (`agent-os/audio-sidecar`, porta 3739) serve a pasta `web/` em `/app/*` do disco. Sem tocar em
   `agent-os` nem nos ficheiros de `web/`: cria uma **junction** `web/spike` → `spike-babylon` (`cmd /c mklink /J`), de modo a que
   `http://127.0.0.1:3739/app/spike/v2/index.html?src=music&webgl=1` sirva o spike **same-origin** com `/app-token`, `/app-config*`
   e o WS. Confirma que o sidecar segue junctions; se não seguir, documenta e implementa a alternativa: `serve.py` a fazer proxy de
   `/app-token` e `/app-config*` para o 3739 (o `j.ws` do `/app-token` já é URL absoluto) e a servir `/app/spike/*` → `spike-babylon/*`,
   `/app/*.js` → `web/*.js`. A junction não entra no git (anota no `spike-babylon/README.md` como recriar).
2. **`v2/index.html`**: com `?src=music`, carrega `../../core.js?v=1`, `../../music.js?v=58`, `../../tuner.js?v=1` (relativos a
   `/app/spike/v2/`) **depois** do evento `mb2-ready` (o `music.js` lê `window.MIRRORBALL` ao carregar, `:2077, :2081`). Fora do
   sidecar (`:8099`) esses caminhos não existem — fallback só para desenvolvimento via `serve.py` (ponto 1), nunca copiar ficheiros.
   Ids de DOM esperados pelos 3 scripts presentes (ex. `#mus`; escondidos se preciso). **Não** fazer bump de `?v=` — `web/` não se toca.
3. **Teclas**: `m`, `p`, `g`, `n` são do `music.js` — não dupliques; o `keydown` do spike não faz `preventDefault`/`stopPropagation`
   nessas teclas; `d`/`w` continuam do spike.
4. **Knobs ↔ ficheiro**: `panel.js` exporta `knobsGet()`, `knobsSet(obj, persist)`, `KNOB_DEFAULTS`, `knobFile` com a semântica de
   `:820-870` e **nomes idênticos** aos da bola Canvas (a secção `ball` do `music-config.json` é partilhada pelas duas bolas; os
   knobs novos do spike ficam fora do `PERSIST`-para-ficheiro mas dentro de `localStorage['mb2.knobs']`). Botões no painel:
   "repor ficheiro gravado", "repor knobs (defaults)", "gravar (music-config.json)" (`POST /app-config` como `:2570-2585` — só
   quando o David carrega; nunca automático). Escreve os nomes exportados em `f5-sync.md` para o Opus.
5. Sliders `rotationRpm (motor manda)`, `feixes: fração máx (motor modula)`, `haze máx (motor modula)`, 3× `motor manda (0/1)`,
   `sphereOpacity (motor manda)`, `health (motor manda)` com os nomes exatos de `:833-841` — confirma que existem (F1 copiou 54) e
   liga `health` a `window.MIRRORBALL.setHealth` quando existir.
6. `PARITY.md` §4 (carregamento/posse) e §5 ✅/⚠; `spike-babylon/README.md`: como arrancar em modo música (sidecar + junction + URL).

## Não fazer
`ball.js`, `choreo.js`, bloco do Opus no `main.js`, `web/*.js`, `web/music-config.json` (**nunca** commitar), `agent-os/`.
Sem `git commit`.

## Feito quando
Com o sidecar a correr (é lançado por `Mirrors-of-Emotions-Start.bat`; se **não** estiver a correr, testa `curl http://127.0.0.1:3739/app-token`
e, se falhar, lança o `.bat` tu — ele abre também a bola Canvas num browser, fecha só essa janela), `http://127.0.0.1:3739/app/spike/
v2/index.html?src=music&webgl=1` abre sem erros de consola, `window.MB_SOURCE.owner === 'music'`, HUD `m` mostra features a chegar
(silêncio marcado se não houver música), `window.MIRRORBALL.knobs.get()` devolve os nomes da secção `ball` do `music-config.json`,
"repor ficheiro gravado" aplica; em `:8099` sem `?src=music` tudo continua como na F4. Reporta URL final, ficheiros e divergências.
