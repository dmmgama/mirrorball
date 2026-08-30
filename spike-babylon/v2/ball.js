/* ball.js — malha de facetas + cadeia de cinza + PBR (spike v2, Fase 1)
 *
 * Porta a bola de `web/index-v2.html` para Babylon.js mantendo o COMPORTAMENTO:
 *  - `buildTiles()` idêntico (mesmo `hash(id)`, mesmas sementes grey/driftPhase/beamHash/
 *    dotHash/exJit/exAxis/exSpeed/exSpin — a Fase 7 (explosão) precisa delas);
 *  - cadeia de cinza de 8 passos (index-v2.html:641-652) calculada em CPU por tile →
 *    vertex color (greyscale + alpha) que MULTIPLICA o albedo do PBR;
 *  - o PBR só dá o reflexo físico da sala (ReflectionProbe).
 *
 * API:  createBall(scene, CONFIG) → { mesh, rebuild(), update(tSec, spots, E), tiles, ... }
 *
 * F2 acrescenta: mancha do foco fiel (raio fixo, orla, mirrorGain/glintSharp/pow(N·H,k)),
 * fade dos focos + spotFadeMix + spotsOn + spotCount montados AQUI (fonte de verdade →
 * `ball.mountedSpots`), luz indireta CPU a deambular (→ `ball.ambientPoses`),
 * sphereOpacity/raio-X com malha "osso" (LineSystem).
 * `update(tSec, spotsIn, E)`: `spotsIn` = CONFIG.spots no formato original
 * ({az, el, intensity, radius, period, aim, on}); `E` = {spotGain, sphereOpacity, rotationRpm}.
 *
 * Babylon é UMD global (`BABYLON`), carregado por `spike-babylon/vendor/babylon.js`.
 * F3 acrescenta: a FONTE dos feixes refletidos (`ball.beams` = {count, P, R, I}, já ordenada por I
 * desc e truncada a `beamMaxCount`) e `ball.tileWidth` — o desenho é do `beams.js`. A emissão vive
 * aqui porque é o loop por tile que já tem N/NdS/inCone/facing; recalcular noutro sítio era pagar
 * o loop duas vezes.
 *
 * F4 acrescenta: a FONTE dos pontos na parede (`ball.dots` = {count, X, N, R, I, size}, bloco
 * delimitado `// ---- F4 dots ----` dentro do mesmo loop por tile/spot dos feixes — mesma razão:
 * evitar pagar o loop duas vezes) e o setter `ball.dotDensityLive` (degradação adaptativa, o
 * `main.js` escreve). O DESENHO (thin instances de disco) é do `v2/dots.js`.
 *
 * F5 acrescenta ao `E` de `update(tSec, spots, E)` dois campos da COREOGRAFIA (`v2/choreo.js`):
 *   `E.choreoGain: number[]` — gain 0..1 por spot (`choreo[i].gain`), multiplica `I` (:382);
 *   `E.flashes: [{az, el, aim, radius, intensity, life, age}]` — flashes vivos, montados como
 *   focos extra em `mountedSpots` com o envelope de :390-391 e o raio **sem** `spotRadiusMul`
 *   (:308). Ordem em `mountedSpots`: focos, depois flashes, depois luz indireta (`wide`).
 * Quem faz a coreografia (Poisson, retarget, dwell) é o `choreo.js`; aqui só se consome.
 *
 * F7 acrescenta a EXPLOSÃO EM ESTILHAÇOS (a máquina de estados vive em `v2/explode.js`; aqui só
 * se consome o escalar). `update(tSec, spots, E)` passa a ler três campos novos de `E`:
 *   `E.exS: number` — progresso 0..1 (0 = bola inteira). Em idle é 0 e **o custo é zero**: nenhum
 *      buffer é reescrito, o caminho é exatamente o da F5.
 *   `E.exFloat: number` — flutuação em pausa (já pesada por (s−0.7)/0.3 no explode.js);
 *   `E.angle0: number` — rotação congelada no instante do estoiro.
 * Com `exS > 0.0005` (bloco `// ---- F7 explode ----`): por tile calcula-se o centro deslocado `P`
 * e a normal tombada `N` (Rodrigues em `T.exAxis`) — index-v2.html:420-429 — e **reescrevem-se as
 * posições e normais dos 4 vértices** nos typed arrays PRÉ-ALOCADOS (cantos relativos a `N0`,
 * rodados pelo mesmo Rodrigues, transladados para `P` — :628-634), com um único
 * `updateVerticesData(PositionKind/NormalKind)` por frame. Feixes/pontos/glint nascem do MESMO
 * loop, logo passam a sair de `P`/`N` novos sem código extra: o reflexo varre a sala.
 *
 * NÃO faz: DESENHO dos feixes (beams.js), cone incidente (incident.js), DESENHO dos pontos na
 * parede (dots.js), a MÁQUINA de estados da explosão (explode.js), corpos dos focos (fixtures.js),
 * painel, coreografia (choreo.js).
 */

const BJS = (typeof BABYLON !== 'undefined') ? BABYLON : (typeof globalThis !== 'undefined' ? globalThis.BABYLON : undefined);

const TAU = Math.PI * 2;
const D2R = Math.PI / 180;

