import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AttachmentBuilder,
  TextDisplayBuilder,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
  type UserSelectMenuInteraction,
} from "discord.js";
import {
  getCachedProfile,
  getUserFriendCode,
  getTranslateTitles,
  getCommandPreset,
  setCommandPreset,
} from "../../storage";
import { getClearList } from "../utils/embeds";
import {
  calcSongRating,
  getConstant,
  levelToNumber,
  getJacketFile,
  getChartsUnderConstant,
  isNewSong,
  isIntlAvailable,
  getRegionChartByKey,
  getRegionCharts,
} from "../../constants";
import { chartKey } from "../../scraper";
import type { PlayRecord, MaimaiServer } from "../../scraper";
import { msg, type MessageKey } from "../../messages";
import { notRegisteredNotice } from "../utils/notRegistered";
import { rankIcon, comboIcon } from "../utils/emoji";
import { songContainer, jacketAttachment } from "../utils/songCard";
import { getScoreRank } from "../../games";
import { rerollRow, rerollInPlace, postFromMenu, type V2Payload } from "../utils/reroll";
import {
  ratingBandOf, getLevelCharts, shareAtLeast, getClearRatios, clearBandOf,
  CLEAR_CRITERIA, type ChartStat, type ClearCriterion,
} from "../../maishift/stats";

// 목표 랭크 후보 (SSS~SSS+ 비중을 높게)
const RANKS = [
  { name: "SS", ach: 99.0, weight: 1 },
  { name: "SS+", ach: 99.5, weight: 1.5 },
  { name: "SSS", ach: 100.0, weight: 3 },
  { name: "SSS+", ach: 100.5, weight: 3 },
];

const RANK_COLOR: Record<string, number> = {
  "SSS+": 0xd97706,
  SSS: 0xf59e0b,
  "SS+": 0xfbbf24,
  SS: 0xfbbf24,
};

export interface Recommendation {
  title: string;
  kind: "ST" | "DX";
  diff: string;
  level: number;
  currentAch: number;
  currentRS: number;
  targetRank: string;
  targetAch: number;
  targetRS: number;
  ratingDelta: number; // 실제 총 레이팅 증가분 (목표RS - max(현재RS, 해당 풀 컷라인))
  isNew: boolean; // 신곡 여부
  jacketFile: string | null;
  /** 같은 레이팅대 플레이어 중 목표 랭크 이상인 비율(0~1). 통계가 없으면 없음. */
  peerShare?: number;
}

// 레이팅 1등 상수에 따른 상한 오프셋
function ceilingOffset(topC: number): number {
  if (topC <= 12.4) return 0.5;
  if (topC <= 13.5) return 0.4;
  if (topC <= 14.4) return 0.3;
  return 0.2; // 14.5~14.9 및 15.0 이상(스펙 미정의) 기본값
}

function chartConstant(r: PlayRecord, server: MaimaiServer = "intl"): number {
  const c = getConstant(r.title, r.musicKind, r.diff, server);
  return c !== null ? c : levelToNumber(r.level);
}

function weightedPick<T>(items: { item: T; weight: number }[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const i of items) {
    r -= i.weight;
    if (r < 0) return i.item;
  }
  return items[items.length - 1].item;
}

export interface RecommendOptions {
  kind?: "ST" | "DX"; // 지정 시 해당 채보 타입만
  play?: "played" | "unplayed"; // 지정 시 플레이/미플레이만
  diff?: string; // 지정 시 해당 난이도만 (BASIC~Re:MASTER)
  category?: "new" | "others"; // 지정 시 신곡/구곡만
  /**
   * 같은 레이팅대 플레이어 중 그 보면(chartKey)에서 달성률 ach 이상인 비율(0~1). 모르면 null.
   * 주면 비율이 높은(같은 레이팅대가 흔히 달성한) 보면을 더 자주 뽑는다.
   */
  peerShare?: (key: string, ach: number) => number | null;
}

// 기본 플레이:미플레이 목표 비율 (필터 미지정 시)
const TARGET_PLAYED = 0.6;
const TARGET_UNPLAYED = 0.4;
// 같은 레이팅대 비율 → 가중. 비율 80% 인 보면이 20% 인 보면보다 열 배쯤 자주 뽑힌다(흔히 달성하는 보면 위주로, 가끔은 다른 보면도).
// 통계가 없는 보면은 비율 30% 정도로 본다.
const peerFactor = (share: number) => 0.02 + share ** 2;
const PEER_UNKNOWN = peerFactor(0.3);

