# K2b — Ligar knobs que já existiam + rampas no tuner (S14) · commit `a4f79bf`

## O que foi feito
- **Bug**: `stardom.js` tinha `PHRASE_BARS = 8` fixo, ignorando o knob `sync: compassos por frase`.
  Agora lê o knob (6 sítios). Semântica igual à do relógio S1 (`phraseTick` sobe a cada N compassos).
- `CLOCK_DEAD_S = 1.5` repetido em 4 ficheiros → um knob `sync: relógio morto (s)` 1.5 (0.5-5);
  stardom/mikado/hats/choreo leem-no por poll com fallback 1.5.
- Rampas dos gestos e ataque/regresso do blackout ganharam slider no tuner `k`:
  `gesto: rampa de entrada (s)` 0.8, `gesto: rampa de saída (s)` 1.2 (secção nova "Gestos (rampas)"),
  `sync: blackout ataque (s)` 0.04, `sync: blackout regresso (s)` 0.04. Defaults inalterados.
- `docs/k2-contrato.md` marcado; diagrama do `mapa-frentes.md` §1 corrigido (chapéus ← estrelato ← relógio).
- Harness 22/23, presets 45/45.

## O que verificar (bola v3, tuner `k`)
1. `sync: compassos por frase` 8 → 4: as trocas de estrela e a reserva do all-on passam a contar em
   frases de 4 compassos (all-on mais frequente). Volta a 8.
2. `sync: relógio morto (s)`: a 0.5, numa pausa sem bombo os chapéus/mikado caem para a cadência
   própria quase logo; a 5, aguentam a última grelha. Deixa em 1.5.
3. `gesto: rampa de saída` 1.2 → 0.3: os gestos (freeze, ghost…) saem mais seco. Sensação tua.
4. `sync: blackout ataque` 0.04 → 0.2: o blackout deixa de ser um corte e passa a fade. Compara.
5. Tuner `k` grava tudo isto em `music-config.json` como os outros (o ficheiro é teu, não se commita).
