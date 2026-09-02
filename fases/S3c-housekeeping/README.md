# S3c — Housekeeping do sync (S14) · commit `f7e56ce`

## O que foi feito (zero mudança visível por desenho)
- `fromMotor` completo: faltava em `MB.setSpot` do motor. **Achado**: a bola 2D (`index-v2.html`) não
  tinha disjuntor nenhum — `setSpot/flash/retarget/strobe` do motor entravam mesmo com "focos+flashes:
  motor manda" a 0. Agora respeita, como o spike já fazia.
- `spotFadeMix`/`flashRate`: já estavam atrás do `spotsMotor`; ficaram idempotentes (escrevem só se muda).
- `spotGain` um escritor: `composeSpotGain()` em `main.js` junta as 3 parcelas (health, `bola (0/1)`,
  estrelato). Equivalência verificada em 864 combinações, zero diferenças.
- `hats.js`: `flashAcc` morto removido.
- `stardom.driveHats` ramo `ball`: `Math.random() < p` → acumulador por compasso (mesma taxa média,
  sem random temporal). Último random temporal dos chapéus abatido.
- `tuner.js`: secção local `SYNC_SEC` removida (morta desde que o `music.js` tem `schema.sync`).
- Harness 22/23, presets 45/45.

## O que verificar (bola 2D e v3, música)
1. **2D**: painel `d`, "focos+flashes: motor manda" a 0 → os focos ficam quietos com música (antes
   mexiam). A 1 → voltam a seguir o motor.
2. **v3**: tudo igual a antes. Se algo mudou de brilho nos focos (health/silêncio, `bola (0/1)` a 0,
   estrela bola), anota — seria o `composeSpotGain`.
3. Chapéus em estrela `bola`: o apoio em `barTick` continua a existir, com a mesma frequência média.
4. Tuner `k`: a secção "Sync (sala) — S2" desapareceu; os knobs `sync:*` estão todos na secção "Sync".
