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

export function initPanel(CONFIG, hooks = {}) {
  const noop = () => {};
  const onRebuildBall = hooks.onRebuildBall || noop;
  const onSpotsChanged = hooks.onSpotsChanged || noop;
  const onShadeChanged = hooks.onShadeChanged || noop;
  const onBgGreyChanged = hooks.onBgGreyChanged || noop;

  const CH = CONFIG.choreo, AMB = CONFIG.ambient;
  let health = 1; // placeholder local (não há motor de música nesta fase — knob 'health' fica mecânico)

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
    ['flash: por s (só manual)', 0, 6, 0.1, v => CH.flashRate = v, () => CH.flashRate],
    ['flash: raio ×', 0.2, 3, 0.05, v => { const b = 0.14; CH.flashRadius[0] = b * 0.7 * v; CH.flashRadius[1] = b * 1.3 * v; }, () => CH.flashRadius[1] / (0.14 * 1.3)],
    ['flash: dura ms (só manual)', 40, 600, 10, v => { CH.flashLen[0] = v * 0.6 / 1000; CH.flashLen[1] = v * 1.4 / 1000; }, () => CH.flashLen[1] * 1000 / 1.4],
    ['bola: luz', 0, 1, 0.02, v => CONFIG.ballLight = v, () => CONFIG.ballLight],
    ['bola: contraste', 0.5, 2.5, 0.05, v => CONFIG.ballContrast = v, () => CONFIG.ballContrast],
    ['luz geral (volume)', 0, 1, 0.05, v => { CONFIG.shade.key = v; onShadeChanged(); }, () => CONFIG.shade.key],
    ['luz geral: az°', -180, 180, 5, v => { CONFIG.shade.az = v; onShadeChanged(); }, () => CONFIG.shade.az],
    ['luz geral: el°', -60, 90, 5, v => { CONFIG.shade.el = v; onShadeChanged(); }, () => CONFIG.shade.el],
    ['auréola (fase 3)', 0, 1, 0.05, v => CONFIG.halo = v, () => CONFIG.halo],
    ['fundo: claridade (dark)', 0, 60, 1, v => { CONFIG.bgGrey = v; onBgGreyChanged(); }, () => CONFIG.bgGrey],
    ['strobe fundo (0/1) (fase 4)', 0, 1, 1, v => CONFIG.strobe.enabled = v >= 1, () => CONFIG.strobe.enabled ? 1 : 0],
    ['strobe: frequência × (fase 4)', 0, 3, 0.1, v => CONFIG.strobeRate = v, () => CONFIG.strobeRate],
    ['pontos na parede (densidade) (fase 4)', 0, 3, 0.05, v => CONFIG.dotDensity = v, () => CONFIG.dotDensity],
    ['strobe: força (fase 4)', 0, 1, 0.05, v => CONFIG.strobe.level = v, () => CONFIG.strobe.level],
    ['strobe: dura ms (fase 4)', 20, 200, 5, v => CONFIG.strobe.lenMs = v, () => CONFIG.strobe.lenMs],
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
    ['focos+flashes: motor manda (0/1) (fase 5)', 0, 1, 1, v => CONFIG.spotsMotor = !!v, () => CONFIG.spotsMotor ? 1 : 0],
    ['opacidade: motor manda (0/1)', 0, 1, 1, v => CONFIG.opacityMotor = !!v, () => CONFIG.opacityMotor ? 1 : 0],
    ['sphereOpacity (motor manda)', 0, 1, 0.01, v => CONFIG.sphereOpacity = v, () => CONFIG.sphereOpacity],
    ['health (motor manda) (fase 5)', 0, 1, 0.01, v => health = v, () => health],
  ];

  // índice onde termina o bloco "focos" original (antes de 'rotationRpm') — usado para o PERSIST,
  // igual à regra da bola Canvas 2D (:845): tudo até ao bloco '---- bola' persiste.
  const rotationIdx = sliders.findIndex(x => x[0].startsWith('rotationRpm'));
  const PERSIST = new Set(
    sliders.slice(0, rotationIdx).map(x => x[0]).concat([
      'haze máx (motor modula)',
      'feixes+haze: motor manda (0/1)',
      'focos+flashes: motor manda (0/1) (fase 5)',
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

  let knobFile = null; // secção `ball` do music-config.json (ainda não carregado nesta fase — fica pronto para a Fase 5)
  let knobStore = {};
  try { knobStore = JSON.parse(localStorage.getItem('mb2.knobs') || '{}') || {}; } catch (e) { /* sem storage */ }

  const KNOB_DEFAULTS = {}; // valores do código, capturados ANTES de aplicar localStorage
  for (const [name, , , , , get] of sliders) if (PERSIST.has(name)) KNOB_DEFAULTS[name] = get();

  const inputs = {};
  for (const [name, mn, mx, st, set, get] of sliders) {
    if (PERSIST.has(name) && Number.isFinite(knobStore[name])) set(knobStore[name]);
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
        knobStore[name] = +inp.value;
        try { localStorage.setItem('mb2.knobs', JSON.stringify(knobStore)); } catch (e) { /* */ }
      }
    };
    lab.appendChild(val); lab.appendChild(inp);
    knobsBox.appendChild(lab);
    inputs[name] = inp;
  }

  function knobsGet() {
    const o = {};
    for (const [name, , , , , get] of sliders) if (PERSIST.has(name)) o[name] = get();
    return o;
  }
  function knobsSet(obj, persist) {
    if (!obj || typeof obj !== 'object') return 0;
    let n = 0;
    for (const [name, , , st, set] of sliders) {
      if (!PERSIST.has(name) || !Number.isFinite(obj[name])) continue;
      set(obj[name]); n++;
      const inp = inputs[name];
      if (inp) { inp.value = obj[name]; inp.previousSibling.textContent = (+obj[name]).toFixed(st < 0.1 ? 2 : st < 1 ? 1 : 0); }
      if (persist) knobStore[name] = obj[name];
    }
    if (persist) { try { localStorage.setItem('mb2.knobs', JSON.stringify(knobStore)); } catch (e) { /* */ } }
    return n;
  }

  // ---- botões ----
  const sp = document.createElement('div'); sp.className = 'sp';
  const btnFile = document.createElement('button');
  btnFile.textContent = 'repor ficheiro gravado';
  btnFile.disabled = !knobFile; // Fase 5 liga o carregamento do music-config.json
  btnFile.onclick = () => { if (knobFile) knobsSet(knobFile, true); };

  const btnDefaults = document.createElement('button');
  btnDefaults.textContent = 'repor knobs (defaults)';
  btnDefaults.onclick = () => {
    knobStore = {};
    try { localStorage.removeItem('mb2.knobs'); } catch (e) { /* */ }
    knobsSet(KNOB_DEFAULTS, false);
  };

  const btnSave = document.createElement('button');
  btnSave.textContent = 'gravar';
  btnSave.disabled = true; // desativado até à Fase 5 (sidecar /app-config)

  sp.appendChild(btnFile); sp.appendChild(btnDefaults); sp.appendChild(btnSave);
  dbg.appendChild(sp);

  // ---- checkboxes `spot i` (web/index-v2.html:884-889) → CONFIG.spots[i].on (a SpotLight i apaga) ----
  const spRow = document.createElement('div'); spRow.className = 'sp';
  CONFIG.spots.forEach((s, i) => {
    const l = document.createElement('label');
    const c = document.createElement('input'); c.type = 'checkbox'; c.checked = s.on !== false;
    c.onchange = () => { CONFIG.spots[i].on = c.checked; onSpotsChanged(); };
    l.appendChild(c); l.append(` spot ${i}`); spRow.appendChild(l);
  });
  dbg.appendChild(spRow);

  addEventListener('keydown', (e) => {
    if (e.key === 'd' && !isTypingTarget(e.target)) dbg.classList.toggle('on');
  });
  function isTypingTarget(t) { return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'); }

  return { sliders, PERSIST, KNOB_DEFAULTS, knobsGet, knobsSet, dbgSize };
}
