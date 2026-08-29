# Checklist de paridade — o que a bola Canvas 2D faz

Inventário factual de `web/index-v2.html` (918 linhas), `web/core.js`, `web/music-config.json`,
levantado a 2026-08-29 para servir de **especificação do spike v2** (port para Babylon.js).
Referências `ficheiro:linha`. Não opina sobre qualidade — lista o que EXISTE.

> **Como usar:** cada item é um critério de aceitação. O spike v2 só está pronto quando o
> David olha para as duas bolas lado a lado e não distingue o comportamento (a qualidade
> do render é que deve ser melhor, não o comportamento).

---

## 1. Fenómenos visuais desenhados

### 1.1 Facetas/tiles
- Malha por latitude em `buildTiles()` (`index-v2.html:220-242`): `rows=round(facetRows)`,
  `dphi=π/rows`; por fila `n=round(TAU·cos(phi)/dphi)`, deslocada meia largura em filas
  ímpares (`th = j·dth + (i%2)·dth·0.5`) — padrão tipo tijolo. **O spike já replica isto.**
- Seed determinística por tile via `hash(id)` (`:218`): `grey` (em `baseTileGrey`),
  `driftPhase`, `beamHash`, `dotHash`, e sementes de explosão (`exJit`, `exAxis`, `exSpeed`, `exSpin`).
- Normal `N0=[cosφ·cosθ, sinφ, cosφ·sinθ]`, `θ = T.th + angleUsed` (`:417`). Em repouso `P=N`.
- **Juntas (seam):** tile desenhado encolhido por `seamInset` (`:624`); por trás, disco cheio
  a `seamDarkness` (`:610`) que aparece nas frestas.
- **Drift:** `0.015·sin(TAU·t/driftPeriod + driftPhase)` (`:641`) — deriva lenta por tile.
- **Cadeia de cinza** (`:642-652`), por esta ordem, e a ordem importa:
  1. `g = (grey+drift)·(1 + litSideGain·lit)`
  2. `g += 0.45·clamp(ballLight,0,1)` ← uniforme, ANTES do volume
  3. `g = mid + (g-mid)·ballContrast` (contraste à volta do meio de `baseTileGrey`)
  4. `g += rimStrength·smooth(0.28,0,nz)` (rim nas rasantes)
  5. `g -= 0.035·…` (banda escura interior)
  6. `g *= 0.75+0.25·nz` (volume)
  7. `g *= (1-key) + key·(0.25+0.75·kd)` (luz geral)
  8. `val = clamp(g + gl·(1-g)·1.15, 0, 1)` ← glint clareia **aditivamente**
- **Alpha:** `lerp(sphereOpacity, 1, gl)` — em raio-X só os tiles com glint ficam opacos (`:654`).
- **Malha "osso":** com `sphereOpacity<1`, contorno `rgb(210,210,210)`, `meshAlpha=(1-op)·0.45` (`:658`).
- Em explosão, `visible.sort(a.P[2]-b.P[2])` — pintar de trás para a frente (`:485`).

### 1.2 Glint especular
- `H = normalize(S + [0,0,1])` (half-vector spot↔câmara, `:286`); `spec = pow(N·H, glintK)` (`:459`).
- `glint += mirrorGain·inCone·min(1.6,I)·(1-glintSharp + glintSharp·spec)·(0.55+0.45·NdS)` (`:460`).
- Vários spots **somam**. Tiles com `gl>0.35` entram no bloom (`:662`).

### 1.3 Focos/pinspots
- `CONFIG.spots[]` com `az, el, intensity, radius, period, aim` (`:73-86`); `spotCount` (0-6)
  diz quantos estão montados (`:379`).
- `makeSpot()` (`:285`): `S`, `H`, base ortonormal `u,v ⊥ S`, desvio de mira `C = u·ax+v·ay`,
  raio `r = radius·spotRadiusMul`.
- **Cone:** `dist` de `P` ao eixo `(C+t·S)`; `inCone = smooth(r, r·(1-spotEdge), dist)` (`:442`).
- **Raio FIXO** — não pulsa com a intensidade (`:74`). A intensidade só muda o brilho.
- **Fade:** `fade0=0.5+0.5·sin(TAU·t/period + i·2.1)`; `I = intensity·spotGain·(0.35+0.65·fade)·choreo.gain`;
  corta se `I<0.02` (`:380-383`).

