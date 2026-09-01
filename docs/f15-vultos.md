# F15 — VULTOS: pessoas a dançar (spec do David, 2026-09-01)

## Spec (verbatim/fixado)

Adicionar **vultos na sala como se fossem pessoas a dançar**. Diversidade: **variar altura, cabelo,
estatura física, género**. **Menu "Vultos"** no painel: ligar/desligar, **densidade**,
**luminosidade**, etc.; **botão para a luz poder atravessar ou não os vultos** (oclusão on/off);
**slider de opacidade dos vultos**.

Regras herdadas: o motor **nunca** liga/desliga vultos (o knob é do David); nada > 3 Hz;
`beamIntensity ≤ 0.18`; a bola não emite luz; NaN-safe; greyscale `cor (0/1)` funcional; par
liga/desliga **simétrico** (armadilha F11); PBR novo com `RawCubeTexture` própria (senão TUDO
PRETO); os vultos **entram na renderList do probe** (a bola tem de espelhar a pista); zero
banners/avisos; `web/music.js` e `web/music-config.json` **intocados**.

## Estado da implementação — F15 (Opus, 2026-09-01)

Ficheiro novo: **`spike-babylon/v2/crowd.js`**. Tocados: `main.js`, `panel.js`, `config.js`,
`ball.js`, `index.html` (cache-busters), `knobs-default.json` (regenerado: 177 → **193 knobs**).
**`web/music.js` NÃO foi tocado** — os vultos fazem POLL de `window.MUSIC.state`, o mesmo padrão da
F11/F12; logo não há bump de `music.js?v=`. **`web/music-config.json` fora do commit**, como sempre.
Verificado ao vivo em `:8099/v2/index.html` (WebGPU) e em `:8099/app/spike/v2/index.html?src=music`
(motor carregado, `owner = music`), **consola limpa**.

### Knobs novos (16) — 177 → **193**, grupo próprio **"Vultos"**

| knob | faixa (passo) | default | efeito |
|---|---|---|---|
| `vultos (0/1)` | 0-1 (1) | **1** | monta/desmonta a pista. **Só o David.** |
| `vultos: densidade (p/m²)` | 0-0,9 (0,01) | **0,30** | ⟳ pista · 0,30 × 135 m² ≈ **41 pessoas** |
| `vultos: luminosidade` | 0-3 (0,05) | **1,0** | quanto a luz da sala os revela (× albedo) |
| `vultos: opacidade` | 0-1 (0,01) | **1,0** | 1 = **opacos a sério** (material OPAQUE) |
| `vultos: oclusão (0/1)` | 0-1 (1) | **1** | **o botão da spec**: 1 = a luz não os atravessa |
| `vultos: oclusão raio ×` | 0,3-2,5 (0,05) | **1,05** | inflação do cilindro de oclusão |
| `vultos: semente` | 1-99 (1) | **11** | ⟳ pista · troca a multidão inteira |
| `vultos: altura média (m)` | 1,5-1,95 (0,01) | **1,72** | ⟳ pista |
| `vultos: altura variação (m)` | 0-0,4 (0,01) | **0,26** | ⟳ pista · dá a faixa **1,55-1,91 m** medida |
| `vultos: estatura variação` | 0-0,5 (0,01) | **0,22** | ⟳ pista · magro ↔ corpulento |
| `vultos: folga paredes (m)` | 0-3 (0,1) | **0,6** | ⟳ pista |
| `vultos: folga bola (m)` | 0-3 (0,1) | **0,6** | ⟳ pista · além do raio; ninguém sob a bola |
| `vultos: espaço pessoal (m)` | 0,3-2 (0,05) | **0,55** | ⟳ pista · eixo a eixo |
| `vultos: virados à bola` | 0-1 (0,05) | **0,45** | ⟳ pista · 0 uniforme, 1 todos a olhar |
| `vultos: dança amplitude` | 0-2 (0,05) | **1,0** | ao vivo · 0 = pista parada |
| `vultos: bpm sem motor` | 60-160 (1) | **104** | ao vivo · ritmo próprio sem `window.MUSIC` |

