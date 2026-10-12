// src/maishift — seroval 응답 해석과 캐롤봇 기록 형식 변환. 네트워크·DB 없이 확인한다.
const test = require("node:test");
const assert = require("node:assert/strict");
const { decodeSeroval } = require("../../dist/maishift/serverFn.js");
const conv = require("../../dist/maishift/convert.js");

test("decodeSeroval: 숫자·문자열·상수·배열·객체·참조", () => {
  const node = { t: 10, i: 0, p: { k: ["a", "b", "c", "d", "e"], v: [
    { t: 0, s: 3 },
    { t: 1, s: "\\u003Cx\\u003E \\\"q\\\"" },
    { t: 2, s: 2 },
    { t: 9, i: 1, a: [{ t: 2, s: 0 }, { t: 0, s: 1 }] },
    { t: 4, i: 1 },
  ] }, o: 0 };
  const v = decodeSeroval(node);
  assert.deepEqual(v, { a: 3, b: '<x> "q"', c: true, d: [null, 1], e: [null, 1] });
  assert.equal(v.d, v.e);
});

test("decodeSeroval: 없는 아이디 응답", () => {
  const body = { t: 10, i: 0, p: { k: ["result", "error", "context"], v: [{ t: 10, i: 1, p: { k: ["error"], v: [{ t: 1, s: "Handle not found." }] }, o: 0 }, { t: 2, s: 1 }, { t: 11, i: 2, p: { k: [], v: [] }, o: 0 }] }, o: 0 };
  assert.deepEqual(decodeSeroval(body), { result: { error: "Handle not found." }, error: undefined, context: {} });
});

const songs = [
  { title: "Customized Justice", artist: "Kobaryo", jacketUrl: "https://x/Music/a.png", genre: "MAIMAI", songVersion: 25, type: "DX", titleTranslations: [] },
  { title: "アイドル", artist: "YOASOBI", jacketUrl: "https://x/Music/b.png", genre: "POPS_AND_ANIME", songVersion: 22, type: "STANDARD", titleTranslations: [{ title: "아이돌", language: "KOREAN" }, { title: "Idol", language: "ENGLISH" }] },
];
const tracks = [
  { s: 0, i: 1, d: "MASTER", l: 148, r: { a: 1006147, d: 2885, m: 3228, g: 333.17, c: "FULL_COMBO", y: "SYNC_PLAY" } },
  { s: 1, i: 2, d: "RE_MASTER", l: 131, p: 1, r: { a: 1007878, d: 2260, m: 2391, g: 294.9, c: "ALL_PERFECT_PLUS", y: "FULL_SYNC_DX_PLUS" } },
  { s: 1, i: 3, d: "BASIC", l: 30 },
];

test("toPlayRecord: 난이도·레벨·달성률·마크를 캐롤봇 표기로", () => {
  const r = conv.toPlayRecord(songs[0], tracks[0]);
  assert.equal(r.diff, "MASTER");
  assert.equal(r.level, "14+");
  assert.equal(r.achievementVal, 100.6147);
  assert.equal(r.achievement, "100.6147%");
  assert.equal(r.musicKind, "DX");
  assert.equal(r.fc, "FC");
  assert.equal(r.sync, "SYNC");
  const s = conv.toPlayRecord(songs[1], tracks[1]);
  assert.equal(s.diff, "Re:MASTER");
  assert.equal(s.level, "13");
  assert.equal(s.musicKind, "ST");
  assert.equal(s.fc, "AP+");
  assert.equal(s.sync, "FDX+");
});

test("toPlayRecord: 빈 제목 곡은 전각 공백 제목으로", () => {
  assert.equal(conv.toPlayRecord({ ...songs[0], title: "" }, tracks[0]).title, "\u3000");
});

test("allRecords: 플레이한 보면만", () => {
  assert.deepEqual(conv.allRecords({ songs, tracks }).map((r) => r.title), ["Customized Justice", "アイドル"]);
});

test("ratingTargets: 신곡 → 구곡 순서, 인덱스로 찾는다", () => {
  const rec = { profile: {}, tracks: { songs, tracks }, ratingsLatest: [1], ratingsOld: [0, 2] };
  assert.deepEqual(conv.ratingTargets(rec).map((r) => r.diff), ["Re:MASTER", "MASTER"]);
});

test("koreanTitles·trophyClassOf", () => {
  assert.deepEqual([...conv.koreanTitles(songs)], [["アイドル", "아이돌"]]);
  assert.equal(conv.trophyClassOf("RAINBOW"), "rainbow");
  assert.equal(conv.trophyClassOf(undefined), "normal");
});
