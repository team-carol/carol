/**
 * maishift 곡 목록(공식 API GET /songs, /versions) → 캐롤봇 곡·상수 카탈로그.
 * 예전 otoge-db music-ex(-intl).json 자리를 대신한다. 지역별로 한 번씩, 하루 한 번만 받는다(src/constants.ts).
 * 버전 폴더 안 순서는 API 에 없어 서버 함수 곡 목록에서 받는다(못 받아도 카탈로그는 만든다).
 */
import { callServerFn, FN } from "./serverFn";
import { callApi, type ApiRegion } from "./api";
import type { ApiSong, ApiSongsResult, ApiVersionsResult, MsSong } from "./convert";

export interface CatalogChart { kind: "ST" | "DX"; diff: string; constant: number; /** maishift 보면 번호(곡 상세 조회용) */ trackId?: number }
export interface CatalogSong {
  title: string;
  /** 캐롤봇 버전 코드(예: CiRCLE 26000, CiRCLE PLUS 26500). 같은 곡의 ST/DX 중 이른 쪽. */
  version: number;
  /** ST/DX 보면별 버전 코드. 한쪽이 나중에 추가된 곡은 둘이 다르다(예: DX Splash, ST MAGiCAL). */
  kindVersions: { ST?: number; DX?: number };
  /** 캐롤봇 장르명(예: "POPS＆アニメ"). 모르면 "". */
  genre: string;
  jacketUrl: string;
  artist?: string;
  /** maishift 한국어 번역(원제와 같으면 없음) */
  korean?: string;
  charts: CatalogChart[];
  /** ST/DX 곡마다 그 지역 버전 폴더 안 순서(0부터)와 세대 번호 */
  folders?: { kind: "ST" | "DX"; order: number; version: number }[];
}

/** 그 지역 버전(세대 번호·이름·출시 시각 ms). maishift 곡 목록의 availableVersions. */
export interface RegionVersion { index: number; name: string; releasedAt: number }
export interface RegionCatalog {
  songs: CatalogSong[];
  /** 그 지역 최신 세대 번호(이 세대 곡은 순서가 아직 바뀔 수 있다) */
  latestVersion: number;
  versions: RegionVersion[];
}


// maishift 세대 번호 → 캐롤봇(옛 otoge-db) 버전 코드. でらっくす(13)부터는 세대·PLUS 가 500 단위로 이어진다.
const OLD_VERSION_CODES = [10000, 11000, 12000, 13000, 14000, 15000, 16000, 17000, 18000, 18500, 19000, 19500, 19900];
export function versionCode(index: number): number {
  return index < OLD_VERSION_CODES.length ? OLD_VERSION_CODES[index] : 20000 + (index - OLD_VERSION_CODES.length) * 500;
}

/** 캐롤봇 버전 코드 → maishift 세대 번호(versionCode 의 역). 모르면 null. */
export function versionIndex(code: number): number | null {
  for (let i = 0; i < 60; i++) if (versionCode(i) === code) return i;
  return null;
}

// でらっくす(13)부터 세대마다 무印·PLUS 두 버전. 아직 모르는 세대는 번호로.
const DX_GENERATIONS = ["でらっくす", "Splash", "UNiVERSE", "FESTiVAL", "BUDDiES", "PRiSM", "CiRCLE", "MAGiCAL"];
const OLD_VERSION_NAMES = ["maimai", "maimai PLUS", "GreeN", "GreeN PLUS", "ORANGE", "ORANGE PLUS", "PiNK", "PiNK PLUS", "MURASAKi", "MURASAKi PLUS", "MiLK", "MiLK PLUS", "FiNALE"];
/** maishift 세대 번호 → 버전 이름(그래프의 버전 표시용). */
// 위 표에 없는(새로 나온) 세대는 maishift 곡 목록의 버전 이름을 쓴다(src/constants.ts 가 채운다).
const extraNames = new Map<number, string>();
export function setMaishiftVersionNames(list: RegionVersion[]): void {
  for (const v of list) if (!extraNames.has(v.index)) extraNames.set(v.index, v.name);
}

