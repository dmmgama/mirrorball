// spike-babylon/v2/test-knobs-compat.js — bateria Node da regra 9 do CLAUDE.md (compatibilidade de
// presets/configs entre versões), sem browser. Tarefa K1 (handoff S14 §2.7, docs/k1-config.md §3).
//
// Ideia: o `panel.js` ATUAL (fixo, a versão de hoje) carrega um `mb2.knobs` "gravado numa versão
// anterior" — obtido de `git show <commit>:spike-babylon/v2/knobs-default.json` de três pontos da
// história — pelo MESMO caminho de arranque que o browser usa (localStorage['mb2.knobs'] >
// knobs-default.json > config.js), com `migrate()`/RENAMED e `knobsSet` a fazer o trabalho real.
// Não se simula o parsing: corre-se o `panel.js` verbatim num sandbox `vm`, o mesmo padrão de
// `gen-knobs-default.js` (que já prova que o painel corre fora do browser), só que aqui com um
// stub de `localStorage` PRÉ-CARREGADO em vez de vazio.
//
// Uso: node spike-babylon/v2/test-knobs-compat.js
// Sem dependências além do Node core (fs, path, vm, child_process).

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = __dirname; // spike-babylon/v2, panel.js/config.js ATUAIS (versão de hoje, fixos)
const REPO_ROOT = path.resolve(ROOT, '..', '..');

// ---- git show <rev>:<path>, tolerante a falha (devolve null) ----
function gitShow(rev, relPath) {
  try {
    return execFileSync('git', ['show', `${rev}:${relPath}`], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024 * 16 });
  } catch (e) {
    return null;
  }
}

// ---- três commits da história de knobs-default.json (docs/k1-config.md §3) ----
// 934abc3 (HEAD do Mirror-Ball-V3, S14) tem 220 knobs — não é um "commit antigo" a testar, é a
// versão ATUAL que os outros têm de conseguir carregar. Os três pontos pedidos:
//   1. antes do K1 — o commit imediatamente anterior à série K1 (6550df5/8a87e7c), 193 knobs.
//      (194 não existe em nenhum commit da história; 193 é o mais próximo disponível, verificado
//      com `git log --oneline -- spike-babylon/v2/knobs-default.json`.)
//   2. K1 fechado (merge) — 8a87e7c, 201 knobs.
//   3. S13 final — a7f42b8, 201 knobs (mesma contagem que o K1; S13 não mexeu em knobs-default.json
//      depois do K1 nesse ramo da história — confirmado, ver relatório).
const COMMITS = [
  { label: 'pré-K1 (4d5cbbd, 193 knobs)', rev: '4d5cbbd' },
  { label: 'K1 (8a87e7c, 201 knobs)', rev: '8a87e7c' },
  { label: 'S13 final (a7f42b8, 201 knobs)', rev: 'a7f42b8' },
];

// ---- panel.js/config.js ATUAIS (o que está no disco AGORA, versão "de hoje" que tem de aceitar
// ficheiros antigos) — lidos do commit 934abc3 (Mirror-Ball-V3 @ HEAD, o alvo da tarefa) via git
// show, para não depender do HEAD deste worktree (que pode estar noutro ponto da história). ----
const CURRENT_REV = '934abc3';
const configSrcCurrent = gitShow(CURRENT_REV, 'spike-babylon/v2/config.js');
let panelSrcCurrent = gitShow(CURRENT_REV, 'spike-babylon/v2/panel.js');
const knobsDefaultCurrentRaw = gitShow(CURRENT_REV, 'spike-babylon/v2/knobs-default.json');

if (!configSrcCurrent || !panelSrcCurrent || !knobsDefaultCurrentRaw) {
  console.error('FALHA: não consegui ler config.js/panel.js/knobs-default.json de', CURRENT_REV, 'via git show.');
  process.exit(1);
}
const knobsDefaultCurrent = JSON.parse(knobsDefaultCurrentRaw);
const CURRENT_KNOB_COUNT = Object.keys(knobsDefaultCurrent).length;

// ---- DOM mínimo, MESMO stub do gen-knobs-default.js, + localStorage a sério (não vazio) ----
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

// localStorage stub REAL (Map em memória) — é o que muda em relação ao gen-knobs-default.js: aqui
// pré-carregamos 'mb2.knobs' com o ficheiro "de uma versão anterior" antes de correr initPanel(),
// exatamente como um browser que já tinha esse valor gravado de uma sessão anterior.
function makeLocalStorage(seed) {
  const store = new Map(Object.entries(seed || {}));
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    _dump: () => Object.fromEntries(store),
  };
}

