import { Client, Events, GatewayIntentBits, ChatInputCommandInteraction, ButtonInteraction, REST, Routes, MessageFlags } from "discord.js";
import { initEncryption } from "../crypto";
import { startWebServer, setBaseUrl } from "../web";
import { closeDb, loadUserSession, getCachedProfile, clearRatingCardCacheForInactive, getTranslateTitles } from "../db";
import { CONFIG, PORT } from "../config";
import { recentEmbeds, rtTableEmbed, searchResultEmbeds, getSearchCtx, mapAreaEmbed } from "./utils/embeds";

import { loadConstants } from "../constants";
import { loadAliases } from "../aliases";
import { loadFonts } from "../fonts";

import * as profile      from "./commands/profile";
import * as bookmarklet  from "./commands/bookmarklet";
import * as ratingtable  from "./commands/ratingtable";
import * as ratingimage  from "./commands/ratingimage";
import * as achievement  from "./commands/achievement";
import * as fortune      from "./commands/fortune";
import * as settings     from "./commands/settings";
import * as serverSettings from "./commands/serverSettings";
import * as search       from "./commands/search";
import * as status       from "./commands/status";
import * as songrec      from "./commands/songrec";
import * as random       from "./commands/random";
import * as areaMap      from "./commands/map";
import * as report       from "./commands/report";
import * as aliasAdmin   from "./commands/aliasAdmin";

type Command = { data: { toJSON(): object; name: string }; execute: (i: ChatInputCommandInteraction) => Promise<void> };

const COMMANDS: Command[] = [profile, bookmarklet, ratingtable, ratingimage, achievement, fortune, settings, serverSettings, search, status, songrec, random, areaMap, report, aliasAdmin];
const EPHEMERAL_REPLY = { flags: MessageFlags.Ephemeral } as const;

const RATING_CARD_GC_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;
const RATING_CARD_GC_INTERVAL_MS = 24 * 60 * 60 * 1000;

function runRatingCardGC(): void {
  try {
    const cleared = clearRatingCardCacheForInactive(RATING_CARD_GC_THRESHOLD_MS);
    if (cleared > 0) console.log(`[gc] rating_card_blob cleared for ${cleared} inactive profile(s)`);
  } catch (e) {
    console.error("[gc] rating_card_blob cleanup failed:", e);
  }
}

initEncryption(CONFIG.encryptionKey);
if (CONFIG.baseUrl) setBaseUrl(CONFIG.baseUrl);
startWebServer(PORT);

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async (c) => {
  console.log(`[maimai] ${c.user.tag}`);
  const rest = new REST({ version: "10" }).setToken(CONFIG.token);
  const route = CONFIG.guildId
    ? Routes.applicationGuildCommands(CONFIG.clientId, CONFIG.guildId)
    : Routes.applicationCommands(CONFIG.clientId);
  await rest.put(route, { body: [...COMMANDS.map((cmd) => cmd.data.toJSON()), report.contextData.toJSON()] });
  await loadConstants();
  setInterval(() => loadConstants(), 24 * 60 * 60 * 1000);
  loadAliases();
  loadFonts().catch((e) => console.error("[fonts] 초기 로드 실패:", e));
  runRatingCardGC();
  setInterval(runRatingCardGC, RATING_CARD_GC_INTERVAL_MS);
  console.log("[maimai] 준비 완료");
});

