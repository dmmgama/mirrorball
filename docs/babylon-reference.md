# Babylon.js para a MirrorBall — referência prática

Escrito para um agente que nunca mexeu em Babylon e vai portar a bola de espelhos
(Canvas 2D → Babylon). **Tudo aqui foi verificado contra o bundle vendorizado**
`spike-babylon/vendor/babylon.js` (**v9.23.0**), não é de memória. Onde diz "MEDIDO",
foi medido no spike a 2026-08-29.

Docs oficiais: <https://doc.babylonjs.com> · Playground (testar snippets): <https://playground.babylonjs.com>
API: <https://doc.babylonjs.com/typedoc>

---

## 0. O modelo mental, em 30 segundos

Canvas 2D: **tu desenhas cada pixel**. Calculas a reflexão, projetas, pintas o polígono.

Babylon: **descreves uma cena e o GPU desenha**. Crias `Mesh` (geometria) com um
`Material` (como responde à luz), pões `Light`s, uma `Camera`, e chamas `scene.render()`
num loop. A reflexão deixa de ser código teu — é consequência do material ser metálico e
haver um ambiente para refletir.

Isto é a diferença que interessa para este projeto: na Canvas 2D o "brilho de um espelho"
é uma fórmula que escreveste; em Babylon é física. O trabalho passa de *desenhar* para
*montar a cena certa*.

```js
const engine = new BABYLON.Engine(canvas, true);      // ou WebGPUEngine, ver §1
const scene  = new BABYLON.Scene(engine);
const camera = new BABYLON.ArcRotateCamera('cam', -Math.PI/2, Math.PI/2, 7, BABYLON.Vector3.Zero(), scene);
const light  = new BABYLON.HemisphericLight('h', new BABYLON.Vector3(0,1,0), scene);
const ball   = BABYLON.MeshBuilder.CreateSphere('s', { diameter: 2 }, scene);
engine.runRenderLoop(() => scene.render());
```

**Unidades:** neste projeto a bola tem **raio 1**, para bater certo com o CONFIG da Canvas 2D
que mede tudo "em raios da bola" (`beamLen3D`, `incidentLen`, `room`, `camDistance`).

**Eixos:** Y é cima. A câmara está em −Z a olhar para a origem, portanto **az=0 aponta à
câmara**, igual à convenção do `index-v2.html`.

---

## 1. Engine: WebGPU vs WebGL2

```js
async function makeEngine(canvas) {
  if (navigator.gpu && BABYLON.WebGPUEngine) {
    try {
      const e = new BABYLON.WebGPUEngine(canvas, { antialias: true, stencil: true });
      await e.initAsync();                       // OBRIGATÓRIO, é async
      return e;
    } catch (err) { console.warn('WebGPU falhou:', err); }
  }
  return new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true }, true);
}
const engine = await makeEngine(canvas);         // top-level await ⇒ <script type="module">
```

- **`initAsync()` é obrigatório** no WebGPU; sem ele nada funciona.
- Como há `await` no topo, o `<script>` tem de ser `type="module"`.
- **MEDIDO:** nesta máquina o WebGPU entra (o spike corre em WebGPU). `engine.isWebGPU` diz qual está ativo.
- `BABYLON.WebGPUEngine.IsSupportedAsync` é uma **promise**, não um booleano — `if (await X.IsSupportedAsync)`
  é sempre verdadeiro mesmo sem suporte. Usa try/catch à volta do `initAsync()`, como acima.

---

## 2. Materiais: `PBRMaterial` e a armadilha do espelho

`PBRMaterial` é físico: descreves o **material**, não o aspeto.

| propriedade | o que faz |
|---|---|
| `metallic` | 0 = dielétrico (plástico, parede), 1 = metal puro |
| `roughness` | 0 = espelho perfeito, 1 = mate |
| `albedoColor` | cor base (greyscale aqui — regra 6) |
| `environmentIntensity` | quanto do ambiente/reflexo entra |
| `maxSimultaneousLights` | **defeito 4** — ver armadilha abaixo |

### ⚠️ Armadilha 1: espelho perfeito dá bola PRETA

**MEDIDO:** `metallic: 1.0, roughness: 0.06` → a bola sai preta. Está fisicamente certo:
um espelho puro quase não tem resposta difusa, por isso um pinspot só lá deixa um ponto
minúsculo. Um azulejo real é **vidro sobre espelhamento**, ligeiramente imperfeito:

```js
mirrorMat.metallic  = 0.92;
mirrorMat.roughness = 0.22;
mirrorMat.environmentIntensity = 2.4;
```

### ⚠️ Armadilha 2: só 4 luzes por material

