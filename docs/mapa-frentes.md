# Mapa de frentes — MirrorBall (documento vivo)

**Para quê:** saber, em cada sessão, (1) que frentes existem e onde vivem no código, (2) o que está
maduro e o que está em dívida, (3) **onde se pode mexer sem partir o resto** — as fronteiras entre
frentes e o que já partiu quando alguém as atravessou. É o índice; o arquivo está nos docs apontados.
Não repete o CLAUDE.md nem os handoffs — aponta para eles.

**Criado:** 2026-09-01 (estado = S11, commit `a1f8514`). Última revisão: 2026-09-01.

---

## 0. O mapa em 30 segundos

| Frente | O que é | Estado | Maior dívida | Próximo passo |
|---|---|---|---|---|
| **A · Motor de música & sync** | sidecar → `music.js` (kick/grelha/FSM/gestos) → `MUSIC.state` → peças da sala; estrelato (`stardom.js`) | **em dívida** — motor sólido; **S1 feito (W3, S14)**: relógio único `§CLOCK` em `MUSIC.state` (`beatTick/barTick/phraseTick`, `beatIdx` 0-3, `barIdx` 0-7, `clockConf`, `clockAgeMs`, `clockSrc`), degrada para o bombo 4/4 sem grelha, `state.bar` já não congela; knobs `sync.phraseBars` (8) e `sync.gridMinConf` (0.30); HUD `m` linha "relógio"; harness 19/20. **S2 feito (W4, S14)**: estrelato com hero×FSM, trocas só em `barTick`/`phraseTick`, acentos dos chapéus em `beatTick`, reserva do all-on como estado, `act` lido; relógio lido do contrato S1 com fallback derivado (`readClock`) | chapéus/mikado ainda com relógios próprios (S3); knobs `sync.*` do S2 vivem em `MUSIC.config.sync` via `tuner.js` (localStorage) até o §TUNE do `music.js` os adotar | validar S2 com `replay-real.js` (trocas/min, % drops com mudança); stop do David: HUD `m` com música real — os ticks batem com o bombo? → S3a chapéus |
| **B · Motor visual & render** | Babylon 9, WebGPU/WebGL2, malha da bola + cadeia de cinza, probe, thin instances, pós, realismo | **maduro, perf em dívida** — V0 (freeze) e V1 (losango) feitos (S13); leitura ao vivo: ~30 ms manual, **+40 ms em modo música** dentro do `scene.render` (`f17-visual.md` §0.5); máquina degradada, baseline limpa por repetir; **V6 feito (S14)**: mikado em thin instances, 672 → 4 meshes, cor por instância, sem materiais escritos por frame | custo do modo música (suspeita: recompilação de shaders por luzes, armadilha 5); sem névoa real; sem sombras; renderList do probe ~720 meshes (era 1391) | **W1 V0b** (porquê +40 ms) · **W2** fog+exposição · **W5** sombras — em paralelo na janela Fable (handoff S13 §0); V6 por ver ao vivo (probe/greyscale/liga-desliga) |
| **C · Elementos físicos** | bola, corrente, mikado, chapéus, robots, vultos, sala/pilares — geometria e knobs ⟳ | **em evolução** — tudo existe, tudo por afinar ao vivo | estética "à sensação" (barras, vultos, chapéus); posição↔mira dos focos (regra 3) | afinar com o David com música real; separar posição↔mira |
| **D · Luminárias & ambiente** | spots montados, feixes, dots, haze, wash, incidentes, flashes/strobe, choreo | **maduro** na bola, **em dívida** na coreografia da sala | choreo com relógios próprios; chapéus com duplo comando; 3 donos do `spotGain` | fica à espera do plano de sync (é a frente que ele mais toca) |
| **E · Controlo, presets & UX** | painel `d`, **200** knobs (K1: +7), `mb2.*`, presets, `RENAMED`, disjuntores | **maduro** (auditado 2×, regra 9 com bateria) | `MANUAL.html` desatualizado; snapshot do localStorage em baterias | K2 (Fable): contrato "todo knob nasce em config" para as fases S/V |

**Ajuste aos 4 eixos do David:** acrescentei a frente **E (controlo/UX)** porque tem regras próprias
(regra 9, disjuntores, toggles 0/1, `RENAMED` só cresce), já partiu coisas sozinha (knobs órfãos,
localStorage perdido, knob morto) e é a fronteira que mais vezes foi atravessada por engano. O
**estrelato** (`stardom.js`) fica na frente A e não na D: resolve "quem toca", que é sync, e é dele
que o plano de sync vai partir. Tudo o resto bate certo com o que o David nomeou.

