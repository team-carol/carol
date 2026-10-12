import { BRAND } from "../../brand";
import {
  ACCENT, SURFACE, SURFACE2, BORDER, TEXT, MUTED, CANVAS, INK, SOFT, FAINT, NUM_FONT, TROPHY_STYLE,
  type El, el, image, pill, remoteDataUrl, kstStamp, wordmark, creditOf, statsPanel, panel,
} from "./cardKit";
import { renderInWorker } from "./renderPool";
import type { CachedProfile } from "../../storage/types";
import type { PlayRecord } from "../../scraper";
import { getConstant, getJacketFile } from "../../constants";
import { displayTitle } from "../../aliases";
import { getScoreRank, MAI_CM_COLOR } from "../../games";
import { fetchJacketDataUrl, ratingBreakdown, ratingPlate } from "./ratingCard";
import { musicKindIcons, KIND_ICON_RATIO } from "./dxnetAssets";
import { alignLeftMargin } from "./textMetrics";
import type { RatingPoint, PlayCountPoint } from "../../ratingHistory";
import { lineChart, lineSwatch, dashedSwatch } from "./historyChart";
import { msg, cardTextSignature } from "../../messages";

// /프로필 이미지 카드. 레이아웃·색은 /성과 카드와 같은 랜딩(carol-web) 토큰(src/brand.ts)을 따른다.
// 헤더(아바타·이름·칭호·클래스·레이팅 플레이트) → 레이팅 구성 → 클리어 현황 → 최근 플레이 5곡.

const RECENT_COUNT = 5;

const DIFF_COLOR: Record<string, string> = {
  BASIC: "#16a34a",
  ADVANCED: "#ea580c",
  EXPERT: "#dc2626",
  MASTER: "#9333ea",
  "Re:MASTER": "#c084fc",
};


// 랭크 막대그래프 색. 게임 랭크색(금색 계열)을 진한 것 → 옅은 것 순으로 이어 붙였다.
const RANK_RAMP: [string, string][] = [
  ["SSS+", "#d97706"], ["SSS", "#f59e0b"], ["SS+", "#fbbf24"],
  ["SS", "#fcd34d"], ["S+", "#fde68a"], ["S", "#fef3c7"],
];
const RANK_OTHER_COLOR = BRAND.border2;
const MARK_GROUPS: string[][] = [
  ["AP+", "AP", "FC+", "FC"],
  ["FDX+", "FDX", "FS+", "FS"],
];
const MARK_COLOR: Record<string, string> = {
  "AP+": "#d946ef", AP: "#d946ef", "FC+": "#3b82f6", FC: "#60a5fa",
  "FDX+": "#10b981", FDX: "#34d399", "FS+": "#22c55e", FS: "#4ade80",
};

const PROFILE_CARD_VERSION = 17;
const PROFILE_CARD_CACHE_MAX = 64;
const profileCardCache = new Map<string, Buffer>();

async function jacketFor(record: PlayRecord): Promise<string | null> {
  const direct = record.jacketUrl ? await remoteDataUrl(record.jacketUrl) : null;
  if (direct) return direct;
  const file = getJacketFile(record.title);
  return file ? fetchJacketDataUrl(file) : null;
}

function parseList(json: string): PlayRecord[] {
  try {
    const x = JSON.parse(json || "[]");
    return Array.isArray(x) ? x : Array.isArray(x?.recent) ? x.recent : [];
  } catch {
    return [];
  }
}

function markOf(v: string | undefined): string {
  const x = (v || "").trim().toUpperCase().replace(/\s+/g, "");
  if (x === "APP") return "AP+";
  if (x === "FCP") return "FC+";
  if (x === "FDXP" || x === "FSD+") return "FDX+";
  if (x === "FSD") return "FDX";
  if (x === "FSP") return "FS+";
  return x;
}

