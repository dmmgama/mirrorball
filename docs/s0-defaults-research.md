# S0 — o que o research diz sobre os 3 defaults (2026-09-01)

Lidos na íntegra: `research-lighting-pro.md`, `lighting-design-research.md`, `audit-sync-motor.md`,
`plan-s13-faseado.md` §1 S0. Fontes citadas re-verificadas por WebFetch/WebSearch nesta sessão:
Schiller PDF (lightingandsoundamerica.com/reprint/Busking.pdf), entrevista Tiefton
(bizarreculture.com/an-interview-with-tiefton/), docs SoundSwitch (enginedj.com/enginelighting,
support.soundswitch.com/.../phrase-editing).

**Resultado da verificação, à cabeça: nenhuma das três fontes citadas dá um número concreto
(ms, tempos, compassos) para blackout pré-drop ou cooldown de all-on/strobe.** O PDF do Schiller
fala de stacks/get-out-of-jail/repetição, não de timing. A entrevista ao Tiefton só confirma a
frase já citada em `research-lighting-pro.md:16` ("keep some part of the evening bright to get it
dark in the right moment") e o princípio de contraste súbito — sem números. Os docs SoundSwitch
confirmam phrase detection (Intro/Main/Bridge/drop/breakdown) e um blackout-por-silêncio a
**3 segundos de threshold** (não é o mesmo mecanismo: é "sem áudio → blackout", não "pré-drop
antecipado"). Os três números que os nossos docs locais já propõem (½ tempo, tabela hero×secção,
reserva) são **inferência do analista/Opus a partir dos princípios**, não citação literal das
fontes primárias — os próprios docs dizem isto (`research-lighting-pro.md:80-81`, `:9-10`).

---

## 1. Blackout pré-drop

**(i) Texto literal:**
- `research-lighting-pro.md:19-20`: "Técnica documentada: blackout de meio tempo antes do drop
  (kill, não fade-out)." — sem fonte inline nem valor em ms; não confirmado ao reler o PDF do
  Schiller ou a entrevista Tiefton (ver verificação acima).
- `research-lighting-pro.md:48`: linha da tabela "Blackout ½ tempo | off | off | off | paradas |
  off | —" — haze fica **off** também (contradiz a recomendação §4.3 "tudo menos haze"; ver
  inconsistência interna abaixo).
- `research-lighting-pro.md:81`: recomendação (não decisão): "Blackout pré-drop como gesto
  dedicado (~0,3-0,6 s, tudo menos haze)".
- `plan-s13-faseado.md:67`: repete "PRE_DROP → **blackout** ½ tempo (gesto novo, tudo menos haze)".

**Inconsistência a resolver no debate:** a tabela §2 do research (linha 48) diz que o haze também
apaga; a recomendação §4.3 e o plano dizem "tudo menos haze". São a mesma fonte a dizer coisas
diferentes — provavelmente a tabela trata "off" como "sem adição de haze fresco" (o haze físico já
no ar demora a dissipar, `lighting-design-research.md:14`: "Haze só é preciso para ver os feixes a
CAMINHO da bola" — não é instantâneo, então "off" pode só significar "não gerar mais").

**(ii) Inferência:**
- ½ tempo a 128 BPM = 60000/128/2 ≈ **234 ms**. O research não ancora o valor em nenhum BPM
  específico; é conversão minha do "½ tempo" genérico citado.
- 1 tempo a 128 BPM ≈ 469 ms. A recomendação §4.3 (0,3-0,6 s) cavalga entre ½ e ~1,3 tempo — é a
  faixa de segurança do analista, não um número medido.
- Quantos tempos antes do drop começa: **não documentado em lado nenhum**, nem nas fontes
  primárias nem nos docs locais. A prática de busking (Schiller) sugere que o cue dispara à mão, no
  momento sentido — não há contagem fixa de tempos de antecedência a citar.

**(iii) Default recomendado:**
- Duração: **300 ms** (dentro da faixa 0,3-0,6 s da recomendação §4.3, mais perto do "½ tempo" da
  tabela do que do "1 tempo").
- Haze: **mantém-se** (segue §4.3, não a tabela — porque fisicamente não desaparece em 300 ms de
  qualquer forma; resolve a inconsistência a favor da versão mais recente/citada duas vezes).
- Início: disparado no `beatTick` imediatamente anterior à aresta de `dropCount` prevista pela FSM
  (não há base para "N tempos antes" — dispara o mais tarde possível para não gastar reserva de
  escuridão cedo demais, coerente com regra 1 do research: escuridão é munição).
- Knob sugerido: `sync: blackoutMs` (range 100-800 ms) + `sync: blackoutKeepsHaze` (toggle,
  default true).

---

## 2. Bola no breakdown — protagonista (disco/pop) vs discreta (techno)

**(i) Texto literal:**
- `research-lighting-pro.md:51`: linha da tabela — "Breakdown calmo c/ vozes: Ball+pinspots =
  **candidata natural a protagonista** (assoc. clássica a momentos lentos/emotivos/vocais) ...
  Wash azul = protagonista c/ a ball: um tom sustentado."
- `research-lighting-pro.md:56-57`: nota de proveniência da própria tabela — **"Ball↔momentos
  lentos/vocais documentado em contexto disco/pop, não techno de residência (peça mais fraca, mas
  converge com Tiefton)."** Isto é o research a admitir explicitamente que a associação
  ball=breakdown vem de disco/pop, não do género do Lux Frágil.
- `lighting-design-research.md:10`: "O técnico trabalha o dimmer (100% no drop; corta/baixa um no
  breakdown)" — este é o dado mais próximo de uma fonte techno/club genérica (3+ fontes
  triangulado: ControlBooth, SHEHDS, mirror-balls.co.uk, BulbAmerica, Hollywood DJ), e diz o
  **oposto** do protagonismo: no breakdown a bola **baixa** (um pinspot), não sobe.
