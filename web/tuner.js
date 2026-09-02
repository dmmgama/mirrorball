/* tuner.js — painel de calibração AO VIVO da bola (tecla `k`).
 *
 * Porquê existe: "esses knobs se não for em tempo real não me ajudam" (David). Afinar o motor
 * implicava editar `music.js` e recarregar a página — com música a tocar, isso é inútil. Este
 * painel escreve DIRETO no CONFIG vivo, a bola reage no frame seguinte, e um botão grava o
 * resultado num `music-config.json` que o motor volta a carregar no arranque.
 *
 * Onde vive cada coisa:
 *   · o ESQUEMA dos knobs (caminhos, ranges, rótulos) está em `music.js` §TUNE — uma só fonte
 *     de verdade, partilhada pelo painel e pelo validador do ficheiro. Este ficheiro só desenha.
 *   · os TETOS do CLAUDE.md (beamIntensity ≤ 0.18, nada acima de 3 Hz) são os `max` dos ranges
 *     do esquema: o slider não chega lá acima. A skin não está no painel de propósito (regra 1).
 *
 * INERTE fora do modo música: sem `window.MUSIC` (a bola manual/câmara não carrega o motor) o
 * ficheiro não cria nada, não regista teclas e não custa nada.
 */
'use strict';
(() => {
  const M = window.MUSIC;
  if (!M || !M.tune || typeof document === 'undefined') return;   // não é modo música: inerte
  const T = M.tune;                                               // API exposta pelo music.js

  /* ---------------- S2 (f16-sync §3): knobs `sync` — secção LOCAL deste painel ----------------
   * O esquema §TUNE do `music.js` é fechado (o `coerceKnob` só aceita caminhos do mapa construído
   * ao carregar), e a S2 não pode tocar no `music.js` (W3 corre em paralelo no mesmo ficheiro).
   * Por isso estes knobs vivem em `MUSIC.config.sync` — criado AQUI com os defaults do research —
   * e são lidos pelo `stardom.js` por poll (com os mesmos defaults se o painel não existir).
   * Persistência: localStorage `mb.tune.sync` (o `save` do ficheiro só serializa o esquema do
   * motor). Quando o `music.js` passar a ter `sync` no §TUNE (S1/S4), esta secção DESAPARECE
   * sozinha: o `if (!T.schema.sync)` abaixo deixa de entrar e o ficheiro passa a mandar. */
  const SYNC_LS = 'mb.tune.sync';
  const SYNC_SEC = {
    label: 'Sync (sala) — S2',
    knobs: [
      { path: 'sync.allOnReservePhrases', range: [2, 16],  step: 1,    label: 'all-on reserva (frases)', def: 8 },
      { path: 'sync.breakdownBallHero',   range: [0, 1],   step: 1,    label: 'breakdown bola protagonista (0/1)', def: 0 },
      { path: 'sync.breakdownWash',       range: [0, 1],   step: 0.05, label: 'breakdown wash', def: 0.3 },
    ],
  };
  const CFG = M.config || null;
  const useLocalSync = !!(CFG && !T.schema.sync);
  if (useLocalSync) {
    if (!CFG.sync || typeof CFG.sync !== 'object') CFG.sync = {};
    for (const k of SYNC_SEC.knobs) {
      const key = k.path.split('.')[1];
      if (!Number.isFinite(CFG.sync[key])) CFG.sync[key] = k.def;   // regra 7: valor inicial finito
    }
    try {
      const saved = JSON.parse(localStorage.getItem(SYNC_LS) || 'null');
      if (saved && typeof saved === 'object') for (const k of SYNC_SEC.knobs) {
        const key = k.path.split('.')[1];
        const v = Number(saved[key]);
        if (Number.isFinite(v)) CFG.sync[key] = Math.min(k.range[1], Math.max(k.range[0], v));
      }
    } catch (e) { /* localStorage indisponível: defaults */ }
  }
  const isSync = (path) => useLocalSync && path.startsWith('sync.');
  const syncKey = (path) => path.split('.')[1];
  const syncGet = (path) => CFG.sync[syncKey(path)];
  function syncSet(path, v) {
    const k = SYNC_SEC.knobs.find(x => x.path === path);
    if (!k || !Number.isFinite(v)) return false;
    CFG.sync[syncKey(path)] = Math.min(k.range[1], Math.max(k.range[0], v));
    try {
      const o = {}; for (const kk of SYNC_SEC.knobs) o[syncKey(kk.path)] = CFG.sync[syncKey(kk.path)];
      localStorage.setItem(SYNC_LS, JSON.stringify(o));
    } catch (e) { /* sem persistência: fica só na sessão */ }
    return true;
  }
  const syncDef = (path) => { const k = SYNC_SEC.knobs.find(x => x.path === path); return k ? k.def : 0; };
  // acessores unificados: caminho `sync.*` local, resto pelo motor
  const kGet = (path) => (isSync(path) ? syncGet(path) : T.get(path));
  const kSet = (path, v) => (isSync(path) ? syncSet(path, v) : T.set(path, v));
  const kDef = (path) => (isSync(path) ? syncDef(path) : T.defaults[path]);

  /* ---------------- estilo: o mesmo vocabulário do HUD `m` e dos sliders `d` ---------------- */
  const css = `
  #tun{position:fixed;top:12px;left:12px;width:300px;max-height:88vh;overflow-y:auto;
       background:rgba(10,10,10,.90);color:#cfcfcf;font:11px/1.5 ui-monospace,Consolas,monospace;
       padding:10px 12px;border:1px solid #2a2a2a;display:none;z-index:10;letter-spacing:.02em}
  #tun.on{display:block}
  #tun h4{margin:0 0 6px;font-weight:400;color:#8a8a8a}
  #tun .sec{margin:8px 0 4px;color:#8a8a8a;cursor:pointer;user-select:none;border-top:1px solid #222;padding-top:6px}
  #tun .sec:first-of-type{border-top:0}
  #tun .body{display:block}
  #tun .body.off{display:none}
  #tun .row{display:flex;align-items:center;gap:6px;margin:2px 0}
  #tun .row .nm{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  #tun .row.mod .nm{color:#fff}
  #tun input[type=range]{width:96px;accent-color:#bdbdbd;flex:0 0 auto}
  #tun .vl{flex:0 0 46px;text-align:right;color:#e0e0e0}
  #tun .df{flex:0 0 40px;text-align:right;color:#6a6a6a;font-size:10px}
  #tun .path{color:#777;word-break:break-all;margin:4px 0;font-size:10px;line-height:1.4}
  #tun .btns{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
  #tun button{background:#111;color:#cfcfcf;border:1px solid #2a2a2a;font:11px ui-monospace,Consolas,monospace;
              padding:5px 9px;cursor:pointer;letter-spacing:.02em}
  #tun button:hover{border-color:#3d3d3d}
  #tun button:disabled{opacity:.45;cursor:default}
  #tun button.ok{border-color:#3f5f3f;color:#bfe0bf}
  #tun button.err{border-color:#6a3a3a;color:#e8b8b8}
  #tun select{background:#111;color:#cfcfcf;border:1px solid #2a2a2a;font:11px ui-monospace,Consolas,monospace;padding:3px 4px;width:100%}
  #tun .st{color:#8a8a8a;margin-top:6px;font-size:10px;line-height:1.5}
  #tun .warn{color:#d8b88a}
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const el = document.createElement('div');
  el.id = 'tun';
  document.body.appendChild(el);

  const fmt = (v, step) => (step >= 1 ? String(Math.round(v)) : v.toFixed(step >= 0.05 ? 2 : 3));

  /* ---------------- construção ---------------- */
  const head = document.createElement('h4');
  head.textContent = 'calibração ao vivo (k)';
  el.appendChild(head);

  // Caminho do detetor ativo: enquanto o sidecar não reiniciar, os knobs do detetor não fazem
  // nada visível. Dizê-lo aqui evita a conclusão errada de que "o painel não funciona".
  const pathLine = document.createElement('div');
  pathLine.className = 'st';
  el.appendChild(pathLine);

  const rows = [];
  const SECTIONS = Object.entries(T.schema).concat(useLocalSync ? [['sync', SYNC_SEC]] : []);
  for (const [secKey, sec] of SECTIONS) {
    const h = document.createElement('div');
    h.className = 'sec';
    const body = document.createElement('div');
    body.className = 'body';
    let open = true;
    const drawHead = () => { h.textContent = (open ? '▾ ' : '▸ ') + sec.label; };
    h.onclick = () => { open = !open; body.classList.toggle('off', !open); drawHead(); };
    drawHead();
    el.appendChild(h);
    el.appendChild(body);

    for (const k of sec.knobs) {
      const row = document.createElement('div');
      row.className = 'row';
      const nm = document.createElement('span');
      nm.className = 'nm'; nm.textContent = k.label; nm.title = k.path;
      const inp = document.createElement('input');
      inp.type = 'range';
      inp.min = k.range[0]; inp.max = k.range[1]; inp.step = k.step;
      const vl = document.createElement('span'); vl.className = 'vl';
      const df = document.createElement('span'); df.className = 'df';
      df.textContent = fmt(kDef(k.path), k.step);
      df.title = 'valor por defeito no código';
      // input = a cada gesto, escreve JÁ no CONFIG vivo. É o ponto todo do painel.
      inp.addEventListener('input', () => {
        kSet(k.path, parseFloat(inp.value));
        sync();
      });
      row.appendChild(nm); row.appendChild(inp); row.appendChild(vl); row.appendChild(df);
      body.appendChild(row);
      rows.push({ k, inp, vl, row });
    }
    void secKey;
  }

  /* ---------------- destino do ficheiro ---------------- */
  const dstHead = document.createElement('div');
  dstHead.className = 'sec'; dstHead.style.cursor = 'default';
  dstHead.textContent = 'ficheiro de dados';
  el.appendChild(dstHead);

  const sel = document.createElement('select');
  sel.title = 'onde gravar o music-config.json';
  el.appendChild(sel);

  // O caminho ABSOLUTO, sempre visível: era a queixa ("senão isso fica aí perdido").
  const pathEl = document.createElement('div');
  pathEl.className = 'path';
  el.appendChild(pathEl);

  const btns = document.createElement('div');
  btns.className = 'btns';
  const bSave = document.createElement('button'); bSave.textContent = 'save';
  const bReset = document.createElement('button'); bReset.textContent = 'reset';
  const bCopy = document.createElement('button'); bCopy.textContent = 'copiar caminho';
  btns.appendChild(bSave); btns.appendChild(bReset); btns.appendChild(bCopy);
  el.appendChild(btns);

  const stEl = document.createElement('div');
  stEl.className = 'st';
  el.appendChild(stEl);

  let flash = 0, flashCls = '';
  function setFlash(cls, txt) {
    flashCls = cls; bSave.textContent = txt; bSave.className = cls;
    flash = Date.now() + 2200;
  }

  bSave.onclick = async () => {
    if (!T.state.canSave) return;
    bSave.disabled = true; bSave.textContent = 'a gravar…';
    const r = await T.save(sel.value || undefined);
    bSave.disabled = false;
    if (r && r.ok) setFlash('ok', 'gravado ✓'); else setFlash('err', (r && r.error) || 'falhou');
    sync();
  };
  bReset.onclick = () => {
    T.reset();
    if (useLocalSync) for (const k of SYNC_SEC.knobs) syncSet(k.path, k.def);
    sync();
  };
  bCopy.onclick = async () => {
    const p = T.state.path || '(sem ficheiro)';
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(p);
      else { const t = document.createElement('textarea'); t.value = p; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
      bCopy.textContent = 'copiado ✓';
    } catch (e) { bCopy.textContent = 'sem clipboard'; }
    setTimeout(() => { bCopy.textContent = 'copiar caminho'; }, 1600);
  };

  let lastLocSig = '';
  function syncLocations() {
    const locs = T.state.locations || [];
    const sig = locs.map(l => `${l.id}:${l.exists}`).join('|') + '/' + T.state.active;
    if (sig === lastLocSig) return;
    lastLocSig = sig;
    sel.innerHTML = '';
    if (!locs.length) {
      const o = document.createElement('option');
      o.value = ''; o.textContent = 'sidecar não disponível';
      sel.appendChild(o); sel.disabled = true;
      return;
    }
    sel.disabled = false;
    for (const l of locs) {
      const o = document.createElement('option');
      o.value = l.id;
      o.textContent = `${l.label}${l.exists ? ' ·' : ''}`;
      sel.appendChild(o);
    }
    sel.value = T.state.active || locs[0].id;
  }
  sel.onchange = () => { pathEl.textContent = pathForId(sel.value); };
  function pathForId(id) {
    const l = (T.state.locations || []).find(x => x.id === id);
    return l ? l.path : (T.state.path || '(sem sidecar — grava-se pelo sidecar em /app/)');
  }

  /* ---------------- sincronização (chamada pelo motor e a cada gesto) ---------------- */
  function sync() {
    if (!el.classList.contains('on')) return;
    for (const r of rows) {
      const v = kGet(r.k.path);
      const n = typeof v === 'number' && isFinite(v) ? v : kDef(r.k.path);
      if (document.activeElement !== r.inp) r.inp.value = n;
      r.vl.textContent = fmt(n, r.k.step);
      r.row.classList.toggle('mod', Math.abs(n - kDef(r.k.path)) > 1e-9);
    }
    syncLocations();
    if (document.activeElement !== sel) pathEl.textContent = pathForId(sel.value || T.state.active);

    const det = T.detectorPath();
    pathLine.innerHTML = det === 'raw'
      ? 'detetor: <b>raw</b> (subFluxRaw do sidecar)'
      : '<span class="warn">detetor: fallback — os knobs do Detetor só agem depois de reiniciar o sidecar</span>';

    if (flash && Date.now() > flash) { flash = 0; bSave.className = ''; bSave.textContent = 'save'; }
    bSave.disabled = !T.state.canSave || T.state.saving;
    const dirty = T.dirtyCount();
    stEl.innerHTML =
      `${T.state.loaded ? 'carregado: ' + (T.state.msg || '') : (T.state.msg || 'defaults do código')}<br>` +
      (dirty ? `<span class="warn">${dirty} knob(s) alterados — por gravar</span>` : 'sem alterações por gravar') +
      (T.state.canSave ? '' : '<br><span class="warn">save só quando servida pelo sidecar (/app/)</span>');
    if (useLocalSync) stEl.innerHTML += '<br>knobs «Sync (sala)»: guardados no browser (localStorage), não no ficheiro';
    void flashCls;
  }

  // O motor chama isto quando o ficheiro acaba de carregar (o fetch é assíncrono).
  M.tunerSync = sync;

  addEventListener('keydown', (ev) => {
    if (!ev || !ev.key || ev.key.toLowerCase() !== 'k') return;
    const t = ev.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    el.classList.toggle('on');
    sync();
  });

  // Enquanto aberto, segue o CONFIG a 4 Hz: knobs mexidos por outra via (reset, ficheiro
  // carregado tarde) aparecem sem ser preciso fechar e abrir.
  setInterval(() => { if (el.classList.contains('on')) sync(); }, 250);
})();