// 세로 막대그래프. 막대 높이는 묶음 안 최댓값 대비 비율, 막대 위에 개수, 아래에 라벨(+비율).
function barChart(items: { label: string; color: string; count: number; note?: string }[], height: number, barWidth: number): El {
  const max = Math.max(1, ...items.map((it) => it.count));
  return el("div", { display: "flex", flex: 1 }, items.map((it) => el("div", { display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }, [
    el("div", {
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end",
      alignSelf: "stretch", height: height + 26, borderBottom: `1px solid ${BORDER}`,
    }, [
      el("span", { color: it.count ? INK : FAINT, fontFamily: NUM_FONT, fontSize: 16, fontWeight: 700, lineHeight: 1, marginBottom: 6 }, String(it.count)),
      el("div", { width: barWidth, height: it.count ? Math.max(3, Math.round((height * it.count) / max)) : 0, borderRadius: "6px 6px 0 0", background: it.color }),
    ]),
    el("span", { color: MUTED, fontSize: 11, fontWeight: 800, lineHeight: 1, marginTop: 8 }, it.label),
    ...(it.note ? [el("span", { color: FAINT, fontSize: 10, lineHeight: 1, marginTop: 5 }, it.note)] : []),
  ])));
}

function clearPanel(clears: PlayRecord[]): El {
  const ranks = new Map<string, number>();
  const marks = new Map<string, number>();
  let played = 0;
  for (const r of clears) {
    if (!(r.achievementVal > 0)) continue;
    played++;
    const rank = getScoreRank(r.achievementVal);
    ranks.set(rank, (ranks.get(rank) ?? 0) + 1);
    for (const m of [markOf(r.fc), markOf(r.sync)]) if (m) marks.set(m, (marks.get(m) ?? 0) + 1);
  }
  const pct = (n: number) => (played ? Math.round((n / played) * 100) : 0);
  const rankItems = RANK_RAMP.map(([label, color]) => ({ label, color, count: ranks.get(label) ?? 0 }));
  const listed = rankItems.reduce((sum, it) => sum + it.count, 0);
  rankItems.push({ label: msg("profileCard.rankOther"), color: RANK_OTHER_COLOR, count: Math.max(0, played - listed) });

  // 오른쪽으로 갈수록 높은 랭크(맨 오른쪽 SSS+, 맨 왼쪽 그 외).
  const rankChart = barChart(rankItems.map((it) => ({ ...it, note: `${pct(it.count)}%` })).reverse(), 96, 46);
  // 콤보·싱크는 막대 없이 숫자로. 두 묶음은 제목 없이 세로선으로만 나눈다.
  const markGroups = el("div", { display: "flex", marginTop: 16, paddingTop: 16, borderTop: `1px solid ${BORDER}` },
    MARK_GROUPS.map((keys, gi) => el("div", {
      display: "flex", flex: 1,
      ...(gi > 0 ? { borderLeft: `1px solid ${BORDER}`, paddingLeft: 16 } : { paddingRight: 16 }),
    }, keys.map((k) => el("div", { display: "flex", flexDirection: "column", alignItems: "center", flex: 1, gap: 6 }, [
      el("span", { color: MARK_COLOR[k] ?? INK, fontSize: 12, fontWeight: 800, lineHeight: 1 }, k),
      el("span", { color: INK, fontFamily: NUM_FONT, fontSize: 20, fontWeight: 700, lineHeight: 1 }, String(marks.get(k) ?? 0)),
    ])))));

  return panel(msg("profileCard.clearTitle"), msg("profileCard.clearMeta", { count: played }), [rankChart, markGroups]);
}

type KindIcons = Partial<Record<"DX" | "ST", string>>;

// ST/DX 는 DX NET 과 같은 뱃지 이미지로. 못 받았으면 글자로 대신한다.
function kindMark(kind: string, icons: KindIcons, height: number): El {
  const src = kind === "DX" || kind === "ST" ? icons[kind] : undefined;
  return src
    ? image(src, { width: Math.round(height * KIND_ICON_RATIO), height, flexShrink: 0 })
    : el("span", { color: MUTED, fontSize: 10, flexShrink: 0 }, kind || "?");
}

