# F17 — pista visual (frente B): realismo e perf

Documento vivo da **pista V** do `docs/plan-s13-faseado.md` §2 (V0…V6). Cada fase acrescenta aqui a
sua secção. Entradas: `docs/research-gpu-offload.md` §5-§7 (G1-G4), `docs/research-realismo.md` §4-5
(R1-R5), `docs/mapa-frentes.md` §1 (contratos) e §3 (armadilhas Babylon).

**Criado:** 2026-09-01 (S13, fase V0).

---

## 0. Baseline V0 — o primeiro número limpo

Cinco fases (F11→F15) passaram sem uma medição de perf fiável. Antes de gastar os ~13 ms de margem
em luz e ar (V2 fog, V3 exposição, V5 sombras), é preciso **um número de partida medido no pior
caso**, para as fases seguintes poderem dizer "custou X ms" em vez de "parece igual".

O que V0 já mudou no código: **G1 — `freezeWorldMatrix()`** nos 5 planos da sala e nos pilares
(`spike-babylon/v2/room.js`). Ganho estimado pelo research: −0,1 a −0,3 ms; risco zero (geometria
estática, knobs de dimensão são ⟳). Ver §0.4.

### 0.1 Porque é que o David mede e o agente não

Automação mente: com o tab em **background** o Chrome estrangula o rAF (throttling), o
`medianRenderMs` cai para valores irreais e as meshes ativas ficam congeladas na última volta
desenhada. Regras (brief padrão do plano §5, ponto 8):

- O tab **tem de estar em foco e visível** (janela à frente, não minimizada, não noutro ecrã virtual).
- **Nunca** forçar `scene.render()` pela consola para "obter um número" — mede um frame fora do loop,
  sem o custo real do pipeline, e polui as amostras do `__perf()`.
- Nada de screenshots automáticos nem de abrir o Chrome do David por fora.

### 0.2 Cenário de medição — **pior caso** (repetir igual antes e depois)

Fixar exatamente esta configuração nos dois lados da tabela, senão os números não são comparáveis.

| Item | Valor | Onde se põe |
|---|---|---|
| Mikado | **sala-toda = 1** (cobertura máxima) | painel `d`, grupo Mikado |
| Bola | **Ø 3,0 m** | `bola: diâmetro (m)` = 3.0 |
| Vultos | **densidade máxima** (pool cheio) | grupo Vultos, densidade no topo |
| Pilares | **todos ligados** | grupo Pilares, nenhum `pilar N (0/1)` a 0 |
| Painel `d` | **FECHADO** durante a medição | tecla `d` (o popover repinta e mexe no número) |
| HUD | indiferente, mas **igual** nas duas medições | tecla `h` |
| Câmara | posição inicial (**tecla `0`** repõe) | tecla `0` |
| Fonte | sem música a tocar (cena parada, sem gestos a mudar o custo entre amostras) | — |
| Janela | mesmo tamanho/zoom nas duas medições | — |
| Backend | anotar WebGPU ou WebGL2 (a consola diz "MB2 pronto — WebGPU") | — |

Sequência: repor câmara (`0`) → aplicar o cenário → fechar o painel (`d`) → **esperar 2 s** (o
`__perf()` é uma janela deslizante de 60 frames, ~1 s; 2 s garante que já não há amostras do estado
anterior) → colar o snippet.

Os knobs ⟳ (dimensões da sala/pilares/pé-direito) só entram no **reload** — se mudar algum, F5 antes
de medir.

### 0.3 Snippet — colar na consola do Chrome (F12) com o tab em foco

```js
// MirrorBall V0 — baseline de perf. Tab EM FOCO, painel fechado, 2 s parado antes de correr.
(() => {
  const p = MB2.__perf();
  const meshes = MB2.scene.getActiveMeshes().length;
  const verts = MB2.scene.getTotalVertices();
  const out = {
    medianRenderMs: +p.medianRenderMs.toFixed(2),
    amostras: p.n,                       // deve ser 60 — se for menos, esperar mais e repetir
    activeMeshes: meshes,
    totalVertices: verts,
    tiles: p.tiles,                      // facetas da bola (contexto: muda com o Ø)
    backend: MB2.engine.isWebGPU ? 'WebGPU' : 'WebGL2',
    fps: +MB2.engine.getFps().toFixed(1),
  };
  console.table(out);
  return out;
})()
```

