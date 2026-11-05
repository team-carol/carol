import {
  SlashCommandBuilder, ChatInputCommandInteraction, AutocompleteInteraction, MessageFlags, AttachmentBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  type RepliableInteraction, type ButtonInteraction, type StringSelectMenuInteraction,
} from "discord.js";
import { getCachedProfile, getUserFriendCode, getTranslateTitles } from "../../storage";
import { getClearList, loadAvatar } from "../utils/embeds";
import { notRegisteredNotice } from "../utils/notRegistered";
import { renderPlateOverview, renderPlateDetail, plateVersionLabel } from "../utils/plateCard";
import { getRegionCharts, regionLatestVersion } from "../../constants";
import { plateDefs, findPlate, plateProgress, recordMap, heldPlates, defaultPlateType, PLATE_TYPES, type PlateType, type PlateDef } from "../../plates";
import { ratingBandOf, getPlateDifficulty, getPlateStats, type PlateDifficulty, type PlateEstimate } from "../../maishift/stats";
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

type PlatePayload = { files: AttachmentBuilder[]; components: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] } | { content: string };

/**
 * 이미지 아래 전환 메뉴: 버전 선택 메뉴 하나, 상세면 종류 버튼과 전체 보기 버튼.
 * 선택 메뉴는 25개까지인데 플레이트가 그보다 많아(국제판 26, 내수판 27) 옛 버전(真~舞)과 DX 버전(熊~)을 한 번에 한쪽씩 보여 주고,
 * 맨 아래 항목으로 다른 쪽 목록으로 넘어간다.
 * customId — 버전 plate:v:<누른 사람>:<대상>:<목록 o|d>:<지금 한자|->:<지금 종류|->, 종류 plate:t:<누른 사람>:<대상>:<한자>:<종류>,
 *            전체 plate:o:<누른 사람>:<대상>.
 */
const ERA_TOGGLE = "era";
const isOldPlate = (d: PlateDef) => d.versions[d.versions.length - 1] <= 12;

function switchRows(viewerId: string, targetId: string, defs: PlateDef[], current: PlateDef | null, type: PlateType | null, era?: "o" | "d"): ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] {
  const shown = era ?? (current && isOldPlate(current) ? "o" : "d");
  // 최신 플레이트부터
  const list = defs.filter((d) => isOldPlate(d) === (shown === "o")).reverse();
  const rows: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] = [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`plate:v:${viewerId}:${targetId}:${shown}:${current?.prefix ?? "-"}:${type ?? "-"}`)
        .setPlaceholder(msg("plate.selectPlaceholder"))
        .addOptions(
          ...list.slice(0, 24).map((d) => ({ label: `${d.prefix}  ${plateVersionLabel(d)}`.slice(0, 100), value: d.prefix, default: d === current })),
          { label: shown === "o" ? msg("plate.showDx") : msg("plate.showOld"), value: ERA_TOGGLE },
        ),
    ),
  ];
  if (current) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
      ...current.types.map((t) => new ButtonBuilder()
        .setCustomId(`plate:t:${viewerId}:${targetId}:${current.prefix}:${t}`)
        .setLabel(t)
        .setStyle(t === type ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(t === type)),
      new ButtonBuilder().setCustomId(`plate:o:${viewerId}:${targetId}`).setLabel(msg("plate.overviewButton")).setStyle(ButtonStyle.Secondary),
    ));
  }
  return rows;
}

