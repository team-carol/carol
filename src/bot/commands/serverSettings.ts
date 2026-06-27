import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder,
  MessageFlags, PermissionsBitField, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, ButtonInteraction,
} from "discord.js";
import { getGuildSetting, setGuildSetting } from "../../db";

export const data = new SlashCommandBuilder()
  .setName("서버설정")
  .setDescription("서버 설정 관리 (관리자 전용)");

function buildSettingsContent(guildId: string) {
  const autoRole = getGuildSetting(guildId);
  const embed = new EmbedBuilder()
    .setTitle("⚙️ 서버 설정")
    .setColor(0x5865f2)
    .addFields({ name: "자동 역할 부여", value: autoRole ? "✅ 활성화" : "❌ 비활성화" });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("serverset:autorole:on")
      .setLabel("활성화")
      .setStyle(autoRole ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(autoRole),
    new ButtonBuilder()
      .setCustomId("serverset:autorole:off")
      .setLabel("비활성화")
      .setStyle(!autoRole ? ButtonStyle.Danger : ButtonStyle.Secondary)
      .setDisabled(!autoRole),
  );

  return { embeds: [embed], components: [row] };
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "서버에서만 사용 가능합니다.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
    await interaction.reply({ content: "서버 관리자만 사용 가능합니다.", flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.reply({ ...buildSettingsContent(interaction.guild.id), flags: MessageFlags.Ephemeral });
}

export async function handleButton(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guild) return;
  const parts = interaction.customId.split(":");
  setGuildSetting(interaction.guild.id, parts[2] === "on");
  await interaction.update(buildSettingsContent(interaction.guild.id));
}