Correr **três vezes seguidas** (com ~2 s entre elas) e registar a **mediana das três**
`medianRenderMs`. `activeMeshes`/`totalVertices` devem ser estáveis; se oscilarem muito é porque
algo (vultos, mikado) ainda está a construir-se — esperar e repetir.

Notas sobre os números:
- `medianRenderMs` = mediana do tempo de `scene.render()` nos últimos 60 frames (main.js:1634-1641).
  É **tempo de CPU do render**, não o frame inteiro; `fps` dá o contexto do frame.
- `getActiveMeshes()` = o que sobrevive ao frustum culling **desta** posição de câmara — daí a
  câmara ter de ser a mesma nas duas medições (tecla `0`).
- `getTotalVertices()` é cumulativo desde o arranque em algumas versões do Babylon; se crescer entre
  leituras, tomar a **primeira** leitura após o reload como válida e anotá-lo.

### 0.4 Tabela antes/depois — **a preencher pelo David**

"Antes" = commit anterior a este (sem `freezeWorldMatrix`); "depois" = este commit. Para medir o
"antes" sem voltar atrás no git, basta correr na consola, antes do snippet:
`[...MB2.scene.meshes].forEach(m => m.unfreezeWorldMatrix && m.unfreezeWorldMatrix());` — devolve a
cena ao comportamento pré-V0 sem reload (e um F5 repõe o freeze).

| Medição | `medianRenderMs` | `activeMeshes` | `totalVertices` | `fps` | backend | notas |
|---|---|---|---|---|---|---|
| **Antes** (sem freeze) |  |  |  |  |  |  |
| **Depois** (V0, com freeze) |  |  |  |  |  |  |
| Δ |  |  |  |  | — |  |

Expectativa do research: Δ `medianRenderMs` entre −0,1 e −0,3 ms; `activeMeshes` e `totalVertices`
**iguais** (o freeze não remove nada da cena — se mudarem, algo está errado).

### 0.5 O que a baseline decide a seguir

- Se `medianRenderMs` estiver muito abaixo do orçamento (≈16,7 ms a 60 Hz), V2/V3/V5 têm margem
  confortável e **V6** (mikado em thin instances) não se justifica — o plano diz expressamente que
  V6 só acontece "se V0 mostrar draw calls como gargalo".
- Se `activeMeshes` estiver na casa das centenas/milhar (a renderList do probe tinha 1391 meshes,
  `mapa-frentes.md` §B), o gargalo é de draw calls e V6 sobe de prioridade.
- Cada fase seguinte (V2 fog, V3 exposição, V5 sombras) repete **este mesmo cenário** e acrescenta
  uma linha à sua própria tabela, comparando com a linha "Depois" daqui.

### 0.6 O que ficou por congelar (e porquê)

| Mesh / grupo | Congelado? | Porquê |
|---|---|---|
| 5 planos da sala (`room_back/floor/ceil/left/right`) | **sim** | position/rotation escritas uma vez em `plane()`; dimensões são knobs ⟳ (reload) |
| pilares (`pillar_L0..R2`) | **sim** | position uma vez em `box.position.set()`; vão/passo/lado são knobs ⟳; `applyPillarToggles()` usa só `setEnabled()` |
| bola, dots, corrente | não | rodam por frame (`rotationRpm`) |
| mikado, chapéus, robots | não | retarget/pan-tilt ao vivo; e `mikado.rebuild()` refaz a disposição |
| vultos (crowd) | não | dançam por frame |

**Regra que fica:** se um knob passar a mexer `position`/`rotation`/`scaling` de um plano ou pilar ao
vivo, tem de chamar `unfreezeWorldMatrix()` antes — está anotado nos dois comentários do `room.js`.


### 0.5 Leituras reais do David (2026-09-02 00:00, S13) — NÃO é a baseline limpa

Feitas ao vivo, HUD `h` (`render` = mediana do `scene.render`), depois de restart do PC e de trocar
de browser (o Chrome com extensões/tabs dava 180-443 ms). Cenário: knobs por defeito no browser novo
(filas 48). Não foi o protocolo §0.2 (pior caso) — é uma leitura de sanidade.

