/* core.js — helpers partilhados entre a bola (index-v2.html) e as fontes que a controlam
 * (emotion-v2.js = câmara, music.js = áudio, no futuro).
 *
 * MB_CORE: funções puras de easing/interpolação, copiadas sem alterar semântica das cópias
 * locais que existiam em emotion-v2.js (clamp/lerp/smooth/anchor/ease). `contrast` fica de fora
 * de propósito — é específico da curva de emoções, não um helper genérico.
 *
 * MB_SOURCE: arbitragem de fonte. Só o dono (`owner`) escreve em `window.MIRRORBALL.config`;
 * `manual` = ninguém escreve — o painel de debug (tecla `d`) e o botão de skin mandam, como a
 * bola faz hoje. `camera` = emotion-v2.js escreve. `music` = music.js escreve (futuro).
 * Fonte inicial: query param `?src=` se for um valor válido, senão `manual`. Troca também por
 * postMessage do pai `{ type: 'source', value: 'camera'|'music'|'manual' }` — loopback local,
 * por isso aceita-se qualquer origem.
 */
'use strict';
(function () {

  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  function anchor(k, t) { return t >= 0 ? lerp(k[1], k[2], t) : lerp(k[1], k[0], -t); }
  function ease(cur, tgt, tau, dt) { const t = tgt > cur ? tau[0] : tau[1]; return cur + (tgt - cur) * (1 - Math.exp(-dt / t)); }

  window.MB_CORE = { clamp, lerp, smooth, anchor, ease };

  const VALID = ['manual', 'camera', 'music'];
  function initialOwner() {
    try {
      const q = new URLSearchParams(location.search).get('src');
      if (q && VALID.indexOf(q) !== -1) return q;
    } catch (e) { /* location indisponível (ex.: vm de teste) */ }
    return 'manual';
  }

  const listeners = [];
  const SRC = {
    owner: initialOwner(),
    set(name) {
      if (VALID.indexOf(name) === -1 || name === this.owner) return;
      this.owner = name;
      for (const fn of listeners) { try { fn(name); } catch (e) { console.error('[MB_SOURCE]', e); } }
    },
    on(fn) { if (typeof fn === 'function') listeners.push(fn); },
  };
  window.MB_SOURCE = SRC;

  if (typeof addEventListener === 'function') {
    addEventListener('message', e => {
      const d = e && e.data;
      if (d && d.type === 'source') SRC.set(d.value);
    });
  }

})();
