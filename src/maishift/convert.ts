/**
 * maishift 응답 → 캐롤봇 형식(PlayRecord, CachedProfile 필드). 명령들은 maishift 응답을 직접 보지 않고
 * 여기서 바꾼 값만 쓴다. 공식 API로 옮길 때 이 파일과 serverFn.ts 만 바꾸면 되게 하려는 것.
 */
import type { PlayRecord } from "../scraper";
import type { MaishiftHistoryPoint, MaishiftVersion } from "../storage/types";
import { constantToDisplayLevel } from "../constants";

export interface MsSong {
  title: string;
  artist: string;
  jacketUrl: string;
  genre: string;
  songVersion: number;
  type: "DX" | "STANDARD" | string;
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
  } | null;
  ban?: { banned: boolean };
  /** 이전 기록(업로드별 스냅샷)을 볼 수 있는지 — 사용자의 maishift "이전 기록 공개" 설정 */
  pastRecordsVisible?: boolean;
}
export interface MsRecordsResult { songs: MsSong[]; tracks: MsTrack[] }
export interface MsHistoryPoint { rating: number; ratingNew: number; ratingOld: number; playCountTotal: number; playCountCurrent: number; date: string; versionId: number }

const DIFF: Record<string, string> = { BASIC: "BASIC", ADVANCED: "ADVANCED", EXPERT: "EXPERT", MASTER: "MASTER", RE_MASTER: "Re:MASTER" };
const FC: Record<string, string> = { FULL_COMBO: "FC", FULL_COMBO_PLUS: "FC+", ALL_PERFECT: "AP", ALL_PERFECT_PLUS: "AP+" };
const SYNC: Record<string, string> = { SYNC_PLAY: "SYNC", FULL_SYNC: "FS", FULL_SYNC_PLUS: "FS+", FULL_SYNC_DX: "FDX", FULL_SYNC_DX_PLUS: "FDX+" };

// x0o0x_ 의 곡 "　"(전각 공백)은 maishift 에 빈 제목으로 들어 있다. DX NET·캐롤봇 표기에 맞춘다.
const titleOf = (song: MsSong) => song.title || "\u3000";

export function toPlayRecord(song: MsSong, track: MsTrack & { r: MsRecord }): PlayRecord {
  const achievementVal = track.r.a / 10000;
  return {
    title: titleOf(song),
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

/** S-레이팅 대상곡(maishift 가 고른 50곡). */
export function sRatingTargets(rec: NonNullable<MsProfileResult["userRecord"]>): PlayRecord[] {
  const { songs, tracks } = rec.tracks;
  return (rec.ratingsS ?? [])
    .map((idx) => tracks[idx])
    .filter((t): t is MsTrack & { r: MsRecord } => !!t && played(t) && !!songs[t.s])
    .map((t) => toPlayRecord(songs[t.s], t));
}

export interface MsUpload { id: number; at: number; rating: number }
/** 업로드 목록(시간순). */
export function uploadList(raw: string): MsUpload[] {
  const { r } = JSON.parse(raw) as { r: [number, number, number, number, number][] };
  return r.map(([id, at, rating]) => ({ id, at, rating })).filter((u) => Number.isFinite(u.at)).sort((a, b) => a.at - b.at);
}

/** 플레이한 모든 보면의 기록(캐롤봇 clearJson 자리). */
export function allRecords(res: MsRecordsResult): PlayRecord[] {
  return res.tracks.filter(played).filter((t) => !!res.songs[t.s]).map((t) => toPlayRecord(res.songs[t.s], t));
}

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

/** 지역 버전 목록(출시 시각). 시각을 못 읽는 버전은 버린다. */
export function versionList(list: { value: number; name: string; releasedAt: string }[] | undefined): MaishiftVersion[] {
  return (list ?? [])
    .map((v) => ({ id: v.value, name: v.name, releasedAt: Date.parse(v.releasedAt) }))
    .filter((v) => Number.isFinite(v.releasedAt))
    .sort((a, b) => a.id - b.id);
}
