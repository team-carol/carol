// src/goals.ts — 목표 spec 평가 순수 로직. Discord/DB 없이 dist 산출물만 로드한다.
process.env.DATABASE_URL ||= "postgres://placeholder:placeholder@127.0.0.1:5432/placeholder";

const test = require("node:test");
const assert = require("node:assert/strict");
const g = require("../../dist/goals");

test("parseLevelRange", () => {
  assert.deepEqual(g.parseLevelRange("13"), { min: 13, max: 13.5, label: "13" });
  assert.deepEqual(g.parseLevelRange("13+"), { min: 13.6, max: 13.9, label: "13+" });
  assert.deepEqual(g.parseLevelRange("13-14+"), { min: 13, max: 14.9, label: "13-14+" });
  assert.equal(g.parseLevelRange("abc"), null);
  assert.equal(g.parseLevelRange("14-13"), null);
  assert.equal(g.parseLevelRange("99"), null);
});

test("evaluateGoal: rating", () => {
  const below = g.evaluateGoal({ kind: "rating", target: 15000 }, { profile: { rating: 12000, clearJson: "[]", server: "intl" } });
  assert.equal(below.done, false);
  assert.equal(below.valueText, "12000");
  assert.equal(below.targetText, "15000");
  assert.ok(Math.abs(below.progress - 0.8) < 1e-9);

  const met = g.evaluateGoal({ kind: "rating", target: 15000 }, { profile: { rating: 15200, clearJson: "[]", server: "intl" } });
  assert.equal(met.done, true);
  assert.equal(met.progress, 1);
});

test("evaluateGoal: rating — baseline 기준 상대 진행률", () => {
  const spec = { kind: "rating", target: 13600, baseline: 13500 };
  const start = g.evaluateGoal(spec, { profile: { rating: 13500, clearJson: "[]", server: "intl" } });
  assert.equal(start.done, false);
  assert.equal(start.progress, 0); // 목표 세운 시점 = 0%
  assert.equal(start.currentValue, 13500);

  const half = g.evaluateGoal(spec, { profile: { rating: 13550, clearJson: "[]", server: "intl" } });
  assert.ok(Math.abs(half.progress - 0.5) < 1e-9);
  assert.equal(g.progressPercent(half.progress, half.done), 50);

  const near = g.evaluateGoal(spec, { profile: { rating: 13599, clearJson: "[]", server: "intl" } });
  assert.equal(near.done, false);
  assert.equal(g.progressPercent(near.progress, near.done), 99);

  const met = g.evaluateGoal(spec, { profile: { rating: 13600, clearJson: "[]", server: "intl" } });
  assert.equal(met.done, true);
  assert.equal(met.progress, 1);
});

test("evaluateGoal: rating — baseline 없으면 절대값 기준 (구버전 호환)", () => {
  const r = g.evaluateGoal({ kind: "rating", target: 13600 }, { profile: { rating: 13500, clearJson: "[]", server: "intl" } });
  assert.ok(Math.abs(r.progress - 13500 / 13600) < 1e-9);
});

const clearJson = JSON.stringify([
  { title: "Oshama Scramble!", diff: "MASTER", musicKind: "DX", achievementVal: 100.7, fc: "AP", sync: "FS", level: "13" },
  { title: "Oshama Scramble!", diff: "MASTER", musicKind: "DX", achievementVal: 99.2, fc: "FC", sync: "", level: "13" },
]);

test("evaluateGoal: chart — achievement criterion", () => {
  const r = g.evaluateGoal(
    { kind: "chart", title: "Oshama Scramble!", diff: "MASTER", musicKind: "DX", criterion: { type: "achievement", value: 100.5, rank: "SSS+" } },
    { profile: { rating: 0, clearJson, server: "intl" } },
  );
  assert.equal(r.done, true);
  assert.equal(r.valueText, "100.7000%");
  assert.equal(r.targetText, "SSS+");
});

test("evaluateGoal: chart — combo criterion, partial progress", () => {
  const r = g.evaluateGoal(
    { kind: "chart", title: "Oshama Scramble!", diff: "MASTER", musicKind: "DX", criterion: { type: "combo", value: "AP+" } },
    { profile: { rating: 0, clearJson, server: "intl" } },
  );
  assert.equal(r.done, false); // best mark is AP, target AP+
  assert.equal(r.valueText, "AP");
  assert.ok(r.progress > 0 && r.progress < 1);
});

test("evaluateGoal: chart — no matching record", () => {
  const r = g.evaluateGoal(
    { kind: "chart", title: "NONEXISTENT SONG", diff: "MASTER", criterion: { type: "achievement", value: 100 } },
    { profile: { rating: 0, clearJson, server: "intl" } },
  );
  assert.equal(r.done, false);
  assert.equal(r.valueText, "미기록");
  assert.equal(r.progress, 0);
});

test("evaluateGoal: aggregate degrades gracefully without loaded constants", () => {
  const r = g.evaluateGoal(
    { kind: "aggregate", criterion: { type: "combo", value: "AP" }, levelLabel: "13", constantMin: 13, constantMax: 13.5, count: 5 },
    { profile: { rating: 0, clearJson, server: "intl" } },
  );
  assert.equal(r.done, false);
  assert.equal(typeof r.progress, "number");
});

test("describeGoal", () => {
  assert.equal(g.describeGoal({ kind: "rating", target: 15000 }), "레이팅 15000 도달");
  assert.equal(
    g.describeGoal({ kind: "aggregate", criterion: { type: "combo", value: "AP" }, levelLabel: "13+", constantMin: 13.6, constantMax: 13.9, count: 10 }),
    "Lv13+ ✦ AP 이상 10개",
  );
  assert.equal(
    g.describeGoal({ kind: "aggregate", criterion: { type: "achievement", value: 100, rank: "SSS" }, levelLabel: "14", constantMin: 14, constantMax: 14.5, count: null }),
    "Lv14 ✦ SSS 이상 전곡",
  );
});

test("progressBar", () => {
  assert.equal(g.progressBar(0.5, 10), "█████░░░░░");
  assert.equal(g.progressBar(0, 4), "░░░░");
  assert.equal(g.progressBar(1, 4), "████");
  assert.equal(g.progressBar(2, 4), "████"); // clamped
});

test("progressBar: near-100 미달성은 꽉 찬 바를 보이지 않는다", () => {
  // 13500/13600 ≈ 0.99264 → 예전엔 Math.round 로 꽉 찬 바가 나왔다
  assert.equal(g.progressBar(13500 / 13600, 12), "███████████░");
  assert.equal(g.progressBar(96.9999 / 97, 12), "███████████░");
});

test("progressPercent: 미달성이면 100% 로 반올림하지 않는다", () => {
  assert.equal(g.progressPercent(13500 / 13600, false), 99);
  assert.equal(g.progressPercent(96.9999 / 97, false), 99);
  assert.equal(g.progressPercent(0.994, false), 99);
  assert.equal(g.progressPercent(0.5, false), 50);
  assert.equal(g.progressPercent(0, false), 0);
  assert.equal(g.progressPercent(1, true), 100);
  assert.equal(g.progressPercent(0.3, true), 100); // done 이면 항상 100
  assert.equal(g.progressPercent(2, false), 99); // clamp
});