| Cenário | Backend | render (ms) |
|---|---|---|
| V3, manual, `pontos: losango` 0 | WebGPU | ~180 (browser velho) → ~70 (browser novo) |
| V3, manual | WebGL2 (`?webgl=1`) | **~30** |
| V3, `?src=music` com música | WebGL2 | **~70** |
| master (`:8098`), mesmos dois modos | WebGL2 | "mais ou menos parecido" |

**Conclusões:** (1) os merges V0/V1/K1 **não** são a causa — o master dá o mesmo; (2) há um custo
base de ~30 ms muito acima dos 4-7 ms medidos em S9-S11 — a máquina ainda parece degradada, repetir
noutro dia; (3) **o modo música custa +40 ms dentro do `scene.render`** — suspeita principal:
o motor a mexer nas luzes/spots a cada frame provoca recompilação de shaders (armadilha nº5 de
`mapa-frentes.md` frente B: nº de luzes ativas muda → +7-17 ms por material). É uma dívida nova da
frente B/D, a investigar como fase **V0b** (Opus) antes de V2: medir com `spotsMotor` a 0, com os
spots a intensidade fixa, e com `engine.getCaps()`/`material.onCompiled` a contar compilações.

### 0.5b V0b (W1, S14) — porquê o modo música custava +40 ms: lido no código, corrigido na cena

**O que a métrica mede.** `render` do HUD `h` = `scene.onBeforeRender → onAfterRender`; o loop
principal (`scene.registerBeforeRender`) corre DENTRO desse intervalo. Logo "+40 ms no
`scene.render`" inclui todo o JS por frame dos módulos (ball/spots/beams/hats/mikado…) e a
preparação de materiais (defines/shaders), não só o draw.

**Causa 1 (constante, manual e música) — `Light.setEnabled` sem guarda.** No `vendor/babylon.js`
(9.23) `Light.setEnabled(v)` faz `super.setEnabled(v)` e depois `_resyncMeshes()` SEM verificar se
`v` mudou: percorre TODAS as meshes da cena e, por mesh, `isEnabled()` + `canAffectMesh` (um
`excludedMeshes.indexOf(mesh)` linear — os spots da bola excluem 5 planos + todos os vultos).
O código chamava `setEnabled` por frame em ~25 luzes (`main.js` spots ×`MAX_SPOTS`, ambient ×3;
`robots.js:167` ×4; `hats.js:611/613/617` ×N; `mikado.js:830/833` ×4) → dezenas de milhar de
`indexOf` por frame com ~1400 meshes. Não é os 40 ms, mas é uma fatia do "30 ms base".

**Causa 2 (só música) — luzes a ligar/desligar A CADA BATIDA → defines/shaders.** Quando o
`setEnabled` MUDA mesmo, `_resyncLightSource` marca `_markSubMeshesAsLightDirty` em cada mesh
afetada; no frame seguinte cada material refaz os defines (`PrepareDefinesForLights`) e, se a
combinação (tipo de luz por índice em `mesh.lightSources`) for nova, `createEffect` → compilação
síncrona de um shader PBR (WebGL2: dezenas de ms). Em modo música isto acontecia continuamente:
- `music.js:fireFlash` → `MIRRORBALL.flash` → `choreo.flashes` → cada flash entra e sai de
  `ball.mountedSpots` (`ball.js:780` só monta `I > 0.02`) → o `used` do pool muda → `main.js`
  (antigo :602/:621/:626) fazia `light.setEnabled(I >= 0.02)` e `setEnabled(false)` nos slots
  seguintes → 2 toggles por flash, vários flashes por segundo.
- Gestos que levam um foco abaixo de 0,02 (single-beam, freeze, blackout, `MB.setSpot` com dim)
  → o foco sai de `mountedSpots` (`ball.js:767`) → os slots reordenam-se e o último desliga.
- Chapéus (`hats.js:611/613`) e mikado (`mikado.js:830/833`) ligam/desligam PointLights por
  flash/rajada — mesma mecânica, ficheiros fora do âmbito de W1 (ver "por fazer").
