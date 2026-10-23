/**
 * maishift(maimai.shiftpsh.com) 서버 함수 호출. 공식 API(api.ts)에 없는 데이터만 아직 여기로 받는다:
 * 미래시(profile `<handle>:<세대>`), 스탬프 카드, 보면의 버전별 상수·업로드별 기록 변화. 이 기능들은 지금 꺼 두었다(features.ts).
 * 운영자가 이 데이터의 엔드포인트를 곧 만들어 주기로 했다(2026-10-21). 나오면 api.ts 로 옮기고 이 파일을 지운다.
 *
 * maishift 는 TanStack Start 로 만들어져 있어, 페이지가 데이터를 `GET /_serverFn/<해시>?payload=...` 로 받는다.
 * 해시는 maishift 빌드에 묶여 있어 maishift 가 배포하면 바뀔 수 있다 — 그때는 아래 FN 값을 새로 찾아 바꾼다
 * (브라우저에서 프로필 → 기록 탭으로 이동하며 네트워크 탭의 _serverFn 요청을 보면 된다).
 * 운영자 허락 조건: 서버에 무리가 가지 않게, 출처를 밝혀서. 허락을 받지 못한 기능은 이 파일의 함수와 함께 뺀다.
 */

const BASE = "https://maimai.shiftpsh.com";
const USER_AGENT = "carol-bot (Discord bot; +https://www.team-carol.com)";
const TIMEOUT_MS = 10_000;
/** 요청 사이 최소 간격. 여러 명령이 몰려도 maishift 로는 이 간격으로만 나간다(한 사용자 조회는 많아야 3건). */
const MIN_INTERVAL_MS = 250;

export const FN = {
  /** {handle, region} → 프로필 요약 + 레이팅 대상곡 + 상위 기록 100개. 미래시(`<handle>:<세대>`)만 쓴다. */
  profile: "8cc17f2a26e01e823beaeca45b578af6db3bd0bc627a603a0add3b0772a33301",
  /** {handle, region} → 스탬프 카드 목록(/profile/<id>/stamp 페이지) */
  stamps: "65fab9a29adf0d76bf504a523d5d3d4b5432a1ddb98b9444ab9f5d7027e39bf0",
  // ─── 곡 카드를 눌렀을 때 창(곡 상세). trackId 는 보면 번호(곡 목록의 track.i). ───
  /** {trackId, handle} → 그 보면의 업로드별 기록 [{recordedAt, achievement, dxScore, dxMax, dxPercent, combo, sync}] */
  trackScores: "889a9e2084ba419653983b577d7991d39d7ee1a78ab2cbf0f666933c347e6acc",
  /** {trackId} → 버전별 상수 [{versionId, internalLevel}] */
  trackLevels: "01fd4ff066633d4bb53aa015e4bb81123eacabb135c4accb1c7689d1f3db58dd",
} as const;

export type MaishiftRegion = "ASIA" | "JAPAN";

export class MaishiftError extends Error {
  /** region_missing: 요청한 지역(ASIA/JAPAN)에 기록이 없음 — maishift 는 이때 그 사람의 대표 지역 기록을 준다. */
  /** private: 사용자가 maishift 에서 프로필(개인 성과 페이지)을 비공개로 함 — "User record is not public." */
  /** rate_limited: 공식 API 이용 한도(앱 전체 분당 120단위)를 넘음. retryAfterSec 뒤에 다시 시도할 수 있다. */
  constructor(message: string, readonly kind: "not_found" | "unavailable" | "format" | "region_missing" | "private" | "rate_limited", readonly retryAfterSec?: number) { super(message); }
}

// ─── seroval JSON ───────────────────────────────────────────────────────────
// TanStack Start 는 인자/응답을 seroval 형식으로 주고받는다. maishift 응답에 나오는 노드만 푼다.
// 0 숫자, 1 문자열, 2 상수, 4 참조, 5 날짜(ISO 문자열 그대로), 9 배열, 10·11 객체.
type Node = { t: number; i?: number; s?: unknown; a?: (Node | null)[]; p?: { k: string[]; v: Node[] } };
const CONSTANTS = [null, undefined, true, false, -0, Infinity, -Infinity, NaN];

