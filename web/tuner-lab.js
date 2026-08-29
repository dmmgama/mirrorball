/* tuner-lab.js — instrumento de afinação do detetor de bombo.
 *
 * ============================== PORQUÊ ESTE FICHEIRO EXISTE ==============================
 * Afinar o detetor olhando para a BOLA não funciona: entre o kick e o que se vê há inércia
 * (taus de 0.6-4 s), há o piso de rotação, há névoa, há rampas de gesto e há a FSM. O David não
 * consegue distinguir "o detetor FALHOU a batida" de "o detetor acertou e o mapeamento
 * suavizou". Este instrumento separa as duas coisas: mostra o SINAL que o detetor viu, a LINHA
 * DE LIMIAR que ele usou, as MARCAS de cada kick que ele decidiu, e por baixo, no mesmo eixo de
 * tempo, o que a bola fez em consequência.
 *
 * ============================== O QUE NÃO FAZ (de propósito) ==============================
 * NÃO tem cópia do algoritmo. Corre o `music.js` REAL — o mesmo ficheiro que a bola carrega —
 * num sandbox construído nesta página, com o mesmo padrão do `web/test-music-f2.js` (relógio
 * virtual + `postMessage` falso). Se o detetor mudar, isto muda com ele, sem sincronização
 * manual. É por isso que não se usou Sonic Visualiser nem madmom: obrigariam a reimplementar o
 * detetor noutra linguagem e a manter duas versões alinhadas.
 *
 * NÃO toca no `index-v2.html` nem na bola. Com esta página fechada, a bola é exatamente o que
 * era. A única mudança no `music.js` foi publicar em `state.det` estatística que o `BandOnset`
 * já calculava (§DETSTATS) — nenhum valor de decisão foi alterado.
 *
 * ============================== FLUXO ==============================
 *   1. gravar   → node tools/cap.js 60 tools/feat.json     (com a música a tocar)
 *   2. abrir    → esta página, botão "Carregar feat.json"  (ou ?feat=tools/feat.json)
 *   3. afinar   → mexer nos sliders; o mesmo ficheiro é REPROCESSADO na hora
 *   4. gravar   → botão "Copiar config" → colar em music-config.json (ou usar o painel `k` na bola)
 */
'use strict';

/* ================================ constantes do instrumento ================================
 * §5 do plano vale aqui também: nada de números soltos espalhados pelo código. Estes são do
 * INSTRUMENTO (janelas, cores, tamanhos) — os do MOTOR vivem todos no `music.js`. */
const LAB = {
  scriptUrls: ['core.js', 'music.js'],   // os ficheiros REAIS, pela ordem em que a bola os carrega
  stepMs: 16,                            // passo do rAF virtual (~60 fps, igual ao harness)
  featureHz: 50,                         // ritmo nominal do sidecar (só para estimativas)
  // A amostra vive em DOIS sítios: `tools/feat-sample.json` (a canónica, gerada por
  // tools/make-sample.js) e uma cópia em `web/` — porque o sidecar serve `web/` de forma
  // achatada e não alcança `../tools/`. A da web é a que a página busca.
  sampleUrl: 'feat-sample.json',
  maxFrames: 200000,                     // guarda contra um ficheiro gigante travar o browser
  reprocessDebounceMs: 40,               // agrega gestos de slider seguidos num só reprocessamento
  // Seed FIXA do RNG dos gestos. Na bola a seed é `Date.now()` de propósito (§3.3: "previsível é
  // o oposto de quase mágica"), mas aqui isso era veneno: mexer num slider mudava os gestos ao
  // mesmo tempo que o limiar, e a pista das saídas mudava por duas razões de cada vez. Com a
  // seed fixa, a única variável entre dois reprocessamentos é o knob que o David mexeu.
  gestureSeed: 42,
  logFloor: 1e-3,                        // piso para a escala log (ver onde é usado)
  plotHeights: { flux: 190, thin: 110, out: 130, fsm: 44 },
  colors: {
    flux: '#d8d8d8', thr: '#ff8a4c', med: '#5c9ded', beat: '#ffd24a',
    a: '#d8d8d8', b: '#7fc4a0', c: '#c48fd0', grid: '#2a2a2a', text: '#8a8a8a',
  },
  fsmColors: {
    GROOVE: '#3a4a3a', BUILD: '#4a4432', PRE_DROP: '#4a3a2a',
    DROP: '#5a4620', BREAKDOWN: '#2f3a4a',
  },
};

/* Nomes injetados no sandbox como parâmetros (ver `run` mais abaixo para o porquê). Tudo o que
 * o `music.js`/`core.js` tocam e que TEM de ser o nosso, não o do browser. */
