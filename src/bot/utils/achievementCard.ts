import { BRAND } from "../../brand";
import { renderInWorker } from "./renderPool";
import type { CachedProfile } from "../../storage/types";
import type { PlayRecord } from "../../scraper";
import { getConstant } from "../../constants";
import { displayTitle } from "../../aliases";
import { getScoreRank, MAI_CM_COLOR } from "../../games";

// 색은 랜딩과 같은 src/brand.ts 팔레트. 난이도·FC/AP 색은 게임 고유라 아래에 따로 둔다.
const ACCENT = BRAND.accent;
const SURFACE = BRAND.surface;
const BORDER = BRAND.border;
const TEXT = BRAND.inkSoft;
const MUTED = BRAND.dim;
const CANVAS = BRAND.canvas;
const INK = BRAND.ink;
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
  // 스크래퍼는 FDX/FDX+ 로 준다. FSD 는 예전 키라 호환용으로 남긴다.
  "FDX+": "#10b981",
  FDX: "#34d399",
  "FSD+": "#10b981",
  FSD: "#34d399",
  "FS+": "#22c55e",
  FS: "#4ade80",
};

const jacketCache = new Map<string, string | null>();

// 성과 카드 렌더 결과 캐시. /성과 는 한 번에 최대 10장을 그리고, 같은 유저가
// 반복 호출하거나 다른 사람이 조회할 때마다 satori+resvg 전체를 다시 돌린다.
// (유저·날짜·마지막 동기화 시각·번역여부·페이지) 키로 PNG 를 재사용한다.
// lastSyncedAt 이 키에 들어가므로 새 동기화 후에는 자연스럽게 무효화된다.
const ACH_CARD_VERSION = 7;
const ACH_CARD_CACHE_MAX = 48;
const achCardCache = new Map<string, Buffer>();

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

function stat(label: string, value: string, color: string = INK): El {
  return el("div", { display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }, [
    el("span", { color, fontSize: 24, fontWeight: 700, lineHeight: 1 }, value),
    el("span", { color: MUTED, fontSize: 10 }, label),
  ]);
}