function unescapeString(s: string): string {
  try { return JSON.parse(`"${s.replace(/\\x([0-9a-fA-F]{2})/g, "\\u00$1")}"`); } catch { return s; }
}

export function decodeSeroval(node: unknown, refs = new Map<number, unknown>()): unknown {
  if (!node || typeof node !== "object") return node;
  const n = node as Node;
  switch (n.t) {
    case 0: return n.s;
    case 1: return unescapeString(String(n.s));
    case 2: return CONSTANTS[Number(n.s)];
    case 4: return refs.get(n.i!);
    case 5: return n.s;
    case 9: {
      const out: unknown[] = [];
      refs.set(n.i!, out);
      for (const x of n.a ?? []) out.push(x == null ? undefined : decodeSeroval(x, refs));
      return out;
    }
    case 10: case 11: {
      const out: Record<string, unknown> = {};
      refs.set(n.i!, out);
      n.p?.k.forEach((k, j) => { out[unescapeString(k)] = decodeSeroval(n.p!.v[j], refs); });
      return out;
    }
    default: throw new MaishiftError(`unsupported seroval node ${n.t}`, "format");
  }
}

/** {data: {handle, region}} 형태의 인자를 seroval JSON 으로. */
function encodeArgs(args: Record<string, string | number>): string {
  const keys = Object.keys(args);
  // seroval 노드: 0 숫자, 1 문자열
  const node = (v: string | number) => (typeof v === "number" ? { t: 0, s: v } : { t: 1, s: v });
  return JSON.stringify({
    t: { t: 10, i: 0, p: { k: ["data"], v: [{ t: 10, i: 1, p: { k: keys, v: keys.map((k) => node(args[k])) }, o: 0 }] }, o: 0 },
    f: 63,
    m: [],
  });
}

// ─── 호출 ───────────────────────────────────────────────────────────────────
let queue: Promise<unknown> = Promise.resolve();
let lastAt = 0;

/** 요청을 한 줄로 세워 MIN_INTERVAL_MS 간격으로 내보낸다. */
function throttled<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastAt = Date.now();
    return task();
  });
  queue = run.catch(() => undefined);
  return run;
}

export async function callServerFn<T>(fn: string, args: Record<string, string | number>): Promise<T> {
  return throttled(async () => {
    const url = `${BASE}/_serverFn/${fn}?payload=${encodeURIComponent(encodeArgs(args))}`;
    let res: Response;
    try {
      // x-tsr-serverFn 헤더가 없으면 200 에 빈 본문이 온다.
      res = await fetch(url, { headers: { "user-agent": USER_AGENT, "x-tsr-serverFn": "true", accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (e) {
      throw new MaishiftError(`request failed: ${(e as Error).message}`, "unavailable");
    }
    if (!res.ok) throw new MaishiftError(`HTTP ${res.status}`, "unavailable");
    const text = await res.text();
    if (!text) throw new MaishiftError("empty body (server function id changed?)", "format");
    let decoded: { result?: unknown; error?: unknown };
    try {
      decoded = decodeSeroval(JSON.parse(text)) as typeof decoded;
    } catch (e) {
      throw e instanceof MaishiftError ? e : new MaishiftError(`bad body: ${(e as Error).message}`, "format");
    }
    const result = decoded?.result as { error?: unknown } | undefined;
    if (decoded?.error || !result) throw new MaishiftError(String(decoded?.error ?? "no result"), "format");
    // 없는 아이디: result = { error: "Handle not found." }
    if (typeof result.error === "string") {
      const kind = /not found/i.test(result.error) ? "not_found" : /not public/i.test(result.error) ? "private" : "unavailable";
      throw new MaishiftError(result.error, kind);
    }
    return result as T;
  });
}
