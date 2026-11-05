/**
 * maishift 통계 API(레이팅 분포·레벨별 보면 분포·클리어 비율·플레이트 난이도·플레이트 보유)와 공개 플레이리스트.
 *
 * - 통계는 모든 사용자에게 같은 값이고 maishift 가 정해진 때에만 다시 계산하므로, 지역·조건별로 STATS_TTL_MS 동안 기억한다.
 *   지나면 가진 값을 먼저 쓰고 뒤에서 새로 받는다.
 * - 사용자 기록 요청이 한도에 막히지 않도록, 남은 한도가 (비용 + RESERVE_UNITS) 보다 적으면 새로 받지 않는다.
 *   통계가 없으면 명령은 통계 없이 답한다.
 * - 플레이어 기록이 아니지만 다른 maishift 데이터처럼 메모리에만 둔다(재시작하면 다시 받는다).
 */
import { callApi, costOf, estimatedBudget } from "./api";
import { MaishiftError } from "./serverFn";
import type { MaimaiServer } from "../scraper";

const STATS_TTL_MS = 12 * 60 * 60 * 1000;
const PLAYLIST_TTL_MS = 10 * 60 * 1000;
/** 실패한 요청은 이만큼 다시 보내지 않는다. */
const FAIL_TTL_MS = 5 * 60 * 1000;
/** 통계를 받은 뒤에도 사용자 기록 요청에 쓸 만큼 남겨 두는 한도. */
const RESERVE_UNITS = 40;
const MAX_SLOTS = 400;

type Query = Record<string, string | number>;
interface Slot { value: unknown; at: number; failedAt?: number; inflight?: Promise<unknown> }
const slots = new Map<string, Slot>();

const regionOf = (server: MaimaiServer) => (server === "jp" ? "jp" : "intl");

function affordable(path: string): boolean {
  const left = estimatedBudget();
  return left === null || left >= costOf(path) + RESERVE_UNITS;
}

function start<T>(key: string, path: string, query: Query): Promise<T | null> {
  let s = slots.get(key);
  if (!s) {
    s = { value: null, at: 0 };
    slots.set(key, s);
    while (slots.size > MAX_SLOTS) slots.delete(slots.keys().next().value!);
  }
  if (s.inflight) return s.inflight as Promise<T | null>;
  const slot = s;
  const p = callApi<T>(path, query)
    .then((v) => {
      slot.value = v;
      slot.at = Date.now();
      slot.failedAt = undefined;
      return v;
    })
    .catch((e) => {
      slot.failedAt = Date.now();
      if (!(e instanceof MaishiftError && e.kind === "rate_limited")) console.warn(`[maishift-stats] ${path} 실패:`, (e as Error).message);
      return (slot.value as T | null) ?? null;
    })
    .finally(() => { slot.inflight = undefined; });
  slot.inflight = p;
  return p;
}

/**
 * 기억한 값(오래됐으면 뒤에서 새로 받음) 또는 새로 받은 값. 한도가 모자라거나 실패하면 null.
 * allowFetch=false 면 기억한 값만 쓴다(한 번에 여러 개를 새로 받지 않게 할 때).
 */
async function cached<T>(path: string, query: Query, ttl = STATS_TTL_MS, allowFetch = true): Promise<T | null> {
  const key = `${path}?${Object.entries(query).map(([k, v]) => `${k}=${v}`).join("&")}`;
  const s = slots.get(key);
  const now = Date.now();
  if (s && s.value != null && now - s.at < ttl) return s.value as T;
  const canTry = allowFetch && !(s?.failedAt && now - s.failedAt < FAIL_TTL_MS) && affordable(path);
  if (s && s.value != null) {
    if (canTry) void start<T>(key, path, query);
    return s.value as T;
  }
  if (s?.inflight) return s.inflight as Promise<T | null>;
  return canTry ? start<T>(key, path, query) : null;
}

/** 테스트용: 기억한 통계를 모두 지운다. */
export function clearStatsCache(): void {
  slots.clear();
  playlists.clear();
}