**Fora das frentes (infra):** `spike-babylon/serve.py` (:8099, proxy `/app-token` para o sidecar),
os `.bat`, e a bola Canvas 2D `web/index-v2.html` — que continua a ser a bola do OS e partilha o
`music.js` com o spike. Mexer em `music.js` toca **as duas** bolas.

---

## 1. Mapa de contratos — quem escreve o quê, quem lê o quê

Este é o coração do "não partir". Um número com **dois donos** é a assinatura de quase todos os bugs
deste repo (opacidade F13, chapéus, `spotFadeMix` a 60 Hz, `spotGain`).

```
 audio-sidecar :3739 (repo agent-os)          [fora deste repo]
   │ postMessage 'features' 50 Hz  {rms,bass,mid,high,sub,hat,centroid,density,onset,subOnset,*Raw,loudness,silence}
   ▼
 web/music.js  ──── só ESCREVE no CONFIG se MB_SOURCE.owner === 'music' ────┐
   │ publica window.MUSIC.state (POLL, ninguém subscreve)                    │ escreve: rotationRpm, haze, beamFraction/Intensity,
   │  fsm · bar · beatPhase · bpmEst(=PERÍODO ms!) · gridConf · kickFlash    │          sphereOpacity, spots[i].intensity (setSpot),
   │  snareCount/dropCount (monotónicos) · snareAccent · act · subAvg        │          setHealth, flash/strobe {fromMotor:true}
   ▼                                                                         ▼
 leitores (poll por frame):                                     window.MIRRORBALL (main.js:1566) ──► CONFIG (config.js)
   stardom.js  → CONFIG.stardom.gain.{ball,mikado,hats,wash}                       ▲ disjuntores: beamsMotor / opacityMotor / spotsMotor
   mikado.js   → snare/drop deltas → rajadas                                       │ motorAllowed(kind,{fromMotor}) main.js:1479
   crowd.js    → beatPhase/bpmEst/gridConf/kickFlash → dança                       │
   hats.js     → NADA do motor (Poisson próprio) + hats.pulse() via stardom         │ painel d (panel.js) escreve CONFIG diretamente
                                                                                   │ e persiste em localStorage mb2.*
 main.js (rAF Babylon, ordem em main.js:1733-1775):
   effective()/health → E{spotGain,sphereOpacity,rotationRpm,...}
   ball.update(tSec, CONFIG.spots, E)  → ball.mountedSpots  (FONTE ÚNICA dos focos deste frame)
   updateSpotLights → beams.update(E) → incident.update(mountedSpots) → dots.update(E)
   → fixtures.update(mountedSpots) → hats → robots → mikado → crowd
```

| Contrato | Quem escreve | Quem lê | Armadilhas conhecidas |
|---|---|---|---|
| **features 50 Hz** (postMessage) | sidecar (ou gerador `g`) | `music.js` `onMessage` (:981) | bandas em dB próprio — **nunca** normalizar umas contra as outras (`bass≡1.0`); `onset` normalizado é inútil como limiar → usar `subFluxRaw/hatFluxRaw`; campos `*Raw` podem faltar |
| **`MUSIC.state`** (`music.js:818`, exposto em :2534) | só `music.js` | stardom, mikado, crowd (poll) | `bpmEst` é **período em ms**, não BPM · `kickFlash` (não `kickCount`) · `state.bar` **congela** com grelha velha >4 s · `act` publicado, **ninguém lê** (regra 4 não chega à sala) · `subAvg` nasce `null` |
| **`MB_SOURCE.owner`** (`core.js`) | `?src=` / postMessage `{type:'source'}` | `music.js` (`onOwnerChange` :2067), `emotion-v2.js` | só o dono escreve no CONFIG; `manual` = ninguém escreve. Ao ganhar posse parte dos valores atuais e rampa |
| **`window.MIRRORBALL`** (`main.js:1566`; 2D em `index-v2.html:723`) | main.js cria; motor chama | `music.js` (lê ao carregar — daí o evento `mb2-ready`) | `setSpot/flash/strobe` passam por `motorAllowed` **só se** levarem `{fromMotor:true}`; `retarget` não tem caller no motor; `explode` não passa por `motorAllowed` (corte real = `explodeEnabled`) |
| **`CONFIG`** (`config.js`) | painel, motor (se dono), stardom (só `stardom.gain`), `preApplyReloadKnobs` | todos os módulos | `ballR` e `ballYEffective` são fonte única de Ø e cota; `beamLen3D` só semente do `?mini`; todo o knob novo com valor inicial finito (regra 7) |
| **`ball.mountedSpots`** | só `ball.update` | updateSpotLights, beams, incident, dots, fixtures | ordem: focos → flashes → indireta; raio já com `spotRadiusMul` (exceto flashes); ler **depois** de `ball.update` no mesmo frame |
| **`CONFIG.stardom.gain`** | só `stardom.js` | main (spotGain, wash), mikado (repouso), hats (força), crowd (luminosidade) | canal novo de propósito — o estrelato **nunca** escreve nos knobs do motor; chapéus são o único comandado por chamada (`hats.pulse`) |
| **`E` (estado efetivo do frame)** | `effective()` em main.js | ball, beams, dots, fixtures | `spotGain` tem 3 donos em série (health → ballOn → estrelato) — resultado não atribuível; com `opacityMotor=false` a opacidade é o slider **literal** (F13 §2) |
| **localStorage `mb2.*`** (`panel.js:40-44`) | só panel.js | panel.js no arranque | prioridade `mb2.knobs > knobs-default.json > config.js`; **ganha aos defaults novos** (se o David vê valores velhos: "repor knobs"); baterias **têm** de fazer snapshot/restore |
| **probe renderList** (`ball.attachProbe`, main.js:824) | main.js, uma vez | ReflectionProbe RENDER_ONCE | só meshes reais (TransformNode rebenta); todo o PBR novo com `RawCubeTexture` própria; refresh só por `refreshProbe()` |

