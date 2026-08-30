# Brief F3 — Opus: feixes refletidos (`v2/beams.js` + fonte em `v2/ball.js`)

Estado: F1/F2 aprovadas; `ball.js` tem cadeia de cinza, `mountedSpots`, indireta, raio-X, corrente. O Sonnet faz em
paralelo `v2/incident.js` (cone incidente) e liga knobs em `panel.js`/`main.js` — não toques nesses; expõe API.

Lê **só isto**: `docs/plan-babylon-v2.md` (contrato: feixes = matemática CPU a alimentar geometria; `SpotLight` não gera
feixes; tetos `beamIntensity ≤ 0.18`, nada > 3 Hz, greyscale) · `docs/parity-canvas2d.md` §1.6 · `web/index-v2.html`
**462-465** (emissão por tile), **553-603** (ordenação, `bmc`, `beamSoft` 3 larguras/alphas, `drawBeam`, `beamGlowZ`, base do
quad = largura do tile, gradiente ao longo, esbater dos últimos, front/back) · **683** · `docs/babylon-reference.md` §6
(thin instances / volumetric) se existir, senão §5.

## Entrega
- `ball.js`: no loop por tile, quando `(facing>0 || R.z<-0.05) && beamHash<beamFraction && inCone>0.3`, escreve em typed
  arrays pré-alocados (`beamP` xyz, `beamR` xyz, `beamI`) e expõe `ball.beams = { count, P, R, I }` já **ordenado por I
  desc e truncado a `beamMaxCount`** (guarda `Number.isFinite`). `I = inCone·NdS·sp.I·E.haze`. Nada de arrays novos por frame.
  `R.z` aqui = componente na direção bola→câmara (câmara orbita — mesma convenção do `nz`).
- `beams.js` exporta `createBeams(scene, CONFIG, ball)` → `{ update(E), mesh }`. **3 cones aninhados por feixe** via **thin
  instances** de um cone unitário (base = largura de um tile em raios, comprimento `beamLen` em raios, default 6, knob) —
  larguras `[w, w·0.55, w·0.22]` com `w = beamWidthDeg·lerp(0.45,1.8,beamSoft)`, alphas `[lerp(.04,.34,s), lerp(.12,.34,s),
  lerp(.84,.32,s)]` × `base = clamp(I)·beamIntensity·smooth(0,6,nb−i)`. Material: `StandardMaterial` sem luz
  (`disableLighting`, `emissiveColor` branco), `alphaMode ALPHA_ADD`, greyscale, sem escrita de depth; gradiente de alpha ao
  longo do feixe por **vertex alpha do cone** (1 na base → 0 na ponta), instância recebe cor/alpha por `thinInstanceSetBuffer('color')`.
  Matriz por instância: translação = P (em coordenadas do `root` rodado → usa a matriz mundo do mesh das facetas), rotação
  alinha o eixo do cone com R (quaternion from-to, sem alocar no loop: reutiliza objetos).
- `beamGlowZ`: se `R.z > beamGlowZ`, em vez de cone, uma instância de **disco billboard** (glow radial) de raio
  `0.02+0.10·(R.z−glowZ)/(1−glowZ)` raios; segundo mesh thin-instanced.
- Tetos: clamp `beamIntensity` a 0.18 na leitura; `beamMaxCount` default o do CONFIG (110). Sem `NaN` em silêncio (I=0 → 0 instâncias).
- `ball.js` também expõe `ball.tileWidth` (largura média de um tile em raios) para a base do cone.

## Não fazer
Cone incidente (Sonnet), pontos na parede (F4), haze visual/pós (F4), painel. Não tocar `web/`. Sem `git commit`.

## Feito quando
Lado a lado com a bola atual (`feixes fração 1.0`, `haze 0.6`, 4 focos): feixes nascem nos mesmos tiles, mesmas direções,
leque para a câmara, `beamSoft` 0→1 passa de laser a difuso; `MB2.__perf()` < 8 ms com 110 feixes; consola limpa;
PARITY §1.6 preenchido (⚠ onde diverge: gradiente por vértice vs. Canvas). Reporta API e knobs novos.