### 1.4 Luz indireta (`ambient`)
- `{n, intensity, areaDeg, drift}` (`:100`) — **áreas largas da sala**, não focos.
- Deambulam: `az=140·sin(w·t+i·2.4)`, `el=25+35·sin(w·0.61·t+i·1.3)` (`:386`); `sp.wide=true`, `radius:9`.
- Por tile: `ang=acos(N·H)`; `w=smooth(area, area·0.35, ang)`;
  `glint += w·I·(0.35+1.3·dotHash)` ← **variação espelho-a-espelho** (`:448`).
- **Não gera feixe nem ponto na parede** (`continue`, `:453`).
- → No spike v2 isto é `RectAreaLight` + `areaLightEmissionTexture`.

### 1.5 Luz geral (`shade`)
- `{key, az, el}` (`:104`); `shadeDir` calculado 1×/frame (`:618`); entra no passo 7 da cadeia. `key=0` = plano.

### 1.6 Feixes refletidos 3D
- Emitidos se `(facing>0 || R.z<-0.05) && beamHash<beamFraction && inCone>0.3` (`:463`),
  com `R = 2(N·S)N − S` (`:456`). **O spike já usa esta equação.**
- Ordenados por intensidade; `nb = min(len, beamMaxCount)` **com guarda `Number.isFinite`** (`:559`).
- **Dispersão (`beamSoft`)**: 3 larguras aninhadas `[w, w·0.55, w·0.22]` com
  `w = beamWidthDeg·lerp(0.45,1.8,soft)`; alphas `[lerp(.04,.34,s), lerp(.12,.34,s), lerp(.84,.32,s)]` (`:562`).
  0 = laser (núcleo domina), 1 = difuso (halo domina).
- **`beamGlowZ`**: se `R.z > beamGlowZ` (vem direito à câmara) desenha **glow radial**, não linha (`:570`).
- Base do quad = largura de um tile projetada; ponta = `tan(width)·wEnd`; gradiente de alpha ao longo (`:584`).
- `base = clamp(I)·beamIntensity·smooth(0,6,nb-i)` — os últimos esbatem (`:600`).
- **Feixes que vêm para a câmara** (`R.z>0.05`) são desenhados **DEPOIS da bola**, por cima (`:601, 680`).
  Os outros ANTES, em `'lighter'` (`:553`).

### 1.7 Cone incidente
- Eixo fino de névoa da fonte até ao limbo — o feixe do PAR36 antes de bater (`:498`).
- **Clip `evenodd`**: retângulo menos o disco da bola — morre no limbo, nunca "por baixo" (`:504`).
- 3 quads encaixados `inWid=[1.0,0.55,0.26]`, `inAw=[0.28,0.34,0.46]` (`:513`); gradiente de 5
  paragens a simular ~1/d² (`:540`).
- **Tetos (os dois aplicam-se, vence o menor):** `cap = min(hRef·incidentMaxWidth, Rpx·incidentMaxPx)` (`:533`).
  Existe para um PAR36 de 4-6° nunca ocupar meio ecrã, por muito que se suba `spotRadiusMul`.
- Não desenha se a fonte cai perto/atrás da câmara (`src.z > camD-2.5`, `:523`).

### 1.8 Pontos na parede
- Sala implícita `room={halfW, ceil, floor, back}` em raios (`:146`) — 5 planos.
- **`dotDensity>1` alarga o cone ELEGÍVEL** (`rDot = sp.r·dm`) — a coroa fraca do foco também
  dá pontos (`:443`).
- Amostragem: só se `dotHash < min(1, dotDensityLive)` (`:467`).
- Interseção com os 3 planos candidatos, escolhe o `t>0` mais próximo (`:468`); descarta se `Z ≥ camD-0.6`.
- **Elongação por ângulo rasante:** `graze=|nrm.z|/|R|`; `elong=clamp(1/max(graze,0.2),1,4.5)` (`:477`).
- `I = dotCone·(0.6+0.4·dm)·NdS·I / (1 + dotFalloff·t²)` (`:478`); `v = round(I·dotMaxGrey)`, descarta `v<8`.
- → No spike v2 **isto vem de graça**: a sala é geometria, a luz bate lá.

