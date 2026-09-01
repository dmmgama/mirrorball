# F13 — ajustes (spec do David, 2026-09-01)

Âmbito FECHADO: só estes 4 pontos, **resto não tocar**.

1. **Mikado na sala toda — on/off**: toggle entre o modo atual (só interior do retângulo dos
   pilares) e a sala toda até **1 m das paredes**. (Com densidade barras/m², a contagem escala.)
2. **Opacidade da bola**: bug — o David não consegue tirar o controlo da opacidade ao motor, ou,
   quando consegue, não consegue pôr a bola **toda opaca**. Corrigir: com o override manual ativo,
   o slider tem de chegar a opacidade total e o motor não pode reescrever.
3. **Diâmetro da bola**: knob de **2,0 a 3,0 m em passos de 0,5 m**.
4. **Aviso "dimensões da sala mudaram" AINDA aparece** (screenshot 2026-09-01, pós-F12) —
   **o David não quer avisos nenhuns**: eliminar o banner por completo.

Regras herdadas: motor nunca liga/desliga elementos; nada > 3 Hz; `beamIntensity ≤ 0.18`; bola não
emite luz; NaN-safe; greyscale funcional; par liga/desliga simétrico; nunca commitar
`web/music-config.json`.

## Estado da implementação — F13 (Opus, 2026-09-01)

Tocados: `spike-babylon/v2/` → `main.js`, `panel.js`, `config.js`, `mikado.js`, `ball.js`,
`beams.js`, `incident.js`, `index.html` (cache-busters), `knobs-default.json` (regenerado:
171 → **175 knobs**). **`web/music.js` NÃO foi tocado** (nenhum bump de `music.js?v=`);
**`web/music-config.json` fora do commit**, como sempre.
Verificado ao vivo em `:8099/app/spike/v2/index.html?src=music` (motor ligado, `owner = music`),
WebGPU, consola limpa.

### Knobs novos (4) — 171 → **175**

| knob | faixa (passo) | default | grupo |
|---|---|---|---|
| `mikado: sala toda (0/1)` | 0-1 (1) | **0** (miolo, como a F11) | Mikado & Bola |
| `mikado: folga paredes (m)` | 0,2-3 (0,1) | **1,0** | Mikado & Bola |
| `bola: diâmetro (m)` | 2,0-3,0 (**0,5**) | **2,0** | Mikado & Bola |
| `bola: opacidade (0-1)` | 0-1 (0,01) | **1,0** | Motor |

`bola: opacidade (0-1)` **substitui** `sphereOpacity (motor manda)` (migração automática pelo
`RENAMED` do panel.js — quem tinha o nome antigo em `mb2.knobs` não perde nada) e passou a
**PERSISTIR**. Nenhum outro knob mudou de nome, faixa ou default.

---

### §1 — Mikado na sala toda (on/off)

`mikado: sala toda (0/1)` alterna a ZONA de geração: 0 = interior do retângulo dos pilares (o modo
da F11, default — quem não clicar vê exatamente o mesmo mikado); 1 = a sala inteira até
`mikado: folga paredes (m)` das paredes. A densidade barras/m² da F12 faz o resto sozinha.
**Medido**: 49,29 m² → **40 barras** (miolo) e 117,0 m² → **95-96 barras** (sala toda, = 9 × 13 m
com a folga de 1 m). Regenera ao vivo, sem reload.

**Barras × pilares — decisão: REJEITAR, não encurtar.** No modo miolo o problema não existia (a
zona morre antes dos pilares); na sala toda as barras passam por cima dos corredores e os pilares
vão do chão ao teto. Encurtar era o gesto natural (é o que já se faz contra as paredes) mas com 6
pilares no meio da zona produzia um monte de cotos curtos à volta de cada um — lê-se como malha
remendada, não como o mikado das fotos. Rejeitar só custa sorteios (o `guard` do `while` já os
paga) e dá uma malha que CONTORNA os pilares. Teste: slab 2D (XZ) segmento × AABB do pilar,
inflado por meia secção + Ø do tubo + 0,05 m. **Só os pilares MONTADOS** contam — um pilar
desligado no painel não é obstáculo.
**Medido**: 0 barras dentro de um pilar; distância mínima eixo→pilar **0,56 m** (meia secção 0,25).

