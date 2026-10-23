/**
 * maishift 공식 API(https://maimai.shiftpsh.com/developers) 클라이언트.
 *
 * - 모든 요청에 X-API-Key(config.json `maishiftApiKey`). 키는 URL 에 넣지 않는다(넣으면 거부된다).
 * - 이용 한도: 앱마다 120단위, 초당 2단위씩 찬다. 요청을 한 줄로 세우고, 남은 양(X-RateLimit-Remaining)이
 *   이번 요청 비용보다 적으면 잠깐(MAX_BUDGET_WAIT_MS)은 찰 때까지 기다린다. 그보다 오래 기다려야 하거나 429 가 오면
 *   MaishiftError(rate_limited, retryAfterSec)를 던지고, 명령은 "몇 분 뒤 다시 시도" 안내를 보여 준다.
 * - 개발자 약관: maishift 출처와 SEGA 와 무관한 비공식 앱임을 표시, 비상업, 재킷은 API 가 준 주소로만.
 *
 * API 에 없는 데이터(미래시·스탬프·버전 폴더 순서·보면 상수 이력·보면 기록 변화·플레이 횟수 히스토리)는
 * 운영자 답을 받기 전까지 serverFn.ts 로 받는다.
 */
import { CONFIG } from "../config";
import { MaishiftError } from "./serverFn";

const BASE = "https://maimai.shiftpsh.com/api/v1";
const USER_AGENT = "carol-bot (Discord bot; +https://www.team-carol.com)";
const TIMEOUT_MS = 15_000;
const MIN_INTERVAL_MS = 250;
const REFILL_PER_SEC = 2;
/** 한도가 찰 때까지 이만큼은 기다린다. 더 걸리면 바로 rate_limited 로 알린다. */
const MAX_BUDGET_WAIT_MS = 5_000;
/** 429 의 Retry-After 가 이 이하면 한 번 기다렸다 다시 보낸다. */
const RETRY_AFTER_MAX_SEC = 3;

export type ApiRegion = "intl" | "jp";

/** 엔드포인트별 한도 소모량(문서의 표). 모르는 경로는 10 으로 본다. */
function costOf(path: string): number {
  if (path === "/versions") return 1;
  if (/^\/profiles\/[^/]+\/snapshots$/.test(path)) return 2;
  if (/^\/profiles\/[^/]+$/.test(path)) return 5;
  if (/^\/charts\/\d+\/distribution$/.test(path)) return 6;
  return 10;
}

let queue: Promise<unknown> = Promise.resolve();
let lastAt = 0;
/** 마지막 응답의 남은 한도와 그 시각. 모르면 null. */
let remaining: { units: number; at: number } | null = null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 남은 한도가 cost 보다 적으면 찰 때까지 기다릴 시간(ms). */
function waitForBudget(cost: number): number {
  if (!remaining) return 0;
  const now = remaining.units + ((Date.now() - remaining.at) / 1000) * REFILL_PER_SEC;
  return now >= cost ? 0 : Math.ceil(((cost - now) / REFILL_PER_SEC) * 1000);
}

function throttled<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastAt = Date.now();
    return task();
  });
  queue = run.catch(() => undefined);
  return run;
}

export function hasApiKey(): boolean {
  return !!CONFIG.maishiftApiKey;
}

/** API 오류 본문 → MaishiftError. 기존 명령들이 kind 로 안내를 고른다. */
function toError(status: number, body: { error?: { code?: string; message?: string } } | null): MaishiftError {
  const code = body?.error?.code ?? `http_${status}`;
  const message = body?.error?.message ?? `HTTP ${status}`;
  if (code === "not_public") return new MaishiftError(message, "private");
  if (code === "not_found") return new MaishiftError(message, /region/i.test(message) ? "region_missing" : "not_found");
  return new MaishiftError(`${code}: ${message}`, "unavailable");
}

export async function callApi<T>(path: string, query: Record<string, string | number | undefined> = {}): Promise<T> {
  const key = CONFIG.maishiftApiKey;
  if (!key) throw new MaishiftError("maishiftApiKey 가 config.json 에 없음", "unavailable");
  const qs = Object.entries(query).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
  const url = `${BASE}${path}${qs ? `?${qs}` : ""}`;
  const cost = costOf(path);
  return throttled(async () => {
    for (let attempt = 0; ; attempt++) {
      const budgetWait = waitForBudget(cost);
      if (budgetWait > MAX_BUDGET_WAIT_MS) throw new MaishiftError(`rate limit budget (${path})`, "rate_limited", Math.ceil(budgetWait / 1000));
      if (budgetWait > 0) await sleep(budgetWait);
      let res: Response;
      try {
        res = await fetch(url, { headers: { "X-API-Key": key, "user-agent": USER_AGENT, accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      } catch (e) {
        throw new MaishiftError(`request failed: ${(e as Error).message}`, "unavailable");
      }
      const left = Number(res.headers.get("x-ratelimit-remaining"));
      if (Number.isFinite(left)) remaining = { units: left, at: Date.now() };
      if (res.status === 429) {
        const raw = Number(res.headers.get("retry-after"));
        const after = Number.isFinite(raw) && raw > 0 ? raw : 60;
        if (attempt === 0 && after <= RETRY_AFTER_MAX_SEC) {
          await sleep(after * 1000);
          continue;
        }
        console.warn(`[maishift-api] 한도 초과(${after}초 뒤 가능): ${path}`);
        throw new MaishiftError(`rate limited (${path})`, "rate_limited", after);
      }
      let body: unknown = null;
      try { body = await res.json(); } catch { /* 본문 없음 */ }
      if (!res.ok) throw toError(res.status, body as { error?: { code?: string; message?: string } } | null);
      if (body == null) throw new MaishiftError("empty body", "format");
      return body as T;
    }
  });
}
