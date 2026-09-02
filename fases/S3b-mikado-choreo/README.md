# S3b — Mikado, choreo e robots no relógio, sem Poisson (S14) · commit `f66fed3`

## O que foi feito
- `mikado.js`: tarola e drop já não disparam por si — marcam pendente e a **aresta de `beatTick`**
  consome. Acento com divisor por `snareSens` × `act` × `gain.mikado` (1-8 tempos). A moeda
  `Math.random() < snareSens` saiu. Drop: rajada **máxima** só se passaram N frases desde a última
  (`sync: mikado cool-down (frases)` 2); em cool-down o drop vale como acento normal. Comprimento
  da rajada limitado por `sync: mikado rajada máx (tempos)` 4 (a 128 bpm ≈ 4 flashes; antes ia a 12).
- Modo blocos: bloco de arranque sorteado em `barTick`, depois sequencial. Modo autónomo
  (`mikado: auto /min`) quantizado ao `beatTick`, sem Poisson.
- PointLights do mikado: ficam a I=0 durante 2 s antes de `setEnabled(false)` (fim dos toggles por
  rajada que recompilavam shaders, ver V0b). `robots.js` idem quando o dimmer cruza 0,005.
- `choreo.js`: flashes em arestas de `beatTick`; retarget conta compassos (`barTick`) e salta na aresta.
- Getters: `MB2.mikado.writer / clock / lastBurst / cooldownLeft`, `MB2.choreo.clock`.
- Relógios abatidos até aqui: 7 dos 9 do audit. Ficam de propósito: sorteio (escolhe o quê) e fase por vulto.

## O que verificar (bola v3, música com tarola e drops, HUD `h`, consola)
1. `MB2.mikado.writer` = `estrelato`, `MB2.mikado.clock` = `beatTick` com música.
2. As rajadas do mikado **caem no tempo** (nunca a meio de um tempo). Em GROOVE são raras (gain 0.12
   → divisor 8); se parecer morto, sobe `mikado: auto /min` ou é a tabela HERO do S2.
3. Primeiro drop: rajada máxima (4 flashes). Drop seguinte dentro de 2 frases: só acento. Consola
   `MB2.mikado.lastBurst` diz `max: true/false` e `cooldownLeft` as frases que faltam.
4. Se quiseres o drop mais longo: `sync: mikado rajada máx (tempos)` 8 (= 2 compassos).
5. Robots: ao apagarem não há "pop" de luz; `MB2.__perf().dLightToggles` continua baixo com rajadas.
6. Vultos (choreo): a pose muda só em fronteira de compasso, nunca antes de 1 compasso.

Mau sinal: rajada a flutuar fora do tempo; all drops iguais; `dLightToggles` a subir por rajada.
