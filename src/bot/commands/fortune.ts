import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from "discord.js";
import { getDailyFortuneSong, getJacketFile } from "../../constants";
import { getTranslateTitles } from "../../storage";
import { displayTitle } from "../../aliases";

function formatSeoulDate(date: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);
}

function constantStyle(level: number): { color: number } {
  if (level >= 15.0) return { color: 0x6b0000 };
  if (level >= 14.9) return { color: 0x5b21b6 };
  if (level >= 14.8) return { color: 0xb91c1c };
  if (level >= 14.7) return { color: 0xb45309 };
  return { color: 0xd97706 };
}

export const data = new SlashCommandBuilder()
  .setName("운세")
  .setDescription("오늘의 곡 확인");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const fortune = getDailyFortuneSong(interaction.user.id);
  if (!fortune) {
    await interaction.reply({
      content: "오늘의 운세를 만들 곡을 찾지 못했습니다. 곡 데이터를 다시 불러와 주세요.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const chart = fortune.charts[0];
  const style = constantStyle(chart.level);
  const dateText = formatSeoulDate(new Date());
  const emb = new EmbedBuilder()
    .setTitle("오늘의 운세")
    .setColor(style.color)
    .setDescription(`오늘의 곡은 **${displayTitle(fortune.title, await getTranslateTitles(interaction.user.id))}** 입니다.`)
    .addFields(
      { name: "선정 차트", value: `\`${chart.kind} ${chart.diff}\``, inline: true },
      { name: "상수", value: `\`${chart.level.toFixed(1)}\``, inline: true },
    )
    .setFooter({ text: `기준일: ${dateText}` });

  const jacketFile = getJacketFile(fortune.title);
  if (jacketFile) {
    emb.setThumbnail(`https://otoge-db.net/maimai/jacket/${jacketFile}`);
  }

  await interaction.reply({ embeds: [emb] });
}
