// maishift 통계 API: 구간·백분위 계산, 분포 비율, 기억(한도가 모자라면 새로 받지 않음), 플레이리스트 번호 읽기.
const test = require("node:test");
const assert = require("node:assert/strict");

const stats = require("../../dist/maishift/stats.js");
const { costOf } = require("../../dist/maishift/api.js");
const { nextClears, meetsCriterion, pickRecommendations } = require("../../dist/bot/commands/songrec.js");

test("ratingBandOf: 13000 미만은 없음, 14000 부터 250 단위, 17000 이상은 마지막 구간", () => {
  assert.deepEqual([12999, 13000, 13999, 14000, 14249, 16380, 16999, 17500].map(stats.ratingBandOf),
    [null, "13000-13500", "13500-14000", "14000-14250", "14000-14250", "16250-16500", "16750-17000", "16750-17000"]);
});

test("topPercentOf: 내 레이팅 이상인 사람 비율, 구간 안은 고르게 퍼졌다고 본다", () => {
  const s = { activePlayers: 1000, histogram: { width: 100, bands: [
    { from: 15000, to: 15100, players: 600, suppressed: false },
    { from: 15100, to: 15200, players: 300, suppressed: false },
    { from: 15200, to: 15300, players: 100, suppressed: false },
    { from: 15300, to: 15400, players: null, suppressed: true },
  ] } };
  assert.equal(stats.topPercentOf(s, 15200), 10);
  assert.equal(stats.topPercentOf(s, 15150), 25);
  assert.equal(stats.topPercentOf(s, 14000), 100);
  assert.equal(stats.topPercentOf(s, 15400), 0);
  assert.equal(stats.topPercentOf({ activePlayers: 0, histogram: s.histogram }, 15000), null);
  assert.deepEqual([0.01, 8.72, 9.99, 12.1, 100].map(stats.formatTopPercent), ["0.1", "8.8", "10.0", "13", "100"]);
});

test("shareAtLeast: 달성률 구간을 위에서부터 더한다(100.5% 이상 AP 는 ALL_PERFECT 로)", () => {
  const counts = { LT_94: 10, AAA: 10, S: 10, S_PLUS: 10, SS: 10, SS_PLUS: 10, SSS: 10, SSS_PLUS_WITHOUT_AP: 15, ALL_PERFECT_PLUS: 5, FULL_COMBO: 0, FULL_COMBO_PLUS: 0, ALL_PERFECT: 10 };
  const stat = { chartId: 1, players: 100, suppressed: false, counts };
  assert.equal(stats.shareAtLeast(stat, 101), 0.05);
  assert.equal(stats.shareAtLeast(stat, 100.5), 0.3);
  assert.equal(stats.shareAtLeast(stat, 100), 0.4);
  assert.equal(stats.shareAtLeast(stat, 99), 0.6);
  assert.equal(stats.shareAtLeast({ ...stat, suppressed: true, counts: null }, 100), null);
});

test("clearBandOf·parsePlaylistId·costOf", () => {
  assert.deepEqual([[0, 10], [1, 10], [2, 10], [7, 10], [10, 10], [3, 0]].map(([a, b]) => stats.clearBandOf(a, b)), [0, 0, 1, 3, 4, 0]);
  assert.deepEqual(["123", "#45", " https://maimai.shiftpsh.com/ko/playlists/678?x=1 ", "/playlist/9", "abc", "0"].map(stats.parsePlaylistId), [123, 45, 678, 9, null, null]);
  assert.deepEqual(["/stats/ratings", "/stats/plates", "/stats/level-charts", "/stats/clear-ratios", "/stats/plate-difficulty", "/playlists/3", "/profiles/x", "/songs"].map(costOf), [6, 6, 15, 15, 30, 5, 5, 10]);
});

test("통계 기억: 한 번 받은 값은 다시 받지 않고, 남은 한도가 (비용 + 40) 보다 적으면 새로 받지 않는다", async (t) => {
  stats.clearStatsCache();
  const calls = [];
  let remaining = 120;
  t.mock.method(globalThis, "fetch", async (url) => {
    const u = new URL(String(url));
    calls.push(u.pathname);
    const body = u.pathname.endsWith("/stats/ratings")
      ? { region: "intl", computedAt: "", activeDays: 30, activePlayers: 10, maxPossibleRating: 16677, median: 15000, topPercentiles: [], histogram: { width: 100, bands: [{ from: 15000, to: 15100, players: 10, suppressed: false }] } }
      : { region: "intl", version: 26, band: { from: 16250, to: 16500 }, plates: [] };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", "x-ratelimit-limit": "120", "x-ratelimit-remaining": String(remaining) } });
  });
  const r1 = await stats.getRatingRank("intl", 15050);
  const r2 = await stats.getRatingRank("intl", 15050);
  assert.equal(r1.percent, 50);
  assert.deepEqual(r2, r1);
  assert.equal(calls.filter((p) => p.endsWith("/stats/ratings")).length, 1);
  // 한도가 50 남았다고 알려 주면(30 + 40 > 50) 플레이트 난이도는 받지 않는다.
  remaining = 50;
  await stats.getRatingStats("jp"); // 남은 한도 갱신용(6 + 40 ≤ 120 이라 받는다)
  const diff = await stats.getPlateDifficulty("intl", "16250-16500");
  assert.equal(diff, null);
  assert.equal(calls.filter((p) => p.endsWith("/stats/plate-difficulty")).length, 0);
  stats.clearStatsCache();
});

