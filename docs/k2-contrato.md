# K2 — contrato "todo o knob nasce em config" + auditoria das fases S14

**Feito:** 2026-09-02 (Fable, worktree `agent-a3e46f60ce6c5bab1`). Pista K do
`docs/plan-s13-faseado.md` §3. Continuação do K1 (`docs/k1-config.md`), que moveu 7 constantes já
existentes para knobs; o K2 fixa a **regra** para que as fases S/V seguintes não voltem a criar
números soltos.

## 1. O contrato (resumo — a versão normativa é a regra 10 do CLAUDE.md)

Constante nova de **comportamento** = knob, nunca um número solto no código:

- **Cena** → `spike-babylon/v2/config.js` + entrada no `PERSIST` do `panel.js` +
  `knobs-default.json` **regenerado** com `node spike-babylon/v2/gen-knobs-default.js`
  (nunca editado à mão).
- **Motor** → entrada em `MUSIC` no `web/music.js` **e** entrada no `TUNE` (§TUNE) com
  `range`/`step`/`label` → `web/music-config.json` (que nunca se commita). Sem a entrada no `TUNE`
  não há slider `k` nem validação de limites no merge do JSON — o número fica meio-knob.
- **Fica no código:** tetos de segurança (`beamIntensity ≤ 0.18`, 3 Hz, 4 luzes vivas), tamanhos de
  buffer/pool GPU, entradas do `RENAMED`. Sempre com o comentário a dizer porquê.
- Nome com prefixo do elemento, valor inicial finito (regra 7), toggles 0=off/1=on, `range` que
  **contém** o teto do CLAUDE.md (nunca o contorna).
- Fecha com `node spike-babylon/v2/test-knobs-compat.js` (bateria da regra 9 em Node).

