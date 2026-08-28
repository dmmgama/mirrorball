/* bridge.js — envia os parâmetros da bola para o hardware.
 *
 * Dois transportes, mesmo protocolo de texto (1 linha, ~20×/s):
 *   S<rpm×100> B<0-255 brilho> H<0-255 haze> V<-100..100 valência> A<0-100 arousal> L<0-100 health>\n
 *   ex: "S120 B200 H166 V45 A30 L100"
 *
 *   1) Web Serial (USB) — Chrome/Edge, botão "ligar USB". Sem servidor.
 *   2) WebSocket (Wi-Fi) — ?ws=ws://192.168.1.50:81 no URL, liga sozinho.
 * Sem hardware ligado, faz apenas log (1×/s) — a bola virtual funciona na mesma.
 */
'use strict';

const BRIDGE = (() => {
  let writer = null, ws = null, mode = 'none', lastSend = 0, lastLog = 0, lastLine = '';
  const SEND_EVERY_MS = 50;

  function encode(o) {
    const bright = Math.round(255 * Math.min(1, o.spotGain / 1.6) * o.health);
    return `S${Math.round(o.rpm * 100)} B${bright} H${Math.round(o.haze * 255)} ` +
           `V${Math.round(o.valence * 100)} A${Math.round(o.arousal * 100)} L${Math.round(o.health * 100)}\n`;
  }

  async function connectSerial() {
    if (!('serial' in navigator)) throw new Error('Web Serial só em Chrome/Edge (e precisa de https ou localhost)');
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });
    writer = port.writable.getWriter(); mode = 'usb';
    port.addEventListener('disconnect', () => { writer = null; mode = 'none'; });
  }

  function connectWs(url) {
    ws = new WebSocket(url);
    ws.onopen = () => { mode = 'wifi'; };
    ws.onclose = () => { mode = 'none'; setTimeout(() => connectWs(url), 2000); };
    ws.onerror = () => {};
  }

  function send(o) {
    const now = performance.now();
    if (now - lastSend < SEND_EVERY_MS) return;
    lastSend = now; lastLine = encode(o);
    if (mode === 'usb' && writer) writer.write(new TextEncoder().encode(lastLine)).catch(() => {});
    else if (mode === 'wifi' && ws && ws.readyState === 1) ws.send(lastLine);
    else if (now - lastLog > 1000) { lastLog = now; console.log('[bridge · sem hardware]', lastLine.trim()); }
  }

  function status() { return mode === 'none' ? 'desligado (só log)' : `${mode} · ${lastLine.trim()}`; }

  const wsUrl = new URLSearchParams(location.search).get('ws');
  if (wsUrl) connectWs(wsUrl);
  const btn = document.getElementById('usb');
  if (btn) btn.addEventListener('click', async function () {
    try { await connectSerial(); this.textContent = 'USB ligado'; this.disabled = true; }
    catch (e) { this.textContent = 'USB: ' + e.message; }
  });

  return { send, status, connectSerial, connectWs };
})();
window.BRIDGE = BRIDGE;
