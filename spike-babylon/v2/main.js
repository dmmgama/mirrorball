// v2/main.js — esqueleto do spike v2 (Fase 1): engine, sala, câmara, luzes mínimas, loop/HUD, painel `d`.
// A malha da bola é responsabilidade do Opus (v2/ball.js); aqui só se importa dinamicamente com stub de recurso.
import { buildRoom } from './room.js?v=4';
import { initPanel } from './panel.js?v=10';
import { applyColorToggle, hueToRgb } from './colorutil.js?v=1';

const CONFIG = window.CONFIG;
const canvas = document.getElementById('rc');
const hud = document.getElementById('hud');
const D2R = Math.PI / 180;

const qs = new URLSearchParams(location.search);
const forceWebGL = qs.get('webgl') === '1';

/* ---- F8-b (David): mostrar/esconder o HUD — botão #hudbtn + tecla `h`, escolha PERSISTIDA ----
   localStorage['mb2.hudOn'] ('0'/'1'); default visível. O botão fica sempre no ecrã (mesmo com o
   HUD escondido) para haver sempre como o trazer de volta sem saber a tecla. A classe `hudoff` no
   <body> é o que move o botão para o canto (ver CSS em index.html). */
const hudBtn = document.getElementById('hudbtn');
let hudOn = true;
try { hudOn = localStorage.getItem('mb2.hudOn') !== '0'; } catch (e) { /* modo privado */ }
function applyHudVisible() {
  if (hud) hud.classList.toggle('off', !hudOn);
  document.body.classList.toggle('hudoff', !hudOn);
  if (hudBtn) hudBtn.setAttribute('aria-pressed', hudOn ? 'true' : 'false');
}
function setHudVisible(v) {
  hudOn = !!v;
  try { localStorage.setItem('mb2.hudOn', hudOn ? '1' : '0'); } catch (e) { /* modo privado */ }
  applyHudVisible();
}
applyHudVisible();
if (hudBtn) hudBtn.addEventListener('click', () => setHudVisible(!hudOn));
/* tecla `h`: ligada em `document` na fase de CAPTURA. Com o listener em `window` (bolha) a tecla
   não chegava cá quando o foco estava no <canvas> — o Babylon trata os eventos de teclado do canvas
   e a bolha não subia até nós (verificado ao vivo: o botão alternava, o `h` não). A captura corre
   antes de qualquer handler do canvas, por isso funciona com o foco onde estiver. */
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (e.key === 'h' || e.key === 'H') setHudVisible(!hudOn);
}, true);

/* ---- REGRESSÃO S8: os imports dinâmicos abaixo estavam a engolir falhas em `console.warn`
   (`ball.js indisponível, a usar stub`) — se o `ball.js` falhasse a importar, a cena ficava
   praticamente vazia e o David via "tudo preto" SEM nada no ecrã que o dissesse. `moduleFail()`
   escreve no #err (a caixa vermelha do index.html), que é impossível não ver. ---- */
const moduleErrors = [];
function moduleFail(file, err) {
  moduleErrors.push(file);
  const msg = (err && (err.message || err)) + '';
  console.error(`[MB2] ${file} FALHOU a carregar:`, err);
  try {
    const d = document.getElementById('err');
    if (d) {
      d.style.display = 'block';
      d.textContent += `MÓDULO EM FALTA: ${file} — ${msg}\n`;
    }
  } catch (e) { /* sem DOM */ }
}

/* ---- F12 §6: EXPLOSÃO POR DEFAULT OFF (pedido do David: "ligo quando quiser") ----
   ⚠ Armadilha conhecida deste spike (handoff S10): `localStorage` GANHA aos defaults novos. Mudar
   só o default não chegava — quem já usou o spike tem `mb2.explode = 'on'` gravado e continuava a
   ver a explosão, exatamente o problema que o brief avisa.
   DECISÃO (registada em docs/f12-estrelato.md): migração PONTUAL versionada. A chave
   `mb2.explodeDefault` marca que esta mudança de default já foi aplicada NESTA máquina; da primeira
   vez força `off` (mesmo com `on` gravado) e marca. A partir daí o botão/tecla do David manda como
   sempre — a migração não volta a correr nem lhe rouba a escolha. Para voltar a forçar um default
   no futuro, incrementa-se `EXPLODE_DEFAULT_VERSION`.
   ⚠ ORDEM: tem de correr ANTES do `setupXplButton` (F6) e do bloco F7 — os dois leem a chave. Por
   isso vive aqui em cima, antes de tudo. */
const XPL_KEY = 'mb2.explode';
const XPL_DEFAULT_KEY = 'mb2.explodeDefault';
const EXPLODE_DEFAULT_VERSION = 'f12-off';
(function migrateExplodeDefault() {
  try {
    if (localStorage.getItem(XPL_DEFAULT_KEY) === EXPLODE_DEFAULT_VERSION) return;
    localStorage.setItem(XPL_DEFAULT_KEY, EXPLODE_DEFAULT_VERSION);
    localStorage.setItem(XPL_KEY, 'off');
    console.log('[MB2] F12: explosão passou a OFF por defeito (migração única "' +
      EXPLODE_DEFAULT_VERSION + '"). Liga-se no botão "explosões" ou com a tecla `x`.');
  } catch (e) { /* sem storage: fica no default do código, que também é off */ }
})();

/* ---------------- engine: WebGPU quando existe, WebGL2 como recurso ----------------
   ?webgl=1 força WebGL2 — o WebGPU initAsync() pendura com o tab em segundo plano
   (Chrome em automação para screenshots), ver docs/babylon-reference.md §1 e §9. */
async function makeEngine() {
  if (!forceWebGL && navigator.gpu && BABYLON.WebGPUEngine) {
    try {
      const e = new BABYLON.WebGPUEngine(canvas, { antialias: true, stencil: true });
      await e.initAsync();
      return e;
    } catch (err) { console.warn('WebGPU falhou, a usar WebGL2:', err); }
  }
  return new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true }, true);
}

const engine = await makeEngine();
const scene = new BABYLON.Scene(engine);

function applyBgGrey() {
  const g = CONFIG.bgGrey / 255;
  scene.clearColor = new BABYLON.Color4(g, g, g, 1);
}
applyBgGrey();

/* ---------------- câmara ----------------
   ArcRotateCamera; pose inicial em (0,0,+camDistance) a olhar a origem (az=0 = câmara,
   como no CONFIG). alpha=-PI/2 coloca a câmara no eixo +Z olhando para a origem (mesma
   convenção do spike v1). fov calculado para a bola (raio 1) ocupar ballSizeVH da altura
   do viewport: diâmetro angular da bola = 2*asin(raio/camDistance); queremos que isso
   seja ballSizeVH da FOV vertical total. */
const ALPHA0 = Math.PI / 2; // ArcRotateCamera: x=r·cos(alpha)·sin(beta), z=r·sin(alpha)·sin(beta) → alpha=PI/2, beta=PI/2 dá posição (0,0,+radius)
const BETA0 = Math.PI / 2;
/* ---- F13 §3: raio da bola, fonte de verdade para o main.js ----
   O `ball.js` publica `CONFIG.ballR` (ver `applyBallScale`), mas o main.js precisa dele ANTES de
   o ball.js carregar (câmara, halo). Por isso deriva-se aqui do knob, com o MESMO clamp — e a
   partir do momento em que a bola existe os dois números são o mesmo. NaN-safe (regra 7). */
function ballRadius() {
  const d = num(CONFIG.ballDiameterM, 2.0);
  return clamp01to15((Number.isFinite(d) ? d : 2.0) / 2);
}
function clamp01to15(v) { return v < 1.0 ? 1.0 : v > 1.5 ? 1.5 : v; }
/* CÂMARA E RAIO (decisão F13 §3): `camDistance` é documentado "em raios da bola" (config.js:100) e
   até aqui era usado como metros porque 1 raio = 1 m. Passa a ser honrado como RAIOS: a distância
   do mundo é `camDistance · raio`. Consequência querida: com a bola a Ø 3 m a câmara AFASTA-SE na
   mesma proporção e o ENQUADRAMENTO não muda — a bola continua a ocupar `ballSizeVH` do ecrã, que
   é o contrato do `computeFov()`. Se em vez disso a câmara ficasse quieta, subir o diâmetro dava
   um zoom disfarçado e ninguém conseguiria julgar o tamanho.
   É também isto que mantém o `camD` do loop do ball.js (que corre em raios) válido sem tocar em
   nenhuma das margens afinadas lá dentro (`camD − 1.5`, `nz·camD − 1`, `camD − 0.6`). */
function camWorldDistance() { return num(CONFIG.camDistance, 7) * ballRadius(); }
function computeFov() {
  // ângulo aparente da bola: 2·asin(raio / distância). Como a distância também é `·raio`, o raio
  // simplifica-se e a FOV é INVARIANTE ao diâmetro — que é precisamente o enquadramento fixo.
  const ang = 2 * Math.asin(Math.min(1, ballRadius() / Math.max(1e-3, camWorldDistance())));
  return ang / CONFIG.ballSizeVH;
}
const camera = new BABYLON.ArcRotateCamera('cam', ALPHA0, BETA0, camWorldDistance(), BABYLON.Vector3.Zero(), scene);
camera.attachControl(canvas, true);
camera.wheelPrecision = 40;
// F13 §3: o limite de aproximação é em raios (2,5 raios ≈ 1,5 raios de folga à superfície) —
// sem `×raio`, a bola de Ø 3 m deixava a câmara entrar-lhe quase pelos espelhos dentro.
camera.lowerRadiusLimit = 2.5 * ballRadius();
camera.upperRadiusLimit = 20 * ballRadius();
camera.fov = computeFov();
camera.fovMode = BABYLON.Camera.FOVMODE_VERTICAL_FIXED;

function resetCameraPose() {
  camera.alpha = ALPHA0;
  camera.beta = BETA0;
  camera.radius = camWorldDistance();
  camera.fov = computeFov();
  // F12 §3: repor a câmara volta a apontá-la ao centro da bola na cota em que ela está agora
  // (o loop reescreve isto por frame; aqui é só para o gesto da tecla `0` ser imediato).
  camera.target.x = 0; camera.target.z = 0;
  camera.target.y = num(CONFIG.ballHeightM, 3.5) - 3.5;
}
addEventListener('keydown', (e) => { if (e.key === '0') resetCameraPose(); });

/* ---------------- F10 fix: aplicar os knobs ⟳ do localStorage ANTES de construir a geometria ----------------
   Bug encontrado ao verificar o F10 (docs/f8-sala-lux.md): `buildRoom()`/`createHats()` correm aqui,
   MAS `initPanel()` (que lê `localStorage['mb2.knobs']` e escreve os valores persistidos em CONFIG)
   só corre a seguir ao `ball.js`, dezenas de linhas abaixo (`await initPanel(...)`) — ou seja, TODO
   knob ⟳ ('sala: pé-direito (m)', 'chapéus: corte da pala°', e agora 'pilares: vão entre filas (m)'/
   'pilares: passo na fila (m)'/'pilares: lado (m)') SEMPRE construía a sala com os defaults do
   config.js, nunca com o valor gravado — o F5 "para aplicar" não aplicava nada, geração após geração.
   Corrige-se aqui com um pré-passo SÍNCRONO e mínimo (não é o `initPanel` completo — só lê os 6 knobs
   ⟳ que afetam geometria construída uma vez) que escreve em CONFIG antes de `buildRoom`/`createHats`
   correrem. O `initPanel` mais abaixo continua a ser a fonte de verdade para os SLIDERS (reaplica os
   mesmos valores ao popover); este pré-passo só evita a sala nascer errada. */
(function preApplyReloadKnobs() {
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem('mb2.knobs') || 'null'); } catch (e) { /* sem storage */ }
  if (!stored || typeof stored !== 'object') return;
  const fin = (v) => Number.isFinite(v);
  if (fin(stored['pilares: vão entre filas (m)'])) {
    const v = stored['pilares: vão entre filas (m)'];
    CONFIG.pillars.halfX = v / 2;
    const M = fin(CONFIG.pillarWallMarginM) ? CONFIG.pillarWallMarginM : 2.5;
    CONFIG.roomWidthM = v + 2 * M;
    CONFIG.room.halfW = CONFIG.roomWidthM / 2;
    CONFIG.hats.lineX = CONFIG.roomWidthM / 2 - 1;
  }
  if (fin(stored['pilares: passo na fila (m)'])) {
    const v = stored['pilares: passo na fila (m)'];
    CONFIG.pillars.spacingZ = v;
    const M = fin(CONFIG.pillarEndMarginM) ? CONFIG.pillarEndMarginM : 2.5;
    CONFIG.roomDepthM = 2 * v + 2 * M;
    CONFIG.room.back = -CONFIG.roomDepthM / 2;
    CONFIG.hats.spacingZ = v / 2;
  }
  if (fin(stored['pilares: lado (m)'])) CONFIG.pillars.section = stored['pilares: lado (m)'];
  if (fin(stored['sala: pé-direito (m)'])) {
    CONFIG.roomHeightM = stored['sala: pé-direito (m)'];
    CONFIG.room.ceil = CONFIG.roomHeightM - 3.5;
  }
  if (fin(stored['chapéus: corte da pala°'])) CONFIG.hats.cutDeg = stored['chapéus: corte da pala°'];
  /* F11: 'bola (0/1)' TEM de estar aplicado antes de `createMikado` — a geração do mikado lê
     `CONFIG.ballOn` para decidir se abre a CLAREIRA à volta da bola (spec §4). Sem isto, quem
     tivesse a bola desligada em localStorage via na mesma o buraco no centro até mexer num knob.
     (Os outros knobs `mikado: *` de geometria não precisam: o painel chama `set()` de todos no
     arranque e o primeiro `onMikadoGeomChanged` refaz a disposição já com os valores gravados.) */
  if (fin(stored['bola (0/1)'])) CONFIG.ballOn = stored['bola (0/1)'] >= 0.5;
  /* F12 §3: mesma razão do `bola (0/1)` — o `createMikado` corre ANTES do `ball.js` e a clareira
     precisa de saber a que cota está a bola. Sem isto, quem tivesse a bola gravada noutra altura
     via a clareira aberta na cota NOMINAL até mexer num knob. Aqui só se pré-calcula a estimativa
     (o clamp real, contra o pé-direito, é do ball.js, que reescreve `ballYEffective` no arranque). */
  if (fin(stored['bola: altura (m)'])) CONFIG.ballHeightM = stored['bola: altura (m)'];
  CONFIG.ballYEffective = num(CONFIG.ballHeightM, 3.5) - 3.5;
  /* F13 §3: MESMA razão outra vez — o `createMikado` corre antes do `ball.js` e a CLAREIRA é
     `raio + margem`. Sem o diâmetro pré-aplicado, quem tivesse Ø 3,0 m gravado via a clareira
     aberta para uma bola de Ø 2,0 m e as barras a entrar-lhe pela superfície dentro, até tocar
     num knob. Publica-se já `ballR` (o `ball.js` reescreve-o com o mesmo clamp no arranque). */
  if (fin(stored['bola: diâmetro (m)'])) CONFIG.ballDiameterM = stored['bola: diâmetro (m)'];
  {
    const d = num(CONFIG.ballDiameterM, 2.0) / 2;
    CONFIG.ballR = d < 1.0 ? 1.0 : d > 1.5 ? 1.5 : d;
  }
})();

