# Plano faseado S13 — sync musical + realismo visual (+ config externa)

**Pedido do David (handoff S12):** um plano de implementação faseado, em série onde há dependência e
em paralelo onde não há, com subagente e modelo por tarefa, para melhorar ao mesmo tempo (1) o
motor musical automático e (2) a qualidade visual/cinematográfica, evoluindo a arquitetura atual
(nunca reescrever), e, se necessário, uma fase de refactor para **não deixar hardcoded o que pode
ser config em ficheiro externo carregado na sessão**.

**Entradas:** `mapa-frentes.md` (contratos §1, checklist §3, prioridades §4) ·
`audit-sync-motor.md` · `research-lighting-pro.md` §4 · `research-realismo.md` §4-5 ·
`research-gpu-offload.md` §5-7 · `plan.md` §4.0/§4.1.

**Criado:** 2026-09-01 (S13). Estado de partida: commit `eb56317`, árvore limpa.

---

## 0. O plano em 30 segundos

Três pistas (tracks) que correm em paralelo porque tocam ficheiros disjuntos. Dentro de cada
pista as fases são em série, cada uma com stop visual do David.

```
 pista S · SYNC (A→D)      S0 debate ─► S1 relógio ─► S2 hero ─► S3 abater relógios ─► S4 gestos sala ─► S5 audição
                            (David)     (Opus)        (Opus)     (Opus ×3 stops)       (Opus)            (David)
 pista V · VISUAL (B)      V0 G1+G2 ─► V1 dots ─► V2 fog ─► V3 exposição ─► V4 tileTone ─► V5 sombras ─► V6 mikado TI
                            (Opus)     (Opus)    (Opus)    (Opus)          (David)        (Opus)         (Opus, se G2 pedir)
 pista K · CONFIG (E)      K1 sala/pools p/ knobs-default ─► K2 contrato "knob nasce em config" ─► (aplica-se a S e V)
                            (Sonnet)                          (Fable, 1 página no mapa)
```

- **S0 é o único bloqueio real**: nada da pista S se codifica antes de o David fechar o debate.
  V e K não esperam por S0 — é onde o paralelismo rende.
- **K vem cedo e pequena** (não big-bang): K1 move o que já é hardcoded para `knobs-default.json`
  pela via existente (regra 9, `RENAMED`); K2 fixa a regra para que **cada knob novo** das fases
  S/V nasça já em ficheiro. Fazer o refactor todo antes atrasaria o resultado visível sem ganho.
- Ficheiro partilhado que obriga a serializar: **`main.js`** (S3 toca `effective()`/spotGain; V2/V3
  tocam fog/pipeline; V0 toca `freezeWorldMatrix`). Regra: dois agentes nunca editam `main.js` ao
  mesmo tempo — cada fase que lhe toca fecha e commita antes da seguinte abrir. O resto é disjunto.

**Modelo por tarefa (plan.md §4.1):** Fable medium = orquestra, debate, docs, julga GROOVE/drops ·
Opus = DSP, FSM, **tudo o que é visual/cena 3D** (David, S13: "nos visuais cuidado com Sonnet"), debug ·
Sonnet = só mecânico puro: renames, config, regenerar gerados, varrimentos.

---

## 1. Pista S — sync musical (frente A → D)

Objetivo: dar à sala o "quando". Hoje há nove relógios aleatórios e nenhuma peça (exceto vultos)
lê `beatPhase`. O estrelato resolve "quem"; falta o relógio e a hierarquia por secção.

### S0 · Debate do plano de sync — **David decide** (Fable prepara, sem código)

Saída: `docs/f16-sync.md` com as decisões fechadas. Proposta para o debate (recomendação, não
decisão):

1. **Relógio único publicado em `MUSIC.state`** (só `music.js` escreve; leitores por poll, padrão
   F11/F12): contadores **monotónicos** `beatTick`, `barTick`, `phraseTick` (8 compassos) — os
   leitores detetam a aresta por delta, como já fazem com `snareCount`/`dropCount`; mais `beatIdx`
   (0-3), `barIdx` (0-7 na frase), `clockConf`, `clockAgeMs`. **Sem grelha** o relógio degrada para
   `kickFlash` com 4/4 assumido, em vez de congelar (`state.bar` deixa de congelar >4 s).
   `bpmEst` mantém-se (período em ms) — não se renomeia nada (fronteira frágil nº1).
2. **Quantização:** todo o evento visível da sala dispara numa aresta do relógio. Movimentos
   lentos (retarget, troca de estrela, mudança de wash) em `barTick`/`phraseTick`; acentos
   (flash, passo de chase, rajada) em `beatTick`. O random passa a escolher **o quê**, nunca
   **quando**.