---

## 2. As frentes

### A · Motor de música & qualidade do sync

**O que é.** O "técnico de luz": recebe features do sidecar, deteta bombo/tarola/grelha, corre a FSM
(GROOVE/BUILD/BREAKDOWN/PRE_DROP/DROP), escolhe gestos teatrais e escreve nos knobs da bola. Desde a
F12 inclui o estrelato — quem é a peça principal da sala em cada secção. Objetivo (`plan.md` §0):
recriar o que o David sente num clube, **não** um visualizador.

**Onde vive.**
- `web/music.js` (2636 linhas; contrato no cabeçalho :1-57): `MB_CLOCK` :65 · `MUSIC` config :108 ·
  `state` :818 · `onMessage` :981 · §BANDONSET :1137 · §SNARE :1229 · §KICK :1290 · §PROFAUTO :1393 ·
  §GRID :1485 · Camada 2 :1653 · §GESTURES :1757 · FSM :1870 · Camada 1 :1969 · arbitragem+escrita
  :2066 (`applyToBall` :2083) · loop + `spinLock` :2171-2264 · gerador `g` :2299 · HUD `m` :2407 ·
  `window.MUSIC` :2534.
- `spike-babylon/v2/stardom.js` (poll em :193-215; ramo sem motor :306).
- `web/core.js` (`MB_SOURCE`), `web/test-music-f2.js` (harness), `web/replay-real.js` (replay de
  features gravadas), `web/music-config.json` (**nunca commitar**).
- Fora do repo: `agent-os/audio-sidecar/` (:3739).

**Estado: em dívida.** O motor em si está maduro (kick por banda, grelha local, FSM, 8 gestos,
perfil automático — 3 audições do David). O **sync da sala não existe** como sistema:
`docs/audit-sync-motor.md` mediu 0 trocas de estrela em 60 s sem grelha, 29% dos drops sem mudança
visível, nenhuma peça (exceto vultos) a ler `beatPhase`.

**Contratos.** Publica `MUSIC.state` e escreve no CONFIG via `MIRRORBALL` (tabela §1). Consome
features 50 Hz e `MB_SOURCE.owner`. O estrelato publica `CONFIG.stardom.gain`.

**Seguro vs frágil.**
- Seguro: afinar valores em `MUSIC` (tudo tem knob no `tuner`/`music-config.json`); acrescentar
  campos a `state` **com valor inicial finito**; acrescentar leitores por poll (padrão F11/F12 —
  zero linhas em `music.js`).
- Frágil: **renomear/remover campos de `state`** (os leitores são poll silencioso — a F15 inventou
  `state.bpm`/`kickCount`, não existiam, e a pista ficava muda **sem erro na consola**); tocar em
  `applyToBall` sem passar pelos disjuntores; qualquer write incondicional a 60 Hz no CONFIG
  (foi o `spotFadeMix`); mexer em `spinLock` (regra 2 — só existe no perfil `electronica`, medido
  rpm 0.06 em silêncio noutros).
- Cache-buster: alterar `music.js` = bump `music.js?v=N` em `web/index-v2.html`.

**O que já partiu aqui.** NaN num knob novo matou os feixes em silêncio (regra 7) · `bass≡1.0` por
normalizar bandas entre si · `spotFadeMix`/`flashRate` apagados a 60 Hz (`audit-knobs.md` §1.6) ·
`fromMotor` só no `explode` → disjuntor `spotsMotor` não cortava flash/strobe (§1.7) · campos
inventados em F15 · health a 0 no silêncio arrastava a opacidade (F13 §2, dois donos).

