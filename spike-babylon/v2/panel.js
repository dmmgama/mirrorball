// v2/panel.js — painel `d`: os mesmos 54 sliders da bola Canvas 2D (web/index-v2.html:774-830),
// mesmos nomes/ordem/ranges/steps/PERSIST, MAIS os novos do spike Babylon (§Fase 1: variação de
// tamanho, tom, disposição, PBR, luz dos focos; §Fase 2: checkboxes `spot i`, `pbr: glint mix`,
// `indireta: luz ×`, cor RGB dos focos). Chave própria localStorage['mb2.knobs'] — não colide com
// 'mb.knobs' da bola Canvas 2D atual (arbitragem entre as duas instâncias).
//
// Sliders cujo efeito ainda não existe nesta fase levam sufixo ' (fase N)' no label — o valor
// ainda é guardado/persistido, só o comportamento é que chega mais tarde.
//
// initPanel(CONFIG, hooks) — hooks: { onRebuildBall, onSpotsChanged, onShadeChanged, onBgGreyChanged }
//
// ---- S8: persistência e save/load (pedido do David) --------------------------------------------
// Prioridade dos valores no arranque:   localStorage['mb2.knobs']  >  knobs-default.json  >  config.js
//
//  * `knobs-default.json` (ficheiro ao lado deste, gerado por `node gen-knobs-default.js`) é a camada
//    de defaults do SPIKE fora do código — carregado com `fetch(..., {cache:'no-store'})` no arranque.
//    Editá-lo muda os defaults sem tocar em `config.js`. Se faltar/falhar, cai nos defaults do código.
//  * `localStorage['mb2.knobs']` guarda TODOS os knobs persistíveis (não só os que foram mexidos) —
//    antes só se escrevia o knob no `oninput`, e um `mb2.knobs` antigo perdia tudo o que fosse novo.
//  * `localStorage['mb2.knobsTouched']` guarda a LISTA dos knobs que o David mexeu de facto. É esta
//    lista (e já não "está no mb2.knobs?") que dá a prioridade `localStorage > ficheiro` do
//    `MIRRORBALL.knobs.set` em modo música — senão, ao passar a gravar tudo, o music-config.json
//    nunca mais seria aplicado a nada.
//  * `localStorage['mb2.toggles']` guarda o que NÃO é slider: checkboxes `spot i`, `skin`, `explosões`.
//  * Botões: "gravar" descarrega `mb2-knobs.json` (Blob + <a download>), "carregar ficheiro" lê um
//    JSON e aplica-o, "repor ficheiro gravado" repõe o `knobs-default.json` (modo manual) ou a secção
//    `ball` do `music-config.json` (modo música, quando o motor o carregou), "repor knobs (defaults)"
//    limpa o localStorage e volta aos defaults do código.
//
// initPanel é ASSÍNCRONA (o fetch do knobs-default.json) — main.js faz `await initPanel(...)`.

const KEY_KNOBS = 'mb2.knobs';
const KEY_TOUCHED = 'mb2.knobsTouched';
const KEY_TOGGLES = 'mb2.toggles';
const DEFAULTS_URL = './knobs-default.json';

/* Labels renomeados na F5 (commit 7280271) — um `mb2.knobs` gravado antes disso tem as chaves
   antigas e os valores ficavam ÓRFÃOS (o David perdia esses knobs sem aviso). Migra-se na leitura. */
const RENAMED = {
  'flash: por s (só manual)': 'flash: por s',
  'flash: dura ms (só manual)': 'flash: dura ms',
  'focos+flashes: motor manda (0/1) (fase 5)': 'focos+flashes: motor manda (0/1)',
  'auréola (fase 3)': 'auréola',
  'strobe fundo (0/1) (fase 4)': 'strobe fundo (0/1)',
  'strobe: frequência × (fase 4)': 'strobe: frequência ×',
  'pontos na parede (densidade) (fase 4)': 'pontos na parede (densidade)',
  'strobe: força (fase 4)': 'strobe: força',
  'strobe: dura ms (fase 4)': 'strobe: dura ms',
  'health (motor manda) (fase 5)': 'health (motor manda)',
};
function migrate(obj) {
  if (!obj || typeof obj !== 'object') return {};
  const out = {}, moved = [];
  for (const k in obj) {
    const nk = RENAMED[k];
    if (nk) { if (!(nk in obj)) { out[nk] = obj[k]; moved.push(k + ' → ' + nk); } }
    else out[k] = obj[k];
  }
  if (moved.length) console.log('[MB2] knobs renomeados recuperados:', moved.join(', '));
  return out;
}

function readJSON(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
}
function writeJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* sem storage */ }
}

