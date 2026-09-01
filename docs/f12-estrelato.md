# F12 — densidade do mikado, bola móvel, chapéus a sério, estrelato (spec do David, 2026-09-01)

## Spec (verbatim/fixado)

1. **Mikado por densidade**: knob passa a ser **barras/m²** (da zona central) em vez de contagem
   absoluta — ao mudar a geometria da sala, a malha aumenta/diminui uniforme.
2. **Bug do banner**: "dimensões da sala mudaram — recarrega (F5)" aparece em permanência no fundo
   — é o falso alarme da F10 (panel.js reabre grupo "Sala" e re-aplica knob ⟳). **Corrigir**
   (screenshot do David 2026-09-01; a geometria certa já é aplicada por `preApplyReloadKnobs()`).
3. **Bola sobe e desce**: slider para a altura da bola (corrente encurta/alonga em conformidade).
4. **Chapéus com força**: o flash atual é levezinho — tem de ser **mais forte**, com **slider de
   intensidade do flash**; knob para **aumentar a frequência de uso dos chapéus pelo motor**.
   **Exclusão mútua**: quando o mikado entra, os chapéus não entram — e vice-versa (regra do motor;
   os toggles de montagem continuam a ser só do David).
   Modos de flash dos chapéus: **todos juntos** ou **sequência de uma ponta da sala à outra**
   (liga um de cada vez em fila, **simétrico dos dois lados da sala**).
5. **Dois modos de motor para os chapéus**:
   a) **auxiliares** — flashes ligeiros de suporte quando a bola é a estrela;
   b) **estrelato chapéus** — sala desligada e chapéus a fazer flashadas ou a sequência
      ponta-a-ponta.
   **Sistema de estrelato**: tem de haver momentos de estrelato para a **bola**, outros para o
   **mikado**, outros para os **chapéus**, e outros em que **é tudo smooth**. **Knob para calibrar
   o viés de estrelato** (mais mikado, mais bola ou mais chapéus).
6. **Explosão por default OFF** — o David liga quando quiser.

## Regras herdadas

- Motor nunca liga/desliga elementos montados — usa o que estiver disponível (`bola/mikado/chapéus`
  são knobs do David).
- Nada > 3 Hz; `beamIntensity ≤ 0.18`; a bola não emite luz; NaN-safe; greyscale-toggle funcional.
- Armadilhas S10/S11 (incl. a nova: par liga/desliga simétrico — `restoreEnabled()`).
- Registo aqui do que se fixar na implementação.

## Estado da implementação — F12 (Opus, 2026-09-01, POR COMMITAR — aguarda stop visual do David)

Ficheiro novo: **`spike-babylon/v2/stardom.js`**. Tocados: `main.js`, `panel.js`, `config.js`,
`mikado.js`, `hats.js`, `ball.js`, `beams.js`, `incident.js`, `index.html` (cache-busters),
`knobs-default.json` (regenerado: 153 → **171 knobs**).
**`web/music.js` NÃO foi tocado** — o estrelato faz POLL de `window.MUSIC.state`, o mesmo padrão da
F11. Logo NÃO há bump de `music.js?v=` e a F9 fica intocada.

---

### §1 — Mikado por DENSIDADE (barras/m²)

O knob `mikado: barras` (contagem absoluta) foi **substituído** por **`mikado: barras/m²`**
(0-1,6, def **0,81**). A contagem deriva de `densidade × área do miolo` (retângulo dos pilares já
com a folga `inset`): ao esticar a sala nos knobs ⟳ a malha escala uniforme, em vez de ficar ora
esparsa ora entulhada. Medido: sala nominal 49,3 m² → **40 barras** (idêntico ao default da F11,
continuidade visual total); vão 6→9 m e passo 5→7 m → 110,4 m² → 89 barras com a mesma densidade.
Determinismo da semente mantido (mesmo RNG, mesma ordem de consumo).
`MAX_BARS` subiu **48 → 72**: a 48 a densidade ficava cortada em silêncio nas salas grandes (o knob
dizia uma coisa e a sala mostrava outra). Quando ainda assim estoura, `generate()` **avisa na
consola** uma vez em vez de mentir. HUD mostra `mikado N barras (M m²)`.

