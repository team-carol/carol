const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
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

// 현행 성과 추적: 매 동기화마다 전체 클리어 스냅샷을 chart_clears 에 upsert하면서
// 직전 값과 원자적으로 비교(upsertChartClears) → 오른 채보만 achievement_play_event_log 에
// 이벤트로 기록 → getDailyAchievementSummaries 가 하루 창에서 채보별 dedup + 최소 달성률 필터.
test("chart_clears diff → 이벤트 로그 → 일일 성과 요약", async () => {
  const pg = await temporaryPostgres();
  process.env.DATABASE_URL = pg.url;
  const { PostgresStorage } = require("../dist/storage/postgres");
  const db = new PostgresStorage(pg.url);

  const KEY = "intl:diffuser";
  const DAY0 = Date.UTC(2026, 0, 1, 19); // 2026-01-02 04:00 KST
  const DAY = 24 * 60 * 60 * 1000;
  const cc = (chartKey, ach, fc = "", sync = "") => ({ chartKey, achievementVal: ach, fc, sync });
  const ev = (id, chartKey, ach, before, playedAt, extra = {}) => ({
    profileKey: extra.profileKey || KEY,
    sourcePlayId: id, chartKey, playedAt, sourceSequence: Number(id) || 1,
    recordJson: "{}", achievementVal: ach, achievementBefore: before,
    fc: extra.fc || "", sync: extra.sync || "", ratingUp: extra.ratingUp,
    title: chartKey, diff: "MASTER", level: "13+", musicKind: "DX", achievementText: `${ach}%`,
  });

  try {
    await db.initialize();

    // ── upsertChartClears: 직전 스냅샷이 없으면 (chart_clears 비어있음) 친 채보가 전부 "신규" ──
    const first = await db.upsertChartClears(KEY, [
      cc("A|DX|MASTER", 90),
      cc("B|DX|MASTER", 0),        // 클리어 안 한 채보 → diff 아님
      cc("C|DX|MASTER", 80, "FC"),
    ]);
    assert.deepEqual(first.map((d) => d.chartKey).sort(), ["A|DX|MASTER", "C|DX|MASTER"]);
    assert.equal(first.find((d) => d.chartKey === "A|DX|MASTER").achievementBefore, 0);

    // ── 2번째: 실제로 오른 것만 돌아온다 ──
    const second = await db.upsertChartClears(KEY, [
      cc("A|DX|MASTER", 95),              // 90 → 95 달성률 상승
      cc("B|DX|MASTER", 0),               // 여전히 0
      cc("C|DX|MASTER", 80, "AP"),        // 같은 %, FC → AP 콤보 등급 상승
      cc("E|DX|MASTER", 60, "", "FS"),    // 신규 채보 + FS(sync rank 2)
    ]);
    assert.deepEqual(second.map((d) => d.chartKey).sort(), ["A|DX|MASTER", "C|DX|MASTER", "E|DX|MASTER"]);
    assert.equal(second.find((d) => d.chartKey === "A|DX|MASTER").achievementBefore, 90);
    assert.equal(second.find((d) => d.chartKey === "C|DX|MASTER").achievementBefore, 80);

    // 변화 없으면 빈 배열
    assert.deepEqual(await db.upsertChartClears(KEY, [cc("A|DX|MASTER", 95), cc("C|DX|MASTER", 80, "AP")]), []);

    // ── 순수 SYNC(rank 1)는 성과 트리거 아님, FS(rank 2)로 올라가야 인정 ──
    assert.deepEqual((await db.upsertChartClears(KEY, [cc("D|DX|MASTER", 70)])).map((d) => d.chartKey), ["D|DX|MASTER"]);
    assert.deepEqual(await db.upsertChartClears(KEY, [cc("D|DX|MASTER", 70, "", "SYNC")]), []);
    assert.deepEqual((await db.upsertChartClears(KEY, [cc("D|DX|MASTER", 70, "", "FS")])).map((d) => d.chartKey), ["D|DX|MASTER"]);

    // ── achievement_play_event_log 기록 ──
    await db.saveAchievementPlayEventLogBatch([
      ev("1", "A|DX|MASTER", 95, 90, DAY0 + 1, { ratingUp: 12 }),
      ev("2", "C|DX|MASTER", 80, 80, DAY0 + 2, { fc: "AP" }), // 점수 상승 없음, 마크만
      ev("3", "E|DX|MASTER", 60, 0, DAY0 + 3, { sync: "FS" }),
      ev("4", "F|DX|MASTER", 50, 0, DAY0 + 4), // 임계 미만 + 마크 없음
      ev("5", "G|DX|MASTER", 99, 88, DAY0 + DAY + 5), // 다음 플레이데이
    ]);
    const raw = await db.getAchievementPlayEventLog(KEY);
    assert.equal(raw.length, 5);
    assert.equal(raw.every((x) => x.isBaseline === 0 && x.isMeaningful === 1), true);
    assert.equal(raw.every((x) => typeof x.playedAt === "number"), true);
    // 시간 창은 [from, to)
    assert.equal((await db.getAchievementPlayEventLog(KEY, DAY0, DAY0 + DAY)).length, 4);
    const e1 = raw.find((x) => x.sourcePlayId === "1");
    assert.equal(e1.scoreGain, 5);
    assert.equal(e1.achievementBefore, 90);
    assert.equal(e1.ratingGain, 12); // ratingUp 그대로
    assert.equal(raw.find((x) => x.sourcePlayId === "2").scoreGain, 0);

    // dedup: 같은 sourcePlayId 재전송 → 중복 안 됨. 이미 있는 rating_up 은 덮어쓰지 않음
    await db.saveAchievementPlayEventLogBatch([ev("1", "A|DX|MASTER", 95, 90, DAY0 + 1, { ratingUp: 999 })]);
    assert.equal((await db.getAchievementPlayEventLog(KEY)).length, 5);
    assert.equal((await db.getAchievementPlayEventLog(KEY)).find((x) => x.sourcePlayId === "1").ratingUp, 12);

    // ── getDailyAchievementSummaries: discord 유저 → 프로필 매핑에 sessions 행 필요 ──
    await db.pool.query("INSERT INTO sessions(discord_user_id,friend_code,default_server) VALUES ('disc-1','diffuser','intl')");
    await db.setAchievementMinimum("disc-1", 90);
    const day1 = await db.getDailyAchievementSummaries("disc-1", DAY0, DAY0 + DAY);
    // A(95≥90), C(AP 마크), E(FS) 통과 · F(50, 마크 없음) 탈락
    assert.deepEqual(day1.map((x) => x.chartKey).sort(), ["A|DX|MASTER", "C|DX|MASTER", "E|DX|MASTER"]);
    assert.equal(day1.find((x) => x.chartKey === "A|DX|MASTER").achievementGain, 5);
    assert.equal(day1.find((x) => x.chartKey === "A|DX|MASTER").achievementAfter, 95);
    assert.equal(day1.find((x) => x.chartKey === "C|DX|MASTER").achievementGain, 0);

    // 다음 플레이데이엔 G 하나
    assert.deepEqual((await db.getDailyAchievementSummaries("disc-1", DAY0 + DAY, DAY0 + 2 * DAY)).map((x) => x.chartKey), ["G|DX|MASTER"]);

    // 임계값이 "순수 달성률" 항목을 거른다: 96으로 올리면 A(마크 없음)는 빠지고 C·E만 남음
    await db.setAchievementMinimum("disc-1", 96);
    assert.deepEqual((await db.getDailyAchievementSummaries("disc-1", DAY0, DAY0 + DAY)).map((x) => x.chartKey).sort(), ["C|DX|MASTER", "E|DX|MASTER"]);

    // 채보별 dedup: played_at 가 가장 늦은 이벤트가 그 채보를 대표
    await db.saveAchievementPlayEventLogBatch([ev("6", "C|DX|MASTER", 82, 80, DAY0 + 100, { fc: "AP", sync: "FS+" })]);
    await db.setAchievementMinimum("disc-1", 90);
    const dedup = await db.getDailyAchievementSummaries("disc-1", DAY0, DAY0 + DAY);
    assert.equal(dedup.filter((x) => x.chartKey === "C|DX|MASTER").length, 1);
    assert.equal(dedup.find((x) => x.chartKey === "C|DX|MASTER").sync, "FS+"); // 나중 이벤트
    assert.equal(dedup.find((x) => x.chartKey === "C|DX|MASTER").achievementAfter, 82);
    assert.equal(dedup.find((x) => x.chartKey === "C|DX|MASTER").achievementGain, 2);

    // ── 검증 & 원자성 ──
    await assert.rejects(() => db.saveAchievementPlayEventLogBatch([
      ev("x", "P|DX|MASTER", 1, 0, DAY0, { profileKey: "intl:conflict-a" }),
      ev("y", "Q|DX|MASTER", 2, 0, DAY0, { profileKey: "intl:conflict-b" }), // 배치 내 profileKey 혼재
    ]));
    await assert.rejects(() => db.saveAchievementPlayEventLogBatch([
      ev("dup", "P|DX|MASTER", 1, 0, DAY0, { profileKey: "intl:conflict-c" }),
      ev("dup", "Q|DX|MASTER", 2, 0, DAY0, { profileKey: "intl:conflict-c" }), // 같은 sourcePlayId, 다른 페이로드
    ]));
    assert.equal((await db.getAchievementPlayEventLog("intl:conflict-a")).length, 0); // 롤백, 부분 기록 없음
    assert.equal((await db.getAchievementPlayEventLog("intl:conflict-c")).length, 0);

    // 빈 배치는 그냥 ok
    assert.equal(await db.saveAchievementPlayEventLogBatch([]), "ok");

    // setAchievementMinimum 클램프 [0, 100], 미설정 유저 기본 95
    await db.setAchievementMinimum("disc-1", 250);
    assert.equal(await db.getAchievementMinimum("disc-1"), 100);
    await db.setAchievementMinimum("disc-1", -5);
    assert.equal(await db.getAchievementMinimum("disc-1"), 0);
    assert.equal(await db.getAchievementMinimum("never-set-user"), 95);

    // 프로필 캐시 왕복 + 숫자 타입
    await db.cacheProfile({ playerName: "numbers", rating: 1, ratingMax: 1, gradeImg: "", avatar: "", trophy: "", trophyClass: "", stars: "", playCount: 1, friendCode: "numbers" }, 1);
    assert.equal(typeof (await db.getCachedProfile("intl:numbers")).lastSyncedAt, "number");
    assert.equal(typeof (await db.getLastSyncTime()), "number");
  } finally { await db.close(); await pg.stop(); }
});

