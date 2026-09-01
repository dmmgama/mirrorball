# Research — caminho para o realismo percetual (2026-09-01)

Parte 2 do research pedido pelo David. Parte 1 (`docs/research-gpu-offload.md`) tratou custo
CPU/GPU — conclusão relevante aqui: **4,3 ms medidos de 17,5 ms de orçamento, ~13 ms de margem
livre**. Este documento é sobre como GASTAR essa margem para a bola/sala lerem como o Lux real,
não sobre reduzir custo. Baseado em leitura de código real (`spike-babylon/v2/`) + pesquisa
externa. Ver §7 no fim para o estatuto MEDIDO/ESTIMADO/SUPOSTO de cada afirmação.

## 0. Resumo executivo

O maior fator percetual que falta hoje não é geometria — é **luz e ar**: a cena está toda
demasiado iluminada, uniforme e sem contraste dinâmico, e não há UMA partícula de névoa real (o
"haze" é hoje um escalar que multiplica intensidades, não uma substância no ar — `scene.fog` do
Babylon nunca é tocado no código, confirmado por grep a `spike-babylon/v2/main.js`). Isso custa
zero ms a corrigir a maior parte (é tonemap/exposição/curva), e é provavelmente mais responsável
por "parece CG" do que a falta de qualquer geometria. A seguir vem a forma dos pontos na parede
(hoje são discos redondos — uma bola de espelhos real projeta losangos/quadrados, porque o dot
HERDA a forma da faceta) — também barato. As técnicas caras (SSR em tempo real, ray-marched
volumetrics) ficam para o fim ou de fora: o género de clube que o David quer (Lux, sala escura,
haze denso, feixes duros) lê-se de reflexos NÍTIDOS e ar visível, não de reflexos rebuscados.

## 1. O que falta hoje para "é aquilo" — diagnóstico honesto

O que a cena já faz bem, olhando o código:

- **A física de reflexão é real** (`ball.js:149-158`): PBR físico (`metallic 0.92, roughness
  0.22`), não um truque de specular map. O glint (`ball.js:1240-1245`, `pow(N·H, gK)`) e a cadeia
  de cinza de 8 passos (`ball.js:1274-1294`) já dão volume/rim/sombra por faceta.
- **Os feixes existem como geometria real no ar** (`beams.js`), não como post-process de
  screen-space — o que a `docs/babylon-reference.md:271-280` já identificou como a escolha certa
  (o `VolumetricLightScatteringPostProcess` mediu 957 ms/frame e nem sabe o que é um espelho).
- **A sala tem massa física** (`room.js`): pilares, chão de madeira com albedo próprio, refletores
  por superfície (F10). A luz indireta (`ambient`, `ball.js:788-800`) já simula a área da sala a
  devolver-se nos espelhos.
- **Pós-processo básico já ligado**: bloom, grão, vinheta, tonemap ACES (`main.js:1315-1348`).

O que denuncia CG, olhando o mesmo código:

1. **Não há substância no ar.** `scene.fog`/`FogMode`/`fogDensity` existem no bundle vendorizado
   (confirmado por grep, `spike-babylon/vendor/babylon.js`) mas **nunca são chamados** em
   `main.js`/`room.js`. "Haze" (`CONFIG.haze`, `ball.js:956`, `main.js:784`) é um escalar 0-1 que
   multiplica a intensidade dos feixes/dots/halo — não existe uma partícula de névoa entre a
   câmara e qualquer superfície da sala. Consequência visível: paredes e chão nunca se desvanecem
   com a distância, os pilares ao fundo têm o mesmo contraste que os de perto, e não há aquele
   "cone que se lê só porque há ar visível" que a `docs/f8-sala-lux.md:56-58` documenta como
   observação direta do David ("haze denso sempre presente — os cones só se leem por causa
   dele"). Isto é o oposto do que o David quer replicar.
2. **A exposição/range dinâmico não está a fazer o trabalho pesado que devia.** `main.js:1327,
   1342`: `pipe.imageProcessing.exposure = num(CONFIG.postExposure, 1)` — default neutro. Uma
   sala de clube real é **muito escura com pontos muito brilhantes** (regra do pedido do David).
   Hoje o tonemap ACES está ligado (bom, comprime highlights fisicamente) mas a EXPOSIÇÃO de base
   não empurra a cena para "escuro com picos", e não há `ColorCurves` a acentuar o contraste entre
   sombra e luz (a classe existe no bundle — confirmado — mas não é instanciada em lado nenhum do
   spike). Isto é o efeito mais barato de todos e o que provavelmente mais se nota.
3. **Os dots na parede são discos redondos.** `dots.js:44` — `CreateDisc('dots', { radius: 1,
   tessellation: 12 }...)`. Uma bola de espelhos real nunca projeta um círculo: cada faceta é
   plana e (quase sempre) quadrada/losangular, e a mancha que produz **herda essa forma**. Discos
   redondos são o sinal mais imediato de "specular genérico" em vez de "bola de espelhos real" —
   é uma diferença que qualquer pessoa reconhece mesmo sem saber articular porquê.
4. **A bola reflete um cubo de 256 px, `RENDER_ONCE`, sem a própria bola no `renderList`.**
   (`ball.js:672-708`). Isto está tecnicamente correto para o custo (dívida da parte 1 já
   documentada), mas o resultado visual é um reflexo BORRADO e sem detalhe fino — uma bola de
   espelhos real, vista de perto, mostra facetas vizinhas a refletir COISAS DIFERENTES e nítidas
   (a pessoa ao lado, uma luz específica), não uma mancha média de 256×256. A resolução baixa
   funde tudo numa cor só por faceta — o que já a cadeia de cinza CPU também faz (é UM valor por
   tile) — por isso hoje há DUAS fontes a produzir o mesmo "borrão": o probe pequeno e a própria
   arquitetura de 1 cor por tile.
5. **Sem juntas visíveis entre facetas — a grelha de cola.** `BALL_DEFAULTS.tileTone: 'hash'`
   (`ball.js:92`) é o modo por defeito: cada tile tem um cinza aleatório, e a junta funde-se nele
   (`seamDarkness` 0.02, quase preto, mas os próprios tiles já são escuros — `baseTileGrey:
   [0.045, 0.14]`). O modo `'real'` (tiles quase brancos + junta fina, `ball.js:96-100`) EXISTE no
   código mas não é o default e implica abdicar da "cadeia de cinza fiel à Canvas 2D" que dá
   volume por espelho. Uma bola real tem sempre uma grelha regular e visível de linhas de cola
   entre facetas — hoje isso só aparece com o knob a apontar para `'real'`.
6. **Sem sujidade/imperfeição.** Nenhuma textura de rugosidade/normal-map por faceta —
   `uvs[uo] = T.sizeJit` (`ball.js:488`) já reserva o canal UV.x para isto ("variação de rugosidade
   por espelho, se a Fase 2 quiser um roughness map" — comentário do próprio ficheiro) mas nunca
   foi consumido. Espelhos reais de bola de discoteca têm facetas ligeiramente desalinhadas,
   algumas baças, algumas partidas — hoje todas respondem exatamente igual ao PBR.
7. **A sala é geometricamente correta mas fotograficamente "limpa".** Paredes/teto/chão com
   albedo uniforme por superfície (`room.js:37,123-125`, `BASE_ALBEDO = [0.055,0.055,0.055]`
   idêntico para teto/fundo/laterais) — nenhuma variação de textura, sujidade, ou iluminação
   localizada residual (marcas de luz antigas, sombra acumulada por baixo dos chapéus). Uma sala
   de clube real tem décadas de fumo, tinta descascada, reflexos residuais.
8. **Sem sombras projetadas dos vultos/mikado no chão/paredes.** `room.js:81`: `p.receiveShadows
   = true` está declarado, mas não há `ShadowGenerator` em lado nenhum do código lido (grep
   negativo — não confirmado 100% sem ver `main.js` inteiro, mas as luzes que existem são
   `SpotLight`/`PointLight` sem sombra associada). Numa sala escura com luzes fortes, as sombras
   duras dos pilares/vultos/mikado no chão são um sinal de "espaço real" muito forte.

## 2. (A) A bola — caminho até ler como bola de espelhos verdadeira

### 2.1 Forma dos dots — a herança da faceta

**O que a física real faz**: cada faceta é (quase) um retângulo/losango plano colado à esfera. Um
feixe estreito que bate numa faceta reflete-se como um cone que, projetado numa superfície plana
distante, produz uma mancha com a MESMA silhueta da faceta — ligeiramente deformada pelo ângulo de
incidência (mais alongada quanto mais rasante). A pesquisa confirma o mecanismo geral: "each mirror
facet reflects a beam of light... the resulting visual effect depends on the size of the mirrored
facets" (ver fontes §Fontes). Fotograficamente, quem já viu de perto confirma: os pontos numa
parede de clube são **quadrados/losangulares**, nunca círculos — é um dos sinais mais imediatos que
distingue "bola de espelhos" de "qualquer outra fonte pontual".

**O que o código faz hoje**: `dots.js:44`, `CreateDisc(..., tessellation: 12)` — um disco de 12
lados, visualmente redondo. A elongação (`elong`, `dots.js:130`) já existe e está correta
(alonga na direção do rasante), mas a FORMA base é sempre um círculo.

**Caminho de correção**: trocar `CreateDisc` por `CreatePlane` (um quadrado unitário) ou um
`CreateDisc` de 4 lados rodado 45° (losango, mais próximo do que se vê em fotos reais de bola de
espelhos, porque as facetas raramente estão alinhadas ao eixo da grelha na direção do observador).
O `dots.js` já calcula a rotação/escala/elongação certas — só a GEOMETRIA base muda. Custo: **~0
ms** (é a mesma contagem de vértices, potencialmente menos com 4 em vez de 12 lados). Risco:
**zero funcional** — é a mesma API (`thinInstanceSetBuffer`), só a mesh base muda; visualmente é
uma mudança GRANDE e imediata. Este é provavelmente o incremento de maior impacto-por-ms de todo
o report.

### 2.2 Juntas/grelha entre facetas

O modo `'real'` já existe (`ball.js:96-100,164-196`) mas não é o default nem foi validado
visualmente pelo David (comentário do próprio ficheiro: "o modo 'real'... a junta larga do modo
'hash' lia-se como contorno preto — Duas causas somadas... Corrige-se as duas, só em 'real'").
Trocar o default de `'hash'` para `'real'` é uma mudança de UM valor (`BALL_DEFAULTS.tileTone`) —
mas isto TROCA o comportamento da cadeia de cinza inteira (em `'real'` os tiles vão a ~1 de
cinza e perdem a variação de tom por espelho que dá o "salpicado" visto na Canvas 2D). **Não é
grátis em termos de estética** — é uma escolha, não uma otimização, e tem de ser decidida pelo
David a olhar (ver fase 1 do plano, §5). Custo de trocar o default: **~0 ms** (o código já
existe e já corre); o custo real é a decisão estética, não computação.

Adicional (não implementado): as juntas de uma bola real também têm profundidade — leem-se por
uma linha de sombra, não só por uma cor diferente. Isso já é parcialmente coberto pelo termo de
`rim`/`smooth(0.28,0,nz)` (`ball.js:1279,1289`) mas está calibrado para a Canvas 2D, não
verificado no 3D com o modo `'real'` ligado.

### 2.3 O que a bola reflete — o probe de 256px chega?

**Não chega para leitura de perto**, mas **chega perfeitamente para leitura à distância de
clube** (a distância normal de visualização do David, olhando a bola de fora, não colado a ela).
O motivo: cada faceta já tem UMA cor CPU (a cadeia de cinza) que domina o que se vê — o probe só
contribui a componente ESPECULAR fina (o `environmentIntensity 2.4`, `ball.js:154`). Subir a
resolução do probe (256→512) custaria 4× o tempo de refresh (mas lembrar: `RENDER_ONCE`, só
paga quando algo muda geometria — a parte 1 já identificou isto como NÃO hot-path). Ganho
percetual: pequeno, só visível em close-up extremo, que não é o enquadramento típico de uma bola
de clube vista de uma pista.

**O que teria mais impacto do que resolução**: o CONTEÚDO do que o probe reflete. Hoje o
`renderList` do probe é a sala + pilares + chapéus + mikado + vultos (`ball.js:674-679`) — já é
rico. O que falta é o próprio HAZE ser refletido (ver §3.1): se a sala ganhar névoa volumétrica
real, essa névoa NÃO aparece no probe automaticamente a menos que o `renderList` inclua o volume
de fog — outro motivo para a fase de haze vir antes de subir a resolução do probe.

**Recomendação**: não subir a resolução do probe nesta fase. É a técnica mais cara do §A por
ganho percetual mais baixo face à distância de visualização real.

### 2.4 Dupla reflexão

Uma bola de espelhos real, vista de perto, por vezes mostra uma faceta a refletir outra faceta
(inter-reflexão) — mas isto só é visível a centímetros de distância e com facetas côncavas
adjacentes, o que não é o caso aqui (a malha é convexa, esfera pura). **Não é um efeito
percetualmente relevante para a distância de visualização do projeto** (vista de sala, não macro).
Recomendação: **não perseguir**. Ray tracing / múltiplos bounces para captar isto custaria caro
(teria de ser SSR ou path tracing, nenhum dos dois trivial em Babylon.js sem custo alto) para um
efeito que ninguém vai notar à distância normal.

### 2.5 Comportamento de perto vs. de longe

Hoje o LOD é implícito: a mesma malha de ~2938-4000 facetas serve qualquer distância de câmara.
Isto está correto para o caso de uso (a câmara não entra dentro da bola) — **não há trabalho a
fazer aqui**, é uma não-issue.

### 2.6 Glint

Já bem coberto: `glintPbrMix` (`ball.js:122,941`) permite misturar glint CPU (cadeia de cinza,
paridade Canvas 2D) com glint PBR (física real via `SpotLight`). O default 0.5 é um meio-termo
razoável. Não é prioridade — já funciona e já é ajustável por knob.

## 3. (B) O ambiente — o que a maquinaria de luz produz no ar e nas superfícies

### 3.1 Haze/névoa volumétrica — provavelmente o maior fator percetual do report inteiro

**Porque é que o haze importa mais do que qualquer geometria**: a pesquisa confirma o mecanismo —
partículas no ar fazem *Mie scattering* da luz de volta para o olho do observador; sem partículas
o feixe é invisível até bater numa superfície. É LITERALMENTE o que faz um clube parecer um
clube em vez de uma sala vazia com luzes a bater em paredes — a `docs/f8-sala-lux.md:57-58`
confirma isto como observação direta do David sobre o Lux real ("haze denso sempre presente — os
cones só se leem por causa dele").

**Estado atual**: os "feixes" (`beams.js`) já são geometria no ar com gradiente aditivo — isto é
CORRETO como abordagem (a parte 1 confirma: 957 ms/frame do post-process de raymarch vs. ~0 ms da
geometria). O que falta é a névoa AMBIENTE — não os feixes individuais, mas o ar da sala inteira
ligeiramente turvo, que faz com que:
- luzes distantes percam contraste e saturação (depth cueing);
- os próprios feixes tenham uma "cauda" mais realista fora do cone estrito;
- a sala tenha PROFUNDIDADE visual (sem isto, o fundo da sala parece tão nítido como a bola).

**Técnica recomendada, por ordem de custo**:
1. **`scene.fogMode = BABYLON.Scene.FOGMODE_EXP` (ou `FOGMODE_EXP2`) + `fogDensity` +
   `fogColor`** — fog nativo do Babylon, aplicado no vertex/fragment shader de TODOS os materiais
   automaticamente, **sem post-process, sem passe extra de render**. Confirmado no bundle
   vendorizado (`fogMode`, `fogColor`, `fogDensity` existem em `spike-babylon/vendor/babylon.js`).
   Isto é, tecnicamente, o "truque barato" central do report: um fog exponencial correto de baixa
   densidade sobre uma sala escura com pontos brilhantes já dá 80% da sensação de "ar visível" que
   falta, e o custo é **~0 ms adicionais** (é um `uniform` a mais no shader que já corre). Risco:
   precisa de `fogColor` escuro/azulado (não o cinza médio por defeito do Babylon) para não lavar
   a cena a cinza — e precisa de ser calibrado para não esconder os dots na parede (que já são a
   representação "sólida" do haze no código atual).
2. **Post-process aditivo de "haze ambiente" (opcional, mais caro)**: um `PostProcess` simples
   que aplica um gradiente radial fraco a partir das luzes visíveis — MUITO mais barato que
   `VolumetricLightScatteringPostProcess` (que é raymarch por pixel), mas ainda um passe extra.
   Só vale a pena SE o fog nativo não bastar visualmente. **Estimar depois de ver o fog nativo.**
3. **`FrameGraphVolumetricLightingTask`** (a volumetria "a sério" da 9.x, mencionada em
   `docs/babylon-reference.md:282-285`) — exige montar um frame graph completo
   (`targetTexture`/`depthTexture`/`lightingVolumeMesh`/`light`) e `IsSupported(engine,
   enableExtinction)`. **Não vale a pena nesta fase**: dá extinção fisicamente correta por luz
   individual, mas o ganho sobre um bom `scene.fog` + os feixes de geometria já existentes é
   marginal face ao esforço de integração (frame graph é uma API nova, sem precedente no
   codebase) e ao risco de reabrir os incidentes WebGPU já documentados na parte 1 (§4).

**Recomendação firme**: `scene.fog` nativo primeiro, sempre. É o único item deste report que é
simultaneamente o de maior impacto percetual estimado E o de menor custo/risco medido.

### 3.2 Exposição, contraste e range dinâmico — o segundo maior fator, também barato

Já coberto no diagnóstico (§1.2). Concretamente:
- **Baixar `CONFIG.postExposure`** (hoje neutro, default 1) para um valor <1 empurra a cena para
  mais escura de base — deixando as luzes fortes (chapéus, mikado, glint) destacarem-se mais por
  CONTRASTE, que é o efeito "sala muito escura com pontos muito brilhantes" pedido.
- **`ColorCurves`** (classe confirmada no bundle vendorizado: `globalHue/globalDensity/
  globalSaturation/globalExposure`, `shadowsHue/midtonesHue/highlightsHue` existem) — anexada via
  `pipe.imageProcessing.colorCurves` e `colorCurvesEnabled = true` — permite escurecer sombras e
  saturar highlights SEM tocar no tonemap ACES que já está correto. É o "look de clube" (sombras
  azuladas frias, luzes quentes a queimar) numa API dedicada, em vez de aproximar via
  `imageProcessing.contrast` como o código faz hoje (`main.js:1347`, já documentado como
  divergência da LUT original).
- **Custo**: `ColorCurves`/exposição são uniforms do mesmo passe de tonemap já ativo —
  **~0 ms adicionais**, é literalmente mudar valores de knobs existentes + uma classe nova anexada
  ao pipeline já criado.
- **Risco**: zero técnico. Risco ESTÉTICO — pode ficar escuro demais para o David ver os detalhes
  que quer afinar; por isso deve ser um KNOB vivo, não um valor fixo (já é a arquitetura do
  código — `CONFIG.postExposure` já existe como knob).

### 3.3 Dots a varrerem paredes/pessoas/mikado

Já implementado e correto: oclusão por cilindro (F15, `ball.js:1180-1206`), interseção com os 5
planos da sala + verificação de vultos. O que FALTA aqui é só a forma do dot (§2.1, já coberto) —
não há trabalho extra de "varrimento" a fazer, o sistema já projeta dinamicamente sobre paredes e
pessoas.

**Falta**: dots a incidirem no MIKADO em si (barras) — hoje os dots só testam contra os 5 planos
da sala + cilindros dos vultos (`ball.js:1159-1206`), não contra a geometria do mikado. Um dot que
deveria "morrer" numa barra do mikado hoje continua até à parede. Isto é um efeito secundário
(dots no mikado são raros porque o mikado é fino e alto, longe da maior parte dos ângulos de
reflexo) — **baixa prioridade**, mas fica registado como gap real.

### 3.4 Sombras

**Não há `ShadowGenerator` no código lido.** Isto é o maior gap de "leitura de espaço real" depois
do haze. Numa sala escura com pinspots fortes, sombras duras no chão (dos pilares, dos vultos, do
mikado) são um dos sinais mais fortes de que a luz existe fisicamente na sala. Sem sombras, os
objetos "flutuam" opticamente mesmo com PBR correto.

**Custo real**: sombras em Babylon (`ShadowGenerator` por luz) custam um passe de render extra
POR LUZ com sombra ativa — não é grátis, mas também não é caro na escala certa: com poucas luzes
"hero" (2-4 spots da bola + talvez 1-2 do mikado) a marcarem sombra, e as luzes de enchimento
(ambiente, chapéus, wash) sem sombra, o custo fica controlado. **ESTIMADO**: 0,3-1,0 ms por luz
com sombra a resolução moderada (512-1024px de shadow map), a confirmar por medição — não há
número medido no repo para isto.

**Risco**: médio — é a técnica mais capaz de criar regressões visuais estranhas (peter-panning,
acne, sombras a vazar por trás de planos finos como as facetas da bola) e é nova no codebase
(nenhuma menção a `ShadowGenerator` em nenhum ficheiro lido). Deve ser uma fase isolada, com
stop visual dedicado.

### 3.5 Bounce / luz indireta

Já existe uma aproximação barata: a "luz indireta" da bola (`ball.js:788-800`, `ambient` — fontes
largas a deambular, sem cone) já simula o efeito de a bola devolver luz difusa da sala. O que
falta é o INVERSO: a sala a mostrar bounce das próprias luzes da bola/mikado nas paredes — isto é
tipicamente resolvido com `RectAreaLight`s adicionais fracas posicionadas onde a luz bate mais
(aproximação de radiosity), não com GI real (caro demais para o orçamento). **Baixa prioridade**:
o efeito visual do bounce é sutil comparado com o haze/exposição, e a sala já tem wash ambiente
(`docs/f8-sala-lux.md:78-81`) a cumprir parte dessa função.

### 3.6 Sujidade/textura das superfícies

Hoje albedo uniforme por painel (§1.7). Uma textura procedural simples (ruído + manchas) nas
paredes/chão/pilares custaria uma `DynamicTexture`/`ProceduralTexture` — barato em runtime (só
paga na criação, não por frame), mas exige trabalho de conteúdo (desenhar/gerar a sujidade) que é
mais esforço de autor do que de motor. **Prioridade média-baixa**: melhora percetualmente mas
menos do que haze/exposição/forma dos dots, porque a distância de visualização típica (pista,
olhando a bola) não aproxima o suficiente das paredes para a textura fina se notar tanto quanto o
contraste geral da cena.

## 4. TABELA-MESTRA: incremento → ganho percetual → custo → ordem

Ordenada por (impacto percetual ÷ ms), maior primeiro. "Ganho percetual" é 1-5 (5 = muda
imediatamente "parece CG"→"parece aquilo"), estimado a partir do diagnóstico e da pesquisa —
NENHUM destes números vem de teste A/B com o David, são hipóteses a validar (ver §7).

| # | Incremento | Ganho percetual (1-5) | Custo ms | Estatuto do custo | Risco de partir o que funciona | Ordem |
|---|---|---|---|---|---|---|
| 1 | Trocar `CreateDisc` (dots) por quadrado/losango | 4 | ~0,0 ms (mesma contagem de vértices) | ESTIMADO (mesma API, troca de mesh base) | Zero — mesmo `thinInstanceSetBuffer`, só a mesh muda | **1º** |
| 2 | `scene.fogMode = FOGMODE_EXP` + `fogColor`/`fogDensity` nativos | 5 | ~0,0-0,2 ms (uniform extra no shader já ativo) | ESTIMADO (feature nativa, sem passe extra) | Baixo — pode lavar a cor se mal calibrado; fácil reverter (1 flag) | **2º** |
| 3 | Baixar `postExposure` + `ColorCurves` (sombras frias/highlights quentes) | 5 | ~0,0 ms (mesmos uniforms do pipeline já criado) | ESTIMADO | Zero técnico; risco só estético (escurecer demais) — já é knob ao vivo | **3º** |
| 4 | Trocar default `tileTone: 'hash'` → `'real'` (junta visível) | 3 | ~0,0 ms (código já existe, já corre) | MEDIDO (o modo já corre no spike, só não é default) | Médio — muda a estética da cadeia de cinza (perde o "salpicado" por tile); decisão do David, não só técnica | **4º** (com stop dedicado) |
| 5 | `ShadowGenerator` em 2-4 luzes "hero" (spots da bola + mikado) | 4 | 0,3-1,0 ms/luz | ESTIMADO (sem medição no repo) | Médio-alto — API nova no codebase, risco de acne/peter-panning/sombra a vazar pelas facetas finas | **5º** |
| 6 | Textura de sujidade/ruído nas superfícies da sala | 2 | ~0,0 ms runtime (custo é de autoria/conteúdo, não de frame) | SUPOSTO (não medido, é criação de conteúdo) | Baixo | 6º |
| 7 | Roughness map por faceta (usar `uvs[uo]=T.sizeJit` já reservado) | 2 | ~0,1-0,3 ms (1 sample de textura extra no shader do PBR da bola) | ESTIMADO | Baixo — canal UV já existe, é aditivo | 7º |
| 8 | Subir resolução do probe 256→512 | 1 | custo só no refresh (não é hot path — a parte 1 já mostrou isto), mas 4× por refresh | MEDIDO indiretamente (parte 1, refresh é RENDER_ONCE) | Baixo, mas ganho marginal à distância normal de visualização | 8º, condicional |
| 9 | `SSRRenderingPipeline` (screen-space reflections) na bola | 1-2 | ALTO — passe extra de render + trace por pixel; sem número medido no repo | SUPOSTO | Alto — API confirmada no bundle (`SSRRenderingPipeline`) mas nunca testada aqui; risco de regressão nos WebGL2/WebGPU e de conflito com o `ReflectionProbe` existente | **NÃO FAZER agora** |
| 10 | `FrameGraphVolumetricLightingTask` (volumetria "a sério" por luz) | 2-3 | ALTO — frame graph completo, API nova | SUPOSTO | Alto — reabre risco dos incidentes WebGPU (parte 1 §4); esforço de integração grande | **NÃO FAZER agora** |
| 11 | `VolumetricLightScatteringPostProcess` (god rays clássico) | 1 | **957 ms/frame MEDIDO** (`docs/babylon-reference.md:271-274`) | MEDIDO | Proibitivo — mata o frame budget sozinho | **NUNCA** |
| 12 | Dupla reflexão / inter-reflexão entre facetas | 1 | ALTO (SSR/path tracing) | SUPOSTO | Alto, para ganho não percetível à distância normal | **NÃO FAZER** |

## 5. Ordem recomendada em fases pequenas, cada uma com stop visual

**FASE R1 — dots quadrados/losango.** Trocar a geometria base de `dots.js:44`. ~5 linhas.
Stop: o David olha a bola a girar com música e vê se os pontos na parede leem como "espelho" em
vez de "lanterna". Reversível numa linha se não gostar.

**FASE R2 — fog nativo do Babylon.** Ligar `scene.fogMode`/`fogColor`/`fogDensity`, calibrado
baixo primeiro (quase impercetível) e subido ao vivo com um knob novo (`CONFIG.fogDensity`,
respeitando a regra 7 — valor inicial finito). Stop: o David compara a sala com/sem fog a olhar
para o fundo da sala e os pilares distantes — pede-se especificamente "os pilares do fundo
perdem nitidez?".

**FASE R3 — exposição/contraste (ColorCurves + postExposure mais baixo por defeito).** Ajustar
knobs existentes + anexar `ColorCurves` ao pipeline. Stop: o David compara lado a lado (screenshot
mental, não automatizado) "sala clube escura com picos" vs. "sala uniforme". Esta fase é a que
mais precisa de julgamento humano — é fácil escurecer demais e perder a leitura dos detalhes que
o David quer afinar.

**FASE R4 — debate sobre `tileTone: 'real'` como novo default.** Não é implementação nova —
é decidir se o modo que já existe deve ser o default. Precisa de comparação lado a lado dos dois
modos com o David a olhar, porque troca a estética da cadeia de cinza inteira.

**FASE R5 (maior, isolada) — sombras em 2-4 luzes hero.** Só depois de R1-R4 estarem no lugar
(sombras sem haze/contraste corretos rendem mal, porque a sala ainda estaria demasiado uniforme
para as sombras se destacarem). Stop: medir ms com `MB2.__perf()` antes/depois (protocolo §6 da
parte 1), e o David confirma visualmente que não há acne/vazamento nas facetas da bola.

**Porquê esta ordem**: R1-R3 são todas de custo ~0 ms, risco quase nulo, e mudam a leitura
IMEDIATA da cena inteira (não só da bola) — é o "resultado visível depressa" que o ritmo de side
project pede. R4 é uma decisão estética que precisa de comparação, não implementação. R5 é a
única fase com custo de ms real e risco técnico novo — fica para o fim, depois de tudo o resto
já ter dado à sala a atmosfera certa (o que torna as sombras mais uma questão de polimento do que
de criar sensação de espaço, que R1-R3 já resolvem em grande parte).

## 6. O que NÃO fazer, e porquê

- **`VolumetricLightScatteringPostProcess`**: 957 ms/frame medidos no próprio repo
  (`docs/babylon-reference.md:271-274`) — mata o orçamento sozinho, e é um god-ray a partir de um
  ponto de ecrã, não sabe o que é um espelho (a `docs/babylon-reference.md` já documenta esta
  rejeição).
- **`FrameGraphVolumetricLightingTask`**: API nova (frame graph completo), esforço de integração
  alto, ganho marginal sobre `scene.fog` nativo + a geometria de feixes já existente. Reabre risco
  dos incidentes WebGPU documentados na parte 1 (§4: `TransformNode` no probe, `RawCubeTexture`
  obrigatória, fingerprint pesado).
- **`SSRRenderingPipeline` (reflexões screen-space) na bola**: a bola JÁ tem reflexão física via
  `ReflectionProbe` — SSR seria uma camada ADICIONAL de reflexo, mais cara, para um ganho
  percetual pequeno (a diferença entre "reflete um cubo pré-renderizado" e "reflete o frame atual
  em screen-space" só se nota em movimento rápido de câmara ou objetos muito próximos da bola, o
  que não é o enquadramento típico). Risco de conflito com o probe existente não testado.
- **Dupla reflexão/path tracing entre facetas**: efeito real mas só visível a centímetros da bola
  — fora da distância de visualização do projeto (vista de pista/sala). Custo alto para zero
  ganho percetual no caso de uso real.
- **Subir a resolução do probe antes do fog/exposição**: o probe atual já não é o fator limitante
  da leitura "bola de espelhos real" — a cadeia de cinza (1 cor por tile) domina o resultado mais
  do que a resolução do cubo refletido. Subir a resolução sem primeiro corrigir haze/exposição
  gastaria orçamento sem mudar a perceção geral da cena.
- **Mexer no caminho WebGL2 (`?webgl=1`) ou introduzir qualquer material PBR novo sem
  `reflectionTexture` própria**: todas as técnicas recomendadas acima (fog nativo, ColorCurves,
  geometria dos dots, ShadowGenerator) são features padrão do Babylon.js que funcionam
  identicamente em WebGL2 e WebGPU — nenhuma delas exige compute shaders ou frame graphs. A única
  regra a manter é a já documentada em `room.js:43-55`/`ball.js:693-705`: qualquer PBRMaterial
  novo introduzido (nenhum é necessário aqui, mas se algum aparecer) tem de ter
  `reflectionTexture` própria, nunca cair no `scene.environmentTexture` = cubo do probe.

## 7. Como validar percetualmente — não é FPS, é "parece?"

**Medição de custo** (reutilizar o protocolo da parte 1 §6, não repetir aqui): tab em foco, nunca
automação headless, `MB2.__perf()` para ms reais, nunca `engine.getFps()` isolado, nunca
screenshot em automação (o Chrome automatizado corre em segundo plano e `document.hidden` mente).

**Medição de "parece?"** — proposta:

1. **Comparação lado a lado com fotos reais do Lux.** O David já tem fotos de referência
   catalogadas em `docs/f8-sala-lux.md` (lux2-lux12, Lux1, Lux13, Lux-Top1, Lux-wall1-3,
   Lux-ball1, frames do stream "Wish You Were Here"). Antes de cada fase, escolher 1-2 fotos com
   o enquadramento mais parecido ao da câmara do spike (ângulo, distância) e comparar
   diretamente — não de memória.
2. **Checklist de sinais que denunciam CG** (a preencher a cada fase, sim/não):
   - O fundo da sala perde nitidez/contraste com a distância? (fog)
   - A sala lê-se como "escura com picos" ou como "uniformemente cinza-clara"? (exposição)
   - Os pontos na parede têm forma de faceta (quadrado/losango) ou são círculos? (dots)
   - As linhas entre espelhos são visíveis como grelha? (tileTone)
   - Há sombra dura no chão por baixo dos pilares/vultos? (shadows)
   - A bola, vista a rodar, tem manchas DIFERENTES em facetas vizinhas ou é uma superfície lisa
     com um brilho a deslizar? (resolução efetiva da cadeia de cinza + probe)
3. **Uma frase de veredito por fase, do David**: "é aquilo" / "quase" / "não é" — sem número,
   sem FPS, sem métrica — é a instrução original do pedido ("critério é perceptual: o que faz um
   humano dizer 'é aquilo'"). Cada fase do §5 já está desenhada para produzir um stop onde essa
   frase pode ser dita.
4. **Nunca decidir uma fase por captura automática.** Os incidentes já documentados na parte 1
   (`document.hidden` mata o rAF e mente sobre FPS; `scene.render()` forçado mata o renderer
   WebGPU) aplicam-se por igual a "screenshot para comparar visualmente" — a comparação tem de
   ser feita pelo David, ao vivo, com o tab em foco.

## 8. Estatuto das afirmações (MEDIDO / ESTIMADO / SUPOSTO)

- **MEDIDO** (números que já existem no repo, não deste report): `VolumetricLightScatteringPostProcess`
  957 ms/80 amostras, 561 ms/30 (`docs/babylon-reference.md:271-274`); regressão S8 do
  `reflectionTexture` própria (143 ms → 20 ms, `room.js:55`); orçamento 17,5 ms, medido hoje
  4,30 ms (`docs/babylon-reference.md:321-322`, parte 1 §7); `scene.fogMode`/`fogColor`/
  `fogDensity`/`ColorCurves`/`SSRRenderingPipeline`/`TONEMAPPING_ACES`/`TONEMAPPING_STANDARD`/
  `TONEMAPPING_KHR_PBR_NEUTRAL` todos CONFIRMADOS por grep no bundle vendorizado
  `spike-babylon/vendor/babylon.js` (não inventados); `GodRaysPostProcess` **confirmado ausente**
  do bundle vendorizado (só `VolumetricLightScatteringPostProcess` existe — o nome "god rays" é
  coloquial, a classe Babylon tem outro nome).
- **ESTIMADO** (deduzido da estrutura do código e da física conhecida, não medido neste projeto):
  custo ~0 ms do fog nativo/ColorCurves/troca de geometria dos dots (são uniforms/mesh trivial
  sobre um pipeline já ativo); custo 0,3-1,0 ms/luz de `ShadowGenerator` (ordem de grandeza típica
  de shadow maps a esta escala, sem medição própria); ganhos percetuais 1-5 da tabela-mestra (são
  julgamento informado, não teste A/B).
- **SUPOSTO** (a confirmar por pesquisa adicional ou teste): que discos redondos vs.
  quadrados/losangulares seja de facto o sinal mais reconhecível de "bola de espelhos real" para
  o David especificamente (a pesquisa geral confirma o mecanismo físico, não testou a perceção do
  David); custo de `SSRRenderingPipeline`/`FrameGraphVolumetricLightingTask` nesta cena
  específica (nenhum dos dois foi instanciado no spike, os números "ALTO" são por analogia com a
  documentação oficial e o padrão geral de custo de SSR/volumetria em tempo real, não medição
  local).

## Fontes

Reflections on a Disco Ball (Physics Teacher/AIP, eric.ed.gov, pubs.aip.org) · Wikipedia "Disco
ball" · hollywooddj.com, mirror-balls.co.uk, efavormart.com (construção/ótica de bolas de
espelhos) · starshinelights.com "Fog vs Haze Basics for Laser Light Shows" · laseros.com
("Visible Beam Laser", "Smoke Laser Effects") · ilda.com "Haze and fog for laser shows" (Mie vs.
Rayleigh scattering) · Babylon.js bundle vendorizado `spike-babylon/vendor/babylon.js` (v9.23.0,
grep direto — `TONEMAPPING_*`, `fogMode/fogColor/fogDensity`, `ColorCurves`,
`SSRRenderingPipeline`, `VolumetricLightScatteringPostProcess`, ausência de `GodRaysPostProcess`).