Nenhum knob anterior mudou de nome, faixa ou default (exceto nenhum — os 177 ficam intactos). Os 16
**PERSISTEM** (entram por `newSliders`, que o `panel.js` acrescenta ao `PERSIST` automaticamente) e
por isso **entram nos presets da F13.5 de graça** — verificado: os 16 aparecem no `knobsGet()` e o
round-trip gravar → mudar → aplicar devolve os valores exatos.

**Porquê grupo PRÓPRIO e não "Sala"**: são 16 knobs, e a pista é uma peça da cena por direito
próprio (o público), não uma afinação de outra coisa. O David pediu o "menu Vultos" por nome. A
ordem dentro do grupo põe primeiro o interruptor e os **4 knobs da spec** (densidade, luminosidade,
opacidade, oclusão), e só depois diversidade, colocação e dança.

---

## §1 — O que se vê: silhuetas, não bonecos

A direção era "vulto na penumbra, nada de cartoon". Numa pista real às escuras as pessoas leem-se
como **massas escuras** com rim light ocasional — a forma e o movimento é que as distinguem, não o
detalhe. Por isso:

- **8 meshes por pessoa** (anca, tronco, cabeça, cabelo, 2 braços, 2 pernas) e **NENHUMA cara**. A
  cabeça é uma esfera achatada; o cabelo é uma casca por cima dela.
- **DOIS materiais para a pista inteira** (corpo + cabelo). Não é só poupança: às escuras toda a
  gente é da cor da penumbra. Um material por pessoa dava 80 shaders e uma pista que parece um
  catálogo de roupa.
- **Sem articulações a mais.** Não há cotovelo nem joelho: a 8 m de distância não se lêem, e
  custavam 4 meshes por pessoa. Há OMBRO e ANCA, que são as que dão o gesto.

**Truque do PIVOT** (vale a pena registar): uma caixa nasce centrada na origem, portanto rodá-la
gira-lhe o MEIO — um braço tem de girar no OMBRO. Em vez de nós intermédios (mais TransformNodes =
mais matrizes por frame), faz-se `bakeCurrentTransformIntoVertices` com a caixa já descida meio
comprimento: o topo fica na origem local e a rotação passa a ser em torno do ombro. Custo: uma malha
por membro, criada UMA vez.

### §1.1 — Proporções: duas correções, ambas vindas da cena

A 1ª versão dava **"pirolitos com pernas de andas"**. O que se lê a esta distância é a RAZÃO entre
perna, tronco e cabeça, e três números estavam errados:

| | 1ª versão | corrigido | porquê |
|---|---|---|---|
| perna | 0,455·h | **0,445·h** | entreperna real ~0,47; a perna comprida destruía a leitura |
| tronco | 0,30·h | **0,345·h** | fechava o vão anca↔ombros |
| pescoço | 0,045·h | **0,008·h** | o vão cabeça↔ombros via-se; um pescoço a sério não |
| largura do tronco | média ombros/anca | **max(0,97·ombros, 1,02·anca)** | saía MAIS ESTREITO que a anca em quem tinha ancas largas — silhueta invertida |
| pernas | 0,50·prof, ±0,26 anca | **0,66·prof, ±0,17 anca** | duas hastes finas e afastadas = andas |
| braços | ombro/2 + folga | **0,44·ombros** | braços afastados leem-se como quem leva malas |

Medido depois, numa pessoa de 1,75 m: pernas 0→0,824 · anca 0,824→1,00 · tronco 1,00→1,575 · topo da
cabeça 1,735 · braço do ombro (1,534) até 0,942 = meio da coxa. Anatomicamente certo.

### §1.2 — O tom: a "parede de luz" do S9 outra vez, em roupa nova

**As silhuetas nasciam BRANCAS**, mais claras que o chão — o contrário exato da spec. Duas causas,
as duas medidas:

