// Gera spike-babylon/v2/knobs-default.json a partir dos DEFAULTS do código (config.js + panel.js).
// Não escreve valores à mão: carrega o config.js real e avalia os getters reais do panel.js num
// ambiente com DOM mínimo (stubs), capturando panelApi.KNOB_DEFAULTS (que o panel.js já calcula
// ANTES de aplicar o localStorage).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const V2 = path.resolve(__dirname, '../../../../../../David/AI/Projects/David/David - Projects/Ativos/MirrorBall/spike-babylon/v2');
const ROOT = process.argv[2] || V2;

const configSrc = fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8');
let panelSrc = fs.readFileSync(path.join(ROOT, 'panel.js'), 'utf8');

// ---- DOM mínimo: o panel.js só precisa de criar elementos e de um #dbg ----
function mkEl(tag) {
  const el = {
    tagName: (tag || '').toUpperCase(), style: { cssText: '', setProperty() {} },
    children: [], classList: { add() {}, toggle() {}, contains() { return false; } },
    appendChild(c) { this.children.push(c); return c; }, append() {},
    addEventListener() {}, set innerHTML(v) {}, get innerHTML() { return ''; },
    textContent: '', value: 0, checked: true, type: '', min: 0, max: 0, step: 0,
    disabled: false, onclick: null, oninput: null, onchange: null,
    previousSibling: null,
  };
  return el;
}
const dbg = mkEl('div');
const sandbox = {
  console,
  document: {
    getElementById: (id) => (id === 'dbg' ? dbg : mkEl('div')),
    createElement: mkEl,
  },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  // KNOB_DEFAULTS é capturado ANTES do fetch do knobs-default.json, mas o `await fetch` tem de
  // resolver — devolve-se 404 para o panel cair nos defaults do código (que é o que queremos gravar).
  fetch: async () => ({ ok: false, status: 404, json: async () => ({}) }),
  Promise, setTimeout, URL, Blob, File, CustomEvent: function () {}, dispatchEvent() {},
  addEventListener() {},
  Number, Math, JSON, Object, Set, Array, String, Boolean, isNaN, parseFloat, parseInt,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

vm.runInContext(configSrc, sandbox, { filename: 'config.js' });

// panel.js é um módulo ES — tira-se o `export` para o correr como script no vm.
panelSrc = panelSrc.replace(/^export\s+(async\s+)?function\s+initPanel/m, 'async function initPanel');
vm.runInContext(panelSrc + '\n;globalThis.__initPanel = initPanel;', sandbox, { filename: 'panel.js' });

main();
async function main() {
const api = await sandbox.__initPanel(sandbox.CONFIG, {});
const defaults = api.KNOB_DEFAULTS;

// ordem estável = ordem dos sliders (a mesma do painel)
const ordered = {};
for (const s of api.sliders) if (s[0] in defaults) ordered[s[0]] = defaults[s[0]];

const out = path.join(ROOT, 'knobs-default.json');
fs.writeFileSync(out, JSON.stringify(ordered, null, 2) + '\n', 'utf8');
console.log('escrito', out, '—', Object.keys(ordered).length, 'knobs');
}
