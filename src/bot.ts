import {
  Client, Events, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, MessageFlags,
  ChatInputCommandInteraction, REST, Routes, StringSelectMenuBuilder, ActionRowBuilder,
  StringSelectMenuInteraction, AttachmentBuilder,
} from "discord.js";
import { initEncryption } from "./crypto";
import { startWebServer, buildBookmarklet, setBaseUrl } from "./web";
import { getCachedProfile, loadUserSession, closeDb, getUserSyncToken, getAvatarBlob } from "./db";

const CONFIG = require("../config.json") as {
  token: string; clientId: string; guildId?: string; encryptionKey?: string;
  webPort?: number; baseUrl?: string;
};

initEncryption(CONFIG.encryptionKey);
const PORT = CONFIG.webPort ?? 3456;
if (CONFIG.baseUrl) setBaseUrl(CONFIG.baseUrl);
startWebServer(PORT);

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
  new SlashCommandBuilder().setName("프로필").setDescription("내 maimai DX 프로필 보기"),
  new SlashCommandBuilder().setName("북마클릿").setDescription("프로필 동기화용 북마클릿 코드 받기"),
].map((c) => c.toJSON());

client.once(Events.ClientReady, async (c) => {
  console.log(`[maimai] ${c.user.tag}`);
  const rest = new REST({ version: "10" }).setToken(CONFIG.token);
  await rest.put(CONFIG.guildId
    ? Routes.applicationGuildCommands(CONFIG.clientId, CONFIG.guildId)
    : Routes.applicationCommands(CONFIG.clientId), { body: commands });
  console.log("[maimai] 준비 완료");
});

client.on(Events.InteractionCreate, async (i) => {
  if (i.isChatInputCommand()) await handleCmd(i);
  if (i.isStringSelectMenu()) await handleSelect(i);
});

const TICON: Record<string, string> = { normal: "⚪", bronze: "🟤", silver: "⚪", gold: "🟡", rainbow: "🌈" };
const TCOLOR: Record<string, number> = { normal: 0x808080, bronze: 0xcd7f32, silver: 0xc0c0c0, gold: 0xffd700, rainbow: 0x8b00ff };

function parseGradeText(gradeImg: string): string {
  if (!gradeImg) return "";
  const url = gradeImg.toLowerCase();
  if (url.includes("/course/")) {
    const name = decodeURIComponent(gradeImg.split("/").pop()?.split(".")[0] || "");
    return "코스 " + name.replace(/^course_rank_/i, "").substring(0, 6);
  }
  if (url.includes("/class/")) {
    const name = decodeURIComponent(gradeImg.split("/").pop()?.split(".")[0] || "");
    return "클래스 " + name.replace(/^class_rank_s_/i, "").substring(0, 6);
  }
  const name = decodeURIComponent(gradeImg.split("/").pop()?.split(".")[0] || "");
  const cleaned = name.replace(/^(grade_|class_|dan_|course_rank_|class_rank_)/i, "");
  return cleaned.length < 20 ? cleaned.toUpperCase() : "";
}

function buildAvatarAttachment(userId: string): AttachmentBuilder | null {
  const buf = getAvatarBlob(userId);
  if (!buf) return null;
  return new AttachmentBuilder(buf, { name: "avatar.png" });
}

function ratingColor(r: number): number {
  if (r >= 15000) return 0x8b00ff;  // 🌈 rainbow
  if (r >= 14000) return 0xffd700;  // 🟡 gold
  if (r >= 13000) return 0x8c8c8c;  // ⚪ silver
  if (r >= 12000) return 0xcd7f32;  // 🟤 bronze
  if (r >= 10000) return 0xbd5dc7;  // 🟣 purple
  if (r >= 8000)  return 0xd95656;  // 🔴 red
  if (r >= 6000)  return 0xf09c3c;  // 🟠 orange
  if (r >= 4000)  return 0x5fba63;  // 🟢 green
  if (r >= 2000)  return 0x4d9eea;  // 🔵 blue
  return 0x95a5a6;                   // ⚪ silver-white
}

function ratingChar(r: number): string {
  if (r >= 15000) return "🌈";
  if (r >= 14000) return "🟡";
  if (r >= 13000) return "⚪";
  if (r >= 12000) return "🟤";
  if (r >= 10000) return "🟣";
  if (r >= 8000)  return "🔴";
  if (r >= 6000)  return "🟠";
  if (r >= 4000)  return "🟢";
  if (r >= 2000)  return "🔵";
  return "⚪";
}

