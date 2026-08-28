/* music.js — motor musical da bola (Mirrors of Emotions, Fase 5: "motor forte").
 *
 * Plano: agent-os/docs/2026-08-28_mirrors-of-emotions-plan.md — §0, §0.1 (feedback verbatim do
 * David após a primeira audição: É ESTA A SPEC), §3, §4.0.
 *
 * ============================ O QUE MUDOU NA FASE 5 (e porquê) ============================
 * A Fase 2 entregou um motor correto e inaudível: "muito fraca". O diagnóstico do David não é
 * de afinação, é de ATITUDE. Três decisões estruturais saíram de §0.1:
 *
 * 1) SKIN É DO UTILIZADOR, NUNCA DO MOTOR. Nada aqui chama `setSkinAuto`. A tecla `w` / o botão
 *    da bola mandam. Se em modo música a skin estiver em 'auto' (que sem fonte de tom fica
 *    presa num alvo que ninguém escreve), forçamos UMA vez para 'dark' — a sala de clube.
 *    O knob `tone` deixou de existir no motor.
 *
 * 2) RPM SEGUE O BOMBO, com amplitude VISÍVEL. Não é energia genérica: é presença de kick.
 *    Bombo a bater → 2.4-3.0 rpm. Bombo pára → 0.0-0.15 rpm em ~1.5 s. O sidecar não dá grelha
 *    (só features a 50 Hz), por isso o kick, o BPM e a grelha são detetados AQUI (§KICK/§GRID).
 *
 * 3) GESTOS TEATRAIS. O técnico de luz não é um envelope follower — em breakdown/build ele faz
 *    coisas que NÃO estão no áudio: para a bola, apaga a esfera, gira às escuras. O módulo
 *    GESTURES é um repertório de 8 gestos que se SOBREPÕEM à Camada 1 (multiplicativo/override
 *    por variável, com peso que entra e sai por rampa), escolhidos por um RNG com seed de sessão.
 *
 * ============================== CONTRATO DE MENSAGENS ==============================
 * Tudo chega por `postMessage` à window do iframe (do pai, ou do gerador local de testes).
 * Origem não é validada: é loopback local (mesma regra do core.js).
 *
 * 1) FEATURES — contínuas, ~50 Hz, 0..1 (é EXATAMENTE o que o audio-sidecar :3739 emite):
 *    { type:'features', t, rms, bass, mid, high, centroid, onset, loudness, silence }
 *    ⚠ `bass`/`mid`/`high` vêm normalizados a bandMax no sidecar (server.js:146) — são a FORMA
 *      do espectro, não energia absoluta. Um kick sobe `bass` relativamente a mid/high; é isso
 *      que o detetor usa, cruzado com `rms`/`onset` para não disparar em música só de graves.
 *    ⚠ O sidecar NÃO emite `grid` nem `hint`. Ambos nascem aqui.
 *
 * 2) GRELHA — emitida LOCALMENTE por este ficheiro (§GRID) pelo mesmo `onMessage`, para a
 *    Camada 2 (extrapolação de fase, fronteiras de compasso/frase) funcionar com áudio real:
 *    { type:'grid', v:1, t0, beatPeriodMs, beatsPerBar, barsPerPhrase, barIndex, phraseIndex,
 *      confidence }   — `confidence` = regularidade dos intervalos entre kicks.
 *
 * 3) RELÓGIO — handshake NTP simplificado (§2.2 do plano); ver MB_CLOCK.
 * 4) PERFIL — { type:'profile', value:'electronica'|'acustico'|'voz' } (ou tecla `p`).
 * 5) ESTADO (saída) — { type:'mb-state', … } para o pai, 4 Hz.
 *
 * Arbitragem (§2.4): o estado interno evolui SEMPRE, mas só se escreve no CONFIG/setSpot/BRIDGE
 * se MB_SOURCE.owner === 'music'. Ao ganhar a posse parte-se dos valores ATUAIS e rampa-se.
 *
 * Tetos invioláveis (§1.2): beamIntensity ≤ 0.18 · nada oscila acima de 3 Hz · greyscale.
 *
 * Teclas: `m` HUD · `g` gerador sintético · `n` próxima fase do gerador · `p` cicla perfil.
 */