/* ---------------- F13 §4: o banner "dimensões da sala mudaram" foi ELIMINADO ------------------------
   HISTÓRIA. A F8 pôs uma faixa vermelha no `#err` a dizer "dimensões da sala mudaram — recarrega a
   página (F5) para aplicar" sempre que um knob ⟳ (geometria que só se constrói no arranque) fosse
   mexido. A F11 atribuiu o falso alarme permanente à reabertura do grupo "Sala"; a F12 descobriu a
   causa real (qualquer reposição EM BLOCO de knobs chama o `set()` de todos, incluindo os ⟳) e
   tornou o aviso honesto comparando o CONFIG vivo com `BUILT_GEOM`. **Não chegou**: o David voltou a
   apanhar o banner depois da F12, com a página recarregada (screenshot 2026-09-01).

   DECISÃO DO DAVID (F13 §4, âmbito fechado): "não quero avisos NENHUNS". Já não se persegue o
   caminho que o faz aparecer — o banner deixa de EXISTIR. `onRoomDimChanged` passa a não escrever
   NADA no DOM em circunstância nenhuma (ver o hook lá em baixo, agora um no-op documentado).

   O QUE FICA. `BUILT_GEOM`/`roomGeomDiffers()` ficam como LÓGICA INTERNA (o contrato da F13
   permite-o expressamente): são a única fotografia fiável de com que geometria a cena foi
   construída, e servem o diagnóstico por consola (`MB2.roomGeomDiffers()`) sem nada visível. O
   `#err` continua a existir e continua a ser usado — mas SÓ por `moduleFail()`, para falhas de
   import a sério, que é para o que nasceu (episódio "tudo preto" do S8). */
const BUILT_GEOM = {
  halfX: CONFIG.pillars.halfX,
  spacingZ: CONFIG.pillars.spacingZ,
  section: CONFIG.pillars.section,
  ceil: CONFIG.room.ceil,
  cutDeg: CONFIG.hats.cutDeg,
};
function roomGeomDiffers() {
  const eq = (a, b) => Math.abs(num(a, 0) - num(b, 0)) < 1e-6;
  return !(eq(CONFIG.pillars.halfX, BUILT_GEOM.halfX)
    && eq(CONFIG.pillars.spacingZ, BUILT_GEOM.spacingZ)
    && eq(CONFIG.pillars.section, BUILT_GEOM.section)
    && eq(CONFIG.room.ceil, BUILT_GEOM.ceil)
    && eq(CONFIG.hats.cutDeg, BUILT_GEOM.cutDeg));
}

/* ---------------- sala implícita: 5 planos + F8 pilares/chão de madeira ---------------- */
const room = buildRoom(scene, CONFIG);

/* ---------------- F8: chapéus de latão — import dinâmico (v2/hats.js) ----------------
   Carregado AQUI (antes do ball.js/attachProbe mais abaixo) para os meshes existirem a tempo de
   entrarem na renderList do ReflectionProbe — é o coração da F8: a bola TEM de os espelhar. */
let hats = null;
try {
  const mod = await import('./hats.js?v=14');
  hats = mod.createHats(scene, CONFIG);
  console.log('hats.js carregado.');
} catch (err) {
  moduleFail('hats.js', err);
}

/* ---------------- F8: robots de teto — import dinâmico (v2/robots.js) ----------------
   Como os chapéus, carregados ANTES do ball.js/attachProbe para os corpos entrarem na renderList do
   ReflectionProbe (a bola espelha o rig do teto). Ver o cabeçalho de robots.js para as regras. */
let robots = null;
try {
  const mod = await import('./robots.js?v=3');
  robots = mod.createRobots(scene, CONFIG);
  console.log('robots.js carregado.');
  /* fix S9 "parede de luz" aplicado aos robots: um cone estreito e intenso a bater no chão/parede
     torra o plano inteiro para branco (albedo baixo × I alto = saturação). Os 5 planos ficam de fora;
     pilares e chapéus NÃO (objetos estreitos a meio da sala — o cone tocar-lhes é realismo, e não há
     "parede" atrás deles para se torrar). A BOLA é excluída mais abaixo (excludeBallFromRobots). */
  for (const L of robots.lights) L.excludedMeshes.push(...room.planes);
} catch (err) {
  moduleFail('robots.js', err);
}

/* ---------------- F11: mikado do teto — import dinâmico (v2/mikado.js) ----------------
   Como chapéus/robots, carregado ANTES do ball.js/attachProbe para as barras entrarem na renderList
   do ReflectionProbe — a bola TEM de espelhar o mikado (é o ponto todo da fase: nas fotos do Lux é
   o mikado que se vê na bola). Ver o cabeçalho de mikado.js.

   ⚠ ORDEM: `createMikado` gera a disposição no construtor e a geração LÊ `CONFIG.ballOn` (com bola
   há clareira; sem bola, stack completo) — por isso o `preApplyReloadKnobs` acima já tem de ter
   escrito o `bola (0/1)` do localStorage. Ver o bloco F11 lá em cima. */
let mikado = null;
try {
  const mod = await import('./mikado.js?v=7');
  mikado = mod.createMikado(scene, CONFIG);
  console.log('mikado.js carregado —', mikado.barCount, 'barras.');
  /* mesmo fix S9 "parede de luz" dos robots: as PointLight do flash do mikado são fortes e estão
     junto ao teto — a bater direto nos 5 planos torravam teto/paredes para branco. Os planos ficam
     de fora; pilares/chapéus/robots continuam a poder ser pintados pelo flash (é o realismo: nas
     fotos o vermelho do mikado bate mesmo nos pilares). A BOLA é excluída mais abaixo
     (excludeBallFromRoomLights — o mikado está ACIMA dela e não é um foco dela). */
  for (const L of mikado.lights) L.excludedMeshes.push(...room.planes);
} catch (err) {
  moduleFail('mikado.js', err);
}

/* ---------------- F12 §5: ESTRELATO — import dinâmico (v2/stardom.js) ----------------
   Decide, em fronteiras musicais, QUAL a peça que conta a história (bola · mikado · chapéus) ou se
   é tudo smooth, e publica multiplicadores em `CONFIG.stardom.gain` que os módulos leem. A
   exclusão mútua mikado↔chapéus é estrutural (só há uma estrela). Ver o cabeçalho de stardom.js.
   Carregado DEPOIS dos chapéus (precisa de `hats.pulse` para os gestos) e antes do loop.
   Como todos os módulos deste spike: se falhar, avisa no #err e o resto continua a funcionar —
   os módulos leem `gain` com fallback 1 e correm como na F11. */
let stardom = null;
try {
  const mod = await import('./stardom.js?v=2');
  stardom = mod.createStardom(CONFIG, { hats });
  console.log('stardom.js carregado.');
} catch (err) {
  moduleFail('stardom.js', err);
}

/* ---------------- luzes mínimas ----------------
   Para i < spotCount: SpotLight na posição dirFromAzEl(az,el)·spotDist, apontada ao centro.
   HemisphericLight de `shade` (key·0.25) — luz geral barata da sala/volume da bola. */
function dirFromAzEl(azDeg, elDeg) {
  // az=0 é a direção da câmara (+Z); az cresce para a direita (como na Canvas 2D).
  const az = azDeg * D2R, el = elDeg * D2R;
  const cosEl = Math.cos(el);
  return new BABYLON.Vector3(Math.sin(az) * cosEl, Math.sin(el), Math.cos(az) * cosEl);
}

/* Focos: até 6 SpotLight PRÉ-CRIADAS (CONFIG.spots.length), nunca destruídas/recriadas por frame —
   só (des)ligadas com setEnabled. Posição/direção/intensidade vêm de ball.mountedSpots[i] quando o
   Opus o expuser (fonte única de verdade: S·spotDist a olhar C, I já com fade/choreo/spotFadeMix
   aplicados); enquanto não existir, cai no fallback local (dirFromAzEl, sem fade — Fase 1). */
/* F5: os FLASHES da coreografia também entram em `ball.mountedSpots` (a seguir aos focos), por isso
   o pool tem de cobrir `spots.length + flashSlots + 2` — as luzes extra ficam pré-criadas e
   desligadas (`setEnabled(false)`); NUNCA se criam/destroem luzes por frame (recompilava shaders). */
const N_SPOT_SLOTS = CONFIG.spots.length;
const N_FLASH_SLOTS = Math.max(0, Math.round(num((CONFIG.choreo || {}).flashSlots, 4))) + 2;
const MAX_SPOTS = N_SPOT_SLOTS + N_FLASH_SLOTS;
const spotLights = [];
for (let i = 0; i < MAX_SPOTS; i++) {
  const sp = CONFIG.spots[i] || { az: 0, el: 0, radius: 0.15, intensity: 0 };
  const dir = dirFromAzEl(sp.az, sp.el);
  const pos = dir.scale(CONFIG.spotDist);
  const toCenter = BABYLON.Vector3.Zero().subtract(pos).normalize();
  // F13 §3: `sp.radius` é o raio da mancha NA SUPERFÍCIE, em raios da bola (config.js:13) — numa
  // bola maior a mancha é fisicamente maior, logo o cone abre mais. `spotDist` está em metros.
  const angle = 2 * Math.atan((sp.radius * CONFIG.spotRadiusMul * ballRadius()) / CONFIG.spotDist) * 2.2;
  const light = new BABYLON.SpotLight('spot' + i, pos, toCenter, angle, 12, scene);
  light.intensity = CONFIG.spotLightIntensity * num(sp.intensity, 0);
  light.radius = 0.02;
  light.diffuse = new BABYLON.Color3(1, 1, 1);
  light.specular = new BABYLON.Color3(1, 1, 1);
  if (i >= N_SPOT_SLOTS) light.setEnabled(false);
  // o cone do pinspot continua para lá da bola e torrava a parede oposta ("parede de luz",
  // I até 2000 × albedo da sala = branco puro — visto a 2026-08-31). O pinspot real ilumina a
  // bola; a sala vê os REFLEXOS (dots.js) e as manchas, não o jato direto.
  light.excludedMeshes.push(...room.planes);
  spotLights.push(light);
}

function spotColor(sp) {
  if (!CONFIG.spotColorOn) return WHITE;
  // matiz por foco (0-360) + saturação global — HSV→RGB com V=1
  const h = ((num(sp.hue, 0) % 360) + 360) % 360 / 60, sat = Math.min(1, Math.max(0, num(CONFIG.spotSat, 1)));
  const c = sat, x = c * (1 - Math.abs((h % 2) - 1)), m = 1 - c;
  let r = 0, g = 0, b = 0;
  if (h < 1) { r = c; g = x; } else if (h < 2) { r = x; g = c; } else if (h < 3) { g = c; b = x; }
  else if (h < 4) { g = x; b = c; } else if (h < 5) { r = x; b = c; } else { r = c; b = x; }
  return new BABYLON.Color3(r + m, g + m, b + m);
}
function num(v, d) { return Number.isFinite(v) ? v : d; }
const WHITE = new BABYLON.Color3(1, 1, 1);

/* ---- F12 §3: onde está o CENTRO da bola neste frame ----
   `ball.centerY` é a fonte de verdade (0 = a cota nominal da F8; o slider 'bola: altura (m)'
   desloca-a). Devolve-se um Vector3 novo de propósito: quem chama faz `.subtract(pos)` e não pode
   escrever num vetor partilhado. Sem `ball` (arranque/stub) devolve a origem = comportamento antigo. */
function ballCenter() {
  return new BABYLON.Vector3(0, num(ball && ball.centerY, 0), 0);
}
function ballCenterY() { return num(ball && ball.centerY, 0); }

