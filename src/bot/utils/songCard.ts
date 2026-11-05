/**
 * 곡 하나를 보여 주는 Components V2 컨테이너(/곡추천·/랜덤·/운세). /검색 결과와 같은 모양을 쓴다:
 * 제목(### 곡명 + ST/DX 배지)·난이도 배지와 상수·추가 줄, 오른쪽에 재킷 썸네일, 구분선 아래 작은 글씨, 외부 출력 버튼.
 *
 * 재킷은 주소만 걸면 안 보인다 — DX NET 이 디스코드 봇(Discordbot) 요청에 404 를 준다. 그래서 /검색처럼 서버가 받아
 * (DB 캐시, embeds.ts jacketBuffer) 첨부 파일로 붙인다.
 *
 * 컴포넌트 수 한도(메시지 전체 40개)를 지키려고 한 곡은 많아야 8개(컨테이너·섹션·글·썸네일·구분선·작은 글·버튼 줄·버튼)이고,
 * 작은 글이 없으면 구분선도 빼 6개다.
 */
import {
  AttachmentBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, SectionBuilder, SeparatorSpacingSize, ActionRowBuilder, escapeMarkdown,
} from "discord.js";
import { jacketBuffer } from "./embeds";
import { kindEmoji, diffBadgeEmoji } from "./emoji";
import { displayTitle } from "../../aliases";
import { MAI_DIFF_COLOR } from "../../games";
import { msg } from "../../messages";
import type { PlayRecord } from "../../scraper";

export interface SongCardInput {
  title: string;
  kind: "ST" | "DX" | string;
  diff: string;
  /** 상수(숫자면 소수 첫째 자리까지) 또는 레벨 글자 */
  constant: number | string;
  translate: boolean;
  /** 난이도 줄 뒤에 붙일 말(예: "신곡") */
  chartSuffix?: string;
  /** 난이도 줄 아래 줄들 */
  lines?: string[];
  /** 구분선 아래 작은 글씨 줄들(-# 는 붙여 준다) */
  foot?: string[];
  /** 컨테이너 띠 색. 기본은 난이도 색 */
  accent?: number;
  /** 곡 아래 큰 그림(첨부 파일 이름, 예: 운세 보면 미리보기 GIF) */
  image?: string;
  /** 작은 글 위 구분선. 곡이 많아 컴포넌트 한도(40)에 걸릴 때 끈다(기본 켬) */
  separator?: boolean;
  /** 외부 출력(유튜브 검색) 버튼. 기본 켬 */
  external?: boolean;
}

export function diffColor(diff: string): number {
  return parseInt((MAI_DIFF_COLOR[diff] ?? "#9333ea").slice(1), 16);
}

function youtubeUrl(title: string, kind: string, diff: string): string {
  const q = `maimai ${title} ${kind} ${diff} 外部出力`.replace(/\s+/g, " ").trim();
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
}

/** 곡 재킷을 첨부 파일로(못 받으면 null). name 은 메시지 안에서 겹치지 않게. */
export async function jacketAttachment(title: string, kind: string, name: string): Promise<AttachmentBuilder | null> {
  const buf = await jacketBuffer({
    title, diff: "BASIC", level: "?", date: "", jacketUrl: "", musicKind: kind, achievementVal: 0, track: 0, fc: "", sync: "",
  } as PlayRecord).catch(() => null);
  return buf ? new AttachmentBuilder(buf, { name }) : null;
}

/** 곡 컨테이너. jacket 은 jacketAttachment 결과(없으면 썸네일 없이). */
export function songContainer(c: SongCardInput, jacket: AttachmentBuilder | null): ContainerBuilder {
  const constant = typeof c.constant === "number" ? c.constant.toFixed(1) : c.constant;
  // 모바일에서는 썸네일 옆 글 폭이 좁아 줄마다 짧게 둔다(명령 쪽 lines 도 한 줄에 하나씩).
  const heading = [
    msg("searchResult.title", { title: escapeMarkdown(displayTitle(c.title, c.translate)), kind: c.kind ? ` ${kindEmoji(c.kind)}` : "" }),
    msg("songCard.chart", { diff: diffBadgeEmoji(c.diff), constant }) + (c.chartSuffix ? msg("songCard.chartSuffix", { text: c.chartSuffix }) : ""),
    ...(c.lines ?? []),
  ].join("\n");
  const container = new ContainerBuilder().setAccentColor(c.accent ?? diffColor(c.diff));
  if (jacket?.name) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents((t) => t.setContent(heading))
        .setThumbnailAccessory((t) => t.setURL(`attachment://${jacket.name}`)),
    );
  } else {
    container.addTextDisplayComponents((t) => t.setContent(heading));
  }
  if (c.image) container.addMediaGalleryComponents((g) => g.addItems((it) => it.setURL(`attachment://${c.image}`)));
  if (c.foot?.length) {
    if (c.separator !== false) container.addSeparatorComponents((s) => s.setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents((t) => t.setContent(c.foot!.map((l) => `-# ${l}`).join("\n")));
  }
  if (c.external !== false) {
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setURL(youtubeUrl(c.title, c.kind, c.diff)).setLabel(msg("searchResult.externalButton")).setStyle(ButtonStyle.Link),
      ),
    );
  }
  return container;
}
