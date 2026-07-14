import Database from "better-sqlite3";
import * as path from "path";
import type { MaimaiProfile } from "./scraper";
import { parseCatalogScoreList, type CatalogScoreRecord } from "./scraper";
import { encrypt, decrypt } from "./crypto";
import * as crypto from "crypto";
import { ALIAS_SEED } from "./data/aliasSeed";

// ─── Types ──────────────────────────────────────────────────────────────
export interface CachedProfile {
  profileKey: string;
  server: MaimaiServer;
  friendCode: string;
  playerName: string;
  rating: number;
  ratingMax: number;
  trophy: string;
  trophyClass: string;
  avatar: string;
  gradeImg: string;
  stars: string;
  comment: string;
  playCount: number;
  totalPlayCount: number;
  rawHtml: string;
  lastSyncedAt: number;
  recentJson: string;
  topJson: string;
  clearJson: string;
  mapJson: string;
}

export interface DailyAchievementRecord {
  profileKey: string;
  playDay: string;
  chartKey: string;
  recordJson: string;
  achievementVal: number;
  playedAt: number;
  updatedAt: number;
}

export interface DailyAchievementSnapshotRecord {
  profileKey: string;
  playDay: string;
  chartKey: string;
  recordJson: string;
  achievementVal: number;
  playedAt: number;
  updatedAt: number;
}

export interface AchievementEventRecord {
  profileKey: string;
  discordUserId: string;
  playDay: string;
  chartKey: string;
  recordJson: string;
  achievementVal: number;
  playedAt: number;
  updatedAt: number;
}

export interface AchievementEventInput {
  profileKey: string;
  discordUserId: string;
  playDay: string;
  chartKey: string;
  recordJson: string;
  achievementVal: number;
  playedAt: number;
  updatedAt?: number;
  title: string;
  diff: string;
  level: string;
  musicKind: string;
  achievementText: string;
  ratingUp?: number | null;
  fc: string;
  sync: string;
}

/** Immutable, source-oriented play event.  `eventKey` is derived by the writer. */
export interface AchievementPlayEventInput {
  profileKey: string;
  discordUserId?: string;
  playDay: string;
  chartKey: string;
  detailIdx?: string;
  sourceSequence: number;
  playedAt: number;
  firstCapturedAt?: number;
  sourceKind?: string;
  legacyUpdatedAt?: number;
  recordJson: string;
  achievementVal: number;
  isNewScore?: boolean;
  ratingUp?: number | null;
  title?: string; diff?: string; level?: string; musicKind?: string;
  achievementText?: string; fc?: string; sync?: string;
}

export interface AchievementPlayEventRecord extends AchievementPlayEventInput {
  eventKey: string;
  identityKind: "source_play_id" | "legacy_fallback";
  identityVersion: number;
  chartKeyVersion: number;
  payloadHash: string;
}

export interface AchievementPlayEventLogInput {
  profileKey: string;
  sourcePlayId?: string;
  detailIdx?: string;
  isBaseline?: boolean;
  playedAt: number;
  sourceSequence: number;
  capturedAt?: number;
  sourceKind?: string;
  recordJson: string;
  achievementVal: number;
  fc: string; sync: string; ratingUp?: number | null;
  title: string; diff: string; level: string; musicKind: string; achievementText: string;
}

export interface AchievementPlayEventLogRecord extends AchievementPlayEventLogInput {
  eventKey: string;
  payloadHash: string;
}

export interface ChartRecordBaselineRecord extends CatalogScoreRecord {
  profileKey: string;
  observedAt: number;
  changedAt: number;
  sourceHash: string;
}

export const MAIMAI_SERVERS = ["intl", "jp"] as const;
export type MaimaiServer = (typeof MAIMAI_SERVERS)[number];

export function isMaimaiServer(value: string): value is MaimaiServer {
  return MAIMAI_SERVERS.includes(value as MaimaiServer);
}

export function profileKey(server: MaimaiServer, friendCode: string): string {
  return `${server}:${friendCode}`;
}

