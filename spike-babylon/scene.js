'use strict';
/* ============================================================================
   SPIKE Babylon.js 9 — bola de espelhos
   Comparação honesta contra a Canvas 2D: MESMA cena (mesmos az/el dos 4 focos,
   56 filas, haze 0.65, mesma sala), mas o render é GPU/PBR em vez de pintado.

   O que é GENUINAMENTE diferente da Canvas 2D:
     1. Facetas são geometria 3D real com material PBR metálico. A reflexão não
        é aproximada por wedge — o GPU calcula-a.
     2. RectAreaLight (LTC) = a sala como ÁREA refletida nos espelhos. É o
        equivalente físico do knob "luz indireta"/"indireta: área°".
     3. Feixes = cones 3D reais na direção R = 2(N·S)N − S (a MESMA equação da
        Canvas 2D), que se cruzam e batem nas paredes sozinhos.
     4. Pontos na parede aparecem de graça: a sala é geometria, não matemática.

   ATENÇÃO (medido, não repetir): o VolumetricLightScatteringPostProcess — o
   "volumetric lighting" que parecia óbvio — custou 957 ms/frame e é um godray
   de screen-space que não sabe o que é um espelho. Ver docs/babylon-reference.md §8.

   ESTADO: spike de qualidade visual. NÃO tem paridade com a bola do produto
   (faltam gestos, dimmer, strobe, explosão, skin, cone incidente, knobs, música).
   O spike v2 é que trata disso — ver docs/handoff-2026-08-29-S5.md.

   NÃO toca em nada do repo. Lê só a cópia local em config.js.
   ============================================================================ */
const C = window.SPIKE_CFG;
const BJS = BABYLON;
const D2R = Math.PI / 180;

const canvas = document.getElementById('rc');

/* WebGPU quando existe (é o que a volumetria nova precisa), WebGL2 como recurso.
   async: por isso todo o resto vive dentro de start(). */
async function makeEngine() {
  if (navigator.gpu && BJS.WebGPUEngine && await BJS.WebGPUEngine.IsSupportedAsync) {
    try {
      const e = new BJS.WebGPUEngine(canvas, { antialias: true, stencil: true });
      await e.initAsync();
      return e;
    } catch (err) { console.warn('WebGPU falhou, a usar WebGL2:', err); }
  }
  return new BJS.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true }, true);
}

const engine = await makeEngine();
const scene = new BJS.Scene(engine);
const g = C.bgGrey / 255;
scene.clearColor = new BJS.Color4(g, g, g, 1);

/* ---------------- câmara: mesma distância/enquadramento da Canvas 2D ----------------
   Lá, camDistance = 7 raios e a bola ocupa ~52% da altura. Aqui bola de raio 1. */
const camera = new BJS.ArcRotateCamera('cam', -Math.PI / 2, Math.PI / 2, C.camDistance, BJS.Vector3.Zero(), scene);
camera.attachControl(canvas, true);
camera.wheelPrecision = 40;
camera.lowerRadiusLimit = 2.5;
camera.upperRadiusLimit = 20;
camera.fov = 0.62;

/* ---------------- sala implícita: 5 planos, mesmas medidas do CONFIG.room ----------------
   Serve para os pontos refletidos terem onde bater — na Canvas 2D isto é matemática,
   aqui é geometria, por isso os pontos aparecem sozinhos. */
const R = C.room;
const roomMat = new BJS.PBRMaterial('room', scene);
roomMat.albedoColor = new BJS.Color3(0.055, 0.055, 0.055);
roomMat.metallic = 0; roomMat.roughness = 0.95;
roomMat.backFaceCulling = false;

function plane(name, w, h, pos, rot) {
  const p = BJS.MeshBuilder.CreatePlane(name, { width: w, height: h, sideOrientation: BJS.Mesh.DOUBLESIDE }, scene);
  p.position = pos; if (rot) p.rotation = rot;
  p.material = roomMat; p.receiveShadows = true;
  return p;
}
const roomW = R.halfW * 2, roomH = R.ceil - R.floor;
plane('back',  roomW, roomH, new BJS.Vector3(0, (R.ceil + R.floor) / 2, R.back));
plane('floor', roomW, Math.abs(R.back) * 2, new BJS.Vector3(0, R.floor, 0), new BJS.Vector3(Math.PI / 2, 0, 0));
plane('ceil',  roomW, Math.abs(R.back) * 2, new BJS.Vector3(0, R.ceil, 0),  new BJS.Vector3(-Math.PI / 2, 0, 0));
plane('left',  Math.abs(R.back) * 2, roomH, new BJS.Vector3(-R.halfW, (R.ceil + R.floor) / 2, 0), new BJS.Vector3(0, Math.PI / 2, 0));
plane('right', Math.abs(R.back) * 2, roomH, new BJS.Vector3( R.halfW, (R.ceil + R.floor) / 2, 0), new BJS.Vector3(0, -Math.PI / 2, 0));

