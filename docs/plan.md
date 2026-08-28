# Mirrors of Emotions — bola de espelhos em sync com a música

**Data:** 2026-08-28
**Estado:** plano v2, revisto após parecer técnico (Fable 5)
**Tab nova:** `/mirrors-emotions` — a `/mirrors` (Mirrors of Life, tarefas) fica intocada como projeto futuro

---

## 0. O objetivo, nas palavras do David (verbatim)

> "o que eu quero aqui é uma bola que tou a trabalhar e de repento quero relaxar e isto "emula" o que sinto num clube (discoteca) - paz, elevacao de espirito, quando oiço musica que adoro (normalmente eletronica) e ha um sistema de luz e tecnico altamente competente a usar a bola e luzes a projetar de forma quase magica. é por isso que a bola ta no meu OS. ela é a destilação de uma parte muito importante de mim. isto nao é um "projeto" ligeiro. mas pronto vamos ver o que isto da e depois ve-se. Mas quero ambicao."

> "o que é que a bola, as luzes e a musica fazem em mim num clube e é a responsabilidade do claude de recriar isso aqui."

E o aviso técnico que condiciona tudo o resto:

> "cuidado que a bola da camara de emocoes tem reacoes basicas"

### O que isto quer dizer, em termos de engenharia

Este briefing não pede um visualizador de áudio. Pede a **recriação de um estado interior** — paz, elevação — através de um meio visual. A diferença muda os critérios de aceitação:

| Um visualizador | O que é pedido aqui |
|---|---|
| Prova que está a ouvir (reage a tudo) | Prova que está a *ouvir bem* (reage ao que importa) |
| Latência baixa é qualidade | Antecipação é qualidade — o técnico já sabe o que aí vem |
| Mais reação = melhor | A contenção é o que dá valor ao momento em que abre |
| Sucesso = "está sincronizado" | Sucesso = o David esquece-se que está a olhar para um ecrã |

A referência explícita é **um técnico de luz altamente competente**. Um técnico competente não reage a cada batida — isso é um amador com um envelope follower. Ele **conhece a faixa**: contém-se durante o build, escurece a sala mesmo antes do drop, e abre tudo no primeiro tempo do compasso certo. A magia está na **espera** e no **timing**.

O aviso do David — "a bola da câmara tem reações básicas" — é o requisito central. O `emotion-v2.js` é um mapeador *reativo instantâneo*: lê o estado agora, mapeia agora. Chega para uma cara. **Não chega para música**, que tem estrutura no tempo.

**O salto técnico deste projeto: de mapeamento reativo para mapeamento estrutural.**

### Nota da v2 — o que a revisão obrigou a mudar

O parecer técnico apanhou três erros graves na v1, todos confirmados no código:

1. **O PRE-DROP não tinha mecanismo.** "Último ½ compasso do build" só se sabe depois do drop bater. Corrigido em §3.3 — agora ancorado à grelha de frases, com falha graciosa.
2. **A alegação de reuso era falsa.** O `adapt` do `emotion-v2.js` não é auto-gain LUFS. Corrigido em §1.1 e §3.1.
3. **Faltava a biblioteca do problema mais difícil.** Downbeat tracking não estava resolvido por nenhuma biblioteca dos relatórios. Corrigido em §3.2 e na Fase 2b (harness offline).

E uma lacuna estrutural: **80-90% do tempo é GROOVE**, e a v1 não dava nada a GROOVE além da Camada 1. Nova §3.6.

---

## 0.1 Primeira audição (2026-08-28 05:00) — feedback do David, verbatim

> "a app reage por exemplo qd para. mas ta mto fraca."
> 1) "poder mudar as skins white, black. nao quero que ela na musica atue sobre a cor. o motor disto é sobre as variaveis: rpm, haze e opacity. alem disso isto tem tb as variaveis de 3 focos que pode usar."
> 2) "nao ta a mudar de perfil, mudei de eletronica para jazz e diz la eletronica."
> 3) "focando na eletronica: nao se nota variacoes de nada. as rpm da bola têm de variar com a musica: se há batida, intensidade, etc tem de tar a girar mto, se para o bombo, pode parar a rotacao. depois pode variar tb entre as variaveis (a-rpm, b-haze, c-opacity, d-spots) sem tar ligado à musica. exemplo: musica entra na fase antes de drop (para a batida do bombo) e fica o ambiente — pode parar a rotacao para marcar isso e ter os feixes a seguir o tempo / voz, depois de repente variacoes que nao tao relacionadas com a musica: transparencia maxima repentina e desligar focos... depois, ainda sem bombo, comeca a girar sem focos e sem opacidade... e qd ha o drop liga tudo. sao só exemplos: criatividade tb em cima disso."

