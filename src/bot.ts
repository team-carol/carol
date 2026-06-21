import { Client, Events, GatewayIntentBits, ChatInputCommandInteraction, ButtonInteraction, REST, Routes } from "discord.js";
import { initEncryption } from "./crypto";
import { startWebServer, setBaseUrl } from "./web";
import { closeDb, loadUserSession, getCachedProfile } from "./db";
import { CONFIG, PORT } from "./config";
import { recentEmbeds } from "./utils/embeds";

import * as profile     from "./commands/profile";
import * as bookmarklet from "./commands/bookmarklet";
import * as ratingtable from "./commands/ratingtable";
import * as settings    from "./commands/settings";

type Command = { data: { toJSON(): object; name: string }; execute: (i: ChatInputCommandInteraction) => Promise<void> };

const COMMANDS: Command[] = [profile, bookmarklet, ratingtable, settings];

initEncryption(CONFIG.encryptionKey);
if (CONFIG.baseUrl) setBaseUrl(CONFIG.baseUrl);
startWebServer(PORT);

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async (c) => {
  console.log(`[maimai] ${c.user.tag}`);
  const rest = new REST({ version: "10" }).setToken(CONFIG.token);
  await rest.put(
    Routes.applicationCommands(CONFIG.clientId),
    { body: COMMANDS.map((cmd) => cmd.data.toJSON()) },
  );
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
        const result = recentEmbeds(cached, userId, PORT, gameIdx);
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
  }
});

process.on("SIGINT",  () => { closeDb(); process.exit(0); });
process.on("SIGTERM", () => { closeDb(); process.exit(0); });
client.login(CONFIG.token);
