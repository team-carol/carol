import {
  SlashCommandBuilder, ChatInputCommandInteraction, AutocompleteInteraction, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, AttachmentBuilder,
} from "discord.js";
import { randomBytes } from "crypto";
import { saveSimaiChart, countSimaiChartsByOwner, getTranslateTitles } from "../../storage";
import { displayTitle } from "../../aliases";
import { parseMaidata, UNKNOWN_DIFFICULTY } from "../../simai/parse";
import { resolveChart, makeChartKey, ChartUnavailableError } from "../../simai/source";
import { searchRegistry, registrySize } from "../../simai/registryIndex";
import { renderChartGifAsync, densePreviewRange, GIF_DEFAULTS } from "../utils/chartGif";
import { getBaseUrl } from "../../web/bookmarklet";
import { PORT } from "../../config";
import { msg } from "../../messages";
import type { Chart } from "../../simai/types";

/** 첨부 파일 크기 상한. 공식 길이의 maidata.txt 도 수십 KB 라 넉넉하다. */
const MAX_BYTES = 2 * 1024 * 1024;
/** 한 사람이 보관할 수 있는 업로드 채보 수. 넘으면 오래된 것부터 지우라고 안내한다. */
const MAX_PER_USER = 20;

const DIFF_LABEL: Record<number, string> = {
  1: "BASIC", 2: "ADVANCED", 3: "EXPERT", 4: "MASTER", 5: "Re:MASTER",
};
const DIFF_COLOR: Record<number, number> = {
  1: 0x16a34a, 2: 0xea580c, 3: 0xdc2626, 4: 0x9333ea, 5: 0xc084fc,
};
/** 스탠다드/DX 구분 태그. 같은 곡이 둘 다 있을 때 이름이 겹치는 걸 막는다. */
function typeTag(type?: string): string {
  return type === "deluxe" ? " [DX]" : type === "standard" ? " [ST]" : "";
}

export const data = new SlashCommandBuilder()
  .setName("보면")
  .setDescription("채보를 재생해봅니다")
  .addStringOption((o) =>
    o.setName("곡명").setDescription("곡 이름으로 찾기 (별명 가능)").setRequired(false).setAutocomplete(true),
  )
  .addAttachmentOption((o) =>
    o.setName("파일").setDescription("simai maidata.txt").setRequired(false),
  )
  .addIntegerOption((o) =>
    o.setName("난이도").setDescription("파일 업로드 시. 생략하면 가장 높은 난이도 (곡명 검색에는 영향 없음)").setRequired(false)
      .addChoices(...Object.entries(DIFF_LABEL).map(([v, name]) => ({ name, value: Number(v) }))),
  )
  .addNumberOption((o) =>
    o.setName("시작").setDescription("미리보기를 시작할 시각(초). 생략 시 가장 빽빽한 구간")
      .setRequired(false).setMinValue(0),
  );

