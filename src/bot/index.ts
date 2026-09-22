import { Client, Events, GatewayIntentBits, ChatInputCommandInteraction, AutocompleteInteraction, ButtonInteraction, REST, Routes, MessageFlags, AttachmentBuilder } from "discord.js";
import { initEncryption } from "../crypto";
import { startWebServer, setBaseUrl, setGuildCountProvider, setGatewayPingProvider, getBaseUrl } from "../web";
import { closeStorage, initializeStorage, loadUserSession, getCachedProfile, clearRatingCardCacheForInactive, getTranslateTitles, getPolicyAck, setPolicyAck, pruneSimaiCharts, getSimaiChart, getOrphanChartVideos, deleteChartVideo } from "../storage";
import { CONFIG, PORT } from "../config";
import { parseMaidata } from "../simai/parse";
import { requestVideo, getReadyVideo, queueDepth } from "./utils/chartVideoQueue";
import type { Chart } from "../simai/types";
import * as fsp from "fs";
import { POLICY_VERSION, policyNoticeText } from "../policy";
import { recentEmbeds, rtTableEmbed, searchResultEmbeds, getSearchCtx, mapAreaEmbed } from "./utils/embeds";

import { loadConstants } from "../constants";
import { loadAliases } from "../aliases";
import { loadRegistryIndex } from "../simai/registryIndex";
import { loadMessages, msg } from "../messages";
import { loadFonts } from "../fonts";

import * as profile      from "./commands/profile";
import * as bookmarklet  from "./commands/bookmarklet";
import * as ratingtable  from "./commands/ratingtable";
import * as ratingimage  from "./commands/ratingimage";
import * as achievement  from "./commands/achievement";
import * as fortune      from "./commands/fortune";
import * as settings     from "./commands/settings";
import * as serverSettings from "./commands/serverSettings";
import * as newsSettings from "./commands/newsSettings";
import { startNewsPoller, handleNewsButton } from "./newsPoller";
import * as search       from "./commands/search";
import * as status       from "./commands/status";
import * as songrec      from "./commands/songrec";
import * as random       from "./commands/random";
import * as areaMap      from "./commands/map";
import * as report       from "./commands/report";
import * as admin        from "./commands/admin";
import * as goal         from "./commands/goal";
import * as chart        from "./commands/chart";
import * as ratingcalc   from "./commands/ratingcalc";

type Command = { data: { toJSON(): object; name: string }; execute: (i: ChatInputCommandInteraction) => Promise<void>; autocomplete?: (i: AutocompleteInteraction) => Promise<void> };

const COMMANDS: Command[] = [profile, bookmarklet, ratingtable, ratingimage, achievement, fortune, settings, serverSettings, newsSettings, search, status, songrec, random, areaMap, report, admin, goal, chart, ratingcalc];
const EPHEMERAL_REPLY = { flags: MessageFlags.Ephemeral } as const;

const RATING_CARD_GC_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;
const RATING_CARD_GC_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function runRatingCardGC(): Promise<void> {
  try {
    const cleared = await clearRatingCardCacheForInactive(RATING_CARD_GC_THRESHOLD_MS) as number;
    if (cleared > 0) console.log(`[gc] rating_card_blob cleared for ${cleared} inactive profile(s)`);
  } catch (e) {
    console.error("[gc] rating_card_blob cleanup failed:", e);
  }
}

// discord.js Client는 EventEmitter다: error/shardError에 리스너가 하나도 없으면
// Node가 그 이벤트를 uncaughtException으로 취급해 프로세스 전체가 죽는다.
// 게이트웨이 재연결 실패 같은 일시적 네트워크 문제로도 봇이 통째로 내려가는 걸 막기 위한 필수 리스너.
process.on("unhandledRejection", (reason) => console.error("[process] unhandled rejection:", reason));
process.on("uncaughtException", (error) => console.error("[process] uncaught exception:", error));

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.on(Events.Error, (error) => console.error("[discord] client error:", error));
client.on(Events.ShardError, (error) => console.error("[discord] shard error:", error));

