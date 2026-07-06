import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, MessageFlags,
} from "discord.js";
import { getCachedProfile, getUserFriendCode, getProfilePrivate } from "../../db";
import { getClearList } from "../utils/embeds";
import {
  getChartsInConstantRange, getJacketFile, isIntlAvailable,
  getSongGenre, GENRES, getSongVersionName, VERSION_NAMES, isSongPlus,
} from "../../constants";
import { chartKey } from "../../scraper";

const MAI_DIFF_COLOR: Record<string, number> = {
  BASIC: 0x16a34a, ADVANCED: 0xea580c, EXPERT: 0xdc2626,
  MASTER: 0x9333ea, "Re:MASTER": 0xc084fc,
};

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const data = new SlashCommandBuilder()
  .setName("랜덤")
  .setDescription("조건에 맞는 곡을 랜덤 추천")
  .addNumberOption((o) =>
    o.setName("범위최소").setDescription("최소 상수 (예: 14.0, 생략 시 하한 없음)").setRequired(false)
      .setMinValue(1.0).setMaxValue(15.0),
  )
  .addNumberOption((o) =>
    o.setName("범위최대").setDescription("최대 상수 (예: 14.7, 생략 시 상한 없음)").setRequired(false)
      .setMinValue(1.0).setMaxValue(15.0),
  )
  .addStringOption((o) =>
    o.setName("타입").setDescription("채보 타입 (Optional)").setRequired(false)
      .addChoices({ name: "STANDARD", value: "ST" }, { name: "DX", value: "DX" }),
  )
  .addStringOption((o) =>
    o.setName("난이도").setDescription("난이도 (Optional)").setRequired(false)
      .addChoices(
        { name: "BASIC", value: "BASIC" },
        { name: "ADVANCED", value: "ADVANCED" },
        { name: "EXPERT", value: "EXPERT" },
        { name: "MASTER", value: "MASTER" },
        { name: "Re:MASTER", value: "Re:MASTER" },
      ),
  )
  .addStringOption((o) =>
    o.setName("장르").setDescription("장르 (Optional)").setRequired(false)
      .addChoices(...GENRES.map((g) => ({ name: g, value: g }))),
  )
  .addStringOption((o) =>
    o.setName("버전").setDescription("수록 버전 (Optional)").setRequired(false)
      .addChoices(...VERSION_NAMES.map((v) => ({ name: v, value: v }))),
  )
  .addStringOption((o) =>
    o.setName("plus").setDescription("PLUS 여부 (버전 선택 시에만 적용)").setRequired(false)
      .addChoices({ name: "무인판", value: "base" }, { name: "PLUS", value: "plus" }),
  )
  .addStringOption((o) =>
    o.setName("플레이여부").setDescription("Y=친 곡 / N=안 친 곡 (Optional)").setRequired(false)
      .addChoices({ name: "Y (플레이)", value: "Y" }, { name: "N (미플레이)", value: "N" }),
  )
  .addIntegerOption((o) =>
    o.setName("개수").setDescription("개수 (1~5, 기본 3)").setRequired(false)
      .setMinValue(1).setMaxValue(5),
  )
  .addUserOption((o) =>
    o.setName("user").setDescription("플레이여부 조회 대상 (생략 시 본인)").setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const minC = interaction.options.getNumber("범위최소");
  const maxC = interaction.options.getNumber("범위최대");
  const typeOpt = interaction.options.getString("타입");
  const diffOpt = interaction.options.getString("난이도");
  const genreOpt = interaction.options.getString("장르");
  const verOpt = interaction.options.getString("버전");
  // 버전 선택 시 plus 미지정이면 무인판만 (기본 "base"). 버전 미선택 시 plus 무시.
  const plusOpt = verOpt ? (interaction.options.getString("plus") ?? "base") : null;
  const playOpt = interaction.options.getString("플레이여부");
  const count = interaction.options.getInteger("개수") ?? 3;

  // 상수 범위. 하한/상한 미지정 시 각각 제한 없음.
  let lo = minC ?? 0;
  let hi = maxC ?? 99;
  if (lo > hi) [lo, hi] = [hi, lo];
  const rangeLabel =
    minC == null && maxC == null ? "전체"
    : minC != null && maxC != null ? `${minC.toFixed(1)}~${maxC.toFixed(1)}`
    : minC != null ? `${minC.toFixed(1)}↑`
    : `${(maxC as number).toFixed(1)}↓`;

  // 플레이여부 지정 시에만 프로필(clearJson) 필요
  let clearMap: Map<string, ReturnType<typeof getClearList>[number]> | null = null;
  if (playOpt) {
    const target = interaction.options.getUser("user") ?? interaction.user;
    if (target.id !== interaction.user.id && getProfilePrivate(target.id)) {
      await interaction.reply({ content: `<@${target.id}> 님은 프로필을 비공개로 설정했습니다.`, flags: MessageFlags.Ephemeral });
      return;
    }
    const fc = getUserFriendCode(target.id);
    const cached = fc ? getCachedProfile(fc) : null;
    if (!cached) {
      const msg = target.id === interaction.user.id
        ? "플레이여부 필터는 프로필이 필요합니다. `/북마클릿`으로 먼저 등록해주세요."
        : `<@${target.id}> 님은 아직 프로필을 등록하지 않았습니다.`;
      await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
      return;
    }
    clearMap = new Map(getClearList(cached).map((r) => [chartKey(r), r]));
  }

  // 후보 = 상수 범위 · 국제판 수록 · 타입/장르/플레이여부 필터
  const candidates = getChartsInConstantRange(lo, hi).filter((c) => {
    if (!isIntlAvailable(c.title)) return false;
    if (typeOpt && c.kind !== typeOpt) return false;
    if (diffOpt && c.diff !== diffOpt) return false;
    if (genreOpt && getSongGenre(c.title) !== genreOpt) return false;
    if (verOpt && getSongVersionName(c.title) !== verOpt) return false;
    if (plusOpt && isSongPlus(c.title) !== (plusOpt === "plus")) return false;
    if (playOpt) {
      const played = clearMap!.has(`${c.title}|${c.kind}|${c.diff}`);
      if (playOpt === "Y" && !played) return false;
      if (playOpt === "N" && played) return false;
    }
    return true;
  });

  if (candidates.length === 0) {
    await interaction.reply({ content: "조건에 맞는 곡이 없습니다.", flags: MessageFlags.Ephemeral });
    return;
  }

  const picks = shuffle(candidates).slice(0, count);
  const header = [
    "랜덤",
    rangeLabel === "전체" ? "전 상수" : `상수 ${rangeLabel}`,
    typeOpt || undefined,
    diffOpt || undefined,
    genreOpt || undefined,
    verOpt ? verOpt + (plusOpt === "plus" ? " PLUS" : plusOpt === "base" ? " (무인)" : "") : undefined,
  ].filter(Boolean).join("  ·  ");
  const embeds = picks.map((c, i) => {
    const rec = clearMap?.get(`${c.title}|${c.kind}|${c.diff}`);
    const ytQuery = encodeURIComponent(
      `maimai ${c.title} ${c.kind} ${c.diff} 外部出力`.replace(/\s+/g, " ").trim(),
    );
    const ytUrl = `https://www.youtube.com/results?search_query=${ytQuery}`;
    const emb = new EmbedBuilder()
      .setColor(MAI_DIFF_COLOR[c.diff] ?? 0x9333ea)
      .setTitle(`${c.title} [${c.kind}]`)
      .setDescription(`[▶ 외부출력](${ytUrl})`)
      .addFields(
        { name: "채보", value: `\`${c.diff}\`  ·  상수 \`${c.level.toFixed(1)}\``, inline: true },
      );
    if (rec) {
      const ach = rec.achievementVal > 0 ? rec.achievementVal.toFixed(4) + "%" : rec.achievement;
      emb.addFields({ name: "내 기록", value: `${ach}${rec.fc ? "  ·  " + rec.fc : ""}`, inline: true });
    }
    if (i === 0) emb.setAuthor({ name: header });
    const jacket = getJacketFile(c.title);
    if (jacket) emb.setThumbnail(`https://otoge-db.net/maimai/jacket/${jacket}`);
    return emb;
  });

  await interaction.reply({ embeds });
}
