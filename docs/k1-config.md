# K1 — constantes da cena para config (pista K, frente E)

**Feito:** 2026-09-01 (Sonnet, worktree `agent-a91953187165a1682`). Objetivo (David):
não deixar hardcoded o que pode ser config em ficheiro externo. Via existente:
`config.js` (defaults) → `knobs-default.json` (gerado por `node gen-knobs-default.js`) →
`panel.js` (`PERSIST`, `RENAMED`, `sanitizePreset`) → localStorage `mb2.knobs`.

**Regra seguida:** zero mudança visual — todo knob novo entra com o MESMO valor de hoje.

## 1. `BALL_DEFAULTS` (ball.js:86) — já coberto, nada a fazer

Verificados os 41 campos de `BALL_DEFAULTS` um a um contra `window.CONFIG` (config.js):
**todos** já têm entrada correspondente em `config.js` com o mesmo nome/valor, e `cfg(k)` já faz
`C[k] ?? BALL_DEFAULTS[k]`. `BALL_DEFAULTS` fica exatamente como estava — é o fallback (regra 7),
não a fonte. Não foi necessário mexer em `config.js` para isto nem em `ball.js` além do knob novo
da tabela abaixo (`colorHz`).

## 2. Tabela knob → ficheiro:linha (hoje) → valor

| Knob novo | Grupo painel | Constante substituída | Ficheiro:linha antiga | Valor | ⟳ ou ao vivo |
|---|---|---|---|---|---|
| `mikado: máx barras` | Mikado | `MAX_BARS` | `mikado.js:88` | 112 | ⟳ reload |
| `mikado: máx blocos` | Mikado | `MAX_BLOCKS` | `mikado.js:155` | 12 | ⟳ reload |
| `vultos: pool` | Vultos | `MAX_PEOPLE` | `crowd.js:85` | 80 | ⟳ reload |
| `chapéus: máx` | Chapéus & Robots | `MAX_HATS` | `hats.js:48` | 12 | ⟳ reload |
| `chapéus: luzes vivas máx` | Chapéus & Robots | `MAX_LIVE_LIGHTS` | `hats.js:356` (agora `hats.js:359-364`) | 4 | ⟳ reload |
| `sala: albedo base` | Sala & Geometria | `BASE_ALBEDO` | `room.js:37` | 0.055 | ⟳ reload |
| `bola: cadeia Hz` | Bola | `COLOR_HZ` | `ball.js:899` | 20 | **ao vivo** (sem rebuild) |

Todos persistem (`newSliders` → `PERSIST.add`), todos com valor inicial finito (regra 7), todos
com prefixo do elemento. `knobs-default.json` regenerado: **193 → 200 knobs**, diff = exatamente
as 7 linhas acima (confirmado com `node gen-knobs-default.js` + diff).

## 3. O que ficou hardcoded, e porquê

- **Teto duro de `MAX_LIVE_LIGHTS` continua 4 no código** (`Math.min(4, knob)` em `hats.js`):
  WebGL2 rebenta o shader dos materiais (`maxSimultaneousLights:12`) acima de ~12 PointLight
  simultâneas na cena; o knob só pode **descer** esse teto, nunca subir — pedido explícito do brief.
- **`MIN_GAP_S`/`SEQ_MIN_MS`** (teto de 3 Hz da sala, regra invariável do CLAUDE.md) continuam
  constantes — não são "o que pode ser config", são um teto de segurança físico.
- **`floorWoodColor`/`pillars.albedo`** não entraram no `sala: albedo base`: o pedido era só as 3
  componentes que a `BASE_ALBEDO` de hoje cobre (teto/paredes de fundo/paredes laterais); chão e
  pilares já tinham tom próprio, à parte, e não fazem parte deste hardcoded.
- **`PALETTE` do mikado** (vermelho/branco/azul, `mikado.js:93`) não estava na lista do brief — é
  paleta fixada na spec, não um número solto; fica fora do âmbito do K1.

## 4. Bateria da regra 9 — passos para o David correr ao vivo

Não corre em Node (todos os módulos tocados são Babylon/DOM: `mikado.js`, `crowd.js`, `hats.js`,
`room.js`, `ball.js`, `panel.js`, `main.js`). Passos com snapshot/restore do localStorage
(padrão `f15-vultos.md` §7, `mapa-frentes.md` §3):

