import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";
import {
  getCachedProfile,
  getUserFriendCode,
} from "../../storage";
import { searchResultEmbeds } from "../utils/embeds";
import { msg } from "../../messages";

export const data = new SlashCommandBuilder()
  .setName("검색")
  .setDescription("내 클리어 기록에서 곡을 검색")
  .addStringOption((opt) =>
    opt
      .setName("title")
      .setDescription("검색할 곡명 (별명 가능))")
      .setRequired(true)
      .setMaxLength(50),
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

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const target = interaction.options.getUser("user") ?? interaction.user;
  const userId = target.id;
  const friendCode = await getUserFriendCode(userId);
  const cached = friendCode ? await getCachedProfile(friendCode) : null;
  if (!cached) {
    const notice =
      target.id === interaction.user.id
        ? msg("common.selfNotRegistered")
        : msg("common.otherNotRegistered", { user: `<@${target.id}>` });
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
