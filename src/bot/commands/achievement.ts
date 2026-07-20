import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags, AttachmentBuilder } from "discord.js";
import { getDailyAchievementSummaries, getAvatarBlob, getCachedProfile, getProfilePrivate, getUserFriendCode, getTranslateTitles } from "../../storage";
import { koreaPlayDayKey, koreaPlayDayRange } from "../../achievements";
import { getJacketFile } from "../../constants";
import { renderAchievementCard } from "../utils/achievementCard";

export const data = new SlashCommandBuilder()
  .setName("성과")
  .setDescription("04:00 KST 기준 일일 성과")
  .addUserOption((opt) =>
    opt.setName("user").setDescription("조회할 유저 (생략 시 본인)").setRequired(false),
  )
  .addStringOption((opt) =>
    opt
      .setName("date")
      .setDescription("조회할 날짜 (YYYY-MM-DD, 생략 시 오늘)")
      .setRequired(false),
  );

function isPlayDayKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function achievementJacketUrl(record: { recordJson: string; title: string }): string {
  try {
    const parsed = JSON.parse(record.recordJson) as { jacketUrl?: unknown };
    if (typeof parsed.jacketUrl === "string") {
      const url = new URL(parsed.jacketUrl);
      if ((url.protocol === "http:" || url.protocol === "https:") && ["maimaidx.jp", "maimaidx-eng.com", "otoge-db.net"].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) return url.toString();
    }
  } catch { /* legacy rows may contain non-JSON payloads */ }
  const file = getJacketFile(record.title);
  return file ? `https://otoge-db.net/maimai/jacket/${encodeURIComponent(file)}` : "";
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser("user") ?? interaction.user;
  const userId = target.id;
  const targetScope = target.id === interaction.user.id ? "self" : "other";
  const requestedDay = interaction.options.getString("date") ?? "";
  let replyDeferred = false;
  console.log(`[성과] 시작 scope=${targetScope} userSuffix=${userId.slice(-6)} requestedDay=${requestedDay || "today"}`);
  if (target.id !== interaction.user.id && await getProfilePrivate(target.id)) {
    console.log(`[성과] 비공개 차단 scope=${targetScope}`);
    await interaction.reply({ content: `<@${target.id}> 님은 프로필을 비공개로 설정했습니다.`, flags: MessageFlags.Ephemeral });
    return;
  }
  const friendCode = await getUserFriendCode(userId);
  const cached = friendCode ? await getCachedProfile(friendCode) : null;
  if (!cached) {
    console.log(`[성과] 프로필 없음 scope=${targetScope}`);
    const msg = target.id === interaction.user.id
      ? "아직 프로필이 등록되지 않았습니다. `/북마클릿` 명령어로 먼저 등록해주세요."
      : `<@${target.id}> 님은 아직 프로필을 등록하지 않았습니다.`;
    await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
    return;
  }

  try {
    const playDay = requestedDay && isPlayDayKey(requestedDay)
      ? requestedDay
      : koreaPlayDayKey(new Date());
    const { from, to } = koreaPlayDayRange(playDay);
    const summaries = await getDailyAchievementSummaries(userId, from, to);
    const records = summaries.map((e) => ({ title:e.title, achievement:e.achievementAfter.toFixed(4)+"%", diff:e.diff, level:e.level, date:new Date(e.playedAt).toISOString(), jacketUrl:achievementJacketUrl(e), musicKind:e.musicKind, achievementVal:Number(e.achievementAfter), track:0, fc:e.fc, sync:e.sync, ratingUp:e.ratingUp ?? undefined, playedAt:Number(e.playedAt), achievementGain:e.ratingGain, ratingGain:e.ratingGain, achievementBefore:e.achievementBefore, achievementAfter:e.achievementAfter, levelConstant:e.levelConstant ?? undefined }));
    console.log(`[성과] 데이터 summaries=${summaries.length} records=${records.length}`);
    if (records.length === 0) {
      console.log(`[성과] 표시할 성과 없음 playDay=${playDay}`);
      await interaction.reply({
        content: requestedDay
          ? `${playDay}에 의미 있는 성과가 없습니다.`
          : "오늘의 의미 있는 성과가 없습니다.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.deferReply();
    replyDeferred = true;
    const avatar = await getAvatarBlob(userId, cached.server);
    const renderStartedAt = Date.now();
    console.log(`[성과] 렌더 시작 records=${records.length} avatarBytes=${avatar?.length ?? 0}`);
    const png = await renderAchievementCard(cached, records, playDay, avatar, await getTranslateTitles(interaction.user.id));
    console.log(`[성과] 렌더 완료 pngBytes=${png.length} elapsedMs=${Date.now() - renderStartedAt}`);
    await interaction.editReply({
      files: [new AttachmentBuilder(png, { name: `achievement-${playDay}.png` })],
    });
    console.log(`[성과] 응답 완료 playDay=${playDay}`);
  } catch (e) {
    const errorMessage = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.error(`[성과] 실패 scope=${targetScope} userSuffix=${userId.slice(-6)} message=${errorMessage}`, e);
    try {
      if (replyDeferred) {
        await interaction.editReply({ content: "성과 이미지 생성에 실패했습니다." });
      } else {
        await interaction.reply({ content: "성과 데이터를 불러오지 못했습니다.", flags: MessageFlags.Ephemeral });
      }
    } catch (replyError) {
      const replyMessage = replyError instanceof Error ? `${replyError.name}: ${replyError.message}` : String(replyError);
      console.error(`[성과] 실패 안내 응답도 실패 message=${replyMessage}`, replyError);
    }
  }
}
