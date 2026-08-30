// v2/fixtures.js — corpos PAR36 visíveis (Fase 6, Sonnet). A bola Canvas 2D NÃO tem corpos — isto é
// tudo NOVO, sem paridade a seguir; as escolhas ficam documentadas em PARITY.md §"Corpos PAR36 (F6)".
//
// Fonte única de posição/orientação: `ball.mountedSpots` (mesma lista que `main.js` usa para as
// SpotLight e que `incident.js` usa para o cone incidente) + `CONFIG.spotDist` — o corpo fica
// exatamente onde a SpotLight ilumina, para a luz "nascer" dele. Flashes (`isFlash:true`) e a luz
// indireta (`wide:true`) NÃO têm corpo (só focos montados de verdade têm um pinspot físico).
//
// Pool: `CONFIG.spots.length` corpos pré-criados, nunca destruídos — só `setEnabled` por frame,
// mesmo padrão do resto do spike (`updateSpotLights`, `incident.js`). O índice do pool NÃO é o
// índice de `CONFIG.spots` (mountedSpots já vem filtrado/reordenado) — percorre-se mountedSpots na
// ordem em que chega e atribui-se ao próximo slot livre, tal como `updateSpotLights` faz.
//
// createFixtures(scene, CONFIG, room) -> { update(mountedSpots, E) }

