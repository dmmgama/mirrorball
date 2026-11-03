// Agent OS — audio sidecar.
//
// CÓPIA LINUX (branch mirrorball-linux da repo MirrorBall). Origem: agent-os/audio-sidecar/server.js.
// Diferenças face ao original: (1) em Linux a captura é feita lançando `parec` (PipeWire/Pulse,
// monitor da saída por omissão) ou `pw-record`, em vez do addon WASAPI `loopback-capture`
// (que só existe em Windows e passa a ser carregado só lá); (2) APP_DIR por omissão = ../web
// relativo a este ficheiro (serve a web/ DESTA checkout, não um caminho Windows fixo).
// O formato PCM é o mesmo (s16le, estéreo, 48 kHz) → pipeline de features intocado.
//
// Owns system-audio capture + feature extraction for the "Mirrors of
// Emotions" tab (Fase 3 of docs/2026-08-28_mirrors-of-emotions-plan.md).
// Captures the default output device via WASAPI loopback (loopback-capture,
// N-API), downmixes to mono float PCM, runs a small FFT-based feature
// pipeline (rms/bands/centroid/onset/loudness) at 50 Hz, and streams the
// result over WebSocket to the browser tab. Raw PCM never leaves this
// process — only derived features cross the wire.
//
// Lives OUTSIDE source/ on purpose, same reasoning as terminal-sidecar/: the
// vendor pack updater mirrors source/ and would delete it. Started by
// start-agentic-os*.bat; killed by kill-agentic-os.bat. Port 3739, loopback
// only.
//
// Security: same pattern as terminal-sidecar — a per-start token is written
// to ~/.agentic-os/audio-token only AFTER the port is bound; every request
// must carry it (header x-audio-token, WS subprotocol "agentos-audio" +
// token, or ?token= for the simple case) and come from an allow-listed
// Origin/Host.
//
// No `grid` message in this phase (beat/downbeat tracking is Fase 4+) —
// only continuous features.

'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { performance } = require('perf_hooks');
const { WebSocketServer } = require('ws');
const { spawn } = require('child_process');
// WASAPI só existe em Windows; em Linux nem se tenta carregar o addon (é optionalDependency).
const IS_WIN = process.platform === 'win32';
const loopback = IS_WIN ? require('loopback-capture') : null;

const HOST = '127.0.0.1';
const PORT = Number(process.env.AUDIO_PORT || 3739);
const OS_ORIGINS = ['http://127.0.0.1:3737', 'http://localhost:3737'];
// MirrorBall spike v2 (spike-babylon/serve.py, :8099) liga-se ao WS daqui a partir da sua própria origem.
const SPIKE_ORIGINS = ['http://127.0.0.1:8099', 'http://localhost:8099'];
const ALLOWED_ORIGIN = new Set([...OS_ORIGINS, ...SPIKE_ORIGINS, `http://${HOST}:${PORT}`, `http://localhost:${PORT}`]);
const ALLOWED_HOST = new Set([`${HOST}:${PORT}`, `localhost:${PORT}`]);
const STATE_DIR = path.join(os.homedir(), '.agentic-os');
const TOKEN_FILE = path.join(STATE_DIR, 'audio-token');
const PID_FILE = path.join(STATE_DIR, 'audio-pid');

// ── token ──────────────────────────────────────────────────────────────────
// NB: written only AFTER we successfully bind the port (see server.listen
// below). If another sidecar already owns 3739, this process exits on
// EADDRINUSE without clobbering the live token — no split brain.
const TOKEN = process.env.AUDIO_TOKEN || crypto.randomBytes(24).toString('hex');
fs.mkdirSync(STATE_DIR, { recursive: true });

// ── audio format from loopback-capture ──────────────────────────────────────
// README: "16-bit, stereo, 48kHz" for both per-process and system capture.
const SRC_SAMPLE_RATE = 48000;
const SRC_CHANNELS = 2;
const SRC_BYTES_PER_SAMPLE = 2; // int16

