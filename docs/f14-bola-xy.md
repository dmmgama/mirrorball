# F14 — posição X/Z da bola na planta (spec do David, 2026-09-01)

Âmbito **FECHADO**, uma alteração única: **posição X e Y da bola na PLANTA da sala**, com sliders de
**passo 1 m**, no grupo **"Sala"** do painel, para poder variar a posição da bola na sala.
**A clareira do mikado tem de seguir a bola.** Tudo o resto inalterado.

> "X e Y" do David = os dois eixos da planta. No mundo Babylon a planta é **(X, Z)** — Y é a
> vertical, que já tinha o knob `bola: altura (m)` desde a F12. Os knobs chamam-se, por isso,
> `bola: posição X (m)` e `bola: posição Z (m)`.

Regras herdadas: motor nunca liga/desliga elementos e **não mexe em posição**; nada > 3 Hz;
`beamIntensity ≤ 0.18`; a bola não emite luz; NaN-safe; greyscale funcional; par liga/desliga
simétrico; **avisos NENHUNS** (F13 §4); nunca commitar `web/music-config.json`; `web/music.js`
intocado.

## Estado da implementação — F14 (Opus, 2026-09-01)

Tocados: `spike-babylon/v2/` → `ball.js`, `main.js`, `panel.js`, `config.js`, `mikado.js`,
`beams.js`, `incident.js`, `index.html` (cache-busters), `knobs-default.json` (regenerado:
175 → **177 knobs**). **`web/music.js` NÃO foi tocado** (nenhum bump de `music.js?v=`);
**`web/music-config.json` fora do commit**, como sempre.
Verificado ao vivo em `:8099/app/spike/v2/index.html?src=music` (motor ligado, `owner = music`),
WebGPU, **consola limpa**.

### Knobs novos (2) — 175 → **177**

| knob | faixa (passo) | default | grupo |
|---|---|---|---|
| `bola: posição X (m)` | −6 … +6 (**1**) | **0** (centro da sala) | **Sala** |
| `bola: posição Z (m)` | −6 … +6 (**1**) | **0** (centro da sala) | **Sala** |

Nenhum outro knob mudou de nome, faixa ou default. Os dois **PERSISTEM** (entram por `newSliders`,
que o `panel.js` acrescenta ao `PERSIST` automaticamente) e por isso **entram nos presets da F13.5
de graça** — verificado.

**Porquê no grupo "Sala" e não em "Mikado & Bola"** (onde vivem `bola (0/1)`, `bola: altura (m)` e
`bola: diâmetro (m)`): foi o pedido explícito do David, e faz sentido — *onde a bola está pendurada*
é uma decisão de sala (planta, pilares, corredores), não uma afinação da bola. Os outros três ficam
onde estavam.

---

## §1 — A abordagem: a MESMA da F12/F13, agora completa

A F12 escreveu, a propósito da altura: *"X e Z não mexem — a bola só sobe e desce"*. A F14 tira essa
limitação **sem mudar o padrão**, que é o ponto todo desta fase:

> O cálculo em CPU continua TODO no **referencial da bola** e **em raios**. O que se desloca é a
> **SALA** (−offset na entrada dos planos) e o **RESULTADO** (+offset na saída para o mundo).

São os **mesmos 4 sítios** que a F12 já tinha identificado, agora com as três componentes em vez de
só a cota:

1. os planos da sala em `computeColors` (`ball.js`);
2. a saída dos **dots** (`dotX[…]`);
3. a saída dos **feixes** (`beamP[…]`);
4. `updateCamDir` (direção bola→câmara).

Fora disso nada sabe que a bola mudou de sítio — que continua a ser o objetivo, porque é onde estão
os bugs. Com `ballX = ballZ = 0` o caminho é **bit a bit** o da F13 (medido: os três diâmetros
reproduzem a tabela da F13 §3 exatamente).

