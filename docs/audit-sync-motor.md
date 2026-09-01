# Auditoria — ligação sala ↔ motor de música (Opus, 2026-09-01)

Pedido do David: verificar as regras de sync com a música ("houve muitas alterações e agora a
qualidade não é muito grande, é muito aleatória"). **Só report — implementação depois de debate.**
Ler em conjunto com `docs/research-lighting-pro.md` (o que os profissionais fazem).

**Diagnóstico curto:** a sensação de "aleatório" não é um bug — é o desenho atual. As peças não
estão dessincronizadas entre si por acidente; **nunca foram sincronizadas de todo. Não há relógio
comum.**

## (a) Tabela peça × sinal

| Peça | Sinal consumido | Transformação | Onde |
|---|---|---|---|
| Bola — rpm | `out.rpm` (de `kickPresence`) | clamp 0-3 | music.js:2083 |
| Bola — haze | `out.haze` | × hazeMax, se `beamsMotor` | music.js:2087 |
| Bola — feixes | `out.beams`, `state.scene` | beamFraction/Intensity, se `beamsMotor` | music.js:2090-2093 |
| Bola — opacidade | `out.opacity`+`hatLevel`+`snareAccent` | se `opacityMotor` | music.js:2106-2108 |
| Bola — spots | `out.spot`, `dimGain` | setSpot por frame | music.js:2147 |
| Bola — peso global | `stardom.gain.ball` | spotGain ×= gb | main.js:1696-1699 |
| Mikado | `snareCount`/`dropCount` (deltas) | moeda `snareSens`; drop → rajada | mikado.js:671-694 |
| Mikado — repouso | `gain.mikado` | idle × (0.35+0.65·g) | mikado.js:774 |
| Chapéus | **nenhum sinal do motor** | Poisson próprio + onda `seqStepMs` | hats.js:505-523 |
| Chapéus — força | `gain.hats` | flashGain × starHats | hats.js:488-492 |
| Chapéus — gestos | fsm/bar/dropCount (via stardom) | pulse() | stardom.js:256-273 |
| Wash | `gain.wash` | × 3.4 × clamp(g,0.25,2) | main.js:632-652 |
| Vultos | `bpmEst`,`beatPhase`,`gridConf`,`kickFlash` | lerp circular à fase; bob no kick | crowd.js:645-726 |
| Estrelato | fsm, bar, dropCount | sorteio em fronteiras | stardom.js:213-241 |
| Robots | **nenhum** — estáticos | — | robots.js |
| Choreo (flash/retarget) | **nenhum** — relógios próprios | Poisson + dwell 4-12 s | choreo.js:96-121 |

## (b) Conflitos de donos

1. **`hats` tem DOIS escritores**: o Poisson/onda de hats.update corre sempre (ao vivo,
   flashMode=2: onda contínua a 22/min indiferente à música) e o estrelato injeta gestos por cima —
   dois gestos sobrepostos, o que a spec F12 §5 proibia.
2. **Mikado com dois disparadores**: rajadas Poisson autónomas (4/min) somadas a snare/drop — uma
   rajada autónoma num breakdown é indistinguível de uma musical.
3. **`E.spotGain` com 3 donos em série** (health → ballOn → estrelato); health cai a 0 em silêncio
   e o resultado não é atribuível.
4. **`C.spotFadeMix = 0` e `C.choreo.flashRate = 0` escritos incondicionalmente a 60 Hz**
   (music.js:2109-2110) — qualquer valor do painel é apagado 60×/s. Sem disjuntor.
5. **Disjuntores furados**: só `MB.explode` passa `fromMotor:true`; `MB.flash`/`retarget`/`strobe`
   chegam sem flag → `motorAllowed()` (main.js:1447-1454) devolve sempre true. A única guarda que
   funciona é `C.spotsMotor === false` em music.js:1615.

## (c) Dessincronias temporais — o problema central

**Nenhum módulo da sala lê `beatPhase`/`bpmEst`/`kickFlash`/`gridConf` — exceto crowd.js** (grep
completo). Bola, mikado, chapéus e wash não sabem onde está a batida. Existem **nove relógios
aleatórios independentes** (Poisson choreo, dwell retarget, Poisson chapéus, onda seq, Poisson
mikado, moeda snareSens, random do sorteio, jitter auxPerMin, fase por vulto) — nenhum quantizado
ao compasso. Um técnico dispara NA batida; aqui cada peça dispara quando o dado calha.
Dois rAF sem ordem garantida (music.js vs Babylon) + features a 50 Hz via message = `state` escrito
por dois relógios.

## (d) Campos consumidos

Todos os campos consumidos EXISTEM (lição F15 aplicada). Restam: `stardom.js:33` afirma ler `act`
mas **nunca o lê** (a regra 4 do CLAUDE.md — densidade→atividade — não chega a nenhuma peça da
sala); `crowd.js:666` lê `subAvg` que nasce null e é EMA lenta, não evento; **`state.bar` congela**
quando a grelha fica velha (>4 s) — e o estrelato depende dele para a fronteira de frase.

## (e) Regras do CLAUDE.md

- R1 skin ✅ · R6 tetos ✅ · R7 NaN ✅ · R8 docs ✅
- R2 rpm/bombo ⚠️ — `spinLock` só existe no perfil `electronica`; noutros perfis nada garante o
  piso 2.6 (medido rpm 0.06 em silêncio).
- R3 bombo por banda ✅ no motor, ❌ nenhuma peça da sala o recebe.
- R4 densidade→atividade ❌ — `act` não chega à sala.
- R5 gestos ⚠️ — existem no motor; a sala só responde via `FSM_TILT` (viés de sorteio, não gesto).

## (f) Porque soa aleatório — por impacto

1. **Zero sincronia rítmica**: nenhuma peça lê `beatPhase`; nove relógios independentes. Eventos ao
   lado da batida leem-se como ruído.
2. **Estrelato morre sem grelha**: 0 trocas em 60 s medido (motor presente, grelha ausente); o
   relógio autónomo é inalcançável (`if (!MS)` nunca é verdade com music.js carregado).
3. **29% dos drops não mudam nada** (medido, 400 drops): sorteio re-escolhe a mesma estrela; e
   `biasHats 2.65` dá 58% dos drops aos chapéus, 1,5% ao smooth.
4. **Duplo comando dos chapéus** (onda contínua + gestos do estrelato sobrepostos).
5. **Metade do motor está desligada pelo David** (`beamsMotor:false`, `opacityMotor:false`) — resta
   spots+rpm, modulados por 3 donos.

**Conclusão para o debate:** falta uma camada de QUANTIZAÇÃO — um relógio único derivado de
`beatPhase`/`bpmEst` a que todas as peças se agarrem, e uma hierarquia que decida QUEM toca em cada
batida, em vez de cada peça sortear sozinha. O estrelato resolveu "quem é a estrela"; ninguém
resolveu "quando". (Coincide com o erro nº4 do research: sync mecânico sem noção de secção/frase.)
