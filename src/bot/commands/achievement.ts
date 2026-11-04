import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags, AttachmentBuilder, type RepliableInteraction } from "discord.js";
import { getDailyAchievementSummaries, getCachedProfile, getUserFriendCode, getTranslateTitles, getMaishiftLink, achievementProfileKeys } from "../../storage";
import { settleMaishiftRecords } from "../../maishift";
import { hasCarolSync } from "../utils/syncExtras";
import { koreaPlayDayKey, koreaPlayDayRange } from "../../achievements";
import { renderAchievementCard } from "../utils/achievementCard";
import { loadAvatar } from "../utils/embeds";
import { msg } from "../../messages";
import { notRegisteredNotice } from "../utils/notRegistered";
import { AP_REPEAT_KIND } from "../../apRepeat";

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

/** 성과 카드에 적는 플레이 시각(한국 시간 HH:mm). */
function kstTime(ms: number): string {
  return new Date(ms + 9 * 60 * 60 * 1000).toISOString().slice(11, 16);
}

function isPlayDayKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

const ACHIEVEMENT_PAGE_SIZE = 5;

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await show(interaction, (interaction.options.getUser("user") ?? interaction.user).id, interaction.options.getString("date") ?? "");
}

/** /성과 와 /사진관 버튼이 같이 쓴다. requestedDay 가 비면 오늘. */
export async function show(interaction: RepliableInteraction, targetId: string, requestedDay: string): Promise<void> {
  const target = { id: targetId };
  const userId = target.id;
  const targetScope = target.id === interaction.user.id ? "self" : "other";
  let replyDeferred = false;
  console.log(`[성과] 시작 scope=${targetScope} userSuffix=${userId.slice(-6)} requestedDay=${requestedDay || "today"}`);
  const friendCode = await getUserFriendCode(userId);
  let cached = friendCode ? await getCachedProfile(friendCode) : null;
  if (!cached) {
    console.log(`[성과] 프로필 없음 scope=${targetScope}`);
    const notice = await notRegisteredNotice(target.id, target.id === interaction.user.id);
    await interaction.reply({ content: notice, flags: MessageFlags.Ephemeral });
    return;
  }
  // 성과는 기록이 언제 얼마나 올랐는지라, 다른 사람에게는 maishift 에서 이전 기록을 공개한 경우에만 보인다.
  if (target.id !== interaction.user.id && cached.maishiftPastPublic === false) {
    await interaction.reply({ content: msg("achievement.pastPrivate", { user: `<@${target.id}>` }), flags: MessageFlags.Ephemeral });
    return;
  }

  try {
    // Discord 는 첫 응답까지 3초를 준다. getDailyAchievementSummaries 는 쿼리 +
    // 집계라 콜드 커넥션 풀에서 그 한계를 넘길 수 있어, 무거운 작업 전에 먼저 defer 한다.
    await interaction.deferReply();
    replyDeferred = true;
    // maishift 에 방금 올린 기록이 아직 성과로 반영되지 않았을 수 있다. 반영될 때까지(최대 몇 초) 기다린다.
    const link = await getMaishiftLink(userId);
    if (link) {
      await settleMaishiftRecords(link);
      cached = (friendCode ? await getCachedProfile(friendCode) : null) ?? cached;
    }
    // 캐롤봇 추가 북마클릿을 실행하지 않았으면 플레이 시각을 모른다(추가 북마클릿이 모은 DX NET 최근 플레이 기록에서만 온다)
    // — 대신 maishift 업로드 시각을 적는다. 레이팅 상승분은 maishift 전체 기록으로 계산하므로(src/ratingGain.ts) 그래도 보여 준다.
    const limited = !hasCarolSync(cached);
    const playDay = requestedDay && isPlayDayKey(requestedDay)
      ? requestedDay
      : koreaPlayDayKey(new Date());
    const { from, to } = koreaPlayDayRange(playDay);
    const summaries = await getDailyAchievementSummaries(userId, from, to, await achievementProfileKeys(userId));
    const records = summaries.map((e) => {
      // record_json에는 원본 스크래핑 당시의 PlayRecord(jacketUrl 포함)가 그대로 들어있다.
      let jacketUrl = "";
      try { jacketUrl = JSON.parse(e.recordJson)?.jacketUrl || ""; } catch { jacketUrl = ""; }
      // 캐롤봇 추가 북마클릿의 플레이 기록(최근 50판)에서 찾은 성과만 실제 플레이 시각을 안다. 못 찾은 것(sourcePlayId 가
      // "clear:…" — 추가 북마클릿을 실행하지 않은 사용자는 전부)은 playedAt 이 maishift 업로드 시각이라 업로드 시각으로 적는다.
      const date = String(e.sourcePlayId ?? "").startsWith("clear:")
        ? msg("achievement.uploadedAt", { time: kstTime(Number(e.playedAt)) })
        : kstTime(Number(e.playedAt));
      // 재AP(기록을 갱신하지 않은 AP)는 달성률이 오른 게 아니라 (+0.0000%) 를 붙이지 않는다.
      const repeatAp = e.sourceKind === AP_REPEAT_KIND;
      return { title:e.title, achievement:e.achievementAfter.toFixed(4)+"%", diff:e.diff, level:e.level, date, jacketUrl, musicKind:e.musicKind, achievementVal:Number(e.achievementAfter), track:0, fc:e.fc, sync:e.sync, ratingUp:e.ratingUp ?? undefined, playedAt:Number(e.playedAt), achievementGain:e.achievementGain, ratingGain:e.ratingGain, achievementBefore:repeatAp ? undefined : e.achievementBefore, achievementAfter:e.achievementAfter, levelConstant:e.levelConstant ?? undefined };
    });
    console.log(`[성과] 데이터 summaries=${summaries.length} records=${records.length}`);
    if (records.length === 0) {
      console.log(`[성과] 표시할 성과 없음 playDay=${playDay}`);
      await interaction.editReply({
        content: requestedDay
          ? `${playDay}에 의미 있는 성과가 없습니다.`
          : "오늘의 의미 있는 성과가 없습니다.",
      });
      return;
    }
    const avatar = await loadAvatar(userId, cached);
    const translate = await getTranslateTitles(interaction.user.id);
    const renderStartedAt = Date.now();
    // 한 장에 5개씩 여러 장으로 나눠 한 메시지에 같이 첨부한다 (인스타/X 공유 시 사진 여러 장으로 넘기기 좋게).
    // Discord 첨부 최대 개수(10)를 넘지 않도록 페이지 수를 제한한다.
    const totalPages = Math.min(10, Math.max(1, Math.ceil(records.length / ACHIEVEMENT_PAGE_SIZE)));
    console.log(`[성과] 렌더 시작 records=${records.length} pages=${totalPages} avatarBytes=${avatar?.length ?? 0}`);
    const pngs = await Promise.all(
      Array.from({ length: totalPages }, (_, pageIndex) =>
        renderAchievementCard(cached!, records, playDay, avatar, translate, pageIndex, ACHIEVEMENT_PAGE_SIZE, limited),
      ),
    );
    console.log(`[성과] 렌더 완료 pages=${pngs.length} elapsedMs=${Date.now() - renderStartedAt}`);
    await interaction.editReply({
      files: pngs.map((png, i) => new AttachmentBuilder(png, { name: `achievement-${playDay}-${i + 1}.png` })),
    });
    console.log(`[성과] 응답 완료 playDay=${playDay}`);
  } catch (e) {
    const errorMessage = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.error(`[성과] 실패 scope=${targetScope} userSuffix=${userId.slice(-6)} message=${errorMessage}`, e);
    try {
      if (replyDeferred) {
        await interaction.editReply({ content: msg("achievement.renderFailed") });
      } else {
        await interaction.reply({ content: msg("achievement.loadFailed"), flags: MessageFlags.Ephemeral });
      }
    } catch (replyError) {
      const replyMessage = replyError instanceof Error ? `${replyError.name}: ${replyError.message}` : String(replyError);
      console.error(`[성과] 실패 안내 응답도 실패 message=${replyMessage}`, replyError);
    }
  }
}
