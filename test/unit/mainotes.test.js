// src/mainotes/* — manifest 평탄화, 검색 인덱스, 채보 공급원 경계.
// 네트워크를 쓰지 않는다. fetch 는 테스트 안에서 갈아끼운다.
process.env.DATABASE_URL ||= "postgres://placeholder:placeholder@127.0.0.1:5432/placeholder";

const test = require("node:test");
const assert = require("node:assert/strict");
const { flatten, fetchManifest } = require("../../dist/mainotes/client");
const { setMainotesIndex, searchCharts, getChartById, indexSize } = require("../../dist/mainotes");
const { mainotesSource } = require("../../dist/mainotes/source");
const { resolveChart, ChartUnavailableError, makeChartKey } = require("../../dist/simai/source");

function manifest(overrides = {}) {
  return {
    generated_at: "2026-09-15T22:02:18.304Z",
    songs: {
      s1: { id: "s1", title: "Alpha", artist: "A", bpm: "180", genre: "POPS", version: "PRiSM", type: "deluxe" },
      s2: { id: "s2", title: "Beta", artist: "B", bpm: "150", genre: "POPS", version: "PRiSM", type: "standard" },
    },
    charts: [
      { id: "c1", song_id: "s1", difficulty: "MASTER", level: "13+", internal_level: 13.9, notes_designer: "D", has_chart_data: true, notes: 815 },
      { id: "c2", song_id: "s1", difficulty: "BASIC", level: "4", internal_level: 4, notes_designer: null, has_chart_data: false, notes: 120 },
      { id: "c3", song_id: "s2", difficulty: "Re:MASTER", level: "14", internal_level: 14.2, notes_designer: null, has_chart_data: true, notes: 900 },
    ],
    ...overrides,
  };
}

test("flatten: 난이도 이름을 내부 번호로 옮긴다", () => {
  const { charts } = flatten(manifest());
  assert.equal(charts.find((c) => c.id === "c1").difficulty, 4);   // MASTER
  assert.equal(charts.find((c) => c.id === "c2").difficulty, 1);   // BASIC
  assert.equal(charts.find((c) => c.id === "c3").difficulty, 5);   // Re:MASTER
});

test("flatten: 모르는 난이도와 곡 없는 채보는 버린다", () => {
  const m = manifest();
  m.charts.push({ id: "x1", song_id: "s1", difficulty: "UTAGE", level: "?", internal_level: null, notes_designer: null, has_chart_data: true, notes: 0 });
  m.charts.push({ id: "x2", song_id: "없는곡", difficulty: "MASTER", level: "13", internal_level: 13, notes_designer: null, has_chart_data: true, notes: 500 });
  const { charts } = flatten(m);
  assert.equal(charts.length, 3, "원래 3개만 남아야 한다");
  assert.ok(!charts.some((c) => c.id === "x1" || c.id === "x2"));
});

test("flatten: null 필드를 빈 값으로 채운다", () => {
  const { charts } = flatten(manifest());
  const c2 = charts.find((c) => c.id === "c2");
  assert.equal(c2.designer, "");
  assert.equal(typeof c2.internalLevel, "number");
});

test("flatten: has_chart_data 가 true 인 것만 hasData 다", () => {
  const { charts } = flatten(manifest());
  assert.deepEqual(charts.filter((c) => c.hasData).map((c) => c.id).sort(), ["c1", "c3"]);
});

function seed() {
  const { songs, charts } = flatten(manifest());
  const byId = new Map(songs.map((s) => [s.id, s]));
  setMainotesIndex(charts.map((c) => ({
    ...c, title: byId.get(c.songId).title, artist: byId.get(c.songId).artist, type: byId.get(c.songId).type,
  })));
}

test("searchCharts: 제목으로 찾고, 데이터 있는 채보를 앞에 둔다", () => {
  seed();
  assert.equal(indexSize(), 3);
  const hits = searchCharts("alpha");
  assert.equal(hits.length, 2);
  assert.equal(hits[0].hasData, true, "데이터 있는 채보가 먼저 와야 한다");
});

test("searchCharts: 대소문자와 공백을 무시한다", () => {
  seed();
  assert.equal(searchCharts("  ALPHA ").length, 2);
});