client.once(Events.ClientReady, async (c) => {
  console.log(`[maimai] ${c.user.tag}`);
  try {
    const rest = new REST({ version: "10" }).setToken(CONFIG.token);
    const route = CONFIG.guildId
      ? Routes.applicationGuildCommands(CONFIG.clientId, CONFIG.guildId)
      : Routes.applicationCommands(CONFIG.clientId);
    await rest.put(route, { body: [...COMMANDS.map((cmd) => cmd.data.toJSON()), report.contextData.toJSON()] });
  } catch (e) {
    console.error("[maimai] 명령어 등록 실패:", e);
  }
  await loadConstants();
  setInterval(() => { loadConstants().catch((e) => console.error("[constants] 주기 갱신 실패:", e)); }, 24 * 60 * 60 * 1000);
  try {
    await loadAliases();
  } catch (e) {
    console.error("[aliases] 로드 실패:", e);
  }
  try {
    await loadMessages();
  } catch (e) {
    console.error("[messages] 로드 실패:", e);
  }
  try {
    await loadRegistryIndex();
  } catch (e) {
    console.error("[registry] 채보 인덱스 로드 실패:", e);
  }
  loadFonts().catch((e) => console.error("[fonts] 초기 로드 실패:", e));
  void runRatingCardGC();
  setInterval(() => void runRatingCardGC(), RATING_CARD_GC_INTERVAL_MS);
  void runSimaiChartGC();
  setInterval(() => void runSimaiChartGC(), SIMAI_CHART_GC_INTERVAL_MS);
  startNewsPoller(c);
  console.log("[maimai] 준비 완료");
});


// 업로드된 simai 채보는 링크를 아는 사람만 열 수 있는 임시 자료라 무한히 쌓아둘 이유가 없다.
// 운영자가 등록한 채보(source='registry')는 지우지 않는다.
const SIMAI_CHART_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SIMAI_CHART_GC_INTERVAL_MS = 24 * 60 * 60 * 1000;
async function runSimaiChartGC(): Promise<void> {
  try {
    const n = await pruneSimaiCharts(SIMAI_CHART_TTL_MS);
    if (n > 0) console.log(`[보면] 만료된 업로드 채보 ${n}건 정리`);
  } catch (e) {
    console.error("[보면] 정리 실패:", e);
  }
  // 원본 채보가 사라진 풀영상 파일·행도 함께 정리(재생성 가능한 캐시).
  try {
    const orphans = await getOrphanChartVideos() as Array<{ id: string; path: string }>;
    for (const o of orphans) {
      if (o.path) { try { fsp.unlinkSync(o.path); } catch { /* 이미 없음 */ } }
      await deleteChartVideo(o.id);
    }
    if (orphans.length > 0) console.log(`[보면] 고아 풀영상 ${orphans.length}건 정리`);
  } catch (e) {
    console.error("[보면] 풀영상 정리 실패:", e);
  }
}

// 풀영상 버튼(chartvid:<id>): 캐시가 있으면 즉시 링크, 없으면 렌더 후 링크. 같은
// 채보 동시 요청은 큐가 하나로 합쳐 렌더한다. 실행자에게만 보이는 응답.
// Discord 기본 업로드 한도(모든 유저 25MB) 안쪽이면 파일로 첨부, 넘으면 링크.
const VIDEO_ATTACH_LIMIT = 24 * 1024 * 1024;

async function deliverChartVideo(i: ButtonInteraction, id: string, title: string, path: string, bytes: number): Promise<void> {
  const url = `${getBaseUrl(PORT)}/chart/video?id=${id}`;
  if (bytes <= VIDEO_ATTACH_LIMIT) {
    const safe = (title || "chart").replace(/[^\w.-]+/g, "_").slice(0, 40) || "chart";
    try {
      await i.editReply({ content: msg("chart.videoAttached", { title: title || "채보" }),
        files: [new AttachmentBuilder(path, { name: `${safe}.mp4` })] });
      return;
    } catch (e) {
      // 첨부가 한도 등으로 실패하면 링크로 폴백.
      console.error("[chartvid] 첨부 실패, 링크로 폴백:", e);
    }
  }
  await i.editReply({ content: msg("chart.videoTooBig", { url }) });
}

