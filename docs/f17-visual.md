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
