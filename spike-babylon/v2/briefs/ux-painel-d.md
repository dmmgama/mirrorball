# UX do painel `d` — diagnóstico e proposta

Avaliação a 2026-08-30, painel medido ao vivo em `http://127.0.0.1:8096/v2/index.html?webgl=1`, janela 1512×767.
Nada foi implementado. Isto é só o plano.

**Medições reais (não estimativas):** 101 sliders + 6 checkboxes + 8 botões.

| modo | largura | % do ecrã | altura do conteúdo | scroll? |
|---|---|---|---|---|
| 1 coluna | 564 px | 37% | 2151 px | sim, 2.8 ecrãs |
| 2 colunas | 849 px | 56% | 1151 px | sim, 1.5 ecrãs |
| 3 colunas | 1261 px | **83%** | 811 px | sim, ainda |

Não existe nenhuma configuração em que o painel caiba **e** deixe ver a bola. Este é o problema central; tudo o resto decorre daqui.

---

## 1. Diagnóstico

1. **Nenhum modo cabe.** Ver tabela acima. A 3 colunas o painel tapa 83% da janela e mesmo assim ainda faz scroll — o David afina às cegas, porque o que está a afinar está por baixo do painel. A 1 coluna vê-se 32 dos 101 knobs: 69% do painel está sempre fora de vista.
2. **Ordem = arqueologia, não função.** A lista é a ordem histórica de escrita: 54 knobs herdados da Canvas 2D (`panel.js:26-86`), depois `newSliders` por fase de implementação F1→F7 (`:101-146`), depois os de cor (`:151-158`). Quem afina não pensa "isto foi feito na F4".
3. **Assunto partido em três sítios do painel.** É o sintoma mais caro do ponto 2:
   - *feixes*: `feixes: fração máx`, `compr. 3D`, `largura°`, `base ×`, `dispersão` na posição 42-46 — mas `feixes: intensidade`, `glow z`, `glow ×`, `comprimento` na 68-71. **26 linhas de distância**, ~500 px de scroll entre dois knobs que se afinam em conjunto.
   - *espelhos*: `brilho` (pos. 4), `filas`+`junta` (47-48), `variação`/`tom`/`alinhados` (56-58), `junta (real)`×3 (74-76). Quatro blocos separados.
   - *strobe*: `strobe fundo`, `frequência ×` (31-32), depois **`pontos na parede` intercala-se no meio** (33), e só depois `força` e `dura ms` (34-35).
   - *focos*: `quantos/raio/orla` (1-3) mas `luz (lm)`/`distância` (62-63) e `cor`/`saturação` (95-96).
4. **`pontos na parede (densidade)` está literalmente no meio dos strobes** (`panel.js:60`, entre `strobe: frequência ×` e `strobe: força`), a 44 linhas dos outros três knobs de pontos (`escala`, `queda`, `teto cinza`). Puro acidente de escrita.
5. **Zero hierarquia visual.** 101 `<label>` idênticos, 11px, mesma cor, mesmo peso, sem um único cabeçalho, régua ou espaço entre assuntos (`index.html:27` — `#dbg label{display:flex}` e nada mais). O olho não tem onde se agarrar; achar um knob é ler nomes um a um.
6. **Só se acha por leitura sequencial.** Sem busca, sem índice, sem atalho. Encontrar `pós: exposição` = scrollar até ~85% e ler. Numa sala escura, com música a tocar, é tempo morto em que a bola está errada.
7. **Knobs de música misturados com knobs de forma.** Os 4 disjuntores + `health` + `sphereOpacity` + `rotationRpm` (pos. 49-55) só fazem sentido com `?src=music` (MANUAL §Disjuntores), mas ocupam o centro da lista mesmo em modo manual, onde não fazem nada.
8. **Nada assinala o que é caro.** 8 knobs reconstroem a malha (`onRebuildBall`: `filas`, `junta`, `variação`, `tom`, `alinhados`, `corrente`×2, `junta larg./var. (real)`) e engasgam a imagem; parecem-se com os outros 93. O MANUAL marca-os com ⏫, o painel não.
9. **Valor não é editável nem legível.** O valor é um `<b>` de 44px, `color:#9a9a9a` sobre `rgba(10,10,10,.86)` — contraste ~4.6:1, e não aceita teclado. Para pôr `spot0: az°` exatamente em −90 arrasta-se um range de 120px com 351 passos: **2.9 valores por pixel**. Impossível acertar; e a seguir não se consegue confirmar o número a 1 m de distância.
10. **Espaço horizontal desperdiçado.** `justify-content:space-between` (`index.html:27`) empurra nome ↔ valor ↔ slider para os extremos, deixando um vazio grande ao meio (visível no screenshot). É por isso que uma coluna exige `minmax(230px,...)` e o painel fica com 564px.
11. **Sem reset por grupo.** `repor knobs (defaults)` é tudo-ou-nada: estragar o bloom obriga a perder as posições dos focos que se acertou antes, ou a repor os 3 knobs de bloom à mão de memória.
12. **`resize:both` (`index.html:23`) redimensiona mas não reflui** — o grid é `repeat(var(--dbgCols))` fixo, logo alargar à mão só cria espaço vazio ou corta.
13. **Persistência sem gravação implícita.** É correto (`gravar` é manual, MANUAL §Prioridade), mas o painel não diz *se há alterações por gravar*: `knobMsg` está vazio até se carregar num botão. Depois de uma sessão a afinar não há sinal de que se pode perder tudo.