let activeSpotCount = 0, activeFlashCount = 0;
function updateSpotLights() {
  /* `ball.mountedSpots` (F2) é a fonte única de verdade: já traz os focos com fade/spotFadeMix/
     spotGain/spotsOn/spotCount aplicados e, desde a F5, os FLASHES da coreografia a seguir a eles
     (`isFlash: true`, raio já sem `spotRadiusMul`). Percorre-se `mountedSpots` (não `CONFIG.spots`),
     porque a lista já vem filtrada — o índice do array NÃO é o índice do `CONFIG.spots`. Os slots
     do pool que sobram ficam `setEnabled(false)`.
     Fallback (mountedSpots ainda não existe / ball em stub): az/el/intensity estáticos do CONFIG. */
  const mounted = (ball && ball.mountedSpots) || null;
  let used = 0, active = 0, flashes = 0;

  if (mounted && mounted.length) {
    for (let k = 0; k < mounted.length && used < MAX_SPOTS; k++) {
      const m = mounted[k];
      if (!m || !m.S || m.wide) continue;           // `wide` = luz indireta (RectAreaLight, não SpotLight)
      const light = spotLights[used];
      const I = num(m.I, 0);
      const S = new BABYLON.Vector3(m.S[0], m.S[1], m.S[2]);
      /* ⚠ REGRA 3 (handoff S10, David): a POSIÇÃO do corpo montado NUNCA muda. Com a F12 a bola
         sobe e desce ('bola: altura (m)'), mas o pinspot continua exatamente onde está pendurado
         — o que muda é a MIRA. Por isso `pos` é sempre `S·spotDist` no mundo (independente da cota
         da bola) e só a `direction` passa a apontar ao CENTRO REAL da bola (`ballCenter`). */
      const pos = S.scale(CONFIG.spotDist);
      light.position.copyFrom(pos);
      light.direction = ballCenter().subtract(pos).normalize();
      // o raio de `mountedSpots` já tem (ou não, se for flash) o spotRadiusMul aplicado (ball.js)
      // F13 §3: `m.r` vem em RAIOS da bola (ball.js:pushSpot) → `×ballRadius()` para metros.
      light.angle = 2 * Math.atan(Math.max(0.01, num(m.r, 0.15)) * ballRadius() / CONFIG.spotDist) * 2.2;
      light.intensity = CONFIG.spotLightIntensity * I;
      // flashes não têm entrada em CONFIG.spots (nascem da coreografia) → cor branca
      const col = m.isFlash ? WHITE : spotColor(CONFIG.spots[k] || {});
      light.diffuse = col;
      light.specular = col;
      const enabled = I >= 0.02;
      light.setEnabled(enabled);
      // HUD: focos e flashes contam-se em separado (`spots 2/2` continua a ser focos vs spotCount)
      if (enabled) { if (m.isFlash) flashes++; else active++; }
      used++;
    }
  } else {
    const n = Math.min(MAX_SPOTS, CONFIG.spots.length);
    for (let i = 0; i < n; i++) {
      const sp = CONFIG.spots[i], light = spotLights[i];
      const S = dirFromAzEl(sp.az, sp.el);
      const pos = S.scale(CONFIG.spotDist);
      const I = num(sp.intensity, 0);
      light.position.copyFrom(pos);
      light.direction = ballCenter().subtract(pos).normalize();   // F12 §3: mira segue a bola (posição não)
      light.angle = 2 * Math.atan((sp.radius * CONFIG.spotRadiusMul * ballRadius()) / CONFIG.spotDist) * 2.2; // F13 §3
      light.intensity = CONFIG.spotLightIntensity * I;
      const col = spotColor(sp);
      light.diffuse = col; light.specular = col;
      const enabled = i < CONFIG.spotCount && sp.on !== false && I >= 0.02;
      light.setEnabled(enabled);
      if (enabled) active++;
      used++;
    }
  }
  for (let i = used; i < MAX_SPOTS; i++) spotLights[i].setEnabled(false);
  activeSpotCount = active; activeFlashCount = flashes;
}

function rebuildSpotLights() { updateSpotLights(); } // mantido por compat: knobs chamam onSpotsChanged() → isto

const shadeDir = dirFromAzEl(CONFIG.shade.az, CONFIG.shade.el).scale(-1);
const hemi = new BABYLON.HemisphericLight('shade', shadeDir, scene);
hemi.intensity = CONFIG.shade.key * 0.25;
hemi.diffuse = new BABYLON.Color3(1, 1, 1);
hemi.groundColor = new BABYLON.Color3(1, 1, 1);
function updateShadeLight() {
  hemi.direction = dirFromAzEl(CONFIG.shade.az, CONFIG.shade.el).scale(-1);
  hemi.intensity = CONFIG.shade.key * 0.25;
}

/* ---------------- F8: wash ambiente azul profundo (grupo Sala, 'sala: wash'/'sala: wash matiz') ----
   Luz própria da SALA (distinta da "luz indireta" `ambient0-2` acima, que é a coreografia de focos
   largos que a bola reflete) — banha paredes/pilares/chão o suficiente para se LEREM os espelhos da
   bola no escuro (feedback S9: "as salas têm luz — ela não vem só dos focos que atingem a bola").
   1 HemisphericLight fraca com direção fixa de cima (cobre toda a sala, barata) tingida a azul
   profundo (hue default 230, ref. ~#1a2a66) — sujeita ao toggle 'cor (0/1)' via applyColorToggle. */
const washHemi = new BABYLON.HemisphericLight('washHemi', new BABYLON.Vector3(0, 1, 0), scene);
washHemi.groundColor = new BABYLON.Color3(0, 0, 0);
washHemi.specular = new BABYLON.Color3(0, 0, 0); // só luz difusa ambiente — não marca glint (regra 6 é da bola, mas evita "estourar" os espelhos)
function updateWash() {
  const W = CONFIG.wash || {};
  const inten = Math.max(0, num(W.intensity, 0.35));
  const [r, g, b] = applyColorToggle(CONFIG, ...hueToRgb(num(W.hue, 230), 0.55, 1));
  // escala calibrada a olho no Chrome (tab visível, screenshot real): com albedo ~0.05-0.10 das
  // paredes/pilares/chão, `×0.6` (tentativa inicial) ficava indistinguível do fundo (bgGrey=7,
  // quase preto) — o David pediu explicitamente luz que se LEIA nas paredes/espelhos (feedback S9).
  // `×3.4` no default (0.35) dá um wash moderado mas nitidamente visível; a 1.0 (topo do knob)
  // fica bem mais forte, ainda sem lavar a bola (que não recebe luz própria, regra 6).
  washHemi.intensity = inten * 3.4 * washStarMul();
  washHemi.diffuse.set(r, g, b);
  room.applyFloorColor(); // 'cor (0/1)' também recolapsa o tom de madeira do chão
}
/* F12 §5: "resto da sala EM BAIXO" no estrelato dos CHAPÉUS (spec §5b) — é o wash que recolhe.
   Multiplicador vivo do stardom (1 = neutro). Nunca vai a 0: sem wash nenhum a sala fica preta e
   deixa de se lerem os espelhos da bola, que foi o feedback S9 que originou o wash. */
function washStarMul() {
  const g = CONFIG.stardom && CONFIG.stardom.gain;
  return g ? clamp(num(g.wash, 1), 0.25, 2) : 1;
}
let lastWashMul = -1;
/* corre por frame, mas só toca na luz quando o multiplicador muda de facto (a rampa do stardom faz
   isto mudar ~0,6 s por transição e ficar quieto o resto do tempo — custo praticamente nulo). */
function updateWashStar() {
  const m = washStarMul();
  if (Math.abs(m - lastWashMul) < 0.002) return;
  lastWashMul = m;
  const W = CONFIG.wash || {};
  washHemi.intensity = Math.max(0, num(W.intensity, 0.35)) * 3.4 * m;
}
updateWash();

/* ---------------- luz indireta: 3 RectAreaLight (ambient.n) ----------------
   Posicionadas em dirFromAzEl(az,el)·(spotDist+1), viradas para a bola, largura/altura
   de areaDeg (2·dist·tan(areaDeg·D2R)), intensity = I·ambientLightMul (escala própria da RectAreaLight).
   Deambulam como :387 (fallback) ou seguem ball.ambientPoses quando o Opus o expuser. */
const MAX_AMBIENT = 3;
const ambientLights = [];
for (let i = 0; i < MAX_AMBIENT; i++) {
  // F13 §3: `spotDist` fica em METROS (o corpo montado não anda — regra 3 do handoff S10); o `+1`
  // era "um RAIO da bola para lá do foco" e portanto acompanha o diâmetro.
  const dist = CONFIG.spotDist + ballRadius();
  const areaSize = 2 * dist * Math.tan(CONFIG.ambient.areaDeg * D2R);
  const L = new BABYLON.RectAreaLight('ambient' + i, new BABYLON.Vector3(0, 0, dist), areaSize, areaSize, scene);
  L.intensity = 0;
  L.diffuse = new BABYLON.Color3(1, 1, 1);
  L.specular = new BABYLON.Color3(1, 1, 1);
  ambientLights.push(L);
}

function ambientPoseFallback(i, tSec) {
  // verbatim de index-v2.html:387 (sem o hash por tile, que fica no CPU do Opus)
  const A = CONFIG.ambient;
  const w = A.drift * (0.7 + 0.3 * i);
  const az = 140 * Math.sin(w * tSec + i * 2.4);
  const el = 25 + 35 * Math.sin(w * 0.61 * tSec + i * 1.3);
  return { az, el, I: A.intensity };
}

let activeAmbientCount = 0;
function updateAmbientLights(tSec) {
  const poses = ball && ball.ambientPoses; // [{az,el,I}] — fonte única de verdade quando existir
  const n = Math.max(0, Math.min(CONFIG.ambient.n | 0, MAX_AMBIENT));
  // F13 §3: `spotDist` fica em METROS (o corpo montado não anda — regra 3 do handoff S10); o `+1`
  // era "um RAIO da bola para lá do foco" e portanto acompanha o diâmetro.
  const dist = CONFIG.spotDist + ballRadius();
  const areaSize = 2 * dist * Math.tan(CONFIG.ambient.areaDeg * D2R);
  let active = 0;
  for (let i = 0; i < MAX_AMBIENT; i++) {
    const L = ambientLights[i];
    if (i >= n) { L.setEnabled(false); continue; }
    const p = (poses && poses[i]) || ambientPoseFallback(i, tSec);
    const dir = dirFromAzEl(p.az, p.el);
    const pos = dir.scale(dist);
    L.position.copyFrom(pos);
    L.direction = BABYLON.Vector3.Zero().subtract(pos).normalize();
    if (Number.isFinite(areaSize) && areaSize > 0) { L.width = areaSize; L.height = areaSize; }
    const I = num(p.I, 0);
    // RectAreaLight tem escala própria (~0.1-2 lê como indireta); NÃO multiplicar por spotLightIntensity (lavava a cena a branco)
    L.intensity = I * CONFIG.ambientLightMul;
    L.setEnabled(true);
    active++;
  }
  activeAmbientCount = active;
}

/* ---------------- auréola (halo) — Fase 4 ----------------
   Disco billboard na posição da bola, raio 2.6 (raios da bola), gradiente radial gerado UMA vez
   (1 a r=0.9 → 0 a r=2.6, 128 px) via `opacityTexture` procedural — index-v2.html:406-407.
   ALPHA_ADD, sem depth write, desenhado ATRÁS da bola (renderingGroupId 0, mas a bola desenha por
   cima porque a auréola nasce primeiro na lista — ver ordem de criação/`alphaIndex` abaixo). */
const HALO_R = 2.6;
function makeHaloTexture(scene) {
  const size = 128;
  const dt = new BABYLON.DynamicTexture('haloRamp', { width: size, height: size }, scene, false);
  const ctx = dt.getContext();
  const cx = size / 2, cy = size / 2;
  const g = ctx.createRadialGradient(cx, cy, (0.9 / HALO_R) * cx, cx, cy, cx);
  g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  dt.update();
  dt.hasAlpha = true;
  dt.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
  dt.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
  return dt;
}
const haloTex = makeHaloTexture(scene);
const haloMat = new BABYLON.StandardMaterial('haloMat', scene);
haloMat.disableLighting = true;
haloMat.emissiveColor = new BABYLON.Color3(1, 1, 1);
haloMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
haloMat.specularColor = new BABYLON.Color3(0, 0, 0);
haloMat.opacityTexture = haloTex;
haloMat.alphaMode = BABYLON.Engine.ALPHA_ADD;
// WebGPU ignorava o override `needAlphaBlending` e desenhava o halo OPACO (disco branco gigante
// dentro da bola — regressão vista a 2026-08-31); o transparencyMode explícito tira-o da heurística.
haloMat.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
haloMat.disableDepthWrite = true;
haloMat.backFaceCulling = false;
haloMat.needAlphaBlending = () => true;
const haloMesh = BABYLON.MeshBuilder.CreatePlane('halo', { size: HALO_R * 2 }, scene);
haloMesh.material = haloMat;
haloMesh.isPickable = false;
haloMesh.alwaysSelectAsActiveMesh = true;
haloMesh.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL; // encara sempre a câmara — mais robusto que lookAt manual
haloMesh.renderingGroupId = 0;
haloMesh.alphaIndex = -1; // desenha ANTES da bola dentro do mesmo grupo (menor alphaIndex primeiro)
function updateHalo(E) {
  const spotGainDefault = (() => {
    const mounted = ball && ball.mountedSpots;
    if (!mounted || !mounted.length) return 0;
    let sum = 0;
    for (let i = 0; i < mounted.length; i++) sum += num(mounted[i].I, 0);
    return sum / mounted.length;
  })();
  // com 0 focos montados não há luz nenhuma a devolver — o E.spotGain da coreografia fica em 1
  // mesmo sem spots, e a auréola sobrevivia a `focos: quantos = 0` (nenhum knob a tirava).
  const mountedCount = (ball && ball.mountedSpots) ? ball.mountedSpots.length : 0;
  const spotGain = mountedCount === 0 ? 0
    : (Number.isFinite(E.spotGain) ? E.spotGain : spotGainDefault);
  const dk = 1 - (Number.isFinite(E.skinMix) ? E.skinMix : 0);
  const haze = num(E.haze, CONFIG.haze);
  // F7 (:407): com a bola em estilhaços já não há uma esfera a devolver luz difusa — a auréola
  // desvanece-se com `×(1 − 0.75·exS)`. Fica um resto (25%) porque os cacos ainda refletem.
  const exS = clamp01(num(E.exS, 0));
  const a = 0.05 * num(CONFIG.halo, 0) * haze * spotGain * (0.35 + 0.65 * dk) * (1 - 0.75 * exS);
  haloMat.alpha = clamp01(a);
  // F12 §3: a auréola é a névoa À VOLTA DA BOLA — tem de acompanhá-la quando ela sobe/desce
  // (é um billboard solto no mundo, não é filho do root da bola).
  const by = ballCenterY();
  if (haloMesh.position.y !== by) haloMesh.position.y = by;
  /* F13 §3: e tem de CRESCER com ela — `HALO_R` = 2,6 é em raios da bola (o plano nasceu com
     `size: HALO_R*2`, ou seja já com R=1 embutido). Escala-se a mesh em vez de a recriar: um
     `CreatePlane` novo por clique de knob deixava o `applyBallVisibility` a apontar para uma
     mesh morta (armadilha nº3 da F12). Só se escreve quando o valor muda de facto. */
  const rb = ballRadius();
  if (haloMesh.scaling.x !== rb) haloMesh.scaling.set(rb, rb, rb);
}
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

