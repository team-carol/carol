// 채보 플레이어 타격음 합성.
//
// 그리기 코어(chartRenderer.ts)처럼 원문 JS 문자열로 둔다. 브라우저는 결과를 AudioBuffer 로 재생하고,
// 서버(풀영상)는 같은 함수로 PCM 을 만들어 섞는다 — 소리를 두 벌 두지 않으려고. 여기서 ` 와 ${ 는 쓰지 말 것.
// 녹음 파일 없이 사인·잡음·필터만으로 만든다(게임 효과음은 저작권 때문에 쓰지 않는다).
//
// 노출: SOUND_SETS(이름 → 설명), carolSynth(set, kind, isEx, sampleRate) → Float32Array(모노, -1..1)
//   kind: 'tap' | 'break' | 'slide' | 'touch'
// 같은 입력이면 늘 같은 결과(잡음은 고정 시드).
//
// 지금 쓰는 타격음(2026-11): TOUCH 를 뺀 모든 노트는 assets/sounds/hit.wav(Kenney UI Audio rollover2, CC0),
// TOUCH 는 carolSynth('clap', 'tap'). 브라우저는 carolPlayHit, 풀영상은 guideMix(chartVideo.ts)가 같은 규칙으로 섞는다.

import * as fs from "fs";
import * as path from "path";
import * as vm from "vm";