---

## 2. Reagrupamento proposto

9 grupos. **Nenhum nome de slider muda** — só a ordem de construção do array e a caixa onde cai. `PERSIST`, `mb2.knobs` e a secção `ball` do `music-config.json` ficam byte a byte iguais.

### ⭐ Sempre à mão (barra fixa, nunca colapsa)
Os 7 mais tocados ao vivo. Escolhidos por serem os que mudam a *sensação* da sala e não a geometria — os que um técnico de luz mexe entre faixas:

| slider | porquê ao vivo |
|---|---|
| `haze máx (motor modula)` | o knob de atmosfera; 0 mata feixes e cones de uma vez |
| `feixes: fração máx (motor modula)` | quantidade de feixes = energia da sala |
| `feixes: intensidade` | força do feixe (teto 0.18) |
| `focos: quantos` | 0-6, muda o rig todo instantaneamente |
| `espelhos: brilho` | quantos espelhos acendem dentro da mancha |
| `pontos na parede (densidade)` | enche ou esvazia as paredes |
| `rotationRpm (motor manda)` | velocidade — o primeiro reflexo de quem afina |

### Grupos (ordem de cima para baixo)

| # | grupo | sliders (nome exato, ordem proposta) |
|---|---|---|
| 1 | **Focos** | `focos: quantos` · `focos: raio ×` · `focos: orla` · `focos: luz (lm)` · `focos: distância` · `spot0: az° (−=esq)` · `spot0: el°` · `spot1: az°` · `spot1: el°` · `spot2: az°` · `spot2: el°` · `spot3: az°` · `spot3: el°` · `focos: cor (0/1)` · `focos: saturação` · `spot0: matiz°` … `spot5: matiz°` |
| 2 | **Coreografia & Flashes** | `focos: saltam (0/1)` · `focos: fixo min s` · `focos: fixo max s` · `origem: \|az\| min°` · `origem: \|az\| max°` · `origem: el min°` · `origem: el max°` · `origem: mira (raios)` · `flash: por s` · `flash: raio ×` · `flash: dura ms` |
| 3 | **Bola & Espelhos** | `bola: luz` · `bola: contraste` · `espelhos: brilho` · `luz geral (volume)` · `luz geral: az°` · `luz geral: el°` · ⏫`espelhos: filas` · ⏫`junta (seam)` · ⏫`espelhos: variação` · ⏫`espelhos: tom (0=hash/1=real)` · ⏫`espelhos: alinhados (0/1)` · `espelhos: junta (real)` · ⏫`espelhos: junta larg. (real)` · ⏫`espelhos: junta var. (real)` · `pbr: metallic` · `pbr: roughness` · `pbr: ambiente` · `pbr: glint mix` · `raio-x: osso (0/1)` · `raio-x: osso alpha ×` · ⏫`corrente (0/1)` · ⏫`corrente: elo (raios)` |
| 4 | **Névoa & Feixes** | `haze máx (motor modula)` · `feixes: fração máx (motor modula)` · `feixes: intensidade` · `feixes: largura°` · `feixes: dispersão` · `feixes: comprimento` · `feixes: base ×` · `feixes: glow z` · `feixes: glow ×` · `feixes: compr. 3D (fase 3)` · `cone incidente` · `cone: alcance` · `cone: largura máx` · `cone: teto (raios)` · `auréola` |
| 5 | **Sala** | `pontos na parede (densidade)` · `pontos: escala` · `pontos: queda` · `pontos: teto cinza` · `luz indireta` · `indireta: área°` · `indireta: luz ×` · `corpos (0/1)` · `corpos: escala` · `corpos: lente ×` · `corpos: haste (0/1)` · `fundo: claridade (dark)` |
| 6 | **Pós & Skin** | `bloom: força` · `bloom: limiar` · `bloom: raio px` · `grão` · `vinheta` · `pós: tonemap (0/1)` · `pós: exposição` · *(+ botão skin, hoje solto em `#ui`)* |
| 7 | **Motor** | `feixes+haze: motor manda (0/1)` · `focos+flashes: motor manda (0/1)` · `opacidade: motor manda (0/1)` · `health (motor manda)` · `sphereOpacity (motor manda)` · `rotationRpm (motor manda)` · `strobe fundo (0/1)` · `strobe: frequência ×` · `strobe: força` · `strobe: dura ms` |
| 8 | **Explosão** | `explosão: alcance (radial)` · `explosão: deriva s` · `explosão: pausa s` |
| 9 | **Ficheiro** | *(sem sliders)* `repor ficheiro gravado` · `repor knobs (defaults)` · `gravar (music-config.json)` · checkboxes `spot 0-5` · `1/2/3 col` · `A−/A+` |

