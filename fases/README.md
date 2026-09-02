# fases/ — uma pasta por fase, para o David rever sem agente

Cada pasta tem `start.bat` (arranca a bola no modo certo, ou corre a bateria em Node, e imprime o
checklist) e `README.md` (o que foi feito + o que verificar + o que é bom/mau sinal).

Ordem de revisão sugerida (S14, 2026-09-02):

| # | Fase | Modo | Porquê primeiro |
|---|---|---|---|
| 1 | `V0b-perf-musica` | v3 música | Se a perf não caiu, tudo o resto vê-se mal |
| 2 | `S1-relogio` | 2D música | Base de tudo o que é sync: os ticks batem com o bombo? |
| 3 | `S2-estrelato` | v3 música | Trocas em fronteira de compasso, reserva do all-on |
| 4 | `S3a-chapeus` | v3 música | Chase no bombo, um escritor |
| 5 | `V6-mikado-thin` | v3 | Mikado igual ao de antes, 4 meshes |
| 6 | `V2V3-fog-exposicao` | v3 | Decisão tua: névoa e exposição |
| 7 | `V5-sombras` | v3 | Decisão tua: sombras por defeito? |
| 8 | `K1-bateria-presets` | Node | Só confirmar 45/45 |
| 9 | `S3b-mikado-choreo` | v3 música | Rajadas no tempo, cool-down do drop |
| 10 | `S4-blackout` | v3 + 2D | Escuro antes do drop, haze fica |

As fases lançadas depois (S3b, S4, S3c, K2…) são acrescentadas aqui pelo agente à medida que
entram na branch. Regras fixas: nunca `music-config.json`; `?webgl=1` se algo sair preto; tab em
foco para medir; "repor knobs" antes de julgar defaults novos.
