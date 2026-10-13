/**
 * maishift 연동(임시 — 공식 API 전까지, 배포하지 않음).
 *
 * 프로필·기록은 캐롤봇 DB에 저장하지 않고 메모리에만 잠깐 둔다. 부하를 줄이려고:
 * - 프로필(작음)은 아이디마다 PROFILE_TTL_MS 에 한 번만 확인한다.
 * - 전체 기록(큼)과 레이팅 히스토리는 프로필의 updatedAt(maishift 업로드 시각)이 바뀌었을 때만 다시 받는다.
 * - 모든 요청은 serverFn.ts 에서 한 줄로 세워 간격을 둔다.
 */
import { registerProfileOverlay, type MaishiftLink } from "../storage";
import type { CachedProfile, MaishiftHistoryPoint, MaishiftVersion } from "../storage/types";
import { applyMaishiftUpdate } from "./sync";
import { rankImage } from "../rankImages";
import { callServerFn, FN, MaishiftError, type MaishiftRegion } from "./serverFn";
import { ratingTargets, sRatingTargets, allRecords, trophyClassOf, historyPoints, versionList, uploadList, type MsProfileResult, type MsRecordsResult, type MsHistoryPoint, type MsUpload } from "./convert";
import type { PlayRecord } from "../scraper";

export { MaishiftError } from "./serverFn";

const PROFILE_TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 200;
/** 캐시가 오래됐을 때 새 값을 이만큼만 기다리고, 늦으면 가진 값으로 답한다. */
const WAIT_BUDGET_MS = 2_500;

interface Entry {
  checkedAt: number;
  /** maishift 업로드 시각(원문). 바뀌면 전체 기록을 다시 받는다. */
  updatedAt: string;
  handle: string;
  name: string;
  rating: number;
  avatar: string;
  trophy: string;
  trophyClass: string;
  stars: number;
  courseRank: number;
  classRank: number;
  playCount: number;
  totalPlayCount: number;
  friendCode: string;
  topJson: string;
  clearJson: string;
  history: MaishiftHistoryPoint[];
  versions: MaishiftVersion[];
  /** maishift "이전 기록 공개" 설정 */
  pastRecordsVisible: boolean;
}

const cache = new Map<string, Entry>();
/** 요청한 지역에 maishift 기록이 없는 연동(예: /설정 기본 서버를 내수판으로 했지만 국제판 기록만 있음). */
const regionMissing = new Set<string>();
const inflight = new Map<string, Promise<Entry>>();

const regionOf = (link: MaishiftLink): MaishiftRegion => (link.server === "jp" ? "JAPAN" : "ASIA");
const keyOf = (link: MaishiftLink) => `${link.server}:${link.handle.toLowerCase()}`;

function remember(key: string, e: Entry): void {
  cache.delete(key);
  cache.set(key, e);
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);
}

async function refresh(link: MaishiftLink): Promise<Entry> {
  const key = keyOf(link);
  const args = { handle: link.handle, region: regionOf(link) };
  const prev = cache.get(key);
  const fetchRecords = () => callServerFn<MsRecordsResult>(FN.records, args);
  // 히스토리는 그래프용 부가 데이터라 못 받아도 프로필은 보여 준다(다음 업로드 때 다시 시도).
  const fetchHistory = () => callServerFn<MsHistoryPoint[]>(FN.history, args).then(historyPoints).catch((e) => {
    console.error(`[maishift] ${link.handle} 히스토리:`, (e as Error).message);
    return [] as MaishiftHistoryPoint[];
  });
  // 캐시가 없으면(재시작 직후·첫 조회) 세 가지를 한꺼번에 요청해 기다리는 시간을 줄인다.
  // 캐시가 있으면 프로필(작음)만 먼저 보고, 업로드 시각이 바뀌었을 때만 나머지를 받는다.
  // 프로필이 제일 느려서(약 2초) 먼저 줄 세운다.
  const profileReq = callServerFn<MsProfileResult>(FN.profile, args);
  const cold = prev ? null : { records: fetchRecords(), history: fetchHistory() };
  cold?.records.catch(() => {});
  const res = await profileReq;
  // maishift 는 요청한 지역에 기록이 없으면 대표 지역 기록을 준다. 다른 지역 기록을 보여 주지 않는다.
  if (res.region && res.region !== args.region) {
    regionMissing.add(key);
    cache.delete(key);
    throw new MaishiftError(`no ${args.region} record (got ${res.region})`, "region_missing");
  }
  regionMissing.delete(key);
  const rec = res.userRecord;
  if (!rec?.profile) throw new MaishiftError("no record for region", "not_found");
  const p = rec.profile;
  const same = prev && prev.updatedAt === p.updatedAt ? prev : null;
  const top = ratingTargets(rec);
  let clearJson = same?.clearJson ?? "";
  if (!clearJson) {
    const records = allRecords(await (cold?.records ?? fetchRecords()));
    clearJson = JSON.stringify(records);
    // 새 기록이 올라왔으면 성과·스냅샷·목표를 갱신한다. 조회는 기다리게 하지 않는다.
    void applyMaishiftUpdate({ link, records, top, rating: p.rating, uploadedAt: Date.parse(p.updatedAt) || Date.now() })
      .catch((e) => console.error(`[maishift] ${link.handle} 기록 반영:`, e));
  }
  const history = same?.history ?? await (cold?.history ?? fetchHistory());
  const entry: Entry = {
    checkedAt: Date.now(),
    updatedAt: p.updatedAt,
    handle: res.handle || link.handle,
    name: p.name,
    rating: p.rating,
    avatar: p.profileImageSrc,
    trophy: p.trophy?.title ?? "",
    trophyClass: trophyClassOf(p.trophy?.tier),
    stars: p.stars,
    courseRank: p.courseRank,
    classRank: p.classRank,
    playCount: p.playCount?.current ?? 0,
    totalPlayCount: p.playCount?.total ?? 0,
    friendCode: p.friendCode ?? "",
    topJson: JSON.stringify(top),
    clearJson,
    history,
    versions: versionList(rec.availableVersions),
    pastRecordsVisible: res.pastRecordsVisible === true,
  };
  remember(key, entry);
  return entry;
}

