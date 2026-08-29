'use strict';
/* Valores REAIS gravados pelo David em web/music-config.json (secção "ball"), 2026-08-29.
   Este ficheiro é uma CÓPIA — o spike nunca lê nem escreve no config do repo.
   Só existe para a comparação ser honesta: mesma cena, mesmos ângulos, mesmo haze. */
window.SPIKE_CFG = {
  // --- geometria da bola (igual à Canvas 2D) ---
  facetRows: 56,           // "espelhos: filas"
  seamInset: 0.12,         // "junta (seam)" — fração angular reservada à junta
  ballContrast: 1.2,       // "bola: contraste"
  ballLight: 0.0,          // "bola: luz"
  mirrorGain: 0.7,         // "espelhos: brilho"

  // --- pinspots: az/el REAIS gravados (graus). az=0 é a direção da câmara/público ---
  spotCount: 4,            // "focos: quantos"
  spotRadiusMul: 2.6,      // "focos: raio ×"
  spotEdge: 0.7,           // "focos: orla"
  spots: [
    { az:  78.585, el:  29.077 },  // spot0
    { az: -26.186, el:  15.121 },  // spot1
    { az:  69.633, el:  -3.630 },  // spot2
    { az: -58.461, el:  -4.083 },  // spot3
  ],
  spotBaseRadius: 0.16,    // raio-base do foco em raios da bola (CONFIG.spots[].radius)

  // --- névoa / feixes ---
  haze: 0.65,              // "haze máx (motor modula)"
  beamLen3D: 8.0,          // "feixes: compr. 3D" (em raios da bola)
  beamWidthDeg: 3.6,       // "feixes: largura°"
  beamSoft: 0.48,          // "feixes: dispersão"
  beamFraction: 1.0,       // "feixes: fração máx"
  beamIntensity: 0.16,     // teto inviolável da regra 6 (≤ 0.18)
  incidentAlpha: 0.1,      // "cone incidente"
  incidentLen: 3.2,        // "cone: alcance"
  halo: 0.0,               // "auréola" (o David tem a 0)

  // --- luz geral e indireta ---
  shade: { key: 0.7, az: 0, el: -20 },   // "luz geral (volume)" + az/el
  ambient: { intensity: 0.14, areaDeg: 19 }, // "luz indireta" + "indireta: área°"

  // --- sala / câmara (CONFIG do index-v2, não são knobs) ---
  room: { halfW: 5.2, ceil: 4.2, floor: -5.0, back: -7.0 },
  camDistance: 7.0,
  rotationRpm: 1.0,
  dotDensity: 2.0,         // "pontos na parede (densidade)"
  bgGrey: 7,
};
