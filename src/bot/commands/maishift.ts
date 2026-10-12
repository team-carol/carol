import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { getMaishiftLink, setMaishiftHandle, getUserDefaultServer } from "../../storage";
import { lookupMaishift, MaishiftError } from "../../maishift";
import { msg } from "../../messages";

// /마이시프트: maishift 아이디 연동(임시 — 공식 API 전까지). 연동하면 프로필·기록을 maishift 에서 받아 쓴다.
// 아이디만 입력하면 바로 연동된다(본인 확인 없음 — maishift 프로필은 공개 데이터라서).
export const data = new SlashCommandBuilder()
  .setName("마이시프트")
  .setDescription("maishift 계정 연동")
  .addSubcommand((sub) =>
    sub.setName("연동").setDescription("maishift 아이디를 연동합니다")
      .addStringOption((opt) => opt.setName("아이디").setDescription("maishift 프로필 주소의 아이디 (maimai.shiftpsh.com/profile/아이디)").setRequired(true).setMaxLength(40)),
  )
  .addSubcommand((sub) => sub.setName("해제").setDescription("maishift 연동을 해제합니다"));

const HANDLE = /^[^\s/?#%]{1,40}$/;

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  if (interaction.options.getSubcommand() === "해제") {
    const linked = await getMaishiftLink(userId);
    if (linked) await setMaishiftHandle(userId, "");
    await interaction.reply({ content: linked ? msg("maishift.unlinked", { handle: linked.handle }) : msg("maishift.notLinked"), flags: MessageFlags.Ephemeral });
    return;
  }

  // 주소를 통째로 붙여 넣어도 아이디만 뽑는다.
  const raw = interaction.options.getString("아이디", true).trim();
  const handle = raw.match(/profile\/([^/?#\s]+)/)?.[1] ?? raw.replace(/^@/, "");
  if (!HANDLE.test(handle)) {
    await interaction.reply({ content: msg("maishift.invalidHandle"), flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const server = await getUserDefaultServer(userId);
  try {
    const found = await lookupMaishift({ handle, server });
    await setMaishiftHandle(userId, found.handle);
    await interaction.editReply({ content: msg("maishift.linked", { handle: found.handle, name: found.name, rating: found.rating }) });
  } catch (e) {
    const notFound = e instanceof MaishiftError && e.kind === "not_found";
    if (!notFound) console.error("[maishift] 연동 실패:", e);
    await interaction.editReply({
      content: notFound ? msg("maishift.notFound", { handle, server: server === "jp" ? "JAPAN" : "ASIA" }) : msg("maishift.unavailable"),
    });
  }
}
