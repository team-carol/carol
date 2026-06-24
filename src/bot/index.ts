import { Client, Events, GatewayIntentBits, ChatInputCommandInteraction, ButtonInteraction, REST, Routes } from "discord.js";
import { initEncryption } from "../crypto";
import { startWebServer, setBaseUrl } from "../web";
import { closeDb, loadUserSession, getCachedProfile, clearRatingCardCacheForInactive } from "../db";
import { CONFIG, PORT } from "../config";
import { recentEmbeds, rtTableEmbed, searchResultEmbeds } from "./utils/embeds";

import { loadConstants } from "../constants";
import { loadFonts } from "../fonts";

import * as profile      from "./commands/profile";
import * as bookmarklet  from "./commands/bookmarklet";
import * as ratingtable  from "./commands/ratingtable";
import * as ratingimage  from "./commands/ratingimage";
import * as settings     from "./commands/settings";
import * as search       from "./commands/search";

type Command = { data: { toJSON(): object; name: string }; execute: (i: ChatInputCommandInteraction) => Promise<void> };

const COMMANDS: Command[] = [profile, bookmarklet, ratingtable, ratingimage, settings, search];

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
  await rest.put(route, { body: COMMANDS.map((cmd) => cmd.data.toJSON()) });
  await loadConstants();
  setInterval(() => loadConstants(), 24 * 60 * 60 * 1000);
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
  if (i.isButton()) {
    if (i.customId.startsWith("settings:")) {
      try { await settings.handleButton(i); } catch (e) { console.error("[settings-btn]", e); }
      return;
    }
    if (i.customId.startsWith("recent:") || i.customId.startsWith("page:")) {
      try {
        const parts = i.customId.split(":");
        const userId = parts[1];
        const gameIdx = parseInt(parts[2] ?? "0") || 0;
        const stored = loadUserSession(userId);
        if (!stored?.friendCode) { await (i as ButtonInteraction).reply({ content: "프로필을 먼저 등록하세요.", ephemeral: true }); return; }
        const cached = getCachedProfile(stored.friendCode);
        if (!cached) { await (i as ButtonInteraction).reply({ content: "프로필을 먼저 등록하세요.", ephemeral: true }); return; }
        const result = await recentEmbeds(cached, userId, gameIdx);
        if (i.customId.startsWith("recent:")) {
          await (i as ButtonInteraction).reply({ ...result, ephemeral: true });
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
        if (!stored?.friendCode) { await (i as ButtonInteraction).reply({ content: "프로필을 찾을 수 없습니다.", ephemeral: true }); return; }
        const cached = getCachedProfile(stored.friendCode);
        if (!cached) { await (i as ButtonInteraction).reply({ content: "프로필을 찾을 수 없습니다.", ephemeral: true }); return; }
        const result = await recentEmbeds(cached, targetUserId, gameIdx);
        const emb = result.embeds[songIdx];
        if (!emb) { await (i as ButtonInteraction).reply({ content: "곡을 찾을 수 없습니다.", ephemeral: true }); return; }
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
        if (!stored?.friendCode) { await (i as ButtonInteraction).reply({ content: "프로필을 먼저 등록하세요.", ephemeral: true }); return; }
        const cached = getCachedProfile(stored.friendCode);
        if (!cached) { await (i as ButtonInteraction).reply({ content: "프로필을 먼저 등록하세요.", ephemeral: true }); return; }
        await (i as ButtonInteraction).reply({ ...rtTableEmbed(cached), ephemeral: true });
      } catch (e) {
        console.error("[rt-btn]", e);
      }
      return;
    }
    if (i.customId.startsWith("search:")) {
      try {
        const parts = i.customId.split(":");
        const userId = parts[1];
        const query = decodeURIComponent(parts[2] ?? "");
        const pageIdx = parseInt(parts[3] ?? "0") || 0;
        const stored = loadUserSession(userId);
        if (!stored?.friendCode) { await (i as ButtonInteraction).reply({ content: "프로필을 먼저 등록하세요.", ephemeral: true }); return; }
        const cached = getCachedProfile(stored.friendCode);
        if (!cached) { await (i as ButtonInteraction).reply({ content: "프로필을 먼저 등록하세요.", ephemeral: true }); return; }
        const result = await searchResultEmbeds(cached, userId, query, pageIdx);
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
