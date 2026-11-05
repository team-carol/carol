import {
  SlashCommandBuilder, ChatInputCommandInteraction, AttachmentBuilder, TextDisplayBuilder, MessageFlags,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, SeparatorSpacingSize, StringSelectMenuBuilder, UserSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  type ButtonInteraction, type StringSelectMenuInteraction, type UserSelectMenuInteraction, type ModalSubmitInteraction,
} from "discord.js";
import { getCachedProfile, getUserFriendCode, getTranslateTitles, getCommandPreset, setCommandPreset } from "../../storage";
import { getClearList } from "../utils/embeds";
import {
  getChartsInConstantRange, isIntlAvailable,
  getSongGenre, GENRES, getSongVersionName, VERSION_NAMES, isSongPlus,
  getConstant, regionLatestVersion, type ChartInfo,
} from "../../constants";
import { chartKey } from "../../scraper";
import { msg, type MessageKey } from "../../messages";
import { type Playlist } from "../../maishift/stats";
import { openPlaylist, resolvePlaylistInput, searchPlaylists } from "../../maishift/playlistIndex";
import { titleOf } from "../../maishift/convert";
import { MaishiftError } from "../../maishift/serverFn";
import { maishiftErrorText } from "../utils/notRegistered";
import { versionPositionText } from "../utils/versionPosition";
import { rankIcon, comboIcon } from "../utils/emoji";
import { songContainer, jacketAttachment } from "../utils/songCard";
import { getScoreRank } from "../../games";
import { rerollRow, rerollInPlace, postFromMenu, type V2Payload } from "../utils/reroll";

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 옵션 없이 실행하면 조건 창(본인에게만 보임)이 먼저 뜬다. 고르고 "뽑기" 를 누르면 채널에 결과가 올라간다.
export const data = new SlashCommandBuilder()
  .setName("랜덤")
  .setDescription("조건을 골라 곡을 랜덤 추천 (다시 뽑기·조건 바꾸기 버튼)");

const DIFF_NAME: Record<string, string> = { BASIC: "BASIC", ADVANCED: "ADVANCED", EXPERT: "EXPERT", MASTER: "MASTER", RE_MASTER: "Re:MASTER" };

