# F11 — Mikado do teto (spec do David, 2026-09-01)

**Contexto**: o mikado de barras luminosas foi o ícone do teto do Lux durante ~20 anos, antes da
bola. O David está a revivê-lo. Referências visuais: `docs/ref/lux-barras1.webp` (sala vista de um
topo, mikado vermelho, sem bola) e `docs/ref/lux-barras2.webp` (outro topo, mikado âmbar/apagado
COM a bola — as barras abrem clareira à volta dela). **As duas fotos dão vista para os 2 topos da
sala — a configuração das barras é para reproduzir tal e qual** (com pequeno ajuste permitido no
centro para combinar com a bola).

## Spec (verbatim/fixado)

1. **Geometria como nas fotos.** As luzes NÃO são só cilindros: cada barra é um tubo luminoso
   montado num perfil/calha metálica com suportes e pontas/terminais visíveis, pendurado do teto
   por tirantes. Reproduzir esse detalhe.
2. **Zona**: só na zona central, dentro do retângulo dos pilares (o miolo). Nada nos corredores.
3. **Altura**: knob para subir/descer o mikado inteiro; **default 4,0 m** (as barras espalham-se
   em várias camadas à volta dessa cota, como na foto).
4. **Coexistência com a bola** (só o David põe/tira bola ou mikado — knobs `bola (0/1)` e
   `mikado (0/1)`): com ambos, a zona da bola não pode ter conflitos — saem as barras que colidem
   (clareira como na lux-barras2); só mikado → stack completo. **O motor usa o que estiver
   disponível** — nunca liga/desliga elementos, só os anima.
5. **Efeitos**: as barras piscam **sempre todas juntas** ou **alternando blocos** (mikado dividido
   em grupos de 4-6 barras). Quando piscam é **com a mesma cor, simultânea, em flashadas**.
   Cores: **vermelho, branco, azul**.
6. **Knobs de efeito**: frequência de flashes (teto 3 Hz — regra da sala), número de flashes por
   rajada, duração/tempo, modo (todas/blocos), tamanho do bloco, cor (fixa ou rotação).
7. **Knobs de trigger musical**: onde entra — **tarolas** (snare), **drops**, etc. (toggles por
   evento + sensibilidade).
8. **Tem de chegar ao David já com o motor a funcionar** (?src=music, F9): quando ele experimentar,
   o mikado já reage à música.

## Regras herdadas que se aplicam

- Nada > 3 Hz; `beamIntensity ≤ 0.18`; a bola não emite luz; NaN-safe (valor inicial em todo o
  knob novo de state).
- Armadilhas WebGPU/Babylon do handoff S10 (RawCubeTexture em PBR novo, setEnabled↔count em thin
  instances, rotationQuaternion para orientar, preApplyReloadKnobs para knobs ⟳, perf só com tab
  à frente, localStorage ganha aos defaults → "repor knobs").
- Registo aqui de tudo o que se fixar durante a implementação (regra 8 do CLAUDE.md).

## Estado da implementação — F11 (Opus, 2026-09-01, POR COMMITAR — aguarda stop visual do David)

Ficheiro novo: **`spike-babylon/v2/mikado.js`**. Tocados: `config.js`, `panel.js`, `main.js`,
`index.html` (cache-busters), `knobs-default.json` (regenerado: 125 → **153 knobs**).
**`web/music.js` NÃO foi tocado** (ver "Como o motor dispara" abaixo) — logo não há bump de `music.js?v=`.

### Geometria (o que reproduz as fotos)

Cada barra são **6 meshes reais**: tubo luminoso (cilindro emissivo) + **perfil/calha** metálica por
cima + **2 terminais/tampas** nas pontas + **2 tirantes** verticais ao teto (soltos no mundo, não
filhos do root inclinado — mesma armadilha da haste dos chapéus). Disposição sorteada com **RNG
seeded** (Mulberry32, knob `mikado: semente`): estável entre frames e reloads, senão não havia como
afinar. Ângulos rasos, azimute com viés para o eixo longo (`viés eixo`), pitch ±6°, `camadas` cotas
dentro de `espalha (m)`. As pontas são **encurtadas** até caberem no retângulo dos pilares (spec §2 —
nada nos corredores). Verificado na cena: 40 barras entre **3,58 e 4,32 m** de altura física com o
default 4,0 m, todas abaixo do teto.

**Clareira da bola** (spec §4): com `bola (0/1)`=1 rejeita-se qualquer barra cujo SEGMENTO passe a
menos de `1 m (raio) + clareira bola (m)` do centro. Medido: **0 violações**, barra mais próxima a
1,55 m (exigido 1,50). Com `bola (0/1)`=0 → stack completo, **24 barras** passam pelo centro.

### Knobs novos (28) — grupo próprio **"Mikado & Bola"** no painel `d`

