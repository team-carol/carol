import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags, AttachmentBuilder } from "discord.js";
import { getCachedProfile, getUserFriendCode, getProfilePrivate, getTranslateTitles, getRatingSnapshot, getRatingSnapshotRange, getAchievementPlayEventLog, getAchievementLogRange } from "../../storage";
import { getTopList, getClearList, loadAvatar } from "../utils/embeds";
import { renderRatingCard, type RatingType } from "../utils/ratingCard";
import { GAMES, isGameId } from "../../games";
import { msg } from "../../messages";
import type { PlayRecord } from "../../scraper";
import { koreaPlayDayRange, koreaPlayDayKey } from "../../achievements";
import { computeRatingTarget } from "../../constants";
import { rewindClearRecords } from "../../ratingRewind";

export const data = new SlashCommandBuilder()
  .setName("레이팅표")
  .setDescription("레이팅 대상곡을 이미지로 표시 (생략 시 본인)")
  .addUserOption((opt) =>
    opt.setName("user").setDescription("조회할 유저 (생략 시 본인)").setRequired(false),
  )
  .addStringOption((opt) =>
    opt
      .setName("type")
      .setDescription("레이팅 종류: S-레이팅, 다른 리듬게임 환산 (생략 시 maimai DX)")
      .setRequired(false)
      .addChoices(
        { name: GAMES.maimai.label, value: "maimai" },
        { name: "S-레이팅", value: "srating" },
        ...Object.values(GAMES).filter((g) => g.id !== "maimai").map((g) => ({ name: g.label, value: g.id })),
      ),
  )
  .addStringOption((opt) =>
    opt
      .setName("date")
      .setDescription("과거 날짜의 레이팅표 (YYYY-MM-DD, 생략 시 최신)")
      .setRequired(false),
  );

function isPlayDayKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser("user") ?? interaction.user;
  const typeOpt = interaction.options.getString("type") ?? "maimai";
  const type: RatingType = typeOpt === "srating" || isGameId(typeOpt) ? typeOpt : "maimai";
  const dateOpt = (interaction.options.getString("date") ?? "").trim();
  const userId = target.id;
  if (target.id !== interaction.user.id && await getProfilePrivate(target.id)) {
    await interaction.reply({ content: msg("common.profilePrivate", { user: `<@${target.id}>` }), flags: MessageFlags.Ephemeral });
    return;
  }
  const friendCode = await getUserFriendCode(userId);
  const cached = friendCode ? await getCachedProfile(friendCode) : null;
  if (!cached) {
    const text = target.id === interaction.user.id
      ? msg("common.selfNotRegistered")
      : msg("common.otherNotRegistered", { user: `<@${target.id}>` });
    await interaction.reply({ content: text, flags: MessageFlags.Ephemeral });
    return;
  }
  // 과거 날짜: 하루치 스냅샷(레이팅 대상 50곡 + 총합 레이팅)으로 대체한다.
  // 스냅샷은 50곡만 보관하므로 전체 기록이 필요한 타 게임 환산은 지원하지 않는다.
  let snapshotDay = "";
  let rewindDay = "";
  let deferred = false;
  let profile = cached;
  let records = getTopList(cached);
  if (dateOpt) {
    if (!isPlayDayKey(dateOpt)) {
      await interaction.reply({ content: msg("ratingImage.snapshotBadDate"), flags: MessageFlags.Ephemeral });
      return;
    }
    if (type !== "maimai") {
      await interaction.reply({ content: msg("ratingImage.snapshotGameUnsupported"), flags: MessageFlags.Ephemeral });
      return;
    }
    const snap = await getRatingSnapshot(cached.profileKey, dateOpt);
    if (snap) {
      let snapRecords: PlayRecord[] = [];
      try {
        const parsed = JSON.parse(snap.topJson);
        if (Array.isArray(parsed)) snapRecords = parsed;
      } catch { /* ignore */ }
      snapshotDay = snap.playDay;
      records = snapRecords;
      // 스냅샷 레코드는 마크·ST/DX 보정이 끝난 상태라, clearJson 자리에 그대로 넣으면
      // 렌더 쪽 markMap/kindResolver 가 현재 프로필 대신 그날 상태를 본다.
      profile = { ...cached, rating: snap.rating, clearJson: snap.topJson, lastSyncedAt: snap.syncedAt };
    } else {
      // 스냅샷 도입 이전 날짜. 성과 이벤트 로그로 현재 클리어 기록을 되돌려 추정한다.
      const logRange = await getAchievementLogRange(cached.profileKey);
      const clearNow = getClearList(cached);
      if (!logRange || clearNow.length === 0) {
        const range = await getRatingSnapshotRange(cached.profileKey);
        const notice = range
          ? msg("ratingImage.snapshotMissing", { date: dateOpt, first: range.first, last: range.last })
          : msg("ratingImage.rewindNoData", { date: dateOpt });
        await interaction.reply({ content: notice, flags: MessageFlags.Ephemeral });
        return;
      }
      const { to: cutoff } = koreaPlayDayRange(dateOpt);
      const firstDay = koreaPlayDayKey(new Date(logRange.first));
      if (cutoff <= logRange.first) {
        await interaction.reply({
          content: msg("ratingImage.rewindTooOld", { date: dateOpt, first: firstDay }),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await interaction.deferReply();
      deferred = true;
      const laterEvents = await getAchievementPlayEventLog(cached.profileKey, cutoff);
      const { records: rewound } = rewindClearRecords(clearNow, laterEvents);
      // 신곡/구곡 판정은 그날의 버전 기준으로 (예: 2026-07-23 CiRCLE PLUS 업데이트 이전은
      // PRiSM PLUS ~ CiRCLE 이 신곡).
      records = computeRatingTarget(rewound, cached.server, dateOpt);
      rewindDay = dateOpt;
      // rating 0 → 카드 헤더가 표시 중인 50곡의 곡 레이팅 합계를 쓴다(= 역산된 총합).
      profile = { ...cached, rating: 0, clearJson: JSON.stringify(rewound) };
    }
  }
  // 치환 모드·S-레이팅은 레이팅 대상 50곡이 아니라 전체 기록에서 다시 뽑으므로
  // 레이팅 대상이 비어 있어도 clear 기록만 있으면 그릴 수 있다. S-레이팅은 DX 점수가 있는 기록이 있어야 한다.
  const hasSource = type === "srating"
    ? [...getClearList(profile), ...records].some((r) => (r.dxScoreMax ?? 0) > 0)
    : records.length > 0 || (type !== "maimai" && getClearList(profile).length > 0);
  if (!hasSource) {
    const notice = msg(type === "srating" ? "ratingImage.sRatingNoData" : "ratingImage.noRecords");
    // 역산 경로는 이미 defer 된 상태라 reply 를 다시 쓸 수 없다.
    if (deferred) await interaction.editReply({ content: notice });
    else await interaction.reply({ content: notice, flags: MessageFlags.Ephemeral });
    return;
  }
  if (!deferred) await interaction.deferReply();
  try {
    const png = await renderRatingCard(
      profile,
      records,
      await loadAvatar(userId, profile),
      await getTranslateTitles(interaction.user.id),
      type,
      !snapshotDay && !rewindDay,
      rewindDay || undefined,
    );
    await interaction.editReply({
      content: rewindDay
        ? msg("ratingImage.rewindNotice", { date: rewindDay })
        : !snapshotDay
          ? undefined
          : snapshotDay === dateOpt
            ? msg("ratingImage.snapshotNotice", { date: snapshotDay })
            : msg("ratingImage.snapshotNoticeFallback", { actual: snapshotDay, date: dateOpt }),
      files: [new AttachmentBuilder(png, { name: dateOpt ? `rating-${dateOpt}.png` : `rating-${type}.png` })],
    });
  } catch (e) {
    console.error("[레이팅이미지]", e);
    await interaction.editReply({ content: msg("ratingImage.renderFailed") }).catch(() => {});
  }
}
