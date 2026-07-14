import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";
import Database from "better-sqlite3";
import { Client } from "pg";

type SqliteValue = string | number | null | Buffer;
type Column = { name: string; type: string; pk: number };
type TableSnapshot = { name: string; sql: string | null; columns: Column[]; rows: Array<{ json: string; checksum: string }>; checksum: string };

function quote(value: string): string { return `"${value.replace(/"/g, '""')}` + `"`; }
function hash(value: string | Buffer): string { return crypto.createHash("sha256").update(value).digest("hex"); }
function encodeValue(value: SqliteValue): unknown {
  if (Buffer.isBuffer(value)) return { type: "blob", value: value.toString("base64") };
  if (value === null) return { type: "null", value: null };
  if (typeof value === "number") return { type: "number", value };
  return { type: "text", value };
}
function pgType(column: Column): string {
  const type = column.type.toUpperCase();
  if (type.includes("BLOB")) return "bytea";
  if (type.includes("REAL") || type.includes("FLOA") || type.includes("DOUB")) return "double precision";
  if (type.includes("INT")) return "bigint";
  return "text";
}
function tableSnapshot(db: Database.Database, name: string): TableSnapshot {
  const columns = db.pragma(`table_info(${quote(name)})`) as Array<{ name: string; type: string; pk: number }>;
  const rows = db.prepare(`SELECT * FROM ${quote(name)}`).all() as Array<Record<string, SqliteValue>>;
  const encoded = rows.map((row) => JSON.stringify(columns.map((column) => [column.name, encodeValue(row[column.name])] as const)));
  const sorted = encoded.sort();
  const snapshotRows = sorted.map((json) => ({ json, checksum: hash(json) }));
  return {
    name,
    sql: (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(name) as { sql?: string | null } | undefined)?.sql ?? null,
    columns,
    rows: snapshotRows,
    checksum: hash(snapshotRows.map((row) => row.checksum).join("\n")),
  };
}
async function loadSnapshot(sourcePath: string): Promise<{ tables: TableSnapshot[]; copyPath: string }> {
  if (!fs.existsSync(sourcePath)) throw new Error("source SQLite file not found");
  const copyDir = fs.mkdtempSync(path.join(os.tmpdir(), "carol-pg-rehearsal-"));
  const copyPath = path.join(copyDir, "snapshot.db");
  const source = new Database(sourcePath, { readonly: true });
  await source.backup(copyPath);
  source.close();
  const copy = new Database(copyPath, { readonly: true });
  const names = copy.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>;
  const tables = names.map(({ name }) => tableSnapshot(copy, name));
  copy.close();
  return { tables, copyPath };
}
function schemaName(): string {
  const requested = process.env.PG_REHEARSAL_SCHEMA?.trim();
  if (requested && !/^rehearsal_[a-z0-9_]+$/.test(requested)) throw new Error("PG_REHEARSAL_SCHEMA must be a dedicated rehearsal_* name");
  return requested || `rehearsal_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}
async function run(): Promise<void> {
  if (process.env.POSTGRES_REHEARSAL !== "1" || !process.env.DATABASE_URL) throw new Error("POSTGRES_REHEARSAL=1 and DATABASE_URL are required");
  const sourcePath = process.env.SQLITE_PATH || path.join(process.env.DATA_DIR || ".", "maimai.db");
  const targetSchema = schemaName();
  const snapshot = await loadSnapshot(sourcePath);
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  let committed = false;
  try {
    await client.connect();
    const existing = await client.query("SELECT 1 FROM pg_namespace WHERE nspname=$1", [targetSchema]);
    if (existing.rowCount) {
      const objects = await client.query("SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 LIMIT 1", [targetSchema]);
      if (objects.rowCount) throw new Error("rehearsal schema is not empty");
    } else await client.query(`CREATE SCHEMA ${quote(targetSchema)}`);
    await client.query("BEGIN");
    const qSchema = quote(targetSchema);
    await client.query(`CREATE TABLE ${qSchema}.sqlite_table_manifest (table_name text primary key, sqlite_sql text, row_count bigint not null, table_checksum text not null)`);
    await client.query(`CREATE TABLE ${qSchema}.sqlite_row_preservation (table_name text not null, row_number bigint not null, row_json text not null, row_checksum text not null, primary key(table_name,row_number), foreign key(table_name) references ${qSchema}.sqlite_table_manifest(table_name))`);
    for (const table of snapshot.tables) {
      await client.query(`INSERT INTO ${qSchema}.sqlite_table_manifest VALUES ($1,$2,$3,$4)`, [table.name, table.sql, table.rows.length, table.checksum]);
      const pgTable = `${targetSchema}.${quote(`sqlite_source__${table.name}`)}`;
      const pk = table.columns.filter((column) => column.pk > 0).sort((a, b) => a.pk - b.pk).map((column) => quote(column.name));
      const definitions = table.columns.map((column) => `${quote(column.name)} ${pgType(column)}`).concat(pk.length ? [`PRIMARY KEY (${pk.join(",")})`] : []);
      await client.query(`CREATE TABLE ${pgTable} (${definitions.join(",")})`);
      for (let index = 0; index < table.rows.length; index++) {
        const row = JSON.parse(table.rows[index].json) as Array<[string, { type: string; value: unknown }]>;
        const values = row.map(([, item]) => item.type === "blob" ? Buffer.from(String(item.value), "base64") : item.type === "null" ? null : item.value);
        const placeholders = values.map((_, i) => `$${i + 1}`).join(",");
        await client.query(`INSERT INTO ${pgTable} (${table.columns.map((column) => quote(column.name)).join(",")}) VALUES (${placeholders})`, values);
        await client.query(`INSERT INTO ${qSchema}.sqlite_row_preservation VALUES ($1,$2,$3,$4)`, [table.name, index, table.rows[index].json, table.rows[index].checksum]);
      }
    }
    for (const table of snapshot.tables) {
      const preservation = await client.query(`SELECT row_checksum FROM ${qSchema}.sqlite_row_preservation WHERE table_name=$1 ORDER BY row_number`, [table.name]);
      const preservedChecksums = preservation.rows.map((row: { row_checksum: string }) => row.row_checksum);
      const sourceCount = await client.query(`SELECT count(*)::bigint AS count FROM ${qSchema}.${quote(`sqlite_source__${table.name}`)}`);
      if (Number(sourceCount.rows[0].count) !== table.rows.length || preservedChecksums.length !== table.rows.length || hash(preservedChecksums.join("\n")) !== table.checksum) throw new Error("rehearsal checksum validation failed");
    }
    await client.query("COMMIT"); committed = true;
    const manifest = await client.query(`SELECT count(*),coalesce(sum(row_count),0) FROM ${qSchema}.sqlite_table_manifest`);
    console.log(`PostgreSQL rehearsal complete: ${manifest.rows[0].count} tables, ${manifest.rows[0].coalesce} rows, schema=${targetSchema}`);
  } finally {
    if (!committed) { try { await client.query("ROLLBACK"); } catch (_) {} }
    await client.end().catch(() => undefined);
    if (process.env.KEEP_REHEARSAL_SCHEMA !== "1") {
      const cleanup = new Client({ connectionString: process.env.DATABASE_URL });
      try { await cleanup.connect(); await cleanup.query(`DROP SCHEMA IF EXISTS ${quote(targetSchema)} CASCADE`); } finally { await cleanup.end().catch(() => undefined); }
    }
    fs.rmSync(path.dirname(snapshot.copyPath), { recursive: true, force: true });
  }
}
run().catch(() => { process.stderr.write("PostgreSQL rehearsal failed\n"); process.exitCode = 1; });
