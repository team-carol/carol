/**
 * Phase-1 storage contract.
 *
 * The adapter is deliberately loaded lazily.  Production PostgreSQL never
 * imports db.ts, so better-sqlite3 is not opened when DB_DRIVER=postgres.
 */
type DbModule = typeof import("../db");
import { DATABASE_URL, DB_DRIVER } from "../config";
import type { PostgresStorage } from "./postgres";

type Storage = DbModule | PostgresStorage;
let adapter: Promise<Storage> | undefined;

async function getAdapter(): Promise<Storage> {
  if (!adapter) {
    adapter = DB_DRIVER === "postgres"
      ? import("./postgres").then(({ initializePostgresStorage }) => initializePostgresStorage(DATABASE_URL!))
      : Promise.resolve().then(() => require("../db") as DbModule);
  }
  return adapter;
}

export async function initializeStorage(): Promise<void> {
  await getAdapter();
}

type DbFunction<K extends keyof DbModule> = DbModule[K] extends (...values: infer A) => infer R ? (...values: A) => R : never;
async function invoke<K extends keyof DbModule>(name: K, args: Parameters<DbFunction<K>>): Promise<Awaited<ReturnType<DbFunction<K>>>> {
  const module = await getAdapter();
  const fn = (module as Partial<DbModule>)[name];
  if (typeof fn !== "function") throw new Error(`storage method unavailable: ${String(name)}`);
  return (fn as (...values: Parameters<DbFunction<K>>) => ReturnType<DbFunction<K>>).apply(module, args) as Awaited<ReturnType<DbFunction<K>>>;
}

export function isMaimaiServer(value: string): value is import("../db").MaimaiServer {
  return value === "intl" || value === "jp";
}

// Runtime methods intentionally remain one-for-one with db.ts during this
// phase.  This keeps SQLite behavior identical and makes the future async PG
// adapter a replacement behind this contract rather than a caller rewrite.
type Method<K extends keyof DbModule> = (...args: Parameters<DbFunction<K>>) => Promise<Awaited<ReturnType<DbFunction<K>>>>;
const method = <K extends keyof DbModule>(name: K): Method<K> => ((...args) => invoke(name, args)) as Method<K>;
export const cacheProfile = method("cacheProfile"); export const getCachedProfile = method("getCachedProfile"); export const getAllCachedProfiles = method("getAllCachedProfiles");
export const getAchievementInitializedAt = method("getAchievementInitializedAt"); export const hasAchievementSnapshots = method("hasAchievementSnapshots"); export const getAchievementRepeatedFromDay = method("getAchievementRepeatedFromDay"); export const markAchievementInitialized = method("markAchievementInitialized"); export const deleteCachedProfile = method("deleteCachedProfile");
export const saveDailyAchievement = method("saveDailyAchievement"); export const saveDailyAchievementSnapshot = method("saveDailyAchievementSnapshot"); export const saveAchievementEvent = method("saveAchievementEvent"); export const getAchievementEvents = method("getAchievementEvents"); export const saveAchievementPlayEvent = method("saveAchievementPlayEvent"); export const getAchievementPlayEvents = method("getAchievementPlayEvents"); export const saveAchievementPlayEventLogBatch = method("saveAchievementPlayEventLogBatch"); export const hasAchievementEventLogState = method("hasAchievementEventLogState"); export const getAchievementPlayEventLog = method("getAchievementPlayEventLog");
export const isChartRecordCatalogDue = method("isChartRecordCatalogDue"); export const saveChartRecordCatalogBatch = method("saveChartRecordCatalogBatch"); export const getChartRecordBaselines = method("getChartRecordBaselines"); export const pruneDailyAchievements = method("pruneDailyAchievements"); export const getDailyAchievements = method("getDailyAchievements"); export const getDailyAchievementSnapshots = method("getDailyAchievementSnapshots"); export const getPreviousDailyAchievementVal = method("getPreviousDailyAchievementVal"); export const getPreviousDailyAchievementValBeforePlay = method("getPreviousDailyAchievementValBeforePlay"); export const getLastSync = method("getLastSync"); export const needsSync = method("needsSync");
export const saveUserSession = method("saveUserSession"); export const loadUserSession = method("loadUserSession"); export const getUserFriendCode = method("getUserFriendCode"); export const getUserFriendCodeForServer = method("getUserFriendCodeForServer"); export const getUserDefaultServer = method("getUserDefaultServer"); export const setUserDefaultServer = method("setUserDefaultServer"); export const getUserSyncToken = method("getUserSyncToken"); export const findUserBySyncToken = method("findUserBySyncToken"); export const saveAvatarBlob = method("saveAvatarBlob"); export const getAvatarBlob = method("getAvatarBlob"); export const saveJacket = method("saveJacket"); export const getJacket = method("getJacket"); export const getSongJacket = method("getSongJacket"); export const saveSongJacket = method("saveSongJacket"); export const getMapImage = method("getMapImage"); export const saveMapImage = method("saveMapImage"); export const getGuildSetting = method("getGuildSetting"); export const setGuildSetting = method("setGuildSetting"); export const getProfilePrivate = method("getProfilePrivate"); export const setProfilePrivate = method("setProfilePrivate");
export const getEnabledBookmarkletPresetIds = method("getEnabledBookmarkletPresetIds"); export const setBookmarkletPresetEnabled = method("setBookmarkletPresetEnabled"); export const getRatingCardCache = method("getRatingCardCache"); export const saveRatingCardCache = method("saveRatingCardCache"); export const getConstantsCache = method("getConstantsCache"); export const saveConstantsCache = method("saveConstantsCache"); export const getAllAliases = method("getAllAliases"); export const getTranslationAliases = method("getTranslationAliases"); export const addAlias = method("addAlias"); export const deleteAlias = method("deleteAlias"); export const setAliasTranslation = method("setAliasTranslation"); export const getTranslateTitles = method("getTranslateTitles"); export const setTranslateTitles = method("setTranslateTitles"); export const getExtraBookmarklets = method("getExtraBookmarklets"); export const addExtraBookmarklet = method("addExtraBookmarklet"); export const removeExtraBookmarklet = method("removeExtraBookmarklet"); export const getRegisteredUserCount = method("getRegisteredUserCount"); export const getLastSyncTime = method("getLastSyncTime"); export const getInactiveProfileFriendCodes = method("getInactiveProfileFriendCodes"); export const clearRatingCardCacheForInactive = method("clearRatingCardCacheForInactive");

export async function closeStorage(): Promise<void> {
  const current = await getAdapter();
  if ("close" in current && typeof current.close === "function") await current.close();
  else await invoke("closeDb", []);
  adapter = undefined;
}

export type { CachedProfile, DailyAchievementRecord, DailyAchievementSnapshotRecord, ExtraBookmarklet, MaimaiServer, SongAliasRow } from "../db";
