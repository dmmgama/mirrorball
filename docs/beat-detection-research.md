# Beat detection para a bola de espelhos — receita implementável

**Data:** 2026-08-28 · **Contexto:** motor JS (`index-v2.html` / `music.js`) alimentado pelo `audio-sidecar/server.js` (:3739) a 50 Hz, FFT 1024 @ 48 kHz sobre loopback WASAPI.

**Conclusão em uma linha:** a banda já está certa (`sub` 40–120 Hz, tal como o Milkdrop). O que falta é o **método de limiar**: comparar contra **mediana** da própria banda com **teste de variância** (Patin/aubio) em vez de média móvel com limiares fixos — e parar de normalizar o flux ao máximo corrente, que é o que apaga a variância de que o limiar precisa.

---

## 0. Estado atual — verificado no código (2026-08-28)

**Grande parte já está feita.** Ler antes de implementar:

Sidecar (`agent-os/audio-sidecar/server.js`):
- **já emite `sub` (40–120 Hz), `hat` (6–16 kHz) e `subOnset`** (flux só da sub-banda), além de `rms/bass/mid/high/centroid/onset/loudness`.
- As bandas **já não são normalizadas contra o próprio máximo**. Cada banda vai em **dBFS absoluto** (`BAND_REF = FRAME_SIZE/4`, mapeado −60…0 dBFS → 0..1). O comentário no código regista a razão: normalizar por máximo "kills the variance every beat detector needs".

Motor (`C:\Users\JSJ\David\AI\Projects\David\David - Projects\Ativos\MirrorBall\web\music.js`, §KICK ~L411 — **fora deste repo**): `detectKick()` **já usa `subOnset`/`sub`** (fallback `bass`/`onset`), refratário 200 ms, `kickRate` em 2 s, `kickPresence` com attack/release, e §GRID com **mediana de intervalos + fold de oitava 100–150 BPM**.

As Receitas A e C existem em forma inicial. Lacunas reais:

| Lacuna | Onde | Correção (§) |
|---|---|---|
| Limiar por **média móvel**, não mediana; sem teste de variância | `music.js` §KICK | §6 |
| `subOnset` chega **normalizado ao máximo corrente** — mata a variância | `server.js` `normalizeSubOnset()` | §5 |
| Comentários §KICK dizem "`bass` normalizado a bandMax (server.js:146)" — **desatualizado**, já é dB absoluto | `music.js` linhas 30-32, 402-404, 1083 | corrigir |
| Sem detetor de agudos por banda; feixes usam `high`+`onset` global | `music.js` §MAP | §7 |
| `kickPresence` = `kickRate/1.6` fixo, **não usa o BPM estimado** | `music.js` linha 447 | §6 |

---

## 1. O algoritmo clássico — Patin 2003 (números exatos do paper)

Extraí o PDF original (estava encriptado; RC4 password vazia). Os valores, textualmente:

| Conceito | Valor original de Patin |
|---|---|
| Janela instantânea | 1024 amostras (~23 ms @44.1k, ~21 ms @48k) |
| Histórico | **43 frames** = 44032 amostras ≈ **1 s** ("human ear energy persistence") |
| Beat | `e > C · <E>` |
| C global | **1.3** (techno/rap ≈1.4; rock ruidoso ≈1.0–1.1) |
| C adaptativo | `C = −0.0025714·V + 1.5142857`, calibrado por V≈200→C≈1.0, V≈25→C≈1.45 |
| Variância | `V = (1/43)·Σ (E[i] − <E>)²` |
| Sub-bandas | 32 (depois 64, larguras logarítmicas `w_i = a·i + b`) |
| **C por sub-banda** | **≈250** — Patin avisa que "nada tem a ver" com o C=1.3 global, porque numa banda isolada a energia varia muito mais |
| Filtro extra de variância | só aceita beat se `V(E_i) > V0`, com **V0 ≈ 150** |

Nota importante: C=250 e V0=150 são para energia **linear não normalizada** (módulo² da FFT). No nosso pipeline as bandas vêm em 0..1 sobre dB — as constantes **têm de ser recalibradas** (ver §5); a *estrutura* é que se mantém.

## 2. Milkdrop / projectM (código real, v3.1.12 `Renderer/BeatDetect.cpp`)

