// v2/hats.js — F8: chapéus de latão pendurados do TETO, em 2 linhas retas ao longo dos corredores.
//
// ---- GEOMETRIA AUTORITATIVA (David, 2026-09-01 — docs/f8-sala-lux.md) ----
// "12 chapéus, 6 por corredor lateral, em 2 LINHAS RETAS a 1 m de cada parede lateral, igualmente
//  espaçados ao longo dos 15 m, lâmpada Ø 1,0 m, base a 2,5 m do chão, pendurados do teto."
// Substituiu o anel oval do 1º incremento (2026-08-31). Em Babylon (origem = centro da bola,
// 1 raio = 1 m; doc_Y→X, doc_X→Z):
//   X = ±cfg.lineX (±4.0 = 1 m das paredes, halfW 5.0)
//   Z = passo cfg.spacingZ (2,5 m), 6 por linha centradas em z=0 → -6.25 -3.75 -1.25 +1.25 +3.75 +6.25
//   Y  = floor + heightM + raio da lâmpada  (heightM é a altura da BASE/boca ao chão — ver positions())
// Cada chapéu pendura-se do teto por uma HASTE/cabo fino visível (cilindro) do topo da concha até
// `room.ceil` — é assim que se lê "pendurado" e não "a flutuar".
//
// SEM paridade na Canvas 2D (tudo novo, como os corpos PAR36 de fixtures.js). MEIA ESFERA de latão
// escuro + VIDRO no plano de corte + CALOTE CÔNCAVA emissiva por dentro do vidro (a lâmpada),
// inclinada para a pista — ver o bloco "FORMA DO CHAPÉU" em buildHat() para a construção e para o
// que estava errado antes. O dourado quente é contínuo ('chapéus: brilho') e a lâmpada
// pisca RARAMENTE (Poisson no CONJUNTO TODO, não por chapéu —
// pedido do David: "piscam só às vezes") — o flash sobe o emissivo do chapéu que piscou E acende uma
// PointLight fraca nele por 0.1-0.3 s, QUE ILUMINA A SALA (pilares/chão/paredes — a bola vê esse
// reflexo indireto via o ReflectionProbe). A PointLight NÃO ilumina a bola diretamente — ela exclui
// explicitamente os meshes da bola (main.js: `excludeBallFromRoomLights`), porque os chapéus
// penduram-se ABAIXO do centro da bola (regra do David 2026-08-31: "nenhum foco inferior" — toda
// incidência na bola vem de um corpo FIXO, nunca de baixo do equador para cima; os chapéus não são
// esse corpo). O brilho DOURADO do interior (material emissivo) continua a refletir-se na bola
// normalmente através do probe — é luz refletida pelo MATERIAL, não incidência direta da PointLight.
//
// Posição: FIXA por chapéu (índice na linha, `positions()` é determinístico em n/cfg — nunca
// resorteada por flash), só o emissivo/PointLight variam — já cumpre a regra acima por construção.
//
// Pool: `CONFIG.hats.count` (máx MAX_HATS) meshes pré-criados, nunca destruídos — só `setEnabled`
// por frame, acompanhando SEMPRE a contagem (bug S9 nº1: thinInstanceCount=0/objeto oculto sem
// setEnabled(false) desenha a mesh base em WebGPU). Aqui são meshes normais (não thin instances),
// mas a mesma disciplina aplica-se às PointLight do pool de flash.
//
// createHats(scene, CONFIG) -> { meshes, lights, update(tSec, dt) }
//   `meshes` — array ACHATADO de meshes reais por chapéu (shell + disco interior; NUNCA o
//   TransformNode raiz — um ReflectionProbe.renderList com um TransformNode rebenta em WebGPU,
//   ver comentário no fim do ficheiro) para o main.js juntar a `room.planes`/pillars antes do
//   `ball.attachProbe(list)` — a bola TEM de os espelhar, é o coração da F8.
//   `lights` — as PointLight de flash (pool, 1 por chapéu) — o main.js exclui a bola delas.

import { applyColorToggle, hueToRgb } from './colorutil.js?v=1';

