import {
  ACCENT, SURFACE2, BORDER, TEXT, MUTED, CANVAS, INK, SOFT, FAINT, NUM_FONT, TROPHY_STYLE,
  type El, el, image, pill, remoteDataUrl, kstStamp, wordmark, statsPanel, panel,
} from "./cardKit";
import { renderInWorker } from "./renderPool";
import { fetchJacketDataUrl } from "./ratingCard";
import { alignLeftMargin } from "./textMetrics";
import type { CachedProfile } from "../../storage/types";
import type { CircleInfo, CircleMember } from "../../scraper";
import { getJacketFile, getTitleByJacket } from "../../constants";
import { displayTitle } from "../../aliases";
import { msg, cardTextSignature } from "../../messages";

// /서클 이미지 카드. /프로필 카드와 같은 부품(cardKit)·토큰을 쓴다.
// 헤더(서클 이름·코드·소개) → 포인트·순위·보상·멤버 수 → 서클 챌린지(+다음 주 예고) → 멤버 포인트(2열).

const CIRCLE_CARD_VERSION = 2;
const CIRCLE_CARD_CACHE_MAX = 32;
const circleCardCache = new Map<string, Buffer>();
const fmt = (n: number) => n.toLocaleString("en-US");

/** DX NET 재킷 URL 을 먼저 쓰고, 실패하면 otoge-db 재킷(같은 파일명)으로. */
async function jacketData(url: string | undefined, title?: string | null): Promise<string | null> {
  const direct = url ? await remoteDataUrl(url) : null;
  if (direct) return direct;
  const file = title ? getJacketFile(title) : url?.split("/").pop() ?? null;
  return file ? fetchJacketDataUrl(file) : null;
}

// DX NET 서클 챌린지 게이지. 멤버 달성률 합계를 1000% 기준으로 채우고, 100% 마다 눈금(9개)이 있다.
function gaugeBar(percent: number): El {
  const width = Math.max(0, Math.min(100, percent));
  return el("div", { display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }, [
    el("div", { display: "flex", position: "relative", height: 10, borderRadius: 99, background: SURFACE2, overflow: "hidden" }, [
      el("div", { position: "absolute", left: 0, top: 0, bottom: 0, width: `${width}%`, background: ACCENT, borderRadius: 99 }),
      ...Array.from({ length: 9 }, (_, i) => el("div", { position: "absolute", top: 0, bottom: 0, left: `${(i + 1) * 10}%`, width: 1, background: CANVAS, opacity: 0.6 })),
    ]),
    el("div", { display: "flex", justifyContent: "space-between", color: FAINT, fontSize: 9 }, [
      el("span", {}, "0%"),
      el("span", {}, "1000%"),
    ]),
  ]);
}

