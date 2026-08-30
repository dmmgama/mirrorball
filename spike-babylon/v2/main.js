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
/* F5: os FLASHES da coreografia também entram em `ball.mountedSpots` (a seguir aos focos), por isso
   o pool tem de cobrir `spots.length + flashSlots + 2` — as luzes extra ficam pré-criadas e
   desligadas (`setEnabled(false)`); NUNCA se criam/destroem luzes por frame (recompilava shaders). */
const N_SPOT_SLOTS = CONFIG.spots.length;
const N_FLASH_SLOTS = Math.max(0, Math.round(num((CONFIG.choreo || {}).flashSlots, 4))) + 2;
const MAX_SPOTS = N_SPOT_SLOTS + N_FLASH_SLOTS;
const spotLights = [];
for (let i = 0; i < MAX_SPOTS; i++) {
  const sp = CONFIG.spots[i] || { az: 0, el: 0, radius: 0.15, intensity: 0 };
  const dir = dirFromAzEl(sp.az, sp.el);
  const pos = dir.scale(CONFIG.spotDist);
  const toCenter = BABYLON.Vector3.Zero().subtract(pos).normalize();
  const angle = 2 * Math.atan((sp.radius * CONFIG.spotRadiusMul) / CONFIG.spotDist) * 2.2;
  const light = new BABYLON.SpotLight('spot' + i, pos, toCenter, angle, 12, scene);
  light.intensity = CONFIG.spotLightIntensity * num(sp.intensity, 0);
  light.radius = 0.02;
  light.diffuse = new BABYLON.Color3(1, 1, 1);
  light.specular = new BABYLON.Color3(1, 1, 1);
  if (i >= N_SPOT_SLOTS) light.setEnabled(false);
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

let activeSpotCount = 0, activeFlashCount = 0;
function updateSpotLights() {
  /* `ball.mountedSpots` (F2) é a fonte única de verdade: já traz os focos com fade/spotFadeMix/
     spotGain/spotsOn/spotCount aplicados e, desde a F5, os FLASHES da coreografia a seguir a eles
     (`isFlash: true`, raio já sem `spotRadiusMul`). Percorre-se `mountedSpots` (não `CONFIG.spots`),
     porque a lista já vem filtrada — o índice do array NÃO é o índice do `CONFIG.spots`. Os slots
     do pool que sobram ficam `setEnabled(false)`.
     Fallback (mountedSpots ainda não existe / ball em stub): az/el/intensity estáticos do CONFIG. */
  const mounted = (ball && ball.mountedSpots) || null;
  let used = 0, active = 0, flashes = 0;

  if (mounted && mounted.length) {
    for (let k = 0; k < mounted.length && used < MAX_SPOTS; k++) {
      const m = mounted[k];
      if (!m || !m.S || m.wide) continue;           // `wide` = luz indireta (RectAreaLight, não SpotLight)
      const light = spotLights[used];
      const I = num(m.I, 0);
      const S = new BABYLON.Vector3(m.S[0], m.S[1], m.S[2]);
      const pos = S.scale(CONFIG.spotDist);
      light.position.copyFrom(pos);
      light.direction = BABYLON.Vector3.Zero().subtract(pos).normalize();
      // o raio de `mountedSpots` já tem (ou não, se for flash) o spotRadiusMul aplicado (ball.js)
      light.angle = 2 * Math.atan(Math.max(0.01, num(m.r, 0.15)) / CONFIG.spotDist) * 2.2;
      light.intensity = CONFIG.spotLightIntensity * I;
      // flashes não têm entrada em CONFIG.spots (nascem da coreografia) → cor branca
      const col = m.isFlash ? WHITE : spotColor(CONFIG.spots[k] || {});
      light.diffuse = col;
      light.specular = col;
      const enabled = I >= 0.02;
      light.setEnabled(enabled);
      // HUD: focos e flashes contam-se em separado (`spots 2/2` continua a ser focos vs spotCount)
      if (enabled) { if (m.isFlash) flashes++; else active++; }
      used++;
    }
  } else {
    const n = Math.min(MAX_SPOTS, CONFIG.spots.length);
    for (let i = 0; i < n; i++) {
      const sp = CONFIG.spots[i], light = spotLights[i];
      const S = dirFromAzEl(sp.az, sp.el);
      const pos = S.scale(CONFIG.spotDist);
      const I = num(sp.intensity, 0);
      light.position.copyFrom(pos);
      light.direction = BABYLON.Vector3.Zero().subtract(pos).normalize();
      light.angle = 2 * Math.atan((sp.radius * CONFIG.spotRadiusMul) / CONFIG.spotDist) * 2.2;
      light.intensity = CONFIG.spotLightIntensity * I;
      const col = spotColor(sp);
      light.diffuse = col; light.specular = col;
      const enabled = i < CONFIG.spotCount && sp.on !== false && I >= 0.02;
      light.setEnabled(enabled);
      if (enabled) active++;
      used++;
    }
  }
  for (let i = used; i < MAX_SPOTS; i++) spotLights[i].setEnabled(false);
  activeSpotCount = active; activeFlashCount = flashes;
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
  // F7 (:407): com a bola em estilhaços já não há uma esfera a devolver luz difusa — a auréola
  // desvanece-se com `×(1 − 0.75·exS)`. Fica um resto (25%) porque os cacos ainda refletem.
  const exS = clamp01(num(E.exS, 0));
  const a = 0.05 * num(CONFIG.halo, 0) * haze * spotGain * (0.35 + 0.65 * dk) * (1 - 0.75 * exS);
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

/* ================================================================================================
   ---- F6 fixtures/mini ----                                                       (bloco do SONNET)
   Corpos PAR36 visíveis (v2/fixtures.js) + `?mini=1`/`?scale=`/`?light=1`. O Opus faz em paralelo o
   bloco `// ---- F7 explode ----` (explode.js, ball.js, botão #xpl) — não se tocam.
   ================================================================================================ */
let fixtures = null;
try {
  const mod = await import('./fixtures.js');
  fixtures = mod.createFixtures(scene, CONFIG, room);
  console.log('fixtures.js carregado.');
} catch (err) {
  console.error('fixtures.js falhou:', err);
}

/* ---- ?mini=1 / ?scale=N / ?light=1 (paridade com web/index-v2.html:176-186, PARITY §1.16) ----
   Na Canvas 2D isto reescreve CONFIG.ballSizeVH/ballCenter/etc. (fração do viewport em px). Aqui não
   há canvas 2D — a métrica equivalente é o ENQUADRAMENTO da câmara: computeFov() já calcula o FOV
   vertical para a bola ocupar `CONFIG.ballSizeVH` da altura do ecrã, a `CONFIG.camDistance` fixo.
   `mini` só precisa de mudar `ballSizeVH` (0.66) — computeFov() já lê isso; chamamos resetCameraPose()
   para reaplicar o novo FOV. `ballCenter` não tem equivalente 3D direto (é offset 2D do centro da bola
   no ecrã) — divergência documentada em PARITY: aqui a bola fica sempre centrada (a câmara aponta à
   origem); o deslocamento vertical do original existe para dar espaço à corrente por cima, que aqui já
   está incluída no enquadramento da sala. `?scale=N` multiplica `ballSizeVH` (mesma fórmula do 2D). */
(function applyMiniScale() {
  const mini = qs.get('mini') === '1';
  const scaleQ = parseFloat(qs.get('scale'));
  const scale = Number.isFinite(scaleQ) && scaleQ > 0 ? scaleQ : 1;
  if (mini) {
    CONFIG.ballSizeVH = 0.66;
    CONFIG.facetRows = 39;
    CONFIG.beamWidthDeg = 1.6;
    CONFIG.beamLen = CONFIG.beamLen3D || 3.6; // equivalente 3D a `beamLength:1.0` (fração do viewport 2D) — comprimento cheio do cone
    CONFIG.dotScale = 0.5;
    CONFIG.bloomBlurPx = 5;
    CONFIG.grain = 0.02;
    CONFIG.vignette = 0.35;
    document.documentElement.classList.add('mini');
    CONFIG.skin = qs.get('light') === '1' ? 'white' : 'dark';
  }
  CONFIG.ballSizeVH *= scale;
  resetCameraPose(); // reaplica camera.fov com o novo ballSizeVH (função hoisted, já existe)
  // `CONFIG.skin` já ficou definido acima quando `mini` — `syncSkinBtn()` (mais abaixo no módulo) lê-o
  // no arranque (linha `if (skinBtn) { …; syncSkinBtn(); }`), por isso o botão já nasce sincronizado
  // sem precisarmos de o chamar aqui (a `const skinBtn` ainda não existe nesta fase do módulo — TDZ).
})();

/* ---- botão #xpl ("explosões: on/off") — DOM/estilo meus; o handler real (setExplodeEnabled) é do
   Opus (f67-sync.md). Persiste em localStorage['mb2.explode'] (mesma chave que o stub de F5 já lê). */
(function setupXplButton() {
  const ui = document.getElementById('ui');
  if (!ui) return;
  let btn = document.getElementById('xpl');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'xpl';
    ui.appendChild(btn);
  }
  function getOn() {
    try { return localStorage.getItem('mb2.explode') !== 'off'; } catch (e) { return true; }
  }
  function setOn(on) {
    try { localStorage.setItem('mb2.explode', on ? 'on' : 'off'); } catch (e) { /* sem storage */ }
    btn.textContent = 'explosões: ' + (on ? 'on' : 'off');
    dispatchEvent(new CustomEvent('mb2-xpl-toggle', { detail: { on } }));
  }
  setOn(getOn());
  btn.onclick = () => {
    // se o Opus já ligou window.MIRRORBALL.setExplodeEnabled, prefere-se a API real (fonte única de
    // verdade); senão só o toggle visual/local (mini, sem F7 ainda carregado).
    const next = !getOn();
    if (window.MIRRORBALL && window.MIRRORBALL.setExplodeEnabled) window.MIRRORBALL.setExplodeEnabled(next);
    setOn(next);
  };
})();
/* ================================ fim do bloco F6 fixtures/mini =================================== */

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

/* ================================================================================================
   ---- F5 choreo/API ----                                                          (bloco do OPUS)
   Coreografia (choreo.js), health/PRESETS→effective(), estrobo de FUNDO e `window.MIRRORBALL`.
   O bloco `// ---- F5 music ----` (Sonnet) vem depois e não toca em nada daqui.
   ================================================================================================ */

import { createChoreo } from './choreo.js';
import { createExplode } from './explode.js';   // F7 (bloco `// ---- F7 explode ----`)
const choreo = createChoreo(CONFIG);
const reducedMotion = choreo.reducedMotion;

/* ---- health: PRESETS ALIVE/DEAD + effective() — index-v2.html:187-190, :301-310 ----
   `E` deixa de ser fixo: `spotGain/rotationRpm/sphereOpacity/haze` interpolam ALIVE→DEAD por
   `t = 1 − health`. ALIVE lê o CONFIG a cada chamada (o painel `d` escreve lá), DEAD é fixo.
   `reducedMotion` → rpm ×0.03 (a bola quase pára; a coreografia congela no choreo.js). */
const PRESETS = {
  ALIVE: { spotGain: 1.0, rotationRpm: CONFIG.rotationRpm, sphereOpacity: CONFIG.sphereOpacity, haze: CONFIG.haze },
  DEAD: { spotGain: 0.22, rotationRpm: 0.12, sphereOpacity: 0.35, haze: 0.25 },
};
let health = 1.0;
function lerp(a, b, t) { return a + (b - a) * t; }
function effective(out) {
  const A = PRESETS.ALIVE, D = PRESETS.DEAD, t = 1 - health;
  A.rotationRpm = num(CONFIG.rotationRpm, 1);
  A.sphereOpacity = num(CONFIG.sphereOpacity, 1);
  A.haze = num(CONFIG.haze, 0.65);
  out.spotGain = lerp(A.spotGain, D.spotGain, t);
  out.rotationRpm = clamp(lerp(A.rotationRpm, D.rotationRpm, t) * (reducedMotion ? 0.03 : 1), 0, 3); // teto 3 rpm
  out.sphereOpacity = clamp01(lerp(A.sphereOpacity, D.sphereOpacity, t));
  out.haze = clamp(lerp(A.haze, D.haze, t), 0, 1);
  return out;
}
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

/* ---- estrobo de FUNDO: a SALA atrás pisca, não a bola (index-v2.html:399-403) ----
   No Canvas 2D é um `fillRect` branco por cima do fundo, alpha = `level·(1 − age/lenMs)`. Aqui a
   sala é geometria: multiplica-se temporariamente o `emissiveColor` do material dos 5 planos
   (`room.material`) — a sala acende, a bola não emite luz (regra 6). Em white lê-se como um
   escurecer, porque o tonemap/contraste do pipeline comprime o topo (mesmo efeito do original).
   INVARIANTE: `minGapMs` (default 340 ms ≈ 2.9 Hz) é verificado aqui, não no motor — nada > 3 Hz. */
const MIN_GAP_FLOOR_MS = 334; // 3 Hz é o teto absoluto (regra 6): nem um knob o pode baixar
let strobeT0 = -1e9, strobeLevel = 0;
/* ⚠ PERF (medido): ATRIBUIR `room.material.emissiveColor = new Color3(...)` por frame custou
   **+73 ms** por render — o setter do PBRMaterial marca o material dirty e força a revalidação/
   recompilação dos shaders dos 5 planos a cada frame. A correção é mutar a cor EXISTENTE
   (`.set(r,g,b)`, sem setter de propriedade) e só tocar nela quando o valor muda de facto.
   Depois disto o estrobo custa o mesmo que não o ter (ver §1.13 do PARITY). */
const roomEmissive = room.material.emissiveColor
  ? room.material.emissiveColor.clone() : new BABYLON.Color3(0, 0, 0);
const roomEmissiveLive = room.material.emissiveColor || (room.material.emissiveColor = new BABYLON.Color3(0, 0, 0));
let strobeA = 0;
function updateStrobe(nowMs) {
  const ST = CONFIG.strobe;
  const lenMs = Math.max(1, num(ST && ST.lenMs, 55));
  const age = nowMs - strobeT0;
  let a = 0;
  if (ST && age >= 0 && age < lenMs) a = clamp01(strobeLevel * (1 - age / lenMs));
  if (a === strobeA) return a;             // sem mudança → não se toca no material
  strobeA = a;
  // a sala acende para branco proporcionalmente ao alpha (o `a` do fillRect do original)
  roomEmissiveLive.set(
    roomEmissive.r + (1 - roomEmissive.r) * a,
    roomEmissive.g + (1 - roomEmissive.g) * a,
    roomEmissive.b + (1 - roomEmissive.b) * a);
  return a;
}
function fireStrobe(opts) {
  const ST = CONFIG.strobe, o = opts || {};
  if (!ST || !ST.enabled || reducedMotion) return false;
  const gap = Math.max(MIN_GAP_FLOOR_MS, num(ST.minGapMs, 340));
  const t = performance.now();
  if (t - strobeT0 < gap) return false;
  strobeT0 = t;
  strobeLevel = clamp01(num(o.level, num(ST.level, 0.55)));
  return true;
}

/* ---- disjuntores (CONFIG.beamsMotor / spotsMotor / opacityMotor) ----
   Guarda do lado da BOLA (o `music.js` também os lê — a redundância é intencional, brief F5):
   com o disjuntor a `false` o slider do painel manda e o motor é ignorado. Só as chamadas que se
   identificam como vindas do motor (`{fromMotor:true}`) são filtradas; a consola do David passa. */
function motorAllowed(kind, opts) {
  const fromMotor = !!(opts && opts.fromMotor);
  if (!fromMotor) return true;
  if (kind === 'spots') return CONFIG.spotsMotor !== false;
  if (kind === 'beams') return CONFIG.beamsMotor !== false;
  if (kind === 'opacity') return CONFIG.opacityMotor !== false;
  return true;
}

/* ---- `window.MIRRORBALL` — assinatura completa de index-v2.html:723-770 ----
   Tudo menos explode/rewind/getExplode/setExplodeEnabled, que ficam STUBS para a F7.
   Regra 7 (sem NaN): tudo o que vem do motor passa por `num(v, d)` + clamp. Tetos invioláveis
   aplicados AQUI (não só no motor): beamIntensity ≤ 0.18, rotationRpm ≤ 3, haze ≤ 1. */
// `skinAuto` = alvo contínuo do modo 'auto' (index-v2.html:247 arranca a 0 — `skinAutoValence` é o
// MULTIPLICADOR da valência, não o valor inicial). Nesta fase só se GUARDA (não há modo 'auto' no
// crossfade da F4, que trata 'auto' como 'dark') — a Regra 1 mantém-se: nenhum motor muda a skin.
let skinAuto = 0;
/* ================================================================================================
   ---- F7 explode ----                                                             (bloco do OPUS)
   Explosão em estilhaços. A MÁQUINA DE ESTADOS está em `v2/explode.js` (fases, easings, `maxHold`,
   reentrada); a GEOMETRIA está em `ball.js` (posições/normais dos 4 vértices por tile). Aqui só:
     - instanciar `createExplode(CONFIG)` e chamar `exp.step(dt)` uma vez por frame;
     - publicar `E.exS` / `E.exFloat` / `E.angle0` (o `ball.js` e o `incident.js` leem daí);
     - halo ×(1−0.75·exS) (:407) e cone incidente ×(1−0.8·exS) (:517);
     - teclas `x` / `X` (:896-898) e o botão `#xpl` (id combinado com o Sonnet em `f67-sync.md`).
   Persistência: `localStorage['mb2.explode']` (o spike v2 usa o prefixo `mb2.`; a bola Canvas 2D
   usa `mb.explode`).                                                                            */
const exp = createExplode(CONFIG);

const XPL_KEY = 'mb2.explode';
let explodeEnabled = (() => { try { return localStorage.getItem(XPL_KEY) !== 'off'; } catch (e) { return true; } })();
exp.setEnabled(explodeEnabled);

const xplBtn = document.getElementById('xpl');
function syncXplBtn() { if (xplBtn) xplBtn.textContent = 'explosões: ' + (explodeEnabled ? 'on' : 'off'); }
function setExplodeEnabled(v) {
  explodeEnabled = !!v;
  exp.setEnabled(explodeEnabled);
  try { localStorage.setItem(XPL_KEY, explodeEnabled ? 'on' : 'off'); } catch (e) { /* sem storage */ }
  syncXplBtn();
}
if (xplBtn) { xplBtn.onclick = () => setExplodeEnabled(!explodeEnabled); }
// o botão do Sonnet (F6) despacha este evento; se ele correr primeiro, apanhamos o toggle na mesma
addEventListener('mb2-xpl-toggle', (e) => {
  const on = e && e.detail && typeof e.detail.on === 'boolean' ? e.detail.on : !explodeEnabled;
  if (on !== explodeEnabled) setExplodeEnabled(on);
});
syncXplBtn();

// teclas (index-v2.html:896-898). `x` = ciclo completo (estoiro → deriva → pausa → rewind);
// `X` (shift) = estoiro e FICA no ar; 2.º `X` chama o rewind. Sem preventDefault — as outras
// teclas (m/p/g/n/d/w) continuam a funcionar noutros handlers.
addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (e.key === 'x') window.MIRRORBALL.explode();
  else if (e.key === 'X') {
    const ex = exp.get();
    if (ex.phase === 'idle' || ex.phase === 'back') window.MIRRORBALL.explode({ autoHold: false });
    else window.MIRRORBALL.rewind();
  }
});
/* ============================== fim do bloco F7 explode (parte 1/2) ============================= */