**MEDIDO:** com 4 focos + 3 area lights + 1 key, as luzes a partir da 5ª eram
**silenciosamente ignoradas** e a bola ficava escura. Não há aviso.

```js
mirrorMat.maxSimultaneousLights = 12;   // em TODOS os materiais que recebem luz
```

### ⚠️ Armadilha 3: um espelho sem ambiente reflete o vazio

Metal só se vê pelo que reflete. Sem `environmentTexture`/`reflectionTexture` fica preto,
por muita luz que ponhas. Ver §4 (ReflectionProbe).

---

## 3. Luzes

```js
new BABYLON.SpotLight(name, position, direction, angle /*rad*/, exponent, scene)
new BABYLON.PointLight(name, position, scene)
new BABYLON.DirectionalLight(name, direction, scene)
new BABYLON.HemisphericLight(name, direction, scene)   // ambiente barato, sem sombras
new BABYLON.RectAreaLight(name, position, width, height, scene)
```

Comuns: `.intensity`, `.diffuse`, `.specular`, `.range`, `.radius` (tamanho da fonte →
suavidade das sombras), `.setEnabled(bool)`, `.includedOnlyMeshes` / `.excludedMeshes`.

### Pinspots (PAR36)

`intensity` em PBR é **fotométrico**: cai com 1/d². A uma distância de 6 raios,
**MEDIDO:** 260 era escuro de mais, **900** lê bem.

```js
const angle = 2 * Math.atan(raio / distancia) * 2.2;   // cone estreito, 4-12° reais
const L = new BABYLON.SpotLight('spot0', pos, dir, angle, 12, scene);
L.intensity = 900;
L.radius = 0.02;
```

### ⚠️ Os pinspots são OBJETOS na sala (requisito do David, 2026-08-29)

Na Canvas 2D os focos são fontes matemáticas fora do ecrã — nunca se vêem, só se vê o que
fazem. **Em 3D isso não chega.** Sendo um modelo tridimensional a sério, cada pinspot tem
de existir fisicamente na sala:

- um **corpo** visível (o PAR36: cilindro curto, greyscale, mate) montado numa parede,
  varão ou estrutura de teto — não a flutuar no vazio;
- a **luz nasce no corpo**, não num ponto abstrato: `SpotLight.position` = boca do corpo;
- a **lente acesa** (disco emissivo na boca) para se ver que o foco está ligado, e o
  dimmer a ler nela;
- o **feixe incidente** (o cone de névoa que vai do foco até à bola) parte do corpo — é o
  equivalente 3D do `cone incidente` da Canvas 2D (`incidentAlpha`, `incidentLen`).

Consequência prática: a câmara pode orbitar e ver o rig de lado, por isso as posições têm
de ser **plausíveis como montagem real** (ver `docs/lighting-design-research.md`: 2 opostos,
el 30-45°, nunca zenital, nunca apontado ao público). O que na 2D era "az/el de uma fonte
invisível" passa a ser "onde é que este projetor está pendurado".

```js
const corpo = BABYLON.MeshBuilder.CreateCylinder('par36_0', { height: 0.32, diameter: 0.22 }, scene);
corpo.position = pos;                      // na parede/varão
corpo.lookAt(BABYLON.Vector3.Zero());      // apontado à bola
corpo.rotate(BABYLON.Axis.X, Math.PI / 2); // cilindro tem eixo em Y
const lente = BABYLON.MeshBuilder.CreateDisc('lente0', { radius: 0.09 }, scene);
// material emissivo na lente; a intensidade segue o dimmer do foco
const L = new BABYLON.SpotLight('spot0', pos, dir, angle, 12, scene);
```

### `RectAreaLight` — a sala refletida (o que a `luz indireta` finge)

Isto é o achado mais relevante para este projeto. Uma area light é um **retângulo que
emite**, e o Babylon usa LTC (*linearly transformed cosines*) para calcular o reflexo
especular correto de um retângulo num material — que é exatamente o que um espelho faz
com uma parede clara.

Na Canvas 2D, `luz indireta` (`sp.wide`, `areaDeg`) aproxima isto com um cone largo e um
hash por tile. Aqui é a coisa real: cada espelho devolve **a parte da sala que lhe calha**.

```js
const L = new BABYLON.RectAreaLight('roomL', new BABYLON.Vector3(-5, 0.4, -1.5), 5, 3, scene);
L.intensity = 16;
L.direction = target.subtract(L.position).normalize();
L.areaLightEmissionTexture = someTexture;   // ← "textured area light": a sala tem textura
```

`areaLightEmissionTexture` é a propriedade real (confirmada no bundle) que torna a area
light *texturada* — o reflexo passa a mostrar o padrão da textura, não um retângulo liso.

---

## 4. Ambiente: `ReflectionProbe`