/** 플레이트 이미지(전체 또는 한 버전)와 전환 메뉴. viewerId: 보는 사람(번역 설정·메뉴 주인). */
async function platePayload(targetId: string, viewerId: string, prefix: string | null, type: PlateType | null, era?: "o" | "d"): Promise<PlatePayload> {
  const self = targetId === viewerId;
  const friendCode = await getUserFriendCode(targetId);
  const cached = friendCode ? await getCachedProfile(friendCode) : null;
  if (!cached) return { content: await notRegisteredNotice(targetId, self) };
  const charts = getRegionCharts(cached.server);
  const defs = plateDefs(regionLatestVersion(cached.server), cached.server);
  if (!charts.length || !defs.length) return { content: msg("plate.noCatalog") };
  const records = recordMap(getClearList(cached));
  const [avatarBuf, translate] = await Promise.all([loadAvatar(targetId, cached), getTranslateTitles(viewerId)]);
  if (!prefix) {
    const list = defs.map((d) => plateProgress(d, charts, records));
    const png = await renderPlateOverview(cached, avatarBuf, list, heldPlates(list));
    return { files: [new AttachmentBuilder(png, { name: "plate.png" })], components: switchRows(viewerId, targetId, defs, null, null, era) };
  }
  // 한자 대신 버전 이름을 그대로 입력했으면 이름으로 찾는다.
  const def = findPlate(defs, prefix) ?? defs.find((d) => normalizeQuery(plateVersionLabel(d)).includes(normalizeQuery(prefix))) ?? null;
  if (!def) return { content: msg("plate.unknownVersion", { version: prefix }) };
  const progress = plateProgress(def, charts, records);
  const shownType = type && def.types.includes(type) ? type : defaultPlateType(progress);
  // 같은 레이팅대 플레이트 난이도(30단위)·처음 얻은 레이팅(6단위)은 모두에게 같은 통계라 기억해 두고 쓴다. 없으면 빼고 그린다.
  // 이름표 그림은 처음 볼 때만 LXNS 에서 받고 그 뒤로는 DB 에서 꺼낸다(src/plateImages.ts). 못 받으면 글자로 그린다.
  const band = ratingBandOf(cached.rating || 0);
  const [difficulty, plateStats, images] = await Promise.all([
    band ? getPlateDifficulty(cached.server, band).catch(() => null) : Promise.resolve(null),
    getPlateStats(cached.server).catch(() => null),
    getPlateImages(def.prefix, def.types).catch(() => ({})),
  ]);
  const est: PlateDifficulty | undefined = difficulty?.get(def.prefix);
  // maishift 플레이트 난이도(0~10). 실제 필요한 플레이 수가 아니라 상수 11.0 이상 보면의 (1/달성 비율 − 1) 합을 log₂ 로 줄인 지표다.
  const difficultyOf: Partial<Record<PlateType, PlateEstimate>> = {};
  for (const t of def.types) {
    const k = DIFFICULTY_KEY[t];
    const e = k && est ? est[k] : null;
    if (e) difficultyOf[t] = e;
  }
  // 처음 얻은 날 그날 최고 레이팅 이론값과의 차이(중앙값). 지금 내 차이(지금 최고 이론값 − 내 레이팅)와 견준다.
  const firstGap: Partial<Record<PlateType, number>> = {};
  if (plateStats) {
    for (const g of plateStats.firstGaps) {
      if (g.version === def.statVersion && g.percentiles && !g.suppressed) firstGap[g.type as PlateType] = Math.round(g.percentiles.p50);
    }
  }
  const png = await renderPlateDetail(cached, avatarBuf, progress, shownType, {
    difficulty: difficultyOf,
    band: band && Object.values(difficultyOf).some((v) => v && (v.value !== null || v.unreachable)) ? band.split("-").map((n) => Number(n).toLocaleString("en-US")).join("~") : null,
    firstGap,
    myGap: plateStats && cached.rating ? Math.max(0, plateStats.maxRating - cached.rating) : null,
    maishiftTotal: est?.charts ?? null,
    images,
    translate,
  });
  return { files: [new AttachmentBuilder(png, { name: "plate.png" })], components: switchRows(viewerId, targetId, defs, def, shownType, era) };
}

export async function show(interaction: RepliableInteraction, targetId: string, prefix: string | null, type: PlateType | null): Promise<void> {
  if (type && !prefix) {
    await interaction.reply({ content: msg("plate.typeNeedsVersion"), flags: MessageFlags.Ephemeral });
    return;
  }
  // 연동하지 않은 사람이면 안내는 본인에게만.
  if (!(await getUserFriendCode(targetId))) {
    await interaction.reply({ content: await notRegisteredNotice(targetId, targetId === interaction.user.id), flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply();
  try {
    await interaction.editReply(await platePayload(targetId, interaction.user.id, prefix, type));
  } catch (e) {
    console.error("[plate]", e);
    await interaction.editReply({ content: msg("plate.failed") }).catch(() => {});
  }
}

/**
 * 전환 메뉴(plate:). 메뉴 주인이면 그 메시지를 바꾸고, 다른 사람이면 그 사람에게만 새로 보여 준다(남의 결과를 바꾸지 않게).
 */
export async function handleComponent(i: ButtonInteraction | StringSelectMenuInteraction): Promise<void> {
  const [, action = "", viewerId = "", targetId = "", a = "", b = "", c = ""] = i.customId.split(":");
  const asType = (v: string) => ((PLATE_TYPES as string[]).includes(v) ? v as PlateType : null);
  let prefix: string | null = null;
  let type: PlateType | null = null;
  let era: "o" | "d" | undefined;
  if (action === "v" && i.isStringSelectMenu()) {
    const value = i.values[0] ?? "";
    if (value === ERA_TOGGLE) {
      // 목록만 넘긴다(이미지는 그대로): 지금 보던 플레이트·종류를 유지하고 다른 쪽 목록을 보여 준다.
      era = a === "o" ? "d" : "o";
      prefix = b === "-" ? null : b;
      type = asType(c);
      if (i.user.id === viewerId) {
        const defs = await defsFor(targetId);
        const current = prefix ? defs.find((d) => d.prefix === prefix) ?? null : null;
        await i.update({ components: switchRows(viewerId, targetId, defs, current, type, era) });
        return;
      }
    } else prefix = value;
  } else if (action === "t") { prefix = a; type = asType(b); }
  else if (action !== "o") return;
  const own = i.user.id === viewerId;
  if (own) await i.deferUpdate();
  else await i.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const payload = await platePayload(targetId, i.user.id, prefix, type, era);
    if ("content" in payload) {
      await i.followUp({ content: payload.content, flags: MessageFlags.Ephemeral });
      return;
    }
    await i.editReply({ ...payload, attachments: [] });
  } catch (e) {
    console.error("[plate-switch]", e);
    await i.followUp({ content: msg("plate.failed"), flags: MessageFlags.Ephemeral }).catch(() => {});
  }
}

/** 대상 지역의 플레이트 목록(목록 넘김에 쓴다). */
async function defsFor(targetId: string): Promise<PlateDef[]> {
  const fc = await getUserFriendCode(targetId);
  const cached = fc ? await getCachedProfile(fc) : null;
  const server = cached?.server ?? "intl";
  return plateDefs(regionLatestVersion(server), server);
}