const SANDBOX_NAMES = [
  'console', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'addEventListener', 'removeEventListener', 'postMessage',
  'location', 'matchMedia', 'fetch', 'document', 'MIRRORBALL', 'URLSearchParams',
];

/* ================================ sandbox: o motor REAL ================================
 * Mesmo desenho do `makeEnv` do `test-music-f2.js`, adaptado ao browser: um objeto que finge ser
 * `window` (com `performance.now` a devolver o relógio VIRTUAL) e onde se avaliam os ficheiros
 * originais com `new Function`. Não há `vm` no browser, mas também não é preciso isolamento de
 * segurança — é código nosso, o que se quer é isolamento de RELÓGIO e de CONFIG.
 *
 * O relógio virtual é o que permite reprocessar 60 s de música em muito menos de 1 s: o motor
 * julga que o tempo passou, sem esperar por ele. */
function makeEngine() {
  let clock = 0;
  const rafQueue = [];
  const timers = [];
  const listeners = {};
  const msgQueue = [];

  // CONFIG com a mesma forma do index-v2.html — é onde o motor escreve o que a bola mostraria.
  const CONFIG = {
    rotationRpm: 1.0, haze: 0.65, beamMaxCount: 36, beamIntensity: 0.16,
    sphereOpacity: 1.0, spotFadeMix: 1.0, skin: 'auto',
    spots: [
      { az: -58, el: 34, intensity: 1.00, size: 55, period: 13 },
      { az: 62, el: 22, intensity: 0.85, size: 40, period: 17 },
      { az: 12, el: 58, intensity: 0.70, size: 70, period: 11 },
    ],
  };
  let health = 1;
  const MIRRORBALL = {
    config: CONFIG,
    setHealth(h) { health = Math.max(0, Math.min(1, +h || 0)); },
    getHealth() { return health; },
    setSpot(i, p) { if (CONFIG.spots[i]) Object.assign(CONFIG.spots[i], p || {}); },
    setSkin(m) { CONFIG.skin = m; },
    setSkinAuto() { /* regra 1: o motor não lhe toca; aqui é só para não rebentar */ },
    getSkin() { return { mode: CONFIG.skin, mix: 0, target: 0 }; },
  };

  // HUD falso: o `music.js` procura #mus e desiste sem drama se não estiver ligado.
  const hudEl = { classList: { contains: () => false, toggle() {} }, textContent: '' };

  const sb = {
    console: { log() {}, warn() {}, error(...a) { console.error('[motor]', ...a); } },
    performance: { now: () => clock },
    Date, Math, JSON, Object, Array, Promise, Error, String, Number, Boolean, Symbol, Map, Set,
    isFinite, isNaN, parseFloat, parseInt, URLSearchParams,
    requestAnimationFrame(fn) { rafQueue.push(fn); return rafQueue.length; },
    cancelAnimationFrame() {},
    setTimeout(fn, ms) { timers.push({ at: clock + (ms || 0), fn }); return timers.length; },
    clearTimeout() {}, setInterval() { return 0; }, clearInterval() {},
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener() {},
    postMessage(d) { msgQueue.push(d); },
    location: { search: '?src=music', pathname: '/tuner-lab.html' },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    // `fetch` DESLIGADO no sandbox de propósito: o motor tentaria buscar music-config.json e
    // /app-token, e um ficheiro gravado numa sessão anterior mudaria os valores por baixo dos
    // sliders sem o David perceber. Aqui a referência é sempre o DEFAULT do código.
    fetch: undefined,
    document: {
      getElementById: (id) => (id === 'mus' ? hudEl : null),
      createElement: () => ({ style: {}, appendChild() {}, addEventListener() {}, classList: { add() {} } }),
      head: { appendChild() {} }, body: { style: {}, appendChild() {} },
      addEventListener() {},
    },
    MIRRORBALL,
  };
  sb.window = sb; sb.self = sb; sb.parent = sb; sb.globalThis = sb; sb.top = sb;

  function drain() {
    let guard = 0;
    while (msgQueue.length && guard++ < 4096) {
      const d = msgQueue.shift();
      for (const fn of (listeners.message || [])) fn({ data: d });
    }
  }
  function tick(dt) {
    clock += dt;
    for (let i = 0; i < timers.length; i++) {
      if (timers[i] && timers[i].at <= clock) { const t = timers[i]; timers[i] = null; t.fn(); }
    }
    drain();
    const q = rafQueue.splice(0, rafQueue.length);
    for (const fn of q) fn(clock);
    drain();
  }

  return {
    sandbox: sb, CONFIG, tick, post: (d) => msgQueue.push(d),
    get clock() { return clock; },
    /* Avalia os ficheiros REAIS no sandbox.
     *
     * Os nomes do sandbox entram como PARÂMETROS da função, não por `with (window) {...}`.
     * Não é estilo: o `with` desliga o JIT do V8 dentro do bloco inteiro, e o bloco inteiro é o
     * motor todo. Medido neste ficheiro, com a amostra de 60 s: `with` = 2520 ms por
     * reprocessamento, parâmetros nomeados = 620 ms. O mesmo teste confirmou que a SAÍDA é
     * bit-a-bit igual nos dois caminhos (mesma contagem de kicks, mesmo BPM, mesma soma de rpm
     * com a seed fixa) — é só velocidade.
     *
     * Os globais que não estão nesta lista (`Math`, `JSON`, `Date`, `Array`…) resolvem para os
     * do browser, que são exatamente os mesmos objetos que o sandbox lhes daria. O que importa
     * isolar é o RELÓGIO (`performance.now`), o rAF, os timers, as mensagens e o CONFIG — e
     * esses estão todos aqui. */
    run(sources) {
      const names = SANDBOX_NAMES.concat(['window', 'self', 'globalThis', 'top', 'parent']);
      const vals = SANDBOX_NAMES.map(k => sb[k]).concat([sb, sb, sb, sb, sb]);
      for (const src of sources) {
        // eslint-disable-next-line no-new-func
        new Function(...names, src)(...vals);
      }
      return sb.MUSIC;
    },
  };
}

