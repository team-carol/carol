import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import type { PlayRecord, ChartMarks, MaimaiServer } from "../../scraper";
import { buildMarkMap, buildKindResolver, chartKey } from "../../scraper";
import type { CachedProfile } from "../../storage";
import {
  getSongJacket,
  saveSongJacket,
  getRatingCardCache,
  saveRatingCardCache,
} from "../../storage";
import {
  getConstant,
  levelToNumber,
  calcSongRating,
  getJacketFile,
  isNewSong,
} from "../../constants";
import { loadFonts } from "../../fonts";
import { displayTitle } from "../../aliases";

// ─── Design tokens (ported from mailog) ──────────────────────────────────
const CARD_W = 110;
const CARD_H = 115;
const GAP = 4;
const ACCENT = "#9333ea";
// 카드 레이아웃/계산이 바뀌면 올린다 → 기존 렌더 캐시가 자동 무효화됨
const CARD_VERSION = 7;

const MAI_DIFF_COLOR: Record<string, string> = {
  BASIC: "#16a34a",
  ADVANCED: "#ea580c",
  EXPERT: "#dc2626",
  MASTER: "#9333ea",
  "Re:MASTER": "#c084fc",
};

const MAI_CM_COLOR: Record<string, string> = {
  "SSS+": "#d97706",
  SSS: "#f59e0b",
  "SS+": "#fbbf24",
  SS: "#fbbf24",
  "S+": "#fb923c",
  S: "#fb923c",
  AAA: "#60a5fa",
  AA: "#60a5fa",
  A: "#93c5fd",
  BBB: "#7dd3fc",
  BB: "#bae6fd",
  B: "#e0f2fe",
  C: "#d1d5db",
  D: "#9ca3af",
  "AP+": "#d946ef",
  AP: "#d946ef",
  "FC+": "#3b82f6",
  FC: "#60a5fa",
  "FS+": "#22c55e",
  FS: "#4ade80",
  FSD: "#34d399",
  "FSD+": "#10b981",
};

function scoreRank(ach: number): string {
  if (ach >= 100.5) return "SSS+";
  if (ach >= 100.0) return "SSS";
  if (ach >= 99.5) return "SS+";
  if (ach >= 99.0) return "SS";
  if (ach >= 98.0) return "S+";
  if (ach >= 97.0) return "S";
  if (ach >= 94.0) return "AAA";
  if (ach >= 90.0) return "AA";
  if (ach >= 80.0) return "A";
  if (ach >= 75.0) return "BBB";
  if (ach >= 70.0) return "BB";
  if (ach >= 60.0) return "B";
  if (ach >= 50.0) return "C";
  return "D";
}

// ─── Satori element helper (no JSX) ───────────────────────────────────────
type El = {
  type: string;
  props: { style: Record<string, unknown>; children?: unknown };
};
function el(
  type: string,
  style: Record<string, unknown>,
  children?: unknown,
): El {
  return { type, props: { style, children } };
}

// ─── Per-song view model ──────────────────────────────────────────────────
interface CardVM {
  title: string;
  ach: string;
  rank: string;
  rs: number;
  lv: string;
  diff: string;
  diffColor: string;
  isDx: boolean;
  fc: string;
  jacketFile: string | null;
}

function toVM(r: PlayRecord, markMap?: Map<string, ChartMarks>, server: MaimaiServer = "intl", translate = false): CardVM {
  const constant = getConstant(r.title, r.musicKind, r.diff, server);
  const lvNum = constant !== null ? constant : levelToNumber(r.level);
  // 레이팅 대상 페이지엔 FC/AP·Sync 아이콘이 없어 clear 기록의 마크를 우선 사용
  const marks = markMap?.get(chartKey(r));
  const fc = marks?.fc ?? r.fc;
  const rs = calcSongRating(r.achievementVal, lvNum, fc);
  return {
    title: displayTitle(r.title, translate),
    ach:
      r.achievementVal > 0 ? r.achievementVal.toFixed(4) + "%" : r.achievement,
    rank: scoreRank(r.achievementVal),
    rs,
    lv: constant !== null ? constant.toFixed(1) : r.level,
    diff: r.diff,
    diffColor: MAI_DIFF_COLOR[r.diff] ?? "#888",
    isDx: r.musicKind === "DX",
    fc,
    jacketFile: getJacketFile(r.title),
  };
}