export interface Candidate {
  title: string;
  kind: "ST" | "DX";
  diff: string;
  level: number;
  currentAch: number;
  currentRS: number;
  fc: string;
  played: boolean;
  isNew: boolean;
  minTarget: (typeof RANKS)[number]; // 점수를 먹기 시작하는 최소 랭크
}

interface CandidatePool {
  candidates: Candidate[];
  newFloor: number;
  oldFloor: number;
}

/** 레이팅이 오를 수 있는 보면 후보(목표는 점수를 먹기 시작하는 가장 낮은 랭크). */
export function collectCandidates(
  clearRecords: PlayRecord[],
  opts: RecommendOptions = {},
  server: MaimaiServer = "intl",
): CandidatePool {
  const empty = { candidates: [], newFloor: 0, oldFloor: 0 };
  if (clearRecords.length === 0) return empty;

  // 서버별 신곡 하한이 다르므로(내수판=CiRCLE PLUS) 신곡 판정에 server를 고정한다.
  const isNewTitle = (title: string, kind: string) => isNewSong(title, server, undefined, kind);

  const clearMap = new Map<string, PlayRecord>();
  const newRSs: number[] = [];
  const oldRSs: number[] = [];
  let topC = 0;
  let topRS = -1;
  for (const r of clearRecords) {
    clearMap.set(chartKey(r), r);
    const C = chartConstant(r, server);
    const rs = calcSongRating(r.achievementVal, C, r.fc);
    if (rs > topRS) {
      topRS = rs;
      topC = C;
    }
    if (isNewTitle(r.title, r.musicKind)) newRSs.push(rs);
    else oldRSs.push(rs);
  }
  if (topC <= 0) return empty;

  newRSs.sort((a, b) => b - a);
  oldRSs.sort((a, b) => b - a);
  const newFloor = newRSs.length >= 15 ? newRSs[14] : 0; // 신곡 15위 컷라인
  const oldFloor = oldRSs.length >= 35 ? oldRSs[34] : 0; // 구곡 35위 컷라인

  const upperBound = topC + ceilingOffset(topC);

  const candidates: Candidate[] = [];
  for (const chart of getChartsUnderConstant(upperBound)) {
    if (!isIntlAvailable(chart.title, chart.kind)) continue; // 국제판 미수록 곡 제외
    if (opts.kind && chart.kind !== opts.kind) continue; // ST/DX 필터
    if (opts.diff && chart.diff !== opts.diff) continue; // 난이도 필터
    const isNew = isNewTitle(chart.title, chart.kind);
    if (opts.category === "new" && !isNew) continue; // 신곡/구곡 필터
    if (opts.category === "others" && isNew) continue;
    const rec = clearMap.get(`${chart.title}|${chart.kind}|${chart.diff}`);
    const userAch = rec?.achievementVal ?? 0;
    const played = userAch > 0;
    if (opts.play === "played" && !played) continue; // 플레이/미플레이 필터
    if (opts.play === "unplayed" && played) continue;
    const fc = rec?.fc ?? "";
    const floor = isNew ? newFloor : oldFloor;
    // JP 프로필은 JP 상수로 레이팅 계산 (후보 풀 상한은 공용 상수 기준)
    const level = getConstant(chart.title, chart.kind, chart.diff, server) ?? chart.level;
    const validTargets = RANKS.filter(
      (rank) =>
        rank.ach > userAch && calcSongRating(rank.ach, level, fc) > floor,
    );
    if (validTargets.length === 0) continue;
    candidates.push({
      title: chart.title,
      kind: chart.kind,
      diff: chart.diff,
      level,
      currentAch: userAch,
      currentRS: calcSongRating(userAch, level, fc),
      fc,
      played,
      isNew,
      minTarget: validTargets[0], // 유효 목표 중 가장 낮은 랭크 = 최소 목표
    });
  }
  return { candidates, newFloor, oldFloor };
}

