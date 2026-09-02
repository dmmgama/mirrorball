# S4 — Blackout pré-drop, gesto novo (S14) · commit `7cd71d7`

## O que foi feito
- Gesto `blackout` no motor (`web/music.js` §BLACKOUT): spots 0, feixes 0, opacidade ao mínimo,
  **haze fica** (`sync: blackout mantém haze (0/1)` 1). rpm **não** pára (regra 2). Entrada súbita
  no próprio frame, saída por rampa de 1,2 s que o `all-on` do drop atropela.
- Dispara **uma vez por drop**, só em PRE_DROP e perfil `electronica`: com grelha confiante, no último
  tempo antes da fronteira de frase (= o `beatTick` antes do drop previsto); com relógio degradado, no
  primeiro `beatTick` depois de entrar em PRE_DROP. Se o drop chega antes, não há blackout (zero é
  permitido, dois não). Um PRE_DROP falso (sai para BUILD) rearma uma frase depois.
- Durante o gesto: `fireFlash`/`fireStrobe` não disparam; estrelato põe `gain.ball/mikado/hats/wash`
  a 0 sem rampa, `gain.preDrop` continua 1. Getter `MB2.stardom.blackout`.
- Knobs (tuner `k`, Sync): `sync: blackout ms` 300 (100-800), `sync: blackout mantém haze (0/1)` 1.
- HUD `m` (2D): `gesto blackout` + contador `blackouts N`. Harness 22/23 (+3 asserções).

## O que verificar (bola v3 e 2D, techno com builds claros, HUD `h`/`m`)
1. Num build → drop: **tudo apaga ~300 ms antes do drop** e o drop entra com all-on/mikado. O haze
   continua visível no escuro. A bola continua a girar.
2. HUD `m` na 2D: `blackouts` sobe 1 por drop, nunca 2 no mesmo build.
3. Timing: a 126 bpm o tempo dura 476 ms; com 300 ms o escuro acaba ~170 ms antes do bang. Se
   quiseres escuro até ao bang, `sync: blackout ms` ≈ 470. Anota o que soa a "técnico competente".
4. Em GROOVE/BREAKDOWN **nunca** há blackout.
5. `sync: blackout mantém haze` 0: apaga mesmo tudo — compara.
6. Risco: se algo na sala v3 continuar aceso durante o blackout (chapéus, robots, mikado), anota qual —
   é um leitor que não passa pelo estrelato.

Decisão tua: duração final e se faz falta um knob `antecedência (tempos)`.