// ─── Jacket prefetch (DB cache → otoge-db) ────────────────────────────────
// 레이팅 대상곡 페이지엔 자켓이 없어 otoge-db의 image_url(파일명)로 받아온다.
async function fetchJacketDataUrl(file: string): Promise<string | null> {
  const key = file.replace(/\.png$/, "");
  let buf = await getSongJacket(key);
  if (!buf) {
    try {
      const res = await fetch(`https://otoge-db.net/maimai/jacket/${file}`);
      if (res.ok) {
        buf = Buffer.from(await res.arrayBuffer());
        await saveSongJacket(key, buf);
      }
    } catch {
      /* ignore */
    }
  }
  return buf ? `data:image/png;base64,${buf.toString("base64")}` : null;
}

// ─── Card component ───────────────────────────────────────────────────────
function jacketCard(vm: CardVM, rank: number, jacketUrl: string | null): El {
  const layers: El[] = [];

  layers.push(
    jacketUrl
      ? (el(
          "img",
          {
            position: "absolute",
            top: 0,
            left: 0,
            width: CARD_W,
            height: CARD_H,
            objectFit: "cover",
          },
          undefined,
        ) as any)
      : el("div", {
          position: "absolute",
          top: 0,
          left: 0,
          width: CARD_W,
          height: CARD_H,
          background: "#1c1c1c",
        }),
  );
  if (jacketUrl) (layers[0] as any).props.src = jacketUrl;

  // gradient overlay
  layers.push(
    el("div", {
      position: "absolute",
      top: 0,
      left: 0,
      width: CARD_W,
      height: CARD_H,
      backgroundImage:
        "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.05) 28%, rgba(0,0,0,0.65) 55%, rgba(0,0,0,0.93) 100%)",
    }),
  );

  // rank badge
  layers.push(
    el(
      "div",
      { position: "absolute", top: 5, left: 6, display: "flex" },
      el(
        "span",
        { fontSize: 8, color: "rgba(255,255,255,0.7)", fontWeight: 600 },
        `#${rank}`,
      ),
    ),
  );

  // bottom info block
  const infoRows: El[] = [];
  infoRows.push(
    el(
      "div",
      { fontSize: 19, fontWeight: 800, color: "#fff", lineHeight: 1 },
      String(vm.rs),
    ),
  );

  infoRows.push(
    el("div", { display: "flex", alignItems: "baseline", width: "100%" }, [
      el(
        "span",
        { fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.9)" },
        vm.lv,
      ),
      el(
        "span",
        {
          fontSize: 8,
          fontWeight: 600,
          color: "rgba(255,255,255,0.78)",
          marginLeft: 4,
        },
        vm.ach,
      ),
      el(
        "span",
        {
          fontSize: 7,
          fontWeight: 800,
          color: vm.isDx ? "#f97316" : "rgba(255,255,255,0.65)",
          marginLeft: "auto",
        },
        vm.isDx ? "DX" : "ST",
      ),
    ]),
  );

  infoRows.push(
    el(
      "div",
      {
        fontSize: 9,
        fontWeight: 600,
        color: "#ddd",
        lineHeight: 1.25,
        width: "100%",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      },
      vm.title,
    ),
  );

  // 하단: 좌측 난이도 · 우측 [콤보마크(AP/FC) + 스코어랭크] (mailog 다운로드 카드와 동일 배치)
  const rightMarks: El[] = [];
  if (vm.fc)
    rightMarks.push(
      el(
        "span",
        {
          fontSize: 7,
          fontWeight: 700,
          color: MAI_CM_COLOR[vm.fc] ?? "rgba(255,255,255,0.65)",
        },
        vm.fc,
      ),
    );
  rightMarks.push(
    el(
      "span",
      {
        fontSize: 7,
        fontWeight: 700,
        color: MAI_CM_COLOR[vm.rank] ?? "rgba(255,255,255,0.65)",
      },
      vm.rank,
    ),
  );
  infoRows.push(
    el(
      "div",
      {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        width: "100%",
      },
      [
        el(
          "span",
          { fontSize: 7, fontWeight: 700, color: vm.diffColor },
          vm.diff,
        ),
        el(
          "div",
          { display: "flex", gap: 3, alignItems: "center" },
          rightMarks,
        ),
      ],
    ),
  );

  layers.push(
    el(
      "div",
      {
        position: "absolute",
        bottom: 0,
        left: 0,
        width: CARD_W,
        display: "flex",
        flexDirection: "column",
        padding: "5px 6px 6px",
      },
      infoRows,
    ),
  );

  return el(
    "div",
    {
      position: "relative",
      display: "flex",
      width: CARD_W,
      height: CARD_H,
      overflow: "hidden",
      border: "1px solid #252525",
      borderTop: `3px solid ${vm.diffColor}`,
    },
    layers,
  );
}