async function handleChartVideoButton(i: ButtonInteraction): Promise<void> {
  const id = i.customId.slice("chartvid:".length);
  // 모두가 보도록 공개로 응답한다(ephemeral 아님).
  await i.deferReply();

  const ready = await getReadyVideo(id);
  const row = await getSimaiChart(id) as any;
  const title = row?.title || "채보";
  if (ready) { await deliverChartVideo(i, id, title, ready.path, ready.bytes); return; }

  if (!row) { await i.editReply({ content: msg("chart.unavailable.not-found") }); return; }
  let chart: Chart | null = null;
  try {
    if (row.maidata) { const re = parseMaidata(row.maidata); chart = (re.charts[row.difficulty] ?? Object.values(re.charts)[0] ?? null) as Chart | null; }
    if (!chart) chart = JSON.parse(row.chartJson) as Chart;
  } catch { await i.editReply({ content: msg("chart.videoFailed") }); return; }

  const depth = queueDepth();
  await i.editReply({ content: depth > 0 ? msg("chart.videoQueued", { n: depth }) : msg("chart.videoRendering") });
  try {
    const out = await requestVideo({ id: row.id, title: row.title, artist: row.artist, designer: row.designer, level: row.level, difficulty: row.difficulty, chart });
    await deliverChartVideo(i, id, title, out.path, out.bytes);
  } catch (e) {
    console.error("[chartvid] 렌더 실패:", e);
    await i.editReply({ content: msg("chart.videoFailed") });
  }
}

// 개인정보처리방침이 바뀌면(POLICY_VERSION 상향) 등록 사용자에게 다음 명령 실행 시 1회 고지.
// 명령 응답 뒤 ephemeral 팔로업으로 붙이고, 성공하면 policy_ack 를 올려 다시 안 뜨게 한다.
// 세션 행이 없는(= carol 을 쓴 적 없는) 사용자는 대상 아님(getPolicyAck 이 null).
async function maybeSendPolicyNotice(i: ChatInputCommandInteraction): Promise<void> {
  try {
    if (!i.replied && !i.deferred) return;
    const ack = await getPolicyAck(i.user.id);
    if (ack === null || ack >= POLICY_VERSION) return;
    await i.followUp({ content: policyNoticeText(getBaseUrl(PORT)), flags: MessageFlags.Ephemeral });
    await setPolicyAck(i.user.id, POLICY_VERSION);
  } catch (e) {
    console.error("[policy-notice]", e);
  }
}