function num(v, d) { return Number.isFinite(v) ? v : d; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

// PAR36 simplificado, em raios da bola (escala base a fixtureScale=1): lata Ø0.12, comprimento 0.18
// (brief §1). O aro é um pouco maior que a lata na boca; a lente é um disco fino colado à boca.
const CAN_D = 0.12;   // diâmetro da lata
const CAN_LEN = 0.18; // comprimento da lata
const RIM_D = CAN_D * 1.18;
const RIM_LEN = CAN_LEN * 0.12;
const LENS_D = CAN_D * 0.92;
const STEM_D = CAN_D * 0.16; // grossura da haste/yoke (cilindro fino)

// PERF (medido, 2026-08-30): com `maxSimultaneousLights: 12` em 8 materiais PBR novos (corpo/aro/6
// lentes), o custo por frame subiu de ~4 ms para ~12-20 ms — o pool de SpotLight (até 10 slots) liga/
// desliga luzes por frame (`updateSpotLights`), e cada mudança na contagem de luzes ATIVAS force a
// recompilação do shader de QUALQUER material cujo `maxSimultaneousLights` ainda não viu essa
// contagem (mesma classe de bug do `roomEmissive` documentado em main.js, mas via shader em vez de
// dirty flag). Corpos/aro não precisam de precisão de iluminação (são pretos foscos, quase invisíveis
// exceto pelo contorno) — `maxSimultaneousLights: 2` chega para uma leitura de volume plausível e não
// arrasta esse custo. A lente é puramente emissiva (a "luz nasce dela", mas ela própria NÃO reage à
// luz da sala — regra 6, a bola/os corpos não emitem luz PARA a sala) — `disableLighting: true` tira-a
// de vez do cálculo de luzes, o que também evita o mesmo problema de recompilação nela.
function makeFixtureMaterials(scene) {
  // corpo: metal escuro fosco (PBR) — greyscale, não emite.
  const bodyMat = new BABYLON.PBRMaterial('fixtureBody', scene);
  bodyMat.albedoColor = new BABYLON.Color3(0.05, 0.05, 0.05);
  bodyMat.metallic = 0.85;
  bodyMat.roughness = 0.6;
  bodyMat.maxSimultaneousLights = 2; // ver nota de perf acima — corpo não precisa de todas as luzes

  // aro: metal um pouco mais claro (borda visível contra a lata)
  const rimMat = new BABYLON.PBRMaterial('fixtureRim', scene);
  rimMat.albedoColor = new BABYLON.Color3(0.09, 0.09, 0.09);
  rimMat.metallic = 0.8;
  rimMat.roughness = 0.5;
  rimMat.maxSimultaneousLights = 2;

  // haste/yoke: igual ao corpo (mesma lata, sem brilho)
  const stemMat = bodyMat;

  return { bodyMat, rimMat, stemMat };
}

// material da lente: greyscale emissivo, cor mutável por instância (cada foco pode ter matiz próprio
// se `CONFIG.spotColorOn` — F2, opt-in do David). Usa-se um material POR fixture (poucos, 0-6) em vez
// de vertex color, porque o emissiveColor muda pouco (uma vez por frame, não por tile) — mais simples.
// `disableLighting: true` (ver nota de perf acima): a lente não reage à luz da sala, só mostra o seu
// próprio emissive — mais barato E mais correto (regra 6: nada aqui deve iluminar/ser lavado pela sala).
function makeLensMaterial(scene, idx) {
  const mat = new BABYLON.PBRMaterial('fixtureLens' + idx, scene);
  mat.albedoColor = new BABYLON.Color3(0, 0, 0);
  mat.emissiveColor = new BABYLON.Color3(0, 0, 0);
  mat.disableLighting = true;
  return mat;
}

function spotColorFor(sp, CONFIG) {
  if (!CONFIG.spotColorOn) return null; // null = greyscale puro (usa I diretamente nos 3 canais)
  const h = ((num(sp.hue, 0) % 360) + 360) % 360 / 60;
  const sat = clamp(num(CONFIG.spotSat, 1), 0, 1);
  const c = sat, x = c * (1 - Math.abs((h % 2) - 1)), m = 1 - c;
  let r = 0, g = 0, b = 0;
  if (h < 1) { r = c; g = x; } else if (h < 2) { r = x; g = c; } else if (h < 3) { g = c; b = x; }
  else if (h < 4) { g = x; b = c; } else if (h < 5) { r = x; b = c; } else { r = c; b = x; }
  return [r + m, g + m, b + m];
}

// Constrói UM corpo PAR36 (lata + aro + lente) alinhado ao longo do eixo local +Z (aponta "para a
// frente" da lata); a haste é um mesh separado (linha/cilindro) porque o comprimento varia por spot
// (distância variável ao teto/parede) — não pode ser um filho de escala fixa.
function buildFixture(scene, idx, mats) {
  const root = new BABYLON.TransformNode('fixtureRoot' + idx, scene);

  const can = BABYLON.MeshBuilder.CreateCylinder('fixtureCan' + idx,
    { diameter: CAN_D, height: CAN_LEN, tessellation: 14 }, scene);
  can.material = mats.bodyMat;
  can.rotation.x = Math.PI / 2; // cilindro do Babylon nasce ao longo de Y → roda para +Z
  can.parent = root;
  can.isPickable = false;

  const rim = BABYLON.MeshBuilder.CreateCylinder('fixtureRim' + idx,
    { diameter: RIM_D, height: RIM_LEN, tessellation: 14 }, scene);
  rim.material = mats.rimMat;
  rim.rotation.x = Math.PI / 2;
  rim.position.z = CAN_LEN / 2 + RIM_LEN / 2;
  rim.parent = root;
  rim.isPickable = false;

  const lensMat = makeLensMaterial(scene, idx);
  const lens = BABYLON.MeshBuilder.CreateDisc('fixtureLens' + idx,
    { radius: LENS_D / 2, tessellation: 20 }, scene);
  // CreateDisc nasce no plano XY, virado para -Z por omissão → roda para ficar virado para +Z (fora da lata)
  lens.rotation.y = Math.PI;
  lens.position.z = CAN_LEN / 2 + RIM_LEN + 0.001;
  lens.material = lensMat;
  lens.parent = root;
  lens.isPickable = false;

  root.setEnabled(false);
  return { root, can, rim, lens, lensMat };
}

// haste/yoke: cilindro fino entre o corpo e o ponto de fixação (teto/parede). Comprimento e
// orientação mudam por frame (a posição do corpo pode mudar com spotDist/az/el) — recriar a matriz é
// mais simples que reescalar um filho, porque o comprimento varia livremente.
function buildStem(scene, idx, mats) {
  const stem = BABYLON.MeshBuilder.CreateCylinder('fixtureStem' + idx,
    { diameter: STEM_D, height: 1, tessellation: 8 }, scene);
  stem.material = mats.stemMat;
  stem.isPickable = false;
  stem.setEnabled(false);
  return stem;
}

export function createFixtures(scene, CONFIG, room) {
  const N = Math.max(0, CONFIG.spots.length | 0);
  const mats = makeFixtureMaterials(scene);
  const fixtures = [];
  const stems = [];
  for (let i = 0; i < N; i++) {
    fixtures.push(buildFixture(scene, i, mats));
    stems.push(buildStem(scene, i, mats));
  }

  const R = CONFIG.room;
  const ZERO = BABYLON.Vector3.Zero();
  const tmpPos = new BABYLON.Vector3();
  const tmpFwd = new BABYLON.Vector3();
  const tmpQuat = new BABYLON.Quaternion();
  const AXIS_Z = new BABYLON.Vector3(0, 0, 1);

  // clampa um ponto (array [x,y,z]) ao volume da sala (halfW/ceil/floor; sem clamp em z=back porque a
  // frente fica aberta — câmara desse lado, um pinspot nunca fica ali) — devolve [x,y,z] novo +
  // flag `clamped` (para o PARITY / debug, não usado por agora).
  function clampToRoom(p) {
    const x = clamp(p[0], -R.halfW, R.halfW);
    const y = clamp(p[1], R.floor, R.ceil);
    const z = Math.max(p[2], R.back); // não deixa o corpo "atravessar" a parede de trás
    return [x, y, z];
  }

  // ponto de fixação mais próximo (teto ou parede lateral/traseira) a partir da posição do corpo e da
  // direção S (a mesma que aponta da bola para o corpo) — brief §1: el>45° → teto, senão parede.
  // A parede escolhida é a mais próxima na direção de S (lateral se |Sx| domina, senão traseira).
  function mountPoint(pos, S, elDeg) {
    if (elDeg > 45) {
      return [pos[0], R.ceil, pos[2]];
    }
    // parede: lateral (x=±halfW) se a componente lateral de S for maior que a de profundidade; senão
    // traseira (z=back). Ambas plausíveis fisicamente (pinspots presos em treliça lateral ou na parede
    // do fundo da sala) — escolhe-se a mais perto do corpo para a haste ficar curta e crível.
    const distSide = Math.abs(R.halfW - Math.abs(pos[0]));
    const distBack = Math.abs(pos[2] - R.back);
    if (distSide <= distBack) return [Math.sign(pos[0]) * R.halfW || R.halfW, pos[1], pos[2]];
    return [pos[0], pos[1], R.back];
  }

  function update(mountedSpots, E) {
    const on = CONFIG.fixturesOn !== false;
    if (!on || !N) {
      for (let i = 0; i < N; i++) { fixtures[i].root.setEnabled(false); stems[i].setEnabled(false); }
      return;
    }
    const scale = Math.max(0.05, num(CONFIG.fixtureScale, 1));
    const lensGain = Math.max(0, num(CONFIG.lensGain, 1));
    const stemOn = CONFIG.fixtureStemOn !== false;
    const spotDist = Math.max(0.5, num(CONFIG.spotDist, 6));
    const spots = mountedSpots || [];

    let used = 0;
    for (let k = 0; k < spots.length && used < N; k++) {
      const sp = spots[k];
      if (!sp || !sp.S || sp.wide || sp.isFlash) continue; // luz indireta e flashes não têm corpo físico
      const fx = fixtures[used];
      const stem = stems[used];
      const I = num(sp.I, 0);
      const S = sp.S; // [x,y,z] unitário, bola->foco

      const rawPos = [S[0] * spotDist, S[1] * spotDist, S[2] * spotDist];
      const pos = clampToRoom(rawPos);

      // corpo: posição + orientação (eixo local +Z aponta para −S, ou seja, para a bola)
      tmpPos.set(pos[0], pos[1], pos[2]);
      fx.root.position.copyFrom(tmpPos);
      fx.root.scaling.set(scale, scale, scale);
      tmpFwd.set(-S[0], -S[1], -S[2]);
      if (tmpFwd.lengthSquared() > 1e-10) {
        tmpFwd.normalize();
        BABYLON.Quaternion.FromUnitVectorsToRef(AXIS_Z, tmpFwd, tmpQuat);
        fx.root.rotationQuaternion = fx.root.rotationQuaternion || new BABYLON.Quaternion();
        fx.root.rotationQuaternion.copyFrom(tmpQuat);
      }
      fx.root.setEnabled(true);

      // lente: única coisa que emite, só quando o spot está ligado (I>=0.02, mesmo teto do resto do
      // spike — `updateSpotLights`/ball.js usam o mesmo limiar). Cor: greyscale por omissão; tinge com
      // o matiz do spot se `CONFIG.spotColorOn` (F2, opt-in do David) — a lente é emissiva pura, NÃO
      // ilumina a sala (regra 6: a bola não emite luz; o mesmo espírito aplica-se aos corpos — só a
      // SpotLight real, já criada por `main.js`, ilumina).
      const emit = I >= 0.02 ? clamp(I * lensGain, 0, 4) : 0;
      const col = spotColorFor(CONFIG.spots[k], CONFIG); // pode ser null (spot k pode não bater com o índice de CONFIG.spots se a lista vier filtrada — aproximação aceitável, só cosmética)
      if (col) fx.lensMat.emissiveColor.set(col[0] * emit, col[1] * emit, col[2] * emit);
      else fx.lensMat.emissiveColor.set(emit, emit, emit);

      // haste/yoke: linha fina do corpo até ao ponto de fixação (teto ou parede), escolhido pela
      // direção S (el>45° → teto, senão parede lateral/traseira mais próxima).
      if (stemOn) {
        const mp = mountPoint(pos, S, sp.el);
        const dx = mp[0] - pos[0], dy = mp[1] - pos[1], dz = mp[2] - pos[2];
        const len = Math.hypot(dx, dy, dz);
        if (len > 1e-4) {
          stem.scaling.set(scale, len, scale); // CreateCylinder nasce ao longo de Y — a haste escala em Y
          stem.position.set(pos[0] + dx * 0.5, pos[1] + dy * 0.5, pos[2] + dz * 0.5);
          tmpFwd.set(dx / len, dy / len, dz / len);
          BABYLON.Quaternion.FromUnitVectorsToRef(BABYLON.Vector3.UpReadOnly || new BABYLON.Vector3(0, 1, 0), tmpFwd, tmpQuat);
          stem.rotationQuaternion = stem.rotationQuaternion || new BABYLON.Quaternion();
          stem.rotationQuaternion.copyFrom(tmpQuat);
          stem.setEnabled(true);
        } else {
          stem.setEnabled(false);
        }
      } else {
        stem.setEnabled(false);
      }

      used++;
    }
    for (let i = used; i < N; i++) { fixtures[i].root.setEnabled(false); stems[i].setEnabled(false); }
  }

  return { update };
}