// ─── 레이팅 구간 ───────────────────────────────────────────────────────────
// stats/level-charts·stats/plate-difficulty 가 받는 구간(14000 부터는 250 단위).
const BAND_EDGES = [13000, 13500, 14000, 14250, 14500, 14750, 15000, 15250, 15500, 15750, 16000, 16250, 16500, 16750, 17000];

/** 레이팅 → 통계 구간 이름(예: "14500-14750"). 13000 미만이면 null(통계 구간이 없다). */
export function ratingBandOf(rating: number): string | null {
  if (!(rating >= BAND_EDGES[0])) return null;
  for (let i = BAND_EDGES.length - 2; i >= 0; i--) {
    if (rating >= BAND_EDGES[i]) return `${BAND_EDGES[i]}-${BAND_EDGES[i + 1]}`;
  }
  return null;
}

// ─── 레이팅 분포 ───────────────────────────────────────────────────────────
export interface RatingStats {
  region: string;
  computedAt: string;
  activeDays: number;
  activePlayers: number;
  maxPossibleRating: number;
  median: number | null;
  topPercentiles: { percent: number; players: number; rating: number | null }[];
  histogram: { width: number; bands: { from: number; to: number; players: number | null; suppressed: boolean }[] };
}

export function getRatingStats(server: MaimaiServer): Promise<RatingStats | null> {
  return cached<RatingStats>("/stats/ratings", { region: regionOf(server) });
}

/**
 * 활동 중인 플레이어 가운데 레이팅이 rating 이상인 사람의 비율(%, 상위 N%).
 * - maishift 가 공개한 기준점(상위 75·50·25·10·5·3·2·1% 의 최저 레이팅) 사이면 그 점들을 잇는다. 맨 위 구간(16600~16700 처럼
 *   사람이 최고점 근처에 몰린 구간)을 고르게 나누면 상위 1% 를 2% 로 세는 식으로 어긋나서다.
 * - 상위 1% 기준점보다 높으면 그 점과 최고 레이팅(maxPossibleRating, 0%) 사이를 잇는다.
 * - 그 밖(기준점보다 낮거나 기준점이 없을 때)은 히스토그램으로, 구간 안은 고르게 퍼졌다고 본다. 5명이 안 되는 구간(인원 null)은 0명.
 */
export function topPercentOf(
  stats: Pick<RatingStats, "activePlayers" | "histogram"> & Partial<Pick<RatingStats, "topPercentiles" | "maxPossibleRating">>,
  rating: number,
): number | null {
  if (!(stats.activePlayers > 0) || !stats.histogram?.bands?.length) return null;
  const pts = (stats.topPercentiles ?? []).filter((t): t is { percent: number; players: number; rating: number } => t.rating != null).sort((a, b) => a.rating - b.rating);
  if (pts.length >= 2 && rating >= pts[0].rating) {
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1];
      if (rating <= b.rating) return b.rating === a.rating ? b.percent : a.percent + ((b.percent - a.percent) * (rating - a.rating)) / (b.rating - a.rating);
    }
    const top = pts[pts.length - 1];
    const max = stats.maxPossibleRating ?? 0;
    if (max > top.rating) return Math.max(0, (top.percent * (max - rating)) / (max - top.rating));
  }
  let above = 0;
  for (const b of stats.histogram.bands) {
    const n = b.players ?? 0;
    if (b.from >= rating) above += n;
    else if (b.to > rating && b.to > b.from) above += (n * (b.to - rating)) / (b.to - b.from);
  }
  return Math.min(100, Math.max(0, (above / stats.activePlayers) * 100));
}

/** "상위 N%" 의 N. 10% 아래는 소수 한 자리(가장 작게 0.1), 그 위는 정수. */
export function formatTopPercent(percent: number): string {
  if (percent < 10) return Math.max(0.1, Math.ceil(percent * 10) / 10).toFixed(1);
  return String(Math.min(100, Math.ceil(percent)));
}

export interface RatingRank { percent: number; activePlayers: number; activeDays: number }

