// 채보 풀영상 렌더 큐. 동시성 1(영상은 코어·메모리를 오래 먹어 겹치면 위험).
// 같은 채보를 여러 명이 요청해도 렌더는 한 번만 하고 결과를 공유한다(inflight 맵).
// 완료본은 볼륨(DATA_DIR/renders)에 두고 DB(chart_videos)에는 상태·경로만.

import { Worker } from "worker_threads";
import * as fs from "fs";
import * as path from "path";
import { getChartVideo, claimChartVideo, setChartVideoDone, setChartVideoError } from "../../storage";
import type { ChartVideoData } from "./chartVideo";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const RENDER_DIR = path.join(DATA_DIR, "renders");
const CONCURRENCY = Number(process.env.VIDEO_RENDER_CONCURRENCY) || 1;
const RENDER_TIMEOUT_MS = 10 * 60 * 1000;   // 한 곡 10분 넘으면 뭔가 잘못된 것

export function videoPath(id: string): string { return path.join(RENDER_DIR, id + ".mp4"); }

export interface VideoResult { path: string; bytes: number; }

const inflight = new Map<string, Promise<VideoResult>>();
export const queueDepth = () => waiting.length + running;
let running = 0;
const waiting: Array<() => void> = [];

function acquire(): Promise<void> {
  if (running < CONCURRENCY) { running++; return Promise.resolve(); }
  return new Promise((res) => waiting.push(res));
}
function release(): void {
  running--;
  const next = waiting.shift();
  if (next) { running++; next(); }
}

function renderInWorker(data: ChartVideoData, outPath: string, onProgress?: (p: number) => void): Promise<void> {
  const ext = path.extname(__filename);   // .js(prod) / .ts(dev)
  const file = path.join(__dirname, "chartVideoWorker" + ext);
  return new Promise((resolve, reject) => {
    const worker = new Worker(file, {
      workerData: { data, outPath },
      ...(ext === ".ts" ? { execArgv: ["-r", "ts-node/register/transpile-only"] } : {}),
    });
    const timer = setTimeout(() => { worker.terminate(); reject(new Error("video render timeout")); }, RENDER_TIMEOUT_MS);
    const finish = (fn: () => void) => { clearTimeout(timer); void worker.terminate(); fn(); };
    worker.on("message", (m: { ok?: boolean; error?: string; progress?: number }) => {
      if (m.progress !== undefined) { onProgress?.(m.progress); return; }
      if (m.ok) finish(resolve); else finish(() => reject(new Error(m.error || "render failed")));
    });
    worker.on("error", (e) => finish(() => reject(e)));
    worker.on("exit", (code) => { if (code !== 0) finish(() => reject(new Error("video worker exited " + code))); });
  });
}

/** 이미 완료된 캐시가 있으면 즉시 돌려준다. 없으면 null(요청은 requestVideo 로). */
export async function getReadyVideo(id: string): Promise<VideoResult | null> {
  const row = (await getChartVideo(id)) as { status: string; path: string; bytes: number } | null;
  if (row && row.status === "done" && row.path && fs.existsSync(row.path)) return { path: row.path, bytes: row.bytes };
  return null;
}

/**
 * 영상을 요청한다. 완료본이 있으면 그 경로, 없으면 렌더해서 완료되면 경로를 준다.
 * 같은 채보 동시 요청은 하나의 렌더를 공유한다.
 */
export function requestVideo(data: ChartVideoData, onProgress?: (p: number) => void): Promise<VideoResult> {
  const id = data.id;
  const existing = inflight.get(id);
  if (existing) return existing;
  const job = (async (): Promise<VideoResult> => {
    const ready = await getReadyVideo(id);
    if (ready) return ready;
    fs.mkdirSync(RENDER_DIR, { recursive: true });
    await claimChartVideo(id);
    const out = videoPath(id);
    await acquire();
    try {
      await renderInWorker(data, out, onProgress);
    } finally { release(); }
    const bytes = fs.statSync(out).size;
    await setChartVideoDone(id, out, bytes);
    return { path: out, bytes };
  })();
  const guarded = job.catch(async (e) => {
    await setChartVideoError(id, String((e as Error)?.message || e)).catch(() => {});
    try { fs.unlinkSync(videoPath(id)); } catch { /* 무시 */ }
    throw e;
  }).finally(() => inflight.delete(id));
  inflight.set(id, guarded);
  return guarded;
}
