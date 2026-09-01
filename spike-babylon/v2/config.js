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

     Largura (X) 10 m → halfW 5.0. Pé-direito 5,5 m: floor -3.5 (chão), ceil +2.0 → 5,5 m de altura.
     Comprimento (Z) 15 m: a sala é SIMÉTRICA em Z (room.js: roomD = |back|·2 e os planos chão/teto/
     laterais centram-se em z=0), portanto back -7.5 → 15 m com a bola exatamente ao meio.
     `roomWidthM/roomDepthM/roomHeightM` são os knobs do painel `d` (grupo Sala) — mudar exige reload. */
  room: { halfW: 5.0, ceil: 2.0, floor: -3.5, back: -7.5 },
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
  fixtureScale: 1.0,         // escala global do corpo (lata Ø0.12·isto, comprimento 0.18·isto) — knob 'corpos: escala'
  lensGain: 1.0,             // × intensidade do spot → emissiveColor da lente ("a lente segue o dimmer") — knob 'corpos: lente ×'
  fixtureStemOn: true,       // haste/yoke até ao teto/parede — knob 'corpos: haste (0/1)'

  // ---- Fase 8 (Sonnet, 2026-08-31): sala real do Lux Frágil — dimensões, pilares, wash azul,
  // chapéus de latão. Ver docs/f8-sala-lux.md. `roomWidthM/roomDepthM/roomHeightM` refletem
  // `CONFIG.room` em metros (knobs legíveis no painel `d`); mudar qualquer um exige RELOAD da página
  // (a sala/pilares/chapéus só se constroem uma vez no arranque — não há rebuild ao vivo da
  // geometria da sala, ao contrário de `espelhos: filas` que só reconstrói a BOLA). ----
  roomWidthM: 10.0,          // largura X da sala (m) — knob 'sala: largura (m)' (RELOAD)
  roomDepthM: 15.0,          // comprimento Z da sala (m) — knob 'sala: comprimento (m)' (RELOAD)
  roomHeightM: 5.5,          // pé-direito (m) — knob 'sala: pé-direito (m)' (RELOAD)

  colorOn: true,             // 'cor (0/1)' — knob geral: 1 = wash/chapéus/chão/pilares a cor real;
                             // 0 = tudo colapsa para luminância (grey = 0.2126r+0.7152g+0.0722b),
                             // via util core.toGrey() aplicada quando a cor é ESCRITA (atua ao vivo,
                             // sem rebuild). Default 1 (decisão do David 2026-08-31: cor é permitida,
                             // greyscale passa a TOGGLE — a bola/espelhos/feixes continuam sempre
                             // greyscale, regra 6 do CLAUDE.md; isto só afeta luzes/materiais da SALA).

  /* pilares (F8 autoritativo, David 2026-09-01): **6** = 2 filas × **3**, secção **0,5 × 0,5 m**,
     chão-teto. Doc: filas a 2,5 m das paredes laterais → doc_Y = 2,5 e 7,5 → Babylon X = ∓2.5
     (halfX 2.5); 5 m entre eixos → doc_X = 2,5 / 7,5 / 12,5 → Babylon Z = -5 / 0 / +5 (spacingZ 5,
     3 filas centradas em z=0 → o pilar do MEIO de cada fila fica ao nível da bola, como na planta). */
  pillars: {
    on: true, halfX: 2.5, section: 0.5, rows: 3, spacingZ: 5.0, albedo: [0.05, 0.05, 0.05],
  },
  floorWoodColor: [0.10, 0.075, 0.055], // tom de madeira escura do chão — knob 'sala: chão madeira' (RGB fixo, sem knob de cor individual; sujeito a colorOn)

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
    glow: 0.35,                // knob 'chapéus: brilho' (emissivo contínuo, dourado quente ~#d9a640)
    flashPerMin: 8,            // knob 'chapéus: flash /min' (0 = nunca; Poisson no CONJUNTO TODO, não por chapéu)
    heightM: 2.5,              // knob 'chapéus: altura (m)' — altura da BASE (boca) ao chão
    lineX: 4.0,                // |X| das 2 linhas (1 m de cada parede lateral, halfW 5.0)
    spacingZ: 2.5,             // passo entre chapéus ao longo de Z (15 m / 6 = 2,5 m)
    lampDiameter: 1.0,         // Ø da lâmpada/refletor (m)
    tiltDeg: 25,               // inclinação a apontar para dentro/baixo (para a pista)
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
    tiltDeg: 25,               // inclinação da vertical, a apontar para dentro (20-30°)
    coneDeg: 12,               // meia-abertura do cone (estreito, "beam" e não wash)
    dropM: 0.35,               // quanto o corpo desce do teto (lente fica a ≤0,5 m do teto)
  },
};
