import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags, AttachmentBuilder } from "discord.js";
import { getAchievementInitializedAt, getAchievementRepeatedFromDay, getAvatarBlob, getCachedProfile, getDailyAchievements, getProfilePrivate, getUserFriendCode } from "../../db";
import { attachAchievementGains, koreaPlayDayKey, parseDailyAchievementRows } from "../../achievements";
import { renderAchievementCard } from "../utils/achievementCard";

export const data = new SlashCommandBuilder()
  .setName("성과")
  .setDescription("새롭게 달성한 스코어를 이미지로 표시 (한국시간 오전 4시 기준)")
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

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser("user") ?? interaction.user;
  const userId = target.id;
  const targetScope = target.id === interaction.user.id ? "self" : "other";
  const requestedDay = interaction.options.getString("date") ?? "";
  let replyDeferred = false;
  console.log(`[성과] 시작 scope=${targetScope} userSuffix=${userId.slice(-6)} requestedDay=${requestedDay || "today"}`);
  if (target.id !== interaction.user.id && getProfilePrivate(target.id)) {
    console.log(`[성과] 비공개 차단 scope=${targetScope}`);
    await interaction.reply({ content: `<@${target.id}> 님은 프로필을 비공개로 설정했습니다.`, flags: MessageFlags.Ephemeral });
    return;
  }
  const friendCode = getUserFriendCode(userId);
  const cached = friendCode ? getCachedProfile(friendCode) : null;
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
    const initializedAt = getAchievementInitializedAt(cached.profileKey);
    const initializedDay = initializedAt > 0 ? koreaPlayDayKey(new Date(initializedAt)) : "";
    const repeatedFromDay = getAchievementRepeatedFromDay(cached.profileKey) ?? "";
    const availableFromDay = [initializedDay, repeatedFromDay].filter(Boolean).sort()[0] ?? "";
    const dailyRows = getDailyAchievements(cached.profileKey, playDay);
    const hasNewScoreForDay = dailyRows.length > 0;
    console.log(`[성과] 기준 확인 playDay=${playDay} initialized=${initializedAt > 0} initializedDay=${initializedDay || "none"} repeatedFromDay=${repeatedFromDay || "none"} availableFromDay=${availableFromDay || "none"} dayRows=${dailyRows.length}`);
    if (requestedDay && isPlayDayKey(requestedDay) && availableFromDay && requestedDay < availableFromDay && !hasNewScoreForDay) {
      console.log(`[성과] 이전 날짜 차단 requestedDay=${requestedDay} availableFromDay=${availableFromDay} hasNewScoreForDay=${hasNewScoreForDay}`);
      await interaction.reply({
        content: `성과 데이터가 수집된 시작일은 ${availableFromDay}입니다. 이전 날짜는 조회할 수 없습니다.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const parsedRecords = parseDailyAchievementRows(dailyRows);
    const records = attachAchievementGains(cached.profileKey, parsedRecords);
    console.log(`[성과] 데이터 rows=${dailyRows.length} parsed=${parsedRecords.length} records=${records.length}`);
    if (records.length === 0) {
      console.log(`[성과] 표시할 성과 없음 playDay=${playDay}`);
      await interaction.reply({
        content: requestedDay
          ? `${playDay}에 새로 달성한 스코어가 없습니다.`
          : "오늘 새로 달성한 스코어가 없습니다.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.deferReply();
    replyDeferred = true;
    const avatar = getAvatarBlob(userId, cached.server);
    const renderStartedAt = Date.now();
    console.log(`[성과] 렌더 시작 records=${records.length} avatarBytes=${avatar?.length ?? 0}`);
    const png = await renderAchievementCard(cached, records, playDay, avatar);
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
