# Plano — Housecleaning: consolidar documentação, arquitetura e manual

**Data:** 2026-08-29 · **Estado:** planeado, aprovado pelo David · **Executa:** outra sessão
**Base:** `master` @ `be2ed57`, `music.js?v=58`, harness 15/16, 34 commits.

> Este documento é **auto-suficiente**: contém todos os factos apurados na sessão de planeamento.
> Quem executar não precisa de repetir a exploração — precisa de ler o código só para escrever
> prosa fiel, não para descobrir o que existe.

---

## 0. Porquê

A bola estabilizou. O conhecimento do projeto está espalhado por **sete sítios que já divergem**:

| Onde | O quê |
|---|---|
| Este repo, `docs/` | `plan.md` (401 L, plano *pré-implementação*), 4 handoffs S1→S4 sem índice, 2 research, `tools/README.md` |
| `CLAUDE.md` | as 7 regras do motor — o único doc correto sobre o estado atual |
| `README.md` | **descreve um projeto que já não é este** (só emoções/webcam) |
| agent-os | **3 docs duplicados byte-a-byte** + todo o sidecar + a tab do OS |
| Vault Obsidian | a narrativa das sessões, dentro da ficha do AgentOS-MissionControl |
| `~\Downloads\` | o relatório dos knobs do painel `d` — a melhor referência que existe, fora do git |
| Hindsight | bank `claude-code::MirrorBall`, 11 blocos + modelo mental |

### Contradições medidas (não hipotéticas)

1. **`README.md`** descreve o projeto *só* como bola de emoções por webcam. Não menciona música,
   sidecar, `music.js`, `index-v2.html`, `tuner-lab`, nem os `.bat` de Mirrors of Emotions. É o
   primeiro ficheiro que qualquer pessoa lê.
2. **`docs/handoff-2026-08-28-S1.md:12`** aponta para `docs/2026-08-28_mirrors-of-emotions-plan.md`
   — ficheiro inexistente aqui (foi renomeado para `docs/plan.md`). Link morto.
3. **`CLAUDE.md`** diz que `beat-detection-research.md` está "por aplicar"; o S4 mostra mediana
   adaptativa e `absFloor` já implementados.
4. **`docs/plan.md` §4** tem uma tabela de 10 fases substituída pela §4.0 ("Fase 2b saltada") mas
   nunca atualizada. Não há em lado nenhum registo de que fases estão feitas.
5. **`docs/lighting-design-research.md`** diz rig a `az ±95° / el ~35°`; o S4 fixou
   `az ±28° / el 12-14°` (feixes para a frente). **O S4 manda.**
6. **`docs/plan.md` §2.2** descreve a grelha a viajar do sidecar como previsão com sync de relógio.
   **Na realidade a grelha nasce localmente** em `emitLocalGrid()` (`music.js:1577`) e volta a
   entrar pelo mesmo `onMessage`. O sidecar **não emite `grid` nem `hint`**. Este é o erro mais
   provável de quem ler o plano antigo a pensar que descreve o sistema.
7. **3 ficheiros duplicados byte-a-byte** (md5 verificado) entre `agent-os/docs/` e `docs/`:
   `2026-08-28_mirrors-of-emotions-plan.md` ≡ `plan.md`,
   `2026-08-28_mirrors-of-emotions-handoff.md` ≡ `handoff-2026-08-28-S1.md`,
   `2026-08-28_beat-detection-research.md` ≡ `beat-detection-research.md`.
   São cópias, não links — vão divergir em silêncio.

**Resultado pretendido:** um único sítio de verdade, com um HTML de três abas (arquitetura ·
manual do operador · info técnica) que o David abre no browser, e um repo arrumado.

---

## 1. Decisões (tomadas pelo David nesta sessão — não reabrir)

1. **Formato**: os `.md` em `docs/` são a fonte editável; o HTML é escrito **à mão** a partir deles.
   (Rejeitadas: HTML como fonte única; HTML a fazer fetch dos `.md` em runtime.)
2. **Fronteira com o agent-os**: o **código** do sidecar fica no agent-os (é infra do OS: tem
   `node_modules` nativo, é arrancado pelos `.bat` do OS, e o OS depende dele). Os **3 docs
   duplicados são apagados lá**, com um ponteiro curto para cá.
3. **Arrumação**: documentar **e** arrumar ficheiros (docs + código morto).
4. **Gravações**: `git rm` em `tools/feat`, `tools/feat - eletronico` (idênticas entre si) e
   `tools/feat-jazz` — ~4.5 MB, sem extensão, não referenciadas por nenhum doc ou script.
   Ficam `tools/feat-2026-08-29.json` (citada no handoff S4) e `feat-sample.json`.
5. **`spike-babylon/`** (assumido por defeito; o David pode mudar): committar `scene.js`,
   `config.js`, `index.html`; `vendor/babylon.js` (8.3 MB) para `.gitignore` com nota de como o obter.

### Decisão deixada para a execução

- **`web/index.html` + `web/emotion.js`** (v1 legado, vivos só pelo `MirrorBall-Start-v1.bat`):
  **proposta = manter** e marcar como legado no README. Perguntar ao David antes de apagar.

---

## 2. Estrutura final de `docs/`

```
docs/
  ARCHITECTURE.md      NOVO  o sistema como É hoje (não como foi planeado)
  OPERATOR.md          NOVO  manual: knobs + como afinar + o que ouvir
  REFERENCE.md         NOVO  contrato do sidecar, CONFIG, teclas, API, FSM, HUD
  DESIGN-RULES.md      NOVO  regras fixadas pelo David (extraídas dos handoffs)
  STATE.md             NOVO  onde estamos + próximo passo (substitui "ler o último handoff")
  mirrorball-docs.html NOVO  as 3 abas, offline, greyscale
  research/
    beat-detection.md        movido, + nota de estado no topo
    lighting-design.md       movido, + nota da divergência resolvida (S4 manda)
  history/
    plan-v2-2026-08-28.md    movido de plan.md, + cabeçalho "documento histórico"
    handoff-2026-08-28-S1.md ─┐
    handoff-2026-08-28-S2.md  │ movidos tal como estão
    handoff-2026-08-29-S3.md  │
    handoff-2026-08-29-S4.md ─┘
  plan-housecleaning-2026-08-29.md   este ficheiro (mover para history/ no fim)
