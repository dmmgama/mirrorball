# Research — como os profissionais ligam as luzes à música eletrónica (2026-09-01)

Pedido do David: pesquisar como LDs profissionais ligam bola/luz forte overhead/floods/moving heads
aos momentos da música (drops, partes intensas, breakdowns com vozes, secções percussivas). **Só
plano — implementação apenas depois de debate com o David.** Report do research-analyst, na íntegra.

Nota metodológica do analista: fontes web genéricas são sobretudo marketing de fabricantes —
tratadas como consenso indicativo quando repetidas entre fontes independentes. Peso mais forte:
testemunhos diretos de LDs (Tiefton, residente do Berghain; Brad Schiller na *Lighting & Sound
America*). Inferências assinaladas.

## 1. Princípios gerais dos profissionais

1. **Escuridão é a ferramenta principal** — "Darkness is a design element, not a failure". Pools de
   luz, sombras, profundidade; luz uniforme lê-se como sala de conferências. Tiefton (Berghain):
   manter parte da noite iluminada **precisamente para poder escurecer no momento certo** — a
   escuridão é **munição que se gasta**; sempre escuro ou sempre aceso mata o contraste.
2. **Contraste súbito > fade gradual** nos momentos que interessam. Tiefton: "Even me I still get
   goosebumps when you do big changes from one second to another." Técnica documentada: blackout de
   meio tempo antes do drop (kill, não fade-out).
