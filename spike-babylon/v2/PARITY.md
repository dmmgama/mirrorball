# PARITY.md — spike v2 Babylon.js vs bola Canvas 2D (`web/index-v2.html`)

Tabela de paridade, item a item, a partir de `docs/parity-canvas2d.md` §1-§7. Estado por item:
✅ igual · ⚠ divergência (com porquê) · ⏳ por fazer. Atualizada no fim de cada fase.

Fase atual: **Fase 4** (Sonnet: pontos na parede — fonte `ball.js` bloco `// ---- F4 dots ----`,
desenho `v2/dots.js`; auréola `halo` (`main.js`); pós-processo `DefaultRenderingPipeline` (bloom/
grão/vinheta/tonemap/exposição); degradação adaptativa `dotDensityLive`; skin dark/white com
crossfade + botão/tecla `w`; knobs novos sem sufixo de fase, strobe passa a `(fase 5)`). Ver
`spike-babylon/v2/briefs/f4-sonnet.md` e `docs/plan-babylon-v2.md`.

---

## 1. Fenómenos visuais desenhados

### 1.1 Facetas/tiles
✅ **Malha e sementes idênticas.** `v2/ball.js` `buildTiles()` é o `index-v2.html:220-242` verbatim:
`rows=max(6,round(facetRows))`, `dphi=π/rows`, por fila `n=max(3,round(TAU·cos(phi)/dphi))`,
`th = j·dth + (i%2)·dth·0.5`. **Verificado por teste**: as sementes `grey`, `driftPhase`, `beamHash`,
`dotHash`, `exJit`, `exAxis`, `exSpeed`, `exSpin` batem certo com o original tile a tile
(0 divergentes em 2938, com o mesmo `hash(n)=fract(sin(n·127.1+311.7)·43758.5453)` e a mesma
ordem de incremento de `id`) — a Fase 7 (explosão) pode contar com elas.
`facetRows 48` → **2938 tiles** (os 3992 citados em `parity-canvas2d.md` §1.1 correspondem a
`facetRows 56`, um valor anterior; a fórmula é a mesma).

✅ **Geometria.** 4 vértices/tile, `VertexData` com typed arrays pré-alocados (`Float32Array`
positions/normals/colors/uvs, `Uint32Array` indices), `applyToMesh(mesh, true)` updatable.
A normal do **centro** do tile vai nos 4 vértices (espelho plano, não superfície suave) e os 4
cantos são projetados no plano tangente (`v' = v/(v·N)`), como em `spike-babylon/scene.js:124-129`.
`rebuild()` refaz tudo quando `facetRows`/`tileSizeVar`/`tileTone`/`tileLayout`/`seamInset` mudam.

✅ **Juntas (seam).** `seamInset` encolhe o quad (`half = 0.5 − seamInset/2`, mesma regra angular
do Canvas 2D `:624`). Por trás, **núcleo escuro** = esfera `diameter 1.96` de `PBRMaterial` mate
(`metallic 0`, `roughness 1`, `environmentIntensity 0.05`) com albedo `seamDarkness` — o equivalente
3D do disco cheio de `:610`. Desliga-se quando `sphereOpacity ≤ 0.02` (raio-X).

✅ **Drift.** `0.015·sin(TAU·t/driftPeriod + driftPhase)`, idêntico a `:641`.

✅ **Cadeia de cinza** (8 passos de `:641-652`, **na ordem exata**) calculada em CPU por tile e
escrita em `VertexBuffer.ColorKind` (greyscale RGB + alpha), que multiplica o albedo PBR:
`g=(grey+drift)·(1+litSideGain·lit)` → `+0.45·ballLight` → contraste à volta do `mid` → `+rim` →
`−banda` → `×(0.75+0.25·nz)` → `×shade` → `val = clamp(g + gl·(1−g)·1.15)`.
✅ **sphereOpacity / raio-X (F2).** Alpha por vértice = `lerp(sphereOpacity, 1, gl)` (`:654`) —
em raio-X só os tiles ativos persistem. `hasVertexAlpha` sempre; `transparencyMode` comuta para
`MATERIAL_ALPHABLEND` **só** quando `sphereOpacity < 0.995` (senão `MATERIAL_OPAQUE`, para não
pagar o sort de transparência). O núcleo escuro (o disco de `:610`) segue com `visibility = op`.
Medido com `op 0.3`: `alpha` dos tiles varia 0.300 → 0.444, `transparencyMode 2`; com `op 1`
volta a `0` e o osso desliga-se.

✅ **Malha "osso" (F2).** `MeshBuilder.CreateLineSystem`, **4 segmentos por tile num único mesh**
(filho do `root`, `color rgb(210,210,210)` como `:659`), reconstruída no `rebuild()`.
`alpha = (1−op)·0.45·boneAlphaMul·⟨0.4+0.6·smooth(0.5,0,nz)⟩`; desliga-se abaixo de 0.01.
⚠ **Divergência (escolha de custo, autorizada pelo brief):** o Canvas 2D modula o termo `nz`
**por tile** (`:658`); aqui é **um só mesh com alpha global**, e o termo `nz` entra pela **média
sobre os tiles visíveis** (acumulada no mesmo loop da cadeia, custo zero). Perde-se o gradiente
do contorno entre o centro e o limbo; ganha-se **1 draw call em vez de ~3000**. A alternativa
(vertex color nas linhas) obrigava a um segundo buffer de cor de 4 floats × 2 vértices × 4
segmentos × nTiles atualizado a 20 Hz — mais caro do que o efeito vale. Knobs `boneMesh` (on/off)
e `boneAlphaMul` para o David ajustar ou desligar.

⚠ **`nz` no referencial da câmara, não o Z do mundo.** No Canvas 2D a câmara é fixa em `+Z`, por
isso `nz = N[2]`. Aqui a câmara **orbita** (ArcRotateCamera), logo `nz = N_mundo · normalize(camPos)`
— a normal do tile rodada por `angle` projetada na direção bola→câmara. Sem isto o rim e o volume
ficavam colados ao mundo e rodavam com a órbita. Comportamento igual ao original na pose inicial.

⚠ **Cadeia a 20 Hz, rotação a 60 Hz.** `computeColors()` corre no máximo a `COLOR_HZ = 20`
(um `updateVerticesData` de ~47 kB por passagem); `root.rotation.y` e o `dt` clampado a 50 ms
(`:337`) continuam por frame. Visualmente indistinguível (o drift tem período de 38 s e o glint
move-se devagar), e é o que mantém o `scene.render()` em ~1.2 ms medianos.

✅ **NOVOS (knobs do spike, não existem na Canvas 2D):**
- `tileSizeVar` (0-1, default 0.35): jitter determinístico por tile via `hash(id+0.91)`,
  `half = (0.5 − seamInset/2)·(1 − tileSizeVar·h)`. Só **encolhe** a partir do tamanho já reduzido
  pela junta — **nunca sobrepõe vizinhos** (o `half` máximo é o da junta), a junta absorve a folga.
- `tileTone`: `'hash'` = cinza-base por tile de `baseTileGrey` + cadeia completa (comportamento
  atual) · `'real'` = espelhos todos iguais, base `g = 1` e a cadeia aplica **só** rim/banda/volume/
  shade; o resto do tom vem do PBR + sala refletida. Verificado a olho: leitura claramente distinta.
  - **Correção 2026-08-30 (pedido do David: "outline preto estranho em cada espelho").** Em `'real'`
    cada espelho aparecia cercado por um contorno preto grosso em vez de um relevo fino. **Causa:
    duas somadas, ambas de contraste, nenhuma delas um bug do modo `real` em si** —
    (a) o **núcleo** a `seamDarkness 0.02` é praticamente preto, e (b) a **junta é larga**:
    `seamInset 0.15` mais o encolhimento de `tileSizeVar 0.35` deixam o vão entre **15% e 45%** da
    célula (medido: `fill` 0.850 → 0.552). Em `'hash'` isto não se vê porque os tiles também são
    escuros (0.045-0.14) e a junta confunde-se com eles; em `'real'` o tile vai a ~1 e o mesmo vão
    passa a ler-se como moldura. **Correção (só em `'real'`, `'hash'` fica byte-a-byte igual):** o
    núcleo passa a cinza metálico (`seamGreyReal 0.35`, `metallic 0.5`, `roughness 0.55`,
    `environmentIntensity 1.2` — apanha a sala, lê como armação e não como buraco) e a junta
    estreita (`seamInsetRealMul 0.33` → inset efetivo 0.05; `seamVarRealMul 0.5` → var. efetiva 0.18).
    ✅ **Verificado lado a lado** (`hash` vs `real`, mesma pose de câmara, zoom sobre o equador): o
    contorno preto desapareceu e ficou uma linha fina de relevo entre espelhos que quase se tocam.
    Os três valores são knobs — o David pode reabrir a junta em `real` se quiser.