```

---

## 3. Fase 1 — Extrair a verdade para `.md`

### 3.1 `docs/ARCHITECTURE.md`

O sistema **como é hoje**. Factos já apurados (verificar `file:line` ao escrever):

**Ordem de carregamento** (`index-v2.html:910-915`) — o `<script>` inline (`:65-909`) corre
primeiro e cria `CONFIG`, os tiles, o loop `rAF` e `window.MIRRORBALL`; só depois:
`core.js?v=1` → `bridge.js?v=2` → `emotion-v2.js?v=1` → `music.js?v=58` → `tuner.js?v=1`.
Consequência: os motores encontram sempre a bola pronta, e **a bola funciona sozinha** (modo manual).

**Três caminhos de entrada de dados**, todos convergindo em `onMessage(d)` (`music.js:983-991`):

| Caminho | Onde | Condição |
|---|---|---|
| postMessage do pai (OS) | `music.js:991` | bola em iframe; `useAudioDriver.ts` do agent-os faz de driver |
| WebSocket direto ao sidecar | `standaloneDriver()`, `music.js:997-1021` | `window.parent === window` **e** path começa por `/app/` |
| Gerador sintético | `GEN`, `music.js:2285+`, tecla `g` | sem sidecar; cala-se se chegarem features reais (`music.js:1047`) |

O driver autónomo obtém o token em `GET /app-token` (same-origin) e liga a `${j.ws}/ws?token=…`
(`music.js:1004-1005`). Ao fechar injeta `{type:'features', silence:true}` e retenta em 2 s.

Tipos aceites: `features` → `ingestFeatures` (~50 Hz); `grid` → `ingestGrid`; `clock`/`clock-req`;
`profile` → `setProfile`.

**A grelha nasce localmente** — `emitLocalGrid()` (`music.js:1577`). Ponto a destacar: contradiz
`plan.md` §2.2.

**Pipeline por frame** (`update()`, `music.js:2152-2258`):
```
emitLocalGrid → updateGrid → updateFsm → updateGestures → computeTargets
  → applyGesture(target)               gestos sobrepõem-se ao alvo
  → spinLock   (piso de rpm com bombo)          music.js:2173-2175
  → spinCeil   (teto de rpm sem bombo)          music.js:2186-2204
  → ease por knob (taus + rampa de posse)       music.js:2218-2234
  → garantias duras na saída                    music.js:2237-2245
  → if (owner === 'music') applyToBall() + BRIDGE.send()
  → emitState (4 Hz) + updateHud
