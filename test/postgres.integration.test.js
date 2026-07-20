const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync, spawn } = require("node:child_process");
const { Client } = require("pg");

let temporaryPostgresSequence = 0;
async function temporaryPostgres() {
  if (process.env.TEST_DATABASE_URL) return { url: process.env.TEST_DATABASE_URL, stop: async () => {} };
  const name = `carol-pg-${process.pid}-${++temporaryPostgresSequence}`;
  // A failed prior run must not make this test attach to an unrelated
  // container with the same deterministic name.
  try { execFileSync("docker", ["rm", "-f", name], { stdio: "ignore" }); } catch {}
  execFileSync("docker", ["run", "--rm", "-d", "--name", name, "-e", "POSTGRES_PASSWORD=test", "-e", "POSTGRES_DB=carol", "-p", "127.0.0.1::5432", "postgres:16"], { stdio: "ignore" });
  const port = execFileSync("docker", ["port", name, "5432/tcp"], { encoding: "utf8" }).trim().match(/:(\d+)$/)[1];
  const url = `postgres://postgres:test@127.0.0.1:${port}/carol`;
  // pg_isready inside the container also reports the short-lived initdb
  // server.  Verify a real host connection and retry until the final server
  // has survived a complete connect/query/close cycle.
  let connected = false;
  for (let i = 0; i < 90; i++) {
    const client = new Client({ connectionString: url });
    try { await client.connect(); await client.query("SELECT 1"); await client.end(); connected = true; break; }
    catch { try { await client.end(); } catch {} await new Promise((resolve) => setTimeout(resolve, 500)); }
  }
  if (!connected) {
    try { execFileSync("docker", ["rm", "-f", name], { stdio: "ignore" }); } catch {}
    throw new Error(`temporary postgres host connection failed after 90 retries (${url}, container ${name})`);
  }
  return { url, stop: async () => { try { execFileSync("docker", ["rm", "-f", name], { stdio: "ignore" }); } catch {} } };
}