- `tileLayout`: `'offset'` = meia-célula em filas ímpares (tijolo, atual) · `'aligned'` = sem
  offset (colunas direitas, bola real). Verificado a olho.

⏳ Explosão e a ordenação `visible.sort(P[2])` ficam para a Fase 7 (as sementes já cá estão).

### 1.2 Glint especular
⚠ **Divergência admitida** (prevista no plano §"Contrato de arquitetura"): o brilho especular fino
vem do **PBR do Babylon** (`SpotLight` + `metallic 0.92` / `roughness 0.22` / `environmentIntensity 2.4`
+ `ReflectionProbe` da sala), não do `pow(N·H, glintK)` do Canvas 2D. Porquê: é precisamente o ganho
de qualidade que motiva o spike — o reflexo passa a ser físico e a sala aparece nos espelhos, em vez
de um expoente afinado à mão. `glintK` e `glintSharp` continuam no CONFIG **sem efeito** nesta fase.

✅ **(F2) Fórmula completa de `:459-460` em CPU.** `gl` por tile = soma sobre os spots de
`mirrorGain·inCone·min(1.6,I)·(1−glintSharp + glintSharp·spec)·(0.55+0.45·NdS)`, com
`spec = pow(N·H, glintK)` (`H = normalize(S+[0,0,1])`, `:286`) e só quando `facing > 0`
(`:457`). Cone: `dist` de `P` (=N em repouso) ao eixo `C + t·S`, `inCone = smooth(r, r·(1−spotEdge), dist)`
(`:442`), **raio fixo** `r = radius·spotRadiusMul` — não pulsa com `I`. É esse `gl` que entra no
passo 8 (`+gl·(1−g)·1.15`) e no alpha. `lit = max(lit, NdS·I·0.5)` (`:437`).

✅ **`facing` com câmara a orbitar.** `:432` calcula `N·(cam−P)` com `cam=(0,0,camD)`; em repouso
`P=N` e `N·P=1`, logo `facing = N[2]·camD − 1`. Aqui usa-se o mesmo com o `nz` já no referencial
da câmara (ver §1.1): `facing = nz·camDistance − 1`.

🆕 **Knob novo `glintPbrMix` (0-1, default 0.5).** Pesa de onde vem o brilho: `0` = todo da cadeia
CPU (paridade literal com a Canvas 2D), `1` = **o vertex color não leva glint nenhum** e o brilho
fica todo por conta do PBR (`SpotLight` + probe). O termo CPU é multiplicado por `1 − glintPbrMix`.
O default 0.5 soma os dois — é o compromisso que dá a leitura da bola antiga com o reflexo físico
por cima. Medido: `glintPbrMix 0` → pico de `gl` 0.316; `0.5` → 0.179; `1` → 0.
Verificado também `mirrorGain` 1→2 (pico 0.179→0.349), `spotEdge` 0.9/0.05 (0.124/0.206) e
`spotRadiusMul` 2 (68→285 tiles na mancha).

⏳ O bloom dos tiles com `gl>0.35` fica para a Fase 4.

### 1.3 Focos/pinspots
✅ **Fase 2.** `v2/main.js` cria **6 `SpotLight` pré-criadas** (`CONFIG.spots.length`), nunca
destruídas/recriadas por frame — só `setEnabled()` liga/desliga. Por frame: posição
`S·spotDist` a olhar o centro, `angle` como na Fase 1, `intensity = spotLightIntensity·I`,
`setEnabled(i < spotCount && on && I ≥ 0.02)`.
✅ **Fonte única de verdade partilhada com o Opus.** `S` e `I` vêm de `ball.mountedSpots[i]`
(`{S,H,C,r,I,az,el}`) quando o `ball.js` o expõe — inclui fade `0.5+0.5·sin(TAU·t/period+i·2.1)`,
`spotFadeMix`, `choreo.gain` (Opus, brief F2). **Fallback** (`ball.mountedSpots` ausente):
`dirFromAzEl(az,el)` estático, `I = spots[i].intensity`, sem fade — usado só até o Opus publicar
o array (testado: comportamento idêntico ao da Fase 1 nesse caso).
✅ **Checkboxes `spot i`** (`web/index-v2.html:884-889`) → `CONFIG.spots[i].on` (em vez de um array
`spotsOn` local — mais simples de partilhar com `ball.update`, que recebe `CONFIG.spots` cru com
o campo `on`). Testado: desligar `spot 0` no painel apaga a `SpotLight` no frame seguinte.
⚠ Divergência aceite (Fase 1): a intensidade do `SpotLight` é fotométrica (1/d²) e medida em lúmens
(`spotLightIntensity`, knob novo), não o `intensity` adimensional da Canvas 2D.

✅ **(F2, lado CPU — `v2/ball.js`) A montagem dos focos é feita DENTRO do `ball.update`**, verbatim
de `:376-383` + `makeSpot()` de `:285-292`. `update(tSec, spotsIn, E)` recebe `CONFIG.spots` no
formato original (`{az, el, intensity, radius, period, aim, on}`) e por cada `i < spotCount`:
`fade0 = 0.5+0.5·sin(TAU·t/period + i·2.1)` → `fade = lerp(1, fade0, spotFadeMix)` →
`I = intensity·E.spotGain·(0.35+0.65·fade)`, **corta `I < 0.02`**, respeita `on`. Depois
`makeSpot`: `S = spotDir(az,el)`, `H = normalize(S+[0,0,1])`, base ortonormal `u,v ⊥ S`,
`C = u·aim[0] + v·aim[1]`, `r = radius·spotRadiusMul`.
O resultado publica-se em **`ball.mountedSpots`** — é o array que o `main.js` consome (acima):
**uma só fonte de verdade**, a mancha em CPU e a `SpotLight` nunca podem divergir.
Verificado ao vivo: com `spotCount 4`, `mountedSpots` dá `I = [0.79, 0.86, 0.28, 0.61]` (fades
com períodos 13/17/11/19 s, dessincronizados) e as `SpotLight` do Sonnet ficam com
`intensity = 770.7/731.5/256.1/581.8` = `spotLightIntensity·I` — batem exatamente.
`ball.spotsOn[]` existe como alternativa local às checkboxes; qualquer um dos dois (`spots[i].on`
ou `spotsOn[i]`) desliga o foco.
⏳ `choreo.gain` (o `·choreo[i].gain` de `:382`) fica para a **Fase 5** — os spots usam o `aim`
fixo do CONFIG, como manda o brief.

➕ **Extra pedido pelo David (não existe na bola Canvas 2D):** cor RGB nos focos.
`CONFIG.spotColorOn` (knob `focos: cor (0/1)`, default `0` = greyscale — invariante da bola
mantém-se por defeito) + `CONFIG.spots[i].rgb=[r,g,b]` (knobs `spot{i}: R/G/B`, i<4, default
`[1,1,1]`). Com `spotColorOn=1` a `SpotLight` i usa `diffuse`/`specular = Color3(r,g,b)`; com
`0` usa branco. **Só afeta as luzes Babylon** — a cadeia de cinza CPU do Opus (vertex color)
fica sempre greyscale, sem ler `rgb`. Testado via `MB2.scene`: `spotColorOn=true` +
`spots[0].rgb=[1,0.2,0.2]` → `spot0.diffuse` fica `(1,0.2,0.2)` no frame seguinte;
`spotColorOn=false` → volta a branco.