**A única assimetria nova, e é a que interessa:** até à F13 as duas paredes laterais eram
SIMÉTRICAS (`±roomHalfW`) porque a bola estava sempre no eixo da sala. Com a bola a andar em X
deixam de o ser — passam a `roomXPos` / `roomXNeg`, cada uma à sua distância do centro da bola. O
mesmo em Z para a parede de fundo (`roomBack`), que se aproxima ou se afasta. **É esta linha que faz
os dots aterrarem no sítio certo com a bola fora do eixo**; sem ela o raycast batia num plano
imaginário à distância errada e os pontos apareciam deslocados sem erro nenhum na consola.

```js
// ball.js, computeColors — ENTRADA (metros → raios, no referencial da bola)
const roomXPos = ( halfWm - ballX) * rbInv;    // F14: já não é simétrico
const roomXNeg = (-halfWm - ballX) * rbInv;
const roomCeil = (num(roomCfg.ceil)  - ballY) * rbInv;
const roomFloor= (num(roomCfg.floor) - ballY) * rbInv;
const roomBack = (num(roomCfg.back)  - ballZ) * rbInv;   // F14

// ... SAÍDA (raios → metros, depois translação do mundo)
dotX[d3] = Xw*rb + ballX;  dotX[d3+1] = Yw*rb + ballY;  dotX[d3+2] = Zw*rb + ballZ;
beamP[b3] = px*rb + ballX; beamP[b3+1] = py*rb + ballY; beamP[b3+2] = pz*rb + ballZ;
```

⚠ **A ordem importa e é a da F13**: `×rb` primeiro (raios → metros), `+offset` depois. O offset é
uma posição do mundo, não um raio — multiplicá-lo pela escala dava uma bola que "fugia" ao arrastar
o diâmetro.

## §2 — Fonte de verdade única: `ballCenter()` completo

`CONFIG.ballXEffective` / `ballZEffective` juntam-se ao `ballYEffective` da F12 e ao `ballR` da F13:
são a posição **já clampada** que o `ball.js` publica, e **ninguém deriva a posição do knob em cru**.
No `main.js`, `ballCenter()` deixou de ser `(0, y, 0)` e passa a devolver o centro completo, com os
três eixos a virem de `ball.centerX/centerY/centerZ`.

**Consumidores, todos verificados**: mira dos focos (`updateSpotLights`), auréola (`updateHalo`),
alvo da câmara (loop + `resetCameraPose`), cone incidente (`incident.update`), direção bola→câmara
(`beams.js`), clareira do mikado (`mikado.js`), probe, corrente e gancho.

**`applyBallY()` aplica a planta pelo MESMO caminho da cota** — uma função, uma ordem, um sítio onde
o clamp corre. Ter dois caminhos (um para Y, outro para X/Z) era garantir que um deles ficava para
trás no refactor seguinte; é a lição das F12/F13 (dois donos = o último a escrever ganha).

`incident.update()` passou a aceitar **`{x,y,z}` ou o número solto** da F12 — quem passar um número
tem exatamente o comportamento anterior. Sem isto ficava uma assinatura a mentir.

## §3 — Clamp: paredes E pilares

O slider vai a ±6 m; quem manda no limite REAL é o clamp do `ball.js`, e o **knob mantém o valor que
o David escolheu** (o slider não salta debaixo do dedo). É a mesma regra da altura, que também vai
aos 4,6 m e é clampada contra o pé-direito.

- **Paredes**: `|x| ≤ halfW − raio − 0,30 m` e `|z| ≤ |back| − raio − 0,30 m` (`WALL_GAP`).
- **Pilares**: as 2 filas em `X = ±pillars.halfX`, `rows` cotas em Z. Se o centro cair na sombra de
  um pilar **MONTADO** (secção/2 + raio + `PILLAR_GAP` 0,30 m), empurra-se **em X**, não em Z.

**Porquê empurrar em X e não em Z** (decisão, para não se reabrir): as filas de pilares correm ao
COMPRIDO da sala, por isso sair pelo lado é sempre o caminho curto. Em Z havia 3 cotas para escolher
e o slider "saltava" de forma imprevisível ao ser arrastado. A indexação dos pilares desligados
(`CONFIG.pillars.off`) é a MESMA do `room.js`/`mikado.js` — `side = -1` (L) e depois `+1` (R), rows
0..n — para os três módulos concordarem sobre que pilar é qual. **Um pilar desligado no painel não é
obstáculo** (regra da F13 §1, aplicada tal e qual).

