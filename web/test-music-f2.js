/* test-music-f2.js — verificação do motor musical (Fase 5: "motor forte").
 *
 * Corre core.js + music.js num sandbox de Node com window/document/performance/rAF/postMessage
 * falsos e um relógio VIRTUAL, para simular minutos de "set" em segundos reais.
 *
 * O que se afirma (brief da Fase 5, ponto 7):
 *   (a) owner=manual → ZERO escritas no CONFIG
 *   (b) rpm > 2.0 com bombo a bater
 *   (c) rpm < 0.3 em ≤ 2.5 s depois de o bombo parar
 *   (d) nenhuma escrita em skin (setSkinAuto/skin) por parte do motor
 *   (e) beamIntensity ≤ 0.18 em todo o lado
 *   (f) ≥ 3 gestos DISTINTOS em 10 min simulados
 *   (g) perfil muda por postMessage e por tecla `p`
 *   (h) silêncio → health → 0
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WEB = process.argv[2] || __dirname;
const STEP = 16;                // ~60 fps

function makeEnv({ owner, seed }) {
  let clock = 0;
  const rafQueue = [];
  const timers = [];
  const listeners = {};

  // --- CONFIG mínimo, com a mesma forma do index-v2.html ---
  const CONFIG = {
    rotationRpm: 1.0, haze: 0.65, beamMaxCount: 36, beamIntensity: 0.16,
    sphereOpacity: 1.0, spotFadeMix: 1.0, skin: 'auto',
    spots: [
      { az: -58, el: 34, intensity: 1.00, size: 55, period: 13 },
      { az: 62, el: 22, intensity: 0.85, size: 40, period: 17 },
      { az: 12, el: 58, intensity: 0.70, size: 70, period: 11 },
    ],
  };
  let health = 1, skinAuto = 0;
  const writes = { count: 0 };
  const skinWrites = { auto: 0, mode: 0, modes: [] };
  const watched = ['rotationRpm', 'haze', 'beamMaxCount', 'beamIntensity', 'sphereOpacity', 'spotFadeMix'];
  const raw = {};
  for (const k of watched) {
    raw[k] = CONFIG[k];
    Object.defineProperty(CONFIG, k, {
      get() { return raw[k]; },
      set(v) { if (v !== raw[k]) writes.count++; raw[k] = v; },
      enumerable: true, configurable: true,
    });
  }
  // `skin` é vigiada à parte: §0.1 ponto 1 diz que o motor não lhe toca. A única exceção
  // permitida é a normalização 'auto' → 'dark' ao entrar em modo música (uma vez).
  let skinRaw = CONFIG.skin;
  Object.defineProperty(CONFIG, 'skin', {
    get() { return skinRaw; },
    set(v) { if (v !== skinRaw) { skinWrites.mode++; skinWrites.modes.push(v); } skinRaw = v; },
    enumerable: true, configurable: true,
  });

  const MIRRORBALL = {
    config: CONFIG,
    setHealth(h) { if (h !== health) writes.count++; health = Math.max(0, Math.min(1, +h || 0)); },
    getHealth() { return health; },
    setSpot(i, p) { if (CONFIG.spots[i]) { writes.count++; Object.assign(CONFIG.spots[i], p || {}); } },
    setSkin(m) { CONFIG.skin = m; },
    setSkinAuto(v) { skinWrites.auto++; writes.count++; skinAuto = v; },
    getSkin() { return { mode: CONFIG.skin, mix: skinAuto, target: skinAuto }; },
  };

  const hudEl = { classList: { _on: false, contains() { return this._on; }, toggle() { this._on = !this._on; } }, textContent: '' };

  const sandbox = {
    console: { log() {}, warn() {}, error(...a) { console.error('[sandbox]', ...a); } },
    performance: { now: () => clock },
    Date, Math, JSON, Object, Array, Promise, Error, String, Number, Boolean, Symbol, Map, Set, isFinite, parseFloat, parseInt,
    requestAnimationFrame(fn) { rafQueue.push(fn); return rafQueue.length; },
    setTimeout(fn, ms) { timers.push({ at: clock + (ms || 0), fn }); return timers.length; },
    clearTimeout() {},
    setInterval() { return 0; }, clearInterval() {},
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener() {},
    postMessage(data) { msgQueue.push(data); },
    location: { search: `?src=${owner}` },
    URLSearchParams,
    matchMedia: () => ({ matches: false }),
    document: {
      getElementById: (id) => (id === 'mus' ? hudEl : null),
      createElement: () => ({ style: {}, appendChild() {}, addEventListener() {} }),
      head: { appendChild() {} }, body: { style: {} },
    },
    MIRRORBALL,
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.parent = sandbox;
  sandbox.globalThis = sandbox;

  const msgQueue = [];
  function drainMessages() {
    let guard = 0;
    while (msgQueue.length && guard++ < 4096) {
      const d = msgQueue.shift();
      for (const fn of (listeners.message || [])) fn({ data: d });
    }
  }
  function fireKey(k) { for (const fn of (listeners.keydown || [])) fn({ key: k }); }

  const ctx = vm.createContext(sandbox);
  for (const f of ['core.js', 'music.js']) {
    vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), ctx, { filename: f });
  }
  if (seed != null && sandbox.MUSIC && sandbox.MUSIC.setSeed) sandbox.MUSIC.setSeed(seed);

  function tick(dt) {
    clock += dt;
    for (let i = 0; i < timers.length; i++) {
      if (timers[i] && timers[i].at <= clock) { const t = timers[i]; timers[i] = null; t.fn(); }
    }
    drainMessages();
    const q = rafQueue.splice(0, rafQueue.length);
    for (const fn of q) fn(clock);
    drainMessages();
  }

  // Emissor "sidecar falso": features a 50 Hz sem `hint`, para exercitar o caminho real.
  // `kicks:false` → sem bombo (breakdown/build), `kicks:true` → 4-on-the-floor a `bpm`.
  function feed(ms, opts) {
    const o = Object.assign({ bpm: 126, kicks: true, loud: 0.55, high: 0.30, bassBase: 0.30, silence: false }, opts || {});
    const period = 60000 / o.bpm;
    const start = clock;
    let lastEmit = -Infinity;
    while (clock - start < ms) {
      if (clock - lastEmit >= 20) {           // 50 Hz
        lastEmit = clock;
        const beatPhase = ((clock - start) / period) % 1;
        const env = o.kicks ? Math.exp(-beatPhase * 14) : 0;
        const hat = ((clock - start) / (period / 2)) % 1 < 0.08 ? 0.30 : 0;
        msgQueue.push({
          type: 'features', t: clock,
          rms: Math.min(1, o.loud * (0.65 + 0.35 * env)),
          bass: Math.min(1, o.bassBase + 0.42 * env),
          mid: 0.40, high: o.high, centroid: 0.42,
          onset: Math.min(1, 0.85 * env + hat),
          loudness: o.loud, silence: o.silence,
        });
      }
      tick(STEP);
    }
  }

  return { sandbox, ctx, tick, feed, writes, skinWrites, CONFIG, MIRRORBALL, fireKey,
           get clock() { return clock; }, get health() { return health; }, hudEl };
}

/* ================================ execução + asserções ================================ */
const results = [];
function check(name, ok, detail) { results.push({ name, ok, detail }); }

