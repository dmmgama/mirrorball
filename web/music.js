/* music.js — motor musical da bola (Mirrors of Emotions, Fase 2).
 *
 * Plano: agent-os/docs/2026-08-28_mirrors-of-emotions-plan.md
 * O briefing (§0) não pede um visualizador: pede um técnico de luz competente. Um técnico
 * não reage a cada batida — conhece a faixa, contém-se no build, escurece antes do drop e abre
 * no primeiro tempo do compasso certo. Por isso este ficheiro não é um envelope follower:
 * é uma máquina de estados sobre uma grelha métrica, alimentada por features contínuas.
 *
 * Na Fase 2 ainda não há áudio real. O que se fecha aqui é o CONTRATO DE MENSAGENS e a
 * ESTRUTURA do motor: um gerador sintético emite pelo mesmo caminho que o sidecar vai usar
 * (postMessage para a própria window), para o motor não conseguir distinguir os dois.
 *
 * ============================== CONTRATO DE MENSAGENS ==============================
 * Todas as mensagens chegam por `postMessage` à window do iframe (do pai, ou do gerador
 * local). Todas têm `type`. Origem não é validada: é loopback local (mesma regra do core.js).
 *
 * 1) FEATURES — contínuas, ~50 Hz. Valores 0..1 salvo indicação.
 *    { type:'features',
 *      t,            // ms, RELÓGIO DO EMISSOR (não o nosso). Traduzido por MB_CLOCK.toLocal()
 *      rms,          // 0..1  energia instantânea (janela ~20 ms)
 *      bass,         // 0..1  energia da banda grave   (~20-250 Hz)
 *      mid,          // 0..1  energia da banda média   (~250-2k Hz)
 *      high,         // 0..1  energia da banda aguda   (~2k-16k Hz)
 *      centroid,     // 0..1  centroide espectral já normalizado (0 = escuro, 1 = brilhante)
 *      onset,        // 0..1  força do onset NESTE frame (0 na maioria dos frames; impulso)
 *      loudness,     // 0..1  LOUDNESS INTEGRADO, janela 10-30 s, com gate de silêncio,
 *                    //       JÁ NORMALIZADO PELO EMISSOR. Não é um seguidor de picos
 *                    //       (ver §1.1: o `adapt` do emotion-v2.js é proibido aqui).
 *      silence,      // bool  true = o emissor não vê buffers há ≥500 ms (§3.5)
 *      hint }        // string|null — SÓ do gerador sintético (Fase 2). O detetor real
 *                    //       (Fase 7) não o envia; o motor tem de funcionar sem ele.
 *
 * 2) GRELHA — a cada compasso, ou quando muda. NÃO viaja como evento (§2.2): viaja como
 *    PREVISÃO, e o iframe extrapola a fase localmente a partir de t0 + n·beatPeriodMs.
 *    { type:'grid', v:1,
 *      t0,             // ms, relógio do emissor: timestamp do ÚLTIMO DOWNBEAT observado
 *      beatPeriodMs,   // 60000/BPM
 *      beatsPerBar,    // 4
 *      barsPerPhrase,  // 16
 *      barIndex,       // nº de compasso desde o início da sessão (o compasso que começa em t0)
 *      phraseIndex,    // nº de frase desde o início da sessão
 *      confidence }    // 0..1 — confiança do tracker. Comanda a PROFUNDIDADE do pre-drop (§3.3)
 *
 * 3) RELÓGIO — handshake NTP simplificado. O iframe pede, o emissor devolve:
 *      iframe → emissor: { type:'clock-req', id, tClient }          (tClient = performance.now())
 *      emissor → iframe: { type:'clock',     id, tClient, tEmit }   (tEmit = relógio do emissor)
 *    RTT = now − tClient; offset = tEmit + RTT/2 − now. Guardamos as 5 amostras de MENOR RTT
 *    e usamos a MEDIANA dos seus offsets. `MB_CLOCK.toLocal(tRemote) = tRemote − offset`.
 *    Na Fase 2 o emissor é o próprio iframe → offset ≈ 0, mas a estrutura tem de existir,
 *    porque sem ela a Camada 3 não funciona com o sidecar (§2.2).
 *
 * 4) ESTADO (saída, opcional) — o iframe → pai, 4 Hz, para HUD externo no futuro:
 *      { type:'mb-state', state, sinceMs, bar, phrase, bpm, confidence, beatPhase,
 *        V, A, loudness, profile, out:{…knobs…}, gen }
 *
 * ===================================================================================
 * Arbitragem (§2.4): o estado interno evolui SEMPRE, mas só se escreve no CONFIG /
 * setSpot / setSkinAuto / BRIDGE se MB_SOURCE.owner === 'music'. Ao ganhar a posse
 * parte-se dos valores ATUAIS do CONFIG e rampa-se — nunca corte. Ao perder, para.
 *
 * Tetos invioláveis (§1.2): beamIntensity ≤ 0.18 · nada oscila acima de 3 Hz · greyscale.
 *
 * Afinação (§5): tudo em window.MUSIC.config, sobreponível por `music.config.json` na
 * mesma pasta (opcional; não é criado por nós). Teclas: `m` HUD · `g` gerador · `n` fase.
 */
