/* music.js — motor musical da bola (Mirrors of Emotions, Fase 5: "motor forte").
 *
 * Plano: agent-os/docs/2026-08-28_mirrors-of-emotions-plan.md — §0, §0.1 (feedback verbatim do
 * David após a primeira audição: É ESTA A SPEC), §3, §4.0.
 *
 * ============================ O QUE MUDOU NA FASE 5 (e porquê) ============================
 * A Fase 2 entregou um motor correto e inaudível: "muito fraca". O diagnóstico do David não é
 * de afinação, é de ATITUDE. Três decisões estruturais saíram de §0.1:
 *
 * 1) SKIN É DO UTILIZADOR, NUNCA DO MOTOR. Nada aqui chama `setSkinAuto`. A tecla `w` / o botão
 *    da bola mandam. Se em modo música a skin estiver em 'auto' (que sem fonte de tom fica
 *    presa num alvo que ninguém escreve), forçamos UMA vez para 'dark' — a sala de clube.
 *    O knob `tone` deixou de existir no motor.
 *
 * 2) RPM SEGUE O BOMBO, com amplitude VISÍVEL. Não é energia genérica: é presença de kick.
 *    Bombo a bater → 2.4-3.0 rpm. Bombo pára → 0.0-0.15 rpm em ~1.5 s. O sidecar não dá grelha
 *    (só features a 50 Hz), por isso o kick, o BPM e a grelha são detetados AQUI (§KICK/§GRID).
 *
 * 3) GESTOS TEATRAIS. O técnico de luz não é um envelope follower — em breakdown/build ele faz
 *    coisas que NÃO estão no áudio: para a bola, apaga a esfera, gira às escuras. O módulo
 *    GESTURES é um repertório de 8 gestos que se SOBREPÕEM à Camada 1 (multiplicativo/override
 *    por variável, com peso que entra e sai por rampa), escolhidos por um RNG com seed de sessão.
 *
 * ============================== CONTRATO DE MENSAGENS ==============================
 * Tudo chega por `postMessage` à window do iframe (do pai, ou do gerador local de testes).
 * Origem não é validada: é loopback local (mesma regra do core.js).
 *
 * 1) FEATURES — contínuas, ~50 Hz (é EXATAMENTE o que o audio-sidecar :3739 emite):
 *    { type:'features', t, rms, bass, mid, high, sub, hat, centroid, density,
 *      onset, subOnset, subFluxRaw, hatFluxRaw, loudness, silence }
 *    ⚠ As bandas (`bass`/`mid`/`high`/`sub`/`hat`) vêm 0..1 sobre uma escala de **dB própria de
 *      cada banda** (referência = máximo lento ~40 s, estilo Milkdrop). NÃO são normalizadas
 *      umas contra as outras — fazê-lo punha `bass≡1.0` e matava a variância de que qualquer
 *      detetor de batida precisa (medido 2026-08-28; ver server.js `bandUnit`).
 *    ⚠ `onset`/`subOnset` são 0..1 normalizados ao máximo CORRENTE de flux — cómodos para
 *      visualização, inúteis como limiar (o máximo corrente achata todas as batidas a ~1.0).
 *      Para detetar batidas usam-se `subFluxRaw`/`hatFluxRaw`: flux LINEAR CRU da banda, sem
 *      normalização nenhuma. Normalizar é decisão do consumidor, não do produtor.
 *    ⚠ Campos `*Raw` podem FALTAR (sidecar antigo, gerador sintético `g`, replays gravados
 *      antes de 2026-08-28). Todo o consumidor tem fallback — ver §KICK e §BANDONSET.
 *    ⚠ O sidecar NÃO emite `grid` nem `hint`. Ambos nascem aqui.
 *
 * 2) GRELHA — emitida LOCALMENTE por este ficheiro (§GRID) pelo mesmo `onMessage`, para a
 *    Camada 2 (extrapolação de fase, fronteiras de compasso/frase) funcionar com áudio real:
 *    { type:'grid', v:1, t0, beatPeriodMs, beatsPerBar, barsPerPhrase, barIndex, phraseIndex,
 *      confidence }   — `confidence` = regularidade dos intervalos entre kicks.
 *
 * 3) RELÓGIO — handshake NTP simplificado (§2.2 do plano); ver MB_CLOCK.
 * 4) PERFIL — { type:'profile', value:'electronica'|'acustico'|'voz' } (ou tecla `p`).
 * 5) ESTADO (saída) — { type:'mb-state', … } para o pai, 4 Hz.
 *
 * Arbitragem (§2.4): o estado interno evolui SEMPRE, mas só se escreve no CONFIG/setSpot/BRIDGE
 * se MB_SOURCE.owner === 'music'. Ao ganhar a posse parte-se dos valores ATUAIS e rampa-se.
 *
 * Tetos invioláveis (§1.2): beamIntensity ≤ 0.18 · nada oscila acima de 3 Hz · greyscale.
 *
 * Teclas: `m` HUD · `g` gerador sintético · `n` próxima fase do gerador · `p` cicla perfil.
 */
