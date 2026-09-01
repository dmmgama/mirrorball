# Research: passar trabalho de CPU para GPU na MirrorBall (spike-babylon/v2)

Data: 2026-09-01 · Baseado em leitura de código real (não genérico). Ver §7 para o que é
MEDIDO vs ESTIMADO vs SUPOSTO.

## 0. Resumo executivo (ver §7 no fim para as 3 maiores oportunidades)

O spike v2 já faz várias das coisas "certas" (thin instances na corrente, typed arrays
pré-alocados, RENDER_ONCE no probe, guardas de mutação em vez de reatribuição). O que falta
não é "mover trabalho para GPU" no sentido de reescrever em shaders — é **reduzir o CPU
por-frame que hoje escreve buffers para a GPU todos os frames em vez de só quando muda**, e
**não pagar 4-8 loops por-tile onde 1 chegaria**. A cadeia de cinza da bola (`ball.js`
`computeColors`) é hoje o único candidato real a "trabalho pesado" — e mesmo esse é
CPU→upload, não GPU compute, porque a lógica depende de ramos condicionais por-tile (spots,
oclusão, explosão) que não valem a pena portar para WGSL nesta escala (≤4000 tiles).

## 1. Onde está o custo hoje (inventário CPU por frame)

### (a) Trabalho de cena por-frame em JS

| Onde | O quê | Ficheiro:linha | Escala |
|---|---|---|---|
| `computeColors()` | Loop por-tile (até ~4000 tiles) × por-spot (até ~8): normal, glint, cadeia de cinza 8 passos, feixe R=2(N·S)N−S, interseção com 3-5 planos p/ dots, oclusão por-cilindro (até 80 pessoas) | `ball.js:921-1357` | maior loop aninhado do spike |
| Oclusão dos vultos | Pré-filtro barato (2 comparações) + até 80 testes de cilindro **por dot candidato** | `ball.js:1180-1206` | medido: 4,8 ms sem pré-filtro → 0,6 ms com ele (`ball.js:1028-1035`) |
| `mikado.generate()`/`crowd.generate()` | Sorteio rejeitivo (RNG seeded), só no rebuild, nunca por frame | `mikado.js:272-482`, `crowd.js:280-438` | barato, não é hot path |
| `crowd.update()` dança | Loop 80 pessoas × ~10 operações trig, escreve position/rotation em TransformNode | `crowd.js:735-793` | medido: mediana 0,0 ms, máx 0,2 ms/300 frames (`docs/f15-vultos.md:318`) |
| `mikado.update()` | Loop `MAX_BLOCKS`=12 (emissivo) + 4 luzes; geometria não recalculada por frame | `mikado.js:731-831` | barato |
| `updateSpotLights()` | Loop até `MAX_SPOTS` (spots+flashes+2), 1 posição+direção+ângulo cada | `main.js:559-618` | barato, ~10-15 luzes no pior caso |
| `excludeBallFromRoomLights`/`applyCrowdOcclusion` | Comparação de estado + `Array.filter`/`Set` só quando muda (idempotente) | `main.js:912-968` | barato, guardado por comparação |
| `finalizeBeams()` | `TypedArray.sort` sobre até `tiles.length` índices, comparador por I desc | `ball.js:871-890` | ordena in-place, sem alocação |

**Padrão geral:** o resto do código (`hats.js`, `robots.js`, `incident.js`, `fixtures.js`)
são loops pequenos, com N ≤ 12-40, atualizando `position`/`rotation`/`intensity` de meshes já
existentes — nenhum é candidato a GPU offload, o custo é dominado por overhead de chamada, não
por trabalho.

### (b) DSP de áudio (`web/music.js`)

`music.js` **não faz FFT nem análise de sinal** — isso já corre fora do processo (o
`audio-sidecar` externo, WASAPI loopback, porta 3739) e chega como JSON via WebSocket/
postMessage a 50 Hz: `{rms,bass,mid,high,sub,hat,centroid,density,onset,subOnset,...}`
(contrato no cabeçalho de `music.js:24-57`). O que `music.js` faz com isso é:
- deteção de kick/grid por limiares e flux linear (`§KICK`/`§GRID`, poucos escalares);
- uma máquina de estados (FSM GROOVE/BUILD/BREAKDOWN/PRE_DROP/DROP);
- 8 gestos teatrais com RNG seeded (`GESTURES`, `music.js:1764`);
- escreve ~10-20 escalares em `CONFIG`/`window.MIRRORBALL` por frame.

Isto é **trabalho escalar sobre ~20 números, 50×/s**. Não há paralelismo a explorar (não há
milhares de elementos independentes) e o custo real medido nunca apareceu como problema em
nenhum handoff — o problema documentado é sempre no lado 3D (mikado, probe, cadeia de cinza).