1. **`spot0`/`spot1` a I = 605/690.** São os pinspots da bola, e o cone deles continua PARA LÁ dela:
   quem estava atrás apanhava 600 unidades em cheio. É literalmente o bug "parede de luz" do S9, que
   já tinha posto os 5 planos da sala em `excludedMeshes` desses mesmos focos.
   **Correção**: os vultos entram na MESMA exclusão. Chegou-se a pensar em deixar passar por
   realismo (uma pessoa a atravessar o feixe apanha-o mesmo); a medição mostrou que a 600 unidades
   isso não é realismo, é saturação a branco. ⚠ Esta exclusão é **permanente** — não faz parte do
   botão de oclusão.
2. **O wash é uma `HemisphericLight` a apontar de CIMA**: as faces horizontais (ombros, cabeças)
   apanham-na a peso total enquanto as paredes a apanham de raspão. Com albedo 0,030 os topos
   ficavam mais claros que as paredes (0,055). **Baixado para 0,022** — de volta à penumbra, e o rim
   light continua a existir onde deve.

O que os vultos CONTINUAM a apanhar (e é onde vive o rim light das fotos): o **wash da sala**, os
**flashes dos chapéus**, os **robots de teto** e o **flash do mikado**.

## §2 — Diversidade determinística

RNG **Mulberry32 com semente** (a MESMA função do `mikado.js`) — a multidão é estável entre frames e
entre reloads, senão não há como afinar nada.

- **Altura**: distribuição **TRIANGULAR** (soma de duas uniformes), não uniforme — dá uma população
  com massa no meio e caudas raras, que é como as alturas se distribuem, e evita a pista de "metade
  gigantes, metade anões". ⚠ **Por isso o knob de variação não é a faixa**: a triangular raramente
  toca as caudas. Medido com 41 pessoas: 0,16 → 1,61-1,84 (curto de mais); **0,26 → 1,55-1,91**
  (a faixa da spec); 0,30 → 1,52-1,94. Ficou 0,26; o clamp duro (1,42-2,02) apanha os extremos.
- **Género como eixo CONTÍNUO 0..1**, não duas caixas. Move três coisas ao mesmo tempo: razão
  ombros/anca, altura da cintura, comprimento relativo das pernas. E há um `mix` que **estraga a
  correlação de propósito em ~25% dos casos** — numa pista real há ombros largos com ancas largas e
  o contrário, e uma multidão gerada por duas fórmulas limpas lê-se logo como duas espécies.
- **Estatura física** (`vol`): multiplica larguras e profundidade — magro ↔ corpulento.
- **Cabelo**: 6 silhuetas (rapado 14% · curto 28% · médio 24% · comprido 18% · apanhado 9% ·
  volumoso 7%), sorteadas **independentemente do género** — numa pista real o cabelo não diz o
  género de ninguém.
- **Orientação**: viés para "virado à bola" (`faceBias`), com muito ruído — há sempre quem esteja de
  costas, virado ao bar ou ao DJ.

**Medido** (41 pessoas, semente 11): **37 alturas distintas** de 41, **35 larguras de ombros
distintas**, e as **6 silhuetas de cabelo presentes**.

## §3 — A dançar (e o contrato REAL do motor)

Movimento por frame, sem bones e sem skinning: cada vulto escreve `rotation.z` (tombo lateral do
peso), `rotation.x` (balanço à frente/atrás), a posição do root, e as rotações de ombro/anca. Cada um
com **fase própria** (`phase`), **ritmo ligeiramente diferente** (`rate` 0,92-1,08 — quem está fora
do tempo é o que faz a pista parecer viva) e **amplitude própria** (há quem dance muito e quem esteja
quase parado a beber). **Braços**: 55% baixos, ~31% a acompanhar, ~14% ao ar — a minoria é
deliberada, uma pista inteira de braços no ar lê-se como um concerto, não como um clube.
⚠ O **YAW não se toca por frame** (é do `layout()`): ninguém gira sobre si próprio a dançar, e
reescrevê-lo criava um segundo dono do mesmo número, que é a assinatura dos bugs deste repo.

