import {
  MessageFlags, MessageFlagsBitField,
  type MessageComponentInteraction, type ChatInputCommandInteraction, type InteractionReplyOptions, type Message,
} from "discord.js";

/**
 * Discord 는 3초 안에 응답(또는 defer)하지 않으면 상호작용을 버린다. maishift 프로필을 처음 받는 경우처럼
 * 핸들러가 늦어질 수 있어, ACK_DEADLINE_MS 안에 핸들러가 응답하지 않으면 여기서 먼저 defer 해 두고
 * 핸들러가 이후 부르는 reply/update/deferReply 를 그 상태에 맞게 바꿔 보낸다. 핸들러 코드는 그대로 둔다.
 * - 명령·일반 버튼: 공개로 deferReply. 핸들러가 비공개로 답하려 하면 공개 "생각 중" 메시지를 지우고 비공개 followUp 으로 보낸다
 *   (비공개여야 할 내용이 채널에 남지 않게).
 * - 페이지 넘김처럼 원래 메시지를 고치는 버튼(update): deferUpdate 후 editReply.
 */
const ACK_DEADLINE_MS = 2300;

type Guarded = ChatInputCommandInteraction | MessageComponentInteraction;
type ReplyOpts = string | (InteractionReplyOptions & { ephemeral?: boolean });

function isEphemeral(opts: unknown): boolean {
  if (!opts || typeof opts !== "object") return false;
  const o = opts as { flags?: unknown; ephemeral?: boolean };
  if (o.ephemeral) return true;
  try {
    return o.flags != null && new MessageFlagsBitField(o.flags as never).has(MessageFlags.Ephemeral);
  } catch {
    return false;
  }
}

function isComponentsV2(opts: unknown): boolean {
  if (!opts || typeof opts !== "object") return false;
  const flags = (opts as { flags?: unknown }).flags;
  try {
    return flags != null && new MessageFlagsBitField(flags as never).has(MessageFlags.IsComponentsV2);
  } catch {
    return false;
  }
}

/** 공개/비공개 플래그는 뺀다. Components V2 플래그는 남겨야 컨테이너가 그려진다. */
function withoutFlags(opts: ReplyOpts): Record<string, unknown> {
  if (typeof opts === "string") return { content: opts };
  const { flags: _f, ephemeral: _e, withResponse: _w, fetchReply: _r, ...rest } = opts as Record<string, unknown>;
  return isComponentsV2(opts) ? { ...rest, flags: MessageFlags.IsComponentsV2 } : rest;
}

/** mode: 버튼이 원래 메시지를 고치는(update) 종류면 "update". 핸들러가 제때 응답하면 타이머는 저절로 꺼진다. */
export function guardSlowAck(i: Guarded, mode: "reply" | "update" = "reply"): () => void {
  let auto: Promise<unknown> | null = null;
  // 공개 defer 뒤 핸들러가 비공개를 원하면, 그 뒤 응답은 비공개 followUp(과 그 메시지 수정)으로 보낸다.
  let privateMsg: Promise<Message> | null = null;
  let wantsPrivate = false;
  // 핸들러가 이미 응답을 보내는 중이면(요청이 끝나기 전엔 i.replied 가 false) 끼어들지 않는다.
  let acking = false;

  const timer = setTimeout(() => {
    if (acking || i.deferred || i.replied) return;
    auto = (mode === "update" && i.isMessageComponent() ? i.deferUpdate() : i.deferReply()).catch((e) => console.warn("[slow-ack] defer 실패:", (e as Error).message));
  }, ACK_DEADLINE_MS);

  const target = i as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
  const orig = {
    reply: target.reply.bind(i),
    deferReply: target.deferReply.bind(i),
    editReply: target.editReply.bind(i),
    update: i.isMessageComponent() ? target.update.bind(i) : null,
    deferUpdate: i.isMessageComponent() ? target.deferUpdate.bind(i) : null,
  };

  const sendPrivate = async (opts: ReplyOpts): Promise<unknown> => {
    if (privateMsg) return i.webhook.editMessage(await privateMsg, withoutFlags(opts));
    if (mode === "reply") await i.deleteReply().catch(() => {});
    privateMsg = i.followUp({ ...withoutFlags(opts), flags: isComponentsV2(opts) ? MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 : MessageFlags.Ephemeral });
    return privateMsg;
  };

  target.reply = async (opts: unknown) => {
    if (!auto) { acking = true; clearTimeout(timer); return orig.reply(opts); }
    await auto;
    return isEphemeral(opts) || wantsPrivate ? sendPrivate(opts as ReplyOpts) : orig.editReply(withoutFlags(opts as ReplyOpts));
  };
  target.deferReply = async (opts: unknown) => {
    if (!auto) { acking = true; clearTimeout(timer); return orig.deferReply(opts); }
    await auto;
    // 이미 공개로 defer 했다. 비공개를 원했다면 이후 응답을 비공개로 돌린다.
    if (isEphemeral(opts)) wantsPrivate = true;
    return undefined;
  };
  target.editReply = async (opts: unknown) => {
    if (auto) await auto;
    return wantsPrivate ? sendPrivate(opts as ReplyOpts) : orig.editReply(opts);
  };
  if (orig.update) {
    target.update = async (opts: unknown) => {
      if (!auto) { acking = true; clearTimeout(timer); return orig.update!(opts); }
      await auto;
      return orig.editReply(withoutFlags(opts as ReplyOpts));
    };
  }
  if (orig.deferUpdate) {
    target.deferUpdate = async (opts: unknown) => {
      if (!auto) { acking = true; clearTimeout(timer); return orig.deferUpdate!(opts); }
      await auto;
      return undefined;
    };
  }
  return () => clearTimeout(timer);
}
