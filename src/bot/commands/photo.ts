import {
  SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags,
  ContainerBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, UserSelectMenuBuilder, SeparatorSpacingSize,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  type ButtonInteraction, type StringSelectMenuInteraction, type UserSelectMenuInteraction, type ModalSubmitInteraction,
} from "discord.js";
import { getCachedProfile, getUserFriendCode, getMaishiftLink, getAchievementPlayEventLog, achievementProfileKeys } from "../../storage";
import { maishiftFutureVersion, getMaishiftUploadDays } from "../../maishift";
import { koreaPlayDayKey } from "../../achievements";
import { HISTORY_PERIODS } from "../../ratingHistory";
import { hasCarolSync } from "../utils/syncExtras";
import { circleOf } from "../utils/circle";
import { notRegisteredNotice } from "../utils/notRegistered";
import { GAMES, isGameId } from "../../games";
import { BRAND } from "../../brand";
import { msg } from "../../messages";
import * as profile from "./profile";
import * as ratingimage from "./ratingimage";
import * as circle from "./circle";
import * as achievement from "./achievement";
import * as stamp from "./stamp";
import * as history from "./history";

// /사진관: maishift 사진관처럼 이미지 명령을 한곳에 모은 메뉴(Components V2 컨테이너).
// 사진 종류와 유저를 고르고 맨 아래 버튼을 누르면 그때 이미지를 만들어 메뉴 아래 새 메시지로 보낸다.
// 명령어에 있던 추가 옵션은 사진 종류에 따라 그 아래에 선택 메뉴로 생긴다:
//   레이팅표 — 레이팅 종류(maimai DX·미래시·S-레이팅·다른 게임 변환), 날짜(maimai DX·S-레이팅만, maishift 업로드한 날)
//   프로필·서클 — 형식(이미지·임베드) / 히스토리 — 기간 / 성과 — 날짜(성과가 있는 날)
// 날짜 선택 메뉴의 "직접 입력"을 고르면 입력 창(모달)이 뜬다(메시지에는 텍스트 입력을 넣을 수 없다).
// 고른 값은 메시지 컴포넌트에만 둔다. <선택> 은 "<종류>.<옵션1>.<옵션2>" 이고, 종류를 바꾸면 옵션은 그 종류의 기본값으로.
// customId — 종류 photo:kind:<주인>:<대상>:<선택>, 옵션 photo:o1|o2:<주인>:<대상>:<선택>, 날짜 입력 창 photo:date:<주인>:<대상>:<선택>:<o1|o2>,
//            유저 photo:user:<주인>:<선택>, 만들기 photo:make:<대상>:<선택>.
export const data = new SlashCommandBuilder()
  .setName("사진관")
  .setDescription("프로필·레이팅표·성과 같은 이미지를 한곳에서 만들기");

const KINDS = ["rating", "profile", "history", "achievement", "stamp", "circle"] as const;
type Kind = (typeof KINDS)[number];
/** 레이팅표 종류. 다른 리듬게임 변환은 게임 id 를 그대로 쓴다(/레이팅표 type 옵션 값과 같다). */
const RATING_TYPES = ["maimai", "future", "srating", ...Object.values(GAMES).filter((g) => g.id !== "maimai").map((g) => g.id)];
/** 과거 날짜를 볼 수 있는 레이팅 종류(maishift 이전 기록이 주는 것). */
const DATED_RATING_TYPES = ["maimai", "srating"];
const FORMATS = ["image", "embed"];
/** 종류마다 옵션 기본값. 날짜는 "" 이 최신(레이팅표)·오늘(성과). */
const DEFAULT_OPTS: Record<Kind, [string, string]> = {
  rating: ["maimai", ""], profile: ["image", ""], circle: ["image", ""], history: ["all", ""], achievement: ["", ""], stamp: ["", ""],
};
const DATE_INPUT = "input";
/** 날짜 선택 메뉴의 첫 항목(최신·오늘). 선택 메뉴 값은 비울 수 없어서 따로 둔다. 선택에는 "" 로 담는다. */
const DATE_NOW = "now";
/** 선택 메뉴 항목은 25개까지. 날짜 목록은 첫 항목(최신·오늘)·직접 입력·지금 고른 날짜 몫을 빼고 이만큼. */
const MAX_DAYS = 22;
const ACHIEVEMENT_DAYS_LOOKBACK_MS = 180 * 24 * 60 * 60 * 1000;

