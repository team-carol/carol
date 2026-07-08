import { getConstantsCache, saveConstantsCache } from "./db";
import type { PlayRecord, MaimaiServer } from "./scraper";

interface SongEntry {
  title: string;
  image_url?: string;
  version?: string;
  intl?: string; // "1" = 국제판 수록, "0" = 미수록
  catcode?: string; // 장르명 (예: "POPS＆アニメ")
  lev_bas_i?: string;
  lev_adv_i?: string;
  lev_exp_i?: string;
  lev_mas_i?: string;
  lev_remas_i?: string;
  dx_lev_bas_i?: string;
  dx_lev_adv_i?: string;
  dx_lev_exp_i?: string;
  dx_lev_mas_i?: string;
  dx_lev_remas_i?: string;
}

const DIFF_FIELDS: Record<string, [keyof SongEntry, keyof SongEntry]> = {
  BASIC:       ["lev_bas_i",   "dx_lev_bas_i"],
  ADVANCED:    ["lev_adv_i",   "dx_lev_adv_i"],
  EXPERT:      ["lev_exp_i",   "dx_lev_exp_i"],
  MASTER:      ["lev_mas_i",   "dx_lev_mas_i"],
  "Re:MASTER": ["lev_remas_i", "dx_lev_remas_i"],
};

// 국제판 기준 수록곡 (우선), 일본판은 국제판에 없는 곡 보충용
const INTL_URL = "https://otoge-db.net/maimai/data/music-ex-intl.json";
const JP_URL = "https://otoge-db.net/maimai/data/music-ex.json";

let constantMap: Map<string, number> = new Map();
// 내수판(JP) 상수 맵. otoge-db의 _i(내부 상수)는 국제판/JP 리밸런스로 값이 달라질 수 있어,
// JP 데이터(music-ex.json)의 상수를 별도로 보관해 JP 프로필 레이팅 계산에 사용한다.
let jpConstantMap: Map<string, number> = new Map();
let jacketMap: Map<string, string> = new Map();
// 곡 → otoge-db version 코드 (예: "26000" → 26000). 신곡/구곡 판정용.
let versionMap: Map<string, number> = new Map();
// 국제판(intl="1") 수록 곡 제목 집합. 곡추천에서 미수록 곡을 제외하는 데 사용.
let intlTitles: Set<string> = new Set();
// 내수판(JP) 수록 곡 제목 집합(music-ex.json 전곡). 지역 전용 곡 판정에 사용.
let jpTitles: Set<string> = new Set();
// 곡 → 장르(catcode)
let genreMap: Map<string, string> = new Map();

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
const NEW_SONG_MIN_VERSION = 25500; // 국제판 신곡 하한: PRiSM PLUS 시작 (포함, 국제판이 반 세대 뒤라 넓게 잡음)
const NEW_SONG_MIN_VERSION_JP = 26000; // 내수판 신곡 하한: CiRCLE 시작 (내수판 현재 = CiRCLE PLUS이므로 CiRCLE+CiRCLE PLUS만 신곡)
const NEW_SONG_MAX_VERSION = 27000; // 다음 세대 시작 (미포함) = CiRCLE PLUS까지 신곡

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
function ingest(data: SongEntry[]): void {
  for (const song of data) {
    if (song.image_url && !jacketMap.has(song.title)) jacketMap.set(song.title, song.image_url);
    if (song.version && !versionMap.has(song.title)) {
      const v = parseInt(song.version, 10);
      if (!isNaN(v)) versionMap.set(song.title, v);
    }
    if (song.catcode && !genreMap.has(song.title)) genreMap.set(song.title, song.catcode);
    for (const [diff, [stField, dxField]] of Object.entries(DIFF_FIELDS)) {
      const v = parseFloat((song[stField] as string | undefined) ?? "");
      const dv = parseFloat((song[dxField] as string | undefined) ?? "");
      const stKey = `${song.title}|ST|${diff}`;
      const dxKey = `${song.title}|DX|${diff}`;
      if (!isNaN(v) && v > 0 && !constantMap.has(stKey)) constantMap.set(stKey, v);
      if (!isNaN(dv) && dv > 0 && !constantMap.has(dxKey)) constantMap.set(dxKey, dv);
    }
  }
}

