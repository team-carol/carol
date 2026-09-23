import { RATING_ROLES } from "./roles";
import { BRAND } from "../../brand";
import { renderInWorker } from "./renderPool";
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
  getSongVersion,
} from "../../constants";
import { displayTitle } from "../../aliases";
import type { GameId } from "../../games";
import {
  GAMES,
  convertScore,
  convertDiff,
  buildDisplayMarks,
  getDisplayLv,
  recordMarks,
  GAME_CM_COLOR,
  GAME_DIFF_COLOR,
  MAI_DIFF_COLOR,
  RS_DEFAULT_COLOR,
  RS_DOUBLE_COLOR,
} from "../../games";

// ─── Design tokens (ported from mailog, colors from src/brand.ts) ──────────────────────────────────
const CARD_W = 110;
const CARD_H = 115;
const GAP = 5;
const TILE_R = 10; // 자켓 타일 모서리 (랜딩 카드처럼 둥글게)
const PANEL_R = 16; // 섹션 패널 모서리 (랜딩 rounded-2xl)
const ACCENT = BRAND.accent;
// 카드 레이아웃/계산이 바뀌면 올린다 → 기존 렌더 캐시가 자동 무효화됨
const CARD_VERSION = 17;

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
  rs: number;
  rsText: string;
  rsColor: string;
  lv: string;
  diff: string;
  diffColor: string;
  isDx: boolean;
  showKind: boolean;
  mark: string;
  clearMark: string;
  jacketFile: string | null;
}

const MAI_COMBO_MARKS = ["AP+", "AP", "FC+", "FC"];

function toVM(
  r: PlayRecord,
  markMap?: Map<string, ChartMarks>,
  server: MaimaiServer = "intl",
  translate = false,
  game: GameId = "maimai",
): CardVM {
  const constant = getConstant(r.title, r.musicKind, r.diff, server);
  const lvNum = constant !== null ? constant : levelToNumber(r.level);
  // 레이팅 대상 페이지엔 FC/AP·Sync 아이콘이 없어 clear 기록의 마크를 우선 사용
  const marks = markMap?.get(chartKey(r));
  const fc = marks?.fc ?? r.fc;
  const sync = marks?.sync ?? r.sync;
  const markList = recordMarks(fc, sync);
  const ach = r.achievementVal;

  // maimai는 캐롤봇 기존 계산식을, 나머지는 mai-log 원본 공식을 쓴다.
  const cfg = GAMES[game];
  const rs =
    game === "maimai"
      ? calcSongRating(ach, lvNum, fc)
      : cfg.calcRS(ach, lvNum, markList, r.title);

  const allMarks = buildDisplayMarks(ach, markList, game);
  const clearMark =
    game === "maimai"
      ? (allMarks.find((m) => MAI_COMBO_MARKS.includes(m)) ?? "")
      : (allMarks[1] ?? "");

  const version = getSongVersion(r.title) ?? undefined;
  const diffLabel = game === "maimai" ? r.diff : convertDiff(game, r.diff, version);
  const diffColor =
    game === "maimai"
      ? (MAI_DIFF_COLOR[r.diff] ?? "#888")
      : (GAME_DIFF_COLOR[game][diffLabel] ?? "#888");

  return {
    title: displayTitle(r.title, translate),
    ach:
      game === "maimai"
        ? ach > 0
          ? ach.toFixed(4) + "%"
          : r.achievement
        : convertScore(ach, game, markList),
    rs,
    rsText: game === "maimai" ? String(rs) : cfg.formatRS(rs),
    rsColor: RS_DEFAULT_COLOR,
    lv:
      game === "maimai"
        ? constant !== null
          ? constant.toFixed(1)
          : r.level
        : getDisplayLv(lvNum, game, r.title).toFixed(1),
    diff: diffLabel,
    diffColor,
    isDx: r.musicKind === "DX",
    showKind: game === "maimai",
    mark: allMarks[0] ?? "",
    clearMark,
    jacketFile: getJacketFile(r.title),
  };
}

