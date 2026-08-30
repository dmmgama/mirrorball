// v2/beams.js — feixes refletidos (Fase 3, Opus). Fiel a web/index-v2.html:553-603 + :683
// (docs/parity-canvas2d.md §1.6). A FONTE (que tiles emitem, com que R e que I) é do `ball.js`
// (`ball.beams` = {count, P, R, I}, já ordenada por I desc e truncada a `beamMaxCount`); aqui só
// se DESENHA.
//
// Estrutura: 3 cones aninhados por feixe (as 3 larguras/alphas de :562) como **thin instances** de
// UM cone unitário — 3 draw calls no total, independentemente de haver 1 ou 110 feixes. Mais um
// mesh de disco billboard para os feixes que vêm direitos à câmara (`beamGlowZ`, :570).
//
// Divergências documentadas em PARITY §1.6:
//  - o gradiente ao longo do feixe é **vertex alpha do cone** (1 na base → 0 na ponta), cozido na
//    geometria uma vez, em vez do `createLinearGradient` por feixe por frame da Canvas 2D;
//  - o leque em perspetiva sai do próprio 3D (o cone afasta-se da câmara), não do cálculo
//    `wEnd = L3·Rpx·pe[2]` em screen-space;
//  - a base do cone leva ainda o knob `beamBaseMul` (default 0.5): o original desenha um TRONCO
//    (base `wStart`, ponta `hE`) e aqui é um cone escalado — sem o corte a base lia-se "gorda";
//  - a ordenação front/back (:601, :683) não é precisa: com `ALPHA_ADD` + sem depth write a ordem
//    de composição é irrelevante (a soma é comutativa) — ver PARITY.
//
// createBeams(scene, CONFIG, ball) -> { update(E), mesh }

const BJS = (typeof BABYLON !== 'undefined') ? BABYLON : (typeof globalThis !== 'undefined' ? globalThis.BABYLON : undefined);

const D2R = Math.PI / 180;

function num(v, d) { return Number.isFinite(v) ? v : d; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function smooth(e0, e1, x) { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }

// teto inviolável da regra 6: nenhum feixe passa de 0.18 de alpha, venha o CONFIG de onde vier
const BEAM_INTENSITY_MAX = 0.18;

const RADIAL = 8;        // secções do cone (é névoa: mais do que isto não se vê e custa)
const GLOW_SEG = 12;     // secções do disco de glow

/* Cone unitário ao longo de +Z: base (raio 1) em z=0, ponta em z=1.
   O gradiente ao longo do feixe (1 na base → 0 na ponta) vai na coordenada **UV.y** e sai por uma
   `opacityTexture` (ver `makeFogMat`), NÃO por vertex color: o vertex color colide com o
   `instanceColor` das thin instances — o Babylon define `VERTEXCOLOR` **e** `INSTANCESCOLOR`, gera
   `vColor *= instanceColor` e numa das variantes que tenta compilar o atributo ainda não está
   declarado → `VERTEX SHADER ERROR: 'instanceColor': undeclared identifier` na consola (o efeito
   acaba por compilar e a imagem sai certa, mas o erro fica). Sem vertex color não há colisão.
   O original tem 3 paragens (1 → 0.55 a 35% → 0 na ponta, `:580-582`); ficam nas UV. */
function buildCone(name, scene) {
  const positions = [], indices = [], uvs = [];
  const rings = [
    { z: 0.00, r: 1.0, a: 1.00 },
    { z: 0.35, r: 0.65, a: 0.55 },
    { z: 1.00, r: 0.0, a: 0.00 },
  ];
  for (const R of rings) {
    for (let i = 0; i < RADIAL; i++) {
      const th = (i / RADIAL) * Math.PI * 2;
      positions.push(Math.cos(th) * R.r, Math.sin(th) * R.r, R.z);
      uvs.push(0.5, R.a);          // v = alpha do gradiente; a textura é 1D (vertical)
    }
  }
  for (let s = 0; s < rings.length - 1; s++) {
    const a0 = s * RADIAL, a1 = (s + 1) * RADIAL;
    for (let i = 0; i < RADIAL; i++) {
      const j = (i + 1) % RADIAL;
      indices.push(a0 + i, a0 + j, a1 + i);
      indices.push(a0 + j, a1 + j, a1 + i);
    }
  }
  const mesh = new BJS.Mesh(name, scene);
  const vd = new BJS.VertexData();
  vd.positions = positions; vd.indices = indices; vd.uvs = uvs;
  BJS.VertexData.ComputeNormals(positions, indices, []);
  vd.applyToMesh(mesh, false);
  return mesh;
}

/* Rampa vertical branca→preta (256×1) usada como `opacityTexture`: v=1 opaco, v=0 transparente.
   É o gradiente ao longo do feixe / o falloff radial do glow, conforme as UV de cada mesh. */
function makeRampTexture(scene) {
  const dt = new BJS.DynamicTexture('beamRamp', { width: 4, height: 256 }, scene, false);
  const ctx = dt.getContext();
  const g = ctx.createLinearGradient(0, 255, 0, 0);   // v=0 em baixo (transparente) → v=1 em cima
  g.addColorStop(0, '#000'); g.addColorStop(1, '#fff');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 256);
  dt.update();
  // ARMADILHA 4 da referência: sem estes dois o gradiente é ignorado e os cones saem sólidos
  dt.hasAlpha = true;
  dt.getAlphaFromRGB = true;
  dt.wrapU = dt.wrapV = BJS.Texture.CLAMP_ADDRESSMODE;
  return dt;
}

