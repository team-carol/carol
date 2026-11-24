/**
 * /곡추천·/랜덤 결과의 "다시 뽑기"·"조건 바꾸기" 공통 처리.
 * - 결과 메시지 아래 버튼 줄: <prefix>:re:<주인>:<조건>(다시 뽑기), <prefix>:menu:<주인>:<조건>(조건 바꾸기 창 열기).
 * - 다시 뽑기는 주인만: 같은 조건으로 새로 뽑아 원래 메시지를 그 결과로 고친다.
 * - 조건 창(본인에게만 보임)의 뽑기 버튼도, 그 창을 연 결과 메시지(주인 것일 때만)가 있으면 그 메시지를 고치고 없으면 새로 올린다.
 * - 예전(2.4.1 까지)에는 새로 올리고 원래 메시지를 지웠는데, 뽑을 때마다 새 메시지라 채널 알림이 계속 갔다. 고치기는 알림이 가지 않는다.
 * - 뽑는 동안은 누른 버튼을 "뽑는 중…" 으로 바꿔 끈다(바로 응답하면 디스코드의 로딩 표시가 먼저 사라져 멈춘 것처럼 보이므로).
 * 조건은 메시지 컴포넌트(customId)에만 둔다(봇을 다시 켜도 버튼이 그대로 동작하게).
 */
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ComponentType,
  type APIMessageTopLevelComponent, type AttachmentBuilder, type MessageMentionOptions, type ButtonInteraction, type ContainerBuilder, type TextDisplayBuilder,
} from "discord.js";
import { msg } from "../../messages";

export interface V2Payload {
  components: (ContainerBuilder | TextDisplayBuilder | ActionRowBuilder<ButtonBuilder>)[];
  files: AttachmentBuilder[];
  flags: MessageFlags.IsComponentsV2;
  /** 머리글의 "@대상 님의 기록" 멘션이 알림을 보내지 않게 */
  allowedMentions?: MessageMentionOptions;
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

/** 결과 메시지의 다시 뽑기. 주인이 아니면 안내만. 같은 메시지를 새 결과로 고친다(첨부한 재킷도 바꾼다). */
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
  // 버튼이 달린 원래 메시지(@original)를 고친다. attachments: [] 로 예전 재킷 첨부를 지우고 새 것으로.
  await i.editReply({ ...result, attachments: [] });
}

/**
 * 조건 창의 뽑기 버튼. 뽑는 동안 버튼을 "뽑는 중…" 으로 바꾸고, 예전 결과(oldMessageId, "-" 면 없음)가 있으면 그 메시지를 고친다.
 * 예전 결과가 없거나 고칠 수 없으면(지워짐, 채널을 못 봄) 채널에 새로 올린다.
 * 결과 메시지 id 를 돌려준다(창이 다음 뽑기 때 고칠 수 있게). 실패하면 안내를 보내고 버튼을 되살린 뒤 null.
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
  if (oldMessageId && oldMessageId !== "-" && i.channel) {
    const edited = await i.channel.messages.edit(oldMessageId, { ...result, attachments: [] })
      .then(() => true)
      .catch((e) => { console.warn("[reroll] 예전 결과 고치기 실패, 새로 올린다:", (e as Error).message); return false; });
    if (edited) return oldMessageId;
  }
  const sent = await i.followUp(result);
  return sent.id;
}