/* ---------------- bola: import dinâmico de ./ball.js (API do Opus) ----------------
   createBall(scene, CONFIG) -> { mesh, rebuild(), update(tSec, spots, E), tiles }
   Se ainda não existir (ou falhar), stub = esfera simples, só para se poder testar o resto. */
let ball = null;
try {
  const mod = await import('./ball.js?v=4');
  ball = mod.createBall(scene, CONFIG);
  console.log('ball.js carregado —', ball && ball.tiles, 'tiles');
  // F8: pilares + chapéus + robots de teto entram na renderList do probe — a bola tem de espelhar a
  // sala real (paredes+pilares+chapéus+rig), não só as 5 paredes. Meshes desligados
  // (setEnabled(false), sem hats montados ainda) também podem entrar: o probe só desenha o que está
  // enabled no refresh ONCE.
  // F11: as barras do mikado entram TAMBÉM na renderList — a bola tem de as espelhar (nas fotos do
  // Lux é exatamente isso que se vê na bola: o mikado refletido).
  const probeList = [...room.planes, ...(room.pillars || []), ...((hats && hats.meshes) || []),
    ...((robots && robots.meshes) || []), ...((mikado && mikado.meshes) || [])];
  if (ball.attachProbe) ball.attachProbe(probeList); // sala refletida nos espelhos (ONCE)
  /* F12 §3: o `createMikado` correu ACIMA, com a cota ESTIMADA do `preApplyReloadKnobs`; o
     `createBall` acabou de aplicar o CLAMP real (contra o pé-direito) e reescrever
     `CONFIG.ballYEffective`. Se os dois números não baterem certo, a clareira do mikado está aberta
     no sítio errado — regenera-se uma vez, aqui, e só nesse caso. */
  if (mikado && mikado.rebuild && Number.isFinite(ball.centerY)) {
    const est = num(CONFIG.ballHeightM, 3.5) - 3.5;
    if (Math.abs(est - ball.centerY) > 1e-6) {
      console.log('[MB2] F12: cota da bola clampada (' + est.toFixed(2) + ' → ' +
        ball.centerY.toFixed(2) + ') — a regenerar a clareira do mikado.');
      mikado.rebuild();
      if (ball.refreshProbe) ball.refreshProbe();
    }
  }
} catch (err) {
  moduleFail('ball.js', err);
  const stubMat = new BABYLON.PBRMaterial('stubMat', scene);
  stubMat.albedoColor = new BABYLON.Color3(0.5, 0.5, 0.5);
  stubMat.metallic = CONFIG.mirrorMetallic;
  stubMat.roughness = CONFIG.mirrorRoughness;
  // F13 §3: mesmo o stub de emergência respeita o diâmetro (senão o David via uma bola do tamanho
  // errado e culpava o knob, quando o problema era o ball.js não ter carregado).
  const mesh = BABYLON.MeshBuilder.CreateSphere('ballStub', { diameter: 2 * ballRadius(), segments: 32 }, scene);
  mesh.material = stubMat;
  ball = {
    mesh,
    rebuild() { /* stub: nada para reconstruir */ },
    update(tSec) { mesh.rotation.y = tSec * CONFIG.rotationRpm * 2 * Math.PI / 60; },
    tiles: 0,
  };
}
window.__MB2_ball = ball; // para o painel chamar rebuild() sem import circular

/* ---------------- F8 (regra do David, 2026-08-31): "nenhum foco inferior" ----------------
   Toda a incidência de luz na bola tem de vir de um corpo REAL montado em posição FIXA (teto/
   estrutura); nunca de baixo do equador para cima. Os chapéus (hats.js) têm a base a 2,5 m (centro
   ~3,0 m) — ABAIXO do centro da bola (3,5 m) — logo o PointLight de flash de cada chapéu, se atingisse a bola,
   seria exatamente esse foco inferior proibido (o chapéu está fisicamente por baixo do equador).
   Os chapéus são luz de AMBIENTE DE SALA (o brilho dourado contínuo/flash é lido pela bola só via o
   ReflectionProbe — reflexo do MATERIAL emissivo, não da PointLight), não focos dedicados à bola:
   por isso a PointLight de flash exclui explicitamente a bola (mesh/core/bone/chain), preservando o
   efeito na sala (pilares/chão/paredes) sem violar a regra.
   Idempotente e chamada TODOS os frames (barato: só `Set.has` + push condicional) porque `ball.chain`/
   `ball.chainHook` só se materializam no 1º `buildChain()` (dentro do 1º `ball.update()`, que corre
   DEPOIS deste ponto do módulo) — um único disparo aqui apanhava a bola/core mas perdia a corrente.

   F8 (2026-09-01): a MESMA exclusão aplica-se aos ROBOTS DE TETO (robots.js) — esses vêm de CIMA,
   mas também não são focos da bola: são luz de PISTA. Se iluminassem a bola diretamente, somavam-se
   à incidência dos `CONFIG.spots` e lavavam os espelhos com uma fonte que o rig real não aponta à
   bola. A bola vê-os só como CORPOS refletidos no probe (que é o que se vê nas fotos). */
const ballExcluded = new Map(); // luz -> Set de meshes já excluídas dessa luz
let lastExclChainGen = -1;
function excludeBallFrom(lights) {
  if (!lights || !ball) return;
  const parts = [ball.mesh, ball.core, ball.bone, ball.chain, ball.chainHook].filter(Boolean);
  for (const L of lights) {
    let seen = ballExcluded.get(L);
    if (!seen) { seen = new Set(); ballExcluded.set(L, seen); }
    const fresh = parts.filter(m => !seen.has(m));
    if (!fresh.length) continue;
    for (const m of fresh) seen.add(m);
    L.excludedMeshes.push(...fresh);
  }
}
/* F12 §3: com a corrente a ser reconstruída ao vivo (slider de altura), as meshes VELHAS ficavam
   para sempre nos `excludedMeshes` das luzes — e a arrastar o slider isso crescia sem limite (uma
   fuga silenciosa que só se veria como perda de frame ao fim de uns minutos). Quando o `chainGen`
   muda, purgam-se as meshes já destruídas de cada lista antes de acrescentar as novas. */
function purgeDeadExclusions() {
  const gen = num(ball && ball.chainGen, 0);
  if (gen === lastExclChainGen) return;
  lastExclChainGen = gen;
  for (const [L, seen] of ballExcluded) {
    for (const m of [...seen]) if (m.isDisposed && m.isDisposed()) seen.delete(m);
    const keep = L.excludedMeshes.filter(m => !(m.isDisposed && m.isDisposed()));
    if (keep.length !== L.excludedMeshes.length) L.excludedMeshes = keep;
  }
}
function excludeBallFromRoomLights() {
  purgeDeadExclusions();   // F12 §3: limpa a corrente antiga antes de registar a nova
  if (hats && hats.lights) excludeBallFrom(hats.lights);
  if (robots && robots.lights) excludeBallFrom(robots.lights);
  /* F11: o MIKADO está ACIMA da bola e não é um foco dela — a mesma regra dos robots. A bola vê o
     mikado como CORPO refletido no probe (que é o que as fotos mostram); se as PointLight do flash
     lhe batessem direto, somavam-se à incidência dos `CONFIG.spots` e lavavam os espelhos com uma
     fonte que o rig real não aponta à bola. */
  if (mikado && mikado.lights) excludeBallFrom(mikado.lights);
}

/* ---------------- F11: knob 'bola (0/1)' — a bola sai da sala (spec §4) ----------------
   Só o DAVID mexe nisto; o motor nunca liga/desliga elementos. Esconde a bola INTEIRA: a esfera de
   espelhos (`root`, que é o pai de mesh/core/bone), a corrente + o gancho (soltos no mundo, não são
   filhos do root — ver ball.js) e a auréola (`haloMesh`, um billboard independente).
   Idempotente e chamada por frame (barato: só compara com o último estado escrito) — tem de o ser
   porque `ball.chain`/`chainHook` só se materializam no 1º `buildChain()`, dentro do 1º
   `ball.update()`, e porque o `ball.rebuild()` (knobs ⏫) recria as meshes.
   As barras do mikado ficam onde estão: quem regenera a disposição quando este knob muda é o
   `onBallToggleChanged` do painel (a clareira depende de a bola estar montada). */
let lastBallVisible = null;
function applyBallVisibility() {
  const on = CONFIG.ballOn !== false;
  const parts = ball ? [ball.root, ball.chain, ball.chainHook].filter(Boolean) : [];
  /* re-aplica quando o estado muda OU quando aparecem meshes novas (corrente no 1º frame, rebuild).
     F12 §3: a contagem de partes deixou de chegar como assinatura — com o slider 'bola: altura' a
     corrente é RECONSTRUÍDA ao vivo e as meshes novas têm a mesma contagem que as velhas. Sem o
     `chainGen` no cache-key, uma corrente nova nascia VISÍVEL com a bola desligada (o par
     liga/desliga tem de ser simétrico — a armadilha da F11, noutra roupa). */
  const n = parts.length;
  const gen = ball ? num(ball.chainGen, 0) : 0;
  const key = on + ':' + n + ':' + gen;
  if (lastBallVisible === key) return;
  lastBallVisible = key;
  for (const m of parts) m.setEnabled(on);
  if (haloMesh) haloMesh.setEnabled(on);
}

/* ---------------- feixes refletidos + cone incidente: import dinâmico (API do Opus/Sonnet) ----------------
   beams.js pode ainda não existir (Opus em paralelo) — tolera com try/catch, tal como o ball.js. */
let beams = null;
try {
  const mod = await import('./beams.js?v=3');
  beams = mod.createBeams(scene, CONFIG, ball);
  console.log('beams.js carregado.');
} catch (err) {
  moduleFail('beams.js', err);
}

let incident = null;
try {
  const mod = await import('./incident.js?v=3');
  incident = mod.createIncident(scene, CONFIG);
  console.log('incident.js carregado.');
} catch (err) {
  moduleFail('incident.js', err);
}

/* ---------------- pontos na parede: import dinâmico (Fase 4) ---------------- */
let dots = null;
try {
  const mod = await import('./dots.js');
  dots = mod.createDots(scene, CONFIG, ball);
  console.log('dots.js carregado.');
} catch (err) {
  moduleFail('dots.js', err);
}

/* ================================================================================================
   ---- F6 fixtures/mini ----                                                       (bloco do SONNET)
   Corpos PAR36 visíveis (v2/fixtures.js) + `?mini=1`/`?scale=`/`?light=1`. O Opus faz em paralelo o
   bloco `// ---- F7 explode ----` (explode.js, ball.js, botão #xpl) — não se tocam.
   ================================================================================================ */
let fixtures = null;
try {
  const mod = await import('./fixtures.js?v=2');
  fixtures = mod.createFixtures(scene, CONFIG, room);
  console.log('fixtures.js carregado.');
} catch (err) {
  moduleFail('fixtures.js', err);
}

/* ---- ?mini=1 / ?scale=N / ?light=1 (paridade com web/index-v2.html:176-186, PARITY §1.16) ----
   Na Canvas 2D isto reescreve CONFIG.ballSizeVH/ballCenter/etc. (fração do viewport em px). Aqui não
   há canvas 2D — a métrica equivalente é o ENQUADRAMENTO da câmara: computeFov() já calcula o FOV
   vertical para a bola ocupar `CONFIG.ballSizeVH` da altura do ecrã, a `CONFIG.camDistance` fixo.
   `mini` só precisa de mudar `ballSizeVH` (0.66) — computeFov() já lê isso; chamamos resetCameraPose()
   para reaplicar o novo FOV. `ballCenter` não tem equivalente 3D direto (é offset 2D do centro da bola
   no ecrã) — divergência documentada em PARITY: aqui a bola fica sempre centrada (a câmara aponta à
   origem); o deslocamento vertical do original existe para dar espaço à corrente por cima, que aqui já
   está incluída no enquadramento da sala. `?scale=N` multiplica `ballSizeVH` (mesma fórmula do 2D). */