**Consequências (decisões):**
- **Skin é do utilizador**, nunca do motor. O motor de música não toca em `setSkinAuto`/tone. Variáveis do motor: `rotationRpm`, `haze`, `sphereOpacity`, `beamIntensity/beamMaxCount`, e os **3 spots** individualmente (intensidade, e o `spotFadeMix`).
- **RPM segue o bombo.** Presença de kick (onsets de graves periódicos) → rpm alto (até 3.0); bombo pára → rotação pára (0–0.15) em 1-2 s. Amplitude tem de ser **visível**, não subtil.
- **Gestos livres** (coreografia não ligada 1:1 ao áudio): dentro de BREAKDOWN/BUILD/PRE-DROP o motor escolhe de um repertório de gestos (rotação parada + feixes a seguir a voz/tempo; opacidade máxima súbita + focos off; girar sem focos e sem opacidade; …) com seleção aleatória por sessão, e no DROP liga tudo. Isto substitui a "contenção" tímida da §3.3 pelo que o David sente num clube.
- **Perfis**: o seletor tem de existir e funcionar (manual, para já); a deteção automática vem depois.
- A Camada 1 tal como saiu da Fase 2 é "muito fraca" — as âncoras/tau são para reescrever com esta orientação, não afinar.

## 1. O que já existe

### 1.1 O projeto MirrorBall

`C:\Users\JSJ\David\AI\Projects\David\David - Projects\Ativos\MirrorBall`

```
web/index.html      + emotion.js      — v1, sala escura
web/index-v2.html   + emotion-v2.js   — v2, crossfade dark↔white por dentro
web/bridge.js                          — Web Serial / WebSocket → ESP32
firmware/mirrorball_esp32/             — LEDs WS2812B + motor
```

**O que transfere mesmo** (e não é o que a v1 dizia):

| Componente | Transfere? | Porquê |
|---|---|---|
| `clamp/lerp/smooth/anchor/ease` | **Sim** — ~30 linhas | matemática pura, agnóstica à fonte |
| Padrão âncoras + easing assimétrico por variável | **Sim**, como padrão | a estrutura é boa; os valores não |
| `tau` (constantes de tempo) | **Não** — re-derivar | mais lentas que o exigido para transientes (mín. 150ms vs 5-10ms pedidos) |
| `adapt` (normalização) | **NÃO — substituir** | ver abaixo |
| `contrast` (smoothstep 1.4) | **NÃO — remover/reduzir muito** | ver abaixo |

**Porque o `adapt` não serve** (`emotion-v2.js:97-98`): é um **seguidor de picos** — salta para o máximo da sessão (`rise: 0.15`) e decai a `decayPerSec: 0.004`, ou seja 0,4%/s → release efetivo de **3-5 minutos**. O LUFS integrado que a investigação exigiu é uma **média com gate** sobre 10-30s. Consequência concreta: um drop alto fixa o `scaleA` perto do pico; o breakdown seguinte e a faixa mais calma a seguir leem como arousal baixo durante minutos. A bola adormecia ao trocar de techno para ambiente.
→ **Substituir por loudness integrado com janela de 10-30s e gate de silêncio.**

**Porque o `contrast` não serve** (`emotion-v2.js:66`): empurra para os polos e mata o meio. Para caras é o objetivo (matar ruído do classificador perto do neutro). Para música **o meio é a respiração** — é onde vivem os 13-23 dB de dinâmica do jazz/acústico. Pole-pushing produz comportamento binário alto/baixo, gerador plausível das "reações básicas" banidas pelo briefing.
→ **Remover no caminho da música, ou reduzir para ≈1.0 (smoothstep simples).**

### 1.2 O contrato da bola

Os ficheiros em `custom-david-files/` (`mirrorball-A`, `A-white`, `D`, `D-white`) e o `index-v2.html` expõem:

```js
window.MIRRORBALL = { setHealth(h), getHealth(), config: CONFIG, setSpot(i, partial) }
// index-v2 acrescenta:  setSkinAuto(v), getSkin()
// ⚠ mirrorball-D.html:758 NÃO tem setSkinAuto — o contrato não é uniforme
```

