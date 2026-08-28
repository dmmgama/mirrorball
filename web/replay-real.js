// Replay de features REAIS (gravadas do sidecar) no motor: imprime presença de bombo, BPM, rpm.
// uso: node replay-real.js <feat.json>
const fs = require('fs'), path = require('path');
const featPath = process.argv[2]; process.argv[2] = __dirname;
const src = fs.readFileSync(path.join(__dirname, 'test-music-f2.js'), 'utf8').split('/* ================================ execução')[0];
const m = { exports: {} };
new Function('require', 'module', '__dirname', '__filename', src + '\nmodule.exports = { makeEnv };')(require, m, __dirname, __filename);
const env = m.exports.makeEnv({ owner: 'music', seed: 1 });
const rows = JSON.parse(fs.readFileSync(featPath, 'utf8'));
const t0 = rows[0].t; let last = 0, kicks = 0, lastKickT = -1;
const S = env.sandbox.MUSIC.state;
for (const r of rows) {
  const t = r.t - t0;
  while (env.clock < t) env.tick(20);
  env.sandbox.postMessage(Object.assign({}, r, { t: env.clock }), '*');
  env.tick(20);
  if (S.lastKickT !== lastKickT) { lastKickT = S.lastKickT; kicks++; }
  if (env.clock - last >= 1000) { last = env.clock; console.log(`t=${(env.clock/1000).toFixed(0).padStart(2)}s pres=${S.kickPresence.toFixed(2)} kicks/s=${S.kickRate.toFixed(1)} bpm=${(S.bpm||0).toFixed(0)} conf=${(S.bpmConf||S.gridConf||0).toFixed(2)} rpm=${env.CONFIG.rotationRpm.toFixed(2)} opac=${env.CONFIG.sphereOpacity.toFixed(2)} beam=${env.CONFIG.beamIntensity.toFixed(2)} fsm=${S.fsm}`); }
}
console.log('kicks total', kicks, 'em', ((rows[rows.length-1].t - t0)/1000).toFixed(1), 's');