/** 후보에서 count 개를 가중 추출(비복원)한다. */
export function pickRecommendations(pool: CandidatePool, count = 3, opts: RecommendOptions = {}): Recommendation[] {
  const share = (c: Candidate) => opts.peerShare?.(`${c.title}|${c.kind}|${c.diff}`, c.minTarget.ach) ?? null;
  // 곡 가중 = DX 2배 × 최소목표 가중(SSS~SSS+가 SS/SS+보다 더 자주 뽑히도록) × 같은 레이팅대 달성 비율(통계가 있을 때)
  const chartWeight = (c: Candidate) => {
    const base = (c.kind === "DX" ? 2 : 1) * c.minTarget.weight;
    if (!opts.peerShare) return base;
    const s = share(c);
    return base * (s === null ? PEER_UNKNOWN : peerFactor(s));
  };

  // 위 가중 + 플레이:미플레이 그룹 목표 비율(60:40) 정규화.
  const rest = pool.candidates.slice();
  const chosen: Recommendation[] = [];
  while (chosen.length < count && rest.length > 0) {
    let sumPlayed = 0;
    let sumUnplayed = 0;
    for (const c of rest) {
      if (c.played) sumPlayed += chartWeight(c);
      else sumUnplayed += chartWeight(c);
    }
    const pick = weightedPick(
      rest.map((c) => {
        const groupSum = c.played ? sumPlayed : sumUnplayed;
        const groupTarget = c.played ? TARGET_PLAYED : TARGET_UNPLAYED;
        return {
          item: c,
          weight: groupSum > 0 ? (groupTarget * chartWeight(c)) / groupSum : 0,
        };
      }),
    );
    rest.splice(rest.indexOf(pick), 1);
    const target = pick.minTarget; // 최소 목표를 그대로 표시
    const targetRS = calcSongRating(target.ach, pick.level, pick.fc);
    // 실제 총 레이팅 변화: 이 채보가 이미 대상이면 현재RS를, 아니면 컷라인을 밀어냄
    const floor = pick.isNew ? pool.newFloor : pool.oldFloor;
    const ratingDelta = targetRS - Math.max(pick.currentRS, floor);
    const peer = share(pick);
    chosen.push({
      title: pick.title,
      kind: pick.kind,
      diff: pick.diff,
      level: pick.level,
      currentAch: pick.currentAch,
      currentRS: pick.currentRS,
      targetRank: target.name,
      targetAch: target.ach,
      targetRS,
      ratingDelta,
      isNew: pick.isNew,
      jacketFile: getJacketFile(pick.title),
      ...(peer !== null ? { peerShare: peer } : {}),
    });
  }
  return chosen;
}

// clearJson 기반으로 레이팅이 오를 채보 count개를 추천
export function recommendCharts(
  clearRecords: PlayRecord[],
  count = 3,
  opts: RecommendOptions = {},
  server: MaimaiServer = "intl",
): Recommendation[] {
  return pickRecommendations(collectCandidates(clearRecords, opts, server), count, opts);
}

// 한 번에 새로 받는 레벨 분포 수(15단위씩). 나머지 레벨은 받아 둔 것만 쓴다.
const MAX_LEVEL_FETCHES = 2;
const MAX_LEVELS = 4;

/**
 * 후보 보면이 많은 표시 레벨부터, 같은 레이팅 구간 보면 분포를 모아 peerShare 를 만든다.
 * 레이팅이 통계 구간(13000 이상) 밖이거나 하나도 못 받았으면 null.
 */
async function peerShareFor(server: MaimaiServer, rating: number, candidates: Candidate[]): Promise<{ share: (key: string, ach: number) => number | null; band: string } | null> {
  const band = ratingBandOf(rating);
  if (!band) return null;
  const perLevel = new Map<string, number>();
  for (const c of candidates) {
    const rc = getRegionChartByKey(server, `${c.title}|${c.kind}|${c.diff}`);
    if (rc) perLevel.set(rc.level, (perLevel.get(rc.level) ?? 0) + 1);
  }
  const levels = [...perLevel.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_LEVELS).map(([l]) => l);
  const maps = new Map<string, Map<number, ChartStat>>();
  const missing: string[] = [];
  for (const level of levels) {
    const m = await getLevelCharts(server, level, band, false);
    if (m) maps.set(level, m);
    else missing.push(level);
  }
  const fetched = await Promise.all(missing.slice(0, MAX_LEVEL_FETCHES).map((level) => getLevelCharts(server, level, band).then((m) => [level, m] as const)));
  for (const [level, m] of fetched) if (m) maps.set(level, m);
  if (maps.size === 0) return null;
  return {
    band,
    share: (key, ach) => {
      const rc = getRegionChartByKey(server, key);
      const stat = rc ? maps.get(rc.level)?.get(rc.id) : undefined;
      return stat ? shareAtLeast(stat, ach) : null;
    },
  };
}

/** "16250-16500" → "16,250~16,500" */
function bandLabel(band: string): string {
  return band.split("-").map((n) => Number(n).toLocaleString("en-US")).join("~");
}

