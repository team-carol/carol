import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { getCachedProfile, getUserFriendCode, getProfilePrivate, getCirclePublic } from "../../storage";
import { circleOf, circleEmbed } from "../utils/circle";
import { msg } from "../../messages";

// /서클: 마지막 동기화 때 가져온 DX NET 서클 정보. 서클 공개(/설정, 기본 공개)가 꺼져 있으면 본인만 본다.
export const data = new SlashCommandBuilder()
  .setName("서클")
  .setDescription("maimai DX 서클 정보 보기 (생략 시 본인)")
  .addUserOption((opt) =>
    opt.setName("user").setDescription("조회할 유저 (생략 시 본인)").setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser("user") ?? interaction.user;
  const self = target.id === interaction.user.id;
  const mention = `<@${target.id}>`;
  const ephemeralReply = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

  if (!self && await getProfilePrivate(target.id)) return void await ephemeralReply(msg("common.profilePrivate", { user: mention }));
  const circlePublic = await getCirclePublic(target.id);
  if (!self && !circlePublic) return void await ephemeralReply(msg("circle.private", { user: mention }));

  const notRegistered = self ? msg("common.selfNotRegistered") : msg("common.otherNotRegistered", { user: mention });
  const friendCode = await getUserFriendCode(target.id);
  const cached = friendCode ? await getCachedProfile(friendCode) : null;
  if (!cached) return void await ephemeralReply(notRegistered);

  const circle = circleOf(cached);
  if (circle === undefined) return void await ephemeralReply(self ? msg("circle.notCollected") : msg("circle.otherNotCollected", { user: mention }));
  if (circle === null) return void await ephemeralReply(self ? msg("circle.none") : msg("circle.otherNone", { user: mention }));

  // 비공개인데 본인이 보는 경우엔 채널에 남기지 않는다.
  if (!circlePublic) {
    await interaction.reply({ content: msg("circle.privateSelfNote"), embeds: [circleEmbed(circle, cached)], flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.reply({ embeds: [circleEmbed(circle, cached)] });
}