/** 곡 이름 자동완성. 네트워크를 쓰지 않고 메모리 인덱스만 본다. */
export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  if (registrySize() === 0) { await interaction.respond([]); return; }
  const q = interaction.options.getFocused();
  const hits = searchRegistry(q, 25);
  await interaction.respond(hits.map((c) => {
    const diff = DIFF_LABEL[c.difficulty] ?? "?";
    const lv = c.level ? ` ${c.level}` : "";
    // 같은 곡의 스탠다드/DX 를 구분(둘 다 있으면 이름이 같아진다).
    const name = `${c.title}${typeTag(c.type)} · ${diff}${lv}`.slice(0, 100);
    return { name, value: makeChartKey("registry", c.id) };
  }));
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const file = interaction.options.getAttachment("파일");
  const pick = interaction.options.getString("곡명");
  const want = interaction.options.getInteger("난이도");

  if (file && pick) {
    await interaction.reply({ content: msg("chart.bothInput"), flags: MessageFlags.Ephemeral });
    return;
  }
  if (!file && !pick) {
    await interaction.reply({ content: msg("chart.needInput"), flags: MessageFlags.Ephemeral });
    return;
  }

  // ── 곡 이름으로 고른 경우 ────────────────────────────────────────────────
  if (pick) {
    await interaction.deferReply();
    try {
      const found = await resolveChart(pick);
      const parsed = parseMaidata(found.maidata);
      const available = Object.keys(parsed.charts).map(Number).sort((a, b) => a - b);
      const key = parsed.charts[found.difficulty] ? found.difficulty : available[available.length - 1];
      const chart: Chart = parsed.charts[key];
      if (!chart || chart.notes.length === 0) {
        await interaction.editReply({ content: msg("chart.emptyChart") });
        return;
      }
      // mai-notes 본문은 헤더가 없어 파서 키(key)가 0(미상)이지만, 메타데이터에
      // 실제 난이도가 있다. 표시·저장에는 그 실제 난이도를 쓴다.
      const diff = found.difficulty || key;
      let id = found.storedId;
      if (!id) {
        id = randomBytes(12).toString("base64url");
        await saveSimaiChart({
          id, ownerId: "", source: "registry",
          title: found.title.slice(0, 200), artist: found.artist.slice(0, 200),
          designer: found.designer.slice(0, 200), level: found.level.slice(0, 20),
          difficulty: diff, maidata: found.maidata, chartJson: JSON.stringify(chart),
        });
      }
      await reply(interaction, {
        id, title: found.title, artist: found.artist,
        designer: found.designer, level: found.level, diff, chart,
        sourceUrl: found.sourceUrl, chartType: found.chartType,
        footer: found.attribution
          ? msg("chart.footerSource", { source: found.attribution })
          : msg("chart.footerRegistry"),
      });
    } catch (e) {
      if (e instanceof ChartUnavailableError) {
        await interaction.editReply({ content: msg(`chart.unavailable.${e.reason}`) });
        return;
      }
      console.error("[보면] 채보 조회 실패:", e);
      await interaction.editReply({ content: msg("chart.parseFailed") });
    }
    return;
  }

  // ── 파일을 올린 경우 ─────────────────────────────────────────────────────
  if (file!.size > MAX_BYTES) {
    await interaction.reply({ content: msg("chart.tooLarge"), flags: MessageFlags.Ephemeral });
    return;
  }
  // maidata.txt 는 텍스트다. 확장자/타입 어느 쪽이든 텍스트로 보이면 받는다.
  const looksText = /\.(txt|simai)$/i.test(file!.name ?? "") || (file!.contentType ?? "").startsWith("text/");
  if (!looksText) {
    await interaction.reply({ content: msg("chart.notText"), flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply();

  let text: string;
  try {
    const res = await fetch(file!.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    text = await res.text();
  } catch (e) {
    console.error("[보면] 첨부 다운로드 실패:", e);
    await interaction.editReply({ content: msg("chart.downloadFailed") });
    return;
  }

  let parsed;
  try {
    parsed = parseMaidata(text);
  } catch (e) {
    console.error("[보면] 파싱 실패:", e);
    await interaction.editReply({ content: msg("chart.parseFailed") });
    return;
  }

  const available = Object.keys(parsed.charts).map(Number).sort((a, b) => a - b);
  if (available.length === 0) {
    await interaction.editReply({ content: msg("chart.noChart") });
    return;
  }
  // 헤더 없이 본문만 공유된 파일은 난이도를 알 수 없어 키가 UNKNOWN_DIFFICULTY 하나뿐이다.
  // 이때 유저가 난이도를 지정했다면 "이건 MASTER다" 라는 뜻으로 받아 표시에만 쓴다.
  const bareOnly = available.length === 1 && available[0] === UNKNOWN_DIFFICULTY;
  if (!bareOnly && want !== null && !parsed.charts[want]) {
    // 요청한 난이도가 없으면 조용히 바꾸지 말고 무엇이 들어있는지 알린다.
    await interaction.editReply({
      content: msg("chart.diffMissing", {
        want: DIFF_LABEL[want] ?? String(want),
        has: available.map((d) => DIFF_LABEL[d] ?? String(d)).join(", "),
      }),
    });
    return;
  }
  const key = bareOnly ? UNKNOWN_DIFFICULTY : (want ?? available[available.length - 1]);
  const chart: Chart = parsed.charts[key];
  // 저장·표시에 쓰는 난이도. 본문만 온 파일에 유저가 난이도를 붙여준 경우가 유일한 차이.
  const diff = bareOnly ? (want ?? UNKNOWN_DIFFICULTY) : key;
  if (chart.notes.length === 0) {
    await interaction.editReply({ content: msg("chart.emptyChart") });
    return;
  }

  const owned = await countSimaiChartsByOwner(interaction.user.id);
  if (owned >= MAX_PER_USER) {
    await interaction.editReply({ content: msg("chart.quota", { max: MAX_PER_USER }) });
    return;
  }

  const id = randomBytes(12).toString("base64url");
  try {
    await saveSimaiChart({
      id,
      ownerId: interaction.user.id,
      source: "upload",
      title: parsed.title.slice(0, 200),
      artist: parsed.artist.slice(0, 200),
      designer: (parsed.designers[key] ?? "").slice(0, 200),
      level: (parsed.levels[key] ?? "").slice(0, 20),
      difficulty: diff,
      maidata: text,
      chartJson: JSON.stringify(chart),
    });
  } catch (e) {
    console.error("[보면] 저장 실패:", e);
    await interaction.editReply({ content: msg("chart.saveFailed") });
    return;
  }

  await reply(interaction, {
    id, title: parsed.title, artist: parsed.artist,
    designer: parsed.designers[key] ?? "", level: parsed.levels[key] ?? "",
    diff, chart, footer: msg("chart.footer", { user: interaction.user.username }),
  });
}

interface ReplyInput {
  id: string; title: string; artist: string; designer: string;
  level: string; diff: number; chart: Chart; footer: string;
  /** 원본 페이지 링크(있으면 출처·원작자 크레딧을 설명에 건다). */
  sourceUrl?: string;
  /** "standard" | "deluxe" | "" — 제목 옆 [ST]/[DX] 구분. */
  chartType?: string;
}

/** 링크 + 통계 + 미리보기 GIF 를 붙여 응답한다. 파일/곡 어느 쪽으로 왔든 같다. */
async function reply(interaction: ChatInputCommandInteraction, x: ReplyInput): Promise<void> {
  const url = `${getBaseUrl(PORT)}/chart?id=${x.id}`;
  const s = x.chart.stats;
  const secs = Math.round(x.chart.durationMs / 1000);
  // 곡명 한국어 번역: 실행 유저의 표시 설정(translate_titles)이 켜져 있고 번역 별명이
  // 있으면 치환. 다른 임베드(검색·최근)와 같은 방식.
  const translate = await getTranslateTitles(interaction.user.id);
  const shownTitle = displayTitle(x.title, translate);
  const embed = new EmbedBuilder()
    .setColor(DIFF_COLOR[x.diff] ?? 0x9333ea)
    .setTitle((shownTitle || msg("chart.untitled")) + typeTag(x.chartType))
    .setDescription(
      msg("chart.openLink", { url })
      + (x.chart.bpmAssumed ? "\n" + msg("chart.bpmAssumedNote") : "")
      // 원본 링크 + 제작자 크레딧. atwiki 등록분이면 항상 출처를 건다.
      + (x.sourceUrl ? "\n" + msg("chart.sourceCredit", { url: x.sourceUrl, designer: x.designer || "?" }) : ""),
    )
    .addFields(
      { name: msg("chart.fieldChart"), value: `\`${DIFF_LABEL[x.diff] ?? msg("chart.diffUnknown")}\`${x.level ? "  ·  Lv." + x.level : ""}`, inline: true },
      { name: msg("chart.fieldBpm"), value: `\`${x.chart.bpm}\`${x.chart.bpmAssumed ? " (추정)" : ""}  ·  ${x.chart.measures}마디`, inline: true },
      { name: msg("chart.fieldLength"), value: `\`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}\``, inline: true },
      {
        name: msg("chart.fieldNotes"),
        value: `TAP \`${s.tap}\` · HOLD \`${s.hold + s.touchHold}\` · SLIDE \`${s.slide}\` · TOUCH \`${s.touch}\` · BREAK \`${s.break}\`\n합계 \`${s.total}\``,
      },
    )
    .setFooter({ text: x.footer });
  if (x.artist) embed.setAuthor({ name: x.artist });

  // 미리보기 GIF. 웹 플레이어와 같은 렌더러를 워커에서 돌려 몇 초치를 잘라낸다.
  const files: AttachmentBuilder[] = [];
  try {
    // 밀도 높은 구간이 길게 이어질수록 미리보기도 길게(15~30초). 짧으면 15초.
    const dyn = densePreviewRange(x.chart, 15000, 30000);
    const clipMs = Math.min(dyn.durationMs, Math.max(2000, x.chart.durationMs));
    const asked = interaction.options.getNumber("시작");
    const maxStart = Math.max(0, x.chart.durationMs - clipMs);
    const startMs = asked !== null
      ? Math.min(asked * 1000, maxStart)
      : Math.min(dyn.startMs, maxStart);
    const gif = await renderChartGifAsync(
      { id: x.id, title: x.title, artist: x.artist, designer: x.designer,
        level: x.level, difficulty: x.diff, chart: x.chart },
      { ...GIF_DEFAULTS, durationMs: clipMs, startMs },
    );
    files.push(new AttachmentBuilder(gif, { name: "preview.gif" }));
    embed.setImage("attachment://preview.gif");
    const s0 = Math.round(startMs / 1000);
    embed.addFields({
      name: msg("chart.fieldPreview"),
      value: msg("chart.previewRange", {
        from: `${Math.floor(s0 / 60)}:${String(s0 % 60).padStart(2, "0")}`,
        sec: Math.round(clipMs / 1000),
      }),
      inline: true,
    });
  } catch (e) {
    // 미리보기는 부가 기능이라, 실패해도 링크는 그대로 준다.
    console.error("[보면] 미리보기 생성 실패:", e);
  }

  // 링크 버튼은 https 일 때만 단다. baseUrl 이 비어 있는 로컬 개발에서는 URL 이
  // http://localhost:... 라 Discord 가 거부할 수 있고, 그러면 응답 전체가 실패한다.
  // 어차피 embed 설명에 같은 링크가 마크다운으로 들어가 있어 기능은 잃지 않는다.
  const row = new ActionRowBuilder<ButtonBuilder>();
  if (url.startsWith("https://")) {
    row.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(url).setLabel(msg("chart.button")));
  }
  // 풀영상(400px/60fps, 가이드음)을 만들어 캐시하는 버튼. 처음 한 번만 렌더되고
  // 그 뒤로는 캐시로 즉시 나온다.
  row.addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Secondary).setCustomId(`chartvid:${x.id}`).setLabel(msg("chart.videoButton")),
  );
  await interaction.editReply({ embeds: [embed], components: [row], files });
}
