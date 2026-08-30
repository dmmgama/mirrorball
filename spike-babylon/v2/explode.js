/* explode.js — máquina de estados da explosão em estilhaços (spike v2, Fase 7)
 *
 * Porta `web/index-v2.html` (:293-296 estado, :337-369 máquina, :753-770 API) para um módulo
 * isolado, SEM tocar em geometria: aqui só se produz o escalar `s ∈ [0,1]` (0 = bola inteira,
 * 1 = estilhaços no ar), o `floatT` (flutuação em pausa) e o `angle0` (rotação congelada no
 * instante do estoiro). Quem os consome:
 *   - `ball.js` (posições/normais dos 4 vértices por tile, núcleo, osso, rotação congelada);
 *   - `main.js` bloco F7 (halo ×(1−0.75·s), incidente ×(1−0.8·s), API `window.MIRRORBALL`).
 *
 * INVARIANTE CENTRAL (index-v2.html:296): **tudo é função pura de `s`**. O rewind não é uma
 * animação separada — é `s` a descer pela mesma curva. Por isso nenhum consumidor pode guardar
 * estado próprio da explosão: dá `s`, recebe a pose. A única exceção é `floatT` (a flutuação em
 * pausa), e mesmo essa é multiplicada por `clamp((s−0.7)/0.3, 0, 1)` para se dissolver antes de o
 * rewind começar a mexer — ver `floatT` abaixo.
 *
 * INVARIANTE DE SEGURANÇA (`maxHold`, :356): nenhuma fonte externa (motor de música, API, tecla)
 * pode deixar a bola partida para sempre. Passados `maxHold` s desde o estoiro, `back` é forçado
 * mesmo em `held` (o estado "fica no ar até rewind()" explícito).
 *
 * Fases: `idle → out → drift → hold|held → back → idle`
 *   out    easeOutQuad, `burstSec` s, de 0 a `burstS`      — estoiro seco (ainda tem forma de bola)
 *   drift  easeOutCubic, `driftSec` s, de `burstS` a 1     — câmara lenta, os estilhaços afastam-se
 *   hold   s=1 durante `hold` s, acumula `floatT`          — suspenso, depois `back` automático
 *   held   s=1 indefinidamente (autoHold:false)            — fica até `rewind()` ou `maxHold`
 *   back   easeInOutCubic, `rewind·max(sFrom,0.05)` s      — sucção de volta
 *
 * API: createExplode(CONFIG) → {
 *   step(dt)            avança a máquina (dt em SEGUNDOS, clampado a 0.05 como :337)
 *   s, phase, floatT, angle0          getters do estado do frame
 *   explode(opts, angleNow)           dispara/reentra; `opts` sobrepõe `CONFIG.explode`
 *   rewind()                          força a volta a partir do s atual
 *   get()                             { phase, s, enabled } — o que a API pública devolve
 *   enabled, setEnabled(v)            botão "explosões" (só bloqueia `{fromMotor:true}`)
 * }
 *
 * NÃO faz: geometria (é do `ball.js`), desenho, leitura de teclado (é do `main.js`), persistência
 * em localStorage (é do `main.js`, que é quem sabe a chave `mb2.explode`).
 */

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function num(v, d) { return Number.isFinite(v) ? v : d; }

// defaults de `CONFIG.explode` (config.js:96-110 já os tem; isto é a rede de segurança da regra 7:
// nenhum knob pode ficar sem valor inicial finito, ou um NaN propaga-se até apagar a bola)
const EX_DEFAULTS = {
  burstSec: 0.16, burstS: 0.16, driftSec: 6.0, hold: 0.5, maxHold: 14, rewind: 0.9,
  radial: 1.9, depth: 0.45, jitter: 0.45, floatSpin: 0.35, floatBob: 0.05, gravity: 1.1, spinMax: 3.2,
};

