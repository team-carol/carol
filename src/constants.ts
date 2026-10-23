import { getConstantsCache, saveConstantsCache } from "./storage";
import { setExternalTranslations } from "./aliases";
import { fetchCatalog, setMaishiftVersionNames, versionCode, versionName as msVersionName, type CatalogSong, type RegionVersion } from "./maishift/catalog";
import type { PlayRecord, MaimaiServer } from "./scraper";

// 곡·상수 카탈로그는 maishift 곡 목록(국제판 ASIA, 내수판 JAPAN)에서 받는다(예전엔 otoge-db).
// 하루 한 번만 받아 constants_cache 에 두고 쓴다. 宴(우타게) 보면은 maishift 에 없다.
let constantMap: Map<string, number> = new Map();
// 내수판(JP) 상수 맵. 국제판/JP 리밸런스로 값이 달라질 수 있어,
// JAPAN 곡 목록의 상수를 별도로 보관해 JP 프로필 레이팅 계산에 사용한다.
let jpConstantMap: Map<string, number> = new Map();
// 곡 → 재킷 파일명(DX NET 파일명, 예: "c7cfd8a91e0436ac.png")
let jacketMap: Map<string, string> = new Map();
// 재킷 파일명 → DX NET 재킷 주소(국제판 곡은 maimaidx-eng.com, 내수판 전용 곡은 maimaidx.jp)
let jacketUrlMap: Map<string, string> = new Map();
// 곡 → 버전 코드 (예: CiRCLE 26000, CiRCLE PLUS 26500). 내수판 기준, 내수판에 없으면 국제판. 신곡/구곡 판정용.
let versionMap: Map<string, number> = new Map();
// 곡 → 국제판 버전 코드. 국제판은 곡이 들어온 버전이 내수판과 다를 수 있어 따로 둔다.
let intlVersionMap: Map<string, number> = new Map();
// 지역별 "곡|ST"·"곡|DX" → 버전 코드. 한 보면이 나중에 추가된 곡은 ST·DX 의 버전과 수록 지역이 다르다
// (예: 物凄い勢いでけーねが物凄いうた 는 ST 가 양쪽, DX 는 내수판 MAGiCAL 에만). versionMap 은 이른 쪽.
let jpKindVersionMap: Map<string, number> = new Map();
let intlKindVersionMap: Map<string, number> = new Map();
// 국제판(intl="1") 수록 곡 제목 집합. 곡추천에서 미수록 곡을 제외하는 데 사용.
let intlTitles: Set<string> = new Set();
// 내수판(JP) 수록 곡 제목 집합(music-ex.json 전곡). 지역 전용 곡 판정에 사용.
let jpTitles: Set<string> = new Set();
// 곡 → 장르(catcode)
let genreMap: Map<string, string> = new Map();
// "제목|ST/DX|난이도" → maishift 보면 번호, 제목 → 아티스트(곡 상세 카드용)
let trackIdMap: Map<string, number> = new Map();
// 버전 폴더 안 순서(maishift 곡 창의 "11 / 79"). 지역마다 다르다. "제목|ST/DX" → [순서(0부터), 세대 번호]
type FolderData = { orders: [string, [number, number]][]; latest: number };
let folderIntl: FolderData | null = null;
let folderJp: FolderData | null = null;
let artistMap: Map<string, string> = new Map();

// maimai 장르 목록 (랜덤 명령어 장르 선택지)
export const GENRES = [
  "POPS＆アニメ",
  "niconico＆ボーカロイド",
  "東方Project",
  "ゲーム＆バラエティ",
  "maimai",
  "オンゲキ＆CHUNITHM",
  "宴会場",
];

// 레이팅 "신곡" 버전 범위. version은 JP 버전이라 국제판과 반 버전 어긋날 수 있어
// (예: Galaxy Blaster는 JP CiRCLE PLUS(26500)지만 국제판은 CiRCLE), CiRCLE PLUS까지
// 넓게 포함해 국제판/JP 어느 쪽 수록이든 신곡으로 잡히게 한다.
// 버전 코드는 시작값 + 세부 웨이브(예: PRiSM PLUS = 25500~25599)이므로 범위로 판정.
// (시작 코드: 25500 PRiSM PLUS, 26000 CiRCLE, 26500 CiRCLE PLUS, 27000 다음 세대 ...)
const NEW_SONG_MIN_VERSION = 26000; // 국제판 신곡 하한: CiRCLE 시작 (국제판도 CiRCLE로 업데이트, PRiSM PLUS는 이제 구곡)
const NEW_SONG_MAX_VERSION = 27000; // 국제판 신곡 상한(미포함) = CiRCLE PLUS까지 신곡
// 내수판은 2026-09-17 MAGiCAL(27000) 업데이트로 CiRCLE PLUS(26500) ~ MAGiCAL 이 신곡이다.
const NEW_SONG_MIN_VERSION_JP = 26500;
const NEW_SONG_MAX_VERSION_JP = 27500; // MAGiCAL PLUS(27500) 미포함