client.on(Events.InteractionCreate, async (i) => {
  if (i.isChatInputCommand()) {
    const cmd = COMMANDS.find((c) => c.data.name === i.commandName);
    if (!cmd) return;
    try {
      await cmd.execute(i);
    } catch (e) {
      console.error(`[cmd:${i.commandName}]`, e);
    }
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
    if (i.customId.startsWith("recent:") || i.customId.startsWith("page:")) {
      try {
        const parts = i.customId.split(":");
        const userId = parts[1];
        const gameIdx = parseInt(parts[2] ?? "0") || 0;
        const stored = loadUserSession(userId);
        if (!stored?.friendCode) { await (i as ButtonInteraction).reply({ content: "프로필을 먼저 등록하세요.", ...EPHEMERAL_REPLY }); return; }
        const cached = getCachedProfile(stored.friendCode);
        if (!cached) { await (i as ButtonInteraction).reply({ content: "프로필을 먼저 등록하세요.", ...EPHEMERAL_REPLY }); return; }
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
        const stored = loadUserSession(targetUserId);
        if (!stored?.friendCode) { await (i as ButtonInteraction).reply({ content: "프로필을 찾을 수 없습니다.", ...EPHEMERAL_REPLY }); return; }
        const cached = getCachedProfile(stored.friendCode);
        if (!cached) { await (i as ButtonInteraction).reply({ content: "프로필을 찾을 수 없습니다.", ...EPHEMERAL_REPLY }); return; }
        const result = await recentEmbeds(cached, targetUserId, gameIdx);
        const emb = result.embeds[songIdx];
        if (!emb) { await (i as ButtonInteraction).reply({ content: "곡을 찾을 수 없습니다.", ...EPHEMERAL_REPLY }); return; }
        emb.setFooter({ text: `${cached.playerName}의 플레이  ·  공유: ${i.user.username}` });
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
        const stored = loadUserSession(userId);
        if (!stored?.friendCode) { await (i as ButtonInteraction).reply({ content: "프로필을 먼저 등록하세요.", ...EPHEMERAL_REPLY }); return; }
        const cached = getCachedProfile(stored.friendCode);
        if (!cached) { await (i as ButtonInteraction).reply({ content: "프로필을 먼저 등록하세요.", ...EPHEMERAL_REPLY }); return; }
        await (i as ButtonInteraction).reply({ ...rtTableEmbed(cached, getTranslateTitles(userId)), ...EPHEMERAL_REPLY });
      } catch (e) {
        console.error("[rt-btn]", e);
      }
      return;
    }
    if (i.customId.startsWith("mapopen:")) {
      try {
        const parts = i.customId.split(":");
        const userId = parts[1];
        if (userId !== i.user.id) { await (i as ButtonInteraction).reply({ content: "본인 지방 진행도만 열 수 있습니다.", ...EPHEMERAL_REPLY }); return; }
        const stored = loadUserSession(userId);
        if (!stored?.friendCode) { await (i as ButtonInteraction).reply({ content: "프로필을 먼저 등록하세요.", ...EPHEMERAL_REPLY }); return; }
        const cached = getCachedProfile(stored.friendCode);
        if (!cached) { await (i as ButtonInteraction).reply({ content: "프로필을 먼저 등록하세요.", ...EPHEMERAL_REPLY }); return; }
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
        if (userId !== i.user.id) { await (i as ButtonInteraction).reply({ content: "본인 지방 진행도만 볼 수 있습니다.", ...EPHEMERAL_REPLY }); return; }
        const stored = loadUserSession(userId);
        if (!stored?.friendCode) { await (i as ButtonInteraction).reply({ content: "프로필을 먼저 등록하세요.", ...EPHEMERAL_REPLY }); return; }
        const cached = getCachedProfile(stored.friendCode);
        if (!cached) { await (i as ButtonInteraction).reply({ content: "프로필을 먼저 등록하세요.", ...EPHEMERAL_REPLY }); return; }
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
        if (userId !== i.user.id) { await (i as ButtonInteraction).reply({ content: "본인 지방 진행도만 공유할 수 있습니다.", ...EPHEMERAL_REPLY }); return; }
        const stored = loadUserSession(userId);
        if (!stored?.friendCode) { await (i as ButtonInteraction).reply({ content: "프로필을 찾을 수 없습니다.", ...EPHEMERAL_REPLY }); return; }
        const cached = getCachedProfile(stored.friendCode);
        if (!cached) { await (i as ButtonInteraction).reply({ content: "프로필을 찾을 수 없습니다.", ...EPHEMERAL_REPLY }); return; }
        await (i as ButtonInteraction).deferReply();
        const result = await mapAreaEmbed(cached, userId, Math.floor(areaIdx / 5));
        const emb = result.embeds[areaIdx % 5];
        if (!emb) { await (i as ButtonInteraction).reply({ content: "지방 진행도를 찾을 수 없습니다.", ...EPHEMERAL_REPLY }); return; }
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
        const stored = loadUserSession(ctx.userId);
        if (!stored?.friendCode) { await (i as ButtonInteraction).reply({ content: "프로필을 먼저 등록하세요.", ...EPHEMERAL_REPLY }); return; }
        const cached = getCachedProfile(stored.friendCode);
        if (!cached) { await (i as ButtonInteraction).reply({ content: "프로필을 먼저 등록하세요.", ...EPHEMERAL_REPLY }); return; }
        const result = await searchResultEmbeds(cached, ctx.userId, ctx.query, pageIdx, ctx.typeFilter, token);
        await (i as ButtonInteraction).update(result);
      } catch (e) {
        console.error("[search-btn]", e);
      }
      return;
    }
  }
});

process.on("SIGINT",  () => { closeDb(); process.exit(0); });
process.on("SIGTERM", () => { closeDb(); process.exit(0); });
client.login(CONFIG.token);
