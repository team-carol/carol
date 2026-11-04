// /플레이트 이미지 카드. 다른 사용자 카드(/스탬프·/히스토리)와 같은 머리(cardHeader)·패널(cardKit)·랜딩 토큰을 쓴다.
// - 전체: 버전마다 한 줄, 極·将·神·舞舞·覇者 칸에 진행 막대(다 채우면 완료 칩).
// - 상세: 그 플레이트의 종류별 진행(같은 레이팅대 예상 플레이 수)과, 고른 종류의 남은 보면(가까운 순).
import {
  SURFACE, SURFACE2, BORDER, TEXT, MUTED, CANVAS, INK, FAINT, NUM_FONT,
  type El, el, pill, panel, kstStamp,
} from "./cardKit";
import { userCardHeader, avatarDataUrl } from "./cardHeader";
import { renderInWorker } from "./renderPool";
import { MAI_DIFF_COLOR } from "../../games";
import { displayTitle } from "../../aliases";
import { versionName } from "../../maishift/catalog";
import type { CachedProfile } from "../../storage/types";
import type { PlateDef, PlateProgress, PlateType, PlateChartState } from "../../plates";
import { msg } from "../../messages";

const WIDTH = 760;
/** 종류별 색(게임 마크 색: FC 파랑, SSS 금색, AP 자주, FDX 초록). 覇者 는 주황. */
export const PLATE_TYPE_COLOR: Record<PlateType, string> = { 極: "#60a5fa", 将: "#f59e0b", 神: "#d946ef", 舞舞: "#34d399", 覇者: "#fb923c" };
export const PLATE_TYPE_LABEL: Record<PlateType, string> = { 極: "FC", 将: "SSS", 神: "AP", 舞舞: "FDX", 覇者: "CLEAR" };
const ALL_TYPES: PlateType[] = ["極", "将", "神", "舞舞", "覇者"];
const KIND_COLOR = { DX: "#f97316", ST: "#3b82f6" };

function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** 플레이트 대상 버전 이름(真 은 두 버전, 舞 는 maimai~FiNALE). */
export function plateVersionLabel(def: PlateDef): string {
  if (def.versions.length === 1) return versionName(def.versions[0]);
  if (def.versions.length === 2) return `${versionName(def.versions[0])} · ${versionName(def.versions[1])}`;
  return `${versionName(def.versions[0])} ~ ${versionName(def.versions[def.versions.length - 1])}`;
}

function kanjiBadge(prefix: string, size: number): El {
  return el("div", {
    display: "flex", alignItems: "center", justifyContent: "center", width: size, height: size, flexShrink: 0,
    borderRadius: Math.round(size * 0.28), background: SURFACE2, border: `1px solid ${BORDER}`,
  }, [el("span", { color: INK, fontSize: Math.round(size * 0.52), fontWeight: 800, lineHeight: 1 }, prefix)]);
}

function bar(ratio: number, color: string, height: number): El {
  return el("div", { display: "flex", width: "100%", height, borderRadius: height, background: BORDER }, [
    el("div", { display: "flex", width: `${Math.max(0, Math.min(1, ratio)) * 100}%`, height, borderRadius: height, background: color }),
  ]);
}

function doneChip(type: PlateType, height = 22): El {
  const color = PLATE_TYPE_COLOR[type];
  return el("div", { display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height, borderRadius: 8, background: alpha(color, 0.18), border: `1px solid ${alpha(color, 0.5)}` }, [
    el("span", { color, fontSize: 11, fontWeight: 800, lineHeight: 1 }, msg("plateCard.complete")),
  ]);
}

const VERSION_COL = 176;

function overviewCell(p: PlateProgress, type: PlateType): El {
  const box = (children: El[]) => el("div", { display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, minWidth: 0, padding: "0 6px", gap: 5 }, children);
  if (!p.def.types.includes(type) || p.total === 0) {
    return box([el("span", { color: FAINT, fontSize: 12, textAlign: "center", width: "100%", display: "flex", justifyContent: "center" }, "—")]);
  }
  const done = p.done[type] ?? 0;
  if (done >= p.total) return box([doneChip(type)]);
  return box([
    el("div", { display: "flex", justifyContent: "space-between", alignItems: "baseline" }, [
      el("span", { color: TEXT, fontFamily: NUM_FONT, fontSize: 12, fontWeight: 700, lineHeight: 1 }, String(done)),
      el("span", { color: FAINT, fontFamily: NUM_FONT, fontSize: 10, lineHeight: 1 }, `/${p.total}`),
    ]),
    bar(done / p.total, PLATE_TYPE_COLOR[type], 4),
  ]);
}

function typeHeader(type: PlateType): El {
  return el("div", { display: "flex", alignItems: "baseline", justifyContent: "center", flex: 1, minWidth: 0, gap: 5 }, [
    el("span", { color: PLATE_TYPE_COLOR[type], fontSize: 13, fontWeight: 800, lineHeight: 1 }, type),
    el("span", { color: MUTED, fontSize: 9, fontWeight: 700, letterSpacing: 0.4, lineHeight: 1 }, PLATE_TYPE_LABEL[type]),
  ]);
}

