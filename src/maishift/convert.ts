/**
 * maishift 응답 → 캐롤봇 형식(PlayRecord, CachedProfile 필드). 명령들은 maishift 응답을 직접 보지 않고
 * 여기서 바꾼 값만 쓴다. 공식 API로 옮길 때 이 파일과 serverFn.ts 만 바꾸면 되게 하려는 것.
 */
import type { PlayRecord } from "../scraper";
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
/** s: songs 인덱스, l: 상수×10, p: 1 이면 추정 상수로 보임, r: 기록(플레이한 보면만) */
export interface MsTrack { s: number; i: number; d: string; l: number; p?: number; r?: MsRecord }
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
  } | null;
  ban?: { banned: boolean };
}
export interface MsRecordsResult { songs: MsSong[]; tracks: MsTrack[] }

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

/** 플레이한 모든 보면의 기록(캐롤봇 clearJson 자리). */
export function allRecords(res: MsRecordsResult): PlayRecord[] {
  return res.tracks.filter(played).filter((t) => !!res.songs[t.s]).map((t) => toPlayRecord(res.songs[t.s], t));
}

const TROPHY_CLASS: Record<string, string> = { NORMAL: "normal", BRONZE: "bronze", SILVER: "silver", GOLD: "gold", RAINBOW: "rainbow" };
export function trophyClassOf(tier: string | undefined): string {
  return TROPHY_CLASS[(tier ?? "").toUpperCase()] ?? "normal";
}