/* ---------------- a bola: facetas como geometria real ----------------
   MESMA construção da Canvas 2D (index-v2.html buildTiles): filas de latitude,
   n tiles por fila ≈ TAU·cos(phi)/dphi, offset de meia-célula em filas ímpares.
   Diferença: em vez de desenhar um polígono, cada tile É um quad orientado no espaço. */
const ball = new BJS.TransformNode('ball', scene);

const mirrorMat = new BJS.PBRMaterial('mirror', scene);
// MEDIDO no spike: com metallic 1.0 / roughness 0.06 (espelho perfeito) a bola sai PRETA —
// um espelho puro quase não tem resposta difusa, por isso um pinspot só lá deixa um ponto.
// Um azulejo real é vidro sobre espelhamento: ligeiramente rugoso. Estes valores é que leem.
mirrorMat.metallic = 0.92;
mirrorMat.roughness = 0.22;
mirrorMat.albedoColor = new BJS.Color3(1, 1, 1);
mirrorMat.environmentIntensity = 2.4;   // o que o espelho devolve da sala (probe)
mirrorMat.usePhysicalLightFalloff = true;
// DEFEITO do Babylon é 4 luzes por material: com 4 focos + 3 area lights + key,
// a bola ficava às escuras (as últimas eram ignoradas). Tem de subir.
mirrorMat.maxSimultaneousLights = 12;
roomMat.maxSimultaneousLights = 12;

function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

function buildBall() {
  const rows = Math.max(6, Math.round(C.facetRows));
  const dphi = Math.PI / rows;
  const inset = C.seamInset;
  const positions = [], indices = [], normals = [], uvs = [];
  let vi = 0, id = 0;

  for (let i = 0; i < rows; i++) {
    const phi = -Math.PI / 2 + (i + 0.5) * dphi;
    const cosphi = Math.cos(phi);
    const n = Math.max(3, Math.round(2 * Math.PI * cosphi / dphi));
    const dth = 2 * Math.PI / n;

    for (let j = 0; j < n; j++) {
      const th = j * dth + (i % 2) * dth * 0.5;
      // cantos do tile, encolhidos pela junta (mesma regra: inset fração angular)
      const p0 = phi - dphi * (0.5 - inset / 2), p1 = phi + dphi * (0.5 - inset / 2);
      const t0 = th  - dth  * (0.5 - inset / 2), t1 = th  + dth  * (0.5 - inset / 2);
      // normal do tile = direção do seu centro (espelho plano tangente à esfera)
      const cph = Math.cos(phi), sph = Math.sin(phi);
      const N = [cph * Math.cos(th), sph, cph * Math.sin(th)];
      // 4 cantos na esfera, depois achatados sobre o plano do tile → espelho PLANO, não curvo
      const corners = [[p0, t0], [p0, t1], [p1, t1], [p1, t0]].map(([P, T]) => {
        const cp = Math.cos(P);
        const v = [cp * Math.cos(T), Math.sin(P), cp * Math.sin(T)];
        // projeta o canto no plano tangente: v' = v / (v·N) — mantém a faceta plana
        const d = v[0] * N[0] + v[1] * N[1] + v[2] * N[2];
        const k = d > 0.001 ? 1 / d : 1;
        return [v[0] * k, v[1] * k, v[2] * k];
      });
      for (const c of corners) {
        positions.push(c[0], c[1], c[2]);
        normals.push(N[0], N[1], N[2]);
      }
      // pequena variação por espelho (uns devolvem mais que outros) via UV → usada no roughness map
      const h = hash(id);
      uvs.push(h, 0, h, 1, h, 1, h, 0);
      indices.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
      vi += 4; id++;
    }
  }

  const mesh = new BJS.Mesh('facets', scene);
  const vd = new BJS.VertexData();
  vd.positions = positions; vd.indices = indices; vd.normals = normals; vd.uvs = uvs;
  vd.applyToMesh(mesh);
  mesh.material = mirrorMat;
  mesh.parent = ball;
  return { mesh, count: id };
}
const built = buildBall();

