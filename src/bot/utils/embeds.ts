import {
  EmbedBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from "discord.js";
import {
  getCachedProfile,
  getAvatarBlob,
  getSongJacket,
  saveSongJacket,
} from "../../db";
import {
  getConstant,
  getJacketFile,
  levelToNumber,
  calcSongRating,
} from "../../constants";
import { aliasMatches, normalizeQuery } from "../../aliases";
import { ratingColor } from "./roles";
import { buildMarkMap, buildKindResolver, chartKey } from "../../scraper";
import type { PlayRecord, ChartMarks } from "../../scraper";

// 곡 자켓 버퍼: DB 캐시 → maimai net(musicId) → otoge-db(title) 순으로 확보하고 캐시
export async function jacketBuffer(r: PlayRecord): Promise<Buffer | null> {
  const m = r.jacketUrl?.match(/\/img\/Music\/([^.]+)\.png/);
  const musicId = m ? m[1] : null;
  if (musicId) {
    const cached = getSongJacket(musicId);
    if (cached) return cached;
    try {
      const res = await fetch(
        `https://maimaidx-eng.com/maimai-mobile/img/Music/${musicId}.png`,
      );
      if (res.ok) {
        const b = Buffer.from(await res.arrayBuffer());
        saveSongJacket(musicId, b);
        return b;
      }
    } catch {
      /* ignore */
    }
  }
  const file = getJacketFile(r.title);
  if (file) {
    const key = file.replace(/\.png$/, "");
    const cached = getSongJacket(key);
    if (cached) return cached;
    try {
      const res = await fetch(`https://otoge-db.net/maimai/jacket/${file}`);
      if (res.ok) {
        const b = Buffer.from(await res.arrayBuffer());
        saveSongJacket(key, b);
        return b;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function sep(label: string, totalW = 36): string {
  if (!label) return "─".repeat(totalW);
  const frame = Math.max(0, totalW - label.length - 2);
  const left = "─".repeat(Math.floor(frame / 2));
  const right = "─".repeat(Math.ceil(frame / 2));
  return left + " " + label + " " + right;
}

function isFullWidth(ch: string): boolean {
  const code = ch.codePointAt(0) || 0;
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0x303e) ||
    (code >= 0x3041 && code <= 0x33ff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xa000 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x20000 && code <= 0x2fffd) ||
    (code >= 0x30000 && code <= 0x3fffd)
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
// fc: AP 보너스 판정용 마크. 미지정 시 레코드 자체의 r.fc 사용.
function songRating(r: PlayRecord, fc?: string): number {
  const constant = getConstant(r.title, r.musicKind, r.diff);
  const lvNum = constant !== null ? constant : levelToNumber(r.level);
  return calcSongRating(r.achievementVal, lvNum, fc ?? r.fc);
}

export function buildAvatarAttachment(
  userId: string,
): AttachmentBuilder | null {
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
    .setTitle(p.trophy || "칭호 없음")
    .setDescription(
      `**${p.playerName || "이름 없음"}**  ·  **${p.rating || 0}**\n` +
        `플레이 ${p.playCount || 0}회${stars}`,
    )
    .setFooter({
      text: `마지막 동기화: ${new Date(p.lastSyncedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`,
    });
  if (hasAvatar) emb.setThumbnail("attachment://avatar.png");
  return emb;
}

export function getSongList(
  p: NonNullable<ReturnType<typeof getCachedProfile>>,
): PlayRecord[] {
  const raw = JSON.parse(p.recentJson || "{}");
  return Array.isArray(raw) ? raw : raw.recent || [];
}

export function getTopList(
  p: NonNullable<ReturnType<typeof getCachedProfile>>,
): PlayRecord[] {
  const raw = JSON.parse(p.topJson || "[]");
  return Array.isArray(raw) ? raw : [];
}

export function getClearList(
  p: NonNullable<ReturnType<typeof getCachedProfile>>,
): PlayRecord[] {
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
): Promise<{
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
  files: AttachmentBuilder[];
}> {
  const records = getSongList(p);
  const games = groupByGame(records);
  const total = games.length;

  if (total === 0) {
    return {
      embeds: [
        new EmbedBuilder().setColor(0x2b2d31).setDescription("기록 없음"),
      ],
      components: [],
      files: [],
    };
  }

  const idx = Math.max(0, Math.min(gameIdx, total - 1));
  const game = games[idx];
  const files: AttachmentBuilder[] = [];

  const embeds = await Promise.all(
    game.map(async (r, i) => {
      const kind = r.musicKind ? ` [${r.musicKind}]` : "";
      const rankStr = [r.fc, r.sync].filter(Boolean).join(" · ");
      const constant = getConstant(r.title, r.musicKind, r.diff);
      const lv = constant !== null ? constant.toFixed(1) : r.level;
      const desc =
        `\`${r.diff} ${lv}\`` + (rankStr ? `  ·  \`${rankStr}\`` : "");
      const emb = new EmbedBuilder()
        .setColor(0x2b2d31)
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
    }),
  );

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

  const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    prevBtn,
    countBtn,
    nextBtn,
  );

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
): Promise<{
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
  files: AttachmentBuilder[];
}> {
  const records = getClearList(p);
  const q = normalizeQuery(query);
  // 같은 곡명이라도 ST/DX 채보는 별도 결과로 분리 (musicKind 포함 키로 그룹핑)
  const byChart = new Map<string, PlayRecord[]>();
  for (const r of records) {
    // 곡명 또는 별명(NeonDB)에 부분 일치
    if (!normalizeQuery(r.title).includes(q) && !aliasMatches(r.title, q))
      continue;
    const key = `${r.musicKind || ""}|${r.title}`;
    const arr = byChart.get(key) ?? [];
    arr.push(r);
    byChart.set(key, arr);
  }
  const keys = Array.from(byChart.entries())
    .sort(([, a], [, b]) => {
      // 곡명이 검색어와 완전 일치하는 곡을 최상단으로
      const exactA = normalizeQuery(a[0].title) === q ? 1 : 0;
      const exactB = normalizeQuery(b[0].title) === q ? 1 : 0;
      if (exactA !== exactB) return exactB - exactA;
      return (
        Math.max(...b.map((r) => r.achievementVal)) -
        Math.max(...a.map((r) => r.achievementVal))
      );
    })
    .map(([k]) => k);

  if (keys.length === 0) {
    return {
      embeds: [
        new EmbedBuilder()
          .setColor(0x2b2d31)
          .setDescription(`"${query}" 검색 결과 없음`),
      ],
      components: [],
      files: [],
    };
  }

  const PAGE_SIZE = 2;
  const totalPages = Math.max(1, Math.ceil(keys.length / PAGE_SIZE));
  const idx = Math.max(0, Math.min(pageIdx, totalPages - 1));
  const pageKeys = keys.slice(idx * PAGE_SIZE, (idx + 1) * PAGE_SIZE);
  const files: AttachmentBuilder[] = [];

  const DIFF_ORDER = ["BASIC", "ADVANCED", "EXPERT", "MASTER", "Re:MASTER"];

  const embeds = await Promise.all(
    pageKeys.map(async (key, i) => {
      const all = byChart.get(key) ?? [];
      const title = all[0]?.title ?? key;
      const kind = all[0]?.musicKind ? ` [${all[0].musicKind}]` : "";
      const lines = DIFF_ORDER.flatMap((d) => {
        const r = all.find((x) => x.diff === d);
        const constant = getConstant(title, all[0]?.musicKind, d);
        if (d === "Re:MASTER" && constant === null && !r) return [];
        const lv = constant !== null ? constant.toFixed(1) : (r?.level ?? "?");
        const ach =
          r && r.achievementVal > 0 ? r.achievementVal.toFixed(4) + "%" : "?";
        const fc = r?.fc || "-";
        const sync = r?.sync || "-";
        return [
          `${d.padEnd(9)} ${ach.padStart(9)}  ${String(lv).padStart(4)}  ${fc.padStart(4)}  ${sync.padStart(4)}`,
        ];
      });
      const buf = await jacketBuffer(
        all[0] ??
          ({
            title,
            diff: "BASIC",
            level: "?",
            date: "",
            jacketUrl: "",
            musicKind: "",
            achievementVal: 0,
            track: 0,
            fc: "",
            sync: "",
          } as PlayRecord),
      );
      const ytQuery = encodeURIComponent(
        `maimai ${title} ${all[0]?.musicKind || ""} 外部出力`
          .replace(/\s+/g, " ")
          .trim(),
      );
      const ytUrl = `https://www.youtube.com/results?search_query=${ytQuery}`;
      const emb = new EmbedBuilder()
        .setColor(0x2b2d31)
        .setTitle(truncateVisual(title, 26) + kind)
        .setDescription(
          "```\n" + lines.join("\n") + "\n```" + `\n[▶ 외부출력](${ytUrl})`,
        );
      if (buf) {
        const name = `sjacket${i}.png`;
        files.push(new AttachmentBuilder(buf, { name }));
        emb.setThumbnail(`attachment://${name}`);
      }
      return emb;
    }),
  );

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

  const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    prevBtn,
    countBtn,
    nextBtn,
  );

  return { embeds, components: [navRow], files };
}

const DIFF_ABBR: Record<string, string> = {
  BASIC: "BAS",
  ADVANCED: "ADV",
  EXPERT: "EXP",
  MASTER: "MAS",
  "Re:MASTER": "ReM",
};

// RS를 곡명 앞에 둠: 곡명(가변 폭, CJK 포함)을 마지막에 두어야 정렬이 깨지지 않음
const RT_HEADER = " # Dif Kd Lv      Score   RS  Title";

function formatRtRow(
  r: PlayRecord,
  rank: number,
  markMap?: Map<string, ChartMarks>,
): string {
  const rankStr = String(rank).padStart(2);
  const diff = DIFF_ABBR[r.diff] ?? "???";
  const kind = (r.musicKind || "  ").padEnd(2);
  const constant = getConstant(r.title, r.musicKind, r.diff);
  const lv = (constant !== null ? constant.toFixed(1) : r.level).padEnd(4);
  const ach = (
    r.achievementVal > 0 ? r.achievementVal.toFixed(4) + "%" : r.achievement
  ).padStart(9);
  const rs = String(songRating(r, markMap?.get(chartKey(r))?.fc)).padStart(3);
  const title = truncateVisual(r.title, 26);
  return `${rankStr} ${diff} ${kind} ${lv} ${ach}  ${rs}  ${title}`;
}

export function rtTableEmbed(
  p: NonNullable<ReturnType<typeof getCachedProfile>>,
): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
  const records = getTopList(p);

  if (records.length === 0) {
    return {
      embeds: [
        new EmbedBuilder()
          .setColor(0x2b2d31)
          .setDescription(
            "레이팅 기록 없음\n북마클릿을 다시 실행하면 업데이트됩니다.",
          ),
      ],
      components: [],
    };
  }

  const newRecords = records.slice(0, 15);
  const otherRecords = records.slice(15, 50);

  // 레이팅 대상 페이지엔 FC/AP 마크가 없고 ST/DX도 부정확할 수 있어 clear 기록으로 보정
  const clearList = getClearList(p);
  const markMap = buildMarkMap(clearList);
  const resolveKind = buildKindResolver(clearList);
  const fix = (r: PlayRecord): PlayRecord => ({ ...r, musicKind: resolveKind(r) });
  const newRows = newRecords.map((r, i) => formatRtRow(fix(r), i + 1, markMap));
  const otherRows = otherRecords.map((r, i) => formatRtRow(fix(r), i + 1, markMap));

  // 구분선 길이를 가장 긴 행(보통 ASCII 곡명)에 맞춰 표 너비와 일치시킴
  const maxW = Math.max(
    visualWidth(RT_HEADER),
    ...newRows.map(visualWidth),
    ...otherRows.map(visualWidth),
  );
  const divider = "─".repeat(maxW);
  const withSeps = (rows: string[]) =>
    rows.flatMap((row, i) => (i > 0 && i % 5 === 0 ? [divider, row] : [row]));

  const newBlock =
    "```\n" + RT_HEADER + "\n" + withSeps(newRows).join("\n") + "\n```";
  const otherBlock =
    "```\n" + RT_HEADER + "\n" + withSeps(otherRows).join("\n") + "\n```";

  const desc =
    `**신곡 NEW · ${newRecords.length}곡**\n${newBlock}\n` +
    `**구곡 OTHERS · ${otherRecords.length}곡**\n${otherBlock}`;

  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0x2b2d31)
        .setDescription(desc)
        .setFooter({
          text: `총 ${newRecords.length + otherRecords.length}곡  ·  RS=곡별 레이팅 점수`,
        }),
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
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    recentBtn,
    topBtn,
  );
  return {
    embeds: [profileEmb(cached, !!avatar)],
    files: avatar ? [avatar] : [],
    components: [row],
  };
}