function sectionLabel(label: string, count: number, avg: number): El {
  return el(
    "div",
    {
      display: "flex",
      alignItems: "baseline",
      width: "100%",
      padding: "8px 0 4px",
      borderBottom: "1px solid #202020",
      marginTop: 8,
    },
    [
      el("span", { fontSize: 10, fontWeight: 700, color: "#aaa" }, label),
      el("span", { fontSize: 9, color: "#666", marginLeft: 8 }, `TOP ${count}`),
      el(
        "span",
        { fontSize: 9, color: "#777", marginLeft: "auto" },
        `avg ${avg.toFixed(1)}`,
      ),
    ],
  );
}

function cardGrid(
  vms: CardVM[],
  cols: number,
  startRank: number,
  jackets: Map<string, string>,
): El {
  const width = CARD_W * cols + GAP * (cols - 1);
  const cards = vms.map((vm, i) =>
    jacketCard(
      vm,
      startRank + i,
      vm.jacketFile ? (jackets.get(vm.jacketFile) ?? null) : null,
    ),
  );
  return el(
    "div",
    { display: "flex", flexWrap: "wrap", width, marginTop: 5, gap: GAP },
    cards,
  );
}

function avg(vms: CardVM[]): number {
  if (!vms.length) return 0;
  return vms.reduce((s, v) => s + v.rs, 0) / vms.length;
}