**Dívidas abertas.** Sem relógio comum / quantização ("quando"); `act` não chega à sala; `state.bar`
congela; estrelato inalcançável sem grelha (`if (!MS)` nunca é verdade com music.js carregado);
`biasHats 2.65` dá 58% dos drops aos chapéus; metade do motor está desligada pelo David
(`beamsMotor:false`, `opacityMotor:false`) — o que resta é spots+rpm.

**Próximo.** O debate do plano de sync (handoff S11): ler `audit-sync-motor.md` e depois
`research-lighting-pro.md` §4 (7 propostas: hero por secção, reserva ativa, blackout pré-drop,
memória de assinatura, ball↔energia lenta, disciplina do mikado, chapéus=narrador rítmico). Fixar o
plano em `docs/`, só depois implementar (Opus). Referência por aplicar: `beat-detection-research.md`.

### B · Motor visual & render

**O que é.** A máquina que desenha: Babylon 9.23 vendorizado, WebGPU com fallback `?webgl=1`, malha
de facetas com cadeia de cinza em CPU → vertex color (20 Hz) sobre PBR, ReflectionProbe RENDER_ONCE,
thin instances (feixes, dots, corrente), `DefaultRenderingPipeline` (bloom/grão/vinheta/ACES).

**Onde vive.** `spike-babylon/v2/main.js` (arranque, ordem de update :1733-1775, `effective()`,
`preApplyReloadKnobs` :249, exclusões de luz :912/:945, `MB2` :1858) · `ball.js` (cabeçalho :1-55
diz o que faz e o que **não** faz; `computeColors` é o único loop pesado) · `beams.js` · `dots.js` ·
`incident.js` · `explode.js` · `colorutil.js` · `room.js` (materiais) · `vendor/babylon.js`.
Referência: `docs/babylon-reference.md` (armadilhas medidas), `docs/parity-canvas2d.md`,
`docs/research-gpu-offload.md` (o que vale e não vale a pena mover para GPU),
`docs/research-realismo.md` (como gastar os ~13 ms de margem para "parecer aquilo": tabela-mestra
§4, fases R1-R5 §5, o que **não** fazer §6 — SSR, frame-graph volumétrico, god rays a 957 ms).

**Estado: maduro, perf por medir.** Bola e espelhos aprovados pelo David (S9). Baseline conhecida
7,8-11,9 ms (alvo < 17,5) mas **5 fases seguidas sem medição limpa** — a automação mente
(`document.hidden`), e `scene.render()` forçado já matou o renderer duas vezes.

**Contratos.** Consome `CONFIG`, `E`, `ball.mountedSpots`, `ball.beams`/`ball.dots` (fonte no
`ball.js`, desenho nos módulos). Publica `window.MB2` (diagnóstico: `__perf()`, `scene`, `cfg`).

**Seguro vs frágil.**
- Seguro: knobs de pós, materiais da bola (`Espelhos & PBR`), `freezeWorldMatrix` em estáticos,
  mutar `.set()` em Color3 existentes.
- Frágil (cada linha abaixo já custou uma sessão):
  1. **PBR novo sem `reflectionTexture` própria** → cai no `environmentTexture` = cubo do probe →
     ciclo → **tudo preto** (S8) ou osso branco (S9). Padrão: `RawCubeTexture` 1×1 quase preta.
  2. **Thin instance com count=0 não esconde a mesh base** em WebGPU → polígono branco gigante
     (S9). `setEnabled` acompanha sempre o count.
  3. **`TransformNode` na renderList do probe** rebenta (`_currentLOD`) — só meshes reais.
  4. **Reatribuir `material.emissiveColor = new Color3()`** por frame = +73 ms (recompila shader).
  5. `maxSimultaneousLights: 12` em materiais que mudam o nº de luzes recompila shaders (+7-17 ms);
     WebGL2 rebenta o shader com >8-12 PointLights → `MAX_LIVE_LIGHTS=4` (chapéus/vultos).
  6. `needAlphaBlending` override ignorado em WebGPU → `transparencyMode = MATERIAL_ALPHABLEND`.
  7. SpotLights fortes sem `excludedMeshes` nos planos → "parede de luz" (S9).
  8. Medir com o tab **à frente**; `getDeltaTime()` e FPS reportado mentem em background;
     `ball.update` só corre a 20 Hz (`COLOR_HZ`) — bench com passo < 50 ms mede zeros.
  9. `const` na TDZ: até `typeof` atira (`audit-knobs.md` §1.4).

