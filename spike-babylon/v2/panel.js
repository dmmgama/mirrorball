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
  const onRebuildBall = hooks.onRebuildBall || noop;
  const onSpotsChanged = hooks.onSpotsChanged || noop;
  const onShadeChanged = hooks.onShadeChanged || noop;
  const onBgGreyChanged = hooks.onBgGreyChanged || noop;

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
  ];
  for (const s of newSliders) { sliders.push(s); PERSIST.add(s[0]); }

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

  // ---- DOM: mesmo #dbg do web/index-v2.html, mas construído aqui (v2/index.html só tem o container) ----
  const dbg = document.getElementById('dbg');
  dbg.innerHTML = '';
  dbg.classList.add('on'); // painel visível por omissão nesta fase (spike); tecla d alterna

  let dbgSize = { cols: 1, scale: 1 };
  try { Object.assign(dbgSize, JSON.parse(localStorage.getItem('mb2.dbgSize') || '{}')); } catch (e) { /* sem storage */ }
  function applyDbgSize() {
    dbg.style.setProperty('--dbgCols', dbgSize.cols);
    dbg.style.setProperty('--dbgScale', dbgSize.scale);
    try { localStorage.setItem('mb2.dbgSize', JSON.stringify(dbgSize)); } catch (e) { /* */ }
  }
  {
    const sz = document.createElement('div'); sz.className = 'sz';
    const mk = (t, fn) => { const b = document.createElement('button'); b.textContent = t; b.onclick = fn; sz.appendChild(b); };
    mk('1 col', () => { dbgSize.cols = 1; applyDbgSize(); });
    mk('2 col', () => { dbgSize.cols = 2; applyDbgSize(); });
    mk('3 col', () => { dbgSize.cols = 3; applyDbgSize(); });
    mk('A−', () => { dbgSize.scale = Math.max(0.7, +(dbgSize.scale - 0.1).toFixed(2)); applyDbgSize(); });
    mk('A+', () => { dbgSize.scale = Math.min(1.5, +(dbgSize.scale + 0.1).toFixed(2)); applyDbgSize(); });
    dbg.appendChild(sz);
    applyDbgSize();
  }

  const h = document.createElement('h4'); h.textContent = 'MirrorBall v2 — painel d (spike Babylon)';
  dbg.appendChild(h);

  const knobsBox = document.createElement('div'); knobsBox.className = 'knobs';
  dbg.appendChild(knobsBox);

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

  const inputs = {};
  for (const [name, mn, mx, st, set, get] of sliders) {
    if (PERSIST.has(name)) {
      const v0 = startValue(name);
      if (v0 !== undefined) set(v0);
    }
    const lab = document.createElement('label');
    lab.innerHTML = `<span>${name}</span>`;
    const val = document.createElement('b');
    val.style.cssText = 'min-width:44px;text-align:right;font-weight:normal;color:#9a9a9a';
    const inp = document.createElement('input');
    inp.type = 'range'; inp.min = mn; inp.max = mx; inp.step = st; inp.value = get();
    val.textContent = (+inp.value).toFixed(st < 0.1 ? 2 : st < 1 ? 1 : 0);
    inp.oninput = () => {
      set(+inp.value);
      val.textContent = (+inp.value).toFixed(st < 0.1 ? 2 : st < 1 ? 1 : 0);
      if (PERSIST.has(name)) {
        touched.add(name);
        persistAll();   // grava TODOS os knobs, não só este (senão os novos perdem-se)
      }
    };
    lab.appendChild(val); lab.appendChild(inp);
    knobsBox.appendChild(lab);
    inputs[name] = inp;
  }

  /* Normaliza o localStorage no arranque: passa a ter os 98 knobs (nenhum knob novo se perde numa
     sessão futura) e as chaves antigas dos labels renomeados desaparecem já migradas. Só se escreve
     quando havia mesmo algo gravado — numa primeira visita não se cria nada. */
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
      const inp = inputs[name];
      if (inp) { inp.value = src[name]; inp.previousSibling.textContent = (+src[name]).toFixed(st < 0.1 ? 2 : st < 1 ? 1 : 0); }
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
  dbg.appendChild(sp); dbg.appendChild(fileInput); dbg.appendChild(knobMsg);

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
  dbg.appendChild(spRow);
  if (savedToggles.spots) onSpotsChanged();

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

  addEventListener('keydown', (e) => {
    if (e.key === 'd' && !isTypingTarget(e.target)) dbg.classList.toggle('on');
  });
  function isTypingTarget(t) { return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'); }

  // bónus (brief F4 §7): sliders re-lêem CONFIG quando este é escrito pela consola/motor — chama-se
  // `get()` de cada slider e escreve-se no input, sem passar por `set()` (não reescreve o CONFIG).
  function refresh() {
    for (const [name, , , st, , get] of sliders) {
      const inp = inputs[name];
      if (!inp) continue;
      const v = get();
      if (!Number.isFinite(v)) continue;
      inp.value = v;
      const val = inp.previousSibling;
      if (val) val.textContent = (+v).toFixed(st < 0.1 ? 2 : st < 1 ? 1 : 0);
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
  }

  return {
    sliders, PERSIST, KNOB_DEFAULTS, knobsGet, knobsSet, knobsTouched, setKnobFile,
    get knobFile() { return knobFile; }, get fileDefaults() { return fileDefaults; },
    togglesGet, togglesSet, persistToggles, syncSaveLabel,
    dbgSize, inputs, refresh,
  };
}
