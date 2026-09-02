# V0b — Porquê o modo música custava +40 ms (W1, S14) · commits `6fc87ce`, `d733c17`

## O que foi feito
- Causa lida no código do Babylon 9.23: `Light.setEnabled(v)` refaz `_resyncMeshes` em **todas** as
  meshes mesmo quando `v` não muda; e cada flash por batida ligava/desligava SpotLights, o que
  gerava permutações novas de luzes por material → **recompilação de shaders a cada bombo**.
- Correções em `spike-babylon/v2/main.js`: patch ao `setEnabled` (sai cedo se não muda), histerese de
  2 s nos slots dos focos (ficam ligados a I=0 antes de desligar), escritas idempotentes, sem
  `new Color3/Vector3` por frame. Bug lateral corrigido: cor do foco lia o índice errado.
- `MB2.__perf()` tem campos novos: `effects` (shaders compilados), `lightToggles`, `lightDirty`,
  `matDirty` e os deltas `dEffects`, `dLightToggles`, `dLightDirty`, `dMatDirty` desde a chamada
  anterior; `lightsOn`, `spotSlotsHeld`, `activeMeshes`.
- Fix de arranque: `RectAreaLight` nasce sem `direction` (rebentou na 1.ª vez, corrigido).

## O que verificar (bola v3 com `?webgl=1` na URL, tab em foco, consola F12)
1. Modo manual (`start.bat` deste fase arranca em música; para manual corre
   `Mirror-V3-Start.bat manual`): `MB2.__perf()` duas vezes com 10 s entre elas.
   Esperado: `dEffects` **0**, `dLightToggles` 0.
2. Modo música, 10 s de GROOVE com flashes: `MB2.__perf()` 2×. Esperado `dEffects` **0**,
   `dLightToggles` pequeno (só chapéus/mikado), `spotSlotsHeld` entre 0 e 4.
3. Anota `medianRenderMs` manual vs música. A meta é a diferença cair dos +40 ms para perto de 0.
4. Se `dEffects` > 0 com música: desliga `spotsMotor` (painel `d`) e repete; depois `chapéus: máx` 0;
   depois `mikado` 0. Quem faz o número cair é o culpado. Anota as 3 linhas para a tabela
   `docs/f17-visual.md` §0.5.

Mau sinal: `dEffects` a subir a cada batida; `medianRenderMs` música ainda ≥ 2× manual.