**Dívidas.** Perf limpa; renderList do probe fixa no `attachProbe` (1391 meshes, cresce a cada
fase — refazer no `rebuild()`); pool do probe/`refreshProbe()` caro ao arrastar sliders de geometria;
mikado já em thin instances (V6, S14: 4 meshes base; G3 do research fechado); grão estático; "disco
branco de frente" mitigado por ACES, ideia `(1−Rz)^k` por fazer.

**Próximo.** G1+G2 do `research-gpu-offload.md` §7: `freezeWorldMatrix` na sala (2 linhas) + baseline
medida no pior caso (sala-toda + Ø3,0 + 80 vultos). Só depois decidir G3. Em paralelo, as fases
baratas do realismo (`research-realismo.md` §5): R1 dots em quadrado/losango (`dots.js:44`, herdam
a forma da faceta), R2 `scene.fogMode` nativo com knob, R3 exposição/`ColorCurves` — todas ~0 ms e
reversíveis numa linha; R4 (`tileTone:'real'` como default) é decisão estética do David; R5
(sombras em 2-4 luzes hero) só depois, é a única com custo e risco técnico novo.

### C · Elementos físicos

**O que é.** O que existe na sala como objeto: bola (Ø, cota, X/Z, corrente, explosão), mikado
(40 barras, clareira), 12 chapéus, 4 robots, vultos (pool 80), sala 15×11×5,5 com 6 pilares e
corredores invariantes, corpos PAR36 dos focos. Fonte de verdade da sala: `docs/f8-sala-lux.md`.

**Onde vive.** `ball.js` (malha, corrente `buildChain`, `applyHeight`, `chainGen`) · `mikado.js`
(`generate`/`regroup`/`layout`/`restoreEnabled`) · `hats.js` · `robots.js` · `crowd.js` · `room.js`
· `fixtures.js` · `explode.js` · geometria em `config.js` + `preApplyReloadKnobs` (main.js:249) ·
`ballCenter()` main.js:551. Docs por fase: `f8-sala-lux.md`, `f11-mikado.md`, `f12-estrelato.md`
(§1 densidade, §3 cota, §4 chapéus), `f13-ajustes.md` (§1 sala-toda, §3 Ø), `f14-bola-xy.md`,
`f15-vultos.md`.

**Estado: em evolução.** Tudo o que o David pediu existe e está commitado (F8-F15). Quase nada foi
afinado ao vivo com música real — as proporções de barras/vultos/chapéus são "à sensação".

**Contratos.** Publica meshes para a renderList do probe (sempre meshes reais) e, nos chapéus/robots,
`lights` para o main excluir a bola. Consome `CONFIG` (⟳ via `preApplyReloadKnobs` **antes** de
construir), `CONFIG.ballR`/`ballYEffective`/`ballCenter()` (clareira, corrente, probe, mira seguem),
`stardom.gain`. Regras fixas: só o David liga/desliga elementos (o motor nunca); focos com **posição
fixa** (só mira/dimmer variam; nunca luz de baixo); pilar desligado não é obstáculo.

**Seguro vs frágil.**
- Seguro: knobs de estética (Ø tubo, semente, altura, densidade), `regroup` do mikado (não move
  barras), refletividades por superfície (dots imunes).
- Frágil: **ordem de aplicação** — cota da bola tem de passar por `ball.applyHeight()` e
  `CONFIG.ballYEffective` antes de o mikado regenerar (F12 armadilha 1); qualquer `setEnabled(false)`
  precisa do par simétrico que **volta a ligar** (`restoreEnabled` — F11; corrente F12); caches por
  contagem de meshes ficam velhas quando a mesh é reconstruída (`chainGen`, `purgeDeadExclusions`);
  knobs ⟳ só se aplicam via `preApplyReloadKnobs`; `generate()` re-sorteia tudo — não o chamar para
  mudar agrupamentos.

**O que já partiu aqui.** Mikado invisível para sempre após 1→0→1 · corrente nova a nascer visível
com a bola desligada + fuga em `excludedMeshes` · clareira com a cota do frame anterior · `tam. bloco`
re-sorteava o mikado · banner "dimensões mudaram" falso (eliminado F13) · knobs ⟳ nunca aplicados no
reload (F10) · corredores laterais não levam bola Ø2 (2,25 < 2,60 m) · pan da câmara anulado pelo
seguimento da bola (`a1f8514`).

**Dívidas.** Separação posição↔mira dos focos (choreo ainda move o corpo — viola regra 3; toca
choreo/main/ball/fixtures); adiados pelo David: cortina LED, bar retroiluminado, cortina vermelha,
alternar bola↔mikado como peça central; `vultos: densidade` satura no pool (80); `corte da pala°`
só-reload; blocos do mikado por índice e não por zona; `lampDiameter` só no arranque; MANUAL (F7).

