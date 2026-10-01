import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, escapeMarkdown } from "discord.js";
import type { CircleInfo } from "../../scraper";
import type { CachedProfile } from "../../storage/types";
import { msg } from "../../messages";
import { displayTitle } from "../../aliases";
import { getTitleByJacket } from "../../constants";
import { CIRCLE_COLOR_STYLE } from "./circleColors";

/**
 * profiles.circle_json 해석.
 * - CircleInfo: 가입한 서클
 * - null: 가입한 서클 없음(동기화 때 확인됨)
 * - undefined: 아직 수집 전(이 기능 이전에 동기화했거나 서클 페이지를 못 받음)
 */
export function circleOf(profile: Pick<CachedProfile, "circleJson">): CircleInfo | null | undefined {
  const raw = profile.circleJson ?? "";
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && typeof parsed.name === "string" ? (parsed as CircleInfo) : null;
  } catch {
    return undefined;
  }
}

const fmt = (n: number) => n.toLocaleString("en-US");

function footerOf(profile: CachedProfile): { text: string } {
  return {
    text: msg("circle.footer", {
      player: profile.playerName || msg("embed.noName"),
      server: profile.server === "jp" ? "JP" : "INTERNATIONAL",
      synced: new Date(profile.lastSyncedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
    }),
  };
}

export function circleEmbed(circle: CircleInfo, profile: CachedProfile, translate = false): EmbedBuilder {
  const synced = new Date(profile.lastSyncedAt);
  const month = Number(synced.toLocaleString("en-US", { timeZone: "Asia/Seoul", month: "numeric" }));
  const emb = new EmbedBuilder()
    // 서클 프로필 색상이 있으면 임베드 테두리도 그 색으로.
    .setColor(circle.color ? CIRCLE_COLOR_STYLE[circle.color].main : 0xff9294)
    .setTitle(circle.name)
    .setFooter(footerOf(profile));
  if (circle.comment) emb.setDescription(escapeMarkdown(circle.comment));

  const fields: { name: string; value: string; inline?: boolean }[] = [];
  if (circle.code) fields.push({ name: msg("circle.codeField"), value: `\`${circle.code}\``, inline: true });
  if (circle.color) fields.push({ name: msg("circle.colorField"), value: msg(`circleColor.${circle.color}`), inline: true });
  if (circle.progress) fields.push({ name: msg("circle.progressField"), value: msg("circle.progressValue", { stage: msg(`circleColor.${circle.progress}`) }), inline: true });
  if (circle.memberCount !== null) {
    fields.push({ name: msg("circle.memberField"), value: msg("circle.memberValue", { count: circle.memberCount, max: circle.memberMax ?? "?" }), inline: true });
  }
  if (circle.monthPoints !== null) {
    fields.push({
      name: msg("circle.pointField", { month }),
      value: msg("circle.pointValue", {
        points: fmt(circle.monthPoints),
        reset: circle.daysToReset === 0 ? msg("circle.resetToday") : msg("circle.resetDays", { days: circle.daysToReset ?? "?" }),
      }),
      inline: true,
    });
  }
  if (circle.rank !== null) {
    fields.push({ name: msg("circle.rankField"), value: msg("circle.rankValue", { rank: fmt(circle.rank), updated: circle.rankUpdatedAt || "?" }), inline: true });
  }
  if (circle.nextRewardPoints !== null) {
    fields.push({ name: msg("circle.rewardField"), value: msg("circle.rewardValue", { points: fmt(circle.nextRewardPoints) }), inline: true });
  }
  if (circle.challenge) {
    fields.push({
      name: msg("circle.challengeField"),
      value: msg("circle.challengeValue", {
        title: escapeMarkdown(displayTitle(circle.challenge.title, translate)),
        artist: escapeMarkdown(circle.challenge.artist),
        achievement: circle.challenge.achievement || "—",
      }),
    });
    if (circle.challenge.jacket) emb.setThumbnail(circle.challenge.jacket);
  }
  if (circle.forecastJacket) {
    const title = getTitleByJacket(circle.forecastJacket);
    fields.push({ name: msg("circle.forecastField"), value: title ? `**${escapeMarkdown(displayTitle(title, translate))}**` : msg("circle.forecastUnknown") });
  }

  emb.addFields(fields);
  return emb;
}

// customId: circle:<members|challenge>:<조회 대상 userId>. 라우터는 src/bot/index.ts.
export function circleButtonsRow(circle: CircleInfo, targetUserId: string, withMembers = true): ActionRowBuilder<ButtonBuilder> | null {
  const buttons: ButtonBuilder[] = [];
  if (circle.challenge) {
    buttons.push(new ButtonBuilder().setCustomId(`circle:challenge:${targetUserId}`).setLabel(msg("circle.challengeButton")).setStyle(ButtonStyle.Primary));
  }
  if (withMembers && circle.members.length) {
    buttons.push(new ButtonBuilder().setCustomId(`circle:members:${targetUserId}`).setLabel(msg("circle.membersButton")).setStyle(ButtonStyle.Secondary));
  }
  return buttons.length ? new ActionRowBuilder<ButtonBuilder>().addComponents(buttons) : null;
}

/** 멤버 포인트(이번 달 포인트 순). 최대 20명이라 본 임베드와 나눠 버튼으로 띄운다. */
export function circleMembersEmbed(circle: CircleInfo, profile: CachedProfile): EmbedBuilder {
  const emb = new EmbedBuilder()
    .setColor(0xff9294)
    .setTitle(msg("circle.membersTitle", { name: circle.name }))
    .setFooter(footerOf(profile));
  // 동점이면 DX NET 순서(리더가 맨 앞)를 유지한다.
  const members = circle.members.map((m, i) => ({ m, i })).sort((a, b) => b.m.points - a.m.points || a.i - b.i).map(({ m }) => m);
  const lines = members.map((m, idx) => msg("circle.memberLine", {
    rank: idx + 1,
    leader: m.leader ? msg("circle.leaderMark") : "",
    name: escapeMarkdown(m.name),
    rating: m.rating || "—",
    points: fmt(m.points),
  }));
  return emb.setDescription(lines.join("\n") || msg("circle.membersMissing"));
}