// ── feature pipeline constants ──────────────────────────────────────────────
const FRAME_SIZE = 1024;              // samples per analysis frame (mono, 48kHz)
const EMIT_HZ = 50;                   // features message rate while capturing
const EMIT_MS = 1000 / EMIT_HZ;
const SILENCE_HZ = 4;                 // features message rate while silent
const SILENCE_MS = 1000 / SILENCE_HZ;
const SILENCE_GAP_MS = 500;           // no buffers for this long => silence
const RESTART_GAP_MS = 3000;
// Folder served at /app/* for the standalone launcher (MirrorBall/web). Override with AUDIO_APP_DIR.
const APP_DIR = process.env.AUDIO_APP_DIR || path.join(__dirname, '..', 'web');
const ZERO_GAP_MS = 4000;             // all-zero buffers for this long => restart capture          // no buffers for this long => restart capture (device change)

// ── MirrorBall live-tuning config (music-config.json) ──────────────────────
// The ball's calibration panel (key `k`) writes the engine CONFIG overrides here so David can
// tune with music playing instead of editing music.js and reloading.
//
// Locations are a FIXED, server-side allow-list addressed by ID. The client never sends a path:
// it sends "app" or "home" and the server resolves it. That is the whole path-traversal surface,
// closed by construction — a browser page must not be able to name a directory to write into.
// Order matters: startup load tries them in this order and uses the first valid file.
const CONFIG_FILE_NAME = 'music-config.json';   // fixed, never from the request
const CONFIG_MAX_BYTES = 64 * 1024;
const HOME_CONFIG_DIR = path.join(os.homedir(), '.mirrorball');
const CONFIG_LOCATIONS = [
  { id: 'app', label: 'pasta da bola (web/ do MirrorBall)', dir: APP_DIR },
  { id: 'home', label: '~/.mirrorball (fora do repo)', dir: HOME_CONFIG_DIR },
];
// Which location the panel last saved to. Persisted next to the token so it survives a restart —
// otherwise the choice silently reverts to the default and the file "moves" under David's feet.
const CONFIG_CHOICE_FILE = path.join(STATE_DIR, 'mirrorball-config-location');
function configLocation(id) { return CONFIG_LOCATIONS.find(l => l.id === id) || null; }
function activeConfigId() {
  try {
    const id = fs.readFileSync(CONFIG_CHOICE_FILE, 'utf8').trim();
    if (configLocation(id)) return id;
  } catch {}
  return CONFIG_LOCATIONS[0].id;
}
function configPath(id) {
  const loc = configLocation(id);
  return loc ? path.join(loc.dir, CONFIG_FILE_NAME) : null;
}
const LOUDNESS_WINDOW_S = 20;         // moving average window for gated loudness
const GATE_DBFS = -50;                // frames quieter than this don't count toward loudness
const DBFS_FLOOR = -60;               // 0..1 normalization floor
const DBFS_CEIL = 0;                  // 0..1 normalization ceiling

// Band edges (Hz) — bass/mid/high per the brief.
const BASS_LO = 20, BASS_HI = 150;
const MID_LO = 150, MID_HI = 2000;
const HIGH_LO = 2000, HIGH_HI = 16000;
const SUB_LO = 40, SUB_HI = 120;      // kick body
const HAT_LO = 6000, HAT_HI = 16000;  // hi-hats / percussive highs
// Snare body. Added 2026-08-29: the MirrorBall engine had band detectors for `sub` (kick) and
// `hat` (hi-hats) only, so a dry snare — which lives between the two — triggered nothing.
// Deliberately narrower than `mid` (150-2000 Hz): `mid` also carries most of the melodic
// content, and its flux tracks broadband transients rather than the snare (measured on real
// recordings: corr(midFlux, hatFluxRaw) = 0.36, i.e. it mostly followed the cymbals).
const SNARE_LO = 200, SNARE_HI = 800;

// ── tiny radix-2 FFT (real input, magnitude output) ─────────────────────────
// FRAME_SIZE is a power of two (1024) so no padding logic is needed.
function fftMag(real) {
  const n = real.length;
  const re = Float64Array.from(real);
  const im = new Float64Array(n);
  // bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const tr = re[i]; re[i] = re[j]; re[j] = tr; const ti = im[i]; im[i] = im[j]; im[j] = ti; }
  }
  // iterative Cooley-Tukey
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curWr = 1, curWi = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * curWr - im[i + k + len / 2] * curWi;
        const vi = re[i + k + len / 2] * curWi + im[i + k + len / 2] * curWr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const nwr = curWr * wr - curWi * wi;
        const nwi = curWr * wi + curWi * wr;
        curWr = nwr; curWi = nwi;
      }
    }
  }
  const half = n / 2;
  const mag = new Float64Array(half);
  for (let i = 0; i < half; i++) mag[i] = Math.hypot(re[i], im[i]);
  return mag;
}

