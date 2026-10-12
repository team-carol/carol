/**
 * maishift 연동(임시 — 공식 API 전까지, 배포하지 않음).
 *
 * 프로필·기록은 캐롤봇 DB에 저장하지 않고 메모리에만 잠깐 둔다. 부하를 줄이려고:
 * - 프로필(작음)은 아이디마다 PROFILE_TTL_MS 에 한 번만 확인한다.
 * - 전체 기록(큼)과 레이팅 히스토리는 프로필의 updatedAt(maishift 업로드 시각)이 바뀌었을 때만 다시 받는다.
 * - 모든 요청은 serverFn.ts 에서 한 줄로 세워 간격을 둔다.
 */
import { registerProfileOverlay, maishiftProfileKey, type MaishiftLink } from "../storage";
import type { CachedProfile, MaishiftHistoryPoint } from "../storage/types";
import { callServerFn, FN, MaishiftError, type MaishiftRegion } from "./serverFn";
import { ratingTargets, allRecords, trophyClassOf, historyPoints, type MsProfileResult, type MsRecordsResult, type MsHistoryPoint } from "./convert";

export { MaishiftError } from "./serverFn";

const PROFILE_TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 200;
/** 이미 캐롤봇 프로필이 있는 유저는 maishift 가 늦으면 이만큼만 기다리고 가진 값으로 답한다. */
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
  playCount: number;
  totalPlayCount: number;
  friendCode: string;
  topJson: string;
  clearJson: string;
  history: MaishiftHistoryPoint[];
}

const cache = new Map<string, Entry>();
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
  const res = await callServerFn<MsProfileResult>(FN.profile, args);
  const rec = res.userRecord;
  if (!rec?.profile) throw new MaishiftError("no record for region", "not_found");
  const p = rec.profile;
  const prev = cache.get(key);
  const same = prev && prev.updatedAt === p.updatedAt ? prev : null;
  let clearJson = same?.clearJson ?? "";
  let history = same?.history ?? null;
  if (!clearJson) {
    const all = await callServerFn<MsRecordsResult>(FN.records, args);
    clearJson = JSON.stringify(allRecords(all));
  }
  if (!history) {
    // 히스토리는 그래프용 부가 데이터라 못 받아도 프로필은 보여 준다(다음 업로드 때 다시 시도).
    history = await callServerFn<MsHistoryPoint[]>(FN.history, args).then(historyPoints).catch((e) => {
      console.error(`[maishift] ${link.handle} 히스토리:`, (e as Error).message);
      return [];
    });
  }
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
    playCount: p.playCount?.current ?? 0,
    totalPlayCount: p.playCount?.total ?? 0,
    friendCode: p.friendCode ?? "",
    topJson: JSON.stringify(ratingTargets(rec)),
    clearJson,
    history,
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

/** budgetMs 안에 새 값이 안 오면 가진 값(없으면 null)을 돌려준다. 새로 받는 일은 뒤에서 계속된다. */
async function getEntry(link: MaishiftLink, budgetMs: number): Promise<Entry | null> {
  const have = cache.get(keyOf(link)) ?? null;
  if (have && Date.now() - have.checkedAt < PROFILE_TTL_MS) return have;
  const pending = refreshOnce(link);
  if (!Number.isFinite(budgetMs)) return pending;
  pending.catch(() => {});
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), budgetMs));
  return (await Promise.race([pending, timeout])) ?? have;
}

function toProfile(base: CachedProfile | null, link: MaishiftLink, e: Entry): CachedProfile {
  const shell: CachedProfile = base ?? {
    profileKey: maishiftProfileKey(link),
    server: link.server,
    friendCode: e.friendCode,
    playerName: "",
    rating: 0,
    ratingMax: 0,
    trophy: "",
    trophyClass: "normal",
    avatar: "",
    // 클래스·단위 이미지는 DX NET 파일명에 임의 문자열이 붙어 있어 번호로 만들 수 없다.
    gradeImg: "",
    courseImg: "",
    circleJson: "",
    stars: "0",
    comment: "",
    playCount: 0,
    totalPlayCount: 0,
    lastSyncedAt: 0,
    recentJson: "[]",
    topJson: "[]",
    clearJson: "[]",
    mapJson: "[]",
  };
  return {
    ...shell,
    playerName: e.name,
    rating: e.rating,
    trophy: e.trophy,
    trophyClass: e.trophyClass,
    avatar: e.avatar,
    stars: String(e.stars),
    playCount: e.playCount,
    totalPlayCount: e.totalPlayCount,
    lastSyncedAt: Date.parse(e.updatedAt) || shell.lastSyncedAt,
    topJson: e.topJson,
    clearJson: e.clearJson,
    maishiftHistory: e.history,
    source: "maishift",
  };
}

async function overlay(base: CachedProfile | null, link: MaishiftLink): Promise<CachedProfile | null> {
  let e: Entry | null = null;
  try {
    e = await getEntry(link, base ? WAIT_BUDGET_MS : Infinity);
  } catch (err) {
    console.error(`[maishift] ${link.handle}:`, (err as Error).message);
    e = cache.get(keyOf(link)) ?? null;
  }
  return e ? toProfile(base, link, e) : base;
}

/** 연동할 때 아이디 확인. 없는 아이디면 MaishiftError(kind "not_found"). 캐시도 함께 채운다. */
export async function lookupMaishift(link: MaishiftLink): Promise<{ handle: string; name: string; rating: number }> {
  const e = await refreshOnce(link);
  return { handle: e.handle, name: e.name, rating: e.rating };
}

/** 북마클릿 동기화 직후처럼 maishift 에 새 기록이 올라갔을 만한 때, 다음 조회에서 바로 확인하게 한다. */
export function markMaishiftStale(link: MaishiftLink): void {
  const e = cache.get(keyOf(link));
  if (e) e.checkedAt = 0;
}

// 곡 목록·상수·한국어 번역은 src/constants.ts 가 maishift 곡 목록에서 하루 한 번 받는다.
export function initMaishift(): void {
  registerProfileOverlay(overlay);
  console.log("[maishift] 프로필 연동 켜짐");
}
