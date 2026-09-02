# S3a — Chapéus com um só escritor, onda no relógio (S14) · commit `3794391`

## O que foi feito
- `spike-babylon/v2/hats.js` deixa de agendar nada sozinho quando o estrelato está ligado:
  o Poisson `flashPerMin` e o timer da onda `seqStepMs` ficam **abatidos**. Quem manda é
  `stardom.driveHats` nas arestas do relógio S1: acentos em `beatTick`, apoio em `barTick`.
- Modo manual (estrelato a 0): agendador local quantizado ao `beatTick`, senão múltiplo do
  `bpmEst`, senão cadência fixa. Nunca Poisson.
- `act` lido: no gesto `all` acende só uma fração 0.5-1 dos pares, do meio para as pontas.
- Getters: `MB2.hats.writer` (`estrelato`/`auto`/`manual`), `MB2.hats.clock`, `MB2.hats.lastGesture`.

## O que verificar (bola v3, música com bombo, HUD `h` + consola)
1. `MB2.hats.writer` na consola diz **`estrelato`** com música. Se diz `auto`, o estrelato não está
   a publicar `gain` (módulo falhou) — anota.
2. O chase ponta-a-ponta dos chapéus **bate com o bombo** (cada passo num tempo, não a flutuar).
3. Em GROOVE os chapéus estão vivos; em DROP cedem ao mikado. Se parecem mortos em BREAKDOWN é a
   tabela HERO do S2, não isto.
4. Estrelato desligado (painel): os chapéus continuam a flashar, agora pela cadência manual, mas
   ainda quantizados ao bombo.
5. `chapéus: luzes vivas máx` (teto 4) continua respeitado: nunca mais de 4 acesos.

Mau sinal: chase a correr a velocidade própria ignorando a música; nenhum flash em 30 s de GROOVE.