**Medido**: desvio-padrão do tombo lateral **0,052 rad** entre as 41 pessoas, de −0,102 a +0,101 —
toda a gente numa fase diferente, zero sincronismo de exército.

### ⚠ O contrato do motor: os campos que eu inventei NÃO existem

A 1ª versão fez poll de `state.bpm` e `state.kickCount`. **Nenhum dos dois existe** em
`web/music.js`. A pista teria ficado MUDA com o sidecar a tocar, **sem um único erro na consola** —
foi a verificação em modo música (`?src=music`) que a apanhou. O contrato REAL, lido no motor:

| campo | o que é | onde |
|---|---|---|
| `state.bpmEst` | **PERÍODO DA BATIDA em MILISSEGUNDOS**, não o BPM | o motor publica `bpm: 60000/bpmEst` no seu HUD, `music.js:2266` |
| `state.beatPhase` | fase **0..1 dentro da batida**, da grelha | `music.js:1654` |
| `state.gridConf` | confiança na grelha (< ~0,25 não vale a pena seguir) | — |
| `state.kickFlash` | envelope 0..1 do BOMBO, posto a 1 na batida e a decair ×0,92/frame | `music.js:1346/1352` |

**Segue-se a `beatPhase` do motor, não só o BPM.** Se cada peça integrar o seu próprio relógio a
partir do BPM, ao fim de um minuto a pista está fora de fase com a bola e com o mikado mesmo com o
tempo certo. Com a fase do motor, a pista está no MESMO tempo que tudo o resto — que é o ponto todo
de haver um motor. O alinhamento é um **LERP curto pelo caminho circular mais curto** (sem isso a
pista "rebobinava" na fronteira 0,99 → 0,01), portanto **nunca há salto**.

**Medido**: com um motor simulado a 174 BPM pelo contrato real, a pista lê **174,0** exatamente; a
amplitude do bob vertical cresce de 0,0077 para **0,0262 m** com o bombo (é a resposta ao kick); com
`gridConf` a 0 volta ao relógio próprio sem solavanco (maior salto medido 0,108 rad, dentro da
amplitude natural). Sem `window.MUSIC` avisa **uma vez** na consola e corre a 104 BPM.

### Teto de 3 Hz — cumprido com folga

O balanço é **um ciclo por DOIS tempos** (uma pessoa desloca o peso a cada 2 beats), logo a
frequência do gesto é **`bpm/120` Hz**: **1,45 Hz a 174 BPM**, 0,87 Hz a 104. Muito abaixo do teto.
E é movimento **contínuo** (sinusoide), não estroboscópico.

## §4 — Colocação

Sorteio rejeitivo na sala toda menos `folga paredes` (o público espalha-se por tudo — nas fotos do
Lux há gente entre os pilares, nos corredores e encostada às paredes; quem quiser a multidão só ao
centro sobe a folga). Densidade em **pessoas/m²**, o mesmo padrão do `mikado: barras/m²` da F12: muda
a sala nos knobs ⟳ e a multidão escala sozinha.

Rejeita-se quem caia: **(a)** na vertical da bola (`ballR + folga bola` — ninguém dança debaixo de
200 kg, e uma cabeça a tocar na bola estraga a escala toda); **(b)** num **pilar MONTADO** (um pilar
desligado no painel **não é obstáculo** — regra F13 §1 aplicada tal e qual, com a MESMA indexação
`side=-1` depois `+1`, rows 0..n, do `room.js`/`mikado.js`/`ball.js`: os quatro têm de concordar
sobre que pilar é qual); **(c)** perto de mais de outra pessoa (`espaço pessoal`).

**Medido** (41 pessoas): **0** dentro de um pilar montado · **0** fora das paredes · distância mínima
ao centro da bola **1,912 m** (exigido 1,60) · espaço pessoal mínimo **0,603 m** (exigido 0,55).

