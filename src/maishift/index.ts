/**
 * maishift 연동. 프로필·기록·이전 기록은 공식 API(api.ts), API 에 없는 것(히스토리·미래시)은 서버 함수(serverFn.ts).
 *
 * 프로필·기록은 캐롤봇 DB에 저장하지 않고 메모리에만 잠깐 둔다. 이용 한도(앱마다 분당 120단위)를 아끼려고:
 * - 프로필(5단위)은 아이디마다 PROFILE_TTL_MS 에 한 번만 확인한다.
 * - 전체 기록(10)·업로드 목록(2)·레이팅 히스토리는 프로필의 syncedAt(maishift 업로드 시각)이 바뀌었을 때만 다시 받는다.
 * - 모든 요청은 api.ts / serverFn.ts 에서 한 줄로 세워 간격을 둔다.
 */
import { registerProfileOverlay, type MaishiftLink } from "../storage";
import type { CachedProfile, MaishiftHistoryPoint } from "../storage/types";
import { applyMaishiftUpdate } from "./sync";
import { rankImage } from "../rankImages";
import { callServerFn, FN, MaishiftError, type MaishiftRegion } from "./serverFn";
import { callApi } from "./api";
import { PENDING_FEATURES } from "./features";
import { ratingTargets, ratingTargetSum, trophyClassOf, uploadHistory, apiAllRecords, apiRatingTargets, classRankNumber, courseRankNumber, type MsProfileResult, type MsUpload, type ApiProfileResult, type ApiRecordsResult, type ApiSnapshotsResult } from "./convert";
import { getRegionVersions, regionLatestVersion } from "../constants";
import type { PlayRecord } from "../scraper";
import { forgetStampCards } from "./stamps";
import { forgetTrackScores } from "./track";
import { koreaPlayDayKey } from "../achievements";

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
  courseRank: number | undefined;
  classRank: number | undefined;
  playCount: number;
  totalPlayCount: number;
  friendCode: string;
  topJson: string;
  clearJson: string;
  history: MaishiftHistoryPoint[];
  /** maishift "이전 기록 공개" 설정(업로드 목록이 403 not_public 이면 false) */
  pastRecordsVisible: boolean;
  /** 미래시로 볼 세대(내수판이 앞서 있을 때). 없으면 null. */
  futureVersion: number | null;
}

const cache = new Map<string, Entry>();
/** 요청한 지역에 maishift 기록이 없는 연동(예: /설정 기본 서버를 내수판으로 했지만 국제판 기록만 있음). */
const regionMissing = new Set<string>();
/** maishift 에서 프로필을 비공개로 한 연동. 확인되면 받아 둔 기록을 모두 지우고 보여 주지 않는다. */
const privateProfiles = new Set<string>();
const inflight = new Map<string, Promise<Entry>>();
/** 새로 받은 전체 기록으로 성과·스냅샷·목표를 갱신하는 중인 작업. /성과 가 끝나길 기다린다. */
const applying = new Map<string, Promise<void>>();

const regionOf = (link: MaishiftLink): MaishiftRegion => (link.server === "jp" ? "JAPAN" : "ASIA");
const keyOf = (link: MaishiftLink) => `${link.server}:${link.handle.toLowerCase()}`;

function remember(key: string, e: Entry): void {
  cache.delete(key);
  cache.set(key, e);
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);
}

const apiPath = (link: MaishiftLink, rest = "") => `/profiles/${encodeURIComponent(link.handle)}${rest}`;

/** 미래시로 볼 세대: 국제판 연동이고 내수판 최신 세대가 더 앞서 있으면 그 세대. */
function futureVersionOf(link: MaishiftLink): number | null {
  if (!PENDING_FEATURES.future || link.server !== "intl") return null;
  const jp = regionLatestVersion("jp"), intl = regionLatestVersion("intl");
  return jp !== null && intl !== null && jp > intl ? jp : null;
}

