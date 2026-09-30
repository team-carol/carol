import { BRAND } from "../../brand";
import { renderInWorker } from "./renderPool";
import type { CachedProfile } from "../../storage/types";
import type { PlayRecord } from "../../scraper";
import { getConstant, getJacketFile } from "../../constants";
import { displayTitle } from "../../aliases";
import { getScoreRank, MAI_CM_COLOR } from "../../games";
import { fetchJacketDataUrl, ratingBreakdown, ratingPlate } from "./ratingCard";
import { musicKindIcons, KIND_ICON_RATIO } from "./dxnetAssets";
import { alignLeftMargin } from "./textMetrics";
import type { RatingPoint } from "../../ratingHistory";

// /프로필 이미지 카드. 레이아웃·색은 /성과 카드와 같은 랜딩(carol-web) 토큰(src/brand.ts)을 따른다.
// 헤더(아바타·이름·칭호·클래스·레이팅 플레이트) → 레이팅 구성 → 클리어 현황 → 최근 플레이 5곡.

const ACCENT = BRAND.accent;
const SURFACE = BRAND.surface;
const SURFACE2 = BRAND.surface2;
const BORDER = BRAND.border;
const TEXT = BRAND.inkSoft;
const MUTED = BRAND.dim;
const CANVAS = BRAND.canvas;
const INK = BRAND.ink;
const RECENT_COUNT = 5;

const DIFF_COLOR: Record<string, string> = {
  BASIC: "#16a34a",
  ADVANCED: "#ea580c",
  EXPERT: "#dc2626",
  MASTER: "#9333ea",
  "Re:MASTER": "#c084fc",
};

// DX NET 칭호 등급(trophy_*) 색. 레인보우는 그라디언트.
const TROPHY_STYLE: Record<string, Record<string, unknown>> = {
  normal: { background: SURFACE2, color: TEXT },
  bronze: { background: "#c77d43", color: "#1a1a1c" },
  silver: { background: "#c3ccd4", color: "#1a1a1c" },
  gold: { background: "#f2c94c", color: "#1a1a1c" },
  rainbow: { backgroundImage: "linear-gradient(90deg, #ff9294, #fbbf24, #4ade80, #60a5fa, #c084fc)", color: "#1a1a1c" },
};

const SOFT = BRAND.accentSoft;
const FAINT = BRAND.faint;
const NUM_FONT = "Pretendard"; // 랜딩 수치 표기와 같은 글꼴(fonts.ts 에 700 으로 등록됨)

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

const PROFILE_CARD_VERSION = 11;
const PROFILE_CARD_CACHE_MAX = 64;
const profileCardCache = new Map<string, Buffer>();

type El = { type: string; props: { style: Record<string, unknown>; children?: unknown; src?: string } };

function el(type: string, style: Record<string, unknown>, children?: unknown): El {
  return { type, props: { style, children } };
}

function image(src: string, style: Record<string, unknown>): El {
  return { type: "img", props: { src, style } };
}

function pill(text: string, style: Record<string, unknown>): El {
  return el("span", { fontSize: 10, fontWeight: 700, borderRadius: 99, padding: "3px 9px", lineHeight: 1.2, flexShrink: 0, ...style }, text);
}

