import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  MessageFlags,
} from "discord.js";
import {
  getCachedProfile,
  getUserFriendCode,
} from "../../storage";
import { searchResultEmbeds } from "../utils/embeds";
import { msg } from "../../messages";
import { notRegisteredNotice } from "../utils/notRegistered";
import { listCatalogSongKinds, songPickValue } from "../../constants";
import { normalizeQuery, aliasMatches, getTranslation } from "../../aliases";

export const data = new SlashCommandBuilder()
  .setName("검색")
  .setDescription("내 클리어 기록에서 곡을 검색")
  .addStringOption((opt) =>
    opt
      .setName("title")
      .setDescription("검색할 곡명 (별명 가능))")
      .setRequired(true)
      .setMaxLength(50)
      .setAutocomplete(true),
  )
  .addStringOption((opt) =>
    opt
      .setName("type")
      .setDescription("채보 타입 (Optional)")
      .setRequired(false)
      .addChoices(
        { name: "STANDARD", value: "ST" },
        { name: "DX", value: "DX" },
      ),
  )
  .addUserOption((opt) =>
    opt
      .setName("user")
      .setDescription("조회할 유저 (생략 시 본인)")
      .setRequired(false),
  );

/**
 * 곡명 자동완성(/보면 처럼). 목록에서 고르면 값이 "#<해시>" 라 그 곡·종류만 보여 주고,
 * 고르지 않고 입력한 그대로 보내면 예전처럼 검색어로 찾는다(searchResultEmbeds 의 resolveSongPick).
 * 네트워크·DB 없이 메모리 카탈로그만 본다(Discord 자동완성 3초 제한).
 */
export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const q = normalizeQuery(interaction.options.getFocused());
  if (!q) { await interaction.respond([]); return; }
  const type = interaction.options.getString("type") ?? "";
  const rank = (t: string) => {
    const n = normalizeQuery(t);
    return n === q ? 0 : n.startsWith(q) ? 1 : n.includes(q) ? 2 : 3;
  };
  const hits = listCatalogSongKinds()
    .filter((c) => (!type || c.musicKind === type) && (normalizeQuery(c.title).includes(q) || aliasMatches(c.title, q)))
    .sort((a, b) => rank(a.title) - rank(b.title) || a.title.localeCompare(b.title) || a.musicKind.localeCompare(b.musicKind))
    .slice(0, 25);
  await interaction.respond(hits.map((c) => {
    const ko = getTranslation(c.title);
    // Discord 는 이름을 100자까지만 받는다.
    const name = `${c.title} [${c.musicKind}]${ko ? ` ✦ ${ko}` : ""}`.slice(0, 100);
    return { name, value: songPickValue(c.title, c.musicKind) };
  }));
}

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const target = interaction.options.getUser("user") ?? interaction.user;
  const userId = target.id;
  const friendCode = await getUserFriendCode(userId);
  const cached = friendCode ? await getCachedProfile(friendCode) : null;
  if (!cached) {
    const notice = await notRegisteredNotice(target.id, target.id === interaction.user.id);
    await interaction.reply({ content: notice, flags: MessageFlags.Ephemeral });
    return;
  }
  const query = interaction.options.getString("title", true);
  const typeFilter = interaction.options.getString("type") ?? "";
  await interaction.deferReply();
  try {
    const result = await searchResultEmbeds(
      cached,
      userId,
      query,
      0,
      typeFilter,
    );
    await interaction.editReply(result);
  } catch (e) {
    console.error("[검색]", e);
    await interaction
      .editReply({ content: msg("search.failed") })
      .catch(() => {});
  }
}
