import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder,
  MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} from "discord.js";
import { getBaseUrl } from "../../web";
import { issueAdminToken } from "../../web/adminAuth";
import { CONFIG, PORT } from "../../config";
import { msg } from "../../messages";
import { color as BRAND, toInt } from "@team-carol/design-system";

// 별명 관리와 문구 관리를 한 페이지(탭)로 합친 관리자 명령.
export const data = new SlashCommandBuilder()
  .setName("관리")
  .setDescription("곡 별명·봇 문구 관리 페이지 열기 (지정된 서버 전용)");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const adminGuildId = CONFIG.aliasAdminGuildId?.trim();
  if (!adminGuildId || interaction.guild?.id !== adminGuildId) {
    await interaction.reply({
      content: msg("common.adminGuildOnly"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const token = issueAdminToken();
  const url = `${getBaseUrl(PORT)}/admin?code=${token}`;
  const embed = new EmbedBuilder()
    .setTitle(msg("admin.embedTitle"))
    .setColor(toInt(BRAND.accent))
    .setDescription(msg("admin.embedBody"));

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel(msg("admin.buttonLabel"))
      .setStyle(ButtonStyle.Link)
      .setURL(url)
      .setEmoji("🛠"),
  );

  await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
}