// núcleo escuro: sem isto vê-se através das juntas para o lado de dentro
const core = BJS.MeshBuilder.CreateSphere('core', { diameter: 1.96, segments: 32 }, scene);
const coreMat = new BJS.PBRMaterial('coreMat', scene);
coreMat.albedoColor = new BJS.Color3(0.02, 0.02, 0.02);
coreMat.metallic = 0; coreMat.roughness = 1;
core.material = coreMat; core.parent = ball;

/* ---------------- pinspots: az/el REAIS do David ----------------
   Converte az/el (graus, az=0 = direção da câmara) para posição 3D, igual à Canvas 2D.
   SpotLight com ângulo estreito = PAR36 (4-12°, docs/lighting-design-research). */
const SPOT_DIST = 6.0;   // pinspot a ~3 m da bola, em raios
const spots = [];
function dirFromAzEl(azDeg, elDeg) {
  const az = azDeg * D2R, el = elDeg * D2R;
  return new BJS.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
}
for (let i = 0; i < Math.min(C.spotCount, C.spots.length); i++) {
  const s = C.spots[i];
  const dir = dirFromAzEl(s.az, s.el);
  const pos = dir.scale(SPOT_DIST);
  // ângulo do cone: raio-base × multiplicador, visto da distância do spot
  const rad = C.spotBaseRadius * C.spotRadiusMul;
  const angle = 2 * Math.atan(rad / SPOT_DIST) * 2.2;
  const L = new BJS.SpotLight('spot' + i, pos, pos.scale(-1).normalize(), angle, 12, scene);
  L.intensity = 900;                       // fotométrico (1/d²); 260 era escuro de mais — medido no spike
  L.diffuse = new BJS.Color3(1, 1, 1);
  L.specular = new BJS.Color3(1, 1, 1);
  L.radius = 0.02;                         // fonte pequena = sombras nítidas
  spots.push(L);
}

/* ---------------- RectAreaLight: a SALA refletida nos espelhos ----------------
   Isto é o pedido "textured area lights para produzir reflexos na bola".
   Na Canvas 2D, `luz indireta` fingia isto com um cone largo e um hash por espelho.
   Aqui é a coisa real: um retângulo com textura, e a LTC calcula o reflexo especular
   correto por faceta — cada espelho devolve a parte da sala que lhe calha. */
const areaLights = [];
function makeRoomPanel(name, w, h, pos, dirTo, texture, intensity) {
  const L = new BJS.RectAreaLight(name, pos, w, h, scene);
  L.intensity = intensity;
  L.diffuse = new BJS.Color3(1, 1, 1);
  L.specular = new BJS.Color3(1, 1, 1);
  if (texture) L.areaLightEmissionTexture = texture;   // ← "textured" area light
  // orienta o painel para a bola
  const d = dirTo.subtract(pos).normalize();
  L.direction = d;
  areaLights.push(L);
  return L;
}

// textura da sala: gradiente + faixas irregulares em greyscale (paredes/teto com brilho desigual).
// Greyscale puro — regra 6. É isto que se vai ver refletido nas facetas.
function roomTexture(seed) {
  const S = 256;
  const dt = new BJS.DynamicTexture('roomTex' + seed, { width: S, height: S }, scene, false);
  const c = dt.getContext();
  const grd = c.createLinearGradient(0, 0, 0, S);
  grd.addColorStop(0, '#3a3a3a'); grd.addColorStop(0.55, '#1a1a1a'); grd.addColorStop(1, '#0d0d0d');
  c.fillStyle = grd; c.fillRect(0, 0, S, S);
  for (let i = 0; i < 14; i++) {
    const h = hash(seed * 31 + i);
    const v = Math.round(30 + h * 150);
    c.fillStyle = `rgba(${v},${v},${v},${0.10 + hash(seed + i) * 0.30})`;
    c.fillRect(hash(seed + i * 3) * S, hash(seed + i * 7) * S, 6 + hash(i) * 60, 3 + hash(i * 2) * 26);
  }
  dt.update();
  return dt;
}

