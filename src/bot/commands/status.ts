import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { getRegisteredUserCount, getLastSyncTime } from "../../storage";
import { msg } from "../../messages";
import { appVersion, buildVersion } from "../../version";

export const data = new SlashCommandBuilder()
  .setName("상태")
  .setDescription("봇 및 서버 상태 확인");

function displayVersion(): string {
  const build = buildVersion();
  return build ? `${appVersion()} (${build})` : appVersion();
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(msg("status.days", { value: d }));
  if (h > 0) parts.push(msg("status.hours", { value: h }));
  parts.push(msg("status.minutes", { value: m }));
  return parts.join(" ");
}

function formatPing(ping: number): string {
  return ping >= 0 ? `${ping}ms` : msg("status.pingMeasuring");
}

function pingColor(ping: number): number {
  if (ping < 0) return 0x64748b;
  return ping < 150 ? 0x22c55e : ping < 400 ? 0xf59e0b : 0xef4444;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const ping = interaction.client.ws.ping;
  const uptime = formatUptime(Math.floor(process.uptime()));
  const userCount = await getRegisteredUserCount();
  const lastSync = await getLastSyncTime();
  const version = displayVersion();
  const lastSyncStr = lastSync
    ? new Date(lastSync).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
    : msg("status.none");

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setTitle(msg("status.title"))
        .setColor(pingColor(ping))
        .addFields(
          { name: msg("status.ping"), value: formatPing(ping), inline: true },
          { name: msg("status.uptime"), value: uptime, inline: true },
          { name: msg("status.version"), value: version, inline: true },
          { name: msg("status.userCount"), value: msg("status.userCountValue", { count: userCount }), inline: true },
          { name: msg("status.lastSync"), value: lastSyncStr, inline: false },
        ),
    ],
  });
}
