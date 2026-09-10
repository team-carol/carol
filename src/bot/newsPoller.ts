// 공식 사이트 공지 폴링 → 서버별로 지정된 채널에 게시.
// 조건부 요청이 걸려 있어 변경이 없으면 네트워크 비용이 사실상 0이다.
import { Client, EmbedBuilder } from "discord.js";
import { fetchNews, fetchArticleImage, NEWS_SOURCES, type NewsItem, type NewsSource } from "../news";
import {
  listNewsChannels, getSeenNewsIds, markNewsSeen, getNewsFeedState, setNewsFeedState,
} from "../storage";
import { msg } from "../messages";

// 두 출처 모두 CloudFront 뒤에 있고 ETag/Last-Modified 를 주므로, 변경이 없으면
// 304(본문 0바이트)로 끝난다. 엣지 캐시가 갱신되는 순간을 빨리 잡으려고 짧게 잡았다.
// 실제 반영 지연의 하한은 우리 주기가 아니라 CDN 전파 시간이다.
export const NEWS_POLL_INTERVAL_MS = 5 * 60 * 1000;
// 매번 정확히 같은 시각에 몰리지 않도록 흔든다.
const POLL_JITTER_MS = 45 * 1000;
// 다운타임 뒤 한꺼번에 쏟아지는 것을 막는다. 초과분은 게시 없이 '본 것'으로만 기록.
const MAX_POST_PER_POLL = 5;

const SOURCE_COLOR: Record<NewsSource, number> = { jp: 0xe4007f, intl: 0x00a0e9 };

export function buildPost(source: NewsSource, item: NewsItem): { content?: string; embeds?: EmbedBuilder[] } {
  // 국제판은 배너 이미지 한 장이 공지 전체다. URL 만 보내면 디스코드가 크게 렌더한다.
  if (source === "intl") return { content: item.imageUrl };
  const embed = new EmbedBuilder()
    .setColor(SOURCE_COLOR.jp)
    .setTitle(item.title?.slice(0, 256) || msg("news.untitled"))
    .setAuthor({ name: msg("news.sourceJp") });
  if (item.url) embed.setURL(item.url);
  if (item.summary) embed.setDescription(item.summary);
  if (item.imageUrl) embed.setImage(item.imageUrl);
  if (item.publishedAt) embed.setTimestamp(new Date(item.publishedAt));
  return { embeds: [embed] };
}

async function postToChannels(
  client: Client,
  source: NewsSource,
  targets: readonly { guildId: string; channelId: string }[],
  items: readonly NewsItem[],
): Promise<void> {
  for (const target of targets) {
    let channel;
    try {
      channel = await client.channels.fetch(target.channelId);
    } catch (e) {
      console.warn(`[news] 채널 조회 실패 guild=${target.guildId} channel=${target.channelId}:`, e instanceof Error ? e.message : e);
      continue;
    }
    // PartialGroupDMChannel 등 send 가 없는 텍스트 채널 타입을 제외한다.
    if (!channel || !channel.isTextBased() || !("send" in channel)) continue;
    for (const item of items) {
      try {
        await channel.send(buildPost(source, item));
      } catch (e) {
        // 권한 부족 등. 한 채널이 막혀도 나머지 채널·항목은 계속 진행한다.
        console.warn(`[news] 게시 실패 guild=${target.guildId} channel=${target.channelId} item=${item.id}:`, e instanceof Error ? e.message : e);
        break;
      }
    }
  }
}

async function pollSource(client: Client, source: NewsSource): Promise<void> {
  const state = await getNewsFeedState(source) as { etag: string; lastModified: string } | null;
  const res = await fetchNews(source, state);
  if (res.notModified) return;

  const seen = await getSeenNewsIds(source) as Set<string>;
  const fresh = res.items.filter((i) => !seen.has(i.id));

  // 첫 폴링은 기준선만 잡는다. 이걸 빼면 최초 가동 때 과거 공지가 통째로 올라간다.
  if (seen.size === 0) {
    await markNewsSeen(source, res.items.map((i) => i.id));
    await saveState(source, state, res.etag, res.lastModified);
    console.log(`[news] ${source} 기준선 설정: ${res.items.length}건 (게시하지 않음)`);
    return;
  }

  if (fresh.length) {
    const toPost = fresh.slice(-MAX_POST_PER_POLL);
    const skipped = fresh.length - toPost.length;
    const targets = await listNewsChannels(source) as { guildId: string; channelId: string }[];
    // 내수판은 목록에 보이는 대표 이미지(글 페이지의 og:image)를 임베드에 붙인다.
    // 실제로 게시할 항목에만 붙이므로 추가 요청은 새 공지 수만큼이다.
    if (source === "jp" && targets.length) {
      await Promise.all(toPost.map(async (item) => {
        if (!item.url) return;
        try {
          item.imageUrl = await fetchArticleImage(item.url);
        } catch (e) {
          console.warn(`[news] 대표 이미지 조회 실패 ${item.url}:`, e instanceof Error ? e.message : e);
        }
      }));
    }
    if (targets.length) await postToChannels(client, source, targets, toPost);
    await markNewsSeen(source, fresh.map((i) => i.id));
    console.log(`[news] ${source} 새 공지 ${fresh.length}건 → ${targets.length}개 채널 게시${skipped ? ` (오래된 ${skipped}건은 건너뜀)` : ""}`);
  }
  await saveState(source, state, res.etag, res.lastModified);
}

// CloudFront 엣지마다 캐시 버전이 달라 가끔 더 오래된 응답이 온다. 그 응답의 검증자로
// 덮어쓰면 다음 요청이 불필요하게 200(전문)을 받게 되므로, 더 오래된 것은 무시한다.
async function saveState(
  source: NewsSource,
  prev: { etag: string; lastModified: string } | null,
  etag: string,
  lastModified: string,
): Promise<void> {
  const prevAt = prev?.lastModified ? Date.parse(prev.lastModified) : NaN;
  const nextAt = lastModified ? Date.parse(lastModified) : NaN;
  if (Number.isFinite(prevAt) && Number.isFinite(nextAt) && nextAt < prevAt) return;
  await setNewsFeedState(source, etag, lastModified);
}

export async function runNewsPoll(client: Client): Promise<void> {
  for (const source of NEWS_SOURCES) {
    try {
      await pollSource(client, source);
    } catch (e) {
      console.error(`[news] ${source} 폴링 실패:`, e instanceof Error ? e.message : e);
    }
  }
}

export function startNewsPoller(client: Client): void {
  void runNewsPoll(client);
  const tick = (): void => {
    void runNewsPoll(client);
    setTimeout(tick, NEWS_POLL_INTERVAL_MS + Math.floor(Math.random() * POLL_JITTER_MS));
  };
  setTimeout(tick, NEWS_POLL_INTERVAL_MS + Math.floor(Math.random() * POLL_JITTER_MS));
}