const ambI = C.ambient.intensity;
if (ambI > 0) {
  const wide = C.ambient.areaDeg / 19;   // "indireta: área°" escala o tamanho do painel
  const O = BJS.Vector3.Zero();
  makeRoomPanel('roomL', 5 * wide, 3 * wide, new BJS.Vector3(-R.halfW + 0.2, 0.4, -1.5), O, roomTexture(1), ambI * 120);
  makeRoomPanel('roomR', 5 * wide, 3 * wide, new BJS.Vector3( R.halfW - 0.2, 0.2, -1.0), O, roomTexture(2), ambI * 104);
  makeRoomPanel('roomC', 6 * wide, 2 * wide, new BJS.Vector3(0, R.ceil - 0.3, -2.0),     O, roomTexture(3), ambI * 72);
}

/* luz geral (volume): "luz geral (volume)" 0.7, az 0, el -20 — dá 3D à esfera */
const shadeDir = dirFromAzEl(C.shade.az, C.shade.el);
const key = new BJS.HemisphericLight('key', shadeDir, scene);
key.intensity = C.shade.key * 0.25;
key.diffuse = new BJS.Color3(1, 1, 1);
key.groundColor = new BJS.Color3(0.02, 0.02, 0.02);

/* ambiente: um espelho só se vê pelo que REFLETE — sem environment, metal = preto.
   ReflectionProbe captura a sala real (paredes + pontos de luz) a partir do centro
   da bola, e alimenta o material das facetas. É o que faz os espelhos "terem sala". */
const probe = new BJS.ReflectionProbe('probe', 256, scene);
probe.renderList.push(...['back', 'floor', 'ceil', 'left', 'right'].map(n => scene.getMeshByName(n)).filter(Boolean));
probe.refreshRate = BJS.RenderTargetTexture.REFRESHRATE_RENDER_ONCE; // sala é estática
mirrorMat.reflectionTexture = probe.cubeTexture;
scene.environmentTexture = probe.cubeTexture;
scene.environmentIntensity = 1.6;

/* ---------------- feixes: reflexões REAIS, como geometria ----------------
   TENTATIVA 1 (falhada, mas informativa): VolumetricLightScatteringPostProcess.
   É raymarch em screen-space e mediu 957 ms/frame (1 fps) a 80 amostras, 561 ms a 30.
   Fora do orçamento de 17.5 ms do projeto. Além disso é um efeito de "godray a partir
   de um ponto no ecrã" — não sabe nada de espelhos, logo não dá o que a bola precisa.

   TENTATIVA 2 (esta): os feixes de uma bola de espelhos NÃO são godrays da fonte — são
   um feixe por ESPELHO ILUMINADO, cada um na direção R = 2(N·S)N − S. É a MESMA equação
   da Canvas 2D (index-v2.html), só que aqui cada feixe é um cone 3D real em vez de um
   wedge pintado: cruza-se com os outros, atravessa a sala e bate nas paredes sozinho.
   Custo: um mesh instanciado por feixe, additive blending. */
const beams = [];
const beamRoot = new BJS.TransformNode('beams', scene);

const beamMat = new BJS.StandardMaterial('beamMat', scene);
beamMat.emissiveColor = new BJS.Color3(1, 1, 1);
beamMat.diffuseColor = new BJS.Color3(0, 0, 0);
beamMat.specularColor = new BJS.Color3(0, 0, 0);
beamMat.disableLighting = true;
beamMat.alphaMode = BJS.Engine.ALPHA_ADD;   // névoa acumula
beamMat.backFaceCulling = false;
beamMat.disableDepthWrite = true;   // névoa aditiva não deve tapar a névoa de trás
beamMat.alpha = C.beamIntensity;            // 0.16 — teto da regra 6 (≤ 0.18); o haze modula no gradiente
// o feixe apaga-se com a distância: gradiente na textura ao longo do cone
{
  const S2 = 64;
  const dt = new BJS.DynamicTexture('beamGrad', { width: 8, height: S2 }, scene, false);
  const c = dt.getContext();
  const grd = c.createLinearGradient(0, 0, 0, S2);
  grd.addColorStop(0.00, 'rgba(255,255,255,1)');    // junto ao espelho
  grd.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1.00, 'rgba(255,255,255,0)');    // dissolve na névoa
  c.fillStyle = grd; c.fillRect(0, 0, 8, S2);
  dt.update();
  dt.hasAlpha = true;              // MEDIDO: sem isto o alpha da textura é ignorado → feixes sólidos
  dt.getAlphaFromRGB = true;       // usa o branco→preto do gradiente como opacidade
  beamMat.emissiveTexture = dt;
  beamMat.opacityTexture = dt;
}