export const SOUND_JS = `var SOUND_SETS = {
  beep: '지금 소리 · 사각파 삑',
  click: 'A · 또렷한 클릭',
  clap: 'B · 박수',
  wood: 'C · 나무 타격'
};

function sndRng(seed){
  var s = (seed >>> 0) || 1;
  return function(){ s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 2147483648 - 1; };
}
function sndBuf(sr, sec){ return new Float32Array(Math.max(1, Math.ceil(sr * sec))); }

// 사인. f0 에서 f1 로 glide(초) 시상수로 내려가고, 진폭은 decay(초) 시상수로 줄어든다. 0.5ms 페이드인(딸깍 방지).
function sndSine(out, sr, o){
  var st = Math.floor((o.at || 0) * sr), n = Math.ceil((o.len || 0.2) * sr), ph = 0, glide = o.glide || 0.02;
  for (var i = 0; i < n && st + i < out.length; i++){
    var tt = i / sr;
    var f = o.f1 ? o.f1 + (o.f0 - o.f1) * Math.exp(-tt / glide) : o.f0;
    ph += 2 * Math.PI * f / sr;
    out[st + i] += Math.sin(ph) * o.amp * Math.exp(-tt / o.decay) * Math.min(1, i / (sr * 0.0005));
  }
}

// 잡음. 1차 고역(hp)·저역(lp) 필터, rise(초) 동안 차오른 뒤 decay 로 줄어든다.
function sndNoise(out, sr, rng, o){
  var st = Math.floor((o.at || 0) * sr), n = Math.ceil((o.len || 0.1) * sr);
  var hpA = o.hp ? Math.exp(-2 * Math.PI * o.hp / sr) : 0, lpA = o.lp ? Math.exp(-2 * Math.PI * o.lp / sr) : 0;
  var hIn = 0, hOut = 0, lp = 0;
  for (var i = 0; i < n && st + i < out.length; i++){
    var tt = i / sr, x = rng();
    if (o.hp){ var y = hpA * (hOut + x - hIn); hIn = x; hOut = y; x = y; }
    if (o.lp){ lp = (1 - lpA) * x + lpA * lp; x = lp; }
    var env = o.rise ? 1 - Math.exp(-tt / o.rise) : Math.min(1, i / (sr * 0.0003));
    out[st + i] += x * o.amp * env * Math.exp(-tt / o.decay);
  }
}

// 대역 잡음을 f0 → f1 로 쓸어 올린다(슬라이드 "슉"). 상태 변수 필터.
function sndSweep(out, sr, rng, o){
  var n = Math.ceil(o.len * sr), low = 0, band = 0, damp = 1 / (o.q || 1.5);
  for (var i = 0; i < n && i < out.length; i++){
    var tt = i / sr, fc = o.f0 * Math.pow(o.f1 / o.f0, tt / o.len);
    var f = 2 * Math.sin(Math.PI * Math.min(fc, sr / 6) / sr);
    low += f * band;
    var high = rng() - low - damp * band;
    band += f * high;
    out[i] += band * o.amp * (1 - Math.exp(-tt / (o.rise || 0.015))) * Math.exp(-tt / o.decay);
  }
}

// 지금 소리: 사각파, 0.14 → 0.0008 지수 감쇠 50ms.
function sndBeep(out, sr, f){
  for (var i = 0; i < out.length; i++){
    var tt = i / sr;
    var env = 0.14 * Math.pow(0.0008 / 0.14, Math.min(1, tt / 0.05));
    out[i] += env * (Math.sin(2 * Math.PI * f * tt) >= 0 ? 1 : -1);
  }
}

function sndNorm(out, peak, sr){
  var m = 0;
  for (var i = 0; i < out.length; i++){ var a = Math.abs(out[i]); if (a > m) m = a; }
  if (m > 0){ var k = peak / m; for (var j = 0; j < out.length; j++) out[j] *= k; }
  // 끝 2ms 페이드아웃
  var fade = Math.min(out.length, Math.ceil(0.002 * sr));
  for (var e = 0; e < fade; e++) out[out.length - 1 - e] *= e / fade;
  return out;
}

function sndClap(out, sr, rng, amp){
  sndNoise(out, sr, rng, { at: 0, len: 0.007, amp: amp, decay: 0.0022, hp: 900, lp: 5200 });
  sndNoise(out, sr, rng, { at: 0.009, len: 0.007, amp: amp, decay: 0.0022, hp: 900, lp: 5200 });
  sndNoise(out, sr, rng, { at: 0.018, len: 0.09, amp: amp * 0.9, decay: 0.022, hp: 900, lp: 5200 });
}

function carolSynth(set, kind, isEx, sr){
  var rng = sndRng(1 + kind.length * 7919 + set.length * 131 + (isEx ? 17 : 0));
  var out;
  if (set === 'beep'){
    var bf = kind === 'break' ? 1500 : kind === 'slide' ? 720 : 1050;
    if (isEx) bf *= 1.5;
    out = sndBuf(sr, 0.055);
    sndBeep(out, sr, bf);
    return out;
  }
  if (set === 'click'){
    if (kind === 'break'){
      out = sndBuf(sr, 0.24);
      sndNoise(out, sr, rng, { len: 0.14, amp: 0.8, decay: 0.03, hp: 1800, lp: 11000 });
      sndSine(out, sr, { f0: 2600, f1: 1900, glide: 0.01, len: 0.07, amp: 0.6, decay: 0.012 });
      sndSine(out, sr, { f0: 3150, len: 0.24, amp: 0.35, decay: 0.07 });
      sndSine(out, sr, { f0: 4720, len: 0.24, amp: 0.25, decay: 0.05 });
    } else if (kind === 'slide'){
      out = sndBuf(sr, 0.22);
      sndSweep(out, sr, rng, { f0: 900, f1: 4200, len: 0.22, amp: 1, q: 2, decay: 0.07 });
    } else if (kind === 'touch'){
      out = sndBuf(sr, 0.06);
      sndSine(out, sr, { f0: 1700, f1: 1150, glide: 0.008, len: 0.06, amp: 0.8, decay: 0.011 });
      sndNoise(out, sr, rng, { len: 0.004, amp: 0.4, decay: 0.001, hp: 4000 });
    } else {
      out = sndBuf(sr, 0.07);
      sndNoise(out, sr, rng, { len: 0.006, amp: 0.9, decay: 0.0012, hp: 2500 });
      sndSine(out, sr, { f0: 2600, f1: 1900, glide: 0.01, len: 0.07, amp: 0.7, decay: 0.012 });
    }
    if (isEx) sndSine(out, sr, { f0: 5600, len: out.length / sr, amp: 0.25, decay: 0.035 });
    return sndNorm(out, kind === 'break' ? 0.8 : kind === 'slide' ? 0.35 : 0.55, sr);
  }
  if (set === 'clap'){
    if (kind === 'break'){
      out = sndBuf(sr, 0.38);
      sndClap(out, sr, rng, 0.9);
      sndSine(out, sr, { f0: 2093, len: 0.38, amp: 0.32, decay: 0.18 });
      sndSine(out, sr, { f0: 3359, len: 0.38, amp: 0.25, decay: 0.14 });
      sndSine(out, sr, { f0: 4810, len: 0.38, amp: 0.18, decay: 0.1 });
      sndSine(out, sr, { f0: 6020, len: 0.38, amp: 0.12, decay: 0.07 });
    } else if (kind === 'slide'){
      out = sndBuf(sr, 0.26);
      sndSweep(out, sr, rng, { f0: 500, f1: 2600, len: 0.26, amp: 1, q: 1.2, decay: 0.09 });
    } else if (kind === 'touch'){
      out = sndBuf(sr, 0.07);
      sndSine(out, sr, { f0: 1000, f1: 880, glide: 0.01, len: 0.07, amp: 0.8, decay: 0.018 });
      sndSine(out, sr, { f0: 2750, len: 0.03, amp: 0.35, decay: 0.006 });
      sndNoise(out, sr, rng, { len: 0.003, amp: 0.3, decay: 0.001, hp: 3000 });
    } else {
      out = sndBuf(sr, 0.12);
      sndClap(out, sr, rng, 1);
    }
    if (isEx) sndSine(out, sr, { f0: 4200, len: out.length / sr, amp: 0.22, decay: 0.05 });
    return sndNorm(out, kind === 'break' ? 0.8 : kind === 'slide' ? 0.35 : 0.6, sr);
  }
  // wood
  if (kind === 'break'){
    out = sndBuf(sr, 0.32);
    sndSine(out, sr, { f0: 1568, len: 0.32, amp: 0.7, decay: 0.15 });
    sndSine(out, sr, { f0: 3136, len: 0.32, amp: 0.4, decay: 0.09 });
    sndSine(out, sr, { f0: 4704, len: 0.32, amp: 0.25, decay: 0.05 });
    sndNoise(out, sr, rng, { len: 0.04, amp: 0.4, decay: 0.01, hp: 2500 });
  } else if (kind === 'slide'){
    out = sndBuf(sr, 0.24);
    sndNoise(out, sr, rng, { len: 0.24, amp: 0.8, decay: 0.08, hp: 800, lp: 4500, rise: 0.03 });
  } else if (kind === 'touch'){
    out = sndBuf(sr, 0.05);
    sndSine(out, sr, { f0: 1900, len: 0.05, amp: 0.8, decay: 0.014 });
    sndSine(out, sr, { f0: 5100, len: 0.02, amp: 0.3, decay: 0.004 });
  } else {
    out = sndBuf(sr, 0.08);
    sndSine(out, sr, { f0: 1250, len: 0.08, amp: 0.8, decay: 0.022 });
    sndSine(out, sr, { f0: 3420, len: 0.03, amp: 0.3, decay: 0.007 });
    sndNoise(out, sr, rng, { len: 0.002, amp: 0.5, decay: 0.0008, hp: 3000 });
  }
  if (isEx) sndSine(out, sr, { f0: 3800, len: out.length / sr, amp: 0.25, decay: 0.04 });
  return sndNorm(out, kind === 'break' ? 0.75 : kind === 'slide' ? 0.3 : 0.55, sr);
}

// ── 지금 쓰는 타격음 규칙(브라우저·풀영상 공통) ──
// TOUCH(touch·touchHold)는 박수 합성음, 나머지는 hit.wav. 같은 순간(12ms 안)의 같은 소리는 한 번만. 전체 크기 0.7.
// 박수는 hit.wav 보다 7dB 쯤 커서(50ms 구간 RMS) 둘의 중간에서 만나게 hit.wav 는 3.5dB 올리고 박수는 3.5dB 줄인다.
var CAROL_HIT_GAIN = 0.7;
var CAROL_HIT_FILE_GAIN = 1.5;
var CAROL_TOUCH_GAIN = 0.67;
var CAROL_HIT_DEDUPE_MS = 12;
function carolHitKey(note){ return note && (note.type === 'touch' || note.type === 'touchHold') ? 'touch' : 'hit'; }
function carolTouchPcm(sr){
  var pcm = carolSynth('clap', 'tap', false, sr);
  for (var i = 0; i < pcm.length; i++) pcm[i] *= CAROL_TOUCH_GAIN;
  return pcm;
}

// ── 브라우저 재생 ──
// 렌더러의 click() 이 부른다. 파일을 아직 못 받았으면 false(부르는 쪽이 예전 비프로 대신한다).
// volume: 사용자가 고른 타격음 크기(0~1.5, 플레이어 설정의 "타격음 크기", carolSetHitVolume).
var CAROL_HIT = { url: '/chart/sounds/hit.wav', ctx: null, out: null, buf: null, touch: null, loading: false, last: {}, volume: 1 };
function carolSetHitVolume(v){
  CAROL_HIT.volume = v > 0 ? v : 0;
  if (CAROL_HIT.out) CAROL_HIT.out.gain.value = CAROL_HIT_GAIN * CAROL_HIT.volume;
}
function carolLoadHits(ctx){
  if (CAROL_HIT.ctx !== ctx){ CAROL_HIT.ctx = ctx; CAROL_HIT.out = null; CAROL_HIT.buf = null; CAROL_HIT.touch = null; CAROL_HIT.loading = false; CAROL_HIT.last = {}; }
  if (!CAROL_HIT.out){
    // 겹쳐도 깨지지 않게 살짝 눌러 준다
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -8; comp.knee.value = 6; comp.ratio.value = 6; comp.attack.value = 0.001; comp.release.value = 0.08;
    var g = ctx.createGain();
    g.gain.value = CAROL_HIT_GAIN * CAROL_HIT.volume;
    g.connect(comp); comp.connect(ctx.destination);
    CAROL_HIT.out = g;
  }
  if (!CAROL_HIT.touch){
    var pcm = carolTouchPcm(ctx.sampleRate);
    var tb = ctx.createBuffer(1, pcm.length, ctx.sampleRate);
    tb.getChannelData(0).set(pcm);
    CAROL_HIT.touch = tb;
  }
  if (!CAROL_HIT.buf && !CAROL_HIT.loading && typeof fetch === 'function'){
    CAROL_HIT.loading = true;
    fetch(CAROL_HIT.url)
      .then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
      .then(function(a){ return ctx.decodeAudioData(a); })
      .then(function(b){
        for (var c = 0; c < b.numberOfChannels; c++){
          var d = b.getChannelData(c);
          for (var i = 0; i < d.length; i++) d[i] *= CAROL_HIT_FILE_GAIN;
        }
        CAROL_HIT.buf = b;
      })
      .catch(function(e){ CAROL_HIT.loading = false; console.warn('[sound] 타격음을 불러오지 못했습니다', e); });
  }
}
function carolPlayHit(ctx, kind, isEx, note){
  carolLoadHits(ctx);
  var key = carolHitKey(note);
  var buf = key === 'touch' ? CAROL_HIT.touch : CAROL_HIT.buf;
  if (!buf) return false;
  if (CAROL_HIT.volume <= 0) return true;
  var now = ctx.currentTime;
  if (CAROL_HIT.last[key] !== undefined && Math.abs(now - CAROL_HIT.last[key]) * 1000 < CAROL_HIT_DEDUPE_MS) return true;
  CAROL_HIT.last[key] = now;
  var src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(CAROL_HIT.out);
  src.start(0);
  return true;
}
`;

