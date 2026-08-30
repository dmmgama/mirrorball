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
