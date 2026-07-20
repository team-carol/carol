import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import type { CachedProfile } from "../../storage/types";
import type { PlayRecord } from "../../scraper";
import { getConstant } from "../../constants";
import { loadFonts } from "../../fonts";
import { displayTitle } from "../../aliases";

const ACCENT = "#9333ea";
const SURFACE = "#1a1a1a";
const BORDER = "#252525";
const TEXT = "#cccccc";
const MUTED = "#888888";
const CANVAS = "#0d0d0d";
const HEADER_HEIGHT = 160;
const RECORD_ROW_HEIGHT = 92;
const ROW_GAP = 8;
const EMPTY_BODY_HEIGHT = 230;

const DIFF_COLOR: Record<string, string> = {
  BASIC: "#16a34a",
  ADVANCED: "#ea580c",
  EXPERT: "#dc2626",
  MASTER: "#9333ea",
  "Re:MASTER": "#c084fc",
};

const MARK_COLOR: Record<string, string> = {
  "AP+": "#d946ef",
  AP: "#d946ef",
  "FC+": "#3b82f6",
  FC: "#60a5fa",
  "FSD+": "#10b981",
  FSD: "#34d399",
  "FS+": "#22c55e",
  FS: "#4ade80",
};

const jacketCache = new Map<string, string | null>();

type El = {
  type: string;
  props: {
    style: Record<string, unknown>;
    children?: unknown;
    src?: string;
  };
};

function el(type: string, style: Record<string, unknown>, children?: unknown): El {
  return { type, props: { style, children } };
}

function image(src: string, style: Record<string, unknown>): El {
  return { type: "img", props: { src, style } };
}

