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
