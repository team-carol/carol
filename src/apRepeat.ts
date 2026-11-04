/**
 * 다시 한 AP(재AP) 성과(source_kind 'ap_repeat').
 * maishift 는 보면마다 가장 좋은 기록만 준다. 이미 AP 한 보면을 더 낮은(또는 같은) 달성률로 다시 AP 하면 maishift 기록이
 * 바뀌지 않아 기록 비교(src/maishift/sync.ts)로는 성과가 생기지 않는다. 판마다의 결과가 있는 캐롤봇 추가 북마클릿의
 * 최근 플레이 기록에서 찾는다.
 * - 그 보면의 지금 가장 좋은 기록이 이미 AP/AP+ 이고, 이번 판이 AP/AP+ 이면서 기록을 갱신하지 않은 판.
 *   기록을 갱신한 판은 maishift 기록 비교가 성과를 만든다.
 * - 그 판으로 만든 성과(같은 플레이 ID)가 있으면 건너뛴다. maishift 비교가 플레이를 찾지 못해 업로드 시각으로 만든
 *   성과(sourcePlayId "clear:…")와 달성률이 같으면, 업로드 시각 이전에 친 판은 그 성과의 판으로 본다.
 * 북마클릿 동기화 때(maishift 기록이 그대로인 재AP)와 maishift 기록을 반영할 때(같은 날 처음 AP 한 뒤 다시 한 AP)
 * 둘 다 확인한다. 같은 판은 플레이 ID 로 한 번만 남는다.
 */
import { chartKey, type PlayRecord } from "./scraper";
import { hasValidRecordDate, recordPlayedAt } from "./achievements";
import { getChartClears, getAchievementPlayEventLog, saveAchievementPlayEventLogBatch } from "./storage";
import type { AchievementPlayEventLogInput } from "./storage/types";

export const AP_REPEAT_KIND = "ap_repeat";
const EPS = 0.00005;
const DAY_MS = 24 * 60 * 60 * 1000;
const apRank = (fc: string) => (fc === "AP+" ? 2 : fc === "AP" ? 1 : 0);

export interface LoggedEvent { chartKey: string; achievementVal: number; sourcePlayId?: string; playedAt: number; sourceKind?: string }
export type BestRecords = ReadonlyMap<string, { achievementVal: number; fc: string }>;

/** 최근 플레이 기록에서 재AP 성과로 남길 판. best: 보면별 지금 가장 좋은 기록. logged: 이미 남긴 성과. */
export function repeatApEvents(profileKey: string, history: readonly PlayRecord[], best: BestRecords, logged: readonly LoggedEvent[], capturedAt: number): AchievementPlayEventLogInput[] {
  const out: AchievementPlayEventLogInput[] = [];
  const seen = new Set<string>();
  history.forEach((p, idx) => {
    if (!apRank(p.fc) || !p.detailIdx || seen.has(p.detailIdx) || !hasValidRecordDate(p.date)) return;
    const key = chartKey(p);
    const b = best.get(key);
    if (!b || !apRank(b.fc)) return;
    if (p.achievementVal > b.achievementVal + EPS || apRank(p.fc) > apRank(b.fc)) return;
    const playedAt = recordPlayedAt(p.date);
    const already = logged.some((e) => e.chartKey === key && (e.sourcePlayId === p.detailIdx
      || (e.sourceKind !== AP_REPEAT_KIND && String(e.sourcePlayId ?? "").startsWith("clear:")
        && Math.abs(e.achievementVal - p.achievementVal) < EPS && playedAt <= e.playedAt)));
    if (already) return;
    seen.add(p.detailIdx);
    out.push({
      profileKey, sourcePlayId: p.detailIdx, chartKey: key, playedAt, sourceSequence: idx, capturedAt,
      recordJson: JSON.stringify(p), achievementVal: p.achievementVal, achievementBefore: p.achievementVal,
      fc: p.fc, sync: "", ratingUp: 0, title: p.title, diff: p.diff, level: p.level, musicKind: p.musicKind,
      achievementText: p.achievement, sourceKind: AP_REPEAT_KIND,
    });
  });
  return out;
}

/**
 * 재AP 성과를 찾아 남긴다. profileKey: 성과를 남길 키(캐롤봇 친구 코드 키). logKeys: 이 사용자의 성과가 쌓이는 키들
 * (maishift 키 + 친구 코드 키). best 를 주지 않으면 비교 기준(chart_clears)을 읽는다. 남긴 개수.
 */
export async function saveRepeatApEvents(profileKey: string, history: readonly PlayRecord[], logKeys: readonly string[], best?: BestRecords): Promise<number> {
  const candidates = history.filter((p) => apRank(p.fc) && p.detailIdx && hasValidRecordDate(p.date));
  if (!candidates.length) return 0;
  let bestRecords = best;
  if (!bestRecords) {
    // 추가 북마클릿을 처음 실행한 직후엔 비교 기준이 아직 maishift 키에 있다(sync.ts 가 다음 반영 때 옮긴다).
    for (const k of [profileKey, ...logKeys.filter((k) => k !== profileKey)]) {
      const rows = await getChartClears(k);
      if (rows.length) { bestRecords = new Map(rows.map((r) => [r.chartKey, { achievementVal: r.achievementVal, fc: r.fc }])); break; }
    }
  }
  if (!bestRecords) return 0;
  const from = Math.min(...candidates.map((p) => recordPlayedAt(p.date))) - 2 * DAY_MS;
  const to = Date.now() + DAY_MS;
  const logged = (await Promise.all([...new Set([profileKey, ...logKeys])].map((k) => getAchievementPlayEventLog(k, from, to)))).flat() as LoggedEvent[];
  const events = repeatApEvents(profileKey, history, bestRecords, logged, Date.now());
  if (events.length) await saveAchievementPlayEventLogBatch(events);
  return events.length;
}