/** 플레이리스트 보면 → 후보. 그 플레이리스트 지역의 상수(카탈로그에 있으면 그 값)를 쓴다. */
function playlistCharts(list: Playlist): ChartInfo[] {
  const seen = new Set<string>();
  const out: ChartInfo[] = [];
  for (const it of list.items) {
    const title = titleOf(it.title);
    const kind = it.type === "DX" ? "DX" : "ST";
    const diff = DIFF_NAME[it.difficulty] ?? it.difficulty;
    const key = `${title}|${kind}|${diff}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title, kind, diff, level: getConstant(title, kind, diff, list.region === "jp" ? "jp" : "intl") ?? it.internalLevel / 10 });
  }
  return out;
}

/** 플레이리스트 오류 → 안내 문구. */
export function playlistErrorText(e: unknown): string {
  if (e instanceof MaishiftError && (e.kind === "not_found" || e.kind === "private")) return msg("playlist.notFound");
  return maishiftErrorText(e) ?? msg("playlist.unavailable");
}

// ─── 조건(customId 에 담는다) ─────────────────────────────────────────────────
// "<최소×10>.<최대×10>.<S|D>.<난이도 번호>.<장르 번호>.<버전 번호>.<p|b>.<Y|N>.<개수>.<대상>.<플레이리스트>" — 비어 있으면 전체.
// 사용자 id 는 customId 100자 한도 때문에 36진수로 줄인다.
const DIFFS = ["BASIC", "ADVANCED", "EXPERT", "MASTER", "Re:MASTER"];
const MAX_COUNT = 5;
/** 상수 범위 선택 메뉴의 값. 다른 값은 "직접 입력" 으로. */
const CONST_STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5, 15];

export interface RandomState {
  min: number | null;
  max: number | null;
  kind: "" | "ST" | "DX";
  diff: string;
  genre: string;
  version: string;
  /** 버전을 고를 때만: base(무인판)·plus */
  plus: "" | "base" | "plus";
  play: "" | "Y" | "N";
  count: number;
  /** 플레이여부를 볼 유저 */
  target: string;
  playlist: number | null;
  /** 조건 창 버전 목록에서 보여 줄 쪽(옛 버전 / DX 버전). 결과에는 쓰지 않는다. */
  era: "old" | "dx";
}

export const toB36 = (id: string) => BigInt(id).toString(36);
export function fromB36(s: string): string {
  let n = 0n;
  for (const ch of s) {
    const d = parseInt(ch, 36);
    if (Number.isNaN(d)) return "";
    n = n * 36n + BigInt(d);
  }
  return n.toString();
}

export function encodeRandomState(s: RandomState): string {
  const idx = (list: readonly string[], v: string) => (list.includes(v) ? String(list.indexOf(v)) : "");
  const c10 = (v: number | null) => (v === null ? "" : String(Math.round(v * 10)));
  return [
    c10(s.min), c10(s.max), s.kind === "ST" ? "S" : s.kind === "DX" ? "D" : "", idx(DIFFS, s.diff), idx(GENRES, s.genre), idx(VERSION_NAMES, s.version),
    s.plus === "plus" ? "p" : s.plus === "base" ? "b" : "", s.play, String(s.count), toB36(s.target), s.playlist ? String(s.playlist) : "", s.era === "old" ? "o" : "",
  ].join(".");
}

export function decodeRandomState(raw: string): RandomState | null {
  const [mn, mx, ty, df, gn, vr, pl, py, n, tg, plist, era] = raw.split(".");
  const target = fromB36(tg ?? "");
  if (!/^\d{5,25}$/.test(target)) return null;
  const at = <T>(list: readonly T[], v: string | undefined): T | undefined => (v ? list[Number(v)] : undefined);
  const c = (v: string | undefined) => (v && /^\d+$/.test(v) ? Math.min(150, Math.max(10, Number(v))) / 10 : null);
  const version = at(VERSION_NAMES, vr) ?? "";
  return {
    min: c(mn), max: c(mx),
    kind: ty === "S" ? "ST" : ty === "D" ? "DX" : "",
    diff: at(DIFFS, df) ?? "",
    genre: at(GENRES, gn) ?? "",
    version,
    plus: version ? (pl === "p" ? "plus" : "base") : "",
    play: py === "Y" || py === "N" ? py : "",
    count: Math.min(MAX_COUNT, Math.max(1, Number(n) || 3)),
    target,
    playlist: plist && /^\d+$/.test(plist) ? Number(plist) : null,
    // 표시할 버전 목록: 저장한 값, 없으면 고른 버전이 옛 버전일 때 옛 버전
    era: era === "o" || (!era && !!version && VERSION_NAMES.indexOf(version) <= VERSION_NAMES.indexOf("FiNALE")) ? "old" : "dx",
  };
}

function rangeLabel(s: RandomState): string {
  const { min, max } = s;
  if (min === null && max === null) return msg("random.rangeAllLabel");
  if (min !== null && max !== null) return msg("random.rangeLabel", { range: `${min.toFixed(1)}~${max.toFixed(1)}` });
  return msg("random.rangeLabel", { range: min !== null ? `${min.toFixed(1)}↑` : `${(max as number).toFixed(1)}↓` });
}

// ─── 결과 ────────────────────────────────────────────────────────────────────
/** 조건으로 랜덤 결과(Components V2)를 만든다. 보여 줄 수 없으면 안내 문구. */
export async function buildRandom(state: RandomState, ownerId: string): Promise<V2Payload | string> {
  let playlist: Playlist | null = null;
  if (state.playlist) {
    try {
      playlist = await openPlaylist(state.playlist);
    } catch (e) {
      return playlistErrorText(e);
    }
  }
  let lo = state.min ?? 0;
  let hi = state.max ?? 99;
  if (lo > hi) [lo, hi] = [hi, lo];

  // 플레이여부 지정 시에만 프로필(clearJson) 필요
  let clearMap: Map<string, ReturnType<typeof getClearList>[number]> | null = null;
  if (state.play) {
    const fc = await getUserFriendCode(state.target);
    const cached = fc ? await getCachedProfile(fc) : null;
    if (!cached) {
      return state.target === ownerId
        ? msg("random.needProfileForPlayFilter")
        : msg("common.otherNotRegistered", { user: `<@${state.target}>` });
    }
    clearMap = new Map(getClearList(cached).map((r) => [chartKey(r), r]));
  }

  // 후보 = 상수 범위 · 국제판 수록 · 타입/장르/플레이여부 필터. 플레이리스트를 골랐으면 그 목록(지역은 플레이리스트 것).
  // 국제판에 아직 없는 버전(예: 일본판 현행 MAGiCAL)을 고르면 일본판 곡 목록·버전 기준으로 뽑는다(국제판만 보면 늘 0곡이라).
  const jpOnlyVersion = !!state.version && maishiftVersionId(VERSION_NAMES.indexOf(state.version), state.plus === "plus") > (regionLatestVersion("intl") ?? Infinity);
  const versionRegion = jpOnlyVersion ? "jp" : "intl";
  const pool = playlist ? playlistCharts(playlist).filter((c) => c.level >= lo && c.level <= hi) : getChartsInConstantRange(lo, hi);
  const candidates = pool.filter((c) => {
    if (!playlist && !jpOnlyVersion && !isIntlAvailable(c.title, c.kind)) return false;
    if (state.kind && c.kind !== state.kind) return false;
    if (state.diff && c.diff !== state.diff) return false;
    if (state.genre && getSongGenre(c.title) !== state.genre) return false;
    if (state.version && getSongVersionName(c.title, versionRegion, c.kind) !== state.version) return false;
    if (state.version && state.plus && isSongPlus(c.title, versionRegion, c.kind) !== (state.plus === "plus")) return false;
    if (clearMap) {
      // clearJson엔 미플레이(ach=0) 엔트리도 있으므로 달성률 > 0 을 플레이로 판정
      const rec = clearMap.get(`${c.title}|${c.kind}|${c.diff}`);
      const played = !!rec && rec.achievementVal > 0;
      if (state.play === "Y" && !played) return false;
      if (state.play === "N" && played) return false;
    }
    return true;
  });
  if (candidates.length === 0) return msg("random.noMatch");

  const picks = shuffle(candidates).slice(0, state.count);
  const filters = [
    playlist ? msg("random.playlistLabel", { title: playlist.title }) : undefined,
    rangeLabel(state),
    state.kind || undefined,
    state.diff || undefined,
    state.genre || undefined,
    state.version ? state.version + (state.plus === "plus" ? " PLUS" : msg("random.baseSuffix")) : undefined,
  ].filter((s): s is string => !!s);
  const translate = await getTranslateTitles(ownerId);
  // Components V2: 머리글(조건) → 곡마다 컨테이너(곡·난이도·상수, 장르·버전, 내 기록, 재킷, 외부 출력) → 플레이리스트 출처 → 버튼.
  // 곡 하나가 컴포넌트 6개라 5곡 + 머리글·꼬리글·버튼 줄도 한도(40) 안이다.
  const jackets = await Promise.all(picks.map((c, i) => jacketAttachment(c.title, c.kind, `rand${i}.png`)));
  const containers = await Promise.all(picks.map(async (c, i) => {
    const rec = clearMap?.get(`${c.title}|${c.kind}|${c.diff}`);
    // 장르·수록 버전은 있을 때만, 구분자 없이 줄마다 하나(작은 글씨). 버전 정렬 위치(예: 43/79)도 붙인다(/랜덤 후보는 국제판 수록곡).
    const info: string[] = [];
    const genre = getSongGenre(c.title);
    if (genre) info.push(genre);
    // 국제판에 없는 곡은 일본판 버전으로 적는다.
    const songRegion = isIntlAvailable(c.title, c.kind) ? "intl" : "jp";
    const versionName = getSongVersionName(c.title, songRegion, c.kind);
    if (versionName) {
      const base = versionName + (isSongPlus(c.title, songRegion, c.kind) ? " PLUS" : "");
      const position = await versionPositionText(c.title, c.kind, songRegion);
      info.push(position ? msg("searchResult.versionPosition", { version: base, position }) : base);
    }
    const lines = info.map((text) => msg("random.cardInfo", { info: text }));
    if (rec && rec.achievementVal > 0) {
      lines.push(msg("random.cardRecord", { rank: rankIcon(getScoreRank(rec.achievementVal)), achievement: `${rec.achievementVal.toFixed(4)}%`, marks: comboIcon(rec.fc) }).trim());
    }
    return songContainer({ title: c.title, kind: c.kind, diff: c.diff, constant: c.level, translate, lines }, jackets[i]);
  }));
  const header = filters.length ? msg("random.headerFilters", { filters: filters.join("  ✦  ") }) : msg("random.header");
  const footer = playlist
    ? msg("random.footer", { text: `${msg("random.playlistFooter", { owner: playlist.owner.handle, count: playlist.items.length })}  ✦  ${msg("maishift.credit")}` })
    : null;
  return {
    components: [
      new TextDisplayBuilder().setContent(header),
      ...containers,
      ...(footer ? [new TextDisplayBuilder().setContent(footer)] : []),
      rerollRow("rnd", ownerId, encodeRandomState(state)),
    ],
    files: jackets.filter((j): j is AttachmentBuilder => !!j),
    flags: MessageFlags.IsComponentsV2,
  };
}

// ─── 명령 ────────────────────────────────────────────────────────────────────
export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  // 직전에 뽑은 조건이 있으면 그 조건으로 연다(플레이여부를 볼 유저는 늘 본인부터).
  const saved = await getCommandPreset(interaction.user.id, "rnd").catch(() => null);
  const restored = saved ? decodeRandomState(saved) : null;
  const state: RandomState = restored ? { ...restored, target: interaction.user.id } : {
    min: null, max: null, kind: "", diff: "", genre: "", version: "", plus: "", play: "", count: 3,
    target: interaction.user.id, playlist: null, era: "dx",
  };
  await interaction.reply({ components: [await buildRandomMenu(state, interaction.user.id, "-")], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
}

/** 뽑은 조건을 그 사람의 다음 실행 기본값으로 둔다(sessions.command_presets). 실패해도 넘어간다. */
function rememberRandom(ownerId: string, state: RandomState): void {
  setCommandPreset(ownerId, "rnd", encodeRandomState({ ...state, target: ownerId })).catch((e: unknown) => console.warn("[랜덤] 조건 저장 실패:", (e as Error).message));
}

// ─── 조건 창(본인에게만 보임) ─────────────────────────────────────────────────
// customId — 선택 rnd:s:<칸>:<주인>:<결과 메시지>:<조건>, 유저 rnd:u:…, 뽑기 rnd:go:…,
//            상수 직접 입력 창 rnd:mod:<주인>:<결과 메시지>:<조건>, 플레이리스트 번호 입력 창 rnd:pmod:….
// 주인·결과 메시지 id 는 36진수(customId 100자 한도). 결과 메시지 "-" 는 지울 예전 결과가 없음.
type RandomField = "mn" | "mx" | "ty" | "df" | "gn" | "vr" | "py" | "n" | "pl";
const CUSTOM = "custom";
const ERA = "era";
/** FiNALE(옛 버전 마지막)까지가 옛 버전. */
const LAST_OLD_GENERATION = VERSION_NAMES.indexOf("FiNALE");

function rndSelect(field: RandomField, ownerKey: string, msgKey: string, code: string, options: { label: string; value: string; on: boolean }[]): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`rnd:s:${field}:${ownerKey}:${msgKey}:${code}`)
      .addOptions(options.slice(0, 25).map((o) => ({ label: o.label.slice(0, 100), value: o.value, default: o.on }))),
  );
}

/** 상수 선택지는 높은 값부터. */
function constOptions(field: "min" | "max", value: number | null): { label: string; value: string; on: boolean }[] {
  const f = (v: string) => msg("random.menuOption", { field: msg(`random.field.${field}` as MessageKey), value: v });
  const steps = (value !== null && !CONST_STEPS.includes(value) ? [...CONST_STEPS, value] : CONST_STEPS).slice().sort((a, b) => b - a);
  return [
    { label: f(msg("random.valueNone")), value: "-", on: value === null },
    { label: f(msg("random.valueCustom")), value: CUSTOM, on: false },
    ...steps.map((s) => ({ label: f(s.toFixed(1)), value: String(s), on: s === value })),
  ];
}

/**
 * 버전 선택(무인판·PLUS 를 한 목록으로). 선택 메뉴는 25개까지라 옛 버전(maimai~FiNALE)과 DX 버전을 한 번에 하나씩 보여 주고,
 * 맨 아래 항목으로 다른 쪽 목록으로 넘어간다. FiNALE 은 PLUS 가 없다.
 */
/**
 * 세대(VERSION_NAMES 번호)·PLUS → maishift 버전 번호. maishift 는 세대마다 무인판·PLUS 순으로 번호를 매기고 FiNALE 만 하나다
 * (maimai 0, maimai PLUS 1, … FiNALE 12, でらっくす 13, でらっくす PLUS 14, … CiRCLE PLUS 26, MAGiCAL 27).
 */
export function maishiftVersionId(generation: number, plus: boolean): number {
  const base = generation <= LAST_OLD_GENERATION ? generation * 2 : 13 + (generation - LAST_OLD_GENERATION - 1) * 2;
  return base + (plus ? 1 : 0);
}

function versionOptions(state: RandomState): { label: string; value: string; on: boolean }[] {
  const f = (v: string) => msg("random.menuOption", { field: msg("random.field.version"), value: v });
  const old = state.era === "old";
  const out: { label: string; value: string; on: boolean }[] = [{ label: f(msg("random.valueAll")), value: "-", on: !state.version }];
  // 일본판 현행 버전(maishift 버전 목록)보다 뒤인 버전은 아직 없으므로 뺀다(예: MAGiCAL 이 현행이면 MAGiCAL PLUS).
  // 곡 목록을 아직 못 받았으면 모두 보인다.
  const latest = regionLatestVersion("jp") ?? Infinity;
  const exists = (k: number, plus: boolean) => maishiftVersionId(k, plus) <= latest;
  // 최신 버전부터. 같은 세대는 PLUS 가 위.
  VERSION_NAMES.map((name, k) => [name, k] as const).reverse().forEach(([name, k]) => {
    if (old !== (k <= LAST_OLD_GENERATION)) return;
    if (name !== "FiNALE" && exists(k, true)) out.push({ label: f(`${name} PLUS`), value: `${k}.p`, on: state.version === name && state.plus === "plus" });
    if (exists(k, false)) out.push({ label: f(name), value: `${k}.b`, on: state.version === name && state.plus !== "plus" });
  });
  out.push({ label: old ? msg("random.versionToDx") : msg("random.versionToOld"), value: ERA, on: false });
  return out;
}

export async function buildRandomMenu(state: RandomState, ownerId: string, msgId: string): Promise<ContainerBuilder> {
  const code = encodeRandomState(state);
  const ownerKey = toB36(ownerId);
  const msgKey = msgId === "-" ? "-" : toB36(msgId);
  const f = (field: string, value: string) => msg("random.menuOption", { field: msg(`random.field.${field}` as MessageKey), value });
  const all = msg("random.valueAll");
  const sel = (field: RandomField, options: { label: string; value: string; on: boolean }[]) => rndSelect(field, ownerKey, msgKey, code, options);
  const known = await searchPlaylists("", 22).catch(() => []);
  const playlists = known.map((p) => ({ label: f("playlist", `${p.title} — ${p.owner}`), value: String(p.id), on: p.id === state.playlist }));
  if (state.playlist && !known.some((p) => p.id === state.playlist)) playlists.push({ label: f("playlist", `#${state.playlist}`), value: String(state.playlist), on: true });

  const rows = [
    sel("mx", constOptions("max", state.max)),
    sel("mn", constOptions("min", state.min)),
    sel("ty", [
      { label: f("kind", all), value: "-", on: !state.kind },
      { label: f("kind", "STANDARD"), value: "ST", on: state.kind === "ST" },
      { label: f("kind", "DX"), value: "DX", on: state.kind === "DX" },
    ]),
    sel("df", [{ label: f("diff", all), value: "-", on: !state.diff }, ...DIFFS.map((d) => ({ label: f("diff", d), value: d, on: d === state.diff }))]),
    sel("gn", [{ label: f("genre", all), value: "-", on: !state.genre }, ...GENRES.map((g) => ({ label: f("genre", g), value: String(GENRES.indexOf(g)), on: g === state.genre }))]),
    sel("vr", versionOptions(state)),
    sel("py", [
      { label: f("play", all), value: "-", on: !state.play },
      { label: f("play", msg("random.valuePlayed")), value: "Y", on: state.play === "Y" },
      { label: f("play", msg("random.valueUnplayed")), value: "N", on: state.play === "N" },
    ]),
    sel("n", Array.from({ length: MAX_COUNT }, (_, k) => k + 1).map((n) => ({ label: f("count", msg("random.countValue", { count: n })), value: String(n), on: n === state.count }))),
    sel("pl", [
      { label: f("playlist", msg("random.valueNone")), value: "-", on: !state.playlist },
      { label: f("playlist", msg("random.valuePlaylistInput")), value: CUSTOM, on: false },
      ...playlists,
    ]),
  ];
  const container = new ContainerBuilder()
    .setAccentColor(0x9333ea)
    .addTextDisplayComponents((t) => t.setContent(msg("random.menuTitle")))
    .addSeparatorComponents((s) => s.setSpacing(SeparatorSpacingSize.Small));
  for (const row of rows) container.addActionRowComponents(row);
  // 플레이여부를 고르면 누구의 기록으로 볼지
  if (state.play) {
    container
      .addTextDisplayComponents((t) => t.setContent(msg("random.menuUserHeading")))
      .addActionRowComponents(
        new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
          new UserSelectMenuBuilder().setCustomId(`rnd:u:${ownerKey}:${msgKey}:${code}`).setDefaultUsers(state.target),
        ),
      );
  }
  return container
    .addSeparatorComponents((s) => s.setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`rnd:go:${ownerKey}:${msgKey}:${code}`).setLabel(msg("random.menuGo")).setStyle(ButtonStyle.Primary),
      ),
    );
}

