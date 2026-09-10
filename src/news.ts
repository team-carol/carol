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

/**
 * 조건부 요청으로 출처를 읽는다. 변경이 없으면 notModified=true 로 즉시 반환.
 * items 는 오래된 것부터(게시 순서대로) 정렬해 돌려준다.
 */
export async function fetchNews(
  source: NewsSource,
  prev?: { etag?: string; lastModified?: string } | null,
): Promise<NewsFetchResult> {
  const headers: Record<string, string> = { "user-agent": USER_AGENT, accept: "*/*" };
  if (prev?.etag) headers["if-none-match"] = prev.etag;
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
  if (res.status === 304) return { notModified: true, items: [], etag: prev?.etag ?? "", lastModified: prev?.lastModified ?? "" };
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const body = await res.text();
  const items = source === "jp" ? parseJpFeed(body) : parseIntlBanners(body);
  // 두 출처 모두 최신순으로 내려주므로 뒤집어 오래된 것부터 게시되게 한다.
  return { notModified: false, items: items.reverse(), etag, lastModified };
}
