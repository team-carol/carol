// src/ratingHistory.ts — 히스토리: 실측(스냅샷) + 성과 로그로 되돌린 추정(다음 실측에 맞춰 보정).
const test = require("node:test");
const assert = require("node:assert/strict");
const h = require("../../dist/ratingHistory.js");
const { calcSongRating } = require("../../dist/constants.js");
const { koreaPlayDayRange } = require("../../dist/achievements.js");

test("recentPlayDays: 오늘을 끝으로 n 일, 오래된 날부터", () => {
  assert.deepEqual(h.recentPlayDays("2026-09-30", 3), ["2026-09-28", "2026-09-29", "2026-09-30"]);
  assert.deepEqual(h.recentPlayDays("2026-10-01", 2), ["2026-09-30", "2026-10-01"]);
});

test("buildRatingSeries: 첫 실측 이전만 보정한 추정, 실측 사이는 추정 없음", () => {
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
  assert.ok(drop > 0);
  assert.deepEqual(series, [
    { day: "2026-09-01", rating: 16000, estimated: true },           // 첫 실측 이전: 다음 실측(9/2) 기준 추정
    { day: "2026-09-02", rating: 16000, estimated: false },
    // 9/3·9/4: 실측 사이는 추정 없이 9/2 → 9/5 를 바로 잇는다
    { day: "2026-09-05", rating: 16010, estimated: false },
    // 9/6: 이후 실측이 없어 점을 찍지 않는다
  ]);
});

test("buildRatingSeries: 성과 로그 시작 전이나 로그가 없으면 실측만", () => {
  const base = { days: ["2026-09-01", "2026-09-02"], snapshots: [{ playDay: "2026-09-02", rating: 15000 }], clearNow: [], events: [], server: "intl" };
  assert.deepEqual(h.buildRatingSeries({ ...base, logFirstDay: null }), [{ day: "2026-09-02", rating: 15000, estimated: false }]);
  assert.deepEqual(h.buildRatingSeries({ ...base, logFirstDay: "2026-09-02" }), [{ day: "2026-09-02", rating: 15000, estimated: false }]);
});

test("buildRatingSeries: 실측 사이 빈 날은 점을 찍지 않는다", () => {
  const days = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"];
  const rec = { title: "t", musicKind: "DX", diff: "MASTER", level: "13", achievementVal: 100.5, fc: "", sync: "" };
  const series = h.buildRatingSeries({
    days,
    snapshots: [{ playDay: "2026-09-01", rating: 16000 }, { playDay: "2026-09-04", rating: 16000 }],
    clearNow: [rec], events: [], server: "intl", logFirstDay: "2026-09-01",
  });
  assert.deepEqual(series, [
    { day: "2026-09-01", rating: 16000, estimated: false },
    { day: "2026-09-04", rating: 16000, estimated: false },
  ]);
});

test("versionUpdatesBetween: 기간 안의 국제판 버전 업데이트만", () => {
  const { versionUpdatesBetween } = require("../../dist/constants.js");
  assert.deepEqual(versionUpdatesBetween("2026-07-01", "2026-09-30"), [{ day: "2026-07-23", label: "CiRCLE PLUS" }]);
  assert.deepEqual(versionUpdatesBetween("2026-07-24", "2026-09-30"), []);
});

// maishift 히스토리: 업로드마다 한 점(실제 값). 시각은 한국 시간 오전 4시 기준 플레이 날짜로 묶는다.
const kst = (day, hour) => Date.parse(`${day}T${String(hour).padStart(2, "0")}:00:00+09:00`);

test("maishiftSeries: 기간 이전 값을 첫날에, 같은 날은 마지막 값, 플레이 횟수는 누적·현재 버전 그대로", () => {
  const days = h.recentPlayDays("2026-10-05", 5); // 10-01 ~ 10-05
  const history = [
    { at: kst("2026-09-20", 20), rating: 16000, playTotal: 2500, playCurrent: 300, versionId: 25 },
    { at: kst("2026-10-02", 13), rating: 16100, playTotal: 2520, playCurrent: 320, versionId: 25 },
    { at: kst("2026-10-02", 22), rating: 16150, playTotal: 2530, playCurrent: 330, versionId: 25 },
    { at: kst("2026-10-05", 2), rating: 16150, playTotal: 2535, playCurrent: 5, versionId: 26 }, // 오전 4시 전 → 10-04, 버전 바뀜
    { at: kst("2026-10-05", 15), rating: 16200, playTotal: 2550, playCurrent: 20, versionId: 26 },
  ];
  const { points, plays, updates } = h.maishiftSeries(history, days, (id) => (id === 26 ? "CiRCLE PLUS" : "?"));
  assert.deepEqual(updates, [{ day: "2026-10-04", label: "CiRCLE PLUS" }]);
  assert.deepEqual(points, [
    { day: "2026-10-01", rating: 16000, estimated: false },
    { day: "2026-10-02", rating: 16150, estimated: false },
    { day: "2026-10-04", rating: 16150, estimated: false },
    { day: "2026-10-05", rating: 16200, estimated: false },
  ]);
  assert.deepEqual(plays, [
    { day: "2026-10-01", total: 2500, current: 300 },
    { day: "2026-10-02", total: 2530, current: 330 },
    { day: "2026-10-04", total: 2535, current: 5 },
    { day: "2026-10-05", total: 2550, current: 20 },
  ]);
});

test("maishiftDays: 첫 업로드한 날부터 오늘까지 전체 기간", () => {
  const days = h.maishiftDays([{ at: kst("2026-10-05", 15), rating: 1, playTotal: 1, playCurrent: 1 }, { at: kst("2026-09-28", 12), rating: 1, playTotal: 1, playCurrent: 1 }], "2026-10-05");
  assert.equal(days[0], "2026-09-28");
  assert.equal(days[days.length - 1], "2026-10-05");
  assert.equal(days.length, 8);
  assert.deepEqual(h.maishiftDays([], "2026-10-05"), []);
});

test("historyPeriodDays: 끝은 마지막 업로드한 날, 첫 업로드보다 앞으로 가지 않음, 현재 버전은 출시일부터", () => {
  const H = [{ at: kst("2026-01-10", 12), rating: 1, playTotal: 1, playCurrent: 1, versionId: 25 }, { at: kst("2026-10-11", 18), rating: 1, playTotal: 1, playCurrent: 1, versionId: 26 }];
  const V = [{ id: 26, releasedAt: Date.parse("2026-07-22T22:00:00Z") }];
  const all = h.historyPeriodDays(H, V, "all");
  assert.deepEqual([all[0], all[all.length - 1]], ["2026-01-10", "2026-10-11"]);
  const week = h.historyPeriodDays(H, V, "7");
  assert.deepEqual([week[0], week.length], ["2026-10-05", 7]);
  assert.equal(h.historyPeriodDays(H, V, "version")[0], "2026-07-23");
  assert.equal(h.historyPeriodDays(H, V, "365")[0], "2026-01-10");
});
