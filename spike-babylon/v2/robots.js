// v2/robots.js — F8 (David, 2026-09-01): ROBOTS DE TETO do Lux Frágil.
//
// ---- O QUE SÃO (docs/f8-sala-lux.md, screenshots 010406/010437/010531) ----
// "Fixtures LED multi-lente (tipo wash/beam compacto) montados praticamente À FACE DO TETO, aos
//  PARES dos dois lados da bola, a projetar cones estreitos (vermelho nas fotos) para a PISTA,
//  inclinados para dentro ~20-30° da vertical."
//
// 4 corpos compactos em (X, Z) = (±halfX, ±halfZ) = (±3.5, ±3.5) — dois de cada lado da bola, em
// pares simétricos. A LENTE fica a ≤ 0,5 m do teto (`dropM` 0.35 → corpo a ceil-0.35, lente por
// baixo mas ainda dentro dos 0,5 m). Cada um leva UMA SpotLight fraca de cone estreito
// (`coneDeg` 12° de meia-abertura), inclinada `tiltDeg` da VERTICAL na direção do centro da pista.
//
// ---- REGRAS QUE ESTE MÓDULO CUMPRE (herdadas do handoff S9 / CLAUDE.md) ----
// 1. A BOLA é EXCLUÍDA destas SpotLight (main.js: `excludeBallFromRobots`). Não são focos da bola —
//    são luz de pista; a bola só as vê como corpos refletidos no ReflectionProbe. Isto evita também
//    qualquer risco de as ler como "foco superior" a lavar a bola (a incidência na bola vem só dos
//    `CONFIG.spots`, a H=3,5 m, regra do David).
// 2. Os PLANOS da sala entram em `excludedMeshes` (mesmo fix S9 "parede de luz": um cone estreito e
//    intenso a bater no chão/parede torra o plano inteiro para branco). O cone lê-se pelos corpos e
//    pelo haze; os pilares/chapéus continuam a poder ser tocados (objetos estreitos, dá realismo).
// 3. Materiais PBR novos com `reflectionTexture` PRÓPRIA (cubo 1×1 quase preto) — regressão S8
//    "tudo preto": um PBR sem ela cai no `scene.environmentTexture`, que é o cubo do probe da bola,
//    e em WebGPU dá GPUValidationError (ver o comentário longo em v2/room.js).
// 4. Pool FIXO de 4 corpos + 4 luzes, criados uma vez, nunca destruídos — só `setEnabled`, que
//    acompanha SEMPRE o estado (bug S9 nº1: objeto oculto sem setEnabled(false) desenha-se na mesma).
// 5. Posições DETERMINÍSTICAS, nunca resorteadas (regra do David: posição fixa; só dimmer/cor variam).
//
// createRobots(scene, CONFIG) -> { meshes, lights, update() }
//   `meshes` — array achatado de meshes reais (corpo + lente) para o main.js juntar à renderList do
//              probe (NUNCA TransformNodes — rebentam o `_prepareRenderingManager` em WebGPU).
//   `lights` — as 4 SpotLight, para o main.js excluir a bola delas.

import { applyColorToggle, hueToRgb } from './colorutil.js?v=1';