(function applyMiniScale() {
  const mini = qs.get('mini') === '1';
  const scaleQ = parseFloat(qs.get('scale'));
  const scale = Number.isFinite(scaleQ) && scaleQ > 0 ? scaleQ : 1;
  if (mini) {
    CONFIG.ballSizeVH = 0.66;
    CONFIG.facetRows = 39;
    CONFIG.beamWidthDeg = 1.6;
    CONFIG.beamLen = CONFIG.beamLen3D || 3.6; // equivalente 3D a `beamLength:1.0` (fração do viewport 2D) — comprimento cheio do cone
    CONFIG.dotScale = 0.5;
    CONFIG.bloomBlurPx = 5;
    CONFIG.grain = 0.02;
    CONFIG.vignette = 0.35;
    document.documentElement.classList.add('mini');
    CONFIG.skin = qs.get('light') === '1' ? 'white' : 'dark';
  }
  CONFIG.ballSizeVH *= scale;
  resetCameraPose(); // reaplica camera.fov com o novo ballSizeVH (função hoisted, já existe)
  // `CONFIG.skin` já ficou definido acima quando `mini` — `syncSkinBtn()` (mais abaixo no módulo) lê-o
  // no arranque (linha `if (skinBtn) { …; syncSkinBtn(); }`), por isso o botão já nasce sincronizado
  // sem precisarmos de o chamar aqui (a `const skinBtn` ainda não existe nesta fase do módulo — TDZ).
})();

/* ---- botão #xpl ("explosões: on/off") — DOM/estilo meus; o handler real (setExplodeEnabled) é do
   Opus (f67-sync.md). Persiste em localStorage['mb2.explode'] (mesma chave que o stub de F5 já lê). */
(function setupXplButton() {
  const ui = document.getElementById('ui');
  if (!ui) return;
  let btn = document.getElementById('xpl');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'xpl';
    ui.appendChild(btn);
  }
  // F12 §6: default OFF (ver `migrateExplodeDefault` no topo do módulo — a migração já correu).
  // A leitura passa a ser `=== 'on'`: sem valor gravado, a explosão está DESLIGADA.
  function getOn() {
    try { return localStorage.getItem('mb2.explode') === 'on'; } catch (e) { return false; }
  }
  function setOn(on) {
    try { localStorage.setItem('mb2.explode', on ? 'on' : 'off'); } catch (e) { /* sem storage */ }
    btn.textContent = 'explosões: ' + (on ? 'on' : 'off');
    dispatchEvent(new CustomEvent('mb2-xpl-toggle', { detail: { on } }));
    // S8: entra também em localStorage['mb2.toggles'], para o "gravar"/"carregar ficheiro" o levarem
    // (o painel ainda pode não existir quando isto corre no arranque — daí a guarda).
    try { if (window.MB2 && MB2.panel && MB2.panel.persistToggles) MB2.panel.persistToggles(); } catch (e) { /* */ }
  }
  setOn(getOn());
  // S8: "carregar ficheiro" no painel pode trazer o estado das explosões — resincroniza o botão.
  addEventListener('mb2-xpl-restore', (ev) => {
    const on = !!(ev.detail && ev.detail.on);
    if (window.MIRRORBALL && window.MIRRORBALL.setExplodeEnabled) window.MIRRORBALL.setExplodeEnabled(on);
    btn.textContent = 'explosões: ' + (on ? 'on' : 'off');
  });
  btn.onclick = () => {
    // se o Opus já ligou window.MIRRORBALL.setExplodeEnabled, prefere-se a API real (fonte única de
    // verdade); senão só o toggle visual/local (mini, sem F7 ainda carregado).
    const next = !getOn();
    if (window.MIRRORBALL && window.MIRRORBALL.setExplodeEnabled) window.MIRRORBALL.setExplodeEnabled(next);
    setOn(next);
  };
})();
/* ================================ fim do bloco F6 fixtures/mini =================================== */

// ball.tiles pode ser uma contagem (stub) ou o array de tiles (API do Opus) — normaliza para a contagem.
function tileCount() {
  const t = ball && ball.tiles;
  if (Array.isArray(t)) return t.length;
  return t || 0;
}

// ball.beams = { count, P, R, I } (API do Opus) — HUD 'feixes N'; 0 se beams.js/ball.beams ainda não existem.
function beamCount() {
  const b = ball && ball.beams;
  return (b && Number.isFinite(b.count)) ? b.count : 0;
}

/* ---------------- painel `d` ---------------- */
// S8: `initPanel` é async (carrega `knobs-default.json` — camada de defaults do spike fora do código,
// prioridade localStorage > knobs-default.json > config.js). main.js é um módulo com top-level await.
let panelReady = false; // ver onRoomDimChanged: a reposição inicial de localStorage não deve avisar "recarrega a página"
const panelApi = await initPanel(CONFIG, {
  onRebuildBall: () => { try { ball && ball.rebuild && ball.rebuild(); } catch (e) { console.error(e); } },
  onSpotsChanged: () => { rebuildSpotLights(); },
  onShadeChanged: () => { updateShadeLight(); },
  onBgGreyChanged: () => { applyBgGrey(); },
  // F8: wash/cor atuam AO VIVO (sem rebuild) — 'cor (0/1)' também recolapsa o chão de madeira.
  onWashChanged: () => { updateWash(); },
  onColorToggleChanged: () => { updateWash(); },
  // F8-b: toggle por pilar — setEnabled ao vivo (o pilar fica na renderList do probe; o probe só
  // desenha o que está enabled, por isso não se mexe na lista, que é fixada em attachProbe).
  onPillarsChanged: () => { try { room.applyPillarToggles(); } catch (e) { console.error(e); } },
  // F10: refletividade por superfície — ao vivo, sem rebuild (room.js: applyAllReflMul() remuta os
  // albedos existentes; applyFloorColor() já combina o multiplicador do chão com o toggle 'cor (0/1)').
  onReflChanged: () => { try { room.applyAllReflMul(); room.applyFloorColor(); } catch (e) { console.error(e); } },
  /* F11: geometria do mikado — regenera a disposição AO VIVO (sem reload). Ao contrário das
     dimensões da sala, a geração é barata (sorteio + escrita de posições num pool já criado, sem
     materiais nem meshes novas), por isso o David pode arrastar 'mikado: altura (m)' e ver as
     barras a subir. Depois de regenerar força-se um refresh do probe: as barras mudaram de sítio e
     a bola tem de as espelhar na posição nova (o probe é ONCE — sem isto ficava a reflexão velha). */
  onMikadoGeomChanged: () => {
    try {
      if (mikado && mikado.rebuild) mikado.rebuild();
      if (ball && ball.refreshProbe) ball.refreshProbe();
    } catch (e) { console.error('mikado.rebuild:', e); }
  },
  /* F11: 'bola (0/1)' — esconder/mostrar a bola muda TAMBÉM o mikado: com a bola montada abre-se a
     CLAREIRA à volta dela (spec §4, foto lux-barras2); sem bola, stack completo no centro. Por isso
     este toggle regenera o mikado. `applyBallVisibility()` corre no frame seguinte (loop). */
  onBallToggleChanged: () => {
    try {
      if (mikado && mikado.rebuild) mikado.rebuild();
      if (ball && ball.refreshProbe) ball.refreshProbe();
    } catch (e) { console.error('onBallToggleChanged:', e); }
  },
  /* F12 §3: 'bola: altura (m)' — a cota nova é aplicada pelo próprio `ball.update()` (que a lê por
     frame e reconstrói a corrente), mas há duas coisas que o ball.js não pode fazer sozinho:
       - o MIKADO tem de refazer a CLAREIRA à volta da posição nova (senão a bola sobe para dentro
         das barras, ou fica um buraco no ar onde ela já não está);
       - o PROBE tem de voltar a desenhar a sala a partir da cota nova.
     Notar o que NÃO acontece aqui: os corpos dos focos não se mexem (regra 3 do handoff S10) — o
     `updateSpotLights` re-mira-os no frame seguinte, sem lhes tocar na posição. */
  onBallHeightChanged: () => {
    try {
      /* ⚠ ORDEM: primeiro a bola aplica (e CLAMPA) a cota nova e publica-a em
         `CONFIG.ballYEffective`; só depois o mikado regenera, porque a clareira lê esse valor. Ao
         contrário, o mikado usava a cota do frame anterior — medido: knob a 4,2 m dava clareira a
         1,31 em vez de 1,50 (barras demasiado perto da bola). */
      if (ball && ball.applyHeight) ball.applyHeight();
      if (mikado && mikado.rebuild) mikado.rebuild();
      if (ball && ball.refreshProbe) ball.refreshProbe();
    } catch (e) { console.error('onBallHeightChanged:', e); }
  },
  /* ---- F13 §3: DIÂMETRO da bola (2,0-3,0 m) ----
     A MESMA cadeia da altura, e a ORDEM é a mesma armadilha (F12, armadilha nº1): quem lê o raio
     tem de o ler já publicado e já clampado.
       1. `ball.applyHeight()` — escala a bola (`root.scaling`), publica `CONFIG.ballR`, RE-CLAMPA a
          cota (com Ø 3 m a bola já não cabe onde cabia a Ø 2 m) e republica `ballYEffective`;
          reconstrói a corrente, que nasce no topo da bola e portanto mudou de comprimento.
       2. `mikado.rebuild()` — a clareira é `raio + margem`: com o raio novo, o buraco muda.
       3. `ball.refreshProbe()` — a bola mudou de tamanho, o que ela espelha vem de outra distância.
     A câmara e a auréola tratam-se sozinhas por frame (`camWorldDistance`/`updateHalo`), e a
     POSIÇÃO dos corpos dos focos NÃO se mexe (regra 3 do handoff S10) — só a abertura do cone,
     que `updateSpotLights` recalcula no frame seguinte. */
  onBallDiameterChanged: () => {
    try {
      if (ball && ball.applyHeight) ball.applyHeight();
      if (mikado && mikado.rebuild) mikado.rebuild();
      if (ball && ball.refreshProbe) ball.refreshProbe();
      // a câmara mantém o enquadramento: distância e limites de zoom seguem o raio novo
      camera.radius = camWorldDistance();
      camera.lowerRadiusLimit = 2.5 * ballRadius();
      camera.upperRadiusLimit = 20 * ballRadius();
      camera.fov = computeFov();
      rebuildSpotLights();   // reabre os cones das SpotLight com o raio novo da mancha
    } catch (e) { console.error('onBallDiameterChanged:', e); }
  },
  /* F13 §4: NO-OP VISUAL, DE PROPÓSITO. As dimensões da sala (vão/passo dos pilares, lado do pilar,
     pé-direito, corte dos chapéus) continuam a só se aplicar num RELOAD — a geometria da
     sala/pilares/chapéus constrói-se uma vez no arranque (ver config.js) e o `preApplyReloadKnobs()`
     é quem a aplica na volta seguinte. O que mudou é que isso JÁ NÃO SE ANUNCIA: o David pediu
     "avisos NENHUNS" (F13 §4) depois de o banner ter reaparecido pós-F12.

     ⚠ Este hook NÃO pode voltar a escrever no DOM. Se algum dia for preciso um sinal de "isto só
     entra no reload", tem de ser dentro do painel (p. ex. o próprio slider a marcar-se ⟳), nunca
     uma faixa por cima da cena. O `#err` é exclusivo de `moduleFail()`.
     Fica só o diagnóstico por consola, que não é visível na cena. */
  onRoomDimChanged: () => {
    if (!panelReady) return;
    if (window.MB2_DEBUG_ROOMDIM && roomGeomDiffers()) {
      console.log('[MB2] geometria ⟳ difere da construída (só entra no reload).');
    }
  },
});
panelReady = true;
// bónus (§7 do brief F4): sliders re-lêem CONFIG quando escrito pela consola — `MB2.refreshPanel()`.
function refreshPanel() { if (panelApi && panelApi.refresh) panelApi.refresh(); }

/* ---------------- skin dark/white (Fase 4) ----------------
   Regra 1 (CLAUDE.md): NENHUM motor toca na skin — só tecla `w` / botão. `CONFIG.skin` ∈
   dark|white (sem 'auto' nesta fase — sem motor de música ainda, ver Fase 5). Crossfade
   `skinMix → target` com `1 − exp(−skinEase·dt)` (index-v2.html:331-333); `dk = 1 − skinMix`
   entra em halo/grão/vinheta/incidentAlpha. Fundo interpola bgGrey → rgb(243,247,249). */
// 'auto' (CONFIG.skin default) precisa do motor de música/emoções (Fase 5, ainda não existe aqui) —
// nesta fase trata-se como 'dark' (o mesmo fallback do `bgGrey` estático da Fase 1).
let skinMix = CONFIG.skin === 'white' ? 1 : 0;
function skinTargetVal() { return CONFIG.skin === 'white' ? 1 : 0; }
function updateSkin(dt) {
  const target = skinTargetVal();
  const ease = Math.max(0, num(CONFIG.skinEase, 7));
  skinMix += (target - skinMix) * (1 - Math.exp(-ease * dt));
  if (Math.abs(skinMix - target) < 0.0005) skinMix = target;
  return skinMix;
}

/* ---------------- pós-processo: DefaultRenderingPipeline (Fase 4) ----------------
   bloom (fonte = tiles quase brancos, bloomThreshold alto ~ gl>0.35), grão (reposicionado <3 Hz,
   nunca animado), vinheta — todos multiplicados por `dk` (só pesam em dark, index-v2.html §1.11).
   Tone-mapping como KNOB (pendente do handoff S7: centro saturado ao olhar de frente com vários
   feixes a somar) — ACES + exposição, para o David poder desligar/afinar sem recompilar. */
const pipe = new BABYLON.DefaultRenderingPipeline('mb2Pipe', true, scene, [camera]);
pipe.bloomEnabled = true;
pipe.bloomThreshold = num(CONFIG.bloomThreshold, 0.8);
pipe.bloomWeight = num(CONFIG.bloomStrength, 0.75);
pipe.bloomKernel = Math.max(1, num(CONFIG.bloomBlurPx, 9) * 2);
pipe.bloomScale = 0.5; // meia resolução — como a bola (:666)
pipe.grainEnabled = true;
pipe.grain.animated = false; // < 3 Hz (regra 6): reposiciona-se a semente a cada 400 ms, não por frame
pipe.imageProcessing.vignetteEnabled = true;
pipe.imageProcessing.vignetteWeight = 0; // escrito por frame (× dk)
pipe.imageProcessing.toneMappingEnabled = CONFIG.postTonemap !== 0;
pipe.imageProcessing.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
pipe.imageProcessing.exposure = num(CONFIG.postExposure, 1);