A ordem de `mesh.lightSources` depende da HISTÓRIA de enable (uma luz reativada entra no fim), por
isso as permutações eram muitas → muitos shaders diferentes ao longo de uma música, cada um
compilado uma vez; e mesmo com cache, o dirty obriga ~1000 submeshes a refazer defines.

**Hipóteses descartadas por leitura:** `light.intensity`/`diffuse`/`specular`/`direction`/`position`
são campos simples (sem dirty); `SpotLight.angle` tem setter que recalcula a projeção (caro mas não
recompila) — passou a escrever-se só quando muda; `sphereOpacity` → `ball.js:1370` já só muda
`transparencyMode` quando o modo muda; o estrobo de fundo já era idempotente (`updateStrobe`);
`maxSimultaneousLights`/fog/haze não são tocados por frame; `Color3` novos por frame existiam em
`spotColor()` (GC, menor) — removidos do caminho quente.

**O que W1 corrigiu (`main.js`, bloco "V0b: PERF DAS LUZES"; `ball.js` só `idx` em `pushSpot`):**
1. Patch a `BABYLON.Light.prototype.setEnabled`: devolve cedo sem `_resyncMeshes` quando o valor
   não muda, conta as mudanças reais. Vale para TODOS os módulos (chapéus/mikado/robots incluídos).
   Idem contadores em `AbstractMesh._markSubMeshesAsLightDirty` e `Material.markAsDirty`.
2. Histerese nos slots do pool dos focos: um slot que deixa de ter foco/flash fica ligado a I=0
   durante `SPOT_SLOT_HOLD_S = 2 s` e só depois `setEnabled(false)`. Flashes por batida e gestos
   curtos deixam de mudar a lista de luzes dos materiais.
3. Escritas idempotentes/sem alocação: `angle` só quando muda; cor por slot numa `Color3` própria
   (`.set`, nunca `= new Color3`); direção/posição via `copyFrom`; `RectAreaLight.width/height` só
   quando mudam; `setLightEnabled()` guarda local em spots e ambient.
4. Cor por foco lê `CONFIG.spots[m.idx]` (o índice real) em vez do índice da lista filtrada — o
   bug de "cor do foco errado quando um foco está apagado" desaparece de caminho.

**Instrumentação — `MB2.__perf()` campos novos:** `effects` (shaders compilados no engine),
`lightToggles`, `lightDirty`, `matDirty` (totais), `dFrames`/`dEffects`/`dLightToggles`/
`dLightDirty`/`dMatDirty` (deltas desde a chamada anterior), `lightsOn`, `spotSlotsOn`,
`spotSlotsHeld`, `activeMeshes`.

**Protocolo de medição (David, tab em foco, WebGL2 `?webgl=1`):**
1. Modo manual, knobs por defeito. `MB2.__perf()` duas vezes com ~10 s de intervalo. Esperado:
   `dEffects = 0`, `dLightToggles = 0`, `dLightDirty = 0`; `medianRenderMs` = base.
2. `?src=music` com música real. `MB2.__perf()`; esperar ~10 s de GROOVE com flashes; repetir.
   Esperado depois do V0b: `dEffects = 0` (nenhum shader novo por batida), `dLightToggles`
   pequeno (só chapéus/mikado — ver "por fazer"), `spotSlotsHeld` a oscilar 0-4.
   Se `dEffects > 0` continuar a subir por batida, a fonte são as PointLights dos chapéus/mikado.
3. Para isolar: painel `d` → `spotsMotor` 0 (o motor deixa de mexer nos focos e nos flashes) e
   repetir 2. Depois `chapéus: máx` 0 e `mikado (0/1)` 0, um de cada vez, a olhar para
   `dLightToggles`/`dEffects`/`medianRenderMs`.
4. Registar as três linhas (manual / música / música sem motor nos focos) na tabela §0.5.

**Por fazer (fora de W1):** `hats.js:611/613` e `mikado.js:830/833` devem manter as PointLights
ligadas a I=0 (com a mesma histerese) em vez de `setEnabled` por flash; `robots.js:167` idem quando
o dimmer cruza 0,005. Com o patch (1) o custo das chamadas sem mudança já desapareceu; ficam só
as mudanças reais.


## 1. V2 + V3 — fog nativo e exposição/ColorCurves (W2, S14, 2026-09-02)

