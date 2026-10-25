// /히스토리 이미지 카드. maishift 히스토리 내보내기 그림과 같은 정보를 캐롤봇 카드 스타일로 그린다:
// 머리(업로드 시각·버전 주차·플레이 카운트·단위·클래스·투어 멤버) → 기간 → 레이팅 그래프 + 달성 기록 → 플레이 횟수 그래프 + 달성 기록.
import {
  ACCENT, SURFACE, SURFACE2, BORDER, TEXT, MUTED, CANVAS, INK, FAINT, NUM_FONT,
  type El, el, image, remoteDataUrl, kstStamp, wordmark, creditOf,
} from "./cardKit";
import { renderInWorker } from "./renderPool";
import type { CachedProfile, MaishiftVersion } from "../../storage/types";
import { ratingPlate } from "./ratingCard";
import { userCardHeader } from "./cardHeader";
import { lineChart, lineSwatch } from "./historyChart";
import { PLAY_CURRENT_COLOR, RATING_AXES } from "./profileCard";
import type { RatingPoint, PlayCountPoint } from "../../ratingHistory";
import { versionWeek, type Milestone } from "../../historyStats";
import { msg } from "../../messages";

const UP = "#4ade80";
const DOWN = "#f87171";

export interface HistoryCardData {
  /** 기간 이름(전체·1년 …) */
  periodLabel: string;
  days: string[];
  points: RatingPoint[];
  plays: PlayCountPoint[];
  updates: { day: string; label: string }[];
  ratingMilestones: Milestone[];
  playMilestones: Milestone[];
  versions: MaishiftVersion[];
  /** 마지막 업로드 시각·그때 버전 */
  lastAt: number;
  lastVersionId: number;
}

const fmt = (n: number) => n.toLocaleString("en-US");
const ymd = (ms: number) => kstStamp(ms).slice(0, 10);

function weekText(at: number, versionId: number, versions: MaishiftVersion[]): string {
  const w = versionWeek(at, versionId, versions);
  return w ? msg("historyCard.versionWeek", { version: w.name, week: w.week }) : "";
}

/** "11,963 → 16,336 ▲4,373" */
function changeMeta(from: number, to: number): El {
  const d = to - from;
  return el("div", { display: "flex", alignItems: "baseline", gap: 8 }, [
    el("span", { color: INK, fontFamily: NUM_FONT, fontSize: 14, fontWeight: 700 }, `${fmt(from)} → ${fmt(to)}`),
    el("span", { color: d >= 0 ? UP : DOWN, fontFamily: NUM_FONT, fontSize: 12, fontWeight: 700 }, `${d >= 0 ? "▲" : "▼"}${fmt(Math.abs(d))}`),
  ]);
}

function section(title: string, meta: El, children: El[]): El {
  return el("div", {
    display: "flex", flexDirection: "column",
    background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "14px 16px", marginTop: 12,
  }, [
    el("div", { display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }, [
      el("span", { color: INK, fontSize: 14, fontWeight: 700 }, title),
      meta,
    ]),
    ...children,
  ]);
}

/** 달성 기록 목록(높은 값부터). "+N일" 은 바로 아래(이전) 기록과의 간격. */
function milestoneRows(list: Milestone[], color: string, versions: MaishiftVersion[]): El {
  const desc = [...list].sort((a, b) => b.value - a.value);
  return el("div", { display: "flex", flexDirection: "column", marginTop: 12, borderTop: `1px solid ${BORDER}` }, desc.map((m, i) => {
    const older = desc[i + 1];
    const gap = older ? Math.round((m.at - older.at) / 86400000) : null;
    return el("div", { display: "flex", alignItems: "center", gap: 12, padding: "8px 2px", borderBottom: i < desc.length - 1 ? `1px solid ${BORDER}` : "none" }, [
      el("div", { width: 4, height: 16, borderRadius: 2, background: color, opacity: m.emphasised ? 1 : 0.55, flexShrink: 0 }),
      el("span", { width: 74, color: m.emphasised ? INK : TEXT, fontFamily: NUM_FONT, fontSize: 14, fontWeight: m.emphasised ? 800 : 500 }, fmt(m.value)),
      el("span", { width: 86, color: MUTED, fontFamily: NUM_FONT, fontSize: 12 }, ymd(m.at)),
      el("span", { color: FAINT, fontSize: 11, flex: 1 }, gap !== null ? msg("historyCard.gapDays", { days: gap }) : ""),
      el("span", { color: MUTED, fontSize: 11 }, weekText(m.at, m.versionId, versions)),
    ]);
  }));
}

function statCell(label: string, child: El, divider: boolean): El {
  return el("div", { display: "flex", flexDirection: "column", gap: 6, flex: 1, paddingLeft: divider ? 16 : 0, borderLeft: divider ? `1px solid ${BORDER}` : "none" }, [
    el("span", { color: MUTED, fontSize: 10, fontWeight: 700 }, label),
    child,
  ]);
}