export function versionName(index: number): string {
  if (index < OLD_VERSION_NAMES.length) return OLD_VERSION_NAMES[index] ?? `ver.${index}`;
  const k = index - OLD_VERSION_NAMES.length;
  const gen = DX_GENERATIONS[Math.floor(k / 2)];
  return gen ? (k % 2 ? `${gen} PLUS` : gen) : extraNames.get(index) ?? `ver.${index}`;
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

/** "곡|ST"·"곡|DX" → 그 지역 버전 폴더 안 순서(0부터). */
export type FolderOrders = Map<string, number>;

/** 곡 목록 응답 → 곡 제목별 카탈로그. 같은 제목의 ST/DX 는 한 곡으로 묶는다. */
export function toCatalog(songs: ApiSong[], folderOrders: FolderOrders = new Map()): CatalogSong[] {
  const byTitle = new Map<string, CatalogSong>();
  for (const song of songs) {
    const title = song.title || "　"; // 곡 "　"(전각 공백)은 빈 제목으로 온다
    const code = versionCode(song.version);
    let e = byTitle.get(title);
    if (!e) {
      e = { title, version: code, kindVersions: {}, genre: GENRES[song.genre] ?? "", jacketUrl: song.jacketUrl ?? "", artist: song.artist ?? undefined, charts: [] };
      const ko = song.titleTranslations?.ko;
      if (ko && ko !== title) e.korean = ko;
      byTitle.set(title, e);
    } else {
      e.version = Math.min(e.version, code);
      if (!e.jacketUrl && song.jacketUrl) e.jacketUrl = song.jacketUrl;
    }
    // maishift 는 ST·DX 를 따로 된 곡으로 주므로 보면 종류별 버전은 여기서 받는다.
    const kind = song.type === "DX" ? "DX" : "ST";
    e.kindVersions[kind] = Math.min(e.kindVersions[kind] ?? code, code);
    const order = folderOrders.get(`${title}|${kind}`);
    if (order !== undefined) (e.folders ??= []).push({ kind, order, version: song.version });
    for (const c of song.charts) {
      const diff = DIFF[c.difficulty];
      if (!diff || !(c.internalLevel > 0)) continue;
      e.charts.push({ kind, diff, constant: c.internalLevel / 10, trackId: c.id });
    }
  }
  return [...byTitle.values()];
}

/** 버전 폴더 안 순서. 공식 API 에 없어 서버 함수 곡 목록에서 받는다. 실패하면 빈 맵(순서 표시만 빠진다). */
async function fetchFolderOrders(region: ApiRegion): Promise<FolderOrders> {
  const map: FolderOrders = new Map();
  try {
    const res = await callServerFn<{ tracks: { songs: MsSong[] } }>(FN.songs, { region: region === "jp" ? "JAPAN" : "ASIA" });
    for (const song of res?.tracks?.songs ?? []) {
      if (typeof song.versionFolderOrder !== "number") continue;
      map.set(`${song.title || "　"}|${song.type === "DX" ? "DX" : "ST"}`, song.versionFolderOrder);
    }
  } catch (e) {
    console.error(`[maishift] ${region} 버전 폴더 순서:`, (e as Error).message);
  }
  return map;
}

export async function fetchCatalog(region: ApiRegion): Promise<RegionCatalog> {
  const [songs, versions, folders] = await Promise.all([
    callApi<ApiSongsResult>("/songs", { region }),
    callApi<ApiVersionsResult>("/versions", { region }),
    fetchFolderOrders(region),
  ]);
  if (!songs?.songs?.length) throw new Error(`maishift ${region} 곡 목록이 비어 있음`);
  return {
    songs: toCatalog(songs.songs, folders),
    latestVersion: versions.latestVersion,
    versions: versions.versions
      .map((v) => ({ index: v.id, name: v.name, releasedAt: v.releasedAt ? Date.parse(v.releasedAt) : NaN }))
      .filter((v) => Number.isFinite(v.releasedAt))
      .sort((a, b) => a.index - b.index),
  };
}