/* Escritas do motor no CONFIG passam por aqui: clamp + disjuntor. O `music.js` escreve direto em
   `MIRRORBALL.config` (:2082-2090), por isso a guarda real é uma sanitização por frame — ver
   `sanitizeConfig()`, chamada no início de cada frame. */
// [min, max, fallback-se-NaN]. Regra 7 (CLAUDE.md): um NaN vindo do motor apagou os feixes uma vez
// — nenhum knob que o motor escreve pode ficar sem valor válido.
const CFG_LIMITS = {
  rotationRpm: [0, 3, 1], haze: [0, 1, 0.65], beamIntensity: [0, 0.18, 0.16],
  beamFraction: [0, 1, 1], sphereOpacity: [0, 1, 1], beamMaxCount: [0, 4000, 110],
  spotCount: [0, CONFIG.spots.length, 2], hazeMax: [0, 1, 1], beamFractionMax: [0, 1, 1],
};
function sanitizeConfig() {
  for (const k in CFG_LIMITS) {
    const lim = CFG_LIMITS[k];
    const v = CONFIG[k];
    if (!Number.isFinite(v)) { CONFIG[k] = lim[2]; continue; }
    if (v < lim[0]) CONFIG[k] = lim[0]; else if (v > lim[1]) CONFIG[k] = lim[1];
  }
}

