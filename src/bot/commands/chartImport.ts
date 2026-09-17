// 운영자용 simai wiki 채보 등록 진입점. 관리 서버에서만 쓰며, 12시간 토큰을 발급해
// /admin/import 설치 페이지 링크를 준다. 실제 수집은 그 페이지의 북마클릿이 한다.
import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder,
  MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} from "discord.js";
import { getBaseUrl } from "../../web";
import { issueAdminToken } from "../../web/adminAuth";
import { CONFIG, PORT } from "../../config";
import { msg } from "../../messages";

const IMPORT_TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 크롤이 길어 12시간

export const data = new SlashCommandBuilder()
  .setName("채보가져오기")
  .setDescription("simai wiki 채보를 DB로 가져오는 북마클릿 열기 (지정된 서버 전용)");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const adminGuildId = CONFIG.aliasAdminGuildId?.trim();
  if (!adminGuildId || interaction.guild?.id !== adminGuildId) {
    await interaction.reply({ content: msg("common.adminGuildOnly"), flags: MessageFlags.Ephemeral });
    return;
  }
  const token = issueAdminToken(IMPORT_TOKEN_TTL_MS);
  const url = `${getBaseUrl(PORT)}/admin/import?code=${token}`;
  const embed = new EmbedBuilder()
    .setTitle(msg("chartImport.embedTitle"))
    .setColor(0x9333ea)
    .setDescription(msg("chartImport.embedBody"));
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setLabel(msg("chartImport.buttonLabel")).setStyle(ButtonStyle.Link).setURL(url).setEmoji("📥"),
  );
  await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
}
