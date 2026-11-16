/**
 * 공개로 올라가는 기록 결과 맨 위에 붙이는 "누구의 기록인지" 한 줄(작은 글씨, "@대상 님의 기록").
 * 슬래시 명령은 디스코드가 실행한 사람만 보여 주고 user 옵션 값은 보여 주지 않으며, 버튼·메뉴로 올린 결과(/사진관·/곡추천·/랜덤·
 * 검색 상세·공유)는 그마저 없어서 누구 기록인지 알 수 없었다. 실행한 사람은 적지 않는다.
 * 멘션은 이름만 보이고 알림은 가지 않게 NO_PING(allowedMentions)을 같이 넘긴다.
 */
import type { MessageMentionOptions } from "discord.js";
import { msg, type MessageKey } from "../../messages";

export const NO_PING: { allowedMentions: MessageMentionOptions } = { allowedMentions: { parse: [] } };

export function targetLine(userId: string, key: MessageKey = "common.targetLine"): string {
  return msg(key, { user: `<@${userId}>` });
}

/**
 * 제목 머리글("## 곡 추천\n-# 설명")의 첫 줄 오른쪽에 "@대상" 멘션만 붙인다(/곡추천·/랜덤).
 * 문구를 /관리에서 바꿔도 되도록 첫 줄 끝에 끼운다. userId 가 없으면 그대로.
 */
export function headerWithTarget(header: string, userId: string | null | undefined): string {
  if (!userId) return header;
  const mention = `<@${userId}>`;
  const nl = header.indexOf("\n");
  return nl < 0 ? `${header} ${mention}` : `${header.slice(0, nl)} ${mention}${header.slice(nl)}`;
}

/** 메시지 글(content) 맨 앞에 대상 줄을 붙인다. 기존 글(안내 등)이 있으면 그 위에. */
export function withTarget(userId: string, content?: string | null, key?: MessageKey): { content: string; allowedMentions: MessageMentionOptions } {
  const line = targetLine(userId, key);
  return { content: content ? `${line}\n${content}` : line, ...NO_PING };
}