/** 그 지역 활동 플레이어 중 레이팅 순위(상위 %). 통계를 못 받았으면 null. */
export async function getRatingRank(server: MaimaiServer, rating: number): Promise<RatingRank | null> {
  if (!(rating > 0)) return null;
  const stats = await getRatingStats(server);
  const percent = stats ? topPercentOf(stats, rating) : null;
  return stats && percent !== null ? { percent, activePlayers: stats.activePlayers, activeDays: stats.activeDays } : null;
}

// ─── 레벨별 보면 분포 ───────────────────────────────────────────────────────
export type ScoreBand = "LT_94" | "AAA" | "S" | "S_PLUS" | "SS" | "SS_PLUS" | "SSS" | "SSS_PLUS_WITHOUT_AP" | "ALL_PERFECT_PLUS" | "FULL_COMBO" | "FULL_COMBO_PLUS" | "ALL_PERFECT";
export interface ChartStat { chartId: number; players: number; suppressed: boolean; counts: Record<ScoreBand, number> | null }
interface LevelChartsResult { region: string; band: { from: number; to: number }; charts: ChartStat[] }

const levelMaps = new WeakMap<LevelChartsResult, Map<number, ChartStat>>();

/**
 * 한 레이팅 구간에서 그 표시 레벨(예: "14+") 보면마다의 달성률 분포. 보면 번호(그 지역) → 분포.
 * allowFetch=false 면 기억한 것만(없으면 null).
 */
export async function getLevelCharts(server: MaimaiServer, level: string, band: string, allowFetch = true): Promise<Map<number, ChartStat> | null> {
  const res = await cached<LevelChartsResult>("/stats/level-charts", { region: regionOf(server), level, rating: band }, STATS_TTL_MS, allowFetch);
  if (!res) return null;
  let m = levelMaps.get(res);
  if (!m) {
    m = new Map(res.charts.map((c) => [c.chartId, c]));
    levelMaps.set(res, m);
  }
  return m;
}

// 달성률 구간(높은 쪽부터)과 그 아래 경계. 100.5% 이상인 AP(AP+ 아님)는 점수 구간에 없고 ALL_PERFECT 로만 세므로 100.5 구간에 넣는다.
const SCORE_TIERS: [number, ScoreBand[]][] = [
  [101, ["ALL_PERFECT_PLUS"]],
  [100.5, ["SSS_PLUS_WITHOUT_AP", "ALL_PERFECT"]],
  [100, ["SSS"]],
  [99.5, ["SS_PLUS"]],
  [99, ["SS"]],
  [98, ["S_PLUS"]],
  [97, ["S"]],
  [94, ["AAA"]],
  [0, ["LT_94"]],
];

/** 그 구간에서 이 보면 기록이 있는 플레이어 중 달성률이 ach 이상인 비율(0~1). 인원이 적어 가려졌으면 null. */
export function shareAtLeast(stat: ChartStat, ach: number): number | null {
  if (stat.suppressed || !stat.counts || !(stat.players > 0)) return null;
  let n = 0;
  for (const [min, keys] of SCORE_TIERS) if (min >= ach) for (const k of keys) n += stat.counts[k] ?? 0;
  return Math.min(1, n / stat.players);
}

// ─── 클리어 비율 ────────────────────────────────────────────────────────────
export const CLEAR_CRITERIA = ["S", "S_PLUS", "SS", "SS_PLUS", "SSS", "SSS_PLUS", "FULL_COMBO", "FULL_COMBO_PLUS", "ALL_PERFECT", "ALL_PERFECT_PLUS"] as const;
export type ClearCriterion = (typeof CLEAR_CRITERIA)[number];
export interface ClearRatios {
  players: number;
  suppressed: boolean;
  bands: { band: number; players: number }[];
  charts: { chartId: number; played: number | null; cleared: number | null; suppressed: boolean }[];
}

/** 그 레벨을 기준까지 깬 비율 구간(0 = 0~20%, … 4 = 80~100%). */
export function clearBandOf(cleared: number, total: number): number {
  if (!(total > 0)) return 0;
  return Math.min(4, Math.floor((cleared / total) * 5));
}

