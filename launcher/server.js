// Launcher web do MirrorBall (Linux): escolher 2D ou V3 e ligar/desligar o audio-sidecar.
// Sem dependências. `node launcher/server.js` → http://127.0.0.1:3700
const http = require('http'), net = require('net'), fs = require('fs'), path = require('path');
const { spawn, execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.LAUNCHER_PORT || 3700;
const LOGDIR = path.join(process.env.XDG_STATE_HOME || path.join(process.env.HOME, '.local/state'), 'mirrorball');
fs.mkdirSync(LOGDIR, { recursive: true });
const HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);

const SERVICES = {
  sidecar: { port: 3739, cwd: path.join(ROOT, 'audio-sidecar'), cmd: 'node', args: ['server.js'],
             env: { AUDIO_APP_DIR: path.join(ROOT, 'web') }, log: 'sidecar.log' },
  serve:   { port: 8099, cwd: path.join(ROOT, 'spike-babylon'), cmd: 'python', args: ['serve.py', '8099'], env: {}, log: 'serve.log' },
};

const up = port => new Promise(r => {
  const s = net.connect(port, '127.0.0.1'); s.setTimeout(500);
  s.on('connect', () => { s.destroy(); r(true); }); s.on('error', () => r(false)); s.on('timeout', () => { s.destroy(); r(false); });
});
const pidsOn = port => { try {
  return [...new Set((execFileSync('ss', ['-ltnpH', `sport = :${port}`]).toString().match(/pid=\d+/g) || []).map(x => +x.slice(4)))];
} catch { return []; } };
const wait = async (port, want) => { for (let i = 0; i < 40; i++) { if ((await up(port)) === want) return true; await new Promise(r => setTimeout(r, 250)); } return false; };

async function start(name) {
  const s = SERVICES[name];
  if (await up(s.port)) return 'já estava a correr';
  if (name === 'sidecar' && !fs.existsSync(path.join(s.cwd, 'node_modules/ws')))
    execFileSync('npm', ['install', '--omit=optional', '--no-audit', '--no-fund'], { cwd: s.cwd, stdio: 'ignore' });
  const fd = fs.openSync(path.join(LOGDIR, s.log), 'w');
  spawn(s.cmd, s.args, { cwd: s.cwd, env: { ...process.env, ...s.env }, detached: true, stdio: ['ignore', fd, fd] }).unref();
  if (!(await wait(s.port, true))) throw new Error(`não abriu a porta ${s.port} — ver ${LOGDIR}/${s.log}`);
  return 'ligado';
}
async function stop(name) {
  const s = SERVICES[name], pids = pidsOn(s.port);
  if (!pids.length) return 'já estava desligado';
  pids.forEach(p => { try { process.kill(p, 'SIGTERM'); } catch {} });
  if (!(await wait(s.port, false))) throw new Error('não terminou');
  return 'desligado';
}
const CTL = path.join(ROOT, 'mirror-wall-ctl.sh');
const wallStatus = () => { try { return execFileSync(CTL, ['status']).toString().trim() || 'off'; } catch { return 'off'; } };
const status = async () => ({ sidecar: await up(3739), v3: await up(8099), wall: wallStatus() });

const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end((typeof body === 'string' || Buffer.isBuffer(body)) ? body : JSON.stringify(body)); };

http.createServer(async (req, res) => {
  if (!HOSTS.has(req.headers.host)) return send(res, 403, { error: 'host' });
  const u = new URL(req.url, 'http://x');
  try {
    if (req.method === 'GET' && u.pathname === '/') return send(res, 200, fs.readFileSync(path.join(__dirname, 'index.html')), 'text/html; charset=utf-8');
    if (req.method === 'GET' && u.pathname === '/api/status') return send(res, 200, await status());
    if (req.method === 'POST' && req.headers['x-mb'] === '1') {
      const o = u.pathname.match(/^\/api\/open\/(2d|v3)$/);
      if (o) {   // liga o que a bola precisa (o cliente navega na mesma janela)
        await start('sidecar');
        if (o[1] === 'v3') await start('serve');
        return send(res, 200, { msg: 'aberto', ...(await status()) });
      }
      const w = u.pathname.match(/^\/api\/wall\/(black|white|off|skin)$/);
      if (w) {   // fundo vivo do Omarchy: muda o fundo do tema; o watcher liga/desliga bola + sidecar
        execFileSync(CTL, w[1] === 'off' ? ['off'] : w[1] === 'skin' ? ['skin'] : ['on', w[1]]);
        await new Promise(r => setTimeout(r, 400));
        return send(res, 200, { msg: w[1] === 'off' ? 'fundo vivo desligado' : 'fundo vivo ligado', ...(await status()) });
      }
      const m = u.pathname.match(/^\/api\/(sidecar|v3)\/(on|off)$/);
      if (m) {
        const on = m[2] === 'on';
        let msg;
        if (m[1] === 'sidecar') msg = await (on ? start('sidecar') : stop('sidecar'));
        else if (on) { await start('sidecar'); msg = await start('serve'); }   // a V3 precisa do sidecar (áudio) + serve.py
        else msg = await stop('serve');
        return send(res, 200, { msg, ...(await status()) });
      }
    }
    send(res, 404, { error: 'not found' });
  } catch (e) { send(res, 500, { error: String(e.message || e) }); }
}).listen(PORT, '127.0.0.1', () => console.log(`MirrorBall launcher: http://127.0.0.1:${PORT}`));