Um probe renderiza a cena para um cubemap a partir de um ponto — a sala vista do centro
da bola. É isso que os espelhos refletem.

```js
const probe = new BABYLON.ReflectionProbe('probe', 256, scene);
probe.renderList.push(parede, chao, teto, ...);          // NÃO metas a própria bola
probe.refreshRate = BABYLON.RenderTargetTexture.REFRESHRATE_RENDER_ONCE;  // sala estática = 1x
mirrorMat.reflectionTexture = probe.cubeTexture;
scene.environmentTexture   = probe.cubeTexture;
scene.environmentIntensity = 1.6;
```

`REFRESHRATE_RENDER_ONCE` é o que mantém isto barato. Se a sala passar a ter luzes que
mudam (flashes, strobe) e quiseres que a bola reflita isso, sobe para
`REFRESHRATE_RENDER_ONEVERYFRAME` — **mas mede**, é um render extra da cena inteira.

---

## 5. Geometria à mão (`VertexData`)

Para as 3992 facetas não se usa `MeshBuilder` — constrói-se a malha diretamente:

```js
const positions = [], indices = [], normals = [], uvs = [];
// … preencher (ver spike-babylon/scene.js buildBall(), que replica index-v2.html) …
const mesh = new BABYLON.Mesh('facets', scene);
const vd = new BABYLON.VertexData();
vd.positions = positions; vd.indices = indices; vd.normals = normals; vd.uvs = uvs;
vd.applyToMesh(mesh);
```

**Truque das facetas planas:** os 4 cantos calculam-se na esfera e depois projetam-se no
plano tangente (`v / (v·N)`), senão a faceta fica curva e o reflexo esborrata-se. A normal
é a mesma nos 4 vértices (é um espelho plano, não uma superfície suave).

---

## 6. Muitos objetos iguais: instances vs thin instances

| | quando |
|---|---|
| `mesh.createInstance(name)` | dezenas/centenas; cada uma tem `.position/.rotation/.scaling` e liga/desliga individualmente |
| `mesh.thinInstanceSetBuffer('matrix', float32Array, 16)` | milhares; um único draw call, mas mexes em matrizes cruas |

O spike usa **instances** para 56 feixes (simples de posicionar). Se o port precisar de
centenas de feixes ou de instanciar as facetas, passa a **thin instances**
(`thinInstanceSetBuffer`, `thinInstanceBufferUpdated`, `thinInstanceCount` — todos
confirmados no bundle).

---

## 7. Transparência aditiva (névoa, feixes)

```js
mat.alphaMode = BABYLON.Engine.ALPHA_ADD;   // luz acumula (ALPHA_COMBINE = tinta normal)
mat.alpha = 0.16;                           // teto da regra 6 (≤ 0.18)
mat.disableDepthWrite = true;               // névoa não deve tapar névoa de trás
mat.backFaceCulling = false;
```

### ⚠️ Armadilha 4: `hasAlpha` na textura

**MEDIDO:** um gradiente numa `DynamicTexture` usado como `opacityTexture` é **ignorado**
sem isto — e os feixes saem tubos sólidos e opacos:

```js
dt.hasAlpha = true;
dt.getAlphaFromRGB = true;   // usa o branco→preto do gradiente como opacidade
```

---

## 8. Pós-processamento: `DefaultRenderingPipeline`

Bloom, grão e vinheta — três coisas que a Canvas 2D faz à mão — vêm de graça:

```js
const pipe = new BABYLON.DefaultRenderingPipeline('pipe', true /*HDR*/, scene, [camera]);
pipe.bloomEnabled = true;
pipe.bloomThreshold = 0.55; pipe.bloomWeight = 0.75; pipe.bloomKernel = 48; pipe.bloomScale = 0.5;
pipe.grainEnabled = true;  pipe.grain.intensity = 8;
pipe.imageProcessing.vignetteEnabled = true; pipe.imageProcessing.vignetteWeight = 2.2;
```

Também existe `GlowLayer` (brilho só em objetos emissivos) — útil para os feixes.

### ⚠️ Armadilha 5: post-processes de raymarch são carríssimos

**MEDIDO:** `VolumetricLightScatteringPostProcess` (o "volumetric lighting" óbvio) custou
**957 ms/frame** a 80 amostras e **561 ms** a 30. É raymarch por pixel em screen-space.
Pior: é um *godray a partir de um ponto no ecrã* — não sabe o que é um espelho, portanto
não dá o que uma bola de espelhos precisa.

**Alternativa que o spike usa e que custou ~0 ms:** os feixes como **geometria** (um cone
por espelho iluminado, na direção `R = 2(N·S)N − S`, a mesma equação da Canvas 2D).
Fisicamente mais correto e mais barato.

