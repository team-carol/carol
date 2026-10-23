import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder,
  MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} from "discord.js";
import { getUserFriendCode, getStoredFriendCode, getUserSyncToken, getUserDefaultServer } from "../../storage";
import { getBaseUrl } from "../../web";
import { PORT } from "../../config";
import { msg } from "../../messages";

export const data = new SlashCommandBuilder()
  .setName("설정")
  .setDescription("웹 설정 페이지 안내");

async function buildSettingsContent(userId: string) {
  const baseUrl = getBaseUrl(PORT);
  const settingsUrl = `${baseUrl}/settings?code=${await getUserSyncToken(userId)}`;
  const termsUrl = `${baseUrl}/terms`;
  const server = await getUserDefaultServer(userId) === "jp" ? "JP" : "INTERNATIONAL";
  const embed = new EmbedBuilder()
    .setTitle(msg("settings.title"))
    .setColor(0x5865f2)
    .addFields(
      {
        name: msg("settings.currentServerField"),
        value: server,
      },
      {
        name: msg("settings.manageField"),
        value: msg("settings.manageBody"),
      },
      {
        name: msg("settings.termsField"),
        value: msg("settings.termsBody"),
      },
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel(msg("settings.openButton"))
      .setStyle(ButtonStyle.Link)
      .setURL(settingsUrl)
      .setEmoji("⚙️"),
    new ButtonBuilder()
      .setLabel(msg("settings.termsButton"))
      .setStyle(ButtonStyle.Link)
      .setURL(termsUrl)
      .setEmoji("📄"),
  );

  return { embeds: [embed], components: [row] };
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  // 설정 페이지는 maishift 를 연동했거나 캐롤봇 북마클릿을 쓴 적이 있으면 연다.
  if (!await getUserFriendCode(interaction.user.id) && !await getStoredFriendCode(interaction.user.id)) {
    await interaction.reply({
      content: msg("common.selfNotRegistered"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.reply({ ...await buildSettingsContent(interaction.user.id), flags: MessageFlags.Ephemeral });
}
