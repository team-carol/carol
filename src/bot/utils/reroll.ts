/**
 * /곡추천·/랜덤 결과의 "다시 뽑기"·"조건 바꾸기" 공통 처리.
 * - 결과 메시지 아래 버튼 줄: <prefix>:re:<주인>:<조건>(다시 뽑기), <prefix>:menu:<주인>:<조건>(조건 바꾸기 창 열기).
 * - 다시 뽑기는 주인만: 같은 조건으로 새로 뽑아 채널에 올리고 원래 메시지는 지운다(채널 아래에 새로 나타나게).
 * - 조건 창(본인에게만 보임)의 뽑기 버튼도 새 결과를 올리고, 그 창을 연 결과 메시지(주인 것일 때만)를 지운다.
 * - 뽑는 동안은 누른 버튼을 "뽑는 중…" 으로 바꿔 끈다(바로 응답하면 디스코드의 로딩 표시가 먼저 사라져 멈춘 것처럼 보이므로).
 * 조건은 메시지 컴포넌트(customId)에만 둔다(봇을 다시 켜도 버튼이 그대로 동작하게).
 */
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ComponentType,
  type APIMessageTopLevelComponent, type AttachmentBuilder, type ButtonInteraction, type ContainerBuilder, type TextDisplayBuilder,
} from "discord.js";
import { msg } from "../../messages";

export interface V2Payload {
  components: (ContainerBuilder | TextDisplayBuilder | ActionRowBuilder<ButtonBuilder>)[];
  files: AttachmentBuilder[];
  flags: MessageFlags.IsComponentsV2;
}

/** 결과 메시지 맨 아래 버튼 줄. */
export function rerollRow(prefix: string, ownerId: string, state: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`${prefix}:re:${ownerId}:${state}`).setLabel(msg("reroll.again")).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`${prefix}:menu:${ownerId}:${state}`).setLabel(msg("reroll.change")).setStyle(ButtonStyle.Secondary),
  );
}

/** 지금 메시지의 컴포넌트에서 누른 버튼을 "뽑는 중…" 으로 바꾸고 그 줄의 버튼을 모두 끈 모양. */
export function loadingComponents(i: ButtonInteraction): APIMessageTopLevelComponent[] {
  const walk = (c: Record<string, unknown>): Record<string, unknown> => {
    if (c.type === ComponentType.ActionRow && Array.isArray(c.components) && c.components.some((b: Record<string, unknown>) => b.custom_id === i.customId)) {
      return {
        ...c,
        components: (c.components as Record<string, unknown>[]).map((b) => (b.custom_id === i.customId ? { ...b, label: msg("reroll.loading"), disabled: true } : { ...b, disabled: b.url ? b.disabled : true })),
      };
    }
    return Array.isArray(c.components) ? { ...c, components: (c.components as Record<string, unknown>[]).map(walk) } : c;
  };
  return i.message.components.map((c) => walk(c.toJSON() as unknown as Record<string, unknown>)) as unknown as APIMessageTopLevelComponent[];
}

/** 결과 메시지의 다시 뽑기. 주인이 아니면 안내만. */
export async function rerollInPlace(i: ButtonInteraction, ownerId: string, build: () => Promise<V2Payload | string>): Promise<void> {
  if (i.user.id !== ownerId) {
    await i.reply({ content: msg("reroll.ownerOnly"), flags: MessageFlags.Ephemeral });
    return;
  }
  const before = i.message.components.map((c) => c.toJSON()) as unknown as APIMessageTopLevelComponent[];
  await i.update({ components: loadingComponents(i), flags: MessageFlags.IsComponentsV2 });
  const result = await build();
  if (typeof result === "string") {
    // 버튼을 되살리고 안내만
    await i.editReply({ components: before, flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    await i.followUp({ content: result, flags: MessageFlags.Ephemeral });
    return;
  }
  await i.followUp(result);
  // 버튼이 달린 원래 메시지(@original)를 지운다.
  await i.deleteReply().catch((e) => console.warn("[reroll] 원래 메시지 삭제 실패:", (e as Error).message));
}

/**
 * 조건 창의 뽑기 버튼. 뽑는 동안 버튼을 "뽑는 중…" 으로 바꾸고, 새 결과를 채널에 올린 뒤 예전 결과(oldMessageId, "-" 면 없음)를 지운다.
 * 올린 메시지 id 를 돌려준다(창이 다음 뽑기 때 지울 수 있게). 실패하면 안내를 보내고 버튼을 되살린 뒤 null.
 */
export async function postFromMenu(i: ButtonInteraction, oldMessageId: string, build: () => Promise<V2Payload | string>): Promise<string | null> {
  const before = i.message.components.map((c) => c.toJSON()) as unknown as APIMessageTopLevelComponent[];
  await i.update({ components: loadingComponents(i), flags: MessageFlags.IsComponentsV2 });
  const result = await build();
  if (typeof result === "string") {
    await i.editReply({ components: before, flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    await i.followUp({ content: result, flags: MessageFlags.Ephemeral });
    return null;
  }
  const sent = await i.followUp(result);
  if (oldMessageId && oldMessageId !== "-") {
    await i.channel?.messages.delete(oldMessageId).catch((e) => console.warn("[reroll] 예전 결과 삭제 실패:", (e as Error).message));
  }
  return sent.id;
}
