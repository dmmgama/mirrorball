# F8 — Sala real: dimensões e luzes do Lux Frágil (fixado com o David, 2026-08-31)

Fontes: fotos lux2–lux12 + Lux1/Lux13/Lux-Top1/Lux-wall1-3/Lux-ball1 (Downloads), frames do
stream "Wish You Were Here" (sala vazia), Google Maps 3D com retângulo desenhado pelo David,
OSM way 96497162 (edifício: ~1.112 m², 8,5 m de altura), memória física do David (tocou na bola
a saltar com ajuda). Pesquisa web (Sonnet): **não existem dimensões públicas** do Lux — estes
números são a melhor estimativa e ficam todos em knobs (grupo "Sala").

## Dimensões AUTORITATIVAS (David, 2026-09-01 — inferência dele com base em vários elementos; substitui a tabela antiga)

Referencial: canto da sala = (0,0); X ao longo do comprimento (15 m), Y ao longo da largura (10 m).

| Parâmetro | Valor |
|---|---|
| Planta | **15 × 11 m** (era 15×10; David alargou +1 m em 2026-09-01 ao subir o vão entre filas de pilares para 6 m, corredores mantidos) |
| Pé-direito | **5,5 m** |
| Pilares | **6** (2 filas × 3), secção **~0,5 × 0,5 m**: a 2,5 m das paredes laterais → filas Y=2,5 e Y=8,5; **6 m entre filas** (era 5; +1 m David 2026-09-01), 5 m entre eixos na fila → X = 2,5 / 7,5 / 12,5 |
| Bola | ao **centro** (7,5, 5,0); Ø 2,0 m; centro a 3,5 m do piso (fundo a 2,5 m) |
| Chapéus | pendurados no **teto**; lâmpada **Ø 1,0 m**; **6 por corredor lateral** (12 total), igualmente espaçados, **1 m da parede** (linhas Y=1 e Y=9), **base a 2,5 m** de altura → X ≈ 1,25 / 3,75 / 6,25 / 8,75 / 11,25 / 13,75 |
| Forma do chapéu (David, 2026-09-01) | **meia esfera** cujo corte é um **vidro**; por dentro do vidro há uma **superfície côncava de raio ligeiro virada para dentro — é essa o foco/lâmpada**. O chapéu fica por cima e a luz **sai para a frente da semiesfera** (pelo vidro), não são óvulos/lóbulos a sair para fora do chapéu. |
| Chapéu — detalhes (David, 2026-09-01, ref. lux-chapeu1.webp) | Falta a **pala**: aba curva de metal que continua a casca sobre a parte de cima da boca (como pala de boné sobre o vidro). Tem um **aro** (arco/anel de suspensão por cima da cúpula, onde pega a haste). **Inclinação menor** do que os 25° implementados (boca quase na horizontal-baixa, ~10–20°). |
| Focos que incidem na bola | **H = 3,5 m** (à altura do equador — incidência horizontal) |
| Rig adicional | **robots no teto** (lente a ≤ 0,5 m do teto, ~5,0–5,2 m) a iluminar a **pista** |

Mapa (planta, 15×10):

```
Y=10 ┌───────────────────────────────┐
Y=9  │ ○   ○   ○   ○   ○   ○         │  ○ = chapéu (base 2,5 m, Ø 1 m)
Y=7,5│    ▪P        ▪P        ▪P     │  ▪P = pilar (fila Y=7,5)
     │                               │
Y=5  │              ◉ BOLA (7,5, 5)  │  ◉ = bola Ø 2 m, centro a 3,5 m
     │                               │
Y=2,5│    ▪P        ▪P        ▪P     │  ▪P = pilar (fila Y=2,5)
Y=2  │       ×David(3,2)             │
Y=1  │ ○   ○   ○   ○   ○   ○         │
Y=0  └───────────────────────────────┘
     X=0  2,5   5   7,5  10  12,5  15
```

### O que os screenshots de 2026-09-01 confirmam/acrescentam (David no corredor, ~(3,2), 1,76 m)

- **Robots no teto confirmados**: fixtures LED multi-lente (tipo wash/beam compacto) montados praticamente
  À FACE do teto, aos pares dos dois lados da bola, a projetar cones estreitos (vermelho nas fotos) para
  a pista, inclinados para dentro ~20–30° da vertical (010406, 010437, 010531).
- **Feixe horizontal a rasar a bola**: um beam branco-azul cruza a sala à altura do equador da bola
  (H≈3,5 m) e risca-a de lado (010246, 010356, 010406) — confirma "focos que incidem na bola a H=3,5 m",
  fonte lateral fixa (parede/pilar), não de cima.