// grão: alpha calibrado a olho para parecer o pattern 256² da Canvas 2D (:691) — knob `grão` já
// controla a intensidade "crua"; K é só o fator de escala entre as duas implementações.
const GRAIN_K = 6;
function updatePostFx(dk) {
  pipe.bloomThreshold = clamp01(num(CONFIG.bloomThreshold, 0.8));
  pipe.bloomWeight = Math.max(0, num(CONFIG.bloomStrength, 0.75));
  pipe.bloomKernel = Math.max(1, num(CONFIG.bloomBlurPx, 9) * 2);
  pipe.grain.intensity = Math.max(0, num(CONFIG.grain, 0.032)) * dk * GRAIN_K;
  // `grain.animated = false` (regra 6: nada > 3 Hz) — a API pública do Babylon não expõe reseed do
  // ruído do GrainPostProcess sem tocar em internos não documentados; ficou como divergência
  // documentada em PARITY §1.11 (grão estático em vez de reposicionado a cada 400 ms).
  pipe.imageProcessing.vignetteWeight = Math.max(0, num(CONFIG.vignette, 0.55)) * dk * 15; // calibrado a olho (ver PARITY §1.11)
  pipe.imageProcessing.toneMappingEnabled = num(CONFIG.postTonemap, 1) >= 0.5;
  pipe.imageProcessing.exposure = Math.max(0.05, num(CONFIG.postExposure, 1));
  // skin white (item 6 do brief F4): aproximação do filtro `#tone` (LUT SVG de 33 valores,
  // index-v2.html:53-58, que crava as sombras a ~8% e levanta o meio-tom) via
  // `imageProcessing.contrast` — sobe com skinMix (1 − dk). Divergência documentada em PARITY §1.15:
  // não é a LUT exata (3 tabelas de 33 valores), é uma aproximação de contraste/exposição.
  pipe.imageProcessing.contrast = 1 + 0.6 * (1 - dk);
}
function applyBgGreySkin() {
  // chamada a cada frame (depois de updateSkin): sobrepõe o applyBgGrey estático (Fase 1) com o
  // crossfade dark→white — bgGrey (dark) → rgb(243,247,249) (white), index-v2.html:700.
  const g = clamp01(num(CONFIG.bgGrey, 7) / 255);
  const wr = 243 / 255, wg = 247 / 255, wb = 249 / 255;
  const r = g + (wr - g) * skinMix, gr = g + (wg - g) * skinMix, b = g + (wb - g) * skinMix;
  scene.clearColor = new BABYLON.Color4(r, gr, b, 1);
}
const skinBtn = document.getElementById('skin');
function syncSkinBtn() { if (skinBtn) skinBtn.textContent = 'skin: ' + (CONFIG.skin === 'white' ? 'white' : 'dark'); }
function setSkin(mode) {
  if (mode !== 'dark' && mode !== 'white') return;
  CONFIG.skin = mode;
  syncSkinBtn();
  // S8: a skin é escolha do utilizador (Regra 1) — sobrevive ao reload (localStorage['mb2.toggles']).
  if (panelApi && panelApi.persistToggles) panelApi.persistToggles();
}
addEventListener('keydown', (e) => {
  if (e.key === 'w' || e.key === 'W') setSkin(CONFIG.skin === 'white' ? 'dark' : 'white');
});
if (skinBtn) { skinBtn.onclick = () => setSkin(CONFIG.skin === 'white' ? 'dark' : 'white'); syncSkinBtn(); }
// S8: "carregar ficheiro" pode trazer a skin — o painel dispara isto (não é o motor a mexer: Regra 1
// mantém-se, é o utilizador a repor um ficheiro que ele próprio gravou).
addEventListener('mb2-skin-restore', (ev) => { const s = ev.detail && ev.detail.skin; if (s === 'dark' || s === 'white') { CONFIG.skin = s; syncSkinBtn(); } });

/* ================================================================================================
   ---- F5 choreo/API ----                                                          (bloco do OPUS)
   Coreografia (choreo.js), health/PRESETS→effective(), estrobo de FUNDO e `window.MIRRORBALL`.
   O bloco `// ---- F5 music ----` (Sonnet) vem depois e não toca em nada daqui.
   ================================================================================================ */

import { createChoreo } from './choreo.js';
import { createExplode } from './explode.js';   // F7 (bloco `// ---- F7 explode ----`)
const choreo = createChoreo(CONFIG);
const reducedMotion = choreo.reducedMotion;

/* ---- health: PRESETS ALIVE/DEAD + effective() — index-v2.html:187-190, :301-310 ----
   `E` deixa de ser fixo: `spotGain/rotationRpm/sphereOpacity/haze` interpolam ALIVE→DEAD por
   `t = 1 − health`. ALIVE lê o CONFIG a cada chamada (o painel `d` escreve lá), DEAD é fixo.
   `reducedMotion` → rpm ×0.03 (a bola quase pára; a coreografia congela no choreo.js). */
const PRESETS = {
  ALIVE: { spotGain: 1.0, rotationRpm: CONFIG.rotationRpm, sphereOpacity: CONFIG.sphereOpacity, haze: CONFIG.haze },
  DEAD: { spotGain: 0.22, rotationRpm: 0.12, sphereOpacity: 0.35, haze: 0.25 },
};
let health = 1.0;
function lerp(a, b, t) { return a + (b - a) * t; }
function effective(out) {
  const A = PRESETS.ALIVE, D = PRESETS.DEAD, t = 1 - health;
  A.rotationRpm = num(CONFIG.rotationRpm, 1);
  A.sphereOpacity = num(CONFIG.sphereOpacity, 1);
  A.haze = num(CONFIG.haze, 0.65);
  out.spotGain = lerp(A.spotGain, D.spotGain, t);
  out.rotationRpm = clamp(lerp(A.rotationRpm, D.rotationRpm, t) * (reducedMotion ? 0.03 : 1), 0, 3); // teto 3 rpm
  /* ---- F13 §2: o OVERRIDE MANUAL DA OPACIDADE tem de ser TOTAL ----
     O bug do David ("não consigo tirar o controlo da opacidade ao motor, e quando consigo não
     consigo pôr a bola TODA opaca") tinha DOIS donos a escrever no mesmo sítio, e desligar um só
     não chegava:
       1. `music.js:2108` escreve `C.sphereOpacity` — esse JÁ respeitava `opacityMotor` (o
          disjuntor do painel), por isso era o único que se via na leitura do código;
       2. **este `lerp` para o preset DEAD (0,35)** — que não respeitava disjuntor NENHUM. E o
          `music.js` escreve `MB.setHealth(state.health)` por frame, e `state.health` cai a 0 em
          silêncio (que é o caso do gerador sintético e de qualquer pausa na música). Resultado
          medido: com `opacidade: motor manda = 0` e o slider a 1,00, a bola vivia a 0,35 e não
          havia gesto no painel que a pusesse opaca. É o bug clássico deste repo — dois donos, o
          último a escrever ganha — na sua forma mais escondida, porque o segundo dono nem parece
          estar a falar de opacidade.
     Regra fixada: com o disjuntor a 0, `CONFIG.sphereOpacity` (o slider) é a saída, LITERAL. Nem
     health, nem estrelato, nem gestos. A 1,00 a bola fica completamente opaca.
     `rotationRpm`/`haze`/`spotGain` NÃO mudam — o health continua a ser o que era para eles (a
     regra 2 do CLAUDE.md, "a bola nunca pára", vive nesse caminho e fica intacta). */
  out.sphereOpacity = CONFIG.opacityMotor === false
    ? clamp01(A.sphereOpacity)
    : clamp01(lerp(A.sphereOpacity, D.sphereOpacity, t));
  out.haze = clamp(lerp(A.haze, D.haze, t), 0, 1);
  return out;
}
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

/* ---- estrobo de FUNDO: a SALA atrás pisca, não a bola (index-v2.html:399-403) ----
   No Canvas 2D é um `fillRect` branco por cima do fundo, alpha = `level·(1 − age/lenMs)`. Aqui a
   sala é geometria: multiplica-se temporariamente o `emissiveColor` do material dos 5 planos
   (`room.material`) — a sala acende, a bola não emite luz (regra 6). Em white lê-se como um
   escurecer, porque o tonemap/contraste do pipeline comprime o topo (mesmo efeito do original).
   INVARIANTE: `minGapMs` (default 340 ms ≈ 2.9 Hz) é verificado aqui, não no motor — nada > 3 Hz. */
const MIN_GAP_FLOOR_MS = 334; // 3 Hz é o teto absoluto (regra 6): nem um knob o pode baixar
let strobeT0 = -1e9, strobeLevel = 0;
/* ⚠ PERF (medido): ATRIBUIR `room.material.emissiveColor = new Color3(...)` por frame custou
   **+73 ms** por render — o setter do PBRMaterial marca o material dirty e força a revalidação/
   recompilação dos shaders dos 5 planos a cada frame. A correção é mutar a cor EXISTENTE
   (`.set(r,g,b)`, sem setter de propriedade) e só tocar nela quando o valor muda de facto.
   Depois disto o estrobo custa o mesmo que não o ter (ver §1.13 do PARITY). */
const roomEmissive = room.material.emissiveColor
  ? room.material.emissiveColor.clone() : new BABYLON.Color3(0, 0, 0);
const roomEmissiveLive = room.material.emissiveColor || (room.material.emissiveColor = new BABYLON.Color3(0, 0, 0));
let strobeA = 0;
function updateStrobe(nowMs) {
  const ST = CONFIG.strobe;
  const lenMs = Math.max(1, num(ST && ST.lenMs, 55));
  const age = nowMs - strobeT0;
  let a = 0;
  if (ST && age >= 0 && age < lenMs) a = clamp01(strobeLevel * (1 - age / lenMs));
  if (a === strobeA) return a;             // sem mudança → não se toca no material
  strobeA = a;
  // a sala acende para branco proporcionalmente ao alpha (o `a` do fillRect do original)
  roomEmissiveLive.set(
    roomEmissive.r + (1 - roomEmissive.r) * a,
    roomEmissive.g + (1 - roomEmissive.g) * a,
    roomEmissive.b + (1 - roomEmissive.b) * a);
  return a;
}
function fireStrobe(opts) {
  const ST = CONFIG.strobe, o = opts || {};
  if (!ST || !ST.enabled || reducedMotion) return false;
  const gap = Math.max(MIN_GAP_FLOOR_MS, num(ST.minGapMs, 340));
  const t = performance.now();
  if (t - strobeT0 < gap) return false;
  strobeT0 = t;
  strobeLevel = clamp01(num(o.level, num(ST.level, 0.55)));
  return true;
}

/* ---- disjuntores (CONFIG.beamsMotor / spotsMotor / opacityMotor) ----
   Guarda do lado da BOLA (o `music.js` também os lê — a redundância é intencional, brief F5):
   com o disjuntor a `false` o slider do painel manda e o motor é ignorado. Só as chamadas que se
   identificam como vindas do motor (`{fromMotor:true}`) são filtradas; a consola do David passa. */
function motorAllowed(kind, opts) {
  const fromMotor = !!(opts && opts.fromMotor);
  if (!fromMotor) return true;
  if (kind === 'spots') return CONFIG.spotsMotor !== false;
  if (kind === 'beams') return CONFIG.beamsMotor !== false;
  if (kind === 'opacity') return CONFIG.opacityMotor !== false;
  return true;
}

/* ---- `window.MIRRORBALL` — assinatura completa de index-v2.html:723-770 ----
   Tudo menos explode/rewind/getExplode/setExplodeEnabled, que ficam STUBS para a F7.
   Regra 7 (sem NaN): tudo o que vem do motor passa por `num(v, d)` + clamp. Tetos invioláveis
   aplicados AQUI (não só no motor): beamIntensity ≤ 0.18, rotationRpm ≤ 3, haze ≤ 1. */
// `skinAuto` = alvo contínuo do modo 'auto' (index-v2.html:247 arranca a 0 — `skinAutoValence` é o
// MULTIPLICADOR da valência, não o valor inicial). Nesta fase só se GUARDA (não há modo 'auto' no
// crossfade da F4, que trata 'auto' como 'dark') — a Regra 1 mantém-se: nenhum motor muda a skin.
let skinAuto = 0;
/* ================================================================================================
   ---- F7 explode ----                                                             (bloco do OPUS)
   Explosão em estilhaços. A MÁQUINA DE ESTADOS está em `v2/explode.js` (fases, easings, `maxHold`,
   reentrada); a GEOMETRIA está em `ball.js` (posições/normais dos 4 vértices por tile). Aqui só:
     - instanciar `createExplode(CONFIG)` e chamar `exp.step(dt)` uma vez por frame;
     - publicar `E.exS` / `E.exFloat` / `E.angle0` (o `ball.js` e o `incident.js` leem daí);
     - halo ×(1−0.75·exS) (:407) e cone incidente ×(1−0.8·exS) (:517);
     - teclas `x` / `X` (:896-898) e o botão `#xpl` (id combinado com o Sonnet em `f67-sync.md`).
   Persistência: `localStorage['mb2.explode']` (o spike v2 usa o prefixo `mb2.`; a bola Canvas 2D
   usa `mb.explode`).                                                                            */
const exp = createExplode(CONFIG);

/* F12 §6: default OFF. A migração pontual já correu no topo do módulo (`migrateExplodeDefault`) —
   aqui só se LÊ, e a leitura é `=== 'on'`: sem valor gravado, a explosão está desligada. */
