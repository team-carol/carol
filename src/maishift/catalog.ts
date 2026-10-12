/**
 * maishift 곡 목록(/songs 페이지와 같은 데이터) → 캐롤봇 곡·상수 카탈로그.
 * 예전 otoge-db music-ex(-intl).json 자리를 대신한다. 지역별로 한 번씩, 하루 한 번만 받는다(src/constants.ts).
 */
import { callServerFn, FN, type MaishiftRegion } from "./serverFn";
import type { MsSong, MsTrack } from "./convert";

export interface CatalogChart { kind: "ST" | "DX"; diff: string; constant: number }
export interface CatalogSong {
  title: string;
  /** 캐롤봇 버전 코드(예: CiRCLE 26000, CiRCLE PLUS 26500). 같은 곡의 ST/DX 중 이른 쪽. */
  version: number;
  /** 캐롤봇 장르명(예: "POPS＆アニメ"). 모르면 "". */
  genre: string;
  jacketUrl: string;
  /** maishift 한국어 번역(원제와 같으면 없음) */
  korean?: string;
  charts: CatalogChart[];
}

interface SongsResult { regionLatestVersion: number; tracks: { songs: MsSong[]; tracks: MsTrack[] } }

// maishift 세대 번호 → 캐롤봇(옛 otoge-db) 버전 코드. でらっくす(13)부터는 세대·PLUS 가 500 단위로 이어진다.
const OLD_VERSION_CODES = [10000, 11000, 12000, 13000, 14000, 15000, 16000, 17000, 18000, 18500, 19000, 19500, 19900];
export function versionCode(index: number): number {
  return index < OLD_VERSION_CODES.length ? OLD_VERSION_CODES[index] : 20000 + (index - OLD_VERSION_CODES.length) * 500;
}

const GENRES: Record<string, string> = {
  POPS_AND_ANIME: "POPS＆アニメ",
  NICONICO_AND_VOCALOID: "niconico＆ボーカロイド",
  TOUHOU_PROJECT: "東方Project",
  GAME_AND_VARIETY: "ゲーム＆バラエティ",
  MAIMAI: "maimai",
  ONGEKI_AND_CHUNITHM: "オンゲキ＆CHUNITHM",
};

const DIFF: Record<string, string> = { BASIC: "BASIC", ADVANCED: "ADVANCED", EXPERT: "EXPERT", MASTER: "MASTER", RE_MASTER: "Re:MASTER" };

/** 곡 목록 응답 → 곡 제목별 카탈로그. 같은 제목의 ST/DX 는 한 곡으로 묶는다. */
export function toCatalog(songs: MsSong[], tracks: MsTrack[]): CatalogSong[] {
  const byTitle = new Map<string, CatalogSong>();
  const entryOf = (song: MsSong): CatalogSong => {
    const title = song.title || "　"; // 곡 "　"(전각 공백)은 빈 제목으로 온다
    let e = byTitle.get(title);
    if (!e) {
      e = { title, version: versionCode(song.songVersion), genre: GENRES[song.genre] ?? "", jacketUrl: song.jacketUrl, charts: [] };
      const ko = song.titleTranslations?.find((t) => t.language === "KOREAN")?.title;
      if (ko && ko !== title) e.korean = ko;
      byTitle.set(title, e);
    } else {
      e.version = Math.min(e.version, versionCode(song.songVersion));
    }
    return e;
  };
  songs.forEach(entryOf);
  for (const t of tracks) {
    const song = songs[t.s];
    const diff = DIFF[t.d];
    if (!song || !diff || !(t.l > 0)) continue;
    entryOf(song).charts.push({ kind: song.type === "DX" ? "DX" : "ST", diff, constant: t.l / 10 });
  }
  return [...byTitle.values()];
}

export async function fetchCatalog(region: MaishiftRegion): Promise<CatalogSong[]> {
  const res = await callServerFn<SongsResult>(FN.songs, { region });
  if (!res?.tracks?.songs?.length) throw new Error(`maishift ${region} 곡 목록이 비어 있음`);
  return toCatalog(res.tracks.songs, res.tracks.tracks);
}
