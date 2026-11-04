import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags, AttachmentBuilder } from "discord.js";
import { getCachedProfile, getUserFriendCode, getTranslateTitles } from "../../storage";
import { getClearList, loadAvatar } from "../utils/embeds";
import { notRegisteredNotice } from "../utils/notRegistered";
import { renderPlaylistCard, type PlaylistEntry } from "../utils/playlistCard";
import { getConstant } from "../../constants";
import { chartKey } from "../../scraper";
import { getPlaylist, parsePlaylistId } from "../../maishift/stats";
import { titleOf } from "../../maishift/convert";
import { playlistErrorText } from "./random";
import { msg } from "../../messages";

// /플레이리스트: maishift 공개 플레이리스트의 보면을 순서대로, 내 기록과 함께 한 장으로.
export const data = new SlashCommandBuilder()
  .setName("플레이리스트")
  .setDescription("maishift 공개 플레이리스트와 내 기록")
  .addStringOption((opt) => opt.setName("번호").setDescription("maishift 플레이리스트 번호나 주소").setRequired(true).setMaxLength(200))
  .addUserOption((opt) => opt.setName("user").setDescription("기록을 볼 유저 (생략 시 본인)").setRequired(false));

const DIFF: Record<string, string> = { BASIC: "BASIC", ADVANCED: "ADVANCED", EXPERT: "EXPERT", MASTER: "MASTER", RE_MASTER: "Re:MASTER" };

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const id = parsePlaylistId(interaction.options.getString("번호", true));
  if (!id) {
    await interaction.reply({ content: msg("playlist.badId"), flags: MessageFlags.Ephemeral });
    return;
  }
  const targetId = (interaction.options.getUser("user") ?? interaction.user).id;
  const self = targetId === interaction.user.id;
  const friendCode = await getUserFriendCode(targetId);
  if (!friendCode) {
    await interaction.reply({ content: await notRegisteredNotice(targetId, self), flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply();
  const cached = await getCachedProfile(friendCode);
  if (!cached) {
    await interaction.editReply({ content: await notRegisteredNotice(targetId, self) });
    return;
  }
  let list;
  try {
    list = await getPlaylist(id);
  } catch (e) {
    await interaction.editReply({ content: playlistErrorText(e) });
    return;
  }
  if (!list.items.length) {
    await interaction.editReply({ content: msg("playlist.empty") });
    return;
  }
  try {
    const records = new Map(getClearList(cached).map((r) => [chartKey(r), r]));
    const entries: PlaylistEntry[] = list.items.map((it) => {
      const title = titleOf(it.title);
      const kind = it.type === "DX" ? "DX" : "ST";
      const diff = DIFF[it.difficulty] ?? it.difficulty;
      return {
        title, kind, diff, level: it.level, comment: it.comment?.trim() || null,
        // 상수는 기록을 보는 사람의 지역 값(없으면 플레이리스트가 준 값).
        constant: getConstant(title, kind, diff, cached.server) ?? it.internalLevel / 10,
        record: records.get(`${title}|${kind}|${diff}`),
      };
    });
    const [avatarBuf, translate] = await Promise.all([loadAvatar(targetId, cached), getTranslateTitles(interaction.user.id)]);
    const png = await renderPlaylistCard(cached, avatarBuf, { title: list.title, owner: list.owner.handle, updatedAt: list.updatedAt }, entries, translate);
    await interaction.editReply({ files: [new AttachmentBuilder(png, { name: "playlist.png" })] });
  } catch (e) {
    console.error("[playlist]", e);
    await interaction.editReply({ content: msg("playlist.failed") }).catch(() => {});
  }
}
