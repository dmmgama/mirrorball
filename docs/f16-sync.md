# F16 — Sync da sala: decisões do debate S0 (2026-09-01, S13)

Fecha o debate pedido no handoff S11/S12. Proposta base: `plan-s13-faseado.md` §1 S0. Entradas:
`audit-sync-motor.md`, `research-lighting-pro.md` §4. Implementação nas fases S1-S4 (Opus).

## 1. Decisões do David (fechadas)

| # | Tema | Decisão |
|---|---|---|
| 1 | Relógio único | Aceite como proposto: contadores monotónicos `beatTick`/`barTick`/`phraseTick` + `beatIdx`/`barIdx`/`clockConf`/`clockAgeMs` em `MUSIC.state`; degradação para `kickFlash` 4/4 sem grelha; nada se renomeia. |
| 2 | Quantização | Aceite: random escolhe **o quê**, o relógio decide **quando**. Lentos em `barTick`/`phraseTick`, acentos em `beatTick`. |
| 3 | Hero por secção | Aceite a tabela hero×FSM (GROOVE chapéus · BUILD chapéus/robots · PRE_DROP blackout · DROP mikado · BREAKDOWN bola+wash · OUTRO fade), com a variante do ponto 5. |
| 4 | **Blackout pré-drop** | **Gesto novo** (não é o `freeze` com contexto). Tudo apaga menos haze. Duração e antecedência com knob — default vindo do research (§2). |
| 5 | **Bola no breakdown** | **As duas opções existem**: (a) bola+wash protagonistas (leitura disco/pop), (b) bola discreta só rpm ao bombo (techno). Seleção por knob; default vindo do research (§2). |
| 6 | **Reserva do all-on** | Knob (compassos/frases entre all-on); default vindo do research (§2). |
| 7 | Um escritor por peça | Aceite: chapéus sem onda autónoma; mikado sem Poisson. |
| 8 | `act` chega à sala | Aceite. |
| 9 | Relógios a abater | Os 8 da proposta; fase por vulto fica aleatória de propósito. |
| 10 | Housekeeping | `fromMotor` completo, disjuntor em `spotFadeMix`/`flashRate`, `spotGain` um dono — S3c. |

Regra transversal (K2): todo o valor novo destes pontos é knob (`MUSIC` → `music-config.json` se
for do motor; `config.js` → `knobs-default.json` se for da sala). Nunca constante.

## 2. Defaults vindos do research — preenchido a partir de `s0-defaults-research.md`

Verificação do agente: **nenhuma fonte primária dá números** (Schiller, Tiefton, SoundSwitch
re-lidos). Os valores abaixo são inferência fundeada nos princípios (escuridão é munição, strobe é
pontuação, hierarquia hero, quantização por frase). São pontos de partida; o knob é que manda.

| Decisão | Default | Base | Knob |
|---|---|---|---|
| Blackout: duração | **300 ms** | faixa 0,3-0,6 s do research §4.3; ½ tempo a 128 BPM = 234 ms | `sync: blackout ms` 100-800 |
| Blackout: haze | **mantém-se** | resolve a inconsistência interna do research (tabela vs §4.3) a favor de §4.3; haze físico não dissipa em 300 ms | `sync: blackout mantém haze` 0/1 |
| Blackout: início | `beatTick` imediatamente antes do drop previsto pela FSM | ninguém documenta "N tempos antes"; disparar o mais tarde possível gasta menos escuridão | (sem knob por agora; S4 pode acrescentar `sync: blackout antecedência (tempos)`) |
| Bola no breakdown | **(b) discreta** (rpm ao bombo, spots baixos, sem wash protagonista) | fonte mais próxima do género (clubbing, 5 fontes) diz que o dimmer desce no breakdown; a opção (a) vem de disco/pop, o research admite-o | `sync: breakdown bola protagonista` 0/1 (default 0); `sync: breakdown wash` 0-1 (default ~0,3) |
| Gatilho de (a) | manual/perfil, nunca deteção automática de vozes | não há sinal robusto no motor | por perfil (`electronica` = discreta) |
| Cool-down mikado | **2 frases (16 compassos)** entre rajadas máximas | extrapolação; frase de 8 compassos é a unidade do relógio S1 | `sync: mikado cool-down (frases)` 1-8 |
| Reserva all-on/strobe máx | **8 frases (64 compassos)** | aproxima "~2× por set" (único número da pesquisa, indicativo) sem fixar duração do set | `sync: all-on reserva (frases)` 2-16 |

## 3. Knobs novos previstos (nomes provisórios — seguir a convenção do `tuner` em S1/S2)