A pista **segue a bola**: o `onBallPosChanged`/`onBallHeightChanged`/`onBallDiameterChanged`/
`onBallToggleChanged` e o `onPillarsChanged` regeneram a multidão, sempre **DEPOIS** de o `ball.js`
ter clampado e publicado (armadilha nº1 da F12: a ordem importa). Com `bola (0/1)` a 0 o círculo
vazio desaparece e a multidão preenche o centro.

## §5 — OCLUSÃO: o compromisso, medido

O botão tem **duas metades**, e só as duas juntas são o que o David pediu.

### Metade A — as luzes de sala (`main.js: applyCrowdOcclusion`)

**ON** = os vultos participam na luz: chapéus, robots e o flash do mikado acendem-lhes as silhuetas
e eles tapam o que está atrás. **OFF** = entram em `excludedMeshes` das 20 luzes de sala (12 chapéus
+ 4 robots + 4 mikado) e a luz atravessa-os. **Medido, e simétrico**: 0 → 640 → 0 meshes em cada uma
das 20 luzes, sem duplicados. As SpotLight da bola ficam **sempre** excluídas (§1.2).

### Metade B — os dots da bola (`ball.js`, raycast em CPU)

Os dots são calculados em CPU no loop por tile × spot. O `crowd.js` publica em `CONFIG.crowd.occ` um
`Float32Array` plano — **`[x, z, raio, yTop]` por pessoa, em metros do mundo** — e a contagem em
`CONFIG.crowd.occN`; o `ball.js` lê isso **sem conhecer este módulo** (nenhum import nos dois
sentidos — é o mesmo canal do `CONFIG.stardom.gain`: um sítio no CONFIG, um dono a escrever, vários a
ler). A tabela converte-se **uma vez por frame** para o referencial da bola e para RAIOS — a mesma
fronteira que a F13 §3 fixou — e cada raio de dot testa-se contra os cilindros ANTES de aceitar o
ponto na parede. Um dot que bate numa pessoa **morre nela**.

**O compromisso, declarado: são CILINDROS VERTICAIS, não a malha real.** O raio é meia largura de
ombros (× `oclusão raio ×`), a base é o chão e o topo é o cimo da cabeça. Porquê: o raycast corre
milhares de vezes por frame, portanto o teste tem de custar ~10 operações, não uma travessia de BVH;
e a silhueta que interessa é a do tronco, cuja largura é a mesma a 1,0 m e a 1,7 m de altura. O erro
(braços e cabelo de fora, pernas cobertas de mais) é menor que o raio da mancha que um dot deixa.

**⚠ E o pré-filtro que a torna pagável.** A primeira versão custava **4,8 ms** por tique da cadeia
CPU com 61 pessoas (16,5 vs 11,7 ms) — inaceitável para matar ~3% dos pontos. A observação que a
corta quase toda: **a bola está a 3,5 m e as cabeças a ~1,8 m, portanto a grande maioria dos raios
sai para CIMA** (teto e paredes altas) e nunca pode tocar em ninguém. Basta comparar o ponto mais
baixo do segmento com a cabeça mais alta da pista — **duas comparações** — para saltar o loop das 80
pessoas.

| | 61 pessoas (antes) | 80 pessoas (com pré-filtro) |
|---|---|---|
| `ball.update` com oclusão | 16,5 ms | **7,0 ms** |
| `ball.update` sem oclusão | 11,7 ms | **6,3 ms** |
| **custo da oclusão** | **4,8 ms** | **0,7 ms** |
| dots mortos | 48 de 1581 (3,0%) | **236 de 1657 (14,2%)** |

Com a oclusão OFF, `occN` é 0 e nem se paga a conversão: o caminho é **bit a bit** o da F14.
Reversível (1421 → 1657 → 1430, dentro do ruído do frame).

**O que a oclusão NÃO faz** (e é honesto dizê-lo): não desenha SOMBRA de ninguém no chão, e os dots
não pintam manchas nos corpos. Um dot que bate numa pessoa desaparece — não se acende nela. A luz
que acende as silhuetas é a das luzes de sala, pelo caminho normal do PBR.