// molde: um cone fino apontado em +Y, com o vértice na origem
const BEAM_MAX = 56;                        // teto de feixes vivos (CONFIG.beamMaxCount ~110)
const proto = BJS.MeshBuilder.CreateCylinder('beamProto', {
  // um espelho tem ~2 cm: o feixe abre pouco. Tubo gordo lê como plástico, não como luz.
  height: 1, diameterTop: 0.05 + C.beamSoft * 0.05, diameterBottom: 0.004,
  tessellation: 5, cap: BJS.Mesh.NO_CAP,
}, scene);
proto.material = beamMat;
proto.isVisible = false;
proto.setPivotMatrix(BJS.Matrix.Translation(0, 0.5, 0), false); // vértice na base

for (let i = 0; i < BEAM_MAX; i++) {
  const inst = proto.createInstance('beam' + i);
  inst.parent = beamRoot;
  inst.isVisible = false;
  beams.push(inst);
}

/* Recalcula, por frame, que espelhos estão dentro do cone de cada pinspot e para onde
   refletem. Mesma matemática do index-v2.html, mas o resultado vira geometria. */
const _v = new BJS.Vector3(), _r = new BJS.Vector3(), _n = new BJS.Vector3();
const rows = Math.max(6, Math.round(C.facetRows));
const dphiG = Math.PI / rows;
// Normais dos tiles pré-calculadas em typed arrays (em repouso). Rodam-se em Y por frame.
// Amostra: um feixe por CADA espelho seria 4000 testes/frame só para 56 feixes visíveis —
// basta percorrer um subconjunto estável e representativo da malha.
const _tnx = [], _tny = [], _tnz = [];
{
  const SAMPLE = 6;   // 1 em cada 6 espelhos é candidato a feixe
  let k = 0;
  for (let i = 0; i < rows; i++) {
    const phi = -Math.PI / 2 + (i + 0.5) * dphiG;
    const cph = Math.cos(phi), sph = Math.sin(phi);
    const n = Math.max(3, Math.round(2 * Math.PI * cph / dphiG));
    const dth = 2 * Math.PI / n;
    for (let j = 0; j < n; j++, k++) {
      if (k % SAMPLE) continue;
      const th = j * dth + (i % 2) * dth * 0.5;
      _tnx.push(cph * Math.cos(th)); _tny.push(sph); _tnz.push(cph * Math.sin(th));
    }
  }
}
const tnx = Float32Array.from(_tnx), tny = Float32Array.from(_tny), tnz = Float32Array.from(_tnz);
const NT = tnx.length;

let volumetricOn = true;
let liveBeams = 0;
const BEAM_LEN = C.beamLen3D;