// JP 상수 맵 전용 수집 (music-ex.json의 _i 값을 권위 있게 채움)
function ingestJpConstants(data: SongEntry[]): void {
  for (const song of data) {
    for (const [diff, [stField, dxField]] of Object.entries(DIFF_FIELDS)) {
      const v = parseFloat((song[stField] as string | undefined) ?? "");
      const dv = parseFloat((song[dxField] as string | undefined) ?? "");
      if (!isNaN(v) && v > 0) jpConstantMap.set(`${song.title}|ST|${diff}`, v);
      if (!isNaN(dv) && dv > 0) jpConstantMap.set(`${song.title}|DX|${diff}`, dv);
    }
  }
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

async function fetchSongs(url: string): Promise<SongEntry[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json() as SongEntry[];
}

interface ConstantsCache {
  constants: [string, number][];
  jackets: [string, string][];
  versions?: [string, number][];
  intl?: string[];
  genres?: [string, string][];
  jpConstants?: [string, number][];
  jpTitles?: string[];
}

// 캐시 복원. version/intl/genre 데이터가 없는 구버전 캐시면 hasMeta=false 반환.
function applyCache(data: string): { hasMeta: boolean } {
  const parsed = JSON.parse(data) as ConstantsCache;
  constantMap = new Map(parsed.constants);
  jacketMap = new Map(parsed.jackets);
  const hasMeta = !!parsed.versions && !!parsed.intl && !!parsed.genres && !!parsed.jpConstants && !!parsed.jpTitles;
  versionMap = parsed.versions ? new Map(parsed.versions) : new Map();
  intlTitles = parsed.intl ? new Set(parsed.intl) : new Set();
  genreMap = parsed.genres ? new Map(parsed.genres) : new Map();
  jpConstantMap = parsed.jpConstants ? new Map(parsed.jpConstants) : new Map();
  jpTitles = parsed.jpTitles ? new Set(parsed.jpTitles) : new Set();
  rebuildDailyFortuneSongs();
  return { hasMeta };
}

export async function loadConstants(): Promise<void> {
  const dbCache = getConstantsCache();
  if (dbCache && Date.now() - dbCache.updatedAt < 24 * 60 * 60 * 1000) {
    try {
      if (applyCache(dbCache.data).hasMeta) {
        console.log(`[constants] DB 캐시 복원: 상수 ${constantMap.size}개, 자켓 ${jacketMap.size}개, version ${versionMap.size}개, 국제판 ${intlTitles.size}개`);
        return;
      }
      console.log("[constants] 캐시에 version/intl 없음 → 네트워크 재fetch");
    } catch (e) {
      console.error("[constants] DB 캐시 파싱 실패, 네트워크 fetch 시도:", e);
    }
  }

  try {
    const intl = await fetchSongs(INTL_URL);
    constantMap = new Map();
    jpConstantMap = new Map();
    jacketMap = new Map();
    versionMap = new Map();
    genreMap = new Map();
    jpTitles = new Set();
    // 국제판 수록(intl="1") 곡만 집합에 담음 (JP 보충곡·미수록곡 제외)
    intlTitles = new Set(intl.filter((s) => s.intl === "1").map((s) => s.title));
    ingest(intl);
    const intlCount = constantMap.size;

    let jpAdded = 0;
    try {
      const jp = await fetchSongs(JP_URL);
      const before = constantMap.size;
      ingest(jp);
      ingestJpConstants(jp); // JP 상수 맵 (JP 프로필 레이팅 계산용)
      jpTitles = new Set(jp.map((s) => s.title)); // JP 수록 곡 집합 (지역 전용 판정용)
      jpAdded = constantMap.size - before;
    } catch (e) {
      console.error("[constants] JP 보충 로드 실패:", e);
    }

    console.log(`[constants] 국제판 ${intl.length}곡 (상수 ${intlCount}개) + JP 보충 ${jpAdded}개, JP상수 ${jpConstantMap.size}개, 자켓 ${jacketMap.size}개, version ${versionMap.size}개, 국제판수록 ${intlTitles.size}개`);
    saveConstantsCache(JSON.stringify({
      constants: Array.from(constantMap.entries()),
      jackets: Array.from(jacketMap.entries()),
      versions: Array.from(versionMap.entries()),
      intl: Array.from(intlTitles),
      genres: Array.from(genreMap.entries()),
      jpConstants: Array.from(jpConstantMap.entries()),
      jpTitles: Array.from(jpTitles),
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

// otoge-db 자켓 이미지 파일명 (예: "c7cfd8a91e0436ac.png")
export function getJacketFile(title: string): string | null {
  return jacketMap.get(title) ?? null;
}

// 곡 version 세대 코드 (없으면 null)
export function getSongVersion(title: string): number | null {
  return versionMap.get(title) ?? null;
}

// 레이팅 신곡(현재+이전 버전) 여부. version 데이터가 없으면 구곡으로 취급.
// 서버별 현재 세대가 달라 신곡 하한이 다르다(내수판=CiRCLE PLUS, 국제판=CiRCLE).
export function isNewSong(title: string, server: MaimaiServer = "intl"): boolean {
  const v = versionMap.get(title);
  if (v === undefined) return false;
  const min = server === "jp" ? NEW_SONG_MIN_VERSION_JP : NEW_SONG_MIN_VERSION;
  return v >= min && v < NEW_SONG_MAX_VERSION;
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
export function getSongVersionName(title: string): string | null {
  const v = versionMap.get(title);
  if (v === undefined) return null;
  return findGeneration(v)?.[2] ?? null;
}

// 곡이 해당 세대의 PLUS 버전인지 여부.
export function isSongPlus(title: string): boolean {
  const v = versionMap.get(title);
  if (v === undefined) return false;
  const g = findGeneration(v);
  return g ? v >= g[1] : false;
}

// 국제판 수록 여부. 데이터가 없으면(구버전 캐시) 제외하지 않도록 true 반환.
export function isIntlAvailable(title: string): boolean {
  return intlTitles.size === 0 || intlTitles.has(title);
}

// 내수판 수록 여부. 데이터 없으면 true 반환(오탐 방지).
export function isJpAvailable(title: string): boolean {
  return jpTitles.size === 0 || jpTitles.has(title);
}

// 지역 전용 곡 판정: "jp"(내수판 전용) / "intl"(국제판 전용) / null(양쪽 or 판정불가).
// 두 집합 중 하나라도 비어있으면(구버전 캐시) null 반환해 오탐 방지.
export function getRegionExclusive(title: string): "jp" | "intl" | null {
  if (intlTitles.size === 0 || jpTitles.size === 0) return null;
  const inIntl = intlTitles.has(title);
  const inJp = jpTitles.has(title);
  if (inIntl && !inJp) return "intl";
  if (inJp && !inIntl) return "jp";
  return null;
}

// 곡 장르(catcode). 없으면 null.
export function getSongGenre(title: string): string | null {
  return genreMap.get(title) ?? null;
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
export function computeRatingTarget(clearRecords: PlayRecord[], server: MaimaiServer = "intl"): PlayRecord[] {
  const rated = clearRecords
    .filter((r) => r.achievementVal > 0)
    .map((r) => {
      const c = getConstant(r.title, r.musicKind, r.diff, server) ?? levelToNumber(r.level);
      return { rec: r, rs: calcSongRating(r.achievementVal, c, r.fc), isNew: isNewSong(r.title, server) };
    });
  const byRs = (a: { rs: number }, b: { rs: number }) => b.rs - a.rs;
  const news = rated.filter((x) => x.isNew).sort(byRs).slice(0, 15).map((x) => x.rec);
  const olds = rated.filter((x) => !x.isNew).sort(byRs).slice(0, 35).map((x) => x.rec);
  return [...news, ...olds];
}
