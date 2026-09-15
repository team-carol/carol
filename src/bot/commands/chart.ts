import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} from "discord.js";
import { randomBytes } from "crypto";
import { saveSimaiChart, countSimaiChartsByOwner } from "../../storage";
import { parseMaidata } from "../../simai/parse";
import { getBaseUrl } from "../../web/bookmarklet";
import { PORT } from "../../config";
import { msg } from "../../messages";
import type { Chart } from "../../simai/types";

/** 첨부 파일 크기 상한. 공식 길이의 maidata.txt 도 수십 KB 라 넉넉하다. */
const MAX_BYTES = 2 * 1024 * 1024;
/** 한 사람이 보관할 수 있는 업로드 채보 수. 넘으면 오래된 것부터 지우라고 안내한다. */
const MAX_PER_USER = 20;

const DIFF_LABEL: Record<number, string> = {
  1: "BASIC", 2: "ADVANCED", 3: "EXPERT", 4: "MASTER", 5: "Re:MASTER",
};
const DIFF_COLOR: Record<number, number> = {
  1: 0x16a34a, 2: 0xea580c, 3: 0xdc2626, 4: 0x9333ea, 5: 0xc084fc,
};

export const data = new SlashCommandBuilder()
  .setName("보면")
  .setDescription("maidata.txt 를 올려서 채보를 재생해봅니다")
  .addAttachmentOption((o) =>
    o.setName("파일").setDescription("simai maidata.txt").setRequired(true),
  )
  .addIntegerOption((o) =>
    o.setName("난이도").setDescription("생략 시 파일에 있는 가장 높은 난이도").setRequired(false)
      .addChoices(...Object.entries(DIFF_LABEL).map(([v, name]) => ({ name, value: Number(v) }))),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const file = interaction.options.getAttachment("파일", true);
  const want = interaction.options.getInteger("난이도");

  if (file.size > MAX_BYTES) {
    await interaction.reply({ content: msg("chart.tooLarge"), flags: MessageFlags.Ephemeral });
    return;
  }
  // maidata.txt 는 텍스트다. 확장자/타입 어느 쪽이든 텍스트로 보이면 받는다.
  const looksText = /\.(txt|simai)$/i.test(file.name ?? "") || (file.contentType ?? "").startsWith("text/");
  if (!looksText) {
    await interaction.reply({ content: msg("chart.notText"), flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply();

  let text: string;
  try {
    const res = await fetch(file.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    text = await res.text();
  } catch (e) {
    console.error("[보면] 첨부 다운로드 실패:", e);
    await interaction.editReply({ content: msg("chart.downloadFailed") });
    return;
  }

  let parsed;
  try {
    parsed = parseMaidata(text);
  } catch (e) {
    console.error("[보면] 파싱 실패:", e);
    await interaction.editReply({ content: msg("chart.parseFailed") });
    return;
  }

  const available = Object.keys(parsed.charts).map(Number).sort((a, b) => a - b);
  if (available.length === 0) {
    await interaction.editReply({ content: msg("chart.noChart") });
    return;
  }
  const diff = want && parsed.charts[want] ? want : available[available.length - 1];
  if (want && !parsed.charts[want]) {
    // 요청한 난이도가 없으면 조용히 바꾸지 말고 무엇을 대신 골랐는지 알린다.
    await interaction.editReply({
      content: msg("chart.diffMissing", {
        want: DIFF_LABEL[want] ?? String(want),
        has: available.map((d) => DIFF_LABEL[d] ?? String(d)).join(", "),
      }),
    });
    return;
  }
  const chart: Chart = parsed.charts[diff];
  if (chart.notes.length === 0) {
    await interaction.editReply({ content: msg("chart.emptyChart") });
    return;
  }

  const owned = await countSimaiChartsByOwner(interaction.user.id);
  if (owned >= MAX_PER_USER) {
    await interaction.editReply({ content: msg("chart.quota", { max: MAX_PER_USER }) });
    return;
  }

  const id = randomBytes(12).toString("base64url");
  try {
    await saveSimaiChart({
      id,
      ownerId: interaction.user.id,
      source: "upload",
      title: parsed.title.slice(0, 200),
      artist: parsed.artist.slice(0, 200),
      designer: (parsed.designers[diff] ?? "").slice(0, 200),
      level: (parsed.levels[diff] ?? "").slice(0, 20),
      difficulty: diff,
      maidata: text,
      chartJson: JSON.stringify(chart),
    });
  } catch (e) {
    console.error("[보면] 저장 실패:", e);
    await interaction.editReply({ content: msg("chart.saveFailed") });
    return;
  }

  const url = `${getBaseUrl(PORT)}/chart?id=${id}`;
  const s = chart.stats;
  const secs = Math.round(chart.durationMs / 1000);
  const embed = new EmbedBuilder()
    .setColor(DIFF_COLOR[diff] ?? 0x9333ea)
    .setTitle(parsed.title || msg("chart.untitled"))
    .setDescription(msg("chart.openLink", { url }))
    .addFields(
      { name: msg("chart.fieldChart"), value: `\`${DIFF_LABEL[diff] ?? diff}\`${parsed.levels[diff] ? "  ·  Lv." + parsed.levels[diff] : ""}`, inline: true },
      { name: msg("chart.fieldBpm"), value: `\`${chart.bpm}\`  ·  ${chart.measures}마디`, inline: true },
      { name: msg("chart.fieldLength"), value: `\`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}\``, inline: true },
      {
        name: msg("chart.fieldNotes"),
        value: `TAP \`${s.tap}\` · HOLD \`${s.hold + s.touchHold}\` · SLIDE \`${s.slide}\` · TOUCH \`${s.touch}\` · BREAK \`${s.break}\`\n합계 \`${s.total}\``,
      },
    )
    .setFooter({ text: msg("chart.footer", { user: interaction.user.username }) });
  if (parsed.artist) embed.setAuthor({ name: parsed.artist });

  // 링크 버튼은 https 일 때만 단다. baseUrl 이 비어 있는 로컬 개발에서는 URL 이
  // http://localhost:... 라 Discord 가 거부할 수 있고, 그러면 응답 전체가 실패한다.
  // 어차피 embed 설명에 같은 링크가 마크다운으로 들어가 있어 기능은 잃지 않는다.
  const components = url.startsWith("https://")
    ? [new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(url).setLabel(msg("chart.button")),
      )]
    : [];
  await interaction.editReply({ embeds: [embed], components });
}