**Próximo.** Afinar ao vivo com o David (primeiro knob: sementes); depois posição↔mira quando o plano
de sync o pedir.

### D · Luminárias & ambiente

**O que é.** A maquinaria que produz o ambiente: spots que incidem na bola (mancha, fade, coreografia
apaga→salta→acende, flashes Poisson), feixes refletidos (≤0,18), pontos nas paredes, cone incidente,
haze, wash azul, luz indireta, estrobo de fundo, flashes dos chapéus/mikado, cones dos robots.

**Onde vive.** `choreo.js` (porte verbatim da 2D: `step`, `retarget`, `flash`) · `beams.js` ·
`dots.js` · `incident.js` · `fixtures.js` · main.js (`updateSpotLights` :559, `updateAmbientLights`,
wash :632-652, `fireStrobe`, `effective()`) · a parte "luz" de `hats.js`/`mikado.js`/`robots.js` ·
`music.js` `applyToBall` :2083-2167 (é o motor que manda nos spots quando é dono).

**Estado: maduro na bola, em dívida na sala.** A luz da bola está verificada (tetos medidos: 0,148
de 0,18; 2,34 rpm; mikado 2,8 Hz). A **coreografia da sala** é o que "soa aleatório": cada
luminária tem o seu relógio (Poisson choreo, dwell 4-12 s, Poisson chapéus 22/min, onda `seqStepMs`,
Poisson mikado 4/min…) — `audit-sync-motor.md` (c).

**Contratos.** Consome `ball.mountedSpots` (nunca `CONFIG.spots` diretamente), `E`, `stardom.gain`,
`MUSIC.state` (mikado/chapéus via stardom). Publica `choreo.flashes`/`gainOf(i)` para o `ball.js`.
Disjuntores: `spotsMotor` (spots, flash, strobe, `spotFadeMix`, `flashRate`), `beamsMotor`
(feixes+haze), `opacityMotor`. Tetos: `BEAM_INTENSITY_MAX` cozido em `beams.js`; 3 Hz com clamp
duplo (`MIN_GAP_S` no mikado, `minGapMs` no strobe).

**Seguro vs frágil.**
- Seguro: intensidades/óptica/cor dos focos, `feixes: comprimento`, densidade dos pontos, wash,
  refletividades — tudo knob, tudo dentro dos tetos por construção.
- Frágil: **escrever num knob que o motor também escreve** (dois donos — verificar os disjuntores);
  chapéus têm **dois escritores** (onda contínua em `hats.update` + `hats.pulse` do estrelato);
  `E.spotGain` com 3 donos; halo com 0 focos ficava aceso (S9); `spotDist` que atira a fonte para
  fora da sala (`clampToRoom`); `feixes: compr. 3D` era decorativo (removido — o `?mini` ainda usa a
  chave).

**O que já partiu aqui.** NaN matou feixes · `spotFadeMix`/`flashRate` apagados a 60 Hz · auréola
opaca (WebGPU) · parede de luz · disco branco frontal (somas aditivas) · `espelhos: brilho = 0` no
localStorage do David (bola a viver da parede torrada) · disjuntor furado (`fromMotor`).

**Dívidas.** Quantização das luminárias ao compasso (é a frente que o plano de sync vai reescrever);
duplo comando dos chapéus; 3 donos do `spotGain`; posição↔mira (partilhada com C); `incidente: cone
largura máx` impercetível; `MB.retarget` sem caller no motor.

**Próximo.** Não mexer antes do debate — qualquer afinação aqui é trabalho perdido se a hierarquia
de "quem toca quando" mudar.

### E · Controlo, presets & UX

**O que é.** O painel `d`/`k` (14 grupos por elemento, 7 favoritos), **200** knobs persistíveis
(K1, 2026-09-01: +7 — pools/buffers de mikado/vultos/chapéus, albedo base da sala, cadência da
cadeia de cinza da bola), presets F13.5 (knobs+câmara, auto-shuffle), ficheiro
`mb2-knobs.json`/`music-config.json`, o `tuner` do motor (`m`), teclas, HUD `h`. Regra 9 do
CLAUDE.md vive aqui.

**Onde vive.** `panel.js` (chaves `mb2.*` :40-44 · `RENAMED` :75 · `resolveName` :102 · `migrate`
:107 · `PERSIST` :254 · `sanitizePreset` :1147) · `gen-knobs-default.js` → `knobs-default.json`
(**gerado**, nunca à mão) · `config.js` (defaults) · teclas em main.js (guards INPUT/TEXTAREA) ·
`web/tuner.js` (knobs do motor). Docs: `audit-knobs.md`, `ux-painel.md`, `f13-ajustes.md`
(presets: formato, decisões), `f15-vultos.md` §7 (bateria da regra 9).