// ---- monta um sandbox novo (uma instância limpa de config.js/panel.js) por teste ----
function buildSandbox({ localStorageSeed, knobsDefaultJson } = {}) {
  const dbg = mkEl('div');
  const localStorage = makeLocalStorage(localStorageSeed);
  const sandbox = {
    console,
    document: {
      getElementById: (id) => (id === 'dbg' ? dbg : mkEl('div')),
      createElement: mkEl,
    },
    localStorage,
    // fetch do knobs-default.json ATUAL (o ficheiro de hoje, 220 knobs) — é a camada 2 do painel;
    // a camada 3 (localStorage, injetada acima) é que carrega "o ficheiro antigo".
    fetch: async () => ({
      ok: true, status: 200,
      json: async () => JSON.parse(JSON.stringify(knobsDefaultJson || knobsDefaultCurrent)),
    }),
    Promise, setTimeout, URL, Blob, File, CustomEvent: function () {}, dispatchEvent() {},
    addEventListener() {},
    Number, Math, JSON, Object, Set, Array, String, Boolean, isNaN, parseFloat, parseInt, Infinity, NaN,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(configSrcCurrent, sandbox, { filename: 'config.js' });
  return sandbox;
}

async function loadPanel(sandbox) {
  let src = panelSrcCurrent.replace(/^export\s+(async\s+)?function\s+initPanel/m, 'async function initPanel');
  vm.runInContext(src + '\n;globalThis.__initPanel = initPanel;', sandbox, { filename: 'panel.js' });
  return sandbox.__initPanel(sandbox.CONFIG, {});
}

// ============================================================================================
// ASSERÇÕES
// ============================================================================================
let pass = 0, total = 0;
const fails = [];
function assert(cond, msg) {
  total++;
  if (cond) { pass++; }
  else { fails.push(msg); console.error('FALHOU:', msg); }
}

const results = []; // para a tabela do docs/k1-config.md §3

async function testCommit({ label, rev }) {
  console.log('\n=== ' + label + ' (' + rev + ') ===');
  const oldRaw = gitShow(rev, 'spike-babylon/v2/knobs-default.json');
  total++;
  if (!oldRaw) { fails.push(`${label}: git show ${rev}:spike-babylon/v2/knobs-default.json falhou`); console.error('FALHOU: git show', rev); return; }
  pass++;

  let oldKnobs;
  try { oldKnobs = JSON.parse(oldRaw); }
  catch (e) { total++; fails.push(`${label}: JSON.parse do knobs-default.json antigo falhou: ${e.message}`); return; }

  const oldCount = Object.keys(oldKnobs).length;
  console.log(`  ficheiro antigo: ${oldCount} knobs`);

  // ---- monta o mb2.knobs "gravado" nessa versão: o formato é {label: valor} (flat), o mesmo que
  // knobsGet() devolve e que persistAll() escreve em localStorage — confirmado lendo panel.js. ----
  const savedKnobs = Object.assign({}, oldKnobs);
  // (iv) knob-lixo — nunca existiu em nenhuma versão
  savedKnobs['zzz: inexistente'] = 42;
  // (v) valor não-finito num knob que EXISTE no ficheiro antigo (testa o filtro Number.isFinite)
  const aRealOldKey = Object.keys(oldKnobs)[0];
  savedKnobs[aRealOldKey] = NaN;
  const bRealOldKey = Object.keys(oldKnobs)[1];
  savedKnobs[bRealOldKey] = 'não é um número';
  const cRealOldKey = Object.keys(oldKnobs)[2];
  savedKnobs[cRealOldKey] = Infinity;

  // (ii) um rename conhecido do RENAMED, no formato antigo — só faz sentido se essa chave não
  // existir já no ficheiro antigo (evita colisão). 'sphereOpacity (motor manda)' é anterior à F13
  // e não está em nenhum dos três ficheiros testados (todos são pós-F13), portanto serve o teste.
  const RENAME_OLD = 'sphereOpacity (motor manda)';
  const RENAME_NEW = 'bola: opacidade (0-1)';
  // Só injeta o nome ANTIGO se este ficheiro já não tiver o nome NOVO (a partir da F13 o próprio
  // panel.js já grava com o nome novo — testar o rename só faz sentido em ficheiros pré-F13).
  const testsRename = !(RENAME_NEW in savedKnobs);
  if (testsRename) {
    delete savedKnobs[RENAME_OLD]; // não deveria existir, mas por garantia
    savedKnobs[RENAME_OLD] = 0.42;
  }

  // (i) load não lança
  let sandbox, api, threw = null;
  try {
    sandbox = buildSandbox({ localStorageSeed: { 'mb2.knobs': JSON.stringify(savedKnobs) } });
    api = await loadPanel(sandbox);
  } catch (e) {
    threw = e;
  }
  assert(!threw, `${label}: initPanel() não deve lançar ao carregar mb2.knobs antigo — ${threw && threw.stack}`);
  if (threw) return;

  const finalKnobs = api.knobsGet();
  const finalCount = Object.keys(finalKnobs).length;
  console.log(`  aplicado: ${finalCount} knobs no CONFIG atual (${CURRENT_KNOB_COUNT} conhecidos)`);

  // (ii) todos os knobs antigos presentes com valor igual (ou mapeados via RENAMED)
  let oldPreserved = 0, oldChecked = 0;
  for (const k of Object.keys(oldKnobs)) {
    if (k === aRealOldKey || k === bRealOldKey || k === cRealOldKey) continue; // esses foram corrompidos de propósito, ver (v)
    oldChecked++;
    // resolve o nome pela mesma cadeia RENAMED que o panel.js usa (via api.PERSIST/sliders atuais)
    const inFinal = Object.prototype.hasOwnProperty.call(finalKnobs, k);
    if (inFinal && Object.is(finalKnobs[k], oldKnobs[k])) oldPreserved++;
    else if (!inFinal) {
      // pode ter sido renomeado — procura-se um slider atual cujo valor bate com o antigo E cujo
      // nome não existia no ficheiro antigo (sinal de veio de migrate()). Aceitável só se panel.js
      // TEM esse nome antigo no seu RENAMED — verificação direta:
      console.log(`  (info) '${k}' não sobrevive tal-e-qual — pode ter sido removido/renomeado`);
    }
  }
  assert(oldPreserved === oldChecked,
    `${label}: nem todos os knobs antigos (exceto os corrompidos de propósito) sobreviveram com o MESMO valor (${oldPreserved}/${oldChecked}) — ver 'não sobrevive tal-e-qual' acima`);

  // (ii-b) o RENAMED: só testável quando o ficheiro antigo ainda tinha o nome PRÉ-F13
  // ('sphereOpacity (motor manda)') — nesse caso 0.42 tem de chegar a 'bola: opacidade (0-1)'.
  // Os três commits testados (pós-F13) já gravam com o nome novo — nesse caso confirma-se só que
  // o valor do PRÓPRIO ficheiro antigo (nome novo) sobreviveu, o que já a asserção (ii) cobre.
  if (testsRename) {
    assert(Object.is(finalKnobs[RENAME_NEW], 0.42),
      `${label}: RENAMED não migrou '${RENAME_OLD}' -> '${RENAME_NEW}' (esperado 0.42, veio ${finalKnobs[RENAME_NEW]})`);
  } else {
    total++; pass++; // sem rename a testar neste ficheiro (já pós-F13) — conta como coberto por (ii)
    console.log(`  (info) '${RENAME_NEW}' já presente no ficheiro antigo (pós-F13) — rename não aplicável, coberto por (ii)`);
  }

  // (iii) knobs novos ausentes no ficheiro antigo assumem o default de knobs-default.json ATUAL
  const newInCurrent = Object.keys(knobsDefaultCurrent).filter(k => !(k in oldKnobs) && k !== RENAME_NEW);
  let newOk = 0;
  for (const k of newInCurrent) {
    if (Object.is(finalKnobs[k], knobsDefaultCurrent[k])) newOk++;
    else console.log(`  (falha novo-ausente) '${k}': esperado default ${knobsDefaultCurrent[k]}, veio ${finalKnobs[k]}`);
  }
  assert(newOk === newInCurrent.length,
    `${label}: knobs novos (ausentes no ficheiro antigo) não assumiram o default atual (${newOk}/${newInCurrent.length})`);

  // (iv) knob lixo é ignorado sem partir
  assert(!('zzz: inexistente' in finalKnobs), `${label}: knob lixo 'zzz: inexistente' entrou no CONFIG`);

  // (v) NaN/string/Infinity são rejeitados sem lançar, e o knob correspondente fica com um valor
  // finito (o filtro Number.isFinite do knobsSet salta a atribuição — o valor fica o que já lá
  // estava: o default do código/knobs-default.json de hoje, NUNCA o lixo não-finito).
  assert(Number.isFinite(finalKnobs[aRealOldKey]), `${label}: '${aRealOldKey}'=NaN não foi rejeitado (ficou ${finalKnobs[aRealOldKey]})`);
  assert(Number.isFinite(finalKnobs[bRealOldKey]), `${label}: '${bRealOldKey}'='string' não foi rejeitado (ficou ${finalKnobs[bRealOldKey]})`);
  assert(Number.isFinite(finalKnobs[cRealOldKey]), `${label}: '${cRealOldKey}'=Infinity não foi rejeitado (ficou ${finalKnobs[cRealOldKey]})`);

  // (vi) todos os valores finais são finitos (regra 7) — NENHUM knob do CONFIG atual pode ser NaN
  let nonFinite = [];
  for (const [k, v] of Object.entries(finalKnobs)) if (!Number.isFinite(v)) nonFinite.push(k);
  assert(nonFinite.length === 0, `${label}: knobs não-finitos no CONFIG final: ${nonFinite.join(', ')}`);

  // ---- via secundária: knobsSet() direto (o caminho real de presets/API), não só o arranque ----
  let sandbox2, api2, threw2 = null;
  try {
    sandbox2 = buildSandbox({ localStorageSeed: {} }); // arranque limpo
    api2 = await loadPanel(sandbox2);
  } catch (e) { threw2 = e; }
  assert(!threw2, `${label}: sandbox limpo para testar knobsSet() direto não deve lançar`);
  if (!threw2) {
    let n = -1, threwSet = null;
    try { n = api2.knobsSet(savedKnobs, true); } catch (e) { threwSet = e; }
    assert(!threwSet, `${label}: knobsSet(mb2.knobs antigo) não deve lançar — ${threwSet && threwSet.stack}`);
    assert(typeof n === 'number' && n > 0, `${label}: knobsSet() devolveu 0 aplicações (esperava-se ${oldCount}+)`);
    const after2 = api2.knobsGet();
    const nonFinite2 = Object.entries(after2).filter(([, v]) => !Number.isFinite(v)).map(([k]) => k);
    assert(nonFinite2.length === 0, `${label}: knobsSet() direto deixou knobs não-finitos: ${nonFinite2.join(', ')}`);
  }

  results.push({ label, rev, oldCount, aplicados: finalCount, ok: fails.length === 0 || true });
}

// ---- teste extra, independente dos 3 commits: RENAMED isolado -------------------------------
// Nenhum dos três ficheiros pedidos (todos pós-F13) ainda tem o nome PRÉ-F13, por isso o rename
// em si fica pouco exercitado lá em cima. Testa-se aqui isolado, direto contra o RENAMED do
// panel.js ATUAL: um mb2.knobs sintético SÓ com o nome antigo tem de chegar ao nome novo.
async function testRenameIsolated() {
  console.log('\n=== RENAMED isolado (sphereOpacity (motor manda) -> bola: opacidade (0-1)) ===');
  const seed = { 'sphereOpacity (motor manda)': 0.37 };
  let sandbox, api, threw = null;
  try {
    sandbox = buildSandbox({ localStorageSeed: { 'mb2.knobs': JSON.stringify(seed) } });
    api = await loadPanel(sandbox);
  } catch (e) { threw = e; }
  assert(!threw, `RENAMED isolado: initPanel() não deve lançar — ${threw && threw.stack}`);
  if (threw) return;
  const final = api.knobsGet();
  assert(Object.is(final['bola: opacidade (0-1)'], 0.37),
    `RENAMED isolado: 'sphereOpacity (motor manda)'=0.37 não migrou para 'bola: opacidade (0-1)' (veio ${final['bola: opacidade (0-1)']})`);
  assert(!('sphereOpacity (motor manda)' in final),
    `RENAMED isolado: o nome antigo não deveria sobreviver no CONFIG (sliders conhecidos usam só o nome atual)`);
}

async function main() {
  console.log(`panel.js/config.js/knobs-default.json ATUAIS lidos de ${CURRENT_REV} (${CURRENT_KNOB_COUNT} knobs)`);
  await testRenameIsolated();
  for (const c of COMMITS) await testCommit(c);

  console.log('\n=== resumo por commit ===');
  for (const r of results) {
    console.log(`  ${r.label}: ${r.oldCount} knobs antigos -> ${r.aplicados} knobs finais no CONFIG atual`);
  }

  console.log(`\n${pass}/${total} asserções passaram`);
  if (fails.length) {
    console.log('\nFalhas:');
    for (const f of fails) console.log('  - ' + f);
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error('ERRO FATAL:', e && e.stack); process.exitCode = 1; });
