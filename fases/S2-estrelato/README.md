# S2 — Hero por secção + reserva no estrelato (W4, S14) · commits `7469713`, `24d323f`

## O que foi feito
- `spike-babylon/v2/stardom.js`: tabela HERO × FSM substitui o `FSM_TILT`:
  GROOVE → chapéus · BUILD → chapéus (mikado em reserva) · PRE_DROP → segura a estrela do build,
  publica `gain.preDrop=1` · DROP → mikado + `all` (all-on) se a reserva estiver pronta ·
  BREAKDOWN → bola discreta (default) ou bola+wash protagonista (knob) · OUTRO → fade.
- Trocas de estrela **só em fronteira de compasso/frase** (`barTick`/`phraseTick`); DROP troca já.
- Reserva do all-on como estado: peso 0 até passarem N frases desde o último all-on.
- `act` (densidade espectral) entra no sorteio e na cadência dos chapéus.
- Knobs no tuner `k` (Sync): `sync: all-on reserva (frases)` 8, `sync: breakdown bola protagonista (0/1)` 0,
  `sync: breakdown wash` 0.3.
- Getters: `MB2.stardom.fsm / pending / clock / reserve` (consola F12).

## O que verificar (bola v3, música com secções claras, HUD `h`)
1. Linha "estrela" do HUD: as trocas acontecem **no início de um compasso**, não a meio.
2. GROOVE: chapéus são o protagonista, bola discreta. BUILD: chapéus continuam, mikado calado.
3. DROP: mikado protagonista. O all-on **não** acontece em todos os drops: só depois de 8 frases
   desde o último. Na consola `MB2.stardom.reserve` mostra o estado.
4. BREAKDOWN: bola só rpm ao bombo, spots baixos, wash a 0.3. Muda o knob
   `sync: breakdown bola protagonista` para 1 e vê a leitura disco/pop.
5. Antes de julgar os chapéus: no painel `d`, "repor knobs" do estrelato — o teu `mb2.knobs` ainda
   tem `biasHats` 2.65, que distorce a tabela.

Mau sinal: estrela a trocar a meio do compasso, all-on em drops seguidos, chapéus "mortos" em GROOVE.