**Estado: maduro.** Duas auditorias Opus + reorganização UX, zero toggles invertidos (0=off/1=on nos
28), bateria da regra 9 verificada ao vivo com nomes antigos, cadeias de rename, lixo e removidos.

**Contratos.** Escreve `CONFIG` diretamente (dono `manual`) e persiste `mb2.knobs/knobsTouched/
toggles/presets/presetsUi/panelOn/dbgOpen/explode`. Expõe `MIRRORBALL.knobs.get/set` (o `set` só
preenche knobs **nunca tocados** — `mb2.knobsTouched`). Hooks para a cena (`onMikadoGeomChanged`,
`onMikadoRegroup`, `onBallHeightChanged`…). Regra: nomes dos sliders **são** as chaves do
localStorage e dos ficheiros.

**Seguro vs frágil.**
- Seguro: mover knobs entre grupos, favoritos, ordem, ranges/steps, acrescentar knob novo (default
  finito + entrar no `PERSIST` se for afinação).
- Frágil: **renomear um slider** sem entrada no `RENAMED` (órfão silencioso); **apagar** uma entrada
  do `RENAMED` (só cresce); `sanitizePreset` a rejeitar por campos em falta; `PERSIST` por `slice`
  exclusivo (o `rotationRpm` caía fora); hooks que chamam `rebuild()` para o que só precisa de
  regroup; teclas sem guard de campo (`0`, `w`); baterias que plantam `mb2.*` **sem snapshot**;
  editar `knobs-default.json` à mão.

**O que já partiu aqui.** Knobs órfãos por rename (S8 → nasceu o `RENAMED`) · `rotationRpm` não
persistia · localStorage real do David **sobrescrito** pela bateria UX (afinações não exportadas
perdidas) · `feixes: compr. 3D` morto · knob de opacidade sem persistir · grupo do painel fechava-se
ao reabrir · `0`/`w` a disparar dentro de campos.

**Dívidas.** `MANUAL.html` desatualizado (nomes de grupos, knob removido); checkboxes spot no fim do
grupo Focos; `Sala & Geometria` mistura luz e estrutura; `web/index-v2.html` (2D) mantém nomes
antigos no seu painel `mb.knobs`; preset grava a skin (tira-se numa linha se incomodar).

**Próximo (K2).** Contrato "todo knob novo nasce em config" para as fases S/V do
`plan-s13-faseado.md` — página no `mapa-frentes.md` + regra 10 no CLAUDE.md (Fable). Até lá, cada
fase nova: correr a bateria da regra 9 (padrão `9118710`) **com
snapshot/restore do localStorage**.

---

## 3. Regras de ouro ao mexer (checklist)

Antes de tocar em qualquer frente:

- [ ] **Quem mais escreve neste número?** grep pelo knob/campo em `music.js`, `main.js`
      (`effective()`), `stardom.js`, `panel.js`. Dois donos = bug. Se o motor também escreve, o teu
      write vai atrás de um disjuntor (`beamsMotor`/`opacityMotor`/`spotsMotor`) ou por um canal
      novo (padrão `stardom.gain`).
- [ ] **Vou ler `MUSIC.state`?** Confirma o nome do campo em `music.js:818` — poll não dá erro
      quando o campo não existe. `bpmEst` é período em ms; `kickFlash`; `bar` congela sem grelha.
- [ ] **Vou chamar `MIRRORBALL.*` a partir do motor?** Leva `{fromMotor:true}`, senão o disjuntor
      não corta.
- [ ] **Knob/campo novo?** Valor inicial finito (regra 7); no `PERSIST` se for afinação; nome com
      prefixo do elemento; toggle 0=off/1=on; **zero banners**.
- [ ] **Rename?** Entrada no `RENAMED`; nunca apagar entradas; regenerar `knobs-default.json` com
      `node gen-knobs-default.js`; testar load de um `mb2.knobs` da versão anterior (regra 9).
- [ ] **Mesh/material novo?** PBR com `RawCubeTexture` própria; thin instance com `setEnabled` ↔
      count; só meshes reais na renderList do probe; `transparencyMode` explícito; Color3 por
      `.set()`; luzes que pintam a sala ≤ 4 vivas; `excludedMeshes` para a bola e os planos.
- [ ] **Liga/desliga?** O par tem de ser simétrico (`restoreEnabled`); caches por contagem não
      apanham reconstruções (`chainGen`).