interface Selection { kind: Kind; o1: string; o2: string }
const DEFAULT: Selection = { kind: "profile", o1: "image", o2: "" };

const encode = (sel: Selection) => `${sel.kind}.${sel.o1}.${sel.o2}`;
function decode(raw: string): Selection {
  const [kind = "", o1 = "", o2 = ""] = raw.split(".");
  return (KINDS as readonly string[]).includes(kind) ? { kind: kind as Kind, o1, o2 } : DEFAULT;
}
const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

function ratingTypeLabel(rtype: string): string {
  if (rtype === "future" || rtype === "srating" || rtype === "maimai") return msg(`photo.ratingType.${rtype}`);
  return isGameId(rtype) ? msg("photo.ratingType.game", { game: GAMES[rtype].label }) : rtype;
}

/** 그 유저의 성과가 있는 날(오전 4시 기준, 최근 순). 성과 화면처럼 의미 있는 기록만 본다. */
async function achievementDays(userId: string): Promise<string[]> {
  const keys = await achievementProfileKeys(userId);
  const from = Date.now() - ACHIEVEMENT_DAYS_LOOKBACK_MS;
  const events = (await Promise.all(keys.map((k) => getAchievementPlayEventLog(k, from)))).flat()
    .filter((e: { isBaseline: number; isMeaningful: number }) => e.isBaseline === 0 && e.isMeaningful === 1);
  return [...new Set(events.map((e: { playedAt: number }) => koreaPlayDayKey(new Date(e.playedAt))))].sort().reverse();
}

type OptionRow = { heading: string; slot: "o1" | "o2"; options: { label: string; value: string }[]; value: string };

/** 날짜 선택 메뉴: 첫 항목(최신·오늘) + 날짜들 + 직접 입력. 직접 입력한 날짜가 목록에 없으면 넣어 둔다. */
function dateRow(heading: string, slot: "o1" | "o2", firstLabel: string, days: string[], value: string): OptionRow {
  const list = days.slice(0, MAX_DAYS);
  if (value && !list.includes(value)) list.push(value);
  list.sort().reverse();
  return {
    heading, slot, value: value || DATE_NOW,
    options: [{ label: firstLabel, value: DATE_NOW }, ...list.map((d) => ({ label: d, value: d })), { label: msg("photo.dateInput"), value: DATE_INPUT }],
  };
}

/**
 * 대상이 연동하지 않았어도 메뉴는 띄운다(다른 유저를 고를 수 있게). 그때는 안내문을 넣고 종류·만들기를 끈다.
 * 대상에게 없는 것(미래시 버전이 없음, 서클 정보가 없음)은 목록에서 뺀다.
 */
