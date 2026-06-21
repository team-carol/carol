import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, MessageFlags, ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import { getUserSyncToken } from "../db";
import { getBaseUrl } from "../web";
import { PORT } from "../config";

export const data = new SlashCommandBuilder()
  .setName("북마클릿")
  .setDescription("프로필 동기화용 북마클릿 설치 가이드");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const token = getUserSyncToken(interaction.user.id);
  const guideUrl = `${getBaseUrl(PORT)}/sync?code=${token}`;
  const btn = new ButtonBuilder()
    .setLabel("설치 가이드 열기")
    .setStyle(ButtonStyle.Link)
    .setURL(guideUrl)
    .setEmoji("🔖");
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(btn);
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle("🔖 북마클릿 설치")
        .setColor(0x888888)
        .setDescription(
          `아래 버튼을 눌러 설치 가이드 페이지를 여세요.\n\n` +
          `**PC** — 초록색 링크를 북마크바로 드래그\n` +
          `**모바일** — 복사 버튼 → 북마크에 붙여넣기`,
        ),
    ],
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}
