# V2 + V3 — Fog nativo + exposição/ColorCurves (W2, S14) · commit `8edffa3`

## O que foi feito
- **V2** `scene.fogMode = EXP`: knobs `sala: névoa densidade` **0.004** (quase impercetível) e
  `sala: névoa cor (cinza)` 0.03, grupo Sala & Geometria. A cor do fog segue a skin (dark/white).
  Materiais aditivos (feixes, dots, halo, incidentes) ficam **fora** do fog.
- **V3** `pós: exposição` default 1 → **0.85**. ColorCurves ligadas: `pós: curvas (0/1)` 1,
  `pós: sombras matiz` 220 / `tinta` 12 (frias), `pós: altas matiz` 40 / `tinta` 10 (quentes),
  `pós: curvas saturação` 0. Grupo Pós & Skin.
- Greyscale: com `cor (0/1)` a 0 as curvas desligam por completo (cinza × tinta deixaria de ser cinza).

## O que verificar (bola v3, painel `d`)
0. **Primeiro**: "repor knobs" em Pós & Skin, senão o teu `mb2.knobs` guardado mantém exposição 1.
1. Névoa: `sala: névoa densidade` 0 → 0.004 → 0.02, a olhar para os **pilares do fundo**. A 0.004
   quase não se nota; a 0.02 os pilares perdem nitidez. Escolhe o que lê como ar de clube.
2. `pós: curvas (0/1)` 0 vs 1 e `pós: exposição` 0.85 vs 1, com as fotos lux2-lux12 de
   `docs/f8-sala-lux.md` ao lado. Pergunta: "sala escura com picos?"
3. `cor (0/1)` a 0 com curvas a 1: tem de ficar **cinza puro**, sem tinta azul nas sombras.
4. Custo: `MB2.__perf()` com fog 0 vs 0.02 e curvas 0 vs 1 (deve ser ~0).

Decisão tua: defaults finais de névoa e exposição. Anota em `docs/f17-visual.md` §1.3.