/** 브라우저가 받는 타격음 주소(웹 서버·미리보기가 내려준다). SOUND_JS 의 CAROL_HIT.url 과 같다. */
export const HIT_SOUND_PATH = "/chart/sounds/hit.wav";

let hitWavCache: Buffer | null | undefined;
/** assets/sounds/hit.wav. 없으면 null(브라우저·영상은 예전 비프로 대신한다). */
export function hitSoundWav(): Buffer | null {
  if (hitWavCache !== undefined) return hitWavCache;
  try {
    hitWavCache = fs.readFileSync(path.resolve(process.cwd(), "assets/sounds/hit.wav"));
  } catch (e) {
    console.warn("[sound] assets/sounds/hit.wav 를 읽지 못했습니다:", (e as Error).message);
    hitWavCache = null;
  }
  return hitWavCache;
}

/** PCM 16비트 WAV → 모노 Float32(채널 평균). 다른 형식이면 null. */
export function decodeWavMono(buf: Buffer): { sampleRate: number; samples: Float32Array } | null {
  if (buf.length < 12 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") return null;
  let off = 12, channels = 0, sampleRate = 0, bits = 0, format = 0;
  let data: Buffer | null = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4), size = buf.readUInt32LE(off + 4), body = off + 8;
    if (id === "fmt ") {
      format = buf.readUInt16LE(body); channels = buf.readUInt16LE(body + 2);
      sampleRate = buf.readUInt32LE(body + 4); bits = buf.readUInt16LE(body + 14);
    } else if (id === "data") {
      data = buf.subarray(body, Math.min(buf.length, body + size));
    }
    off = body + size + (size % 2);
  }
  if (!data || format !== 1 || bits !== 16 || channels < 1 || !sampleRate) return null;
  const frames = Math.floor(data.length / (2 * channels));
  const samples = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += data.readInt16LE((i * channels + c) * 2);
    samples[i] = sum / channels / 32768;
  }
  return { sampleRate, samples };
}

