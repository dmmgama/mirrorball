// v2/config.js — CONFIG copiado verbatim de web/index-v2.html (linhas 69-165) + chaves novas do spike Babylon.
// window.CONFIG global (script normal, carregado antes de main.js type=module) — mesmo padrão do spike v1 (SPIKE_CFG).
//
// ---- ESCALA FÍSICA (F8, fixada 2026-08-31) ----
// 1 raio da bola (mundo Babylon) = 1 METRO. Bola Ø 2,0 m (raio 1 = 1 m), fundo a 2,5 m do chão
// (centro a 3,5 m = `room.floor` a -3.5), corrente ~1 m até ao teto. Todo o `CONFIG.room`/`spotDist`/
// dimensões de sala abaixo estão em metros == raios da bola (docs/f8-sala-lux.md).
window.CONFIG = {
  ballSizeVH: 0.52,          // diâmetro da bola em fração da altura do viewport
  ballCenter: [0.5, 0.53],   // posição do centro (fração da largura/altura)
  facetRows: 48,             // filas de latitude (32 original → 48: espelhos a 2/3, ~2.25× tiles) (tiles quadrados → equador tem ~2·facetRows tiles)
  rotationRpm: 1.0,          // rotação real de uma bola (0.5–3 rpm)
  /* K1 (2026-09-01): cadência da cadeia de cinza → vertex color (ball.js:899, antes hardcoded
     `COLOR_HZ=20`). Ao VIVO, sem rebuild — `computeColors` já lê o cronómetro a cada frame; só
     muda de quanto em quanto tempo ele recalcula. Piso 10 (abaixo disso a rotação "engasga"
     visualmente), teto 60 (acima disso não ganha nada, é 1 frame). */
  colorHz: 20,               // knob 'bola: cadeia Hz' (10-60)
  spots: [                   // pinspots FORA do ecrã; az/el em graus a partir da câmara; radius = raio do foco na
                             // superfície (em raios da bola, DIÂMETRO CONSTANTE — não pulsa com a intensidade)
    // Rig realista (docs/lighting-design-research.md): 2 pinspots OPOSTOS ao nível do equador,
    // nunca do lado do público (az≈0 é atrás da câmara) nem de cima; miram o equador.
    // A sala é 3D e a bola é o centro: az=0 é a direção do público (câmara). Fontes nos LADOS da sala, à frente
    // do plano da bola (|az| 40-60°), quase ao nível do equador — assim os espelhos da frente refletem para nós.
    //
    // ---- F8 (David, 2026-09-01): "focos que incidem na bola a H = 3,5 m = altura do EQUADOR" ----
    // O corpo do foco fica em dirFromAzEl(az,el)·spotDist (main.js/ball.js), logo Y = sin(el)·spotDist.
    // Com spotDist 6 e centro da bola a 3,5 m do chão, a altura FÍSICA da fonte é 3,5 + sin(el)·6:
    //   el=0° → 3,50 m (equador, incidência horizontal — o "beam a rasar a bola" dos screenshots)
    //   el=8° → 4,33 m · el=12° → 4,75 m · el=15° → 5,05 m (ainda abaixo do teto, 5,5 m)
    // Por isso el fica em 0-15°: acima disso a fonte sairia pelo teto (el=30° → 6,5 m, impossível).
    // el NUNCA negativo — foco inferior é proibido (não existe no rig real; regra do David).
    { az:  -52, el:  6, intensity: 1.00, radius: 0.16, period: 13, aim: [0, 0.03], on: true, hue: 210 },   // esquerda-frente (fonte a ~4,1 m)
    { az:   52, el:  4, intensity: 0.95, radius: 0.15, period: 17, aim: [0, 0.03], on: true, hue: 210 },   // direita-frente (oposto, ~3,9 m)
    // 3º/4º: nos LADOS (|az|≈82°), não atrás — a ±125° a mancha caía no hemisfério invisível e "não apareciam"
    { az:  -82, el: 10, intensity: 0.80, radius: 0.15, period: 11, aim: [0, 0.05], on: true, hue: 210 },   // esquerda-lado (~4,5 m)
    { az:   82, el: 10, intensity: 0.80, radius: 0.15, period: 19, aim: [0, 0.05], on: true, hue: 210 },   // direita-lado (~4,5 m)
    { az:  -30, el: 15, intensity: 0.75, radius: 0.14, period: 23, aim: [0, 0], on: true, hue: 210 },      // 5º/6º: os mais altos do rig (~5,05 m, junto ao teto)
    { az:   30, el: 15, intensity: 0.75, radius: 0.14, period: 29, aim: [0, 0], on: true, hue: 210 },
  ],
  spotCount: 2,              // quantos pinspots estão montados (0-6; 0 = só luz indireta + flashes) — knob no painel d
  spotRadiusMul: 1.0,        // multiplicador global do raio dos focos — knob no painel d
  mirrorGain: 1.0,           // brilho dos espelhos quando a luz incide (não são os feixes) — knob no painel d
  choreo: {                  // coreografia interna dos focos (um técnico de luz a apontar os pinspots)
    enabled: true,
    retarget: false,         // pinspots reais têm aim FIXO: o técnico trabalha o dimmer, não move o foco. Knob liga saltos.
    dwell: [4.0, 12.0],      // (se retarget) s que um foco fica no mesmo sítio antes de saltar
    move: 0.08,              // s do apagar e do acender na troca de sítio (o foco NUNCA anda: apaga, salta, acende)
    // poses plausíveis: |az| lateral/traseiro (sinal sorteado), mira perto do equador.
    // F8 (2026-09-01): elRange topo 30°→15° — com spotDist 6 e centro a 3,5 m, el=30° punha a fonte
    // a 6,5 m, acima do teto (5,5 m). 0-15° = 3,5-5,05 m, dentro do pé-direito. Nunca negativo.
    azRange: [35, 130], elRange: [0, 15], aimMax: 0.35,
    flashRate: 0.6,          // flashes/s em média (disparos curtos de posições plausíveis)
    flashLen: [0.09, 0.22],  // s de cada flash
    flashRadius: [0.10, 0.18], flashIntensity: [0.6, 1.0], flashSlots: 4,
  },
  ambient: {                 // luz INDIRETA da sala (varredores, LEDs, reflexos): fontes largas e fracas que deambulam
    n: 3, intensity: 0.07, areaDeg: 32, drift: 0.045, // n fontes; brilho; meia-largura angular da ÁREA refletida (°); velocidade (rad/s)
    // NÃO são focos: são áreas largas da sala (parede/teto claros) que os espelhos devolvem — cada espelho com o seu brilho
  },
  shade: { key: 0.55, az: -35, el: 40 }, // luz GERAL da sala (volume da esfera): tiles virados para ela mais claros; 0 = plano
  halo: 0.3,                 // auréola de névoa à volta da bola (1 = como antes; 0 = nenhuma)
  ballContrast: 1.0,         // contraste das facetas (0.5-2.5): estica os cinzas à volta do nível médio — ver melhor a bola sem a lavar
  ballLight: 0.0,            // luz da BOLA (0-1): sobe uniformemente o cinza das facetas, ANTES do volume/luz geral (mantém o 3D) — knob
  bgGrey: 7,                 // cinza do fundo em dark (0-60): quanto "escuro" é o escuro — knob 'fundo: claridade'
  strobe: {                  // estrobo de FUNDO (a sala atrás pisca, não a bola). O motor só o usa se enabled.
    enabled: false, level: 0.55, lenMs: 55, minGapMs: 340, // level = alpha do branco; cadência ≤ 3 Hz (regra 6)
  },
  spotEdge: 0.35,            // suavidade da orla do foco (fração do raio)
  glintSharp: 0.75,          // quanto o brilho especular (N·H) marca dentro do foco (0 = foco uniforme)
  incidentAlpha: 0.06,       // pico do eixo de névoa que CHEGA à bola (junto ao limbo); ×haze×intensity×dk
  incidentLen: 3.2,          // alcance do eixo incidente em raios da bola (a névoa acesa apaga-se depressa)
  incidentMaxWidth: 1.3,     // teto relativo: meia-largura ≤ este × raio da mancha na bola (nunca uma banda)
  incidentMaxPx: 0.14,       // teto absoluto: meia-largura ≤ este × Rpx — 4-6° não ocupa meio ecrã, mesmo com raio ×3
  beamLen3D: 3.6,            // comprimento do feixe refletido em raios da bola (3D, projetado)
  beamGlowZ: 0.8,            // R·z acima disto = feixe a vir para nós → brilho ADITIVO por cima do cone (o cone desenha-se sempre)
  beamGlowMul: 0.25,         // × peso desse brilho (0-1; 0 = só cones) — knob 'feixes: glow ×'
  haze: 0.65,                // densidade da névoa (só afeta feixes e a auréola)
  beamMaxCount: 110,         // feixes visíveis no máximo
  beamFractionMax: 1.0,      // teto do painel d: o motor escreve beamFraction = fração musical × isto
  hazeMax: 1.0,              // teto do painel d: o motor escreve haze = haze musical × isto
  beamFraction: 1.0,         // fração dos tiles do foco a produzir feixe (1 = todos os espelhos iluminados)
  beamIntensity: 0.16,       // alpha máximo de um feixe (núcleo)
  beamWidthDeg: 0.7,         // meia-largura angular do wedge exterior — knob 'feixes: largura°'
  beamSoft: 0.5,             // dispersão 0..1: 0 = laser (só núcleo, orla dura), 1 = difuso (halo largo, núcleo fraco) — knob
  beamLength: 0.78,          // comprimento em fração do viewport
  dotDensity: 0.8,           // fração dos tiles elegíveis a projetar ponto na parede (adaptativo) — knob 'pontos na parede'
  strobeRate: 1.0,           // multiplicador da frequência dos estrobos do motor (0 = nunca, 1 = normal, 3 = 3×) — knob
  dotScale: 0.32,            // tamanho do ponto na parede relativo ao tile projetado
  dotMaxGrey: 0xd8,          // teto de brilho dos pontos
  /* V1 (research-realismo §2.1): forma da mancha na parede. 1 = LOSANGO (a mancha herda a
     silhueta quadrada da faceta que a projetou — é o que uma bola de espelhos real faz),
     0 = disco redondo (o comportamento até S12). Área aparente igual nos dois. Knob
     'pontos: losango (0/1)'. Valor inicial finito (regra 7). */
  dotDiamond: 1,
  bloomStrength: 0.75,       // alpha da passagem de bloom
  bloomBlurPx: 9,            // raio do blur (em px CSS, a meia resolução)
  bloomThreshold: 0.8,       // NOVO (F4): fonte do bloom = só o que já está quase branco (~ gl>0.35 do Canvas 2D)
  postTonemap: 1,            // NOVO (F4): 0/1 — ACES tonemap no DefaultRenderingPipeline (knob, handoff S7)
  postExposure: 1,           // NOVO (F4): exposição do pipeline (0.3-2)
  opacityMotor: false,       // false (defeito, pedido do David) = o motor não escreve sphereOpacity; liga-se no painel d
  beamsMotor: true,          // false = o motor não toca em beamFraction/beamIntensity/haze
  spotsMotor: true,          // false = o motor não toca na intensidade dos focos (nem flashes)
  sphereOpacity: 1.0,        // 1 = sólida; → 0 = raio-X (só malha + tiles ativos persistem)
  seamDarkness: 0.02,        // cinza das juntas (0..1)
  seamInset: 0.15,           // fração angular do tile reservada à junta (≈1–2 px)
  rimStrength: 0.22,         // borda clara nas facetas rasantes
  baseTileGrey: [0.045, 0.14], // intervalo do cinza das facetas apagadas (a sala escura refletida)
  litSideGain: 0.55,         // facetas viradas para os spots refletem sala um pouco mais clara
  glintK: 24,                // expoente do pow(N·H, k) do brilho especular dentro do foco
  camDistance: 7.0,          // distância da câmara em raios da bola (perspetiva ligeira)
  /* F8: sala real do Lux Frágil em METROS = raios da bola (docs/f8-sala-lux.md §"Dimensões
     AUTORITATIVAS", David 2026-09-01: planta 15 × 10 m, pé-direito 5,5 m, bola ao CENTRO).

     ---- MAPEAMENTO doc → Babylon (a única conversão; tudo o resto deriva daqui) ----
     O doc usa coordenadas de CANTO: X ao longo do comprimento (0..15), Y ao longo da largura (0..10).
     O mundo Babylon tem origem no CENTRO DA BOLA, que fica no centro da planta = doc (7,5 · 5,0):
        Babylon Z = doc_X - 7.5   → Z ∈ [-7.5, +7.5]  (comprimento 15 m)
        Babylon X = doc_Y - 5.0   → X ∈ [-5.0, +5.0]  (largura 10 m)
        Babylon Y = altura_física - 3.5 (centro da bola a 3,5 m do chão)

     Pé-direito 5,5 m: floor -3.5 (chão), ceil +2.0 → 5,5 m de altura.
     Comprimento (Z) 15 m: a sala é SIMÉTRICA em Z (room.js: roomD = |back|·2 e os planos chão/teto/
     laterais centram-se em z=0), portanto back -7.5 → 15 m com a bola exatamente ao meio.

     ---- F8-b (David, 2026-09-01): filas de pilares +1 m (5→6 m entre eixos) ----
     O vão entre as 2 filas abriu 1 m, e a sala ALARGA com ele — os corredores laterais NÃO
     encolhem. Cadeia de dependências (largura X): pilares a ±3.0 (era ±2.5) + 2,5 m de corredor
     até à parede → halfW 5.5 (largura 11 m, era 10); chapéus continuam a 1 m da parede → |X| 4.5
     (era 4.0). Ver `pillars.halfX` e `hats.lineX` abaixo — os três números movem-se juntos.
     `roomWidthM/roomDepthM/roomHeightM` são os knobs do painel `d` (grupo Sala) — mudar exige reload. */
  room: { halfW: 5.5, ceil: 2.0, floor: -3.5, back: -7.5 },
  dotFalloff: 0.028,         // atenuação dos pontos com a distância (1/(1+k·t²))
  grain: 0.032,              // grão de filme (alpha)
  vignette: 0.55,            // força da vinheta
  chainLinkPx: 11,           // tamanho de cada elo da corrente
  driftPeriod: 38,           // segundos da deriva lenta do cinza por tile
  perf: { targetMs: 17.5, minDotDensity: 0.12 },
  skin: 'auto',              // 'dark' | 'white' | 'auto' (auto = emoções decidem)
  skinEase: 7.0,             // crossfade dark↔white (por segundo); o emotion.js já suaviza o alvo com attack/release
  skinAutoValence: 1.6,      // auto: skinTarget = max(0, valência) × isto (neutro/triste → dark, feliz → white)
  spotFadeMix: 1.0,          // 1 = fade interno dos spots como hoje; 0 = intensidade constante, para uma fonte externa coreografar
  explode: {                 // estoiro em estilhaços (MIRRORBALL.explode() / tecla x); tudo paramétrico em s∈[0,1] → rewind = s a descer
    burstSec: 0.16,          // 1º tempo: estoiro seco até burstS (ainda tem forma de bola, só rachada)
    burstS: 0.16,            // …fração do percurso percorrida no estoiro
    driftSec: 6.0,           // 2º tempo: câmara lenta — os estilhaços continuam a sair do centro (easeOut)
    hold: 0.5,               // s suspenso no fim da deriva antes do rewind automático
    maxHold: 14,             // teto absoluto (s desde o estoiro) — com autoHold:false, força o rewind
    rewind: 0.9,             // 3º tempo: sucção de volta (easeInOutCubic)
    radial: 1.9,             // alcance radial em raios da bola
    depth: 0.45,             // escala do deslocamento em z (1 = esférico; <1 mantém os estilhaços mais no plano)
    jitter: 0.45,            // dispersão lateral da trajetória
    floatSpin: 0.35,         // em pausa (hold/held) os estilhaços continuam a tombar (rad/s) …
    floatBob: 0.05,          // …e a flutuar (amplitude em raios); dissolve-se nos primeiros 30% do rewind
    gravity: 1.1,            // queda (em s², continua função pura de s)
    spinMax: 3.2,            // tombo máximo de cada estilhaço (rad) — a normal roda, o reflexo varre a sala
  },

  // ---- novidades do spike Babylon v2 (Fase 1) — ainda sem knob de origem na 2D, ganham slider no painel `d` ----
  tileSizeVar: 0.35,         // variação de tamanho dos espelhos por tile (0 = todos iguais, 1 = variação forte) — knob 'espelhos: variação'
  tileTone: 'hash',          // 'hash' (tom por tile, como a Canvas 2D) | 'real' (todos os espelhos ao mesmo tom) — knob 'espelhos: tom'
  tileLayout: 'offset',      // 'offset' (filas desencontradas, como a Canvas 2D) | 'grid' (alinhadas, bola real) — knob 'espelhos: alinhados'
  mirrorMetallic: 0.92,      // PBRMaterial.metallic dos espelhos — knob 'pbr: metallic'
  mirrorRoughness: 0.22,     // PBRMaterial.roughness dos espelhos — knob 'pbr: roughness'
  envIntensity: 2.4,         // PBRMaterial.environmentIntensity (ReflectionProbe) — knob 'pbr: ambiente'
  spotLightIntensity: 900,   // SpotLight.intensity (lumens, fotométrico) — knob 'focos: luz (lm)'
  spotDist: 6.0,             // distância do corpo do foco à origem, em raios da bola — knob 'focos: distância'

  // ---- novidades da Fase 2 (Sonnet) — indireta (RectAreaLight) + glint PBR vs CPU ----
  boneMesh: true,            // raio-X: malha osso (LineSystem)
  boneAlphaMul: 0.35,        // raio-X: alpha do osso × (0.45 base do Canvas 2D; 1.0 lia demasiado forte)
  ambientLightMul: 5,        // luz indireta (RectAreaLight): intensity = ambient.intensity·I·isto (≈0.35) — knob 'indireta: luz ×'
  glintPbrMix: 0.5,          // 0-1: 0 = glint só na cadeia CPU (vertex color), 1 = glint só do PBR/SpotLight real — knob 'pbr: glint mix' (o Opus lê isto em ball.js)

  // ---- pedido extra do David: cor RGB nos focos (não existe na bola Canvas 2D — só afeta as luzes Babylon) ----
  spotColorOn: false,
  spotSat: 1.0,              // saturação global da cor dos focos (com spotColorOn)        // 0 (defeito) = focos brancos/greyscale (invariante da bola mantém-se); 1 = SpotLight usa spots[i].rgb

  // ---- correções pedidas pelo David (2026-08-30) ----
  // (1) corrente 3D: elos do topo da bola até room.ceil (paridade com drawChain, index-v2.html:704-720).
  //     `chainLinkPx` (acima) é em px de Canvas; em 3D o mundo é em raios da bola, por isso o knob real
  //     é `chainLink` — comprimento do elo em raios (11 px ≈ 0.045 raios com ballSizeVH 0.52).
  chainOn: true,             // corrente ligada — knob 'corrente (0/1)'
  chainLink: 0.045,          // comprimento de um elo em raios da bola — knob 'corrente: elo (raios)'
  // (2) modo `tileTone:'real'`: a junta lia-se como CONTORNO PRETO à volta de cada espelho (o núcleo a
  //     seamDarkness 0.02 visto por um vão de 15-45% da célula, contra tiles a ~1). Em 'real' o núcleo
  //     passa a cinza metálico e a junta estreita — relevo fino, não vão. Só afeta 'real'; 'hash' fica igual.
  seamGreyReal: 0.35,        // cinza do núcleo em modo 'real' — knob 'espelhos: junta (real)'
  seamInsetRealMul: 0.33,    // × seamInset em 'real' (0.15 → 0.05) — knob 'espelhos: junta larg. (real)'
  seamVarRealMul: 0.5,       // × tileSizeVar em 'real' (0.35 → 0.18) — knob 'espelhos: junta var. (real)'

  // ---- novidade da Fase 3 (Sonnet/Opus): comprimento do cone do feixe (thin instances, v2/beams.js) ----
  beamLen: 6,                // comprimento do cone do feixe 3D em raios da bola (2-12) — knob 'feixes: comprimento'
  beamBaseMul: 0.5,          // × largura da base do cone do feixe (0.1-2) — knob 'feixes: base ×'

  // ---- novidade da Fase 6 (Sonnet): corpos PAR36 visíveis (v2/fixtures.js) — SEM paridade na
  // Canvas 2D, tudo novo (ver docs/lighting-design-research.md + PARITY.md "Corpos PAR36 (F6)") ----
  fixturesOn: true,          // corpos ligados — knob 'corpos (0/1)'
  /* escala global do corpo (lata Ø0.12·isto, comprimento 0.18·isto) — knob 'corpos: escala'.
     F9 (2026-09-01): 1.0 → 2.6. Diagnóstico do "não vejo os focos que apontam para a bola": com a
     escala física da F8 (1 unidade = 1 METRO), a lata ficava com Ø 12 cm × 18 cm a ~6 m do centro,
     em material quase preto (albedo 0.05) contra paredes quase pretas — meia dúzia de pixéis, na
     prática invisível. 2.6 dá uma lata de ~31 × 47 cm: a dimensão de um PAR real montado em treliça,
     que já se lê à distância da câmara sem parecer um objeto gigante. */
  fixtureScale: 2.6,
  lensGain: 1.0,             // × intensidade do spot → emissiveColor da lente ("a lente segue o dimmer") — knob 'corpos: lente ×'
  fixtureStemOn: true,       // haste/yoke até ao teto/parede — knob 'corpos: haste (0/1)'

  // ---- Fase 8 (Sonnet, 2026-08-31): sala real do Lux Frágil — dimensões, pilares, wash azul,
  // chapéus de latão. Ver docs/f8-sala-lux.md. `roomWidthM/roomDepthM/roomHeightM` refletem
  // `CONFIG.room` em metros; mudar qualquer um exige RELOAD da página (a sala/pilares/chapéus só se
  // constroem uma vez no arranque — não há rebuild ao vivo da geometria da sala, ao contrário de
  // `espelhos: filas` que só reconstrói a BOLA).
  //
  // ---- F10 (David, 2026-09-01, docs/f8-sala-lux.md "F10 — parametrização"): largura/comprimento
  // passam a DERIVADOS ----
  // Decisão: `roomWidthM`/`roomDepthM` DEIXAM de ser knobs do painel (já não há 'sala: largura (m)'
  // nem 'sala: comprimento (m)' em panel.js — dois knobs a escrever a MESMA coisa que os novos knobs
  // de pilares lutariam pelo mesmo estado). Os campos continuam a existir aqui como VALORES
  // CALCULADOS (o painel escreve-os via os setters de 'pilares: vão entre filas (m)' e 'pilares:
  // passo na fila (m)', que também escrevem CONFIG.room.halfW/back) porque main.js/hats.js/fixtures.js
  // ainda os leem para posicionar coisas relativas à sala. A regra fixa (David): os CORREDORES nunca
  // mudam — pilar→parede lateral sempre `PILLAR_WALL_MARGIN` (2,5 m), margem dos topos sempre
  // `PILLAR_END_MARGIN` (2,5 m, pilar extremo a metade do vão da fila da parede de fundo). Logo:
  //   largura = vão_entre_filas + 2×PILLAR_WALL_MARGIN   (halfW = largura/2)
  //   comprimento = 2×passo_na_fila + 2×PILLAR_END_MARGIN (back = -comprimento/2)
  // `pillars.halfX` = vão_entre_filas/2, `pillars.spacingZ` = passo_na_fila — a ÚNICA fonte de
  // verdade destas duas medidas passa a ser `CONFIG.pillars` (ver bloco `pillars` abaixo); os campos
  // roomWidthM/roomDepthM ficam sincronizados pelos setters do painel (panel.js).
  roomWidthM: 11.0,          // largura X da sala (m) — DERIVADO (vão pilares + 2×2,5 m), RELOAD
  roomDepthM: 15.0,          // comprimento Z da sala (m) — DERIVADO (2×passo pilares + 2×2,5 m), RELOAD
  roomHeightM: 5.5,          // pé-direito (m) — knob 'sala: pé-direito (m)' (RELOAD)
  pillarWallMarginM: 2.5,    // pilar→parede lateral — FIXO, nunca muda com os knobs de vão/passo
  pillarEndMarginM: 2.5,     // pilar extremo→parede de fundo — FIXO, nunca muda com os knobs de vão/passo

  colorOn: true,             // 'cor (0/1)' — knob geral: 1 = wash/chapéus/chão/pilares a cor real;
                             // 0 = tudo colapsa para luminância (grey = 0.2126r+0.7152g+0.0722b),
                             // via util core.toGrey() aplicada quando a cor é ESCRITA (atua ao vivo,
                             // sem rebuild). Default 1 (decisão do David 2026-08-31: cor é permitida,
                             // greyscale passa a TOGGLE — a bola/espelhos/feixes continuam sempre
                             // greyscale, regra 6 do CLAUDE.md; isto só afeta luzes/materiais da SALA).

  /* pilares (F8 autoritativo, David 2026-09-01): **6** = 2 filas × **3**, secção **0,5 × 0,5 m**,
     chão-teto. 5 m entre eixos em Z → doc_X = 2,5 / 7,5 / 12,5 → Babylon Z = -5 / 0 / +5 (spacingZ 5,
     3 filas centradas em z=0 → o pilar do MEIO de cada fila fica ao nível da bola, como na planta).

     F8-b (David, 2026-09-01): distância ENTRE AS 2 FILAS +1 m → 6 m entre eixos → halfX 2.5→3.0.
     A sala alargou com elas (room.halfW 5.0→5.5): os pilares continuam a 2,5 m das paredes
     (5.5 - 3.0 = 2.5 ✓), ou seja os corredores laterais mantêm a largura — foi a sala que abriu.

     `off` = índices (0-5) DESLIGADOS individualmente — knobs 'pilar N (0/1)' do grupo "Pilares"
     (David: "tapar e ligar" cada um). Ordem dos índices = ordem de criação em room.js:
       0,1,2 = fila X negativo (Z -5/0/+5) · 3,4,5 = fila X positivo (Z -5/0/+5).
     Um pilar desligado fica `setEnabled(false)` MAS permanece na renderList do probe (o probe só
     desenha o que está enabled — ver room.js/main.js), portanto o toggle atua ao vivo, sem reload.

     ---- F10 (David, 2026-09-01): geometria paramétrica por knob (RELOAD, mesmo padrão das dimensões
     da sala — a geometria só se constrói uma vez no arranque) ----
     `halfX` (metade do vão ENTRE FILAS) e `spacingZ` (passo NA FILA, ao eixo) passam a ser escritos
     pelos knobs 'pilares: vão entre filas (m)' (default 6, = 2×halfX) e 'pilares: passo na fila (m)'
     (default 5, = spacingZ) do painel — ambos em passos de 0,5 m. Os setters (panel.js) recalculam
     `roomWidthM/roomDepthM` (e `room.halfW/back`) para os corredores ficarem sempre iguais (ver a nota
     F10 acima de `roomWidthM`). `section` (lado do pilar, secção quadrada) ganha o knob 'pilares: lado
     (m)' (default 0,5, range 0,3-1,2, passos 0,05) — o CENTRO do pilar não se move, só a espessura da
     caixa (room.js já usa `section` para width/depth da box, sem tocar em `position`). */
  pillars: {
    on: true, halfX: 3.0, section: 0.5, rows: 3, spacingZ: 5.0, albedo: [0.05, 0.05, 0.05],
    off: [],
  },
  floorWoodColor: [0.10, 0.075, 0.055], // tom de madeira escura do chão — knob 'sala: chão madeira' (RGB fixo, sem knob de cor individual; sujeito a colorOn)

  /* K1 (2026-09-01): albedo BASE (0-1, escalar aplicado às 3 componentes RGB) de teto/paredes de
     fundo/paredes laterais (room.js:37, antes hardcoded `BASE_ALBEDO=[0.055,0.055,0.055]`). NÃO
     toca no chão (`floorWoodColor`, tom próprio) nem nos pilares (`pillars.albedo`, também à
     parte) — só as 3 superfícies que a `BASE_ALBEDO` de hoje cobre. ⟳ reload: os materiais
     (`ceilMat`/`backMat`/`sideMat`) só se criam uma vez no build de `buildRoom`; o multiplicador
     `reflMul.*` (acima) continua a atuar AO VIVO por cima deste valor, como hoje. */
  baseAlbedo: 0.055,          // knob 'sala: albedo base' (0-1, ⟳ reload)

  /* ---- F10 (David, 2026-09-01): refletividade por superfície — multiplicador do albedo (0-3,
     default 1) de cada material de sala; ao vivo, SEM rebuild (room.js: applyXReflMul()). Confirmado
     por leitura de dots.js: os pontos refletidos pela mirror ball são thin instances de UM material
     StandardMaterial próprio (emissivo aditivo, alimentado por `ball.dots` — posições/intensidade
     calculadas no CPU a partir dos focos, NUNCA leem o albedo/material das paredes) — estes knobs não
     lhes tocam, por construção. */
  reflMul: {
    floor: 1.0,   // knob 'refl: chão'
    ceil: 1.0,    // knob 'refl: teto'
    back: 1.0,    // knob 'refl: paredes fundo' (só `room_back` — a sala não tem parede frontal, fica aberta para a câmara)
    side: 1.0,    // knob 'refl: paredes laterais' (room_left + room_right, material partilhado)
  },

  // wash ambiente azul profundo — banha paredes/pilares/chão; é o que permite LER os espelhos da
  // bola (feedback S9). Reaproveita as RectAreaLight `ambient0-2` já existentes (main.js) MAIS uma
  // HemisphericLight fraca dedicada (`washHemi`) para cobrir sombras que as RectArea não alcançam.
  wash: {
    intensity: 0.35,          // knob 'sala: wash (0-1)'
    hue: 230,                 // knob 'sala: wash matiz' (0-360, default azul profundo ~230, ref #1a2a66)
  },

  /* chapéus de latão: refletores parabólicos PENDURADOS DO TETO por haste/cabo visível, interior
     dourado quente, piscam raramente (Poisson, NÃO contínuo). Ver v2/hats.js.

     ---- F8 autoritativo (David, 2026-09-01) — mudou de anel oval para DUAS LINHAS RETAS ----
     "12 chapéus, 6 por corredor lateral, em 2 linhas retas a 1 m de cada parede lateral,
      igualmente espaçados ao longo dos 15 m, lâmpada Ø 1,0 m, base a 2,5 m do chão."
     Doc: linhas em doc_Y = 1 e 9 → Babylon X = ∓4.0 (lineX 4.0, halfW 5.0 - 1 m da parede);
     doc_X ≈ 1,25 / 3,75 / 6,25 / 8,75 / 11,25 / 13,75 (passo 2,5 m, meio-passo das pontas)
     → Babylon Z = -6.25 / -3.75 / -1.25 / +1.25 / +3.75 / +6.25 (spacingZ 2.5, 6 por linha
     centradas em z=0 — a mesma fórmula dos pilares).
     `heightM` = altura da BASE (boca) do chapéu ao chão, 2,5 m (o doc mede a base, não o centro);
     `lampDiameter` 1,0 m é a lâmpada/refletor. `tiltDeg` mantém-se para os inclinar para a pista. */
  hats: {
    on: true,                  // knob 'chapéus (0/1)'
    count: 12,                 // knob 'chapéus: quantos' (0-12; 12 = 6 por linha)
    /* K1 (2026-09-01): tamanho do POOL de chapéus (meshes pré-criadas no arranque, hats.js:48).
       ⟳ reload — o pool só se aloca uma vez, no build. Mesmo valor de hoje (MAX_HATS=12), fica
       como fallback em hats.js. `count` (acima) continua a ser quantos chapéus estão ATIVOS dentro
       do pool — nunca pode passar de `maxCount`. */
    maxCount: 12,               // knob 'chapéus: máx' (⟳ reload)
    /* K1: teto de PointLight de chapéu SIMULTÂNEAS que pintam a sala (hats.js:356). Teto DURO 4 no
       código — WebGL2 rebenta o shader dos materiais (maxSimultaneousLights:12) acima disso — o
       knob só pode DESCER, nunca subir esse teto (ver `Math.min(4, knob)` em hats.js). */
    maxLiveLights: 4,           // knob 'chapéus: luzes vivas máx' (teto duro 4 no código)
    glow: 0.35,                // knob 'chapéus: brilho' (emissivo contínuo, dourado quente ~#d9a640)
    flashPerMin: 8,            // knob 'chapéus: flash /min' (0 = nunca; Poisson no CONJUNTO TODO, não por chapéu)

    /* ---- F12 §4: os chapéus a SÉRIO (o flash da F8 era "levezinho" — David) ----
       `flashGain` é a força do flash: multiplica o emissivo da calote E a PointLight que pinta a
       sala. A F8 tinha 2,2 fixo no código e uma luz a ×8; o default sobe para 4,2 (quase o dobro
       do que se via) e passa a ser knob, porque isto é afinação de sensação e o David vai querer
       mexer nela ao vivo com música.
       `flashMs` = duração de cada flash (a F8 sorteava 100-300 ms sem knob; o valor central fica
       aqui, o sorteio mantém-se ±40% à volta dele para os flashes não soarem mecânicos).

       MODOS (spec §4): 0 = SOZINHOS (o Poisson da F8: um chapéu ao calhas de vez em quando)
                        1 = TODOS JUNTOS (a fila inteira acende de uma vez, é o gesto forte)
                        2 = SEQUÊNCIA ponta-a-ponta, SIMÉTRICA nas duas filas — acende um par de
                            cada vez (o chapéu k da fila esquerda E o chapéu k da direita, à mesma
                            distância do topo), a percorrer a sala de X=−máx a X=+máx. As duas filas
                            avançam EM ESPELHO, como pediu o David.
       `seqStepMs` = tempo entre passos da sequência. TETO de 3 Hz da sala: mínimo 334 ms, clampado
       no knob E no hats.js (`SEQ_MIN_MS`), como no mikado. */
    flashGain: 4.2,            // knob 'chapéus: força do flash'
    flashMs: 180,              // knob 'chapéus: flash ms'
    flashMode: 0,              // knob 'chapéus: modo (0=sozinhos/1=juntos/2=sequência)'
    seqStepMs: 380,            // knob 'chapéus: sequência ms/passo' (≥334 = teto de 3 Hz)
    heightM: 2.5,              // knob 'chapéus: altura (m)' — altura da BASE (boca) ao chão
    lineX: 4.5,                // |X| das 2 linhas (1 m de cada parede; F8-b: halfW 5.5 → 4.0→4.5)
    spacingZ: 2.5,             // passo entre chapéus ao longo de Z (15 m / 6 = 2,5 m)
    lampDiameter: 1.0,         // Ø da lâmpada/refletor (m)
    /* inclinação do plano de CORTE da casca (graus) — é o que faz a PALA (David, 2026-09-01:
       anotação em "Λ" + foto lux-chapeu1.webp). O chapéu é uma esfera cortada por um plano oblíquo:
       a vertente comprida de cima desce sobre a boca e projeta-se para a frente = a pala. 0 daria
       uma meia esfera (corte a direito, sem pala). Knob 'chapéus: corte da pala°' (⟳ reload). */
    cutDeg: 34,
    // graus a partir da VERTICAL. F8-b (ref. lux-chapeu1.webp): 25° era demais — a boca está quase
    // vertical na foto. 15° = meio da faixa pedida (10-20°). Knob 'chapéus: inclinação°'.
    tiltDeg: 15,
  },

  /* robots de teto (F8, David 2026-09-01 — confirmados nos screenshots 010406/010437/010531):
     fixtures LED compactos montados PRATICAMENTE À FACE DO TETO (lente a ≤ 0,5 m do teto → Y do
     corpo ≈ ceil - 0.35), aos PARES dos dois lados da bola, a projetar cones estreitos (vermelho nas
     fotos) para a PISTA, inclinados ~20-30° da vertical (para dentro, na direção da bola/centro).
     4 corpos: (X, Z) = (±3.5, ±3.5). Ver v2/robots.js.
     A BOLA é excluída destes SpotLights (não são focos da bola; a bola vê-os só via o probe). */
  robots: {
    on: true,                  // knob 'robots (0/1)'
    intensity: 0.45,           // knob 'robots: luz' (intensidade de cada SpotLight)
    hue: 0,                    // matiz default VERMELHO (0°) — obedece ao toggle 'cor (0/1)'
    halfX: 3.5, halfZ: 3.5,    // posição dos 4 corpos (±halfX, ±halfZ)
    // F8-b (David, 2026-09-01): "robots a apontar para BAIXO" — default passa de 25° para 3°
    // (praticamente vertical). Knob 'robots: inclinação°' (0-30) para afinar ao vivo.
    tiltDeg: 3,                // graus a partir da VERTICAL, a apontar para dentro
    coneDeg: 12,               // meia-abertura do cone (estreito, "beam" e não wash)
    dropM: 0.35,               // quanto o corpo desce do teto (lente fica a ≤0,5 m do teto)
  },

  /* ---- F11 (David, 2026-09-01, docs/f11-mikado.md): BOLA e MIKADO como elementos que SÓ O DAVID
     liga/desliga (o motor nunca liga/desliga nada — só anima o que estiver montado). ----
     `ballOn` esconde a bola INTEIRA (esfera + núcleo + osso + corrente + auréola) e é lido pelo
     mikado.js na geração: com a bola ON abre-se a CLAREIRA à volta dela (as barras que a
     atravessam são rejeitadas, como na foto lux-barras2); com a bola OFF o mikado enche o centro
     (stack completo). Mudar este knob REGENERA o mikado (main.js: onMikadoGeomChanged). */
  ballOn: true,                // knob 'bola (0/1)'

  /* ---- F12 §3: ALTURA DA BOLA — slider ao vivo (sobe/desce, a corrente acompanha) ----
     `ballHeightM` é a altura FÍSICA do CENTRO da bola ao CHÃO, na mesma unidade que o David usa em
     todo o lado (docs/f8-sala-lux.md: 3,5 m = fundo a 2,5 m + raio 1 m). O mundo Babylon tem a
     origem no centro da bola NOMINAL, portanto o deslocamento efetivo é
        ballY = ballHeightM − 3.5      (0 = a bola nominal da F8, onde tudo foi calibrado)
     `ball.js` publica esse `ballY` e desloca: a esfera, o núcleo, o osso, a auréola, a corrente
     (que ENCURTA/ALONGA sozinha — nasce no topo da bola e morre no teto) e o ReflectionProbe.
     Os pontos na parede e os feixes continuam a nascer da superfície da bola porque as contas de
     interseção passam a ser feitas no referencial da BOLA (planos da sala deslocados de −ballY) e
     o resultado é devolvido ao mundo com +ballY — ver `computeColors` em ball.js.

     ⚠ REGRA 3 do handoff S10 (focos com posição FIXA): os corpos montados NÃO se mexem quando a
     bola sobe. O que muda é a MIRA — a SpotLight passa a apontar ao novo centro. Isso está em
     `main.js` (updateSpotLights / fixtures) e é deliberado: um foco real montado no teto não anda.

     Faixa do knob: 2,0-4,6 m (fundo da bola nunca abaixo de 1 m do chão; topo + corrente mínima
     sempre abaixo do teto — clampado em ball.js contra `room.ceil`). */
  ballHeightM: 3.5,            // knob 'bola: altura (m)'

  /* ---- F13 §3: DIÂMETRO DA BOLA — knob 2,0-3,0 m em passos de 0,5 m ----
     A bola nasceu Ø 2,0 m (raio 1) e o mundo é em METROS, portanto durante 12 fases "1 raio" e
     "1 metro" foram a MESMA coisa e o spike encheu-se de literais `1` que são o raio da bola
     disfarçado de metro. Este knob quebra essa identidade, e a regra passa a ser:

       **`CONFIG.ballR` (= ballDiameterM/2) é a ÚNICA fonte de verdade do raio.** Tudo o que era
       "1 raio" deriva daí; tudo o que era "1 metro de sala" fica literal.

     Quem é quem (decidido e medido nesta fase, para não se reabrir):
       ESCALA COM R — a esfera de espelhos, o núcleo, o osso, o topo da corrente (`yTop`), a
         auréola, a largura do tile (base dos feixes), o raio/mira dos focos na superfície
         (`spots[].radius`/`aim`), o alcance do feixe e do cone incidente, a entrada do cone na
         esfera, a clareira do mikado, o clamp de altura (fundo/topo da bola), e a `camDistance`
         (para o enquadramento não mudar quando a bola cresce).
       NÃO ESCALA (fica em METROS) — as dimensões da sala, `spotDist` (um foco real montado em
         treliça NÃO se afasta porque trocaram a bola — regra 3 do handoff S10), o comprimento do
         ELO da corrente (um elo real não cresce), os corpos PAR36 (`fixtureScale`), os chapéus,
         os robots, os pilares, e as folgas em metros (1 m do chão, 0,25 m do teto, folga das
         paredes do mikado).

     RELOAD? NÃO: muda ao vivo (`onBallDiameterChanged` em main.js) — refaz a bola, reaplica a
     altura (o clamp depende do raio), regenera a clareira do mikado e refresca o probe. */
  ballDiameterM: 2.0,          // knob 'bola: diâmetro (m)' — 2,0 / 2,5 / 3,0
  ballR: 1.0,                  // DERIVADO (= ballDiameterM/2). Nunca se escreve à mão: ver ballR() no main.js

  /* ---- F14: POSIÇÃO DA BOLA NA PLANTA — knobs X e Z, passo 1 m ----
     A F12 deu à bola o eixo VERTICAL (`ballHeightM`) e a F13 o TAMANHO (`ballDiameterM`); faltavam
     os dois eixos da PLANTA. O David pediu-os por nome ("posição X e Y da bola na planta da sala,
     passo 1 m, no menu Sala") — no mundo Babylon a planta é (X, Z), com Y a vertical, por isso os
     knobs chamam-se 'bola: posição X (m)' e 'bola: posição Z (m)'.

     0 = CENTRO da sala (a posição nominal da F8, onde tudo foi calibrado), que é também o default:
     quem não mexer no knob vê exatamente a cena da F13. X cresce para a DIREITA da câmara; Z cresce
     para o FUNDO da sala (a parede `room.back` está em Z negativo, a frente aberta em Z positivo).

     PADRÃO (o mesmo das F12/F13, agora completo): o cálculo em CPU continua TODO no referencial da
     BOLA e em RAIOS; a sala entra deslocada de −offset e as posições que saem para o mundo levam
     +offset. Ver o comentário grande em `computeColors` (ball.js) — a F14 só acrescentou X e Z às
     duas linhas onde a F12 já tinha posto o Y.

     CLAMP (ball.js): a bola nunca entra nas paredes nem nos PILARES. O limite é
     `halfW − raio − margem` em X e `|back| − raio − margem` em Z (margem 0,30 m), mais a rejeição
     dos corredores dos pilares — ver `computeBallXZ`. O slider vai a ±6 m mas o valor EFETIVO sai
     em `CONFIG.ballXEffective`/`ballZEffective`, que são a fonte de verdade ÚNICA (regra herdada
     do `ballYEffective`: NINGUÉM deriva a posição do knob em cru).

     ⚠ REGRA 3 do handoff S10, outra vez: os corpos dos focos/chapéus/robots NÃO se mexem quando a
     bola anda pela sala — o que muda é a MIRA. Um pinspot montado em treliça não anda atrás da bola.
     A CLAREIRA do mikado, essa, SEGUE a bola (spec da F14). */
  ballPosXM: 0,                // knob 'bola: posição X (m)' — 0 = centro da sala
  ballPosZM: 0,                // knob 'bola: posição Z (m)' — 0 = centro da sala
  ballXEffective: 0,           // DERIVADO (já clampado) — publicado por ball.js, lido por mikado/main
  ballZEffective: 0,           // DERIVADO (já clampado) — idem

  /* ---- F11 — MIKADO DO TETO (v2/mikado.js) ----
     ~36 barras compridas e finas cruzadas em várias camadas, SÓ no miolo (dentro do retângulo dos
     pilares). Cada barra = tubo luminoso + perfil/calha metálica + terminais + 2 tirantes ao teto.
     Piscam TODAS JUNTAS (mode 0) ou ALTERNANDO BLOCOS (mode 1), sempre com a MESMA cor simultânea,
     em rajadas ("flashadas"). Cores: vermelho/branco/azul.
     TETO INVIOLÁVEL: `hz` ≤ 3 (regra da sala) — clampado no knob E no agendador (MIN_GAP_S).
     Triggers: tarola (snare) e drop do motor de música, por POLL de `window.MUSIC.state` (nenhuma
     linha de web/music.js muda). Sem motor, o modo autónomo (`autoPerMin`) mantém o mikado vivo. */
  mikado: {
    on: true,                  // knob 'mikado (0/1)'
    /* K1 (2026-09-01): tamanho do POOL de barras/blocos (mikado.js:88/:155 — meshes e materiais
       pré-alocados no arranque). ⟳ reload — o pool só se cria uma vez no build. Mesmo valor de
       hoje (MAX_BARS=112, MAX_BLOCKS=12), ficam como fallback em mikado.js. `densityPerM2` (abaixo)
       continua a ser quem decide QUANTAS barras estão ativas dentro do pool — nunca pode passar de
       `maxBars`; `blockSize` decide em quantos blocos se agrupam os flashes, nunca mais que
       `maxBlocks`. */
    maxBars: 112,               // knob 'mikado: máx barras' (⟳ reload)
    maxBlocks: 12,               // knob 'mikado: máx blocos' (⟳ reload)
    // ---- geometria (⟳ ao vivo via rebuild(), não exige reload) ----
    /* F12 §1: DENSIDADE em barras/m² da zona central (retângulo dos pilares menos a folga), em vez
       de uma contagem absoluta. Ao mexer na geometria da sala (vão/passo dos pilares) a malha
       escala sozinha e mantém a mesma leitura — era o pedido do David. Com a sala default o miolo
       dá ~49,3 m², logo 0,81 barras/m² = exatamente as 40 barras do default da F11 (nada muda visualmente para
       quem não tocar no knob). Teto físico: MAX_BARS (48) no mikado.js. */
    densityPerM2: 0.81,        // knob 'mikado: barras/m²'
    heightM: 4.0,              // knob 'mikado: altura (m)' — cota do CENTRO do mikado ao CHÃO (spec §3)
    spreadM: 0.85,             // knob 'mikado: espalha (m)' — banda de altura ocupada pelas camadas
    layers: 6,                 // knob 'mikado: camadas' — cotas distintas dentro da banda
    lenMinM: 3.5,              // knob 'mikado: barra min (m)'
    lenMaxM: 7.5,              // knob 'mikado: barra máx (m)'
    tubeDiaM: 0.07,            // knob 'mikado: Ø tubo (m)' — o perfil/terminais derivam daqui
    pitchDeg: 6,               // knob 'mikado: inclinação°' — pitch raso (nas fotos quase à mesma cota)
    axisBias: 0.35,            // knob 'mikado: viés eixo' — 0 = azimutes uniformes, 1 = tudo ao comprido
    insetM: 0.35,              // knob 'mikado: folga pilares (m)' — as pontas não roçam os pilares
    /* ---- F13 §1: MIKADO NA SALA TODA (toggle) ----
       0 (default) = modo da F11: só o MIOLO, dentro do retângulo dos pilares (spec §2 original —
           nada nos corredores; é o que as fotos do Lux mostram).
       1 = a SALA TODA, até `wallMarginM` das paredes. A área salta de ~49 m² para ~117 m² na sala
           nominal e a DENSIDADE (barras/m², F12 §1) faz a contagem acompanhar sozinha — não é
           preciso mexer em mais nenhum knob.
       INVARIANTES que se mantêm nos dois modos: a clareira da bola (`ballClearM` + raio), o clamp
       ao teto (`layout()`), e — novo — as barras nunca ATRAVESSAM os pilares: no modo sala toda a
       barra que cruza a planta de um pilar montado é REJEITADA (não encurtada; ver a decisão
       documentada em mikado.js). Regenera ao vivo (onMikadoGeomChanged), sem reload. */
    fullRoom: 0,               // knob 'mikado: sala toda (0/1)'
    wallMarginM: 1.0,          // knob 'mikado: folga paredes (m)' — só no modo sala toda (David: 1 m)
    ballClearM: 0.5,           // knob 'mikado: clareira bola (m)' — margem além do raio da bola (1 m)
    seed: 7,                   // knob 'mikado: semente' — disposição estável e reproduzível
    // ---- efeito/flashes ----
    idle: 0.12,                // knob 'mikado: repouso' — brilho contínuo do tubo (0 = mikado apagado)
    flashGain: 2.6,            // knob 'mikado: flash força'
    flashMs: 120,              // knob 'mikado: flash ms' — duração de cada flash
    hz: 2.4,                   // knob 'mikado: flash Hz' (TETO 3 — regra invariável da sala)
    burst: 2,                  // knob 'mikado: flashes/rajada'
    mode: 0,                   // knob 'mikado: modo (0=todas/1=blocos)'
    blockSize: 5,              // knob 'mikado: tam. bloco' (4-6 na spec)
    color: 0,                  // knob 'mikado: cor (0=rot)' — 0 rotação · 1 vermelho · 2 branco · 3 azul
    lightMul: 1.0,             // knob 'mikado: luz sala ×' — quanto o flash pinta a sala
    // ---- triggers musicais (spec §7) ----
    snareOn: true,             // knob 'mikado: tarola (0/1)'
    snareSens: 0.55,           // knob 'mikado: tarola sens.' — prob. de cada tarola disparar rajada
    dropOn: true,              // knob 'mikado: drop (0/1)'
    dropBurstMul: 2,           // knob 'mikado: drop rajada ×' — o drop faz uma rajada mais longa
    autoPerMin: 4,             // knob 'mikado: auto /min' — rajadas sem motor (0 = só com música)
  },

  /* ---- F15 — VULTOS: pessoas a dançar na pista (v2/crowd.js) ----
     Spec do David: "adicionar vultos na sala como se fossem pessoas a dançar", com diversidade
     (altura, cabelo, estatura física, género), menu próprio, densidade, luminosidade, opacidade,
     e um BOTÃO para a luz poder atravessar ou não os vultos (oclusão).
     Ver docs/f15-vultos.md para as decisões de desenho e o compromisso da oclusão.
     Silhuetas escuras low-poly (NUNCA bonecos: sem caras, sem detalhe que a penumbra não daria),
     sorteadas com RNG SEEDED — a multidão é estável entre reloads, senão não há como afinar.
     O MOTOR nunca liga/desliga vultos (`on` é knob do David); o estrelato pode, no máximo, modular
     a LUMINOSIDADE (`starGain()` em crowd.js). Nada aqui passa dos 3 Hz: o balanço é um ciclo por
     DOIS tempos, ou seja `bpm/120` Hz (1,45 Hz a 174 BPM). */
  crowd: {
    on: true,                    // knob 'vultos (0/1)' — SÓ o David
    /* K1 (2026-09-01): tamanho do POOL de vultos (crowd.js:85 — 8 meshes/pessoa pré-criadas no
       arranque, mais o Float32Array de oclusão dimensionado a partir daqui). ⟳ reload — o pool só
       se aloca uma vez, no build. Mesmo valor de hoje (MAX_PEOPLE=80), fica como fallback em
       crowd.js. `densityPerM2` (abaixo) continua a decidir quantas pessoas estão ativas dentro do
       pool — nunca pode passar de `maxPeople`. */
    maxPeople: 80,               // knob 'vultos: pool' (⟳ reload)
    densityPerM2: 0.30,          // knob 'vultos: densidade (p/m²)' — 0,30 × ~103 m² ≈ 31 pessoas
    lum: 1.0,                    // knob 'vultos: luminosidade' — quanto a luz da sala os revela
    opacity: 1.0,                // knob 'vultos: opacidade' — 1 = opacos (alpha do material)
    occlude: 1,                  // knob 'vultos: oclusão (0/1)' — 1 = a luz NÃO os atravessa
    occRadMul: 1.05,             // knob 'vultos: oclusão raio ×' — inflação do cilindro de oclusão
    seed: 11,                    // knob 'vultos: semente' — disposição estável e reproduzível
    // ---- diversidade (spec: altura, estatura física, género, cabelo) ----
    heightMidM: 1.72,            // knob 'vultos: altura média (m)'
    /* `heightVarM` 0,26 é o valor MEDIDO que dá a faixa da spec (1,50-1,95 m), não um palpite: a
       distribuição é TRIANGULAR (soma de duas uniformes), portanto raramente toca as caudas. Medido
       com 41 pessoas: 0,16 → 1,61-1,84 (curto de mais); 0,26 → 1,55-1,91; 0,30 → 1,52-1,94. Ficou
       0,26, e o clamp duro (1,42-2,02) apanha os raros extremos. */
    heightVarM: 0.26,            // knob 'vultos: altura variação (m)' — faixa medida ~1,55-1,91
    buildVar: 0.22,              // knob 'vultos: estatura variação' — magro ↔ corpulento
    // ---- colocação ----
    wallMarginM: 0.6,            // knob 'vultos: folga paredes (m)'
    ballClearM: 0.6,             // knob 'vultos: folga bola (m)' — além do raio; ninguém sob a bola
    minGapM: 0.55,               // knob 'vultos: espaço pessoal (m)' — eixo a eixo
    faceBias: 0.45,              // knob 'vultos: virados à bola' — 0 uniforme, 1 todos a olhar
    // ---- dança ----
    danceAmp: 1.0,               // knob 'vultos: dança amplitude' (0 = pista parada)
    autoBpm: 104,                // knob 'vultos: bpm sem motor' — ritmo próprio sem window.MUSIC
    // DERIVADOS (escritos por crowd.js, lidos por ball.js — ver §Oclusão em docs/f15-vultos.md):
    occ: null,                   // Float32Array plano [x, z, raio, yTop] por pessoa
    occN: 0,                     // quantas pessoas há na tabela acima (0 = oclusão desligada)
  },

  /* ---- F12 §5: ESTRELATO (v2/stardom.js) ----
     Em cada momento UMA peça conta a história (bola · mikado · chapéus) ou nenhuma (smooth), e as
     outras servem-na. A EXCLUSÃO MÚTUA mikado↔chapéus é estrutural: só há uma estrela de cada vez.
     As trocas acontecem em FRONTEIRAS MUSICAIS (transição de FSM, drop, fim de frase) — nunca a
     meio de nada. Ver o cabeçalho de stardom.js para o modelo completo.
     O motor NUNCA liga/desliga elementos: um elemento desligado no painel deixa de ser elegível e o
     peso dele redistribui-se pelos restantes. */
  stardom: {
    on: true,                  // knob 'estrelato (0/1)' — 0 devolve o spike ao comportamento da F11
    strength: 1.0,             // knob 'estrelato: força' (0 = inerte, 1 = perfil cheio)
    // VIÉS (spec §5: "knob para calibrar o viés de estrelato" — mais mikado / mais bola / mais chapéus)
    biasBall: 1.0,             // knob 'estrelato: viés bola'
    biasMikado: 1.0,           // knob 'estrelato: viés mikado'
    biasHats: 1.0,             // knob 'estrelato: viés chapéus'
    biasSmooth: 0.8,           // knob 'estrelato: viés smooth' (os vales que dão valor aos picos)
    noRepeat: 0.75,            // knob 'estrelato: não repetir' (1 = nunca a mesma peça 2× seguidas)
    holdBars: 8,               // knob 'estrelato: frase (compassos)' — troca no fim da frase
    rampSec: 0.6,              // knob 'estrelato: rampa s' — entrada/saída de cada peça
    autoSec: 12,               // knob 'estrelato: auto s' — cadência SEM motor de música
    // chapéus sob comando do estrelato
    hatsHz: 2.2,               // knob 'estrelato: chapéus Hz' (TETO 3 — regra invariável da sala)
    hatsGesture: 2,            // knob 'estrelato: chapéus gesto' (0=juntos · 1=sequência · 2=alterna)
    auxPerMin: 14,             // knob 'estrelato: chapéus aux /min' — apoio quando a BOLA é a estrela
  },
};
