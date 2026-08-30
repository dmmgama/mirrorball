// v2/room.js — sala implícita de 5 planos (mesmas medidas do CONFIG.room), material mate escuro.
// ES module. buildRoom(scene, CONFIG) -> { planes }
export function buildRoom(scene, CONFIG) {
  const R = CONFIG.room;
  const roomMat = new BABYLON.PBRMaterial('roomMat', scene);
  roomMat.albedoColor = new BABYLON.Color3(0.055, 0.055, 0.055);
  roomMat.metallic = 0;
  roomMat.roughness = 0.95;
  roomMat.backFaceCulling = false;
  roomMat.maxSimultaneousLights = 12;

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
  {
    const px = new Uint8Array([10, 10, 10, 255]); // sala escura, constante em todas as direções
    try {
      roomMat.reflectionTexture = new BABYLON.RawCubeTexture(
        scene, [px, px, px, px, px, px], 1,
        BABYLON.Engine.TEXTUREFORMAT_RGBA, BABYLON.Engine.TEXTURETYPE_UNSIGNED_BYTE,
        false, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);
    } catch (e) {
      // sem RawCubeTexture o ciclo volta — avisa alto, senão o sintoma é só "está tudo preto"
      console.error('[MB2] room.js: RawCubeTexture falhou — a sala vai cair no scene.environmentTexture ' +
        'e em WebGPU o frame fica preto (ver comentário em v2/room.js):', e);
    }
  }

  function plane(name, w, h, pos, rot) {
    const p = BABYLON.MeshBuilder.CreatePlane(name, { width: w, height: h, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, scene);
    p.position = pos;
    if (rot) p.rotation = rot;
    p.material = roomMat;
    p.receiveShadows = true;
    return p;
  }

  const roomW = R.halfW * 2, roomH = R.ceil - R.floor, roomD = Math.abs(R.back) * 2;
  const planes = [
    plane('room_back',  roomW, roomH, new BABYLON.Vector3(0, (R.ceil + R.floor) / 2, R.back)),
    plane('room_floor', roomW, roomD, new BABYLON.Vector3(0, R.floor, 0), new BABYLON.Vector3(Math.PI / 2, 0, 0)),
    plane('room_ceil',  roomW, roomD, new BABYLON.Vector3(0, R.ceil, 0),  new BABYLON.Vector3(-Math.PI / 2, 0, 0)),
    plane('room_left',  roomD, roomH, new BABYLON.Vector3(-R.halfW, (R.ceil + R.floor) / 2, 0), new BABYLON.Vector3(0, Math.PI / 2, 0)),
    plane('room_right', roomD, roomH, new BABYLON.Vector3( R.halfW, (R.ceil + R.floor) / 2, 0), new BABYLON.Vector3(0, -Math.PI / 2, 0)),
  ];

  return { planes, material: roomMat };
}