// Precompute a Hann window for FRAME_SIZE.
const HANN = new Float64Array(FRAME_SIZE);
for (let i = 0; i < FRAME_SIZE; i++) HANN[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME_SIZE - 1));

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
function dbfsToUnit(db) { return clamp01((db - DBFS_FLOOR) / (DBFS_CEIL - DBFS_FLOOR)); }

// ── per-frame analysis ───────────────────────────────────────────────────────
// mono: Float32Array/Float64Array of FRAME_SIZE samples in [-1, 1]
let prevSpectrum = null; // for spectral flux (onset)
const bandRef = {};           // per-band slow running max
const BAND_REF_DECAY = 0.99965; // ×47 fps ≈ 40 s half-life
const BAND_RANGE_DB = 30;     // dynamic range mapped to 0..1 under the running max
function analyzeFrame(mono) {
  // rms + dBFS
  let sumSq = 0;
  for (let i = 0; i < mono.length; i++) sumSq += mono[i] * mono[i];
  const rms = Math.sqrt(sumSq / mono.length);
  const dbfs = rms > 0 ? 20 * Math.log10(rms) : -Infinity;

  // windowed FFT magnitude
  const windowed = new Float64Array(FRAME_SIZE);
  for (let i = 0; i < FRAME_SIZE; i++) windowed[i] = mono[i] * HANN[i];
  const mag = fftMag(windowed);

  const binHz = SRC_SAMPLE_RATE / FRAME_SIZE;
  const binIndex = (hz) => Math.max(0, Math.min(mag.length - 1, Math.round(hz / binHz)));

  const sumBand = (loHz, hiHz) => {
    const lo = binIndex(loHz), hi = binIndex(hiHz);
    let s = 0, count = 0;
    for (let i = lo; i <= hi; i++) { s += mag[i]; count++; }
    return count ? s / count : 0;
  };
  const bassRaw = sumBand(BASS_LO, BASS_HI);
  const midRaw = sumBand(MID_LO, MID_HI);
  const highRaw = sumBand(HIGH_LO, HIGH_HI);
  const subRaw = sumBand(SUB_LO, SUB_HI);
  const hatRaw = sumBand(HAT_LO, HAT_HI);
  // Each band on its OWN absolute dB scale (full-scale sine ≈ FRAME_SIZE/4 mean magnitude with
  // Hann). Never normalize bands against each other per frame: bass dominates and pins at 1.0,
  // which kills the variance every beat detector needs (measured 2026-08-28).
  // Reference per band = slow running max (~40 s half-life): each band spans its own dynamics
  // (Milkdrop-style). Absolute dBFS made high/hat sit under the floor (tiny mean magnitude per
  // bin up there → 0.000 while the music was clearly full of hats; measured 2026-08-28).
  const bandUnit = (raw, key) => {
    bandRef[key] = Math.max(raw, (bandRef[key] || 1e-6) * BAND_REF_DECAY);
    const db = raw > 0 ? 20 * Math.log10(raw / bandRef[key]) : -Infinity;
    return clamp01((db + BAND_RANGE_DB) / BAND_RANGE_DB);   // -BAND_RANGE_DB..0 dB → 0..1
  };
  const BAND_REF = FRAME_SIZE / 4;

  // spectral density: fraction of bins (20 Hz-16 kHz) carrying energy above -48 dB of full
  // scale. "Much information" (rich spectrum) → ~0.5+; a sparse pad or a lone kick → < 0.15.
  {
    const lo = binIndex(20), hi = binIndex(16000);
    let peak = 1e-9; for (let i = lo; i <= hi; i++) if (mag[i] > peak) peak = mag[i];
    const thr = peak * Math.pow(10, -36 / 20);
    let on = 0; for (let i = lo; i <= hi; i++) if (mag[i] > thr) on++;
    var density = (hi > lo) ? on / (hi - lo + 1) : 0;
  }

  // spectral centroid, Hz -> normalized 0..1 in log space across the audible range
  let num = 0, den = 0;
  for (let i = 0; i < mag.length; i++) { num += i * binHz * mag[i]; den += mag[i]; }
  const centroidHz = den > 0 ? num / den : 0;
  const CENTROID_LO_HZ = 20, CENTROID_HI_HZ = 16000;
  const centroid = clamp01(
    (Math.log2(Math.max(centroidHz, CENTROID_LO_HZ)) - Math.log2(CENTROID_LO_HZ)) /
    (Math.log2(CENTROID_HI_HZ) - Math.log2(CENTROID_LO_HZ))
  );

  // spectral flux (half-wave rectified) for onset
  let flux = 0, subFlux = 0, hatFlux = 0, midFlux = 0;
  if (prevSpectrum) {
    const sLo = binIndex(SUB_LO), sHi = binIndex(SUB_HI);
    const hLo = binIndex(HAT_LO), hHi = binIndex(HAT_HI);
    const nLo = binIndex(SNARE_LO), nHi = binIndex(SNARE_HI);
    for (let i = 0; i < mag.length; i++) {
      const d = mag[i] - prevSpectrum[i];
      if (d > 0) {
        flux += d;
        if (i >= sLo && i <= sHi) subFlux += d;
        if (i >= hLo && i <= hHi) hatFlux += d;
        if (i >= nLo && i <= nHi) midFlux += d;   // snare band (200-800 Hz)
      }
    }
  }
  prevSpectrum = mag;

  return { rms, dbfs, bass: bandUnit(bassRaw, 'bass'), mid: bandUnit(midRaw, 'mid'), high: bandUnit(highRaw, 'high'),
           sub: bandUnit(subRaw, 'sub'), hat: bandUnit(hatRaw, 'hat'), centroid, density, flux, subFlux, hatFlux, midFlux };
}

