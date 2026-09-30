import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, escapeMarkdown } from "discord.js";
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

function footerOf(profile: CachedProfile): { text: string } {
  return {
    text: msg("circle.footer", {
      player: profile.playerName || msg("embed.noName"),
      server: profile.server === "jp" ? "JP" : "INTERNATIONAL",
      synced: new Date(profile.lastSyncedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
    }),
  };
}

export function circleEmbed(circle: CircleInfo, profile: CachedProfile): EmbedBuilder {
  const synced = new Date(profile.lastSyncedAt);
  const month = Number(synced.toLocaleString("en-US", { timeZone: "Asia/Seoul", month: "numeric" }));
  const emb = new EmbedBuilder()
    .setColor(0xff9294)
    .setTitle(circle.name)
    .setFooter(footerOf(profile));
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

  emb.addFields(fields);
  return emb;
}

// customId: circle:members:<조회 대상 userId>. 라우터는 src/bot/index.ts.
export function circleMembersRow(targetUserId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`circle:members:${targetUserId}`).setLabel(msg("circle.membersButton")).setStyle(ButtonStyle.Secondary),
  );
}

// 코드 블록 안에서 열을 맞추기 위한 표시 폭. 한글·가나·한자·전각 기호는 2칸으로 센다.
function cellWidth(ch: string): number {
  const c = ch.codePointAt(0) ?? 0;
  return (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) ||
    (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe4f) || (c >= 0xff00 && c <= 0xff60) || (c >= 0xffe0 && c <= 0xffe6) ||
    (c >= 0x1f300 && c <= 0x1faff) || (c >= 0x20000 && c <= 0x3fffd)
    ? 2 : 1;
}
const textWidth = (s: string) => Array.from(s).reduce((w, ch) => w + cellWidth(ch), 0);
const padEnd = (s: string, w: number) => s + " ".repeat(Math.max(0, w - textWidth(s)));
const padStart = (s: string, w: number) => " ".repeat(Math.max(0, w - textWidth(s))) + s;

/** 멤버 포인트 표. 전각 영숫자(ＲＯＥＮＡ)는 반각으로 바꿔 폭을 줄이고, 코드 블록으로 열을 맞춘다. */
export function circleMembersEmbed(circle: CircleInfo, profile: CachedProfile): EmbedBuilder {
  const emb = new EmbedBuilder()
    .setColor(0xff9294)
    .setTitle(msg("circle.membersTitle", { name: circle.name }))
    .setFooter(footerOf(profile));
  if (!circle.members.length) return emb.setDescription(msg("circle.membersMissing"));

  // 이번 달 포인트 순. 동점이면 DX NET 순서(리더가 맨 앞)를 유지한다.
  const members = circle.members.map((m, i) => ({ m, i })).sort((a, b) => b.m.points - a.m.points || a.i - b.i).map(({ m }) => m);
  const rows = members.map((m, idx) => ({
    rank: `${idx + 1}${m.leader ? "*" : ""}`,
    name: m.name.normalize("NFKC").replace(/`/g, "'"),
    points: fmt(m.points),
    rating: m.rating ? String(m.rating) : "-",
  }));
  const head = { rank: "#", name: "PLAYER", points: "POINT", rating: "RATING" };
  const w = {
    rank: Math.max(...[head, ...rows].map((r) => textWidth(r.rank))),
    name: Math.max(...[head, ...rows].map((r) => textWidth(r.name))),
    points: Math.max(...[head, ...rows].map((r) => textWidth(r.points))),
    rating: Math.max(...[head, ...rows].map((r) => textWidth(r.rating))),
  };
  const line = (r: typeof head) => [padEnd(r.rank, w.rank), padEnd(r.name, w.name), padStart(r.points, w.points), padStart(r.rating, w.rating)].join("  ").trimEnd();
  const table = [line(head), ...rows.map(line)].join("\n");
  const note = members.some((m) => m.leader) ? `\n${msg("circle.leaderNote")}` : "";
  return emb.setDescription(`\`\`\`\n${table}\n\`\`\`${note}`);
}