Notas de arrumação: os 4 strobes vão para **Motor** (é o motor que os dispara, MANUAL §strobe) e não para Pós; `fundo: claridade (dark)` vai para **Sala** (é a parede, não um pós-processo). ⏫ marca reconstrução de malha.

---

## 3. Navegação — 3 hipóteses

### (a) Grupos colapsáveis + busca
Os 9 grupos em `<details>`, estado em `localStorage['mb2.dbgOpen']`, campo de busca no topo que filtra por substring, botão "colapsar tudo".

- **Prós:** conceptualmente simples; a busca resolve o "onde está isto?" (problema 6); um só grupo aberto = ~20 linhas, sem scroll.
- **Contras:** **não resolve a largura** — continua um painel de 564px encostado à direita a tapar 37% da bola. É o problema nº1 e fica intacto.
- **Custo:** ~55 linhas JS + ~15 CSS.

### (b) Largura redimensionável + modo compacto
Drag handle ou 3 larguras, e "compacto" = nome + slider + valor numa só linha densa.

- **Prós:** ataca diretamente a largura e o desperdício horizontal (problema 10); o compacto ganha ~35% de altura útil.
- **Contras:** sozinho não dá hierarquia nem busca; estreitar 101 knobs sem os agrupar só torna a lista mais comprida (o scroll piora); um painel de 300px com sliders de 80px agrava a precisão (problema 9).
- **Custo:** ~30 linhas JS + ~25 CSS.

### (c) Barra inferior com separadores + popover ⭐
Barra fina no fundo (~34px) com os 9 nomes de grupo; clicar num abre **só esse grupo** num popover por cima da barra; clicar outra vez fecha. A bola fica visível o tempo todo menos na área do popover.

- **Prós:** resolve o problema central — em repouso o painel ocupa 34px (4% da altura, 0% da largura) e a bola está inteira; o popover mostra um grupo (máx. 22 knobs = ~450px) e o David vê a bola por cima enquanto arrasta. A barra em baixo não colide com o `#hud` (topo-esq) nem com o `#mus` (fundo-dir → passa a fundo-dir *acima* da barra). Os separadores são também o índice: nomear os grupos ensina onde vive cada knob.
- **Contras:** não se veem dois grupos ao mesmo tempo (afinar feixes olhando para pós exige alternar — mitigado pelos favoritos, que ficam sempre visíveis); é a maior alteração de DOM das três.
- **Custo:** ~90 linhas JS + ~45 CSS.