window.MIRRORBALL = {
  setHealth(h) { health = clamp01(num(+h, 0)); refreshPanel(); },
  getHealth() { return health; },
  config: CONFIG,
  /* knobs do painel `d` (persistidos em localStorage['mb2.knobs']).
     ⚠ prioridade `localStorage > ficheiro > defaults` (index-v2.html:730): o `set` só preenche os
     knobs que o David NUNCA tocou — o que ele mexeu por último ganha ao ficheiro. */
  knobs: {
    get: () => (panelApi && panelApi.knobsGet ? panelApi.knobsGet() : {}),
    set: (o) => {
      if (!panelApi || !panelApi.knobsSet) return 0;
      const obj = o || {};
      if (panelApi.setKnobFile) panelApi.setKnobFile(obj);   // snapshot p/ 'repor ficheiro gravado'
      const cur = panelApi.knobsGet ? panelApi.knobsGet() : {};
      const touched = (() => { try { return JSON.parse(localStorage.getItem('mb2.knobs') || '{}') || {}; } catch (e) { return {}; } })();
      const fill = {};
      for (const k in obj) if (!Number.isFinite(touched[k]) && Number.isFinite(obj[k]) && k in cur) fill[k] = obj[k];
      return panelApi.knobsSet(fill, false);
    },
  },
  setSpot(i, partial) {
    if (!motorAllowed('spots', partial)) return;
    const s = CONFIG.spots[i]; if (!s) return;
    const p = partial || {};
    if (Number.isFinite(p.intensity)) s.intensity = clamp(p.intensity, 0, 4);
    if (Number.isFinite(p.radius)) s.radius = clamp(p.radius, 0.01, 3);
    if (Number.isFinite(p.az)) s.az = p.az;
    if (Number.isFinite(p.el)) s.el = p.el;
    if (Array.isArray(p.aim) && p.aim.length >= 2) s.aim = [num(p.aim[0], 0), num(p.aim[1], 0)];
    if (typeof p.on === 'boolean') s.on = p.on;
    if (Number.isFinite(p.hue)) s.hue = p.hue;
    if (Number.isFinite(p.period)) s.period = Math.max(0.1, p.period);
  },
  // flash curto num sítio novo (motor: bombo/tarola). opts: {intensity, radius, len, az, el, aim}
  flash(opts) { if (!motorAllowed('spots', opts)) return; choreo.flash(opts); },
  // re-aponta um spot já (o técnico muda o pinspot de sítio); sem pose → aleatória
  retarget(i, pose) { if (!motorAllowed('spots', pose)) return; choreo.retarget(i, pose); },
  setChoreo(on) { choreo.setEnabled(on); },
  // estrobo de FUNDO (sala atrás). Só dispara se CONFIG.strobe.enabled e respeita minGapMs (≤ 3 Hz).
  strobe(opts) { if (!motorAllowed('spots', opts)) return false; return fireStrobe(opts); },
  strobeEnabled() { return !!(CONFIG.strobe && CONFIG.strobe.enabled); },
  setSkin(mode) { setSkin(mode); },                       // Regra 1: só o David; o motor não chama isto
  setSkinAuto(v) { skinAuto = clamp01(num(+v, 0)); },     // só guarda o valor (sem modo 'auto' nesta fase)
  getSkin() { return { mode: CONFIG.skin, mix: skinMix, target: skinTargetVal(), auto: skinAuto }; },

  /* ---- Fase 7 (explosão em estilhaços) — implementação real no bloco `// ---- F7 explode ----`.
     Aqui só a delegação, para a assinatura pública (index-v2.html:753-770) viver toda no mesmo
     objeto. `exp` é criado mais acima (hoisting do `const` não serve: estas funções só correm
     depois do módulo carregar, por isso a referência tardia é segura). ---- */
  explode(opts) { exp.explode(opts, ball ? ball.angle : 0); },
  rewind() { exp.rewind(); },
  getExplode() { return exp.get(); },
  setExplodeEnabled(v) { setExplodeEnabled(v); },
};

