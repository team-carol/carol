// src/constants.ts — 레이팅 산식 등 순수 함수. (곡 상수 맵은 네트워크 로드라 여기선 미검증)
process.env.DATABASE_URL ||= "postgres://placeholder:placeholder@127.0.0.1:5432/placeholder";

const test = require("node:test");
const assert = require("node:assert/strict");
const c = require("../../dist/constants");

test("calcSongRating: 알려진 값", () => {
  // SSS+ (100.5%) · 상수 15.0 → floor(15.0 * 1.005 * 22.4) = floor(337.68) = 337
  assert.equal(c.calcSongRating(100.5, 15.0), 337);
  // AP 보너스 +1
  assert.equal(c.calcSongRating(100.5, 15.0, "AP"), 338);
  assert.equal(c.calcSongRating(100.5, 15.0, "AP+"), 338);
  assert.equal(c.calcSongRating(100.5, 15.0, "FC"), 337); // FC엔 보너스 없음
  // S (97%) · 상수 13.0 → floor(13 * 0.97 * 20.0) = floor(252.2) = 252
  assert.equal(c.calcSongRating(97.0, 13.0), 252);
  // 계수 0 구간(달성률 < 10%) → 0
  assert.equal(c.calcSongRating(5.0, 13.0), 0);
});

test("levelToNumber", () => {
  assert.equal(c.levelToNumber("14"), 14);
  assert.equal(c.levelToNumber("14+"), 14.6);
  assert.equal(c.levelToNumber("7"), 7);
  assert.equal(c.levelToNumber(""), 0);
});

test("constantToDisplayLevel: X.0~X.5 → 'X', X.6~X.9 → 'X+'", () => {
  assert.equal(c.constantToDisplayLevel(13.0), "13");
  assert.equal(c.constantToDisplayLevel(13.5), "13");
  assert.equal(c.constantToDisplayLevel(13.6), "13+");
  assert.equal(c.constantToDisplayLevel(13.9), "13+");
  assert.equal(c.constantToDisplayLevel(14.0), "14");
});

test("newSongWindowAt: 버전 업데이트 시점 기준으로 신곡 범위가 바뀐다", () => {
  const cur = c.newSongWindowAt();
  assert.deepEqual(cur, { min: 26000, max: 27000 }, "인자 없으면 현재 범위 (CiRCLE ~ CiRCLE PLUS)");

  // 2026-07-23 CiRCLE PLUS 업데이트 당일부터 현재 범위
  assert.deepEqual(c.newSongWindowAt("2026-07-23"), { min: 26000, max: 27000 });
  assert.deepEqual(c.newSongWindowAt("2026-09-01"), { min: 26000, max: 27000 });

  // 그 하루 전까지는 PRiSM PLUS(25500) ~ CiRCLE(26500 미포함)
  assert.deepEqual(c.newSongWindowAt("2026-07-22"), { min: 25500, max: 26500 });
  assert.deepEqual(c.newSongWindowAt("2026-01-01"), { min: 25500, max: 26500 });
  assert.deepEqual(c.newSongWindowAt("2020-01-01"), { min: 25500, max: 26500 });
});

test("newSongWindowAt(jp): 내수판은 2026-09-17 MAGiCAL 부터 CiRCLE PLUS ~ MAGiCAL", () => {
  assert.deepEqual(c.newSongWindowAt(undefined, "jp"), { min: 26500, max: 27500 }, "현재 내수판 범위");
  assert.deepEqual(c.newSongWindowAt("2026-09-17", "jp"), { min: 26500, max: 27500 });
  assert.deepEqual(c.newSongWindowAt("2026-09-16", "jp"), { min: 26000, max: 27000 });
  // 국제판은 내수판 업데이트 영향을 받지 않는다
  assert.deepEqual(c.newSongWindowAt("2026-09-20", "intl"), { min: 26000, max: 27000 });
});

test("versionUpdatesBetween: 서버별 업데이트 날", () => {
  assert.deepEqual(c.versionUpdatesBetween("2026-07-01", "2026-09-30", "jp"), [{ day: "2026-09-17", label: "MAGiCAL" }]);
  assert.deepEqual(c.versionUpdatesBetween("2026-07-01", "2026-09-30", "intl"), [{ day: "2026-07-23", label: "CiRCLE PLUS" }]);
});

// isNewSong 의 국제판/내수판 분기는 versionMap(네트워크·DB 로드)이 있어야 의미가 있어
// 여기선 검증하지 않는다. 실데이터 검증은 개발 스택에서 별도로 수행.