// 마이그레이션: v0.7.10 이전 DB(단일 스키마 체크섬을 v1으로 기록)를 깨지 않고 올린다.
test("legacy v1 마이그레이션 체크섬을 다시 쓰지 않는다 + 컬럼 백필", async () => {
  const pg = await temporaryPostgres();
  process.env.DATABASE_URL = pg.url;
  const legacyChecksum = "legacy-whole-schema-checksum";
  const client = new Client({ connectionString: pg.url });
  try {
    await client.connect();
    await client.query("CREATE TABLE storage_migrations (version integer PRIMARY KEY, applied_at bigint NOT NULL, checksum text NOT NULL)");
    await client.query("INSERT INTO storage_migrations VALUES (1, $1, $2)", [Date.now(), legacyChecksum]);
    // 마이그레이션 4/5/7 이전의 옛 achievement_play_event_log 스키마 (chart_key/score_gain 등 없음)
    await client.query(`CREATE TABLE achievement_play_event_log (event_key text PRIMARY KEY, profile_key text NOT NULL, source_play_id text NOT NULL, is_baseline integer NOT NULL, played_at bigint NOT NULL, source_sequence integer NOT NULL, captured_at bigint NOT NULL, source_kind text DEFAULT 'history', achievement_val double precision NOT NULL, fc text DEFAULT '', sync text DEFAULT '', rating_up double precision, title text DEFAULT '', diff text DEFAULT '', level text DEFAULT '', music_kind text DEFAULT '', achievement_text text DEFAULT '', record_json text NOT NULL, payload_hash text NOT NULL)`);
    await client.query(`INSERT INTO achievement_play_event_log VALUES ('legacy-event','upgrade-profile','old-play',0,1000,1,1000,'history',100,'AP','',NULL,'legacy-title','MASTER','13','DX','100%','{}','old-hash')`);

    const { PostgresStorage } = require("../dist/storage/postgres");
    const db = new PostgresStorage(pg.url);
    try {
      await db.initialize();

      // v1 체크섬은 그대로
      assert.equal((await client.query("SELECT checksum FROM storage_migrations WHERE version=1")).rows[0].checksum, legacyChecksum);

      // 마이그레이션이 만든 테이블/컬럼이 존재
      for (const t of ["profiles", "achievement_chart_best", "chart_clears", "user_goals"]) {
        assert.equal((await client.query("SELECT to_regclass($1) AS name", [t])).rows[0].name, t, `table ${t}`);
      }
      const cols = (await client.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name='achievement_play_event_log'",
      )).rows.map((r) => r.column_name);
      for (const col of ["chart_key", "score_gain", "is_meaningful", "level_constant", "achievement_before", "rating_gain"]) {
        assert.ok(cols.includes(col), `column ${col} backfilled`);
      }
      // 마이그레이션 4: 빈 chart_key 를 title|kind|diff 로 채움
      assert.equal(
        (await client.query("SELECT chart_key FROM achievement_play_event_log WHERE event_key='legacy-event'")).rows[0].chart_key,
        "legacy-title|DX|MASTER",
      );
      // 마이그레이션 6: 기존 행은 is_meaningful=0 → 요약에서 제외됨
      assert.equal(
        Number((await client.query("SELECT is_meaningful FROM achievement_play_event_log WHERE event_key='legacy-event'")).rows[0].is_meaningful),
        0,
      );

      // 업그레이드된 스키마에 새 이벤트 기록 가능
      await db.saveAchievementPlayEventLogBatch([{
        profileKey: "upgrade-profile", sourcePlayId: "new-play", chartKey: "legacy-title|DX|MASTER",
        playedAt: 2000, sourceSequence: 2, recordJson: "{}", achievementVal: 99, achievementBefore: 90,
        fc: "", sync: "", title: "legacy-title", diff: "MASTER", level: "13", musicKind: "DX", achievementText: "99%",
      }]);
      // 요약: 옛 행(is_meaningful=0)은 빠지고 새 행(99% ≥ 기본 임계 95%)만
      const summaries = await db.getDailyAchievementSummaries("upgrade-profile", 0, 3000);
      assert.deepEqual(summaries.map((x) => x.sourcePlayId), ["new-play"]);
      assert.equal(summaries[0].achievementAfter, 99);
      assert.equal(summaries[0].achievementGain, 9);
    } finally { await db.close(); }
  } finally { try { await client.end(); } catch {} await pg.stop(); }
});

