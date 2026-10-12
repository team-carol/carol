import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { getCachedProfile, getUserFriendCode } from "../../storage";
import { mapAreaEmbed, getMapAreaList } from "../utils/embeds";
import { msg } from "../../messages";

export const data = new SlashCommandBuilder()
  .setName("지방")
  .setDescription("내 maimai DX 지방 진행도 보기");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const friendCode = await getUserFriendCode(interaction.user.id);
  if (!friendCode) {
    await interaction.reply({
      content: msg("common.selfNotRegistered"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const cached = await getCachedProfile(friendCode);
  if (!cached) {
    await interaction.reply({
      content: msg("common.selfNotRegistered"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // 지방 진행도는 캐롤봇 추가 북마클릿이 모은다. 없으면 등록을 안내한다.
  if (!getMapAreaList(cached).length) {
    await interaction.reply({ content: msg("common.needCarolBookmarklet"), flags: MessageFlags.Ephemeral });
    return;
  }

  // mapAreaEmbed 는 지역 이미지 fetch + 렌더라 3초 ack 한계를 넘길 수 있다. 먼저 defer.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await interaction.editReply(await mapAreaEmbed(cached, interaction.user.id, 0));
}