- `research-lighting-pro.md:84`: recomendação §4.5: "Ball ligada a energia lenta/sustentada, não a
  picos ... considerar deslocar a ATIVIDADE dos pinspots para breakdowns/momentos emotivos em vez
  de drops" — mas isto fala de onde os pinspots ficam **ativos** (aceso/rotação), não de
  "protagonista" com wash a acompanhar.
- `plan-s13-faseado.md:68`: já assume a decisão disco/pop como default proposto: "BREAKDOWN → bola
  + wash protagonistas, mikado reserva total".

**(ii) Inferência:**
- As duas fontes mais fortes discordam de género: a tabela do research (§2, disco/pop-flavored)
  recomenda ball+wash protagonistas no breakdown; o triangulado de 5 fontes sobre bolas de espelho
  especificamente (`lighting-design-research.md`) — mais genérico/clubbing, sem género musical
  explícito — sugere o oposto (bola desce no breakdown, sobe no drop).
- Tiefton (Berghain, techno de residência real) só corrobora o princípio de contraste
  claro-escuro, não a escolha bola-vs-mikado especificamente; `research-lighting-pro.md:56` já
  avisa que a convergência com Tiefton é fraca/indireta.
- Regra 2 do CLAUDE.md (RPM segue o bombo, nunca para com batida) já significa que a bola nunca
  fica totalmente "discreta" — o rpm mantém-se sempre que há sub/subOnset. A escolha real é sobre
  **spots/wash/atividade dos pinspots**, não sobre a bola parar.
- Lux Frágil é descrito no CLAUDE.md como referência de "técnico de luz competente" num clube —
  mais perto do registo Berghain/techno de residência do que disco/pop mainstream.

**(iii) Default recomendado:**
- **Default = (b) bola discreta** (só rpm no piso da regra 2, spots baixos/um pinspot, sem
  protagonismo de wash) — porque a fonte mais diretamente aplicável ao género (bola de espelhos em
  clubbing genérico, 5 fontes triangulado) diz que o dimmer desce no breakdown, e porque o próprio
  research assinala que a opção "protagonista" vem de um género diferente do Lux Frágil.
  Esta escolha também é a que já está mais alinhada com regra 2 do CLAUDE.md (não competir com o
  hero da secção) e com o erro nº2 do research (sem protagonista claro = pior, não melhor).
- **Gatilho para (a) protagonista:** knob de perfil, não deteção automática — não há sinal robusto
  no motor (vozes) para decidir isto ao vivo sem risco de falso positivo (o audit já mostra
  `act`/densidade não chega à sala). Sugerido: `sync: breakdownBallRole` com valores
  `"discreto"` (default) / `"protagonista"`, por perfil de música (`electronica` vs. um perfil
  "disco/pop" futuro) — decisão humana/config, não deteção.
- Knob sugerido: `sync: breakdownBallRole` (enum discreto/protagonista, default discreto);
  opcionalmente `sync: breakdownWashGain` (0-1, default baixo ~0.3) para quando protagonista=false.

---

## 3. Reserva do all-on (cooldown do mikado)

