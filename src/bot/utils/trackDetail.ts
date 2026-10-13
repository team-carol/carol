// /검색 "N번 상세" 버튼 → 곡 상세 카드(trackCard.ts). 곡의 보면(난이도)마다 maishift 정보를 받아 그린다.
// customId: trk:<검색 토큰>:<곡 순서>            — 새 메시지로 상세 카드(기본 난이도: 내가 플레이한 가장 높은 난이도)
//           trkd:<검색 토큰>:<곡 순서>:<난이도 번호> — 상세 카드 메시지에서 난이도 바꾸기
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, type ButtonInteraction } from "discord.js";
import { getCachedProfile, getMaishiftLink, getTranslateTitles, loadUserSession } from "../../storage";
import { getSearchCtx, getClearList } from "./embeds";
import { fetchJacketDataUrl } from "./ratingCard";
import { renderTrackCard } from "./trackCard";
import { getConstant, getJacketFile, getSongArtist, getSongVersion, getTrackId } from "../../constants";
import { versionIndex, versionName } from "../../maishift/catalog";
import { getTrackInfo, getTrackScores } from "../../maishift/track";
import { displayTitle } from "../../aliases";
import { msg } from "../../messages";

const DIFFS = ["BASIC", "ADVANCED", "EXPERT", "MASTER", "Re:MASTER"];
const EPHEMERAL = { flags: 64 } as const;

export async function handleTrackButton(i: ButtonInteraction): Promise<void> {
  const [kind, token, groupRaw, diffRaw] = i.customId.split(":");
  const switching = kind === "trkd";
  const ctx = getSearchCtx(token);
  const group = ctx?.groups?.[parseInt(groupRaw ?? "", 10)];
  if (!ctx || !group) {
    await i.reply({ content: msg("trackDetail.expired"), ...EPHEMERAL });
    return;
  }
  if (switching) await i.deferUpdate();
  else await i.deferReply();
  const fail = (content: string) => (switching ? i.followUp({ content, ...EPHEMERAL }) : i.editReply({ content }));
  try {
    const session = await loadUserSession(ctx.userId);
    const cached = session ? await getCachedProfile(session.friendCode) : null;
    if (!cached) { await fail(msg("button.needProfile")); return; }
    const { title, musicKind } = group;
    const records = getClearList(cached).filter((r) => r.title === title && (r.musicKind || "") === musicKind);
    // 이 곡에 있는 난이도: 카탈로그에 상수가 있거나 내 기록이 있는 것.
    const diffs = DIFFS.filter((d) => getConstant(title, musicKind, d, cached.server, true) !== null || records.some((r) => r.diff === d));
    const played = [...diffs].reverse().find((d) => records.some((r) => r.diff === d && r.achievementVal > 0));
    const diff = switching ? DIFFS[parseInt(diffRaw ?? "", 10)] : played ?? (diffs.includes("MASTER") ? "MASTER" : diffs[diffs.length - 1]);
    const trackId = diff ? getTrackId(title, musicKind, diff) : null;
    if (!diff || trackId === null) { await fail(msg("trackDetail.noTrack")); return; }

    const record = records.find((r) => r.diff === diff) ?? null;
    const link = await getMaishiftLink(ctx.userId);
    const [info, scores, translate, jacket] = await Promise.all([
      getTrackInfo(trackId),
      link ? getTrackScores(trackId, link.handle) : Promise.resolve(null),
      getTranslateTitles(i.user.id),
      (async () => { const f = getJacketFile(title); return f ? fetchJacketDataUrl(f) : null; })(),
    ]);
    const code = getSongVersion(title);
    const png = await renderTrackCard({
      title: displayTitle(title, translate),
      artist: getSongArtist(title),
      kind: musicKind === "DX" ? "DX" : "ST",
      diff,
      constant: record?.constant ?? getConstant(title, musicKind, diff, cached.server, true),
      constantEstimated: !!record?.constantEstimated,
      songVersion: record?.songVersion ?? (code !== null ? versionIndex(code) : null),
      versionName,
      jacketUrl: jacket,
      record: record ? { achievement: record.achievementVal, dxScore: record.dxScore, dxMax: record.dxScoreMax, fc: record.fc, sync: record.sync } : null,
      scores,
      info,
      playerName: cached.playerName,
      playerRating: cached.rating,
    });
    // 난이도 바꾸기 버튼(지금 보는 난이도는 강조).
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(diffs.map((d) =>
      new ButtonBuilder()
        .setCustomId(`trkd:${token}:${groupRaw}:${DIFFS.indexOf(d)}`)
        .setLabel(d)
        .setStyle(d === diff ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(d === diff),
    ));
    await i.editReply({ content: "", files: [new AttachmentBuilder(png, { name: "track.png" })], components: [row], attachments: [] });
  } catch (e) {
    console.error("[track-detail]", e);
    await fail(msg("trackDetail.failed")).catch(() => {});
  }
}