### 1.4 Luz indireta (`ambient`)
✅ **Fase 2.** `v2/main.js` cria **3 `RectAreaLight`** (`CONFIG.ambient.n`, máx. 3), posicionadas
em `dirFromAzEl(az,el)·(spotDist+1)`, `direction` a apontar para o centro da bola,
`width = height = 2·(spotDist+1)·tan(areaDeg·D2R)` (recalculado quando `spotDist`/`areaDeg`
mudam), `intensity = spotLightIntensity·I·ambientLightMul` (**knob novo** `indireta: luz ×`,
0-3, default `0.6`). `az/el/I` vêm de `ball.ambientPoses[i]` (`{az,el,I}`) quando o Opus o expõe;
**fallback**: reimplementação local de `index-v2.html:387` (`az=140·sin(w·t+i·2.4)`,
`el=25+35·sin(w·0.61·t+i·1.3)`, `w=drift·(0.7+0.3·i)`), sem o hash por tile (isso é CPU do Opus).
Testado: com `ambient.n=3`, as 3 `RectAreaLight` ficam ativas (`isEnabled()=true`) com
`intensity=900·0.07·0.6=37.8` (bate com o cálculo).
⏳ `areaLightEmissionTexture` (área texturada, `docs/babylon-reference.md` §3) não ligada nesta
fase — a `RectAreaLight` é lisa; fica como possível refinamento futuro se o David notar falta de
textura na sala refletida.

✅ **(F2, lado CPU — `v2/ball.js`) A cintilação espelho-a-espelho**, que é o que a `RectAreaLight`
sozinha **não** consegue dar. As `n` fontes deambulam verbatim de `:386`
(`w = drift·(0.7+0.3·i)`, `az = 140·sin(w·t + i·2.4)`, `el = 25 + 35·sin(w·0.61·t + i·1.3)`,
`radius 9`, `I = ambient.intensity·E.spotGain`) e publicam-se em **`ball.ambientPoses`**
(`[{az, el, I}]`) — a mesma fonte de verdade que o `main.js` usa para colocar as `RectAreaLight`.
Por tile, ramo `wide` de `:447-452`: `ang = acos(N·H)`, `w = smooth(area, area·0.35, ang)`,
`glint += w·I·(0.35 + 1.3·dotHash)`. O `dotHash` é a semente por tile — **uns espelhos devolvem
a sala, outros não**, e é daí que vem a cintilação. Sem cone, sem feixe, sem ponto (`continue`).
Medido com os focos desligados (`spotCount 0`, `ambient.n 3`): 1168 tiles com glint, distribuição
0.001 / 0.041 (mediana) / 0.192 — a dispersão é exatamente a variação espelho-a-espelho.

### 1.5 Luz geral (`shade`)
✅ **Passo 7 da cadeia, verbatim.** Em `v2/ball.js`: `shadeDir = spotDir(shade.az, shade.el)`
calculado 1×/passagem (não por tile, como em `:618`), `kd = max(0, N_mundo · shadeDir)`,
`g *= (1 − key) + key·(0.25 + 0.75·kd)`. `key = 0` → plano, igual ao original. É isto que dá o
volume da esfera na leitura em cinza.

✅ **Além disso** (Sonnet, `v2/main.js`): `HemisphericLight` com direção
`-dirFromAzEl(shade.az, shade.el)` e `intensity = shade.key·0.25`, para a sala e o PBR também
apanharem a luz geral. Atualiza quando os knobs `luz geral (volume)/az°/el°` mudam.

⚠ Nota: `shade` entra **duas vezes** por caminhos diferentes (cadeia de cinza → vertex color;
`HemisphericLight` → resposta PBR). É intencional — o primeiro replica a leitura da Canvas 2D,
o segundo evita que a sala e o reflexo fiquem sem key. Se ficar lavado, o knob a baixar é o
`HemisphericLight` (o `·0.25` do Sonnet), não o passo 7.

### 1.6 Feixes refletidos 3D
✅ **Feito** (Fase 3, Opus). Fonte em `ball.js` (`ball.beams`), desenho em `v2/beams.js`.

**Emissão (`ball.js`, dentro do loop por tile).** Critério verbatim de `:463` —
`(facing > 0 || R.z < −0.05) && beamHash < beamFraction && inCone > 0.3` — com
`R = 2(N·S)N − S` (`:456`) e `I = inCone · NdS · sp.I · E.haze` (`:464`). ✅ Vive no loop da cadeia
de cinza porque é lá que já existem `N`/`NdS`/`inCone`/`facing`: recalcular noutro sítio era pagar
o loop por tile duas vezes. Typed arrays **pré-alocados** (capacidade = nº de tiles), nunca um
array novo por frame. `R.z` é a componente de `R` na direção bola→**câmara** (a câmara orbita) —
mesma convenção do `nz`, não o z do mundo.

✅ **Ordenação e teto.** `beams.sort(b.I − a.I)` + `nb = min(len, beamMaxCount)` **com a guarda
`Number.isFinite`** de `:559` — o bug documentado no original (um `NaN` vindo de fora dava
`nb = NaN`, o ciclo nunca corria e os feixes desapareciam *sem erro na consola*). ✅ **Testado**:
`beamMaxCount = NaN` → 0 feixes, sem exceção. A ordenação faz-se sobre um `Int32Array` de índices
(`subarray` + `sort`), não sobre os dados — não move 7 floats por troca nem aloca.

✅ **`beamSoft` (dispersão).** 3 larguras aninhadas `[w, w·0.55, w·0.22]` com
`w = beamWidthDeg·lerp(0.45, 1.8, soft)` e alphas
`[lerp(.04,.34,s), lerp(.12,.34,s), lerp(.84,.32,s)]` (`:562`). ✅ **Verificado a olho**: `0` dá
linhas duras de laser, `1` dá halo difuso.

✅ **`base = clamp(I)·beamIntensity·smooth(0, 6, nb−i)`** (`:600`) — os últimos esbatem.

⚠ **`beamGlowZ` — DIVERGÊNCIA (correção 2026-08-30, Opus): o cone desenha-se SEMPRE.**
A Canvas 2D (`:570`) **substitui** a linha por um disco billboard quando `R.z > beamGlowZ`, porque
em 2D uma linha vista de frente degenera num ponto e deixa de se ler. **Em 3D isso está errado**:
por mais pequeno que seja o ângulo o cone continua a existir — vê-se apenas encurtado em
perspetiva. Bug reportado pelo David: ao orbitar a câmara para ficar **de frente para a reflexão**
de um foco, não via feixe nenhum, só um **disco branco saturado**.

**Medido** (câmara do lado do spot0, az −52°, el 14°, `spotCount 4`, `haze 0.6`,
`beamFraction 1`, 50 feixes dos quais **22 frontais** com `Rz > 0.8`): o código antigo somava
**α = 1.17** de alpha aditivo no centro — acima de 1.0, ou seja **saturação garantida a branco
liso**, exatamente o sintoma. Daí o "disco branco".

**Correção.** Duas mudanças em `beams.js`:
1. **O ramo exclusivo `if (Rz > glowZ) { …; continue; }` desapareceu** — os 3 cones são emitidos
   para **todos** os feixes, frontais incluídos.
2. **O glow passa a ser aditivo e fraco por cima**, com o knob novo `beamGlowMul` (0-1,
   **default 0.25**): `alpha = base · beamGlowMul · (Rz−glowZ)/(1−glowZ)` — rampa linear de 0 na
   fronteira `glowZ` até ao peso máximo a pino. O raio fica como estava
   (`0.02 + 0.10·(Rz−glowZ)/(1−glowZ)`).

**Porquê 0.25.** Com o mesmo enquadramento, o alpha somado no centro cai de **1.17** para
**0.23** (rácio 0.20) — abaixo da saturação, portanto os 22 feixes frontais somados continuam a
ler-se como **espelhos individuais a brilhar** e não como um disco liso. ✅ **Verificado a olho**:
de frente para a reflexão veem-se cones a vir para a câmara e, no centro, o aglomerado de
quadrados brancos distintos (as facetas apontadas a nós), com brilho moderado à volta. Levar o
knob a 1.0 alarga o halo mas **os cones continuam lá** — já não há substituição.

O knob está no painel `d` como **`feixes: glow ×`**, logo a seguir a `feixes: glow z`, persistido
em `mb2.knobs`.

✅ **Teto da regra 6.** `beamIntensity` é **clampado a 0.18 na leitura**, dentro do `beams.js`:
o `CONFIG` não o pode furar venha de onde vier. ✅ **Medido**: com `beamIntensity = 99` o valor
usado é 0.18 e o alpha máximo de um feixe fica em **0.074** (pior caso, `soft=0`, camada do núcleo).

