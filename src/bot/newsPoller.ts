// 공식 사이트 공지 폴링 → 서버별로 지정된 채널에 게시.
// 조건부 요청이 걸려 있어 변경이 없으면 네트워크 비용이 사실상 0이다.
import { Client, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, type ButtonInteraction } from "discord.js";
import { fetchNews, fetchArticleImage, NEWS_SOURCES, type NewsItem, type NewsSource } from "../news";
import {
  listNewsChannels, getSeenNewsIds, markNewsSeen, getNewsFeedState, setNewsFeedState,
  saveNewsArticle, getNewsArticle, pruneNewsArticles,
} from "../storage";
import { msg } from "../messages";
import { isConfigured as canTranslate, translateNewsItem } from "../translate";
import { isNewsSource } from "../news";

// 두 출처 모두 CloudFront 뒤에 있고 ETag/Last-Modified 를 주므로, 변경이 없으면
// 304(본문 0바이트)로 끝난다. 엣지 캐시가 갱신되는 순간을 빨리 잡으려고 짧게 잡았다.
// 실제 반영 지연의 하한은 우리 주기가 아니라 CDN 전파 시간이다.
export const NEWS_POLL_INTERVAL_MS = 5 * 60 * 1000;
// 매번 정확히 같은 시각에 몰리지 않도록 흔든다.
const POLL_JITTER_MS = 45 * 1000;
// 다운타임 뒤 한꺼번에 쏟아지는 것을 막는다. 초과분은 게시 없이 '본 것'으로만 기록.
const MAX_POST_PER_POLL = 5;

const SOURCE_COLOR: Record<NewsSource, number> = { jp: 0xe4007f, intl: 0x00a0e9 };
// 본문 보관 기간. 지난 뒤엔 버튼이 "기간 지남" 안내로 응답한다.
export const ARTICLE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const ARTICLE_PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;
// 임베드 설명 한도는 4096자. 여유를 두고 자르고 원문 링크를 남긴다.
const DETAIL_LIMIT = 3800;

// jp 의 guid 는 "https://info-maimai.sega.jp/?p=9577" 형태다. customId 100자 제한
// 안에 들어가도록 글 번호만 싣고, 조회할 때 원래 형태로 되돌린다.
export function postKeyOf(itemId: string): string {
  return itemId.match(/[?&]p=(\d+)/)?.[1] ?? itemId.slice(-40);
}
function itemIdOfPostKey(key: string): string {
  return /^\d+$/.test(key) ? `https://info-maimai.sega.jp/?p=${key}` : key;
}

function detailButtons(itemId: string, hasTranslation: boolean): ActionRowBuilder<ButtonBuilder> {
  const key = postKeyOf(itemId);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`news:src:${key}`).setLabel(msg("news.viewOriginal")).setStyle(ButtonStyle.Secondary),
  );
  if (hasTranslation) {
    row.addComponents(
      new ButtonBuilder().setCustomId(`news:ko:${key}`).setLabel(msg("news.viewTranslated")).setStyle(ButtonStyle.Primary),
    );
  }
  return row;
}

function clip(text: string, url: string): string {
  if (text.length <= DETAIL_LIMIT) return text;
  return text.slice(0, DETAIL_LIMIT) + msg("news.truncated", { url });
}

export function buildPost(
  source: NewsSource,
  item: NewsItem,
  titleKo?: string,
  hasBody = false,
): { content?: string; embeds?: EmbedBuilder[]; components?: ActionRowBuilder<ButtonBuilder>[] } {
  // 국제판은 배너 이미지 한 장이 공지 전체다. URL 만 보내면 디스코드가 크게 렌더한다.
  if (source === "intl") return { content: item.imageUrl };
  const embed = new EmbedBuilder()
    .setColor(SOURCE_COLOR.jp)
    .setTitle(item.title?.slice(0, 256) || msg("news.untitled"))
    .setAuthor({ name: msg("news.sourceJp") });
  if (item.url) embed.setURL(item.url);
  // 번역 제목을 본문 자리에 한 줄로 얹어 클릭 없이도 내용을 알 수 있게 한다.
  const lines = [titleKo ? msg("news.titleKo", { title: titleKo }) : "", item.summary ?? ""].filter(Boolean);
  if (lines.length) embed.setDescription(lines.join("\n\n"));
  if (item.imageUrl) embed.setImage(item.imageUrl);
  if (item.publishedAt) embed.setTimestamp(new Date(item.publishedAt));
  return {
    embeds: [embed],
    components: hasBody ? [detailButtons(item.id, !!titleKo)] : [],
  };
}

