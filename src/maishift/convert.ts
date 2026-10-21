/**
 * maishift 응답 → 캐롤봇 형식(PlayRecord, CachedProfile 필드). 명령들은 maishift 응답을 직접 보지 않고
 * 여기서 바꾼 값만 쓴다. 공식 API(api.ts) 응답은 Api* 형식이고, Ms* 는 API 에 없어 아직 서버 함수(serverFn.ts)로
 * 받는 데이터(미래시·히스토리·버전 폴더 순서)의 형식이다.
 */
import type { PlayRecord } from "../scraper";
import type { MaimaiServer, MaishiftHistoryPoint } from "../storage/types";
import { constantToDisplayLevel, getJacketUrl, getSongVersion } from "../constants";
import { versionIndex } from "./catalog";

// ─── 공식 API ───────────────────────────────────────────────────────────────
export type ApiDifficulty = "BASIC" | "ADVANCED" | "EXPERT" | "MASTER" | "RE_MASTER";
export interface ApiChart { id: number; difficulty: ApiDifficulty; level: string; internalLevel: number; internalLevelSource: "community" | "maishift" | "estimated" }
export interface ApiSong {
  id: number;
  title: string;
  artist: string | null;
  genre: string;
  /** STANDARD 와 DX 는 서로 다른 곡이다. */
  type: "STANDARD" | "DX";
  /** 곡이 추가된 버전(세대 번호) */
  version: number;
  jacketUrl: string | null;
  titleTranslations?: { ko?: string; en?: string };
  charts: ApiChart[];
}
export interface ApiSongsResult { region: string; version: number; songs: ApiSong[] }
export interface ApiVersionsResult { region: string; latestVersion: number; versions: { id: number; name: string; releasedAt: string | null }[] }
export interface ApiProfile {
  name: string;
  rating: number;
  iconUrl: string;
  title: { text: string; tier: string };
  classRank: string;
  courseRank: string | null;
  stars: number;
  playCount: { total: number; current: number } | null;
  /** 플레이어가 공개했을 때만 */
  friendCode: string | null;
  syncedAt: string;
}
export interface ApiProfileResult { handle: string; region: string; regions: string[]; profile: ApiProfile }
export interface ApiRecord {
  chartId: number;
  title: string;
  type: "STANDARD" | "DX";
  difficulty: ApiDifficulty;
  level: string;
  internalLevel: number;
  achievement: number;
  combo: string;
  sync: string;
  dxScore: number;
  dxScoreMax: number;
  rating: number;
  /** false 면 상수가 추정값 */
  ratingAccurate: boolean;
}
export interface ApiRecordsResult {
  handle: string | null;
  region: string;
  version: number;
  syncedAt: string;
  records: ApiRecord[];
  /** 레이팅 대상 chartId(신곡 15, 구곡 35, 높은 순) */
  best: { new: number[]; old: number[] };
}
export interface ApiSnapshot { id: number; syncedAt: string; rating: number; version: number | null }
export interface ApiSnapshotsResult { handle: string; region: string; snapshots: ApiSnapshot[]; nextCursor: number | null }

const DIFF: Record<string, string> = { BASIC: "BASIC", ADVANCED: "ADVANCED", EXPERT: "EXPERT", MASTER: "MASTER", RE_MASTER: "Re:MASTER" };
const FC: Record<string, string> = { FULL_COMBO: "FC", FULL_COMBO_PLUS: "FC+", ALL_PERFECT: "AP", ALL_PERFECT_PLUS: "AP+" };
const SYNC: Record<string, string> = { SYNC_PLAY: "SYNC", FULL_SYNC: "FS", FULL_SYNC_PLUS: "FS+", FULL_SYNC_DX: "FDX", FULL_SYNC_DX_PLUS: "FDX+" };

// x0o0x_ 의 곡 "　"(전각 공백)은 maishift 에 빈 제목으로 들어 있다. DX NET·캐롤봇 표기에 맞춘다.
export const titleOf = (title: string) => title || "\u3000";

