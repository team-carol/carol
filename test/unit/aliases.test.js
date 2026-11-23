// src/aliases.ts — 별명 매칭. loadAliases()는 DB 의존이라 순수 함수만 검증한다.
process.env.DATABASE_URL ||= "postgres://placeholder:placeholder@127.0.0.1:5432/placeholder";

const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeQuery, aliasMatches, displayTitle, withoutGeunPrefix, artistMatches, displayArtist, setArtistAliasesForTest } = require("../../dist/aliases");

test("normalizeQuery: 공백 제거 + 소문자", () => {
  assert.equal(normalizeQuery("  Oshama  Scramble! "), "oshamascramble!");
  assert.equal(normalizeQuery("メランコリー"), "メランコリー");
  assert.equal(normalizeQuery("A B\tC\nD"), "abcd");
});

test("aliasMatches: 로드 전에는 항상 false (throw 없이)", () => {
  assert.equal(aliasMatches("Any Title", normalizeQuery("q")), false);
});

test("displayTitle: 번역 비활성 시 원제 그대로", () => {
  assert.equal(displayTitle("Original Title", false), "Original Title");
});

test("withoutGeunPrefix: /검색 이스터에그, 맨 앞 \"근\"을 뗀 검색어", () => {
  assert.equal(withoutGeunPrefix("근나리 해저담"), "나리 해저담");
  assert.equal(withoutGeunPrefix("  근 나리 해저담 "), "나리 해저담");
  assert.equal(withoutGeunPrefix("나리 해저담"), null);
  assert.equal(withoutGeunPrefix("근"), null);
  assert.equal(withoutGeunPrefix("근  "), null);
});

test("artistMatches·displayArtist: 아티스트 이름·별명으로 찾고, 번역 설정을 켠 사용자에게만 번역 이름", () => {
  setArtistAliasesForTest(new Map([["かめりあ", ["카메리아", "camellia"]]]), new Map([["かめりあ", "카메리아"]]));
  assert.equal(artistMatches("かめりあ", normalizeQuery("かめり")), true);
  assert.equal(artistMatches("かめりあ", normalizeQuery("카메")), true);
  assert.equal(artistMatches("かめりあ", normalizeQuery("Camellia")), true);
  assert.equal(artistMatches("かめりあ", normalizeQuery("LeaF")), false);
  assert.equal(artistMatches("LeaF", ""), false);
  assert.equal(displayArtist("かめりあ", true), "카메리아");
  assert.equal(displayArtist("かめりあ", false), "かめりあ");
  assert.equal(displayArtist("LeaF", true), "LeaF");
  setArtistAliasesForTest(new Map(), new Map());
});