Checklist operacional de 5 perguntas: `docs/mapa-frentes.md` §3 ("Escrevi um número novo no
código?").

### 1.1 Regra de duplicação (o caso novo do S14)

A pista S criou um padrão que o K1 não previu: **o motor publica, a cena lê por poll**
(`MUSIC.sync.*`). A regra é:

> O knob vive **no motor** (`MUSIC` + §TUNE). A cena repete apenas o **fallback local**
> (`SYNC_DEFAULTS` em `mikado.js`/`stardom.js`), porque tem de funcionar sem motor, sem tuner e sem
> ficheiro (regra 7). O fallback **não** é um segundo knob e não entra no `config.js`.

Os `SYNC_DEFAULTS` das duas pontas estão corretos por esta regra — mas têm de ser mantidos **iguais
aos defaults do `MUSIC.sync`**; divergirem é uma dívida silenciosa (o David afina no tuner e a cena
sem motor comporta-se de outra maneira).

## 2. Auditoria das fases S14 — constantes novas nascidas no código

Percorrido `git log fd7d2de..4a67639` (S1, S2, S3a, S3b, S4, V0b, V2+V3, V5, V6, K1-bateria) e o
diff de `spike-babylon/v2/*.js` + `web/music.js`. **Só leitura — nada foi convertido.** Esta é a
lista para o David decidir.

**23 constantes novas de comportamento encontradas · 11 propostas como knob · 12 ficam no código.**

Nota de mérito: o lado do **motor** passou no contrato antes de ele existir — S1/S2/S3b/S4 puseram
os 9 números de comportamento em `MUSIC.sync` **com** entradas no §TUNE. A dívida está quase toda
do lado da **cena** (`spike-babylon/v2/*.js`), onde as fases S criaram histereses, timeouts e
tabelas de ganhos como constantes de módulo.

### 2.1 Vira knob

| # | Constante | Ficheiro:linha | Valor | Nome proposto (prefixo) | Porquê |
|---|---|---|---|---|---|
| 1 | `SPOT_SLOT_HOLD_S` | `main.js:566` | `2.0` s | `focos: slot hold s` (0.5-6) | V0b. Histerese de perf **com efeito visível**: define quanto tempo um foco fica ligado a I=0 antes de morrer. Curto demais = o toggle volta (o custo que o V0b veio matar); longo demais = luzes vivas a mais no limite das 4. É exatamente o tipo de número que só se afina a ouvir/ver a sala. |
| 2 | `LIGHT_HOLD_S` | `mikado.js:92` | `2.0` s | `mikado: luz hold s` (0.5-6) | S3b. Mesmo argumento do #1, para as PointLights do mikado. Está duplicado com o #3 sem ser o mesmo elemento — dois knobs, não um. |
| 3 | `LIGHT_HOLD_S` | `robots.js:139` | `2.0` s | `robots: luz hold s` (0.5-6) | S3b. Idem, nos robots. Hoje o David não consegue baixar o hold dos robots sem mexer no do mikado (nem sequer isso — é código). |
| 4 | `PENDING_TIMEOUT_S` | `stardom.js:131` | `3.0` s | `estrelato: troca timeout s` (1-10) | S2. Quanto tempo uma troca de estrela fica pendente antes de disparar sem `barTick`. Governa **quão teimosa** é a sala à espera do compasso quando o relógio morre — decisão de sensação, não de segurança. |
| 5 | `CLOCK_DEAD_S` | `stardom.js:132` · `mikado.js:699` · `hats.js:381` (`AUTO_CLOCK_DEAD_S`) · `choreo.js:64` | `1.5` s (×4) | `sync: relógio morto s` (0.5-5) — **um só**, no motor (`MUSIC.sync`) | S1/S2/S3. É o mesmo conceito repetido em 4 ficheiros com o mesmo valor e comentários a dizerem "mesmo valor de hats.js". Um só knob no `MUSIC.sync` (a cena já lê `MUSIC.sync` por poll) resolve as 4; os 4 locais ficam com o fallback local a 1.5 (regra 1.1 acima). **A divergência entre eles é um bug à espera de acontecer.** |
| 6 | `DROP_SNAP_S` | `mikado.js:700` | `0.15` s | `mikado: drop snap s` (0.05-0.5) | S3b. Janela em que um drop lido logo a seguir a uma aresta de tempo dispara já em vez de esperar a seguinte. É a diferença entre a rajada cair *no* drop ou meio tempo depois — precisamente o que a pista S existe para afinar. |
| 7 | `KICK_EDGE` | `stardom.js:130` | `0.5` | `estrelato: aresta kick` (0.1-0.9) | S2. Limiar de subida do `kickFlash` que conta como bombo novo. É um **limiar de deteção** — a família de números que o CLAUDE.md manda medir antes de adivinhar (`replay-real.js`). |
| 8 | `PHRASE_BARS` | `stardom.js:128` | `8` | — usar `MUSIC.sync.phraseBars` (já existe) | S2. **Duplicado**: `sync.phraseBars` já é knob no §TUNE (range 4-16) e o `stardom.js` tem a sua própria constante fixa a 8. Se o David mexer no knob, o estrelato não segue. Não é knob novo — é ligar o que existe (e deixar 8 só como fallback). |
| 9 | `PROFILE` + `HERO` (tabelas de ganhos) | `stardom.js:99-126` | 5×4 + 7×5 valores | `estrelato: …` (grupo próprio) ou ficheiro `stardom-profile.json` | S2. O próprio comentário no código diz: *"os números são de SENSAÇÃO (é isto que o David vai querer afinar ao vivo)"*. São ~55 valores — knob a knob afogava o painel; a proposta é um **ficheiro de perfil** carregado como o `music-config.json`, ou os 4-5 mais mexidos (`ball`/`mikado`/`hats`/`wash` do `smooth` e do `all`) como knobs e o resto no ficheiro. **Decisão do David: é a maior peça desta lista.** |
| 10 | `rampInSec` / `rampOutSec` | `web/music.js:512` | `0.8` / `1.2` s | `gesto: rampa entra s` / `gesto: rampa sai s` no §TUNE (0.1-3) | Pré-existente mas **exposto pelo S4**: o blackout precisou de contornar a rampa de entrada (`instant:true`) porque 300 ms com rampa de 0,8 s nunca chega a ser escuro. Vivem em `MUSIC.gesture` (logo carregam do JSON) mas **não têm entrada no §TUNE** — sem slider `k` e sem validação de range. Meio-knob: fechar. |
| 11 | `tau = [0.04, 0.04]` do blackout | `web/music.js:1918` | `0.04` s | `sync: blackout ataque s` (0.01-0.2) no §TUNE | S4. O ataque do blackout — 40 ms. O `blackoutMs` (duração) virou knob, o **ataque** não. É a diferença entre um corte seco e um fade rápido; num gesto que é todo ele "corte seco", é o número que define o efeito. |

### 2.2 Fica no código

| # | Constante | Ficheiro:linha | Valor | Porquê fica |
|---|---|---|---|---|
| 12 | `MIN_GAP_S` | `mikado.js:91` | `1/3` s | **Teto de segurança** — os 3 Hz do CLAUDE.md regra 6. Já era assim no K1 (§3 do `k1-config.md`) e a decisão mantém-se: um knob aqui seria um caminho para violar a regra. |
| 13 | `SEQ_MIN_MS` | `hats.js:349` | `334` ms | Idem #12, o mesmo teto de 3 Hz do lado dos chapéus (entre passos da sequência e disparos "todos juntos"). |
| 14 | `Math.min(4, …)` em `MAX_LIVE_LIGHTS` | `hats.js:417` | `4` | **Teto de segurança** de shader (WebGL2 rebenta). O knob `chapéus: luzes vivas máx` já existe (K1) e só pode **descer** este teto. |
| 15 | `MAX_SPOTS` (= slots foco + flash) | `main.js:571` | derivado | **Tamanho de pool GPU**: dimensiona `Float64Array` e o número de `SpotLight` alocadas no arranque. Mudar ao vivo obrigaria a realocar; e é limitado pelo mesmo teto de shader do #14. |
| 16 | `SIDES` / `QUAD_SIDES` / `QUAD_R` | `dots.js:34,35,38` | `12` / `4` / `√1.5` | V1. **Geometria da malha base** dos dots (buffer construído uma vez) e uma constante **matemática** (`QUAD_R` é o raio que iguala a área do quadrado ao do disco). Não são comportamento. |
| 17 | `SHADOW_Q[]` | `main.js:1843-1847` | mapa 0/1/2 | V5. **Tabela de mapeamento** para as constantes do Babylon, não um valor. A escolha 0/1/2 já é o knob `sombras: suavização`. |
| 18 | `FOG_EXCLUDE` (regex) | `main.js:1483` | regex de nomes | V2. **Lista de materiais** que não levam fog (aditivos, halo, feixes). É estrutura da cena, não afinação — um knob aqui seria um campo de texto que ninguém mexe. |
| 19 | `BEATS_PER_BAR` | `stardom.js:129` | `4` | S2. **Assunção estrutural** 4/4 da degradação sem grelha (f16 §1-1), a mesma que o `music.js` faz. Mudar isto não é afinar, é reescrever o relógio. |
| 20 | `SYNC_DEFAULTS` | `stardom.js:94` · `mikado.js:701` | espelho dos defaults do motor | **Fallback local exigido pela regra 7** (a cena tem de arrancar sem motor). Pela regra §1.1 acima não é um segundo knob. **Dívida a vigiar:** manter iguais aos defaults de `MUSIC.sync`. |
| 21 | `MAX_*_FALLBACK` (people/hats/bars) | `crowd.js`, `hats.js`, `mikado.js` | `80`/`12`/`112` | K1. **Fallbacks** dos knobs que já existem (regra 7). |
| 22 | `60000 / 128` (BPM de recurso) | `hats.js:492` · `mikado.js` ×2 | 128 BPM | S3. **Valor de recurso** quando `bpmEst` não existe — só corre no caminho degradado e um knob para "que BPM inventar quando não há música" não tem leitura para o David. Fica, mas devia ser **uma** constante partilhada em vez de três literais repetidos. |
| 23 | `0.5 + 0.5 * actNow()` | `hats.js:427` · `mikado.js:774` | `0.5`/`0.5` | S3. **Forma da curva** densidade↔atividade (metade fixa, metade modulada) — a regra 4 do CLAUDE.md em fórmula. Candidato fraco a knob: se o David quiser mudar isto, o que quer mesmo é mudar o ganho a montante, que já é knob. |

## 3. Se o David aprovar — ordem sugerida

Nada disto foi convertido; é uma lista, não um plano fechado. Se for para avançar, a ordem que
custa menos e rende mais:

1. **#8 e #5** (ligar o `phraseBars` que já é knob; unificar `CLOCK_DEAD_S` num só knob do motor) —
   são correções de duplicação, não knobs novos. Risco quase zero, tiram dois bugs latentes.
2. **#10 e #11** (rampas dos gestos + ataque do blackout no §TUNE) — só do lado do motor, sem tocar
   na cena, e o David já tem o tuner `k` aberto quando ouve.
3. **#1-#3 e #6** (holds e snap) — quatro knobs de cena, um `gen-knobs-default.js`, uma bateria.
4. **#4 e #7** depois, se a afinação ao vivo os pedir.
5. **#9 (`PROFILE`/`HERO`)** é a decisão grande e vale a pena discuti-la à parte: knobs no painel
   vs. ficheiro de perfil. Não fazer antes da audição S18.
