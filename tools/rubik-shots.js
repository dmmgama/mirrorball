#!/usr/bin/env node
/* Capturas da bola 2D em modo foto — substitui as rondas de subagentes da F0 (retro 2026-10-23).
 *
 *   node tools/rubik-shots.js                 todas as capturas R0 → fases/R0-rubik-imagens/
 *   node tools/rubik-shots.js colunas raios   só esses grupos
 *   node tools/rubik-shots.js --q "rubik=xadrez&solve=1&forca=1" --name teste.png [--out pasta]
 *
 * Requisitos: a bola servida em http://127.0.0.1:8099 (atalho start-Mirror-Rubik) e o sidecar :3739
 * (sem ele não há afinação nem motor). Playwright global (npm i -g playwright) e um Chromium em
 * %LOCALAPPDATA%/ms-playwright. Cada URL leva `src=music&still=1` (afinação do David carregada,
 * rotação fixa, imagem congelada aos `at` s — ver STILL em web/index-v2.html).
 */
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');

function loadPlaywright() {
  try { return require('playwright'); } catch (e) { /* global */ }
  const root = execSync('npm root -g').toString().trim();
  for (const p of ['playwright', '@playwright/cli/node_modules/playwright']) {
    try { return require(path.join(root, p)); } catch (e) { /* próximo */ }
  }
  throw new Error('Playwright não encontrado: npm i -g playwright');
}
function findChromium() {
  const base = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
  const dirs = fs.existsSync(base) ? fs.readdirSync(base).filter(d => /^chromium_headless_shell-\d+$/.test(d)).sort() : [];
  for (const d of dirs.reverse()) {
    const exe = path.join(base, d, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe');
    if (fs.existsSync(exe)) return exe;
  }
  return undefined; // deixa o Playwright escolher
}

const ROOT = path.resolve(__dirname, '..');
const R0 = path.join(ROOT, 'fases', 'R0-rubik-imagens');
const STATES = [['solve0-f100', 'solve=0&forca=1'], ['solve50-f100', 'solve=0.5&forca=1'], ['solve100-f100', 'solve=1&forca=1'],
                ['solve0-f50', 'solve=0&forca=0.5'], ['solve100-f50', 'solve=1&forca=0.5']];
const GROUPS = {};
for (const p of ['colunas', 'diagonais', 'xadrez']) GROUPS[p] = STATES.map(([n, q]) => [`${p}/${p}-${n}.png`, `rubik=${p}&${q}`]);
GROUPS.colunas.push(['colunas/colunas-ref-sem-efeito.png', '']);
GROUPS.trovoes = STATES.map(([n, q]) => [`trovoes/trovoes-${n}.png`, `rubik=trovoes&raio=1&${q}`]);
GROUPS.raios = [['raio1-classico', 'raio=1'], ['raio2-esguio', 'raio=2'], ['raio3-dois-dentes', 'raio=3'],
                ['raio4-fino', 'raio=4'], ['raio1-desfeito', 'raio=1&desfaz=1']]
  .map(([n, q]) => [`trovoes-variantes/${n}.png`, `rubik=trovoes&solve=1&forca=1&${q}`]);

const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const single = opt('--q'), name = opt('--name') || 'shot.png', outDir = path.resolve(opt('--out') || R0);
const port = opt('--port') || '8099';
let jobs;
if (single !== undefined) jobs = [[name, single]];
else {
  const want = args.length ? args : Object.keys(GROUPS);
  const unknown = want.filter(g => !GROUPS[g]);
  if (unknown.length) { console.error(`grupo desconhecido: ${unknown.join(', ')} (há: ${Object.keys(GROUPS).join(', ')})`); process.exit(2); }
  jobs = want.flatMap(g => GROUPS[g]);
}

(async () => {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ executablePath: findChromium() });
  let fails = 0;
  for (const [file, q] of jobs) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/favicon|music\.config\.json|Failed to load resource/.test(m.text())) errs.push(m.text()); });
    await page.goto(`http://127.0.0.1:${port}/app/index-v2.html?src=music&still=1${q ? '&' + q : ''}`);
    await page.waitForFunction(() => window.__stillDone === true, null, { timeout: 15000 });
    // recorte quadrado à volta da bola (centro e raio vêm da própria página)
    const clip = await page.evaluate(() => {
      const r = Math.min(innerWidth, innerHeight) * CONFIG.ballSizeVH * 0.62, cx = innerWidth * CONFIG.ballCenter[0], cy = innerHeight * CONFIG.ballCenter[1];
      return { x: Math.max(0, cx - r), y: Math.max(0, cy - r), width: 2 * r, height: 2 * r };
    });
    const out = path.join(outDir, file);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await page.screenshot({ path: out, clip });
    console.log(`${errs.length ? 'ERRO' : 'ok  '} ${path.relative(ROOT, out)}${errs.length ? '  ' + errs.join(' | ') : ''}`);
    fails += errs.length ? 1 : 0;
    await page.close();
  }
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e.message); process.exit(1); });
