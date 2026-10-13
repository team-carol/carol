// 히스토리 그래프(/프로필 카드·/히스토리). 출처는 maishift 히스토리(업로드마다의 실제 레이팅·플레이 횟수)뿐이다.
// 캐롤봇은 날짜별 레이팅을 따로 저장하지 않는다(과거 레이팅표도 maishift 이전 기록을 쓴다).
import type { MaishiftHistoryPoint } from "./storage/types";
import { koreaPlayDayKey, koreaPlayDayRange } from "./achievements";

export interface RatingPoint {
  day: string;
  rating: number;
  estimated: boolean;
}

/** today 를 끝으로 하는 n 일(오래된 날부터). 날짜 키는 한국 시간 오전 4시 기준 플레이 날짜. */
export function recentPlayDays(today: string, n: number): string[] {
  const { from } = koreaPlayDayRange(today);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(koreaPlayDayKey(new Date(from - i * 86400000 + 12 * 3600000)));
  return out;
}

export interface PlayCountPoint {
  day: string;
  /** 누적 플레이 횟수 */
  total: number;
  /** 현재 버전 플레이 횟수(버전이 바뀌면 0부터) */
  current: number;
}

/** maishift 히스토리가 시작된 날부터 today 까지(전체 기간). 히스토리가 없으면 빈 배열. */
export function maishiftDays(history: readonly MaishiftHistoryPoint[], today: string, maxDays = 3650): string[] {
  if (!history.length) return [];
  const first = koreaPlayDayKey(new Date(Math.min(...history.map((h) => h.at))));
  const n = Math.round((Date.parse(today) - Date.parse(first)) / 86400000) + 1;
  return recentPlayDays(today, Math.max(1, Math.min(maxDays, n)));
}

/**
 * maishift 히스토리(업로드마다 한 점, 실제 값) → 그래프 점. 추정 없이 실측만.
 * 업로드한 날마다 그날 마지막 값. 기간 이전 업로드가 있으면 그 값을 기간 첫날에도 찍어
 * (다음 업로드 전까지 값이 그대로였으므로) 선이 기간 처음부터 이어지게 한다.
 */
export function maishiftSeries(history: readonly MaishiftHistoryPoint[], days: string[], versionName: (id: number) => string = (id) => `ver.${id}`): { points: RatingPoint[]; plays: PlayCountPoint[]; updates: { day: string; label: string }[] } {
  if (!days.length) return { points: [], plays: [], updates: [] };
  const first = days[0];
  const sorted = [...history].sort((a, b) => a.at - b.at).map((h) => ({ ...h, day: koreaPlayDayKey(new Date(h.at)) }));
  const lastOfDay = new Map<string, (typeof sorted)[number]>();
  for (const h of sorted) lastOfDay.set(h.day, h);

  const picked: { day: string; h: (typeof sorted)[number] }[] = [];
  const before = [...sorted].reverse().find((h) => h.day < first);
  if (before && !lastOfDay.has(first)) picked.push({ day: first, h: before });
  for (const day of days) {
    const h = lastOfDay.get(day);
    if (h) picked.push({ day, h });
  }
  // 버전 표시: 버전 번호가 바뀐 뒤 첫 업로드한 날(출시일이 아니라 그 사용자가 새 버전으로 처음 올린 날).
  const updates: { day: string; label: string }[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const h = sorted[i];
    if (h.versionId > sorted[i - 1].versionId && h.day >= first && !updates.some((u) => u.day === h.day)) updates.push({ day: h.day, label: versionName(h.versionId) });
  }
  return {
    points: picked.map(({ day, h }) => ({ day, rating: h.rating, estimated: false })),
    plays: picked.map(({ day, h }) => ({ day, total: h.playTotal, current: h.playCurrent })),
    updates,
  };
}

export const HISTORY_PERIODS = ["all", "version", "365", "182", "91", "30", "14", "7"] as const;
export type HistoryPeriod = (typeof HISTORY_PERIODS)[number];

/**
 * /히스토리 기간의 날짜들(오래된 날부터). 끝은 마지막 업로드한 날(maishift 내보내기 그림과 같이).
 * - all: 첫 업로드부터, version: 지금 버전이 나온 날부터, 숫자: 그만큼의 일수. 첫 업로드보다 앞으로는 가지 않는다.
 */
export function historyPeriodDays(history: readonly MaishiftHistoryPoint[], versions: readonly { id: number; releasedAt: number }[], period: HistoryPeriod): string[] {
  if (!history.length) return [];
  const sorted = [...history].sort((a, b) => a.at - b.at);
  const first = koreaPlayDayKey(new Date(sorted[0].at));
  const last = koreaPlayDayKey(new Date(sorted[sorted.length - 1].at));
  let start = first;
  if (period === "version") {
    const released = versions.find((v) => v.id === sorted[sorted.length - 1].versionId)?.releasedAt;
    if (released) start = koreaPlayDayKey(new Date(released));
  } else if (period !== "all") {
    start = recentPlayDays(last, Number(period))[0];
  }
  if (start < first) start = first;
  const n = Math.round((Date.parse(last) - Date.parse(start)) / 86400000) + 1;
  return recentPlayDays(last, Math.max(1, n));
}
