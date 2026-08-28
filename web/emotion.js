/* emotion.js v2 — webcam → expressões → valência/arousal → parâmetros da bola (virtual e real)
 *
 * Baseado no report "2026.08.27-MirrorBall-Emocoes-Research.md" (Russell 1980; Valdez & Mehrabian 1994;
 * convenções de lighting design; pipeline de sinal para classificadores que não saturam):
 *
 *   7 probabilidades face-api
 *     → agregação VA (tabela de coordenadas circumplexas)
 *     → normalização adaptativa por sessão (máximos deslizantes com decaimento lento)
 *     → curva de contraste smoothstep (empurra para os polos, mata o ruído no centro)
 *     → alvos por variável (âncoras: polo triste · base neutra · polo feliz / calmo · excitado)
 *     → suavização assimétrica por variável (attack rápido, release lento, τ ∝ inércia física)
 *     → bola virtual (CONFIG) + skin auto + hardware (bridge.js)
 *
 * Resultado: um sorriso claro chega a "tudo white / energia máxima"; uma cara triste chega a
 * "tudo dark / bola fantasma / lenta"; neutro descansa num estado-base explícito. Nada > 3 Hz.
 */
'use strict';
(() => {
const EMO = {
  detectEveryMs: 100,
  holdSec: 2.0,             // sem cara: mantém o último alvo este tempo, depois vai para a base
  modelsUrl: 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights',

  // A.2 — coordenadas circumplexas (valência, arousal) por expressão
  va: { happy: [0.85, 0.55], sad: [-0.75, -0.45], angry: [-0.65, 0.75], fearful: [-0.70, 0.70],
        disgusted: [-0.75, 0.25], surprised: [0.15, 0.85], neutral: [0, 0] },

  // C.2.2 — normalização adaptativa: escala = máximo |V| / A visto na sessão, com piso e decaimento
  adapt: { floorV: 0.35, floorA: 0.35, decayPerSec: 0.004, rise: 0.15 },
  // C.2.3 — contraste: expoente do smoothstep composto (1 = smoothstep simples; 2 = mais duro)
  contrast: 1.4,
  // 0..1: quanto da normalização adaptativa se usa (0 = escala fixa, 1 = totalmente relativa à sessão)
  adaptMix: 0.7,

  // B — âncoras por variável. V-driven: [polo triste, base, polo feliz]; A-driven: [calmo, base, excitado]
  tone:     { by: 'V', k: [0.00, 0.22, 1.00] },   // skin: 0 dark · 1 white (neutro pende para o clube)
  opacity:  { by: 'V', k: [0.25, 0.80, 1.00] },   // sphereOpacity: fantasma ↔ sólida
  rpm:      { by: 'A', k: [0.55, 1.20, 2.90] },
  beams:    { by: 'A', k: [8,    24,   56  ] },
  beamInt:  { by: 'A', k: [0.06, 0.13, 0.18] },   // ≤ 0.18 (brief)
  haze:     { by: 'A', k: [0.20, 0.40, 0.85], vBias: -0.15 }, // valência negativa = mais fumo (caos)
  spot:     { by: 'A', k: [0.40, 0.80, 1.35], vBias: 0.15 },

  // C.2.6 — constantes de tempo (s): attack (a subir em energia/valência) e release (a descer)
  tau: { spot: [0.15, 0.8], beamInt: [0.15, 0.8], beams: [0.3, 1.5], tone: [0.5, 3.0],
         rpm: [0.8, 4.0], opacity: [0.6, 3.5], haze: [1.0, 5.0], V: [0.25, 1.2], A: [0.2, 1.0] },
};

const state = {
  ready: false, faceSeen: 0, raw: null,
  Vraw: 0, Araw: 0, scaleV: EMO.adapt.floorV, scaleA: EMO.adapt.floorA,
  V: 0, A: 0,                     // eixos suavizados (−1..1 / 0..1), já com contraste
  out: { tone: EMO.tone.k[1], opacity: EMO.opacity.k[1], rpm: EMO.rpm.k[1], beams: EMO.beams.k[1],
         beamInt: EMO.beamInt.k[1], haze: EMO.haze.k[1], spot: EMO.spot.k[1] },
  target: {},
};

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
function contrast(x) { let y = Math.abs(x); for (let i = 0; i < EMO.contrast; i++) y = smooth(y); if (EMO.contrast % 1) y = lerp(y, smooth(y), EMO.contrast % 1); return Math.sign(x) * y; }
function anchor(k, t) { return t >= 0 ? lerp(k[1], k[2], t) : lerp(k[1], k[0], -t); }
function ease(cur, tgt, tau, dt) { const t = tgt > cur ? tau[0] : tau[1]; return cur + (tgt - cur) * (1 - Math.exp(-dt / t)); }

/* ---------- câmara + modelos ---------- */
async function startCamera() {
  const video = document.getElementById('cam');
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' }, audio: false });
  video.srcObject = stream; await video.play();
  await Promise.all([faceapi.nets.tinyFaceDetector.loadFromUri(EMO.modelsUrl), faceapi.nets.faceExpressionNet.loadFromUri(EMO.modelsUrl)]);
  state.ready = true; detectLoop(video);
}
async function detectLoop(video) {
  const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 });
  for (;;) {
    const t0 = performance.now();
    try {
      const r = await faceapi.detectSingleFace(video, opts).withFaceExpressions();
      if (r) { state.raw = r.expressions; state.faceSeen = performance.now(); ingest(r.expressions); }
    } catch (e) { console.warn('[emotion] detect', e); }
    await new Promise(res => setTimeout(res, Math.max(0, EMO.detectEveryMs - (performance.now() - t0))));
  }
}

