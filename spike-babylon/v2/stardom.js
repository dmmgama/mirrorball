// v2/stardom.js — F12 §5: SISTEMA DE ESTRELATO (docs/f12-estrelato.md) + S2: HERO POR SECÇÃO,
// RELÓGIO ÚNICO E RESERVA DO ALL-ON (docs/f16-sync.md §1 decisões 2, 3, 5, 6, 8; plan-s13-faseado §1 S2).
//
// ================================ O PROBLEMA ================================
// Depois da F11 a sala tem três peças que reagem à música ao mesmo tempo: a BOLA (feixes/pontos/
// focos), o MIKADO do teto (rajadas de flashes) e os CHAPÉUS (flashes dourados). Todas a responder
// aos mesmos eventos dá papa visual: tudo pisca ao mesmo tempo, nada se lê, e o resultado é um
// visualizador de áudio — exatamente o que o David NÃO quer (§0 do docs/plan.md).
//
// Um técnico de luz competente faz o contrário: em cada momento há UMA peça a contar a história e
// as outras servem-na. É isso que este módulo faz.
//
// ================================ O MODELO ================================
// Em cada instante há UM `star` ∈ { 'ball', 'mikado', 'hats', 'smooth', 'all' }:
//   ball    — a bola é a estrela: feixes/pontos abertos; os chapéus entram como AUXILIARES
//             (flashes ligeiros de apoio, spec §5a); o mikado cala-se (fica no repouso).
//   mikado  — o teto é a estrela: rajadas do mikado libertadas; CHAPÉUS FORA (exclusão mútua,
//             spec §4); a bola desce para um papel de fundo (não desaparece — continua a girar,
//             regra 2 do CLAUDE.md).
//   hats    — os chapéus são a estrela (spec §5b): resto da sala EM BAIXO (wash e mikado
//             recolhem) e os chapéus a flashar, todos juntos ou em sequência ponta-a-ponta.
//   smooth  — ninguém é estrela: tudo subtil, a sala respira. É o estado de repouso e o que dá
//             valor aos outros três (sem vales não há picos).
//   all     — S2: o ALL-ON da sala (regra 5 do CLAUDE.md: "all-on no drop"). Tudo a 1 ao mesmo
//             tempo — a ÚNICA exceção à exclusão mútua mikado↔chapéus, e por isso mesmo tem
//             RESERVA (f16 §1-6): só volta a acontecer passadas N frases (`sync: all-on reserva`).
//
// EXCLUSÃO MÚTUA (spec §4) é ESTRUTURAL, não uma regra à parte: só há um `star` de cada vez, logo
// mikado e chapéus nunca podem ser estrela ao mesmo tempo (exceto no `all`, que é a munição rara).
//
// ================================ S2: HERO POR SECÇÃO (f16 §1-3) ================================
// A FSM do motor diz a secção; cada secção tem um HERÓI e um resto que o serve (research-lighting-pro
// §4.1). A tabela `HERO` abaixo são PESOS do sorteio, não regras rígidas: o herói pesa muito, o resto
// pouco, e o random continua a escolher — mas dentro da hierarquia.
//   GROOVE    → chapéus narrador rítmico, bola discreta
//   BUILD     → chapéus aceleram (os robots convergem por conta do motor), mikado EM RESERVA
//   PRE_DROP  → BLACKOUT (gesto novo, S4): aqui só o hook — o estrelato NÃO re-sorteia, segura a
//               estrela do build e publica `gain.preDrop = 1` para quem vier a implementar o gesto
//   DROP      → mikado protagonista, bola cede; ALL-ON se a reserva o permitir
//   BREAKDOWN → duas leituras por knob (f16 §1-5): (a) bola+wash protagonistas (disco/pop) ou
//               (b) bola DISCRETA, só rpm ao bombo (techno) — default (b). Mikado em reserva TOTAL.
//   OUTRO     → fade (o motor ainda não emite OUTRO; se emitir, já está coberto)
//
// ================================ S2: O RELÓGIO DECIDE QUANDO (f16 §1-2) ================================
// O random escolhe O QUÊ; o relógio decide QUANDO. Lentos (troca de estrela) em `barTick`/
// `phraseTick`; acentos (flash dos chapéus) em `beatTick`. Contrato S1 (W3, em paralelo): `MUSIC.state`
// passa a publicar `beatTick/barTick/phraseTick` (monotónicos), `beatIdx`, `barIdx`, `clockConf`,
// `clockAgeMs`. Enquanto não existirem, `readClock()` DERIVA os mesmos campos do que há hoje:
// `bar`/`phrase` com grelha, aresta do `kickFlash` sem grelha (4/4 assumido). Um leitor, dois
// mundos, zero campos inventados (fronteira frágil nº1 do mapa-frentes: não se renomeia nada).
//
// Fronteiras em que se pode trocar de estrela:
//   1. DROP (`dropCount` subiu) — é o acento mais forte da música e, por construção, uma aresta de
//      tempo: troca JÁ (para mikado, ou all-on se houver reserva);
//   2. transição de FSM — a troca fica PENDENTE e executa no próximo `barTick` (ou por timeout se
//      o relógio morrer: um breakdown sem bombo não pode ficar preso à espera de um tick);
//   3. fim de frase (`holdBars` compassos no mesmo estrelato) — executa no `barTick` que a fecha.
// Na transição de secção faz-se RESET do apoio (`get-out-of-jail`, erro nº5 do research): cadência
// dos chapéus, gesto, pendentes — a secção nova começa limpa.
//
// ================================ S2: `act` CHEGA À SALA (f16 §1-8, regra 4) ================================
// Densidade espectral → atividade: com `act` alto o sorteio favorece as peças ativas e a cadência
// dos chapéus sobe; com `act` baixo pesa mais o `smooth` e os chapéus abrandam (rpm exceto — é do
// motor). Só multiplicadores; a tabela HERO continua a mandar.
//
// ================================ O QUE ESTE MÓDULO ESCREVE ================================
// NADA de knobs do David e NADA que o motor de música já escreva. Escreve só em `CONFIG.stardom.gain`,
// multiplicadores 0..1+ que os módulos LEEM:
//     gain.ball   → main.js  (peso dos feixes/pontos da bola, via `E.spotGain`)
//     gain.mikado → mikado.js (probabilidade de rajada + brilho de repouso)
//     gain.hats   → hats.js   (força do flash) — e o modo do gesto vem em `gain.hatsMode`
//     gain.wash   → main.js  (o wash da sala recolhe quando os chapéus são estrela / no breakdown)
//     gain.preDrop → hook do blackout (S4). Ninguém lê ainda. 0/1.
// Todos com rampa, todos NaN-safe (regra 7), todos a 1.0 quando o sistema está desligado.
//
// KNOBS S2 (f16 §3): vivem em `MUSIC.config.sync` (motor → `music-config.json`), desenhados pelo
// `tuner.js` secção «Sync (sala)». Lidos aqui com fallback aos defaults do research:
//     sync.allOnReservePhrases   8    frases entre all-on (2-16)
//     sync.breakdownBallHero     0    0 = bola discreta (techno) · 1 = bola+wash protagonistas
//     sync.breakdownWash         0.3  wash da sala no breakdown discreto (0-1)
//
// createStardom(CONFIG, deps) -> { update(tSec, dt), state }
//   deps: { hats } — só para os gestos dos chapéus (`hats.pulse`). O mikado e a bola são comandados
//   por ganho, não por chamadas: eles já têm as suas máquinas e não se lhes quer um segundo dono.