## §6 — Motor vs vultos: quem manda em quê

O **motor NUNCA liga/desliga vultos** — `vultos (0/1)` é do David, como a bola e o mikado.
**Decisão sobre o estrelato** (a spec deixava em aberto): o estrelato pode modular a **luminosidade**
e mais nada. Os vultos não entram no sorteio de estrela — não são uma peça de luz, são o público.
O que faz sentido, e é o que está implementado (`starGain()`): quando o mikado ou os chapéus são a
estrela, a luz vem de cima e bate nas cabeças, portanto a pista fica um pouco **mais lida**; quando a
bola é a estrela, o público **recolhe para a penumbra** e a bola fica sozinha no palco. É um
multiplicador ancorado em 1 (`0,75 + 0,45·g`, ou seja **0,75 a 1,2**), nunca passa do knob do David,
e com o stardom ausente devolve 1.

---

## §7 — REGRA PERMANENTE: compatibilidade de presets e configs entre versões

**Regra nova do David (2026-09-01), aplicada já na F15 e válida daqui para a frente:**

> Todos os presets e configs de knobs gravados têm de manter **compatibilidade entre versões** — um
> config/preset gravado numa versão tem de fazer **load na seguinte**.

Nunca se pode perder um ficheiro do David por ter sido gravado antes de uma fase nova. Em concreto,
os quatro pontos, e onde cada um está garantido no código:

| # | regra | onde vive |
|---|---|---|
| 1 | knobs **novos ausentes** num ficheiro antigo assumem os **defaults**, sem erro | `knobsSet` e `sanitizePreset` iteram os **`sliders` conhecidos**, não as chaves do ficheiro, e saltam o que não for `Number.isFinite` |
| 2 | knobs **renomeados** passam SEMPRE pelo mapa **`RENAMED`** do `panel.js` — **nunca apagar uma entrada** | `migrate()`, chamado na leitura do `mb2.knobs` **e** dentro do `sanitizePreset` |
| 3 | knobs **removidos** (e lixo) são **ignorados** sem partir o load, e nunca entram no CONFIG | mesma iteração sobre `sliders` do ponto 1 |
| 4 | o **sanitize dos presets** (F13.5) não pode **rejeitar** um ficheiro por lhe faltarem campos novos | `sanitizePreset`: um preset com `knobs: {}`, sem `cam` e sem `toggles` é válido |

O `RENAMED` **só cresce**: cada linha é a única ponte para os ficheiros gravados antes desse rename,
e apagá-la transforma esse knob num órfão **em silêncio** (o David perde o valor sem aviso). A regra
ficou escrita em bloco no topo do `panel.js` e repetida em comentário no `sanitizePreset`, que é o
sítio onde uma edição futura a partiria sem dar por isso.

### Verificação (bateria específica desta regra)

Construiu-se um `mb2.knobs` **"da F14"** — os 177 knobs **sem nenhum `vultos: *`** — mais um nome
**antigo** por migrar (`sphereOpacity (motor manda)` = 0,42), um knob **removido na F10**
(`sala: largura (m)`) e **lixo puro** (`knob que nunca existiu`). E três presets no mesmo estado,
escritos **diretamente no `localStorage`** como uma versão anterior os teria gravado, incluindo um
preset **mínimo** (`knobs: {}`) e um **sem campo `cam`**.

| teste | resultado |
|---|---|
| carregar o `mb2.knobs` antigo (179 chaves) | **177 aplicados**, `erro: null` |
| (1) knobs da F15 ausentes no ficheiro | mantiveram os valores vivos (dens **0,5** · semente **61** · lum **2,0**) — **não foram a zero nem a default à força** |
| (2) `RENAMED` | `sphereOpacity (motor manda)` = 0,42 → **`bola: opacidade (0-1)` = 0,42** |
| (3) knob removido + lixo | **não entraram no CONFIG** (`lixoNoConfig: false`); o resto do ficheiro aplicou-se (`mikado: barras/m²` = 0,55) |
| (4) presets antigos ao **arranque** | os **3 sobreviveram** ao `sanitizePreset`; o "F14 antigo" ficou com **177** knobs (lixo e knob removido descartados) |
| aplicar cada preset antigo pela **API real** (`presets.apply(i)`, o caminho do clique no nome) | os 3 sem erro; opacidade migrada = **0,42**; knobs da F15 intactos; **todos os valores finitos** |
| preset **mínimo** (`knobs: {}`) e **sem `cam`** | aplicam limpos, sem exceção |
| estado final | **193** knobs, cena viva (68 vultos), **zero banners** |