**`MAX_BARS` 72 → 112.** A 72 o modo novo nascia cortado a meio e o aviso de pool disparava logo ao
primeiro clique — a densidade deixava de ser densidade. 112 cobre a sala nominal em modo sala-toda
até ~0,95/m². Custo: o pool é criado uma vez no arranque (112 × 6 = 672 meshes), só as em uso ficam
`setEnabled(true)`. Ver "Dívidas".

### §2 — Opacidade da bola (o bug) — **dois donos, não um**

**Diagnóstico.** A leitura do código dizia que o disjuntor já existia e funcionava
(`music.js:2108`, `if (C.opacityMotor !== false) C.sphereOpacity = …`) — e funciona mesmo. O que
ninguém tinha visto é que havia um **SEGUNDO** dono a escrever a opacidade, e esse não respeitava
disjuntor nenhum: o `lerp` do preset **DEAD** em `effective()` (`main.js`), que arrasta
`sphereOpacity` para **0,35** à medida que o `health` cai. E o `music.js` escreve
`MB.setHealth(state.health)` por frame, com o health a cair a 0 em qualquer silêncio ou pausa (e
sempre, no gerador sintético). É a assinatura clássica dos bugs deste repo — dois donos, o último a
escrever ganha — na forma mais escondida: **o segundo dono nem parece estar a falar de opacidade**.

**Reproduzido e medido** (com o motor a correr, `?src=music`):

| | health 1,0 | health 0,5 | health 0,0 |
|---|---|---|---|
| `motor manda = 1` (comportamento antigo, mantido) | 1,000 OPACO | **0,675** alpha | **0,350** alpha |
| `motor manda = 0` (**corrigido**) | 1,000 **OPACO** | 1,000 **OPACO** | 1,000 **OPACO** |

Ou seja: com o slider a 1,00 e o override ligado, a bola vivia a 0,35 e não havia gesto no painel
que a pusesse opaca — o "não consigo pôr a bola TODA opaca" do David, exatamente.

**Correção** (`main.js`, `effective()`): com `opacityMotor === false`, a saída é `CONFIG.sphereOpacity`
**LITERAL** — sem health, sem estrelato, sem gestos. `rotationRpm`/`haze`/`spotGain` NÃO mudam: o
health continua a ser o que era para eles, e a regra 2 do CLAUDE.md ("a bola nunca pára") vive nesse
caminho e fica intacta. A 1,00 o material vai a `MATERIAL_OPAQUE` (verificado), não a alpha-blend.

**Segunda metade da correção: PERSISTIR.** O slider era runtime puro — o David punha a bola opaca,
recarregava, e voltava ao valor do config. Parecia "não dá para fixar". Agora grava.
**Medido**: 6 s de motor a escrever por frame com o slider a 1,0 → `E.sphereOpacity` = 1,000 em
todas as amostras; e sobrevive ao reload.

### §3 — Diâmetro da bola (2,0-3,0 m, passos de 0,5)

**O problema real**: durante 12 fases "1 raio" e "1 metro" foram a MESMA coisa (config.js:5), e o
spike encheu-se de literais `1` que são o raio da bola disfarçado de metro — espalhados por
`ball.js`, `main.js`, `incident.js`, `beams.js` e `mikado.js`. A regra nova:
**`CONFIG.ballR` (= `ballDiameterM`/2, clampado 1,0-1,5) é a fonte de verdade ÚNICA do raio**, na
mesma linha do `ballYEffective` da F12 — ninguém deriva o raio do knob em cru.

**As duas decisões que evitaram reescrever meio spike:**

1. **A malha não muda — o `root` ESCALA.** `facets`/`core`/`bone` são filhos do root, crescem os
   três de uma vez, e o `restPos` da explosão e as normais ficam intactos. Evitou mexer em
   `buildMesh`/`buildBone`/`explode` inteiros (e a armadilha, que o mapa apanhou, de o
   `restPos − N0` da explosão ficar em espaços diferentes).
2. **O CPU continua todo em RAIOS; converte-se só na FRONTEIRA** — é o padrão do `ballY` da F12,
   estendido. Os planos da sala entram divididos por `rb`; as posições que saem para o mundo (dots,
   origem dos feixes, cone incidente) saem multiplicadas por `rb`. Assim `sp.r`, `aim`,
   `camDistance`, `beamLen`, `incidentLen`, `dotFalloff` e as margens afinadas (`camD − 1.5`,
   `nz·camD − 1`, `camD − 0.6`) continuam todas a valer o que valiam, **em raios**, e escalam de
   graça. A alternativa era espalhar `×rb` por ~40 linhas do loop por tile e reafinar tudo.