'use strict';
(() => {

const { clamp, lerp, smooth, anchor, ease } = window.MB_CORE;
const TAU = Math.PI * 2;

/* ============================ MB_CLOCK — NTP simplificado ============================ */
// Estimador de offset entre o relógio do emissor e o `performance.now()` local. Guarda as
// amostras de menor RTT e usa a MEDIANA dos offsets — mediana e não média porque uma única
// amostra com jitter alto (GC, tab em background) envenena a média e desloca a fase do drop.
const MB_CLOCK = (() => {
  const KEEP = 5;
  let samples = [];          // { rtt, offset }
  let offset = 0, reqId = 0;
  const pending = new Map(); // id → tClient

  function request(target) {
    const id = ++reqId, tClient = now();
    pending.set(id, tClient);
    const ext = window.MUSIC && window.MUSIC.gen && window.MUSIC.gen.isExternal && window.MUSIC.gen.isExternal();
    const to = target || (ext && window.parent !== window ? window.parent : window);
    to.postMessage({ type: 'clock-req', id, tClient }, '*');
    if (pending.size > 32) for (const [k, v] of pending) if (now() - v > 5000) pending.delete(k);
  }

  function ingest(msg) {
    const tClient = pending.get(msg.id);
    if (tClient == null) return;
    pending.delete(msg.id);
    const tRecv = now(), rtt = tRecv - tClient;
    samples.push({ rtt, offset: msg.tEmit - (tClient + tRecv) / 2 });
    samples.sort((a, b) => a.rtt - b.rtt);
    samples = samples.slice(0, KEEP);
    const offs = samples.map(s => s.offset).sort((a, b) => a - b);
    offset = offs[(offs.length - 1) >> 1];
  }

  function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

  return {
    ingest, request, now,
    toLocal(tRemote) { return tRemote - offset; },
    get offset() { return offset; },
    get quality() { return samples.length ? samples[0].rtt : Infinity; },
    reset() { samples = []; offset = 0; pending.clear(); },
  };
})();
window.MB_CLOCK = MB_CLOCK;

/* ================================== CONFIG afinável ================================== */
// §5: nada de números soltos no código. Tudo aqui, sobreponível em runtime por
// music.config.json (deep-merge) sem rebuild.
const MUSIC = {
  /* ---- Perfil ativo ---- */
  profile: 'electronica',          // 'electronica' | 'acustico' | 'voz'

  /* ---- §PROFAUTO — deteção automática de perfil ----
   * O problema medido: com `electronica` a correr sobre jazz, a bola gira a 2.95 rpm durante
   * 159 s. Nenhum valor de `kickC0` corrige isto (varrido de 2.79 a 16) — o detetor lê
   * contrabaixo e bombo de bateria como bombo de clube. Não é um limiar mal posto, é o perfil
   * errado. Daí um classificador, e não mais afinação.
   *
   * SINAL PRIMÁRIO = REGULARIDADE, não timbre. Medido em duas gravações reais:
   *   · medianas globais separam (density techno 0.34 vs jazz 0.58; hat 0.00 vs 0.58) MAS em
   *     janelas de 10 s as distribuições SOBREPÕEM-SE (o techno aos 50 s dá density 0.58,
   *     hat 0.57 — indistinguível do jazz). Um classificador sobre valores instantâneos
   *     trocaria de perfil a meio da faixa, que é pior do que estar sempre errado.
   *   · o que separa de forma estável é o coeficiente de variação dos INTERVALOS ENTRE KICKS:
   *     CV p50 techno 0.15 / jazz 0.50; fração de janelas com CV<0.35: 0.55 vs 0.16.
   *
   * Três defesas, cada uma nascida de uma falha medida durante a construção:
   *  1) `gapMaxMs` — um intervalo maior que isto não é irregularidade, é AUSÊNCIA de bombo
   *     (breakdown). Sem isto, o gap de 14 s do breakdown do techno entrava como um intervalo
   *     gigante e fazia o CV explodir: o techno passava a ler-se como jazz a partir dos 40 s.
   *  2) `minCoverage` — fração da janela efetivamente coberta por intervalos válidos. Abaixo
   *     disto o score CONGELA (não decai). Foi o achado decisivo: onde o techno parecia
   *     irregular (breakdown + dropouts do loopback, ~5% de frames com rms=0 nas duas
   *     gravações) a cobertura caía para 0.35, enquanto o jazz é irregular COM a janela cheia
   *     (0.75-0.99). Ausência de bombo não é prova de nada e não pode contar como evidência.
   *  3) VETO por `hat` médio longo — não se entra em `electronica` com hat alto nem em
   *     `acustico` com hat baixo. É o que impede que a secção mais regular de uma faixa de
   *     jazz (medida: CV 0.22, score a subir para 0.56 no fim da gravação) a faça saltar para
   *     `electronica`. Aqui o `hat` é SECUNDÁRIO e desempata; sozinho não decidiria nada, pelo
   *     motivo do parágrafo acima.
   *
   * O MANUAL MANDA SEMPRE: `p` (ou {type:'profile'} da tab do OS) põe `auto:false` para a
   * sessão. Nunca se sobrepõe uma escolha humana; só `MUSIC.profileAuto.auto = true` (ou um
   * reload) volta a ligar a deteção. */
  profileAuto: {
    // Interruptor mestre. NUMÉRICO (1/0) e não booleano de propósito: é um knob da §TUNE, e o
    // painel/JSON só sabem escrever números — `coerceKnob` devolveria 1/0 e o tipo mudava a meio
    // da sessão. Todos os testes são de veracidade (`!P.auto`), por isso 1/0 e true/false são
    // ambos aceites; o default fica num só tipo para não haver surpresas.
    auto: 1,                 // 1 = deteção automática ligada · 0 = desligada (comportamento antigo)
    windowMs: 30000,         // janela deslizante do histórico dedicado de kicks
    minIntervals: 16,        // intervalos válidos necessários para haver opinião
    gapMaxMs: 1200,          // acima disto o intervalo é ausência de bombo — descarta-se
    minCoverage: 0.60,       // cobertura mínima da janela para a leitura contar (ver defesa 2)
    cvRegular: 0.35,         // CV abaixo disto = janela "regular" (techno p50 0.15, jazz 0.50)
    scoreTau: 10,            // τ (s) do integrador da fração de janelas regulares
    evidenceSec: 20,         // segundos de evidência VÁLIDA antes da primeira decisão
    enterElectronica: 0.55,  // score acima disto → electronica
    enterAcustico: 0.30,     // score abaixo disto → acustico  (banda morta = histerese)
    hatElectronicaMax: 0.40, // veto: com hat médio acima disto não se entra em electronica
    hatAcusticoMin: 0.25,    // veto: com hat médio abaixo disto não se entra em acustico
    hatTau: 20,              // τ (s) da média longa de `hat` (o sinal secundário)
    minHoldSec: 45,          // tempo mínimo no perfil atual antes de considerar outra troca
  },

  /* ---- Camada 1: normalização de loudness ---- */
  // Média integrada com gate (§1.1). NÃO é o `adapt` do emotion-v2.js (seguidor de picos com
  // release de 3-5 min, que adormecia a bola ao passar de techno para ambiente).
  norm: {
    windowSec: 20,        // janela da média integrada (o divisor)
    gate: 0.02,           // abaixo disto não conta para a média
    floor: 0.12,          // piso do divisor: evita amplificar ruído numa sala silenciosa
    refMix: 0.75,         // 0 = escala fixa, 1 = totalmente relativa à janela
    shortSec: 0.35,       // janela curta que alimenta os alvos rápidos
  },

  /* ---- Detetor de BOMBO (§0.1 ponto 3) — o coração do motor ----
   * O sidecar não dá grelha. Um kick é: um ONSET, com a banda grave acima da sua própria média
   * móvel por um fator, e com energia (rms) que confirme que é uma batida e não um artefacto de
   * um trecho só-graves. Refratário de 200 ms → teto de 300 BPM, mata o duplo-disparo do mesmo
   * transiente sem cortar hi-hats (que não passam o teste do bass de qualquer modo). */
  kick: {
    bassRatio: 1.08,      // bass > média móvel × isto
    bassAvgSec: 1.6,      // janela da média móvel de bass (longa: é a "cor" da faixa)
    onsetMin: 0.22,       // subOnset (flux só nos graves) — medido: p90 0.17, picos 0.86
    subOver: 0.02,        // sub acima da média (escala dB 0..1: 0.02 ≈ +1.2 dB)       // onset mínimo para candidatar a kick
    rmsMin: 0.008,        // rms real de música a volume normal ≈ 0.02-0.05         // piso de energia: silêncio não tem kicks
    refractoryMs: 200,
    rateWindowSec: 2.0,   // janela de kicks/s
    rateFull: 1.6,        // kicks/s que equivalem a presença 1.0 (≈156 BPM em 4-on-the-floor)
    presenceTau: [0.30, 1.50],   // attack 0.3 s / release 1.5 s (§ ponto 2 do brief)
    // Duas fases na queda, e é isto que faz a rotação PARAR (não "abrandar"):
    //  1) enquanto o bombo pode só ter saltado uma batida, o alvo desce devagar (tau 1.5 s);
    //  2) confirmado o silêncio de bombo (`gapDeadSec`), o release passa a `deadTau` — porque
    //     nessa altura já não é uma dúvida, é uma decisão musical, e o David pediu que a bola
    //     PARE. Sem isto, 1.5 s de dúvida + 3τ de release davam ~6 s para chegar a zero.
    // 0.7 s ≈ 1.5 batidas a 126 BPM: tempo para uma batida falhada, não para uma secção.
    gapDeadSec: 1.6,      // sem kick há mais de isto (com música a tocar) → alvo 0
    deadTau: 0.40,        // release depois de confirmado o silêncio de bombo
  },

  /* ---- §BANDONSET — limiar por MEDIANA + variância (docs/beat-detection-research.md §6/§7) ----
   * Substitui o par "média móvel + limiares fixos" quando o sidecar manda `subFluxRaw`/`hatFluxRaw`
   * (flux LINEAR cru da banda). Três peças, todas de Patin/aubio:
   *   · mediana de N=50 frames (1 s @50 Hz — os 43 frames de Patin) em vez de média: um transiente
   *     enorme não levanta o limiar durante 1 s inteiro, que é o defeito da média.
   *   · teste de variância (o V0 de Patin): `std > minStdRatio · mediana`. É o que separa uma
   *     BATIDA de ruído estacionário — a condição que faltava por completo.
   *   · C adaptativo: C desce quando a variância relativa sobe (forma de Patin, reescalada porque
   *     a nossa unidade é flux linear e não energia).
   * ⚠ A CALIBRAÇÃO FINAL DE `C0` FAZ-SE COM MÚSICA REAL (§9 da pesquisa): a escala do flux depende
   *   da janela, do Hann e do ganho do loopback. O HUD `m` mostra mediana/std/C/BPM para isso. */
  bandOnset: {
    N: 50,                // frames de histórico = 1 s @ 50 Hz
    minStdRatio: 0.15,    // filtro V0 de Patin: std tem de exceder isto × mediana
    cFloor: 1.15,         // C nunca desce abaixo disto
    cVarGain: 0.35,       // quanto o C desce por unidade de std/mediana
    kickC0: 1.6,          // C base do bombo (sub 40-120 Hz)
    absFloor: 0.35,       // §PISOABS (medido: 0.35 = 57 kicks/25 s ≈ esperados; 0.2 = 102, duplos): kick só se flux ≥ isto × pico lento do flux (mata falsos kicks no vazio)
    kickRefractMs: 120,   // 120 ms protege até 500 BPM; os 200 ms antigos cortavam kicks duplos
    hatC0: 1.4,           // hi-hats são mais densos e regulares → C mais baixo
    hatRefractMs: 60,     // 1/16 a 140 BPM ≈ 107 ms; 60 ms dá margem
    hatEnvTau: [0.5, 0.08],  // envelope de um pólo [attack, release] — o "Fall" do Resolume
    presenceWindowMs: 2000,  // janela onde se conta a fração de batidas esperadas
    presenceMinBpm: 60,   // sem BPM fiável, assume-se isto para o divisor (não divide por zero)
    keepTimesMs: 8000,    // histórico de tempos de kick guardado (autocorrelação do §GRID)
  },

  /* ---- §SNARE — o terceiro detetor de banda: a TAROLA (David, 3ª audição) ----
   * Queixa verbatim: "a bola nao reaje a coisas obvias na musica tipo tarolas secas repentinas —
   * ou seja marcações de tempos ou contratempos que mereciam resposta da bola."
   *
   * PORQUÊ FALTAVA: só existiam dois detetores, `sub` (40-120 Hz) e `hat` (≥6 kHz). O corpo da
   * tarola vive em 200-800 Hz — cai exatamente no buraco entre os dois, dentro do `mid`
   * (150-2000 Hz), que nenhum detetor de eventos lia.
   *
   * DOIS CAMINHOS, como o §KICK:
   *
   * (1) PREFERIDO — `midFluxRaw` do sidecar (flux linear cru de 200-800 Hz, adicionado
   *     2026-08-29 em `agent-os/audio-sidecar/server.js` à imagem do `hatFlux`). Aí usa-se o
   *     §BANDONSET normal (mediana + variância + C adaptativo), como o bombo. ⚠ EXIGE RESTART
   *     DO SIDECAR — enquanto ele não reiniciar, corre o caminho (2).
   *
   * (2) FALLBACK — derivada rectificada de `mid`, para o sidecar antigo, o gerador sintético e
   *     as gravações já feitas (`tools/feat`, `tools/feat-jazz`, que não têm `midFluxRaw`).
   *     ⚠ MEDIDO: a mediana desta derivada é ~0 (p50=0.00000, p90=0.14, p99=0.78), por isso o
   *       teste por RÁCIO do §BANDONSET (`v > C·mediana`) colapsa — com mediana zero qualquer
   *       valor passa, e C0 de 1.4 a 3.5 dava sempre os mesmos ~150 disparos, 61 deles em
   *       silêncio. O fallback usa por isso limiar ADITIVO robusto (mediana + k·MAD) com PISO
   *       ABSOLUTO, que é o que funciona quando a mediana é zero.
   *     Varrimento em `tools/feat` (60 s techno) e `tools/feat-jazz` (159 s): refratário 220 ms
   *     + piso 0.32 dá 1.50/s no techno e 1.30/s no jazz — a ordem de grandeza de um contratempo,
   *     não de um 1/16. Com piso 0.18 subia a 1.77/s com 10 disparos em trechos quase mudos.
   *
   * Em AMBOS os caminhos vale o `rmsMin`: o §KICK aprendeu isso à sua custa, e o vazio de
   * `tools/feat` tem rms mediano 0.002 sem que o sidecar levante a flag `silence` uma única vez
   * (medido: 0 frames com `silence` em 2667). Sem este gate, a tarola disparava no vazio. */
  snare: {
    on: 1,                // interruptor mestre, NUMÉRICO (é um knob da §TUNE, como `profileAuto.auto`)
    C0: 1.9,              // caminho `midFluxRaw`: C base (entre o kick 1.6 e o hat 1.4… é mais esparsa)
    refractMs: 220,       // ~1 contratempo a 136 BPM; corta o rufo de 1/16 sem cortar o backbeat
    rmsMin: 0.006,        // piso de energia — o vazio de `tools/feat` tem rms mediano 0.002
    fbK: 3.0,             // fallback: limiar = mediana + fbK · MAD·1.4826
    fbFloor: 0.32,        // fallback: piso ABSOLUTO do limiar (o que faz o trabalho todo)
    // A resposta VISUAL. §0.1: "subtil" lê-se como "fraco" — e o oposto do `hat`, que é textura
    // contínua. Isto é um ACENTO SECO: sobe de golpe e cai em ~0.35 s. Nada oscila: um acento
    // pontual a ≤ ~1.5/s não é um pisca (o teto de 3 Hz é sobre OSCILAÇÃO, não sobre eventos).
    decaySec: 0.35,       // tempo de queda do acento (release do envelope de evento)
    opacityKick: 0.30,    // salto de opacidade no acento (para os EXTREMOS — ver §OPACEXTREMOS)
    spotKick: 0.35,       // salto de intensidade nos spots (fração do range que sobra até 1.6)
    beamKick: 0.35,       // salto nos feixes (fração do que falta até ao teto 0.18 — nunca o excede)
  },

  /* ---- Autocorrelação de BPM (§8 da pesquisa) — DESEMPATE, não substituição ----
   * A mediana de intervalos + fold de oitava do §GRID mantém-se: é a receita certa no caso comum
   * e é mais barata. Falha só quando o detetor perde batidas alternadas (mede o dobro do período
   * e o `foldToPrior` "corrige" para o BPM errado). A autocorrelação pontua k=1..4 batidas por
   * intervalo, logo é imune a isso — por isso entra APENAS quando `gridConf` está abaixo de
   * `confBelow`, e só se ela própria tiver score suficiente. */
  bpmAuto: {
    enabled: true,
    confBelow: 0.35,      // só desempata quando a confiança da mediana está abaixo disto
    minTimes: 4,          // menos kicks do que isto = sem opinião
    step: 0.5,            // resolução da varredura, em BPM
    minScore: 1.5,        // abaixo disto a autocorrelação também não sabe → não desempata
    tolerance: 4,         // penalização do erro relativo (1 - err·4 ⇒ tolerância ±25%)
  },

  /* ---- Estimador de BPM + grelha local (§0.1: emite `grid` para a Camada 2 já existente) ---- */
  bpm: {
    keep: 8,              // intervalos guardados (mediana dos últimos 8)
    lo: 100, hi: 150,     // prior: dobra/divide o intervalo até cair aqui (mata half/double-time)
    hysteresis: 0.04,     // só troca de BPM se a mediana se afastar > 4% da estimativa atual
    minIntervalMs: 250, maxIntervalMs: 2000,
    beatsPerBar: 4, barsPerPhrase: 16,
    confSpreadFull: 0.22, // desvio relativo dos intervalos que leva a confiança a 0
    emitEveryMs: 500,     // republica a grelha (t0 fresco) a este ritmo
  },

  /* ---- Camada 1: mapeamento forte (§0.1 ponto 3) ----
   * Já não é (V,A)→âncoras. É DIRETO: cada knob tem a sua fonte e a sua amplitude, escolhida
   * para se NOTAR. A "amplitude visível" é o requisito, não a subtileza. */
  activity: { low: 0.10, high: 0.45, beamsMin: 0.55, hatMin: 0.35, slowMax: 1.8 },  // densidade → atividade
  hat: { gain: 6, releaseSec: 0.12, beamGain: 1.0, opacityDip: 0.35 },
  strobe: {                 // estrobo de FUNDO — só se o knob da bola (CONFIG.strobe.enabled) estiver ON; OCASIONAL
    on: 1,
    dropEnter: 2,           // rajada ao ENTRAR em DROP (nº de disparos, escalonados ≥ 340 ms)
    phraseChance: 0.20,     // prob. na fronteira de frase em DROP
    grooveEveryBars: [24, 48], // §ESPAÇOS: em GROOVE com atividade alta, um estrobo isolado a cada 24-48 compassos (como num clube)
    grooveAct: 0.6,           // só com atividade acima disto
    noneBeamsMul: 0.4,        // §CENAS: sem feixes, o intervalo dos estrobos em GROOVE encurta para isto × (mais estrobo)
    burstChance: 0.35,        // §RAJADA: prob. de um estrobo sair em rajada de burstN[0..1] flashadas seguidas (≥ 360 ms cada, < 3 Hz)
    burstN: [3, 4],
    kickChanceDrop: 0.10,   // prob. por bombo nos primeiros `flash.dropBars` de DROP
    level: [0.35, 0.7],
  },   // agudos marcam: feixes sobem, opacidade dá um tique
  /* §CENAS — cenas de feixes em GROOVE (o David: 'momentos sem feixes, outros com só um ou dois feixes
   * contínuos durante um tempo'). Sorteadas na fronteira de frase, duram `everyBars`; DROP força 'full'. */
  scene: {
    on: 1,
    everyBars: [16, 48],          // duração de cada cena (compassos)
    pFull: 0.5, pFew: 0.3,        // prob. de 'full' / 'few' (o resto é 'none')
    fewFrac: 0.035,               // 'few': fração FIXA de espelhos com feixe → 1-2 feixes contínuos que rodam com a bola
    fewInt: 0.14,                 // intensidade dos feixes em 'few' (contínuos, sem tique de agudos)
  },
  /* §FLASHDIM — o técnico de luz nos pinspots (docs/lighting-design-research.md): aim FIXO, trabalha
   * o DIMMER e dispara flashes curtos. Flashes = MIRRORBALL.flash(); dimmer = ganho por fase × foco. */
  flash: {
    on: true,
    kickChance: 0.06,       // probabilidade de um bombo disparar um flash em GROOVE (era 0.30: lia-se como piscar constante)
    calmAct: 0.45,          // §CALMO: com atividade abaixo disto em GROOVE, focos STILL — nenhum flash/rajada/tarola
    kickChanceDrop: 0.85,   // …nos primeiros compassos de DROP
    dropBars: 4,            // compassos de DROP em que o bombo dispara quase sempre
    snare: 0.15,            // probabilidade de cada tarola disparar flash (era 1 = todas)
    phraseBurst: 3,         // flashes em rajada na fronteira de FRASE — só em DROP/BUILD/PRE_DROP; em GROOVE é 1 flash
    minGapMs: 340,          // nunca > 3 Hz (regra 6 do CLAUDE.md)
    intensity: [0.6, 1.0],  // intensidade sorteada
    lenMs: [80, 200],
  },
  dimmer: {                 // ganho por fase, [foco 0 (esq), foco 1 (dir), restantes]
    GROOVE:    [1.00, 0.90, 0.80],
    BREAKDOWN: [0.85, 0.12, 0.10], // corta um dos dois: a sala respira com um foco só
    BUILD:     [0.70, 0.30, 0.30], // …e o outro volta a subir ao longo do build (rampa por compassos)
    PRE_DROP:  [0.55, 0.55, 0.40],
    DROP:      [1.25, 1.25, 1.10], // dimmer a 100 % (o teto 1.6 da bola é respeitado no clamp)
    ease: 0.35,             // s de rampa entre ganhos de fase
  },
  map: {
    // rpm ← kickPresence × energia. Sem bombo: 0.0-0.15. Bombo forte: 2.4-3.0.
    rpmIdle: [0.00, 0.15],        // [mínimo, máximo] do repouso — escolhido por energia residual
    rpmDrive: [2.80, 3.00],       // [mínimo, máximo] com bombo — escolhido por loudness
    rpmKnee: 0.08,                // presença abaixo disto = repouso puro (evita meio-termo morno)
    spotBase: [0.35, 1.45],       // intensidade dos spots ← loudness (curva sobre a base do CONFIG)
    spotDomGain: 1.30, spotSubGain: 0.62,   // foco dominante vs os outros dois
    spotSwapBars: 8,              // foco dominante roda na fronteira de 8 compassos (base do sorteio)

    /* ---- §SPOTMOV — dar MOVIMENTO aos focos (David: "os focos mudam muito pouco, cansativo") ----
     * ⚠ O diagnóstico contradiz a intuição. MEDIDO em `tools/feat`:
     *       spots  amplitude(p95-p05) = 1.59 / 1.42 / 1.40  num range de 0-1.6  ← já é quase tudo
     *       spots  delta/frame p50    = 0.0000-0.0003       ← praticamente imóveis entre acentos
     *       spots  movimento total    = 5-7× o range em 60 s
     *       opacity movimento total   = 66× o range
     * Ou seja: o range já está no máximo; o que falta é MOVIMENTO. Aumentar `spotBase` não
     * resolveria nada — só saturaria. Por isso mexe-se em três sítios, nenhum deles a amplitude:
     *
     *  1) `spotSwapJitter` — a rotação do dominante deixa de ser exatamente 8 compassos. §0.1 pede
     *     "variacoes que nao tao ligadas à musica"; 8 fixos é o contrário disso, é métrica.
     *     A cada troca sorteia-se o próximo intervalo em `spotSwapBars ± jitter`.
     *  2) `spotBarAccent` / `spotPhraseAccent` — acentos NAS FRONTEIRAS musicais, que a grelha já
     *     dá de graça. É o que um técnico faz: marca o compasso, marca a frase com mais força.
     *  3) `spotSnareGain` — a tarola nova (§SNARE) como fonte de acento. É a queixa 2 a pagar a
     *     queixa 4: o acento seco que faltava é exatamente o que tira os focos da imobilidade.
     *
     * Os acentos são MULTIPLICATIVOS sobre o dominante e decaem; não é uma oscilação periódica,
     * logo não há frequência a violar o teto de 3 Hz — a fronteira de compasso a 128 BPM é 0.53 Hz
     * e a de frase é 0.03 Hz. */
    spotSwapJitter: 3,            // troca do dominante em `spotSwapBars ± isto` compassos (0 = fixo)
    spotBarAccent: 0.16,          // acento no dominante na fronteira de COMPASSO
    spotPhraseAccent: 0.34,       // …e o maior, na fronteira de FRASE (já existia a 0.15, sobe)
    spotAccentDecay: 0.55,        // tempo de queda dos acentos de fronteira (s)
    spotSnareGain: 0.45,          // quanto o acento de tarola levanta o dominante
    beamIntFrom: [0.06, 0.18],    // ← high + onset (hi-hats/voz). TETO 0.18, inviolável
    beamsFrom: [12, 56],
    beamHighMix: 0.65,            // peso de `high` vs `onset` no sinal dos feixes
    hazeFrom: [0.60, 0.95],       // ← INVERSO de bass (breakdown sem graves = fumo)
    opacityFrom: [0.12, 1.00],    // ← loudness curto
    opacityFloorGroove: 0.20,     // §0.1: a bola não pode ficar fantasma sem razão em GROOVE

    /* ---- §OPACEXTREMOS — a opacidade a chegar aos EXTREMOS (David: "pouco jogo") ----
     * ⚠ Este é o diagnóstico mais contra-intuitivo dos quatro, e a primeira tentativa ESTAVA
     * ERRADA — fica registada aqui para não se repetir. A opacidade é, de longe, a variável que
     * MAIS se move: movimento total 66× o range, delta/frame p50 = 0.0185 (as outras estão em
     * 0.0001-0.0003). Não falta oscilação — sobra.
     *
     * A 1.ª hipótese foi "falta alcance, estica-se a curva com um gamma". Medido: NÃO MUDA NADA
     * (amp 0.487 → 0.487 com γ de 0.72 a 1.6). Porquê: o ALVO já satura — p50 e p95 do
     * `target.opacity` são 1.000, e 1732 dos 2667 frames estão exatamente no piso de GROOVE
     * (0.20). O alvo é praticamente uma onda quadrada 0.20↔1.00; não há meio-termo para esticar.
     *
     * A faixa morta 0.38-0.86 que o David vê é da SAÍDA, e nasce de duas coisas EM SÉRIE:
     *   1) o `ease` com `tau.opacity` = [0.40, 2.00] — 2 s de release contra um alvo que muda
     *      muito mais depressa: a saída nunca chega ao fundo antes de o alvo voltar a subir;
     *   2) o `hat.opacityDip`, que morde o que sobra por cima (56% dos frames no decil 0.7-0.8,
     *      só 3% acima de 0.9).
     * Por isso os knobs certos são o RELEASE e um acento que entre DEPOIS da mordidela — não uma
     * curva no alvo. Ver §OPACSECO no `applyToBall`. */
    opacityReleaseSec: 0.80,      // release do rpm→opacidade (era 2.00 em `tau.opacity`)
    // INVARIANTE (David, 2ª audição): "enquanto houver bombo a bola DEVE girar — só sem bombo
    // é que pára". Piso DURO no rpm, aplicado DEPOIS dos gestos: nem `freeze`, nem `fog`, nem
    // `ghost` podem travar a rotação enquanto há bombo. Esses gestos continuam a valer — mas
    // em opacity/spots/haze/feixes, que é onde o David os quer. O `freeze` de rotação fica
    // reservado para quando o bombo já parou (e aí o piso está desligado por definição).
    spinLockPresence: 0.12,       // acima desta presença de bombo, o piso está ativo
    spinLockRpm: 2.6,            // rpm mínimo enquanto há bombo

    /* ---- §SPINCEIL — o SIMÉTRICO do `spinLock` (David, 3ª audição) ----
     * Queixa verbatim: "devia ser possivel a bola parar completamente sempre que bombo para e as
     * vezes para e a bola n faz isso (…) tem de ser decisao, nao casualidade."
     *
     * MEDIDO em `tools/feat`, no vazio de 12.5 s sem bombo (t=21.4→33.9 s):
     *     t=24.6  rpm=0.76  tgt=0.40  pres=0.0002  gest=fog         ← travava, correto
     *     t=25.1  rpm=0.84  tgt=2.49  pres=0.0001  gest=blind-spin  ← ACELERA
     *     t=30.4  rpm=2.50  tgt=2.50  pres=0.0000  gest=blind-spin  ← 2.5 rpm com bombo a ZERO
     * O `spinLock` garante o PISO com bombo. Não havia nada a garantir o TETO sem bombo, e
     * `blind-spin` (`rpm:{set:2.5}`) / `all-on` (3.0) sobrepunham-se ao alvo de repouso. Resultado
     * na gravação inteira: rpm mínimo 0.42, ZERO frames abaixo de 0.2 — a bola nunca parava.
     *
     * A correção é o espelho exato do piso, aplicada no MESMO sítio (depois dos gestos): sem
     * bombo confirmado, nenhum gesto pode manter a bola acima de `ceilRpm`.
     *
     * ⚠ Isto NÃO enfraquece o `spinLock`: as duas condições são mutuamente exclusivas por
     *   construção (`kickPresence > spinLockPresence` vs `< spinCeilPresence`, com
     *   spinCeilPresence ≤ spinLockPresence). Com bombo, a bola gira — a invariante mantém-se.
     *
     * A VARIAÇÃO que o David autorizou ("até posso ter um parametro para nao ser sempre sempre
     * igual") é `spinCeilChance`, e o default é 1 = PARA SEMPRE. Quando < 1, a decisão é tomada
     * UMA vez por vazio (no instante em que o vazio é confirmado), fica registada no log/HUD
     * ("bola NÃO pára · sorteio") e vale para esse vazio inteiro. Nunca é um efeito colateral de
     * um gesto: é uma escolha do motor, visível, exatamente como ele pediu. */
    spinCeilPresence: 0.06,       // presença abaixo disto = "sem bombo" para efeitos do teto
    spinCeilGapSec: 2.2,          // …e sem kick há pelo menos isto (> gapDeadSec: é decisão, não dúvida)
    spinCeilRpm: 0.10,            // teto de rpm no vazio — dentro de `rpmIdle`, a bola lê-se PARADA
    spinCeilChance: 1.00,         // 1 = pára sempre (default). < 1 = sorteia por vazio, e regista o sorteio
  },

  // τ (s) [attack, release]. Do brief da Fase 5, ponto 3. Nada oscila acima de 3 Hz.
  tau: {
    rpm: [0.60, 1.50], spot: [0.12, 0.60], beamInt: [0.10, 0.50], beams: [0.10, 0.50],
    haze: [1.50, 4.00], opacity: [0.40, 2.00],
  },
  // Exceção assumida: quando o BOMBO PÁRA, o release do rpm encurta. Não é uma reação a
  // transiente (isso seria pisca) — é a mesma decisão musical do `deadTau`: a paragem da
  // rotação é um EVENTO que o David quer ver, não um decaimento que ele tem de adivinhar.
  // 0.45 s ainda é ~0.35 Hz de conteúdo, uma ordem de grandeza abaixo do teto de 3 Hz.
  rpmStopTau: 0.45,
  outMin: { spot: 0.00, opacity: 0.00, haze: 0.05, rpm: 0.00, beamInt: 0, beams: 0 },
  outMax: { spot: 1.60, opacity: 1.00, haze: 1.00, rpm: 3.00, beamInt: 0.18, beams: 56, beamCap: 64 },
  // `beams` (0-56) é a ESCALA da saída; na bola vira `beamFraction` = beams/56 (fração dos espelhos do foco que
  // geram feixe) — a contagem absoluta (`beamCap`) fica só como teto de performance. Antes o motor escrevia
  // `beamMaxCount` e, com todos os espelhos do foco a gerar feixe (~40), o mapeamento ficava esmagado.

  /* ---- Camada 2: grelha ---- */
  grid: {
    staleMs: 4000,        // grelha mais velha que isto = sem grelha
    quantConf: 0.60,      // acima disto o rpm só muda na fronteira de COMPASSO
  },

  /* ---- §CLOCK — relógio único da sala (S1, `f16-sync.md` §1 decisões 1-2) ----
   * Publicado em `state` como contadores MONOTÓNICOS (`beatTick`/`barTick`/`phraseTick`) + posição
   * (`beatIdx` 0-3, `barIdx` 0-7) + `clockConf`/`clockAgeMs`. Só este ficheiro escreve; as peças
   * da sala leem por poll e detetam a aresta por delta (como já fazem com `snareCount`). */
  sync: {
    phraseBars: 8,        // compassos por frase DO RELÓGIO (a grelha mantém os seus 16 para a FSM)
    gridMinConf: 0.30,    // abaixo disto o relógio ignora a grelha e segue o bombo em 4/4
    /* S2 (f16-sync §3) — lidos pelo estrelato (`stardom.js`) por poll em `MUSIC.sync` */
    allOnReservePhrases: 8,   // frases (de `phraseBars`) entre dois all-on (2-16)
    breakdownBallHero: 0,     // 0 = bola discreta (techno) · 1 = bola+wash protagonistas (disco/pop)
    breakdownWash: 0.3,       // wash da sala no breakdown discreto (0-1)
    /* S4 (f16-sync §1 decisão 4, §2) — blackout pré-drop: gesto `blackout` (ver §BLACKOUT) */
    blackoutMs: 300,          // duração do blackout (100-800); ½ tempo a 128 BPM = 234 ms
    blackoutKeepHaze: 1,      // 1 = o haze fica (não dissipa em 300 ms); 0 = apaga tudo mesmo
  },

  /* ---- Camada 3: máquina de estados com áudio real, SEM `hint` (§0.1 / ponto 5) ---- */
  fsm: {
    kickDeadSec: 1.5,         // bombo cai por > isto, com música a tocar → BREAKDOWN
    kickBackPresence: 0.45,   // presença de volta acima disto (+ onset forte) → DROP
    dropOnset: 0.55,          // onset do primeiro kick de volta que qualifica como DROP
    buildBars: 4,             // energia/hi-hats a subir ≥ isto compassos → BUILD
    riseSlope: 0.015,         // subida mínima por compasso
    highRiseSlope: 0.020,     // ou hi-hats a crescer
    preDropBars: 0.75,        // ≤ este nº de compassos da fronteira de frase → PRE_DROP
    preDropMinConf: 0.35,
    preDropDepth: 0.85,
    dropTimeoutBars: 2,
    dropHoldBars: [4, 8],     // DROP → all-on durante 4-8 compassos
    dropHoldSecNoGrid: [6, 12],
    breakdownMinSec: 3.0,
    buildGiveUpSec: 8.0,      // build que não resolve em 8 s desiste → BREAKDOWN
    minStateMs: 900,          // debounce: não oscilar
  },

  /* ---- Gestos (§0.1: "criatividade tb em cima disso") ---- */
  gesture: {
    barsRange: [2, 8],            // duração 2-8 compassos com grelha
    secRange: [4, 12],            // 4-12 s sem grelha
    rampInSec: 0.8, rampOutSec: 1.2,
    chainRange: [2, 3],           // 2-3 gestos encadeados até ao drop em BREAKDOWN/BUILD
    grooveEveryBars: [16, 32],    // em GROOVE, tenta a cada 16-32 compassos
    grooveChance: 0.30,           // …e aceita 30% das vezes
    grooveLight: ['breath', 'strobe-slow'],
    dark: ['freeze', 'ghost', 'blind-spin', 'single-beam', 'fog', 'strobe-slow', 'breath', 'flash-clear'],
    seed: 0,                      // 0 = seed por sessão (Date.now); qualquer outro = determinístico
  },

  /* ---- Explosão (efeito em index-v2.html: MIRRORBALL.explode/rewind) ---- */
  explode: {
    on: true,               // o botão "explosões" da bola e MIRRORBALL.explodeEnabled também mandam
    // Raridade (§0.1: "um drop por música, se tanto"): só o GRANDE drop estoira — o que vem de um
    // build a sério (PRE_DROP/BUILD), depois de ≥ minDarkSec sem bombo, e nunca antes de minGapSec
    // desde o último estoiro. E mesmo assim só `chance` das vezes, para não ser previsível.
    minGapSec: 75,          // era 180: com 3 min entre estoiros o David nunca via nenhum
    minDarkSec: 3,          // era 6
    fromBuildOnly: false,   // true = só PRE_DROP/BUILD → DROP conta; a máquina vai muitas vezes BREAKDOWN → DROP direto
    chance: 0.85,
    skipRestrained: false,  // (era true) o drop "contido" (1 em 4) não estoira — a contenção é o gesto
    hold: 'drop',           // 'drop' = recompõe-se no fim da abertura do drop (4-8 compassos)
                            // 'breakdown' = fica em estilhaços até ao fim do breakdown (PRE_DROP ou volta a GROOVE);
                            // em qualquer caso a bola impõe CONFIG.explode.maxHold — nunca fica infinita
  },

  /* ---- Silêncio (§3.5) ---- */
  silence: { noFeaturesMs: 500, decaySec: 4.0 },

  /* ---- Arbitragem ---- */
  handover: { rampSec: 1.5 },

  /* ---- Saída de estado para o pai ---- */
  emit: { stateHz: 4 },

  /* ---- Gerador sintético (testes / demo sem sidecar) ---- */
  gen: {
    enabled: true, bpm: 126, beatsPerBar: 4, barsPerPhrase: 16,
    featureHz: 50,
    grooveBars: 32, buildBars: 16, breakdownBars: 16, breakdownEveryCycles: 3,
    externalGraceMs: 2000,
  },
};

/* ======================= §TUNE — esquema dos knobs afináveis ao vivo =======================
 * UMA fonte de verdade para três coisas ao mesmo tempo: os limites que validam o JSON externo,
 * os limites dos sliders do painel (tecla `k`) e o texto que os descreve. Sem isto, os ranges
 * viviam duplicados no painel e no validador e divergiam ao primeiro ajuste.
 *
 * `path`: caminho no CONFIG · `[min,max]` · `step` · rótulo.
 *
 * ⚠ Os TETOS AQUI SÃO OS TETOS DO CLAUDE.md, não sugestões. `beamIntensity ≤ 0.18` e o limite
 *   de 3 Hz são invioláveis: os sliders não conseguem passar deles porque o `max` do range é
 *   esse valor, e o merge do JSON faz clamp ao mesmo intervalo. Não há caminho — painel, JSON
 *   ou ficheiro editado à mão — que ponha o motor fora das regras.
 * ⚠ A skin NÃO está aqui e não pode estar: é do utilizador (regra 1), o motor não lhe toca. */
const TUNE = {
  detector: {
    label: 'Detetor (bombo/agudos)',
    knobs: [
      { path: 'bandOnset.kickC0',       range: [1.15, 3.0],  step: 0.01, label: 'kick C0 (limiar)' },
      { path: 'bandOnset.minStdRatio',  range: [0.0, 0.60],  step: 0.01, label: 'kick var. mín (V0)' },
      { path: 'bandOnset.absFloor',     range: [0.0, 0.60], step: 0.01, label: 'kick piso abs. (× pico lento)' },
      { path: 'bandOnset.kickRefractMs', range: [60, 400],   step: 5,    label: 'kick refratário ms' },
      { path: 'bandOnset.hatC0',        range: [1.05, 3.0],  step: 0.01, label: 'hat C0 (limiar)' },
      { path: 'bandOnset.hatEnvTau.0',  range: [0.05, 1.0],  step: 0.01, label: 'hat env attack' },
      { path: 'bandOnset.hatEnvTau.1',  range: [0.01, 0.60], step: 0.01, label: 'hat env release' },
      { path: 'bandOnset.presenceWindowMs', range: [500, 5000], step: 50, label: 'janela presença ms' },
      { path: 'bpmAuto.confBelow',      range: [0.0, 1.0],   step: 0.01, label: 'autocorr. abaixo de conf' },
      // §SNARE — o terceiro detetor. `on` é 0/1, como `profileAuto.auto`.
      { path: 'snare.on',               range: [0, 1],       step: 1,    label: 'tarola ON/OFF' },
      { path: 'snare.C0',               range: [1.15, 4.0],  step: 0.01, label: 'tarola C0 (c/ midFluxRaw)' },
      { path: 'snare.fbFloor',          range: [0.05, 0.80], step: 0.01, label: 'tarola piso (fallback)' },
      { path: 'snare.fbK',              range: [0.5, 8.0],   step: 0.1,  label: 'tarola k·MAD (fallback)' },
      { path: 'snare.refractMs',        range: [80, 600],    step: 10,   label: 'tarola refratário ms' },
    ],
  },
  sync: {
    label: 'Sync (relógio único)',
    knobs: [
      { path: 'sync.phraseBars',   range: [4, 16],     step: 4,    label: 'sync: compassos por frase' },
      { path: 'sync.gridMinConf',  range: [0.0, 1.0],  step: 0.01, label: 'sync: conf. mín. da grelha' },
      { path: 'sync.allOnReservePhrases', range: [2, 16], step: 1,    label: 'sync: all-on reserva (frases)' },
      { path: 'sync.breakdownBallHero',   range: [0, 1],  step: 1,    label: 'sync: breakdown bola protagonista (0/1)' },
      { path: 'sync.breakdownWash',       range: [0, 1],  step: 0.05, label: 'sync: breakdown wash' },
      { path: 'sync.blackoutMs',          range: [100, 800], step: 10, label: 'sync: blackout ms' },
      { path: 'sync.blackoutKeepHaze',    range: [0, 1],  step: 1,    label: 'sync: blackout mantém haze (0/1)' },
    ],
  },
  profile: {
    label: 'Perfil (deteção automática)',
    knobs: [
      // 0/1: o interruptor mestre. Com `auto` a 0 o motor comporta-se EXATAMENTE como antes
      // desta funcionalidade existir — o perfil só muda por `p` ou por mensagem.
      { path: 'profileAuto.auto',              range: [0, 1],       step: 1,    label: 'auto ON/OFF' },
      { path: 'profileAuto.cvRegular',         range: [0.10, 0.80], step: 0.01, label: 'CV "regular" (limiar)' },
      { path: 'profileAuto.minCoverage',       range: [0.0, 1.0],   step: 0.01, label: 'cobertura mín. da janela' },
      { path: 'profileAuto.gapMaxMs',          range: [400, 3000],  step: 50,   label: 'gap máx. (ausência)' },
      { path: 'profileAuto.scoreTau',          range: [2, 40],      step: 0.5,  label: 'τ do score (s)' },
      { path: 'profileAuto.evidenceSec',       range: [5, 90],      step: 1,    label: 'evidência mín. (s)' },
      { path: 'profileAuto.enterElectronica',  range: [0.0, 1.0],   step: 0.01, label: 'entra electronica >' },
      { path: 'profileAuto.enterAcustico',     range: [0.0, 1.0],   step: 0.01, label: 'entra acustico <' },
      { path: 'profileAuto.hatElectronicaMax', range: [0.0, 1.0],   step: 0.01, label: 'veto hat p/ electronica' },
      { path: 'profileAuto.hatAcusticoMin',    range: [0.0, 1.0],   step: 0.01, label: 'veto hat p/ acustico' },
      { path: 'profileAuto.minHoldSec',        range: [10, 180],    step: 5,    label: 'tempo mín. no perfil (s)' },
    ],
  },
  mapping: {
    label: 'Mapeamento (o que se vê)',
    knobs: [
      // rpm — o teto 3.00 é `outMax.rpm`; o piso com bombo é a invariante do David.
      { path: 'map.rpmDrive.0',   range: [0.5, 3.0],  step: 0.05, label: 'rpm com bombo (mín)' },
      { path: 'map.rpmDrive.1',   range: [0.5, 3.0],  step: 0.05, label: 'rpm com bombo (máx)' },
      { path: 'map.rpmIdle.1',    range: [0.0, 1.5],  step: 0.01, label: 'rpm em repouso (máx)' },
      { path: 'map.rpmKnee',      range: [0.0, 0.5],  step: 0.01, label: 'joelho da presença' },
      { path: 'map.spinLockRpm',  range: [0.0, 3.0],  step: 0.05, label: 'piso rpm com bombo' },
      // §SPINCEIL — o teto SEM bombo. `spinCeilChance` a 1 = pára sempre (o que o David quer por
      // omissão); baixar é opt-in e o sorteio fica no log ("bola NÃO pára · sorteio").
      { path: 'map.spinCeilRpm',       range: [0.0, 1.5],  step: 0.01, label: 'teto rpm sem bombo' },
      { path: 'map.spinCeilChance',    range: [0.0, 1.0],  step: 0.05, label: 'prob. de PARAR (1=sempre)' },
      { path: 'map.spinCeilGapSec',    range: [0.5, 8.0],  step: 0.1,  label: 'silêncio p/ decidir (s)' },
      { path: 'map.spinCeilPresence',  range: [0.0, 0.30], step: 0.01, label: 'presença "sem bombo"' },
      // feixes — TETO 0.18 (regra 6), imposto pelo max do range
      { path: 'map.beamIntFrom.0', range: [0.0, 0.18], step: 0.005, label: 'feixes intens. (mín)' },
      { path: 'map.beamIntFrom.1', range: [0.0, 0.18], step: 0.005, label: 'feixes intens. (máx)' },
      { path: 'map.beamsFrom.0',  range: [0, 56],     step: 1,    label: 'nº feixes (mín)' },
      { path: 'map.beamsFrom.1',  range: [0, 56],     step: 1,    label: 'nº feixes (máx)' },
      // haze / opacidade
      { path: 'map.spotDomGain',   range: [0.5, 1.6],  step: 0.05, label: 'foco dominante (ganho)' },
      { path: 'map.spotSubGain',   range: [0.0, 1.2],  step: 0.05, label: 'outros focos (ganho)' },
      { path: 'map.hazeFrom.0',   range: [0.0, 1.0],  step: 0.01, label: 'haze (mín)' },
      { path: 'map.hazeFrom.1',   range: [0.0, 1.0],  step: 0.01, label: 'haze (máx)' },
      { path: 'map.opacityFrom.0', range: [0.0, 1.0], step: 0.01, label: 'opacidade (mín)' },
      { path: 'map.opacityFrom.1', range: [0.0, 1.0], step: 0.01, label: 'opacidade (máx)' },
      { path: 'map.opacityFloorGroove', range: [0.0, 1.0], step: 0.01, label: 'piso opac. GROOVE' },
      // §OPACEXTREMOS — < 1 empurra a opacidade para os extremos (medida: vivia em 0.38-0.86)
      { path: 'map.opacityReleaseSec', range: [0.2, 3.0], step: 0.05, label: 'opac. release (s)' },
      // §SPOTMOV — movimento dos focos. NÃO é amplitude (já usa 1.59 de 1.6): é acento e ritmo.
      { path: 'map.spotSwapBars',      range: [2, 32],    step: 1,    label: 'troca dominante (compassos)' },
      { path: 'map.spotSwapJitter',    range: [0, 8],     step: 1,    label: '…± jitter (0 = fixo)' },
      { path: 'map.spotBarAccent',     range: [0.0, 0.8], step: 0.01, label: 'acento de COMPASSO' },
      { path: 'map.spotPhraseAccent',  range: [0.0, 1.2], step: 0.01, label: 'acento de FRASE' },
      { path: 'map.spotAccentDecay',   range: [0.1, 3.0], step: 0.05, label: 'queda dos acentos (s)' },
      { path: 'map.spotSnareGain',     range: [0.0, 1.2], step: 0.01, label: 'tarola → focos' },
      // §FLASHDIM — flashes (MIRRORBALL.flash) e dimmer por fase
      { path: 'flash.kickChance',      range: [0.0, 1.0], step: 0.05, label: 'flash: bombo (prob.)' },
      { path: 'flash.kickChanceDrop',  range: [0.0, 1.0], step: 0.05, label: 'flash: bombo no DROP' },
      { path: 'flash.snare',           range: [0.0, 1.0], step: 0.05, label: 'flash: tarola (prob.)' },
      { path: 'explode.minGapSec',     range: [10, 600],  step: 5,    label: 'explosão: intervalo mín (s)' },
      { path: 'explode.minDarkSec',    range: [0, 30],    step: 0.5,  label: 'explosão: breakdown mín (s)' },
      { path: 'explode.chance',        range: [0.0, 1.0], step: 0.05, label: 'explosão: prob. no drop' },
      { path: 'flash.phraseBurst',     range: [0, 5],     step: 1,    label: 'flash: rajada na frase' },
      { path: 'dimmer.BREAKDOWN.1',    range: [0.0, 1.0], step: 0.05, label: 'dimmer: foco 2 em BREAKDOWN' },
      { path: 'dimmer.DROP.0',         range: [0.5, 1.6], step: 0.05, label: 'dimmer: DROP' },
      { path: 'strobe.on',             range: [0, 1],     step: 1,    label: 'strobe fundo (se a bola tiver ON)' },
      { path: 'strobe.dropEnter',      range: [0, 4],     step: 1,    label: 'strobe: rajada ao entrar em DROP' },
      { path: 'strobe.phraseChance',   range: [0.0, 1.0], step: 0.05, label: 'strobe: frase em DROP (prob.)' },
      { path: 'strobe.grooveEveryBars.0', range: [4, 96], step: 1, label: 'strobe: GROOVE a cada (mín bars)' },
      { path: 'strobe.grooveEveryBars.1', range: [4, 128], step: 1, label: 'strobe: GROOVE a cada (máx bars)' },
      { path: 'strobe.grooveAct',      range: [0.0, 1.0], step: 0.05, label: 'strobe: GROOVE só com atividade ≥' },
      { path: 'strobe.burstChance',    range: [0.0, 1.0], step: 0.05, label: 'strobe: rajada 3-4 (prob.)' },
      { path: 'scene.on',              range: [0, 1],     step: 1,    label: 'cenas de feixes (0/1)' },
      { path: 'scene.everyBars.0',     range: [4, 64],    step: 1,    label: 'cena: dura mín (bars)' },
      { path: 'scene.everyBars.1',     range: [8, 128],   step: 1,    label: 'cena: dura máx (bars)' },
      { path: 'scene.pFull',           range: [0.0, 1.0], step: 0.05, label: 'cena: prob. todos os feixes' },
      { path: 'scene.pFew',            range: [0.0, 1.0], step: 0.05, label: 'cena: prob. 1-2 feixes' },
      { path: 'scene.fewFrac',         range: [0.005, 0.2], step: 0.005, label: 'cena: fração em 1-2 feixes' },
      { path: 'strobe.noneBeamsMul',   range: [0.1, 1.0], step: 0.05, label: 'strobe: sem feixes, intervalo ×' },
      { path: 'strobe.burstN.1',       range: [2, 6],     step: 1,    label: 'strobe: rajada máx' },
      { path: 'flash.calmAct',         range: [0.0, 1.0], step: 0.05, label: 'flash: calmo abaixo de atividade' },
      { path: 'strobe.kickChanceDrop', range: [0.0, 0.5], step: 0.01, label: 'strobe: bombo no DROP (prob.)' },
      // §SNARE — a resposta visual do acento seco (o teto 0.18 é preservado por construção)
      { path: 'snare.opacityKick',     range: [0.0, 0.8], step: 0.01, label: 'tarola → opacidade' },
      { path: 'snare.beamKick',        range: [0.0, 0.8], step: 0.01, label: 'tarola → feixes' },
      { path: 'snare.decaySec',        range: [0.1, 1.5], step: 0.05, label: 'queda do acento (s)' },
      // agudos → o quanto se nota
      { path: 'hat.beamGain',     range: [0.0, 2.0],  step: 0.05, label: 'ganho agudos→feixes' },
      { path: 'hat.opacityDip',   range: [0.0, 1.0],  step: 0.01, label: 'tique de opacidade' },
      // atividade (densidade espectral)
      { path: 'activity.low',     range: [0.0, 0.5],  step: 0.01, label: 'densidade → act (baixo)' },
      { path: 'activity.high',    range: [0.05, 1.0], step: 0.01, label: 'densidade → act (alto)' },
      { path: 'activity.beamsMin', range: [0.0, 1.0], step: 0.01, label: 'feixes mín. c/ act baixa' },
    ],
  },
};

/* Defaults IMUTÁVEIS do código. É o que o `reset` repõe e o que vale quando não há ficheiro,
 * quando o ficheiro está corrompido, ou quando um valor não passa a validação. O motor nunca
 * fica sem arrancar por causa de um JSON externo. */
const TUNE_DEFAULTS = (() => {
  const d = {};
  for (const sec of Object.values(TUNE)) for (const k of sec.knobs) d[k.path] = getPath(MUSIC, k.path);
  return d;
})();
const TUNE_KNOBS = (() => {
  const m = new Map();
  for (const sec of Object.values(TUNE)) for (const k of sec.knobs) m.set(k.path, k);
  return m;
})();

function getPath(obj, p) {
  let cur = obj;
  for (const part of p.split('.')) { if (cur == null) return undefined; cur = cur[part]; }
  return cur;
}
function setPath(obj, p, v) {
  const parts = p.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) { if (cur[parts[i]] == null) return false; cur = cur[parts[i]]; }
  cur[parts[parts.length - 1]] = v;
  return true;
}

/* Valida UM valor contra o esquema. Um número fora do range é CLAMPED (não recusado): um
 * ficheiro antigo com um valor que entretanto saiu do intervalo continua a servir, mas nunca
 * põe o motor fora das regras. Tipo errado / NaN / Infinity → null, e o chamador mantém o
 * default. `NaN` num knob é exatamente o que já matou os feixes uma vez (regra 7). */
function coerceKnob(path, raw) {
  const k = TUNE_KNOBS.get(path);
  if (!k) return null;
  const n = typeof raw === 'number' ? raw : (typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN);
  if (!isFinite(n)) return null;
  return clamp(n, k.range[0], k.range[1]);
}

/* Aplica um objeto {path: valor} ao CONFIG vivo. Devolve quantos entraram. Usado pelo painel
 * (a cada gesto de slider) e pelo carregamento do ficheiro. */
function applyTuning(flat) {
  let n = 0;
  if (!flat || typeof flat !== 'object') return 0;
  for (const [p, v] of Object.entries(flat)) {
    const val = coerceKnob(p, v);
    if (val == null) continue;
    if (setPath(MUSIC, p, val)) n++;
  }
  return n;
}

/* Deep-merge de um JSON externo ({bandOnset:{kickC0:1.4}, map:{...}}) para a forma achatada.
 * Só chaves do esquema sobrevivem; tudo o resto é ignorado em silêncio (uma chave desconhecida
 * é um ficheiro de outra versão, não um erro que valha assustar quem está a ouvir música). */
function flattenKnown(obj, prefix, out) {
  out = out || {};
  if (!obj || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flattenKnown(v, p, out);
    else if (Array.isArray(v)) v.forEach((el, i) => { if (TUNE_KNOBS.has(`${p}.${i}`)) out[`${p}.${i}`] = el; });
    else if (TUNE_KNOBS.has(p)) out[p] = v;
  }
  return out;
}

/* Estado do ficheiro de config, para o painel poder dizer o que carregou e de onde. Tudo
 * inicializado (regra 7) — o painel lê isto antes de qualquer fetch responder. */
const TUNE_STATE = {
  loaded: false, from: null, path: '', locations: [], active: null,
  dirty: false, saving: false, msg: '', canSave: false, token: null,
};

/* Carrega `music-config.json` no arranque. Funciona nos DOIS contextos:
 *  · servida pelo sidecar em /app/  → pergunta ao sidecar as localizações e tenta cada uma;
 *  · servida pelo python http.server em :8080 → tenta o ficheiro ao lado da página.
 * Falhar é NORMAL (o ficheiro pode não existir): nada de erros na consola que assustem. */
async function loadTuningFile() {
  if (typeof fetch !== 'function') return;
  const tryUrl = async (url) => {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) return null;
      const txt = await r.text();
      if (!txt || !txt.trim()) return null;
      return JSON.parse(txt);           // JSON corrompido cai no catch: defaults, sem drama
    } catch (e) { return null; }
  };
  const servedByApp = typeof location !== 'undefined' && /^\/app\//.test(location.pathname || '');

  if (servedByApp) {
    try {
      const t = await (await fetch('/app-token', { cache: 'no-store' })).json();
      TUNE_STATE.token = t.token;
      const r = await fetch(`/app-config/locations?token=${encodeURIComponent(t.token)}`, { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        TUNE_STATE.locations = Array.isArray(j.locations) ? j.locations : [];
        TUNE_STATE.active = j.active || null;
        TUNE_STATE.canSave = true;
      }
    } catch (e) { /* sidecar antigo, sem a rota: fica sem save, o painel diz porquê */ }
  }
  // Ordem: a localização ativa primeiro, depois as outras, depois o ficheiro ao lado da página.
  const cands = [];
  const ordered = TUNE_STATE.locations.slice().sort((a, b) =>
    (a.id === TUNE_STATE.active ? -1 : 0) - (b.id === TUNE_STATE.active ? -1 : 0));
  for (const l of ordered) if (l.exists) cands.push({ id: l.id, url: `/app/music-config.json?t=${Date.now()}`, path: l.path });
  cands.push({ id: 'local', url: `music-config.json?t=${Date.now()}`, path: 'music-config.json (ao lado da página)' });

  for (const c of cands) {
    const j = await tryUrl(c.url);
    if (!j) continue;
    const flat = flattenKnown(j, '', {});
    const n = applyTuning(flat);
    // secção `ball`: knobs do painel d da bola (focos, cone, luz geral…) — o ficheiro manda sobre o localStorage
    if (j.ball && window.MIRRORBALL && window.MIRRORBALL.knobs) window.MIRRORBALL.knobs.set(j.ball);
    TUNE_STATE.loaded = true; TUNE_STATE.from = c.id; TUNE_STATE.path = c.path;
    TUNE_STATE.msg = `${n} valores carregados`;
    if (typeof TUNER_SYNC === 'function') TUNER_SYNC();
    return;
  }
  TUNE_STATE.msg = 'sem ficheiro — defaults do código';
  if (typeof TUNER_SYNC === 'function') TUNER_SYNC();
}

