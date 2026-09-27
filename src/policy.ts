import { msg } from "./messages";

/**
 * 개인정보처리방침 / 이용약관 버전.
 *
 * YYYYMMDD 정수. 방침 내용을 실질적으로 바꿀 때 이 값을 올린다.
 * 그러면 사용자에게 1회 고지된다:
 *  - 다음 슬래시 명령 실행 시 ephemeral 안내 (`src/bot/index.ts`)
 *  - 다음 북마클릿/확장 동기화 시 오버레이 상단 안내 (`src/web/bookmarklet.ts`)
 * 두 경로 중 먼저 닿는 쪽에서 `sessions.policy_ack` 를 이 값으로 올리고, 이후엔 안 뜬다.
 */
export const POLICY_VERSION = 20260923;

/** 고지 문구 (디스코드 ephemeral 용). */
export function policyNoticeText(baseUrl: string): string {
  return [
    msg("policy.updatedTitle"),
    msg("policy.updatedBody"),
    `${baseUrl}/privacy`,
  ].join("\n");
}