// DX NET 이미지(아바타 URL·클래스·재킷)를 data URL 로. 실패는 null 로 기억한다.
const remoteImageCache = new Map<string, string | null>();
async function remoteDataUrl(url: string): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  const memo = remoteImageCache.get(url);
  if (memo !== undefined) return memo;
  let data: string | null = null;
  try {
    const res = await fetch(url);
    if (res.ok) data = `data:${res.headers.get("content-type") || "image/png"};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch {
    data = null;
  }
  remoteImageCache.set(url, data);
  return data;
}

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

function kstStamp(ms: number): string {
  const d = new Date(ms + 9 * 60 * 60 * 1000).toISOString();
  return `${d.slice(0, 10).replace(/-/g, ".")} ${d.slice(11, 16)}`;
}

function wordmark(): El {
  return el("div", { display: "flex", alignItems: "baseline" }, [
    el("span", { fontSize: 13, fontWeight: 700, color: MUTED, marginRight: 6 }, "Created by"),
    el("span", { fontSize: 13, fontWeight: 800, color: INK }, "carol"),
    el("span", { fontSize: 13, fontWeight: 800, color: ACCENT }, "bot"),
  ]);
}

// 랜딩 Stats 섹션처럼 박스 없이 큰 숫자(accent-soft) + 라벨. 칸 사이는 세로선으로만 나눈다.
function statsPanel(items: { value: string; label: string; sub?: string }[]): El {
  return el("div", {
    display: "flex", marginTop: 16,
    background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "18px 0",
  }, items.map((it, i) => el("div", {
    // 보조 줄(평균)이 없는 칸도 숫자·라벨이 세로 가운데에 오도록 빈 줄을 넣지 않고 가운데 정렬한다.
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 7,
    ...(i > 0 ? { borderLeft: `1px solid ${BORDER}` } : {}),
  }, [
    el("span", { color: SOFT, fontFamily: NUM_FONT, fontSize: 28, fontWeight: 700, lineHeight: 1 }, it.value),
    el("span", { color: MUTED, fontSize: 11 }, it.label),
    ...(it.sub ? [el("span", { color: FAINT, fontSize: 10, lineHeight: 1 }, it.sub)] : []),
  ])));
}

function panel(title: string, meta: string, children: El[]): El {
  return el("div", {
    display: "flex", flexDirection: "column",
    background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "14px 16px", marginTop: 12,
  }, [
    el("div", { display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }, [
      el("span", { color: INK, fontSize: 14, fontWeight: 700 }, title),
      el("span", { color: MUTED, fontSize: 10 }, meta),
    ]),
    ...children,
  ]);
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
  rankItems.push({ label: "그 외", color: RANK_OTHER_COLOR, count: Math.max(0, played - listed) });

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

  return panel("클리어 현황", `${played}개 채보 플레이`, [rankChart, markGroups]);
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

// ─── 레이팅 추이 그래프 ─────────────────────────────────────────────────────
// 선·격자는 SVG 이미지로 그리고(resvg 가 벡터로 렌더), 축 라벨·값은 satori 텍스트로 올린다
// (중첩 SVG 안의 text 는 글꼴을 못 찾을 수 있어서). 실측끼리 잇는 구간은 실선, 추정이 끼면 점선.
const CHART_W = 840;          // 패널 안쪽 폭
const CHART_Y_LABEL_W = 40;   // 왼쪽 눈금 라벨 칸
const CHART_H = 150;
const CHART_PAD_X = 10;
const CHART_PAD_Y = 16;

function niceStep(range: number): number {
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  return steps.find((s) => range / s <= 4) ?? 5000;
}

function shortDay(day: string): string {
  return day.slice(5).replace("-", ".");
}

function dashedSwatch(): El {
  return el("div", { display: "flex", gap: 3 }, [0, 1, 2].map(() => el("div", { width: 5, height: 2, background: ACCENT, opacity: 0.8 })));
}

function ratingChartPanel(points: RatingPoint[], days: string[], updates: { day: string; label: string }[] = []): El {
  if (!points.length) {
    return panel("레이팅 추이", "", [el("span", { color: MUTED, fontSize: 12, padding: "10px 0" }, "동기화 기록이 쌓이면 레이팅 추이가 표시됩니다.")]);
  }
  const plotW = CHART_W - CHART_Y_LABEL_W - 8;
  const index = new Map(days.map((d, i) => [d, i]));
  const firstI = index.get(points[0].day) ?? 0;
  const lastI = index.get(points[points.length - 1].day) ?? firstI;
  const span = Math.max(1, lastI - firstI);
  const xOf = (day: string) => points.length === 1
    ? plotW / 2
    : CHART_PAD_X + (((index.get(day) ?? firstI) - firstI) / span) * (plotW - 2 * CHART_PAD_X);

  const values = points.map((p) => p.rating);
  const lo = Math.min(...values), hi = Math.max(...values);
  const step = niceStep(Math.max(hi - lo, 8) * 1.3);
  const yMin = Math.floor((lo - step * 0.3) / step) * step;
  const yMax = Math.max(yMin + step, Math.ceil((hi + step * 0.3) / step) * step);
  const yOf = (v: number) => CHART_PAD_Y + (1 - (v - yMin) / (yMax - yMin)) * (CHART_H - 2 * CHART_PAD_Y);
  const ticks: number[] = [];
  for (let t = yMin; t <= yMax + 1e-9; t += step) ticks.push(t);

  const pts = points.map((p) => ({ ...p, x: +xOf(p.day).toFixed(1), y: +yOf(p.rating).toFixed(1) }));
  const bottom = yOf(yMin).toFixed(1);
  const svg: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${plotW}" height="${CHART_H}" viewBox="0 0 ${plotW} ${CHART_H}">`,
    `<defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${ACCENT}" stop-opacity="0.22"/><stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/></linearGradient></defs>`,
    ...ticks.map((t) => `<line x1="0" x2="${plotW}" y1="${yOf(t).toFixed(1)}" y2="${yOf(t).toFixed(1)}" stroke="${BORDER}" stroke-width="1"/>`),
  ];
  if (pts.length > 1) {
    svg.push(`<path d="M${pts[0].x},${bottom} ${pts.map((p) => `L${p.x},${p.y}`).join(" ")} L${pts[pts.length - 1].x},${bottom} Z" fill="url(#fill)"/>`);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const dashed = a.estimated || b.estimated;
      svg.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${ACCENT}" stroke-width="2.5" ${dashed ? `stroke-dasharray="6 5" stroke-opacity="0.75"` : `stroke-linecap="round"`}/>`);
    }
  }
  // 버전 업데이트 날: 세로 실선(그래프에 보이는 기간 안에 있을 때만). 라벨은 satori 텍스트로 올린다.
  const firstDay = points[0].day, lastDay = points[points.length - 1].day;
  const marks = points.length > 1 ? updates.filter((u) => u.day > firstDay && u.day <= lastDay).map((u) => ({ ...u, x: +xOf(u.day).toFixed(1) })) : [];
  for (const m of marks) svg.push(`<line x1="${m.x}" x2="${m.x}" y1="0" y2="${CHART_H}" stroke="${BRAND.muted}" stroke-width="1.5" stroke-opacity="0.7"/>`);
  for (const p of pts.slice(0, -1)) {
    if (!p.estimated) svg.push(`<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="${SURFACE}" stroke="${ACCENT}" stroke-width="2"/>`);
  }
  const last = pts[pts.length - 1];
  svg.push(`<circle cx="${last.x}" cy="${last.y}" r="5" fill="${ACCENT}"/>`, "</svg>");
  const svgUrl = `data:image/svg+xml;base64,${Buffer.from(svg.join("")).toString("base64")}`;

  const first = points[0];
  const delta = last.rating - first.rating;
  const meta = points.length > 1
    ? `${shortDay(first.day)} ${first.rating} → ${shortDay(last.day)} ${last.rating} (${delta >= 0 ? "+" : ""}${delta})`
    : `${shortDay(last.day)} ${last.rating}`;
  const midDay = days[firstI + Math.round(span / 2)] ?? last.day;
  const valueTop = Math.max(0, last.y - 24);

  return panel("레이팅 추이", meta, [
    el("div", { display: "flex", gap: 8 }, [
      // 왼쪽 눈금 라벨
      el("div", { display: "flex", position: "relative", width: CHART_Y_LABEL_W, height: CHART_H }, ticks.map((t) =>
        el("span", { position: "absolute", right: 0, top: yOf(t) - 7, color: FAINT, fontFamily: NUM_FONT, fontSize: 10, lineHeight: 1 }, String(t)))),
      // 그래프 + 마지막 값
      el("div", { display: "flex", position: "relative", width: plotW, height: CHART_H }, [
        image(svgUrl, { width: plotW, height: CHART_H }),
        ...marks.map((m) => el("span", {
          position: "absolute", top: 0, left: Math.min(plotW - 80, m.x + 5),
          color: BRAND.muted, fontSize: 10, fontWeight: 700, lineHeight: 1, whiteSpace: "nowrap",
        }, m.label)),
        el("span", {
          position: "absolute", top: valueTop, left: Math.max(0, Math.min(plotW - 52, last.x - 26)), width: 52, textAlign: "center",
          color: ACCENT, fontFamily: NUM_FONT, fontSize: 13, fontWeight: 700, lineHeight: 1,
        }, String(last.rating)),
      ]),
    ]),
    // 아래 날짜 라벨 + 범례
    el("div", { display: "flex", alignItems: "center", marginTop: 6, paddingLeft: CHART_Y_LABEL_W + 8 }, [
      el("div", { display: "flex", justifyContent: points.length > 1 ? "space-between" : "center", flex: 1, color: FAINT, fontSize: 10 },
        points.length > 1 ? [shortDay(first.day), shortDay(midDay), shortDay(last.day)].map((t) => el("span", {}, t)) : [el("span", {}, shortDay(last.day))]),
    ]),
    // 범례는 점선(추정)만 설명한다. 추정 구간이 없으면 범례를 두지 않는다.
    ...(points.some((p) => p.estimated)
      ? [el("div", { display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6, marginTop: 8, color: MUTED, fontSize: 10 }, [
          dashedSwatch(), el("span", {}, "추정 (성과 기록으로 계산)"),
        ])]
      : []),
  ]);
}

