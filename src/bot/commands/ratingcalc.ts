import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { getUserFriendCode, getCachedProfile } from "../../storage";
import { getClearList } from "../utils/embeds";
import { calcSongRating, getConstant, isNewSong, levelToNumber } from "../../constants";
import { getScoreRank } from "../../games";
import { msg } from "../../messages";

const NEW_CAP = 15;
const OLD_CAP = 35;

/** 정렬된(내림차순) RS 목록에 rs 하나를 새로 넣었을 때 그 풀의 합계 증가분. */
function poolDelta(sortedRs: number[], cap: number, rs: number): number {
  if (sortedRs.length < cap) return rs;        // 풀이 안 찼으면 그대로 더해진다
  const cutoff = sortedRs[cap - 1];            // 현재 반영되는 최저 RS
  return Math.max(0, rs - cutoff);
}

export const data = new SlashCommandBuilder()
  .setName("레이팅계산기")
  .setDescription("상수와 달성률로 곡 레이팅과 총합 레이팅 변화를 계산")
  .addNumberOption((o) =>
    o.setName("상수").setDescription("보면정수 (예: 13.5)").setRequired(true),
  )
  .addNumberOption((o) =>
    o.setName("달성률").setDescription("달성률 % (예: 100.5)").setRequired(true)
      .setMinValue(0).setMaxValue(101),
  )
  .addBooleanOption((o) =>
    o.setName("ap").setDescription("올퍼펙트(AP/AP+) 여부 — 곡 레이팅 +1").setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const constant = interaction.options.getNumber("상수", true);
  const ach = interaction.options.getNumber("달성률", true);
  const ap = interaction.options.getBoolean("ap") ?? false;

  const songRating = calcSongRating(ach, constant, ap ? "AP" : undefined);
  const rank = getScoreRank(ach);

  const emb = new EmbedBuilder()
    .setTitle(msg("ratingcalc.title"))
    .setColor(0x9333ea)
    .addFields(
      { name: msg("ratingcalc.inputField"), value: `\`${constant.toFixed(1)}\`  ·  \`${ach.toFixed(4)}%\` (${rank})${ap ? "  ·  AP" : ""}`, inline: false },
      { name: msg("ratingcalc.songRatingField"), value: `**${songRating}**`, inline: false },
    );

  // 총합 변화는 등록된 프로필의 현재 베스트 50(신곡 15 + 구곡 35)을 기준으로 계산한다.
  const friendCode = await getUserFriendCode(interaction.user.id);
  const cached = friendCode ? await getCachedProfile(friendCode) : null;
  if (!cached) {
    emb.addFields({ name: msg("ratingcalc.totalField"), value: msg("ratingcalc.noProfile"), inline: false });
    await interaction.reply({ embeds: [emb] });
    return;
  }

  const server = cached.server;
  const rated = getClearList(cached)
    .filter((r) => r.achievementVal > 0)
    .map((r) => {
      const c = getConstant(r.title, r.musicKind, r.diff, server) ?? levelToNumber(r.level);
      return { rs: calcSongRating(r.achievementVal, c, r.fc), isNew: isNewSong(r.title, server) };
    });
  const newRs = rated.filter((x) => x.isNew).map((x) => x.rs).sort((a, b) => b - a);
  const oldRs = rated.filter((x) => !x.isNew).map((x) => x.rs).sort((a, b) => b - a);
  const sum = (arr: number[], cap: number) => arr.slice(0, cap).reduce((a, b) => a + b, 0);
  const currentTotal = sum(newRs, NEW_CAP) + sum(oldRs, OLD_CAP);

  const deltaNew = poolDelta(newRs, NEW_CAP, songRating);
  const deltaOld = poolDelta(oldRs, OLD_CAP, songRating);
  const fmt = (d: number) => (d > 0 ? `+${d} → **${currentTotal + d}**` : msg("ratingcalc.noChange"));

  emb.addFields(
    { name: msg("ratingcalc.currentField"), value: `**${currentTotal}**`, inline: false },
    { name: msg("ratingcalc.asNewField"), value: fmt(deltaNew), inline: true },
    { name: msg("ratingcalc.asOldField"), value: fmt(deltaOld), inline: true },
  );
  emb.setFooter({ text: msg("ratingcalc.footer") });

  await interaction.reply({ embeds: [emb] });
}
