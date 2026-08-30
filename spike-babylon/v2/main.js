// v2/main.js — esqueleto do spike v2 (Fase 1): engine, sala, câmara, luzes mínimas, loop/HUD, painel `d`.
// A malha da bola é responsabilidade do Opus (v2/ball.js); aqui só se importa dinamicamente com stub de recurso.
import { buildRoom } from './room.js';
import { initPanel } from './panel.js';

const CONFIG = window.CONFIG;
const canvas = document.getElementById('rc');
const hud = document.getElementById('hud');
const D2R = Math.PI / 180;

const qs = new URLSearchParams(location.search);
const forceWebGL = qs.get('webgl') === '1';

/* ---------------- engine: WebGPU quando existe, WebGL2 como recurso ----------------
   ?webgl=1 força WebGL2 — o WebGPU initAsync() pendura com o tab em segundo plano
   (Chrome em automação para screenshots), ver docs/babylon-reference.md §1 e §9. */
async function makeEngine() {
  if (!forceWebGL && navigator.gpu && BABYLON.WebGPUEngine) {
    try {
      const e = new BABYLON.WebGPUEngine(canvas, { antialias: true, stencil: true });
      await e.initAsync();
      return e;
    } catch (err) { console.warn('WebGPU falhou, a usar WebGL2:', err); }
  }
  return new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true }, true);
}

const engine = await makeEngine();
const scene = new BABYLON.Scene(engine);

function applyBgGrey() {
  const g = CONFIG.bgGrey / 255;
  scene.clearColor = new BABYLON.Color4(g, g, g, 1);
}
applyBgGrey();

/* ---------------- câmara ----------------
   ArcRotateCamera; pose inicial em (0,0,+camDistance) a olhar a origem (az=0 = câmara,
   como no CONFIG). alpha=-PI/2 coloca a câmara no eixo +Z olhando para a origem (mesma
   convenção do spike v1). fov calculado para a bola (raio 1) ocupar ballSizeVH da altura
   do viewport: diâmetro angular da bola = 2*asin(raio/camDistance); queremos que isso
   seja ballSizeVH da FOV vertical total. */
const ALPHA0 = Math.PI / 2; // ArcRotateCamera: x=r·cos(alpha)·sin(beta), z=r·sin(alpha)·sin(beta) → alpha=PI/2, beta=PI/2 dá posição (0,0,+radius)
const BETA0 = Math.PI / 2;
function computeFov() {
  const ang = 2 * Math.asin(Math.min(1, 1 / CONFIG.camDistance));
  return ang / CONFIG.ballSizeVH;
}
const camera = new BABYLON.ArcRotateCamera('cam', ALPHA0, BETA0, CONFIG.camDistance, BABYLON.Vector3.Zero(), scene);
camera.attachControl(canvas, true);
camera.wheelPrecision = 40;
camera.lowerRadiusLimit = 2.5;
camera.upperRadiusLimit = 20;
camera.fov = computeFov();
camera.fovMode = BABYLON.Camera.FOVMODE_VERTICAL_FIXED;

function resetCameraPose() {
  camera.alpha = ALPHA0;
  camera.beta = BETA0;
  camera.radius = CONFIG.camDistance;
  camera.fov = computeFov();
}
addEventListener('keydown', (e) => { if (e.key === '0') resetCameraPose(); });

/* ---------------- sala implícita: 5 planos ---------------- */
const room = buildRoom(scene, CONFIG);

/* ---------------- luzes mínimas ----------------
   Para i < spotCount: SpotLight na posição dirFromAzEl(az,el)·spotDist, apontada ao centro.
   HemisphericLight de `shade` (key·0.25) — luz geral barata da sala/volume da bola. */
function dirFromAzEl(azDeg, elDeg) {
  // az=0 é a direção da câmara (+Z); az cresce para a direita (como na Canvas 2D).
  const az = azDeg * D2R, el = elDeg * D2R;
  const cosEl = Math.cos(el);
  return new BABYLON.Vector3(Math.sin(az) * cosEl, Math.sin(el), Math.cos(az) * cosEl);
}

/* Focos: até 6 SpotLight PRÉ-CRIADAS (CONFIG.spots.length), nunca destruídas/recriadas por frame —
   só (des)ligadas com setEnabled. Posição/direção/intensidade vêm de ball.mountedSpots[i] quando o
   Opus o expuser (fonte única de verdade: S·spotDist a olhar C, I já com fade/choreo/spotFadeMix
   aplicados); enquanto não existir, cai no fallback local (dirFromAzEl, sem fade — Fase 1). */