/* ================================ estado do instrumento ================================
 * Tudo inicializado (a mesma regra 7 do motor, pela mesma razão: um `undefined` a meio de um
 * gráfico não dá erro, dá uma linha invisível e uma hora perdida). */
const S = {
  sources: null,       // texto de core.js + music.js (lido UMA vez, reutilizado a cada reprocess)
  rows: [],            // features cruas carregadas
  fileName: '',
  series: null,        // resultado do último reprocessamento
  plots: [],           // instâncias uPlot
  knobs: {},           // {path: valor atual dos sliders}
  syncing: false,
  reprocessTimer: 0,
  cursorIdx: null,
};

const $ = (id) => document.getElementById(id);
const fmt = (v, d = 2) => (isFinite(v) ? v.toFixed(d) : '—');

/* ================================ carregar os ficheiros do motor ================================ */
async function loadSources() {
  if (S.sources) return S.sources;
  const out = [];
  for (const u of LAB.scriptUrls) {
    const r = await fetch(u + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error(`não consegui ler ${u} (HTTP ${r.status})`);
    out.push(await r.text());
  }
  S.sources = out;
  return out;
}

/* ================================ o reprocessamento ================================
 * Cria um motor NOVO (estado limpo — senão a mediana do run anterior contaminava este), aplica
 * os knobs, e empurra as features gravadas pelo mesmo caminho que o sidecar usaria. Depois de
 * cada frame, lê `state.det` (§DETSTATS) e o CONFIG e guarda tudo em arrays paralelos.
 *
 * Segue o padrão do `replay-real.js`: avança o relógio virtual até ao `t` da feature, publica, e
 * dá um tick para o rAF do motor correr. */
function reprocess() {
  if (!S.rows.length || !S.sources) return null;
  const t0 = performance.now();

  const eng = makeEngine();
  const M = eng.run(S.sources);
  if (!M) throw new Error('o music.js não exportou window.MUSIC no sandbox');

  M.setSeed(LAB.gestureSeed);                      // gestos reprodutíveis entre reprocessamentos
  // knobs: aplicados pela MESMA API que o painel `k` da bola usa (validação/clamp partilhados).
  for (const [p, v] of Object.entries(S.knobs)) M.tune.set(p, v);
  // os detetores foram construídos com os C0 antigos: re-instanciar via reset do CONFIG vivo.
  // `resetDetectors` não está exposto — mas trocar `state.kickDet.C0` direto é o mesmo efeito e
  // não duplica lógica nenhuma (o refratário e o N também vêm do CONFIG a cada push).
  const B = M.config.bandOnset;
  if (M.state.kickDet) { M.state.kickDet.C0 = B.kickC0; M.state.kickDet.N = B.N; M.state.kickDet.refractMs = B.kickRefractMs; }
  if (M.state.hatDet) { M.state.hatDet.C0 = B.hatC0; M.state.hatDet.N = B.N; M.state.hatDet.refractMs = B.hatRefractMs; }
  M.gen.toggle();                                  // gerador OFF: quem alimenta somos nós

  const st = M.state, cfg = eng.CONFIG;
  const n = S.rows.length;
  const A = {
    t: new Float64Array(n),
    kickFlux: new Float64Array(n), kickThr: new Float64Array(n), kickMed: new Float64Array(n),
    kickFluxRaw: new Float64Array(n),
    hatFlux: new Float64Array(n), hatThr: new Float64Array(n), hatMed: new Float64Array(n),
    presence: new Float64Array(n), bpm: new Float64Array(n), conf: new Float64Array(n),
    rpm: new Float64Array(n), opacity: new Float64Array(n), beamInt: new Float64Array(n),
    beams: new Float64Array(n), haze: new Float64Array(n),
  };
  const kickTimes = [], hatTimes = [], fsmSpans = [];
  let lastKickT = -1, lastHatFlash = 0, lastFsm = null, path = 'fallback';

  const base = S.rows[0].t;
  for (let i = 0; i < n; i++) {
    const r = S.rows[i];
    const tv = r.t - base;
    while (eng.clock < tv) eng.tick(LAB.stepMs);
    eng.post(Object.assign({}, r, { t: eng.clock }));
    eng.tick(LAB.stepMs);

    const D = st.det;
    A.t[i] = eng.clock / 1000;
    // O piso `LOG_FLOOR` existe porque a escala logarítmica não desenha zeros (e o flux é zero
    // em silêncio e nos primeiros frames, antes de o histórico encher). Sem ele, a linha
    // partia-se em pedaços e parecia que o detetor tinha buracos que não tem.
    const LF = LAB.logFloor;
    A.kickFluxRaw[i] = D.kickFlux;                   // sem piso: é este que alimenta os percentis
    A.kickFlux[i] = Math.max(D.kickFlux, LF); A.kickThr[i] = Math.max(D.kickThr, LF);
    A.kickMed[i] = Math.max(D.kickMed, LF);
    A.hatFlux[i] = Math.max(D.hatFlux, LF); A.hatThr[i] = Math.max(D.hatThr, LF);
    A.hatMed[i] = Math.max(D.hatMed, LF);
    A.presence[i] = st.kickPresence;
    A.bpm[i] = st.bpmEst ? 60000 / st.bpmEst : 0;
    A.conf[i] = st.gridConf;
    A.rpm[i] = cfg.rotationRpm; A.opacity[i] = cfg.sphereOpacity;
    A.beamInt[i] = cfg.beamIntensity; A.beams[i] = cfg.beamMaxCount; A.haze[i] = cfg.haze;
    path = D.path;

    // eventos: o motor não emite "houve um kick", mas `lastKickT` mudar é exatamente isso.
    if (st.lastKickT !== lastKickT && isFinite(st.lastKickT)) { lastKickT = st.lastKickT; kickTimes.push(A.t[i]); }
    if (st.hatFlash > lastHatFlash + 0.5) hatTimes.push(A.t[i]);
    lastHatFlash = st.hatFlash;

    if (st.fsm !== lastFsm) {
      if (fsmSpans.length) fsmSpans[fsmSpans.length - 1].t1 = A.t[i];
      fsmSpans.push({ name: st.fsm, t0: A.t[i], t1: A.t[i] });
      lastFsm = st.fsm;
    }
  }
  if (fsmSpans.length) fsmSpans[fsmSpans.length - 1].t1 = A.t[n - 1];

  // BPM médio dos kicks realmente detetados — é o número que se compara com o BPM real da faixa.
  let bpmFromKicks = 0;
  if (kickTimes.length > 3) {
    const ivs = [];
    for (let i = 1; i < kickTimes.length; i++) ivs.push(kickTimes[i] - kickTimes[i - 1]);
    ivs.sort((a, b) => a - b);
    const medIv = ivs[ivs.length >> 1];
    if (medIv > 0) bpmFromKicks = 60 / medIv;
  }

  const durS = A.t[n - 1] - A.t[0];
  return {
    A, kickTimes, hatTimes, fsmSpans, path, durS,
    bpmFromKicks,
    bpmFinal: A.bpm[n - 1],
    kicksPerSec: durS > 0 ? kickTimes.length / durS : 0,
    ms: performance.now() - t0,
  };
}

/* ================================ desenho ================================
 * uPlot, uma instância por pista, todas com `sync` no mesmo grupo: o cursor e o zoom são
 * partilhados, que é o que faz do conjunto uma leitura só (o layout do Sonic Visualiser).
 * As MARCAS DE EVENTO não são uma série — são desenhadas num hook `draw`, porque um "spike" numa
 * série obrigaria a inventar valores entre eventos e distorceria a escala do eixo Y. */
const syncKey = uPlot.sync('lab');

function markerPlugin(getTimes, color) {
  return {
    hooks: {
      draw: (u) => {
        const times = getTimes();
        if (!times || !times.length) return;
        const ctx = u.ctx, { left, top, width, height } = u.bbox;
        ctx.save();
        ctx.beginPath(); ctx.rect(left, top, width, height); ctx.clip();
        ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.globalAlpha = 0.85;
        const t0 = u.scales.x.min, t1 = u.scales.x.max;
        ctx.beginPath();
        for (const t of times) {
          if (t < t0 || t > t1) continue;
          const x = Math.round(u.valToPos(t, 'x', true)) + 0.5;
          ctx.moveTo(x, top); ctx.lineTo(x, top + height);
        }
        ctx.stroke();
        ctx.restore();
      },
    },
  };
}

function fsmPlugin(getSpans) {
  return {
    hooks: {
      draw: (u) => {
        const spans = getSpans();
        const ctx = u.ctx, { left, top, width, height } = u.bbox;
        ctx.save();
        ctx.beginPath(); ctx.rect(left, top, width, height); ctx.clip();
        ctx.font = '10px ui-monospace, Consolas, monospace';
        ctx.textBaseline = 'middle';
        for (const s of spans) {
          const x0 = u.valToPos(s.t0, 'x', true), x1 = u.valToPos(s.t1, 'x', true);
          if (x1 < left || x0 > left + width) continue;
          ctx.fillStyle = LAB.fsmColors[s.name] || '#333';
          ctx.fillRect(x0, top, Math.max(1, x1 - x0), height);
          if (x1 - x0 > 44) {
            ctx.fillStyle = '#e8e8e8';
            ctx.fillText(s.name, x0 + 4, top + height / 2);
          }
        }
        ctx.restore();
      },
    },
  };
}

const axisStyle = {
  stroke: LAB.colors.text,
  grid: { stroke: LAB.colors.grid, width: 1 },
  ticks: { stroke: LAB.colors.grid, width: 1 },
  font: '10px ui-monospace, Consolas, monospace',
};

/* O `uPlot.sync` partilha o CURSOR mas NÃO a escala: com ele sozinho, arrastar para dar zoom
 * numa pista deixava as outras quatro no intervalo antigo, e o "eixo X partilhado" — que é o
 * requisito central deste layout — deixava de ser verdade no momento em que interessa (a olhar
 * de perto para uma batida). Este hook propaga o intervalo a todas as outras pistas.
 * A guarda `S.syncing` evita a recursão óbvia (A avisa B, B avisa A). */
function xSyncPlugin() {
  return {
    hooks: {
      setScale: [(u, key) => {
        if (key !== 'x' || S.syncing) return;
        S.syncing = true;
        const { min, max } = u.scales.x;
        for (const p of S.plots) {
          if (p === u) continue;
          if (p.scales.x.min !== min || p.scales.x.max !== max) p.setScale('x', { min, max });
        }
        S.syncing = false;
      }],
    },
  };
}

function mkPlot(el, height, series, plugins, opts) {
  const width = el.clientWidth || 900;
  const o = Object.assign({
    width, height,
    cursor: { sync: { key: syncKey.key }, drag: { x: true, y: false } },
    legend: { show: false },
    scales: { x: { time: false } },
    axes: [
      Object.assign({}, axisStyle),
      Object.assign({}, axisStyle, { size: 46 }),
    ],
    series,
    plugins: (plugins || []).concat([xSyncPlugin()]),
  }, opts || {});
  return new uPlot(o, [new Float64Array(0)].concat(series.slice(1).map(() => new Float64Array(0))), el);
}

function destroyPlots() { for (const p of S.plots) p.destroy(); S.plots = []; }

function draw(res) {
  destroyPlots();
  const A = res.A;
  const line = (label, stroke, width = 1, dash) => ({ label, stroke, width, dash, points: { show: false } });

  /* 1. PISTA PRINCIPAL — subFluxRaw + mediana + limiar + marcas de kick.
   * A escala Y é LOGARÍTMICA por defeito e isso é uma decisão, não um enfeite: o flux do bombo
   * salta uma ordem de grandeza acima da mediana (medido: p95/p50 ≈ 9), por isso em escala
   * linear o limiar e a mediana ficam ambos esmagados contra o zero e o David não vê a única
   * coisa que interessa — se a curva atravessa a linha uma vez por batida, ou zero, ou três. */
  const logScale = { distr: 3, log: 10 };   // 3 = logarítmica no uPlot
  const useLog = $('chk-log').checked;
  const yFlux = useLog ? logScale : {};

  const p1 = mkPlot($('p-flux'), LAB.plotHeights.flux, [
    {},
    line('subFluxRaw', LAB.colors.flux, 1),
    line('mediana', LAB.colors.med, 1, [2, 3]),
    line('limiar C·med', LAB.colors.thr, 1.5, [5, 3]),
  ], [markerPlugin(() => res.kickTimes, LAB.colors.beat)],
     { scales: { x: { time: false }, y: yFlux } });
  p1.setData([A.t, A.kickFlux, A.kickMed, A.kickThr]);

  // 2. hatFluxRaw, mesmo tratamento (e a mesma razão para o log).
  const p2 = mkPlot($('p-hat'), LAB.plotHeights.thin, [
    {},
    line('hatFluxRaw', LAB.colors.flux, 1),
    line('mediana', LAB.colors.med, 1, [2, 3]),
    line('limiar', LAB.colors.thr, 1.5, [5, 3]),
  ], [markerPlugin(() => res.hatTimes, LAB.colors.b)],
     { scales: { x: { time: false }, y: yFlux } });
  p2.setData([A.t, A.hatFlux, A.hatMed, A.hatThr]);

  // 3. presença / BPM / confiança — separa "falhou batidas" de "apanhou-as e perdeu a grelha".
  const p3 = mkPlot($('p-grid'), LAB.plotHeights.thin, [
    {},
    Object.assign(line('kickPresence', LAB.colors.a, 1.5), { scale: 'u' }),
    Object.assign(line('gridConf', LAB.colors.c, 1), { scale: 'u' }),
    Object.assign(line('BPM', LAB.colors.b, 1), { scale: 'bpm' }),
  ], [], {
    scales: { x: { time: false }, u: { range: [0, 1.05] }, bpm: { range: [0, 200] } },
    axes: [
      Object.assign({}, axisStyle),
      Object.assign({}, axisStyle, { scale: 'u', size: 46 }),
      Object.assign({}, axisStyle, { scale: 'bpm', side: 1, size: 46, grid: { show: false } }),
    ],
  });
  p3.setData([A.t, A.presence, A.conf, A.bpm]);

  // 4. saídas visuais — o que a bola fez, no mesmo eixo de tempo.
  const p4 = mkPlot($('p-out'), LAB.plotHeights.out, [
    {},
    Object.assign(line('rpm', LAB.colors.a, 1.5), { scale: 'rpm' }),
    Object.assign(line('opacidade', LAB.colors.b, 1), { scale: 'u' }),
    Object.assign(line('haze', LAB.colors.c, 1), { scale: 'u' }),
    Object.assign(line('beamInt ×5', LAB.colors.thr, 1), { scale: 'u' }),
    Object.assign(line('nº feixes', '#6a6a6a', 1), { scale: 'beams' }),
  ], [], {
    scales: { x: { time: false }, rpm: { range: [0, 3.1] }, u: { range: [0, 1.05] }, beams: { range: [0, 60] } },
    axes: [
      Object.assign({}, axisStyle),
      Object.assign({}, axisStyle, { scale: 'rpm', size: 46 }),
      Object.assign({}, axisStyle, { scale: 'u', side: 1, size: 46, grid: { show: false } }),
    ],
  });
  const beamX5 = new Float64Array(A.beamInt.length);
  for (let i = 0; i < beamX5.length; i++) beamX5[i] = A.beamInt[i] * 5;
  p4.setData([A.t, A.rpm, A.opacity, A.haze, beamX5, A.beams]);

  // 5. FSM como faixa de blocos rotulados.
  const p5 = mkPlot($('p-fsm'), LAB.plotHeights.fsm, [
    {}, Object.assign(line('', 'transparent', 0), { scale: 'z' }),
  ], [fsmPlugin(() => res.fsmSpans)], {
    scales: { x: { time: false }, z: { range: [0, 1] } },
    axes: [Object.assign({}, axisStyle, { show: false }), Object.assign({}, axisStyle, { scale: 'z', show: false, size: 46 })],
  });
  p5.setData([A.t, new Float64Array(A.t.length)]);

  S.plots = [p1, p2, p3, p4, p5];
  for (const p of S.plots) syncKey.sub(p);
}

/* ================================ sliders (a partir da §TUNE) ================================
 * O esquema vem do `music.js` — caminho, range, step e rótulo. Não há aqui uma segunda tabela de
 * limites: a §TUNE existe precisamente para isso, e duplicá-la era garantir que divergiam. */
function buildKnobs(M) {
  const host = $('knobs');
  host.innerHTML = '';
  for (const [secId, sec] of Object.entries(M.tune.schema)) {
    const h = document.createElement('div');
    h.className = 'sec';
    h.textContent = sec.label;
    host.appendChild(h);
    for (const k of sec.knobs) {
      const def = M.tune.defaults[k.path];
      if (S.knobs[k.path] == null) S.knobs[k.path] = def;
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML =
        `<span class="nm" title="${k.path}">${k.label}</span>` +
        `<input type="range" min="${k.range[0]}" max="${k.range[1]}" step="${k.step}">` +
        `<span class="vl"></span><span class="df">${fmtKnob(def, k.step)}</span>`;
      const inp = row.querySelector('input'), vl = row.querySelector('.vl');
      inp.value = S.knobs[k.path];
      vl.textContent = fmtKnob(S.knobs[k.path], k.step);
      const paint = () => {
        vl.textContent = fmtKnob(S.knobs[k.path], k.step);
        row.classList.toggle('mod', Math.abs(S.knobs[k.path] - def) > 1e-9);
      };
      inp.addEventListener('input', () => {
        S.knobs[k.path] = +inp.value;
        paint();
        scheduleReprocess();
      });
      paint();
      host.appendChild(row);
      row._paint = paint; row._inp = inp; row._path = k.path;
    }
  }
  $('btn-reset').onclick = () => {
    for (const p of Object.keys(S.knobs)) S.knobs[p] = M.tune.defaults[p];
    for (const row of host.querySelectorAll('.row')) { row._inp.value = S.knobs[row._path]; row._paint(); }
    scheduleReprocess();
  };
}
function fmtKnob(v, step) {
  const d = step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;
  return (+v).toFixed(d);
}

/* Reconstrói o JSON aninhado dos knobs alterados — o mesmo formato que o `music-config.json` e
 * que o painel `k` grava. Só sai o que está FORA do default: um ficheiro com 25 linhas iguais ao
 * código não diz nada a quem o abrir daqui a um mês. */
function knobsToJson(M) {
  const cfg = {};
  let n = 0;
  for (const [p, v] of Object.entries(S.knobs)) {
    if (Math.abs(v - M.tune.defaults[p]) < 1e-9) continue;
    n++;
    const parts = p.split('.');
    let cur = cfg;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i], nextIsIndex = /^\d+$/.test(parts[i + 1]);
      if (cur[key] == null) cur[key] = nextIsIndex ? [] : {};
      cur = cur[key];
    }
    cur[parts[parts.length - 1]] = v;
  }
  return { json: JSON.stringify(cfg, null, 2), n };
}

