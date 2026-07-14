/**
 * PostgreSQL storage facade.
 */
import { DATABASE_URL } from "../config";
import type { PostgresStorage } from "./postgres";

type Storage = PostgresStorage;
let adapter: Promise<Storage> | undefined;

async function getAdapter(): Promise<Storage> {
  if (!adapter) {
    adapter = import("./postgres").then(({ initializePostgresStorage }) => initializePostgresStorage(DATABASE_URL!));
  }
  return adapter;
}

export async function initializeStorage(): Promise<void> {
  await getAdapter();
}

type DbFunction<K extends keyof Storage> = Storage[K] extends (...values: infer A) => infer R ? (...values: A) => R : never;
async function invoke<K extends keyof Storage>(name: K, args: Parameters<DbFunction<K>>): Promise<Awaited<ReturnType<DbFunction<K>>>> {
  const module = await getAdapter();
  const fn = module[name];
  if (typeof fn !== "function") throw new Error(`storage method unavailable: ${String(name)}`);
  return (fn as (...values: Parameters<DbFunction<K>>) => ReturnType<DbFunction<K>>).apply(module, args) as Awaited<ReturnType<DbFunction<K>>>;
}

export { isMaimaiServer } from "./types";

type Method<K extends keyof Storage> = (...args: Parameters<DbFunction<K>>) => Promise<Awaited<ReturnType<DbFunction<K>>>>;
const method = <K extends keyof Storage>(name: K): Method<K> => ((...args) => invoke(name, args)) as Method<K>;
export const cacheProfile = method("cacheProfile"); export const deleteCachedProfile = method("deleteCachedProfile"); export const getCachedProfile = method("getCachedProfile"); export const getAllCachedProfiles = method("getAllCachedProfiles");
export const saveUserSession = method("saveUserSession"); export const loadUserSession = method("loadUserSession"); export const getUserFriendCode = method("getUserFriendCode"); export const getUserFriendCodeForServer = method("getUserFriendCodeForServer"); export const getUserDefaultServer = method("getUserDefaultServer"); export const setUserDefaultServer = method("setUserDefaultServer"); export const getUserSyncToken = method("getUserSyncToken"); export const findUserBySyncToken = method("findUserBySyncToken"); export const saveAvatarBlob = method("saveAvatarBlob"); export const getAvatarBlob = method("getAvatarBlob"); export const saveJacket = method("saveJacket"); export const getJacket = method("getJacket"); export const getSongJacket = method("getSongJacket"); export const saveSongJacket = method("saveSongJacket"); export const getMapImage = method("getMapImage"); export const saveMapImage = method("saveMapImage"); export const getGuildSetting = method("getGuildSetting"); export const setGuildSetting = method("setGuildSetting"); export const getProfilePrivate = method("getProfilePrivate"); export const setProfilePrivate = method("setProfilePrivate");
export const getEnabledBookmarkletPresetIds = method("getEnabledBookmarkletPresetIds"); export const setBookmarkletPresetEnabled = method("setBookmarkletPresetEnabled"); export const getRatingCardCache = method("getRatingCardCache"); export const saveRatingCardCache = method("saveRatingCardCache"); export const getConstantsCache = method("getConstantsCache"); export const saveConstantsCache = method("saveConstantsCache"); export const getAllAliases = method("getAllAliases"); export const getTranslationAliases = method("getTranslationAliases"); export const addAlias = method("addAlias"); export const deleteAlias = method("deleteAlias"); export const setAliasTranslation = method("setAliasTranslation"); export const getTranslateTitles = method("getTranslateTitles"); export const setTranslateTitles = method("setTranslateTitles"); export const getExtraBookmarklets = method("getExtraBookmarklets"); export const addExtraBookmarklet = method("addExtraBookmarklet"); export const removeExtraBookmarklet = method("removeExtraBookmarklet"); export const getRegisteredUserCount = method("getRegisteredUserCount"); export const getLastSyncTime = method("getLastSyncTime"); export const getInactiveProfileFriendCodes = method("getInactiveProfileFriendCodes"); export const clearRatingCardCacheForInactive = method("clearRatingCardCacheForInactive"); export const saveAchievementPlayEventLogBatch = method("saveAchievementPlayEventLogBatch"); export const hasAchievementEventLogState = method("hasAchievementEventLogState"); export const getAchievementPlayEventLog = method("getAchievementPlayEventLog"); export const getDailyAchievementSummaries = method("getDailyAchievementSummaries");

export async function closeStorage(): Promise<void> {
  const current = await getAdapter();
  if ("close" in current && typeof current.close === "function") await current.close();
  else await current.close();
  adapter = undefined;
}

export type { CachedProfile, ExtraBookmarklet, MaimaiServer, SongAliasRow, AchievementPlayEventInput, AchievementPlayEventLogInput, AchievementPlayEventLogRecord, DailyAchievementSummary } from "./types";