/* ---- (a) owner 'manual' → zero escritas no CONFIG ---- */
{
  const env = makeEnv({ owner: 'manual', seed: 12345 });
  for (let t = 0; t < 3 * 60 * 1000; t += STEP) env.tick(STEP);
  check('(a) owner=manual → zero escritas no CONFIG', env.writes.count === 0,
    `escritas=${env.writes.count} · escritas em skin=${env.skinWrites.auto + env.skinWrites.mode} · estado=${env.sandbox.MUSIC.state.fsm}`);
}

/* ---- (b,c) rpm segue o bombo — o requisito central do David ---- */
{
  const env = makeEnv({ owner: 'music', seed: 4242 });
  const S = env.sandbox.MUSIC.state;
  env.sandbox.MUSIC.gen.toggle();                 // gerador off: alimentamos nós, sem `hint`

  env.feed(20000, { kicks: true, bpm: 126, loud: 0.62 });   // 20 s de bombo
  const rpmWithKick = env.CONFIG.rotationRpm;
  const presWithKick = S.kickPresence;
  const bpmSeen = S.bpmEst ? 60000 / S.bpmEst : 0;
  const confSeen = S.gridConf;

  check('(b) rpm > 2.0 com bombo a bater', rpmWithKick > 2.0,
    `rpm=${rpmWithKick.toFixed(2)} · kickPresence=${presWithKick.toFixed(2)} · ${S.kickRate.toFixed(1)} kicks/s · BPM detetado=${bpmSeen.toFixed(1)} (conf ${confSeen.toFixed(2)})`);

  // bombo pára (ambiente continua: loud desce um pouco, hi-hats mantêm-se)
  const t0 = env.clock;
  let tUnder = null;
  const stepMs = 100;
  for (let t = 0; t < 6000; t += stepMs) {
    env.feed(stepMs, { kicks: false, loud: 0.45, high: 0.42, bassBase: 0.16 });
    if (tUnder === null && env.CONFIG.rotationRpm < 0.3) tUnder = env.clock - t0;
  }
  check('(c) rpm < 0.3 em ≤ 2.5 s depois de o bombo parar', tUnder !== null && tUnder <= 2500,
    `chegou a <0.3 em ${tUnder === null ? 'nunca' : (tUnder / 1000).toFixed(2) + ' s'} · rpm final=${env.CONFIG.rotationRpm.toFixed(3)} · presença=${S.kickPresence.toFixed(3)} · estado=${S.fsm}`);
}

