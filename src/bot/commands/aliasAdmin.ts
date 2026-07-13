import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder,
  MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} from "discord.js";
import { getBaseUrl } from "../../web";
import { issueAdminToken } from "../../web/adminAuth";
import { CONFIG, PORT } from "../../config";

export const data = new SlashCommandBuilder()
  .setName("별명")
  .setDescription("곡 별명 관리 페이지 열기 (지정된 서버 전용)");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const adminGuildId = CONFIG.aliasAdminGuildId?.trim();
  if (!adminGuildId || interaction.guild?.id !== adminGuildId) {
    await interaction.reply({
      content: "이 명령어는 지정된 서버에서만 사용할 수 있습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const token = issueAdminToken();
  const url = `${getBaseUrl(PORT)}/admin/aliases?code=${token}`;
  const embed = new EmbedBuilder()
    .setTitle("🎵 곡 별명 관리")
    .setColor(0x9333ea)
    .setDescription(
      "아래 버튼으로 별명 관리 페이지를 엽니다.\n" +
      "곡을 선택해 별명을 추가·삭제할 수 있습니다.\n\n" +
      "⏳ 링크는 **60분** 후 만료됩니다. (본인만 사용하세요)",
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel("별명 관리 열기")
      .setStyle(ButtonStyle.Link)
      .setURL(url)
      .setEmoji("🎵"),
  );

  await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
}