### Extras que valem a pena
- **⭐ Favoritos fixos** — os 7 da tabela §2 sempre visíveis na barra/faixa. Corta a maioria das aberturas de popover.
- **Valor editável por teclado** — `<b>` → `<input type=number>` estreito. Mata o problema 9 (2.9 valores/pixel) por ~12 linhas. Alto retorno.
- **⏫ nos 8 knobs de rebuild** — um `<span>` no label. ~3 linhas.
- **Reset por grupo** — botãozinho no cabeçalho do popover; reusa `knobsSet(KNOB_DEFAULTS)` filtrado ao grupo. ~10 linhas.
- **Indicador "por gravar"** — ponto nos separadores cujos knobs divergem de `knobFile`. ~10 linhas.
- **Grupo Motor esmaecido sem `?src=music`** — `opacity:.5` + tooltip. ~4 linhas.

### Recomendação: **(c) + favoritos + valor editável + ⏫**, com a busca do (a) dentro do popover

Porque o teste real é *a bola tem de estar visível enquanto se afina* — o David afina à sensação, em ecrã inteiro, numa sala escura. (a) e (b) melhoram uma lista que continua a tapar a bola; só (c) devolve o ecrã. Os favoritos cobrem o caso dominante (os 7 knobs de sempre) sem abrir nada, e o popover cobre a cauda. O valor editável entra porque é 12 linhas para resolver um problema que nenhuma navegação resolve. A busca (a) fica como filtro dentro do popover — barata, e é a saída de emergência quando não se lembra do grupo.

Custo total: ~110 linhas JS + ~50 CSS em `panel.js`/`index.html`. Sem frameworks, sem tocar em nomes nem em persistência.

---

## 4. Mockup

### Fechado (repouso) — a bola ocupa tudo
```
┌───────────────────────────────────────────────────────────────────────┐
│ ┌─────────────┐                                                       │
│ │ WebGL2 4.3ms│              (#hud, topo-esq, intacto)                │
│ └─────────────┘                                                       │
│                                                                       │
│                              ·  ·   ·                                 │
│                          ·  ((  BOLA  ))  ·          ← ecrã todo dela │
│                              ·  ·   ·                                 │
│                                                                       │
│                                              ┌──────────────────────┐ │
│                                              │ BOMBO ▮▮▮▯ 128bpm    │ │
│                                              └──────────────────────┘ │
│ ⭐ haze 0.60│fração 0.35│feix 0.12│focos 2│brilho 1.0│pontos 1.2│rpm 2.8│
│ Focos│Coreo│Bola│Névoa│Sala│Pós│Motor│Explosão│Ficheiro    skin:dark ⌄│
└───────────────────────────────────────────────────────────────────────┘
   ↑ faixa favoritos 30px + barra separadores 34px = 64px (8% da altura)
```

### Aberto no grupo "Névoa & Feixes"
```
│                              ·  ·   ·                                 │
│                          ·  ((  BOLA  ))  ·        ← ainda visível    │
│                                                                       │
│        ┌────────────────────────────────────────────────┐             │
│        │ Névoa & Feixes            [busca…]  ↺ reset  ✕ │             │
│        ├────────────────────────────────────────────────┤             │
│        │ haze máx (motor modula)   [ 0.60] ▬▬▬▬●▬▬▬▬▬▬ │             │
│        │ feixes: fração máx        [ 0.35] ▬▬●▬▬▬▬▬▬▬▬ │             │
│        │ feixes: intensidade       [0.120] ▬▬▬▬▬▬▬●▬▬▬ │             │
│        │ feixes: largura°          [ 1.20] ▬▬▬●▬▬▬▬▬▬▬ │             │
│        │ feixes: dispersão         [ 0.40] ▬▬▬▬●▬▬▬▬▬▬ │             │
│        │ … (15 knobs, sem scroll)                       │             │
│        └────────────────────────────────────────────────┘             │
│ ⭐ haze 0.60│fração 0.35│feix 0.12│focos 2│brilho 1.0│pontos 1.2│rpm 2.8│
│ Focos│Coreo│[Névoa]│Sala│Pós│Motor│Explosão│Ficheiro       skin:dark ⌄│
└───────────────────────────────────────────────────────────────────────┘
        ↑ popover 430px largo, ancorado ao separador, máx 55vh
```
Valor à esquerda do slider e alinhado (não `space-between`): mata o vazio central e permite 430px em vez de 564px.

