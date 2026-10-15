import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags, type RepliableInteraction } from "discord.js";
import { getCachedProfile, getUserFriendCode } from "../../storage";
import { buildProfileReply } from "../utils/embeds";
import { autoRole } from "../utils/roles";
import { msg } from "../../messages";
import { notRegisteredNotice } from "../utils/notRegistered";

export const data = new SlashCommandBuilder()
  .setName("프로필")
  .setDescription("maimai DX 프로필 보기 (생략 시 본인)")
  .addUserOption((opt) =>
    opt.setName("user").setDescription("조회할 유저 (생략 시 본인)").setRequired(false),
  )
  .addStringOption((opt) =>
    opt.setName("형식").setDescription("이미지 카드로 볼지 임베드로 볼지 (기본: 이미지)").setRequired(false)
      .addChoices({ name: "이미지", value: "image" }, { name: "임베드", value: "embed" }),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser("user") ?? interaction.user;
  const format = interaction.options.getString("형식") === "embed" ? "embed" : "image";
  const cached = await show(interaction, target.id, format);
  if (cached && target.id === interaction.user.id) await autoRole(interaction, cached.rating);
}

/** /프로필 과 /사진관 버튼이 같이 쓴다. 보여 준 프로필을 돌려준다(역할 갱신용). */
export async function show(interaction: RepliableInteraction, userId: string, format: "image" | "embed") {
  const notRegistered = () => notRegisteredNotice(userId, userId === interaction.user.id);
  const friendCode = await getUserFriendCode(userId);
  if (!friendCode) {
    await interaction.reply({ content: await notRegistered(), flags: MessageFlags.Ephemeral });
    return null;
  }
  // buildProfileReply 는 재킷 이미지를 받아오므로 3초 ack 한계를 넘길 수 있다. 먼저 defer.
  await interaction.deferReply();
  const cached = await getCachedProfile(friendCode);
  if (!cached) {
    await interaction.editReply({ content: await notRegistered() });
    return null;
  }
  await interaction.editReply(await buildProfileReply(cached, userId, format, interaction.user.id));
  return cached;
}
