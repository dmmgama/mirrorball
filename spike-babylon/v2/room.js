// v2/room.js — sala implícita de 5 planos (mesmas medidas do CONFIG.room) + F8: 2 filas de 3
// pilares e chão de madeira escura. material mate escuro (paredes/teto/pilares) + material próprio
// (chão). ES module. buildRoom(scene, CONFIG) -> { planes, pillars, material, floorMaterial }
//
// GEOMETRIA (F8 autoritativo, David 2026-09-01 — docs/f8-sala-lux.md): planta 15 (Z) × 10 (X) m,
// pé-direito 5,5 m, BOLA AO CENTRO da planta (origem do mundo em XZ). A sala é simétrica em Z:
// `roomD = |R.back|·2` e os planos chão/teto/laterais centram-se em z=0 — logo `back = -7.5` dá
// Z ∈ [-7.5,+7.5] = 15 m com a bola exatamente ao meio. Não há plano frontal (z=+7.5): a frente
// fica aberta para a câmara (o público), como já era antes desta fase.
//
// F10 (David, 2026-09-01, docs/f8-sala-lux.md "F10 — parametrização"): refletividade por SUPERFÍCIE.
// A sala tem 5 planos e SÓ 1 parede de fundo (`room_back`, no topo Z negativo — não há plano frontal,
// fica aberto para a câmara): por isso "refl: paredes fundo" cobre só `room_back` (documentado aqui
// porque o pedido do David falava em "2 paredes dos topos", mas a geometria só constrói uma).
// Cada superfície passa a ter o SEU PRÓPRIO PBRMaterial (antes chão/teto/4-paredes-menos-chão
// partilhavam `roomMat`) para o multiplicador de refletividade poder mexer só nessa superfície.
// `apply*ReflMul()` multiplicam o albedo ORIGINAL (capturado uma vez) — mutação in-place da Color3
// existente (nunca reatribuir `.albedoColor = new Color3(...)`, ver a nota de perf em main.js sobre
// `emissiveColor` — o mesmo custo de recompilação de shader aplica-se a qualquer setter de propriedade
// de material; aqui os `applyXReflMul()` só correm quando o knob muda, não por frame, mas mantém-se o
// padrão `.set()` por disciplina). Os multiplicadores NÃO tocam nos dots da mirror ball (dots.js usa o
// seu próprio StandardMaterial emissivo aditivo, alimentado por `ball.dots` — nunca lê material da
// sala; confirmado por leitura de dots.js).
import { toGrey } from './colorutil.js?v=1';

