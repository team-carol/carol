import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ButtonInteraction,
  EmbedBuilder,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import {
  getCachedProfile,
  getUserFriendCode,
  listGoals,
  countGoals,
  addGoal,
  deleteGoal,
} from "../../storage";
import type { GoalRow } from "../../storage";
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
  .setDescription("레이팅·채보·집계 목표를 세우고 동기화할 때마다 진행도를 추적")
  .addSubcommand((sub) =>
    sub
      .setName("추가")
      .setDescription("새 목표 추가")
      .addStringOption((opt) =>
        opt
          .setName("유형")
          .setDescription("목표 종류")
          .setRequired(true)
          .addChoices(
            { name: "레이팅 (전체 레이팅 도달)", value: "rating" },
            { name: "채보 (특정 곡/난이도)", value: "chart" },
            { name: "집계 (레벨 구간 N곡)", value: "aggregate" },
          ),
      )
      .addIntegerOption((opt) =>
        opt.setName("레이팅").setDescription("[레이팅] 목표 레이팅 값 (예: 15000)").setMinValue(1).setMaxValue(20000),
      )
      .addStringOption((opt) =>
        opt.setName("곡").setDescription("[채보] 곡명 (별명 가능)").setMaxLength(80),
      )
      .addStringOption((opt) =>
        opt
          .setName("난이도")
          .setDescription("[채보] 난이도")
          .addChoices(...DIFFICULTIES.map((d) => ({ name: d, value: d }))),
      )
      .addStringOption((opt) =>
        opt
          .setName("타입")
          .setDescription("[채보] 채보 타입 (생략 시 무관)")
          .addChoices({ name: "STANDARD", value: "ST" }, { name: "DX", value: "DX" }),
      )
      .addStringOption((opt) =>
        opt.setName("레벨").setDescription("[집계] 표시 레벨 (예: 13, 13+, 13-14+)").setMaxLength(12),
      )
      .addStringOption((opt) =>
        opt
          .setName("기준")
          .setDescription("[채보/집계] 달성 기준")
          .addChoices(...CRITERION_KEYS.map((k) => ({ name: k, value: k }))),
      )
      .addNumberOption((opt) =>
        opt
          .setName("달성률")
          .setDescription("[채보/집계] 기준 대신 직접 달성률 지정 (예: 99.5)")
          .setMinValue(0)
          .setMaxValue(101),
      )
      .addIntegerOption((opt) =>
        opt.setName("개수").setDescription("[집계] 목표 곡 수 (생략 시 구간 전곡)").setMinValue(1).setMaxValue(2000),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("목록")
      .setDescription("내 목표와 진행도 보기")
      .addUserOption((opt) => opt.setName("user").setDescription("조회할 유저 (생략 시 본인)")),
  )
  .addSubcommand((sub) =>
    sub
      .setName("삭제")
      .setDescription("목표 삭제")
      .addIntegerOption((opt) =>
        opt.setName("번호").setDescription("`/목표 목록` 에 표시된 번호").setRequired(true).setMinValue(1),
      ),
  );

function resolveTitle(input: string): { title: string; known: boolean } {
  const trimmed = input.trim();
  const q = normalizeQuery(trimmed);
  const titles = getAllSongTitles();
  const exact = titles.find((s) => normalizeQuery(s.title) === q);
  if (exact) return { title: exact.title, known: true };
  const viaAlias = titles.find((s) => aliasMatches(s.title, trimmed));
  if (viaAlias) return { title: viaAlias.title, known: true };
  return { title: trimmed, known: false };
}

function criterionFrom(
  achievement: number | null,
  choice: string | null,
): ChartCriterion | { error: string } {
  if (achievement != null) return { type: "achievement", value: achievement };
  if (choice && CRITERION_CHOICES[choice]) return CRITERION_CHOICES[choice];
  return { error: msg("goal.needCriteriaOrAchievement") };
}

async function buildSpec(
  interaction: ChatInputCommandInteraction,
): Promise<{ spec: GoalSpec; note?: string } | { error: string }> {
  const type = interaction.options.getString("유형", true);

  if (type === "rating") {
    const target = interaction.options.getInteger("레이팅");
    if (target == null) return { error: msg("goal.needRating") };
    return { spec: { kind: "rating", target } };
  }

  const achievement = interaction.options.getNumber("달성률");
  const choice = interaction.options.getString("기준");

  if (type === "chart") {
    const rawTitle = interaction.options.getString("곡");
    const diff = interaction.options.getString("난이도");
    if (!rawTitle || !diff) return { error: msg("goal.needChartAndDiff") };
    const criterion = criterionFrom(achievement, choice);
    if ("error" in criterion) return criterion;
    const { title, known } = resolveTitle(rawTitle);
    const musicKind = interaction.options.getString("타입") as "ST" | "DX" | null;
    return {
      spec: {
        kind: "chart",
        title,
        diff: diff as (typeof DIFFICULTIES)[number],
        ...(musicKind ? { musicKind } : {}),
        criterion,
      },
      note: known ? undefined : msg("goal.songNotFound", { title }),
    };
  }

  // aggregate
  const levelText = interaction.options.getString("레벨");
  if (!levelText) return { error: msg("goal.needLevel") };
  const range = parseLevelRange(levelText);
  if (!range) return { error: msg("goal.badLevelFormat") };
  const criterion = criterionFrom(achievement, choice);
  if ("error" in criterion) return criterion;
  const count = interaction.options.getInteger("개수");
  return {
    spec: {
      kind: "aggregate",
      criterion,
      levelLabel: range.label,
      constantMin: range.min,
      constantMax: range.max,
      count: count ?? null,
    },
  };
}

async function goalsEmbed(
  userId: string,
  displayName: string,
  page: number,
): Promise<{ embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] }> {
  const goals = await listGoals(userId);
  if (goals.length === 0) {
    return {
      embeds: [
        new EmbedBuilder()
          .setColor(0x2b2d31)
          .setDescription("등록된 목표가 없습니다. `/목표 추가` 로 첫 목표를 세워보세요."),
      ],
      components: [],
    };
  }

  const friendCode = await getUserFriendCode(userId);
  const profile = friendCode ? await getCachedProfile(friendCode) : null;

  const totalPages = Math.max(1, Math.ceil(goals.length / PAGE_SIZE));
  const idx = Math.max(0, Math.min(page, totalPages - 1));

  // 모든 목표를 라이브 평가한다. 완료 개수(footer)와 줄별 체크 표시가 항상 같은
  // 판정을 쓰도록 — 예전엔 줄은 라이브 평가, footer 는 저장된 completedAt 만 봐서
  // 달성했는데도 "0/N 완료" 로 뜨는 불일치가 있었다.
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

  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  if (totalPages > 1) {
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`goal:${userId}:${idx - 1}`)
          .setLabel("◀")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(idx === 0),
        new ButtonBuilder()
          .setCustomId(`goal:${userId}:page`)
          .setLabel(`${idx + 1} / ${totalPages}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(`goal:${userId}:${idx + 1}`)
          .setLabel("▶")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(idx >= totalPages - 1),
      ),
    );
  }
  return { embeds: [embed], components };
}

export async function handleButton(interaction: ButtonInteraction): Promise<void> {
  const [, ownerId, pageRaw] = interaction.customId.split(":");
  if (pageRaw === "page") {
    await interaction.deferUpdate();
    return;
  }
  const page = parseInt(pageRaw ?? "0") || 0;
  const displayName =
    interaction.guild?.members.cache.get(ownerId)?.displayName ??
    interaction.client.users.cache.get(ownerId)?.username ??
    msg("goal.defaultName");
  const result = await goalsEmbed(ownerId, displayName, page);
  await interaction.update(result);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();

  if (sub === "목록") {
    const target = interaction.options.getUser("user") ?? interaction.user;
    await interaction.deferReply();
    const displayName =
      interaction.guild?.members.cache.get(target.id)?.displayName ?? target.username;
    const result = await goalsEmbed(target.id, displayName, 0);
    await interaction.editReply(result);
    return;
  }

  if (sub === "삭제") {
    const number = interaction.options.getInteger("번호", true);
    const goals = await listGoals(interaction.user.id);
    const goal = goals[number - 1] as GoalRow | undefined;
    if (!goal) {
      await interaction.reply({
        content: msg("goal.notFound", { number }),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await deleteGoal(interaction.user.id, goal.id);
    let label = goal.label;
    try {
      label = describeGoal(JSON.parse(goal.specJson) as GoalSpec);
    } catch {
      /* keep stored label */
    }
    await interaction.reply({ content: `🗑️ 목표를 삭제했습니다: **${label}**`, flags: MessageFlags.Ephemeral });
    return;
  }

  // 추가
  if ((await countGoals(interaction.user.id)) >= MAX_GOALS_PER_USER) {
    await interaction.reply({
      content: msg("goal.limitReached", { max: MAX_GOALS_PER_USER }),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const built = await buildSpec(interaction);
  if ("error" in built) {
    await interaction.reply({ content: `⚠️ ${built.error}`, flags: MessageFlags.Ephemeral });
    return;
  }

  const friendCode = await getUserFriendCode(interaction.user.id);
  const profile = friendCode ? await getCachedProfile(friendCode) : null;

  // 진행률 바를 "목표 세운 시점부터" 로 그리기 위해 현재값을 baseline 으로 캡처한다.
  // 프로필이 아직 없으면 baseline 없이 저장되고 이후 절대값 기준으로 표시된다.
  if (profile) {
    built.spec.baseline = evaluateGoal(built.spec, { profile }).currentValue;
  }

  const label = describeGoal(built.spec);
  const goalId = await addGoal(interaction.user.id, built.spec.kind, JSON.stringify(built.spec), label);

  const embed = new EmbedBuilder()
    .setColor(ACCENT)
    .setTitle(msg("goal.addedTitle"))
    .setDescription(`**${label}**`);

  if (profile) {
    const evaluation = evaluateGoal(built.spec, { profile });
    const bar = progressBar(evaluation.done ? 1 : evaluation.progress);
    embed.addFields({
      name: msg("goal.progressField"),
      value: msg("goal.progressValue", {
        bar,
        percent: progressPercent(evaluation.progress, evaluation.done),
        value: evaluation.valueText,
        target: evaluation.targetText ? ` / ${evaluation.targetText}` : "",
        done: evaluation.done ? msg("goal.alreadyDone") : "",
      }),
    });
  } else {
    embed.addFields({
      name: msg("goal.progressField"),
      value: msg("goal.progressNeedsProfile"),
    });
  }
  if (built.note) embed.setFooter({ text: built.note });

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  console.log(`[목표] 추가 user=${interaction.user.id.slice(-6)} id=${goalId} kind=${built.spec.kind}`);
}