### Compacto (grupo "Bola & Espelhos", 22 knobs)
```
┌────────────────────────────────────────────────┐
│ Bola & Espelhos          [busca…]  ↺ reset  ✕ │
├────────────────────────────────────────────────┤
│ bola: luz            [0.30] ▬▬●▬▬▬▬            │
│ bola: contraste      [1.15] ▬▬▬●▬▬▬            │
│ espelhos: brilho     [1.00] ▬▬▬●▬▬▬            │
│ espelhos: filas   ⏫ [  48] ▬▬▬▬●▬▬            │
│ junta (seam)      ⏫ [0.12] ▬▬●▬▬▬▬            │
│ pbr: metallic        [1.00] ▬▬▬▬▬▬●            │
└────────────────────────────────────────────────┘
   linha 17px (vs 20px), slider 96px, tudo à vista
```

### CSS chave

```css
/* barra: fina, encostada, nunca tapa a bola */
#dbgbar{position:fixed;left:0;right:0;bottom:0;height:34px;display:flex;align-items:center;
        gap:2px;padding:0 8px;background:rgba(8,8,8,.92);border-top:1px solid #2a2a2a;
        font:12px/1 ui-monospace,Consolas,monospace;z-index:10}
#dbgbar button{background:none;border:0;color:#8f8f8f;padding:8px 10px;cursor:pointer;
        letter-spacing:.02em}                 /* 12px ≥ legível a 1 m */
#dbgbar button:hover{color:#d8d8d8}
#dbgbar button[aria-expanded=true]{color:#fff;box-shadow:inset 0 -2px 0 #6a6a6a}

/* faixa de favoritos, imediatamente acima */
#dbgfav{position:fixed;left:0;right:0;bottom:34px;height:30px;display:flex;gap:14px;
        align-items:center;padding:0 8px;background:rgba(8,8,8,.80);
        font:11px ui-monospace,Consolas,monospace;color:#9a9a9a;z-index:10}
#dbgfav input[type=range]{width:70px;accent-color:#bdbdbd}

/* popover: um grupo, largura fixa, ancorado ao separador */
.dbgpop{position:fixed;bottom:68px;width:430px;max-height:55vh;overflow:auto;
        background:rgba(10,10,10,.94);border:1px solid #333;padding:8px 10px;z-index:11}
.dbgpop label{display:grid;grid-template-columns:1fr 46px 110px;gap:8px;align-items:center;
        height:20px}                          /* nome | valor | slider — sem vazio ao meio */
.dbgpop.compact label{height:17px;grid-template-columns:1fr 42px 96px}
.dbgpop input[type=number]{width:44px;background:#1a1a1a;border:1px solid #333;color:#e8e8e8;
        font:inherit;text-align:right}        /* valor editável por teclado */
.dbgpop .rb{color:#c9a227}                    /* ⏫ reconstrói malha */

/* contraste em dark sem ofuscar: nada a #fff puro exceto o separador ativo */
:root{--dbgTxt:#c8c8c8;   /* 9.7:1 sobre #0a0a0a — legível a 1 m           */
      --dbgDim:#8f8f8f;   /* 5.1:1 — inativos, ainda acima de WCAG AA      */
      --dbgVal:#e8e8e8}   /* valores: o que se lê a arrastar               */
```
Tipografia: 12px na barra, 11px nos knobs (o atual, já validado ao vivo); `A−/A+` mantêm-se e passam a escalar barra+popover. Contraste subido de `#cfcfcf`/`#9a9a9a` para `--dbgTxt`/`--dbgVal` — mais legível sem chegar a branco puro, que numa sala escura ofusca e contamina a perceção da bola.