`bola (0/1)` · `mikado (0/1)` · `mikado: barras` (0-44, def **40**) · `mikado: altura (m)` (2,5-5,2,
def **4,0** — cota do CENTRO ao chão, spec §3) · `mikado: espalha (m)` (def 0,85) · `mikado: camadas`
(def 6) · `mikado: barra min (m)` (def 3,5) · `mikado: barra máx (m)` (def 7,5) · `mikado: Ø tubo (m)`
(def 0,07) · `mikado: inclinação°` (def 6) · `mikado: viés eixo` (def 0,35) · `mikado: folga pilares (m)`
(def 0,35) · `mikado: clareira bola (m)` (def 0,5) · `mikado: semente` (def 7) · `mikado: repouso`
(def 0,12) · `mikado: flash força` (def 2,6) · `mikado: flash ms` (def 120) · **`mikado: flash Hz`
(0,2-3, def 2,4 — TETO 3)** · `mikado: flashes/rajada` (def 2) · `mikado: modo (0=todas/1=blocos)` ·
`mikado: tam. bloco` (def 5) · `mikado: cor (0=rot)` (0 rotação · 1 vermelho · 2 branco · 3 azul) ·
`mikado: luz sala ×` · `mikado: tarola (0/1)` · `mikado: tarola sens.` (def 0,55) · `mikado: drop (0/1)` ·
`mikado: drop rajada ×` (def 2) · `mikado: auto /min` (def 4).

Os knobs de GEOMETRIA regeneram **ao vivo** (`onMikadoGeomChanged` → `mikado.rebuild()` +
`ball.refreshProbe()`), sem reload — ao contrário das dimensões da sala. `bola (0/1)` também
regenera (a clareira depende de a bola estar montada) e é lido em `preApplyReloadKnobs()`.

### Como o motor dispara o mikado (sem tocar em music.js)

`web/music.js` já expõe `window.MUSIC.state` com **contadores monotónicos** `snareCount`/`dropCount`
(além de `snareAccent` e da FSM `fsm`). O `mikado.js` faz **poll** desse objeto por frame e compara
com o valor do frame anterior: se subiu, houve tarola/drop. Zero linhas alteradas no motor, zero
risco para a F9, e o gerador sintético (tecla `g`) alimenta o mesmo caminho. Sem `window.MUSIC`,
avisa UMA vez com `console.warn` e corre em modo autónomo (`mikado: auto /min`) — degrada sem erros.
**Verificado ao vivo**: incrementar `window.MUSIC.state.snareCount` (o que o detetor faz) acendeu o
tubo de 0 → 0,433 de emissivo; idem para `dropCount`.

### Teto de 3 Hz — clamp DUPLO (regra invariável da sala)

O knob está limitado a 3, **e** o agendador impõe `MIN_GAP_S = 1/3 s` entre flashes — mesmo que
alguém escreva `CONFIG.mikado.hz = 99` por fora. Medido em harness headless: com `hz=99, burst=8,
auto=600/min` durante 20 s → **2,90 Hz, gap mínimo 333 ms**. Uma rajada é UM gesto: a cor só roda
entre rajadas, nunca dentro (spec §5).

### Verificação feita

- **Harness headless** (`mikado.js` com stub de BABYLON): 24 asserções, todas OK — teto 3 Hz em 3
  configurações, triggers de tarola/drop, greyscale, NaN em TODOS os knobs + `update(NaN,NaN)`,
  ciclo `mikado (0/1)` off→on, rebuild com o grupo desligado, determinismo da semente, e
  `update()` sem `window.MUSIC`. (Ficheiro de teste em scratchpad, não commitado.)
- **Na cena**: 40 barras, **288 meshes na renderList do probe** e `mirrorMat.reflectionTexture ===
  probe.cubeTexture` → **a bola espelha o mikado** (fragmentos refletidos visíveis nas facetas).
  As 4 PointLight excluem os 5 planos da sala (fix "parede de luz") **e** as 5 partes da bola
  (`facets`/`ballCore`/`ballBone`/`chain`/`chainHook` — regra "nenhum foco na bola sem corpo real").
  Com o mikado em repouso as 4 luzes ficam `setEnabled(false)` (17 → 13 luzes ativas).
- **Consola limpa**: zero erros da aplicação. Só avisos pré-existentes (`maxSimultaneousLights 12>8`,
  de `room.js`) e o ruído de WebGPU `Destroyed texture … SwapBufferProvider` da automação.
- **Greyscale**: `cor (0/1)`=0 dá cinza neutro a peso TOTAL (0,85/0,85/0,85), não os 0,21 que a
  luminância do vermelho puro daria — ver "normalização" abaixo.

### Decisões fixadas nesta sessão

1. **Cor do mikado normalizada em greyscale.** A luminância Rec.709 do vermelho puro é ~0,21: em
   `cor=0` o mikado quase desaparecia. Divide-se pela luminância da cor base, para o cinza ter o
   mesmo peso visual — o toggle é uma opção de estilo, não um dimmer.
