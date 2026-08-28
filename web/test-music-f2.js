/* harness-f2.js — verificação da Fase 2 (music.js) num vm de Node.
 *
 * Corre core.js + music.js num sandbox com window/document/performance/rAF/postMessage
 * falsos e um relógio VIRTUAL, para simular ~3 minutos de "set" em segundos reais.
 * Afirma as 5 propriedades pedidas no brief da Fase 2.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WEB = process.argv[2] || __dirname;
const SIM_MS = 3 * 60 * 1000;   // 3 minutos simulados (a) e (d)
// (b) precisa de vários drops para valer como prova: a 126 BPM um ciclo GROOVE+BUILD são 48
// compassos ≈ 91 s, e o BREAKDOWN entra a cada 3 ciclos. 20 min cobrem ~12 drops, incluindo
// os ciclos com breakdown e o drop "contido" de 1 em 4.
const LONG_MS = 20 * 60 * 1000;
const STEP = 16;                // ~60 fps

function makeEnv({ owner }) {
  let clock = 0;
  const rafQueue = [];
  const timers = [];
  const listeners = {};
  const keys = {};

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
  // proxy de contagem: qualquer escrita nas chaves que o motor toca conta
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

  const MIRRORBALL = {
    config: CONFIG,
    setHealth(h) { if (h !== health) writes.count++; health = Math.max(0, Math.min(1, +h || 0)); },
    getHealth() { return health; },
    setSpot(i, p) { if (CONFIG.spots[i]) { writes.count++; Object.assign(CONFIG.spots[i], p || {}); } },
    setSkin(m) { CONFIG.skin = m; },
    setSkinAuto(v) { if (v !== skinAuto) writes.count++; skinAuto = v; },
    getSkin() { return { mode: CONFIG.skin, mix: skinAuto, target: skinAuto }; },
  };

  const hudEl = { classList: { _on: false, contains() { return this._on; }, toggle() { this._on = !this._on; }, add() { this._on = true; } }, textContent: '' };

  const sandbox = {
    console: { log() {}, warn() {}, error(...a) { console.error('[sandbox]', ...a); } },
    performance: { now: () => clock },
    Date: Date, Math: Math, JSON: JSON, Object, Array, Promise, Error, String, Number, Boolean, Symbol, Map, Set, isFinite, parseFloat, parseInt,
    requestAnimationFrame(fn) { rafQueue.push(fn); return rafQueue.length; },
    setTimeout(fn, ms) { timers.push({ at: clock + (ms || 0), fn }); return timers.length; },
    clearTimeout() {},
    setInterval() { return 0; }, clearInterval() {},
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener() {},
    postMessage(data) { queueMessage(data); },
    location: { search: `?src=${owner}` },
    URLSearchParams,
    matchMedia: () => ({ matches: false }),
    document: {
      getElementById: (id) => (id === 'mus' ? hudEl : null),
      createElement: () => ({ style: {}, appendChild() {}, addEventListener() {} }),
      head: { appendChild() {} }, body: { style: {} },
    },
    MIRRORBALL,
    // fetch ausente de propósito: music.config.json é opcional
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.parent = sandbox;      // sem pai: emitState não sai
  sandbox.globalThis = sandbox;

  const msgQueue = [];
  function queueMessage(data) { msgQueue.push(data); }
  function drainMessages() {
    while (msgQueue.length) {
      const d = msgQueue.shift();
      for (const fn of (listeners.message || [])) fn({ data: d });
    }
  }
  function fireKey(k) { for (const fn of (listeners.keydown || [])) fn({ key: k }); }

  const ctx = vm.createContext(sandbox);
  for (const f of ['core.js', 'music.js']) {
    vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), ctx, { filename: f });
  }

  function tick(dt) {
    clock += dt;
    // timers agendados
    for (let i = 0; i < timers.length; i++) {
      if (timers[i] && timers[i].at <= clock) { const t = timers[i]; timers[i] = null; t.fn(); }
    }
    drainMessages();               // mensagens emitidas antes do frame
    const q = rafQueue.splice(0, rafQueue.length);
    for (const fn of q) fn(clock);
    drainMessages();               // mensagens emitidas pelo gerador dentro do frame
  }

  return { sandbox, ctx, tick, writes, CONFIG, MIRRORBALL, fireKey, get clock() { return clock; }, get health() { return health; }, hudEl };
}

/* ================================ execução + asserções ================================ */
const results = [];
function check(name, ok, detail) { results.push({ name, ok, detail }); }