function num(v, d) { return Number.isFinite(v) ? v : d; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

const MAX_HATS = 12;
const GOLD_HUE = 42; // ~#d9a640 dourado quente (hue≈42° em HSV)
const BRASS_DARK = [0.06, 0.05, 0.03]; // exterior latão escuro (quase preto, só um traço quente)

// meia-esfera aberta (paraboloide aproximado): CreateSphere com slice (metade), boca para -Z local
/* ---- FORMA DO CHAPÉU (corrigida pelo David, 2026-09-01 — docs/f8-sala-lux.md "Forma do chapéu") ----
   O chapéu é basicamente uma MEIA ESFERA; o plano de corte da semiesfera é um VIDRO; imediatamente
   por dentro do vidro há uma superfície CÔNCAVA de raio ligeiro virada para dentro — essa superfície
   côncava é o foco/lâmpada (é ela que brilha dourado). O chapéu fica por cima e a luz sai PARA A
   FRENTE da semiesfera, através do vidro. NADA sobressai para fora da concha.

   ⚠ O QUE ESTAVA ERRADO (1ª versão): `CreateSphere({slice: 0.55})` NÃO corta uma semiesfera por um
   plano — `slice` corta em LATITUDE (phi), deixando uma calote aberta no topo/fundo em Y. Com o
   disco emissivo pousado no plano XY em z=-0.02 (a "boca" do slice abre em Y, não em Z), o disco
   dourado atravessava a casca de lado e lia-se como um ÓVULO/lóbulo a sair para fora do chapéu.

   ---- CONSTRUÇÃO CORRETA (tudo em espaço LOCAL do `root`; +Z local = para onde a luz sai) ----
   CONVENÇÃO: a BOCA abre para +Z, porque é o +Z que o `lookAt(alvo)` do `update()` alinha com o
   alvo na pista — assim não é preciso yaw nenhum na orientação (ver o comentário lá).
   `CreateSphere({slice: 0.5})` dá meia esfera aberta em -Y (hemisfério superior, boca virada para
   baixo); roda-se -90° em X para a boca passar a olhar para +Z. O plano de corte fica no plano XY
   local (z=0), que é onde entram o vidro e a calote — todos coaxiais.

     z = 0        plano de corte = VIDRO (disco, ligeiro brilho/transparência)
     z = -recuo   CALOTE CÔNCAVA rasa, emissiva dourada (a lâmpada), virada para +Z (para o vidro)
     z < 0        interior da casca de latão escuro (o "chapéu" por cima)

   A calote é uma esfera de raio GRANDE (raio ligeiro = pouca curvatura) da qual se toma só a
   caloteta que cabe na boca, empurrada para dentro da concha — nunca ultrapassa z=0, logo nunca
   sobressai para fora do vidro. */
function buildHat(scene, idx, mats, lampD) {
  const root = new BABYLON.TransformNode('hatRoot' + idx, scene);
  const r = lampD / 2;

  // ---- 1. casca: MEIA esfera de latão escuro, boca virada para -Z local ----
  const shell = BABYLON.MeshBuilder.CreateSphere('hatShell' + idx, {
    diameter: lampD, slice: 0.5, segments: 16, sideOrientation: BABYLON.Mesh.DOUBLESIDE,
  }, scene);
  /* `slice: 0.5` deixa o hemisfério em +Y, com o plano de corte em y=0 e a boca aberta para -Y.
     CONVENÇÃO deste módulo: a BOCA abre para +Z local (é o eixo que o `lookAt()` do update alinha
     com o alvo, sem yaw nenhum) e a CÚPULA recua para -Z, atrás do vidro.
     `rotation.x = -PI/2` faz isso — verificado na cena: shell z ∈ [-0.5, 0], todo atrás do plano
     do vidro (z=0), nada a sobressair pela boca. */
  shell.rotation.x = -Math.PI / 2;
  shell.parent = root;
  shell.material = mats.shellMat;
  shell.isPickable = false;

  // ---- 2. VIDRO no plano de corte (z=0) ----
  // disco transparente com um ligeiro brilho especular — fecha a semiesfera sem esconder a lâmpada.
  const glass = BABYLON.MeshBuilder.CreateDisc('hatGlass' + idx,
    { radius: r * 0.985, tessellation: 24, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, scene);
  // DOUBLESIDE: vê-se de ambos os lados, não precisa de rotação (fica no plano de corte, z=0).
  glass.parent = root;
  glass.material = mats.glassMat;
  glass.isPickable = false;

  /* ---- 3. CALOTE CÔNCAVA emissiva (a lâmpada), logo por dentro do vidro ----
     Esfera de raio `capR` >> r (curvatura ligeira, como pediu o David) cortada em `slice` para
     sobrar só a caloteta cuja boca tem raio ~r. Vira-se a concavidade para -Z (para o vidro) e
     recua-se em +Z o suficiente para a calote ficar INTEIRAMENTE dentro da concha (flecha `sag`). */
  const capR = r * 2.6;                                  // raio ligeiro (2,6× o raio da boca)
  const halfAng = Math.asin(Math.min(1, r / capR));      // meio-ângulo que dá uma boca de raio r
  const sag = capR - capR * Math.cos(halfAng);           // flecha (profundidade) da calote
  const cap = BABYLON.MeshBuilder.CreateSphere('hatLampCap' + idx, {
    diameter: capR * 2, slice: halfAng / Math.PI, segments: 16,
    sideOrientation: BABYLON.Mesh.DOUBLESIDE,
  }, scene);
  // `slice` deixa a caloteta no TOPO (+Y), centro da esfera na origem: baixa-se (bake) para a boca
  // da calote ficar na origem e roda-se -90° em X para a concavidade olhar para +Z (para o vidro,
  // i.e. para a pista). Recua-se depois em -Z, para a calote ficar ATRÁS do vidro, dentro da concha.
  cap.position.y = -(capR - sag);
  cap.bakeCurrentTransformIntoVertices();
  cap.rotation.x = -Math.PI / 2;
  cap.position.z = -(0.012 + sag);
  cap.parent = root;
  cap.isPickable = false;

  const innerMat = new BABYLON.PBRMaterial('hatInner' + idx, scene);
  innerMat.albedoColor = new BABYLON.Color3(0.02, 0.015, 0.005);
  innerMat.emissiveColor = new BABYLON.Color3(0, 0, 0);
  innerMat.metallic = 0.3;
  innerMat.roughness = 0.5;
  innerMat.disableLighting = false;
  innerMat.maxSimultaneousLights = 4;
  innerMat.reflectionTexture = mats.darkCube;
  cap.material = innerMat;
  const inner = cap; // `inner` = a superfície que brilha (agora a calote côncava, não um disco)

  /* haste/cabo até ao teto — "pendurados do teto" (David, F8). NÃO é filho do `root`: o root está
     INCLINADO (tiltDeg, a apontar para a pista) e o cabo tem de cair na VERTICAL. Fica solto no
     mundo, com posição/altura escritas em `update()` a partir do teto e da altura do chapéu.
     Cilindro fino (Ø 3 cm), material do exterior de latão escuro — mal se vê no escuro, mas dá a
     ligação física que faltava (sem ele os chapéus lêem-se como discos a flutuar). */
  const stem = BABYLON.MeshBuilder.CreateCylinder('hatStem' + idx,
    { diameter: 0.03, height: 1, tessellation: 6 }, scene);
  stem.material = mats.shellMat;
  stem.isPickable = false;
  stem.setEnabled(false);

  root.setEnabled(false);
  return { root, shell, glass, inner, innerMat, stem };
}

export function createHats(scene, CONFIG) {
  const H = () => CONFIG.hats || {};
  const N = MAX_HATS;

  const shellMat = new BABYLON.PBRMaterial('hatShellMat', scene);
  shellMat.metallic = 0.75;
  shellMat.roughness = 0.45;
  shellMat.maxSimultaneousLights = 4;
  // REGRA (probe/reflectionTexture própria — regressão S8 "tudo preto", mesmo padrão de room.js):
  // um cubo 1x1 quase preto, criado UMA vez e partilhado pelos materiais novos deste módulo.
  let darkCube = null;
  {
    const px = new Uint8Array([6, 5, 3, 255]);
    try {
      darkCube = new BABYLON.RawCubeTexture(
        scene, [px, px, px, px, px, px], 1,
        BABYLON.Engine.TEXTUREFORMAT_RGBA, BABYLON.Engine.TEXTURETYPE_UNSIGNED_BYTE,
        false, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);
    } catch (e) {
      console.error('[MB2] hats.js: RawCubeTexture falhou (ver comentário em v2/room.js):', e);
    }
  }
  shellMat.reflectionTexture = darkCube;
  shellMat.albedoColor = new BABYLON.Color3(BRASS_DARK[0], BRASS_DARK[1], BRASS_DARK[2]);

  /* VIDRO do plano de corte (David, 2026-09-01): "o plano de corte da semiesfera é um vidro".
     Quase transparente (alpha baixo) com um ligeiro brilho especular, para se ler a superfície sem
     esconder a calote dourada por trás. `disableLighting: false` — é o reflexo especular da sala
     que o faz aparecer como vidro. PARTILHADO pelos 12 chapéus (um material, nunca muda por frame).
     `reflectionTexture` própria obrigatória: o vidro ESTÁ na renderList do probe (regressão S8). */
  const glassMat = new BABYLON.PBRMaterial('hatGlassMat', scene);
  glassMat.albedoColor = new BABYLON.Color3(0.5, 0.5, 0.52);
  glassMat.metallic = 0.0;
  glassMat.roughness = 0.12;
  glassMat.alpha = 0.16;
  glassMat.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
  glassMat.backFaceCulling = false;
  glassMat.maxSimultaneousLights = 4;
  glassMat.reflectionTexture = darkCube;

  const mats = { shellMat, glassMat, darkCube };
  // Ø da lâmpada lido UMA vez (a geometria da concha constrói-se aqui e não se refaz por frame —
  // como os corpos de fixtures.js). Mudar `lampDiameter` exige reload, como as dimensões da sala.
  const LAMP_D = Math.max(0.05, num((CONFIG.hats || {}).lampDiameter, 1.0));
  const hats = [];
  for (let i = 0; i < N; i++) hats.push(buildHat(scene, i, mats, LAMP_D));

  // pool de PointLight de flash — 1 por hat (só as ativas ligam), nunca criadas/destruídas por frame.
  const flashLights = [];
  for (let i = 0; i < N; i++) {
    const L = new BABYLON.PointLight('hatFlash' + i, BABYLON.Vector3.Zero(), scene);
    L.intensity = 0;
    L.range = 3;
    L.diffuse = new BABYLON.Color3(1, 0.8, 0.4);
    L.specular = new BABYLON.Color3(1, 0.8, 0.4);
    L.setEnabled(false);
    flashLights.push(L);
  }

  // estado de flash por chapéu: {age, life} ou null. Poisson NO ANEL TODO (não por chapéu) — um
  // único acumulador, `flashPerMin` é a taxa TOTAL do anel (docs/f8-sala-lux.md, pedido do David:
  // "piscam só às vezes", default ~1 flash a cada 4-8 s = 7.5-15/min; CONFIG default 8/min).
  const flashState = new Array(N).fill(null);
  let flashAcc = 0;
  const FLASH_LIFE = [0.10, 0.30]; // s (brief §3: 0.1-0.3 s)

  /* posições — F8 AUTORITATIVO (David, 2026-09-01): DUAS LINHAS RETAS, não um anel.
     `n` chapéus divididos pelas 2 linhas (n/2 por linha, ímpar → a linha X=-lineX leva o extra);
     cada linha em X = ∓lineX (±4.0 = 1 m das paredes laterais), com os chapéus igualmente espaçados
     em Z de `spacingZ` (2,5 m) e CENTRADOS em z=0 — para 6 por linha isso dá exatamente
     Z = -6.25 / -3.75 / -1.25 / +1.25 / +3.75 / +6.25 (= doc_X 1,25…13,75 − 7,5). ✓ planta do doc.

     ALTURA: `heightM` é a altura FÍSICA da BASE (boca do chapéu) ao CHÃO — é assim que o David a
     mede ("base a 2,5 m do chão"), e é o que o knob 'chapéus: altura (m)' significa. O mundo Babylon
     mede Y a partir do CENTRO DA BOLA (1 raio = 1 m, centro a 3,5 m do chão → `room.floor` = -3.5),
     e o `root` do chapéu está no CENTRO da concha, meio diâmetro acima da boca:
        y_root = floor + heightM + lampD/2
     Sem a conversão floor+ os chapéus a "2.5 m" nasciam em y=2.5, ACIMA do teto (ceil=2.0) — bug
     visto ao vivo no 1º incremento. Clampa-se abaixo do teto por segurança (nunca o atravessam). */
  // chão/teto do mundo (Y) — lidos do CONFIG.room a cada uso (o knob de pé-direito pode mudar `ceil`
  // antes de um reload; ler daqui evita cachear um valor obsoleto). Defaults = sala F8 nominal.
  function floorYOf() { return num((CONFIG.room || {}).floor, -3.5); }
  function ceilYOf() { return num((CONFIG.room || {}).ceil, 2.0); }

  function positions(n, cfg) {
    const lineX = num(cfg.lineX, 4.0), spacingZ = num(cfg.spacingZ, 2.5);
    const lampD = Math.max(0.05, num(cfg.lampDiameter, 1.0));
    const R = CONFIG.room || { floor: -3.5, ceil: 2.0 };
    const floorY = num(R.floor, -3.5), ceilY = num(R.ceil, 2.0);
    const yRaw = floorY + Math.max(0, num(cfg.heightM, 2.5)) + lampD / 2;
    const y = Math.min(yRaw, ceilY - lampD * 0.5 - 0.1);
    const perLine = Math.ceil(n / 2);          // linha esquerda (X=-lineX) leva o extra se n for ímpar
    const out = [];
    for (let i = 0; i < n; i++) {
      const line = i < perLine ? 0 : 1;        // 0 = X negativo, 1 = X positivo
      const k = line === 0 ? i : i - perLine;  // índice dentro da linha
      const cnt = line === 0 ? perLine : n - perLine;
      const z = (k - (cnt - 1) / 2) * spacingZ; // centrado em z=0
      out.push({ x: (line === 0 ? -1 : 1) * lineX, y, z, line });
    }
    return out;
  }

  function update(tSec, dt) {
    const cfg = H();
    const on = cfg.on !== false;
    const n = clamp(Math.round(num(cfg.count, 12)), 0, N);
    if (!on || !n) {
      // setEnabled acompanha SEMPRE a contagem (bug S9 nº1) — inclui a haste, que não é filha do root.
      for (let i = 0; i < N; i++) { hats[i].root.setEnabled(false); hats[i].stem.setEnabled(false); flashLights[i].setEnabled(false); }
      return;
    }
    const glow = clamp(num(cfg.glow, 0.35), 0, 3);
    const goldRgb = applyColorToggle(CONFIG, ...hueToRgb(GOLD_HUE, 0.72, 1));
    const pos = positions(n, cfg);

    // Poisson: taxa TOTAL do anel (flashPerMin/60 flashes/s), não por chapéu.
    const rate = Math.max(0, num(cfg.flashPerMin, 8)) / 60;
    flashAcc += dt * rate;
    if (flashAcc > 8) flashAcc = 8; // guarda: dt gigante não deve gerar rajada
    while (flashAcc >= 1) {
      flashAcc -= 1;
      // escolhe um chapéu sem flash vivo (se todos ocupados, ignora este disparo)
      const free = [];
      for (let i = 0; i < n; i++) if (!flashState[i]) free.push(i);
      if (free.length) {
        const idx = free[(Math.random() * free.length) | 0];
        const life = FLASH_LIFE[0] + Math.random() * (FLASH_LIFE[1] - FLASH_LIFE[0]);
        flashState[idx] = { age: 0, life };
      }
    }

    for (let i = 0; i < n; i++) {
      const fx = hats[i], p = pos[i];
      fx.root.position.set(p.x, p.y, p.z);
      /* MIRA — os chapéus são FLOODS para BAIXO (para a pista), ligeiramente inclinados para dentro:
         a boca aponta ao chão, num ponto deslocado `tan(tilt)·queda` na direção da pista (para o eixo
         central da sala, ou seja -sign(x) em X). Com tilt=25° e queda ~5 m dá um alvo a ~2,3 m para
         dentro — cai no corredor/borda da pista, como nas fotos (010711). O alvo é SEMPRE abaixo do
         chapéu (nunca aponta para cima) e sempre determinístico (posição fixa, regra do David). */
      const tilt = num(cfg.tiltDeg, 25) * Math.PI / 180;
      const drop = Math.max(0.5, p.y - floorYOf());  // queda do chapéu até ao chão
      const inward = Math.tan(tilt) * drop;
      const lookTarget = new BABYLON.Vector3(p.x - Math.sign(p.x) * inward, p.y - drop, p.z);
      /* `lookAt(alvo)` alinha o +Z LOCAL com a direção do alvo — e a boca do chapéu (por onde a luz
         sai) foi construída a abrir para +Z (ver buildHat). Logo NÃO leva yaw: a boca fica virada ao
         alvo diretamente. O `Math.PI` que aqui esteve vinha da 1ª geometria (boca em -Z) e, com a
         forma nova, virava o chapéu ao contrário — medido ao vivo, a luz saía para o TETO
         (dir mundo (0.42, +0.91, 0)) em vez de para a pista. Verificação: a direção mundo da boca
         tem de ter Y NEGATIVO. */
      fx.root.lookAt(lookTarget);
      fx.root.setEnabled(true);

      /* haste/cabo VERTICAL do topo da concha até ao teto (não é filha do root inclinado — ver
         buildHat). Altura = ceil - (y + lampD/2); se o chapéu estiver colado ao teto, esconde-se. */
      const topY = p.y + LAMP_D / 2, ceilY = ceilYOf();
      const stemH = ceilY - topY;
      if (stemH > 0.02) {
        fx.stem.position.set(p.x, topY + stemH / 2, p.z);
        fx.stem.scaling.y = stemH;                  // cilindro base tem height 1 → scaling.y = metros
        fx.stem.setEnabled(true);
      } else {
        fx.stem.setEnabled(false);
      }

      // flash deste chapéu (se vivo)
      const st = flashState[i];
      let flashT = 0;
      if (st) {
        st.age += dt;
        flashT = 1 - clamp(st.age / st.life, 0, 1); // 1→0 ao longo da vida (sem envelope suave: curto e seco, como um flash real)
        if (st.age >= st.life) flashState[i] = null;
      }
      const emit = glow + flashT * 2.2; // flash soma-se ao brilho contínuo
      fx.innerMat.emissiveColor.set(goldRgb[0] * emit, goldRgb[1] * emit, goldRgb[2] * emit);

      const L = flashLights[i];
      if (flashT > 0.01) {
        L.position.set(p.x, p.y - LAMP_D * 0.5, p.z); // à boca do chapéu (lâmpada Ø 1 m → meio diâmetro abaixo do centro)
        L.intensity = flashT * 8; // fraca (regra 6 é da BOLA; ainda assim mantém-se discreto — luz de sala, não estroboscópio)
        L.diffuse.set(goldRgb[0], goldRgb[1], goldRgb[2]);
        L.specular.set(goldRgb[0], goldRgb[1], goldRgb[2]);
        L.setEnabled(true);
      } else {
        L.setEnabled(false);
      }
    }
    // setEnabled acompanha SEMPRE a contagem (bug S9 nº1) — a haste também, que é mesh independente.
    for (let i = n; i < N; i++) { hats[i].root.setEnabled(false); hats[i].stem.setEnabled(false); flashLights[i].setEnabled(false); }
  }

  // ⚠ o ReflectionProbe.renderList espera MESHES reais (com material/subMeshes) — um TransformNode
  // (o `root` de cada chapéu, usado só para posição/orientação) faz `_prepareRenderingManager`
  // rebentar em `_currentLOD` de undefined (visto ao vivo: ecrã preto + exceção no rAF). Expõe-se a
  // lista ACHATADA de meshes reais (casca + vidro + calote da lâmpada + haste); `root.setEnabled()`
  // continua a controlar a visibilidade dos três primeiros (filhos do TransformNode); a haste tem o seu.
  const flatMeshes = [];
  for (const h of hats) { flatMeshes.push(h.shell, h.glass, h.inner, h.stem); }

  return {
    meshes: flatMeshes,
    lights: flashLights,
    update,
  };
}
