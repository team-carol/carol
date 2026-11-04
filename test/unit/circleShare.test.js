const test = require("node:test");
const assert = require("node:assert/strict");
const { mergeCircle, viewCircle } = require("../../dist/circleShare.js");

const T = (s) => Date.parse(s);
const member = (name, points) => ({ name, rating: 15000, trophy: "", trophyClass: "normal", points, leader: false });
const circle = (over = {}) => ({
  name: "CIRCLE", code: "123456", comment: "", monthPoints: 100, daysToReset: 10, rank: 3, rankUpdatedAt: "", nextRewardPoints: 50, challenge: null,
  memberCount: 2, memberMax: 30, members: [member("A", 60), member("B", 40)], progress: "gold", period: "2026/11/01～2026/11/30", myPoints: 60,
  ...over,
});
// 멤버 목록·서클 랭킹 페이지를 못 받은 동기화
const homeOnly = (over = {}) => {
  const c = circle({ members: [], memberCount: null, memberMax: null, ...over });
  delete c.progress;
  delete c.period;
  delete c.myPoints;
  return c;
};

test("mergeCircle: 처음 받으면 그대로 두고, 내 서클 포인트는 공유하지 않는다", () => {
  const now = T("2026-11-04T05:00:00Z");
  const s = mergeCircle(null, circle(), now);
  assert.equal(s.data.myPoints, undefined);
  assert.deepEqual([s.data.members.length, s.data.progress, s.syncedAt, s.membersAt, s.rankingAt], [2, "gold", now, now, now]);
});

test("mergeCircle: 멤버·랭킹을 못 받은 동기화는 같은 달에 받아 둔 멤버·진행도를 남기고 홈 정보만 바꾼다", () => {
  const first = T("2026-11-04T05:00:00Z"), later = T("2026-11-06T05:00:00Z");
  const s = mergeCircle(mergeCircle(null, circle(), first), homeOnly({ monthPoints: 300 }), later);
  assert.equal(s.data.monthPoints, 300);
  assert.deepEqual([s.data.members.map((m) => m.name), s.data.memberCount, s.data.progress, s.data.period], [["A", "B"], 2, "gold", "2026/11/01～2026/11/30"]);
  assert.deepEqual([s.syncedAt, s.membersAt, s.rankingAt], [later, first, first]);
});

test("mergeCircle: 지난달(KST)에 받은 멤버·진행도는 남기지 않는다", () => {
  const lastMonth = T("2026-10-31T10:00:00Z"); // KST 10/31 19:00
  const now = T("2026-11-01T01:00:00Z"); // KST 11/1 10:00
  const s = mergeCircle(mergeCircle(null, circle(), lastMonth), homeOnly(), now);
  assert.deepEqual([s.data.members, s.data.progress, s.membersAt, s.rankingAt], [[], undefined, 0, 0]);
});

test("viewCircle: 공유 서클에 같은 달에 받은 내 서클 포인트를 붙이고, 남은 날은 지금 기준으로 센다", () => {
  const shared = mergeCircle(null, circle({ monthPoints: 500, daysToReset: 10 }), T("2026-11-04T05:00:00Z"));
  const own = circle({ monthPoints: 100, myPoints: 30 });
  const v = viewCircle(own, T("2026-11-02T05:00:00Z"), shared, T("2026-11-06T05:00:00Z"));
  assert.deepEqual([v.circle.monthPoints, v.circle.myPoints, v.circle.daysToReset, v.syncedAt], [500, 30, 8, shared.syncedAt]);
  // 지난달에 받은 내 서클 포인트는 붙이지 않는다.
  assert.equal(viewCircle(own, T("2026-10-20T05:00:00Z"), shared, T("2026-11-06T05:00:00Z")).circle.myPoints, undefined);
});

test("viewCircle: 공유 행이 없으면 내가 받은 그대로(남은 날은 0 아래로 내려가지 않는다)", () => {
  const own = circle({ daysToReset: 1 });
  const at = T("2026-11-04T05:00:00Z");
  const v = viewCircle(own, at, null, T("2026-11-08T05:00:00Z"));
  assert.deepEqual([v.circle.monthPoints, v.circle.myPoints, v.circle.daysToReset, v.syncedAt], [100, 60, 0, at]);
});
