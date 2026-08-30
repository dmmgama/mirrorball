# Brief F3 — Sonnet: cone incidente (`v2/incident.js`), knobs de feixes/haze no painel, integração

Estado: F1/F2 aprovadas. O Opus faz em paralelo os feixes refletidos (`v2/beams.js`, API `createBeams(scene, CONFIG, ball)`
→ `{update(E), mesh}`) e expõe `ball.beams`; não toques em `ball.js`/`beams.js`.

Lê **só isto**: `docs/plan-babylon-v2.md` · `docs/parity-canvas2d.md` §1.7 e §5 · `web/index-v2.html` **498-552** (cone
incidente: `incidentAlpha`, `incidentLen`, `incidentMaxWidth`, `incidentMaxPx`, 3 quads `inWid/inAw`, gradiente 5 paragens ~1/d²,
não desenhar se a fonte cai perto/atrás da câmara) e **69-165** só para as chaves `incident*`, `haze`, `beam*` · os teus
`main.js`/`panel.js`/`config.js`.

## Entrega
- `incident.js`: `createIncident(scene, CONFIG)` → `{update(mountedSpots, E, camera)}`. Por spot montado (`ball.mountedSpots`),
  um **cone de névoa** da fonte (`hit + S·incidentLen`, `hit` = ponto de entrada no limbo/`C`) até à bola: 3 cones aninhados
  (`inWid=[1,.55,.26]`, alphas `inAw=[.28,.34,.46]`·`a0`, `a0 = incidentAlpha·E.haze·min(1,I)`), gradiente 5 paragens ao longo
  (vertex alpha ~1/d²), `StandardMaterial` sem luz, `ALPHA_ADD`, sem depth write, greyscale. **Morre no limbo**: o cone acaba
  à superfície da bola (raio 1) — o depth test contra a bola já faz o resto (não desenhar "por baixo" do disco). Tetos: largura
  ≤ `min(diâmetro da mancha·incidentMaxWidth, incidentMaxPx raios)`. Não desenhar se a fonte está a < 2.5 raios da câmara.
  Um mesh por spot, pré-criado para `CONFIG.spots.length`, `setEnabled` conforme ativo.
- `main.js`: cria `incident` e `beams` (import dinâmico com try/catch como o `ball.js`), chama `beams.update(E)` e
  `incident.update(ball.mountedSpots, E, camera)` por frame; `E.haze = CONFIG.haze`. HUD: `feixes N`.
- `panel.js`: tirar ` (fase 3)` de `feixes: fração`, `feixes: largura°`, `feixes: dispersão`, `feixes: intensidade` (clamp 0.18),
  `feixes: glow z`, `haze`, `incidente: alpha/len/max largura/max px` (confere nomes reais). Knob novo: `feixes: comprimento`
  (`beamLen` 2-12, default 6).
- `PARITY.md` §1.7 + §5.

## Não fazer
`ball.js`, `beams.js`, pontos na parede, pós-processamento, `web/`. Sem `git commit`.

## Feito quando
`?webgl=1` sem exceções, 4 cones incidentes visíveis da fonte ao limbo com `haze 0.6`, desaparecem com `haze 0`, respeitam os
tetos; knobs de feixes ligados ao `beams.js` do Opus (se ainda não existir, o `main.js` tolera); `MB2.__perf()` < 8 ms.