async function buildMenu(targetId: string, ownerId: string, wanted: Selection = DEFAULT): Promise<ContainerBuilder> {
  const self = targetId === ownerId;
  const friendCode = await getUserFriendCode(targetId);
  const cached = friendCode ? await getCachedProfile(friendCode).catch(() => null) : null;
  const link = cached ? await getMaishiftLink(targetId) : null;
  const unavailable = new Set<string>();
  if (cached) {
    // 프로필을 받아 둔 뒤라 요청 없이 알 수 있는 것만 본다.
    if (!link || maishiftFutureVersion(link) === null) unavailable.add("future");
    if (!hasCarolSync(cached) || !circleOf(cached)) unavailable.add("circle");
  }
  const kinds = KINDS.filter((k) => !unavailable.has(k));
  const rtypes = RATING_TYPES.filter((t) => !unavailable.has(t));
  const sel: Selection = kinds.includes(wanted.kind) ? { ...wanted } : DEFAULT;

  // 종류별 옵션 선택 메뉴. 고른 값이 목록에 없으면 기본값으로.
  const rows: OptionRow[] = [];
  if (cached) {
    if (sel.kind === "rating") {
      if (!rtypes.includes(sel.o1)) sel.o1 = "maimai";
      rows.push({ heading: msg("photo.ratingTypeHeading"), slot: "o1", value: sel.o1, options: rtypes.map((t) => ({ label: ratingTypeLabel(t), value: t })) });
      // 과거 날짜는 maishift 이전 기록을 공개했을 때만. 업로드 목록은 maishift 에 한 번 묻는다(5분 캐시).
      const days = DATED_RATING_TYPES.includes(sel.o1) && link ? await getMaishiftUploadDays(link).catch(() => null) : null;
      if (days) rows.push(dateRow(msg("photo.dateHeading"), "o2", msg("photo.dateLatest"), days, isDay(sel.o2) ? sel.o2 : ""));
      if (!days || !isDay(sel.o2)) sel.o2 = "";
    } else if (sel.kind === "profile" || sel.kind === "circle") {
      if (!FORMATS.includes(sel.o1)) sel.o1 = "image";
      rows.push({ heading: msg("photo.formatHeading"), slot: "o1", value: sel.o1, options: FORMATS.map((f) => ({ label: msg(`photo.format.${f as "image" | "embed"}`), value: f })) });
    } else if (sel.kind === "history") {
      if (!(HISTORY_PERIODS as readonly string[]).includes(sel.o1)) sel.o1 = "all";
      rows.push({ heading: msg("photo.periodHeading"), slot: "o1", value: sel.o1, options: HISTORY_PERIODS.map((p) => ({ label: msg(`history.period.${p}`), value: p })) });
    } else if (sel.kind === "achievement") {
      // 다른 사람의 성과는 maishift 이전 기록을 공개했을 때만 보이므로 날짜 목록도 그때만.
      if (self || cached.maishiftPastPublic !== false) {
        const days = await achievementDays(targetId).catch(() => [] as string[]);
        const today = koreaPlayDayKey(new Date());
        if (!isDay(sel.o1) || sel.o1 === today) sel.o1 = "";
        rows.push(dateRow(msg("photo.dateHeading"), "o1", msg("photo.dateToday"), days.filter((d) => d !== today), sel.o1));
      } else sel.o1 = "";
    }
  }
  const title = cached
    ? msg("photo.title", { name: cached.playerName || "—", user: `<@${targetId}>` })
    : msg("photo.titleNotRegistered", { user: `<@${targetId}>`, notice: await notRegisteredNotice(targetId, self) });
  const code = encode(sel);

  const container = new ContainerBuilder()
    .setAccentColor(parseInt(BRAND.accent.slice(1), 16))
    .addTextDisplayComponents((t) => t.setContent(title))
    .addSeparatorComponents((s) => s.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((t) => t.setContent(msg("photo.kindHeading")))
    .addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`photo:kind:${ownerId}:${targetId}:${code}`)
          .setPlaceholder(msg("photo.kindPlaceholder"))
          .setDisabled(!cached)
          .addOptions(kinds.map((k) => ({ label: msg(`photo.kind.${k}`), value: k, default: k === sel.kind }))),
      ),
    )
    .addSeparatorComponents((s) => s.setSpacing(SeparatorSpacingSize.Small));
  for (const row of rows) {
    container
      .addTextDisplayComponents((t) => t.setContent(row.heading))
      .addActionRowComponents(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`photo:${row.slot}:${ownerId}:${targetId}:${code}`)
            .addOptions(row.options.map((o) => ({ ...o, default: o.value === row.value }))),
        ),
      );
  }
  return container
    .addTextDisplayComponents((t) => t.setContent(msg("photo.userHeading")))
    .addActionRowComponents(
      new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
        new UserSelectMenuBuilder()
          .setCustomId(`photo:user:${ownerId}:${code}`)
          .setPlaceholder(msg("photo.userPlaceholder"))
          .setDefaultUsers(targetId),
      ),
    )
    .addSeparatorComponents((s) => s.setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`photo:make:${targetId}:${code}`)
          .setLabel(msg("photo.make", { kind: msg(`photo.kind.${sel.kind}`) }))
          .setStyle(ButtonStyle.Primary)
          .setDisabled(!cached),
      ),
    );
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const menu = await buildMenu(interaction.user.id, interaction.user.id);
  await interaction.reply({ components: [menu], flags: MessageFlags.IsComponentsV2 });
}