function recentRow(record: PlayRecord, profile: CachedProfile, jacket: string | null, translate: boolean, kindIcons: KindIcons): El {
  const diffColor = DIFF_COLOR[record.diff] ?? MUTED;
  const constant = getConstant(record.title, record.musicKind, record.diff, profile.server);
  const level = constant !== null ? constant.toFixed(1) : record.level;
  const rank = getScoreRank(record.achievementVal);
  const marks = [markOf(record.fc), markOf(record.sync)].filter(Boolean);
  return el("div", { display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderTop: `1px solid ${BORDER}` }, [
    jacket
      ? image(jacket, { width: 46, height: 46, objectFit: "cover", borderRadius: 8, flexShrink: 0 })
      : el("div", { width: 46, height: 46, borderRadius: 8, background: SURFACE2, flexShrink: 0 }),
    el("div", { display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: 5 }, [
      el("span", { color: INK, fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, displayTitle(record.title, translate)),
      el("div", { display: "flex", alignItems: "center", gap: 8 }, [
        pill(`${record.diff} ${level}`, { background: diffColor, color: "#fff" }),
        kindMark(record.musicKind, kindIcons, 15),
        el("span", { color: MUTED, fontSize: 10, whiteSpace: "nowrap" }, record.date || ""),
      ]),
    ]),
    el("div", { display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }, [
      el("div", { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }, [
        el("span", { color: MAI_CM_COLOR[rank] ?? INK, fontSize: 16, fontWeight: 800, lineHeight: 1 }, rank),
        marks.length
          ? el("div", { display: "flex", gap: 5 }, marks.map((m) => el("span", { color: MARK_COLOR[m] ?? MUTED, fontSize: 10, fontWeight: 800 }, m)))
          : el("span", { fontSize: 10 }, " "),
      ]),
      el("span", { color: INK, fontSize: 16, fontWeight: 700, width: 96, textAlign: "right" }, record.achievement || `${record.achievementVal.toFixed(4)}%`),
    ]),
  ]);
}

// ─── 히스토리 그래프 ─────────────────────────────────────────────────────
// 그리는 코드는 /히스토리 카드와 같이 쓴다(historyChart.ts).
const CHART_H = 150;
const PLAYS_H = 120;
export const PLAY_CURRENT_COLOR = "#60a5fa";

/** 날짜 라벨. 기간이 해를 넘기면 연도(두 자리)를 붙인다. */
function dayLabel(day: string, withYear: boolean): string {
  return withYear ? day.slice(2).replace(/-/g, ".") : day.slice(5).replace("-", ".");
}

/** 레이팅 축: 왼쪽은 곡 평균(레이팅 ÷ 50), 오른쪽은 레이팅. */
export const RATING_AXES = {
  left: (v: number) => String(+(v / 50).toFixed(1)),
  right: (v: number) => String(v),
};

function ratingChartPanel(points: RatingPoint[], days: string[], updates: { day: string; label: string }[] = []): El {
  if (!points.length) {
    return panel(msg("profileCard.ratingTitle"), "", [el("span", { color: MUTED, fontSize: 12, padding: "10px 0" }, msg("profileCard.ratingEmpty"))]);
  }
  const first = points[0], last = points[points.length - 1];
  const withYear = first.day.slice(0, 4) !== last.day.slice(0, 4);
  const delta = last.rating - first.rating;
  const meta = points.length > 1
    ? `${dayLabel(first.day, withYear)} ${first.rating} → ${dayLabel(last.day, withYear)} ${last.rating} (${delta >= 0 ? "+" : ""}${delta})`
    : `${dayLabel(last.day, false)} ${last.rating}`;
  return panel(msg("profileCard.ratingTitle"), meta, [
    lineChart(days, [{ values: points.map((p) => ({ day: p.day, value: p.rating, estimated: p.estimated })), color: ACCENT, fill: true }], { height: CHART_H, updates, lastLabel: true, extendTo: days[days.length - 1], mirror: RATING_AXES }),
    // 범례는 점선(추정)만 설명한다. 추정 구간이 없으면 범례를 두지 않는다.
    ...(points.some((p) => p.estimated)
      ? [el("div", { display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6, marginTop: 8, color: MUTED, fontSize: 10 }, [
          dashedSwatch(), el("span", {}, msg("profileCard.ratingLegend")),
        ])]
      : []),
  ]);
}

// 플레이 횟수: maishift 처럼 누적·현재 버전 두 선. 히스토리와 같은 가로축이라 날짜가 위아래로 맞는다.
function playCountPanel(plays: PlayCountPoint[], days: string[], updates: { day: string; label: string }[] = []): El {
  const last = plays[plays.length - 1];
  return panel(msg("profileCard.playsTitle"), msg("profileCard.playsMeta", { total: last.total.toLocaleString("en-US"), current: last.current.toLocaleString("en-US") }), [
    lineChart(days, [
      { values: plays.map((p) => ({ day: p.day, value: p.total })), color: ACCENT },
      { values: plays.map((p) => ({ day: p.day, value: p.current })), color: PLAY_CURRENT_COLOR, axis: "right" },
    ], { height: PLAYS_H, fromZero: true, updates, extendTo: days[days.length - 1] }),
    el("div", { display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 14, marginTop: 8, color: MUTED, fontSize: 10 }, [
      lineSwatch(ACCENT, msg("profileCard.playsTotal")),
      lineSwatch(PLAY_CURRENT_COLOR, msg("profileCard.playsCurrent")),
    ]),
  ]);
}

export async function renderProfileCard(
  profile: CachedProfile,
  avatarBuf: Buffer | null,
  opts: { translate?: boolean; friendCode?: string | null; circleName?: string | null; ratingHistory?: { points: RatingPoint[]; days: string[]; updates?: { day: string; label: string }[]; plays?: PlayCountPoint[] } } = {},
): Promise<Buffer> {
  const translate = !!opts.translate;
  const friendCode = opts.friendCode ?? null;
  const circleName = opts.circleName ?? null;
  const history = opts.ratingHistory;
  // 그래프 기간은 오늘을 끝으로 움직이므로 마지막 날짜도 키에 넣는다.
  const cacheKey = [profile.profileKey, profile.lastSyncedAt, translate ? 1 : 0, friendCode ?? "", circleName ?? "", avatarBuf?.length ?? 0, history ? history.days[history.days.length - 1] : "-", PROFILE_CARD_VERSION, profile.source ?? "", cardTextSignature()].join("|");
  const memo = profileCardCache.get(cacheKey);
  if (memo) return memo;

  const recent = parseList(profile.recentJson).slice(0, RECENT_COUNT);
  const clears = parseList(profile.clearJson);
  const breakdown = ratingBreakdown(profile);
  const [avatarUrl, courseUrl, gradeUrl, jackets, kindIcons] = await Promise.all([
    avatarBuf ? Promise.resolve(`data:image/png;base64,${avatarBuf.toString("base64")}`) : remoteDataUrl(profile.avatar),
    remoteDataUrl(profile.courseImg),
    remoteDataUrl(profile.gradeImg),
    Promise.all(recent.map((r) => jacketFor(r))),
    musicKindIcons(),
  ]);

  const serverLabel = profile.server === "jp" ? "JP" : "INTERNATIONAL";
  const eyebrow = msg("profileCard.eyebrow", { server: serverLabel });
  const name = profile.playerName || "—";
  const nameShift = alignLeftMargin({ text: name, size: 26 }, { text: eyebrow, size: 10 });
  const trophyStyle = TROPHY_STYLE[profile.trophyClass] ?? TROPHY_STYLE.normal;
  const stars = Number(profile.stars) || 0;
  const avg = (sum: number, n: number) => (n ? msg("profileCard.average", { value: (sum / n).toFixed(1) }) : "");

  const width = 920;
  const root = el("div", {
    display: "flex", flexDirection: "column", width,
    background: CANVAS, padding: 24, color: TEXT, fontFamily: "Noto Sans JP",
  }, [
    // 헤더
    el("div", { display: "flex", alignItems: "center", paddingBottom: 18, borderBottom: `1px solid ${BORDER}` }, [
      avatarUrl
        ? image(avatarUrl, { width: 96, height: 96, objectFit: "cover", borderRadius: 16, marginRight: 18, flexShrink: 0 })
        : el("div", { width: 96, height: 96, borderRadius: 16, background: SURFACE2, marginRight: 18, flexShrink: 0 }),
      el("div", { display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: 7 }, [
        el("span", { color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.4 }, eyebrow),
        // 전각 영문 이름(ＲＯＥＮＡ 등)은 첫 글자 왼쪽 여백이 커서 위 줄보다 밀려 보이므로 잉크 시작을 맞춘다.
        el("div", { display: "flex", alignItems: "center", gap: 12, minWidth: 0 }, [
          el("span", { color: INK, fontSize: 26, fontWeight: 800, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginLeft: nameShift, flexShrink: 1, minWidth: 0 }, name),
          // 서클 이름(/설정 서클 공개가 켜져 있을 때만)
          circleName
            ? el("div", { display: "flex", alignItems: "center", gap: 6, flexShrink: 0, maxWidth: 260, border: `1px solid ${BRAND.border2}`, borderRadius: 99, padding: "3px 10px" }, [
                el("span", { color: FAINT, fontSize: 9, fontWeight: 700, letterSpacing: 0.6 }, msg("profileCard.circleChip")),
                el("span", { color: TEXT, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, circleName),
              ])
            : el("span", {}, ""),
        ]),
        el("div", { display: "flex", alignItems: "center", gap: 10 }, [
          // 칭호 문구가 비어 있으면(공백 칭호) 게임처럼 빈 등급 색 띠만 보여 준다.
          pill(profile.trophy || "\u00a0", { ...trophyStyle, fontSize: 11, padding: "4px 11px", maxWidth: 420, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", ...(profile.trophy ? {} : { width: 160 }) }),
          // 단위(段位)·클래스(오토모다치) 이미지. 단위는 이 기능 이후 동기화부터 저장된다.
          courseUrl ? image(courseUrl, { height: 26, objectFit: "contain" }) : el("span", {}, ""),
          gradeUrl ? image(gradeUrl, { height: 26, objectFit: "contain" }) : el("span", {}, ""),
          stars ? el("span", { color: "#fbbf24", fontSize: 13, fontWeight: 700 }, `★ ${stars}`) : el("span", {}, ""),
        ]),
      ]),
      el("div", { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 16, flexShrink: 0 }, [
        wordmark(creditOf(profile)),
        ratingPlate(profile.rating || 0),
      ]),
    ]),
    // 레이팅 구성·플레이 횟수. 레이팅 합계는 오른쪽 위 플레이트에 있으므로 여기선 구성만.
    statsPanel([
      { value: String(Math.round(breakdown.newSum)), label: msg("profileCard.newSum", { count: breakdown.newCount }), sub: avg(breakdown.newSum, breakdown.newCount) },
      { value: String(Math.round(breakdown.oldSum)), label: msg("profileCard.oldSum", { count: breakdown.oldCount }), sub: avg(breakdown.oldSum, breakdown.oldCount) },
      { value: String(profile.playCount || 0), label: msg("profileCard.playCount") },
      { value: String(profile.totalPlayCount || profile.playCount || 0), label: msg("profileCard.totalPlayCount") },
    ]),
    clearPanel(clears),
    ...(history ? [ratingChartPanel(history.points, history.days, history.updates)] : []),
    ...(history?.plays && history.plays.length > 1 ? [playCountPanel(history.plays, history.days, history.updates)] : []),
    panel(msg("profileCard.recentTitle"), msg("profileCard.recentMeta", { count: recent.length }), recent.length
      ? recent.map((r, i) => recentRow(r, profile, jackets[i], translate, kindIcons))
      : [el("span", { color: MUTED, fontSize: 12, padding: "12px 0" }, msg("profileCard.recentEmpty"))]),
    // 푸터
    el("div", { display: "flex", justifyContent: "space-between", marginTop: 14, color: MUTED, fontSize: 11 }, [
      el("span", {}, friendCode ? msg("profileCard.friendCode", { code: friendCode }) : " "),
      el("span", {}, msg("card.lastSynced", { time: kstStamp(profile.lastSyncedAt) })),
    ]),
  ]);

  const png = await renderInWorker(root, width);
  if (profileCardCache.size >= PROFILE_CARD_CACHE_MAX) {
    const oldest = profileCardCache.keys().next().value;
    if (oldest !== undefined) profileCardCache.delete(oldest);
  }
  profileCardCache.set(cacheKey, png);
  return png;
}
