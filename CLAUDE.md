# MirrorBall / Mirrors of Emotions — regras deste repo

Bola de espelhos (Canvas 2D, greyscale, física de reflexão) que reage a **música** (motor `music.js`), a **emoções por webcam** (`emotion-v2.js`) ou a **sliders** (manual). Objetivo (verbatim do David): recriar o que sente num clube quando *um técnico de luz competente* trabalha a bola — **não** é um visualizador de áudio. Ver `docs/plan.md` §0 e §0.1 antes de tocar no motor.

**Ritmo: side project.** Resultado visível depressa, afinar depois, fases pequenas com stop visual. Sem harness/anotações/gates pesados. O David testa ao vivo com música real e dá feedback por sensação.

## Layout

```
web/index-v2.html     bola base (CONFIG no topo; API window.MIRRORBALL; ?src= ?mini=1 ?scale= ?light=1)
web/core.js           helpers + MB_SOURCE (arbitragem: owner manual|camera|music — só o dono escreve no CONFIG)
web/music.js          motor de música (Camadas 1-3 + gestos + HUD `m` + driver autónomo quando servida em /app/)
web/emotion-v2.js     motor de emoções (webcam; face-api carregado só ao ligar câmara)
web/bridge.js         ESP32 (Web Serial / WS)
web/test-music-f2.js  harness Node vm (node web/test-music-f2.js) — 16 asserções
web/replay-real.js    replay de features REAIS gravadas do sidecar (node web/replay-real.js feat.json)
firmware/             ESP32
Mirror-V3-Start.bat / Mirror-V3-Kill.bat    spike v3 (sidecar :3739 + serve.py :8099); `manual` como arg = sem motor. Kill mata as 2 portas.
Mirror-2D-Start.bat                          bola 2D (web/index-v2.html) em música, servida pelo sidecar em :3739/app/.
                                             ÚNICOS .bat. Atalhos no Desktop: start-Mirror-v3 / start-Mirror-2D / kill-Mirror-v3.
```

**O áudio vem de fora:** `agent-os/audio-sidecar/` (repo do OS, porta **3739**, WASAPI loopback via `loopback-capture`). Emite a 50 Hz `{rms,bass,mid,high,sub,hat,centroid,density,onset,subOnset,loudness,silence}` (bandas em dB com referência própria = máximo lento ~40 s; **nunca** normalizar bandas umas contra as outras — foi o bug que fez `bass≡1.0`). Serve esta pasta em `http://127.0.0.1:3739/app/*` e o token em `/app-token` (same-origin). Contrato completo no cabeçalho de `web/music.js`.

## Como testar

- **Fora do OS:** atalho `start-Mirror-v3` (spike v3, música) ou `start-Mirror-2D` (bola 2D, `http://127.0.0.1:3739/app/index-v2.html?src=music`).
- **No OS:** tab `/mirrors-emotions` (modo música) ou bola **M** no seletor da sidebar. Ficheiros desta pasta são servidos **do disco** — alterar `music.js`/`index-v2.html` = recarregar a página, sem build. Só mudanças em `agent-os/source/` exigem `npm run build` + restart.
- Cache-buster: ao alterar `music.js`, **bump** `music.js?v=N` no `index-v2.html`.
- Teclas na bola 2D (`index-v2.html`): `m` HUD do motor (linha BOMBO), `p` perfil, `g` gerador sintético, `n` próxima fase, `w` skin, `d` sliders, `e` HUD emoções. **No spike Babylon** o HUD é `h` (sem linha BOMBO; o motor lê-se no bpm da linha dos vultos e nas trocas da linha "estrela"); `k` é o tuner do motor.
- Antes de "afinar", **medir**: gravar 15 s de features reais (script `cap.js` — ver handoff) e correr `replay-real.js`. Adivinhar limiares já custou uma noite.

## Regras do motor (fixadas pelo David, não reabrir)