| Knob | Range | Teto |
|---|---|---|
| `rotationRpm` | 0.5–3.0 | físico |
| `sphereOpacity` | 0–1 | 0 = raio-X |
| `haze` | 0.05–1 | névoa |
| `beamIntensity` | ≤ **0.18** | **teto do brief** |
| `beamMaxCount` | 0–56 | |
| `spots[i].intensity` | 0–1.6 | |
| `setSkinAuto(v)` | 0–1 | crossfade dark↔white |

**Restrições invioláveis:** nada oscila acima de **3 Hz** (`litEase` 2.6/s); `beamIntensity` ≤ 0.18; pontos ≤ `#d8d8d8`; branco puro < 1% do ecrã; a bola **não emite luz**; greyscale; `prefers-reduced-motion` → estático (já tratado pela bola, `index-v2.html:110,165`).

### 1.3 O hardware

`bridge.js` emite 20×/s: `S<rpm×100> B<brilho> H<haze> V<valência> A<arousal> L<health>\n`
Respeitando este contrato, **a bola física do ESP32 reage à música sem tocar no firmware**.

### 1.4 Hindsight

- `claude-code::MirrorBall` — existe, **vazio** (0 factos). → a criar modelo mental (ver §8).
- `claude-code::agent-os` — 3780 factos; `mecanica-visual-mirrors` tem física, `CONFIG` e a regra dos 3 Hz.

---

## 2. Arquitetura

```
 ┌──────────────────────────────────────────────────────────────┐
 │ audio-sidecar/  (Node, porta 3739)                           │
 │   application-loopback (WASAPI) → PCM 48kHz                  │
 │   features + beat/downbeat tracking                          │
 │   WS ~50Hz → features + GRELHA (timestamps absolutos)        │
 └───────────────────────────┬──────────────────────────────────┘
                             │ ws://127.0.0.1:3739
 ┌───────────────────────────▼──────────────────────────────────┐
 │ MirrorsEmotionsView.tsx  (tab /mirrors-emotions)             │
 │   cliente WS → postMessage no seu próprio rAF                │
 └───────────────────────────┬──────────────────────────────────┘
                             │ postMessage
 ┌───────────────────────────▼──────────────────────────────────┐
 │ iframe: index-v2.html + core.js + music.js (+ emotion.js)    │
 │   music.js  features+grelha → estado → knobs                 │
 │   core.js   helpers partilhados (~30 linhas)                 │
 │   ARBITRAGEM: só uma fonte escreve no CONFIG                 │
 └──────────────────────────────────────────────────────────────┘
```

### 2.1 Captura — decisão e riscos