export function createExplode(CONFIG) {
  const C = CONFIG || {};
  if (!C.explode) C.explode = Object.assign({}, EX_DEFAULTS);
  // leitura por frame do CONFIG (nunca copiada para estado interno): mexer no slider a meio de uma
  // explosão aplica-se ao vivo. `ex(k)` é a leitura defensiva de um knob.
  function ex(k) { return num(C.explode[k], EX_DEFAULTS[k]); }

  // `prefers-reduced-motion`: a explosão é o gesto mais violento da bola — com a preferência
  // ligada, `explode()` é no-op (mesma política do `choreo.js`, que congela).
  const reducedMotion = (typeof matchMedia === 'function')
    && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // estado (index-v2.html:294)
  const st = {
    phase: 'idle',
    t: 0,          // tempo dentro da fase atual
    s: 0,          // progresso paramétrico 0..1 — o ÚNICO output que a geometria lê
    sFrom: 1,      // s no início do `back` (o rewind desce de sFrom até 0)
    angle0: 0,     // rotação da bola congelada no instante do estoiro
    autoHold: true,
    age: 0,        // s desde o estoiro — só para o teto `maxHold`
    floatT: 0,     // tempo acumulado em pausa (hold/held), alimenta o tombo/bob suspensos
  };
  let enabled = true;

  /* ---------------- máquina de estados (verbatim index-v2.html:337-363) ---------------- */
  function step(dtSec) {
    // dt clampado a 50 ms: com o tab em segundo plano o dt salta e a bola "teletransportava-se"
    let dt = num(dtSec, 0);
    if (!(dt >= 0)) dt = 0;
    if (dt > 0.05) dt = 0.05;

    if (st.phase !== 'idle') {
      st.t += dt; st.age += dt;
      if (st.phase === 'out') {              // estoiro seco: easeOutQuad até burstS
        const bs = Math.max(0.001, ex('burstSec'));
        const u = clamp(st.t / bs, 0, 1);
        st.s = ex('burstS') * (1 - (1 - u) * (1 - u));
        if (u >= 1) { st.phase = 'drift'; st.t = 0; }
      } else if (st.phase === 'drift') {     // câmara lenta: easeOutCubic de burstS até 1
        const ds = Math.max(0.001, ex('driftSec'));
        const burstS = ex('burstS');
        const u = clamp(st.t / ds, 0, 1);
        st.s = burstS + (1 - burstS) * (1 - Math.pow(1 - u, 3));
        if (u >= 1) { st.phase = st.autoHold ? 'hold' : 'held'; st.t = 0; }
      } else if (st.phase === 'hold') {
        st.s = 1; st.floatT += dt;
        if (st.t >= ex('hold')) { st.phase = 'back'; st.t = 0; st.sFrom = 1; }
      } else if (st.phase === 'held') {
        st.s = 1; st.floatT += dt;
      }
      // teto absoluto: nenhuma fonte externa pode deixar a bola em estilhaços para sempre
      if (st.phase !== 'back' && st.age >= ex('maxHold')) {
        st.phase = 'back'; st.t = 0; st.sFrom = Math.max(st.s, 0.05);
      }
      if (st.phase === 'back') {
        const dur = Math.max(0.001, ex('rewind') * Math.max(st.sFrom, 0.05));
        const u = clamp(st.t / dur, 0, 1);
        const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;   // easeInOutCubic
        st.s = st.sFrom * (1 - e);
        if (u >= 1) { st.s = 0; st.phase = 'idle'; }
      }
    }
    // regra 7: um NaN aqui apagava a bola inteira (a geometria multiplicava tudo por NaN)
    if (!Number.isFinite(st.s)) { st.s = 0; st.phase = 'idle'; st.floatT = 0; st.age = 0; }
    st.s = clamp(st.s, 0, 1);
    if (st.s <= 0.0005) st.floatT = 0;       // :366 — fora da explosão não há flutuação a acumular
    return st.s;
  }

  /* ---------------- disparo / reentrada (index-v2.html:755-765) ----------------
     Reentrada sem salto: `explode()` a meio do rewind não recomeça do zero — resolve o tempo `t`
     que, na curva da fase de destino, dá exatamente o `s` atual (inverte easeOutQuad com `sqrt` e
     easeOutCubic com `cbrt`) e continua dali. É por isso que `s` tem de ser função pura do tempo
     da fase: qualquer outro esquema (velocidade acumulada) não teria inversa. */
  function explode(opts, angleNow) {
    if (reducedMotion) return;
    const o = opts || {};
    const { autoHold, fromMotor, ...cfg } = o;
    if (fromMotor && !enabled) return;       // botão "explosões: off" só trava o motor
    // knobs passados no opts sobrepõem o CONFIG (o motor pode pedir um estoiro mais curto/largo)
    for (const k in cfg) if (Number.isFinite(cfg[k])) C.explode[k] = cfg[k];

    const s = clamp(num(st.s, 0), 0, 0.999);
    const burstS = ex('burstS');
    if (st.phase === 'idle') { st.angle0 = num(angleNow, st.angle0); st.age = 0; }
    st.autoHold = autoHold !== false;
    if (s < burstS) {
      st.phase = 'out';
      st.t = ex('burstSec') * (1 - Math.sqrt(1 - (burstS > 0 ? s / burstS : 0)));
    } else {
      st.phase = 'drift';
      const den = 1 - burstS;
      st.t = ex('driftSec') * (1 - Math.cbrt(1 - (den > 0 ? (s - burstS) / den : 0)));
    }
    if (!Number.isFinite(st.t)) st.t = 0;
  }

  function rewind() {
    if (st.phase !== 'idle' && st.phase !== 'back') {
      st.phase = 'back'; st.t = 0; st.sFrom = Math.max(st.s, 0.05);
    }
  }

  return {
    step,
    explode,
    rewind,
    get s() { return st.s; },
    get phase() { return st.phase; },
    /* flutuação em pausa, JÁ pesada por `clamp((s−0.7)/0.3)` (:367): só conta perto de s=1, por
       isso dissolve-se nos primeiros 30% do rewind e este continua a ser função pura de `s`. */
    get floatT() {
      const f = st.floatT * clamp((st.s - 0.7) / 0.3, 0, 1);
      return Number.isFinite(f) ? f : 0;
    },
    /* rotação da bola no instante do estoiro (os estilhaços não continuam a girar com o motor) */
    get angle0() { return st.angle0; },
    get enabled() { return enabled; },
    setEnabled(v) { enabled = !!v; },
    get reducedMotion() { return reducedMotion; },
    get() { return { phase: st.phase, s: st.s, enabled }; },
    /* diagnóstico (HUD/consola) — não faz parte do contrato consumido pela geometria */
    get age() { return st.age; },
    get autoHold() { return st.autoHold; },
  };
}

export default createExplode;
