import { SlashCommandBuilder, ChatInputCommandInteraction, AutocompleteInteraction, MessageFlags, AttachmentBuilder } from "discord.js";
import { getCachedProfile, getUserFriendCode, getTranslateTitles } from "../../storage";
import { getClearList, loadAvatar } from "../utils/embeds";
import { notRegisteredNotice } from "../utils/notRegistered";
import { renderPlaylistCard, type PlaylistEntry } from "../utils/playlistCard";
import { getConstant } from "../../constants";
import { chartKey } from "../../scraper";
import { openPlaylist, playlistChoices, resolvePlaylistInput } from "../../maishift/playlistIndex";
import { titleOf } from "../../maishift/convert";
import { playlistErrorText } from "./random";
import { msg } from "../../messages";

// /플레이리스트: maishift 공개 플레이리스트의 보면을 순서대로, 내 기록과 함께 한 장으로.
// 공개 목록을 나열하는 API 가 없어, 자동완성은 캐롤봇에서 한 번 연 목록을 이름으로 보여 준다(playlistIndex).
export const data = new SlashCommandBuilder()
  .setName("플레이리스트")
  .setDescription("maishift 공개 플레이리스트와 내 기록")
  .addStringOption((opt) => opt.setName("이름").setDescription("목록에서 고르거나 maishift 플레이리스트 번호·주소 입력").setRequired(true).setMaxLength(200).setAutocomplete(true))
  .addUserOption((opt) => opt.setName("user").setDescription("기록을 볼 유저 (생략 시 본인)").setRequired(false));

const DIFF: Record<string, string> = { BASIC: "BASIC", ADVANCED: "ADVANCED", EXPERT: "EXPERT", MASTER: "MASTER", RE_MASTER: "Re:MASTER" };

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  await interaction.respond(await playlistChoices(interaction.options.getFocused()));
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const id = await resolvePlaylistInput(interaction.options.getString("이름", true));
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
    list = await openPlaylist(id);
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
