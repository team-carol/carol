import {
  EmbedBuilder, AttachmentBuilder,
  ButtonBuilder, ButtonStyle, ActionRowBuilder,
} from "discord.js";
import { getCachedProfile, getAvatarBlob, getSongJacket, saveSongJacket } from "../../db";
import { getConstant, getJacketFile, levelToNumber, calcSongRating } from "../../constants";
import { ratingColor } from "./roles";
import type { PlayRecord } from "../../scraper";

// 곡 자켓 버퍼: DB 캐시 → maimai net(musicId) → otoge-db(title) 순으로 확보하고 캐시
export async function jacketBuffer(r: PlayRecord): Promise<Buffer | null> {
  const m = r.jacketUrl?.match(/\/img\/Music\/([^.]+)\.png/);
  const musicId = m ? m[1] : null;
  if (musicId) {
    const cached = getSongJacket(musicId);
    if (cached) return cached;
    try {
      const res = await fetch(`https://maimaidx-eng.com/maimai-mobile/img/Music/${musicId}.png`);
      if (res.ok) { const b = Buffer.from(await res.arrayBuffer()); saveSongJacket(musicId, b); return b; }
    } catch { /* ignore */ }
  }
  const file = getJacketFile(r.title);
  if (file) {
    const key = file.replace(/\.png$/, "");
    const cached = getSongJacket(key);
    if (cached) return cached;
    try {
      const res = await fetch(`https://otoge-db.net/maimai/jacket/${file}`);
      if (res.ok) { const b = Buffer.from(await res.arrayBuffer()); saveSongJacket(key, b); return b; }
    } catch { /* ignore */ }
  }
  return null;
}

export function sep(label: string, totalW = 36): string {
  const frame = Math.max(0, totalW - label.length - 2);
  const left = "─".repeat(Math.floor(frame / 2));
  const right = "─".repeat(Math.ceil(frame / 2));
  return left + " " + label + " " + right;
}

function isFullWidth(ch: string): boolean {
  const code = ch.codePointAt(0) || 0;
  return (
    (code >= 0x1100 && code <= 0x115F) ||
    (code >= 0x2E80 && code <= 0x303E) ||
    (code >= 0x3041 && code <= 0x33FF) ||
    (code >= 0x3400 && code <= 0x4DBF) ||
    (code >= 0x4E00 && code <= 0x9FFF) ||
    (code >= 0xA000 && code <= 0xA4CF) ||
    (code >= 0xAC00 && code <= 0xD7A3) ||
    (code >= 0xF900 && code <= 0xFAFF) ||
    (code >= 0xFE30 && code <= 0xFE4F) ||
    (code >= 0xFF00 && code <= 0xFF60) ||
    (code >= 0xFFE0 && code <= 0xFFE6) ||
    (code >= 0x20000 && code <= 0x2FFFD) ||
    (code >= 0x30000 && code <= 0x3FFFD)
  );
}

function visualWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += isFullWidth(ch) ? 2 : 1;
  return w;
}

function truncateVisual(s: string, maxWidth: number): string {
  if (visualWidth(s) <= maxWidth) return s;
  let w = 0;
  let result = "";
  for (const ch of s) {
    const chW = isFullWidth(ch) ? 2 : 1;
    if (w + chW + 1 > maxWidth) break;
    result += ch;
    w += chW;
  }
  return result + "…";
}

