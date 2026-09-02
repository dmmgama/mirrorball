# V5 — Sombras projetadas `ShadowGenerator` (W5, S14) · commit `8bd8415`

## O que foi feito
- Sombras em N luzes hero, knob `sombras: fonte`: **0** pinspots da bola · 1 pool do mikado (4
  PointLight) · 2 flashes dos chapéus. `sombras: luzes máx` 2 (1-4).
- Casters: bola (facetas + núcleo), corrente, 4 bases do mikado, pilares; vultos só com
  `sombras: vultos projetam (0/1)`. Receivers: 5 planos, pilares, vultos. A bola **não** recebe.
- Filtragem PCF (`sombras: suavização` 0/1/2) ou PCSS (3, custa 2-4×). Mapa 512/1024/2048.
  `sombras: escuridão` 0.75, `bias` 0.001, `normal bias` 0.01, `orla` 0.15.
- **`sombras (0/1)` default 0** — até tu aprovares. A 0 os generators são libertados.
- Armadilha: os pinspots/mikado têm os 5 planos em `excludedMeshes` desde o S9 (fix "parede de
  luz"), por isso com fonte 0/1 a sombra só cai em **pilares e vultos**. `sombras: chão recebe (0/1)`
  tira o chão da exclusão enquanto ligado (o chão por baixo da bola acende a 900 lm — experiência).
- `MB2.__perf()`: `shadowMaps`, `shadowPasses` (1 por spot, 6 por PointLight), `shadowCasters`, `shadowMapPx`.

## O que verificar (bola v3, `?webgl=1` se sair preto uniforme, painel `d` grupo Sala & Geometria)
1. `sombras (0/1)` → 1, fonte 0, luzes máx 2: há sombra da bola/corrente nos **pilares** quando o
   pinspot varre? (é pouco, pela exclusão dos planos.) Acne (riscas) nos pilares → sobe `normal bias`.
2. `chão recebe` 1: a sombra da bola no chão é "aquilo"? O chão aceso vale a pena ou torra?
3. Fonte 1 (mikado) num drop: as barras riscam pilares/vultos?
4. Fonte 2 (chapéus): silhuetas dos vultos no chão a cada flash? (`vultos projetam` 1)
5. Custo: `MB2.__perf()` com sombras 0 → fonte 0 luzes 1/2/4 → mapa 512/1024/2048 → suavização 1 vs 3.
   Aceitação: ≤ 1 ms por spot a 1024.
6. `sombras` 1→0→1 três vezes: cena volta exatamente ao mesmo, sem fugas (`shadowMaps` a 0 quando off).

Decisão tua: default de `sombras (0/1)` e da fonte, com o número do ponto 5 na mão. Sombra da bola no
chão sem torrar o chão precisaria de uma luz "só sombra" = adicionar luz = tua decisão.
