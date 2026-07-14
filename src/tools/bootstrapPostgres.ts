#!/usr/bin/env node
/** One-shot SQLite -> PostgreSQL cutover bootstrap. */
import Database from "better-sqlite3";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Pool, type PoolClient } from "pg";
import * as crypto from "node:crypto";
import { POSTGRES_SCHEMA, MIGRATION_VERSION } from "../storage/postgres";

const arg = (name: string) => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; };
const url = arg("--pg-url") ?? process.env.DATABASE_URL;
const source = arg("--sqlite") ?? process.env.SQLITE_IMPORT_PATH;
if (!url || !source) { console.error("usage: bootstrapPostgres --pg-url URL --sqlite PATH"); process.exit(2); }

const BATCH_SIZE = 100;
const REBUILT_CACHES = ["profiles.raw_html", "profiles.rating_card_blob", "map_images", "song_jackets"];
let interrupted = false;
let sqlite: Database.Database | undefined;
let pool: Pool | undefined;
let client: PoolClient | undefined;
let stagingDir: string | undefined;

function json(v: unknown) { return JSON.stringify(v, (_k, x) => Buffer.isBuffer(x) ? { __blob_base64: x.toString("base64") } : x); }
function checkInterrupted() { if (interrupted) throw new Error("bootstrap interrupted"); }
function interrupt(signal: string) {
  if (!interrupted) { interrupted = true; console.log(`bootstrap interrupted (${signal}); rolling back`); }
}
process.once("SIGTERM", () => interrupt("SIGTERM"));
process.once("SIGINT", () => interrupt("SIGINT"));

async function insertBatch(c: PoolClient, table: string, columns: string[], rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const quoted = columns.map(x => `"${x.replace(/"/g, '""')}"`).join(",");
  for (const row of rows) {
    checkInterrupted();
    const values = columns.map(x => row[x]);
    const placeholders = values.map((_, i) => `$${i + 1}`).join(",");
    await c.query(`INSERT INTO "${table.replace(/"/g, '""')}" (${quoted}) VALUES(${placeholders}) ON CONFLICT DO NOTHING`, values);
  }
}

async function main() {
  console.log("bootstrap start");
  const sourcePath = path.resolve(source!);
  stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), "carol-bootstrap-"));
  const stagedPath = path.join(stagingDir, "source.db");
  const snapshotPath = path.join(stagingDir, "snapshot.db");
  let committed = false;
  try {
    // Never open or checkpoint the mounted source. Copying the WAL alongside it
    // gives SQLite a consistent, private read snapshot for the backup operation.
    for (const suffix of ["", "-wal", "-shm"]) {
      const input = sourcePath + suffix;
      if (fs.existsSync(input)) fs.copyFileSync(input, stagedPath + suffix);
    }
    const staged = new Database(stagedPath);
    try { await staged.backup(snapshotPath); } finally { staged.close(); }
    console.log("snapshot ready");
    sqlite = new Database(snapshotPath, { readonly: true });
    pool = new Pool({ connectionString: url });
    client = await pool.connect();
    checkInterrupted();
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [0x6361726f6c]);
    await client.query(POSTGRES_SCHEMA);
    const expected = crypto.createHash("sha256").update(POSTGRES_SCHEMA).digest("hex");
    const ledger = await client.query<{ version: number; checksum: string }>("SELECT version,checksum FROM storage_migrations ORDER BY version");
    if (ledger.rows.length) {
      if (ledger.rows.length !== 1 || ledger.rows[0].version !== MIGRATION_VERSION || !["sqlite-bootstrap", expected].includes(ledger.rows[0].checksum)) throw new Error("PostgreSQL migration ledger contains incompatible entries");
      await client.query("COMMIT");
      committed = true;
      console.log(`bootstrap complete (already migrated, version=${MIGRATION_VERSION})`);
      return;
    }
    const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[];
    const known = new Set(["profiles", "sessions", "jackets", "guild_settings", "song_jackets", "map_images", "constants_cache", "daily_achievements", "song_aliases", "daily_achievement_snapshots", "achievement_events", "achievement_play_events", "achievement_play_event_log", "achievement_event_state", "achievement_play_event_log_state", "chart_record_baselines", "chart_record_baseline_state"]);
    console.log(`${REBUILT_CACHES.join(", ")} will be rebuilt/cleared`);
    let total = 0;
    for (const { name } of tables) {
      checkInterrupted();
      const escaped = name.replace(/"/g, '""');
      const columns = (sqlite.prepare(`PRAGMA table_info("${escaped}")`).all() as { name: string }[]).map(x => x.name);
      console.log(`table start: ${name}`);
      if (name === "map_images" || name === "song_jackets") {
        console.log(`table complete: ${name} rows=0 batches=0 (rebuildable cache intentionally skipped)`);
        continue;
      }
      // Do not even ask SQLite for large cache fields: better-sqlite3 converts
      // each selected value to a JS string before iterate() can yield it.
      const omitted: string[] = name === "profiles"
        ? columns.filter(x => x === "rating_card_blob" || x === "raw_html")
        : [];
      const selected = columns.filter(x => !omitted.includes(x)).map(x => `"${x.replace(/"/g, '""')}"`).join(",");
      const query = sqlite.prepare(`SELECT ${selected || "1"} FROM "${escaped}"`);
      let batch: Record<string, unknown>[] = [], tableCount = 0, batches = 0;
      for (const row of query.iterate() as Iterable<Record<string, unknown>>) {
        if (name === "profiles") {
          if (omitted.includes("raw_html")) row.raw_html = "";
          if (omitted.includes("rating_card_blob")) row.rating_card_blob = null;
        }
        batch.push(row);
        if (batch.length === BATCH_SIZE) {
          if (known.has(name)) await insertBatch(client, name, columns, batch);
          else for (const legacy of batch) await client.query("INSERT INTO legacy_tables(table_name,columns_json,row_json,imported_at) VALUES($1,$2,$3,$4)", [name, JSON.stringify(columns), json(legacy), Date.now()]);
          tableCount += batch.length; total += batch.length; batches++;
          if (batches === 1 || batches % 10 === 0) console.log(`progress: ${name} rows=${tableCount} batches=${batches}`);
          batch = [];
        }
      }
      if (batch.length) {
        if (known.has(name)) await insertBatch(client, name, columns, batch);
        else for (const legacy of batch) await client.query("INSERT INTO legacy_tables(table_name,columns_json,row_json,imported_at) VALUES($1,$2,$3,$4)", [name, JSON.stringify(columns), json(legacy), Date.now()]);
        tableCount += batch.length; total += batch.length; batches++;
      }
      console.log(`table complete: ${name} rows=${tableCount} batches=${batches}`);
    }
    checkInterrupted();
    await client.query("INSERT INTO storage_migrations(version,applied_at,checksum) VALUES($1,$2,$3)", [MIGRATION_VERSION, Date.now(), "sqlite-bootstrap"]);
    await client.query("COMMIT");
    committed = true;
    console.log(`bootstrap complete: rows=${total}`);
  } finally {
    if (client) { if (!committed) { try { await client.query("ROLLBACK"); } catch (_) { /* disconnected */ } } client.release(); client = undefined; }
    sqlite?.close();
    await pool?.end();
    if (stagingDir) fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}
main().catch(e => { console.error(`bootstrap failed: ${e instanceof Error ? e.message : "unknown error"}`); process.exitCode = 1; });