⚠ **Os corredores laterais são inalcançáveis, e está certo.** O corredor entre a fila de pilares e a
parede mede **2,25 m** (`halfW 5,5 − (halfX 3,0 + secção/2 0,25)`); uma bola de Ø 2,0 m com 0,30 m
de folga de cada lado precisa de 2,60 m. Não cabe — nem com folga zero. Por isso, **à cota de uma
fila de pilares**, X pára em ±1,45 (Ø 2,0) ou ±0,95 (Ø 3,0). **Entre as filas** (p. ex. Z = ±2) o
mesmo knob a X = 4 chega ao limite da parede, medido exatamente 4,00. Não é uma limitação do código:
é a planta da sala.

## §4 — A clareira do mikado segue a bola (a metade da spec que se vê)

`mikado.js` lia `{x: 0, y: ballYEffective, z: 0}`. Passa a ler os três de
`CONFIG.ballXEffective/YEffective/ZEffective`, com fallback para os knobs em cru só enquanto o
`ball.js` ainda não correu (arranque). O rebuild é o caminho que já existia
(`onBallPosChanged` → `ball.applyHeight()` → `mikado.rebuild()` → `ball.refreshProbe()`), e **a
ORDEM é a armadilha nº 1 da F12**: primeiro a bola aplica e CLAMPA, só depois o mikado lê.

**Arranque**: o `createMikado` corre ANTES do `ball.js`, por isso o `preApplyReloadKnobs()` pré-aplica
os dois knobs novos (é a **quarta** vez que este padrão aparece: `bola (0/1)` na F11, a cota na F12,
o diâmetro na F13, a planta agora). O `main.js` compara a estimativa com o valor clampado logo a
seguir ao `createBall` e regenera **uma vez, e só nesse caso** — o log passou a dizer os três eixos.

## §5 — Regra 3 do handoff S10 (posição dos corpos) cumprida, e PROVADA

Os corpos dos focos, chapéus e robots **NÃO se mexem** quando a bola anda pela sala — só a MIRA.
Um pinspot montado em treliça não anda atrás da bola.

**Prova medida** (a posição dos corpos antes/depois de uma mudança de X/Z no MESMO tick, para o
choreo não poder mascarar o resultado):

```
antes:  spot0 (-8.586, 1.259, 5.732) · spot1 (7.817, 4.646, 5.046) · spot2 (-6.693, 3.861, 6.961)
depois: spot0 (-8.586, 1.259, 5.732) · spot1 (7.817, 4.646, 5.046) · spot2 (-6.693, 3.861, 6.961)
corpos iguais: true   ·   erro de mira: 0.000000   (bola movida para (-3, 0, 3))
```

---

## Verificação feita

### A prova decisiva (a mesma da F13 §3, agora sobre a planta toda)

**Varrimento de todas as 169 posições do slider** (X e Z de −6 a +6, passo 1 m), com a cadeia CPU
forçada a correr em cada uma (ver "Dívidas" — a 20 Hz do `COLOR_HZ` mente num varrimento síncrono):

| medição | resultado |
|---|---|
| pior desvio de um **dot** ao plano da sala | **0,000000000** |
| pior erro do **raio de origem dos feixes** | **2,8 × 10⁻⁷** (ruído de float) |
| pior desvio da **corrente/gancho ao prumo** | **0,000000** |
| **clareiras do mikado falhadas** | **0** (margem mínima 0,000 — nunca abaixo do exigido) |
| **NaN** em qualquer eixo | **0** |
| banners no `#err` | **0** |

### Posições individuais (motor a correr, `?src=music`, `owner = music`)

