import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder,
  MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ButtonInteraction,
} from "discord.js";
import { getProfilePrivate, setProfilePrivate, getUserFriendCode } from "../../db";

export const data = new SlashCommandBuilder()
  .setName("설정")
  .setDescription("개인 설정 (프로필 공개 여부)");

function buildSettingsContent(userId: string) {
  const isPrivate = getProfilePrivate(userId);
  const embed = new EmbedBuilder()
    .setTitle("🔒 개인 설정")
    .setColor(0x5865f2)
    .addFields({
      name: "프로필 공개 여부",
      value: isPrivate
        ? "🔒 **비공개** — 다른 사람이 내 프로필/검색/레이팅표를 조회할 수 없습니다."
        : "🌐 **공개** — 다른 사람이 내 프로필을 조회할 수 있습니다.",
    });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("psettings:visibility:public")
      .setLabel("공개")
      .setStyle(!isPrivate ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(!isPrivate),
    new ButtonBuilder()
      .setCustomId("psettings:visibility:private")
      .setLabel("비공개")
      .setStyle(isPrivate ? ButtonStyle.Danger : ButtonStyle.Secondary)
      .setDisabled(isPrivate),
  );

  return { embeds: [embed], components: [row] };
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!getUserFriendCode(interaction.user.id)) {
    await interaction.reply({
      content: "아직 프로필이 등록되지 않았습니다. `/북마클릿` 명령어로 먼저 등록해주세요.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.reply({ ...buildSettingsContent(interaction.user.id), flags: MessageFlags.Ephemeral });
}

export async function handleButton(interaction: ButtonInteraction): Promise<void> {
  const parts = interaction.customId.split(":");
  setProfilePrivate(interaction.user.id, parts[2] === "private");
  await interaction.update(buildSettingsContent(interaction.user.id));
}
