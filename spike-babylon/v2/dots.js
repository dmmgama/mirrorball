// v2/dots.js — pontos na parede (Fase 4, Sonnet). Fiel a web/index-v2.html:487-496 + :443-481
// (docs/parity-canvas2d.md §1.8). A FONTE (que tiles projetam, onde na sala, com que I/size) é do
// `ball.js` (`ball.dots` = {count, X, N, R, I, size}, bloco `// ---- F4 dots ----`); aqui só se
// DESENHA — mesmo padrão do beams.js.
//
// Thin instances de UMA mancha colada ao plano da parede: translação =
// X + N·0.01 (evita z-fighting com a parede), rotação alinha a mancha com N, escala
// [size·elong, size, 1] com elong = clamp(1/max(graze,0.2), 1, 4.5), graze = |N·R̂| (ângulo rasante —
// no Canvas 2D era |nrm.z|, aqui é a normal do plano contra a direção do feixe R, que é o que
// fisicamente alonga a mancha: um feixe quase paralelo à parede risca-a em vez de pingar).
// Eixo maior ao longo da projeção de R no plano (a direção em que o feixe "arrasta" a mancha).
//
// FORMA (V1, research-realismo §2.1): uma bola de espelhos real não projeta círculos — cada faceta
// é um quadrado plano e a mancha HERDA a silhueta da faceta. A mesh base passa a ser um LOSANGO
// (`CreateDisc` com `tessellation: 4` — 4 vértices a 0/90/180/270°, i.e. um quadrado com as
// diagonais sobre o X e o Y locais). Isto é de propósito: os eixos locais X/Y já são os eixos que a
// matriz por instância orienta (X = direção em que o feixe arrasta, Y = travessa), por isso o
// losango herda a orientação da faceta de graça — não há billboard nenhum aqui, a rotação é sempre
// Z→N + alinhamento em torno de N, e a elongação estica a diagonal maior como esticava o disco.
// Raio 1.2247 (=√1.5) para o quadrado ter a MESMA área do dodecágono de raio 1 que substitui
// (3.0 vs 2.0 à mesma escala) — tamanho aparente inalterado, só muda a silhueta.
// O knob `pontos: losango (0/1)` (CONFIG.dotDiamond, default 1) troca entre as duas meshes ao vivo.
//
// Material: StandardMaterial sem luz, emissiveColor branco, ALPHA_ADD, sem depth write, greyscale —
// cor por instância `v = clamp(I,0,1)·dotMaxGrey/255`, descarta v < 8/255 (mesmo teto do Canvas 2D).
//
// createDots(scene, CONFIG, ball) -> { update(E), mesh }

const BJS = (typeof BABYLON !== 'undefined') ? BABYLON : (typeof globalThis !== 'undefined' ? globalThis.BABYLON : undefined);

