// 레이팅 추이(/프로필 카드 그래프). 두 출처를 합친다.
//   - 실측: rating_snapshots 의 하루치 레이팅(동기화 때 DX NET 에서 읽은 값). 그래프에서 실선.
//   - 추정: 첫 실측 이전(스냅샷 기능 이전 등)은 /레이팅표 과거 조회와 같은 방식으로
//     성과 이벤트 로그를 그날 끝까지 되돌려 레이팅을 계산한다(ratingRewind.ts). 그래프에서 점선.
// 되돌린 계산은 현재 상수·버전 기준이라 실제 값과 어긋날 수 있다. 그래서 바로 다음 실측일의
// 계산값과 실측값의 차이만큼 보정해, 추정 구간이 다음 실측점에 끊김 없이 이어지게 한다.
// 다음 실측이 없는 날(마지막 동기화 이후)은 알 수 있는 게 없어 점을 찍지 않는다.
// 실측점 사이는 추정을 쓰지 않고 실측끼리 실선으로 잇는다. 추정은 첫 실측 이전 구간에만 쓴다.
import type { PlayRecord } from "./scraper";
import type { MaimaiServer } from "./storage/types";
import { computeRatingTarget } from "./constants";
import { rewindClearRecords, totalRatingOf, type RewindEvent } from "./ratingRewind";
import { koreaPlayDayKey, koreaPlayDayRange } from "./achievements";

export const RATING_HISTORY_DAYS = 90;

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

export function buildRatingSeries(opts: {
  /** 그래프에 그릴 날짜들(오래된 날부터) */
  days: string[];
  /** 실측 레이팅. 기간 밖(이후) 스냅샷도 넣어야 추정 보정에 쓸 수 있다 */
  snapshots: { playDay: string; rating: number }[];
  /** 현재 전체 클리어 기록(profiles.clear_json) */
  clearNow: readonly PlayRecord[];
  /** 기간 첫날 시작 이후의 성과 이벤트 전부 */
  events: readonly RewindEvent[];
  server: MaimaiServer;
  /** 성과 로그가 시작된 날. 이보다 앞은 되돌릴 데이터가 없다(null 이면 추정 안 함) */
  logFirstDay: string | null;
}): RatingPoint[] {
  const snap = new Map(opts.snapshots.filter((s) => s.rating > 0).map((s) => [s.playDay, s.rating]));
  const snapDays = [...snap.keys()].sort();
  const estMemo = new Map<string, number>();
  const estimate = (day: string): number => {
    const hit = estMemo.get(day);
    if (hit !== undefined) return hit;
    const cutoff = koreaPlayDayRange(day).to;
    const later = opts.events.filter((e) => e.playedAt >= cutoff);
    const { records } = rewindClearRecords(opts.clearNow, later);
    const value = totalRatingOf(computeRatingTarget(records, opts.server, day), opts.server);
    estMemo.set(day, value);
    return value;
  };

  const out: RatingPoint[] = [];
  for (const day of opts.days) {
    const measured = snap.get(day);
    if (measured !== undefined) {
      out.push({ day, rating: measured, estimated: false });
      continue;
    }
    // 추정은 첫 실측 이전에만. 실측 사이 빈 날은 점을 찍지 않고 실측끼리 실선으로 잇는다.
    if (snapDays.length && day > snapDays[0]) continue;
    if (!opts.logFirstDay || day < opts.logFirstDay || opts.clearNow.length === 0) continue;
    const next = snapDays.find((d) => d > day);
    if (!next) continue;
    const rating = Math.round(estimate(day) + (snap.get(next)! - estimate(next)));
    if (rating > 0) out.push({ day, rating, estimated: true });
  }
  return out;
}
