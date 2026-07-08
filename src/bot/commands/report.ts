import {
  SlashCommandBuilder,
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  InteractionContextType,
  ChatInputCommandInteraction,
  MessageContextMenuCommandInteraction,
  ModalSubmitInteraction,
  ButtonInteraction,
  EmbedBuilder,
  MessageFlags,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ModalBuilder,
  TextInputStyle,
  ComponentType,
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
  .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel);

export const contextData = new ContextMenuCommandBuilder()
  .setName("이슈로 등록")
  .setType(ApplicationCommandType.Message)
  .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel);

const PENDING_TTL_MS = 10 * 60 * 1000;

// 미리보기(draft) → [생성] 사이 임시 보관. 토큰 키.
interface PendingReport {
  ctx: ReportContext;
  draft: Draft;
  reporterId: string;
  expiresAt: number;
}
const pendingReports = new Map<string, PendingReport>();

// 컨텍스트 메뉴 모달 표시 → 제출 사이 임시 보관(제출엔 원본 메시지가 안 실려옴).
interface PendingContext {
  messageUrl: string;
  guildId: string;
  channelId: string;
  attachments: string[];
  expiresAt: number;
}
const pendingContexts = new Map<string, PendingContext>();

setInterval(() => {
  const now = Date.now();
  for (const [token, p] of pendingReports) if (p.expiresAt <= now) pendingReports.delete(token);
  for (const [token, p] of pendingContexts) if (p.expiresAt <= now) pendingContexts.delete(token);
}, 5 * 60 * 1000).unref?.();

/** DM에는 guildId가 없으므로 대표 guildId로 폴백. 항상 숫자 스노플레이크 → 계약 형식 충족. */
function resolveGuildId(
  interaction: ChatInputCommandInteraction | MessageContextMenuCommandInteraction | ModalSubmitInteraction,
): string {
  return interaction.guildId ?? CONFIG.carolIssueGuildId ?? interaction.channelId!;
}

/** 본문 입력 + 선택 파일 업로드 모달. customId로 슬래시("new")/컨텍스트(토큰) 경로를 구분. */
function buildModal(customId: string, prefill?: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle("문의 작성")
    .addLabelComponents(
      (label) =>
        label.setLabel("제보 내용").setTextInputComponent((ti) => {
          ti.setCustomId("content")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(4000);
          if (prefill) ti.setValue(prefill.slice(0, 4000));
          return ti;
        }),
      (label) =>
        label
          .setLabel("사진·영상 첨부 (선택)")
          .setFileUploadComponent((fu) =>
            fu.setCustomId("media").setMinValues(0).setMaxValues(10).setRequired(false),
          ),
    );
}

/** 모달 제출에서 업로드된 첨부 URL을 추출(없으면 빈 배열). */
function extractUploadedUrls(interaction: ModalSubmitInteraction): string[] {
  try {
    const field = interaction.fields.getField("media", ComponentType.FileUpload);
    return [...field.attachments.values()].map((a) => a.url);
  } catch {
    return [];
  }
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

/** 모달 제출 이후: draft 생성 → 미리보기 + [생성]/[취소]. */
async function startReport(interaction: ModalSubmitInteraction, ctx: ReportContext): Promise<void> {
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
  await interaction.showModal(buildModal("report:modal:new"));
}

export async function executeMessage(interaction: MessageContextMenuCommandInteraction): Promise<void> {
  if (!isConfigured()) {
    await interaction.reply({ content: "제보 기능이 설정되지 않았습니다. 관리자에게 문의해주세요.", flags: MessageFlags.Ephemeral });
    return;
  }
  const gid = resolveGuildId(interaction);
  const msg = interaction.targetMessage;
  const token = randomUUID();
  pendingContexts.set(token, {
    messageUrl: `https://discord.com/channels/${gid}/${interaction.channelId}/${msg.id}`,
    guildId: gid,
    channelId: interaction.channelId,
    attachments: [...msg.attachments.values()].map((a) => a.url),
    expiresAt: Date.now() + PENDING_TTL_MS,
  });
  await interaction.showModal(buildModal(`report:modal:${token}`, msg.content ?? ""));
}

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  const token = interaction.customId.split(":")[2];
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const content = interaction.fields.getTextInputValue("content");
  const uploaded = extractUploadedUrls(interaction);

  let ctx: ReportContext;
  if (token === "new") {
    const gid = resolveGuildId(interaction);
    const reply = await interaction.fetchReply();
    ctx = {
      content,
      reporterId: interaction.user.id,
      reporterName: interaction.user.username,
      guildId: gid,
      channelId: interaction.channelId!,
      messageUrl: `https://discord.com/channels/${gid}/${interaction.channelId}/${reply.id}`,
      attachments: uploaded,
    };
  } else {
    const pc = pendingContexts.get(token);
    if (!pc) {
      await interaction.editReply({ content: "요청이 만료되었습니다. 다시 시도해주세요." });
      return;
    }
    pendingContexts.delete(token);
    ctx = {
      content,
      reporterId: interaction.user.id,
      reporterName: interaction.user.username,
      guildId: pc.guildId,
      channelId: pc.channelId,
      messageUrl: pc.messageUrl,
      attachments: [...pc.attachments, ...uploaded].slice(0, 50),
    };
  }

  await startReport(interaction, ctx);
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
