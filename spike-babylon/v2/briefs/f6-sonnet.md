# Brief F6 — Sonnet: corpos PAR36 visíveis (lente segue o dimmer, luz nasce do corpo, rig plausível), `?mini=1` / `?scale=`

Estado: F1-F5 commitadas (`7280271`). A corrente 3D já existe (F3). O Opus faz em paralelo `briefs/f7-opus.md` (explosão em
`v2/explode.js` + `ball.js` + bloco `// ---- F7 explode ----` do `main.js`) — não toques em `ball.js`, `explode.js`, nem nesse
bloco; o teu bloco no `main.js` é `// ---- F6 fixtures/mini ----`. Ele vai pedir-te 3 knobs de explosão e um botão `#xpl` via
`briefs/f67-sync.md` — lê-o de vez em quando; tu és dono de `panel.js`/`index.html`.
**Tab de Chrome dedicado teu. Nunca `taskkill /IM python.exe` — só o PID do teu `serve.py` (8099; se ocupada, 8097).**

Lê **só isto**: `docs/plan-babylon-v2.md` (prioridades 4-5: estética no fim, distância dos corpos "o que for melhor agora, afina-se
depois"; todo o valor à sensação ganha knob) · `docs/lighting-design-research.md` (PAR36: pinspot 30 W, feixe 4-12°, a 1-3 m da
bola; rig 2+2 a az ±95° / el ~35°) · `docs/parity-canvas2d.md` §1.16 · `web/index-v2.html` **176-186** (`?mini=1`, `?scale=`,
`?light=1`) · `v2/main.js` (como as SpotLights são criadas a partir de `ball.mountedSpots` — grep `updateSpotLights`, `spotDist`;
`camDistance`/enquadramento 0.52 vh) · `v2/config.js` (`spotDist`, `room`) · `v2/incident.js` só o suficiente para saber onde
nasce o cone (`hit + S·incidentLen`) — a lente do corpo deve ficar **nesse ponto** para a luz nascer do corpo.

## Entrega
1. **`v2/fixtures.js`** — `createFixtures(scene, CONFIG, room)` → `{ update(mountedSpots, E) }`. Por spot montado (pool de
   `CONFIG.spots.length`, `setEnabled` conforme ativo; flashes **não** têm corpo): um **PAR36** simplificado — cilindro curto
   (lata, PBR metal escuro, roughness 0.6) + aro + **lente** (disco à frente, material emissivo greyscale cujo `emissiveColor` =
   `I·lensGain` — "a lente segue o dimmer") + yoke/haste até ao ponto de fixação mais próximo (teto ou parede: escolhe pela
   direção `S`; se `el > 45°` → teto, senão parede lateral/traseira; a haste é uma linha/cilindro fino até ao plano). Posição
   do corpo = `C + S·spotDist` (o mesmo ponto de onde a `SpotLight` ilumina e de onde o cone incidente nasce — fonte única:
   `mountedSpots` + `CONFIG.spotDist`). Orientação: eixo do corpo alinhado com `−S` (aponta à bola). Escala em raios:
   lata Ø `0.12·fixtureScale`, comprimento 0.18. Knobs: `focos: distância (raios)` (já existe como `spotDist`? confirma; senão
   cria, 1.5-8), `corpos (0/1)`, `corpos: escala`, `corpos: lente ×` (`lensGain`), `corpos: haste (0/1)`.
   Greyscale; a lente é a **única** coisa que emite, e só quando o spot está ligado; não ilumina a sala (é só emissivo).
   Se `CONFIG.spotColorOn`, a lente tinge com o matiz do spot (opt-in do David, F2).
2. **Rig plausível**: com os defaults (2 focos a az ±95°/el 35°) os corpos devem ficar dentro da sala (`CONFIG.room`) — se
   `C + S·spotDist` sair da sala, **clampa** ao plano mais próximo (o corpo fica encostado à parede/teto) e documenta.
3. **`?mini=1` / `?scale=` / `?light=1`** (`:176-186`): `mini` → enquadramento 0.66 vh, centro `[0.5, 0.56]`, `facetRows 39`,
   `beamWidthDeg 1.6`, `beamLen` proporcional (`beamLength 1.0`→ escolhe equivalente), `dotScale 0.5`, `bloomBlurPx 5`, `grain 0.02`,
   `vignette 0.35`, classe `mini` no `<html>` (esconde HUD/painel/botões), skin fixa (`?light=1` → white, senão dark);
   `?scale=N` multiplica o enquadramento. Implementa via `camera.radius`/`fov` (o enquadramento em vh é a métrica — mede que a bola
   ocupa 0.66 do viewport em altura).
4. Botão `#xpl` no `#ui` ("explosões: on/off", persiste em `localStorage['mb2.explode']`) — só o DOM/estilo; o handler é do Opus
   (`window.MIRRORBALL.setExplodeEnabled`) — expõe o elemento e anota em `f67-sync.md`. Knobs de explosão que ele pedir.
5. `PARITY.md` §1.16 + secção nova "Corpos PAR36 (F6)" com ⚠ onde inventas (a bola Canvas não tem corpos — tudo aqui é novo,
   documenta as escolhas e os knobs).

## Não fazer
`ball.js`, `explode.js`, bloco F7 do `main.js`, `beams.js`, `incident.js`, `web/`, `agent-os/`. Sem `git commit`.

## Feito quando
`:8099/v2/index.html?webgl=1`: ao orbitar vê-se cada foco ativo como um corpo PAR36 na sala apontado à bola, com a lente a
acender/apagar com o fade e a saltar com `focos: saltam`; o cone incidente e o feixe da SpotLight nascem do corpo; `corpos 0`
esconde tudo; `?mini=1` dá a bola a 0.66 vh sem HUD/painel, `?mini=1&light=1` em white, `?scale=0.5` metade; consola limpa;
`MB2.__perf()` < 8 ms. Reporta knobs novos e as escolhas de rig.
