import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ButtonInteraction,
  EmbedBuilder,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  ModalBuilder,
  LabelBuilder,
  TextInputBuilder,
  TextInputStyle,
  type StringSelectMenuInteraction,
  type ModalSubmitInteraction,
  type Client,
} from "discord.js";
import {
  getCachedProfile,
  getUserFriendCode,
  listGoals,
  countGoals,
  addGoal,
  deleteGoal,
} from "../../storage";
import {
  evaluateGoal,
  describeGoal,
  progressBar,
  progressPercent,
  parseLevelRange,
  DIFFICULTIES,
  type GoalSpec,
  type ChartCriterion,
} from "../../goals";
import { getAllSongTitles } from "../../constants";
import { normalizeQuery, aliasMatches } from "../../aliases";
import { msg } from "../../messages";

// /목표: 목록(진행도)을 보여 주고, 그 아래 추가·삭제 버튼으로 관리한다(예전 /목표 추가·목록·삭제 를 하나로).
// - 추가: 목록의 유형별 추가 버튼이 바로 입력 창(곡명·숫자 칸과 난이도·타입·기준 선택 메뉴를 한 창에)을 연다.
// - 삭제: 본인에게만 보이는 메뉴에서 목표를 고르고 삭제 버튼.
// 남의 목록에서 누르면 누른 사람 자신의 목표를 다룬다. 자기 목록에서 누르면 추가·삭제 뒤 공개 목록도 고친다.
// customId — 목록 페이지 goal:<대상>:<페이지>, 추가 goal:add:<유형 r|c|g>:<대상>, 삭제 goal:del:<대상>, 입력 창 goal:am:<유형>:<주인>:<목록 메시지>,
//            삭제 메뉴 선택 goal:ds:<주인>:<목록 메시지>, 삭제 goal:dx:<주인>:<목록 메시지>:<목표 id>. 목록 메시지 "-" 는 고칠 목록 없음.

const ACCENT = 0x9333ea;
const MAX_GOALS_PER_USER = 25;
const PAGE_SIZE = 8;

// 기준 선택지 → 채보 판정 기준. "클리어"는 maimai 클리어 라인(달성률 80%).
const CRITERION_CHOICES: Record<string, ChartCriterion> = {
  클리어: { type: "achievement", value: 80, rank: "클리어" },
  S: { type: "achievement", value: 97, rank: "S" },
  "S+": { type: "achievement", value: 98, rank: "S+" },
  SS: { type: "achievement", value: 99, rank: "SS" },
  "SS+": { type: "achievement", value: 99.5, rank: "SS+" },
  SSS: { type: "achievement", value: 100, rank: "SSS" },
  "SSS+": { type: "achievement", value: 100.5, rank: "SSS+" },
  FC: { type: "combo", value: "FC" },
  "FC+": { type: "combo", value: "FC+" },
  AP: { type: "combo", value: "AP" },
  "AP+": { type: "combo", value: "AP+" },
  FS: { type: "sync", value: "FS" },
  "FS+": { type: "sync", value: "FS+" },
  FDX: { type: "sync", value: "FDX" },
  "FDX+": { type: "sync", value: "FDX+" },
};
const CRITERION_KEYS = Object.keys(CRITERION_CHOICES);

export const data = new SlashCommandBuilder()
  .setName("목표")
  .setDescription("레이팅·채보·집계 목표와 진행도 (추가·삭제 버튼)")
  .addUserOption((opt) => opt.setName("user").setDescription("조회할 유저 (생략 시 본인)"));

/**
 * 곡명(별명 가능) → 곡. 정확히 같은 곡명이 있으면 그 곡, 아니면 곡명·별명에 들어 있는 곡이 하나뿐일 때 그 곡.
 * 못 찾거나 여러 곡이 걸리면 추가하지 않고 안내(후보가 있으면 몇 개 보여 준다).
 */
function resolveTitle(input: string): { title: string } | { error: string } {
  const trimmed = input.trim();
  const q = normalizeQuery(trimmed);
  const titles = getAllSongTitles();
  const exact = titles.find((s) => normalizeQuery(s.title) === q);
  if (exact) return { title: exact.title };
  const hits = q ? [...new Set(titles.filter((s) => normalizeQuery(s.title).includes(q) || aliasMatches(s.title, q)).map((s) => s.title))] : [];
  if (hits.length === 1) return { title: hits[0] };
  const suggest = hits.length ? msg("goal.songSuggest", { titles: hits.slice(0, 5).join(", ") }) : "";
  return { error: msg("goal.songNotFound", { title: trimmed, suggest }) };
}