**Seguimento Fase 4 (pendente do handoff S7): tonemap como knob, medido.** Mesmo cenário do §1.6
acima (residual de saturação mesmo com `beamGlowMul 0.25`), agora com o pipeline de pós-processo
(§1.10) ligado. `pós: tonemap (0/1)` (ACES, default **ligado**) + `pós: exposição` (default 1).
**Medido** com `readPixels` numa caixa central de 10% do viewport (`spotCount 4, haze 0.6,
beamFraction 1`, rig default do `CONFIG.spots`, pior ângulo de bola por varrimento de 32 poses):
- **Tonemap desligado, exposição 1** (equivalente ao estado antes desta fase): **6.9%** da caixa
  central acima de 0.95 (quase-branco), `maxV = 1.0` (saturado).
- **Tonemap ligado (ACES), exposição 1 — o novo default**: **0%** acima de 0.95, `maxV = 0.89`.
  Cumpre o critério do brief (nada > 0.95 ocupando > 1% do viewport) neste cenário.
- **Pior caso adicional testado** (não é o cenário do brief, é um stress test à parte: 4 spots
  apontados quase todos para a câmara simultaneamente, configuração fisicamente incomum mas
  possível via knobs): tonemap sozinho reduz de **100%→35.5%** saturado; com `exposição 0.3`
  (o piso do knob) desce a **16.7%** — ainda acima de 1%. Divergência documentada: em rigs
  extremos (muitos spots quase colineares com a câmara) o tonemap/exposição não elimina toda a
  saturação — se o David montar um rig assim ao vivo, o próximo recurso é um teto de soma no
  `beamGlowMul`/`beamIntensity` por frame (não implementado nesta fase, fora do âmbito do brief).

**Estrutura.** 3 cones aninhados por feixe como **thin instances** de UM cone unitário (3 draw
calls no total, para 1 ou para 110 feixes) + um mesh de disco para os glows. `StandardMaterial`
sem luz (`disableLighting`, `emissiveColor` branco), `alphaMode ALPHA_ADD`, `disableDepthWrite`,
greyscale. `renderingGroupId = 1` (a bola é 0).

⚠ **Divergências (documentadas):**
- **Gradiente ao longo do feixe = `opacityTexture` (rampa 4×256) endereçada pela UV.v do cone**
  (v=1 na base → v=0 na ponta, com a paragem intermédia a 0.35/0.55 de `:580-582`), **cozido na
  geometria uma vez**, em vez do `createLinearGradient` por feixe por frame da Canvas 2D. É a
  divergência que o brief previa (o brief dizia "vertex alpha"; ver armadilha 3 abaixo para o
  porquê da rampa em vez de vertex color).
- **O leque em perspetiva sai do 3D real** (o cone afasta-se da câmara), não do
  `wEnd = L3·Rpx·pe[2]` em screen-space de `:583`. A base do cone é
  `0.45·tileWidth·lerp(0.5,1,soft)·beamBaseMul` (o afinamento do laser de `:583`, mais o knob novo)
  e o raio da ponta `base + tan(width)·L3·0.5`.
  **Correção 2026-08-30 (feedback do David: "base de largura menor (50%), estão muito gordos").**
  Duas coisas estavam largas a mais e ambas foram corrigidas:
  1. **Ponta.** Faltava o `·0.5` do `wEnd = L3·Rpx·pe[2]·0.5` de `:584` — em raios da bola a
     Canvas 2D dá `hE = tan(w)·L3·0.5 + wStart`, e aqui estava `tan(w)·L3`, ou seja **o dobro**.
     Medido a `L3 = 6`, `beamWidthDeg 0.7`, `soft 0.5`, `facetRows 48`: cone exterior **0.105**
     raios antes, **0.052** depois — dentro dos 0.04-0.07 da Canvas 2D. As 3 camadas ficam em
     0.052 / 0.034 / 0.020 raios.
  2. **Base.** Knob novo `beamBaseMul` (0.1-2, default **0.5**, slider `feixes: base ×` a seguir a
     `feixes: largura°`, persistido em `mb2.knobs`): a base cai de 0.0221 para **0.0110** raios.
     Justifica-se porque o original desenha um **tronco** (base `wStart`, ponta `hE`, lados retos)
     e aqui é um **cone escalado** — sem o corte a base lia-se "gorda" ao pé do original.
- **Ordenação front/back não é precisa.** O original desenha os `R.z > 0.05` **depois** da bola
  (`:601`, `:683`) porque em Canvas 2D a ordem de composição importa. Aqui, com `ALPHA_ADD` e sem
  escrita de depth, a soma é **comutativa** — o resultado é o mesmo sem separar as duas listas.
  O fator `×0.75` dos feixes que vêm para a câmara (`:579`) **está** aplicado.
- **`beamLen`** (knob novo, default 6 raios) substitui o `beamLen3D · beamLength / 0.78` de `:568`;
  o cálculo antigo fica como recurso quando `beamLen` falta.
- O encurtamento `L3 = min(L3, (camD − 2.8 − b.z)/b.R[2])` de `:578` **não** foi portado: existe
  para o ponto final não ampliar demais na projeção 2D; em 3D o cone tem comprimento de mundo fixo
  e o problema não se põe.

**Perf.** ✅ **Medido** (WebGL2, `?webgl=1`, `localStorage` limpo, tab em primeiro plano,
60 amostras depois de assentar, `facetRows` 48 / 2938 tiles, 4 focos, `beamFraction 1.0`,
`haze 0.6`): **4.9 ms com 110 feixes** (o teto, saturado com `spotRadiusMul 3`); **1.3-3.0 ms** no
estado por defeito (~42 feixes). Antes de trocar o vertex color pela `opacityTexture` (armadilha 3)
os mesmos cenários davam 3.3 / 3.9 ms — a versão final é igual ou melhor. Pior caso forçado
(`facetRows 64`, 5216 tiles, 110 feixes): **7.0 ms**. Todos abaixo do teto de 8 ms. Amostras de
100-270 ms aparecem quando o separador vai a segundo plano durante a automação — é o efeito de
`docs/babylon-reference.md` §9, não regressão.

✅ **Consola limpa** verificada num reload de raiz, percorrendo todos os caminhos (soft 0/1, glow,
saturação a 110): só o banner do Babylon, zero erros.

**Armadilhas medidas nesta fase (para quem vier a seguir):**
1. `alphaMode = ALPHA_ADD` **não** basta para o material entrar na fila de transparência: o Babylon
   decide por `needAlphaBlending()`, que com `alpha = 1` e sem `opacityTexture` responde `false` —
   e os cones saem tubos brancos **opacos**. Força-se `m.needAlphaBlending = () => true`.
2. O buffer de cor por instância chama-se **`instanceColor`** (`VertexBuffer.ColorInstanceKind`),
   **não** `color`.
3. **Vertex color + thin-instance color não se dão.** Com o mesh a ter buffer `color` *e* o
   `instanceColor` registado, o Babylon define `VERTEXCOLOR` **e** `INSTANCESCOLOR` e gera
   `vColor *= instanceColor`; numa das variantes que tenta compilar o atributo ainda não está
   declarado → `VERTEX SHADER ERROR: 'instanceColor': undeclared identifier`. O efeito acaba por
   compilar noutro frame (a imagem sai certa) mas **o erro fica na consola**, e pré-registar os
   buffers na construção não o evita. Solução adotada: **tirar o vertex color** dos cones e do
   disco — o gradiente passa para `opacityTexture` endereçada por UV, e o `instanceColor` fica a
   ser a única fonte de cor. Consola limpa, e ainda ficou mais rápido (ver Perf).
4. `thinInstanceSetBuffer(..., staticBuffer)` tem de ser **`false`** para buffers que mudam por
   frame. Com `true` o Babylon assume que não voltam a mexer-se, a atualização não chega ao GPU e
   as instâncias ficam presas nos valores do primeiro frame (alpha cheio → ecrã branco).

