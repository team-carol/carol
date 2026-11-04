const test = require("node:test");
const assert = require("node:assert/strict");
const { ratingGains } = require("../../dist/ratingGain.js");
const { calcSongRating } = require("../../dist/constants.js");

// 상수·달성률이 정해진 보면. key 는 chartKey(제목|종류|난이도)와 같은 모양이다.
const rec = (title, constant, achievementVal, fc = "", isNewSong = false) =>
  ({ title, musicKind: "DX", diff: "MASTER", level: "13", achievementVal, achievement: `${achievementVal}%`, fc, sync: "", date: "", jacketUrl: "", track: 0, constant, isNewSong });
const key = (r) => `${r.title}|${r.musicKind}|${r.diff}`;
const isNew = (r) => r.isNewSong;
const sum = (m) => [...m.values()].reduce((s, v) => s + v, 0);
/** 신곡 15 + 구곡 35 합(테스트용 기준) */
const rating = (records) => {
  const rs = records.filter((r) => r.achievementVal > 0).map((r) => ({ n: r.isNewSong, v: calcSongRating(r.achievementVal, r.constant, r.fc) }));
  const top = (xs, n) => xs.sort((a, b) => b - a).slice(0, n).reduce((s, v) => s + v, 0);
  return top(rs.filter((x) => x.n).map((x) => x.v), 15) + top(rs.filter((x) => !x.n).map((x) => x.v), 35);
};
// 구곡 35개(상수 12.0~15.4) + 신곡 15개로 대상곡이 꽉 찬 사람
const base = () => [
  ...Array.from({ length: 40 }, (_, i) => rec(`old${i}`, 12 + i * 0.1, 100.5)),
  ...Array.from({ length: 20 }, (_, i) => rec(`new${i}`, 12 + i * 0.1, 100.5, "", true)),
];

test("ratingGains: 대상곡 안에서 오르면 그 보면의 곡 레이팅 차이", () => {
  const records = base();
  const r = records.find((x) => x.title === "old39"); // 구곡 1위
  const before = 99.5;
  r.achievementVal = 100.5;
  const g = ratingGains(records, [{ chartKey: key(r), achievementBefore: before, fcBefore: "" }], "intl", isNew);
  assert.equal(g.get(key(r)), calcSongRating(100.5, r.constant, "") - calcSongRating(before, r.constant, ""));
});

test("ratingGains: 대상곡 밖에서 올라도 들어가지 못하면 0, 들어가면 밀려난 보면만큼 뺀 값", () => {
  const records = base();
  const low = records.find((x) => x.title === "old0"); // 구곡 꼴찌권(대상곡 밖)
  low.achievementVal = 97;
  const g1 = ratingGains(records, [{ chartKey: key(low), achievementBefore: 90, fcBefore: "" }], "intl", isNew);
  assert.equal(g1.get(key(low)), 0);

  // 처음 친 높은 상수 구곡: 대상곡 35위(old5)를 밀어내고 들어간다.
  const fresh = rec("fresh", 15, 100.5);
  const all = [...base(), fresh];
  const g2 = ratingGains(all, [{ chartKey: key(fresh), achievementBefore: 0, fcBefore: "" }], "intl", isNew);
  assert.equal(g2.get(key(fresh)), calcSongRating(100.5, 15, "") - calcSongRating(100.5, 12.5, ""));
  assert.equal(g2.get(key(fresh)), rating(all) - rating(base()), "처음 친 보면도 곡 레이팅 전체가 아니라 늘어난 만큼");
});

test("ratingGains: AP 보너스는 오르기 전 FC 표시로 판단한다", () => {
  const records = base();
  const r = records.find((x) => x.title === "old39");
  r.fc = "AP";
  const g = ratingGains(records, [{ chartKey: key(r), achievementBefore: 100.5, fcBefore: "FC" }], "intl", isNew);
  assert.equal(g.get(key(r)), 1);
  const same = ratingGains(records, [{ chartKey: key(r), achievementBefore: 100.5, fcBefore: "AP" }], "intl", isNew);
  assert.equal(same.get(key(r)), 0);
});

test("ratingGains: 여러 보면이 함께 오르면 순서대로 나누고, 합은 (지금 − 오르기 전) 레이팅", () => {
  const records = base();
  const ups = [["new19", 99], ["new0", 80], ["old39", 100.1], ["old3", 99.9]];
  const before = base();
  for (const [title, a] of ups) before.find((x) => x.title === title).achievementVal = a;
  const imp = ups.map(([title, a]) => ({ chartKey: `${title}|DX|MASTER`, achievementBefore: a, fcBefore: "" }));
  const g = ratingGains(records, imp, "intl", isNew);
  assert.equal(sum(g), rating(records) - rating(before));
  assert.ok([...g.values()].every((v) => v >= 0));
  // 순서를 바꿔도 합은 같다.
  assert.equal(sum(ratingGains(records, [...imp].reverse(), "intl", isNew)), sum(g));
});

test("ratingGains: 지금 기록에 없는 보면은 건너뛴다", () => {
  const g = ratingGains(base(), [{ chartKey: "gone|DX|MASTER", achievementBefore: 50, fcBefore: "" }], "intl", isNew);
  assert.equal(g.size, 0);
});