export async function initPanel(CONFIG, hooks = {}) {
  const noop = () => {};
  function num(v, d) { return Number.isFinite(v) ? v : d; } // F10: margens fixas dos corredores (config.js)
  const onRebuildBall = hooks.onRebuildBall || noop;
  const onSpotsChanged = hooks.onSpotsChanged || noop;
  const onShadeChanged = hooks.onShadeChanged || noop;
  const onBgGreyChanged = hooks.onBgGreyChanged || noop;
  // ---- Fase 8: wash/cor (ao vivo, sem rebuild) + dimensões da sala (exigem reload — ver painel) ----
  const onWashChanged = hooks.onWashChanged || noop;
  const onColorToggleChanged = hooks.onColorToggleChanged || noop;
  const onRoomDimChanged = hooks.onRoomDimChanged || noop;
  const onPillarsChanged = hooks.onPillarsChanged || noop; // F8-b: toggle por pilar (setEnabled ao vivo)
  const onReflChanged = hooks.onReflChanged || noop; // F10: refletividade por superfície (ao vivo, sem rebuild)
  // F11: geometria do mikado (mikado.rebuild() ao vivo) e toggle da bola (esconde a bola E regenera
  // o mikado, porque a clareira depende de a bola estar montada ou não — spec §4).
  const onMikadoGeomChanged = hooks.onMikadoGeomChanged || noop;
  const onBallToggleChanged = hooks.onBallToggleChanged || noop;
  // F12 §3: altura da bola ao vivo — regenera a clareira do mikado e refresca o probe (a bola
  // mudou de sítio, o reflexo tem de ser recalculado a partir da cota nova).
  const onBallHeightChanged = hooks.onBallHeightChanged || noop;

  const CH = CONFIG.choreo, AMB = CONFIG.ambient;
  // 'health' é mecânico (placeholder local) até o Opus criar window.MIRRORBALL.setHealth/getHealth
  // (bloco '---- F5 choreo/API ----' do main.js); o slider abaixo liga-se à API real quando existir,
  // sem quebrar antes disso (f5-sync.md, pedido do Opus).
  let health = 1;

  // ---- os 54 sliders da bola Canvas 2D, verbatim (nomes/ordem/ranges/steps de web/index-v2.html:774-830) ----
  const sliders = [
    // ---- focos (knobs do David; persistem em localStorage mb2.knobs) ----
    ['focos: quantos', 0, 6, 1, v => { CONFIG.spotCount = v; onSpotsChanged(); }, () => CONFIG.spotCount],
    ['focos: raio ×', 0.2, 3, 0.05, v => { CONFIG.spotRadiusMul = v; onSpotsChanged(); }, () => CONFIG.spotRadiusMul],
    ['focos: orla', 0, 0.9, 0.05, v => CONFIG.spotEdge = v, () => CONFIG.spotEdge],
    ['espelhos: brilho', 0, 2.5, 0.05, v => CONFIG.mirrorGain = v, () => CONFIG.mirrorGain],
    ['focos: saltam (0/1)', 0, 1, 1, v => CH.retarget = v >= 1, () => CH.retarget ? 1 : 0],
    ['focos: fixo min s', 0.3, 20, 0.1, v => CH.dwell[0] = Math.min(v, CH.dwell[1]), () => CH.dwell[0]],
    ['focos: fixo max s', 0.3, 30, 0.1, v => CH.dwell[1] = Math.max(v, CH.dwell[0]), () => CH.dwell[1]],
    ['origem: |az| min°', 0, 170, 1, v => CH.azRange[0] = Math.min(v, CH.azRange[1]), () => CH.azRange[0]],
    ['origem: |az| max°', 0, 175, 1, v => CH.azRange[1] = Math.max(v, CH.azRange[0]), () => CH.azRange[1]],
    ['origem: el min°', -40, 80, 1, v => CH.elRange[0] = Math.min(v, CH.elRange[1]), () => CH.elRange[0]],
    ['origem: el max°', -40, 85, 1, v => CH.elRange[1] = Math.max(v, CH.elRange[0]), () => CH.elRange[1]],
    ['origem: mira (raios)', 0, 0.9, 0.02, v => CH.aimMax = v, () => CH.aimMax],
    ['spot0: az° (−=esq)', -175, 175, 1, v => { CONFIG.spots[0].az = v; onSpotsChanged(); }, () => CONFIG.spots[0].az],
    ['spot0: el°', -30, 80, 1, v => { CONFIG.spots[0].el = v; onSpotsChanged(); }, () => CONFIG.spots[0].el],
    ['spot1: az°', -175, 175, 1, v => { CONFIG.spots[1].az = v; onSpotsChanged(); }, () => CONFIG.spots[1].az],
    ['spot1: el°', -30, 80, 1, v => { CONFIG.spots[1].el = v; onSpotsChanged(); }, () => CONFIG.spots[1].el],
    ['spot2: az°', -175, 175, 1, v => { CONFIG.spots[2].az = v; onSpotsChanged(); }, () => CONFIG.spots[2].az],
    ['spot2: el°', -30, 80, 1, v => { CONFIG.spots[2].el = v; onSpotsChanged(); }, () => CONFIG.spots[2].el],
    ['spot3: az°', -175, 175, 1, v => { CONFIG.spots[3].az = v; onSpotsChanged(); }, () => CONFIG.spots[3].az],
    ['spot3: el°', -30, 80, 1, v => { CONFIG.spots[3].el = v; onSpotsChanged(); }, () => CONFIG.spots[3].el],
    ['flash: por s', 0, 6, 0.1, v => CH.flashRate = v, () => CH.flashRate],
    ['flash: raio ×', 0.2, 3, 0.05, v => { const b = 0.14; CH.flashRadius[0] = b * 0.7 * v; CH.flashRadius[1] = b * 1.3 * v; }, () => CH.flashRadius[1] / (0.14 * 1.3)],
    ['flash: dura ms', 40, 600, 10, v => { CH.flashLen[0] = v * 0.6 / 1000; CH.flashLen[1] = v * 1.4 / 1000; }, () => CH.flashLen[1] * 1000 / 1.4],
    ['bola: luz', 0, 1, 0.02, v => CONFIG.ballLight = v, () => CONFIG.ballLight],
    ['bola: contraste', 0.5, 2.5, 0.05, v => CONFIG.ballContrast = v, () => CONFIG.ballContrast],
    ['luz geral (volume)', 0, 1, 0.05, v => { CONFIG.shade.key = v; onShadeChanged(); }, () => CONFIG.shade.key],
    ['luz geral: az°', -180, 180, 5, v => { CONFIG.shade.az = v; onShadeChanged(); }, () => CONFIG.shade.az],
    ['luz geral: el°', -60, 90, 5, v => { CONFIG.shade.el = v; onShadeChanged(); }, () => CONFIG.shade.el],
    ['auréola', 0, 1, 0.05, v => CONFIG.halo = v, () => CONFIG.halo],
    ['fundo: claridade (dark)', 0, 60, 1, v => { CONFIG.bgGrey = v; onBgGreyChanged(); }, () => CONFIG.bgGrey],
    ['strobe fundo (0/1)', 0, 1, 1, v => CONFIG.strobe.enabled = v >= 1, () => CONFIG.strobe.enabled ? 1 : 0],
    ['strobe: frequência ×', 0, 3, 0.1, v => CONFIG.strobeRate = v, () => CONFIG.strobeRate],
    ['pontos na parede (densidade)', 0, 3, 0.05, v => CONFIG.dotDensity = v, () => CONFIG.dotDensity],
    ['strobe: força', 0, 1, 0.05, v => CONFIG.strobe.level = v, () => CONFIG.strobe.level],
    ['strobe: dura ms', 20, 200, 5, v => CONFIG.strobe.lenMs = v, () => CONFIG.strobe.lenMs],
    ['luz indireta', 0, 0.4, 0.01, v => AMB.intensity = v, () => AMB.intensity],
    ['indireta: área°', 8, 70, 1, v => AMB.areaDeg = v, () => AMB.areaDeg],
    ['cone incidente', 0, 0.3, 0.005, v => CONFIG.incidentAlpha = v, () => CONFIG.incidentAlpha],
    ['cone: alcance', 1, 8, 0.2, v => CONFIG.incidentLen = v, () => CONFIG.incidentLen],
    ['cone: largura máx', 1, 3, 0.1, v => CONFIG.incidentMaxWidth = v, () => CONFIG.incidentMaxWidth],
    ['cone: teto (raios)', 0.03, 0.4, 0.01, v => CONFIG.incidentMaxPx = v, () => CONFIG.incidentMaxPx],
    ['feixes: fração máx (motor modula)', 0, 1, 0.05, v => { CONFIG.beamFractionMax = v; CONFIG.beamFraction = v; }, () => CONFIG.beamFractionMax],
    ['feixes: compr. 3D (fase 3)', 0.5, 8, 0.1, v => CONFIG.beamLen3D = v, () => CONFIG.beamLen3D],
    ['feixes: largura°', 0.1, 4, 0.05, v => CONFIG.beamWidthDeg = v, () => CONFIG.beamWidthDeg],
    ['feixes: base ×', 0.1, 2, 0.05, v => CONFIG.beamBaseMul = v, () => CONFIG.beamBaseMul],
    ['feixes: dispersão', 0, 1, 0.02, v => CONFIG.beamSoft = v, () => CONFIG.beamSoft],
    ['junta (seam)', 0, 0.4, 0.01, v => { CONFIG.seamInset = v; onRebuildBall(); }, () => CONFIG.seamInset],
    ['espelhos: filas', 16, 96, 2, v => { if (v !== CONFIG.facetRows) { CONFIG.facetRows = v; onRebuildBall(); } }, () => CONFIG.facetRows],
    // ---- bola ----
    ['rotationRpm (motor manda)', 0, 3, 0.05, v => CONFIG.rotationRpm = v, () => CONFIG.rotationRpm],
    ['haze máx (motor modula)', 0, 1, 0.01, v => { CONFIG.hazeMax = v; CONFIG.haze = v; }, () => CONFIG.hazeMax],
    ['feixes+haze: motor manda (0/1)', 0, 1, 1, v => CONFIG.beamsMotor = !!v, () => CONFIG.beamsMotor ? 1 : 0],
    ['focos+flashes: motor manda (0/1)', 0, 1, 1, v => CONFIG.spotsMotor = !!v, () => CONFIG.spotsMotor ? 1 : 0],
    ['opacidade: motor manda (0/1)', 0, 1, 1, v => CONFIG.opacityMotor = !!v, () => CONFIG.opacityMotor ? 1 : 0],
    ['sphereOpacity (motor manda)', 0, 1, 0.01, v => CONFIG.sphereOpacity = v, () => CONFIG.sphereOpacity],
    ['health (motor manda)', 0, 1, 0.01,
      v => { health = v; if (window.MIRRORBALL && window.MIRRORBALL.setHealth) window.MIRRORBALL.setHealth(v); },
      () => (window.MIRRORBALL && window.MIRRORBALL.getHealth) ? window.MIRRORBALL.getHealth() : health],
  ];

  // índice onde termina o bloco "focos" original (antes de 'rotationRpm') — usado para o PERSIST,
  // igual à regra da bola Canvas 2D (:845): tudo até ao bloco '---- bola' persiste.
  const rotationIdx = sliders.findIndex(x => x[0].startsWith('rotationRpm'));
  const PERSIST = new Set(
    sliders.slice(0, rotationIdx).map(x => x[0]).concat([
      'haze máx (motor modula)',
      'feixes+haze: motor manda (0/1)',
      'focos+flashes: motor manda (0/1)',
      'opacidade: motor manda (0/1)',
    ])
  );

  // ---- novos knobs do spike Babylon (Fase 1): variação/tom/disposição dos espelhos + PBR + focos ----
  const newSliders = [
    ['espelhos: variação', 0, 1, 0.02, v => { CONFIG.tileSizeVar = v; onRebuildBall(); }, () => CONFIG.tileSizeVar],
    ['espelhos: tom (0=hash/1=real)', 0, 1, 1, v => { CONFIG.tileTone = v >= 1 ? 'real' : 'hash'; onRebuildBall(); }, () => CONFIG.tileTone === 'real' ? 1 : 0],
    ['espelhos: alinhados (0/1)', 0, 1, 1, v => { CONFIG.tileLayout = v >= 1 ? 'aligned' : 'offset'; onRebuildBall(); }, () => CONFIG.tileLayout === 'aligned' ? 1 : 0],
    ['pbr: metallic', 0, 1, 0.01, v => CONFIG.mirrorMetallic = v, () => CONFIG.mirrorMetallic],
    ['pbr: roughness', 0.02, 1, 0.01, v => CONFIG.mirrorRoughness = v, () => CONFIG.mirrorRoughness],
    ['pbr: ambiente', 0, 6, 0.1, v => CONFIG.envIntensity = v, () => CONFIG.envIntensity],
    ['focos: luz (lm)', 100, 2500, 25, v => { CONFIG.spotLightIntensity = v; onSpotsChanged(); }, () => CONFIG.spotLightIntensity],
    ['focos: distância', 2, 12, 0.2, v => { CONFIG.spotDist = v; onSpotsChanged(); }, () => CONFIG.spotDist],
    // ---- Fase 2 (Sonnet): glint PBR vs CPU, ganho da luz indireta ----
    ['pbr: glint mix', 0, 1, 0.02, v => CONFIG.glintPbrMix = v, () => CONFIG.glintPbrMix],
    ['indireta: luz ×', 0, 20, 0.25, v => { CONFIG.ambientLightMul = v; }, () => CONFIG.ambientLightMul],
    ['raio-x: osso (0/1)', 0, 1, 1, v => { CONFIG.boneMesh = v >= 0.5; }, () => (CONFIG.boneMesh === false ? 0 : 1)],
    ['raio-x: osso alpha ×', 0, 2, 0.05, v => { CONFIG.boneAlphaMul = v; }, () => CONFIG.boneAlphaMul],
    // ---- Fase 3 (Sonnet/Opus): feixes refletidos — teto invulável beamIntensity ≤ 0.18 (regra 6 do CLAUDE.md) ----
    ['feixes: intensidade', 0, 0.18, 0.005, v => CONFIG.beamIntensity = Math.min(0.18, v), () => CONFIG.beamIntensity],
    ['feixes: glow z', 0, 1, 0.02, v => CONFIG.beamGlowZ = v, () => CONFIG.beamGlowZ],
    ['feixes: glow ×', 0, 1, 0.02, v => CONFIG.beamGlowMul = v, () => CONFIG.beamGlowMul],
    ['feixes: comprimento', 2, 12, 0.2, v => CONFIG.beamLen = v, () => CONFIG.beamLen],
    // ---- correções do David (2026-08-30, Opus): corrente 3D + junta em modo 'real' ----
    ['corrente (0/1)', 0, 1, 1, v => { CONFIG.chainOn = v >= 0.5; onRebuildBall(); }, () => (CONFIG.chainOn === false ? 0 : 1)],
    ['corrente: elo (raios)', 0.01, 0.15, 0.005, v => { CONFIG.chainLink = v; onRebuildBall(); }, () => CONFIG.chainLink],
    ['espelhos: junta (real)', 0, 1, 0.02, v => CONFIG.seamGreyReal = v, () => CONFIG.seamGreyReal],
    ['espelhos: junta larg. (real)', 0, 1, 0.02, v => { CONFIG.seamInsetRealMul = v; onRebuildBall(); }, () => CONFIG.seamInsetRealMul],
    ['espelhos: junta var. (real)', 0, 1, 0.02, v => { CONFIG.seamVarRealMul = v; onRebuildBall(); }, () => CONFIG.seamVarRealMul],
    // ---- Fase 4 (Sonnet): pontos na parede, bloom/grão/vinheta, pós-processo ----
    ['pontos: escala', 0.05, 1, 0.01, v => CONFIG.dotScale = v, () => CONFIG.dotScale],
    ['pontos: queda', 0, 0.2, 0.002, v => CONFIG.dotFalloff = v, () => CONFIG.dotFalloff],
    ['pontos: teto cinza', 0, 255, 1, v => CONFIG.dotMaxGrey = v, () => CONFIG.dotMaxGrey],
    ['bloom: força', 0, 2, 0.05, v => CONFIG.bloomStrength = v, () => CONFIG.bloomStrength],
    ['bloom: limiar', 0, 1, 0.02, v => CONFIG.bloomThreshold = v, () => CONFIG.bloomThreshold],
    ['bloom: raio px', 1, 40, 1, v => CONFIG.bloomBlurPx = v, () => CONFIG.bloomBlurPx],
    ['grão', 0, 0.2, 0.005, v => CONFIG.grain = v, () => CONFIG.grain],
    ['vinheta', 0, 1, 0.02, v => CONFIG.vignette = v, () => CONFIG.vignette],
    ['pós: tonemap (0/1)', 0, 1, 1, v => CONFIG.postTonemap = v, () => CONFIG.postTonemap],
    ['pós: exposição', 0.3, 2, 0.02, v => CONFIG.postExposure = v, () => CONFIG.postExposure],
    // ---- Fase 6 (Sonnet): corpos PAR36 visíveis ----
    ['corpos (0/1)', 0, 1, 1, v => { CONFIG.fixturesOn = v >= 0.5; }, () => (CONFIG.fixturesOn === false ? 0 : 1)],
    ['corpos: escala', 0.2, 3, 0.05, v => CONFIG.fixtureScale = v, () => CONFIG.fixtureScale],
    ['corpos: lente ×', 0, 6, 0.1, v => CONFIG.lensGain = v, () => CONFIG.lensGain],
    ['corpos: haste (0/1)', 0, 1, 1, v => { CONFIG.fixtureStemOn = v >= 0.5; }, () => (CONFIG.fixtureStemOn === false ? 0 : 1)],
    // ---- Fase 7 (Opus, pedido via f67-sync.md): explosão em estilhaços ----
    ['explosão: alcance (radial)', 0.5, 4, 0.05, v => CONFIG.explode.radial = v, () => CONFIG.explode.radial],
    ['explosão: deriva s', 1, 14, 0.1, v => CONFIG.explode.driftSec = v, () => CONFIG.explode.driftSec],
    ['explosão: pausa s', 0, 6, 0.05, v => CONFIG.explode.hold = v, () => CONFIG.explode.hold],
    // ---- Fase 8 (Sonnet, 2026-08-31): sala real do Lux Frágil — dimensões, wash, chapéus, cor ----
    // dimensões: mudar exige RELOAD (a sala/pilares/chapéus só se constroem uma vez no arranque —
    // não há rebuild ao vivo da geometria da sala, ao contrário de 'espelhos: filas' que só
    // reconstrói a bola). `onRoomDimChanged` avisa no #err, não faz onRebuildBall.
    //
    // ---- F10 (David, 2026-09-01): 'sala: largura (m)'/'sala: comprimento (m)' DEIXAM de ser knobs —
    // substituídos pelos dois abaixo ('pilares: vão entre filas'/'pilares: passo na fila'), medidos AO
    // EIXO dos pilares. Decisão (evita dois knobs a escrever o mesmo CONFIG.room): largura/comprimento
    // passam a CALCULADOS pelos setters destes dois knobs — os corredores (pilar→parede lateral,
    // pilar extremo→parede de fundo) ficam FIXOS em CONFIG.pillarWallMarginM/pillarEndMarginM (2,5 m
    // cada, config.js), só o miolo (vão/passo) estica ou encolhe. Os chapéus reespaçam-se na MESMA
    // chamada (passo = passo dos pilares / 2, linhas a 1 m da parede → |X| = largura/2 − 1).
    ['pilares: vão entre filas (m)', 4, 10, 0.5, v => {
      CONFIG.pillars.halfX = v / 2;
      const M = num(CONFIG.pillarWallMarginM, 2.5);
      CONFIG.roomWidthM = v + 2 * M;
      CONFIG.room.halfW = CONFIG.roomWidthM / 2;
      CONFIG.hats.lineX = CONFIG.roomWidthM / 2 - 1; // linhas de chapéus a 1 m da parede lateral
      onRoomDimChanged();
    }, () => CONFIG.pillars.halfX * 2],
    ['pilares: passo na fila (m)', 3, 8, 0.5, v => {
      CONFIG.pillars.spacingZ = v;
      const M = num(CONFIG.pillarEndMarginM, 2.5);
      CONFIG.roomDepthM = 2 * v + 2 * M;
      CONFIG.room.back = -CONFIG.roomDepthM / 2;
      CONFIG.hats.spacingZ = v / 2; // passo dos chapéus = metade do passo dos pilares
      onRoomDimChanged();
    }, () => CONFIG.pillars.spacingZ],
    ['pilares: lado (m)', 0.3, 1.2, 0.05, v => { CONFIG.pillars.section = v; onRoomDimChanged(); }, () => CONFIG.pillars.section],
    ['sala: pé-direito (m)', 3, 10, 0.1,
      v => { CONFIG.roomHeightM = v; CONFIG.room.ceil = v - (3.5); onRoomDimChanged(); }, () => CONFIG.roomHeightM],
    // ---- F10: refletividade por superfície — multiplicador do albedo (0-3, default 1), AO VIVO
    // (room.js: applyXReflMul(), sem rebuild). NÃO afeta os pontos refletidos pela bola (dots.js usa
    // um material próprio, emissivo aditivo, alimentado por ball.dots — confirmado por leitura). ----
    ['refl: chão', 0, 3, 0.05, v => { CONFIG.reflMul.floor = v; onReflChanged(); }, () => CONFIG.reflMul.floor],
    ['refl: teto', 0, 3, 0.05, v => { CONFIG.reflMul.ceil = v; onReflChanged(); }, () => CONFIG.reflMul.ceil],
    ['refl: paredes fundo', 0, 3, 0.05, v => { CONFIG.reflMul.back = v; onReflChanged(); }, () => CONFIG.reflMul.back],
    ['refl: paredes laterais', 0, 3, 0.05, v => { CONFIG.reflMul.side = v; onReflChanged(); }, () => CONFIG.reflMul.side],
    // cor: geral (afeta wash/chapéus/chão/pilares — a bola/espelhos/feixes continuam sempre
    // greyscale, regra 6 do CLAUDE.md). Default 1 (decisão do David 2026-08-31).
    ['cor (0/1)', 0, 1, 1, v => { CONFIG.colorOn = v >= 0.5; onColorToggleChanged(); }, () => (CONFIG.colorOn === false ? 0 : 1)],
    // wash ambiente azul profundo
    ['sala: wash (0-1)', 0, 1, 0.02, v => { CONFIG.wash.intensity = v; onWashChanged(); }, () => CONFIG.wash.intensity],
    ['sala: wash matiz', 0, 360, 2, v => { CONFIG.wash.hue = v; onWashChanged(); }, () => CONFIG.wash.hue],
    // chapéus de latão
    ['chapéus (0/1)', 0, 1, 1, v => { CONFIG.hats.on = v >= 0.5; }, () => (CONFIG.hats.on === false ? 0 : 1)],
    ['chapéus: quantos', 0, 12, 1, v => CONFIG.hats.count = v, () => CONFIG.hats.count],
    ['chapéus: brilho', 0, 2, 0.02, v => CONFIG.hats.glow = v, () => CONFIG.hats.glow],
    /* F12 §4: os chapéus a SÉRIO. `flash /min` continua a ser a frequência de uso (agora também a
       do motor, via estrelato); a FORÇA passa a knob (o flash da F8 era "levezinho" — David); o
       MODO escolhe o gesto: sozinhos (o Poisson da F8), todos juntos, ou a sequência ponta-a-ponta
       SIMÉTRICA nas duas filas. `sequência ms/passo` tem piso 334 ms = teto de 3 Hz da sala. */
    ['chapéus: flash /min', 0, 60, 0.5, v => CONFIG.hats.flashPerMin = v, () => CONFIG.hats.flashPerMin],
    ['chapéus: força do flash', 0, 10, 0.1, v => CONFIG.hats.flashGain = v, () => CONFIG.hats.flashGain],
    ['chapéus: flash ms', 40, 600, 10, v => CONFIG.hats.flashMs = v, () => CONFIG.hats.flashMs],
    ['chapéus: modo (0=só/1=juntos/2=seq)', 0, 2, 1, v => CONFIG.hats.flashMode = v, () => CONFIG.hats.flashMode],
    ['chapéus: sequência ms/passo', 334, 1200, 2,
      v => CONFIG.hats.seqStepMs = Math.max(334, v), () => CONFIG.hats.seqStepMs],
    // altura da BASE (boca) do chapéu ao chão — F8 autoritativo: 2,5 m (o doc mede a base).
    ['chapéus: altura (m)', 1.5, 5, 0.05, v => CONFIG.hats.heightM = v, () => CONFIG.hats.heightM],
    // F8-b: graus a partir da VERTICAL (0 = a apagar direto para o chão). Faixa pedida 10-20°.
    ['chapéus: inclinação°', 0, 45, 1, v => CONFIG.hats.tiltDeg = v, () => CONFIG.hats.tiltDeg],
    // corte oblíquo que forma a pala — geometria, só se aplica com RELOAD (marcado com ⟳).
    ['chapéus: corte da pala°', 0, 60, 1,
      v => { CONFIG.hats.cutDeg = v; onRoomDimChanged(); }, () => CONFIG.hats.cutDeg],
    // robots de teto (F8, 2026-09-01): 4 corpos à face do teto, cone estreito vermelho para a pista.
    ['robots (0/1)', 0, 1, 1, v => { CONFIG.robots.on = v >= 0.5; }, () => (CONFIG.robots.on === false ? 0 : 1)],
    ['robots: luz', 0, 1.5, 0.02, v => CONFIG.robots.intensity = v, () => CONFIG.robots.intensity],
    // F8-b: graus a partir da VERTICAL; default 3 = praticamente a prumo (pedido do David).
    ['robots: inclinação°', 0, 30, 1, v => CONFIG.robots.tiltDeg = v, () => CONFIG.robots.tiltDeg],

    /* ---- F11 (David, 2026-09-01, docs/f11-mikado.md): BOLA e MIKADO ----
       Só o David liga/desliga elementos — o motor NUNCA o faz (spec §4). `bola (0/1)` esconde a
       bola inteira E regenera o mikado (com bola há CLAREIRA; sem bola, stack completo). Os knobs
       de GEOMETRIA do mikado chamam `onMikadoGeomChanged()` → `mikado.rebuild()`, que refaz a
       disposição AO VIVO (sem reload — ao contrário das dimensões da sala, a geração do mikado é
       barata e não há materiais a recriar). Os knobs de EFEITO atuam direto, sem rebuild. */
    ['bola (0/1)', 0, 1, 1, v => { CONFIG.ballOn = v >= 0.5; onBallToggleChanged(); }, () => (CONFIG.ballOn === false ? 0 : 1)],
    /* F12 §3: altura da BOLA — ao vivo (a corrente encurta/alonga, os focos re-miram sem se mexer,
       o mikado refaz a clareira à volta da cota nova). `onBallHeightChanged` regenera o mikado e
       refresca o probe, como o toggle da bola. Faixa: 2,0-4,6 m do CENTRO ao chão (o ball.js ainda
       clampa contra o pé-direito real, para a bola nunca sair da sala). */
    ['bola: altura (m)', 2.0, 4.6, 0.05,
      v => { CONFIG.ballHeightM = v; onBallHeightChanged(); }, () => CONFIG.ballHeightM],
    ['mikado (0/1)', 0, 1, 1, v => { CONFIG.mikado.on = v >= 0.5; }, () => (CONFIG.mikado.on === false ? 0 : 1)],
    // geometria (rebuild ao vivo)
    /* F12 §1: a contagem passou a DENSIDADE (barras/m² do miolo) — muda a geometria da sala e a
       malha escala uniforme. 0,77 ≈ as 40 barras do default da F11 na sala nominal (~52 m²). */
    ['mikado: barras/m²', 0, 1.6, 0.01,
      v => { CONFIG.mikado.densityPerM2 = v; onMikadoGeomChanged(); }, () => CONFIG.mikado.densityPerM2],
    // altura do MIKADO INTEIRO ao chão (spec §3: default 4,0 m, ao vivo)
    ['mikado: altura (m)', 2.5, 5.2, 0.05, v => { CONFIG.mikado.heightM = v; onMikadoGeomChanged(); }, () => CONFIG.mikado.heightM],
    ['mikado: espalha (m)', 0, 2, 0.05, v => { CONFIG.mikado.spreadM = v; onMikadoGeomChanged(); }, () => CONFIG.mikado.spreadM],
    ['mikado: camadas', 1, 10, 1, v => { CONFIG.mikado.layers = v; onMikadoGeomChanged(); }, () => CONFIG.mikado.layers],
    ['mikado: barra min (m)', 1, 8, 0.1, v => { CONFIG.mikado.lenMinM = v; onMikadoGeomChanged(); }, () => CONFIG.mikado.lenMinM],
    ['mikado: barra máx (m)', 1, 12, 0.1, v => { CONFIG.mikado.lenMaxM = v; onMikadoGeomChanged(); }, () => CONFIG.mikado.lenMaxM],
    ['mikado: Ø tubo (m)', 0.03, 0.3, 0.005, v => { CONFIG.mikado.tubeDiaM = v; onMikadoGeomChanged(); }, () => CONFIG.mikado.tubeDiaM],
    ['mikado: inclinação°', 0, 25, 1, v => { CONFIG.mikado.pitchDeg = v; onMikadoGeomChanged(); }, () => CONFIG.mikado.pitchDeg],
    ['mikado: viés eixo', 0, 1, 0.05, v => { CONFIG.mikado.axisBias = v; onMikadoGeomChanged(); }, () => CONFIG.mikado.axisBias],
    ['mikado: folga pilares (m)', 0, 1.5, 0.05, v => { CONFIG.mikado.insetM = v; onMikadoGeomChanged(); }, () => CONFIG.mikado.insetM],
    ['mikado: clareira bola (m)', 0, 2, 0.05, v => { CONFIG.mikado.ballClearM = v; onMikadoGeomChanged(); }, () => CONFIG.mikado.ballClearM],
    ['mikado: semente', 1, 99, 1, v => { CONFIG.mikado.seed = v; onMikadoGeomChanged(); }, () => CONFIG.mikado.seed],
    // efeito/flashes (ao vivo, sem rebuild). ⚠ 'mikado: flash Hz' TEM teto 3 — regra da sala.
    ['mikado: repouso', 0, 1, 0.02, v => CONFIG.mikado.idle = v, () => CONFIG.mikado.idle],
    ['mikado: flash força', 0, 6, 0.1, v => CONFIG.mikado.flashGain = v, () => CONFIG.mikado.flashGain],
    ['mikado: flash ms', 30, 500, 10, v => CONFIG.mikado.flashMs = v, () => CONFIG.mikado.flashMs],
    ['mikado: flash Hz', 0.2, 3, 0.1, v => CONFIG.mikado.hz = Math.min(3, v), () => CONFIG.mikado.hz],
    ['mikado: flashes/rajada', 1, 8, 1, v => CONFIG.mikado.burst = v, () => CONFIG.mikado.burst],
    ['mikado: modo (0=todas/1=blocos)', 0, 1, 1, v => CONFIG.mikado.mode = v, () => CONFIG.mikado.mode],
    ['mikado: tam. bloco', 1, 12, 1, v => { CONFIG.mikado.blockSize = v; onMikadoGeomChanged(); }, () => CONFIG.mikado.blockSize],
    ['mikado: cor (0=rot)', 0, 3, 1, v => CONFIG.mikado.color = v, () => CONFIG.mikado.color],
    ['mikado: luz sala ×', 0, 3, 0.05, v => CONFIG.mikado.lightMul = v, () => CONFIG.mikado.lightMul],
    // triggers musicais (spec §7)
    ['mikado: tarola (0/1)', 0, 1, 1, v => { CONFIG.mikado.snareOn = v >= 0.5; }, () => (CONFIG.mikado.snareOn === false ? 0 : 1)],
    ['mikado: tarola sens.', 0, 1, 0.05, v => CONFIG.mikado.snareSens = v, () => CONFIG.mikado.snareSens],
    ['mikado: drop (0/1)', 0, 1, 1, v => { CONFIG.mikado.dropOn = v >= 0.5; }, () => (CONFIG.mikado.dropOn === false ? 0 : 1)],
    ['mikado: drop rajada ×', 1, 4, 0.5, v => CONFIG.mikado.dropBurstMul = v, () => CONFIG.mikado.dropBurstMul],
    ['mikado: auto /min', 0, 30, 0.5, v => CONFIG.mikado.autoPerMin = v, () => CONFIG.mikado.autoPerMin],

    /* ---- F12 §5: ESTRELATO (v2/stardom.js) ----
       Em cada momento UMA peça conta a história (bola · mikado · chapéus) ou nenhuma (smooth). A
       EXCLUSÃO MÚTUA mikado↔chapéus é estrutural (só há uma estrela de cada vez), não um knob.
       As trocas só acontecem em fronteiras musicais: transição de FSM, drop, ou fim de frase
       (`frase (compassos)`). Sem motor de música, alterna pelo relógio `auto s`.
       Os três VIÉS são o pedido explícito do David ("calibrar mais mikado / mais bola / mais
       chapéus"): são pesos relativos no sorteio, não percentagens. Pôr um a 0 tira essa peça do
       estrelato sem a desligar da sala. Um elemento DESLIGADO no painel deixa de ser elegível e o
       peso dele redistribui-se sozinho — o motor nunca liga/desliga nada. */
    ['estrelato (0/1)', 0, 1, 1, v => { CONFIG.stardom.on = v >= 0.5; }, () => (CONFIG.stardom.on === false ? 0 : 1)],
    ['estrelato: força', 0, 1, 0.05, v => CONFIG.stardom.strength = v, () => CONFIG.stardom.strength],
    ['estrelato: viés bola', 0, 3, 0.05, v => CONFIG.stardom.biasBall = v, () => CONFIG.stardom.biasBall],
    ['estrelato: viés mikado', 0, 3, 0.05, v => CONFIG.stardom.biasMikado = v, () => CONFIG.stardom.biasMikado],
    ['estrelato: viés chapéus', 0, 3, 0.05, v => CONFIG.stardom.biasHats = v, () => CONFIG.stardom.biasHats],
    ['estrelato: viés smooth', 0, 3, 0.05, v => CONFIG.stardom.biasSmooth = v, () => CONFIG.stardom.biasSmooth],
    ['estrelato: não repetir', 0, 1, 0.05, v => CONFIG.stardom.noRepeat = v, () => CONFIG.stardom.noRepeat],
    ['estrelato: frase (compassos)', 2, 32, 1, v => CONFIG.stardom.holdBars = v, () => CONFIG.stardom.holdBars],
    ['estrelato: rampa s', 0.05, 3, 0.05, v => CONFIG.stardom.rampSec = v, () => CONFIG.stardom.rampSec],
    ['estrelato: auto s', 2, 60, 1, v => CONFIG.stardom.autoSec = v, () => CONFIG.stardom.autoSec],
    // chapéus sob comando do estrelato. ⚠ 'chapéus Hz' TEM teto 3 — regra invariável da sala.
    ['estrelato: chapéus Hz', 0.2, 3, 0.1,
      v => CONFIG.stardom.hatsHz = Math.min(3, v), () => CONFIG.stardom.hatsHz],
    ['estrelato: chapéus gesto', 0, 2, 1, v => CONFIG.stardom.hatsGesture = v, () => CONFIG.stardom.hatsGesture],
    ['estrelato: chapéus aux /min', 0, 60, 1, v => CONFIG.stardom.auxPerMin = v, () => CONFIG.stardom.auxPerMin],
  ];
  for (const s of newSliders) { sliders.push(s); PERSIST.add(s[0]); }

  /* ---- F8-b: grupo "Pilares" — um toggle 0/1 POR PILAR (David: "tapar e ligar" individualmente).
     `CONFIG.pillars.off` guarda os índices DESLIGADOS (array); cada knob escreve/retira o seu índice
     e chama `onPillarsChanged()`, que faz `room.applyPillarToggles()` (setEnabled ao vivo, o pilar
     fica na renderList do probe). Índices: 0-2 = fila X negativo (Z -5/0/+5), 3-5 = fila X positivo. */
  const PILLAR_NAMES = [];
  for (let i = 0; i < 6; i++) {
    const idx = i;
    const nome = 'pilar ' + (idx + 1) + ' (0/1)';
    PILLAR_NAMES.push(nome);
    const s = [nome, 0, 1, 1,
      (v) => {
        if (!Array.isArray(CONFIG.pillars.off)) CONFIG.pillars.off = [];
        const off = CONFIG.pillars.off, at = off.indexOf(idx);
        if (v >= 0.5) { if (at !== -1) off.splice(at, 1); }   // 1 = ligado → sai da lista de "off"
        else if (at === -1) off.push(idx);                     // 0 = desligado → entra na lista
        onPillarsChanged();
      },
      () => (Array.isArray(CONFIG.pillars.off) && CONFIG.pillars.off.indexOf(idx) !== -1 ? 0 : 1)];
    sliders.push(s); PERSIST.add(nome);
  }

  // ---- pedido extra do David: cor RGB nos focos (não existe na bola Canvas 2D; só afeta as SpotLight,
  // a cadeia de cinza CPU do Opus fica greyscale sempre) ----
  const colorSliders = [
    ['focos: cor (0/1)', 0, 1, 1, v => { CONFIG.spotColorOn = v >= 1; }, () => CONFIG.spotColorOn ? 1 : 0],
    ['focos: saturação', 0, 1, 0.02, v => { CONFIG.spotSat = v; }, () => CONFIG.spotSat],
  ];
  for (let i = 0; i < 6; i++) {
    colorSliders.push(['spot' + i + ': matiz°', 0, 360, 2, v => { CONFIG.spots[i].hue = v; }, () => CONFIG.spots[i].hue]);
  }
  for (const s of colorSliders) { sliders.push(s); PERSIST.add(s[0]); }

  // ---- brief ux-painel-d.md §2: 9 grupos (ordem de construção do array; nomes de slider intocáveis) ----
  // ⏫ = slider cujo set() chama onRebuildBall() (reconstrói a malha) — ver newSliders/sliders acima.
  const REBUILD = new Set([
    'espelhos: filas', 'junta (seam)', 'espelhos: variação', 'espelhos: tom (0=hash/1=real)',
    'espelhos: alinhados (0/1)', 'espelhos: junta larg. (real)', 'espelhos: junta var. (real)',
    'corrente (0/1)', 'corrente: elo (raios)',
  ]);
  // ⟳ = slider que exige RELOAD da página (F8: dimensões da sala — a geometria só se constrói uma
  // vez no arranque, não há rebuild ao vivo). Marcado à parte de REBUILD (⏫, que só reconstrói a
  // malha da bola) para não prometer um efeito imediato que o slider não dá.
  const RELOAD = new Set([
    'pilares: vão entre filas (m)', 'pilares: passo na fila (m)', 'pilares: lado (m)',
    'sala: pé-direito (m)', 'chapéus: corte da pala°',
  ]);
  const spotHueNames = [];
  for (let i = 0; i < 6; i++) spotHueNames.push('spot' + i + ': matiz°');
  const GROUPS = [
    ['Focos', [
      'focos: quantos', 'focos: raio ×', 'focos: orla', 'focos: luz (lm)', 'focos: distância',
      'spot0: az° (−=esq)', 'spot0: el°', 'spot1: az°', 'spot1: el°', 'spot2: az°', 'spot2: el°',
      'spot3: az°', 'spot3: el°', 'focos: cor (0/1)', 'focos: saturação', ...spotHueNames,
    ]],
    ['Coreografia & Flashes', [
      'focos: saltam (0/1)', 'focos: fixo min s', 'focos: fixo max s', 'origem: |az| min°',
      'origem: |az| max°', 'origem: el min°', 'origem: el max°', 'origem: mira (raios)',
      'flash: por s', 'flash: raio ×', 'flash: dura ms',
    ]],
    ['Bola & Espelhos', [
      'bola: luz', 'bola: contraste', 'espelhos: brilho', 'luz geral (volume)', 'luz geral: az°',
      'luz geral: el°', 'espelhos: filas', 'junta (seam)', 'espelhos: variação',
      'espelhos: tom (0=hash/1=real)', 'espelhos: alinhados (0/1)', 'espelhos: junta (real)',
      'espelhos: junta larg. (real)', 'espelhos: junta var. (real)', 'pbr: metallic',
      'pbr: roughness', 'pbr: ambiente', 'pbr: glint mix', 'raio-x: osso (0/1)',
      'raio-x: osso alpha ×', 'corrente (0/1)', 'corrente: elo (raios)',
    ]],
    ['Névoa & Feixes', [
      'haze máx (motor modula)', 'feixes: fração máx (motor modula)', 'feixes: intensidade',
      'feixes: largura°', 'feixes: dispersão', 'feixes: comprimento', 'feixes: base ×',
      'feixes: glow z', 'feixes: glow ×', 'feixes: compr. 3D (fase 3)', 'cone incidente',
      'cone: alcance', 'cone: largura máx', 'cone: teto (raios)', 'auréola',
    ]],
    ['Sala', [
      'pontos na parede (densidade)', 'pontos: escala', 'pontos: queda', 'pontos: teto cinza',
      'luz indireta', 'indireta: área°', 'indireta: luz ×', 'corpos (0/1)', 'corpos: escala',
      'corpos: lente ×', 'corpos: haste (0/1)', 'fundo: claridade (dark)',
      // ---- Fase 8: dimensões (RELOAD), wash, chapéus, cor ----
      'sala: pé-direito (m)', 'cor (0/1)',
      'sala: wash (0-1)', 'sala: wash matiz',
      // ---- F10: refletividade por superfície (ao vivo) ----
      'refl: chão', 'refl: teto', 'refl: paredes fundo', 'refl: paredes laterais',
      'chapéus (0/1)', 'chapéus: quantos', 'chapéus: brilho', 'chapéus: altura (m)',
      'chapéus: inclinação°', 'chapéus: corte da pala°',
      // F12 §4: os chapéus a sério — força/duração/modo do flash + cadência da sequência
      'chapéus: flash /min', 'chapéus: força do flash', 'chapéus: flash ms',
      'chapéus: modo (0=só/1=juntos/2=seq)', 'chapéus: sequência ms/passo',
      'robots (0/1)', 'robots: luz', 'robots: inclinação°',
    ]],
    // F8-b: grupo próprio para os 6 pilares individuais ("tapar e ligar" — David).
    // F10: geometria paramétrica (vão entre filas, passo na fila, secção) junta-se aqui — mesmo grupo.
    ['Pilares', ['pilares: vão entre filas (m)', 'pilares: passo na fila (m)', 'pilares: lado (m)', ...PILLAR_NAMES]],
    /* F11: grupo próprio para o mikado do teto (26 knobs — não cabiam em "Sala" sem a afogar).
       'bola (0/1)' vive AQUI, ao lado de 'mikado (0/1)': são o par que o David usa para escolher a
       peça central da sala (bola ↔ mikado ↔ as duas), e é o gesto que a spec §4 descreve. */
    ['Mikado & Bola', [
      'bola (0/1)', 'bola: altura (m)', 'mikado (0/1)',
      'mikado: barras/m²', 'mikado: altura (m)', 'mikado: espalha (m)', 'mikado: camadas',
      'mikado: barra min (m)', 'mikado: barra máx (m)', 'mikado: Ø tubo (m)', 'mikado: inclinação°',
      'mikado: viés eixo', 'mikado: folga pilares (m)', 'mikado: clareira bola (m)', 'mikado: semente',
      'mikado: repouso', 'mikado: flash força', 'mikado: flash ms', 'mikado: flash Hz',
      'mikado: flashes/rajada', 'mikado: modo (0=todas/1=blocos)', 'mikado: tam. bloco',
      'mikado: cor (0=rot)', 'mikado: luz sala ×',
      'mikado: tarola (0/1)', 'mikado: tarola sens.', 'mikado: drop (0/1)', 'mikado: drop rajada ×',
      'mikado: auto /min',
    ]],
    /* F12 §5: grupo próprio para o estrelato — é um SISTEMA (decide quem é a estrela), não um
       efeito de uma peça, por isso não cabia em "Mikado & Bola" nem em "Sala". */
    ['Estrelato', [
      'estrelato (0/1)', 'estrelato: força',
      'estrelato: viés bola', 'estrelato: viés mikado', 'estrelato: viés chapéus',
      'estrelato: viés smooth', 'estrelato: não repetir',
      'estrelato: frase (compassos)', 'estrelato: rampa s', 'estrelato: auto s',
      'estrelato: chapéus Hz', 'estrelato: chapéus gesto', 'estrelato: chapéus aux /min',
    ]],
    ['Pós & Skin', [
      'bloom: força', 'bloom: limiar', 'bloom: raio px', 'grão', 'vinheta',
      'pós: tonemap (0/1)', 'pós: exposição',
    ]],
    ['Motor', [
      'feixes+haze: motor manda (0/1)', 'focos+flashes: motor manda (0/1)',
      'opacidade: motor manda (0/1)', 'health (motor manda)', 'sphereOpacity (motor manda)',
      'rotationRpm (motor manda)', 'strobe fundo (0/1)', 'strobe: frequência ×',
      'strobe: força', 'strobe: dura ms',
    ]],
    ['Explosão', [
      'explosão: alcance (radial)', 'explosão: deriva s', 'explosão: pausa s',
    ]],
    ['Ficheiro', []],
  ];
  // 7 favoritos (§2) — sempre visíveis na faixa acima da barra, independentemente do grupo aberto.
  const FAVORITES = [
    'haze máx (motor modula)', 'feixes: fração máx (motor modula)', 'feixes: intensidade',
    'focos: quantos', 'espelhos: brilho', 'pontos na parede (densidade)', 'rotationRpm (motor manda)',
  ];

  // valida em dev que todo o slider está em exatamente 1 grupo (exceto Ficheiro, sem sliders) —
  // não deve rebentar em produção, só avisar (risco §Riscos: nomes têm de bater certo).
  (function validateGroups() {
    const seen = new Map();
    for (const [gname, names] of GROUPS) for (const n of names) {
      seen.set(n, (seen.get(n) || 0) + 1);
    }
    const known = new Set(sliders.map(s => s[0]));
    const missing = sliders.map(s => s[0]).filter(n => !seen.has(n));
    const dup = [...seen.entries()].filter(([, c]) => c > 1).map(([n]) => n);
    const ghost = [...seen.keys()].filter(n => !known.has(n));
    if (missing.length) console.warn('[MB2] sliders sem grupo:', missing.join(', '));
    if (dup.length) console.warn('[MB2] sliders em >1 grupo:', dup.join(', '));
    if (ghost.length) console.warn('[MB2] nomes de grupo sem slider correspondente:', ghost.join(', '));
  })();

  // ---- DOM: #dbg vira o container do popover ativo; #dbgbar (separadores) e #dbgfav (favoritos)
  // são novos, criados aqui e inseridos no body. `dbg.classList.toggle('on')` (tecla d) continua a
  // controlar tudo — ver bloco keydown mais abaixo, que passa a alternar os três juntos. ----
  const dbg = document.getElementById('dbg');
  dbg.innerHTML = '';
  dbg.className = 'dbgpop';
  /* ---- F11 (pedido do David, 2026-09-01): esconder o painel INTEIRO, e que fique escondido ----
     Antes o painel nascia SEMPRE visível e a tecla `d` alternava-o sem guardar nada: a cada reload
     voltava a tapar o canto. Agora a visibilidade persiste em `localStorage['mb2.panelOn']`
     (padrão `mb2.*` do spike) e há tecla dedicada — ver o bloco keydown mais abaixo.
     Default mantém-se VISÍVEL (é um spike de afinação; quem nunca tocou na tecla não perde o painel). */
  let panelOn = true;
  try { panelOn = localStorage.getItem('mb2.panelOn') !== 'off'; } catch (e) { /* sem storage */ }
  if (panelOn) dbg.classList.add('on');

  let dbgSize = { cols: 1, scale: 1, compact: false };
  try { Object.assign(dbgSize, JSON.parse(localStorage.getItem('mb2.dbgSize') || '{}')); } catch (e) { /* sem storage */ }
  function applyDbgSize() {
    // gen-knobs-default.js corre panel.js num sandbox sem `document.documentElement` (só stuba
    // getElementById/createElement) — guarda-se para o gerador continuar a funcionar sem alterações.
    if (document.documentElement && document.documentElement.style && document.documentElement.style.setProperty) {
      document.documentElement.style.setProperty('--dbgScale', dbgSize.scale);
      document.documentElement.style.setProperty('--dbgCols', dbgSize.cols);
    }
    dbg.classList.toggle('compact', !!dbgSize.compact);
    try { localStorage.setItem('mb2.dbgSize', JSON.stringify(dbgSize)); } catch (e) { /* */ }
  }

  // #dbgbar/#dbgfav são novos (não existem em index.html) — inseridos como irmãos de #dbg, mesmo
  // pai. Evita `document.body` (o sandbox do gerador não o stuba; `dbg.parentNode` é sempre válido
  // porque `dbg` veio de getElementById, que o sandbox garante existir).
  const dbgbar = document.createElement('div'); dbgbar.id = 'dbgbar';
  const dbgfav = document.createElement('div'); dbgfav.id = 'dbgfav';
  if (dbg.parentNode) {
    dbg.parentNode.insertBefore(dbgfav, dbg);
    dbg.parentNode.insertBefore(dbgbar, dbg);
  }

  let knobFile = null; // secção `ball` do music-config.json (só em ?src=music, via setKnobFile)

  const KNOB_DEFAULTS = {}; // valores do CÓDIGO (config.js), capturados ANTES de qualquer ficheiro/storage
  for (const [name, , , , , get] of sliders) if (PERSIST.has(name)) KNOB_DEFAULTS[name] = get();

  /* ---- camada 2: knobs-default.json (defaults do spike FORA do código) ----
     fetch relativo, no-store. Falhar não é erro fatal: fica-se com os defaults do config.js. */
  let fileDefaults = {};
  try {
    const r = await fetch(DEFAULTS_URL, { cache: 'no-store' });
    if (r.ok) {
      const j = await r.json();
      if (j && typeof j === 'object') fileDefaults = j;
      console.log('[MB2] knobs-default.json:', Object.keys(fileDefaults).length, 'knobs');
    } else {
      console.warn('[MB2] knobs-default.json não encontrado (HTTP ' + r.status + ') — defaults do código');
    }
  } catch (e) {
    console.warn('[MB2] knobs-default.json não carregou — defaults do código:', e && e.message);
  }

  /* ---- camada 3: localStorage (ganha a tudo) ---- */
  let knobStore = migrate(readJSON(KEY_KNOBS) || {});
  let touched = new Set(migrate2list(readJSON(KEY_TOUCHED)));
  function migrate2list(arr) {
    if (!Array.isArray(arr)) {
      // primeira execução depois do S8: um `mb2.knobs` antigo só continha o que o David TOCOU,
      // por isso as suas chaves são exatamente a lista de "tocados" que faltava.
      return Object.keys(knobStore);
    }
    return arr.map(k => RENAMED[k] || k);
  }
  function persistAll() {
    const all = {};
    for (const [name, , , , , get] of sliders) if (PERSIST.has(name)) {
      const v = get();
      if (Number.isFinite(v)) all[name] = v;
    }
    knobStore = all;
    writeJSON(KEY_KNOBS, all);
    writeJSON(KEY_TOUCHED, [...touched]);
  }

  // valor efetivo no arranque: localStorage > knobs-default.json > config.js
  function startValue(name) {
    if (Number.isFinite(knobStore[name])) return knobStore[name];
    if (Number.isFinite(fileDefaults[name])) return fileDefaults[name];
    return undefined; // fica o que o config.js já pôs
  }

  // risco §Riscos: `inp.previousSibling` assumia o valor colado ao slider — trocado por referências
  // explícitas. `inputs[name]` = slider do popover (o nó "oficial", usado por knobsSet/refresh);
  // `vals[name]` = campo de valor editável (número) do popover; `favInputs[name]`/`favVals[name]` =
  // os duplicados da faixa de favoritos (só para os 7 nomes de FAVORITES).
  const fmt = (v, st) => (+v).toFixed(st < 0.1 ? 2 : st < 1 ? 1 : 0);
  // gen-knobs-default.js corre panel.js num sandbox com elementos-stub mínimos (sem setAttribute,
  // dataset, querySelector, body/documentElement) — este helper evita rebentar o gerador.
  function setAttr(el, name, val) { if (el && typeof el.setAttribute === 'function') el.setAttribute(name, val); }
  const inputs = {}, vals = {}, favInputs = {}, favVals = {}, rows = {};
  const sliderDef = {}; // name -> [mn,mx,st,set,get] para a faixa de favoritos reconstruir sem duplicar a tabela `sliders`
  for (const s of sliders) sliderDef[s[0]] = s;

  function mkRow(name, mn, mx, st, set, get, { fav } = {}) {
    const lab = document.createElement('label');
    if (REBUILD.has(name)) lab.classList.add('rebuild');
    if (RELOAD.has(name)) lab.classList.add('rebuild'); // mesmo destaque visual do ⏫ (amarelo) — só muda o ícone/tooltip
    const span = document.createElement('span'); span.textContent = name;
    if (REBUILD.has(name)) { const rb = document.createElement('span'); rb.className = 'rb'; rb.textContent = ' ⏫'; rb.title = 'reconstrói a malha'; span.appendChild(rb); }
    if (RELOAD.has(name)) { const rl = document.createElement('span'); rl.className = 'rb'; rl.textContent = ' ⟳'; rl.title = 'exige recarregar a página (F5)'; span.appendChild(rl); }
    const val = document.createElement('input');
    val.type = 'number'; val.step = st; val.min = mn; val.max = mx;
    val.value = fmt(get(), st);
    const inp = document.createElement('input');
    inp.type = 'range'; inp.min = mn; inp.max = mx; inp.step = st; inp.value = get();

    function apply(v) {
      v = Math.min(mx, Math.max(mn, v));
      set(v);
      inp.value = v;
      val.value = fmt(v, st);
      const other = fav ? inputs[name] : favInputs[name];
      const otherVal = fav ? vals[name] : favVals[name];
      if (other) other.value = v;
      if (otherVal) otherVal.value = fmt(v, st);
      if (PERSIST.has(name)) {
        touched.add(name);
        persistAll();   // grava TODOS os knobs, não só este (senão os novos perdem-se)
      }
    }
    inp.oninput = () => apply(+inp.value);
    val.onchange = () => { const n = +val.value; if (Number.isFinite(n)) apply(n); else val.value = fmt(get(), st); };
    val.onkeydown = (e) => { if (e.key === 'Enter') val.blur(); };

    lab.appendChild(span); lab.appendChild(val); lab.appendChild(inp);
    return { lab, inp, val };
  }

  // ---- popovers por grupo: um <div class=dbgpop-group> por grupo, todos filhos de #dbg, só um visível ----
  const groupBoxes = {};
  const groupLists = {}; // referência direta ao .dbgpop-list de cada grupo — evita querySelector
                          // (o sandbox de gen-knobs-default.js não stuba esse método nos elementos)
  const groupNames = GROUPS.map(g => g[0]);
  for (const [gname, names] of GROUPS) {
    const box = document.createElement('div'); box.className = 'dbgpop-group';
    if (box.dataset) box.dataset.group = gname; // stub do gerador (gen-knobs-default.js) não tem `dataset`
    box.hidden = true;
    const head = document.createElement('div'); head.className = 'dbgpop-head';
    const title = document.createElement('span'); title.className = 'dbgpop-title'; title.textContent = gname;
    const search = document.createElement('input'); search.type = 'text'; search.placeholder = 'busca…'; search.className = 'dbgpop-search';
    const reset = document.createElement('button'); reset.textContent = '↺ reset'; reset.title = 'repõe os defaults só deste grupo';
    const close = document.createElement('button'); close.textContent = '✕'; close.className = 'dbgpop-close';
    head.appendChild(title); head.appendChild(search); head.appendChild(reset); head.appendChild(close);
    box.appendChild(head);
    const list = document.createElement('div'); list.className = 'dbgpop-list';
    box.appendChild(list);

    for (const name of names) {
      const def = sliderDef[name];
      if (!def) continue; // validateGroups() já avisou; não rebenta a UI
      const [, mn, mx, st, set, get] = def;
      if (PERSIST.has(name)) { const v0 = startValue(name); if (v0 !== undefined) set(v0); }
      const { lab, inp, val } = mkRow(name, mn, mx, st, set, get, { fav: false });
      list.appendChild(lab);
      inputs[name] = inp; vals[name] = val; rows[name] = lab;
    }

    // passo 3: busca por substring (filtra as linhas deste grupo; `includes`, sem acentuar sensibilidade extra)
    search.oninput = () => {
      const q = search.value.trim().toLowerCase();
      for (const name of names) {
        const row = rows[name];
        if (row) row.hidden = q && !name.toLowerCase().includes(q);
      }
    };
    // passo 3: reset por grupo — só as chaves deste grupo, a partir de KNOB_DEFAULTS
    reset.onclick = () => {
      const sub = {};
      for (const name of names) if (name in KNOB_DEFAULTS) sub[name] = KNOB_DEFAULTS[name];
      knobsSet(sub, true);
      knobMsg.textContent = `${gname}: reposto aos defaults`;
    };
    close.onclick = () => closeGroup();

    dbg.appendChild(box);
    groupBoxes[gname] = box;
    groupLists[gname] = list;
  }

  /* Normaliza o localStorage no arranque: passa a ter os mesmos knobs de sempre (nenhum knob novo se
     perde numa sessão futura) e as chaves antigas dos labels renomeados desaparecem já migradas. Só se
     escreve quando havia mesmo algo gravado — numa primeira visita não se cria nada. */
  if (Object.keys(knobStore).length || touched.size) persistAll();

  function knobsGet() {
    const o = {};
    for (const [name, , , , , get] of sliders) if (PERSIST.has(name)) o[name] = get();
    return o;
  }
  function knobsSet(obj, persist) {
    if (!obj || typeof obj !== 'object') return 0;
    const src = migrate(obj);
    let n = 0;
    for (const [name, , , st, set] of sliders) {
      if (!PERSIST.has(name) || !Number.isFinite(src[name])) continue;
      set(src[name]); n++;
      // §Riscos: já não se usa `inp.previousSibling` — referências explícitas nos mapas
      // inputs/vals/favInputs/favVals (popover + faixa de favoritos, quando o nome é um dos 7).
      const txt = fmt(src[name], st);
      const inp = inputs[name]; if (inp) inp.value = src[name];
      const val = vals[name]; if (val) val.value = txt;
      const finp = favInputs[name]; if (finp) finp.value = src[name];
      const fval = favVals[name]; if (fval) fval.value = txt;
      if (persist) touched.add(name);
    }
    // hooks: um ficheiro pode mudar filas/junta/corrente (rebuild) e focos/luz geral/fundo
    if (n) { onRebuildBall(); onSpotsChanged(); onShadeChanged(); onBgGreyChanged(); }
    if (persist) persistAll();
    return n;
  }

  /* `knobsTouched` — quais os knobs que o David mexeu de facto (o `MIRRORBALL.knobs.set` do modo
     música usa isto para não sobrepor o que ele afinou; ver comentário no topo). */
  function knobsTouched() { return [...touched]; }

  // ---- botões (Fase 5: mesma semântica de web/index-v2.html:873-883) ----
  const sp = document.createElement('div'); sp.className = 'sp';
  const knobMsg = document.createElement('div');
  knobMsg.className = 'knobMsg';
  knobMsg.style.cssText = 'margin-top:4px;color:#8a8a8a;font-size:11px';

  /* "repor ficheiro gravado":
       - modo música (?src=music): repõe a secção `ball` do music-config.json (snapshot em knobFile);
       - modo manual (:8095/:8099 sem sidecar): repõe o `knobs-default.json` do spike. */
  const btnFile = document.createElement('button');
  btnFile.textContent = 'repor ficheiro gravado';
  btnFile.disabled = !knobFile && !Object.keys(fileDefaults).length;
  btnFile.onclick = () => {
    const src = knobFile || fileDefaults;
    const from = knobFile ? 'music-config.json' : 'knobs-default.json';
    if (!src || !Object.keys(src).length) { knobMsg.textContent = 'sem ficheiro de knobs'; return; }
    const n = knobsSet(src, true);
    knobMsg.textContent = `${n} knobs repostos de ${from}`;
  };

  const btnDefaults = document.createElement('button');
  btnDefaults.textContent = 'repor knobs (defaults)';
  btnDefaults.onclick = () => {
    knobStore = {}; touched = new Set();
    try { localStorage.removeItem(KEY_KNOBS); localStorage.removeItem(KEY_TOUCHED); } catch (e) { /* */ }
    knobsSet(KNOB_DEFAULTS, false);
    knobMsg.textContent = 'defaults do código repostos (localStorage limpo)';
  };

  /* "gravar":
       - modo manual: descarrega `mb2-knobs.json` com TODOS os knobs (Blob + <a download>);
       - modo música: grava a secção `ball` no music-config.json via MUSIC.tune.save (sidecar). */
  const btnSave = document.createElement('button');
  function syncSaveLabel() {
    const hasMusic = !!(window.MUSIC && window.MUSIC.tune && typeof window.MUSIC.tune.save === 'function');
    btnSave.textContent = hasMusic ? 'gravar (music-config.json)' : 'gravar (ficheiro)';
  }
  syncSaveLabel();
  btnSave.onclick = async () => {
    const T = window.MUSIC && window.MUSIC.tune;
    if (T && typeof T.save === 'function') {
      knobMsg.textContent = 'a gravar…';
      const r = await T.save();
      knobMsg.textContent = r && r.ok ? `gravado em ${r.path}` : `não gravou: ${(r && r.error) || '?'}`;
      return;
    }
    // sem sidecar: download de mb2-knobs.json (knobs + toggles, para reproduzir o estado todo)
    const payload = knobsGet();
    payload.__toggles = togglesGet();
    const blob = new Blob([JSON.stringify(payload, null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'mb2-knobs.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    knobMsg.textContent = `mb2-knobs.json descarregado (${Object.keys(payload).length - 1} knobs)`;
  };

  /* "carregar ficheiro": <input type=file> escondido; lê o JSON e aplica com knobsSet(obj, true). */
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json,application/json';
  fileInput.style.display = 'none';
  fileInput.onchange = async () => {
    const f = fileInput.files && fileInput.files[0];
    if (!f) return;
    try {
      const obj = JSON.parse(await f.text());
      if (!obj || typeof obj !== 'object') throw new Error('JSON não é um objeto');
      // um music-config.json inteiro traz os knobs na secção `ball`
      const knobs = (obj.ball && typeof obj.ball === 'object') ? obj.ball : obj;
      const n = knobsSet(knobs, true);
      const t = togglesSet(knobs.__toggles || obj.__toggles);
      knobMsg.textContent = `${n} knobs${t ? ` + ${t} toggles` : ''} carregados de ${f.name}`;
    } catch (e) {
      knobMsg.textContent = 'ficheiro inválido: ' + (e && e.message);
    } finally {
      fileInput.value = ''; // permite recarregar o MESMO ficheiro outra vez
    }
  };
  const btnLoad = document.createElement('button');
  btnLoad.textContent = 'carregar ficheiro';
  btnLoad.onclick = () => fileInput.click();

  sp.appendChild(btnFile); sp.appendChild(btnDefaults); sp.appendChild(btnSave); sp.appendChild(btnLoad);

  /* ---- checkboxes `spot i` (web/index-v2.html:884-889) → CONFIG.spots[i].on (a SpotLight i apaga) ----
     S8: passam a persistir em localStorage['mb2.toggles'] (antes voltavam sempre a ligadas). */
  const savedToggles = readJSON(KEY_TOGGLES) || {};
  const spotChecks = [];
  const spRow = document.createElement('div'); spRow.className = 'sp';
  CONFIG.spots.forEach((s, i) => {
    const saved = savedToggles.spots && savedToggles.spots[i];
    if (typeof saved === 'boolean') s.on = saved;
    const l = document.createElement('label');
    const c = document.createElement('input'); c.type = 'checkbox'; c.checked = s.on !== false;
    c.onchange = () => { CONFIG.spots[i].on = c.checked; onSpotsChanged(); persistToggles(); };
    l.appendChild(c); l.append(` spot ${i}`); spRow.appendChild(l);
    spotChecks.push(c);
  });
  if (savedToggles.spots) onSpotsChanged();

  // ---- grupo "Ficheiro" (§2 grupo 9): sem sliders — botões gravar/carregar/repor, checkboxes spot
  // 0-5, colunas 1/2/3 e A-/A+ (tamanho de fonte) vivem todos aqui, dentro do popover próprio. ----
  {
    const list = groupLists['Ficheiro'];
    const sz = document.createElement('div'); sz.className = 'sz';
    const mk = (t, fn) => { const b = document.createElement('button'); b.textContent = t; b.onclick = fn; sz.appendChild(b); };
    mk('1 col', () => { dbgSize.cols = 1; applyDbgSize(); });
    mk('2 col', () => { dbgSize.cols = 2; applyDbgSize(); });
    mk('3 col', () => { dbgSize.cols = 3; applyDbgSize(); });
    mk('compacto', () => { dbgSize.compact = !dbgSize.compact; applyDbgSize(); });
    mk('A−', () => { dbgSize.scale = Math.max(0.7, +(dbgSize.scale - 0.1).toFixed(2)); applyDbgSize(); });
    mk('A+', () => { dbgSize.scale = Math.min(1.5, +(dbgSize.scale + 0.1).toFixed(2)); applyDbgSize(); });
    list.appendChild(sz);
    list.appendChild(sp);
    list.appendChild(fileInput);
    list.appendChild(spRow);
    list.appendChild(knobMsg);
    applyDbgSize();
  }

  /* `skin` e `explosões` vivem fora do painel (botões do #ui, teclas w/x) mas são estado do David —
     guardam-se aqui, na mesma chave. `main.js` chama `panel.togglesApply()` depois de criar os
     botões, e `panel.persistToggles()` sempre que os muda. */
  function togglesGet() {
    const t = { spots: CONFIG.spots.map(s => s.on !== false) };
    if (CONFIG.skin === 'dark' || CONFIG.skin === 'white') t.skin = CONFIG.skin;
    try { const x = localStorage.getItem('mb2.explode'); if (x) t.explode = x; } catch (e) { /* */ }
    return t;
  }
  function togglesSet(t) {
    if (!t || typeof t !== 'object') return 0;
    let n = 0;
    if (Array.isArray(t.spots)) {
      t.spots.forEach((on, i) => {
        if (typeof on !== 'boolean' || !CONFIG.spots[i]) return;
        CONFIG.spots[i].on = on;
        if (spotChecks[i]) spotChecks[i].checked = on;
        n++;
      });
      onSpotsChanged();
    }
    if (t.skin === 'dark' || t.skin === 'white') { CONFIG.skin = t.skin; n++; }
    if (t.explode === 'on' || t.explode === 'off') {
      try { localStorage.setItem('mb2.explode', t.explode); } catch (e) { /* */ }
      // o botão #xpl e a máquina da F7 vivem no main.js — avisa-os (o handler lá resincroniza)
      dispatchEvent(new CustomEvent('mb2-xpl-restore', { detail: { on: t.explode === 'on' } }));
      n++;
    }
    if (t.skin === 'dark' || t.skin === 'white') dispatchEvent(new CustomEvent('mb2-skin-restore', { detail: { skin: t.skin } }));
    persistToggles();
    return n;
  }
  function persistToggles() { writeJSON(KEY_TOGGLES, togglesGet()); }
  // skin gravada: aplica-se ANTES de o main.js ler CONFIG.skin para o botão (Regra 1 — é o
  // utilizador que manda na skin, e uma escolha dele tem de sobreviver ao reload).
  if (savedToggles.skin === 'dark' || savedToggles.skin === 'white') CONFIG.skin = savedToggles.skin;

  // ---- faixa de favoritos (§2 "Sempre à mão"): duplica os 7 inputs mais usados ao vivo; oninput
  // liga-se ao MESMO set()/get() do slider original — mkRow() já sincroniza os dois lados. ----
  for (const name of FAVORITES) {
    const def = sliderDef[name];
    if (!def) { console.warn('[MB2] favorito sem slider:', name); continue; }
    const [, mn, mx, st, set, get] = def;
    const { lab, inp, val } = mkRow(name, mn, mx, st, set, get, { fav: true });
    lab.title = name;
    dbgfav.appendChild(lab);
    favInputs[name] = inp; favVals[name] = val;
  }

  // ---- barra inferior de separadores (§2, um botão por grupo) + popover: só um grupo aberto. ----
  let openGroup = null;
  try { openGroup = localStorage.getItem('mb2.dbgOpen') || null; } catch (e) { /* */ }
  const groupBtns = {};
  const groupDots = {};
  function closeGroup() {
    openGroup = null;
    for (const g of groupNames) { groupBoxes[g].hidden = true; setAttr(groupBtns[g], 'aria-expanded', 'false'); }
    dbg.classList.remove('open');
    try { localStorage.setItem('mb2.dbgOpen', ''); } catch (e) { /* */ }
  }
  function openGroupByName(gname) {
    if (!groupBoxes[gname]) return;
    if (openGroup === gname) { closeGroup(); return; }
    openGroup = gname;
    for (const g of groupNames) { groupBoxes[g].hidden = g !== gname; setAttr(groupBtns[g], 'aria-expanded', String(g === gname)); }
    dbg.classList.add('open');
    try { localStorage.setItem('mb2.dbgOpen', gname); } catch (e) { /* */ }
  }
  for (const gname of groupNames) {
    const b = document.createElement('button');
    b.textContent = gname;
    setAttr(b, 'aria-expanded', 'false');
    b.onclick = () => openGroupByName(gname);
    if (gname === 'Motor') b.title = 'só faz efeito com ?src=music (motor de música)';
    const dot = document.createElement('span'); dot.className = 'dot'; dot.hidden = true;
    b.appendChild(dot);
    dbgbar.appendChild(b);
    groupBtns[gname] = b; groupDots[gname] = dot;
  }
  /* ---- fix F10 (encontrado ao verificar os knobs ⟳ novos): reabrir o último grupo no arranque
     chamava openGroupByName(openGroup) com `openGroup` JÁ IGUAL ao nome lido do localStorage (linha
     789) — o guard "if (openGroup === gname) closeGroup()" de openGroupByName (pensado para o CLIQUE
     alternar fechar/abrir) via os dois iguais e fechava o grupo imediatamente a seguir a abri-lo. Na
     prática: o grupo aberto ao recarregar a página NUNCA ficava visível, e os sliders desse grupo
     só recebiam `startValue()`/`set(v0)` (a aplicação do localStorage, mkGroup() acima) se o David
     voltasse a clicar no separador — ou seja, um knob ⟳ (ex.: 'sala: pé-direito', qualquer 'pilares:
     *') só "pegava" na geometria construída ao arranque numa 2ª visita ao grupo + 2º reload. Zera-se
     `openGroup` ANTES de chamar openGroupByName para o guard do clique não disparar na reabertura. */
  if (openGroup && groupBoxes[openGroup]) { const g0 = openGroup; openGroup = null; openGroupByName(g0); }

  // grupo Motor esmaecido sem ?src=music (passo 3 do brief): só serve quando o motor de música manda.
  if (!(window.MUSIC)) { groupBtns['Motor'].style.opacity = '.5'; }

  // passo 3: ponto "por gravar" no separador — acende quando algum knob do grupo diverge do knobFile
  // (ou dos defaults, se não há ficheiro carregado ainda). Recalcula-se a cada oninput via persistAll.
  function refreshDirtyDots() {
    const baseline = (knobFile && Object.keys(knobFile).length) ? knobFile : fileDefaults;
    for (const [gname, names] of GROUPS) {
      let dirty = false;
      for (const name of names) {
        if (!PERSIST.has(name)) continue;
        const def = sliderDef[name]; if (!def) continue;
        const cur = def[5]();
        const base = baseline[name];
        if (Number.isFinite(base) && Number.isFinite(cur) && Math.abs(cur - base) > 1e-6) { dirty = true; break; }
      }
      if (groupDots[gname]) groupDots[gname].hidden = !dirty;
    }
  }
  const _persistAll = persistAll;
  persistAll = function () { _persistAll(); refreshDirtyDots(); };
  refreshDirtyDots();

  /* ---- F11 (David, 2026-09-01): mostrar/esconder o painel TODO, com estado persistido ----
     `setPanelVisible(on)` é a única porta: mexe nos 3 elementos juntos (popover `#dbg`, barra de
     separadores `#dbgbar`, faixa de favoritos `#dbgfav`) e grava em `localStorage['mb2.panelOn']`.
     Antes a tecla `d` fazia o toggle mas NÃO gravava — a cada reload o painel voltava a tapar o
     canto, que é a queixa do David.
     TECLAS: `k` (dedicada, nova — estava livre) e `d` (a de sempre, mantida por memória muscular).
     Mapa de teclas já ocupadas no spike v2 e no motor, para referência de quem vier a seguir:
        h HUD · d painel · k painel (nova) · w skin · x/X explosão · 0 repor câmara
        m HUD do motor · p perfil · g gerador sintético · n próxima fase (todas em web/music.js)
     `e` (HUD de emoções) não existe no spike, mas fica reservada por paridade com a bola 2D. */
  function setPanelVisible(on) {
    panelOn = !!on;
    dbg.classList.toggle('on', panelOn);
    dbgbar.classList.toggle('on', panelOn);
    dbgfav.classList.toggle('on', panelOn);
    if (!panelOn) closeGroup();
    try { localStorage.setItem('mb2.panelOn', panelOn ? 'on' : 'off'); } catch (e) { /* sem storage */ }
  }
  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTypingTarget(e.target)) return;
    if (e.key === 'd' || e.key === 'D' || e.key === 'k' || e.key === 'K') setPanelVisible(!panelOn);
  });
  function isTypingTarget(t) { return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'); }
  // estado inicial: a barra/faixa seguem o `panelOn` lido do localStorage (ver o bloco acima).
  dbgbar.classList.toggle('on', panelOn); dbgfav.classList.toggle('on', panelOn);

  // bónus (brief F4 §7): sliders re-lêem CONFIG quando este é escrito pela consola/motor — chama-se
  // `get()` de cada slider e escreve-se no input, sem passar por `set()` (não reescreve o CONFIG).
  function refresh() {
    for (const [name, , , st, , get] of sliders) {
      const v = get();
      if (!Number.isFinite(v)) continue;
      const txt = fmt(v, st);
      const inp = inputs[name]; if (inp) inp.value = v;
      const val = vals[name]; if (val) val.value = txt;
      const finp = favInputs[name]; if (finp) finp.value = v;
      const fval = favVals[name]; if (fval) fval.value = txt;
    }
  }

  // Fase 5: `music.js` chama `window.MIRRORBALL.knobs.set(j.ball)` ao carregar o music-config.json
  // (web/music.js:783) — isso já aplica os valores (via knobsSet acima), mas o botão "repor ficheiro
  // gravado" precisa de guardar o snapshot ORIGINAL do ficheiro para poder repor depois de o David
  // ter mexido nos sliders. `setKnobFile` é chamado pelo bloco `// ---- F5 music ----` do main.js.
  function setKnobFile(obj) {
    knobFile = (obj && typeof obj === 'object') ? obj : null;
    btnFile.disabled = !knobFile && !Object.keys(fileDefaults).length;
    syncSaveLabel(); // com música, o botão passa a "gravar (music-config.json)"
    refreshDirtyDots(); // a "baseline" do ponto por-gravar mudou
  }

  return {
    sliders, PERSIST, KNOB_DEFAULTS, knobsGet, knobsSet, knobsTouched, setKnobFile,
    get knobFile() { return knobFile; }, get fileDefaults() { return fileDefaults; },
    togglesGet, togglesSet, persistToggles, syncSaveLabel,
    dbgSize, inputs, vals, favInputs, favVals, GROUPS, FAVORITES, openGroupByName, closeGroup, refresh,
  };
}
