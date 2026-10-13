// 곡 상세 카드(/검색 의 "상세" 버튼). maishift 곡 카드를 누르면 나오는 창과 같은 정보:
// 머리(재킷·제목·아티스트·난이도·상수·버전·버전 안 순서) → 내 기록 → 달성률 변화 → 버전별 상수 → 레이팅 구간별 달성 분포.
import {
  ACCENT, SURFACE, SURFACE2, BORDER, TEXT, MUTED, CANVAS, INK, FAINT, SOFT, NUM_FONT,
  type El, el, image, pill, panel, statsPanel, wordmark, kstStamp,
} from "./cardKit";
import { renderInWorker } from "./renderPool";
import { songVersionColor, inkOn } from "./ratingCard";
import { MAI_DIFF_COLOR, MAI_CM_COLOR, getScoreRank } from "../../games";
import { calcSongRating } from "../../constants";
import { chartSRating, dxStars, formatChartSRating } from "../../sRating";
import type { TrackInfo, TrackScore } from "../../maishift/track";
import { msg } from "../../messages";

const WIDTH = 920;
const INNER = WIDTH - 48 - 34; // 카드 패딩·패널 패딩·테두리를 뺀 패널 안쪽 폭

export interface TrackCardData {
  title: string;
  artist: string | null;
  kind: "ST" | "DX";
  diff: string;
  constant: number | null;
  constantEstimated: boolean;
  /** maishift 세대 번호(0=maimai … 26=CiRCLE PLUS). 모르면 null */
  songVersion: number | null;
  versionName: (id: number) => string;
  jacketUrl: string | null;
  /** 내 기록. 플레이하지 않았으면 null */
  record: { achievement: number; dxScore?: number; dxMax?: number; fc: string; sync: string } | null;
  /** 기록 변화(시간순). null 이면 받지 못함(이전 기록 비공개 등) */
  scores: TrackScore[] | null;
  info: TrackInfo;
  playerName: string;
  /** 분포에서 강조할 내 레이팅 */
  playerRating: number;
}

const fmt = (n: number) => n.toLocaleString("en-US");
const ymd = (ms: number) => kstStamp(ms).slice(0, 10);

// maishift 기록의 콤보·싱크 이름 → 캐롤봇 표기
const COMBO: Record<string, string> = { FULL_COMBO: "FC", FULL_COMBO_PLUS: "FC+", ALL_PERFECT: "AP", ALL_PERFECT_PLUS: "AP+" };
const SYNC: Record<string, string> = { SYNC_PLAY: "SYNC", FULL_SYNC: "FS", FULL_SYNC_PLUS: "FS+", FULL_SYNC_DX: "FDX", FULL_SYNC_DX_PLUS: "FDX+" };

// 분포의 랭크 칸(서로 겹치지 않음). 낮은 랭크부터 왼쪽에.
const DIST_RANKS: { key: string; label: string; color: string }[] = [
  { key: "LT_94", label: "~AA", color: "#52525b" },
  { key: "AAA", label: "AAA", color: "#3b82f6" },
  { key: "S", label: "S", color: "#22c55e" },
  { key: "S_PLUS", label: "S+", color: "#84cc16" },
  { key: "SS", label: "SS", color: "#eab308" },
  { key: "SS_PLUS", label: "SS+", color: "#f97316" },
  { key: "SSS", label: "SSS", color: "#ef4444" },
  { key: "SSS_PLUS", label: "SSS+", color: "#d946ef" },
];

/** 같은 기록이 업로드마다 반복되므로, 바뀐 때만 남긴다. */
function changes(scores: TrackScore[]): TrackScore[] {
  const out: TrackScore[] = [];
  for (const s of scores) {
    const p = out[out.length - 1];
    if (!p || p.achievement !== s.achievement || p.dxScore !== s.dxScore || p.combo !== s.combo || p.sync !== s.sync) out.push(s);
  }
  return out;
}

function niceStep(range: number): number {
  return [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 20].find((s) => range / s <= 5) ?? 20;
}

