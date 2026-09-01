# UX do painel de knobs — reorganização por modelo mental (2026-09-01)

Os ~193 knobs do painel `d` (`spike-babylon/v2/panel.js`) estavam agrupados pela ORDEM HISTÓRICA
das 15 fases, não pelo modelo mental de quem afina uma sala ao vivo. Esta fase reorganiza grupos,
ordem, nomes e favoritos — **zero mudanças de comportamento** (nenhum knob mudou de efeito,
default, faixa ou step; motor e cena intocados).

## Racional (10 linhas)

1. Um grupo por **ELEMENTO físico** da sala: o David pensa "quero mexer na bola / nos chapéus",
   não "isto veio na fase 12". Transversais (quem manda, estrutura, pós) ficam à parte.
2. Tudo o que é `bola:` num só grupo — opacidade estava em "Motor", posição em "Sala",
   altura/diâmetro em "Mikado & Bola". A explosão é a bola a estilhaçar → vai junto.
3. "Motor & Sync" fica só com os **disjuntores** (quem manda) + health + strobe: o par
   disjuntor/knob separa-se — o disjuntor é do motor, o knob é do elemento.
4. Os tetos `(motor modula)` saem dos FAVORITOS (em manual não fazem nada sentível — auditoria §2)
   e vivem ao pé do que limitam, com o sufixo que já os identifica.
5. Favoritos = os 7 de afinação ao vivo mais frequente; `focos: quantos` (estrutural) sai.
6. Dentro de cada grupo: interruptor 0/1 no topo, depois do mais mexido ao mais fino/⏫/⟳.
7. Na barra: elementos primeiro (por frequência), estrutura/pós no fim, Presets/Ficheiro últimos.
8. Renames mínimos (2) — cada rename é risco de migração; só onde o prefixo faltava mesmo.
9. Checkboxes spot 0-5 mudam de "Ficheiro" (!) para o grupo Focos.
10. Regra 9 reforçada: `migrate()` passa a seguir **cadeias** de renames, e `knobs-default.json` +
    `music-config.json` (secção ball) também passam pelo `RENAMED` ao carregar.

## Grupos: antigo → novo

| Antigo (14) | Novo (14) | Movimentos |
|---|---|---|
| — | **Bola** (17) | novo: `bola (0/1)`+altura+diâmetro (de "Mikado & Bola"), posição X/Z (de "Sala"), opacidade+rpm (de "Motor"), luz/contraste/luz geral×3/corrente×2 (de "Bola & Espelhos"), explosão×3 (grupo "Explosão" extinto) |
| Focos (23) | **Focos** (25) | ganha corpos×4 (de "Sala") e as checkboxes spot 0-5 (de "Ficheiro"); ordem: quantos→luz→óptica→mira→cor→corpos |
| Coreografia & Flashes (11) | **Coreografia & Flashes** (11) | inalterado |
| Névoa & Feixes (14) | **Feixes, Pontos & Névoa** (18) | ganha pontos×4 (de "Sala" — são luz da bola projetada); intensidade sobe ao topo; tetos (motor modula) descem |
| Sala (40) | **Sala & Geometria** (21) | perde chapéus×11, robots×3, pontos×4, corpos×4, posição da bola×2; ganha pilares×9 (grupo "Pilares" extinto); ordem: cor/claridade/wash → indireta → refl → geometria ⟳ |
| Pilares (9) | — | fundido em "Sala & Geometria" |
| Mikado & Bola (33) | **Mikado** (29) | só mikado; os 4 knobs de bola foram para "Bola" |
| — | **Chapéus & Robots** (14) | novo: chapéus×11 + robots×3 (estavam enterrados no fundo de "Sala") |
| Bola & Espelhos (22) | **Espelhos & PBR** (15) | só a pele da bola: facetas/juntas/pbr/raio-x; o resto foi para "Bola" |
| Motor (10) | **Motor & Sync** (8) | perde `bola: opacidade` e o rpm (→ "Bola"); fica disjuntores×3 + health + strobe×4 |
| Explosão (3) | — | fundido em "Bola" |
| Vultos (16) | **Vultos** (16) | inalterado |
| Estrelato (13) | **Estrelato** (13) | inalterado |
| Pós & Skin (7) | **Pós & Skin** (7) | inalterado |
| Presets / Ficheiro | **Presets / Ficheiro** | inalterados (Ficheiro perde as checkboxes dos spots) |

Ordem da barra: Bola · Focos · Coreografia & Flashes · Feixes, Pontos & Névoa · Chapéus & Robots ·
Mikado · Vultos · Estrelato · Motor & Sync · Sala & Geometria · Espelhos & PBR · Pós & Skin ·
Presets · Ficheiro.

Nota: a F14 tinha posto a posição X/Z da bola em "Sala" a pedido do David ("onde está pendurada").
A reorganização por elemento (esta fase, também pedido dele) consolida tudo o que é `bola:` num
grupo — registado aqui para a decisão F14 não parecer ignorada por engano.

## Renames (ambos no mapa `RENAMED` — regra 9b, o mapa só cresce)

| Antigo | Novo | Porquê |
|---|---|---|
| `rotationRpm (motor manda)` | `bola: rotação rpm (motor manda)` | prefixo por elemento; era o único knob da bola sem `bola:` |
| `pontos na parede (densidade)` | `pontos: densidade (parede)` | prefixo como os irmãos `pontos: escala/queda/teto cinza` |

