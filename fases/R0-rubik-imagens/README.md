# R0 — imagens do Rubik (F0, pré-visualização estática)

Imagens da bola 2D real com o efeito congelado em baralhado / a meio / resolvido, por padrão.
Os PNG ficam **fora do git** (16 MB); a folha de comparação está publicada como artifact
**"Rubik na bola"**: https://claude.ai/code/artifact/d03fa621-4898-42b1-b8c0-d52f5cbcd2fa

Pastas: `colunas/`, `diagonais/`, `xadrez/`, `trovoes/`, `trovoes-variantes/`.
Nomes: `<padrão>-solve{0,50,100}-f{100,50}.png`; `colunas-ref-sem-efeito.png` é a bola de hoje.

Refazer as imagens: `node tools/rubik-shots.js` (com o atalho `start-Mirror-Rubik` a correr).

Ver ao vivo (atalho `start-Mirror-Rubik`, depois trocar o URL):
`http://127.0.0.1:8099/app/index-v2.html?src=music&rubik=colunas&solve=1&forca=1`
(outros parâmetros em `docs/skin-rubik.md` §5).

Checklist:
- [ ] As colunas resolvidas leem-se, com juntas verticais de polo a polo?
- [ ] O baralhado com força > 0 incomoda ou dá vida?
- [ ] Que variante de raio fica?
- [ ] Diagonais: ficam ou saem?
