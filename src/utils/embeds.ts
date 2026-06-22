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

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, Math.max(0, max - 1)) + "…" : s;
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

export function getTopList(p: NonNullable<ReturnType<typeof getCachedProfile>>): PlayRecord[] {
  const raw = JSON.parse(p.topJson || "[]");
  return Array.isArray(raw) ? raw : [];
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
    const desc = `\`${r.diff} ${r.level}\`` + (rankStr ? `  ·  \`${rankStr}\`` : "");
    const emb = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setAuthor({ name: sep("#" + (i + 1), 34) })
      .setTitle(truncate(r.title, 15 - kind.length) + kind)
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

  const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(prevBtn, countBtn, nextBtn);

  const shareRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    game.map((_, si) =>
      new ButtonBuilder()
        .setCustomId(`share:${userId}:${idx}:${si}`)
        .setLabel(`#${si + 1} 공유`)
        .setStyle(ButtonStyle.Success),
    ),
  );

  return { embeds, components: [navRow, shareRow] };
}

const TOP_PAGE_SIZE = 5;

export function rtEmbeds(
  p: NonNullable<ReturnType<typeof getCachedProfile>>,
  userId: string,
  port: number,
  pageIdx: number,
): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
  const records = getTopList(p);

  if (records.length === 0) {
    return {
      embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription("레이팅 기록 없음\n북마클릿을 다시 실행하면 업데이트됩니다.")],
      components: [],
    };
  }

  const totalPages = Math.ceil(records.length / TOP_PAGE_SIZE);
  const idx = Math.max(0, Math.min(pageIdx, totalPages - 1));
  const start = idx * TOP_PAGE_SIZE;
  const page = records.slice(start, start + TOP_PAGE_SIZE);
  const server = getBaseUrl(port);

  const embeds = page.map((r, i) => {
    const rank = start + i + 1;
    const kind = r.musicKind ? ` [${r.musicKind}]` : "";
    const musicIdMatch = r.jacketUrl?.match(/\/img\/Music\/([^.]+)\.png/);
    const jacketSrc = musicIdMatch ? `${server}/jacket?id=${musicIdMatch[1]}` : null;
    const rankStr = [r.fc, r.sync].filter(Boolean).join(" · ");
    const desc = `\`${r.diff} ${r.level}\`` + (rankStr ? `  ·  \`${rankStr}\`` : "");
    const emb = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setAuthor({ name: sep(`#${rank}`, 34) })
      .setTitle(truncate(r.title, 15 - kind.length) + kind)
      .setDescription(desc)
      .addFields({ name: "달성률", value: r.achievement, inline: true });
    if (jacketSrc) emb.setThumbnail(jacketSrc);
    return emb;
  });

  const prevBtn = new ButtonBuilder()
    .setCustomId(`rtpage:${userId}:${idx - 1}`)
    .setLabel("◀ 이전")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(idx === 0);
  const countBtn = new ButtonBuilder()
    .setCustomId("rtpage_noop")
    .setLabel(`${idx + 1} / ${totalPages}`)
    .setStyle(ButtonStyle.Primary)
    .setDisabled(true);
  const nextBtn = new ButtonBuilder()
    .setCustomId(`rtpage:${userId}:${idx + 1}`)
    .setLabel("다음 ▶")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(idx === totalPages - 1);

  const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(prevBtn, countBtn, nextBtn);

  const shareRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    page.map((_, si) =>
      new ButtonBuilder()
        .setCustomId(`rtshare:${userId}:${idx}:${si}`)
        .setLabel(`#${start + si + 1} 공유`)
        .setStyle(ButtonStyle.Success),
    ),
  );

  return { embeds, components: [navRow, shareRow] };
}

export function buildProfileReply(
  cached: NonNullable<ReturnType<typeof getCachedProfile>>,
  userId: string,
  port: number,
) {
  const avatar = buildAvatarAttachment(userId);
  const recentBtn = new ButtonBuilder()
    .setCustomId(`recent:${userId}`)
    .setLabel("최근 플레이")
    .setStyle(ButtonStyle.Secondary);
  const topBtn = new ButtonBuilder()
    .setCustomId(`rt:${userId}`)
    .setLabel("레이팅 대상곡")
    .setStyle(ButtonStyle.Primary);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(recentBtn, topBtn);
  return {
    embeds: [profileEmb(cached, !!avatar)],
    files: avatar ? [avatar] : [],
    components: [row],
  };
}
