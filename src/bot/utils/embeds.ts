import {
  EmbedBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ContainerBuilder,
  SeparatorSpacingSize,
  SectionBuilder,
  TextDisplayBuilder,
  MessageFlags,
  escapeMarkdown,
} from "discord.js";
import {
  getCachedProfile,
  getAvatarBlob,
  getSongJacket,
  getMapImage,
  saveSongJacket,
  getTranslateTitles,
  getCirclePublic,
} from "../../storage";
import { getMaimaiBaseUrl } from "../../scraper";
import type { CachedProfile } from "../../storage/types";
import { hasCarolSync } from "./syncExtras";
import {
  getConstant,
  getJacketFile,
  levelToNumber,
  calcSongRating,
  isNewSong,
  listCatalogSongKinds,
  resolveSongPick,
  getRegionExclusive,
  getSongGenre,
  getSongVersionName,
  isSongPlus,
  jacketFileUrl,
} from "../../constants";
import { aliasMatches, normalizeQuery, displayTitle } from "../../aliases";
import { areaDisplayName } from "../../nameTranslations";
import { ratingColor } from "./roles";
import { diffEmoji, rankEmoji, comboEmoji, syncEmoji, dxStarEmoji, blankEmoji } from "./emoji";
import { getScoreRank } from "../../games";
import { dxStars } from "../../sRating";
import { renderProfileCard } from "./profileCard";
import { circleOf } from "./circle";
import { versionName } from "../../maishift/catalog";
import { maishiftDays, maishiftSeries } from "../../ratingHistory";
import { koreaPlayDayKey } from "../../achievements";
import { buildMarkMap, buildKindResolver, chartKey } from "../../scraper";
import type { PlayRecord, ChartMarks, MaimaiServer, MapArea } from "../../scraper";
import { msg } from "../../messages";
import { versionPositionText } from "./versionPosition";

// 곡 자켓 버퍼: DB 캐시 → maimai net(musicId) → 카탈로그 재킷(title) 순으로 확보하고 캐시
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
      const res = await fetch(jacketFileUrl(file));
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

// maishift 프로필의 아이콘(DX NET 공개 이미지) 메모리 캐시. 아이콘 주소는 아이콘이 바뀌면 같이 바뀐다.
const remoteAvatarCache = new Map<string, Buffer>();
async function fetchRemoteAvatar(url: string): Promise<Buffer | null> {
  const hit = remoteAvatarCache.get(url);
  if (hit) return hit;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    remoteAvatarCache.set(url, buf);
    if (remoteAvatarCache.size > 300) remoteAvatarCache.delete(remoteAvatarCache.keys().next().value!);
    return buf;
  } catch {
    return null;
  }
}

/** 프로필 아바타. maishift 데이터면 maishift 가 알려 준 아이콘, 아니면(또는 못 받으면) 북마클릿이 저장한 이미지. */
export async function loadAvatar(userId: string, profile: Pick<CachedProfile, "server" | "source" | "avatar">): Promise<Buffer | null> {
  if (profile.source === "maishift" && profile.avatar) {
    const remote = await fetchRemoteAvatar(profile.avatar);
    if (remote) return remote;
  }
  return getAvatarBlob(userId, profile.server);
}

export async function buildAvatarAttachment(
  userId: string,
  profile: Pick<CachedProfile, "server" | "source" | "avatar">,
): Promise<AttachmentBuilder | null> {
  const buf = await loadAvatar(userId, profile);
  if (!buf) return null;
  return new AttachmentBuilder(buf, { name: "avatar.png" });
}