function num(v, d) { return Number.isFinite(v) ? v : d; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

const STARS = ['ball', 'mikado', 'hats', 'smooth', 'all'];

/* Defaults dos knobs `sync` (f16 §2). Repetidos aqui (e no tuner.js) de propósito: o estrelato tem de
   funcionar sem tuner, sem ficheiro e sem motor — regra 7, valor inicial finito. */
const SYNC_DEFAULTS = { allOnReservePhrases: 8, breakdownBallHero: 0, breakdownWash: 0.3 };

/* Perfil de ganhos por estrela. Cada linha é "o que a sala faz quando X é a estrela".
   Os números são de SENSAÇÃO (é isto que o David vai querer afinar ao vivo) e estão todos
   normalizados a 1 = o comportamento neutro da F11. */
const PROFILE = {
  // a bola manda: feixes abertos, mikado recolhido, chapéus só a apoiar, wash normal
  ball: { ball: 1.00, mikado: 0.12, hats: 0.45, wash: 1.00 },
  // o mikado manda: chapéus FORA (exclusão mútua), bola em fundo, wash um pouco abaixo
  mikado: { ball: 0.55, mikado: 1.00, hats: 0.00, wash: 0.80 },
  // os chapéus mandam: "resto da sala em baixo" (spec §5b) — wash e mikado recolhem a sério
  hats: { ball: 0.45, mikado: 0.00, hats: 1.00, wash: 0.45 },
  // ninguém manda: tudo subtil, mas nada morto (a bola NUNCA pára — regra 2 do CLAUDE.md)
  smooth: { ball: 0.70, mikado: 0.22, hats: 0.20, wash: 1.00 },
  // ALL-ON: tudo ao máximo (a munição rara — reserva em frases)
  all: { ball: 1.00, mikado: 1.00, hats: 1.00, wash: 1.00 },
  // OUTRO: a sala apaga-se devagar (só a bola fica, discreta; nada pisca)
  fade: { ball: 0.40, mikado: 0.00, hats: 0.00, wash: 0.55 },
};

/* ---- S2: tabela HERO × FSM (f16 §1-3) — pesos do sorteio por secção ----
   Ler por linhas: "em GROOVE os chapéus são o herói (peso 1), a bola é discreta (0.35), o mikado
   quase nunca (0.12), e há vales (smooth 0.55)". `all` só entra em DROP e é multiplicado pela
   RESERVA (0 enquanto a munição não estiver reposta). BREAKDOWN tem duas linhas por knob. */
const HERO = {
  GROOVE:      { ball: 0.35, mikado: 0.12, hats: 1.00, smooth: 0.55, all: 0.00 },
  BUILD:       { ball: 0.30, mikado: 0.08, hats: 1.00, smooth: 0.15, all: 0.00 },  // mikado em reserva
  PRE_DROP:    { ball: 0.30, mikado: 0.08, hats: 1.00, smooth: 0.15, all: 0.00 },  // não re-sorteia (hook)
  DROP:        { ball: 0.20, mikado: 1.00, hats: 0.12, smooth: 0.00, all: 1.00 },  // all × reserva
  BREAKDOWN_B: { ball: 0.35, mikado: 0.00, hats: 0.12, smooth: 1.00, all: 0.00 },  // (b) discreta — default
  BREAKDOWN_A: { ball: 1.00, mikado: 0.00, hats: 0.12, smooth: 0.30, all: 0.00 },  // (a) bola+wash protagonistas
  OUTRO:       { ball: 0.00, mikado: 0.00, hats: 0.00, smooth: 1.00, all: 0.00 },  // fade (perfil `fade`)
};

const PHRASE_BARS = 8;          // frase do relógio S1 (f16 §2: "frase de 8 compassos é a unidade")
const BEATS_PER_BAR = 4;        // degradação sem grelha: 4/4 assumido (f16 §1-1)
const KICK_EDGE = 0.5;          // aresta do `kickFlash`: subida > 0.5 num frame = bombo novo
const PENDING_TIMEOUT_S = 3.0;  // troca pendente sem `barTick` há 3 s → executa na mesma (relógio morto)
const CLOCK_DEAD_S = 1.5;       // sem `beatTick` há 1,5 s → acentos dos chapéus caem para timer próprio

export function createStardom(CONFIG, deps = {}) {
  const hats = deps.hats || null;
  const S = () => CONFIG.stardom || {};
  const MSget = () => (typeof window !== 'undefined' && window.MUSIC && window.MUSIC.state) || null;
  /* knobs S2: `MUSIC.config.sync` (tuner.js cria-o com os defaults); sem motor/tuner → defaults */
  const SYNC = () => {
    const M = (typeof window !== 'undefined' && window.MUSIC && window.MUSIC.config) || null;
    const s = (M && M.sync && typeof M.sync === 'object') ? M.sync : {};
    return {
      reserve: clamp(Math.round(num(s.allOnReservePhrases, SYNC_DEFAULTS.allOnReservePhrases)), 1, 64),
      ballHero: num(s.breakdownBallHero, SYNC_DEFAULTS.breakdownBallHero) >= 0.5,
      bdWash: clamp(num(s.breakdownWash, SYNC_DEFAULTS.breakdownWash), 0, 1),
    };
  };

  /* saída viva: os multiplicadores que os outros módulos leem. Criado AQUI (e não em config.js)
     para nunca poder faltar — regra 7: todo o estado novo nasce com valor. `hatsMode` é o gesto
     que os chapéus devem usar quando SÃO a estrela (0 = juntos, 1 = sequência). `preDrop` é o
     hook do blackout (S4): 1 durante PRE_DROP. Ninguém o lê ainda. */
  if (!CONFIG.stardom || typeof CONFIG.stardom !== 'object') CONFIG.stardom = {};
  const gain = CONFIG.stardom.gain = { ball: 1, mikado: 1, hats: 1, wash: 1, hatsMode: 0, preDrop: 0 };

  /* estado interno — TUDO com valor inicial (regra 7 do CLAUDE.md: um `undefined` aqui propaga-se
     para os multiplicadores e apaga feixes/flashes em silêncio). */
  const st = {
    star: 'smooth',        // estrela corrente
    prev: 'smooth',        // estrela anterior (para o corte de repetição)
    since: 0,              // tSec da última troca
    sinceBar: 0,           // barTick da última troca (fronteira de frase)
    fsm: 'GROOVE',         // FSM corrente (lida)
    lastFsm: '',           // FSM do frame anterior (deteção de transição)
    lastDrop: -1,          // dropCount do frame anterior (-1 = ainda não lido)
    pending: '',           // troca pendente ('' = nenhuma) — executa no próximo barTick
    pendingAt: 0,          // tSec em que ficou pendente (timeout se o relógio morrer)
    autoNextAt: 0,         // relógio autónomo (sem motor)
    // --- relógio (contrato S1 lido ou derivado) ---
    clk: { beatTick: 0, barTick: 0, phraseTick: 0, beatIdx: 0, barIdx: 0, conf: 0, ageMs: 1e9, src: 'none' },
    lastBeatTick: -1, lastBarTick: -1, lastPhraseTick: -1,
    lastBeatAt: -1e9,      // tSec do último beatTick visto (relógio morto?)
    lastBarAt: -1e9,
    // derivação sem campos S1: aresta do kickFlash, bar/phrase do motor
    dBeat: 0, dBar: 0, dPhrase: 0, prevKickFlash: 0, prevBar: -1, prevPhrase: -1,
    // --- reserva do all-on (estado) ---
    lastAllOnPhrase: -1e9, // phraseTick do último all-on (-1e9 = nunca → munição cheia)
    allOnCount: 0,
    // ganhos suavizados (rampa) — começam no perfil `smooth` para não haver salto no 1º frame
    gBall: PROFILE.smooth.ball, gMik: PROFILE.smooth.mikado,
    gHat: PROFILE.smooth.hats, gWash: PROFILE.smooth.wash,
    // gesto dos chapéus quando são estrela: 0 = todos juntos, 1 = sequência ponta-a-ponta
    hatsGesture: 0,
    hatsNextAt: 0,         // próximo gesto dos chapéus (só no modo timer / sem relógio)
    hatsBeatDiv: 1,        // acentos: 1 = todos os tempos, 2 = tempos alternados… (teto 3 Hz)
    warned: false,
    changes: 0,            // trocas de estrela (HUD/diagnóstico)
  };

  /* ---- elegibilidade: o que está MONTADO na sala (knobs do David; o motor não lhes toca) ----
     Um elemento desligado no painel não pode ser estrela — o peso dele redistribui-se sozinho,
     porque simplesmente não entra no sorteio. É a exigência explícita do brief. */
  function eligible(name) {
    if (name === 'smooth') return true;
    if (name === 'ball') return CONFIG.ballOn !== false;
    if (name === 'mikado') return (CONFIG.mikado || {}).on !== false;
    if (name === 'hats') return (CONFIG.hats || {}).on !== false;
    if (name === 'all') return eligible('ball') || eligible('mikado') || eligible('hats');
    return false;
  }

  /* ---- S2: RESERVA do all-on como estado ----
     0 enquanto não passaram `reserve` frases desde o último; sobe a 1 até 2× a reserva. É um
     multiplicador do peso de `all` no sorteio: "tempo-desde-último all-on pesa na probabilidade". */
  function allOnReadiness() {
    const { reserve } = SYNC();
    const since = st.clk.phraseTick - st.lastAllOnPhrase;
    if (!(since >= reserve)) return 0;
    return clamp((since - reserve) / Math.max(1, reserve) + 0.35, 0, 1);
  }

  function heroRow(fsm) {
    if (fsm === 'BREAKDOWN') return SYNC().ballHero ? HERO.BREAKDOWN_A : HERO.BREAKDOWN_B;
    return HERO[fsm] || HERO.GROOVE;
  }

  /* ---- sorteio ponderado da próxima estrela ----
     peso = herói da secção × viés do knob × `act` × reserva (só `all`) × corte de repetição.
     Só entram os elegíveis. Os viés (`estrelato: viés *`) são o override do David por cima da
     tabela — a 1.0 (default) a hierarquia por secção manda sozinha. */
  function pickStar(fsm, act) {
    const cfg = S();
    const row = heroRow(fsm);
    const bias = {
      ball: Math.max(0, num(cfg.biasBall, 1)),
      mikado: Math.max(0, num(cfg.biasMikado, 1)),
      hats: Math.max(0, num(cfg.biasHats, 1)),
      smooth: Math.max(0, num(cfg.biasSmooth, 0.8)),
      all: 1,
    };
    const a = clamp(num(act, 1), 0, 1);
    /* `act` (regra 4): muita informação → peças ativas pesam mais e os vales menos; pouca → o
       inverso. Multiplicadores suaves (0.6..1.2), nunca invertem a tabela HERO. */
    const actMul = { ball: 0.8 + 0.4 * a, mikado: 0.6 + 0.6 * a, hats: 0.7 + 0.5 * a, smooth: 1.3 - 0.7 * a, all: 0.5 + 0.7 * a };
    // 0 = pode repetir à vontade · 1 = nunca repete (o peso da anterior vai a zero)
    const noRepeat = clamp(num(cfg.noRepeat, 0.75), 0, 1);
    const ready = allOnReadiness();

    const names = [], w = [];
    let total = 0;
    for (const s of STARS) {
      if (!eligible(s)) continue;
      let x = num(row[s], 0) * bias[s] * actMul[s];
      if (s === 'all') x *= ready;
      if (s === st.star) x *= (1 - noRepeat);
      if (!(x > 0)) continue;
      names.push(s); w.push(x); total += x;
    }
    if (!names.length) return fsm === 'OUTRO' ? 'fade' : 'smooth';   // tudo desligado → repouso
    let r = Math.random() * total;
    let pick = names[names.length - 1];
    for (let i = 0; i < names.length; i++) { r -= w[i]; if (r <= 0) { pick = names[i]; break; } }
    if (pick === 'smooth' && fsm === 'OUTRO') return 'fade';
    return pick;
  }

  function setStar(next, tSec, why) {
    if (next === st.star) return false;
    st.prev = st.star;
    st.star = next;
    st.since = tSec;
    st.sinceBar = st.clk.barTick;
    st.changes++;
    if (next === 'all') { st.lastAllOnPhrase = st.clk.phraseTick; st.allOnCount++; }
    /* o GESTO dos chapéus escolhe-se UMA vez por estrelato (não a meio): dentro do mesmo momento a
       sala tem de ler como um só gesto — "todos juntos" OU "a onda", nunca os dois misturados.
       O knob `chapéus: gesto (0=juntos/1=seq/2=alterna)` manda; em 2 alterna a cada estrelato. */
    if (next === 'hats' || next === 'all') {
      const g = Math.round(num(S().hatsGesture, 2));
      st.hatsGesture = (g === 0 || g === 1) ? g : (st.hatsGesture ? 0 : 1);
    }
    st.hatsNextAt = tSec;   // o novo papel dos chapéus começa já (não espera o relógio anterior)
    void why;
    return true;
  }

  /* ---- S2: RESET na transição de secção ("get-out-of-jail", erro nº5 do research) ----
     A secção nova começa limpa: pendentes, cadência e gesto dos chapéus. A estrela em si só muda
     no barTick seguinte (ou já, se a secção for um acento). */
  function sectionReset(tSec) {
    st.pending = '';
    st.hatsNextAt = tSec;
    st.hatsBeatDiv = 1;
  }

  /* ---- S2: LEITOR DO RELÓGIO — contrato S1 (W3) com fallback aos campos de hoje ----
     Preferência: `MS.beatTick/barTick/phraseTick` (monotónicos) + `beatIdx/barIdx/clockConf/
     clockAgeMs`. Sem eles: com grelha (`MS.grid` e `bar` a avançar) barTick segue `bar` e
     phraseTick segue `phrase`; beatTick vem da aresta do `kickFlash`. Sem grelha: tudo derivado da
     aresta do bombo com 4/4 assumido. Devolve sempre números finitos (regra 7). */
  function readClock(MS, tSec) {
    const c = st.clk;
    if (Number.isFinite(MS.beatTick) && Number.isFinite(MS.barTick) && Number.isFinite(MS.phraseTick)) {
      c.beatTick = MS.beatTick; c.barTick = MS.barTick; c.phraseTick = MS.phraseTick;
      c.beatIdx = clamp(Math.round(num(MS.beatIdx, 0)), 0, BEATS_PER_BAR - 1);
      c.barIdx = clamp(Math.round(num(MS.barIdx, 0)), 0, PHRASE_BARS - 1);
      c.conf = clamp(num(MS.clockConf, num(MS.gridConf, 0)), 0, 1);
      c.ageMs = Math.max(0, num(MS.clockAgeMs, 0));
      c.src = 's1';
      return c;
    }
    // ---- fallback: derivar ----
    const kf = num(MS.kickFlash, 0);
    const beat = kf - st.prevKickFlash > KICK_EDGE;
    st.prevKickFlash = kf;
    if (beat) st.dBeat++;
    const haveGrid = !!MS.grid && num(MS.gridConf, 0) > 0.3 && Number.isFinite(MS.bar);
    if (haveGrid) {
      const bar = Math.round(MS.bar), phrase = Math.round(num(MS.phrase, Math.floor(bar / PHRASE_BARS)));
      if (st.prevBar >= 0 && bar !== st.prevBar) st.dBar += Math.max(1, Math.abs(bar - st.prevBar));
      if (st.prevPhrase >= 0 && phrase !== st.prevPhrase) st.dPhrase += Math.max(1, Math.abs(phrase - st.prevPhrase));
      st.prevBar = bar; st.prevPhrase = phrase;
      c.barTick = st.dBar; c.phraseTick = st.dPhrase;
      c.barIdx = ((bar % PHRASE_BARS) + PHRASE_BARS) % PHRASE_BARS;
      c.beatIdx = clamp(Math.floor(num(MS.beatPhase, 0) * BEATS_PER_BAR), 0, BEATS_PER_BAR - 1);
      c.conf = clamp(num(MS.gridConf, 0), 0, 1);
      c.src = 'grelha';
    } else {
      // sem grelha: 4/4 assumido a partir do bombo — o relógio não congela (f16 §1-1)
      c.barTick = Math.floor(st.dBeat / BEATS_PER_BAR);
      c.phraseTick = Math.floor(c.barTick / PHRASE_BARS);
      c.beatIdx = st.dBeat % BEATS_PER_BAR;
      c.barIdx = c.barTick % PHRASE_BARS;
      c.conf = 0.25;
      c.src = 'bombo';
    }
    c.beatTick = st.dBeat;
    c.ageMs = Math.max(0, (tSec - st.lastBeatAt) * 1000);
    return c;
  }

  /* ---- lê o motor e decide se é hora de trocar (SÓ em fronteiras do relógio) ----
     Devolve as arestas deste frame para os acentos (`driveHats`). */
  function pollAndMaybeSwitch(tSec) {
    const cfg = S();
    const MS = MSget();
    const holdBars = Math.max(1, Math.round(num(cfg.holdBars, 8)));
    const edges = { beat: false, bar: false, phrase: false };

    if (!MS) {
      /* SEM MOTOR: relógio próprio, para o sistema não parecer avariado em silêncio (e para o David
         poder afinar os viés sem música). Avisa UMA vez — degrada sem erros, como manda o brief. */
      if (!st.warned) {
        st.warned = true;
        console.warn('[MB2] estrelato: motor de música ausente (window.MUSIC) — a alternar por ' +
          'relógio próprio ("estrelato: auto s"). Com ?src=music (ou a tecla `g` do gerador ' +
          'sintético) as trocas passam a acontecer em fronteiras musicais.');
      }
      const autoS = Math.max(2, num(cfg.autoSec, 12));
      if (tSec >= st.autoNextAt) {
        st.autoNextAt = tSec + autoS;
        // o relógio autónomo conta como um compasso (para a reserva e o hold não ficarem parados)
        st.clk.barTick++; if (st.clk.barTick % PHRASE_BARS === 0) st.clk.phraseTick++;
        setStar(pickStar('GROOVE', 1), tSec, 'auto');
      }
      st.fsm = 'GROOVE';
      return edges;
    }

    const fsm = typeof MS.fsm === 'string' ? MS.fsm : 'GROOVE';
    const drop = num(MS.dropCount, 0);
    const act = MS.act == null ? 1 : clamp(num(MS.act, 1), 0, 1);
    const c = readClock(MS, tSec);
    st.fsm = fsm;

    // arestas deste frame (por delta — como `snareCount`/`dropCount`)
    if (st.lastBeatTick >= 0 && c.beatTick > st.lastBeatTick) { edges.beat = true; st.lastBeatAt = tSec; }
    if (st.lastBarTick >= 0 && c.barTick > st.lastBarTick) { edges.bar = true; st.lastBarAt = tSec; }
    if (st.lastPhraseTick >= 0 && c.phraseTick > st.lastPhraseTick) edges.phrase = true;

    // 1ª leitura: só regista (senão trocava logo por cada evento já acumulado na sessão)
    if (st.lastDrop < 0) {
      st.lastDrop = drop; st.lastFsm = fsm; st.sinceBar = c.barTick;
      st.lastBeatTick = c.beatTick; st.lastBarTick = c.barTick; st.lastPhraseTick = c.phraseTick;
      return edges;
    }
    st.lastBeatTick = c.beatTick; st.lastBarTick = c.barTick; st.lastPhraseTick = c.phraseTick;

    /* o all-on do MOTOR (gesto `all-on` no drop, music.js) gasta a MESMA reserva: se o motor o
       disparou, o estrelato regista-o — senão a sala fazia dois all-on seguidos de donos diferentes. */
    const gest = MS.gest && typeof MS.gest === 'object' ? MS.gest.name : null;
    if (gest === 'all-on' && st.star !== 'all' && c.phraseTick - st.lastAllOnPhrase > 0) st.lastAllOnPhrase = c.phraseTick;

    // ---- fronteira 1: DROP (a mais forte — é um acento; troca já) ----
    if (drop > st.lastDrop) {
      st.lastDrop = drop;
      st.lastFsm = fsm;
      sectionReset(tSec);
      setStar(pickStar('DROP', act), tSec, 'drop');
      return edges;
    }

    // ---- fronteira 2: transição de FSM → reset + troca PENDENTE até ao barTick ----
    if (fsm !== st.lastFsm) {
      const prev = st.lastFsm;
      st.lastFsm = fsm;
      sectionReset(tSec);
      if (fsm === 'PRE_DROP') {
        // hook do blackout (S4): não se re-sorteia — a estrela do build segura até ao drop
      } else if (fsm === 'DROP' && prev !== 'DROP') {
        setStar(pickStar('DROP', act), tSec, 'fsm DROP');       // acento: já
      } else {
        st.pending = fsm; st.pendingAt = tSec;                  // lento: no próximo compasso
      }
      return edges;
    }

    // ---- executar a troca pendente numa aresta lenta (ou por timeout se o relógio morreu) ----
    if (st.pending) {
      const dead = (tSec - st.pendingAt) >= PENDING_TIMEOUT_S;
      if (edges.bar || edges.phrase || dead) {
        const f = st.pending; st.pending = '';
        setStar(pickStar(f, act), tSec, dead ? 'fsm ' + f + ' (timeout)' : 'fsm ' + f);
        return edges;
      }
    }

    // ---- fronteira 3: fim de frase (a cada `holdBars` compassos no mesmo estrelato) ----
    if ((edges.bar || edges.phrase) && fsm !== 'PRE_DROP' && c.barTick - st.sinceBar >= holdBars) {
      setStar(pickStar(fsm, act), tSec, 'frase');
    }
    return edges;
  }

  /* ---- gestos dos chapéus: o único elemento que este módulo comanda por CHAMADA ----
     (o mikado e a bola já têm máquinas próprias e comandam-se por ganho — dois donos a escrever no
     mesmo sítio é a receita dos bugs deste repo.)
       estrela 'hats'/'all' — gesto FORTE, no `beatTick` (acento = aresta de tempo, f16 §1-2). A
                         cadência `hatsHz` (teto 3 Hz) diz quantos tempos saltar; `act` alto = mais
                         densa. Sem `beatTick` há 1,5 s → timer próprio (degradação).
       estrela 'ball'  — AUXILIAR (spec §5a): apoio de um chapéu no `barTick`; `auxPerMin` vira
                         probabilidade por compasso (o random escolhe SE, o compasso diz QUANDO —
                         o jitter aleatório de antes foi abatido).
       'mikado'/'smooth'/'fade' — nada (exclusão mútua / repouso). */
  function driveHats(tSec, edges, act) {
    if (!hats || !hats.pulse) return;
    if (hats.mountedCount === 0) return;      // desligado no painel: não é elegível, nem se toca
    const cfg = S();
    const MS = MSget();
    const hz = clamp(num(cfg.hatsHz, 2.2), 0.2, 3);            // TETO 3 Hz (regra da sala)
    const a = clamp(num(act, 1), 0, 1);

    if (st.star === 'hats' || st.star === 'all') {
      const kind = st.hatsGesture ? 'seq' : 'all';
      const clockAlive = (tSec - st.lastBeatAt) < CLOCK_DEAD_S;
      if (clockAlive && MS) {
        if (!edges.beat) return;
        // bpm real (bpmEst é PERÍODO em ms — mapa-frentes §1) → quantos tempos por acento
        const periodMs = num(MS.bpmEst, 0) > 0 ? MS.bpmEst : 60000 / 128;
        const beatHz = 1000 / periodMs;
        const wantHz = hz * (0.55 + 0.45 * a);                     // `act` baixo = mais espaçado
        st.hatsBeatDiv = Math.max(1, Math.round(beatHz / Math.max(0.2, wantHz)));
        if (st.clk.beatTick % st.hatsBeatDiv !== 0) return;
        hats.pulse(kind, tSec);
        st.hatsNextAt = tSec + 1 / Math.max(0.2, wantHz);
        return;
      }
      // relógio morto: timer próprio (como antes de S2)
      const gap = Math.max(1 / 3, 1 / hz);
      if (tSec >= st.hatsNextAt) { st.hatsNextAt = tSec + gap; hats.pulse(kind, tSec); }
      return;
    }
    if (st.star === 'ball') {
      const perMin = Math.max(0, num(cfg.auxPerMin, 14));
      if (perMin <= 0) return;
      const clockAlive = (tSec - st.lastBarAt) < PENDING_TIMEOUT_S;
      if (clockAlive && MS) {
        if (!edges.bar) return;
        const periodMs = num(MS.bpmEst, 0) > 0 ? MS.bpmEst : 60000 / 128;
        const barsPerMin = 60000 / (periodMs * BEATS_PER_BAR);
        const p = clamp((perMin / Math.max(1, barsPerMin)) * (0.6 + 0.6 * a), 0, 1);
        if (Math.random() < p) hats.pulse('one', tSec);
        return;
      }
      if (tSec >= st.hatsNextAt) { st.hatsNextAt = tSec + 60 / perMin; hats.pulse('one', tSec); }
    }
  }

  /* ---- rampa dos ganhos: uma peça entra e sai em ~`rampSec`, nunca de um frame para o outro ---- */
  function rampTo(cur, target, dt, rampSec) {
    const k = 1 - Math.exp(-dt / Math.max(0.05, rampSec));
    const v = cur + (target - cur) * k;
    return Number.isFinite(v) ? v : target;   // regra 7: rede final
  }

  function update(tSec, dt) {
    const cfg = S();
    const t = Number.isFinite(tSec) ? tSec : 0;
    const d = Number.isFinite(dt) ? clamp(dt, 0, 0.1) : 0.016;

    /* DESLIGADO: multiplicadores todos a 1 — o spike volta ao comportamento da F11, sem resíduos.
       (O par liga/desliga tem de ser SIMÉTRICO: não basta parar de escrever, é preciso REPOR.) */
    if (cfg.on === false) {
      gain.ball = 1; gain.mikado = 1; gain.hats = 1; gain.wash = 1; gain.hatsMode = 0; gain.preDrop = 0;
      st.gBall = 1; st.gMik = 1; st.gHat = 1; st.gWash = 1;
      return;
    }

    const MS = MSget();
    const act = (MS && MS.act != null) ? clamp(num(MS.act, 1), 0, 1) : 1;

    /* ---- o David acabou de DESLIGAR a peça que estava no palco? ----
       A elegibilidade só era testada no SORTEIO, portanto uma peça desligada a meio do seu
       estrelato continuava a ser a estrela até à fronteira musical seguinte — e nesse intervalo a
       sala ficava a servir uma peça que já não existe. Isto NÃO é o motor a ligar/desligar nada — é
       o motor a REAGIR ao que o David desligou. Escolhe-se já outra estrela, sem esperar. */
    if (!eligible(st.star) && st.star !== 'fade') {
      setStar(pickStar(st.fsm, act), t, 'desmontado');
    }

    const edges = pollAndMaybeSwitch(t);
    driveHats(t, edges, act);

    const P = PROFILE[st.star] || PROFILE.smooth;
    /* `força` (knob) mistura o perfil com o neutro: 0 = estrelato inerte (tudo a 1, útil para
       comparar), 1 = perfil cheio. É o botão do David para dizer "menos teatro" sem desligar. */
    const amt = clamp(num(cfg.strength, 1), 0, 1);
    const mix = (x) => 1 + (x - 1) * amt;
    const ramp = Math.max(0.05, num(cfg.rampSec, 0.6));

    /* BREAKDOWN (f16 §1-5): wash por knob. (b) discreta → `sync: breakdown wash` (0.3 = a sala
       desce, o dimmer baixa no breakdown); (a) protagonista → wash cheio com a bola. Mikado em
       reserva total em qualquer das leituras (já vem da tabela HERO: peso 0). */
    let wash = P.wash;
    if (st.fsm === 'BREAKDOWN') {
      const sy = SYNC();
      wash = sy.ballHero ? Math.max(P.wash, 1.0) : Math.min(P.wash, sy.bdWash);
    }

    st.gBall = rampTo(st.gBall, mix(P.ball), d, ramp);
    st.gMik = rampTo(st.gMik, mix(P.mikado), d, ramp);
    st.gHat = rampTo(st.gHat, mix(P.hats), d, ramp);
    st.gWash = rampTo(st.gWash, mix(wash), d, ramp);

    gain.ball = clamp(st.gBall, 0, 2);
    gain.mikado = clamp(st.gMik, 0, 2);
    gain.hats = clamp(st.gHat, 0, 2);
    gain.wash = clamp(st.gWash, 0, 2);
    gain.hatsMode = st.hatsGesture;
    gain.preDrop = st.fsm === 'PRE_DROP' ? 1 : 0;   // hook do blackout (S4)
  }

  return {
    update,
    // vista pública só de leitura (HUD `h` e diagnóstico na consola)
    get star() { return st.star; },
    get prev() { return st.prev; },
    get changes() { return st.changes; },
    get gain() { return gain; },
    // S2: diagnóstico do relógio e da reserva (`MB2.stardom.clock`, `.reserve`)
    get fsm() { return st.fsm; },
    get pending() { return st.pending; },
    get clock() { return st.clk; },
    get reserve() {
      return { phrasesSinceAllOn: st.clk.phraseTick - st.lastAllOnPhrase, allOnCount: st.allOnCount,
        readiness: allOnReadiness(), reservePhrases: SYNC().reserve };
    },
  };
}
