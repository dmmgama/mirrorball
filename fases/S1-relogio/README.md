# S1 — Relógio único em `MUSIC.state` (W3, S14) · commit `ac2aa08`

## O que foi feito
- `web/music.js` §CLOCK: campos novos em `MUSIC.state`, todos finitos à nascença:
  `beatTick` / `barTick` / `phraseTick` (contadores monotónicos), `beatIdx` 0-3, `barIdx` 0-7,
  `clockConf` 0-1, `clockAgeMs`, `clockSrc` (`grid` = grelha de BPM, `kick` = bombo 4/4, `none`).
- Com grelha viva (`gridConf ≥ sync.gridMinConf`) os ticks vêm do tempo absoluto da grelha.
  Sem grelha, cada bombo é um tempo, 4 tempos um compasso, 8 compassos uma frase.
- `state.bar` deixa de congelar quando a grelha morre.
- Knobs no tuner `k` (secção Sync): `sync: compassos por frase` 8, `sync: conf. mín. da grelha` 0.30.
- HUD `m`: linha nova "relógio tempo x/4 compasso y/8 ticks b… c… f… conf … idade …ms src …".
- Harness: 4 asserções novas, 19/20 (a falha (c) já existia).

## O que verificar (bola 2D, música real a tocar, tecla `m`)
1. Linha "relógio" aparece no HUD e o `src` diz `grid` com música com bombo regular.
2. **O `tempo x/4` avança em cada bombo** e volta a 1 no downbeat. Se anda desfasado do bombo, anota
   quantos tempos (é o stop mais importante da sessão).
3. `compasso y/8` avança a cada 4 tempos; `f…` (phraseTick) sobe de 8 em 8 compassos.
4. Numa parte sem bombo (breakdown), `src` passa a `kick` ou `none` e a `idade` sobe; ao voltar o
   bombo, os ticks retomam sem saltar para trás.
5. Silêncio total: ticks param, nada de NaN no HUD.

Mau sinal: tempo a saltar 2 de cada vez, `conf` sempre 0 com música óbvia, `src=none` com bombo.
