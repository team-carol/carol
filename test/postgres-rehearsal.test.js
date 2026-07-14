const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const Database = require("better-sqlite3");
const { Client } = require("pg");

test("PostgreSQL bootstrap is idempotent on a completed volume", { skip: !process.env.REHEARSAL_DATABASE_URL }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "carol-bootstrap-test-"));
  const sqlitePath = path.join(dir, "fixture.db");
  const sqlite = new Database(sqlitePath);
  sqlite.pragma("journal_mode=WAL");
  sqlite.pragma("wal_autocheckpoint=0");
  sqlite.exec("CREATE TABLE profiles (friend_code TEXT PRIMARY KEY, player_name TEXT); CREATE TABLE sessions (discord_user_id TEXT PRIMARY KEY, cookie_json TEXT);");
  const insert = sqlite.prepare("INSERT INTO profiles VALUES (?, ?)");
  const insertMany = sqlite.transaction(() => { for (let i = 0; i < 1250; i++) insert.run(i === 0 ? "wal-fixture" : `fixture-${i}`, i === 0 ? "WAL Fixture" : `Fixture ${i}`); });
  insertMany();
  sqlite.prepare("INSERT INTO sessions VALUES (?, ?)").run("fixture-user", "{}");
  sqlite.close();
  const env = { ...process.env, DATABASE_URL: process.env.REHEARSAL_DATABASE_URL, SQLITE_IMPORT_PATH: sqlitePath };
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = spawnSync(process.execPath, ["dist/tools/bootstrapPostgres.js"], { encoding: "utf8", env });
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      assert.match(result.stdout, /bootstrap start/);
      assert.match(result.stdout, /snapshot ready/);
      if (attempt === 0) assert.match(result.stdout, /rows=1251/);
      else assert.match(result.stdout, /already migrated/);
      assert.ok(!result.stdout.includes("cookie_json"));
      assert.ok(result.stdout.split("\n").length < 100, "progress output should not be per-row");
    }
    const client = new Client({ connectionString: process.env.REHEARSAL_DATABASE_URL });
    await client.connect();
    try {
      const result = await client.query("SELECT count(*)::int AS count FROM storage_migrations WHERE version = 1");
      assert.equal(result.rows[0].count, 1);
      const fixture = await client.query("SELECT player_name FROM profiles WHERE friend_code = 'wal-fixture'");
      assert.equal(fixture.rows[0].player_name, "WAL Fixture");
    } finally { await client.end(); }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("postgres rehearsal preserves a blob/secret fixture without leaking it", { skip: !process.env.REHEARSAL_DATABASE_URL }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "carol-rehearsal-test-"));
  const sqlitePath = path.join(dir, "fixture.db");
  const secret = "REHEARSAL_SENTINEL_SECRET";
  const db = new Database(sqlitePath);
  db.exec("CREATE TABLE profiles (friend_code TEXT PRIMARY KEY, player_name TEXT, rating INTEGER, rating_card_blob BLOB); CREATE TABLE sessions (discord_user_id TEXT PRIMARY KEY, cookie_json TEXT, sync_token TEXT);");
  db.prepare("INSERT INTO profiles VALUES (?,?,?,?)").run("fixture", secret, 1, Buffer.from(secret));
  db.prepare("INSERT INTO sessions VALUES (?,?,?)").run("user", secret, secret);
  db.close();
  try {
    const result = spawnSync(process.execPath, ["dist/tools/rehearsePostgres.js"], { encoding: "utf8", env: { ...process.env, POSTGRES_REHEARSAL: "1", SQLITE_PATH: sqlitePath, DATABASE_URL: process.env.REHEARSAL_DATABASE_URL } });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(`${result.stdout}\n${result.stderr}`.includes(secret), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
