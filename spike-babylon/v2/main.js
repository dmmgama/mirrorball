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

/* ---------------- auréola (halo) — Fase 4 ----------------
   Disco billboard na posição da bola, raio 2.6 (raios da bola), gradiente radial gerado UMA vez
   (1 a r=0.9 → 0 a r=2.6, 128 px) via `opacityTexture` procedural — index-v2.html:406-407.
   ALPHA_ADD, sem depth write, desenhado ATRÁS da bola (renderingGroupId 0, mas a bola desenha por
   cima porque a auréola nasce primeiro na lista — ver ordem de criação/`alphaIndex` abaixo). */
const HALO_R = 2.6;
function makeHaloTexture(scene) {
  const size = 128;
  const dt = new BABYLON.DynamicTexture('haloRamp', { width: size, height: size }, scene, false);
  const ctx = dt.getContext();
  const cx = size / 2, cy = size / 2;
  const g = ctx.createRadialGradient(cx, cy, (0.9 / HALO_R) * cx, cx, cy, cx);
  g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  dt.update();
  dt.hasAlpha = true;
  dt.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
  dt.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
  return dt;
}
const haloTex = makeHaloTexture(scene);
const haloMat = new BABYLON.StandardMaterial('haloMat', scene);
haloMat.disableLighting = true;
haloMat.emissiveColor = new BABYLON.Color3(1, 1, 1);
haloMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
haloMat.specularColor = new BABYLON.Color3(0, 0, 0);
haloMat.opacityTexture = haloTex;
haloMat.alphaMode = BABYLON.Engine.ALPHA_ADD;
haloMat.disableDepthWrite = true;
haloMat.backFaceCulling = false;
haloMat.needAlphaBlending = () => true;
const haloMesh = BABYLON.MeshBuilder.CreatePlane('halo', { size: HALO_R * 2 }, scene);
haloMesh.material = haloMat;
haloMesh.isPickable = false;
haloMesh.alwaysSelectAsActiveMesh = true;
haloMesh.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL; // encara sempre a câmara — mais robusto que lookAt manual
haloMesh.renderingGroupId = 0;
haloMesh.alphaIndex = -1; // desenha ANTES da bola dentro do mesmo grupo (menor alphaIndex primeiro)
function updateHalo(E) {
  const spotGainDefault = (() => {
    const mounted = ball && ball.mountedSpots;
    if (!mounted || !mounted.length) return 0;
    let sum = 0;
    for (let i = 0; i < mounted.length; i++) sum += num(mounted[i].I, 0);
    return sum / mounted.length;
  })();
  const spotGain = Number.isFinite(E.spotGain) ? E.spotGain : spotGainDefault;
  const dk = 1 - (Number.isFinite(E.skinMix) ? E.skinMix : 0);
  const haze = num(E.haze, CONFIG.haze);
  const a = 0.05 * num(CONFIG.halo, 0) * haze * spotGain * (0.35 + 0.65 * dk);
  haloMat.alpha = clamp01(a);
}
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

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