function criterionFrom(achievement: number | null, choice: string | null): ChartCriterion | { error: string } {
  if (achievement != null) return { type: "achievement", value: achievement };
  if (choice && CRITERION_CHOICES[choice]) return CRITERION_CHOICES[choice];
  return { error: msg("goal.needCriteriaOrAchievement") };
}

type GoalType = "rating" | "chart" | "aggregate";
interface GoalInput {
  type: GoalType;
  rating?: number | null;
  title?: string | null;
  diff?: string | null;
  kind?: "ST" | "DX" | null;
  level?: string | null;
  criterion?: string | null;
  achievement?: number | null;
  count?: number | null;
}

function buildSpec(input: GoalInput): { spec: GoalSpec } | { error: string } {
  if (input.type === "rating") {
    if (input.rating == null) return { error: msg("goal.needRating") };
    return { spec: { kind: "rating", target: input.rating } };
  }
  const achievement = input.achievement ?? null;
  const choice = input.criterion ?? null;
  if (input.type === "chart") {
    if (!input.title || !input.diff) return { error: msg("goal.needChartAndDiff") };
    const criterion = criterionFrom(achievement, choice);
    if ("error" in criterion) return criterion;
    const song = resolveTitle(input.title);
    if ("error" in song) return song;
    return {
      spec: {
        kind: "chart",
        title: song.title,
        diff: input.diff as (typeof DIFFICULTIES)[number],
        ...(input.kind ? { musicKind: input.kind } : {}),
        criterion,
      },
    };
  }
  if (!input.level) return { error: msg("goal.needLevel") };
  const range = parseLevelRange(input.level);
  if (!range) return { error: msg("goal.badLevelFormat") };
  const criterion = criterionFrom(achievement, choice);
  if ("error" in criterion) return criterion;
  return {
    spec: { kind: "aggregate", criterion, levelLabel: range.label, constantMin: range.min, constantMax: range.max, count: input.count ?? null },
  };
}

