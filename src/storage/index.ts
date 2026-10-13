/**
 * PostgreSQL storage facade.
 */
import { DATABASE_URL } from "../config";
import type { PostgresStorage } from "./postgres";
import type { CachedProfile, MaimaiServer } from "./types";

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
export const cacheProfile = method("cacheProfile"); export const deleteCachedProfile = method("deleteCachedProfile"); const getStoredProfile = method("getCachedProfile"); export const getAllCachedProfiles = method("getAllCachedProfiles");
export const saveUserSession = method("saveUserSession"); const getStoredFriendCode = method("getUserFriendCode"); export const getUserFriendCodeForServer = method("getUserFriendCodeForServer"); export const getUserDefaultServer = method("getUserDefaultServer"); export const setUserDefaultServer = method("setUserDefaultServer"); export const getUserSyncToken = method("getUserSyncToken"); export const findUserBySyncToken = method("findUserBySyncToken"); export const saveAvatarBlob = method("saveAvatarBlob"); export const getAvatarBlob = method("getAvatarBlob"); export const saveJacket = method("saveJacket"); export const getJacket = method("getJacket"); export const getSongJacket = method("getSongJacket"); export const saveSongJacket = method("saveSongJacket"); export const getMapImage = method("getMapImage"); export const saveMapImage = method("saveMapImage"); export const getGuildSetting = method("getGuildSetting"); export const listNewsChannels = method("listNewsChannels"); export const getNewsChannels = method("getNewsChannels"); export const setNewsChannel = method("setNewsChannel"); export const clearNewsChannel = method("clearNewsChannel"); export const getSeenNewsIds = method("getSeenNewsIds"); export const markNewsSeen = method("markNewsSeen"); export const deleteNewsSeen = method("deleteNewsSeen"); export const saveNewsArticle = method("saveNewsArticle"); export const getNewsArticle = method("getNewsArticle"); export const getUntranslatedNewsArticles = method("getUntranslatedNewsArticles"); export const pruneNewsArticles = method("pruneNewsArticles"); export const getNewsFeedState = method("getNewsFeedState"); export const setNewsFeedState = method("setNewsFeedState"); export const setGuildSetting = method("setGuildSetting");
export const getAchievementMinimum = method("getAchievementMinimum"); export const setAchievementMinimum = method("setAchievementMinimum");
export const listGoals = method("listGoals"); export const countGoals = method("countGoals"); export const addGoal = method("addGoal"); export const deleteGoal = method("deleteGoal"); export const updateGoalProgress = method("updateGoalProgress");
export const saveSimaiChart = method("saveSimaiChart"); export const getSimaiChart = method("getSimaiChart"); export const listRegistryCharts = method("listRegistryCharts"); export const auditRegistryCharts = method("auditRegistryCharts"); export const countSimaiChartsByOwner = method("countSimaiChartsByOwner"); export const pruneSimaiCharts = method("pruneSimaiCharts"); export const deleteSimaiChart = method("deleteSimaiChart");
export const replaceMainotesIndex = method("replaceMainotesIndex"); export const getMainotesSyncState = method("getMainotesSyncState"); export const getMainotesIndex = method("getMainotesIndex"); export const setMainotesSyncedNow = method("setMainotesSyncedNow");
export const getChartVideo = method("getChartVideo"); export const claimChartVideo = method("claimChartVideo"); export const setChartVideoDone = method("setChartVideoDone"); export const setChartVideoError = method("setChartVideoError"); export const deleteChartVideo = method("deleteChartVideo"); export const getOrphanChartVideos = method("getOrphanChartVideos");
export const getPolicyAck = method("getPolicyAck"); export const setPolicyAck = method("setPolicyAck");
export const saveAchievementPlayEventLogBatch = method("saveAchievementPlayEventLogBatch"); export const getAchievementPlayEventLog = method("getAchievementPlayEventLog"); export const getAchievementLogRange = method("getAchievementLogRange"); export const getDailyAchievementSummaries = method("getDailyAchievementSummaries"); export const upsertChartClears = method("upsertChartClears"); export const backfillEventRatingUp = method("backfillEventRatingUp");
export const listOptionPresets = method("listOptionPresets"); export const saveOptionPreset = method("saveOptionPreset"); export const deleteOptionPreset = method("deleteOptionPreset"); export const saveOptionSnapshot = method("saveOptionSnapshot"); export const getOptionSnapshots = method("getOptionSnapshots");
export const listPatchNotes = method("listPatchNotes"); export const savePatchNote = method("savePatchNote"); export const setPatchNotePublished = method("setPatchNotePublished"); export const deletePatchNote = method("deletePatchNote"); export const getUnseenPatchNotes = method("getUnseenPatchNotes"); export const setPatchAck = method("setPatchAck");
export const saveProfileCircle = method("saveProfileCircle"); export const getCirclePublic = method("getCirclePublic"); export const setCirclePublic = method("setCirclePublic");
export const getTranslateTitles = method("getTranslateTitles"); export const setTranslateTitles = method("setTranslateTitles");
export const getEnabledBookmarkletPresetIds = method("getEnabledBookmarkletPresetIds"); export const setBookmarkletPresetEnabled = method("setBookmarkletPresetEnabled"); export const getExtraBookmarklets = method("getExtraBookmarklets"); export const addExtraBookmarklet = method("addExtraBookmarklet"); export const removeExtraBookmarklet = method("removeExtraBookmarklet");
export const getMaishiftLink = method("getMaishiftLink"); export const getMaishiftUsers = method("getMaishiftUsers"); export const saveSyncExtras = method("saveSyncExtras"); export const hasChartClears = method("hasChartClears"); export const setMaishiftHandle = method("setMaishiftHandle"); export const getKvCache = method("getKvCache"); export const saveKvCache = method("saveKvCache");
export const getConstantsCache = method("getConstantsCache"); export const saveConstantsCache = method("saveConstantsCache");
export const getRatingCardCache = method("getRatingCardCache"); export const saveRatingCardCache = method("saveRatingCardCache");
export const getAllAliases = method("getAllAliases"); export const getTranslationAliases = method("getTranslationAliases"); export const addAlias = method("addAlias"); export const deleteAlias = method("deleteAlias"); export const setAliasTranslation = method("setAliasTranslation"); export const getMessageOverrides = method("getMessageOverrides"); export const setMessageOverride = method("setMessageOverride"); export const deleteMessageOverride = method("deleteMessageOverride");
export const getRegisteredUserCount = method("getRegisteredUserCount"); export const getLastSyncTime = method("getLastSyncTime"); export const getInactiveProfileFriendCodes = method("getInactiveProfileFriendCodes"); export const clearRatingCardCacheForInactive = method("clearRatingCardCacheForInactive");