/* ============================== RNG com seed de sessão ==============================
 * Os gestos têm de variar entre sessões (§3.3: "previsível é o oposto de quase mágica") mas
 * têm de ser reproduzíveis num teste. `MUSIC.gesture.seed = 0` → seed por sessão. */
function makeRng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return function rng() {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
let RNG = makeRng(MUSIC.gesture.seed || (Date.now() & 0x7fffffff));
const rngPick = arr => arr[Math.floor(RNG() * arr.length) % arr.length];
const rngRange = r => lerp(r[0], r[1], RNG());

/* RNG SEPARADO para a coreografia dos spots (§SPOTMOV) e para o sorteio do §SPINCEIL.
 * ⚠ Não é preciosismo — foi medido. O jitter da troca de dominante consome números do `RNG`
 * dos gestos, o que MUDA A SEQUÊNCIA DE GESTOS de toda a sessão. Efeito real em `tools/feat`:
 * ligar só o `spotSwapJitter` fazia a opacidade passar de amp 0.684 (p05 0.179) para amp 0.306
 * (p05 0.558) — não por causa do mapeamento, mas porque saíram gestos diferentes, e são os
 * gestos (`ghost`, `flash-clear`) que levam a opacidade aos extremos. Duas fontes independentes
 * evitam este acoplamento invisível e mantêm os testes com seed comparáveis. */
let RNG2 = makeRng(((MUSIC.gesture.seed || (Date.now() & 0x7fffffff)) ^ 0x5bf03635) >>> 0);
const rng2Range = r => lerp(r[0], r[1], RNG2());

/* ================================== estado do motor ================================== */
const state = {
  // features
  feat: null, lastFeatLocal: -Infinity, silent: true,
  loudAvg: 0, loudAccT: 0, loudShort: 0,
  bassAvg: 0.35, bassShort: 0.35, highAvg: 0.25, centroidAvg: 0.45, rmsShort: 0,
  // `act` (densidade espectral → atividade) só é calculado quando chega a 1.ª feature. Tem de
  // nascer definido: o rAF corre `computeTargets()` ANTES da 1.ª feature, e um `undefined` aqui
  // dava `lerp(0.55, 1, undefined) = NaN` em `T.beams` — NaN é absorvente no `ease`, logo
  // `beamMaxCount` ficava NaN para sempre e `for (i=0; i<NaN; i++)` NUNCA desenhava um feixe.
  act: 1, densAvg: null, subAvg: null, hatAvg: null, hatPulse: 0,
  // --- kick / bombo ---
  kickTimes: [], lastKickT: -Infinity, kickRate: 0, kickPresence: 0, kickFlash: 0,
  // --- explosão (raridade): último estoiro e início da família escura (BREAKDOWN/BUILD/PRE_DROP) ---
  lastExplodeT: -Infinity, darkSince: -Infinity, explodeCount: 0,
  strobeNextBar: 16, strobeCount: 0,   // §ESPAÇOS (regra 7: valor inicial)
  scene: 'full', sceneNextBar: 0,       // §CENAS (regra 7)
  strobeLastBar: 0, strobeIntervalBars: null,   // intervalo vivo do estrobo em GROOVE
  // §BANDONSET. Os detetores são criados abaixo (precisam do MUSIC já definido); `kickDet`/
  // `hatDet`/`hatEnv` nascem a null e são preenchidos por `resetDetectors()` — que corre
  // imediatamente, mas o valor inicial tem de existir aqui na mesma (regra 7 do CLAUDE.md:
  // um `undefined` neste literal já matou os feixes uma vez).
  kickDet: null, hatDet: null, hatEnv: null,
  kickHistory: [],       // tempos de kick até 8 s (autocorrelação de desempate)
  kickExpected: 0,       // batidas esperadas na janela de presença (HUD)
  hatLevel: 0,           // envelope dos agudos por banda (0..1) — alimenta feixes/opacidade
  hatFlash: 0,           // evento discreto de agudo (decai como o kickFlash)
  /* --- §SNARE — o detetor de tarola e o seu acento ---
   * Regra 7 do CLAUDE.md, a sério: `state.act` indefinido já matou os feixes uma vez
   * (`beamMaxCount = NaN`). `snareAccent` entra em `lerp` no `computeTargets` e em multiplicações
   * no `applyToBall` — um undefined aqui apagava os feixes E os spots ao mesmo tempo. */
  snareDet: null,        // BandOnset do caminho `midFluxRaw` (criado em resetDetectors)
  snareHist: [],         // histórico do fallback (derivada de `mid`) — mediana + MAD
  snareLastT: -Infinity, // último acento (refratário)
  snarePrevMid: null,    // `mid` do frame anterior, para a derivada do fallback (null = ainda não há)
  snareAccent: 0,        // 0..1, o acento SECO que decai — é isto que se vê
  snareCount: 0,         // total de acentos na sessão (HUD/verificação)
  snarePath: 'fallback', // 'raw' = midFluxRaw do sidecar · 'fallback' = derivada de `mid`
  snareThr: 0,           // limiar efetivo deste frame (HUD/tuner-lab)
  snareFlux: 0,          // sinal do detetor neste frame (HUD/tuner-lab)
  /* --- §SPINCEIL — a decisão de parar (ou não) neste vazio --- */
  spinCeilArmed: false,  // já foi decidido para o vazio corrente?
  spinCeilStop: true,    // …e a decisão foi PARAR? (default: sim, como o `spinCeilChance` de 1)
  spinCeilCount: 0,      // vazios vistos (HUD)
  /* --- §SPOTMOV — acentos de fronteira e rotação do dominante --- */
  spotAccent: 0,         // acento corrente do dominante (decai) — soma compasso/frase/tarola
  nextSwapBar: -1,       // compasso da próxima troca de dominante (-1 = ainda não sorteado)
  /* --- §DETSTATS — a estatística interna do §BANDONSET publicada POR FRAME ---
   * O `BandOnset` já calcula tudo isto; o que faltava era um sítio onde o resto do mundo o
   * pudesse LER a cada frame. Serve o HUD `m` e, sobretudo, o `tuner-lab.html`: sem a mediana e
   * o C efetivos não há como desenhar a linha de limiar por cima da curva do flux, e sem essa
   * linha o David não distingue "o detetor falhou a batida" de "o detetor acertou e o mapeamento
   * suavizou" — que é o problema todo.
   * NÃO altera o comportamento do detetor: são cópias de valores já calculados.
   * Regra 7 do CLAUDE.md: tudo inicializado aqui, nunca undefined. `path` diz qual dos dois
   * caminhos do §KICK correu neste frame ('raw' = §BANDONSET, 'fallback' = média móvel). */
  det: {
    path: 'fallback',
    kickFlux: 0, kickMed: 0, kickStd: 0, kickVRel: 0, kickC: 0, kickThr: 0, kickBeat: 0,
    hatFlux: 0, hatMed: 0, hatStd: 0, hatVRel: 0, hatC: 0, hatThr: 0, hatBeat: 0,
  },
  bpmAuto: 0,            // BPM da autocorrelação (0 = sem opinião) — só desempate + HUD
  bpmSource: 'mediana',  // 'mediana' | 'autocorr' — o que decidiu o BPM atual (HUD)
  /* --- §PROFAUTO — classificador de perfil ---
   * Regra 7 do CLAUDE.md a sério: um classificador com acumuladores é a fonte óbvia de NaN
   * (já matou os feixes uma vez por `state.act` indefinido). TODOS nascem com valor, e os que
   * são "ainda não sei" nascem a `null` EXPLÍCITO — nunca undefined — e são testados com
   * `== null` antes de entrarem em qualquer conta. */
  profHist: [],          // tempos de kick da janela dedicada (30 s; o `kickHistory` só guarda 8)
  profCv: null,          // CV corrente dos intervalos (null = sem leitura válida agora)
  profCov: 0,            // cobertura da janela por intervalos válidos (0..1)
  profScore: null,       // fração suavizada de janelas regulares (null = ainda sem evidência)
  profHat: null,         // média longa de `hat` — o sinal secundário de veto
  profEvidenceSec: 0,    // segundos de evidência VÁLIDA acumulados (só conta com cobertura)
  profT0: 0,             // instante da 1.ª feature vista pelo classificador (divisor da cobertura)
  profDecided: false,    // já houve uma primeira decisão?
  profSince: 0,          // instante da última troca automática (para o `minHoldSec`)
  profSwitches: 0,       // quantas vezes o automático trocou (HUD/diagnóstico)
  profManual: false,     // o humano escolheu → o automático cala-se para o resto da sessão
  // --- BPM / grelha local ---
  intervals: [], bpmEst: 0, gridConf: 0, gridT0: 0, gridBar: 0, lastGridEmit: 0,
  // grelha recebida (a nossa, ou a de um emissor externo que a mande)
  grid: null, gridLocalT0: 0,
  bar: 0, phrase: 0, beatPhase: 0, barPhase: 0, phrasePhase: 0, lastBarSeen: -1,
  // --- §CLOCK (S1): relógio único. Tudo finito à nascença (regra 7: NaN mata feixes). ---
  beatTick: 0, barTick: 0, phraseTick: 0,   // contadores monotónicos (leitores: aresta por delta)
  beatIdx: 0, barIdx: 0,                    // posição: tempo no compasso (0-3), compasso na frase (0-7)
  clockConf: 0, clockAgeMs: 0,              // confiança 0-1 e ms desde o último beatTick
  clockSrc: 'none',                         // 'grid' | 'kick' | 'none' (HUD/diagnóstico)
  clockBeatAbs: -1, clockLastKickT: -Infinity, clockLastBeatT: 0,   // internos do §CLOCK
  // energia por compasso (inclinações da FSM)
  barEnergy: [], barEnergyAcc: 0, barEnergyN: 0,
  barHigh: [], barHighAcc: 0,
  secEnergy: [], lastSecT: 0, secAcc: 0, secN: 0,   // fallback sem grelha
  // FSM
  fsm: 'GROOVE', fsmSince: 0, fsmBar: 0, fsmStartT: 0,
  lastFlashT: -1e9, flashCount: 0, dimGain: [1, 1, 1], // §FLASHDIM
  preDropAmount: 0, dropOpen: 0, dropHold: 0, dropCount: 0, restrainThis: false,
  lastKickSeenT: -Infinity,
  log: [],
  // coreografia
  domSpot: 0, lastSwapBar: -1, phraseAccent: 0,
  // gestos
  gest: null, gestQueue: [], gestWeight: 0, gestUntil: 0, gestLast: null,
  gestNextGrooveBar: 24, gestCount: 0, gestSeen: {},
  // §BLACKOUT (S4): um por drop. Tudo finito à nascença (regra 7).
  blackoutCount: 0, blackoutAtDrop: -1, blackoutLastBeatTick: -1, blackoutT0: 0,
  blackoutRearmPhrase: -1,   // PRE_DROP falhado (saiu sem drop): rearma uma frase depois (-1 = não armado)
  // saída
  out: null, target: {}, health: 1,
  owner: null, handoverT: 0, skinForced: false,
  lastEmit: 0, lastT: MB_CLOCK.now(),
};

function baseOut() {
  return { opacity: 0.80, rpm: 0.60, beams: 14, beamInt: 0.08, haze: 0.50, spot: 0.80 };
}
state.out = baseOut();

function logEvent(to, why) {
  state.log.unshift({ t: MB_CLOCK.now(), from: state.fsm, to, why });
  if (state.log.length > 8) state.log.length = 8;
}
// eventos que não são transições de estado (gestos, perfil) entram no mesmo log mas sem seta
function logNote(why) {
  state.log.unshift({ t: MB_CLOCK.now(), note: true, why });
  if (state.log.length > 8) state.log.length = 8;
}
function setState(next, why) {
  if (next === state.fsm) return;
  logEvent(next, why);
  const prev = state.fsm;
  state.fsm = next;
  state.fsmSince = MB_CLOCK.now();
  state.fsmBar = state.bar;
  if (next === 'DROP' && MUSIC.strobe && MUSIC.strobe.dropEnter > 0) fireStrobe('drop', MUSIC.strobe.dropEnter);
  if (next === 'PRE_DROP') state.blackoutLastBeatTick = state.beatTick;   // §BLACKOUT: só ticks DEPOIS de entrar contam
  // §BLACKOUT: um PRE_DROP que sai SEM drop (timeout → BUILD) gastou a munição em falso; o técnico
  // volta a apagar no drop a sério, mas não a seguir — rearma só uma frase do relógio depois.
  if (prev === 'PRE_DROP' && next !== 'DROP') state.blackoutRearmPhrase = state.phraseTick + 1;
  if (next === 'DROP') state.blackoutRearmPhrase = -1;
  const DARK = next === 'BREAKDOWN' || next === 'BUILD' || next === 'PRE_DROP';
  const wasDark = prev === 'BREAKDOWN' || prev === 'BUILD' || prev === 'PRE_DROP';
  if (DARK && !wasDark) state.darkSince = state.fsmSince;
  explodeOnTransition(prev, next);
}

/* Explosão da bola: decisão do técnico presa às transições da máquina de estados.
 * Estoira no DROP e fica em estilhaços; a sucção de volta é o fim do breakdown — ou porque
 * entra em PRE_DROP (recompõe-se para voltar a estoirar no próximo drop) ou porque a música
 * voltou a GROOVE sem drop. Silêncio e mudança de perfil recompõem sempre. */
function explodeOnTransition(prev, next) {
  const MB = (typeof window !== 'undefined') && window.MIRRORBALL, X = MUSIC.explode;
  if (!MB || typeof MB.explode !== 'function' || !X || !X.on) return;
  const ex = MB.getExplode ? MB.getExplode() : { phase: 'idle' };
  const shattered = ex.phase !== 'idle' && ex.phase !== 'back';
  if (next === 'DROP') {
    const now = MB_CLOCK.now(), gap = (now - state.lastExplodeT) / 1000, dark = (now - state.darkSince) / 1000;
    let skip = null;
    if (X.skipRestrained && state.restrainThis) skip = 'drop contido';
    else if (X.fromBuildOnly && prev !== 'PRE_DROP' && prev !== 'BUILD') skip = `sem build (veio de ${prev})`;
    else if (dark < X.minDarkSec) skip = `breakdown curto (${dark.toFixed(0)}s < ${X.minDarkSec})`;
    else if (gap < X.minGapSec) skip = `último há ${gap.toFixed(0)}s (< ${X.minGapSec})`;
    else if (RNG() > X.chance) skip = 'sorteio';
    if (skip) { logNote(`explosão: não (${skip})`); return; }
    MB.explode({ autoHold: false, fromMotor: true });
    state.lastExplodeT = now; state.explodeCount++;
    logNote(`explosão #${state.explodeCount}: drop #${state.dropCount} após ${dark.toFixed(0)}s escuro`);
    return;
  }
  if (!shattered) return;
  const rewind =
    next === 'PRE_DROP' ||                                   // fim do breakdown: recompõe antes do próximo drop
    (next === 'GROOVE' && prev !== 'DROP') ||                // breakdown/build desfez-se, silêncio, perfil
    (X.hold === 'drop' && prev === 'DROP');                  // variante: recompõe no fim da abertura
  if (rewind) { MB.rewind(); logNote(`rewind: ${prev} → ${next}`); }
}

/* ================================ entrada de mensagens ================================ */
// Um único ponto de entrada: gerador, sidecar e a nossa própria grelha entram pela mesma porta.
function onMessage(d) {
  if (!d || typeof d !== 'object') return;
  if (d.type === 'features') return ingestFeatures(d);
  if (d.type === 'grid') return ingestGrid(d);
  if (d.type === 'clock') return MB_CLOCK.ingest(d);
  if (d.type === 'clock-req') return GEN.answerClock(d);
  if (d.type === 'profile') return setProfile(d.value);
}
if (typeof addEventListener === 'function') addEventListener('message', e => onMessage(e && e.data));

/* ---------- driver autónomo (fora do OS): página servida pelo próprio audio-sidecar ----------
 * Quando a bola é aberta em http://127.0.0.1:3739/app/index-v2.html?src=music (sem pai),
 * liga-se diretamente ao WS do sidecar: /app-token dá o token (só same-origin), e as
 * mensagens entram pelo mesmo onMessage. Dentro do OS o pai faz isto (useAudioDriver). */
(function standaloneDriver() {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return;
  if (window.parent !== window) return;                    // dentro do OS: o pai é o driver
  if (!/^\/app\//.test(location.pathname)) return;         // só quando servida pelo sidecar
  let ws = null;
  async function connect() {
    try {
      const j = await (await fetch('/app-token', { cache: 'no-store' })).json();
      ws = new WebSocket(`${j.ws}/ws?token=${encodeURIComponent(j.token)}`, ['agentos-audio', j.token]);
      ws.onmessage = ev => {
        try { const m = JSON.parse(ev.data);
          if (m.type === 'clock') onMessage({ type: 'clock', id: m.id, tClient: m.tClient, tEmit: m.tServer }); else onMessage(m);
        } catch (e) {}
      };
      ws.onclose = () => { onMessage({ type: 'features', silence: true }); setTimeout(connect, 2000); };
      ws.onerror = () => ws && ws.close();
    } catch (e) { setTimeout(connect, 3000); }
  }
  // clock-req: o motor posta na própria window quando não há pai; reencaminhar para o sidecar
  addEventListener('message', e => {
    const d = e && e.data;
    if (d && d.type === 'clock-req' && ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'clock', id: d.id, tClient: d.tClient }));
  });
  connect();
})();

