/**
 * 서클 공유. 같은 서클(서버·서클 코드)은 circles 테이블에 한 행만 두고, 서클원 누구든 캐롤봇 추가 북마클릿으로
 * 동기화하면 그 행을 갱신한다. 그래서 다른 서클원이 동기화해도 최신 서클 정보를 본다.
 * - 각자의 profiles.circle_json 은 본인이 마지막으로 받은 서클이다. 가입 여부(어느 서클인지)는 이것으로만 정한다 —
 *   남의 maishift 아이디를 연동해도 그 사람의 서클이 보이지 않게. 내 서클 포인트(myPoints)도 이것에서 붙인다.
 * - 서클 홈은 동기화마다 받지만 멤버 목록·서클 랭킹 페이지는 못 받을 수 있다. 못 받은 부분은 같은 달에 받아 둔 값을 남긴다.
 *   서클 포인트는 달마다 초기화되므로 지난달 값은 남기지 않는다.
 */
import type { CircleInfo } from "./scraper";

export interface SharedCircle {
  /** 서클원 모두에게 같은 값. 내 서클 포인트(myPoints)는 뺀다. */
  data: CircleInfo;
  /** 서클 홈을 마지막으로 받은 시각 */
  syncedAt: number;
  /** 멤버 목록(멤버·멤버 수·정원)을 받은 시각. 0 이면 없다. */
  membersAt: number;
  /** 서클 랭킹(진행도·기간)을 받은 시각. 0 이면 없다. */
  rankingAt: number;
}

const KST_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const kstMonth = (t: number) => { const d = new Date(t + KST_MS); return d.getUTCFullYear() * 12 + d.getUTCMonth(); };
const kstDay = (t: number) => Math.floor((t + KST_MS) / DAY_MS);

/** 이번 동기화(now)에 받은 서클을 받아 둔 공유 서클에 합친다. */
export function mergeCircle(prev: SharedCircle | null, incoming: CircleInfo, now: number): SharedCircle {
  const { myPoints: _mine, ...data } = incoming;
  const hasMembers = incoming.members.length > 0;
  const hasRanking = incoming.progress !== undefined || incoming.period !== undefined;
  const keepMembers = !hasMembers && !!prev && prev.membersAt > 0 && kstMonth(prev.membersAt) === kstMonth(now);
  const keepRanking = !hasRanking && !!prev && prev.rankingAt > 0 && kstMonth(prev.rankingAt) === kstMonth(now);
  if (keepMembers) {
    data.members = prev!.data.members;
    data.memberCount = prev!.data.memberCount;
    data.memberMax = prev!.data.memberMax;
  }
  if (keepRanking) {
    if (prev!.data.progress !== undefined) data.progress = prev!.data.progress;
    if (prev!.data.period !== undefined) data.period = prev!.data.period;
  }
  return {
    data,
    syncedAt: now,
    membersAt: hasMembers ? now : keepMembers ? prev!.membersAt : 0,
    rankingAt: hasRanking ? now : keepRanking ? prev!.rankingAt : 0,
  };
}

/**
 * 보여 줄 서클과 그 동기화 시각. 공유 서클에 내 서클 포인트(같은 달에 받은 것만)를 붙이고, 초기화까지 남은 날을 지금 기준으로
 * 다시 센다. 공유 행이 없으면(공유 이전에 받고 아직 아무도 다시 동기화하지 않음) 내가 받은 그대로.
 */
export function viewCircle(own: CircleInfo, ownSyncedAt: number, shared: SharedCircle | null, now: number): { circle: CircleInfo; syncedAt: number } {
  const syncedAt = shared ? shared.syncedAt : ownSyncedAt;
  const circle: CircleInfo = shared ? { ...shared.data } : { ...own };
  delete circle.myPoints;
  if (own.myPoints !== undefined && kstMonth(ownSyncedAt) === kstMonth(now)) circle.myPoints = own.myPoints;
  if (circle.daysToReset !== null) circle.daysToReset = Math.max(0, circle.daysToReset - (kstDay(now) - kstDay(syncedAt)));
  return { circle, syncedAt };
}
