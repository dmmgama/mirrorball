// v2/mikado.js — F11: MIKADO DO TETO do Lux Frágil (spec do David: docs/f11-mikado.md).
//
// ================================ O QUE É ================================
// O mikado de barras luminosas foi o ícone do teto do Lux durante ~20 anos, ANTES da bola. Fotos de
// referência: `docs/ref/lux-barras1.webp` (vista de um topo, mikado ACESO vermelho, sem bola) e
// `docs/ref/lux-barras2.webp` (outro topo, mikado APAGADO — perfis âmbar/madeira à vista — COM a
// bola no meio, e as barras abrem CLAREIRA à volta dela).
//
// ---- LEITURA DAS FOTOS (é isto que a geometria abaixo reproduz) ----
// 1. São ~35-40 barras COMPRIDAS (3-7 m) e FINAS, atiradas ao ar como paus de mikado: ângulos
//    RASOS em planta (cada uma com o seu azimute), espalhadas por VÁRIAS CAMADAS de altura numa
//    banda estreita (~0,7 m) — é a sobreposição das camadas que dá a leitura de "monte de paus"
//    e não de "grelha". Nenhuma barra é vertical; a inclinação em pitch é pequena (±6°).
// 2. Ocupam SÓ o miolo (dentro do retângulo dos pilares). Nada nos corredores laterais — nas fotos
//    as barras morrem antes dos pilares, e é por baixo delas que se anda.
// 3. Cada barra NÃO é um cilindro emissivo. É (de baixo para cima):
//       tubo luminoso  +  perfil/calha metálica em U por cima  +  terminais/tampas nas 2 pontas
//       +  2 tirantes finos até ao teto
//    Na lux-barras2 (apagado) vê-se exatamente isso: o corpo é o PERFIL (a parte metálica clara) e
//    o tubo é a faixa mais escura por baixo. Sem o perfil e os tirantes, lê-se como néon a flutuar.
//
// ================================ EFEITOS (spec §5/§6) ================================
// As barras piscam SEMPRE em conjunto — ou TODAS ao mesmo tempo, ou ALTERNANDO BLOCOS (grupos de
// 4-6 barras consecutivas). Quando piscam é com a MESMA COR, SIMULTÂNEA, em FLASHADAS (rajadas de
// N flashes secos). Cores: VERMELHO, BRANCO, AZUL (fixa ou em rotação).
// Frequência com TETO de 3 Hz — regra invariável da sala (CLAUDE.md regra 6). O clamp é DUPLO:
// o knob não passa de 3, e o agendador respeita um `minGap` de 1/3 s entre flashes (mesmo que
// alguém escreva no CONFIG por fora, ver `MIN_GAP_S`).
//
// ================================ TRIGGERS MUSICAIS (spec §7/§8) ================================
// Sem tocar em `web/music.js`: o motor já publica `window.MUSIC.state` (contadores MONOTÓNICOS
// `snareCount`/`dropCount`, o acento `snareAccent` 0..1 e a FSM `fsm`). Este módulo faz POLL desse
// objeto por frame e compara os contadores com os do frame anterior — se subiram, houve tarola/drop.
// É a integração mais barata e a que NÃO arrisca o motor (nenhuma linha de music.js muda, logo não
// há bump de cache-buster). Sem motor (`window.MUSIC` ausente) os triggers ficam inertes e o mikado
// corre no modo autónomo (rajadas por `autoPerMin`) — degrada sem erros, como manda o brief.
// O gerador sintético (tecla `g` do motor) alimenta o MESMO caminho: serve para testar sem sidecar.
//
// ================================ COEXISTÊNCIA COM A BOLA (spec §4) ================================
// Só o DAVID liga/desliga elementos (knobs `bola (0/1)` e `mikado (0/1)`) — o motor NUNCA o faz,
// só anima o que existir. Com bola+mikado, as barras que atravessam a zona da bola (esfera Ø2 m
// centro a 3,5 m + margem) são REJEITADAS na geração → clareira, como na lux-barras2. Só mikado →
// stack completo (a clareira desaparece e as barras do centro aparecem).
//
// ================================ REGRAS QUE ESTE MÓDULO CUMPRE ================================
// 1. PBR novo SEMPRE com `reflectionTexture` própria (RawCubeTexture 1×1 quase preta) — regressão
//    S8 "tudo preto" (ver o comentário longo em v2/room.js). Aplica-se a TODOS os materiais daqui.
// 2. `setEnabled` acompanha SEMPRE a contagem (bug S9 nº1): pool fixo de MAX_BARS, o que passa do
//    `count` fica desligado. V6 (S14): a contagem é `thinInstanceCount` por mesh base, e count=0
//    desliga a própria base (armadilha: count=0 não é garantia de nada desenhar).
// 3. Orientar com `rotationQuaternion` (Euler compõe YXZ e torce a barra) — armadilha S10.
// 4. NaN-safe: todo o estado nasce com valor inicial e todo o knob passa por `num(v, default)`.
// 5. Nada > 3 Hz.
// 6. `meshes` = array ACHATADO de MESHES REAIS (nunca TransformNodes — rebentam o
//    `_prepareRenderingManager` do ReflectionProbe em WebGPU). A bola TEM de espelhar o mikado.
// 7. V6 (S14, research-gpu-offload §5 G3): THIN INSTANCES — 4 meshes base (tubo, calha, tampa,
//    tirante) × MAX_BARS matrizes, cor por barra num instance buffer (como a corrente da bola).
//    Era 6 meshes reais por barra (672) + 12 materiais de tubo escritos por frame.
//
// createMikado(scene, CONFIG) -> { meshes, lights, update(tSec, dt), rebuild(), barCount }

import { applyColorToggle, toGrey } from './colorutil.js?v=1';

