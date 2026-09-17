// 워커 엔트리: 채보 풀영상을 렌더해 파일로 쓰고 완료/실패를 알린다.
// 무거운 draw 루프가 메인 스레드를 막지 않도록 별도 스레드에서 돈다.
import { parentPort, workerData } from "worker_threads";
import { renderChartVideo, type ChartVideoData } from "./chartVideo";

const { data, outPath } = workerData as { data: ChartVideoData; outPath: string };

renderChartVideo(data, outPath, (done, total) => {
  parentPort?.postMessage({ progress: done / total });
})
  .then(() => parentPort?.postMessage({ ok: true }))
  .catch((e: unknown) => parentPort?.postMessage({ ok: false, error: String((e as Error)?.message || e) }));