| Knob | Onde | Default | Fase |
|---|---|---|---|
| `sync: blackout ms` | `MUSIC` | 300 | S4 |
| `sync: blackout mantém haze` | `MUSIC` | 1 | S4 |
| `sync: breakdown bola protagonista` | `MUSIC` | 0 | S2 |
| `sync: breakdown wash` | `MUSIC` | 0,3 | S2 |
| `sync: mikado cool-down (frases)` | `MUSIC` | 2 | S3b |
| `sync: all-on reserva (frases)` | `MUSIC` | 8 | S2 |
| `sync: mikado rajada máx (tempos)` | `MUSIC` | a fixar em S3b (teto 3 Hz mantém-se) | S3b |

Detalhe e proveniência de cada default: `docs/s0-defaults-research.md`.

## 4. S4 implementado (S14, 2026-09-02) — gesto `blackout`

Ficheiros: `web/music.js` (§BLACKOUT + gesto `blackout` em `GESTURES` + knobs `sync.blackoutMs` /
`sync.blackoutKeepHaze` no §TUNE), `spike-babylon/v2/stardom.js` (consome o gesto), harness (r,s,t).

| Decisão | Como ficou no código |
|---|---|
| Gesto novo, não é `freeze` | `GESTURES.blackout`: `spot` 0, `beamInt` 0, `beams` 0, `opacity` → `outMin.opacity` (0). **Não toca no rpm** (regra 2, `spinLock` manda). Haze fica se `blackoutKeepHaze` ≥ 0.5 (default 1); senão → `outMin.haze`. |
| Súbito | `startGesture(..., { ms, instant: true })`: peso do gesto = 1 no próprio frame (sem `rampInSec`); taus do gesto 40 ms **absolutos** (a rampa de posse `slow` e a atividade não os esticam). Saída: `rampOutSec` 1.2 s ou o `all-on` do drop atropela-o (peso já a 1 → o drop entra seco). |
| Quando | `updateBlackout()` depois da FSM, antes do peso do gesto. Só em PRE_DROP e perfil `electronica`. Relógio com grelha e `clockConf ≥ sync.gridMinConf`: dispara quando faltam **≤ 1 tempo** para a fronteira de frase (`barsToPhraseEnd()·beatsPerBar`) = o `beatTick` antes do drop previsto. Relógio degradado: no primeiro `beatTick` depois de entrar em PRE_DROP. |
| Um por drop | `blackoutAtDrop` guarda o `dropCount`; enquanto não houver drop novo não dispara. Exceção: PRE_DROP que sai **sem** drop (timeout → BUILD) rearma **uma frase do relógio** depois (`blackoutRearmPhrase`), para o falso pré-drop não roubar o blackout do drop a sério. Drop que chega antes do último tempo → sem blackout (zero é permitido). |
| Tudo apaga | `fireFlash`/`fireStrobe` devolvem sem disparar durante o gesto; o acento da tarola na opacidade (`snare.opacityKick`) não entra. No estrelato: `gain.ball/mikado/hats/wash = 0` sem rampa enquanto `MS.gest.name === 'blackout'`, `driveHats` cala-se, `gain.preDrop` continua 1. `stardom.blackout` (getter) para HUD/consola. |
| Teto | `blackoutMs` clamp 100-800 no disparo, independentemente do knob. |

Knobs (§TUNE «Sync», tuner `k`): `sync: blackout ms` 300 (100-800, passo 10) · `sync: blackout mantém haze (0/1)` 1.
HUD `m`: linha `gesto` mostra `blackout` como os outros e `blackouts N` no total; o log de eventos regista
`gesto blackout · 0.3s · pré-drop (último tempo|bombo)`.

Harness (`node web/test-music-f2.js`, 22/23 — a (c) já falhava): (r) ≥ 1 no set de 10 min, nunca dois no
mesmo PRE_DROP; (s) duração ≤ knob e, no último frame, feixes/spots/opacidade ≈ 0, haze > 0.1, rpm ≥ 1.2;
(t) só em PRE_DROP. No sim: 3-4 blackouts de 288 ms, feixes 0.000, spot 0.00, op 0.00, haze 0.96.

**Nota de timing** (por ver ao vivo): a 126 BPM o último tempo dura 476 ms; com 300 ms o blackout acaba
~170 ms antes da fronteira e a saída começa a subir (1.2 s de rampa) quando o drop bate. Se o David quiser
escuro até ao bang, `sync: blackout ms` ≈ duração de um tempo (470 a 126 BPM). Alternativa por decidir:
`sync: blackout antecedência (tempos)` (§2) — não implementada.
