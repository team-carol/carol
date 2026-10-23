// src/nameTranslations.ts — 지방·스탬프 카드 이름 번역. 로드·기록은 DB 의존이라 순수 부분만 검증한다.
process.env.DATABASE_URL ||= "postgres://placeholder:placeholder@127.0.0.1:5432/placeholder";

const test = require("node:test");
const assert = require("node:assert/strict");
const { splitAreaName, areaDisplayName, stampDisplayName, setNameTranslationCache } = require("../../dist/nameTranslations");

test("splitAreaName: 끝 번호를 뗀다(전각 숫자는 반각으로)", () => {
  assert.deepEqual(splitAreaName("メトロポリスちほー7"), { base: "メトロポリスちほー", number: "7" });
  assert.deepEqual(splitAreaName("BLACK ROSEちほー 12"), { base: "BLACK ROSEちほー", number: "12" });
  assert.deepEqual(splitAreaName("ちほー２"), { base: "ちほー", number: "2" });
  assert.deepEqual(splitAreaName("でらっくすちほー"), { base: "でらっくすちほー", number: "" });
  assert.deepEqual(splitAreaName("2"), { base: "2", number: "" });
});

test("areaDisplayName: 번역은 번호 없는 이름에 달고 번호를 다시 붙인다", () => {
  setNameTranslationCache("area", "メトロポリスちほー", "메트로폴리스 지방");
  assert.equal(areaDisplayName("メトロポリスちほー7", true), "메트로폴리스 지방 7");
  assert.equal(areaDisplayName("メトロポリスちほー", true), "메트로폴리스 지방");
  assert.equal(areaDisplayName("メトロポリスちほー7", false), "メトロポリスちほー7");
  assert.equal(areaDisplayName("サークルちほー2", true), "サークルちほー2");
  setNameTranslationCache("area", "メトロポリスちほー", "");
  assert.equal(areaDisplayName("メトロポリスちほー7", true), "メトロポリスちほー7");
});

test("stampDisplayName: 번역이 있고 켜졌을 때만", () => {
  setNameTranslationCache("stamp", "ラズ", "라즈");
  assert.equal(stampDisplayName("ラズ", true), "라즈");
  assert.equal(stampDisplayName("ラズ", false), "ラズ");
  assert.equal(stampDisplayName("シフォン", true), "シフォン");
});