export async function renderProfileCard(
  profile: CachedProfile,
  avatarBuf: Buffer | null,
  opts: { translate?: boolean; friendCode?: string | null; ratingHistory?: { points: RatingPoint[]; days: string[]; updates?: { day: string; label: string }[] } } = {},
): Promise<Buffer> {
  const translate = !!opts.translate;
  const friendCode = opts.friendCode ?? null;
  const history = opts.ratingHistory;
  // 그래프 기간은 오늘을 끝으로 움직이므로 마지막 날짜도 키에 넣는다.
  const cacheKey = [profile.profileKey, profile.lastSyncedAt, translate ? 1 : 0, friendCode ?? "", avatarBuf?.length ?? 0, history ? history.days[history.days.length - 1] : "-", PROFILE_CARD_VERSION].join("|");
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
  const eyebrow = `PLAYER PROFILE · ${serverLabel}`;
  const name = profile.playerName || "—";
  const nameShift = alignLeftMargin({ text: name, size: 26 }, { text: eyebrow, size: 10 });
  const trophyStyle = TROPHY_STYLE[profile.trophyClass] ?? TROPHY_STYLE.normal;
  const stars = Number(profile.stars) || 0;
  const avg = (sum: number, n: number) => (n ? `평균 ${(sum / n).toFixed(1)}` : "");

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
        el("span", { color: INK, fontSize: 26, fontWeight: 800, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginLeft: nameShift }, name),
        el("div", { display: "flex", alignItems: "center", gap: 10 }, [
          pill(profile.trophy || "—", { ...trophyStyle, fontSize: 11, padding: "4px 11px", maxWidth: 420, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }),
          // 단위(段位)·클래스(오토모다치) 이미지. 단위는 이 기능 이후 동기화부터 저장된다.
          courseUrl ? image(courseUrl, { height: 26, objectFit: "contain" }) : el("span", {}, ""),
          gradeUrl ? image(gradeUrl, { height: 26, objectFit: "contain" }) : el("span", {}, ""),
          stars ? el("span", { color: "#fbbf24", fontSize: 13, fontWeight: 700 }, `★ ${stars}`) : el("span", {}, ""),
        ]),
      ]),
      el("div", { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 16, flexShrink: 0 }, [
        wordmark(),
        ratingPlate(profile.rating || 0),
      ]),
    ]),
    // 레이팅 구성·플레이 횟수. 레이팅 합계는 오른쪽 위 플레이트에 있으므로 여기선 구성만.
    statsPanel([
      { value: String(Math.round(breakdown.newSum)), label: `신곡 ${breakdown.newCount}곡 합계`, sub: avg(breakdown.newSum, breakdown.newCount) },
      { value: String(Math.round(breakdown.oldSum)), label: `구곡 ${breakdown.oldCount}곡 합계`, sub: avg(breakdown.oldSum, breakdown.oldCount) },
      { value: String(profile.playCount || 0), label: "현재 버전 플레이" },
      { value: String(profile.totalPlayCount || profile.playCount || 0), label: "누적 플레이" },
    ]),
    clearPanel(clears),
    ...(history ? [ratingChartPanel(history.points, history.days, history.updates)] : []),
    panel("최근 플레이", `최근 ${recent.length}곡`, recent.length
      ? recent.map((r, i) => recentRow(r, profile, jackets[i], translate, kindIcons))
      : [el("span", { color: MUTED, fontSize: 12, padding: "12px 0" }, "최근 플레이 기록이 없습니다.")]),
    // 푸터
    el("div", { display: "flex", justifyContent: "space-between", marginTop: 14, color: MUTED, fontSize: 11 }, [
      el("span", {}, friendCode ? `친구 코드 ${friendCode}` : " "),
      el("span", {}, `마지막 동기화 ${kstStamp(profile.lastSyncedAt)} (KST)`),
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
