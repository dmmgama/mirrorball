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
// pisca RARAMENTE (S3a/S14: já NÃO é Poisson — quem manda é o relógio S1 via estrelato; em modo
// manual a cadência é fixa/quantizada — ver o bloco "UM ESCRITOR" em createHats; historicamente —
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

const MAX_HATS_FALLBACK = 12;   // K1: fallback se CONFIG.hats.maxCount faltar/for inválido (regra 7)
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
function buildHat(scene, idx, mats, lampD, cutDeg) {
  const root = new BABYLON.TransformNode('hatRoot' + idx, scene);
  const r = lampD / 2;

  /* ---- 1. casca: esfera cortada por um plano OBLÍQUO — a casca É a pala ----
     (David, 2026-09-01: anotação a vermelho em "Λ" sobre o chapéu + foto lux-chapeu1.webp.)

     LEITURA DA FOTO (chapéu dourado central): o chapéu NÃO é uma meia esfera com uma aba colada.
     É uma esfera cortada por um plano INCLINADO: por isso a casca é COMPRIDA do lado de cima/trás
     e CURTA do lado de baixo/frente. Essa vertente comprida de cima É a pala — desce do cume sobre
     a boca e projeta-se para a frente, exatamente o "Λ" que o David desenhou (duas vertentes a
     encontrarem-se no cume, a da frente mais comprida). Não é um anel plano nem uma aba horizontal.

     ⚠ O QUE ESTAVA ERRADO: corte HORIZONTAL (hemisfério) + um cilindro `arc:0.5` como "pala" — dava
     exatamente o anel/saia que o David marcou como errado.

     CONSTRUÇÃO: malha própria (não há corte oblíquo no MeshBuilder). Para cada meridiano `u`, o
     plano de corte cruza a esfera a uma latitude diferente; parametriza-se a superfície entre esse
     bordo e o polo. O plano passa pelo centro e tem normal inclinada `cutDeg` do eixo da boca:
       normal = (0, sin(cut), cos(cut))   → boca em +Z, vertente comprida em +Y (cima).
     `keep(p) = dot(p, normal) <= 0` fica com a metade da cúpula; o bordo é a elipse do corte.
     Com cutDeg=0 volta a ser a meia esfera de antes; a foto pede ~30-38°. */
  // inclinação do plano de corte (graus) — vem de `createHats` (lida do CONFIG uma vez; a casca
  // constrói-se aqui e não se refaz por frame, por isso o knob exige reload como `lampDiameter`).
  const CUT_DEG = cutDeg;
  const cut = CUT_DEG * Math.PI / 180;
  /* Construção: esfera QUASE fechada (vai do polo de trás até `tOpen`, deixando só a boca aberta) e,
     a partir do bordo dessa boca, uma ABA CÓNICA que continua para fora e para a frente — a PALA.
     A aba é MAIS COMPRIDA em cima do que em baixo (fator `k`, que varia com o meridiano): visto de
     perfil dá exatamente o "Λ" do David — duas vertentes a encontrarem-se sobre o cume, a da frente
     mais longa —, e de frente dá o lábio escuro em volta do ouro, como na foto.

     ⚠ TENTATIVA ANTERIOR (errada, vista ao vivo): cortar a esfera por um plano OBLÍQUO. Parecia
     certo no papel, mas cada meridiano terminava a uma latitude diferente e do lado curto o bordo
     passava do polo — a malha colapsava num BICO em baixo (uma gota/cone), nada parecido com a foto.
     Aqui o bordo da boca é um CÍRCULO (constante em `tOpen`), e a assimetria vive só no comprimento
     da aba: sem bicos, e continua a ser a casca a fazer de pala (não há peça colada).
     `cutDeg` controla a assimetria: 0 = aba simétrica (sem pala), maior = pala mais pronunciada. */
  const T_OPEN = Math.PI * 0.5;             // meia esfera: bordo da boca no equador
  const PALA_LEN = r * 0.62;                // comprimento da aba no lado COMPRIDO (cima)
  const shell = (() => {
    const RINGS = 16, FLARE = 6, SEG = 36;
    const pos = [], nor = [], idxs = [];
    const rows = RINGS + 1 + FLARE;         // cúpula + aba
    for (let i = 0; i <= SEG; i++) {
      const u = (i / SEG) * Math.PI * 2;
      const cu = Math.cos(u), su = Math.sin(u);
      // assimetria: 1 em cima (cu=+1), ~0 em baixo (cu=-1). `cut` dita a força.
      const k = 0.5 * (1 + cu) * (CUT_DEG / 45) + 0.12;
      for (let j = 0; j <= RINGS; j++) {    // ---- cúpula: polo de trás (t=0) até à boca ----
        const t = (j / RINGS) * T_OPEN;
        const st = Math.sin(t), ct = Math.cos(t);
        pos.push(r * su * st, r * cu * st, -r * ct);
        nor.push(su * st, cu * st, -ct);
      }
      for (let j = 1; j <= FLARE; j++) {    // ---- aba/pala: continua para fora e para a frente ----
        const a = j / FLARE;
        const grow = 1 + 0.16 * a;          // abre ligeiramente (tronco de cone)
        pos.push(r * su * grow, r * cu * grow, PALA_LEN * k * a);
        nor.push(su, cu, 0.35);             // normal aproximada (aba quase cilíndrica)
      }
    }
    for (let i = 0; i < SEG; i++) {
      for (let j = 0; j < rows - 1; j++) {
        const a = i * rows + j, b = a + rows;
        idxs.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const m = new BABYLON.Mesh('hatShell' + idx, scene);
    const vd = new BABYLON.VertexData();
    vd.positions = pos; vd.normals = nor; vd.indices = idxs;
    vd.applyToMesh(m, false);
    return m;
  })();
  shell.parent = root;
  shell.material = mats.shellMat;   // `backFaceCulling=false` está no próprio material (partilhado)
  shell.isPickable = false;

  /* ---- 2. VIDRO — no plano de corte OBLÍQUO (o disco do corte) ----
     O corte passa pelo centro, logo o vidro é um disco de raio r cujo plano tem a normal inclinada
     `cut` do eixo da boca. Basta rodar o disco `cut` em torno de X (a normal do disco nasce em +Z,
     que é o eixo da boca; rodar leva-a à normal do corte). Fica a preencher exatamente o bordo. */
  const glass = BABYLON.MeshBuilder.CreateDisc('hatGlass' + idx,
    { radius: r * 0.985, tessellation: 32, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, scene);
  // o bordo da boca voltou a ser um CÍRCULO no plano z=0 (a assimetria vive na aba, não no corte),
  // por isso o vidro é um disco a direito, sem rotação.
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
  /* `slice` deixa a caloteta no TOPO (+Y), centro da esfera na origem: baixa-se (bake) para a boca
     da calote ficar na origem e roda-se para a concavidade olhar na direção da BOCA.
     Com o corte oblíquo, a lâmpada acompanha o vidro: roda -90°+cut em X (fica paralela ao plano do
     corte) e recua ao longo da NORMAL do corte, não de -Z — senão saía pelo lado curto da casca. */
  cap.position.y = -(capR - sag);
  cap.bakeCurrentTransformIntoVertices();
  cap.rotation.x = -Math.PI / 2;
  cap.position.set(0, 0, -(0.012 + sag));      // recuada ao longo do eixo da boca (-Z)
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

  /* ---- 4. (A PALA JÁ NÃO É UMA PEÇA) ----
     Com o corte oblíquo do ponto 1, a PALA é a própria vertente comprida da casca: ela desce do
     cume sobre a boca e projeta-se para a frente, sem peça adicional — que é o que a foto mostra
     (a casca continua, não há aba colada) e o que o "Λ" do David desenha.
     Fica aqui o registo de duas tentativas ERRADAS, para não se repetirem:
       (a) `CreateSphere({slice:0.30})` esticada em Z — nascia ATRÁS da cúpula, nunca passava do
           vidro; o `slice` corta em latitude, não dá aba.
       (b) meia parede de cilindro (`CreateCylinder({arc:0.5})`) à frente do vidro — dava um ANEL/
           saia à volta da boca, precisamente o que o David marcou a vermelho como errado.
     `pala` mantém-se como nome exportado por compatibilidade, apontando para a casca (a pala é ela).

     ---- 5. ARO de suspensão (David: "vê-se o arco por cima do chapéu") ----
     Arco por onde pega a haste. Na foto é um estribo/yoke que passa POR CIMA da cúpula, no plano
     vertical que contém o eixo do chapéu.

     ⚠ 1ª tentativa (falhou, medida na cena): um TORUS inteiro dava um anel fechado a rodear o
     chapéu de lado (y ±0.48, z ±0.48) — metade dele atravessava a boca.
     Correto: `CreateTorus` não tem `arc`, mas `CreateTube` desenha um tubo ao longo de um caminho —
     usa-se meia circunferência (só a metade de CIMA), num raio ligeiramente maior que a concha. */
  /* O arco é um ESTRIBO: passa de um lado ao outro POR CIMA da cúpula, como o yoke de um PAR — os
     dois pés agarram o chapéu nos flancos (±X) e o vértice fica no topo (+Y). Fica portanto no
     plano XY local, recuado em Z para o meio da concha (senão cruzava a boca — medido na 1ª
     tentativa, que o pôs no plano YZ e dava z ∈ [-0.58, +0.58], a atravessar o vidro). */
  const AR_R = lampD * 0.56;                     // raio do arco (um pouco fora da casca)
  // recuo para o corpo da cúpula. Com o corte oblíquo o lado curto fica em -Y, por isso o arco
  // assenta um pouco mais atrás para não roçar o bordo do vidro do lado de baixo.
  const AR_Z = -lampD * 0.30;
  const arcPath = [];
  for (let a = 0; a <= 24; a++) {
    const t = Math.PI * (a / 24);                // 0..PI = meia volta, de -X a +X passando por +Y
    arcPath.push(new BABYLON.Vector3(-Math.cos(t) * AR_R, Math.sin(t) * AR_R, AR_Z));
  }
  const aro = BABYLON.MeshBuilder.CreateTube('hatAro' + idx, {
    path: arcPath, radius: lampD * 0.022, tessellation: 8, cap: BABYLON.Mesh.CAP_ALL,
  }, scene);
  aro.parent = root;
  aro.material = mats.shellMat;
  aro.isPickable = false;
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
  // `pala: shell` — a pala É a vertente comprida da casca (ver ponto 4). Mantém-se a chave para o
  // resto do módulo (flatMeshes) não precisar de saber disso.
  return { root, shell, glass, inner, innerMat, stem, pala: shell, aro };
}

export function createHats(scene, CONFIG) {
  const H = () => CONFIG.hats || {};
  /* K1 (2026-09-01): pool de chapéus — antes const MAX_HATS=12 hardcoded. ⟳ reload: lido UMA vez
     aqui, no build (o pool de meshes aloca-se a seguir). Mesmo valor de hoje por defeito. */
  const MAX_HATS = num((CONFIG.hats || {}).maxCount, MAX_HATS_FALLBACK);
  const N = MAX_HATS;

  const shellMat = new BABYLON.PBRMaterial('hatShellMat', scene);
  shellMat.metallic = 0.75;
  shellMat.roughness = 0.45;
  shellMat.maxSimultaneousLights = 4;
  // a casca é uma superfície ABERTA (esfera cortada em plano oblíquo, sem tampa) — vê-se por dentro
  // quando se olha para a boca, por isso não se pode fazer culling das faces de trás.
  shellMat.backFaceCulling = false;
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
  // ângulo do corte oblíquo que faz a pala (ver buildHat). Como a geometria, só muda com reload.
  const CUT_DEG = clamp(num((CONFIG.hats || {}).cutDeg, 34), 0, 60);
  const hats = [];
  for (let i = 0; i < N; i++) hats.push(buildHat(scene, i, mats, LAMP_D, CUT_DEG));

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

  /* ================= F12 §4: MÁQUINA DE FLASHES DOS CHAPÉUS =================
     A F8 tinha só um Poisson que acendia UM chapéu ao calhas. O David pediu (docs/f12-estrelato.md
     §4/§5): flash mais FORTE (knob), FREQUÊNCIA controlável pelo motor, e dois gestos de conjunto —
     "todos juntos" e "sequência de uma ponta da sala à outra, SIMÉTRICA dos dois lados".

     Estado por chapéu continua a ser `{age, life}` (envelope 1→0), porque é isso que dá o flash
     seco; o que muda é QUEM se acende:
       modo 0 (sozinhos)  — um chapéu livre à sorte (o random escolhe QUAL; o QUANDO era Poisson
                            até ao S3a/S14 — agora é o relógio). É o repouso da sala.
       modo 1 (juntos)    — todos os `n` chapéus montados no mesmo instante.
       modo 2 (sequência) — um PASSO de cada vez: em cada passo acendem os DOIS chapéus (um por
                            fila) que estão à mesma distância do topo da sala. As filas avançam em
                            ESPELHO — visto da pista, uma onda que atravessa a sala de ponta a ponta.
                            Ao chegar ao fim inverte o sentido (vai-e-vem), que é o que se lê como
                            "varrimento" e não como "reinício brusco".

     TETO DE 3 Hz (regra invariável da sala) — clamp DUPLO, como no mikado.js:
       - por FIXTURE: `MIN_GAP_S` entre dois flashes do MESMO chapéu;
       - no GESTO: `SEQ_MIN_MS` entre passos da sequência e entre disparos de "todos juntos".
     Os knobs também estão clampados no painel; este é o cinto de segurança para escritas por fora. */
  const flashState = new Array(N).fill(null);
  let flashAcc = 0;
  // (a faixa fixa 0,10-0,30 s da F8 foi substituída pelo knob `flashMs` + jitter — ver flashLifeOf)
  const MIN_GAP_S = 1 / 3;          // teto ABSOLUTO por fixture (3 Hz)
  const SEQ_MIN_MS = 334;           // teto ABSOLUTO entre passos do gesto (3 Hz)
  const lastFlashAt = new Array(N).fill(-1e9);  // último flash de cada chapéu (guarda dos 3 Hz)
  /* ---- F12 §4: TETO de PointLight de chapéu SIMULTÂNEAS ----
     ⚠ Custou um erro de shader, apanhado ao vivo em WebGL2 com o modo "todos juntos":
     `VERTEX shader uniform block count exceeds GL_MAX_VERTEX_UNIFORM_BUFFERS (12)`, repetido a
     cada frame. Na F8 os chapéus flashavam UM de cada vez (Poisson) e o pico da cena era ~13 luzes
     ativas; com 12 a acender juntos passava a ~27, e o WebGL2 rebentava a compilar o shader dos
     materiais com `maxSimultaneousLights: 12` (bola, núcleo, corrente). Em WebGPU não dá erro, mas
     é na mesma trabalho pago por nada.
     O que se limita é só a luz que PINTA A SALA: o EMISSIVO de todos os chapéus continua a flashar
     (é isso que se vê). Com 12 focos dourados a bater no mesmo chão, a diferença entre 4 e 12
     PointLight não se lê — e mantém a cena dentro do orçamento de luzes de qualquer backend.

     K1 (2026-09-01): o TETO continua DURO em 4 no código — `Math.min(4, knob)` — porque é o
     WebGL2 quem rebenta acima disso, não uma preferência estética; o knob 'chapéus: luzes vivas
     máx' só pode DESCER esse teto (ex.: 2, se o David quiser poupar mais). */
  const MAX_LIVE_LIGHTS = Math.min(4, num((CONFIG.hats || {}).maxLiveLights, 4));
  const liveLightRank = new Array(N).fill(false);  // quais podem acender luz NESTE frame
  /* estado da sequência ponta-a-ponta. `cursor` = índice do PAR (0..perLine-1), `dir` = sentido.
     Regra 7 (NaN-safe): tudo nasce com valor. */
  const seq = { cursor: 0, dir: 1, nextAt: -1e9, lastGestAt: -1e9 };
  /* ---- S3a (S14): UM ESCRITOR + RELÓGIO S1 (docs/f16-sync.md §1 decisões 2, 7, 8, 9) ----
     Quem decide QUANDO os chapéus flasham é o relógio único do motor (`MUSIC.state.beatTick/
     barTick/phraseTick`, W3) e quem decide O QUÊ é o estrelato (`stardom.driveHats`, W4). hats.js
     só EXECUTA (`pulse`). O agendador autónomo (Poisson `flashPerMin` + onda com timer
     `seqStepMs`) era o SEGUNDO escritor apontado pelo audit (audit-sync-motor.md §c/§e-4) e fica
     desligado sempre que o estrelato está montado e ligado; só volta em modo MANUAL (sem estrelato:
     `estrelato (0/1)` a 0 ou módulo falhou) — e mesmo aí sem dados: passos quantizados ao
     `beatTick` quando há relógio, ao período do bombo (`bpmEst` é PERÍODO em ms) quando há música
     mas o relógio calou há 1,5 s, e a cadência fixa `60/flashPerMin` quando não há música nenhuma
     (é o que o David vê ao mexer nos knobs em silêncio). O Poisson e o timer da onda foram abatidos.
     Regra 7: tudo nasce com valor. */
  const AUTO_CLOCK_DEAD_S = 1.5;
  const auto = { lastBeatTick: -1, lastBeatAt: -1e9, nextAt: -1e9, edge: false };
  const MSget = () => (typeof window !== 'undefined' && window.MUSIC && window.MUSIC.state) || null;
  // diagnóstico (HUD/consola): quem escreveu o último gesto e com que relógio
  const diag = { writer: 'manual', clock: 'none', lastKind: '', lastAt: -1e9, pulses: 0 };
  /* `act` (regra 4, f16 §1-8): densidade espectral → DENSIDADE do gesto. A cadência já escala com
     `act` no estrelato; aqui escala quantos chapéus entram num 'all' (fração 0,5-1, do centro da
     sala para as pontas — determinístico, sem sorteio). Sem motor → 1. */
  function actNow() {
    const MS = MSget();
    return MS && MS.act != null ? clamp(num(MS.act, 1), 0, 1) : 1;
  }

  /* acende UM chapéu (respeitando o teto de 3 Hz por fixture). `life` em segundos. */
  function igniteHat(i, tSec, life) {
    if (i < 0 || i >= N) return false;
    if (tSec - lastFlashAt[i] < MIN_GAP_S) return false;
    lastFlashAt[i] = tSec;
    flashState[i] = { age: 0, life: Math.max(0.02, life) };
    return true;
  }
  /* duração de um flash a partir do knob (±40% de jitter — flashes todos iguais soam a máquina). */
  function flashLifeOf(cfg) {
    const base = Math.max(30, num(cfg.flashMs, 180)) / 1000;
    return base * (0.6 + Math.random() * 0.8);
  }

  /* ---- API para o motor (F12 §5): o estrelato dos chapéus dispara gestos daqui ----
     `pulse(kind)` — 'all' = todos juntos · 'seq' = UM passo da sequência · 'one' = um chapéu.
     Devolve true se alguma coisa acendeu (o estrelato usa isso só para o HUD).
     ⚠ O motor NUNCA liga/desliga chapéus (`chapéus (0/1)`/`quantos` são do David): se estiverem
     desligados, isto não faz nada e o estrelato redistribui — ver stardom.js. */
  function pulse(kind, tSec) {
    const cfg = H();
    if (cfg.on === false) return false;
    const n = clamp(Math.round(num(cfg.count, 12)), 0, N);
    if (!n) return false;
    const t = Number.isFinite(tSec) ? tSec : 0;
    const life = flashLifeOf(cfg);

    if (kind === 'all') {
      if (t - seq.lastGestAt < SEQ_MIN_MS / 1000) return false;
      seq.lastGestAt = t;
      /* S3a: densidade por `act` — com pouca informação espectral acendem só os pares do MEIO da
         sala (fração 0,5-1 dos pares, por fila simétrica); com muita, todos. Determinístico. */
      const perLine = Math.ceil(n / 2);
      const pairs = Math.max(1, Math.round(perLine * (0.5 + 0.5 * actNow())));
      const mid = (perLine - 1) / 2;
      // pares ordenados pela distância ao meio da sala (empate → o de Z menor); ficam os `pairs` 1.ºs
      const order = [];
      for (let k = 0; k < perLine; k++) order.push(k);
      order.sort((a, b) => (Math.abs(a - mid) - Math.abs(b - mid)) || (a - b));
      let any = false;
      for (let j = 0; j < pairs && j < order.length; j++) {
        const k = order[j];
        if (igniteHat(k, t, life)) any = true;
        const mirror = perLine + k;
        if (mirror < n && igniteHat(mirror, t, life)) any = true;
      }
      noteWrite(kind, t);
      return any;
    }
    if (kind === 'seq') {
      if (t - seq.lastGestAt < SEQ_MIN_MS / 1000) return false;
      seq.lastGestAt = t;
      noteWrite(kind, t);
      return stepSequence(n, t, life);
    }
    // 'one' (ou desconhecido): um chapéu livre à sorte — o gesto discreto da F8
    const free = [];
    for (let i = 0; i < n; i++) if (!flashState[i]) free.push(i);
    if (!free.length) return false;
    noteWrite('one', t);
    return igniteHat(free[(Math.random() * free.length) | 0], t, life);
  }
  /* regista quem mandou (para o HUD): se o estrelato está montado, é ele; senão o agendador local. */
  function noteWrite(kind, t) {
    diag.lastKind = kind; diag.lastAt = t; diag.pulses++;
    diag.writer = hasCommander() ? 'estrelato' : 'auto';
  }
  /* o estrelato está montado E ligado? (é ele o único escritor nesse caso) */
  function hasCommander() {
    const S = CONFIG.stardom;
    return !!(S && S.on !== false && S.gain);
  }

  /* ---- S3a: agendador LOCAL (só sem estrelato) — quantizado, sem Poisson, sem timer da onda ----
     `wantHz` vem dos knobs manuais: modo 2 → 1000/`seqStepMs`; modos 0/1 → `flashPerMin`/60.
     Ordem de preferência do relógio: beatTick vivo → múltiplo do período do bombo → cadência fixa.
     Dispara `pulse` no máximo uma vez por chamada (nunca rajadas por dt gigante). */
  function autoSchedule(cfg, n, t, dt) {
    const mode = Math.round(num(cfg.flashMode, 0));
    const perMin = Math.max(0, num(cfg.flashPerMin, 8));
    if (perMin <= 0) { diag.clock = 'off'; return; }   // 0 = nunca (também trava a onda, como antes)
    const wantHz = mode === 2
      ? 1000 / Math.max(SEQ_MIN_MS, num(cfg.seqStepMs, 380))
      : perMin / 60;
    const kind = mode === 2 ? 'seq' : mode === 1 ? 'all' : 'one';
    const MS = MSget();

    // aresta do relógio S1 (beatTick monotónico) — só marca, quem decide é abaixo
    auto.edge = false;
    if (MS && Number.isFinite(MS.beatTick)) {
      if (auto.lastBeatTick >= 0 && MS.beatTick > auto.lastBeatTick) { auto.edge = true; auto.lastBeatAt = t; }
      auto.lastBeatTick = MS.beatTick;
    }
    if (MS && MS.silent === true) { diag.clock = 'silêncio'; return; }   // parada suave: nada a bater

    if ((t - auto.lastBeatAt) < AUTO_CLOCK_DEAD_S) {
      diag.clock = 'beatTick';
      if (!auto.edge) return;
      const periodMs = num(MS.bpmEst, 0) > 0 ? MS.bpmEst : 60000 / 128;   // bpmEst = PERÍODO em ms
      const beatHz = 1000 / periodMs;
      const div = Math.max(1, Math.round(beatHz / Math.max(0.05, wantHz)));
      if (MS.beatTick % div !== 0) return;
      pulse(kind, t);
      auto.nextAt = t + 1 / Math.max(0.05, wantHz);
      return;
    }
    // sem tick: cadência própria — múltiplo do tempo se há bombo estimado, senão fixa
    let period = 1 / Math.max(0.05, wantHz);
    if (MS && num(MS.bpmEst, 0) > 0) {
      const beatS = MS.bpmEst / 1000;
      period = Math.max(beatS, Math.round(period / beatS) * beatS);
      diag.clock = 'bpmEst';
    } else {
      diag.clock = 'fixo';
    }
    if (t >= auto.nextAt) { auto.nextAt = t + Math.max(1 / 3, period); pulse(kind, t); }
  }

  /* UM passo da sequência ponta-a-ponta. As duas filas são espelho uma da outra: `positions()`
     numera 0..perLine-1 na fila X negativo e perLine..n-1 na fila X positivo, ambas ordenadas por Z
     crescente — logo o par simétrico do passo `k` é (k, perLine + k). Quando a contagem é ímpar a
     fila da direita tem menos um; o índice que não existe é simplesmente ignorado. */
  function stepSequence(n, t, life) {
    const perLine = Math.ceil(n / 2);
    if (perLine <= 0) return false;
    const k = ((seq.cursor % perLine) + perLine) % perLine;
    let any = false;
    if (igniteHat(k, t, life)) any = true;                       // fila X negativo
    const mirror = perLine + k;
    if (mirror < n && igniteHat(mirror, t, life)) any = true;    // fila X positivo (o espelho)
    // avança em vai-e-vem: ao chegar a uma ponta, volta para trás (varrimento contínuo)
    seq.cursor += seq.dir;
    if (seq.cursor >= perLine) { seq.cursor = Math.max(0, perLine - 2); seq.dir = -1; }
    else if (seq.cursor < 0) { seq.cursor = Math.min(perLine - 1, 1); seq.dir = 1; }
    return any;
  }

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
      /* F12: limpar o estado ao desligar (o par liga/desliga tem de ser SIMÉTRICO — armadilha da
         F11). Sem isto, voltar a ligar retomava um flash a meio da vida ou uma sequência no meio do
         percurso, e o David via um arranque estranho ao carregar no toggle. O ramo "ligado" volta a
         posicionar/ativar tudo no loop abaixo, por isso não há nada a repor à mão. */
      for (let i = 0; i < N; i++) { flashState[i] = null; liveLightRank[i] = false; }
      flashAcc = 0; seq.cursor = 0; seq.dir = 1; seq.nextAt = -1e9;
      auto.lastBeatTick = -1; auto.lastBeatAt = -1e9; auto.nextAt = -1e9; auto.edge = false;
      return;
    }
    const glow = clamp(num(cfg.glow, 0.35), 0, 3);
    const goldRgb = applyColorToggle(CONFIG, ...hueToRgb(GOLD_HUE, 0.72, 1));
    const pos = positions(n, cfg);

    /* F12 §5: força do flash DESTE frame = knob × ganho do ESTRELATO (1 = neutro; ~0,45 quando os
       chapéus são só auxiliares da bola; 0 quando o mikado é a estrela — exclusão mútua). Aqui é um
       GANHO (e não um filtro de disparo como no mikado) porque o papel auxiliar é precisamente
       "flashes LIGEIROS de suporte" (spec §5a): a mesma cadência, menos peso.
       Calculado UMA vez por frame, fora do loop dos 12 chapéus. Sem stardom → 1. */
    const starHats = (() => {
      const g = CONFIG.stardom && CONFIG.stardom.gain;
      return g ? clamp(num(g.hats, 1), 0, 2) : 1;
    })();
    const flashGainNow = Math.max(0, num(cfg.flashGain, 4.2)) * starHats;

    /* ---- agendamento: UM ESCRITOR (S3a, S14) ----
       Com o estrelato montado e ligado, NADA se agenda aqui — `stardom.driveHats` chama `pulse()`
       nas arestas do relógio S1 (acentos em `beatTick`, apoio em `barTick`) e os knobs manuais
       `flash /min` / `modo` / `sequência ms/passo` ficam INERTES (são do modo manual). Sem
       estrelato, o agendador local `autoSchedule` corre — quantizado ao relógio, sem Poisson.
       (Antes, o Poisson `flashAcc` e a onda `seq.nextAt` corriam SEMPRE por baixo do estrelato:
       era o duplo comando do audit; `igniteHat` só garantia os 3 Hz, não a coerência.) */
    const t = Number.isFinite(tSec) ? tSec : 0;
    if (hasCommander()) {
      diag.writer = 'estrelato';
      diag.clock = 'stardom';
      flashAcc = 0; seq.nextAt = -1e9;   // o modo manual retoma limpo se o estrelato for desligado
    } else {
      autoSchedule(cfg, n, t, dt);
    }

    /* ---- pré-passo: QUAIS os chapéus que podem acender uma PointLight neste frame ----
       (ver o comentário longo em `MAX_LIVE_LIGHTS`, mais abaixo no loop). Ordena-se por "quão
       fresco está o flash" — `1 − age/life`, o mesmo `flashT` que o loop vai calcular — e ficam os
       `MAX_LIVE_LIGHTS` primeiros. Barato: um sort de ≤12 elementos, e só quando há flashes vivos. */
    liveLightRank.fill(false);
    {
      const alive = [];
      for (let i = 0; i < n; i++) {
        const s = flashState[i];
        if (s) alive.push([i, 1 - clamp(s.age / s.life, 0, 1)]);
      }
      if (alive.length > MAX_LIVE_LIGHTS) alive.sort((a, b) => b[1] - a[1]);
      const k = Math.min(alive.length, MAX_LIVE_LIGHTS);
      for (let j = 0; j < k; j++) liveLightRank[alive[j][0]] = true;
    }

    for (let i = 0; i < n; i++) {
      const fx = hats[i], p = pos[i];
      fx.root.position.set(p.x, p.y, p.z);
      /* MIRA — os chapéus são FLOODS para BAIXO (para a pista), ligeiramente inclinados para dentro:
         a boca aponta ao chão, num ponto deslocado `tan(tilt)·queda` na direção da pista (para o eixo
         central da sala, ou seja -sign(x) em X). O alvo é SEMPRE abaixo do chapéu (nunca aponta para
         cima) e sempre determinístico (posição fixa, regra do David).
         `tiltDeg` = graus a partir da VERTICAL (0 = boca a apagar direto para o chão).
         F8-b (David, 2026-09-01, ref. lux-chapeu1.webp): 25° era demais — na foto a boca está quase
         na vertical, só ligeiramente inclinada. Default passou a 15° (faixa pedida: 10-20°), com
         knob 'chapéus: inclinação°' para o David afinar ao vivo. */
      const tilt = num(cfg.tiltDeg, 15) * Math.PI / 180;
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

      /* haste/cabo VERTICAL do topo do ARO até ao teto (não é filha do root inclinado — ver
         buildHat). O aro tem Ø 0.92·lampD, logo o seu ponto mais alto está ~0.46·lampD acima do
         centro; usa-se lampD/2 (o raio da concha), que é praticamente o mesmo e mantém a haste a
         nascer do arco de suspensão, como na foto. Se o chapéu estiver colado ao teto, esconde-se. */
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
      /* F12 §4: a FORÇA do flash passa a knob (`chapéus: força do flash`). Antes eram 2,2 fixos no
         código e uma PointLight a ×8 — o David chamou-lhe "levezinho". O default 4,2 quase duplica
         o pico visível; a luz de sala acompanha na mesma proporção, senão o chapéu ficava brilhante
         mas sem pintar nada à volta (que é o que o faz ler como um flash a sério). */
      const fGain = flashGainNow;
      const emit = glow + flashT * fGain; // flash soma-se ao brilho contínuo
      fx.innerMat.emissiveColor.set(goldRgb[0] * emit, goldRgb[1] * emit, goldRgb[2] * emit);

      // luz de sala só para os `MAX_LIVE_LIGHTS` flashes mais frescos (ver o bloco lá em cima)
      const L = flashLights[i];
      if (flashT > 0.01 && liveLightRank[i]) {
        L.position.set(p.x, p.y - LAMP_D * 0.5, p.z); // à boca do chapéu (lâmpada Ø 1 m → meio diâmetro abaixo do centro)
        // ×3.6 por unidade de `flashGain` ⇒ o default 4,2 dá ~15 (a F8 dava 8 fixo). Regra 6 é da
        // BOLA (esta luz nem lhe toca: `excludeBallFromRoomLights`), mas mantém-se luz de SALA.
        L.intensity = flashT * fGain * 3.6;
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
  // lista ACHATADA de meshes reais (casca + vidro + calote + pala + aro + haste); `root.setEnabled()`
  // controla a visibilidade dos filhos do TransformNode; a haste é solta e tem o seu setEnabled.
  // `h.pala === h.shell` (a pala é a vertente comprida da casca) — não se repete na lista.
  const flatMeshes = [];
  for (const h of hats) { flatMeshes.push(h.shell, h.glass, h.inner, h.aro, h.stem); }

  return {
    meshes: flatMeshes,
    lights: flashLights,
    update,
    /* F12 §4/§5: porta do MOTOR para os chapéus. 'all' = todos juntos · 'seq' = um passo da
       sequência ponta-a-ponta simétrica · 'one' = um chapéu (flash auxiliar discreto).
       O motor NUNCA liga/desliga chapéus — se o David os tiver desligados, isto devolve false. */
    pulse,
    /* S3a (diagnóstico, HUD `h`/consola): quem mandou o último gesto ('estrelato' | 'auto' |
       'manual'), que relógio o agendador local está a usar ('stardom' quando é o estrelato a
       mandar; 'beatTick' | 'bpmEst' | 'fixo' | 'silêncio' | 'off' em modo manual), último gesto,
       instante e total de gestos. */
    get writer() { return diag.writer; },
    get clock() { return diag.clock; },
    get lastGesture() { return { kind: diag.lastKind, at: diag.lastAt, pulses: diag.pulses }; },
    // quantos chapéus estão MONTADOS agora (o estrelato usa isto para saber se são elegíveis)
    get mountedCount() {
      const cfg = H();
      if (cfg.on === false) return 0;
      return clamp(Math.round(num(cfg.count, 12)), 0, N);
    },
  };
}
