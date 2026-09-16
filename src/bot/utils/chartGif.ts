import { createCanvas } from "@napi-rs/canvas";
import { GIFEncoder, quantize, applyPalette } from "gifenc";
import * as vm from "vm";
import { RENDERER_JS } from "../../web/chartRenderer";
import type { Chart, ChartNote } from "../../simai/types";

/** 렌더러가 그리는 내부 캔버스 크기. chartRenderer 안에 박혀 있는 값이다. */
const SRC = 920;

export interface GifOptions {
  /** 잘라낼 구간의 시작(ms). */
  startMs: number;
  /** 길이(ms). */
  durationMs: number;
  /** 출력 한 변(px). */
  size: number;
  fps: number;
  /** 노트 속도(TapSpeed). 웹 플레이어 기본값과 맞춘다. */
  speed: number;
  /** 좌우 반전. 생략 시 렌더러 기본값(꺼짐). */
  mirror?: boolean;
  /** 슬라이드 가이드 표시. 생략 시 렌더러 기본값(켜짐). */
  guide?: boolean;
}

export const GIF_DEFAULTS: Omit<GifOptions, "startMs"> = {
  durationMs: 9000, size: 400, fps: 15, speed: 7.5,
};

/**
 * 노트가 가장 빽빽한 구간의 시작 시각을 고른다.
 * 길이 window 짜리 창을 굴리며 노트 수가 가장 많은 자리를 찾는다.
 */
export function densestStart(chart: Chart, windowMs: number): number {
  const notes = chart.notes;
  if (notes.length === 0) return 0;
  let best = 0, bestCount = -1, lo = 0;
  for (let hi = 0; hi < notes.length; hi++) {
    while (notes[hi].timeMs - notes[lo].timeMs > windowMs) lo++;
    const count = hi - lo + 1;
    if (count > bestCount) { bestCount = count; best = notes[lo].timeMs; }
  }
  // 노트가 창 한가운데 오도록 조금 앞에서 시작한다.
  return Math.max(0, best - windowMs * 0.15);
}

interface Sandbox {
  t: number;
  draw: () => void;
  speedIdx: number;
  NOTES: ChartNote[];
  [k: string]: unknown;
}

/** 브라우저 렌더러를 그대로 돌리기 위한 최소 DOM 대역. */
function makeSandbox(ctx: unknown, data: unknown): Sandbox {
  const el = () => ({
    style: {}, classList: { toggle() {}, add() {}, remove() {} },
    getBoundingClientRect: () => ({ left: 0, width: 100 }),
    setPointerCapture() {}, releasePointerCapture() {},
    textContent: "", value: "1", files: null,
    scrollIntoView() {}, addEventListener() {},
  });
  const sandbox: Record<string, unknown> = {
    DATA: data,
    document: {
      getElementById: (id: string) =>
        id === "cv" ? Object.assign(el(), { getContext: () => ctx, width: SRC, height: SRC }) : el(),
      querySelector: () => el(),
      addEventListener() {},
    },
    window: {},
    requestAnimationFrame: () => 0,
    performance: { now: () => 0 },
    Audio: function () { return { play() {}, pause() {} }; },
    URL: { createObjectURL: () => "" },
    Math, console, isNaN, parseFloat, parseInt, String, Number, Array, Object, JSON, Date,
  };
  sandbox.globalThis = sandbox;
  return sandbox as unknown as Sandbox;
}

/**
 * 채보 한 구간을 움직이는 GIF 로 만든다.
 * 웹 플레이어와 같은 렌더러 코드를 vm 에 올려 캔버스만 갈아끼우므로,
 * 화면에서 보이는 것과 같은 그림이 나온다.
 */
export function renderChartGif(
  data: { id: string; title: string; artist: string; designer: string; level: string; difficulty: number; chart: Chart },
  opts: GifOptions,
): Buffer {
  // 920 로 그린 뒤 줄이면 픽셀을 5배 넘게 낭비한다. 캔버스를 출력 크기로 잡고
  // 컨텍스트만 축척해서 렌더러가 그대로 920 좌표로 그리게 한다.
  const cv = createCanvas(opts.size, opts.size);
  const ctx = cv.getContext("2d");
  ctx.scale(opts.size / SRC, opts.size / SRC);

  const sandbox = makeSandbox(ctx, data);
  vm.createContext(sandbox);
  vm.runInContext(RENDERER_JS, sandbox);
  sandbox.speedIdx = opts.speed;
  if (opts.mirror !== undefined) sandbox.mirror = opts.mirror;
  if (opts.guide !== undefined) sandbox.guide = opts.guide;

  const frames = Math.max(1, Math.round(opts.durationMs / 1000 * opts.fps));
  const delay = Math.round(1000 / opts.fps);
  const gif = GIFEncoder();
  let palette: number[][] | null = null;

  for (let i = 0; i < frames; i++) {
    sandbox.t = opts.startMs + (i / opts.fps) * 1000;
    sandbox.draw();
    // 필드 바깥은 투명하게 남으므로 카드 배경색을 뒤에 깔아 준다.
    ctx.save();
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, SRC, SRC);
    ctx.restore();
    const rgba = ctx.getImageData(0, 0, opts.size, opts.size).data;
    // 팔레트는 첫 프레임에서 한 번만 만든다. 배경과 노트 색이 고정이라 충분하고,
    // 프레임마다 새로 뽑는 것보다 파일이 훨씬 작아진다.
    if (!palette) palette = quantize(rgba, 128) as number[][];
    const indexed = applyPalette(rgba, palette);
    gif.writeFrame(indexed, opts.size, opts.size, { palette: i === 0 ? palette : undefined, delay });
  }
  gif.finish();
  return Buffer.from(gif.bytes());
}

/**
 * 프레임 렌더와 GIF 인코딩은 수 초짜리 동기 작업이라 메인 스레드에서 돌리면
 * 그동안 봇이 멈춘다. 요청이 잦지 않으므로 그때그때 워커를 띄워 처리한다.
 */
export function renderChartGifAsync(
  data: { id: string; title: string; artist: string; designer: string; level: string; difficulty: number; chart: Chart },
  opts: GifOptions,
  timeoutMs = 60000,
): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Worker } = require("worker_threads") as typeof import("worker_threads");
  const path = require("path") as typeof import("path");
  const ext = path.extname(__filename);            // 프로덕션 .js / ts-node .ts
  const file = path.join(__dirname, "gifWorker" + ext);
  return new Promise((resolve, reject) => {
    const worker = new Worker(file, {
      resourceLimits: { maxOldGenerationSizeMb: 512, maxYoungGenerationSizeMb: 64 },
      ...(ext === ".ts" ? { execArgv: ["-r", "ts-node/register/transpile-only"] } : {}),
    });
    const timer = setTimeout(() => { worker.terminate(); reject(new Error("gif render timeout")); }, timeoutMs);
    const done = (fn: () => void) => { clearTimeout(timer); void worker.terminate(); fn(); };
    worker.on("message", (m: { ok: boolean; gif?: Uint8Array; error?: string }) => {
      if (m.ok && m.gif) done(() => resolve(Buffer.from(m.gif!)));
      else done(() => reject(new Error(m.error || "gif render failed")));
    });
    worker.on("error", (e) => done(() => reject(e)));
    worker.on("exit", (code) => { if (code !== 0) done(() => reject(new Error("gif worker exited " + code))); });
    worker.postMessage({ data, opts });
  });
}