### (c) Upload de buffers para a GPU

| Buffer | Quando é escrito | Ficheiro:linha |
|---|---|---|
| `colors` (vertex color, 4000×4×4 = 4 floats/vértice) | **Todos os frames em que a cadeia corre** (20 Hz em idle, todos os frames em explosão) via `mesh.updateVerticesData(ColorKind,...)` | `ball.js:1354` |
| `positions`/`normals` da bola | Só quando `exOn` (explosão) — 0 custo em idle (comentário explícito no cabeçalho, `ball.js:37-48`) | `ball.js:1337-1352` |
| `chain` thin instance color | Só quando `mountedSpots` muda de facto (por frame, mas pequeno: até ~40 elos) | `ball.js:654-670` |
| dots/beams (thin instances) | Por frame, via `dots.js`/`beams.js` (não lidos linha-a-linha aqui, mas seguem o mesmo padrão: `ball.dots`/`ball.beams` já vêm compactados de `ball.js`) | consumidos de `ball.beams`/`ball.dots` |
| `room.material.emissiveColor` (estrobo) | **Bug já corrigido**: reatribuir a Color3 custava **+73 ms/frame** (recompilação de shader); a correção foi mutar `.set()` na Color3 existente | `main.js:1440-1447` — nota de perf explícita no código |

Este último ponto é o achado mais importante do inventário: **o maior custo de GPU já
observado no repo não foi "falta de GPU", foi reatribuição de propriedade de material a
disparar recompilação de shader**. O padrão `.set()` em vez de `= new Color3(...)` está agora
copiado em `room.js:17-23`, `mikado.js:812`, `crowd.js:198-199` — é a lição já aprendida e
aplicada, mas vale a pena verificar se ficou algum sítio esquecido (grep rápido por
`\.albedoColor =` / `\.emissiveColor =` fora do construtor seria a forma de auditar).

### (d) O que já está em GPU

- **Reflexão da bola**: PBR real (`metallic`/`roughness`/`environmentIntensity`) + `ReflectionProbe`
  256px, `REFRESHRATE_RENDER_ONCE` — o cubo só é re-renderizado quando algo pede
  `refreshProbe()` (mudança de geometria), não todos os frames (`ball.js:672-708`).
- **Corrente**: thin instances (`chain.thinInstanceSetBuffer('matrix'...)`, `ball.js:633`) —
  já é o padrão certo.
- **Pós-processo**: `DefaultRenderingPipeline` (bloom, grão, vinheta, tonemap ACES) — tudo
  shader, `main.js:1315-1348`.
- **Iluminação**: SpotLight/PointLight/RectAreaLight/HemisphericLight nativas — o Babylon já
  resolve isso no shader do PBRMaterial.
- **Feixes/dots**: descritos como "thin instances" no cabeçalho de `ball.js` (o desenho vive
  em `beams.js`/`dots.js`, a fonte é CPU em `ball.js`).

## 2. O que vale a pena mover e o que NÃO vale

### Não vale a pena

1. **`music.js` (motor de música) — não mexer.** 50 Hz sobre ~20 escalares, com ramos de FSM e
   RNG seeded. Isto é *branch-heavy scalar code*, o pior caso possível para GPU (SIMD/warps
   divergem em cada `if`). Uma compute pass custaria mais em upload/readback (CPU↔GPU a 50 Hz)
   do que o próprio cálculo custa hoje em CPU. **Nunca portar.**
2. **Deteção de kick/grid do sidecar** — já está fora do browser (Node/WASAPI), fora do
   escopo deste report e correta onde está.
3. **`mikado.update()`/`crowd`-dança/`hats.update()`/`robots.update()`** — N pequeno (≤80),
   custo já medido como ~0 ms (`crowd.js` mediana 0,0 ms). Reescrever em shader custaria mais
   em complexidade (regra 9 do CLAUDE.md — compatibilidade de presets — cada shader custom
   também tem de ser versionado) do que ganha.
4. **A FSM do estrelato (`stardom.js`)** — sorteio ponderado sobre 4 estrelas, ramp de 4
   escalares. Trivial.

### Vale a pena, por ordem de retorno esperado

1. **Reduzir a frequência/âmbito do upload de `colors`** (ball.js:1354) — é o único buffer
   grande (até 4000×16 floats) escrito **todos os frames em que a cadeia corre**. Hoje já
   corre a 20 Hz em idle (`COLOR_HZ = 20`, `ball.js:899`) — bom — mas em explosão corre a 60 Hz
   porque precisa (comentário explícito, `ball.js:1432-1433`). Não há aqui uma vitória fácil
   sem tocar na física da explosão; a vitória real está no ponto seguinte.