// ── loudness: gated moving average over LOUDNESS_WINDOW_S ──────────────────
const loudnessHistory = []; // { t, dbfs }
function pushLoudness(t, dbfs) {
  if (dbfs < GATE_DBFS) return; // gate: ignore very quiet frames
  loudnessHistory.push({ t, dbfs });
  const cutoff = t - LOUDNESS_WINDOW_S * 1000;
  while (loudnessHistory.length && loudnessHistory[0].t < cutoff) loudnessHistory.shift();
}
function currentLoudness() {
  if (!loudnessHistory.length) return 0;
  let sum = 0;
  for (const e of loudnessHistory) sum += e.dbfs;
  return dbfsToUnit(sum / loudnessHistory.length);
}

// ── onset normalization: track a running max flux for 0..1 scaling ─────────
let fluxMax = 1e-6;
const FLUX_DECAY = 0.999; // slow decay so the ceiling adapts but doesn't freeze at one loud transient
let subFluxMax = 1e-6;
function normalizeSubOnset(flux) {
  subFluxMax = Math.max(flux, subFluxMax * FLUX_DECAY);
  return clamp01(flux / subFluxMax);
}
function normalizeOnset(flux) {
  fluxMax = Math.max(flux, fluxMax * FLUX_DECAY);
  return clamp01(flux / fluxMax);
}

// ── capture + downmix + frame accumulation ──────────────────────────────────
let capture = null;
let capturing = false;
let lastBufferAt = 0;
let lastNonZeroAt = 0;   // last chunk with any non-zero sample (zeros = wrong endpoint after a device change)
let leftoverInt16 = null; // carries partial samples across chunk boundaries
let frameAccum = new Float64Array(FRAME_SIZE);
let frameFill = 0;

// 50 Hz aggregation window: average bands/rms/centroid, max onset, over frames
// produced since the last emit.
let agg = null;
function resetAgg() { agg = { rms: [], bass: [], mid: [], high: [], sub: [], hat: [], density: [], centroid: [], onsetMax: 0, subOnsetMax: 0, subFluxRawMax: 0, hatFluxRawMax: 0, midFluxRawMax: 0, frames: 0 }; }
resetAgg();

function pushFrameResult(f, tNow) {
  agg.rms.push(f.rms);
  agg.bass.push(f.bass); agg.sub.push(f.sub); agg.hat.push(f.hat); agg.density.push(f.density);
  agg.mid.push(f.mid);
  agg.high.push(f.high);
  agg.centroid.push(f.centroid);
  const onset = normalizeOnset(f.flux);
  if (onset > agg.onsetMax) agg.onsetMax = onset;
  const subOnset = normalizeSubOnset(f.subFlux);
  if (subOnset > agg.subOnsetMax) agg.subOnsetMax = subOnset;
  // Raw (un-normalized) band flux: the engine's median/variance threshold needs the real
  // dynamics. Dividing by a running max — what subOnset/onset do — flattens every beat to ~1.0
  // and kills the variance the detector keys on. Normalization is the consumer's call, not the
  // producer's. Aggregated by MAX (like the onsets): these are transients, not levels.
  if (f.subFlux > agg.subFluxRawMax) agg.subFluxRawMax = f.subFlux;
  if (f.hatFlux > agg.hatFluxRawMax) agg.hatFluxRawMax = f.hatFlux;
  if (f.midFlux > agg.midFluxRawMax) agg.midFluxRawMax = f.midFlux;   // snare band
  agg.frames++;
  pushLoudness(tNow, f.dbfs);
}

