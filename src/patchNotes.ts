import * as https from "https";
import type { IncomingMessage } from "http";

const DEFAULT_PATCH_NOTES_ACCOUNT = "carolbot_maimai";
const DEFAULT_PATCH_NOTES_FEED_URL = `https://nitter.net/${DEFAULT_PATCH_NOTES_ACCOUNT}/rss`;
const XCANCEL_WHITELIST_TITLE = "RSS reader not yet whitelisted!";

export interface PatchNoteEntry {
  readonly title: string;
  readonly link: string;
  readonly publishedAt: number | null;
  readonly summary: string;
}

export interface PatchNotesFeed {
  readonly label: string;
  readonly url: string;
  readonly entries: readonly PatchNoteEntry[];
}

function patchNotesUrl(): string | null {
  return DEFAULT_PATCH_NOTES_FEED_URL;
}

export function hasPatchNotesFeed(): boolean {
  return true;
}

export function patchNotesFeedLabel(): string {
  return "패치노트";
}

function normalizedText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function stripHtml(value: string): string {
  return normalizedText(
    decodeXmlEntities(value)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  );
}

function parsePublishedAt(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  const timestamp = Date.parse(text);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function firstTagText(block: string, tagName: string): string {
  const pattern = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = block.match(pattern);
  return match ? normalizedText(decodeXmlEntities(match[1])) : "";
}

function firstLinkHref(block: string): string {
  const match = block.match(/<link\b[^>]*href="([^"]+)"[^>]*\/?>/i);
  return match ? normalizedText(decodeXmlEntities(match[1])) : "";
}

function parseRssItems(xml: string): PatchNoteEntry[] {
  const matches = xml.match(/<item>([\s\S]*?)<\/item>/gi) ?? [];
  return matches.map((block) => ({
    title: firstTagText(block, "title"),
    link: firstTagText(block, "link"),
    publishedAt: parsePublishedAt(firstTagText(block, "pubDate")),
    summary: stripHtml(firstTagText(block, "description")),
  })).filter((entry) => entry.title.length > 0 && entry.link.length > 0);
}

function parseAtomEntries(xml: string): PatchNoteEntry[] {
  const matches = xml.match(/<entry>([\s\S]*?)<\/entry>/gi) ?? [];
  return matches.map((block) => ({
    title: firstTagText(block, "title"),
    link: firstLinkHref(block),
    publishedAt: parsePublishedAt(firstTagText(block, "published") || firstTagText(block, "updated")),
    summary: stripHtml(firstTagText(block, "summary") || firstTagText(block, "content")),
  })).filter((entry) => entry.title.length > 0 && entry.link.length > 0);
}

function dedupeEntries(entries: readonly PatchNoteEntry[]): PatchNoteEntry[] {
  const seen = new Set<string>();
  const result: PatchNoteEntry[] = [];
  for (const entry of entries) {
    const key = `${entry.link}\n${entry.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(entry);
  }
  return result;
}

function parseFeed(xml: string): PatchNoteEntry[] {
  const rssEntries = parseRssItems(xml);
  if (rssEntries.length > 0) return dedupeEntries(rssEntries);
  return dedupeEntries(parseAtomEntries(xml));
}

function requestText(url: string): Promise<{ statusCode: number; body: string }> {
  return requestTextOnce(url).catch(async (error: unknown) => {
    if (!isTransientPatchNotesRequestError(error)) throw error;
    return requestTextOnce(url);
  });
}

export function isTransientPatchNotesRequestError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = typeof (error as { code?: unknown }).code === "string" ? (error as { code?: string }).code : undefined;
  return error.message === "socket hang up" || code === "ECONNRESET" || code === "ETIMEDOUT" || code === "EAI_AGAIN";
}

function requestTextOnce(url: string): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1",
        "user-agent": "Mozilla/5.0 (compatible; carolbot/0.6; +https://nitter.net)",
      },
    }, (res: IncomingMessage) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => { body += chunk; });
      res.on("end", () => {
        resolve({ statusCode: res.statusCode ?? 0, body });
      });
    });

    req.setTimeout(8000, () => {
      req.destroy(new Error("patch_notes_feed_timeout"));
    });
    req.on("error", reject);
  });
}

export async function fetchPatchNotes(limit: number): Promise<PatchNotesFeed> {
  const url = patchNotesUrl();
  if (!url) {
    throw new Error("patch_notes_feed_missing");
  }

  const response = await requestText(url);
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`patch_notes_feed_http_${response.statusCode}`);
  }

  const xml = response.body;
  const entries = parseFeed(xml).slice(0, limit);
  if (entries[0]?.title === XCANCEL_WHITELIST_TITLE) {
    throw new Error("patch_notes_feed_whitelist_required");
  }
  return {
    label: patchNotesFeedLabel(),
    url,
    entries,
  };
}
