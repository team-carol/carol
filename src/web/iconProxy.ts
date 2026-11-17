// GET /api/icon/{id} — maimai 아이콘(DX NET img/Icon/{id}.png) 중계. 캐롤 키링처럼 밖에서 아이콘을 쓰는 곳이 부른다.
// DX NET 은 디스코드 같은 일부 클라이언트 요청을 끊으므로 캐롤 서버가 대신 받아 돌려준다.
// 공개 이미지 id 만 받는다(사용자 정보 없음). SEGA 아이콘 경로 말고는 받지 않는다 — 아무 주소나 받아 주는 통로가 되면 안 된다.

import type { IncomingMessage, ServerResponse } from "http";

export const ICON_PATH_PREFIX = "/api/icon/";

const ID_RE = /^[0-9a-f]{16}$/;
const ORIGINS = ["https://maimaidx-eng.com", "https://maimaidx.jp"] as const;
const MAX_BYTES = 512 * 1024;
const FETCH_TIMEOUT_MS = 5000;

// 아이콘이 바뀌면 id 도 바뀌므로 id 별로 늘 같은 그림이다. 메모리에만 둔다(재시작하면 다시 받음).
const CACHE_MAX = 500;
const cache = new Map<string, Buffer>();
const inFlight = new Map<string, Promise<IconResult>>();

// IP 당 분당 요청 수 제한(고정 창).
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;
const hits = new Map<string, { start: number; count: number }>();

type IconResult = { ok: true; png: Buffer } | { ok: false; status: 404 | 502; error: string };

function clientIp(req: IncomingMessage): string {
  // 운영은 Cloudflare 터널 뒤라 소켓 주소가 cloudflared 다.
  const cf = req.headers["cf-connecting-ip"];
  return (typeof cf === "string" && cf) || req.socket.remoteAddress || "unknown";
}

/** 제한에 걸리면 다시 부를 수 있을 때까지 남은 초, 아니면 0. */
function rateLimited(ip: string, now: number): number {
  const h = hits.get(ip);
  if (!h || now - h.start >= RATE_WINDOW_MS) {
    hits.set(ip, { start: now, count: 1 });
    if (hits.size > 10_000) for (const [k, v] of hits) if (now - v.start >= RATE_WINDOW_MS) hits.delete(k);
    return 0;
  }
  h.count++;
  return h.count > RATE_LIMIT ? Math.ceil((h.start + RATE_WINDOW_MS - now) / 1000) : 0;
}

type Upstream = { kind: "png"; png: Buffer } | { kind: "missing" } | { kind: "failed" };

async function fetchFrom(origin: string, id: string): Promise<Upstream> {
  try {
    const res = await fetch(`${origin}/maimai-mobile/img/Icon/${id}.png`, { redirect: "manual", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (res.status === 404) return { kind: "missing" };
    if (res.status !== 200) return { kind: "failed" };
    if ((res.headers.get("content-type") || "").split(";")[0].trim() !== "image/png") return { kind: "failed" };
    if (Number(res.headers.get("content-length") || 0) > MAX_BYTES || !res.body) return { kind: "failed" };
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      size += chunk.length;
      if (size > MAX_BYTES) return { kind: "failed" };
      chunks.push(Buffer.from(chunk));
    }
    return { kind: "png", png: Buffer.concat(chunks) };
  } catch {
    return { kind: "failed" };
  }
}

async function loadIcon(id: string): Promise<IconResult> {
  const hit = cache.get(id);
  if (hit) return { ok: true, png: hit };
  let missing = false;
  for (const origin of ORIGINS) {
    const r = await fetchFrom(origin, id);
    if (r.kind === "png") {
      cache.set(id, r.png);
      if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
      return { ok: true, png: r.png };
    }
    if (r.kind === "missing") missing = true;
  }
  // 한 곳이라도 없다고 답했으면 404. maimaidx.jp 는 중간 인증서를 보내지 않아 Node 에서 늘 TLS 오류라
  // 국제판이 404 면 일본판 확인 없이 404 가 된다.
  return missing ? { ok: false, status: 404, error: "not_found" } : { ok: false, status: 502, error: "upstream_failed" };
}

export async function handleIconRequest(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
  const json = (status: number, error: string, extra: Record<string, string> = {}) => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...extra });
    res.end(JSON.stringify({ error }));
  };

  const id = pathname.slice(ICON_PATH_PREFIX.length);
  if (!ID_RE.test(id)) { json(400, "invalid_id"); return; }

  const retryAfter = rateLimited(clientIp(req), Date.now());
  if (retryAfter) { json(429, "rate_limited", { "retry-after": String(retryAfter) }); return; }

  let p = inFlight.get(id);
  if (!p) {
    p = loadIcon(id).finally(() => inFlight.delete(id));
    inFlight.set(id, p);
  }
  const r = await p;
  if (!r.ok) { json(r.status, r.error); return; }
  res.writeHead(200, { "content-type": "image/png", "cache-control": "public, max-age=3600" });
  res.end(r.png);
}