const MAX_SPOTS = CONFIG.spots.length;
const spotLights = [];
for (let i = 0; i < MAX_SPOTS; i++) {
  const sp = CONFIG.spots[i];
  const dir = dirFromAzEl(sp.az, sp.el);
  const pos = dir.scale(CONFIG.spotDist);
  const toCenter = BABYLON.Vector3.Zero().subtract(pos).normalize();
  const angle = 2 * Math.atan((sp.radius * CONFIG.spotRadiusMul) / CONFIG.spotDist) * 2.2;
  const light = new BABYLON.SpotLight('spot' + i, pos, toCenter, angle, 12, scene);
  light.intensity = CONFIG.spotLightIntensity * sp.intensity;
  light.radius = 0.02;
  light.diffuse = new BABYLON.Color3(1, 1, 1);
  light.specular = new BABYLON.Color3(1, 1, 1);
  spotLights.push(light);
}

function spotColor(sp) {
  if (!CONFIG.spotColorOn) return WHITE;
  // matiz por foco (0-360) + saturação global — HSV→RGB com V=1
  const h = ((num(sp.hue, 0) % 360) + 360) % 360 / 60, sat = Math.min(1, Math.max(0, num(CONFIG.spotSat, 1)));
  const c = sat, x = c * (1 - Math.abs((h % 2) - 1)), m = 1 - c;
  let r = 0, g = 0, b = 0;
  if (h < 1) { r = c; g = x; } else if (h < 2) { r = x; g = c; } else if (h < 3) { g = c; b = x; }
  else if (h < 4) { g = x; b = c; } else if (h < 5) { r = x; b = c; } else { r = c; b = x; }
  return new BABYLON.Color3(r + m, g + m, b + m);
}
function num(v, d) { return Number.isFinite(v) ? v : d; }
const WHITE = new BABYLON.Color3(1, 1, 1);

let activeSpotCount = 0;
function updateSpotLights() {
  const mounted = ball && ball.mountedSpots; // [{S,H,C,r,I,az,el}] — o Opus é a fonte de verdade quando existir
  const n = MAX_SPOTS;
  let active = 0;
  for (let i = 0; i < n; i++) {
    const sp = CONFIG.spots[i];
    const light = spotLights[i];
    const m = mounted && mounted[i];
    let S, I;
    if (m && m.S) {
      S = new BABYLON.Vector3(m.S[0], m.S[1], m.S[2]);
      I = num(m.I, 0);
    } else {
      // fallback (ball.mountedSpots ainda não existe): sem fade/choreo, só az/el/intensity estáticos
      S = dirFromAzEl(sp.az, sp.el);
      I = num(sp.intensity, 0);
    }
    const pos = S.scale(CONFIG.spotDist);
    light.position.copyFrom(pos);
    light.direction = BABYLON.Vector3.Zero().subtract(pos).normalize();
    light.angle = 2 * Math.atan((sp.radius * CONFIG.spotRadiusMul) / CONFIG.spotDist) * 2.2;
    light.intensity = CONFIG.spotLightIntensity * I;
    const col = spotColor(sp);
    light.diffuse = col;
    light.specular = col;
    const on = sp.on !== false;
    const enabled = i < CONFIG.spotCount && on && I >= 0.02;
    light.setEnabled(enabled);
    if (enabled) active++;
  }
  activeSpotCount = active;
}

function rebuildSpotLights() { updateSpotLights(); } // mantido por compat: knobs chamam onSpotsChanged() → isto

const shadeDir = dirFromAzEl(CONFIG.shade.az, CONFIG.shade.el).scale(-1);
const hemi = new BABYLON.HemisphericLight('shade', shadeDir, scene);
hemi.intensity = CONFIG.shade.key * 0.25;
hemi.diffuse = new BABYLON.Color3(1, 1, 1);
hemi.groundColor = new BABYLON.Color3(1, 1, 1);
function updateShadeLight() {
  hemi.direction = dirFromAzEl(CONFIG.shade.az, CONFIG.shade.el).scale(-1);
  hemi.intensity = CONFIG.shade.key * 0.25;
}

/* ---------------- luz indireta: 3 RectAreaLight (ambient.n) ----------------
   Posicionadas em dirFromAzEl(az,el)·(spotDist+1), viradas para a bola, largura/altura
   de areaDeg (2·dist·tan(areaDeg·D2R)), intensity = I·ambientLightMul (escala própria da RectAreaLight).
   Deambulam como :387 (fallback) ou seguem ball.ambientPoses quando o Opus o expuser. */