/** 달성률 계단 그래프(가로축은 시각). 범위가 좁아 히스토리 그래프 대신 따로 그린다. */
function achievementChart(points: TrackScore[], until: number): El {
  const H = 150, AXIS = 52, plotW = INNER - AXIS - 6;
  const lo = Math.min(...points.map((p) => p.achievement)), hi = Math.max(...points.map((p) => p.achievement));
  const step = niceStep(Math.max(hi - lo, 0.2) * 1.3);
  const min = Math.floor((lo - step * 0.3) / step) * step;
  const max = Math.min(101, Math.max(min + step, Math.ceil((hi + step * 0.3) / step) * step));
  const ticks: number[] = [];
  for (let t = min; t <= max + 1e-9; t += step) ticks.push(+t.toFixed(4));
  const t0 = points[0].at, t1 = Math.max(until, points[points.length - 1].at, t0 + 86400000);
  const x = (at: number) => 8 + ((at - t0) / (t1 - t0)) * (plotW - 16);
  const y = (v: number) => 12 + (1 - (v - min) / (max - min)) * (H - 24);
  const pts = [...points.map((p) => ({ x: x(p.at), y: y(p.achievement) })), { x: x(t1), y: y(points[points.length - 1].achievement) }];
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) d += ` L${pts[i].x.toFixed(1)},${pts[i - 1].y.toFixed(1)} L${pts[i].x.toFixed(1)},${pts[i].y.toFixed(1)}`;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${plotW}" height="${H}" viewBox="0 0 ${plotW} ${H}">`,
    ...ticks.map((t) => `<line x1="0" x2="${plotW}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" stroke="${BORDER}" stroke-width="1"/>`),
    `<path d="${d}" fill="none" stroke="${ACCENT}" stroke-width="2"/>`,
    ...points.map((p) => `<circle cx="${x(p.at).toFixed(1)}" cy="${y(p.achievement).toFixed(1)}" r="3" fill="${ACCENT}"/>`),
    "</svg>",
  ].join("");
  const decimals = step < 0.1 ? 2 : step < 1 ? 1 : 0;
  return el("div", { display: "flex", flexDirection: "column" }, [
    el("div", { display: "flex", gap: 6 }, [
      el("div", { display: "flex", position: "relative", width: AXIS, height: H, flexShrink: 0 }, ticks.map((t) =>
        el("span", { position: "absolute", right: 0, top: y(t) - 6, color: FAINT, fontFamily: NUM_FONT, fontSize: 10, lineHeight: 1 }, `${t.toFixed(decimals)}%`))),
      image(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`, { width: plotW, height: H }),
    ]),
    el("div", { display: "flex", justifyContent: "space-between", marginTop: 6, paddingLeft: AXIS + 6, color: FAINT, fontSize: 10 }, [
      el("span", {}, ymd(t0)),
      el("span", {}, ymd(t1)),
    ]),
  ]);
}

/** 기록이 바뀐 때 목록(최근부터). */
function changeRows(list: TrackScore[]): El {
  const rows = [...list].reverse().slice(0, 6);
  return el("div", { display: "flex", flexDirection: "column", marginTop: 12, borderTop: `1px solid ${BORDER}` }, rows.map((s, i) => {
    const prev = list[list.length - 1 - i - 1];
    const gain = prev ? s.achievement - prev.achievement : null;
    const dxPct = s.dxMax ? (s.dxScore / s.dxMax) * 100 : 0;
    return el("div", { display: "flex", alignItems: "center", gap: 12, padding: "7px 2px", borderBottom: i < rows.length - 1 ? `1px solid ${BORDER}` : "none" }, [
      el("span", { width: 86, color: MUTED, fontFamily: NUM_FONT, fontSize: 12 }, ymd(s.at)),
      el("span", { width: 92, color: INK, fontFamily: NUM_FONT, fontSize: 14, fontWeight: 700 }, `${s.achievement.toFixed(4)}%`),
      el("span", { width: 70, color: gain !== null && gain > 0 ? "#4ade80" : FAINT, fontFamily: NUM_FONT, fontSize: 12, fontWeight: 700 },
        gain === null ? msg("trackCard.firstRecord") : gain > 0 ? `+${gain.toFixed(4)}` : "—"),
      el("span", { flex: 1, color: TEXT, fontFamily: NUM_FONT, fontSize: 12 }, s.dxMax ? `DX ${fmt(s.dxScore)} / ${fmt(s.dxMax)} (${dxPct.toFixed(2)}%)` : ""),
      el("span", { color: MAI_CM_COLOR[COMBO[s.combo] ?? ""] ?? FAINT, fontSize: 11, fontWeight: 800 }, COMBO[s.combo] ?? ""),
      el("span", { color: MAI_CM_COLOR[SYNC[s.sync] ?? ""] ?? FAINT, fontSize: 11, fontWeight: 800, width: 34, textAlign: "right" }, SYNC[s.sync] ?? ""),
    ]);
  }));
}

/** 버전별 상수. 바뀐 곳은 ▲/▼. */
function levelRow(info: TrackInfo, versionName: (id: number) => string): El {
  return el("div", { display: "flex", flexWrap: "wrap", gap: 8 }, info.levels.map((l, i) => {
    const prev = info.levels[i - 1];
    const d = prev ? +(l.constant - prev.constant).toFixed(1) : 0;
    const color = songVersionColor(l.versionId);
    return el("div", { display: "flex", alignItems: "center", gap: 8, background: SURFACE2, borderRadius: 10, padding: "6px 10px", borderLeft: `3px solid ${color}` }, [
      el("span", { color: MUTED, fontSize: 11, fontWeight: 700 }, versionName(l.versionId)),
      el("span", { color: INK, fontFamily: NUM_FONT, fontSize: 15, fontWeight: 800 }, l.constant.toFixed(1)),
      ...(d ? [el("span", { color: d > 0 ? "#f87171" : "#60a5fa", fontFamily: NUM_FONT, fontSize: 11, fontWeight: 700 }, `${d > 0 ? "▲" : "▼"}${Math.abs(d).toFixed(1)}`)] : []),
    ]);
  }));
}

/** 레이팅 구간별 달성 분포(랭크별 인원 비율 막대). 내 레이팅 구간은 강조. */
function distRows(info: TrackInfo, rating: number): El {
  const buckets = info.dist.filter((b) => b.total > 0);
  const LABEL_W = 108, COUNT_W = 54, barW = INNER - LABEL_W - COUNT_W - 16;
  const rows = buckets.map((b) => {
    const mine = rating >= b.min && rating < b.max;
    const segs = DIST_RANKS.map((r) => ({ ...r, n: b.counts[r.key] ?? 0 })).filter((s) => s.n > 0);
    const sum = segs.reduce((a, s) => a + s.n, 0) || 1;
    return el("div", { display: "flex", alignItems: "center", gap: 8, padding: "3px 4px", borderRadius: 8, background: mine ? "rgba(255,146,148,0.10)" : "transparent" }, [
      el("span", { width: LABEL_W, color: mine ? SOFT : MUTED, fontFamily: NUM_FONT, fontSize: 11, fontWeight: mine ? 800 : 500 },
        `${fmt(b.min)}–${fmt(b.max - 1)}`),
      el("div", { display: "flex", width: barW, height: 14, borderRadius: 4, overflow: "hidden", background: SURFACE2 },
        segs.map((s) => el("div", { width: Math.max(1, (s.n / sum) * barW), height: 14, background: s.color }))),
      el("span", { width: COUNT_W, color: mine ? SOFT : FAINT, fontFamily: NUM_FONT, fontSize: 11, textAlign: "right" }, msg("trackCard.people", { count: fmt(b.total) })),
    ]);
  });
  const legend = el("div", { display: "flex", flexWrap: "wrap", gap: 12, marginTop: 10, color: MUTED, fontSize: 10 }, DIST_RANKS.map((r) =>
    el("div", { display: "flex", alignItems: "center", gap: 5 }, [
      el("div", { width: 10, height: 10, borderRadius: 3, background: r.color }),
      el("span", {}, r.label),
    ])));
  return el("div", { display: "flex", flexDirection: "column", gap: 2 }, [...rows, legend]);
}

function emptyNote(text: string): El {
  return el("span", { color: FAINT, fontSize: 12, padding: "6px 2px" }, text);
}

export async function renderTrackCard(d: TrackCardData): Promise<Buffer> {
  const diffColor = MAI_DIFF_COLOR[d.diff] ?? "#888";
  const vColor = d.songVersion !== null ? songVersionColor(d.songVersion) : null;
  const vName = d.songVersion !== null ? d.versionName(d.songVersion) : null;
  const pos = d.info.position;

  // 머리
  const head = el("div", { display: "flex", alignItems: "center", paddingBottom: 18, borderBottom: `1px solid ${BORDER}` }, [
    d.jacketUrl
      ? image(d.jacketUrl, { width: 104, height: 104, objectFit: "cover", borderRadius: 14, marginRight: 18, flexShrink: 0 })
      : el("div", { width: 104, height: 104, borderRadius: 14, background: SURFACE2, marginRight: 18, flexShrink: 0 }),
    el("div", { display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: 7 }, [
      el("div", { display: "flex", alignItems: "center", gap: 6 }, [
        pill(d.diff, { background: diffColor, color: "#fff" }),
        pill(d.kind, { background: d.kind === "DX" ? "#f97316" : "#3b82f6", color: "#fff" }),
        ...(vName && vColor ? [pill(vName, { background: vColor, color: inkOn(vColor) })] : []),
        ...(pos ? [el("span", { color: FAINT, fontSize: 10, marginLeft: 2 }, msg("trackCard.versionPosition", { order: pos.order === null ? "?" : pos.order + 1, total: pos.total }))] : []),
      ]),
      el("span", { color: INK, fontSize: 24, fontWeight: 800, lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, d.title),
      el("span", { color: MUTED, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, d.artist ?? ""),
    ]),
    el("div", { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12, flexShrink: 0, marginLeft: 16 }, [
      wordmark(msg("maishift.credit")),
      el("div", { display: "flex", alignItems: "flex-start" }, [
        el("span", { color: INK, fontFamily: NUM_FONT, fontSize: 34, fontWeight: 800, lineHeight: 1 }, d.constant !== null ? d.constant.toFixed(1) : "—"),
        ...(d.constantEstimated ? [el("span", { color: MUTED, fontFamily: NUM_FONT, fontSize: 16, fontWeight: 800, marginLeft: 2 }, "?")] : []),
      ]),
    ]),
  ]);

  // 내 기록
  const r = d.record;
  const myRecord = r && r.achievement > 0
    ? (() => {
        const dxPct = r.dxMax ? ((r.dxScore ?? 0) / r.dxMax) * 100 : null;
        const rating = d.constant !== null ? calcSongRating(r.achievement, d.constant, r.fc) : null;
        const sValue = d.constant !== null && dxPct !== null ? chartSRating(d.constant, dxPct) : null;
        return statsPanel([
          { value: `${r.achievement.toFixed(4)}%`, label: msg("trackCard.achievement"), sub: getScoreRank(r.achievement) },
          { value: r.dxMax ? `${fmt(r.dxScore ?? 0)} / ${fmt(r.dxMax)}` : "—", label: msg("trackCard.dxScore"), sub: dxPct !== null ? `${dxPct.toFixed(2)}% · ✦${dxStars(dxPct)}` : undefined },
          { value: rating !== null ? String(rating) : "—", label: msg("trackCard.rating"), sub: sValue !== null ? msg("trackCard.sRating", { value: formatChartSRating(sValue) }) : undefined },
          { value: [r.fc, r.sync].filter(Boolean).join(" · ") || "—", label: msg("trackCard.comboSync") },
        ]);
      })()
    : panel(msg("trackCard.myRecord"), "", [emptyNote(msg("trackCard.noRecord"))]);

  // 달성률 변화
  const list = d.scores ? changes(d.scores.filter((s) => s.achievement > 0)) : null;
  const history = panel(msg("trackCard.scoreHistory"), list && list.length ? msg("trackCard.scoreHistoryMeta", { count: list.length }) : "",
    list === null ? [emptyNote(msg("trackCard.scoresHidden"))]
      : list.length === 0 ? [emptyNote(msg("trackCard.scoresEmpty"))]
      : [...(list.length > 1 ? [achievementChart(list, Date.now())] : []), changeRows(list)]);

  // 버전별 상수
  const levels = panel(msg("trackCard.levelHistory"), "", d.info.levels.length ? [levelRow(d.info, d.versionName)] : [emptyNote(msg("trackCard.levelsEmpty"))]);

  // 분포
  const dist = panel(msg("trackCard.distribution"), d.info.distAt ? msg("trackCard.distributionMeta", { date: ymd(d.info.distAt) }) : "",
    d.info.dist.some((b) => b.total > 0) ? [distRows(d.info, d.playerRating)] : [emptyNote(msg("trackCard.distEmpty"))]);

  const root = el("div", { display: "flex", flexDirection: "column", width: WIDTH, background: CANVAS, padding: 24, color: TEXT, fontFamily: "Noto Sans JP" }, [
    head,
    el("div", { display: "flex", justifyContent: "space-between", marginTop: 14, color: MUTED, fontSize: 11 }, [
      el("span", {}, msg("trackCard.player", { name: d.playerName || "—" })),
    ]),
    myRecord,
    history,
    levels,
    dist,
  ]);
  return renderInWorker(root, WIDTH);
}