// ─── 다음에 깰 만한 곡(레벨·기준) ─────────────────────────────────────────────
const LEVEL_CHOICES = ["7", "7+", "8", "8+", "9", "9+", "10", "10+", "11", "11+", "12", "12+", "13", "13+", "14", "14+", "15"];
const CRITERION_LABEL: Record<ClearCriterion, string> = {
  S: "S", S_PLUS: "S+", SS: "SS", SS_PLUS: "SS+", SSS: "SSS", SSS_PLUS: "SSS+",
  FULL_COMBO: "FC", FULL_COMBO_PLUS: "FC+", ALL_PERFECT: "AP", ALL_PERFECT_PLUS: "AP+",
};
const ACH_OF: Partial<Record<ClearCriterion, number>> = { S: 97, S_PLUS: 98, SS: 99, SS_PLUS: 99.5, SSS: 100, SSS_PLUS: 100.5 };
const COMBO_OF: Partial<Record<ClearCriterion, string[]>> = {
  FULL_COMBO: ["FC", "FC+", "AP", "AP+"],
  FULL_COMBO_PLUS: ["FC+", "AP", "AP+"],
  ALL_PERFECT: ["AP", "AP+"],
  ALL_PERFECT_PLUS: ["AP+"],
};

/** 기록이 기준을 넘었는지. */
export function meetsCriterion(r: PlayRecord | undefined, criterion: ClearCriterion): boolean {
  if (!r || !(r.achievementVal > 0)) return false;
  const ach = ACH_OF[criterion];
  if (ach !== undefined) return r.achievementVal >= ach;
  return (COMBO_OF[criterion] ?? []).includes(r.fc);
}

export interface NextClear {
  title: string;
  kind: "ST" | "DX";
  diff: string;
  constant: number;
  /** 같은 단계 플레이어 중 이 보면을 기준까지 깬 비율(0~1) */
  share: number;
  current: PlayRecord | undefined;
}

/**
 * 같은 단계(그 레벨을 기준까지 비슷한 비율로 깬) 플레이어들이 많이 깬 순으로, 내가 아직 못 깬 보면.
 * stats 는 stats/clear-ratios 의 charts(보면 번호는 그 지역 번호).
 */
export function nextClears(
  charts: { id: number; title: string; kind: "ST" | "DX"; diff: string; constant: number }[],
  clearMap: Map<string, PlayRecord>,
  criterion: ClearCriterion,
  stats: { players: number; charts: { chartId: number; cleared: number | null; suppressed: boolean }[] },
  count: number,
): NextClear[] {
  const byId = new Map(stats.charts.map((c) => [c.chartId, c]));
  const out: NextClear[] = [];
  for (const c of charts) {
    const current = clearMap.get(`${c.title}|${c.kind}|${c.diff}`);
    if (meetsCriterion(current, criterion)) continue;
    const s = byId.get(c.id);
    if (!s || s.suppressed || s.cleared === null || !(stats.players > 0)) continue;
    out.push({ title: c.title, kind: c.kind, diff: c.diff, constant: c.constant, share: Math.min(1, s.cleared / stats.players), current });
  }
  // 많이 깬 순. 같으면 상수가 낮은 쪽(먼저 깨기 쉬운 쪽)부터.
  out.sort((a, b) => b.share - a.share || a.constant - b.constant);
  return out.slice(0, count);
}

const DIFFS = ["BASIC", "ADVANCED", "EXPERT", "MASTER", "Re:MASTER"];
const MAX_COUNT = 5;

// 옵션 없이 실행하면 조건 창(본인에게만 보임)이 먼저 뜬다. 고르고 "추천받기" 를 누르면 채널에 결과가 올라간다.
export const data = new SlashCommandBuilder()
  .setName("곡추천")
  .setDescription("조건을 골라 레이팅 올리기 좋은 채보 추천 (다시 뽑기·조건 바꾸기 버튼)");

// ─── 조건(customId 에 담는다) ─────────────────────────────────────────────────
// "<모드 r|l>.<레벨 번호>.<기준 번호>.<난이도 번호>.<S|D>.<n|o>.<p|u>.<개수>.<대상>" — 비어 있으면 전체.
export interface RecState {
  mode: "r" | "l";
  level: string;
  criterion: ClearCriterion;
  diff: string;
  kind: "" | "ST" | "DX";
  category: "" | "new" | "others";
  play: "" | "played" | "unplayed";
  count: number;
  target: string;
}

