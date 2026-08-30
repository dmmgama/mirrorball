# Brief F4 — Sonnet: pontos na parede, auréola, bloom/grão/vinheta, skin dark/white

Estado: F1-F3 aprovadas (commit `dfc796f`). `ball.js` (Opus) já calcula por tile `R = 2(N·S)N − S` e alimenta
`ball.beams` (`:591-660`); `beams.js`/`incident.js` desenham por thin instances; `main.js` faz o loop e o HUD; `panel.js`
tem os knobs (os que ainda dizem ` (fase 3)`/` (fase 4)` são teus). Tens um **tab de Chrome dedicado teu**.

Lê **só isto**: `docs/plan-babylon-v2.md` (contrato: pontos = matemática CPU a alimentar thin instances; tetos `dotMaxGrey`,
greyscale, nada > 3 Hz, bola não emite luz; todo o valor "à sensação" ganha knob) · `docs/parity-canvas2d.md` §1.8-1.11, §1.15,
§6 · `web/index-v2.html` **245, 326-333** (`dotDensityLive`/`frameEma`/`dk`), **397-407** (fundo + auréola), **443-447** (`dotCone`,
`dm`), **466-479** (interseção com a sala, `elong`, `I`), **486-495** (desenho dos pontos), **662-675** (bloom), **688-694**
(vinheta/grão), **697-700, 895-903** (skin white, tecla `w`), **22, 53** (filtro `#tone`) · `web/index-v2.html` **129-149** só para as
chaves `dot*`, `bloom*`, `grain`, `vignette`, `skinEase` · `spike-babylon/v2/ball.js` **478-540** (buffers dos feixes — modelo a
copiar) e **591-660** (o loop por tile) · `beams.js` **cabeçalho + criação do mesh thin-instanced e do material** (grep
`thinInstanceSetBuffer`, `ALPHA_ADD`) · `main.js` **207-260, 276-335** · `panel.js` **1-60**.

## Entrega
1. **Fonte dos pontos em `ball.js`** (única alteração permitida no ficheiro do Opus — bloco delimitado `// ---- F4 dots ----`,
   ao lado dos feixes): no mesmo loop, `dm = max(1, dotDensity)`, `rDot = sp.r·dm`, `dotCone = smooth(rDot, rDot·(1−edge), dist)`
   (calcula **antes** do `if (inCone <= 0.001) continue` — a orla larga também dá pontos, `:445-447`); se `dotCone > 0.001 &&
   T.dotHash < min(1, dotDensityLive)`: interseção de `P + t·R` com os 5 planos (`cand` de `:468-471`, `t>0` mais próximo,
   `room` de `CONFIG.room`, coordenadas do MUNDO como `beamP`); descarta se o ponto fica a < 0.6 raios da câmara (equivalente
   ao `Z < camD−0.6`). Escreve em typed arrays pré-alocados (`dotX` xyz do ponto, `dotN` normal do plano, `dotR` xyz, `dotI`,
   `dotSize`) e expõe `ball.dots = { count, X, N, R, I, size }`. `I = dotCone·(0.6+0.4·dm)·NdS·sp.I / (1 + dotFalloff·t²)`;
   `size = T.dphi·dotScale` (raios). `ball.dotDensityLive` como setter (o `main.js` escreve). Nada de arrays por frame.
2. **`v2/dots.js`** — `createDots(scene, CONFIG, ball)` → `{ update(E), mesh }`. Thin instances de **um disco** (`CreateDisc`,
   ~12 lados) colado ao plano: translação = `X + N·0.01`, rotação alinha o disco com `N`, escala `[size·elong, size, 1]` com
   `elong = clamp(1/max(graze,0.2), 1, 4.5)`, `graze = |N·R̂|` (ângulo rasante — no Canvas era `|nrm.z|`; aqui usa a normal
   do plano contra R, que é o que fisicamente alonga a mancha), eixo maior ao longo da projeção de R no plano. Material
   `StandardMaterial` sem luz, `emissiveColor` branco, `ALPHA_ADD`, sem depth write, greyscale; cor por instância
   `v = clamp(I,0,1)·dotMaxGrey/255`, descarta `v < 8/255`. Buffers `thinInstanceSetBuffer(..., false)` (ver PARITY §1.6).
3. **Degradação adaptativa** (`main.js`): `frameEma = frameEma·0.9 + dt·0.1` sobre o custo real de `scene.render()` (o que o
   `__perf` já mede); `> perf.targetMs` → `dotDensityLive *= 0.97` (piso `perf.minDotDensity`), senão `×1.005` até
   `CONFIG.dotDensity`. HUD: `dots N · dens X.XX`. Só os pontos degradam (§6).
