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

---

# Adição F13.5 — PRESETS (vista + config)

Spec do David (verbatim, 4 pontos): botão **save** que grava o CONFIG atual + a **posição da
câmara** como preset com nome; **menu "presets"** com lista, seleção rápida, renomear/apagar e
persistência; **"auto presets"** que roda ao acaso **sem repetir nenhum até esgotar a lista**;
**slider(s) de tempo** min/máx, sorteando uma duração por permanência.

Tocados: `spike-babylon/v2/panel.js` (UI + storage + baralho), `main.js` (pose da câmara + lerp),
`index.html` (CSS da lista + cache-busters). **Nenhum knob novo** — os 175 da F13 mantêm-se, e
`knobs-default.json` foi regenerado sem diferenças (verificado). **`web/music.js` e
`web/music-config.json` NÃO foram tocados.**

## UI — grupo "Presets" na barra do painel

Grupo próprio, imediatamente antes de "Ficheiro" (é o que se usa ao vivo; "Ficheiro" continua a ser
a última gaveta). Sem sliders de CONFIG — a UI é construída à mão, como o grupo "Ficheiro".

| elemento | o que faz |
|---|---|
| **gravar preset** | pede o nome e grava knobs + câmara. Nome repetido **substitui** (não duplica). |
| **exportar (.json)** / **importar (.json)** | ficheiro `mb2-presets.json`; importar funde por nome. |
| ☐ **auto presets** | liga/desliga o baralho. |
| `preset: tempo min (s)` / `preset: tempo máx (s)` | 2-300 s, passo 1. Empurram-se um ao outro (min > máx é impossível). |
| `preset: câmara lerp (s)` | 0-4 s, passo 0,1. **0 = salto seco.** Default **1,2 s**. |
| lista de presets | uma linha por preset: **nome** (aplica), **⟲** (substitui pelo estado atual), **✎** (renomear), **✕** (apagar). |

O preset no ar fica destacado (borda e fundo mais claros). Sem presets, a lista mostra uma linha de
ajuda em vez de ficar vazia.

**Sinal ⟳ discreto, sem banners.** Um preset cuja geometria ⟳ (dimensões da sala) difere da que está
construída leva um **⟳ amarelo** ao lado do nome, com tooltip. É a **mesma marca que os sliders ⟳ já
usam, no mesmo sítio** (dentro do painel) — cumpre a F13 §4 ("avisos NENHUNS"): nada é escrito no
`#err` nem por cima da cena, e a marca desaparece sozinha depois do reload. **O banner da F13 não
foi ressuscitado.**

## Formato gravado (localStorage)

Duas chaves novas, **separadas de `mb2.knobs`** (um preset não pode corromper os knobs gravados —
verificado: depois de toda a bateria, `mb2.knobs` continua com 175 knobs e zero campos de preset):

```
mb2.presets    [ { name, knobs:{…175…}, toggles:{spots,skin,explode}, cam:{alpha,beta,radius,ty} }, … ]
mb2.presetsUi  { auto, minSec, maxSec, camSec }
```

Exportado como `{ "mb2Presets": [ … ] }` (o importador também aceita um array cru).
`sanitizePreset()` filtra tudo à entrada — só passam knobs que existam e sejam finitos, e a `cam` só
entra com `alpha`/`beta`/`radius` finitos. Um ficheiro corrompido não consegue meter `NaN` na cena.

## Decisões

1. **Aplicar = o caminho de reposição em bloco que já existia.** `knobsSet(obj, true)` +
   `togglesSet(...)`, exatamente o que "carregar ficheiro" faz. **Não se criou um segundo caminho de
   escrita nos knobs** — é a lição das F12/F13 (dois donos = o último a escrever ganha). Um preset
   nunca escreve em `mb2.knobs` à mão; quem persiste é o `persistAll()` que o `knobsSet` já chama.

2. **Knobs ⟳: aplicam-se ao vivo o que dá, sem aviso.** Os valores entram no CONFIG (para
   sobreviverem ao próximo reload) mas a geometria da sala só se reconstrói no arranque, como sempre.
   O sinal é o ⟳ na lista, dentro do painel. Alternativa rejeitada: recarregar a página sozinho ao
   aplicar um preset — em modo auto seria um corte brutal a meio da música.

