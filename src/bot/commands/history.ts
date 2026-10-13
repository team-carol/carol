import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags, AttachmentBuilder } from "discord.js";
import { getCachedProfile, getUserFriendCode } from "../../storage";
import { loadAvatar } from "../utils/embeds";
import { renderHistoryCard } from "../utils/historyCard";
import { historyPeriodDays, maishiftSeries, HISTORY_PERIODS, type HistoryPeriod } from "../../ratingHistory";
import { ratingMilestones, playMilestones } from "../../historyStats";
import { versionName } from "../../maishift/catalog";
import { calcSongRating } from "../../constants";
import { msg } from "../../messages";

// /히스토리: maishift 히스토리(업로드마다의 레이팅·플레이 횟수)를 기간을 골라 이미지로.
// maishift 히스토리 내보내기 그림과 같은 정보(그래프·달성 기록·버전 주차)를 담는다.
export const data = new SlashCommandBuilder()
  .setName("히스토리")
  .setDescription("레이팅·플레이 횟수 히스토리 (maishift)")
  .addUserOption((opt) => opt.setName("user").setDescription("조회할 유저 (생략 시 본인)").setRequired(false))
  .addStringOption((opt) =>
    opt.setName("기간").setDescription("보여 줄 기간 (기본: 전체)").setRequired(false)
      .addChoices(
        { name: "전체", value: "all" },
        { name: "현재 버전", value: "version" },
        { name: "1년", value: "365" },
        { name: "6개월", value: "182" },
        { name: "3개월", value: "91" },
        { name: "1개월", value: "30" },
        { name: "2주", value: "14" },
        { name: "1주", value: "7" },
      ),
  );

// 이론상 최대 레이팅(15.0 보면을 101% AP+) × 50. 레이팅 달성 기록 기준값의 상한.
const MAX_RATING = calcSongRating(101, 15.0, "AP+") * 50;

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser("user") ?? interaction.user;
  const self = target.id === interaction.user.id;
  const notRegistered = self ? msg("common.selfNotRegistered") : msg("common.otherNotRegistered", { user: `<@${target.id}>` });
  const friendCode = await getUserFriendCode(target.id);
  if (!friendCode) {
    await interaction.reply({ content: notRegistered, flags: MessageFlags.Ephemeral });
    return;
  }
  const raw = interaction.options.getString("기간") ?? "all";
  const period: HistoryPeriod = (HISTORY_PERIODS as readonly string[]).includes(raw) ? (raw as HistoryPeriod) : "all";

  await interaction.deferReply();
  const cached = await getCachedProfile(friendCode);
  if (!cached) {
    await interaction.editReply({ content: notRegistered });
    return;
  }
  const history = cached.maishiftHistory ?? [];
  if (!history.length) {
    await interaction.editReply({ content: msg("history.empty") });
    return;
  }
  try {
    const versions = cached.maishiftVersions ?? [];
    const names = new Map(versions.map((v) => [v.id, v.name]));
    const days = historyPeriodDays(history, versions, period);
    const { points, plays, updates } = maishiftSeries(history, days, (id) => names.get(id) ?? versionName(id));
    const last = history[history.length - 1];
    const png = await renderHistoryCard(cached, await loadAvatar(target.id, cached), {
      periodLabel: msg(`history.period.${period}`),
      days, points, plays, updates, versions,
      ratingMilestones: ratingMilestones(history, MAX_RATING, last.at),
      playMilestones: playMilestones(history, last.playTotal, last.at),
      lastAt: last.at,
      lastVersionId: last.versionId,
    });
    await interaction.editReply({ files: [new AttachmentBuilder(png, { name: "history.png" })] });
  } catch (e) {
    console.error("[history]", e);
    await interaction.editReply({ content: msg("history.failed") });
  }
}
