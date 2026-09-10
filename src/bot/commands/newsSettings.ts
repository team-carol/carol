import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder,
  MessageFlags, PermissionsBitField, ChannelType,
} from "discord.js";
import { getNewsChannels, setNewsChannel, clearNewsChannel } from "../../storage";
import { isNewsSource, type NewsSource } from "../../news";
import { msg } from "../../messages";

const SOURCE_LABEL_KEY = {
  jp: "newsSettings.jpField",
  intl: "newsSettings.intlField",
} as const;

export const data = new SlashCommandBuilder()
  .setName("공지설정")
  .setDescription("maimai 공식 공지를 올릴 채널 설정 (관리자 전용)")
  .addStringOption((o) =>
    o.setName("사이트").setDescription("공지 출처").setRequired(false)
      .addChoices(
        { name: "내수판 (info-maimai.sega.jp)", value: "jp" },
        { name: "국제판 (maimai.sega.com)", value: "intl" },
      ),
  )
  .addChannelOption((o) =>
    o.setName("채널").setDescription("공지를 올릴 채널 (생략 시 현재 설정 표시)").setRequired(false)
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
  )
  .addBooleanOption((o) =>
    o.setName("해제").setDescription("해당 사이트 알림 끄기").setRequired(false),
  );

async function currentSettings(guildId: string) {
  const rows = await getNewsChannels(guildId) as { source: string; channelId: string }[];
  const bySource = new Map(rows.map((r) => [r.source, r.channelId]));
  const field = (source: NewsSource) => ({
    name: msg(SOURCE_LABEL_KEY[source]),
    value: bySource.has(source) ? `<#${bySource.get(source)}>` : msg("newsSettings.off"),
  });
  return {
    embeds: [
      new EmbedBuilder()
        .setTitle(msg("newsSettings.title"))
        .setColor(0x5865f2)
        .addFields(field("jp"), field("intl"))
        .setFooter({ text: msg("newsSettings.hint") }),
    ],
  };
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: msg("common.guildOnly"), flags: MessageFlags.Ephemeral });
    return;
  }
  if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
    await interaction.reply({ content: msg("common.guildAdminOnly"), flags: MessageFlags.Ephemeral });
    return;
  }
  const guildId = interaction.guild.id;
  const sourceOpt = interaction.options.getString("사이트") ?? "";
  const channel = interaction.options.getChannel("채널");
  const clear = interaction.options.getBoolean("해제") ?? false;

  // 사이트 미지정이거나 동작 옵션이 없으면 현재 설정만 보여준다.
  if (!isNewsSource(sourceOpt) || (!channel && !clear)) {
    await interaction.reply({ ...(await currentSettings(guildId)), flags: MessageFlags.Ephemeral });
    return;
  }
  const source: NewsSource = sourceOpt;
  const label = msg(SOURCE_LABEL_KEY[source]);

  if (clear) {
    const removed = await clearNewsChannel(guildId, source);
    await interaction.reply({
      content: removed ? msg("newsSettings.cleared", { source: label }) : msg("newsSettings.notSet"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!channel || !("send" in channel)) {
    await interaction.reply({ content: msg("newsSettings.badChannel"), flags: MessageFlags.Ephemeral });
    return;
  }
  await setNewsChannel(guildId, source, channel.id);
  await interaction.reply({
    content: msg("newsSettings.set", { source: label, channel: `<#${channel.id}>` }),
    flags: MessageFlags.Ephemeral,
  });
}