export function encodeRecState(s: RecState): string {
  const idx = (list: readonly string[], v: string) => (list.includes(v) ? String(list.indexOf(v)) : "");
  return [
    s.mode, idx(LEVEL_CHOICES, s.level), idx(CLEAR_CRITERIA, s.criterion), idx(DIFFS, s.diff),
    s.kind === "ST" ? "S" : s.kind === "DX" ? "D" : "", s.category === "new" ? "n" : s.category === "others" ? "o" : "",
    s.play === "played" ? "p" : s.play === "unplayed" ? "u" : "", String(s.count), s.target,
  ].join(".");
}

export function decodeRecState(raw: string): RecState | null {
  const [mode, lv, cr, df, ty, ca, pl, n, target] = raw.split(".");
  if ((mode !== "r" && mode !== "l") || !/^\d{5,25}$/.test(target ?? "")) return null;
  const at = <T>(list: readonly T[], v: string | undefined): T | undefined => (v ? list[Number(v)] : undefined);
  const level = at(LEVEL_CHOICES, lv) ?? "";
  return {
    mode: mode === "l" && level ? "l" : "r",
    level,
    criterion: at(CLEAR_CRITERIA, cr) ?? "SSS",
    diff: at(DIFFS, df) ?? "",
    kind: ty === "S" ? "ST" : ty === "D" ? "DX" : "",
    category: ca === "n" ? "new" : ca === "o" ? "others" : "",
    play: pl === "p" ? "played" : pl === "u" ? "unplayed" : "",
    count: Math.min(MAX_COUNT, Math.max(1, Number(n) || 3)),
    target: target!,
  };
}

// ─── 결과 ────────────────────────────────────────────────────────────────────
/** 조건으로 추천 결과(Components V2)를 만든다. 보여 줄 수 없으면 안내 문구. ownerId: 버튼 주인(번역 설정도 그 사람 것). */
export async function buildRecommendation(state: RecState, ownerId: string): Promise<V2Payload | string> {
  const friendCode = await getUserFriendCode(state.target);
  const cached = friendCode ? await getCachedProfile(friendCode) : null;
  if (!cached) return await notRegisteredNotice(state.target, state.target === ownerId);
  const clearRecords = getClearList(cached);
  if (clearRecords.length === 0) return msg("songrec.noRecords");
  const opts: RecommendOptions = {
    kind: state.kind || undefined,
    play: state.play || undefined,
    diff: state.diff || undefined,
    category: state.category || undefined,
  };
  const translate = await getTranslateTitles(ownerId);
  const tail = rerollRow("rec", ownerId, encodeRecState(state));
  // 곡 하나가 컴포넌트 8개(작은 글 위 구분선 포함)라 5곡이면 구분선을 빼야 한도(40) 안에 든다.
  const separator = state.count < MAX_COUNT;
  if (state.mode === "l") return nextClearsPayload(cached.server, clearRecords, state.level, state.criterion, opts, translate, state.count, separator, tail);

  const pool = collectCandidates(clearRecords, opts, cached.server);
  // 같은 레이팅대 기록(maishift 통계)이 있으면 그 사람들이 흔히 달성한 보면을 더 자주 뽑는다.
  const peer = pool.candidates.length ? await peerShareFor(cached.server, cached.rating || 0, pool.candidates).catch(() => null) : null;
  const recs = pickRecommendations(pool, state.count, peer ? { ...opts, peerShare: peer.share } : opts);
  if (recs.length === 0) return msg("songrec.noCandidates");

  // Components V2: 머리글 → 곡마다 컨테이너(곡·목표·레이팅 상승, 구분선 아래 곡 점수·같은 레이팅대 비율, 외부 출력) → 출처 → 버튼.
  const jackets = await Promise.all(recs.map((r, i) => jacketAttachment(r.title, r.kind, `rec${i}.png`)));
  const containers = recs.map((r, i) => {
    const cur = r.currentAch > 0 ? `${rankIcon(getScoreRank(r.currentAch))} ${r.currentAch.toFixed(4)}%` : msg("songrec.notPlayed");
    // 모바일 폭에 맞게 한 줄에 하나씩: (빈 줄) / 목표 / 현재 / 레이팅. 작은 글도 줄마다 하나.
    const foot = [msg("songrec.cardSongRating", { pool: r.isNew ? msg("songrec.newSong") : msg("songrec.oldSong"), from: r.currentRS, to: r.targetRS })];
    if (peer && r.peerShare !== undefined) foot.push(msg("songrec.cardPeer", { share: Math.round(r.peerShare * 100), rank: r.targetRank }));
    return songContainer({
      title: r.title, kind: r.kind, diff: r.diff, constant: r.level, translate,
      lines: [
        "",
        msg("songrec.cardTarget", { rank: rankIcon(r.targetRank), ach: r.targetAch.toFixed(1) }),
        msg("songrec.cardNow", { current: cur }),
        msg("songrec.cardRating", { delta: r.ratingDelta, from: cached.rating, to: cached.rating + r.ratingDelta }),
      ],
      foot,
      accent: RANK_COLOR[r.targetRank],
      separator,
    }, jackets[i]);
  });
  return {
    components: [
      new TextDisplayBuilder().setContent(peer ? msg("songrec.headerPeer", { band: bandLabel(peer.band) }) : msg("songrec.header")),
      ...containers,
      ...(peer ? [new TextDisplayBuilder().setContent(msg("songrec.footer", { text: msg("maishift.credit") }))] : []),
      tail,
    ],
    files: jackets.filter((j): j is AttachmentBuilder => !!j),
    flags: MessageFlags.IsComponentsV2,
  };
}