// 레이팅 "신곡" 범위는 버전 업데이트마다 통째로 옮겨간다. 과거 레이팅표를 역산할 때
// 현재 범위로 신곡/구곡을 나누면 그 시점과 어긋나므로, 적용 시작일과 함께 이력을 둔다.
// from 은 그 범위가 적용되기 시작한 play-day(포함). 최신순으로 정렬해 첫 일치를 쓴다.
// maishift 버전 목록(windowsFromVersions)을 받으면 그걸 쓰고, 이 표는 받기 전에만 쓴다.
// label 은 그 날 나온 버전 이름(프로필 히스토리 그래프의 업데이트 표시에 쓴다).
// 국제판과 내수판은 업데이트 일정이 달라 이력을 따로 둔다.
type NewSongWindowEntry = { from: string; min: number; max: number; label?: string };
const NEW_SONG_WINDOWS: NewSongWindowEntry[] = [
  // 2026-07-23 CiRCLE PLUS 업데이트 → CiRCLE ~ CiRCLE PLUS
  { from: "2026-07-23", min: NEW_SONG_MIN_VERSION, max: NEW_SONG_MAX_VERSION, label: "CiRCLE PLUS" },
  // 그 이전 → PRiSM PLUS ~ CiRCLE (CiRCLE PLUS 26500 미포함)
  { from: "", min: 25500, max: 26500 },
];
const NEW_SONG_WINDOWS_JP: NewSongWindowEntry[] = [
  // 2026-09-17 MAGiCAL 업데이트 → CiRCLE PLUS ~ MAGiCAL
  { from: "2026-09-17", min: NEW_SONG_MIN_VERSION_JP, max: NEW_SONG_MAX_VERSION_JP, label: "MAGiCAL" },
  // 그 이전(내수판 CiRCLE PLUS 시기) → CiRCLE ~ CiRCLE PLUS. 내수판 CiRCLE PLUS 출시일은
  // otoge-db 에 없어(release 000000) 그보다 앞선 범위는 두지 않는다.
  { from: "", min: 26000, max: 27000 },
];
// 위 표는 maishift 버전 목록을 아직 못 받았을 때만 쓴다. 받았으면 지역별 버전 출시 시각으로 계산한다:
// 버전 i 가 나온 날부터 신곡 = 버전 i-1 ~ i (레이팅 신곡은 현재 버전과 바로 이전 버전).
// isNewSong 이 기록마다 불리므로 버전 목록을 받을 때 한 번만 계산해 둔다.
let windowsIntl: NewSongWindowEntry[] = [];
let windowsJp: NewSongWindowEntry[] = [];

