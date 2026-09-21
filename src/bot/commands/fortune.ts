import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, AttachmentBuilder, MessageFlags } from "discord.js";
import { getDailyFortuneSong, getJacketFile } from "../../constants";
import { getTranslateTitles } from "../../storage";
import { displayTitle, normalizeQuery } from "../../aliases";
import { searchRegistry } from "../../simai/registryIndex";
import { resolveChart, makeChartKey } from "../../simai/source";
import { parseMaidata } from "../../simai/parse";
import { renderPreviewGif } from "../utils/chartGif";
import { msg } from "../../messages";

// 운세 곡 난이도 문자열 → carol 내부 난이도 번호(등록 채보 매칭용).
const DIFF_NUM: Record<string, number> = {
  BASIC: 1, ADVANCED: 2, EXPERT: 3, MASTER: 4, "Re:MASTER": 5,
};

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

/**
 * 운세 곡과 같은 곡·같은 난이도의 등록 채보(simai)를 찾아 미리보기 GIF 를 만든다.
 * 등록 채보가 없거나 그 난이도가 없으면 null — 미리보기는 부가 기능이라 조용히 건너뛴다.
 * ST/DX(스탠다드/디럭스)는 채보가 다르므로 kind 로 등록분을 고른 뒤, 그 maidata 에서
 * 운세가 가리키는 정확한 난이도를 뽑아 렌더한다.
 */
async function fortunePreviewGif(title: string, kind: string, diffName: string): Promise<Buffer | null> {
  const wantDiff = DIFF_NUM[diffName];
  if (!wantDiff) return null;
  const wantType = kind === "DX" ? "deluxe" : "standard";
  const nt = normalizeQuery(title);
  const exact = searchRegistry(title, 25).filter((h) => normalizeQuery(h.title) === nt);
  if (exact.length === 0) return null;
  // 같은 타입(ST/DX) 우선, 타입 미상("")은 차선, 그다음 아무거나.
  const pick =
    exact.find((h) => h.type === wantType) ??
    exact.find((h) => h.type === "") ??
    exact[0];
  const resolved = await resolveChart(makeChartKey("registry", pick.id));
  const parsed = parseMaidata(resolved.maidata);
  const chart = parsed.charts[wantDiff];
  if (!chart || chart.notes.length === 0) return null;
  const { gif } = await renderPreviewGif({
    id: pick.id, title: resolved.title, artist: resolved.artist,
    designer: resolved.designer, level: resolved.level, difficulty: wantDiff, chart,
  });
  return gif;
}

export const data = new SlashCommandBuilder()
  .setName("운세")
  .setDescription("오늘의 곡 확인");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const fortune = getDailyFortuneSong(interaction.user.id);
  if (!fortune) {
    await interaction.reply({
      content: msg("fortune.noSongs"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // 미리보기 GIF 렌더가 수 초 걸릴 수 있으므로 먼저 defer.
  await interaction.deferReply();

  const chart = fortune.charts[0];
  const style = constantStyle(chart.level);
  const dateText = formatSeoulDate(new Date());
  const emb = new EmbedBuilder()
    .setTitle(msg("fortune.title"))
    .setColor(style.color)
    .setDescription(msg("fortune.body", { title: displayTitle(fortune.title, await getTranslateTitles(interaction.user.id)) }))
    .addFields(
      { name: msg("fortune.chartField"), value: `\`${chart.kind} ${chart.diff}\``, inline: true },
      { name: msg("fortune.constantField"), value: `\`${chart.level.toFixed(1)}\``, inline: true },
    )
    .setFooter({ text: msg("fortune.footer", { date: dateText }) });

  const jacketFile = getJacketFile(fortune.title);
  if (jacketFile) {
    emb.setThumbnail(`https://otoge-db.net/maimai/jacket/${jacketFile}`);
  }

  // 등록 채보가 있으면 /보면 과 같은 미리보기 GIF 를 붙인다(부가 기능, 실패해도 임베드는 나감).
  const files: AttachmentBuilder[] = [];
  try {
    const gif = await fortunePreviewGif(fortune.title, chart.kind, chart.diff);
    if (gif) {
      files.push(new AttachmentBuilder(gif, { name: "preview.gif" }));
      emb.setImage("attachment://preview.gif");
    }
  } catch (e) {
    console.error("[운세] 미리보기 생성 실패:", e);
  }

  await interaction.editReply({ embeds: [emb], files });
}