3. **Hero por secção alinhado com a FSM** (research §4.1, tabela §2): GROOVE → chapéus narrador
   rítmico + bola discreta · BUILD → chapéus aceleram, robots convergem, mikado em reserva ·
   PRE_DROP → **blackout** ½ tempo (gesto novo, tudo menos haze) · DROP → mikado protagonista,
   bola cede · BREAKDOWN → bola + wash protagonistas, mikado **reserva total** · OUTRO → fade.
   O `stardom.js` mantém-se como mecanismo; muda o viés (`biasHats 2.65` cai) e passa a haver
   **reserva como estado** (tempo-desde-último all-on pesa na probabilidade).
4. **Um escritor por peça:** chapéus deixam de ter onda autónoma + `hats.pulse()`; a onda passa a
   comandada. Mikado sem Poisson próprio (só snare/drop + teto de duração + cool-down).
5. **`act` chega à sala** (regra 4): densidade → nº de peças ativas e cadência dos chases.
6. **Relógios a abater** (9 da auditoria): Poisson choreo flash · dwell retarget · Poisson chapéus
   · onda `seqStepMs` · Poisson mikado · moeda `snareSens` · random do sorteio (fica, mas só na
   aresta) · jitter `auxPerMin`. **Fica aleatório de propósito:** fase por vulto — pessoas não
   dançam quantizadas; é o único random que lê como humano.
7. **Housekeeping que o debate não precisa de discutir** (bugs da auditoria §b): `fromMotor` em
   `flash/retarget/strobe`; `spotFadeMix`/`flashRate` escritos a 60 Hz sem disjuntor; 3 donos do
   `spotGain` → um só caminho atribuível.

Stop: o David lê a proposta, corrige a tabela hero×secção e fecha. Perguntas a levar: o blackout
pré-drop é um gesto novo ou o `freeze` com contexto? A bola é protagonista no breakdown (disco/pop)
ou fica só rpm (techno)? Quantos compassos de reserva antes de repetir um all-on?

### S1 · Relógio único — **Opus**

Ficheiros: `web/music.js` (§GRID, `state` :818, HUD `m`), `web/test-music-f2.js`.
Faz: os campos de S0-1 com valor inicial finito (regra 7); degradação sem grelha; linha nova no HUD
(`beatIdx/barIdx/conf`); 3-4 asserções no harness (ticks monotónicos, degradação, sem NaN).
Depende de: S0. Não toca: leitores, `applyToBall`, disjuntores.
Stop: HUD `m` com música real — os ticks batem com o bombo? Bump `music.js?v=N`. Toca as duas bolas.
Paralelo com: V (qualquer fase), K1.

### S2 · Hierarquia hero por secção + reserva — **Opus**

Ficheiros: `spike-babylon/v2/stardom.js` (poll :193-215, sorteio :213-241), `web/music-config.json`
(vieses — **nunca commitar**; defaults commitados via `music.js` `MUSIC`).
Faz: tabela hero×FSM de S0-3; sorteio só em `barTick`/`phraseTick`; reserva como estado; leitura de
`act`; "get-out-of-jail": reset de apoio na transição de secção (erro nº5 do research).
Depende de: S1. Stop: `node`-replay com features gravadas (`replay-real.js`) → contar trocas de
estrela por minuto e % de drops com mudança (meta: >90 %, era 71 %). Depois audição do David.

### S3 · Abater relógios, uma peça por stop — **Opus**, 3 stops

- **S3a chapéus** (`hats.js` :505-523, :488-492): onda comandada pelo relógio (passo em
  `beatTick`, direção/velocidade por `act`), um escritor. Stop: chase ponta-a-ponta a bater.
- **S3b mikado + choreo** (`mikado.js` :671-694, `choreo.js` :96-121): sem Poisson; rajadas só em
  aresta com teto contíguo + cool-down; retarget em `barTick`; flash em `beatTick` acentuado.
  Stop: rajada no drop, silêncio no breakdown.
- **S3c housekeeping em `main.js`/`music.js`** (S0-7): `fromMotor` completo, disjuntor no
  `spotFadeMix`/`flashRate`, `spotGain` com um dono. **Toca `main.js`** — serializar com V0/V2/V3.
  Stop: painel `d` — os valores do David deixam de ser apagados; disjuntores cortam de facto.

Bateria da regra 9 no fim de S3 (snapshot/restore do localStorage).

### S4 · Gestos de sala — **Opus**

Ficheiros: `music.js` §GESTURES + `stardom.js`. Blackout pré-drop (S0-3), memória de assinatura
(repetir aprox. o look da última secção do mesmo tipo), `all-on` do drop com reserva.
Depende de: S2, S3. Stop: audição com 3 faixas com drop claro.

### S5 · Audição e afinação — **David + Fable**

Vieses, reserva, cadência dos chases, `biasHats`. Só com música real. Regra do projeto: antes de
"afinar", gravar 15 s de features e replay. Fecha com `f16-sync.md` §final + mapa-frentes §0
(frentes A e D mudam de estado).