// 곡별 레이팅 점수 (상수 → 정수 상수, 없으면 레벨 근사)
function songRating(r: PlayRecord): number {
  const constant = getConstant(r.title, r.musicKind, r.diff);
  const lvNum = constant !== null ? constant : levelToNumber(r.level);
  return calcSongRating(r.achievementVal, lvNum);
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

export function getClearList(p: NonNullable<ReturnType<typeof getCachedProfile>>): PlayRecord[] {
  const raw = JSON.parse(p.clearJson || "[]");
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

export async function recentEmbeds(
  p: NonNullable<ReturnType<typeof getCachedProfile>>,
  userId: string,
  gameIdx: number,
): Promise<{ embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[]; files: AttachmentBuilder[] }> {
  const records = getSongList(p);
  const games = groupByGame(records);
  const total = games.length;

  if (total === 0) {
    return {
      embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription("기록 없음")],
      components: [],
      files: [],
    };
  }

  const idx = Math.max(0, Math.min(gameIdx, total - 1));
  const game = games[idx];
  const files: AttachmentBuilder[] = [];

  const embeds = await Promise.all(game.map(async (r, i) => {
    const kind = r.musicKind ? ` [${r.musicKind}]` : "";
    const rankStr = [r.fc, r.sync].filter(Boolean).join(" · ");
    const constant = getConstant(r.title, r.musicKind, r.diff);
    const lv = constant !== null ? constant.toFixed(1) : r.level;
    const desc = `\`${r.diff} ${lv}\`` + (rankStr ? `  ·  \`${rankStr}\`` : "");
    const emb = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setAuthor({ name: sep("#" + (i + 1), 34) })
      .setTitle(truncateVisual(r.title, 26) + kind)
      .setDescription(desc)
      .addFields(
        { name: "달성률", value: r.achievement, inline: true },
        { name: "플레이일", value: r.date || "-", inline: true },
      );
    const buf = await jacketBuffer(r);
    if (buf) {
      const name = `jacket${i}.png`;
      files.push(new AttachmentBuilder(buf, { name }));
      emb.setThumbnail(`attachment://${name}`);
    }
    return emb;
  }));

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

  return { embeds, components: [navRow, shareRow], files };
}

export async function searchResultEmbeds(
  p: NonNullable<ReturnType<typeof getCachedProfile>>,
  userId: string,
  query: string,
  pageIdx: number,
): Promise<{ embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[]; files: AttachmentBuilder[] }> {
  const records = getClearList(p);
  const q = query.toLowerCase();
  const matches = records
    .filter((r) => r.title.toLowerCase().includes(q))
    .sort((a, b) => b.achievementVal - a.achievementVal);

  if (matches.length === 0) {
    return {
      embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription(`"${query}" 검색 결과 없음`)],
      components: [],
      files: [],
    };
  }

  const PAGE_SIZE = 5;
  const total = matches.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const idx = Math.max(0, Math.min(pageIdx, totalPages - 1));
  const page = matches.slice(idx * PAGE_SIZE, (idx + 1) * PAGE_SIZE);
  const files: AttachmentBuilder[] = [];

  const embeds = await Promise.all(page.map(async (r, i) => {
    const kind = r.musicKind ? ` [${r.musicKind}]` : "";
    const rankStr = [r.fc, r.sync].filter(Boolean).join(" · ");
    const constant = getConstant(r.title, r.musicKind, r.diff);
    const lv = constant !== null ? constant.toFixed(1) : r.level;
    const desc = `\`${r.diff} ${lv}\`` + (rankStr ? `  ·  \`${rankStr}\`` : "");
    const emb = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setAuthor({ name: sep("#" + (idx * PAGE_SIZE + i + 1), 34) })
      .setTitle(truncateVisual(r.title, 26) + kind)
      .setDescription(desc)
      .addFields(
        { name: "달성률", value: r.achievement, inline: true },
        { name: "레벨", value: lv, inline: true },
      );
    const buf = await jacketBuffer(r);
    if (buf) {
      const name = `sjacket${i}.png`;
      files.push(new AttachmentBuilder(buf, { name }));
      emb.setThumbnail(`attachment://${name}`);
    }
    return emb;
  }));

  const qEnc = encodeURIComponent(query);
  const prevBtn = new ButtonBuilder()
    .setCustomId(`search:${userId}:${qEnc}:${idx - 1}`)
    .setLabel("◀ 이전")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(idx === 0);
  const countBtn = new ButtonBuilder()
    .setCustomId("search_noop")
    .setLabel(`${idx + 1} / ${totalPages}`)
    .setStyle(ButtonStyle.Primary)
    .setDisabled(true);
  const nextBtn = new ButtonBuilder()
    .setCustomId(`search:${userId}:${qEnc}:${idx + 1}`)
    .setLabel("다음 ▶")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(idx === totalPages - 1);

  const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(prevBtn, countBtn, nextBtn);

  return { embeds, components: [navRow], files };
}

const DIFF_ABBR: Record<string, string> = {
  BASIC: "BAS", ADVANCED: "ADV", EXPERT: "EXP", MASTER: "MAS", "Re:MASTER": "ReM",
};

// RS를 곡명 앞에 둠: 곡명(가변 폭, CJK 포함)을 마지막에 두어야 정렬이 깨지지 않음
const RT_HEADER = " # Dif Kd Lv      Score   RS  Title";

function formatRtRow(r: PlayRecord, rank: number): string {
  const rankStr = String(rank).padStart(2);
  const diff = DIFF_ABBR[r.diff] ?? "???";
  const kind = (r.musicKind || "  ").padEnd(2);
  const constant = getConstant(r.title, r.musicKind, r.diff);
  const lv = (constant !== null ? constant.toFixed(1) : r.level).padEnd(4);
  const ach = (r.achievementVal > 0 ? r.achievementVal.toFixed(4) + "%" : r.achievement).padStart(9);
  const rs = String(songRating(r)).padStart(3);
  const title = truncateVisual(r.title, 26);
  return `${rankStr} ${diff} ${kind} ${lv} ${ach}  ${rs}  ${title}`;
}

export function rtTableEmbed(
  p: NonNullable<ReturnType<typeof getCachedProfile>>,
): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
  const records = getTopList(p);

  if (records.length === 0) {
    return {
      embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription("레이팅 기록 없음\n북마클릿을 다시 실행하면 업데이트됩니다.")],
      components: [],
    };
  }

  const newRecords = records.slice(0, 15);
  const otherRecords = records.slice(15, 50);

  const newRows = newRecords.map((r, i) => formatRtRow(r, i + 1));
  const otherRows = otherRecords.map((r, i) => formatRtRow(r, i + 1));

  // 구분선 길이를 가장 긴 행(보통 ASCII 곡명)에 맞춰 표 너비와 일치시킴
  const maxW = Math.max(visualWidth(RT_HEADER), ...newRows.map(visualWidth), ...otherRows.map(visualWidth));
  const divider = "─".repeat(maxW);
  const withSeps = (rows: string[]) =>
    rows.flatMap((row, i) => (i > 0 && i % 5 === 0 ? [divider, row] : [row]));

  const newBlock = "```\n" + RT_HEADER + "\n" + withSeps(newRows).join("\n") + "\n```";
  const otherBlock = "```\n" + RT_HEADER + "\n" + withSeps(otherRows).join("\n") + "\n```";

  const desc =
    `**신곡 NEW · ${newRecords.length}곡**\n${newBlock}\n` +
    `**구곡 OTHERS · ${otherRecords.length}곡**\n${otherBlock}`;

  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0x2b2d31)
        .setAuthor({ name: sep("레이팅 대상곡") })
        .setDescription(desc)
        .setFooter({ text: `총 ${newRecords.length + otherRecords.length}곡  ·  RS=곡별 레이팅 점수 (AP 보너스 미반영, 실제와 다를 수 있음)` }),
    ],
    components: [],
  };
}

export function buildProfileReply(
  cached: NonNullable<ReturnType<typeof getCachedProfile>>,
  userId: string,
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