---

## 5. Plano de implementação

### Passo 1 — Reagrupar, sem mudar a UI
Em `panel.js`: adicionar um campo `grupo` a cada entrada (ou uma tabela `GRUPOS = {nome: [nomes de sliders]}` a seguir ao array) e construir o DOM por grupo, com um `<h5>` por grupo dentro do `.knobs` atual. O array `sliders` continua a existir tal e qual — `PERSIST`, `KNOB_DEFAULTS`, `knobsGet/Set`, `refresh` e `inputs` não são tocados, só a **ordem de `appendChild`**.
Adicionar o `⏫` no label dos 8 knobs de rebuild, e `<input type=number>` em vez do `<b>` (com o mesmo `.toFixed` e a mesma escrita em `knobStore`).
**Feito quando:** os 101 sliders aparecem sob os 9 cabeçalhos na ordem da §2; recarregar a página mantém todos os valores mexidos (prova: mexer 3 knobs de grupos diferentes, F5, conferir); `MIRRORBALL.knobs.get()` devolve as mesmas 91+ chaves de antes; escrever um número no campo move o slider e a bola.

### Passo 2 — Barra + popover + favoritos
Em `index.html`: o CSS da §4. Em `panel.js`: criar `#dbgbar` (9 botões) e `#dbgfav` (os 7 favoritos), e mover cada bloco de grupo para dentro do seu `.dbgpop`, criado uma vez e escondido/mostrado — **os `inputs[name]` são os mesmos nós**, para `refresh()` e `knobsSet` continuarem a funcionar sem saber que a UI mudou. Os favoritos são um **segundo** slider ligado ao mesmo `set()`, sincronizado no `oninput` e no `refresh()`. A tecla `d` passa a esconder/mostrar barra+faixa+popover; grupo aberto em `localStorage['mb2.dbgOpen']`; mover `#mus` para `bottom:68px`.
**Feito quando:** com o painel ligado vê-se a bola inteira menos 64px em baixo; clicar em "Névoa" abre 15 knobs sem scroll; arrastar o `haze` na faixa de favoritos mexe também o slider dentro do popover e vice-versa; `d` faz desaparecer tudo; o HUD `m` não fica por baixo da barra.

### Passo 3 — Busca, reset por grupo, compacto, indicador por gravar
Campo de busca no cabeçalho do popover (filtra por `includes()` no nome, e se houver texto procura em **todos** os grupos); `↺ reset` que chama `knobsSet` só com as chaves do grupo vindas de `KNOB_DEFAULTS`; classe `.compact` alternada por um botão na barra (persistida junto de `mb2.dbgSize`); ponto nos separadores cujos knobs diferem de `knobFile`; grupo Motor a `opacity:.5` sem `?src=music`.
**Feito quando:** escrever "glow" mostra os 2 knobs onde quer que se esteja; `↺` no grupo Pós repõe os 7 do pós e **não** mexe nos focos; o modo compacto mete os 22 knobs de Bola & Espelhos sem scroll; depois de mexer num knob aparece o ponto no separador desse grupo e ele desaparece ao carregar em `gravar`.

Os três passos são independentes e cada um deixa o painel utilizável — dá para parar no 1 ou no 2 se o David achar que chega.

---

## Riscos

- **`inp.previousSibling`** (`panel.js:232` e `:301`) assume que o valor está imediatamente antes do slider no DOM. O passo 1 muda essa vizinhança → guardar a referência do campo de valor num mapa `vals[name]` e trocar as duas utilizações. **É o único ponto onde a persistência se pode partir sem dar erro visível.**
- Os favoritos duplicam nós de input: o `refresh()` tem de atualizar os dois, ou os sliders do popover mostram valores velhos depois de o motor escrever no CONFIG (o handoff S7 já reporta "sliders não re-leem CONFIG" — vale confirmar que `refresh()` está mesmo a ser chamado por frame antes de duplicar o problema).
- `dbg.classList.toggle('on')` no `keydown` (`:288`) e o `html.mini` (`index.html:41`) referem `#dbg`; a barra e a faixa são nós novos e precisam de entrar nas duas regras.