test("PostgreSQL achievement log and durable projection", async () => {
  const pg = await temporaryPostgres();
  process.env.DATABASE_URL = pg.url;
  const { PostgresStorage } = require("../dist/storage/postgres");
  const db = new PostgresStorage(pg.url);
  const event = (id, chartKey, score, playedAt, extra = {}) => ({ profileKey: extra.profileKey || "integration", sourcePlayId: id, chartKey, playedAt, sourceSequence: Number(id) || 1, recordJson: JSON.stringify({ title: chartKey, musicKind: "DX", diff: "MASTER" }), achievementVal: score, fc: extra.fc || "", sync: extra.sync || "", ratingUp: extra.ratingUp, isNewScore: extra.isNewScore, title: chartKey, diff: "MASTER", level: "13+", musicKind: "DX", achievementText: `${score}%` });
  const start = Date.UTC(2026, 0, 1, 19); // 2026-01-02 04:00 KST
  try {
    await db.initialize();
    await db.setAchievementMinimum("integration", 0);
    await db.saveAchievementPlayEventLogBatch([event("1", "chart-a", 90, start - 1)]); // baseline
    assert.equal((await db.getAchievementPlayEventLog("integration"))[0].isBaseline, 1);
    assert.equal((await db.getDailyAchievementSummaries("integration", start - 10, start + 10)).length, 0);

    await db.cacheProfile({ playerName: "migrated", rating: 1, ratingMax: 1, gradeImg: "", avatar: "", trophy: "", trophyClass: "", stars: "", playCount: 1, friendCode: "migrated" }, 1);
    const migratedKey = "intl:migrated";
    assert.equal(await db.hasAchievementEventLogState(migratedKey), false);
    assert.equal(await db.saveAchievementPlayEventLogBatch([event("migrated-1", "migrated-chart", 80, start, { profileKey: migratedKey, isNewScore: true })], Date.now(), true), "ok");
    const migratedEvent = (await db.getAchievementPlayEventLog(migratedKey))[0];
    assert.equal(migratedEvent.isBaseline, 0);
    assert.equal(migratedEvent.isMeaningful, 1);
    assert.equal(await db.hasAchievementEventLogState(migratedKey), true);
    await db.saveAchievementPlayEventLogBatch([
      event("2", "chart-a", 95, start + 1, { ratingUp: 12 }),
      event("3", "chart-a", 93, start + 2, { ratingUp: 99 }), // regression
      event("4", "chart-b", 80, start + 3, { isNewScore: true }),
      event("5", "chart-b", 79, start + 4, { fc: "FC" }), // lower score, FC improvement
      event("6", "chart-c", 70, start + 5, { sync: "FDX", ratingUp: 7, isNewScore: true }),
      event("7", "chart-c", 71, start + 6, { sync: "FDX", ratingUp: 8 }), // same-chart latest representative
      event("8", "chart-boundary", 99, start + 24 * 60 * 60 * 1000, { isNewScore: true }), // next day 04:00
    ]);
    const raw = await db.getAchievementPlayEventLog("integration");
    assert.equal(raw.length, 8);
    assert.equal((await db.getAchievementPlayEventLog("integration", start, start + 24 * 60 * 60 * 1000)).length, 6);
    const summaries = await db.getDailyAchievementSummaries("integration", start, start + 24 * 60 * 60 * 1000);
    assert.deepEqual(summaries.map((x) => x.chartKey).sort(), ["chart-a", "chart-b", "chart-c"]);
    assert.equal(summaries.find((x) => x.chartKey === "chart-a").achievementGain, 5);
    assert.equal(summaries.find((x) => x.chartKey === "chart-b").achievementGain, 0);
    assert.equal(summaries.find((x) => x.chartKey === "chart-c").sync, "FDX");
    assert.equal(summaries.find((x) => x.chartKey === "chart-c").ratingUp, 8);
    assert.equal((await db.getDailyAchievementSummaries("integration", start + 24 * 60 * 60 * 1000, start + 48 * 60 * 60 * 1000)).length, 1);

    // A lower score is still meaningful for FC and FDX -> FDX+, but a plain
    // regression is not.  A new chart has a finite gain rather than Infinity.
    await db.saveAchievementPlayEventLogBatch([
      event("9", "chart-a", 94, start + 10, { fc: "AP" }),
      event("10", "chart-c", 69, start + 11, { sync: "FDX+" }),
      event("11", "new-chart", 73, start + 12, { isNewScore: true }),
      event("12", "sync-rank", 72, start + 13, { sync: "FS", isNewScore: true }),
      event("13", "sync-rank", 71, start + 14, { sync: "FS+" }),
      event("14", "sync-rank", 70, start + 15, { sync: "FS" }), // lower rank must not replace FS+
    ]);
    const later = await db.getDailyAchievementSummaries("integration", start, start + 24 * 60 * 60 * 1000);
    assert.equal(later.find((x) => x.chartKey === "chart-a").achievementGain, 0);
    assert.equal(later.find((x) => x.chartKey === "chart-c").sync, "FDX+");
    assert.equal(later.find((x) => x.chartKey === "new-chart").achievementGain, 73);
    assert.equal(later.find((x) => x.chartKey === "sync-rank").sync, "FS+");
    assert.ok(later.every((x) => Number.isFinite(x.achievementGain)));

    // Duplicate source IDs are idempotent and only fill a missing rating_up.
    await db.saveAchievementPlayEventLogBatch([event("2", "chart-a", 95, start + 1, { ratingUp: 42 })]);
    assert.equal((await db.getAchievementPlayEventLog("integration")).find((x) => x.sourcePlayId === "2").ratingUp, 12);
    assert.equal(typeof (await db.getAchievementPlayEventLog("integration"))[0].playedAt, "number");
    await db.saveAchievementPlayEventLogBatch([
      event("16", "unseen-no", 80, start + 20),
      event("15", "unseen-yes", 81, start + 19, { isNewScore: true }),
    ]);
    const unseen = await db.getDailyAchievementSummaries("integration", start, start + 24 * 60 * 60 * 1000);
    assert.equal(unseen.some((x) => x.chartKey === "unseen-no"), false);
    assert.equal(unseen.find((x) => x.chartKey === "unseen-yes").achievementGain, 81);
    await db.cacheProfile({ playerName: "numbers", rating: 1, ratingMax: 1, gradeImg: "", avatar: "", trophy: "", trophyClass: "", stars: "", playCount: 1, friendCode: "numbers" }, 1);
    assert.equal(typeof (await db.getCachedProfile("intl:numbers")).lastSyncedAt, "number");
    assert.equal(typeof (await db.getAllCachedProfiles()).find((x) => x.profileKey === "intl:numbers").lastSyncedAt, "number");
    assert.equal(typeof (await db.getLastSyncTime()), "number");
    await db.pool.query("INSERT INTO sessions(discord_user_id,friend_code,friend_code_intl,friend_code_jp) VALUES ('server-user','intl-code','intl-code','jp-code')");
    await db.setUserDefaultServer("server-user", "jp");
    assert.equal(await db.getUserFriendCode("server-user"), "jp-code");
    const { initEncryption } = require("../dist/crypto");
    initEncryption("integration-test-key");
    await db.getUserSyncToken("first-jp-user");
    await db.saveUserSession("first-jp-user", "{}", "jp-first-code", "jp");
    assert.equal(await db.getUserFriendCode("first-jp-user"), "jp-first-code");
    assert.equal(await db.getUserDefaultServer("first-jp-user"), "jp");
    await db.pool.query("UPDATE sessions SET default_server='intl', friend_code='intl-code', friend_code_intl='intl-code', friend_code_jp='' WHERE discord_user_id='server-user'");
    await db.saveUserSession("server-user", "{}", "jp-code", "jp");
    assert.equal(await db.getUserFriendCode("server-user"), "intl-code");

    // Conflicting IDs fail before BEGIN can leave either rows or the marker.
    await assert.rejects(() => db.saveAchievementPlayEventLogBatch([
      { ...event("conflict", "x", 1, start), profileKey: "rollback" },
      { ...event("conflict", "y", 2, start + 1), profileKey: "rollback" },
    ]));
    assert.equal((await db.getAchievementPlayEventLog("rollback")).length, 0);
    assert.equal(await db.hasAchievementEventLogState("rollback"), false);
    const fresh = new (require("../dist/storage/postgres").PostgresStorage)(pg.url);
    await fresh.initialize();
    assert.equal(await fresh.hasAchievementEventLogState("never-initialized"), false);
    await fresh.close();
  } finally { await db.close(); await pg.stop(); }
});