1. **Skin é do utilizador** (`w`/botão). O motor nunca toca em `setSkinAuto`/tone. Só mexe em `rotationRpm`, `haze`, `sphereOpacity`, feixes e nos 3 spots.
2. **RPM segue o bombo**: com batida, gira sempre (piso 2.6, teto 3.0) e nenhum gesto pode parar a bola; sem bombo, pára em ~2-4 s.
3. **Bombo por banda** (`sub` 40-120 Hz + `subOnset`), **agudos por banda** (`hat` ≥6 kHz → feixes e tique de opacidade).
4. **Densidade espectral → atividade**: muita informação = mais feixes/marcas/velocidade; pouca = subtil e lento (rpm exceto).
5. **Gestos teatrais** nos breakdowns/builds (freeze, ghost, blind-spin, single-beam, fog, strobe-slow, breath), `all-on` no drop. Criatividade bem-vinda; "subtil" lê-se como "fraco".
6. Tetos invioláveis da bola: `beamIntensity ≤ 0.18`, nada > 3 Hz, a bola não emite luz. **Cor é
   permitida** (decisão F8, 2026-08-31): a sala/luzes têm cor real (Lux); greyscale passa a ser um
   **toggle** — tem de existir sempre e funcionar, mas já não é o modo obrigatório.
7. `NaN` mata feixes em silêncio (aconteceu): todo o knob novo em `state` tem de ter valor inicial.
8. **Registo obrigatório na repo**: todos os dados técnicos da sala (dimensões, luzes) e as
   afinações que forem sendo fixadas (chapéus, bola, wash, etc.) vão para `docs/f8-sala-lux.md`
   (ou docs/ seguinte) na mesma sessão em que se decidem — nada fica só em memória/conversa.
9. **Compatibilidade de presets/configs entre versões** (David, F15 — permanente): tudo o que o
   David grava (mb2.knobs, presets F13.5, JSON exportado) **tem de fazer load na versão seguinte**.
   (a) knobs novos ausentes assumem os defaults sem erro; (b) knobs renomeados passam SEMPRE pelo
   mapa `RENAMED` do `panel.js` — esse mapa **só cresce, nunca se apaga uma entrada**; (c) knobs
   removidos/lixo são ignorados sem partir o load; (d) o `sanitizePreset` não rejeita ficheiros por
   lhes faltarem campos novos. Cada fase testa o load de um config da versão anterior. Bateria de
   verificação em `docs/f15-vultos.md` §7.
10. **Todo o knob nasce em config** (K2, `docs/k2-contrato.md`): **constante nova de comportamento
    = knob**, nunca um número solto no código. Se é da cena → `spike-babylon/v2/config.js` +
    entrada no `PERSIST` do `panel.js` + `knobs-default.json` **regenerado** com
    `node spike-babylon/v2/gen-knobs-default.js` (nunca à mão). Se é do motor → entrada em `MUSIC`
    (§TUNE do `web/music.js`) → `web/music-config.json` (que nunca se commita). **Fica no código:**
    tetos de segurança (`beamIntensity ≤ 0.18`, 3 Hz, 4 luzes vivas), tamanhos de buffer/pool GPU e
    o mapa `RENAMED`. Nome com prefixo do elemento (`mikado:`, `sombras:`, `sync:`), valor inicial
    finito (regra 7), toggles 0=off/1=on. Fecha com `node spike-babylon/v2/test-knobs-compat.js`.

## Memória durável — Hindsight bank `claude-code::MirrorBall`

Modelo mental `mirrorball-musica-emocoes`; factos com `document_id` `mirrorball-map/<tema>`. MCP falha muitas vezes → REST (`/v1/default/banks/claude-code::MirrorBall/...`, credenciais em `~/.hindsight/claude-code.json`, `python -X utf8`). Consultar só para perguntas de arquitetura/decisões passadas. Reter só decisões fechadas + porquê; não copiar docs.

## Documentação

- **NotebookLM da repo:** "David - MirrorBall" — `https://notebook.google.com/notebook/52185ce4-d95a-498b-a840-f371cfa91433` (id `52185ce4-d95a-498b-a840-f371cfa91433`). Researches e planos vão para lá como source com o nome do ficheiro; slidedecks pedidos com o mesmo nome que a source.

- `docs/plan.md` — plano v2 + §0.1 feedback da 1ª audição + §4.0 ritmo + §4.1 delegação.
- `docs/handoff-<data>.md` — estado e próximo passo (ler primeiro numa sessão nova).
- `docs/beat-detection-research.md` — Patin/Milkdrop/SoundSwitch: mediana, variância, presença relativa ao BPM (por aplicar).
- Wiki do OS (`2ndBrain/WIKI-Projetos/AI - AgentOS-MissionControl.md`) só quando se toca no `agent-os` (sidecar, tab, sidebar).

Delegação (§4.1): Sonnet para mecânico, Opus para DSP/máquina de estados/debug, Fable (effort medium) orquestra e julga GROOVE/drops. Sempre com stop para o David ouvir.
