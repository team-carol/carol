import Database from "better-sqlite3";
import * as path from "path";
import type { MaimaiProfile } from "./scraper";
import { encrypt, decrypt } from "./crypto";
import * as crypto from "crypto";

// ─── Types ──────────────────────────────────────────────────────────────
export interface CachedProfile {
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
  rawHtml: string;
  lastSyncedAt: number;
  recentJson: string;
  topJson: string;
  clearJson: string;
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

  CREATE TABLE IF NOT EXISTS constants_cache (
    key TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at INTEGER DEFAULT 0
  );
`);

try { db.exec("ALTER TABLE profiles ADD COLUMN top_json TEXT DEFAULT '[]'"); } catch (_) {}
try { db.exec("ALTER TABLE profiles ADD COLUMN clear_json TEXT DEFAULT '[]'"); } catch (_) {}
try { db.exec("ALTER TABLE profiles ADD COLUMN rating_card_blob BLOB DEFAULT NULL"); } catch (_) {}
try { db.exec("ALTER TABLE profiles ADD COLUMN rating_card_synced_at INTEGER DEFAULT 0"); } catch (_) {}

// ─── Queries ────────────────────────────────────────────────────────────
const stmtGet = db.prepare("SELECT friend_code AS friendCode, player_name AS playerName, rating, rating_max AS ratingMax, trophy, trophy_class AS trophyClass, avatar, grade_img AS gradeImg, stars, comment, play_count AS playCount, raw_html AS rawHtml, recent_json AS recentJson, top_json AS topJson, clear_json AS clearJson, last_synced_at AS lastSyncedAt FROM profiles WHERE friend_code = ?");
const stmtUpsert = db.prepare(`
  INSERT INTO profiles (friend_code, player_name, rating, rating_max, trophy, trophy_class, avatar, grade_img, stars, comment, play_count, raw_html, recent_json, top_json, clear_json, last_synced_at)
  VALUES (@friendCode, @playerName, @rating, @ratingMax, @trophy, @trophyClass, @avatar, @gradeImg, @stars, @comment, @playCount, @rawHtml, @recentJson, @topJson, @clearJson, @lastSyncedAt)
  ON CONFLICT(friend_code) DO UPDATE SET
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
    raw_html = excluded.raw_html,
    recent_json = excluded.recent_json,
    top_json = excluded.top_json,
    clear_json = excluded.clear_json,
    last_synced_at = excluded.last_synced_at
`);
const stmtDelete = db.prepare("DELETE FROM profiles WHERE friend_code = ?");

// ─── Public API ─────────────────────────────────────────────────────────
export function cacheProfile(profile: MaimaiProfile, playCount: number, rawHtml: string, recentJson = "[]", topJson = "[]", clearJson = "[]"): void {
  const data: CachedProfile = {
    friendCode: profile.friendCode ?? "me",
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
    rawHtml,
    recentJson,
    topJson,
    clearJson,
    lastSyncedAt: Date.now(),
  };
  stmtUpsert.run(data);
}

export function getCachedProfile(friendCode: string): CachedProfile | null {
  const row = stmtGet.get(friendCode) as CachedProfile | undefined;
  return row ?? null;
}

export function getAllCachedProfiles(): CachedProfile[] {
  return db.prepare("SELECT friend_code AS friendCode, player_name AS playerName, rating, rating_max AS ratingMax, trophy, trophy_class AS trophyClass, avatar, grade_img AS gradeImg, stars, comment, play_count AS playCount, raw_html AS rawHtml, last_synced_at AS lastSyncedAt FROM profiles ORDER BY last_synced_at DESC").all() as CachedProfile[];
}

export function deleteCachedProfile(friendCode: string): void {
  stmtDelete.run(friendCode);
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
  sync_token: string;
  updated_at: number;
}

export function saveUserSession(discordUserId: string, cookieJson: string, friendCode = ""): void {
  console.log(`[db] 세션 저장: user=${discordUserId.slice(-6)}, fc=${friendCode || "(없음)"}`);
  const encrypted = encrypt(cookieJson);
  db.prepare(`
    INSERT INTO sessions (discord_user_id, cookie_json, friend_code, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(discord_user_id) DO UPDATE SET
      cookie_json = excluded.cookie_json,
      friend_code = COALESCE(NULLIF(excluded.friend_code, ''), sessions.friend_code),
      updated_at = excluded.updated_at
  `).run(discordUserId, encrypted, friendCode, Date.now());
}

export function loadUserSession(discordUserId: string): { friendCode: string } | null {
  const row = db.prepare("SELECT * FROM sessions WHERE discord_user_id = ?").get(discordUserId) as StoredSession | undefined;
  console.log(`[db] 세션 로드: user=${discordUserId.slice(-6)}, found=${!!row}`);
  if (!row) return null;
  try {
    const decrypted = decrypt(row.cookie_json);
    const fc = row.friend_code;
    console.log(`[db] 복호화 성공, fc=${fc}`);
    return { friendCode: fc };
  } catch (e) {
    console.error(`[db] 복호화 실패: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

export function getUserFriendCode(discordUserId: string): string | null {
  const row = db.prepare("SELECT friend_code FROM sessions WHERE discord_user_id = ?").get(discordUserId) as { friend_code: string } | undefined;
  return row?.friend_code || null;
}

// ─── Persistent sync token per user ─────────────────────────────────────
export function getUserSyncToken(discordUserId: string): string {
  const row = db.prepare("SELECT sync_token FROM sessions WHERE discord_user_id = ?").get(discordUserId) as { sync_token: string } | undefined;
  if (row?.sync_token) return row.sync_token;
  const token = crypto.randomBytes(12).toString("hex");
  db.prepare(`
    INSERT INTO sessions (discord_user_id, cookie_json, sync_token, updated_at)
    VALUES (?, '{}', ?, ?)
    ON CONFLICT(discord_user_id) DO UPDATE SET sync_token = excluded.sync_token
  `).run(discordUserId, token, Date.now());
  return token;
}

export function findUserBySyncToken(token: string): string | null {
  const row = db.prepare("SELECT discord_user_id FROM sessions WHERE sync_token = ?").get(token) as { discord_user_id: string } | undefined;
  return row?.discord_user_id ?? null;
}

export function saveAvatarBlob(userId: string, base64: string): void {
  db.prepare("UPDATE sessions SET avatar_blob = ? WHERE discord_user_id = ?").run(base64, userId);
}

export function getAvatarBlob(userId: string): Buffer | null {
  const row = db.prepare("SELECT avatar_blob FROM sessions WHERE discord_user_id = ?").get(userId) as { avatar_blob: string } | undefined;
  if (!row?.avatar_blob) return null;
  return Buffer.from(row.avatar_blob, "base64");
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

export function getGuildSetting(guildId: string): boolean {
  const row = db.prepare("SELECT auto_role FROM guild_settings WHERE guild_id = ?").get(guildId) as { auto_role: number } | undefined;
  return row ? row.auto_role === 1 : true;
}

export function setGuildSetting(guildId: string, autoRole: boolean): void {
  db.prepare("INSERT OR REPLACE INTO guild_settings (guild_id, auto_role) VALUES (?, ?)").run(guildId, autoRole ? 1 : 0);
}

// ─── Rating card render cache ────────────────────────────────────────────
export function getRatingCardCache(friendCode: string): { blob: Buffer; syncedAt: number } | null {
  const row = db.prepare("SELECT rating_card_blob AS blob, rating_card_synced_at AS syncedAt FROM profiles WHERE friend_code = ?").get(friendCode) as { blob: Buffer | null; syncedAt: number } | undefined;
  if (!row?.blob) return null;
  return { blob: row.blob, syncedAt: row.syncedAt };
}

export function saveRatingCardCache(friendCode: string, data: Buffer, lastSyncedAt: number): void {
  db.prepare("UPDATE profiles SET rating_card_blob = ?, rating_card_synced_at = ? WHERE friend_code = ?").run(data, lastSyncedAt, friendCode);
}

// ─── Song constants cache ────────────────────────────────────────────────
export function getConstantsCache(): { data: string; updatedAt: number } | null {
  const row = db.prepare("SELECT data, updated_at AS updatedAt FROM constants_cache WHERE key = 'main'").get() as { data: string; updatedAt: number } | undefined;
  return row ?? null;
}

export function saveConstantsCache(data: string): void {
  db.prepare("INSERT OR REPLACE INTO constants_cache (key, data, updated_at) VALUES ('main', ?, ?)").run(data, Date.now());
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