### §2 — Banner "dimensões da sala mudaram" (o falso alarme permanente)

**A causa da F11 estava incompleta.** O diagnóstico anterior ("panel.js reabre o grupo Sala") não
reproduz — verificado ao vivo com `mb2.dbgOpen = 'Sala'`: sem banner. A causa REAL, reproduzida com
`MB2.panel.knobsSet(MB2.panel.knobsGet(), false)`, é mais geral: **qualquer reposição EM BLOCO de
knobs** chama o `set()` de todos, e o `set()` dos knobs ⟳ chamava `onRoomDimChanged()`
**incondicionalmente** — mesmo a reescrever o valor que já lá estava. Caminhos afetados: "repor
ficheiro gravado", "↺ reset" do grupo, "carregar ficheiro", e o `MIRRORBALL.knobs.set(j.ball)` que o
`music.js` dispara ao carregar o `music-config.json` — **este último depois de `panelReady = true`**,
pelo que o guard existente não o apanhava. Daí o banner fixo do screenshot do David.

**Correção** (`main.js`): guarda-se `BUILT_GEOM` — a fotografia da geometria com que a sala foi
REALMENTE construída, tirada logo a seguir ao `preApplyReloadKnobs()` e antes do `buildRoom()`. O
aviso passa a **comparar o CONFIG vivo com ela**: só aparece com diferença de facto, e **desaparece
sozinho** quando o valor volta ao da cena. Não se mexeu na ordem do `panelReady`/reabertura de
grupos — o caminho de reposição de knobs que a F10 consertou fica intacto.
Verificado: reposição em bloco dos 171 knobs → sem banner; `pé-direito` 5→6,2 → banner; 6,2→5 →
banner some.

### §3 — Bola que sobe e desce (`bola: altura (m)`, 2,0-4,6 m, def 3,5)

**A abordagem** (a decisão que evitou reescrever meio `ball.js`): o spike inteiro assume a bola na
origem (a normal de um tile É a sua posição; feixes e pontos na parede nascem daí, em coordenadas
absolutas). Em vez de mover esse cálculo, **move-se a SALA**: os planos entram no referencial da
bola (`−ballY`) e o RESULTADO sai para o mundo (`+ballY`). São 4 pontos em `computeColors`, mais
`updateCamDir`. `ballY = 0` reproduz bit a bit o comportamento anterior.

Dependências resolvidas (todas verificadas na cena):
- **Corrente** encurta/alonga: 2,0 m → **54 elos** · 3,0 → 27 · 3,5 → 14 · 4,2 → 7. Não é filha do
  `root`, por isso as matrizes levam `+ballY` explícito.
- **Focos montados**: ⚠ **REGRA 3 do handoff S10 cumprida** — a POSIÇÃO do corpo NÃO muda
  (continua `S·spotDist`); só a **mira** passa a apontar ao centro real (`ballCenter()`).
- **Probe** acompanha (`probe.position.y = ballY`) — sem isso os espelhos refletiam a sala do sítio
  errado.
- **Auréola**, **câmara** (escreve-se `target.y` direto; `setTarget()` dava salto de órbita),
  **cone incidente** (`incident.update(..., ballY)`), **`beams.js`** (direção bola→câmara).
- **Clareira do mikado** acompanha a cota. Medido em toda a faixa: distância mínima do eixo das
  barras ao centro da bola **1,49-1,98** (exigido 1,50) — nenhuma barra toca a bola.
- **Clamp**: fundo ≥ 1 m do chão, topo com 0,25 m livre até ao teto. Com pé-direito 5 m, o knob a
  4,2/4,6 estaciona em +0,25.

### §4 — Chapéus a sério

`chapéus: força do flash` (0-10, def **4,2** — a F8 tinha 2,2 **fixos no código**; a luz de sala
acompanha, ×3,6 por unidade, contra os 8 fixos de antes), `chapéus: flash ms` (def 180, com jitter
±40% para não soar a máquina), `chapéus: flash /min` (teto subiu 30→**60**: é a "frequência de uso"
pedida), `chapéus: modo (0=só/1=juntos/2=seq)` e `chapéus: sequência ms/passo` (≥334 ms).