**(i) Texto literal:**
- `research-lighting-pro.md:24`: "Economia de efeitos — strobe como pontuação, não estado. Consenso
  forte; **uma fonte quantifica ~2× por set** (indicativo)." — não identifica qual fonte nem a
  duração do set; é o único número quantitativo em toda a pesquisa sobre frequência de strobe/
  all-on, e o próprio texto qualifica-o como "indicativo".
- `research-lighting-pro.md:50`: tabela, "Pico sustentado" — mikado: "rajadas curtas pontuadas,
  **nunca contínuo**" — qualitativo, sem número.
- `research-lighting-pro.md:78`: recomendação §4.2: "Reserva como estado ativo: tempo-desde-
  último-strobe/all-on a influenciar probabilidade/intensidade do próximo — operacionaliza o
  'guardar o all-on'." — mecanismo proposto, sem valor.
- `research-lighting-pro.md:86`: recomendação §4.6: "Disciplina de duração do mikado: além dos
  tetos atuais, limite de duração contígua de rajada + cool-down mínimo." — também sem número.
- Nenhum ficheiro (incluindo `audit-sync-motor.md`) apresenta um valor em compassos/frases/minutos.
  A verificação das fontes primárias (Schiller PDF, Tiefton, SoundSwitch) também não devolveu
  nenhum número de cooldown ao reler diretamente.

**(ii) Inferência:**
- "~2× por set" — se um set de techno/house de residência dura tipicamente 60-90 min, 2 all-on
  implica um espaçamento médio grande (30-45 min) — mas isto é para o **set inteiro**, não
  necessariamente aplicável a "all-on do drop" (que é mais frequente que "strobe como clímax
  absoluto"; a nossa FSM dispara all-on por-drop, potencialmente vários por música). Aplicar
  literalmente 30-45 min ao knob seria provavelmente longo demais para o vocabulário da FSM atual
  (drops acontecem a cada ~1-3 min em muitas faixas).
  Trato o "~2×/set" como teto para o **strobe máximo/pico absoluto**, não para todo all-on de drop.
- A frase de 8 compassos já é a unidade nativa do motor (`phraseTick`, `plan-s13-faseado.md:59`,
  `barIdx` 0-7). Um cooldown expresso em frases encaixa diretamente no relógio novo de S1, sem
  conversão.
- Regra 6 do CLAUDE.md (tetos invioláveis, nada > 3 Hz) já limita a intensidade instantânea; a
  reserva de que se fala aqui é sobre **frequência entre eventos**, complementar.

**(iii) Default recomendado:**
- **Cool-down mínimo do mikado (rajada normal/drop):** **2 frases (16 compassos)** entre rajadas
  consecutivas de intensidade máxima — suficiente para não repetir em drops consecutivos próximos
  mas sem esvaziar um set inteiro de mikado.
- **Reserva do all-on/strobe absoluto (o "hero total", regra 6 no limite):** **8 frases
  (64 compassos)**, aproximando a heurística "~2×/set" sem fixar a duração do set (se o set for
  curto, 8 frases ainda deixa espaço para 2-4 all-on; escala com o número de drops tocados, não
  com o relógio de parede).
- Ambos os números são **extrapolação minha**, não citação — sinalizado explicitamente porque não
  há fonte primária com valor numérico.
- Knobs sugeridos: `sync: mikadoCooldownPhrases` (default 2, range 1-8) e
  `sync: allOnCooldownPhrases` (default 8, range 2-16).

---

## Nota final sobre as fontes

Refazendo o fetch direto do Schiller PDF, da entrevista Tiefton e da doc SoundSwitch nesta sessão:
nenhuma contém os números que `research-lighting-pro.md` atribui a "técnica documentada" para o
blackout de meio tempo, nem qualquer cooldown numérico de strobe. A única citação verificável e
literal do Tiefton que sobrevive à releitura é "keep some part of the evening bright to get it dark
in the right moment" (paráfrase próxima da já citada em `research-lighting-pro.md:16`). O
SoundSwitch confirma phrase detection (Intro/Main/Bridge/drop/breakdown) e um blackout-por-silêncio
a 3 s de threshold — mecanismo distinto do gesto pré-drop antecipado que aqui se discute. Os três
defaults acima são, portanto, recomendações fundeadas nos princípios gerais bem confirmados
(escuridão como munição, strobe como pontuação, hierarquia hero, quantização por frase) mas com os
valores numéricos explicitamente marcados como inferência/extrapolação — cabe ao David decidir se
os aceita como ponto de partida ajustável por knob, como aliás já é o plano.
