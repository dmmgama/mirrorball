# tools/ — gravar features e afinar o detetor

Ferramentas de **observabilidade**. Não fazem parte da bola: com elas fechadas, a bola comporta-se
exatamente como sempre.

## O problema que resolvem

Afinar o detetor de bombo olhando para a bola não funciona. Entre o kick e o que se vê há inércia
(taus de 0.6-4 s), o piso de rotação, a névoa, as rampas dos gestos e a máquina de estados. Quando
uma batida não aparece na bola, não dá para saber se **o detetor a falhou** ou se **o detetor
acertou e o mapeamento a suavizou** — e essas duas causas têm correções opostas.

O `tuner-lab` mostra as duas coisas empilhadas no mesmo eixo de tempo: o sinal que o detetor viu,
o limiar que usou, cada kick que decidiu, e por baixo o que a bola fez em consequência.

## Fluxo

```
1. GRAVAR       node tools/cap.js 60 tools/feat.json      (com música a tocar)
2. ABRIR        http://127.0.0.1:3739/app/tuner-lab.html
3. AFINAR       mexer nos sliders — reprocessa na hora (~200-500 ms para 60 s)
4. GRAVAR       botão "Copiar config" → colar em music-config.json
```

### 1. `cap.js` — gravador

```
node tools/cap.js [segundos] [ficheiro-saida]      # defeito: 60 s → tools/feat.json
```

Liga-se ao sidecar (`ws://127.0.0.1:3739/ws`), grava as mensagens de features **cruas** para um
array JSON, e no fim imprime percentis de `subFluxRaw`/`hatFluxRaw`/`sub`/`hat`/`rms`.

O número que interessa é o **`p95/mediana` do `subFluxRaw`**: é o rácio entre o pico do bombo e o
fundo, e portanto o tecto do que o `kickC0` pode ser. Medido numa faixa real: **9.8** — muito
acima do default de 1.6, que é o que fazia o detetor disparar em cima do ruído.

**Sem dependências.** Usa o `WebSocket` e o `fetch` globais do Node ≥ 22 (este projeto corre em
v24). Não há `package.json`, não há `npm i ws`, não há `node_modules` no repo — foi a razão de
escolher este caminho em vez do módulo `ws`. Em Node < 22 o script diz-o e sai.

Se o sidecar for antigo e não emitir `subFluxRaw`/`hatFluxRaw`, o script **avisa em texto claro**
que a gravação vai correr em fallback (nesse caminho os knobs do Detetor não fazem nada).
Correção: reiniciar o sidecar. *(Verificado a 2026-08-28: o sidecar em execução já os emite.)*

### 2. `make-sample.js` — amostra de demonstração

```
node tools/make-sample.js [segundos] [bpm] [saida]
```

Gera `tools/feat-sample.json` (e uma cópia em `web/`, que é de onde a página a lê): 60 s a 128 BPM
com um breakdown sem bombo a meio, no formato do sidecar e com escalas calibradas pelo que foi
medido em música real. Serve para ver o instrumento a funcionar **antes** de gravar seja o que for,
e como caso de **verdade conhecida**: ~106 kicks. Se o detetor disser muito mais, está a
sobredisparar; muito menos, está a perder batidas.

### 3. `web/tuner-lab.html` — o instrumento

Cinco pistas, eixo X partilhado, arrastar para dar zoom (propaga-se a todas), duplo-clique repõe.

| Pista | O que responde |
|---|---|
| 1 · `subFluxRaw` + mediana + **limiar** + marcas de kick | O detetor viu a batida? Disparou onde devia? |
| 2 · `hatFluxRaw`, idem | O mesmo, para os agudos |
| 3 · `kickPresence`, `gridConf`, BPM | Apanhou as batidas mas perdeu a **grelha**? |
| 4 · rpm, opacidade, haze, feixes | O que a **bola** fez com isso |
| 5 · máquina de estados | Em que estado estava quando aconteceu |

Corre o **`music.js` real** — o mesmo ficheiro que a bola carrega — num sandbox com relógio
virtual (o mesmo padrão do `web/test-music-f2.js`). **Não há cópia do algoritmo**, por isso não há
duas versões para manter sincronizadas. Foi essa a razão de não se usar Sonic Visualiser / madmom /
TouchDesigner: todos obrigariam a reimplementar o detetor noutra linguagem.

Os sliders são gerados a partir do esquema **§TUNE** do `music.js` — os mesmos caminhos, ranges e
tetos do painel `k` da bola. Os limites do `CLAUDE.md` (`beamIntensity ≤ 0.18`, etc.) são os `max`
dos ranges: não há como passar deles por aqui.

Se existir um `music-config.json`, aparece um botão **"Usar config da bola"** para partir dos
valores que a bola usa hoje em vez dos defaults do código.

## Notas

* A página tem de ser **servida** (lê `core.js`/`music.js` por `fetch`; `file://` bloqueia).
  Com o sidecar a correr: `http://127.0.0.1:3739/app/tuner-lab.html`.
  Ou `MirrorBall-Start.bat` → `http://127.0.0.1:8080/tuner-lab.html`.
* O sidecar serve `web/` de forma **achatada** (sem subpastas, sem MIME para `.css`). É por isso
  que a página carrega `vendor-uPlot.iife.min.js` (nome achatado) e traz o CSS do uPlot inline.
  A cópia canónica da biblioteca está em `web/vendor/`.
* uPlot é **MIT** e está vendorizado: a página funciona offline, sem `npm install` e sem CDN.
* `node web/replay-real.js tools/feat.json` continua a dar o mesmo relatório em texto, 1 linha/s,
  para quando basta um número.

## Áudio sincronizado — ficou de fora

Ouvir a música alinhada com o scrub seria valioso, mas o sidecar **não expõe PCM**: emite só o
vetor de features a 50 Hz. Gravar o WAV alinhado exigiria uma segunda captura WASAPI dentro do
`cap.js` (mais uma dependência nativa) ou uma rota nova no sidecar — ou seja, mexer no `agent-os`,
que está fora do âmbito desta tarefa. O instrumento é útil só com as features: a verdade que o
David precisa de comparar (o BPM real da faixa) é um número que ele já sabe, e a contagem de kicks
está no topo do ecrã.
