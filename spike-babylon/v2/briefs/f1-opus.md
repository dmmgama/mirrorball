# Brief F1 — Opus: malha de facetas + cadeia de cinza + PBR (`spike-babylon/v2/ball.js`)

Lê **só isto** antes de começar (por ordem; não leias os ficheiros inteiros):
1. `docs/plan-babylon-v2.md` — objetivo, prioridades, contrato de arquitetura.
2. `docs/parity-canvas2d.md` §1.1 (facetas/tiles), §1.2 (glint), §1.5 (shade), §2 (tabela CONFIG).
3. `web/index-v2.html` linhas **217-242** (`hash`, `buildTiles`), **284-300** (`makeSpot`, `spotDir`, `norm3`),
   **416-418** (normal do tile), **622-660** (cadeia de cinza, alpha, malha osso).
4. `docs/babylon-reference.md` §2 (PBR + armadilhas 1-3), §4 (ReflectionProbe), §5 (VertexData).
5. `spike-babylon/scene.js` linhas **88-150** (`buildBall` — copia a projeção no plano tangente; está certa).

## Entrega
`ball.js` exporta `createBall(scene, CONFIG)` → `{ mesh, rebuild(), update(tSec, spots, E), tiles }`.

- **Geometria**: `buildTiles()` idêntica ao original (mesmo `hash(id)`, mesmas sementes `grey/driftPhase/beamHash/
  dotHash/exJit/exAxis/exSpeed/exSpin` — a Fase 7 precisa delas). 4 vértices/tile, normal do centro em todos,
  cantos projetados no plano tangente. Typed arrays pré-alocados; `rebuild()` quando `facetRows`/toggles mudam.
- **Novo, desde a raiz** (com chaves em `CONFIG` e valor inicial finito):
  - `seamInset` (já existe) — a junta; núcleo escuro interior a `seamDarkness` (esfera `diameter 1.96`, mate).
  - `tileSizeVar` (0-1, default 0.35): jitter determinístico por tile (`hash(id+0.91)`) das arestas do quad,
    a junta absorve a diferença; nunca sobrepor tiles vizinhos.
  - `tileTone`: `'hash'` (cinza-base por tile de `baseTileGrey` + cadeia de 8 passos → vertex color) |
    `'real'` (todos iguais: vertex color = 1, só PBR + sala refletida; a cadeia aplica só rim/volume/shade).
  - `tileLayout`: `'offset'` (meia-célula em filas ímpares, atual) | `'aligned'` (sem offset, bola real).
- **Cadeia de cinza** (`:641-652`), por tile, por frame (ou a 20 Hz se pesar), **na ordem exata**:
  `g=(grey+drift)·(1+litSideGain·lit)` → `+0.45·ballLight` → contraste à volta do `mid` → `+rim` → `−banda` →
  `×(0.75+0.25·nz)` → `×shade` → `val = clamp(g + gl·(1−g)·1.15)`. `nz` = componente Z da normal **no referencial
  da câmara** (a câmara orbita: usa a direção câmara→bola, não o Z do mundo). Resultado em `VertexBuffer.ColorKind`
  (greyscale, alpha = `lerp(sphereOpacity,1,gl)`). `lit` e `gl` nesta fase vêm de um cálculo CPU simples com os
  2 spots (`NdS·I·0.5`, `inCone` como `:442`); a Fase 2 afina.
- **Material**: `PBRMaterial` com knobs `mirrorMetallic` (0.92), `mirrorRoughness` (0.22), `envIntensity` (2.4),
  `maxSimultaneousLights = 12`, `reflectionTexture` = `ReflectionProbe` da sala (256, ONCE, sem a bola na lista).
  Vertex color multiplica o albedo (`useVertexColor`/`albedoColor` branco).
- **Rotação**: `rotationRpm` como `:337` (`angle += rpm/60·TAU·dt`), `dt` clampado a 50 ms.

## Não fazer
Feixes, cone incidente, pontos, explosão, corpos dos focos, painel (é do Sonnet — expõe só `CONFIG` e `rebuild()`).
Não tocar em `web/`. Não alocar `Vector3` dentro do loop por tile.

## Feito quando
Lado a lado com a bola atual (`spotCount 2`, sem feixes), parada e a rodar, o cinza-base/rim/volume leem igual;
os 3 toggles/variação funcionam via `CONFIG` + `rebuild()`; sem exceções; `PARITY.md` §1.1/1.2/1.5 preenchidos
(⚠ no glint, com porquê). ms de `scene.render()` no HUD < 8.