### 1.9 Auréola (`halo`)
- Radial de `Rpx·0.9` a `Rpx·2.6`, alpha `0.05·halo·haze·spotGain·(0.35+0.65·dk)·(1-0.75·exS)` (`:406`).

### 1.10 Bloom
- Offscreen a **meia resolução** (`:205`); fonte = tiles com `gl>0.35` a branco, alpha `gl·0.9`;
  composto com `'lighter'`, `globalAlpha=bloomStrength`, `filter:blur(bloomBlurPx)` (`:666`).
  Um único blur, não multi-pass. → `DefaultRenderingPipeline.bloom*`.

### 1.11 Grão e vinheta
- Grão: pattern 256² de ruído, reposicionado a cada **400 ms** (`<3 Hz`), alpha `grain·dk` (`:691`).
- Vinheta: radial `min(W,H)·0.35 → hypot(W,H)·0.62`, alpha `vignette·dk` (`:688`).
- **Ambos só pesam em dark** (multiplicados por `dk`). → `pipe.grainEnabled`, `pipe.imageProcessing.vignette*`.

### 1.12 Corrente
- `drawChain()` (`:704`): gancho no topo; **elos alternados** — pares elipse "de frente",
  ímpares barra "de lado" (`:711,716`).
- Reage à luz: `shade = 70 + 45·max(0,sin(i·0.9)) + 30·|litSide|`, `litSide=Σ(S.x·I)` (`:705`).

### 1.13 Estrobo de fundo
- `{enabled, level, lenMs, minGapMs}` (`:109`). **A sala pisca, não a bola.**
- Ataque instantâneo, decaimento linear: `alpha = level·(1-age/lenMs)` (`:400`).
- `minGapMs=340` → ≤ ~2.9 Hz, verificado antes de disparar (`:747`).

### 1.14 Explosão em estilhaços
- Fases: `idle → out → drift → hold|held → back → idle` (`:293`).
- `out`: easeOutQuad até `burstS` (`:341`). `drift`: easeOutCubic de `burstS` a 1 (`:345`).
- `hold`: acumula `floatT`, passa a `back` após `hold` s (`:349`). `held`: fica (autoHold:false) (`:352`).
- **`maxHold` força `back`** mesmo em `held` — nenhuma fonte externa deixa a bola partida
  para sempre (`:356`).
- `back`: easeInOutCubic, duração `rewind·max(sFrom,0.05)` (`:357`).
- Por tile (`:420`): `rad = 1+radial·exSpeed·s`; jitter em `exJit`; queda `-gravity·s²`;
  `depth` escala o Z; descarta se `P.z > camD-1.5`. Normal roda por **Rodrigues** em `exAxis`,
  ângulo `exSpin·(spinMax·s + floatSpin·exFloat)`.
- **Rotação congelada no instante do estoiro:** `angleUsed = angle + (angle0-angle)·s` (`:369`).
- `exFloat` só pesa perto de `s=1` — mantém o rewind como **função pura de `s`** (`:367`).
- → No spike v2: `SolidParticleSystem` ou thin instances com matriz por tile.

### 1.15 Skin dark/white
- **Dois canvases**: `#mb` (base, sempre dark) e `#mbw` com `filter:url(#tone)` (`:22`).
- Filtro SVG `#tone`: `feComponentTransfer` com 3 tabelas de 33 valores (tonemap fixo) (`:53`).
- Crossfade `skinMix → skinTarget` com `1-exp(-skinEase·dt/1000)` (`:331`); copia o **mesmo
  frame** para `cvw` e ajusta opacidade (`:698`). Fundo interpola até `rgb(243,247,249)` (`:700`).
- **O motor de música NUNCA toca nisto** (regra 1).

