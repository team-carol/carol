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
import { msg } from "../../messages";
import { color as BRAND, toInt } from "@team-carol/design-system";

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

// 현재 postIssue 진행 중인 토큰. 중복 생성·생성중 취소 경합을 막는다.
const inFlight = new Set<string>();

setInterval(() => {
  const now = Date.now();
  for (const [token, p] of pendingReports) if (p.expiresAt <= now) pendingReports.delete(token);
  for (const [token, p] of pendingContexts) if (p.expiresAt <= now) pendingContexts.delete(token);
}, 5 * 60 * 1000).unref?.();

/** DM에는 guildId가 없으므로 대표 guildId로 폴백. 항상 숫자 스노플레이크 → 계약 형식 충족. */
function resolveGuildId(
  interaction: ChatInputCommandInteraction | MessageContextMenuCommandInteraction | ModalSubmitInteraction,
  channelId: string,
): string {
  return interaction.guildId ?? CONFIG.carolIssueGuildId ?? channelId;
}

/** 본문 입력 + 선택 파일 업로드 모달. customId로 슬래시("new")/컨텍스트(토큰) 경로를 구분. */
function buildModal(customId: string, prefill?: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(msg("report.modalTitle"))
    .addLabelComponents(
      (label) =>
        label.setLabel(msg("report.contentLabel")).setTextInputComponent((ti) => {
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
          .setLabel(msg("report.attachmentLabel"))
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
    .setTitle(draft.title || msg("report.noTitle"))
    .setColor(toInt(draft.needsMoreInfo ? BRAND.warning : BRAND.accent))
    .setDescription(draft.summary || msg("report.noSummary"))
    .addFields(
      { name: "유형", value: draft.type || "-", inline: true },
      { name: "우선순위", value: draft.priority || "-", inline: true },
      { name: "라벨", value: draft.labels.length ? draft.labels.join(", ") : "-", inline: true },
    )
    .setFooter({ text: msg("report.previewFooter") });

  if (draft.needsMoreInfo) {
    embed.addFields({
      name: "⚠️ 정보 부족",
      value: msg("report.tooShortNotice"),
    });
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`report:create:${token}`).setLabel(msg("report.createButton")).setStyle(ButtonStyle.Success).setEmoji("✅"),
    new ButtonBuilder().setCustomId(`report:cancel:${token}`).setLabel(msg("report.cancelButton")).setStyle(ButtonStyle.Secondary),
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
    await interaction.reply({ content: msg("report.notConfigured"), flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.showModal(buildModal("report:modal:new"));
}

export async function executeMessage(interaction: MessageContextMenuCommandInteraction): Promise<void> {
  if (!isConfigured()) {
    await interaction.reply({ content: msg("report.notConfigured"), flags: MessageFlags.Ephemeral });
    return;
  }
  const channelId = interaction.channelId;
  if (!channelId) {
    await interaction.reply({ content: msg("report.noChannel"), flags: MessageFlags.Ephemeral });
    return;
  }
  const gid = resolveGuildId(interaction, channelId);
  const targetMsg = interaction.targetMessage;
  const token = randomUUID();
  pendingContexts.set(token, {
    messageUrl: `https://discord.com/channels/${gid}/${channelId}/${targetMsg.id}`,
    guildId: gid,
    channelId,
    attachments: [...targetMsg.attachments.values()].map((a) => a.url),
    expiresAt: Date.now() + PENDING_TTL_MS,
  });
  await interaction.showModal(buildModal(`report:modal:${token}`, targetMsg.content ?? ""));
}

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  const token = interaction.customId.split(":")[2];
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const channelId = interaction.channelId;
    if (!channelId) {
      await interaction.editReply({ content: msg("report.noChannel") });
      return;
    }
    const content = interaction.fields.getTextInputValue("content");
    const uploaded = extractUploadedUrls(interaction);

    let ctx: ReportContext;
    if (token === "new") {
      const gid = resolveGuildId(interaction, channelId);
      // ephemeral 응답에는 안정적 메시지 id가 없으므로 interaction.id(스노플레이크)를 사용.
      // 형식 검증만 필요한 messageUrl 계약을 충족하며, 불필요한 fetchReply REST 호출을 없앤다.
      ctx = {
        content,
        reporterId: interaction.user.id,
        reporterName: interaction.user.username,
        guildId: gid,
        channelId,
        messageUrl: `https://discord.com/channels/${gid}/${channelId}/${interaction.id}`,
        attachments: uploaded,
      };
    } else {
      const pc = pendingContexts.get(token);
      if (!pc) {
        await interaction.editReply({ content: msg("report.expired") });
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
  } catch (e) {
    console.error("[report:modal]", e);
    try {
      await interaction.editReply({ content: msg("report.failed") });
    } catch {
      /* editReply 자체 실패 시 로깅으로 종료 */
    }
  }
}

export async function handleButton(interaction: ButtonInteraction): Promise<void> {
  const [, action, token] = interaction.customId.split(":");
  const pending = token ? pendingReports.get(token) : undefined;

  if (!pending) {
    await interaction.update({ content: msg("report.expiredRetry"), embeds: [], components: [] });
    return;
  }
  if (pending.reporterId !== interaction.user.id) {
    await interaction.reply({ content: "본인이 시작한 제보만 처리할 수 있습니다.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (action === "cancel") {
    if (inFlight.has(token)) {
      await interaction.reply({ content: "생성 처리 중이라 취소할 수 없습니다.", flags: MessageFlags.Ephemeral });
      return;
    }
    pendingReports.delete(token);
    await interaction.update({ content: "제보가 취소되었습니다.", embeds: [], components: [] });
    return;
  }

  if (action === "create") {
    if (inFlight.has(token)) {
      await interaction.deferUpdate(); // 중복 클릭 — 이미 처리 중이므로 무시
      return;
    }
    inFlight.add(token);
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
      // pending 유지 + 버튼 재렌더 → 같은 미리보기에서 재시도 가능.
      await interaction.editReply({ content: `${text}\n다시 시도하려면 아래 [이슈 생성]을 눌러주세요.`, ...buildPreview(token, pending.draft) });
    } finally {
      inFlight.delete(token);
    }
    return;
  }
}
