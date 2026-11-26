// 보면 플레이어 타격음(src/web/chartSound.ts): 효과음 파일 읽기, 풀영상 가이드음 섞기 규칙.
const test = require("node:test");
const assert = require("node:assert/strict");
const sound = require("../../dist/web/chartSound.js");

test("hit.wav 를 읽어 모노로 푼다(스테레오 16비트 → 채널 평균)", () => {
  const wav = sound.hitSoundWav();
  assert.ok(wav, "assets/sounds/hit.wav");
  const d = sound.decodeWavMono(wav);
  assert.ok(d);
  assert.equal(d.sampleRate, 44100);
  assert.ok(d.samples.length > 1000);
  assert.ok(d.samples.every((v) => v >= -1 && v <= 1));
  assert.equal(sound.decodeWavMono(Buffer.from("not a wav")), null);
});

test("가이드음: TOUCH 는 박수, 나머지는 hit.wav, 같은 순간의 같은 소리는 한 번", () => {
  const sr = 44100, len = sr * 2;
  const rt = sound.soundRuntime();
  assert.equal(rt.carolHitKey({ type: "touch" }), "touch");
  assert.equal(rt.carolHitKey({ type: "touchHold" }), "touch");
  assert.equal(rt.carolHitKey({ type: "slide" }), "hit");
  // 박수(TOUCH)는 hit.wav 와의 중간 크기로 줄인다
  const clap = rt.carolSynth("clap", "tap", false, sr), touch = rt.carolTouchPcm(sr);
  const peak = (a) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  assert.ok(Math.abs(peak(touch) / peak(clap) - rt.CAROL_TOUCH_GAIN) < 1e-6);
  assert.ok(rt.CAROL_TOUCH_GAIN > 0.5 && rt.CAROL_TOUCH_GAIN < 0.8);
  // hit.wav 는 같은 만큼(+3.5dB) 올려 둘이 중간에서 만난다
  assert.ok(Math.abs(20 * Math.log10(rt.CAROL_HIT_FILE_GAIN) + 20 * Math.log10(rt.CAROL_TOUCH_GAIN)) < 0.1);
  const energy = (pcm, fromMs, toMs) => {
    let e = 0;
    for (let i = Math.floor(fromMs * sr / 1000); i < Math.floor(toMs * sr / 1000); i++) e += pcm[i] * pcm[i];
    return e;
  };
  const one = sound.guideMix([{ timeMs: 100, type: "tap" }], len, sr, 0);
  const each = sound.guideMix([{ timeMs: 100, type: "tap" }, { timeMs: 105, type: "slide" }], len, sr, 0);
  // EACH(12ms 안의 같은 소리)는 한 번만 → 같은 모양
  assert.deepEqual(Array.from(each), Array.from(one));
  // TOUCH 는 다른 소리라 같이 난다
  const withTouch = sound.guideMix([{ timeMs: 100, type: "tap" }, { timeMs: 100, type: "touch" }], len, sr, 0);
  assert.notDeepEqual(Array.from(withTouch), Array.from(one));
  // 시각·리드인 만큼 뒤에서 난다
  assert.equal(energy(one, 0, 99), 0);
  assert.ok(energy(one, 100, 300) > 0);
  const lead = sound.guideMix([{ timeMs: 100, type: "tap" }], len, sr, 500);
  assert.equal(energy(lead, 0, 599), 0);
  assert.ok(energy(lead, 600, 800) > 0);
  // 겹쳐도 -1..1 안
  const many = sound.guideMix(Array.from({ length: 40 }, (_, k) => ({ timeMs: 100 + k * 13, type: k % 2 ? "touch" : "tap" })), len, sr, 0);
  assert.ok(many.every((v) => v > -1 && v < 1));
});

test("SOUND_JS 는 템플릿에 넣을 수 있는 원문이고, 브라우저 재생 함수를 노출한다", () => {
  assert.doesNotMatch(sound.SOUND_JS, /`|\$\{/);
  for (const fn of ["carolSynth", "carolPlayHit", "carolLoadHits", "carolHitKey"]) assert.match(sound.SOUND_JS, new RegExp(`function ${fn}\\(`));
  assert.match(sound.SOUND_JS, new RegExp(`url: '${sound.HIT_SOUND_PATH}'`));
});