/* ---------- 1. agregação VA + 2. escala adaptativa (por deteção, 10 Hz) ---------- */
function ingest(e) {
  let V = 0, A = 0;
  for (const n in EMO.va) { const p = e[n] || 0; V += p * EMO.va[n][0]; A += p * EMO.va[n][1]; }
  state.Vraw = V; state.Araw = Math.max(0, A);
  const ad = EMO.adapt, dt = EMO.detectEveryMs / 1000;
  // o máximo da sessão sobe depressa e decai devagar → quem sorri pouco também chega ao polo
  state.scaleV = Math.max(ad.floorV, Math.abs(V) > state.scaleV ? lerp(state.scaleV, Math.abs(V), ad.rise) : state.scaleV * (1 - ad.decayPerSec * dt));
  state.scaleA = Math.max(ad.floorA, state.Araw > state.scaleA ? lerp(state.scaleA, state.Araw, ad.rise) : state.scaleA * (1 - ad.decayPerSec * dt));
}

/* ---------- 3–5. contraste, alvos, suavização (por frame) ---------- */
let lastT = performance.now();
function update(now) {
  const dt = clamp((now - lastT) / 1000, 0, 0.1); lastT = now;
  const hasFace = state.raw && (now - state.faceSeen) / 1000 < EMO.holdSec;
  let Vt = 0, At = 0;
  if (hasFace) {
    const sV = lerp(1, state.scaleV, EMO.adaptMix), sA = lerp(1, state.scaleA, EMO.adaptMix);
    Vt = contrast(clamp(state.Vraw / sV, -1, 1));
    At = contrast(clamp(state.Araw / sA, 0, 1));
  }
  state.V = ease(state.V, Vt, EMO.tau.V, dt);
  state.A = ease(state.A, At, EMO.tau.A, dt);

  const V = state.V, A = state.A;
  // energia: arousal 0 = base neutra; arousal alto = polo excitado; só a valência negativa
  // com pouco arousal (tristeza) puxa abaixo da base, para o polo calmo/apagado
  const energy = clamp(A + Math.min(0, V) * 0.8 * (1 - A), -1, 1);
  const T = state.target;
  T.tone    = anchor(EMO.tone.k, V);
  T.opacity = anchor(EMO.opacity.k, V);
  T.rpm     = anchor(EMO.rpm.k, energy);
  T.beams   = anchor(EMO.beams.k, energy);
  T.beamInt = anchor(EMO.beamInt.k, energy);
  T.haze    = clamp(anchor(EMO.haze.k, energy) + EMO.haze.vBias * V, 0.05, 1);
  T.spot    = clamp(anchor(EMO.spot.k, energy) + EMO.spot.vBias * V, 0.1, 1.6);

  const o = state.out;
  for (const k in o) o[k] = ease(o[k], T[k], EMO.tau[k], dt);
  applyToBall(o);
  if (window.BRIDGE) window.BRIDGE.send({ rpm: o.rpm, spotGain: o.spot, haze: o.haze, valence: V, arousal: state.A, health: o.opacity });
  updateHud(o);
}

