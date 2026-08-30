# Brief F5 — Opus: coreografia verbatim, flashes, estrobo de fundo, `window.MIRRORBALL` completo, 3 disjuntores

Estado: F1-F4 aprovadas/commitadas (`ceeae55`). O Sonnet faz em paralelo `briefs/f5-sonnet.md` (carregar `core.js`/`music.js`/
`tuner.js`, servir do sidecar `/app/`, HUD `m`, botões) — não toques em `index.html`, `panel.js` nem no que ele cria. Vocês
partilham `main.js`: tu só o bloco `// ---- F5 choreo/API ----` que crias; ele só o bloco `// ---- F5 music ----`.
Coordenação com o Sonnet pelo ficheiro `briefs/f5-sync.md` (escreve o que precisas dele / o que lhe dás; lê-o de vez em quando).
**Tab de Chrome dedicado teu. Não mates processos `python.exe` globalmente (só o `serve.py` que tu lançaste, pelo PID).**

Lê **só isto**: `docs/plan-babylon-v2.md` (contrato; tetos `beamIntensity ≤ 0.18`, nada > 3 Hz, greyscale; regra 1: skin é
do utilizador) · `docs/parity-canvas2d.md` §3, §4 (incl. tabela "o que o motor escreve") · `web/index-v2.html` **187-190**
(`PRESETS` ALIVE/DEAD) + **318-327** (`effective()`), **252-285** (`randomPose`, `stepChoreo`, flashes Poisson), **378-395** (I por
spot com `choreo[i].gain`, flashes com envelope, `isFlash` → raio sem `spotRadiusMul`, `:308`), **399-403** (estrobo de fundo),
**723-770** (`window.MIRRORBALL` — tudo menos explode/rewind/getExplode/setExplodeEnabled, que ficam stubs para a F7), **833-841**
(3 disjuntores `beamsMotor`/`spotsMotor`/`opacityMotor` e `health`) · `spike-babylon/v2/ball.js` **410-470** (`mountedSpots`;
`:465` já tem `gain` placeholder) · `v2/main.js` **207-260, 276-335** · `web/music.js` **50-60** (contrato de posse) e
**2075-2100** (o que o motor chama em `window.MIRRORBALL`).

## Entrega
- `v2/choreo.js`: `createChoreo(CONFIG)` → `{ step(dt), gainOf(i), flashes, retarget(i,pose), flash(opts), reset() }` —
  `stepChoreo`/`randomPose`/Poisson **verbatim** (`:255-285`), estado `choreo[i] = {t, to, mt, gain}` por spot, `reducedMotion`
  congela. `dt` em segundos, clampado a 0.05.
- `ball.js`: `update(tSec, spots, E)` passa a receber também **flashes** (via `E.flashes` — documenta) e multiplica `I` por
  `E.choreoGain[i]` (`:382`); flash → spot montado com `isFlash` (raio **sem** `spotRadiusMul`), entra em `mountedSpots` (o
  `main.js` cria SpotLights a partir de `mountedSpots` — confirma que o nº de luzes cobre `spots.length + flashSlots + 2`, senão
  pré-cria e `setEnabled`). Envelope de flash `:390-391`.
- `health` + `effective()` (`:318-327`): `E = { spotGain, rotationRpm, sphereOpacity, haze }` interpolados ALIVE→DEAD por
  `1−health`; `reducedMotion` → rpm ×0.03. Substitui o `E` fixo do `main.js`.
- **Estrobo de fundo**: `strobe(opts)` → bool com `minGapMs` (≤ 3 Hz, invariante) e nível `strobeLevel·(1−age/lenMs)`; visual =
  flash branco **da sala** (não da bola): multiplica temporariamente o `emissiveColor` do material da sala (`room.material`) ou um
  plano fullscreen aditivo atrás da bola — escolhe o que lê como "a sala atrás pisca". Em white lê-se como escurecer (tonemap).
- **`window.MIRRORBALL`** completo com a assinatura de `:723-770`: `setHealth/getHealth/config/knobs.get/set/setSpot/flash/
  retarget/setChoreo/strobe/strobeEnabled/setSkin/setSkinAuto/getSkin` (skin → `MB2.setSkin` da F4; `setSkinAuto` só guarda o
  valor) + stubs `explode/rewind/getExplode/setExplodeEnabled` (F7; `getExplode()` devolve `{phase:'idle', s:0, enabled}`).
  `knobs.get/set` usa `knobsGet/knobsSet` do `panel.js` (prioridade `localStorage > ficheiro > defaults`, `:730`) — o Sonnet
  expõe-os; combina os nomes em `f5-sync.md`. Quando `window.MIRRORBALL` estiver criado, dispara `window.dispatchEvent(new
  Event('mb2-ready'))` (o Sonnet só carrega o `music.js` depois disso).
- **3 disjuntores** em `CONFIG`: `beamsMotor`, `spotsMotor`, `opacityMotor` (default `true`), mais `hazeMax`, `beamFractionMax`
  — o motor lê-os; a bola **respeita**: com `false` o slider manda (guarda aqui também, não só no `music.js`). Os sliders
  `motor manda (0/1)` existem no `panel.js`? Confirma; se não, pede ao Sonnet via `f5-sync.md`.
- Sem `NaN`: tudo o que vem do motor passa por `num(v, d)` + clamp (`beamIntensity ≤ 0.18`, `rotationRpm ≤ 3`, `haze ≤ 1`).

## Não fazer
Carregar `music.js`/`core.js`, servir do sidecar, HUD `m`, botões, painel (Sonnet). Explosão (F7). Corpos PAR36 (F6). `web/`.
Sem `git commit`.

## Feito quando
Sem motor (`:8099/v2/index.html?webgl=1`, manual): com `focos: saltam 1` os focos apagam→saltam→acendem (nunca varrem), flashes
Poisson visíveis (`flash: por s` 2), `MIRRORBALL.strobe({level:1})` pisca a sala e devolve `false` se chamado antes de `minGapMs`;
`setHealth(0)` leva a bola ao DEAD (rpm 0.12, haze 0.25, opacidade 0.35) e `setHealth(1)` volta; consola limpa; `MB2.__perf()`
< 8 ms. `PARITY.md` §3, §4 ✅/⚠. Reporta API final e o que ficou em `f5-sync.md`.
