/* cap.js — gravador de features REAIS do audio-sidecar para um `feat.json`.
 *
 * Porquê existe: afinar o detetor de bombo "à sensação", olhando para a bola, não funciona —
 * inércia, névoa, rampas e gestos teatrais mascaram o que o detetor fez. Para separar "o detetor
 * falhou a batida" de "o detetor acertou e o mapeamento suavizou" é preciso GRAVAR o que entrou
 * e voltar a correr o motor por cima, tantas vezes quantas forem precisas. Este ficheiro grava.
 *
 * Uso:
 *     node tools/cap.js [segundos] [ficheiro-saida]
 *     node tools/cap.js                    → 60 s para tools/feat.json
 *     node tools/cap.js 15                 → 15 s para tools/feat.json
 *     node tools/cap.js 30 tools/techno.json
 *
 * Depois:
 *     node web/replay-real.js tools/feat.json          (relatório em texto, 1 linha/s)
 *     web/tuner-lab.html → "Carregar feat.json"        (o instrumento visual)
 *
 * SEM DEPENDÊNCIAS. O Node ≥ 22 traz `WebSocket` e `fetch` globais (estáveis), por isso não há
 * `package.json`, não há `npm i ws` e não há `node_modules` no repo. Se um dia isto correr num
 * Node < 22, a mensagem de erro diz-o explicitamente em vez de rebentar com um ReferenceError.
 *
 * Formato do ficheiro: array JSON de objetos de features CRUAS, tal e qual como o sidecar as
 * emite — é o mesmo que o `web/replay-real.js` já consome (`rows[i].t` em ms do relógio do
 * sidecar). Não se filtra, não se renomeia, não se normaliza nada: normalização é decisão do
 * consumidor (a mesma regra que o sidecar segue com as bandas).
 */
'use strict';

const fs = require('fs');
const path = require('path');

/* ---------------------------------- constantes ---------------------------------- */
const SIDECAR = 'http://127.0.0.1:3739';
const DEFAULT_SECONDS = 60;
const DEFAULT_OUT = path.join(__dirname, 'feat.json');
const CONNECT_TIMEOUT_MS = 5000;
// Campos cujos percentis se imprimem no fim — são exatamente os que decidem o limiar do detetor.
const REPORT_FIELDS = ['subFluxRaw', 'hatFluxRaw', 'sub', 'hat', 'rms'];
// Campos que o detetor novo (§BANDONSET) precisa. Sem eles o motor cai no caminho de fallback.
const RAW_FIELDS = ['subFluxRaw', 'hatFluxRaw'];
const PERCENTILES = [5, 25, 50, 75, 90, 95, 99];

/* ---------------------------------- argumentos ---------------------------------- */
const argSec = Number(process.argv[2]);
const seconds = isFinite(argSec) && argSec > 0 ? argSec : DEFAULT_SECONDS;
const outPath = process.argv[3] ? path.resolve(process.argv[3]) : DEFAULT_OUT;

if (typeof WebSocket !== 'function' || typeof fetch !== 'function') {
  console.error(`[cap] este Node (${process.version}) não tem WebSocket/fetch globais.`);
  console.error('[cap] preciso de Node >= 22. Alternativa: npm i ws e trocar o cliente.');
  process.exit(2);
}

/* ------------------------------------ estatística ------------------------------------ */
function pct(sorted, p) {
  if (!sorted.length) return NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[i];
}
function fmt(v) {
  if (!isFinite(v)) return '   —  ';
  const a = Math.abs(v);
  return (a >= 1000 ? v.toFixed(0) : a >= 10 ? v.toFixed(2) : v.toFixed(4)).padStart(9);
}