Ficheiros: `main.js` (região do pipeline, logo a seguir ao `DefaultRenderingPipeline`), `config.js`,
`panel.js`, `knobs-default.json` (201 → **209** knobs). Não toca em luzes/spots (W1) nem em sombras (W5).

### 1.1 V2 — névoa nativa (`scene.fogMode`)

| Decisão | Valor | Porquê |
|---|---|---|
| Modo | **`FOGMODE_EXP`** (não EXP2) | com densidades desta ordem o EXP é legível ao knob: a 10 m 4 %, a 20 m 8 %; EXP2 é quadrático — quase nulo perto e abrupto ao fundo, pior para a pergunta do stop ("os pilares do fundo perdem nitidez?") |
| `sala: névoa densidade` | **0.004** (0-0.05, passo 0.001) | quase impercetível por defeito (R2: "calibrado baixo primeiro"); sobe-se ao vivo, sem rebuild |
| `sala: névoa cor (cinza)` | **0.03** (0-1) | cinza escuro coerente com `baseAlbedo` 0.055 meio iluminado; em skin white interpola para o mesmo branco do fundo (`applyBgGreySkin`), por isso a névoa nunca destoa do fundo |
| Exclusões | materiais **ALPHA_ADD** (feixes `beamMat`/`beamGlowMat`, pontos `dotMat`, auréola `haloMat`, incidentes `incidentMat`) → `fogEnabled = false` | o fog mistura para `fogColor`; num material aditivo isso é luz somada do nada e mata o contraste dos feixes. A varredura (`applyFogExclusions`) só corre quando `scene.materials.length` muda — 0 custo por frame |

O `haze` do motor continua a ser outra coisa (só pinta feixes/auréola) — os dois convivem.

### 1.2 V3 — exposição e ColorCurves

| Decisão | Valor | Porquê |
|---|---|---|
| `pós: exposição` default | **1 → 0.85** | aposta do David: exposição/range dinâmico é o maior ganho percetual num clube escuro; ACES mantém-se, só baixa o ponto de partida. Quem já tem `mb2.knobs` guardado fica com o seu valor (regra 9) |
| `pós: curvas (0/1)` | **1** | ligado por defeito (critério §6 do plano: "fog, exposição e losangos ligados por defeito"), mas subtil |
| `pós: sombras matiz` / `pós: sombras tinta` | **220 / 12** | azul frio nas sombras; `tinta` = `density` do `ColorCurves` (0-100), que é o que tinge — `saturation` só escala croma existente |
| `pós: altas matiz` / `pós: altas tinta` | **40 / 10** | âmbar quente nas altas-luzes (focos/latão) |
| `pós: curvas saturação` | **0** (-100..100) | escala global do croma, para o David puxar ou lavar |
| Meios-tons | fixos a 0 | não há knob: as curvas são só "frio em baixo, quente em cima" |

**Greyscale neutro (regra 6):** `updateColorCurves()` só liga `colorCurvesEnabled` se
`curvesOn ≥ 0.5` **e** `CONFIG.colorOn !== false`. Com `cor (0/1)` a 0 as curvas desligam-se por
completo (não basta pôr saturação a 0: a tinta é um multiplicador RGB e um cinza × tinta deixa de
ser cinza). A cor do fog é um escalar cinza, logo neutra em qualquer modo. O toggle `cor (0/1)` não
mudou (continua a chamar `updateWash`); a leitura é por frame, atua ao vivo.

**Custo:** os valores das curvas são uniforms (não recompilam); só o `colorCurvesEnabled` é um
define e só se escreve quando muda. O fog é um define por material (`FOG`) que já estava ligado
por omissão (`fogEnabled = true` em todo o material) — mudar `fogMode` de NONE para EXP recompila
uma vez no arranque, não por frame. **Por medir** pelo David com `MB2.__perf()` (protocolo §0).

### 1.3 Stops do David

1. V2: com/sem névoa (`sala: névoa densidade` 0 vs 0.004 vs 0.02) a olhar para os pilares do fundo.
2. V3: `pós: curvas (0/1)` 0 vs 1 e `pós: exposição` 0.85 vs 1, lado a lado com as fotos lux2-lux12
   de `f8-sala-lux.md` — "sala escura com picos?".