`FrameGraphVolumetricLightingTask` (a volumetria nova da 9.x) existe no bundle, mas exige
montar um *frame graph* completo (targetTexture, depthTexture, lightingVolumeMesh, light)
e passa por `IsSupported(engine, enableExtinction)`. Só vale a pena se se quiser névoa com
extinção a sério — não é um drop-in.

---

## 9. Loop, tempo e o HUD que mente

```js
scene.registerBeforeRender(() => { /* atualizar estado */ });
scene.onBeforeRenderObservable.add(fn);
engine.runRenderLoop(() => scene.render());
addEventListener('resize', () => engine.resize());
```

### ⚠️ Armadilha 6: `getDeltaTime()` mente

**MEDIDO:** com o separador em segundo plano deu **1934 ms** num frame que custa 4 ms —
conta tempo de parede, não trabalho. Para medir custo real:

```js
let t0 = 0;
scene.onBeforeRenderObservable.add(() => { t0 = performance.now(); });
scene.onAfterRenderObservable.add(()  => { samples.push(performance.now() - t0); });
```

**Nota para o agente:** com o Chrome em automação o separador está quase sempre em segundo
plano, o rAF é estrangulado e `await` em `requestAnimationFrame` **bloqueia até timeout**.
Para medir/forçar frames a partir de `javascript_tool`:

```js
for (let i = 0; i < 40; i++) window.SPIKE.scene.render();   // frames síncronos
```

---

## 10. Performance: o que medir e onde cortar

Orçamento do projeto: **17.5 ms/frame** (`CONFIG.perf.targetMs`).
**MEDIDO no spike:** 4.30 ms com 3992 facetas + 4 focos + 3 area lights + 56 feixes, em WebGPU.

Ordem de custo, do mais caro ao mais barato:
1. **Post-processes de raymarch** — proibitivo (§8)
2. **Probes por frame** — um render da cena inteira por refresh
3. **Alocações por frame em JS** — `Vector3.Cross`, `Quaternion.RotationAxis` dentro do loop
   criam lixo. **MEDIDO:** reescrever a matemática dos feixes sem alocar
   (quaterniões escritos à mão em variáveis pré-alocadas) tirou o CPU do caminho crítico.
4. **Draw calls** — instances/thin instances resolvem
5. **Luzes por material** — cada luz extra recompila e encarece o shader

Diagnóstico: `scene.getActiveMeshes().length`, `scene.getTotalVertices()`,
`engine.getFps()`, e a `Inspector` (`scene.debugLayer.show()`) se for preciso ver ao vivo.

---

## 11. Mapa: Canvas 2D → Babylon

| na bola atual (`index-v2.html`) | em Babylon |
|---|---|
| `tiles[]` + polígono por tile | `VertexData` com 4 vértices/tile, normal do centro |
| `R = 2(N·S)N − S` à mão | continua à mão (para os feixes); o glint passa a ser o PBR |
| glint `pow(N·H, k)` | `PBRMaterial` + `SpotLight` (sai da física) |
| foco = teste de cilindro | `SpotLight` com `angle` estreito |
| `luz indireta` (`sp.wide`, hash/tile) | `RectAreaLight` + `areaLightEmissionTexture` |
| `shade` (key/az/el) | `HemisphericLight` ou `DirectionalLight` |
| feixe = wedge pintado | cone (instance) orientado ao longo de R, `ALPHA_ADD` |
| ponto na parede = interseção calculada | **grátis**: a sala é geometria, a luz bate lá |
| bloom offscreen a meia resolução | `DefaultRenderingPipeline.bloomEnabled` |
| grão em pattern + vinheta | `pipe.grainEnabled`, `pipe.imageProcessing.vignetteEnabled` |
| `sphereOpacity` (raio-X) | `mesh.visibility` / alpha do material |
| explosão por tile (`exRot`, rodrigues) | `SolidParticleSystem` **ou** thin instances com matriz/tile |
| skin dark/white + filtro SVG de tone | `imageProcessing` (tone curve/exposure) ou 2 materiais + crossfade |
| corrente desenhada em 2D | tubo/cilindros, ou continuar em overlay 2D |

---

## 12. Ler antes de começar

1. `spike-babylon/scene.js` — está comentado com o **porquê** de cada valor medido.
2. `spike-babylon/README.md` — o que falhou e não vale a pena repetir.
3. `web/index-v2.html` — o CONFIG e o renderer que é preciso igualar.
4. Playground para experimentar snippets isolados sem mexer no projeto.

**Regra prática:** quando algo aparecer preto, a pergunta é quase sempre *"o que é que
isto está a refletir?"* ou *"esta luz está dentro das 4 primeiras?"*.