/** /곡추천 레벨: — 같은 단계 플레이어들이 많이 깬, 아직 못 깬 보면. */
async function nextClearsPayload(
  server: MaimaiServer,
  clearRecords: PlayRecord[],
  level: string,
  criterion: ClearCriterion,
  opts: RecommendOptions,
  translate: boolean,
  count: number,
  separator: boolean,
  tail: ActionRowBuilder<ButtonBuilder>,
): Promise<V2Payload | string> {
  const clearMap = new Map(clearRecords.map((r) => [chartKey(r), r] as [string, PlayRecord]));
  const levelCharts = getRegionCharts(server).filter((c) => c.level === level);
  if (levelCharts.length === 0) return msg("songrec.nextNoCandidates");
  // 단계(0~4)는 그 레벨 전체 보면 중 기준을 넘은 비율로 정한다(필터와 상관없이).
  const cleared = levelCharts.filter((c) => meetsCriterion(clearMap.get(`${c.title}|${c.kind}|${c.diff}`), criterion)).length;
  const band = clearBandOf(cleared, levelCharts.length);
  const label = CRITERION_LABEL[criterion];
  if (cleared >= levelCharts.length) return msg("songrec.nextAllCleared", { level, criterion: label });
  const stats = await getClearRatios(server, level, criterion, band).catch(() => null);
  if (!stats) return msg("songrec.nextNoStats");
  if (stats.suppressed || !stats.charts.length) return msg("songrec.nextSuppressed");
  const filtered = levelCharts.filter((c) => {
    if (opts.kind && c.kind !== opts.kind) return false;
    if (opts.diff && c.diff !== opts.diff) return false;
    if (opts.category) {
      const isNew = isNewSong(c.title, server, undefined, c.kind);
      if (opts.category === "new" ? !isNew : isNew) return false;
    }
    if (opts.play) {
      const played = (clearMap.get(`${c.title}|${c.kind}|${c.diff}`)?.achievementVal ?? 0) > 0;
      if (opts.play === "played" ? !played : played) return false;
    }
    return true;
  });
  // 많이 깬 순이라 다시 뽑기를 해도 같은 곡이 나오지 않게, 위쪽 후보(개수의 3배) 안에서 무작위로 고른다.
  const ranked = nextClears(filtered, clearMap, criterion, stats, count * 3);
  const picks = shuffleTake(ranked, count).sort((a, b) => b.share - a.share || a.constant - b.constant);
  if (picks.length === 0) return msg("songrec.nextNoCandidates");
  const jackets = await Promise.all(picks.map((p, i) => jacketAttachment(p.title, p.kind, `next${i}.png`)));
  const containers = picks.map((p, i) => {
    const constant = getConstant(p.title, p.kind, p.diff, server) ?? p.constant;
    const r = p.current;
    const cur = r && r.achievementVal > 0
      ? `${rankIcon(getScoreRank(r.achievementVal))} **${r.achievementVal.toFixed(4)}%** ${comboIcon(r.fc)}`.trim()
      : msg("songrec.notPlayed");
    return songContainer({
      title: p.title, kind: p.kind, diff: p.diff, constant, translate,
      lines: ["", msg("songrec.cardNow", { current: cur })],
      foot: [msg("songrec.cardNextPeer", { share: Math.round(p.share * 100), criterion: label })],
      separator,
    }, jackets[i]);
  });
  const footer = `${msg("songrec.nextFooter", { from: band * 20, to: band * 20 + 20, players: stats.players.toLocaleString("en-US") })}  ✦  ${msg("maishift.credit")}`;
  return {
    components: [
      new TextDisplayBuilder().setContent(msg("songrec.nextHeader", { level, criterion: label, cleared, total: levelCharts.length })),
      ...containers,
      new TextDisplayBuilder().setContent(msg("songrec.footer", { text: footer })),
      tail,
    ],
    files: jackets.filter((j): j is AttachmentBuilder => !!j),
    flags: MessageFlags.IsComponentsV2,
  };
}