**Quem escala e quem não escala** (decidido, medido e documentado em config.js para não se reabrir):

- **ESCALA COM R**: esfera/núcleo/osso, topo da corrente (`yTop`), auréola, largura do tile (base
  dos feixes), raio+mira dos focos na superfície, alcance do feixe e do cone incidente, entrada do
  cone na esfera, clareira do mikado, clamp de altura, distância da câmara.
- **FICA EM METROS**: dimensões da sala, `spotDist` (**regra 3 do handoff S10** — um foco real
  montado em treliça não se afasta porque trocaram a bola), comprimento do ELO da corrente (um elo
  real não engorda), corpos PAR36, chapéus, robots, pilares, e as folgas em metros (1 m do chão,
  0,25 m do teto, folga das paredes do mikado, margem da clareira).

**Câmara**: `camDistance` passa a ser honrado como RAIOS (a distância do mundo é `camDistance · raio`).
O enquadramento fica INVARIANTE — a FOV mediu 0,5513 nos três diâmetros. Se a câmara ficasse quieta,
subir o diâmetro dava um zoom disfarçado e ninguém conseguiria julgar o tamanho.

**Medido nos três diâmetros** (Ø 2,0 / 2,5 / 3,0):

| | Ø 2,0 | Ø 2,5 | Ø 3,0 |
|---|---|---|---|
| diâmetro medido na cena | 2,000 | 2,500 | 3,000 |
| `ballR` / `root.scaling` | 1,0 | 1,25 | 1,5 |
| elos da corrente | 30 | 23 | 16 |
| câmara (raio do mundo) | 7,0 | 8,75 | 10,5 |
| FOV | 0,5513 | 0,5513 | 0,5513 |
| cone do spot0 | 8,40° | 10,50° | 12,59° |
| `tileWidth` (base do feixe) | 0,0327 | — | 0,0491 |
| auréola (escala) | 1,0 | — | 1,5 |
| luz indireta (distância) | 7,0 | — | 7,5 |
| clareira do mikado exigida | 1,50 | 1,75 | 2,00 |
| clareira do mikado medida | 1,82 | 1,81 | 2,19 |

**A prova decisiva** (é o teste que apanha um erro de escala em qualquer sítio do raycast): nos três
diâmetros, **100% dos dots aterram exatamente num plano da sala** (pior desvio 0,000) e **a origem
de todos os feixes está exatamente à superfície da bola** (raio min = max = 1,0 / 1,25 / 1,5).

**Ordem de aplicação** (`onBallDiameterChanged`, a mesma armadilha nº1 da F12): `ball.applyHeight()`
primeiro (escala, publica `ballR`, **RE-CLAMPA a cota** e republica `ballYEffective`, reconstrói a
corrente), só depois `mikado.rebuild()` (que lê o raio para a clareira) e `ball.refreshProbe()`.
Também pré-aplicado em `preApplyReloadKnobs()` — o `createMikado` corre ANTES do `ball.js`, e sem
isso quem tivesse Ø 3,0 gravado via a clareira aberta para uma bola de Ø 2,0.

⚠ **Interação com `bola: altura (m)`, por desenho**: com a bola maior a faixa ÚTIL do slider de
altura ENCOLHE (0,25 m em cada ponta por cada 0,5 m de diâmetro) — uma bola maior tem mesmo menos
sítio para andar num pé-direito fixo. O slider continua a ir aos 4,6 mas o valor efetivo é clampado;
`CONFIG.ballYEffective` é quem manda. Medido a Ø 3,0: fundo −2,10 (chão −3,50 ✓), topo +0,90
(teto +2,00 ✓).

### §4 — Banner "dimensões da sala mudaram": ELIMINADO

A F11 culpou a reabertura do grupo "Sala"; a F12 encontrou a causa geral (reposição em bloco de
knobs) e tornou o aviso honesto com `BUILT_GEOM`. **Não chegou** — o David voltou a apanhá-lo com a
página recarregada. Decisão dele: "avisos NENHUNS". Já não se persegue o caminho que o faz
aparecer: **o banner deixou de existir**. `onRoomDimChanged` é agora um no-op documentado que não
escreve no DOM em circunstância alguma (só um `console.log` atrás de `window.MB2_DEBUG_ROOMDIM`).

`BUILT_GEOM`/`roomGeomDiffers()` ficam como lógica interna (o contrato permite) e são expostos em
`MB2.roomGeomDiffers()` / `MB2.builtGeom` para diagnóstico por consola. O `#err` continua a existir
e continua a ser usado — **só** por `moduleFail()` (falhas de import a sério) e pelo `showErr` de
erros JS do `index.html`, que é para o que nasceu.