### 1.7 Cone incidente
✅ **Fase 3 (Sonnet), `v2/incident.js`.** `createIncident(scene, CONFIG) -> { update(mountedSpots, E,
camera) }`, chamado por `main.js` a seguir a `updateSpotLights()`/`updateAmbientLights()` (lê
`ball.mountedSpots` do MESMO frame). Por spot montado (`!wide`, i.e. não é luz indireta): eixo
`hit -> src` verbatim (`hit = C + S·tIn` com `tIn = √(1−|C|²)`, `src = hit + S·incidentLen`), 3
cones aninhados (`inWid=[1,.55,.26]`, `inAw=[.28,.34,.46]`, `a0 = incidentAlpha·E.haze·min(1,I)`),
teto duplo `min(sp.r·incidentMaxWidth, incidentMaxPx)` (vence o menor), não desenha se
`distância(src, câmara) < 2.5` nem se `a0 < 0.002`. Um mesh por (spot × camada) — `6 spots × 3 =
18` — pré-criados no arranque, nunca destruídos, só `setEnabled`/matriz por frame (guarda
`Number.isFinite` em `tIn`/direção antes de aplicar). Testado no browser: `spotCount 4, haze 0.6`
→ 4 eixos visíveis (12 meshes ativos, `spotCount 2` → 6); `haze 0` → 0 meshes ativos.

⚠ **Divergências documentadas** (geometria 3D real em vez de canvas 2D):
- **Sem clip evenodd**: a Canvas 2D recorta o quad contra o disco projetado (`ctx.clip('evenodd')`).
  Aqui "morre no limbo" sai de graça do depth test contra a bola (mesh sólido, depth write on) —
  a parte do cone que ficaria "por baixo" do disco fica tapada pela geometria da bola, sem precisar
  de recorte nenhum. Confirmado visualmente (zoom no limbo): sem bleed-through.
- **Gradiente ao longo do eixo**: 5 vertex colors cozidos no mesh unitário (mesmos valores de alpha
  relativa `[0, 0.06, 0.24, 0.72, 1]` nas mesmas paragens `[0, .45, .75, .93, 1]`) em vez de
  `createLinearGradient` por frame — visualmente equivalente, mais barato (não recalcula por frame,
  só a matriz/`visibility` mudam).
- **Largura em raios, não em pixels projetados**: a Canvas 2D calcula `hRef`/`cap` em px de ecrã
  (`Rpx`); em 3D não há projeção nesse sentido — `hRef = sp.r` (raio da mancha, já em raios da
  bola) e `incidentMaxPx` entra diretamente como fração do raio da bola (=1), não `Rpx·incidentMaxPx`.
  É o equivalente 3D direto do teto original (mesmo CONFIG, mesmos defaults) sem depender de FOV/
  distância de câmara.
- **Teste "perto/atrás da câmara"**: o original testa `src.z > camD-2.5` no espaço de câmara fixa
  em +Z. Aqui a câmara orbita (ArcRotateCamera), por isso usa-se a distância euclidiana real
  fonte↔câmara (`camera.globalPosition`) com o mesmo limiar `2.5` — equivalente quando a câmara
  está na pose inicial, diverge ligeiramente em poses orbitadas extremas (aceitável para o spike).
- **`exS`/`dk` (explosão, skin dark/white) não entram em `a0`** — essas fases (7 e a integração do
  skin) ainda não existem no spike; quando existirem, replicar `a0 *= (1-0.8·exS)·(0.5+0.5·dk)`.

Knobs no painel **sem sufixo** desde esta fase: `cone incidente`, `cone: alcance`, `cone: largura
máx`, `cone: teto (raios)`.

### 1.8 Pontos na parede
✅ **Feita.** Fonte em `v2/ball.js` (bloco `// ---- F4 dots ----`, dentro do MESMO loop por
tile/spot dos feixes — mesma razão: não pagar o loop duas vezes), desenho em `v2/dots.js` (thin
instances de um disco, `CreateDisc` 12 lados).
- `rDot = sp.r·dm` (`dm = max(1, dotDensity)`) calculado **antes** do `continue` do cone de glint
  (`inCone`) — a orla larga do foco também dá pontos, verbatim `index-v2.html:445-447`. ✅
- Amostragem `T.dotHash < min(1, dotDensityLive)`. ✅
- Interseção `P + t·R` com os 3 candidatos (X, Y, Z-back — sem plano "à frente", câmara em +Z),
  `t>0` mais próximo, coordenadas do MUNDO (não há projeção de ecrã em 3D). ✅ **Verificado**:
  com elevações/azimutes extremos os 5 planos (esquerda/direita/teto/chão/fundo) são todos
  alcançáveis; com o rig default (elevações 12-20°) predominam esquerda/direita, o que é
  geometria correta do rig, não um bug (testado).
- Descarte por proximidade da câmara: `distToCam = X·ĉam < camD − 0.6`, onde `ĉam` é a direção
  bola→câmara — equivalente 3D ao `Z < camD − 0.6` de ecrã. ✅
- `I = dotCone·(0.6+0.4·dm)·NdS·sp.I / (1 + dotFalloff·t²)`, `size = T.dphi·dotScale`. ✅
- **Elongação por ângulo rasante**: `graze = |N·R̂|` (R já sai unitário da reflexão de vetores
  unitários — verificado numericamente), `elong = clamp(1/max(graze,0.2), 1, 4.5)`, calculada em
  `dots.js` (não guardada em `ball.dots`, para poupar um float/ponto). Eixo maior alinhado à
  projeção de R no plano do disco (rotação extra em torno de N). ✅ **Verificado**: fórmula testada
  isoladamente (graze 0.05→4.5×, graze 1→1×).
- Cor por instância `v = clamp(I,0,1)·dotMaxGrey/255`, descarta `v<8/255` — mesmo teto do Canvas
  2D. Material `StandardMaterial` sem luz, `emissiveColor` branco, `ALPHA_ADD`, sem depth write,
  greyscale. ✅
- **Medido** (cenário do brief: `spotCount=4, haze=0.6, beamFraction=1, dotDensity=0.8`): 27-72
  pontos ativos consoante a pose da bola/spots, 0 NaN no buffer de matrizes das thin instances.
- ⚠ **Divergência**: `N`/`R` guardados por ponto (`ball.dots`) em vez de só a normal com sinal —
  corrigido para o sinal correto (aponta para dentro da sala) depois de um bug inicial em que as
  paredes esquerda/direita partilhavam `N=[1,0,0]` sem distinguir o lado (não afetava `graze`,
  que usa `|N·R|`, mas afetava a translação `X + N·0.01` de `dots.js` — corrigido antes do handoff).

### 1.9 Auréola (`halo`)
✅ **Feita.** Disco billboard (`BILLBOARDMODE_ALL`) na posição da bola, raio 2.6 raios,
`opacityTexture` procedural gerada UMA vez (`DynamicTexture` 128px, gradiente radial `1→0` de
r=0.9 a r=2.6). `StandardMaterial` sem luz, `ALPHA_ADD`, sem depth write, `renderingGroupId 0` +
`alphaIndex -1` (desenha antes da bola no mesmo grupo). Alpha por frame = `0.05·halo·haze·
spotGain·(0.35+0.65·dk)` — verbatim `index-v2.html:406-407` (sem o termo `(1−0.75·exS)` da
explosão, fora do âmbito da Fase 4). `spotGain` = `E.spotGain` (sempre 1 nesta fase, sem motor) com
fallback à média de `sp.I` dos `mountedSpots` para quando a Fase 5 ligar o motor. **Medido**: alpha
0.009 com `halo=0.3` (default), 0 com `halo=0` — confirma o toggle.

### 1.10 Bloom
✅ **Feita.** `DefaultRenderingPipeline.bloomEnabled`, `bloomThreshold` (knob `bloom: limiar`,
default 0.8 — fonte = só o quase-branco, equivalente a `gl>0.35`), `bloomWeight` (knob `bloom:
força`), `bloomKernel = bloomBlurPx·2` (knob `bloom: raio px`), `bloomScale 0.5` (meia resolução,
como a bola original). Divergência estrutural aceite (documentada no plano): pipeline nativo do
Babylon em vez do único-blur-offscreen do Canvas 2D — visualmente equivalente, mede-se pelo
resultado (tiles a brilhar acendem o halo aditivo à sua volta), não pela implementação.