function num(v, d) { return Number.isFinite(v) ? v : d; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

/* Pool FIXO de barras. F12 §1: a contagem já não é um knob direto — deriva de `mikado: barras/m²`
   × área do miolo (ver `generate()`), e este teto é o limite FÍSICO do pool (nunca se realoca nada).
   48 (F11) chegava para a sala nominal, mas com a sala esticada nos knobs ⟳ a densidade pedia mais
   e ficava silenciosamente cortada — o "escala uniforme" deixava de ser verdade e o David não tinha
   como saber porquê. 96 cobre a sala nominal (~52 m²) até à densidade máxima do knob (1,6) e uma
   sala grande (~110 m²) até ~0,65. Custo: 6 meshes pequenas por barra, criadas UMA vez no arranque
   e desligadas quando não usadas (regra 2 — `setEnabled` acompanha sempre a contagem), mais 12
   materiais de tubo partilhados que não mudam; NENHUMA luz nova (o pool de PointLight do mikado
   continua a ser 4, fixo). Parou-se em 72 e não mais: as barras entram TODAS na renderList do
   ReflectionProbe (a bola tem de as espelhar) e cada uma custa 6 draws por face do cubo.
   Quando a densidade pede mais do que o pool, o `generate()` avisa na consola em vez de cortar em
   silêncio — a alternativa era o knob dizer uma coisa e a sala mostrar outra.

   ---- F13 §1: 72 → 112, por causa do modo "sala toda" ----
   O modo novo (`mikado: sala toda`) leva a zona do MIOLO (~49 m² na sala nominal) para a SALA
   INTEIRA menos 1 m de cada parede (~9 × 13 = 117 m²). Com a densidade default de 0,81/m² isso
   pede ~95 barras: a 72 o modo novo nascia CORTADO a meio e o aviso da consola disparava logo à
   primeira vez que o David clicasse no toggle — a densidade deixaria de ser densidade.
   112 cobre a sala nominal em modo sala-toda até ~0,95/m² e o miolo até ao topo do knob (1,6).
   CUSTO (até V6): 112×6 = 672 meshes pequenas, só as em uso `setEnabled(true)`; a renderList do
   probe levava o pool inteiro. V6 (S14): o pool passou a 4 meshes base com `MAX_BARS` (e 2×) thin
   instances cada — o teto custa só memória de buffer (112×16 floats por base), e a renderList do
   probe tem 4 entradas. A dívida da renderList fixa deixou de pesar. */
const MAX_BARS_FALLBACK = 112;   // K1: fallback se CONFIG.mikado.maxBars faltar/for inválido (regra 7)
const MIN_GAP_S = 1 / 3;      // teto ABSOLUTO de 3 Hz entre flashes (regra invariável da sala)
const LIGHT_HOLD_S = 2.0;     // S3b: PointLights ficam ligadas a I=0 este tempo antes de `setEnabled(false)`

/* Paleta fixada na spec: vermelho, branco, azul. Ordem = índice do knob 'mikado: cor (0=rot)'.
   1 = vermelho · 2 = branco · 3 = azul · 0 = rotação (roda a cada rajada). */
const PALETTE = [
  [1.00, 0.13, 0.09],   // vermelho (o das fotos: laranja-vermelho quente, não magenta)
  [1.00, 0.96, 0.92],   // branco (ligeiramente quente, tubo real nunca é 6500 K puro)
  [0.22, 0.42, 1.00],   // azul
];

/* RNG com seed — a disposição do mikado tem de ser ESTÁVEL entre frames e entre reloads (senão as
   barras saltavam de sítio a cada rebuild e o David nunca conseguia afinar nada). Mulberry32. */
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createMikado(scene, CONFIG) {
  const M = () => CONFIG.mikado || {};
  /* K1 (2026-09-01): pool de barras — antes const MAX_BARS=112 hardcoded. ⟳ reload: lido UMA vez
     aqui, no build (o pool de meshes aloca-se a seguir). Mesmo valor de hoje por defeito. */
  const MAX_BARS = num((CONFIG.mikado || {}).maxBars, MAX_BARS_FALLBACK);
  /* F12 §5: multiplicador do ESTRELATO (v2/stardom.js). 1 = neutro (comportamento da F11); perto
     de 0 = o mikado está a servir outra peça e recolhe. Afeta a PROBABILIDADE de a rajada arrancar
     e o brilho de REPOUSO — nunca o teto de 3 Hz, que é invariável e continua clampado no
     agendador. Se o stardom não existir (módulo desligado/ausente) devolve 1: o mikado corre como
     antes, sem saber que o sistema existe. */
  const starGain = () => {
    const g = CONFIG.stardom && CONFIG.stardom.gain;
    return g ? clamp(num(g.mikado, 1), 0, 2) : 1;
  };

  /* ---- materiais (regra 1: reflectionTexture PRÓPRIA em TODOS) ---- */
  function makeDarkCube(rgb) {
    const px = new Uint8Array([rgb[0], rgb[1], rgb[2], 255]);
    try {
      return new BABYLON.RawCubeTexture(
        scene, [px, px, px, px, px, px], 1,
        BABYLON.Engine.TEXTUREFORMAT_RGBA, BABYLON.Engine.TEXTURETYPE_UNSIGNED_BYTE,
        false, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);
    } catch (e) {
      console.error('[MB2] mikado.js: RawCubeTexture falhou — sem ela o material cai no ' +
        'scene.environmentTexture e em WebGPU o frame fica PRETO (ver v2/room.js):', e);
      return null;
    }
  }
  const darkCube = makeDarkCube([9, 8, 8]);

  /* PERFIL/calha metálica + terminais + tirantes: um material partilhado, metálico escuro. Na
     lux-barras2 (mikado apagado) o perfil lê-se como alumínio anodizado quente/madeira sob luz
     âmbar — aqui fica um metal escuro neutro que a luz da sala acende (é a sala que lhe dá o tom,
     como em todos os outros corpos deste spike). NÃO é emissivo: só o tubo brilha. */
  const railMat = new BABYLON.PBRMaterial('mikadoRail', scene);
  railMat.albedoColor = new BABYLON.Color3(0.085, 0.075, 0.065);
  railMat.metallic = 0.72;
  railMat.roughness = 0.48;
  railMat.maxSimultaneousLights = 4;   // perf: mesma nota de fixtures.js/robots.js
  railMat.reflectionTexture = darkCube;

  /* TUBO luminoso — V6 (S14, thin instances): UM só material para TODOS os tubos. A cor/brilho
     por BLOCO já não vive no material (antes: 12 `tubeMats`, um por bloco, com `.emissiveColor`
     escrito por frame) — vive no INSTANCE BUFFER `color` (4 floats por barra), como a corrente da
     bola (ball.js `chain`). Truque: o PBR `unlit` devolve `albedo × vColor` sem luz nem reflexão,
     e com `albedoColor` branco o vColor É o emissivo de antes (os valores passam de 1 sem clamp —
     o buffer é float32 e o shader não satura antes do tone-mapping). Zero recompilação de shader
     por frame: o único write é `thinInstanceBufferUpdated('color')`, e só quando algo mudou. */
  // K1 (2026-09-01): antes const MAX_BLOCKS=12 hardcoded. ⟳ reload. Mesmo valor de hoje por
  // defeito. V6: já não há materiais por bloco — o teto continua a limitar o AGRUPAMENTO.
  const MAX_BLOCKS = num((CONFIG.mikado || {}).maxBlocks, 12);
  const tubeMat = new BABYLON.PBRMaterial('mikadoTube', scene);
  tubeMat.albedoColor = new BABYLON.Color3(1, 1, 1);   // × vColor (instance buffer) = emissivo
  tubeMat.emissiveColor = new BABYLON.Color3(0, 0, 0);
  tubeMat.metallic = 0.0;
  tubeMat.roughness = 0.35;
  tubeMat.unlit = true;              // o tubo mostra a SUA cor, não reage à sala (como as lentes)
  tubeMat.useVertexColor = true;     // liga o vColor (aqui vindo do instance buffer 'color')
  tubeMat.maxSimultaneousLights = 1;
  /* ⚠ `unlit` NÃO isenta da regra 1: mantém-se a reflectionTexture própria para o material nunca
     cair no `scene.environmentTexture` (ciclo write+read com o cubo do probe em WebGPU, S8). */
  tubeMat.reflectionTexture = darkCube;

  /* ---- pool de barras: 4 MESHES BASE + THIN INSTANCES (V6, S14) --------------------------------
     Antes: 6 meshes REAIS por barra × 112 = 672 meshes (+112 TransformNodes), todas na renderList
     do probe → 672 draws por face do cubo e 672 entradas na seleção de meshes por frame. Agora:
       tube — 1 cilindro base, MAX_BARS thin instances (matriz + cor por barra)
       rail — 1 caixa base, MAX_BARS thin instances
       cap  — 1 caixa base, 2·MAX_BARS thin instances (as 2 tampas de cada barra)
       rod  — 1 cilindro base, 2·MAX_BARS thin instances (os 2 tirantes; os que não cabem sob o
              teto ficam FORA do buffer — pacote contíguo, ver `layout()`)
     = 4 meshes na cena e 4 draws (1 por base). A geometria por barra é uma MATRIZ de mundo escrita
     no `layout()` (só no rebuild, nunca por frame): `local(escala, offset) × root(quaternion, pos)`
     — a mesma composição que o TransformNode fazia, feita à mão. Os tirantes continuam SOLTOS no
     mundo (vertical, sem o root — armadilha da haste dos chapéus, hats.js).
     Regra 2 mantém-se: o que passa da contagem não existe (`thinInstanceCount`), e a contagem
     ZERO desliga a mesh base (armadilha documentada: count=0 não é garantia de nada desenhar).
     `alwaysSelectAsActiveMesh`: o bounding da base é o do cilindro unitário, não o das instâncias
     — sem isto o frustum culling (câmara E probe) escondia o mikado inteiro quando a base ficava
     fora de vista. Mesma opção da corrente. */
  const CAP = MAX_BARS;          // capacidade do pool (instâncias) — nunca se realoca
  function makeBase(name, mesh, mat, cap) {
    mesh.material = mat;
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    const matrices = new Float32Array(cap * 16);   // zeros = instância colapsada (não se vê)
    mesh.thinInstanceSetBuffer('matrix', matrices, 16, false);   // false = atualizável
    mesh.thinInstanceCount = 0;
    mesh.setEnabled(false);
    return { name, mesh, matrices, cap, count: 0 };
  }
  const tubeBase = BABYLON.MeshBuilder.CreateCylinder('mikadoTube',
    { diameter: 1, height: 1, tessellation: 10 }, scene);
  tubeBase.rotation.x = Math.PI / 2;      // deitar o cilindro ao longo de +Z local
  tubeBase.bakeCurrentTransformIntoVertices();
  const B = {
    tube: makeBase('tube', tubeBase, tubeMat, CAP),
    rail: makeBase('rail', BABYLON.MeshBuilder.CreateBox('mikadoRail',
      { width: 1, height: 1, depth: 1 }, scene), railMat, CAP),
    cap: makeBase('cap', BABYLON.MeshBuilder.CreateBox('mikadoCap',
      { width: 1, height: 1, depth: 1 }, scene), railMat, CAP * 2),
    rod: makeBase('rod', BABYLON.MeshBuilder.CreateCylinder('mikadoRod',
      { diameter: 1, height: 1, tessellation: 6 }, scene), railMat, CAP * 2),
  };
  // cor por barra (só o tubo): RGBA float, 1 por instância; escrita por frame em `update()`
  const tubeColors = new Float32Array(CAP * 4);
  for (let i = 0; i < CAP; i++) tubeColors[i * 4 + 3] = 1;
  B.tube.mesh.thinInstanceSetBuffer('color', tubeColors, 4, false);

  // por barra: só o que o `update()` precisa (bloco) — a geometria vive nas matrizes
  const bars = [];
  for (let i = 0; i < MAX_BARS; i++) bars.push({ block: 0, len: 1 });

  /* ---- pool de PointLight -------------------------------------------------------------------
     O mikado é uma luz de TETO: quando pisca tem de pintar a sala (é o que se vê nas fotos — o
     chão fica vermelho). Não se cria uma luz por barra (40 luzes matam o frame): usa-se um pool
     pequeno de luzes distribuídas pelo volume do mikado, que acendem juntas na flashada.
     A BOLA é EXCLUÍDA delas (main.js: excludeBallFromRoomLights) — o mikado está ACIMA da bola,
     e a incidência direta na bola só pode vir dos corpos montados do rig (regra do David); a bola
     vê o mikado como CORPO refletido no probe, que é o que as fotos mostram. */
  const N_LIGHTS = 4;
  const lights = [];
  for (let i = 0; i < N_LIGHTS; i++) {
    const L = new BABYLON.PointLight('mikadoLight' + i, BABYLON.Vector3.Zero(), scene);
    L.intensity = 0;
    L.range = 14;
    L.setEnabled(false);
    lights.push(L);
  }
  let lightsLastLitAt = -1e9;   // S3b: tSec do último frame com as luzes acesas (histerese)

  /* ================================ GERAÇÃO DA DISPOSIÇÃO ================================
     Determinística (RNG com seed do knob). Corre no arranque e sempre que um knob de GEOMETRIA
     muda (`rebuild()`); NÃO corre por frame.

     Cada barra: um ponto médio no miolo + um azimute + um comprimento; daí saem as 2 pontas. As
     regras que fazem a foto (e não uma grelha):
       - AZIMUTE livre 0-180° (o mikado é caótico), mas com um ligeiro viés para o eixo LONGO da
         sala (as barras mais compridas só cabem ao comprido) — `bias` abaixo.
       - PITCH raso (±pitchDeg, default 6°): nas fotos as barras estão quase à mesma cota, o que
         varia é a CAMADA. Sem isto lê-se como um monte de setas.
       - CAMADAS: `layers` cotas igualmente espaçadas dentro de `spreadM`, sorteadas por barra —
         é a sobreposição que dá profundidade.
       - As 2 PONTAS têm de ficar dentro do miolo (dentro do retângulo dos pilares, spec §2). Se
         não couberem, encurta-se a barra até caber (nunca se deixa passar dos pilares).
       - CLAREIRA DA BOLA: se a bola estiver ON, rejeita-se qualquer barra cujo segmento passe a
         menos de (raio da bola + margem) do centro da bola. É isso que abre o buraco da
         lux-barras2. Com a bola OFF a rejeição não se aplica → stack completo. */
  let generated = [];   // [{ x,y,z, yaw, pitch, len, block }]
  let lastArea = 0;      // F12 §1: área (m²) do miolo do último `generate()` — HUD/diagnóstico
  let warnedPool = false; // F12 §1: já avisou que a densidade estourou o pool? (avisa uma vez só)

  // distância mínima de um SEGMENTO 3D ao centro da bola (para a clareira)
  function segDistToBall(p0, p1, c) {
    const dx = p1.x - p0.x, dy = p1.y - p0.y, dz = p1.z - p0.z;
    const wx = c.x - p0.x, wy = c.y - p0.y, wz = c.z - p0.z;
    const dd = dx * dx + dy * dy + dz * dz;
    let t = dd > 1e-9 ? (wx * dx + wy * dy + wz * dz) / dd : 0;
    t = clamp(t, 0, 1);
    const qx = p0.x + dx * t - c.x, qy = p0.y + dy * t - c.y, qz = p0.z + dz * t - c.z;
    return Math.sqrt(qx * qx + qy * qy + qz * qz);
  }

  function generate() {
    const cfg = M();
    const rng = makeRng(Math.round(num(cfg.seed, 7)) || 7);
    const R = CONFIG.room || {};
    const floorY = num(R.floor, -3.5), ceilY = num(R.ceil, 2.0);

    /* ZONA — F13 §1: DOIS MODOS, por knob `mikado: sala toda (0/1)`.
       (a) MIOLO (modo da F11, default): dentro do retângulo dos PILARES. Os pilares estão em
           X = ±halfX e nas filas Z = ±spacingZ (3 filas centradas em 0), logo o miolo é
           |X| ≤ halfX e |Z| ≤ (rows−1)/2·spacingZ, com a folga `insetM` para as pontas não
           roçarem os pilares.
       (b) SALA TODA (F13 §1): até `wallMarginM` (default 1 m) das PAREDES. A zona passa a ser
           |X| ≤ halfW − margem e |Z| ≤ |back| − margem, e o mikado atravessa os corredores.
       A densidade barras/m² da F12 faz o resto: a área cresce ~2,5× e a contagem acompanha
       sozinha, sem o David ter de mexer noutro knob (era esse o pedido). */
    const P = CONFIG.pillars || {};
    const R2 = CONFIG.room || {};
    const inset = Math.max(0, num(cfg.insetM, 0.35));
    const rows = Math.max(1, Math.round(num(P.rows, 3)));
    const fullRoom = num(cfg.fullRoom, 0) >= 0.5;
    let halfX, halfZ;
    if (fullRoom) {
      const wm = Math.max(0, num(cfg.wallMarginM, 1.0));
      halfX = Math.max(0.5, num(R2.halfW, 5.5) - wm);
      halfZ = Math.max(0.5, Math.abs(num(R2.back, -7.5)) - wm);
    } else {
      halfX = Math.max(0.5, num(P.halfX, 3.0) - inset);
      halfZ = Math.max(0.5, ((rows - 1) / 2) * num(P.spacingZ, 5.0) - inset);
    }

    /* ---- F13 §1: as barras NÃO PODEM ATRAVESSAR OS PILARES ----
       No modo miolo o problema não existia (a zona morre antes deles). Na sala toda as barras
       passam por cima dos corredores e os pilares vão do chão ao TETO, portanto uma barra que
       cruze a planta de um pilar entra-lhe pelo betão dentro.
       DECISÃO: **REJEITAR** a barra, não encurtá-la. Encurtar seria o gesto natural (é o que já
       se faz contra as paredes), mas com 6 pilares espalhados pelo meio da zona produzia um monte
       de cotos curtos à volta de cada um — lê-se como uma malha remendada, não como o mikado das
       fotos. Rejeitar custa só sorteios (o `guard` do while já os paga) e o resultado é uma malha
       que simplesmente CONTORNA os pilares, que é o que se vê numa sala real.
       Só se testam os pilares MONTADOS: um pilar desligado no painel não é obstáculo nenhum.
       A planta é inflacionada por meio Ø do tubo + uma folga, para o tubo não roçar a aresta. */
    const pillarBoxes = [];
    if (P.on !== false) {
      const sec = Math.max(0.05, num(P.section, 0.5));
      const px = Math.abs(num(P.halfX, 3.0));
      const sz = num(P.spacingZ, 5.0);
      const z0 = -((rows - 1) * sz) / 2;
      const off = Array.isArray(P.off) ? P.off : [];
      // margem = meio tubo + meio perfil + folga de leitura (o perfil é mais largo que o tubo)
      const grow = sec / 2 + Math.max(0.02, num(cfg.tubeDiaM, 0.07)) * 1.2 + 0.05;
      let idx = 0;
      for (let side = -1; side <= 1; side += 2) {
        for (let row = 0; row < rows; row++, idx++) {
          const zc = z0 + row * sz;
          if (off.indexOf(idx) !== -1) continue;          // pilar desligado: não é obstáculo
          pillarBoxes.push({ x: side * px, z: zc, h: grow });
        }
      }
    }
    /* Interseção segmento×caixa AABB na planta XZ (slab test 2D). A altura não entra: o pilar vai
       do chão ao teto, portanto qualquer cota do mikado colide. */
    function segHitsPillar(p0, p1) {
      for (let k = 0; k < pillarBoxes.length; k++) {
        const B = pillarBoxes[k];
        const minX = B.x - B.h, maxX = B.x + B.h, minZ = B.z - B.h, maxZ = B.z + B.h;
        let t0 = 0, t1 = 1, ok = true;
        const dx = p1.x - p0.x, dz = p1.z - p0.z;
        // eixo X
        if (Math.abs(dx) < 1e-9) { if (p0.x < minX || p0.x > maxX) ok = false; }
        else {
          let a = (minX - p0.x) / dx, b = (maxX - p0.x) / dx;
          if (a > b) { const s = a; a = b; b = s; }
          if (a > t0) t0 = a; if (b < t1) t1 = b;
          if (t0 > t1) ok = false;
        }
        // eixo Z
        if (ok) {
          if (Math.abs(dz) < 1e-9) { if (p0.z < minZ || p0.z > maxZ) ok = false; }
          else {
            let a = (minZ - p0.z) / dz, b = (maxZ - p0.z) / dz;
            if (a > b) { const s = a; a = b; b = s; }
            if (a > t0) t0 = a; if (b < t1) t1 = b;
            if (t0 > t1) ok = false;
          }
        }
        if (ok) return true;
      }
      return false;
    }

    /* ALTURA: `heightM` é a altura FÍSICA do CENTRO do mikado ao chão (é assim que o David a mede;
       default 4,0 m, spec §3). Converte-se para o mundo Babylon (Y medido do centro da bola, que
       está a 3,5 m do chão → floorY é o chão). Clampa-se para o mikado nunca atravessar o teto:
       a camada mais alta + o perfil + um tirante mínimo têm de caber abaixo de `ceilY`. */
    const spread = Math.max(0, num(cfg.spreadM, 0.7));
    const yCenterRaw = floorY + Math.max(0.5, num(cfg.heightM, 4.0));
    const yCenter = Math.min(yCenterRaw, ceilY - spread / 2 - 0.18);

    const layers = Math.max(1, Math.round(num(cfg.layers, 5)));

    /* ---- F12 §1: a CONTAGEM deriva da DENSIDADE (barras/m² da zona central) ----
       Antes o knob era uma contagem ABSOLUTA: ao mexer nos knobs ⟳ da sala (vão entre filas / passo
       na fila), o miolo crescia ou encolhia e as mesmas 40 barras ficavam ora esparsas ora
       entulhadas — a malha mudava de leitura sem o David ter tocado no mikado. Com barras/m² a
       leitura fica INVARIANTE: a área do retângulo dos pilares (já com a folga `inset` aplicada, que
       é a zona onde as barras podem mesmo nascer) multiplica a densidade e dá a contagem.
       Com o default 6 m × 10 m de miolo menos a folga → ~52 m², e `densidade` 0,77 dá as MESMAS ~40
       barras do default da F11 (continuidade visual: quem não mexer em nada vê o mesmo mikado).
       `MAX_BARS` continua a ser o teto do pool — a densidade nunca pode estourá-lo.
       O determinismo da semente NÃO muda: o RNG é consumido pela mesma ordem, só o número de
       sorteios aceites é diferente; com a mesma sala e a mesma semente, a disposição é a mesma. */
    const areaM2 = Math.max(0.5, (2 * halfX) * (2 * halfZ));
    const dens = Math.max(0, num(cfg.densityPerM2, 0.77));
    const nRaw = Math.round(areaM2 * dens);
    const nWant = clamp(nRaw, 0, MAX_BARS);
    // teto do pool atingido: avisa UMA vez (senão a densidade mentia em silêncio — ver MAX_BARS)
    if (nRaw > MAX_BARS && !warnedPool) {
      warnedPool = true;
      console.warn('[MB2] mikado: a densidade pedia ' + nRaw + ' barras (' + dens.toFixed(2) +
        '/m² × ' + areaM2.toFixed(0) + ' m²) mas o pool tem ' + MAX_BARS +
        ' — a malha fica MAIS ESPARSA do que o knob diz. Baixa "mikado: barras/m²".');
    }
    const lenMin = Math.max(0.5, num(cfg.lenMinM, 3.0));
    const lenMax = Math.max(lenMin, num(cfg.lenMaxM, 7.0));
    const pitchMax = clamp(num(cfg.pitchDeg, 6), 0, 30) * Math.PI / 180;

    /* clareira da bola: só se a BOLA estiver LIGADA (spec §4 — com só mikado, stack completo).
       Raio de rejeição = raio da bola + margem do knob (default 0,5 m).
       F13 §3: o raio deixou de ser a constante 1 — vem de `CONFIG.ballR` (Ø 2,0-3,0 m → 1,0-1,5),
       que o `ball.js` publica e o `preApplyReloadKnobs` pré-calcula para o arranque. A MARGEM
       (`ballClearM`) fica em METROS: é a folga que o David quer ver entre o vidro e o tubo, e não
       tem razão nenhuma para crescer com a bola. Logo, uma bola de Ø 3 m abre um buraco 0,5 m
       maior no mikado, não 1,5×. */
    const ballOn = CONFIG.ballOn !== false;
    const rBall = clamp(num(CONFIG.ballR, 1), 1.0, 1.5);
    const clearR = ballOn ? Math.max(0, rBall + num(cfg.ballClearM, 0.5)) : -1;
    /* F12 §3: a bola já não está fixa na origem — o slider 'bola: altura (m)' desloca-a em Y, e a
       CLAREIRA tem de acompanhar. Sem isto, subir a bola para dentro do mikado fazia-a atravessar
       as barras (e descê-la deixava um buraco no ar onde já não está nada).
       ⚠ Lê-se `CONFIG.ballYEffective` (a cota JÁ CLAMPADA que o ball.js publica), NUNCA o knob em
       cru: o ball.js impede a bola de sair da sala, e derivar a cota do knob dava um valor
       diferente sempre que esse clamp entrasse. Medido antes da correção: com pé-direito 5 m e o
       knob a 4,2 m, a bola parava em +0,25 mas a clareira abria a +0,70 → barras a ATRAVESSAR a
       bola (distância mínima 0,85 quando o exigido era 1,50).
       Fallback para o knob só enquanto o ball.js ainda não correu (arranque). */
    /* F14: a CLAREIRA SEGUE A BOLA NA PLANTA (spec do David). O X e o Z saem de
       `CONFIG.ballXEffective`/`ballZEffective`, que é a posição JÁ CLAMPADA (paredes + pilares) que
       o ball.js publica — a MESMA regra do `ballYEffective`, e pela mesma razão: derivar do knob em
       cru dava um número diferente sempre que o clamp entrasse, e o buraco abria-se onde a bola não
       está. Fallback para o knob em cru só enquanto o ball.js ainda não correu (arranque; o main.js
       compara os dois logo a seguir ao `createBall` e regenera se diferirem). */
    const ballC = {
      x: num(CONFIG.ballXEffective, num(CONFIG.ballPosXM, 0)),
      y: num(CONFIG.ballYEffective, num(CONFIG.ballHeightM, 3.5) - 3.5),
      z: num(CONFIG.ballZEffective, num(CONFIG.ballPosZM, 0)),
    };

    const out = [];
    let guard = 0;
    while (out.length < nWant && guard < nWant * 260) {
      guard++;
      // ponto médio no miolo (uniforme; as camadas é que dão a estrutura)
      const layer = Math.floor(rng() * layers);
      const yBase = layers > 1 ? yCenter - spread / 2 + (layer / (layers - 1)) * spread : yCenter;
      const y = yBase + (rng() - 0.5) * (spread / Math.max(1, layers)) * 0.6; // jitter dentro da camada
      const cx = (rng() * 2 - 1) * halfX * 0.86;
      const cz = (rng() * 2 - 1) * halfZ * 0.86;

      /* AZIMUTE com viés para o eixo LONGO (Z): as barras compridas das fotos correm sobretudo ao
         comprido da sala, porque é a única direção onde cabem 6-7 m. `bias` (0 = uniforme, 1 = todas
         alinhadas com Z) mistura um ângulo uniforme com 0 rad. Mantém-se caótico: mesmo a 0.35 há
         barras a cruzar quase a 90°. */
      const bias = clamp(num(cfg.axisBias, 0.35), 0, 1);
      const rawYaw = rng() * Math.PI;                    // 0..180° (uma barra não tem frente/trás)
      const signed = rawYaw > Math.PI / 2 ? rawYaw - Math.PI : rawYaw;  // −90..+90
      const yaw = signed * (1 - bias);                   // puxa para 0 (= eixo Z) sem colapsar
      const pitch = (rng() * 2 - 1) * pitchMax;

      let len = lenMin + rng() * (lenMax - lenMin);

      // direção da barra (eixo +Z local rodado por yaw em Y e pitch em X)
      const cp = Math.cos(pitch), sp = Math.sin(pitch);
      const dir = { x: Math.sin(yaw) * cp, y: -sp, z: Math.cos(yaw) * cp };

      /* ENCURTAR até as 2 pontas caberem no miolo (spec §2: nada nos corredores). Resolve-se o
         maior `len` para o qual ambas as pontas ficam dentro de |X|≤halfX e |Z|≤halfZ. */
      const limX = Math.abs(dir.x) > 1e-4 ? (halfX - Math.abs(cx)) / Math.abs(dir.x) : Infinity;
      const limZ = Math.abs(dir.z) > 1e-4 ? (halfZ - Math.abs(cz)) / Math.abs(dir.z) : Infinity;
      const maxHalf = Math.min(limX, limZ);
      if (maxHalf < lenMin / 2) continue;                // não cabe nem a barra mais curta: outro sorteio
      len = Math.min(len, maxHalf * 2);

      const h = len / 2;
      const p0 = { x: cx - dir.x * h, y: y - dir.y * h, z: cz - dir.z * h };
      const p1 = { x: cx + dir.x * h, y: y + dir.y * h, z: cz + dir.z * h };

      // CLAREIRA: rejeita a barra que entra na zona da bola (spec §4)
      if (clearR > 0 && segDistToBall(p0, p1, ballC) < clearR) continue;

      // F13 §1: PILARES. Só pode acontecer no modo "sala toda" (no miolo a zona morre antes deles),
      // por isso nem se paga o teste no modo default. Rejeitar, não encurtar — ver a decisão acima.
      if (fullRoom && pillarBoxes.length && segHitsPillar(p0, p1)) continue;

      out.push({ x: cx, y, z: cz, yaw, pitch, len });
    }

    generated = out;
    lastArea = areaM2;
    regroup(false);   // atribui `block` a cada barra (ver `regroup()` abaixo)
    return out;
  }

  /* ---- BLOCOS: grupos CONSECUTIVOS de `blockSize` barras (spec §5: "grupos de 4-6 barras") ----
     O índice de bloco é fixo (não muda por frame) — o modo "blocos" acende um bloco de cada vez.

     ⚠ Isto é DELIBERADAMENTE separado do `generate()`. Auditoria de knobs (2026-09-01): o knob
     'mikado: tam. bloco' chamava `onMikadoGeomChanged()` → `rebuild()` → `generate()`, e o
     `generate()` re-sorteia a disposição TODA (posições, ângulos, comprimentos). Arrastar um knob
     que só devia mudar o AGRUPAMENTO dos flashes re-sorteava o mikado inteiro a cada passo do
     slider. `blockSize` não entra na geometria de barra nenhuma: só decide quem acende com quem.
     Agora o knob chama `regroup()` — reescreve `.block` sobre as barras que já lá estão.

     `resetCursor` só é `true` quando quem chama é o KNOB (a máquina de flashes já existe). No
     arranque o `generate()` chama-o com `false`: o `st` é um `const` declarado mais abaixo (:626) e
     o primeiro `rebuild()` (:619) corre ANTES disso — tocar-lhe aqui dava TDZ (e `typeof` não
     salva: sobre um `const` na TDZ o próprio `typeof` atira ReferenceError). Mesma armadilha
     documentada no `enabledPlan` (:495). */
  function regroup(resetCursor) {
    const bs = clamp(Math.round(num(M().blockSize, 5)), 1, 12);
    for (let i = 0; i < generated.length; i++) generated[i].block = Math.floor(i / bs) % MAX_BLOCKS;
    // V6: o mapa barra→bloco mudou — o `bars[i].block` e o instance buffer têm de acompanhar
    for (let i = 0; i < Math.min(generated.length, MAX_BARS); i++) bars[i].block = generated[i].block;
    colorsStale = true;
    /* O cursor e o bloco aceso referem-se à numeração ANTIGA — com menos blocos ficariam a apontar
       para um bloco que já não existe (o `update()` compara `bar.block === st.litBlock`, e um
       litBlock órfão deixava o mikado apagado até à rajada seguinte). Repõe-se o estado neutro. */
    if (resetCursor) {
      st.blockCursor = 0;
      if (st.litBlock >= nBlocks()) st.litBlock = -1;
    }
  }

  /* ---- aplicar a geometria gerada ao pool (só no rebuild, nunca por frame) ----
     `enabledPlan` guarda o que o layout decidiu montar: a CONTAGEM de instâncias de cada base
     (tubos/calhas = barras; tampas = 2×; tirantes = só os que couberam sob o teto). É o que
     `restoreEnabled()` repõe quando o knob 'mikado (0/1)' volta a 1 (ver o comentário do bug em
     `update`). O par é SIMÉTRICO: desligar = `setEnabled(false)` nas 4 bases (as contagens ficam
     intactas), ligar = `setEnabled(count > 0)` + repor a mesma contagem. Nunca se mexe nos
     buffers para ligar/desligar — é por isso que ligar/desligar N vezes seguidas não deriva. */
  const enabledPlan = { tube: 0, rail: 0, cap: 0, rod: 0 };
  /* cache da cor por bloco do último frame (V6): -1 = "nunca escrito" → o 1º frame faz upload.
     `colorsStale` força a reescrita quando o MAPA barra→bloco muda (layout/regroup), mesmo que as
     cores por bloco sejam as mesmas. */
  const blockRGB = new Float32Array(MAX_BLOCKS * 3).fill(-1);
  let colorsStale = true;
  /* estado "o grupo estava ligado no frame anterior" — declarado AQUI (e não junto ao `update`)
     porque o `rebuild()` do arranque já lhe escreve, e um `let` declarado depois dava TDZ. */
  let wasOn = true;
  function applyCount(base, n) {
    base.count = n;
    base.mesh.thinInstanceCount = n;
    // armadilha: count=0 não é garantia de nada desenhar — a mesh base desliga-se mesmo
    base.mesh.setEnabled(n > 0);
  }
  function restoreEnabled() {
    applyCount(B.tube, enabledPlan.tube);
    applyCount(B.rail, enabledPlan.rail);
    applyCount(B.cap, enabledPlan.cap);
    applyCount(B.rod, enabledPlan.rod);
  }
  function disableAll() {
    for (const k in B) B[k].mesh.setEnabled(false);
  }

  const tmpQ = new BABYLON.Quaternion();
  const tmpS = new BABYLON.Vector3(), tmpT = new BABYLON.Vector3();
  const rootM = new BABYLON.Matrix(), localM = new BABYLON.Matrix(), worldM = new BABYLON.Matrix();
  const Q_ID = BABYLON.Quaternion.Identity();
  // escreve `local(escala, offset) × root` na posição `slot` do buffer da base
  function writeChild(base, slot, sx, sy, sz, ox, oy, oz) {
    tmpS.set(sx, sy, sz); tmpT.set(ox, oy, oz);
    BABYLON.Matrix.ComposeToRef(tmpS, Q_ID, tmpT, localM);
    localM.multiplyToRef(rootM, worldM);          // filho × pai = mundo (convenção Babylon)
    worldM.copyToArray(base.matrices, slot * 16);
  }
  // escreve uma matriz SOLTA no mundo (tirantes: sem root)
  function writeWorld(base, slot, sx, sy, sz, px, py, pz) {
    tmpS.set(sx, sy, sz); tmpT.set(px, py, pz);
    BABYLON.Matrix.ComposeToRef(tmpS, Q_ID, tmpT, worldM);
    worldM.copyToArray(base.matrices, slot * 16);
  }
  function layout() {
    const cfg = M();
    const R = CONFIG.room || {};
    const ceilY = num(R.ceil, 2.0);
    const tubeD = Math.max(0.02, num(cfg.tubeDiaM, 0.10));   // Ø do tubo luminoso
    const railW = tubeD * 1.30;                              // a calha é um pouco mais larga que o tubo
    const railH = tubeD * 0.72;                              // e achatada
    const rodD = Math.max(0.008, tubeD * 0.14);              // tirante fino

    const n = Math.min(generated.length, CAP);
    let rodN = 0;   // tirantes montados — pacote contíguo no buffer (só os que cabem sob o teto)
    for (let i = 0; i < n; i++) {
      const bar = bars[i];
      const g = generated[i];
      bar.len = g.len;
      bar.block = g.block;

      // root da barra: posição + quaternion (regra 3: yaw em Y, depois pitch em X — Euler
      // compunha YXZ e torcia a barra). Escala 1 — as escalas vão nos filhos.
      BABYLON.Quaternion.RotationYawPitchRollToRef(g.yaw, g.pitch, 0, tmpQ);
      tmpS.set(1, 1, 1); tmpT.set(g.x, g.y, g.z);
      BABYLON.Matrix.ComposeToRef(tmpS, tmpQ, tmpT, rootM);

      /* TUBO por baixo, PERFIL por cima — é essa a montagem real (o perfil tapa o tubo visto de
         cima e reflete-lhe a luz para baixo). O tubo desce meio perfil para os dois corpos não
         se interpenetrarem. */
      writeChild(B.tube, i, tubeD, tubeD, g.len, 0, -railH * 0.5, 0);
      writeChild(B.rail, i, railW, railH, g.len * 1.005, 0, tubeD * 0.30, 0);

      // terminais nas 2 pontas: um pouco mais largos/altos que o perfil, curtos em Z
      const capL = Math.min(0.14, g.len * 0.035);
      for (let k = 0; k < 2; k++) {
        writeChild(B.cap, i * 2 + k, railW * 1.32, railH * 1.9, capL,
          0, tubeD * 0.10, (k === 0 ? -1 : 1) * (g.len / 2 - capL / 2));
      }

      /* TIRANTES verticais até ao teto — SOLTOS no mundo (o root está rodado; um tirante filho
         saía inclinado). Ancoram a ~25% e ~75% do comprimento, que é o que as fotos mostram
         (nunca nas pontas). Se a barra estiver colada ao teto, não se montam (ficam fora do
         pacote — é o equivalente ao `setEnabled(false)` de antes). */
      const cp = Math.cos(g.pitch), sp = Math.sin(g.pitch);
      const dir = { x: Math.sin(g.yaw) * cp, y: -sp, z: Math.cos(g.yaw) * cp };
      for (let k = 0; k < 2; k++) {
        const t = (k === 0 ? -0.25 : 0.25) * g.len;
        const ax = g.x + dir.x * t, ay = g.y + dir.y * t + tubeD * 0.5, az = g.z + dir.z * t;
        const h = ceilY - ay;
        if (h > 0.03) {
          // cilindro base height 1 → scaling.y = metros
          writeWorld(B.rod, rodN++, rodD, h, rodD, ax, ay + h / 2, az);
        }
      }
    }
    // regra 2: a contagem manda — o que passa de `n` não existe (nem para a câmara nem para o probe)
    enabledPlan.tube = n; enabledPlan.rail = n; enabledPlan.cap = n * 2; enabledPlan.rod = rodN;
    // slots acima da contagem ficam a ZERO (instância colapsada) — nunca lixo de um layout antigo
    for (const k in B) B[k].matrices.fill(0, enabledPlan[k] * 16);
    /* ORDEM: contagem PRIMEIRO, upload DEPOIS — `thinInstanceBufferUpdated('matrix')` só envia
       `thinInstanceCount` matrizes; com a contagem velha (menor) as barras novas ficavam com a
       matriz zero na GPU (invisíveis) até ao rebuild seguinte. */
    restoreEnabled();
    for (const k in B) if (B[k].count > 0) B[k].mesh.thinInstanceBufferUpdated('matrix');
    // bounding das instâncias (depois da contagem estar posta — só conta as montadas). Não é
    // para culling (alwaysSelectAsActiveMesh), é para quem lê o bounding (sombras/inspeção).
    for (const k in B) if (B[k].count > 0) B[k].mesh.thinInstanceRefreshBoundingInfo(false);
    colorsStale = true;   // V6: mapa barra→bloco e contagem podem ter mudado

    // as luzes distribuem-se pelo volume do mikado (4 pontos no miolo, à cota do mikado)
    const yL = generated.length ? generated[0].y : 0;
    const P = CONFIG.pillars || {};
    const hx = num(P.halfX, 3.0) * 0.55;
    const hz = ((Math.max(1, Math.round(num(P.rows, 3))) - 1) / 2) * num(P.spacingZ, 5.0) * 0.55;
    lights[0].position.set(-hx, yL, -hz);
    lights[1].position.set(hx, yL, -hz);
    lights[2].position.set(-hx, yL, hz);
    lights[3].position.set(hx, yL, hz);
  }

  /* `rebuild()` regenera a disposição e reescreve o pool. Se o mikado estiver DESLIGADO no momento
     do rebuild (o David mexeu num knob de geometria com 'mikado (0/1)' a 0), o `layout()` deixaria
     as barras ligadas — por isso volta-se a desligar tudo logo a seguir, ficando o `enabledPlan`
     guardado para quando ele voltar a ligar. */
  function rebuild() {
    generate();
    layout();
    if ((M().on === false)) {
      disableAll();
      wasOn = false;
    } else {
      wasOn = true;
    }
  }
  rebuild();

  /* ================================ MÁQUINA DE FLASHES ================================
     Uma RAJADA = `burst` flashes seguidos, à frequência `hz` (teto 3 Hz), todos da MESMA cor.
     No modo "todas" (mode 0) cada flash acende o mikado inteiro; no modo "blocos" (mode 1) cada
     flash acende UM bloco, avançando para o seguinte — é o "alternando blocos" da spec §5.
     Estado NaN-safe (regra 7): tudo nasce com valor. */
  const st = {
    burstLeft: 0,      // flashes que faltam nesta rajada
    nextAt: 0,         // tSec do próximo flash da rajada
    lastFlashAt: -1e9, // último flash disparado (guarda dos 3 Hz)
    lit: 0,            // envelope 1→0 do flash corrente
    litBlock: -1,      // bloco aceso (-1 = todos)
    colorIdx: 0,       // índice na PALETTE da rajada corrente
    blockCursor: 0,    // qual o próximo bloco no modo "blocos" (S3b: sorteado em `barTick`)
    lastSnare: -1,     // contadores do motor no frame anterior (-1 = ainda não lidos)
    lastDrop: -1,
    warned: false,
    /* ---- S3b (S14): RELÓGIO S1 + um escritor (f16-sync §1 decisões 2, 7, 9) ----
       O mikado deixa de ter relógios próprios: nem Poisson (`autoAcc`), nem moeda por tarola
       (`Math.random() < snareSens`), nem filtro probabilístico do estrelato. Tudo o que dispara
       dispara numa ARESTA do relógio único do motor (`MUSIC.state.beatTick/barTick/phraseTick`,
       W3): acentos em `beatTick` com um DIVISOR determinístico (sens × act × gain do estrelato),
       sorteio do bloco em `barTick` (o random escolhe O QUÊ, o relógio decide QUANDO), e a
       RAJADA MÁXIMA (drop) só uma vez por `mikadoCooldownPhrases` frases. Sem tick há 1,5 s
       cai para a cadência do bombo (`bpmEst` é PERÍODO em ms) ou para o repouso. */
    lastBeatTick: -1, lastBarTick: -1, lastPhraseTick: -1,   // últimos valores lidos (-1 = nunca)
    lastBeatAt: -1e9,      // tSec da última aresta de beatTick (relógio morto se > `sync.clockDeadS`)
    edgeBeat: false, edgeBar: false, edgePhrase: false,       // arestas DESTE frame
    beatTick: 0, barTick: 0, phraseTick: 0,                   // cópia finita do relógio
    snarePending: false,   // houve tarola desde a última aresta de tempo (acento por quantizar)
    dropPending: false,    // houve drop por executar (executa já se a aresta for próxima, senão na próxima)
    dropPendingAt: -1e9,
    lastMaxPhrase: -1e9,   // `phraseTick` da última rajada MÁXIMA (cool-down)
    autoNextAt: -1e9,      // cadência própria sem relógio (modo autónomo / fallback)
    clock: 'none',         // diagnóstico: 'beatTick' | 'bpmEst' | 'fixo' | 'silêncio' | 'off' | 'none'
    writer: 'auto',        // diagnóstico: 'estrelato' (gain publicado) | 'auto' (sem estrelato)
    lastBurst: { cause: '', at: -1e9, flashes: 0, max: false },
  };
  const DROP_SNAP_S = 0.15;          // drop lido até 150 ms depois de uma aresta de tempo dispara já
  /* K2b #5: o antigo `CLOCK_DEAD_S = 1.5` local (repetido em stardom/hats/choreo) passou a ser um
     só knob do motor, `MUSIC.sync.clockDeadS`. O 1.5 aqui é apenas o fallback da regra 7
     (k2-contrato §1.1: o fallback não é um segundo knob) e tem de ficar igual ao default do motor. */
  const SYNC_DEFAULTS = { mikadoCooldownPhrases: 2, mikadoBurstMaxBeats: 4, clockDeadS: 1.5 };
  /* knobs S3b: `MUSIC.sync` (music.js §TUNE, tuner `k`); sem motor → defaults. */
  const SYNC = () => {
    const Mc = (typeof window !== 'undefined' && window.MUSIC && window.MUSIC.config) || null;
    const y = (Mc && Mc.sync && typeof Mc.sync === 'object') ? Mc.sync : {};
    return {
      cooldown: clamp(Math.round(num(y.mikadoCooldownPhrases, SYNC_DEFAULTS.mikadoCooldownPhrases)), 0, 16),
      maxBeats: clamp(num(y.mikadoBurstMaxBeats, SYNC_DEFAULTS.mikadoBurstMaxBeats), 1, 16),
      clockDeadS: clamp(num(y.clockDeadS, SYNC_DEFAULTS.clockDeadS), 0.5, 5),   // K2b #5
    };
  };
  const MSget = () => (typeof window !== 'undefined' && window.MUSIC && window.MUSIC.state) || null;
  /* o estrelato está montado E ligado? (é ele quem dá `gain.mikado`; o mikado só executa) */
  function hasCommander() {
    const S = CONFIG.stardom;
    return !!(S && S.on !== false && S.gain);
  }
  function actNow(MS) { return MS && MS.act != null ? clamp(num(MS.act, 1), 0, 1) : 1; }
  function beatPeriodS(MS) {
    const p = MS ? num(MS.bpmEst, 0) : 0;            // bpmEst = PERÍODO em ms
    return p > 0 ? p / 1000 : 60 / 128;
  }

  function nBlocks() {
    const bs = clamp(Math.round(num(M().blockSize, 5)), 1, 12);
    return Math.max(1, Math.min(MAX_BLOCKS, Math.ceil(generated.length / bs)));
  }

  /* Começa uma rajada. `cause` só para o log/HUD. Respeita o teto de 3 Hz: se a última flashada
     foi há menos de MIN_GAP_S, o pedido é IGNORADO (não se enfileira — enfileirar seria a mesma
     coisa que exceder a frequência, só com atraso). `flashes` = comprimento da rajada (já
     decidido por quem chama); `isMax` marca a rajada máxima para o cool-down.
     S3b: o filtro probabilístico do estrelato (`Math.random() >= sg`) saiu daqui — o ganho do
     estrelato entra no DIVISOR das arestas (`accentDivisor`), determinístico. Ganho 0 = nada. */
  function startBurst(tSec, cause, flashes, isMax, force) {
    const cfg = M();
    if (tSec - st.lastFlashAt < MIN_GAP_S && !force) return false;   // `force` (drop): arranca na aresta, 1.º flash adiado até ao gap
    if (st.burstLeft > 0) return false;                      // já há rajada a decorrer
    if (starGain() <= 0) return false;                       // exclusão mútua do estrelato
    st.burstLeft = clamp(Math.round(num(flashes, num(cfg.burst, 2))), 1, 12);
    st.nextAt = force ? Math.max(tSec, st.lastFlashAt + MIN_GAP_S) : tSec;
    // COR: fixa (1-3) ou rotação (0) — a rotação avança UMA vez por rajada, nunca dentro dela
    // (spec §5: "sempre a MESMA cor em simultâneo", e uma rajada lê-se como um só gesto).
    const pick = Math.round(num(cfg.color, 0));
    if (pick >= 1 && pick <= 3) st.colorIdx = pick - 1;
    else st.colorIdx = (st.colorIdx + 1) % PALETTE.length;
    st.lastBurst.cause = cause; st.lastBurst.at = tSec; st.lastBurst.flashes = st.burstLeft; st.lastBurst.max = !!isMax;
    if (isMax) st.lastMaxPhrase = st.phraseTick;
    return true;
  }

  /* Comprimento da RAJADA MÁXIMA (drop): `burst × dropBurstMul`, mas nunca mais do que cabe em
     `mikadoBurstMaxBeats` tempos à frequência da rajada (teto 3 Hz mantém-se em `MIN_GAP_S`). */
  function maxBurstFlashes(MS) {
    const cfg = M();
    const hz = clamp(num(cfg.hz, 2.4), 0.2, 3);
    const beats = SYNC().maxBeats;
    const cap = Math.max(1, Math.floor(beats * beatPeriodS(MS) * hz + 1e-6));
    return clamp(Math.min(Math.round(num(cfg.burst, 2) * num(cfg.dropBurstMul, 2)), cap), 1, 12);
  }
  /* cool-down da rajada máxima em FRASES do relógio (default 2 = 16 compassos, f16 §2) */
  function cooldownLeft() {
    const cd = SYNC().cooldown;
    if (st.lastMaxPhrase <= -1e8) return 0;
    return Math.max(0, cd - (st.phraseTick - st.lastMaxPhrase));
  }

  /* Divisor das arestas de tempo para os ACENTOS (determinístico, substitui a moeda `snareSens`):
     sens 1 × act 1 × ganho 1 → todos os tempos com tarola; sens 0,55 → um em dois; `act` baixo e
     ganho do estrelato < 1 espaçam mais. 0 → nunca. */
  function accentDivisor(MS) {
    const cfg = M();
    const sens = clamp(num(cfg.snareSens, 0.55), 0, 1);
    const sg = clamp(starGain(), 0, 2);
    const dens = sens * (0.5 + 0.5 * actNow(MS)) * Math.min(1, sg);
    if (dens <= 0.01) return 0;
    return clamp(Math.round(1 / dens), 1, 8);
  }

  /* ---- lê o relógio S1 e os contadores do motor; marca as arestas deste frame ----
     NÃO toca em music.js: poll de `window.MUSIC.state`. `snareCount`/`dropCount` continuam a ser
     lidos por delta, mas já não disparam nada por si — só marcam `snarePending`/`dropPending`,
     que a aresta do relógio consome. */
  function pollMusic(tSec) {
    const cfg = M();
    const MS = MSget();
    st.edgeBeat = st.edgeBar = st.edgePhrase = false;
    st.writer = hasCommander() ? 'estrelato' : 'auto';
    if (!MS) {
      if (!st.warned && cfg.snareOn !== false) {
        st.warned = true;
        console.warn('[MB2] mikado: motor de música ausente (window.MUSIC) — triggers de tarola/drop ' +
          'inertes; o mikado corre em modo autónomo (knob "mikado: auto /min"). Sem sidecar isto é ' +
          'esperado; a tecla `g` do motor liga o gerador sintético para testar.');
      }
      st.clock = 'none';
      return null;
    }

    // relógio S1: arestas por delta dos contadores monotónicos (1.ª leitura só regista)
    const bt = num(MS.beatTick, 0), bar = num(MS.barTick, 0), ph = num(MS.phraseTick, 0);
    if (st.lastBeatTick >= 0) {
      if (bt > st.lastBeatTick) { st.edgeBeat = true; st.lastBeatAt = tSec; }
      if (bar > st.lastBarTick) st.edgeBar = true;
      if (ph > st.lastPhraseTick) st.edgePhrase = true;
    }
    st.lastBeatTick = bt; st.lastBarTick = bar; st.lastPhraseTick = ph;
    st.beatTick = bt; st.barTick = bar; st.phraseTick = ph;

    const snare = num(MS.snareCount, 0), drop = num(MS.dropCount, 0);
    // 1ª leitura: só regista (senão o mikado disparava uma rajada por cada evento já acumulado)
    if (st.lastSnare < 0) { st.lastSnare = snare; st.lastDrop = drop; return MS; }
    if (drop > st.lastDrop) {
      st.lastDrop = drop;
      if (cfg.dropOn !== false) { st.dropPending = true; st.dropPendingAt = tSec; }
    }
    if (snare > st.lastSnare) {
      st.lastSnare = snare;
      if (cfg.snareOn !== false) st.snarePending = true;
    }
    return MS;
  }

  /* ---- S3b: quem decide QUANDO — arestas do relógio (ou cadência própria sem relógio) ----
     Dispara no máximo UMA rajada por chamada (nunca rajadas por dt gigante). */
  function schedule(MS, tSec) {
    const cfg = M();
    const alive = !!MS && (tSec - st.lastBeatAt) < SYNC().clockDeadS;   // K2b #5

    // sorteio do bloco: só em `barTick` (modo "blocos"); dentro da rajada avança sequencialmente
    if (st.edgeBar && Math.round(num(cfg.mode, 0)) >= 1) {
      const blocks = nBlocks();
      if (blocks > 1) st.blockCursor = (Math.random() * blocks) | 0;
    }

    if (MS && MS.silent === true) { st.clock = 'silêncio'; st.snarePending = false; return; }

    // ---- DROP: a rajada máxima — uma vez por cool-down; fora dele vale como acento ----
    if (st.dropPending) {
      const snap = alive && (tSec - st.lastBeatAt) <= DROP_SNAP_S;   // aresta acabou de passar
      const fire = !alive || st.edgeBeat || snap;
      if (fire) {
        st.dropPending = false;
        const isMax = cooldownLeft() <= 0;
        const n = isMax ? maxBurstFlashes(MS) : clamp(Math.round(num(cfg.burst, 2)), 1, 8);
        st.burstLeft = 0;                                          // o drop interrompe uma rajada de acento
        startBurst(tSec, isMax ? 'drop' : 'drop (cool-down)', n, isMax, true);
        st.snarePending = false;
        return;
      }
    }

    if (alive) {
      st.clock = 'beatTick';
      if (!st.edgeBeat) return;
      // ---- ACENTO na aresta de tempo: tarola desde a última aresta E divisor determinístico ----
      const div = accentDivisor(MS);
      const hadSnare = st.snarePending;
      st.snarePending = false;
      if (div > 0 && hadSnare && st.beatTick % div === 0) {
        startBurst(tSec, 'tarola', clamp(Math.round(num(cfg.burst, 2)), 1, 8), false);
        return;
      }
      // sem tarola (motor sem tarola detetada): o modo autónomo quantizado ao tempo
      autoQuantized(MS, tSec, true);
      return;
    }

    // ---- sem relógio vivo: cadência própria (múltiplo do bombo estimado ou fixa) ----
    autoQuantized(MS, tSec, false);
  }

  /* modo AUTÓNOMO (knob `autoPerMin`; 0 = nunca): SEM Poisson. Com relógio vivo dispara nas
     arestas de tempo múltiplas de um divisor (`beatHz / wantHz`); sem relógio, período múltiplo
     do bombo estimado ou fixo `60/autoPerMin`. Com estrelato montado o autónomo só corre quando o
     ganho do mikado é > 0 (o estrelato decide se há palco). */
  function autoQuantized(MS, tSec, onEdge) {
    const perMin = Math.max(0, num(M().autoPerMin, 4));
    if (perMin <= 0) { if (!onEdge) st.clock = 'off'; return; }
    if (starGain() <= 0) return;
    const wantHz = perMin / 60;
    if (onEdge) {
      const beatHz = 1 / beatPeriodS(MS);
      const div = Math.max(1, Math.round(beatHz / Math.max(0.01, wantHz) / Math.max(0.05, Math.min(1, starGain()))));
      if (st.beatTick % div !== 0) return;
      startBurst(tSec, 'auto', clamp(Math.round(num(M().burst, 2)), 1, 8), false);
      st.autoNextAt = tSec + 1 / wantHz;
      return;
    }
    let period = 1 / wantHz;
    if (MS && num(MS.bpmEst, 0) > 0) {
      const beatS = beatPeriodS(MS);
      period = Math.max(beatS, Math.round(period / beatS) * beatS);
      st.clock = 'bpmEst';
    } else {
      st.clock = MS ? 'fixo' : 'none';
    }
    if (tSec >= st.autoNextAt) {
      st.autoNextAt = tSec + Math.max(MIN_GAP_S, period);
      startBurst(tSec, 'auto', clamp(Math.round(num(M().burst, 2)), 1, 8), false);
    }
  }

  /* ---- update por frame ---- */
  /* `enabledByLayout` — o `layout()` é quem sabe QUAIS as barras montadas (as < generated.length) e
     quais os tirantes que cabem sob o teto. O update por frame não recalcula nada disso; só precisa
     de saber se o grupo está ligado. Guarda-se aqui o estado que o layout escreveu para o poder
     REPOR quando o knob 'mikado (0/1)' volta a 1.
     ⚠ BUG APANHADO NA VERIFICAÇÃO (S11, mesma família do bug S9 nº1 "setEnabled acompanha o count"):
     o `if (!on)` desligava tudo, mas o ramo `on` NUNCA voltava a ligar — só o `layout()` o fazia, e
     esse não corre por frame. Resultado medido ao vivo: `mikado (0/1)` 1→0→1 deixava o mikado
     invisível para sempre (0 de 216 meshes ligadas), até um knob de geometria forçar um rebuild.
     O David teria batido nisto ao primeiro clique. (`wasOn` é declarado lá em cima, junto ao
     `enabledPlan` — o `rebuild()` do arranque já lhe escreve.) */
  function update(tSec, dt) {
    const cfg = M();
    const on = cfg.on !== false;

    if (!on) {
      if (wasOn) {
        // regra 2: tudo desligado quando o grupo está off (o David tira o mikado da sala)
        disableAll();
        for (const L of lights) L.setEnabled(false);
        wasOn = false;
      }
      st.lit = 0; st.burstLeft = 0;
      return;
    }
    // voltou a ligar: repor exatamente o que o `layout()` tinha montado (nem mais nem menos —
    // as barras acima de `generated.length` e os tirantes que não cabem ficam desligados).
    if (!wasOn) { restoreEnabled(); wasOn = true; }

    const d = Number.isFinite(dt) ? clamp(dt, 0, 0.1) : 0.016;
    const t = Number.isFinite(tSec) ? tSec : 0;

    const MS = pollMusic(t);
    schedule(MS, t);

    /* agendador da rajada. `hz` é a frequência DENTRO da rajada; clampada a 3 Hz no knob E aqui
       (MIN_GAP_S), para nenhuma escrita externa no CONFIG poder passar do teto da sala. */
    const hz = clamp(num(cfg.hz, 2.4), 0.2, 3);
    const gap = Math.max(MIN_GAP_S, 1 / hz);
    if (st.burstLeft > 0 && t >= st.nextAt && (t - st.lastFlashAt) >= MIN_GAP_S) {
      st.burstLeft--;
      st.lastFlashAt = t;
      st.nextAt = t + gap;
      st.lit = 1;
      // modo: 0 = todas juntas · 1 = alternando blocos
      const blocks = nBlocks();
      st.litBlock = (Math.round(num(cfg.mode, 0)) >= 1 && blocks > 1)
        ? (st.blockCursor = (st.blockCursor + 1) % blocks)
        : -1;
    }

    // envelope do flash: queda exponencial de `flashMs` (curto e seco, como um flash real)
    const life = Math.max(0.01, num(cfg.flashMs, 120) / 1000);
    if (st.lit > 0) {
      st.lit -= d / life;
      if (st.lit < 0) st.lit = 0;
    }
    if (!Number.isFinite(st.lit)) st.lit = 0;   // regra 7: rede final

    /* ---- escrever o emissivo dos tubos ----
       `idle` = brilho de repouso (o tubo nunca está totalmente morto nas fotos acesas; a 0 fica
       o mikado apagado da lux-barras2, que também é um estado legítimo).
       O toggle 'cor (0/1)' passa por `applyColorToggle` — em greyscale o mikado fica branco/cinza,
       como manda o brief. */
    /* F12 §5: o repouso também recolhe com o estrelato — mas nunca até zero (`0.35 + 0.65·g`): as
       barras têm de continuar a ler-se como objetos no teto quando outra peça é a estrela, senão o
       mikado DESAPARECE da sala e a sala parece ter mudado de geometria. */
    const idle = Math.max(0, num(cfg.idle, 0.12)) * (0.35 + 0.65 * starGain());
    const gain = Math.max(0, num(cfg.flashGain, 2.6));
    const base = PALETTE[st.colorIdx % PALETTE.length];
    const [cr, cg, cb] = applyColorToggle(CONFIG, base[0], base[1], base[2]);
    /* em greyscale a luminância do vermelho puro é ~0.21 (quase preto) — o mikado desapareceria.
       Normaliza-se para o cinza ter o mesmo "peso" visual que a cor tinha (o toggle é uma opção de
       estilo, não um dimmer). */
    const grey = CONFIG.colorOn === false;
    const nrm = grey ? 1 / Math.max(0.08, toGrey(base[0], base[1], base[2])[0]) : 1;
    const gr = cr * nrm, gg = cg * nrm, gb = cb * nrm;

    /* V6: brilho por BLOCO → cor por INSTÂNCIA (tubo). Calcula-se o `e` de cada bloco, e só se o
       vetor (cor × e por bloco) mudou desde o último frame é que se reescreve o buffer e se faz o
       upload (`thinInstanceBufferUpdated`) — em repouso (idle constante, sem rajada) o frame não
       toca na GPU. Zero materiais escritos por frame, zero recompilações. */
    const blocks = nBlocks();
    let dirty = false;
    for (let b = 0; b < MAX_BLOCKS; b++) {
      const activeBlock = (st.litBlock < 0) || (b === st.litBlock) || (blocks <= 1);
      const e = idle + (activeBlock ? st.lit * gain : 0);
      const r = gr * e, g = gg * e, bl = gb * e;
      const o = b * 3;
      if (blockRGB[o] !== r || blockRGB[o + 1] !== g || blockRGB[o + 2] !== bl) {
        blockRGB[o] = r; blockRGB[o + 1] = g; blockRGB[o + 2] = bl;
        dirty = true;
      }
    }
    if (dirty || colorsStale) {
      const n = B.tube.count;
      for (let i = 0; i < n; i++) {
        const o = (bars[i].block % MAX_BLOCKS) * 3, c = i * 4;
        tubeColors[c] = blockRGB[o]; tubeColors[c + 1] = blockRGB[o + 1]; tubeColors[c + 2] = blockRGB[o + 2];
      }
      if (n > 0) B.tube.mesh.thinInstanceBufferUpdated('color');
      colorsStale = false;
    }

    /* ---- luzes de sala: só durante o flash (o idle não acende luzes — seria luz constante a
       lavar a sala e a custar frame por nada). ---- */
    const lightMul = Math.max(0, num(cfg.lightMul, 1));
    const li = st.lit * gain * 6 * lightMul;
    const lightsOn = li > 0.05;
    /* S3b/V0b: NUNCA `setEnabled` por rajada — cada liga/desliga muda a lista de luzes dos materiais
       (defines novos → shaders novos, f17-visual §0.5b). As luzes ficam ligadas a I=0 durante
       `LIGHT_HOLD_S` depois do último flash e só depois se desligam (mesma histerese dos focos,
       `SPOT_SLOT_HOLD_S` em main.js). Escritas idempotentes. */
    if (lightsOn) lightsLastLitAt = t;
    const hold = (t - lightsLastLitAt) <= LIGHT_HOLD_S;
    for (const L of lights) {
      if (lightsOn) {
        L.intensity = li;
        L.diffuse.set(gr, gg, gb);
        L.specular.set(gr, gg, gb);
        if (!L.isEnabled(false)) L.setEnabled(true);
      } else if (L.isEnabled(false)) {
        if (L.intensity !== 0) L.intensity = 0;
        if (!hold) L.setEnabled(false);
      }
    }
  }

  /* regra 6: MESHES REAIS para a renderList do probe — a bola TEM de espelhar o mikado, é o ponto
     todo da fase. V6: são as 4 BASES (as thin instances desenham-se com a base, também no probe);
     a renderList passa de 672 entradas a 4. */
  const flatMeshes = [B.tube.mesh, B.rail.mesh, B.cap.mesh, B.rod.mesh];

  return {
    meshes: flatMeshes,
    lights,
    update,
    rebuild,
    // só o AGRUPAMENTO dos flashes (knob 'mikado: tam. bloco'), sem re-sortear a disposição
    regroup: () => regroup(true),
    get barCount() { return generated.length; },
    get litBlock() { return st.litBlock; },
    /* S3b diagnóstico (HUD/consola): quem manda, que relógio, última rajada, cool-down restante */
    get writer() { return st.writer; },
    get clock() { return st.clock; },
    get lastBurst() { return { cause: st.lastBurst.cause, at: st.lastBurst.at, flashes: st.lastBurst.flashes, max: st.lastBurst.max }; },
    get cooldownLeft() { return cooldownLeft(); },
    /* Diagnóstico (auditoria de knobs, 2026-09-01): o plano de blocos — `[block por barra]`. Serve
       para verificar pela consola que 'mikado: tam. bloco' reagrupa SEM re-sortear a disposição
       (as posições ficam iguais, este array muda). Cópia: ninguém escreve no `generated` de fora. */
    get blockPlan() { return generated.map(g => g.block); },
    // F12 §1: área do miolo (m²) usada para derivar a contagem — o HUD mostra-a ao lado das barras,
    // para o David ver de onde vem o número quando muda a geometria da sala.
    get areaM2() { return lastArea; },
  };
}
