import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import {
  getCachedProfile,
  getUserFriendCode,
  getTranslateTitles,
} from "../../storage";
import { getClearList } from "../utils/embeds";
import { displayTitle } from "../../aliases";
import {
  calcSongRating,
  getConstant,
  levelToNumber,
  getJacketFile,
  getChartsUnderConstant,
  isNewSong,
  isIntlAvailable,
  jacketFileUrl,
  getRegionChartByKey,
  getRegionCharts,
} from "../../constants";
import { chartKey } from "../../scraper";
import type { PlayRecord, MaimaiServer } from "../../scraper";
import { msg } from "../../messages";
import { notRegisteredNotice } from "../utils/notRegistered";
import { titleWithKind } from "../utils/emoji";
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

export const data = new SlashCommandBuilder()
  .setName("곡추천")
  .setDescription("레이팅 대상곡 기반으로 점수 올리기 좋은 채보 3개 추천")
  .addStringOption((opt) =>
    opt
      .setName("type")
      .setDescription("채보 타입 (Optional)")
      .setRequired(false)
      .addChoices(
        { name: "STANDARD", value: "ST" },
        { name: "DX", value: "DX" },
      ),
  )
  .addStringOption((opt) =>
    opt
      .setName("플레이여부")
      .setDescription("플레이한 곡 / 미플레이 곡만 (Optional)")
      .setRequired(false)
      .addChoices(
        { name: "플레이", value: "played" },
        { name: "미플레이", value: "unplayed" },
      ),
  )
  .addStringOption((opt) =>
    opt
      .setName("난이도")
      .setDescription("난이도 (Optional)")
      .setRequired(false)
      .addChoices(
        { name: "BASIC", value: "BASIC" },
        { name: "ADVANCED", value: "ADVANCED" },
        { name: "EXPERT", value: "EXPERT" },
        { name: "MASTER", value: "MASTER" },
        { name: "Re:MASTER", value: "Re:MASTER" },
      ),
  )
  .addStringOption((opt) =>
    opt
      .setName("곡분류")
      .setDescription("신곡 / 구곡만 (Optional)")
      .setRequired(false)
      .addChoices(
        { name: "신곡", value: "new" },
        { name: "구곡", value: "others" },
      ),
  )
  .addUserOption((opt) =>
    opt
      .setName("user")
      .setDescription("조회할 유저 (생략 시 본인)")
      .setRequired(false),
  )
  .addStringOption((opt) =>
    opt
      .setName("레벨")
      .setDescription("고르면 이 레벨을 나만큼 깬 사람들이 많이 깬 곡 중 아직 못 깬 곡을 추천 (Optional)")
      .setRequired(false)
      .addChoices(...LEVEL_CHOICES.map((l) => ({ name: l, value: l }))),
  )
  .addStringOption((opt) =>
    opt
      .setName("기준")
      .setDescription("레벨을 고를 때 깼다고 볼 기준 (기본: SSS)")
      .setRequired(false)
      .addChoices(...CLEAR_CRITERIA.map((c) => ({ name: CRITERION_LABEL[c], value: c }))),
  );

