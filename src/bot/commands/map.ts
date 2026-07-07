import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { getCachedProfile, getUserFriendCode } from "../../db";
import { mapAreaEmbed } from "../utils/embeds";

export const data = new SlashCommandBuilder()
  .setName("지방")
  .setDescription("내 maimai DX 지방 진행도 보기");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const friendCode = getUserFriendCode(interaction.user.id);
  if (!friendCode) {
    await interaction.reply({
      content: "아직 프로필이 등록되지 않았습니다. `/북마클릿` 명령어로 먼저 등록해주세요.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const cached = getCachedProfile(friendCode);
  if (!cached) {
    await interaction.reply({
      content: "아직 프로필이 등록되지 않았습니다. `/북마클릿` 명령어로 먼저 등록해주세요.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.reply({
    ...(await mapAreaEmbed(cached, interaction.user.id, 0)),
    flags: MessageFlags.Ephemeral,
  });
}
