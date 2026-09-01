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
