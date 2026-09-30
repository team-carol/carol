// src/ratingHistory.ts — 레이팅 추이: 실측(스냅샷) + 성과 로그로 되돌린 추정(다음 실측에 맞춰 보정).
const test = require("node:test");
const assert = require("node:assert/strict");
const h = require("../../dist/ratingHistory.js");
const { calcSongRating } = require("../../dist/constants.js");
const { koreaPlayDayRange } = require("../../dist/achievements.js");

test("recentPlayDays: 오늘을 끝으로 n 일, 오래된 날부터", () => {
  assert.deepEqual(h.recentPlayDays("2026-09-30", 3), ["2026-09-28", "2026-09-29", "2026-09-30"]);
  assert.deepEqual(h.recentPlayDays("2026-10-01", 2), ["2026-09-30", "2026-10-01"]);
});

test("buildRatingSeries: 실측은 그대로, 빈 날은 다음 실측 기준으로 보정한 추정", () => {
  const days = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06"];
  const rec = { title: "t", musicKind: "DX", diff: "MASTER", level: "13", achievementVal: 100.5, fc: "", sync: "" };
  const key = "t|DX|MASTER";
  const midD4 = koreaPlayDayRange("2026-09-04").from + 3600000;
  const series = h.buildRatingSeries({
    days,
    snapshots: [{ playDay: "2026-09-02", rating: 16000 }, { playDay: "2026-09-05", rating: 16010 }],
    clearNow: [rec],
    // 9/4 에 99.0 → 100.5 로 올린 기록
    events: [{ chartKey: key, playedAt: midD4, achievementBefore: 99.0, sourcePlayId: "p1", fc: "", sync: "" }],
    server: "intl",
    logFirstDay: "2026-09-01",
  });
  const drop = calcSongRating(100.5, 13, "") - calcSongRating(99.0, 13, "");
  assert.deepEqual(series, [
    { day: "2026-09-01", rating: 16000, estimated: true },           // 다음 실측(9/2)과 사이에 변화 없음
    { day: "2026-09-02", rating: 16000, estimated: false },
    { day: "2026-09-03", rating: 16010 - drop, estimated: true },    // 9/4 상승 전
    { day: "2026-09-04", rating: 16010, estimated: true },           // 9/4 상승 반영
    { day: "2026-09-05", rating: 16010, estimated: false },
    // 9/6: 이후 실측이 없어 점을 찍지 않는다
  ]);
});

test("buildRatingSeries: 성과 로그 시작 전이나 로그가 없으면 실측만", () => {
  const base = { days: ["2026-09-01", "2026-09-02"], snapshots: [{ playDay: "2026-09-02", rating: 15000 }], clearNow: [], events: [], server: "intl" };
  assert.deepEqual(h.buildRatingSeries({ ...base, logFirstDay: null }), [{ day: "2026-09-02", rating: 15000, estimated: false }]);
  assert.deepEqual(h.buildRatingSeries({ ...base, logFirstDay: "2026-09-02" }), [{ day: "2026-09-02", rating: 15000, estimated: false }]);
});