async function postToChannels(
  client: Client,
  source: NewsSource,
  targets: readonly { guildId: string; channelId: string }[],
  items: readonly NewsItem[],
  titleKo: ReadonlyMap<string, string>,
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
        await channel.send(buildPost(source, item, titleKo.get(item.id), !!item.body));
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
    const titleKo = new Map<string, string>();
    if (source === "jp" && targets.length) {
      await Promise.all(toPost.map(async (item) => {
        if (!item.url) return;
        try {
          item.imageUrl = await fetchArticleImage(item.url);
        } catch (e) {
          console.warn(`[news] 대표 이미지 조회 실패 ${item.url}:`, e instanceof Error ? e.message : e);
        }
      }));
      // 번역은 게시 시점에 한 번만 한다(새 공지 수만큼). 버튼 응답은 DB 조회로 끝난다.
      // 실패해도 원문 게시는 그대로 진행한다.
      for (const item of toPost) {
        // 제목·본문을 한 번에 번역해 같은 고유명사가 다르게 표기되는 것을 막는다.
        const ko = canTranslate()
          ? await translateNewsItem(item.title ?? "", item.body ?? "")
          : {};
        const bodyKo = ko.body;
        if (ko.title) titleKo.set(item.id, ko.title);
        try {
          await saveNewsArticle({
            source, itemId: item.id, title: item.title ?? "", titleKo: ko.title ?? "",
            url: item.url ?? "", body: item.body ?? "", bodyKo: bodyKo ?? "",
          });
        } catch (e) {
          console.error(`[news] 본문 저장 실패 ${item.id}:`, e instanceof Error ? e.message : e);
        }
      }
    }
    if (targets.length) await postToChannels(client, source, targets, toPost, titleKo);
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

// 버튼: news:<src|ko>:<글번호>
export async function handleNewsButton(interaction: ButtonInteraction): Promise<void> {
  const [, mode, key] = interaction.customId.split(":");
  if (!key) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const article = await getNewsArticle("jp", itemIdOfPostKey(key)) as
    { title: string; titleKo: string; url: string; body: string; bodyKo: string } | null;
  if (!article) {
    // 보관 기간이 지났거나 이 봇이 게시하지 않은 공지.
    await interaction.editReply({ content: msg("news.detailExpired") });
    return;
  }
  const translated = mode === "ko";
  const text = translated ? article.bodyKo : article.body;
  if (!text) {
    await interaction.editReply({ content: msg("news.detailEmpty", { url: article.url }) });
    return;
  }
  const embed = new EmbedBuilder()
    .setColor(SOURCE_COLOR.jp)
    .setTitle(((translated && article.titleKo) || article.title).slice(0, 256))
    .setDescription(clip(text, article.url));
  if (article.url) embed.setURL(article.url);
  if (translated) embed.setFooter({ text: msg("news.machineTranslated") });
  await interaction.editReply({ embeds: [embed] });
}

async function pruneArticles(): Promise<void> {
  try {
    const removed = await pruneNewsArticles(ARTICLE_RETENTION_MS) as number;
    if (removed > 0) console.log(`[news] 보관 기간 지난 공지 본문 ${removed}건 정리`);
  } catch (e) {
    console.error("[news] 본문 정리 실패:", e instanceof Error ? e.message : e);
  }
}

export function startNewsPoller(client: Client): void {
  void runNewsPoll(client);
  void pruneArticles();
  setInterval(() => void pruneArticles(), ARTICLE_PRUNE_INTERVAL_MS);
  const tick = (): void => {
    void runNewsPoll(client);
    setTimeout(tick, NEWS_POLL_INTERVAL_MS + Math.floor(Math.random() * POLL_JITTER_MS));
  };
  setTimeout(tick, NEWS_POLL_INTERVAL_MS + Math.floor(Math.random() * POLL_JITTER_MS));
}
