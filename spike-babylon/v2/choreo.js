/* v2/choreo.js — coreografia dos pinspots (Fase 5).
 *
 * Porte VERBATIM de `web/index-v2.html:252-285` (`randomPose`, `stepChoreo`, flashes Poisson).
 * Nada aqui desenha: produz só (a) um `gain` por spot (0..1) que multiplica a intensidade e
 * (b) uma lista de `flashes` vivos. Quem os consome é o `ball.js` (mancha CPU/cadeia de cinza)
 * e o `main.js` (SpotLights).
 *
 * REGRAS (docs/parity-canvas2d.md §3, fixadas pelo David):
 *  - o foco NUNCA varre a superfície: apaga (gain 1→0), SALTA de posição, acende (0→1);
 *  - `randomPose()` nunca aponta de frente para o público (az≈0): sorteia |az| em `azRange`
 *    e depois o sinal;
 *  - flashes: máx `flashSlots` vivos, `flashRate` = flashes/s MÉDIOS — S3b (S14, f16-sync §1
 *    decisões 2 e 9): já NÃO é Poisson por dt. Nascem em arestas de `beatTick` do relógio único
 *    (`MUSIC.state`, W3) com um divisor `beatHz/flashRate`; sem tick há 1,5 s, cadência múltipla
 *    do bombo (`bpmEst` é PERÍODO em ms) ou fixa `1/flashRate`. O random escolhe a POSE, nunca o
 *    momento;
 *  - retarget (se ligado): o `dwell` [s] converte-se em COMPASSOS e o salto acontece numa aresta
 *    de `barTick` (S3b); sem relógio, conta segundos como antes. A pose continua aleatória;
 *  - `reducedMotion` congela tudo (o `step()` retorna logo).
 *
 * API: createChoreo(CONFIG) -> {
 *    step(dt)            // dt em SEGUNDOS, clampado a 0.05 (=50 ms, como :337)
 *    gainOf(i)           // 0..1 do spot i (1 se não houver estado)
 *    flashes             // array vivo [{az, el, aim, radius, intensity, life, age}] — NÃO guardar refs
 *    retarget(i, pose)   // re-aponta o spot i (pose parcial opcional)
 *    flash(opts)         // dispara um flash já ({intensity,radius,len,az,el,aim})
 *    setEnabled(on)      // CONFIG.choreo.enabled
 *    reset()             // volta ao estado inicial (gains a 1, sem flashes)
 *    randomPose()        // pose plausível (exposta para o main.js/API)
 *    get count()         // nº de spots com estado
 * }
 */
'use strict';

const TAU = Math.PI * 2;

function num(v, d) { return Number.isFinite(v) ? v : d; }
function rnd(a, b) { return a + Math.random() * (b - a); }
// par [min,max] robusto: aceita array, número solto ou nada
function pair(p, d0, d1) {
  if (Array.isArray(p)) return [num(p[0], d0), num(p[1], d1)];
  if (Number.isFinite(p)) return [p, p];
  return [d0, d1];
}