/* ---------------- pontos na parede: import dinâmico (Fase 4) ---------------- */
let dots = null;
try {
  const mod = await import('./dots.js');
  dots = mod.createDots(scene, CONFIG, ball);
  console.log('dots.js carregado.');
} catch (err) {
  console.error('dots.js falhou:', err);
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
const panelApi = initPanel(CONFIG, {
  onRebuildBall: () => { try { ball && ball.rebuild && ball.rebuild(); } catch (e) { console.error(e); } },
  onSpotsChanged: () => { rebuildSpotLights(); },
  onShadeChanged: () => { updateShadeLight(); },
  onBgGreyChanged: () => { applyBgGrey(); },
});
// bónus (§7 do brief F4): sliders re-lêem CONFIG quando escrito pela consola — `MB2.refreshPanel()`.
function refreshPanel() { if (panelApi && panelApi.refresh) panelApi.refresh(); }

/* ---------------- skin dark/white (Fase 4) ----------------
   Regra 1 (CLAUDE.md): NENHUM motor toca na skin — só tecla `w` / botão. `CONFIG.skin` ∈
   dark|white (sem 'auto' nesta fase — sem motor de música ainda, ver Fase 5). Crossfade
   `skinMix → target` com `1 − exp(−skinEase·dt)` (index-v2.html:331-333); `dk = 1 − skinMix`
   entra em halo/grão/vinheta/incidentAlpha. Fundo interpola bgGrey → rgb(243,247,249). */
// 'auto' (CONFIG.skin default) precisa do motor de música/emoções (Fase 5, ainda não existe aqui) —
// nesta fase trata-se como 'dark' (o mesmo fallback do `bgGrey` estático da Fase 1).
let skinMix = CONFIG.skin === 'white' ? 1 : 0;
function skinTargetVal() { return CONFIG.skin === 'white' ? 1 : 0; }
function updateSkin(dt) {
  const target = skinTargetVal();
  const ease = Math.max(0, num(CONFIG.skinEase, 7));
  skinMix += (target - skinMix) * (1 - Math.exp(-ease * dt));
  if (Math.abs(skinMix - target) < 0.0005) skinMix = target;
  return skinMix;
}

/* ---------------- pós-processo: DefaultRenderingPipeline (Fase 4) ----------------
   bloom (fonte = tiles quase brancos, bloomThreshold alto ~ gl>0.35), grão (reposicionado <3 Hz,
   nunca animado), vinheta — todos multiplicados por `dk` (só pesam em dark, index-v2.html §1.11).
   Tone-mapping como KNOB (pendente do handoff S7: centro saturado ao olhar de frente com vários
   feixes a somar) — ACES + exposição, para o David poder desligar/afinar sem recompilar. */
const pipe = new BABYLON.DefaultRenderingPipeline('mb2Pipe', true, scene, [camera]);
pipe.bloomEnabled = true;
pipe.bloomThreshold = num(CONFIG.bloomThreshold, 0.8);
pipe.bloomWeight = num(CONFIG.bloomStrength, 0.75);
pipe.bloomKernel = Math.max(1, num(CONFIG.bloomBlurPx, 9) * 2);
pipe.bloomScale = 0.5; // meia resolução — como a bola (:666)
pipe.grainEnabled = true;
pipe.grain.animated = false; // < 3 Hz (regra 6): reposiciona-se a semente a cada 400 ms, não por frame
pipe.imageProcessing.vignetteEnabled = true;
pipe.imageProcessing.vignetteWeight = 0; // escrito por frame (× dk)
pipe.imageProcessing.toneMappingEnabled = CONFIG.postTonemap !== 0;
pipe.imageProcessing.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
pipe.imageProcessing.exposure = num(CONFIG.postExposure, 1);

// grão: alpha calibrado a olho para parecer o pattern 256² da Canvas 2D (:691) — knob `grão` já
// controla a intensidade "crua"; K é só o fator de escala entre as duas implementações.
const GRAIN_K = 6;
function updatePostFx(dk) {
  pipe.bloomThreshold = clamp01(num(CONFIG.bloomThreshold, 0.8));
  pipe.bloomWeight = Math.max(0, num(CONFIG.bloomStrength, 0.75));
  pipe.bloomKernel = Math.max(1, num(CONFIG.bloomBlurPx, 9) * 2);
  pipe.grain.intensity = Math.max(0, num(CONFIG.grain, 0.032)) * dk * GRAIN_K;
  // `grain.animated = false` (regra 6: nada > 3 Hz) — a API pública do Babylon não expõe reseed do
  // ruído do GrainPostProcess sem tocar em internos não documentados; ficou como divergência
  // documentada em PARITY §1.11 (grão estático em vez de reposicionado a cada 400 ms).
  pipe.imageProcessing.vignetteWeight = Math.max(0, num(CONFIG.vignette, 0.55)) * dk * 15; // calibrado a olho (ver PARITY §1.11)
  pipe.imageProcessing.toneMappingEnabled = num(CONFIG.postTonemap, 1) >= 0.5;
  pipe.imageProcessing.exposure = Math.max(0.05, num(CONFIG.postExposure, 1));
  // skin white (item 6 do brief F4): aproximação do filtro `#tone` (LUT SVG de 33 valores,
  // index-v2.html:53-58, que crava as sombras a ~8% e levanta o meio-tom) via
  // `imageProcessing.contrast` — sobe com skinMix (1 − dk). Divergência documentada em PARITY §1.15:
  // não é a LUT exata (3 tabelas de 33 valores), é uma aproximação de contraste/exposição.
  pipe.imageProcessing.contrast = 1 + 0.6 * (1 - dk);
}
function applyBgGreySkin() {
  // chamada a cada frame (depois de updateSkin): sobrepõe o applyBgGrey estático (Fase 1) com o
  // crossfade dark→white — bgGrey (dark) → rgb(243,247,249) (white), index-v2.html:700.
  const g = clamp01(num(CONFIG.bgGrey, 7) / 255);
  const wr = 243 / 255, wg = 247 / 255, wb = 249 / 255;
  const r = g + (wr - g) * skinMix, gr = g + (wg - g) * skinMix, b = g + (wb - g) * skinMix;
  scene.clearColor = new BABYLON.Color4(r, gr, b, 1);
}
const skinBtn = document.getElementById('skin');
function syncSkinBtn() { if (skinBtn) skinBtn.textContent = 'skin: ' + (CONFIG.skin === 'white' ? 'white' : 'dark'); }
function setSkin(mode) {
  if (mode !== 'dark' && mode !== 'white') return;
  CONFIG.skin = mode;
  syncSkinBtn();
}
addEventListener('keydown', (e) => {
  if (e.key === 'w' || e.key === 'W') setSkin(CONFIG.skin === 'white' ? 'dark' : 'white');
});
if (skinBtn) { skinBtn.onclick = () => setSkin(CONFIG.skin === 'white' ? 'dark' : 'white'); syncSkinBtn(); }

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

/* ---------------- degradação adaptativa dos pontos na parede (§6) ----------------
   `frameEma = frameEma·0.9 + dt·0.1` sobre o custo REAL de scene.render() (o que `medianRenderMs()`
   já mede, via onAfterRenderObservable — não getDeltaTime). `> perf.targetMs` → dotDensityLive
   ×0.97 (piso perf.minDotDensity); senão recupera ×1.005 até CONFIG.dotDensity. Só os pontos na
   parede degradam — feixes/facetas/glint/bloom não têm degradação automática (regra do plano). */
let frameEma = 16, dotDensityLive = num(CONFIG.dotDensity, 0.8);

const E = { spotGain: 1, sphereOpacity: CONFIG.sphereOpacity, haze: CONFIG.haze, skinMix: 0 };
scene.registerBeforeRender(() => {
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  tSec += dt;
  E.sphereOpacity = CONFIG.sphereOpacity;
  E.haze = CONFIG.haze;

  // skin dark/white primeiro (Regra 1: só tecla/botão mexem em CONFIG.skin; isto só lê e faz o crossfade)
  const sk = updateSkin(dt);
  E.skinMix = sk;
  const dk = 1 - sk;
  applyBgGreySkin();

  // degradação adaptativa: usa a mediana das últimas amostras de render (já calculada abaixo);
  // frameEma segue o dt em ms para reagir ao vivo, como no original (index-v2.html:326-329)
  const dtMs = dt * 1000;
  frameEma = frameEma * 0.9 + dtMs * 0.1;
  const perf = CONFIG.perf || { targetMs: 17.5, minDotDensity: 0.12 };
  const targetMs = num(perf.targetMs, 17.5), minDotDensity = num(perf.minDotDensity, 0.12);
  const dotDensityTarget = Math.max(0, num(CONFIG.dotDensity, 0.8));
  if (frameEma > targetMs) dotDensityLive = Math.max(minDotDensity, dotDensityLive * 0.97);
  else if (dotDensityLive < dotDensityTarget) dotDensityLive = Math.min(dotDensityTarget, dotDensityLive * 1.005);
  if (ball) ball.dotDensityLive = dotDensityLive;

  // ball.update primeiro: monta mountedSpots/ambientPoses deste frame (fonte única de verdade),
  // as SpotLight/RectAreaLight lêem-nos a seguir, no MESMO frame.
  if (ball && ball.update) {
    try { ball.update(tSec, CONFIG.spots, E); }
    catch (e) { console.error('ball.update:', e); }
  }
  updateSpotLights();
  updateAmbientLights(tSec);
  // feixes/cone incidente/pontos depois das SpotLight: leem ball.mountedSpots (montado em
  // ball.update acima), fonte única de verdade para posição/intensidade dos focos deste frame.
  if (beams && beams.update) {
    try { beams.update(E); }
    catch (e) { console.error('beams.update:', e); }
  }
  if (incident && incident.update) {
    try { incident.update(ball && ball.mountedSpots, E, camera); }
    catch (e) { console.error('incident.update:', e); }
  }
  if (dots && dots.update) {
    try { dots.update(E); }
    catch (e) { console.error('dots.update:', e); }
  }
  updateHalo(E);
  updatePostFx(dk);
});

function medianRenderMs() {
  if (!samples.length) return 0;
  const s = samples.slice().sort((a, b) => a - b);
  return s[s.length >> 1];
}

// ball.dots = { count, X, N, R, I, size } (F4) — HUD 'dots N · dens X.XX'; 0 se dots.js/ball.dots
// ainda não existem.
function dotCount() {
  const d = ball && ball.dots;
  return (d && Number.isFinite(d.count)) ? d.count : 0;
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
    `dots ${dotCount()}  ·  dens ${dotDensityLive.toFixed(2)}  ·  skin ${CONFIG.skin}\n` +
    `[d] painel  ·  [w] skin  ·  [0] repor câmara  ·  rato: orbitar/zoom`;
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
  /* Skin dark/white (Fase 4, Regra 1: só tecla `w`/botão/API — nenhum motor lhe toca). */
  setSkin,
  get skinMix() { return skinMix; },
  /* Bónus §7 do brief F4: sliders re-lêem CONFIG quando este é escrito pela consola. */
  refreshPanel,
};

console.log('MB2 pronto —', engine.isWebGPU ? 'WebGPU' : 'WebGL2');