3. **Câmara: lerp com smoothstep, 1,2 s por omissão.** Um salto seco em auto lê-se como falha da
   cena. **Não é strobe** (é uma pose a interpolar, não um piscar), portanto a regra dos 3 Hz não se
   aplica; ainda assim o mínimo de permanência é 2 s, o que impede qualquer cadência epilética.
   Interpola-se pelo **caminho angular mais curto** (sem isto, ir de α=3,1 a α=−3,1 — o mesmo sítio —
   dava uma volta quase completa à bola). Um **`pointerdown`/`wheel` do David cancela o lerp**: se
   ele agarrou a câmara, a câmara é dele.

4. **O `target.y` NÃO entra na interpolação — de propósito.** O loop escreve-o todos os frames a
   partir de `ballCenterY()` (F12 §3). Se o lerp lhe mexesse ficavam **dois donos do mesmo número**,
   que é a assinatura de bug desta repo (F13 §2). O `ty` grava-se no preset só como diagnóstico; o
   alvo segue o knob `bola: altura (m)` do preset, que é o comportamento certo — a câmara aponta à
   bola onde quer que o preset a ponha. O `radius` é **clampado pelos limites vivos** da câmara (que
   dependem do raio da bola, F13 §3): um preset gravado a Ø 2,0 aplicado a Ø 3,0 não mete a câmara
   dentro dos espelhos.

5. **Auto vs o David: sem luta.** O auto só escreve quando **muda** de preset. Se o David mexer num
   knob entretanto, o valor dele fica até à troca seguinte, e aí o preset aplica-se por cima. Simples
   e previsível — nada de reverter nem de bloquear sliders.

6. **Auto vs motor/estrelato: cada um no seu.** O auto só mexe em knobs + câmara. O motor de música e
   o estrelato continuam a mandar no que é deles (rpm, haze, feixes, opacidade quando o disjuntor
   lha dá). Um preset que gravou `rotationRpm` ganha o instante da aplicação e o motor reescreve a
   seguir — exatamente como já acontece hoje ao mexer no slider à mão.

7. **O auto NÃO arranca sozinho num reload**, mesmo que estivesse ligado quando a página fechou. O
   David abre a página para **afinar**; uma cena a trocar de preset sozinha ao arranque é o oposto
   disso. O checkbox nasce desligado à espera do clique (par liga/desliga simétrico).

8. **Baralho (shuffle bag).** `bag` guarda os ÍNDICES por sortear; quando esvazia, enche com todos e
   baralha (Fisher-Yates). Guard extra na fronteira: com ≥2 presets, um baralho novo **nunca começa
   pelo que acabou de tocar** — senão via-se o mesmo preset duas vezes seguidas na junção entre
   baralhos, que é precisamente o "repetir" que o David não quer ver. Apagar um preset **esvazia o
   baralho** (ele referencia índices; sem isto saltava presets ou apontava para fora do array).

## Verificação feita

- **Sequência do baralho, ao vivo com o motor a correr** (5 presets, `?src=music`, `owner = music`):
  baralho 1 `D · A · E · B · C`, baralho 2 `E · A · D · C · B` — **os 5 distintos em cada um**,
  ordens diferentes, e **nenhuma repetição seguida na fronteira** (C → E).
- **Algoritmo em isolamento** (extraído *literalmente* do `panel.js`, 10 000 sorteios): o guard
  disparou 401 vezes e deu **0 repetições seguidas**; cada preset saiu exatamente 1/5 das vezes
  (200/200/200/200/200 em 1000) — uniforme, sem enviesar.
- **Lerp da câmara medido passo a passo**: de (1,571 · 1,571 · 10,5) até (2,2 · 1,15 · 9,0) em 1,2 s,
  com easing smoothstep, aterrando **exatamente** no alvo e com `camAnim.on` a desligar-se sozinho.