`getDisplayMedia` está fora: o W3C **rejeitou** deixar a permissão persistir ([#144](https://github.com/w3c/mediacapture-screen-share/issues/144)) → diálogo a cada reload; no Windows só apanha sistema em "Ecrã inteiro". Stereo Mix está morto. Cabo virtual obriga a redirecionar a saída e parte-se ao trocar para auscultadores.

`application-loopback` (MIT, N-API, WASAPI) apanha tudo ao nível do mixer, zero configuração. **Risco:** ~11 estrelas. **Mitigação:** versão fixa + smoke test; plano B = `.exe` C# com `NAudio.WasapiLoopbackCapture`.

**Decisões que a v1 omitiu:**
- **Sistema vs por-processo.** O `application-loopback` suporta ambos. Default: **sistema** (agnóstico à origem, como pedido). Mas um *ding* do Slack durante um breakdown é um onset largo → candidato a falso DROP. → Opção na tab para fixar a captura a um processo (ex.: só Spotify), e gate de plausibilidade no detetor (§3.3).
- **Mudança de dispositivo.** O WASAPI fica em silêncio quando o dispositivo de saída por defeito muda (auscultadores). Sem detetar-e-reiniciar, a bola morre "misteriosamente" na primeira vez. → Watcher de dispositivo + restart da stream. Entra na Fase 3, não é opcional.

### 2.2 Transporte da grelha — o que salva a fase

Três loops decoupled são certos para *suavidade*, mas destroem *fase* se a batida viajar como evento: jitter WS (±10-20ms) + rAF do pai (16ms) + rAF do iframe (16ms) ≈ **30-80ms de erro acumulado** — no limiar do percetível, exatamente no momento do DROP.

**A grelha não viaja como evento. Viaja como previsão:**

```js
{ type:'grid', v:1,
  t0: <timestamp do último downbeat, relógio do sidecar>,
  beatPeriodMs, beatsPerBar, barsPerPhrase,
  barIndex, phraseIndex, confidence }
```

O iframe **extrapola localmente** a partir de `t0 + n·beatPeriodMs`. Requer handshake de sincronização de relógio (sidecar ↔ `performance.now()`), estilo NTP simplificado: 5 trocas, fica com a de menor RTT. **Sem isto, a Camada 3 não funciona.**

Features contínuas (rms, bandas, centroide) viajam à parte, como valores, no seu próprio ritmo.

### 2.3 Servir os ficheiros companheiros

`api/mirrors/html/route.ts` serve **um ficheiro como string**. O `index-v2.html:435-437` referencia `bridge.js` e `emotion-v2.js` por caminho **relativo** → através da rota resolvem para `/api/mirrors/bridge.js` → **404**.

**Decisão:** rota de assets confinada `/api/mirrors-emotions/asset/<nome>`, com o mesmo guard de nome simples de `mirrors.ts:31` (sem `/`, `\`, `..`; só `.js`/`.html`). Alternativas rejeitadas: bundle num único HTML (perde a edição rápida), `public/` (perde a pasta configurável).

Nota: `index-v2.html:435` puxa face-api.js do jsdelivr — dependência de CDN dentro do artefacto "relaxar offline". No caminho da música, **não carregar face-api** (só se a fonte webcam for escolhida).

---

### 2.4 Três modos da bola *(adicionado S2, pedido do David)*

`MB_SOURCE.owner ∈ { manual | camera | music }` — escolhido por `?src=` e por seletor na tab (postMessage `{type:'source'}`), persistido em `~/.agentic-os/mirrors-emotions.json`.

| Modo | Escreve no `CONFIG` | Nota |
|---|---|---|
| `manual` | ninguém — painel `d` (sliders) + botão skin | a bola base de hoje, intocada; **default** |
| `camera` | `emotion-v2.js` | face-api só carrega aqui |
| `music` | `music.js` | sidecar só liga aqui |

Troca de modo = rampa 1-2 s a partir dos valores atuais; nunca corte. Descobertas de código (S2): `MirrorBall/` não é repo git → `git init` antes da Fase 0; o fade interno dos spots vive na bola (`frame()`, períodos 13/17/11 s) → knob `spotFadeMix` no `CONFIG` (default 1) para o GROOVE mandar; `PRESETS.DEAD`+`setHealth` servem o estado de silêncio.


## 3. O motor musical

### 3.1 Camada 1 — Reativa

Mapeamento de features para (V, A), com o **normalizador novo** (§1.1), não o do `emotion-v2.js`:

- **Arousal** ← loudness integrado (janela 10-30s, gated) + densidade de onsets + BPM.
- **Valência** ← centroide espectral + rácio de graves.
  ⚠ **Sem modo maior/menor** — exigiria chroma/deteção de tonalidade, que não está no orçamento das features. A v1 listava-o sem o financiar.
  ⚠ O mapeamento centroide→valência herdado das caras faria techno escuro com muitos hi-hats ler como "brilhante" e puxar a sala para branco. **Precisa de passe de desenho próprio**, não de herança.

Isto sozinho é um envelope follower competente — e é aqui que pára o "básico".

### 3.2 Camada 2 — Métrica (a grelha)

O que falta ao `emotion-v2.js`: **memória do tempo musical**.

**Implementação — o que existe e o que não existe:**

| Precisa | Estado |
|---|---|
| BPM | resolvido (autocorrelação da função de onset) |
| Fase da batida | fazível à mão em 4-on-the-floor (comb filter) |
| **Downbeat** (qual é o "1") | **problema de investigação.** Estado da arte = madmom (Python/RNN). Nenhuma biblioteca JS/Node dos relatórios o faz |
| Posição na frase (8/16/32) | depende do downbeat |

**Decisão:** implementação própria — onset flux → autocorrelação → comb filter para fase; downbeat por heurística de energia de graves (em 4-on-the-floor o kick marca o "1", e o compasso 1 da frase costuma ter o onset mais forte). **Com prior de oitava de andamento** (60-90 / 120-140 BPM para eletrónica) para atacar os erros de half/double-time, que são a falha mais comum e que a v1 não mencionava. Histerese na mudança de andamento.

**Rotação:** uma volta a cada N compassos; alvo só muda na fronteira do compasso; easing de 1 tempo.
**Se a grelha estiver errada, a rotação é benigna** — ninguém perceciona se uma mudança de 1 rpm caiu na linha certa. O grid-lock sobrevive a grelha errada. **A Camada 3 não** — ver a seguir.

### 3.3 Camada 3 — Estrutural (o técnico)

```
        ┌──────────────────────────────────────────────┐
        ▼                                              │
  [GROOVE] ──energia sobe 4+ compassos──▶ [BUILD] ──▶ [DROP] ──▶ [GROOVE]
        ▲                                    │
        └──────energia cai──── [BREAKDOWN] ◀─┘
```

**O PRE-DROP — corrigido.** A v1 dizia "último ½ compasso do build", que só se sabe *depois*. O mecanismo real ancora-se à grelha de frases:

```
PRE_DROP  ⟸  estado == BUILD
          ∧  distância à próxima fronteira de frase ≤ ½ compasso
          ∧  confiança da grelha > limiar
```

Os builds resolvem em fronteiras de 16/32 compassos — é isso que torna a previsão possível. A Camada 2 tinha a grelha e a Camada 3 tinha os estados; a v1 nunca os ligou.

**A falha graciosa é parte do desenho, não uma mitigação:**

> **profundidade do escurecimento ∝ confiança**

Com confiança alta, escurece a fundo (o efeito pretendido). Com confiança baixa, escurece pouco — e um falso positivo lê-se como *"seguiu o filter sweep"* em vez de *"as luzes morreram"*. É isto que torna a antecipação viável em produção. Timeout: se o drop não vier em ≤2 compassos, volta a GROOVE por rampa (nunca corte).

| Estado | Deteção | Comportamento |
|---|---|---|
| **GROOVE** | base | ver §3.6 |
| **BUILD** | energia sobe ≥4 compassos; graves a sair; centroide a subir | **contenção**: haze sobe, feixes *reduzem*, opacidade desce devagar |
| **PRE-DROP** | BUILD × proximidade da fronteira × confiança | **escurece ∝ confiança** |
| **DROP** | queda de energia + onset forte no tempo 1 + **gate de plausibilidade** (banda larga e sustentado, não um *ding* de 80ms) | spots ao máximo, feixes ao teto (≤0.18), opacidade sólida |
| **BREAKDOWN** | energia cai e mantém-se | fantasma: opacidade ~0.3, rotação lenta, 3-4 feixes, haze alto |

**Removido da v1:** o burst de rotação 1.5× no DROP. Contradizia a tese da Camada 2 (a bola é um objeto pesado que só muda na fronteira do compasso), é fisicamente implausível, e o impacto já vem dos spots/opacidade/feixes. Era o gesto de amador que o próprio §0 critica.

**Variação — contra o determinismo.** Fazer o mesmo truque em todos os drops torna-se previsível ao terceiro, e previsível é o oposto de "quase mágica". Memória de sessão:
- contador de drops; a profundidade escala ao longo do set (o maior guarda-se);
- ~1 em 4 drops, **contenção deliberada** — não morde o isco, abre menos;
- jitter pequeno na duração da abertura.

### 3.4 Camada 4 — Perfis

Heurísticas a 1 Hz, sem ML (ambos os relatórios concordam que YAMNet/PANNs são exagero para 4 baldes):

| Perfil | Deteção | Regras |
|---|---|---|
| `electronica` | BPM alta confiança + graves altos + pulso claro | **default.** 4 camadas ativas |
| `acustico` | BPM baixa confiança, dinâmica ampla | sem grelha; Camada 3 off; opacidade segue dinâmica |
| `voz` | VAD + ZCR + banda estreita | rotação lenta constante, sem flashes |
| `silencio` | abaixo do piso, >1s sem buffers | decai para DEAD em ~4s |

Histerese mínima de 5s; nunca trocar de perfil a meio de uma frase.

### 3.5 Silêncio

O WASAPI **para de emitir buffers** quando nada toca. O sidecar emite `{ silence: true }` após 500ms sem dados; o iframe decai para DEAD. Sem isto a bola congela no último frame e parece bug.

### 3.6 GROOVE — os 90% do tempo *(secção nova)*

A lacuna estrutural da v1: o teste de aceitação decide-se em GROOVE, e a v1 dava-lhe só a Camada 1 + rotação quantizada — um envelope follower vestido.

O que um técnico faz quando *não* há drop: trabalha a **textura** e faz **micro-eventos** que quase não se notam, mas que fazem a sala respirar.

- **Coreografia de spots amarrada à música.** A bola tem fades próprios com períodos 11/17/13s (`index-v2.html:65-67`) — **não são períodos musicais** e vão brigar visivelmente com a grelha. Em GROOVE, a coreografia passa a ser comandada por frases: troca de spot dominante na fronteira de 8 ou 16 compassos.
- **Acentuação de frase.** Na fronteira de 16/32 compassos, um gesto pequeno (um spot que abre 15%, o haze que respira) — o suficiente para o olho registar estrutura sem chamar atenção.
- **Deriva lenta.** Micro-variações de haze e de intensidade em períodos longos (30-60s), fora de fase entre si, para nunca haver dois minutos iguais.
- **Resposta a mudança tímbrica**, não a energia: entrada de um hi-hat, filtro que abre — o centroide mexe-se e a textura acompanha, sem a opacidade dar saltos.

Regra de ouro de GROOVE: **nada pisca.** A energia gasta-se em textura, para que o DROP tenha de onde se destacar.

---

## 4. Fases

| # | Entrega | Depende | Verificação |
|---|---|---|---|
| **0** | Extrair helpers → `core.js`; **arbitragem de fonte**; `emotion.js` passa a usá-lo | — | bola de emoções na mesma; só uma fonte escreve no CONFIG |
| **1** | Tab `/mirrors-emotions` + view + rota de assets (§2.3) | — | tab abre; ficheiros companheiros servidos (sem 404) |
| **2** | Driver `postMessage` + `music.js` com **gerador sintético** + **HUD** | 0,1 | bola reage a compassos falsos; HUD mostra estado/grelha |
| **2b** | **Harness offline**: ~10 faixas do David com drops anotados à mão; scoring de BPM/downbeat/drop | — | **gate de decisão**: se o downbeat falhar, a Camada 3 é reescopada aqui |
| **3** | `audio-sidecar/` :3739, `application-loopback`, smoke test, **watcher de dispositivo**, integração nos `.bat` | — | PCM real; sobrevive a trocar auscultadores |
| **4** | Features + tracker (o validado em 2b) + **sync de relógio** + grelha por timestamps | 3, 2b | fase estável; erro < 20ms |
| **5** | Camadas 1+2 | 2,4 | rotação trava à grelha |
| **6** | **GROOVE** (§3.6) | 5 | 20 min de faixa sem drop e não cansa |
| **7** | Camada 3 + variação | 6 | drop conhecido → escurece antes, abre no tempo certo |
| **8** | Camada 4: perfis | 7 | vídeo com voz → perfil `voz` |
| **9** | Hardware via `bridge.js` | 5 | ESP32 reage sem tocar no firmware |

**Duas alterações de sequência face à v1:**
- **2b é nova e crítica.** A v1 só descobria que o downbeat tracking não funciona na Fase 6, depois do sidecar todo construído. O harness offline não precisa de captura nenhuma — decodifica ficheiros e pontua contra anotações à mão. É o de-risking mais barato do componente mais arriscado.
- **GROOVE (6) vem antes da Camada 3 (7).** É onde se passam 90% do tempo; se GROOVE não segurar 20 minutos, os drops não salvam nada.

---

### 4.0 Ritmo do projeto *(David, S2 — manda sobre tudo o resto)*

> "isto é um projeto para ter algo fixe rápido e depois ir afinando […] side project que faço enquanto correm outras sessões agênticas."

**Fase 2b saltada.** Primeiro o *standard* a funcionar ponta-a-ponta (sidecar → features → grelha simples → bola), depois afina-se camada a camada com música real a tocar. Nada de harness, anotações, ou gates pesados antes de haver resultado no ecrã. Sequência efetiva: 0 → 1 → 2 ∥ 3 → 4+5 (num só passo, tracker simples) → 6 → 7 → 8 → 9, cada uma pequena e com stop visual.

### 4.1 Delegação por exigência e stops *(adicionado S2)*

| Fase | Executa | Stop (David verifica) |
|---|---|---|
| 0 | Sonnet | bola de emoções igual; `manual` intocado |
| 1 | Sonnet | tab abre, zero 404, seletor de modo |
| 2 | Opus | bola reage a compassos falsos; HUD |
| 2b | Opus implementa · **Fable julga** | **go/no-go da Camada 3** |
| 3 | Sonnet (molde `terminal-sidecar/`) | sobrevive a trocar auscultadores |
| 4 | Opus | fase estável, erro < 20 ms |
| 5 | Opus | rotação trava à grelha |
| 6 GROOVE | **Fable** | **20 min sem cansar** |
| 7 Camada 3 | **Fable** | drop conhecido: escurece antes, abre no 1 |
| 8 | Sonnet | vídeo com voz → `voz` |
| 9 | Sonnet | ESP32 reage |

Effort: Fable corre a **medium** (orquestração e fases 6/7); Opus/Sonnet ao effort que o brief da fase pedir.

Regras: o orquestrador (Fable) escreve o brief de cada fase e revê o diff antes de cada stop; nenhuma fase arranca sem OK no stop anterior; 0+1 e 2b+3 podem correr em paralelo.


## 5. Observabilidade e afinação

O critério é subjetivo, logo a afinação tem de ser possível. O `emotion-v2.js` tem HUD (tecla `e`); o motor de música tem 10× o estado interno e a v1 não lhe dava nenhum.

**HUD (tecla `m`)**: estado atual, posição na grelha (compasso/frase), BPM + confiança, probabilidade de build, perfil ativo, e um *event log* das últimas transições — para responder a "porque é que escureceu ali?".

**Parâmetros afináveis em runtime**, servidos por endpoint de config (não no bundle do Next): o `CLAUDE.md` exige `npm run build` + restart para mudanças em `source/`, o que tornaria cada iteração de afinação num ciclo de build. Os limiares da máquina de estados vivem nos ficheiros servidos do disco ou num JSON em `~/.agentic-os/`.

---

## 6. Critério de aceitação

Do briefing: *"é a destilação de uma parte muito importante de mim"*.

**Teste:** o David põe uma faixa que adora, deixa a bola a rodar, e volta ao trabalho. Passados 20 minutos ainda não a desligou — e em algum momento levantou os olhos *porque a bola fez algo no momento certo*, não porque piscou.

Falha se: pisca demais, reage a tudo, fica igual em qualquer música, ou **fica previsível ao terceiro drop**.

---

## 7. Riscos

| Risco | Mitigação |
|---|---|
| Downbeat tracking não funciona na biblioteca real | **Fase 2b decide antes de construir**; se falhar, Camada 3 reescopada |
| `application-loopback` (~11 ⭐) parte | versão fixa + smoke test; plano B C#/NAudio |
| Falso positivo de PRE-DROP | escurecimento ∝ confiança → lê-se como filter sweep; timeout por rampa |
| Half/double-time no BPM | prior de oitava por perfil + histerese |
| Fase perde-se no transporte | grelha por timestamps + sync de relógio; iframe extrapola |
| Troca de dispositivo mata a captura | watcher + restart (Fase 3, obrigatório) |
| Notificação do Windows lida como drop | gate de plausibilidade + opção de captura por processo |
| Dois escritores no CONFIG (webcam + música) | arbitragem explícita na Fase 0 |
| Determinismo mata a magia | variação/escalada por sessão (§3.3) |
| Orçamento de frame (bola já mira 17.5ms) | crossfade de skin duplica o draw (`index-v2.html:367`); evitar parar `skinAuto` a meio |
| Colisão de metáfora com `/mirrors` | **resolvido**: tab separada |

---

## 8. Decisões fechadas

1. **Tab nova** `/mirrors-emotions`; `/mirrors` (tarefas) intocada.
2. **Captura por sidecar** com `application-loopback`; não `getDisplayMedia`.
3. **Análise no sidecar**; PCM cru nunca chega ao Chrome.
4. **Sem ML**; heurísticas a 1 Hz.
5. **`index-v2.html`** como bola base.
6. **Helpers partilhados** (~30 linhas), não "o mesmo algoritmo"; constantes re-derivadas; normalizador novo; contraste removido/reduzido.
7. **Grelha por timestamps + sync de relógio**; iframe extrapola.
8. **Rota de assets confinada** para os ficheiros companheiros.
9. **Fase 2b (harness offline) é gate** antes de investir no sidecar.
10. **Sem burst de rotação no drop.**
11. **Modelo mental no Hindsight** em `claude-code::MirrorBall` (bank vazio hoje).