async function jacketDataUrl(jacketUrl: string): Promise<string | null> {
  const cached = jacketCache.get(jacketUrl);
  if (cached !== undefined) return cached;
  if (!jacketUrl) return null;
  if (jacketUrl.startsWith("data:")) {
    jacketCache.set(jacketUrl, jacketUrl);
    return jacketUrl;
  }
  try {
    const res = await fetch(jacketUrl);
    if (!res.ok) {
      jacketCache.set(jacketUrl, null);
      return null;
    }
    const data = `data:${res.headers.get("content-type") || "image/png"};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
    jacketCache.set(jacketUrl, data);
    return data;
  } catch {
    jacketCache.set(jacketUrl, null);
    return null;
  }
}

function stat(label: string, value: string, color = "#ffffff"): El {
  return el("div", { display: "flex", flexDirection: "column", gap: 2 }, [
    el("span", { color: MUTED, fontSize: 9, fontWeight: 700 }, label),
    el("span", { color, fontSize: 20, fontWeight: 800, lineHeight: 1 }, value),
  ]);
}

// Keep this renderer tolerant of summaries from older and newer backends.
type AchievementRecord = PlayRecord & {
  rating?: number;
  ratingGain?: number;
  levelConstant?: number;
  constant?: number;
  beforeAchievement?: number;
  afterAchievement?: number;
  achievementBefore?: number;
  achievementAfter?: number;
};

function details(record: PlayRecord): AchievementRecord {
  return record as AchievementRecord;
}

function chartConstant(record: PlayRecord, profile: CachedProfile): number | null {
  const supplied = details(record).levelConstant ?? details(record).constant;
  if (typeof supplied === "number" && Number.isFinite(supplied)) return supplied;
  const constant = getConstant(record.title, record.musicKind, record.diff, profile.server);
  if (constant !== null) return constant;
  const parsed = Number.parseFloat(record.level);
  return Number.isFinite(parsed) ? parsed : null;
}

function ratingGain(record: PlayRecord): number | null {
  const value = details(record).ratingGain ?? record.ratingUp;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function achievementAfter(record: PlayRecord): number {
  const value = details(record).afterAchievement ?? details(record).achievementAfter;
  return typeof value === "number" && Number.isFinite(value) ? value : record.achievementVal;
}

function achievementBefore(record: PlayRecord): number | null {
  const value = details(record).beforeAchievement ?? details(record).achievementBefore;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function recordRow(record: PlayRecord, rank: number, profile: CachedProfile, jacket: string | null, playDay: string, translate = false): El {
  const diffColor = DIFF_COLOR[record.diff] ?? MUTED;
  const marks = [record.fc, record.sync].filter((mark) => mark.length > 0);
  const gain = ratingGain(record);
  const ratingLabel = gain !== null ? `rating +${gain.toFixed(2)}` : typeof details(record).rating === "number" ? `rating ${details(record).rating!.toFixed(2)}` : "rating —";
  const constant = chartConstant(record, profile);
  const constantLabel = constant !== null ? constant.toFixed(1) : record.level;
  const before = achievementBefore(record);
  const achievementLabel = before !== null ? `${before.toFixed(4)}% → ${achievementAfter(record).toFixed(4)}%` : `${achievementAfter(record).toFixed(4)}%`;
  return el(
    "div",
    {
      display: "flex",
      alignItems: "stretch",
      gap: 12,
      background: SURFACE,
      border: `1px solid ${BORDER}`,
      borderRadius: 2,
      padding: 0,
      minHeight: RECORD_ROW_HEIGHT,
      width: "100%",
      overflow: "hidden",
    },
    [
      el("div", { width: 6, alignSelf: "stretch", background: diffColor, flexShrink: 0 }),
      jacket
        ? image(jacket, {
            width: 64,
            height: 64,
            objectFit: "cover",
            alignSelf: "center",
            marginLeft: 8,
            borderRadius: 4,
            flexShrink: 0,
          })
        : el("div", {
            width: 64,
            height: 64,
            alignSelf: "center",
            marginLeft: 8,
            background: "#151515",
            border: `1px solid ${BORDER}`,
            borderRadius: 4,
            flexShrink: 0,
          }),
      el(
        "div",
        {
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          flex: 1,
          minWidth: 0,
          padding: "9px 12px 9px 0",
        },
        [
          el("div", { display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }, [
            el("span", { color: "#fff", fontSize: 15, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }, displayTitle(record.title, translate)),
            el("span", { color: MUTED, fontSize: 9, fontWeight: 700, flexShrink: 0 }, `#${rank}`),
          ]),
          el("span", { color: TEXT, fontSize: 10, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, `${record.diff} ${constantLabel} · ${record.musicKind || "?"} · ${record.date || playDay}`),
          el("div", { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 8 }, [
            el("div", { display: "flex", alignItems: "baseline", gap: 8 }, [
              el("span", { color: "#fff", fontSize: 15, fontWeight: 700, lineHeight: 1 }, achievementLabel),
            ]),
            el("div", { display: "flex", alignItems: "baseline", gap: 8 }, [
              el("span", { color: ACCENT, fontSize: 14, fontWeight: 800 }, ratingLabel),
              el("div", { display: "flex", gap: 4, width: 76, justifyContent: "flex-end" }, marks.map((mark) =>
                el("span", { color: MARK_COLOR[mark] ?? "rgba(255,255,255,0.7)", fontSize: 10, fontWeight: 800 }, mark),
              )),
            ]),
          ]),
        ],
      ),
    ],
  );
}

function emptyState(): El {
  return el(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: 170,
      background: SURFACE,
      border: `1px solid ${BORDER}`,
      borderRadius: 14,
      color: TEXT,
      gap: 8,
    },
    [
      el("span", { color: "#fff", fontSize: 18, fontWeight: 800 }, "오늘의 의미 있는 성과가 없습니다"),
      el("span", { color: MUTED, fontSize: 11 }, "한국시간 오전 4시부터 다음 오전 4시까지의 성과입니다"),
    ],
  );
}