- **Seleção rápida aplica os dois**: knobs (diâmetro, mikado sala toda, cor, wash, nº de focos) e
  câmara, verificados preset a preset.
- **Sobrevive ao reload**: 5 presets com pose de câmara intacta depois de F5; `mb2.presetsUi` também.
- **Durações dentro do min/máx**: 2000 sorteios com [2, 3] → mínimo 2,00 e máximo 3,00, todos dentro.
- **`mb2.knobs` não corrompido**: 175 knobs, zero campos de preset infiltrados; chaves separadas.
- **UI pelos botões reais**: renomear (✎), apagar (✕) e substituir (⟲) — todos persistem na hora e
  a lista re-renderiza. O ⟲ mantém o nome e troca knobs **e** câmara.
- **Consola limpa**: 10 módulos, zero erros, zero avisos novos — só o `maxSimultaneousLights 12 > 8`
  do `room.js`, **pré-existente** (documentado desde a F11).
- **Zero banners**: `#err` nunca acendeu em nenhum cenário, incluindo aplicar presets com geometria ⟳
  diferente (que é exatamente o caso que fazia aparecer o banner antigo).
- **NaN-safe**: `ballR`, `ballYEffective`, `sphereOpacity`, `rotationRpm`, `camera.alpha/beta/radius`
  e `camera.target.y` todos finitos depois de toda a bateria.
- **Greyscale funcional** nos dois sentidos e **par liga/desliga simétrico** (mikado) mantidos.
- **Arranque limpo** (localStorage sem presets): lista com a linha de ajuda, defaults 12/30/1,2 s,
  175 knobs, sem banner.
- **`node gen-knobs-default.js` continua a correr** (o `panel.js` corre no sandbox sem câmara nem
  `document.body`): 175 knobs, ficheiro sem diferenças.

## Dívidas / por afinar ao vivo com o David

- **Perf POR MEDIR, outra vez** — e desta vez a automação nem sequer mente com jeito: com
  `document.hidden = true` o `requestAnimationFrame` **não corre de todo** (medido:
  `registerBeforeRender` com **0 chamadas** e um FPS de 476 que era leitura velha). Forçar
  `scene.render()` à mão funciona para provar lógica, mas com o auto a 2-3 s a bloquear o renderer.
  **Medir no stop visual, com a tab à frente**, sobretudo o auto a rodar presets com `mikado: sala
  toda` a Ø 3,0. Baseline de referência 7,8-11,9 ms, alvo < 17,5. O custo que a F13.5 acrescenta por
  frame é uma mão-cheia de contas no `camPoseUpdate` (só quando há lerp a decorrer) — não se espera
  regressão estrutural, mas **não está medido**.
- **Aplicar um preset é caro**: `knobsSet` chama `onRebuildBall`/`onSpotsChanged`/`onMikadoGeomChanged`
  e um `refreshProbe`. A 2 s de permanência isso é uma reconstrução do mikado a cada 2 s. Ao vivo,
  com a tab à frente, provavelmente é imperceptível — mas se o David sentir um soluço na troca, o
  caminho é aplicar só os knobs que **mudaram** em vez dos 175 (o `knobsSet` hoje aplica tudo).
- **Tempos default 12-30 s**: são um palpite razoável para "não cansa", não uma afinação. É de ouvir.
- **Não há ordenação nem reordenação da lista** — os presets ficam pela ordem de gravação. Se o David
  acumular muitos, arrastar para reordenar (ou pelo menos subir/descer) é o passo seguinte natural.
- **O preset guarda os toggles** (spots, skin, explosão) porque o "carregar ficheiro" já os guardava.
  ⚠ Isto inclui a **skin**, que pela Regra 1 é do utilizador — um preset gravado com skin `white`
  põe a skin em `white` ao ser aplicado. É consistente com "o preset é uma fotografia do estado",
  mas se incomodar, tirar a skin do `togglesGet` do preset é uma linha.
- **Sem limite ao número de presets nem ao tamanho do `localStorage`**: cada preset são ~175 números
  (~4 KB). Umas centenas cabem à vontade; milhares não. Não se pôs guarda — é um spike.
