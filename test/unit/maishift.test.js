// src/maishift — seroval 응답 해석과 캐롤봇 기록 형식 변환. 네트워크·DB 없이 확인한다.
const test = require("node:test");
const assert = require("node:assert/strict");
const { decodeSeroval } = require("../../dist/maishift/serverFn.js");
const conv = require("../../dist/maishift/convert.js");
const catalog = require("../../dist/maishift/catalog.js");

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

// 공식 API 기록 응답
const apiRecords = {
  handle: "x", region: "intl", version: 26, syncedAt: "2026-10-18T05:29:00.000Z",
  records: [
    { chartId: 1, title: "Customized Justice", type: "DX", difficulty: "MASTER", level: "14+", internalLevel: 148, achievement: 1006147, combo: "FULL_COMBO", sync: "SYNC_PLAY", dxScore: 2885, dxScoreMax: 3228, rating: 333, ratingAccurate: true },
    { chartId: 2, title: "", type: "STANDARD", difficulty: "RE_MASTER", level: "13", internalLevel: 131, achievement: 1007878, combo: "ALL_PERFECT_PLUS", sync: "FULL_SYNC_DX_PLUS", dxScore: 2260, dxScoreMax: 2391, rating: 294, ratingAccurate: false },
  ],
  best: { new: [2], old: [1, 99] },
};

test("apiAllRecords: API 기록 → 캐롤봇 표기", () => {
  const [a, b] = conv.apiAllRecords(apiRecords, "intl");
  assert.deepEqual([a.diff, a.level, a.achievement, a.musicKind, a.fc, a.sync, a.constant, a.constantEstimated], ["MASTER", "14+", "100.6147%", "DX", "FC", "SYNC", 14.8, undefined]);
  assert.deepEqual([b.title, b.diff, b.musicKind, b.fc, b.sync, b.constantEstimated], ["\u3000", "Re:MASTER", "ST", "AP+", "FDX+", true]);
});

test("apiRatingTargets: best 의 신곡 → 구곡 순서, 없는 chartId 는 건너뛴다", () => {
  assert.deepEqual(conv.apiRatingTargets(apiRecords, "intl").map((r) => r.diff), ["Re:MASTER", "MASTER"]);
});

test("classRankNumber·courseRankNumber: DX NET 이미지 번호", () => {
  assert.equal(conv.classRankNumber("B5"), 0);
  assert.equal(conv.classRankNumber("SSS5"), 20);
  assert.equal(conv.classRankNumber("LEGEND"), 25);
  assert.equal(conv.courseRankNumber("DAN_3"), 3);
  assert.equal(conv.courseRankNumber("SHIN_DAN_4"), 15);
  assert.equal(conv.courseRankNumber("URA_KAIDEN"), 23);
  assert.equal(conv.courseRankNumber(null), undefined);
});

test("ratingTargets: 신곡 → 구곡 순서, 인덱스로 찾는다", () => {
  const rec = { profile: {}, tracks: { songs, tracks }, ratingsLatest: [1], ratingsOld: [0, 2] };
  assert.deepEqual(conv.ratingTargets(rec).map((r) => r.diff), ["Re:MASTER", "MASTER"]);
});

test("trophyClassOf", () => {
  assert.equal(conv.trophyClassOf("RAINBOW"), "rainbow");
  assert.equal(conv.trophyClassOf(undefined), "normal");
});

test("versionCode: maishift 세대 번호 → 캐롤봇 버전 코드", () => {
  assert.equal(catalog.versionCode(0), 10000);
  assert.equal(catalog.versionCode(9), 18500); // MURASAKi PLUS
  assert.equal(catalog.versionCode(12), 19900); // FiNALE
  assert.equal(catalog.versionCode(13), 20000); // でらっくす
  assert.equal(catalog.versionCode(25), 26000); // CiRCLE
  assert.equal(catalog.versionCode(26), 26500); // CiRCLE PLUS
  assert.equal(catalog.versionCode(27), 27000); // MAGiCAL
});

test("toCatalog: 제목별로 묶고 상수·장르·번역·이른 버전·보면 종류별 버전·폴더 순서", () => {
  const apiSongs = [
    { id: 1, title: "Customized Justice", artist: "Kobaryo", genre: "MAIMAI", type: "DX", version: 25, jacketUrl: "https://x/Music/a.png", titleTranslations: {}, charts: [{ id: 1, difficulty: "MASTER", level: "14+", internalLevel: 148 }] },
    { id: 2, title: "アイドル", artist: "YOASOBI", genre: "POPS_AND_ANIME", type: "STANDARD", version: 22, jacketUrl: "https://x/Music/b.png", titleTranslations: { ko: "아이돌", en: "Idol" }, charts: [{ id: 2, difficulty: "RE_MASTER", level: "13", internalLevel: 131 }, { id: 3, difficulty: "BASIC", level: "3", internalLevel: 30 }] },
    { id: 3, title: "アイドル", artist: "YOASOBI", genre: "POPS_AND_ANIME", type: "DX", version: 25, jacketUrl: "https://x/Music/b.png", titleTranslations: { ko: "아이돌" }, charts: [{ id: 9, difficulty: "MASTER", level: "13+", internalLevel: 135 }] },
  ];
  const list = catalog.toCatalog(apiSongs, new Map([["アイドル|DX", 4]]));
  const idol = list.find((s) => s.title === "アイドル");
  assert.equal(idol.version, 24500); // ST(BUDDiES PLUS)와 DX(CiRCLE) 중 이른 쪽
  assert.deepEqual(idol.kindVersions, { ST: 24500, DX: 26000 });
  assert.equal(idol.genre, "POPS＆アニメ");
  assert.equal(idol.korean, "아이돌");
  assert.deepEqual(idol.charts.map((c) => [c.kind, c.diff, c.constant, c.trackId]), [["ST", "Re:MASTER", 13.1, 2], ["ST", "BASIC", 3, 3], ["DX", "MASTER", 13.5, 9]]);
  assert.deepEqual(idol.folders, [{ kind: "DX", order: 4, version: 25 }]);
  assert.equal(list.find((s) => s.title === "Customized Justice").korean, undefined);
});

