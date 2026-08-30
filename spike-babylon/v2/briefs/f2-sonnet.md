# Brief F2 — Sonnet: luzes Babylon (4 SpotLights + 3 RectAreaLight), painel ligado, PARITY (`v2/main.js`, `v2/panel.js`)

Estado: F1 aprovada. Os teus `main.js`/`panel.js`/`room.js`/`config.js` estão em `spike-babylon/v2/`. O Opus altera **só**
`ball.js` em paralelo e vai expor `ball.mountedSpots` (`[{S,H,C,r,I,az,el}]` — direção bola→foco `S` unitária, intensidade
final `I`) e `ball.ambientPoses` (`[{az,el,I}]`); `update(tSec, spots, E)` passa a receber `CONFIG.spots` crus com um campo
`on` (spotsOn) por spot. Enquanto ele não acabar, faz a tua parte com fallback (calcula `dirFromAzEl` tu próprio).

Lê **só isto**:
1. `docs/plan-babylon-v2.md` · os teus 4 ficheiros.
2. `docs/parity-canvas2d.md` §1.3, §1.4, §5.
3. `web/index-v2.html` **376-393** (spots montados: fade, `spotsOn`, `spotCount`, indireta a deambular), **880-890**
   (checkboxes `spot i` no painel), **100-104** (`ambient`, `shade`).
4. `docs/babylon-reference.md` §3 (SpotLight, RectAreaLight/`areaLightEmissionTexture`, HemisphericLight).

## Entrega
- `main.js`: até **6** `SpotLight` pré-criadas (`CONFIG.spots.length`), por frame posicionadas em `S·spotDist` a olhar `C`
  (de `ball.mountedSpots` quando existir), `intensity = spotLightIntensity·I`, `setEnabled(i < spotCount && on && I ≥ 0.02)`,
  `angle` como em F1. **3 `RectAreaLight`** (`ambient.n`) posicionadas em `dirFromAzEl(az,el)·(spotDist+1)` viradas para a
  bola, largura/altura de `areaDeg` (`2·dist·tan(areaDeg·D2R)`), `intensity = spotLightIntensity·I·ambientLightMul`
  (**knob novo** `indireta: luz ×`, 0-3, default 0.6). `HemisphericLight` de `shade` como está. Passa `E = {spotGain:1,
  sphereOpacity: CONFIG.sphereOpacity, haze: CONFIG.haze}` ao `ball.update`. Se `ball` não tiver `mountedSpots`, usa o teu
  cálculo (compatível com o stub).
- `panel.js`: tira o sufixo ` (fase 2)` dos knobs agora ligados: `focos: quantos`, `raio ×`, `orla`, `espelhos: brilho`,
  `spot0-3 az/el`, `luz geral`, `bola: luz/contraste`, `sphereOpacity`, `spotFadeMix`, `indireta: n/intensidade/área°/drift`
  (confere os nomes reais no array). Linha de **checkboxes `spot i`** (`:880-890`) → `CONFIG.spots[i].on`. Knobs novos:
  `pbr: glint mix` (`glintPbrMix` 0-1, 0.5), `indireta: luz ×`. Tudo persiste em `mb2.knobs` como já fazes.
- HUD: acrescenta `spots N/ambient N` ativos.
- `PARITY.md`: §1.3, §1.4, §5 atualizados (o Opus escreve §1.2 e a linha da opacidade — não pises).

## Não fazer
Não tocar em `ball.js` nem em `web/`. Nada de feixes/pontos/flashes/estrobo/coreografia/corpos. Sem `git commit`.

## Feito quando
`?webgl=1` sem exceções; 4 focos e 3 indiretas visíveis na bola e nas paredes da sala; checkboxes apagam focos; knobs de az/el
movem foco e mancha em conjunto; `MB2.__perf()` < 8 ms. Reporta nomes exatos dos knobs novos e o que ficou por ligar.
