// 채보 풀영상(MP4/H.264) 렌더러. 웹 플레이어와 같은 렌더러(chartRenderer.ts)를 vm 에
// 올려 프레임을 그리고, 원시 RGBA 를 ffmpeg stdin 으로 흘려보내 인코딩한다. 가이드음
// (타격 비프)은 오프라인 PCM 으로 합성해 오디오 트랙으로 먹싱한다(원곡 음원은 쓰지 않음).
//
// 메모리 안전: 프레임을 stdin 에 쓰고 백프레셔(drain 대기)로 멈춰가며 진행해, napi 캔버스
// 버퍼가 쌓이지 않게 한다. 무거운 동기 작업이라 반드시 워커에서 돌린다(chartVideoWorker).
//
// 파라미터는 캐시 공유를 위해 고정: 400px / 60fps / 노트속도 6.5 / 미러 없음.

import { createCanvas } from "@napi-rs/canvas";
import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vm from "vm";
import { RENDERER_JS } from "../../web/chartRenderer";
import type { Chart, ChartNote } from "../../simai/types";

const SRC = 920;              // 렌더러 내부 좌표계
export const VIDEO = { size: 400, fps: 60, speed: 6.5 } as const;
const SAMPLE_RATE = 44100;

export interface ChartVideoData {
  id: string; title: string; artist: string; designer: string;
  level: string; difficulty: number; chart: Chart;
}

interface Sandbox { t: number; draw: () => void; [k: string]: unknown; }

function makeSandbox(ctx: unknown, data: unknown): Sandbox {
  const el = () => ({
    style: {}, classList: { toggle() {}, add() {}, remove() {} },
    getBoundingClientRect: () => ({ left: 0, width: 100 }),
    setPointerCapture() {}, releasePointerCapture() {},
    textContent: "", value: "1", files: null, scrollIntoView() {}, addEventListener() {},
  });
  const sandbox: Record<string, unknown> = {
    DATA: data,
    document: {
      getElementById: (id: string) =>
        id === "cv" ? Object.assign(el(), { getContext: () => ctx, width: SRC, height: SRC }) : el(),
      querySelector: () => el(), addEventListener() {},
    },
    window: {}, requestAnimationFrame: () => 0, performance: { now: () => 0 },
    Audio: function () { return { play() {}, pause() {} }; }, URL: { createObjectURL: () => "" },
    Math, console, isNaN, parseFloat, parseInt, String, Number, Array, Object, JSON, Date,
  };
  sandbox.globalThis = sandbox;
  return sandbox as unknown as Sandbox;
}

/**
 * 가이드 비프를 오프라인 PCM(mono 16bit)으로 합성한다. click() 과 같은 주파수·감쇠.
 * leadMs 만큼 앞에 무음을 두어 영상의 리드인(노트가 판정선에 붙지 않게 앞에서 시작)과
 * 오디오를 맞춘다.
 */