client.on(Events.InteractionCreate, async (i) => {
  // 자동완성은 3초 안에 답해야 하고 deferReply 가 없다. 제일 먼저 처리한다.
  if (i.isAutocomplete()) {
    const cmd = COMMANDS.find((c) => c.data.name === i.commandName);
    if (!cmd?.autocomplete) { try { await i.respond([]); } catch { /* 이미 만료 */ } return; }
    try { await cmd.autocomplete(i); } catch (e) { console.error(`[autocomplete:${i.commandName}]`, e); }
    return;
  }
  if (i.isChatInputCommand()) {
    const cmd = COMMANDS.find((c) => c.data.name === i.commandName);
    if (!cmd) return;
    try {
      await cmd.execute(i);
    } catch (e) {
      console.error(`[cmd:${i.commandName}]`, e);
    }
    await maybeSendPolicyNotice(i);
    return;
  }
  if (i.isMessageContextMenuCommand()) {
    if (i.commandName === report.contextData.name) {
      try { await report.executeMessage(i); } catch (e) { console.error("[ctxmenu:이슈로 등록]", e); }
    }
    return;
  }
  if (i.isModalSubmit()) {
    if (i.customId.startsWith("report:modal:")) {
      try { await report.handleModal(i); } catch (e) { console.error("[report-modal]", e); }
    }
    return;
  }
  if (i.isButton()) {
    if (i.customId.startsWith("report:")) {
      try { await report.handleButton(i); } catch (e) { console.error("[report-btn]", e); }
      return;
    }
    if (i.customId.startsWith("serverset:")) {
      try { await serverSettings.handleButton(i); } catch (e) { console.error("[serverset-btn]", e); }
      return;
    }
    if (i.customId.startsWith("news:")) {
      try { await handleNewsButton(i); } catch (e) { console.error("[news-btn]", e); }
      return;
    }
    if (i.customId.startsWith("chartvid:")) {
      try { await handleChartVideoButton(i); } catch (e) { console.error("[chartvid-btn]", e); }
      return;
    }
    if (i.customId.startsWith("goal:")) {
      try { await goal.handleButton(i); } catch (e) { console.error("[goal-btn]", e); }
      return;
    }
    if (i.customId.startsWith("recent:") || i.customId.startsWith("page:")) {
      try {
        const parts = i.customId.split(":");
        const userId = parts[1];
        const gameIdx = parseInt(parts[2] ?? "0") || 0;
        const stored = await loadUserSession(userId);
        if (!stored?.friendCode) { await (i as ButtonInteraction).reply({ content: msg("button.needProfile"), ...EPHEMERAL_REPLY }); return; }
        const cached = await getCachedProfile(stored.friendCode);
        if (!cached) { await (i as ButtonInteraction).reply({ content: msg("button.needProfile"), ...EPHEMERAL_REPLY }); return; }
        const result = await recentEmbeds(cached, userId, gameIdx);
        if (i.customId.startsWith("recent:")) {
          await (i as ButtonInteraction).reply({ ...result, ...EPHEMERAL_REPLY });
        } else {
          await (i as ButtonInteraction).update(result);
        }
      } catch (e) {
        console.error("[recent-btn]", e);
      }
      return;
    }
    if (i.customId.startsWith("share:")) {
      try {
        const parts = i.customId.split(":");
        const targetUserId = parts[1];
        const gameIdx = parseInt(parts[2]) || 0;
        const songIdx = parseInt(parts[3]) || 0;
        const stored = await loadUserSession(targetUserId);
        if (!stored?.friendCode) { await (i as ButtonInteraction).reply({ content: msg("button.profileNotFound"), ...EPHEMERAL_REPLY }); return; }
        const cached = await getCachedProfile(stored.friendCode);
        if (!cached) { await (i as ButtonInteraction).reply({ content: msg("button.profileNotFound"), ...EPHEMERAL_REPLY }); return; }
        const result = await recentEmbeds(cached, targetUserId, gameIdx);
        const emb = result.embeds[songIdx];
        if (!emb) { await (i as ButtonInteraction).reply({ content: msg("button.songNotFound"), ...EPHEMERAL_REPLY }); return; }
        emb.setFooter({ text: msg("button.shareFooter", { name: cached.playerName, sharer: i.user.username }) });
        const file = result.files.find((f) => f.name === `jacket${songIdx}.png`);
        await (i as ButtonInteraction).reply({ embeds: [emb], files: file ? [file] : [] });
      } catch (e) {
        console.error("[share-btn]", e);
      }
      return;
    }
    if (i.customId.startsWith("rt:")) {
      try {
        const parts = i.customId.split(":");
        const userId = parts[1];
        const stored = await loadUserSession(userId);
        if (!stored?.friendCode) { await (i as ButtonInteraction).reply({ content: msg("button.needProfile"), ...EPHEMERAL_REPLY }); return; }
        const cached = await getCachedProfile(stored.friendCode);
        if (!cached) { await (i as ButtonInteraction).reply({ content: msg("button.needProfile"), ...EPHEMERAL_REPLY }); return; }
        await (i as ButtonInteraction).reply({ ...rtTableEmbed(cached, await getTranslateTitles(userId)), ...EPHEMERAL_REPLY });
      } catch (e) {
        console.error("[rt-btn]", e);
      }
      return;
    }
    if (i.customId.startsWith("mapopen:")) {
      try {
        const parts = i.customId.split(":");
        const userId = parts[1];
        if (userId !== i.user.id) { await (i as ButtonInteraction).reply({ content: msg("button.ownMapOpenOnly"), ...EPHEMERAL_REPLY }); return; }
        const stored = await loadUserSession(userId);
        if (!stored?.friendCode) { await (i as ButtonInteraction).reply({ content: msg("button.needProfile"), ...EPHEMERAL_REPLY }); return; }
        const cached = await getCachedProfile(stored.friendCode);
        if (!cached) { await (i as ButtonInteraction).reply({ content: msg("button.needProfile"), ...EPHEMERAL_REPLY }); return; }
        await (i as ButtonInteraction).deferReply(EPHEMERAL_REPLY);
        await (i as ButtonInteraction).editReply(await mapAreaEmbed(cached, userId, 0));
      } catch (e) {
        console.error("[mapopen-btn]", e);
      }
      return;
    }
    if (i.customId.startsWith("map:")) {
      try {
        const parts = i.customId.split(":");
        const userId = parts[1];
        const pageIdx = parseInt(parts[2] ?? "0") || 0;
        if (userId !== i.user.id) { await (i as ButtonInteraction).reply({ content: msg("button.ownMapViewOnly"), ...EPHEMERAL_REPLY }); return; }
        const stored = await loadUserSession(userId);
        if (!stored?.friendCode) { await (i as ButtonInteraction).reply({ content: msg("button.needProfile"), ...EPHEMERAL_REPLY }); return; }
        const cached = await getCachedProfile(stored.friendCode);
        if (!cached) { await (i as ButtonInteraction).reply({ content: msg("button.needProfile"), ...EPHEMERAL_REPLY }); return; }
        await (i as ButtonInteraction).deferUpdate();
        await (i as ButtonInteraction).editReply(await mapAreaEmbed(cached, userId, pageIdx));
      } catch (e) {
        console.error("[map-btn]", e);
      }
      return;
    }
    if (i.customId.startsWith("mapshare:")) {
      try {
        const parts = i.customId.split(":");
        const userId = parts[1];
        const areaIdx = parseInt(parts[2] ?? "0") || 0;
        if (userId !== i.user.id) { await (i as ButtonInteraction).reply({ content: msg("button.ownMapShareOnly"), ...EPHEMERAL_REPLY }); return; }
        const stored = await loadUserSession(userId);
        if (!stored?.friendCode) { await (i as ButtonInteraction).reply({ content: msg("button.profileNotFound"), ...EPHEMERAL_REPLY }); return; }
        const cached = await getCachedProfile(stored.friendCode);
        if (!cached) { await (i as ButtonInteraction).reply({ content: msg("button.profileNotFound"), ...EPHEMERAL_REPLY }); return; }
        await (i as ButtonInteraction).deferReply();
        const result = await mapAreaEmbed(cached, userId, Math.floor(areaIdx / 5));
        const emb = result.embeds[areaIdx % 5];
        if (!emb) { await (i as ButtonInteraction).reply({ content: msg("button.mapNotFound"), ...EPHEMERAL_REPLY }); return; }
        emb.setFooter({ text: `${cached.playerName}의 지방 진행도  ·  공유: ${i.user.username}` });
        const file = result.files.find((f) => f.name === `map${areaIdx}.png`);
        await (i as ButtonInteraction).editReply({ embeds: [emb], files: file ? [file] : [] });
      } catch (e) {
        console.error("[mapshare-btn]", e);
      }
      return;
    }
    if (i.customId.startsWith("search:")) {
      try {
        const parts = i.customId.split(":");
        const token = parts[1];
        const pageIdx = parseInt(parts[2] ?? "0") || 0;
        const ctx = getSearchCtx(token);
        if (!ctx) { await (i as ButtonInteraction).reply({ content: "검색이 만료되었습니다. 다시 검색해주세요.", ...EPHEMERAL_REPLY }); return; }
        const stored = await loadUserSession(ctx.userId);
        if (!stored?.friendCode) { await (i as ButtonInteraction).reply({ content: msg("button.needProfile"), ...EPHEMERAL_REPLY }); return; }
        const cached = await getCachedProfile(stored.friendCode);
        if (!cached) { await (i as ButtonInteraction).reply({ content: msg("button.needProfile"), ...EPHEMERAL_REPLY }); return; }
        const result = await searchResultEmbeds(cached, ctx.userId, ctx.query, pageIdx, ctx.typeFilter, token);
        await (i as ButtonInteraction).update(result);
      } catch (e) {
        console.error("[search-btn]", e);
      }
      return;
    }
  }
});

async function main(): Promise<void> {
  await initializeStorage();
  initEncryption(CONFIG.encryptionKey);
  if (CONFIG.baseUrl) setBaseUrl(CONFIG.baseUrl);
  startWebServer(PORT);
  setGuildCountProvider(() => client.guilds.cache.size);
  setGatewayPingProvider(() => client.ws.ping);
  process.on("SIGINT", () => { void closeStorage().finally(() => process.exit(0)); });
  process.on("SIGTERM", () => { void closeStorage().finally(() => process.exit(0)); });
  await client.login(CONFIG.token);
}

void main().catch((e) => { console.error("[startup] storage initialization failed", e); process.exitCode = 1; });