function profileEmb(p: NonNullable<ReturnType<typeof getCachedProfile>>, hasAvatar: boolean) {
  const grade = parseGradeText(p.gradeImg);
  const emb = new EmbedBuilder()
    .setColor(ratingColor(p.rating))
    .setAuthor({ name: `${TICON[p.trophyClass] || "⚪"} ${p.trophy || "칭호 없음"} (${p.trophyClass})` })
    .setTitle(p.playerName || "이름 없음")
    .setDescription(
      `${ratingChar(p.rating)} ${p.rating || 0}\n` +
      `🎮 ${p.playCount || 0}회${p.stars ? " ⭐×" + p.stars : ""}${grade ? " | 등급: " + grade : ""}`
    )
    .addFields({ name: "친구 코드", value: p.friendCode || "-", inline: true })
    .setFooter({ text: `마지막 동기화: ${new Date(p.lastSyncedAt).toLocaleString("ko-KR")}` });
  if (hasAvatar) emb.setThumbnail("attachment://avatar.png");
  return emb;
}

function contentEmb(p: NonNullable<ReturnType<typeof getCachedProfile>>, view: string) {
  const raw = JSON.parse(p.recentJson || "{}");
  const recentRecords: any[] = Array.isArray(raw) ? raw : (raw.recent || []);
  const top5Records: any[] = Array.isArray(raw) ? [] : (raw.top5 || []);
  const records = view === "recent" ? recentRecords : top5Records;
  const emb = new EmbedBuilder().setColor(0x2b2d31).setTitle(view === "recent" ? "🎵 최근 플레이" : "🏆 TOP 5");
  if (records.length === 0) { emb.setDescription("기록 없음"); return emb; }
  emb.setDescription(records.map((r: any, i: number) => {
    const kind = r.musicKind ? ` \`${r.musicKind}\`` : "";
    return `\`${i + 1}.\` **${r.title}** \`${r.diff} ${r.level}\`${kind}\n　${r.achievement}${r.date ? " · " + r.date : ""}`;
  }).join("\n\n"));
  return emb;
}

function selectMenu(view: string) {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId("maimai_view").setPlaceholder("보기 선택")
      .addOptions(
        { label: "최근 플레이", value: "recent", default: view === "recent", emoji: { name: "🎵" } },
        { label: "TOP 5", value: "top5", default: view === "top5", emoji: { name: "⭐" } },
      ),
  );
}

function buildProfileReply(cached: NonNullable<ReturnType<typeof getCachedProfile>>, userId: string, view: string) {
  const avatar = buildAvatarAttachment(userId);
  const files = avatar ? [avatar] : [];
  return {
    embeds: [profileEmb(cached, !!avatar), contentEmb(cached, view)],
    components: [selectMenu(view)],
    files,
  };
}

async function handleCmd(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id;
  if (interaction.commandName === "프로필") {
    const stored = loadUserSession(userId);
    if (stored?.friendCode) {
      const cached = getCachedProfile(stored.friendCode);
      if (cached) {
        await interaction.reply(buildProfileReply(cached, userId, "recent"));
        return;
      }
    }
    await interaction.reply({
      content: "아직 프로필이 등록되지 않았습니다. `/북마클릿` 명령어로 먼저 등록해주세요.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (interaction.commandName === "북마클릿") {
    const token = getUserSyncToken(userId);
    await interaction.reply({
      embeds: [new EmbedBuilder().setTitle("📋 프로필 등록").setColor(0x888888)
        .setDescription(`[maimai DX net](https://maimaidx-eng.com/maimai-mobile/)에서 북마클릿 실행`)
        .addFields({ name: "코드", value: `\`\`\`js\n${buildBookmarklet(token, PORT)}\n\`\`\`` })],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
}

async function handleSelect(interaction: StringSelectMenuInteraction) {
  if (interaction.customId !== "maimai_view") return;
  const userId = interaction.user.id;
  const stored = loadUserSession(userId);
  if (!stored?.friendCode) { await interaction.reply({ content: "먼저 /북마클릿으로 등록하세요.", flags: MessageFlags.Ephemeral }); return; }
  const cached = getCachedProfile(stored.friendCode);
  if (!cached) { await interaction.reply({ content: "데이터 없음.", flags: MessageFlags.Ephemeral }); return; }
  const view = interaction.values[0];
  const avatar = buildAvatarAttachment(userId);
  const files = avatar ? [avatar] : [];
  await interaction.update({ embeds: [profileEmb(cached, !!avatar), contentEmb(cached, view)], components: [selectMenu(view)], files });
}

process.on("SIGINT", () => { closeDb(); process.exit(0); });
process.on("SIGTERM", () => { closeDb(); process.exit(0); });
client.login(CONFIG.token);