3. `cor (0/1)` a 0 com curvas a 1: tem de ficar cinza puro.

## 2. V5 — sombras projetadas (`ShadowGenerator`) (W5, S14, 2026-09-02)

Ficheiros: `main.js` (bloco novo "V5: SOMBRAS", antes de "loop, tempo, HUD"; chamada `updateShadows()`
no frame depois de `excludeBallFromRoomLights()`; campos novos em `MB2.__perf()`), `config.js`,
`panel.js` (grupo Sala & Geometria), `knobs-default.json` (209 → **220** knobs). Não toca em
`setSpot`/`updateSpotLights` (W1) nem no pipeline (W2). **Default desligado** até o David aprovar.

### 2.1 O que o código faz

| Decisão | Valor | Porquê |
|---|---|---|
| Luzes com sombra | as **N primeiras** da fonte escolhida (`sombras: fonte`): 0 = pinspots da bola (`spot0..`, nunca os slots de flash), 1 = pool do mikado (4 PointLight), 2 = flashes dos chapéus (PointLight, alcance 3 m) | as luzes de enchimento (wash, hemisféricas, RectAreaLight) nunca projetam — é o "hero" do research §4 #5 |
| Casters | bola (facetas + núcleo), corrente + gancho (thin instances), 4 bases do mikado (thin instances V6), pilares; vultos só com `sombras: vultos projetam (0/1)` | vultos = 640 meshes por passe (×6 num PointLight): só por medição |
| Receivers | 5 planos + pilares (`receiveShadows` já vinha do `room.js`), vultos (ligado ao ligar o rig, reposto ao desligar). **A bola não recebe** | a única luz que bate na bola é o próprio pinspot; uma esfera não se auto-sombreia do lado iluminado — só daria acne nas facetas (o risco n.º 1) |
| Filtragem | **PCF** (`usePercentageCloserFiltering`), `sombras: suavização` 0/1/2 = LOW/MEDIUM/HIGH; **3 = PCSS** (`useContactHardeningShadow`, `contactHardeningLightSizeUVRatio` 0.05) | pinspot = fonte pequena → sombra dura de orla limpa, PCF dá isso sem passes de blur; PCSS custa 2-4× (busca de bloqueadores + 32/64 taps), fica opcional |
| Profundidade | SpotLight `shadowMinZ` 0.5 / `shadowMaxZ` spotDist+30; PointLight 0.1 / `range` | intervalo apertado = precisão no mapa = menos acne; reposto ao desligar |
| Transparência | `transparencyShadow` + `enableSoftTransparentShadow` | a bola em raio-X (`sphereOpacity` < 1 → ALPHABLEND) continua a projetar, mais leve conforme a opacidade |
| Bias | `sombras: bias` 0.001, `sombras: normal bias` 0.01, `sombras: orla` 0.15 (`frustumEdgeFalloff`) | pontos de partida para 1024 px; o David afina ao vivo, são uniforms |
| Escuridão | `sombras: escuridão` 0.75 (1 = preto) → Babylon `darkness = 1 − knob` | o knob lê-se como "quanto escurece" |

**Armadilha que o research não viu:** uma sombra só aparece em quem a luz **ilumina**. Os pinspots,
os robots e o flash do mikado têm os 5 planos em `excludedMeshes` (fix S9 "parede de luz") — com a
fonte 0/1 a sombra da bola/mikado só cai nos **pilares e vultos**. `sombras: chão recebe (0/1)`
tira **só o chão** da exclusão dessas luzes enquanto as sombras estão ligadas (e repõe ao desligar).
Com os pinspots a 900 lm isso vai acender o chão por baixo da bola (é o cone a continuar para lá
dela) — é uma experiência para o David, não um default. Os chapéus (fonte 2) já pintam
chão/paredes/pilares por si: a sombra dos vultos no chão a cada flash sai sem tocar em exclusões,
mas cada chapéu é PointLight (6 passes) com alcance 3 m.

