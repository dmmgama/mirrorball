# Plano — spike v2 Babylon.js com paridade (aprovado pelo David, 2026-08-29)

**Para o orquestrador (Fable 5, effort medium).** Este ficheiro chega para orquestrar. **NÃO leias**
`web/index-v2.html`, `docs/parity-canvas2d.md` nem `docs/babylon-reference.md` na íntegra — os subagentes
é que os leem, e só as secções que os briefs lhes apontam. O teu trabalho é: lançar os subagentes de cada
fase com o brief respetivo, verificar o resultado (screenshot lado a lado / HUD ms), parar para o David ver,
seguir. Se precisares de julgar um detalhe técnico, lê a secção apontada no brief, não o ficheiro.

## Objetivo
Replicar **exatamente o comportamento** de `web/index-v2.html` (bola Canvas 2D do produto) em Babylon.js 9
(`spike-babylon/vendor/babylon.js`), com melhor qualidade de render. Vive em **`spike-babylon/v2/`**.
`web/index-v2.html` e `web/music.js` **não se tocam**. O spike v1 (`spike-babylon/scene.js`) fica como está.

## Prioridades do David (ordem de fases decorre disto)
1. Núcleo primeiro: bola, espelhos, reflexões, feixes. Focos só precisam de emitir luz no início.
2. **Knobs (painel `d`) desde a Fase 1** — o ajuste manual dele evita descartar coisas boas.
3. Desde a raiz: **variação de tamanho dos espelhos + junta**; **toggle tonalidade** (hash atual / espelhos
   reais todos iguais); **toggle disposição** (desencontrados = atual / ordenados = bola real).
4. Estética (corpos PAR36 na sala, corrente, sala) e explosão ficam para o **fim**.
5. Distância dos corpos dos focos: o que for melhor agora; afina-se depois.
6. Objetivo último (depois da bola estar bem): reconstruir o **Lux Frágil** — bola de 2.5 m de raio no centro,
   minimalista, só focos.

## Contrato de arquitetura (fixo; os briefs repetem o que lhes toca)
- Mesmo `CONFIG` (nomes, unidades: raios da bola, az/el em graus, az=0 = câmara, Y cima).
- Cadeia de cinza da faceta (8 passos) calcula-se em CPU por tile → **vertex color** que multiplica o albedo PBR.
  O PBR só dá reflexo físico. Divergência admitida e documentada: glint PBR em vez de `pow(N·H,k)`.
- Uma malha de facetas (`VertexData`, 4 vértices/tile), typed arrays pré-alocados, `updateVerticesData` por frame
  quando preciso (drift/cores; explosão na Fase 7).
- Feixes, cone incidente e pontos na parede = matemática CPU (`R = 2(N·S)N − S`) a alimentar geometria
  (thin instances). A `SpotLight` do Babylon ilumina a bola e a sala; **não** gera feixes.
- Tetos invioláveis: `beamIntensity ≤ 0.18`, nada > 3 Hz, greyscale puro, bola não emite luz, `dotMaxGrey`.
  Todo o campo novo em `state`/`CONFIG` tem valor inicial finito (guardas `Number.isFinite`).
- Todo o valor julgado "à sensação" ganha knob, incluindo os do PBR (metallic, roughness, environmentIntensity,
  intensidade dos spots). Persistência: `localStorage > ficheiro ball > defaults`.
- Cada fase atualiza `spike-babylon/v2/PARITY.md` (✅ igual / ⚠ divergência + porquê / ⏳ por fazer) e o HUD
  mostra o custo real de `scene.render()` (não `getDeltaTime`).

## Fases (cada uma acaba com STOP para o David ver)

| # | entrega | stop visual | subagentes (paralelo ‖) |
|---|---|---|---|
| 1 | esqueleto `v2/`, sala 5 planos, câmara (camDistance 7, enquadramento 0.52 vh, orbitável), malha idêntica + **variação de tamanho + junta + toggle tonalidade + toggle disposição**, cadeia de cinza em vertex color, 2 SpotLights simples, `shade`, ReflectionProbe ONCE, **painel `d` completo** (54 knobs + novos) com persistência | lado a lado com a atual, `spotCount 2`, sem feixes; David alterna toggles/variação | Sonnet `briefs/f1-sonnet.md` ‖ Opus `briefs/f1-opus.md` |
| 2 | mancha do foco fiel (raio fixo, orla, mirrorGain, glintSharp aprox.), fade/spotFadeMix/spotsOn, 4 spots dos knobs, luz indireta = 3 RectAreaLight a deambular, sphereOpacity/raio-X + malha osso | espelhos a acender ao passar no foco, cintilação da indireta, opacidade 0.3 | Opus `briefs/f2-opus.md` ‖ Sonnet `briefs/f2-sonnet.md` |
| 3 | feixes refletidos (thin instances, beamSoft 3 cones, beamGlowZ, beamFraction, ordenação, ≤0.18, haze) + cone incidente (2 tetos, morre no limbo); verificar WebGL2 | lado a lado; dispersão 0→1; HUD ms | Opus `briefs/f3-opus.md` ‖ Sonnet `briefs/f3-sonnet.md` |
| 4 | pontos na parede (interseção CPU, elong, dotMaxGrey, dotDensity>1, degradação adaptativa), halo, bloom/grão/vinheta, skin dark/white | pontos a varrer à mesma velocidade; dark/white | Sonnet `briefs/f4-sonnet.md` |
| 5 | `stepChoreo` verbatim, estrobo de fundo, `window.MIRRORBALL` completo, 3 disjuntores, `?src=music` a carregar `core.js`/`music.js`/`tuner.js` sem os tocar, servir do sidecar `/app/` | **música real**, as duas bolas, mesmo `music-config.json` | Opus `briefs/f5-opus.md` ‖ Sonnet `briefs/f5-sonnet.md` |
| 6 | corpos PAR36 visíveis (lente segue dimmer, luz nasce do corpo, rig plausível), corrente 3D, `?mini=1`/`?scale=` | orbitar e ver o rig | Sonnet `briefs/f6-sonnet.md` |
| 7 | explosão (máquina idle→out→drift→hold/held→back, Rodrigues por tile, maxHold, reentrada) | tecla `x` nas duas bolas | Opus `briefs/f7-opus.md` |

Os briefs das fases 2-7 escrevem-se **no arranque de cada fase** pelo orquestrador (modelo: `briefs/f1-*.md`),
com base no que ficou feito — não antes. Modelo de brief: objetivo, ficheiros a criar/alterar, **secções exatas
a ler (ficheiro:linhas)**, regras que não se reabrem, critério de "feito", o que NÃO fazer.

## Como o orquestrador verifica uma fase
1. `cd spike-babylon && python serve.py` → `http://127.0.0.1:8099/v2/index.html`.
   Chrome em automação fica `hidden` e o WebGPU `initAsync` **pendura** — para screenshot automatizada usar
   `?webgl=1` (fallback forçado, a implementar na Fase 1) ou pedir ao David.
2. `window.MB2.__perf()` → ms mediano de `scene.render()`; forçar frames com `for(i<40) MB2.scene.render()`.
3. Bola atual para comparar: `Mirrors-of-Emotions-Start.bat` (`:3739/app/index-v2.html?src=music`).
4. Consola sem exceções; `PARITY.md` atualizado; STOP e pedir ao David para ver.

## Delegação
Fable 5 (medium) orquestra e julga o visual · Opus = malha/luz/feixes/máquinas de estado/integração ·
Sonnet = mecânico (painel, sala, câmara, persistência, pós, estética). Sempre em paralelo quando independentes;
nunca empilhar fases sem stop.