export function profileEmb(
  p: NonNullable<Awaited<ReturnType<typeof getCachedProfile>>>,
  hasAvatar: boolean,
  circleName: string | null = null,
) {
  const stars = p.stars && p.stars !== "0" ? " ✦ ★×" + p.stars : "";
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
      text: msg("embed.profileFooter", { server: serverLabel, synced: new Date(p.lastSyncedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) })
        + (p.source === "maishift" ? `  ✦  ${msg("maishift.credit")}` : ""),
    });
  if (hasAvatar) emb.setThumbnail("attachment://avatar.png");
  const friendCode = publicFriendCode(p) ?? undefined;
  if (friendCode) emb.addFields({ name: msg("embed.friendCodeField"), value: `\`${friendCode}\``, inline: true });
  // 서클 이름은 /설정 의 서클 공개(기본 공개)가 켜져 있을 때만.
  if (circleName) emb.addFields({ name: msg("embed.circleField"), value: escapeMarkdown(circleName), inline: true });
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
      const rankStr = [r.fc, r.sync].filter(Boolean).join(" ✦ ");
      const constant = getConstant(r.title, r.musicKind, r.diff, p.server);
      const lv = constant !== null ? constant.toFixed(1) : r.level;
      const desc =
        `\`${r.diff} ${lv}\`` + (rankStr ? `  ✦  \`${rankStr}\`` : "");
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
  translate: boolean,
): EmbedBuilder {
  const emb = new EmbedBuilder()
    .setColor(area.kind === "event" ? 0x9333ea : 0x2b2d31)
    .setTitle(truncateVisual(areaDisplayName(area.name, translate) || msg("map.unnamedArea"), 32))
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
  const translate = await getTranslateTitles(userId);
  const files: AttachmentBuilder[] = [];
  const embeds = await Promise.all(pageAreas.map(async (area, offset) => {
    const buf = area.imageUrl ? await getMapImage(area.imageUrl) : null;
    const fileName = buf ? `map${start + offset}.png` : "";
    if (buf) files.push(new AttachmentBuilder(buf, { name: fileName }));
    const imageRef = buf ? `attachment://${fileName}` : "";
    return buildMapAreaCard(p, area, start + offset, areas.length, imageRef, translate);
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
      .setLabel(msg("map.shareButton", { area: truncateVisual(areaDisplayName(area.name, translate) || msg("map.areaFallback"), 10) }))
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
  /** 검색 결과 곡(채보 종류별) 순서. 상세 버튼이 몇 번째 곡인지로 찾는다. */
  groups?: { title: string; musicKind: string }[];
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

// 디스코드 글꼴은 숫자 폭이 제각각이고 "1" 이 좁다. 긴 쪽 값은 늘 1 로 시작하므로(상수 10~15, 달성률 100~101%)
// 모자란 첫 자리는 "1" 폭에 가까운 공백으로 채운다(스크린샷 측정: 보통 굵기 "1" ≈ 0.36em, 굵게 ≈ 0.43em).
const PAD_ONE = "\u2004"; // 1/3em
const PAD_ONE_BOLD = "\u2005\u2006"; // 1/4em + 1/6em

/** 점수표 숫자 칸 맞춤: 정수부가 width 자리보다 짧으면 앞을 채운다(첫 자리는 one, 나머지는 숫자 폭 공백 U+2007). 숫자로 시작하지 않으면 그대로. */
function padDigits(text: string, width: number, one: string): string {
  const n = /^\d*/.exec(text)![0].length;
  return n > 0 && n < width ? one + "\u2007".repeat(width - n - 1) + text : text;
}

export async function searchResultEmbeds(
  p: NonNullable<Awaited<ReturnType<typeof getCachedProfile>>>,
  userId: string,
  query: string,
  pageIdx: number,
  typeFilter = "",
  token?: string,
): Promise<{
  components: (ContainerBuilder | TextDisplayBuilder | ActionRowBuilder<ButtonBuilder>)[];
  files: AttachmentBuilder[];
  flags: MessageFlags.IsComponentsV2;
}> {
  // Components V2: 검색어 한 줄 → 곡마다 컨테이너(제목·재킷·지역/장르/버전, 코드 블록 점수표, 상세·외부 출력 버튼) → 페이지 버튼.
  const records = getClearList(p);
  // 자동완성 목록에서 고른 곡이면 그 곡·종류만, 아니면 검색어로 찾는다(예전과 같이).
  const picked = resolveSongPick(query);
  const translate = await getTranslateTitles(userId);
  const shownQuery = picked ? displayTitle(picked.title, translate) : query;
  const q = normalizeQuery(picked ? picked.title : query);
  // 같은 곡명이라도 ST/DX 채보는 별도 결과로 분리 (musicKind 포함 키로 그룹핑).
  // 검색 대상은 클리어기록 스냅샷이 아니라 otoge-db 카탈로그 → 동기화하지 않았어도,
  // 국제판 프로필이라도 JP 전용곡까지 잡힌다. 기록이 있으면 점수/FC/SYNC 를 덧댄다.
  type SearchGroup = { title: string; musicKind: string; records: PlayRecord[] };
  const byChart = new Map<string, SearchGroup>();
  const matchTitle = (t: string, kind: string) => picked
    ? t === picked.title && kind === picked.musicKind
    : normalizeQuery(t).includes(q) || aliasMatches(t, q);
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
    if (!matchTitle(c.title, c.musicKind)) continue;
    ensureGroup(c.title, c.musicKind);
  }
  // 2) 내 클리어 기록을 덧댄다(카탈로그에 없는 곡이라도 기록이 있으면 노출).
  for (const r of records) {
    const kind = r.musicKind || "";
    if (typeFilter && kind !== typeFilter) continue;
    if (!matchTitle(r.title, kind)) continue;
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
      components: [new TextDisplayBuilder().setContent(msg("searchResult.empty", { query: shownQuery, type: typeLabel }))],
      files: [],
      flags: MessageFlags.IsComponentsV2,
    };
  }
  // 쿼리/필터는 토큰으로 대체 (customId 100자 제한 회피)
  const ctxToken = token ?? putSearchCtx({ userId, query, typeFilter });
  const ctx = getSearchCtx(ctxToken);
  if (ctx) ctx.groups = keys.map((k) => { const g = byChart.get(k)!; return { title: g.title, musicKind: g.musicKind }; });

  const PAGE_SIZE = 2;
  const totalPages = Math.max(1, Math.ceil(keys.length / PAGE_SIZE));
  const idx = Math.max(0, Math.min(pageIdx, totalPages - 1));
  const pageKeys = keys.slice(idx * PAGE_SIZE, (idx + 1) * PAGE_SIZE);
  const files: AttachmentBuilder[] = [];

  const DIFF_ORDER = ["BASIC", "ADVANCED", "EXPERT", "MASTER", "Re:MASTER"];

  const containers = await Promise.all(
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
        const lv = padDigits(constant !== null ? constant.toFixed(1) : (r?.level ?? "?"), 2, PAD_ONE);
        // 난이도·랭크·FC/AP·FS/FDX·DX ✦ 는 이모지로. 모바일에서 한 줄에 들어가게 코드 블록·인라인 코드는 쓰지 않는다.
        if (!r || r.achievementVal <= 0) return [msg("searchResult.rowNotPlayed", { diff: diffEmoji(d), constant: lv })];
        const stars = r.dxScoreMax ? dxStars(((r.dxScore ?? 0) / r.dxScoreMax) * 100) : 0;
        // 없는 마크 자리는 빈칸 이모지로 채워 뒤의 마크가 줄마다 같은 자리에 오게 한다(끝의 빈칸은 뺀다).
        const marks = [rankEmoji(getScoreRank(r.achievementVal)), comboEmoji(r.fc), syncEmoji(r.sync), dxStarEmoji(stars)];
        while (marks.length && !marks[marks.length - 1]) marks.pop();
        const marksText = marks.map((m) => m || blankEmoji()).filter(Boolean).join(" ");
        const achievement = padDigits(`${r.achievementVal.toFixed(4)}%`, 3, PAD_ONE_BOLD);
        return [msg("searchResult.row", { diff: diffEmoji(d), constant: lv, achievement, marks: marksText })];
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
      const exclusive = getRegionExclusive(title, musicKind);
      const verLabel = p.server === "jp" ? "japan ver." : "intl ver.";
      // 장르(catcode)·수록 버전은 OTOGE DB 데이터. 있을 때만 리전 라벨 아래 들여써서 붙인다.
      const genre = getSongGenre(title);
      const versionName = getSongVersionName(title, p.server, musicKind);
      const versionBase = versionName ? versionName + (isSongPlus(title, p.server, musicKind) ? " PLUS" : "") : null;
      // 버전 정렬로 곡을 찾을 때의 위치(예: 43/79)
      const position = versionBase ? await versionPositionText(title, musicKind, p.server) : null;
      const versionLabel = versionBase && position ? msg("searchResult.versionPosition", { version: versionBase, position }) : versionBase;
      const regionLine =
        (exclusive ? msg("searchResult.regionExclusive", { version: exclusive === "jp" ? "japan ver." : "intl ver." }) : verLabel)
        + (genre ? msg("searchResult.genreSuffix", { genre }) : "")
        + (versionLabel ? msg("searchResult.versionSuffix", { version: versionLabel }) : "")
        + "\n";
      const heading = msg("searchResult.title", { title: escapeMarkdown(displayTitle(title, translate)), kind }) + "\n" + regionLine.trimEnd();
      const container = new ContainerBuilder().setAccentColor(musicKind === "DX" ? 0xf97316 : musicKind === "ST" ? 0x3b82f6 : 0x8a8087);
      if (buf) {
        const name = `sjacket${i}.png`;
        files.push(new AttachmentBuilder(buf, { name }));
        container.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents((t) => t.setContent(heading))
            .setThumbnailAccessory((t) => t.setURL(`attachment://${name}`)),
        );
      } else {
        container.addTextDisplayComponents((t) => t.setContent(heading));
      }
      // 곡 정보 / 플레이 정보 / 버튼을 구분선으로 나눈다.
      return container
        .addSeparatorComponents((s) => s.setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents((t) => t.setContent(lines.join("\n")))
        .addSeparatorComponents((s) => s.setSpacing(SeparatorSpacingSize.Small))
        .addActionRowComponents(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            // maishift 곡 창과 같은 정보의 이미지(trk:<토큰>:<전체 결과 안 순서>).
            new ButtonBuilder()
              .setCustomId(`trk:${ctxToken}:${idx * PAGE_SIZE + i}`)
              .setLabel(msg("searchResult.detailButton"))
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setURL(ytUrl)
              .setLabel(msg("searchResult.externalButton"))
              .setStyle(ButtonStyle.Link),
          ),
        );
    }),
  );

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

  return {
    components: [
      new TextDisplayBuilder().setContent(msg("searchResult.author", { query: shownQuery, type: typeLabel })),
      ...containers,
      new ActionRowBuilder<ButtonBuilder>().addComponents(prevBtn, countBtn, nextBtn),
    ],
    files,
    flags: MessageFlags.IsComponentsV2,
  };
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
      ? records.filter((r) => isNewSong(r.title, "jp", undefined, r.musicKind)).slice(0, 15)
      : records.slice(0, 15);
  const otherRecords =
    p.server === "jp"
      ? records.filter((r) => !isNewSong(r.title, "jp", undefined, r.musicKind)).slice(0, 35)
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