## Verificação feita

| teste | resultado |
|---|---|
| **Diversidade** (41 pessoas) | **37** alturas distintas · **35** larguras de ombros · **6/6** silhuetas de cabelo · faixa **1,55-1,91 m** |
| **Colisões** | **0** dentro de pilar montado · **0** fora das paredes · mín. à bola **1,912** (exigido 1,60) · espaço pessoal mín. **0,603** (exigido 0,55) |
| **Par liga/desliga simétrico** (armadilha F11) | **629 → 0 → 629** meshes; `occN` **80 → 0 → 80** |
| **Greyscale `cor (0/1)`** | (0,026 · 0,026 · 0,032) → (0,027 · 0,027 · 0,027) → volta ao original; **neutro e reversível** |
| **Opacidade 0 → 1** | 0 / 0,5 → ALPHABLEND · **1,0 → OPAQUE** (lição da F13 §2 aplicada de raiz) |
| **NaN-safe** (regra 7) | `NaN`/`undefined`/`null`/`'x'`/`±Infinity` nos **14** knobs **e um motor a mentir** (`bpmEst`/`gridConf`/`beatPhase`/`kickFlash` todos NaN): **0** valores não-finitos, sem exceção, BPM finito, recupera para 80 pessoas |
| **Oclusão ON/OFF** | **236 de 1657 dots mortos (14,2%)** com 80 pessoas; **reversível**; 20 luzes de sala **0 → 640 → 0**, sem duplicados |
| **Perf da oclusão** | **+0,7 ms** por tique da cadeia CPU no pior caso (80 pessoas) — ver §5 |
| **Perf do `crowd.update`** | mediana **0,0 ms**, máximo 0,2 ms (300 frames, 80 pessoas) |
| **Probe / a bola espelha a pista** | **640/640** meshes na renderList (**0** TransformNodes), `refreshRate = 0` (RENDER_ONCE), `mirror.reflectionTexture === probe.cubeTexture` |
| **Dança com motor** | BPM lido **174,0** de `bpmEst`; bob **0,0077 → 0,0262 m** com o bombo; alinha à `beatPhase` sem salto (maior salto 0,108 rad) |
| **Dança sem motor** | 104 BPM próprios, avisa **uma vez** na consola, degrada sem erros |
| **Dessincronizado** | desvio-padrão do tombo **0,052 rad**, de −0,102 a +0,101 |
| **Teto de 3 Hz** | **1,45 Hz** a 174 BPM (`bpm/120`), 0,87 Hz a 104 |
| **`beamIntensity`** | ≤ **0,18** (intocado — a F15 não lhe chega perto) |
| **Presets (F13.5)** | os **16** knobs entram no snapshot de graça; round-trip devolve os valores exatos |
| **Reload com estado não-default** | densidade 0,42 · semente 47 · lum 1,8 · oclusão 0 · opacidade 0,6 · altura 1,80 (+ bola a X −3, Ø 2,5, pilar 3 off): **tudo persistiu e aplicou**, `alpha = 0,60`, **sem banner** |
| **Arranque limpo** (`localStorage` vazio) | **193** knobs, 41 vultos, semente 11, `hVar` 0,26, sem banner |
| **Consola limpa** | 11 módulos, **zero erros**. Avisos: só o `maxSimultaneousLights 12 > 8` do `room.js` (**pré-existente**, documentado desde a F11), o ruído `Destroyed texture … SwapBufferProvider` da automação, e os 3 avisos de degradação "motor ausente" (mikado, estrelato, vultos) — que é o comportamento pedido sem sidecar |
| **Modo música** | `?src=music` carrega, `owner = music`, 193 knobs, sem banner |
| **`node gen-knobs-default.js`** | continua a correr no sandbox sem DOM: **193** knobs, e o diff são **exatamente as 16 linhas novas** |

