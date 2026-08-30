// v2/incident.js — cone incidente (Fase 3, Sonnet): o eixo de névoa que CHEGA à bola, da fonte (fora de
// campo) até ao limbo, ANTES de bater. Fiel a web/index-v2.html:498-552 (docs/parity-canvas2d.md §1.7).
//
// Divergência documentada (PARITY §1.7): a Canvas 2D desenha em screen-space (quads 2D com recorte
// evenodd contra o disco projetado); aqui é geometria 3D real — 3 cones aninhados (tronco quase
// cilíndrico, `h0≈h1` como no original) alinhados com o eixo fonte→bola, terminando exatamente à
// superfície da esfera (raio 1). "Morre no limbo" sai de graça: o depth test contra a bola (mesh sólido,
// depth write on) tapa a parte do cone que ficaria "por baixo" do disco a partir da câmara — não precisa
// de clip evenodd. O gradiente ~1/d² ao longo do eixo é vertex color (5 paragens, mesmos valores do
// original) em vez de canvas gradient.
//
// createIncident(scene, CONFIG) -> { update(mountedSpots, E, camera) }

// 3 cones aninhados: larguras relativas e alphas por camada (verbatim :513)
const IN_WID = [1.0, 0.55, 0.26];
const IN_AW = [0.28, 0.34, 0.46];

// gradiente 5 paragens ao longo do eixo (fonte -> limbo), verbatim :540-544 (valores de alpha
// relativos a `a`; aqui viram vertex alpha 0..1, o `a` final entra como alpha do vertexColor).
const GRAD_STOPS = [
  { t: 0.00, a: 0 },
  { t: 0.45, a: 0.06 },
  { t: 0.75, a: 0.24 },
  { t: 0.93, a: 0.72 },
  { t: 1.00, a: 1.00 },
];

const RADIAL_SEGMENTS = 10; // secção do tronco (barato — só a névoa, não precisa de mais)

function num(v, d) { return Number.isFinite(v) ? v : d; }

// Constrói UM tronco de cone unitário ao longo de +Z, base em z=0 (fonte, alpha 0) até z=1 (limbo,
// alpha do gradiente), raio 1 em toda a extensão (o achatamento h0/h1 entra por escala não-uniforme
// no update, tal como o original faz per-frame). Vertex alpha do gradiente já cozido nos vértices —
// não recalculado por frame (só a matriz muda).
function buildTaperedTube(name, scene) {
  const positions = [];
  const indices = [];
  const colors = []; // rgba por vértice — usa-se só o canal alpha (rgb fica branco, greyscale)
  const ringCount = GRAD_STOPS.length;

  for (let r = 0; r < ringCount; r++) {
    const stop = GRAD_STOPS[r];
    const z = stop.t;
    for (let s = 0; s < RADIAL_SEGMENTS; s++) {
      const ang = (s / RADIAL_SEGMENTS) * Math.PI * 2;
      positions.push(Math.cos(ang), Math.sin(ang), z);
      colors.push(1, 1, 1, stop.a);
    }
  }
  // tampa final (z=1) fechada num ponto central para não ver um disco duro no limbo — na prática fica
  // tapada pela bola (depth test), mas evita um anel aberto se algum ângulo de câmara escapar à esfera.
  const capIndex = positions.length / 3;
  positions.push(0, 0, 1);
  colors.push(1, 1, 1, GRAD_STOPS[ringCount - 1].a);

  for (let r = 0; r < ringCount - 1; r++) {
    for (let s = 0; s < RADIAL_SEGMENTS; s++) {
      const s2 = (s + 1) % RADIAL_SEGMENTS;
      const a = r * RADIAL_SEGMENTS + s, b = r * RADIAL_SEGMENTS + s2;
      const c = (r + 1) * RADIAL_SEGMENTS + s, d = (r + 1) * RADIAL_SEGMENTS + s2;
      indices.push(a, c, b, b, c, d);
    }
  }
  // tampa
  const lastRing = (ringCount - 1) * RADIAL_SEGMENTS;
  for (let s = 0; s < RADIAL_SEGMENTS; s++) {
    const s2 = (s + 1) % RADIAL_SEGMENTS;
    indices.push(lastRing + s, lastRing + s2, capIndex);
  }

  const mesh = new BABYLON.Mesh(name, scene);
  const vd = new BABYLON.VertexData();
  vd.positions = positions;
  vd.indices = indices;
  vd.colors = colors;
  // normais não interessam (sem luz), mas o VertexData.applyToMesh reclama se faltarem para alguns
  // pipelines — computa umas normais baratas (não usadas pelo shader unlit).
  const normals = [];
  BABYLON.VertexData.ComputeNormals(positions, indices, normals);
  vd.normals = normals;
  vd.applyToMesh(mesh, false);
  mesh.hasVertexAlpha = true; // o alpha do vertex color (gradiente ~1/d²) entra no material
  return mesh;
}

function makeIncidentMaterial(scene) {
  const mat = new BABYLON.StandardMaterial('incidentMat', scene);
  mat.disableLighting = true;
  mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
  mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
  mat.specularColor = new BABYLON.Color3(0, 0, 0);
  mat.alpha = 1; // o alpha real vem do vertex color × ALPHA_ADD
  mat.alphaMode = BABYLON.Engine.ALPHA_ADD;
  mat.backFaceCulling = false;
  mat.needDepthPrewarm = false;
  mat.disableDepthWrite = true; // não escreve profundidade — não pode tapar a bola nem outros cones
  mat.useVertexColor = true; // vertex color (rgb=branco) entra no emissive; alpha do vertex vem do mesh.hasVertexAlpha
  return mat;
}