const PROFILES = ['electronica', 'acustico', 'voz'];
/* `auto` só é true quando quem chama é o classificador (§PROFAUTO). Qualquer outra origem —
 * tecla `p`, {type:'profile'} da tab do OS, consola — conta como ESCOLHA HUMANA e desliga a
 * deteção automática para a sessão. Nunca se sobrepõe uma decisão do David: a única forma de
 * voltar a ligar é `MUSIC.profileAuto.auto = true` (painel `k`) ou recarregar a página. */
function setProfile(p, auto) {
  if (PROFILES.indexOf(p) === -1) return;
  if (!auto) {
    // Marca-se o manual mesmo que o perfil pedido já seja o atual: o gesto do David é uma
    // instrução ("é este"), não só uma mudança de valor — e tem de calar o automático na mesma.
    if (!state.profManual) logNote('perfil manual — deteção automática desligada');
    state.profManual = true;
  }
  if (p === MUSIC.profile) return;
  logNote(`perfil → ${p}${auto ? ' (auto)' : ''}`);
  MUSIC.profile = p;
  // trocar de perfil não pode dar corte: os gestos são de `electronica`, saem por rampa
  if (p !== 'electronica') { state.gest = null; state.gestQueue.length = 0; }
}

function ingestFeatures(f) {
  const nowL = MB_CLOCK.now();
  // features SEM `hint` só podem vir de um emissor real (o gerador etiqueta sempre) — marcá-lo
  // cala o gerador enquanto houver sidecar, senão os dois escreviam por cima um do outro.
  if (f.hint == null) GEN.markExternal(nowL);
  state.feat = f;
  state.lastFeatLocal = nowL;
  state.silent = !!f.silence;

  const dt = Math.min(0.1, (state.loudAccT ? nowL - state.loudAccT : 20) / 1000);
  state.loudAccT = nowL;

  const l = +f.loudness || 0, bass = +f.bass || 0, high = +f.high || 0, rms = +f.rms || 0;

  // loudness integrado com gate — divisor da normalização (§1.1)
  if (l > MUSIC.norm.gate && !f.silence) {
    const k = 1 - Math.exp(-dt / MUSIC.norm.windowSec);
    state.loudAvg += (l - state.loudAvg) * k;
  }
  // loudness de janela CURTA: é este que alimenta opacidade/spots. Curto o bastante para o
  // drop morder, longo o bastante para não seguir o kick.
  state.loudShort += (l - state.loudShort) * (1 - Math.exp(-dt / MUSIC.norm.shortSec));
  state.rmsShort += (rms - state.rmsShort) * (1 - Math.exp(-dt / 0.20));

  // bandas: DUAS janelas com papéis diferentes.
  //  - `bassAvg` (1.6 s) é a linha de base contra a qual o kick se destaca (o detetor).
  //  - `bassShort` (0.25 s) é o corpo da banda, para o haze (inverso de bass) e a FSM.
  {
    const kL = 1 - Math.exp(-dt / MUSIC.kick.bassAvgSec);
    state.bassAvg += (bass - state.bassAvg) * kL;
    const kS = 1 - Math.exp(-dt / 0.25);
    state.bassShort += (bass - state.bassShort) * kS;
    const kH = 1 - Math.exp(-dt / 0.40);
    state.highAvg += (high - state.highAvg) * kH;
    // sidecar ≥ 2026-08-28: `sub` (40-120 Hz, corpo do bombo) e `hat` (≥ 6 kHz) em dB próprio
    const sub = f.sub != null ? +f.sub : bass, hat = f.hat != null ? +f.hat : high;
    state.subAvg = (state.subAvg == null ? sub : state.subAvg + (sub - state.subAvg) * kL);
    state.hatAvg = (state.hatAvg == null ? hat : state.hatAvg + (hat - state.hatAvg) * (1 - Math.exp(-dt / 1.0)));
    // densidade espectral (sidecar `density`): muita informação → mais acontecimento na bola;
    // pouca → subtileza. `act` escala amplitudes e acelera/abranda os taus (ver applyActivity).
    const dens = f.density != null ? +f.density : 0.35;
    state.densAvg = (state.densAvg == null ? dens : state.densAvg + (dens - state.densAvg) * (1 - Math.exp(-dt / 2.0)));
    state.act = clamp((state.densAvg - MUSIC.activity.low) / (MUSIC.activity.high - MUSIC.activity.low), 0, 1);
    // marcação dos agudos: hat acima da sua média → pulso curto (release ~120 ms)
    const hatOver = clamp((hat - state.hatAvg) * MUSIC.hat.gain, 0, 1);
    state.hatPulse = Math.max(hatOver * lerp(MUSIC.activity.hatMin, 1, state.act), (state.hatPulse || 0) * Math.exp(-dt / MUSIC.hat.releaseSec));

    /* --- Receita B (pesquisa §7): agudos POR BANDA, com o mesmo limiar por mediana ---
     * Quando o sidecar manda `hatFluxRaw`, os feixes deixam de seguir `high`+`onset` GLOBAL
     * (que sobe com qualquer coisa: voz, crash, sintetizador) e passam a seguir o transiente
     * real de 6-16 kHz. Aqui não interessa o evento discreto e sim o ENVELOPE (attack 0.5 /
     * release 0.08 — o "Fall" do Resolume): é o que acende os feixes sem os fazer piscar.
     * O nível é o flux relativo à sua própria mediana, comprimido a 0..1. */
    const hasRawHat = f.hatFluxRaw != null && isFinite(+f.hatFluxRaw);
    if (hasRawHat) {
      const hf = +f.hatFluxRaw;
      const hbeat = state.hatDet.push(hf, nowL);
      if (hbeat) state.hatFlash = 1;
      const med = state.hatDet.med;
      // rácio flux/mediana mapeado 1..(1+C) → 0..1: abaixo da mediana não há agudo nenhum.
      const ratio = med > 0 ? hf / med : 0;
      const span = Math.max(0.2, state.hatDet.C - 1);
      state.hatLevel = state.hatEnv.push(clamp((ratio - 1) / span, 0, 1));
      // §DETSTATS (agudos) — cópias, tal como no kick. Ver o comentário no literal de `state`.
      const D = state.det, hd = state.hatDet;
      D.hatFlux = hd.last; D.hatMed = hd.med; D.hatStd = hd.std; D.hatVRel = hd.vRel;
      D.hatC = hd.C; D.hatThr = hd.C * hd.med; D.hatBeat = hbeat ? 1 : 0;
    } else {
      // Fallback: o pulso antigo por banda `hat` (ou `high`) contra a média móvel.
      state.hatLevel = state.hatPulse;
      const D = state.det;
      D.hatFlux = state.hatPulse; D.hatMed = 0; D.hatStd = 0; D.hatVRel = 0;
      D.hatC = 0; D.hatThr = 0; D.hatBeat = 0;
    }
    state.hatFlash *= 0.90;
    state.centroidAvg += ((+f.centroid || 0) - state.centroidAvg) * (1 - Math.exp(-dt / 1.2));
  }

  detectKick(nowL, f);
  // §SNARE: a queda do acento vive AQUI (taxa de features, ~50 Hz) e não no rAF, porque é o
  // detetor que o levanta — assim o par subir/cair anda no mesmo relógio.
  state.snareAccent *= Math.exp(-dt / MUSIC.snare.decaySec);
  detectSnare(nowL, f);

  // energia acumulada por compasso / por segundo (inclinações da FSM)
  state.barEnergyAcc += state.loudShort; state.barHighAcc += state.highAvg; state.barEnergyN++;
  state.secAcc += state.loudShort; state.secN++;
  if (nowL - state.lastSecT > 1000) {
    state.lastSecT = nowL;
    if (state.secN) { state.secEnergy.push(state.secAcc / state.secN); if (state.secEnergy.length > 16) state.secEnergy.shift(); }
    state.secAcc = 0; state.secN = 0;
  }
}

/* ================== §BANDONSET — limiar por mediana + variância (Patin/aubio) ==================
 * `docs/beat-detection-research.md` §6/§7/§9. Consome o flux LINEAR CRU de uma banda
 * (`subFluxRaw`/`hatFluxRaw`) e decide "é batida" contra a MEDIANA do próprio histórico.
 * Porquê mediana e não média: a média é levantada pelo próprio kick que se quer detetar e fica
 * levantada durante toda a janela; a mediana ignora o outlier. Porquê o teste de variância: sem
 * ele, ruído estacionário (ou um pad denso) passa o rácio e dispara em falso — é o V0 de Patin. */
class Env {
  constructor(attack, release) { this.a = attack; this.r = release; this.v = 0; }
  push(x) {
    const y = +x || 0;                        // NaN/undefined → 0 (regra 7: nada de NaN a jusante)
    const k = y > this.v ? this.a : this.r;
    this.v += k * (y - this.v);
    return this.v;
  }
}

class BandOnset {
  /* `kind` = 'kick' | 'hat'. Os limiares são lidos do CONFIG A CADA FRAME, nunca copiados no
   * construtor: copiá-los faria com que mexer no slider `kickC0` (painel `k` ou ficheiro) não
   * tivesse efeito nenhum até se reinstanciar o detetor — que é exatamente o bug que o
   * instrumento apanhou (C0 de 1.6 a 6.0 dava sempre os mesmos 259 kicks). Só `N` fica fixo:
   * mudá-lo a meio invalidaria o histórico já acumulado. */
  constructor(opts) {
    const B = MUSIC.bandOnset, o = opts || {};
    this.kind = (o.kind === 'hat' || o.kind === 'snare') ? o.kind : 'kick';
    this.N = o.N || B.N;
    this.hist = [];
    this.lastBeat = -Infinity;
    // Instrumentação para o HUD — inicializada, nunca undefined (regra 7 / lição 2 do handoff).
    this.med = 0; this.std = 0; this.vRel = 0; this.C = this.C0; this.last = 0; this.peak = 0;
  }
  /* Limiar base e refratário VIVOS: lidos do CONFIG a cada uso. */
  // A tarola lê os SEUS knobs de `MUSIC.snare` e não de `bandOnset`: são grandezas diferentes
  // (uma banda mais esparsa, um refratário de contratempo) e misturá-las no mesmo literal fazia
  // com que afinar o bombo mexesse na tarola sem se perceber porquê.
  get C0() { const B = MUSIC.bandOnset; return this.kind === 'snare' ? MUSIC.snare.C0 : this.kind === 'hat' ? B.hatC0 : B.kickC0; }
  get refractMs() { const B = MUSIC.bandOnset; return this.kind === 'snare' ? MUSIC.snare.refractMs : this.kind === 'hat' ? B.hatRefractMs : B.kickRefractMs; }
  push(x, tMs) {
    const v = +x || 0;
    this.last = v;
    // §PISOABS — pico lento do flux (decai ~40 s, como a referência do sidecar). MEDIDO (feat-2026-08-29,
    // vazio de bombo 31-35 s): a mediana cai para 0.3 e o resíduo (flux 0.3-2 vs ~10 com bombo) passava
    // o C×mediana a cada 0.2 s — a presença nunca caía e a bola não parava. Um kick tem de ser também
    // uma fração (`absFloor`) do pico recente: relativo À MÚSICA, não ao ruído do momento.
    this.peak = Math.max(v, this.peak * 0.9995);
    this.hist.push(v);
    if (this.hist.length > this.N) this.hist.shift();
    if (this.hist.length < this.N) return false;   // ainda a encher: nunca dispara

    const s = this.hist.slice().sort((a, b) => a - b);
    const med = s[s.length >> 1];
    let mean = 0;
    for (const h of this.hist) mean += h;
    mean /= this.N;
    let varr = 0;
    for (const h of this.hist) varr += (h - mean) * (h - mean);
    varr /= this.N;
    const std = Math.sqrt(varr);

    // C adaptativo, na forma de Patin (C desce quando a variância sobe). Patin usa
    // C = -0.0025714·V + 1.5142857 sobre energia linear; aqui normaliza-se V pela mediana
    // para a constante não depender do ganho do loopback.
    const B = MUSIC.bandOnset;
    const vRel = med > 0 ? std / med : 0;
    const C = Math.max(B.cFloor, this.C0 - B.cVarGain * Math.min(vRel, 1));

    this.med = med; this.std = std; this.vRel = vRel; this.C = C;

    const absFloor = this.kind === 'kick' ? (B.absFloor == null ? 0.2 : B.absFloor) : 0;   // só o bombo (hat/tarola: sem medição)
    const isBeat = med > 0 &&
      v > C * med &&
      v >= absFloor * this.peak &&
      std > B.minStdRatio * med &&
      (tMs - this.lastBeat) > this.refractMs;
    if (isBeat) this.lastBeat = tMs;
    return isBeat;
  }
}

// Instanciados uma vez (e re-instanciáveis se o CONFIG for sobreposto em runtime). Corre já,
// aqui, para que `state.kickDet` nunca seja null quando a 1.ª feature chegar.
function resetDetectors() {
  const B = MUSIC.bandOnset;
  state.kickDet = new BandOnset({ N: B.N, kind: 'kick' });
  state.hatDet = new BandOnset({ N: B.N, kind: 'hat' });
  state.hatEnv = new Env(B.hatEnvTau[0], B.hatEnvTau[1]);
  state.snareDet = new BandOnset({ N: B.N, kind: 'snare' });
  state.snareHist.length = 0;
  state.snarePrevMid = null;
}
resetDetectors();

/* ================== §SNARE — deteção de TAROLA (200-800 Hz) ==================
 * O raciocínio, as medições e os dois caminhos estão no literal `MUSIC.snare`, no topo. Aqui só
 * a mecânica. Corre a cada feature, ao lado do §KICK.
 *
 * A diferença estrutural para o `hat`: o `hat` produz um ENVELOPE contínuo (`hatLevel`), porque
 * é textura; a tarola produz um EVENTO que decai (`snareAccent`), porque é um acento. É por isso
 * que aqui não há `Env` de dois pólos — há um salto para 1 e uma queda exponencial. */
function detectSnare(nowL, f) {
  const S = MUSIC.snare;
  // Interruptor mestre a 0: o motor comporta-se exatamente como antes desta funcionalidade.
  if (!S.on) { state.snareAccent = 0; return; }

  const rms = +f.rms || 0;
  const hasRawMid = f.midFluxRaw != null && isFinite(+f.midFluxRaw);
  let hit = false;

  if (hasRawMid) {
    // Caminho preferido: flux linear cru da banda da tarola → o §BANDONSET de sempre.
    state.snarePath = 'raw';
    const v = +f.midFluxRaw;
    const beat = state.snareDet.push(v, nowL);
    state.snareFlux = v;
    state.snareThr = state.snareDet.C * state.snareDet.med;
    hit = beat;
  } else {
    /* Fallback: derivada rectificada de `mid`. ⚠ Limiar ADITIVO (mediana + k·MAD) e não por
     * rácio — com mediana ≈ 0 (medido: p50 = 0.00000) o teste `v > C·mediana` do §BANDONSET
     * passa sempre e o detetor perde o controlo (varrimento de C0 1.4→3.5: sempre ~150 hits,
     * 61 em silêncio). O PISO ABSOLUTO `fbFloor` é o que realmente separa a tarola do resto. */
    state.snarePath = 'fallback';
    const mid = +f.mid || 0;
    const v = state.snarePrevMid == null ? 0 : Math.max(0, mid - state.snarePrevMid);
    state.snarePrevMid = mid;
    state.snareFlux = v;

    const H = state.snareHist;
    H.push(v);
    if (H.length > MUSIC.bandOnset.N) H.shift();
    if (H.length >= MUSIC.bandOnset.N) {
      const s = H.slice().sort((a, b) => a - b);
      const med = s[s.length >> 1];
      const dev = H.map(x => Math.abs(x - med)).sort((a, b) => a - b);
      const mad = dev[dev.length >> 1] * 1.4826;
      const thr = Math.max(S.fbFloor, med + S.fbK * mad);
      state.snareThr = thr;
      hit = v > thr;
    }
  }

  // Guardas comuns aos dois caminhos, iguais às do §KICK. O `rmsMin` não é opcional: o vazio de
  // `tools/feat` tem rms mediano 0.002 e o sidecar NUNCA levanta `silence` (0 em 2667 frames).
  if (hit && (f.silence || rms < S.rmsMin || (nowL - state.snareLastT) < S.refractMs)) hit = false;

  if (hit) {
    state.snareLastT = nowL;
    state.snareAccent = 1;
    state.snareCount++;
    if (MUSIC.flash && MUSIC.flash.on && !isCalm() && RNG2() < MUSIC.flash.snare) fireFlash('snare', 1);
  }
}

/* ================== §KICK — deteção de bombo a partir das features 50 Hz ==================
 * DOIS caminhos, escolhidos pelo que o emissor manda:
 *
 * (1) PREFERIDO — sidecar ≥ 2026-08-28 manda `subFluxRaw` (flux linear cru da sub-banda
 *     40-120 Hz): usa-se o §BANDONSET acima (mediana + variância + C adaptativo). Flux e não
 *     energia porque o flux ignora baixo SUSTENTADO e só reage a transientes — é essa a
 *     diferença entre o bombo e a linha de baixo.
 *
 * (2) FALLBACK — sidecar antigo, gerador sintético (`g`) ou replay gravado antes desta mudança:
 *     o caminho original, `subOnset`/`sub` (ou `onset`/`bass`) contra a média móvel, com o
 *     refratário de 200 ms. Mantido INTACTO de propósito: o harness e o `replay-real.js`
 *     alimentam features sem `*Raw` e têm de continuar a dar o mesmo resultado.
 *
 * Em ambos, as condições de guarda (silêncio, piso de rms) são as mesmas. */