- [ ] **Geometria ⟳?** Aplicar via `preApplyReloadKnobs` antes de construir; cota por
      `ball.applyHeight()` → `ballYEffective` → só depois regenerar quem depende.
- [ ] **Mexi em `music.js`?** Bump `music.js?v=N` em `web/index-v2.html`; lembrar que toca as duas
      bolas; correr `node web/test-music-f2.js`; antes de "afinar", **medir** (`replay-real.js`).
- [ ] **Mexi em `main.js`/`panel.js`?** Bump dos cache-busters (`index.html` → `main.js?v=`,
      `main.js` → `panel.js?v=`/módulos).
- [ ] **Vou medir perf?** Tab à frente, `MB2.__perf()`, passo > 50 ms; nunca `scene.render()`
      forçado em tab escondido.
- [ ] **Bateria com localStorage?** Snapshot de `mb2.*` antes, restore depois. Tab de Chrome
      dedicado. Nunca `taskkill /IM python.exe`. Nunca commitar `web/music-config.json`.
- [ ] **Regras fixas do David** (CLAUDE.md 1-9): skin é dele; rpm segue o bombo e nunca pára com
      batida; bombo por `sub`, agudos por `hat`; tetos 0,18 / 3 Hz / bola não emite; cor permitida
      mas greyscale tem de funcionar; tudo o que se decide vai para `docs/` na mesma sessão.

---

## 4. Prioridades (leitura de 2026-09-02, fim do S13)

**Plano de execução:** `docs/plan-s13-faseado.md` (3 pistas S/V/K). **Janela Fable de 3 h (handoff S13 §0):** 6 worktrees em paralelo — W1 perf do modo música, W2 fog+exposição, W3 relógio único (S1), W4 hero+reserva (S2), W5 sombras, W6 mikado thin instances — unir na ordem W3→W4→W6→W1→W2→W5. S0 está **fechado** (`f16-sync.md`).

1. **Debate do plano de sync (frente A → D).** Já decidido pelo David; é a maior dívida e a que
   determina o valor de tudo o resto — sem "quando", afinar luminárias é trabalho perdido. Entrada:
   `audit-sync-motor.md` + `research-lighting-pro.md` §4. Saída: um doc em `docs/` com o relógio
   único (derivado de `beatPhase`/`bpmEst`), a hierarquia hero/apoio por secção, e a lista de
   relógios aleatórios a abater. Implementação Opus, com stop visual por gesto.
2. **Baseline de perf + realismo barato (frente B), em paralelo.** G1+G2 do `research-gpu-offload`:
   2 linhas + um número medido no pior caso. E R1-R3 do `research-realismo` (dots em losango, fog
   nativo, exposição): ~0 ms, cada uma com stop visual, e atacam o "parece CG" sem tocar em sync
   nem em elementos. Decide também se o mikado em thin instances vale a pena antes de a sala crescer.
3. **Afinar elementos ao vivo (frente C)** — sementes, luminosidade dos vultos, repouso do mikado,
   chapéus. É afinação de sensação, só com o David e música real; não bloqueia nada.
4. **Posição↔mira dos focos (C/D)** — só quando o plano de sync disser o que os focos fazem; hoje
   é dívida de realismo, não de comportamento.
5. **Frente E** fica em manutenção: bateria da regra 9 por fase; MANUAL quando houver uma pausa.

Nota: o realismo (`research-realismo.md`) não é frente própria — é trabalho da frente B (luz/ar/pós)
com uma decisão estética na C (`tileTone`). Os ganhos percetuais da tabela-mestra são hipóteses do
analista, não testes A/B com o David (§7/§8 desse doc) — validar ao vivo, fase a fase.

---

## 5. Como se mantém vivo

- **Quem:** quem fecha a fase (o agente que commita) atualiza este ficheiro no mesmo commit do
  handoff — regra 8 do CLAUDE.md aplicada ao mapa.
- **O quê, por fase:** (a) tabela §0 (estado / maior dívida / próximo passo da frente tocada);
  (b) §1 se nasceu ou mudou um contrato (campo novo em `state`, canal novo, disjuntor);
  (c) na frente tocada, as listas "o que já partiu" e "dívidas" — uma linha cada, com o commit;
  (d) §3 só se houver uma armadilha **nova** (não repetir as dos handoffs — apontar).
- **O que não entra:** specs, verificações, números de afinação — isso vai para o `docs/fN-*.md`
  da fase; aqui só o apontador.
- **Quando revisar a fundo:** ao fechar o plano de sync (as frentes A e D mudam de estado) e sempre
  que a tabela §0 deixar de caber num ecrã.