export function createIncident(scene, CONFIG) {
  const N = CONFIG.spots.length;
  const mat = makeIncidentMaterial(scene);
  // 3 cones aninhados por spot, pré-criados, nunca destruídos — só setEnabled/matriz por frame.
  const layers = []; // layers[spotIdx][w] = mesh
  for (let i = 0; i < N; i++) {
    const perSpot = [];
    for (let w = 0; w < IN_WID.length; w++) {
      const mesh = buildTaperedTube(`incident_${i}_${w}`, scene);
      mesh.material = mat;
      mesh.isPickable = false;
      mesh.doNotSyncBoundingInfo = true;
      mesh.alwaysSelectAsActiveMesh = true; // gira/escala todos os frames — evita recomputar bounding a mais
      mesh.renderingGroupId = 0;
      mesh.setEnabled(false);
      perSpot.push(mesh);
    }
    layers.push(perSpot);
  }

  const ZAXIS = new BABYLON.Vector3(0, 0, 1);
  const tmpDir = new BABYLON.Vector3();
  const tmpQuat = new BABYLON.Quaternion();

  function update(mountedSpots, E, camera) {
    const haze = num(E && E.haze, CONFIG.haze);
    // posição real da câmara (ArcRotateCamera orbita com o rato) — atualizada uma vez por frame, não
    // por spot; usa-se globalPosition (já computada pelo motor no fim do frame anterior).
    const cp = (camera && camera.globalPosition) || (camera && camera.position) || { x: 0, y: 0, z: CONFIG.camDistance };
    const spots = mountedSpots || [];
    for (let i = 0; i < N; i++) {
      const perSpot = layers[i];
      const sp = spots[i];
      let show = false;
      if (sp && sp.S && !sp.wide) {
        show = setupSpot(perSpot, sp, haze, cp);
      }
      if (!show) for (let w = 0; w < perSpot.length; w++) perSpot[w].setEnabled(false);
    }
  }

  // devolve true se desenhou (pelo menos alpha0 > teto mínimo e geometria válida)
  function setupSpot(perSpot, sp, haze, camPos) {
    const I = num(sp.I, 0);
    // a0 = incidentAlpha·E.haze·min(1,I) — verbatim :517 (sem exS/dk: Fase 3 não tem explosão nem skin
    // dark/white ligados ainda; ficam ⚠ documentados em PARITY quando essas fases existirem).
    const a0 = CONFIG.incidentAlpha * haze * Math.min(1, I);
    if (!(a0 >= 0.002)) return false;

    // S = direção bola->fonte (unitário); C = offset de mira (aim), já em raios, pequeno.
    const S = sp.S, C = sp.C || [0, 0, 0];
    const cc = Math.hypot(C[0], C[1], C[2]);
    const tIn = Math.sqrt(Math.max(0, 1 - cc * cc)); // entrada do eixo na esfera (:519)
    if (!Number.isFinite(tIn)) return false;
    const hit = [C[0] + S[0] * tIn, C[1] + S[1] * tIn, C[2] + S[2] * tIn];
    const far = CONFIG.incidentLen;
    const src = [hit[0] + S[0] * far, hit[1] + S[1] * far, hit[2] + S[2] * far];

    // não desenhar se a fonte cai perto/atrás da câmara (:523) — o original testa `src.z > camD-2.5`
    // no espaço de câmara fixa em +Z; aqui a câmara orbita, então usa-se a distância euclidiana real
    // fonte↔câmara como equivalente 3D (mesmo limiar, divergência assumida — ver PARITY §1.7).
    const distSrcCam = Math.hypot(src[0] - camPos.x, src[1] - camPos.y, src[2] - camPos.z);
    if (distSrcCam < 2.5) return false;

    const axisLen = far; // comprimento do eixo em raios (hit -> src)
    if (!(axisLen > 1e-4)) return false;

    // meia-largura: teto relativo (hRef·incidentMaxWidth) e teto absoluto (incidentMaxPx raios) — vence
    // o menor (:532-535). Em 3D não há Rpx/projeção: hRef = raio da mancha na bola (já em raios, sp.r),
    // e incidentMaxPx é diretamente uma fração do raio da bola (=1) — ver comentário de CONFIG.
    const hRef = sp.r;
    const cap = Math.min(hRef * CONFIG.incidentMaxWidth, CONFIG.incidentMaxPx);
    const halfWidth = Math.min(hRef, cap);
    if (!(halfWidth > 1e-5)) return false;

    // orientação: eixo unitário do cone unitário é +Z local; alinha com (src -> hit), ou seja -S.
    tmpDir.set(-S[0], -S[1], -S[2]);
    if (tmpDir.lengthSquared() < 1e-10) return false;
    tmpDir.normalize();
    BABYLON.Quaternion.FromUnitVectorsToRef(ZAXIS, tmpDir, tmpQuat);

    for (let w = 0; w < perSpot.length; w++) {
      const mesh = perSpot[w];
      const a = a0 * IN_AW[w];
      if (!(a >= 0.002)) { mesh.setEnabled(false); continue; }
      const width = halfWidth * IN_WID[w];
      mesh.setEnabled(true);
      mesh.position.set(src[0], src[1], src[2]);
      mesh.rotationQuaternion = mesh.rotationQuaternion || new BABYLON.Quaternion();
      mesh.rotationQuaternion.copyFrom(tmpQuat);
      mesh.scaling.set(width, width, axisLen);
      // alpha global desta camada entra multiplicando o vertex alpha via visibility (barato, sem
      // reescrever o buffer de cor por frame — o gradiente relativo já está cozido nos vértices).
      mesh.visibility = Math.min(1, a);
    }
    return true;
  }

  return { update };
}