export function createChoreo(CONFIG) {
  const reducedMotion = (typeof matchMedia === 'function')
    ? matchMedia('(prefers-reduced-motion: reduce)').matches : false;

  const cfg = () => (CONFIG && CONFIG.choreo) || {};
  const spots = () => (CONFIG && Array.isArray(CONFIG.spots) ? CONFIG.spots : []);

  // estado por spot — :252 `choreo = CONFIG.spots.map((s,i) => ({t: 1.5 + i*1.7, to: null, mt: 1, gain: 1}))`
  // (a lista de spots é fixa no CONFIG, mas cresce-se defensivamente se alguém lhe acrescentar um)
  const choreo = [];
  function ensure(n) {
    while (choreo.length < n) { const i = choreo.length; choreo.push({ t: 1.5 + i * 1.7, to: null, mt: 1, gain: 1 }); }
  }
  ensure(spots().length);

  const flashes = [];
  /* ---- S3b: relógio S1 lido por poll (aresta por delta dos contadores monotónicos) ----
     Regra 7: tudo nasce com valor. `clock` é diagnóstico ('beatTick' | 'bpmEst' | 'fixo' | 'none'). */
  const CLOCK_DEAD_S = 1.5;
  const clk = { lastBeatTick: -1, lastBarTick: -1, beatTick: 0, barTick: 0, lastBeatAt: -1e9,
    edgeBeat: false, edgeBar: false, flashNextAt: -1e9, clock: 'none' };
  const MSget = () => (typeof window !== 'undefined' && window.MUSIC && window.MUSIC.state) || null;
  function beatPeriodS(MS) { const p = MS ? num(MS.bpmEst, 0) : 0; return p > 0 ? p / 1000 : 60 / 128; }
  function pollClock(now) {
    const MS = MSget();
    clk.edgeBeat = clk.edgeBar = false;
    if (!MS) { clk.clock = 'none'; return null; }
    const bt = num(MS.beatTick, 0), bar = num(MS.barTick, 0);
    if (clk.lastBeatTick >= 0) {
      if (bt > clk.lastBeatTick) { clk.edgeBeat = true; clk.lastBeatAt = now; }
      if (bar > clk.lastBarTick) clk.edgeBar = true;
    }
    clk.lastBeatTick = bt; clk.lastBarTick = bar; clk.beatTick = bt; clk.barTick = bar;
    return MS;
  }
  let nowS = 0;   // relógio interno em segundos (soma dos dt) — só para o fallback sem tick

  // :253-257 verbatim (com `pair()` a defender de knobs em falta — regra 7: nada de NaN)
  function randomPose() {
    const C = cfg();
    const aimMax = num(C.aimMax, 0.35);
    const r = Math.sqrt(Math.random()) * aimMax, a = Math.random() * TAU;
    const az0 = pair(C.azRange, 35, 130), el0 = pair(C.elRange, 5, 30);
    const az = rnd(az0[0], az0[1]) * (Math.random() < 0.5 ? -1 : 1); // nunca do lado do público (az≈0)
    return { az, el: rnd(el0[0], el0[1]), aim: [r * Math.cos(a), r * Math.sin(a) * 0.6] };
  }

  // :260-285 verbatim
  function step(dtIn) {
    let dt = num(dtIn, 0);
    if (!(dt > 0)) dt = 0;
    if (dt > 0.05) dt = 0.05;            // clamp de :337 (dtMs 0..50)
    const C = cfg();
    if (!C.enabled || reducedMotion) return;

    const S = spots();
    ensure(S.length);
    const move = Math.max(num(C.move, 0.08), 0.01);
    const dwell = pair(C.dwell, 4, 12);
    nowS += dt;
    const MS = pollClock(nowS);
    const alive = !!MS && (nowS - clk.lastBeatAt) < CLOCK_DEAD_S;
    const barS = beatPeriodS(MS) * 4;   // 4/4 assumido (o relógio S1 já conta assim sem grelha)

    for (let i = 0; i < S.length; i++) {
      const c = choreo[i];
      if (c.to) {
        // troca de sítio: apaga (mt 0→1), salta de posição a meio, acende (mt 1→2).
        // NUNCA varre a superfície.
        c.mt = Math.min(2, c.mt + dt / move);
        if (c.mt >= 1 && c.to.pending) {
          const s = S[i];
          s.az = c.to.az; s.el = c.to.el;
          if (!Array.isArray(s.aim)) s.aim = [0, 0];
          s.aim[0] = c.to.aim[0]; s.aim[1] = c.to.aim[1];
          c.to.pending = false;
        }
        c.gain = c.mt < 1 ? 1 - c.mt : c.mt - 1;
        if (c.mt >= 2) { c.to = null; c.gain = 1; c.t = rnd(dwell[0], dwell[1]); }
      } else if (C.retarget) {
        /* S3b: com relógio vivo o `dwell` gasta-se em COMPASSOS (uma unidade por `barTick`) e o
           salto dá-se NA aresta; sem relógio, segundos como antes. `c.t` fica em segundos nos dois
           casos (é o que o painel/diagnóstico já lê); o passo por compasso desconta `barS`. */
        if (alive) { if (clk.edgeBar) c.t -= barS; }
        else c.t -= dt;
        if (c.t <= 0 && (!alive || clk.edgeBar)) { c.to = randomPose(); c.to.pending = true; c.mt = 0; }
      }
    }

    // flashes: S3b — nascem em arestas de `beatTick` (divisor por `flashRate`), nunca por Poisson
    const slots = Math.max(0, Math.round(num(C.flashSlots, 4)));
    const fRad = pair(C.flashRadius, 0.10, 0.18);
    const fInt = pair(C.flashIntensity, 0.6, 1.0);
    const fLen = pair(C.flashLen, 0.09, 0.22);
    const rate = Math.max(0, num(C.flashRate, 0));
    let spawn = false;
    if (rate > 0) {
      if (alive) {
        clk.clock = 'beatTick';
        if (clk.edgeBeat) {
          const div = Math.max(1, Math.round((1 / beatPeriodS(MS)) / rate));
          spawn = clk.beatTick % div === 0;
        }
      } else {
        let period = 1 / rate;
        if (MS && num(MS.bpmEst, 0) > 0) {
          const beatS = beatPeriodS(MS);
          period = Math.max(beatS, Math.round(period / beatS) * beatS);
          clk.clock = 'bpmEst';
        } else clk.clock = MS ? 'fixo' : 'none';
        if (nowS >= clk.flashNextAt) { clk.flashNextAt = nowS + Math.max(1 / 3, period); spawn = true; }
      }
    }
    if (spawn && flashes.length < slots) {
      const p = randomPose();
      flashes.push({ az: p.az, el: p.el, aim: p.aim,
        radius: rnd(fRad[0], fRad[1]), intensity: rnd(fInt[0], fInt[1]),
        life: Math.max(0.01, rnd(fLen[0], fLen[1])), age: 0 });
    }
    for (let i = flashes.length - 1; i >= 0; i--) {
      flashes[i].age += dt;
      if (flashes[i].age >= flashes[i].life) flashes.splice(i, 1);
    }
  }

  function gainOf(i) {
    const c = choreo[i];
    return c ? num(c.gain, 1) : 1;
  }

  // :742-743 — re-aponta um spot já (o técnico muda o pinspot de sítio); sem pose → aleatória
  function retarget(i, pose) {
    ensure(spots().length);
    const c = choreo[i];
    if (!c || !spots()[i]) return false;
    c.to = Object.assign(randomPose(), pose || {}, { pending: true });
    if (!Array.isArray(c.to.aim)) c.to.aim = [0, 0];
    c.mt = 0;
    return true;
  }

  // :733-739 — flash curto num sítio novo (motor: bombo/tarola)
  function flash(opts) {
    const o = opts || {}, C = cfg(), p = randomPose();
    const slots = Math.max(0, Math.round(num(C.flashSlots, 4)));
    if (flashes.length >= slots + 2) flashes.shift();
    const fRad = pair(C.flashRadius, 0.10, 0.18);
    const fInt = pair(C.flashIntensity, 0.6, 1.0);
    const fLen = pair(C.flashLen, 0.09, 0.22);
    const f = {
      az: Number.isFinite(o.az) ? o.az : p.az,
      el: Number.isFinite(o.el) ? o.el : p.el,
      aim: (Array.isArray(o.aim) && o.aim.length >= 2) ? [num(o.aim[0], 0), num(o.aim[1], 0)] : p.aim,
      radius: num(o.radius, 0) || rnd(fRad[0], fRad[1]),
      intensity: num(o.intensity, 0) || rnd(fInt[0], fInt[1]),
      life: Math.max(0.01, num(o.len, 0) || rnd(fLen[0], fLen[1])),
      age: 0,
    };
    flashes.push(f);
    return f;
  }

  function setEnabled(on) { if (CONFIG && CONFIG.choreo) CONFIG.choreo.enabled = !!on; }

  function reset() {
    flashes.length = 0; clk.flashNextAt = -1e9;
    for (let i = 0; i < choreo.length; i++) { choreo[i].t = 1.5 + i * 1.7; choreo[i].to = null; choreo[i].mt = 1; choreo[i].gain = 1; }
  }

  return {
    step, gainOf, flashes, retarget, flash, setEnabled, reset, randomPose,
    get reducedMotion() { return reducedMotion; },
    get count() { return choreo.length; },
    /* estado interno por spot — diagnóstico (`{t, to, mt, gain}`), não escrever. */
    state: choreo,
    /* S3b diagnóstico: que relógio comanda os flashes/retarget */
    get clock() { return clk.clock; },
  };
}