// ─── 목록 ────────────────────────────────────────────────────────────────────
async function goalsView(
  userId: string,
  displayName: string,
  page: number,
): Promise<{ embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] }> {
  // 유형마다 추가 버튼(누르면 바로 입력 창) + 삭제. customId goal:add:<유형 r|c|g>:<목록 주인>, goal:del:<목록 주인>.
  const manage = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...(["rating", "chart", "aggregate"] as GoalType[]).map((t) =>
      new ButtonBuilder().setCustomId(`goal:add:${TYPE_CODE[t]}:${userId}`).setLabel(msg(`goal.addButton.${t}` as never)).setStyle(ButtonStyle.Primary)),
    new ButtonBuilder().setCustomId(`goal:del:${userId}`).setLabel(msg("goal.deleteButton")).setStyle(ButtonStyle.Secondary),
  );
  const goals = await listGoals(userId);
  if (goals.length === 0) {
    return {
      embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription(msg("goal.empty", { name: displayName }))],
      components: [manage],
    };
  }

  const friendCode = await getUserFriendCode(userId);
  const profile = friendCode ? await getCachedProfile(friendCode) : null;

  const totalPages = Math.max(1, Math.ceil(goals.length / PAGE_SIZE));
  const idx = Math.max(0, Math.min(page, totalPages - 1));

  // 모든 목표를 라이브 평가한다. 완료 개수(footer)와 줄별 체크 표시가 항상 같은 판정을 쓰도록.
  const evaluated = goals.map((goal) => {
    let label = goal.label;
    let progress = goal.progress;
    let valueText = "";
    let targetText = "";
    let done = goal.completedAt > 0;
    try {
      const spec = JSON.parse(goal.specJson) as GoalSpec;
      label = describeGoal(spec);
      if (profile) {
        const evaluation = evaluateGoal(spec, { profile });
        progress = evaluation.progress;
        valueText = evaluation.valueText;
        targetText = evaluation.targetText;
        done = done || evaluation.done;
      }
    } catch {
      /* label/progress fall back to stored values */
    }
    return { label, progress, valueText, targetText, done };
  });

  const lines = evaluated.slice(idx * PAGE_SIZE, (idx + 1) * PAGE_SIZE).map((e, i) => {
    const number = idx * PAGE_SIZE + i + 1;
    const bar = progressBar(e.done ? 1 : e.progress);
    const pct = `${progressPercent(e.progress, e.done)}%`;
    const status = e.done ? "✅" : "⏳";
    const detail = e.valueText ? ` ✦ ${e.valueText}${e.targetText ? ` / ${e.targetText}` : ""}` : "";
    return `\`${String(number).padStart(2, " ")}.\` ${status} **${e.label}**\n\`${bar}\` ${pct}${detail}`;
  });

  const doneCount = evaluated.filter((e) => e.done).length;
  const embed = new EmbedBuilder()
    .setColor(ACCENT)
    .setTitle(msg("goal.listTitle", { name: displayName }))
    .setDescription(lines.join("\n\n"))
    .setFooter({
      text: msg("goal.listFooter", {
        done: doneCount,
        total: goals.length,
        page: totalPages > 1 ? msg("goal.listFooterPage", { index: idx + 1, pages: totalPages }) : "",
      }),
    });

  const components: ActionRowBuilder<ButtonBuilder>[] = [manage];
  if (totalPages > 1) {
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`goal:${userId}:${idx - 1}`).setLabel("◀").setStyle(ButtonStyle.Secondary).setDisabled(idx === 0),
        new ButtonBuilder().setCustomId(`goal:${userId}:page`).setLabel(`${idx + 1} / ${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId(`goal:${userId}:${idx + 1}`).setLabel("▶").setStyle(ButtonStyle.Secondary).setDisabled(idx >= totalPages - 1),
      ),
    );
  }
  return { embeds: [embed], components };
}

function displayNameOf(client: Client, guildMembers: { get(id: string): { displayName: string } | undefined } | undefined, userId: string): string {
  return guildMembers?.get(userId)?.displayName ?? client.users.cache.get(userId)?.username ?? msg("goal.defaultName");
}

/** 추가·삭제 뒤 공개 목록 메시지를 다시 그린다(목록 주인이 그 목록에서 열었을 때만). 실패해도 넘어간다. */
async function refreshList(i: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction, userId: string, listMsgId: string): Promise<void> {
  if (!listMsgId || listMsgId === "-") return;
  try {
    const view = await goalsView(userId, displayNameOf(i.client, i.guild?.members.cache, userId), 0);
    await i.channel?.messages.edit(listMsgId, view);
  } catch (e) {
    console.warn("[목표] 목록 갱신 실패:", (e as Error).message);
  }
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser("user") ?? interaction.user;
  await interaction.deferReply();
  const displayName = interaction.guild?.members.cache.get(target.id)?.displayName ?? target.username;
  await interaction.editReply(await goalsView(target.id, displayName, 0));
}

// ─── 추가(입력 창 하나) ───────────────────────────────────────────────────────
// 목록의 "레이팅/채보/집계 목표 추가" 버튼이 바로 입력 창을 연다. 창 안에 글 칸과 선택 메뉴(난이도·타입·기준)를 함께 둔다.
// customId — 입력 창 goal:am:<유형 r|c|g>:<주인>:<목록 메시지>.
const TYPE_CODE: Record<GoalType, string> = { rating: "r", chart: "c", aggregate: "g" };
const CODE_TYPE: Record<string, GoalType> = { r: "rating", c: "chart", g: "aggregate" };

function textLabel(id: string, label: string, required: boolean, placeholder: string, max: number, description?: string): LabelBuilder {
  const l = new LabelBuilder().setLabel(label).setTextInputComponent(
    new TextInputBuilder().setCustomId(id).setStyle(TextInputStyle.Short).setRequired(required).setPlaceholder(placeholder).setMaxLength(max),
  );
  return description ? l.setDescription(description) : l;
}

function selectLabel(id: string, label: string, options: { label: string; value: string; on?: boolean }[], description?: string): LabelBuilder {
  const l = new LabelBuilder().setLabel(label).setStringSelectMenuComponent(
    new StringSelectMenuBuilder().setCustomId(id).setRequired(true)
      .addOptions(options.map((o) => ({ label: o.label, value: o.value, default: !!o.on }))),
  );
  return description ? l.setDescription(description) : l;
}

function criterionLabel(): LabelBuilder {
  return selectLabel("criterion", msg("goal.field.criterion"), [
    ...CRITERION_KEYS.map((k) => ({ label: k, value: k, on: k === "SSS" })),
    { label: msg("goal.criterionByAchievement"), value: "-" },
  ], msg("goal.criterionHelp"));
}

export function addModal(type: GoalType, ownerId: string, listMsgId: string): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(`goal:am:${TYPE_CODE[type]}:${ownerId}:${listMsgId}`).setTitle(msg(`goal.modalTitle.${type}` as never));
  if (type === "rating") return modal.addLabelComponents(textLabel("rating", msg("goal.inputRating"), true, "15000", 5));
  if (type === "chart") {
    return modal.addLabelComponents(
      textLabel("title", msg("goal.inputTitle"), true, msg("goal.inputTitlePlaceholder"), 80),
      selectLabel("diff", msg("goal.field.diff"), DIFFICULTIES.map((d) => ({ label: d, value: d, on: d === "MASTER" }))),
      selectLabel("kind", msg("goal.field.kind"), [
        { label: msg("goal.kindAny"), value: "-", on: true },
        { label: "STANDARD", value: "ST" },
        { label: "DX", value: "DX" },
      ]),
      criterionLabel(),
      textLabel("achievement", msg("goal.inputAchievement"), false, "99.5", 8),
    );
  }
  return modal.addLabelComponents(
    textLabel("level", msg("goal.inputLevel"), true, "13, 13+, 13-14+", 12),
    textLabel("count", msg("goal.inputCount"), false, msg("goal.inputCountPlaceholder"), 4),
    criterionLabel(),
    textLabel("achievement", msg("goal.inputAchievement"), false, "99.5", 8),
  );
}

async function addFromModal(i: ModalSubmitInteraction): Promise<void> {
  const [, , code = "", ownerId = "", listMsgId = "-"] = i.customId.split(":");
  const type = CODE_TYPE[code] ?? "rating";
  const text = (id: string) => { try { return i.fields.getTextInputValue(id).trim(); } catch { return ""; } };
  const pick = (id: string) => { try { return i.fields.getStringSelectValues(id)[0] ?? ""; } catch { return ""; } };
  const num = (id: string) => { const t = text(id); return t ? Number(t) : null; };
  const fail = (content: string) => i.reply({ content: `⚠️ ${content}`, flags: MessageFlags.Ephemeral });
  if ((await countGoals(ownerId)) >= MAX_GOALS_PER_USER) {
    await fail(msg("goal.limitReached", { max: MAX_GOALS_PER_USER }));
    return;
  }
  const rating = num("rating"), achievement = num("achievement"), count = num("count");
  const bad = (n: number | null, lo: number, hi: number) => n !== null && (!Number.isFinite(n) || n < lo || n > hi);
  if (bad(rating, 1, 20000) || bad(achievement, 0, 101) || bad(count, 1, 2000)) {
    await fail(msg("goal.badNumber"));
    return;
  }
  const criterion = pick("criterion");
  const kind = pick("kind");
  const built = buildSpec({
    type,
    rating: rating !== null ? Math.round(rating) : null,
    title: text("title") || null,
    diff: pick("diff") || null,
    kind: kind === "ST" || kind === "DX" ? kind : null,
    level: text("level") || null,
    // 달성률을 적었으면 기준보다 그 값을 쓴다.
    criterion: achievement === null && criterion !== "-" ? criterion || null : null,
    achievement,
    count: count !== null ? Math.round(count) : null,
  });
  if ("error" in built) {
    await fail(built.error);
    return;
  }
  const friendCode = await getUserFriendCode(ownerId);
  const profile = friendCode ? await getCachedProfile(friendCode) : null;
  // 진행률 바를 "목표 세운 시점부터" 로 그리기 위해 현재값을 baseline 으로 캡처한다.
  if (profile) built.spec.baseline = evaluateGoal(built.spec, { profile }).currentValue;
  const label = describeGoal(built.spec);
  const goalId = await addGoal(ownerId, built.spec.kind, JSON.stringify(built.spec), label);
  let progress = msg("goal.progressNeedsProfile");
  if (profile) {
    const evaluation = evaluateGoal(built.spec, { profile });
    progress = msg("goal.progressValue", {
      bar: progressBar(evaluation.done ? 1 : evaluation.progress),
      percent: progressPercent(evaluation.progress, evaluation.done),
      value: evaluation.valueText,
      target: evaluation.targetText ? ` / ${evaluation.targetText}` : "",
      done: evaluation.done ? msg("goal.alreadyDone") : "",
    });
  }
  await i.reply({ content: msg("goal.added", { label, progress }), flags: MessageFlags.Ephemeral });
  await refreshList(i, ownerId, listMsgId);
  console.log(`[목표] 추가 user=${ownerId.slice(-6)} id=${goalId} kind=${built.spec.kind}`);
}

// ─── 삭제 메뉴 ────────────────────────────────────────────────────────────────
async function deleteMenu(ownerId: string, listMsgId: string, picked: number | null, notice?: string): Promise<ContainerBuilder> {
  const goals = await listGoals(ownerId);
  const labelOf = (g: (typeof goals)[number]) => { try { return describeGoal(JSON.parse(g.specJson) as GoalSpec); } catch { return g.label; } };
  const container = new ContainerBuilder()
    .setAccentColor(ACCENT)
    .addTextDisplayComponents((t) => t.setContent(msg("goal.deleteMenuTitle")));
  if (!goals.length) {
    container.addTextDisplayComponents((t) => t.setContent(msg("goal.deleteEmpty")));
  } else {
    container.addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`goal:ds:${ownerId}:${listMsgId}`)
          .setPlaceholder(msg("goal.deletePlaceholder"))
          .addOptions(goals.slice(0, 25).map((g, k) => ({ label: `${k + 1}. ${labelOf(g)}`.slice(0, 100), value: String(g.id), default: g.id === picked }))),
      ),
    );
    const chosen = goals.find((g) => g.id === picked);
    if (chosen) {
      container
        .addTextDisplayComponents((t) => t.setContent(msg("goal.deleteConfirm", { label: labelOf(chosen) })))
        .addActionRowComponents(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(`goal:dx:${ownerId}:${listMsgId}:${chosen.id}`).setLabel(msg("goal.deleteButtonConfirm")).setStyle(ButtonStyle.Danger),
          ),
        );
    }
  }
  if (notice) container.addSeparatorComponents((s) => s.setSpacing(SeparatorSpacingSize.Small)).addTextDisplayComponents((t) => t.setContent(notice));
  return container;
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────
export async function handleButton(interaction: ButtonInteraction): Promise<void> {
  const parts = interaction.customId.split(":");
  const action = parts[1] ?? "";
  // 누른 사람 자신의 목표를 다룬다. 자기 목록에서 눌렀을 때만 그 목록을 고친다.
  if (action === "add") {
    const [, , code = "", listOwner = ""] = parts;
    const owner = interaction.user.id;
    await interaction.showModal(addModal(CODE_TYPE[code] ?? "rating", owner, listOwner === owner ? interaction.message.id : "-"));
    return;
  }
  if (action === "del") {
    const owner = interaction.user.id;
    const listMsgId = parts[2] === owner ? interaction.message.id : "-";
    await interaction.reply({ components: [await deleteMenu(owner, listMsgId, null)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    return;
  }
  if (action === "dx") {
    const [, , ownerId = "", listMsgId = "-", idRaw = ""] = parts;
    const goals = await listGoals(ownerId);
    const goal = goals.find((g) => String(g.id) === idRaw);
    let notice = msg("goal.deleteMissing");
    if (goal) {
      await deleteGoal(ownerId, goal.id);
      let label = goal.label;
      try { label = describeGoal(JSON.parse(goal.specJson) as GoalSpec); } catch { /* keep stored label */ }
      notice = msg("goal.deleted", { label });
    }
    await interaction.update({ components: [await deleteMenu(ownerId, listMsgId, null, notice)], flags: MessageFlags.IsComponentsV2 });
    await refreshList(interaction, ownerId, listMsgId);
    return;
  }
  // 목록 페이지 넘김: goal:<대상>:<페이지>
  const [, ownerId = "", pageRaw = "0"] = parts;
  if (pageRaw === "page") {
    await interaction.deferUpdate();
    return;
  }
  const page = parseInt(pageRaw) || 0;
  await interaction.update(await goalsView(ownerId, displayNameOf(interaction.client, interaction.guild?.members.cache, ownerId), page));
}

/** goal: 로 시작하는 선택 메뉴(삭제할 목표). */
export async function handleSelect(i: StringSelectMenuInteraction): Promise<void> {
  const parts = i.customId.split(":");
  if (parts[1] !== "ds") return;
  const [, , ownerId = "", listMsgId = "-"] = parts;
  await i.update({ components: [await deleteMenu(ownerId, listMsgId, Number(i.values[0]) || null)], flags: MessageFlags.IsComponentsV2 });
}

/** 추가 입력 창(goal:am:…). */
export async function handleModal(i: ModalSubmitInteraction): Promise<void> {
  await addFromModal(i);
}