/* ---- (d,e,f) 10 minutos de set com o gerador sintético ---- */
{
  const env = makeEnv({ owner: 'music', seed: 90210 });
  const S = env.sandbox.MUSIC.state;
  const LONG_MS = 10 * 60 * 1000;

  let maxBeamInt = 0, maxRpm = 0, minRpm = 99;
  let maxSpot = 0;
  const transitions = [];
  let lastFsm = S.fsm;
  const gestSeen = {};
  let lastGest = null;

  for (let t = 0; t < LONG_MS; t += STEP) {
    env.tick(STEP);
    maxBeamInt = Math.max(maxBeamInt, env.CONFIG.beamIntensity);
    maxRpm = Math.max(maxRpm, env.CONFIG.rotationRpm);
    minRpm = Math.min(minRpm, env.CONFIG.rotationRpm);
    for (const s of env.CONFIG.spots) maxSpot = Math.max(maxSpot, s.intensity);
    if (S.fsm !== lastFsm) { transitions.push({ t: env.clock, from: lastFsm, to: S.fsm, bar: S.bar }); lastFsm = S.fsm; }
    const gn = S.gest ? S.gest.name : null;
    if (gn && gn !== lastGest) { gestSeen[gn] = (gestSeen[gn] || 0) + 1; }
    lastGest = gn;
  }

  check('(d) o motor NUNCA escreve na skin',
    env.skinWrites.auto === 0 && env.skinWrites.modes.filter(m => m !== 'dark').length === 0,
    `setSkinAuto=${env.skinWrites.auto} · setSkin=[${env.skinWrites.modes.join(',') || '—'}] (só a normalização auto→dark é permitida)`);

  check('(e) beamIntensity nunca > 0.18', maxBeamInt <= 0.18 + 1e-9,
    `máx observado no CONFIG = ${maxBeamInt.toFixed(6)}`);

  const distinct = Object.keys(gestSeen);
  check('(f) ≥ 3 gestos distintos em 10 min simulados', distinct.length >= 3,
    `${distinct.length} distintos, ${Object.values(gestSeen).reduce((a, b) => a + b, 0)} ocorrências: ${distinct.map(k => k + '×' + gestSeen[k]).join(', ') || '—'}`);

  check('(g) amplitude de rpm visível ao longo do set', maxRpm > 2.0 && minRpm < 0.4,
    `rpm ∈ [${minRpm.toFixed(2)}, ${maxRpm.toFixed(2)}] · spot máx=${maxSpot.toFixed(2)} · escritas no CONFIG=${env.writes.count}`);

  console.log('\n--- transições (owner=music, 10 min simulados, gerador sintético) ---');
  for (const tr of transitions.slice(0, 32)) {
    console.log(`  ${(tr.t / 1000).toFixed(1).padStart(7)}s  bar ${String(tr.bar).padStart(4)}  ${tr.from} → ${tr.to}`);
  }
  if (transitions.length > 32) console.log(`  … +${transitions.length - 32} transições`);
  console.log(`  total: ${transitions.length} transições · ${transitions.filter(t => t.to === 'DROP').length} drops`);
  console.log(`  gestos: ${distinct.map(k => k + '×' + gestSeen[k]).join(', ') || '—'}`);

  // HUD
  env.fireKey('m');
  env.tick(STEP);
  check('(HUD) tecla m produz conteúdo com a linha BOMBO',
    env.hudEl.textContent.length > 100 && /BOMBO/.test(env.hudEl.textContent),
    `${env.hudEl.textContent.split('\n').length} linhas`);
  console.log('\n--- HUD (tecla m) ---');
  console.log(env.hudEl.textContent.split('\n').map(l => '  ' + l).join('\n'));
}