**Sequência ponta-a-ponta SIMÉTRICA** — medida na cena, é o resultado exato pedido: acende o PAR
`(k, perLine+k)`, ou seja os dois chapéus à mesma distância do topo, um em cada fila
(`x−4,5` e `x+4,5`), a percorrer a sala (`z−1,3 → z1,3 → z3,8 → z6,3`) e a **inverter o sentido** no
fim (vai-e-vem, lê-se como onda contínua e não como reinício brusco).

**Teto de 3 Hz — clamp TRIPLO**: por fixture (`MIN_GAP_S`), no gesto (`SEQ_MIN_MS`) e no knob.
Medido a martelar `pulse('all')` a 60 Hz durante 5 s: **2,4 Hz**, gap mínimo 325 ms (o piso é 334;
os 325 são o meu limiar de deteção do emissivo, não uma ignição a mais).

### §5 — Sistema de ESTRELATO (`stardom.js`)

**Arquitetura**: módulo v2 próprio que faz **poll** de `window.MUSIC.state` (`fsm`, `bar`,
`dropCount`) — zero linhas em `web/music.js`, zero risco para a F9, e o gerador sintético (tecla
`g`) alimenta o mesmo caminho. Publica multiplicadores em **`CONFIG.stardom.gain`**
(`ball`/`mikado`/`hats`/`wash`/`hatsMode`) que os módulos leem com fallback 1.

**Porquê ganhos e não chamadas**: o motor de música já escreve `beamFraction`/`haze`/`rotationRpm`.
Se o estrelato escrevesse nos mesmos sítios, os dois lutavam pelo estado e o último a escrever
ganhava — o bug clássico deste repo. Os ganhos são um canal NOVO, que nada mais toca.

**Os 4 papéis** (perfis medidos e confirmados na cena, com a rampa assente):

| estrela | ball | mikado | hats | wash |
|---|---|---|---|---|
| `ball` | 1,00 | 0,12 | **0,45** (auxiliares, spec §5a) | 1,00 |
| `mikado` | 0,55 | 1,00 | **0,00** (exclusão mútua) | 0,80 |
| `hats` | 0,45 | **0,00** | 1,00 | **0,45** (resto da sala em baixo, spec §5b) |
| `smooth` | 0,70 | 0,22 | 0,20 | 1,00 |

**Exclusão mútua é ESTRUTURAL**, não uma regra à parte: só há UMA estrela de cada vez, logo mikado e
chapéus nunca podem estar os dois no palco. Verificado: com `star = mikado`, `gain.hats = 0,00`
exato; com `star = hats`, `gain.mikado = 0,00`.

**Trocas SÓ em fronteiras musicais** (requisito do brief): (1) transição de FSM, (2) drop
(`dropCount` sobe — troca sempre), (3) fim de frase (`estrelato: frase (compassos)`, def 8). Entre
fronteiras o estado é estável. **Capturado ao vivo** com o gerador sintético: `FSM BREAKDOWN→BUILD`
no compasso 36 e, no mesmo compasso, `★ smooth→mikado`.
Sem motor, relógio próprio (`estrelato: auto s`) — avisa uma vez na consola e degrada sem erros.

**Sorteio**: peso = viés do knob × tempero da FSM (`FSM_TILT`: em BREAKDOWN o smooth pesa 2,2×; num
DROP pesa 0,1×) × corte de repetição (`estrelato: não repetir`).

**Elegibilidade** — o motor NUNCA liga/desliga nada. Um elemento desligado no painel sai do sorteio
e o peso redistribui-se. ⚠ **Bug apanhado na verificação**: a elegibilidade só era testada no
SORTEIO, por isso desligar a peça que estava NO PALCO deixava-a lá até à fronteira seguinte — e
nesse intervalo a sala servia uma peça que já não existe (com o mikado desligado, os chapéus ficavam
mudos por exclusão mútua e não se via nada). Medido: 22 amostras com `star='mikado'` depois de
`mikado (0/1)` ir a 0. Corrigido com um teste por frame que reescolhe estrela de imediato.
Verificado depois: sem mikado → só `ball`/`hats`/`smooth`; sem chapéus → só `mikado`/`ball`/`smooth`;
tudo desligado → `smooth` (não rebenta).