// 랜딩의 칩(rounded-3xl bg-surface-2) 모양.
function pill(text: string, style: Record<string, unknown>): El {
  return el("span", { fontSize: 10, fontWeight: 700, borderRadius: 99, padding: "3px 9px", lineHeight: 1.2, flexShrink: 0, ...style }, text);
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

// 레이팅 상승은 DX NET 상세 페이지의 (+N) 파싱값만 신뢰한다. 예전엔 파싱값이 없으면
// 달성률 기반 추정치로 메웠지만, 이전 기록이 없는 채보에서 곡 레이팅 전체(+300 등)가
// 상승분으로 잡히는 오류가 있었다. 파싱값이 없으면 "알 수 없음"(null)으로 둔다.
function ratingGain(record: PlayRecord): number | null {
  if (typeof record.ratingUp !== "number" || !Number.isFinite(record.ratingUp)) return null;
  const value = details(record).ratingGain;
  return typeof value === "number" && Number.isFinite(value) ? value : record.ratingUp;
}

function achievementAfter(record: PlayRecord): number {
  const value = details(record).afterAchievement ?? details(record).achievementAfter;
  return typeof value === "number" && Number.isFinite(value) ? value : record.achievementVal;
}

function achievementBefore(record: PlayRecord): number | null {
  const value = details(record).beforeAchievement ?? details(record).achievementBefore;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function recordRow(record: PlayRecord, rankNo: number, profile: CachedProfile, jacket: string | null, playDay: string, translate = false): El {
  const diffColor = DIFF_COLOR[record.diff] ?? MUTED;
  const marks = [record.fc, record.sync].filter((mark) => mark.length > 0);
  const gain = ratingGain(record);
  // 마이마이 레이팅은 정수 단위라 소수점을 붙이지 않는다.
  const ratingLabel = gain !== null ? `rating +${Math.round(gain)}` : typeof details(record).rating === "number" ? `rating ${Math.round(details(record).rating!)}` : "rating —";
  const constant = chartConstant(record, profile);
  const constantLabel = constant !== null ? constant.toFixed(1) : record.level;
  const before = achievementBefore(record);
  const after = achievementAfter(record);
  const achievementLabel = before !== null ? `${after.toFixed(4)}%(+${Math.max(0, after - before).toFixed(4)}%)` : `${after.toFixed(4)}%`;
  const rank = getScoreRank(after);
  const isAP = record.fc === "AP" || record.fc === "AP+";
  const markColor = (mark: string) => MARK_COLOR[mark] ?? MAI_CM_COLOR[mark] ?? "rgba(255,255,255,0.7)";
  return el(
    "div",
    {
      display: "flex",
      alignItems: "center",
      gap: 14,
      background: SURFACE,
      // AP/AP+ 는 AP 색으로 테두리와 은은한 빛을 준다.
      border: isAP ? "1px solid rgba(217,70,239,0.6)" : `1px solid ${BORDER}`,
      ...(isAP
        ? {
            boxShadow: "0 0 14px rgba(217,70,239,0.35)",
            backgroundImage: "linear-gradient(90deg, rgba(217,70,239,0.10) 0%, rgba(217,70,239,0.02) 60%, rgba(217,70,239,0.10) 100%)",
          }
        : {}),
      borderRadius: 16,
      padding: "0 18px 0 13px",
      height: RECORD_ROW_HEIGHT,
      width: "100%",
    },
    [
      jacket
        ? image(jacket, { width: 66, height: 66, objectFit: "cover", borderRadius: 10, flexShrink: 0 })
        : el("div", { width: 66, height: 66, background: BRAND.canvasAlt, border: `1px solid ${BORDER}`, borderRadius: 10, flexShrink: 0 }),
      // 왼쪽 섹션: 곡 정보
      el(
        "div",
        { display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, minWidth: 0 },
        [
          el("div", { display: "flex", alignItems: "center", gap: 8, minWidth: 0 }, [
            pill(`#${rankNo}`, { color: BRAND.ink2, background: BRAND.surface2, fontSize: 9 }),
            el("span", { color: INK, fontSize: 15, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }, displayTitle(record.title, translate)),
          ]),
          el("div", { display: "flex", alignItems: "center", gap: 7, marginTop: 5, minWidth: 0 }, [
            pill(`${record.diff} ${constantLabel}`, { color: "#fff", background: diffColor, fontSize: 9, padding: "2px 8px" }),
            el("span", { color: MUTED, fontSize: 10, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, `${record.musicKind || "?"} · ${record.date || playDay}`),
          ]),
          el("span", { color: INK, fontSize: 15, fontWeight: 700, lineHeight: 1, marginTop: 9 }, achievementLabel),
        ],
      ),
      // 왼쪽 섹션의 오른쪽: 스코어 랭크 + 플레이 마크를 크게
      el("div", { display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "center", gap: 9, flexShrink: 0 }, [
        el("span", { color: MAI_CM_COLOR[rank] ?? INK, fontSize: 26, fontWeight: 700, lineHeight: 1 }, rank),
        ...(marks.length > 0
          ? [el("div", { display: "flex", gap: 7 }, marks.map((mark) =>
              el("span", { color: markColor(mark), fontSize: 14, fontWeight: 700, lineHeight: 1 }, mark),
            ))]
          : []),
      ]),
      el("div", { width: 1, height: 58, background: BORDER, flexShrink: 0 }),
      // 오른쪽 섹션: 레이팅 변화 (오른쪽 끝 정렬)
      el("div", { display: "flex", justifyContent: "flex-end", alignItems: "center", width: 92, flexShrink: 0 }, [
        pill(ratingLabel, { color: BRAND.accentSoft, background: "rgba(255,146,148,0.14)", fontSize: 11 }),
      ]),
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
      borderRadius: 16,
      color: TEXT,
      gap: 8,
    },
    [
      el("span", { color: INK, fontSize: 18, fontWeight: 800 }, "오늘의 의미 있는 성과가 없습니다"),
      el("span", { color: MUTED, fontSize: 11 }, "한국시간 오전 4시부터 다음 오전 4시까지의 성과입니다"),
    ],
  );
}

function wordmark(): El {
  return el("div", { display: "flex", alignItems: "baseline" }, [
    el("span", { fontSize: 13, fontWeight: 700, color: MUTED, marginRight: 6 }, "Created by"),
    el("span", { fontSize: 13, fontWeight: 800, color: INK }, "carol"),
    el("span", { fontSize: 13, fontWeight: 800, color: ACCENT }, "bot"),
  ]);
}

export async function renderAchievementCard(
  profile: CachedProfile,
  records: readonly PlayRecord[],
  playDay: string,
  avatarBuf: Buffer | null,
  translate = false,
  pageIndex = 0,
  pageSize = 5,
): Promise<Buffer> {
  const sortedRecords = records.slice().sort((a, b) => {
    const aScore = (chartConstant(a, profile) ?? 0) + achievementAfter(a) / 100;
    const bScore = (chartConstant(b, profile) ?? 0) + achievementAfter(b) / 100;
    return bScore - aScore || (ratingGain(b) ?? 0) - (ratingGain(a) ?? 0) || (b.playedAt ?? 0) - (a.playedAt ?? 0);
  });
  const totalPages = Math.max(1, Math.ceil(sortedRecords.length / pageSize));
  const clampedPage = Math.min(Math.max(0, pageIndex), totalPages - 1);
  const rankOffset = clampedPage * pageSize;
  const topRecords = sortedRecords.slice(rankOffset, rankOffset + pageSize);

  const cacheKey = [
    profile.profileKey, playDay, profile.lastSyncedAt, translate ? 1 : 0,
    clampedPage, pageSize, sortedRecords.length, avatarBuf?.length ?? 0, ACH_CARD_VERSION,
  ].join("|");
  const memo = achCardCache.get(cacheKey);
  if (memo) return memo;

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
      el("div", { display: "flex", alignItems: "center", paddingBottom: 16, borderBottom: `1px solid ${BORDER}` }, [
        avatarUrl
          ? image(avatarUrl, { width: 44, height: 44, objectFit: "cover", marginRight: 12, borderRadius: 12 })
          : el("div", { width: 44, height: 44, background: BRAND.surface2, marginRight: 12, borderRadius: 12 }),
        el("div", { display: "flex", flexDirection: "column", flex: 1 }, [
          el("span", { color: MUTED, fontSize: 10, fontWeight: 700 }, "DAILY ACHIEVEMENTS"),
          el("span", { color: INK, fontSize: 18, fontWeight: 800 }, profile.playerName || "—"),
        ]),
        wordmark(),
      ]),
      el("div", { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18 }, [
        el("div", { display: "flex", flexDirection: "column", gap: 4 }, [
          el("span", { color: INK, fontSize: 28, fontWeight: 700, lineHeight: 1 }, "오늘의 성과"),
          el("span", { color: MUTED, fontSize: 11 }, `${playDay} · 한국시간 오전 4시 기준${totalPages > 1 ? ` · ${clampedPage + 1}/${totalPages}페이지` : ""}`),
        ]),
        el("div", { display: "flex", gap: 30 }, [
          stat("COUNT", String(sortedRecords.length), ACCENT),
          stat("RATING GAIN", `+${sortedRecords.reduce((sum, record) => sum + Math.max(0, ratingGain(record) ?? 0), 0).toFixed(0)}`, ACCENT),
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
              recordRow(record, rankOffset + index + 1, profile, jacketUrls.get(record.jacketUrl) ?? null, playDay, translate),
            )
          : emptyState(),
      ),
    ],
  );

  const bodyHeight = topRecords.length > 0
    ? topRecords.length * RECORD_ROW_HEIGHT + Math.max(0, topRecords.length - 1) * ROW_GAP + 16
    : EMPTY_BODY_HEIGHT;
  const height = HEADER_HEIGHT + bodyHeight + 8;
  const png = await renderInWorker(root, width, height);
  if (achCardCache.size >= ACH_CARD_CACHE_MAX) {
    const oldest = achCardCache.keys().next().value;
    if (oldest !== undefined) achCardCache.delete(oldest);
  }
  achCardCache.set(cacheKey, png);
  return png;
}
