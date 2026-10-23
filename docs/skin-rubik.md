# skin-rubik — efeito Rubik na bola 2D

Bola: `web/index-v2.html` (Canvas 2D). Branch `skin-rubik`, worktree `../MirrorBall-skin-rubik`.
A V3 em `../MirrorBall` não se toca. Plano de implementação: [`skin-rubik-plano.md`](skin-rubik-plano.md).
Folha de comparação das imagens F0: artifact **"Rubik na bola"**
(https://claude.ai/code/artifact/d03fa621-4898-42b1-b8c0-d52f5cbcd2fa).

## 1. Ponto de partida (David, 2026-10-23)

- O David gosta muito de ver a **bola 2D**: a bola funciona bem.
- **O motor de áudio (`web/music.js` v63) está a funcionar muito bem.** Este trabalho não lhe mexe;
  o Rubik é aparência e comportamento da bola. O motor só pode vir a ser **lido** (R4).
- Foco **só na bola**. Sala, mikado, chapéus, vultos são da V3 Babylon e ficam fora.

## 2. O efeito (palavras do David)

Não é cor nem cópia do cubo: é o **mecanismo**. A bola continua a girar e a fazer tudo normalmente.
De vez em quando **faixas da bola rodam à parte** (uma, blocos, variar; eventualmente em
contra-sentido — experimentar) até a bola ficar **resolvida**, e depois **desfaz-se**.
É uma **nuance, não o centro das atenções**: ligar/desligar, slider de força, e probabilidade de o
motor o correr.

## 3. Decisões fechadas

| # | Decisão | Porquê |
|---|---|---|
| 1 | Alvo = bola 2D, não a Babylon | É a que o David gosta; foco só na bola |
| 2 | Rubik servida em **:8099** (`Mirror-Rubik-Start.bat`, atalho Desktop `start-Mirror-Rubik`) | O sidecar só aceita áudio de :8099/:3739 (`audio-sidecar/server.js` `SPIKE_ORIGINS`). Rubik e V3 não correm ao mesmo tempo; se for preciso, decide-se depois (p.ex. :8098 no sidecar) |
| 3 | Afinação da bola = `web/music-config.json` secção `ball` (copiado da V3) | Manda sobre o localStorage |
| 4 | "Resolvido" lê-se pelos **tons** dos espelhos (+ juntas alinhadas) | Só juntas = 1-2 px, invisível |
| 5 | Primeiro padrão a implementar: **colunas** | Prova o mecanismo; os outros entram depois |
| 6 | **Encaixe**: no resolvido os espelhos encaixam numa grelha de meridianos | Juntas verticais de polo a polo (filas têm nº de espelhos diferente) |
| 7 | **Sem contorno** à volta das formas | David: "fica mal" |
| 8 | Tons **não iguais** dentro do padrão | David: a bola atual é bonita pelos contrastes; a forma lê-se sem tudo igual |
| 9 | Raio = **silhueta ⚡** (desenho do David = variante 1), não ziguezague repetido | Desenho + anexos do David |

## 4. Ideia em aberto (David, 2026-10-23) — a resolver em R2

> No fim, quando **resolve em termos de geometria**, fazer a **marcação** na bola: marcar os tons
> todos iguais (o padrão) **antes de desfazer**.

Isto resolve o conflito que a F0 mostrou: **durante** a rotação das faixas a bola tem os tons de
hoje (contrastes intactos); **só no momento resolvido** os tons do padrão aparecem (podem ser
fortes/iguais, porque é um instante), e saem **antes** de desfazer. Ver o ciclo em
`skin-rubik-plano.md` §R2.

## 5. F0 — pré-visualização estática (feito, 2026-10-23)

Parâmetros no URL de `web/index-v2.html`:
`?src=music&rubik=colunas|diagonais|xadrez|trovoes&solve=0..1&forca=0..1&snap=0|1&raio=0..4&desfaz=0..1&jitter=0..1&rpm=`.
Com `forca=0` e `solve=0` a bola é **idêntica** à de hoje.

Como funciona (código em `rubikBuild()` + 3 linhas no render):
- O **layout de hoje é o baralhado**: cada faixa (fila de latitude) está desviada `rubikDelta[i]`
  (±`scramble` espelhos + o meio-espelho das filas ímpares) da posição resolvida.
- `solve` 0→1 roda cada faixa até à posição resolvida; com `snap` os espelhos ainda encaixam na
  grelha de meridianos (`snapDc`, `snapW`).
- Cada espelho guarda `rk` = o valor do padrão na **sua posição resolvida**; o render soma
  `(rk−½)·amp·força` ao cinza **depois** do contraste da afinação. O cinza base (`T.grey`) fica o de hoje.

Knobs em `CONFIG.rubik` (todos com valor inicial finito — regra 7):

| Knob | Valor | O quê |
|---|---|---|
| `pattern` | colunas | colunas · diagonais · xadrez · trovoes |
| `force` | 0 | 0 = bola de hoje · 1 = padrão inteiro |
| `solve` | 0 | 0 baralhado → 1 resolvido (na F0 fixo; em R2 é a mecânica) |
| `scramble` | 8 | ± espelhos de desvio de cada faixa |
| `snap` | 1 | encaixe na grelha de meridianos no resolvido |
| `amp` | 0.30 | amplitude do padrão (somada depois do contraste) |
| `jitter` | 0.45 | variação do empurrão por espelho (0 = igual na zona) |
| `block` | 3 | lado dos blocos do xadrez / largura das riscas diagonais |
| `boltShape` | 1 | 1 desenho do David · 2 esguio · 3 dois dentes · 4 fino · 0 alterna |
| `boltCount` / `boltW` / `boltH` | 2 / 26 / 0.92 | nº de raios, largura (espelhos), altura (fração da bola) |
| `boltGain` / `boltEdge` / `boltDissolve` | 3.5 / 0 / 0 | brilho, orla (desligada), topo desfeito em pontos |

### Achados da F0

1. **Amplitude:** os cinzas dos espelhos vivem em [0.045, 0.14] e a afinação tem `ballContrast 0.5`
   e `ballLight 1` → um padrão dentro desse intervalo ficava com 2-3 % de diferença (invisível).
   Daí `amp` somado depois do contraste.
2. **Equilíbrio forma × contraste:** quanto mais variação de tom (`jitter`), mais subtil a forma.
   Com o padrão como empurrão: colunas e xadrez leem-se; diagonais quase somem; o raio lê-se
   fraco. → motivo da ideia §4 (marcar só no resolvido).
3. **Diagonais:** tom aleatório por diagonal lê-se como ruído; riscas de 3 espelhos são melhores
   mas continuam fracas com encaixe + jitter.
4. **Arredondamento do encaixe:** no equador as bordas caem a x.5 de coluna → largura 0 (buracos).
   Corrigido com `+1e-3` (0 de 3448 espelhos com largura 0).
5. **Fotos com o motor ligado:** brilhos e feixes variam entre fotos; às vezes o motor escurece a
   bola. Comparar tons e alinhamento, não reflexos.

Imagens: `fases/R0-rubik-imagens/` (PNG fora do git; README no git). Capturas por subagentes com
Chromium headless próprio (Playwright), viewport 1600×900 ×2, 4 s de espera; raios com a rotação
fixada (`angle = π/2`) para ficarem de frente.

## 6. Histórico das afinações da F0 (2026-10-23)

1. Padrão nos tons, dentro do cinza → invisível → `amp` depois do contraste.
2. Diagonais: tom aleatório por diagonal → riscas de `block` espelhos.
3. Encaixe na grelha (`snap`) a pedido do David ("nas colunas não pode alinhar as juntas?").
4. Trovões: ziguezague repetido → ⚡ em linha (desenho 1 do David) → silhuetas cheias (anexos) →
   desenho do David medido como variante 1.
5. Contorno escuro (`boltEdge`) para definir a forma → **retirado** (David: fica mal).
6. Tons iguais no padrão → padrão como **empurrão** sobre o tom próprio (`jitter` 0.45).