test("meetsCriterion·nextClears: 같은 단계 플레이어가 많이 깬 순, 이미 깬 보면은 뺀다", () => {
  const r = (title, achievementVal, fc = "") => ({ title, musicKind: "DX", diff: "MASTER", achievementVal, fc });
  assert.deepEqual([meetsCriterion(r("a", 100.2), "SSS"), meetsCriterion(r("a", 100.2), "SSS_PLUS"), meetsCriterion(r("a", 99, "FC+"), "FULL_COMBO"), meetsCriterion(r("a", 99, "FC"), "FULL_COMBO_PLUS"), meetsCriterion(undefined, "S")], [true, false, true, false, false]);
  const charts = [1, 2, 3, 4].map((id) => ({ id, title: `T${id}`, kind: "DX", diff: "MASTER", constant: 14 + id / 10 }));
  const clearMap = new Map([["T2|DX|MASTER", r("T2", 100.3)], ["T3|DX|MASTER", r("T3", 99.0)]]);
  const s = { players: 200, charts: [{ chartId: 1, cleared: 50, suppressed: false }, { chartId: 2, cleared: 190, suppressed: false }, { chartId: 3, cleared: 120, suppressed: false }, { chartId: 4, cleared: null, suppressed: true }] };
  const picks = nextClears(charts, clearMap, "SSS", s, 3);
  assert.deepEqual(picks.map((p) => [p.title, p.share]), [["T3", 0.6], ["T1", 0.25]]);
});

test("pickRecommendations: 같은 레이팅대 비율을 주면 비율을 결과에 붙이고, 비율 높은 보면을 더 자주 뽑는다", (t) => {
  const cand = (title, played) => ({ title, kind: "DX", diff: "MASTER", level: 14.5, currentAch: played ? 99 : 0, currentRS: 0, fc: "", played, isNew: false, minTarget: { name: "SSS", ach: 100, weight: 3 } });
  const pool = { candidates: [cand("Easy", true), cand("Hard", true)], newFloor: 0, oldFloor: 0 };
  const share = (key) => (key.startsWith("Easy") ? 0.9 : 0.05);
  let easyFirst = 0;
  const rnd = [0.1, 0.3, 0.5, 0.7, 0.85];
  for (const v of rnd) {
    t.mock.method(Math, "random", () => v);
    const [first] = pickRecommendations(pool, 1, { peerShare: share });
    if (first.title === "Easy") easyFirst++;
    assert.equal(first.peerShare, first.title === "Easy" ? 0.9 : 0.05);
    t.mock.restoreAll();
  }
  assert.ok(easyFirst >= 4, `Easy 가 ${easyFirst}/5 번 먼저 뽑힘`);
  // 통계가 없으면(peerShare 미지정) 비율을 붙이지 않는다.
  assert.equal(pickRecommendations(pool, 1)[0].peerShare, undefined);
});

test("matchPlaylists: 이름·주인·번호로 찾고, 많이 연 것부터", () => {
  const { matchPlaylists } = require("../../dist/maishift/playlistIndex.js");
  const list = [
    { id: 1, title: "카페밀크가 좋아요", owner: "shiftpsh", region: "ASIA", count: 4, seenAt: 100, uses: 1 },
    { id: 7, title: "14+ 연습", owner: "roena", region: "ASIA", count: 30, seenAt: 300, uses: 5 },
    { id: 12, title: "Cafe Milk 모음", owner: "someone", region: "JAPAN", count: 10, seenAt: 200, uses: 5 },
  ];
  assert.deepEqual(matchPlaylists(list, "").map((p) => p.id), [7, 12, 1]); // 많이 연 순, 같으면 최근 순
  assert.deepEqual(matchPlaylists(list, "카페 밀크").map((p) => p.id), [1]); // 띄어쓰기 무시
  assert.deepEqual(matchPlaylists(list, "ROENA").map((p) => p.id), [7]); // 주인
  assert.deepEqual(matchPlaylists(list, "#12").map((p) => p.id), [12]);
  assert.deepEqual(matchPlaylists(list, "https://maimai.shiftpsh.com/playlists/1").map((p) => p.id), [1]);
});

test("topPercentOf: 공개된 기준점 사이는 그 점들로 잇고, 상위 1% 위는 최고 레이팅까지 잇는다", () => {
  const s = {
    activePlayers: 1000, maxPossibleRating: 16700,
    histogram: { width: 100, bands: [{ from: 16600, to: 16700, players: 80, suppressed: false }] },
    topPercentiles: [{ percent: 10, players: 100, rating: 16300 }, { percent: 5, players: 50, rating: 16500 }, { percent: 1, players: 10, rating: 16600 }],
  };
  assert.equal(stats.topPercentOf(s, 16500), 5);
  assert.equal(stats.topPercentOf(s, 16400), 7.5);
  assert.equal(stats.topPercentOf(s, 16600), 1);
  assert.equal(stats.topPercentOf(s, 16650), 0.5);
  assert.equal(stats.topPercentOf(s, 16700), 0);
});