3. **Hierarquia — um elemento "hero" de cada vez**, os outros a apoiar ("allow one fixture to be
   the star... the others should support it, rather than competing"). Erro amador clássico: tudo
   ligado no máximo desde o início — esgota o vocabulário visual em 30 s.
4. **Economia de efeitos — strobe como pontuação, não estado.** Consenso forte; uma fonte
   quantifica ~2× por *set* (indicativo). Fadiga visual/fotossensibilidade documentadas como razão
   adicional (segurança, não só estética).
5. **Camadas de controlo** (Schiller, "The Basics of Busking", LSA dez-2024): stacks por parâmetro
   (posição / cor / gobo-efeitos) + grupos por tipo ou zona — combinam-se ao vivo, variação sem
   reprogramar.
6. **"Get-out-of-jail-free"** (Schiller): cue de reset sempre disponível — desliga chases/efeitos,
   repõe base limpa entre secções, evita resíduo acumulado.
7. **Repetição intencional cria assinatura** (Schiller): repetir o mesmo look nas secções
   recorrentes comunica intenção, mesmo em busking improvisado — distingue "desenhado" de
   "aleatório".
8. **O LD lê a música por sensação treinada** (Tiefton: "I trust my experience and feelings to
   translate the music into lights") — qualquer lógica nossa é aproximação; não há fórmula única.

## 2. Momento musical × comportamento por tipo de luz

(mapeado para o nosso vocabulário; [inf] = inferência do analista)

| Momento | Ball+pinspots | Mikado (overhead strobe/blinder) | Chapéus (floods) | Robots (moving heads) | Wash azul | Haze |
|---|---|---|---|---|---|---|
| Intro/warm-up | rotação lenta, discreta ou off | **apagado** | apagados/baixos | movimento lento, largo | base | subtil |
| Groove estável/build lento | pode entrar; feixes nas paredes | apagado ou marcações raras | chase lento ponta-a-ponta | acelera gradual, sem strobe | mantém | constante |
| Build (tensão) | acelera OU reduz p/ preparar blackout | apagado, ou só últimos tempos | chase acelera, aperta p/ branco | sweeps fortes, convergem | mantém/aperta | alto |
| Pré-drop | corta | apagado | apagados | convergem/param | corte/quase-blackout | mantém (físico) |
| Blackout ½ tempo | off | off | off | paradas | off | — |
| **Drop/pico** | **cede o palco** (fundo) | **protagonista**: strobe/blinder máx, todas/blocos, branco duro ou vermelho | reforço sincronizado, coadjuvantes | all-on possível, beams largos | pode saturar (salto de cor, não fade) | alto |
| Pico sustentado | secundária | rajadas curtas pontuadas, **nunca contínuo** | flashes nas marcações fortes | rápido, variado, sem saturar tudo | mantém | alto |
| **Breakdown calmo c/ vozes** | **candidata natural a protagonista** (assoc. clássica a momentos lentos/emotivos/vocais) | apagado — **reserva total** | wash único sem chase, ou off | movimento mínimo, wash largo | protagonista c/ a ball: um tom sustentado | discreto |
| Muitas marcações/percussão | flashes curtos rítmicos possíveis | marcações pontuais por blocos | **protagonista natural**: chases ponta-a-ponta nas marcações | chases de posição | base estável | mantém |
| Outro/fade | rotação lenta | apagado | fade, sem chase | largo e lento | escurece gradual | reduz |

Evidência: build/drop/breakdown/outro e "narrow+accelerate → release" = o mais bem documentado.
Ball↔momentos lentos/vocais documentado em contexto disco/pop, não techno de residência (peça mais
fraca, mas converge com Tiefton). Chapéus como "percussão visual" = [inf] a partir dos chases de
Schiller aplicados à geometria dos corredores.

## 3. Erros típicos dos sistemas automáticos ("parece aleatório")

1. Tudo ligado ao máximo desde o início → sem hierarquia possível nem reserva.
2. **Sem protagonista** — elementos chamativos em competição; o olho não assenta.
3. Strobe/efeito de pico como estado permanente → queima o drop (alinha com a regra 6 do CLAUDE.md,
   que afinal coincide com a prática profissional).
4. **Sync mecânico ao beatgrid sem noção de secção/frase** — tecnicamente no beat, mas
   dessincronizado da NARRATIVA (chase de percussão a correr durante um breakdown vocal). É o que
   o SoundSwitch resolve com phrase detection. Provavelmente a maior fonte da "aleatoriedade".
5. **Sem reset entre secções** — efeitos "vazam" da secção anterior (falta o get-out-of-jail cue).
6. **Sem repetição/assinatura** — cada drop tratado de forma totalmente diferente lê-se como acaso.
7. Paletas/lógicas de cor misturadas em simultâneo sem fio condutor [extrapolação].

## 4. Recomendações para debate (proposta, ZERO implementação)

1. **Hero explícito por secção** na máquina de estados: breakdown vocal → ball+wash; groove
   percussivo → chapéus+robots; drop → mikado; os outros em modo apoio. (Nota: o stardom.js da F12
   já tem estrelato/exclusão — o debate é alinhar os papéis com esta tabela e com a FSM.)
2. **Reserva como estado ativo**: tempo-desde-último-strobe/all-on a influenciar
   probabilidade/intensidade do próximo — operacionaliza o "guardar o all-on".
3. **Blackout pré-drop como gesto dedicado** (~0,3-0,6 s, tudo menos haze) — decidir se é o
   "freeze" existente com contexto novo ou gesto distinto.
4. **Memória de assinatura**: repetir aproximadamente o look da última secção do mesmo tipo, com
   variação controlada.
5. **Ball ligada a energia lenta/sustentada, não a picos**: manter RPM no bombo (regra 2), mas
   considerar deslocar a ATIVIDADE dos pinspots para breakdowns/momentos emotivos em vez de drops.
6. **Disciplina de duração do mikado**: além dos tetos atuais, limite de duração contígua de
   rajada + cool-down mínimo.
7. **Chapéus = narrador rítmico** (hat/densidade → chases direcionais); mikado = impacto
   (sub+subOnset) — separar "percussão" de "pontuação".

## Fontes

Brad Schiller, "The Basics of Busking", Lighting & Sound America dez-2024
(lightingandsoundamerica.com/reprint/Busking.pdf) · Entrevista Tiefton (Berghain), bizarreculture.com
· ControlBooth thread 37379 (busking grandMA) · topprosound.com (técnicas nightclub 2025) ·
metalplanetmusic.com ("Why Your Live Show Looks Flat") · enginedj.com/enginelighting +
djtechtools.com 2016 (SoundSwitch) · vice.com (história da disco ball) · mirror-balls.co.uk ·
atmosferamag.it (Berghain/Panorama Bar) · uking-online.com + 4wall.com (haze) · ducklights.com (EDM
programming) · vorlane.com · jc-lights.com · betopperdj.com · upluslighting.com (strobes/segurança)
· roomfortuesday.com (hero fixture, por analogia). Sem sucesso: r/lightingdesign, Lightnetwork,
entrevistas técnicas de LDs do Lux/fabric (só Berghain teve testemunho direto).