function report(rows) {
  if (!rows.length) { console.log('[cap] zero frames — nada para reportar.'); return; }
  const durS = (rows[rows.length - 1].t - rows[0].t) / 1000;
  const hz = durS > 0 ? rows.length / durS : 0;
  const silent = rows.filter(r => r.silence).length;

  console.log('');
  console.log(`[cap] ${rows.length} frames · ${durS.toFixed(1)} s · ${hz.toFixed(1)} Hz · ${silent} frames em silêncio`);
  console.log('');
  console.log('  campo        ' + PERCENTILES.map(p => ('p' + p).padStart(9)).join('') + '      max');
  for (const f of REPORT_FIELDS) {
    const vals = rows.map(r => +r[f]).filter(v => isFinite(v));
    if (!vals.length) { console.log(`  ${f.padEnd(12)}  (ausente)`); continue; }
    vals.sort((a, b) => a - b);
    console.log(`  ${f.padEnd(12)}` + PERCENTILES.map(p => fmt(pct(vals, p))).join('') + fmt(vals[vals.length - 1]));
  }

  // Rácio p95/mediana do subFluxRaw: é o número que diz se o `kickC0` tem sequer margem.
  // O detetor dispara com `flux > C · mediana`; se o p95 não chegar a ~1.5× a mediana, não há
  // limiar nenhum que separe bombo de fundo — o problema é o sinal, não o C.
  const sf = rows.map(r => +r.subFluxRaw).filter(v => isFinite(v)).sort((a, b) => a - b);
  if (sf.length) {
    const med = pct(sf, 50), p95 = pct(sf, 95), p99 = pct(sf, 99);
    console.log('');
    console.log(`  subFluxRaw: p95/mediana = ${(med > 0 ? p95 / med : Infinity).toFixed(2)}  ·  ` +
                `p99/mediana = ${(med > 0 ? p99 / med : Infinity).toFixed(2)}`);
    console.log(`  → ponto de partida para bandOnset.kickC0 entre estes dois (hoje o default é 1.6).`);
  }
  console.log('');
  console.log(`[cap] gravado: ${outPath}`);
  console.log(`[cap] ver:     node web/replay-real.js ${path.relative(process.cwd(), outPath).replace(/\\/g, '/')}`);
  console.log('[cap] ou:      abrir web/tuner-lab.html e carregar este ficheiro');
}

/* -------------------------------------- captura -------------------------------------- */
(async () => {
  let token = '';
  try {
    const r = await fetch(`${SIDECAR}/app-token`, { signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    token = (await r.json()).token || '';
  } catch (e) {
    console.error(`[cap] não consegui falar com o sidecar em ${SIDECAR} (${e.message}).`);
    console.error('[cap] arranca-o primeiro: Mirrors-of-Emotions-Start.bat');
    process.exit(1);
  }

  const rows = [];
  let warnedNoRaw = false;
  let opened = false;

  const ws = new WebSocket(`ws://127.0.0.1:3739/ws?token=${encodeURIComponent(token)}`);

  const finish = (why) => {
    try { ws.close(); } catch (e) { /* já fechado */ }
    if (!rows.length) {
      console.error(`[cap] ${why} sem receber features. O sidecar está a captar áudio?`);
      process.exit(1);
    }
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(rows));
    report(rows);
    process.exit(0);
  };

  ws.onopen = () => {
    opened = true;
    console.log(`[cap] ligado. A gravar ${seconds} s → ${outPath}`);
    console.log('[cap] põe a música a tocar AGORA (Ctrl+C interrompe e grava na mesma).');
    setTimeout(() => finish('terminado'), seconds * 1000);
  };

  ws.onmessage = (ev) => {
    let m;
    try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (!m || m.type !== 'features') return;   // `clock`/handshake não entram no ficheiro

    if (!warnedNoRaw && rows.length === 0) {
      const faltam = RAW_FIELDS.filter(k => m[k] == null);
      if (faltam.length) {
        warnedNoRaw = true;
        console.warn('');
        console.warn('  ⚠  AVISO: o sidecar NÃO está a emitir ' + faltam.join(' / ') + '.');
        console.warn('     Isto quer dizer que ele é anterior à mudança de 2026-08-28, ou que');
        console.warn('     ainda não foi reiniciado. A gravação continua e é válida, mas o motor');
        console.warn('     vai correr no caminho de FALLBACK (subOnset/sub contra média móvel) e');
        console.warn('     no tuner-lab a pista principal fica vazia — os knobs de `bandOnset`');
        console.warn('     não mudam nada nesse caminho.');
        console.warn('     Correção: reiniciar o sidecar (Mirrors-of-Emotions-Kill + Start).');
        console.warn('');
      }
    }
    rows.push(m);
    if (rows.length % 250 === 0) {
      process.stdout.write(`\r[cap] ${rows.length} frames (${((rows[rows.length - 1].t - rows[0].t) / 1000).toFixed(0)} s)   `);
    }
  };

  ws.onerror = () => { /* o `onclose` que se segue é que reporta */ };
  ws.onclose = (e) => {
    if (!opened) {
      console.error(`[cap] o sidecar recusou a ligação (code ${e.code}). Token errado ou porta ocupada?`);
      process.exit(1);
    }
    if (rows.length) finish('ligação fechada');
  };

  setTimeout(() => { if (!opened) { console.error('[cap] timeout a ligar ao WebSocket.'); process.exit(1); } }, CONNECT_TIMEOUT_MS);
  process.on('SIGINT', () => { console.log(''); finish('interrompido'); });
})();