```
bass = bass_instant / max(0.0001, 1.3 * bass_history + 0.2 * vol_history)
bass_att = 0.6 * bass_att + 0.4 * bass          // idem mid_att, treb_att
bass_history -= bass_buffer[pos] * (1/BEAT_HISTORY_LENGTH)
bass_history += bass_instant   * (1/BEAT_HISTORY_LENGTH)
```

1. **`bass` já é um rácio**, não energia — `1.0` normal, `<0.7` calmo, `>1.3` forte. É o `E/<E>` de Patin com outro nome.
2. O denominador mistura **1.3·histórico da banda + 0.2·histórico do volume** — o termo de volume evita falsos positivos em passagens globalmente altas.
3. `_att` é um **envelope follower de um pólo**, α=0.4. O idioma de beat dos presets é `bass > bass_att`.
4. Bandas por bin de FFT (512): `{0,3,23,200}` — bass = bins 1–3 (≈ 40–130 Hz). **Muito mais estreito** que os nossos 20–150 Hz, e é essa a diferença que faz o Milkdrop seguir o bombo.

## 3. Software profissional de luz (Resolume / SoundSwitch)

- Resolume faz FFT de **18 bandas** (9 por canal) agrupadas em Low/Mid/High; para o kick a doc aponta **10–200 Hz**.
- Os únicos controlos expostos por parâmetro são **Gain** e **Fall** — ou seja, um **envelope follower com release ajustável**. Sem release o valor treme; com release só dispara em transientes.
- A separação kick/hi-hat é por **banda + envelope**, não por classificação: kick ≈ 40–120 Hz, hi-hat ≥ 6 kHz — exatamente o `sub`/`hat` que o sidecar já emite.

## 4. Bibliotecas JS — só o método

- **aubio**: flux com **limiar adaptativo por mediana móvel**, `δ(n) = δ_static + median(p(n−M) … p(n+M))`; threshold 0.3, **minioi 20 ms** (refratário), silence −70 dB; descarta picos pequenos numa janela de 25 ms à volta de um maior.
- **web-audio-beat-detector**: lowpass → picos → histograma de intervalos, **prior 90–180 BPM**; reconhecidamente bom em eletrónica.
- **essentia.js / meyda**: dão flux/centroid/RMS por frame; a decisão é sempre limiar adaptativo a jusante.

**A mediana bate a média** como limiar: um transiente enorme não levanta o limiar durante 1 s inteiro.

---

## 5. Armadilha da normalização — o que o sidecar deve emitir

Já corrigido para as bandas, **ainda presente no onset**: `normalizeOnset()`/`normalizeSubOnset()` dividem o flux pelo **máximo corrente** (`fluxMax`, decay 0.999). É o erro que mata a variância — em música de dinâmica constante o `onset` fica sempre a rondar 1.0 e a razão contra a média deixa de discriminar. O decay 0.999 a 50 Hz tem meia-vida ≈ 14 s: lento demais para seguir mudanças de secção, rápido demais para ser um teto estável.

**O que emitir:**

| Campo | Em vez de | Emitir |
|---|---|---|
| `subFluxRaw` | `subOnset` normalizado por máximo | **flux linear cru** da sub-banda (sem divisão por `subFluxMax`) |
| `hatFluxRaw` | — | idem para 6–16 kHz |
| `subDb`, `hatDb` | — | energia da banda em **dB absoluto** (já existe a mecânica `bandUnit`) |

Manter os `onset`/`subOnset` 0..1 atuais para compatibilidade visual, mas **o detetor deve consumir os `*Raw`**. Regra geral: **normalização é decisão do consumidor, não do produtor** — o sidecar emite grandezas físicas (dB ou energia linear), o motor decide o limiar.

---

## 6. Receita A — kick (`kickPresence`)

Banda **`sub` 40–120 Hz** (já usada), sinal **`subFluxRaw`** — flux e não energia, porque o flux ignora baixo sustentado e só reage a transientes: é essa a diferença entre bombo e linha de baixo.

Mudanças ao `detectKick()`:

