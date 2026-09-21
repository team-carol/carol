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
  getMapImage,
  saveSongJacket,
  getTranslateTitles,
} from "../../storage";
import { getMaimaiBaseUrl } from "../../scraper";
import {
  getConstant,
  getJacketFile,
  levelToNumber,
  calcSongRating,
  isNewSong,
  listCatalogSongKinds,
  getRegionExclusive,
  getSongGenre,
  getSongVersionName,
  isSongPlus,
} from "../../constants";
import { aliasMatches, normalizeQuery, displayTitle } from "../../aliases";
import { ratingColor } from "./roles";
import { buildMarkMap, buildKindResolver, chartKey } from "../../scraper";
import type { PlayRecord, ChartMarks, MaimaiServer, MapArea } from "../../scraper";
import { msg } from "../../messages";

// 곡 자켓 버퍼: DB 캐시 → maimai net(musicId) → otoge-db(title) 순으로 확보하고 캐시
export async function jacketBuffer(r: PlayRecord): Promise<Buffer | null> {
  const m = r.jacketUrl?.match(/\/img\/Music\/([^.]+)\.png/);
  const musicId = m ? m[1] : null;
  if (musicId) {
    const cached = await getSongJacket(musicId);
    if (cached) return cached;
    try {
      for (const origin of [getMaimaiBaseUrl("intl"), getMaimaiBaseUrl("jp")]) {
        const res = await fetch(`${origin}/maimai-mobile/img/Music/${musicId}.png`);
        if (!res.ok) continue;
        const b = Buffer.from(await res.arrayBuffer());
        await saveSongJacket(musicId, b);
        return b;
      }
    } catch {
      /* ignore */
    }
  }
  const file = getJacketFile(r.title);
  if (file) {
    const key = file.replace(/\.png$/, "");
    const cached = await getSongJacket(key);
    if (cached) return cached;
    try {
      const res = await fetch(`https://otoge-db.net/maimai/jacket/${file}`);
      if (res.ok) {
        const b = Buffer.from(await res.arrayBuffer());
        await saveSongJacket(key, b);
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

export async function buildAvatarAttachment(
  userId: string,
  server: MaimaiServer,
): Promise<AttachmentBuilder | null> {
  const buf = await getAvatarBlob(userId, server);
  if (!buf) return null;
  return new AttachmentBuilder(buf, { name: "avatar.png" });
}

export function profileEmb(
  p: NonNullable<Awaited<ReturnType<typeof getCachedProfile>>>,
  hasAvatar: boolean,
) {
  const stars = p.stars && p.stars !== "0" ? " · ★×" + p.stars : "";
  const serverLabel = p.server === "jp" ? "JP" : "INTERNATIONAL";
  const emb = new EmbedBuilder()
    .setColor(ratingColor(p.rating))
    .setTitle(p.trophy || msg("embed.noTrophy"))
    .setDescription(
      msg("embed.profileBody", {
        name: p.playerName || msg("embed.noName"),
        rating: p.rating || 0,
        play: p.playCount || 0,
        total: p.totalPlayCount || 0,
        stars,
      }),
    )
    .setFooter({
      text: msg("embed.profileFooter", { server: serverLabel, synced: new Date(p.lastSyncedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) }),
    });
  if (hasAvatar) emb.setThumbnail("attachment://avatar.png");
  return emb;
}

export function getSongList(
  p: NonNullable<Awaited<ReturnType<typeof getCachedProfile>>>,
): PlayRecord[] {
  const raw = JSON.parse(p.recentJson || "{}");
  return Array.isArray(raw) ? raw : raw.recent || [];
}

export function getTopList(
  p: NonNullable<Awaited<ReturnType<typeof getCachedProfile>>>,
): PlayRecord[] {
  const raw = JSON.parse(p.topJson || "[]");
  return Array.isArray(raw) ? raw : [];
}

export function getClearList(
  p: NonNullable<Awaited<ReturnType<typeof getCachedProfile>>>,
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
  p: NonNullable<Awaited<ReturnType<typeof getCachedProfile>>>,
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
  p: NonNullable<Awaited<ReturnType<typeof getCachedProfile>>>,
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
  const translate = await getTranslateTitles(userId);

  if (total === 0) {
    return {
      embeds: [
        new EmbedBuilder().setColor(0x2b2d31).setDescription(msg("recent.empty")),
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
        .setTitle(truncateVisual(displayTitle(r.title, translate), 26) + kind)
        .setDescription(desc)
        .setAuthor(
          r.track > 0
            ? { name: `Track ${String(r.track).padStart(2, "0")}` }
            : null,
        )
        .addFields(
          { name: msg("recent.achievementField"), value: r.achievement, inline: true },
          { name: msg("recent.dateField"), value: r.date || "-", inline: true },
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
    .setLabel(msg("embed.prev"))
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(idx === 0);
  const countBtn = new ButtonBuilder()
    .setCustomId("page_noop")
    .setLabel(`${idx + 1} / ${total}`)
    .setStyle(ButtonStyle.Primary)
    .setDisabled(true);
  const nextBtn = new ButtonBuilder()
    .setCustomId(`page:${userId}:${idx + 1}`)
    .setLabel(msg("embed.next"))
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
        .setLabel(msg("embed.share", { index: si + 1 }))
        .setStyle(ButtonStyle.Success),
    ),
  );

  return { embeds, components: [navRow, shareRow], files };
}

function areaKindLabel(kind: MapArea["kind"]): string {
  return kind === "event" ? msg("map.eventArea") : msg("map.normalArea");
}

export const MAP_PAGE_SIZE = 5;

function progressBar(percent: number | null): string {
  if (percent === null) return "";
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round(clamped / 10);
  return "█".repeat(filled) + "░".repeat(10 - filled) + ` ${clamped.toFixed(1)}%`;
}

function mapAreaDescription(area: MapArea): string {
  const lines = [
    progressBar(area.progressPercent),
    area.progressText ? msg("map.progress", { value: area.progressText }) : "",
    area.distanceText ? msg("map.distance", { value: area.distanceText }) : "",
    area.rewardText ? msg("map.reward", { value: area.rewardText }) : "",
  ].filter((line) => line.length > 0);
  if (lines.length > 0) return lines.join("\n");
  return truncateVisual(area.rawText, 180);
}

function buildMapAreaCard(
  p: NonNullable<Awaited<ReturnType<typeof getCachedProfile>>>,
  area: MapArea,
  absoluteIdx: number,
  totalAreas: number,
  imageRef: string,
): EmbedBuilder {
  const emb = new EmbedBuilder()
    .setColor(area.kind === "event" ? 0x9333ea : 0x2b2d31)
    .setTitle(truncateVisual(area.name || msg("map.unnamedArea"), 32))
    .setAuthor({ name: areaKindLabel(area.kind) })
    .setDescription(mapAreaDescription(area))
    .setFooter({
      text: msg("map.footer", { server: p.server === "jp" ? "JP" : "INTERNATIONAL", index: absoluteIdx + 1, total: totalAreas, synced: new Date(p.lastSyncedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) }),
    });
  if (imageRef) emb.setThumbnail(imageRef);
  return emb;
}

export async function mapAreaEmbed(
  p: NonNullable<Awaited<ReturnType<typeof getCachedProfile>>>,
  userId: string,
  pageIdx: number,
): Promise<{ embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[]; files: AttachmentBuilder[] }> {
  const areas = getMapAreaList(p);
  if (areas.length === 0) {
    return {
      embeds: [
        new EmbedBuilder()
          .setColor(0x2b2d31)
          .setDescription(msg("map.empty")),
      ],
      components: [],
      files: [],
    };
  }

  const totalPages = Math.max(1, Math.ceil(areas.length / MAP_PAGE_SIZE));
  const idx = Math.max(0, Math.min(pageIdx, totalPages - 1));
  const start = idx * MAP_PAGE_SIZE;
  const pageAreas = areas.slice(start, start + MAP_PAGE_SIZE);
  const files: AttachmentBuilder[] = [];
  const embeds = await Promise.all(pageAreas.map(async (area, offset) => {
    const buf = area.imageUrl ? await getMapImage(area.imageUrl) : null;
    const fileName = buf ? `map${start + offset}.png` : "";
    if (buf) files.push(new AttachmentBuilder(buf, { name: fileName }));
    const imageRef = buf ? `attachment://${fileName}` : "";
    return buildMapAreaCard(p, area, start + offset, areas.length, imageRef);
  }));

  const prevBtn = new ButtonBuilder()
    .setCustomId(`map:${userId}:${idx - 1}`)
    .setLabel(msg("embed.prev"))
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(idx === 0);
  const countBtn = new ButtonBuilder()
    .setCustomId("map_noop")
    .setLabel(`${idx + 1} / ${totalPages}`)
    .setStyle(ButtonStyle.Primary)
    .setDisabled(true);
  const nextBtn = new ButtonBuilder()
    .setCustomId(`map:${userId}:${idx + 1}`)
    .setLabel(msg("embed.next"))
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(idx === totalPages - 1);
  const shareButtons = pageAreas.map((area, offset) =>
    new ButtonBuilder()
      .setCustomId(`mapshare:${userId}:${start + offset}`)
      .setLabel(msg("map.shareButton", { area: truncateVisual(area.name || msg("map.areaFallback"), 10) }))
      .setStyle(ButtonStyle.Success),
  );

  return {
    embeds,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(prevBtn, countBtn, nextBtn),
      ...(shareButtons.length > 0 ? [new ActionRowBuilder<ButtonBuilder>().addComponents(...shareButtons)] : []),
    ],
    files,
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
  p: NonNullable<Awaited<ReturnType<typeof getCachedProfile>>>,
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
  const translate = await getTranslateTitles(userId);
  // 같은 곡명이라도 ST/DX 채보는 별도 결과로 분리 (musicKind 포함 키로 그룹핑).
  // 검색 대상은 클리어기록 스냅샷이 아니라 otoge-db 카탈로그 → 동기화하지 않았어도,
  // 국제판 프로필이라도 JP 전용곡까지 잡힌다. 기록이 있으면 점수/FC/SYNC 를 덧댄다.
  type SearchGroup = { title: string; musicKind: string; records: PlayRecord[] };
  const byChart = new Map<string, SearchGroup>();
  const matchTitle = (t: string) =>
    normalizeQuery(t).includes(q) || aliasMatches(t, q);
  const ensureGroup = (title: string, musicKind: string): SearchGroup => {
    const key = `${musicKind}|${title}`;
    let g = byChart.get(key);
    if (!g) {
      g = { title, musicKind, records: [] };
      byChart.set(key, g);
    }
    return g;
  };
  // 1) 카탈로그(미플레이 곡 포함). ST/DX 타입 필터도 여기서 적용.
  for (const c of listCatalogSongKinds()) {
    if (typeFilter && c.musicKind !== typeFilter) continue;
    if (!matchTitle(c.title)) continue;
    ensureGroup(c.title, c.musicKind);
  }
  // 2) 내 클리어 기록을 덧댄다(카탈로그에 없는 곡이라도 기록이 있으면 노출).
  for (const r of records) {
    const kind = r.musicKind || "";
    if (typeFilter && kind !== typeFilter) continue;
    if (!matchTitle(r.title)) continue;
    ensureGroup(r.title, kind).records.push(r);
  }
  const keys = Array.from(byChart.entries())
    .sort(([, a], [, b]) => {
      // 곡명이 검색어와 완전 일치하는 곡을 최상단으로
      const exactA = normalizeQuery(a.title) === q ? 1 : 0;
      const exactB = normalizeQuery(b.title) === q ? 1 : 0;
      if (exactA !== exactB) return exactB - exactA;
      // 그다음 내 최고 달성률 순(미플레이 곡은 0으로 뒤로).
      const bestA = a.records.reduce((m, r) => Math.max(m, r.achievementVal), 0);
      const bestB = b.records.reduce((m, r) => Math.max(m, r.achievementVal), 0);
      return bestB - bestA;
    })
    .map(([k]) => k);

  const typeLabel = typeFilter ? ` [${typeFilter}]` : "";

  if (keys.length === 0) {
    return {
      embeds: [
        new EmbedBuilder()
          .setColor(0x2b2d31)
          .setDescription(msg("searchResult.empty", { query, type: typeLabel })),
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
      const group = byChart.get(key)!;
      const all = group.records;
      const title = group.title;
      const musicKind = group.musicKind;
      const kind = musicKind ? ` [${musicKind}]` : "";
      const lines = DIFF_ORDER.flatMap((d) => {
        const r = all.find((x) => x.diff === d);
        // 검색은 이미 ST/DX로 분리돼 있으므로 exact(상호 폴백 없음)로 조회.
        // (예: ST에만 Re:MASTER가 있는 곡의 DX 카드에 Re:MASTER가 뜨는 문제 방지)
        const constant = getConstant(title, musicKind, d, p.server, true);
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
            musicKind,
            achievementVal: 0,
            track: 0,
            fc: "",
            sync: "",
          } as PlayRecord),
      );
      const ytQuery = encodeURIComponent(
        `maimai ${title} ${musicKind || ""} 外部出力`
          .replace(/\s+/g, " ")
          .trim(),
      );
      const ytUrl = `https://www.youtube.com/results?search_query=${ytQuery}`;
      // 지역 라벨: 한 서버 전용 곡이면 곡의 실제 지역을, 양쪽 수록이면 현재 보는 서버를 표기.
      // (국제판 프로필에서도 JP 전용곡이 검색되므로 프로필 서버가 아니라 곡 기준으로 판정한다.)
      // 제목이 아닌 점수표 위 한 줄에 둔다.
      const exclusive = getRegionExclusive(title);
      const verLabel = p.server === "jp" ? "japan ver." : "intl ver.";
      // 장르(catcode)·수록 버전은 OTOGE DB 데이터. 있을 때만 리전 라벨 아래 들여써서 붙인다.
      const genre = getSongGenre(title);
      const versionName = getSongVersionName(title);
      const versionLabel = versionName ? versionName + (isSongPlus(title) ? " PLUS" : "") : null;
      const regionLine =
        (exclusive ? msg("searchResult.regionExclusive", { version: exclusive === "jp" ? "japan ver." : "intl ver." }) : verLabel)
        + (genre ? msg("searchResult.genreSuffix", { genre }) : "")
        + (versionLabel ? msg("searchResult.versionSuffix", { version: versionLabel }) : "")
        + "\n";
      const emb = new EmbedBuilder()
        .setColor(0x2b2d31)
        .setTitle(displayTitle(title, translate) + kind)
        .setAuthor({ name: msg("searchResult.author", { query, type: typeLabel }) })
        .setDescription(
          regionLine +
            "```\n" +
            lines.join("\n") +
            "\n```" +
            "\n" + msg("searchResult.externalLink", { url: ytUrl }),
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
    .setLabel(msg("embed.prev"))
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(idx === 0);
  const countBtn = new ButtonBuilder()
    .setCustomId("search_noop")
    .setLabel(`${idx + 1} / ${totalPages}`)
    .setStyle(ButtonStyle.Primary)
    .setDisabled(true);
  const nextBtn = new ButtonBuilder()
    .setCustomId(`search:${ctxToken}:${idx + 1}`)
    .setLabel(msg("embed.next"))
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
  translate = false,
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
  const title = truncateVisual(displayTitle(r.title, translate), 26);
  return `${rankStr} ${diff} ${kind} ${lv} ${ach}  ${rs}  ${title}`;
}

export function rtTableEmbed(
  p: NonNullable<Awaited<ReturnType<typeof getCachedProfile>>>,
  translate = false,
): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
  const records = getTopList(p);

  if (records.length === 0) {
    return {
      embeds: [
        new EmbedBuilder()
          .setColor(0x2b2d31)
          .setDescription(
            msg("ratingTarget.empty"),
          ),
      ],
      components: [],
    };
  }

  // 국제판: maimai net 레이팅 대상 페이지에서 파싱한 순서(신곡 15 + 구곡 35)를 그대로 신뢰.
  // JP: 유료 페이지라 전체 기록에서 직접 산출하며, 대상곡이 15/35 미만이면 위치 기반이
  //     오분류되므로 버전(isNewSong)으로 분류.
  const newRecords =
    p.server === "jp"
      ? records.filter((r) => isNewSong(r.title, "jp")).slice(0, 15)
      : records.slice(0, 15);
  const otherRecords =
    p.server === "jp"
      ? records.filter((r) => !isNewSong(r.title, "jp")).slice(0, 35)
      : records.slice(15, 50);

  // 레이팅 대상 페이지엔 FC/AP 마크가 없고 ST/DX도 부정확할 수 있어 clear 기록으로 보정
  const clearList = getClearList(p);
  const markMap = buildMarkMap(clearList);
  const resolveKind = buildKindResolver(clearList);
  const fix = (r: PlayRecord): PlayRecord => ({ ...r, musicKind: resolveKind(r) });
  const newRows = newRecords.map((r, i) => formatRtRow(fix(r), i + 1, markMap, p.server, translate));
  const otherRows = otherRecords.map((r, i) => formatRtRow(fix(r), i + 1, markMap, p.server, translate));

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
    msg("ratingTarget.body", { newCount: newRecords.length, newBlock, otherCount: otherRecords.length, otherBlock });

  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0x2b2d31)
        .setDescription(desc)
        .setFooter({
          text: msg("ratingTarget.footer", { total: newRecords.length + otherRecords.length }),
        }),
    ],
    components: [],
  };
}

export async function buildProfileReply(
  cached: NonNullable<Awaited<ReturnType<typeof getCachedProfile>>>,
  userId: string,
) {
  const avatar = await buildAvatarAttachment(userId, cached.server);
  const recentBtn = new ButtonBuilder()
    .setCustomId(`recent:${userId}`)
    .setLabel(msg("profileButton.recent"))
    .setStyle(ButtonStyle.Secondary);
  const topBtn = new ButtonBuilder()
    .setCustomId(`rt:${userId}`)
    .setLabel(msg("profileButton.ratingTarget"))
    .setStyle(ButtonStyle.Primary);
  const mapBtn = new ButtonBuilder()
    .setCustomId(`mapopen:${userId}`)
    .setLabel(msg("profileButton.map"))
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
