/**
 * 성과의 레이팅 상승분(+N). maishift 전체 기록(모든 보면의 달성률·상수)으로 계산한다.
 *
 * 기록이 오른 보면들을 오르기 전 기록으로 되돌린 상태(처음 친 보면은 안 친 상태)에서 레이팅 대상(신곡 15 + 구곡 35)
 * 합을 구하고, 오른 보면을 플레이 순서대로 하나씩 지금 기록으로 바꾸며 늘어난 합을 그 보면의 상승분으로 한다.
 * - 대상곡에 새로 들거나 다른 보면을 밀어낸 효과가 그대로 들어가고, 상승분의 합은 (지금 레이팅 − 오르기 전 레이팅)이다.
 * - 상수·신곡 범위는 지금 값을 쓴다. 업로드 사이에 바뀐 상수·버전은 상승분에 넣지 않는다(플레이로 오른 만큼만).
 * - 플레이 순서를 모르면(캐롤봇 추가 북마클릿 미실행) 넘겨받은 순서대로 나눈다. 합은 순서와 관계없다.
 * 곡 레이팅 식(calcSongRating)과 대상곡 선정은 maishift 레이팅과 같다(2026-11-04 실제 기록 50곡으로 확인).
 */
import { chartKey, type PlayRecord } from "./scraper";
import { calcSongRating, getConstant, levelToNumber } from "./constants";
import type { MaimaiServer } from "./storage/types";

export interface RatingImprovement {
  chartKey: string;
  /** 오르기 전 달성률. 0 이면 처음 친 보면 */
  achievementBefore: number;
  /** 오르기 전 FC/AP 표시(AP 보너스) */
  fcBefore: string;
}

const NEW_COUNT = 15;
const OLD_COUNT = 35;

function topSum(values: number[], n: number): number {
  return values.sort((a, b) => b - a).slice(0, n).reduce((s, v) => s + v, 0);
}

/**
 * improvements 순서대로 보면마다의 레이팅 상승분. records 는 지금(올린 뒤)의 전체 기록.
 * records 에 없는 보면은 건너뛴다.
 */
export function ratingGains(
  records: readonly PlayRecord[],
  improvements: readonly RatingImprovement[],
  server: MaimaiServer,
  isNew: (r: PlayRecord) => boolean,
): Map<string, number> {
  const charts = new Map<string, { isNew: boolean; constant: number; rs: number }>();
  for (const r of records) {
    if (!(r.achievementVal > 0)) continue;
    const constant = r.constant ?? getConstant(r.title, r.musicKind, r.diff, server) ?? levelToNumber(r.level);
    charts.set(chartKey(r), { isNew: isNew(r), constant, rs: calcSongRating(r.achievementVal, constant, r.fc) });
  }
  // 보면별로 지금 쳐 있는 곡 레이팅(없으면 안 친 상태)
  const state = new Map<string, number>([...charts].map(([k, c]) => [k, c.rs]));
  const steps = improvements.filter((i) => charts.has(i.chartKey));
  for (const i of steps) {
    const c = charts.get(i.chartKey)!;
    if (i.achievementBefore > 0) state.set(i.chartKey, calcSongRating(i.achievementBefore, c.constant, i.fcBefore));
    else state.delete(i.chartKey);
  }
  const total = (): number => {
    const news: number[] = [], olds: number[] = [];
    for (const [k, rs] of state) (charts.get(k)!.isNew ? news : olds).push(rs);
    return topSum(news, NEW_COUNT) + topSum(olds, OLD_COUNT);
  };
  const gains = new Map<string, number>();
  let before = total();
  for (const i of steps) {
    state.set(i.chartKey, charts.get(i.chartKey)!.rs);
    const after = total();
    gains.set(i.chartKey, after - before);
    before = after;
  }
  return gains;
}
