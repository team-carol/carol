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
// 고른 값은 메시지 컴포넌트에만 둔다(선택 메뉴 기본값·버튼 customId).
// customId — 종류 photo:kind:<메뉴 주인>:<대상>, 이용자 photo:user:<메뉴 주인>:<종류>, 만들기 photo:make:<대상>:<종류>.
export const data = new SlashCommandBuilder()
  .setName("사진관")
  .setDescription("프로필·레이팅표·성과 같은 이미지를 한곳에서 만들기");

/** 사진 종류. 다른 리듬게임 환산 레이팅표는 게임 id 를 그대로 쓴다. */
const BASE_KINDS = ["rating", "future", "srating", "profile", "history", "achievement", "stamp", "circle"] as const;
type BaseKind = (typeof BASE_KINDS)[number];
const GAME_KINDS = Object.values(GAMES).filter((g) => g.id !== "maimai");
const DEFAULT_KIND = "profile";

function kindLabel(kind: string): string {
  return isGameId(kind) ? msg("photo.kind.game", { game: GAMES[kind].label }) : msg(`photo.kind.${kind as BaseKind}`);
}

/**
 * 대상이 연동하지 않았어도 메뉴는 띄운다(다른 이용자를 고를 수 있게). 그때는 안내문을 넣고 종류·만들기를 끈다.
 * 대상에게 없는 종류(미래시 버전이 없음, 서클 정보가 없음)는 목록에서 뺀다.
 */
async function buildMenu(targetId: string, ownerId: string, wanted: string = DEFAULT_KIND): Promise<ContainerBuilder> {
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
  // 다른 리듬게임 환산은 맨 아래에.
  const kinds: string[] = [...BASE_KINDS, ...GAME_KINDS.map((g) => g.id)].filter((k) => !unavailable.has(k));
  const kind = kinds.includes(wanted) ? wanted : DEFAULT_KIND;
  const title = cached
    ? msg("photo.title", { name: cached.playerName || "—", user: `<@${targetId}>` })
    : msg("photo.titleNotRegistered", { user: `<@${targetId}>`, notice: await notRegisteredNotice(targetId, self) });

  return new ContainerBuilder()
    .setAccentColor(parseInt(BRAND.accent.slice(1), 16))
    .addTextDisplayComponents((t) => t.setContent(title))
    .addSeparatorComponents((s) => s.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((t) => t.setContent(msg("photo.kindHeading")))
    .addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`photo:kind:${ownerId}:${targetId}`)
          .setPlaceholder(msg("photo.kindPlaceholder"))
          .setDisabled(!cached)
          .addOptions(kinds.map((k) => ({ label: kindLabel(k), value: k, default: k === kind }))),
      ),
    )
    .addTextDisplayComponents((t) => t.setContent(msg("photo.userHeading")))
    .addActionRowComponents(
      new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
        new UserSelectMenuBuilder()
          .setCustomId(`photo:user:${ownerId}:${kind}`)
          .setPlaceholder(msg("photo.userPlaceholder"))
          .setDefaultUsers(targetId),
      ),
    )
    .addSeparatorComponents((s) => s.setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`photo:make:${targetId}:${kind}`)
          .setLabel(msg("photo.make", { kind: kindLabel(kind) }))
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
async function rebuild(i: StringSelectMenuInteraction | UserSelectMenuInteraction, ownerId: string, targetId: string, kind: string): Promise<void> {
  const own = i.user.id === ownerId;
  if (own) await i.deferUpdate();
  else await i.deferReply({ flags: MessageFlags.Ephemeral });
  const menu = await buildMenu(targetId, i.user.id, kind);
  await i.editReply({ components: [menu], flags: MessageFlags.IsComponentsV2 });
}

/** photo: 로 시작하는 버튼·선택 메뉴. */
export async function handleComponent(i: ButtonInteraction | StringSelectMenuInteraction | UserSelectMenuInteraction): Promise<void> {
  const [, action = "", a = "", b = ""] = i.customId.split(":");
  if (i.isUserSelectMenu()) {
    const picked = i.values[0];
    if (!picked) { await i.deferUpdate(); return; }
    await rebuild(i, a, picked, b);
    return;
  }
  if (i.isStringSelectMenu()) {
    if (action === "kind" && i.values[0]) await rebuild(i, a, b, i.values[0]);
    return;
  }
  if (action !== "make") return;
  const [targetId, kind] = [a, b];
  if (isGameId(kind)) {
    await ratingimage.show(i, targetId, kind, "");
    return;
  }
  switch (kind as BaseKind) {
    case "profile": await profile.show(i, targetId, "image"); return;
    case "rating": await ratingimage.show(i, targetId, "maimai", ""); return;
    case "future": await ratingimage.show(i, targetId, "future", ""); return;
    case "srating": await ratingimage.show(i, targetId, "srating", ""); return;
    case "history": await history.show(i, targetId, "all"); return;
    case "achievement": await achievement.show(i, targetId, ""); return;
    case "stamp": await stamp.show(i, targetId); return;
    case "circle": await circle.show(i, targetId, "image"); return;
  }
}