/* ---- (a) owner 'manual' → zero escritas no CONFIG ---- */
{
  const env = makeEnv({ owner: 'manual' });
  for (let t = 0; t < SIM_MS; t += STEP) env.tick(STEP);
  check('(a) owner=manual → zero escritas no CONFIG', env.writes.count === 0,
    `escritas=${env.writes.count} · estado final=${env.sandbox.MUSIC.state.fsm} · bar=${env.sandbox.MUSIC.state.bar}`);
}

/* ---- (b,c,d) owner 'music' ---- */
{
  const env = makeEnv({ owner: 'music' });
  const S = env.sandbox.MUSIC.state;

  const transitions = [];          // {t, from, to}
  let lastFsm = S.fsm;
  let maxBeamInt = 0;
  // (d) "mudança de sinal da derivada" só conta se o movimento for PERCETÍVEL. Uma inversão
  // de 1e-6 num knob é dither de vírgula flutuante, não flicker: a bola nem consegue
  // renderizar a diferença. O deadband por knob é ~0.2% do seu curso útil — abaixo disso o
  // movimento é ruído numérico e contá-lo mediria o float, não o comportamento.
  const knobs = ['tone', 'opacity', 'rpm', 'beams', 'beamInt', 'haze', 'spot'];
  const DEADBAND = { tone: 0.002, opacity: 0.002, rpm: 0.006, beams: 0.11, beamInt: 0.0004, haze: 0.002, spot: 0.003 };
  const prev = {}, prevSign = {}, signFlips = {};   // por knob: timestamps das mudanças de sinal
  for (const k of knobs) { prev[k] = null; prevSign[k] = 0; signFlips[k] = []; }
  const dropBars = [];
  let sawPreDropSinceGroove = false;
  const dropsWithoutPreDrop = [];

  for (let t = 0; t < LONG_MS; t += STEP) {
    env.tick(STEP);
    const now = env.clock;

    if (S.fsm !== lastFsm) {
      transitions.push({ t: now, from: lastFsm, to: S.fsm, bar: S.bar });
      if (S.fsm === 'PRE_DROP') sawPreDropSinceGroove = true;
      if (S.fsm === 'DROP') {
        dropBars.push({ bar: S.bar, pre: sawPreDropSinceGroove });
        if (!sawPreDropSinceGroove) dropsWithoutPreDrop.push(S.bar);
        sawPreDropSinceGroove = false;
      }
      lastFsm = S.fsm;
    }

    // (c) teto de beamIntensity, medido no CONFIG real (o que a bola vê)
    maxBeamInt = Math.max(maxBeamInt, env.CONFIG.beamIntensity);

    // (d) inversões de direção com deadband: `prev[k]` guarda o último EXTREMO confirmado.
    // Só quando o knob se afasta desse extremo mais do que o deadband é que se declara uma
    // direção; inverter a direção declarada é que conta como flip.
    const o = S.out;
    for (const k of knobs) {
      const v = o[k];
      if (prev[k] == null) { prev[k] = v; continue; }
      const d = v - prev[k];
      if (Math.abs(d) < DEADBAND[k]) continue;          // ainda dentro do ruído: nada a dizer
      const s = d > 0 ? 1 : -1;
      if (prevSign[k] !== 0 && s !== prevSign[k]) signFlips[k].push(now);
      prevSign[k] = s;
      prev[k] = v;                                      // novo extremo confirmado
    }
  }

  // (b) PRE_DROP antes de cada DROP + DROP no barIndex % 16 === 0
  const badBar = dropBars.filter(d => d.bar % 16 !== 0);
  check('(b1) PRE_DROP ocorre antes de cada DROP',
    dropBars.length > 0 && dropsWithoutPreDrop.length === 0,
    `drops=${dropBars.length} · sem pre-drop=${dropsWithoutPreDrop.length} ${dropsWithoutPreDrop.length ? '(bars ' + dropsWithoutPreDrop.join(',') + ')' : ''}`);
  check('(b2) DROP cai em barIndex % 16 === 0',
    dropBars.length > 0 && badBar.length === 0,
    `bars dos drops=[${dropBars.map(d => d.bar).join(', ')}] · fora da frase=${badBar.length}`);

  check('(c) beamIntensity nunca > 0.18', maxBeamInt <= 0.18 + 1e-9,
    `máx observado no CONFIG = ${maxBeamInt.toFixed(6)}`);

  // (d) janela deslizante de 1 s: nenhum knob muda de sinal de derivada mais de 3×
  let worst = { knob: '-', n: 0, at: 0 };
  for (const k of knobs) {
    const ts = signFlips[k];
    for (let i = 0; i < ts.length; i++) {
      let n = 1;
      for (let j = i + 1; j < ts.length && ts[j] - ts[i] <= 1000; j++) n++;
      if (n > worst.n) worst = { knob: k, n, at: ts[i] };
    }
  }
  check('(d) nenhum knob muda de sinal de derivada > 3×/s', worst.n <= 3,
    `pior: ${worst.knob} com ${worst.n} inversões numa janela de 1 s (t=${(worst.at / 1000).toFixed(1)}s)`);

  console.log('\n--- transições observadas (owner=music, 3 min simulados) ---');
  for (const tr of transitions.slice(0, 40)) {
    console.log(`  ${(tr.t / 1000).toFixed(1).padStart(7)}s  bar ${String(tr.bar).padStart(4)}  ${tr.from} → ${tr.to}`);
  }
  if (transitions.length > 40) console.log(`  … +${transitions.length - 40} transições`);
  console.log(`  total: ${transitions.length} transições · ${dropBars.length} drops`);

  // HUD: ligar e confirmar que produz texto (o `m` tem de mostrar alguma coisa)
  env.fireKey('m');
  env.tick(STEP);
  check('(HUD) tecla m produz conteúdo', env.hudEl.textContent.length > 100 && /estado\s+\w+/.test(env.hudEl.textContent),
    `${env.hudEl.textContent.split('\n').length} linhas`);
  console.log('\n--- HUD (tecla m) ---');
  console.log(env.hudEl.textContent.split('\n').map(l => '  ' + l).join('\n'));
}