- **Corrente curta**: no 010406 a corrente da bola até à estrutura do teto parece 0,5–1,0 m — coerente
  com teto 5,5 m e topo da bola a 4,5 m.
- **Chapéus como floods largos**: acesos, os chapéus atiram cones suaves quentes e largos para baixo
  (010711 mostra a fila do corredor); apagados ficam discos escuros pendurados. Base ~2,5 m bate certo
  contra as cabeças (~1,7–1,8 m).
- **2 pin-spots vermelhos pequenos junto ao topo da bola** (005524): incidências estreitas de muito
  perto/cima — existem, mas discretas.
- **Ambiente**: paredes escuras, teto técnico preto com condutas; sinais de saída (marcador de escala a
  ~2,2 m); painel axadrezado decorativo na parede direita; haze denso sempre presente (os cones só se
  leem por causa dele).

## Dimensões (CONFIG em metros)

| Parâmetro | Valor | Base |
|---|---|---|
| Sala principal (pista, piso de baixo) | **~19–20 × 10 m** | retângulo do David no Maps vs escala 10 m |
| Pé-direito | **5,5 m** | fundo da bola 2,5 + Ø 2,0 + corrente ~1,0; "quase 2 pisos de prédio de escadas"; OSM 8,5 m p/ 2 pisos + terraço (baixo mais alto) |
| Bola | **Ø 2,0 m**, fundo a **2,5 m** do chão (centro a 3,5 m), corrente ~1 m | David tocou-lhe a saltar |
| Pilares | 2 filas ladeiam a pista (~4/lado, secção ~0,8 m, vão ~5 m) | fotos lux5/lux8 |
| Pisos do edifício | 2 + terraço (terraço não conta) | David |
| Chão | tábuas de madeira corridas no eixo longo | todas as fotos |

## Luzes da sala (o que a bola espelha)

Paleta de referência: **ambiente azul profundo + chapéus dourado quente** (foto de referência do
David, 2026-08-31). **Decisão: a regra greyscale foi quebrada** — a sala/luzes usam cor real;
greyscale passa a existir como **toggle** (tem de estar sempre disponível e funcional).

1. **Chapéus de latão** — refletores parabólicos pendurados inclinados à volta da pista
   (~8–10, a ~2,5–3,2 m). Interior brilha **dourado quente**; **piscam só às vezes** (não
   contínuos) — knob de frequência/probabilidade de flash.
2. **Wash ambiente azul profundo** — banha paredes/teto/pilares; é o que permite ler os
   espelhos (feedback S9).
3. **Mikado de tubos luminosos no teto** (~5–5,5 m) — barras cruzadas; azul no modo referência,
   âmbar/vermelho noutras (Lux1, Lux-Top1). **Contexto (David, 2026-08-31): o mikado foi o elemento
   icónico do teto do Lux durante ~20 anos, até ser substituído pela bola.** Visão futura: poder
   **alternar bola ↔ mikado** como peça central. Por agora não se implementa — primeiro afina-se
   a sala.
4. **Cortina de tubos LED verticais** em anel à volta do centro (~2,8–4,2 m de altura).
   **ADIADA — não implementar ainda** (David, 2026-08-31); fica registada para fase posterior.
5. **Spots na bola** — 2–3 de trás/cima (lux8). **Regra de realismo (David, 2026-08-31): toda a
   incidência na bola tem de corresponder a um foco REAL montado na sala, em posição FIXA** (teto/
   estrutura). O que pode variar é o ângulo de mira (aim) e o dimmer/on-off — nunca a posição.
   **Focos "inferiores" (a bater na bola de baixo) são proibidos** — não existem no rig real.
   (Coerente com a regra antiga: nunca iluminar a bola diretamente por baixo.)
6. **Bar retroiluminado** (topo norte, mancha quente) · **cortina vermelha + palco/DJ** (topo sul).
7. **Colunas de som suspensas** nos cantos da pista — massas escuras que ocluem (realismo).

## Estado da implementação — 3º incremento + F9 (Opus, 2026-09-01, por commitar)

Correções do David aplicadas (119 knobs):
- **Sala alargada +1 m**: vão entre filas de pilares 5→**6 m** (eixos X=±3.0), largura 10→**11 m**
  (halfW 5.5); pilar→parede mantém 2,5 m; chapéus movem para |X|=4.5 (mantêm 1 m à parede).
