import { SlashCommandBuilder, ChatInputCommandInteraction, AutocompleteInteraction, MessageFlags, AttachmentBuilder, type RepliableInteraction } from "discord.js";
import { getCachedProfile, getUserFriendCode, getTranslateTitles } from "../../storage";
import { getClearList, loadAvatar } from "../utils/embeds";
import { notRegisteredNotice } from "../utils/notRegistered";
import { renderPlateOverview, renderPlateDetail, plateVersionLabel } from "../utils/plateCard";
import { getRegionCharts, regionLatestVersion } from "../../constants";
import { plateDefs, findPlate, plateProgress, recordMap, heldPlates, defaultPlateType, PLATE_TYPES, type PlateType } from "../../plates";
import { ratingBandOf, getPlateDifficulty, getPlateStats, expectedPlays, type PlateDifficulty } from "../../maishift/stats";
import { getPlateImages } from "../../plateImages";
import { normalizeQuery } from "../../aliases";
import { msg } from "../../messages";

// /플레이트: 버전 플레이트(極·将·神·舞舞·覇者) 진행도. 버전을 고르면 그 플레이트의 남은 보면까지.
export const data = new SlashCommandBuilder()
  .setName("플레이트")
  .setDescription("버전 플레이트(極·将·神·舞舞·覇者) 진행도")
  .addUserOption((opt) => opt.setName("user").setDescription("조회할 유저 (생략 시 본인)").setRequired(false))
  .addStringOption((opt) => opt.setName("버전").setDescription("고르면 그 플레이트의 남은 보면까지 (예: 祭, FESTiVAL)").setRequired(false).setAutocomplete(true))
  .addStringOption((opt) => opt.setName("종류").setDescription("버전을 고를 때 남은 보면을 볼 종류 (기본: 남은 보면이 가장 적은 종류)").setRequired(false)
    .addChoices(...PLATE_TYPES.map((t) => ({ name: t, value: t }))));

/** 자동완성은 대상 유저의 지역을 아직 모르므로 두 지역 중 더 앞선 쪽까지 보여 준다. */
function allDefs() {
  const latest = Math.max(regionLatestVersion("intl") ?? 0, regionLatestVersion("jp") ?? 0) || null;
  return plateDefs(latest);
}

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const q = normalizeQuery(interaction.options.getFocused());
  const defs = allDefs();
  const hits = defs
    .map((d) => ({ d, label: `${d.prefix}  ${plateVersionLabel(d)}` }))
    .filter(({ d, label }) => !q || d.prefix === q || normalizeQuery(label).includes(q))
    // 최근 버전부터
    .reverse()
    .slice(0, 25);
  await interaction.respond(hits.map(({ d, label }) => ({ name: label.slice(0, 100), value: d.prefix })));
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const prefix = interaction.options.getString("버전")?.trim() || null;
  const type = interaction.options.getString("종류") as PlateType | null;
  await show(interaction, (interaction.options.getUser("user") ?? interaction.user).id, prefix, type && PLATE_TYPES.includes(type) ? type : null);
}

/** 플레이트 종류 → stats/plate-difficulty 의 키. 覇者 는 추정이 없다. */
const DIFFICULTY_KEY: Partial<Record<PlateType, "fc" | "sss" | "ap" | "fsd">> = { 極: "fc", 将: "sss", 神: "ap", 舞舞: "fsd" };

export async function show(interaction: RepliableInteraction, targetId: string, prefix: string | null, type: PlateType | null): Promise<void> {
  const self = targetId === interaction.user.id;
  const friendCode = await getUserFriendCode(targetId);
  if (!friendCode) {
    await interaction.reply({ content: await notRegisteredNotice(targetId, self), flags: MessageFlags.Ephemeral });
    return;
  }
  if (type && !prefix) {
    await interaction.reply({ content: msg("plate.typeNeedsVersion"), flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply();
  const cached = await getCachedProfile(friendCode);
  if (!cached) {
    await interaction.editReply({ content: await notRegisteredNotice(targetId, self) });
    return;
  }
  const charts = getRegionCharts(cached.server);
  const defs = plateDefs(regionLatestVersion(cached.server));
  if (!charts.length || !defs.length) {
    await interaction.editReply({ content: msg("plate.noCatalog") });
    return;
  }
  const records = recordMap(getClearList(cached));
  try {
    const [avatarBuf, translate] = await Promise.all([loadAvatar(targetId, cached), getTranslateTitles(interaction.user.id)]);
    if (!prefix) {
      const list = defs.map((d) => plateProgress(d, charts, records));
      const png = await renderPlateOverview(cached, avatarBuf, list, heldPlates(list));
      await interaction.editReply({ files: [new AttachmentBuilder(png, { name: "plate.png" })] });
      return;
    }
    // 한자 대신 버전 이름을 그대로 입력했으면 이름으로 찾는다.
    const def = findPlate(defs, prefix) ?? defs.find((d) => normalizeQuery(plateVersionLabel(d)).includes(normalizeQuery(prefix))) ?? null;
    if (!def) {
      await interaction.editReply({ content: msg("plate.unknownVersion", { version: prefix }) });
      return;
    }
    const progress = plateProgress(def, charts, records);
    const shownType = type && def.types.includes(type) ? type : defaultPlateType(progress);
    // 같은 레이팅대 예상 플레이 수(30단위)·처음 얻은 레이팅(6단위)은 모두에게 같은 통계라 기억해 두고 쓴다. 없으면 빼고 그린다.
    // 이름표 그림은 처음 볼 때만 LXNS 에서 받고 그 뒤로는 DB 에서 꺼낸다(src/plateImages.ts). 못 받으면 글자로 그린다.
    const band = ratingBandOf(cached.rating || 0);
    const [difficulty, plateStats, images] = await Promise.all([
      band ? getPlateDifficulty(cached.server, band).catch(() => null) : Promise.resolve(null),
      getPlateStats(cached.server).catch(() => null),
      getPlateImages(def.prefix, def.types).catch(() => ({})),
    ]);
    const est: PlateDifficulty | undefined = difficulty?.get(def.prefix);
    const plays: Partial<Record<PlateType, number | null>> = {};
    for (const t of def.types) {
      const k = DIFFICULTY_KEY[t];
      if (k && est) plays[t] = expectedPlays(est[k]);
    }
    const firstRating: Partial<Record<PlateType, number>> = {};
    if (plateStats) {
      for (const g of plateStats.firstGaps) {
        if (g.version === def.statVersion && g.percentiles && !g.suppressed) firstRating[g.type as PlateType] = plateStats.maxRating - Math.round(g.percentiles.p50);
      }
    }
    const png = await renderPlateDetail(cached, avatarBuf, progress, shownType, {
      plays,
      band: band && Object.values(plays).some((v) => v) ? band.split("-").map((n) => Number(n).toLocaleString("en-US")).join("~") : null,
      firstRating,
      maishiftTotal: est?.charts ?? null,
      images,
      translate,
    });
    await interaction.editReply({ files: [new AttachmentBuilder(png, { name: "plate.png" })] });
  } catch (e) {
    console.error("[plate]", e);
    await interaction.editReply({ content: msg("plate.failed") }).catch(() => {});
  }
}
