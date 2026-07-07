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
import { getMaimaiBaseUrl } from "../../scraper";
import {
  getConstant,
  getJacketFile,
  levelToNumber,
  calcSongRating,
  isNewSong,
} from "../../constants";
import { aliasMatches, normalizeQuery } from "../../aliases";
import { ratingColor } from "./roles";
import { buildMarkMap, buildKindResolver, chartKey } from "../../scraper";
import type { PlayRecord, ChartMarks, MaimaiServer, MapArea } from "../../scraper";

// 곡 자켓 버퍼: DB 캐시 → maimai net(musicId) → otoge-db(title) 순으로 확보하고 캐시
export async function jacketBuffer(r: PlayRecord): Promise<Buffer | null> {
  const m = r.jacketUrl?.match(/\/img\/Music\/([^.]+)\.png/);
  const musicId = m ? m[1] : null;
  if (musicId) {
    const cached = getSongJacket(musicId);
    if (cached) return cached;
    try {
      for (const origin of [getMaimaiBaseUrl("intl"), getMaimaiBaseUrl("jp")]) {
        const res = await fetch(`${origin}/maimai-mobile/img/Music/${musicId}.png`);
        if (!res.ok) continue;
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
function songRating(r: PlayRecord, fc?: string, server: MaimaiServer = "intl"): number {
  const constant = getConstant(r.title, r.musicKind, r.diff, server);
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
  const serverLabel = p.server === "jp" ? "JP" : "INTERNATIONAL";
  const emb = new EmbedBuilder()
    .setColor(ratingColor(p.rating))
    .setTitle(p.trophy || "칭호 없음")
    .setDescription(
      `**${p.playerName || "이름 없음"}**  ·  **${p.rating || 0}**\n` +
        `플레이 ${p.playCount || 0}/${p.totalPlayCount || 0}회${stars}`,
    )
    .setFooter({
      text: `서버: ${serverLabel}  ·  마지막 동기화: ${new Date(p.lastSyncedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`,
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

function isMapArea(value: unknown): value is MapArea {
  if (!value || typeof value !== "object") return false;
  const area = value as Partial<MapArea>;
  return (area.kind === "normal" || area.kind === "event")
    && typeof area.name === "string"
    && typeof area.progressText === "string"
    && (typeof area.progressPercent === "number" || area.progressPercent === null)
    && typeof area.distanceText === "string"
    && typeof area.rewardText === "string"
    && typeof area.imageUrl === "string"
    && typeof area.rawText === "string";
}

export function getMapAreaList(
  p: NonNullable<ReturnType<typeof getCachedProfile>>,
): MapArea[] {
  const raw = JSON.parse(p.mapJson || "[]");
  return Array.isArray(raw) ? raw.filter(isMapArea) : [];
}

export function groupByGame(records: PlayRecord[]): PlayRecord[][] {
  const games: PlayRecord[][] = [];
  let current: PlayRecord[] = [];
  for (const r of records) {
    current.push(r);
    if (r.track <= 1 && current.length > 0) {
      games.push(current);
      current = [];
    }
  }
  if (current.length > 0) games.push(current);
  for (const game of games) game.sort((a, b) => b.track - a.track);
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
      const constant = getConstant(r.title, r.musicKind, r.diff, p.server);
      const lv = constant !== null ? constant.toFixed(1) : r.level;
      const desc =
        `\`${r.diff} ${lv}\`` + (rankStr ? `  ·  \`${rankStr}\`` : "");
      const emb = new EmbedBuilder()
        .setColor(0x2b2d31)
        .setTitle(truncateVisual(r.title, 26) + kind)
        .setDescription(desc)
        .setAuthor(
          r.track > 0
            ? { name: `Track ${String(r.track).padStart(2, "0")}` }
            : null,
        )
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
    .setLabel("◀ 이전")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(idx === 0);
  const countBtn = new ButtonBuilder()
    .setCustomId("page_noop")
    .setLabel(`${idx + 1} / ${total}`)
    .setStyle(ButtonStyle.Primary)
    .setDisabled(true);
  const nextBtn = new ButtonBuilder()
    .setCustomId(`page:${userId}:${idx + 1}`)
    .setLabel("다음 ▶")
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

function areaKindLabel(kind: MapArea["kind"]): string {
  return kind === "event" ? "이벤트 지방" : "일반 지방";
}

const MAP_PAGE_SIZE = 5;

function progressBar(percent: number | null): string {
  if (percent === null) return "";
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round(clamped / 10);
  return "█".repeat(filled) + "░".repeat(10 - filled) + ` ${clamped.toFixed(1)}%`;
}

function mapAreaDescription(area: MapArea): string {
  const lines = [
    progressBar(area.progressPercent),
    area.progressText ? `진행도: ${area.progressText}` : "",
    area.distanceText ? `거리: ${area.distanceText}` : "",
    area.rewardText ? `보상: ${area.rewardText}` : "",
  ].filter((line) => line.length > 0);
  if (lines.length > 0) return lines.join("\n");
  return truncateVisual(area.rawText, 180);
}

export function mapAreaEmbed(
  p: NonNullable<ReturnType<typeof getCachedProfile>>,
  userId: string,
  pageIdx: number,
): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
  const areas = getMapAreaList(p);
  if (areas.length === 0) {
    return {
      embeds: [
        new EmbedBuilder()
          .setColor(0x2b2d31)
          .setDescription("지방 진행도 없음\n북마클릿을 다시 실행하면 업데이트됩니다."),
      ],
      components: [],
    };
  }

  const totalPages = Math.max(1, Math.ceil(areas.length / MAP_PAGE_SIZE));
  const idx = Math.max(0, Math.min(pageIdx, totalPages - 1));
  const start = idx * MAP_PAGE_SIZE;
  const pageAreas = areas.slice(start, start + MAP_PAGE_SIZE);
  const emb = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle("지방 진행도")
    .setDescription("한 번에 5개씩 표시합니다.")
    .setFooter({
      text: `${p.server === "jp" ? "JP" : "INTERNATIONAL"}  ·  ${idx + 1} / ${totalPages}  ·  ${start + 1}-${Math.min(start + MAP_PAGE_SIZE, areas.length)} / ${areas.length}  ·  마지막 동기화: ${new Date(p.lastSyncedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`,
    });
  if (pageAreas[0]?.imageUrl) emb.setThumbnail(pageAreas[0].imageUrl);
  emb.addFields(
    pageAreas.map((area) => ({
      name: `${areaKindLabel(area.kind)} · ${truncateVisual(area.name || "이름 없는 지방", 28)}`,
      value: mapAreaDescription(area),
      inline: false,
    })),
  );

  const prevBtn = new ButtonBuilder()
    .setCustomId(`map:${userId}:${idx - 1}`)
    .setLabel("◀ 이전")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(idx === 0);
  const countBtn = new ButtonBuilder()
    .setCustomId("map_noop")
    .setLabel(`${idx + 1} / ${totalPages}`)
    .setStyle(ButtonStyle.Primary)
    .setDisabled(true);
  const nextBtn = new ButtonBuilder()
    .setCustomId(`map:${userId}:${idx + 1}`)
    .setLabel("다음 ▶")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(idx === totalPages - 1);
  const shareBtn = new ButtonBuilder()
    .setCustomId(`mapshare:${userId}:${idx}`)
    .setLabel("공유")
    .setStyle(ButtonStyle.Success);

  return {
    embeds: [emb],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(prevBtn, countBtn, nextBtn, shareBtn),
    ],
  };
}

// 검색 페이징 컨텍스트: 버튼 customId는 100자 제한이 있어 (일본어/한글 곡명은
// encodeURIComponent 시 글자당 9자) 쿼리를 직접 담을 수 없다. 짧은 토큰만 담고
// 실제 쿼리/필터는 메모리에 보관한다.
export interface SearchCtx {
  userId: string;
  query: string;
  typeFilter: string;
}
const searchCtx = new Map<string, SearchCtx>();
const SEARCH_CTX_MAX = 1000;
function putSearchCtx(ctx: SearchCtx): string {
  const token = Math.random().toString(36).slice(2, 10);
  if (searchCtx.size >= SEARCH_CTX_MAX) {
    const oldest = searchCtx.keys().next().value;
    if (oldest !== undefined) searchCtx.delete(oldest);
  }
  searchCtx.set(token, ctx);
  return token;
}
export function getSearchCtx(token: string): SearchCtx | undefined {
  return searchCtx.get(token);
}

export async function searchResultEmbeds(
  p: NonNullable<ReturnType<typeof getCachedProfile>>,
  userId: string,
  query: string,
  pageIdx: number,
  typeFilter = "",
  token?: string,
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
    // ST/DX 타입 필터 (선택 시 해당 타입만)
    if (typeFilter && (r.musicKind || "") !== typeFilter) continue;
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

  const typeLabel = typeFilter ? ` [${typeFilter}]` : "";

  if (keys.length === 0) {
    return {
      embeds: [
        new EmbedBuilder()
          .setColor(0x2b2d31)
          .setDescription(`"${query}"${typeLabel} 검색 결과 없음`),
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
        const constant = getConstant(title, all[0]?.musicKind, d, p.server);
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
        .setAuthor({ name: `"${query}"${typeLabel} 에 대한 검색 결과` })
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

  // 쿼리/필터는 토큰으로 대체 (customId 100자 제한 회피)
  const ctxToken = token ?? putSearchCtx({ userId, query, typeFilter });
  const prevBtn = new ButtonBuilder()
    .setCustomId(`search:${ctxToken}:${idx - 1}`)
    .setLabel("◀ 이전")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(idx === 0);
  const countBtn = new ButtonBuilder()
    .setCustomId("search_noop")
    .setLabel(`${idx + 1} / ${totalPages}`)
    .setStyle(ButtonStyle.Primary)
    .setDisabled(true);
  const nextBtn = new ButtonBuilder()
    .setCustomId(`search:${ctxToken}:${idx + 1}`)
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
  server: MaimaiServer = "intl",
): string {
  const rankStr = String(rank).padStart(2);
  const diff = DIFF_ABBR[r.diff] ?? "???";
  const kind = (r.musicKind || "  ").padEnd(2);
  const constant = getConstant(r.title, r.musicKind, r.diff, server);
  const lv = (constant !== null ? constant.toFixed(1) : r.level).padEnd(4);
  const ach = (
    r.achievementVal > 0 ? r.achievementVal.toFixed(4) + "%" : r.achievement
  ).padStart(9);
  const rs = String(songRating(r, markMap?.get(chartKey(r))?.fc, server)).padStart(3);
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

  // 위치가 아니라 버전(신곡 판정)으로 분류 — 곡추천과 동일한 isNewSong 사용.
  // (서버별 신곡 범위가 다르고, 대상곡이 15/35 미만이면 위치 기반은 오분류됨)
  const newRecords = records.filter((r) => isNewSong(r.title, p.server)).slice(0, 15);
  const otherRecords = records.filter((r) => !isNewSong(r.title, p.server)).slice(0, 35);

  // 레이팅 대상 페이지엔 FC/AP 마크가 없고 ST/DX도 부정확할 수 있어 clear 기록으로 보정
  const clearList = getClearList(p);
  const markMap = buildMarkMap(clearList);
  const resolveKind = buildKindResolver(clearList);
  const fix = (r: PlayRecord): PlayRecord => ({ ...r, musicKind: resolveKind(r) });
  const newRows = newRecords.map((r, i) => formatRtRow(fix(r), i + 1, markMap, p.server));
  const otherRows = otherRecords.map((r, i) => formatRtRow(fix(r), i + 1, markMap, p.server));

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
  const mapBtn = new ButtonBuilder()
    .setCustomId(`mapopen:${userId}`)
    .setLabel("지방 진행도")
    .setStyle(ButtonStyle.Secondary);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    recentBtn,
    topBtn,
    mapBtn,
  );
  return {
    embeds: [profileEmb(cached, !!avatar)],
    files: avatar ? [avatar] : [],
    components: [row],
  };
}