let explodeEnabled = (() => {
  try { return localStorage.getItem(XPL_KEY) === 'on'; } catch (e) { return false; }
})();
exp.setEnabled(explodeEnabled);

const xplBtn = document.getElementById('xpl');
function syncXplBtn() { if (xplBtn) xplBtn.textContent = 'explosões: ' + (explodeEnabled ? 'on' : 'off'); }
function setExplodeEnabled(v) {
  explodeEnabled = !!v;
  exp.setEnabled(explodeEnabled);
  try { localStorage.setItem(XPL_KEY, explodeEnabled ? 'on' : 'off'); } catch (e) { /* sem storage */ }
  syncXplBtn();
}
if (xplBtn) { xplBtn.onclick = () => setExplodeEnabled(!explodeEnabled); }
// o botão do Sonnet (F6) despacha este evento; se ele correr primeiro, apanhamos o toggle na mesma
addEventListener('mb2-xpl-toggle', (e) => {
  const on = e && e.detail && typeof e.detail.on === 'boolean' ? e.detail.on : !explodeEnabled;
  if (on !== explodeEnabled) setExplodeEnabled(on);
});
syncXplBtn();

// teclas (index-v2.html:896-898). `x` = ciclo completo (estoiro → deriva → pausa → rewind);
// `X` (shift) = estoiro e FICA no ar; 2.º `X` chama o rewind. Sem preventDefault — as outras
// teclas (m/p/g/n/d/w) continuam a funcionar noutros handlers.
addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (e.key === 'x') window.MIRRORBALL.explode();
  else if (e.key === 'X') {
    const ex = exp.get();
    if (ex.phase === 'idle' || ex.phase === 'back') window.MIRRORBALL.explode({ autoHold: false });
    else window.MIRRORBALL.rewind();
  }
});
/* ============================== fim do bloco F7 explode (parte 1/2) ============================= */

/* Escritas do motor no CONFIG passam por aqui: clamp + disjuntor. O `music.js` escreve direto em
   `MIRRORBALL.config` (:2082-2090), por isso a guarda real é uma sanitização por frame — ver
   `sanitizeConfig()`, chamada no início de cada frame. */
// [min, max, fallback-se-NaN]. Regra 7 (CLAUDE.md): um NaN vindo do motor apagou os feixes uma vez
// — nenhum knob que o motor escreve pode ficar sem valor válido.
const CFG_LIMITS = {
  rotationRpm: [0, 3, 1], haze: [0, 1, 0.65], beamIntensity: [0, 0.18, 0.16],
  beamFraction: [0, 1, 1], sphereOpacity: [0, 1, 1], beamMaxCount: [0, 4000, 110],
  spotCount: [0, CONFIG.spots.length, 2], hazeMax: [0, 1, 1], beamFractionMax: [0, 1, 1],
};
function sanitizeConfig() {
  for (const k in CFG_LIMITS) {
    const lim = CFG_LIMITS[k];
    const v = CONFIG[k];
    if (!Number.isFinite(v)) { CONFIG[k] = lim[2]; continue; }
    if (v < lim[0]) CONFIG[k] = lim[0]; else if (v > lim[1]) CONFIG[k] = lim[1];
  }
}

window.MIRRORBALL = {
  setHealth(h) { health = clamp01(num(+h, 0)); refreshPanel(); },
  getHealth() { return health; },
  config: CONFIG,
  /* knobs do painel `d` (persistidos em localStorage['mb2.knobs']).
     ⚠ prioridade `localStorage > ficheiro > defaults` (index-v2.html:730): o `set` só preenche os
     knobs que o David NUNCA tocou — o que ele mexeu por último ganha ao ficheiro. */
  knobs: {
    get: () => (panelApi && panelApi.knobsGet ? panelApi.knobsGet() : {}),
    set: (o) => {
      if (!panelApi || !panelApi.knobsSet) return 0;
      const obj = o || {};
      if (panelApi.setKnobFile) panelApi.setKnobFile(obj);   // snapshot p/ 'repor ficheiro gravado'
      const cur = panelApi.knobsGet ? panelApi.knobsGet() : {};
      // S8: "tocado" deixou de ser "está no mb2.knobs?" (agora grava-se TUDO) e passou a ser a lista
      // explícita `mb2.knobsTouched` — só assim o music-config.json continua a preencher os knobs
      // que o David nunca mexeu, sem apagar os que ele afinou.
      const touched = new Set(panelApi.knobsTouched ? panelApi.knobsTouched() : []);
      const fill = {};
      for (const k in obj) if (!touched.has(k) && Number.isFinite(obj[k]) && k in cur) fill[k] = obj[k];
      return panelApi.knobsSet(fill, false);
    },
  },
  setSpot(i, partial) {
    if (!motorAllowed('spots', partial)) return;
    const s = CONFIG.spots[i]; if (!s) return;
    const p = partial || {};
    if (Number.isFinite(p.intensity)) s.intensity = clamp(p.intensity, 0, 4);
    if (Number.isFinite(p.radius)) s.radius = clamp(p.radius, 0.01, 3);
    if (Number.isFinite(p.az)) s.az = p.az;
    if (Number.isFinite(p.el)) s.el = p.el;
    if (Array.isArray(p.aim) && p.aim.length >= 2) s.aim = [num(p.aim[0], 0), num(p.aim[1], 0)];
    if (typeof p.on === 'boolean') s.on = p.on;
    if (Number.isFinite(p.hue)) s.hue = p.hue;
    if (Number.isFinite(p.period)) s.period = Math.max(0.1, p.period);
  },
  // flash curto num sítio novo (motor: bombo/tarola). opts: {intensity, radius, len, az, el, aim}
  flash(opts) { if (!motorAllowed('spots', opts)) return; choreo.flash(opts); },
  // re-aponta um spot já (o técnico muda o pinspot de sítio); sem pose → aleatória
  retarget(i, pose) { if (!motorAllowed('spots', pose)) return; choreo.retarget(i, pose); },
  setChoreo(on) { choreo.setEnabled(on); },
  // estrobo de FUNDO (sala atrás). Só dispara se CONFIG.strobe.enabled e respeita minGapMs (≤ 3 Hz).
  strobe(opts) { if (!motorAllowed('spots', opts)) return false; return fireStrobe(opts); },
  strobeEnabled() { return !!(CONFIG.strobe && CONFIG.strobe.enabled); },
  setSkin(mode) { setSkin(mode); },                       // Regra 1: só o David; o motor não chama isto
  setSkinAuto(v) { skinAuto = clamp01(num(+v, 0)); },     // só guarda o valor (sem modo 'auto' nesta fase)
  getSkin() { return { mode: CONFIG.skin, mix: skinMix, target: skinTargetVal(), auto: skinAuto }; },

  /* ---- Fase 7 (explosão em estilhaços) — implementação real no bloco `// ---- F7 explode ----`.
     Aqui só a delegação, para a assinatura pública (index-v2.html:753-770) viver toda no mesmo
     objeto. `exp` é criado mais acima (hoisting do `const` não serve: estas funções só correm
     depois do módulo carregar, por isso a referência tardia é segura). ---- */
  explode(opts) { exp.explode(opts, ball ? ball.angle : 0); },
  rewind() { exp.rewind(); },
  getExplode() { return exp.get(); },
  setExplodeEnabled(v) { setExplodeEnabled(v); },
};

// o `music.js` lê `window.MIRRORBALL` no momento em que é carregado (`web/music.js:2077`) — o bloco
// `// ---- F5 music ----` do Sonnet só o carrega depois disto.
window.__MB2_READY = true;
window.dispatchEvent(new Event('mb2-ready'));

/* ================================ fim do bloco F5 choreo/API ==================================== */

/* ---------------- loop, tempo, HUD ----------------
   getDeltaTime() mente com o tab em segundo plano (docs/babylon-reference.md §9) — mede-se o
   custo REAL de scene.render() via onBeforeRenderObservable/onAfterRenderObservable. */
const samples = [];
let renderT0 = 0;
let tSec = 0;
let lastFrame = performance.now();
scene.onBeforeRenderObservable.add(() => { renderT0 = performance.now(); });
scene.onAfterRenderObservable.add(() => {
  samples.push(performance.now() - renderT0);
  if (samples.length > 60) samples.shift();
});

/* ---------------- degradação adaptativa dos pontos na parede (§6) ----------------
   `frameEma = frameEma·0.9 + dt·0.1` sobre o custo REAL de scene.render() (o que `medianRenderMs()`
   já mede, via onAfterRenderObservable — não getDeltaTime). `> perf.targetMs` → dotDensityLive
   ×0.97 (piso perf.minDotDensity); senão recupera ×1.005 até CONFIG.dotDensity. Só os pontos na
   parede degradam — feixes/facetas/glint/bloom não têm degradação automática (regra do plano). */
let frameEma = 16, dotDensityLive = num(CONFIG.dotDensity, 0.8);

/* `E` = estado efetivo do frame. Desde a F5 é `effective()` que o preenche (health ALIVE→DEAD),
   mais `choreoGain[]`/`flashes` da coreografia — o `ball.js` consome ambos. */
/* F7: `exS`/`exFloat`/`angle0` entram no `E` com valor inicial FINITO (regra 7 — um NaN aqui
   multiplicava a geometria toda por NaN e apagava a bola). Em idle `exS` é 0 e o `ball.js` nem
   entra no caminho da explosão. */
const E = { spotGain: 1, rotationRpm: CONFIG.rotationRpm, sphereOpacity: CONFIG.sphereOpacity, haze: CONFIG.haze, skinMix: 0,
  choreoGain: [], flashes: choreo.flashes, exS: 0, exFloat: 0, angle0: 0 };
let hatsProbeRefreshed = false; // F8: força um refresh extra do probe assim que os chapéus se posicionam (ver hats.update abaixo)
scene.registerBeforeRender(() => {
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  tSec += dt;

  // ---- F5: sanitiza o que o motor escreveu no CONFIG (tetos invioláveis) e resolve o health ----
  sanitizeConfig();
  effective(E);                       // escreve spotGain/rotationRpm/sphereOpacity/haze
  choreo.step(dt);                    // gains por spot + flashes Poisson (congela em reducedMotion)
  E.choreoGain.length = CONFIG.spots.length;
  for (let i = 0; i < E.choreoGain.length; i++) E.choreoGain[i] = choreo.gainOf(i);
  E.flashes = choreo.flashes;

  // ---- F7 explode (parte 2/2): avança a máquina e publica o escalar do frame ----
  // Tem de correr ANTES de `ball.update` (o ball lê `E.exS` para reescrever a geometria) e antes
  // do halo/incidente. `exp.step` clampa o dt a 50 ms internamente.
  exp.step(dt);
  E.exS = exp.s; E.exFloat = exp.floatT; E.angle0 = exp.angle0;
  if (!Number.isFinite(E.exS)) E.exS = 0;                 // regra 7: rede final
  if (!Number.isFinite(E.exFloat)) E.exFloat = 0;
  if (!Number.isFinite(E.angle0)) E.angle0 = 0;

  updateStrobe(now);                  // estrobo de fundo: a sala pisca (emissive do room.material)

  // skin dark/white primeiro (Regra 1: só tecla/botão mexem em CONFIG.skin; isto só lê e faz o crossfade)
  const sk = updateSkin(dt);
  E.skinMix = sk;
  const dk = 1 - sk;
  applyBgGreySkin();

  // degradação adaptativa: usa a mediana das últimas amostras de render (já calculada abaixo);
  // frameEma segue o dt em ms para reagir ao vivo, como no original (index-v2.html:326-329)
  const dtMs = dt * 1000;
  frameEma = frameEma * 0.9 + dtMs * 0.1;
  const perf = CONFIG.perf || { targetMs: 17.5, minDotDensity: 0.12 };
  const targetMs = num(perf.targetMs, 17.5), minDotDensity = num(perf.minDotDensity, 0.12);
  const dotDensityTarget = Math.max(0, num(CONFIG.dotDensity, 0.8));
  if (frameEma > targetMs) dotDensityLive = Math.max(minDotDensity, dotDensityLive * 0.97);
  else if (dotDensityLive < dotDensityTarget) dotDensityLive = Math.min(dotDensityTarget, dotDensityLive * 1.005);
  if (ball) ball.dotDensityLive = dotDensityLive;

  /* F11 (knob 'bola (0/1)'): com a bola desmontada NÃO basta esconder a esfera — tudo o que dela
     DERIVA (feixes refletidos, cone incidente, pontos na parede, lente dos corpos, auréola) tem de
     se calar, senão ficavam feixes a sair do nada no meio da sala. Em vez de gatilhos espalhados
     por 5 módulos, zera-se `E.spotGain` ANTES do `ball.update`: os focos montados saem todos com
     I=0 e cada módulo já sabe apagar-se com entrada vazia (beams/dots/incident fazem
     `setEnabled(false)` + `thinInstanceCount = 0` — armadilha S9 nº1 já tratada por eles).
     `applyBallVisibility()` (chamada mais abaixo, depois dos updates) esconde as meshes da bola. */
  const ballMounted = CONFIG.ballOn !== false;
  if (!ballMounted) E.spotGain = 0;

  /* ---- F12 §5: ESTRELATO ----
     Corre ANTES do `ball.update` porque publica `CONFIG.stardom.gain`, que a bola (via `E.spotGain`,
     já a seguir), o mikado, os chapéus e o wash leem no MESMO frame. Se corresse depois, cada peça
     reagia ao estrelato do frame anterior — um frame de atraso não se vê, mas a ordem explícita
     evita a próxima pessoa a pensar que é indiferente. */
  if (stardom && stardom.update) {
    try { stardom.update(tSec, dt); }
    catch (e) { console.error('stardom.update:', e); }
  }
  /* O peso da BOLA no estrelato entra pelo MESMO canal que o `bola (0/1)` já usava: `E.spotGain`.
     Não é um mute (a bola nunca pára nem apaga — regra 2 do CLAUDE.md): com o mikado ou os chapéus
     como estrela a bola desce para ~0,45-0,55 do seu peso e passa a fundo, que é o que um técnico
     faz quando quer que se olhe para outro lado. Com a bola desmontada, `E.spotGain` já é 0 acima
     e a multiplicação mantém-no lá. */
  if (stardom && CONFIG.stardom && CONFIG.stardom.on !== false) {
    const gb = clamp(num(CONFIG.stardom.gain && CONFIG.stardom.gain.ball, 1), 0, 2);
    E.spotGain = num(E.spotGain, 1) * gb;
  }

  // ball.update primeiro: monta mountedSpots/ambientPoses deste frame (fonte única de verdade),
  // as SpotLight/RectAreaLight lêem-nos a seguir, no MESMO frame.
  if (ball && ball.update) {
    try { ball.update(tSec, CONFIG.spots, E); }
    catch (e) { console.error('ball.update:', e); }
  }
  updateSpotLights();
  updateAmbientLights(tSec);
  // feixes/cone incidente/pontos depois das SpotLight: leem ball.mountedSpots (montado em
  // ball.update acima), fonte única de verdade para posição/intensidade dos focos deste frame.
  if (beams && beams.update) {
    try { beams.update(E); }
    catch (e) { console.error('beams.update:', e); }
  }
  if (incident && incident.update) {
    try { incident.update(ball && ball.mountedSpots, E, camera, ballCenterY()); }   // F12 §3: cota da bola
    catch (e) { console.error('incident.update:', e); }
  }
  if (dots && dots.update) {
    try { dots.update(E); }
    catch (e) { console.error('dots.update:', e); }
  }
  if (fixtures && fixtures.update) {
    try { fixtures.update(ball && ball.mountedSpots, E); }
    catch (e) { console.error('fixtures.update:', e); }
  }
  if (hats && hats.update) {
    try { hats.update(tSec, dt); }
    catch (e) { console.error('hats.update:', e); }
  }
  if (robots && robots.update) {
    try { robots.update(); }
    catch (e) { console.error('robots.update:', e); }
  }
  if (mikado && mikado.update) {
    try { mikado.update(tSec, dt); }
    catch (e) { console.error('mikado.update:', e); }
  }
  updateWashStar();   // F12 §5: a sala recolhe quando os chapéus são a estrela (spec §5b)
  applyBallVisibility();   // F11: knob 'bola (0/1)' — só o David tira a bola da sala
  /* F12 §3: a câmara aponta ao CENTRO da bola. Sem isto, subir a bola tirava-a do enquadramento (o
     alvo da ArcRotateCamera ficava na origem) e o David via a bola a fugir para fora do ecrã em vez
     de a ver subir. O `target` é o único que se mexe — o ângulo/raio de órbita são dele. */
  {
    const by = ballCenterY();
    // ⚠ escreve-se `target.y` DIRETO, não `setTarget()`: em ArcRotateCamera o `setTarget` recalcula
    // alpha/beta/radius a partir da posição atual e dava um salto de órbita a cada mudança de cota.
    if (camera.target.y !== by) camera.target.y = by;
  }
  excludeBallFromRoomLights(); // F8 (regra "nenhum foco inferior" + robots) — idempotente, ver acima
  // F8: chapéus e robots só ficam posicionados/ativados DEPOIS do 1º update() acima (attachProbe
  // correu antes disso, com os meshes ainda em posição/estado por omissão) — força mais UM refresh
  // do probe assim que souberem onde estão, para a bola os espelhar na posição certa desde já.
  if (!hatsProbeRefreshed && (hats || robots)) {
    hatsProbeRefreshed = true;
    if (ball && ball.refreshProbe) ball.refreshProbe();
  }
  updateHalo(E);
  updatePostFx(dk);
});