function handlePcmChunk(chunk) {
  lastBufferAt = Date.now();
  for (let i = 0; i < chunk.length; i += 64) { if (chunk[i] !== 0) { lastNonZeroAt = lastBufferAt; break; } }
  // chunk: Buffer, int16 stereo interleaved (L,R,L,R,...)
  let buf = chunk;
  if (leftoverInt16 && leftoverInt16.length) {
    buf = Buffer.concat([leftoverInt16, chunk]);
    leftoverInt16 = null;
  }
  const frameBytes = SRC_CHANNELS * SRC_BYTES_PER_SAMPLE; // 4 bytes per stereo sample pair
  const usableLen = buf.length - (buf.length % frameBytes);
  if (usableLen < buf.length) leftoverInt16 = buf.subarray(usableLen);
  const stereoSamples = usableLen / frameBytes;

  for (let i = 0; i < stereoSamples; i++) {
    const l = buf.readInt16LE(i * frameBytes) / 32768;
    const r = buf.readInt16LE(i * frameBytes + 2) / 32768;
    const mono = (l + r) * 0.5;
    frameAccum[frameFill++] = mono;
    if (frameFill === FRAME_SIZE) {
      const f = analyzeFrame(frameAccum);
      pushFrameResult(f, Date.now());
      frameFill = 0;
    }
  }
}

// ── Linux: captura por processo externo (PipeWire) ─────────────────────────
// Ordem: AUDIO_CAPTURE_CMD (override, comando completo que escreva s16le/48k/estéreo no stdout)
// → parec (pipewire-pulse/libpulse, monitor da saída por omissão) → pw-record (sink monitor).
// Se o processo morrer, o watcher "no buffers" abaixo relança-o (e assim também apanha a troca
// de saída de som, como no Windows).
const LINUX_CAPTURE_CMDS = [
  ['parec', ['-d', '@DEFAULT_MONITOR@', '--format=s16le', `--rate=${SRC_SAMPLE_RATE}`, `--channels=${SRC_CHANNELS}`, '--raw', '--latency-msec=20']],
  ['pw-record', ['-P', '{ stream.capture.sink=true }', '--format', 's16', '--rate', String(SRC_SAMPLE_RATE), '--channels', String(SRC_CHANNELS), '-']],
];
let linuxCmdIdx = 0;
function startLinuxCapture(onChunk) {
  let cmd, args;
  if (process.env.AUDIO_CAPTURE_CMD) { cmd = 'sh'; args = ['-c', process.env.AUDIO_CAPTURE_CMD]; }
  else [cmd, args] = LINUX_CAPTURE_CMDS[linuxCmdIdx % LINUX_CAPTURE_CMDS.length];
  const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', onChunk);
  child.stderr.on('data', d => console.error(`[audio] ${cmd}: ${String(d).trim()}`));
  child.on('error', e => {
    console.error(`[audio] não consegui lançar ${cmd} (${e.code || e.message})`);
    if (!process.env.AUDIO_CAPTURE_CMD) linuxCmdIdx++;   // tenta o próximo comando no restart
  });
  child.on('exit', (code, sig) => { if (capture && capture.child === child) console.error(`[audio] ${cmd} saiu (code ${code}, sig ${sig})`); });
  console.log(`[audio] capture started (Linux: ${cmd} ${args.join(' ')})`);
  return { child, stop() { try { child.kill('SIGTERM'); } catch {} } };
}

