# web/vendor — bibliotecas vendorizadas

Ficheiros copiados para o repo de propósito: o `tuner-lab.html` tem de abrir **offline**, sem
`npm install` e sem CDN em runtime. Não editar à mão; para atualizar, voltar a descarregar.

| Ficheiro | Origem | Licença |
|---|---|---|
| `uPlot.iife.min.js` | [uPlot v1.6.31](https://github.com/leeoniya/uPlot) — `cdn.jsdelivr.net/npm/uplot@1.6.31/dist/` | MIT |

Duas notas sobre onde os ficheiros acabam por viver:

* O **sidecar serve `web/` de forma achatada** (sem subpastas, e sem MIME para `.css`). Por isso a
  página carrega `web/vendor-uPlot.iife.min.js` — a mesma cópia, com nome achatado — e traz o CSS
  do uPlot **inline** no `<style>` do HTML (1.8 KB). Esta pasta é a cópia canónica/legível.
* Os **sliders não usam biblioteca**: são `<input type=range>` gerados a partir do esquema
  `MUSIC.tune.schema` (§TUNE do `music.js`), que já define caminho, range, step e rótulo. Uma
  segunda fonte de verdade para os ranges era exatamente o que a §TUNE existe para evitar.
