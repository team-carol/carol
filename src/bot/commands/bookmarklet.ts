import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from "discord.js";
import { getUserSyncToken, getExtraBookmarklets, addExtraBookmarklet, removeExtraBookmarklet } from "../../db";
import { getBaseUrl } from "../../web";
import { PORT } from "../../config";

const MAX_EXTRAS = 5;

export const data = new SlashCommandBuilder()
  .setName("북마클릿")
  .setDescription("프로필 동기화용 북마클릿 관리")
  .addSubcommand((sub) =>
    sub.setName("설치").setDescription("북마클릿 설치 가이드 링크"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("추가")
      .setDescription("메인 북마클릿 실행 시 함께 실행할 추가 북마클릿 등록")
      .addStringOption((o) =>
        o.setName("이름").setDescription("북마클릿 표시 이름").setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName("코드")
          .setDescription("북마클릿 코드 (javascript: 로 시작해야 함)")
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName("목록").setDescription("등록된 추가 북마클릿 목록 확인"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("삭제")
      .setDescription("등록된 추가 북마클릿 삭제")
      .addStringOption((o) =>
        o.setName("이름").setDescription("삭제할 북마클릿 이름").setRequired(true),
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();

  if (sub === "설치") {
    const token = getUserSyncToken(interaction.user.id);
    const guideUrl = `${getBaseUrl(PORT)}/sync?code=${token}`;
    const btn = new ButtonBuilder()
      .setLabel("설치 가이드 열기")
      .setStyle(ButtonStyle.Link)
      .setURL(guideUrl)
      .setEmoji("🔖");
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(btn);
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("🔖 북마클릿 설치")
          .setColor(0x888888)
          .setDescription(
            `아래 버튼을 눌러 설치 가이드 페이지를 여세요.\n\n` +
              `**PC** — 초록색 링크를 북마크바로 드래그\n` +
              `**모바일** — 복사 버튼 → 북마크에 붙여넣기`,
          ),
      ],
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "추가") {
    const label = interaction.options.getString("이름", true).trim();
    const code = interaction.options.getString("코드", true).trim();

    if (!code.startsWith("javascript:")) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff4444)
            .setDescription("❌ 코드는 `javascript:` 로 시작해야 합니다."),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const existing = getExtraBookmarklets(interaction.user.id);
    const alreadyExists = existing.some((b) => b.label === label);
    if (!alreadyExists && existing.length >= MAX_EXTRAS) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff4444)
            .setDescription(`❌ 추가 북마클릿은 최대 ${MAX_EXTRAS}개까지 등록할 수 있습니다.`),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    addExtraBookmarklet(interaction.user.id, label, code);
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x22c55e)
          .setDescription(`✅ **${label}** 북마클릿이 등록되었습니다.`),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "목록") {
    const extras = getExtraBookmarklets(interaction.user.id);
    if (extras.length === 0) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x888888)
            .setDescription("등록된 추가 북마클릿이 없습니다."),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const lines = extras.map((b, i) => `${i + 1}. **${b.label}**`).join("\n");
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("추가 북마클릿 목록")
          .setColor(0x9333ea)
          .setDescription(lines),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "삭제") {
    const label = interaction.options.getString("이름", true).trim();
    const removed = removeExtraBookmarklet(interaction.user.id, label);
    if (!removed) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff4444)
            .setDescription(`❌ **${label}** 이름의 북마클릿을 찾을 수 없습니다.`),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x22c55e)
          .setDescription(`✅ **${label}** 북마클릿이 삭제되었습니다.`),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
}