### 1.11 Grão e vinheta
✅ **Feita** (com uma divergência documentada). `pipe.grainEnabled`, `grain.intensity = grain·dk·K`
(`K=6`, calibrado a olho para aproximar o pattern 256² do Canvas 2D); `imageProcessing.
vignetteEnabled`, `vignetteWeight = vignette·dk·15` (fator `15` calibrado a olho — a escala do
`vignetteWeight` do Babylon não é 1:1 com o alpha 0-1 do Canvas 2D). Ambos multiplicados por `dk`
(só pesam em dark) — **medido**: grão 0.192→0.047 e vinheta 8.25→2.03 ao cruzar dark→white
(skinMix 0→0.75), confirma o comportamento.
⚠ **Divergência**: `grain.animated = false` fica **estático** em vez de reposicionado a cada 400 ms
(regra 6: nada > 3 Hz). A API pública do `GrainPostProcess` do Babylon 9.23 não expõe um método de
reseed do ruído sem tocar em internos não documentados (`_effectWrapper`); um grão estático ainda
respeita a regra (nunca muda, portanto nunca excede 3 Hz), mas não bate exatamente com o "grão que
troca a cada 400 ms" do original. Pendente: investigar se uma versão mais recente do Babylon expõe
isto, ou substituir por um `PostProcess` custom com seed via uniform (mesmo padrão do
`beamRamp`/`haloRamp`) se o David achar a diferença visível.

### 1.12 Corrente
✅ **Feita** (antecipada da Fase 6, pedido do David 2026-08-30). `ball.js: buildChain()/updateChainTone()`,
paridade com `web/index-v2.html:704-720` (`drawChain`):
- Elos **alternados** — na 2D pares = elipse "de frente", ímpares = barra "de lado"; em 3D é o **mesmo
  toro** rodado 90° em Y de elo para elo, que é o que aquelas duas formas representam. ✅
- Passo `L · 0.82` entre elos (`:719`). ✅
- Tom por elo `70 + 45·max(0, sin(i·0.9)) + 30·|litSide|`, `litSide = Σ(S.x · I)`, clamp **40-170** —
  verbatim de `:712-714`, com `litSide` lido dos **spots montados** (`ball.mountedSpots`, a mesma fonte
  de verdade da cadeia de cinza). Entra como **instance color** greyscale. ✅ **Medido**: com o rig
  de 2 focos, `litSide = −0.196` → tons 76/111/120/95 para i=0..3, batendo certo com a fórmula.
- Gancho no topo (`:709`, `arc(x, yTop − L·0.25, L·0.32)`) = toro fino em `y = 1 + L·0.25`. ✅
- Vai do topo da bola (`y = 1`) até `CONFIG.room.ceil` (4.2) → **87 elos** com o default.

⚠ **Divergências (documentadas):**
- **Escala.** `chainLinkPx` é em px de Canvas; aqui o mundo é em **raios da bola**. Na 2D a bola ocupa
  `ballSizeVH` (0.52) da altura do viewport → raio ≈ 0.26·H; com H ≈ 820 px, um elo de 11 px vale
  11/213 ≈ 0.05 raios. Adotou-se **0.045 raios por elo** como constante documentada
  (`CHAIN_PX_TO_RADII = 0.045/11` em `ball.js`), exposta no knob `chainLink` — quem afina mexe no
  knob, não na conversão. Consequência: ao contrário da 2D, a corrente **não** reescala com a altura
  do viewport (é geometria de mundo, como deve ser em 3D).
- **Um toro, não dois perfis.** A 2D desenha uma elipse ou uma barra; em 3D é um único toro
  (`CreateTorus`, `tessellation: 10`) em **thin instances** (1 draw call para os 87 elos) alternando
  90°. O "de lado" lê-se como a barra fina que liga anel a anel — ver screenshot de aproximação.
- **Não roda com a bola.** A corrente não é filha de `root` (uma corrente real fica quieta enquanto a
  bola gira no rolamento); na 2D a questão não se punha porque `drawChain` é desenhada à parte.
- **Fora do `ReflectionProbe`**, como a própria bola e o núcleo (`attachProbe` exclui `chain`/`chainHook`)
  — senão a corrente aparecia refletida nos espelhos de onde está pendurada.

Material: `PBRMaterial` metálico cinza (`metallic 0.85`, `roughness 0.38`), albedo 1 multiplicado pelo
instance color (greyscale) — mesmo padrão da malha de facetas. Tom recalculado a 20 Hz, junto com a
cadeia de cinza (`updateChainTone()` a seguir a `computeColors()`, que é quem monta `mountedSpots`).

### 1.13 Estrobo de fundo
⏳ Fase 4. Knobs no painel com sufixo `(fase 4)`.

### 1.14 Explosão em estilhaços
⏳ Fase 7 (máquina de estados idle→out→drift→hold/held→back, Rodrigues por tile).

### 1.15 Skin dark/white
✅ **Feita** (com uma divergência documentada). `CONFIG.skin ∈ {dark, white}` (`'auto'`, o default
do CONFIG, trata-se como `dark` nesta fase — precisa do motor de música/emoções da Fase 5, que
ainda não existe). Tecla `w`/`W` e botão `#skin` (só estes dois — **Regra 1 respeitada**: nenhum
código de motor/render toca em `CONFIG.skin`, só `setSkin()` chamado pela tecla/botão/`MB2.setSkin`).
Crossfade `skinMix += (target − skinMix)·(1 − exp(−skinEase·dt))`, verbatim `index-v2.html:331-333`.
`dk = 1 − skinMix` entra em halo/grão/vinheta (ver §1.9/§1.11). Fundo interpola `bgGrey → rgb(243,
247,249)` por frame (`applyBgGreySkin()`, chamada depois de `updateSkin()`). **Medido**: crossfade
dark→white→dark testado com tempo de parede real (não frames forçados): skinMix sobe/desce
suavemente (0→0.75 em 1.5s, 0.75→0.19 em 1.2s ao voltar), fundo interpola de `rgb(7,7,7)` para
`rgb(219,223,225)` a 90% do mix (convergindo para `243,247,249`).
⚠ **Divergência documentada**: o `#tone` do Canvas 2D é uma LUT SVG (`feComponentTransfer`, 3
tabelas de 33 valores fixos) aplicada como filtro CSS sobre um segundo canvas. Aqui aproxima-se
com `pipe.imageProcessing.contrast = 1 + 0.6·(1 − dk)` (sobe com skinMix) — não é a mesma curva
(a LUT crava as sombras a ~8% e levanta o meio-tom de forma não-linear; o knob `contrast` do
Babylon é uma curva simples). Se a leitura em white não bater com a bola atual, o próximo passo é
portar as 3 tabelas de 33 valores como uma `ColorGradingTexture` 1D (mesmo padrão dos `beamRamp`/
`haloRamp`: `DynamicTexture` gerada uma vez, sampled no post-process) — ficou fora do prazo desta
fase por ser mais trabalho que o "mais simples" que o brief autorizava.

### 1.16 Mini e scale
⏳ Fase 6 (`?mini=1`, `?scale=`). O brief F1 só copiou o `CONFIG` das linhas 69-165; a lógica das
linhas 166-176 fica para a Fase 6.

---

## 2. CONFIG (chaves não cobertas acima)

Todas as chaves de `docs/parity-canvas2d.md` §2 foram copiadas **verbatim** para `v2/config.js`
(`ballSizeVH`, `ballCenter`, `facetRows`, `spotCount`, `spotRadiusMul`, `mirrorGain`, `spotEdge`,
`glintSharp`, `glintK`, `beamMaxCount`, `beamLength`, `beamGlowZ`, `dotScale`, `dotMaxGrey`,
`dotFalloff`, `bloomStrength`, `bloomBlurPx`, `seamDarkness`, `rimStrength`, `baseTileGrey`,
`litSideGain`, `camDistance`, `room.*`, `grain`, `vignette`, `chainLinkPx`, `driftPeriod`,
`perf.*`, `skin`/`skinEase`/`skinAutoValence`, `spotFadeMix`, `explode.*`). ✅

Chaves **novas** do spike Babylon (não existem na Canvas 2D, defaults do brief F1):
`tileSizeVar 0.35`, `tileTone 'hash'`, `tileLayout 'offset'`, `mirrorMetallic 0.92`,
`mirrorRoughness 0.22`, `envIntensity 2.4`, `spotLightIntensity 900`, `spotDist 6.0`. ✅

---