function constModal(customId: string, state: RandomState): ModalBuilder {
  const input = (id: string, label: string, value: number | null) => new ActionRowBuilder<TextInputBuilder>().addComponents(
    new TextInputBuilder().setCustomId(id).setLabel(label).setPlaceholder("13.7").setStyle(TextInputStyle.Short).setMaxLength(5).setRequired(false)
      .setValue(value !== null ? value.toFixed(1) : ""),
  );
  return new ModalBuilder().setCustomId(customId).setTitle(msg("random.modalTitle"))
    .addComponents(input("max", msg("random.field.max"), state.max), input("min", msg("random.field.min"), state.min));
}

function playlistModal(customId: string): ModalBuilder {
  return new ModalBuilder().setCustomId(customId).setTitle(msg("random.playlistModalTitle")).addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId("playlist").setLabel(msg("random.playlistModalLabel")).setPlaceholder("https://maimai.shiftpsh.com/playlists/1")
        .setStyle(TextInputStyle.Short).setMaxLength(200).setRequired(true),
    ),
  );
}

/** rnd: 로 시작하는 버튼·선택 메뉴. */
export async function handleComponent(i: ButtonInteraction | StringSelectMenuInteraction | UserSelectMenuInteraction): Promise<void> {
  const parts = i.customId.split(":");
  const action = parts[1];
  if (i.isButton() && (action === "re" || action === "menu")) {
    const [, , ownerId = "", raw = ""] = parts;
    const state = decodeRandomState(raw);
    if (!state) { await i.reply({ content: msg("reroll.expired"), flags: MessageFlags.Ephemeral }); return; }
    if (action === "re") {
      if (i.user.id === ownerId) rememberRandom(ownerId, state);
      await rerollInPlace(i, ownerId, () => buildRandom(state, ownerId));
      return;
    }
    const msgId = i.user.id === ownerId ? i.message.id : "-";
    await i.reply({ components: [await buildRandomMenu(state, i.user.id, msgId)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    return;
  }
  // 조건 창 안의 컴포넌트: 주인·결과 메시지는 36진수
  const ids = (ownerKey: string, msgKey: string) => ({ ownerId: fromB36(ownerKey), msgId: msgKey === "-" ? "-" : fromB36(msgKey) });
  if (i.isStringSelectMenu() && action === "s") {
    const [, , field, ownerKey = "", msgKey = "-", raw = ""] = parts;
    const state = decodeRandomState(raw);
    const value = i.values[0];
    if (!state || value === undefined) { await i.deferUpdate(); return; }
    const { ownerId, msgId } = ids(ownerKey, msgKey);
    if ((field === "mn" || field === "mx") && value === CUSTOM) {
      await i.showModal(constModal(`rnd:mod:${ownerKey}:${msgKey}:${raw}`, state));
      return;
    }
    if (field === "pl" && value === CUSTOM) {
      await i.showModal(playlistModal(`rnd:pmod:${ownerKey}:${msgKey}:${raw}`));
      return;
    }
    const v = value === "-" ? "" : value;
    switch (field as RandomField) {
      case "mn": state.min = v ? Number(v) : null; break;
      case "mx": state.max = v ? Number(v) : null; break;
      case "ty": state.kind = v === "ST" || v === "DX" ? v : ""; break;
      case "df": state.diff = v; break;
      case "gn": state.genre = v ? GENRES[Number(v)] ?? "" : ""; break;
      case "vr": {
        if (v === ERA) { state.era = state.era === "old" ? "dx" : "old"; break; }
        const [k, p] = v.split(".");
        state.version = v ? VERSION_NAMES[Number(k)] ?? "" : "";
        state.plus = state.version ? (p === "p" ? "plus" : "base") : "";
        break;
      }
      case "py": state.play = v === "Y" || v === "N" ? v : ""; break;
      case "n": state.count = Math.min(MAX_COUNT, Math.max(1, Number(v) || 3)); break;
      case "pl": state.playlist = v ? Number(v) : null; break;
    }
    await i.update({ components: [await buildRandomMenu(state, ownerId, msgId)], flags: MessageFlags.IsComponentsV2 });
    return;
  }
  if (i.isUserSelectMenu() && action === "u") {
    const [, , ownerKey = "", msgKey = "-", raw = ""] = parts;
    const state = decodeRandomState(raw);
    const picked = i.values[0];
    if (!state || !picked) { await i.deferUpdate(); return; }
    const { ownerId, msgId } = ids(ownerKey, msgKey);
    state.target = picked;
    await i.update({ components: [await buildRandomMenu(state, ownerId, msgId)], flags: MessageFlags.IsComponentsV2 });
    return;
  }
  if (i.isButton() && action === "go") {
    const [, , ownerKey = "", msgKey = "-", raw = ""] = parts;
    const state = decodeRandomState(raw);
    if (!state) { await i.reply({ content: msg("reroll.expired"), flags: MessageFlags.Ephemeral }); return; }
    const { ownerId, msgId } = ids(ownerKey, msgKey);
    rememberRandom(ownerId, state);
    const sent = await postFromMenu(i, msgId, () => buildRandom(state, ownerId));
    if (sent) await i.editReply({ components: [await buildRandomMenu(state, ownerId, sent)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
  }
}

/** 조건 창의 입력 창: 상수 범위(rnd:mod:…), 플레이리스트 번호·주소(rnd:pmod:…). */
export async function handleModal(i: ModalSubmitInteraction): Promise<void> {
  const [, kind = "", ownerKey = "", msgKey = "-", raw = ""] = i.customId.split(":");
  const state = decodeRandomState(raw);
  if (!state) { await i.reply({ content: msg("reroll.expired"), flags: MessageFlags.Ephemeral }); return; }
  if (kind === "pmod") {
    const id = await resolvePlaylistInput(i.fields.getTextInputValue("playlist"));
    if (!id) { await i.reply({ content: msg("playlist.badId"), flags: MessageFlags.Ephemeral }); return; }
    try {
      await openPlaylist(id); // 있는 공개 목록인지 확인하고 이름을 기억해 둔다(다음부터 목록에 나온다).
    } catch (e) {
      await i.reply({ content: playlistErrorText(e), flags: MessageFlags.Ephemeral });
      return;
    }
    state.playlist = id;
  } else {
    const read = (id: string): number | null | undefined => {
      const t = i.fields.getTextInputValue(id).trim();
      if (!t) return null;
      const n = Number(t);
      return Number.isFinite(n) && n >= 1 && n <= 15 ? Math.round(n * 10) / 10 : undefined;
    };
    const min = read("min"), max = read("max");
    if (min === undefined || max === undefined) {
      await i.reply({ content: msg("random.badConstant"), flags: MessageFlags.Ephemeral });
      return;
    }
    state.min = min;
    state.max = max;
  }
  const ownerId = fromB36(ownerKey);
  const msgId = msgKey === "-" ? "-" : fromB36(msgKey);
  if (i.isFromMessage()) {
    await i.update({ components: [await buildRandomMenu(state, ownerId, msgId)], flags: MessageFlags.IsComponentsV2 });
  } else {
    await i.reply({ components: [await buildRandomMenu(state, ownerId, msgId)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
  }
}