/* Lê o `music-config.json` que a bola usa e oferece-o num botão. Só knobs do esquema §TUNE
 * entram (a mesma validação do motor: um valor fora do range é clamped, um `null` é recusado e
 * fica o default — o ficheiro do David tem um `rpmIdle:[null,0]` e é exatamente esse o caso). */
async function offerLiveConfig(M) {
  let j = null;
  try {
    const r = await fetch('music-config.json?t=' + Date.now(), { cache: 'no-store' });
    if (r.ok) j = await r.json();
  } catch (e) { /* não existir é o caso normal */ }
  if (!j || typeof j !== 'object') return;

  // achatamento igual ao do motor, mas só para os caminhos que o esquema conhece
  const flat = {};
  (function walk(o, pre) {
    for (const [k, v] of Object.entries(o || {})) {
      const p = pre ? `${pre}.${k}` : k;
      if (Array.isArray(v)) v.forEach((el, i) => { flat[`${p}.${i}`] = el; });
      else if (v && typeof v === 'object') walk(v, p);
      else flat[p] = v;
    }
  })(j, '');

  const diff = [];
  for (const [p, v] of Object.entries(flat)) {
    if (!(p in S.knobs)) continue;
    if (typeof v !== 'number' || !isFinite(v)) continue;   // o `null` do rpmIdle morre aqui
    if (Math.abs(v - M.tune.defaults[p]) > 1e-9) diff.push([p, v]);
  }
  if (!diff.length) return;

  const btn = document.createElement('button');
  btn.textContent = `Usar config da bola (${diff.length})`;
  btn.title = 'Carrega o music-config.json que a bola usa hoje, como ponto de partida.';
  btn.onclick = () => {
    for (const [p, v] of diff) S.knobs[p] = v;
    for (const row of document.querySelectorAll('#knobs .row')) { row._inp.value = S.knobs[row._path]; row._paint(); }
    scheduleReprocess();
    setStatus(`${diff.length} knobs do music-config.json aplicados`, false);
  };
  $('bar-cfg').appendChild(btn);
}