'use strict';
(() => {

const { clamp, lerp, smooth, anchor, ease } = window.MB_CORE;
const TAU = Math.PI * 2;

/* ============================ MB_CLOCK — NTP simplificado ============================ */
// Estimador de offset entre o relógio do emissor e o `performance.now()` local. Guarda as
// amostras de menor RTT e usa a MEDIANA dos offsets — mediana e não média porque uma única
// amostra com jitter alto (GC, tab em background) envenena a média e desloca a fase do drop.
const MB_CLOCK = (() => {
  const KEEP = 5;
  let samples = [];          // { rtt, offset }
  let offset = 0, reqId = 0;
  const pending = new Map(); // id → tClient

  function request(target) {
    const id = ++reqId, tClient = now();
    pending.set(id, tClient);
    const ext = window.MUSIC && window.MUSIC.gen && window.MUSIC.gen.isExternal && window.MUSIC.gen.isExternal();
    const to = target || (ext && window.parent !== window ? window.parent : window);
    to.postMessage({ type: 'clock-req', id, tClient }, '*');
    if (pending.size > 32) for (const [k, v] of pending) if (now() - v > 5000) pending.delete(k);
  }

  function ingest(msg) {
    const tClient = pending.get(msg.id);
    if (tClient == null) return;
    pending.delete(msg.id);
    const tRecv = now(), rtt = tRecv - tClient;
    samples.push({ rtt, offset: msg.tEmit - (tClient + tRecv) / 2 });
    samples.sort((a, b) => a.rtt - b.rtt);
    samples = samples.slice(0, KEEP);
    const offs = samples.map(s => s.offset).sort((a, b) => a - b);
    offset = offs[(offs.length - 1) >> 1];
  }

  function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

  return {
    ingest, request, now,
    toLocal(tRemote) { return tRemote - offset; },
    get offset() { return offset; },
    get quality() { return samples.length ? samples[0].rtt : Infinity; },
    reset() { samples = []; offset = 0; pending.clear(); },
  };
})();
window.MB_CLOCK = MB_CLOCK;

/* ================================== CONFIG afinável ================================== */
// §5: nada de números soltos no código. Tudo aqui, sobreponível em runtime por
// music.config.json (deep-merge) sem rebuild.
const MUSIC = {
  /* ---- Perfil ativo (manual; deteção automática NÃO nesta fase, §0.1 ponto 6) ---- */
  profile: 'electronica',          // 'electronica' | 'acustico' | 'voz'

  /* ---- Camada 1: normalização de loudness ---- */
  // Média integrada com gate (§1.1). NÃO é o `adapt` do emotion-v2.js (seguidor de picos com
  // release de 3-5 min, que adormecia a bola ao passar de techno para ambiente).
  norm: {
    windowSec: 20,        // janela da média integrada (o divisor)
    gate: 0.02,           // abaixo disto não conta para a média
    floor: 0.12,          // piso do divisor: evita amplificar ruído numa sala silenciosa
    refMix: 0.75,         // 0 = escala fixa, 1 = totalmente relativa à janela
    shortSec: 0.35,       // janela curta que alimenta os alvos rápidos
  },

  /* ---- Detetor de BOMBO (§0.1 ponto 3) — o coração do motor ----
   * O sidecar não dá grelha. Um kick é: um ONSET, com a banda grave acima da sua própria média
   * móvel por um fator, e com energia (rms) que confirme que é uma batida e não um artefacto de
   * um trecho só-graves. Refratário de 200 ms → teto de 300 BPM, mata o duplo-disparo do mesmo
   * transiente sem cortar hi-hats (que não passam o teste do bass de qualquer modo). */
  kick: {
    bassRatio: 1.30,      // bass > média móvel × isto
    bassAvgSec: 1.6,      // janela da média móvel de bass (longa: é a "cor" da faixa)
    onsetMin: 0.30,       // onset mínimo para candidatar a kick
    rmsMin: 0.06,         // piso de energia: silêncio não tem kicks
    refractoryMs: 200,
    rateWindowSec: 2.0,   // janela de kicks/s
    rateFull: 2.6,        // kicks/s que equivalem a presença 1.0 (≈156 BPM em 4-on-the-floor)
    presenceTau: [0.30, 1.50],   // attack 0.3 s / release 1.5 s (§ ponto 2 do brief)
    // Duas fases na queda, e é isto que faz a rotação PARAR (não "abrandar"):
    //  1) enquanto o bombo pode só ter saltado uma batida, o alvo desce devagar (tau 1.5 s);
    //  2) confirmado o silêncio de bombo (`gapDeadSec`), o release passa a `deadTau` — porque
    //     nessa altura já não é uma dúvida, é uma decisão musical, e o David pediu que a bola
    //     PARE. Sem isto, 1.5 s de dúvida + 3τ de release davam ~6 s para chegar a zero.
    // 0.7 s ≈ 1.5 batidas a 126 BPM: tempo para uma batida falhada, não para uma secção.
    gapDeadSec: 0.7,      // sem kick há mais de isto (com música a tocar) → alvo 0
    deadTau: 0.40,        // release depois de confirmado o silêncio de bombo
  },

  /* ---- Estimador de BPM + grelha local (§0.1: emite `grid` para a Camada 2 já existente) ---- */
  bpm: {
    keep: 8,              // intervalos guardados (mediana dos últimos 8)
    lo: 100, hi: 150,     // prior: dobra/divide o intervalo até cair aqui (mata half/double-time)
    hysteresis: 0.04,     // só troca de BPM se a mediana se afastar > 4% da estimativa atual
    minIntervalMs: 250, maxIntervalMs: 2000,
    beatsPerBar: 4, barsPerPhrase: 16,
    confSpreadFull: 0.22, // desvio relativo dos intervalos que leva a confiança a 0
    emitEveryMs: 500,     // republica a grelha (t0 fresco) a este ritmo
  },

  /* ---- Camada 1: mapeamento forte (§0.1 ponto 3) ----
   * Já não é (V,A)→âncoras. É DIRETO: cada knob tem a sua fonte e a sua amplitude, escolhida
   * para se NOTAR. A "amplitude visível" é o requisito, não a subtileza. */
  map: {
    // rpm ← kickPresence × energia. Sem bombo: 0.0-0.15. Bombo forte: 2.4-3.0.
    rpmIdle: [0.00, 0.15],        // [mínimo, máximo] do repouso — escolhido por energia residual
    rpmDrive: [2.40, 3.00],       // [mínimo, máximo] com bombo — escolhido por loudness
    rpmKnee: 0.18,                // presença abaixo disto = repouso puro (evita meio-termo morno)
    spotBase: [0.35, 1.45],       // intensidade dos spots ← loudness (curva sobre a base do CONFIG)
    spotDomGain: 1.30, spotSubGain: 0.62,   // foco dominante vs os outros dois
    spotSwapBars: 8,              // foco dominante roda na fronteira de 8 compassos
    beamIntFrom: [0.02, 0.18],    // ← high + onset (hi-hats/voz). TETO 0.18, inviolável
    beamsFrom: [4, 52],
    beamHighMix: 0.65,            // peso de `high` vs `onset` no sinal dos feixes
    hazeFrom: [0.22, 0.95],       // ← INVERSO de bass (breakdown sem graves = fumo)
    opacityFrom: [0.35, 1.00],    // ← loudness curto
    opacityFloorGroove: 0.55,     // §0.1: a bola não pode ficar fantasma sem razão em GROOVE
  },

  // τ (s) [attack, release]. Do brief da Fase 5, ponto 3. Nada oscila acima de 3 Hz.
  tau: {
    rpm: [0.60, 1.50], spot: [0.12, 0.60], beamInt: [0.10, 0.50], beams: [0.10, 0.50],
    haze: [1.50, 4.00], opacity: [0.40, 2.00],
  },
  // Exceção assumida: quando o BOMBO PÁRA, o release do rpm encurta. Não é uma reação a
  // transiente (isso seria pisca) — é a mesma decisão musical do `deadTau`: a paragem da
  // rotação é um EVENTO que o David quer ver, não um decaimento que ele tem de adivinhar.
  // 0.45 s ainda é ~0.35 Hz de conteúdo, uma ordem de grandeza abaixo do teto de 3 Hz.
  rpmStopTau: 0.45,
  outMin: { spot: 0.00, opacity: 0.00, haze: 0.05, rpm: 0.00, beamInt: 0, beams: 0 },
  outMax: { spot: 1.60, opacity: 1.00, haze: 1.00, rpm: 3.00, beamInt: 0.18, beams: 56 },

  /* ---- Camada 2: grelha ---- */
  grid: {
    staleMs: 4000,        // grelha mais velha que isto = sem grelha
    quantConf: 0.60,      // acima disto o rpm só muda na fronteira de COMPASSO
  },

  /* ---- Camada 3: máquina de estados com áudio real, SEM `hint` (§0.1 / ponto 5) ---- */
  fsm: {
    kickDeadSec: 1.5,         // bombo cai por > isto, com música a tocar → BREAKDOWN
    kickBackPresence: 0.45,   // presença de volta acima disto (+ onset forte) → DROP
    dropOnset: 0.55,          // onset do primeiro kick de volta que qualifica como DROP
    buildBars: 4,             // energia/hi-hats a subir ≥ isto compassos → BUILD
    riseSlope: 0.015,         // subida mínima por compasso
    highRiseSlope: 0.020,     // ou hi-hats a crescer
    preDropBars: 0.75,        // ≤ este nº de compassos da fronteira de frase → PRE_DROP
    preDropMinConf: 0.35,
    preDropDepth: 0.85,
    dropTimeoutBars: 2,
    dropHoldBars: [4, 8],     // DROP → all-on durante 4-8 compassos
    dropHoldSecNoGrid: [6, 12],
    breakdownMinSec: 3.0,
    buildGiveUpSec: 8.0,      // build que não resolve em 8 s desiste → BREAKDOWN
    minStateMs: 900,          // debounce: não oscilar
  },

  /* ---- Gestos (§0.1: "criatividade tb em cima disso") ---- */
  gesture: {
    barsRange: [2, 8],            // duração 2-8 compassos com grelha
    secRange: [4, 12],            // 4-12 s sem grelha
    rampInSec: 0.8, rampOutSec: 1.2,
    chainRange: [2, 3],           // 2-3 gestos encadeados até ao drop em BREAKDOWN/BUILD
    grooveEveryBars: [16, 32],    // em GROOVE, tenta a cada 16-32 compassos
    grooveChance: 0.30,           // …e aceita 30% das vezes
    grooveLight: ['breath', 'strobe-slow'],
    dark: ['freeze', 'ghost', 'blind-spin', 'single-beam', 'fog', 'strobe-slow', 'breath'],
    seed: 0,                      // 0 = seed por sessão (Date.now); qualquer outro = determinístico
  },

  /* ---- Silêncio (§3.5) ---- */
  silence: { noFeaturesMs: 500, decaySec: 4.0 },

  /* ---- Arbitragem ---- */
  handover: { rampSec: 1.5 },

  /* ---- Saída de estado para o pai ---- */
  emit: { stateHz: 4 },

  /* ---- Gerador sintético (testes / demo sem sidecar) ---- */
  gen: {
    enabled: true, bpm: 126, beatsPerBar: 4, barsPerPhrase: 16,
    featureHz: 50,
    grooveBars: 32, buildBars: 16, breakdownBars: 16, breakdownEveryCycles: 3,
    externalGraceMs: 2000,
  },
};

/* ============================== RNG com seed de sessão ==============================
 * Os gestos têm de variar entre sessões (§3.3: "previsível é o oposto de quase mágica") mas
 * têm de ser reproduzíveis num teste. `MUSIC.gesture.seed = 0` → seed por sessão. */
function makeRng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return function rng() {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
let RNG = makeRng(MUSIC.gesture.seed || (Date.now() & 0x7fffffff));
const rngPick = arr => arr[Math.floor(RNG() * arr.length) % arr.length];
const rngRange = r => lerp(r[0], r[1], RNG());

/* ================================== estado do motor ================================== */
const state = {
  // features
  feat: null, lastFeatLocal: -Infinity, silent: true,
  loudAvg: 0, loudAccT: 0, loudShort: 0,
  bassAvg: 0.35, bassShort: 0.35, highAvg: 0.25, centroidAvg: 0.45, rmsShort: 0,
  // --- kick / bombo ---
  kickTimes: [], lastKickT: -Infinity, kickRate: 0, kickPresence: 0, kickFlash: 0,
  // --- BPM / grelha local ---
  intervals: [], bpmEst: 0, gridConf: 0, gridT0: 0, gridBar: 0, lastGridEmit: 0,
  // grelha recebida (a nossa, ou a de um emissor externo que a mande)
  grid: null, gridLocalT0: 0,
  bar: 0, phrase: 0, beatPhase: 0, barPhase: 0, phrasePhase: 0, lastBarSeen: -1,
  // energia por compasso (inclinações da FSM)
  barEnergy: [], barEnergyAcc: 0, barEnergyN: 0,
  barHigh: [], barHighAcc: 0,
  secEnergy: [], lastSecT: 0, secAcc: 0, secN: 0,   // fallback sem grelha
  // FSM
  fsm: 'GROOVE', fsmSince: 0, fsmBar: 0, fsmStartT: 0,
  preDropAmount: 0, dropOpen: 0, dropHold: 0, dropCount: 0, restrainThis: false,
  lastKickSeenT: -Infinity,
  log: [],
  // coreografia
  domSpot: 0, lastSwapBar: -1, phraseAccent: 0,
  // gestos
  gest: null, gestQueue: [], gestWeight: 0, gestUntil: 0, gestLast: null,
  gestNextGrooveBar: 24, gestCount: 0, gestSeen: {},
  // saída
  out: null, target: {}, health: 1,
  owner: null, handoverT: 0, skinForced: false,
  lastEmit: 0, lastT: MB_CLOCK.now(),
};

function baseOut() {
  return { opacity: 0.80, rpm: 0.60, beams: 14, beamInt: 0.08, haze: 0.50, spot: 0.80 };
}
state.out = baseOut();

function logEvent(to, why) {
  state.log.unshift({ t: MB_CLOCK.now(), from: state.fsm, to, why });
  if (state.log.length > 8) state.log.length = 8;
}
// eventos que não são transições de estado (gestos, perfil) entram no mesmo log mas sem seta
function logNote(why) {
  state.log.unshift({ t: MB_CLOCK.now(), note: true, why });
  if (state.log.length > 8) state.log.length = 8;
}
function setState(next, why) {
  if (next === state.fsm) return;
  logEvent(next, why);
  state.fsm = next;
  state.fsmSince = MB_CLOCK.now();
  state.fsmBar = state.bar;
}

/* ================================ entrada de mensagens ================================ */
// Um único ponto de entrada: gerador, sidecar e a nossa própria grelha entram pela mesma porta.
function onMessage(d) {
  if (!d || typeof d !== 'object') return;
  if (d.type === 'features') return ingestFeatures(d);
  if (d.type === 'grid') return ingestGrid(d);
  if (d.type === 'clock') return MB_CLOCK.ingest(d);
  if (d.type === 'clock-req') return GEN.answerClock(d);
  if (d.type === 'profile') return setProfile(d.value);
}
if (typeof addEventListener === 'function') addEventListener('message', e => onMessage(e && e.data));

const PROFILES = ['electronica', 'acustico', 'voz'];
function setProfile(p) {
  if (PROFILES.indexOf(p) === -1 || p === MUSIC.profile) return;
  logNote(`perfil → ${p}`);
  MUSIC.profile = p;
  // trocar de perfil não pode dar corte: os gestos são de `electronica`, saem por rampa
  if (p !== 'electronica') { state.gest = null; state.gestQueue.length = 0; }
}

function ingestFeatures(f) {
  const nowL = MB_CLOCK.now();
  // features SEM `hint` só podem vir de um emissor real (o gerador etiqueta sempre) — marcá-lo
  // cala o gerador enquanto houver sidecar, senão os dois escreviam por cima um do outro.
  if (f.hint == null) GEN.markExternal(nowL);
  state.feat = f;
  state.lastFeatLocal = nowL;
  state.silent = !!f.silence;

  const dt = Math.min(0.1, (state.loudAccT ? nowL - state.loudAccT : 20) / 1000);
  state.loudAccT = nowL;

  const l = +f.loudness || 0, bass = +f.bass || 0, high = +f.high || 0, rms = +f.rms || 0;

  // loudness integrado com gate — divisor da normalização (§1.1)
  if (l > MUSIC.norm.gate && !f.silence) {
    const k = 1 - Math.exp(-dt / MUSIC.norm.windowSec);
    state.loudAvg += (l - state.loudAvg) * k;
  }
  // loudness de janela CURTA: é este que alimenta opacidade/spots. Curto o bastante para o
  // drop morder, longo o bastante para não seguir o kick.
  state.loudShort += (l - state.loudShort) * (1 - Math.exp(-dt / MUSIC.norm.shortSec));
  state.rmsShort += (rms - state.rmsShort) * (1 - Math.exp(-dt / 0.20));

  // bandas: DUAS janelas com papéis diferentes.
  //  - `bassAvg` (1.6 s) é a linha de base contra a qual o kick se destaca (o detetor).
  //  - `bassShort` (0.25 s) é o corpo da banda, para o haze (inverso de bass) e a FSM.
  {
    const kL = 1 - Math.exp(-dt / MUSIC.kick.bassAvgSec);
    state.bassAvg += (bass - state.bassAvg) * kL;
    const kS = 1 - Math.exp(-dt / 0.25);
    state.bassShort += (bass - state.bassShort) * kS;
    const kH = 1 - Math.exp(-dt / 0.40);
    state.highAvg += (high - state.highAvg) * kH;
    state.centroidAvg += ((+f.centroid || 0) - state.centroidAvg) * (1 - Math.exp(-dt / 1.2));
  }

  detectKick(nowL, f);

  // energia acumulada por compasso / por segundo (inclinações da FSM)
  state.barEnergyAcc += state.loudShort; state.barHighAcc += state.highAvg; state.barEnergyN++;
  state.secAcc += state.loudShort; state.secN++;
  if (nowL - state.lastSecT > 1000) {
    state.lastSecT = nowL;
    if (state.secN) { state.secEnergy.push(state.secAcc / state.secN); if (state.secEnergy.length > 16) state.secEnergy.shift(); }
    state.secAcc = 0; state.secN = 0;
  }
}

/* ================== §KICK — deteção de bombo a partir das features 50 Hz ==================
 * O sidecar dá `bass` NORMALIZADO a bandMax (server.js:146): é a forma do espectro, não energia
 * absoluta. Um kick empurra essa forma para os graves — daí a razão contra a própria média
 * móvel. Três condições em conjunção, porque cada uma sozinha dispara em falso:
 *   onset alto        → mas um crash de pratos também tem onset
 *   bass > média×1.3  → mas um baixo sustentado mantém bass alto sem ser batida
 *   rms acima do piso → mata o ruído de fundo entre faixas
 * Refratário de 200 ms: o mesmo transiente produz 2-3 frames de flux alto a 50 Hz. */
function detectKick(nowL, f) {
  const K = MUSIC.kick;
  const onset = +f.onset || 0, bass = +f.bass || 0, rms = +f.rms || 0;
  const isKick = !f.silence &&
    onset >= K.onsetMin &&
    bass > state.bassAvg * K.bassRatio &&
    rms >= K.rmsMin &&
    (nowL - state.lastKickT) > K.refractoryMs;

  if (isKick) {
    if (state.lastKickT > -Infinity) {
      const iv = nowL - state.lastKickT;
      if (iv >= MUSIC.bpm.minIntervalMs && iv <= MUSIC.bpm.maxIntervalMs) pushInterval(iv);
    }
    state.lastKickT = nowL;
    state.lastKickSeenT = nowL;
    state.kickFlash = 1;
    state.kickTimes.push(nowL);
    updateBpm(nowL);
    onKickBeat(nowL);
  }
  state.kickFlash *= 0.92;

  // kickRate: kicks/s numa janela de 2 s
  const cut = nowL - K.rateWindowSec * 1000;
  while (state.kickTimes.length && state.kickTimes[0] < cut) state.kickTimes.shift();
  state.kickRate = state.kickTimes.length / K.rateWindowSec;

  // kickPresence 0..1 suavizado: attack 0.3 s / release 1.5 s. Se o bombo parou há mais de
  // `gapDeadSec`, o alvo é 0 mesmo que ainda haja kicks na janela — é isto que faz a rotação
  // PARAR quando o bombo pára, e não apenas abrandar.
  const gap = nowL - state.lastKickT;
  const dead = !(gap < K.gapDeadSec * 1000);
  const tgt = dead ? 0 : clamp(state.kickRate / K.rateFull, 0, 1);
  const dt = Math.min(0.1, 0.02);
  const tau = dead ? [K.presenceTau[0], K.deadTau] : K.presenceTau;
  state.kickPresence = ease(state.kickPresence, tgt, tau, dt);
}

/* ================== §GRID — BPM por intervalos + grelha local ==================
 * Mediana dos últimos 8 intervalos entre kicks, com prior de oitava 100-150 BPM (dobra ou
 * divide até cair na janela — é o remédio standard para half/double-time, a falha mais comum).
 * Histerese: só se muda a estimativa se a mediana se afastar > 4%, senão a grelha treme e o
 * `t0` salta, e a fase do compasso salta com ele. */
function pushInterval(iv) {
  state.intervals.push(iv);
  if (state.intervals.length > MUSIC.bpm.keep) state.intervals.shift();
}
function median(a) {
  if (!a.length) return 0;
  const s = a.slice().sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function foldToPrior(periodMs) {
  const B = MUSIC.bpm;
  const loMs = 60000 / B.hi, hiMs = 60000 / B.lo;   // 400 ms .. 600 ms
  let p = periodMs, guard = 0;
  while (p < loMs && guard++ < 8) p *= 2;
  guard = 0;
  while (p > hiMs && guard++ < 8) p /= 2;
  return p;
}
function updateBpm(nowL) {
  const B = MUSIC.bpm;
  if (state.intervals.length < 3) return;
  const med = foldToPrior(median(state.intervals));
  if (!(med > 0)) return;

  // confiança = regularidade: desvio absoluto médio dos intervalos (dobrados ao mesmo prior)
  const folded = state.intervals.map(foldToPrior);
  const m2 = median(folded);
  let mad = 0;
  for (const v of folded) mad += Math.abs(v - m2);
  mad = folded.length ? mad / folded.length / Math.max(m2, 1) : 1;
  const conf = clamp(1 - mad / B.confSpreadFull, 0, 1) * clamp(state.intervals.length / B.keep, 0, 1);
  state.gridConf = state.gridConf + (conf - state.gridConf) * 0.25;

  const cur = state.bpmEst ? 60000 / state.bpmEst : 0;
  const newBpm = 60000 / med;
  if (!state.bpmEst || Math.abs(med - state.bpmEst) / state.bpmEst > B.hysteresis) {
    state.bpmEst = med;
    // realinhar o "1" a este kick, mas manter a contagem de compassos contínua
    state.gridT0 = nowL;
    state.gridBar = state.bar;
  }
  void cur; void newBpm;
}
// Emite a grelha pelo MESMO caminho de mensagens — a Camada 2 (updateGrid) não sabe nem precisa
// de saber que a grelha nasceu aqui dentro. Republica-se a cada 500 ms com um `t0` que é sempre
// o downbeat mais recente extrapolado, para a fase não derivar entre emissões.
function emitLocalGrid(nowL) {
  const B = MUSIC.bpm;
  if (!state.bpmEst || state.gridConf < 0.05) return;
  if (nowL - state.lastGridEmit < B.emitEveryMs) return;
  if (GEN.isExternalGrid()) return;    // se alguém de fora manda grelha, não competimos
  state.lastGridEmit = nowL;
  const barMs = state.bpmEst * B.beatsPerBar;
  const barsElapsed = Math.floor((nowL - state.gridT0) / barMs);
  const t0 = state.gridT0 + barsElapsed * barMs;
  onMessage({
    type: 'grid', v: 1, t0, beatPeriodMs: state.bpmEst,
    beatsPerBar: B.beatsPerBar, barsPerPhrase: B.barsPerPhrase,
    barIndex: state.gridBar + barsElapsed,
    phraseIndex: Math.floor((state.gridBar + barsElapsed) / B.barsPerPhrase),
    confidence: state.gridConf, local: true,
  });
}
function onKickBeat() { /* gancho para futuros acentos por batida; a fase vem da grelha */ }

function ingestGrid(g) {
  if (!g || g.v !== 1) return;
  if (!g.local) GEN.markExternalGrid(MB_CLOCK.now());
  state.grid = g;
  state.gridLocalT0 = g.local ? g.t0 : MB_CLOCK.toLocal(g.t0);
}

/* ============================ Camada 2 — grelha local (§2.2) ============================ */
function updateGrid(nowL) {
  const g = state.grid;
  if (!g || nowL - state.gridLocalT0 > MUSIC.grid.staleMs) {
    state.beatPhase = state.barPhase = state.phrasePhase = 0;
    return false;
  }
  const beats = (nowL - state.gridLocalT0) / g.beatPeriodMs;
  const bpb = g.beatsPerBar, bpp = g.barsPerPhrase;
  const barsF = beats / bpb;
  const bar = g.barIndex + Math.floor(barsF);
  state.beatPhase = ((beats % 1) + 1) % 1;
  state.barPhase = ((barsF % 1) + 1) % 1;
  state.phrase = Math.floor(bar / bpp);
  state.phrasePhase = ((bar / bpp + state.barPhase / bpp) % 1 + 1) % 1;

  if (bar !== state.bar) {
    const prev = state.bar;
    state.bar = bar;
    if (state.barEnergyN > 0) {
      state.barEnergy.push(state.barEnergyAcc / state.barEnergyN);
      state.barHigh.push(state.barHighAcc / state.barEnergyN);
      if (state.barEnergy.length > 12) state.barEnergy.shift();
      if (state.barHigh.length > 12) state.barHigh.shift();
    }
    state.barEnergyAcc = 0; state.barHighAcc = 0; state.barEnergyN = 0;
    onBarBoundary(bar, prev);
  }
  return true;
}

function barsToPhraseEnd() {
  const g = state.grid; if (!g) return Infinity;
  const bpp = g.barsPerPhrase;
  const posInPhrase = ((state.bar % bpp) + bpp) % bpp + state.barPhase;
  return bpp - posInPhrase;
}

function onBarBoundary(bar) {
  // coreografia de spots amarrada à música (§3.6): a bola tem fades próprios com períodos
  // 11/17/13 s que NÃO são períodos musicais. Em music, spotFadeMix→0 e o foco dominante roda
  // na fronteira de 8 compassos.
  const sw = MUSIC.map.spotSwapBars;
  if (sw > 0 && bar % sw === 0 && bar !== state.lastSwapBar) {
    state.lastSwapBar = bar;
    const n = (window.MIRRORBALL && window.MIRRORBALL.config.spots.length) || 3;
    state.domSpot = (state.domSpot + 1) % n;
  }
  const g = state.grid;
  if (g && ((bar % g.barsPerPhrase) + g.barsPerPhrase) % g.barsPerPhrase === 0) state.phraseAccent = 1;
  // gesto leve em GROOVE: a cada 16-32 compassos, 30% das vezes
  if (state.fsm === 'GROOVE' && bar >= state.gestNextGrooveBar) {
    state.gestNextGrooveBar = bar + Math.round(rngRange(MUSIC.gesture.grooveEveryBars));
    if (!state.gest && RNG() < MUSIC.gesture.grooveChance && MUSIC.profile === 'electronica') {
      startGesture(pickGesture(MUSIC.gesture.grooveLight), 'groove leve');
    }
  }
}

/* ==================== §GESTURES — o repertório teatral (§0.1) ====================
 * Um gesto NÃO é uma reação ao áudio: é uma decisão do técnico. Cada um devolve um patch por
 * variável, aplicado por cima da Camada 1 com um peso `w` que entra e sai por rampa:
 *   set:  valor absoluto        → out = lerp(camada1, valor, w)
 *   mul:  fator multiplicativo  → out = camada1 × lerp(1, fator, w)
 *   min/max: teto/piso          → interpolados do mesmo modo
 * A rampa é o que impede um corte; sem ela, "opacidade → 0.05 súbito" seria um pisca. */
const GESTURES = {
  // rpm→0, spots mantêm, feixes seguem `high`. O gesto do breakdown por excelência.
  'freeze': (ctx) => ({ rpm: { set: 0.0 }, beamInt: { set: lerp(0.03, 0.18, ctx.high) }, beams: { set: lerp(6, 30, ctx.high) } }),
  // opacity→0.05 súbito (tau 0.15) + spots→0; rpm mantém. A bola desaparece e continua a girar.
  'ghost': () => ({ opacity: { set: 0.05, tau: [0.15, 0.15] }, spot: { set: 0.0, tau: [0.15, 0.4] } }),
  // girar às escuras: rpm 2.5, sem spots, opacidade 0.2
  'blind-spin': () => ({ rpm: { set: 2.5 }, spot: { set: 0.0 }, opacity: { set: 0.20 }, beamInt: { set: 0.02 }, beams: { set: 4 } }),
  // um único foco, feixes ao máximo, fumo alto
  'single-beam': () => ({ spot: { set: 1.40 }, solo: true, beamInt: { set: 0.18 }, beams: { set: 52 }, haze: { set: 0.92 } }),
  'fog': () => ({ haze: { set: 1.0 }, spot: { set: 0.50 }, rpm: { set: 0.40 }, beams: { set: 8 } }),
  // spots alternam dominante a cada compasso — ≤ 1 Hz mesmo a 140 BPM (um compasso = 1.7 s)
  'strobe-slow': (ctx) => ({ swapEveryBar: true, spot: { mul: ctx.barParity ? 1.25 : 0.75 } }),
  // haze e opacidade em senos FORA DE FASE, 20-30 s — a sala a respirar
  'breath': (ctx) => ({
    haze: { mul: 1 + 0.35 * Math.sin(TAU * ctx.tSec / ctx.period) },
    opacity: { mul: 1 + 0.20 * Math.sin(TAU * ctx.tSec / ctx.period + Math.PI * 0.6) },
  }),
  // DROP: tudo ao máximo permitido
  'all-on': () => ({ rpm: { set: 3.0 }, opacity: { set: 1.0 }, spot: { set: 1.55 }, beamInt: { set: 0.18 }, beams: { set: 54 }, haze: { set: 0.70 } }),
};
const GESTURE_NAMES = Object.keys(GESTURES);

function pickGesture(pool) {
  const list = pool.filter(n => n !== state.gestLast);
  return rngPick(list.length ? list : pool);
}
function startGesture(name, why, opts) {
  if (!GESTURES[name]) return;
  const o = opts || {};
  const nowL = MB_CLOCK.now();
  const haveGrid = !!state.grid && state.gridConf > 0.3;
  const bars = o.bars != null ? o.bars : Math.round(rngRange(MUSIC.gesture.barsRange));
  const secs = o.secs != null ? o.secs : rngRange(MUSIC.gesture.secRange);
  const barMs = state.bpmEst ? state.bpmEst * MUSIC.bpm.beatsPerBar : 1900;
  const durMs = haveGrid ? bars * barMs : secs * 1000;
  state.gest = { name, t0: nowL, until: nowL + durMs, period: rngRange([20, 30]), why };
  state.gestLast = name;
  state.gestCount++;
  state.gestSeen[name] = (state.gestSeen[name] || 0) + 1;
  logNote(`gesto ${name} · ${(durMs / 1000).toFixed(1)}s · ${why}`);
}
function queueGestures(pool, n, why) {
  state.gestQueue.length = 0;
  let last = state.gestLast;
  for (let i = 0; i < n; i++) {
    const list = pool.filter(x => x !== last);
    const g = rngPick(list.length ? list : pool);
    state.gestQueue.push(g); last = g;
  }
  const first = state.gestQueue.shift();
  startGesture(first, why);
}
function updateGestures(nowL, dt) {
  if (MUSIC.profile !== 'electronica') {
    state.gest = null; state.gestQueue.length = 0;
    state.gestWeight = ease(state.gestWeight, 0, [MUSIC.gesture.rampOutSec, MUSIC.gesture.rampOutSec], dt);
    return;
  }
  if (state.gest && nowL >= state.gest.until) {
    // encadeia: 2-3 gestos até ao drop dentro de BREAKDOWN/BUILD/PRE_DROP
    const chainable = state.fsm === 'BREAKDOWN' || state.fsm === 'BUILD' || state.fsm === 'PRE_DROP';
    if (chainable && state.gestQueue.length) startGesture(state.gestQueue.shift(), 'encadeado');
    else state.gest = null;
  }
  const want = state.gest ? 1 : 0;
  const tau = want ? MUSIC.gesture.rampInSec : MUSIC.gesture.rampOutSec;
  state.gestWeight = ease(state.gestWeight, want, [tau, tau], dt);
}
function applyGesture(T) {
  const g = state.gest;
  const w = state.gestWeight;
  if (!g || w < 0.001) return null;
  const nowL = MB_CLOCK.now();
  const ctx = {
    tSec: (nowL - g.t0) / 1000, period: g.period,
    high: clamp(state.highAvg + (state.feat ? (+state.feat.onset || 0) * 0.4 : 0), 0, 1),
    barParity: (state.bar & 1) === 1,
  };
  const patch = GESTURES[g.name](ctx);
  const taus = {}, owns = {};
  for (const k in patch) {
    const p = patch[k];
    if (k === 'solo' || k === 'swapEveryBar') continue;
    if (T[k] == null) continue;
    if (p.set != null) { T[k] = lerp(T[k], p.set, w); owns[k] = true; }
    else if (p.mul != null) T[k] = T[k] * lerp(1, p.mul, w);
    else if (p.min != null) { T[k] = lerp(T[k], Math.min(T[k], p.min), w); owns[k] = true; }
    else if (p.max != null) { T[k] = lerp(T[k], Math.max(T[k], p.max), w); owns[k] = true; }
    if (p.tau) taus[k] = p.tau;
  }
  // `owns` = os knobs cujo VALOR o gesto impõe (set/min/max). Um `mul` modula o que a camada 1
  // decidiu e não conta como posse — daí `breath` não impedir a paragem da rotação.
  return { solo: !!patch.solo, swapEveryBar: !!patch.swapEveryBar, taus, owns, w };
}

/* ========================== Camada 3 — FSM com áudio real (§0.1 / 5) ==========================
 * Sem `hint`. O sinal principal é `kickPresence`; a energia por compasso e os hi-hats decidem
 * BUILD; o PRE_DROP continua ancorado à fronteira de frase × confiança. Debounce em `minStateMs`
 * para não oscilar quando um kick falha. */
function slopeOf(arr, n) {
  if (!arr || arr.length < 2) return 0;
  const k = Math.min(n, arr.length);
  const seg = arr.slice(-k);
  return (seg[seg.length - 1] - seg[0]) / Math.max(1, k - 1);
}
function energySlope() {
  // com grelha: por compasso. Sem grelha: por segundo (escala comparável a ~2 s/compasso).
  if (state.barEnergy.length >= 2) return slopeOf(state.barEnergy, MUSIC.fsm.buildBars);
  return slopeOf(state.secEnergy, MUSIC.fsm.buildBars * 2) * 2;
}

function updateFsm(nowL, dt) {
  const F = MUSIC.fsm;
  const conf = state.gridConf;
  const inState = nowL - state.fsmSince;
  const slope = energySlope();
  const highSlope = slopeOf(state.barHigh, F.buildBars);
  const barsLeft = barsToPhraseEnd();
  const kickGapSec = (nowL - state.lastKickT) / 1000;
  const musicPlaying = !state.silent && state.loudShort > 0.10;
  const canSwitch = inState > F.minStateMs;

  if (MUSIC.profile !== 'electronica') {
    // `acustico` e `voz` não têm máquina de estados nem gestos (§0.1 ponto 6)
    if (state.fsm !== 'GROOVE') setState('GROOVE', `perfil ${MUSIC.profile}`);
  } else if (state.silent) {
    if (canSwitch) setState('GROOVE', 'silêncio');
  } else if (state.fsm === 'DROP') {
    const done = state.grid
      ? (state.bar - state.fsmBar) >= state.dropHold
      : (nowL - state.fsmSince) >= state.dropHold * 1000;
    if (done) setState('GROOVE', 'fim da abertura');
  } else if (
    // ---- DROP: o bombo VOLTA com onset forte. É a transição mais importante do motor.
    canSwitch && musicPlaying &&
    (state.fsm === 'PRE_DROP' || state.fsm === 'BUILD' || state.fsm === 'BREAKDOWN') &&
    state.kickPresence > F.kickBackPresence &&
    state.kickFlash > 0.5 && state.feat && (+state.feat.onset || 0) >= F.dropOnset
  ) {
    state.dropCount++;
    // variação (§3.3): ~1 em 4 drops, contenção deliberada — previsível é o oposto de mágico
    state.restrainThis = (state.dropCount % 4) === 0;
    state.dropOpen = state.restrainThis ? 0.45 : clamp(0.75 + state.dropCount * 0.05, 0, 1);
    state.dropHold = state.grid
      ? Math.round(rngRange(F.dropHoldBars))
      : rngRange(F.dropHoldSecNoGrid);
    setState('DROP', `bombo de volta (pres ${state.kickPresence.toFixed(2)}, onset ${(+state.feat.onset).toFixed(2)})` +
      (state.restrainThis ? ' · contenção deliberada' : ` · #${state.dropCount}`));
    // §0.1: "qd ha o drop liga tudo"
    state.gestQueue.length = 0;
    startGesture('all-on', 'DROP', state.grid ? { bars: state.dropHold } : { secs: state.dropHold });
  } else if (state.fsm === 'PRE_DROP') {
    if (state.grid && state.bar - state.fsmBar > F.dropTimeoutBars) setState('BUILD', `timeout ${F.dropTimeoutBars} compassos sem drop`);
    else if (!state.grid && inState > 6000) setState('BUILD', 'timeout sem grelha');
  } else if (state.fsm === 'BUILD') {
    // ⚠ BUILD é, POR DEFINIÇÃO, "sem bombo e com energia a subir" — por isso a regra do
    // kickGap NÃO se aplica aqui. Aplicá-la fazia BUILD↔BREAKDOWN oscilar a cada ~0.7 s
    // (visto no primeiro run: 141 transições em 10 min), porque cada estado disparava a
    // condição de entrada do outro. BUILD só sai por PRE_DROP, por DROP, ou por a energia
    // DESISTIR (o build que não resolve) — e nesse caso vai para BREAKDOWN, não para GROOVE.
    if (state.grid && barsLeft <= F.preDropBars && conf > F.preDropMinConf) {
      setState('PRE_DROP', `PRE_DROP: ${barsLeft.toFixed(1)} bar até frase · conf ${conf.toFixed(2)}`);
    } else if (canSwitch && state.kickPresence > 0.55) {
      setState('GROOVE', 'bombo voltou sem drop — build desfez-se');
    } else if ((nowL - state.fsmSince) / 1000 > F.buildGiveUpSec && slope < 0) {
      setState('BREAKDOWN', `build desistiu (${slope.toFixed(3)}/bar)`);
    }
  } else if (state.fsm === 'BREAKDOWN') {
    const held = (nowL - state.fsmSince) / 1000 >= F.breakdownMinSec;
    if (held && (slope > F.riseSlope || highSlope > F.highRiseSlope)) {
      setState('BUILD', `energia/hi-hats a subir (${slope.toFixed(3)}/bar, hi ${highSlope.toFixed(3)})`);
    } else if (held && state.kickPresence > 0.5) {
      setState('GROOVE', 'bombo estabilizou sem drop');
    }
  } else { // GROOVE
    if (canSwitch && kickGapSec > F.kickDeadSec && musicPlaying) {
      setState('BREAKDOWN', `bombo parou há ${kickGapSec.toFixed(1)}s`);
      queueGestures(MUSIC.gesture.dark, Math.round(rngRange(MUSIC.gesture.chainRange)), 'breakdown');
    } else if (canSwitch && state.kickPresence < 0.6 &&
               (slope > F.riseSlope || highSlope > F.highRiseSlope) &&
               (state.barEnergy.length >= F.buildBars || state.secEnergy.length >= F.buildBars * 2)) {
      // o build tira o bombo; com o bombo cheio a subir energia é só um crescendo de groove
      setState('BUILD', `energia sobe (${slope.toFixed(3)}/bar, hi ${highSlope.toFixed(3)})`);
      queueGestures(MUSIC.gesture.dark, Math.round(rngRange(MUSIC.gesture.chainRange)), 'build');
    }
  }

  // ---- profundidade do pre-drop ∝ confiança (§3.3) ----
  let preT = 0;
  if (state.fsm === 'PRE_DROP') preT = F.preDropDepth * conf * smooth(clamp(1 - barsLeft / F.preDropBars, 0, 1));
  state.preDropAmount = ease(state.preDropAmount, preT, [0.25, 0.9], dt);
  void dt;
}

/* ============================== Camada 1 — mapeamento forte ==============================
 * Já não passa por (V,A) nem por âncoras genéricas. Cada knob tem a sua fonte e a sua
 * amplitude — e a amplitude é grande de propósito: o feedback do David foi "não se nota
 * variações de nada". */
function computeTargets() {
  const T = state.target, M = MUSIC.map;
  const ref = Math.max(MUSIC.norm.floor, lerp(1, state.loudAvg, MUSIC.norm.refMix));
  const loudN = clamp(state.loudShort / ref, 0, 1);
  const f = state.feat;
  const onset = f ? clamp(+f.onset || 0, 0, 1) : 0;

  if (MUSIC.profile === 'acustico') {
    // sem grelha, rpm ← loudness, sem gestos (§0.1 ponto 6)
    T.rpm = lerp(0.15, 1.60, loudN);
    T.spot = lerp(0.35, 1.20, loudN);
    T.beamInt = lerp(0.03, 0.12, loudN);
    T.beams = lerp(4, 28, loudN);
    T.haze = lerp(0.30, 0.70, 1 - state.bassShort);
    T.opacity = lerp(0.45, 1.00, loudN);
  } else if (MUSIC.profile === 'voz') {
    // rotação lenta constante, feixes ← high
    const hi = clamp(state.highAvg * 0.7 + onset * 0.3, 0, 1);
    T.rpm = 0.30;
    T.spot = lerp(0.40, 1.00, loudN);
    T.beamInt = lerp(0.03, 0.16, hi);
    T.beams = lerp(4, 34, hi);
    T.haze = lerp(0.35, 0.65, 1 - state.bassShort);
    T.opacity = lerp(0.55, 1.00, loudN);
  } else {
    /* ---------------- electronica: o mapeamento forte ---------------- */
    // rpm ← kickPresence × energia. O joelho evita o meio-termo morno: abaixo de `rpmKnee` a
    // bola está PARADA (é a leitura do David: "se para o bombo, pode parar a rotacao").
    const p = state.kickPresence;
    const idle = lerp(M.rpmIdle[0], M.rpmIdle[1], loudN);
    const drive = lerp(M.rpmDrive[0], M.rpmDrive[1], loudN);
    const pk = p <= M.rpmKnee ? 0 : (p - M.rpmKnee) / (1 - M.rpmKnee);
    T.rpm = lerp(idle, drive, smooth(pk));

    // spots ← loudness (base); o foco dominante e a troca de 8 compassos são aplicados na saída
    T.spot = lerp(M.spotBase[0], M.spotBase[1], loudN);

    // feixes ← high + onset: os hi-hats e a voz "seguem o tempo"
    const hi = clamp(M.beamHighMix * state.highAvg + (1 - M.beamHighMix) * onset, 0, 1);
    T.beamInt = lerp(M.beamIntFrom[0], M.beamIntFrom[1], hi);
    T.beams = lerp(M.beamsFrom[0], M.beamsFrom[1], hi);

    // haze ← INVERSO de bass: breakdown (graves fora) = fumo. Lento (tau 1.5/4).
    T.haze = lerp(M.hazeFrom[0], M.hazeFrom[1], clamp(1 - state.bassShort, 0, 1));

    // opacity ← loudness curto, com piso em GROOVE
    T.opacity = lerp(M.opacityFrom[0], M.opacityFrom[1], loudN);
    if (state.fsm === 'GROOVE') T.opacity = Math.max(T.opacity, M.opacityFloorGroove);

    // ---- comportamentos por estado (a camada 1 só prepara o terreno; os gestos fazem o resto)
    switch (state.fsm) {
      case 'BUILD':
        // contenção: os feixes REDUZEM, o haze sobe. É a contenção que dá valor ao que abre.
        T.beams *= 0.60; T.beamInt *= 0.75;
        T.haze = clamp(T.haze * 1.20, 0.05, 1);
        break;
      case 'PRE_DROP': {
        const pd = state.preDropAmount;   // ∝ confiança: falha graciosa por desenho
        T.spot = lerp(T.spot, 0.10, pd);
        T.beamInt = lerp(T.beamInt, 0.02, pd);
        T.beams = lerp(T.beams, 3, pd);
        T.opacity = lerp(T.opacity, 0.40, pd * 0.8);
        T.haze = clamp(lerp(T.haze, 0.92, pd * 0.6), 0.05, 1);
        break;
      }
      case 'DROP':
        // o gesto `all-on` faz o trabalho; aqui só garantimos que a camada 1 não puxa para baixo
        T.opacity = Math.max(T.opacity, 0.85);
        break;
      case 'BREAKDOWN':
        // o gesto escolhido manda; a camada 1 só tira o chão ao que sobra
        T.haze = clamp(Math.max(T.haze, 0.70), 0.05, 1);
        break;
      default: {
        // GROOVE — 80-90% do tempo (§3.6). Nada pisca: deriva lenta e acentos de frase.
        const t = MB_CLOCK.now() / 1000;
        T.haze = clamp(T.haze * (1 + 0.06 * Math.sin(TAU * t / 47)), 0.05, 1);
        T.spot = clamp(T.spot * (1 + 0.05 * Math.sin(TAU * t / 61 + 1.7)), 0, 1.6);
        T.spot = clamp(T.spot * (1 + 0.15 * state.phraseAccent), 0, 1.6);
        break;
      }
    }
  }
  state.phraseAccent *= 0.985;
}

/* ================================ arbitragem + escrita ================================ */
function onOwnerChange(owner) {
  if (owner === 'music') {
    // ao ganhar a posse, parte-se dos valores ATUAIS do CONFIG e rampa-se (§2.4): nunca corte
    const MB = window.MIRRORBALL;
    if (MB) {
      const C = MB.config;
      state.out.rpm = C.rotationRpm; state.out.haze = C.haze;
      state.out.opacity = C.sphereOpacity; state.out.beamInt = C.beamIntensity;
      state.out.beams = C.beamMaxCount;
      const s0 = C.spots[0];
      state.out.spot = s0 && s0._base ? clamp(s0.intensity / s0._base, 0, 1.6) : state.out.spot;
      // §0.1 ponto 1: o motor NÃO atua sobre a cor. Mas 'auto' sem fonte de tom deixaria a
      // bola presa num alvo que ninguém escreve — por isso, UMA vez, ao entrar em música,
      // fixamos 'dark' (a sala de clube). A partir daí é o botão skin / tecla `w` que manda.
      if (!state.skinForced && C.skin === 'auto' && MB.setSkin) { MB.setSkin('dark'); state.skinForced = true; }
    }
    state.handoverT = MB_CLOCK.now();
  }
  state.owner = owner;
}
if (window.MB_SOURCE) { state.owner = window.MB_SOURCE.owner; window.MB_SOURCE.on(onOwnerChange); }
if (state.owner === 'music') onOwnerChange('music');

function applyToBall(o, gestInfo) {
  const MB = window.MIRRORBALL; if (!MB) return;
  const C = MB.config;
  C.rotationRpm = clamp(o.rpm, MUSIC.outMin.rpm, MUSIC.outMax.rpm);
  C.haze = clamp(o.haze, MUSIC.outMin.haze, MUSIC.outMax.haze);
  C.beamMaxCount = Math.round(clamp(o.beams, 0, MUSIC.outMax.beams));
  C.beamIntensity = clamp(o.beamInt, 0, MUSIC.outMax.beamInt);       // teto inviolável 0.18
  C.sphereOpacity = clamp(o.opacity, MUSIC.outMin.opacity, 1);
  C.spotFadeMix = 0;   // §3.6: os fades internos (11/17/13 s) não são períodos musicais
  // ⚠ NADA de setSkinAuto aqui (§0.1 ponto 1): a skin é do utilizador, ponto final.
  if (MB.setHealth && MB.getHealth() !== state.health) MB.setHealth(state.health);

  // coreografia dos 3 focos, individualmente
  const M = MUSIC.map;
  const solo = gestInfo && gestInfo.solo, w = gestInfo ? gestInfo.w : 0;
  const swapBar = gestInfo && gestInfo.swapEveryBar;
  const dom = swapBar ? (state.bar % (C.spots.length || 3)) : state.domSpot;
  C.spots.forEach((s, i) => {
    if (s._base == null) s._base = s.intensity;
    let g = i === dom ? M.spotDomGain : M.spotSubGain;
    // `single-beam`: um foco a 1.4 e os outros a 0 — mas por rampa, como tudo o resto
    if (solo) g = lerp(g, i === dom ? 1.0 : 0.0, w);
    MB.setSpot(i, { intensity: clamp(s._base * o.spot * g, 0, 1.6) });
  });
}

/* ==================================== loop principal ==================================== */
function update(nowL) {
  const dt = clamp((nowL - state.lastT) / 1000, 0, 0.1);

  // silêncio (§3.5): sem isto a bola congela no último frame e parece bug
  const stale = nowL - state.lastFeatLocal > MUSIC.silence.noFeaturesMs;
  const dead = stale || state.silent;
  const rate = dt / MUSIC.silence.decaySec;
  state.health = dead ? Math.max(0, state.health - rate) : Math.min(1, state.health + rate * 2);
  // sem features, o bombo também morre — senão a rotação ficava presa no último valor
  if (dead) state.kickPresence = ease(state.kickPresence, 0, MUSIC.kick.presenceTau, dt);

  emitLocalGrid(nowL);
  updateGrid(nowL);
  updateFsm(nowL, dt);
  updateGestures(nowL, dt);
  computeTargets();
  const gestInfo = applyGesture(state.target);

  // rampa de posse: logo após ganhar o CONFIG, suaviza mais ainda (nunca corte)
  const hand = clamp((nowL - state.handoverT) / (MUSIC.handover.rampSec * 1000), 0, 1);
  const slow = lerp(2.5, 1, hand);
  const o = state.out;
  // O bombo parou e a camada 1 já quer a bola parada → release curto do rpm (`rpmStopTau`).
  // ⚠ Só se o gesto ativo NÃO comandar o rpm: `blind-spin`/`freeze`/`fog` mandam no rpm de
  // propósito e não podem ser atropelados; `strobe-slow`/`breath`/`ghost` nem lhe tocam, e
  // bloquear por "há um gesto" fazia a bola levar 5 s a parar durante um gesto que nem era
  // do rpm (medido: alvo em 0.12 ao fim de 1.2 s, saída ainda em 0.30 aos 4.9 s).
  const gestOwnsRpm = !!(gestInfo && gestInfo.owns && gestInfo.owns.rpm);
  const stopping = MUSIC.profile === 'electronica' && state.kickPresence < MUSIC.map.rpmKnee &&
                   state.target.rpm < o.rpm && !gestOwnsRpm;
  for (const k in o) {
    const gt = gestInfo && gestInfo.taus[k];
    let tau = gt || MUSIC.tau[k];
    if (k === 'rpm' && stopping && !gt) tau = [tau[0], MUSIC.rpmStopTau];
    o[k] = ease(o[k], state.target[k], [tau[0] * slow, tau[1] * slow], dt);
    o[k] = clamp(o[k], MUSIC.outMin[k] != null ? MUSIC.outMin[k] : -Infinity,
                       MUSIC.outMax[k] != null ? MUSIC.outMax[k] : Infinity);
  }

  const owner = window.MB_SOURCE ? window.MB_SOURCE.owner : 'manual';
  if (owner === 'music') {
    applyToBall(o, gestInfo);
    if (window.BRIDGE) window.BRIDGE.send({ rpm: o.rpm, spotGain: o.spot, haze: o.haze, valence: 0, arousal: state.kickPresence, health: state.health });
  }

  emitState(nowL, o);
  updateHud(o);
  state.lastT = nowL;
}

function emitState(nowL, o) {
  if (nowL - state.lastEmit < 1000 / MUSIC.emit.stateHz) return;
  state.lastEmit = nowL;
  const msg = {
    type: 'mb-state', state: state.fsm, sinceMs: Math.round(nowL - state.fsmSince),
    bar: state.bar, phrase: state.phrase,
    bpm: state.bpmEst ? 60000 / state.bpmEst : 0,
    confidence: state.gridConf, beatPhase: state.beatPhase,
    kickPresence: state.kickPresence, kickRate: state.kickRate, loudness: state.loudAvg,
    profile: MUSIC.profile, gesture: state.gest ? state.gest.name : null, gestureWeight: state.gestWeight,
    gen: GEN.on, out: Object.assign({}, o),
  };
  try { if (typeof parent !== 'undefined' && parent !== window) parent.postMessage(msg, '*'); } catch (e) { /* cross-origin */ }
}

/* ========================= GERADOR SINTÉTICO (testes / demo sem sidecar) =========================
 * 126 BPM, 4/4, frases de 16 compassos, com KICKS reais (onset + bass altos) em GROOVE/DROP e
 * SEM kicks em BREAKDOWN/BUILD — para o detetor de bombo ter algo para detetar. NÃO emite grelha:
 * a grelha nasce do detetor, como com o sidecar. Etiqueta `hint` só para se identificar como
 * sintético (o motor já não o lê para decidir nada). `g` liga/desliga · `n` próxima fase.
 */
const GEN = (() => {
  const on = { v: MUSIC.gen.enabled };
  let t0 = MB_CLOCK.now();
  let lastFeat = 0, lastExternal = -Infinity, lastExternalGrid = -Infinity;
  let cycle = 0, phase = 'GROOVE', forced = false, forcedShift = 0;

  function bpmToPeriod() { return 60000 / MUSIC.gen.bpm; }

  function phaseAt(bar) {
    const G = MUSIC.gen;
    const cyc = G.grooveBars + G.buildBars;
    const withBreak = cyc + G.breakdownBars;
    let b = bar, c = 0;
    for (;;) {
      const isBreakCycle = ((c + 1) % G.breakdownEveryCycles) === 0;
      const len = isBreakCycle ? withBreak : cyc;
      if (b < len) {
        if (b < G.grooveBars) return { p: 'GROOVE', c, inBar: b };
        if (b < cyc) return { p: 'BUILD', c, inBar: b - G.grooveBars };
        return { p: 'BREAKDOWN', c, inBar: b - cyc };
      }
      b -= len; c++;
    }
  }

  function tick(nowL) {
    if (!on.v) return;
    if (nowL - lastExternal < MUSIC.gen.externalGraceMs) return;   // emissor externo manda
    const G = MUSIC.gen, period = bpmToPeriod();
    const beats = (nowL - t0) / period;
    const bar = Math.floor(beats / G.beatsPerBar);
    const barPhase = (beats / G.beatsPerBar) % 1;
    const info = phaseAt(bar + (forced ? forcedShift : 0));
    phase = info.p; cycle = info.c;
    const inBar = info.inBar;

    if (nowL - lastFeat < 1000 / G.featureHz) return;
    lastFeat = nowL;

    const beatPhase = beats % 1;
    // 4-on-the-floor: um kick por tempo, envelope curto. Só em GROOVE e no DROP.
    const kickEnv = Math.exp(-beatPhase * 14);
    const hat = ((beats * 2) % 1) < 0.08 ? 0.30 : 0;

    let loud = 0.42, bassBase = 0.55, mid = 0.40, high = 0.28, centroid = 0.38;
    let hasKick = true;
    if (phase === 'BUILD') {
      const p = clamp(inBar / G.buildBars, 0, 1);
      loud = lerp(0.44, 0.74, p);
      bassBase = lerp(0.30, 0.10, p);       // graves saem (high-pass do build)
      mid = lerp(0.40, 0.62, p); high = lerp(0.32, 0.82, p); centroid = lerp(0.38, 0.80, p);
      hasKick = false;                       // §0.1: o build tira o bombo
    } else if (phase === 'BREAKDOWN') {
      const p = clamp(inBar / G.breakdownBars, 0, 1);
      loud = lerp(0.32, 0.26, p); bassBase = 0.16; mid = 0.30; high = 0.22; centroid = 0.30;
      hasKick = false;
    }

    // DROP: o compasso a seguir ao build, no tempo 1 da frase — bombo VOLTA com força
    const isDropBar = phase === 'GROOVE' && inBar === 0 && bar > 0 && barPhase < 0.25;
    if (isDropBar) { loud = 0.95; bassBase = 0.60; mid = 0.70; high = 0.62; centroid = 0.45; hasKick = true; }

    // `bass` no sidecar é normalizado a bandMax: o kick empurra a forma do espectro para os
    // graves. Reproduzimos isso — base baixa + pico no kick — para o detetor ver o que verá.
    const kickAmt = hasKick ? kickEnv : 0;
    const bass = clamp(bassBase + 0.42 * kickAmt, 0, 1);
    const onset = clamp((hasKick ? 0.85 * kickEnv : 0) + hat + (isDropBar ? 0.3 : 0), 0, 1);
    const rms = clamp(loud * (0.65 + 0.35 * kickAmt), 0, 1);

    post({
      type: 'features', t: nowL, rms, bass, mid, high, centroid,
      onset, loudness: loud, silence: false, hint: phase,
    });
  }

  function nextPhase() {
    const G = MUSIC.gen, period = bpmToPeriod();
    const bar = Math.floor((MB_CLOCK.now() - t0) / (period * G.beatsPerBar));
    const cur = phaseAt(bar + forcedShift).p;
    for (let i = 1; i < 512; i++) if (phaseAt(bar + forcedShift + i).p !== cur) { forcedShift += i; forced = true; return; }
  }

  function post(msg) {
    if (typeof postMessage === 'function') postMessage(msg, '*');
    else onMessage(msg);
  }

  return {
    tick, nextPhase,
    get on() { return on.v; },
    toggle() { on.v = !on.v; if (on.v) { t0 = MB_CLOCK.now(); } },
    markExternal(t) { lastExternal = t; },
    markExternalGrid(t) { lastExternalGrid = t; },
    isExternal() { return MB_CLOCK.now() - lastExternal < MUSIC.gen.externalGraceMs; },
    isExternalGrid() { return MB_CLOCK.now() - lastExternalGrid < MUSIC.gen.externalGraceMs; },
    answerClock(req) { post({ type: 'clock', id: req.id, tClient: req.tClient, tEmit: MB_CLOCK.now() }); },
    get phase() { return phase; }, get cycle() { return cycle; },
  };
})();

/* ==================================== HUD (tecla m) ==================================== */
const hud = (typeof document !== 'undefined' && document.getElementById) ? document.getElementById('mus') : null;
function bar12(v, n = 12) { return '█'.repeat(Math.round(clamp(v, 0, 1) * n)).padEnd(n, '·'); }
function updateHud(o) {
  if (!hud || !hud.classList.contains('on')) return;
  const g = state.grid, nowL = MB_CLOCK.now();
  const bpm = state.bpmEst ? 60000 / state.bpmEst : 0;
  const posBar = g ? ((state.bar % g.barsPerPhrase) + g.barsPerPhrase) % g.barsPerPhrase : 0;
  const MB = window.MIRRORBALL;
  const lines = [
    `estado  ${state.fsm.padEnd(10)} ${((nowL - state.fsmSince) / 1000).toFixed(1)}s` +
      (state.fsm === 'PRE_DROP' ? `  ↓${state.preDropAmount.toFixed(2)}` : '') +
      (state.fsm === 'DROP' ? `  ↑${state.dropOpen.toFixed(2)}${state.restrainThis ? ' (contido)' : ''}` : ''),
    `BOMBO   ${bar12(state.kickPresence, 16)} ${state.kickPresence.toFixed(2)}   ${state.kickRate.toFixed(1)} kicks/s   gap ${((nowL - state.lastKickT) / 1000).toFixed(1)}s`,
    `grelha  bar ${state.bar} (${posBar + 1}/${g ? g.barsPerPhrase : '—'})  frase ${state.phrase}  ${bpm ? bpm.toFixed(1) : '—'} bpm  conf ${state.gridConf.toFixed(2)}`,
    `batida  ${bar12(state.beatPhase, 16)}  bar ${bar12(state.barPhase, 16)}`,
    `gesto   ${(state.gest ? state.gest.name : '—').padEnd(12)} peso ${state.gestWeight.toFixed(2)}  fila [${state.gestQueue.join(' ')}]  total ${state.gestCount}`,
    `perfil  ${MUSIC.profile}  (tecla p)   skin ${MB && MB.getSkin ? MB.getSkin().mode : '—'} (tecla w — do utilizador, o motor não lhe toca)`,
    `saída   opac ${o.opacity.toFixed(2)} rpm ${o.rpm.toFixed(2)} beams ${Math.round(o.beams)} bInt ${o.beamInt.toFixed(3)} haze ${o.haze.toFixed(2)} spot ${o.spot.toFixed(2)}`,
    `dono ${window.MB_SOURCE ? window.MB_SOURCE.owner : '—'}  health ${state.health.toFixed(2)}  spot dom ${state.domSpot}  gerador ${GEN.on ? 'ON (' + GEN.phase + ' c' + GEN.cycle + ')' : 'off'}  clock ±${MB_CLOCK.offset.toFixed(1)}ms`,
    '',
    'eventos (g gerador · n próxima fase · p perfil · w skin)',
  ];
  for (const e of state.log) {
    lines.push(`  ${((nowL - e.t) / 1000).toFixed(1).padStart(6)}s  ${e.note ? '·' : e.from + '→' + e.to}  ${e.why}`);
  }
  hud.textContent = lines.join('\n');
}

if (typeof addEventListener === 'function') {
  addEventListener('keydown', ev => {
    if (!ev || !ev.key) return;
    const k = ev.key.toLowerCase();
    if (k === 'm' && hud) hud.classList.toggle('on');
    else if (k === 'g') GEN.toggle();
    else if (k === 'n') GEN.nextPhase();
    else if (k === 'p') setProfile(PROFILES[(PROFILES.indexOf(MUSIC.profile) + 1) % PROFILES.length]);
  });
}

/* ============================ config sobreponível (§5) ============================ */
function deepMerge(dst, src) {
  for (const k in src) {
    const v = src[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object' && !Array.isArray(dst[k])) deepMerge(dst[k], v);
    else dst[k] = v;
  }
  return dst;
}
if (typeof fetch === 'function') {
  fetch('music.config.json', { cache: 'no-store' })
    .then(r => r.ok ? r.json() : null)
    .then(j => {
      if (j && typeof j === 'object') {
        deepMerge(MUSIC, j);
        if (MUSIC.gesture.seed) RNG = makeRng(MUSIC.gesture.seed);
        console.log('[music] music.config.json aplicado');
      }
    })
    .catch(() => { /* ficheiro opcional; ausência é o caso normal */ });
}

/* ======================================= arranque ======================================= */
window.MUSIC = {
  config: MUSIC, state, gen: GEN, clock: MB_CLOCK, update, onMessage,
  gestures: GESTURE_NAMES, setProfile,
  setSeed(s) { RNG = makeRng(s); },
};

if (typeof requestAnimationFrame === 'function') {
  (function loop() {
    const nowL = MB_CLOCK.now();
    GEN.tick(nowL);
    update(nowL);
    requestAnimationFrame(loop);
  })();
  for (let i = 0; i < 5; i++) setTimeout(() => MB_CLOCK.request(), 120 + i * 180);
  setInterval(() => MB_CLOCK.request(), 10000);
}

})();