// ─── Public: render rating target card as PNG ─────────────────────────────
export async function renderRatingCard(
  profile: CachedProfile,
  records: PlayRecord[],
  avatarBuf: Buffer | null,
  translate = false,
): Promise<Buffer> {
  // ─── Render cache: return cached PNG if profile and card version unchanged ─
  // 번역 표시본은 뷰어별로 달라 공유 캐시(원제 기준)를 쓰지 않고 매번 새로 렌더한다.
  const cached = translate ? null : await getRatingCardCache(profile.profileKey);
  if (
    cached &&
    cached.syncedAt === profile.lastSyncedAt &&
    cached.version === CARD_VERSION
  ) {
    return cached.blob;
  }

  const fonts = await loadFonts();

  // 레이팅 대상 페이지엔 FC/AP·Sync 마크가 없어 clear 기록에서 마크를 끌어옴
  let clearRecords: PlayRecord[] = [];
  try {
    const parsed = JSON.parse(profile.clearJson || "[]");
    if (Array.isArray(parsed)) clearRecords = parsed;
  } catch {
    /* ignore */
  }
  const markMap = buildMarkMap(clearRecords);
  // 레이팅 대상 페이지의 ST/DX가 부정확할 수 있어 clear 기록으로 보정
  const resolveKind = buildKindResolver(clearRecords);
  const fix = (r: PlayRecord): PlayRecord => ({
    ...r,
    musicKind: resolveKind(r),
  });

  // 국제판: maimai net 파싱 순서(신곡 15 + 구곡 35)를 그대로 신뢰.
  // JP: 전체 기록에서 직접 산출하므로 버전(isNewSong)으로 분류(15/35 미만 오분류 방지).
  const newRecords =
    profile.server === "jp"
      ? records.filter((r) => isNewSong(r.title, "jp")).slice(0, 15)
      : records.slice(0, 15);
  const otherRecords =
    profile.server === "jp"
      ? records.filter((r) => !isNewSong(r.title, "jp")).slice(0, 35)
      : records.slice(15, 50);
  const newVms = newRecords.map((r) => toVM(fix(r), markMap, profile.server, translate));
  const otherVms = otherRecords.map((r) => toVM(fix(r), markMap, profile.server, translate));
  // 헤더에는 프로필에 저장된 실제 레이팅을 표시
  const totalRs =
    profile.rating || newVms.concat(otherVms).reduce((s, v) => s + v.rs, 0);

  // prefetch all jacket images
  const files = [
    ...new Set(
      [...newVms, ...otherVms].flatMap((v) =>
        v.jacketFile ? [v.jacketFile] : [],
      ),
    ),
  ];
  const jackets = new Map<string, string>();
  await Promise.all(
    files.map(async (file) => {
      const url = await fetchJacketDataUrl(file);
      if (url) jackets.set(file, url);
    }),
  );

  const leftCols = 3,
    rightCols = 7;
  const leftWidth = CARD_W * leftCols + GAP * (leftCols - 1);
  const rightWidth = CARD_W * rightCols + GAP * (rightCols - 1);
  // NEW 섹션을 살짝 밝은 패널로 감싸고 두 섹션 사이에 구분선
  const NEW_PAD = 6; // NEW 패널 안쪽 여백 (틴트가 카드 둘레로 보이게)
  const DIV_W = 1; // 섹션 구분선 두께
  const COL_GAP = 12;
  const newPanelWidth = leftWidth + NEW_PAD * 2;
  const bodyWidth = newPanelWidth + COL_GAP + DIV_W + COL_GAP + rightWidth;
  const PAD = 16;
  const totalWidth = bodyWidth + PAD * 2;

  // header
  const avatarUrl = avatarBuf
    ? `data:image/png;base64,${avatarBuf.toString("base64")}`
    : null;
  const profileBlock = el(
    "div",
    { display: "flex", alignItems: "center", gap: 10 },
    [
      avatarUrl
        ? ({
            type: "img",
            props: {
              src: avatarUrl,
              style: { width: 38, height: 38, objectFit: "cover" },
            },
          } as any)
        : el("div", {
            width: 38,
            height: 38,
            background: "#242424",
            display: "flex",
          }),
      el("div", { display: "flex", flexDirection: "column" }, [
        ...(profile.trophy
          ? [
              el(
                "span",
                { fontSize: 8, color: "#888", marginBottom: 1 },
                profile.trophy,
              ),
            ]
          : []),
        el(
          "span",
          { fontSize: 12, fontWeight: 700, color: "#fff" },
          profile.playerName || "—",
        ),
      ]),
    ],
  );

  const wordmark = el("div", { display: "flex", alignItems: "baseline" }, [
    el(
      "span",
      { fontSize: 13, fontWeight: 700, color: "#888", marginRight: 6 },
      "Created by",
    ),
    el("span", { fontSize: 13, fontWeight: 800, color: "#fff" }, "carol"),
    el("span", { fontSize: 13, fontWeight: 800, color: ACCENT }, "bot"),
  ]);

  const ratingBlock = el(
    "div",
    { display: "flex", flexDirection: "column", alignItems: "flex-end" },
    [
      el("span", { fontSize: 8, color: "#777" }, "RATING"),
      el(
        "span",
        { fontSize: 20, fontWeight: 800, color: ACCENT, lineHeight: 1.1 },
        String(totalRs),
      ),
    ],
  );

  // 3등분 컬럼: 가운데 칸이 이미지 정중앙에 고정되도록 각 칸 flex:1
  const header = el(
    "div",
    {
      display: "flex",
      alignItems: "center",
      width: bodyWidth,
      paddingBottom: 10,
      borderBottom: "1px solid #1e1e1e",
    },
    [
      el(
        "div",
        { display: "flex", flex: 1, justifyContent: "flex-start" },
        profileBlock,
      ),
      el(
        "div",
        { display: "flex", flex: 1, justifyContent: "center" },
        wordmark,
      ),
      el(
        "div",
        { display: "flex", flex: 1, justifyContent: "flex-end" },
        ratingBlock,
      ),
    ],
  );

  const body = el(
    "div",
    { display: "flex", marginTop: 10, gap: COL_GAP, alignItems: "flex-start" },
    [
      // NEW: 살짝 밝은 배경 패널
      el(
        "div",
        {
          display: "flex",
          flexDirection: "column",
          width: newPanelWidth,
          padding: NEW_PAD,
          background: "rgba(255,255,255,0.06)",
          borderRadius: 6,
        },
        [
          sectionLabel("NEW", newVms.length, avg(newVms)),
          cardGrid(newVms, leftCols, 1, jackets),
        ],
      ),
      // 섹션 구분선
      el("div", {
        width: DIV_W,
        alignSelf: "stretch",
        background: "rgba(255,255,255,0.12)",
      }),
      el(
        "div",
        {
          display: "flex",
          flexDirection: "column",
          width: rightWidth,
          // NEW 패널의 상하 패딩만큼 맞춰 섹션 라벨/카드 높이를 정렬 (가로 패딩은 없음 → 폭 유지)
          paddingTop: NEW_PAD,
          paddingBottom: NEW_PAD,
        },
        [
          sectionLabel("OTHERS", otherVms.length, avg(otherVms)),
          cardGrid(otherVms, rightCols, 1, jackets),
        ],
      ),
    ],
  );

  const root = el(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      background: "#0d0d0d",
      padding: PAD,
    },
    [header, body],
  );

  const svg = await satori(root as any, {
    width: totalWidth,
    fonts: fonts as any,
  });
  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: totalWidth * 2 },
  })
    .render()
    .asPng();
  const buf = Buffer.from(png);

  // ─── Persist render cache ─────────────────────────────────────────────────
  // 번역본은 공유 캐시(원제 기준)를 덮어쓰지 않는다.
  if (!translate) {
    await saveRatingCardCache(
      profile.profileKey,
      buf,
      profile.lastSyncedAt,
      CARD_VERSION,
    );
  }

  return buf;
}
