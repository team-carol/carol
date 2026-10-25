// mai-notes 채보 공급원.
//
// 채보 본문은 보면 플레이어 페이지(https://mai-notes.com/player/<UUID>)에서 받는다(client.ts).
// 본문에는 헤더(&title 등)가 없어 제목·아티스트·난이도는 메모리 인덱스(manifest 메타데이터)에서 채운다.
//
// 2026-10-25 mai-notes 운영자가 디스코드 봇 이용을 허락했다. 조건: 대량 통신 금지, 받은 채보 데이터의
// 2차 배포 금지. 그래서 한 번 받은 채보는 simai_charts 에 source='mainotes' 로 캐시하고 다시 받지 않으며,
// maidata 원문은 사용자에게 내려주지 않는다(웹 플레이어·GIF·영상으로 재생 결과만 보여 준다).
// config.mainotesFetchCharts 를 false 로 두면 새 본문을 받지 않는다(급히 끌 때).

import { ChartUnavailableError, type ChartSource, type ResolvedChart } from "../simai/source";
import { getSimaiChart, saveSimaiChart } from "../storage";
import { parseMaidata } from "../simai/parse";
import { CONFIG } from "../config";
import { getChartById } from "./index";
import { fetchChartBody } from "./client";

export const mainotesSource: ChartSource = {
  name: "mainotes",
  async load(id): Promise<ResolvedChart> {
    const meta = getChartById(id);
    if (!meta) throw new ChartUnavailableError("not-found");
    if (!meta.hasData) throw new ChartUnavailableError("no-data");

    // 이미 받아둔 게 있으면 네트워크를 쓰지 않는다. 조회가 실패해도(일시적 DB 오류 등)
    // 치명적이지 않다 — 캐시가 없는 것으로 보고 아래 흐름으로 넘어간다.
    let cached: any = null;
    try { cached = await getSimaiChart(id); } catch { cached = null; }
    if (cached && cached.source === "mainotes" && cached.maidata) {
      return toResolved(meta, cached.maidata);
    }

    // 급히 끌 때(config.mainotesFetchCharts=false). 목록·검색은 되지만 본문은 나오지 않는다.
    if (CONFIG.mainotesFetchCharts === false) throw new ChartUnavailableError("no-permission");

    const body = await fetchChartBody(id);
    // 파싱해서 chart_json 까지 만들어 캐시한다. 실패하면 그대로 던진다.
    const parsed = parseMaidata(body);
    const keys = Object.keys(parsed.charts).map(Number);
    const key = parsed.charts[meta.difficulty] ? meta.difficulty : keys[keys.length - 1];
    const chart = parsed.charts[key];
    if (!chart || chart.notes.length === 0) throw new ChartUnavailableError("no-data");

    try {
      await saveSimaiChart({
        id, ownerId: "", source: "mainotes",
        title: meta.title.slice(0, 200), artist: meta.artist.slice(0, 200),
        designer: meta.designer.slice(0, 200), level: meta.level.slice(0, 20),
        difficulty: meta.difficulty, maidata: body, chartJson: JSON.stringify(chart),
      });
    } catch (e) {
      // 캐시 실패는 치명적이지 않다 — 이번 요청은 본문으로 그대로 응답한다.
      console.error("[mainotes] 캐시 저장 실패:", e);
    }
    return toResolved(meta, body);
  },
};

function toResolved(meta: NonNullable<ReturnType<typeof getChartById>>, maidata: string): ResolvedChart {
  return {
    title: meta.title, artist: meta.artist, designer: meta.designer,
    level: meta.level, difficulty: meta.difficulty,
    maidata, attribution: "mai-notes", storedId: meta.id,
    // 원본 플레이어 페이지 링크로 출처를 밝힌다.
    sourceUrl: `https://mai-notes.com/player/${meta.id}`,
    chartType: meta.type,
  };
}
