// 공식 사이트 공지 폴링 → 서버별로 지정된 채널에 게시.
// 조건부 요청이 걸려 있어 변경이 없으면 네트워크 비용이 사실상 0이다.
import { Client, EmbedBuilder } from "discord.js";
import { fetchNews, NEWS_SOURCES, type NewsItem, type NewsSource } from "../news";
import {
  listNewsChannels, getSeenNewsIds, markNewsSeen, getNewsFeedState, setNewsFeedState,
} from "../storage";
import { msg } from "../messages";

export const NEWS_POLL_INTERVAL_MS = 30 * 60 * 1000;
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
    await setNewsFeedState(source, res.etag, res.lastModified);
    console.log(`[news] ${source} 기준선 설정: ${res.items.length}건 (게시하지 않음)`);
    return;
  }

  if (fresh.length) {
    const toPost = fresh.slice(-MAX_POST_PER_POLL);
    const skipped = fresh.length - toPost.length;
    const targets = await listNewsChannels(source) as { guildId: string; channelId: string }[];
    if (targets.length) await postToChannels(client, source, targets, toPost);
    await markNewsSeen(source, fresh.map((i) => i.id));
    console.log(`[news] ${source} 새 공지 ${fresh.length}건 → ${targets.length}개 채널 게시${skipped ? ` (오래된 ${skipped}건은 건너뜀)` : ""}`);
  }
  await setNewsFeedState(source, res.etag, res.lastModified);
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
  setInterval(() => void runNewsPoll(client), NEWS_POLL_INTERVAL_MS);
}