**Verificado — zero banners em 7 cenários**, incluindo os dois que o produziam de certeza:
arranque; reposição em bloco dos 175 knobs; mudança REAL de `sala: pé-direito` e de
`pilares: vão entre filas`; desfazer; "repor knobs (defaults)"; **`MIRRORBALL.knobs.set()`** (o
caminho do `music-config.json`, que o guard da F12 não apanhava); e **reload com `mb2.dbgOpen =
'Sala'` + motor ligado** (o cenário da F11). O `roomGeomDiffers()` interno continua a responder
`true` depois de uma mudança real — a lógica ficou, só o pixel desapareceu.

### Verificação feita

- **Consola limpa**: 10 módulos, zero erros, zero avisos novos. Só o `maxSimultaneousLights 12 > 8`
  do `room.js`, **pré-existente** (documentado desde a F11). Nenhum aviso de pool do mikado, mesmo
  em sala toda — o 112 chega.
- **Motor a funcionar**: `?src=music` com sidecar, `owner = music`, `health = 1`, 175 knobs.
- **Par liga/desliga simétrico** (armadilha F11) no modo sala toda: 570 → 0 → **570** meshes.
- **Toggle sala toda ida-e-volta**: 240 meshes / 49,29 m² ↔ 570 / 117,0 m².
- **`cor (0/1)`** (greyscale) funcional nos dois sentidos.
- **`bola (0/1)`** simétrico, e a clareira abre/fecha certo: Ø3 ON → 2,19 · OFF → 0,91 (barras a
  encher o centro) · Ø2 ON → 1,82.
- **NaN-safe**: `ballR`, `ballYEffective`, `E.sphereOpacity`, `camera.radius`, `areaM2` todos
  finitos depois de martelar o diâmetro 2,0→3,0→2,5→3,0 com o motor a correr.
- **Reload com estado não-default** (Ø 3,0 + sala toda + opacidade manual + `dbgOpen='Sala'`):
  tudo persistiu e aplicou, sem banner.

### Dívidas / por afinar ao vivo com o David

- **Perf POR MEDIR limpa** — outra vez, e agora com mais razão. O modo sala toda mais que duplica as
  barras (40 → 95) e o pool subiu para 112. A medição em automação continua a mentir
  (`document.hidden = true`: foi preciso forçar `scene.render()` à mão para os caminhos por frame
  correrem de todo). **Medir no stop visual, com a tab à frente**, sobretudo `mikado: sala toda` a
  Ø 3,0, que é o pior caso da cena. Baseline de referência 7,8-11,9 ms, alvo < 17,5.
- **Dívida da renderList do probe CRESCEU** (herdada da F12): a renderList é fixada no `attachProbe`
  com o pool INTEIRO, que passou de 72 a 112 barras → 672 meshes registadas, só as em uso ativas. O
  probe é `RENDER_ONCE`, portanto não custa por frame, mas custa em cada refresh — e os refreshes
  agora são mais frequentes (o slider de diâmetro pede um, tal como o de altura). A correção limpa é
  refazer a renderList no `rebuild()` do mikado; ficou fora do âmbito fechado da F13.
- **`mikado: folga paredes` = 1,0 m é a spec, não afinação.** O David disse "até 1 m das paredes";
  o knob existe para ele mexer. Com folgas pequenas as barras passam por cima dos chapéus (que
  estão a 1 m da parede lateral) — pode ser bonito ou pode ser confuso, é de ver.
- **Rejeição vs encurtamento nos pilares**: escolhi rejeitar por raciocínio (ver §1). Se o David
  achar a malha "aberta demais" à volta dos pilares, a alternativa é encurtar — mas é preciso ver
  primeiro, porque o argumento contra é visual, não técnico.
- **Diâmetro só até 3,0 m** porque a spec diz 2,0-3,0. A implementação clampa `ballR` a 1,5 em 5
  sítios; subir o teto exige mexer nesses clamps (todos comentados com F13 §3), não só no knob.
- **A bola grande com o mikado no miolo fica apertada**: a Ø 3,0 a clareira exigida sobe para 2,0 m
  e come uma fatia grande do miolo (49 m²). No modo sala toda isso dilui-se. Se o David quiser as
  duas coisas no miolo, `mikado: clareira bola (m)` é o knob para baixar.