/* ================================ orquestração ================================ */
function scheduleReprocess() {
  clearTimeout(S.reprocessTimer);
  S.reprocessTimer = setTimeout(runAndDraw, LAB.reprocessDebounceMs);
}

function runAndDraw() {
  if (!S.rows.length) return;
  let res;
  try { res = reprocess(); } catch (e) { setStatus('erro: ' + e.message, true); console.error(e); return; }
  if (!res) return;
  S.series = res;
  draw(res);

  const A = res.A;
  const fluxSorted = Array.from(A.kickFluxRaw).sort((a, b) => a - b);
  const p95 = fluxSorted[Math.floor(fluxSorted.length * 0.95)] || 0;
  const med = fluxSorted[fluxSorted.length >> 1] || 0;

  $('stats').innerHTML =
    `<b>${res.kickTimes.length}</b> kicks em ${fmt(res.durS, 1)} s ` +
    `(<b>${fmt(res.kicksPerSec, 2)}</b>/s) · BPM dos kicks <b>${fmt(res.bpmFromKicks, 1)}</b> · ` +
    `BPM do motor <b>${fmt(res.bpmFinal, 1)}</b> · agudos ${res.hatTimes.length} · ` +
    `caminho <b>${res.path}</b> · flux p50 ${fmt(med, 2)} p95 ${fmt(p95, 2)} ` +
    `(p95/p50 = <b>${fmt(med > 0 ? p95 / med : NaN, 2)}</b>) · reprocessado em ${fmt(res.ms, 0)} ms`;

  if (res.path === 'fallback') {
    setStatus('FALLBACK: este ficheiro não traz subFluxRaw — os knobs do Detetor não mudam nada. ' +
              'Regravar com o sidecar novo (Mirrors-of-Emotions-Kill + Start, depois tools/cap.js).', true);
  } else {
    setStatus(`${S.fileName} · ${S.rows.length} frames`, false);
  }
}