/** 선형 보간 리샘플(영상 샘플레이트에 맞출 때). */
function resample(src: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return src;
  const n = Math.max(1, Math.round(src.length * to / from));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i * from / to, i0 = Math.floor(x), f = x - i0;
    out[i] = (src[i0] ?? 0) * (1 - f) + (src[i0 + 1] ?? 0) * f;
  }
  return out;
}

interface SoundRuntime {
  carolSynth(set: string, kind: string, isEx: boolean, sr: number): Float32Array;
  carolHitKey(note: unknown): "hit" | "touch";
  carolTouchPcm(sr: number): Float32Array;
  CAROL_HIT_GAIN: number;
  CAROL_HIT_FILE_GAIN: number;
  CAROL_TOUCH_GAIN: number;
  CAROL_HIT_DEDUPE_MS: number;
}
let runtime: SoundRuntime | null = null;
/** SOUND_JS 를 서버에서 돌린 것(브라우저와 같은 함수). */
export function soundRuntime(): SoundRuntime {
  if (!runtime) {
    const ctx = vm.createContext({ Float32Array, Math, console });
    vm.runInContext(SOUND_JS, ctx);
    runtime = ctx as unknown as SoundRuntime;
  }
  return runtime;
}

/**
 * 풀영상 가이드음: 노트 시각마다 브라우저와 같은 타격음을 섞은 모노 PCM(-1..1). 효과음 파일을 못 읽으면 null.
 * offsetMs 만큼 뒤로 민다(영상 리드인).
 */