function updateBeams() {
  if (!volumetricOn) {
    if (liveBeams !== 0) { for (const b of beams) b.isVisible = false; }
    return 0;
  }
  const rot = ball.rotation.y;
  const cosR = Math.cos(rot), sinR = Math.sin(rot);   // roda a normal SEM chamar cos/sin por tile
  let used = 0;

  for (let s = 0; s < spots.length && used < BEAM_MAX; s++) {
    const sp = spots[s];
    if (!sp.isEnabled() || sp.intensity <= 0) continue;
    const P = sp.position;
    const inv = 1 / Math.hypot(P.x, P.y, P.z);
    const sx = P.x * inv, sy = P.y * inv, sz = P.z * inv;   // direção espelho→fonte

    for (let t = 0; t < NT && used < BEAM_MAX; t++) {
      // normal em repouso, pré-calculada; roda-se em Y aqui (2 mults, sem trig)
      const ax = tnx[t], ay = tny[t], az = tnz[t];
      const nx = ax * cosR + az * sinR;
      const ny = ay;
      const nz = -ax * sinR + az * cosR;

      const NdS = nx * sx + ny * sy + nz * sz;
      if (NdS < 0.90) continue;                 // só a calote virada ao pinspot

      // R = 2(N·S)N − S   ← a MESMA equação da Canvas 2D
      let rx = 2 * NdS * nx - sx, ry = 2 * NdS * ny - sy, rz = 2 * NdS * nz - sz;
      const rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;

      const b = beams[used++];
      if (!b.isVisible) b.isVisible = true;
      b.position.set(nx, ny, nz);

      // quaternião que leva +Y a R, escrito à mão (sem alocar Vector3/Quaternion)
      //   eixo = Y × R = (rz, 0, −rx) ; ângulo = acos(ry)
      const q = b.rotationQuaternion || (b.rotationQuaternion = new BJS.Quaternion());
      const axl = Math.hypot(rz, 0, -rx);
      if (axl < 1e-6) {                          // R paralelo a ±Y
        q.set(0, 0, ry >= 0 ? 0 : 1, ry >= 0 ? 1 : 0);
      } else {
        const half = Math.acos(ry < -1 ? -1 : ry > 1 ? 1 : ry) * 0.5;
        const sh = Math.sin(half) / axl;
        q.set(rz * sh, 0, -rx * sh, Math.cos(half));
      }
      const len = BEAM_LEN * (0.55 + 0.45 * NdS);
      b.scaling.set(1, len, 1);
    }
  }
  for (let i = used; i < BEAM_MAX; i++) beams[i].isVisible = false;
  return used;
}
scene.registerBeforeRender(() => { liveBeams = updateBeams(); });

/* ---------------- rotação: mesma regra da bola real (rpm) ---------------- */
let rpm = C.rotationRpm;
scene.registerBeforeRender(() => {
  const dt = engine.getDeltaTime() / 1000;
  ball.rotation.y += (rpm / 60) * 2 * Math.PI * dt;
});

/* ---------------- HUD ----------------
   NOTA: getDeltaTime() conta o tempo de parede entre frames — se o separador ficar
   em segundo plano, dá números absurdos (medi 1934 ms num frame que custa 2 ms).
   Aqui mede-se o custo REAL de scene.render(), que é o que interessa comparar. */
const hud = document.getElementById('hud');
const samples = [];
let renderMs = 0;
scene.onBeforeRenderObservable.add(() => { renderMs = performance.now(); });
scene.onAfterRenderObservable.add(() => {
  samples.push(performance.now() - renderMs);
  if (samples.length > 60) samples.shift();
});
let lastHud = performance.now();
scene.registerAfterRender(() => {
  const now = performance.now();
  if (now - lastHud < 500 || !samples.length) return;
  const sorted = samples.slice().sort((a, b) => a - b);
  const med = sorted[sorted.length >> 1];
  hud.textContent =
    `facetas ${built.count}  ·  render ${med.toFixed(2)} ms  (teto ${(1000 / med).toFixed(0)} fps)\n` +
    `focos ${spots.length}  ·  area lights ${areaLights.length}  ·  feixes ${liveBeams}${volumetricOn ? '' : ' (off)'}\n` +
    `haze ${C.haze}  ·  filas ${C.facetRows}  ·  rpm ${rpm.toFixed(2)}  ·  ${engine.isWebGPU ? 'WebGPU' : 'WebGL2'}\n` +
    `[v] feixes  [r] rpm  [espaço] pausa  ·  rato: orbitar/zoom`;
  lastHud = now;
});
// para o agente ler sem depender de rAF
window.__perf = () => { const s2 = samples.slice().sort((a,b)=>a-b);
  return { medianRenderMs: s2[s2.length>>1], n: s2.length, beams: liveBeams }; };

/* ---------------- teclas ---------------- */
let paused = false;
addEventListener('keydown', (e) => {
  if (e.key === 'v') volumetricOn = !volumetricOn;
  if (e.key === 'r') rpm = rpm > 0 ? 0 : C.rotationRpm;
  if (e.key === ' ') { paused = !paused; e.preventDefault(); }
});

engine.runRenderLoop(() => { if (!paused) scene.render(); });
addEventListener('resize', () => engine.resize());

// exposto para screenshot automatizado (o agente valida sem o David estar presente)
window.SPIKE = { scene, engine, camera, ball, spots, areaLights, beams, beamMat, cfg: C };
