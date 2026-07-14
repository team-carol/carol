#!/usr/bin/env node
/* Full migration-target export/import verification. Requires Docker and postgres:16. */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const Database = require("better-sqlite3");

function docker(args, input) {
  try { return execFileSync("docker", args, { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim(); }
  catch (_) { throw new Error("migration verification container operation failed"); }
}
try { docker(["info"]); } catch (_) { console.log("SKIP: Docker daemon is unavailable"); process.exit(0); }

const schema = `CREATE TABLE achievement_play_event_log (
 event_key TEXT PRIMARY KEY, profile_key TEXT NOT NULL, source_play_id TEXT NOT NULL,
 is_baseline INTEGER NOT NULL, played_at INTEGER NOT NULL, source_sequence INTEGER NOT NULL,
 captured_at INTEGER NOT NULL, source_kind TEXT NOT NULL, achievement_val REAL NOT NULL,
 fc TEXT NOT NULL, sync TEXT NOT NULL, rating_up REAL, title TEXT NOT NULL, diff TEXT NOT NULL,
 level TEXT NOT NULL, music_kind TEXT NOT NULL, achievement_text TEXT NOT NULL,
 record_json TEXT NOT NULL, payload_hash TEXT NOT NULL
);`;
function fixtureRows() {
  const now = Date.UTC(2026, 6, 14, 20, 0);
  return [1, 2].map((n) => {
    const record = JSON.stringify({ title: `Fixture ${n}`, diff: "MASTER", note: "backslash \\ and \n-safe" });
    return { event_key: crypto.createHash("sha256").update(`fixture-${n}`).digest("hex"), profile_key: "fixture:1", source_play_id: `fixture-${n}`, is_baseline: 0, played_at: now + n * 1000, source_sequence: n, captured_at: now, source_kind: "fixture", achievement_val: 90 + n, fc: "", sync: "", rating_up: null, title: `Fixture ${n}`, diff: "MASTER", level: "10", music_kind: "", achievement_text: `${90 + n}%`, record_json: record, payload_hash: crypto.createHash("sha256").update(record).digest("hex") };
  });
}
function fixtureSnapshot() {
  const profile = { friend_code: "fixture:1", player_name: "fixture", rating: 0, rating_max: 1, trophy: "", trophy_class: "normal", avatar: "", grade_img: "", stars: "0", comment: "", play_count: 2, raw_html: "", recent_json: "[]", top_json: "[{\"secret\":\"PROFILE_SECRET\"}]", clear_json: "[]", last_synced_at: 1, achievement_initialized_at: 0, created_at: 1, rating_card_blob: "PROFILE_BLOB_SECRET", rating_card_synced_at: 0, rating_card_version: 0, server_region: "intl", display_friend_code: "", total_play_count: 2, map_json: "[]" };
  const session = { discord_user_id: "fixture-user", cookie_json: "SESSION_COOKIE_SECRET", friend_code: "fixture:1", sync_token: "SESSION_TOKEN_SECRET", avatar_blob: "AVATAR_SECRET", updated_at: 1, profile_private: 0, extra_bookmarklets: "[]", preset_bookmarklets: "[]", default_server: "intl", friend_code_intl: "fixture:1", friend_code_jp: "", avatar_blob_intl: "AVATAR_INTL_SECRET", avatar_blob_jp: "" , translate_titles: 0 };
  return {
    events: fixtureRows(),
    profiles: [profile],
    sessions: [session],
    baselines: [{ profile_key: "fixture:1", score_locator: "fixture-score", diff: "BASIC", title: "Fixture", level: "10", music_kind: "", achievement_val: 90, achievement_text: "90%", fc: "", sync: "", observed_at: 1, changed_at: 1, source_payload: "<fixture>", source_hash: crypto.createHash("sha256").update("<fixture>").digest("hex") }],
    baselineStates: [{ profile_key: "fixture:1", latest_capture: 1, row_count: 1, page_manifest: "[]" }],
    eventStates: [{ profile_key: "fixture:1", initialized_at: 1 }],
  };
}
function readRows() {
  const dbPath = path.join(process.env.DATA_DIR || ".", "maimai.db");
  let db;
  try {
    db = new Database(dbPath, { readonly: true });
    const exists = (name) => db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
    if (!exists("achievement_play_event_log")) throw new Error("canonical event-log schema absent");
    const read = (name) => exists(name) ? db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all() : [];
    const snapshot = db.transaction(() => ({ events: db.prepare("SELECT * FROM achievement_play_event_log ORDER BY event_key").all(), profiles: read("profiles"), sessions: read("sessions"), baselines: read("chart_record_baselines"), baselineStates: read("chart_record_baseline_state"), eventStates: read("achievement_play_event_log_state") }))();
    db.close();
    return snapshot;
  } catch (error) {
    if (db) db.close();
    if (fs.existsSync(dbPath)) throw new Error("canonical SQLite schema unavailable");
    // A fresh disposable SQLite fixture makes this command independently demonstrable.
    const fixturePath = path.join(os.tmpdir(), `carol-event-log-fixture-${process.pid}.db`);
    db = new Database(fixturePath);
    db.exec(schema);
    const insert = db.prepare("INSERT INTO achievement_play_event_log VALUES (@event_key,@profile_key,@source_play_id,@is_baseline,@played_at,@source_sequence,@captured_at,@source_kind,@achievement_val,@fc,@sync,@rating_up,@title,@diff,@level,@music_kind,@achievement_text,@record_json,@payload_hash)");
    for (const row of fixtureRows()) insert.run(row);
    const rows = db.prepare("SELECT * FROM achievement_play_event_log ORDER BY event_key").all();
    db.close(); fs.rmSync(fixturePath, { force: true });
    const snapshot = fixtureSnapshot();
    snapshot.events = rows;
    return snapshot;
  }
}
const snapshot = readRows();
const rows = snapshot.events;
function rowJson(row) {
  return JSON.stringify(row, (_key, value) => value && value.type === "Buffer" && Array.isArray(value.data) ? { __blob_base64: Buffer.from(value.data).toString("base64") } : value);
}
function genericRows(rows, key) { return rows.map((row) => { const json = rowJson(row); return { row_key: key(row), row_json_b64: Buffer.from(json, "utf8").toString("base64") }; }); }
function blobBytes(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value && value.type === "Buffer" && Array.isArray(value.data)) return Buffer.from(value.data);
  return value == null ? null : Buffer.from(String(value), "utf8");
}
const migrationSnapshot = {
  ...snapshot,
  profileRows: snapshot.profiles.map((row) => JSON.parse(rowJson(row))),
  sessionRows: snapshot.sessions.map((row) => JSON.parse(rowJson(row))),
  baselineRows: snapshot.baselines,
  baselineStateRows: snapshot.baselineStates,
  eventStateRows: snapshot.eventStates,
  profiles: genericRows(snapshot.profiles, (row) => String(row.friend_code)),
  sessions: genericRows(snapshot.sessions, (row) => String(row.discord_user_id)),
  baselines: genericRows(snapshot.baselines, (row) => `${row.profile_key}\u001f${row.score_locator}\u001f${row.diff}`),
  baselineStates: genericRows(snapshot.baselineStates, (row) => String(row.profile_key)),
  eventStates: genericRows(snapshot.eventStates, (row) => String(row.profile_key)),
};
const exportRows = rows.map((row) => ({ ...row, record_json_b64: Buffer.from(row.record_json, "utf8").toString("base64") }));
const portableBase64 = Buffer.from(JSON.stringify({ ...migrationSnapshot, events: exportRows }), "utf8").toString("base64");

const name = `carol-pg-${process.pid}`;
let container;
try { container = docker(["run", "-d", "--rm", "--name", name, "-e", "POSTGRES_PASSWORD=test", "postgres:16"]); }
catch (_) { console.log("SKIP: postgres:16 image cannot be started or pulled"); process.exit(0); }
try {
  for (let i = 0; i < 60; i++) {
    try { docker(["exec", name, "psql", "-U", "postgres", "-d", "postgres", "-c", "SELECT 1"]); break; }
    catch (_) {
      if (i === 59) throw new Error("PostgreSQL did not become ready");
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
  }
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  const first = rows[0]?.played_at ?? Date.UTC(2026, 6, 14, 20);
  const kst = new Date(first + 9 * 60 * 60 * 1000);
  const from = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), -4); // 05:00 KST
  const to = from + 86_400_000;
  const keyChecksum = crypto.createHash("sha256").update(rows.map((r) => `${r.event_key}:${r.payload_hash}`).sort().join("\n")).digest("hex");
  const emptyHash = crypto.createHash("sha256").update("").digest("hex");
  const baselineStateChecksum = crypto.createHash("sha256").update(migrationSnapshot.baselineStates.map((r) => `${r.row_key}:${r.row_json_b64}`).sort().join("\n")).digest("hex");
  const migrationChecksums = [migrationSnapshot.profiles, migrationSnapshot.sessions, migrationSnapshot.baselines, migrationSnapshot.baselineStates, migrationSnapshot.eventStates].map((set) => crypto.createHash("sha256").update(set.map((r) => `${r.row_key}:${r.row_json_b64}`).sort().join("\n")).digest("hex"));
  const profileBlobChecksum = crypto.createHash("sha256").update(snapshot.profiles.map((row) => `${row.friend_code}:${blobBytes(row.rating_card_blob) ? blobBytes(row.rating_card_blob).toString("hex") : ""}`).sort().join("\n")).digest("hex");
  const sql = `CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE achievement_play_event_log (event_key text primary key, profile_key text not null, source_play_id text not null, is_baseline boolean not null, played_at bigint not null, source_sequence integer not null, captured_at bigint not null, source_kind text not null, achievement_val double precision not null, fc text not null, sync text not null, rating_up double precision, title text not null, diff text not null, level text not null, music_kind text not null, achievement_text text not null, record_json jsonb not null, payload_hash text not null);
CREATE TEMP TABLE migration_payload AS SELECT convert_from(decode('${portableBase64}','base64'),'UTF8')::jsonb AS payload;
CREATE TEMP TABLE import_rows AS SELECT * FROM jsonb_to_recordset((SELECT payload->'events' FROM migration_payload)) AS x(event_key text, profile_key text, source_play_id text, is_baseline int, played_at bigint, source_sequence int, captured_at bigint, source_kind text, achievement_val double precision, fc text, sync text, rating_up double precision, title text, diff text, level text, music_kind text, achievement_text text, record_json_b64 text, payload_hash text);
CREATE TEMP TABLE import_profiles AS SELECT * FROM jsonb_to_recordset((SELECT payload->'profiles' FROM migration_payload)) AS x(row_key text, row_json_b64 text);
CREATE TEMP TABLE import_sessions AS SELECT * FROM jsonb_to_recordset((SELECT payload->'sessions' FROM migration_payload)) AS x(row_key text, row_json_b64 text);
CREATE TEMP TABLE import_profile_fields AS SELECT * FROM jsonb_to_recordset((SELECT payload->'profileRows' FROM migration_payload)) AS x(friend_code text,player_name text,rating int,rating_max int,trophy text,trophy_class text,avatar text,grade_img text,stars text,comment text,play_count int,raw_html text,recent_json text,top_json text,clear_json text,last_synced_at bigint,achievement_initialized_at bigint,created_at bigint,rating_card_blob jsonb,rating_card_synced_at bigint,rating_card_version int,server_region text,display_friend_code text,total_play_count int,map_json text);
CREATE TEMP TABLE import_session_fields AS SELECT * FROM jsonb_to_recordset((SELECT payload->'sessionRows' FROM migration_payload)) AS x(discord_user_id text,cookie_json text,friend_code text,sync_token text,avatar_blob text,updated_at bigint,profile_private int,extra_bookmarklets text,preset_bookmarklets text,default_server text,friend_code_intl text,friend_code_jp text,avatar_blob_intl text,avatar_blob_jp text,translate_titles int);
CREATE TEMP TABLE import_baselines AS SELECT * FROM jsonb_to_recordset((SELECT payload->'baselineRows' FROM migration_payload)) AS x(profile_key text,score_locator text,diff text,title text,level text,music_kind text,achievement_val double precision,achievement_text text,fc text,sync text,observed_at bigint,changed_at bigint,source_payload text,source_hash text);
CREATE TEMP TABLE import_baseline_states AS SELECT * FROM jsonb_to_recordset((SELECT payload->'baselineStateRows' FROM migration_payload)) AS x(profile_key text,latest_capture bigint,row_count int,page_manifest text);
CREATE TEMP TABLE import_event_states AS SELECT * FROM jsonb_to_recordset((SELECT payload->'eventStateRows' FROM migration_payload)) AS x(profile_key text,initialized_at bigint);
CREATE TEMP TABLE import_baseline_rows AS SELECT * FROM jsonb_to_recordset((SELECT payload->'baselines' FROM migration_payload)) AS x(row_key text,row_json_b64 text);
CREATE TEMP TABLE import_baseline_state_rows AS SELECT * FROM jsonb_to_recordset((SELECT payload->'baselineStates' FROM migration_payload)) AS x(row_key text,row_json_b64 text);
CREATE TEMP TABLE import_event_state_rows AS SELECT * FROM jsonb_to_recordset((SELECT payload->'eventStates' FROM migration_payload)) AS x(row_key text,row_json_b64 text);
CREATE TABLE profiles_migration (friend_code text primary key,player_name text,rating int,rating_max int,trophy text,trophy_class text,avatar text,grade_img text,stars text,comment text,play_count int,raw_html text,recent_json text,top_json text,clear_json text,last_synced_at bigint,achievement_initialized_at bigint,created_at bigint,rating_card_blob bytea,rating_card_synced_at bigint,rating_card_version int,server_region text,display_friend_code text,total_play_count int,map_json text);
CREATE TABLE sessions_migration (discord_user_id text primary key,cookie_json text,friend_code text,sync_token text,avatar_blob text,updated_at bigint,profile_private int,extra_bookmarklets text,preset_bookmarklets text,default_server text,friend_code_intl text,friend_code_jp text,avatar_blob_intl text,avatar_blob_jp text,translate_titles int);
CREATE TABLE profiles_migration_rows (row_key text primary key, row_json_b64 text not null);
CREATE TABLE sessions_migration_rows (row_key text primary key, row_json_b64 text not null);
CREATE TABLE chart_record_baselines_migration (profile_key text not null,score_locator text not null,diff text not null,title text not null,level text not null,music_kind text not null,achievement_val double precision not null,achievement_text text not null,fc text not null,sync text not null,observed_at bigint not null,changed_at bigint not null,source_payload text not null,source_hash text not null,primary key(profile_key,score_locator,diff));
CREATE TABLE chart_record_baseline_state_migration (profile_key text primary key,latest_capture bigint not null,row_count int not null,page_manifest text not null);
CREATE TABLE achievement_play_event_log_state_migration (profile_key text primary key,initialized_at bigint not null);
CREATE TABLE chart_record_baselines_migration_rows (row_key text primary key,row_json_b64 text not null);
CREATE TABLE chart_record_baseline_state_migration_rows (row_key text primary key,row_json_b64 text not null);
CREATE TABLE achievement_play_event_log_state_migration_rows (row_key text primary key,row_json_b64 text not null);
INSERT INTO profiles_migration SELECT friend_code,player_name,rating,rating_max,trophy,trophy_class,avatar,grade_img,stars,comment,play_count,raw_html,recent_json,top_json,clear_json,last_synced_at,achievement_initialized_at,created_at,CASE WHEN rating_card_blob IS NULL THEN NULL WHEN jsonb_typeof(rating_card_blob)='object' AND rating_card_blob ? '__blob_base64' THEN decode(rating_card_blob->>'__blob_base64','base64') ELSE convert_to(rating_card_blob #>> '{}','UTF8') END,rating_card_synced_at,rating_card_version,server_region,display_friend_code,total_play_count,map_json FROM import_profile_fields;
INSERT INTO sessions_migration SELECT * FROM import_session_fields;
INSERT INTO profiles_migration_rows SELECT * FROM import_profiles;
INSERT INTO sessions_migration_rows SELECT * FROM import_sessions;
INSERT INTO chart_record_baselines_migration SELECT * FROM import_baselines;
INSERT INTO chart_record_baseline_state_migration SELECT * FROM import_baseline_states;
INSERT INTO achievement_play_event_log_state_migration SELECT * FROM import_event_states;
INSERT INTO chart_record_baselines_migration_rows SELECT * FROM import_baseline_rows;
INSERT INTO chart_record_baseline_state_migration_rows SELECT * FROM import_baseline_state_rows;
INSERT INTO achievement_play_event_log_state_migration_rows SELECT * FROM import_event_state_rows;
SELECT count(*) FROM import_rows;
SELECT count(*) FROM import_profiles;
SELECT count(*) FROM import_sessions;
SELECT count(*) FROM import_baselines;
SELECT count(*) FROM import_baseline_states;
SELECT count(*) FROM import_event_states;
SELECT coalesce(encode(digest(string_agg(row_key||':'||row_json_b64,E'\\n' ORDER BY row_key),'sha256'),'hex'),'${emptyHash}') FROM import_profiles;
SELECT coalesce(encode(digest(string_agg(row_key||':'||row_json_b64,E'\\n' ORDER BY row_key),'sha256'),'hex'),'${emptyHash}') FROM import_sessions;
SELECT coalesce(encode(digest(string_agg(row_key||':'||row_json_b64,E'\\n' ORDER BY row_key),'sha256'),'hex'),'${emptyHash}') FROM import_baseline_rows;
SELECT coalesce(encode(digest(string_agg(row_key||':'||row_json_b64,E'\\n' ORDER BY row_key),'sha256'),'hex'),'${emptyHash}') FROM import_baseline_state_rows;
SELECT coalesce(encode(digest(string_agg(row_key||':'||row_json_b64,E'\\n' ORDER BY row_key),'sha256'),'hex'),'${emptyHash}') FROM import_event_state_rows;
SELECT coalesce(encode(digest(string_agg(friend_code||':'||coalesce(encode(rating_card_blob,'hex'),''),E'\\n' ORDER BY friend_code),'sha256'),'hex'),'${emptyHash}') FROM profiles_migration;
INSERT INTO achievement_play_event_log SELECT event_key,profile_key,source_play_id,is_baseline<>0,played_at,source_sequence,captured_at,source_kind,achievement_val,fc,sync,rating_up,title,diff,level,music_kind,achievement_text,convert_from(decode(record_json_b64,'base64'),'UTF8')::jsonb,payload_hash FROM import_rows;
SELECT event_key FROM achievement_play_event_log ORDER BY event_key;
SELECT count(*),coalesce(encode(digest(string_agg(event_key||':'||payload_hash,E'\\n' ORDER BY event_key),'sha256'),'hex'),'${emptyHash}') FROM achievement_play_event_log;
SELECT count(*) FROM achievement_play_event_log WHERE played_at >= ${from} AND played_at < ${to};`;
  const output = docker(["exec", "-i", name, "psql", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-At", "-f", "-"], sql);
  const forbidden = ["PROFILE_SECRET", "PROFILE_BLOB_SECRET", "SESSION_COOKIE_SECRET", "SESSION_TOKEN_SECRET", "AVATAR_SECRET", "AVATAR_INTL_SECRET"];
  if (forbidden.some((secret) => output.includes(secret))) throw new Error("migration verifier output disclosure");
  const lines = output.split("\n").filter(Boolean);
  const expectedKeys = rows.map((r) => r.event_key).sort();
  if (lines.length < expectedKeys.length + 14) throw new Error(`PostgreSQL reconciliation returned incomplete output for ${expectedKeys.length} events`);
  const importedCount = Number(lines[0]);
  const importedKeys = lines.slice(12, expectedKeys.length + 12);
  const summary = lines[expectedKeys.length + 12].split("|");
  const rangeCount = Number(lines[expectedKeys.length + 13]);
  const expectedRange = rows.filter((r) => r.played_at >= from && r.played_at < to).length;
  const metadataCounts = [snapshot.profiles.length, snapshot.sessions.length, snapshot.baselines.length, snapshot.baselineStates.length, snapshot.eventStates.length];
  const importedMetadata = lines.slice(1, 6).map(Number);
  const checks = [JSON.stringify(importedKeys) === JSON.stringify(expectedKeys), importedCount === rows.length, JSON.stringify(importedMetadata) === JSON.stringify(metadataCounts), JSON.stringify(lines.slice(6, 11)) === JSON.stringify(migrationChecksums), lines[9] === baselineStateChecksum, lines[11] === profileBlobChecksum, Number(summary[0]) === rows.length, summary[1] === keyChecksum, rangeCount === expectedRange];
  if (checks.some((ok) => !ok)) throw new Error(`PostgreSQL reconciliation failed: check=${checks.map((ok) => ok ? "1" : "0").join("")}, eventCount=${rows.length}, range=${rangeCount}/${expectedRange}`);
  console.log(`PASS: migration targets exported/imported; ${rows.length} event-log rows, full profile/session/catalog row checksums, payload checksum, and 05:00 range reconciled`);
} finally {
  try { docker(["rm", "-f", name]); } catch (_) {}
}
