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
/** 요청 사이 최소 간격. 여러 명령이 몰려도 maishift 로는 이 간격으로만 나간다(한 사용자 조회는 많아야 3건). */
const MIN_INTERVAL_MS = 250;

export const FN = {
  /** {handle, region} → 프로필 요약 + 레이팅 대상곡 + 상위 기록 100개 */
  profile: "8cc17f2a26e01e823beaeca45b578af6db3bd0bc627a603a0add3b0772a33301",
  /** {handle, region} → 전체 곡/보면 카탈로그 + 그 유저의 전 기록 */
  records: "4596ec22247ca585a111f9481e9c4ce1f2553f7b0f3fc7b98a4324205365ef54",
  /** {region} → 지역 곡 목록(곡·보면·상수·한국어 번역). /songs 페이지 */
  songs: "5c9650151df3f336ab6e8278251a186ce9b3e587a66c4100c738cc0e91398756",
  /** {handle, region} → 업로드마다 한 점씩 쌓인 레이팅·플레이 횟수 히스토리. 프로필 홈 그래프 */
  history: "086876d75e2fef4bee772eae80535e80dcbc84fa6e64fc0db1f0f2737222bc4f",
  /** {handle, region} → 업로드(이전 기록) 목록. JSON 문자열 {n: 이름들, r: [[업로드 번호, 시각(ms), 레이팅, 이름 번호, 버전]]}.
   *  그 시점 프로필은 profile 에 handle 을 `<handle>~<업로드 번호>` 로 넘겨 받는다. 사용자가 이전 기록을 공개했을 때만. */
  uploads: "860797bd9ce1315f04e84227bb43cf8a4763c4e22321283681b9b1398ac9a628",
  // ─── 곡 카드를 눌렀을 때 창(곡 상세). trackId 는 보면 번호(곡 목록의 track.i). ───
  /** {trackId, handle} → 그 보면의 업로드별 기록 [{recordedAt, achievement, dxScore, dxMax, dxPercent, combo, sync}] */
  trackScores: "889a9e2084ba419653983b577d7991d39d7ee1a78ab2cbf0f666933c347e6acc",
  /** {trackId} → 버전별 상수 [{versionId, internalLevel}] */
  trackLevels: "01fd4ff066633d4bb53aa015e4bb81123eacabb135c4accb1c7689d1f3db58dd",
  /** {trackId} → 레이팅 구간별 달성 분포 {buckets: {coarse, fine}, computedAt} */
  trackDist: "7d8978fb357e3443c4203f10a2bd53f954e1595ce6d75b68ae8ccf79dbebb392",
  /** {trackId} → 버전 안 순서 {order, total} */
  trackPosition: "e2b0bdcb4cea152b04517824c971fed10afef3f7be8ff554153ca41d6a3ae9f9",
} as const;

export type MaishiftRegion = "ASIA" | "JAPAN";

export class MaishiftError extends Error {
  /** region_missing: 요청한 지역(ASIA/JAPAN)에 기록이 없음 — maishift 는 이때 그 사람의 대표 지역 기록을 준다. */
  constructor(message: string, readonly kind: "not_found" | "unavailable" | "format" | "region_missing") { super(message); }
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
    if (typeof result.error === "string") throw new MaishiftError(result.error, /not found/i.test(result.error) ? "not_found" : "unavailable");
    return result as T;
  });
}
