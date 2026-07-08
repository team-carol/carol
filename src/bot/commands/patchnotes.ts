import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
} from "discord.js";
import { fetchPatchNotes, isTransientPatchNotesRequestError, type PatchNotesFeed } from "../../patchNotes";

const PAGE_SIZE = 1;
const MAX_ITEMS = 5;

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function formatPublishedAt(value: number | null): string {
  if (value === null) return "일시 없음";
  return new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

export const data: SlashCommandBuilder = new SlashCommandBuilder()
  .setName("패치노트")
  .setDescription("설정된 RSS 피드에서 최신 패치노트 보기");

function buildPatchNotesReply(feed: PatchNotesFeed, requestedPage: number) {
  const totalPages = Math.max(1, Math.ceil(feed.entries.length / PAGE_SIZE));
  const page = Math.min(Math.max(requestedPage, 0), totalPages - 1);
  const start = page * PAGE_SIZE;
  const entries = feed.entries.slice(start, start + PAGE_SIZE);

  const embed = new EmbedBuilder()
    .setColor(0x1d9bf0)
    .setTitle(feed.label)
    .setDescription(`총 ${feed.entries.length}건 중 ${start + 1}건 표시`)
    .setFooter({ text: `${feed.url} · ${page + 1}/${totalPages} 페이지` });

  entries.forEach((entry, index) => {
    const body = [
      `[원문 보기](${entry.link})`,
      `게시 시각: ${formatPublishedAt(entry.publishedAt)}`,
      entry.summary ? truncate(entry.summary, 700) : "요약 없음",
    ].join("\n");
    embed.addFields({
      name: `${start + index + 1}. ${truncate(entry.title, 200)}`,
      value: truncate(body, 1024),
    });
  });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`patchnotes:${page - 1}`)
      .setLabel("이전")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`patchnotes:${page + 1}`)
      .setLabel("다음")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1),
  );

  return { embeds: [embed], components: totalPages > 1 ? [row] : [] };
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  try {
    const feed = await fetchPatchNotes(MAX_ITEMS);
    if (feed.entries.length === 0) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x64748b)
            .setTitle(feed.label)
            .setDescription("RSS 피드에서 표시할 항목을 찾지 못했습니다.")
            .setFooter({ text: feed.url }),
        ],
      });
      return;
    }
    await interaction.editReply(buildPatchNotesReply(feed, 0));
  } catch (error) {
    console.error("[패치노트]", error);
    const content = error instanceof Error && error.message === "patch_notes_feed_whitelist_required"
      ? "기본 패치노트 RSS 소스(`https://nitter.net/carolbot_maimai/rss`)가 이 서버에서 차단되었습니다. 현재 소스는 코드에 고정되어 있으니, 서버에서 해당 RSS 응답이 정상인지 확인해주세요."
      : isTransientPatchNotesRequestError(error)
        ? "패치노트 RSS 서버와의 연결이 잠시 끊겼습니다. 잠시 후 다시 시도해주세요."
      : "패치노트를 불러오지 못했습니다. RSS URL과 응답 형식을 확인해주세요.";
    await interaction.editReply({ content });
  }
}

export async function handleButton(interaction: ButtonInteraction): Promise<void> {
  const page = parseInt(interaction.customId.split(":")[1] ?? "0", 10);
  const feed = await fetchPatchNotes(MAX_ITEMS);
  if (feed.entries.length === 0) {
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(0x64748b)
          .setTitle(feed.label)
          .setDescription("RSS 피드에서 표시할 항목을 찾지 못했습니다.")
          .setFooter({ text: feed.url }),
      ],
      components: [],
    });
    return;
  }
  await interaction.update(buildPatchNotesReply(feed, Number.isNaN(page) ? 0 : page));
}
