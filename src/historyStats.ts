/**
 * /히스토리 카드의 달성 기록·버전 주차. maishift 히스토리 내보내기 이미지와 같은 규칙.
 * - 레이팅 기준값: 10000~14000 은 1000 단위, ~15000 은 500, ~16000 은 100(+15250·15750), 그 위는 50 단위(이론상 최대까지).
 *   지금까지의 최고치를 넘을 때마다 새로 넘은 기준값을 하나씩 기록한다(첫 점에서 이미 넘은 값은 기록하지 않음).
 *   보여 주는 것: 최근 4개 + 그 밖의 주요 단계(MAJOR) 중 최근 3개.
 * - 플레이 횟수: 10·50·100·500·1000·5000 단위 중 기록이 4개 이하가 되는 가장 작은 단위, 최근 4개.
 * - 버전 주차: (시각 − 그 버전 출시 시각) / 7일, 내림.
 */
import type { MaishiftHistoryPoint, MaishiftVersion } from "./storage/types";

export interface Milestone { value: number; at: number; versionId: number; emphasised: boolean }

const RATING_STEPS: [number, number, number][] = [[10000, 14000, 1000], [14000, 15000, 500], [15000, 16000, 100], [16000, Infinity, 50]];
const RATING_EXTRA = [15250, 15750];
const MAJOR = [10000, 12000, 13000, 14000, 14500, 15000, 16000];
const EMPHASISED = new Set([...MAJOR, 15250, 15500, 15750, 16250, 16500, 16750]);
const PLAY_STEPS = [10, 50, 100, 500, 1000, 5000];
const WEEK_MS = 7 * 86400000;

export function ratingThresholds(max: number): number[] {
  const out = new Set<number>();
  for (const [from, to, step] of RATING_STEPS) for (let v = from; v <= Math.min(to, max); v += step) out.add(v);
  for (const v of RATING_EXTRA) if (v <= max) out.add(v);
  return [...out].sort((a, b) => a - b);
}

/** 값이 지금까지의 최고치를 넘을 때마다 새로 넘은 기준값을 하나씩. */
function crossings(history: readonly MaishiftHistoryPoint[], thresholds: number[], valueOf: (h: MaishiftHistoryPoint) => number, emphasised: (v: number) => boolean): Milestone[] {
  const sorted = [...thresholds].sort((a, b) => a - b);
  const out: Milestone[] = [];
  let next = 0, best = -Infinity;
  history.forEach((h, i) => {
    const v = valueOf(h);
    if (v <= best) return;
    best = v;
    for (; next < sorted.length && sorted[next] <= best; next++) if (i > 0) out.push({ value: sorted[next], at: h.at, versionId: h.versionId, emphasised: emphasised(sorted[next]) });
  });
  return out;
}

/** 오름차순(낮은 값부터). maxRating: 이론상 최대 레이팅(15.0 AP+ 101% × 50). */
export function ratingMilestones(history: readonly MaishiftHistoryPoint[], maxRating: number, endAt: number): Milestone[] {
  const all = crossings(history, ratingThresholds(maxRating), (h) => h.rating, (v) => EMPHASISED.has(v)).filter((m) => m.at <= endAt);
  const recent = all.slice(-4);
  const shown = new Set(recent.map((m) => m.value));
  return [...all.filter((m) => MAJOR.includes(m.value) && !shown.has(m.value)).slice(-3), ...recent].sort((a, b) => a.value - b.value);
}

export function playMilestones(history: readonly MaishiftHistoryPoint[], endTotal: number, endAt: number, count = 4): Milestone[] {
  const at = (step: number) => {
    const thresholds: number[] = [];
    for (let v = step; v <= endTotal; v += step) thresholds.push(v);
    const bigger = PLAY_STEPS.find((s) => s > step);
    return crossings(history, thresholds, (h) => h.playTotal, (v) => bigger !== undefined && v % bigger === 0).filter((m) => m.at <= endAt);
  };
  let chosen: Milestone[] = [];
  for (const step of PLAY_STEPS) {
    const list = at(step);
    if (list.length) { chosen = list; if (list.length <= count) break; }
  }
  return chosen.slice(-count);
}

/** 그 시각이 속한 버전과 주차. 버전 목록에 없으면 null. */
export function versionWeek(at: number, versionId: number, versions: readonly MaishiftVersion[]): { name: string; week: number } | null {
  const v = versions.find((x) => x.id === versionId);
  return v ? { name: v.name, week: Math.max(0, Math.floor((at - v.releasedAt) / WEEK_MS)) } : null;
}
