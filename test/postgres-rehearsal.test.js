const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const Database = require("better-sqlite3");

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