/* ---- (h) perfil: postMessage e tecla `p` ---- */
{
  const env = makeEnv({ owner: 'music', seed: 7 });
  const M = env.sandbox.MUSIC;
  const start = M.config.profile;
  env.sandbox.postMessage({ type: 'profile', value: 'voz' });
  env.tick(STEP);
  const afterMsg = M.config.profile;
  env.fireKey('p');
  env.tick(STEP);
  const afterKey = M.config.profile;
  check('(h) perfil muda por postMessage e por tecla p',
    start === 'electronica' && afterMsg === 'voz' && afterKey === 'electronica',
    `${start} → (postMessage voz) ${afterMsg} → (tecla p) ${afterKey}`);

  // `voz` = rpm 0.3 fixo
  M.setProfile('voz');
  env.sandbox.MUSIC.gen.toggle();
  env.feed(8000, { kicks: true, loud: 0.7 });
  check('(i) perfil voz → rpm ≈ 0.3 mesmo com bombo',
    Math.abs(env.CONFIG.rotationRpm - 0.30) < 0.05,
    `rpm=${env.CONFIG.rotationRpm.toFixed(3)} com bombo a bater e perfil=voz`);
}

/* ---- (j) silêncio → health → 0 em ≤ 5 s ---- */
{
  const env = makeEnv({ owner: 'music', seed: 3 });
  const S = env.sandbox.MUSIC.state;
  for (let t = 0; t < 30000; t += STEP) env.tick(STEP);
  const hBefore = S.health;
  env.sandbox.MUSIC.gen.toggle();
  const t0 = env.clock;
  let tZero = null;
  for (let t = 0; t < 15000; t += STEP) {
    env.tick(STEP);
    if (tZero === null && S.health <= 0.001) tZero = env.clock - t0;
  }
  check('(j) silêncio → health → 0 em ≤ 5 s', tZero !== null && tZero <= 5000,
    `health antes=${hBefore.toFixed(2)} · chegou a 0 em ${tZero === null ? 'nunca' : (tZero / 1000).toFixed(2) + ' s'} · rpm final=${env.CONFIG.rotationRpm.toFixed(3)}`);
}

/* ==================================== relatório ==================================== */
console.log('\n=== VERIFICAÇÃO FASE 5 (motor forte) ===');
let failed = 0;
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FALHA'}  ${r.name}\n        ${r.detail}`);
  if (!r.ok) failed++;
}
console.log(`\n${results.length - failed}/${results.length} asserções passaram.`);
process.exit(failed ? 1 : 0);
