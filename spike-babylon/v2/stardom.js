// v2/stardom.js — F12 §5: SISTEMA DE ESTRELATO (docs/f12-estrelato.md).
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
// Em cada instante há UM `star` ∈ { 'ball', 'mikado', 'hats', 'smooth' }:
//   ball    — a bola é a estrela: feixes/pontos abertos; os chapéus entram como AUXILIARES
//             (flashes ligeiros de apoio, spec §5a); o mikado cala-se (fica no repouso).
//   mikado  — o teto é a estrela: rajadas do mikado libertadas; CHAPÉUS FORA (exclusão mútua,
//             spec §4); a bola desce para um papel de fundo (não desaparece — continua a girar,
//             regra 2 do CLAUDE.md).
//   hats    — os chapéus são a estrela (spec §5b): resto da sala EM BAIXO (wash e mikado
//             recolhem) e os chapéus a flashar, todos juntos ou em sequência ponta-a-ponta.
//   smooth  — ninguém é estrela: tudo subtil, a sala respira. É o estado de repouso e o que dá
//             valor aos outros três (sem vales não há picos).
//
// EXCLUSÃO MÚTUA (spec §4) é ESTRUTURAL, não uma regra à parte: só há um `star` de cada vez, logo
// mikado e chapéus nunca podem ser estrela ao mesmo tempo. A única coisa que os chapéus fazem fora
// do seu estrelato é o papel AUXILIAR durante o estrelato da BOLA — que é o que a spec pede.
//
// ================================ COMO SE LIGA À MÚSICA ================================
// MESMO padrão da F11 (mikado.js): POLL de `window.MUSIC.state`, ZERO linhas alteradas em
// `web/music.js`. Logo não há bump de cache-buster do motor e a F9 fica intocada.
// Lê-se: `fsm` (GROOVE/BUILD/BREAKDOWN/PRE_DROP/DROP), `bar` (compasso), `dropCount` (monotónico)
// e `act` (densidade espectral → atividade). Sem motor, corre um relógio próprio (`autoBars`) para
// o David ver o sistema a alternar mesmo em silêncio.
//
// ---- AS TROCAS ACONTECEM EM FRONTEIRAS MUSICAIS (requisito do brief), nunca a meio de nada ----
// Só se troca de estrela em três sítios:
//   1. uma TRANSIÇÃO de FSM (o motor decidiu que a música mudou de secção);
//   2. um DROP (o `dropCount` subiu) — o momento mais forte, escolhe sempre uma estrela nova;
//   3. o fim de uma FRASE (a cada `holdBars` compassos, com a grelha do motor) — para não ficar
//      preso na mesma peça se a música não mudar de secção durante muito tempo.
// Entre fronteiras o estado é ESTÁVEL: nada troca por acaso a meio de um compasso.
//
// ================================ QUEM ESCOLHE A ESTRELA ================================
// Sorteio ponderado com três knobs de VIÉS (spec §5: "knob para calibrar o viés de estrelato").
// Três regras por cima do sorteio:
//   a) ELEGIBILIDADE — um elemento DESLIGADO no painel (`bola (0/1)`, `mikado (0/1)`,
//      `chapéus (0/1)`) não é elegível; o peso dele redistribui-se pelos restantes (exigência
//      explícita do brief). O motor NUNCA liga/desliga nada — esses toggles são só do David.
//   b) NÃO REPETIR — a estrela anterior leva um corte no peso, senão o sorteio cola-se a uma peça.
//   c) SMOOTH tem peso próprio e é o fallback quando não há mais ninguém elegível (com tudo
//      desligado, o sistema fica em `smooth` em vez de rebentar).
// A FSM tempera o sorteio: em BREAKDOWN a sala quer respirar (smooth pesa mais); num DROP quer
// gesto (smooth pesa quase nada). Isso são multiplicadores, não regras rígidas — a música manda,
// mas o David continua a poder puxar tudo para o lado que quiser com os viés.
//
// ================================ O QUE ESTE MÓDULO ESCREVE ================================
// NADA de knobs do David e NADA que o motor de música já escreva (senão lutavam pelo mesmo estado
// e o último a escrever ganhava — o bug clássico deste repo). Escreve só em `CONFIG.stardom.gain`,
// multiplicadores 0..1+ que os módulos LEEM:
//     gain.ball   → main.js  (peso dos feixes/pontos da bola, via `E.spotGain`)
//     gain.mikado → mikado.js (probabilidade de rajada + brilho de repouso)
//     gain.hats   → hats.js   (força do flash) — e o modo do gesto vem em `gain.hatsMode`
//     gain.wash   → main.js  (o wash da sala recolhe quando os chapéus são estrela)
// Todos com rampa (não há saltos: uma peça entra e sai em ~0,6 s), todos NaN-safe (regra 7), todos
// a 1.0 quando o sistema está desligado — `estrelato (0/1)` = 0 devolve o spike ao comportamento
// da F11 exatamente.
//
// createStardom(CONFIG, deps) -> { update(tSec, dt), state }
//   deps: { hats } — só para os gestos dos chapéus (`hats.pulse`). O mikado e a bola são comandados
//   por ganho, não por chamadas: eles já têm as suas máquinas e não se lhes quer um segundo dono.