function detectKick(nowL, f) {
  const K = MUSIC.kick;
  const rms = +f.rms || 0;
  const hasRawSub = f.subFluxRaw != null && isFinite(+f.subFluxRaw);
  let isKick;

  if (hasRawSub) {
    // Caminho novo: mediana + variância sobre o flux cru. As guardas de silêncio/rms ficam,
    // porque o flux cru não sabe nada sobre o nível absoluto da sala.
    const beat = state.kickDet.push(+f.subFluxRaw, nowL);
    isKick = beat && !f.silence && rms >= K.rmsMin;
    // §DETSTATS: espelha o que o detetor acabou de calcular (só cópias — não decide nada).
    // `kickThr` é o limiar EFETIVO deste frame: é esta a linha tracejada do tuner-lab.
    const D = state.det, kd = state.kickDet;
    D.path = 'raw';
    D.kickFlux = kd.last; D.kickMed = kd.med; D.kickStd = kd.std; D.kickVRel = kd.vRel;
    D.kickC = kd.C; D.kickThr = kd.C * kd.med; D.kickBeat = isKick ? 1 : 0;
  } else {
    const hasSub = f.subOnset != null;
    const onset = hasSub ? +f.subOnset : (+f.onset || 0);
    const band = hasSub ? +f.sub : (+f.bass || 0);
    const avg = hasSub ? state.subAvg : state.bassAvg;
    isKick = !f.silence &&
      onset >= K.onsetMin &&
      (hasSub ? band > avg + K.subOver : band > avg * K.bassRatio) &&
      rms >= K.rmsMin &&
      (nowL - state.lastKickT) > K.refractoryMs;
    // §DETSTATS no caminho antigo: aqui não há mediana nem C — o que se pode publicar é o par
    // (sinal, limiar) equivalente, para o tuner-lab desenhar a mesma leitura em vez de nada.
    const D = state.det;
    D.path = 'fallback';
    D.kickFlux = onset; D.kickMed = 0; D.kickStd = 0; D.kickVRel = 0;
    D.kickC = 0; D.kickThr = K.onsetMin; D.kickBeat = isKick ? 1 : 0;
  }

  if (isKick) {
    if (state.lastKickT > -Infinity) {
      const iv = nowL - state.lastKickT;
      if (iv >= MUSIC.bpm.minIntervalMs && iv <= MUSIC.bpm.maxIntervalMs) pushInterval(iv);
    }
    state.lastKickT = nowL;
    state.lastKickSeenT = nowL;
    state.kickFlash = 1;
    state.kickTimes.push(nowL);
    state.kickHistory.push(nowL);
    updateBpm(nowL);
    onKickBeat(nowL);
  }
  state.kickFlash *= 0.92;

  // histórico longo de tempos de kick — alimenta a autocorrelação de desempate do §GRID
  const keepCut = nowL - MUSIC.bandOnset.keepTimesMs;
  while (state.kickHistory.length && state.kickHistory[0] < keepCut) state.kickHistory.shift();

  // kickRate: kicks/s numa janela de 2 s
  const cut = nowL - K.rateWindowSec * 1000;
  while (state.kickTimes.length && state.kickTimes[0] < cut) state.kickTimes.shift();
  state.kickRate = state.kickTimes.length / K.rateWindowSec;

  // kickPresence 0..1 suavizado: attack 0.3 s / release 1.5 s. Se o bombo parou há mais de
  // `gapDeadSec`, o alvo é 0 mesmo que ainda haja kicks na janela — é isto que faz a rotação
  // PARAR quando o bombo pára, e não apenas abrandar.
  //
  // O ALVO é a fração das batidas ESPERADAS encontradas na janela (pesquisa §6 ponto 5), e não
  // o antigo `kickRate/rateFull` fixo. Com o divisor fixo, uma faixa a 110 BPM nunca chegava a
  // presença 1.0 só por ser mais lenta — a bola ficava permanentemente a meio gás em tudo o que
  // não fosse ~156 BPM. Com o BPM estimado, 4 kicks em 2 s a 128 BPM (esperadas 4.27) ⇒ 0.94.
  // Sem BPM fiável ainda (arranque, ou `bpmEst` a 0) cai-se em `presenceMinBpm`, que reproduz
  // aproximadamente o comportamento antigo em vez de dividir por zero.
  const BO = MUSIC.bandOnset;
  const win = BO.presenceWindowMs;
  let found = 0;
  for (let i = state.kickTimes.length - 1; i >= 0 && nowL - state.kickTimes[i] <= win; i--) found++;
  const bpmNow = state.bpmEst > 0 ? 60000 / state.bpmEst : 0;
  const bpmForPresence = bpmNow > 0 ? bpmNow : BO.presenceMinBpm;
  const expected = (bpmForPresence / 60) * (win / 1000);
  state.kickExpected = expected;
  const raw = expected > 0 ? clamp(found / expected, 0, 1) : 0;

  const gap = nowL - state.lastKickT;
  const dead = !(gap < K.gapDeadSec * 1000);
  const tgt = dead ? 0 : raw;
  const dt = Math.min(0.1, 0.02);
  const tau = dead ? [K.presenceTau[0], K.deadTau] : K.presenceTau;
  state.kickPresence = ease(state.kickPresence, tgt, tau, dt);

  updateProfileAuto(nowL);
}

/* ============ §PROFAUTO — classificador de perfil (electronica | acustico) ============
 * O RACIOCÍNIO e os números medidos estão no literal `MUSIC.profileAuto`, no topo. Aqui só a
 * mecânica. Corre a cada feature (50 Hz), a seguir ao detetor de bombo, porque o seu sinal
 * primário são os tempos de kick que o detetor acabou de produzir.
 *
 * Porquê um histórico próprio e não `state.kickHistory`: aquele guarda 8 s (`keepTimesMs`),
 * dimensionado para a autocorrelação do §GRID. Oito segundos dão ~16 intervalos a 128 BPM —
 * exatamente o mínimo — e uma única frase musical. Uma decisão que quer ser LENTA e estrutural
 * precisa de ver mais do que uma frase, daí a janela dedicada de 30 s.
 *
 * NÃO decide `voz`: nenhuma das duas gravações reais tem material vocal isolado para calibrar
 * um terceiro limiar, e inventar um à sensação era repetir a lição cara do handoff S2
 * ("medir antes de afinar"). `voz` continua a existir e a ser escolhível à mão. */
function updateProfileAuto(nowL) {
  const P = MUSIC.profileAuto;
  // Desligado, ou o humano já mandou → o automático não existe. É aqui que se garante que com
  // `auto` a 0 o comportamento é EXATAMENTE o de antes desta funcionalidade.
  if (!P || !P.auto || state.profManual) return;
  if (state.profT0 === 0) state.profT0 = nowL;

  // --- sinal secundário: média longa de `hat` (τ 20 s). Sobrevive a `hat` ausente (feature
  // antiga / gerador sintético), caso em que fica a 0 e o veto de `acustico` nunca deixa sair
  // de `electronica` — falhar para o default é o comportamento seguro.
  const f = state.feat;
  const hatNow = (f && f.hat != null && isFinite(+f.hat)) ? +f.hat : 0;
  const dtH = 0.02;
  state.profHat = (state.profHat == null)
    ? hatNow
    : state.profHat + (hatNow - state.profHat) * (1 - Math.exp(-dtH / Math.max(0.1, P.hatTau)));

  // --- janela deslizante dedicada de tempos de kick
  const H = state.profHist;
  if (state.lastKickT === nowL) H.push(nowL);
  const cut = nowL - P.windowMs;
  while (H.length && H[0] < cut) H.shift();

  // --- intervalos VÁLIDOS: os gaps grandes são ausência de bombo, não irregularidade (defesa 1)
  const d = [];
  for (let i = 1; i < H.length; i++) {
    const x = H[i] - H[i - 1];
    if (x > 0 && x <= P.gapMaxMs) d.push(x);
  }
  // cobertura: que fração da janela os intervalos válidos explicam (defesa 2). No arranque a
  // janela ainda não está cheia, por isso o divisor é o menor entre a janela e o tempo decorrido.
  let sum = 0;
  for (let i = 0; i < d.length; i++) sum += d[i];
  const span = Math.max(1, Math.min(P.windowMs, nowL - state.profT0));
  state.profCov = clamp(sum / span, 0, 1);

  // --- sinal primário: CV dos últimos `minIntervals` intervalos válidos
  state.profCv = null;
  if (d.length >= P.minIntervals && state.profCov >= P.minCoverage) {
    const w = d.slice(-P.minIntervals);
    let m = 0;
    for (let i = 0; i < w.length; i++) m += w[i];
    m /= w.length;
    if (m > 0) {
      let v = 0;
      for (let i = 0; i < w.length; i++) v += (w[i] - m) * (w[i] - m);
      const cv = Math.sqrt(v / w.length) / m;
      if (isFinite(cv)) state.profCv = cv;
    }
  }

  // --- integrador lento. Só corre com leitura válida: sem cobertura o score CONGELA, não
  // decai (defesa 2 — a ausência de bombo não é prova de que a música é acústica).
  if (state.profCv != null) {
    state.profEvidenceSec += dtH;
    const inst = state.profCv < P.cvRegular ? 1 : 0;
    state.profScore = (state.profScore == null)
      ? inst
      : state.profScore + (inst - state.profScore) * (1 - Math.exp(-dtH / Math.max(0.1, P.scoreTau)));
  }
  if (state.profScore == null || state.profEvidenceSec < P.evidenceSec) return;

  // --- histerese: banda morta entre os dois limiares + tempo mínimo no perfil atual
  const held = nowL - state.profSince;
  if (state.profDecided && held < P.minHoldSec * 1000) return;

  const hat = state.profHat == null ? 0 : state.profHat;
  let want = null;
  if (state.profScore > P.enterElectronica && hat < P.hatElectronicaMax) want = 'electronica';
  else if (state.profScore < P.enterAcustico && hat > P.hatAcusticoMin) want = 'acustico';

  if (want && want !== MUSIC.profile) {
    setProfile(want, true);
    state.profSwitches++;
    state.profSince = nowL;
  }
  if (!state.profDecided) { state.profDecided = true; if (!state.profSince) state.profSince = nowL; }
}

/* ================== §GRID — BPM por intervalos + grelha local ==================
 * Mediana dos últimos 8 intervalos entre kicks, com prior de oitava 100-150 BPM (dobra ou
 * divide até cair na janela — é o remédio standard para half/double-time, a falha mais comum).
 * Histerese: só se muda a estimativa se a mediana se afastar > 4%, senão a grelha treme e o
 * `t0` salta, e a fase do compasso salta com ele. */