const serverLabelOf = (profile: CachedProfile) => (profile.server === "jp" ? "JP" : "INTERNATIONAL");

function footer(profile: CachedProfile, note?: string): El {
  return el("div", { display: "flex", justifyContent: "space-between", marginTop: 14, color: MUTED, fontSize: 11, gap: 16 }, [
    el("span", { flex: 1, minWidth: 0 }, note ?? " "),
    el("span", { flexShrink: 0 }, msg("card.lastSynced", { time: kstStamp(profile.lastSyncedAt) })),
  ]);
}

/** 모든 플레이트 진행 한 장. */
export async function renderPlateOverview(profile: CachedProfile, avatarBuf: Buffer | null, list: PlateProgress[], held: number): Promise<Buffer> {
  const avatarUrl = await avatarDataUrl(profile, avatarBuf);
  const head = userCardHeader(profile, avatarUrl, msg("plateCard.eyebrow", { server: serverLabelOf(profile) }), msg("plateCard.summary", { held, plates: list.length }));
  const rows = list.map((p, i) => el("div", {
    display: "flex", alignItems: "center", padding: "7px 0", borderBottom: i === list.length - 1 ? "none" : `1px solid ${BORDER}`,
  }, [
    el("div", { display: "flex", alignItems: "center", gap: 10, width: VERSION_COL, flexShrink: 0, minWidth: 0 }, [
      kanjiBadge(p.def.prefix, 28),
      el("span", { color: TEXT, fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, minWidth: 0 }, plateVersionLabel(p.def)),
    ]),
    ...ALL_TYPES.map((t) => overviewCell(p, t)),
  ]));
  const table = el("div", { display: "flex", flexDirection: "column" }, [
    el("div", { display: "flex", alignItems: "center", paddingBottom: 8, borderBottom: `1px solid ${BORDER}` }, [
      el("span", { color: MUTED, fontSize: 10, fontWeight: 700, width: VERSION_COL, flexShrink: 0 }, msg("plateCard.versionColumn")),
      ...ALL_TYPES.map(typeHeader),
    ]),
    ...rows,
  ]);
  const root = el("div", { display: "flex", flexDirection: "column", width: WIDTH, background: CANVAS, padding: 24, color: TEXT, fontFamily: "Noto Sans JP" }, [
    head,
    panel(msg("plateCard.overviewTitle"), msg("plateCard.overviewMeta"), [table]),
    footer(profile, msg("plateCard.overviewNote")),
  ]);
  return renderInWorker(root, WIDTH);
}

export interface PlateDetailExtras {
  /** 종류별 같은 레이팅대 예상 플레이 수(모르면 없음) */
  plays?: Partial<Record<PlateType, number | null>>;
  /** 같은 레이팅대 구간 이름(예: "16,250~16,500") */
  band?: string | null;
  /** 이 플레이트를 처음 얻은 날 레이팅(중앙값), 종류별 */
  firstRating?: Partial<Record<PlateType, number>>;
  /** maishift 가 센 대상 보면 수. 캐롤봇 계산과 다를 때만 */
  maishiftTotal?: number | null;
  translate: boolean;
}

const LIST_LIMIT = 60;