export function buildRoom(scene, CONFIG) {
  const R = CONFIG.room;
  function makeSurfaceMat(name, rgb) {
    const m = new BABYLON.PBRMaterial(name, scene);
    m.albedoColor = new BABYLON.Color3(rgb[0], rgb[1], rgb[2]);
    m.metallic = 0;
    m.roughness = 0.95;
    m.backFaceCulling = false;
    m.maxSimultaneousLights = 12;
    return m;
  }
  const BASE_ALBEDO = [0.055, 0.055, 0.055];
  const ceilMat = makeSurfaceMat('roomCeilMat', BASE_ALBEDO);
  const backMat = makeSurfaceMat('roomBackMat', BASE_ALBEDO);
  const sideMat = makeSurfaceMat('roomSideMat', BASE_ALBEDO); // partilhado por room_left + room_right
  const roomMat = ceilMat; // compat: `material` devolvido ao chamador continua a apontar para um PBR válido

  /* ⚠ REGRESSÃO S8 — "tudo preto" (ver PARITY.md §"Regressão S8: tudo preto").
     Um PBRMaterial SEM `reflectionTexture` própria cai no `scene.environmentTexture`, que aqui é o
     cubo do ReflectionProbe da bola (v2/ball.js: attachProbe) — e os 5 planos DESTA sala são a
     renderList desse mesmo probe. Em WebGPU o cubo fica então a ser render attachment (o probe a
     desenhar a sala) e texture binding (a sala a amostrar o ambiente) no MESMO synchronization scope:
       "[Texture ...TextureCube...] usage (TextureBinding|RenderAttachment) includes writable usage
        and another usage in the same synchronization scope"
     → GPUValidationError, o CommandBuffer inteiro é descartado, o probe fica por desenhar e os
     espelhos (metallic 0.92) ficam sem nada para refletir: a bola desenha-se PRETA.
     Correção: dar à sala uma `reflectionTexture` PRÓPRIA — um cubo 1×1 quase preto (a sala escura
     que ela própria é). Corta o ciclo, mantém o PBR (a mesma resposta à luz de antes, sem as poças
     ovais que o StandardMaterial fazia) e ainda tira trabalho ao frame:
     medido nesta cena, render 143 ms → 20 ms. */
  // helper partilhado: todo o PBRMaterial NOVO desta sala (chão, pilares) segue a MESMA regra —
  // reflectionTexture PRÓPRIA quase preta, NUNCA cair no scene.environmentTexture (comentário acima).
  function makeDarkCubeTexture(rgb) {
    const px = new Uint8Array([rgb[0], rgb[1], rgb[2], 255]);
    try {
      return new BABYLON.RawCubeTexture(
        scene, [px, px, px, px, px, px], 1,
        BABYLON.Engine.TEXTUREFORMAT_RGBA, BABYLON.Engine.TEXTURETYPE_UNSIGNED_BYTE,
        false, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);
    } catch (e) {
      console.error('[MB2] room.js: RawCubeTexture falhou — o material vai cair no scene.environmentTexture ' +
        'e em WebGPU o frame fica preto (ver comentário em v2/room.js):', e);
      return null;
    }
  }
  const darkCubeRoom = makeDarkCubeTexture([10, 10, 10]);
  ceilMat.reflectionTexture = darkCubeRoom;
  backMat.reflectionTexture = darkCubeRoom;
  sideMat.reflectionTexture = darkCubeRoom;

  function plane(name, w, h, pos, rot, mat) {
    const p = BABYLON.MeshBuilder.CreatePlane(name, { width: w, height: h, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, scene);
    p.position = pos;
    if (rot) p.rotation = rot;
    p.material = mat || roomMat;
    p.receiveShadows = true;
    return p;
  }

  const roomW = R.halfW * 2, roomH = R.ceil - R.floor, roomD = Math.abs(R.back) * 2;

  /* ---- F8: chão de madeira escura — tom próprio (ligeiramente quente), sujeito ao toggle
     'cor (0/1)' (CONFIG.colorOn). Como o toggle tem de atuar AO VIVO sem rebuild da sala,
     `floorMaterial` guarda o RGB "cor" original e `applyFloorColor()` escreve o albedo (cor ou
     luminância) — chamado uma vez aqui e de novo pelo main.js sempre que o knob muda. */
  const floorMat = new BABYLON.PBRMaterial('roomFloorMat', scene);
  floorMat.metallic = 0;
  floorMat.roughness = 0.85;
  floorMat.backFaceCulling = false;
  floorMat.maxSimultaneousLights = 12;
  floorMat.reflectionTexture = makeDarkCubeTexture([12, 10, 8]);
  const FLOOR_RGB = (CONFIG.floorWoodColor && CONFIG.floorWoodColor.length === 3)
    ? CONFIG.floorWoodColor : [0.10, 0.075, 0.055];
  function applyFloorColor() {
    const on = CONFIG.colorOn !== false;
    const [r, g, b] = on ? FLOOR_RGB : toGrey(FLOOR_RGB[0], FLOOR_RGB[1], FLOOR_RGB[2]);
    // F10: 'refl: chão' multiplica DEPOIS do toggle cor/greyscale — mesmo padrão de applyReflMul.
    const mul = Math.max(0, num((CONFIG.reflMul || {}).floor, 1));
    floorMat.albedoColor.set(r * mul, g * mul, b * mul);
  }
  floorMat.albedoColor = new BABYLON.Color3(0, 0, 0);
  applyFloorColor();

  const planes = [
    plane('room_back',  roomW, roomH, new BABYLON.Vector3(0, (R.ceil + R.floor) / 2, R.back), null, backMat),
    plane('room_floor', roomW, roomD, new BABYLON.Vector3(0, R.floor, 0), new BABYLON.Vector3(Math.PI / 2, 0, 0), floorMat),
    plane('room_ceil',  roomW, roomD, new BABYLON.Vector3(0, R.ceil, 0),  new BABYLON.Vector3(-Math.PI / 2, 0, 0), ceilMat),
    plane('room_left',  roomD, roomH, new BABYLON.Vector3(-R.halfW, (R.ceil + R.floor) / 2, 0), new BABYLON.Vector3(0, Math.PI / 2, 0), sideMat),
    plane('room_right', roomD, roomH, new BABYLON.Vector3( R.halfW, (R.ceil + R.floor) / 2, 0), new BABYLON.Vector3(0, -Math.PI / 2, 0), sideMat),
  ];

  /* ---- F10: refletividade por superfície — multiplicador do albedo (0-3, default 1), ao vivo, sem
     rebuild da sala. Cada `applyXReflMul()` guarda o albedo ORIGINAL (capturado uma vez, antes de
     qualquer multiplicador) e escreve `original × mul` na Color3 existente (`.set()`, nunca
     reatribuir a propriedade — custo de recompilação de shader, ver a nota de perf do estrobo em
     main.js). Chão já tinha o seu próprio padrão (`applyFloorColor`, também sujeito a 'cor (0/1)');
     aqui o multiplicador combina-se com esse resultado (aplica-se DEPOIS da cor/greyscale). */
  const CEIL_RGB = BASE_ALBEDO.slice();
  const BACK_RGB = BASE_ALBEDO.slice();
  const SIDE_RGB = BASE_ALBEDO.slice();
  function applyReflMul(mat, rgb, mul) {
    const m = Math.max(0, num(mul, 1));
    mat.albedoColor.set(rgb[0] * m, rgb[1] * m, rgb[2] * m);
  }
  function applyCeilReflMul() { applyReflMul(ceilMat, CEIL_RGB, (CONFIG.reflMul || {}).ceil); }
  function applyBackReflMul() { applyReflMul(backMat, BACK_RGB, (CONFIG.reflMul || {}).back); }
  function applySideReflMul() { applyReflMul(sideMat, SIDE_RGB, (CONFIG.reflMul || {}).side); }
  function applyAllReflMul() { applyCeilReflMul(); applyBackReflMul(); applySideReflMul(); }
  applyAllReflMul();

  /* ---- F8: pilares — 2 filas de 3 caixas (secção 0,5×0,5 m, chão-teto), a ±halfX=2.5 em X (2,5 m
     das paredes laterais, halfW 5.0), espaçadas spacingZ=5 m em Z e CENTRADAS na sala: com rows=3 o
     `zSpan/2` põe os eixos em Z = -5 / 0 / +5, ou seja o pilar do MEIO de cada fila fica ao nível da
     bola — exatamente a planta do doc (doc_X = 2,5/7,5/12,5, doc_Y = 2,5/7,5). Material próprio
     escuro (PBR albedo ~0.05) — MESMA regra da reflectionTexture própria (ver acima). Os pilares
     entram no array `pillars` devolvido: (a) o main.js junta-os a `room.planes` para a bola os
     espelhar (ReflectionProbe — é o coração da F8, o David quer os espelhos a mostrarem a sala real);
     (b) NÃO entram em `light.excludedMeshes` dos SpotLights — ao contrário dos 5 planos (fix S9
     "parede de luz": o pinspot continuava até à parede oposta e torrava-a), os pilares são objetos
     estreitos a meio da sala — um pinspot pode legitimamente iluminar a face de um pilar que
     atravessa (realismo: sombra/mancha no pilar), e não há "parede" a torrar-se por trás deles. */
  const pillarMat = new BABYLON.PBRMaterial('pillarMat', scene);
  const PA = (CONFIG.pillars && CONFIG.pillars.albedo) || [0.05, 0.05, 0.05];
  pillarMat.albedoColor = new BABYLON.Color3(PA[0], PA[1], PA[2]);
  pillarMat.metallic = 0;
  pillarMat.roughness = 0.9;
  pillarMat.maxSimultaneousLights = 8;
  pillarMat.reflectionTexture = makeDarkCubeTexture([8, 8, 8]);

  const pillars = [];
  const PC = CONFIG.pillars || {};
  if (PC.on !== false) {
    const halfX = num(PC.halfX, 2.5), sec = num(PC.section, 0.5);
    const rows = Math.max(1, Math.round(num(PC.rows, 3))), spacingZ = num(PC.spacingZ, 5.0);
    const pillarH = roomH;
    const cy = (R.ceil + R.floor) / 2;
    const zSpan = (rows - 1) * spacingZ;
    const z0 = -zSpan / 2;
    for (let side = -1; side <= 1; side += 2) {
      for (let row = 0; row < rows; row++) {
        const z = z0 + row * spacingZ;
        const box = BABYLON.MeshBuilder.CreateBox('pillar_' + (side < 0 ? 'L' : 'R') + row,
          { width: sec, depth: sec, height: pillarH }, scene);
        box.position.set(side * halfX, cy, z);
        box.material = pillarMat;
        box.receiveShadows = true;
        pillars.push(box);
      }
    }
  }

  function num(v, d) { return Number.isFinite(v) ? v : d; }

  /* ---- F8-b: liga/desliga cada pilar individualmente (David: "tapar e ligar") ----
     `CONFIG.pillars.off` é a lista de índices desligados, escrita pelos knobs 'pilar N (0/1)' do
     grupo "Pilares". Atua AO VIVO: o pilar fica `setEnabled(false)` mas CONTINUA na renderList do
     ReflectionProbe — em WebGPU o probe só desenha o que está enabled no refresh, por isso não é
     preciso (nem desejável) mexer na renderList, que é fixada uma vez em `ball.attachProbe`.
     Chamada uma vez aqui (para o estado inicial do CONFIG valer) e pelo painel a cada mudança. */
  function applyPillarToggles() {
    const off = (CONFIG.pillars && Array.isArray(CONFIG.pillars.off)) ? CONFIG.pillars.off : [];
    const groupOn = !(CONFIG.pillars && CONFIG.pillars.on === false);
    for (let i = 0; i < pillars.length; i++) {
      pillars[i].setEnabled(groupOn && off.indexOf(i) === -1);
    }
  }
  applyPillarToggles();

  return {
    planes, pillars, material: roomMat, floorMaterial: floorMat, applyFloorColor, applyPillarToggles,
    // F10: refletividade por superfície — main.js chama applyAllReflMul() quando qualquer knob 'refl: *' muda.
    applyCeilReflMul, applyBackReflMul, applySideReflMul, applyAllReflMul,
  };
}
