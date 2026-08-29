# Brief F1 — Sonnet: esqueleto, sala, câmara, luzes mínimas, painel `d` (`spike-babylon/v2/`)

Lê **só isto** antes de começar (não leias os ficheiros inteiros):
1. `docs/plan-babylon-v2.md` — objetivo, prioridades, contrato.
2. `docs/parity-canvas2d.md` §2 (CONFIG), §5 (painel `d` — 54 sliders e persistência), §1.5.
3. `web/index-v2.html` linhas **69-165** (CONFIG — copia verbatim para `v2/config.js`), **166-176** (mini/scale,
   só copiar o CONFIG; a Fase 6 liga), **773-870** (painel `d`: array `sliders`, `PERSIST`, `KNOB_DEFAULTS`,
   `knobsGet/knobsSet`, botões, `mb.dbgSize`), **1-58** (CSS do `#dbg`).
4. `docs/babylon-reference.md` §1 (engine WebGPU/WebGL2), §3 (SpotLight, HemisphericLight), §9 (loop/HUD).
5. `spike-babylon/scene.js` linhas **28-45** (engine), **50-75** (câmara + sala), **370-395** (HUD e `__perf`),
   `spike-babylon/index.html` (base do HTML).

## Entrega
- `v2/index.html` + `v2/main.js` (type=module, top-level await): engine (`?webgl=1` força WebGL2 — o WebGPU
  `initAsync` pendura com o tab em segundo plano, o orquestrador precisa disto para screenshots), `scene.clearColor`
  de `bgGrey`, resize, loop, HUD (custo real de `scene.render()` mediano, facetas, ms, engine), erros no ecrã
  como no spike v1. Expor `window.MB2 = { scene, engine, camera, cfg, __perf }`.
- `v2/config.js`: `CONFIG` copiado verbatim + chaves novas com defaults: `tileSizeVar 0.35`, `tileTone 'hash'`,
  `tileLayout 'offset'`, `mirrorMetallic 0.92`, `mirrorRoughness 0.22`, `envIntensity 2.4`, `spotLightIntensity 900`,
  `spotDist 6.0`.
- `v2/room.js`: 5 planos das medidas `CONFIG.room`, material mate escuro (0.055), `maxSimultaneousLights 12`.
- Câmara `ArcRotateCamera`: pose inicial em (0,0,+camDistance) a olhar a origem, **fov calculado** para a bola
  ocupar `ballSizeVH` da altura (não a olho); rato orbita/zoom; tecla `0` repõe a pose.
- Luzes mínimas: para `i < spotCount`, `SpotLight` na posição `dirFromAzEl(az,el)·spotDist`, apontada ao
  centro, `angle = 2·atan(radius·spotRadiusMul/spotDist)·2.2`, `intensity = spotLightIntensity · spots[i].intensity`;
  `HemisphericLight` de `shade` (key·0.25). Atualizar posição/intensidade quando os knobs mudam.
- **Painel `d`** (`v2/panel.js`): os 54 sliders com **os mesmos nomes, ordem, ranges e steps**, mesmo `PERSIST`,
  `localStorage['mb2.knobs']` (chave própria — não colidir com `mb.knobs` da bola atual), `KNOB_DEFAULTS`, botões
  "repor ficheiro gravado" / "repor knobs (defaults)" / "gravar" (este último desativado até à Fase 5), `mb2.dbgSize`.
  Sliders cujo efeito ainda não existe ficam com sufixo ` (fase N)` no label. **Mais** os novos: `espelhos: variação`,
  `espelhos: tom (0=hash/1=real)`, `espelhos: alinhados (0/1)`, `pbr: metallic`, `pbr: roughness`, `pbr: ambiente`,
  `focos: luz (lm)`, `focos: distância`. Ao mudar filas/variação/tom/alinhados chama `ball.rebuild()` (API do Opus:
  `createBall(scene, CONFIG)` → `{mesh, rebuild, update, tiles}`; se ainda não existir, stub).
- `v2/PARITY.md`: tabela com todos os itens de `parity-canvas2d.md` §1-§7, estado ⏳, e §2/§5 já preenchidos.
- `spike-babylon/serve.py` já serve `v2/` (é a mesma pasta) — só confirmar.

## Não fazer
Não tocar em `web/`. Nada de feixes/pontos/explosão/corpos dos focos. Não leias `music.js`.

## Feito quando
`http://127.0.0.1:8099/v2/index.html` abre sem erros, bola do Opus visível iluminada por 2 spots, painel `d` com
todos os knobs a persistir entre reloads, HUD com ms, `?webgl=1` funciona.
