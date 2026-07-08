import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { getCachedProfile, getUserFriendCode, getProfilePrivate } from "../../db";
import { buildProfileReply } from "../utils/embeds";
import { autoRole } from "../utils/roles";

export const data = new SlashCommandBuilder()
  .setName("프로필")
  .setDescription("maimai DX 프로필 보기 (생략 시 본인)")
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
  if (friendCode) {
    const cached = getCachedProfile(friendCode);
    if (cached) {
      await interaction.reply(buildProfileReply(cached, userId));
      if (target.id === interaction.user.id) autoRole(interaction, cached.rating);
      return;
    }
  }
  const msg = target.id === interaction.user.id
    ? "아직 프로필이 등록되지 않았습니다. `/북마클릿` 명령어로 먼저 등록해주세요."
    : `<@${target.id}> 님은 아직 프로필을 등록하지 않았습니다.`;
  await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
}
