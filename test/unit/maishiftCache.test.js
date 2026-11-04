// maishift 메모리 캐시의 확인 주기·요청 수. fetch 를 바꿔 끼워 엔드포인트별 요청 수를 세고, Date 를 흉내 내 시간을 넘긴다.
// 사용자마다 다른 아이디를 써서 테스트끼리 캐시가 섞이지 않게 한다.
const test = require("node:test");
const assert = require("node:assert/strict");
const { mock } = test;

const storage = require("../../dist/storage");
// 새 기록을 받으면 성과를 DB 에 반영하는데(sync.ts), 연동한 사용자가 없다고 해 DB 에 닿지 않게 한다.
storage.getMaishiftUsers = async () => [];
const maishift = require("../../dist/maishift");
maishift.initMaishift();

const MIN = 60 * 1000;
mock.timers.enable({ apis: ["Date"], now: Date.UTC(2026, 10, 4, 3, 0, 0) });

/** handle → { syncedAt, snapshots, profileStatus, snapshotsStatus } */
const players = new Map();
let calls = [];
let remainingHeader = 120;
const count = (handle, what) => calls.filter((c) => c.handle === handle && c.what === what).length;

function player(handle, opts = {}) {
  const syncedAt = "2026-11-01T01:58:00.000Z";
  const p = { syncedAt, snapshots: [{ id: 1, syncedAt, rating: 15000, version: 25 }], profileStatus: 200, snapshotsStatus: 200, ...opts };
  players.set(handle, p);
  return p;
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "x-ratelimit-limit": "120", "x-ratelimit-remaining": String(remainingHeader) } });
}

globalThis.fetch = async (url) => {
  const u = new URL(String(url));
  const m = u.pathname.match(/^\/api\/v1\/profiles\/([^/]+)(\/records|\/snapshots)?$/);
  if (!m) return json(500, { error: { code: "internal", message: `unexpected ${u.pathname}` } });
  const handle = decodeURIComponent(m[1]);
  const what = m[2] === "/records" ? "records" : m[2] === "/snapshots" ? "snapshots" : "profile";
  calls.push({ handle, what });
  const p = players.get(handle);
  if (!p) return json(404, { error: { code: "not_found", message: "Player not found" } });
  const status = what === "snapshots" ? p.snapshotsStatus : p.profileStatus;
  if (status === 403) return json(403, { error: { code: "not_public", message: "User record is not public." } });
  if (what === "snapshots") return json(200, { handle, region: "intl", snapshots: p.snapshots, nextCursor: null });
  if (what === "records") return json(200, { handle, region: "intl", version: 25, syncedAt: p.syncedAt, records: [], best: { new: [], old: [] } });
  return json(200, {
    handle, region: "intl", regions: ["intl"],
    profile: { name: handle.toUpperCase(), rating: 15000, iconUrl: "", title: { text: "", tier: "NORMAL" }, classRank: "", courseRank: null, stars: 0, playCount: { total: 1, current: 1 }, friendCode: null, syncedAt: p.syncedAt },
  });
};

const lookup = (handle) => storage.getCachedProfile(`ms:intl:${handle}`);

test("이전 기록 공개: 1분마다 업로드 목록만 보고, 그대로면 프로필·전체 기록을 받지 않는다", async () => {
  player("alice");
  assert.equal((await lookup("alice")).playerName, "ALICE");
  assert.deepEqual([count("alice", "profile"), count("alice", "snapshots"), count("alice", "records")], [1, 1, 1]);

  mock.timers.tick(30 * 1000);
  await lookup("alice");
  assert.equal(calls.filter((c) => c.handle === "alice").length, 3, "1분 안에는 묻지 않는다");

  mock.timers.tick(31 * 1000);
  await lookup("alice");
  assert.deepEqual([count("alice", "profile"), count("alice", "snapshots"), count("alice", "records")], [1, 2, 1]);
});

test("새 업로드: 업로드 목록이 바뀌면 프로필·전체 기록을 받고, 업로드 목록은 다시 받지 않는다", async () => {
  const p = player("bob");
  await lookup("bob");
  mock.timers.tick(MIN + 1000);
  p.syncedAt = "2026-11-04T03:00:30.000Z";
  p.snapshots = [{ id: 2, syncedAt: p.syncedAt, rating: 15010, version: 25 }, ...p.snapshots];
  const profile = await lookup("bob");
  assert.equal(profile.lastSyncedAt, Date.parse(p.syncedAt));
  assert.deepEqual([count("bob", "profile"), count("bob", "snapshots"), count("bob", "records")], [2, 2, 2]);
});

test("프로필은 5분마다 한 번은 확인한다(업로드 없이 바꾼 설정 반영)", async () => {
  player("carol");
  await lookup("carol");
  mock.timers.tick(5 * MIN + 1000);
  await lookup("carol");
  // 업로드 시각이 그대로라 전체 기록은 다시 받지 않는다.
  assert.deepEqual([count("carol", "profile"), count("carol", "snapshots"), count("carol", "records")], [2, 2, 1]);
});

test("이전 기록 비공개: 업로드 목록을 못 보므로 5분마다만 확인한다", async () => {
  player("dave", { snapshotsStatus: 403 });
  const profile = await lookup("dave");
  assert.equal(profile.maishiftPastPublic, false);
  mock.timers.tick(MIN + 1000);
  await lookup("dave");
  assert.equal(count("dave", "profile"), 1, "1분 뒤에는 묻지 않는다");
  mock.timers.tick(4 * MIN);
  await lookup("dave");
  assert.equal(count("dave", "profile"), 2);
});

test("비공개·없는 아이디: 5분 동안 다시 묻지 않고, 연동 확인(lookupMaishift)은 바로 묻는다", async () => {
  player("erin", { profileStatus: 403, snapshotsStatus: 403 });
  assert.equal(await lookup("erin"), null);
  const first = calls.filter((c) => c.handle === "erin").length;
  assert.equal(await lookup("erin"), null);
  assert.equal(calls.filter((c) => c.handle === "erin").length, first, "기억하는 동안은 요청하지 않는다");
  assert.equal(maishift.isProfilePrivate({ handle: "erin", server: "intl" }), true);

  await assert.rejects(maishift.lookupMaishift({ handle: "erin", server: "intl" }), (e) => e.kind === "private");
  assert.equal(count("erin", "profile"), 2);

  // 없는 아이디도 같다.
  assert.equal(await lookup("nobody"), null);
  assert.equal(await lookup("nobody"), null);
  assert.equal(count("nobody", "profile"), 1);

  mock.timers.tick(5 * MIN + 1000);
  assert.equal(await lookup("erin"), null);
  assert.equal(count("erin", "profile"), 3, "기억이 지나면 다시 묻는다");
});

test("남은 한도가 적으면 가벼운 확인을 멈추고 5분마다만 확인한다", async () => {
  player("frank");
  await lookup("frank");
  mock.timers.tick(MIN + 1000);
  // 다른 사용자 요청으로 남은 한도가 거의 바닥났다는 응답을 받는다.
  remainingHeader = 5;
  player("grace");
  await lookup("grace");
  await lookup("frank");
  assert.equal(calls.filter((c) => c.handle === "frank").length, 3, "한도가 적으면 1분이 지나도 묻지 않는다");
  remainingHeader = 120;
});
