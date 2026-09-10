// maimai 공식 사이트 공지 폴링.
//   jp   : info-maimai.sega.jp 의 WordPress RSS (제목·링크·요약)
//   intl : maimai.sega.com 의 배너 캐러셀 JSON (이미지만)
// 두 출처 모두 ETag/Last-Modified 를 주므로 조건부 요청으로 변경 없을 땐 0바이트로 끝난다.
import * as cheerio from "cheerio";

export const NEWS_SOURCES = ["jp", "intl"] as const;
export type NewsSource = (typeof NEWS_SOURCES)[number];
export function isNewsSource(v: string): v is NewsSource {
  return (NEWS_SOURCES as readonly string[]).includes(v);
}

export interface NewsItem {
  /** 중복 게시 판정 키. jp=guid, intl=배너 image 경로 */
  id: string;
  title?: string;
  url?: string;
  summary?: string;
  /** 공지 본문 전문(텍스트). jp 만. RSS 의 content:encoded 에서 뽑는다. */
  body?: string;
  imageUrl?: string;
  publishedAt?: number;
}

export interface NewsFetchResult {
  notModified: boolean;
  items: NewsItem[];
  etag: string;
  lastModified: string;
}

export const SOURCE_URL: Record<NewsSource, string> = {
  jp: "https://info-maimai.sega.jp/feed/",
  intl: "https://maimai.sega.com/assets/data/banners.json",
};

// 배너 이미지 URL 조립 규칙은 사이트의 top.js 와 동일하다:
//   "/assets/img/download/pop" + banners.json 의 image + ".jpg"
// (image 자체가 "/download/2026-09-04-2/pop" 형태라 경로가 겹쳐 보이지만 이게 맞다)
const INTL_IMAGE_PREFIX = "https://maimai.sega.com/assets/img/download/pop";
const INTL_IMAGE_SUFFIX = ".jpg";

const FETCH_TIMEOUT_MS = 15000;
const USER_AGENT = "carolbot/1.0 (+https://github.com/team-carol/carol)";

function textOf(html: string, limit: number): string {
  const text = cheerio.load(html).root().text().replace(/\s+/g, " ").trim();
  return text.length > limit ? text.slice(0, limit - 1) + "…" : text;
}

// 본문 전문. <br>/<p> 를 줄바꿈으로 살려서 문단 구조를 유지한다(번역 품질과 가독성 모두에 필요).
function bodyTextOf(html: string): string {
  const $ = cheerio.load(html);
  $("script, style").remove();
  $("br").replaceWith("\n");
  $("p, div, li, tr, h1, h2, h3, h4").each((_, el) => { $(el).append("\n"); });
  return $.root().text()
    .replace(/[ \t\u3000]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseJpFeed(xml: string): NewsItem[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const items: NewsItem[] = [];
  $("item").each((_, el) => {
    const item = $(el);
    const id = item.find("guid").first().text().trim() || item.find("link").first().text().trim();
    if (!id) return;
    const published = Date.parse(item.find("pubDate").first().text().trim());
    items.push({
      id,
      title: item.find("title").first().text().trim(),
      url: item.find("link").first().text().trim(),
      summary: textOf(item.find("description").first().text(), 300),
      body: bodyTextOf(item.find("content\\:encoded").first().text() || item.find("description").first().text()),
      publishedAt: Number.isFinite(published) ? published : undefined,
    });
  });
  return items;
}

export function parseIntlBanners(json: string): NewsItem[] {
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) return [];
  const items: NewsItem[] = [];
  for (const row of parsed) {
    if (!row || typeof row !== "object") continue;
    const image = "image" in row && typeof row.image === "string" ? row.image.trim() : "";
    if (!image) continue;
    items.push({ id: image, imageUrl: INTL_IMAGE_PREFIX + image + INTL_IMAGE_SUFFIX });
  }
  return items;
}

// CloudFront 는 Accept-Encoding 별로 캐시를 나눠 갖고 TTL 이 길다. 한쪽 변형만
// 수십 시간 낡은 채로 남는 일이 실제로 있다(실측: gzip 19.4h / identity 0.4h).
// Cache-Control: no-cache 도 쿼리스트링 캐시버스터도 무시되므로, 두 변형을 모두
// 물어보고 Last-Modified 가 더 최신인 응답을 쓴다.
// intl 은 항상 age=0 으로 내려와 변형을 나눌 필요가 없다.
const SOURCE_ENCODINGS: Record<NewsSource, readonly string[]> = {
  jp: ["identity", "gzip"],
  intl: [""],
};

interface VariantResult {
  notModified: boolean;
  body: string;
  etag: string;
  lastModified: string;
}

async function requestVariant(
  source: NewsSource,
  encoding: string,
  prev?: { etag?: string; lastModified?: string } | null,
  useEtag = true,
): Promise<VariantResult> {
  const headers: Record<string, string> = { "user-agent": USER_AGENT, accept: "*/*" };
  if (encoding) headers["accept-encoding"] = encoding;
  // 변형마다 ETag 가 달라, 여러 변형을 볼 땐 날짜 기반 검증자만 쓴다.
  if (useEtag && prev?.etag) headers["if-none-match"] = prev.etag;
  if (prev?.lastModified) headers["if-modified-since"] = prev.lastModified;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(SOURCE_URL[source], { headers, signal: controller.signal, redirect: "follow" });
  } finally {
    clearTimeout(timer);
  }
  const etag = res.headers.get("etag") ?? "";
  const lastModified = res.headers.get("last-modified") ?? "";
  if (res.status === 304) return { notModified: true, body: "", etag, lastModified };
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { notModified: false, body: await res.text(), etag, lastModified };
}