function typeTile(p: PlateProgress, type: PlateType, selected: boolean, extras: PlateDetailExtras): El {
  const color = PLATE_TYPE_COLOR[type];
  const done = p.done[type] ?? 0;
  const complete = done >= p.total && p.total > 0;
  const plays = extras.plays?.[type];
  const sub = complete ? msg("plateCard.tileDone")
    : plays ? msg("plateCard.tilePlays", { plays: plays.toLocaleString("en-US") })
    : msg("plateCard.tileLeft", { left: p.total - done });
  return el("div", {
    display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: 8, padding: "12px 12px 11px",
    background: SURFACE, borderRadius: 14, border: `1px solid ${selected ? alpha(color, 0.7) : BORDER}`,
  }, [
    el("div", { display: "flex", alignItems: "baseline", gap: 6 }, [
      el("span", { color, fontSize: 20, fontWeight: 800, lineHeight: 1 }, type),
      el("span", { color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.4, lineHeight: 1 }, PLATE_TYPE_LABEL[type]),
    ]),
    el("div", { display: "flex", alignItems: "baseline", gap: 3 }, [
      el("span", { color: INK, fontFamily: NUM_FONT, fontSize: 18, fontWeight: 700, lineHeight: 1 }, String(done)),
      el("span", { color: FAINT, fontFamily: NUM_FONT, fontSize: 11, lineHeight: 1 }, `/ ${p.total}`),
    ]),
    complete ? doneChip(type, 6) : bar(p.total ? done / p.total : 0, color, 6),
    el("span", { color: complete ? color : MUTED, fontSize: 10, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, sub),
  ]);
}

function recordText(type: PlateType, s: PlateChartState): { main: string; mark: string } {
  const r = s.record;
  if (!r || !(r.achievementVal > 0)) return { main: msg("plateCard.notPlayed"), mark: "" };
  const mark = type === "舞舞" ? r.sync : r.fc;
  return { main: `${r.achievementVal.toFixed(4)}%`, mark: mark || "" };
}

function remainingRow(type: PlateType, s: PlateChartState, translate: boolean): El {
  const c = s.chart;
  const { main, mark } = recordText(type, s);
  return el("div", { display: "flex", alignItems: "center", gap: 7, padding: "5px 0", borderBottom: `1px solid ${BORDER}`, minWidth: 0 }, [
    el("div", { display: "flex", alignItems: "center", justifyContent: "center", width: 38, height: 20, borderRadius: 6, background: MAI_DIFF_COLOR[c.diff] ?? SURFACE2, flexShrink: 0 }, [
      el("span", { color: "#fff", fontSize: 10, fontWeight: 800, lineHeight: 1 }, c.constant > 0 ? c.constant.toFixed(1) : c.level),
    ]),
    pill(c.kind, { background: KIND_COLOR[c.kind], color: "#fff", fontSize: 8, padding: "2px 6px" }),
    el("span", { color: INK, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, minWidth: 0 }, displayTitle(c.title, translate)),
    el("div", { display: "flex", alignItems: "baseline", gap: 4, flexShrink: 0 }, [
      el("span", { color: s.record && s.record.achievementVal > 0 ? TEXT : FAINT, fontFamily: NUM_FONT, fontSize: 10, lineHeight: 1 }, main),
      ...(mark ? [el("span", { color: MUTED, fontSize: 9, fontWeight: 700, lineHeight: 1 }, mark)] : []),
    ]),
  ]);
}

/** 플레이트 하나의 상세: 종류별 진행 + 고른 종류의 남은 보면. */
export async function renderPlateDetail(profile: CachedProfile, avatarBuf: Buffer | null, p: PlateProgress, type: PlateType, extras: PlateDetailExtras): Promise<Buffer> {
  const avatarUrl = await avatarDataUrl(profile, avatarBuf);
  const head = userCardHeader(profile, avatarUrl, msg("plateCard.detailEyebrow", { server: serverLabelOf(profile) }), msg("plateCard.detailSummary", { prefix: p.def.prefix, versions: plateVersionLabel(p.def), total: p.total }));
  const left = p.remaining[type] ?? [];
  const shown = left.slice(0, LIST_LIMIT);
  const half = Math.ceil(shown.length / 2);
  const column = (items: PlateChartState[]) => el("div", { display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }, items.map((s) => remainingRow(type, s, extras.translate)));
  const notes: string[] = [];
  if (left.length > shown.length) notes.push(msg("plateCard.more", { count: left.length - shown.length }));
  const first = extras.firstRating?.[type];
  if (first) notes.push(msg("plateCard.firstRating", { rating: first.toLocaleString("en-US") }));
  if (extras.maishiftTotal && extras.maishiftTotal !== p.total) notes.push(msg("plateCard.totalMismatch", { total: extras.maishiftTotal }));

  const listPanel = left.length
    ? panel(msg("plateCard.remainingTitle", { type, label: PLATE_TYPE_LABEL[type] }), msg("plateCard.remainingMeta", { count: left.length }), [
        el("div", { display: "flex", gap: 16 }, [column(shown.slice(0, half)), column(shown.slice(half))]),
      ])
    : panel(msg("plateCard.remainingTitle", { type, label: PLATE_TYPE_LABEL[type] }), "", [
        el("span", { color: PLATE_TYPE_COLOR[type], fontSize: 13, fontWeight: 700, padding: "6px 0" }, msg("plateCard.allDone")),
      ]);

  const root = el("div", { display: "flex", flexDirection: "column", width: WIDTH, background: CANVAS, padding: 24, color: TEXT, fontFamily: "Noto Sans JP" }, [
    head,
    el("div", { display: "flex", alignItems: "center", gap: 14, marginTop: 16 }, [
      kanjiBadge(p.def.prefix, 64),
      el("div", { display: "flex", gap: 10, flex: 1, minWidth: 0 }, p.def.types.map((t) => typeTile(p, t, t === type, extras))),
    ]),
    ...(extras.band ? [el("span", { color: FAINT, fontSize: 10, marginTop: 8, display: "flex", justifyContent: "flex-end" }, msg("plateCard.playsNote", { band: extras.band }))] : []),
    listPanel,
    ...(notes.length ? [el("div", { display: "flex", flexDirection: "column", gap: 4, marginTop: 10 }, notes.map((n) => el("span", { color: MUTED, fontSize: 10 }, n)))] : []),
    footer(profile),
  ]);
  return renderInWorker(root, WIDTH);
}