function num(v, d) { return Number.isFinite(v) ? v : d; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

const N_ROBOTS = 4;
// corpo compacto, em metros (= raios da bola): caixa achatada tipo wash LED de 4 lentes.
const BODY_W = 0.34, BODY_H = 0.22, BODY_D = 0.26;
const LENS_D = 0.20;

export function createRobots(scene, CONFIG) {
  const R = () => CONFIG.robots || {};

  // cubo escuro partilhado (ver regra 3 acima)
  let darkCube = null;
  {
    const px = new Uint8Array([7, 6, 6, 255]);
    try {
      darkCube = new BABYLON.RawCubeTexture(
        scene, [px, px, px, px, px, px], 1,
        BABYLON.Engine.TEXTUREFORMAT_RGBA, BABYLON.Engine.TEXTURETYPE_UNSIGNED_BYTE,
        false, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);
    } catch (e) {
      console.error('[MB2] robots.js: RawCubeTexture falhou (ver comentário em v2/room.js):', e);
    }
  }

  const bodyMat = new BABYLON.PBRMaterial('robotBody', scene);
  bodyMat.albedoColor = new BABYLON.Color3(0.045, 0.045, 0.05);
  bodyMat.metallic = 0.7;
  bodyMat.roughness = 0.55;
  bodyMat.maxSimultaneousLights = 2; // perf: mesma nota de fixtures.js (evita recompilar shaders)
  bodyMat.reflectionTexture = darkCube;

  const robots = [];
  const lights = [];
  const flatMeshes = [];

  for (let i = 0; i < N_ROBOTS; i++) {
    const root = new BABYLON.TransformNode('robotRoot' + i, scene);

    const body = BABYLON.MeshBuilder.CreateBox('robotBody' + i,
      { width: BODY_W, height: BODY_H, depth: BODY_D }, scene);
    body.material = bodyMat;
    body.parent = root;
    body.isPickable = false;

    // lente: disco emissivo colado à face -Z local (a face por onde o cone sai). Material próprio
    // por robot porque a cor segue o dimmer/toggle de cor. `disableLighting` — a lente mostra só o
    // seu emissive, não reage à sala (mesma escolha de fixtures.js; mais barato e mais correto).
    const lensMat = new BABYLON.PBRMaterial('robotLens' + i, scene);
    lensMat.albedoColor = new BABYLON.Color3(0, 0, 0);
    lensMat.emissiveColor = new BABYLON.Color3(0, 0, 0);
    lensMat.disableLighting = true;
    /* ⚠ a lente ESTÁ na renderList do probe (é um corpo que a bola espelha) → regra 3 do cabeçalho:
       `reflectionTexture` PRÓPRIA obrigatória. `disableLighting` NÃO isenta — o PBR continua a
       amostrar o `scene.environmentTexture` para o termo de reflexão, que é o cubo do probe, e em
       WebGPU isso é o ciclo write+read no mesmo synchronization scope (regressão S8 "tudo preto").
       O guarda de ball.js (linha ~488) apanhou isto ao vivo nesta sessão. */
    lensMat.reflectionTexture = darkCube;
    const lens = BABYLON.MeshBuilder.CreateDisc('robotLens' + i,
      { radius: LENS_D / 2, tessellation: 16 }, scene);
    lens.material = lensMat;
    lens.position.z = -(BODY_D / 2 + 0.005); // à face da frente (o disco olha para -Z, que é a mira)
    lens.rotation.y = Math.PI;               // vira o disco para fora
    lens.parent = root;
    lens.isPickable = false;

    const L = new BABYLON.SpotLight('robotSpot' + i,
      BABYLON.Vector3.Zero(), new BABYLON.Vector3(0, -1, 0), 0.4, 6, scene);
    L.intensity = 0;
    L.radius = 0.02;
    L.setEnabled(false);

    root.setEnabled(false);
    robots.push({ root, body, lens, lensMat, light: L });
    lights.push(L);
    flatMeshes.push(body, lens);
  }

  /* posições/orientações FIXAS (determinísticas, calculadas uma vez por chamada de update — baratas,
     e assim seguem `ceil` se o pé-direito mudar). Os 4 cantos (±halfX, ±halfZ); a mira é para BAIXO
     inclinada `tiltDeg` da vertical na direção do CENTRO da sala (a pista), ou seja o alvo no chão
     fica `tan(tilt)·queda` mais para dentro que o corpo, em X e Z. */
  function poseOf(i, cfg, ceilY, floorY) {
    const hx = num(cfg.halfX, 3.5), hz = num(cfg.halfZ, 3.5);
    const sx = (i === 0 || i === 1) ? -1 : 1;   // pares: 0/1 do lado -X, 2/3 do lado +X
    const sz = (i === 0 || i === 2) ? -1 : 1;
    const drop = clamp(num(cfg.dropM, 0.35), 0.05, 1.5); // lente a ≤ 0,5 m do teto
    const y = ceilY - drop;
    const x = sx * hx, z = sz * hz;
    const tilt = clamp(num(cfg.tiltDeg, 25), 0, 60) * Math.PI / 180;
    const fall = Math.max(0.5, y - floorY);
    const inward = Math.tan(tilt) * fall;
    // alvo no CHÃO, deslocado para dentro (na direção do eixo central) em X e Z
    const tx = x - sx * Math.min(inward, Math.abs(x)); // nunca passa do eixo central
    const tz = z - sz * Math.min(inward, Math.abs(z));
    return { x, y, z, tx, ty: floorY, tz };
  }

  const tmpTarget = new BABYLON.Vector3();
  const tmpDir = new BABYLON.Vector3();

  function update() {
    const cfg = R();
    const on = cfg.on !== false;
    if (!on) {
      // setEnabled acompanha SEMPRE o estado (bug S9 nº1)
      for (const r of robots) { r.root.setEnabled(false); r.light.setEnabled(false); }
      return;
    }
    const room = CONFIG.room || {};
    const ceilY = num(room.ceil, 2.0), floorY = num(room.floor, -3.5);
    const inten = Math.max(0, num(cfg.intensity, 0.45));
    const coneHalf = clamp(num(cfg.coneDeg, 12), 2, 45) * Math.PI / 180;
    const [cr, cg, cb] = applyColorToggle(CONFIG, ...hueToRgb(num(cfg.hue, 0), 0.85, 1));

    for (let i = 0; i < N_ROBOTS; i++) {
      const r = robots[i];
      const p = poseOf(i, cfg, ceilY, floorY);
      r.root.position.set(p.x, p.y, p.z);
      tmpTarget.set(p.tx, p.ty, p.tz);
      r.root.lookAt(tmpTarget, Math.PI, 0, 0); // -Z local (lente) passa a apontar ao alvo
      r.root.setEnabled(true);

      const L = r.light;
      L.position.set(p.x, p.y, p.z);
      tmpDir.set(p.tx - p.x, p.ty - p.y, p.tz - p.z).normalize();
      L.direction.copyFrom(tmpDir);
      L.angle = coneHalf * 2;          // Babylon: `angle` é a abertura TOTAL do cone
      L.intensity = inten * 60;        // escala da SpotLight (mesma ordem de grandeza do wash/spotLightIntensity)
      L.diffuse.set(cr, cg, cb);
      L.specular.set(cr, cg, cb);
      L.setEnabled(inten > 0.005);

      // a lente acompanha o dimmer (a luz "nasce" dela) — nunca acima de 1 por canal
      const e = Math.min(1, inten * 1.3);
      r.lensMat.emissiveColor.set(cr * e, cg * e, cb * e);
    }
  }

  return { meshes: flatMeshes, lights, update };
}