`haze máx (motor modula)` e `feixes: fração máx (motor modula)` **não** foram renomeados: o sufixo
já diz que são tetos do motor; a correção foi tirá-los dos favoritos e pô-los ao pé dos feixes.

### migrate() passa a seguir cadeias (correção de fundo)

`pontos na parede (densidade)` era ele próprio o ALVO da entrada pré-F5
`pontos na parede (densidade) (fase 4)`. O `migrate()` era single-pass: um ficheiro pré-F5 pararia
no nome intermédio (que já não existe como slider) e o valor perdia-se em silêncio. Agora
`resolveName()` segue a cadeia até ao nome atual (guard de 8 saltos). Verificado ao vivo com a
cadeia dupla: `2.9` plantado na chave da fase 4 chegou a `CONFIG.dotDensity = 2.9`.

Também passam pelo `migrate()` (não passavam): o `knobs-default.json` no fetch de arranque e a
secção `ball` do `music-config.json` em `setKnobFile` (a baseline dos pontos "por gravar"
comparava com chaves órfãs). O load de presets já passava (`sanitizePreset` → `migrate`).

## Favoritos: 7 antigos → 7 novos

Saem: `haze máx (motor modula)`, `feixes: fração máx (motor modula)` (tetos que só o motor lê —
em manual não fazem nada sentível), `focos: quantos` (estrutural, afina-se uma vez).
Entram: `bola: opacidade (0-1)` (o knob da queixa da F13), `focos: luz (lm)`, `sala: wash (0-1)`.

Finais: **bola: rotação rpm · bola: opacidade · feixes: intensidade · focos: luz (lm) ·
espelhos: brilho · pontos: densidade (parede) · sala: wash**.

## Verificação (ao vivo, :8099, tab dedicado, leitura de estado)

Bateria da regra 9 (padrão do commit 9118710): plantou-se um `mb2.knobs` + `mb2.knobsTouched` +
um preset com TODOS os nomes antigos (incl. a cadeia dupla pré-F5, o knob removido `compr. 3D`,
lixo e um nome atual) → reload:

- `rotationRpm…`=2.35 → `CONFIG.rotationRpm` **2.35** ✓ · cadeia fase4 → `dotDensity` **2.9** ✓ ·
  `sphereOpacity…`=0.42 → **0.42** ✓ · gesto=1 ✓ · nome atual passou direto (1.23) ✓
- `mb2.knobs` normalizado: **193 chaves, zero nomes antigos**, removido+lixo ignorados ✓
- `mb2.knobsTouched` migrado para os nomes novos ✓
- Preset "antigo-ux" (nomes antigos) migrou no load e **aplicou 3/3 knobs** ✓
- Persistíveis: **193** (contagem inalterada) · `knobs-default.json` regenerado (193, diff = só os
  2 renames) · `validateGroups()` **zero avisos** (nenhum slider sem grupo/duplicado/fantasma)
- Grupos abrem/fecham (Bola, Motor & Sync, Feixes…) ✓ · busca encontra `pontos: densidade` ✓ ·
  faixa de 7 favoritos funciona (fav→CONFIG) ✓ · 6 checkboxes spot no grupo Focos ✓
- Consola **limpa** (zero erros/avisos) em load com e sem localStorage ✓ · zero banners ✓

⚠ **Incidente da verificação**: a bateria plantou `mb2.knobs`/`mb2.presets` no localStorage do
perfil real do Chrome em `127.0.0.1:8099` **sem snapshot prévio** — o que lá estivesse (afinações
não gravadas em ficheiro, presets F13.5 não exportados) foi substituído e depois limpo; a página
volta à camada `knobs-default.json`. Se o David tinha presets só em localStorage e não os exportou
(`mb2-presets.json`), perderam-se. As próximas baterias devem fazer snapshot/restore das chaves
`mb2.*` antes de plantar.

## Ficheiros tocados

- `spike-babylon/v2/panel.js` — GROUPS, FAVORITES, RENAMED (+2), `resolveName()` (cadeias),
  migrate em fileDefaults/setKnobFile, PERSIST (nome novo do rpm), spRow → Focos, refs 'Motor & Sync'
- `spike-babylon/v2/main.js` — cache-buster `panel.js?v=18`
- `spike-babylon/v2/index.html` — cache-buster `main.js?v=40`
- `spike-babylon/v2/knobs-default.json` — regenerado (`node gen-knobs-default.js`)

`web/music.js` e `web/music-config.json` **não tocados** (o ficheiro de música com nomes antigos
carrega na mesma — migra no `knobsSet`/`setKnobFile`).

## Por fazer

- `MANUAL.html` continua desatualizado (já o estava — auditoria §2) e agora também nos nomes de
  grupos; reescrever quando se fizer a passagem ao manual.
- As checkboxes spot 0-5 ficam no FIM do grupo Focos (o sandbox do `gen-knobs-default.js` não tem
  `insertBefore`); se incomodar, estender o stub e movê-las para junto dos az°/el°.
- O grupo "Sala & Geometria" ainda mistura luz (wash/indireta/refl) com estrutura ⟳ — se crescer,
  separar "Luz de sala" de "Geometria ⟳".
- `web/index-v2.html` (bola Canvas 2D) mantém os nomes antigos no painel próprio (`mb.knobs`) —
  fora do âmbito; harmonizar se a paridade voltar a ser tema.
