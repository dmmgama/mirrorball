// v2/crowd.js — F15: VULTOS (pessoas a dançar na pista). Spec do David: docs/f15-vultos.md.
//
// ================================ O QUE É ================================
// "Vultos na sala como se fossem pessoas a dançar." Numa pista real ÀS ESCURAS não se veem pessoas:
// veem-se MASSAS ESCURAS que se movem, com um rim light ocasional quando um foco lhes passa por
// cima. É isso que este módulo desenha — silhuetas low-poly, quase pretas, NUNCA bonecos: sem
// caras, sem mãos, sem detalhe que a penumbra não daria. O knob `vultos: luminosidade` controla
// quanto a luz da sala os revela (albedo × esse fator); a 0 são recortes pretos, no topo leem-se
// como corpos com volume.
//
// ---- DIVERSIDADE (spec: "variar altura, cabelo, estatura física, género") ----
// Tudo sorteado com RNG SEEDED (Mulberry32, o mesmo padrão do mikado.js) a partir de
// `vultos: semente` — a multidão é ESTÁVEL entre frames e entre reloads, senão não havia como
// afinar nada. Por pessoa sorteiam-se:
//   altura     1,50-1,95 m (knobs `altura média` e `variação`, distribuição triangular);
//   estatura   largura de ombros, largura de anca, e um fator de VOLUME (magro ↔ corpulento);
//   género     um eixo CONTÍNUO 0..1 (não duas caixas): move a razão ombros/anca, a altura da
//              cintura e o comprimento das pernas. As leituras misturam-se de propósito — ombros
//              largos com anca larga, anca estreita com ombros estreitos, tudo pelo meio;
//   cabelo     6 silhuetas (rapado · curto · médio · comprido · apanhado/carrapito · volumoso).
// Ninguém tem cara: a "cabeça" é uma esfera achatada e o cabelo é uma casca por cima dela. É
// exatamente o que se lê a 8 m num clube escuro.
//
// ---- A DANÇAR ----
// Movimento por FRAME, barato (nenhum bone, nenhum skinning): cada vulto tem fase e amplitude
// próprias e faz (a) peso de um pé para o outro (sway lateral + bob vertical + rotação do tronco),
// (b) braços a subir/descer, ocasionalmente ao ar. NADA é sincronizado tipo exército: cada pessoa
// tem `phase` própria e um ligeiro desvio de tempo (`rate`), por isso a pista respira em vez de
// marchar.
// Se `window.MUSIC.state` existir (POLL por frame, o padrão F11/F12 — ZERO linhas em web/music.js),
// o compasso segue o BPM do motor; sem motor, ritmo próprio lento pelo knob `vultos: bpm sem motor`.
// TETO DE 3 Hz: o balanço é um ciclo por DOIS tempos (uma pessoa desloca o peso a cada 2 beats),
// portanto a 174 BPM = 2,9 Hz de beat dá 1,45 Hz de balanço — muito abaixo do teto. E é movimento
// contínuo, não estroboscópico.
//
// ---- COLOCAÇÃO ----
// Sorteio rejeitivo dentro da pista, evitando: a vertical da BOLA (raio + margem — ninguém dança
// debaixo de uma bola de 200 kg), os PILARES MONTADOS (um pilar desligado no painel não é
// obstáculo — regra da F13 §1) e as PAREDES. Densidade em PESSOAS/m² (o mesmo padrão do
// `mikado: barras/m²` da F12: muda a sala nos knobs ⟳ e a multidão escala sozinha, em vez de ficar
// ora vazia ora entulhada). Distância mínima entre pessoas para não se interpenetrarem.
//
// ---- OCLUSÃO (o botão que o David pediu) ----
// `vultos: oclusão (0/1)`. Ver a discussão completa em docs/f15-vultos.md §Oclusão. Em resumo:
//   ON  = os vultos existem para a luz: os DOTS da bola que lhes acertam MORREM neles (o raycast
//         em CPU do ball.js testa um cilindro por pessoa antes de aceitar o ponto na parede) e os
//         corpos RECEBEM a luz da sala normalmente (as silhuetas acendem quando um foco lhes passa).
//   OFF = a luz atravessa: os dots ignoram-nos e os corpos saem de `light.excludedMeshes` de todas
//         as luzes de sala (chapéus/robots/mikado) — puramente decorativos.
// O teste é um CILINDRO VERTICAL por pessoa (raio = meia largura de ombros), não a malha real:
// é o compromisso honesto e barato — a silhueta que interessa é a do tronco, e o raio da mancha
// que um dot deixa é maior que o erro. Publica-se `CONFIG.crowd.occ` (um Float32Array plano
// [x, z, r, yTop] por pessoa) que o ball.js consome sem conhecer este módulo.
//
// ================================ REGRAS QUE ESTE MÓDULO CUMPRE ================================
// 1. PBR novo SEMPRE com `reflectionTexture` própria (RawCubeTexture 1×1 quase preta) — regressão
//    S8 "tudo preto" (comentário longo em v2/room.js).
// 2. `setEnabled` acompanha SEMPRE a contagem (bug S9 nº1): pool fixo, o que passa do `count` fica
//    desligado. E o par liga/desliga é SIMÉTRICO (armadilha F11): `enabledPlan` + `restoreEnabled()`.
// 3. Orientar com `rotationQuaternion`/rotação simples em Y — nada que componha Euler em 2 eixos.
// 4. NaN-safe: todo o estado nasce com valor e todo o knob passa por `num(v, default)`.
// 5. Nada > 3 Hz.
// 6. `meshes` = array ACHATADO de MESHES REAIS (nunca TransformNodes — rebentam o
//    `_prepareRenderingManager` do ReflectionProbe em WebGPU). A bola TEM de espelhar a pista:
//    é uma pista CHEIA, e é isso que se vê nas fotos do Lux.
// 7. O MOTOR nunca liga/desliga vultos — `vultos (0/1)` é do David. O estrelato pode, no máximo,
//    modular a LUMINOSIDADE (ver `starGain()` e a decisão documentada em docs/f15-vultos.md).
//
// createCrowd(scene, CONFIG) -> { meshes, update(tSec, dt), rebuild(), count, areaM2 }

import { applyColorToggle } from './colorutil.js?v=1';