// 게임 옵션 프리셋: 이름 기준 덮어쓰기·개수 제한, id 기준 수정·이름 중복, 스냅샷 upsert.
test("option_presets 저장/수정/제한 + user_options 스냅샷", async () => {
  const pg = await temporaryPostgres();
  try {
    const { PostgresStorage } = require("../dist/storage/postgres");
    const db = new PostgresStorage(pg.url);
    try {
      await db.initialize();
      const p = (name, v = "1") => ({ name, server: "intl", values: { noteSpeed: v }, labels: { noteSpeed: ["TAP SPEED", v] } });
      const a = await db.saveOptionPreset("u1", p("a"), 2);
      const b = await db.saveOptionPreset("u1", p("b"), 2);
      assert.equal(typeof a, "object");
      assert.equal(await db.saveOptionPreset("u1", p("c"), 2), "limit");
      // 같은 이름은 제한에 걸리지 않고 덮어쓴다
      const a2 = await db.saveOptionPreset("u1", p("a", "5"), 2);
      assert.equal(a2.id, a.id);
      // id 수정: 이름 변경 OK, 다른 프리셋과 이름이 겹치면 duplicate, 남의 id 는 not_found
      assert.equal((await db.saveOptionPreset("u1", p("a-renamed", "7"), 2, a.id)).name, "a-renamed");
      assert.equal(await db.saveOptionPreset("u1", p("b"), 2, a.id), "duplicate");
      assert.equal(await db.saveOptionPreset("u2", p("x"), 2, a.id), "not_found");
      const list = await db.listOptionPresets("u1");
      assert.deepEqual(list.map((x) => [x.name, x.values.noteSpeed]), [["a-renamed", "7"], ["b", "1"]]);
      assert.equal(await db.deleteOptionPreset("u2", b.id), false);
      assert.equal(await db.deleteOptionPreset("u1", b.id), true);

      const f = (v) => [{ name: "noteSpeed", label: "TAP SPEED", desc: "", value: v, options: [["0", "1.00"], ["1", "1.25"]] }];
      await db.saveOptionSnapshot("u1", "intl", f("0"));
      await db.saveOptionSnapshot("u1", "intl", f("1"));
      await db.saveOptionSnapshot("u1", "jp", f("0"));
      const snaps = await db.getOptionSnapshots("u1");
      assert.equal(snaps.length, 2);
      assert.equal(snaps.find((x) => x.server === "intl").fields[0].value, "1");
    } finally { await db.close(); }
  } finally { await pg.stop(); }
});