**Custo e motor:** 1 passe de profundidade por SpotLight ativa e por frame, 6 por PointLight (cubo).
Uma luz `setEnabled(false)` (gesto do motor a 0, `updateSpotLights`) não renderiza o mapa — o custo
cai sozinho, sem tocar no generator por frame. O rig só se (re)constrói quando muda um knob
estrutural (on/fonte/luzes/mapa/suavização/chão/vultos); darkness/bias/orla escrevem-se só quando
mudam; a renderList refresca-se quando `ball.mesh` muda (rebuild) ou `chainGen` muda (altura).
Ligar/desligar recompila uma vez os materiais dos receivers (define `SHADOW`), não por frame.
Par 0→1→0 simétrico: dispose dos generators, minZ/maxZ repostos, chão devolvido à exclusão,
`receiveShadows` dos vultos reposto.

### 2.2 Knobs (todos em `config.js`, grupo Sala & Geometria)

| Knob | Default | Faixa |
|---|---|---|
| `sombras (0/1)` | **0** | toggle |
| `sombras: fonte (0=focos,1=mikado,2=chapéus)` | 0 | 0-2 |
| `sombras: luzes máx` | 2 | 1-4 |
| `sombras: mapa (px)` | 1024 | 512/1024/2048 |
| `sombras: escuridão` | 0.75 | 0-1 |
| `sombras: suavização` | 1 (PCF médio) | 0-3 |
| `sombras: bias` | 0.001 | 0-0.02 |
| `sombras: normal bias` | 0.01 | 0-0.1 |
| `sombras: orla` | 0.15 | 0-1 |
| `sombras: chão recebe (0/1)` | 0 | toggle |
| `sombras: vultos projetam (0/1)` | 0 | toggle |

Regra 9: presets antigos sem estes knobs assumem os defaults (sombras desligadas). Greyscale
não é afetado (sombra é atenuação, não cor).

### 2.3 Protocolo de medição (David, tab em foco, `MB2.__perf()`)

Campos novos: `shadowMaps` (mapas renderizados este frame = luzes ligadas com generator),
`shadowPasses` (1 por spot, 6 por PointLight), `shadowCasters` (meshes na renderList),
`shadowMapPx`. Cenário do §0.2 (pior caso), 20 s cada leitura:

1. `sombras (0/1)` 0 → baseline do dia (`medianRenderMs`).
2. `sombras` 1, fonte 0, luzes máx **1 / 2 / 4**, mapa 1024 → custo por spot.
3. Mapa **512 / 1024 / 2048** com luzes máx 2.
4. Suavização **1 vs 3** (PCF vs PCSS).
5. `vultos projetam` 1 → o salto grande, se houver.
6. Fonte **1** (mikado) e **2** (chapéus) com luzes máx 2 → custo de PointLight (×6).
7. `chão recebe` 1 com fonte 0: é para VER, não para medir — o chão por baixo da bola acende.

Aceitação: ≤ 1 ms por spot a 1024 (research estimava 0,3-1,0). Acima disso, a fonte 0 a 512 px.

### 2.4 Riscos ao vivo (por verificar)

1. Acne nos **pilares** (caixas, faces a rasar o cone): subir `normal bias`; se sobrar, `bias`.
2. Sombra a **vazar por trás** de um pilar fino: `orla` mais baixa, mapa 2048.
3. WebGPU: PCF usa comparison sampler — se a sombra sair preta uniforme, testar `?webgl=1`.
4. Thin instances (corrente, mikado) a projetar: se não aparecerem, é a versão do bundle
   (`vendor/babylon.js`) — a corrente é o teste mais visível (links no chão com `chão recebe` 1).
5. `mikado (0/1)` 1→0 com sombras: as bases ficam `setEnabled(false)` e saem do mapa sozinhas.
6. `bola (0/1)` 0 com fonte 0: os pinspots continuam ligados mas sem bola → sem sombra (correto).

### 2.5 Stops do David

1. Fonte 0, luzes máx 2, `chão recebe` 0: há sombra da bola/corrente nos **pilares** quando o
   pinspot varre? (é pouco — a exclusão dos planos limita)
2. `chão recebe` 1: a sombra da bola no chão é "aquilo"? E o chão aceso vale a pena ou torra?
3. Fonte 1 (mikado) num drop: as barras riscam os pilares/vultos?
4. Fonte 2 (chapéus): silhuetas dos vultos no chão a cada flash?
5. Decidir o default de `sombras (0/1)` e da fonte com o número do §2.3 na mão.