test("accepts legacy v1 migration checksum without rewriting it", async () => {
  const pg = await temporaryPostgres();
  process.env.DATABASE_URL = pg.url;
  const legacyChecksum = "legacy-whole-schema-checksum";
  const client = new Client({ connectionString: pg.url });
  try {
    await client.connect();
    await client.query("CREATE TABLE storage_migrations (version integer PRIMARY KEY, applied_at bigint NOT NULL, checksum text NOT NULL)");
    await client.query("INSERT INTO storage_migrations VALUES (1, $1, $2)", [Date.now(), legacyChecksum]);
    await client.query(`CREATE TABLE achievement_play_event_log (event_key text PRIMARY KEY, profile_key text NOT NULL, source_play_id text NOT NULL, is_baseline integer NOT NULL, played_at bigint NOT NULL, source_sequence integer NOT NULL, captured_at bigint NOT NULL, source_kind text DEFAULT 'history', achievement_val double precision NOT NULL, fc text DEFAULT '', sync text DEFAULT '', rating_up double precision, title text DEFAULT '', diff text DEFAULT '', level text DEFAULT '', music_kind text DEFAULT '', achievement_text text DEFAULT '', record_json text NOT NULL, payload_hash text NOT NULL)`);
    await client.query(`INSERT INTO achievement_play_event_log VALUES ('legacy-event','upgrade-profile','old-play',0,1000,1,1000,'history',100,'AP','',NULL,'legacy-title','MASTER','13','DX','100%','{}','old-hash')`);
    const { PostgresStorage } = require("../dist/storage/postgres");
    const db = new PostgresStorage(pg.url);
    try {
      await db.initialize();
      const row = (await client.query("SELECT checksum FROM storage_migrations WHERE version=1")).rows[0];
      assert.equal(row.checksum, legacyChecksum);
      assert.deepEqual((await client.query("SELECT to_regclass('profiles') AS name")).rows[0].name, "profiles");
      assert.deepEqual((await client.query("SELECT to_regclass('achievement_chart_best') AS name")).rows[0].name, "achievement_chart_best");
      const dbEvent = { profileKey: "upgrade-profile", sourcePlayId: "new-play", chartKey: "legacy-title|DX|MASTER", playedAt: 2000, sourceSequence: 2, recordJson: "{}", achievementVal: 99, fc: "", sync: "", title: "legacy-title", diff: "MASTER", level: "13", musicKind: "DX", achievementText: "99%" };
      await db.saveAchievementPlayEventLogBatch([dbEvent]);
      assert.equal((await db.getDailyAchievementSummaries("upgrade-profile", 0, 3000)).length, 0);
    } finally { await db.close(); }
  } finally { try { await client.end(); } catch {} await pg.stop(); }
});
