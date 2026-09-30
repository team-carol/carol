import { SlashCommandBuilder, ChatInputCommandInteraction, ButtonInteraction, MessageFlags } from "discord.js";
import { getCachedProfile, getUserFriendCode, getProfilePrivate, getCirclePublic, getTranslateTitles } from "../../storage";
import { circleOf, circleEmbed, circleMembersEmbed, circleButtonsRow } from "../utils/circle";
import { searchResultEmbeds } from "../utils/embeds";
import type { CircleInfo } from "../../scraper";
import type { CachedProfile } from "../../storage/types";
import { msg } from "../../messages";

// /서클: 마지막 동기화 때 가져온 DX NET 서클 정보. 서클 공개(/설정, 기본 공개)가 꺼져 있으면 본인만 본다.
// 멤버 포인트는 최대 20명이라 길어서 버튼(circle:members:<userId>)으로 따로 띄운다.
// 서클 챌린지 버튼(circle:challenge:<userId>)은 누른 사람의 기록으로 과제곡 /검색 결과를 띄운다.
export const data = new SlashCommandBuilder()
  .setName("서클")
  .setDescription("maimai DX 서클 정보 보기 (생략 시 본인)")
  .addUserOption((opt) =>
    opt.setName("user").setDescription("조회할 유저 (생략 시 본인)").setRequired(false),
  );

type Loaded = { error: string } | { circle: CircleInfo; cached: CachedProfile; circlePublic: boolean };

async function loadCircle(targetId: string, viewerId: string): Promise<Loaded> {
  const self = targetId === viewerId;
  const mention = `<@${targetId}>`;
  if (!self && await getProfilePrivate(targetId)) return { error: msg("common.profilePrivate", { user: mention }) };
  const circlePublic = await getCirclePublic(targetId);
  if (!self && !circlePublic) return { error: msg("circle.private", { user: mention }) };

  const friendCode = await getUserFriendCode(targetId);
  const cached = friendCode ? await getCachedProfile(friendCode) : null;
  if (!cached) return { error: self ? msg("common.selfNotRegistered") : msg("common.otherNotRegistered", { user: mention }) };

  const circle = circleOf(cached);
  if (circle === undefined) return { error: self ? msg("circle.notCollected") : msg("circle.otherNotCollected", { user: mention }) };
  if (circle === null) return { error: self ? msg("circle.none") : msg("circle.otherNone", { user: mention }) };
  return { circle, cached, circlePublic };
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser("user") ?? interaction.user;
  const loaded = await loadCircle(target.id, interaction.user.id);
  if ("error" in loaded) {
    await interaction.reply({ content: loaded.error, flags: MessageFlags.Ephemeral });
    return;
  }
  const { circle, cached, circlePublic } = loaded;
  const row = circleButtonsRow(circle, target.id);
  const components = row ? [row] : [];
  // 과제곡 제목 번역은 보는 사람의 설정을 따른다.
  const embed = circleEmbed(circle, cached, await getTranslateTitles(interaction.user.id));
  // 비공개인데 본인이 보는 경우엔 채널에 남기지 않는다.
  if (!circlePublic) {
    await interaction.reply({ content: msg("circle.privateSelfNote"), embeds: [embed], components, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.reply({ embeds: [embed], components });
}

/**
 * circle:members:<userId> — 멤버 포인트. circle:challenge:<userId> — 과제곡 검색(누른 사람의 기록).
 * 서클이 공개면 채널에 공개로, 비공개(본인)면 본인에게만.
 */
export async function handleButton(interaction: ButtonInteraction): Promise<void> {
  const [, action, targetId = ""] = interaction.customId.split(":");
  const loaded = await loadCircle(targetId, interaction.user.id);
  if ("error" in loaded) {
    await interaction.reply({ content: loaded.error, flags: MessageFlags.Ephemeral });
    return;
  }
  const flags = loaded.circlePublic ? undefined : MessageFlags.Ephemeral;
  if (action === "members") {
    await interaction.reply({ embeds: [circleMembersEmbed(loaded.circle, loaded.cached)], flags });
    return;
  }
  if (action === "challenge" && loaded.circle.challenge) {
    const friendCode = await getUserFriendCode(interaction.user.id);
    const viewer = friendCode ? await getCachedProfile(friendCode) : null;
    if (!viewer) {
      await interaction.reply({ content: msg("common.selfNotRegistered"), flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags });
    try {
      await interaction.editReply(await searchResultEmbeds(viewer, interaction.user.id, loaded.circle.challenge.title, 0));
    } catch (e) {
      console.error("[circle-challenge]", e);
      await interaction.editReply({ content: msg("search.failed") }).catch(() => {});
    }
  }
}