function setStatus(msg, warn) {
  const el = $('status');
  el.textContent = msg;
  el.className = warn ? 'warn' : '';
}

function loadRows(rows, name) {
  if (!Array.isArray(rows) || !rows.length) { setStatus('ficheiro vazio ou não é um array', true); return; }
  if (rows.length > LAB.maxFrames) rows = rows.slice(0, LAB.maxFrames);
  if (rows[0].t == null) { setStatus('as linhas não têm campo `t` — não é um feat.json', true); return; }
  S.rows = rows;
  S.fileName = name;
  runAndDraw();
}

/* ================================ arranque ================================ */
(async () => {
  setStatus('a carregar core.js + music.js…', false);
  let M;
  try {
    await loadSources();
    // Uma instância "vazia" só para ler o esquema §TUNE e os defaults — não processa nada.
    const probe = makeEngine();
    M = probe.run(S.sources);
    if (!M || !M.tune) throw new Error('window.MUSIC.tune não apareceu');
  } catch (e) {
    setStatus('não consegui carregar o motor: ' + e.message +
              ' — esta página tem de ser SERVIDA (file:// bloqueia o fetch). Ver o README no topo.', true);
    return;
  }
  buildKnobs(M);
  // Se existe um `music-config.json` (o que o David gravou ao vivo com o painel `k`), oferece-o
  // como ponto de partida em vez de arrancar nos defaults do código. Não se aplica em silêncio:
  // afinar a partir de valores que não se sabe que estão lá é a receita para tirar conclusões
  // erradas. O sandbox tem o `fetch` desligado de propósito, por isso a leitura é feita AQUI.
  await offerLiveConfig(M);
  setStatus('motor carregado. Carrega um feat.json (ou usa a amostra).', false);

  $('file').addEventListener('change', (ev) => {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      try { loadRows(JSON.parse(fr.result), f.name); }
      catch (e) { setStatus('JSON inválido: ' + e.message, true); }
    };
    fr.readAsText(f);
  });

  $('btn-sample').onclick = async () => {
    setStatus('a carregar a amostra sintética…', false);
    try {
      const r = await fetch(LAB.sampleUrl, { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      loadRows(await r.json(), 'feat-sample.json (sintético, 128 BPM)');
    } catch (e) { setStatus('amostra indisponível: ' + e.message, true); }
  };

  // Trocar de escala é só REDESENHAR — não vale reprocessar 3000 frames para mudar um eixo.
  $('chk-log').addEventListener('change', () => { if (S.series) draw(S.series); });

  $('btn-copy').onclick = async () => {
    const { json, n } = knobsToJson(M);
    try { await navigator.clipboard.writeText(json); setStatus(`${n} knobs copiados para a área de transferência`, false); }
    catch (e) { $('out-json').style.display = 'block'; $('out-json').value = json; }
    $('out-json').style.display = 'block';
    $('out-json').value = json;
  };

  // ?feat=... carrega direto (útil para voltar ao mesmo ficheiro sem repetir o file picker)
  const q = new URLSearchParams(location.search).get('feat');
  if (q) {
    try {
      const r = await fetch(q, { cache: 'no-store' });
      if (r.ok) loadRows(await r.json(), q);
      else setStatus(`?feat=${q} → HTTP ${r.status}`, true);
    } catch (e) { setStatus(`?feat=${q} → ${e.message}`, true); }
  }

  addEventListener('resize', () => {
    for (const p of S.plots) p.setSize({ width: $('p-flux').clientWidth, height: p.height });
  });
})();
