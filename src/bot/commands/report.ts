import {
  SlashCommandBuilder,
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  InteractionContextType,
  ChatInputCommandInteraction,
  MessageContextMenuCommandInteraction,
  ButtonInteraction,
  EmbedBuilder,
  MessageFlags,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from "discord.js";
import { randomUUID } from "crypto";
import { CONFIG } from "../../config";
import {
  isConfigured,
  postDraft,
  postIssue,
  userMessageForError,
  type Draft,
  type ReportContext,
} from "../issueApi";

export const data = new SlashCommandBuilder()
  .setName("문의")
  .setDescription("버그·문의를 GitHub 이슈로 등록합니다")
  .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
  .addStringOption((o) =>
    o.setName("내용").setDescription("제보 내용").setRequired(true).setMaxLength(4000),
  );

export const contextData = new ContextMenuCommandBuilder()
  .setName("이슈로 등록")
  .setType(ApplicationCommandType.Message)
  .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel);

// 미리보기(draft) → [생성] 사이 임시 보관. 토큰 키, 10분 TTL.
interface PendingReport {
  ctx: ReportContext;
  draft: Draft;
  reporterId: string;
  expiresAt: number;
}
const PENDING_TTL_MS = 10 * 60 * 1000;
const pendingReports = new Map<string, PendingReport>();

setInterval(() => {
  const now = Date.now();
  for (const [token, p] of pendingReports) {
    if (p.expiresAt <= now) pendingReports.delete(token);
  }
}, 5 * 60 * 1000).unref?.();

/** DM에는 guildId가 없으므로 대표 guildId로 폴백. 항상 숫자 스노플레이크 → 계약 형식 충족. */
function resolveGuildId(interaction: ChatInputCommandInteraction | MessageContextMenuCommandInteraction): string {
  return interaction.guildId ?? CONFIG.carolIssueGuildId ?? interaction.channelId;
}

function buildPreview(token: string, draft: Draft): {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const embed = new EmbedBuilder()
    .setTitle(draft.title || "(제목 없음)")
    .setColor(draft.needsMoreInfo ? 0xf59e0b : 0x9333ea)
    .setDescription(draft.summary || "(요약 없음)")
    .addFields(
      { name: "유형", value: draft.type, inline: true },
      { name: "우선순위", value: draft.priority, inline: true },
      { name: "라벨", value: draft.labels.length ? draft.labels.join(", ") : "-", inline: true },
    )
    .setFooter({ text: "아래에서 생성하면 team-carol/carol 저장소에 이슈가 등록됩니다." });

  if (draft.needsMoreInfo) {
    embed.addFields({
      name: "⚠️ 정보 부족",
      value: "제보 내용이 짧아 근거 없는 세부는 생성하지 않았습니다. 취소 후 재현 방법·기대 동작을 더 자세히 적어주시면 더 정확한 이슈가 만들어집니다.",
    });
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`report:create:${token}`).setLabel("이슈 생성").setStyle(ButtonStyle.Success).setEmoji("✅"),
    new ButtonBuilder().setCustomId(`report:cancel:${token}`).setLabel("취소").setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row] };
}

async function startReport(
  interaction: ChatInputCommandInteraction | MessageContextMenuCommandInteraction,
  ctx: ReportContext,
): Promise<void> {
  let draft: Draft;
  try {
    draft = await postDraft(ctx);
  } catch (e) {
    const { text, alert } = userMessageForError(e);
    if (alert) console.error("[report:draft]", e);
    await interaction.editReply({ content: text });
    return;
  }

  const token = randomUUID();
  pendingReports.set(token, { ctx, draft, reporterId: interaction.user.id, expiresAt: Date.now() + PENDING_TTL_MS });
  await interaction.editReply(buildPreview(token, draft));
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!isConfigured()) {
    await interaction.reply({ content: "제보 기능이 설정되지 않았습니다. 관리자에게 문의해주세요.", flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const gid = resolveGuildId(interaction);
  const reply = await interaction.fetchReply();
  const messageUrl = `https://discord.com/channels/${gid}/${interaction.channelId}/${reply.id}`;

  await startReport(interaction, {
    content: interaction.options.getString("내용", true),
    reporterId: interaction.user.id,
    reporterName: interaction.user.username,
    guildId: gid,
    channelId: interaction.channelId,
    messageUrl,
    attachments: [],
  });
}

export async function executeMessage(interaction: MessageContextMenuCommandInteraction): Promise<void> {
  if (!isConfigured()) {
    await interaction.reply({ content: "제보 기능이 설정되지 않았습니다. 관리자에게 문의해주세요.", flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const msg = interaction.targetMessage;
  const content = msg.content?.trim();
  if (!content) {
    await interaction.editReply({ content: "텍스트가 없는 메시지입니다. `/문의` 로 직접 작성해주세요." });
    return;
  }

  const gid = resolveGuildId(interaction);
  const messageUrl = `https://discord.com/channels/${gid}/${interaction.channelId}/${msg.id}`;

  await startReport(interaction, {
    content,
    reporterId: interaction.user.id,
    reporterName: interaction.user.username,
    guildId: gid,
    channelId: interaction.channelId,
    messageUrl,
    attachments: [...msg.attachments.values()].map((a) => a.url),
  });
}

export async function handleButton(interaction: ButtonInteraction): Promise<void> {
  const [, action, token] = interaction.customId.split(":");
  const pending = token ? pendingReports.get(token) : undefined;

  if (!pending) {
    await interaction.update({ content: "요청이 만료되었습니다. `/문의` 로 다시 시도해주세요.", embeds: [], components: [] });
    return;
  }
  if (pending.reporterId !== interaction.user.id) {
    await interaction.reply({ content: "본인이 시작한 제보만 처리할 수 있습니다.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (action === "cancel") {
    pendingReports.delete(token);
    await interaction.update({ content: "제보가 취소되었습니다.", embeds: [], components: [] });
    return;
  }

  if (action === "create") {
    await interaction.deferUpdate();
    try {
      const { issueUrl } = await postIssue(pending.ctx, pending.draft);
      pendingReports.delete(token);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setLabel("이슈 열기").setStyle(ButtonStyle.Link).setURL(issueUrl).setEmoji("🔗"),
      );
      await interaction.editReply({ content: `✅ 이슈가 생성되었습니다.\n${issueUrl}`, embeds: [], components: [row] });
    } catch (e) {
      const { text, alert } = userMessageForError(e);
      if (alert) console.error("[report:create]", e);
      await interaction.editReply({ content: text, embeds: [], components: [] });
    }
    return;
  }
}
