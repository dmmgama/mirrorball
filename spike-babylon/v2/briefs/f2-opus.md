# Brief F2 — Opus: mancha do foco fiel, fade/spotsOn, indireta CPU, sphereOpacity/raio-X (`v2/ball.js`)

Estado: F1 aprovada. `ball.js` (teu, 404 linhas) tem malha, sementes, cadeia de cinza a 20 Hz em vertex color,
PBR + probe, `lit`/`gl` simples com 2 spots. `main.js`/`panel.js` (Sonnet) chamam `ball.update(tSec, spots, E)`.

Lê **só isto** (por ordem):
1. `docs/plan-babylon-v2.md` (contrato) · `spike-babylon/v2/ball.js` inteiro (é teu).
2. `docs/parity-canvas2d.md` §1.3 (focos), §1.4 (indireta), §1.5.
3. `web/index-v2.html` **285-292** (`makeSpot`: S, H, base u/v, mira C, raio r, `k`), **376-393** (fade, spotFadeMix,
   spotsOn, I mínimo 0.02, indireta a deambular, flashes), **436-461** (por tile: NdS, `lit`, cone com raio fixo,
   `inCone` com `spotEdge`, ramo `wide` da indireta com `dotHash`, glint com `mirrorGain`/`glintSharp`/`pow(NdH,k)`),
   **605-616** (disco das juntas × opacidade), **653-660** (alpha `lerp(op,1,gl)`, malha osso `meshAlpha`).

## Entrega (tudo em `ball.js`; API mantém-se)
- **`update(tSec, spotsIn, E)`** passa a receber os spots já *montados* pelo `main.js` no formato do original
  (`{az, el, intensity, radius, period, aim, on}` de `CONFIG.spots`) e monta internamente com `makeSpot` fiel:
  fade `0.5+0.5·sin(TAU·t/period + i·2.1)`, `lerp(1, fade0, CONFIG.spotFadeMix)`, `I = intensity·E.spotGain·(0.35+0.65·fade)`,
  corta `I<0.02`, respeita `on` (spotsOn) e `i < CONFIG.spotCount`. Exponha `ball.mountedSpots` (array com `S, H, C, r, I,
  az, el`) para o Sonnet posicionar as `SpotLight` **a partir do mesmo cálculo** (uma fonte de verdade).
- **Cone fiel** por tile: dist ao eixo `(C + t·S)`, raio **fixo** `r = radius·spotRadiusMul`, `inCone = smooth(r, r·(1−spotEdge), dist)`.
  `lit = max(lit, NdS·I·0.5)`. Glint: `mirrorGain·inCone·min(1.6,I)·(1−glintSharp+glintSharp·spec)·(0.55+0.45·NdS)` com
  `spec = pow(NdH, k)` em CPU (isto é o que alimenta `gl` → vertex color/alpha; o PBR continua a dar o reflexo físico por cima —
  **knob `glintPbrMix`** (0-1, default 0.5) pesa quanto do brilho vem da cadeia CPU vs. do PBR: com 1 o vertex color não leva
  glint; documenta em PARITY §1.2).
- **Indireta CPU** (paridade da cintilação): `CONFIG.ambient {n, intensity, areaDeg, drift}`; fontes a deambular como `:387`;
  por tile `ang = acos(N·H)`, `w = smooth(area, area·0.35, ang)`, `glint += w·I·(0.35+1.3·dotHash)`. Exponha `ball.ambientPoses`
  (`[{az,el,I}]`) para o Sonnet colocar as `RectAreaLight` no mesmo sítio.
- **sphereOpacity / raio-X**: alpha por vértice `lerp(op, 1, gl)`; material com `transparencyMode ALPHABLEND` só quando
  `op < 0.995` (senão OPAQUE — não pagar o sort); núcleo escuro com `visibility = op`. **Malha osso**: `LinesSystem` (ou
  `MeshBuilder.CreateLineSystem`, 4 segmentos/tile, buffer pré-alocado, filho do `root`) com `alpha = (1−op)·0.45·(0.4+0.6·smooth(0.5,0,nz))`
  — por ser um único mesh, usa alpha global com o nz médio ou vertex color nas linhas; escolhe o mais barato e anota em PARITY.
- Guardas `Number.isFinite` em todos os knobs novos; nada de `Vector3` novos no loop por tile; ms de `scene.render()` < 8 com
  `spotCount 4`, `ambient.n 3`, `op 0.3`.

## Não fazer
Feixes, cone incidente, pontos, flashes/estrobo (F4/F5), coreografia (`stepChoreo` é F5 — os spots ficam com `aim` do CONFIG),
corpos dos focos, painel (Sonnet), `SpotLight`/`RectAreaLight` do Babylon (Sonnet). Não tocar em `web/`. Sem `git commit`.

## Feito quando
Lado a lado com a bola atual, `spotCount 4`, `feixes 0`: os espelhos acendem ao entrar na mancha com a mesma largura/orla, o
fade dos focos bate com o período, a indireta cintila espelho-a-espelho, `sphereOpacity 0.3` mostra osso + só tiles ativos.
Testado em `?webgl=1` sem exceções; PARITY §1.2/§1.3/§1.4 + linha "sphereOpacity/osso" atualizados. Reporta a API final
(`mountedSpots`, `ambientPoses`, knobs novos) para o orquestrador.