1. **Trocar limiar de média por mediana** sobre janela de **N = 50 frames = 1 s** (os 43 de Patin a 50 Hz). A média móvel de 1.6 s (`bassAvgSec`) é levantada pelo próprio kick; a mediana não.
2. **Adicionar o teste de variância de Patin** (`V > V0`): exigir `std > 0.15·mediana`. É o que separa uma batida de ruído estacionário — e é a condição que falta hoje.
3. **C adaptativo** em vez do par fixo `onsetMin 0.22` + `subOver 0.02`: `C = clamp(1.6 − 0.35·(std/mediana), ≥1.15)`. A forma é a de Patin (C desce quando a variância sobe), reescalada porque a nossa unidade não é energia linear.
4. **Refratário 120 ms** em vez de 200 ms: 200 ms corta acima de 300 BPM, o que apaga kicks duplos e fills; 120 ms protege até 500 BPM e nunca corta 4/4 real.
5. **`kickPresence` passa a usar o BPM** (hoje é `kickRate/1.6` fixo): fração de batidas *esperadas* encontradas em 2 s. Com BPM=128, 2 s ≈ 4.27 batidas; 4 encontradas ⇒ presença ≈ 0.94. Assim a presença não cai só porque a faixa é mais lenta — que é o defeito do divisor fixo.

## 7. Receita B — agudos / percussão

Idêntica, sobre **`hat` ≥ 6 kHz** com `hatFluxRaw`. Diferenças:
- **C = 1.4** (hi-hats são mais densos e regulares que o kick).
- Refratário **60 ms** (hi-hats em 1/16 a 140 BPM ≈ 107 ms; 60 ms dá margem).
- Sem histerese de presença: aqui interessa o **envelope** (attack 0.5 / release 0.08) para acender feixes e opacidade, não o evento discreto.

## 8. Receita C — BPM

O §GRID atual (mediana dos últimos 8 intervalos + `foldToPrior` 100–150 BPM + histerese de 4%) **já é a receita certa** para o caso comum e é mais barato que autocorrelação. Manter.

A autocorrelação vale a pena **só como reforço** quando a mediana não converge (`gridConf` baixo): a mediana de intervalos falha se o detetor perder batidas alternadas — passa a medir o dobro do período e o `foldToPrior` "corrige" para o BPM errado. A autocorrelação sobre a lista de tempos (§9, `estimateBpm`) é imune a isso porque pontua `k = 1..4` batidas por intervalo. Usá-la como desempate, não como substituição.

---

## 9. Pseudo-código (JS, todos os números)

