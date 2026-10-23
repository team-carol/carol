import { msg } from "./messages";

/**
 * 개인정보처리방침 / 이용약관 버전.
 *
 * YYYYMMDD 정수. 방침 내용을 실질적으로 바꿀 때 이 값을 올린다. 두 페이지의 "최종 수정일"과
 * 고지 문구의 날짜도 이 값에서 나온다(배포하는 날로 바꾸면 모두 함께 바뀐다).
 * 그러면 사용자에게 1회 고지된다:
 *  - 다음 슬래시 명령 실행 시 ephemeral 안내 (`src/bot/index.ts`)
 *  - 다음 북마클릿/확장 동기화 시 오버레이 상단 안내 (`src/web/bookmarklet.ts`)
 * 두 경로 중 먼저 닿는 쪽에서 `sessions.policy_ack` 를 이 값으로 올리고, 이후엔 안 뜬다.
 */
export const POLICY_VERSION = 20261023;

/** POLICY_VERSION → "2026년 10월 21일" */
export function policyDateText(): string {
  const v = String(POLICY_VERSION);
  return `${v.slice(0, 4)}년 ${Number(v.slice(4, 6))}월 ${Number(v.slice(6, 8))}일`;
}

/** 고지 문구 (디스코드 ephemeral 용). */
export function policyNoticeText(baseUrl: string): string {
  return [
    msg("policy.updatedTitle", { date: policyDateText() }),
    msg("policy.updatedBody"),
    `${baseUrl}/privacy`,
  ].join("\n");
}
