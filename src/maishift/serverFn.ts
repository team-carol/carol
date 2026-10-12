/**
 * maishift(maimai.shiftpsh.com) 서버 함수 호출. 공식 API가 나오기 전까지 쓰는 임시 경로다.
 *
 * maishift 는 TanStack Start 로 만들어져 있어, 페이지가 데이터를 `GET /_serverFn/<해시>?payload=...` 로 받는다.
 * 해시는 maishift 빌드에 묶여 있어 maishift 가 배포하면 바뀔 수 있다 — 그때는 아래 FN 값을 새로 찾아 바꾼다
 * (브라우저에서 프로필 → 기록 탭으로 이동하며 네트워크 탭의 _serverFn 요청을 보면 된다).
 * 운영자 허락 조건: 서버에 무리가 가지 않게, 출처를 밝혀서. 공식 API가 나오면 이 파일을 갈아 끼운다.
 */

const BASE = "https://maimai.shiftpsh.com";
const USER_AGENT = "carol-bot (Discord bot; +https://www.team-carol.com)";
const TIMEOUT_MS = 10_000;
/** 요청 사이 최소 간격. 여러 명령이 몰려도 maishift 로는 이 간격으로만 나간다. */
const MIN_INTERVAL_MS = 1_000;

export const FN = {
  /** {handle, region} → 프로필 요약 + 레이팅 대상곡 + 상위 기록 100개 */
  profile: "8cc17f2a26e01e823beaeca45b578af6db3bd0bc627a603a0add3b0772a33301",
  /** {handle, region} → 전체 곡/보면 카탈로그 + 그 유저의 전 기록 */
  records: "4596ec22247ca585a111f9481e9c4ce1f2553f7b0f3fc7b98a4324205365ef54",
  /** {region} → 지역 곡 목록(곡·보면·상수·한국어 번역). /songs 페이지 */
  songs: "5c9650151df3f336ab6e8278251a186ce9b3e587a66c4100c738cc0e91398756",
} as const;

export type MaishiftRegion = "ASIA" | "JAPAN";

export class MaishiftError extends Error {
  constructor(message: string, readonly kind: "not_found" | "unavailable" | "format") { super(message); }
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
function encodeArgs(args: Record<string, string>): string {
  const keys = Object.keys(args);
  return JSON.stringify({
    t: { t: 10, i: 0, p: { k: ["data"], v: [{ t: 10, i: 1, p: { k: keys, v: keys.map((k) => ({ t: 1, s: args[k] })) }, o: 0 }] }, o: 0 },
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

export async function callServerFn<T>(fn: string, args: Record<string, string>): Promise<T> {
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
    if (typeof result.error === "string") throw new MaishiftError(result.error, /not found/i.test(result.error) ? "not_found" : "unavailable");
    return result as T;
  });
}