### 1.16 Mini e scale
- `?mini=1` (`:175`): `ballSizeVH:0.66`, `ballCenter:[0.5,0.56]`, `chainLinkPx:6`, `beamLength:1.0`,
  `beamWidthDeg:1.6`, `dotScale:0.5`, `bloomBlurPx:5`, `grain:0.02`, `vignette:0.35`, `facetRows:39`;
  classe `mini`; skin fixa (`?light=1` → white).
- `?scale=N` multiplica `ballSizeVH`.

---

## 2. CONFIG (chaves não cobertas acima)

| chave | default | controla | knob `d`? |
|---|---|---|---|
| `ballSizeVH` | 0.52 | diâmetro (fração da altura) | não |
| `ballCenter` | [0.5,0.53] | centro | não |
| `facetRows` | 48 | filas | sim |
| `spotCount` | 2 | focos montados (0-6) | sim |
| `spotRadiusMul` | 1.0 | raio × | sim |
| `mirrorGain` | 1.0 | brilho dos espelhos | sim |
| `spotEdge` | 0.35 | orla do foco | sim |
| `glintSharp` | 0.75 | quanto o especular marca | não |
| `glintK` | 24 | expoente do especular | não |
| `beamMaxCount` | 110 | teto de feixes | não |
| `beamLength` | 0.78 | comprimento (fração do viewport) | não |
| `beamGlowZ` | 0.8 | limiar de virar glow | não |
| `dotScale` | 0.32 | tamanho do ponto | não |
| `dotMaxGrey` | 0xd8 | **teto de brilho dos pontos** | não |
| `dotFalloff` | 0.028 | atenuação com a distância | não |
| `bloomStrength` | 0.75 | alpha do bloom | não |
| `bloomBlurPx` | 9 | raio do blur | não |
| `seamDarkness` | 0.02 | cinza das juntas | não |
| `rimStrength` | 0.22 | borda das rasantes | não |
| `baseTileGrey` | [0.045,0.14] | cinza base | não |
| `litSideGain` | 0.55 | ganho do lado iluminado | não |
| `camDistance` | 7.0 | câmara (raios) | não |
| `room.*` | 5.2/4.2/-5/-7 | sala implícita | não |
| `grain` | 0.032 | grão | não |
| `vignette` | 0.55 | vinheta | não |
| `chainLinkPx` | 11 | elo da corrente | não |
| `driftPeriod` | 38 | período do drift | não |
| `perf.targetMs` | 17.5 | orçamento de frame | não |
| `perf.minDotDensity` | 0.12 | piso da degradação | não |
| `skin` / `skinEase` / `skinAutoValence` | auto / 7.0 / 1.6 | skin e crossfade | não (tecla `w`) |
| `spotFadeMix` | 1.0 | 1=fade interno, 0=constante (fonte externa coreografa) | não |
| `explode.*` | 13 chaves (`:157`) | explosão | não |

---

## 3. Coreografia (`choreo`)

`stepChoreo(dt)` (`:260`), 1×/frame.
- `randomPose()` (`:255`): `az = rnd(azRange)·(±1)` — **nunca perto de az≈0, nunca de frente
  para o público**; `el = rnd(elRange)`; `aim` num disco `r=sqrt(rand)·aimMax`, y comprimido ×0.6.
- **Retarget** (só se `choreo.retarget`): ciclo `mt` 0→2 — apaga (`gain=1-mt`) na posição
  antiga → **salta** em `mt=1` → acende (`gain=mt-1`) na nova. Depois sorteia novo `dwell`.
  **O foco NUNCA varre a superfície** (`:264`) — pinspots reais têm aim fixo.
- **Flashes:** Poisson `flashAcc += dt·flashRate`; máx `flashSlots` simultâneos (`:275`).
  Envelope: ataque nos primeiros 25% da vida, decaimento linear depois (`:390`).
- `reducedMotion` → `stepChoreo` retorna logo (coreografia congela).

---

## 4. API `window.MIRRORBALL`

`setHealth/getHealth` · `config` · `knobs.get/set` · `setSpot(i,partial)` · `flash(opts)` ·
`retarget(i,pose)` · `setChoreo(on)` · `strobe(opts)`→bool · `strobeEnabled()` ·
`setSkin(mode)` · `setSkinAuto(v)` · `getSkin()` · `explode(opts)` · `rewind()` ·
`getExplode()` · `setExplodeEnabled(v)`