test("searchCharts: 빈 질의는 목록을 그대로 준다", () => {
  seed();
  assert.equal(searchCharts("").length, 3);
});

test("searchCharts: limit 을 넘지 않는다", () => {
  seed();
  assert.equal(searchCharts("", 1).length, 1);
});

test("getChartById: 없는 id 는 null", () => {
  seed();
  assert.equal(getChartById("없음"), null);
  assert.equal(getChartById("c1").title, "Alpha");
});

// ── 공급원 경계 ────────────────────────────────────────────────────────────
// 허락을 받기 전까지 mai-notes 채보 본문은 절대 나오면 안 된다.

test("mainotes 공급원: 데이터가 있어도 기본값에서는 no-permission (fetch 플래그 off)", async () => {
  seed();
  const { CONFIG } = require("../../dist/config");
  CONFIG.mainotesFetchCharts = false;
  await assert.rejects(
    () => mainotesSource.load("c1"),
    (e) => e instanceof ChartUnavailableError && e.reason === "no-permission",
  );
});

test("mainotes 공급원: 상대도 데이터가 없으면 no-data", async () => {
  seed();
  await assert.rejects(
    () => mainotesSource.load("c2"),
    (e) => e instanceof ChartUnavailableError && e.reason === "no-data",
  );
});

test("mainotes 공급원: 모르는 id 는 not-found", async () => {
  seed();
  await assert.rejects(
    () => mainotesSource.load("없음"),
    (e) => e instanceof ChartUnavailableError && e.reason === "not-found",
  );
});

test("resolveChart: 등록되지 않은 공급원은 not-found", async () => {
  await assert.rejects(
    () => resolveChart("어딘가:abc"),
    (e) => e instanceof ChartUnavailableError && e.reason === "not-found",
  );
});

test("resolveChart: 구분자 없는 키는 not-found", async () => {
  await assert.rejects(() => resolveChart("구분자없음"), (e) => e.reason === "not-found");
});

test("makeChartKey 와 resolveChart 의 키 형식이 맞물린다", async () => {
  seed();
  const { registerChartSource } = require("../../dist/simai/source");
  registerChartSource(mainotesSource);
  await assert.rejects(
    () => resolveChart(makeChartKey("mainotes", "c1")),
    (e) => e.reason === "no-permission",
  );
});

// ── HTTP ──────────────────────────────────────────────────────────────────

test("fetchManifest: etag 를 주면 If-None-Match 로 보낸다", async () => {
  const real = global.fetch;
  let seen = null;
  global.fetch = async (_url, init) => { seen = init.headers; return { status: 304, ok: false }; };
  try {
    const r = await fetchManifest('"abc"');
    assert.equal(r.changed, false);
    assert.equal(seen["If-None-Match"], '"abc"');
    assert.match(seen["User-Agent"], /^Carolbot\//, "누가 부르는지 밝혀야 한다");
  } finally { global.fetch = real; }
});

test("fetchManifest: etag 가 없으면 조건부 헤더를 붙이지 않는다", async () => {
  const real = global.fetch;
  let seen = null;
  global.fetch = async (_url, init) => {
    seen = init.headers;
    return { status: 200, ok: true, headers: new Map([["etag", '"z"']]), text: async () => JSON.stringify(manifest()) };
  };
  try {
    const r = await fetchManifest();
    assert.ok(!("If-None-Match" in seen));
    assert.equal(r.changed, true);
    assert.equal(r.manifest.charts.length, 3);
  } finally { global.fetch = real; }
});

test("fetchManifest: 형태가 다르면 거부한다", async () => {
  const real = global.fetch;
  global.fetch = async () => ({
    status: 200, ok: true, headers: new Map(), text: async () => JSON.stringify({ nope: true }),
  });
  try {
    await assert.rejects(() => fetchManifest(), /shape unexpected/);
  } finally { global.fetch = real; }
});

test("fetchManifest: HTTP 오류를 삼키지 않는다", async () => {
  const real = global.fetch;
  global.fetch = async () => ({ status: 500, ok: false });
  try {
    await assert.rejects(() => fetchManifest(), /HTTP 500/);
  } finally { global.fetch = real; }
});