## 3. Coreografia (`choreo`)
⏳ `stepChoreo` verbatim fica para a Fase 5 (junto com `window.MIRRORBALL` completo). Nesta fase
os campos de `CONFIG.choreo` existem e têm knobs no painel `d`, mas nada os lê ainda — os
SpotLights usam só `az/el/intensity/radius` estáticos dos `spots[]`.

---

## 4. API `window.MIRRORBALL`
⏳ Fase 5. Nesta fase existe só `window.MB2 = { scene, engine, camera, cfg, __perf }`, conforme o
brief F1 (não é a mesma API — é o equivalente de diagnóstico do spike v1, `window.SPIKE`).

---

## 5. Painel `d` — 54 sliders

✅ **Completo desde a Fase 1.** `v2/panel.js` replica os 54 sliders de `web/index-v2.html:774-830`
com **os mesmos nomes, ordem, ranges e steps**. Sliders cujo efeito ainda não existe (feixes,
cone incidente, pontos na parede, estrobo, auréola, disjuntores de fase futura) levam sufixo
` (fase N)` no label — o valor persiste na mesma, só o comportamento chega depois.

✅ **Fase 2 — sufixo removido dos knobs agora ligados:** `focos: quantos`, `focos: raio ×`,
`focos: orla`, `espelhos: brilho`, `spot0-3: az°/el°`, `luz geral (volume/az°/el°)`,
`bola: luz/contraste`, `sphereOpacity (motor manda)`, `opacidade: motor manda (0/1)`,
`luz indireta`, `indireta: área°` (já sem ` (fase 2)`). `spotFadeMix` fica **sem slider próprio**
(não existe no array de 54 do original — é lido diretamente do `CONFIG` por `ball.update`, como
o brief pediu; "wired" aqui significa que o `SpotLight`/mancha já respeitam o valor, não que
ganhou um knob novo fora dos 54).

✅ **Checkboxes `spot i`** (`web/index-v2.html:884-889`), uma linha por foco (0-5) →
`CONFIG.spots[i].on`. Testado no browser: desligar `spot 0` apaga a `SpotLight` correspondente
no frame seguinte (`isEnabled()===false`), religar acende-a.

✅ Mesmo `PERSIST` (tudo antes do bloco "bola" + `feixes: fração máx`, `haze máx`, os 3 `motor
manda`) — ficam de fora `rotationRpm`, `sphereOpacity`, `health`.

✅ Persistência em `localStorage['mb2.knobs']` — **chave própria**, não colide com `mb.knobs` da
bola Canvas 2D atual (arbitragem entre as duas instâncias, como pedido no brief).

✅ `KNOB_DEFAULTS` capturado antes de aplicar o localStorage; `knobsGet()`/`knobsSet(obj, persist)`
implementados com a mesma assinatura.

✅ Botões "repor ficheiro gravado" (desativado — só liga na Fase 5, quando houver `music-config.json`
a carregar), "repor knobs (defaults)" (funcional — limpa `mb2.knobs` e aplica `KNOB_DEFAULTS`),
"gravar" (desativado até à Fase 5, conforme o brief).

✅ `localStorage['mb2.dbgSize']` — 1-3 colunas, escala 0.7-1.5, mesmo mecanismo (`--dbgCols`/
`--dbgScale`).

➕ **Novos** (Fase 1, fora dos 54): `espelhos: variação`, `espelhos: tom (0=hash/1=real)`,
`espelhos: alinhados (0/1)`, `pbr: metallic`, `pbr: roughness`, `pbr: ambiente`, `focos: luz (lm)`,
`focos: distância`. Mudar filas/variação/tom/alinhados chama `ball.rebuild()` via o hook
`onRebuildBall` passado a `initPanel()`.

➕ **Novos (Fase 2, fora dos 54):** `pbr: glint mix` (`CONFIG.glintPbrMix`, 0-1, default `0.5` —
lido pelo `ball.js` do Opus para pesar CPU vs. PBR no glint, ver §1.2), `indireta: luz ×`
(`CONFIG.ambientLightMul`, 0-3, default `0.6` — multiplica a intensidade das `RectAreaLight`).

➕ **Extra pedido pelo David (Fase 2, cor RGB dos focos — não existe na bola Canvas 2D):**
`focos: cor (0/1)` (`CONFIG.spotColorOn`, default `0`) + `spot0-3: R/G/B` (`CONFIG.spots[i].rgb`,
default `[1,1,1]`, i<4). Todos persistem em `mb2.knobs` como os restantes. Ver §1.3 para o
comportamento (só afeta as `SpotLight`, nunca a cadeia de cinza CPU).

✅ **Fase 3 (Sonnet) — sufixo removido dos knobs dos 54 agora ligados:** `cone incidente`,
`cone: alcance`, `cone: largura máx`, `cone: teto (raios)` (`v2/incident.js`); `feixes: fração máx
(motor modula)`, `feixes: largura°`, `feixes: dispersão`, `haze máx (motor modula)`, `feixes+haze:
motor manda (0/1)` (prontos para `v2/beams.js` do Opus — ainda não existe, `main.js` tolera).
`feixes: compr. 3D (fase 3)` e `auréola (fase 3)` ficam suffixed (não usados por `beams.js`/ainda
sem implementação, respetivamente). `PERSIST` atualizado para os novos nomes sem sufixo.

➕ **Novos (Fase 3, fora dos 54):** `feixes: intensidade` (`CONFIG.beamIntensity`, 0-0.18, clamp
duro ao teto invulável do CLAUDE.md — regra 6), `feixes: glow z` (`CONFIG.beamGlowZ`, 0-1),
`feixes: glow ×` (`CONFIG.beamGlowMul`, 0-1, default **0.25** — peso do brilho aditivo por cima do
cone frontal; ver §1.6, correção 2026-08-30),
`feixes: comprimento` (`CONFIG.beamLen`, 2-12, default 6 — knob pedido pelo brief F3-Opus para o
comprimento do cone de `beams.js`, distinto de `beamLen3D`/`feixes: compr. 3D` legado).

➕ **Novos (Fase 3, pedido do coordenador — correções do David 2026-08-30, chaves do Opus em
`config.js`):** `corrente (0/1)` (`CONFIG.chainOn`, rebuild), `corrente: elo (raios)`
(`CONFIG.chainLink`, 0.01-0.15, rebuild), `espelhos: junta (real)` (`CONFIG.seamGreyReal`, 0-1, ao
vivo — `ball.js` lê em `syncMaterial()` todos os frames, sem rebuild), `espelhos: junta larg.
(real)` (`CONFIG.seamInsetRealMul`, 0-1, rebuild), `espelhos: junta var. (real)`
(`CONFIG.seamVarRealMul`, 0-1, rebuild). Testado no browser: os 5 sliders aparecem no painel,
valores refletem `config.js`, `rebuild()`/render sem exceções.

---

## 6. Performance adaptativa
✅ **Feita.** `frameEma = frameEma·0.9 + dtMs·0.1` (`dtMs` do `dt` real do `registerBeforeRender`,
clampado a 50 ms). `frameEma > perf.targetMs` → `dotDensityLive = max(perf.minDotDensity,
dotDensityLive·0.97)`; senão recupera `×1.005` até `CONFIG.dotDensity`. `ball.dotDensityLive` é um
setter (`main.js` escreve todo o frame) — guarda `Number.isFinite` (regra 7). **Só os pontos na
parede degradam** — feixes/facetas/glint/bloom não têm degradação automática, como pedido.
HUD mostra `dots N · dens X.XX`. **Medido**: com `perf.targetMs` forçado a 2 ms (render real ~11 ms
no ambiente de teste), `dotDensityLive` desceu de 0.8 para 0.21 em 20 frames; com `targetMs`
generoso (1000 ms) recuperou 0.21→0.27 em 50 frames — confirma as duas direções. Cenário do brief
(`spotCount=4, haze=0.6, beamFraction=1, dotDensity=0.8, spotRadiusMul=2.5` para forçar
`beamMaxCount=110`): **110 feixes + 72 pontos, `MB2.__perf()` mediana 5.7 ms** (tab automatizado,
sem foco — abaixo do teto de 8 ms pedido).

---

## 7. Invariantes a preservar
- `beamIntensity ≤ 0.18` — ainda não relevante (sem feixes nesta fase); o valor no CONFIG já
  respeita o teto (`0.16`).