`explode()` reentra na curva no ponto equivalente ao `s` atual (inverso via `sqrt`/`cbrt`) —
sem salto visual.

### O que o motor de música escreve
| escreve | condição |
|---|---|
| `rotationRpm` | sempre |
| `haze` (× `hazeMax`) | `beamsMotor !== false` |
| `beamFraction`, `beamIntensity` | `beamsMotor !== false`; `beamIntensity ≤ 0.18` |
| `sphereOpacity` | `opacityMotor !== false` |
| `setSpot(i,{intensity})`, `flash`, `strobe`, `explode`, `rewind` | `spotsMotor !== false` |

**Nunca** toca em skin/tone. Lê `spotCount`, `hazeMax`, `beamFractionMax`, e os 3 disjuntores.

---

## 5. Painel `d` — 54 sliders

(o array `sliders` em `:774-830` tem **54** entradas, não ~42: os spots 0-3 az/el são 8 linhas)

Ordem: focos (quantos/raio/orla/brilho/saltam/dwell min-max) · origem (az min-max, el min-max,
mira) · spot0-3 az/el · flash (por s, raio, dura) · bola (luz, contraste) · luz geral (volume,
az, el) · auréola · fundo · strobe (on, freq×, força, dura) · pontos na parede · luz indireta
(+área°) · cone incidente (alpha, alcance, largura máx, teto) · feixes (fração máx, compr. 3D,
largura°, dispersão) · junta · espelhos: filas · **rotationRpm** · haze máx · 3 disjuntores
`motor manda` · **sphereOpacity** · **health**.

**Persistência (`:845`):** `PERSIST` = tudo antes do bloco "bola" **mais** `feixes: fração máx`,
`haze máx` e os 3 `motor manda`. Ficam **de fora**: `rotationRpm`, `sphereOpacity`, `health`
(são sempre "motor manda").

**Prioridade: `localStorage > ficheiro ball > defaults`** (`:730, 848`) — "o que o David tocou
por último GANHA". `knobs.set()` só preenche o que o localStorage ainda não tem.

Botões: "repor ficheiro gravado" (aplica o snapshot do ficheiro, persiste) · "repor knobs
(defaults)" (limpa localStorage) · "gravar (music-config.json)" (via sidecar `/app-config`).
Tamanho do painel em `localStorage['mb.dbgSize']`, 1-3 colunas, escala 0.7-1.5.

---

## 6. Performance adaptativa

`frameEma = frameEma·0.9 + dtMs·0.1`. Se `> perf.targetMs`, `dotDensityLive *= 0.97` (piso
`minDotDensity`); senão recupera a `×1.005` até `CONFIG.dotDensity` (`:326`).

**Só os pontos na parede degradam.** Feixes, facetas, glint e bloom não têm degradação automática.

---

## 7. Invariantes a preservar

- `beamIntensity ≤ 0.18` (imposto no motor, `MUSIC.outMax.beamInt`).
- Cone incidente: **dois tetos**, vence o menor (`:533`).
- `dotMaxGrey` — pontos nunca saturam a branco.
- Estrobo ≤ ~3 Hz (`minGapMs`); grão reposiciona ≤ 2.5 Hz.
- **Greyscale puro** — nunca componentes RGB distintos.
- **Guardas de `NaN`** com `Number.isFinite` em `beamMaxCount` (`:559`), `beamSoft` (`:562`),
  `exp.s` (`:364`), `exp.floatT` (`:367`), `bgGrey` (`:397`). Um `NaN` fazia os feixes
  desaparecerem **sem erro na consola** — já aconteceu.
- `prefers-reduced-motion`: sem coreografia, rpm ×0.03, fade fixo, strobe e explode recusam.
- Explosão nunca fica presa (`maxHold`).
- Todas as projeções se guardam contra a câmara atravessar geometria
  (`camD-1.5`, `camD-2.5`, `camD-2.8`, `camD-0.6`).