function num(v, d) { return Number.isFinite(v) ? v : d; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

/* Pool FIXO de pessoas. Cada vulto são 8 meshes pequenas (tronco, anca, cabeça, cabelo, 2 braços,
   2 pernas) — 80 pessoas = 640 meshes, a mesma ordem de grandeza do pool do mikado (672) e todas
   com o MESMO material (2 materiais no total: corpo + cabelo), portanto zero custo de shaders.
   As que passam do `count` ficam `setEnabled(false)` e não custam nada por frame (nem à cena nem
   ao probe, que só desenha o que está enabled).
   80 cobre a pista nominal (~117 m² de sala, ~90 m² de pista útil) até ~0,9 pessoas/m², que já é
   uma pista bem cheia. Acima disso o `generate()` avisa UMA vez na consola em vez de mentir em
   silêncio — a mesma regra do `MAX_BARS` do mikado (o knob não pode dizer uma coisa e a sala
   mostrar outra). */
const MAX_PEOPLE = 80;

/* Silhuetas de cabelo (spec: "variar cabelo"). Índices usados em `layout()`.
   Não há "cabelo de homem" e "cabelo de mulher" — o sorteio é independente do eixo de género,
   de propósito: numa pista real o cabelo não diz o género de ninguém. */
const HAIR_BALD = 0;    // rapado / careca: nada por cima da cabeça
const HAIR_SHORT = 1;   // curto: casca fina colada ao crânio
const HAIR_MED = 2;     // médio: casca até à nuca
const HAIR_LONG = 3;    // comprido: cai pelos ombros (casca alongada em Y, atrás)
const HAIR_BUN = 4;     // apanhado: carrapito por cima
const HAIR_BIG = 5;     // volumoso: massa larga à volta da cabeça

/* RNG com seed — Mulberry32, o MESMO do mikado.js (mesma função, mesmo determinismo). A multidão
   tem de ser estável entre reloads: se as pessoas saltassem de sítio a cada rebuild, o David nunca
   conseguia afinar densidade nem colocação. */
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// distribuição triangular em [-1,1] (média 0): duas uniformes somadas. Dá uma população com massa
// no meio e caudas raras — que é como as alturas se distribuem de facto, e evita a pista uniforme
// de "metade gigantes, metade anões" que uma uniforme pura produzia.
function tri(rng) { return (rng() + rng() - 1); }

export function createCrowd(scene, CONFIG) {
  const K = () => CONFIG.crowd || {};

  /* F12 §5 (estrelato): os vultos NÃO entram no sorteio de estrela — não são uma peça de luz, são
     o público. O que o estrelato faz, e só isso, é modular a LUMINOSIDADE: quando o mikado ou os
     chapéus são a estrela a pista fica um pouco mais lida (a luz vem de cima e bate nas cabeças);
     quando a bola é a estrela, o público recolhe para a penumbra e a bola fica sozinha no palco.
     Nunca liga/desliga nada (regra 7) e nunca passa do knob do David — é um multiplicador
     ancorado em 1 (`0.75 + 0.45·g`, ou seja 0,75 a 1,2). Se o stardom não existir devolve 1. */
  const starGain = () => {
    const g = CONFIG.stardom && CONFIG.stardom.gain;
    if (!g) return 1;
    // média entre o ganho do mikado e o dos chapéus = "quanta luz de teto está a cair na pista"
    const top = 0.5 * (clamp(num(g.mikado, 1), 0, 2) + clamp(num(g.hats, 1), 0, 2));
    return clamp(0.75 + 0.45 * top, 0.6, 1.3);
  };

  /* ---- materiais (regra 1: reflectionTexture PRÓPRIA em TODOS) ----
     DOIS materiais para a pista inteira: corpo e cabelo. Não é uma poupança de perf apenas — é a
     leitura certa: às escuras toda a gente é da mesma cor (a cor da penumbra), o que distingue as
     pessoas é a FORMA e o movimento, não o tom. Ter um material por pessoa daria 80 shaders e uma
     pista que parece um catálogo de roupa. */
  function makeDarkCube(rgb) {
    const px = new Uint8Array([rgb[0], rgb[1], rgb[2], 255]);
    try {
      return new BABYLON.RawCubeTexture(
        scene, [px, px, px, px, px, px], 1,
        BABYLON.Engine.TEXTUREFORMAT_RGBA, BABYLON.Engine.TEXTURETYPE_UNSIGNED_BYTE,
        false, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);
    } catch (e) {
      console.error('[MB2] crowd.js: RawCubeTexture falhou — sem ela o material cai no ' +
        'scene.environmentTexture e em WebGPU o frame fica PRETO (ver v2/room.js):', e);
      return null;
    }
  }
  const darkCube = makeDarkCube([6, 6, 7]);

  /* Cor base: um cinza-azulado MUITO escuro. Não é preto puro de propósito — preto puro não
     recebe rim light nenhum e a silhueta fica um buraco no ecrã, sem volume. Este tom quase não
     se vê no escuro e acende quando um foco lhe passa, que é exatamente a leitura pedida.
     Passa por `applyColorToggle` (greyscale `cor (0/1)`) como todas as cores novas da sala — sendo
     quase neutro, o toggle mal lhe mexe, mas a porta tem de existir e funcionar (regra do David). */
  /* Medido na cena: o wash da sala é uma HemisphericLight a apontar de CIMA, portanto as faces
     horizontais (ombros, cabeças) apanham-na a peso total enquanto as paredes a apanham de raspão.
     Com albedo 0,030 os topos das silhuetas ficavam MAIS CLAROS que as paredes (0,055) — o
     contrário do que a spec pede. 0,022 põe-nas de volta na penumbra e deixa o rim light continuar
     a existir onde deve: nos ombros e na cabeça de quem apanha um foco. */
  const BODY_RGB = [0.022, 0.022, 0.027];
  const HAIR_RGB = [0.014, 0.013, 0.016];   // o cabelo é sempre mais escuro que a pele/roupa

  const bodyMat = new BABYLON.PBRMaterial('crowdBody', scene);
  bodyMat.albedoColor = new BABYLON.Color3(BODY_RGB[0], BODY_RGB[1], BODY_RGB[2]);
  bodyMat.metallic = 0;
  bodyMat.roughness = 0.92;
  bodyMat.maxSimultaneousLights = 4;   // perf: mesma nota de fixtures.js/robots.js/mikado.js
  bodyMat.reflectionTexture = darkCube;

  const hairMat = new BABYLON.PBRMaterial('crowdHair', scene);
  hairMat.albedoColor = new BABYLON.Color3(HAIR_RGB[0], HAIR_RGB[1], HAIR_RGB[2]);
  hairMat.metallic = 0;
  hairMat.roughness = 0.72;            // o cabelo apanha um brilho mais fechado que a roupa
  hairMat.maxSimultaneousLights = 4;
  hairMat.reflectionTexture = darkCube;

  /* Aplica o toggle 'cor (0/1)', o knob de LUMINOSIDADE e o de OPACIDADE aos dois materiais.
     Escreve-se `.set()` numa Color3 EXISTENTE (nunca reatribuir a propriedade — recompila o shader;
     ver a nota de perf do estrobo em main.js). Chamado por frame, mas só faz trabalho quando algum
     dos três valores muda DE FACTO.
     ⚠ OPACIDADE: a 1,00 o material tem de ficar OPACO A SÉRIO (`alpha = 1` + `transparencyMode`
     de volta a OPAQUE), não em alpha-blend com alpha 1 — é a lição da F13 §2 (a bola que não
     conseguia ficar toda opaca) aplicada de raiz. Um material alpha-blend a 1,00 ainda paga
     ordenação por profundidade e ainda escreve mal em WebGPU quando duas pessoas se sobrepõem. */
  let lastLum = -1, lastGrey = null, lastAlpha = -1;
  function applyLook(force) {
    const cfg = K();
    const lum = clamp(num(cfg.lum, 1), 0, 3) * starGain();
    const grey = CONFIG.colorOn === false;
    const alpha = clamp(num(cfg.opacity, 1), 0, 1);
    if (!force && Math.abs(lum - lastLum) < 1e-4 && grey === lastGrey
      && Math.abs(alpha - lastAlpha) < 1e-4) return;
    lastLum = lum; lastGrey = grey; lastAlpha = alpha;

    const [br, bg, bb] = applyColorToggle(CONFIG, BODY_RGB[0], BODY_RGB[1], BODY_RGB[2]);
    const [hr, hg, hb] = applyColorToggle(CONFIG, HAIR_RGB[0], HAIR_RGB[1], HAIR_RGB[2]);
    bodyMat.albedoColor.set(br * lum, bg * lum, bb * lum);
    hairMat.albedoColor.set(hr * lum, hg * lum, hb * lum);

    const opaque = alpha >= 0.999;
    for (const m of [bodyMat, hairMat]) {
      m.alpha = opaque ? 1 : alpha;
      m.transparencyMode = opaque
        ? BABYLON.Material.MATERIAL_OPAQUE
        : BABYLON.Material.MATERIAL_ALPHABLEND;
      // a 100% translúcidos não faz sentido escreverem profundidade uns por cima dos outros
      m.needDepthPrePass = !opaque;
      m.backFaceCulling = true;
    }
  }

  /* ---- pool de pessoas -----------------------------------------------------------------------
     Cada vulto = 8 meshes reais, todas filhas de um TransformNode `root` (uma escrita de posição +
     rotação por pessoa e por frame):
       hip    — anca/bacia (caixa; a base do tronco, é ela que dá a largura da anca)
       torso  — tronco (caixa que estreita para cima via `scaling` — os ombros são o topo)
       head   — cabeça (esfera achatada, SEM cara)
       hair   — silhueta de cabelo (esfera/caixa conforme o tipo; escondida no tipo `rapado`)
       arm0/1 — braços (caixas finas, pivot no OMBRO — ver o truque do pivot abaixo)
       leg0/1 — pernas (caixas finas, pivot na ANCA)
     ⚠ PIVOT: uma caixa nasce centrada na origem, portanto rodá-la faz-lhe girar o MEIO. Um braço
     tem de girar no OMBRO. Em vez de nós intermédios (mais TransformNodes = mais matrizes por
     frame) faz-se `bakeCurrentTransformIntoVertices` com a caixa já descida meio comprimento: o
     vértice topo fica na origem local e a rotação passa a ser em torno do ombro. Custo: uma
     malha por membro, criada uma vez. */
  const people = [];
  function boxDown(name) {
    // caixa 1×1×1 com o TOPO na origem local (pivot em cima) — ver a nota do PIVOT acima
    const m = BABYLON.MeshBuilder.CreateBox(name, { width: 1, height: 1, depth: 1 }, scene);
    m.position.y = -0.5;
    m.bakeCurrentTransformIntoVertices();
    m.isPickable = false;
    return m;
  }
  for (let i = 0; i < MAX_PEOPLE; i++) {
    const root = new BABYLON.TransformNode('crowdRoot' + i, scene);

    const hip = BABYLON.MeshBuilder.CreateBox('crowdHip' + i, { width: 1, height: 1, depth: 1 }, scene);
    hip.material = bodyMat; hip.parent = root; hip.isPickable = false;

    const torso = BABYLON.MeshBuilder.CreateBox('crowdTorso' + i, { width: 1, height: 1, depth: 1 }, scene);
    torso.material = bodyMat; torso.parent = root; torso.isPickable = false;

    const head = BABYLON.MeshBuilder.CreateSphere('crowdHead' + i, { diameter: 1, segments: 6 }, scene);
    head.material = bodyMat; head.parent = root; head.isPickable = false;

    const hair = BABYLON.MeshBuilder.CreateSphere('crowdHair' + i, { diameter: 1, segments: 6 }, scene);
    hair.material = hairMat; hair.parent = root; hair.isPickable = false;

    const arms = [], legs = [];
    for (let k = 0; k < 2; k++) {
      const a = boxDown('crowdArm' + i + '_' + k);
      a.material = bodyMat; a.parent = root;
      arms.push(a);
      const l = boxDown('crowdLeg' + i + '_' + k);
      l.material = bodyMat; l.parent = root;
      legs.push(l);
    }

    root.setEnabled(false);
    people.push({
      root, hip, torso, head, hair, arms, legs,
      // geometria sorteada (preenchida em layout())
      h: 1.72, shoulder: 0.42, hipW: 0.34, depth: 0.22, armLen: 0.6, legLen: 0.85,
      torsoY: 1.0, headY: 1.6, hairType: HAIR_SHORT, yaw: 0,
      x: 0, z: 0,
      // dança
      phase: 0, rate: 1, amp: 1, armStyle: 0, footPhase: 0,
    });
  }

  /* ================================ GERAÇÃO DA MULTIDÃO ================================
     Determinística (RNG com seed do knob). Corre no arranque e sempre que um knob de COLOCAÇÃO ou
     de DIVERSIDADE muda (`rebuild()`); NUNCA por frame. */
  let generated = [];
  let lastArea = 0;
  let warnedPool = false;

  function generate() {
    const cfg = K();
    const rng = makeRng(Math.round(num(cfg.seed, 11)) || 11);
    const R = CONFIG.room || {};
    const P = CONFIG.pillars || {};

    /* ZONA — a PISTA: a sala toda menos uma folga às paredes (`wallMarginM`). Ao contrário do
       mikado (que tem o modo "miolo"), o público espalha-se por toda a sala: nas fotos do Lux há
       gente entre os pilares, nos corredores e encostada às paredes. Quem quiser a multidão só ao
       centro sobe a folga das paredes — é o mesmo knob. */
    const wm = Math.max(0, num(cfg.wallMarginM, 0.6));
    const halfX = Math.max(0.5, num(R.halfW, 5.5) - wm);
    const halfZ = Math.max(0.5, Math.abs(num(R.back, -7.5)) - wm);
    const floorY = num(R.floor, -3.5);

    const areaM2 = Math.max(0.5, (2 * halfX) * (2 * halfZ));
    const dens = Math.max(0, num(cfg.densityPerM2, 0.30));
    const nRaw = Math.round(areaM2 * dens);
    const nWant = clamp(nRaw, 0, MAX_PEOPLE);
    if (nRaw > MAX_PEOPLE && !warnedPool) {
      warnedPool = true;
      console.warn('[MB2] vultos: a densidade pedia ' + nRaw + ' pessoas (' + dens.toFixed(2) +
        '/m² × ' + areaM2.toFixed(0) + ' m²) mas o pool tem ' + MAX_PEOPLE +
        ' — a pista fica MENOS cheia do que o knob diz. Baixa "vultos: densidade (p/m²)".');
    }

    /* ---- OBSTÁCULOS ----
       (a) a vertical da BOLA: ninguém dança debaixo dela (é o sítio onde ela desce quando o rigger
           a baixa, e visualmente uma cabeça a tocar na bola estraga a escala toda). Raio de
           rejeição = raio da bola + `ballClearM`. Lê-se `CONFIG.ballXEffective`/`ballZEffective` —
           a posição JÁ CLAMPADA que o ball.js publica, NUNCA o knob em cru (é a regra fixada na
           F12 e reforçada na F14: derivar do knob dava um sítio diferente sempre que o clamp
           entrasse). Fallback para os knobs só enquanto o ball.js ainda não correu (arranque).
       (b) os PILARES MONTADOS: um pilar desligado no painel NÃO é obstáculo (regra F13 §1,
           aplicada tal e qual; a indexação `side=-1` depois `+1`, rows 0..n, é a MESMA do
           room.js/mikado.js/ball.js — os quatro têm de concordar sobre que pilar é qual).
       (c) as PAREDES: já garantidas pela zona (`halfX`/`halfZ` com a folga). */
    const ballOn = CONFIG.ballOn !== false;
    const rBall = clamp(num(CONFIG.ballR, 1), 1.0, 1.5);
    const ballClear = ballOn ? Math.max(0, rBall + num(cfg.ballClearM, 0.6)) : -1;
    const ballCx = num(CONFIG.ballXEffective, num(CONFIG.ballPosXM, 0));
    const ballCz = num(CONFIG.ballZEffective, num(CONFIG.ballPosZM, 0));

    const pillars = [];
    if (P.on !== false) {
      const sec = Math.max(0.05, num(P.section, 0.5));
      const px = Math.abs(num(P.halfX, 3.0));
      const sz = num(P.spacingZ, 5.0);
      const rows = Math.max(1, Math.round(num(P.rows, 3)));
      const z0 = -((rows - 1) * sz) / 2;
      const off = Array.isArray(P.off) ? P.off : [];
      let idx = 0;
      for (let side = -1; side <= 1; side += 2) {
        for (let row = 0; row < rows; row++, idx++) {
          if (off.indexOf(idx) !== -1) continue;          // pilar desligado: não é obstáculo
          pillars.push({ x: side * px, z: z0 + row * sz, h: sec / 2 });
        }
      }
    }

    const minGap = Math.max(0.1, num(cfg.minGapM, 0.55));   // eixo a eixo entre duas pessoas
    const out = [];
    let guard = 0;
    while (out.length < nWant && guard < nWant * 200 + 400) {
      guard++;
      const x = (rng() * 2 - 1) * halfX;
      const z = (rng() * 2 - 1) * halfZ;

      // (a) vertical da bola
      if (ballClear > 0) {
        const dx = x - ballCx, dz = z - ballCz;
        if (dx * dx + dz * dz < ballClear * ballClear) continue;
      }
      // (b) pilares montados (+ meia largura de ombros a mais: ninguém encaixa no betão)
      let hitPillar = false;
      for (let k = 0; k < pillars.length; k++) {
        const B = pillars[k], m = B.h + 0.32;
        if (x > B.x - m && x < B.x + m && z > B.z - m && z < B.z + m) { hitPillar = true; break; }
      }
      if (hitPillar) continue;
      // (c) espaço pessoal
      let tooClose = false;
      for (let k = 0; k < out.length; k++) {
        const dx = x - out[k].x, dz = z - out[k].z;
        if (dx * dx + dz * dz < minGap * minGap) { tooClose = true; break; }
      }
      if (tooClose) continue;

      /* ---- DIVERSIDADE: a pessoa em si (spec: altura, cabelo, estatura física, género) ----
         O RNG é consumido SEMPRE pela mesma ordem, aconteça o que acontecer — só assim a semente
         é reproduzível. (Uma pessoa rejeitada acima consome os 2 sorteios de posição e mais
         nenhum: a rejeição é feita ANTES de qualquer sorteio de corpo, de propósito.) */
      const hMid = clamp(num(cfg.heightMidM, 1.72), 1.4, 2.1);
      const hVar = clamp(num(cfg.heightVarM, 0.16), 0, 0.4);
      const h = clamp(hMid + tri(rng) * hVar, 1.42, 2.02);

      /* GÉNERO como eixo CONTÍNUO (0 = leitura mais masculina, 1 = mais feminina). Não são duas
         caixas: `g` sai de uma uniforme e move três coisas ao mesmo tempo — a razão ombros/anca
         (ombros mais largos ↔ anca mais larga), a altura da CINTURA (mais alta com g alto) e o
         comprimento relativo das pernas. Sorteia-se também um `mix` que ESTRAGA a correlação de
         propósito em ~1/4 dos casos: numa pista real há ombros largos com ancas largas e o
         contrário, e uma multidão gerada por duas fórmulas limpas lê-se logo como duas espécies. */
      const g = rng();
      const mix = rng() < 0.25 ? rng() : g;   // a maior parte segue `g`; alguns saem da regra
      // VOLUME/estatura física: magro ↔ corpulento (multiplica larguras e profundidade)
      const vol = clamp(0.82 + tri(rng) * clamp(num(cfg.buildVar, 0.22), 0, 0.5) + 0.18, 0.6, 1.55);

      const shoulder = clamp(h * (0.255 - 0.045 * g) * vol, 0.24, 0.62);
      const hipW = clamp(h * (0.185 + 0.055 * mix) * vol, 0.18, 0.52);
      const depth = clamp(h * 0.125 * vol, 0.13, 0.36);

      /* PROPORÇÕES — cânone anatómico, medido contra a silhueta na cena (ver as duas correções
         registadas em docs/f15-vultos.md §Proporções). Numa pessoa real a entreperna está a ~0,47
         da altura e a cabeça mede ~1/7,5 do corpo; a primeira tentativa (pernas a 0,455 + tronco
         curto) dava "pirolitos com pernas de andas" — o que se lê a esta distância é a RAZÃO entre
         perna, tronco e cabeça, e uma perna comprida de mais destrói a leitura de pessoa. */
      const legLen = h * (0.445 + 0.030 * g);     // cintura ligeiramente mais alta com g alto
      const torsoLen = h * (0.345 - 0.02 * g);    // tronco mais longo: fecha o vão anca↔ombros
      const headD = h * 0.132;
      const armLen = h * (0.335 + 0.02 * (1 - g));

      /* CABELO: sorteio independente do género (ver a nota no topo). Pesos escolhidos para uma
         pista real: curto e médio dominam, rapado e comprido são comuns, apanhado e volumoso são
         a minoria que dá variedade à silhueta do conjunto. */
      const hr = rng();
      const hairType = hr < 0.14 ? HAIR_BALD
        : hr < 0.42 ? HAIR_SHORT
          : hr < 0.66 ? HAIR_MED
            : hr < 0.84 ? HAIR_LONG
              : hr < 0.93 ? HAIR_BUN
                : HAIR_BIG;

      /* ORIENTAÇÃO: viés para "virado à bola" (é o que se faz num clube — olha-se para o centro),
         mas com muito ruído: há sempre gente a falar de costas, virada ao bar, virada ao DJ.
         `faceBias` 0 = azimutes uniformes; 1 = toda a gente a olhar para a bola. */
      const toBall = Math.atan2(ballCx - x, ballCz - z);
      const fb = clamp(num(cfg.faceBias, 0.45), 0, 1);
      const yaw = toBall + (rng() * 2 - 1) * Math.PI * (1 - fb);

      out.push({
        x, z, y: floorY, h, shoulder, hipW, depth, legLen, torsoLen, headD, armLen,
        hairType, yaw,
        // DANÇA: fase própria (nunca sincronizados), ritmo ligeiramente diferente por pessoa
        // (`rate` 0,92-1,08 — quem está fora do tempo é o que faz a pista parecer viva) e uma
        // amplitude própria (há quem dance muito e quem esteja quase parado a beber).
        phase: rng() * Math.PI * 2,
        rate: 0.92 + rng() * 0.16,
        amp: clamp(0.35 + rng() * 0.9, 0.2, 1.4),
        // estilo de braços: 0 = colados/baixos · 1 = a acompanhar · 2 = ao ar (a minoria)
        armStyle: rng() < 0.55 ? 0 : (rng() < 0.7 ? 1 : 2),
        armPhase: rng() * Math.PI * 2,
      });
    }

    generated = out;
    lastArea = areaM2;
    publishOccluders();
    return out;
  }

  /* ---- OCLUSÃO: a tabela que o ball.js consome ------------------------------------------------
     Publica-se um Float32Array PLANO em `CONFIG.crowd.occ` com 4 floats por pessoa:
        [ x, z, raio, yTop ]   (metros, mundo)
     e a contagem em `CONFIG.crowd.occN`. É um CILINDRO VERTICAL por pessoa, com o raio a valer meia
     largura de ombros (ligeiramente inflado, `occRadMul`) e o topo no cimo da cabeça.
     PORQUÊ um cilindro e não a malha: ver docs/f15-vultos.md §Oclusão. Em duas linhas — o raycast
     dos dots corre em CPU por tile × spot (milhares de raios por frame), portanto o teste tem de
     custar 6 operações, não uma travessia de BVH; e a silhueta que interessa é a do tronco, cuja
     largura é a mesma a 1,0 m e a 1,7 m de altura.
     O ball.js lê isto SEM conhecer este módulo (nenhum import nos dois sentidos) — é o mesmo canal
     do `CONFIG.stardom.gain`: um sítio no CONFIG, um dono a escrever, vários a ler. */
  let occBuf = new Float32Array(MAX_PEOPLE * 4);
  function publishOccluders() {
    const cfg = K();
    const on = cfg.on !== false && num(cfg.occlude, 1) >= 0.5;
    if (!CONFIG.crowd) CONFIG.crowd = {};
    if (!on) { CONFIG.crowd.occ = occBuf; CONFIG.crowd.occN = 0; return; }
    const mul = clamp(num(cfg.occRadMul, 1.05), 0.3, 2.5);
    let n = 0;
    for (let i = 0; i < generated.length; i++) {
      const p = generated[i], o = n * 4;
      occBuf[o] = p.x;
      occBuf[o + 1] = p.z;
      occBuf[o + 2] = Math.max(0.05, p.shoulder * 0.5 * mul);
      occBuf[o + 3] = p.y + p.h;
      n++;
    }
    CONFIG.crowd.occ = occBuf;
    CONFIG.crowd.occN = n;
  }

  /* ---- aplicar a geometria gerada às meshes do pool (só no rebuild, nunca por frame) ----
     `enabledPlan` guarda o que o layout montou — é o que `restoreEnabled()` repõe quando o knob
     `vultos (0/1)` volta a 1. Sem este plano, "voltar a ligar" tinha de adivinhar (é EXATAMENTE
     a armadilha da F11: o par liga/desliga tem de ser simétrico, e o ramo "ligado" nunca repunha
     nada porque só o layout() o fazia — e esse não corre por frame). */
  const enabledPlan = [];
  for (let i = 0; i < MAX_PEOPLE; i++) enabledPlan.push({ on: false, hair: false });
  let wasOn = true;
  function restoreEnabled() {
    for (let i = 0; i < MAX_PEOPLE; i++) {
      const p = enabledPlan[i];
      people[i].root.setEnabled(p.on);
      people[i].hair.setEnabled(p.hair);
    }
  }

  function layout() {
    const n = generated.length;
    for (let i = 0; i < MAX_PEOPLE; i++) {
      const P = people[i];
      if (i >= n) {
        // regra 2: setEnabled acompanha SEMPRE a contagem (a mesh base desenha-se na mesma se não o fizer)
        P.root.setEnabled(false);
        P.hair.setEnabled(false);
        enabledPlan[i].on = false; enabledPlan[i].hair = false;
        continue;
      }
      const g = generated[i];

      P.root.position.set(g.x, g.y, g.z);
      P.root.rotation.y = g.yaw;          // um só eixo — não há composição de Euler a torcer nada
      P.x = g.x; P.z = g.z;
      P.h = g.h; P.shoulder = g.shoulder; P.hipW = g.hipW; P.depth = g.depth;
      P.armLen = g.armLen; P.legLen = g.legLen;
      P.phase = g.phase; P.rate = g.rate; P.amp = g.amp;
      P.armStyle = g.armStyle; P.armPhase = g.armPhase;
      P.hairType = g.hairType;

      const legLen = g.legLen, torsoLen = g.torsoLen, headD = g.headD;
      const hipH = g.h * 0.10;

      // ANCA: caixa curta à cota da cintura — é ela que dá a leitura de bacia larga/estreita
      P.hip.scaling.set(g.hipW, hipH, g.depth * 0.95);
      P.hip.position.set(0, legLen + hipH * 0.5, 0);

      /* TRONCO: uma caixa NÃO estreita para cima sozinha. Em vez de um tronco cónico (mais uma
         malha por pessoa) usa-se a caixa a escalar entre anca e ombros e deixa-se a leitura de
         "V" ou "ampulheta" à combinação anca+ombros+braços. A 8 m de distância, num clube escuro,
         a diferença entre uma caixa e um tronco cónico não existe; a diferença entre ombros
         largos e ombros estreitos vê-se logo. É o compromisso certo de nível de detalhe. */
      /* O tronco É a largura dos OMBROS (é essa a leitura que distingue as pessoas ao longe), com
         só um toque da anca. A 1ª versão fazia a média das duas e o resultado saía MAIS ESTREITO
         que a anca em quem tinha ancas largas — uma silhueta invertida, que se lê logo como erro. */
      P.torso.scaling.set(Math.max(g.shoulder * 0.97, g.hipW * 1.02), torsoLen, g.depth);
      P.torso.position.set(0, legLen + hipH + torsoLen * 0.5, 0);
      P.torsoY = legLen + hipH;

      /* CABEÇA: esfera ligeiramente achatada (crânio, sem cara nenhuma). O PESCOÇO é quase zero e a
         cabeça ENCAIXA no topo do tronco (−0,42 do diâmetro): a 1ª versão deixava um vão visível e
         as silhuetas liam-se como pirolitos. Um pescoço a sério não se vê a 8 m no escuro; o vão,
         esse, vê-se logo. */
      const neck = g.h * 0.008;
      const headY = legLen + hipH + torsoLen + neck + headD * 0.08;
      P.head.scaling.set(headD, headD * 1.12, headD);
      P.head.position.set(0, headY, 0);
      P.headY = headY;

      // CABELO: a silhueta muda com o tipo. É sempre uma esfera escalada/deslocada — a forma
      // grosseira é o que se lê ao longe, e uma esfera chega para as 6 leituras.
      let hairOn = true;
      switch (g.hairType) {
        case HAIR_BALD:
          hairOn = false;
          break;
        case HAIR_SHORT:   // casca fina colada ao crânio
          P.hair.scaling.set(headD * 1.06, headD * 1.02, headD * 1.06);
          P.hair.position.set(0, headY + headD * 0.10, 0);
          break;
        case HAIR_MED:     // até à nuca: desce atrás (−Z local é as costas; o root está virado a +Z)
          P.hair.scaling.set(headD * 1.10, headD * 1.20, headD * 1.16);
          P.hair.position.set(0, headY + headD * 0.06, -headD * 0.10);
          break;
        case HAIR_LONG:    // cai pelos ombros: alongado em Y e puxado para trás
          P.hair.scaling.set(headD * 1.12, headD * 2.05, headD * 1.20);
          P.hair.position.set(0, headY - headD * 0.32, -headD * 0.16);
          break;
        case HAIR_BUN:     // apanhado: crânio rente + carrapito por cima (o carrapito É a esfera,
          // deslocada e pequena — a leitura ao longe é a bossa na silhueta)
          P.hair.scaling.set(headD * 0.62, headD * 0.62, headD * 0.62);
          P.hair.position.set(0, headY + headD * 0.68, -headD * 0.08);
          break;
        default:           // HAIR_BIG — massa larga à volta da cabeça
          P.hair.scaling.set(headD * 1.55, headD * 1.42, headD * 1.50);
          P.hair.position.set(0, headY + headD * 0.10, 0);
          break;
      }
      P.hair.setEnabled(hairOn);
      enabledPlan[i].hair = hairOn;

      // BRAÇOS: pivot no OMBRO (ver a nota do PIVOT). Ficam ligeiramente à frente do plano do
      // tronco para não desaparecerem dentro dele quando pendem.
      const armW = g.depth * 0.46;
      const shoulderY = legLen + hipH + torsoLen * 0.93;
      for (let k = 0; k < 2; k++) {
        const s = k === 0 ? -1 : 1;
        P.arms[k].scaling.set(armW, g.armLen, armW);
        // encostados ao tronco (`0.44` em vez de meia largura + folga): braços afastados leem-se
        // como se a pessoa levasse malas, não como alguém a dançar
        P.arms[k].position.set(s * (g.shoulder * 0.44 + armW * 0.30), shoulderY, 0);
      }
      /* PERNAS: pivot na ANCA. Mais GROSSAS e mais JUNTAS que na 1ª versão (0,50 → 0,66 de
         profundidade, afastamento 0,26 → 0,17 da anca): a 8 m duas hastes finas e afastadas leem-se
         como andas, não como pernas. */
      const legW = g.depth * 0.66;
      for (let k = 0; k < 2; k++) {
        const s = k === 0 ? -1 : 1;
        P.legs[k].scaling.set(legW, legLen, legW);
        P.legs[k].position.set(s * g.hipW * 0.17, legLen, 0);
      }

      P.root.setEnabled(true);
      enabledPlan[i].on = true;
    }
  }

  /* `rebuild()` regenera a multidão e reescreve o pool. Se os vultos estiverem DESLIGADOS no
     momento do rebuild (o David mexeu na densidade com `vultos (0/1)` a 0), o `layout()` deixaria
     as pessoas ligadas — por isso volta-se a desligar tudo logo a seguir, ficando o `enabledPlan`
     guardado para quando ele voltar a ligar. É o mesmo padrão do mikado.js. */
  function rebuild() {
    generate();
    layout();
    applyLook(true);
    if (K().on === false) {
      for (let i = 0; i < MAX_PEOPLE; i++) { people[i].root.setEnabled(false); people[i].hair.setEnabled(false); }
      wasOn = false;
    } else {
      wasOn = true;
    }
  }
  rebuild();

  /* ================================ A DANÇA ================================
     Estado NaN-safe (regra 4): tudo nasce com valor.
     O relógio da dança é uma FASE acumulada (`beatPhase`, em BATIDAS), não `tSec × bpm`: assim
     mudar o BPM a meio (o motor a apanhar uma música nova) NÃO faz a pista saltar — a fase é
     contínua, só a velocidade é que muda. Foi o mesmo raciocínio que evitou a bola a "saltar" nas
     fases anteriores. */
  const st = {
    beatPhase: 0,     // fase acumulada, em BATIDAS (contínua; nunca salta)
    bpm: 120,         // BPM efetivo do frame (suavizado)
    kick: 0,          // envelope do bombo (0..1), decai — dá o "empurrão" da pista no beat
    gridPhase: -1,    // fase 0..1 da grelha do motor neste frame (−1 = sem grelha fiável)
    warned: false,
  };

  /* ---- Lê o motor SEM lhe tocar: poll de `window.MUSIC.state` (o padrão da F11/F12) ----
     ⚠ O CONTRATO REAL (verificado no `web/music.js`, não adivinhado — a 1ª versão deste módulo
     inventou `state.bpm`/`state.kickCount` e teria ficado MUDA com o sidecar a tocar, sem erro
     nenhum na consola; foi a verificação em modo música que a apanhou):
       `state.bpmEst`   — o PERÍODO DA BATIDA em MILISSEGUNDOS (não o BPM!). O próprio motor
                          publica `bpm: 60000/bpmEst` no HUD (music.js:2266). 0 = sem opinião.
       `state.beatPhase`— fase 0..1 DENTRO da batida, vinda da grelha (music.js:1654).
       `state.gridConf` — confiança na grelha; abaixo de ~0,25 não vale a pena segui-la.
       `state.kickFlash`— envelope 0..1 do BOMBO, que o motor põe a 1 na batida e decai ×0,92 por
                          frame (music.js:1346/1352). É exatamente o "empurrão" que a pista precisa,
                          e evita ter de contar batidas.
     PORQUÊ SEGUIR A `beatPhase` DO MOTOR e não só o BPM: se cada peça integrar o seu próprio
     relógio a partir do BPM, ao fim de um minuto a pista está fora de fase com a bola e com o
     mikado, mesmo com o tempo certo. Com a fase do motor, a pista está no MESMO tempo que tudo o
     resto — que é o ponto todo de ter um motor.
     Quando a grelha não tem confiança (ou não há motor), corre-se o relógio próprio: a fase
     ACUMULA (`st.beatPhase += dt·bpm/60`) em vez de saltar, para a troca entre os dois modos não
     dar um solavanco na pista. */
  function pollMusic(dt) {
    const cfg = K();
    const MS = (typeof window !== 'undefined' && window.MUSIC && window.MUSIC.state) || null;
    let bpm = clamp(num(cfg.autoBpm, 104), 40, 200);
    let gridPhase = -1;   // −1 = sem grelha fiável

    if (MS) {
      // PERÍODO em ms → BPM. Faixa sã 40-220 (fora disso o motor está a delirar; ignora-se).
      const perMs = num(MS.bpmEst, 0);
      if (perMs > 0) {
        const b = 60000 / perMs;
        if (b > 40 && b < 220) bpm = b;
      }
      const conf = num(MS.gridConf, 0);
      const ph = num(MS.beatPhase, NaN);
      if (conf >= 0.25 && Number.isFinite(ph)) gridPhase = clamp(ph, 0, 1);
      // BOMBO: o envelope do motor (já decai sozinho); combina-se com o nosso pelo MÁXIMO, para
      // um decaimento nosso mais lento nunca cortar um flash do motor a meio.
      const kf = num(MS.kickFlash, NaN);
      if (Number.isFinite(kf)) st.kick = Math.max(st.kick, clamp(kf, 0, 1));
      // energia sub contínua, se estiver lá (não é obrigatória)
      const sub = num(MS.subAvg, NaN);
      if (Number.isFinite(sub)) st.kick = Math.max(st.kick, clamp(sub, 0, 1) * 0.45);
    } else if (!st.warned && cfg.on !== false) {
      st.warned = true;
      console.warn('[MB2] vultos: motor de música ausente (window.MUSIC) — a pista dança no ritmo ' +
        'próprio (knob "vultos: bpm sem motor"). Sem sidecar isto é esperado; a tecla `g` do motor ' +
        'liga o gerador sintético para testar.');
    }

    // suavização do BPM: uma mudança brusca de tempo não pode dar um solavanco na pista
    st.bpm = st.bpm + (bpm - st.bpm) * clamp(dt * 1.5, 0, 1);
    if (!Number.isFinite(st.bpm)) st.bpm = 104;
    // decaimento do envelope do bombo (~180 ms), por cima do que o motor já tenha posto
    st.kick -= dt / 0.18;
    if (!(st.kick > 0)) st.kick = 0;
    st.gridPhase = gridPhase;
    return gridPhase >= 0;
  }

  /* ---- update por frame ---- */
  function update(tSec, dt) {
    const cfg = K();
    const on = cfg.on !== false;

    if (!on) {
      if (wasOn) {
        for (let i = 0; i < MAX_PEOPLE; i++) { people[i].root.setEnabled(false); people[i].hair.setEnabled(false); }
        wasOn = false;
        // a oclusão desaparece com eles: uma pista desligada não pode continuar a comer dots
        publishOccluders();
      }
      return;
    }
    // voltou a ligar: repor EXATAMENTE o que o layout montou (armadilha F11 — par simétrico)
    if (!wasOn) { restoreEnabled(); wasOn = true; publishOccluders(); }

    const d = Number.isFinite(dt) ? clamp(dt, 0, 0.1) : 0.016;
    pollMusic(d);
    applyLook(false);

    /* A fase avança em BATIDAS. O BALANÇO (peso de um pé para o outro) é meio ciclo por batida —
       ou seja um ciclo completo por DOIS tempos, que é como se dança de facto — logo a frequência
       do gesto é `bpm/120` Hz: a 174 BPM dá 1,45 Hz, muito abaixo do teto de 3 Hz da sala. E é
       movimento CONTÍNUO (uma sinusoide), não um piscar: a regra dos 3 Hz nem se aplicaria da
       mesma forma, mas cumpre-se com folga na mesma. */
    st.beatPhase += d * (st.bpm / 60);
    if (!Number.isFinite(st.beatPhase)) st.beatPhase = 0;
    if (st.beatPhase > 1e7) st.beatPhase -= 1e7;   // nunca deixar o float crescer sem limite

    /* ---- ALINHAR à grelha do motor, sem saltos ----
       Com grelha fiável, a fração da fase (onde estamos DENTRO da batida) passa a ser a do motor;
       a parte inteira (que batida) continua a ser a nossa. Assim a pista fica no mesmo tempo que a
       bola e o mikado, sem nunca dar um salto: corrige-se a diferença de fase com um LERP curto
       (a diferença é sempre < 1 batida, e toma-se o caminho circular mais curto, senão a pista
       "rebobinava" na fronteira 0,99 → 0,01). Sem grelha, o relógio próprio corre como está. */
    if (st.gridPhase >= 0) {
      const mine = ((st.beatPhase % 1) + 1) % 1;
      let diff = st.gridPhase - mine;
      if (diff > 0.5) diff -= 1; else if (diff < -0.5) diff += 1;   // caminho circular mais curto
      st.beatPhase += diff * clamp(d * 3.0, 0, 0.5);
    }

    const ampK = clamp(num(cfg.danceAmp, 1), 0, 2);
    if (ampK <= 0) return;                          // pista parada: nem se paga o loop
    const w = st.beatPhase * Math.PI;               // meio ciclo por batida
    const kick = clamp(st.kick, 0, 1);
    const n = generated.length;
    const floorY = num((CONFIG.room || {}).floor, -3.5);

    for (let i = 0; i < n; i++) {
      const P = people[i];
      const a = P.amp * ampK;
      const ph = w * P.rate + P.phase;

      /* PESO DE UM PÉ PARA O OUTRO — o gesto base de quem dança sem pensar:
           - sway lateral do tronco (rotação em Z), o corpo cai para o lado do pé de apoio;
           - bob vertical (2× a frequência: sobe-se uma vez por cada meia passada);
           - uma rotação ligeira em Y (o tronco roda com o peso);
           - um empurrão extra no BOMBO (`kick`) — é o que faz a pista "responder" à música em vez
             de oscilar como um metrónomo.
         Os deslocamentos são todos no ROOT: uma escrita de posição + duas de rotação por pessoa,
         que é o que torna 80 pessoas baratas. */
      const s = Math.sin(ph);
      const c = Math.cos(ph * 2);
      /* O YAW (para onde a pessoa está virada) é do `layout()` e NÃO se toca por frame — ninguém
         gira sobre si próprio a dançar, e reescrevê-lo aqui era criar um segundo dono do mesmo
         número (a assinatura dos bugs deste repo). O que a dança escreve é `rotation.z` (o tombo
         lateral do peso), `rotation.x` (o balanço à frente/atrás) e a posição. */
      P.root.rotation.z = s * 0.085 * a;
      P.root.rotation.x = c * 0.030 * a;
      // bob vertical: a pessoa AFUNDA ligeiramente no tempo forte (nunca sobe acima do chão —
      // um vulto a levitar lê-se logo como erro, um a agachar-se lê-se como dança)
      P.root.position.set(
        P.x + s * 0.055 * a,
        floorY - (0.010 + 0.030 * kick) * a * (0.5 + 0.5 * c),
        P.z + c * 0.020 * a);

      /* BRAÇOS: pendem, acompanham, ou vão ao ar. O ombro roda em X (à frente/atrás) e em Z (para
         fora) — as duas rotações escrevem-se direto porque o pivot já está no ombro e a ordem de
         Euler (YXZ em Babylon) com yaw=0 no membro não torce nada.
         `armStyle` 2 (ao ar) é a MINORIA de propósito: uma pista inteira de braços no ar lê-se
         como um concerto, não como um clube. */
      const ap = ph + P.armPhase;
      let swing, out;
      if (P.armStyle === 2) {
        // ao ar: o braço fica quase vertical para cima e oscila
        swing = -2.35 + Math.sin(ap) * 0.22 * a;
        out = 0.30 + Math.sin(ap * 0.5) * 0.16 * a;
      } else if (P.armStyle === 1) {
        // a acompanhar: cotovelos afastados, oscilação média
        swing = -0.55 + Math.sin(ap) * 0.42 * a;
        out = 0.30 + Math.abs(Math.sin(ap)) * 0.20 * a;
      } else {
        // baixos/colados: quase parados, só a acompanhar o peso
        swing = Math.sin(ap) * 0.20 * a;
        out = 0.10 + Math.abs(s) * 0.10 * a;
      }
      P.arms[0].rotation.x = swing;
      P.arms[0].rotation.z = out;
      P.arms[1].rotation.x = swing * (P.armStyle === 2 ? 1 : -1);   // ao ar sobem os dois; a andar alternam
      P.arms[1].rotation.z = -out;

      /* PERNAS: passo curto alternado, com o joelho implícito (uma perna só, a rodar na anca — a
         esta distância um joelho articulado não se lê e custava mais 2 meshes por pessoa). */
      const legSw = s * 0.16 * a;
      P.legs[0].rotation.x = legSw;
      P.legs[1].rotation.x = -legSw;
    }
  }

  /* regra 6: MESHES REAIS achatadas (nunca o TransformNode root) para a renderList do probe —
     a bola TEM de espelhar a pista cheia. */
  const flatMeshes = [];
  for (const P of people) {
    flatMeshes.push(P.hip, P.torso, P.head, P.hair, P.arms[0], P.arms[1], P.legs[0], P.legs[1]);
  }

  return {
    meshes: flatMeshes,
    update,
    rebuild,
    // a oclusão muda sem a multidão mudar (o botão on/off) — republica sem regenerar ninguém
    refreshOcclusion: publishOccluders,
    get count() { return generated.length; },
    get areaM2() { return lastArea; },
    get bpm() { return st.bpm; },
  };
}

export default createCrowd;
