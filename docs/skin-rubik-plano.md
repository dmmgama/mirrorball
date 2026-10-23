# skin-rubik — plano de implementação faseado

Contexto, decisões e achados: [`skin-rubik.md`](skin-rubik.md). Bola: `web/index-v2.html`.
Ritmo do repo: fases pequenas, **stop visual** no fim de cada uma (o David vê ao vivo com música
no atalho `start-Mirror-Rubik`), sem harness pesado. Cada fase entregue tem pasta em `fases/`
(`README.md` com o checklist do que ver).

## Regras para todas as fases

- **Não mexer em `web/music.js`** (o motor está bom). O Rubik pode **ler** `window.MUSIC.state`
  (`fsm`, `beatTick`, `barTick`, `phraseTick`), nunca escrever.
- **Bola igual com o efeito desligado**: `rubik.on = 0` ou `force = 0` → bola de hoje, pixel a pixel.
- **Knobs** (regra 10): toda a constante nova nasce em `CONFIG.rubik` com valor inicial finito
  (regra 7); os que o David afina entram no painel `d` e no `PERSIST` (gravam em `mb.knobs` e na
  secção `ball` do `music-config.json`).
- **Compatibilidade** (regra 9): knobs novos ausentes num config antigo assumem o default sem erro.
- **Tetos** (regra 6): nada > 3 Hz — nenhuma marcação de tons pisca; entra e sai em rampa.
- A bola **continua a girar** durante tudo (regra 2: com bombo nunca pára).

## Ciclo do efeito (alvo de R2)

```
 baralhado ──(faixas rodam)──> resolvido em geometria ──(marca: tons do padrão entram)──>
 mostrado (hold) ──(tons saem)──> ──(faixas rodam de volta / para outro baralhado)──> baralhado
```

Ideia do David: durante a rotação a bola tem os **tons de hoje**; a **marcação** (tons do padrão,
podem ser fortes e iguais) só aparece **no resolvido** e sai **antes de desfazer**. Variáveis
de estado: `solve` (geometria, 0→1) e `mark` (tons, 0→1), separadas.

## Fases

### R1 — Painel ao vivo (pequena · Sonnet)
Secção **"rubik"** no painel `d`: `ligado (0/1)`, `padrão`, `raio`, `resolver` (0→1, manual),
`marcar` (0→1, manual), `força`, `amplitude`, `variação de tons`, `encaixe (0/1)`.
- Separar no código `solve` (geometria) de `mark` (tons) — hoje o padrão aparece com `force`
  mesmo baralhado; passa a multiplicar por `mark`.
- Knobs no `PERSIST`; `music-config.json` antigo carrega sem erro (regra 9).
- **Stop:** o David arrasta `resolver` e `marcar` com música e afina amplitude/variação por padrão.

### R2 — Mecânica manual (média · Opus)
Tecla **`r`** dispara um ciclo completo (ver acima), com a bola a girar.
- Máquina de estados `idle → solving → marking → hold → unmarking → scrambling → idle`.
- Cada faixa tem o seu `solve` próprio (não uma rampa global): é isso que dá o "mecanismo".
- Ao desfazer, sorteia um **baralhado novo** (não volta ao mesmo) — a bola nunca repete.
- Knobs: duração de cada etapa, easing, `hold` da marca, intensidade da marca.
- **Stop:** o David carrega em `r` várias vezes com música e diz o que sente.

### R3 — Coreografia das faixas (média · Opus)
Como as faixas se movem ao resolver/desfazer:
- **Modos:** todas juntas · uma a uma (de cima para baixo / do equador para fora) · em **blocos**
  de N faixas · **contra-sentido** (faixas alternadas em sentidos opostos) · **variar** (sorteio).
- Velocidade máxima por faixa (não pode parecer "glitch"), sobreposição entre faixas.
- **Stop:** comparar modos ao vivo; o David escolhe os que ficam e o peso de cada um no sorteio.

### R4 — O motor decide quando (média · Opus; julgamento Fable)
O efeito corre sozinho, **lendo** o motor (sem mexer em `music.js`):
- Knob **probabilidade** (por frase): ao `phraseTick`, sorteia se corre.
- Onde encaixa: candidatos breakdown/build (`state.fsm`); **nunca** no drop (o drop é do
  `all-on`); nunca dois ciclos seguidos. Duração do ciclo presa ao compasso (`barTick`).
- Knob **força do efeito** escala a marcação (nuance ↔ evidente).
- Ligar/desligar global.
- **Stop:** 20 min com música real — o efeito aparece, não cansa, não rouba o centro.

### R5 — Padrões e raios (pequena-média · Sonnet + olho do David)
Com a marcação só no resolvido, revisitar:
- Raios: variantes 1-4 e topo desfeito, agora com tons de marcação mais fortes.
- Diagonais: novo desenho se continuarem fracas.
- Sorteio de padrão por ciclo (knob de pesos), raio alterna entre variantes.
- **Stop:** folha de imagens + ao vivo.

### R6 — Fecho
- `docs/` atualizado, `fases/` com README por fase, handoff.
- Decidir com o David: merge para `Mirror-Ball-V3`? Portar para a Babylon (V3)? Bola Rubik e V3
  ao mesmo tempo (porta :8098 no sidecar)?

## Perguntas em aberto (para o David, quando chegar a fase)

1. R1: os valores de `amp`/`jitter` são por padrão ou globais?
2. R2: ao desfazer, volta ao baralhado anterior ou a um novo? (proposta: novo)
3. R3: contra-sentido — em relação à rotação da bola, ou entre faixas vizinhas?
4. R4: o efeito pode coincidir com gestos do motor (freeze, ghost…) ou exclui-se?
5. R5: há padrões que só aparecem raramente (o raio como "evento")?