function startCapture() {
  if (capturing) return;
  const onChunk = (chunk) => { try { handlePcmChunk(chunk); } catch (e) { console.error('[audio] frame error', e); } };
  if (IS_WIN) {
    capture = new loopback.LoopbackCapture();
    capture.startSystemAudio(onChunk);
    console.log('[audio] capture started (system audio, WASAPI loopback)');
  } else {
    capture = startLinuxCapture(onChunk);
  }
  capturing = true;
  lastBufferAt = Date.now(); lastNonZeroAt = Date.now();
}
function stopCapture() {
  if (!capturing) return;
  try { capture.stop(); } catch (e) { console.error('[audio] stop error', e); }
  capture = null;
  capturing = false;
}
function restartCapture(reason) {
  console.log(`[audio] restarting capture (${reason})`);
  stopCapture();
  leftoverInt16 = null;
  frameFill = 0;
  prevSpectrum = null;
  setTimeout(startCapture, 50);
}

// ── silence tracking ─────────────────────────────────────────────────────
function isSilent() { return Date.now() - lastBufferAt > SILENCE_GAP_MS; }

// ── watcher: no buffers for RESTART_GAP_MS while not "known" silence yet ────
// Minimal device-change handling per the brief: a dead default device stops
// emitting buffers entirely (no error), which is indistinguishable from
// silence until it has gone on far longer than any real silence gate needs.
// We restart to pick up a new default device (e.g. after switching output).
setInterval(() => {
  if (!capturing) return;
  const gap = Date.now() - lastBufferAt;
  if (gap > RESTART_GAP_MS) restartCapture(`no buffers for ${gap}ms — possible device change`);
  // Buffers arriving but all-zero for a long stretch: WASAPI loopback stuck on an endpoint
  // nobody is rendering to (default output changed). Restart at most every 15 s.
  else if (lastNonZeroAt && Date.now() - lastNonZeroAt > ZERO_GAP_MS && Date.now() - lastZeroRestartAt > 15000) {
    lastZeroRestartAt = Date.now();
    restartCapture(`all-zero buffers for ${Date.now() - lastNonZeroAt}ms — possible device change`);
  }
}, 1000);
let lastZeroRestartAt = 0;

// ── broadcast loop ───────────────────────────────────────────────────────
const clients = new Set();
function zeros() { return { rms: 0, bass: 0, mid: 0, high: 0, sub: 0, hat: 0, density: 0, centroid: 0, onset: 0, subOnset: 0, subFluxRaw: 0, hatFluxRaw: 0, midFluxRaw: 0, loudness: 0 }; }
function broadcastFeatures() {
  const silent = isSilent();
  let payload;
  if (silent) {
    payload = { type: 'features', t: performance.now(), silence: true, ...zeros(), loudness: currentLoudness() };
  } else {
    const n = agg.frames || 1;
    const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    payload = {
      type: 'features',
      t: performance.now(),
      rms: avg(agg.rms),
      bass: avg(agg.bass),
      mid: avg(agg.mid),
      high: avg(agg.high),
      sub: avg(agg.sub),
      hat: avg(agg.hat),
      density: avg(agg.density),
      subOnset: agg.subOnsetMax,
      subFluxRaw: agg.subFluxRawMax,
      hatFluxRaw: agg.hatFluxRawMax,
      midFluxRaw: agg.midFluxRawMax,
      centroid: avg(agg.centroid),
      onset: agg.onsetMax,
      loudness: currentLoudness(),
      silence: false,
    };
    resetAgg();
  }
  const msg = JSON.stringify(payload);
  for (const ws of clients) if (ws.readyState === 1) ws.send(msg);
}
let broadcastTimer = null;
function scheduleBroadcast() {
  const silent = isSilent();
  const interval = silent ? SILENCE_MS : EMIT_MS;
  broadcastTimer = setTimeout(() => { broadcastFeatures(); scheduleBroadcast(); }, interval);
}

