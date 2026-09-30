import { EmbedBuilder, escapeMarkdown } from "discord.js";
import type { CircleInfo } from "../../scraper";
import type { CachedProfile } from "../../storage/types";
import { msg } from "../../messages";

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
// 멤버는 최대 20명이라 한 필드(1024자)에 대부분 들어가지만, 이름이 길면 잘라 낸다.
const FIELD_MAX = 1024;

export function circleEmbed(circle: CircleInfo, profile: CachedProfile): EmbedBuilder {
  const synced = new Date(profile.lastSyncedAt);
  const month = Number(synced.toLocaleString("en-US", { timeZone: "Asia/Seoul", month: "numeric" }));
  const emb = new EmbedBuilder()
    .setColor(0xff9294)
    .setTitle(`🎪 ${circle.name}`)
    .setFooter({
      text: msg("circle.footer", {
        player: profile.playerName || msg("embed.noName"),
        server: profile.server === "jp" ? "JP" : "INTERNATIONAL",
        synced: synced.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
      }),
    });
  if (circle.comment) emb.setDescription(escapeMarkdown(circle.comment));

  const fields: { name: string; value: string; inline?: boolean }[] = [];
  if (circle.code) fields.push({ name: msg("circle.codeField"), value: `\`${circle.code}\``, inline: true });
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
        title: escapeMarkdown(circle.challenge.title),
        artist: escapeMarkdown(circle.challenge.artist),
        achievement: circle.challenge.achievement || "—",
      }),
    });
    if (circle.challenge.jacket) emb.setThumbnail(circle.challenge.jacket);
  }

  // 이번 달 포인트 순. 동점이면 DX NET 순서(리더가 맨 앞)를 유지한다.
  const members = circle.members.map((m, i) => ({ m, i })).sort((a, b) => b.m.points - a.m.points || a.i - b.i);
  let list = "";
  members.forEach(({ m }, idx) => {
    const line = msg("circle.memberLine", {
      rank: idx + 1,
      leader: m.leader ? msg("circle.leaderMark") : "",
      name: escapeMarkdown(m.name),
      rating: m.rating || "—",
      points: fmt(m.points),
    });
    if (list.length + line.length + 1 <= FIELD_MAX - 2) list += (list ? "\n" : "") + line;
  });
  fields.push({ name: msg("circle.membersField"), value: list || msg("circle.membersMissing") });

  emb.addFields(fields);
  return emb;
}