function num(v, d) { return Number.isFinite(v) ? v : d; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

const STARS = ['ball', 'mikado', 'hats', 'smooth'];

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
};

/* Tempero da FSM: multiplicador do PESO de cada candidato conforme a secção da música.
   Ler por linhas: "num BREAKDOWN, a probabilidade de ficar smooth é 2,2× a base". */
const FSM_TILT = {
  GROOVE:    { ball: 1.00, mikado: 1.00, hats: 1.00, smooth: 1.00 },
  BREAKDOWN: { ball: 0.70, mikado: 0.55, hats: 0.80, smooth: 2.20 },  // respirar
  BUILD:     { ball: 1.10, mikado: 1.30, hats: 1.20, smooth: 0.45 },  // tensão a subir
  PRE_DROP:  { ball: 1.00, mikado: 1.40, hats: 1.30, smooth: 0.30 },
  DROP:      { ball: 1.30, mikado: 1.40, hats: 1.30, smooth: 0.10 },  // gesto, quase nunca vazio
};

export function createStardom(CONFIG, deps = {}) {
  const hats = deps.hats || null;
  const S = () => CONFIG.stardom || {};

  /* saída viva: os multiplicadores que os outros módulos leem. Criado AQUI (e não em config.js)
     para nunca poder faltar — regra 7: todo o estado novo nasce com valor. `hatsMode` é o gesto
     que os chapéus devem usar quando SÃO a estrela (0 = juntos, 1 = sequência). */
  if (!CONFIG.stardom || typeof CONFIG.stardom !== 'object') CONFIG.stardom = {};
  const gain = CONFIG.stardom.gain = { ball: 1, mikado: 1, hats: 1, wash: 1, hatsMode: 0 };

  /* estado interno — TUDO com valor inicial (regra 7 do CLAUDE.md: um `undefined` aqui propaga-se
     para os multiplicadores e apaga feixes/flashes em silêncio). */
  const st = {
    star: 'smooth',        // estrela corrente
    prev: 'smooth',        // estrela anterior (para o corte de repetição)
    since: 0,              // tSec da última troca
    sinceBar: 0,           // compasso da última troca (fronteira de frase)
    lastFsm: '',           // FSM do frame anterior (deteção de transição)
    lastDrop: -1,          // dropCount do frame anterior (-1 = ainda não lido)
    lastBar: -1,
    autoNextAt: 0,         // relógio autónomo (sem motor)
    // ganhos suavizados (rampa) — começam no perfil `smooth` para não haver salto no 1º frame
    gBall: PROFILE.smooth.ball, gMik: PROFILE.smooth.mikado,
    gHat: PROFILE.smooth.hats, gWash: PROFILE.smooth.wash,
    // gesto dos chapéus quando são estrela: 0 = todos juntos, 1 = sequência ponta-a-ponta
    hatsGesture: 0,
    hatsNextAt: 0,         // próximo gesto dos chapéus (estrelato ou auxiliar)
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
    return false;
  }

  /* ---- sorteio ponderado da próxima estrela ----
     peso = viés do knob × tempero da FSM × corte de repetição. Só entram os elegíveis. */
  function pickStar(fsm) {
    const cfg = S();
    const tilt = FSM_TILT[fsm] || FSM_TILT.GROOVE;
    const bias = {
      ball: Math.max(0, num(cfg.biasBall, 1)),
      mikado: Math.max(0, num(cfg.biasMikado, 1)),
      hats: Math.max(0, num(cfg.biasHats, 1)),
      smooth: Math.max(0, num(cfg.biasSmooth, 0.8)),
    };
    // 0 = pode repetir à vontade · 1 = nunca repete (o peso da anterior vai a zero)
    const noRepeat = clamp(num(cfg.noRepeat, 0.75), 0, 1);

    const names = [], w = [];
    let total = 0;
    for (const s of STARS) {
      if (!eligible(s)) continue;
      let x = bias[s] * num(tilt[s], 1);
      if (s === st.star) x *= (1 - noRepeat);
      if (!(x > 0)) continue;
      names.push(s); w.push(x); total += x;
    }
    if (!names.length) return 'smooth';   // tudo desligado / todos os viés a zero → repouso
    let r = Math.random() * total;
    for (let i = 0; i < names.length; i++) { r -= w[i]; if (r <= 0) return names[i]; }
    return names[names.length - 1];
  }

  function setStar(next, tSec, bar, why) {
    if (next === st.star) return false;
    st.prev = st.star;
    st.star = next;
    st.since = tSec;
    st.sinceBar = bar;
    st.changes++;
    /* o GESTO dos chapéus escolhe-se UMA vez por estrelato (não a meio): dentro do mesmo momento a
       sala tem de ler como um só gesto — "todos juntos" OU "a onda", nunca os dois misturados.
       O knob `chapéus: gesto (0=juntos/1=seq/2=alterna)` manda; em 2 alterna a cada estrelato. */
    if (next === 'hats') {
      const g = Math.round(num(S().hatsGesture, 2));
      st.hatsGesture = (g === 0 || g === 1) ? g : (st.hatsGesture ? 0 : 1);
    }
    st.hatsNextAt = tSec;   // o novo papel dos chapéus começa já (não espera o relógio anterior)
    return true;
  }

  /* ---- lê o motor e decide se é hora de trocar (SÓ em fronteiras musicais) ---- */
  function pollAndMaybeSwitch(tSec) {
    const cfg = S();
    const MS = (typeof window !== 'undefined' && window.MUSIC && window.MUSIC.state) || null;
    const holdBars = Math.max(1, Math.round(num(cfg.holdBars, 8)));

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
        setStar(pickStar('GROOVE'), tSec, 0, 'auto');
      }
      return 'GROOVE';
    }

    const fsm = typeof MS.fsm === 'string' ? MS.fsm : 'GROOVE';
    const bar = Math.round(num(MS.bar, 0));
    const drop = num(MS.dropCount, 0);

    // 1ª leitura: só regista (senão trocava logo por cada evento já acumulado na sessão)
    if (st.lastDrop < 0) { st.lastDrop = drop; st.lastFsm = fsm; st.lastBar = bar; st.sinceBar = bar; return fsm; }

    // ---- fronteira 2: DROP (a mais forte — troca sempre) ----
    if (drop > st.lastDrop) {
      st.lastDrop = drop;
      st.lastFsm = fsm;
      setStar(pickStar('DROP'), tSec, bar, 'drop');
      return fsm;
    }

    // ---- fronteira 1: transição de FSM (a música mudou de secção) ----
    if (fsm !== st.lastFsm) {
      st.lastFsm = fsm;
      setStar(pickStar(fsm), tSec, bar, 'fsm ' + fsm);
      return fsm;
    }

    // ---- fronteira 3: fim de frase (a cada `holdBars` compassos no mesmo estrelato) ----
    if (bar !== st.lastBar) {
      st.lastBar = bar;
      if (bar - st.sinceBar >= holdBars) setStar(pickStar(fsm), tSec, bar, 'frase');
    }
    return fsm;
  }

  /* ---- gestos dos chapéus: o único elemento que este módulo comanda por CHAMADA ----
     (o mikado e a bola já têm máquinas próprias e comandam-se por ganho — dois donos a escrever no
     mesmo sítio é a receita dos bugs deste repo.)
       estrela 'hats'  — gesto FORTE, na cadência `hatsHz` (teto 3 Hz, clampado aqui e no hats.js)
       estrela 'ball'  — AUXILIAR (spec §5a): flashes LIGEIROS de apoio, um chapéu de cada vez e
                         muito mais espaçados (`auxPerMin`)
       'mikado'/'smooth' — nada (exclusão mútua / repouso). O agendador autónomo do hats.js pode
                         continuar a dar o seu Poisson discreto: isso é da sala, não do estrelato. */
  function driveHats(tSec) {
    if (!hats || !hats.pulse) return;
    if (hats.mountedCount === 0) return;      // desligado no painel: não é elegível, nem se toca
    const cfg = S();

    if (st.star === 'hats') {
      const hz = clamp(num(cfg.hatsHz, 2.2), 0.2, 3);       // TETO 3 Hz (regra da sala)
      const gap = Math.max(1 / 3, 1 / hz);
      if (tSec >= st.hatsNextAt) {
        st.hatsNextAt = tSec + gap;
        hats.pulse(st.hatsGesture ? 'seq' : 'all', tSec);
      }
      return;
    }
    if (st.star === 'ball') {
      const perMin = Math.max(0, num(cfg.auxPerMin, 14));
      if (perMin <= 0) return;
      if (tSec >= st.hatsNextAt) {
        // jitter de ±35%: um apoio a intervalos exatos lê-se como metrónomo, não como técnico
        st.hatsNextAt = tSec + (60 / perMin) * (0.65 + Math.random() * 0.7);
        hats.pulse('one', tSec);
      }
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
      gain.ball = 1; gain.mikado = 1; gain.hats = 1; gain.wash = 1; gain.hatsMode = 0;
      st.gBall = 1; st.gMik = 1; st.gHat = 1; st.gWash = 1;
      return;
    }

    /* ---- o David acabou de DESLIGAR a peça que estava no palco? ----
       A elegibilidade só era testada no SORTEIO, portanto uma peça desligada a meio do seu
       estrelato continuava a ser a estrela até à fronteira musical seguinte — e nesse intervalo a
       sala ficava a servir uma peça que já não existe (com o mikado desligado, os chapéus ficavam
       em silêncio por causa da exclusão mútua, e não se via nada). Medido: 22 amostras com
       `star = 'mikado'` depois de `mikado (0/1)` ir a 0.
       Isto NÃO é o motor a ligar/desligar nada — é o motor a REAGIR ao que o David desligou, que é
       exatamente o que o brief pede ("elemento off no painel = estrelato dele não elegível,
       redistribui pelos restantes"). Escolhe-se já outra estrela, sem esperar pela fronteira. */
    if (!eligible(st.star)) {
      const MS = (typeof window !== 'undefined' && window.MUSIC && window.MUSIC.state) || null;
      const fsm = (MS && typeof MS.fsm === 'string') ? MS.fsm : 'GROOVE';
      setStar(pickStar(fsm), t, MS ? Math.round(num(MS.bar, 0)) : 0, 'desmontado');
    }

    pollAndMaybeSwitch(t);
    driveHats(t);

    const P = PROFILE[st.star] || PROFILE.smooth;
    /* `força` (knob) mistura o perfil com o neutro: 0 = estrelato inerte (tudo a 1, útil para
       comparar), 1 = perfil cheio. É o botão do David para dizer "menos teatro" sem desligar. */
    const amt = clamp(num(cfg.strength, 1), 0, 1);
    const mix = (x) => 1 + (x - 1) * amt;
    const ramp = Math.max(0.05, num(cfg.rampSec, 0.6));

    st.gBall = rampTo(st.gBall, mix(P.ball), d, ramp);
    st.gMik = rampTo(st.gMik, mix(P.mikado), d, ramp);
    st.gHat = rampTo(st.gHat, mix(P.hats), d, ramp);
    st.gWash = rampTo(st.gWash, mix(P.wash), d, ramp);

    gain.ball = clamp(st.gBall, 0, 2);
    gain.mikado = clamp(st.gMik, 0, 2);
    gain.hats = clamp(st.gHat, 0, 2);
    gain.wash = clamp(st.gWash, 0, 2);
    gain.hatsMode = st.hatsGesture;
  }

  return {
    update,
    // vista pública só de leitura (HUD `h` e diagnóstico na consola)
    get star() { return st.star; },
    get prev() { return st.prev; },
    get changes() { return st.changes; },
    get gain() { return gain; },
  };
}