const MAX_AMBIENT = 3;
const ambientLights = [];
for (let i = 0; i < MAX_AMBIENT; i++) {
  const dist = CONFIG.spotDist + 1;
  const areaSize = 2 * dist * Math.tan(CONFIG.ambient.areaDeg * D2R);
  const L = new BABYLON.RectAreaLight('ambient' + i, new BABYLON.Vector3(0, 0, dist), areaSize, areaSize, scene);
  L.intensity = 0;
  L.diffuse = new BABYLON.Color3(1, 1, 1);
  L.specular = new BABYLON.Color3(1, 1, 1);
  ambientLights.push(L);
}

function ambientPoseFallback(i, tSec) {
  // verbatim de index-v2.html:387 (sem o hash por tile, que fica no CPU do Opus)
  const A = CONFIG.ambient;
  const w = A.drift * (0.7 + 0.3 * i);
  const az = 140 * Math.sin(w * tSec + i * 2.4);
  const el = 25 + 35 * Math.sin(w * 0.61 * tSec + i * 1.3);
  return { az, el, I: A.intensity };
}

let activeAmbientCount = 0;
function updateAmbientLights(tSec) {
  const poses = ball && ball.ambientPoses; // [{az,el,I}] — fonte única de verdade quando existir
  const n = Math.max(0, Math.min(CONFIG.ambient.n | 0, MAX_AMBIENT));
  const dist = CONFIG.spotDist + 1;
  const areaSize = 2 * dist * Math.tan(CONFIG.ambient.areaDeg * D2R);
  let active = 0;
  for (let i = 0; i < MAX_AMBIENT; i++) {
    const L = ambientLights[i];
    if (i >= n) { L.setEnabled(false); continue; }
    const p = (poses && poses[i]) || ambientPoseFallback(i, tSec);
    const dir = dirFromAzEl(p.az, p.el);
    const pos = dir.scale(dist);
    L.position.copyFrom(pos);
    L.direction = BABYLON.Vector3.Zero().subtract(pos).normalize();
    if (Number.isFinite(areaSize) && areaSize > 0) { L.width = areaSize; L.height = areaSize; }
    const I = num(p.I, 0);
    // RectAreaLight tem escala própria (~0.1-2 lê como indireta); NÃO multiplicar por spotLightIntensity (lavava a cena a branco)
    L.intensity = I * CONFIG.ambientLightMul;
    L.setEnabled(true);
    active++;
  }
  activeAmbientCount = active;
}

/* ---------------- bola: import dinâmico de ./ball.js (API do Opus) ----------------
   createBall(scene, CONFIG) -> { mesh, rebuild(), update(tSec, spots, E), tiles }
   Se ainda não existir (ou falhar), stub = esfera simples, só para se poder testar o resto. */
let ball = null;
try {
  const mod = await import('./ball.js');
  ball = mod.createBall(scene, CONFIG);
  console.log('ball.js carregado —', ball && ball.tiles, 'tiles');
  if (ball.attachProbe) ball.attachProbe(room.planes); // sala refletida nos espelhos (ONCE)
} catch (err) {
  console.warn('ball.js indisponível, a usar stub (esfera simples):', err);
  const stubMat = new BABYLON.PBRMaterial('stubMat', scene);
  stubMat.albedoColor = new BABYLON.Color3(0.5, 0.5, 0.5);
  stubMat.metallic = CONFIG.mirrorMetallic;
  stubMat.roughness = CONFIG.mirrorRoughness;
  const mesh = BABYLON.MeshBuilder.CreateSphere('ballStub', { diameter: 2, segments: 32 }, scene);
  mesh.material = stubMat;
  ball = {
    mesh,
    rebuild() { /* stub: nada para reconstruir */ },
    update(tSec) { mesh.rotation.y = tSec * CONFIG.rotationRpm * 2 * Math.PI / 60; },
    tiles: 0,
  };
}
window.__MB2_ball = ball; // para o painel chamar rebuild() sem import circular

/* ---------------- feixes refletidos + cone incidente: import dinâmico (API do Opus/Sonnet) ----------------
   beams.js pode ainda não existir (Opus em paralelo) — tolera com try/catch, tal como o ball.js. */
let beams = null;
try {
  const mod = await import('./beams.js');
  beams = mod.createBeams(scene, CONFIG, ball);
  console.log('beams.js carregado.');
} catch (err) {
  console.warn('beams.js indisponível ainda (Opus em paralelo):', err);
}