function synthGuideWav(notes: ChartNote[], spanMs: number, leadMs: number): Buffer {
  const n = Math.ceil((spanMs / 1000 + 0.3) * SAMPLE_RATE);
  const pcm = new Float32Array(n);
  const dur = 0.055;                       // click() 의 o.stop(+0.055)
  const durN = Math.floor(dur * SAMPLE_RATE);
  for (const note of notes) {
    let freq = note.isBreak ? 1500 : note.type === "slide" ? 720 : 1050;
    if (note.isEx) freq *= 1.5;   // EX 노트는 가이드음을 높게(웹 click() 과 동일)
    const start = Math.floor(((note.timeMs + leadMs) / 1000) * SAMPLE_RATE);
    for (let i = 0; i < durN; i++) {
      const idx = start + i;
      if (idx < 0 || idx >= n) break;
      const tt = i / SAMPLE_RATE;
      // gain 0.14 → 0.0008 지수 감쇠(0.05s), square 파형.
      const env = 0.14 * Math.pow(0.0008 / 0.14, tt / 0.05);
      const sq = Math.sin(2 * Math.PI * freq * tt) >= 0 ? 1 : -1;
      pcm[idx] += env * sq;
    }
  }
  // Float → 16bit PCM (클리핑 방지 클램프) + WAV 헤더.
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    let v = pcm[i]; if (v > 1) v = 1; else if (v < -1) v = -1;
    data.writeInt16LE((v * 32767) | 0, i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + data.length, 4); header.write("WAVE", 8);
  header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22); header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write("data", 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

export interface VideoProgress { (done: number, total: number): void; }

/**
 * 채보 한 곡을 MP4 로 렌더해 outPath 에 쓴다. 고정 파라미터(400/60/6.5/no-mirror).
 * onProgress 로 진행률(프레임)을 알린다.
 */
export async function renderChartVideo(data: ChartVideoData, outPath: string, onProgress?: VideoProgress): Promise<void> {
  const { size, fps, speed } = VIDEO;
  const chart = data.chart;
  const totalMs = chart.durationMs;

  const cv = createCanvas(size, size);
  const ctx = cv.getContext("2d");
  ctx.scale(size / SRC, size / SRC);
  const sandbox = makeSandbox(ctx, data);
  vm.createContext(sandbox);
  vm.runInContext(RENDERER_JS, sandbox);
  sandbox.speedIdx = speed;
  sandbox.mirror = false;
  sandbox.sound = false;

  // 렌더러가 계산한 리드인 시작점(T0, 0박 시작 채보는 음수). 그 지점부터 그려야
  // 첫 노트가 판정선에 붙어 시작하지 않는다. 웹 플레이어와 동일.
  const T0 = Number((sandbox as unknown as { T0?: number }).T0) || 0;
  const leadMs = -T0;                          // >= 0
  const spanMs = totalMs - T0;                  // 리드인 포함 전체 길이
  const frames = Math.max(1, Math.round((spanMs / 1000) * fps));

  // 가이드음 WAV 를 임시 파일로. 리드인만큼 뒤로 밀어 영상과 맞춘다.
  const wavPath = path.join(os.tmpdir(), `carol-guide-${data.id}-${Date.now()}.wav`);
  fs.writeFileSync(wavPath, synthGuideWav(chart.notes, spanMs, leadMs));

  const args = [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${size}x${size}`, "-r", String(fps), "-i", "pipe:0",
    "-i", wavPath,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "23", "-movflags", "+faststart",
    "-c:a", "aac", "-b:a", "128k", "-shortest", outPath,
  ];
  const ff = spawn("ffmpeg", args, { stdio: ["pipe", "ignore", "pipe"] });
  let ffErr = "";
  ff.stderr.on("data", (d) => { ffErr += d.toString(); });

  const done = new Promise<void>((resolve, reject) => {
    ff.on("error", reject);
    ff.on("close", (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${ffErr.slice(-500)}`)));
  });

  try {
    for (let i = 0; i < frames; i++) {
      sandbox.t = T0 + (i / fps) * 1000;
      sandbox.draw();
      // 배경(카드색)을 뒤에 깔아 필드 바깥 투명 영역을 채운다.
      ctx.save();
      ctx.globalCompositeOperation = "destination-over";
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(0, 0, SRC, SRC);
      ctx.restore();
      const raw = ctx.getImageData(0, 0, size, size).data;
      const buf = Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);
      if (!ff.stdin.write(buf)) {
        // 백프레셔: ffmpeg 가 소비할 때까지 멈춰 메모리 누적을 막는다.
        await new Promise<void>((res) => ff.stdin.once("drain", res));
      }
      if (onProgress && (i % 60 === 0)) onProgress(i, frames);
    }
    ff.stdin.end();
    await done;
    if (onProgress) onProgress(frames, frames);
  } finally {
    try { fs.unlinkSync(wavPath); } catch { /* 무시 */ }
  }
}