export function guideMix(notes: { timeMs: number; type: string }[], lengthSamples: number, sampleRate: number, offsetMs: number): Float32Array | null {
  const wav = hitSoundWav();
  const decoded = wav ? decodeWavMono(wav) : null;
  if (!decoded) return null;
  const rt = soundRuntime();
  const hit = resample(decoded.samples, decoded.sampleRate, sampleRate).map((v) => v * rt.CAROL_HIT_FILE_GAIN);
  const touch = rt.carolTouchPcm(sampleRate);
  const pcm = new Float32Array(lengthSamples);
  const last: Record<string, number> = {};
  for (const note of [...notes].sort((a, b) => a.timeMs - b.timeMs)) {
    const key = rt.carolHitKey(note);
    if (last[key] !== undefined && Math.abs(note.timeMs - last[key]) < rt.CAROL_HIT_DEDUPE_MS) continue;
    last[key] = note.timeMs;
    const src = key === "touch" ? touch : hit;
    const start = Math.floor(((note.timeMs + offsetMs) / 1000) * sampleRate);
    for (let i = 0; i < src.length; i++) {
      const idx = start + i;
      if (idx < 0) continue;
      if (idx >= lengthSamples) break;
      pcm[idx] += src[i] * rt.CAROL_HIT_GAIN;
    }
  }
  // 겹친 곳이 깨지지 않게 부드럽게 누른다(작은 소리는 거의 그대로).
  for (let i = 0; i < pcm.length; i++) pcm[i] = Math.tanh(pcm[i]);
  return pcm;
}