function shuffleTake<T>(list: T[], n: number): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

// ─── 명령 ────────────────────────────────────────────────────────────────────
export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  // 직전에 뽑은 조건이 있으면 그 조건으로 연다(대상은 늘 본인부터).
  const saved = await getCommandPreset(interaction.user.id, "rec").catch(() => null);
  const restored = saved ? decodeRecState(saved) : null;
  const state: RecState = restored
    ? { ...restored, target: interaction.user.id }
    : { mode: "r", level: "", criterion: "SSS", diff: "", kind: "", category: "", play: "", count: 3, target: interaction.user.id };
  await interaction.reply({ components: [buildRecMenu(state, interaction.user.id, "-")], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
}

/** 뽑은 조건을 그 사람의 다음 실행 기본값으로 둔다(sessions.command_presets). 실패해도 넘어간다. */
function rememberRec(ownerId: string, state: RecState): void {
  setCommandPreset(ownerId, "rec", encodeRecState({ ...state, target: ownerId })).catch((e: unknown) => console.warn("[곡추천] 조건 저장 실패:", (e as Error).message));
}

// ─── 조건 바꾸기 메뉴(본인에게만 보임) ────────────────────────────────────────
// customId — 선택 rec:s:<칸>:<주인>:<결과 메시지>:<조건>, 유저 rec:u:<주인>:<결과 메시지>:<조건>, 뽑기 rec:go:<주인>:<결과 메시지>:<조건>.
// 결과 메시지는 뽑을 때 지울 예전 결과("-" 면 없음).
type RecField = "m" | "lv" | "cr" | "df" | "ty" | "ca" | "pl" | "n";

function fieldSelect(field: RecField, ownerId: string, msgId: string, code: string, options: { label: string; value: string; on: boolean }[]): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`rec:s:${field}:${ownerId}:${msgId}:${code}`)
      .addOptions(options.map((o) => ({ label: o.label, value: o.value, default: o.on }))),
  );
}

export function buildRecMenu(state: RecState, ownerId: string, msgId: string): ContainerBuilder {
  const code = encodeRecState(state);
  const f = (field: string, value: string) => msg("songrec.menuOption", { field: msg(`songrec.field.${field}` as MessageKey), value });
  const all = msg("songrec.valueAll");
  const container = new ContainerBuilder()
    .setAccentColor(RANK_COLOR.SSS)
    .addTextDisplayComponents((t) => t.setContent(msg("songrec.menuTitle", { user: `<@${state.target}>` })))
    .addSeparatorComponents((s) => s.setSpacing(SeparatorSpacingSize.Small));
  const rows: ActionRowBuilder<StringSelectMenuBuilder>[] = [
    fieldSelect("m", ownerId, msgId, code, [
      { label: f("mode", msg("songrec.modeRating")), value: "r", on: state.mode === "r" },
      { label: f("mode", msg("songrec.modeNext")), value: "l", on: state.mode === "l" },
    ]),
  ];
  if (state.mode === "l") {
    rows.push(
      fieldSelect("lv", ownerId, msgId, code, [...LEVEL_CHOICES].reverse().map((l) => ({ label: f("level", l), value: l, on: l === state.level }))),
      fieldSelect("cr", ownerId, msgId, code, CLEAR_CRITERIA.map((c) => ({ label: f("criterion", CRITERION_LABEL[c]), value: c, on: c === state.criterion }))),
    );
  }
  rows.push(
    fieldSelect("df", ownerId, msgId, code, [{ label: f("diff", all), value: "-", on: !state.diff }, ...DIFFS.map((d) => ({ label: f("diff", d), value: d, on: d === state.diff }))]),
    fieldSelect("ty", ownerId, msgId, code, [
      { label: f("kind", all), value: "-", on: !state.kind },
      { label: f("kind", "STANDARD"), value: "ST", on: state.kind === "ST" },
      { label: f("kind", "DX"), value: "DX", on: state.kind === "DX" },
    ]),
    fieldSelect("ca", ownerId, msgId, code, [
      { label: f("category", all), value: "-", on: !state.category },
      { label: f("category", msg("songrec.newSong")), value: "new", on: state.category === "new" },
      { label: f("category", msg("songrec.oldSong")), value: "others", on: state.category === "others" },
    ]),
    fieldSelect("pl", ownerId, msgId, code, [
      { label: f("play", all), value: "-", on: !state.play },
      { label: f("play", msg("songrec.played")), value: "played", on: state.play === "played" },
      { label: f("play", msg("songrec.notPlayed")), value: "unplayed", on: state.play === "unplayed" },
    ]),
    fieldSelect("n", ownerId, msgId, code, Array.from({ length: MAX_COUNT }, (_, k) => k + 1).map((n) => ({ label: f("count", msg("songrec.countValue", { count: n })), value: String(n), on: n === state.count }))),
  );
  for (const row of rows) container.addActionRowComponents(row);
  return container
    .addActionRowComponents(
      new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
        new UserSelectMenuBuilder().setCustomId(`rec:u:${ownerId}:${msgId}:${code}`).setDefaultUsers(state.target),
      ),
    )
    .addSeparatorComponents((s) => s.setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`rec:go:${ownerId}:${msgId}:${code}`).setLabel(msg("songrec.menuGo")).setStyle(ButtonStyle.Primary),
      ),
    );
}

