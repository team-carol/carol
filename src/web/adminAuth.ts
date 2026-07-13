import * as crypto from "crypto";

// /별명 명령으로 발급하는 단기 관리자 토큰. 별명 관리 페이지/API 접근 게이팅용.
// 봇을 재시작하면 초기화된다(메모리 저장).
const TOKEN_TTL_MS = 60 * 60 * 1000; // 60분
const tokens = new Map<string, number>(); // token → 만료시각(ms)

export function issueAdminToken(): string {
  const token = crypto.randomBytes(24).toString("hex");
  tokens.set(token, Date.now() + TOKEN_TTL_MS);
  return token;
}

export function isValidAdminToken(token: string): boolean {
  if (!token) return false;
  const exp = tokens.get(token);
  if (!exp) return false;
  if (Date.now() > exp) {
    tokens.delete(token);
    return false;
  }
  return true;
}

// 만료 토큰 정리 (선택적, 메모리 누수 방지)
setInterval(() => {
  const now = Date.now();
  for (const [token, exp] of tokens) if (now > exp) tokens.delete(token);
}, TOKEN_TTL_MS).unref?.();
