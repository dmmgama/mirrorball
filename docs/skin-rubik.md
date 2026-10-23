# skin-rubik — bola 2D (Canvas, `web/index-v2.html`)

Branch `skin-rubik`, worktree `../MirrorBall-skin-rubik` (a V3 em `../MirrorBall` não se toca).

## Ponto de partida (David, 2026-10-23)

- O David está a gostar muito de ver a **bola 2D** (`web/index-v2.html`): a bola funciona bem.
- **O motor de áudio (`web/music.js` v63, `?v=63`) está a funcionar muito bem.** Não se mexe no
  motor neste trabalho — a skin Rubik é só aparência da bola.
- Foco **só na bola**, não no que está à volta (sala, mikado, chapéus ficam fora — isso é a V3 Babylon).

## Decisões

1. Alvo = bola 2D (A), não a Babylon (B). — 2026-10-23
2. Servir a Rubik em **:8099** (`Mirror-Rubik-Start.bat` / atalho `start-Mirror-Rubik`), não em :8098:
   o sidecar só aceita áudio de :8099/:3739 (`audio-sidecar/server.js` `SPIKE_ORIGINS`). A Rubik e a
   V3 não correm ao mesmo tempo; se um dia for preciso, decide-se então (p.ex. :8098 no sidecar). — 2026-10-23
3. A afinação da bola 2D vem do `web/music-config.json` (secção `ball`, 220 knobs, manda sobre o
   localStorage) — copiado da V3 para a worktree. — 2026-10-23

## O efeito (David, 2026-10-23)

Não é cor nem cópia do cubo — é o **mecanismo**: a bola continua a girar e a fazer tudo normalmente;
de vez em quando **faixas da bola rodam à parte** (uma, blocos, variar; eventualmente em contra-sentido
— experimentar) até a bola ficar **"resolvida"**, e depois **desfaz-se**. É uma nuance, não o centro
das atenções: ligar/desligar, slider de força, e probabilidade de o motor o correr.

4. "Resolvido" = **padrão escondido nos tons** dos espelhos (tom de cada espelho vem da sua posição
   resolvida; baralhado lê-se aleatório como hoje), com ou sem **juntas alinhadas** conforme o padrão.
   Só juntas não chega (1-2 px). Padrões possíveis: riscas verticais, diagonais, xadrez… — 2026-10-23
5. Fase 1 só com **colunas**; os outros padrões entram depois, se a mecânica funcionar. Antes da
   mecânica, **ver imagens** da bola (F0). — 2026-10-23

## F0 — pré-visualização estática (2026-10-23)

`?rubik=colunas|diagonais|xadrez|trovoes&solve=0..1&forca=0..1&rpm=` em `web/index-v2.html`.
Knobs em `CONFIG.rubik` (pattern, force, solve, scramble 8, block 3, boltZig 4, boltEvery 16,
boltWidth 2, amp 0.30). Com force=0 e solve=0 a bola é idêntica à de hoje.

- Achado: o padrão dentro de `baseTileGrey` [0.045, 0.14] + afinação `ballContrast 0.5` /
  `ballLight 1` ficava com ~2-3 % de diferença → invisível. Fix: `rubik.amp` somado **depois** do contraste.
- Imagens (fora do git, 16 MB): `fases/R0-rubik-imagens/<padrão>/`; folha de comparação publicada
  como artifact "Rubik na bola". Leitura: colunas, xadrez e trovões leem-se no resolvido;
  diagonais só no hemisfério de baixo (precisam de trabalho).