---

## 2. Pista V — visual/cinematográfico (frente B)

Objetivo: gastar parte dos ~13 ms de margem em **luz e ar**, não em geometria. Nada aqui toca em
`music.js`, `MUSIC.state`, elementos ou estrelato.

| Fase | O quê | Ficheiros | Modelo | Custo | Depende | Stop do David |
|---|---|---|---|---|---|---|
| **V0** | G1 `freezeWorldMatrix` sala/pilares + G2 **baseline medido** no pior caso (sala-toda + Ø3,0 + 80 vultos) | `room.js`, `main.js` (2 linhas) | Opus + **David** mede (tab em foco, `MB2.__perf()`) | -0,1..0,3 ms | — | registar `medianRenderMs`, meshes ativas, vértices em `docs/f17-visual.md` §0. Primeiro número limpo em 5 fases. |
| **V1** | R1 dots em losango (herdam a forma da faceta) | `dots.js:44` | Opus | ~0 | — | "os pontos leem como espelho, não lanterna?" Reversível numa linha. |
| **V2** | R2 `scene.fogMode` EXP + knob `fogDensity` (default quase impercetível) + `fogColor` | `main.js`, `config.js`, `panel.js` (knob, PERSIST) | Opus | ~0-0,2 ms | V0 fechada (main.js) | "os pilares do fundo perdem nitidez?" |
| **V3** | R3 exposição: `postExposure` default mais baixo + `ColorCurves` no pipeline (sombras frias, altas quentes) com knobs | `main.js` (pipeline), `config.js`, `panel.js` | **Opus** (é onde é fácil escurecer demais; precisa de juízo sobre a cadeia ACES existente) | ~0 | V2 fechada (main.js) | lado a lado com fotos lux2-lux12 de `f8-sala-lux.md`: "sala escura com picos?" |
| **V4** | R4 decisão `tileTone: 'real'` como default | `knobs-default.json` | **David** (estética) | 0 | V3 | comparação lado a lado dos dois modos. |
| **V5** | R5 `ShadowGenerator` em 2-4 luzes hero (spots da bola, mikado) | `main.js`, `ball.js`, `mikado.js` | **Opus** | 0,3-1,0 ms/luz | V0-V3 + S2 (para saber quais são as luzes hero) | `MB2.__perf()` antes/depois; sem acne nas facetas; "há sombra dura no chão?" |
| **V6** | G3 mikado em thin instances (672→6 meshes) | `mikado.js` | **Opus** | depende de G2 | **só se V0 mostrar draw calls como gargalo**; após S3b (mesmo ficheiro) | par liga/desliga simétrico ×5; `MB2.__perf()`. |

Greyscale (regra 6) tem de continuar a funcionar em V2/V3: fog e curvas em greyscale = neutros.
Não fazer (research §6): SSR, frame-graph volumétrico, god rays (957 ms), compute shaders.

---

## 3. Pista K — config externa (frente E)

Princípio do David: **não deixar hardcoded o que pode ser config em ficheiro externo carregado na
sessão.** O repo já tem a infraestrutura: `knobs-default.json` (gerado, camada de defaults fora do
código, prioridade `mb2.knobs > knobs-default.json > config.js`) e `music-config.json` (motor, via
`tuner`). Os limiares do detetor **já** são externos. O refactor é, por isso, **incremental e
pela via existente**, não um sistema novo.

### K1 · Constantes da cena para config — **Sonnet**, uma passagem

Candidatos (mapa §nota + grep de S13): `BALL_DEFAULTS` (`ball.js:86`), `MAX_BARS` (mikado :88),
`MAX_BLOCKS` (:155), `MAX_PEOPLE` (crowd :85), `MAX_HATS` (hats :48), `MAX_LIVE_LIGHTS` (hats :356),
`BASE_ALBEDO` (room :37), `COLOR_HZ` (ball :899).

Regras da passagem:
- Cada um vira knob em `config.js` com o **mesmo valor** de hoje (zero mudança visual), prefixo do
  elemento (`mikado: máx barras`, `vultos: pool`, `sala: albedo base`, `bola: cadeia Hz`), entra no
  `PERSIST`, e os de pool/tamanho são ⟳ via `preApplyReloadKnobs` (alocam buffers no build).
- `MAX_LIVE_LIGHTS` mantém teto duro 4 no código (WebGL2 rebenta o shader) — o knob só pode
  descer. `COLOR_HZ` com piso 10 / teto 60.
- Regenerar `knobs-default.json` (`node gen-knobs-default.js`), **nunca à mão**.
- Bateria da regra 9 com `mb2.knobs` da versão anterior + snapshot/restore.
- **Não mexer** em `MUSIC` (`music.js`) — já é externo.