**Chapéus são o único elemento comandado por CHAMADA** (`hats.pulse`), porque não tinham gesto de
conjunto; o mikado e a bola já têm máquinas próprias e comandam-se por ganho — dois donos a escrever
no mesmo sítio é a receita dos bugs deste repo.

### §6 — Explosão por default OFF

`localStorage` ganha aos defaults (armadilha S10), por isso mudar só o default não chegava.
**Decisão: migração PONTUAL versionada** — `mb2.explodeDefault = 'f12-off'` marca que a mudança já
foi aplicada nesta máquina; da primeira vez força `mb2.explode = 'off'` mesmo com `'on'` gravado, e
marca. A partir daí o botão/tecla do David manda como sempre. Para forçar outro default no futuro,
incrementa-se `EXPLODE_DEFAULT_VERSION`. As duas leituras (`setupXplButton` da F6 e o bloco F7)
passaram de `!== 'off'` para `=== 'on'`. Verificado: reload limpo → `explosões: off`.

---

### Knobs novos (18) — total 153 → **171**

Grupo **"Mikado & Bola"**: `bola: altura (m)` · `mikado: barras/m²` (substitui `mikado: barras`).
Grupo **"Sala"**: `chapéus: força do flash` · `chapéus: flash ms` ·
`chapéus: modo (0=só/1=juntos/2=seq)` · `chapéus: sequência ms/passo` (e `chapéus: flash /min`
passou a 0-60).
Grupo **"Estrelato"** (novo): `estrelato (0/1)` · `estrelato: força` · `estrelato: viés bola` ·
`estrelato: viés mikado` · `estrelato: viés chapéus` · `estrelato: viés smooth` ·
`estrelato: não repetir` · `estrelato: frase (compassos)` · `estrelato: rampa s` ·
`estrelato: auto s` · `estrelato: chapéus Hz` · `estrelato: chapéus gesto` ·
`estrelato: chapéus aux /min`.

### Armadilhas NOVAS (cada uma custou uma iteração, todas apanhadas na verificação)

1. **Ordem de aplicação da cota da bola.** O `onBallHeightChanged` regenerava o mikado ANTES de o
   `ball.js` ter aplicado (e CLAMPADO) a cota nova, por isso a clareira usava o valor do frame
   anterior — medido: knob a 4,2 m dava clareira a 1,31 em vez de 1,50. Corrigido com
   `ball.applyHeight()` chamado primeiro, e com **`CONFIG.ballYEffective`** como fonte de verdade
   ÚNICA da cota (o `mikado.js` já não deriva a cota do knob em cru: derivava um número diferente
   sempre que o clamp entrasse).
2. **Estouro de uniform blocks em WebGL2** com o modo "todos juntos":
   `VERTEX shader uniform block count exceeds GL_MAX_VERTEX_UNIFORM_BUFFERS (12)`, repetido a cada
   frame. Na F8 os chapéus flashavam UM de cada vez e o pico da cena era ~13 luzes; com 12
   PointLight de uma vez passava a ~27 e o WebGL2 rebentava a compilar o shader dos materiais com
   `maxSimultaneousLights: 12` (bola, núcleo, corrente). Corrigido com **`MAX_LIVE_LIGHTS = 4`**:
   o EMISSIVO dos 12 chapéus flasha na mesma (é o que se vê); só as luzes que PINTAM A SALA são
   limitadas, às 4 mais frescas. Verificado: emissivo 12, luzes 4, erro desaparecido.
3. **Caches de mesh invalidadas pela corrente reconstruída ao vivo.** Com o slider de altura, o
   `buildChain()` passa a correr fora do arranque e substitui as meshes. O `applyBallVisibility` do
   `main.js` memorizava o estado pela CONTAGEM de partes (que não muda), por isso uma corrente nova
   nascia VISÍVEL com a bola desligada — é a família da armadilha da F11 (**o par liga/desliga tem
   de ser simétrico**) numa forma nova. Corrigido com **`ball.chainGen`** na chave da cache. O
   `excludeBallFromRoomLights` tinha o problema gémeo com fuga de memória (as meshes mortas ficavam
   para sempre nos `excludedMeshes` e a arrastar o slider isso crescia sem limite) — corrigido com
   `purgeDeadExclusions()`.