function applyToBall(o) {
  const MB = window.MIRRORBALL; if (!MB) return;
  const C = MB.config;
  C.rotationRpm = o.rpm; C.haze = o.haze; C.beamMaxCount = Math.round(o.beams);
  C.beamIntensity = o.beamInt; C.sphereOpacity = o.opacity;
  if (MB.getHealth() !== 1) MB.setHealth(1);   // v2 controla as variáveis diretamente
  if (MB.setSkinAuto) MB.setSkinAuto(o.tone);
  C.spots.forEach((s, i) => { if (s._base == null) s._base = s.intensity; MB.setSpot(i, { intensity: clamp(s._base * o.spot, 0, 1.6) }); });
}

/* ---------- HUD (tecla e) ---------- */
const hud = document.getElementById('emo');
function updateHud(o) {
  if (!hud.classList.contains('on')) return;
  const e = state.raw || {}, bar = (v, n = 12) => '█'.repeat(Math.round(clamp(v, 0, 1) * n)).padEnd(n, '·');
  const face = state.raw && (performance.now() - state.faceSeen) / 1000 < EMO.holdSec;
  hud.textContent =
    `cara ${face ? 'sim' : 'não'}   ${state.ready ? '' : '(a carregar modelos…)'}\n` +
    ['happy', 'sad', 'angry', 'surprised', 'fearful', 'disgusted', 'neutral'].map(n => `${n.padEnd(9)} ${bar(e[n] || 0)}`).join('\n') +
    `\n\nV ${state.V.toFixed(2).padStart(5)} (raw ${state.Vraw.toFixed(2)} /${state.scaleV.toFixed(2)})   A ${state.A.toFixed(2)} (raw ${state.Araw.toFixed(2)} /${state.scaleA.toFixed(2)})` +
    `\ntone ${o.tone.toFixed(2)}  opac ${o.opacity.toFixed(2)}  rpm ${o.rpm.toFixed(2)}  beams ${Math.round(o.beams)}  bInt ${o.beamInt.toFixed(2)}  haze ${o.haze.toFixed(2)}  spot ${o.spot.toFixed(2)}` +
    `\nskin ${window.MIRRORBALL && window.MIRRORBALL.getSkin ? (m => `${m.mode} mix ${m.mix.toFixed(2)}`)(window.MIRRORBALL.getSkin()) : '—'}` +
    `\nhardware: ${window.BRIDGE ? window.BRIDGE.status() : '—'}`;
}
addEventListener('keydown', ev => { if (ev.key === 'e' || ev.key === 'E') hud.classList.toggle('on'); });

/* ---------- arranque ---------- */
(function loop(now) { update(now); requestAnimationFrame(loop); })(performance.now());
document.getElementById('start').addEventListener('click', async function () {
  this.disabled = true; this.textContent = 'a ligar câmara…';
  try { await startCamera(); this.remove(); hud.classList.add('on'); }
  catch (e) { this.textContent = 'câmara falhou: ' + e.message; console.error(e); }
});
// simulação sem câmara (consola): EMOTION.fake({happy:0.7, neutral:0.3})
window.EMOTION = { state, config: EMO, fake(e) { state.raw = e; state.faceSeen = performance.now(); ingest(e); } };
})();
