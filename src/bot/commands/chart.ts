import {
  SlashCommandBuilder, ChatInputCommandInteraction, AutocompleteInteraction,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, AttachmentBuilder,
  ContainerBuilder, SectionBuilder, SeparatorSpacingSize, TextDisplayBuilder, escapeMarkdown,
} from "discord.js";
import { randomBytes } from "crypto";
import { saveSimaiChart, countSimaiChartsByOwner, getTranslateTitles, getUserFriendCode, getCachedProfile } from "../../storage";
import { displayTitle } from "../../aliases";
import { parseMaidata, UNKNOWN_DIFFICULTY } from "../../simai/parse";
import { resolveChart, ChartUnavailableError } from "../../simai/source";
import { searchAllCharts, chartIndexSize } from "../../simai/chartSearch";
import { renderPreviewGif } from "../utils/chartGif";
import { jacketBuffer, getClearList } from "../utils/embeds";
import { diffEmoji, rankEmoji, comboEmoji, syncEmoji, dxStarEmoji, kindEmoji } from "../utils/emoji";
import { getConstant, getJacketFile, getSongVersionName, isSongPlus, getSongGenre } from "../../constants";
import { getScoreRank } from "../../games";
import { dxStars } from "../../sRating";
import type { PlayRecord } from "../../scraper";
import { getBaseUrl } from "../../web/bookmarklet";
import { PORT } from "../../config";
import { msg } from "../../messages";
import type { Chart } from "../../simai/types";

/** 첨부 파일 크기 상한. 공식 길이의 maidata.txt 도 수십 KB 라 넉넉하다. */
const MAX_BYTES = 2 * 1024 * 1024;
/** 한 사람이 보관할 수 있는 업로드 채보 수. 넘으면 오래된 것부터 지우라고 안내한다. */
const MAX_PER_USER = 20;

const DIFF_LABEL: Record<number, string> = {
  1: "BASIC", 2: "ADVANCED", 3: "EXPERT", 4: "MASTER", 5: "Re:MASTER", 6: "宴", 7: "宴",
};
const DIFF_COLOR: Record<number, number> = {
  1: 0x16a34a, 2: 0xea580c, 3: 0xdc2626, 4: 0x9333ea, 5: 0xc084fc, 6: 0xec4899, 7: 0xec4899,
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
      .addChoices(...Object.entries(DIFF_LABEL).filter(([v]) => Number(v) <= 5).map(([v, name]) => ({ name, value: Number(v) }))),
  )
  .addNumberOption((o) =>
    o.setName("시작").setDescription("미리보기를 시작할 시각(초). 생략 시 가장 빽빽한 구간")
      .setRequired(false).setMinValue(0),
  );

