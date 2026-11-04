// /플레이리스트 이미지 카드. maishift 공개 플레이리스트의 보면을 순서대로, 각 보면의 내 기록과 함께 보여 준다.
// 다른 사용자 카드와 같은 머리(cardHeader)·패널·숫자 칸(cardKit)을 쓴다.
import {
  SURFACE2, BORDER, TEXT, MUTED, CANVAS, INK, FAINT, NUM_FONT,
  type El, el, pill, panel, statsPanel, kstStamp,
} from "./cardKit";
import { userCardHeader, avatarDataUrl } from "./cardHeader";
import { renderInWorker } from "./renderPool";
import { MAI_DIFF_COLOR, getScoreRank } from "../../games";
import { displayTitle } from "../../aliases";
import type { CachedProfile } from "../../storage/types";
import type { PlayRecord } from "../../scraper";
import { msg } from "../../messages";

const WIDTH = 760;
const LIMIT = 80;
const KIND_COLOR = { DX: "#f97316", ST: "#3b82f6" };
const MARK_COLOR: Record<string, string> = {
  "AP+": "#d946ef", AP: "#d946ef", "FC+": "#3b82f6", FC: "#60a5fa",
  "FDX+": "#10b981", FDX: "#34d399", "FS+": "#22c55e", FS: "#4ade80",
};
const RANK_COLOR: Record<string, string> = { "SSS+": "#d97706", SSS: "#f59e0b", "SS+": "#fbbf24", SS: "#fcd34d", "S+": "#fde68a", S: "#fef3c7" };

export interface PlaylistEntry {
  title: string;
  kind: "ST" | "DX";
  diff: string;
  constant: number;
  level: string;
  comment: string | null;
  record: PlayRecord | undefined;
}

export interface PlaylistSummary { total: number; played: number; sssPlus: number; sss: number; fc: number; ap: number }

export function summarize(entries: PlaylistEntry[]): PlaylistSummary {
  const s: PlaylistSummary = { total: entries.length, played: 0, sssPlus: 0, sss: 0, fc: 0, ap: 0 };
  for (const e of entries) {
    const r = e.record;
    if (!r || !(r.achievementVal > 0)) continue;
    s.played++;
    if (r.achievementVal >= 100.5) s.sssPlus++;
    if (r.achievementVal >= 100) s.sss++;
    if (["FC", "FC+", "AP", "AP+"].includes(r.fc)) s.fc++;
    if (r.fc === "AP" || r.fc === "AP+") s.ap++;
  }
  return s;
}

function markChip(mark: string): El {
  return el("span", { color: MARK_COLOR[mark] ?? MUTED, fontSize: 9, fontWeight: 800, lineHeight: 1, width: 28, display: "flex", justifyContent: "flex-end" }, mark);
}

function row(e: PlaylistEntry, index: number, translate: boolean, last: boolean): El {
  const r = e.record;
  const played = !!r && r.achievementVal > 0;
  const rank = played ? getScoreRank(r!.achievementVal) : "";
  return el("div", { display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: last ? "none" : `1px solid ${BORDER}` }, [
    el("span", { color: FAINT, fontFamily: NUM_FONT, fontSize: 10, width: 22, flexShrink: 0, display: "flex", justifyContent: "flex-end" }, String(index + 1)),
    el("div", { display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 22, borderRadius: 6, background: MAI_DIFF_COLOR[e.diff] ?? SURFACE2, flexShrink: 0 }, [
      el("span", { color: "#fff", fontSize: 11, fontWeight: 800, lineHeight: 1 }, e.constant > 0 ? e.constant.toFixed(1) : e.level),
    ]),
    pill(e.kind, { background: KIND_COLOR[e.kind], color: "#fff", fontSize: 8, padding: "2px 6px" }),
    el("div", { display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: 3 }, [
      el("span", { color: INK, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, displayTitle(e.title, translate)),
      ...(e.comment ? [el("span", { color: MUTED, fontSize: 9, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, e.comment)] : []),
    ]),
    el("div", { display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }, [
      el("span", { color: played ? TEXT : FAINT, fontFamily: NUM_FONT, fontSize: 11, lineHeight: 1, width: 64, display: "flex", justifyContent: "flex-end" }, played ? `${r!.achievementVal.toFixed(4)}%` : msg("playlistCard.notPlayed")),
      el("span", { color: RANK_COLOR[rank] ?? MUTED, fontSize: 10, fontWeight: 800, lineHeight: 1, width: 30, display: "flex", justifyContent: "flex-end" }, rank),
      markChip(played ? r!.fc : ""),
      markChip(played ? r!.sync : ""),
    ]),
  ]);
}

export async function renderPlaylistCard(
  profile: CachedProfile,
  avatarBuf: Buffer | null,
  list: { title: string; owner: string; updatedAt: string },
  entries: PlaylistEntry[],
  translate: boolean,
): Promise<Buffer> {
  const avatarUrl = await avatarDataUrl(profile, avatarBuf);
  const s = summarize(entries);
  const serverLabel = profile.server === "jp" ? "JP" : "INTERNATIONAL";
  const head = userCardHeader(profile, avatarUrl, msg("playlistCard.eyebrow", { server: serverLabel }), msg("playlistCard.summary", { owner: list.owner }));
  const shown = entries.slice(0, LIMIT);
  const updated = Date.parse(list.updatedAt);
  const root = el("div", { display: "flex", flexDirection: "column", width: WIDTH, background: CANVAS, padding: 24, color: TEXT, fontFamily: "Noto Sans JP" }, [
    head,
    statsPanel([
      { value: `${s.played}/${s.total}`, label: msg("playlistCard.played") },
      { value: `${s.sss}`, label: msg("playlistCard.sss") },
      { value: `${s.sssPlus}`, label: msg("playlistCard.sssPlus") },
      { value: `${s.fc}`, label: msg("playlistCard.fc") },
      { value: `${s.ap}`, label: msg("playlistCard.ap") },
    ]),
    panel(list.title, msg("playlistCard.meta", { count: entries.length, updated: Number.isFinite(updated) ? kstStamp(updated).slice(0, 10) : "-" }), [
      el("div", { display: "flex", flexDirection: "column" }, shown.map((e, i) => row(e, i, translate, i === shown.length - 1))),
      ...(entries.length > shown.length ? [el("span", { color: MUTED, fontSize: 10, marginTop: 8 }, msg("playlistCard.more", { count: entries.length - shown.length }))] : []),
    ]),
    el("div", { display: "flex", justifyContent: "space-between", marginTop: 14, color: MUTED, fontSize: 11 }, [
      el("span", {}, msg("playlistCard.source")),
      el("span", {}, msg("card.lastSynced", { time: kstStamp(profile.lastSyncedAt) })),
    ]),
  ]);
  return renderInWorker(root, WIDTH);
}