```
O estado interno **evolui sempre**, mesmo sem posse — só a *escrita* é condicionada
(`music.js:2249-2253`). Mesmo padrão em `emotion-v2.js:148-151`.

**`MB_SOURCE` — API exata** (`core.js:26-52`):
```js
window.MB_SOURCE = {
  owner: 'manual' | 'camera' | 'music',
  set(name),   // no-op se inválido OU já for o owner (não re-dispara listeners)
  on(fn),      // fn(newOwner); erros num listener não param os outros
}
```
Owner inicial = `?src=` se válido, senão `'manual'` (`core.js:27-33`). Troca por postMessage
`{type:'source', value:…}` — origem **não** validada (loopback local, `core.js:47-52`).
Quem chama `set()`: `emotion-v2.js:185` (câmara ligada) e `:189` (`EMOTION.fake()`).
**`music.js` nunca chama `set()`** — recebe a posse de fora e reage em `onOwnerChange`
(`music.js:2057-2078`).

**Handover sem corte** (`music.js:2057-2074`): ao ganhar `'music'`, lê os valores **atuais** do
CONFIG para `state.out` e marca `handoverT`; durante `handover.rampSec` (1.5 s) os taus são
multiplicados por `slow = lerp(2.5, 1, hand)` (`music.js:2207-2208`). Nunca há salto.

**Quem escreve o quê no CONFIG** — `applyToBall()` (`music.js:2080-2149`) é o único ponto de
escrita do motor:

| Campo | Gate |
|---|---|
| `rotationRpm` | sempre |
| `haze`, `beamFraction`, `beamIntensity`, `beamMaxCount` | `CONFIG.beamsMotor !== false` |
| `sphereOpacity` | `CONFIG.opacityMotor !== false` — **default `false`** (pedido do David) |
| `spots[i].intensity` (via `MB.setSpot`) | `CONFIG.spotsMotor !== false` |
| `spotFadeMix = 0` | sempre — desliga os fades internos 11/17/13 s |
| `choreo.flashRate = 0` | sempre — flashes Poisson internos não são música |
| `health` | sempre |
| **`skin` / `setSkinAuto`** | **NUNCA o motor** (`music.js:2111`) |

Exceção única de skin: ao ganhar posse, se `CONFIG.skin === 'auto'`, força **uma vez** `'dark'`
(`music.js:2071`) — 'auto' sem fonte de tom ficaria preso num alvo que ninguém escreve.

**Tetos do painel `d`** (`music.js:2085-2092`): `hazeMax` e `beamFractionMax` são multiplicadores-
teto do David; o motor modula *por dentro* deles. `beamIntensity` tem teto duro 0.18.

Nota (`music.js:460-462`): o motor já não escreve `beamMaxCount` como expressão — escreve
`beamFraction = beams/56` e fixa `beamMaxCount = outMax.beamCap (64)` como teto de performance.

**Saída para hardware** (`bridge.js`), ~20×/s (`SEND_EVERY_MS = 50`):
```
S<rpm×100> B<0-255> H<0-255> V<-100..100> A<0-100> L<0-100>\n
```
`B = 255 × min(1, spotGain/1.6) × health` (`bridge.js:18`). Transportes: Web Serial (115200) ou
WebSocket (`?ws=`, reconecta 2 s). Chamado por `emotion-v2.js:150` (V/A reais) e `music.js:2252`
(`valence: 0`, `arousal: kickPresence`).

**Fronteira MirrorBall ↔ agent-os.** Ficheiros do OS que este projeto toca (handoff S2):
`audio-sidecar/server.js`; `source/src/lib/{mirrorsEmotions,useAudioDriver}.ts`;
`source/src/components/{MirrorsEmotionsView,Sidebar,SkinToggle}.tsx`;
`source/src/app/{mirrors-emotions,api/mirrors-emotions/**}`; os `.bat` da raiz.
**Dois caminhos hardcoded** para este repo: `audio-sidecar/server.js:66` (`APP_DIR`, sobreponível
por `AUDIO_APP_DIR`) e `source/src/lib/mirrorsEmotions.ts:16` (`DEFAULT_DIR`, só pela UI).
Mover este repo parte ambos — **documentar como atrito conhecido**.

**Os três loops** (sidecar 50 Hz · rAF do pai · rAF do iframe) e porque não estragam a fase.

**Diagrama** (para o `.md`, em ASCII; o SVG fica no HTML):
```
WASAPI loopback (dispositivo de saída por defeito)
        │ int16 estéreo 48 kHz
        ▼
audio-sidecar (Node, :3739, no agent-os)
   downmix mono → frames 1024 → Hann → FFT
   bandas em dB com referência PRÓPRIA por banda (~40 s)
        │ WS /ws  ~50 Hz  ·  PCM cru nunca sai
        ├──────────────► useAudioDriver.ts (tab do OS) ──postMessage──┐
        └──────────────► standaloneDriver() (bola em /app/) ──────────┤
                                                                      ▼
                                                  music.js  onMessage → update()
                                                  (grelha nasce AQUI: emitLocalGrid)
                                                                      │ applyToBall
                                                                      ▼
                                        CONFIG ──► frame() ──► Canvas 2D
                                                    │
                                                    └──► bridge.js ──► ESP32
```

### 3.2 `docs/REFERENCE.md`

**Contrato do sidecar** (`audio-sidecar/server.js`, 585 L; cabeçalho de `music.js:28-41`):
```
{ type:'features', t, silence,
  rms, bass, mid, high, sub, hat, density, centroid,   // médias do intervalo
  onset, subOnset,                                     // MAX, normalizados
  subFluxRaw, hatFluxRaw, midFluxRaw,                  // MAX, flux LINEAR CRU
  loudness }                                           // média gated, 20 s
```
Quatro avisos load-bearing:
- Bandas (`bass` 20-150, `mid` 150-2000, `high` 2000-16000, `sub` 40-120, `hat` 6000-16000 Hz):
  0..1 numa **escala de dB própria de cada banda** (ref = máximo lento, `BAND_REF_DECAY = 0.99965`
  ≈ 40 s, `BAND_RANGE_DB = 30`). **Nunca normalizadas umas contra as outras** — foi o bug que fez
  `bass ≡ 1.0` (server.js:193-203 documenta-o).
- `onset`/`subOnset` são normalizados ao máximo **corrente** (`FLUX_DECAY = 0.999`) → bons para ver,
  **inúteis como limiar**. Para detetar usam-se os `*Raw`.
- Os `*Raw` **podem faltar** (sidecar antigo, gerador, replays) — todo o consumidor tem fallback.
  Daí a linha `detetor raw|fallback` no HUD.
- `midFluxRaw` é a **banda de caixa 200-800 Hz**, não a banda `mid`. Adicionado 2026-08-29 porque
  `corr(midFlux, hatFluxRaw) = 0.36` — o `mid` largo seguia os pratos.
- `density` = fração de bins 20 Hz-16 kHz acima de −36 dB do pico. `centroid` = centróide em
  espaço log2. `loudness` = dBFS com gate a −50, janela 20 s, −60..0 dBFS → 0..1.
- Silêncio: sem buffers > 500 ms → payload de zeros com `silence:true`, ritmo cai para 4 Hz.

Rede: porta **3739**, bind **127.0.0.1**. Token de 24 B hex por arranque em
`~/.agentic-os/audio-token`. Origins: `127.0.0.1|localhost:3737` (OS) e `:3739` (self).
`authorized()` = Host na allowlist **e** Origin na allowlist se presente **e** `x-audio-token`.

| Rota | Guarda | Devolve |
|---|---|---|
| `/health` | `authorized()` ou `?token=` | `{ok, capturing, device, clients, silence}` |
| `/app-token` | **só same-origin** | `{token, ws}` |
| `/app-config/locations` | `authorized()` ou `?token=` | lista de destinos |
| `/app-config` (POST) | `authorized()` completo | grava `music-config.json` (tmp+rename) |
| `/app/<file>` | **sem token**, só filtro de nome | ficheiro de `APP_DIR` |

`/app/*`: rejeita `\`, `/`, `..`; só `.html|.htm|.js|.json|.png`; **pasta plana, sem subdirectórios**
(é por isto que existe `web/vendor-uPlot.iife.min.js` com nome achatado e uma cópia de
`feat-sample.json` em `web/` — **são intencionais, não duplicados a limpar**).
`cache-control: no-store` → editar `music.js` e recarregar basta, sem build.

WS: path `/ws`, subprotocolo `agentos-audio`. Única mensagem de entrada aceite:
`{type:'clock', id, tClient}` → `{type:'clock', id, tClient, tServer}`.

Watchdogs (loop 1 s): sem buffers > 3000 ms → restart; buffers todos a zero > 4000 ms → restart
(máx. 1×/15 s) — WASAPI preso num endpoint que ninguém renderiza.

**CONFIG completo** (`index-v2.html:68-172`), por tema — tabelas com default e o que controla:
geometria (`ballSizeVH` 0.52, `ballCenter`, `facetRows` 48, `camDistance` 7.0, `room`, `chainLinkPx`),
rotação (`rotationRpm`, `driftPeriod` 38), spots (`spots[]` 6 entradas `{az,el,intensity,radius,
period,aim}`, `spotCount` 2, `spotRadiusMul` 1.0, `spotEdge` 0.35, `spotFadeMix` 1.0, `glintSharp`
0.75, `glintK` 24, `mirrorGain` 1.0), `choreo` (enabled, retarget **false**, dwell [4,12], move
0.08, azRange [35,130], elRange [5,30], aimMax 0.35, flashRate 0.6, flashLen, flashRadius,
flashIntensity, flashSlots 4), luz (`ambient` {n:3, intensity:0.07, areaDeg:32, drift:0.045},
`shade` {key:0.55, az:−35, el:40}, `ballLight` 0.0, `ballContrast` 1.0, `bgGrey` 7), haze/feixes
(`haze` 0.65, `hazeMax` 1.0, `halo` 0.3, `beamMaxCount` 110, `beamFraction` 1.0, `beamFractionMax`
1.0, `beamIntensity` 0.16, `beamWidthDeg` 0.7, `beamSoft` 0.5, `beamLength` 0.78, `beamLen3D` 3.6,
`beamGlowZ` 0.8, `incidentAlpha` 0.06, `incidentLen` 3.2, `incidentMaxWidth` 1.3, `incidentMaxPx`
0.14), dots (`dotDensity` 0.8, `dotScale` 0.32, `dotMaxGrey` 0xd8, `dotFalloff` 0.028), superfície
(`sphereOpacity` 1.0, `seamDarkness` 0.02, `seamInset` 0.15, `rimStrength` 0.22, `baseTileGrey`
[0.045,0.14], `litSideGain` 0.55), strobe (`enabled` false, `level` 0.55, `lenMs` 55, `minGapMs`
340, `strobeRate` 1.0), interruptores (`opacityMotor` **false**, `beamsMotor` true, `spotsMotor`
true), skin (`skin` 'auto', `skinEase` 7.0, `skinAutoValence` 1.6), pós-proc/perf (`bloomStrength`
0.75, `bloomBlurPx` 9, `grain` 0.032, `vignette` 0.55, `perf.targetMs` 17.5, `perf.minDotDensity`
0.12), explode (burstSec 0.16, driftSec 6.0, hold 0.5, maxHold 14, rewind 0.9, radial 1.9, depth
0.45, jitter 0.45, floatSpin 0.35, floatBob 0.05, gravity 1.1, spinMax 3.2).
PRESETS (`:186-189`): `DEAD` = `{spotGain:0.22, rotationRpm:0.12, sphereOpacity:0.35, haze:0.25}`.

**API `window.MIRRORBALL`** (`index-v2.html:723-769`): `config`, `setHealth/getHealth`,
`knobs.get/set`, `setSpot`, `flash`, `retarget`, `setChoreo`, `strobe`, `strobeEnabled`, `setSkin`,
`setSkinAuto`, `getSkin`, `explode`, `rewind`, `getExplode`, `setExplodeEnabled`.
Destacar: **`knobs.set()` tem prioridade invertida de propósito** (`:728-731`) — guarda em
`knobFile` e só aplica knobs **nunca tocados** localmente. **localStorage > ficheiro > defaults.**
Antes era o contrário e cada reload revertia os ajustes do David (bug nº3 do S4).
`strobe()` devolve `false` se `!strobe.enabled`, se `reducedMotion`, ou antes de `minGapMs` (340 ms).

**Teclas** (confirmadas no código):

| Tecla | Onde | Efeito |
|---|---|---|
| `d`/`D` | `index-v2.html:894` | painel de debug (knobs) |
| `w`/`W` | `:895` | `cycleSkin()` dark → white → auto |
| `x` | `:896` | `explode()` ciclo completo |
| `X` (shift) | `:897-898` | estoiro e **fica**; 2º shift+x = `rewind()` |
| `e`/`E` | `emotion-v2.js:179` | HUD de emoções |
| `m` | `music.js:2480` | HUD do motor |
| `g` | `:2481` | gerador sintético |
| `n` | `:2482` | próxima fase do gerador |
| `p` | `:2483` | cicla perfil; **desliga a deteção automática para a sessão** (`:1030-1035`) |
| `k` | `tuner.js:222` | painel de calibração do motor |

Guardas: as de `music.js` usam `toLowerCase()` (maiúsculas funcionam); **só `k` ignora
INPUT/SELECT/TEXTAREA** (`tuner.js:223-224`). Não há tecla para `MB_SOURCE`.

**Query params**: `?src=` (`core.js:29-32`); `?mini=1` (`index-v2.html:178-183`, aplica ~10
overrides e classe `mini`); `?scale=` (multiplica `ballSizeVH`, aplicado **depois** do mini);
`?light=1` (**só tem efeito com `mini=1`**); `?ws=` (`bridge.js:49-50`).

**FSM** — 5 fases: `GROOVE` (inicial, `music.js:906`, 80-90% do tempo), `BREAKDOWN`, `BUILD`,
`PRE_DROP`, `DROP`. Fora de `electronica` **não há FSM nem gestos** — força `GROOVE` (`:1887-1889`).

Transições (`updateFsm`, `:1876-1957`), cascata if/else — a primeira que casa ganha:

| # | De → Para | Condição |
|---|---|---|
| 0 | * → GROOVE | perfil ≠ electronica (`:1887`) |
| 1 | * → GROOVE | `state.silent` e `canSwitch` (`:1890`) |
| 2 | DROP → GROOVE | fim da abertura: `bar − fsmBar ≥ dropHold` ou `sinceMs ≥ dropHold×1000` |
| 3 | PRE_DROP/BUILD/BREAKDOWN → **DROP** | `kickPresence > 0.45` **e** `kickFlash > 0.5` **e** `onset ≥ 0.55` **e** `musicPlaying` **e** `canSwitch` (`:1897-1915`) |
| 4 | PRE_DROP → BUILD | timeout: `bar − fsmBar > 2` ou `inState > 6000 ms` |
| 5 | BUILD → PRE_DROP | `barsLeft ≤ 0.75` e `conf > 0.35` |
| 6 | BUILD → GROOVE | `kickPresence > 0.55` — "bombo voltou sem drop" |
| 7 | BUILD → BREAKDOWN | > 8 s no estado e `slope < 0` |
| 8 | BREAKDOWN → BUILD | held ≥ 3 s e (`slope > 0.015` ou `highSlope > 0.020`) |
| 9 | BREAKDOWN → GROOVE | held ≥ 3 s e `kickPresence > 0.5` |
| 10 | GROOVE → BREAKDOWN | `kickGapSec > 1.5` e `musicPlaying` → enfileira 2-3 gestos `dark` |
| 11 | GROOVE → BUILD | `kickPresence < 0.6` e (`slope > 0.015` ou `highSlope > 0.020`) → 2-3 gestos `dark` |

Guardas: `canSwitch = inState > 900 ms`; `musicPlaying = !silent && loudShort > 0.10`.
**BUILD não aplica a regra do `kickGap`** de propósito (`:1920-1924`) — fazia BUILD↔BREAKDOWN
oscilar a cada ~0.7 s (141 transições em 10 min, medidas).

Limiares: kick (`:184-202`, `:215-229`) `onsetMin` 0.22, `bassRatio` 1.08, `subOver` 0.02,
`rmsMin` 0.008, `refractoryMs` 200; raw: `kickC0` 1.6, **`absFloor` 0.35**, `kickRefractMs` 120,
`minStdRatio` 0.15 (filtro V0 de Patin), `cFloor` 1.15; presença `presenceTau` [0.30,1.50],
`gapDeadSec` 1.6, `deadTau` 0.40, alvo = `found/expected` com `expected` derivado do BPM (`:1375-82`).
Snare (`:260-274`): `C0` 1.9, `refractMs` 220, `rmsMin` 0.006, fallback `fbK` 3.0 com **piso
`fbFloor` 0.32** (a mediana da derivada de `mid` é ~0 e o teste por rácio colapsaria).
FSM (`:471-487`): ver tabela acima + `dropHoldBars` [4,8], `dropHoldSecNoGrid` [6,12],
`preDropDepth` 0.85, `minStateMs` 900.
BPM/grelha (`:292-300`): `keep` 8, prior 100-150 (fold de oitava), `hysteresis` 0.04,
`beatsPerBar` 4, `barsPerPhrase` 16, `emitEveryMs` 500; autocorrelação só se `gridConf < 0.35`
e score ≥ 1.5.
**Invariantes de rotação** (os dois mais importantes do manual):
- `spinLock` (`:415-416, 2173-75, 2237-39`): `kickPresence > 0.12` → `rpm ≥ 2.6`. Aplicado
  **depois** dos gestos — nenhum gesto pode travar a bola enquanto há bombo.
- `spinCeil` (`:442-445, 2186-2204, 2243-45`): `kickPresence < 0.06` **e** `gap > 2.2 s` →
  `rpm ≤ 0.10`. `spinCeilChance 1.00` = pára sempre; se < 1 a decisão é sorteada **uma vez por
  vazio** e vai para o HUD ("bola NÃO pára · sorteio").
Saída (`:449-462`): taus `rpm [0.60,1.50]`, `spot [0.12,0.60]`, `beamInt [0.10,0.50]`,
`beams [0.10,0.50]`, `haze [1.50,4.00]`, `opacity [0.40,2.00]`; `rpmStopTau` 0.45;
`opacityReleaseSec` 0.80. `outMax`: `spot` 1.60, `opacity` 1.00, `haze` 1.00, `rpm` 3.00,
**`beamInt` 0.18** (inviolável), `beams` 56, `beamCap` 64.

**Gestos** — os 9 do repertório (`music.js:1754-1784`). Um gesto **não é reação ao áudio**: é
decisão do técnico, por cima da Camada 1, com peso que entra (`rampInSec` 0.8) e sai
(`rampOutSec` 1.2) por rampa. Patches `set`/`mul`/`min`/`max`; `set/min/max` marcam posse.

| Gesto | O que se vê |
|---|---|
| `freeze` | bola PÁRA, spots mantêm-se, feixes seguem `high` (com bombo o `spinLock` anula a paragem) |
| `ghost` | a bola desaparece e continua a girar (opacity 0.05 súbita, spots a 0) |
| `blind-spin` | girar às escuras: 2.5 rpm, sem focos, quase transparente |
| `single-beam` | um único foco (solo), feixes ao máximo, fumo alto |
| `fog` | sala cheia de fumo, bola quase parada, poucos feixes |
| `strobe-slow` | dominante alterna a cada compasso (×1.25 / ×0.75) — ≤ 1 Hz a 140 BPM |
| `breath` | haze e opacidade em senos **fora de fase** (período 20-30 s sorteado) |
| `all-on` | DROP: tudo ao máximo permitido (disparado em `:1915`) |
| `flash-clear` | transparência máxima repentina, focos quase apagados, fumo alto; ataque súbito (τ 0.12), saída LENTA (τ 1.6) — é o contraste que se vê |

Pools (`:497-498`): `grooveLight = [breath, strobe-slow]`; `dark = [freeze, ghost, blind-spin,
single-beam, fog, strobe-slow, breath, flash-clear]`. `all-on` não está em pool nenhum.
Em GROOVE: tenta a cada 16-32 compassos, aceita 30%, só do pool leve. Ao entrar em
BREAKDOWN/BUILD: encadeia 2-3 do pool `dark`. Duração 2-8 compassos (ou 4-12 s sem grelha).
**Nunca repete o gesto anterior** (`:1787-1790`). RNG com seed de sessão; `RNG2` separado para
estrobos/flashes/cenas, para não perturbar a sequência de gestos.

Outros teatrais: **§CENAS** (`:321-327, 1714-20`) sorteadas na fronteira de frase, só GROOVE,
16-48 compassos: `full` 50% / `few` 30% (fração fixa 0.035) / `none` 20%; DROP/BUILD sempre `full`.
**§ESPAÇOS** (`:307-318, 1722-37`): estrobo isolado a cada 24-48 compassos, só com `act ≥ 0.6`;
sem feixes o intervalo encurta ×0.4; 35% saem em rajada de 3-4 (≥ 360 ms).
**§FLASHDIM** (`:342-349, 2120-28`) ganho `[foco0, foco1, restantes]`: GROOVE `[1.00,0.90,0.80]`,
BREAKDOWN `[0.85,0.12,0.10]`, BUILD `[0.70,0.30,0.30]` (2º foco sobe em 8 compassos),
PRE_DROP `[0.55,0.55,0.40]`, DROP `[1.25,1.25,1.10]`.
**§SPOTMOV** (`:379-383, 1702-08`): acento no dominante por compasso 0.16, fronteira de frase 0.34,
tarola 0.45, decaimento 0.55 s; rotação do dominante com jitter ±3 compassos.
**§CALMO** (`:1627`): em GROOVE com `act < 0.45` os focos ficam **still** — zero flashes/tarola/rajada.
**Explosão** (`:954-979`): no DROP se não é drop contido, ≥ 3 s de escuro, ≥ 75 s desde a última,
e passa sorteio de 85%. Rewind ao entrar em PRE_DROP, ou GROOVE vindo de não-DROP, ou fim da abertura.
**Contenção deliberada** (`:1905-07`): 1 em cada 4 drops abre menos (`dropOpen` 0.45).

**HUD `m`** — 14 linhas (`updateHud`, `:2414-2474`), canto inferior esquerdo. Documentar o que
cada linha significa **e o que indica avaria**:
- L3 `detetor`: `raw` vs `fallback`; **`std/med < 0.15` bloqueia tudo** (teste de variância);
  `C` = limiar efetivo; `lim = C × med`. O `flux` tem de saltar claramente acima de `med` a cada bombo.
- L2 `BOMBO`: `esp` = batidas esperadas na janela (derivado do BPM). Se `esp` estiver errado, a
  presença nunca chega a 1.
- L5 `tarola`: **`n` a 0 com bateria a tocar = piso alto demais**.
- L6 `paragem`: `PÁRA` / `não pára (sorteio)` — torna a paragem legível como **decisão**.
- L11 `auto`: **`cv —` = o classificador está a RECUSAR ler** (breakdown/dropout) e o score congela
  de propósito. `conf 1.00` = decidido com folga.
- L12 `saída`: os 6 valores finais já suavizados que vão para o CONFIG.
(Restantes: L1 estado, L4 agudos, L7 grelha, L8 fases, L9 gesto, L10 perfil/skin, L13 dono/health/
clock, L14+ log de eventos.)

**Testes e ferramentas**: `node web/test-music-f2.js` (16 asserções, **15 passam** — a falha é
pré-existente e conhecida); `node web/replay-real.js <feat.json>` (1 linha/s: `pres`, `rpm`, `fsm`);
`web/tuner-lab.html` (5 pistas uPlot, corre o `music.js` **real** num sandbox com relógio virtual —
não há cópia do algoritmo); `node tools/cap.js` e `tools/make-sample.js`.
Notas: **sem `package.json`** de propósito (Node ≥ 22 traz `WebSocket`/`fetch` globais — evita
`npm i ws` e `node_modules` no repo); uPlot é **MIT** e está vendorizado (offline, sem CDN);
`tuner-lab.html` **tem de ser servida** (`fetch` de `core.js`/`music.js`; `file://` bloqueia).

**Cache-buster**: `music.js?v=58` (`index-v2.html:913`). Regra: ao alterar `music.js`, bump.

### 3.3 `docs/OPERATOR.md`

**Parte A — os knobs.** Base: `~\Downloads\mirrorball-painel-d-knobs-2026-08-29.md` (é bom),
**atualizado de v37 para v58**. Faltam-lhe: `bola: contraste`, `pontos na parede (densidade)`,
`strobe: frequência ×`, e os 3 toggles `motor manda`.

Tabela dos **54 sliders** (`index-v2.html:774-831`, formato `[label, min, max, step, setter, getter]`)
com label · CONFIG · min/max/step · default · persiste?. Já apurada — os 47 primeiros são os
persistidos (focos, origem, spots 0-3, flash, bola: luz/contraste, luz geral, auréola, fundo,
strobe, pontos, indireta, cone, feixes, junta, filas), e depois do separador `---- bola`:
`rotationRpm` (não persiste), `haze máx` (**persiste**), os 3 toggles `motor manda` (**persistem**),
`sphereOpacity` e `health` (não persistem).

**Regra de persistência exata** (`:845`): `PERSIST` = todos os labels **antes** do primeiro que
começa por `rotationRpm`, **mais** os 4 explícitos (`haze máx`, `feixes+haze`, `focos+flashes`,
`opacidade`).

**Ordem de prioridade** (`:728-731`): **localStorage > ficheiro `ball` > defaults do código.**
`KNOB_DEFAULTS` é capturado **antes** de aplicar o localStorage (`:846-847`).

Controlos extra: botões `1/2/3 col`, `A−`/`A+` (persistem em `mb.dbgSize`), `repor ficheiro
gravado`, `repor knobs (defaults)`, `gravar (music-config.json)`, checkboxes `spot 0..5`,
linha de perf `frame X ms · dots Y · tiles N` (2 Hz).

Manter a secção **"interdependências que importam"** (11 pontos) do doc original — é o que evita
horas perdidas. Em particular: a posição da fonte decide para onde vão os feixes (|az| < 35° →
brilhos; 40-75° → o look 3D; ~90° → limbo, quase sem feixes; > 100° → só traseiros; el > 45° →
teto); `haze` multiplica feixes + cone + auréola ao mesmo tempo; `health` escala todas as fontes;
os knobs guardados sobrepõem-se aos defaults novos de cada versão.

**Parte B — como afinar** (o que não existe hoje em lado nenhum). Absorve `tools/README.md`:

1. **Regra primeira: medir antes de afinar.** Adivinhar limiares já custou uma noite (lição do S2).
   Afinar olhando para a bola não funciona: entre o kick e o que se vê há taus de 0.6-4 s, o piso
   de rotação, a névoa, as rampas dos gestos e a FSM. Quando uma batida não aparece, não se sabe
   se **o detetor a falhou** ou se **acertou e o mapeamento a suavizou** — e as correções são opostas.
2. `node tools/cap.js 40 tools/feat-<data>.json` com a música a tocar, **incluindo uma paragem de
   bombo**. O número que interessa é o **`p95/mediana` do `subFluxRaw`** — rácio entre pico e fundo,
   logo o teto do `kickC0`. Medido em faixa real: **9.8** (o default 1.6 disparava em cima do ruído).
3. `node web/replay-real.js …` para o número; `tuner-lab.html` para ver as 5 pistas empilhadas no
   mesmo eixo de tempo (sinal · limiar · decisões · o que a bola fez · em que estado estava).
4. **Tabela sintoma → o que medir → que knob** (construída dos bugs reais S2-S4):

   | Sintoma | Primeiro medir | Depois mexer |
   |---|---|---|
   | Bola não pára no vazio de bombo | `pres` no replay; linha BOMBO do HUD | `bandOnset.absFloor` (bug nº2 do S4: a mediana adaptativa caía para ~0.3 e o resíduo passava) |
   | Nada dispara / detetor mudo | L3 do HUD: `std/med < 0.15`? | `minStdRatio`, `kickC0` |
   | Motor não escreve nada na bola | **consola do Chrome**: TypeError? | bug nº1 do S4: `syncPanel()` rebentava dentro do `update()` a cada frame |
   | Feixes desaparecem em silêncio | consola: `NaN`? | knob novo sem valor inicial em `state` (regra 7) |
   | "Pisca" em GROOVE | toggle `feixes+haze: motor manda` a 0 | `hat.releaseSec` (0.12), `hat.beamGain` |
   | Strobe fraco no drop | `strobe fundo` (painel `d`) **e** o do `k` — estão **em série** | `strobe: frequência ×` |
   | Explosão nunca aparece | `getExplode()`; houve ≥ 3 s de escuro? | `explosão: breakdown mín (s)` no `k` |
   | Motor "estraga" o rig | é o ficheiro a sobrepor-se? | prioridade é localStorage > ficheiro; botão `repor ficheiro gravado` (bug nº3 do S4) |
   | Frame > 17.5 ms | linha de perf do painel `d` | `pontos na parede`, `beamCap`, `facetRows` |
   | Tarola nunca dispara | L5 do HUD: `n` = 0? | `snare.fbFloor` (0.32) |

5. **Ordem de teste que funcionou no S4**: (a) `Mirrors-of-Emotions-Start` → `?src=music`, abrir a
   consola: **zero EXCEPTION**; (b) `m` = HUD; (c) queixa de sync → gravar → replay → **só então**
   afinar; (d) isolar "piscar" pondo os 3 toggles `motor manda` a 0, um de cada vez.
6. **Onde o estado persiste**: `localStorage['mb.knobs']` (knobs), `['mb.dbgSize']` (painel),
   `['mb.explode']` (on/off), e `music-config.json` via `POST /app-config` — **só quando a página é
   servida pelo sidecar**; caso contrário `TUNE_STATE.canSave = false` e o painel explica porquê.
   Os painéis `d` e `k` escrevem no **mesmo** ficheiro (o `d` na secção `ball`).
7. **Depois de atualizar o ficheiro, "repor knobs" antes de julgar** — os guardados sobrepõem-se
   aos defaults novos da versão.

### 3.4 `docs/DESIGN-RULES.md`

As regras que o David fixou e que hoje só existem em prosa de handoff. Cada uma com **porquê**,
para não serem reabertas.

- **As 7 do `CLAUDE.md`** (skin é do utilizador; rpm segue o bombo; bombo por banda; densidade →
  atividade; gestos teatrais, "subtil" lê-se como "fraco"; tetos invioláveis; `NaN` mata feixes).
- **Rig (S3)**: focos não pulsam de tamanho nem varrem a superfície (fisicamente impossível com
  pinspot fixo); nunca fonte de cima a direito nem do lado do público; fontes ao nível do equador,
  laterais/frente; um espelho reflete para perto da fonte → feixes "à cara" só com |az| ≲ 25°;
  tem de haver **luz indireta permanente** (nunca "focos ou nada").
- **Design de luz (S4)**: em GROOVE calmo (`act < 0.45`) os focos ficam **still**; flashes GROOVE
  por bombo 0.06 (era 0.30), tarola 0.15 (era 1), rajada de 3 só na família do drop; estrobos "a
  espaços como num clube" (24-48 compassos, `act ≥ 0.6`, 35% em rajada); cenas de feixes
  full/few/none; `haze máx` e `feixes: fração máx` são **tetos do David** e o motor modula por
  dentro; ganhos dos focos no ficheiro (dominante 1.0, outros 0.85).
- **Rig do S4 substitui o research**: focos fixos a `az ±28°, el 12-14°`; saltos com `|az| 12-110°`
  (estavam a +104/−129 → tudo para trás). **Anotar que isto contradiz
  `research/lighting-design.md` e que o S4 manda.**
- **Nota de origem** para cada regra (handoff + data), para se saber de onde veio.

### 3.5 `docs/STATE.md`

Meia página, o ficheiro que uma sessão nova lê primeiro:
- Versão atual (`music.js?v=58`), commit, harness 15/16.
- O que funciona hoje (uma lista curta).
- **O que está por julgar** — as 4 alíneas do "próximo passo" do S4: (1) David ouve 20 min seguidos
  e julga estrobos/cenas/explosão; (2) se ainda "piscar" em GROOVE, suspeito é o tique dos agudos;
  (3) explosão ainda não vista ao vivo; (4) medir `frame ms` com `pontos na parede` alto + 4 focos.
- O spike Babylon.js em avaliação (`spike-babylon/`, criado 2026-08-29 22:44).
- Links para o handoff mais recente e para o HTML.

---

## 4. Fase 2 — O HTML

`docs/mirrorball-docs.html` — ficheiro único, **offline (zero CDN)**, tema escuro greyscale a
condizer com a bola, três abas:

- **Arquitetura** — diagrama em **SVG inline desenhado à mão** (não imagem, não biblioteca):
  a cadeia WASAPI → sidecar → os 2 caminhos de transporte → `music.js` → CONFIG → render, com os
  3 donos (manual/câmara/música) e o ramo ESP32. Legenda clicável que salta para a secção de texto.
- **Manual do operador** — as duas partes do `OPERATOR.md`. A tabela de knobs leva **filtro de
  texto** (são 54 — procurar é obrigatório); a tabela sintoma→knob fica no topo.
- **Info técnica** — o `REFERENCE.md`: contrato do sidecar, CONFIG, teclas, API, FSM, gestos, HUD,
  testes, e a secção "o que se usa para afinar" (`cap.js`, `replay-real`, `tuner-lab`, harness,
  uPlot MIT vendorizado, Node ≥ 22 sem `package.json` e porquê).

Abre por `file://` (duplo-clique). **Nota a incluir no próprio doc:** o sidecar serve `web/`
achatado, sem subpastas — por isso `docs/mirrorball-docs.html` **não** é servido em
`/app/…`; abre-se direto do disco.

---

## 5. Fase 3 — Arrumação

**Reescrever `README.md` de raiz**: o que o projeto é hoje (bola de espelhos, Canvas 2D, greyscale,
que reage a **música** · emoções por webcam · sliders), como arrancar cada modo (os 5 `.bat`, as
duas portas), link para `docs/mirrorball-docs.html` e para `docs/STATE.md`, e a secção de hardware
ESP32 reduzida e marcada **não testada** (Fase 9 nunca feita).

**Mover** com `git mv` (preserva histórico):
- `docs/plan.md` → `docs/history/plan-v2-2026-08-28.md`
- `docs/handoff-*.md` (4) → `docs/history/`
- `docs/beat-detection-research.md` → `docs/research/beat-detection.md`
- `docs/lighting-design-research.md` → `docs/research/lighting-design.md`

Cabeçalho novo em cada um: *"Documento histórico (<data>). O estado atual está em `docs/STATE.md`;
a arquitetura em `docs/ARCHITECTURE.md`."* No `plan-v2` acrescentar aviso explícito de que a §2.2
(grelha vinda do sidecar) **não** descreve o sistema construído.
No `research/beat-detection.md`: nota de que as lacunas da tabela §0 já foram aplicadas no S4.
No `research/lighting-design.md`: nota de que o rig final é o do S4 (`az ±28°`), não o do research.

**Copiar** `~\Downloads\mirrorball-painel-d-knobs-2026-08-29.md` para dentro do repo (fica absorvido
pelo `OPERATOR.md`; o original pode ficar onde está).

**Apagar / arrumar:**
- `git rm "tools/feat" "tools/feat - eletronico" "tools/feat-jazz"` (~4.5 MB).
- `mirrorball-A-white.html` (raiz, mockup histórico órfão, 22 KB) → `docs/history/` (proposta) ou apagar.
- `web/index.html` + `web/emotion.js` (v1 legado): **perguntar ao David**; proposta = manter e
  marcar como legado no README, já que `MirrorBall-Start-v1.bat` ainda os abre.
- **NÃO TOCAR**: `web/vendor-uPlot.iife.min.js` e `web/feat-sample.json`. Parecem duplicados
  (md5 idêntico às cópias em `web/vendor/` e `tools/`) mas **são intencionais e documentados** — o
  sidecar serve `web/` achatado, sem subpastas. Removê-los parte o `tuner-lab`.
- **NÃO MOVER nenhum ficheiro de `web/`** pela mesma razão.

**`.gitignore`** (hoje só tem `node_modules/` e `*.log`) passa a cobrir:
`spike-babylon/vendor/`, gravações novas (`tools/feat-*.json` exceto as mantidas), e uma nota sobre
`web/music-config.json` — fica tracked, mas é reescrito em runtime pelos painéis e aparece **sempre**
como modificado.

**`CLAUDE.md`**: corrigir a linha do beat-detection ("por aplicar" → aplicado no S4); apontar o
layout novo de `docs/`; trocar "ler o handoff primeiro" por "ler `docs/STATE.md`".

**agent-os** (`C:\Users\JSJ\David\AI\A-Os\AOS-ProfitRoom\agent-os`, branch
`Dashboard-claude-CLISessionON`, **não pushed**): apagar os 3 `.md` duplicados de `docs/` e criar
`agent-os/docs/mirrors-emotions.md` (~10 linhas) a apontar para este repo, dizendo que o **sidecar
vive no agent-os** (`audio-sidecar/`, :3739) e o **motor vive no MirrorBall**, e listando os
ficheiros do OS que o projeto toca.

---

## 6. Ficheiros

**Leitura** (já mapeados — não é preciso reexplorar, só confirmar ao escrever):
`web/index-v2.html` (CONFIG 68-172, API 723-769, sliders 774-831, persistência 844-856, teclas 894-898),
`web/music.js` (contrato 28-41, driver 997-1021, FSM 1876-1957, gestos 1754-1784,
applyToBall 2080-2149, update 2152-2258, HUD 2414-2474),
`web/core.js:26-52`, `web/bridge.js`, `web/tuner.js:222`,
`agent-os/audio-sidecar/server.js`, `tools/README.md`,
`~\Downloads\mirrorball-painel-d-knobs-2026-08-29.md`.

**Escrita**: os 5 `.md` novos + o HTML + `README.md` + `CLAUDE.md` + `.gitignore`, mais os
`git mv` / `git rm`, mais os 2 ficheiros do agent-os.

---

## 7. Verificação

1. `docs/mirrorball-docs.html` abre por duplo-clique (`file://`) — as 3 abas trocam, o SVG lê-se, o
   filtro de knobs funciona, e em janela estreita nada transborda.
2. **Amostragem contra o código**: abrir a bola com `?src=music`, carregar `d` e conferir 5 knobs à
   sorte (label, range, default) contra a tabela; carregar `m` e confirmar que as 14 linhas do HUD
   estão descritas pela ordem certa.
3. `node web/test-music-f2.js` → **15/16** (a falha pré-existente, inalterada — nenhum código de
   motor é tocado neste trabalho).
4. `git status` limpo salvo `web/music-config.json`; `git log --stat` mostra os `mv` como **renames**
   (histórico preservado).
5. O repo encolhe ~4.5 MB.
6. **Sanidade de arranque**: `Mirrors-of-Emotions-Start` → consola sem EXCEPTION, bola reage à
   música. Confirma que a arrumação não partiu caminhos (nenhum ficheiro de `web/` é movido, por
   isso não deve haver risco).
7. No agent-os: `git status` mostra os 3 `.md` apagados + o ponteiro novo; o OS arranca e a tab
   `/mirrors-emotions` continua a funcionar (nenhum código foi tocado lá).

---

## 8. Fora de âmbito (deliberadamente)

- **Não se toca** em `music.js`, `index-v2.html` nem em nenhum comportamento da bola.
- Não se move o sidecar para este repo (decisão 2).
- Não se resolvem os caminhos hardcoded (`server.js:66`, `mirrorsEmotions.ts:16`) — ficam
  **documentados** como atrito conhecido.
- Não se escreve ficha nova no vault Obsidian nem se mexe no Hindsight — podem vir depois, com os
  docs já estáveis como fonte.
- Não se faz push do branch do agent-os (continua não pushed, como estava).