// 프로필 카드 히스토리: maishift 히스토리(업로드마다의 실제 레이팅·플레이 횟수) 전체 기간. 없으면 그래프를 그리지 않는다.
function loadRatingHistory(cached: NonNullable<Awaited<ReturnType<typeof getCachedProfile>>>) {
  if (!cached.maishiftHistory?.length) return undefined;
  const days = maishiftDays(cached.maishiftHistory, koreaPlayDayKey(new Date()));
  const { points, plays, updates } = maishiftSeries(cached.maishiftHistory, days, versionName);
  return { points, days, updates, plays };
}

/** 친구 코드는 maishift 에서 공개한 사용자만(maishift 가 공개한 값이 있을 때) 보인다. */
function publicFriendCode(p: { maishiftFriendCode?: string }): string | null {
  return (p.maishiftFriendCode ?? "").match(/\d{13}/)?.[0] ?? null;
}

export async function buildProfileReply(
  cached: NonNullable<Awaited<ReturnType<typeof getCachedProfile>>>,
  userId: string,
  format: "image" | "embed" = "embed",
  viewerId?: string,
) {
  const [avatar, circlePublic] = await Promise.all([buildAvatarAttachment(userId, cached), getCirclePublic(userId)]);
  // 서클·최근 플레이·지방은 캐롤봇 추가 북마클릿 데이터라, 그 북마클릿을 실행한 사용자에게만 보인다.
  const synced = hasCarolSync(cached);
  const circleName = synced && circlePublic ? circleOf(cached)?.name ?? null : null;
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
    ...(synced ? [recentBtn, topBtn, mapBtn] : [topBtn]),
  );
  if (format === "image") {
    const [avatarBuf, translate] = await Promise.all([loadAvatar(userId, cached), getTranslateTitles(viewerId ?? userId)]);
    const friendCode = publicFriendCode(cached);
    const ratingHistory = loadRatingHistory(cached);
    const png = await renderProfileCard(cached, avatarBuf, { translate, friendCode, circleName, ratingHistory });
    return { embeds: [], files: [new AttachmentBuilder(png, { name: "profile.png" })], components: [row] };
  }
  return {
    embeds: [profileEmb(cached, !!avatar, circleName)],
    files: avatar ? [avatar] : [],
    components: [row],
  };
}