test("versionName: maishift 세대 번호 → 버전 이름", () => {
  assert.equal(catalog.versionName(12), "FiNALE");
  assert.equal(catalog.versionName(13), "でらっくす");
  assert.equal(catalog.versionName(22), "BUDDiES PLUS");
  assert.equal(catalog.versionName(26), "CiRCLE PLUS");
  assert.equal(catalog.versionName(27), "MAGiCAL");
  assert.equal(catalog.versionName(40), "ver.40");
});

// /히스토리 달성 기록: maishift 히스토리 내보내기 그림과 같은 규칙.
const hs = require("../../dist/historyStats.js");
const P = (day, rating, playTotal, versionId = 26) => ({ at: Date.parse(`${day}T12:00:00+09:00`), rating, playTotal, playCurrent: 0, versionId });

test("ratingThresholds: 단위별 기준값과 15250·15750", () => {
  const t = hs.ratingThresholds(16200);
  assert.ok(t.includes(13000) && t.includes(14500) && t.includes(15100) && t.includes(15250) && t.includes(16050) && t.includes(16200));
  assert.ok(!t.includes(13500) && !t.includes(14750) && !t.includes(16250));
});

test("ratingMilestones: 최근 4개 + 주요 단계 최근 3개, 첫 점에서 이미 넘은 값은 빼고, 한 번에 여러 기준을 넘으면 각각", () => {
  const history = [P("2025-01-01", 14200, 10), P("2025-02-01", 15010, 20), P("2026-03-13", 16000, 30), P("2026-03-29", 16110, 40), P("2026-04-19", 16160, 50), P("2026-05-05", 16200, 60)];
  const list = hs.ratingMilestones(history, 16900, history[history.length - 1].at);
  assert.deepEqual(list.map((m) => m.value), [14500, 15000, 16000, 16050, 16100, 16150, 16200]);
  assert.equal(list.find((m) => m.value === 16000).emphasised, true);
  assert.equal(list.find((m) => m.value === 16150).emphasised, false);
});

test("playMilestones: 4개 이하가 되는 가장 작은 단위", () => {
  const history = [P("2024-09-12", 0, 123), P("2025-08-12", 0, 1001), P("2026-05-22", 0, 2003), P("2026-10-11", 0, 2608)];
  assert.deepEqual(hs.playMilestones(history, 2608, history[3].at).map((m) => m.value), [1000, 2000]);
});

test("versionWeek: 출시 뒤 경과 주(내림)", () => {
  const versions = [{ id: 26, name: "CiRCLE PLUS", releasedAt: Date.parse("2026-07-22T22:00:00Z") }];
  assert.deepEqual(hs.versionWeek(Date.parse("2026-10-11T09:28:00Z"), 26, versions), { name: "CiRCLE PLUS", week: 11 });
  assert.equal(hs.versionWeek(0, 99, versions), null);
});

test("S-레이팅: 상수² × DX 별 ÷ 50, 평균으로 등급, 보면 값은 maishift 처럼 그대로 내림", () => {
  const s = require("../../dist/sRating.js");
  assert.deepEqual([84.9, 85, 90, 93, 95, 97].map(s.dxStars), [0, 1, 2, 3, 4, 5]);
  assert.equal(s.formatChartSRating(s.chartSRating(13.0, 97.14)), "16.89");
  assert.equal(s.formatChartSRating(s.chartSRating(14.1, 95.71)), "15.90");
  assert.equal(s.sRatingTier(14.570), "Platinum ✦✦");
  assert.equal(s.sRatingTier(5), null);
  assert.equal(s.formatSRating(728.5066 / 50), "14.570");
});

test("DX ✦ 랭크 소수점: maishift 와 같은 단계(97% ✦5, 98% ✦5.5, 99% ✦6, 100% ✦7)와 진행도 내림", () => {
  const s = require("../../dist/sRating.js");
  assert.equal(s.dxRankDecimal(2465, 2577), 4.3); // 95.65%
  assert.equal(s.dxRankDecimal(1358, 1398), 5); // 97.14%
  assert.equal(s.dxRankDecimal(985, 1000), 5.7);
  assert.equal(s.dxRankDecimal(1000, 1000), 7);
  assert.equal(s.dxRankDecimal(849, 1000), 0);
  assert.equal(s.dxRankLabel(2465, 2577, true), "4.3");
  assert.equal(s.dxRankLabel(2465, 2577, false), "4");
  // 소수점이 꺼져 있으면 maishift 곡 창 단계
  assert.deepEqual([96.9, 97, 98, 99, 99.5, 100].map(s.dxRankStep), [4, 5, 5.5, 6, 6.5, 7]);
  assert.equal(s.dxRankLabel(985, 1000, false), "5.5");
});