function challengePanel(circle: CircleInfo, translate: boolean, jacket: string | null, forecast: { title: string | null; jacket: string | null } | null): El {
  const ch = circle.challenge!;
  const left = el("div", { display: "flex", flex: 1, minWidth: 0, alignItems: "center" }, [
    jacket
      ? image(jacket, { width: 112, height: 112, borderRadius: 12, objectFit: "cover", flexShrink: 0, marginRight: 16 })
      : el("div", { width: 112, height: 112, borderRadius: 12, background: SURFACE2, flexShrink: 0, marginRight: 16 }),
    el("div", { display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: 6 }, [
      ch.genre ? el("span", { color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.4 }, ch.genre) : el("span", {}, ""),
      el("span", { color: INK, fontSize: 18, fontWeight: 700, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, displayTitle(ch.title, translate)),
      el("span", { color: MUTED, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, ch.artist || " "),
      el("div", { display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }, [
        el("span", { color: MUTED, fontSize: 11 }, msg("circleCard.achievement")),
        el("span", { color: SOFT, fontFamily: NUM_FONT, fontSize: 26, fontWeight: 700, lineHeight: 1 }, ch.achievement || "—"),
      ]),
      ...(ch.gauge !== undefined ? [gaugeBar(ch.gauge)] : []),
    ]),
  ]);
  if (!forecast) return panel(msg("circleCard.challengeTitle"), msg("circleCard.challengeMeta"), [left]);
  const right = el("div", {
    display: "flex", flexDirection: "column", alignItems: "center", width: 200, flexShrink: 0,
    marginLeft: 16, paddingLeft: 16, borderLeft: `1px solid ${BORDER}`, gap: 8,
  }, [
    el("span", { color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.4 }, msg("circleCard.nextWeek")),
    forecast.jacket
      ? image(forecast.jacket, { width: 72, height: 72, borderRadius: 10, objectFit: "cover" })
      : el("div", { width: 72, height: 72, borderRadius: 10, background: SURFACE2 }),
    el("span", { color: TEXT, fontSize: 12, fontWeight: 700, maxWidth: 184, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
      forecast.title ? displayTitle(forecast.title, translate) : msg("circleCard.forecastUnknown")),
    el("span", { color: FAINT, fontSize: 10 }, msg("circleCard.forecastNote")),
  ]);
  return panel(msg("circleCard.challengeTitle"), msg("circleCard.challengeMeta"), [el("div", { display: "flex", alignItems: "center" }, [left, right])]);
}

function memberRow(m: CircleMember, rank: number): El {
  const trophyStyle = TROPHY_STYLE[m.trophyClass] ?? TROPHY_STYLE.normal;
  return el("div", {
    display: "flex", alignItems: "center", width: "50%", padding: "9px 10px", borderTop: `1px solid ${BORDER}`,
  }, [
    el("span", { width: 26, color: rank <= 3 ? SOFT : FAINT, fontFamily: NUM_FONT, fontSize: 15, fontWeight: 700, flexShrink: 0 }, String(rank)),
    el("div", { display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: 4 }, [
      el("div", { display: "flex", alignItems: "center", gap: 6, minWidth: 0 }, [
        el("span", { color: INK, fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 1, minWidth: 0 }, m.name),
        m.leader ? pill(msg("circleCard.leader"), { background: ACCENT, color: CANVAS, fontSize: 8, padding: "2px 6px" }) : el("span", {}, ""),
      ]),
      m.trophy
        ? pill(m.trophy, { ...trophyStyle, fontSize: 9, padding: "2px 7px", maxWidth: 220, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", alignSelf: "flex-start" })
        : el("span", {}, ""),
    ]),
    el("div", { display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0, marginLeft: 8, gap: 3 }, [
      el("span", { color: INK, fontFamily: NUM_FONT, fontSize: 15, fontWeight: 700, lineHeight: 1 }, msg("circleCard.memberPoints", { points: fmt(m.points) })),
      el("span", { color: MUTED, fontSize: 10 }, m.rating ? msg("circleCard.memberRating", { rating: m.rating }) : " "),
    ]),
  ]);
}

export async function renderCircleCard(circle: CircleInfo, profile: CachedProfile, opts: { translate?: boolean } = {}): Promise<Buffer> {
  const translate = !!opts.translate;
  const cacheKey = [profile.profileKey, profile.lastSyncedAt, translate ? 1 : 0, CIRCLE_CARD_VERSION, cardTextSignature()].join("|");
  const memo = circleCardCache.get(cacheKey);
  if (memo) return memo;

  const forecastTitle = circle.forecastJacket ? getTitleByJacket(circle.forecastJacket) : null;
  const [challengeJacket, forecastJacket] = await Promise.all([
    circle.challenge ? jacketData(circle.challenge.jacket, circle.challenge.title) : Promise.resolve(null),
    circle.forecastJacket ? jacketData(circle.forecastJacket, forecastTitle) : Promise.resolve(null),
  ]);

  const serverLabel = profile.server === "jp" ? "JP" : "INTERNATIONAL";
  const eyebrow = msg("circleCard.eyebrow", { server: serverLabel });
  const synced = new Date(profile.lastSyncedAt);
  const month = Number(synced.toLocaleString("en-US", { timeZone: "Asia/Seoul", month: "numeric" }));
  // 동점이면 DX NET 순서(리더가 맨 앞)를 유지한다.
  const members = circle.members.map((m, i) => ({ m, i })).sort((a, b) => b.m.points - a.m.points || a.i - b.i).map(({ m }) => m);
  const reset = circle.daysToReset === null ? undefined : circle.daysToReset === 0 ? msg("circleCard.resetToday") : msg("circleCard.resetDays", { days: circle.daysToReset });

  const width = 920;
  const root = el("div", {
    display: "flex", flexDirection: "column", width,
    background: CANVAS, padding: 24, color: TEXT, fontFamily: "Noto Sans JP",
  }, [
    // 헤더
    el("div", { display: "flex", alignItems: "flex-start", paddingBottom: 18, borderBottom: `1px solid ${BORDER}` }, [
      el("div", { display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: 8 }, [
        el("span", { color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.4 }, eyebrow),
        el("span", {
          color: INK, fontSize: 30, fontWeight: 800, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          marginLeft: alignLeftMargin({ text: circle.name, size: 30 }, { text: eyebrow, size: 10 }),
        }, circle.name),
        el("div", { display: "flex", alignItems: "center", gap: 10 }, [
          circle.code ? pill(msg("circleCard.code", { code: circle.code }), { background: SURFACE2, color: TEXT, fontSize: 11, padding: "4px 11px", letterSpacing: 0.6 }) : el("span", {}, ""),
          circle.comment ? el("span", { color: MUTED, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 560 }, circle.comment) : el("span", {}, ""),
        ]),
      ]),
      wordmark(),
    ]),
    statsPanel([
      { value: circle.monthPoints === null ? "—" : fmt(circle.monthPoints), label: msg("circleCard.monthPoints", { month }), sub: reset },
      { value: circle.rank === null ? "—" : msg("circleCard.rankValue", { rank: fmt(circle.rank) }), label: msg("circleCard.rank"), sub: circle.rankUpdatedAt ? msg("circleCard.rankUpdated", { time: circle.rankUpdatedAt }) : undefined },
      { value: circle.nextRewardPoints === null ? "—" : fmt(circle.nextRewardPoints), label: msg("circleCard.nextReward") },
      { value: circle.memberCount === null ? "—" : `${circle.memberCount}/${circle.memberMax ?? "?"}`, label: msg("circleCard.members") },
    ]),
    ...(circle.challenge
      ? [challengePanel(circle, translate, challengeJacket, circle.forecastJacket ? { title: forecastTitle, jacket: forecastJacket } : null)]
      : []),
    panel(msg("circleCard.membersTitle"), msg("circleCard.membersMeta", { month }), members.length
      ? [el("div", { display: "flex", flexWrap: "wrap" }, members.map((m, i) => memberRow(m, i + 1)))]
      : [el("span", { color: MUTED, fontSize: 12, padding: "12px 0" }, msg("circleCard.membersEmpty"))]),
    // 푸터
    el("div", { display: "flex", justifyContent: "space-between", marginTop: 14, color: MUTED, fontSize: 11 }, [
      el("span", {}, msg("circleCard.syncedBy", { player: profile.playerName || "—" })),
      el("span", {}, msg("card.lastSynced", { time: kstStamp(profile.lastSyncedAt) })),
    ]),
  ]);

  const png = await renderInWorker(root, width);
  if (circleCardCache.size >= CIRCLE_CARD_CACHE_MAX) {
    const oldest = circleCardCache.keys().next().value;
    if (oldest !== undefined) circleCardCache.delete(oldest);
  }
  circleCardCache.set(cacheKey, png);
  return png;
}