function medianRenderMs() {
  if (!samples.length) return 0;
  const s = samples.slice().sort((a, b) => a - b);
  return s[s.length >> 1];
}

// ball.dots = { count, X, N, R, I, size } (F4) — HUD 'dots N · dens X.XX'; 0 se dots.js/ball.dots
// ainda não existem.
function dotCount() {
  const d = ball && ball.dots;
  return (d && Number.isFinite(d.count)) ? d.count : 0;
}

let lastHud = performance.now();
scene.registerAfterRender(() => {
  const now = performance.now();
  if (now - lastHud < 500) return;
  lastHud = now;
  const med = medianRenderMs();
  hud.textContent =
    `MirrorBall v2 (spike Babylon)  ·  ${engine.isWebGPU ? 'WebGPU' : 'WebGL2'}\n` +
    `render ${med.toFixed(2)} ms  (teto ${med > 0 ? (1000 / med).toFixed(0) : '—'} fps)\n` +
    `facetas ${tileCount()}  ·  filas ${CONFIG.facetRows}\n` +
    `spots ${activeSpotCount}/${CONFIG.spotCount}  ·  ambient ${activeAmbientCount}/${CONFIG.ambient.n}  ·  feixes ${beamCount()}\n` +
    `dots ${dotCount()}  ·  dens ${dotDensityLive.toFixed(2)}  ·  skin ${CONFIG.skin}\n` +
    `health ${health.toFixed(2)}  ·  rpm ${E.rotationRpm.toFixed(2)}  ·  flashes ${activeFlashCount}/${choreo.flashes.length}` +
    `  ·  estrobo ${CONFIG.strobe && CONFIG.strobe.enabled ? 'on' : 'off'}\n` +
    // F11: barras montadas + bloco aceso (−1 = todas) — o David vê logo se o mikado está a reagir
    // F12: barras + área do miolo (a contagem deriva da densidade) e a cota da bola
    `mikado ${mikado ? (CONFIG.mikado.on === false ? 'off'
      : `${mikado.barCount} barras (${(mikado.areaM2 || 0).toFixed(0)} m²)`) : '—'}` +
    `  ·  bola ${CONFIG.ballOn === false ? 'off' : num(CONFIG.ballHeightM, 3.5).toFixed(2) + ' m'}\n` +
    // F12 §5: estrela corrente + o gesto que os chapéus usam quando lhes toca
    `estrela ${stardom ? (CONFIG.stardom.on === false ? 'off'
      : `${stardom.star} (${stardom.changes} trocas${stardom.star === 'hats'
        ? ', ' + (stardom.gain.hatsMode ? 'sequência' : 'juntos') : ''})`) : '—'}\n` +
    `[d]/[k] painel  ·  [h] HUD  ·  [w] skin  ·  [0] repor câmara  ·  rato: orbitar/zoom`;
});

engine.runRenderLoop(() => scene.render());
addEventListener('resize', () => engine.resize());

/* ---------------- API exposta (orquestrador/screenshot) ---------------- */
window.MB2 = {
  scene, engine, camera, cfg: CONFIG, get ball() { return ball; },
  __perf: () => {
    const s = samples.slice().sort((a, b) => a - b);
    return { medianRenderMs: s.length ? s[s.length >> 1] : 0, n: s.length, tiles: tileCount() };
  },
  /* Skin dark/white (Fase 4, Regra 1: só tecla `w`/botão/API — nenhum motor lhe toca). */
  setSkin,
  get skinMix() { return skinMix; },
  /* Bónus §7 do brief F4: sliders re-lêem CONFIG quando este é escrito pela consola. */
  refreshPanel,
  /* F11 (diagnóstico): o mikado, para inspeção/verificação pela consola — `MB2.mikado.rebuild()`
     regenera a disposição depois de escrever em `CONFIG.mikado.*` sem passar pelo painel. */
  get mikado() { return mikado; },
  /* F12 (diagnóstico): o ESTRELATO (`MB2.stardom.star` = quem é a estrela agora, `.gain` = os
     multiplicadores publicados) e os CHAPÉUS (`MB2.hats.pulse('all'|'seq'|'one', t)` dispara um
     gesto à mão, para verificar a sequência ponta-a-ponta sem esperar pela música). */
  get stardom() { return stardom; },
  get hats() { return hats; },
  /* F5 (diagnóstico): coreografia e estado efetivo do frame. A API pública é `window.MIRRORBALL`. */
  get choreo() { return choreo; },
  get E() { return E; },
  get panel() { return panelApi; },
  /* F13 §4 (diagnóstico, NADA visível): o banner "dimensões da sala mudaram" foi eliminado; quem
     quiser saber se um knob ⟳ diverge da geometria com que a cena foi construída chama isto pela
     consola. `MB2.builtGeom` é a fotografia tirada antes do `buildRoom()`. */
  roomGeomDiffers,
  get builtGeom() { return Object.assign({}, BUILT_GEOM); },
};

console.log('MB2 pronto —', engine.isWebGPU ? 'WebGPU' : 'WebGL2');

// ---- F5 music ----
// Modo música (?src=music): carrega core.js/music.js/tuner.js do sidecar SEM os tocar (brief
// f5-sonnet.md). Só ativa quando servida como /app/spike/v2/index.html (sidecar real ou fallback
// serve.py, ver spike-babylon/serve.py) — fora daí (`:8099/v2/index.html` sem junction/proxy) os
// caminhos relativos não existem e o resto do spike continua igual (Fase 1-4, nada muda).
//
// `music.js` lê `window.MIRRORBALL` ao carregar (web/music.js:783, :2576) — por isso só se importam
// os 3 scripts DEPOIS de `window.MIRRORBALL` existir. O Opus cria a API real e dispara `mb2-ready`
// (bloco '---- F5 choreo/API ----'); enquanto ele não tiver terminado, um stub local mínimo (nunca
// sobrepõe a API real — `if (!window.MIRRORBALL)`) permite testar este bloco de forma isolada.
(function f5Music() {
  if (qs.get('src') !== 'music') return; // core.js decide o dono via MB_SOURCE; aqui só gate de carregamento

  function ensureStub() {
    // Stub de desenvolvimento — REMOVIDO/ignorado assim que o Opus tiver window.MIRRORBALL real
    // (guarda-se com `if (!window.MIRRORBALL)`, nunca sobrepõe).
    if (window.MIRRORBALL) return;
    console.warn('[F5 music] window.MIRRORBALL ainda não existe (Opus) — a usar stub local só para desenvolvimento.');
    let stubHealth = 1;
    window.MIRRORBALL = {
      setHealth(v) { stubHealth = Math.max(0, Math.min(1, Number(v) || 0)); },
      getHealth() { return stubHealth; },
      config: CONFIG,
      knobs: {
        get: () => panelApi.knobsGet(),
        set: (obj) => { const n = panelApi.knobsSet(obj, false); if (panelApi.setKnobFile) panelApi.setKnobFile(obj); return n; },
      },
      setSpot() {}, flash() {}, retarget() {}, setChoreo() {}, strobe() { return false; }, strobeEnabled() { return false; },
      setSkin, setSkinAuto() {}, getSkin: () => CONFIG.skin,
      explode() {}, rewind() {}, getExplode: () => ({ phase: 'idle', s: 0, enabled: false }), setExplodeEnabled() {},
    };
  }

  /* F9 (2026-09-01): o spike serve-se por DOIS caminhos e os 3 scripts do motor vivem em `web/`:
       /app/spike/v2/index.html  (modo música "oficial")  → web/ está em  ../../      = /app/*.js
       /v2/index.html            (URL do dia-a-dia)       → web/ está em  /app/*.js  (serve.py
                                 roteia /app/*.js → ../web/*.js, ver spike-babylon/serve.py)
     Antes só o 1º caminho funcionava: em `/v2/index.html?src=music` os `../../*.js` resolviam para
     `/core.js`, que não existe → 404 e o motor nunca arrancava (silenciosamente, só com um erro
     por script na consola). Agora deriva-se a base do próprio pathname e há FALLBACK: se o 1º
     candidato falhar, tenta o outro antes de desistir. */
  const MUSIC_BASES = location.pathname.includes('/app/spike/')
    ? ['../../', '/app/']     // servido como /app/spike/v2/… (relativo primeiro, same-origin garantido)
    : ['/app/', '../../'];    // servido como /v2/… (o serve.py roteia /app/*.js → web/*.js)

  function loadMusicScripts() {
    console.log('[F5 music] window.MIRRORBALL pronto — a carregar core.js/music.js/tuner.js (base ' +
      MUSIC_BASES[0] + ').');
    // Ids de DOM esperados pelos 3 scripts: só `#mus` (web/music.js:2388, HUD tecla `m`) — já existe
    // em v2/index.html, escondido por omissão (.on liga/desliga, mesmo padrão do Canvas 2D).
    const files = ['core.js?v=1', 'music.js?v=58', 'tuner.js?v=1'];
    let i = 0;
    function next() {
      if (i >= files.length) { console.log('[F5 music] core.js/music.js/tuner.js carregados.'); return; }
      loadOne(files[i++], 0);
    }
    function loadOne(file, baseIdx) {
      if (baseIdx >= MUSIC_BASES.length) {
        // Sem sidecar/rota, os scripts não existem — o spike TEM de continuar a funcionar sem erros
        // visíveis (requisito do brief F9: "degrada sem erros"). Avisa na consola e segue.
        console.warn('[F5 music] ' + file + ' não encontrado em nenhuma base (' +
          MUSIC_BASES.join(', ') + ') — modo música indisponível, o resto do spike continua igual.');
        return next();
      }
      const s = document.createElement('script');
      s.src = MUSIC_BASES[baseIdx] + file;
      s.onload = next;
      s.onerror = () => { s.remove(); loadOne(file, baseIdx + 1); }; // tenta a base seguinte
      document.body.appendChild(s);
    }
    next();
  }

  function start() {
    ensureStub(); // não-op se o Opus já criou a API real
    loadMusicScripts();
  }

  if (window.__MB2_READY || window.MIRRORBALL) start();
  else addEventListener('mb2-ready', start, { once: true });
})();
