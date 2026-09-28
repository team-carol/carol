/**
 * 패치노트. /관리 → 패치노트 탭에서 작성·게시하고, 게시된 노트는 등록 사용자가 그 뒤 처음
 * 쓰는 슬래시 명령 응답에 본인만 보이는 팔로업으로 1회 표시된다(`src/bot/index.ts`).
 * 기준은 게시 시각이다. 봇 배포·버전과는 연동하지 않는다(version 은 표시용 라벨).
 */

/** 게시 후 이 기간이 지난 노트는 더 이상 띄우지 않는다(오래 쉬다 돌아온 사용자에게 옛 노트 방지). */
export const PATCH_NOTE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
/** 한 번에 띄우는 최대 개수(최신순). */
export const PATCH_NOTE_SHOW_MAX = 3;
/** Discord 임베드 설명 한도(4096)보다 조금 작게. */
export const PATCH_NOTE_BODY_MAX = 4000;
const TITLE_MAX = 200;
const VERSION_MAX = 30;

export function sanitizePatchNote(body: unknown): { version: string; title: string; body: string } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const version = typeof b.version === "string" ? b.version.trim() : "";
  const title = typeof b.title === "string" ? b.title.replace(/\s+/g, " ").trim() : "";
  const text = typeof b.body === "string" ? b.body.replace(/\r\n/g, "\n").trim() : "";
  if (!text || text.length > PATCH_NOTE_BODY_MAX || title.length > TITLE_MAX || version.length > VERSION_MAX) return null;
  return { version, title, body: text };
}
