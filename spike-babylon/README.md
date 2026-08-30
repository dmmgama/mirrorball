# SPIKE — bola de espelhos em Babylon.js 9

> **Se vieste para o spike v2 (paridade com o produto), lê primeiro
> [`../docs/handoff-2026-08-29-S5.md`](../docs/handoff-2026-08-29-S5.md).**
> Especificação: [`../docs/parity-canvas2d.md`](../docs/parity-canvas2d.md) ·
> Babylon: [`../docs/babylon-reference.md`](../docs/babylon-reference.md)
>
> Este spike é só **qualidade de render**. Não tem paridade com a bola do produto.

**Não toca em nada do repo.** Tudo aqui dentro. O `config.js` é uma *cópia* dos teus
valores gravados em `web/music-config.json` (secção `ball`), para a comparação ser justa:
mesmos 4 focos nos teus az/el, 56 filas, haze 0.65, mesma sala.

## Correr

```
cd spike-babylon
python serve.py            # http://127.0.0.1:8099/index.html
```

(o `serve.py` manda `no-store` — sem isso o Chrome guarda o `scene.js` e não vês as alterações)

Teclas: `v` feixes on/off · `r` parar/rodar · `espaço` pausa · rato orbita e faz zoom.

## Correr em modo música (`v2/`, Fase 5)

O `v2/index.html?src=music` carrega `core.js`/`music.js`/`tuner.js` **sem os alterar**, do
`web/` do produto — precisa de ser servido same-origin com o sidecar de áudio
(`agent-os/audio-sidecar`, porta 3739, que expõe `/app-token`, `/app-config*` e o WS).

1. Sidecar a correr — atalho `Mirrors-of-Emotions-Start.bat`, ou confirmar com
   `curl http://127.0.0.1:3739/app-token`.
2. `cd spike-babylon && python serve.py` (porta 8099).
3. Abrir `http://127.0.0.1:8099/app/spike/v2/index.html?src=music&webgl=1`
   (`?webgl=1` só é preciso para automação/screenshot — WebGPU real ao vivo pode omitir).

**Nota sobre a junction.** O plano original era uma junction `web/spike → spike-babylon`
(`mklink /J`) para o sidecar servir o spike diretamente em `/app/spike/*`. **O sidecar real não
segue reparse points** (confirmado: `GET /app/spike/README.md` dá 404 mesmo sendo um ficheiro
plano na raiz do alvo, enquanto ficheiros reais de `web/` respondem 200 — parece um
`realpath`/containment check). Por isso o `serve.py` (porta 8099) ganhou rotas de fallback:
`/app/spike/*` → `spike-babylon/*`, `/app/*.js` → `web/*.js`, e proxy de `/app-token` +
`/app-config*` para `127.0.0.1:3739`. A junction pode ser recriada se um dia isto mudar
(não está no caminho crítico, não entra no git):
```powershell
cmd /c mklink /J "web\spike" "spike-babylon"
```
(correr em PowerShell a partir da raiz do repo — `cmd /c mklink` invocado de dentro do Git Bash
não persistiu de forma fiável nesta máquina).

Detalhes completos (o que foi testado, divergências) em `v2/PARITY.md` §4/§5 e
`v2/briefs/f5-sync.md`.

## Medido nesta máquina (não estimado)

| | |
|---|---|
| render | **4.30 ms** (orçamento do projeto: 17.5 ms) |
| motor | **WebGPU** (fallback WebGL2 automático) |
| facetas | 3992 espelhos, geometria real |
| feixes | 56 simultâneos |

## O que é genuinamente diferente da Canvas 2D

1. **As facetas são geometria 3D real** com material PBR metálico. A reflexão não é
   aproximada por um wedge pintado — o GPU calcula-a. Vê-se nos espelhos individuais a
   apanharem brilhos diferentes conforme a orientação.
2. **`RectAreaLight` com textura** = a sala como *área* refletida (LTC). É o equivalente
   físico do teu knob `luz indireta` / `indireta: área°`, mas a sério: cada espelho
   devolve a parte da sala que lhe calha, em vez de um hash por tile.
3. **Feixes com a mesma equação da Canvas 2D** (`R = 2(N·S)N − S`), mas cada um é um cone
   3D: cruzam-se, atravessam a sala e batem nas paredes sozinhos.
4. **Os pontos na parede aparecem de graça** — a sala é geometria, não matemática.

## O que falhou pelo caminho (para não se repetir)

- **`VolumetricLightScatteringPostProcess` está fora.** É o "volumetric lighting" que a
  pesquisa recomendou, mas mediu **957 ms/frame** a 80 amostras e **561 ms** a 30. É
  raymarch em screen-space por pixel. Pior: é um efeito de *godray a partir de um ponto
  no ecrã* — não sabe nada de espelhos, logo não dá o que uma bola precisa. Os feixes
  como geometria custam ~0 ms e são fisicamente mais corretos.
- **`FrameGraphVolumetricLightingTask`** (a volumetria nova da 9.x) existe no bundle mas
  exige montar um *frame graph* completo (targetTexture, depthTexture, lightingVolumeMesh)
  e passa por `IsSupported()` — muito mais pesado de instalar do que a pesquisa sugeria.
  Fica como caminho a explorar se se quiser névoa com extinção a sério.
- **Espelho perfeito (`metallic 1.0`, `roughness 0.06`) dá uma bola PRETA.** Fisicamente
  certo — um espelho puro quase não tem resposta difusa, um pinspot só lá deixa um ponto.
  Um azulejo real é vidro sobre espelhamento: `metallic 0.92`, `roughness 0.22`.
- **O Babylon só usa 4 luzes por material por defeito.** Com 4 focos + 3 area lights + key,
  as últimas eram silenciosamente ignoradas. `maxSimultaneousLights = 12`.
- **`hasAlpha` na textura de gradiente é obrigatório**, senão os feixes saem tubos sólidos.
- **`getDeltaTime()` mente** se o separador for para segundo plano (medi 1934 ms num frame
  que custa 4 ms). O HUD mede o custo real de `scene.render()`.

## O que ainda NÃO está aqui

Isto é um spike de qualidade visual, não um motor. Falta:

- ligação ao `music.js` (o sidecar a 50 Hz) — o motor todo transfere-se sem alterações,
  só muda quem desenha;
- gestos, dimmer, strobe, explosão, skin;
- cone incidente (a luz que *chega* à bola);
- os teus knobs do painel `d`.

## Comparar

Abre lado a lado com a bola atual (`Mirrors-of-Emotions-Start.bat`) e vê a diferença nas
facetas e nos feixes. A decisão é tua: isto vale o porte, ou a Canvas 2D já chega?