// ── http ───────────────────────────────────────────────────────────────────
function json(res, code, body) { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify(body)); }
function cors(req, res) {
  const o = req.headers.origin;
  if (o && ALLOWED_ORIGIN.has(o)) { res.setHeader('access-control-allow-origin', o); res.setHeader('access-control-allow-headers', 'content-type, x-audio-token'); res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS'); res.setHeader('vary', 'origin'); }
}
function authorized(req) {
  if (!ALLOWED_HOST.has(req.headers.host)) return false;
  const o = req.headers.origin; if (o && !ALLOWED_ORIGIN.has(o)) return false;
  return req.headers['x-audio-token'] === TOKEN;
}

const server = http.createServer((req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  const u = new URL(req.url, `http://${req.headers.host}`);
  if (u.pathname === '/health') {
    // /health carries state a page could use to render a status chip; require
    // the token like terminal-sidecar's protected routes (health itself is
    // low-sensitivity, but device/client info shouldn't be free for any tab).
    if (!authorized(req) && u.searchParams.get('token') !== TOKEN) return json(res, 403, { error: 'forbidden' });
    return json(res, 200, { ok: true, capturing, device: 'system-default', clients: clients.size, silence: isSilent() });
  }
  // ── standalone app (outside the OS): serve MirrorBall/web from this origin ──
  // Mirrors-of-Emotions-Start.bat opens http://127.0.0.1:3739/app/index-v2.html?src=music.
  // Same-origin pages may fetch /app-token (no cross-origin Origin header allowed), so
  // music.js can open the WS directly without the Next app in the middle.
  if (u.pathname === '/app-token') {
    const o = req.headers.origin;
    if (!ALLOWED_HOST.has(req.headers.host) || (o && !(o === `http://${req.headers.host}`))) return json(res, 403, { error: 'forbidden' });
    return json(res, 200, { token: TOKEN, ws: `ws://${req.headers.host}` });
  }
  // ── MirrorBall live tuning: list the allowed config locations ──
  // Same guard as every other protected route. Returns absolute paths so the panel can SHOW the
  // user exactly where the file lives (the "senão isso fica aí perdido" complaint).
  if (u.pathname === '/app-config/locations') {
    if (!authorized(req) && u.searchParams.get('token') !== TOKEN) return json(res, 403, { error: 'forbidden' });
    const active = activeConfigId();
    return json(res, 200, {
      active,
      locations: CONFIG_LOCATIONS.map(l => ({
        id: l.id, label: l.label, dir: l.dir,
        path: path.join(l.dir, CONFIG_FILE_NAME),
        exists: fs.existsSync(path.join(l.dir, CONFIG_FILE_NAME)),
      })),
    });
  }
  // ── MirrorBall live tuning: save the config ──
  // This one WRITES TO DISK, so it carries the full guard (host + origin + token) — never open.
  if (u.pathname === '/app-config' && req.method === 'POST') {
    if (!authorized(req)) return json(res, 403, { error: 'forbidden' });
    let raw = '', tooBig = false;
    req.on('data', (c) => {
      if (tooBig) return;
      raw += c;
      if (raw.length > CONFIG_MAX_BYTES) { tooBig = true; raw = ''; }
    });
    req.on('end', () => {
      if (tooBig) return json(res, 413, { error: 'body too large' });
      let body;
      try { body = JSON.parse(raw); } catch { return json(res, 400, { error: 'invalid json' }); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return json(res, 400, { error: 'invalid body' });
      // The location is an ID from our own list — never a path from the client.
      const id = body.location == null ? activeConfigId() : String(body.location);
      const loc = configLocation(id);
      if (!loc) return json(res, 400, { error: 'unknown location' });
      const cfg = body.config;
      if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return json(res, 400, { error: 'invalid config' });
      // Only known top-level CONFIG groups get through; anything else is dropped silently rather
      // than persisted. The engine validates every leaf again on load (it must never trust this).
      const ALLOWED_KEYS = new Set(['bandOnset', 'bpmAuto', 'kick', 'bpm', 'activity', 'hat', 'map', 'tau', 'norm', 'grid', 'fsm', 'gesture', 'silence', 'emit', 'outMin', 'outMax', 'rpmStopTau', 'profile',
        'snare', 'flash', 'dimmer', 'profileAuto', 'explode', 'strobe',   // knobs do painel k mais recentes (antes caiam em silencio)
        'ball']);                                              // knobs do painel d da bola (index-v2.html)
      const clean = {};
      for (const k of Object.keys(cfg)) if (ALLOWED_KEYS.has(k)) clean[k] = cfg[k];
      if (!Object.keys(clean).length) return json(res, 400, { error: 'no known config keys' });

      const text = JSON.stringify(clean, null, 2);
      if (text.length > CONFIG_MAX_BYTES) return json(res, 413, { error: 'config too large' });
      const dest = path.join(loc.dir, CONFIG_FILE_NAME);   // fixed name, server-resolved dir
      const tmp = dest + '.tmp';
      try {
        fs.mkdirSync(loc.dir, { recursive: true });
        // Atomic: write a temp file, then rename over the target. A crash mid-write can never
        // leave a half-written JSON that would make the ball start with garbage.
        fs.writeFileSync(tmp, text, 'utf8');
        fs.renameSync(tmp, dest);
        fs.writeFileSync(CONFIG_CHOICE_FILE, id, 'utf8');
      } catch (e) {
        try { fs.unlinkSync(tmp); } catch {}
        console.error('[audio] config save failed', e);
        return json(res, 500, { error: 'write failed' });
      }
      console.log(`[audio] mirrorball config saved -> ${dest}`);
      return json(res, 200, { ok: true, location: id, path: dest, bytes: text.length });
    });
    req.on('error', () => { try { json(res, 400, { error: 'read error' }); } catch {} });
    return;
  }
  if (u.pathname.startsWith('/app/')) {
    const name = decodeURIComponent(u.pathname.slice(5));
    if (!APP_DIR || /[\\/]|\.\./.test(name) || !/\.(html?|js|json|png)$/i.test(name)) return json(res, 404, { error: 'not found' });
    const file = path.join(APP_DIR, name);
    return fs.readFile(file, (err, body) => {
      if (err) return json(res, 404, { error: 'not found' });
      const ct = /\.js$/i.test(name) ? 'text/javascript; charset=utf-8' : /\.json$/i.test(name) ? 'application/json' : /\.png$/i.test(name) ? 'image/png' : 'text/html; charset=utf-8';
      res.writeHead(200, { 'content-type': ct, 'cache-control': 'no-store' }); res.end(body);
    });
  }
  return json(res, 404, { error: 'not found' });
});

// ── websocket ──────────────────────────────────────────────────────────────
const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false, handleProtocols: ps => ps.has('agentos-audio') ? 'agentos-audio' : false });
server.on('upgrade', (req, sock, head) => {
  sock.setNoDelay(true);
  const u = new URL(req.url, `http://${req.headers.host}`);
  const protos = String(req.headers['sec-websocket-protocol'] || '').split(',').map(s => s.trim());
  const tokenOk = protos.includes(TOKEN) || u.searchParams.get('token') === TOKEN;
  const ok = u.pathname === '/ws' && ALLOWED_HOST.has(req.headers.host) && (!req.headers.origin || ALLOWED_ORIGIN.has(req.headers.origin)) && tokenOk;
  if (!ok) { sock.write('HTTP/1.1 403 Forbidden\r\n\r\n'); return sock.destroy(); }
  wss.handleUpgrade(req, sock, head, ws => {
    clients.add(ws);
    ws.on('message', (m) => {
      let msg; try { msg = JSON.parse(m.toString()); } catch { return; }
      if (msg.type === 'clock') {
        try { ws.send(JSON.stringify({ type: 'clock', id: msg.id, tClient: msg.tClient, tServer: performance.now() })); } catch {}
      }
    });
    ws.on('close', () => clients.delete(ws));
  });
});