/* ---------------- helpers (verbatim de index-v2.html:218,315,299-301) ---------------- */
function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
function norm3(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function smooth(e0, e1, x) { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
// direção da bola PARA o spot (unit); az=0 é atrás da câmara (index-v2.html:311)
function spotDir(az, el) {
  const a = az * D2R, e = el * D2R, c = Math.cos(e);
  return [c * Math.sin(a), Math.sin(e), c * Math.cos(a)];
}
function cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
// Rodrigues (index-v2.html:316-320), versão sem alocação: roda (vx,vy,vz) em torno do eixo unitário
// k, com seno/cosseno do ângulo pré-calculados, e escreve em `out` (array de 3). O loop da explosão
// chama isto 5×/tile por frame — alocar um array por chamada matava o GC.
function rodriguesTo(out, vx, vy, vz, kx, ky, kz, sA, cA) {
  const m = (1 - cA) * (kx * vx + ky * vy + kz * vz);
  out[0] = vx * cA + (ky * vz - kz * vy) * sA + kx * m;
  out[1] = vy * cA + (kz * vx - kx * vz) * sA + ky * m;
  out[2] = vz * cA + (kx * vy - ky * vx) * sA + kz * m;
  return out;
}
// leitura defensiva: todo o knob novo tem de ter valor inicial finito (regra 7)
function num(v, d) { return Number.isFinite(v) ? v : d; }

/* ---------------- defaults das chaves novas (se o config.js do Sonnet ainda não as tiver) --- */
const BALL_DEFAULTS = {
  facetRows: 48,
  seamInset: 0.15,
  seamDarkness: 0.02,
  tileSizeVar: 0.35,        // NOVO: jitter determinístico do tamanho do quad (0-1)
  tileTone: 'hash',         // NOVO: 'hash' (cinza por tile) | 'real' (espelhos todos iguais)
  tileLayout: 'offset',     // NOVO: 'offset' (meia célula em filas ímpares) | 'aligned'
  // ---- modo 'real': a junta tem de ler como RELEVO FINO, não como contorno preto ----
  // Em 'hash' os tiles são 0.045-0.14 e a junta escura confunde-se com eles; em 'real' o tile vai a ~1
  // e o mesmo vão preto passa a ler-se como um contorno grosso à volta de cada espelho. Duas causas
  // somadas: (a) o núcleo a `seamDarkness` 0.02 ≈ preto, (b) a junta é larga — `seamInset` 0.15 mais o
  // encolhimento de `tileSizeVar` deixam o vão entre 15% e 45% da célula. Corrige-se as duas, só em 'real'.
  seamGreyReal: 0.35,       // NOVO: cinza metálico do núcleo em modo 'real' (o que se vê pela junta)
  seamInsetRealMul: 0.33,   // NOVO: × seamInset em modo 'real' (0.15 → 0.05: junta fina)
  seamVarRealMul: 0.5,      // NOVO: × tileSizeVar em modo 'real' (0.35 → 0.18: menos vão por tile)
  mirrorMetallic: 0.92,     // NOVO (knob PBR)
  mirrorRoughness: 0.22,    // NOVO (knob PBR)
  envIntensity: 2.4,        // NOVO (knob PBR)
  baseTileGrey: [0.045, 0.14],
  rimStrength: 0.22,
  litSideGain: 0.55,
  ballContrast: 1.0,
  ballLight: 0.0,
  driftPeriod: 38,
  sphereOpacity: 1.0,
  rotationRpm: 1.0,
  spotEdge: 0.35,
  spotRadiusMul: 1.0,
  camDistance: 7.0,
  shade: { key: 0.55, az: -35, el: 40 },
  // ---- F2 ----
  spotCount: 2,
  spotFadeMix: 1.0,
  mirrorGain: 1.0,
  glintSharp: 0.75,
  glintK: 24,
  glintPbrMix: 0.5,          // NOVO: 0 = glint todo da cadeia CPU (paridade Canvas 2D) … 1 = só do PBR
  ambient: { n: 3, intensity: 0.07, areaDeg: 32, drift: 0.045 },
  boneMesh: true,            // NOVO: malha "osso" no raio-X (LineSystem); off = poupa um mesh
  boneAlphaMul: 1.0,         // NOVO: multiplicador do alpha do osso (0.45 base do Canvas 2D)
  // ---- corrente 3D (paridade com drawChain, index-v2.html:704-720) ----
  chainOn: true,             // NOVO: corrente ligada
  chainLink: 0.045,          // NOVO: comprimento de um elo em RAIOS da bola (≈ chainLinkPx 11 px)
  chainLinkPx: 11,           // (da Canvas 2D) só usado como recurso se `chainLink` faltar
  room: { halfW: 5.2, ceil: 4.2, floor: -5.0, back: -7.0 },
  // ---- F4: pontos na parede (guardas defensivas — regra 7, todo o knob novo tem valor inicial) ----
  dotDensity: 0.8,
  dotScale: 0.32,
  dotMaxGrey: 0xd8,
  dotFalloff: 0.028,
};
// spots por defeito (finitos) para `update()` sem argumento — mesmo rig dos 2 primeiros de CONFIG.spots
const DEFAULT_SPOTS = [
  { az: -52, el: 14, intensity: 1.00, radius: 0.16, period: 13, aim: [0, 0.03] },
  { az: 52, el: 12, intensity: 0.95, radius: 0.15, period: 17, aim: [0, 0.03] },
];

export function createBall(scene, CONFIG) {
  if (!BJS) throw new Error('ball.js: BABYLON global não encontrado (carrega vendor/babylon.js antes do módulo)');
  const C = CONFIG || {};
  const cfg = (k) => (C[k] !== undefined ? C[k] : BALL_DEFAULTS[k]);

  /* ================= material: PBR + reflexo da sala ================= */
  const mat = new BJS.PBRMaterial('mirror', scene);
  mat.albedoColor = new BJS.Color3(1, 1, 1);
  mat.useVertexColor = true;              // vertex color multiplica o albedo (cadeia de cinza)
  mat.metallic = num(C.mirrorMetallic, BALL_DEFAULTS.mirrorMetallic);
  mat.roughness = num(C.mirrorRoughness, BALL_DEFAULTS.mirrorRoughness);
  mat.environmentIntensity = num(C.envIntensity, BALL_DEFAULTS.envIntensity);
  mat.usePhysicalLightFalloff = true;
  mat.maxSimultaneousLights = 12;         // ARMADILHA 2: defeito 4 → luzes ignoradas em silêncio
  mat.backFaceCulling = true;
  mat.twoSidedLighting = false;

  /* ================= núcleo: o que se vê PELA JUNTA entre espelhos =================
     'hash': núcleo escuro (`seamDarkness`), como na Canvas 2D — os tiles também são escuros,
     a junta desaparece. 'real': os tiles vão a ~1, e um núcleo preto transforma cada junta num
     contorno grosso à volta do espelho. Em 'real' o núcleo é um cinza metálico médio
     (`seamGreyReal`) e a junta estreita (ver `seamInsetRealMul`/`seamVarRealMul` em buildMesh),
     para ler como um relevo fino — a estrutura por trás dos espelhos, não um vão. */
  const coreMat = new BJS.PBRMaterial('ballCore', scene);
  coreMat.maxSimultaneousLights = 12;
  function syncCoreMat() {
    if (cfg('tileTone') === 'real') {
      const g = clamp(num(cfg('seamGreyReal'), BALL_DEFAULTS.seamGreyReal), 0, 1);
      coreMat.albedoColor.set(g, g, g);
      coreMat.metallic = 0.5; coreMat.roughness = 0.55;   // metal escovado da armação
      coreMat.environmentIntensity = 1.2;                 // apanha a sala: lê como relevo, não como buraco
    } else {
      const sd = clamp(num(cfg('seamDarkness'), BALL_DEFAULTS.seamDarkness), 0, 1);
      coreMat.albedoColor.set(sd, sd, sd);
      coreMat.metallic = 0; coreMat.roughness = 1;        // mate
      coreMat.environmentIntensity = 0.05;
    }
  }
  syncCoreMat();
  const core = BJS.MeshBuilder.CreateSphere('ballCore', { diameter: 1.96, segments: 24 }, scene);
  core.material = coreMat;

  /* ================= raiz (roda com rotationRpm) ================= */
  const root = new BJS.TransformNode('ball', scene);
  core.parent = root;

  /* ================= geometria ================= */
  const tiles = [];
  let mesh = null;
  let positions = null, normals = null, indices = null, colors = null, uvs = null;
  // F7: cópia IMUTÁVEL das posições em repouso. `positions` é reescrito por frame durante a
  // explosão, por isso o canto de referência (relativo a N0) tem de sair daqui, não do buffer vivo
  // — senão a explosão realimentava-se e os estilhaços fugiam para o infinito.
  let restPos = null;
  let exWasOn = false;   // último frame teve exS>0? (para restaurar o repouso UMA vez, não sempre)
  let angle = 0;
  /* ---- F7: estado da explosão DESTE frame (vem de `E`, produzido por `explode.js`). ----
     `exS` 0 = idle → o caminho é o da F5, sem nenhum custo extra. `angleUsed` é o ângulo que a
     malha E o cálculo em CPU usam (congelado no estoiro, :369). Regra 7: valores iniciais finitos. */
  let exS = 0, exFloat = 0, exOn = false, angleUsed = 0;

  // buildTiles: idêntico a index-v2.html:220-242 (mesmas sementes, mesma ordem de `id`)
  function buildTiles() {
    tiles.length = 0;
    const rows = Math.max(6, Math.round(num(cfg('facetRows'), 48)));
    const dphi = Math.PI / rows;
    const bg = cfg('baseTileGrey') || BALL_DEFAULTS.baseTileGrey;
    const g0 = num(bg[0], 0.045), g1 = num(bg[1], 0.14);
    const aligned = cfg('tileLayout') === 'aligned';
    let id = 0;
    for (let i = 0; i < rows; i++) {
      const phi = -Math.PI / 2 + (i + 0.5) * dphi, cosphi = Math.cos(phi);
      const n = Math.max(3, Math.round(TAU * cosphi / dphi)), dth = TAU / n;
      for (let j = 0; j < n; j++) {
        const h0 = hash(id), h1 = hash(id + 0.37), h2 = hash(id + 0.71);
        tiles.push({
          phi, th: j * dth + (aligned ? 0 : (i % 2) * dth * 0.5), dphi, dth,
          grey: g0 + h0 * (g1 - g0),
          driftPhase: h1 * TAU, beamHash: h2, dotHash: hash(id + 0.53),
          // sementes fixas da explosão (Fase 7): trajetória e tombo determinísticos por tile
          exJit: norm3([hash(id + 0.13) - 0.5, hash(id + 0.29) - 0.5, hash(id + 0.47) - 0.5]),
          exAxis: norm3([hash(id + 0.61) - 0.5, hash(id + 0.77) - 0.5, hash(id + 0.89) - 0.5]),
          exSpeed: 0.6 + 0.8 * hash(id + 0.23), exSpin: 0.35 + 0.65 * hash(id + 0.43),
          // NOVO: variação de tamanho — jitter determinístico das arestas (a junta absorve a diferença)
          sizeJit: hash(id + 0.91),
          // normal do tile (centro), pré-calculada: N0 = [cosφ·cosθ, sinφ, cosφ·sinθ]
          nx: 0, ny: 0, nz: 0,
          val: 0, alpha: 1,   // último resultado da cadeia (para debug/HUD)
        });
        id++;
      }
    }
    for (let t = 0; t < tiles.length; t++) {
      const T = tiles[t], cph = Math.cos(T.phi), sph = Math.sin(T.phi);
      T.nx = cph * Math.cos(T.th); T.ny = sph; T.nz = cph * Math.sin(T.th);
    }
  }

  // malha: 4 vértices/tile, normal do CENTRO nos 4 (espelho plano), cantos projetados no plano tangente
  function buildMesh() {
    const nT = tiles.length;
    positions = new Float32Array(nT * 4 * 3);
    normals = new Float32Array(nT * 4 * 3);
    colors = new Float32Array(nT * 4 * 4);
    uvs = new Float32Array(nT * 4 * 2);
    indices = new Uint32Array(nT * 6);

    // Em 'real' a junta encolhe (× seamInsetRealMul/seamVarRealMul): com os tiles a ~1 de cinza, a junta
    // larga do modo 'hash' lia-se como contorno preto em vez de relevo. Ver `seamGreyReal` no núcleo.
    const real = cfg('tileTone') === 'real';
    const insetMul = real ? Math.max(0, num(cfg('seamInsetRealMul'), BALL_DEFAULTS.seamInsetRealMul)) : 1;
    const varMul = real ? Math.max(0, num(cfg('seamVarRealMul'), BALL_DEFAULTS.seamVarRealMul)) : 1;
    const inset = clamp(num(cfg('seamInset'), 0.15) * insetMul, 0, 0.9);
    // variação de tamanho: shrink extra de 0..tileSizeVar·(inset residual). Nunca sobrepõe vizinhos porque
    // só ENCOLHE a partir do tamanho já reduzido pela junta — a junta absorve a diferença.
    const svar = clamp(num(cfg('tileSizeVar'), 0.35) * varMul, 0, 1);

    for (let t = 0, vi = 0, ii = 0; t < nT; t++, vi += 4, ii += 6) {
      const T = tiles[t];
      // meia-extensão base (fração da célula) já com a junta
      const base = 0.5 - inset / 2;
      // jitter simétrico: [1 - svar·(0.5+0.5·h) … 1] — encolhe, nunca cresce
      // orçamento da variação segue a junta: com seamInset 0 fica só 15% residual (junta mínima, pedido do David)
      const shrink = 1 - svar * T.sizeJit * Math.min(1, inset / 0.15 + 0.15);
      const half = base * shrink;
      const p0 = T.phi - T.dphi * half, p1 = T.phi + T.dphi * half;
      const t0 = T.th - T.dth * half, t1 = T.th + T.dth * half;
      const Nx = T.nx, Ny = T.ny, Nz = T.nz;

      const c0 = Math.cos(p0), s0 = Math.sin(p0), c1 = Math.cos(p1), s1 = Math.sin(p1);
      const ct0 = Math.cos(t0), st0 = Math.sin(t0), ct1 = Math.cos(t1), st1 = Math.sin(t1);
      // 4 cantos na esfera; achatados sobre o plano tangente: v' = v/(v·N) → espelho PLANO
      // ordem A,B,C,D igual à do Canvas 2D (:632-635)
      const cx = [c0 * ct0, c0 * ct1, c1 * ct1, c1 * ct0];
      const cy = [s0, s0, s1, s1];
      const cz = [c0 * st0, c0 * st1, c1 * st1, c1 * st0];
      for (let k = 0; k < 4; k++) {
        const d = cx[k] * Nx + cy[k] * Ny + cz[k] * Nz;
        const m = d > 0.001 ? 1 / d : 1;
        const o = (vi + k) * 3;
        positions[o] = cx[k] * m; positions[o + 1] = cy[k] * m; positions[o + 2] = cz[k] * m;
        normals[o] = Nx; normals[o + 1] = Ny; normals[o + 2] = Nz;
        // uv.x = hash do tile (variação de rugosidade por espelho, se a Fase 2 quiser um roughness map)
        const uo = (vi + k) * 2;
        uvs[uo] = T.sizeJit; uvs[uo + 1] = (k === 1 || k === 2) ? 1 : 0;
        const co = (vi + k) * 4;
        colors[co] = colors[co + 1] = colors[co + 2] = 0.08; colors[co + 3] = 1;
      }
      indices[ii] = vi; indices[ii + 1] = vi + 1; indices[ii + 2] = vi + 2;
      indices[ii + 3] = vi; indices[ii + 4] = vi + 2; indices[ii + 5] = vi + 3;
    }

    if (mesh) { mesh.dispose(false, false); mesh = null; }
    mesh = new BJS.Mesh('facets', scene);
    const vd = new BJS.VertexData();
    vd.positions = positions; vd.indices = indices; vd.normals = normals;
    vd.colors = colors; vd.uvs = uvs;
    // F7: snapshot do repouso ANTES de qualquer explosão poder tocar em `positions`
    restPos = positions.slice();
    exWasOn = false;
    vd.applyToMesh(mesh, true);            // updatable
    mesh.material = mat;
    mesh.parent = root;
    mesh.hasVertexAlpha = true;
    mesh.alwaysSelectAsActiveMesh = true;  // nunca cair fora do frustum por bounding stale
  }

  /* ================= malha "osso" (raio-X) =================
     Canvas 2D (:658): contorno rgb(210,210,210) por tile, `meshAlpha = (1−op)·0.45`, modulado por
     `(0.4 + 0.6·smooth(0.5, 0, nz))` POR TILE. Aqui é UM único LinesMesh (4 segmentos/tile) para não
     pagar um draw call por tile: usa-se **alpha global** com o termo `nz` médio (ver PARITY) — o
     gradiente por tile perde-se, o custo cai de ~3000 draw calls para 1. */
  let bone = null;
  function buildBone() {
    if (bone) { bone.dispose(false, false); bone = null; }
    if (!cfg('boneMesh')) return;
    const nT = tiles.length;
    const lines = new Array(nT);
    for (let t = 0, vi = 0; t < nT; t++, vi += 4) {
      const p = new Array(5);
      for (let k = 0; k < 5; k++) {
        const o = (vi + (k % 4)) * 3;
        p[k] = new BJS.Vector3(positions[o], positions[o + 1], positions[o + 2]);
      }
      lines[t] = p;   // fecha o quad: A B C D A
    }
    bone = BJS.MeshBuilder.CreateLineSystem('ballBone', { lines, updatable: false }, scene);
    bone.color = new BJS.Color3(210 / 255, 210 / 255, 210 / 255);
    bone.parent = root;
    bone.isPickable = false;
    bone.alwaysSelectAsActiveMesh = true;
    bone.alphaIndex = 1;              // depois das facetas
    if (bone.material) bone.material.needAlphaBlending = () => true; // v9: LinesMesh.alpha só blenda via material.alpha
    bone.setEnabled(false);
  }

  /* ================= corrente 3D (topo da bola → teto) =================
     Paridade com `web/index-v2.html:704-720` (`drawChain`), traduzida de 2D para 3D:
      - elos ALTERNADOS: pares "de frente" (elipse no Canvas) / ímpares "de lado" (barra) → aqui o
        mesmo toro rodado 90° em Y de elo para elo, que é o que a elipse/barra da 2D representa;
      - passo `chainLinkPx · 0.82` entre elos (verbatim);
      - tom por elo `70 + 45·max(0, sin(i·0.9)) + 30·|litSide|` com `litSide = Σ(S.x · I)` dos spots
        MONTADOS (`mountedSpots`), clamp 40-170 → /255 em greyscale, via instance color;
      - gancho no topo (arco de raio `L·0.32` acima da bola), aqui um toro fino.

     ESCALA: `chainLinkPx` é em px de Canvas; aqui o mundo é em RAIOS DA BOLA. Na 2D a bola ocupa
     `ballSizeVH` (0.52) da altura do viewport, logo o raio em px ≈ 0.26·H; com H≈820 dá ≈213 px e
     um elo de 11 px vale 11/213 ≈ 0.05 raios. Adota-se **0.045 raios por elo** como constante
     documentada (`CHAIN_PX_TO_RADII` = 0.045/11), com knob `CONFIG.chainLink` (default 0.045) a
     mandar diretamente no comprimento do elo em raios — quem afina mexe no knob, não na conversão.

     A corrente NÃO é filha de `root`: não roda com a bola (uma corrente real fica quieta enquanto
     a bola gira no rolamento). Também NÃO entra no `renderList` do ReflectionProbe — fica de fora
     como a própria bola, senão aparecia refletida nos espelhos de onde está pendurada. */
  const CHAIN_PX_TO_RADII = 0.045 / 11;   // ver acima: 11 px de Canvas ≈ 0.045 raios da bola
  let chain = null, chainHook = null, chainMat = null;
  let chainCount = 0;
  let chainColors = null;                  // Float32Array(n·4): instance color por elo (greyscale)
  const chainMatrices = [];                // matrizes fixas (só a cor muda por frame)

  function buildChain() {
    if (chain) { chain.dispose(false, false); chain = null; }
    if (chainHook) { chainHook.dispose(false, false); chainHook = null; }
    chainCount = 0;
    if (!cfg('chainOn')) return;

    // comprimento de um elo em raios da bola: knob direto, com a conversão de px como recurso
    const L = Math.max(0.005, num(cfg('chainLink'), num(cfg('chainLinkPx'), 11) * CHAIN_PX_TO_RADII));
    const R = cfg('room') || { ceil: 4.2 };
    const ceil = num(R.ceil, 4.2);
    const yTop = 1;                                  // topo da bola (raio 1)
    const step = L * 0.82;                           // :719 — `y -= L * 0.82`
    if (!(ceil > yTop + step)) return;               // teto abaixo do topo: sem corrente

    if (!chainMat) {
      chainMat = new BJS.PBRMaterial('chainMat', scene);
      chainMat.albedoColor = new BJS.Color3(1, 1, 1);  // o tom por elo vem do instance color
      chainMat.metallic = 0.85;
      chainMat.roughness = 0.38;
      chainMat.environmentIntensity = 1.0;
      chainMat.maxSimultaneousLights = 12;
      chainMat.backFaceCulling = true;
    }

    // elo: toro fino. diâmetro exterior = L (altura do elo), tubo fino como a `lineWidth` da 2D.
    chain = BJS.MeshBuilder.CreateTorus('chain', {
      diameter: L * 0.92, thickness: L * 0.16, tessellation: 10,
    }, scene);
    chain.material = chainMat;
    chain.isPickable = false;
    chain.alwaysSelectAsActiveMesh = true;

    // matrizes: um elo a cada `step`, do topo da bola até ao teto, alternando 90° em Y.
    // O toro do Babylon nasce no plano XZ (eixo em Y) — roda-se 90° em X para o elo ficar VERTICAL,
    // e os ímpares levam mais 90° em Y (o "de lado" da 2D).
    chainMatrices.length = 0;
    const buf = [];
    let i = 0;
    for (let y = yTop + L * 0.4; y < ceil; y += step, i++) {
      const rotY = (i % 2 === 0) ? 0 : Math.PI / 2;
      const m = BJS.Matrix.RotationYawPitchRoll(rotY, Math.PI / 2, 0);
      m.setTranslationFromFloats(0, y, 0);
      m.copyToArray(buf, buf.length);
      chainMatrices.push(m);
    }
    chainCount = chainMatrices.length;
    if (chainCount === 0) { chain.dispose(false, false); chain = null; return; }

    chain.thinInstanceSetBuffer('matrix', new Float32Array(buf), 16, true);
    chainColors = new Float32Array(chainCount * 4);
    for (let k = 0; k < chainCount; k++) {
      chainColors[k * 4] = chainColors[k * 4 + 1] = chainColors[k * 4 + 2] = 0.4;
      chainColors[k * 4 + 3] = 1;
    }
    chain.thinInstanceSetBuffer('color', chainColors, 4, false);

    // gancho: arco no topo da bola (:709 — `arc(x, yTop - L*0.25, L*0.32)`), aqui um toro fino
    chainHook = BJS.MeshBuilder.CreateTorus('chainHook', {
      diameter: L * 0.64, thickness: L * 0.14, tessellation: 12,
    }, scene);
    chainHook.material = chainMat;
    chainHook.rotation.x = Math.PI / 2;
    chainHook.position.y = yTop + L * 0.25;
    chainHook.isPickable = false;
    chainHook.alwaysSelectAsActiveMesh = true;
  }

  // tom por elo, verbatim de :712-714 — depende dos spots montados neste frame
  function updateChainTone() {
    if (!chain || !chainCount || !chainColors) return;
    // litSide = Σ(S.x · I) sobre os spots MONTADOS (:705)
    let litSide = 0;
    for (let s = 0; s < mountedSpots.length; s++) {
      const m = mountedSpots[s];
      litSide += m.S[0] * m.I;
    }
    const la = Math.abs(litSide);
    for (let i = 0; i < chainCount; i++) {
      const shade = 70 + 45 * Math.max(0, Math.sin(i * 0.9)) + 30 * la;
      const v = clamp(Math.round(shade), 40, 170) / 255;
      const o = i * 4;
      chainColors[o] = chainColors[o + 1] = chainColors[o + 2] = v;
    }
    chain.thinInstanceSetBuffer('color', chainColors, 4, false);
  }

  /* ================= ReflectionProbe (sala, ONCE — sem a bola) ================= */
  let probe = null;
  function attachProbe(renderList) {
    if (probe) { probe.dispose(); probe = null; }
    probe = new BJS.ReflectionProbe('ballProbe', 256, scene);
    // a corrente fica FORA do probe (como a bola): senão via-se refletida nos espelhos de onde pende
    const skip = (m) => !m || m === mesh || m === core || m === bone || m === chain || m === chainHook;
    const list = renderList || scene.meshes.filter(m => !skip(m) && m.isEnabled());
    for (const m of list) if (!skip(m)) probe.renderList.push(m);
    probe.refreshRate = BJS.RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
    mat.reflectionTexture = probe.cubeTexture;
    if (!scene.environmentTexture) scene.environmentTexture = probe.cubeTexture;
    return probe;
  }
  function refreshProbe() { if (probe) probe.refreshRate = BJS.RenderTargetTexture.REFRESHRATE_RENDER_ONCE; }

  /* ================= spots em CPU: makeSpot fiel a index-v2.html:285-292 + fade de :376-383 =========
     `update()` recebe os spots no formato de CONFIG.spots ({az, el, intensity, radius, period, aim, on})
     e monta-os aqui — UMA fonte de verdade: `ball.mountedSpots` é o que o main.js usa para posicionar
     as SpotLight, e é o mesmo array que alimenta a cadeia de cinza. */
  const spotCache = [];       // objetos flat (sem Vector3) para o loop por tile
  const mountedSpots = [];    // vista pública: { az, el, S, H, C, r, I }
  const spotsOn = [];         // checkboxes "spot i" (index-v2.html:248) — o painel liga-se a isto
  const ambientPoses = [];    // vista pública da luz indireta: { az, el, I }

  // monta um spot no formato do original. `wide` = fonte de área (luz indireta), sem cone nem beam.
  // `isFlash` marca os flashes da coreografia (F5): entram em `mountedSpots` como qualquer foco,
  // mas o raio JÁ vem sem `spotRadiusMul` (index-v2.html:308) — quem chama é que decide.
  function pushSpot(azDeg, elDeg, I, radius, aim, wide, areaRad, isFlash) {
    const S = spotDir(azDeg, elDeg);
    const Hv = norm3([S[0], S[1], S[2] + 1]);              // half-vector spot↔câmara (:286)
    const u = norm3(cross3(S, [0, 1, 0])), v = cross3(u, S);
    const ax = (aim && Number.isFinite(aim[0])) ? aim[0] : 0;
    const ay = (aim && Number.isFinite(aim[1])) ? aim[1] : 0;
    const Cx = u[0] * ax + v[0] * ay, Cy = u[1] * ax + v[1] * ay, Cz = u[2] * ax + v[2] * ay;
    spotCache.push({
      Sx: S[0], Sy: S[1], Sz: S[2], Hx: Hv[0], Hy: Hv[1], Hz: Hv[2], I,
      r: Math.max(0.01, radius), Cx, Cy, Cz,
      wide: !!wide, area: num(areaRad, 0.5), isFlash: !!isFlash,
    });
    return { az: azDeg, el: elDeg, S, H: Hv, C: [Cx, Cy, Cz], r: Math.max(0.01, radius), I, isFlash: !!isFlash };
  }

  /* spotsIn = CONFIG.spots (formato original). Devolve spotCache; preenche mountedSpots/ambientPoses.
     `E` (F5) traz, além de spotGain/haze/sphereOpacity:
       E.choreoGain : number[]  — gain 0..1 por spot da coreografia (`choreo[i].gain`, :382). Em falta = 1.
       E.flashes    : [{az, el, aim, radius, intensity, life, age}] — flashes VIVOS da coreografia
                      (`choreo.js`). Cada um é montado como um foco extra com o envelope de :390-391
                      (ataque nos primeiros 25% da vida, decaimento linear depois) e com o raio
                      **sem** `spotRadiusMul` (:308, `s.isFlash ? 1 : CONFIG.spotRadiusMul`).
                      Entram em `mountedSpots` a seguir aos focos e ANTES da luz indireta, para que o
                      `main.js` lhes possa dar SpotLights (slots `spots.length … spots.length+flashSlots`). */
  function makeSpots(spotsIn, tSec, E) {
    const src = (Array.isArray(spotsIn) && spotsIn.length) ? spotsIn : DEFAULT_SPOTS;
    spotCache.length = 0; mountedSpots.length = 0; ambientPoses.length = 0;
    const rmulG = num(cfg('spotRadiusMul'), 1);
    const fadeMix = clamp(num(cfg('spotFadeMix'), 1), 0, 1);
    const gain = num((E && E.spotGain), 1);
    const cg = (E && Array.isArray(E.choreoGain)) ? E.choreoGain : null;   // F5: gain por spot
    // spotCount corta a lista: o main.js pode passar já cortado, mas quem manda é o CONFIG (:379)
    const nMax = Math.min(src.length, Math.max(0, Math.round(num(cfg('spotCount'), src.length))));

    for (let i = 0; i < nMax; i++) {
      const s = src[i] || {};
      while (spotsOn.length <= i) spotsOn.push(true);
      // `on` do próprio spot (main.js pode marcá-lo) OU a checkbox local — qualquer um desliga
      if (s.on === false || spotsOn[i] === false) continue;
      const period = Math.max(0.1, num(s.period, 13));
      const fade0 = 0.5 + 0.5 * Math.sin(TAU * tSec / period + i * 2.1);   // :380
      const fade = lerp(1, fade0, fadeMix);                                 // :381
      const gI = cg ? clamp(num(cg[i], 1), 0, 1) : 1;                       // :382 choreo[i].gain (F5)
      const I = num(s.intensity, 1) * gain * (0.35 + 0.65 * fade) * gI;     // :382
      if (!(I >= 0.02)) continue;                                           // :383
      const r = num(s.radius, 0.16) * rmulG;
      mountedSpots.push(pushSpot(num(s.az, 0), num(s.el, 0), I, r, s.aim, false, 0, false));
    }

    /* flashes da coreografia (:389-392) — depois dos focos, antes da luz indireta.
       envelope: ataque seco nos primeiros 25% da vida, cauda linear nos 75% restantes.
       raio SEM `spotRadiusMul` (:308). */
    const fl = (E && Array.isArray(E.flashes)) ? E.flashes : null;
    if (fl) {
      for (let k = 0; k < fl.length; k++) {
        const f = fl[k]; if (!f) continue;
        const life = Math.max(0.01, num(f.life, 0.15));
        const u = clamp(num(f.age, 0) / life, 0, 1);
        const env = u < 0.25 ? u / 0.25 : 1 - (u - 0.25) / 0.75;            // :390
        const I = num(f.intensity, 0) * gain * env;                         // :391
        if (!(I > 0.02)) continue;
        mountedSpots.push(pushSpot(num(f.az, 0), num(f.el, 0), I,
          Math.max(0.01, num(f.radius, 0.14)), f.aim, false, 0, true));
      }
    }

    // luz indireta: n fontes largas a deambular (:386-388) — não são focos, são áreas da sala
    const A = cfg('ambient') || BALL_DEFAULTS.ambient;
    const an = Math.max(0, Math.min(8, Math.round(num(A.n, 0))));
    const aI = num(A.intensity, 0.07) * gain;
    const aDrift = num(A.drift, 0.045);
    const areaRad = Math.max(0.01, num(A.areaDeg, 32) * D2R);
    for (let i = 0; i < an; i++) {
      const w = aDrift * (0.7 + 0.3 * i);
      const az = 140 * Math.sin(w * tSec + i * 2.4);
      const el = 25 + 35 * Math.sin(w * 0.61 * tSec + i * 1.3);
      pushSpot(az, el, aI, 9, [0, 0], true, areaRad);
      ambientPoses.push({ az, el, I: aI });
    }
    return spotCache;
  }

  /* ================= feixes refletidos: FONTE (F3) =================
     O `beams.js` só desenha; quem decide QUE tiles emitem e em que direção é este loop, porque é
     aqui que já existem `N`, `NdS`, `inCone` e `facing` — recalculá-los noutro sítio era pagar o
     loop por tile duas vezes. Critério verbatim de `index-v2.html:463`:
       (facing > 0 || R.z < −0.05) && beamHash < beamFraction && inCone > 0.3
     com `R = 2(N·S)N − S` (:456) e `I = inCone · NdS · sp.I · E.haze` (:464).
     `R.z` é a componente de R na direção bola→CÂMARA (a câmara orbita) — mesma convenção do `nz`,
     não o z do mundo.

     Typed arrays PRÉ-ALOCADOS (nunca um array novo por frame, contrato do plano). Capacidade =
     nº de tiles: no pior caso todos emitem. A ordenação por I desc + truncagem a `beamMaxCount`
     faz-se sobre um índice (`beamOrder`), não sobre os dados — evita mover 7 floats por troca. */
  let beamP = null, beamR = null, beamI = null;   // xyz, xyz, escalar — capacidade = tiles.length
  let beamOrder = null;                            // Int32Array de índices, ordenada por I desc
  let beamRawCount = 0;                            // quantos emitiram ANTES da truncagem
  // vista pública, já ordenada e truncada: P/R/I são os arrays COMPACTADOS (0..count-1)
  const beams = { count: 0, P: null, R: null, I: null };
  let beamPo = null, beamRo = null, beamIo = null; // saída compactada (também pré-alocada)

  function allocBeams(nT) {
    beamP = new Float32Array(nT * 3);
    beamR = new Float32Array(nT * 3);
    beamI = new Float32Array(nT);
    beamOrder = new Int32Array(nT);
    beamPo = new Float32Array(nT * 3);
    beamRo = new Float32Array(nT * 3);
    beamIo = new Float32Array(nT);
    beams.P = beamPo; beams.R = beamRo; beams.I = beamIo; beams.count = 0;
  }

  /* ================= F4 dots ====================================================================
     Fonte dos "pontos na parede" (docs/parity-canvas2d.md §1.8, index-v2.html:443-481). Mesmo padrão
     dos feixes: typed arrays pré-alocados (capacidade = nº de tiles), preenchidos no MESMO loop por
     tile/spot que já calcula N/NdS/dist (pagar o loop uma vez só). `v2/dots.js` só DESENHA (thin
     instances de um disco); aqui decide-se QUE tiles projetam ponto, ONDE na sala (interseção com os
     5 planos implícitos) e com que intensidade/tamanho.
     `ball.dotDensityLive` é escrito pelo `main.js` (degradação adaptativa, §6) — setter próprio para
     não obrigar a recriar o objeto `dots` a cada frame. */
  let dotX = null, dotN = null, dotR = null, dotI = null, dotSize = null; // typed arrays, capacidade = tiles.length
  let dotCount = 0;
  const dots = { count: 0, X: null, N: null, R: null, I: null, size: null };
  let dotDensityLiveVal = 1; // valor "ao vivo" (adaptativo); setter próprio, guarda Number.isFinite (regra 7)

  function allocDots(nT) {
    dotX = new Float32Array(nT * 3);
    dotN = new Float32Array(nT * 3);
    dotR = new Float32Array(nT * 3);
    dotI = new Float32Array(nT);
    dotSize = new Float32Array(nT);
    dots.X = dotX; dots.N = dotN; dots.R = dotR; dots.I = dotI; dots.size = dotSize; dots.count = 0;
  }

  // largura média de um tile em raios da bola — base do cone do feixe (`tileRad` de :565).
  // `Math.PI / facetRows` é a altura angular de uma fila; com tiles ~quadrados serve de largura.
  let tileWidth = Math.PI / 48;
  function computeTileWidth() {
    const rows = Math.max(6, Math.round(num(cfg('facetRows'), 48)));
    tileWidth = Math.PI / rows;
  }

  /* Ordena por I desc, trunca a `beamMaxCount` e compacta para `beams.P/R/I`.
     Guarda `Number.isFinite` no `beamMaxCount` (:559): um NaN vindo de fora dava `nb = NaN` e os
     feixes desapareciam SEM erro na consola — foi o bug documentado no original. */
  function finalizeBeams() {
    const bmcRaw = cfg('beamMaxCount');
    const bmc = Number.isFinite(bmcRaw) ? Math.max(0, Math.round(bmcRaw)) : 0;
    const n = Math.min(beamRawCount, bmc);
    if (n <= 0) { beams.count = 0; return; }

    // índices 0..beamRawCount-1 ordenados por I desc. `subarray` não aloca memória nova.
    const ord = beamOrder.subarray(0, beamRawCount);
    for (let i = 0; i < beamRawCount; i++) ord[i] = i;
    // sort de typed array com comparador: ordena in-place, sem array intermédio
    ord.sort((a, b) => beamI[b] - beamI[a]);

    for (let i = 0; i < n; i++) {
      const src = ord[i] * 3, dst = i * 3;
      beamPo[dst] = beamP[src]; beamPo[dst + 1] = beamP[src + 1]; beamPo[dst + 2] = beamP[src + 2];
      beamRo[dst] = beamR[src]; beamRo[dst + 1] = beamR[src + 1]; beamRo[dst + 2] = beamR[src + 2];
      beamIo[i] = beamI[ord[i]];
    }
    beams.count = n;
  }

  /* ================= cadeia de cinza → vertex color ================= */
  // vetores de trabalho reutilizados (nunca alocar Vector3 dentro do loop por tile)
  const camDir = { x: 0, y: 0, z: 1 };   // direção bola → câmara, no espaço do MUNDO
  const shadeD = { x: 0, y: 0, z: 1 };
  let lastColorT = -1;
  // termo `(0.4+0.6·smooth(0.5,0,nz))` do osso, médio sobre os tiles visíveis (ver buildBone)
  let boneNzTerm = 0.7;
  const COLOR_HZ = 20;                 // cadeia a 20 Hz (o brief autoriza se pesar); rotação continua a 60

  function updateCamDir() {
    const cam = scene.activeCamera;
    if (cam && cam.globalPosition) {
      const p = cam.globalPosition;
      const l = Math.hypot(p.x, p.y, p.z) || 1;
      camDir.x = p.x / l; camDir.y = p.y / l; camDir.z = p.z / l;
    } else { camDir.x = 0; camDir.y = 0; camDir.z = 1; }
  }

  function computeColors(tSec, spots, E) {
    const eff = E || {};
    const op = clamp(num(eff.sphereOpacity, num(cfg('sphereOpacity'), 1)), 0, 1);
    const realTone = cfg('tileTone') === 'real';
    const litGain = num(cfg('litSideGain'), 0.55);
    const bLight = clamp(num(cfg('ballLight'), 0), 0, 1);
    const contrast = num(cfg('ballContrast'), 1);
    const rim = num(cfg('rimStrength'), 0.22);
    const dPeriod = Math.max(0.5, num(cfg('driftPeriod'), 38));
    const bg = cfg('baseTileGrey') || BALL_DEFAULTS.baseTileGrey;
    const mid = 0.5 * (num(bg[0], 0.045) + num(bg[1], 0.14)) + 0.45 * bLight;
    const K = cfg('shade') || BALL_DEFAULTS.shade;
    const key = clamp(num(K.key, 0.55), 0, 1);
    const sdir = spotDir(num(K.az, -35), num(K.el, 40));
    shadeD.x = sdir[0]; shadeD.y = sdir[1]; shadeD.z = sdir[2];
    const edge = clamp(num(cfg('spotEdge'), 0.35), 0.01, 0.95);
    const mGain = Math.max(0, num(cfg('mirrorGain'), 1));
    const gSharp = clamp(num(cfg('glintSharp'), 0.75), 0, 1);
    const gK = Math.max(1, num(cfg('glintK'), 24));
    // glintPbrMix: quanto do brilho vem do PBR em vez da cadeia CPU (1 = vertex color sem glint)
    const cpuGlint = 1 - clamp(num(cfg('glintPbrMix'), 0.5), 0, 1);
    const SP = makeSpots(spots, tSec, eff), nS = SP.length;
    const camD = num(cfg('camDistance'), 7);

    updateCamDir();
    // F7: com a bola partida a rotação congela (`angleUsed`, :369) — a malha já roda por
    // `root.rotation.y = angleUsed` no update(), e o cálculo em CPU tem de usar o MESMO ângulo,
    // senão os feixes/pontos saíam de normais que não correspondem aos espelhos desenhados.
    const ca = Math.cos(angleUsed), sa = Math.sin(angleUsed);
    const cdx = camDir.x, cdy = camDir.y, cdz = camDir.z;
    const drAmp = 0.015, drW = TAU * tSec / dPeriod;
    let boneAcc = 0, boneN = 0;

    // ---- feixes: parâmetros do frame (F3). `haze` vem de E (o motor escreve-o); sem E, do CONFIG.
    const beamFrac = clamp(num(cfg('beamFraction'), 1), 0, 1);
    const hazeE = Math.max(0, num(eff.haze, num(cfg('haze'), 0.65)));
    // `beamFraction` 0 ou `haze` 0 → nenhum feixe (e nem se paga o cálculo de R por tile)
    const emitBeams = beamP !== null && beamFrac > 0 && hazeE > 0;
    beamRawCount = 0;

    // ---- F4: pontos na parede — parâmetros do frame (index-v2.html:445, :467-478) ----
    const dm = Math.max(1, num(cfg('dotDensity'), 1));           // alarga o cone ELEGÍVEL (rDot)
    const dotDensityLiveClamped = Math.min(1, Math.max(0, num(dotDensityLiveVal, 1)));
    const dotFalloffV = Math.max(0, num(cfg('dotFalloff'), 0.028));
    const dotScaleV = Math.max(0, num(cfg('dotScale'), 0.32));
    const roomCfg = cfg('room') || BALL_DEFAULTS.room;
    const roomHalfW = num(roomCfg.halfW, 5.2), roomCeil = num(roomCfg.ceil, 4.2);
    const roomFloor = num(roomCfg.floor, -5.0), roomBack = num(roomCfg.back, -7.0);
    const emitDots = dotX !== null && dm > 0 && dotDensityLiveClamped > 0;
    dotCount = 0;

    /* ---- F7 explode: parâmetros do frame ----------------------------------------------------
       `exOn` false = caminho da F5 intacto (custo zero: nem se lê o CONFIG.explode). Todos os
       valores abaixo são função pura de `exS` — o rewind é `exS` a descer pela mesma expressão. */
    const EX = C.explode || {};
    const exRadial = num(EX.radial, 1.9), exJitter = num(EX.jitter, 0.45);
    const exDepth = num(EX.depth, 0.45), exGravity = num(EX.gravity, 1.1);
    const exSpinMax = num(EX.spinMax, 3.2), exFloatSpin = num(EX.floatSpin, 0.35);
    const exFloatBob = num(EX.floatBob, 0.05);
    const exS2 = exS * exS;                          // queda: −gravity·s² (:423)
    const exRadK = exRadial * exS, exJit = exJitter * exS;
    const exBob = exFloat > 0 ? exFloatBob : 0;
    const exSpinK = exSpinMax * exS + exFloatSpin * exFloat;
    // buffers de trabalho reutilizados (nunca alocar dentro do loop por tile)
    const rv = exOn ? [0, 0, 0] : null, rn = exOn ? [0, 0, 0] : null;

    for (let t = 0, vi = 0; t < tiles.length; t++, vi += 4) {
      const T = tiles[t];
      // normal no MUNDO: N0 rodado em torno de Y por `angleUsed` (a malha roda; o cálculo acompanha)
      let nx = T.nx * ca + T.nz * sa;
      let ny = T.ny;
      let nz3 = -T.nx * sa + T.nz * ca;

      /* ---- F7 explode: centro deslocado `P` e normal tombada `N` (index-v2.html:419-429) ----
         `P` (posição do estilhaço) e `N` (normal tombada) substituem a normal-como-posição do
         repouso. É por isso que os feixes, os pontos na parede e o glint acompanham os estilhaços
         sem uma linha de código extra: nascem deste mesmo P/N, mais abaixo no loop.
         Tudo no espaço do MUNDO (nx/ny/nz3 já vêm rodados) — igual ao resto do loop. */
      let px = nx, py = ny, pz = nz3;                // em repouso P ≡ N (esfera de raio 1)
      let exSA = 0, exCA = 1;                        // seno/cosseno do tombo deste tile (Rodrigues)
      let exKx = 0, exKy = 0, exKz = 0;              // eixo de tombo, JÁ rodado para o mundo
      let dropped = false;                           // estilhaço perto demais da câmara (:426)
      if (exOn) {
        const rad = 1 + exRadK * T.exSpeed;
        const bob = exBob > 0 ? exBob * Math.sin(exFloat * 0.7 + T.driftPhase) : 0;
        // exJit é uma direção FIXA do tile em espaço da bola: roda-se para o mundo como a normal
        const jx = T.exJit[0] * ca + T.exJit[2] * sa;
        const jy = T.exJit[1];
        const jz = -T.exJit[0] * sa + T.exJit[2] * ca;
        // deslocação completa (radial + jitter + bob + queda), ainda SEM o achatamento `depth`
        let dx = nx * (rad - 1) + jx * (exJit + bob);
        let dy = ny * (rad - 1) + jy * exJit + bob - exGravity * exS2;
        let dz = nz3 * (rad - 1) + jz * (exJit + bob);
        // `depth` (<1) mantém os estilhaços mais no plano. Na Canvas 2D o eixo achatado é o Z de
        // ECRÃ (:424); aqui a câmara orbita, por isso achata-se a componente da deslocação ao longo
        // do eixo bola→CÂMARA (mesma intenção: "menos profundidade para quem olha") — PARITY §1.14.
        const camComp = dx * cdx + dy * cdy + dz * cdz;
        const k = camComp * (exDepth - 1);
        dx += cdx * k; dy += cdy * k; dz += cdz * k;
        px = nx + dx; py = ny + dy; pz = nz3 + dz;
        // demasiado perto da câmara: na 2D o tile era simplesmente descartado (:426, `continue`).
        // Aqui a malha existe sempre, por isso "descartar" é marcar `dropped` → alpha 0 e nenhum
        // feixe/ponto emitido (a geometria continua a ser escrita, mas invisível).
        dropped = (px * cdx + py * cdy + pz * cdz) > camD - 1.5;
        // eixo de tombo do tile, rodado para o mundo
        exKx = T.exAxis[0] * ca + T.exAxis[2] * sa;
        exKy = T.exAxis[1];
        exKz = -T.exAxis[0] * sa + T.exAxis[2] * ca;
        const A = T.exSpin * exSpinK;
        exSA = Math.sin(A); exCA = Math.cos(A);
        rodriguesTo(rn, nx, ny, nz3, exKx, exKy, exKz, exSA, exCA);
        nx = rn[0]; ny = rn[1]; nz3 = rn[2];
      }
      // nz da cadeia = componente da normal na direção da CÂMARA (a câmara orbita)
      const nz = nx * cdx + ny * cdy + nz3 * cdz;

      // ---- lit / glint dos spots (:433-461) ----
      // visibilidade em perspetiva (:432): N·(cam − P); em repouso P=N e N·P=1 → nz·camD − 1
      const facing = dropped ? -1 : exOn
        ? (nx * (cdx * camD - px) + ny * (cdy * camD - py) + nz3 * (cdz * camD - pz))
        : (nz * camD - 1);
      let lit = 0, gl = 0;
      for (let s = 0; s < nS && !dropped; s++) {
        const sp = SP[s];
        const NdS = nx * sp.Sx + ny * sp.Sy + nz3 * sp.Sz;
        if (NdS <= 0.02) continue;
        if (NdS * sp.I * 0.5 > lit) lit = NdS * sp.I * 0.5;      // :437 lit = max(lit, NdS·I·0.5)
        if (sp.wide) {
          // luz indireta: ÁREA larga da sala refletida (:447-452) — sem cone, sem feixe.
          // ang = desvio entre a normal e a meia-direção fonte↔câmara; w = orla suave da área.
          if (facing > 0) {
            const NdH = nx * sp.Hx + ny * sp.Hy + nz3 * sp.Hz;
            if (NdH > 0) {
              const ang = Math.acos(NdH < 1 ? NdH : 1);
              const w = smooth(sp.area, sp.area * 0.35, ang);
              // variação espelho-a-espelho: uns devolvem a sala, outros não
              if (w > 0) gl += w * sp.I * (0.35 + 1.3 * T.dotHash);
            }
          }
          continue;
        }
        // dentro do cone do pinspot? distância de P (=N em repouso) ao eixo (C + t·S) — :439-442.
        // RAIO FIXO: r = radius·spotRadiusMul, não depende de I.
        // F7: em explosão a distância ao eixo do cone mede-se a partir de `P` (a posição real do
        // estilhaço), não da normal — é o que faz a mancha do foco "largar" os cacos que já saíram
        // do cone. Em repouso P ≡ N e a expressão é a mesma de sempre.
        const dx0 = px - sp.Cx, dy0 = py - sp.Cy, dz0 = pz - sp.Cz;
        const along = dx0 * sp.Sx + dy0 * sp.Sy + dz0 * sp.Sz;
        const ex = dx0 - along * sp.Sx, ey = dy0 - along * sp.Sy, ez = dz0 - along * sp.Sz;
        const dist = Math.sqrt(ex * ex + ey * ey + ez * ez);

        // ---- F4 dots ----
        // cone ELEGÍVEL para ponto na parede, calculado ANTES do `continue` do glint
        // (index-v2.html:445-447) — a orla larga (coroa fraca do foco) também dá pontos, mesmo
        // quando `inCone` (glint) já é ~0. `rDot = sp.r·dm` alarga o raio do cone com `dotDensity`. ----
        if (emitDots) {
          const rDot = sp.r * dm;
          const dotCone = smooth(rDot, rDot * (1 - edge), dist);
          if (dotCone > 0.001 && T.dotHash < dotDensityLiveClamped) {
            const k2 = 2 * NdS;
            const Rx = k2 * nx - sp.Sx, Ry = k2 * ny - sp.Sy, Rz3 = k2 * nz3 - sp.Sz;
            // interseção de P + t·R com os 5 planos da sala implícita (só 3 candidatos: X, Y, Z-back —
            // câmara fica em +Z, sem plano "à frente"), t>0 mais próximo — index-v2.html:468-472.
            // P = a própria normal do tile (esfera de raio 1), no MUNDO, como nos feixes.
            // normal do plano ATINGIDO, com o sinal certo (aponta para dentro da sala, oposto à
            // parede) — não afeta `graze` (usa |N·R|, sign-independent) mas importa para `dots.js`
            // orientar o disco (translação = X + N·0.01) para o lado de dentro da sala.
            // F7: a origem do raio é `P` (em repouso P ≡ N) — com a bola partida, o ponto na
            // parede parte do estilhaço onde está agora, não de onde ele estava na esfera.
            let best = Infinity, nrmX = 0, nrmY = 0, nrmZ = 0;
            const txPos = Rx > 0;
            const tx = txPos ? (roomHalfW - px) / Rx : (-roomHalfW - px) / Rx;
            if (tx > 0 && tx < best) { best = tx; nrmX = txPos ? -1 : 1; nrmY = 0; nrmZ = 0; }
            const tyPos = Ry > 0;
            const ty = tyPos ? (roomCeil - py) / Ry : (roomFloor - py) / Ry;
            if (ty > 0 && ty < best) { best = ty; nrmX = 0; nrmY = tyPos ? -1 : 1; nrmZ = 0; }
            if (Rz3 < 0) {
              const tz = (roomBack - pz) / Rz3;
              if (tz > 0 && tz < best) { best = tz; nrmX = 0; nrmY = 0; nrmZ = 1; }
            }
            if (Number.isFinite(best) && best > 0) {
              const Xw = px + Rx * best, Yw = py + Ry * best, Zw = pz + Rz3 * best;
              // descarta se o ponto fica a < 0.6 raios da câmara (equivalente a `Z < camD − 0.6`,
              // mas em coordenadas do MUNDO: projeta no eixo bola→câmara em vez do Z de ecrã)
              const distToCam = Xw * cdx + Yw * cdy + Zw * cdz;
              if (distToCam < camD - 0.6 && dotCount < tiles.length) {
                // graze (|N·R̂|, ângulo rasante) recalcula-se em dots.js a partir de N/R — evita
                // guardar mais um float por ponto aqui.
                const d3 = dotCount * 3;
                dotX[d3] = Xw; dotX[d3 + 1] = Yw; dotX[d3 + 2] = Zw;
                dotN[d3] = nrmX; dotN[d3 + 1] = nrmY; dotN[d3 + 2] = nrmZ;
                dotR[d3] = Rx; dotR[d3 + 1] = Ry; dotR[d3 + 2] = Rz3;
                dotI[dotCount] = dotCone * (0.6 + 0.4 * dm) * NdS * sp.I / (1 + dotFalloffV * best * best);
                dotSize[dotCount] = T.dphi * dotScaleV;
                dotCount++;
              }
            }
          }
        }
        // ---- fim F4 dots ----

        const inCone = smooth(sp.r, sp.r * (1 - edge), dist);
        if (inCone <= 0.001) continue;
        if (facing > 0 && cpuGlint > 0) {                        // :457-460
          const NdH = nx * sp.Hx + ny * sp.Hy + nz3 * sp.Hz;
          const spec = NdH > 0 ? Math.pow(NdH, gK) : 0;
          gl += cpuGlint * mGain * inCone * Math.min(1.6, sp.I)
              * (1 - gSharp + gSharp * spec) * (0.55 + 0.45 * NdS);
        }

        // ---- feixe refletido (:462-465) — R = 2(N·S)N − S ----
        if (emitBeams && inCone > 0.3 && T.beamHash < beamFrac) {
          const k = 2 * NdS;
          const Rx = k * nx - sp.Sx, Ry = k * ny - sp.Sy, Rz3 = k * nz3 - sp.Sz;
          // R.z = componente na direção da câmara (mesma convenção do nz), não o z do mundo
          const Rz = Rx * cdx + Ry * cdy + Rz3 * cdz;
          if (facing > 0 || Rz < -0.05) {
            const Ival = inCone * NdS * sp.I * hazeE;
            if (Ival > 0 && beamRawCount < tiles.length) {
              const b3 = beamRawCount * 3;
              // P = ponto do tile na superfície = a própria normal (esfera de raio 1), no MUNDO.
              // F7: com a bola partida, `P` é o centro do estilhaço — o feixe nasce onde o caco
              // está e varre a sala com ele (fonte única: este loop).
              beamP[b3] = px; beamP[b3 + 1] = py; beamP[b3 + 2] = pz;
              beamR[b3] = Rx; beamR[b3 + 1] = Ry; beamR[b3 + 2] = Rz3;
              beamI[beamRawCount] = Ival;
              beamRawCount++;
            }
          }
        }
      }
      if (gl > 1) gl = 1;

      // ---- cadeia de cinza, na ordem exata (index-v2.html:641-652) ----
      let g;
      if (realTone) {
        // 'real': espelhos todos iguais — vertex color = 1 na base; a cadeia só aplica rim/volume/shade
        g = 1;
        g += rim * smooth(0.28, 0.0, nz);
        g -= 0.035 * smooth(0.05, 0.22, nz) * smooth(0.5, 0.25, nz);
        g *= 0.75 + 0.25 * nz;
        const kd = Math.max(0, nx * shadeD.x + ny * shadeD.y + nz3 * shadeD.z);
        g *= (1 - key) + key * (0.25 + 0.75 * kd);
      } else {
        const drift = drAmp * Math.sin(drW + T.driftPhase);
        g = (T.grey + drift) * (1 + litGain * lit);          // 1
        g += 0.45 * bLight;                                   // 2 (uniforme, ANTES do volume)
        g = mid + (g - mid) * contrast;                       // 3
        g += rim * smooth(0.28, 0.0, nz);                     // 4
        g -= 0.035 * smooth(0.05, 0.22, nz) * smooth(0.5, 0.25, nz); // 5
        g *= 0.75 + 0.25 * nz;                                // 6
        const kd = Math.max(0, nx * shadeD.x + ny * shadeD.y + nz3 * shadeD.z);
        g *= (1 - key) + key * (0.25 + 0.75 * kd);            // 7
      }
      if (nz > 0) { boneAcc += 0.4 + 0.6 * smooth(0.5, 0, nz); boneN++; }
      const val = clamp(g + gl * (1.0 - g) * 1.15, 0, 1);      // 8 (glint clareia aditivamente)
      // raio-X: só os tiles ativos persistem. F7: um estilhaço `dropped` (perto demais da câmara)
      // desaparece — equivalente ao `continue` da 2D, que simplesmente não o desenhava.
      const alpha = dropped ? 0 : lerp(op, 1, gl);
      T.val = val; T.alpha = alpha; T.lit = lit; T.glint = gl;

      /* ---- F7 explode: reescrever as posições e normais dos 4 vértices (index-v2.html:628-634)
         Cantos RELATIVOS a N0 (a posição em repouso menos a normal do centro), tombados pelo mesmo
         Rodrigues da normal, e levados para P. `restPos` é a cópia imutável do repouso: usar o
         buffer vivo realimentaria a explosão a cada frame. */
      if (exOn) {
        const N0x = T.nx, N0y = T.ny, N0z = T.nz;   // normal do centro em espaço da BOLA
        for (let k = 0; k < 4; k++) {
          const o = (vi + k) * 3;
          // canto relativo ao centro, ainda em espaço da bola
          const rx = restPos[o] - N0x, ry = restPos[o + 1] - N0y, rz = restPos[o + 2] - N0z;
          // roda para o mundo (Y por angleUsed), depois tomba pelo Rodrigues do tile
          const wx = rx * ca + rz * sa, wy = ry, wz = -rx * sa + rz * ca;
          rodriguesTo(rv, wx, wy, wz, exKx, exKy, exKz, exSA, exCA);
          // …e volta ao espaço da BOLA (a malha é filha de `root`, que já roda por angleUsed):
          // roda −angleUsed. O mesmo para o ponto final P e para a normal.
          const gx = px + rv[0], gy = py + rv[1], gz = pz + rv[2];
          positions[o] = gx * ca - gz * sa;
          positions[o + 1] = gy;
          positions[o + 2] = gx * sa + gz * ca;
          normals[o] = nx * ca - nz3 * sa;
          normals[o + 1] = ny;
          normals[o + 2] = nx * sa + nz3 * ca;
        }
      }

      const co = vi * 4;
      colors[co] = val; colors[co + 1] = val; colors[co + 2] = val; colors[co + 3] = alpha;
      colors[co + 4] = val; colors[co + 5] = val; colors[co + 6] = val; colors[co + 7] = alpha;
      colors[co + 8] = val; colors[co + 9] = val; colors[co + 10] = val; colors[co + 11] = alpha;
      colors[co + 12] = val; colors[co + 13] = val; colors[co + 14] = val; colors[co + 15] = alpha;
    }
    if (boneN > 0) boneNzTerm = boneAcc / boneN;
    /* ---- F7: um único upload de posições/normais por frame, SÓ enquanto a bola está partida.
       Quando `exOn` cai para false, restauram-se as posições de repouso UMA vez (`exWasOn`) — sem
       essa guarda a bola em idle pagava dois `updateVerticesData` por frame para nada. ---- */
    if (exOn) {
      mesh.updateVerticesData(BJS.VertexBuffer.PositionKind, positions, false, false);
      mesh.updateVerticesData(BJS.VertexBuffer.NormalKind, normals, false, false);
      exWasOn = true;
    } else if (exWasOn) {
      positions.set(restPos);
      for (let t = 0, vi = 0; t < tiles.length; t++, vi += 4) {
        const T = tiles[t];
        for (let k = 0; k < 4; k++) {
          const o = (vi + k) * 3;
          normals[o] = T.nx; normals[o + 1] = T.ny; normals[o + 2] = T.nz;
        }
      }
      mesh.updateVerticesData(BJS.VertexBuffer.PositionKind, positions, false, false);
      mesh.updateVerticesData(BJS.VertexBuffer.NormalKind, normals, false, false);
      exWasOn = false;
    }
    mesh.updateVerticesData(BJS.VertexBuffer.ColorKind, colors, false, false);
    finalizeBeams();
    dots.count = dotCount;   // F4: nenhuma ordenação/truncagem — dots.js já degrada via dotDensityLive
  }

  /* ================= knobs PBR / opacidade ================= */
  function syncMaterial(E) {
    mat.metallic = clamp(num(C.mirrorMetallic, BALL_DEFAULTS.mirrorMetallic), 0, 1);
    mat.roughness = clamp(num(C.mirrorRoughness, BALL_DEFAULTS.mirrorRoughness), 0.01, 1);
    mat.environmentIntensity = Math.max(0, num(C.envIntensity, BALL_DEFAULTS.envIntensity));
    const op = clamp(num((E && E.sphereOpacity), num(cfg('sphereOpacity'), 1)), 0, 1);
    // vertex alpha só conta se o material aceitar transparência
    const wantAlpha = op < 0.995;
    if (mat.transparencyMode !== (wantAlpha ? BJS.PBRMaterial.MATERIAL_ALPHABLEND : BJS.PBRMaterial.MATERIAL_OPAQUE)) {
      mat.transparencyMode = wantAlpha ? BJS.PBRMaterial.MATERIAL_ALPHABLEND : BJS.PBRMaterial.MATERIAL_OPAQUE;
    }
    syncCoreMat();   // núcleo segue tileTone/seamDarkness/seamGreyReal ao vivo
    // núcleo escuro: visível na medida da opacidade (com op=0 não há "interior" a tapar o osso).
    // F7 (:610-611): o núcleo desfaz-se com a bola — `visibility · (1 − exS)`; a s=1 não sobra
    // nenhuma esfera no meio dos estilhaços.
    const coreVis = op * (1 - exS);
    core.setEnabled(coreVis > 0.02);
    if (core.visibility !== coreVis) core.visibility = coreVis;
    // malha osso: meshAlpha = (1−op)·0.45 · <(0.4+0.6·smooth(0.5,0,nz))> (nz médio — ver PARITY)
    if (bone) {
      const ma = (1 - op) * 0.45 * Math.max(0, num(cfg('boneAlphaMul'), 1)) * boneNzTerm;
      // F7: o osso é UM LineSystem construído sobre as posições de REPOUSO (não é atualizado por
      // frame). Com a bola meio partida ficaria uma gaiola esférica fantasma no sítio antigo —
      // por isso desliga-se a partir de metade da explosão (divergência documentada, PARITY §1.14).
      const onB = ma > 0.01 && exS <= 0.5;
      if (bone.isEnabled() !== onB) bone.setEnabled(onB);
      if (onB) { bone.alpha = clamp(ma, 0, 1); if (bone.material) bone.material.alpha = bone.alpha; }
    }
  }

  /* ================= rebuild / update ================= */
  function rebuild() {
    buildTiles();
    buildMesh();
    buildBone();
    buildChain();
    allocBeams(tiles.length);   // capacidade dos feixes segue o nº de tiles (F3)
    allocDots(tiles.length);    // capacidade dos pontos na parede segue o nº de tiles (F4)
    computeTileWidth();
    lastColorT = -1;
    return tiles.length;
  }

  let lastUpdateT = -1;
  function update(tSec, spots, E) {
    const t = Number.isFinite(tSec) ? tSec : 0;
    // dt clampado a 50 ms (:337 usa dtMs do rAF; aqui derivamos do relógio recebido)
    let dt = (lastUpdateT < 0) ? 0 : (t - lastUpdateT);
    if (!(dt >= 0)) dt = 0;
    if (dt > 0.05) dt = 0.05;
    lastUpdateT = t;

    const rpm = num((E && E.rotationRpm), num(cfg('rotationRpm'), 1));
    angle += (rpm / 60) * TAU * dt;
    if (angle > TAU) angle -= TAU * Math.floor(angle / TAU);

    /* ---- F7 explode: lê o escalar do frame (a máquina de estados vive em explode.js) ----
       `angleUsed = angle + (angle0 − angle)·exS` (:369): no estoiro a rotação congela no ângulo
       do momento; no rewind volta a apanhar a rotação viva sem salto, porque é função pura de exS. */
    exS = clamp(num(E && E.exS, 0), 0, 1);
    exOn = exS > 0.0005;
    exFloat = exOn ? Math.max(0, num(E && E.exFloat, 0)) : 0;
    const a0 = num(E && E.angle0, angle);
    angleUsed = exOn ? angle + (a0 - angle) * exS : angle;
    root.rotation.y = angleUsed;

    // cadeia primeiro (produz `boneNzTerm` e os spots montados), material/osso depois
    // F7: com a bola partida a cadeia CPU corre a cada frame (não a COLOR_HZ) — os estilhaços
    // movem-se depressa e a 20 Hz o reflexo/feixes ficavam a saltar atrás da geometria.
    if (exOn || lastColorT < 0 || (t - lastColorT) >= (1 / COLOR_HZ)) {
      lastColorT = t;
      computeColors(t, spots, E);
      updateChainTone();   // depende de mountedSpots, que computeColors acabou de montar
    }
    syncMaterial(E);
  }

  rebuild();

  return {
    get mesh() { return mesh; },
    core,
    root,
    get bone() { return bone; },
    /* Corrente 3D (topo → teto). NÃO é filha de `root` (não roda com a bola) nem entra no probe. */
    get chain() { return chain; },
    get chainHook() { return chainHook; },
    get chainCount() { return chainCount; },
    /* FONTE DE VERDADE dos focos (F2): preenchido a cada passagem da cadeia a partir de CONFIG.spots
       com fade/spotFadeMix/spotGain/spotsOn/spotCount já aplicados. O main.js deve posicionar as
       SpotLight a partir DAQUI (não recalcular az/el/I), para a mancha CPU e a luz PBR baterem certo.
       [{ az, el, S:[x,y,z] (bola→foco, unit), H, C:[x,y,z] (desvio de mira), r, I, isFlash }]
       F5: os FLASHES da coreografia vêm a seguir aos focos (mesmo formato, `isFlash: true`, raio
       já sem `spotRadiusMul`); o `main.js` precisa de `CONFIG.spots.length + flashSlots + 2`
       SpotLights para os cobrir a todos. */
    mountedSpots,
    /* Luz indireta a deambular (:386): [{ az, el, I }] — o main.js coloca aqui as RectAreaLight. */
    ambientPoses,
    /* Checkboxes "spot i" do painel (index-v2.html:248). Escrever `ball.spotsOn[i] = false` desliga. */
    spotsOn,
    /* FEIXES (F3) — fonte para `beams.js`. Preenchido a cada passagem da cadeia (20 Hz), JÁ ordenado
       por I desc e truncado a `beamMaxCount`. `P`/`R` são Float32Array xyz (3 floats por feixe, no
       espaço do MUNDO, com a rotação da bola já aplicada), `I` um float por feixe. Os arrays são
       PRÉ-ALOCADOS e reutilizados — lê sempre só `0 .. count-1` e nunca guardes referências a slots. */
    beams,
    /* Largura média de um tile em raios da bola — base do cone do feixe (`tileRad` de :565). */
    get tileWidth() { return tileWidth; },
    /* PONTOS NA PAREDE (F4) — fonte para `v2/dots.js`. Preenchido a cada passagem da cadeia (20 Hz).
       `X`/`N`/`R` são Float32Array xyz (3 floats por ponto, no espaço do MUNDO): `X` = posição do
       ponto na parede, `N` = normal do plano atingido, `R` = direção do feixe refletido (unit).
       `I`/`size` um float por ponto. Arrays PRÉ-ALOCADOS — lê sempre só `0 .. count-1`. */
    dots,
    /* Degradação adaptativa (§6): o `main.js` escreve aqui a cada frame (0..CONFIG.dotDensity). */
    get dotDensityLive() { return dotDensityLiveVal; },
    set dotDensityLive(v) { if (Number.isFinite(v)) dotDensityLiveVal = v; },
    material: mat,
    tiles,
    rebuild,
    update,
    attachProbe,
    refreshProbe,
    get probe() { return probe; },
    get angle() { return angle; },
    set angle(v) { if (Number.isFinite(v)) { angle = v; root.rotation.y = v; } },
    get tileCount() { return tiles.length; },
  };
}

export default createBall;