// 패치노트: 게시 시각 기준으로, 세션이 있는 사용자에게 안 본 것만 최신순. 새 세션은 가입 전 노트를 보지 않는다.
test("patch_notes 게시·미확인 조회·ack", async () => {
  const pg = await temporaryPostgres();
  const client = new Client({ connectionString: pg.url });
  try {
    await client.connect();
    const { PostgresStorage } = require("../dist/storage/postgres");
    const db = new PostgresStorage(pg.url);
    try {
      // 마이그레이션 전부터 있던 사용자 흉내: patch_ack 컬럼이 생기기 전 행은 0 이어야 한다.
      await db.initialize();
      await client.query("INSERT INTO sessions(discord_user_id, patch_ack) VALUES('old', 0)");
      const draft = await db.savePatchNote({ version: "1.0.0", title: "", body: "초안" });
      assert.deepEqual(await db.getUnseenPatchNotes("old", 0, 3), []); // 초안은 안 보인다
      assert.equal(await db.getUnseenPatchNotes("nobody", 0, 3), null); // 세션 없음
      await db.setPatchNotePublished(draft.id, true);
      const [seen] = await db.getUnseenPatchNotes("old", 0, 3);
      assert.equal(seen.body, "초안");
      // 가입(세션 생성)이 게시보다 나중이면 보지 않는다
      await new Promise((r) => setTimeout(r, 5));
      await client.query("INSERT INTO sessions(discord_user_id) VALUES('new')");
      assert.deepEqual(await db.getUnseenPatchNotes("new", 0, 3), []);
      // 보여 준 뒤 ack → 다시 안 보인다. 다시 게시하면 또 보인다.
      await db.setPatchAck("old", Date.now());
      assert.deepEqual(await db.getUnseenPatchNotes("old", 0, 3), []);
      await new Promise((r) => setTimeout(r, 5));
      await db.setPatchNotePublished(draft.id, true);
      assert.equal((await db.getUnseenPatchNotes("old", 0, 3)).length, 1);
      // since(표시 기간) 이전 게시분은 제외
      assert.deepEqual(await db.getUnseenPatchNotes("old", Date.now() + 1000, 3), []);
      // 수정·게시 취소·삭제
      const edited = await db.savePatchNote({ version: "1.0.1", title: "제목", body: "수정" }, draft.id);
      assert.equal(edited.version, "1.0.1");
      await db.setPatchNotePublished(draft.id, false);
      assert.deepEqual(await db.getUnseenPatchNotes("old", 0, 3), []);
      assert.equal(await db.deletePatchNote(draft.id), true);
      assert.equal(await db.savePatchNote({ version: "", title: "", body: "x" }, draft.id), null);
    } finally { await db.close(); }
  } finally { try { await client.end(); } catch {} await pg.stop(); }
});
