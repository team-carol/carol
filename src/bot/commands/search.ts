import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";
import {
  getCachedProfile,
  getUserFriendCode,
  getProfilePrivate,
} from "../../db";
import { searchResultEmbeds } from "../utils/embeds";

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
  if (target.id !== interaction.user.id && getProfilePrivate(target.id)) {
    await interaction.reply({
      content: `<@${target.id}> 님은 프로필을 비공개로 설정했습니다.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const friendCode = getUserFriendCode(userId);
  const cached = friendCode ? getCachedProfile(friendCode) : null;
  if (!cached) {
    const msg =
      target.id === interaction.user.id
        ? "아직 프로필이 등록되지 않았습니다. `/북마클릿` 명령어로 먼저 등록해주세요."
        : `<@${target.id}> 님은 아직 프로필을 등록하지 않았습니다.`;
    await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
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
      .editReply({ content: "검색에 실패했습니다." })
      .catch(() => {});
  }
}