// 내수판 목록에 보이는 대표 이미지는 WordPress 의 featured image 라 RSS 에 없다
// (content:encoded 의 첫 이미지는 본문 삽화라 다른 그림이다). 글 페이지의 og:image 를 쓴다.
// 새로 게시할 항목에 대해서만 부르므로 폴링 비용에는 영향이 없다.
const OG_IMAGE = /<meta[^>]+(?:property|name)=["']og:image["'][^>]*content=["']([^"']+)["']/i;
const OG_IMAGE_REVERSED = /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']og:image["']/i;

export async function fetchArticleImage(url: string): Promise<string | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html", "accept-encoding": "identity" },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) return undefined;
    const html = await res.text();
    const hit = OG_IMAGE.exec(html) ?? OG_IMAGE_REVERSED.exec(html);
    return hit?.[1];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 조건부 요청으로 출처를 읽는다. 변경이 없으면 notModified=true 로 즉시 반환.
 * items 는 오래된 것부터(게시 순서대로) 정렬해 돌려준다.
 */
export async function fetchNews(
  source: NewsSource,
  prev?: { etag?: string; lastModified?: string } | null,
): Promise<NewsFetchResult> {
  const encodings = SOURCE_ENCODINGS[source];
  const settled = await Promise.allSettled(
    encodings.map((enc) => requestVariant(source, enc, prev, encodings.length === 1)),
  );
  const fresh = settled
    .filter((r): r is PromiseFulfilledResult<VariantResult> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((r) => !r.notModified);

  // 전부 304 거나 전부 실패. 하나라도 성공했으면(=304) 변경 없음으로 본다.
  if (!fresh.length) {
    if (settled.every((r) => r.status === "rejected")) {
      throw settled[0].status === "rejected" ? settled[0].reason : new Error("fetch failed");
    }
    return { notModified: true, items: [], etag: prev?.etag ?? "", lastModified: prev?.lastModified ?? "" };
  }

  // 낡은 엣지가 준 오래된 복사본을 쓰지 않도록 Last-Modified 최신순으로 고른다.
  fresh.sort((a, b) => (Date.parse(b.lastModified) || 0) - (Date.parse(a.lastModified) || 0));
  const best = fresh[0];
  const items = source === "jp" ? parseJpFeed(best.body) : parseIntlBanners(best.body);
  // 두 출처 모두 최신순으로 내려주므로 뒤집어 오래된 것부터 게시되게 한다.
  return { notModified: false, items: items.reverse(), etag: best.etag, lastModified: best.lastModified };
}