/** 곡 이름 자동완성. 네트워크를 쓰지 않고 메모리 인덱스만 본다. */
export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  if (chartIndexSize() === 0) { await interaction.respond([]); return; }
  const q = interaction.options.getFocused();
  const hits = searchAllCharts(q, 25);
  await interaction.respond(hits.map((c) => {
    const diff = DIFF_LABEL[c.difficulty] ?? "?";
    const lv = c.level ? ` ${c.level}` : "";
    // 같은 곡의 스탠다드/DX 를 구분(둘 다 있으면 이름이 같아진다).
    const name = `${c.title}${typeTag(c.type)} ✦ ${diff}${lv}`.slice(0, 100);
    return { name, value: c.key };
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
        footer: found.attribution && found.sourceUrl
          ? msg("chart.footerSource", { source: found.attribution, url: found.sourceUrl })
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

/** 보면 제작자(원본 페이지 링크). 출처 사이트는 아래 출처 줄에 링크로 걸리므로, 제작자를 모르면 줄을 뺀다. */
function sourceCredit(url: string, designer: string): string {
  return designer ? msg("chart.sourceCredit", { url, designer }) : "";
}

/** m:ss */
function clock(ms: number): string {
  const sec = Math.round(ms / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

/** BPM 이 바뀌는 채보는 "150–300" 처럼 범위로. */
function bpmText(chart: Chart): string {
  const fmt = (b: number) => (Number.isInteger(b) ? String(b) : b.toFixed(1));
  const bpms = chart.bpmEvents.map((e) => e.bpm).filter((b) => b > 0);
  const lo = bpms.length ? Math.min(...bpms) : chart.bpm;
  const hi = bpms.length ? Math.max(...bpms) : chart.bpm;
  const text = lo !== hi ? `${fmt(lo)}–${fmt(hi)}` : fmt(chart.bpm);
  return chart.bpmAssumed ? msg("chart.bpmGuess", { bpm: text }) : text;
}

/**
 * 노트 하나로 깎이는 달성률(%). 기본 점수 가중치는 TAP·TOUCH 1, HOLD 2, SLIDE 3, BREAK 5 이고 GREAT 는 80%.
 * BREAK 보너스 1% 는 BREAK 수로 나누며 PERFECT 는 그중 75%·50% 만 받는다.
 */
function judgeLoss(s: Chart["stats"]): { tapGreat: number; break75: number; break50: number } {
  const weight = s.tap + s.touch + 2 * (s.hold + s.touchHold) + 3 * s.slide + 5 * s.break;
  const bonus = s.break > 0 ? 1 / s.break : 0;
  return { tapGreat: weight > 0 ? (0.2 / weight) * 100 : 0, break75: 0.25 * bonus, break50: 0.5 * bonus };
}

/** 실행한 사람의 이 보면 기록 한 줄. 연동하지 않았으면 null. */
async function myRecordLine(userId: string, title: string, kind: string, diff: string): Promise<string | null> {
  try {
    const fc = await getUserFriendCode(userId);
    const p = fc ? await getCachedProfile(fc) : null;
    if (!p) return null;
    const r = getClearList(p).find((c) => c.title === title && c.musicKind === kind && c.diff === diff);
    if (!r || r.achievementVal <= 0) return msg("chart.myRecordNone");
    const stars = r.dxScoreMax ? dxStars(((r.dxScore ?? 0) / r.dxScoreMax) * 100) : 0;
    const marks = [rankEmoji(getScoreRank(r.achievementVal)), comboEmoji(r.fc), syncEmoji(r.sync), dxStarEmoji(stars)];
    return msg("chart.myRecord", { achievement: `${r.achievementVal.toFixed(4)}%`, marks: marks.filter(Boolean).join(" ") });
  } catch (e) {
    console.error("[보면] 내 기록 조회 실패:", e);
    return null;
  }
}

/** 곡 정보·노트 수·내 기록·미리보기 GIF 를 Components V2 컨테이너로 응답한다. 파일/곡 어느 쪽으로 왔든 같다. */
async function reply(interaction: ChatInputCommandInteraction, x: ReplyInput): Promise<void> {
  const url = `${getBaseUrl(PORT)}/chart?id=${x.id}`;
  const s = x.chart.stats;
  // 곡명 한국어 번역: 실행 유저의 표시 설정(translate_titles)이 켜져 있고 번역 별명이
  // 있으면 치환. 다른 임베드(검색·최근)와 같은 방식.
  const translate = await getTranslateTitles(interaction.user.id);
  const shownTitle = displayTitle(x.title, translate);
  const kind = x.chartType === "deluxe" ? "DX" : x.chartType === "standard" ? "ST" : "";
  const diffName: string | undefined = DIFF_LABEL[x.diff];
  // 카탈로그에 있는 곡(재킷이 있으면 있는 곡)이면 상수·버전·장르·재킷·내 기록·외부출력을 붙인다.
  // 업로드 파일은 제목이 카탈로그와 같을 때만 붙는다.
  const inCatalog = getJacketFile(x.title) !== null;
  const constant = inCatalog && diffName && kind ? getConstant(x.title, kind, diffName, "intl", true) : null;
  const versionName = inCatalog && kind ? getSongVersionName(x.title, "intl", kind) : null;
  const version = versionName ? versionName + (isSongPlus(x.title, "intl", kind) ? " PLUS" : "") : null;
  const genre = inCatalog ? getSongGenre(x.title) : null;

  // 미리보기 GIF 는 웹 플레이어와 같은 렌더러를 워커에서 돌려 몇 초치를 잘라낸다. 재킷·내 기록과 같이 기다린다.
  const asked = interaction.options.getNumber("시작");
  const [jacket, mine, preview] = await Promise.all([
    inCatalog ? jacketBuffer({ title: x.title, jacketUrl: "" } as PlayRecord) : Promise.resolve(null),
    inCatalog && diffName && kind ? myRecordLine(interaction.user.id, x.title, kind, diffName) : Promise.resolve(null),
    renderPreviewGif(
      { id: x.id, title: x.title, artist: x.artist, designer: x.designer,
        level: x.level, difficulty: x.diff, chart: x.chart },
      asked !== null ? asked * 1000 : undefined,
    ).catch((e) => {
      // 미리보기는 부가 기능이라, 실패해도 나머지는 그대로 준다.
      console.error("[보면] 미리보기 생성 실패:", e);
      return null;
    }),
  ]);

  const heading = [
    msg("chart.title", { title: escapeMarkdown(shownTitle || msg("chart.untitled")), kind: kind ? ` ${kindEmoji(kind)}` : "" }),
    x.artist && msg("chart.artist", { artist: escapeMarkdown(x.artist) }),
    (version || genre) && msg("chart.version", { version: [version, genre].filter(Boolean).join(" / ") }),
    msg("chart.level", {
      diff: diffName ? diffEmoji(diffName) : msg("chart.diffUnknown"),
      level: constant !== null ? constant.toFixed(1) : x.level,
    }).trimEnd(),
    msg("chart.info", { bpm: bpmText(x.chart), length: clock(x.chart.durationMs), measures: x.chart.measures }),
  ].filter(Boolean).join("\n");

  const loss = judgeLoss(s);
  const notes = [
    msg("chart.notes", { total: s.total, dxScore: s.total * 3 }),
    msg("chart.notesBreakdown", { tap: s.tap, hold: s.hold + s.touchHold, slide: s.slide, touch: s.touch, break: s.break }),
    loss.tapGreat > 0 && msg("chart.lossTap", { loss: loss.tapGreat.toFixed(4) }),
    s.break > 0 && msg("chart.lossBreak", { p75: loss.break75.toFixed(4), p50: loss.break50.toFixed(4) }),
  ].filter(Boolean).join("\n");

  // 링크 버튼은 https 일 때만 단다. baseUrl 이 비어 있는 로컬 개발에서는 URL 이
  // http://localhost:... 라 Discord 가 거부할 수 있고, 그러면 응답 전체가 실패한다.
  // 그때는 아래 작은 글씨에 같은 링크를 넣어 기능은 잃지 않는다.
  const linkButton = url.startsWith("https://");
  const foot = [
    preview && msg("chart.previewRange", { from: clock(preview.startMs), sec: Math.round(preview.clipMs / 1000) }),
    x.sourceUrl && sourceCredit(x.sourceUrl, x.designer),
    x.footer,
    x.chart.bpmAssumed && msg("chart.bpmAssumedNote"),
    !linkButton && msg("chart.openLink", { url }),
  ].filter(Boolean).map((l) => `-# ${l}`).join("\n");

  const files: AttachmentBuilder[] = [];
  const container = new ContainerBuilder().setAccentColor(DIFF_COLOR[x.diff] ?? 0x9333ea);
  if (jacket) {
    files.push(new AttachmentBuilder(jacket, { name: "jacket.png" }));
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents((t) => t.setContent(heading))
        .setThumbnailAccessory((t) => t.setURL("attachment://jacket.png")),
    );
  } else {
    container.addTextDisplayComponents((t) => t.setContent(heading));
  }
  container
    .addSeparatorComponents((sp) => sp.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((t) => t.setContent(notes));
  if (mine) {
    container
      .addSeparatorComponents((sp) => sp.setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents((t) => t.setContent(mine));
  }
  if (preview) {
    files.push(new AttachmentBuilder(preview.gif, { name: "preview.gif" }));
    container.addMediaGalleryComponents((g) => g.addItems((it) => it.setURL("attachment://preview.gif")));
  }
  container.addTextDisplayComponents((t) => t.setContent(foot));

  // 풀영상(400px/60fps, 가이드음)을 만들어 캐시하는 버튼. 처음 한 번만 렌더되고
  // 그 뒤로는 캐시로 즉시 나온다.
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Secondary).setCustomId(`chartvid:${x.id}`).setLabel(msg("chart.videoButton")),
  );
  if (linkButton) {
    row.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(url).setLabel(msg("chart.playButton")));
  }
  if (inCatalog) {
    const q = encodeURIComponent(`maimai ${x.title} ${kind} ${diffName ?? ""} 外部出力`.replace(/\s+/g, " ").trim());
    row.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link)
      .setURL(`https://www.youtube.com/results?search_query=${q}`).setLabel(msg("chart.externalButton")));
  }
  container
    .addSeparatorComponents((sp) => sp.setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents(row);

  await interaction.editReply({ components: [container], files, flags: MessageFlags.IsComponentsV2 });
}
