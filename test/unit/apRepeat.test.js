const test = require("node:test");
const assert = require("node:assert/strict");
const { repeatApEvents, AP_REPEAT_KIND } = require("../../dist/apRepeat.js");
const { achievementTier, recordPlayedAt } = require("../../dist/achievements.js");

const play = (title, achievementVal, fc, date, detailIdx) =>
  ({ title, musicKind: "DX", diff: "MASTER", level: "14", achievementVal, achievement: `${achievementVal.toFixed(4)}%`, fc, sync: "", date, jacketUrl: "", track: 1, detailIdx });
const key = (title) => `${title}|DX|MASTER`;
const best = new Map([
  [key("A"), { achievementVal: 100.9, fc: "AP" }],
  [key("B"), { achievementVal: 101, fc: "AP+" }],
  [key("C"), { achievementVal: 100.8, fc: "FC+" }],
]);
const ids = (events) => events.map((e) => e.sourcePlayId);

test("repeatApEvents: 이미 AP 한 보면을 더 낮게 다시 AP 한 판, AP+ 를 다시 한 판(같은 달성률)", () => {
  const events = repeatApEvents("intl:1", [play("A", 100.6, "AP", "2026/11/04 14:00", "p1"), play("B", 101, "AP+", "2026/11/04 14:05", "p2")], best, [], 1);
  assert.deepEqual(ids(events), ["p1", "p2"]);
  assert.deepEqual([events[0].sourceKind, events[0].ratingUp, events[0].fc, events[0].achievementVal, events[0].playedAt], [AP_REPEAT_KIND, 0, "AP", 100.6, recordPlayedAt("2026/11/04 14:00")]);
});

test("repeatApEvents: 처음 AP·기록 갱신·AP+ 로 오른 판·AP 아닌 판은 기록 비교가 맡거나 대상이 아니다", () => {
  const history = [
    play("C", 100.5, "AP", "2026/11/04 14:00", "c1"), // 지금 가장 좋은 기록이 AP 가 아니다(처음 AP 는 기록 비교 몫)
    play("A", 100.95, "AP", "2026/11/04 14:01", "a1"), // 기록 갱신
    play("A", 100.9, "AP+", "2026/11/04 14:02", "a2"), // AP → AP+ 로 마크가 오름
    play("A", 100.5, "FC+", "2026/11/04 14:03", "a3"), // AP 아님
    play("A", 100.5, "AP", "", "a4"), // 플레이 시각 없음
    play("A", 100.5, "AP", "2026/11/04 14:04"), // 플레이 ID 없음
    play("Z", 100.5, "AP", "2026/11/04 14:05", "z1"), // 비교 기준에 없는 보면
  ];
  assert.deepEqual(ids(repeatApEvents("intl:1", history, best, [], 1)), []);
});

test("repeatApEvents: 이미 남긴 판은 건너뛰고, 업로드 시각으로 만든 기록 갱신 성과의 판도 건너뛴다", () => {
  const history = [
    play("A", 100.6, "AP", "2026/11/04 14:00", "p1"),
    play("A", 100.6, "AP", "2026/11/04 14:00", "p1"), // 같은 판이 두 번
    play("B", 101, "AP+", "2026/11/04 13:00", "b-before"),
    play("B", 101, "AP+", "2026/11/04 15:00", "b-after"),
  ];
  const uploadedAt = recordPlayedAt("2026/11/04 14:30");
  const logged = [
    { chartKey: key("A"), achievementVal: 100.6, sourcePlayId: "p1", playedAt: 0 },
    // 플레이를 못 찾아 업로드 시각으로 만든 B 의 기록 갱신 성과: 그 전에 친 판(b-before)이 그 성과의 판이다.
    { chartKey: key("B"), achievementVal: 101, sourcePlayId: `clear:${key("B")}:101.0000:${uploadedAt}`, playedAt: uploadedAt, sourceKind: "maishift" },
  ];
  assert.deepEqual(ids(repeatApEvents("intl:1", history, best, logged, 1)), ["b-after"]);
});

test("achievementTier: 레이팅 상승 → AP/AP+ → 나머지", () => {
  assert.deepEqual([achievementTier(3, ""), achievementTier(3, "AP"), achievementTier(0, "AP+"), achievementTier(null, "AP"), achievementTier(0, "FC"), achievementTier(undefined, "")], [0, 0, 1, 1, 2, 2]);
});