function wordmark(): El {
  return el("div", { display: "flex", alignItems: "baseline" }, [
    el("span", { fontSize: 13, fontWeight: 700, color: MUTED, marginRight: 6 }, "Created by"),
    el("span", { fontSize: 13, fontWeight: 800, color: "#fff" }, "carol"),
    el("span", { fontSize: 13, fontWeight: 800, color: ACCENT }, "bot"),
  ]);
}

export async function renderAchievementCard(
  profile: CachedProfile,
  records: readonly PlayRecord[],
  playDay: string,
  avatarBuf: Buffer | null,
  translate = false,
): Promise<Buffer> {
  const fonts = await loadFonts();
  const topRecords = records.slice().sort((a, b) => {
    const aScore = (chartConstant(a, profile) ?? 0) + achievementAfter(a) / 100;
    const bScore = (chartConstant(b, profile) ?? 0) + achievementAfter(b) / 100;
    return bScore - aScore || (ratingGain(b) ?? 0) - (ratingGain(a) ?? 0) || (b.playedAt ?? 0) - (a.playedAt ?? 0);
  });
  const avatarUrl = avatarBuf ? `data:image/png;base64,${avatarBuf.toString("base64")}` : "";
  const jacketUrls = new Map<string, string | null>();
  await Promise.all(
    topRecords.map(async (record) => {
      if (!record.jacketUrl || jacketUrls.has(record.jacketUrl)) return;
      jacketUrls.set(record.jacketUrl, await jacketDataUrl(record.jacketUrl));
    }),
  );
  const width = 920;
  const root = el(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      width,
      background: CANVAS,
      padding: 24,
      color: TEXT,
      fontFamily: "Noto Sans JP",
    },
    [
      el("div", { display: "flex", alignItems: "center", paddingBottom: 16, borderBottom: "1px solid #1e1e1e" }, [
        avatarUrl
          ? image(avatarUrl, { width: 44, height: 44, objectFit: "cover", marginRight: 12 })
          : el("div", { width: 44, height: 44, background: "#242424", marginRight: 12 }),
        el("div", { display: "flex", flexDirection: "column", flex: 1 }, [
          el("span", { color: MUTED, fontSize: 10, fontWeight: 700 }, "DAILY ACHIEVEMENTS"),
          el("span", { color: "#fff", fontSize: 18, fontWeight: 800 }, profile.playerName || "—"),
        ]),
        wordmark(),
      ]),
      el("div", { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18 }, [
        el("div", { display: "flex", flexDirection: "column", gap: 4 }, [
          el("span", { color: "#fff", fontSize: 28, fontWeight: 800, lineHeight: 1 }, "오늘의 성과"),
          el("span", { color: MUTED, fontSize: 11 }, `${playDay} · 한국시간 오전 4시 기준`),
        ]),
        el("div", { display: "flex", gap: 26 }, [
          stat("COUNT", String(topRecords.length), ACCENT),
          stat("RATING GAIN", `+${topRecords.reduce((sum, record) => sum + Math.max(0, ratingGain(record) ?? 0), 0).toFixed(0)}`, ACCENT),
        ]),
      ]),
      el(
        "div",
        {
          display: "flex",
          flexDirection: "column",
          gap: ROW_GAP,
          marginTop: 18,
        },
        topRecords.length > 0
          ? topRecords.map((record, index) =>
              recordRow(record, index + 1, profile, jacketUrls.get(record.jacketUrl) ?? null, playDay, translate),
            )
          : emptyState(),
      ),
    ],
  );

  const bodyHeight = topRecords.length > 0
    ? topRecords.length * RECORD_ROW_HEIGHT + Math.max(0, topRecords.length - 1) * ROW_GAP + 16
    : EMPTY_BODY_HEIGHT;
  const height = HEADER_HEIGHT + bodyHeight + 8;
  const svg = await satori(root, { width, height, fonts });
  return Buffer.from(new Resvg(svg, { fitTo: { mode: "width", value: width * 2 } }).render().asPng());
}
