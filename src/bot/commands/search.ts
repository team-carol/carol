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
import { listCatalogSongKinds, songPickValue, getSongArtist } from "../../constants";
import { normalizeQuery, aliasMatches, getTranslation, withoutGeunPrefix, artistMatches } from "../../aliases";

export const data = new SlashCommandBuilder()
  .setName("검색")
  .setDescription("내 클리어 기록에서 곡을 검색")
  .addStringOption((opt) =>
    opt
      .setName("검색어")
      .setDescription("곡명·아티스트 (별명 가능)")
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
  const typed = interaction.options.getFocused();
  if (!normalizeQuery(typed)) { await interaction.respond([]); return; }
  const type = interaction.options.getString("type") ?? "";
  // 곡명·별명으로 맞은 곡이 먼저, 아티스트(이름·아티스트 별명)로만 맞은 곡은 뒤에(이름 옆에 아티스트를 붙인다).
  const find = (q: string) => {
    const rank = (t: string) => {
      const n = normalizeQuery(t);
      return n === q ? 0 : n.startsWith(q) ? 1 : n.includes(q) ? 2 : aliasMatches(t, q) ? 3 : 4;
    };
    return listCatalogSongKinds()
      .filter((c) => !type || c.musicKind === type)
      .map((c) => ({ ...c, rank: rank(c.title), artist: getSongArtist(c.title) }))
      .filter((c) => c.rank < 4 || (!!c.artist && artistMatches(c.artist, q)))
      .sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title) || a.musicKind.localeCompare(b.musicKind))
      .slice(0, 25);
  };
  let hits = find(normalizeQuery(typed));
  // 이스터에그: 맨 앞 "근"은 그대로 맞는 곡이 없으면 떼고 찾는다(검색 결과와 같은 규칙, embeds.ts searchResultEmbeds).
  const geunless = withoutGeunPrefix(typed);
  if (!hits.length && geunless) hits = find(normalizeQuery(geunless));
  await interaction.respond(hits.map((c) => {
    const ko = getTranslation(c.title);
    // Discord 는 이름을 100자까지만 받는다.
    const name = `${c.title} [${c.musicKind}]${ko ? ` ✦ ${ko}` : ""}${c.rank === 4 && c.artist ? ` · ${c.artist}` : ""}`.slice(0, 100);
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
  const query = interaction.options.getString("검색어", true);
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
