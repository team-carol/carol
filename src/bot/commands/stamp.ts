import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags, AttachmentBuilder, type RepliableInteraction } from "discord.js";
import { getCachedProfile, getUserFriendCode, getMaishiftLink, getTranslateTitles } from "../../storage";
import { loadAvatar } from "../utils/embeds";
import { renderStampCard } from "../utils/stampCard";
import { notRegisteredNotice } from "../utils/notRegistered";
import { getStampCards } from "../../maishift/stamps";
import { regionLatestVersion } from "../../constants";
import { msg } from "../../messages";
import { noteStampNames } from "../../nameTranslations";

// /스탬프: maishift 스탬프 카드 현황(파트너·곡·기타 진행 중 카드와 완료한 카드)을 이미지로.
export const data = new SlashCommandBuilder()
  .setName("스탬프")
  .setDescription("스탬프 카드 현황 (maishift)")
  .addUserOption((opt) => opt.setName("user").setDescription("조회할 유저 (생략 시 본인)").setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await show(interaction, (interaction.options.getUser("user") ?? interaction.user).id);
}

/** /스탬프 와 /사진관 버튼이 같이 쓴다. */
export async function show(interaction: RepliableInteraction, targetId: string): Promise<void> {
  const target = { id: targetId };
  const self = target.id === interaction.user.id;
  const friendCode = await getUserFriendCode(target.id);
  const link = await getMaishiftLink(target.id);
  if (!friendCode || !link) {
    await interaction.reply({ content: await notRegisteredNotice(target.id, self), flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply();
  // 프로필을 먼저 받아 그 서버(지역) 기록이 있는지 확인한다(없으면 다른 지역 스탬프를 보여 주지 않는다).
  const cached = await getCachedProfile(friendCode);
  if (!cached) {
    await interaction.editReply({ content: await notRegisteredNotice(target.id, self) });
    return;
  }
  try {
    const cards = await getStampCards(link.handle, link.server === "jp" ? "JAPAN" : "ASIA");
    // 처음 보는 카드 이름은 /관리 이름 번역에 번역 대기로 올린다.
    noteStampNames(cards).catch((e) => console.error("[names] 스탬프 이름 기록 실패:", e));
    if (!cards.length) {
      await interaction.editReply({ content: msg("stamp.empty") });
      return;
    }
    const png = await renderStampCard(cached, await loadAvatar(target.id, cached), cards, regionLatestVersion(cached.server), await getTranslateTitles(interaction.user.id));
    await interaction.editReply({ files: [new AttachmentBuilder(png, { name: "stamp.png" })] });
  } catch (e) {
    console.error("[stamp]", e);
    await interaction.editReply({ content: msg("stamp.failed") }).catch(() => {});
  }
}