4. **Auréola** (`halo`): um disco billboard na posição da bola, raio 2.6, gradiente radial por `opacityTexture` procedural (1 a
   r=0.9 → 0 a r=2.6, gerada uma vez, 128 px), `ALPHA_ADD`, alpha `0.05·halo·E.haze·spotGain·(0.35+0.65·dk)`, sem depth write,
   desenhado atrás da bola (`renderingGroupId` ou `alphaIndex`). `spotGain` = média de `sp.I` dos spots ativos se `E.spotGain`
   não existir.
5. **Pós-processo** (`DefaultRenderingPipeline`, `pipe`): `bloomEnabled` com `bloomThreshold` alto (default 0.8 — fonte = só
   o que já está quase branco, equivalente ao `gl > 0.35`), `bloomWeight = bloomStrength`, `bloomKernel` ≈ `bloomBlurPx·2`,
   `bloomScale 0.5` (meia resolução, como a bola); `grainEnabled`, `grain.intensity = grain·dk·K` (calibra K a olho para parecer
   o pattern da bola), `grain.animated = false` + reposicionar a semente a cada 400 ms (< 3 Hz); `imageProcessing.vignetteEnabled`,
   `vignetteWeight = vignette·dk`. **Tone-mapping como knob** (pendente do handoff S7: centro saturado ao olhar de frente):
   `pós: tonemap (0/1)` (ACES, default 1) + `pós: exposição` (0.3-2, default 1) — mede com `readPixels` no centro que nada > 0.95
   ocupa > 1% do viewport com 4 focos, `haze 0.6`, `beamFraction 1`, câmara de frente para um feixe.
6. **Skin dark/white** (`w` + botão como na bola): `CONFIG.skin` ∈ `dark|white`, `skinMix → target` com `1−exp(−skinEase·dt)`;
   `dk = 1−skinMix` entra em halo/grão/vinheta/`incidentAlpha` (`:517` — `(0.5+0.5·dk)`); fundo interpola `bgGrey → rgb(243,247,249)`;
   em white aplica o tonemap do `#tone` (`:53`, 3 tabelas de 33 valores) como `ColorCurves`/`ColorGradingTexture` ou, mais simples,
   `imageProcessing` com `contrast/exposure` + inversão por `PostProcess` custom que use as 3 tabelas (LUT 1D em textura). Deve
   ler-se como a bola atual em white. **Regra 1:** nenhum motor toca na skin — só tecla/botão. Expõe `MB2.setSkin(mode)`.
7. `panel.js`: tirar ` (fase 3)` de `auréola`, ` (fase 4)` de `pontos na parede (densidade)`; knobs novos: `pontos: escala`
   (`dotScale`), `pontos: queda` (`dotFalloff`), `pontos: teto cinza` (`dotMaxGrey` 0-255), `bloom: força`, `bloom: limiar`,
   `bloom: raio px`, `grão`, `vinheta`, `pós: tonemap (0/1)`, `pós: exposição`. Os knobs de strobe ficam ` (fase 5)`.
   **Bónus se couber:** sliders re-lerem `CONFIG` quando escrito pela consola (`MB2.refreshPanel()`).
8. `PARITY.md` §1.8-1.11, §1.15, §6 preenchidos (✅/⚠ + porquê).

## Não fazer
Feixes/cone incidente (não mexer em `beams.js`/`incident.js`), estrobo, `stepChoreo`, `window.MIRRORBALL`, explosão, corpos
PAR36, `web/`. Sem `git commit`. Em `ball.js` só o bloco `F4 dots` + o export.

## Feito quando
`http://127.0.0.1:8099/v2/index.html?webgl=1` (`cd spike-babylon && python serve.py`), consola limpa; com `localStorage.
removeItem('mb2.knobs')`, `MB2.cfg.spotCount=4; haze=0.6; beamFraction=1; dotDensity=0.8`: pontos a varrer as 5 paredes ao
rodar a bola, alongados nos ângulos rasantes, mais pontos com `dotDensity 2`, nenhum > `dotMaxGrey`; `dotDensityLive` desce
quando forças `perf.targetMs = 2`; auréola some com `haze 0`; bloom só nos tiles a brilhar; grão/vinheta pesam só em dark; `w`
alterna dark/white com crossfade; `MB2.__perf()` < 8 ms (tab visível) com 110 feixes + pontos. Reporta API, knobs novos e o
valor medido de saturação no centro (antes/depois do tonemap).