// ─── DB Setup ───────────────────────────────────────────────────────────
const DATA_DIR = process.env.DATA_DIR || ".";
const db = new Database(path.join(DATA_DIR, "maimai.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS profiles (
    friend_code TEXT PRIMARY KEY,
    player_name TEXT NOT NULL,
    rating INTEGER DEFAULT 0,
    rating_max INTEGER DEFAULT 0,
    trophy TEXT DEFAULT 'normal',
    trophy_class TEXT DEFAULT 'normal',
    avatar TEXT DEFAULT '',
    grade_img TEXT DEFAULT '',
    stars TEXT DEFAULT '0',
    comment TEXT DEFAULT '',
    play_count INTEGER DEFAULT 0,
    raw_html TEXT DEFAULT '',
    recent_json TEXT DEFAULT '[]',
    top_json TEXT DEFAULT '[]',
    clear_json TEXT DEFAULT '[]',
    last_synced_at INTEGER DEFAULT 0,
    achievement_initialized_at INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    discord_user_id TEXT PRIMARY KEY,
    cookie_json TEXT NOT NULL,
    friend_code TEXT DEFAULT '',
    sync_token TEXT DEFAULT '',
    avatar_blob TEXT DEFAULT '',
    updated_at INTEGER DEFAULT (strftime('%s','now') * 1000)
  );

  CREATE TABLE IF NOT EXISTS jackets (
    user_id TEXT NOT NULL,
    idx INTEGER NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (user_id, idx)
  );

  CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id TEXT PRIMARY KEY,
    auto_role INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS song_jackets (
    music_id TEXT PRIMARY KEY,
    data BLOB NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
  );

  CREATE TABLE IF NOT EXISTS map_images (
    image_url TEXT PRIMARY KEY,
    data BLOB NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
  );

  CREATE TABLE IF NOT EXISTS constants_cache (
    key TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS daily_achievements (
    profile_key TEXT NOT NULL,
    play_day TEXT NOT NULL,
    chart_key TEXT NOT NULL,
    record_json TEXT NOT NULL,
    achievement_val REAL DEFAULT 0,
    played_at INTEGER DEFAULT 0,
    updated_at INTEGER DEFAULT (strftime('%s','now') * 1000),
    PRIMARY KEY (profile_key, play_day, chart_key)
  );

  CREATE TABLE IF NOT EXISTS song_aliases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    alias TEXT NOT NULL,
    is_translation INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
    UNIQUE(title, alias)
  );
  CREATE INDEX IF NOT EXISTS idx_song_aliases_title ON song_aliases(title);

  CREATE TABLE IF NOT EXISTS daily_achievement_snapshots (
    profile_key TEXT NOT NULL,
    play_day TEXT NOT NULL,
    chart_key TEXT NOT NULL,
    record_json TEXT NOT NULL,
    achievement_val REAL DEFAULT 0,
    played_at INTEGER DEFAULT 0,
    updated_at INTEGER DEFAULT (strftime('%s','now') * 1000),
    PRIMARY KEY (profile_key, play_day, chart_key, updated_at)
  );

  CREATE TABLE IF NOT EXISTS achievement_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_key TEXT NOT NULL,
    discord_user_id TEXT NOT NULL DEFAULT '',
    play_day TEXT NOT NULL,
    chart_key TEXT NOT NULL,
    record_json TEXT NOT NULL,
    achievement_val REAL DEFAULT 0,
    played_at INTEGER DEFAULT 0,
    updated_at INTEGER DEFAULT (strftime('%s','now') * 1000),
    title TEXT NOT NULL DEFAULT '',
    diff TEXT NOT NULL DEFAULT '',
    level TEXT NOT NULL DEFAULT '',
    music_kind TEXT NOT NULL DEFAULT '',
    achievement_text TEXT NOT NULL DEFAULT '',
    rating_up INTEGER,
    fc TEXT NOT NULL DEFAULT '',
    sync TEXT NOT NULL DEFAULT '',
    UNIQUE(profile_key, chart_key, played_at)
  );
  CREATE INDEX IF NOT EXISTS idx_achievement_events_profile_day ON achievement_events(profile_key, play_day, chart_key, played_at);
  CREATE INDEX IF NOT EXISTS idx_achievement_events_profile_chart ON achievement_events(profile_key, chart_key, played_at, updated_at);

  CREATE TABLE IF NOT EXISTS achievement_play_events (
    event_key TEXT PRIMARY KEY,
    profile_key TEXT NOT NULL,
    discord_user_id TEXT NOT NULL DEFAULT '',
    identity_kind TEXT NOT NULL,
    identity_version INTEGER NOT NULL DEFAULT 1,
    source_play_id TEXT NOT NULL DEFAULT '',
    chart_key TEXT NOT NULL,
    chart_key_version INTEGER NOT NULL DEFAULT 1,
    source_sequence INTEGER NOT NULL,
    played_at INTEGER NOT NULL,
    play_day TEXT NOT NULL,
    first_captured_at INTEGER NOT NULL,
    source_kind TEXT NOT NULL DEFAULT 'history',
    legacy_updated_at INTEGER,
    achievement_val REAL NOT NULL,
    is_new_score INTEGER NOT NULL DEFAULT 0,
    rating_up REAL,
    title TEXT NOT NULL DEFAULT '', diff TEXT NOT NULL DEFAULT '',
    level TEXT NOT NULL DEFAULT '', music_kind TEXT NOT NULL DEFAULT '',
    achievement_text TEXT NOT NULL DEFAULT '', fc TEXT NOT NULL DEFAULT '', sync TEXT NOT NULL DEFAULT '',
    record_json TEXT NOT NULL, payload_hash TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_achievement_play_events_profile_day
    ON achievement_play_events(profile_key, play_day, chart_key, played_at, source_sequence, event_key);
  CREATE INDEX IF NOT EXISTS idx_achievement_play_events_profile_chart
    ON achievement_play_events(profile_key, chart_key, played_at, source_sequence, event_key);

  CREATE TABLE IF NOT EXISTS achievement_play_event_log (
    event_key TEXT PRIMARY KEY,
    profile_key TEXT NOT NULL,
    source_play_id TEXT NOT NULL,
    is_baseline INTEGER NOT NULL,
    played_at INTEGER NOT NULL,
    source_sequence INTEGER NOT NULL,
    captured_at INTEGER NOT NULL,
    source_kind TEXT NOT NULL DEFAULT 'history',
    achievement_val REAL NOT NULL,
    fc TEXT NOT NULL DEFAULT '', sync TEXT NOT NULL DEFAULT '', rating_up REAL,
    title TEXT NOT NULL DEFAULT '', diff TEXT NOT NULL DEFAULT '', level TEXT NOT NULL DEFAULT '',
    music_kind TEXT NOT NULL DEFAULT '', achievement_text TEXT NOT NULL DEFAULT '',
    record_json TEXT NOT NULL, payload_hash TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_achievement_play_event_log_timeline
    ON achievement_play_event_log(profile_key, is_baseline, played_at DESC, source_sequence DESC);
  CREATE INDEX IF NOT EXISTS idx_achievement_play_event_log_source
    ON achievement_play_event_log(profile_key, source_play_id);
  CREATE TABLE IF NOT EXISTS achievement_event_state (
    profile_key TEXT PRIMARY KEY,
    initialized_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS achievement_play_event_log_state (
    profile_key TEXT PRIMARY KEY,
    initialized_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS chart_record_baselines (
    profile_key TEXT NOT NULL, score_locator TEXT NOT NULL, diff TEXT NOT NULL,
    title TEXT NOT NULL, level TEXT NOT NULL, music_kind TEXT NOT NULL,
    achievement_val REAL NOT NULL, achievement_text TEXT NOT NULL,
    fc TEXT NOT NULL, sync TEXT NOT NULL, observed_at INTEGER NOT NULL,
    changed_at INTEGER NOT NULL, source_payload TEXT NOT NULL, source_hash TEXT NOT NULL,
    PRIMARY KEY (profile_key, score_locator, diff)
  );
  CREATE INDEX IF NOT EXISTS idx_chart_record_baselines_profile_diff
    ON chart_record_baselines(profile_key, diff, score_locator);
  CREATE TABLE IF NOT EXISTS chart_record_baseline_state (
    profile_key TEXT PRIMARY KEY, latest_capture INTEGER NOT NULL,
    row_count INTEGER NOT NULL, page_manifest TEXT NOT NULL
  );
`);
try { db.exec("ALTER TABLE song_aliases ADD COLUMN is_translation INTEGER DEFAULT 0"); } catch (_) {}
try { db.exec("ALTER TABLE sessions ADD COLUMN translate_titles INTEGER DEFAULT 0"); } catch (_) {}

try { db.exec("ALTER TABLE profiles ADD COLUMN top_json TEXT DEFAULT '[]'"); } catch (_) {}
try { db.exec("ALTER TABLE profiles ADD COLUMN clear_json TEXT DEFAULT '[]'"); } catch (_) {}
try { db.exec("ALTER TABLE profiles ADD COLUMN rating_card_blob BLOB DEFAULT NULL"); } catch (_) {}
try { db.exec("ALTER TABLE profiles ADD COLUMN rating_card_synced_at INTEGER DEFAULT 0"); } catch (_) {}
try { db.exec("ALTER TABLE profiles ADD COLUMN rating_card_version INTEGER DEFAULT 0"); } catch (_) {}
try { db.exec("ALTER TABLE profiles ADD COLUMN server_region TEXT DEFAULT 'intl'"); } catch (_) {}
try { db.exec("ALTER TABLE profiles ADD COLUMN display_friend_code TEXT DEFAULT ''"); } catch (_) {}
try { db.exec("ALTER TABLE profiles ADD COLUMN total_play_count INTEGER DEFAULT 0"); } catch (_) {}
try { db.exec("ALTER TABLE profiles ADD COLUMN map_json TEXT DEFAULT '[]'"); } catch (_) {}
let achievementInitColumnAdded = false;
try {
  db.exec("ALTER TABLE profiles ADD COLUMN achievement_initialized_at INTEGER DEFAULT 0");
  achievementInitColumnAdded = true;
} catch (_) {}
if (achievementInitColumnAdded) {
  db.prepare("UPDATE profiles SET achievement_initialized_at = ? WHERE achievement_initialized_at = 0").run(Date.now());
}
try { db.exec("ALTER TABLE sessions ADD COLUMN profile_private INTEGER DEFAULT 0"); } catch (_) {}
try { db.exec("ALTER TABLE sessions ADD COLUMN extra_bookmarklets TEXT DEFAULT '[]'"); } catch (_) {}
try { db.exec("ALTER TABLE sessions ADD COLUMN preset_bookmarklets TEXT DEFAULT '[]'"); } catch (_) {}
try { db.exec("ALTER TABLE sessions ADD COLUMN default_server TEXT DEFAULT 'intl'"); } catch (_) {}
try { db.exec("ALTER TABLE sessions ADD COLUMN friend_code_intl TEXT DEFAULT ''"); } catch (_) {}
try { db.exec("ALTER TABLE sessions ADD COLUMN friend_code_jp TEXT DEFAULT ''"); } catch (_) {}
try { db.exec("ALTER TABLE sessions ADD COLUMN avatar_blob_intl TEXT DEFAULT ''"); } catch (_) {}
try { db.exec("ALTER TABLE sessions ADD COLUMN avatar_blob_jp TEXT DEFAULT ''"); } catch (_) {}
try { db.exec("ALTER TABLE daily_achievements ADD COLUMN played_at INTEGER DEFAULT 0"); } catch (_) {}
try { db.exec("ALTER TABLE daily_achievement_snapshots ADD COLUMN played_at INTEGER DEFAULT 0"); } catch (_) {}
try { db.exec("ALTER TABLE achievement_events ADD COLUMN discord_user_id TEXT DEFAULT ''"); } catch (_) {}
try { db.exec("ALTER TABLE achievement_events ADD COLUMN title TEXT DEFAULT ''"); } catch (_) {}
try { db.exec("ALTER TABLE achievement_events ADD COLUMN diff TEXT DEFAULT ''"); } catch (_) {}
try { db.exec("ALTER TABLE achievement_events ADD COLUMN level TEXT DEFAULT ''"); } catch (_) {}
try { db.exec("ALTER TABLE achievement_events ADD COLUMN music_kind TEXT DEFAULT ''"); } catch (_) {}
try { db.exec("ALTER TABLE achievement_events ADD COLUMN achievement_text TEXT DEFAULT ''"); } catch (_) {}
try { db.exec("ALTER TABLE achievement_events ADD COLUMN rating_up INTEGER"); } catch (_) {}
try { db.exec("ALTER TABLE achievement_events ADD COLUMN fc TEXT DEFAULT ''"); } catch (_) {}
try { db.exec("ALTER TABLE achievement_events ADD COLUMN sync TEXT DEFAULT ''"); } catch (_) {}

// ─── 별명 시드 (최초 실행 시 song_aliases가 비어 있으면 번들 데이터로 채운다) ───
(function seedAliases() {
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM song_aliases").get() as { n: number };
  if (n > 0) return;
  const insert = db.prepare("INSERT OR IGNORE INTO song_aliases (title, alias) VALUES (?, ?)");
  const seed = db.transaction((rows: readonly [string, string][]) => {
    for (const [title, alias] of rows) insert.run(title, alias);
  });
  seed(ALIAS_SEED);
  console.log(`[db] song_aliases 시드 ${ALIAS_SEED.length}개 삽입`);
})();

// ─── Queries ────────────────────────────────────────────────────────────
const profileSelect = "friend_code AS profileKey, COALESCE(NULLIF(display_friend_code, ''), friend_code) AS friendCode, COALESCE(server_region, 'intl') AS server, player_name AS playerName, rating, rating_max AS ratingMax, trophy, trophy_class AS trophyClass, avatar, grade_img AS gradeImg, stars, comment, play_count AS playCount, COALESCE(total_play_count, 0) AS totalPlayCount, raw_html AS rawHtml, recent_json AS recentJson, top_json AS topJson, clear_json AS clearJson, COALESCE(map_json, '[]') AS mapJson, last_synced_at AS lastSyncedAt";
const stmtGet = db.prepare(`SELECT ${profileSelect} FROM profiles WHERE friend_code = ?`);
const stmtUpsert = db.prepare(`
  INSERT INTO profiles (friend_code, display_friend_code, server_region, player_name, rating, rating_max, trophy, trophy_class, avatar, grade_img, stars, comment, play_count, total_play_count, raw_html, recent_json, top_json, clear_json, map_json, last_synced_at)
  VALUES (@profileKey, @friendCode, @server, @playerName, @rating, @ratingMax, @trophy, @trophyClass, @avatar, @gradeImg, @stars, @comment, @playCount, @totalPlayCount, @rawHtml, @recentJson, @topJson, @clearJson, @mapJson, @lastSyncedAt)
  ON CONFLICT(friend_code) DO UPDATE SET
    display_friend_code = excluded.display_friend_code,
    server_region = excluded.server_region,
    player_name = excluded.player_name,
    rating = excluded.rating,
    rating_max = excluded.rating_max,
    trophy = excluded.trophy,
    trophy_class = excluded.trophy_class,
    avatar = excluded.avatar,
    grade_img = excluded.grade_img,
    stars = excluded.stars,
    comment = excluded.comment,
    play_count = excluded.play_count,
    total_play_count = excluded.total_play_count,
    raw_html = excluded.raw_html,
    recent_json = excluded.recent_json,
    top_json = excluded.top_json,
    clear_json = excluded.clear_json,
    map_json = excluded.map_json,
    last_synced_at = excluded.last_synced_at
`);
const stmtDelete = db.prepare("DELETE FROM profiles WHERE friend_code = ?");
const stmtUpsertDailyAchievement = db.prepare(`
  INSERT INTO daily_achievements (profile_key, play_day, chart_key, record_json, achievement_val, played_at, updated_at)
  VALUES (@profileKey, @playDay, @chartKey, @recordJson, @achievementVal, @playedAt, @updatedAt)
  ON CONFLICT(profile_key, play_day, chart_key) DO NOTHING
`);
const stmtUpsertDailyAchievementSnapshot = db.prepare(`
  INSERT INTO daily_achievement_snapshots (profile_key, play_day, chart_key, record_json, achievement_val, played_at, updated_at)
  VALUES (@profileKey, @playDay, @chartKey, @recordJson, @achievementVal, @playedAt, @updatedAt)
  ON CONFLICT(profile_key, play_day, chart_key, updated_at) DO UPDATE SET
    record_json = excluded.record_json,
    achievement_val = excluded.achievement_val,
    updated_at = excluded.updated_at
`);
const stmtUpsertAchievementEvent = db.prepare(`
  INSERT INTO achievement_events (
    profile_key, discord_user_id, play_day, chart_key, record_json, achievement_val,
    played_at, updated_at, title, diff, level, music_kind, achievement_text, rating_up, fc, sync
  )
  VALUES (
    @profileKey, @discordUserId, @playDay, @chartKey, @recordJson, @achievementVal,
    @playedAt, @updatedAt, @title, @diff, @level, @musicKind, @achievementText, @ratingUp, @fc, @sync
  )
  ON CONFLICT(profile_key, chart_key, played_at) DO UPDATE SET
    discord_user_id = excluded.discord_user_id,
    play_day = excluded.play_day,
    record_json = excluded.record_json,
    achievement_val = excluded.achievement_val,
    updated_at = excluded.updated_at,
    title = excluded.title,
    diff = excluded.diff,
    level = excluded.level,
    music_kind = excluded.music_kind,
    achievement_text = excluded.achievement_text,
    rating_up = excluded.rating_up,
    fc = excluded.fc,
    sync = excluded.sync
`);
const stmtInsertAchievementPlayEvent = db.prepare(`
  INSERT INTO achievement_play_events (
    event_key, profile_key, discord_user_id, identity_kind, identity_version,
    source_play_id, chart_key, chart_key_version, source_sequence, played_at,
    play_day, first_captured_at, source_kind, legacy_updated_at, achievement_val,
    is_new_score, rating_up, title, diff, level, music_kind, achievement_text,
    fc, sync, record_json, payload_hash
  ) VALUES (
    @eventKey, @profileKey, @discordUserId, @identityKind, 1, @sourcePlayId,
    @chartKey, 1, @sourceSequence, @playedAt, @playDay, @firstCapturedAt,
    @sourceKind, @legacyUpdatedAt, @achievementVal, @isNewScore, @ratingUp,
    @title, @diff, @level, @musicKind, @achievementText, @fc, @sync,
    @recordJson, @payloadHash
  ) ON CONFLICT(event_key) DO UPDATE SET
    rating_up = CASE WHEN achievement_play_events.rating_up IS NULL
      THEN excluded.rating_up ELSE achievement_play_events.rating_up END
`);

// ─── Public API ─────────────────────────────────────────────────────────
export function cacheProfile(profile: MaimaiProfile, playCount: number, rawHtml: string, recentJson = "[]", topJson = "[]", clearJson = "[]", server: MaimaiServer = "intl", mapJson = "[]"): string {
  const friendCode = profile.friendCode ?? "me";
  const key = profileKey(server, friendCode);
  const data: CachedProfile = {
    profileKey: key,
    server,
    friendCode,
    playerName: profile.playerName,
    rating: profile.rating,
    ratingMax: profile.ratingMax,
    trophy: profile.trophy,
    trophyClass: profile.trophyClass,
    avatar: profile.avatar,
    gradeImg: profile.gradeImg,
    stars: profile.stars,
    comment: profile.comment ?? "",
    playCount,
    totalPlayCount: profile.totalPlayCount ?? playCount,
    rawHtml,
    recentJson,
    topJson,
    clearJson,
    mapJson,
    lastSyncedAt: Date.now(),
  };
  stmtUpsert.run(data);
  return key;
}

export function getCachedProfile(friendCode: string): CachedProfile | null {
  const row = stmtGet.get(friendCode) as CachedProfile | undefined;
  if (!row && /^\d{13}$/.test(friendCode)) {
    const intlRow = stmtGet.get(profileKey("intl", friendCode)) as CachedProfile | undefined;
    return intlRow ?? null;
  }
  return row ?? null;
}

export function getAllCachedProfiles(): CachedProfile[] {
  return db.prepare(`SELECT ${profileSelect} FROM profiles ORDER BY last_synced_at DESC`).all() as CachedProfile[];
}

export function getAchievementInitializedAt(profileKeyValue: string): number {
  const row = db.prepare("SELECT achievement_initialized_at AS initializedAt FROM profiles WHERE friend_code = ?").get(profileKeyValue) as { initializedAt?: number | null } | undefined;
  return typeof row?.initializedAt === "number" && row.initializedAt > 0 ? row.initializedAt : 0;
}

export function hasAchievementSnapshots(profileKeyValue: string): boolean {
  const row = db.prepare("SELECT 1 AS found FROM daily_achievement_snapshots WHERE profile_key = ? LIMIT 1").get(profileKeyValue) as { found?: number } | undefined;
  return row?.found === 1;
}

export function getAchievementRepeatedFromDay(profileKeyValue: string): string | null {
  const row = db.prepare(`
    SELECT MIN(play_day) AS playDay
    FROM (
      SELECT play_day
      FROM daily_achievement_snapshots
      WHERE profile_key = ?
      GROUP BY play_day, chart_key
      HAVING COUNT(*) > 1
    )
  `).get(profileKeyValue) as { playDay?: string | null } | undefined;
  return typeof row?.playDay === "string" ? row.playDay : null;
}

export function markAchievementInitialized(profileKeyValue: string, initializedAt = Date.now()): void {
  db.prepare(`
    UPDATE profiles
    SET achievement_initialized_at = ?
    WHERE friend_code = ?
  `).run(initializedAt, profileKeyValue);
}

export function deleteCachedProfile(friendCode: string): void {
  stmtDelete.run(friendCode);
}

export function saveDailyAchievement(
  profileKeyValue: string,
  playDay: string,
  chartKeyValue: string,
  recordJson: string,
  achievementVal: number,
  playedAt: number,
  updatedAt = Date.now(),
): void {
  stmtUpsertDailyAchievement.run({
    profileKey: profileKeyValue,
    playDay,
    chartKey: chartKeyValue,
    recordJson,
    achievementVal,
    playedAt,
    updatedAt,
  });
}

export function saveDailyAchievementSnapshot(
  profileKeyValue: string,
  playDay: string,
  chartKeyValue: string,
  recordJson: string,
  achievementVal: number,
  playedAt: number,
  updatedAt = Date.now(),
): void {
  stmtUpsertDailyAchievementSnapshot.run({
    profileKey: profileKeyValue,
    playDay,
    chartKey: chartKeyValue,
    recordJson,
    achievementVal,
    playedAt,
    updatedAt,
  });
}

export function saveAchievementEvent(event: AchievementEventInput): void;
/** Compatibility overload for the reviewed draft API; this table remains untouched. */
export function saveAchievementEvent(profileKey: string, playDay: string, chartKeyValue: string, recordJson: string, achievementVal: number, playedAt: number, updatedAt?: number): void;
export function saveAchievementEvent(eventOrProfile: AchievementEventInput | string, playDay?: string, chartKeyValue?: string, recordJson?: string, achievementVal?: number, playedAt?: number, updatedAt?: number): void {
  const event: AchievementEventInput = typeof eventOrProfile === "string" ? {
    profileKey: eventOrProfile, discordUserId: "", playDay: playDay ?? "", chartKey: chartKeyValue ?? "",
    recordJson: recordJson ?? "{}", achievementVal: achievementVal ?? 0, playedAt: playedAt ?? 0,
    updatedAt, title: "", diff: "", level: "", musicKind: "", achievementText: "", fc: "", sync: "",
  } : eventOrProfile;
  stmtUpsertAchievementEvent.run({
    profileKey: event.profileKey,
    discordUserId: event.discordUserId,
    playDay: event.playDay,
    chartKey: event.chartKey,
    recordJson: event.recordJson,
    achievementVal: event.achievementVal,
    playedAt: event.playedAt,
    updatedAt: event.updatedAt ?? Date.now(),
    title: event.title,
    diff: event.diff,
    level: event.level,
    musicKind: event.musicKind,
    achievementText: event.achievementText,
    ratingUp: event.ratingUp ?? null,
    fc: event.fc,
    sync: event.sync,
  });
}

export function getAchievementEvents(profileKeyValue: string, playDay?: string): AchievementEventRecord[] {
  return db.prepare(`SELECT profile_key AS profileKey, discord_user_id AS discordUserId,
    play_day AS playDay, chart_key AS chartKey, record_json AS recordJson,
    achievement_val AS achievementVal, played_at AS playedAt, updated_at AS updatedAt
    FROM achievement_events WHERE profile_key = ? AND (? IS NULL OR play_day = ?)
    ORDER BY played_at ASC, updated_at ASC`).all(profileKeyValue, playDay ?? null, playDay ?? null) as AchievementEventRecord[];
}

/**
 * Insert the canonical event.  The event key deliberately excludes capture
 * time and payload: rolling history pages must not create new plays.
 * Invalid timestamps are quarantined by omission rather than given Date.now().
 */
export function saveAchievementPlayEvent(event: AchievementPlayEventInput): string | null {
  if (!Number.isFinite(event.playedAt) || event.playedAt <= 0 || !event.chartKey || !event.playDay) return null;
  const sourcePlayId = event.detailIdx?.trim() || `legacy:${event.playedAt}:${event.chartKey}:${event.sourceSequence}`;
  const identityKind = event.detailIdx?.trim() ? "source_play_id" : "legacy_fallback";
  const identity = `${event.profileKey}\u001f${identityKind}\u001f${sourcePlayId}\u001f${event.chartKey}`;
  const eventKey = crypto.createHash("sha256").update(identity).digest("hex");
  const payloadHash = crypto.createHash("sha256").update(event.recordJson).digest("hex");
  stmtInsertAchievementPlayEvent.run({
    eventKey, profileKey: event.profileKey, discordUserId: event.discordUserId ?? "",
    identityKind, sourcePlayId, chartKey: event.chartKey, sourceSequence: event.sourceSequence,
    playedAt: event.playedAt, playDay: event.playDay, firstCapturedAt: event.firstCapturedAt ?? Date.now(),
    sourceKind: event.sourceKind ?? "history", legacyUpdatedAt: event.legacyUpdatedAt ?? null,
    achievementVal: event.achievementVal, isNewScore: event.isNewScore ? 1 : 0,
    ratingUp: event.ratingUp ?? null, title: event.title ?? "", diff: event.diff ?? "",
    level: event.level ?? "", musicKind: event.musicKind ?? "", achievementText: event.achievementText ?? "",
    fc: event.fc ?? "", sync: event.sync ?? "", recordJson: event.recordJson, payloadHash,
  });
  return eventKey;
}

export function getAchievementPlayEvents(profileKeyValue: string, playDay?: string): AchievementPlayEventRecord[] {
  const rows = db.prepare(`SELECT event_key AS eventKey, profile_key AS profileKey,
    discord_user_id AS discordUserId, play_day AS playDay, chart_key AS chartKey,
    source_play_id AS detailIdx, source_sequence AS sourceSequence, played_at AS playedAt,
    first_captured_at AS firstCapturedAt, source_kind AS sourceKind, legacy_updated_at AS legacyUpdatedAt,
    record_json AS recordJson, achievement_val AS achievementVal, is_new_score AS isNewScore,
    rating_up AS ratingUp, title, diff, level, music_kind AS musicKind,
    achievement_text AS achievementText, fc, sync, identity_kind AS identityKind,
    identity_version AS identityVersion, chart_key_version AS chartKeyVersion, payload_hash AS payloadHash
    FROM achievement_play_events WHERE profile_key = ? AND (? IS NULL OR play_day = ?)
    ORDER BY played_at ASC, source_sequence ASC, event_key ASC`).all(profileKeyValue, playDay ?? null, playDay ?? null) as AchievementPlayEventRecord[];
  return rows;
}

const stmtInsertPlayEventLog = db.prepare(`INSERT INTO achievement_play_event_log
  (event_key, profile_key, source_play_id, is_baseline, played_at, source_sequence, captured_at, source_kind,
   achievement_val, fc, sync, rating_up, title, diff, level, music_kind, achievement_text, record_json, payload_hash)
  VALUES (@eventKey, @profileKey, @sourcePlayId, @isBaseline, @playedAt, @sourceSequence, @capturedAt, @sourceKind,
   @achievementVal, @fc, @sync, @ratingUp, @title, @diff, @level, @musicKind, @achievementText, @recordJson, @payloadHash)
  ON CONFLICT(event_key) DO UPDATE SET rating_up = CASE
    WHEN achievement_play_event_log.rating_up IS NULL THEN excluded.rating_up
    ELSE achievement_play_event_log.rating_up END`);
const stmtInsertEventLogState = db.prepare("INSERT INTO achievement_play_event_log_state (profile_key, initialized_at) VALUES (?, ?)");

function eventLogKey(profileKeyValue: string, sourcePlayId: string): string {
  return crypto.createHash("sha256").update(`achievement-play-event-log\u001f${profileKeyValue}\u001f${sourcePlayId}`).digest("hex");
}

/** Atomically validates and ingests one complete source history batch. */
export function saveAchievementPlayEventLogBatch(events: readonly AchievementPlayEventLogInput[], capturedAt = Date.now()): "initialized" | "ok" {
  const ids = new Set<string>();
  if (events.length === 0 || !Number.isFinite(capturedAt) || capturedAt <= 0) throw new Error("canonical history batch is empty or invalid");
  for (const event of events) {
    const sourcePlayId = (event.sourcePlayId ?? event.detailIdx ?? "").trim();
    if (event.profileKey !== events[0].profileKey || !event.profileKey || !sourcePlayId || ids.has(sourcePlayId) ||
      !Number.isFinite(event.playedAt) || event.playedAt <= 0) throw new Error("invalid canonical history batch");
    ids.add(sourcePlayId);
  }
  const transaction = db.transaction(() => {
    const state = db.prepare("SELECT 1 AS found FROM achievement_play_event_log_state WHERE profile_key = ?").get(events[0].profileKey) as { found?: number } | undefined;
    const initializing = state?.found !== 1;
    for (const event of events) {
      const sourcePlayId = (event.sourcePlayId ?? event.detailIdx ?? "").trim();
      const payloadHash = crypto.createHash("sha256").update(event.recordJson).digest("hex");
      stmtInsertPlayEventLog.run({
        eventKey: eventLogKey(event.profileKey, sourcePlayId), profileKey: event.profileKey,
        sourcePlayId, isBaseline: initializing ? 1 : 0,
        playedAt: event.playedAt, sourceSequence: event.sourceSequence, capturedAt,
        sourceKind: event.sourceKind ?? "history",
        achievementVal: event.achievementVal, fc: event.fc, sync: event.sync, ratingUp: event.ratingUp ?? null,
        title: event.title, diff: event.diff, level: event.level, musicKind: event.musicKind,
        achievementText: event.achievementText, recordJson: event.recordJson, payloadHash,
      });
    }
    if (initializing) stmtInsertEventLogState.run(events[0].profileKey, capturedAt);
    return initializing ? "initialized" as const : "ok" as const;
  });
  return transaction();
}

export function hasAchievementEventLogState(profileKeyValue: string): boolean {
  const row = db.prepare("SELECT 1 AS found FROM achievement_play_event_log_state WHERE profile_key = ?").get(profileKeyValue) as { found?: number } | undefined;
  return row?.found === 1;
}

export function getAchievementPlayEventLog(profileKeyValue: string, fromPlayedAt: number, toPlayedAt: number): AchievementPlayEventLogRecord[] {
  return db.prepare(`SELECT event_key AS eventKey, profile_key AS profileKey, source_play_id AS sourcePlayId,
    is_baseline AS isBaseline, played_at AS playedAt, source_sequence AS sourceSequence,
    captured_at AS capturedAt, source_kind AS sourceKind, achievement_val AS achievementVal, fc, sync, rating_up AS ratingUp,
    title, diff, level, music_kind AS musicKind, achievement_text AS achievementText,
    record_json AS recordJson, payload_hash AS payloadHash
    FROM achievement_play_event_log
    WHERE profile_key = ? AND is_baseline = 0 AND played_at >= ? AND played_at < ?
    ORDER BY played_at DESC, source_sequence DESC, event_key DESC`).all(profileKeyValue, fromPlayedAt, toPlayedAt) as AchievementPlayEventLogRecord[];
}

export function isChartRecordCatalogDue(profileKeyValue: string, now = Date.now(), intervalMs = 12 * 60 * 60 * 1000): boolean {
  const row = db.prepare("SELECT latest_capture AS latestCapture FROM chart_record_baseline_state WHERE profile_key = ?").get(profileKeyValue) as { latestCapture?: number } | undefined;
  return !row || now - row.latestCapture! >= intervalMs;
}

/** Parse and validate all five catalog pages before the single SQLite transaction. */
export function saveChartRecordCatalogBatch(profileKeyValue: string, pages: readonly [string, string, string, string, string], capturedAt = Date.now()): { rowCount: number } {
  if (pages.length !== 5 || !Number.isFinite(capturedAt) || capturedAt <= 0) throw new Error("catalog requires five pages");
  const parsed = pages.flatMap((html, index) => parseCatalogScoreList(html, ["BASIC", "ADVANCED", "EXPERT", "MASTER", "Re:MASTER"][index]));
  const seen = new Set<string>();
  for (const row of parsed) { const key = `${row.scoreLocator}\u001f${row.diff}`; if (seen.has(key)) throw new Error("duplicate catalog locator"); seen.add(key); }
  const manifest = JSON.stringify(pages.map((page) => crypto.createHash("sha256").update(page).digest("hex")));
  const transaction = db.transaction(() => {
    const select = db.prepare("SELECT title,level,music_kind AS musicKind,achievement_val AS achievementVal,achievement_text AS achievementText,fc,sync FROM chart_record_baselines WHERE profile_key = ? AND score_locator = ? AND diff = ?");
    const insert = db.prepare(`INSERT INTO chart_record_baselines
      (profile_key,score_locator,diff,title,level,music_kind,achievement_val,achievement_text,fc,sync,observed_at,changed_at,source_payload,source_hash)
      VALUES (@profileKey,@scoreLocator,@diff,@title,@level,@musicKind,@achievementVal,@achievementText,@fc,@sync,@observedAt,@changedAt,@sourcePayload,@sourceHash)`);
    const observe = db.prepare("UPDATE chart_record_baselines SET observed_at = @observedAt WHERE profile_key = @profileKey AND score_locator = @scoreLocator AND diff = @diff");
    const change = db.prepare(`UPDATE chart_record_baselines SET title=@title,level=@level,music_kind=@musicKind,achievement_val=@achievementVal,achievement_text=@achievementText,fc=@fc,sync=@sync,observed_at=@observedAt,changed_at=@changedAt,source_payload=@sourcePayload,source_hash=@sourceHash WHERE profile_key=@profileKey AND score_locator=@scoreLocator AND diff=@diff`);
    for (const row of parsed) {
      const args = { profileKey: profileKeyValue, scoreLocator: row.scoreLocator, diff: row.diff, title: row.title, level: row.level, musicKind: row.musicKind, achievementVal: row.achievementVal, achievementText: row.achievement, fc: row.fc, sync: row.sync, observedAt: capturedAt, changedAt: capturedAt, sourcePayload: row.sourcePayload, sourceHash: crypto.createHash("sha256").update(row.sourcePayload).digest("hex") };
      const old = select.get(profileKeyValue, row.scoreLocator, row.diff) as (typeof args & { achievementVal: number }) | undefined;
      if (!old) insert.run(args);
      else if (old.title !== row.title || old.level !== row.level || old.musicKind !== row.musicKind || old.achievementVal !== row.achievementVal || old.achievementText !== row.achievement || old.fc !== row.fc || old.sync !== row.sync) change.run(args);
      else observe.run(args);
    }
    db.prepare(`INSERT INTO chart_record_baseline_state(profile_key,latest_capture,row_count,page_manifest) VALUES (?,?,?,?)
      ON CONFLICT(profile_key) DO UPDATE SET latest_capture=excluded.latest_capture,row_count=excluded.row_count,page_manifest=excluded.page_manifest`).run(profileKeyValue, capturedAt, parsed.length, manifest);
    return { rowCount: parsed.length };
  });
  return transaction();
}

export function getChartRecordBaselines(profileKeyValue: string): ChartRecordBaselineRecord[] {
  return db.prepare(`SELECT profile_key AS profileKey, score_locator AS scoreLocator, diff, title, level,
    music_kind AS musicKind, achievement_val AS achievementVal, achievement_text AS achievement,
    fc, sync, observed_at AS observedAt, changed_at AS changedAt, source_payload AS sourcePayload,
    source_hash AS sourceHash FROM chart_record_baselines WHERE profile_key = ? ORDER BY score_locator, diff`).all(profileKeyValue) as ChartRecordBaselineRecord[];
}

export function pruneDailyAchievements(_retainDays = 7): number {
  return 0;
}

export function getDailyAchievements(profileKeyValue: string, playDay: string): DailyAchievementRecord[] {
  if (hasAchievementEventLogState(profileKeyValue)) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(playDay);
    if (!match) return [];
    // Discord's achievement day starts at 05:00 KST (20:00 UTC prior day).
    const from = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), -4);
    return db.prepare(`SELECT profile_key AS profileKey, ? AS playDay, '' AS chartKey,
      CASE WHEN rating_up IS NULL THEN record_json ELSE json_set(record_json, '$.ratingUp', rating_up) END AS recordJson,
      achievement_val AS achievementVal, played_at AS playedAt,
      captured_at AS updatedAt FROM achievement_play_event_log
      WHERE profile_key = ? AND is_baseline = 0 AND played_at >= ? AND played_at < ?
      ORDER BY played_at DESC, source_sequence DESC, event_key DESC`)
      .all(playDay, profileKeyValue, from, from + 86_400_000) as DailyAchievementRecord[];
  }
  return db.prepare(`
    WITH snapshot_rows AS (
      SELECT profile_key, play_day, chart_key, record_json, achievement_val, played_at, updated_at,
        CASE WHEN json_extract(record_json, '$.isNewScore') = 1 THEN 1 ELSE 0 END AS is_new_score,
        CASE WHEN json_extract(record_json, '$.fc') IN ('FC', 'FC+', 'AP', 'AP+')
          OR json_extract(record_json, '$.sync') IN ('FS', 'FS+', 'FDX', 'FDX+') THEN 1 ELSE 0 END AS is_performance_mark,
        MAX(achievement_val) OVER (
          PARTITION BY chart_key
          ORDER BY updated_at
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ) AS previous_best
      FROM daily_achievement_snapshots
      JOIN profiles ON profiles.friend_code = daily_achievement_snapshots.profile_key
      WHERE profile_key = ?
    ), snapshot_achievements AS (
      SELECT profile_key AS profileKey, play_day AS playDay, chart_key AS chartKey,
        record_json AS recordJson, achievement_val AS achievementVal,
        played_at AS playedAt, updated_at AS updatedAt,
        ROW_NUMBER() OVER (PARTITION BY play_day, chart_key ORDER BY achievement_val DESC, updated_at ASC) AS event_rank
      FROM snapshot_rows
      WHERE is_performance_mark = 1
        OR (is_new_score = 1 AND (previous_best IS NULL OR achievement_val > previous_best))
    )
    SELECT profileKey, playDay, chartKey, recordJson, achievementVal, playedAt, updatedAt
    FROM snapshot_achievements
    WHERE playDay = ? AND event_rank = 1
    ORDER BY achievementVal DESC, playedAt DESC
  `).all(profileKeyValue, playDay) as DailyAchievementRecord[];
}

export function getDailyAchievementSnapshots(profileKeyValue: string, playDay: string): DailyAchievementSnapshotRecord[] {
  return db.prepare(`
    SELECT profile_key AS profileKey, play_day AS playDay, chart_key AS chartKey,
      record_json AS recordJson, achievement_val AS achievementVal,
      played_at AS playedAt, updated_at AS updatedAt
    FROM daily_achievement_snapshots
    WHERE profile_key = ? AND play_day = ?
    ORDER BY updated_at ASC
  `).all(profileKeyValue, playDay) as DailyAchievementSnapshotRecord[];
}

export function getPreviousDailyAchievementVal(profileKeyValue: string, chartKeyValue: string, updatedAt: number): number | null {
  const row = db.prepare(`
    SELECT MAX(achievement_val) AS achievementVal
    FROM daily_achievement_snapshots
    WHERE profile_key = ? AND chart_key = ? AND updated_at < ?
  `).get(profileKeyValue, chartKeyValue, updatedAt) as { achievementVal?: number | null } | undefined;
  return typeof row?.achievementVal === "number" ? row.achievementVal : null;
}

export function getPreviousDailyAchievementValBeforePlay(profileKeyValue: string, chartKeyValue: string, playedAt: number, updatedAt: number, newScoreOnly = false): number | null {
  const row = db.prepare(`
    SELECT MAX(achievement_val) AS achievementVal
    FROM daily_achievement_snapshots
    WHERE profile_key = ? AND chart_key = ?
      AND (played_at < ? OR (played_at = ? AND updated_at < ?))
      AND (? = 0 OR json_extract(record_json, '$.isNewScore') = 1)
  `).get(profileKeyValue, chartKeyValue, playedAt, playedAt, updatedAt, newScoreOnly ? 1 : 0) as { achievementVal?: number | null } | undefined;
  return typeof row?.achievementVal === "number" ? row.achievementVal : null;
}

export function getLastSync(friendCode: string): number | null {
  const row = getCachedProfile(friendCode);
  return row ? row.lastSyncedAt : null;
}

export function needsSync(friendCode: string, currentPlayCount: number): boolean {
  const cached = getCachedProfile(friendCode);
  if (!cached) return true;
  return cached.playCount !== currentPlayCount;
}

export function closeDb(): void {
  db.close();
}

// ─── Session management ─────────────────────────────────────────────────
interface StoredSession {
  discord_user_id: string;
  cookie_json: string;
  friend_code: string;
  friend_code_intl: string;
  friend_code_jp: string;
  avatar_blob: string;
  avatar_blob_intl: string;
  avatar_blob_jp: string;
  default_server: string;
  sync_token: string;
  updated_at: number;
}

function friendCodeColumn(server: MaimaiServer): "friend_code_intl" | "friend_code_jp" {
  return server === "intl" ? "friend_code_intl" : "friend_code_jp";
}

function avatarBlobColumn(server: MaimaiServer): "avatar_blob_intl" | "avatar_blob_jp" {
  return server === "intl" ? "avatar_blob_intl" : "avatar_blob_jp";
}

function selectedFriendCode(row: Pick<StoredSession, "friend_code" | "friend_code_intl" | "friend_code_jp" | "default_server">): string {
  const server = isMaimaiServer(row.default_server) ? row.default_server : "intl";
  return server === "intl" ? row.friend_code_intl : row.friend_code_jp;
}

function selectedAvatarBlob(
  row: Pick<StoredSession, "avatar_blob" | "avatar_blob_intl" | "avatar_blob_jp" | "default_server">,
  server?: MaimaiServer,
): string {
  const activeServer = server ?? (isMaimaiServer(row.default_server) ? row.default_server : "intl");
  const serverAvatar = activeServer === "intl" ? row.avatar_blob_intl : row.avatar_blob_jp;
  return serverAvatar || row.avatar_blob || "";
}

export function saveUserSession(discordUserId: string, cookieJson: string, friendCode = "", server: MaimaiServer = "intl"): void {
  console.log(`[db] 세션 저장: user=${discordUserId.slice(-6)}, server=${server}, fc=${friendCode || "(없음)"}`);
  const encrypted = encrypt(cookieJson);
  const column = friendCodeColumn(server);
  db.prepare(`
    INSERT INTO sessions (discord_user_id, cookie_json, friend_code, ${column}, default_server, profile_private, updated_at)
    VALUES (?, ?, ?, ?, ?, 0, ?)
    ON CONFLICT(discord_user_id) DO UPDATE SET
      cookie_json = excluded.cookie_json,
      ${column} = COALESCE(NULLIF(excluded.${column}, ''), sessions.${column}),
      default_server = CASE
        WHEN COALESCE(sessions.friend_code, '') = '' THEN excluded.default_server
        ELSE sessions.default_server
      END,
      friend_code = CASE
        WHEN COALESCE(sessions.friend_code, '') = '' OR sessions.default_server = excluded.default_server
          THEN COALESCE(NULLIF(excluded.friend_code, ''), sessions.friend_code)
        ELSE sessions.friend_code
      END,
      updated_at = excluded.updated_at
  `).run(discordUserId, encrypted, friendCode, friendCode, server, Date.now());
}

export function loadUserSession(discordUserId: string): { friendCode: string } | null {
  const row = db.prepare("SELECT * FROM sessions WHERE discord_user_id = ?").get(discordUserId) as StoredSession | undefined;
  console.log(`[db] 세션 로드: user=${discordUserId.slice(-6)}, found=${!!row}`);
  if (!row) return null;
  try {
    const decrypted = decrypt(row.cookie_json);
    const fc = selectedFriendCode(row);
    console.log(`[db] 복호화 성공, fc=${fc}`);
    return { friendCode: fc };
  } catch (e) {
    console.error(`[db] 복호화 실패: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

export function getUserFriendCode(discordUserId: string): string | null {
  const row = db.prepare("SELECT friend_code, friend_code_intl, friend_code_jp, default_server FROM sessions WHERE discord_user_id = ?").get(discordUserId) as Pick<StoredSession, "friend_code" | "friend_code_intl" | "friend_code_jp" | "default_server"> | undefined;
  return row ? selectedFriendCode(row) || null : null;
}

export function getUserFriendCodeForServer(discordUserId: string, server: MaimaiServer): string | null {
  const column = friendCodeColumn(server);
  const row = db.prepare(`SELECT ${column} AS friendCode FROM sessions WHERE discord_user_id = ?`).get(discordUserId) as { friendCode?: string | null } | undefined;
  return row?.friendCode || null;
}

export function getUserDefaultServer(discordUserId: string): MaimaiServer {
  const row = db.prepare("SELECT default_server FROM sessions WHERE discord_user_id = ?").get(discordUserId) as { default_server: string | null } | undefined;
  return row?.default_server && isMaimaiServer(row.default_server) ? row.default_server : "intl";
}

export function setUserDefaultServer(discordUserId: string, server: MaimaiServer): number {
  const column = friendCodeColumn(server);
  const info = db.prepare(`
    INSERT INTO sessions (discord_user_id, cookie_json, default_server, friend_code, profile_private, updated_at)
    VALUES (?, '{}', ?, '', 0, ?)
    ON CONFLICT(discord_user_id) DO UPDATE SET
      default_server = excluded.default_server,
      friend_code = COALESCE(NULLIF(sessions.${column}, ''), ''),
      updated_at = excluded.updated_at
  `).run(discordUserId, server, Date.now());
  return info.changes;
}

// ─── Persistent sync token per user ─────────────────────────────────────
export function getUserSyncToken(discordUserId: string): string {
  const row = db.prepare("SELECT sync_token FROM sessions WHERE discord_user_id = ?").get(discordUserId) as { sync_token: string } | undefined;
  if (row?.sync_token) return row.sync_token;
  const token = crypto.randomBytes(12).toString("hex");
  db.prepare(`
    INSERT INTO sessions (discord_user_id, cookie_json, sync_token, profile_private, updated_at)
    VALUES (?, '{}', ?, 0, ?)
    ON CONFLICT(discord_user_id) DO UPDATE SET sync_token = excluded.sync_token
  `).run(discordUserId, token, Date.now());
  return token;
}

export function findUserBySyncToken(token: string): string | null {
  const row = db.prepare("SELECT discord_user_id FROM sessions WHERE sync_token = ?").get(token) as { discord_user_id: string } | undefined;
  return row?.discord_user_id ?? null;
}

export function saveAvatarBlob(userId: string, server: MaimaiServer, base64: string): void {
  const column = avatarBlobColumn(server);
  db.prepare(`
    INSERT INTO sessions (discord_user_id, cookie_json, avatar_blob, ${column}, profile_private, updated_at)
    VALUES (?, '{}', ?, ?, 0, ?)
    ON CONFLICT(discord_user_id) DO UPDATE SET
      avatar_blob = excluded.avatar_blob,
      ${column} = excluded.${column},
      updated_at = excluded.updated_at
  `).run(userId, base64, base64, Date.now());
}

export function getAvatarBlob(userId: string, server?: MaimaiServer): Buffer | null {
  const row = db.prepare("SELECT avatar_blob, avatar_blob_intl, avatar_blob_jp, default_server FROM sessions WHERE discord_user_id = ?").get(userId) as Pick<StoredSession, "avatar_blob" | "avatar_blob_intl" | "avatar_blob_jp" | "default_server"> | undefined;
  if (!row) return null;
  const avatarBlob = selectedAvatarBlob(row, server);
  if (!avatarBlob) return null;
  return Buffer.from(avatarBlob, "base64");
}

// ─── Jacket image storage ───────────────────────────────────────────────
export function saveJacket(userId: string, idx: number, base64Data: string): void {
  db.prepare("INSERT OR REPLACE INTO jackets (user_id, idx, data) VALUES (?, ?, ?)").run(userId, idx, base64Data);
}

export function getJacket(userId: string, idx: number): Buffer | null {
  const row = db.prepare("SELECT data FROM jackets WHERE user_id = ? AND idx = ?").get(userId, idx) as { data: string } | undefined;
  if (!row?.data) return null;
  const m = row.data.match(/^data:image\/\w+;base64,(.+)$/);
  return m ? Buffer.from(m[1], "base64") : null;
}

// ─── Song jacket cache (shared across all users, keyed by music ID) ─────────
export function getSongJacket(musicId: string): Buffer | null {
  const row = db.prepare("SELECT data FROM song_jackets WHERE music_id = ?").get(musicId) as { data: Buffer } | undefined;
  return row?.data ?? null;
}

export function saveSongJacket(musicId: string, data: Buffer): void {
  db.prepare("INSERT OR REPLACE INTO song_jackets (music_id, data) VALUES (?, ?)").run(musicId, data);
}

export function getMapImage(imageUrl: string): Buffer | null {
  const row = db.prepare("SELECT data FROM map_images WHERE image_url = ?").get(imageUrl) as { data: Buffer } | undefined;
  return row?.data ?? null;
}

export function saveMapImage(imageUrl: string, data: Buffer): void {
  db.prepare("INSERT OR REPLACE INTO map_images (image_url, data) VALUES (?, ?)").run(imageUrl, data);
}

export function getGuildSetting(guildId: string): boolean {
  const row = db.prepare("SELECT auto_role FROM guild_settings WHERE guild_id = ?").get(guildId) as { auto_role: number } | undefined;
  return row ? row.auto_role === 1 : true;
}

export function setGuildSetting(guildId: string, autoRole: boolean): void {
  db.prepare("INSERT OR REPLACE INTO guild_settings (guild_id, auto_role) VALUES (?, ?)").run(guildId, autoRole ? 1 : 0);
}

// ─── Per-user profile privacy (기본 공개) ────────────────────────────────
export function getProfilePrivate(discordUserId: string): boolean {
  const row = db.prepare("SELECT profile_private FROM sessions WHERE discord_user_id = ?").get(discordUserId) as { profile_private: number | null } | undefined;
  return row?.profile_private === 1;
}

// 세션(프로필)이 등록된 유저만 설정 가능. 변경된 행 수를 반환.
export function setProfilePrivate(discordUserId: string, isPrivate: boolean): number {
  const info = db.prepare("UPDATE sessions SET profile_private = ? WHERE discord_user_id = ?").run(isPrivate ? 1 : 0, discordUserId);
  return info.changes;
}

export function getEnabledBookmarkletPresetIds(discordUserId: string): string[] {
  const row = db.prepare("SELECT preset_bookmarklets FROM sessions WHERE discord_user_id = ?").get(discordUserId) as { preset_bookmarklets: string | null } | undefined;
  if (!row?.preset_bookmarklets) return [];
  try {
    const parsed = JSON.parse(row.preset_bookmarklets);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function setBookmarkletPresetEnabled(discordUserId: string, presetId: string, enabled: boolean): number {
  const existing = getEnabledBookmarkletPresetIds(discordUserId);
  const next = enabled
    ? Array.from(new Set([...existing, presetId]))
    : existing.filter((id) => id !== presetId);
  const info = db.prepare("UPDATE sessions SET preset_bookmarklets = ? WHERE discord_user_id = ?").run(JSON.stringify(next), discordUserId);
  return info.changes;
}

// ─── Rating card render cache ────────────────────────────────────────────
export function getRatingCardCache(friendCode: string): { blob: Buffer; syncedAt: number; version: number } | null {
  const row = db.prepare("SELECT rating_card_blob AS blob, rating_card_synced_at AS syncedAt, rating_card_version AS version FROM profiles WHERE friend_code = ?").get(friendCode) as { blob: Buffer | null; syncedAt: number; version: number } | undefined;
  if (!row?.blob) return null;
  return { blob: row.blob, syncedAt: row.syncedAt, version: row.version };
}

export function saveRatingCardCache(friendCode: string, data: Buffer, lastSyncedAt: number, version: number): void {
  db.prepare("UPDATE profiles SET rating_card_blob = ?, rating_card_synced_at = ?, rating_card_version = ? WHERE friend_code = ?").run(data, lastSyncedAt, version, friendCode);
}

// ─── Song constants cache ────────────────────────────────────────────────
export function getConstantsCache(): { data: string; updatedAt: number } | null {
  const row = db.prepare("SELECT data, updated_at AS updatedAt FROM constants_cache WHERE key = 'main'").get() as { data: string; updatedAt: number } | undefined;
  return row ?? null;
}

export function saveConstantsCache(data: string): void {
  db.prepare("INSERT OR REPLACE INTO constants_cache (key, data, updated_at) VALUES ('main', ?, ?)").run(data, Date.now());
}

// ─── Song aliases (곡 별명 — 캐롤 자체 관리) ──────────────────────────────
export interface SongAliasRow {
  id: number;
  title: string;
  alias: string;
  isTranslation: boolean;
}

function mapAliasRow(r: { id: number; title: string; alias: string; is_translation: number }): SongAliasRow {
  return { id: r.id, title: r.title, alias: r.alias, isTranslation: r.is_translation === 1 };
}

export function getAllAliases(): SongAliasRow[] {
  return (db.prepare("SELECT id, title, alias, is_translation FROM song_aliases ORDER BY title ASC, alias ASC").all() as { id: number; title: string; alias: string; is_translation: number }[]).map(mapAliasRow);
}

// 번역으로 지정된 별명만 (곡명 → 번역 별명)
export function getTranslationAliases(): { title: string; alias: string }[] {
  return db.prepare("SELECT title, alias FROM song_aliases WHERE is_translation = 1").all() as { title: string; alias: string }[];
}

// 별명 추가. 성공 시 생성된 행, (title, alias) 중복이면 null 반환.
export function addAlias(title: string, alias: string): SongAliasRow | null {
  const info = db.prepare("INSERT OR IGNORE INTO song_aliases (title, alias) VALUES (?, ?)").run(title, alias);
  if (info.changes === 0) return null;
  return { id: Number(info.lastInsertRowid), title, alias, isTranslation: false };
}

// 별명 삭제. 삭제된 행이 있으면 true.
export function deleteAlias(id: number): boolean {
  return db.prepare("DELETE FROM song_aliases WHERE id = ?").run(id).changes > 0;
}

// 특정 별명을 해당 곡의 한국어 번역으로 지정(on=true) 또는 해제(on=false).
// 지정 시 같은 곡의 다른 별명 지정은 자동 해제(곡당 1개). 대상 곡명을 반환, id가 없으면 null.
export function setAliasTranslation(id: number, on: boolean): string | null {
  const row = db.prepare("SELECT title FROM song_aliases WHERE id = ?").get(id) as { title: string } | undefined;
  if (!row) return null;
  const tx = db.transaction(() => {
    if (on) db.prepare("UPDATE song_aliases SET is_translation = 0 WHERE title = ?").run(row.title);
    db.prepare("UPDATE song_aliases SET is_translation = ? WHERE id = ?").run(on ? 1 : 0, id);
  });
  tx();
  return row.title;
}

// ─── 사용자별 제목 번역 표시 설정 ─────────────────────────────────────────
export function getTranslateTitles(discordUserId: string): boolean {
  const row = db.prepare("SELECT translate_titles FROM sessions WHERE discord_user_id = ?").get(discordUserId) as { translate_titles: number | null } | undefined;
  return row?.translate_titles === 1;
}

export function setTranslateTitles(discordUserId: string, value: boolean): void {
  db.prepare(`
    INSERT INTO sessions (discord_user_id, cookie_json, translate_titles, profile_private, updated_at)
    VALUES (?, '{}', ?, 0, ?)
    ON CONFLICT(discord_user_id) DO UPDATE SET translate_titles = excluded.translate_titles
  `).run(discordUserId, value ? 1 : 0, Date.now());
}

// ─── Extra bookmarklets per user ────────────────────────────────────────
export interface ExtraBookmarklet {
  label: string;
  code: string;
}

export function getExtraBookmarklets(discordUserId: string): ExtraBookmarklet[] {
  const row = db.prepare("SELECT extra_bookmarklets FROM sessions WHERE discord_user_id = ?").get(discordUserId) as { extra_bookmarklets: string } | undefined;
  if (!row?.extra_bookmarklets) return [];
  try { return JSON.parse(row.extra_bookmarklets) as ExtraBookmarklet[]; } catch { return []; }
}

export function addExtraBookmarklet(discordUserId: string, label: string, code: string): void {
  const existing = getExtraBookmarklets(discordUserId);
  const filtered = existing.filter((b) => b.label !== label);
  filtered.push({ label, code });
  const json = JSON.stringify(filtered);
  db.prepare(`
    INSERT INTO sessions (discord_user_id, cookie_json, extra_bookmarklets, profile_private, updated_at)
    VALUES (?, '{}', ?, 0, ?)
    ON CONFLICT(discord_user_id) DO UPDATE SET extra_bookmarklets = excluded.extra_bookmarklets
  `).run(discordUserId, json, Date.now());
}

export function removeExtraBookmarklet(discordUserId: string, label: string): boolean {
  const existing = getExtraBookmarklets(discordUserId);
  const filtered = existing.filter((b) => b.label !== label);
  if (filtered.length === existing.length) return false;
  db.prepare("UPDATE sessions SET extra_bookmarklets = ? WHERE discord_user_id = ?").run(JSON.stringify(filtered), discordUserId);
  return true;
}

// ─── Status helpers ──────────────────────────────────────────────────────
export function getRegisteredUserCount(): number {
  const row = db.prepare("SELECT COUNT(*) AS cnt FROM sessions WHERE friend_code != ''").get() as { cnt: number };
  return row.cnt;
}

export function getLastSyncTime(): number | null {
  const row = db.prepare("SELECT MAX(last_synced_at) AS t FROM profiles").get() as { t: number | null };
  return row.t ?? null;
}

// ─── rating_card_blob GC ─────────────────────────────────────────────────
export function getInactiveProfileFriendCodes(thresholdMs: number): string[] {
  const cutoff = Date.now() - thresholdMs;
  return (db.prepare(
    "SELECT friend_code AS friendCode FROM profiles WHERE last_synced_at > 0 AND last_synced_at < ? AND rating_card_blob IS NOT NULL"
  ).all(cutoff) as { friendCode: string }[]).map((r) => r.friendCode);
}

export function clearRatingCardCacheForInactive(thresholdMs: number): number {
  const cutoff = Date.now() - thresholdMs;
  return db.prepare(
    "UPDATE profiles SET rating_card_blob = NULL, rating_card_synced_at = 0 WHERE last_synced_at > 0 AND last_synced_at < ? AND rating_card_blob IS NOT NULL"
  ).run(cutoff).changes;
}