// ─── Jacket prefetch (in-memory → DB cache → otoge-db) ────────────────────
// 레이팅 대상곡 페이지엔 자켓이 없어 otoge-db의 image_url(파일명)로 받아온다.
// 자켓은 곡 단위라 프로필마다 겹치는 게 대부분이다. 매 렌더마다 DB 조회 + base64
// 인코딩을 반복하지 않도록 파일명 → data URL(또는 null) 결과를 프로세스 메모리에
// 캐시한다. 곡 수만큼(수천 개)만 늘어나고 갱신될 일이 없어 상한은 두지 않는다.
const jacketDataUrlCache = new Map<string, string | null>();
async function fetchJacketDataUrl(file: string): Promise<string | null> {
  const memo = jacketDataUrlCache.get(file);
  if (memo !== undefined) return memo;
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
  const dataUrl = buf ? `data:image/png;base64,${buf.toString("base64")}` : null;
  jacketDataUrlCache.set(file, dataUrl);
  return dataUrl;
}

// ─── Card component ───────────────────────────────────────────────────────
function jacketCard(
  vm: CardVM,
  rank: number,
  jacketUrl: string | null,
  cmColor: Record<string, string>,
): El {
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
            borderRadius: TILE_R,
          },
          undefined,
        ) as any)
      : el("div", {
          position: "absolute",
          top: 0,
          left: 0,
          width: CARD_W,
          height: CARD_H,
          background: BRAND.surface,
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
      {
        position: "absolute",
        top: 5,
        left: 5,
        display: "flex",
        padding: "1px 6px",
        borderRadius: 99,
        background: "rgba(0,0,0,0.5)",
      },
      el(
        "span",
        { fontSize: 7.5, color: "rgba(255,255,255,0.85)", fontWeight: 700 },
        `#${rank}`,
      ),
    ),
  );

  // bottom info block
  const infoRows: El[] = [];
  // 자릿수가 많으면(예: Arcaea의 소수 3자리) 카드 폭에 맞게 살짝 줄인다.
  const rsFontSize = vm.rsText.length >= 6 ? 17 : 19;
  // 스코어 랭크(SSS+ 등)는 하단 구석에서 잘 안 보여 레이팅 숫자 옆에 크게 붙인다.
  infoRows.push(
    el("div", { display: "flex", alignItems: "baseline", width: "100%" }, [
      el(
        "span",
        {
          fontSize: rsFontSize,
          fontWeight: 800,
          color: vm.rsColor,
          lineHeight: 1,
          textShadow: "0 1px 2px rgba(0,0,0,0.95), 0 0 4px rgba(0,0,0,0.8)",
        },
        vm.rsText,
      ),
      ...(vm.mark
        ? [
            el(
              "span",
              {
                fontSize: 12,
                fontWeight: 800,
                color: cmColor[vm.mark] ?? "rgba(255,255,255,0.75)",
                marginLeft: 5,
                lineHeight: 1,
                // 밝은 자켓 위에서도 읽히도록 어두운 그림자로 분리한다.
                textShadow: "0 1px 2px rgba(0,0,0,0.95), 0 0 4px rgba(0,0,0,0.8)",
              },
              vm.mark,
            ),
          ]
        : []),
    ]),
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
      ...(vm.showKind
        ? [
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
          ]
        : []),
    ]),
  );

  infoRows.push(
    el(
      "div",
      {
        fontSize: 9,
        fontWeight: 600,
        color: BRAND.ink2,
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
  if (vm.clearMark)
    rightMarks.push(
      el(
        "span",
        {
          fontSize: 7,
          fontWeight: 700,
          color: cmColor[vm.clearMark] ?? "rgba(255,255,255,0.55)",
        },
        vm.clearMark,
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
        marginTop: 4,
      },
      [
        el(
          "span",
          {
            fontSize: 6.5,
            fontWeight: 700,
            color: "#fff",
            background: vm.diffColor,
            borderRadius: 99,
            padding: "1px 5px",
            lineHeight: 1.2,
          },
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
        padding: "5px 7px 7px",
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
      borderRadius: TILE_R,
      border: `1px solid ${BRAND.border}`,
      background: BRAND.surface2,
    },
    layers,
  );
}

// ─── Rating plate (mai-log Figma: RatingSection, 197:1971) ────────────────
// 게임 속 레이팅 플레이트처럼 5칸 숫자 + 별 4개. 티어별로 테두리 색이 바뀐다.
// Figma 원본에서 숫자 칸 사이 세로선(#4f4a4a)과 아래쪽 가로 빛(#828282 띠)은
// 뺐다(HyperRainbow 273:2 기준). 크기는 원본 202×56 에 PLATE_S 를 곱한다.
const PLATE_S = 0.62;
const PLATE_H = "linear-gradient(90deg, "; // Figma 그라디언트는 거의 수평(좌→우)
const PLATE_TIERS: { min: number; fill: string }[] = [
  { min: 16000, fill: PLATE_H + "#cd19ff 0%, #9676ff 20%, #b0d2ff 46%, #c0ff89 75%, #e06880 100%)" }, // HyperRainbow
  { min: 15000, fill: PLATE_H + "#b6daff 0%, #f4ff78 29%, #ffc0c0 54%, #c0ff89 77%)" }, // Rainbow
  { min: 14500, fill: PLATE_H + "#fffa8a 0%, #fffedf 40%, #fff9b8 100%)" }, // Platinum
  { min: 14000, fill: PLATE_H + "#feed07 0%, #fffedf 40%, #edd620 100%)" }, // Gold
  { min: 13000, fill: PLATE_H + "#6898bb 30%, #c5eef7 100%)" }, // Silver
  { min: 12000, fill: PLATE_H + "#ba5b43 30%, #f7a573 100%)" }, // Bronze
  { min: 10000, fill: "#e071e1" }, // Purple
  { min: 7000, fill: "#ef7476" }, // Red
  { min: 4000, fill: "#ffee6c" }, // Yellow
  { min: 2000, fill: "#97ffad" }, // Green
  { min: 1000, fill: "#a4c4ff" }, // Blue
  { min: 0, fill: "#ffffff" }, // White
];

// Figma Stars(48×48) 의 별 하나. 별 묶음은 플레이트 왼쪽에 두므로 플레이트에 가까운
// 오른쪽 열부터 (24,0)(0,0)(24,24)(0,24) 순서로 채운다.
const STAR_PATH =
  "M11.0767 2.21993C11.4183 1.39864 12.5817 1.39864 12.9233 2.21993L14.9395 7.06735C15.0835 7.41358 15.4091 7.65015 15.7829 7.68012L21.0161 8.09966C21.9027 8.17074 22.2623 9.27725 21.5867 9.85592L17.5996 13.2713C17.3148 13.5153 17.1904 13.8981 17.2774 14.2628L18.4956 19.3695C18.702 20.2348 17.7607 20.9186 17.0016 20.455L12.5213 17.7184C12.2012 17.5229 11.7988 17.5229 11.4787 17.7184L6.9984 20.455C6.2393 20.9186 5.29805 20.2348 5.50444 19.3695L6.72257 14.2628C6.80958 13.8981 6.68521 13.5153 6.40042 13.2713L2.41328 9.85592C1.73774 9.27725 2.09727 8.17074 2.98392 8.09966L8.21712 7.68012C8.59091 7.65015 8.91652 7.41358 9.06052 7.06735L11.0767 2.21993Z";
const STAR_SLOTS = [[24, 0], [0, 0], [24, 24], [0, 24]];
const starsSvgCache = new Map<number, string>();
function starsSvg(count: number): string {
  const memo = starsSvgCache.get(count);
  if (memo) return memo;
  const offs = STAR_SLOTS.slice(0, count);
  // drop shadow: y+2, 검정 60% (Figma effect 그대로)
  const shadow = offs.map(([x, y]) => `<path transform="translate(${x} ${y + 2})" d="${STAR_PATH}" fill="#000" fill-opacity="0.6"/>`).join("");
  const stars = offs.map(([x, y]) => `<path transform="translate(${x} ${y})" d="${STAR_PATH}" fill="#F0DA83"/>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="50" viewBox="0 0 48 50">${shadow}${stars}</svg>`;
  const url = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  starsSvgCache.set(count, url);
  return url;
}

// 별 개수 = /레이팅기준표(RATING_ROLES)의 단계 번호. 금 I(14000)부터만 센다
// (그 아래 구간은 기준표가 게임과 달라 쓰지 않는다). 예: 금 II → 2, 무지개(극) III → 3.
const ROMAN_STARS: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4 };
function plateStars(value: number): number {
  if (value < 14000) return 0;
  const role = RATING_ROLES.find(([min]) => value >= min);
  if (!role) return 0;
  return ROMAN_STARS[role[1].split(" ").pop() ?? ""] ?? 0;
}

function ratingPlate(value: number): El {
  const s = (v: number) => Math.round(v * PLATE_S * 100) / 100;
  const tier = PLATE_TIERS.find((t) => value >= t.min) ?? PLATE_TIERS[PLATE_TIERS.length - 1];
  // 5칸 고정. 자릿수가 모자라면 앞칸을 비운다(게임 표시와 동일).
  const digits = String(Math.max(0, Math.floor(value))).slice(-5).padStart(5, " ").split("");
  const frame = el(
    "div",
    {
      display: "flex",
      width: s(150),
      height: s(56),
      padding: s(4),
      borderRadius: s(8),
      ...(tier.fill.startsWith("linear-gradient") ? { backgroundImage: tier.fill } : { background: tier.fill }),
    },
    el(
      "div",
      {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        width: "100%",
        height: "100%",
        borderRadius: s(7.5),
        // Figma 원본 회색 그라디언트(#5d5d5d→#6b6b6b)를 어두운 카드에 맞게 조금 낮췄다.
        backgroundImage: "linear-gradient(180deg, #484848 0%, #565656 100%)",
        overflow: "hidden",
      },
      digits.map((d) =>
        el(
          "div",
          { display: "flex", alignItems: "center", justifyContent: "center", width: s(28.4), height: "100%" },
          el(
            "span",
            { fontFamily: "Pretendard", fontWeight: 700, fontSize: s(32), color: "#ffe788", lineHeight: 1 },
            d === " " ? "" : d,
          ),
        ),
      ),
    ),
  );
  const starCount = plateStars(value);
  if (starCount === 0) return frame;
  const stars = {
    type: "img",
    props: { src: starsSvg(starCount), style: { width: s(48), height: s(50) } },
  } as unknown as El;
  // 별 묶음과 플레이트 사이는 Figma(4)보다 넉넉히 띄운다.
  return el("div", { display: "flex", alignItems: "center", gap: 8 }, [stars, frame]);
}

function sectionLabel(
  label: string,
  count: number,
  avg: number,
  formatRS: (v: number) => string,
): El {
  return el(
    "div",
    {
      display: "flex",
      alignItems: "center",
      width: "100%",
      padding: "0 2px 8px",
    },
    [
      el("span", { fontSize: 11, fontWeight: 700, color: BRAND.ink }, label),
      el(
        "span",
        {
          fontSize: 8,
          fontWeight: 700,
          color: BRAND.ink2,
          background: BRAND.surface2,
          borderRadius: 99,
          padding: "2px 8px",
          marginLeft: 8,
        },
        `TOP ${count}`,
      ),
      el("span", { fontSize: 9, color: BRAND.dim, marginLeft: "auto" }, "avg"),
      el(
        "span",
        { fontSize: 11, fontWeight: 700, color: BRAND.accentSoft, marginLeft: 5 },
        formatRS(avg),
      ),
    ],
  );
}

function cardGrid(
  vms: CardVM[],
  cols: number,
  startRank: number,
  jackets: Map<string, string>,
  cmColor: Record<string, string>,
): El {
  const width = CARD_W * cols + GAP * (cols - 1);
  const cards = vms.map((vm, i) =>
    jacketCard(
      vm,
      startRank + i,
      vm.jacketFile ? (jackets.get(vm.jacketFile) ?? null) : null,
      cmColor,
    ),
  );
  return el(
    "div",
    { display: "flex", flexWrap: "wrap", width, gap: GAP },
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
  game: GameId = "maimai",
  // 과거 스냅샷 렌더는 현재 프로필 기준 캐시(profileKey 단일 행)를 오염시키면 안 되므로 끈다.
  allowCache = true,
  // 과거 역산 렌더용. 주면 그 시점의 신곡 범위로 신곡/구곡을 나눈다.
  newSongDay?: string,
): Promise<Buffer> {
  const cfg = GAMES[game];
  const cmColor = GAME_CM_COLOR[game];
  // 곡별 RS는 게임별 포맷을 쓰되, 섹션 평균은 maimai만 기존 표기(소수 1자리)를 유지
  const formatAvg = game === "maimai" ? (v: number) => v.toFixed(1) : cfg.formatRS;
  // ─── Render cache: return cached PNG if profile and card version unchanged ─
  // 번역 표시본은 뷰어별로 달라 공유 캐시(원제 기준)를 쓰지 않고 매번 새로 렌더한다.
  // 타 게임 치환본도 마찬가지로 maimai 기준 캐시를 공유하지 않는다.
  const cacheable = allowCache && !translate && game === "maimai";
  const cached = cacheable ? await getRatingCardCache(profile.profileKey) : null;
  if (
    cached &&
    cached.syncedAt === profile.lastSyncedAt &&
    cached.version === CARD_VERSION
  ) {
    return cached.blob;
  }

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

  const vmOf = (r: PlayRecord) =>
    toVM(fix(r), markMap, profile.server, translate, game);

  // 섹션 구성. maimai는 기존 동작(레이팅 대상 50곡)을 그대로 유지하고,
  // 타 게임은 mai-log와 동일하게 전체 기록에서 게임별 규칙으로 다시 뽑는다.
  const sections: { label: string; cols: number; vms: CardVM[] }[] = [];
  let totalRs: string;

  if (game === "maimai") {
    // 국제판: maimai net 파싱 순서(신곡 15 + 구곡 35)를 그대로 신뢰.
    // JP: 전체 기록에서 직접 산출하므로 버전(isNewSong)으로 분류(15/35 미만 오분류 방지).
    const newRecords =
      profile.server === "jp"
        ? records.filter((r) => isNewSong(r.title, "jp", newSongDay)).slice(0, 15)
        : records.slice(0, 15);
    const otherRecords =
      profile.server === "jp"
        ? records.filter((r) => !isNewSong(r.title, "jp", newSongDay)).slice(0, 35)
        : records.slice(15, 50);
    const newVms = newRecords.map(vmOf);
    const otherVms = otherRecords.map(vmOf);
    sections.push({ label: "NEW", cols: 3, vms: newVms });
    sections.push({ label: "OTHERS", cols: 7, vms: otherVms });
    // 헤더에는 프로필에 저장된 실제 레이팅을 표시
    totalRs = String(
      profile.rating || newVms.concat(otherVms).reduce((s, v) => s + v.rs, 0),
    );
  } else {
    // 치환 대상은 레이팅 대상 50곡이 아니라 전체 기록 풀에서 고른다.
    // clear 기록이 없으면(수집 전) 레이팅 대상곡으로 대체한다.
    const pool = clearRecords.length > 0 ? clearRecords : records;
    const rated = pool
      .filter((r) => r.achievementVal > 0)
      .map((r) => ({ r, vm: vmOf(r) }));
    const byRs = (a: { vm: CardVM }, b: { vm: CardVM }) => b.vm.rs - a.vm.rs;
    const [first, second] = cfg.sections;

    if (cfg.select === "newOld") {
      const news = rated
        .filter((x) => isNewSong(x.r.title, profile.server))
        .sort(byRs)
        .slice(0, first.count)
        .map((x) => x.vm);
      const olds = rated
        .filter((x) => !isNewSong(x.r.title, profile.server))
        .sort(byRs)
        .slice(0, second.count)
        .map((x) => x.vm);
      sections.push({ label: first.label, cols: first.cols, vms: news });
      sections.push({ label: second.label, cols: second.cols, vms: olds });
    } else if (cfg.select === "top") {
      const top = rated
        .sort(byRs)
        .slice(0, first.count)
        .map((x) => x.vm);
      sections.push({ label: first.label, cols: first.cols, vms: top });
    }

    // 2배 가중치가 붙는 상위 N곡은 레이팅 숫자를 강조색으로 표시 (Arcaea 7.0)
    if (cfg.doubleCount) {
      for (const vm of sections[0].vms.slice(0, cfg.doubleCount))
        vm.rsColor = RS_DOUBLE_COLOR;
    }

    const allVms = sections.flatMap((sec) => sec.vms);
    totalRs = cfg.formatTotal(cfg.calcTotal(allVms.map((v) => v.rs)));
  }

  // prefetch all jacket images
  const files = [
    ...new Set(
      sections.flatMap((sec) =>
        sec.vms.flatMap((v) => (v.jacketFile ? [v.jacketFile] : [])),
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

  const gridWidth = (cols: number) => CARD_W * cols + GAP * (cols - 1);
  // 섹션마다 랜딩 카드처럼 테두리 있는 둥근 패널로 감싼다.
  const PANEL_PAD = 12;
  const COL_GAP = 14;
  const twoCol = sections.length > 1;
  const panelWidth = (cols: number) => gridWidth(cols) + PANEL_PAD * 2 + 2; // +2 = 테두리
  const bodyWidth = twoCol
    ? panelWidth(sections[0].cols) + COL_GAP + panelWidth(sections[1].cols)
    : panelWidth(sections[0].cols);
  const PAD = 20;
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
              style: { width: 38, height: 38, objectFit: "cover", borderRadius: 10 },
            },
          } as any)
        : el("div", {
            width: 38,
            height: 38,
            borderRadius: 10,
            background: BRAND.surface2,
            display: "flex",
          }),
      el("div", { display: "flex", flexDirection: "column" }, [
        ...(profile.trophy
          ? [
              el(
                "span",
                { fontSize: 8, color: BRAND.dim, marginBottom: 1 },
                profile.trophy,
              ),
            ]
          : []),
        el(
          "span",
          { fontSize: 12, fontWeight: 700, color: BRAND.ink },
          profile.playerName || "—",
        ),
      ]),
    ],
  );

  const wordmark = el("div", { display: "flex", alignItems: "baseline" }, [
    el(
      "span",
      { fontSize: 13, fontWeight: 700, color: BRAND.dim, marginRight: 6 },
      "Created by",
    ),
    el("span", { fontSize: 13, fontWeight: 800, color: BRAND.ink }, "carol"),
    el("span", { fontSize: 13, fontWeight: 800, color: ACCENT }, "bot"),
  ]);

  const ratingBlock = game === "maimai"
    ? ratingPlate(Number(totalRs) || 0)
    : el(
    "div",
    { display: "flex", flexDirection: "column", alignItems: "flex-end" },
    [
      el("span", { fontSize: 8, color: BRAND.dim }, cfg.ratingLabel),
      el(
        "span",
        { fontSize: 20, fontWeight: 800, color: cfg.accent, lineHeight: 1.1 },
        totalRs,
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
      paddingBottom: 14,
      borderBottom: `1px solid ${BRAND.border}`,
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

  const sectionPanel = (sec: { label: string; cols: number; vms: CardVM[] }): El =>
    el(
      "div",
      {
        display: "flex",
        flexDirection: "column",
        width: panelWidth(sec.cols),
        padding: PANEL_PAD,
        background: BRAND.surface,
        border: `1px solid ${BRAND.border}`,
        borderRadius: PANEL_R,
      },
      [
        sectionLabel(sec.label, sec.vms.length, avg(sec.vms), formatAvg),
        cardGrid(sec.vms, sec.cols, 1, jackets, cmColor),
      ],
    );

  const body = twoCol
    ? el(
        "div",
        {
          display: "flex",
          marginTop: 14,
          gap: COL_GAP,
          alignItems: "stretch",
        },
        [sectionPanel(sections[0]), sectionPanel(sections[1])],
      )
    : el(
        "div",
        { display: "flex", flexDirection: "column", marginTop: 14 },
        [sectionPanel(sections[0])],
      );

  const root = el(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      background: BRAND.canvas,
      padding: PAD,
    },
    [header, body],
  );

  const buf = await renderInWorker(root, totalWidth);

  // ─── Persist render cache ─────────────────────────────────────────────────
  // 번역본·치환본은 공유 캐시(maimai 원제 기준)를 덮어쓰지 않는다.
  if (cacheable) {
    await saveRatingCardCache(
      profile.profileKey,
      buf,
      profile.lastSyncedAt,
      CARD_VERSION,
    );
  }

  return buf;
}