async function refresh(link: MaishiftLink): Promise<Entry> {
  const key = keyOf(link);
  const region = link.server;
  const prev = cache.get(key);
  const fetchRecords = () => callApi<ApiRecordsResult>(apiPath(link, "/records"), { region });
  // 업로드 목록: 이전 기록 공개 여부, 레이팅 히스토리(그래프), 과거 레이팅표·/사진관 날짜 목록이 모두 이것을 쓴다.
  // 그래프용 부가 데이터라 못 받아도 프로필은 보여 준다(다음 업로드 때 다시 시도). 비공개면 히스토리도 없다.
  const fetchUploads = (): Promise<{ visible: boolean; history: MaishiftHistoryPoint[] }> => syncUploads(link)
    .then((up) => ({ visible: true, history: uploadHistory(up.list) }))
    .catch((e) => {
      if (e instanceof MaishiftError && e.kind === "private") return { visible: false, history: [] };
      console.error(`[maishift] ${link.handle} 업로드 목록:`, (e as Error).message);
      return { visible: prev?.pastRecordsVisible ?? false, history: prev?.history ?? [] };
    });
  const profileReq = callApi<ApiProfileResult>(apiPath(link), { region }).catch((e) => {
    if (e instanceof MaishiftError) {
      // 비공개로 바뀌었으면 메모리에 남은 기록도 지운다(다시 공개할 때까지 보여 주지 않음).
      if (e.kind === "private") forgetUser(link);
      // 요청한 지역에 기록이 없음. 다른 지역 기록을 보여 주지 않는다.
      if (e.kind === "region_missing") { regionMissing.add(key); cache.delete(key); }
    }
    throw e;
  });
  // 캐시가 없으면(재시작 직후·첫 조회) 한꺼번에 요청해 기다리는 시간을 줄인다.
  // 캐시가 있으면 프로필(작음)만 먼저 보고, 업로드 시각이 바뀌었을 때만 나머지를 받는다.
  const cold = prev ? null : { records: fetchRecords(), uploads: fetchUploads() };
  cold?.records.catch(() => {});
  const res = await profileReq;
  regionMissing.delete(key);
  privateProfiles.delete(key);
  const p = res.profile;
  if (!p) throw new MaishiftError("no record for region", "not_found");
  const same = prev && prev.updatedAt === p.syncedAt ? prev : null;
  let topJson = same?.topJson ?? "";
  let clearJson = same?.clearJson ?? "";
  let history = same?.history;
  let pastRecordsVisible = same?.pastRecordsVisible;
  if (!same) {
    const [recordsRes, uploads] = await Promise.all([cold?.records ?? fetchRecords(), cold?.uploads ?? fetchUploads()]);
    const records = apiAllRecords(recordsRes, region);
    const top = apiRatingTargets(recordsRes, region);
    topJson = JSON.stringify(top);
    clearJson = JSON.stringify(records);
    history = uploads.history;
    pastRecordsVisible = uploads.visible;
    // 새 기록이 올라왔으면 성과·스냅샷·목표를 갱신한다. 조회는 기다리게 하지 않는다.
    const job: Promise<void> = applyMaishiftUpdate({ link, records, top, rating: p.rating, uploadedAt: Date.parse(p.syncedAt) || Date.now() })
      .catch((e) => console.error(`[maishift] ${link.handle} 기록 반영:`, e))
      .finally(() => { if (applying.get(key) === job) applying.delete(key); });
    applying.set(key, job);
  }
  const entry: Entry = {
    checkedAt: Date.now(),
    updatedAt: p.syncedAt,
    handle: res.handle || link.handle,
    name: p.name,
    rating: p.rating,
    avatar: p.iconUrl,
    trophy: p.title?.text ?? "",
    trophyClass: trophyClassOf(p.title?.tier),
    stars: p.stars,
    courseRank: courseRankNumber(p.courseRank),
    classRank: classRankNumber(p.classRank),
    playCount: p.playCount?.current ?? 0,
    totalPlayCount: p.playCount?.total ?? 0,
    friendCode: p.friendCode ?? "",
    topJson,
    clearJson,
    history: history ?? [],
    pastRecordsVisible: pastRecordsVisible === true,
    futureVersion: futureVersionOf(link),
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

/**
 * /성과 용: maishift 에 새로 올린 기록이 성과로 반영될 때까지 기다린다(최대 budgetMs).
 * 프로필을 확인한 지 maxAgeMs 가 지났으면 업로드 시각부터 다시 확인한다(5분 캐시를 기다리지 않게).
 */
export async function settleMaishiftRecords(link: MaishiftLink, maxAgeMs = 60_000, budgetMs = 8_000): Promise<void> {
  const key = keyOf(link);
  const have = cache.get(key);
  const pending: Promise<unknown> | undefined = inflight.get(key)
    ?? (!have || Date.now() - have.checkedAt > maxAgeMs ? refreshOnce(link) : undefined);
  const work = (async () => {
    if (pending) await pending.catch(() => {});
    await applying.get(key);
  })();
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([work, new Promise<void>((r) => { timer = setTimeout(r, budgetMs); })]);
  clearTimeout(timer);
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
    maishiftVersions: getRegionVersions(link.server).map((v) => ({ id: v.index, name: v.name, releasedAt: v.releasedAt })),
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
    // 일시적인 실패면 받아 둔 값으로 답한다. 비공개·지역 없음이면 보여 주지 않는다(그때 캐시는 이미 지웠다).
    e = privateProfiles.has(keyOf(link)) ? null : cache.get(keyOf(link)) ?? null;
    if (!e && err instanceof MaishiftError) lastFailure.set(keyOf(link), { error: err, at: Date.now() });
  }
  return e ? toProfile(profileKey, link, e, extras) : null;
}

/** 캐시가 없어 프로필을 못 보여 준 마지막 이유(이용 한도 초과 등). 안내 문구를 고르는 데만 쓰고 잠깐 뒤 잊는다. */
const lastFailure = new Map<string, { error: MaishiftError; at: number }>();
const FAILURE_MEMORY_MS = 60_000;
export function recentMaishiftFailure(link: MaishiftLink): MaishiftError | null {
  const f = lastFailure.get(keyOf(link));
  return f && Date.now() - f.at < FAILURE_MEMORY_MS ? f.error : null;
}

/** 비공개로 확인된 사용자의 받아 둔 maishift 데이터를 모두 지운다. 지역과 관계없이 그 아이디 전부. */
function forgetUser(link: MaishiftLink): void {
  const handle = link.handle.toLowerCase();
  for (const server of ["intl", "jp"] as const) {
    const key = keyOf({ handle: link.handle, server });
    privateProfiles.add(key);
    cache.delete(key);
    uploadsCache.delete(key);
    for (const k of [...futureCache.keys()]) if (k.startsWith(`${key}:`)) futureCache.delete(k);
  }
  for (const k of [...snapshotCache.keys()]) if (k.split("~")[0].endsWith(`:${handle}`)) snapshotCache.delete(k);
  forgetStampCards(link.handle);
  forgetTrackScores(link.handle);
}

/** 연동 해제: 메모리에 받아 둔 그 아이디의 maishift 데이터를 지운다(비공개 표시는 하지 않는다). */
export function dropMaishiftCache(link: MaishiftLink): void {
  const handle = link.handle.toLowerCase();
  for (const server of ["intl", "jp"] as const) {
    const key = keyOf({ handle: link.handle, server });
    cache.delete(key);
    uploadsCache.delete(key);
    for (const k of [...futureCache.keys()]) if (k.startsWith(`${key}:`)) futureCache.delete(k);
  }
  for (const k of [...snapshotCache.keys()]) if (k.split("~")[0].endsWith(`:${handle}`)) snapshotCache.delete(k);
  forgetStampCards(link.handle);
  forgetTrackScores(link.handle);
}

/** 사용자가 maishift 에서 프로필을 비공개로 했다고 확인됐는지. 명령의 "미등록" 안내를 바꾸는 데 쓴다. */
export function isProfilePrivate(link: MaishiftLink): boolean {
  return privateProfiles.has(keyOf(link));
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
// 과거 레이팅표·레이팅 히스토리는 캐롤봇이 저장하지 않고 maishift 의 이전 기록(API snapshots)을 받는다.
// 업로드 목록은 최근 순 쪽(200개, 2단위)으로 온다. 처음에는 끝까지 받고, 그 뒤에는 새로 생긴 것만 앞쪽에서 받아 붙인다.
// 지난 업로드는 바뀌지 않으므로 받은 스냅샷은 작은 LRU 에 둔다.
const UPLOADS_TTL_MS = PROFILE_TTL_MS;
const UPLOADS_PAGE = 200;
const SNAPSHOT_CACHE_MAX = 50;
/** list: 그 사람의 업로드 전체(최근 순). */
interface Uploads { at: number; list: MsUpload[] }
const uploadsCache = new Map<string, Uploads>();
const snapshotCache = new Map<string, MaishiftSnapshot>();

export interface MaishiftSnapshot {
  uploadId: number;
  uploadedAt: number;
  rating: number;
  /** API 이전 기록에는 그때의 이름·칭호·아이콘이 없어 지금 값을 쓴다. */
  name: string;
  trophy: string;
  trophyClass: string;
  avatar: string;
  /** 레이팅 대상(신곡 15 → 구곡 35) */
  top: PlayRecord[];
  /** 그때의 전체 기록. S-레이팅표가 여기서 50개를 고른다. */
  sTop: PlayRecord[];
}

export type MaishiftSnapshotResult =
  | { kind: "ok"; snapshot: MaishiftSnapshot }
  /** 사용자가 maishift 에서 이전 기록을 공개하지 않음 */
  | { kind: "private" }
  /** 그 시각 이전 업로드가 없음. first/last: 볼 수 있는 업로드 범위(없으면 null) */
  | { kind: "none"; first: number | null; last: number | null };

/** 업로드 목록 전체를 맞춘다. 받아 둔 목록이 있으면 이미 아는 업로드가 나올 때까지만 받는다. 비공개면 MaishiftError(private). */
async function syncUploads(link: MaishiftLink): Promise<Uploads> {
  const key = keyOf(link);
  const have = uploadsCache.get(key);
  const known = new Set(have?.list.map((u) => u.id));
  const fresh: MsUpload[] = [];
  let cursor: number | null = null;
  let reachedKnown = false;
  do {
    const res: ApiSnapshotsResult = await callApi<ApiSnapshotsResult>(apiPath(link, "/snapshots"), { region: link.server, limit: UPLOADS_PAGE, cursor: cursor ?? undefined });
    for (const u of res.snapshots) {
      if (known.has(u.id)) { reachedKnown = true; break; }
      const at = Date.parse(u.syncedAt);
      if (Number.isFinite(at)) fresh.push({ id: u.id, at, rating: u.rating, version: u.version });
    }
    cursor = res.nextCursor;
  } while (!reachedKnown && cursor !== null);
  const next: Uploads = { at: Date.now(), list: reachedKnown && have ? [...fresh, ...have.list] : fresh };
  uploadsCache.delete(key);
  uploadsCache.set(key, next);
  while (uploadsCache.size > MAX_ENTRIES) uploadsCache.delete(uploadsCache.keys().next().value!);
  return next;
}

/** 받아 둔 업로드 목록. PROFILE_TTL_MS 가 지났으면 새로 생긴 것을 받아 붙인다. */
async function uploadsOf(link: MaishiftLink): Promise<Uploads> {
  const up = uploadsCache.get(keyOf(link));
  return up && Date.now() - up.at < UPLOADS_TTL_MS ? up : syncUploads(link);
}

/** maishift 에 업로드한 날(오전 4시 기준 하루, 최근 순). 이전 기록을 공개하지 않았으면 null. /사진관 과거 레이팅표 날짜 목록용. */
export async function getMaishiftUploadDays(link: MaishiftLink): Promise<string[] | null> {
  const entry = await getEntry(link);
  if (!entry.pastRecordsVisible) return null;
  const daysOf = (list: MsUpload[]) => [...new Set(list.map((u) => koreaPlayDayKey(new Date(u.at))))];
  try {
    return daysOf((await uploadsOf(link)).list);
  } catch (e) {
    if (e instanceof MaishiftError && e.kind === "private") return null;
    throw e;
  }
}

/** before(ms) 보다 앞선 마지막 업로드의 기록. */
export async function getMaishiftSnapshot(link: MaishiftLink, before: number): Promise<MaishiftSnapshotResult> {
  const entry = await getEntry(link);
  if (!entry.pastRecordsVisible) return { kind: "private" };
  try {
    const up = await uploadsOf(link);
    const pick = up.list.find((u) => u.at < before);
    if (!pick) return { kind: "none", first: up.list[up.list.length - 1]?.at ?? null, last: up.list[0]?.at ?? null };
    const cacheKey = `${keyOf(link)}~${pick.id}`;
    const memo = snapshotCache.get(cacheKey);
    if (memo) return { kind: "ok", snapshot: memo };
    const res = await callApi<ApiRecordsResult>(apiPath(link, `/snapshots/${pick.id}`), { region: link.server });
    const snapshot: MaishiftSnapshot = {
      uploadId: pick.id,
      uploadedAt: pick.at,
      rating: pick.rating,
      name: entry.name,
      trophy: entry.trophy,
      trophyClass: entry.trophyClass,
      avatar: entry.avatar,
      top: apiRatingTargets(res, link.server),
      sTop: apiAllRecords(res, link.server),
    };
    snapshotCache.set(cacheKey, snapshot);
    while (snapshotCache.size > SNAPSHOT_CACHE_MAX) snapshotCache.delete(snapshotCache.keys().next().value!);
    return { kind: "ok", snapshot };
  } catch (e) {
    if (e instanceof MaishiftError && e.kind === "private") return { kind: "private" };
    throw e;
  }
}

// 미래시: 내수판에 먼저 나온 세대의 상수·신곡 범위로 다시 계산한 레이팅 대상. maishift 프로필 화면의 "미래시 보기".
// 공식 API 에 없어 서버 함수(profile 에 handle `<handle>:<세대>`)로 받는다.
// 그 세대 상수는 바뀔 수 있으므로 업로드 시각이 같아도 PROFILE_TTL_MS 가 지나면 다시 받는다.
const futureCache = new Map<string, { at: number; future: MaishiftFuture }>();

export interface MaishiftFuture {
  versionId: number;
  /** 그 세대 기준 레이팅(레이팅 대상곡 레이팅 합) */
  rating: number;
  /** 레이팅 대상(신곡 15 → 구곡 35) */
  top: PlayRecord[];
}

/** 받아 둔 프로필 기준으로 미래시로 볼 세대가 있는지(요청은 하지 않는다). 프로필을 아직 받지 않았으면 null. */
export function maishiftFutureVersion(link: MaishiftLink): number | null {
  return cache.get(keyOf(link))?.futureVersion ?? null;
}

/** 미래시 레이팅 대상. 볼 세대가 없으면(내수판·두 지역 세대가 같을 때) null. */
export async function getMaishiftFuture(link: MaishiftLink): Promise<MaishiftFuture | null> {
  const entry = await getEntry(link);
  const version = entry.futureVersion;
  if (version === null) return null;
  const cacheKey = `${keyOf(link)}:${version}@${entry.updatedAt}`;
  const memo = futureCache.get(cacheKey);
  if (memo && Date.now() - memo.at < PROFILE_TTL_MS) return memo.future;
  const res = await callServerFn<MsProfileResult>(FN.profile, { handle: `${link.handle}:${version}`, region: regionOf(link) });
  const rec = res.userRecord;
  if (!rec?.profile) throw new MaishiftError("no future record", "not_found");
  const future: MaishiftFuture = { versionId: version, rating: ratingTargetSum(rec), top: ratingTargets(rec) };
  futureCache.delete(cacheKey);
  futureCache.set(cacheKey, { at: Date.now(), future });
  while (futureCache.size > SNAPSHOT_CACHE_MAX) futureCache.delete(futureCache.keys().next().value!);
  return future;
}

// 곡 목록·상수·한국어 번역은 src/constants.ts 가 maishift 곡 목록에서 하루 한 번 받는다.
export function initMaishift(): void {
  registerProfileOverlay(overlay);
  console.log("[maishift] 프로필 연동 켜짐");
}
