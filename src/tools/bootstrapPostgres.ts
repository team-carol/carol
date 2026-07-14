#!/usr/bin/env node
/** One-shot, deliberately explicit SQLite -> PostgreSQL cutover bootstrap. */
import Database from "better-sqlite3";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Pool } from "pg";
import * as crypto from "node:crypto";
import { POSTGRES_SCHEMA, MIGRATION_VERSION } from "../storage/postgres";

const arg=(name:string)=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
const url=arg("--pg-url") ?? process.env.DATABASE_URL, source=arg("--sqlite") ?? process.env.SQLITE_IMPORT_PATH;
if(!url||!source){console.error("usage: bootstrapPostgres --pg-url URL --sqlite PATH");process.exit(2);}

function json(v:unknown){return JSON.stringify(v,(_k,x)=>Buffer.isBuffer(x)?{__blob_base64:x.toString('base64')}:x);}
async function main(){
 // Cutover is offline: stop the SQLite writer before copying its database.
 // Staging is private and writable; the source mount is never opened writable.
 const sourcePath=path.resolve(source!);
 const stagingDir=fs.mkdtempSync(path.join(os.tmpdir(),"carol-bootstrap-"));
 const stagedPath=path.join(stagingDir,"source.db");
 const snapshotPath=path.join(stagingDir,"snapshot.db");
 try {
  for(const suffix of ["","-wal","-shm"]){const input=sourcePath+suffix;if(fs.existsSync(input))fs.copyFileSync(input,stagedPath+suffix);}
  const staged=new Database(stagedPath);
  try { await staged.pragma("wal_checkpoint(TRUNCATE)"); await staged.backup(snapshotPath); } finally { staged.close(); }
 } catch(error) { fs.rmSync(stagingDir,{recursive:true,force:true}); throw error; }
 const backupPath="private staged snapshot";
 const sqlite=new Database(snapshotPath,{readonly:true}); const pg=new Pool({connectionString:url});
 try { const c=await pg.connect(); try { await c.query('BEGIN'); await c.query('SELECT pg_advisory_xact_lock($1)', [0x6361726f6c]); await c.query(POSTGRES_SCHEMA);
    const expectedSchemaChecksum=crypto.createHash('sha256').update(POSTGRES_SCHEMA).digest('hex');
    const m=await c.query<{version:number;checksum:string}>('SELECT version,checksum FROM storage_migrations ORDER BY version');
    if(m.rows.length>0){
      if(m.rows.length!==1 || m.rows[0].version!==MIGRATION_VERSION || !['sqlite-bootstrap',expectedSchemaChecksum].includes(m.rows[0].checksum)) throw new Error('PostgreSQL migration ledger contains incompatible entries');
      await c.query('COMMIT'); console.log(`PostgreSQL bootstrap already complete: version=${MIGRATION_VERSION}`); return;
    }
   const tables=sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as {name:string}[];
   const known=new Set(['profiles','sessions','jackets','guild_settings','song_jackets','map_images','constants_cache','daily_achievements','song_aliases','daily_achievement_snapshots','achievement_events','achievement_play_events','achievement_play_event_log','achievement_event_state','achievement_play_event_log_state','chart_record_baselines','chart_record_baseline_state']);
   let total=0;
   for(const {name} of tables){const rows=sqlite.prepare(`SELECT * FROM "${name.replace(/"/g,'""')}"`).all() as Record<string,unknown>[]; if(!known.has(name)){for(const row of rows) await c.query('INSERT INTO legacy_tables(table_name,columns_json,row_json,imported_at) VALUES($1,$2,$3,$4)',[name,JSON.stringify(Object.keys(row)),json(row),Date.now()]); total+=rows.length;continue;}
     const cols=sqlite.prepare(`PRAGMA table_info("${name.replace(/"/g,'""')}")`).all() as {name:string}[]; const targetCols=cols.map(x=>x.name); for(const row of rows){const vals=targetCols.map(x=>row[x]); const placeholders=vals.map((_,i)=>`$${i+1}`).join(','); await c.query(`INSERT INTO "${name}" (${targetCols.map(x=>'"'+x.replace(/"/g,'""')+'"').join(',')}) VALUES(${placeholders}) ON CONFLICT DO NOTHING`,vals); total++;}}
   await c.query('INSERT INTO storage_migrations(version,applied_at,checksum) VALUES($1,$2,$3) ON CONFLICT(version) DO NOTHING',[MIGRATION_VERSION,Date.now(),'sqlite-bootstrap']); await c.query('COMMIT');
   // Only counts and status are emitted; row values and secrets are never logged.
   console.log(`PostgreSQL bootstrap complete: ${total} rows; backup=${backupPath}`);
 } catch(e){await c.query('ROLLBACK');throw e;} finally{c.release();} } finally {sqlite.close();await pg.end();fs.rmSync(stagingDir,{recursive:true,force:true});}}
main().catch(e=>{console.error(`PostgreSQL bootstrap failed: ${e instanceof Error?e.message:'unknown error'}`);process.exitCode=1;});