// o `music.js` lê `window.MIRRORBALL` no momento em que é carregado (`web/music.js:2077`) — o bloco
// `// ---- F5 music ----` do Sonnet só o carrega depois disto.
window.__MB2_READY = true;
window.dispatchEvent(new Event('mb2-ready'));

/* ================================ fim do bloco F5 choreo/API ==================================== */

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

/* `E` = estado efetivo do frame. Desde a F5 é `effective()` que o preenche (health ALIVE→DEAD),
   mais `choreoGain[]`/`flashes` da coreografia — o `ball.js` consome ambos. */
/* F7: `exS`/`exFloat`/`angle0` entram no `E` com valor inicial FINITO (regra 7 — um NaN aqui
   multiplicava a geometria toda por NaN e apagava a bola). Em idle `exS` é 0 e o `ball.js` nem
   entra no caminho da explosão. */
const E = { spotGain: 1, rotationRpm: CONFIG.rotationRpm, sphereOpacity: CONFIG.sphereOpacity, haze: CONFIG.haze, skinMix: 0,
  choreoGain: [], flashes: choreo.flashes, exS: 0, exFloat: 0, angle0: 0 };
scene.registerBeforeRender(() => {
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  tSec += dt;

  // ---- F5: sanitiza o que o motor escreveu no CONFIG (tetos invioláveis) e resolve o health ----
  sanitizeConfig();
  effective(E);                       // escreve spotGain/rotationRpm/sphereOpacity/haze
  choreo.step(dt);                    // gains por spot + flashes Poisson (congela em reducedMotion)
  E.choreoGain.length = CONFIG.spots.length;
  for (let i = 0; i < E.choreoGain.length; i++) E.choreoGain[i] = choreo.gainOf(i);
  E.flashes = choreo.flashes;

  // ---- F7 explode (parte 2/2): avança a máquina e publica o escalar do frame ----
  // Tem de correr ANTES de `ball.update` (o ball lê `E.exS` para reescrever a geometria) e antes
  // do halo/incidente. `exp.step` clampa o dt a 50 ms internamente.
  exp.step(dt);
  E.exS = exp.s; E.exFloat = exp.floatT; E.angle0 = exp.angle0;
  if (!Number.isFinite(E.exS)) E.exS = 0;                 // regra 7: rede final
  if (!Number.isFinite(E.exFloat)) E.exFloat = 0;
  if (!Number.isFinite(E.angle0)) E.angle0 = 0;

  updateStrobe(now);                  // estrobo de fundo: a sala pisca (emissive do room.material)

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
  if (fixtures && fixtures.update) {
    try { fixtures.update(ball && ball.mountedSpots, E); }
    catch (e) { console.error('fixtures.update:', e); }
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
    `health ${health.toFixed(2)}  ·  rpm ${E.rotationRpm.toFixed(2)}  ·  flashes ${activeFlashCount}/${choreo.flashes.length}` +
    `  ·  estrobo ${CONFIG.strobe && CONFIG.strobe.enabled ? 'on' : 'off'}\n` +
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
  /* F5 (diagnóstico): coreografia e estado efetivo do frame. A API pública é `window.MIRRORBALL`. */
  get choreo() { return choreo; },
  get E() { return E; },
  get panel() { return panelApi; },
};

console.log('MB2 pronto —', engine.isWebGPU ? 'WebGPU' : 'WebGL2');

// ---- F5 music ----
// Modo música (?src=music): carrega core.js/music.js/tuner.js do sidecar SEM os tocar (brief
// f5-sonnet.md). Só ativa quando servida como /app/spike/v2/index.html (sidecar real ou fallback
// serve.py, ver spike-babylon/serve.py) — fora daí (`:8099/v2/index.html` sem junction/proxy) os
// caminhos relativos não existem e o resto do spike continua igual (Fase 1-4, nada muda).
//
// `music.js` lê `window.MIRRORBALL` ao carregar (web/music.js:783, :2576) — por isso só se importam
// os 3 scripts DEPOIS de `window.MIRRORBALL` existir. O Opus cria a API real e dispara `mb2-ready`
// (bloco '---- F5 choreo/API ----'); enquanto ele não tiver terminado, um stub local mínimo (nunca
// sobrepõe a API real — `if (!window.MIRRORBALL)`) permite testar este bloco de forma isolada.
(function f5Music() {
  if (qs.get('src') !== 'music') return; // core.js decide o dono via MB_SOURCE; aqui só gate de carregamento

  function ensureStub() {
    // Stub de desenvolvimento — REMOVIDO/ignorado assim que o Opus tiver window.MIRRORBALL real
    // (guarda-se com `if (!window.MIRRORBALL)`, nunca sobrepõe).
    if (window.MIRRORBALL) return;
    console.warn('[F5 music] window.MIRRORBALL ainda não existe (Opus) — a usar stub local só para desenvolvimento.');
    let stubHealth = 1;
    window.MIRRORBALL = {
      setHealth(v) { stubHealth = Math.max(0, Math.min(1, Number(v) || 0)); },
      getHealth() { return stubHealth; },
      config: CONFIG,
      knobs: {
        get: () => panelApi.knobsGet(),
        set: (obj) => { const n = panelApi.knobsSet(obj, false); if (panelApi.setKnobFile) panelApi.setKnobFile(obj); return n; },
      },
      setSpot() {}, flash() {}, retarget() {}, setChoreo() {}, strobe() { return false; }, strobeEnabled() { return false; },
      setSkin, setSkinAuto() {}, getSkin: () => CONFIG.skin,
      explode() {}, rewind() {}, getExplode: () => ({ phase: 'idle', s: 0, enabled: false }), setExplodeEnabled() {},
    };
  }

  function loadMusicScripts() {
    console.log('[F5 music] window.MIRRORBALL pronto — a carregar core.js/music.js/tuner.js do sidecar.');
    // Ids de DOM esperados pelos 3 scripts: só `#mus` (web/music.js:2388, HUD tecla `m`) — já existe
    // em v2/index.html, escondido por omissão (.on liga/desliga, mesmo padrão do Canvas 2D).
    const scripts = ['../../core.js?v=1', '../../music.js?v=58', '../../tuner.js?v=1']; // relativos a /app/spike/v2/ → /app/*.js (web/*.js)
    let i = 0;
    function next() {
      if (i >= scripts.length) { console.log('[F5 music] core.js/music.js/tuner.js carregados.'); return; }
      const s = document.createElement('script');
      s.src = scripts[i++];
      s.onload = next;
      s.onerror = (e) => console.error('[F5 music] falhou a carregar', s.src, e);
      document.body.appendChild(s);
    }
    next();
  }

  function start() {
    ensureStub(); // não-op se o Opus já criou a API real
    loadMusicScripts();
  }

  if (window.__MB2_READY || window.MIRRORBALL) start();
  else addEventListener('mb2-ready', start, { once: true });
})();
