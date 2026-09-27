import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder,
  MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} from "discord.js";
import { getUserFriendCode, getUserSyncToken, getOptionSnapshots, listOptionPresets } from "../../storage";
import { getBaseUrl } from "../../web";
import { PORT } from "../../config";
import { msg } from "../../messages";
import { OPTION_PRESET_MAX } from "../../web/optionPreset";

// /게임설정: 웹 게임 설정 페이지(/options) 링크 안내. 적용은 웹/북마클릿에서 한다(봇은 DX NET 세션이 없다).
export const data = new SlashCommandBuilder()
  .setName("게임설정")
  .setDescription("maimai 게임 옵션과 옵션 프리셋 페이지 안내");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  if (!await getUserFriendCode(userId)) {
    await interaction.reply({ content: msg("common.selfNotRegistered"), flags: MessageFlags.Ephemeral });
    return;
  }
  const url = `${getBaseUrl(PORT)}/options?code=${await getUserSyncToken(userId)}`;
  const [snapshots, presets] = await Promise.all([getOptionSnapshots(userId), listOptionPresets(userId)]);
  const current = snapshots.length
    ? snapshots.map((s) => msg("gameOptions.currentLine", { server: s.server === "jp" ? "JP" : "INTERNATIONAL", time: `<t:${Math.floor(s.syncedAt / 1000)}:R>` })).join("\n")
    : msg("gameOptions.currentNone");
  const embed = new EmbedBuilder()
    .setTitle(msg("gameOptions.title"))
    .setColor(0xff9294)
    .setDescription(msg("gameOptions.description"))
    .addFields(
      { name: msg("gameOptions.currentField"), value: current },
      { name: msg("gameOptions.presetField"), value: msg("gameOptions.presetValue", { count: presets.length, max: OPTION_PRESET_MAX }) },
    );
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setLabel(msg("gameOptions.openButton")).setStyle(ButtonStyle.Link).setURL(url).setEmoji("🎮"),
  );
  await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
}