/** API 기록 → PlayRecord. 재킷·곡 버전은 기록에 없어 곡 카탈로그(src/constants.ts)에서 찾는다. */
export function apiPlayRecord(r: ApiRecord, server: MaimaiServer): PlayRecord {
  const title = titleOf(r.title);
  const musicKind = r.type === "DX" ? "DX" : "ST";
  const code = getSongVersion(title, server, musicKind);
  const achievementVal = r.achievement / 10000;
  return {
    title,
    achievement: `${achievementVal.toFixed(4)}%`,
    diff: DIFF[r.difficulty] ?? r.difficulty,
    level: r.level,
    date: "",
    jacketUrl: getJacketUrl(title) ?? "",
    musicKind,
    achievementVal,
    track: 0,
    fc: FC[r.combo] ?? "",
    sync: SYNC[r.sync] ?? "",
    dxScore: r.dxScore,
    dxScoreMax: r.dxScoreMax,
    constant: r.internalLevel / 10,
    constantEstimated: r.ratingAccurate === false || undefined,
    songVersion: code !== null ? versionIndex(code) ?? undefined : undefined,
  };
}

/** 플레이한 모든 보면의 기록(캐롤봇 clearJson 자리). */
export function apiAllRecords(res: ApiRecordsResult, server: MaimaiServer): PlayRecord[] {
  return res.records.map((r) => apiPlayRecord(r, server));
}

/** 레이팅 대상곡. 캐롤봇 topJson 과 같은 순서(신곡 15 → 구곡 35). */
export function apiRatingTargets(res: ApiRecordsResult, server: MaimaiServer): PlayRecord[] {
  const byId = new Map(res.records.map((r) => [r.chartId, r]));
  return [...res.best.new, ...res.best.old]
    .map((id) => byId.get(id))
    .filter((r): r is ApiRecord => !!r)
    .map((r) => apiPlayRecord(r, server));
}

// 단위·클래스 → DX NET 이미지 번호(src/rankImages.ts 키). maishift 서버 함수가 주던 번호와 같다.
// 클래스: B5 = 0 … LEGEND = 25. 단위: 初段~十段 1~10, (옛 皆伝 11), 真初段~真十段 12~21, 真皆伝 22, 裏皆伝 23.
const CLASS_RANKS = ["B5", "B4", "B3", "B2", "B1", "A5", "A4", "A3", "A2", "A1", "S5", "S4", "S3", "S2", "S1", "SS5", "SS4", "SS3", "SS2", "SS1", "SSS5", "SSS4", "SSS3", "SSS2", "SSS1", "LEGEND"];
export function classRankNumber(rank: string | null | undefined): number | undefined {
  const i = CLASS_RANKS.indexOf(rank ?? "");
  return i >= 0 ? i : undefined;
}
export function courseRankNumber(rank: string | null | undefined): number | undefined {
  if (!rank) return undefined;
  if (rank === "NONE") return 0;
  if (rank === "SHIN_KAIDEN") return 22;
  if (rank === "URA_KAIDEN") return 23;
  const m = rank.match(/^(SHIN_)?DAN_(\d+)$/);
  if (!m) return undefined;
  return (m[1] ? 11 : 0) + Number(m[2]);
}

// ─── 서버 함수(API 에 없는 데이터) ─────────────────────────────────────────────