/**
 * 메뉴 주인이 고르면 메뉴를 고치고, 다른 사람이 고르면 공개 메뉴는 두고 그 사람에게만 새 메뉴를 보여 준다.
 */
async function rebuild(
  i: StringSelectMenuInteraction | UserSelectMenuInteraction | ModalSubmitInteraction,
  ownerId: string, targetId: string, sel: Selection,
): Promise<void> {
  const own = i.user.id === ownerId && (!i.isModalSubmit() || i.isFromMessage());
  if (own) await (i as StringSelectMenuInteraction).deferUpdate();
  else await i.deferReply({ flags: MessageFlags.Ephemeral });
  const menu = await buildMenu(targetId, i.user.id, sel);
  await i.editReply({ components: [menu], flags: MessageFlags.IsComponentsV2 });
}

/** photo: 로 시작하는 버튼·선택 메뉴. */
export async function handleComponent(i: ButtonInteraction | StringSelectMenuInteraction | UserSelectMenuInteraction): Promise<void> {
  const [, action = "", a = "", b = "", c = ""] = i.customId.split(":");
  if (i.isUserSelectMenu()) {
    const picked = i.values[0];
    if (!picked) { await i.deferUpdate(); return; }
    await rebuild(i, a, picked, decode(b));
    return;
  }
  if (i.isStringSelectMenu()) {
    const value = i.values[0];
    if (value === undefined) return;
    const sel = decode(c);
    if (action === "kind") {
      const kind = decode(`${value}..`).kind;
      // 종류를 바꾸면 옵션은 그 종류의 기본값으로.
      const [o1, o2] = kind === sel.kind ? [sel.o1, sel.o2] : DEFAULT_OPTS[kind];
      await rebuild(i, a, b, { kind, o1, o2 });
    } else if (action === "o1" || action === "o2") {
      if (value === DATE_INPUT) {
        await i.showModal(dateModal(`photo:date:${a}:${b}:${c}:${action}`));
        return;
      }
      await rebuild(i, a, b, { ...sel, [action]: value === DATE_NOW ? "" : value });
    }
    return;
  }
  if (action !== "make") return;
  const targetId = a;
  const sel = decode(b);
  switch (sel.kind) {
    case "rating": await ratingimage.show(i, targetId, sel.o1 || "maimai", sel.o2); return;
    case "profile": await profile.show(i, targetId, sel.o1 === "embed" ? "embed" : "image"); return;
    case "circle": await circle.show(i, targetId, sel.o1 === "embed" ? "embed" : "image"); return;
    case "history": await history.show(i, targetId, (HISTORY_PERIODS as readonly string[]).includes(sel.o1) ? sel.o1 as (typeof HISTORY_PERIODS)[number] : "all"); return;
    case "achievement": await achievement.show(i, targetId, sel.o1); return;
    case "stamp": await stamp.show(i, targetId); return;
  }
}

function dateModal(customId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(msg("photo.dateModalTitle"))
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("date")
          .setLabel(msg("photo.dateModalLabel"))
          .setPlaceholder("2026-09-03")
          .setStyle(TextInputStyle.Short)
          .setMinLength(10)
          .setMaxLength(10)
          .setRequired(true),
      ),
    );
}

/** 날짜 직접 입력 창(photo:date:<주인>:<대상>:<선택>:<o1|o2>). */
export async function handleModal(i: ModalSubmitInteraction): Promise<void> {
  const [, , ownerId = "", targetId = "", raw = "", slot = ""] = i.customId.split(":");
  const day = i.fields.getTextInputValue("date").trim();
  if (!isDay(day) || Number.isNaN(Date.parse(day))) {
    await i.reply({ content: msg("ratingImage.snapshotBadDate"), flags: MessageFlags.Ephemeral });
    return;
  }
  if (slot !== "o1" && slot !== "o2") return;
  await rebuild(i, ownerId, targetId, { ...decode(raw), [slot]: day });
}