function refreshOnce(link: MaishiftLink): Promise<Entry> {
  const key = keyOf(link);
  let p = inflight.get(key);
  if (!p) {
    p = refresh(link).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

/**
 * 캐시가 신선하면 그대로. 오래됐으면 새로 받되 WAIT_BUDGET_MS 안에 안 오면 가진 값으로 답한다(새로 받는 일은 뒤에서 계속).
 * 캐시가 없으면 받을 때까지 기다린다 — 명령은 프로필을 읽기 전에 응답을 미뤄(defer) 둔다.
 */
async function getEntry(link: MaishiftLink): Promise<Entry> {
  const have = cache.get(keyOf(link)) ?? null;
  if (have && Date.now() - have.checkedAt < PROFILE_TTL_MS) return have;
  const pending = refreshOnce(link);
  if (!have) return pending;
  pending.catch(() => {});
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), WAIT_BUDGET_MS));
  return (await Promise.race([pending, timeout])) ?? have;
}

/** 프로필 = maishift 값 + 캐롤봇 북마클릿 부가 데이터(서클·최근 플레이·지방). 캐롤봇 프로필 값은 쓰지 않는다. */
function toProfile(profileKey: string, link: MaishiftLink, e: Entry, extras: CachedProfile | null): CachedProfile {
  return {
    profileKey,
    server: link.server,
    friendCode: extras?.friendCode || e.friendCode,
    playerName: e.name,
    rating: e.rating,
    ratingMax: 0,
    trophy: e.trophy,
    trophyClass: e.trophyClass,
    avatar: e.avatar,
    // 단위·클래스 이미지: maishift 의 번호로 캐롤봇이 모아 둔 이미지를 찾는다(src/rankImages.ts). 아직 없으면 "".
    gradeImg: rankImage(link.server, "class", e.classRank),
    courseImg: rankImage(link.server, "course", e.courseRank),
    circleJson: extras?.circleJson ?? "",
    stars: String(e.stars),
    comment: "",
    playCount: e.playCount,
    totalPlayCount: e.totalPlayCount,
    lastSyncedAt: Date.parse(e.updatedAt) || 0,
    recentJson: extras?.recentJson ?? "[]",
    topJson: e.topJson,
    clearJson: e.clearJson,
    mapJson: extras?.mapJson ?? "[]",
    maishiftHistory: e.history,
    maishiftVersions: e.versions,
    maishiftFriendCode: e.friendCode,
    maishiftPastPublic: e.pastRecordsVisible,
    source: "maishift",
  };
}

/** maishift 에서 못 받으면(캐시도 없으면) null — 캐롤봇 프로필로 돌아가지 않는다. */
async function overlay(profileKey: string, link: MaishiftLink, extras: CachedProfile | null): Promise<CachedProfile | null> {
  let e: Entry | null = null;
  try {
    e = await getEntry(link);
  } catch (err) {
    console.error(`[maishift] ${link.handle}:`, (err as Error).message);
    e = cache.get(keyOf(link)) ?? null;
  }
  return e ? toProfile(profileKey, link, e, extras) : null;
}

/** 이 연동의 서버(지역)에 maishift 기록이 없다고 확인됐는지. 명령의 "미등록" 안내를 바꾸는 데 쓴다. */
export function isRegionMissing(link: MaishiftLink): boolean {
  return regionMissing.has(keyOf(link));
}

/** 연동 직후: 받아 둔 기록으로 비교 기준(chart_clears)·스냅샷을 바로 잡는다. 다음 업로드부터 성과가 생긴다. */
export async function applyCachedRecords(link: MaishiftLink): Promise<void> {
  const e = cache.get(keyOf(link));
  if (!e) return;
  await applyMaishiftUpdate({ link, records: JSON.parse(e.clearJson), top: JSON.parse(e.topJson), rating: e.rating, uploadedAt: Date.parse(e.updatedAt) || Date.now() });
}