function num(v, d) { return Number.isFinite(v) ? v : d; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

const SIDES = 12;  // disco: poucos lados, é uma mancha de luz, não precisa de ser redondo perfeito
const QUAD_SIDES = 4;  // losango: 4 vértices a 0/90/180/270° — quadrado com as diagonais em X/Y locais
// área de um polígono regular de n lados e raio r = ½·n·r²·sin(2π/n): 3.0 (n=12, r=1) vs 2.0 (n=4,
// r=1). √(3/2) devolve ao losango a área do disco — o David compara SILHUETA, não tamanho.
const QUAD_R = Math.sqrt(1.5); // 1.224744...

export function createDots(scene, CONFIG, ball) {
  if (!BJS) throw new Error('dots.js: BABYLON global não encontrado');
  const C = CONFIG || {};
  const cfg = (k, d) => {
    const v = C[k];
    return (v !== undefined && v !== null) ? v : d;
  };

  const mat = new BJS.StandardMaterial('dotMat', scene);
  mat.disableLighting = true;
  mat.emissiveColor = new BJS.Color3(1, 1, 1);
  mat.diffuseColor = new BJS.Color3(0, 0, 0);
  mat.specularColor = new BJS.Color3(0, 0, 0);
  mat.alphaMode = BJS.Engine.ALPHA_ADD;
  mat.disableDepthWrite = true;   // pontos não tapam pontos de trás (são névoa/luz, não sólidos)
  mat.backFaceCulling = false;
  mat.needAlphaBlending = () => true; // mesma cautela do beams.js: não depender de heurística
  mat.transparencyMode = BJS.Material.MATERIAL_ALPHABLEND; // WebGPU ignorou o override no haloMat

  /* Duas meshes base, mesmo material e mesmo pipeline de thin instances: a redonda (histórica) e o
     losango (V1). Só UMA recebe instâncias por frame — a outra fica com count 0 E `setEnabled(false)`
     (armadilha WebGPU: count 0 sozinho não esconde a mesh base; ver beams.js). */
  function makeBase(name, tess, radius) {
    const m = BJS.MeshBuilder.CreateDisc(name, { radius, tessellation: tess }, scene);
    m.material = mat;
    m.isPickable = false;
    m.thinInstanceEnablePicking = false;
    m.alwaysSelectAsActiveMesh = true;   // nunca cair fora do frustum por bounding stale
    m.renderingGroupId = 1;              // depois da bola, junto com feixes/incidente
    m.thinInstanceCount = 0;
    m.setEnabled(false);
    return m;
  }
  const meshRound = makeBase('dots', SIDES, 1);
  const meshQuad = makeBase('dotsQuad', QUAD_SIDES, QUAD_R);
  // mesh ativa deste frame; `pickMesh()` lê o knob (valor inicial finito garantido pelo cfg())
  let mesh = meshQuad;
  function pickMesh() {
    return (num(cfg('dotDiamond', 1), 1) >= 0.5) ? meshQuad : meshRound;
  }

  /* ---- buffers pré-alocados (nada de alocar por frame) ---- */
  let cap = 0;
  let mBuf = null, cBuf = null;
  function ensureCap(n) {
    if (n <= cap) return;
    cap = Math.max(64, n * 2);
    mBuf = new Float32Array(cap * 16);
    cBuf = new Float32Array(cap * 4);
    // as duas meshes partilham os MESMOS Float32Array (só uma é desenhada por frame)
    meshRound.thinInstanceSetBuffer('matrix', mBuf, 16, false);
    meshRound.thinInstanceSetBuffer('instanceColor', cBuf, 4, false);
    meshQuad.thinInstanceSetBuffer('matrix', mBuf, 16, false);
    meshQuad.thinInstanceSetBuffer('instanceColor', cBuf, 4, false);
  }
  ensureCap(64);
  // WebGPU: count 0 nao esconde a mesh base (ver beams.js) - desligar sempre em conjunto
  function hideAll() {
    meshRound.thinInstanceCount = 0; meshRound.setEnabled(false);
    meshQuad.thinInstanceCount = 0; meshQuad.setEnabled(false);
  }
  hideAll();

  /* ---- objetos reutilizados no loop (contrato: nunca alocar por ponto) ---- */
  const vN = new BJS.Vector3();
  const vR = new BJS.Vector3();
  const qRot = new BJS.Quaternion();
  const mScale = BJS.Matrix.Identity();
  const mRot = BJS.Matrix.Identity();
  const mOut = BJS.Matrix.Identity();
  const Z = new BJS.Vector3(0, 0, 1); // eixo nativo da mancha (CreateDisc nasce no plano XY, normal +Z)

  // eixo maior da mancha (X local; no losango é uma DIAGONAL) ANTES da rotação from-to:
  // projeção de R no plano da mancha, em
  // coordenadas do MUNDO — mas como a rotação from-to (Z→N) leva X a um eixo arbitrário no plano,
  // aplica-se uma rotação extra em torno de N para alinhar X com a projeção de R.
  const vProj = new BJS.Vector3();
  const vLocalX = new BJS.Vector3();
  const qAlign = new BJS.Quaternion();
  const qFinal = new BJS.Quaternion();

  /* Quaternion que leva +Z a `d` (unit), sem alocar — idêntico ao beams.js. Caso degenerado
     (d ≈ −Z) tratado à parte: Cross de vetores antiparalelos dá zero e o quaternion sairia NaN. */
  function quatFromZTo(d, out) {
    const dot = d.z;
    if (dot > 0.999999) { out.set(0, 0, 0, 1); return out; }
    if (dot < -0.999999) { out.set(1, 0, 0, 0); return out; }
    const ax = -d.y, ay = d.x, az = 0;
    const s = Math.sqrt((1 + dot) * 2), inv = 1 / s;
    out.set(ax * inv, ay * inv, az * inv, s * 0.5);
    return out;
  }

  let lastCount = 0;

  function update() {
    const src = ball && ball.dots;
    const n0 = (src && Number.isFinite(src.count)) ? src.count : 0;
    if (n0 <= 0) {
      if (lastCount) { hideAll(); lastCount = 0; }
      return;
    }
    ensureCap(n0);

    const dotMaxGrey = clamp(num(cfg('dotMaxGrey', 0xd8), 0xd8), 0, 255);
    const minV = 8 / 255;

    const X = src.X, N = src.N, R = src.R, I = src.I, SZ = src.size;
    let ni = 0;

    for (let i = 0; i < n0; i++) {
      const i3 = i * 3;
      const px = X[i3], py = X[i3 + 1], pz = X[i3 + 2];
      const nx = N[i3], ny = N[i3 + 1], nz = N[i3 + 2];
      const rx = R[i3], ry = R[i3 + 1], rz = R[i3 + 2];
      const Iv = I[i], size = SZ[i];
      // guarda Number.isFinite: um NaN aqui produzia uma matriz NaN e a instância desaparecia
      // (ou pior) em silêncio — o mesmo bug documentado no beams.js (regra 7 do CLAUDE.md)
      if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) continue;
      if (!Number.isFinite(nx) || !Number.isFinite(ny) || !Number.isFinite(nz)) continue;
      if (!Number.isFinite(Iv) || !Number.isFinite(size) || size <= 0) continue;

      const v = clamp(Iv, 0, 1) * dotMaxGrey / 255;
      if (v < minV) continue;

      // graze = |N·R̂| (R já vem unitário de ball.js — reflexão de vetor unitário preserva o módulo)
      const graze = Math.abs(nx * rx + ny * ry + nz * rz);
      const elong = clamp(1 / Math.max(graze, 0.2), 1, 4.5);

      vN.set(nx, ny, nz);
      quatFromZTo(vN, qRot);
      BJS.Matrix.FromQuaternionToRef(qRot, mRot);   // rotação base Z→N (também dá o X local rodado)

      // eixo maior ao longo da projeção de R no plano do disco: R − (R·N)N, depois alinhado ao X
      // local do disco JÁ rodado (Z→N leva (1,0,0) a `vLocalX`); o ângulo entre os dois dá a rotação
      // extra em torno de N que orienta a elongação na direção certa.
      const RdN = rx * nx + ry * ny + rz * nz;
      vProj.set(rx - RdN * nx, ry - RdN * ny, rz - RdN * nz);
      const projLen = vProj.length();
      if (projLen > 1e-5) {
        vProj.scaleInPlace(1 / projLen);
        BJS.Vector3.TransformNormalToRef(BJS.Vector3.RightReadOnly, mRot, vLocalX);
        const lx = vLocalX.length();
        if (lx > 1e-5) {
          vLocalX.scaleInPlace(1 / lx);
          let cosA = BJS.Vector3.Dot(vLocalX, vProj);
          cosA = cosA < -1 ? -1 : cosA > 1 ? 1 : cosA;
          const cross = BJS.Vector3.Cross(vLocalX, vProj);
          const sinA = BJS.Vector3.Dot(cross, vN); // sinal do ângulo em torno de N
          const ang = Math.atan2(sinA, cosA);
          BJS.Quaternion.RotationAxisToRef(vN, ang, qAlign);
          qRot.multiplyToRef(qAlign, qFinal);
          BJS.Matrix.FromQuaternionToRef(qFinal, mRot); // atualiza mRot para a rotação FINAL
        }
      }

      BJS.Matrix.ScalingToRef(size * elong, size, 1, mScale);
      mScale.multiplyToRef(mRot, mOut);
      // translação = X + N·0.01 (evita z-fighting com a parede)
      mOut.setTranslationFromFloats(px + nx * 0.01, py + ny * 0.01, pz + nz * 0.01);
      mOut.copyToArray(mBuf, ni * 16);

      const co = ni * 4;
      cBuf[co] = cBuf[co + 1] = cBuf[co + 2] = v;
      cBuf[co + 3] = 1;
      ni++;
    }

    if (ni === 0) {
      if (lastCount) { hideAll(); lastCount = 0; }
      return;
    }
    /* Escolha da forma ao vivo: se o David virou o knob, a mesh que sai de serviço tem de ficar
       com count 0 E desligada no MESMO frame (armadilha WebGPU) — senão via-se a mesh base. */
    const want = pickMesh();
    if (want !== mesh) {
      mesh.thinInstanceCount = 0;
      mesh.setEnabled(false);
      mesh = want;
    }
    mesh.thinInstanceSetBuffer('matrix', mBuf, 16, false);
    mesh.thinInstanceSetBuffer('instanceColor', cBuf, 4, false);
    mesh.thinInstanceCount = ni;
    mesh.setEnabled(true);
    lastCount = ni;
  }

  // `mesh` é getter: a mesh ativa muda com o knob `pontos: losango` (nenhum consumidor a usa hoje,
  // mas o contrato do módulo mantém-se — quem lesse `.mesh` vê sempre a que está a desenhar).
  return { update, get mesh() { return mesh; }, meshRound, meshQuad };
}

export default createDots;