Stop: painel `d` mostra os knobs novos com os valores de sempre; cena idêntica; `MB2.__perf()`
igual à baseline V0. Paralelo com: S0/S1, V0/V1 (ficheiros disjuntos exceto `panel.js`/`config.js`
com V2 — K1 fecha antes de V2).

### K2 · Contrato "todo o knob nasce em config" — **Fable**, uma página

Acrescenta ao `mapa-frentes.md` §3 (checklist) e ao CLAUDE.md regra 10: **constante nova de
comportamento = knob** (`config.js` + `PERSIST` + `knobs-default.json` regenerado), ou entrada em
`MUSIC` (→ `music-config.json`) se for do motor. Números que ficam no código: tetos de segurança
(0,18 / 3 Hz / 4 luzes), tamanhos de buffer GPU, `RENAMED`. Aplica-se a S1-S4 (ticks, reserva,
cadências) e V2-V5 (fog, curvas, sombras) — o agente de cada fase recebe esta regra no brief.

### O que **não** entra no refactor

Um loader genérico de "scene-config.json" a substituir `config.js`: reabriria a fronteira frágil
nº3 (nomes ↔ localStorage) que já perdeu afinações do David, sem ganho sobre o que existe.

---

## 4. Ordem por sessão (dependências e paralelismo)

| Sessão | Em série (bloqueia) | Em paralelo (subagentes) | Stop do David no fim |
|---|---|---|---|
| **S13** (esta) | **S0 debate** (Fable + David) | **V0** (Opus) · **V1** (Opus) · **K1** (Sonnet) | baseline registada; dots em losango sim/não; knobs novos sem mudança visual; `f16-sync.md` fechado |
| S14 | **S1** relógio (Opus) | **V2** fog (Opus, após V0) · **K2** (Fable) | HUD com ticks a bater; pilares do fundo |
| S15 | **S2** hero+reserva (Opus) | **V3** exposição (Opus, após V2) | replay: drops com mudança >90 %; sala escura com picos |
| S16 | **S3a/b/c** (Opus, 3 stops; S3c serializado com main.js) | **V4** decisão tileTone (David) | chases a bater; rajada só no drop; painel não apagado |
| S17 | **S4** gestos (Opus) | **V5** sombras (Opus, precisa das luzes hero de S2) | blackout pré-drop; sombra dura no chão; perf |
| S18 | **S5** audição/afinação (David + Fable) | **V6** só se V0 o justificar | "é aquilo / quase / não é" por peça; mapa-frentes §0 revisto |

Dois Opus em paralelo (S-fase + V-fase) é aceitável porque os ficheiros são disjuntos; quando não
são (`main.js`), a fase V espera o commit da fase S ou vice-versa. Sempre `isolation: worktree`
para o agente que não toca `main.js`, ou um de cada vez — nunca dois a editar o mesmo ficheiro.

---

## 5. Brief padrão para cada subagente (o orquestrador cola isto)

1. Ler `CLAUDE.md`, `mapa-frentes.md` §1 e §3, e o `docs/fN-*.md` da fase.
2. Só os ficheiros da fase. Se precisar de outro, parar e dizer.
3. Knob novo = config (K2). Valor inicial finito. Nome com prefixo do elemento. Toggle 0/1.
4. Ler `MUSIC.state` só por campos que existem em `music.js:818`; `bpmEst` é período em ms.
5. Chamadas `MIRRORBALL.*` a partir do motor levam `{fromMotor:true}`.
6. `music.js` tocado → bump `?v=N` em `web/index-v2.html` + `node web/test-music-f2.js`.
7. `main.js`/`panel.js` tocados → bump dos cache-busters + bateria da regra 9 com snapshot/restore.
8. Perf: só `MB2.__perf()` com o tab em foco (o David lê); nunca `scene.render()` forçado.
9. **Confirmar que tem a ferramenta Write** antes de escrever docs (dois agentes do S12 não tinham).
10. Fim: commit só do que a fase toca; **nunca** `web/music-config.json`; atualizar
    `mapa-frentes.md` §0 da frente tocada no mesmo commit.

---

## 6. Critério de "acabou"

- **Sync:** um técnico ouviria e diria que a sala dispara na batida e muda de protagonista com a
  secção; replay mostra >90 % dos drops com mudança visível; zero Poisson na sala; um escritor por
  peça; `act` lido por pelo menos chapéus e estrelato.
- **Visual:** fog, exposição e losangos ligados por defeito; baseline e pós-V5 medidas no mesmo
  cenário; David diz "é aquilo" ou "quase" nas quatro perguntas do checklist percetual
  (`research-realismo.md` §7).
- **Config:** os oito hardcoded de K1 são knobs; regra 10 no CLAUDE.md; nenhum knob novo das fases
  S/V nasceu como constante.