let incident = null;
try {
  const mod = await import('./incident.js');
  incident = mod.createIncident(scene, CONFIG);
  console.log('incident.js carregado.');
} catch (err) {
  console.error('incident.js falhou:', err);
}

// ball.tiles pode ser uma contagem (stub) ou o array de tiles (API do Opus) — normaliza para a contagem.
function tileCount() {
  const t = ball && ball.tiles;
  if (Array.isArray(t)) return t.length;
  return t || 0;
}

// ball.beams = { count, P, R, I } (API do Opus) — HUD 'feixes N'; 0 se beams.js/ball.beams ainda não existem.
function beamCount() {
  const b = ball && ball.beams;
  return (b && Number.isFinite(b.count)) ? b.count : 0;
}

/* ---------------- painel `d` ---------------- */
initPanel(CONFIG, {
  onRebuildBall: () => { try { ball && ball.rebuild && ball.rebuild(); } catch (e) { console.error(e); } },
  onSpotsChanged: () => { rebuildSpotLights(); },
  onShadeChanged: () => { updateShadeLight(); },
  onBgGreyChanged: () => { applyBgGrey(); },
});

/* ---------------- loop, tempo, HUD ----------------
   getDeltaTime() mente com o tab em segundo plano (docs/babylon-reference.md §9) — mede-se o
   custo REAL de scene.render() via onBeforeRenderObservable/onAfterRenderObservable. */
const samples = [];
let renderT0 = 0;
let tSec = 0;
let lastFrame = performance.now();
scene.onBeforeRenderObservable.add(() => { renderT0 = performance.now(); });
scene.onAfterRenderObservable.add(() => {
  samples.push(performance.now() - renderT0);
  if (samples.length > 60) samples.shift();
});

const E = { spotGain: 1, sphereOpacity: CONFIG.sphereOpacity, haze: CONFIG.haze };
scene.registerBeforeRender(() => {
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  tSec += dt;
  E.sphereOpacity = CONFIG.sphereOpacity;
  E.haze = CONFIG.haze;
  // ball.update primeiro: monta mountedSpots/ambientPoses deste frame (fonte única de verdade),
  // as SpotLight/RectAreaLight lêem-nos a seguir, no MESMO frame.
  if (ball && ball.update) {
    try { ball.update(tSec, CONFIG.spots, E); }
    catch (e) { console.error('ball.update:', e); }
  }
  updateSpotLights();
  updateAmbientLights(tSec);
  // feixes/cone incidente depois das SpotLight: leem ball.mountedSpots (montado em ball.update acima),
  // fonte única de verdade para posição/intensidade dos focos deste frame.
  if (beams && beams.update) {
    try { beams.update(E); }
    catch (e) { console.error('beams.update:', e); }
  }
  if (incident && incident.update) {
    try { incident.update(ball && ball.mountedSpots, E, camera); }
    catch (e) { console.error('incident.update:', e); }
  }
});

function medianRenderMs() {
  if (!samples.length) return 0;
  const s = samples.slice().sort((a, b) => a - b);
  return s[s.length >> 1];
}

let lastHud = performance.now();
scene.registerAfterRender(() => {
  const now = performance.now();
  if (now - lastHud < 500) return;
  lastHud = now;
  const med = medianRenderMs();
  hud.textContent =
    `MirrorBall v2 (spike Babylon)  ·  ${engine.isWebGPU ? 'WebGPU' : 'WebGL2'}\n` +
    `render ${med.toFixed(2)} ms  (teto ${med > 0 ? (1000 / med).toFixed(0) : '—'} fps)\n` +
    `facetas ${tileCount()}  ·  filas ${CONFIG.facetRows}\n` +
    `spots ${activeSpotCount}/${CONFIG.spotCount}  ·  ambient ${activeAmbientCount}/${CONFIG.ambient.n}  ·  feixes ${beamCount()}\n` +
    `[d] painel  ·  [0] repor câmara  ·  rato: orbitar/zoom`;
});

engine.runRenderLoop(() => scene.render());
addEventListener('resize', () => engine.resize());

/* ---------------- API exposta (orquestrador/screenshot) ---------------- */
window.MB2 = {
  scene, engine, camera, cfg: CONFIG, get ball() { return ball; },
  __perf: () => {
    const s = samples.slice().sort((a, b) => a - b);
    return { medianRenderMs: s.length ? s[s.length >> 1] : 0, n: s.length, tiles: tileCount() };
  },
};

console.log('MB2 pronto —', engine.isWebGPU ? 'WebGPU' : 'WebGL2');
