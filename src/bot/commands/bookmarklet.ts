import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from "discord.js";
import { getUserSyncToken } from "../../storage";
import { getBaseUrl } from "../../web";
import { PORT } from "../../config";
import { msg } from "../../messages";

export const data = new SlashCommandBuilder()
  .setName("북마클릿")
  .setDescription("캐롤봇 추가 북마클릿(서클·지방·게임 설정) 설치 가이드");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const token = await getUserSyncToken(interaction.user.id);
  const guideUrl = `${getBaseUrl(PORT)}/sync?code=${token}`;
  const btn = new ButtonBuilder()
    .setLabel(msg("bookmarklet.openButton"))
    .setStyle(ButtonStyle.Link)
    .setURL(guideUrl)
    .setEmoji("🔖");
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(btn);
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle(msg("bookmarklet.title"))
        .setColor(0x888888)
        .setDescription(msg("bookmarklet.body")),
    ],
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}