'use strict';
(() => {

const { clamp, lerp, smooth, anchor, ease } = window.MB_CORE;

/* ============================ MB_CLOCK — NTP simplificado ============================ */
// Estimador de offset entre o relógio do emissor e o `performance.now()` local. Guarda as
// amostras de menor RTT e usa a mediana dos offsets — mediana e não média porque uma única
// amostra com jitter alto (GC, tab em background) envenena a média e desloca a fase do drop.
const MB_CLOCK = (() => {
  const KEEP = 5;
  let samples = [];          // { rtt, offset }
  let offset = 0, reqId = 0;
  const pending = new Map(); // id → tClient

  function request(target) {
    const id = ++reqId, tClient = now();
    pending.set(id, tClient);
    // no futuro: o pai reencaminha para o sidecar. Na Fase 2 responde o gerador local.
    const ext = window.MUSIC && window.MUSIC.gen && window.MUSIC.gen.isExternal && window.MUSIC.gen.isExternal();
    const to = target || (ext && window.parent !== window ? window.parent : window);
    to.postMessage({ type: 'clock-req', id, tClient }, '*');
    // limpeza: pedidos sem resposta ao fim de 5 s deixam de contar
    if (pending.size > 32) for (const [k, v] of pending) if (now() - v > 5000) pending.delete(k);
  }

  function ingest(msg) {
    const tClient = pending.get(msg.id);
    if (tClient == null) return;
    pending.delete(msg.id);
    const tRecv = now(), rtt = tRecv - tClient;
    // t_emissor no instante local (tClient+tRecv)/2 é tEmit → offset = tEmit − meio
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
// music.config.json (deep-merge) sem rebuild — a afinação é subjetiva e vai ser iterada.
const MUSIC = {
  /* ---- Camada 1: features → (V, A) ---- */
  // Normalizador NOVO (§1.1). NÃO é o `adapt` do emotion-v2.js (seguidor de picos, release
  // de 3-5 min, adormecia a bola ao passar de techno para ambiente). Isto é uma MÉDIA com
  // janela de 20 s e gate de silêncio: o que o LUFS integrado faz.
  norm: {
    windowSec: 20,        // janela da média integrada
    gate: 0.02,           // abaixo disto não conta para a média (gate de silêncio)
    floor: 0.12,          // piso do divisor: evita amplificar ruído numa sala silenciosa
    refMix: 0.75,         // 0 = escala fixa, 1 = totalmente relativa à janela
    shortSec: 0.35,       // janela curta que alimenta o arousal (o drop morde, o kick não)
  },
  // Arousal ← loudness integrado + densidade de onsets + andamento.
  arousal: {
    wLoud: 0.60, wOnset: 0.25, wTempo: 0.15, bpmLo: 90, bpmHi: 140,
    onsetMin: 0.25,        // abaixo disto não conta como onset (ruído de banda)
    onsetRateFull: 8,      // onsets/s que equivalem a densidade 1.0
    onsetWindowSec: 3.0,   // janela de suavização da TAXA — longa de propósito: a densidade
                           // é uma propriedade da secção, não do compasso
  },
  // Valência ← centroide + rácio de graves. ⚠ §3.1: o mapeamento herdado das caras faria
  // techno escuro com hi-hats ler como "brilhante" e puxar a sala para branco. Aqui o
  // centroide é centrado em `centroidNeutral` e o peso é BAIXO; o corpo (graves) domina.
  valence: {
    wCentroid: 0.35, centroidNeutral: 0.45, wBass: 0.45, bassNeutral: 0.40, bias: 0.05,
    bandWindowSec: 1.2,   // janela das bandas antes da valência: mata o pulsar por kick
  },
  // SEM `contrast` (§1.1): o smoothstep 1.4 empurra para os polos e mata o meio, e o meio é
  // a respiração da música. Pole-pushing é o gerador plausível das "reações básicas" banidas.

  /* ---- Âncoras por variável (padrão do emotion-v2.js; valores re-derivados) ----
   * V-driven: [polo escuro, base, polo brilhante] · A-driven: [calmo, base, excitado] */
  tone:    { by: 'V', k: [0.00, 0.06, 0.35] },  // clube = sala escura. Branco é exceção, não base
  opacity: { by: 'A', k: [0.30, 0.80, 1.00] },  // breakdown = fantasma; drop = sólida
  rpm:     { by: 'A', k: [0.55, 0.95, 2.20] },  // objeto pesado: nunca perto de 3.0
  beams:   { by: 'A', k: [3,    18,   48  ] },
  beamInt: { by: 'A', k: [0.05, 0.11, 0.18] },  // TETO 0.18 — clamp duro à saída
  haze:    { by: 'A', k: [0.30, 0.55, 0.85], vBias: -0.10 },
  spot:    { by: 'A', k: [0.45, 0.85, 1.45], vBias: 0.10 },

  // τ (s) [attack, release]. Re-derivados: attack rápido SÓ em spot/beamInt (é neles que o
  // drop tem de morder); rpm/opacity/haze são lentos de propósito — a bola é um objeto com
  // inércia, e é a lentidão que impede o "pisca-pisca" que o §6 marca como falha.
  tau: {
    spot: [0.10, 0.70], beamInt: [0.10, 0.70], beams: [0.35, 1.60],
    tone: [1.20, 4.00], rpm: [1.50, 5.00], opacity: [0.90, 3.50], haze: [1.60, 6.00],
    V: [0.60, 2.00], A: [0.35, 1.40],
  },
  outMin: { spot: 0.10, opacity: 0.05, haze: 0.05, rpm: 0.10, beamInt: 0, beams: 0, tone: 0 },
  outMax: { spot: 1.60, opacity: 1.00, haze: 1.00, rpm: 3.00, beamInt: 0.18, beams: 56, tone: 1 },

  /* ---- Camada 2: grelha ---- */
  grid: {
    staleMs: 8000,        // grelha mais velha que isto = sem grelha
    rotBeats: 1,          // easing da rotação: 1 tempo (§3.2)
    spotSwapBars: 8,      // troca de spot dominante na fronteira de 8 compassos (§3.6)
    spotDomGain: 1.25, spotSubGain: 0.72,
  },

  /* ---- Camada 3: máquina de estados ---- */
  fsm: {
    buildBars: 4,             // energia a subir ≥4 compassos → BUILD
    riseSlope: 0.020,         // subida mínima de energia por compasso para contar como build
    fallSlope: -0.025,        // queda mantida → BREAKDOWN
    preDropBars: 0.5,         // ≤ ½ compasso da fronteira de frase → PRE_DROP (§3.3)
    preDropMinConf: 0.35,     // abaixo disto nem se tenta antecipar
    preDropDepth: 0.85,       // profundidade máxima do escurecimento (×confiança)
    dropTimeoutBars: 2,       // drop não veio em 2 compassos → volta por RAMPA, nunca corte
    dropHoldBars: 2,          // duração da abertura
    breakdownMinBars: 2,
    minStateMs: 600,          // anti-flicker entre estados
    onsetPlausible: 0.55,     // gate de plausibilidade do DROP (§3.3): onset largo e sustentado
  },

  /* ---- Silêncio (§3.5) ---- */
  silence: { noFeaturesMs: 500, decaySec: 4.0 },

  /* ---- Arbitragem ---- */
  handover: { rampSec: 1.5 },

  /* ---- Saída de estado para o pai ---- */
  emit: { stateHz: 4 },

  /* ---- Gerador sintético (Fase 2) ---- */
  gen: {
    enabled: true, bpm: 126, beatsPerBar: 4, barsPerPhrase: 16,
    featureHz: 50, confidence: 0.92,
    grooveBars: 32, buildBars: 16, breakdownBars: 16, breakdownEveryCycles: 3,
    externalGraceMs: 2000,    // emissor externo nos últimos 2 s → o gerador cala-se
  },
};

/* ================================== estado do motor ================================== */
const state = {
  // features
  feat: null, lastFeatLocal: -Infinity, silent: true,
  loudAvg: 0, loudAccT: 0, loudShort: 0, bassAvg: 0, centroidAvg: 0.45,
  V: 0, A: 0, Vraw: 0, Araw: 0,
  onsetDensity: 0, onsetCount: 0, onsetCountPrev: 0, lastOnsetT: -Infinity,
  // grelha
  grid: null, gridLocalT0: 0,
  bar: 0, phrase: 0, beatPhase: 0, barPhase: 0, phrasePhase: 0,
  lastBarSeen: -1,
  // energia por compasso (para as inclinações da FSM)
  barEnergy: [], barEnergyAcc: 0, barEnergyN: 0,
  // FSM
  fsm: 'GROOVE', fsmSince: 0, fsmBar: 0, dropDepth: 0, preDropAmount: 0, dropOpen: 0,
  dropCount: 0, restrainThis: false,
  log: [],
  // coreografia
  domSpot: 0, lastSwapBar: -1, phraseAccent: 0,
  // saída
  out: null, target: {}, health: 1,
  owner: null, handoverT: 0,
  lastEmit: 0, lastT: MB_CLOCK.now(),
  profile: 'electronica',
};

function baseOut() {
  return {
    tone: MUSIC.tone.k[1], opacity: MUSIC.opacity.k[1], rpm: MUSIC.rpm.k[1],
    beams: MUSIC.beams.k[1], beamInt: MUSIC.beamInt.k[1], haze: MUSIC.haze.k[1],
    spot: MUSIC.spot.k[1],
  };
}
state.out = baseOut();

function logEvent(to, why) {
  state.log.unshift({ t: MB_CLOCK.now(), from: state.fsm, to, why });
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
// Um único ponto de entrada: gerador e sidecar entram exatamente pela mesma porta.
function onMessage(d) {
  if (!d || typeof d !== 'object') return;
  if (d.type === 'features') return ingestFeatures(d);
  if (d.type === 'grid') return ingestGrid(d);
  if (d.type === 'clock') return MB_CLOCK.ingest(d);
  if (d.type === 'clock-req') return GEN.answerClock(d);
}
if (typeof addEventListener === 'function') addEventListener('message', e => onMessage(e && e.data));

function ingestFeatures(f) {
  const nowL = MB_CLOCK.now();
  // features SEM `hint` só podem vir de um emissor real (o gerador etiqueta sempre).
  // Marcá-lo cala o gerador enquanto houver emissor externo — sem isto os dois escreveriam
  // por cima um do outro assim que o sidecar arrancasse.
  if (f.hint == null) GEN.markExternal(nowL);
  state.feat = f;
  state.lastFeatLocal = nowL;
  state.silent = !!f.silence;

  // loudness integrado com gate — média sobre a janela, não seguidor de picos (§1.1)
  const dt = Math.min(0.1, (state.loudAccT ? nowL - state.loudAccT : 20) / 1000);
  state.loudAccT = nowL;
  const l = +f.loudness || 0;
  if (l > MUSIC.norm.gate && !f.silence) {
    const k = 1 - Math.exp(-dt / MUSIC.norm.windowSec);
    state.loudAvg = state.loudAvg + (l - state.loudAvg) * k;
  }
  // loudness de janela CURTA: é este que alimenta o arousal. Curto o bastante para o drop
  // morder (0.35 s), longo o bastante para não seguir o kick. `loudAvg` (20 s) é só o
  // divisor da normalização — misturar os dois papéis foi o erro do `adapt` do emotion-v2.
  state.loudShort += (l - state.loudShort) * (1 - Math.exp(-dt / MUSIC.norm.shortSec));
  // Bandas suavizadas antes de alimentar a valência. As bandas cruas oscilam a cada kick
  // (é assim a música real, não um defeito do gerador); ler o transiente faria a valência —
  // e portanto o TOM DA SALA — pulsar ao ritmo da batida. A valência quer o *corpo* da
  // secção, não o ataque: por isso passa por uma janela de ~1.2 s antes de ser usada.
  {
    const k = 1 - Math.exp(-dt / MUSIC.valence.bandWindowSec);
    state.bassAvg += ((+f.bass || 0) - state.bassAvg) * k;
    state.centroidAvg += ((+f.centroid || 0) - state.centroidAvg) * k;
  }

  // Densidade de onsets — quantos onsets por segundo, NÃO a força do onset atual.
  // ⚠ Armadilha corrigida na verificação da Fase 2: somar a força do onset a um acumulador
  // com decaimento fá-lo saturar em 1.0 e ondular a cada kick (2.1 Hz a 126 BPM). Essa
  // ondulação atravessava arousal → alvos → TODOS os knobs, e invertia a derivada ao ritmo
  // da batida. Amplitude ínfima (~0.02%), mas é literalmente "reagir a cada batida" — o que
  // o §0 proíbe. A correção é contar EVENTOS (com refratário) e suavizar a TAXA devagar.
  const onsetNow = +f.onset || 0;
  const refractory = 90;                       // ms: dois picos do mesmo kick contam uma vez
  if (onsetNow >= MUSIC.arousal.onsetMin && nowL - state.lastOnsetT > refractory) {
    state.lastOnsetT = nowL;
    state.onsetCount++;
  }
  {   // taxa (onsets/s) → 0..1 contra `onsetRateFull`, suavizada numa janela longa
    const win = MUSIC.arousal.onsetWindowSec;
    const k = 1 - Math.exp(-dt / win);
    const inst = clamp((state.onsetCount - state.onsetCountPrev) / Math.max(dt, 1e-3) / MUSIC.arousal.onsetRateFull, 0, 1);
    state.onsetCountPrev = state.onsetCount;
    state.onsetDensity = state.onsetDensity + (inst - state.onsetDensity) * k;
  }
  // energia média do compasso corrente — base das inclinações que a FSM lê quando não há
  // `hint` (detetor real, Fase 7). Usa a janela curta, não `l` cru: a média por compasso de
  // um sinal com kick é dominada pelo kick e as inclinações saem ~0.
  state.barEnergyAcc += state.loudShort; state.barEnergyN++;
}

function ingestGrid(g) {
  if (!g || g.v !== 1) return;
  state.grid = g;
  state.gridLocalT0 = MB_CLOCK.toLocal(g.t0);
}

/* ============================ Camada 2 — grelha local (§2.2) ============================ */
// A grelha não é um evento que chega a tempo: é uma previsão que extrapolamos. Isto é o que
// salva a fase — três loops decoupled (WS + rAF do pai + rAF do iframe) acumulariam 30-80 ms
// de erro exatamente no instante do drop.
function updateGrid(nowL) {
  const g = state.grid;
  if (!g || nowL - state.gridLocalT0 > MUSIC.grid.staleMs) {
    state.beatPhase = state.barPhase = state.phrasePhase = 0;
    return false;
  }
  const beats = (nowL - state.gridLocalT0) / g.beatPeriodMs;   // tempos desde t0 (pode ser <0)
  const bpb = g.beatsPerBar, bpp = g.barsPerPhrase;
  const barsF = beats / bpb;
  const bar = g.barIndex + Math.floor(barsF);
  state.beatPhase = ((beats % 1) + 1) % 1;
  state.barPhase = ((barsF % 1) + 1) % 1;
  const phraseF = bar / bpp + state.barPhase / bpp;
  state.phrase = Math.floor(bar / bpp);
  state.phrasePhase = ((phraseF % 1) + 1) % 1;

  if (bar !== state.bar) {
    const prev = state.bar;
    state.bar = bar;
    if (state.barEnergyN > 0) {
      state.barEnergy.push(state.barEnergyAcc / state.barEnergyN);
      if (state.barEnergy.length > 12) state.barEnergy.shift();
    }
    state.barEnergyAcc = 0; state.barEnergyN = 0;
    onBarBoundary(bar, prev);
  }
  return true;
}

// Compassos até à próxima fronteira de frase — é isto que torna o PRE_DROP possível: os
// builds resolvem em fronteiras de 16/32 compassos, e a grelha sabe onde elas ficam.
function barsToPhraseEnd() {
  const g = state.grid; if (!g) return Infinity;
  const bpp = g.barsPerPhrase;
  const posInPhrase = ((state.bar % bpp) + bpp) % bpp + state.barPhase;
  return bpp - posInPhrase;
}

function onBarBoundary(bar) {
  // coreografia de spots amarrada à música (§3.6): a bola tem fades próprios com períodos
  // 11/17/13 s que NÃO são períodos musicais e brigam com a grelha. Em music, spotFadeMix→0
  // e a troca do spot dominante passa a cair na fronteira de 8 compassos.
  const sw = MUSIC.grid.spotSwapBars;
  if (sw > 0 && bar % sw === 0 && bar !== state.lastSwapBar) {
    state.lastSwapBar = bar;
    const n = (window.MIRRORBALL && window.MIRRORBALL.config.spots.length) || 3;
    state.domSpot = (state.domSpot + 1) % n;
  }
  // acentuação de frase: um gesto pequeno na fronteira, o suficiente para o olho registar
  // estrutura sem chamar atenção. Nada pisca (§3.6).
  const g = state.grid;
  if (g && ((bar % g.barsPerPhrase) + g.barsPerPhrase) % g.barsPerPhrase === 0) state.phraseAccent = 1;
}

/* ======================= Camada 1 — features → (V, A) sem contrast ======================= */
function updateVA(dt) {
  const f = state.feat;
  if (!f || state.silent) {
    state.V = ease(state.V, 0, MUSIC.tau.V, dt);
    state.A = ease(state.A, 0, MUSIC.tau.A, dt);
    return;
  }
  const ref = Math.max(MUSIC.norm.floor, lerp(1, state.loudAvg, MUSIC.norm.refMix));
  const loudN = clamp(state.loudShort / ref, 0, 1);

  const bpm = state.grid ? 60000 / state.grid.beatPeriodMs : 0;
  const tempoN = bpm ? clamp((bpm - MUSIC.arousal.bpmLo) / (MUSIC.arousal.bpmHi - MUSIC.arousal.bpmLo), 0, 1) : 0.5;
  const a = MUSIC.arousal;
  state.Araw = clamp(a.wLoud * loudN + a.wOnset * state.onsetDensity + a.wTempo * tempoN, 0, 1);

  const v = MUSIC.valence;
  state.Vraw = clamp(
    v.wCentroid * (state.centroidAvg - v.centroidNeutral) * 2 +
    v.wBass * (state.bassAvg - v.bassNeutral) * 2 + v.bias, -1, 1);

  // sem contrast: o alvo é o valor, não o polo mais próximo
  state.V = ease(state.V, state.Vraw, MUSIC.tau.V, dt);
  state.A = ease(state.A, state.Araw, MUSIC.tau.A, dt);
}

/* ========================== Camada 3 — a máquina de estados (§3.3) ========================== */
// Na Fase 2 a DETEÇÃO pode ser trivial (o gerador etiqueta `hint`); o detetor real é a Fase 7.
// Mas a MÁQUINA é real: o PRE_DROP ancorado à fronteira de frase ∝ confiança, o timeout por
// rampa e os comportamentos por estado da tabela §3.3 estão todos implementados.
function energySlope() {
  const e = state.barEnergy;
  if (e.length < 2) return 0;
  const n = Math.min(MUSIC.fsm.buildBars, e.length);
  const seg = e.slice(-n);
  return (seg[seg.length - 1] - seg[0]) / Math.max(1, n - 1);
}

function detectHint() {
  const f = state.feat;
  return f && typeof f.hint === 'string' ? f.hint : null;
}

function updateFsm(nowL) {
  const F = MUSIC.fsm;
  const conf = state.grid ? clamp(state.grid.confidence, 0, 1) : 0;
  const inState = nowL - state.fsmSince;
  const hint = detectHint();
  const slope = energySlope();
  const barsLeft = barsToPhraseEnd();

  // ---- transições ----
  if (state.silent) {
    setState('GROOVE', 'silêncio');
  } else if (hint === 'DROP' && state.fsm !== 'DROP') {
    // gate de plausibilidade (§3.3): onset largo e sustentado, não um *ding* de 80 ms
    const f = state.feat, wide = f && (+f.bass || 0) > 0.3 && (+f.onset || 0) >= F.onsetPlausible;
    if (wide) {
      state.dropCount++;
      // variação (§3.3): ~1 em 4 drops, contenção deliberada — não morde o isco.
      // Sem isto o truque torna-se previsível ao terceiro drop, e previsível é o oposto
      // de "quase mágica" (§6: falha se ficar previsível ao terceiro drop).
      state.restrainThis = (state.dropCount % 4) === 0;
      const scale = clamp(0.7 + state.dropCount * 0.06, 0, 1.15);   // escalada ao longo do set
      state.dropOpen = state.restrainThis ? 0.45 : scale;
      setState('DROP', `DROP: onset ${(+f.onset || 0).toFixed(2)} ∧ bass ${(+f.bass || 0).toFixed(2)}` +
        (state.restrainThis ? ' ∧ contenção deliberada' : ` ∧ #${state.dropCount}`));
    }
  } else if (state.fsm === 'DROP') {
    if (state.bar - state.fsmBar >= F.dropHoldBars) setState('GROOVE', 'fim da abertura');
  } else if (state.fsm === 'PRE_DROP') {
    // timeout por RAMPA, nunca corte (§3.3): se o drop não vier em 2 compassos, volta.
    if (state.bar - state.fsmBar > F.dropTimeoutBars) setState('GROOVE', `timeout ${F.dropTimeoutBars} compassos sem drop`);
  } else if (state.fsm === 'BUILD') {
    // ⇩ o mecanismo que a v1 do plano não tinha: ancorado à grelha, não ao passado
    if (barsLeft <= F.preDropBars && conf > F.preDropMinConf) {
      setState('PRE_DROP', `PRE_DROP: BUILD ∧ ${barsLeft.toFixed(1)} bar até frase ∧ conf ${conf.toFixed(2)}`);
    } else if (hint === 'BREAKDOWN' || (hint == null && slope < F.fallSlope)) {
      setState('BREAKDOWN', `energia a cair (${slope.toFixed(3)}/bar)`);
    } else if (hint === 'GROOVE' && inState > F.minStateMs) {
      setState('GROOVE', 'build desfez-se');
    }
  } else if (state.fsm === 'BREAKDOWN') {
    if ((hint === 'BUILD' || (hint == null && slope > F.riseSlope)) && state.bar - state.fsmBar >= F.breakdownMinBars) {
      setState('BUILD', `energia a subir (${slope.toFixed(3)}/bar)`);
    } else if (hint === 'GROOVE' && state.bar - state.fsmBar >= F.breakdownMinBars) {
      setState('GROOVE', 'energia estabilizou');
    }
  } else { // GROOVE
    if (hint === 'BUILD' || (hint == null && slope > F.riseSlope && state.barEnergy.length >= F.buildBars)) {
      setState('BUILD', `energia sobe ${F.buildBars}+ compassos (${slope.toFixed(3)}/bar)`);
    } else if (hint === 'BREAKDOWN' || (hint == null && slope < F.fallSlope)) {
      setState('BREAKDOWN', `energia cai (${slope.toFixed(3)}/bar)`);
    }
  }

  // ---- profundidade do pre-drop ∝ confiança (§3.3) ----
  // A falha graciosa é o desenho, não uma mitigação: com confiança baixa escurece pouco, e um
  // falso positivo lê-se como "seguiu o filter sweep" em vez de "as luzes morreram".
  let preT = 0;
  if (state.fsm === 'PRE_DROP') preT = F.preDropDepth * conf * smooth(clamp(1 - barsLeft / F.preDropBars, 0, 1));
  state.preDropAmount = ease(state.preDropAmount, preT, [0.25, 0.9], (nowL - state.lastT) / 1000 || 0.016);
  state.dropDepth = ease(state.dropDepth, state.fsm === 'DROP' ? state.dropOpen : 0, [0.08, 1.4], (nowL - state.lastT) / 1000 || 0.016);
}

/* ============================== alvos: estado → knobs ============================== */
function computeTargets() {
  const V = state.V, A = state.A, T = state.target;
  const energy = clamp(A + Math.min(0, V) * 0.5 * (1 - A), -1, 1);

  T.tone = anchor(MUSIC.tone.k, V);
  T.opacity = anchor(MUSIC.opacity.k, energy);
  T.rpm = anchor(MUSIC.rpm.k, energy);
  T.beams = anchor(MUSIC.beams.k, energy);
  T.beamInt = anchor(MUSIC.beamInt.k, energy);
  T.haze = clamp(anchor(MUSIC.haze.k, energy) + MUSIC.haze.vBias * V, 0.05, 1);
  T.spot = clamp(anchor(MUSIC.spot.k, energy) + MUSIC.spot.vBias * V, 0.1, 1.6);

  // ---- comportamentos por estado (tabela §3.3) ----
  switch (state.fsm) {
    case 'BUILD':
      // CONTENÇÃO. O amador abre no build; o técnico fecha. Os feixes REDUZEM, o haze sobe,
      // a opacidade desce devagar — é a contenção que dá valor ao momento em que abre.
      T.beams *= 0.55; T.beamInt *= 0.70;
      T.haze = clamp(T.haze * 1.25, 0.05, 1);
      T.opacity *= 0.90;
      break;
    case 'PRE_DROP': {
      const p = state.preDropAmount;   // ∝ confiança
      T.spot = lerp(T.spot, 0.12, p);
      T.beamInt = lerp(T.beamInt, 0.02, p);
      T.beams = lerp(T.beams, 3, p);
      T.opacity = lerp(T.opacity, 0.45, p * 0.8);
      T.haze = clamp(lerp(T.haze, 0.9, p * 0.6), 0.05, 1);
      break;
    }
    case 'DROP': {
      const d = state.dropDepth;
      T.spot = lerp(T.spot, 1.55, d);
      T.beamInt = lerp(T.beamInt, MUSIC.outMax.beamInt, d);   // ao teto, não acima
      T.beams = lerp(T.beams, 52, d);
      T.opacity = lerp(T.opacity, 1.0, d);
      T.haze = clamp(lerp(T.haze, 0.72, d * 0.5), 0.05, 1);
      // SEM burst de rotação (§3.3, decisão fechada nº10): contradiz a tese da Camada 2 (a
      // bola é um objeto pesado), é fisicamente implausível, e o impacto já vem dos spots.
      break;
    }
    case 'BREAKDOWN':
      // fantasma: opacidade ~0.3, rotação lenta, 3-4 feixes, haze alto
      T.opacity = Math.min(T.opacity, 0.32);
      T.rpm = Math.min(T.rpm, 0.75);
      T.beams = Math.min(T.beams, 4);
      T.beamInt = Math.min(T.beamInt, 0.06);
      T.haze = clamp(Math.max(T.haze, 0.80), 0.05, 1);
      T.spot = Math.min(T.spot, 0.55);
      break;
    default: {
      // GROOVE — 80-90% do tempo (§3.6). Regra de ouro: NADA PISCA. A energia gasta-se em
      // textura para o DROP ter de onde se destacar.
      const t = MB_CLOCK.now() / 1000;
      // deriva lenta: períodos longos e fora de fase entre si → nunca dois minutos iguais
      T.haze = clamp(T.haze * (1 + 0.06 * Math.sin(TAU * t / 47)), 0.05, 1);
      T.spot = clamp(T.spot * (1 + 0.05 * Math.sin(TAU * t / 61 + 1.7)), 0.1, 1.6);
      // acentuação de frase: um spot que abre ~15%, decaindo ao longo do compasso
      T.spot = clamp(T.spot * (1 + 0.15 * state.phraseAccent), 0.1, 1.6);
      break;
    }
  }
  state.phraseAccent *= 0.985;
}
const TAU = Math.PI * 2;

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
      state.out.tone = (MB.getSkin && MB.getSkin().mix) || 0;
      const s0 = C.spots[0];
      state.out.spot = s0 && s0._base ? clamp(s0.intensity / s0._base, 0.1, 1.6) : state.out.spot;
    }
    state.handoverT = MB_CLOCK.now();
  }
  state.owner = owner;
}
if (window.MB_SOURCE) { state.owner = window.MB_SOURCE.owner; window.MB_SOURCE.on(onOwnerChange); }
if (state.owner === 'music') onOwnerChange('music');

function applyToBall(o) {
  const MB = window.MIRRORBALL; if (!MB) return;
  const C = MB.config;
  C.rotationRpm = clamp(o.rpm, MUSIC.outMin.rpm, MUSIC.outMax.rpm);
  C.haze = clamp(o.haze, MUSIC.outMin.haze, MUSIC.outMax.haze);
  C.beamMaxCount = Math.round(clamp(o.beams, 0, MUSIC.outMax.beams));
  C.beamIntensity = clamp(o.beamInt, 0, MUSIC.outMax.beamInt);       // teto inviolável 0.18
  C.sphereOpacity = clamp(o.opacity, MUSIC.outMin.opacity, 1);
  C.spotFadeMix = 0;   // §3.6: os fades internos (11/17/13 s) não são períodos musicais
  if (MB.setSkinAuto) MB.setSkinAuto(clamp(o.tone, 0, 1));
  if (MB.setHealth && MB.getHealth() !== state.health) MB.setHealth(state.health);
  // coreografia: um spot dominante, os outros submissos; troca na fronteira de 8 compassos
  C.spots.forEach((s, i) => {
    if (s._base == null) s._base = s.intensity;
    const g = i === state.domSpot ? MUSIC.grid.spotDomGain : MUSIC.grid.spotSubGain;
    MB.setSpot(i, { intensity: clamp(s._base * o.spot * g, 0, 1.6) });
  });
}

/* ==================================== loop principal ==================================== */
function update(nowL) {
  const dt = clamp((nowL - state.lastT) / 1000, 0, 0.1);

  // silêncio (§3.5): sem isto a bola congela no último frame e parece bug
  const stale = nowL - state.lastFeatLocal > MUSIC.silence.noFeaturesMs;
  const dead = stale || state.silent;
  const hTarget = dead ? 0 : 1;
  const rate = dt / MUSIC.silence.decaySec;
  state.health = dead ? Math.max(0, state.health - rate) : Math.min(1, state.health + rate * 2);
  void hTarget;

  updateGrid(nowL);
  updateVA(dt);
  updateFsm(nowL);
  computeTargets();

  // rampa de posse: logo após ganhar o CONFIG, suaviza mais ainda (nunca corte)
  const hand = clamp((nowL - state.handoverT) / (MUSIC.handover.rampSec * 1000), 0, 1);
  const slow = lerp(2.5, 1, hand);
  const o = state.out;
  for (const k in o) {
    const tau = MUSIC.tau[k];
    o[k] = ease(o[k], state.target[k], [tau[0] * slow, tau[1] * slow], dt);
    o[k] = clamp(o[k], MUSIC.outMin[k] != null ? MUSIC.outMin[k] : -Infinity,
                       MUSIC.outMax[k] != null ? MUSIC.outMax[k] : Infinity);
  }

  const owner = window.MB_SOURCE ? window.MB_SOURCE.owner : 'manual';
  if (owner === 'music') {
    applyToBall(o);
    if (window.BRIDGE) window.BRIDGE.send({ rpm: o.rpm, spotGain: o.spot, haze: o.haze, valence: state.V, arousal: state.A, health: state.health });
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
    bpm: state.grid ? 60000 / state.grid.beatPeriodMs : 0,
    confidence: state.grid ? state.grid.confidence : 0,
    beatPhase: state.beatPhase, V: state.V, A: state.A, loudness: state.loudAvg,
    profile: state.profile, gen: GEN.on, out: Object.assign({}, o),
  };
  try { if (typeof parent !== 'undefined' && parent !== window) parent.postMessage(msg, '*'); } catch (e) { /* cross-origin */ }
}

/* ========================= GERADOR SINTÉTICO (Fase 2) =========================
 * 126 BPM, 4/4, frases de 16 compassos.
 * GROOVE(32) → BUILD(16, energia sobe, graves saem, centroide sobe) → DROP no tempo 1 da
 * frase → GROOVE… com um BREAKDOWN a cada 3 ciclos.
 * Emite pelo MESMO caminho de mensagens que o sidecar real vai usar (postMessage para a
 * própria window) — o motor não consegue distinguir sintético de real, que é o ponto.
 * `g` liga/desliga · `n` força a próxima fase.
 */
const GEN = (() => {
  const on = { v: MUSIC.gen.enabled };
  let t0 = MB_CLOCK.now();     // início do "set"
  let lastFeat = 0, lastBarEmitted = -1, lastExternal = -Infinity;
  let cycle = 0, phase = 'GROOVE', phaseStartBar = 0, forced = false;

  function bpmToPeriod() { return 60000 / MUSIC.gen.bpm; }

  // plano de fases por compasso. O DROP cai sempre no tempo 1 de uma frase (barIndex % 16 === 0).
  function phaseAt(bar) {
    const G = MUSIC.gen;
    const cyc = G.grooveBars + G.buildBars;            // 48 compassos, múltiplo de 16
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
    const inBar = info.inBar;
    phase = info.p; cycle = info.c;

    // ---- grelha: um postMessage por compasso ----
    if (bar !== lastBarEmitted) {
      lastBarEmitted = bar;
      post({
        type: 'grid', v: 1,
        t0: t0 + bar * G.beatsPerBar * period,     // downbeat deste compasso, relógio do emissor
        beatPeriodMs: period, beatsPerBar: G.beatsPerBar, barsPerPhrase: G.barsPerPhrase,
        barIndex: bar, phraseIndex: Math.floor(bar / G.barsPerPhrase), confidence: G.confidence,
      });
    }

    // ---- features a 50 Hz ----
    if (nowL - lastFeat < 1000 / G.featureHz) return;
    lastFeat = nowL;

    const beatPhase = beats % 1;
    // o "1" do compasso é o onset mais forte; kick em 4-on-the-floor
    const kick = Math.exp(-beatPhase * 12) * (barPhase < 0.02 ? 1 : 0.8);
    const hat = ((beats * 2) % 1) < 0.1 ? 0.25 : 0;

    let loud = 0.42, bass = 0.55, mid = 0.40, high = 0.28, centroid = 0.38, hint = phase;
    if (phase === 'BUILD') {
      const p = clamp(inBar / MUSIC.gen.buildBars, 0, 1);
      loud = lerp(0.42, 0.72, p);           // energia sobe
      bass = lerp(0.55, 0.10, p);           // graves saem (filtro high-pass do build)
      mid = lerp(0.40, 0.62, p);
      high = lerp(0.28, 0.78, p);
      centroid = lerp(0.38, 0.80, p);       // centroide sobe
    } else if (phase === 'BREAKDOWN') {
      const p = clamp(inBar / MUSIC.gen.breakdownBars, 0, 1);
      loud = lerp(0.30, 0.22, p); bass = 0.18; mid = 0.30; high = 0.20; centroid = 0.30;
    }

    // DROP: o compasso a seguir ao fim do build, no tempo 1 da frase
    const isDropBar = phase === 'GROOVE' && inBar === 0 && bar > 0 && barPhase < 0.06;
    if (isDropBar) {
      hint = 'DROP'; loud = 0.95; bass = 0.92; mid = 0.70; high = 0.62; centroid = 0.45;
    }

    const onset = isDropBar ? clamp(0.9 - barPhase * 6, 0.6, 1)
                            : clamp(kick * (phase === 'BUILD' ? 0.35 : 0.7) + hat, 0, 1);

    post({
      type: 'features', t: nowL, rms: clamp(loud * (0.7 + 0.3 * kick), 0, 1),
      bass: clamp(bass * (0.75 + 0.25 * kick), 0, 1), mid, high, centroid,
      onset, loudness: loud, silence: false, hint,
    });
  }

  let forcedShift = 0;
  function nextPhase() {
    // salta para o início da próxima fase do plano — para testar transições à mão
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
    toggle() { on.v = !on.v; if (on.v) { t0 = MB_CLOCK.now(); lastBarEmitted = -1; } },
    markExternal(t) { lastExternal = t; },
    isExternal() { return MB_CLOCK.now() - lastExternal < MUSIC.gen.externalGraceMs; },   // features sem `hint` → há emissor real, cala-te
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
  const bpm = g ? 60000 / g.beatPeriodMs : 0, conf = g ? g.confidence : 0;
  const posBar = g ? ((state.bar % g.barsPerPhrase) + g.barsPerPhrase) % g.barsPerPhrase : 0;
  const lines = [
    `estado  ${state.fsm.padEnd(10)} ${((nowL - state.fsmSince) / 1000).toFixed(1)}s` +
      (state.fsm === 'PRE_DROP' ? `  ↓${state.preDropAmount.toFixed(2)}` : '') +
      (state.fsm === 'DROP' ? `  ↑${state.dropDepth.toFixed(2)}${state.restrainThis ? ' (contido)' : ''}` : ''),
    `grelha  bar ${state.bar} (${posBar + 1}/${g ? g.barsPerPhrase : '—'})  frase ${state.phrase}  ${bpm ? bpm.toFixed(1) : '—'} bpm  conf ${conf.toFixed(2)}`,
    `batida  ${bar12(state.beatPhase, 16)}  bar ${bar12(state.barPhase, 16)}`,
    `V ${state.V.toFixed(2).padStart(5)}  A ${state.A.toFixed(2)}  loud ${state.loudAvg.toFixed(2)}  onsets ${state.onsetDensity.toFixed(2)}  perfil ${state.profile}`,
    `saída   tone ${o.tone.toFixed(2)} opac ${o.opacity.toFixed(2)} rpm ${o.rpm.toFixed(2)} beams ${Math.round(o.beams)} bInt ${o.beamInt.toFixed(3)} haze ${o.haze.toFixed(2)} spot ${o.spot.toFixed(2)}`,
    `dono ${window.MB_SOURCE ? window.MB_SOURCE.owner : '—'}  health ${state.health.toFixed(2)}  spot dom ${state.domSpot}  gerador ${GEN.on ? 'ON (' + GEN.phase + ' c' + GEN.cycle + ')' : 'off'}  clock ±${MB_CLOCK.offset.toFixed(1)}ms`,
    '',
    'eventos (g liga/desliga gerador · n próxima fase)',
  ];
  for (const e of state.log) {
    lines.push(`  ${((nowL - e.t) / 1000).toFixed(1).padStart(6)}s  ${e.from}→${e.to}  ${e.why}`);
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
  });
}

/* ============================ config sobreponível (§5) ============================ */
// music.config.json na MESMA pasta, opcional. Deep-merge sobre MUSIC — permite afinar
// limiares/âncoras/taus sem rebuild do Next (o CLAUDE.md exige build+restart para `source/`,
// o que tornaria cada iteração de afinação num ciclo de build).
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
    .then(j => { if (j && typeof j === 'object') { deepMerge(MUSIC, j); console.log('[music] music.config.json aplicado'); } })
    .catch(() => { /* ficheiro opcional; ausência é o caso normal */ });
}

/* ======================================= arranque ======================================= */
window.MUSIC = { config: MUSIC, state, gen: GEN, clock: MB_CLOCK, update, onMessage };

if (typeof requestAnimationFrame === 'function') {
  (function loop() {
    const nowL = MB_CLOCK.now();
    GEN.tick(nowL);
    update(nowL);
    requestAnimationFrame(loop);
  })();
  // handshake de relógio ao arrancar: 5 amostras espaçadas, fica com as de menor RTT
  for (let i = 0; i < 5; i++) setTimeout(() => MB_CLOCK.request(), 120 + i * 180);
  setInterval(() => MB_CLOCK.request(), 10000);
}

})();