/** 그 레벨을 기준까지 비슷하게(같은 20% 구간) 깬 플레이어들이 보면마다 얼마나 깼는지. */
export function getClearRatios(server: MaimaiServer, level: string, criterion: ClearCriterion, band: number): Promise<ClearRatios | null> {
  return cached<ClearRatios>("/stats/clear-ratios", { region: regionOf(server), level, criterion, band });
}

// ─── 플레이트 ──────────────────────────────────────────────────────────────
export interface PlateEstimate { value: number | null; unreachable: boolean }
export interface PlateDifficulty { plateId: number; prefix: string; charts: number; fsd: PlateEstimate | null; ap: PlateEstimate | null; sss: PlateEstimate | null; fc: PlateEstimate | null }
interface PlateDifficultyResult { region: string; version: number; band: { from: number; to: number }; plates: PlateDifficulty[] }

/**
 * 그 레이팅 구간 플레이어 기준 플레이트 난이도(0~10). 한자(prefix) → 추정.
 * API 는 "log₂(예상 플레이 수) − 1" 이라 하지만, 그 플레이 수는 상수 11.0 이상 보면만 (1/달성 비율 − 1) 을 레벨별로 줄여 더한 값이라
 * 플레이트를 다 깨는 데 드는 실제 플레이 수가 아니다(쉬운 보면은 0 에 가깝다). 그래서 플레이 수로 바꾸지 않고 난이도 값 그대로 보여 준다.
 */
export async function getPlateDifficulty(server: MaimaiServer, band: string): Promise<Map<string, PlateDifficulty> | null> {
  const res = await cached<PlateDifficultyResult>("/stats/plate-difficulty", { region: regionOf(server), rating: band });
  return res ? new Map(res.plates.map((p) => [p.prefix, p])) : null;
}


export type PlateTypeName = "覇者" | "舞舞" | "神" | "将" | "極";
export interface PlateFirstGap { plateId: number; version: number; type: PlateTypeName; players: number; suppressed: boolean; percentiles: { p10: number; p25: number; p50: number; p75: number; p90: number } | null }
export interface PlateStats { region: string; computedAt: string; maxRating: number; firstGaps: PlateFirstGap[] }

/** 플레이트를 처음 얻은 날 최고 레이팅과의 차이(플레이트별). */
export function getPlateStats(server: MaimaiServer): Promise<PlateStats | null> {
  return cached<PlateStats>("/stats/plates", { region: regionOf(server) });
}

// ─── 플레이리스트 ───────────────────────────────────────────────────────────
export interface PlaylistItem { chartId: number; title: string; type: "STANDARD" | "DX"; difficulty: "BASIC" | "ADVANCED" | "EXPERT" | "MASTER" | "RE_MASTER"; level: string; internalLevel: number; comment: string | null }
export interface Playlist { id: number; title: string; owner: { handle: string }; region: string; createdAt: string; updatedAt: string; items: PlaylistItem[] }

const playlists = new Map<number, { value: Playlist; at: number }>();

/** 입력(번호·#번호·maishift 플레이리스트 주소) → 플레이리스트 번호. 못 읽으면 null. */
export function parsePlaylistId(input: string): number | null {
  const s = input.trim();
  const m = /playlists?\/(\d+)/i.exec(s) ?? /^#?(\d+)$/.exec(s);
  const id = m ? Number(m[1]) : NaN;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** 공개 플레이리스트(5단위, 10분 기억). 없거나 비공개면 MaishiftError(not_found·private), 한도 초과면 rate_limited 를 던진다. */
export async function getPlaylist(id: number): Promise<Playlist> {
  const hit = playlists.get(id);
  if (hit && Date.now() - hit.at < PLAYLIST_TTL_MS) return hit.value;
  const value = await callApi<Playlist>(`/playlists/${id}`);
  playlists.delete(id);
  playlists.set(id, { value, at: Date.now() });
  while (playlists.size > 100) playlists.delete(playlists.keys().next().value!);
  return value;
}
