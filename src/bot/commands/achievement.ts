import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags, AttachmentBuilder } from "discord.js";
import { getAvatarBlob, getCachedProfile, getDailyAchievementSnapshots, getProfilePrivate, getUserFriendCode, getTranslateTitles } from "../../db";
import { attachAchievementGains, koreaPlayDayKey, parseDailyAchievementRows } from "../../achievements";
import { renderAchievementCard } from "../utils/achievementCard";

export const data = new SlashCommandBuilder()
  .setName("성과")
  .setDescription("새롭게 달성한 스코어를 이미지로 표시 (한국시간 오전 4시 기준)")
  .addUserOption((opt) =>
    opt.setName("user").setDescription("조회할 유저 (생략 시 본인)").setRequired(false),
  )
  .addStringOption((opt) =>
    opt
      .setName("date")
      .setDescription("조회할 날짜 (YYYY-MM-DD, 생략 시 오늘)")
      .setRequired(false),
  );

function isPlayDayKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser("user") ?? interaction.user;
  const userId = target.id;
  if (target.id !== interaction.user.id && getProfilePrivate(target.id)) {
    await interaction.reply({ content: `<@${target.id}> 님은 프로필을 비공개로 설정했습니다.`, flags: MessageFlags.Ephemeral });
    return;
  }
  const friendCode = getUserFriendCode(userId);
  const cached = friendCode ? getCachedProfile(friendCode) : null;
  if (!cached) {
    const msg = target.id === interaction.user.id
      ? "아직 프로필이 등록되지 않았습니다. `/북마클릿` 명령어로 먼저 등록해주세요."
      : `<@${target.id}> 님은 아직 프로필을 등록하지 않았습니다.`;
    await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
    return;
  }

  try {
    const requestedDay = interaction.options.getString("date") ?? "";
    const playDay = requestedDay && isPlayDayKey(requestedDay)
      ? requestedDay
      : koreaPlayDayKey(new Date());
    const records = attachAchievementGains(cached.profileKey, parseDailyAchievementRows(getDailyAchievementSnapshots(cached.profileKey, playDay)));
    if (records.length === 0) {
      await interaction.reply({
        content: requestedDay
          ? `${playDay}에 기록된 스코어가 없습니다.`
          : "오늘 기록된 스코어가 없습니다.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.deferReply();
    const png = await renderAchievementCard(cached, records, playDay, getAvatarBlob(userId, cached.server), getTranslateTitles(interaction.user.id));
    await interaction.editReply({
      files: [new AttachmentBuilder(png, { name: `achievement-${playDay}.png` })],
    });
  } catch (e) {
    console.error("[성과]", e);
    await interaction.editReply({ content: "성과 이미지 생성에 실패했습니다." }).catch(() => {});
  }
}
