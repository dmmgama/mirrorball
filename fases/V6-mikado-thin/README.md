# V6 — Mikado em thin instances (W6, S14) · commit `3e05eb9`

## O que foi feito
- `spike-babylon/v2/mikado.js`: 672 meshes → **4 bases** (`mikadoTube`, `mikadoRail`, `mikadoCap`,
  `mikadoRod`) com thin instances. Cor/brilho por bloco via instance buffer `color` (tubo `unlit` +
  `useVertexColor`), zero escrita em materiais por frame; upload só quando a cor ou o agrupamento muda.
- Matrizes escritas só no `layout()`. Par liga/desliga simétrico (`restoreEnabled` repõe contagens).
- API pública igual; `main.js` não mudou. `mikado.meshes` tem 4 entradas em vez de 672.

## O que verificar (bola v3, painel `d` grupo Mikado)
1. O mikado **aparece** e parece igual ao de antes (barras, calhas, tampas, tirantes). Brilho e
   greyscale iguais — o tubo passou a `unlit`, é caminho de shader diferente; compara com memória.
2. `mikado (0/1)` 1→0→1 várias vezes: volta sempre inteiro. Muda `mikado: máx barras`/densidade com o
   mikado desligado e liga: reconstrói bem.
3. Modo **blocos**: só o bloco aceso brilha, os outros ficam no repouso.
4. Num drop, as rajadas continuam a acender os blocos certos.
5. Reflexo na bola (probe): o mikado continua a aparecer refletido nas facetas.
6. `MB2.__perf().activeMeshes` desceu (~670 a menos) e `medianRenderMs` não subiu.

Mau sinal: mikado invisível (culling), tudo branco/preto, blocos todos a acender juntos.
