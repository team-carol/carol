import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags, AttachmentBuilder } from "discord.js";
import { getCachedProfile, getUserFriendCode, getTranslateTitles, getMaishiftLink } from "../../storage";
import { getTopList, getClearList, loadAvatar } from "../utils/embeds";
import { renderRatingCard, type RatingType } from "../utils/ratingCard";
import { GAMES, isGameId } from "../../games";
import { msg } from "../../messages";
import { koreaPlayDayRange } from "../../achievements";
import { getMaishiftSnapshot, getMaishiftFuture } from "../../maishift";
import { versionName } from "../../maishift/catalog";
import { kstStamp } from "../utils/cardKit";
import { notRegisteredNotice } from "../utils/notRegistered";

export const data = new SlashCommandBuilder()
  .setName("레이팅표")
  .setDescription("레이팅 대상곡을 이미지로 표시 (생략 시 본인)")
  .addUserOption((opt) =>
    opt.setName("user").setDescription("조회할 유저 (생략 시 본인)").setRequired(false),
  )
  .addStringOption((opt) =>
    opt
      .setName("type")
      .setDescription("레이팅 종류: S-레이팅, 미래시, 다른 리듬게임 환산 (생략 시 maimai DX)")
      .setRequired(false)
      .addChoices(
        { name: GAMES.maimai.label, value: "maimai" },
        { name: "S-레이팅", value: "srating" },
        { name: "미래시", value: "future" },
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

const dayOf = (ms: number) => kstStamp(ms).slice(0, 10);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser("user") ?? interaction.user;
  const self = target.id === interaction.user.id;
  const typeOpt = interaction.options.getString("type") ?? "maimai";
  // 미래시는 maimai DX 레이팅표를 다음 버전 기준으로 다시 계산한 것이다.
  const future = typeOpt === "future";
  const type: RatingType = typeOpt === "srating" || isGameId(typeOpt) ? typeOpt : "maimai";
  const dateOpt = (interaction.options.getString("date") ?? "").trim();
  const userId = target.id;
  if (dateOpt && !isPlayDayKey(dateOpt)) {
    await interaction.reply({ content: msg("ratingImage.snapshotBadDate"), flags: MessageFlags.Ephemeral });
    return;
  }
  if (dateOpt && future) {
    await interaction.reply({ content: msg("ratingImage.futureWithDate"), flags: MessageFlags.Ephemeral });
    return;
  }
  // 과거 날짜는 maishift 이전 기록(그 시점 레이팅 대상·S-레이팅 대상)만 주므로, 전체 기록이 필요한 다른 게임 환산은 안 된다.
  if (dateOpt && type !== "maimai" && type !== "srating") {
    await interaction.reply({ content: msg("ratingImage.snapshotGameUnsupported"), flags: MessageFlags.Ephemeral });
    return;
  }
  const friendCode = await getUserFriendCode(userId);
  const cached = friendCode ? await getCachedProfile(friendCode) : null;
  if (!cached) {
    const text = await notRegisteredNotice(target.id, self);
    await interaction.reply({ content: text, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply();
  let profile = cached;
  let records = getTopList(cached);
  let notice: string | undefined;
  if (dateOpt) {
    // 과거 날짜: 그날(오전 4시 기준 하루)이 끝나기 전 마지막 maishift 업로드의 레이팅표.
    const link = await getMaishiftLink(userId);
    const result = link ? await getMaishiftSnapshot(link, koreaPlayDayRange(dateOpt).to).catch((e) => {
      console.error("[레이팅이미지] maishift 이전 기록:", e);
      return null;
    }) : null;
    if (!result) {
      await interaction.editReply({ content: msg("ratingImage.snapshotFailed") });
      return;
    }
    if (result.kind === "private") {
      await interaction.editReply({ content: self ? msg("ratingImage.pastPrivateSelf") : msg("ratingImage.pastPrivate", { user: `<@${target.id}>` }) });
      return;
    }
    if (result.kind === "none") {
      await interaction.editReply({
        content: result.first !== null && result.last !== null
          ? msg("ratingImage.snapshotMissing", { date: dateOpt, first: dayOf(result.first), last: dayOf(result.last) })
          : msg("ratingImage.snapshotNone"),
      });
      return;
    }
    const snap = result.snapshot;
    records = snap.top;
    // 스냅샷 기록은 마크·ST/DX 가 이미 들어 있어 clearJson 자리에 넣으면 렌더 쪽 markMap/kindResolver 가 그날 상태를 본다.
    // S-레이팅은 clearJson 에서 다시 고르므로 S-레이팅 대상도 함께 넣는다.
    profile = {
      ...cached,
      playerName: snap.name,
      trophy: snap.trophy,
      trophyClass: snap.trophyClass,
      rating: snap.rating,
      clearJson: JSON.stringify(type === "srating" ? snap.sTop : snap.top),
      lastSyncedAt: snap.uploadedAt,
    };
    notice = msg("ratingImage.snapshotNotice", { date: dateOpt, uploaded: kstStamp(snap.uploadedAt) });
  } else if (future) {
    const link = await getMaishiftLink(userId);
    const result = link ? await getMaishiftFuture(link).catch((e) => {
      console.error("[레이팅이미지] maishift 미래시:", e);
      return undefined;
    }) : undefined;
    if (result === undefined) {
      await interaction.editReply({ content: msg("ratingImage.futureFailed") });
      return;
    }
    if (result === null) {
      await interaction.editReply({ content: msg("ratingImage.futureNone") });
      return;
    }
    records = result.top;
    // 헤더 레이팅은 profile.rating 을 쓰므로 미래시 레이팅으로 바꾼다.
    profile = { ...cached, rating: result.rating };
    notice = msg("ratingImage.futureNotice", { version: versionName(result.versionId), rating: cached.rating });
  }
  // 치환 모드·S-레이팅은 레이팅 대상 50곡이 아니라 전체 기록에서 다시 뽑으므로
  // 레이팅 대상이 비어 있어도 clear 기록만 있으면 그릴 수 있다. S-레이팅은 DX 점수가 있는 기록이 있어야 한다.
  const hasSource = type === "srating"
    ? getClearList(profile).some((r) => (r.dxScoreMax ?? 0) > 0)
    : records.length > 0 || (type !== "maimai" && getClearList(profile).length > 0);
  if (!hasSource) {
    await interaction.editReply({ content: msg(type === "srating" ? "ratingImage.sRatingNoData" : "ratingImage.noRecords") });
    return;
  }
  try {
    const png = await renderRatingCard(
      profile,
      records,
      await loadAvatar(userId, profile),
      await getTranslateTitles(interaction.user.id),
      type,
      !dateOpt && !future,
      // JP 레이팅표는 곡 버전으로 신곡/구곡을 나누므로, 과거 날짜는 그날의 신곡 범위로.
      dateOpt || undefined,
    );
    await interaction.editReply({
      content: notice,
      files: [new AttachmentBuilder(png, { name: dateOpt ? `rating-${type}-${dateOpt}.png` : future ? "rating-future.png" : `rating-${type}.png` })],
    });
  } catch (e) {
    console.error("[레이팅이미지]", e);
    await interaction.editReply({ content: msg("ratingImage.renderFailed") }).catch(() => {});
  }
}