function pushInterval(iv) {
  state.intervals.push(iv);
  if (state.intervals.length > MUSIC.bpm.keep) state.intervals.shift();
}
function median(a) {
  if (!a.length) return 0;
  const s = a.slice().sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function foldToPrior(periodMs) {
  const B = MUSIC.bpm;
  const loMs = 60000 / B.hi, hiMs = 60000 / B.lo;   // 400 ms .. 600 ms
  let p = periodMs, guard = 0;
  while (p < loMs && guard++ < 8) p *= 2;
  guard = 0;
  while (p > hiMs && guard++ < 8) p /= 2;
  return p;
}
/* Autocorrelação sobre a LISTA DE TEMPOS de kick (pesquisa §8/§9). Pontua cada BPM candidato
 * pela quantidade de intervalos que são um múltiplo INTEIRO k=1..4 do seu período. É por isso
 * que é imune ao erro que mata a mediana: se o detetor perder batidas alternadas, a mediana
 * mede o dobro do período e o `foldToPrior` "corrige" para o BPM errado com toda a confiança;
 * aqui, um intervalo do dobro pontua na mesma para o BPM certo (com k=2).
 * Devolve 0 = "sem opinião" — e nesse caso não se desempata coisa nenhuma. */
function estimateBpm(times) {
  const A = MUSIC.bpmAuto, B = MUSIC.bpm;
  if (!times || times.length < A.minTimes) return 0;
  let best = 0, bestScore = 0;
  for (let bpm = B.lo; bpm <= B.hi; bpm += A.step) {
    const period = 60000 / bpm;
    let score = 0;
    for (let i = 1; i < times.length; i++) {
      const d = times[i] - times[i - 1];
      const k = Math.round(d / period);
      if (k >= 1 && k <= 4) {
        const err = Math.abs(d - k * period) / period;
        score += Math.max(0, 1 - err * A.tolerance);
      }
    }
    if (score > bestScore) { bestScore = score; best = bpm; }
  }
  return bestScore > A.minScore ? best : 0;
}

function updateBpm(nowL) {
  const B = MUSIC.bpm;
  if (state.intervals.length < 3) return;
  const med = foldToPrior(median(state.intervals));
  if (!(med > 0)) return;

  // confiança = regularidade: desvio absoluto médio dos intervalos (dobrados ao mesmo prior)
  const folded = state.intervals.map(foldToPrior);
  const m2 = median(folded);
  let mad = 0;
  for (const v of folded) mad += Math.abs(v - m2);
  mad = folded.length ? mad / folded.length / Math.max(m2, 1) : 1;
  const conf = clamp(1 - mad / B.confSpreadFull, 0, 1) * clamp(state.intervals.length / B.keep, 0, 1);
  state.gridConf = state.gridConf + (conf - state.gridConf) * 0.25;

  /* --- DESEMPATE por autocorrelação (pesquisa §8) — não substituição ---
   * A mediana continua a mandar sempre que está confiante. Só quando `gridConf` cai abaixo de
   * `confBelow` (mediana a não convergir — o cenário em que ela mede o dobro do período e o
   * `foldToPrior` a "corrige" para o BPM errado) é que se aceita a opinião da autocorrelação,
   * e mesmo aí só se ela tiver score suficiente (senão `estimateBpm` devolve 0). */
  let period = med;
  state.bpmSource = 'mediana';
  const A = MUSIC.bpmAuto;
  if (A.enabled) {
    const auto = estimateBpm(state.kickHistory);
    state.bpmAuto = auto;
    if (auto > 0 && state.gridConf < A.confBelow) {
      period = 60000 / auto;
      state.bpmSource = 'autocorr';
    }
  }

  if (!state.bpmEst || Math.abs(period - state.bpmEst) / state.bpmEst > B.hysteresis) {
    state.bpmEst = period;
    // realinhar o "1" a este kick, mas manter a contagem de compassos contínua
    state.gridT0 = nowL;
    state.gridBar = state.bar;
  }
}
// Emite a grelha pelo MESMO caminho de mensagens — a Camada 2 (updateGrid) não sabe nem precisa
// de saber que a grelha nasceu aqui dentro. Republica-se a cada 500 ms com um `t0` que é sempre
// o downbeat mais recente extrapolado, para a fase não derivar entre emissões.
function emitLocalGrid(nowL) {
  const B = MUSIC.bpm;
  if (!state.bpmEst || state.gridConf < 0.05) return;
  if (nowL - state.lastGridEmit < B.emitEveryMs) return;
  if (GEN.isExternalGrid()) return;    // se alguém de fora manda grelha, não competimos
  state.lastGridEmit = nowL;
  const barMs = state.bpmEst * B.beatsPerBar;
  const barsElapsed = Math.floor((nowL - state.gridT0) / barMs);
  const t0 = state.gridT0 + barsElapsed * barMs;
  onMessage({
    type: 'grid', v: 1, t0, beatPeriodMs: state.bpmEst,
    beatsPerBar: B.beatsPerBar, barsPerPhrase: B.barsPerPhrase,
    barIndex: state.gridBar + barsElapsed,
    phraseIndex: Math.floor((state.gridBar + barsElapsed) / B.barsPerPhrase),
    confidence: state.gridConf, local: true,
  });
}
/* §FLASHDIM — flash curto num pinspot "extra" (posição plausível sorteada pela bola). Cap a 3 Hz.
 * RNG2 (o dos spots), para não mexer na sequência determinística dos gestos. */
/* §STROBE — estrobo de fundo via MIRRORBALL.strobe(); a bola decide se está ligado (knob do David) e impõe
 * o minGapMs. Aqui só se decide QUANDO faz sentido musical: raro, em DROP. */
function strobeRate() { const MB = (typeof window !== 'undefined') && window.MIRRORBALL; const r = MB && MB.config && Number.isFinite(MB.config.strobeRate) ? MB.config.strobeRate : 1; return Math.max(0, r); }
function fireStrobe(why, n) {
  const S = MUSIC.strobe, MB = (typeof window !== 'undefined') && window.MIRRORBALL;
  if (!S || !S.on || !MB || typeof MB.strobe !== 'function' || !(MB.strobeEnabled && MB.strobeEnabled())) return;
  if (blackoutActive()) return;                                        // §BLACKOUT: escuro é escuro
  // knob `strobe: frequência ×` do painel d: < 1 = sorteio para deixar passar só essa fração; > 1 encurta o intervalo em GROOVE (abaixo)
  const rate = strobeRate();
  if (rate <= 0 || (rate < 1 && RNG2() > rate)) return;
  // > 1: rajadas mais prováveis (o slider tem de se SENTIR)
  if ((n | 0) <= 1 && S.burstN && rate > 1 && RNG2() < Math.min(0.9, (S.burstChance || 0) * rate)) n = Math.round(rng2Range(S.burstN));
  // §RAJADA: um disparo isolado sai às vezes como 3-4 flashadas seguidas (o David: 'como num clube')
  if ((n | 0) <= 1 && S.burstN && RNG2() < (S.burstChance || 0)) n = Math.round(rng2Range(S.burstN));
  const k = Math.max(1, n | 0), lv = () => S.level[0] + RNG2() * (S.level[1] - S.level[0]);
  /* `fromMotor:true` — auditoria de sync (2026-09-01). Sem a flag, o `motorAllowed()` da bola
     (v2/main.js) devolvia SEMPRE true e o disjuntor 'focos+flashes: motor manda' não filtrava nada
     vindo daqui: o estrobo do motor passava com o disjuntor a 0. A flag só marca a ORIGEM — o
     estrobo que o David dispara da consola continua a passar, como sempre. */
  const fireOne = () => MB.strobe({ level: lv(), fromMotor: true });
  for (let i = 0; i < k; i++) { if (i === 0) fireOne(); else setTimeout(fireOne, i * 360); }
  state.strobeCount = (state.strobeCount || 0) + 1;
}
function fireFlash(why, n) {
  const F = MUSIC.flash, MB = (typeof window !== 'undefined') && window.MIRRORBALL;
  if (!F || !F.on || !MB || typeof MB.flash !== 'function' || MB.config.spotsMotor === false) return;
  if (blackoutActive()) return;                                        // §BLACKOUT: escuro é escuro
  const now = MB_CLOCK.now();
  if (now - state.lastFlashT < F.minGapMs) return;
  const k = Math.max(1, n | 0);
  for (let i = 0; i < k; i++) { // rajada: o 1º agora, os outros escalonados ≥ minGapMs (nunca > 3 Hz)
    /* `fromMotor:true` — auditoria de sync (2026-09-01): sem a flag o `motorAllowed()` da bola
       devolvia sempre true e o disjuntor do painel não filtrava os flashes do motor. Aqui a guarda
       `spotsMotor === false` acima (:1615) já cortava, mas a redundância é intencional (brief F5:
       disjuntor dos DOIS lados) e é o que faz a flag valer nos outros caminhos. */
    const fire = () => MB.flash({ intensity: F.intensity[0] + RNG2() * (F.intensity[1] - F.intensity[0]),
                                   len: (F.lenMs[0] + RNG2() * (F.lenMs[1] - F.lenMs[0])) / 1000,
                                   fromMotor: true });
    if (i === 0) fire(); else setTimeout(fire, i * F.minGapMs * 1.05);
  }
  state.lastFlashT = now + (k - 1) * F.minGapMs * 1.05; state.flashCount++;
}
/* §CALMO — parte calma = GROOVE com pouca informação espectral. Um técnico deixa os focos quietos. */
function isCalm() { const F = MUSIC.flash; return state.fsm === 'GROOVE' && (state.act == null ? 1 : state.act) < (F && F.calmAct != null ? F.calmAct : 0.45); }
function onKickBeat() {
  const F = MUSIC.flash; if (!F || !F.on || isCalm()) return;
  const inDrop = state.fsm === 'DROP' && (state.bar - state.fsmBar) < F.dropBars;
  const p = inDrop ? F.kickChanceDrop : (state.fsm === 'GROOVE' || state.fsm === 'DROP') ? F.kickChance : 0;
  if (RNG2() < p) fireFlash('kick', 1);
  if (inDrop && MUSIC.strobe && RNG2() < MUSIC.strobe.kickChanceDrop * Math.max(1, strobeRate())) fireStrobe('kick', 1);
}

function ingestGrid(g) {
  if (!g || g.v !== 1) return;
  if (!g.local) GEN.markExternalGrid(MB_CLOCK.now());
  state.grid = g;
  state.gridLocalT0 = g.local ? g.t0 : MB_CLOCK.toLocal(g.t0);
}

/* ============================ Camada 2 — grelha local (§2.2) ============================ */
function updateGrid(nowL) {
  const g = state.grid;
  if (!g || nowL - state.gridLocalT0 > MUSIC.grid.staleMs) {
    state.beatPhase = state.barPhase = state.phrasePhase = 0;
    return false;
  }
  const beats = (nowL - state.gridLocalT0) / g.beatPeriodMs;
  const bpb = g.beatsPerBar, bpp = g.barsPerPhrase;
  const barsF = beats / bpb;
  const bar = g.barIndex + Math.floor(barsF);
  state.beatPhase = ((beats % 1) + 1) % 1;
  state.barPhase = ((barsF % 1) + 1) % 1;
  state.phrase = Math.floor(bar / bpp);
  state.phrasePhase = ((bar / bpp + state.barPhase / bpp) % 1 + 1) % 1;

  if (bar !== state.bar) advanceBar(bar);
  return true;
}
/* Fronteira de compasso: fecha a energia do compasso anterior e avisa a coreografia. Partilhado
 * pela grelha e pelo relógio degradado (§CLOCK), para `state.bar` nunca mais congelar sem grelha. */
function advanceBar(bar) {
  const prev = state.bar;
  state.bar = bar;
  if (state.barEnergyN > 0) {
    state.barEnergy.push(state.barEnergyAcc / state.barEnergyN);
    state.barHigh.push(state.barHighAcc / state.barEnergyN);
    if (state.barEnergy.length > 12) state.barEnergy.shift();
    if (state.barHigh.length > 12) state.barHigh.shift();
  }
  state.barEnergyAcc = 0; state.barHighAcc = 0; state.barEnergyN = 0;
  onBarBoundary(bar, prev);
}

/* ================================ §CLOCK — relógio único (S1) ================================
 * Uma só fonte de "quando" para a sala. Com grelha confiante, os ticks vêm da grelha (o tempo
 * absoluto floor(beats) muda → beatTick++). Sem grelha (arranque, conf baixa, grelha velha) o
 * relógio DEGRADA para o bombo: cada kick é um tempo, 4 tempos um compasso, `sync.phraseBars`
 * compassos uma frase — em vez de congelar. Os índices continuam de onde estavam na troca de
 * fonte, para os leitores não verem saltos. Nada aqui renomeia campos existentes. */
function updateClock(nowL, gridLive) {
  const Y = MUSIC.sync, g = state.grid;
  const bpb = (g && g.beatsPerBar) || MUSIC.bpm.beatsPerBar || 4;
  const ppb = Math.max(1, Y.phraseBars | 0);
  const gridOk = !!g && (nowL - state.gridLocalT0) <= MUSIC.grid.staleMs && state.gridConf >= Y.gridMinConf;

  const tickBeat = (n) => {
    for (let i = 0; i < n; i++) {
      state.beatTick++;
      state.beatIdx = (state.beatIdx + 1) % bpb;
      if (state.beatIdx === 0) {
        state.barTick++;
        state.barIdx = (state.barIdx + 1) % ppb;
        if (state.barIdx === 0) state.phraseTick++;
      }
    }
    state.clockLastBeatT = nowL;
  };

  if (gridOk) {
    // tempo absoluto na grelha; ancorar `beatIdx`/`barIdx` à grelha para o 1 do compasso ser o dela
    const beats = (nowL - state.gridLocalT0) / g.beatPeriodMs;
    const abs = g.barIndex * bpb + Math.floor(beats);
    if (state.clockBeatAbs < 0 || state.clockSrc !== 'grid') {
      // (re)sincronização: assume a posição da grelha sem disparar rajadas de ticks
      state.clockBeatAbs = abs;
      state.beatIdx = ((abs % bpb) + bpb) % bpb;
      const barAbs = Math.floor(abs / bpb);
      state.barIdx = ((barAbs % ppb) + ppb) % ppb;
      state.clockLastBeatT = nowL;
    } else if (abs !== state.clockBeatAbs) {
      const d = abs - state.clockBeatAbs;
      // salto normal = 1; a grelha reemitida pode encolher/esticar um tempo → nunca mais de 2
      // ticks por frame, e um salto negativo (t0 re-ancorado) não desfaz nada: monotónico.
      if (d > 0) tickBeat(Math.min(d, 2));
      state.clockBeatAbs = abs;
    }
    state.clockSrc = 'grid';
    state.clockConf = clamp(state.gridConf, 0, 1);
  } else {
    // degradação: cada bombo novo é um tempo (4/4 assumido)
    if (state.lastKickT > state.clockLastKickT && state.lastKickT > -Infinity) {
      tickBeat(1);
      // `state.bar` acompanha (deixa de congelar sem grelha): um compasso a cada 4 bombos.
      // Só quando a grelha está mesmo morta — viva mas pouco confiante, o `updateGrid` continua
      // a ser o único escritor de `state.bar` (um escritor por campo).
      if (!gridLive && state.beatIdx === 0) advanceBar(state.bar + 1);
    }
    state.clockSrc = state.lastKickT > -Infinity && state.kickPresence > 0.05 ? 'kick' : 'none';
    // confiança baixa por definição: presença do bombo é o único suporte (teto 0.5)
    state.clockConf = clamp(state.kickPresence, 0, 1) * 0.5;
  }
  state.clockLastKickT = state.lastKickT;
  state.clockAgeMs = clamp(nowL - state.clockLastBeatT, 0, 99999);
  // regra 7: nada disto pode ser NaN
  if (!Number.isFinite(state.clockConf)) state.clockConf = 0;
  if (!Number.isFinite(state.clockAgeMs)) state.clockAgeMs = 0;
}

function barsToPhraseEnd() {
  const g = state.grid; if (!g) return Infinity;
  const bpp = g.barsPerPhrase;
  const posInPhrase = ((state.bar % bpp) + bpp) % bpp + state.barPhase;
  return bpp - posInPhrase;
}

function onBarBoundary(bar) {
  // coreografia de spots amarrada à música (§3.6): a bola tem fades próprios com períodos
  // 11/17/13 s que NÃO são períodos musicais. Em music, spotFadeMix→0 e o foco dominante roda
  // na fronteira de 8 compassos.
  /* §SPOTMOV(1): a rotação do dominante deixa de ser métrica. Medido: com 8 compassos fixos os
   * spots faziam 5-7× o range em 60 s contra os 66× da opacidade — "ta sempre igual" é uma
   * leitura correta de uma coreografia perfeitamente periódica. O jitter é o §0.1 aplicado
   * ("variacoes que nao tao ligadas à musica"): o intervalo seguinte é sorteado a cada troca. */
  const M = MUSIC.map;
  const sw = M.spotSwapBars;
  if (sw > 0) {
    if (state.nextSwapBar < 0) state.nextSwapBar = bar + sw;   // 1.ª troca: sem jitter, ancorada
    if (bar >= state.nextSwapBar && bar !== state.lastSwapBar) {
      state.lastSwapBar = bar;
      const n = (window.MIRRORBALL && window.MIRRORBALL.config.spots.length) || 3;
      state.domSpot = (state.domSpot + 1) % n;
      const j = M.spotSwapJitter | 0;
      const next = j > 0 ? sw + Math.round(rng2Range([-j, j])) : sw;   // RNG2: não mexe na sequência de gestos
      state.nextSwapBar = bar + Math.max(2, next);   // nunca abaixo de 2 compassos: seria pisca
    }
  }
  // §SPOTMOV(2): acento em CADA compasso, e o maior na fronteira de frase. É o que um técnico
  // faz — marca o tempo forte. 0.53 Hz a 128 BPM, muito abaixo do teto de 3 Hz.
  state.spotAccent = Math.max(state.spotAccent, M.spotBarAccent);
  const g = state.grid;
  if (g && ((bar % g.barsPerPhrase) + g.barsPerPhrase) % g.barsPerPhrase === 0) {
    state.phraseAccent = 1;
    state.spotAccent = Math.max(state.spotAccent, M.spotPhraseAccent);
    if (MUSIC.flash && MUSIC.flash.on && MUSIC.flash.phraseBurst > 0 && !isCalm())
      fireFlash('phrase', state.fsm === 'GROOVE' ? 1 : MUSIC.flash.phraseBurst);   // rajada só na família do drop
    if (state.fsm === 'DROP' && MUSIC.strobe && RNG2() < MUSIC.strobe.phraseChance * Math.max(1, strobeRate())) fireStrobe('phrase', 1);
    // §ESPAÇOS: estrobo isolado em GROOVE, a espaços largos e só com energia — nunca dois seguidos
    // §CENAS: sorteio da cena de feixes (só em GROOVE; DROP/BUILD são sempre 'full')
    const SC = MUSIC.scene;
    if (SC && SC.on && state.fsm === 'GROOVE' && bar >= state.sceneNextBar) {
      const r = RNG2(), prev = state.scene;
      state.scene = r < SC.pFull ? 'full' : r < SC.pFull + SC.pFew ? 'few' : 'none';
      state.sceneNextBar = bar + Math.round(rng2Range(SC.everyBars));
      if (state.scene !== prev) logNote(`cena de feixes: ${state.scene}`);
    }
  }
  // §ESPAÇOS — verificado a CADA compasso (estava dentro da fronteira de frase: só corria a cada 16 bars e o slider não se sentia)
  const SB = MUSIC.strobe;
  if (state.fsm === 'GROOVE' && SB && SB.grooveEveryBars) {
    // intervalo AO VIVO: o slider `strobe: frequência ×` (painel d) divide o intervalo por rate² e baixa o limiar
    // de atividade — a 2× fica 4× mais frequente e já não exige a música "cheia"; a 3× é quase um estrobo por frase
    const rate = strobeRate();
    let mul = state.scene === 'none' ? (SB.noneBeamsMul == null ? 0.4 : SB.noneBeamsMul) : 1;   // sem feixes → mais estrobo
    if (rate > 1) mul /= rate * rate;
    if (state.strobeIntervalBars == null) state.strobeIntervalBars = Math.round(rng2Range(SB.grooveEveryBars));
    const due = bar - state.strobeLastBar >= Math.max(1, Math.round(state.strobeIntervalBars * mul));
    if (due) {
      state.strobeLastBar = bar; state.strobeIntervalBars = Math.round(rng2Range(SB.grooveEveryBars));
      const actMin = (SB.grooveAct == null ? 0.6 : SB.grooveAct) / Math.max(1, rate);
      if ((state.act == null ? 1 : state.act) >= actMin) fireStrobe('groove', 1);
    }
  }
  // gesto leve em GROOVE: a cada 16-32 compassos, 30% das vezes
  if (state.fsm === 'GROOVE' && bar >= state.gestNextGrooveBar) {
    state.gestNextGrooveBar = bar + Math.round(rngRange(MUSIC.gesture.grooveEveryBars));
    if (!state.gest && RNG() < MUSIC.gesture.grooveChance && MUSIC.profile === 'electronica') {
      startGesture(pickGesture(MUSIC.gesture.grooveLight), 'groove leve');
    }
  }
}

/* ==================== §GESTURES — o repertório teatral (§0.1) ====================
 * Um gesto NÃO é uma reação ao áudio: é uma decisão do técnico. Cada um devolve um patch por
 * variável, aplicado por cima da Camada 1 com um peso `w` que entra e sai por rampa:
 *   set:  valor absoluto        → out = lerp(camada1, valor, w)
 *   mul:  fator multiplicativo  → out = camada1 × lerp(1, fator, w)
 *   min/max: teto/piso          → interpolados do mesmo modo
 * A rampa é o que impede um corte; sem ela, "opacidade → 0.05 súbito" seria um pisca. */
const GESTURES = {
  // rpm→0, spots mantêm, feixes seguem `high`. O gesto do breakdown por excelência.
  // ⚠ Só tem efeito no rpm quando o bombo já parou: o piso `spinLock` (aplicado depois dos
  // gestos) manda enquanto houver bombo. Com bombo, o que se vê deste gesto são os feixes.
  'freeze': (ctx) => ({ rpm: { set: 0.0 }, beamInt: { set: lerp(0.03, 0.18, ctx.high) }, beams: { set: lerp(6, 30, ctx.high) } }),
  // opacity→0.05 súbito (tau 0.15) + spots→0; rpm mantém. A bola desaparece e continua a girar.
  'ghost': () => ({ opacity: { set: 0.05, tau: [0.15, 0.15] }, spot: { set: 0.0, tau: [0.15, 0.4] } }),
  // girar às escuras: rpm 2.5, sem spots, opacidade 0.2
  'blind-spin': () => ({ rpm: { set: 2.5 }, spot: { set: 0.0 }, opacity: { set: 0.20 }, beamInt: { set: 0.02 }, beams: { set: 4 } }),
  // um único foco, feixes ao máximo, fumo alto
  'single-beam': () => ({ spot: { set: 1.40 }, solo: true, beamInt: { set: 0.18 }, beams: { set: 52 }, haze: { set: 0.92 } }),
  'fog': () => ({ haze: { set: 1.0 }, spot: { set: 0.50 }, rpm: { set: 0.40 }, beams: { set: 8 } }),
  // spots alternam dominante a cada compasso — ≤ 1 Hz mesmo a 140 BPM (um compasso = 1.7 s)
  'strobe-slow': (ctx) => ({ swapEveryBar: true, spot: { mul: ctx.barParity ? 1.25 : 0.75 } }),
  // haze e opacidade em senos FORA DE FASE, 20-30 s — a sala a respirar
  'breath': (ctx) => ({
    haze: { mul: 1 + 0.35 * Math.sin(TAU * ctx.tSec / ctx.period) },
    opacity: { mul: 1 + 0.20 * Math.sin(TAU * ctx.tSec / ctx.period + Math.PI * 0.6) },
  }),
  // DROP: tudo ao máximo permitido
  'all-on': () => ({ rpm: { set: 3.0 }, opacity: { set: 1.0 }, spot: { set: 1.55 }, beamInt: { set: 0.18 }, beams: { set: 54 }, haze: { set: 0.70 } }),
  /* §OPACEXTREMOS: "transparencia maxima repentina e desligar focos" — §0.1, verbatim, e até
   * agora o único exemplo do David que não tinha gesto nenhum. O `ghost` é parecido mas leva a
   * opacidade a 0.05 COM os spots a zero e mantém o rpm; este leva-a ao extremo BAIXO mantendo
   * um resto de foco e o haze alto, que é a sala a abrir-se em vez de a bola a desaparecer.
   * Sobe o haze de propósito: sem opacidade, o que resta para ver é o fumo. */
  'flash-clear': () => ({
    opacity: { set: 0.02, tau: [0.12, 1.6] },   // ataque súbito, saída LENTA — é o contraste que se vê
    spot: { set: 0.25 }, haze: { set: 0.95 }, beamInt: { set: 0.14 }, beams: { set: 26 },
  }),
};
/* §BLACKOUT (S4, f16-sync §1 decisão 4): "tudo apaga menos o haze". Gesto NOVO, não é o `freeze`
 * com contexto — o freeze mexe no rpm e nos feixes; este apaga focos, feixes e a bola (opacidade
 * ao mínimo) e NÃO toca no rpm (regra 2: com bombo a bola gira sempre; o `spinLock` manda).
 * Súbito por definição: tau 40 ms nos dois sentidos e peso instantâneo (ver `startGesture` `instant`).
 * Haze: fica se `sync.blackoutKeepHaze` (default 1 — haze físico não dissipa em 300 ms). */
GESTURES['blackout'] = () => {
  const tau = [0.04, 0.04];   // [subida, descida] — a descida é o ataque do blackout: 40 ms
  const p = { spot: { set: 0.0, tau }, beamInt: { set: 0.0, tau }, beams: { set: 0, tau },
              opacity: { set: MUSIC.outMin.opacity, tau } };
  if (!(MUSIC.sync && MUSIC.sync.blackoutKeepHaze >= 0.5)) p.haze = { set: MUSIC.outMin.haze, tau };
  return p;
};
const GESTURE_NAMES = Object.keys(GESTURES);

function pickGesture(pool) {
  const list = pool.filter(n => n !== state.gestLast);
  return rngPick(list.length ? list : pool);
}
function startGesture(name, why, opts) {
  if (!GESTURES[name]) return;
  const o = opts || {};
  const nowL = MB_CLOCK.now();
  const haveGrid = !!state.grid && state.gridConf > 0.3;
  const bars = o.bars != null ? o.bars : Math.round(rngRange(MUSIC.gesture.barsRange));
  const secs = o.secs != null ? o.secs : rngRange(MUSIC.gesture.secRange);
  const barMs = state.bpmEst ? state.bpmEst * MUSIC.bpm.beatsPerBar : 1900;
  const durMs = o.ms != null ? o.ms : haveGrid ? bars * barMs : secs * 1000;   // `ms`: duração absoluta (§BLACKOUT)
  state.gest = { name, t0: nowL, until: nowL + durMs, period: rngRange([20, 30]), why, instant: !!o.instant };
  state.gestLast = name;
  state.gestCount++;
  state.gestSeen[name] = (state.gestSeen[name] || 0) + 1;
  logNote(`gesto ${name} · ${(durMs / 1000).toFixed(1)}s · ${why}`);
}
function queueGestures(pool, n, why) {
  state.gestQueue.length = 0;
  let last = state.gestLast;
  for (let i = 0; i < n; i++) {
    const list = pool.filter(x => x !== last);
    const g = rngPick(list.length ? list : pool);
    state.gestQueue.push(g); last = g;
  }
  const first = state.gestQueue.shift();
  startGesture(first, why);
}
function updateGestures(nowL, dt) {
  if (MUSIC.profile !== 'electronica') {
    state.gest = null; state.gestQueue.length = 0;
    state.gestWeight = ease(state.gestWeight, 0, [MUSIC.gesture.rampOutSec, MUSIC.gesture.rampOutSec], dt);
    return;
  }
  if (state.gest && nowL >= state.gest.until) {
    // encadeia: 2-3 gestos até ao drop dentro de BREAKDOWN/BUILD/PRE_DROP
    const chainable = state.fsm === 'BREAKDOWN' || state.fsm === 'BUILD' || state.fsm === 'PRE_DROP';
    if (chainable && state.gestQueue.length) startGesture(state.gestQueue.shift(), 'encadeado');
    else state.gest = null;
  }
  const want = state.gest ? 1 : 0;
  // `instant` (§BLACKOUT): sem rampa de entrada — um blackout de 300 ms com rampa de 0.8 s nunca
  // chegaria a ser escuro. A saída continua por rampa (`rampOutSec`), ou é atropelada pelo `all-on`.
  if (want && state.gest.instant) { state.gestWeight = 1; return; }
  const tau = want ? MUSIC.gesture.rampInSec : MUSIC.gesture.rampOutSec;
  state.gestWeight = ease(state.gestWeight, want, [tau, tau], dt);
}

/* ==================== §BLACKOUT — quando disparar (S4, f16-sync §1-2) ====================
 * Só em PRE_DROP (nunca GROOVE/BREAKDOWN), UM por drop (`blackoutAtDrop` guarda o `dropCount`
 * em que disparou: PRE_DROP → BUILD → PRE_DROP sem drop no meio não dispara segundo).
 *  · relógio com grelha e confiante: no ÚLTIMO tempo antes da fronteira de frase — o drop
 *    previsto pela FSM (`barsToPhraseEnd`), i.e. quando faltam ≤ 1 tempo. É o `beatTick`
 *    imediatamente antes do drop (§2: disparar o mais tarde possível gasta menos escuridão).
 *  · relógio degradado (`kick`/`none`, ou conf abaixo de `gridMinConf`): no primeiro `beatTick`
 *    depois de entrar em PRE_DROP.
 * Se o drop chega ANTES do último tempo (bombo volta cedo), não há blackout — zero é permitido,
 * dois não. Exceção: PRE_DROP falhado (timeout → BUILD) rearma uma frase depois — o blackout em
 * falso não pode roubar o do drop verdadeiro. Duração `sync.blackoutMs` (100-800, teto duro).
 * O `all-on` do DROP atropela-o. */
function blackoutActive() { return !!(state.gest && state.gest.name === 'blackout'); }
function updateBlackout(nowL) {
  if (state.fsm !== 'PRE_DROP' || MUSIC.profile !== 'electronica') return;
  const spent = state.blackoutAtDrop === state.dropCount;               // já houve um para este drop…
  const rearmed = state.blackoutRearmPhrase >= 0 && state.phraseTick >= state.blackoutRearmPhrase;
  if (spent && !rearmed) return;                                        // …e não foi em falso há ≥ 1 frase
  const Y = MUSIC.sync;
  const tickEdge = state.beatTick !== state.blackoutLastBeatTick;
  state.blackoutLastBeatTick = state.beatTick;
  const bpb = (state.grid && state.grid.beatsPerBar) || MUSIC.bpm.beatsPerBar;
  const confident = state.clockSrc === 'grid' && state.clockConf >= Y.gridMinConf;
  let fire;
  if (confident) {
    const beatsLeft = barsToPhraseEnd() * bpb;
    fire = Number.isFinite(beatsLeft) && beatsLeft <= 1.0;
  } else fire = tickEdge;
  if (!fire) return;
  const ms = clamp(Number.isFinite(Y.blackoutMs) ? Y.blackoutMs : 300, 100, 800);
  state.gestQueue.length = 0;                                           // o que vinha encadeado já não interessa: o drop é já
  startGesture('blackout', `pré-drop (${confident ? 'último tempo' : 'bombo'})`, { ms, instant: true });
  state.blackoutAtDrop = state.dropCount;
  state.blackoutRearmPhrase = -1;
  state.blackoutCount++;
  state.blackoutT0 = nowL;
}
function applyGesture(T) {
  const g = state.gest;
  const w = state.gestWeight;
  if (!g || w < 0.001) return null;
  const nowL = MB_CLOCK.now();
  const ctx = {
    tSec: (nowL - g.t0) / 1000, period: g.period,
    high: clamp(state.highAvg + (state.feat ? (+state.feat.onset || 0) * 0.4 : 0), 0, 1),
    barParity: (state.bar & 1) === 1,
  };
  const patch = GESTURES[g.name](ctx);
  const taus = {}, owns = {};
  for (const k in patch) {
    const p = patch[k];
    if (k === 'solo' || k === 'swapEveryBar') continue;
    if (T[k] == null) continue;
    if (p.set != null) { T[k] = lerp(T[k], p.set, w); owns[k] = true; }
    else if (p.mul != null) T[k] = T[k] * lerp(1, p.mul, w);
    else if (p.min != null) { T[k] = lerp(T[k], Math.min(T[k], p.min), w); owns[k] = true; }
    else if (p.max != null) { T[k] = lerp(T[k], Math.max(T[k], p.max), w); owns[k] = true; }
    if (p.tau) taus[k] = p.tau;
  }
  // `owns` = os knobs cujo VALOR o gesto impõe (set/min/max). Um `mul` modula o que a camada 1
  // decidiu e não conta como posse — daí `breath` não impedir a paragem da rotação.
  return { solo: !!patch.solo, swapEveryBar: !!patch.swapEveryBar, taus, owns, w };
}

/* ========================== Camada 3 — FSM com áudio real (§0.1 / 5) ==========================
 * Sem `hint`. O sinal principal é `kickPresence`; a energia por compasso e os hi-hats decidem
 * BUILD; o PRE_DROP continua ancorado à fronteira de frase × confiança. Debounce em `minStateMs`
 * para não oscilar quando um kick falha. */
function slopeOf(arr, n) {
  if (!arr || arr.length < 2) return 0;
  const k = Math.min(n, arr.length);
  const seg = arr.slice(-k);
  return (seg[seg.length - 1] - seg[0]) / Math.max(1, k - 1);
}
function energySlope() {
  // com grelha: por compasso. Sem grelha: por segundo (escala comparável a ~2 s/compasso).
  if (state.barEnergy.length >= 2) return slopeOf(state.barEnergy, MUSIC.fsm.buildBars);
  return slopeOf(state.secEnergy, MUSIC.fsm.buildBars * 2) * 2;
}

function updateFsm(nowL, dt) {
  const F = MUSIC.fsm;
  const conf = state.gridConf;
  const inState = nowL - state.fsmSince;
  const slope = energySlope();
  const highSlope = slopeOf(state.barHigh, F.buildBars);
  const barsLeft = barsToPhraseEnd();
  const kickGapSec = (nowL - state.lastKickT) / 1000;
  const musicPlaying = !state.silent && state.loudShort > 0.10;
  const canSwitch = inState > F.minStateMs;

  if (MUSIC.profile !== 'electronica') {
    // `acustico` e `voz` não têm máquina de estados nem gestos (§0.1 ponto 6)
    if (state.fsm !== 'GROOVE') setState('GROOVE', `perfil ${MUSIC.profile}`);
  } else if (state.silent) {
    if (canSwitch) setState('GROOVE', 'silêncio');
  } else if (state.fsm === 'DROP') {
    const done = state.grid
      ? (state.bar - state.fsmBar) >= state.dropHold
      : (nowL - state.fsmSince) >= state.dropHold * 1000;
    if (done) setState('GROOVE', 'fim da abertura');
  } else if (
    // ---- DROP: o bombo VOLTA com onset forte. É a transição mais importante do motor.
    canSwitch && musicPlaying &&
    (state.fsm === 'PRE_DROP' || state.fsm === 'BUILD' || state.fsm === 'BREAKDOWN') &&
    state.kickPresence > F.kickBackPresence &&
    state.kickFlash > 0.5 && state.feat && (+state.feat.onset || 0) >= F.dropOnset
  ) {
    state.dropCount++;
    // variação (§3.3): ~1 em 4 drops, contenção deliberada — previsível é o oposto de mágico
    state.restrainThis = (state.dropCount % 4) === 0;
    state.dropOpen = state.restrainThis ? 0.45 : clamp(0.75 + state.dropCount * 0.05, 0, 1);
    state.dropHold = state.grid
      ? Math.round(rngRange(F.dropHoldBars))
      : rngRange(F.dropHoldSecNoGrid);
    setState('DROP', `bombo de volta (pres ${state.kickPresence.toFixed(2)}, onset ${(+state.feat.onset).toFixed(2)})` +
      (state.restrainThis ? ' · contenção deliberada' : ` · #${state.dropCount}`));
    // §0.1: "qd ha o drop liga tudo"
    state.gestQueue.length = 0;
    startGesture('all-on', 'DROP', state.grid ? { bars: state.dropHold } : { secs: state.dropHold });
  } else if (state.fsm === 'PRE_DROP') {
    if (state.grid && state.bar - state.fsmBar > F.dropTimeoutBars) setState('BUILD', `timeout ${F.dropTimeoutBars} compassos sem drop`);
    else if (!state.grid && inState > 6000) setState('BUILD', 'timeout sem grelha');
  } else if (state.fsm === 'BUILD') {
    // ⚠ BUILD é, POR DEFINIÇÃO, "sem bombo e com energia a subir" — por isso a regra do
    // kickGap NÃO se aplica aqui. Aplicá-la fazia BUILD↔BREAKDOWN oscilar a cada ~0.7 s
    // (visto no primeiro run: 141 transições em 10 min), porque cada estado disparava a
    // condição de entrada do outro. BUILD só sai por PRE_DROP, por DROP, ou por a energia
    // DESISTIR (o build que não resolve) — e nesse caso vai para BREAKDOWN, não para GROOVE.
    if (state.grid && barsLeft <= F.preDropBars && conf > F.preDropMinConf) {
      setState('PRE_DROP', `PRE_DROP: ${barsLeft.toFixed(1)} bar até frase · conf ${conf.toFixed(2)}`);
    } else if (canSwitch && state.kickPresence > 0.55) {
      setState('GROOVE', 'bombo voltou sem drop — build desfez-se');
    } else if ((nowL - state.fsmSince) / 1000 > F.buildGiveUpSec && slope < 0) {
      setState('BREAKDOWN', `build desistiu (${slope.toFixed(3)}/bar)`);
    }
  } else if (state.fsm === 'BREAKDOWN') {
    const held = (nowL - state.fsmSince) / 1000 >= F.breakdownMinSec;
    if (held && (slope > F.riseSlope || highSlope > F.highRiseSlope)) {
      setState('BUILD', `energia/hi-hats a subir (${slope.toFixed(3)}/bar, hi ${highSlope.toFixed(3)})`);
    } else if (held && state.kickPresence > 0.5) {
      setState('GROOVE', 'bombo estabilizou sem drop');
    }
  } else { // GROOVE
    if (canSwitch && kickGapSec > F.kickDeadSec && musicPlaying) {
      setState('BREAKDOWN', `bombo parou há ${kickGapSec.toFixed(1)}s`);
      queueGestures(MUSIC.gesture.dark, Math.round(rngRange(MUSIC.gesture.chainRange)), 'breakdown');
    } else if (canSwitch && state.kickPresence < 0.6 &&
               (slope > F.riseSlope || highSlope > F.highRiseSlope) &&
               (state.barEnergy.length >= F.buildBars || state.secEnergy.length >= F.buildBars * 2)) {
      // o build tira o bombo; com o bombo cheio a subir energia é só um crescendo de groove
      setState('BUILD', `energia sobe (${slope.toFixed(3)}/bar, hi ${highSlope.toFixed(3)})`);
      queueGestures(MUSIC.gesture.dark, Math.round(rngRange(MUSIC.gesture.chainRange)), 'build');
    }
  }

  // ---- profundidade do pre-drop ∝ confiança (§3.3) ----
  let preT = 0;
  if (state.fsm === 'PRE_DROP') preT = F.preDropDepth * conf * smooth(clamp(1 - barsLeft / F.preDropBars, 0, 1));
  state.preDropAmount = ease(state.preDropAmount, preT, [0.25, 0.9], dt);
  void dt;
}

/* ============================== Camada 1 — mapeamento forte ==============================
 * Já não passa por (V,A) nem por âncoras genéricas. Cada knob tem a sua fonte e a sua
 * amplitude — e a amplitude é grande de propósito: o feedback do David foi "não se nota
 * variações de nada". */
function computeTargets() {
  const T = state.target, M = MUSIC.map;
  const ref = Math.max(MUSIC.norm.floor, lerp(1, state.loudAvg, MUSIC.norm.refMix));
  const loudN = clamp(state.loudShort / ref, 0, 1);
  const f = state.feat;
  const onset = f ? clamp(+f.onset || 0, 0, 1) : 0;

  if (MUSIC.profile === 'acustico') {
    // sem grelha, rpm ← loudness, sem gestos (§0.1 ponto 6)
    T.rpm = lerp(0.15, 1.60, loudN);
    T.spot = lerp(0.35, 1.20, loudN);
    T.beamInt = lerp(0.03, 0.12, loudN);
    T.beams = lerp(4, 28, loudN);
    T.haze = lerp(0.30, 0.70, 1 - state.bassShort);
    T.opacity = lerp(0.45, 1.00, loudN);
  } else if (MUSIC.profile === 'voz') {
    // rotação lenta constante, feixes ← high
    const hi = clamp(state.highAvg * 0.7 + onset * 0.3, 0, 1);
    T.rpm = 0.30;
    T.spot = lerp(0.40, 1.00, loudN);
    T.beamInt = lerp(0.03, 0.16, hi);
    T.beams = lerp(4, 34, hi);
    T.haze = lerp(0.35, 0.65, 1 - state.bassShort);
    T.opacity = lerp(0.55, 1.00, loudN);
  } else {
    /* ---------------- electronica: o mapeamento forte ---------------- */
    // rpm ← kickPresence × energia. O joelho evita o meio-termo morno: abaixo de `rpmKnee` a
    // bola está PARADA (é a leitura do David: "se para o bombo, pode parar a rotacao").
    const p = state.kickPresence;
    const idle = lerp(M.rpmIdle[0], M.rpmIdle[1], loudN);
    const drive = lerp(M.rpmDrive[0], M.rpmDrive[1], loudN);
    const pk = p <= M.rpmKnee ? 0 : (p - M.rpmKnee) / (1 - M.rpmKnee);
    T.rpm = lerp(idle, drive, smooth(pk));

    // spots ← loudness (base); o foco dominante e a troca de 8 compassos são aplicados na saída
    T.spot = lerp(M.spotBase[0], M.spotBase[1], loudN);

    // feixes ← high + onset: os hi-hats e a voz "seguem o tempo"
    // `hatLevel` = envelope do detetor de banda quando há `hatFluxRaw`; sem ele, é o `hatPulse`
    // antigo (fallback transparente). `high`+`onset` global continuam no mix como piso.
    const hi = clamp(Math.max(M.beamHighMix * state.highAvg + (1 - M.beamHighMix) * onset, 0.85 * loudN, 0.9 * state.kickPresence, MUSIC.hat.beamGain * (state.hatLevel || 0)), 0, 1);
    T.beamInt = lerp(M.beamIntFrom[0], M.beamIntFrom[1], hi);
    // ⚠ `state.act == null ? 1 : state.act` como na rampa de saída: um NaN aqui propaga-se pelo
    // `ease` e mata o desenho dos feixes na bola (nb = min(n, NaN) → o ciclo não corre).
    T.beams = lerp(M.beamsFrom[0], M.beamsFrom[1], hi) * lerp(MUSIC.activity.beamsMin, 1, state.act == null ? 1 : state.act);

    // haze ← INVERSO de bass: breakdown (graves fora) = fumo. Lento (tau 1.5/4).
    T.haze = lerp(M.hazeFrom[0], M.hazeFrom[1], clamp(1 - state.bassShort, 0, 1));

    // opacity ← loudness curto, com piso em GROOVE.
    T.opacity = lerp(M.opacityFrom[0], M.opacityFrom[1], clamp(loudN * 1.4 - 0.15, 0, 1));
    if (state.fsm === 'GROOVE') T.opacity = Math.max(T.opacity, M.opacityFloorGroove);
    /* §SNARE → feixes: fração do que falta até ao teto 0.18, que fica assim preservado por
     * construção. O acento na OPACIDADE não está aqui — está no `applyToBall`, ver §OPACSECO. */
    const sa = state.snareAccent || 0;
    if (sa > 0) T.beamInt += (MUSIC.outMax.beamInt - T.beamInt) * MUSIC.snare.beamKick * sa;

    // ---- comportamentos por estado (a camada 1 só prepara o terreno; os gestos fazem o resto)
    switch (state.fsm) {
      case 'BUILD':
        // contenção: os feixes REDUZEM, o haze sobe. É a contenção que dá valor ao que abre.
        T.beams *= 0.60; T.beamInt *= 0.75;
        T.haze = clamp(T.haze * 1.20, 0.05, 1);
        break;
      case 'PRE_DROP': {
        const pd = state.preDropAmount;   // ∝ confiança: falha graciosa por desenho
        T.spot = lerp(T.spot, 0.10, pd);
        T.beamInt = lerp(T.beamInt, 0.02, pd);
        T.beams = lerp(T.beams, 3, pd);
        T.opacity = lerp(T.opacity, 0.40, pd * 0.8);
        T.haze = clamp(lerp(T.haze, 0.92, pd * 0.6), 0.05, 1);
        break;
      }
      case 'DROP':
        // o gesto `all-on` faz o trabalho; aqui só garantimos que a camada 1 não puxa para baixo
        T.opacity = Math.max(T.opacity, 0.85);
        break;
      case 'BREAKDOWN':
        // o gesto escolhido manda; a camada 1 só tira o chão ao que sobra
        T.haze = clamp(Math.max(T.haze, 0.70), 0.05, 1);
        break;
      default: {
        // GROOVE — 80-90% do tempo (§3.6). Nada pisca: deriva lenta e acentos de frase.
        const t = MB_CLOCK.now() / 1000;
        T.haze = clamp(T.haze * (1 + 0.06 * Math.sin(TAU * t / 47)), 0.05, 1);
        T.spot = clamp(T.spot * (1 + 0.05 * Math.sin(TAU * t / 61 + 1.7)), 0, 1.6);
        break;
      }
    }
  }
  state.phraseAccent *= 0.985;
}

/* ================================ arbitragem + escrita ================================ */
function onOwnerChange(owner) {
  if (owner === 'music') {
    // ao ganhar a posse, parte-se dos valores ATUAIS do CONFIG e rampa-se (§2.4): nunca corte
    const MB = window.MIRRORBALL;
    if (MB) {
      const C = MB.config;
      state.out.rpm = C.rotationRpm; state.out.haze = C.haze;
      state.out.opacity = C.sphereOpacity; state.out.beamInt = C.beamIntensity;
      state.out.beams = (Number.isFinite(C.beamFraction) ? C.beamFraction : 1) * MUSIC.outMax.beams;
      const s0 = C.spots[0];
      state.out.spot = s0 && s0._base ? clamp(s0.intensity / s0._base, 0, 1.6) : state.out.spot;
      // §0.1 ponto 1: o motor NÃO atua sobre a cor. Mas 'auto' sem fonte de tom deixaria a
      // bola presa num alvo que ninguém escreve — por isso, UMA vez, ao entrar em música,
      // fixamos 'dark' (a sala de clube). A partir daí é o botão skin / tecla `w` que manda.
      if (!state.skinForced && C.skin === 'auto' && MB.setSkin) { MB.setSkin('dark'); state.skinForced = true; }
    }
    state.handoverT = MB_CLOCK.now();
  }
  state.owner = owner;
}
if (window.MB_SOURCE) { state.owner = window.MB_SOURCE.owner; window.MB_SOURCE.on(onOwnerChange); }
if (state.owner === 'music') onOwnerChange('music');

function applyToBall(o, gestInfo) {
  const MB = window.MIRRORBALL; if (!MB) return;
  const C = MB.config;
  C.rotationRpm = clamp(o.rpm, MUSIC.outMin.rpm, MUSIC.outMax.rpm);
  // os knobs `haze máx` e `feixes: fração máx` do painel d são TETOS do David: o motor modula por dentro deles
  const hazeMax = Number.isFinite(C.hazeMax) ? C.hazeMax : 1, fracMax = Number.isFinite(C.beamFractionMax) ? C.beamFractionMax : 1;
  if (C.beamsMotor !== false) {   // override do painel d ('feixes+haze: motor manda' = 0)
    C.haze = clamp(o.haze, MUSIC.outMin.haze, MUSIC.outMax.haze) * hazeMax;
    // §CENAS: 'few' = fração fixa (1-2 feixes contínuos, sem tique de agudos); 'none' = zero. Fora de GROOVE é sempre 'full'.
    const sc = state.fsm === 'GROOVE' && MUSIC.scene && MUSIC.scene.on ? state.scene : 'full';
    if (sc === 'few') { C.beamFraction = Math.min(fracMax, MUSIC.scene.fewFrac); C.beamIntensity = Math.min(MUSIC.outMax.beamInt, MUSIC.scene.fewInt); }
    else if (sc === 'none') { C.beamFraction = 0; C.beamIntensity = 0; }
    else { C.beamFraction = clamp(o.beams / MUSIC.outMax.beams, 0, 1) * fracMax; C.beamIntensity = clamp(o.beamInt, 0, MUSIC.outMax.beamInt); }   // teto inviolável 0.18
    C.beamMaxCount = MUSIC.outMax.beamCap;                              // teto absoluto = performance, não expressão
  }
  /* §OPACSECO — a opacidade escrita na bola, e o porquê desta ordem.
   * MEDIDO em `tools/feat`: o ALVO de opacidade já satura (p50 e p95 = 1.000) e 1732 dos 2667
   * frames estão exatamente no piso de GROOVE (0.20). Ou seja o alvo é quase uma onda quadrada
   * entre 0.20 e 1.00 — não falta amplitude NENHUMA ao alvo. O que o David vê a viver entre 0.38
   * e 0.86 é a SAÍDA, achatada por duas coisas em série: o `ease` (tau 0.40/2.00, que nunca
   * chega ao alvo antes de ele mudar) e o `hat.opacityDip`, que MORDE o que sobra — 56% dos
   * frames caíam no decil 0.7-0.8 e só 3% passavam de 0.9.
   * Daí o acento da tarola entrar AQUI e não no alvo: depois do `ease` e DEPOIS da mordidela dos
   * agudos. É o mesmo argumento do acento dos spots — um acento tem de chegar seco, e passá-lo
   * por um release de 2 s é a definição de o tornar inaudível. Fração do que FALTA até 1, por
   * isso o teto nunca é excedido e o acento é maior justamente quando há espaço para ele. */
  const opDip = o.opacity * (1 - MUSIC.hat.opacityDip * (state.hatLevel || 0));
  const opAcc = blackoutActive() ? opDip                                   // §BLACKOUT: a tarola não acende a bola
                                 : opDip + (1 - opDip) * MUSIC.snare.opacityKick * (state.snareAccent || 0);
  if (C.opacityMotor !== false) C.sphereOpacity = clamp(opAcc, MUSIC.outMin.opacity, 1);   // override do painel d ('opacidade: motor manda' = 0)
  /* §3.6: com o motor a mandar nos focos, os relógios INTERNOS da bola calam-se — os fades
   * (11/17/13 s) não são períodos musicais e os flashes Poisson (0.6/s) não são música; em `music`
   * quem dispara é o motor.
   * ⚠ Auditoria de sync (2026-09-01): estes dois writes eram INCONDICIONAIS e corriam a 60 Hz, por
   * isso apagavam o que o David pusesse nos knobs 'focos: fade mix' / 'flash: por s' 60 vezes por
   * segundo — o slider mexia e o valor evaporava-se. Passam para trás do MESMO disjuntor dos
   * vizinhos (`spotsMotor`, o de :2147 e o de `fireFlash`): com 'focos+flashes: motor manda' a 0
   * quem manda é o painel, incluindo nestes dois. Com o disjuntor ON (default) nada muda. */
  if (C.spotsMotor !== false) {
    C.spotFadeMix = 0;
    if (C.choreo) C.choreo.flashRate = 0;
  }
  // ⚠ NADA de setSkinAuto aqui (§0.1 ponto 1): a skin é do utilizador, ponto final.
  if (MB.setHealth && MB.getHealth() !== state.health) MB.setHealth(state.health);

  // coreografia dos 3 focos, individualmente
  const M = MUSIC.map;
  const solo = gestInfo && gestInfo.solo, w = gestInfo ? gestInfo.w : 0;
  const swapBar = gestInfo && gestInfo.swapEveryBar;
  const nMounted = Math.max(0, Math.min(C.spots.length, C.spotCount == null ? C.spots.length : C.spotCount)); // 0 = sem focos permanentes
  const dom = nMounted === 0 ? -1 : swapBar ? (state.bar % nMounted) : (state.domSpot % nMounted);
  // §FLASHDIM — dimmer por fase (rampa de `dimmer.ease` s); em BUILD o 2º foco sobe com os compassos
  const DM = MUSIC.dimmer, target = (DM && DM[state.fsm]) || [1, 1, 1];
  const buildU = state.fsm === 'BUILD' ? clamp((state.bar - state.fsmBar) / 8, 0, 1) : 0;
  const nowDim = MB_CLOCK.now(), dtDim = clamp((nowDim - (state._dimT || nowDim)) / 1000, 0, 0.1); state._dimT = nowDim;
  const kDim = 1 - Math.exp(-dtDim / Math.max(0.05, (DM && DM.ease) || 0.35));
  for (let i = 0; i < 3; i++) {
    let tg = target[i]; if (state.fsm === 'BUILD' && i >= 1) tg = lerp(tg, 1.0, buildU);
    state.dimGain[i] += (tg - state.dimGain[i]) * kDim;
  }
  /* §SPOTMOV(3): o ACENTO no dominante. Aplicado aqui, e não no `computeTargets`, por duas razões:
   *  · é aqui que se sabe qual é o dominante — o acento é dele, não dos três (marcar os três ao
   *    mesmo tempo lê-se como um flash de brilho geral, não como um técnico a marcar o tempo);
   *  · é DEPOIS do `ease` da rampa de saída, de propósito. O acento tem de chegar SECO. Passá-lo
   *    pelo `ease` do `spot` (tau 0.12/0.60) achatava-o justamente até ao "delta/frame ~0.0000"
   *    que o David sentiu como imobilidade — foi o que a medição mostrou.
   * O decaimento é feito aqui pela mesma razão: este é o único ponto que corre a cada frame com
   * `dt` conhecido e com o acento já consumido. */
  const acc = clamp((state.spotAccent || 0) + MUSIC.map.spotSnareGain * (state.snareAccent || 0), 0, 1.5);
  C.spots.forEach((s, i) => {
    if (s._base == null) s._base = s.intensity;
    let g = i === dom ? M.spotDomGain : M.spotSubGain;
    // `single-beam`: um foco a 1.4 e os outros a 0 — mas por rampa, como tudo o resto
    if (solo) g = lerp(g, i === dom ? 1.0 : 0.0, w);
    // só o dominante leva o acento inteiro; os outros dois levam um terço, para a sala respirar
    // junta sem se perder quem está a marcar.
    const a = 1 + acc * (i === dom ? 1 : 0.33);
    const dim = state.dimGain[Math.min(i, 2)];
    if (C.spotsMotor !== false) MB.setSpot(i, { intensity: clamp(s._base * o.spot * g * a * dim, 0, 1.6) });   // override do painel d
  });
}

/* ==================================== loop principal ==================================== */
function update(nowL) {
  const dt = clamp((nowL - state.lastT) / 1000, 0, 0.1);

  // silêncio (§3.5): sem isto a bola congela no último frame e parece bug
  const stale = nowL - state.lastFeatLocal > MUSIC.silence.noFeaturesMs;
  const dead = stale || state.silent;
  const rate = dt / MUSIC.silence.decaySec;
  state.health = dead ? Math.max(0, state.health - rate) : Math.min(1, state.health + rate * 2);
  // sem features, o bombo também morre — senão a rotação ficava presa no último valor
  if (dead) state.kickPresence = ease(state.kickPresence, 0, MUSIC.kick.presenceTau, dt);

  emitLocalGrid(nowL);
  const gridLive = updateGrid(nowL);
  updateClock(nowL, gridLive);
  updateFsm(nowL, dt);
  updateBlackout(nowL);        // §BLACKOUT (S4): depois da FSM (estado atual), antes do peso do gesto
  updateGestures(nowL, dt);
  computeTargets();
  const gestInfo = applyGesture(state.target);

  // ---- INVARIANTE DO BOMBO (ver MUSIC.map.spinLock*) ----
  // Aplicado DEPOIS dos gestos, de propósito: é o único ponto onde um gesto não tem a última
  // palavra. Enquanto o bombo bate, a bola gira — o resto do gesto passa na mesma.
  const spinLocked = MUSIC.profile === 'electronica' &&
                     state.kickPresence > MUSIC.map.spinLockPresence && !state.silent;
  if (spinLocked) state.target.rpm = Math.max(state.target.rpm, MUSIC.map.spinLockRpm);

  /* ---- §SPINCEIL — o TETO sem bombo, o simétrico exato do piso acima ----
   * Aplicado no MESMO ponto (depois dos gestos) e pela mesma razão: é o único sítio onde um
   * gesto não tem a última palavra. Sem isto, `blind-spin` (`rpm:{set:2.5}`) e `all-on` (3.0)
   * sobrepunham-se ao alvo de repouso e a bola girava a 2.5 rpm com o bombo a ZERO — medido no
   * vazio de `tools/feat` (t=25.1→33.9 s). O rpm mínimo em toda a gravação era 0.42.
   *
   * `!spinLocked` no teste é redundante (as duas presenças não se sobrepõem) mas fica explícito:
   * a invariante do David — "enquanto houver bombo a bola gira" — nunca pode depender de eu ter
   * escolhido bem dois números. */
  const M = MUSIC.map;
  const gapSec = (nowL - state.lastKickT) / 1000;
  const noKick = MUSIC.profile === 'electronica' && !spinLocked &&
                 state.kickPresence < M.spinCeilPresence && gapSec > M.spinCeilGapSec;
  if (noKick) {
    // Decide UMA vez por vazio, e regista. O David: "tem de ser decisao, nao casualidade" — o
    // default `spinCeilChance: 1` pára sempre; com < 1 o sorteio fica no log e no HUD, para se
    // poder ver POR QUE É QUE daquela vez não parou.
    if (!state.spinCeilArmed) {
      state.spinCeilArmed = true;
      state.spinCeilCount++;
      state.spinCeilStop = M.spinCeilChance >= 1 ? true : RNG2() < M.spinCeilChance;
      logNote(state.spinCeilStop ? 'bola PÁRA (sem bombo)' : 'bola NÃO pára · sorteio');
    }
    if (state.spinCeilStop) state.target.rpm = Math.min(state.target.rpm, M.spinCeilRpm);
  } else if (state.spinCeilArmed && state.kickPresence > M.spinLockPresence) {
    // rearma só quando o bombo VOLTA a sério (histerese: não re-sortear a meio do mesmo vazio)
    state.spinCeilArmed = false;
  }

  // rampa de posse: logo após ganhar o CONFIG, suaviza mais ainda (nunca corte)
  const hand = clamp((nowL - state.handoverT) / (MUSIC.handover.rampSec * 1000), 0, 1);
  const slow = lerp(2.5, 1, hand);
  const o = state.out;
  // O bombo parou e a camada 1 já quer a bola parada → release curto do rpm (`rpmStopTau`).
  // ⚠ Só se o gesto ativo NÃO comandar o rpm: `blind-spin`/`freeze`/`fog` mandam no rpm de
  // propósito e não podem ser atropelados; `strobe-slow`/`breath`/`ghost` nem lhe tocam, e
  // bloquear por "há um gesto" fazia a bola levar 5 s a parar durante um gesto que nem era
  // do rpm (medido: alvo em 0.12 ao fim de 1.2 s, saída ainda em 0.30 aos 4.9 s).
  const gestOwnsRpm = !!(gestInfo && gestInfo.owns && gestInfo.owns.rpm);
  const stopping = MUSIC.profile === 'electronica' && state.kickPresence < MUSIC.map.rpmKnee &&
                   state.target.rpm < o.rpm && !gestOwnsRpm;
  for (const k in o) {
    const gt = gestInfo && gestInfo.taus[k];
    let tau = gt || MUSIC.tau[k];
    if (k === 'rpm' && stopping && !gt) tau = [tau[0], MUSIC.rpmStopTau];
    // §OPACEXTREMOS: release da opacidade encurtado. Os 2.00 s de `tau.opacity` eram o que
    // impedia a saída de chegar ao fundo do alvo (medido: alvo no piso 0.20 em 1732 de 2667
    // frames, saída a viver em 0.38-0.86). Um gesto com tau próprio (`ghost`, `flash-clear`)
    // continua a mandar — por isso o `!gt`.
    if (k === 'opacity' && !gt) tau = [tau[0], MUSIC.map.opacityReleaseSec];
    // com o bombo a bater, um gesto com tau curto no rpm (nenhum tem hoje, mas é barato
    // garantir) não pode ser usado para o travar — o piso já está no alvo, aqui é o easing
    if (k === 'rpm' && spinLocked && gt) tau = MUSIC.tau.rpm;
    const slowAct = k === 'rpm' ? 1 : lerp(MUSIC.activity.slowMax, 1, state.act == null ? 1 : state.act);
    // §BLACKOUT: os taus de um gesto `instant` são ABSOLUTOS — nem a rampa de posse (`slow`) nem a
    // atividade (`slowAct`) os esticam; um blackout de 300 ms com tau efetivo de 100 ms não chegava
    // ao escuro (medido no harness: opacidade 0.08 ao fim de 288 ms).
    const absTau = !!(gt && state.gest && state.gest.instant);
    o[k] = ease(o[k], state.target[k], absTau ? [tau[0], tau[1]] : [tau[0] * slow * slowAct, tau[1] * slow * slowAct], dt);
    o[k] = clamp(o[k], MUSIC.outMin[k] != null ? MUSIC.outMin[k] : -Infinity,
                       MUSIC.outMax[k] != null ? MUSIC.outMax[k] : Infinity);
  }
  // garantia dura na SAÍDA: se o bombo já bate mas a bola vinha de parada, ela sobe por rampa
  // (o alvo manda) — mas nunca fica ABAIXO do piso por causa de um gesto que a puxe para baixo.
  if (spinLocked && o.rpm < MUSIC.map.spinLockRpm) {
    o.rpm = Math.min(MUSIC.map.spinLockRpm, o.rpm + (MUSIC.map.spinLockRpm / 0.8) * dt);
  }
  // …e a garantia SIMÉTRICA na saída: no vazio decidido, a bola desce ao repouso e PARA. Sem
  // isto, um gesto com tau próprio no rpm ainda podia segurar a saída acima do teto durante
  // segundos, mesmo com o alvo já em `spinCeilRpm`. Desce em ~0.8 s, como o piso sobe.
  if (noKick && state.spinCeilStop && o.rpm > M.spinCeilRpm) {
    o.rpm = Math.max(M.spinCeilRpm, o.rpm - (MUSIC.map.spinLockRpm / 0.8) * dt);
  }
  // §SPOTMOV: queda do acento de fronteira (o de tarola decai no seu próprio detetor).
  state.spotAccent *= Math.exp(-dt / MUSIC.map.spotAccentDecay);

  const owner = window.MB_SOURCE ? window.MB_SOURCE.owner : 'manual';
  if (owner === 'music') {
    applyToBall(o, gestInfo);
    if (window.BRIDGE) window.BRIDGE.send({ rpm: o.rpm, spotGain: o.spot, haze: o.haze, valence: 0, arousal: state.kickPresence, health: state.health });
  }

  emitState(nowL, o);
  updateHud(o);
  state.lastT = nowL;
}

function emitState(nowL, o) {
  if (nowL - state.lastEmit < 1000 / MUSIC.emit.stateHz) return;
  state.lastEmit = nowL;
  const msg = {
    type: 'mb-state', state: state.fsm, sinceMs: Math.round(nowL - state.fsmSince),
    bar: state.bar, phrase: state.phrase,
    bpm: state.bpmEst ? 60000 / state.bpmEst : 0,
    confidence: state.gridConf, beatPhase: state.beatPhase,
    kickPresence: state.kickPresence, kickRate: state.kickRate, loudness: state.loudAvg,
    profile: MUSIC.profile, gesture: state.gest ? state.gest.name : null, gestureWeight: state.gestWeight,
    // §PROFAUTO: a tab do OS mostra o seletor de perfil — precisa de saber se o valor que
    // apresenta foi escolhido pelo utilizador ou pelo motor, para não parecer que "mudou sozinho".
    profileAuto: !!(MUSIC.profileAuto.auto && !state.profManual),
    profileDecided: state.profDecided, profileConfidence: profConfidence(),
    gen: GEN.on, out: Object.assign({}, o),
  };
  try { if (typeof parent !== 'undefined' && parent !== window) parent.postMessage(msg, '*'); } catch (e) { /* cross-origin */ }
}

/* ========================= GERADOR SINTÉTICO (testes / demo sem sidecar) =========================
 * 126 BPM, 4/4, frases de 16 compassos, com KICKS reais (onset + bass altos) em GROOVE/DROP e
 * SEM kicks em BREAKDOWN/BUILD — para o detetor de bombo ter algo para detetar. NÃO emite grelha:
 * a grelha nasce do detetor, como com o sidecar. Etiqueta `hint` só para se identificar como
 * sintético (o motor já não o lê para decidir nada). `g` liga/desliga · `n` próxima fase.
 */
const GEN = (() => {
  const on = { v: MUSIC.gen.enabled };
  let t0 = MB_CLOCK.now();
  let lastFeat = 0, lastExternal = -Infinity, lastExternalGrid = -Infinity;
  let cycle = 0, phase = 'GROOVE', forced = false, forcedShift = 0;

  function bpmToPeriod() { return 60000 / MUSIC.gen.bpm; }

  function phaseAt(bar) {
    const G = MUSIC.gen;
    const cyc = G.grooveBars + G.buildBars;
    const withBreak = cyc + G.breakdownBars;
    let b = bar, c = 0;
    for (;;) {
      const isBreakCycle = ((c + 1) % G.breakdownEveryCycles) === 0;
      const len = isBreakCycle ? withBreak : cyc;
      if (b < len) {
        if (b < G.grooveBars) return { p: 'GROOVE', c, inBar: b };
        if (b < cyc) return { p: 'BUILD', c, inBar: b - G.grooveBars };
        return { p: 'BREAKDOWN', c, inBar: b - cyc };
      }
      b -= len; c++;
    }
  }

  function tick(nowL) {
    if (!on.v) return;
    if (nowL - lastExternal < MUSIC.gen.externalGraceMs) return;   // emissor externo manda
    const G = MUSIC.gen, period = bpmToPeriod();
    const beats = (nowL - t0) / period;
    const bar = Math.floor(beats / G.beatsPerBar);
    const barPhase = (beats / G.beatsPerBar) % 1;
    const info = phaseAt(bar + (forced ? forcedShift : 0));
    phase = info.p; cycle = info.c;
    const inBar = info.inBar;

    if (nowL - lastFeat < 1000 / G.featureHz) return;
    lastFeat = nowL;

    const beatPhase = beats % 1;
    // 4-on-the-floor: um kick por tempo, envelope curto. Só em GROOVE e no DROP.
    const kickEnv = Math.exp(-beatPhase * 14);
    const hat = ((beats * 2) % 1) < 0.08 ? 0.30 : 0;

    let loud = 0.42, bassBase = 0.55, mid = 0.40, high = 0.28, centroid = 0.38;
    let hasKick = true;
    if (phase === 'BUILD') {
      const p = clamp(inBar / G.buildBars, 0, 1);
      loud = lerp(0.44, 0.74, p);
      bassBase = lerp(0.30, 0.10, p);       // graves saem (high-pass do build)
      mid = lerp(0.40, 0.62, p); high = lerp(0.32, 0.82, p); centroid = lerp(0.38, 0.80, p);
      hasKick = false;                       // §0.1: o build tira o bombo
    } else if (phase === 'BREAKDOWN') {
      const p = clamp(inBar / G.breakdownBars, 0, 1);
      loud = lerp(0.32, 0.26, p); bassBase = 0.16; mid = 0.30; high = 0.22; centroid = 0.30;
      hasKick = false;
    }

    // DROP: o compasso a seguir ao build, no tempo 1 da frase — bombo VOLTA com força
    const isDropBar = phase === 'GROOVE' && inBar === 0 && bar > 0 && barPhase < 0.25;
    if (isDropBar) { loud = 0.95; bassBase = 0.60; mid = 0.70; high = 0.62; centroid = 0.45; hasKick = true; }

    // `bass` no sidecar é 0..1 sobre a escala de dB da PRÓPRIA banda: o kick levanta os graves
    // acima da linha de base da faixa. Reproduzimos isso — base baixa + pico no kick — para o
    // detetor ver o que verá. O gerador NÃO emite `subFluxRaw`/`hatFluxRaw` de propósito: é
    // assim que se exercita o caminho de fallback do §KICK sem ter o sidecar a correr.
    const kickAmt = hasKick ? kickEnv : 0;
    const bass = clamp(bassBase + 0.42 * kickAmt, 0, 1);
    const onset = clamp((hasKick ? 0.85 * kickEnv : 0) + hat + (isDropBar ? 0.3 : 0), 0, 1);
    const rms = clamp(loud * (0.65 + 0.35 * kickAmt), 0, 1);

    post({
      type: 'features', t: nowL, rms, bass, mid, high, centroid,
      onset, loudness: loud, silence: false, hint: phase,
    });
  }

  function nextPhase() {
    const G = MUSIC.gen, period = bpmToPeriod();
    const bar = Math.floor((MB_CLOCK.now() - t0) / (period * G.beatsPerBar));
    const cur = phaseAt(bar + forcedShift).p;
    for (let i = 1; i < 512; i++) if (phaseAt(bar + forcedShift + i).p !== cur) { forcedShift += i; forced = true; return; }
  }

  function post(msg) {
    if (typeof postMessage === 'function') postMessage(msg, '*');
    else onMessage(msg);
  }

  return {
    tick, nextPhase,
    get on() { return on.v; },
    toggle() { on.v = !on.v; if (on.v) { t0 = MB_CLOCK.now(); } },
    markExternal(t) { lastExternal = t; },
    markExternalGrid(t) { lastExternalGrid = t; },
    isExternal() { return MB_CLOCK.now() - lastExternal < MUSIC.gen.externalGraceMs; },
    isExternalGrid() { return MB_CLOCK.now() - lastExternalGrid < MUSIC.gen.externalGraceMs; },
    answerClock(req) { post({ type: 'clock', id: req.id, tClient: req.tClient, tEmit: MB_CLOCK.now() }); },
    get phase() { return phase; }, get cycle() { return cycle; },
  };
})();

/* ==================================== HUD (tecla m) ==================================== */
const hud = (typeof document !== 'undefined' && document.getElementById) ? document.getElementById('mus') : null;
function bar12(v, n = 12) { return '█'.repeat(Math.round(clamp(v, 0, 1) * n)).padEnd(n, '·'); }

/* --- §PROFAUTO no HUD: o modo, a confiança e o tempo de bloqueio --- */
function profMode() {
  if (state.profManual) return '(manual — auto desligado por escolha do utilizador)';
  if (!MUSIC.profileAuto.auto) return '(manual — auto OFF no painel)';
  if (!state.profDecided) return '(auto: a reunir evidência…)';
  return '(auto)';
}
/* Confiança = quão longe o score está do limiar que o faria mudar de ideias, normalizado pela
 * banda morta. 0 = em cima do limiar (a decisão podia virar); 1 = do outro lado da banda, com
 * folga. Não é uma probabilidade — é a margem, que é o que interessa para julgar histerese. */
function profConfidence() {
  const P = MUSIC.profileAuto, s = state.profScore;
  if (s == null) return 0;
  const band = Math.max(1e-6, P.enterElectronica - P.enterAcustico);
  const dist = MUSIC.profile === 'electronica' ? s - P.enterAcustico : P.enterElectronica - s;
  return clamp(dist / band, 0, 1);
}
function profHoldLeft(nowL) {
  const P = MUSIC.profileAuto;
  if (state.profManual || !P.auto || !state.profDecided) return '';
  const left = P.minHoldSec * 1000 - (nowL - state.profSince);
  return left > 0 ? `  espera ${(left / 1000).toFixed(0)}s` : '';
}
function updateHud(o) {
  if (!hud || !hud.classList.contains('on')) return;
  const g = state.grid, nowL = MB_CLOCK.now();
  const bpm = state.bpmEst ? 60000 / state.bpmEst : 0;
  const posBar = g ? ((state.bar % g.barsPerPhrase) + g.barsPerPhrase) % g.barsPerPhrase : 0;
  const MB = window.MIRRORBALL;
  // Só se mostram os números do detetor novo quando ele está mesmo a ser usado (a última feature
  // trouxe `*Raw`). Com o gerador `g` ou um replay antigo isto lê "fallback", que é a informação
  // relevante: os knobs de `bandOnset` não estão a fazer nada.
  const fRaw = state.feat;
  const det = (fRaw && fRaw.subFluxRaw != null && state.kickDet) ? state.kickDet : null;
  const hatDet = (fRaw && fRaw.hatFluxRaw != null && state.hatDet) ? state.hatDet : null;
  const lines = [
    `estado  ${state.fsm.padEnd(10)} ${((nowL - state.fsmSince) / 1000).toFixed(1)}s` +
      (state.fsm === 'PRE_DROP' ? `  ↓${state.preDropAmount.toFixed(2)}` : '') +
      (state.fsm === 'DROP' ? `  ↑${state.dropOpen.toFixed(2)}${state.restrainThis ? ' (contido)' : ''}` : ''),
    `BOMBO   ${bar12(state.kickPresence, 16)} ${state.kickPresence.toFixed(2)}   ${state.kickRate.toFixed(1)} kicks/s   gap ${((nowL - state.lastKickT) / 1000).toFixed(1)}s   esp ${state.kickExpected.toFixed(2)}`,
    // Linha de CALIBRAÇÃO do detetor (pesquisa §9): a escala do flux depende do Hann, da janela
    // e do ganho do loopback, por isso o `C0` só se afina com música real a tocar. Ler assim:
    //  · flux vs med — o flux tem de saltar CLARAMENTE acima da mediana a cada bombo;
    //  · std/med  — se ficar abaixo de 0.15, o teste de variância bloqueia tudo (nada dispara);
    //  · C  — o limiar efetivo depois do ajuste adaptativo (desce quando a variância sobe);
    //  · fonte — `raw` = detetor novo por banda; `fallback` = caminho antigo (subOnset/bass).
    `detetor ${det ? 'raw' : 'fallback'}  flux ${det ? det.last.toFixed(1) : '—'}  med ${det ? det.med.toFixed(1) : '—'}  ` +
      `std/med ${det ? det.vRel.toFixed(2) : '—'}  C ${det ? det.C.toFixed(2) : '—'}  ` +
      `lim ${det ? state.det.kickThr.toFixed(1) : '—'}  ` +
      `bpm ${bpm ? bpm.toFixed(1) : '—'} (${state.bpmSource}${state.bpmAuto ? ', auto ' + state.bpmAuto.toFixed(1) : ''})`,
    `agudos  ${bar12(state.hatLevel, 16)} ${state.hatLevel.toFixed(2)}  ${hatDet ? 'raw' : 'fallback'}` +
      (hatDet ? `  med ${hatDet.med.toFixed(1)}  std/med ${hatDet.vRel.toFixed(2)}  C ${hatDet.C.toFixed(2)}` : ''),
    // §SNARE: o acento de tarola. `n` é o total da sessão — se ficar a zero com bateria a tocar,
    // o piso (`snare.fbFloor` no fallback, `snare.C0` com `midFluxRaw`) está alto demais.
    `tarola  ${bar12(state.snareAccent, 16)} ${state.snareAccent.toFixed(2)}  ${state.snarePath}  ` +
      `flux ${state.snareFlux.toFixed(2)}  lim ${state.snareThr.toFixed(2)}  n ${state.snareCount}` +
      (MUSIC.snare.on ? '' : '  (OFF)'),
    // §SPINCEIL: a decisão de parar. `armado` = estamos num vazio já decidido; a decisão em si
    // fica no log de eventos (linha de baixo) — é isto que torna a paragem legível como DECISÃO.
    `paragem ${state.spinCeilArmed ? (state.spinCeilStop ? 'PÁRA' : 'não pára (sorteio)') : '—'}` +
      `  vazios ${state.spinCeilCount}  prob ${MUSIC.map.spinCeilChance.toFixed(2)}  teto ${MUSIC.map.spinCeilRpm.toFixed(2)} rpm`,
    `grelha  bar ${state.bar} (${posBar + 1}/${g ? g.barsPerPhrase : '—'})  frase ${state.phrase}  ${bpm ? bpm.toFixed(1) : '—'} bpm  conf ${state.gridConf.toFixed(2)}`,
    `batida  ${bar12(state.beatPhase, 16)}  bar ${bar12(state.barPhase, 16)}`,
    // §CLOCK (S1): o relógio único que a sala lê. `src grid` = ticks da grelha; `src kick` =
    // degradado (cada bombo é um tempo, 4/4 assumido). `idade` = ms desde o último beatTick.
    `relógio tempo ${state.beatIdx + 1}/${(g && g.beatsPerBar) || MUSIC.bpm.beatsPerBar}  compasso ${state.barIdx + 1}/${MUSIC.sync.phraseBars}` +
      `  ticks b${state.beatTick} c${state.barTick} f${state.phraseTick}  conf ${state.clockConf.toFixed(2)}  idade ${Math.round(state.clockAgeMs)}ms  src ${state.clockSrc}`,
    `gesto   ${(state.gest ? state.gest.name : '—').padEnd(12)} peso ${state.gestWeight.toFixed(2)}  fila [${state.gestQueue.join(' ')}]  total ${state.gestCount}  blackouts ${state.blackoutCount}`,
    `perfil  ${MUSIC.profile}  ${profMode()}  (tecla p)   skin ${MB && MB.getSkin ? MB.getSkin().mode : '—'} (tecla w — do utilizador, o motor não lhe toca)`,
    // §PROFAUTO: é esta linha que explica a decisão. `cv` é o sinal primário (regularidade dos
    // intervalos de bombo; baixo = regular = clube); `cob` é a cobertura da janela — com `cv —`
    // o classificador está a RECUSAR ler (breakdown/dropout) e o score congela de propósito;
    // `hat` é o veto secundário; `conf` é a distância ao limiar mais próximo, 1.00 = decidido
    // com folga. `espera Ns` = falta cumprir o tempo mínimo no perfil antes de poder trocar.
    `  auto  cv ${state.profCv == null ? ' —  ' : state.profCv.toFixed(2)}  cob ${state.profCov.toFixed(2)}  ` +
      `score ${state.profScore == null ? ' — ' : state.profScore.toFixed(2)}  hat ${state.profHat == null ? ' — ' : state.profHat.toFixed(2)}  ` +
      `conf ${profConfidence().toFixed(2)}  evid ${state.profEvidenceSec.toFixed(0)}/${MUSIC.profileAuto.evidenceSec}s  ` +
      `trocas ${state.profSwitches}${profHoldLeft(nowL)}`,
    `saída   opac ${o.opacity.toFixed(2)} rpm ${o.rpm.toFixed(2)} beams ${Math.round(o.beams)} bInt ${o.beamInt.toFixed(3)} haze ${o.haze.toFixed(2)} spot ${o.spot.toFixed(2)}`,
    `dono ${window.MB_SOURCE ? window.MB_SOURCE.owner : '—'}  health ${state.health.toFixed(2)}  spot dom ${state.domSpot}  gerador ${GEN.on ? 'ON (' + GEN.phase + ' c' + GEN.cycle + ')' : 'off'}  clock ±${MB_CLOCK.offset.toFixed(1)}ms`,
    '',
    'eventos (g gerador · n próxima fase · p perfil · w skin)',
  ];
  for (const e of state.log) {
    lines.push(`  ${((nowL - e.t) / 1000).toFixed(1).padStart(6)}s  ${e.note ? '·' : e.from + '→' + e.to}  ${e.why}`);
  }
  hud.textContent = lines.join('\n');
}

if (typeof addEventListener === 'function') {
  addEventListener('keydown', ev => {
    if (!ev || !ev.key) return;
    const k = ev.key.toLowerCase();
    if (k === 'm' && hud) hud.classList.toggle('on');
    else if (k === 'g') GEN.toggle();
    else if (k === 'n') GEN.nextPhase();
    else if (k === 'p') setProfile(PROFILES[(PROFILES.indexOf(MUSIC.profile) + 1) % PROFILES.length]);
  });
}

/* ============================ config sobreponível (§5) ============================ */
function deepMerge(dst, src) {
  for (const k in src) {
    const v = src[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object' && !Array.isArray(dst[k])) deepMerge(dst[k], v);
    else dst[k] = v;
  }
  return dst;
}
if (typeof fetch === 'function') {
  fetch('music.config.json', { cache: 'no-store' })
    .then(r => r.ok ? r.json() : null)
    .then(j => {
      if (j && typeof j === 'object') {
        deepMerge(MUSIC, j);
        if (MUSIC.gesture.seed) { RNG = makeRng(MUSIC.gesture.seed); RNG2 = makeRng((MUSIC.gesture.seed ^ 0x5bf03635) >>> 0); }
        console.log('[music] music.config.json aplicado');
      }
    })
    .catch(() => { /* ficheiro opcional; ausência é o caso normal */ });
}

/* ======================================= arranque ======================================= */
// O painel (tuner.js) chama isto quando o ficheiro acaba de carregar; declarado aqui para o
// `loadTuningFile` o poder invocar sem saber se o painel existe.
function TUNER_SYNC() { if (window.MUSIC && typeof window.MUSIC.tunerSync === 'function') window.MUSIC.tunerSync(); }

window.MUSIC = {
  config: MUSIC, state, gen: GEN, clock: MB_CLOCK, update, onMessage,
  gestures: GESTURE_NAMES, setProfile,
  setSeed(s) { RNG = makeRng(s); RNG2 = makeRng((s ^ 0x5bf03635) >>> 0); },

  /* API do painel de calibração (§TUNE). Tudo o que o `tuner.js` precisa, e nada mais — o
   * painel não mexe no CONFIG a não ser por aqui, para a validação ser sempre a mesma. */
  tune: {
    schema: TUNE,
    defaults: TUNE_DEFAULTS,
    state: TUNE_STATE,
    get: (p) => getPath(MUSIC, p),
    /* Escreve UM knob no CONFIG vivo, já validado/clamped. É isto que dá o efeito imediato. */
    set(p, v) {
      const val = coerceKnob(p, v);
      if (val == null) return false;
      const ok = setPath(MUSIC, p, val);
      if (ok) TUNE_STATE.dirty = true;
      return ok;
    },
    /* Repõe os defaults do CÓDIGO (não os do ficheiro): o estado de referência conhecido. */
    reset() {
      for (const [p, v] of Object.entries(TUNE_DEFAULTS)) setPath(MUSIC, p, v);
      TUNE_STATE.dirty = true;
      TUNE_STATE.msg = 'defaults do código repostos (por gravar)';
    },
    /* Quantos knobs estão fora do default — é o "há alterações por gravar" do painel. */
    dirtyCount() {
      let n = 0;
      for (const [p, d] of Object.entries(TUNE_DEFAULTS)) {
        const v = getPath(MUSIC, p);
        if (typeof v === 'number' && isFinite(v) && Math.abs(v - d) > 1e-9) n++;
      }
      return n;
    },
    /* `raw` = o detetor novo por banda está mesmo a ser usado; `fallback` = sidecar por
     * reiniciar (ou gerador/replay), e nesse caso os knobs do Detetor não mudam nada. */
    detectorPath() {
      const f = state.feat;
      return (f && f.subFluxRaw != null) ? 'raw' : 'fallback';
    },
    /* Grava no sidecar. O destino é um ID da lista que o servidor ofereceu — nunca um caminho
     * construído aqui (é essa a guarda contra path traversal, do lado de lá também). */
    async save(locationId) {
      if (!TUNE_STATE.canSave || typeof fetch !== 'function') return { ok: false, error: 'sem sidecar' };
      TUNE_STATE.saving = true;
      try {
        // Reconstrói o JSON aninhado a partir dos caminhos do esquema (só knobs conhecidos).
        const cfg = {};
        for (const p of TUNE_KNOBS.keys()) {
          const v = getPath(MUSIC, p);
          if (typeof v !== 'number' || !isFinite(v)) continue;
          const parts = p.split('.');
          let cur = cfg;
          for (let i = 0; i < parts.length - 1; i++) {
            const key = parts[i], nextIsIndex = /^\d+$/.test(parts[i + 1]);
            if (cur[key] == null) cur[key] = nextIsIndex ? [] : {};
            cur = cur[key];
          }
          cur[parts[parts.length - 1]] = v;
        }
        // + knobs do painel d da bola (secção `ball`), para os dois painéis viverem no mesmo ficheiro
        if (window.MIRRORBALL && window.MIRRORBALL.knobs) cfg.ball = window.MIRRORBALL.knobs.get();
        const body = JSON.stringify({ location: locationId || TUNE_STATE.active || undefined, config: cfg });
        const r = await fetch('/app-config', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-audio-token': TUNE_STATE.token || '' },
          body,
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { TUNE_STATE.msg = j.error || `erro ${r.status}`; return { ok: false, error: j.error || `erro ${r.status}` }; }
        TUNE_STATE.dirty = false;
        TUNE_STATE.active = j.location || TUNE_STATE.active;
        TUNE_STATE.path = j.path || TUNE_STATE.path;
        TUNE_STATE.msg = `gravado em ${j.path || '?'}`;
        // Reflete o `exists` para o painel mostrar o ponto na localização certa.
        for (const l of TUNE_STATE.locations) if (l.id === TUNE_STATE.active) l.exists = true;
        return { ok: true, path: j.path };
      } catch (e) {
        TUNE_STATE.msg = 'falha de rede ao gravar';
        return { ok: false, error: 'rede' };
      } finally { TUNE_STATE.saving = false; }
    },
  },
};

// Carrega o music-config.json depois de `window.MUSIC` existir (o painel pode já querer ler
// TUNE_STATE). Assíncrono e tolerante: sem ficheiro, ficheiro corrompido ou sidecar antigo, o
// motor arranca à mesma com os defaults do código.
loadTuningFile();

if (typeof requestAnimationFrame === 'function') {
  (function loop() {
    const nowL = MB_CLOCK.now();
    GEN.tick(nowL);
    update(nowL);
    requestAnimationFrame(loop);
  })();
  for (let i = 0; i < 5; i++) setTimeout(() => MB_CLOCK.request(), 120 + i * 180);
  setInterval(() => MB_CLOCK.request(), 10000);
}

})();
