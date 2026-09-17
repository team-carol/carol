// src/simai/atwiki.ts — atwiki 채보 재구성/식별자/검증 (순수 로직).
process.env.DATABASE_URL ||= "postgres://placeholder:placeholder@127.0.0.1:5432/placeholder";

const test = require("node:test");
const assert = require("node:assert/strict");
const a = require("../../dist/simai/atwiki");
const { parseMaidata } = require("../../dist/simai/parse");

test("id / url 헬퍼 왕복", () => {
  assert.equal(a.atwikiChartId(592, 4), "atwiki-592-4");
  assert.deepEqual(a.parseAtwikiId("atwiki-592-4"), { page: 592, diff: 4 });
  assert.equal(a.parseAtwikiId("registry-1"), null);
  assert.equal(a.atwikiSourceUrl(592), "https://w.atwiki.jp/simai/pages/592.html");
  assert.equal(a.atwikiSourceUrlFromId("atwiki-592-4"), "https://w.atwiki.jp/simai/pages/592.html");
  assert.equal(a.atwikiSourceUrlFromId("nope"), null);
});

test("sanitizeSong: 정상 곡", () => {
  const s = a.sanitizeSong({
    page: 592, title: "前前前世", artist: "RADWIMPS", bpm: 190,
    charts: [
      { diff: 1, level: "4", designer: "", notes: "(190){4}1,2,3,4,E" },
      { diff: 4, level: "13", designer: "Jack", notes: "(190){8}1,2,3,4,5,6,7,8,E" },
    ],
  });
  assert.ok(s);
  assert.equal(s.page, 592);
  assert.equal(s.charts.length, 2);
  assert.deepEqual(s.charts.map((c) => c.diff), [1, 4]);
});

test("sanitizeSong: CJK 섞인 본문(코멘트 오수집)·중복·범위밖 난이도 거른다", () => {
  const s = a.sanitizeSong({
    page: 10, title: "T", artist: "", bpm: 0,
    charts: [
      { diff: 4, level: "13", designer: "x", notes: "(120){4}1,2,3,4,E" },
      { diff: 4, level: "13", designer: "dup", notes: "(120){4}5,6,7,8,E" }, // 중복 diff → 무시
      { diff: 6, level: "1", designer: "", notes: "(120){4}1,,,,E" },        // 범위밖 → 무시
      { diff: 2, level: "7", designer: "", notes: "名前: コメント" },          // CJK → 무시
    ],
  });
  assert.ok(s);
  assert.equal(s.charts.length, 1);
  assert.equal(s.charts[0].diff, 4);
});

test("sanitizeSong: 쓸 채보 없으면 null", () => {
  assert.equal(a.sanitizeSong({ page: 1, title: "x", charts: [] }), null);
  assert.equal(a.sanitizeSong({ page: 0, title: "x", charts: [{ diff: 4, notes: "(1){4}1,E" }] }), null);
  assert.equal(a.sanitizeSong(null), null);
});

test("buildMaidata → parseMaidata 왕복: 난이도별 노트가 살아난다", () => {
  const song = a.sanitizeSong({
    page: 592, title: "前前前世", artist: "RADWIMPS", bpm: 190,
    charts: [
      { diff: 1, level: "4", designer: "des1", notes: "(190){4}1,2,3,4,E" },
      { diff: 4, level: "13", designer: "Jack", notes: "(190){8}1,2,3,4,5,6,7,8,E" },
    ],
  });
  const maidata = a.buildMaidata(song);
  const parsed = parseMaidata(maidata);
  assert.equal(parsed.title, "前前前世");
  assert.equal(parsed.artist, "RADWIMPS");
  assert.equal(parsed.levels[1], "4");
  assert.equal(parsed.levels[4], "13");
  assert.equal(parsed.designers[4], "Jack");
  assert.ok(parsed.charts[1] && parsed.charts[1].notes.length === 4, "BASIC 4노트");
  assert.ok(parsed.charts[4] && parsed.charts[4].notes.length === 8, "MASTER 8노트");
});
