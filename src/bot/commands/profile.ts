import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { getCachedProfile, getUserFriendCode, getProfilePrivate } from "../../storage";
import { buildProfileReply } from "../utils/embeds";
import { autoRole } from "../utils/roles";
import { msg } from "../../messages";

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
  const userId = target.id;
  if (target.id !== interaction.user.id && await getProfilePrivate(target.id)) {
    await interaction.reply({ content: msg("common.profilePrivate", { user: `<@${target.id}>` }), flags: MessageFlags.Ephemeral });
    return;
  }
  const notRegistered = target.id === interaction.user.id
    ? msg("common.selfNotRegistered")
    : msg("common.otherNotRegistered", { user: `<@${target.id}>` });
  const friendCode = await getUserFriendCode(userId);
  if (!friendCode) {
    await interaction.reply({ content: notRegistered, flags: MessageFlags.Ephemeral });
    return;
  }
  // buildProfileReply 는 재킷 이미지를 받아오므로 3초 ack 한계를 넘길 수 있다. 먼저 defer.
  await interaction.deferReply();
  const cached = await getCachedProfile(friendCode);
  if (!cached) {
    await interaction.editReply({ content: notRegistered });
    return;
  }
  const format = interaction.options.getString("형식") === "embed" ? "embed" : "image";
  await interaction.editReply(await buildProfileReply(cached, userId, format, interaction.user.id));
  if (target.id === interaction.user.id) await autoRole(interaction, cached.rating);
}