/* ---- (e) silêncio → health → 0 em ≤ 5 s ---- */
{
  const env = makeEnv({ owner: 'music' });
  const S = env.sandbox.MUSIC.state;
  for (let t = 0; t < 30000; t += STEP) env.tick(STEP);      // 30 s a tocar
  const hBefore = S.health;
  env.sandbox.MUSIC.gen.toggle();                            // gerador off → sem features
  const t0 = env.clock;
  let tZero = null;
  for (let t = 0; t < 15000; t += STEP) {
    env.tick(STEP);
    if (tZero === null && S.health <= 0.001) tZero = env.clock - t0;
  }
  check('(e) silêncio → health → 0 em ≤ 5 s', tZero !== null && tZero <= 5000,
    `health antes=${hBefore.toFixed(2)} · chegou a 0 em ${tZero === null ? 'nunca' : (tZero / 1000).toFixed(2) + ' s'} · health final=${S.health.toFixed(3)}`);
}

/* ==================================== relatório ==================================== */
console.log('\n=== VERIFICAÇÃO FASE 2 ===');
let failed = 0;
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FALHA'}  ${r.name}\n        ${r.detail}`);
  if (!r.ok) failed++;
}
console.log(`\n${results.length - failed}/${results.length} asserções passaram.`);
process.exit(failed ? 1 : 0);