/** 연동할 때 아이디 확인. 없는 아이디면 MaishiftError(kind "not_found"). 캐시도 함께 채운다. */
export async function lookupMaishift(link: MaishiftLink): Promise<{ handle: string; name: string; rating: number }> {
  const e = await refreshOnce(link);
  return { handle: e.handle, name: e.name, rating: e.rating };
}

/**
 * 캐롤봇 북마클릿은 maishift 북마클릿을 함께 돌리지만 그 업로드가 끝나길 기다리지 않는다.
 * 그래서 동기화 뒤 잠시 있다가 maishift 프로필(작은 요청)을 확인해, 업로드 시각이 바뀌었으면 전체 기록을 받아
 * 성과를 반영한다. 그 사이 명령이 먼저 오면 그쪽에서 확인된다.
 */
const SYNC_CHECK_DELAYS_MS = [30_000, 90_000];
export function scheduleMaishiftCheck(link: MaishiftLink): void {
  for (const delay of SYNC_CHECK_DELAYS_MS) {
    setTimeout(() => {
      const e = cache.get(keyOf(link));
      if (e) e.checkedAt = 0;
      refreshOnce(link).catch((err) => console.error(`[maishift] ${link.handle} 동기화 뒤 확인:`, (err as Error).message));
    }, delay).unref();
  }
}

// ─── 이전 기록(업로드별 스냅샷) ────────────────────────────────────────────────
// 과거 레이팅표는 캐롤봇이 저장하지 않고 maishift 의 이전 기록을 받는다. 지난 업로드는 바뀌지 않으므로
// 업로드 목록은 PROFILE_TTL_MS 동안, 받은 스냅샷은 작은 LRU 에 둔다.
const UPLOADS_TTL_MS = PROFILE_TTL_MS;
const SNAPSHOT_CACHE_MAX = 50;
const uploadsCache = new Map<string, { at: number; list: MsUpload[] }>();
const snapshotCache = new Map<string, MaishiftSnapshot>();

export interface MaishiftSnapshot {
  uploadId: number;
  uploadedAt: number;
  rating: number;
  name: string;
  trophy: string;
  trophyClass: string;
  avatar: string;
  /** 레이팅 대상(신곡 15 → 구곡 35) */
  top: PlayRecord[];
  /** S-레이팅 대상 50 */
  sTop: PlayRecord[];
}

export type MaishiftSnapshotResult =
  | { kind: "ok"; snapshot: MaishiftSnapshot }
  /** 사용자가 maishift 에서 이전 기록을 공개하지 않음 */
  | { kind: "private" }
  /** 그 시각 이전 업로드가 없음. first/last: 볼 수 있는 업로드 범위(없으면 null) */
  | { kind: "none"; first: number | null; last: number | null };

async function uploadsOf(link: MaishiftLink): Promise<MsUpload[]> {
  const key = keyOf(link);
  const have = uploadsCache.get(key);
  if (have && Date.now() - have.at < UPLOADS_TTL_MS) return have.list;
  const list = uploadList(await callServerFn<string>(FN.uploads, { handle: link.handle, region: regionOf(link) }));
  uploadsCache.set(key, { at: Date.now(), list });
  while (uploadsCache.size > MAX_ENTRIES) uploadsCache.delete(uploadsCache.keys().next().value!);
  return list;
}

/** before(ms) 보다 앞선 마지막 업로드의 프로필. */
export async function getMaishiftSnapshot(link: MaishiftLink, before: number): Promise<MaishiftSnapshotResult> {
  const entry = await getEntry(link);
  if (!entry.pastRecordsVisible) return { kind: "private" };
  const list = await uploadsOf(link);
  const pick = [...list].reverse().find((u) => u.at < before);
  if (!pick) return { kind: "none", first: list[0]?.at ?? null, last: list[list.length - 1]?.at ?? null };
  const cacheKey = `${keyOf(link)}~${pick.id}`;
  const memo = snapshotCache.get(cacheKey);
  if (memo) return { kind: "ok", snapshot: memo };
  const res = await callServerFn<MsProfileResult>(FN.profile, { handle: `${link.handle}~${pick.id}`, region: regionOf(link) });
  const rec = res.userRecord;
  if (!rec?.profile) throw new MaishiftError("no snapshot record", "not_found");
  const p = rec.profile;
  const snapshot: MaishiftSnapshot = {
    uploadId: pick.id,
    uploadedAt: pick.at,
    rating: p.rating,
    name: p.name,
    trophy: p.trophy?.title ?? "",
    trophyClass: trophyClassOf(p.trophy?.tier),
    avatar: p.profileImageSrc,
    top: ratingTargets(rec),
    sTop: sRatingTargets(rec),
  };
  snapshotCache.set(cacheKey, snapshot);
  while (snapshotCache.size > SNAPSHOT_CACHE_MAX) snapshotCache.delete(snapshotCache.keys().next().value!);
  return { kind: "ok", snapshot };
}

// 곡 목록·상수·한국어 번역은 src/constants.ts 가 maishift 곡 목록에서 하루 한 번 받는다.
export function initMaishift(): void {
  registerProfileOverlay(overlay);
  console.log("[maishift] 프로필 연동 켜짐");
}
