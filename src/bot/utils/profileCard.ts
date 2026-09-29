import { BRAND } from "../../brand";
import { renderInWorker } from "./renderPool";
import type { CachedProfile } from "../../storage/types";
import type { PlayRecord } from "../../scraper";
import { getConstant, getJacketFile } from "../../constants";
import { displayTitle } from "../../aliases";
import { getScoreRank, MAI_CM_COLOR } from "../../games";
import { fetchJacketDataUrl, ratingBreakdown, ratingPlate } from "./ratingCard";

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

// 랭크 분포 막대·범례 색. 게임 랭크색(금색 계열)을 진한 것 → 옅은 것 순으로 이어 붙였다.
const RANK_RAMP: [string, string][] = [
  ["SSS+", "#d97706"], ["SSS", "#f59e0b"], ["SS+", "#fbbf24"],
  ["SS", "#fcd34d"], ["S+", "#fde68a"], ["S", "#fef3c7"],
];
const RANK_OTHER_COLOR = BRAND.border2;
const MARK_GROUPS: { label: string; keys: string[] }[] = [
  { label: "콤보", keys: ["AP+", "AP", "FC+", "FC"] },
  { label: "싱크", keys: ["FDX+", "FDX", "FS+", "FS"] },
];
const MARK_COLOR: Record<string, string> = {
  "AP+": "#d946ef", AP: "#d946ef", "FC+": "#3b82f6", FC: "#60a5fa",
  "FDX+": "#10b981", FDX: "#34d399", "FS+": "#22c55e", FS: "#4ade80",
};

const PROFILE_CARD_VERSION = 2;
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
    display: "flex", flexDirection: "column", alignItems: "center", flex: 1, gap: 7,
    ...(i > 0 ? { borderLeft: `1px solid ${BORDER}` } : {}),
  }, [
    el("span", { color: SOFT, fontFamily: NUM_FONT, fontSize: 28, fontWeight: 700, lineHeight: 1 }, it.value),
    el("span", { color: MUTED, fontSize: 11 }, it.label),
    el("span", { color: FAINT, fontSize: 10, lineHeight: 1 }, it.sub || " "),
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

function dot(color: string): El {
  return el("div", { width: 7, height: 7, borderRadius: 99, background: color, flexShrink: 0 });
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
  const rankItems: { label: string; color: string; count: number }[] = RANK_RAMP.map(([k, color]) => ({ label: k, color, count: ranks.get(k) ?? 0 }));
  const listed = rankItems.reduce((sum, it) => sum + it.count, 0);
  rankItems.push({ label: "그 외", color: RANK_OTHER_COLOR, count: Math.max(0, played - listed) });
  const pct = (n: number) => (played ? (n / played) * 100 : 0);

  // 랭크 분포 막대: 개수 비율만큼 이어 붙인 한 줄.
  const bar = el("div", { display: "flex", height: 8, borderRadius: 99, overflow: "hidden", background: RANK_OTHER_COLOR },
    rankItems.filter((it) => it.count > 0).map((it) => el("div", { width: `${pct(it.count)}%`, height: 8, background: it.color })));

  const legend = el("div", { display: "flex", marginTop: 14 }, rankItems.map((it) =>
    el("div", { display: "flex", flexDirection: "column", alignItems: "center", flex: 1, gap: 6 }, [
      el("div", { display: "flex", alignItems: "center", gap: 5 }, [
        dot(it.color),
        el("span", { color: MUTED, fontSize: 11, fontWeight: 700 }, it.label),
      ]),
      el("span", { color: INK, fontFamily: NUM_FONT, fontSize: 20, fontWeight: 700, lineHeight: 1 }, String(it.count)),
      el("span", { color: FAINT, fontSize: 10, lineHeight: 1 }, `${Math.round(pct(it.count))}%`),
    ])));

  const markGroups = el("div", { display: "flex", marginTop: 16, paddingTop: 14, borderTop: `1px solid ${BORDER}` },
    MARK_GROUPS.map((g, gi) => el("div", {
      display: "flex", flexDirection: "column", flex: 1, gap: 10,
      ...(gi > 0 ? { borderLeft: `1px solid ${BORDER}`, paddingLeft: 16 } : { paddingRight: 16 }),
    }, [
      el("span", { color: FAINT, fontSize: 10, fontWeight: 700 }, g.label),
      el("div", { display: "flex" }, g.keys.map((k) => el("div", { display: "flex", flexDirection: "column", alignItems: "center", flex: 1, gap: 6 }, [
        el("span", { color: MARK_COLOR[k] ?? INK, fontSize: 12, fontWeight: 800, lineHeight: 1 }, k),
        el("span", { color: INK, fontFamily: NUM_FONT, fontSize: 20, fontWeight: 700, lineHeight: 1 }, String(marks.get(k) ?? 0)),
      ]))),
    ])));

  return panel("클리어 현황", `플레이한 채보 ${played}개 기준`, [bar, legend, markGroups]);
}

function recentRow(record: PlayRecord, profile: CachedProfile, jacket: string | null, translate: boolean): El {
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
        el("span", { color: MUTED, fontSize: 10, whiteSpace: "nowrap" }, `${record.musicKind || "?"} · ${record.date || ""}`),
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

export async function renderProfileCard(
  profile: CachedProfile,
  avatarBuf: Buffer | null,
  opts: { translate?: boolean; friendCode?: string | null } = {},
): Promise<Buffer> {
  const translate = !!opts.translate;
  const friendCode = opts.friendCode ?? null;
  const cacheKey = [profile.profileKey, profile.lastSyncedAt, translate ? 1 : 0, friendCode ?? "", avatarBuf?.length ?? 0, PROFILE_CARD_VERSION].join("|");
  const memo = profileCardCache.get(cacheKey);
  if (memo) return memo;

  const recent = parseList(profile.recentJson).slice(0, RECENT_COUNT);
  const clears = parseList(profile.clearJson);
  const breakdown = ratingBreakdown(profile);
  const [avatarUrl, gradeUrl, jackets] = await Promise.all([
    avatarBuf ? Promise.resolve(`data:image/png;base64,${avatarBuf.toString("base64")}`) : remoteDataUrl(profile.avatar),
    remoteDataUrl(profile.gradeImg),
    Promise.all(recent.map((r) => jacketFor(r))),
  ]);

  const serverLabel = profile.server === "jp" ? "JP" : "INTERNATIONAL";
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
        el("span", { color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.4 }, `PLAYER PROFILE · ${serverLabel}`),
        el("span", { color: INK, fontSize: 26, fontWeight: 800, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, profile.playerName || "—"),
        el("div", { display: "flex", alignItems: "center", gap: 10 }, [
          pill(profile.trophy || "—", { ...trophyStyle, fontSize: 11, padding: "4px 11px", maxWidth: 420, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }),
          gradeUrl ? image(gradeUrl, { height: 24, objectFit: "contain" }) : el("span", {}, ""),
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
    panel("최근 플레이", `최근 ${recent.length}곡`, recent.length
      ? recent.map((r, i) => recentRow(r, profile, jackets[i], translate))
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