2. **Cortar o loop por-tile quando não há nada a fazer** — já parcialmente feito
   (`emitBeams`/`emitDots` são flags booleanas calculadas uma vez por frame, `ball.js:958,998`)
   mas o loop principal (`nx`/`ny`/`nz3`, `facing`, `lit`, cadeia de 8 passos) corre sempre
   para todos os tiles, mesmo quando `sphereOpacity` é 0 ou a bola está fora do ecrã.
3. **Thin instances no mikado e nos vultos** — hoje são meshes reais separadas por barra/pessoa
   (`mikado.js:180-221`, `crowd.js:236-271`), não thin instances. Ver §3.1 para a análise
   detalhada de custo/risco.

## 3. Técnicas aplicáveis, por ordem de retorno/esforço

### 3.1 Thin instances vs instâncias normais vs meshes reais

**Estado atual, por elemento:**

| Elemento | Hoje | Pool | Draw calls no pior caso |
|---|---|---|---|
| Corrente | thin instances | dinâmico (elos até ao teto) | 1 |
| Tiles da bola | 1 mesh única (VertexData), não instanciada | fixo (~2938-4000) | 1 (é uma única mesh com todos os tiles) |
| Mikado | **meshes reais** por barra (6/barra: tube, rail, 2×cap, 2×rod) | `MAX_BARS=112` | até 672 meshes, cada uma 1 draw call (mas materiais partilhados por bloco, `MAX_BLOCKS=12`) |
| Vultos | **meshes reais** por pessoa (8/pessoa: hip, torso, head, hair, 2×arm, 2×leg) | `MAX_PEOPLE=80` | até 640 meshes |
| Chapéus | pool fixo, `MAX_HATS=12` | pequeno, não é gargalo |

**Os tiles da bola já são o caso ótimo**: uma única mesh com `VertexData` (4 vértices/tile),
não precisa de thin instances porque **não há repetição de geometria idêntica** — cada tile
tem posição/normal/cor próprias calculadas em CPU (é precisamente isso que a cadeia de cinza
faz). Thin instances servem para repetir a MESMA malha em N transforms; aqui cada tile já É
único. Nada a fazer aqui.