- Greyscale puro — respeitado **por defeito**: sala/luzes/spot em `Color3(g,g,g)` ou luz branca
  sem tingir; a malha da bola (Opus) é responsável pela cor final dos tiles (sempre greyscale,
  não lê `rgb`). ⚠ **Exceção deliberada, opt-in, pedida pelo David**: `CONFIG.spotColorOn`
  (default `false`) permite colorir as `SpotLight` via `spots[i].rgb` — só as luzes Babylon, a
  bola em si mantém a cadeia de cinza. Com o default a bola continua greyscale puro.
- Guardas `Number.isFinite` — todo o campo novo em `CONFIG` (`tileSizeVar`, `mirrorMetallic`,
  `mirrorRoughness`, `envIntensity`, `spotLightIntensity`, `spotDist`, `ambientLightMul`,
  `glintPbrMix`) tem valor inicial finito; leituras de `ball.mountedSpots`/`ambientPoses` em
  `main.js` usam `num(v, d)` (guarda local) antes de escrever em `Vector3`/`intensity`.
- `prefers-reduced-motion` — ⏳ não tratado nesta fase (a bola gira sempre via `ball.update`;
  fica para quando a coreografia real existir, Fase 5).

---

## Feito quando (critério do brief F1)
- `http://127.0.0.1:8099/v2/index.html?webgl=1` abre sem erros. ✅ **Testado no browser real**
  (Chrome, `?webgl=1`): consola sem exceções, `#err` vazio.
- Bola do Opus visível iluminada por 2 spots. ✅ **Testado**: `v2/ball.js` carrega (2938 tiles),
  a malha facetada aparece com glints nos spots. Nota de teste: com `mirrorMetallic 0.92` /
  `mirrorRoughness 0.22` e a `ReflectionProbe` da sala já wired pelo Opus, a bola lê-se com
  contraste correto (facetas + glints visíveis) — confirmado com metallic/roughness reduzidos
  temporariamente para validar que luzes/material respondem (comportamento normal de PBR
  metálico sem muito ambiente: precisa da ReflectionProbe para não ficar carregada).
- Painel `d` com todos os knobs a persistir entre reloads. ✅ **Testado**: mudei `focos: quantos`
  de 2→4 via slider, `localStorage['mb2.knobs']` gravou, recarreguei a página e `CONFIG.spotCount`
  voltou a 4 com 4 `SpotLight` reconstruídas — repus 2 no fim do teste.
- HUD com ms. ✅ **Testado**: mediana de `scene.render()` ~3-4 ms (WebGL2), facetas/focos/filas
  no HUD.
- `?webgl=1` funciona (força `BABYLON.Engine` em vez de tentar `WebGPUEngine`). ✅ **Testado**:
  consola confirma `Babylon.js v9.23.0 - WebGL2`.

### Bug encontrado e corrigido durante o teste
`ArcRotateCamera` com `alpha = -PI/2` colocava a câmara em `(0,0,-camDistance)`, não
`(0,0,+camDistance)` como pede o brief (convenção Babylon: `x=r·cos(alpha)·sin(beta)`,
`z=r·sin(alpha)·sin(beta)`; para `z=+r` com `beta=PI/2` precisa `alpha=+PI/2`). Corrigido em
`v2/main.js` (`ALPHA0 = Math.PI / 2`) — sem isto a câmara ficava a olhar a bola pelo lado errado
(`dirFromAzEl` assume az=0 = direção da câmara = +Z).

---

## Feito quando (critério do brief F2-Sonnet)
- `?webgl=1` sem exceções. ✅ **Testado**: `#err` vazio, consola sem erros, `MB2.__perf().err`
  confirmado vazio via `javascript_tool`.
- 4 focos e 3 indiretas visíveis na bola e nas paredes da sala. ✅ **Testado**: com
  `cfg.spotCount=4`, `scene.lights` mostra `spot0..spot3` com `isEnabled()=true` e `spot4/spot5`
  `false`; as 3 `RectAreaLight` (`ambient0..2`) ficam `isEnabled()=true` com
  `intensity=spotLightIntensity·A.intensity·ambientLightMul` (medido: `900·0.07·0.6=37.8`,
  bate certo). Screenshot confirma a bola iluminada e o painel a listar os knobs sem sufixo.
- Checkboxes apagam focos. ✅ **Testado**: clicar `spot 0` no painel (DOM real, não só JS) desliga
  `CONFIG.spots[0].on` e a `SpotLight` correspondente fica `isEnabled()=false` no frame seguinte;
  religar volta a `true`.
- Knobs de az/el movem foco e mancha em conjunto. ✅ Por construção: `main.js` lê `S`/posição de
  `ball.mountedSpots[i]` quando existir (o Opus recalcula a mancha a partir do mesmo `CONFIG.spots[i].az/el`
  que o slider escreve) — fonte única; no fallback local (`ball.mountedSpots` ausente) a
  `SpotLight` já lê `dirFromAzEl(sp.az, sp.el)` diretamente do mesmo `CONFIG.spots[i]`, portanto
  qualquer mudança de az/el desloca luz e (quando o Opus publicar o cone) mancha ao mesmo tempo.
- `MB2.__perf()` < 8 ms. ✅ **Medido**: `medianRenderMs ≈ 1.1 ms` com `spotCount=2` (2938→6596
  tiles conforme `facetRows` da sessão), `≈ 4.2 ms` com `spotCount=4` + `ambient.n=3` (60 amostras,
  WebGL2, `?webgl=1`). Uma amostra pontual de ~90 ms/11 fps apareceu durante um `scroll` da UI de
  automação com o separador momentaneamente em segundo plano — confirmado transitório (voltou a
  ~1-3 ms no frame seguinte); é o efeito descrito em `docs/babylon-reference.md` §9, não uma
  regressão de performance do código.

### O que ficou por ligar (Sonnet, Fase 2)
- `areaLightEmissionTexture` nas `RectAreaLight` (área texturada da sala, `docs/babylon-reference.md`
  §3) — ficam lisas por agora.
- `ball.mountedSpots`/`ball.ambientPoses` ainda não existiam em `ball.js` no momento do teste (o
  Opus estava a meio do brief F2 em paralelo) — validado com o **fallback** local; `main.js` já
  está pronto para preferir o array do Opus assim que ele o expuser (sem alteração necessária
  deste lado). Falta um teste lado a lado depois de o Opus publicar `mountedSpots`/`ambientPoses`
  para confirmar que a fonte única de verdade bate certo (fade/choreo incluídos).
- `spotFadeMix` não ganhou slider próprio (não está nos 54 originais); fica só como leitura direta
  de `CONFIG` pelo `ball.update` do Opus.
- Feixes, cone incidente, pontos na parede, estrobo, bloom/grão/vinheta, corpos PAR36, coreografia
  real (`stepChoreo`) — fora do âmbito desta fase (F3-F7), como já estava documentado.

### Knobs novos desta fase (nomes exatos)
- `pbr: glint mix` → `CONFIG.glintPbrMix` (0-1, default 0.5).
- `indireta: luz ×` → `CONFIG.ambientLightMul` (0-3, default 0.6).
- `focos: cor (0/1)` → `CONFIG.spotColorOn` (default 0/false) — extra pedido pelo David.
- `spot0: R` / `spot0: G` / `spot0: B` … `spot3: R/G/B` → `CONFIG.spots[i].rgb` (i<4, 0-1,
  default `[1,1,1]`) — extra pedido pelo David.
- Checkboxes `spot 0`…`spot 5` (não são sliders, não persistem em `mb2.knobs`) → `CONFIG.spots[i].on`.

## Notas do orquestrador (F2, 2026-08-30)
- `RectAreaLight`: intensidade tem escala própria (~0.1-2); a fórmula `spotLightIntensity·I·mul` (≈38) lavava a cena a branco. Agora `intensity = ambient.intensity·I·ambientLightMul` (default 5 → ≈0.35). Knob `indireta: luz ×` 0-20.
- `attachProbe(room.planes)` não estava a ser chamado — `reflectionTexture` era null e `envIntensity` não fazia nada. Ligado em `main.js`.
- Osso do raio-X: em Babylon 9 `LinesMesh.alpha` não blenda sozinho; aplica-se também `material.alpha` + `needAlphaBlending`. Knobs `raio-x: osso (0/1)` e `raio-x: osso alpha ×` (default 0.35 — a 1.0 lia demasiado forte).