## Dívidas / por afinar ao vivo com o David

- **Perf POR MEDIR limpa, outra vez** (é a 5ª fase seguida com esta dívida, e a razão é sempre a
  mesma). A automação mente: `document.hidden = true`, o `requestAnimationFrame` não corre, e um
  `scene.render()` forçado com o swapchain morto chega a **matar o renderer** — aconteceu duas vezes
  nesta sessão (ecrã preto, foi preciso recarregar). O que ESTÁ medido a sério é o custo em CPU, que
  se cronometra sem GPU: **+0,7 ms** de oclusão e **0,0 ms** de `crowd.update`. O que falta medir é o
  custo de DESENHO das 640 meshes pequenas, com a tab à frente. Baseline de referência 7,8-11,9 ms,
  alvo < 17,5.
  ⚠ **Armadilha de medição herdada da F14, e voltou a morder**: `ball.update()` só corre a cadeia CPU
  a **20 Hz** (`COLOR_HZ`). Um bench com passos de 0,2 s mede **zeros** — quem voltar a medir tem de
  garantir um passo > 1/20 s a cada amostra.
- **O pool são 80 pessoas** (`MAX_PEOPLE` em crowd.js) = **640 meshes** criadas no arranque. Acima
  disso o `generate()` avisa uma vez na consola em vez de mentir (mesma regra do `MAX_BARS` do
  mikado). A densidade máxima do knob (0,9/m²) pede ~120 na sala nominal, portanto **o knob chega ao
  teto do pool antes de chegar ao fim** — é deliberado (o teto é o custo de desenho), mas se o David
  quiser uma pista mais cheia, subir `MAX_PEOPLE` é uma linha, e o preço é linear.
- **A renderList do probe cresceu 640 meshes** (a dívida herdada da F12/F13, agora bem maior:
  1391 meshes no total). O probe é `RENDER_ONCE` (custo zero por frame), mas custa em cada refresh —
  e a F15 acrescenta refreshes (todo o knob de colocação pede um). A correção limpa continua a ser
  refazer a renderList no `rebuild()` em vez de a fixar no `attachProbe`; ficou fora do âmbito.
- **A oclusão dos dots é aproximada por cilindros** (§5) e **não desenha sombras**. Se o David quiser
  ver a sombra das pessoas no chão, isso é outra fase (shadow maps, ou manchas fake), não uma
  afinação desta.
- **O gerador sintético (tecla `g`) não foi exercitado ao vivo**: em tab de automação o motor também
  é rAF-driven e ficou parado (`bpmEst = 0`). O caminho foi verificado com um motor SIMULADO pelo
  contrato real, campo a campo, mas a prova final é o David carregar em `g` com a tab à frente.
- **As proporções e os pesos do cabelo são de SENSAÇÃO**, afinados contra a silhueta na cena (§1.1).
  A semente troca a pista inteira sem mexer em mais nada — é o primeiro knob a experimentar.
- **`folga paredes` 0,6 m dá uma zona de 135 m²**, ou seja a multidão vai até quase encostar às
  paredes e há gente ENTRE a câmara e a bola. É realista (a câmara está no meio do público) mas pode
  tapar a bola; o knob é para isso. Se incomodar sistematicamente, o caminho é uma zona morta em
  frente da câmara — mas isso é uma decisão de enquadramento, não de sala, e é de ver primeiro.
- **`luminosidade` default 1,0 é escuro de propósito.** Nas primeiras experiências o David vai
  provavelmente querer subi-la para ver o que fez; o valor que fica deve ser escolhido com música
  real e a sala afinada, não em screenshot.