**Mikado e vultos são os candidatos reais.** Hoje são 672+640 = ~1300 meshes reais no pool
(a maioria `setEnabled(false)`). Isto:
- Cada mesh desligada não custa por-frame (Babylon não a processa se `isEnabled()===false`) —
  **confirmado no código** (`mikado.js:82-86`, "só as em uso ficam setEnabled(true) — as
  outras não custam nada por frame").
- O que custa é: (a) o **refresh do probe** (RENDER_ONCE) tem de percorrer a `renderList`
  inteira, que inclui todas as meshes montadas + espera cada uma resolver o seu material; (b)
  draw calls extra para as barras/pessoas que ESTÃO ligadas — no pior caso (sala-toda +
  80 vultos) isso é potencialmente **112 + 80 = 192 objetos visíveis**, cada um com 6-8
  sub-meshes = **até ~1100 draw calls só nestes dois elementos**.

**Conversão para thin instances — ganho estimado vs esforço:**
- Mikado: as 6 partes/barra (tube, rail, 2 caps, 2 rods) já partilham geometria idêntica entre
  barras (só escala/posição/rotação mudam) e materiais são partilhados por bloco (`tubeMats[block]`,
  `railMat` único). É o caso de livro-texto para thin instances: 6 meshes base × `MAX_BARS`
  transforms cada, em vez de 672 meshes. **Draw calls cairiam de ~672 para 6** (ou 6×`MAX_BLOCKS`
  se quiser cor por bloco via thin instance color buffer, que já é o padrão usado na corrente).
  - Esforço: médio — a geometria já é gerada e aplicada de uma vez no `rebuild()`/`layout()`
    (não por frame), então a conversão é maioritariamente trocar `MeshBuilder.Create...()` +
    `setEnabled` por `thinInstanceSetBuffer('matrix', ...)` + `thinInstanceCount`. **Risco**:
    thin instances com `count=0` NÃO escondem a mesh base — é uma armadilha já documentada no
    próprio repo (`docs/handoff-2026-09-01-S10.md:61`: "Thin instances: count=0 NÃO esconde a
    mesh base → setEnabled acompanha sempre o count"). Fácil de reintroduzir esse bug ao migrar.
  - **Risco maior**: thin instances **não entram individualmente com cor/material diferente por
    barra a menos que se use um instance color buffer** — hoje cada barra tem `bar.tube.material
    = tubeMats[g.block % MAX_BLOCKS]` (material por objeto). Para manter isso com thin instances
    seria preciso um buffer de cor por instância (o mesmo padrão já usado em `chain` — ver
    `ball.js:634-670`), o que é possível mas exige reescrever o "acender por bloco" — não é
    trivial, é o corpo do brief F11/§5.
  - **Regra 6 do repo** (meshes reais na renderList do probe, nunca TransformNode) continua a
    aplicar-se: thin instances SÃO meshes reais (a mesh base), por isso não violam essa regra —
    mas há uma nota da doc oficial a confirmar antes de migrar (ver §4).

- Vultos: MENOS óbvio. As 8 partes/pessoa têm escala/proporção **diferentes por pessoa**
  (altura, largura de ombros, tipo de cabelo — 6 variantes de forma, não só transform). Thin
  instances só variam a MATRIZ (posição/rotação/**escala**) e a cor por instância — não a forma
  da malha. Como a "forma" de uma pessoa já é só caixas/esferas escaladas de formas base
  (torso, hip, head, hair×6-variantes-mas-todas-esferas-escaladas, arm, leg), **é viável**:
  agrupar por parte anatómica (torso, hip, head, arm, leg = 5 meshes base + até 6 variantes de
  cabelo = 6 meshes base) e usar `thinInstanceSetBuffer('matrix', ...)` por parte, com a escala
  codificada na matriz. Isto reduziria de ~640 para ~11 meshes base.
  - Esforço: médio-alto — a dança (`crowd.js:735-793`) hoje escreve `rotation.x/y/z` e
    `position` em `TransformNode`s **por frame** (o "peso de um pé para o outro"). Com thin
    instances, essa animação passaria a exigir recompor a matriz 4×4 completa por-pessoa
    **por-frame** em CPU e reescrever o buffer inteiro via `thinInstanceSetBuffer` a cada frame
    — o que é, na prática, o MESMO custo CPU que hoje (mutação de `TransformNode.rotation`)
    mais a serialização para matriz. **Não é uma vitória de CPU**; é só uma vitória de draw
    calls. Vale a pena SE o gargalo medido for draw calls, não CPU.

**Conclusão §3.1**: thin instances no mikado são retorno alto/esforço médio, com um risco
concreto e já documentado (armadilha count=0). Thin instances nos vultos são retorno médio
(só draw calls, não CPU) e esforço mais alto (a dança teria de reescrever matrizes por-frame).
**Recomendação: mikado primeiro, vultos só se a medição (§6) mostrar draw calls como gargalo
real no pior caso.**

### 3.2 Vertex shader / custom material para animação em vez de mexer posições em JS

A explosão (`ball.js` bloco `// ---- F7 explode ----`, linhas ~1063-1325) já faz Rodrigues por
tile em CPU e reescreve `positions`/`normals` inteiros via `updateVerticesData` — isto É o
candidato clássico para "shader de vértice": a rotação de Rodrigues por-tile é matematicamente
paralela e sem dependência entre tiles.

**Mas**: os MESMOS `px/py/pz`/`nx/ny/nz` calculados na explosão alimentam DIRETAMENTE o loop
de feixes e dots (comentário explícito, `ball.js:44-48`: "Feixes/pontos/glint nascem do MESMO
loop, logo saem de P/N novos sem código extra"). Se a posição/normal fossem movidas para um
vertex shader, o CPU deixaria de ter acesso a `px/py/pz` para o raycasting dos dots e dos
feixes — seria preciso duplicar o cálculo (CPU para os raios, GPU para o desenho) ou fazer
readback GPU→CPU (caro, quebra pipelining). **Não vale a pena**: a arquitetura atual
deliberadamente paga o cálculo em CPU UMA VEZ para servir três consumidores (vertex color,
feixes, dots) — mover só a posição para GPU quebra essa partilha sem eliminar o custo, só o
duplica.

### 3.3 Compute shaders (só WebGPU)

Aplicável em teoria à cadeia de cinza (`computeColors`), que é o maior loop do spike. Mas:
- **Só funciona em WebGPU** — o caminho WebGL2 (`?webgl=1`) teria de manter o código CPU
  atual como fallback, **dobrando a manutenção** de uma lógica que já tem 400+ linhas com
  comentários de correções acumuladas (F3-F15).
- Compute shaders em Babylon exigem um pipeline próprio (`ComputeShader`, storage buffers,
  bind groups) e o resultado tem de voltar a um vertex/instance buffer para o desenho — não é
  drop-in.
- A cadeia de cinza depende de **estado externo por-frame que muda a cada chamada**: até 8
  spots montados (`mountedSpots`), até 80 cilindros de oclusão, flags de explosão — tudo isto
  teria de ser empacotado em storage buffers e re-enviado por frame, o que é o MESMO custo de
  upload que hoje existe para `colors`, só que multiplicado pelos buffers extra de entrada.
- **Ganho real**: com ≤4000 tiles × ≤8 spots = ≤32.000 iterações do loop interno, isto está
  MUITO longe da escala onde compute shaders compensam (tipicamente >100k-1M elementos). O
  próprio `docs/babylon-reference.md:322` mede 4,30 ms com 3992 facetas + 4 focos + 56 feixes —
  já está bem dentro do orçamento de 17,5 ms.

**Recomendação: não perseguir compute shaders nesta escala.** Seria esforço alto, risco alto
(quebra o caminho WebGL2, que é o fallback que hoje funciona), para um problema que os números
medidos dizem que não existe (4,3 ms de 17,5 ms disponíveis).

### 3.4 Storage buffers

Só fazem sentido a par de compute shaders (§3.3) ou para geometria muito grande partilhada
entre draw calls. Não há caso de uso isolado aqui — ver §3.3.

### 3.5 `freezeActiveMeshes`/`freezeWorldMatrix`/material freezing

- **`freezeWorldMatrix()`**: aplicável a qualquer mesh cuja transform NÃO muda por frame —
  candidatos óbvios: os 5 planos da sala (`room.js`), os pilares, os chapéus quando não estão
  a fazer flash (a base não se move, só o material emissivo muda — e material não é afetado
  por freeze de world matrix). **Ganho estimado: pequeno mas grátis** — a sala é estática desde
  o arranque até um `rebuild()`. Esforço: trivial (uma chamada por mesh, no fim do
  `buildRoom()`/depois do `layout()` dos chapéus). **Risco de regra 9**: nenhum — é otimização
  interna, não toca em nenhum preset/knob.
- **`freezeActiveMeshes()`** (scene-level): **cuidado** — a doc do Babylon avisa que bloqueia
  animações e a deteção de mudanças de frustum. Como a câmara ORBITA livremente
  (`camera.attachControl`, `main.js:143`) e a bola/mikado/vultos mudam de visibilidade por
  toggle do David, `freezeActiveMeshes` a nível de cena arriscaria meshes que deviam aparecer/
  desaparecer (ex.: ligar o mikado no painel) ficarem presas na lista de ativas do momento do
  freeze. **Não recomendado sem um teste dedicado** — é a categoria de otimização que rebenta
  silenciosamente um toggle e some sem aviso, exatamente o tipo de regressão que o CLAUDE.md
  pede para evitar (regra "zero avisos" — se partir, parte silenciosamente).
- **Material freezing** (`material.freeze()`): aplicável aos materiais que NUNCA mudam
  propriedade por frame — `railMat` do mikado (`mikado.js:143-148`), `bodyMat`/`hairMat` dos
  vultos (exceto quando `applyLook()` corre, que já é guardado por comparação e só corre
  quando muda). **Ganho estimado: pequeno** (evita revalidação de estado do material a cada
  frame mesmo sem mudança) — mas os materiais que MUDAM `emissiveColor` por frame (tubeMats do
  mikado) NÃO podem ser congelados (o próprio Babylon avisa: congelar impede exatamente essas
  mutações in-place de fazerem efeito). Teria de se separar "materiais estáticos" (podem
  congelar) de "materiais que o motor pinta" (não podem) — trabalho de auditoria, não de
  código.

### 3.6 GPU picking

Não há picking neste spike (`isPickable = false` em quase tudo — confirmado em `mikado.js`,
`crowd.js`, `hats.js`, `robots.js`). Não aplicável.

### 3.7 Redução de draw calls

Já coberto em §3.1 (thin instances). Adicional: **materiais partilhados** já é a norma no
código (railMat único, tubeMats por bloco não por barra, bodyMat/hairMat únicos para toda a
pista) — isto já reduz recompilação de shader ao mínimo. O que falta é consolidar as MESHES
(não os materiais) via thin instances.

### 3.8 ReflectionProbe: custo e alternativas

- **Custo real**: `refreshRate = REFRESHRATE_RENDER_ONCE` já é a escolha certa — o probe só
  renderiza a cena (256×256×6 faces) quando algo chama `refreshProbe()`, não todos os frames.
  Isto está correto e é a razão pela qual o `docs/babylon-reference.md:326` lista "Probes por
  frame" como o 2º maior custo POSSÍVEL — mas o spike já evita pagá-lo por frame.
- **O que custa hoje**: cada `refreshProbe()` percorre a `renderList` inteira (sala + pilares +
  chapéus + robots + mikado + vultos = até ~1300+ meshes no pior caso) × 6 faces do cubo. Isto
  é disparado sempre que algo regenera geometria (mudar densidade do mikado, densidade dos
  vultos, altura/posição/diâmetro da bola) — ou seja, é um custo de **interação do painel**, não
  de frame contínuo. Não é hot path a 60 fps; é um soluço ocasional quando o David arrasta um
  slider de geometria. **Não é prioridade de otimização** (não afeta a leitura ao vivo com
  música).
- **Alternativa**: reduzir a resolução do probe (256→128) reduziria o custo de cada refresh
  proporcionalmente, à custa de reflexos mais pixelizados nos espelhos — troca estética que só
  o David deve decidir, não uma "otimização grátis".
- **Dívida já registada no próprio código** (`mikado.js:83-86`): "o que custa é o REFRESH do
  probe... a correção é refazer a renderList no rebuild() — fora do âmbito fechado da F13, mas
  é o primeiro sítio a olhar se a perf incomodar." Confirma que os próprios autores já
  identificaram isto como a dívida nº1, não uma novidade deste report.

## 4. WebGPU vs WebGL2

**O que só existe em WebGPU**: compute shaders (§3.3) e algumas features de post-process mais
recentes (`FrameGraphVolumetricLightingTask`, mencionado em `docs/babylon-reference.md:282`,
"exige montar um frame graph completo... só vale a pena se se quiser névoa com extinção a
sério — não é um drop-in").

**Risco de partir o caminho WebGL2 que hoje funciona**: o `main.js:90-99` já implementa o
fallback correto (`?webgl=1` força WebGL2; WebGPU é tentado primeiro com try/catch em
`initAsync()`). Qualquer técnica exclusiva de WebGPU (compute shaders) precisaria de:
1. Um caminho CPU equivalente para WebGL2 (o código atual já É esse caminho) — ou seja,
   adotar compute shaders significa **manter duas implementações da cadeia de cinza**, uma em
   WGSL e outra em JS, permanentemente sincronizadas. Dado o histórico de bugs deste repo (a
   cadeia de cinza tem 8 passos com comentários "índice exato do original", `ball.js:1274-1294`,
   e cada correção — F7 explosão, F13 raio, F14 posição, F15 oclusão — já tocou nela pelo menos
   uma vez), duplicar esta lógica é um risco de divergência real, não teórico.
2. **Incidentes já registados com WebGPU neste repo, que qualquer mudança tem de respeitar:**
   - **Crash de TransformNode em ReflectionProbe**: `docs/handoff-2026-09-01-S10.md:62` —
     "`TransformNode` na renderList do probe rebenta (`_currentLOD`) → só meshes reais." Isto
     já ditou a Regra 6 de `mikado.js`/`crowd.js` ("meshes = array ACHATADO de MESHES REAIS,
     nunca TransformNodes"). Qualquer refactor para thin instances TEM de continuar a expor a
     mesh base real na `renderList`, nunca o `TransformNode` pai.
   - **Fingerprint pesado (1444 meshes) matou o renderer**: `docs/handoff-2026-09-01-S11.md:86`
     — um teste de automação com 1444 meshes "mata o renderer". Isto é um sinal direto de que
     o pool combinado (mikado 672 + vultos 640 + resto) já está perto de um limite prático
     observado, não hipotético — reforça que consolidar via thin instances (§3.1) tem valor
     real de robustez, não só de FPS.
   - **`RawCubeTexture` obrigatória em todo material PBR novo**: regra repetida em `room.js`,
     `mikado.js`, `crowd.js`, `hats.js`, `robots.js` — sem ela, um PBRMaterial cai no
     `scene.environmentTexture` (= o próprio cubo do probe) e em WebGPU isso é
     "ciclo write+read com o cubo do probe no mesmo synchronization scope → GPUValidationError
     e o frame é descartado" (comentário em `ball.js:693-696`). Qualquer material novo
     introduzido por uma otimização (ex.: um material simplificado para thin instances) **tem
     de seguir esta regra também**, ou reintroduz o ecrã preto já resolvido no S8.
   - **`document.hidden` para o rAF e o FPS reportado MENTE** (§6) — não é um crash, mas é uma
     armadilha de medição que já invalidou tentativas anteriores de medir perf (ver §6).

**Recomendação**: não introduzir NENHUMA técnica exclusiva de WebGPU nesta fase. O ganho
estimado (compute shaders numa carga de ≤32k iterações) é marginal face ao orçamento de
17,5 ms já cumprido (4,3 ms medido), e o risco de reabrir os 3 incidentes documentados acima é
concreto. As únicas técnicas recomendadas (§5) funcionam identicamente em WebGL2 e WebGPU.

## 5. Plano faseado

Ritmo do projeto respeitado: fases pequenas, cada uma com stop visual, sem harness pesado.

| Fase | O quê | Ganho estimado | Esforço | Risco |
|---|---|---|---|---|
| **G1** | `freezeWorldMatrix()` nos 5 planos da sala + pilares (estáticos desde o `buildRoom()`) | pequeno, ~0,1-0,3 ms estimado (menos matrizes recalculadas por frame) | trivial (1-2 linhas) | nenhum — geometria nunca muda por frame |
| **G2** | Medir ANTES de mexer em mais nada (ver §6) — estabelecer baseline real no pior caso (mikado sala-toda + Ø3,0 + 80 vultos) | — | pequeno (script de medição) | nenhum |
| **G3** | Thin instances no mikado (6 meshes base × `MAX_BARS` transforms, cor por bloco via instance buffer como a corrente já faz) | draw calls 672→6 no mikado; **ms estimado**: se G2 mostrar draw calls como gargalo, alto; se mostrar CPU-bound, baixo (a geometria já não é recalculada por frame, só o `layout()` no rebuild) | médio | médio — reintroduzir armadilha "count=0 não esconde a mesh base" (já documentada); testar com o mikado ligado/desligado várias vezes seguidas (o par simétrico liga/desliga é uma regra já fixada — F11) |
| **G4** | Auditar `material.freeze()` nos materiais verdadeiramente estáticos (`railMat`, `pillarMat`, materiais da sala) — excluir os que o motor pinta (`tubeMats`, `bodyMat`/`hairMat`, `chainMat`) | pequeno | pequeno-médio (auditoria linha a linha de quem escreve `.set()` em cada material) | baixo — testar que os que NÃO se congelam continuam a mudar de cor ao vivo |
| **G5 (condicional)** | Thin instances nos vultos, SÓ se G2/G3 mostrarem que draw calls (não CPU) continuam a ser o gargalo no pior caso | draw calls 640→~11; CPU **não muda** (a dança continua a escrever matrizes por frame) | alto (a dança tem de recompor matriz 4×4 por pessoa em vez de mutar TransformNode) | médio-alto — mais superfície de bug na animação; testar visualmente ao vivo com música (regra do projeto) |
| **NÃO fazer** | Compute shaders / storage buffers na cadeia de cinza | — | alto | alto (duplica lógica WebGL2/WebGPU, reabre risco de GPUValidationError, escala não justifica) |
| **NÃO fazer** | Mexer em `music.js` para "acelerar" — não há nada a acelerar | — | — | — |

## 6. Como MEDIR antes e depois

A perf está por medir há 5 fases porque as tentativas anteriores caíram nas mesmas duas
armadilhas, ambas já documentadas no próprio repo:

1. **`document.hidden` pára o rAF e o FPS reportado MENTE** (valor velho) — `docs/handoff-
   2026-09-01-S11.md:85`, e a mesma nota em `docs/babylon-reference.md:298-310` com o número
   medido: "1934 ms num frame que custa 4 ms" quando o tab está em segundo plano.
2. **`scene.render()` forçado mata o renderer WebGPU** (mencionado no brief do plano,
   `docs/plan-babylon-v2.md:58`: "WebGPU initAsync() pendura... para screenshot automatizada
   usar `?webgl=1`").
3. **Um fingerprint pesado (1444 meshes) mata o renderer** — `docs/handoff-2026-09-01-S11.md:86`.

**Método proposto (funciona apesar disto):**

1. **Sempre com o tab em FOCO, nunca em automação headless.** O próprio `docs/babylon-
   reference.md:309-315` já reconhece isto: "com o Chrome em automação o separador está quase
   sempre em segundo plano... para medir/forçar frames a partir de `javascript_tool`: `for
   (let i=0;i<40;i++) window.SPIKE.scene.render()`" — mas mesmo esse workaround só serve para
   verificar que a cena RENDERIZA sem exceções, não para medir ms reais (frames forçados em
   sequência apertada não refletem o timing do rAF real). **Para números de perf que valham
   alguma coisa, pedir ao David para deixar o tab em foco e ler `MB2.__perf()`** — é
   literalmente a função já exposta para isto (`main.js:1860-1863`).
2. **Ler `MB2.__perf()` ou o HUD (`m`/HUD nativo), nunca `engine.getFps()` isolado.** O spike
   já mede o custo REAL via `onBeforeRenderObservable`/`onAfterRenderObservable` (não
   `getDeltaTime()`) — `main.js:1638-1642`. Isto já é a correção certa para a Armadilha 6 do
   `babylon-reference.md`. `MB2.__perf()` devolve `{medianRenderMs, n, tiles}` sobre as últimas
   60 amostras — já filtra ruído de picos isolados.
3. **Avaliar por leitura de estado, nunca screenshot** (já é a instrução do handoff) — usar
   `MB2.__perf().medianRenderMs`, `scene.getActiveMeshes().length`, `scene.getTotalVertices()`
   como os três números a registar antes/depois de cada fase.
4. **Protocolo mínimo por fase** (sem harness pesado, consistente com o ritmo side-project):
   ```js
   // antes de mexer em nada — registar baseline no pior caso (sala-toda + Ø3,0 + 80 vultos)
   const before = MB2.__perf();
   console.log('meshes ativas:', MB2.scene.getActiveMeshes().length,
               'vértices:', MB2.scene.getTotalVertices(), 'render:', before.medianRenderMs);
   ```
   Esperar ~2 s (para as 60 amostras se renovarem) antes de ler. Repetir depois da mudança,
   com o MESMO cenário (mesma densidade de mikado/vultos, mesmo Ø da bola) — mudar dois
   parâmetros ao mesmo tempo invalida a comparação.
5. **Nunca medir com o painel `d` aberto** se a mudança nada tiver a ver com o painel — o DOM
   do painel não deveria custar frame de render, mas para isolar variáveis é mais seguro medir
   com `k`/`d` fechado.
6. **Pior caso a testar sempre**: mikado sala-toda (`mikado: sala toda`=1) + bola Ø3,0 m +
   vultos densidade máxima (~80) — é o cenário já identificado no próprio handoff como pior
   caso, e é onde qualquer ganho de §5 seria mais visível.
7. **Regressão a vigiar**: qualquer mudança que precise de tab automatizado para verificar (ex.
   "a cena ainda renderiza sem exceções após a mudança") pode usar o loop `for(...)
   scene.render()` do `babylon-reference.md`, mas **só para detetar exceções na consola**, nunca
   para tirar números de ms.

## 7. Conclusão

**3 maiores oportunidades, por ganho estimado:**
1. Thin instances no mikado (672→6 meshes base) — maior redução de draw calls do repo,
   esforço médio, risco conhecido e documentado (armadilha count=0).
2. `freezeWorldMatrix()` na sala/pilares (estáticos desde sempre) — ganho pequeno mas
   grátis, esforço trivial, risco zero.
3. Reduzir o custo do `refreshProbe()` (já identificado como dívida pelo próprio código,
   `mikado.js:83-86`) — refazer a renderList do probe por elemento em vez de tudo de uma vez,
   só relevante para a experiência de arrastar sliders de geometria, não para os 60 fps ao
   vivo com música.

**Não fazer**: compute shaders/storage buffers na cadeia de cinza da bola (escala ≤32k
iterações não justifica, duplica lógica WebGL2/WebGPU, reabre risco de GPUValidationError já
resolvido no S8); mexer em `music.js` (50 Hz sobre ~20 escalares — zero ganho, latência pior);
`freezeActiveMeshes()` a nível de cena (a câmara orbita livremente e há toggles ao vivo —
risco de meshes presas silenciosamente, contra a regra "zero avisos" do projeto).

**Primeira fase concreta (stop visual imediato)**: G1+G2 juntas — aplicar
`freezeWorldMatrix()` na sala/pilares (2 linhas, risco zero) e, na mesma sessão, estabelecer o
baseline medido no pior caso com `MB2.__perf()` (tab em foco, protocolo do §6). Isto dá ao
David um número real pela primeira vez em 5 fases, sem tocar em nada visualmente sensível, e
decide se G3 (mikado thin instances) vale a pena continuar.

## 8. Estatuto das afirmações (MEDIDO / ESTIMADO / SUPOSTO)

- **MEDIDO** (números vindos do repo, não deste report): 4,30 ms com 3992 facetas + 4 focos +
  56 feixes (`docs/babylon-reference.md:322`); oclusão dos vultos 4,8 ms → 0,6 ms com pré-filtro
  (`ball.js:1028-1035`); dança dos vultos mediana 0,0 ms / máx 0,2 ms (`docs/f15-vultos.md:318`);
  +73 ms/frame por reatribuição de Color3 (`main.js:1440-1447`); 1934 ms reportados num frame
  de 4 ms com o tab em segundo plano (`docs/babylon-reference.md:298-310`).
- **ESTIMADO** (deduzido da estrutura do código, não medido): contagens de draw calls
  (672 mikado, 640 vultos, ~1100 no pior caso combinado); ganho de 0,1-0,3 ms do
  `freezeWorldMatrix()`; ≤32.000 iterações do loop interno da cadeia de cinza.
- **SUPOSTO** (a confirmar antes de agir): que draw calls — e não CPU — sejam o gargalo no
  pior caso; **é exatamente isto que a fase G2 existe para resolver**, e nenhuma fase G3+
  deve arrancar antes de G2 dar a resposta.