| caso | posição efetiva | dots (desvio) | feixes (raio) | corrente | clareira / exigida | mira |
|---|---|---|---|---|---|---|
| centro (baseline) | (0, 0, 0) | 1195 (0) | 110 (1,0000) | 0 | 1,518 / 1,50 | 0 |
| X = +4, Z = −2 (entre filas) | (**4,00**, 0, −2) | 1151 (0) | 110 (1,0000) | 0 | 2,191 / 1,50 | 0 |
| X = −4, Z = −2 | (**−4,00**, 0, −2) | 879 (0) | 110 (1,0000) | 0 | 2,270 / 1,50 | 0 |
| X = +4, Z = 0 (**cota de pilar**) | (**1,45**, 0, 0) ← clampado | 1171 (0) | 110 (1,0000) | 0 | 1,536 / 1,50 | 0 |
| Z = +6 (frente aberta) | (0, 0, **6,00**) | 427 (0) | 110 (1,0000) | 0 | 1,594 / 1,50 | 0 |
| Z = −6 (junto ao fundo) | (0, 0, **−6,00**) | 385 (0) | 110 (1,0000) | 0 | 1,593 / 1,50 | 0 |
| **extremos JUNTOS** X6 Z7 h4,6 Ø3,0 | (**0,95**, **−0,25**, **5,70**) | 333 (0) | 110 (**1,5000**) | 0 | 2,154 / **2,00** | 0 |

Os três clamps do último caso conferem à mão: X → `3 − (0,25+1,5+0,30) = 0,95`;
Z → `7,5 − 1,5 − 0,30 = 5,70`; Y → `ceil 2,0 − 1,5 − 0,25 = −0,25` (clamp da F13, não da F14).

**A contagem de dots CAI com a bola junto à frente/fundo (427/385 vs 1195 ao centro) e isso é
físico, não um bug**: a sala não tem parede frontal (Z+ é aberto para a câmara) e o rig de focos está
todo em Z > 0, por isso muitas reflexões saem da sala em vez de aterrarem. O raycast contra a parede
de fundo foi verificado à parte, no papel e no código: com a bola em Z = −6, um raio para −Z aterra
em **Z = −7,500000** exatamente (`room.back`).

### Não-regressão da F13 (diâmetro), com X = Z = 0

| | Ø 2,0 | Ø 2,5 | Ø 3,0 |
|---|---|---|---|
| `ballR` | 1,00 | 1,25 | 1,50 |
| raio da origem dos feixes (min = max) | 1,0000 | 1,2500 | 1,5000 |
| câmara (raio do mundo) | 7,00 | 8,75 | 10,50 |
| **FOV** | **0,5513** | **0,5513** | **0,5513** |
| pior desvio dos dots | 0 | 0 | 0 |

Os números da tabela da F13 §3 reproduzem-se **exatamente** — o caminho a X = Z = 0 é o de sempre.

### Resto da bateria

- **Consola limpa** num arranque de raiz (`localStorage` limpo): 10 módulos, **zero erros, zero
  avisos** — nem o `maxSimultaneousLights 12 > 8` do `room.js` disparou neste arranque. O ruído
  `Destroyed texture … SwapBufferProvider` é da automação (documentado desde a F11).
- **Par liga/desliga simétrico com a bola FORA do centro** (a armadilha da F11/F12 na roupa nova):
  `mikado (0/1)` 153 → 0 → **153** meshes; `bola (0/1)` 5 → 0 → **5**, e a clareira **fecha e reabre
  no sítio NOVO** (2,026 com bola → 1,443 sem → 2,026), não no centro da sala.
- **Greyscale** (`cor (0/1)`) funcional nos dois sentidos: (0,45 · 0,45 · 1,00) → (0,49 · 0,49 ·
  0,49) → (0,45 · 0,45 · 1,00).
- **NaN-safe** (regra 7): martelados `NaN`, `undefined`, `null`, `'x'`, `±Infinity` nos dois knobs
  com o motor a correr → posição efetiva 0/0 em todos os casos, e `centerX/Y/Z`, `ballXEffective`,
  `ballZEffective`, `camera.target.x/z` e `camera.radius` **todos finitos**, sem erro na consola.
