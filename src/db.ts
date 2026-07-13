import Database from "better-sqlite3";
import * as path from "path";
import type { MaimaiProfile } from "./scraper";
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
  ON CONFLICT(profile_key, play_day, chart_key) DO UPDATE SET
    record_json = CASE
      WHEN excluded.achievement_val >= daily_achievements.achievement_val THEN excluded.record_json
      ELSE daily_achievements.record_json
    END,
    achievement_val = MAX(daily_achievements.achievement_val, excluded.achievement_val),
    played_at = CASE
      WHEN excluded.achievement_val >= daily_achievements.achievement_val THEN excluded.played_at
      ELSE daily_achievements.played_at
    END,
    updated_at = excluded.updated_at
`);
const stmtUpsertDailyAchievementSnapshot = db.prepare(`
  INSERT INTO daily_achievement_snapshots (profile_key, play_day, chart_key, record_json, achievement_val, played_at, updated_at)
  VALUES (@profileKey, @playDay, @chartKey, @recordJson, @achievementVal, @playedAt, @updatedAt)
  ON CONFLICT(profile_key, play_day, chart_key, updated_at) DO UPDATE SET
    record_json = excluded.record_json,
    achievement_val = excluded.achievement_val,
    updated_at = excluded.updated_at
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

export function pruneDailyAchievements(_retainDays = 7): number {
  return 0;
}

export function getDailyAchievements(profileKeyValue: string, playDay: string): DailyAchievementRecord[] {
  return db.prepare(`
    SELECT profile_key AS profileKey, play_day AS playDay, chart_key AS chartKey,
      record_json AS recordJson, achievement_val AS achievementVal,
      played_at AS playedAt, updated_at AS updatedAt
    FROM daily_achievements
    WHERE profile_key = ? AND play_day = ?
    ORDER BY achievement_val DESC, played_at DESC
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