// ─── maishift 연동(임시) ──────────────────────────────────────────────────
// 프로필(이름·레이팅·칭호·기록 등)은 maishift 에서만 온다. maishift 를 연동하지 않은 사용자는 등록되지 않은 것으로 본다.
// 캐롤봇 북마클릿이 모은 부가 데이터(서클·최근 플레이·지방)는 그 사용자가 직접 동기화한 친구 코드의 행에서만 붙인다
// (남의 maishift 아이디를 연동해도 그 사람의 캐롤봇 데이터는 보이지 않게).
// 프로필 키: 그 서버에서 캐롤봇 북마클릿으로 확인한 친구 코드 키("intl:<친구코드>"), 없으면 "ms:<server>:<handle>".
// maishift 값을 채우는 함수는 src/maishift 가 registerProfileOverlay 로 넣는다(storage 가 네트워크 코드를 import 하지 않게).
export interface MaishiftLink { handle: string; server: MaimaiServer }
/** extras: 캐롤봇 북마클릿이 저장한 행(부가 데이터용). 없으면 null. */
export type ProfileOverlay = (profileKey: string, link: MaishiftLink, extras: CachedProfile | null) => Promise<CachedProfile | null>;
let profileOverlay: ProfileOverlay | null = null;
export function registerProfileOverlay(fn: ProfileOverlay): void { profileOverlay = fn; }

const MS_KEY = /^ms:(intl|jp):(.+)$/;
export function maishiftProfileKey(link: MaishiftLink): string { return `ms:${link.server}:${link.handle}`; }
export function parseMaishiftProfileKey(key: string): MaishiftLink | null {
  const m = key.match(MS_KEY);
  return m ? { server: m[1] as MaimaiServer, handle: m[2] } : null;
}

/** 캐롤봇 북마클릿이 저장한 행 그대로(부가 데이터·동기화용). 프로필 값은 비어 있을 수 있다. */
export { getStoredProfile, getStoredFriendCode };

export async function getCachedProfile(key: string): Promise<CachedProfile | null> {
  if (!profileOverlay) return null;
  const ms = parseMaishiftProfileKey(key);
  if (ms) return profileOverlay(key, ms, null);
  const extras = await getStoredProfile(key);
  const handle = await invoke("getMaishiftHandleByProfileKey", [extras?.profileKey ?? key]);
  if (!handle) return null;
  const server: MaimaiServer = extras?.server ?? (key.startsWith("jp:") ? "jp" : "intl");
  return profileOverlay(extras?.profileKey ?? key, { handle, server }, extras);
}

async function profileKeyOf(id: string, link: MaishiftLink): Promise<string> {
  return (await getUserFriendCodeForServer(id, link.server)) || maishiftProfileKey(link);
}

/** 프로필 키. maishift 를 연동하지 않았으면 null. */
export async function getUserFriendCode(id: string): Promise<string | null> {
  const link = await getMaishiftLink(id);
  return link ? profileKeyOf(id, link) : null;
}

export async function loadUserSession(id: string): Promise<{ friendCode: string } | null> {
  const link = await getMaishiftLink(id);
  return link ? { friendCode: await profileKeyOf(id, link) } : null;
}

export async function closeStorage(): Promise<void> {
  const current = await getAdapter();
  if ("close" in current && typeof current.close === "function") await current.close();
  else await current.close();
  adapter = undefined;
}

export type { CachedProfile, ExtraBookmarklet, OptionPresetInput, OptionPresetRow, UserOptionField, OptionSnapshot, PatchNoteInput, PatchNoteRow, MaimaiServer, SongAliasRow, BotMessageRow, AchievementPlayEventInput, AchievementPlayEventLogInput, AchievementPlayEventLogRecord, DailyAchievementSummary, ChartClearInput, ChartClearDiff, GoalRow, GoalProgressUpdate } from "./types";