1. **Snapshot**: abrir a bola (`:8099` ou `/mirrors-emotions`), consola →
   `localStorage.getItem('mb2.knobs')` — copiar/guardar antes de mexer em nada.
2. **Arranque limpo**: `localStorage.clear()` + reload. Esperado: **200** knobs no painel `d`,
   cena idêntica à de antes do K1 (nenhuma diferença visual), `MB2.__perf()` igual à baseline V0.
3. **`mb2.knobs` "da versão anterior"** (sem os 7 novos): construir/gravar um objeto com os ~193
   knobs de hoje SEM `mikado: máx barras`, `mikado: máx blocos`, `vultos: pool`, `chapéus: máx`,
   `chapéus: luzes vivas máx`, `sala: albedo base`, `bola: cadeia Hz` → `localStorage.setItem
   ('mb2.knobs', JSON.stringify(obj))` → reload. Esperado: os 7 assumem os DEFAULTS (112/12/80/
   12/4/0.055/20) sem erro, sem NaN, sem knob a ficar a zero à força; resto do ficheiro aplica-se
   normalmente.
4. **Valores não-default nos 7 novos**: gravar `mb2.knobs` com, por exemplo, `mikado: máx barras`
   = 60, `vultos: pool` = 40, `chapéus: máx` = 8, `chapéus: luzes vivas máx` = 2,
   `sala: albedo base` = 0.12, `bola: cadeia Hz` = 35 → reload. Esperado: pool do mikado com 60
   barras no máximo (densidade que pedisse mais é clampada e avisa uma vez, como já fazia), vultos
   com 40 no máximo, chapéus com 8 no máximo e só 2 luzes vivas simultâneas, sala mais clara
   (albedo 0.12), cadeia de cinza a recalcular a 35 Hz — tudo sem banner, sem erro na consola.
   `bola: cadeia Hz` deve mudar SEM reload (é o único ao vivo da lista) — mudar o slider e ver o
   `MB2.__perf()`/HUD reagir sem F5.
5. **Fora do teto duro**: tentar gravar `chapéus: luzes vivas máx` > 4 diretamente no localStorage
   (o slider do painel já limita a 0-4, mas testar o valor cru) → reload. Esperado: `Math.min(4, v)`
   em `hats.js` mantém o teto em 4, sem shader a rebentar em WebGL2.
6. **Lixo/knob removido**: incluir uma chave inventada (`'knob que nunca existiu'`) e um valor não
   finito (`NaN`/`undefined`) num dos 7 novos → reload. Esperado: lixo ignorado, valor não finito
   cai no fallback (112/12/80/12/4/0.055/20 respetivamente), sem exceção na consola.
7. **Restore**: `localStorage.setItem('mb2.knobs', <snapshot do passo 1>)` + reload — confirmar
   que a cena volta exatamente ao estado antes do K1.
8. **`node gen-knobs-default.js`** — já corrido nesta sessão: 193 → 200, diff = as 7 linhas da
   tabela §2. Repetir se o David voltar a mexer em `config.js`/`panel.js` antes de comitar.

## 5. Ficheiros tocados

`spike-babylon/v2/config.js`, `spike-babylon/v2/mikado.js`, `spike-babylon/v2/crowd.js`,
`spike-babylon/v2/hats.js`, `spike-babylon/v2/room.js`, `spike-babylon/v2/ball.js`,
`spike-babylon/v2/panel.js`, `spike-babylon/v2/main.js` (bloco `preApplyReloadKnobs` +
cache-busters), `spike-babylon/v2/knobs-default.json` (regenerado), `spike-babylon/v2/index.html`
(bump `main.js?v=41`). **Não tocado**: `web/music.js`, `web/music-config.json` (nunca commitado).

Cache-busters: `index.html` → `main.js?v=41`; dentro de `main.js` →
`room.js?v=5`, `panel.js?v=19`, `hats.js?v=15`, `mikado.js?v=10`, `crowd.js?v=5`, `ball.js?v=8`.

`node web/test-music-f2.js`: 15/16 (mesma falha pré-existente do gerador sintético/FSM, não
relacionada com K1 — `music.js` não foi tocado).