```js
// ── Envelope follower de um pólo (o "Fall" do Resolume, o _att do Milkdrop)
class Env {
  constructor(attack = 0.5, release = 0.08) { this.a = attack; this.r = release; this.v = 0; }
  push(x) { const k = x > this.v ? this.a : this.r; this.v += k * (x - this.v); return this.v; }
}

// ── Detetor de banda: Patin (E vs histórico) + limiar por mediana (aubio)
class BandOnset {
  // N=50 frames @50Hz = 1 s de histórico (os 43 de Patin)
  constructor({ N = 50, C = 1.6, refractMs = 120, minStdRatio = 0.15 }) {
    Object.assign(this, { N, C, refractMs, minStdRatio });
    this.hist = []; this.lastBeat = -1e9;
  }
  push(x, tMs) {                       // x = flux LINEAR cru da banda
    this.hist.push(x);
    if (this.hist.length > this.N) this.hist.shift();
    if (this.hist.length < this.N) return false;

    const s = [...this.hist].sort((a, b) => a - b);
    const med = s[s.length >> 1];                       // mediana > média
    const mean = this.hist.reduce((a, b) => a + b, 0) / this.N;
    const varr = this.hist.reduce((a, b) => a + (b - mean) ** 2, 0) / this.N;
    const std = Math.sqrt(varr);

    // C adaptativo, na forma de Patin (C desce quando a variância sobe).
    // Patin: C = -0.0025714*V + 1.5142857 para energia linear.
    // Aqui em unidades relativas: normalizamos V pela mediana.
    const vRel = med > 0 ? std / med : 0;
    const C = Math.max(1.15, this.C - 0.35 * Math.min(vRel, 1));

    const isBeat = x > C * med
                && std > this.minStdRatio * med          // filtro V0 de Patin
                && (tMs - this.lastBeat) > this.refractMs;
    if (isBeat) this.lastBeat = tMs;
    return isBeat;
  }
}

// ── A: kick ─────────────────────────────────────────────────────────────────
const kickDet = new BandOnset({ N: 50, C: 1.6, refractMs: 120 });
const kickTimes = [];                                   // ms dos últimos kicks

function onFeatures(f, tMs) {                           // f = msg do sidecar
  if (kickDet.push(f.subFluxRaw, tMs)) {
    kickTimes.push(tMs);
    while (kickTimes.length && tMs - kickTimes[0] > 8000) kickTimes.shift();
  }
  // ── C: BPM por autocorrelação dos onsets, prior 100-150
  const bpm = estimateBpm(kickTimes);

  // kickPresence: fração das batidas esperadas em 2 s (janela de confiança)
  const win = 2000;
  const found = kickTimes.filter(t => tMs - t <= win).length;
  const expected = bpm ? (bpm / 60) * (win / 1000) : 0; // 128 BPM -> 4.27
  const raw = expected > 0 ? Math.min(1, found / expected) : 0;
  kickPresence = kickPresence + 0.15 * (raw - kickPresence);   // suaviza
}

function estimateBpm(times, lo = 100, hi = 150) {
  if (times.length < 4) return 0;
  let best = 0, bestScore = 0;
  for (let bpm = lo; bpm <= hi; bpm += 0.5) {
    const period = 60000 / bpm;
    let score = 0;
    for (let i = 1; i < times.length; i++) {
      const d = times[i] - times[i - 1];
      const k = Math.round(d / period);
      if (k >= 1 && k <= 4) {                            // aceita 1/2/4 batidas
        const err = Math.abs(d - k * period) / period;
        score += Math.max(0, 1 - err * 4);               // tolerância ±25%
      }
    }
    if (score > bestScore) { bestScore = score; best = bpm; }
  }
  return bestScore > 1.5 ? best : 0;                     // senão, sem confiança
}

// ── B: agudos / percussão ───────────────────────────────────────────────────
const hatDet = new BandOnset({ N: 50, C: 1.4, refractMs: 60 });
const hatEnv = new Env(0.5, 0.08);                       // attack / release
// por frame:  hatLevel = hatEnv.push(f.hatFluxRaw / (medianaCorrente || 1));
//             if (hatDet.push(f.hatFluxRaw, tMs)) → flash de feixe
```

**Calibração (fazer uma vez, com música real):** liga o log de `subFluxRaw` e `mediana`, toca 30 s de um track 4/4 conhecido e ajusta `C` até a contagem de kicks bater com o BPM real (128 BPM ⇒ ~64 kicks em 30 s). É o passo que os números do Patin não podem substituir, porque a escala do flux depende da janela, do Hann e do ganho do loopback.

---

## Fontes

- [Patin, F. — *Beat Detection Algorithms* (2003), PDF original](https://www.flipcode.com/misc/BeatDetectionAlgorithms.pdf) — C=1.3, 43 frames, regressão C(V), C≈250 e V0≈150 por sub-banda
- [Parallelcube — Beat detection algorithm](https://www.parallelcube.com/2018/03/30/beat-detection-algorithm/) — variante `threshold = −15·var + 1.55`, bandas 60–130 Hz (kick) e 301–750 Hz (caixa)
- [projectM v3.1.12 `Renderer/BeatDetect.cpp`](https://raw.githubusercontent.com/projectM-visualizer/projectm/v3.1.12/src/libprojectM/Renderer/BeatDetect.cpp) — fórmulas de `bass`, `bass_att`, histories
- [Geiss — MilkDrop preset authoring guide](https://www.geisswerks.com/milkdrop/milkdrop_preset_authoring.html) — semântica de `bass/mid/treb` (1 = normal, >1.3 = forte) e `_att`
- [Resolume — Wire FFT / audio analysis](https://resolume.com/support/en/wire-fft) — 18 bandas, Gain/Fall, 10–200 Hz para kick
- [aubio — onset CLI e `onset.h`](https://aubio.org/manual/latest/cli.html) — limiar adaptativo por mediana, threshold 0.3, minioi 20 ms
- [web-audio-beat-detector](https://github.com/chrisguttandin/web-audio-beat-detector) — prior 90–180 BPM, histograma de intervalos
