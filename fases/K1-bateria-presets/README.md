# K1 — Bateria da regra 9 (compatibilidade de presets) · commit `5d3b484`

## O que foi feito
- `spike-babylon/v2/test-knobs-compat.js` (Node, sem browser): carrega `knobs-default.json` de 3
  versões antigas (`4d5cbbd` 193 knobs, `8a87e7c` 201, `a7f42b8` 201) como se fossem um `mb2.knobs`
  guardado e passa-os pelo load atual do `panel.js` (220 knobs).
- 45 asserções: load não lança; knobs antigos mantêm o valor; `RENAMED` migra; knobs novos ausentes
  assumem o default; lixo é ignorado; NaN/string/Infinity rejeitados; tudo finito no fim.
- Resultado **45/45**, nenhum bug no `panel.js`. Registo em `docs/k1-config.md` §6.

## O que verificar
1. O `start.bat` desta fase correu a bateria: a última linha diz `45/45 asserções passaram`.
2. Ao vivo (bola v3, painel `d`): os 7 knobs do K1 (`mikado: máx barras/blocos`, `vultos: pool`,
   `chapéus: máx`, `chapéus: luzes vivas máx`, `sala: albedo base`, `bola: cadeia Hz`) aparecem com
   os valores de sempre e a cena está idêntica.
3. Regra permanente: qualquer preset teu antigo tem de carregar na versão nova. Se algum dia um
   knob "desaparecer" depois de um update, corre esta bateria primeiro.