/** 출시 시각(ms) → play-day(한국 시간 오전 4시 기준 날짜). achievements.ts 의 koreaPlayDayKey 와 같은 계산. */
function playDayOf(ms: number): string {
  return new Date(ms + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function windowsFromVersions(list: RegionVersion[]): NewSongWindowEntry[] {
  const out: NewSongWindowEntry[] = list
    .filter((v) => v.index >= 1)
    .map((v) => ({ from: playDayOf(v.releasedAt), min: versionCode(v.index - 1), max: versionCode(v.index + 1), label: msVersionName(v.index) }))
    .sort((a, b) => b.from.localeCompare(a.from));
  // 가장 오래된 버전 이전 날짜도 그 범위로(표의 from: "" 와 같은 역할).
  if (out.length) out.push({ ...out[out.length - 1], from: "", label: undefined });
  return out;
}

function windowsFor(server: MaimaiServer): NewSongWindowEntry[] {
  const computed = server === "jp" ? windowsJp : windowsIntl;
  if (computed.length) return computed;
  return server === "jp" ? NEW_SONG_WINDOWS_JP : NEW_SONG_WINDOWS;
}

let regionVersionsIntl: RegionVersion[] = [];
let regionVersionsJp: RegionVersion[] = [];
function setRegionVersions(intl: RegionVersion[], jp: RegionVersion[]): void {
  regionVersionsIntl = intl;
  regionVersionsJp = jp;
  setMaishiftVersionNames([...intl, ...jp]);
  windowsIntl = windowsFromVersions(intl);
  windowsJp = windowsFromVersions(jp);
}

/** 그 지역 버전 목록(세대 번호·이름·출시 시각 ms, 오래된 순). 곡 목록을 받기 전이면 빈 배열. */
export function getRegionVersions(server: MaimaiServer): RegionVersion[] {
  return server === "jp" ? regionVersionsJp : regionVersionsIntl;
}

export interface NewSongWindow { min: number; max: number }

/** 서버별 버전 업데이트 날짜(play-day)와 버전 이름. fromDay~toDay(포함) 안의 것만, 오래된 순. */
export function versionUpdatesBetween(fromDay: string, toDay: string, server: MaimaiServer = "intl"): { day: string; label: string }[] {
  return windowsFor(server)
    .filter((w) => w.from && w.label && w.from >= fromDay && w.from <= toDay)
    .map((w) => ({ day: w.from, label: w.label! }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

// playDay(YYYY-MM-DD)가 없으면 오늘 범위(아직 출시 전인 버전은 빼고). 이력보다 오래된 날짜는 가장 오래된 범위를 쓴다.
export function newSongWindowAt(playDay?: string, server: MaimaiServer = "intl"): NewSongWindow {
  const list = windowsFor(server);
  const day = playDay ?? playDayOf(Date.now());
  const hit = list.find((w) => day >= w.from) ?? list[list.length - 1];
  return { min: hit.min, max: hit.max };
}

const FORTUNE_MIN_CONSTANT = 14.6;
const FORTUNE_MAX_CONSTANT = 15.1;
export interface DailyFortuneChart {
  kind: "ST" | "DX";
  diff: string;
  level: number;
}

export interface DailyFortuneSong {
  title: string;
  jacketFile: string | null;
  charts: DailyFortuneChart[];
}

let dailyFortuneSongs: DailyFortuneSong[] = [];

// 이미 존재하는 키는 덮어쓰지 않음 → 먼저 채운 쪽(국제판)이 우선
function ingest(data: CatalogSong[]): void {
  for (const song of data) {
    const file = song.jacketUrl.split("/").pop() ?? "";
    if (file && !jacketMap.has(song.title)) jacketMap.set(song.title, file);
    if (file && !jacketUrlMap.has(file)) jacketUrlMap.set(file, song.jacketUrl);
    if (song.genre && !genreMap.has(song.title)) genreMap.set(song.title, song.genre);
    if (song.artist && !artistMap.has(song.title)) artistMap.set(song.title, song.artist);
    for (const c of song.charts) {
      const key = `${song.title}|${c.kind}|${c.diff}`;
      if (!constantMap.has(key)) constantMap.set(key, c.constant);
      if (c.trackId !== undefined && !trackIdMap.has(key)) trackIdMap.set(key, c.trackId);
    }
  }
}

function toConstantMap(data: CatalogSong[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const song of data) for (const c of song.charts) m.set(`${song.title}|${c.kind}|${c.diff}`, c.constant);
  return m;
}

function diffRank(diff: string): number {
  switch (diff) {
    case "Re:MASTER": return 4;
    case "MASTER": return 3;
    case "EXPERT": return 2;
    case "ADVANCED": return 1;
    default: return 0;
  }
}

function rebuildDailyFortuneSongs(): void {
  const grouped = new Map<string, DailyFortuneSong>();
  for (const [key, level] of constantMap.entries()) {
    if (level < FORTUNE_MIN_CONSTANT || level >= FORTUNE_MAX_CONSTANT) continue;
    const [title, kindRaw, diff] = key.split("|");
    if (!title || !kindRaw || !diff) continue;
    const kind = kindRaw === "DX" ? "DX" : "ST";
    const existing = grouped.get(title) ?? {
      title,
      jacketFile: jacketMap.get(title) ?? null,
      charts: [],
    };
    existing.charts.push({ kind, diff, level });
    grouped.set(title, existing);
  }

  dailyFortuneSongs = Array.from(grouped.values())
    .map((song) => ({
      ...song,
      charts: song.charts
        .slice()
        .sort((a, b) => {
          if (b.level !== a.level) return b.level - a.level;
          if (a.kind !== b.kind) return a.kind === "DX" ? -1 : 1;
          return diffRank(b.diff) - diffRank(a.diff);
        }),
    }))
    .sort((a, b) => a.title.localeCompare(b.title, "en"));
}

interface ConstantsCache {
  /** "maishift-api" 가 아니면(otoge-db·서버 함수 시절 캐시) 새로 받는다. */
  source?: string;
  constants: [string, number][];
  jackets: [string, string][];
  jacketUrls?: [string, string][];
  versions?: [string, number][];
  intlVersions?: [string, number][];
  jpKindVersions?: [string, number][];
  intlKindVersions?: [string, number][];
  intl?: string[];
  genres?: [string, string][];
  jpConstants?: [string, number][];
  jpTitles?: string[];
  koTitles?: [string, string][];
  trackIds?: [string, number][];
  artists?: [string, string][];
  folderIntl?: FolderData;
  folderJp?: FolderData;
  versionsIntl?: RegionVersion[];
  versionsJp?: RegionVersion[];
}

// 캐시 복원. maishift 에서 받은 캐시가 아니면 fresh=false 반환.
function applyCache(data: string): { fresh: boolean } {
  const parsed = JSON.parse(data) as ConstantsCache;
  constantMap = new Map(parsed.constants);
  jacketMap = new Map(parsed.jackets);
  jacketUrlMap = new Map(parsed.jacketUrls ?? []);
  versionMap = new Map(parsed.versions ?? []);
  intlVersionMap = new Map(parsed.intlVersions ?? []);
  jpKindVersionMap = new Map(parsed.jpKindVersions ?? []);
  intlKindVersionMap = new Map(parsed.intlKindVersions ?? []);
  intlTitles = new Set(parsed.intl ?? []);
  genreMap = new Map(parsed.genres ?? []);
  jpConstantMap = new Map(parsed.jpConstants ?? []);
  jpTitles = new Set(parsed.jpTitles ?? []);
  setExternalTranslations(new Map(parsed.koTitles ?? []));
  trackIdMap = new Map(parsed.trackIds ?? []);
  artistMap = new Map(parsed.artists ?? []);
  setFolders(parsed.folderIntl ?? null, parsed.folderJp ?? null);
  setRegionVersions(parsed.versionsIntl ?? [], parsed.versionsJp ?? []);
  rebuildDailyFortuneSongs();
  // 보면 번호·버전 폴더 순서·버전 목록·보면 종류별 버전이 없는 옛 캐시면 새로 받는다.
  return { fresh: parsed.source === "maishift-api" && !!parsed.trackIds && !!parsed.folderIntl && !!parsed.versionsIntl?.length && !!parsed.jpKindVersions };
}

export async function loadConstants(): Promise<void> {
  const dbCache = await getConstantsCache();
  if (dbCache && Date.now() - dbCache.updatedAt < 24 * 60 * 60 * 1000) {
    try {
      if (applyCache(dbCache.data).fresh) {
        console.log(`[constants] DB 캐시 복원: 상수 ${constantMap.size}개, 자켓 ${jacketMap.size}개, version ${versionMap.size}개, 국제판 ${intlTitles.size}개`);
        return;
      }
      console.log("[constants] maishift 캐시가 아님 → 네트워크 재fetch");
    } catch (e) {
      console.error("[constants] DB 캐시 파싱 실패, 네트워크 fetch 시도:", e);
    }
  }

  try {
    const intlRes = await fetchCatalog("intl");
    const jpRes = await fetchCatalog("jp");
    const intl = intlRes.songs, jp = jpRes.songs;
    const fIntl = folderDataOf(intlRes.songs, intlRes.latestVersion), fJp = folderDataOf(jpRes.songs, jpRes.latestVersion);
    setFolders(fIntl, fJp);
    setRegionVersions(intlRes.versions, jpRes.versions);
    constantMap = new Map();
    jacketMap = new Map();
    jacketUrlMap = new Map();
    genreMap = new Map();
    trackIdMap = new Map();
    artistMap = new Map();
    intlTitles = new Set(intl.map((s) => s.title));
    jpTitles = new Set(jp.map((s) => s.title));
    ingest(intl);
    const intlCount = constantMap.size;
    ingest(jp); // 국제판에 없는 곡·보면 보충
    jpConstantMap = toConstantMap(jp); // JP 상수 맵 (JP 프로필 레이팅 계산용)
    intlVersionMap = new Map(intl.map((s) => [s.title, s.version]));
    versionMap = new Map([...intlVersionMap, ...jp.map((s) => [s.title, s.version] as [string, number])]);
    intlKindVersionMap = kindVersionsOf(intl);
    jpKindVersionMap = kindVersionsOf(jp);
    const koTitles = new Map<string, string>();
    for (const s of [...intl, ...jp]) if (s.korean && !koTitles.has(s.title)) koTitles.set(s.title, s.korean);
    setExternalTranslations(koTitles);

    console.log(`[constants] maishift 국제판 ${intl.length}곡 (상수 ${intlCount}개) + JP 보충 ${constantMap.size - intlCount}개, JP상수 ${jpConstantMap.size}개, 자켓 ${jacketMap.size}개, 번역 ${koTitles.size}개`);
    await saveConstantsCache(JSON.stringify({
      source: "maishift-api",
      constants: Array.from(constantMap.entries()),
      jackets: Array.from(jacketMap.entries()),
      jacketUrls: Array.from(jacketUrlMap.entries()),
      versions: Array.from(versionMap.entries()),
      intlVersions: Array.from(intlVersionMap.entries()),
      jpKindVersions: Array.from(jpKindVersionMap.entries()),
      intlKindVersions: Array.from(intlKindVersionMap.entries()),
      intl: Array.from(intlTitles),
      genres: Array.from(genreMap.entries()),
      jpConstants: Array.from(jpConstantMap.entries()),
      jpTitles: Array.from(jpTitles),
      koTitles: Array.from(koTitles.entries()),
      trackIds: Array.from(trackIdMap.entries()),
      artists: Array.from(artistMap.entries()),
      folderIntl: fIntl,
      folderJp: fJp,
      versionsIntl: intlRes.versions,
      versionsJp: jpRes.versions,
    } satisfies ConstantsCache));
    rebuildDailyFortuneSongs();
  } catch (e) {
    console.error("[constants] 로드 실패:", e);
    if (dbCache) {
      try {
        applyCache(dbCache.data);
        console.log(`[constants] 네트워크 실패, 오래된 DB 캐시 사용: 상수 ${constantMap.size}개`);
      } catch (e2) {
        console.error("[constants] DB 캐시 파싱도 실패:", e2);
      }
    }
  }
}

// 재킷 이미지 파일명 (예: "c7cfd8a91e0436ac.png")
export function getJacketFile(title: string): string | null {
  return jacketMap.get(title) ?? null;
}

/** 곡의 재킷 원래 주소(maishift 가 준 DX NET 주소). 없으면 null. */
export function getJacketUrl(title: string): string | null {
  const file = jacketMap.get(title);
  return file ? jacketUrlMap.get(file) ?? null : null;
}

// 재킷 파일명 → 재킷 이미지 주소. 국제판 곡은 DX NET(공개 이미지), 카탈로그에 없으면 국제판 경로로 짐작한다.
// 내수판 전용 곡의 maimaidx.jp 는 중간 인증서를 보내지 않아 Node fetch 가 실패하므로(브라우저는 됨)
// 같은 파일명을 두는 otoge-db 이미지 미러를 쓴다. 이미지 파일만 받고 곡 데이터는 받지 않는다.
export function jacketFileUrl(file: string): string {
  const url = jacketUrlMap.get(file);
  if (url && new URL(url).host === "maimaidx.jp") return `https://otoge-db.net/maimai/jacket/${file}`;
  return url ?? `https://maimaidx-eng.com/maimai-mobile/img/Music/${file}`;
}

// 재킷 파일명 → 곡명. 카탈로그 재킷이 DX NET 파일명이라, 재킷만 주어지는 곳(서클 과제곡 예고)에 쓴다.
let jacketReverse: { src: Map<string, string>; size: number; map: Map<string, string> } | null = null;
export function getTitleByJacket(fileOrUrl: string): string | null {
  const file = fileOrUrl.split("?")[0].split("/").pop() ?? "";
  if (!file) return null;
  // 카탈로그를 다시 읽으면 jacketMap 이 바뀌거나 채워지므로 그때 다시 만든다.
  if (!jacketReverse || jacketReverse.src !== jacketMap || jacketReverse.size !== jacketMap.size) {
    const map = new Map<string, string>();
    for (const [title, f] of jacketMap) if (!map.has(f)) map.set(f, title);
    jacketReverse = { src: jacketMap, size: jacketMap.size, map };
  }
  return jacketReverse.map.get(file) ?? null;
}

// 곡 version 세대 코드 (없으면 null)
// 곡 버전은 서버마다 다를 수 있다(예: Galaxy Blaster 는 국제판 CiRCLE, 내수판 CiRCLE PLUS).
// versionMap 은 국제판 위에 내수판을 덮어쓴 맵이라 내수판 기준이고, 국제판은 intlVersionMap 을 먼저 본다.
// musicKind(ST/DX)를 주면 그 보면의 버전을 먼저 본다(예: 居並ぶ穀物… DX 는 Splash, ST 는 MAGiCAL).
function versionOf(title: string, server: MaimaiServer, musicKind?: string): number | undefined {
  if (musicKind === "ST" || musicKind === "DX") {
    const key = `${title}|${musicKind}`;
    const v = server === "intl"
      ? intlKindVersionMap.get(key) ?? jpKindVersionMap.get(key)
      : jpKindVersionMap.get(key) ?? intlKindVersionMap.get(key);
    if (v !== undefined) return v;
  }
  return (server === "intl" ? intlVersionMap.get(title) : undefined) ?? versionMap.get(title);
}

/** 보면 종류별 수록 정보가 있는 musicKind 면 "ST"/"DX", 아니면 null(제목 기준으로 판정). */
function knownKind(title: string, musicKind?: string): "ST" | "DX" | null {
  if (musicKind !== "ST" && musicKind !== "DX") return null;
  const key = `${title}|${musicKind}`;
  return intlKindVersionMap.has(key) || jpKindVersionMap.has(key) ? musicKind : null;
}

function kindVersionsOf(songs: CatalogSong[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of songs) for (const [kind, v] of Object.entries(s.kindVersions)) if (v !== undefined) map.set(`${s.title}|${kind}`, v);
  return map;
}

export function getSongVersion(title: string, server: MaimaiServer = "intl", musicKind?: string): number | null {
  return versionOf(title, server, musicKind) ?? null;
}

// 레이팅 신곡(현재+이전 버전) 여부. version 데이터가 없으면 구곡으로 취급.
// 서버별 세대 진행이 달라(내수판=MAGiCAL, 국제판=CiRCLE PLUS) 신곡 범위도 서버별 이력을 쓴다.
// playDay 를 주면 그 시점의 신곡 범위로 판정한다(과거 레이팅표 역산·히스토리 추정용).
export function isNewSong(title: string, server: MaimaiServer = "intl", playDay?: string, musicKind?: string): boolean {
  const v = versionOf(title, server, musicKind);
  if (v === undefined) return false;
  const w = newSongWindowAt(playDay, server);
  return v >= w.min && v < w.max;
}

// 버전 세대 [세대 시작코드, PLUS 시작코드, 세대명]. PLUS 여부는 별도로 판정.
// (선택지 25개 제한 때문에 버전 옵션은 세대만, PLUS는 별도 옵션으로 분리)
const VERSION_GENERATIONS: [number, number, string][] = [
  [10000, 11000, "maimai"],
  [12000, 13000, "GreeN"],
  [14000, 15000, "ORANGE"],
  [16000, 17000, "PiNK"],
  [18000, 18500, "MURASAKi"],
  [19000, 19500, "MiLK"],
  [19900, 99999, "FiNALE"], // PLUS 없음
  [20000, 20500, "でらっくす"],
  [21000, 21500, "Splash"],
  [22000, 22500, "UNiVERSE"],
  [23000, 23500, "FESTiVAL"],
  [24000, 24500, "BUDDiES"],
  [25000, 25500, "PRiSM"],
  [26000, 26500, "CiRCLE"],
  [27000, 27500, "MAGiCAL"],
];
export const VERSION_NAMES = VERSION_GENERATIONS.map(([, , n]) => n);

function findGeneration(v: number): [number, number, string] | null {
  let found: [number, number, string] | null = null;
  for (const g of VERSION_GENERATIONS) {
    if (v >= g[0]) found = g;
    else break;
  }
  return found;
}

// 곡의 수록 버전(세대명). version 데이터 없으면 null.
export function getSongVersionName(title: string, server: MaimaiServer = "intl", musicKind?: string): string | null {
  const v = versionOf(title, server, musicKind);
  if (v === undefined) return null;
  return findGeneration(v)?.[2] ?? null;
}

// 곡이 해당 세대의 PLUS 버전인지 여부.
export function isSongPlus(title: string, server: MaimaiServer = "intl", musicKind?: string): boolean {
  const v = versionOf(title, server, musicKind);
  if (v === undefined) return false;
  const g = findGeneration(v);
  return g ? v >= g[1] : false;
}

// 국제판 수록 여부. 데이터가 없으면(구버전 캐시) 제외하지 않도록 true 반환.
// musicKind(ST/DX)를 주면 그 보면이 국제판에 있는지 본다.
export function isIntlAvailable(title: string, musicKind?: string): boolean {
  if (intlTitles.size === 0) return true;
  const kind = knownKind(title, musicKind);
  return kind ? intlKindVersionMap.has(`${title}|${kind}`) : intlTitles.has(title);
}

// 내수판 수록 여부. 데이터 없으면 true 반환(오탐 방지).
export function isJpAvailable(title: string): boolean {
  return jpTitles.size === 0 || jpTitles.has(title);
}

// 지역 전용 곡 판정: "jp"(내수판 전용) / "intl"(국제판 전용) / null(양쪽 or 판정불가).
// 두 집합 중 하나라도 비어있으면(구버전 캐시) null 반환해 오탐 방지.
// musicKind(ST/DX)를 주면 그 보면 기준이다(곡은 양쪽에 있어도 한 보면만 한쪽에 있을 수 있다).
export function getRegionExclusive(title: string, musicKind?: string): "jp" | "intl" | null {
  if (intlTitles.size === 0 || jpTitles.size === 0) return null;
  const kind = knownKind(title, musicKind);
  const inIntl = kind ? intlKindVersionMap.has(`${title}|${kind}`) : intlTitles.has(title);
  const inJp = kind ? jpKindVersionMap.has(`${title}|${kind}`) : jpTitles.has(title);
  if (inIntl && !inJp) return "intl";
  if (inJp && !inIntl) return "jp";
  return null;
}

// 곡 장르(catcode). 없으면 null.
function folderDataOf(songs: CatalogSong[], latest: number): FolderData {
  const orders: [string, [number, number]][] = [];
  for (const s of songs) for (const f of s.folders ?? []) orders.push([`${s.title}|${f.kind}`, [f.order, f.version]]);
  return { orders, latest };
}

interface FolderIndex { order: Map<string, [number, number]>; count: Map<number, number>; latest: number }
let folderIndexIntl: FolderIndex | null = null;
let folderIndexJp: FolderIndex | null = null;
function indexOf(d: FolderData | null): FolderIndex | null {
  if (!d) return null;
  const count = new Map<number, number>();
  for (const [, [, v]] of d.orders) count.set(v, (count.get(v) ?? 0) + 1);
  return { order: new Map(d.orders), count, latest: d.latest };
}
function setFolders(intl: FolderData | null, jp: FolderData | null): void {
  folderIntl = intl; folderJp = jp;
  folderIndexIntl = indexOf(intl); folderIndexJp = indexOf(jp);
}

/**
 * 버전 폴더 안 위치("11 / 79" — 게임에서 버전 정렬로 곡을 찾을 때). 지역 곡 목록 기준.
 * tentative: 그 지역 최신 세대 곡이라 새 곡이 추가되면 순서가 바뀔 수 있음(maishift 는 "?" 를 붙인다).
 */
export function getVersionPosition(title: string, musicKind: string, server: MaimaiServer = "intl"): { order: number; total: number; tentative: boolean } | null {
  const idx = server === "jp" ? folderIndexJp : folderIndexIntl;
  const hit = idx?.order.get(`${title}|${musicKind === "DX" ? "DX" : "ST"}`);
  if (!idx || !hit) return null;
  const [order, version] = hit;
  return { order: order + 1, total: idx.count.get(version) ?? 0, tentative: version >= idx.latest };
}

/** 그 지역 최신 세대 번호(maishift 곡 목록 regionLatestVersion). 모르면 null. */
export function regionLatestVersion(server: MaimaiServer = "intl"): number | null {
  return (server === "jp" ? folderIndexJp : folderIndexIntl)?.latest ?? null;
}

/** maishift 보면 번호. 곡 상세(달성률 변화·상수 변동·분포) 조회에 쓴다. */
export function getTrackId(title: string, musicKind: string, diff: string): number | null {
  return trackIdMap.get(`${title}|${musicKind === "DX" ? "DX" : "ST"}|${diff}`) ?? null;
}

export function getSongArtist(title: string): string | null {
  return artistMap.get(title) ?? null;
}

export function getSongGenre(title: string): string | null {
  return genreMap.get(title) ?? null;
}

export interface AliasSongInfo {
  title: string;
  version: number;
  versionName: string;
  // "jp": 내수판 전용(국제판 미수록, 별명 관리 페이지에서 신곡처럼 표시) / null: 그 외
  region: "jp" | "intl" | null;
}

// 연회장(宴) 채보 장르. 레이팅 대상이 아니고 별명/목표 대상도 아니라 곡 목록에서 제외한다.
// 제목이 "[협]", "[宴]" 처럼 대괄호로 시작하지만, 대괄호로 시작하는 일반 곡(예: "[X]")도
// 있어서 제목 패턴이 아니라 장르(catcode)로 판정해야 한다.
const UTAGE_GENRE = "宴会場";

export function isUtageSong(title: string): boolean {
  return genreMap.get(title) === UTAGE_GENRE;
}

// 별명 관리 페이지용 전체 곡 목록. intl/jp 수록곡 합집합을 title 기준으로 반환.
export function getAllSongTitles(): AliasSongInfo[] {
  const titles = new Set<string>([...intlTitles, ...jpTitles, ...versionMap.keys()]);
  return Array.from(titles)
    .filter((title) => !isUtageSong(title))
    .map((title) => {
      const version = versionOf(title, "intl") ?? 0;
      return {
        title,
        version,
        versionName: getSongVersionName(title) ?? "",
        region: getRegionExclusive(title),
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title, "en"));
}

export interface ChartInfo {
  title: string;
  kind: "ST" | "DX";
  diff: string;
  level: number;
}

// 상수가 max 이하인 모든 채보 목록 (곡추천 후보 풀)
export function getChartsUnderConstant(max: number): ChartInfo[] {
  const charts: ChartInfo[] = [];
  for (const [key, level] of constantMap.entries()) {
    if (level > max) continue;
    const [title, kindRaw, diff] = key.split("|");
    if (!title || !kindRaw || !diff) continue;
    charts.push({ title, kind: kindRaw === "DX" ? "DX" : "ST", diff, level });
  }
  return charts;
}

// 상수가 [min, max] 범위인 채보 목록
export function getChartsInConstantRange(min: number, max: number): ChartInfo[] {
  const charts: ChartInfo[] = [];
  for (const [key, level] of constantMap.entries()) {
    if (level < min || level > max) continue;
    const [title, kindRaw, diff] = key.split("|");
    if (!title || !kindRaw || !diff) continue;
    charts.push({ title, kind: kindRaw === "DX" ? "DX" : "ST", diff, level });
  }
  return charts;
}

// 검색용: 카탈로그의 고유 (곡, 채보종류) 목록. 동기화 여부·프로필 지역과
// 무관하게(국제판 프로필에서 JP 전용곡까지) /검색 이 클리어기록에 이 목록을 덧대 곡을
// 노출하기 위한 것. constantMap 은 intl+JP 를 합쳐 담으므로 양쪽 곡이 모두 나온다.
export function listCatalogSongKinds(): { title: string; musicKind: "ST" | "DX" }[] {
  const seen = new Set<string>();
  const out: { title: string; musicKind: "ST" | "DX" }[] = [];
  for (const key of constantMap.keys()) {
    const [title, kindRaw] = key.split("|");
    if (!title || !kindRaw || isUtageSong(title)) continue;
    const musicKind = kindRaw === "DX" ? "DX" : "ST";
    const k = musicKind + "|" + title;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ title, musicKind });
  }
  return out;
}

// 상수 → 표기 레벨 (X.0~X.5 → "X", X.6~X.9 → "X+")
export function constantToDisplayLevel(c: number): string {
  const floor = Math.floor(c);
  const tenths = Math.round((c - floor) * 10);
  return tenths >= 6 ? `${floor}+` : `${floor}`;
}

function seoulDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value ?? "0000";
  const month = parts.find((p) => p.type === "month")?.value ?? "00";
  const day = parts.find((p) => p.type === "day")?.value ?? "00";
  return `${year}-${month}-${day}`;
}

function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (const ch of input) {
    hash ^= ch.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function getDailyFortuneSong(userId: string, date: Date = new Date()): DailyFortuneSong | null {
  if (dailyFortuneSongs.length === 0) return null;
  const index = hashString(`${userId}|${seoulDateKey(date)}`) % dailyFortuneSongs.length;
  return dailyFortuneSongs[index] ?? null;
}

// exact=true면 DX↔ST 상호 폴백을 하지 않는다(해당 채보의 실제 존재 여부 확인용).
// server="jp"면 JP 상수 우선, 없으면 국제판 상수로 폴백(같은 kind 내에서).
export function getConstant(title: string, musicKind: string, diff: string, server: MaimaiServer = "intl", exact = false): number | null {
  const kind = musicKind === "DX" ? "DX" : "ST";
  const altKind = kind === "DX" ? "ST" : "DX";
  const lookup = (k: string): number | undefined =>
    (server === "jp" ? jpConstantMap.get(`${title}|${k}|${diff}`) : undefined)
      ?? constantMap.get(`${title}|${k}|${diff}`);
  const val = lookup(kind);
  if (val !== undefined) return val;
  if (exact) return null;
  // DX/ST 구분 없이 어느 쪽이든 있으면 fallback
  return lookup(altKind) ?? null;
}

// 표시용 레벨 문자열("14+")을 숫자 근사값으로 변환 (상수 없을 때 fallback)
export function levelToNumber(level: string): number {
  const base = parseInt(level.replace(/[^0-9]/g, "")) || 0;
  return level.includes("+") ? base + 0.6 : base;
}

// 달성률 계수 (achInt = 달성률 × 10000, 예: 100.5000% → 1005000)
function maimaiCoefficient(achInt: number): number {
  if (achInt >= 1005000) return 22.4; // SSS+
  if (achInt >= 1000000) return 21.6; // SSS
  if (achInt >= 995000)  return 21.1; // SS+
  if (achInt >= 990000)  return 20.8; // SS
  if (achInt >= 980000)  return 20.3; // S+
  if (achInt >= 970000)  return 20.0; // S
  if (achInt >= 940000)  return 16.8; // AAA
  if (achInt >= 900000)  return 15.2; // AA
  if (achInt >= 800000)  return 13.6; // A
  if (achInt >= 750000)  return 12.0; // BBB
  if (achInt >= 700000)  return 11.2; // BB
  if (achInt >= 600000)  return  9.6; // B
  if (achInt >= 500000)  return  8.0; // C
  if (achInt >= 400000)  return  6.4; // D
  if (achInt >= 300000)  return  4.8;
  if (achInt >= 200000)  return  3.2;
  if (achInt >= 100000)  return  1.6;
  return 0.0;
}

// fc 마크가 AP/AP+면 곡별 레이팅에 +1 보너스 (maimai DX 공식)
export function calcSongRating(achievementVal: number, level: number, fc?: string): number {
  const achInt = Math.round(achievementVal * 10000);
  const coeff = maimaiCoefficient(achInt);
  if (coeff === 0) return 0;
  const capped = Math.min(achInt, 1005000);
  const apBonus = fc === "AP" || fc === "AP+" ? 1 : 0;
  return Math.floor((level * capped / 1000000) * coeff) + apBonus;
}

// 내수판(JP)은 레이팅 대상 페이지 수집에 유료(베이직) 코스가 필요하므로,
// 전체 기록(clearRecords)에서 레이팅 대상을 직접 추론한다.
// 신곡 15개 + 구곡 35개(각각 RS 내림차순). 표시부는 위치가 아니라 isNewSong으로
// 재분류하므로 두 그룹의 순서 자체에는 의존하지 않는다.
export function computeRatingTarget(clearRecords: PlayRecord[], server: MaimaiServer = "intl", playDay?: string): PlayRecord[] {
  const rated = clearRecords
    .filter((r) => r.achievementVal > 0)
    .map((r) => {
      const c = getConstant(r.title, r.musicKind, r.diff, server) ?? levelToNumber(r.level);
      return { rec: r, rs: calcSongRating(r.achievementVal, c, r.fc), isNew: isNewSong(r.title, server, playDay, r.musicKind) };
    });
  const byRs = (a: { rs: number }, b: { rs: number }) => b.rs - a.rs;
  const news = rated.filter((x) => x.isNew).sort(byRs).slice(0, 15).map((x) => x.rec);
  const olds = rated.filter((x) => !x.isNew).sort(byRs).slice(0, 35).map((x) => x.rec);
  return [...news, ...olds];
}