function ytLink(title: string, kind: string, diff: string): string {
  // 유튜브 외부출력 검색: "maimai {곡명} {ST/DX} {난이도} 外部出力"
  const q = encodeURIComponent(`maimai ${title} ${kind} ${diff} 外部出力`.replace(/\s+/g, " ").trim());
  return msg("common.externalLink", { url: `https://www.youtube.com/results?search_query=${q}` });
}

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const target = interaction.options.getUser("user") ?? interaction.user;
  const userId = target.id;
  const friendCode = await getUserFriendCode(userId);
  const cached = friendCode ? await getCachedProfile(friendCode) : null;
  if (!cached) {
    const notice = await notRegisteredNotice(target.id, target.id === interaction.user.id);
    await interaction.reply({ content: notice, flags: MessageFlags.Ephemeral });
    return;
  }

  const clearRecords = getClearList(cached);
  if (clearRecords.length === 0) {
    await interaction.reply({
      content: msg("songrec.noRecords"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const kindOpt = interaction.options.getString("type");
  const playOpt = interaction.options.getString("플레이여부");
  const diffOpt = interaction.options.getString("난이도");
  const catOpt = interaction.options.getString("곡분류");
  const levelOpt = interaction.options.getString("레벨");
  const criterionOpt = interaction.options.getString("기준") as ClearCriterion | null;
  const opts: RecommendOptions = {
    kind: kindOpt === "ST" || kindOpt === "DX" ? kindOpt : undefined,
    play: playOpt === "played" || playOpt === "unplayed" ? playOpt : undefined,
    diff: diffOpt ?? undefined,
    category: catOpt === "new" || catOpt === "others" ? catOpt : undefined,
  };
  const translate = await getTranslateTitles(interaction.user.id);

  if (criterionOpt && !levelOpt) {
    await interaction.reply({ content: msg("songrec.criterionNeedsLevel"), flags: MessageFlags.Ephemeral });
    return;
  }
  if (levelOpt) {
    await replyNextClears(interaction, cached.server, clearRecords, levelOpt, criterionOpt && CLEAR_CRITERIA.includes(criterionOpt) ? criterionOpt : "SSS", opts, translate);
    return;
  }

  const pool = collectCandidates(clearRecords, opts, cached.server);
  // 같은 레이팅대 기록(maishift 통계)이 있으면 그 사람들이 흔히 달성한 보면을 더 자주 뽑는다.
  const peer = pool.candidates.length ? await peerShareFor(cached.server, cached.rating || 0, pool.candidates).catch(() => null) : null;
  const recs = pickRecommendations(pool, 3, peer ? { ...opts, peerShare: peer.share } : opts);
  if (recs.length === 0) {
    await interaction.reply({
      content: msg("songrec.noCandidates"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const embeds = recs.map((r, i) => {
    const chartDelta = r.targetRS - r.currentRS;
    const cur = r.currentAch > 0 ? `${r.currentAch.toFixed(4)}%` : msg("songrec.notPlayed");
    const newRating = cached.rating + r.ratingDelta;
    const emb = new EmbedBuilder()
      .setColor(RANK_COLOR[r.targetRank] ?? 0x9333ea)
      .setTitle(titleWithKind(displayTitle(r.title, translate), r.kind))
      .setDescription(ytLink(r.title, r.kind, r.diff))
      .addFields(
        {
          name: msg("songrec.fieldChart"),
          value: msg("songrec.chartValue", { diff: r.diff, constant: r.level.toFixed(1), pool: r.isNew ? msg("songrec.newSong") : msg("songrec.oldSong") }),
          inline: true,
        },
        {
          name: msg("songrec.fieldTarget"),
          value: msg("songrec.targetValue", { rank: r.targetRank, ach: r.targetAch.toFixed(1) }),
          inline: true,
        },
        { name: "​", value: "​", inline: true },
        {
          name: msg("songrec.fieldSongRating"),
          value: msg("songrec.deltaValue", { from: r.currentRS, to: r.targetRS, delta: chartDelta }),
          inline: true,
        },
        {
          name: msg("songrec.fieldRating"),
          value: msg("songrec.deltaValue", { from: cached.rating, to: newRating, delta: r.ratingDelta }),
          inline: true,
        },
        { name: "​", value: "​", inline: true },
        { name: msg("songrec.fieldCurrent"), value: cur, inline: true },
      );
    if (peer && r.peerShare !== undefined) {
      emb.addFields({ name: msg("songrec.fieldPeer"), value: msg("songrec.peerValue", { band: bandLabel(peer.band), share: Math.round(r.peerShare * 100), rank: r.targetRank }), inline: true });
    }
    if (i === 0) emb.setAuthor({ name: peer ? msg("songrec.authorPeer") : msg("songrec.author") });
    if (peer && i === recs.length - 1) emb.setFooter({ text: msg("maishift.credit") });
    const jacket = r.jacketFile;
    if (jacket)
      emb.setThumbnail(jacketFileUrl(jacket));
    return emb;
  });

  await interaction.reply({ embeds });
}

/** /곡추천 레벨: — 같은 단계 플레이어들이 많이 깬, 아직 못 깬 보면 3개. */
async function replyNextClears(
  interaction: ChatInputCommandInteraction,
  server: MaimaiServer,
  clearRecords: PlayRecord[],
  level: string,
  criterion: ClearCriterion,
  opts: RecommendOptions,
  translate: boolean,
): Promise<void> {
  const clearMap = new Map(clearRecords.map((r) => [chartKey(r), r] as [string, PlayRecord]));
  const levelCharts = getRegionCharts(server).filter((c) => c.level === level);
  if (levelCharts.length === 0) {
    await interaction.reply({ content: msg("songrec.nextNoCandidates"), flags: MessageFlags.Ephemeral });
    return;
  }
  // 단계(0~4)는 그 레벨 전체 보면 중 기준을 넘은 비율로 정한다(필터와 상관없이).
  const cleared = levelCharts.filter((c) => meetsCriterion(clearMap.get(`${c.title}|${c.kind}|${c.diff}`), criterion)).length;
  const band = clearBandOf(cleared, levelCharts.length);
  const label = CRITERION_LABEL[criterion];
  if (cleared >= levelCharts.length) {
    await interaction.reply({ content: msg("songrec.nextAllCleared", { level, criterion: label }), flags: MessageFlags.Ephemeral });
    return;
  }
  const stats = await getClearRatios(server, level, criterion, band).catch(() => null);
  if (!stats) {
    await interaction.reply({ content: msg("songrec.nextNoStats"), flags: MessageFlags.Ephemeral });
    return;
  }
  if (stats.suppressed || !stats.charts.length) {
    await interaction.reply({ content: msg("songrec.nextSuppressed"), flags: MessageFlags.Ephemeral });
    return;
  }
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
  const picks = nextClears(filtered, clearMap, criterion, stats, 3);
  if (picks.length === 0) {
    await interaction.reply({ content: msg("songrec.nextNoCandidates"), flags: MessageFlags.Ephemeral });
    return;
  }
  const embeds = picks.map((p, i) => {
    const constant = getConstant(p.title, p.kind, p.diff, server) ?? p.constant;
    const cur = p.current && p.current.achievementVal > 0
      ? `${p.current.achievementVal.toFixed(4)}%${p.current.fc ? `  ✦  ${p.current.fc}` : ""}`
      : msg("songrec.notPlayed");
    const emb = new EmbedBuilder()
      .setColor(RANK_COLOR.SSS)
      .setTitle(titleWithKind(displayTitle(p.title, translate), p.kind))
      .setDescription(ytLink(p.title, p.kind, p.diff))
      .addFields(
        { name: msg("songrec.fieldChart"), value: msg("songrec.nextChartValue", { diff: p.diff, constant: constant.toFixed(1) }), inline: true },
        { name: msg("songrec.fieldCriterion"), value: `\`${label}\``, inline: true },
        { name: "​", value: "​", inline: true },
        { name: msg("songrec.fieldNextPeer"), value: msg("songrec.nextPeerValue", { share: Math.round(p.share * 100) }), inline: true },
        { name: msg("songrec.fieldCurrent"), value: cur, inline: true },
        { name: "​", value: "​", inline: true },
      );
    if (i === 0) {
      emb.setAuthor({ name: msg("songrec.nextAuthor", { level, criterion: label, cleared, total: levelCharts.length }) });
    }
    if (i === picks.length - 1) {
      emb.setFooter({ text: `${msg("songrec.nextFooter", { from: band * 20, to: band * 20 + 20, players: stats.players.toLocaleString("en-US") })}  ✦  ${msg("maishift.credit")}` });
    }
    const jacket = getJacketFile(p.title);
    if (jacket) emb.setThumbnail(jacketFileUrl(jacket));
    return emb;
  });
  await interaction.reply({ embeds });
}
