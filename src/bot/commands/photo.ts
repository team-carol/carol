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
import { GAMES } from "../../games";
import { BRAND } from "../../brand";
import { msg } from "../../messages";
import * as profile from "./profile";
import * as ratingimage from "./ratingimage";
import * as circle from "./circle";
import * as achievement from "./achievement";
import * as stamp from "./stamp";
import * as history from "./history";

// /사진관: maishift 사진관처럼 이미지 명령을 한곳에 모은 메뉴(Components V2 컨테이너).
// 메뉴만 먼저 띄우고, 버튼을 누르면 그때 그 이미지를 만들어 메뉴 아래 새 메시지로 보낸다.
// customId — 버튼 photo:<종류>:<대상 userId>, 다른 게임 환산 photo:game:<대상>, 다른 이용자 photo:user:<메뉴 주인>.
export const data = new SlashCommandBuilder()
  .setName("사진관")
  .setDescription("프로필·레이팅표·성과 같은 이미지를 한곳에서 만들기 (생략 시 본인)")
  .addUserOption((opt) => opt.setName("user").setDescription("조회할 유저 (생략 시 본인)").setRequired(false));

const KINDS = ["profile", "rating", "future", "srating", "history", "achievement", "stamp", "circle"] as const;
type Kind = (typeof KINDS)[number];

async function buildMenu(targetId: string, ownerId: string): Promise<{ error: string } | { container: ContainerBuilder }> {
  const self = targetId === ownerId;
  const friendCode = await getUserFriendCode(targetId);
  const cached = friendCode ? await getCachedProfile(friendCode) : null;
  if (!cached) return { error: await notRegisteredNotice(targetId, self) };
  const link = await getMaishiftLink(targetId);
  // 프로필을 받아 둔 뒤라 요청 없이 알 수 있는 것만으로 못 쓰는 버튼을 끈다.
  const disabled: Partial<Record<Kind, boolean>> = {
    future: !link || maishiftFutureVersion(link) === null,
    circle: !hasCarolSync(cached) || !circleOf(cached),
  };
  const button = (kind: Kind, style = ButtonStyle.Secondary) =>
    new ButtonBuilder().setCustomId(`photo:${kind}:${targetId}`).setLabel(msg(`photo.button.${kind}`)).setStyle(style).setDisabled(!!disabled[kind]);
  const games = Object.values(GAMES).filter((g) => g.id !== "maimai");

  const container = new ContainerBuilder()
    .setAccentColor(parseInt(BRAND.accent.slice(1), 16))
    .addTextDisplayComponents((t) => t.setContent(msg("photo.title", { name: cached.playerName || "—", user: `<@${targetId}>` })))
    .addSeparatorComponents((s) => s.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((t) => t.setContent(msg("photo.photosHeading")))
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(button("profile", ButtonStyle.Primary), button("rating", ButtonStyle.Primary), button("future"), button("srating"), button("history")),
      new ActionRowBuilder<ButtonBuilder>().addComponents(button("achievement"), button("stamp"), button("circle")),
    )
    .addTextDisplayComponents((t) => t.setContent(msg("photo.gameHeading")))
    .addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`photo:game:${targetId}`)
          .setPlaceholder(msg("photo.gamePlaceholder"))
          .addOptions(games.map((g) => ({ label: g.label, value: g.id }))),
      ),
    )
    .addSeparatorComponents((s) => s.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((t) => t.setContent(msg("photo.otherUserHeading")))
    .addActionRowComponents(
      new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
        new UserSelectMenuBuilder()
          .setCustomId(`photo:user:${ownerId}`)
          .setPlaceholder(msg("photo.otherUserPlaceholder"))
          .setDefaultUsers(targetId),
      ),
    );
  return { container };
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser("user") ?? interaction.user;
  const menu = await buildMenu(target.id, interaction.user.id);
  if ("error" in menu) {
    await interaction.reply({ content: menu.error, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.reply({ components: [menu.container], flags: MessageFlags.IsComponentsV2 });
}

/** photo: 로 시작하는 버튼·선택 메뉴. */
export async function handleComponent(i: ButtonInteraction | StringSelectMenuInteraction | UserSelectMenuInteraction): Promise<void> {
  const [, action = "", id = ""] = i.customId.split(":");
  if (i.isUserSelectMenu()) {
    const picked = i.values[0];
    if (!picked) {
      await i.deferUpdate();
      return;
    }
    // 메뉴를 띄운 사람이면 메뉴를 그 이용자의 사진관으로 바꾸고, 다른 사람이면 그 사람에게만 새 메뉴를 보여 준다.
    const own = i.user.id === id;
    if (own) await i.deferUpdate();
    else await i.deferReply({ flags: MessageFlags.Ephemeral });
    const menu = await buildMenu(picked, i.user.id);
    if ("error" in menu) {
      if (own) await i.followUp({ content: menu.error, flags: MessageFlags.Ephemeral });
      else await i.editReply({ content: menu.error });
      return;
    }
    await i.editReply({ components: [menu.container], flags: MessageFlags.IsComponentsV2 });
    return;
  }
  if (i.isStringSelectMenu()) {
    if (action === "game" && i.values[0]) await ratingimage.show(i, id, i.values[0], "");
    return;
  }
  switch (action as Kind) {
    case "profile": await profile.show(i, id, "image"); return;
    case "rating": await ratingimage.show(i, id, "maimai", ""); return;
    case "future": await ratingimage.show(i, id, "future", ""); return;
    case "srating": await ratingimage.show(i, id, "srating", ""); return;
    case "history": await history.show(i, id, "all"); return;
    case "achievement": await achievement.show(i, id, ""); return;
    case "stamp": await stamp.show(i, id); return;
    case "circle": await circle.show(i, id, "image"); return;
  }
}