export interface MsSong {
  title: string;
  artist: string;
  jacketUrl: string;
  genre: string;
  songVersion: number;
  type: "DX" | "STANDARD" | string;
  /** 그 지역 버전 폴더 안 순서(0부터). maishift 곡 창의 "버전 안 순서"와 같다. */
  versionFolderOrder?: number;
  titleTranslations?: { title: string; language: string }[];
}
export interface MsRecord { a: number; d: number; m: number; g: number; c?: string; y?: string }
/** s: songs 인덱스, l: 상수×10, x: 0 이면 그 시점 상수가 확정되지 않은 추정값(maishift 는 "?" 표시), r: 기록(플레이한 보면만) */
export interface MsTrack { s: number; i: number; d: string; l: number; p?: number; x?: number; r?: MsRecord }
export interface MsProfile {
  name: string;
  rating: number;
  profileImageSrc: string;
  friendCode: string | null;
  trophy: { tier: string; title: string } | null;
  courseRank: number;
  classRank: number;
  stars: number;
  playCount: { total: number; current: number };
  updatedAt: string;
}
export interface MsProfileResult {
  handle: string;
  /** 실제로 준 기록의 지역. 요청한 지역에 기록이 없으면 대표 지역(isPrimaryRegion)이 온다. */
  region: string;
  userRecord: {
    profile: MsProfile;
    tracks: { songs: MsSong[]; tracks: MsTrack[] };
    /** tracks.tracks 의 인덱스 */
    ratingsLatest: number[];
    ratingsOld: number[];
    /** S-레이팅 대상(DX 점수 기준 상위 50) */
    ratingsS?: number[];
    availableVersions?: { value: number; name: string; releasedAt: string }[];
    /** 그 지역의 최신 세대 번호 */
    regionLatestVersion?: number;
    /** 미래시 세대 번호. 내수판이 앞서 있으면 regionLatestVersion 보다 크다. 그 세대 상수로 본 프로필은 handle 을 `<handle>:<세대>` 로 넘겨 받는다. */
    futureVersion?: number | null;
  } | null;
  ban?: { banned: boolean };
  /** 이전 기록(업로드별 스냅샷)을 볼 수 있는지 — 사용자의 maishift "이전 기록 공개" 설정 */
  pastRecordsVisible?: boolean;
}
export interface MsHistoryPoint { rating: number; ratingNew: number; ratingOld: number; playCountTotal: number; playCountCurrent: number; date: string; versionId: number }

export function toPlayRecord(song: MsSong, track: MsTrack & { r: MsRecord }): PlayRecord {
  const achievementVal = track.r.a / 10000;
  return {
    title: titleOf(song.title),
    achievement: `${achievementVal.toFixed(4)}%`,
    diff: DIFF[track.d] ?? track.d,
    level: constantToDisplayLevel(track.l / 10),
    date: "",
    jacketUrl: song.jacketUrl,
    musicKind: song.type === "DX" ? "DX" : "ST",
    achievementVal,
    track: 0,
    fc: FC[track.r.c ?? ""] ?? "",
    sync: SYNC[track.r.y ?? ""] ?? "",
    dxScore: track.r.d,
    dxScoreMax: track.r.m,
    constant: track.l / 10,
    constantEstimated: track.x === 0 || undefined,
    songVersion: song.songVersion,
  };
}

function played(t: MsTrack): t is MsTrack & { r: MsRecord } { return !!t.r; }

/** 레이팅 대상곡. 캐롤봇 topJson 과 같은 순서(신곡 15 → 구곡 35). */
export function ratingTargets(rec: NonNullable<MsProfileResult["userRecord"]>): PlayRecord[] {
  const { songs, tracks } = rec.tracks;
  return [...rec.ratingsLatest, ...rec.ratingsOld]
    .map((idx) => tracks[idx])
    .filter((t): t is MsTrack & { r: MsRecord } => !!t && played(t) && !!songs[t.s])
    .map((t) => toPlayRecord(songs[t.s], t));
}

/** 레이팅 대상곡의 곡별 레이팅(소수점 아래 버림) 합. 미래시처럼 프로필 레이팅과 다른 세대로 볼 때 쓴다. */
export function ratingTargetSum(rec: NonNullable<MsProfileResult["userRecord"]>): number {
  const { tracks } = rec.tracks;
  return [...rec.ratingsLatest, ...rec.ratingsOld].reduce((sum, idx) => sum + Math.floor(tracks[idx]?.r?.g ?? 0), 0);
}

/** 업로드(이전 기록) 하나. at: 시각(ms). */
export interface MsUpload { id: number; at: number; rating: number }

const TROPHY_CLASS: Record<string, string> = { NORMAL: "normal", BRONZE: "bronze", SILVER: "silver", GOLD: "gold", RAINBOW: "rainbow" };
export function trophyClassOf(tier: string | undefined): string {
  return TROPHY_CLASS[(tier ?? "").toUpperCase()] ?? "normal";
}

/** 히스토리 → 캐롤봇 형식(시간순). 시각을 못 읽는 점은 버린다. */
export function historyPoints(list: MsHistoryPoint[]): MaishiftHistoryPoint[] {
  return list
    .map((h) => ({ at: Date.parse(h.date), rating: h.rating, playTotal: h.playCountTotal, playCurrent: h.playCountCurrent, versionId: h.versionId }))
    .filter((h) => Number.isFinite(h.at) && h.rating > 0)
    .sort((a, b) => a.at - b.at);
}
