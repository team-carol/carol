import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import {
  getCachedProfile,
  getUserFriendCode,
  getProfilePrivate,
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
} from "../../constants";
import { chartKey } from "../../scraper";
import type { PlayRecord, MaimaiServer } from "../../scraper";

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
}

// 기본 플레이:미플레이 목표 비율 (필터 미지정 시)
const TARGET_PLAYED = 0.6;
const TARGET_UNPLAYED = 0.4;

// clearJson 기반으로 레이팅이 오를 채보 count개를 추천
export function recommendCharts(
  clearRecords: PlayRecord[],
  count = 3,
  opts: RecommendOptions = {},
  server: MaimaiServer = "intl",
): Recommendation[] {
  if (clearRecords.length === 0) return [];

  // 서버별 신곡 하한이 다르므로(내수판=CiRCLE PLUS) 신곡 판정에 server를 고정한다.
  const isNewTitle = (title: string) => isNewSong(title, server);

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
    if (isNewTitle(r.title)) newRSs.push(rs);
    else oldRSs.push(rs);
  }
  if (topC <= 0) return [];

  newRSs.sort((a, b) => b - a);
  oldRSs.sort((a, b) => b - a);
  const newFloor = newRSs.length >= 15 ? newRSs[14] : 0; // 신곡 15위 컷라인
  const oldFloor = oldRSs.length >= 35 ? oldRSs[34] : 0; // 구곡 35위 컷라인

  const upperBound = topC + ceilingOffset(topC);

  // 후보 선별
  type Candidate = {
    title: string;
    kind: "ST" | "DX";
    diff: string;
    level: number;
    currentAch: number;
    currentRS: number;
    fc: string;
    played: boolean;
    minTarget: (typeof RANKS)[number]; // 점수를 먹기 시작하는 최소 랭크
  };
  const candidates: Candidate[] = [];
  for (const chart of getChartsUnderConstant(upperBound)) {
    if (!isIntlAvailable(chart.title)) continue; // 국제판 미수록 곡 제외
    if (opts.kind && chart.kind !== opts.kind) continue; // ST/DX 필터
    if (opts.diff && chart.diff !== opts.diff) continue; // 난이도 필터
    const isNew = isNewTitle(chart.title);
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
      minTarget: validTargets[0], // 유효 목표 중 가장 낮은 랭크 = 최소 목표
    });
  }

  // 곡 가중 = DX 2배 × 최소목표 가중(SSS~SSS+가 SS/SS+보다 더 자주 뽑히도록)
  const chartWeight = (c: Candidate) =>
    (c.kind === "DX" ? 2 : 1) * c.minTarget.weight;

  // 가중 추출 (비복원). 위 가중 + 플레이:미플레이 그룹 목표 비율(60:40) 정규화.
  const pool = candidates.slice();
  const chosen: Recommendation[] = [];
  while (chosen.length < count && pool.length > 0) {
    let sumPlayed = 0;
    let sumUnplayed = 0;
    for (const c of pool) {
      if (c.played) sumPlayed += chartWeight(c);
      else sumUnplayed += chartWeight(c);
    }
    const pick = weightedPick(
      pool.map((c) => {
        const groupSum = c.played ? sumPlayed : sumUnplayed;
        const groupTarget = c.played ? TARGET_PLAYED : TARGET_UNPLAYED;
        return {
          item: c,
          weight: groupSum > 0 ? (groupTarget * chartWeight(c)) / groupSum : 0,
        };
      }),
    );
    pool.splice(pool.indexOf(pick), 1);
    const target = pick.minTarget; // 최소 목표를 그대로 표시
    const targetRS = calcSongRating(target.ach, pick.level, pick.fc);
    // 실제 총 레이팅 변화: 이 채보가 이미 대상이면 현재RS를, 아니면 컷라인을 밀어냄
    const floor = isNewTitle(pick.title) ? newFloor : oldFloor;
    const ratingDelta = targetRS - Math.max(pick.currentRS, floor);
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
      isNew: isNewTitle(pick.title),
      jacketFile: getJacketFile(pick.title),
    });
  }
  return chosen;
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
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const target = interaction.options.getUser("user") ?? interaction.user;
  const userId = target.id;
  if (target.id !== interaction.user.id && await getProfilePrivate(target.id)) {
    await interaction.reply({
      content: `<@${target.id}> 님은 프로필을 비공개로 설정했습니다.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const friendCode = await getUserFriendCode(userId);
  const cached = friendCode ? await getCachedProfile(friendCode) : null;
  if (!cached) {
    const msg =
      target.id === interaction.user.id
        ? "아직 프로필이 등록되지 않았습니다. `/북마클릿` 명령어로 먼저 등록해주세요."
        : `<@${target.id}> 님은 아직 프로필을 등록하지 않았습니다.`;
    await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
    return;
  }

  const clearRecords = getClearList(cached);
  if (clearRecords.length === 0) {
    await interaction.reply({
      content: "기록이 없습니다. `/북마클릿`으로 먼저 동기화해주세요.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const kindOpt = interaction.options.getString("type");
  const playOpt = interaction.options.getString("플레이여부");
  const diffOpt = interaction.options.getString("난이도");
  const catOpt = interaction.options.getString("곡분류");
  const recs = recommendCharts(clearRecords, 3, {
    kind: kindOpt === "ST" || kindOpt === "DX" ? kindOpt : undefined,
    play: playOpt === "played" || playOpt === "unplayed" ? playOpt : undefined,
    diff: diffOpt ?? undefined,
    category: catOpt === "new" || catOpt === "others" ? catOpt : undefined,
  }, cached.server);
  if (recs.length === 0) {
    await interaction.reply({
      content: "추천할 채보를 찾지 못했습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const translate = await getTranslateTitles(interaction.user.id);
  const embeds = recs.map((r, i) => {
    const chartDelta = r.targetRS - r.currentRS;
    const cur = r.currentAch > 0 ? `${r.currentAch.toFixed(4)}%` : "미플레이";
    const newRating = cached.rating + r.ratingDelta;
    // 유튜브 외부출력 검색: "maimai {곡명} {ST/DX} {난이도} 外部出力"
    const ytQuery = encodeURIComponent(
      `maimai ${r.title} ${r.kind} ${r.diff} 外部出力`
        .replace(/\s+/g, " ")
        .trim(),
    );
    const ytUrl = `https://www.youtube.com/results?search_query=${ytQuery}`;
    const emb = new EmbedBuilder()
      .setColor(RANK_COLOR[r.targetRank] ?? 0x9333ea)
      .setTitle(`${displayTitle(r.title, translate)} [${r.kind}]`)
      .setDescription(`[▶ 외부출력](${ytUrl})`)
      .addFields(
        {
          name: "채보",
          value: `\`${r.diff}\`  ·  상수 \`${r.level.toFixed(1)}\`  ·  ${r.isNew ? "신곡" : "구곡"}`,
          inline: true,
        },
        {
          name: "목표",
          value: `\`${r.targetRank}\` (${r.targetAch.toFixed(1)}%+)`,
          inline: true,
        },
        { name: "​", value: "​", inline: true },
        {
          name: "곡 점수",
          value: `${r.currentRS} → **${r.targetRS}** (+${chartDelta})`,
          inline: true,
        },
        {
          name: "예상 레이팅",
          value: `${cached.rating} → **${newRating}** (+${r.ratingDelta})`,
          inline: true,
        },
        { name: "​", value: "​", inline: true },
        { name: "현재", value: cur, inline: true },
      );
    if (i === 0) emb.setAuthor({ name: "레이팅 대상곡에 따른 곡 추천" });
    const jacket = r.jacketFile;
    if (jacket)
      emb.setThumbnail(`https://otoge-db.net/maimai/jacket/${jacket}`);
    return emb;
  });

  await interaction.reply({ embeds });
}