### Verificação feita

- **Banner**: reposição em bloco dos 171 knobs → sem banner; alteração real → banner; desfazer →
  banner some. Também sem banner no arranque com `mb2.dbgOpen = 'Sala'` (o cenário da F11).
- **Densidade**: 49,3 m² → 40 barras; 110,4 m² → 89; determinismo confirmado (2 rebuilds iguais).
- **Bola móvel**: corrente 54/27/14/7 elos, clareira 1,49-1,98 em toda a faixa, probe/halo/câmara a
  acompanhar, corpos dos focos imóveis.
- **Chapéus**: sequência simétrica capturada frame a frame (pares no mesmo Z, filas opostas,
  vai-e-vem); "todos juntos" com os 12 a acender; teto de 3 Hz sob martelo a 60 Hz → 2,4 Hz.
- **Estrelato**: 4 papéis a rodar sem repetição, perfis de ganho exatos, exclusão mútua a 0,00,
  elegibilidade a redistribuir nos 3 casos + tudo desligado, e uma troca capturada EM CIMA de uma
  fronteira de FSM com o gerador sintético.
- **Consola limpa** no arranque: 10 módulos carregados, zero erros. Só os 2 `console.warn` de
  degradação (motor ausente) quando não há sidecar — que é o comportamento pedido.

### Dívidas / por afinar ao vivo com o David

- **Perf POR MEDIR limpa.** Em WebGPU com a tab à frente mediu-se **20-29 ms** (alvo < 17,5), mas a
  medição é dominada por ruído da automação: o MESMO estado deu 37,2 ms e 19,1 ms em janelas
  consecutivas, e um A/B intercalado de 8 blocos deu ON 23-29 vs OFF 18-29 — ou seja **o custo do
  estrelato não é mensurável acima do ruído** (são meia dúzia de contas por frame), como se esperava.
  O que se mediu com sinal: **o mikado custa ~4-10 ms** (15,5 ms sem ele vs 19-25 com), que é dívida
  da F11, não desta fase. Medir de novo no stop visual, sem automação.
- **192 meshes mortas na renderList do probe.** O pool do mikado subiu 48→72, e a renderList é
  fixada no `attachProbe` com o pool INTEIRO: 432 meshes de mikado registadas, só 240 ativas. O
  probe é `RENDER_ONCE` (confirmado: `refreshRate = 0`), por isso não custa por frame — mas custa em
  cada refresh, e os refreshes agora são mais frequentes (o slider de altura pede um). Se incomodar,
  a correção é refazer a renderList no `rebuild()` do mikado em vez de a fixar uma vez.
- **Perfis do estrelato são de SENSAÇÃO.** A tabela de ganhos (0,45 para os chapéus auxiliares, 0,80
  do wash no mikado, etc.) foi escolhida por raciocínio de técnico de luz, não ouvida com música
  real. É o primeiro sítio onde o David vai querer mexer — e `estrelato: força` permite-lhe tirar
  teatro sem desligar o sistema.
- **`FSM_TILT` por validar**: o tempero por secção (smooth ×2,2 em BREAKDOWN, ×0,1 no DROP) é uma
  aposta razoável mas nunca foi ouvida.
- **`MAX_LIVE_LIGHTS = 4`** foi escolhido pelo limite do WebGL2, não por gosto. Se o David achar o
  flash de conjunto "pouco presente" na sala, sobe-se — mas só até onde o backend aguentar.
- O modo 2 dos chapéus (sequência) corre em CONTÍNUO enquanto `flash /min > 0`, em vez de o Poisson
  decidir quando a onda arranca — simplificação deliberada para o comportamento ser previsível ao
  afinar. Se ficar monótono, o Poisson pode passar a disparar rajadas de onda.
