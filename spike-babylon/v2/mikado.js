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
//    `count` fica desligado.
// 3. Orientar com `rotationQuaternion` (Euler compõe YXZ e torce a barra) — armadilha S10.
// 4. NaN-safe: todo o estado nasce com valor inicial e todo o knob passa por `num(v, default)`.
// 5. Nada > 3 Hz.
// 6. `meshes` = array ACHATADO de MESHES REAIS (nunca TransformNodes — rebentam o
//    `_prepareRenderingManager` do ReflectionProbe em WebGPU). A bola TEM de espelhar o mikado.
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
   silêncio — a alternativa era o knob dizer uma coisa e a sala mostrar outra. */
const MAX_BARS = 72;
const MIN_GAP_S = 1 / 3;      // teto ABSOLUTO de 3 Hz entre flashes (regra invariável da sala)

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

  /* TUBO luminoso: material PRÓPRIO POR BARRA? Não — os flashes são SIMULTÂNEOS e da MESMA cor
     (spec §5), portanto bastam poucos materiais. Usa-se UM material por BLOCO (MAX_BLOCKS) para o
     modo "blocos" poder acender um grupo e deixar os outros apagados, com custo fixo de shaders.
     Escrever `.emissiveColor.set(...)` numa Color3 EXISTENTE (nunca reatribuir a propriedade —
     recompila o shader, ver a nota de perf do estrobo em main.js). */
  const MAX_BLOCKS = 12;
  const tubeMats = [];
  for (let b = 0; b < MAX_BLOCKS; b++) {
    const m = new BABYLON.PBRMaterial('mikadoTube' + b, scene);
    m.albedoColor = new BABYLON.Color3(0.02, 0.02, 0.02);
    m.emissiveColor = new BABYLON.Color3(0, 0, 0);
    m.metallic = 0.0;
    m.roughness = 0.35;
    m.disableLighting = true;          // o tubo mostra o SEU emissivo, não reage à sala (como as lentes)
    m.maxSimultaneousLights = 1;
    /* ⚠ `disableLighting` NÃO isenta da regra 1: o PBR continua a amostrar o environmentTexture
       para o termo de reflexão → ciclo write+read com o cubo do probe em WebGPU (regressão S8). */
    m.reflectionTexture = darkCube;
    tubeMats.push(m);
  }

  /* ---- pool de barras ---------------------------------------------------------------------
     Cada barra = 4 meshes reais + 2 tirantes:
       tube   — cilindro fino, emissivo, POR BAIXO do perfil (é a luz)
       rail   — a calha em U por cima do tubo (caixa achatada; a "costas" do perfil)
       cap0/1 — terminais/tampas nas 2 pontas (caixinhas um pouco maiores que o perfil)
       rod0/1 — tirantes verticais finos até ao teto (é o que a pendura; sem eles flutua)
     Tudo filho de um TransformNode `root` por barra (posição+quaternion numa só escrita); os
     tirantes são SOLTOS no mundo (têm de cair na VERTICAL, o root está rodado — mesma armadilha
     da haste dos chapéus, hats.js). */
  const bars = [];
  for (let i = 0; i < MAX_BARS; i++) {
    const root = new BABYLON.TransformNode('mikadoRoot' + i, scene);
    root.rotationQuaternion = BABYLON.Quaternion.Identity(); // regra 3 (Euler compõe YXZ e torce)

    // comprimento base 1 → escala-se em Z por barra (`scaling.z = comprimento`)
    const tube = BABYLON.MeshBuilder.CreateCylinder('mikadoTube' + i,
      { diameter: 1, height: 1, tessellation: 10 }, scene);
    tube.rotation.x = Math.PI / 2;      // deitar o cilindro ao longo de +Z local
    tube.bakeCurrentTransformIntoVertices();
    tube.parent = root;
    tube.isPickable = false;

    const rail = BABYLON.MeshBuilder.CreateBox('mikadoRail' + i,
      { width: 1, height: 1, depth: 1 }, scene);
    rail.material = railMat;
    rail.parent = root;
    rail.isPickable = false;

    const caps = [];
    for (let k = 0; k < 2; k++) {
      const c = BABYLON.MeshBuilder.CreateBox('mikadoCap' + i + '_' + k,
        { width: 1, height: 1, depth: 1 }, scene);
      c.material = railMat;
      c.parent = root;
      c.isPickable = false;
      caps.push(c);
    }

    const rods = [];
    for (let k = 0; k < 2; k++) {
      const r = BABYLON.MeshBuilder.CreateCylinder('mikadoRod' + i + '_' + k,
        { diameter: 1, height: 1, tessellation: 6 }, scene);
      r.material = railMat;
      r.isPickable = false;
      r.setEnabled(false);
      rods.push(r);
    }

    root.setEnabled(false);
    bars.push({ root, tube, rail, caps, rods, block: 0, len: 1 });
  }

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

    /* ZONA (spec §2): dentro do retângulo dos PILARES. Os pilares estão em X = ±halfX e nas
       filas Z = ±spacingZ (3 filas centradas em 0). O miolo é portanto |X| ≤ halfX e
       |Z| ≤ spacingZ, com uma folga `insetM` para as pontas não roçarem os pilares. */
    const P = CONFIG.pillars || {};
    const inset = Math.max(0, num(cfg.insetM, 0.35));
    const halfX = Math.max(0.5, num(P.halfX, 3.0) - inset);
    const rows = Math.max(1, Math.round(num(P.rows, 3)));
    const halfZ = Math.max(0.5, ((rows - 1) / 2) * num(P.spacingZ, 5.0) - inset);

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
       Raio de rejeição = raio da bola (1 m = 1 raio) + margem do knob (default 0,5 m). */
    const ballOn = CONFIG.ballOn !== false;
    const clearR = ballOn ? Math.max(0, 1 + num(cfg.ballClearM, 0.5)) : -1;
    /* F12 §3: a bola já não está fixa na origem — o slider 'bola: altura (m)' desloca-a em Y, e a
       CLAREIRA tem de acompanhar. Sem isto, subir a bola para dentro do mikado fazia-a atravessar
       as barras (e descê-la deixava um buraco no ar onde já não está nada).
       ⚠ Lê-se `CONFIG.ballYEffective` (a cota JÁ CLAMPADA que o ball.js publica), NUNCA o knob em
       cru: o ball.js impede a bola de sair da sala, e derivar a cota do knob dava um valor
       diferente sempre que esse clamp entrasse. Medido antes da correção: com pé-direito 5 m e o
       knob a 4,2 m, a bola parava em +0,25 mas a clareira abria a +0,70 → barras a ATRAVESSAR a
       bola (distância mínima 0,85 quando o exigido era 1,50).
       Fallback para o knob só enquanto o ball.js ainda não correu (arranque). */
    const ballC = {
      x: 0,
      y: num(CONFIG.ballYEffective, num(CONFIG.ballHeightM, 3.5) - 3.5),
      z: 0,
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

      out.push({ x: cx, y, z: cz, yaw, pitch, len });
    }

    /* BLOCOS: grupos CONSECUTIVOS de `blockSize` barras (spec §5: "grupos de 4-6 barras"). O índice
       de bloco fixa-se aqui (não muda por frame) — o modo "blocos" acende um bloco de cada vez. */
    const bs = clamp(Math.round(num(cfg.blockSize, 5)), 1, 12);
    for (let i = 0; i < out.length; i++) out[i].block = Math.floor(i / bs) % MAX_BLOCKS;

    generated = out;
    lastArea = areaM2;
    return out;
  }

  /* ---- aplicar a geometria gerada às meshes do pool (só no rebuild, nunca por frame) ----
     `enabledPlan` guarda o que o layout decidiu ligar: por barra, se a barra está montada e se cada
     tirante coube sob o teto. É o que `restoreEnabled()` repõe quando o knob 'mikado (0/1)' volta a
     1 (ver o comentário do bug em `update`). Sem este plano, "voltar a ligar" teria de adivinhar. */
  const enabledPlan = [];
  for (let i = 0; i < MAX_BARS; i++) enabledPlan.push({ bar: false, rod0: false, rod1: false });
  /* estado "o grupo estava ligado no frame anterior" — declarado AQUI (e não junto ao `update`)
     porque o `rebuild()` do arranque já lhe escreve, e um `let` declarado depois dava TDZ. */
  let wasOn = true;
  function restoreEnabled() {
    for (let i = 0; i < MAX_BARS; i++) {
      const p = enabledPlan[i], b = bars[i];
      b.root.setEnabled(p.bar);
      b.rods[0].setEnabled(p.rod0);
      b.rods[1].setEnabled(p.rod1);
    }
  }

  const tmpQ = new BABYLON.Quaternion();
  function layout() {
    const cfg = M();
    const R = CONFIG.room || {};
    const ceilY = num(R.ceil, 2.0);
    const tubeD = Math.max(0.02, num(cfg.tubeDiaM, 0.10));   // Ø do tubo luminoso
    const railW = tubeD * 1.30;                              // a calha é um pouco mais larga que o tubo
    const railH = tubeD * 0.72;                              // e achatada
    const rodD = Math.max(0.008, tubeD * 0.14);              // tirante fino

    const n = generated.length;
    for (let i = 0; i < MAX_BARS; i++) {
      const bar = bars[i];
      if (i >= n) {
        // regra 2: setEnabled acompanha SEMPRE a contagem (a base desenha-se na mesma se não o fizer)
        bar.root.setEnabled(false);
        bar.rods[0].setEnabled(false);
        bar.rods[1].setEnabled(false);
        enabledPlan[i].bar = enabledPlan[i].rod0 = enabledPlan[i].rod1 = false;
        continue;
      }
      const g = generated[i];
      bar.len = g.len;
      bar.block = g.block;
      bar.tube.material = tubeMats[g.block % MAX_BLOCKS];

      bar.root.position.set(g.x, g.y, g.z);
      // regra 3: quaternion (yaw em Y, depois pitch em X) — Euler compunha YXZ e torcia a barra
      BABYLON.Quaternion.RotationYawPitchRollToRef(g.yaw, g.pitch, 0, tmpQ);
      bar.root.rotationQuaternion.copyFrom(tmpQ);

      /* TUBO por baixo, PERFIL por cima — é essa a montagem real (o perfil tapa o tubo visto de
         cima e reflete-lhe a luz para baixo). O tubo desce meio perfil para os dois corpos não
         se interpenetrarem. */
      bar.tube.scaling.set(tubeD, tubeD, g.len);
      bar.tube.position.set(0, -railH * 0.5, 0);

      bar.rail.scaling.set(railW, railH, g.len * 1.005);
      bar.rail.position.set(0, tubeD * 0.30, 0);

      // terminais nas 2 pontas: um pouco mais largos/altos que o perfil, curtos em Z
      const capL = Math.min(0.14, g.len * 0.035);
      for (let k = 0; k < 2; k++) {
        const c = bar.caps[k];
        c.scaling.set(railW * 1.32, railH * 1.9, capL);
        c.position.set(0, tubeD * 0.10, (k === 0 ? -1 : 1) * (g.len / 2 - capL / 2));
      }

      /* TIRANTES verticais até ao teto — SOLTOS no mundo (o root está rodado; um tirante filho
         saía inclinado). Ancoram a ~25% e ~75% do comprimento, que é o que as fotos mostram
         (nunca nas pontas). Se a barra estiver colada ao teto, escondem-se. */
      const cp = Math.cos(g.pitch), sp = Math.sin(g.pitch);
      const dir = { x: Math.sin(g.yaw) * cp, y: -sp, z: Math.cos(g.yaw) * cp };
      for (let k = 0; k < 2; k++) {
        const t = (k === 0 ? -0.25 : 0.25) * g.len;
        const ax = g.x + dir.x * t, ay = g.y + dir.y * t + tubeD * 0.5, az = g.z + dir.z * t;
        const h = ceilY - ay;
        const rod = bar.rods[k];
        const fits = h > 0.03;
        if (fits) {
          rod.scaling.set(rodD, h, rodD);          // cilindro base height 1 → scaling.y = metros
          rod.position.set(ax, ay + h / 2, az);
        }
        rod.setEnabled(fits);
        enabledPlan[i][k === 0 ? 'rod0' : 'rod1'] = fits;
      }
      bar.root.setEnabled(true);
      enabledPlan[i].bar = true;
    }

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
      for (let i = 0; i < MAX_BARS; i++) {
        bars[i].root.setEnabled(false);
        bars[i].rods[0].setEnabled(false);
        bars[i].rods[1].setEnabled(false);
      }
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
    blockCursor: 0,    // qual o próximo bloco no modo "blocos"
    autoAcc: 0,        // acumulador Poisson do modo autónomo
    lastSnare: -1,     // contadores do motor no frame anterior (-1 = ainda não lidos)
    lastDrop: -1,
    warned: false,
  };

  function nBlocks() {
    const bs = clamp(Math.round(num(M().blockSize, 5)), 1, 12);
    return Math.max(1, Math.min(MAX_BLOCKS, Math.ceil(generated.length / bs)));
  }

  /* Começa uma rajada. `cause` só para o log/HUD. Respeita o teto de 3 Hz: se a última flashada
     foi há menos de MIN_GAP_S, o pedido é IGNORADO (não se enfileira — enfileirar seria a mesma
     coisa que exceder a frequência, só com atraso). */
  function startBurst(tSec, cause) {
    const cfg = M();
    if (tSec - st.lastFlashAt < MIN_GAP_S) return false;
    if (st.burstLeft > 0) return false;                      // já há rajada a decorrer
    /* F12 §5: o ESTRELATO decide se o mikado tem palco agora. É um filtro PROBABILÍSTICO no
       arranque da rajada (e não um mute do resultado) por duas razões: uma rajada começada nunca é
       cortada a meio — lê-se como avaria —, e com ganho intermédio o mikado rareia em vez de
       enfraquecer, que é como um técnico o usaria. Com ganho 0 (estrelato dos chapéus: exclusão
       mútua) não arranca rajada nenhuma. */
    const sg = starGain();
    if (sg < 1 && Math.random() >= sg) return false;
    st.burstLeft = clamp(Math.round(num(cfg.burst, 2)), 1, 8);
    st.nextAt = tSec;
    // COR: fixa (1-3) ou rotação (0) — a rotação avança UMA vez por rajada, nunca dentro dela
    // (spec §5: "sempre a MESMA cor em simultâneo", e uma rajada lê-se como um só gesto).
    const pick = Math.round(num(cfg.color, 0));
    if (pick >= 1 && pick <= 3) st.colorIdx = pick - 1;
    else st.colorIdx = (st.colorIdx + 1) % PALETTE.length;
    return true;
  }

  /* Lê os triggers do motor de música. NÃO toca em music.js: faz poll de `window.MUSIC.state`,
     onde `snareCount`/`dropCount` são contadores MONOTÓNICOS (sobem a cada evento). Comparar com
     o valor do frame anterior dá o evento sem callbacks nem patches no motor. */
  function pollMusic(tSec) {
    const cfg = M();
    const MS = (typeof window !== 'undefined' && window.MUSIC && window.MUSIC.state) || null;
    if (!MS) {
      if (!st.warned && cfg.snareOn !== false) {
        st.warned = true;
        console.warn('[MB2] mikado: motor de música ausente (window.MUSIC) — triggers de tarola/drop ' +
          'inertes; o mikado corre em modo autónomo (knob "mikado: auto /min"). Sem sidecar isto é ' +
          'esperado; a tecla `g` do motor liga o gerador sintético para testar.');
      }
      return;
    }

    const snare = num(MS.snareCount, 0), drop = num(MS.dropCount, 0);
    // 1ª leitura: só regista (senão o mikado disparava uma rajada por cada evento já acumulado)
    if (st.lastSnare < 0) { st.lastSnare = snare; st.lastDrop = drop; return; }

    // ---- DROP: o gesto grande. Rajada mais longa e prioritária. ----
    if (drop > st.lastDrop) {
      st.lastDrop = drop;
      if (cfg.dropOn !== false) {
        const saved = st.burstLeft;
        st.burstLeft = 0;                                     // o drop interrompe uma rajada de tarola
        if (!startBurst(tSec, 'drop')) st.burstLeft = saved;
        else st.burstLeft = clamp(Math.round(num(cfg.burst, 2) * num(cfg.dropBurstMul, 2)), 1, 12);
      }
    }

    // ---- TAROLA (snare): o acento seco. `sens` 0-1 = probabilidade de cada tarola disparar. ----
    if (snare > st.lastSnare) {
      const missed = snare - st.lastSnare;
      st.lastSnare = snare;
      if (cfg.snareOn !== false && missed > 0) {
        const sens = clamp(num(cfg.snareSens, 0.55), 0, 1);
        if (Math.random() < sens) startBurst(tSec, 'snare');
      }
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
        for (let i = 0; i < MAX_BARS; i++) {
          bars[i].root.setEnabled(false);
          bars[i].rods[0].setEnabled(false);
          bars[i].rods[1].setEnabled(false);
        }
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

    pollMusic(t);

    /* modo AUTÓNOMO: sem motor (ou com ele calado) o mikado ainda vive — rajadas Poisson a
       `autoPerMin`. É também o que dá ao David algo para ver ao mexer nos knobs sem música. */
    const autoRate = Math.max(0, num(cfg.autoPerMin, 4)) / 60;
    st.autoAcc += d * autoRate;
    if (st.autoAcc > 4) st.autoAcc = 4;
    while (st.autoAcc >= 1) { st.autoAcc -= 1; startBurst(t, 'auto'); }

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

    const blocks = nBlocks();
    for (let b = 0; b < MAX_BLOCKS; b++) {
      const activeBlock = (st.litBlock < 0) || (b === st.litBlock) || (blocks <= 1);
      const e = idle + (activeBlock ? st.lit * gain : 0);
      tubeMats[b].emissiveColor.set(gr * e, gg * e, gb * e);
    }

    /* ---- luzes de sala: só durante o flash (o idle não acende luzes — seria luz constante a
       lavar a sala e a custar frame por nada). ---- */
    const lightMul = Math.max(0, num(cfg.lightMul, 1));
    const li = st.lit * gain * 6 * lightMul;
    const lightsOn = li > 0.05;
    for (const L of lights) {
      if (lightsOn) {
        L.intensity = li;
        L.diffuse.set(gr, gg, gb);
        L.specular.set(gr, gg, gb);
        L.setEnabled(true);
      } else if (L.isEnabled()) {
        L.intensity = 0;   // zera junto com o setEnabled: um valor "vivo" numa luz apagada lê-se mal na inspeção
        L.setEnabled(false);
      }
    }
  }

  /* regra 6: MESHES REAIS achatadas (nunca o TransformNode root) para a renderList do probe —
     a bola TEM de espelhar o mikado, é o ponto todo da fase. */
  const flatMeshes = [];
  for (const b of bars) flatMeshes.push(b.tube, b.rail, b.caps[0], b.caps[1], b.rods[0], b.rods[1]);

  return {
    meshes: flatMeshes,
    lights,
    update,
    rebuild,
    get barCount() { return generated.length; },
    get litBlock() { return st.litBlock; },
    // F12 §1: área do miolo (m²) usada para derivar a contagem — o HUD mostra-a ao lado das barras,
    // para o David ver de onde vem o número quando muda a geometria da sala.
    get areaM2() { return lastArea; },
  };
}