/** rec: 로 시작하는 버튼·선택 메뉴. */
export async function handleComponent(i: ButtonInteraction | StringSelectMenuInteraction | UserSelectMenuInteraction): Promise<void> {
  const parts = i.customId.split(":");
  const action = parts[1];
  if (i.isButton() && (action === "re" || action === "menu")) {
    const [, , ownerId = "", raw = ""] = parts;
    const state = decodeRecState(raw);
    if (!state) { await i.reply({ content: msg("reroll.expired"), flags: MessageFlags.Ephemeral }); return; }
    if (action === "re") {
      if (i.user.id === ownerId) rememberRec(ownerId, state);
      await rerollInPlace(i, ownerId, () => buildRecommendation(state, ownerId));
      return;
    }
    // 메뉴는 누른 사람 것. 결과 주인이 열었을 때만 그 결과를 다음 뽑기 때 지운다.
    const msgId = i.user.id === ownerId ? i.message.id : "-";
    await i.reply({ components: [buildRecMenu(state, i.user.id, msgId)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    return;
  }
  if (i.isStringSelectMenu() && action === "s") {
    const [, , field, ownerId = "", msgId = "-", raw = ""] = parts;
    const state = decodeRecState(raw);
    const value = i.values[0];
    if (!state || value === undefined) { await i.deferUpdate(); return; }
    const v = value === "-" ? "" : value;
    switch (field as RecField) {
      case "m": state.mode = v === "l" ? "l" : "r"; if (state.mode === "l" && !state.level) state.level = "14"; break;
      case "lv": state.level = v; break;
      case "cr": state.criterion = (CLEAR_CRITERIA as readonly string[]).includes(v) ? v as ClearCriterion : "SSS"; break;
      case "df": state.diff = v; break;
      case "ty": state.kind = v === "ST" || v === "DX" ? v : ""; break;
      case "ca": state.category = v === "new" || v === "others" ? v : ""; break;
      case "pl": state.play = v === "played" || v === "unplayed" ? v : ""; break;
      case "n": state.count = Math.min(MAX_COUNT, Math.max(1, Number(v) || 3)); break;
    }
    await i.update({ components: [buildRecMenu(state, ownerId, msgId)], flags: MessageFlags.IsComponentsV2 });
    return;
  }
  if (i.isUserSelectMenu() && action === "u") {
    const [, , ownerId = "", msgId = "-", raw = ""] = parts;
    const state = decodeRecState(raw);
    const picked = i.values[0];
    if (!state || !picked) { await i.deferUpdate(); return; }
    state.target = picked;
    await i.update({ components: [buildRecMenu(state, ownerId, msgId)], flags: MessageFlags.IsComponentsV2 });
    return;
  }
  if (i.isButton() && action === "go") {
    const [, , ownerId = "", msgId = "-", raw = ""] = parts;
    const state = decodeRecState(raw);
    if (!state) { await i.reply({ content: msg("reroll.expired"), flags: MessageFlags.Ephemeral }); return; }
    rememberRec(ownerId, state);
    const sent = await postFromMenu(i, msgId, () => buildRecommendation(state, ownerId));
    // 다음 뽑기 때는 방금 올린 결과를 지우도록 메뉴를 고친다.
    if (sent) await i.editReply({ components: [buildRecMenu(state, ownerId, sent)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
  }
}