/* Disco billboard para o glow (:570-577): raio 1 no plano XY, vertex alpha radial
   1 no centro → 0 na borda, com a paragem a 0.35 do original. */
function buildGlowDisc(name, scene) {
  const positions = [0, 0, 0], indices = [], uvs = [0.5, 1];   // centro: v=1 (opaco)
  const rings = [{ r: 0.35, a: 0.389 }, { r: 1.0, a: 0.0 }];  // 0.35/0.9 = 0.389 (relativo ao pico)
  for (const R of rings) {
    for (let i = 0; i < GLOW_SEG; i++) {
      const th = (i / GLOW_SEG) * Math.PI * 2;
      positions.push(Math.cos(th) * R.r, Math.sin(th) * R.r, 0);
      uvs.push(0.5, R.a);
    }
  }
  // leque centro → 1º anel
  for (let i = 0; i < GLOW_SEG; i++) indices.push(0, 1 + i, 1 + ((i + 1) % GLOW_SEG));
  // 1º anel → 2º anel
  for (let i = 0; i < GLOW_SEG; i++) {
    const j = (i + 1) % GLOW_SEG;
    indices.push(1 + i, 1 + GLOW_SEG + i, 1 + j);
    indices.push(1 + j, 1 + GLOW_SEG + i, 1 + GLOW_SEG + j);
  }
  const mesh = new BJS.Mesh(name, scene);
  const vd = new BJS.VertexData();
  vd.positions = positions; vd.indices = indices; vd.uvs = uvs;
  BJS.VertexData.ComputeNormals(positions, indices, []);
  vd.applyToMesh(mesh, false);
  return mesh;
}

// material de névoa aditiva: sem luz, branco, ALPHA_ADD, sem escrita de depth (§7 da referência).
// O gradiente vem da `opacityTexture` (rampa nas UV) e a intensidade por feixe do `instanceColor`.
function makeFogMat(name, scene, ramp) {
  const m = new BJS.StandardMaterial(name, scene);
  m.disableLighting = true;
  m.emissiveColor = new BJS.Color3(1, 1, 1);
  m.diffuseColor = new BJS.Color3(0, 0, 0);
  m.specularColor = new BJS.Color3(0, 0, 0);
  m.opacityTexture = ramp;         // v=1 base opaca → v=0 ponta transparente
  m.alphaMode = BJS.Engine.ALPHA_ADD;
  m.disableDepthWrite = true;      // névoa não tapa névoa de trás
  m.backFaceCulling = false;
  // `alphaMode ALPHA_ADD` sozinho NÃO põe o material na fila de transparência: o Babylon decide
  // pelo `needAlphaBlending()`. Com `opacityTexture` já responde true, mas força-se para não
  // depender de heurística.
  m.needAlphaBlending = () => true;
  return m;
}

