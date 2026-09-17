import { parentPort } from "worker_threads";
import { renderChartGif, type GifOptions } from "./chartGif";
import type { Chart } from "../../simai/types";

if (!parentPort) throw new Error("gifWorker.ts must run inside a worker_thread");

interface Job {
  data: { id: string; title: string; artist: string; designer: string; level: string; difficulty: number; chart: Chart };
  opts: GifOptions;
}

parentPort.on("message", (job: Job) => {
  try {
    const gif = renderChartGif(job.data, job.opts);
    parentPort!.postMessage({ ok: true, gif }, [gif.buffer as ArrayBuffer]);
  } catch (e) {
    parentPort!.postMessage({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