- **PRESETS (F13.5)**: os dois knobs entram no snapshot; gravar com a bola em (−3, 4), mover para
  (2, −5) e aplicar o preset devolve **exatamente** (−3, 4) — e a clareira com ela.
- **Reload com estado não-default** (X = −4, Z = 3, Ø 2,5, altura 4,0): tudo persistiu e aplicou;
  knob −4 → efetivo **−3,95** (clamp do pilar), clareira **1,988** ≥ 1,75 exigido, câmara e gancho
  no sítio, **sem banner**, e o log do reconcile disparou **uma vez** com os três eixos.
- **Arranque limpo depois de apagar o `localStorage`**: 177 knobs, bola em (0, 0, 0), 40 barras (o
  default da F11), motor ligado, sem banner.
- **Tetos invioláveis**: `beamIntensity` 0,148 ≤ **0,18**; `mikado: flash Hz` 2,8 ≤ **3**.
- **`node gen-knobs-default.js` continua a correr** no sandbox sem DOM: 177 knobs, e o diff do
  ficheiro são **exatamente as 2 linhas novas**, ambas a 0.

## Dívidas / por afinar ao vivo com o David

- **Perf POR MEDIR limpa, outra vez.** A automação continua a mentir (`document.hidden = true`: o
  `requestAnimationFrame` não corre e um `scene.render()` forçado com o swapchain morto chega a
  bloquear o renderer — aconteceu três vezes nesta sessão). O custo que a F14 acrescenta por frame
  é **duas subtrações e duas adições** no loop por tile (as translações X/Z, que antes eram zero),
  mais duas comparações no `camera.target` — não se espera regressão estrutural, mas **não está
  medido**. Medir no stop visual, com a tab à frente: baseline 7,8-11,9 ms, alvo < 17,5.
- **Os corredores laterais não são alcançáveis** (ver §3). Se o David quiser mesmo pendurar a bola
  no corredor, há dois caminhos: baixar `PILLAR_GAP`/`WALL_GAP` (hoje 0,30 m, no `ball.js`) ou
  desligar o pilar no grupo "Pilares" — **o clamp já ignora pilares desligados**, e é o gesto mais
  honesto (numa sala real também se tira o pilar antes de lá pendurar a bola).
- **Empurrar em X e não em Z** é uma decisão de raciocínio (§3), não de sensação. Se ao arrastar o
  slider de Z o David sentir que a bola "resiste" onde não devia, a alternativa é resolver a colisão
  no eixo em que o utilizador está a mexer — mas isso exige saber QUAL o slider que mexeu, e hoje o
  clamp é uma função pura da posição pedida.
- **A faixa ±6 m é generosa de propósito** (a sala nominal é 11 × 15 m e os limites reais ficam bem
  dentro dela). Assim o knob não precisa de mudar quando os knobs ⟳ esticarem a sala. O preço é que
  as últimas posições do slider não fazem nada visível — o valor efetivo está no HUD (a linha `bola`
  passa a mostrar `(x … · z …)` quando a bola não está no centro).
- **A dívida da renderList do probe cresce mais um bocadinho** (herdada da F12/F13): o slider de
  posição pede um `refreshProbe` como o de altura e o de diâmetro. Continua a ser `RENDER_ONCE`
  (custo zero por frame), mas os refreshes são cada vez mais frequentes. A correção limpa continua a
  ser refazer a renderList no `rebuild()` do mikado; ficou fora do âmbito fechado da F14.
- **Armadilha de MEDIÇÃO, não de código** (custou uma iteração e vale a pena ficar registada):
  `ball.update()` só corre a cadeia CPU a **20 Hz** (`COLOR_HZ`). Num varrimento SÍNCRONO isso faz
  `beams.P`/`dots.X` ficarem do frame ANTERIOR enquanto `centerX/Z` já andou — e a medição acusa
  "feixes a 12 raios da superfície" que não existem. Quem voltar a medir isto tem de fazer avançar
  o relógio passado a `update(t, …)` em cada passo (ou renderizar frames a sério).