- **Chapéus**: pala (meia parede cilíndrica sobre o vidro, avança 0,30 m), aro de suspensão (meio
  torus sobre a cúpula), inclinação 25→**15°** + knob. (3 armadilhas Babylon documentadas: slice
  corta em latitude; Euler compõe YXZ → rotationQuaternion explícito.)
- **Grupo "Pilares"**: 6 knobs `pilar N (0/1)` individuais (setEnabled ao vivo; probe respeita).
- **Robots**: inclinação 25→**3°** (a prumo) + knob `robots: inclinação°` (0-30).
- **HUD**: botão + tecla `h`, persistido (mb2.hudOn).
- **Focos da bola invisíveis — diagnóstico**: causa principal era TAMANHO (lata PAR36 Ø12 cm quase
  preta a 6 m = meia dúzia de píxeis) → `corpos: escala` default 1.0→**2.6** (~PAR de treliça);
  causa secundária: spots az ±82° com spotDist 6 caíam ATRÁS da parede (|x|=5.85 > 5.5) →
  clampToRoom encosta à face interior com margem 0,20 m.
- **F9 — motor de música ligado**: o canal MIRRORBALL já existia (F5); o bug era o caminho dos
  scripts (core.js só resolvia em /app/) → base deriva do pathname com fallback. Testado com
  sidecar: owner=music, beamIntensity ≤0.18, NaN-safe; sem sidecar degrada com warn, sem erros.
- Perf: 8,4–11,9 ms com janela em foco.
- ⚠ localStorage antigo ganha aos defaults novos: se a sala aparecer com 10 m ou os corpos pequenos,
  usar "repor knobs (defaults)" do grupo.

## Estado da implementação — 2º incremento (Opus, 2026-09-01, por commitar)

Geometria autoritativa aplicada e verificada numericamente na cena: sala 15×10×5,5 (bola ao centro),
6 pilares 0,5 m (X=±2.5, Z=−5/0/+5), 12 chapéus Ø 1 m com haste vertical (X=±4.0, Z=−6.25…+6.25,
base 2,5 m), robots.js novo (4 corpos a 5,15 m, ~23° da vertical, vermelho, excluem bola+planos),
spots da bola a 3,9–5,05 m com el 0–15° (choreo.elRange [0,15] — antes punha fontes a 6,5 m, fora
do pé-direito). Knobs novos: `robots (0/1)`=1, `robots: luz`=0.45; defaults alterados: comprimento 15,
chapéus 12/altura-base 2,5, origem el 0/15, spot0-3 el 6/4/10/10. 111 knobs. Fix extra:
gen-knobs-default.js tinha caminho hardcoded partido (ENOENT). `lampDiameter` dos chapéus lê-se no
arranque (mudar = reload, sem knob). Consola limpa (zero erros classe S8); perf por confirmar em tab
visível (automação deu ruído; baseline do 1º incremento ~13 ms).

## Estado da implementação (S5 Babylon, 2026-08-31 — 1º incremento, por commitar)

Feito: sala 10×20×5,5 m em metros (1 raio = 1 m), 2×4 pilares, chão madeira, wash azul
HemisphericLight (calibrado ×3.4 ao vivo — o ×0.6 inicial era invisível contra os albedos escuros),
8 chapéus (hats.js: anel fixo, emissivo dourado, flash Poisson com PointLight que EXCLUI a bola),
pilares+chapéus na renderList do probe, toggle `cor (0/1)` (colorutil.js). 11 knobs novos no grupo
"Sala" (dimensões com ⟳ reload). Perf ~13 ms com tudo ligado. Cache-busters: config v4, main v5,
panel v3. Adiado/por fazer: cortina LED, mikado, bar, cortina vermelha.

**Dívida conhecida (regra dos focos fixos)**: o pipeline pré-existente choreo/spots/fixtures ainda
MOVE a posição do corpo no retarget/flash (choreo.js escreve az/el e main/fixtures derivam a posição
daí) — viola a regra "posição fixa, só aim/dimmer variam". Exige separar montagem↔mira em choreo.js,
main.js, ball.js (mountedSpots) e fixtures.js; fica para o próximo incremento. Os chapéus novos já
cumprem (posições determinísticas, nunca re-sorteadas).

## Regras que se mantêm

`beamIntensity ≤ 0.18`, nada > 3 Hz, a bola não emite luz. Probe: todo o material PBR novo com
`reflectionTexture` própria; thin instances novas seguem `setEnabled` ↔ count (handoff S9).
