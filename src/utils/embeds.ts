import {
  EmbedBuilder, AttachmentBuilder,
  ButtonBuilder, ButtonStyle, ActionRowBuilder,
} from "discord.js";
import { getCachedProfile, getAvatarBlob } from "../db";
import { getBaseUrl } from "../web";
import { ratingColor } from "./roles";
import type { PlayRecord } from "../scraper";

export function sep(label: string, totalW = 36): string {
  const frame = Math.max(0, totalW - label.length - 2);
  const left = "─".repeat(Math.floor(frame / 2));
  const right = "─".repeat(Math.ceil(frame / 2));
  return left + " " + label + " " + right;
}

export function buildAvatarAttachment(userId: string): AttachmentBuilder | null {
  const buf = getAvatarBlob(userId);
  if (!buf) return null;
  return new AttachmentBuilder(buf, { name: "avatar.png" });
}

export function profileEmb(
  p: NonNullable<ReturnType<typeof getCachedProfile>>,
  hasAvatar: boolean,
) {
  const stars = p.stars && p.stars !== "0" ? " · ★×" + p.stars : "";
  const emb = new EmbedBuilder()
    .setColor(ratingColor(p.rating))
    .setAuthor({ name: sep("Profile") })
    .setTitle(p.trophy || "칭호 없음")
    .setDescription(
      `**${p.playerName || "이름 없음"}**  ·  **${p.rating || 0}**\n` +
      `플레이 ${p.playCount || 0}회${stars}`,
    )
    .setFooter({ text: `마지막 동기화: ${new Date(p.lastSyncedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}` });
  if (hasAvatar) emb.setThumbnail("attachment://avatar.png");
  return emb;
}

export function getSongList(p: NonNullable<ReturnType<typeof getCachedProfile>>): PlayRecord[] {
  const raw = JSON.parse(p.recentJson || "{}");
  return Array.isArray(raw) ? raw : (raw.recent || []);
}

export function groupByGame(records: PlayRecord[]): PlayRecord[][] {
  const games: PlayRecord[][] = [];
  let current: PlayRecord[] = [];
  for (const r of records) {
    if (r.track <= 1 && current.length > 0) {
      games.push(current);
      current = [];
    }
    current.push(r);
  }
  if (current.length > 0) games.push(current);
  return games;
}

export function recentEmbeds(
  p: NonNullable<ReturnType<typeof getCachedProfile>>,
  userId: string,
  port: number,
  gameIdx: number,
): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
  const records = getSongList(p);
  const games = groupByGame(records);
  const total = games.length;

  if (total === 0) {
    return {
      embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription("기록 없음")],
      components: [],
    };
  }

  const idx = Math.max(0, Math.min(gameIdx, total - 1));
  const game = games[idx];
  const server = getBaseUrl(port);

  const embeds = game.map((r, i) => {
    const kind = r.musicKind ? ` [${r.musicKind}]` : "";
    const musicIdMatch = r.jacketUrl?.match(/\/img\/Music\/([^.]+)\.png/);
    const jacketSrc = musicIdMatch ? `${server}/jacket?id=${musicIdMatch[1]}` : null;
    const rankStr = [r.fc, r.sync].filter(Boolean).join(" · ");
    const desc = `\`${r.diff} ${r.level}\`` + (rankStr ? `  ·  **${rankStr}**` : "");
    const emb = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setAuthor({ name: sep("#" + (i + 1), 34) })
      .setTitle(r.title + kind)
      .setDescription(desc)
      .addFields(
        { name: "달성률", value: r.achievement, inline: true },
        { name: "플레이일", value: r.date || "-", inline: true },
      );
    if (jacketSrc) emb.setThumbnail(jacketSrc);
    return emb;
  });

  const prevBtn = new ButtonBuilder()
    .setCustomId(`page:${userId}:${idx - 1}`)
    .setLabel("◀ 이전 게임")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(idx === 0);
  const countBtn = new ButtonBuilder()
    .setCustomId("page_noop")
    .setLabel(`${idx + 1} / ${total}`)
    .setStyle(ButtonStyle.Primary)
    .setDisabled(true);
  const nextBtn = new ButtonBuilder()
    .setCustomId(`page:${userId}:${idx + 1}`)
    .setLabel("다음 게임 ▶")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(idx === total - 1);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(prevBtn, countBtn, nextBtn);
  return { embeds, components: [row] };
}

export function buildProfileReply(
  cached: NonNullable<ReturnType<typeof getCachedProfile>>,
  userId: string,
  port: number,
) {
  const avatar = buildAvatarAttachment(userId);
  const btn = new ButtonBuilder()
    .setCustomId(`recent:${userId}`)
    .setLabel("최근 플레이")
    .setStyle(ButtonStyle.Secondary);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(btn);
  return {
    embeds: [profileEmb(cached, !!avatar)],
    files: avatar ? [avatar] : [],
    components: [row],
  };
}