export function createBeams(scene, CONFIG, ball) {
  if (!BJS) throw new Error('beams.js: BABYLON global não encontrado');
  const C = CONFIG || {};
  const cfg = (k, d) => {
    const v = C[k];
    return (v !== undefined && v !== null) ? v : d;
  };

  const ramp = makeRampTexture(scene);
  const mat = makeFogMat('beamMat', scene, ramp);
  const glowMat = makeFogMat('beamGlowMat', scene, ramp);

  // 3 camadas aninhadas: cada uma é UM mesh com thin instances (3 draw calls no total)
  const LAYERS = 3;
  const layers = [];
  for (let i = 0; i < LAYERS; i++) {
    const m = buildCone('beamCone' + i, scene);
    m.material = mat;
    m.isPickable = false;
    m.alwaysSelectAsActiveMesh = true;   // nunca cair fora do frustum por bounding stale
    m.thinInstanceEnablePicking = false;
    m.renderingGroupId = 1;              // depois da bola (a bola é grupo 0)
    layers.push(m);
  }
  const glow = buildGlowDisc('beamGlow', scene);
  glow.material = glowMat;
  glow.isPickable = false;
  glow.alwaysSelectAsActiveMesh = true;
  glow.thinInstanceEnablePicking = false;
  glow.renderingGroupId = 1;

  /* ---- buffers pré-alocados (nada de alocar por frame) ----
     capacidade = beamMaxCount do CONFIG, com folga para o David subir o knob em runtime. */
  let cap = 0;
  let mBuf = [], cBuf = [];     // por camada: Float32Array de matrizes / cores
  let gMat = null, gCol = null; // glow
  function ensureCap(n) {
    if (n <= cap) return;
    const first = cap === 0;
    cap = Math.max(16, n * 2);
    mBuf = []; cBuf = [];
    for (let i = 0; i < LAYERS; i++) {
      mBuf.push(new Float32Array(cap * 16));
      cBuf.push(new Float32Array(cap * 4));
    }
    gMat = new Float32Array(cap * 16);
    gCol = new Float32Array(cap * 4);
    // os Float32Array mudaram de identidade: se as camadas já existem, voltar a registá-los
    if (!first && layers.length) {
      for (let i = 0; i < LAYERS; i++) {
        layers[i].thinInstanceSetBuffer('matrix', mBuf[i], 16, false);
        layers[i].thinInstanceSetBuffer('instanceColor', cBuf[i], 4, false);
      }
      glow.thinInstanceSetBuffer('matrix', gMat, 16, false);
      glow.thinInstanceSetBuffer('instanceColor', gCol, 4, false);
    }
  }
  ensureCap(Math.max(16, Math.round(num(C.beamMaxCount, 110))));

  /* Regista os buffers de instância UMA vez, aqui na construção, com contagem 0.
     Se só forem registados no primeiro `update()`, o Babylon chega a tentar compilar o shader num
     frame em que já pôs `#define INSTANCESCOLOR` mas o atributo `instanceColor` ainda não existe —
     e cospe `VERTEX SHADER ERROR: 'instanceColor': undeclared identifier` na consola. O efeito
     acaba por compilar no frame seguinte (o render sai certo), mas o erro fica lá: registar já
     evita-o de todo. */
  for (let i = 0; i < LAYERS; i++) {
    layers[i].thinInstanceSetBuffer('matrix', mBuf[i], 16, false);
    layers[i].thinInstanceSetBuffer('instanceColor', cBuf[i], 4, false);
    layers[i].thinInstanceCount = 0;
  }
  glow.thinInstanceSetBuffer('matrix', gMat, 16, false);
  glow.thinInstanceSetBuffer('instanceColor', gCol, 4, false);
  glow.thinInstanceCount = 0;

  /* ---- objetos reutilizados no loop (contrato: nunca alocar por feixe) ---- */
  const vP = new BJS.Vector3();       // posição do feixe (mundo)
  const vR = new BJS.Vector3();       // direção R (unit)
  const vAxis = new BJS.Vector3();    // eixo da rotação from-to
  const qRot = new BJS.Quaternion();
  const mScale = BJS.Matrix.Identity();
  const mRot = BJS.Matrix.Identity();
  const mOut = BJS.Matrix.Identity();
  const Z = new BJS.Vector3(0, 0, 1); // eixo nativo do cone
  const camDir = new BJS.Vector3(0, 0, 1);

  /* Quaternion que leva +Z a `d` (unit), sem alocar. Caso degenerado (d ≈ −Z) tratado à parte:
     `Vector3.Cross` de vetores antiparalelos dá zero e o quaternion sairia NaN — o bug clássico. */
  function quatFromZTo(d, out) {
    const dot = d.z;                          // Z·d, com Z = (0,0,1)
    if (dot > 0.999999) { out.set(0, 0, 0, 1); return out; }
    if (dot < -0.999999) { out.set(1, 0, 0, 0); return out; }  // 180° em torno de X
    // eixo = Z × d
    vAxis.set(-d.y, d.x, 0);
    const s = Math.sqrt((1 + dot) * 2), inv = 1 / s;
    out.set(vAxis.x * inv, vAxis.y * inv, vAxis.z * inv, s * 0.5);
    return out;
  }

  let lastCount = 0, lastGlow = 0;

  function update(E) {
    const eff = E || {};
    const src = ball && ball.beams;
    const n0 = (src && Number.isFinite(src.count)) ? src.count : 0;

    // teto do alpha por feixe (regra 6) — clamp na LEITURA, o CONFIG não pode furá-lo
    const bInt = clamp(num(cfg('beamIntensity', 0.16), 0.16), 0, BEAM_INTENSITY_MAX);
    if (n0 <= 0 || bInt <= 0) {
      if (lastCount) { for (const m of layers) m.thinInstanceCount = 0; lastCount = 0; }
      if (lastGlow) { glow.thinInstanceCount = 0; lastGlow = 0; }
      return;
    }
    ensureCap(n0);

    const soft = clamp(num(cfg('beamSoft', 0.5), 0.5), 0, 1);
    // larguras/alphas de :562 — `beamWidthDeg` em GRAUS no CONFIG, como na Canvas 2D
    const wOuter = num(cfg('beamWidthDeg', 0.7), 0.7) * D2R * lerp(0.45, 1.8, soft);
    const widths = [wOuter, wOuter * 0.55, wOuter * 0.22];
    const aw = [lerp(0.04, 0.34, soft), lerp(0.12, 0.34, soft), lerp(0.84, 0.32, soft)];
    // comprimento em raios: `beamLen3D · beamLength / 0.78` (:568), knob `beamLen` a sobrepor-se
    const L3 = Math.max(0.05, num(cfg('beamLen', num(cfg('beamLen3D', 3.6), 3.6) * num(cfg('beamLength', 0.78), 0.78) / 0.78), 6));
    const glowZ = clamp(num(cfg('beamGlowZ', 0.8), 0.8), 0.01, 0.999);
    // base do cone = largura de um tile em raios (:565), com o afinamento do laser (:583),
    // vezes o knob `beamBaseMul` (default 0.5): o David achou os cones "muito gordos" na base.
    const baseMul = clamp(num(cfg('beamBaseMul', 0.5), 0.5), 0.1, 2);
    const baseR = 0.45 * Math.max(1e-4, num(ball && ball.tileWidth, Math.PI / 48)) * lerp(0.5, 1, soft) * baseMul;

    // direção bola→câmara (para o R.z, mesma convenção do ball.js)
    const cam = scene.activeCamera;
    if (cam && cam.globalPosition) {
      const p = cam.globalPosition, l = Math.hypot(p.x, p.y, p.z) || 1;
      camDir.set(p.x / l, p.y / l, p.z / l);
    } else camDir.set(0, 0, 1);

    const P = src.P, R = src.R, I = src.I;
    let nCone = 0, nGlow = 0;

    for (let i = 0; i < n0; i++) {
      const i3 = i * 3;
      const px = P[i3], py = P[i3 + 1], pz = P[i3 + 2];
      let rx = R[i3], ry = R[i3 + 1], rz = R[i3 + 2];
      const Iv = I[i];
      // guarda: um NaN aqui produzia uma matriz NaN e a instância desaparecia (ou pior) em silêncio
      if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) continue;
      if (!Number.isFinite(rx) || !Number.isFinite(ry) || !Number.isFinite(rz)) continue;
      if (!Number.isFinite(Iv) || Iv <= 0) continue;
      const rl = Math.hypot(rx, ry, rz);
      if (!(rl > 1e-6)) continue;
      rx /= rl; ry /= rl; rz /= rl;

      // base = clamp(I)·beamIntensity·smooth(0,6,nb−i) — os últimos esbatem (:600)
      const base = clamp(Iv, 0, 1) * bInt * smooth(0, 6, n0 - i);
      if (base <= 0.0005) continue;

      // R.z = componente na direção da câmara (:570 usa R[2] com a câmara em +Z)
      const Rz = rx * camDir.x + ry * camDir.y + rz * camDir.z;

      if (Rz > glowZ) {
        // vem quase direito a nós: brilho no espelho, não linha (:570-577)
        const rad = 0.02 + 0.10 * (Rz - glowZ) / (1 - glowZ);
        // billboard: encara sempre a câmara
        BJS.Matrix.ScalingToRef(rad, rad, rad, mScale);
        quatFromZTo(camDir, qRot);
        BJS.Matrix.FromQuaternionToRef(qRot, mRot);
        mScale.multiplyToRef(mRot, mOut);
        mOut.setTranslationFromFloats(px, py, pz);
        mOut.copyToArray(gMat, nGlow * 16);
        const gc = nGlow * 4, a = base * 0.9;
        gCol[gc] = gCol[gc + 1] = gCol[gc + 2] = 1;
        gCol[gc + 3] = a;
        nGlow++;
        continue;
      }

      vR.set(rx, ry, rz);
      quatFromZTo(vR, qRot);
      BJS.Matrix.FromQuaternionToRef(qRot, mRot);

      // os que vêm para a câmara levam ×0.75 (:579), como no original
      const front = Rz > 0 ? 0.75 : 1;

      for (let w = 0; w < LAYERS; w++) {
        /* raio na ponta, EM RAIOS DA BOLA, igual à Canvas 2D (:584,:591):
             wEnd = L3·Rpx·pe[2]·0.5  →  em raios: L3·0.5   (o pe[2] é a perspetiva, que aqui o 3D já dá)
             hE   = tan(w)·wEnd + wStart
           O `·0.5` faltava: sem ele a ponta saía ao dobro (0.105 raios no cone exterior a L3=6 com
           beamWidthDeg 0.7, quando a Canvas 2D dá 0.052) e os feixes liam-se como leques, não linhas. */
        const rEnd = baseR + Math.tan(widths[w]) * L3 * 0.5;
        // o cone unitário tem raio 1 na base e 0 na ponta; escalamos X/Y pelo raio da PONTA e
        // deixamos a base fina via `baseR` — aproximação do tronco do original (ver PARITY)
        const rw = Math.max(rEnd, baseR * (w === 0 ? 1 : w === 1 ? 0.6 : 0.3));
        BJS.Matrix.ScalingToRef(rw, rw, L3, mScale);
        mScale.multiplyToRef(mRot, mOut);
        mOut.setTranslationFromFloats(px, py, pz);
        mOut.copyToArray(mBuf[w], nCone * 16);
        const co = nCone * 4, a = base * aw[w] * front;
        cBuf[w][co] = cBuf[w][co + 1] = cBuf[w][co + 2] = 1;
        cBuf[w][co + 3] = a;
      }
      nCone++;
    }

    /* `staticBuffer` tem de ser FALSE: os buffers mudam a cada frame. Com `true` o Babylon assume
       que não voltam a mexer-se e a atualização não chega ao GPU — as instâncias ficam presas nos
       valores do primeiro frame (alpha cheio → tudo branco). Foi exatamente o sintoma medido. */
    for (let w = 0; w < LAYERS; w++) {
      const m = layers[w];
      if (nCone === 0) { m.thinInstanceCount = 0; continue; }
      m.thinInstanceSetBuffer('matrix', mBuf[w], 16, false);
      m.thinInstanceSetBuffer('instanceColor', cBuf[w], 4, false);
      m.thinInstanceCount = nCone;
    }
    if (nGlow === 0) glow.thinInstanceCount = 0;
    else {
      glow.thinInstanceSetBuffer('matrix', gMat, 16, false);
      glow.thinInstanceSetBuffer('instanceColor', gCol, 4, false);
      glow.thinInstanceCount = nGlow;
    }
    lastCount = nCone; lastGlow = nGlow;
  }

  return {
    update,
    get mesh() { return layers[0]; },     // API do brief: `mesh` (a camada exterior)
    layers,
    glow,
    material: mat,
    get count() { return lastCount; },
    get glowCount() { return lastGlow; },
  };
}

export default createBeams;