// ── lifecycle ──────────────────────────────────────────────────────────────
function shutdown(sig) {
  console.log(`[audio] ${sig}: stopping capture, closing ${clients.size} client(s)`);
  if (broadcastTimer) clearTimeout(broadcastTimer);
  stopCapture();
  for (const ws of clients) { try { ws.close(); } catch {} }
  try { fs.unlinkSync(TOKEN_FILE); } catch {}
  try { fs.unlinkSync(PID_FILE); } catch {}
  process.exit(0);
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) process.on(sig, () => shutdown(sig));
process.on('uncaughtException', e => { console.error('[audio] uncaught', e); });

server.on('error', e => {
  if (e.code === 'EADDRINUSE') { console.error(`[audio] port ${PORT} already in use — another sidecar is running; exiting`); process.exit(0); }
  console.error('[audio] server error', e); process.exit(1);
});
server.listen(PORT, HOST, () => {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify({ token: TOKEN, port: PORT, pid: process.pid, startedAt: Date.now() }));
  // Own PID only (no PTY children to re-parent, unlike terminal-sidecar) —
  // kill-agentic-os-node.ps1 uses this as a belt-and-suspenders reap in case
  // the port-based kill in kill-agentic-os.bat races a restart.
  fs.writeFileSync(PID_FILE, String(process.pid));
  console.log(`[audio] listening on http://${HOST}:${PORT} (token in ${TOKEN_FILE}, pid ${process.pid})`);
  startCapture();
  scheduleBroadcast();
});
