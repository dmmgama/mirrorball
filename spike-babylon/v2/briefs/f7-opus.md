# Brief F7 — Opus: explosão em estilhaços (máquina idle→out→drift→hold/held→back, Rodrigues por tile, maxHold, reentrada)

Estado: F1-F5 commitadas (`7280271`). `window.MIRRORBALL` já existe (`main.js`, bloco `// ---- F5 choreo/API ----`) com stubs
`explode/rewind/getExplode/setExplodeEnabled` — substitui-os. O Sonnet faz em paralelo `briefs/f6-sonnet.md` (corpos PAR36 em
`v2/fixtures.js`, `?mini=1`/`?scale=`) — não toques em `fixtures.js`, `index.html`, `panel.js`; no `main.js` só o bloco
`// ---- F7 explode ----` que crias + os 4 stubs. Coordenação por `briefs/f67-sync.md`.
**Tab de Chrome dedicado teu. Nunca `taskkill /IM python.exe` — só o PID do teu `serve.py` (porta 8098 se a 8099 estiver ocupada).**

Lê **só isto**: `docs/plan-babylon-v2.md` (contrato: uma malha de facetas, typed arrays pré-alocados, `updateVerticesData` na
explosão; tetos) · `docs/parity-canvas2d.md` §1.14 · `web/index-v2.html` **157-172** (`CONFIG.explode`), **293-296** (`exp`,
`explodeEnabled`), **316-320** (`rodrigues`), **337-369** (máquina de estados, `exS`, `exFloat`, `angleUsed`), **407** (halo
×`(1−0.75·exS)`), **419-431** (posição/normal por estilhaço), **483-485** (ordenação), **510**, **517** (incidente ×`(1−0.8·exS)`),
**610-611** (núcleo desfaz-se), **628-634** (cantos relativos a `N0`, tombados por Rodrigues, levados a P), **753-770** (API:
reentrada por `sqrt`/`cbrt`, `rewind`, `getExplode`, `setExplodeEnabled` com `localStorage['mb.explode']` → usa `'mb2.explode'`),
**896-898, 906** (teclas `x`/`X`, botão) · `spike-babylon/v2/ball.js` cabeçalho + `rebuild()` (onde os 4 vértices por tile são
gerados a partir de `N0`, `exJit/exAxis/exSpeed/exSpin` já existem por tile desde a F1) + o loop da cadeia (`:591-660`) +
`ball.js` export · `v2/main.js` bloco F5 (stubs) e o frame loop.

## Entrega
- `v2/explode.js`: `createExplode(CONFIG)` → `{ step(dt), s, phase, floatT, angle0, explode(opts, angleNow), rewind(), get(), enabled,
  setEnabled(v) }` — máquina de estados **verbatim** (`:337-363`), reentrada `:760-764`, `maxHold` força `back` (invariante:
  nenhuma fonte deixa a bola partida). `dt` em s clampado a 0.05. `reducedMotion` → `explode()` no-op.
- `ball.js`: `update(tSec, spots, E)` lê `E.exS`, `E.exFloat`, `E.angle0` (0/0/— quando idle → caminho atual, custo zero).
  Quando `exS > 0.0005`: por tile calcula `P` e `N` por `:420-429` (Rodrigues em `T.exAxis`, `rad`, `jit`, `gravity·s²`, `depth`, `bob`)
  e **reescreve as posições dos 4 vértices** (`:628-634`: cantos relativos a `N0`, rodados, transladados para P) + normais no
  buffer pré-alocado → `updateVerticesData(PositionKind/NormalKind)` por frame só enquanto `exOn`. A cadeia de cinza usa o `N`
  tombado (o reflexo varre a sala). Rotação congelada: `root.rotation.y` usa `angleUsed = angle + (angle0 − angle)·exS` (`:369`).
  Feixes/pontos/glint continuam a nascer de `P`/`N` novos (a fonte é o mesmo loop) — descarta tiles com `P` a < 1.5 raios da
  câmara (`:426` `camD−1.5`). Núcleo escuro: `visibility·(1−exS)` (`:610`). Osso: desliga com `exS > 0.5`.
- `main.js` bloco F7: `E.exS/exFloat/angle0` por frame, halo ×`(1−0.75·exS)`, `incident` ×`(1−0.8·exS)` (passa por `E` — se o
  `incident.js` não ler, adiciona a leitura lá: é 1 linha, permitida), API real em `window.MIRRORBALL`, teclas `x`/`X` (`:896-898`,
  sem `preventDefault` em `m/p/g/n/d/w`), botão `#xpl` "explosões on/off" (cria o botão no `#ui` — combina o id com o Sonnet em
  `f67-sync.md`; se ele já o criou, só ligas). `fromMotor && !enabled` → no-op.
- Knobs no `CONFIG.explode` já existem em `config.js`? Confirma; expõe ao painel só `explosão: alcance (radial)`, `explosão:
  deriva s`, `explosão: pausa s` via `f67-sync.md` para o Sonnet adicionar (ele é dono do `panel.js`).
- Sem `NaN`: guarda `Number.isFinite(exp.s)` (`:364`), `E.exS` default 0.

## Não fazer
`fixtures.js`, `index.html`, `panel.js`, `web/`, corpos PAR36, mini/scale. Sem `git commit`.

## Feito quando
`:8099/v2/index.html?webgl=1`: tecla `x` → estoiro seco (0.16 s), deriva em câmara lenta 6 s com os estilhaços a tombar e o
reflexo a varrer a sala (feixes/pontos mexem-se com os estilhaços), pausa 0.5 s, sucção de volta sem salto; `X` fica no ar e
2.º `X` volta; `x` a meio do rewind reentra sem salto; `maxHold` 14 s força a volta em `held`; `getExplode()` fiel;
`setExplodeEnabled(false)` bloqueia `{fromMotor:true}` mas não a tecla; consola limpa; `MB2.__perf()` < 10 ms durante a explosão,
< 8 ms em idle (idle = custo igual ao F5). `PARITY.md` §1.14 ✅/⚠.