2. **Um material de tubo por BLOCO** (12), não por barra: os flashes são simultâneos e da mesma cor,
   por isso 12 materiais chegam para o modo "blocos" com custo fixo de shaders.
3. **Poll em vez de patch no motor** (ver acima) — a alternativa era emitir eventos de `music.js`, o
   que obrigava a mexer no motor e a bump do cache-buster, sem ganho.
4. **A bola não é iluminada pelo mikado** (só espelha): o mikado está ACIMA dela e não é um foco
   dela — mesma regra dos robots de teto.

### Armadilha NOVA (custou uma iteração, apanhada na verificação)

**`setEnabled` tem de saber VOLTAR a ligar, não só desligar.** O `update()` desligava tudo em
`mikado (0/1)`=0 mas o ramo "ligado" nunca repunha nada — só o `layout()` o fazia, e esse não corre
por frame. Resultado medido ao vivo: 1→0→1 deixava o mikado **invisível para sempre** (0 de 216
meshes) até um knob de geometria forçar um rebuild. O David batia nisto ao primeiro clique.
Correção: `enabledPlan[]` guarda o que o `layout()` montou (que barras, que tirantes couberam) e
`restoreEnabled()` repõe exatamente isso. É a família do bug S9 nº1 numa forma nova: **o par
liga/desliga tem de ser simétrico**.

### Dívidas / por afinar ao vivo com o David

- **Estética das barras**: `Ø tubo`, `barras`, `camadas`, `espalha`, `barra min/máx` e `viés eixo`
  foram afinados por comparação com as fotos, mas é afinação de sensação — é o que ele vai querer
  mexer primeiro. `mikado: semente` troca a disposição inteira sem mudar mais nada.
- **`mikado: repouso` (0,12)**: as fotos têm os dois estados (aceso na barras1, apagado na barras2).
  0 dá o mikado apagado da lux-barras2; 0,12 é um meio-termo para não desaparecer sem música.
- **Perf POR MEDIR limpa**: a verificação correu em tab de automação com `document.hidden` e churn
  de WebGPU (render 89-1000 ms, sem relação com o custo real). O mikado acrescenta 240 meshes
  pequenas + 4 PointLight (desligadas em repouso); medir no stop visual, com a tab à frente
  (baseline 7,8-11,9 ms, alvo < 17,5).
- **Blocos consecutivos**: o modo "blocos" agrupa por índice de geração, que não é contíguo no
  espaço. Se o David quiser blocos que se leiam como ZONAS da sala, é preciso agrupar por posição.
- Bug **pré-existente** (F10, não desta fase) — **diagnosticado nesta sessão**: o banner "dimensões
  da sala mudaram" aparece no arranque **só quando o último grupo aberto do painel foi "Sala"**.
  Causa: `panel.js:890` reabre esse grupo no load, o que corre o `set(v0)` dos seus sliders; se um
  knob ⟳ gravado (ex.: `sala: pé-direito` a 5 vs default 5,5) diferir do default, dispara
  `onRoomDimChanged` e o banner. Confirmado: com `localStorage['mb2.dbgOpen']` vazio o banner NÃO
  aparece; com "Sala" aparece. É **falso alarme** — a geometria certa é aplicada na mesma pelo
  `preApplyReloadKnobs()` (medido: `room.ceil` = 1.5, ou seja os 5 m gravados). Fica por corrigir de
  propósito: mexer na ordem do `panelReady`/reabertura arrisca o caminho de reposição dos knobs, que
  é precisamente o que a F10 andou a consertar. Se incomodar, a correção limpa é adiar o
  `openGroupByName` do arranque para depois de `panelReady = true`.

### Extra pedido pelo David a meio da sessão — esconder o painel de knobs

O painel nascia SEMPRE visível e a tecla `d` alternava-o **sem guardar nada**: a cada reload voltava
a tapar o canto. Agora:
- **Teclas `d` (a de sempre) e `k` (nova, dedicada)** alternam o painel INTEIRO (popover `#dbg` +
  barra de separadores + faixa de favoritos), com `Ctrl/Cmd/Alt` ignorados e sem disparar dentro de
  inputs.
- **Estado persistido** em `localStorage['mb2.panelOn']` (padrão `mb2.*`); default continua VISÍVEL.
- Verificado: ciclo `d`→`k`→`d`→`k` alterna os 3 elementos juntos, sobrevive ao reload, e `Ctrl+D`
  não mexe (não rouba o atalho do browser).

**Mapa de teclas do spike v2** (para não colidir de futuro): `h` HUD · `d`/`k` painel · `w` skin ·
`x`/`X` explosão · `0` repor câmara · `m` HUD do motor · `p` perfil · `g` gerador sintético ·
`n` próxima fase (as 4 últimas em `web/music.js`).
