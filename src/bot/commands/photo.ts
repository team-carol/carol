import {
  SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags,
  ContainerBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, UserSelectMenuBuilder, SeparatorSpacingSize,
  type ButtonInteraction, type StringSelectMenuInteraction, type UserSelectMenuInteraction,
} from "discord.js";
import { getCachedProfile, getUserFriendCode, getMaishiftLink } from "../../storage";
import { maishiftFutureVersion } from "../../maishift";
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
// 사진 종류와 이용자를 고르고 맨 아래 버튼을 누르면 그때 이미지를 만들어 메뉴 아래 새 메시지로 보낸다.
// 레이팅표를 고르면 그 아래에 레이팅 종류(maimai DX·미래시·S-레이팅·다른 게임 변환) 선택 메뉴가 생긴다.
// 고른 값은 메시지 컴포넌트에만 둔다(선택 메뉴 기본값·customId). <선택> 은 "<종류>.<레이팅 종류>".
// customId — 종류 photo:kind:<메뉴 주인>:<대상>:<선택>, 레이팅 종류 photo:rtype:<메뉴 주인>:<대상>:<선택>,
//            이용자 photo:user:<메뉴 주인>:<선택>, 만들기 photo:make:<대상>:<선택>.
export const data = new SlashCommandBuilder()
  .setName("사진관")
  .setDescription("프로필·레이팅표·성과 같은 이미지를 한곳에서 만들기");

const KINDS = ["rating", "profile", "history", "achievement", "stamp", "circle"] as const;
type Kind = (typeof KINDS)[number];
/** 레이팅표 종류. 다른 리듬게임 변환은 게임 id 를 그대로 쓴다(/레이팅표 type 옵션 값과 같다). */
const RATING_TYPES = ["maimai", "future", "srating", ...Object.values(GAMES).filter((g) => g.id !== "maimai").map((g) => g.id)];
interface Selection { kind: string; rtype: string }
const DEFAULT: Selection = { kind: "profile", rtype: "maimai" };

const encode = (sel: Selection) => `${sel.kind}.${sel.rtype}`;
function decode(raw: string): Selection {
  const [kind = DEFAULT.kind, rtype = DEFAULT.rtype] = raw.split(".");
  return { kind, rtype };
}

function ratingTypeLabel(rtype: string): string {
  if (rtype === "future" || rtype === "srating" || rtype === "maimai") return msg(`photo.ratingType.${rtype}`);
  return isGameId(rtype) ? msg("photo.ratingType.game", { game: GAMES[rtype].label }) : rtype;
}

/**
 * 대상이 연동하지 않았어도 메뉴는 띄운다(다른 이용자를 고를 수 있게). 그때는 안내문을 넣고 종류·만들기를 끈다.
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
  const sel: Selection = {
    kind: (kinds as readonly string[]).includes(wanted.kind) ? wanted.kind : DEFAULT.kind,
    rtype: rtypes.includes(wanted.rtype) ? wanted.rtype : DEFAULT.rtype,
  };
  const title = cached
    ? msg("photo.title", { name: cached.playerName || "—", user: `<@${targetId}>` })
    : msg("photo.titleNotRegistered", { user: `<@${targetId}>`, notice: await notRegisteredNotice(targetId, self) });

  const container = new ContainerBuilder()
    .setAccentColor(parseInt(BRAND.accent.slice(1), 16))
    .addTextDisplayComponents((t) => t.setContent(title))
    .addSeparatorComponents((s) => s.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((t) => t.setContent(msg("photo.kindHeading")))
    .addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`photo:kind:${ownerId}:${targetId}:${encode(sel)}`)
          .setPlaceholder(msg("photo.kindPlaceholder"))
          .setDisabled(!cached)
          .addOptions(kinds.map((k) => ({ label: msg(`photo.kind.${k}`), value: k, default: k === sel.kind }))),
      ),
    );
  if (cached && sel.kind === "rating") {
    container
      .addTextDisplayComponents((t) => t.setContent(msg("photo.ratingTypeHeading")))
      .addActionRowComponents(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`photo:rtype:${ownerId}:${targetId}:${encode(sel)}`)
            .addOptions(rtypes.map((t) => ({ label: ratingTypeLabel(t), value: t, default: t === sel.rtype }))),
        ),
      );
  }
  return container
    .addTextDisplayComponents((t) => t.setContent(msg("photo.userHeading")))
    .addActionRowComponents(
      new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
        new UserSelectMenuBuilder()
          .setCustomId(`photo:user:${ownerId}:${encode(sel)}`)
          .setPlaceholder(msg("photo.userPlaceholder"))
          .setDefaultUsers(targetId),
      ),
    )
    .addSeparatorComponents((s) => s.setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`photo:make:${targetId}:${encode(sel)}`)
          .setLabel(msg("photo.make", { kind: msg(`photo.kind.${sel.kind as Kind}`) }))
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
async function rebuild(i: StringSelectMenuInteraction | UserSelectMenuInteraction, ownerId: string, targetId: string, sel: Selection): Promise<void> {
  const own = i.user.id === ownerId;
  if (own) await i.deferUpdate();
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
    if (!value) return;
    const sel = decode(c);
    if (action === "kind") await rebuild(i, a, b, { ...sel, kind: value });
    else if (action === "rtype") await rebuild(i, a, b, { ...sel, rtype: value });
    return;
  }
  if (action !== "make") return;
  const targetId = a;
  const sel = decode(b);
  switch (sel.kind as Kind) {
    case "rating": await ratingimage.show(i, targetId, sel.rtype, ""); return;
    case "profile": await profile.show(i, targetId, "image"); return;
    case "history": await history.show(i, targetId, "all"); return;
    case "achievement": await achievement.show(i, targetId, ""); return;
    case "stamp": await stamp.show(i, targetId); return;
    case "circle": await circle.show(i, targetId, "image"); return;
  }
}
