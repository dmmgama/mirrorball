/* make-sample.js — gera `tools/feat-sample.json`: features SINTÉTICAS no formato do sidecar.
 *
 * Porquê: para o David poder abrir o `tuner-lab.html` e ver o instrumento a funcionar ANTES de
 * gravar música real, e para haver um caso com verdade CONHECIDA (128 BPM exatos) contra o qual
 * verificar a contagem de kicks — 60 s a 128 BPM = 128 batidas.
 *
 * Não é uma simulação de áudio: é o que o sidecar EMITIRIA para uma faixa 4/4 de eletrónica.
 * Kicks em cada tempo, hi-hats em cada meio-tempo, um breakdown sem bombo a meio (para se ver a
 * bola parar e a FSM mudar), e ruído em todos os campos para o teste de variância ter trabalho.
 *
 *     node tools/make-sample.js [segundos] [bpm] [saida]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SEC = Number(process.argv[2]) || 60;
const BPM = Number(process.argv[3]) || 128;
const OUT = process.argv[4] ? path.resolve(process.argv[4]) : path.join(__dirname, 'feat-sample.json');

const HZ = 50;                      // o ritmo do sidecar
const T0 = 100000;                  // um `t` que parece um relógio real (ms)
// Escalas escolhidas para casar com o que foi MEDIDO numa gravação real (tools/cap.js):
// subFluxRaw mediana ~1, p95 ~10; hatFluxRaw mediana ~5, p95 ~67.
const SUB_FLOOR = 0.8, SUB_PEAK = 26;
const HAT_FLOOR = 3.0, HAT_PEAK = 90;
const SUB_DECAY = 22;               // decaimento do transiente do bombo (em fase de batida)
const HAT_DECAY = 60;

// Estrutura: GROOVE · BREAKDOWN (sem bombo) · GROOVE. Frações da duração total.
const SEG = [
  { name: 'groove', from: 0.00, to: 0.45, kick: true },
  { name: 'break',  from: 0.45, to: 0.62, kick: false },
  { name: 'groove', from: 0.62, to: 1.00, kick: true },
];

let seed = 20260828;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
const noise = (amp) => (rnd() - 0.5) * 2 * amp;
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

const period = 60000 / BPM;
const rows = [];
const nFrames = Math.round(SEC * HZ);

for (let i = 0; i < nFrames; i++) {
  const t = T0 + (i * 1000) / HZ;
  const rel = (i / HZ);
  const frac = rel / SEC;
  const seg = SEG.find(s => frac >= s.from && frac < s.to) || SEG[SEG.length - 1];

  const beatPhase = (rel * 1000 / period) % 1;          // 0 no downbeat de cada tempo
  const halfPhase = (rel * 2000 / period) % 1;          // hi-hats a cada meio tempo

  const kickEnv = seg.kick ? Math.exp(-beatPhase * SUB_DECAY) : 0;
  const hatEnv = Math.exp(-halfPhase * HAT_DECAY);

  const subFluxRaw = Math.max(0, SUB_FLOOR * (0.5 + rnd()) + SUB_PEAK * kickEnv + noise(0.5));
  const hatFluxRaw = Math.max(0, HAT_FLOOR * (0.5 + rnd()) + HAT_PEAK * hatEnv + noise(2));

  const loud = seg.kick ? 0.55 : 0.34;
  rows.push({
    type: 'features',
    t: +t.toFixed(4),
    rms: +clamp01(loud * (0.62 + 0.38 * kickEnv) + noise(0.004)).toFixed(6),
    bass: +clamp01((seg.kick ? 0.42 : 0.18) + 0.40 * kickEnv + noise(0.02)).toFixed(6),
    mid: +clamp01(0.45 + noise(0.05)).toFixed(6),
    high: +clamp01((seg.kick ? 0.42 : 0.30) + 0.25 * hatEnv + noise(0.04)).toFixed(6),
    sub: +clamp01((seg.kick ? 0.44 : 0.20) + 0.42 * kickEnv + noise(0.02)).toFixed(6),
    hat: +clamp01(0.28 + 0.45 * hatEnv + noise(0.04)).toFixed(6),
    density: +clamp01((seg.kick ? 0.38 : 0.22) + noise(0.03)).toFixed(6),
    subOnset: +clamp01(0.05 + 0.80 * kickEnv + noise(0.02)).toFixed(6),
    subFluxRaw: +subFluxRaw.toFixed(6),
    hatFluxRaw: +hatFluxRaw.toFixed(6),
    centroid: +clamp01(0.44 + 0.10 * hatEnv + noise(0.03)).toFixed(6),
    onset: +clamp01(0.06 + 0.75 * kickEnv + 0.30 * hatEnv + noise(0.02)).toFixed(6),
    loudness: +clamp01(loud + 0.10 * kickEnv + noise(0.01)).toFixed(6),
    silence: false,
  });
}

fs.writeFileSync(OUT, JSON.stringify(rows));
// Segunda cópia em `web/`: o sidecar serve essa pasta de forma ACHATADA (sem subpastas e sem
// alcançar `../tools/`), e é de lá que o botão "Amostra sintética" a busca. Duas cópias do
// mesmo ficheiro gerado é menos mau do que um botão que só funciona num dos dois servidores.
if (path.resolve(OUT) === path.resolve(path.join(__dirname, 'feat-sample.json'))) {
  const web = path.join(__dirname, '..', 'web', 'feat-sample.json');
  fs.writeFileSync(web, JSON.stringify(rows));
  console.log(`[sample] cópia para a página: ${web}`);
}
const kicks = SEG.filter(s => s.kick).reduce((a, s) => a + (s.to - s.from) * SEC * (BPM / 60), 0);
console.log(`[sample] ${rows.length} frames · ${SEC} s @ ${BPM} BPM · ${OUT}`);
console.log(`[sample] verdade conhecida: ~${Math.round(kicks)} kicks (o breakdown não tem bombo)`);
