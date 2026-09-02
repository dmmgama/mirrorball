# K2 — Contrato "todo o knob nasce em config" (S14) · commit `3d5e38d`

## O que foi feito
- **Regra 10** no `CLAUDE.md`: constante nova de comportamento = knob (`config.js` + `PERSIST` +
  `knobs-default.json` regenerado) ou entrada em `MUSIC` §TUNE se for do motor. Fica no código: tetos
  de segurança (0,18 / 3 Hz / 4 luzes), buffers GPU, `RENAMED`. Fecha com `test-knobs-compat.js`.
- Checklist K2 de 5 perguntas em `docs/mapa-frentes.md` §3.
- **Auditoria do S14** em `docs/k2-contrato.md`: 23 constantes que nasceram no código nesta sessão;
  11 propostas como knob, 12 ficam com justificação. Nada foi convertido — é lista para decidires.

## O que verificar (só leitura, sem browser)
1. Lê `docs/k2-contrato.md`. Os quatro achados que pesam:
   - `PHRASE_BARS = 8` em `stardom.js` **ignora** o knob `sync: compassos por frase` que já existe
     (se mexeres no slider, o estrelato não segue). É bug, não decisão — o agente vai corrigir na
     ronda seguinte (fase `K2b`).
   - `CLOCK_DEAD_S = 1.5` repetido em 4 ficheiros (stardom, mikado, hats, choreo) → um só knob.
   - `rampInSec/rampOutSec` e o ataque do blackout carregam do JSON mas não têm slider no `k`.
   - `PROFILE` + `HERO` no estrelato: ~55 ganhos "de sensação" — decisão grande (knobs no painel vs
     ficheiro de perfil). Sugestão: só depois da audição.
2. Marca na tabela o que queres como knob e o que fica. Isso é o brief da fase K3.