export async function renderHistoryCard(profile: CachedProfile, avatarBuf: Buffer | null, d: HistoryCardData): Promise<Buffer> {
  const [avatarUrl, courseUrl, gradeUrl] = await Promise.all([
    avatarBuf ? Promise.resolve(`data:image/png;base64,${avatarBuf.toString("base64")}`) : remoteDataUrl(profile.avatar),
    remoteDataUrl(profile.courseImg),
    remoteDataUrl(profile.gradeImg),
  ]);
  const serverLabel = profile.server === "jp" ? "JP" : "INTERNATIONAL";
  const eyebrow = msg("historyCard.eyebrow", { server: serverLabel });
  const stars = Number(profile.stars) || 0;
  const end = d.days[d.days.length - 1];
  const rangeText = msg("historyCard.range", { from: d.days[0].replace(/-/g, "."), to: end.replace(/-/g, "."), days: d.days.length });

  const firstPoint = d.points[0], lastPoint = d.points[d.points.length - 1];
  const firstPlay = d.plays[0], lastPlay = d.plays[d.plays.length - 1];

  const width = 920;
  const root = el("div", {
    display: "flex", flexDirection: "column", width,
    background: CANVAS, padding: 24, color: TEXT, fontFamily: "Noto Sans JP",
  }, [
    // 머리
    userCardHeader(profile, avatarUrl, eyebrow, [kstStamp(d.lastAt), weekText(d.lastAt, d.lastVersionId, d.versions)].filter(Boolean).join("  ✦  ")),
    // 플레이 카운트·단위·클래스·투어 멤버
    el("div", { display: "flex", background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "14px 18px", marginTop: 12 }, [
      statCell(msg("historyCard.playCount"), el("div", { display: "flex", alignItems: "baseline", gap: 6 }, [
        el("span", { color: INK, fontFamily: NUM_FONT, fontSize: 18, fontWeight: 800 }, fmt(profile.totalPlayCount || 0)),
        el("span", { color: MUTED, fontFamily: NUM_FONT, fontSize: 12 }, `(${fmt(profile.playCount || 0)})`),
      ]), false),
      statCell(msg("historyCard.course"), courseUrl ? image(courseUrl, { height: 26, objectFit: "contain" }) : el("span", { color: FAINT, fontSize: 14 }, "—"), true),
      statCell(msg("historyCard.class"), gradeUrl ? image(gradeUrl, { height: 26, objectFit: "contain" }) : el("span", { color: FAINT, fontSize: 14 }, "—"), true),
      statCell(msg("historyCard.stars"), el("span", { color: "#fbbf24", fontSize: 18, fontWeight: 800 }, `★ ${stars}`), true),
    ]),
    // 기간
    el("div", { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, marginTop: 18 }, [
      el("span", { color: INK, fontSize: 18, fontWeight: 800 }, d.periodLabel),
      el("span", { color: MUTED, fontSize: 11 }, rangeText),
    ]),
    // 레이팅
    section(msg("historyCard.ratingTitle"), changeMeta(firstPoint.rating, lastPoint.rating), [
      lineChart(d.days, [{ values: d.points.map((p) => ({ day: p.day, value: p.rating })), color: ACCENT, fill: true }], { height: 190, updates: d.updates, lastLabel: true, extendTo: end, mirror: RATING_AXES }),
      ...(d.ratingMilestones.length ? [milestoneRows(d.ratingMilestones, ACCENT, d.versions)] : []),
    ]),
    // 플레이 횟수
    ...(d.plays.length ? [section(msg("historyCard.playsTitle"), changeMeta(firstPlay.total, lastPlay.total), [
      lineChart(d.days, [
        { values: d.plays.map((p) => ({ day: p.day, value: p.total })), color: ACCENT },
        { values: d.plays.map((p) => ({ day: p.day, value: p.current })), color: PLAY_CURRENT_COLOR, axis: "right" },
      // 짧은 기간은 0부터 그리면 선이 위에 납작하게 붙어서, 긴 기간(120일 넘게)만 0부터.
      ], { height: 150, fromZero: d.days.length > 120, updates: d.updates, extendTo: end }),
      el("div", { display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 14, marginTop: 8, color: MUTED, fontSize: 10 }, [
        lineSwatch(ACCENT, msg("profileCard.playsTotal")),
        lineSwatch(PLAY_CURRENT_COLOR, msg("profileCard.playsCurrent")),
      ]),
      ...(d.playMilestones.length ? [milestoneRows(d.playMilestones, PLAY_CURRENT_COLOR, d.versions)] : []),
    ])] : []),
    el("div", { display: "flex", justifyContent: "flex-end", marginTop: 14, color: MUTED, fontSize: 11 }, [
      el("span", {}, msg("card.lastSynced", { time: kstStamp(profile.lastSyncedAt) })),
    ]),
  ]);
  return renderInWorker(root, width);
}
