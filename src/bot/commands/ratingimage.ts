import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags, AttachmentBuilder } from "discord.js";
import { getCachedProfile, getUserFriendCode, getAvatarBlob, getProfilePrivate } from "../../db";
import { getTopList } from "../utils/embeds";
import { renderRatingCard } from "../utils/ratingCard";

export const data = new SlashCommandBuilder()
  .setName("레이팅표")
  .setDescription("레이팅 대상곡을 이미지로 표시 (생략 시 본인)")
  .addUserOption((opt) =>
    opt.setName("user").setDescription("조회할 유저 (생략 시 본인)").setRequired(false),
  );

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
  const records = getTopList(cached);
  if (records.length === 0) {
    await interaction.reply({ content: "레이팅 기록이 없습니다. 북마클릿을 다시 실행하세요.", flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply();
  try {
    const png = await renderRatingCard(cached, records, getAvatarBlob(userId));
    await interaction.editReply({
      files: [new AttachmentBuilder(png, { name: "rating.png" })],
    });
  } catch (e) {
    console.error("[레이팅이미지]", e);
    await interaction.editReply({ content: "이미지 생성에 실패했습니다." }).catch(() => {});
  }
}
