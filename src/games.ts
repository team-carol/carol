// mai-log(app/(v3)/lib/{ratingCalc,scoreConvert,games}.ts)의 타 게임 치환 로직 이식.
// 레이팅 계산식은 mai-log 원본을 그대로 유지한다 (수치·반올림 순서 포함).
// maimai 기록(달성률 0~101%, 상수 0~15.0)을 각 게임 스케일로 선형 보간해 환산한다.

import { BRAND } from "./brand";
import type { PlayRecord } from "./scraper";

export type GameId = "maimai" | "chunithm" | "sdvx" | "arcaea";

// 소수 2자리 내림. Math.floor(10.2 * 100)이 1019가 되는 부동소수점 오차를 피하려고
// 곱한 뒤 유효 자리에서 한 번 정리하고 내린다.
function floor2(v: number): number {
  return Math.floor(Number((v * 100).toFixed(6))) / 100;
}

// 소수 3자리 내림 (Arcaea 포텐셜 표기 기준: 4자리 이하 버림)
function floor3(v: number): number {
  return Math.floor(Number((v * 1000).toFixed(6))) / 1000;
}

export const GAME_IDS: GameId[] = ["maimai", "chunithm", "sdvx", "arcaea"];

// ─── 레이팅 계산식 (mai-log ratingCalc.ts 원본) ───────────────────────────────

// ── CHUNITHM ─────────────────────────────────────────────────────────────────
// 레벨: maimai 1~14.9 → CHUNITHM 1~15.7 선형 보간. 단 maimai 유일의 15.0 채보
//       3곡은 서로 구분되도록 개별 고정 (SDVX의 lv15 보정 사례와 동일한 방식).
// 점수: maimai achievement 정수 그대로 (두 게임 최대 점수 동일)
// 보정값: 구간별 Math.floor 스텝
const CHUNITHM_LV15_MAP: Record<string, number> = {
  "Xaleid◆scopiX": 16.0,
  系ぎて: 15.9,
  "PANDORA PARADOXXX": 15.8,
};

export function chunithmLevel(lv: number, title?: string): number {
  if (lv >= 15 && title !== undefined && CHUNITHM_LV15_MAP[title] !== undefined)
    return CHUNITHM_LV15_MAP[title];
  return Math.round((1 + (lv - 1) * (14.7 / 13.9)) * 10) / 10;
}
function getChunithmBonus(score: number): number {
  if (score >= 1009000) return 2.15;
  if (score >= 1007500) return 2.0 + Math.floor((score - 1007500) / 100) * 0.01;
  if (score >= 1005000) return 1.5 + Math.floor((score - 1005000) / 50) * 0.01;
  if (score >= 1000000) return 1.0 + Math.floor((score - 1000000) / 100) * 0.01;
  if (score >= 990000) return 0.6 + Math.floor((score - 990000) / 250) * 0.01;
  if (score >= 975000) return 0.0 + Math.floor((score - 975000) / 250) * 0.01;
  if (score >= 950000) return -1.67 + Math.floor((score - 950000) / 150) * 0.01;
  if (score >= 925000) return -3.34 + Math.floor((score - 925000) / 150) * 0.01;
  return -5.0;
}

export function chunithmRS(
  ach: number,
  lv: number,
  _marks: string[] = [],
  title?: string,
): number {
  const chuniScore = Math.round(ach * 10000); // achievement 정수 그대로
  const chuniLevel = chunithmLevel(lv, title);
  const bonus = getChunithmBonus(chuniScore);
  return Math.max(0, floor2(chuniLevel + bonus));
}

// ── SOUND VOLTEX ─────────────────────────────────────────────────────────────
// 반환값: 밀리-VF (정수). 표시 시 / 1000 → 소수점 3자리
// 공식: floor(sdvxLevel × 10 × 2 × (sdvxScore / 10,000,000) × 클리어 보정 × 랭크 보정)
// 클리어 보정: 표시되는 SDVX 마크 기준 (PUC 1.10 / UC 1.06 / 그 외 1.00)
function getSdvxClearBonus(marks: string[]): number {
  if (isSdvxPuc(marks)) return 1.10; // PUC (AP / AP+)
  if (marks.includes("FC+") || marks.includes("FC")) return 1.06; // UC
  return 1.0; // COMP / PLAYED
}

// 랭크 기준표 [점수 하한, 랭크명, 랭크 보정]. 환산된 SDVX 점수로 판정한다.
const SDVX_RANKS: readonly (readonly [number, string, number])[] = [
  [9900000, "S", 1.05],
  [9800000, "AAA+", 1.02],
  [9700000, "AAA", 1.0],
  [9500000, "AA+", 0.97],
  [9300000, "AA", 0.94],
  [9000000, "A+", 0.91],
  [8700000, "A", 0.88],
  [7500000, "B", 0.85],
  [6500000, "C", 0.82],
  [0, "D", 0.8],
];

function sdvxRankEntry(score: number): readonly [number, string, number] {
  return SDVX_RANKS.find((r) => score >= r[0]) ?? SDVX_RANKS[SDVX_RANKS.length - 1];
}

function getSdvxRankBonus(score: number): number {
  return sdvxRankEntry(score)[2];
}

// AP/AP+는 SDVX의 PUC에 해당하므로 점수를 만점(10,000,000)으로 고정한다.
export const SDVX_MAX_SCORE = 10000000;

export function isSdvxPuc(marks: string[] = []): boolean {
  return marks.includes("AP+") || marks.includes("AP");
}

export function sdvxScoreOf(ach: number, marks: string[] = []): number {
  if (isSdvxPuc(marks)) return SDVX_MAX_SCORE;
  return Math.round((Math.round(ach * 10000) / 1010000) * SDVX_MAX_SCORE);
}

export function sdvxRS(ach: number, lv: number, marks: string[] = []): number {
  const sdvxLevel = Math.round((lv / 15.0) * 20.9 * 10) / 10;
  const sdvxScore = sdvxScoreOf(ach, marks);
  const clearBon = getSdvxClearBonus(marks);
  const rankBon = getSdvxRankBonus(sdvxScore);
  return Math.floor(sdvxLevel * 10 * 2 * (sdvxScore / 10000000) * clearBon * rankBon);
}

// ── Arcaea (7.0 기준) ────────────────────────────────────────────────────────
// 7.0에서 Recent가 폐지되고 Best 30 → Best 50으로 변경되었으며,
// 50곡 중 상위 10곡에는 포텐셜 2배가 적용된다 (총합은 곡 수 50으로 나눔).
// 레벨: 구간별 선형 보간. 상위 구간일수록 촘촘해진다.
//   1   ~13.5 → 1   ~ 9.9
//   13.6~13.9 → 10.0~10.5
//   14.0~14.5 → 10.6~10.9
//   14.6~14.9 → 11.0~11.5
//   15.0 이상 → 12.0 (고정 목록에 없는 신규 채보)
// 특정 곡은 개별 고정 (CHUNITHM·SDVX의 보정과 동일한 방식).
// 점수: (achInt / 1010000) × 10000000 선형 보간
// 단일 포텐셜: PM(10M) +2.0 / ≥9.8M: +1.0+(x-9.8M)/200K / 그 외: (x-9.5M)/300K
//             TRACK COMPLETE 시 위 값에 +0.2 (7.0 기준)

// title → [적용 하한 상수, 고정 레벨]. 하한을 둬서 같은 곡의 하위 채보에는 걸리지 않게 한다.
const ARCAEA_FIXED: Record<string, readonly [number, number]> = {
  "Xaleid◆scopiX": [15.0, 12.0],
  系ぎて: [15.0, 11.9],
  "PANDORA PARADOXXX": [15.0, 11.9],
  "QZKago Requiem": [14.9, 11.7],
  raputa: [14.9, 11.7],
};

// [a0,a1] 구간의 lv를 [b0,b1]로 선형 보간 (소수 1자리)
function lerpLv(lv: number, a0: number, a1: number, b0: number, b1: number): number {
  return Math.round((b0 + ((lv - a0) * (b1 - b0)) / (a1 - a0)) * 10) / 10;
}

export function arcaeaLevel(lv: number, title?: string): number {
  const fixed = title !== undefined ? ARCAEA_FIXED[title] : undefined;
  if (fixed && lv >= fixed[0]) return fixed[1];
  // 고정 목록에 없는 15.0 이상 채보(향후 추가분)는 상한인 12.0으로 본다.
  if (lv >= 15.0) return 12.0;
  if (lv >= 14.6) return lerpLv(lv, 14.6, 14.9, 11.0, 11.5);
  if (lv >= 14.0) return lerpLv(lv, 14.0, 14.5, 10.6, 10.9);
  if (lv >= 13.6) return lerpLv(lv, 13.6, 13.9, 10.0, 10.5);
  return lerpLv(lv, 1.0, 13.5, 1.0, 9.9);
}

// TRACK COMPLETE(클리어) 판정. 카드에 찍히는 클리어 마크(P/F/C vs L)와 같은 기준을 쓴다.
export const ARCAEA_CLEAR_ACH = 80.8;

export function isArcaeaTrackComplete(ach: number, marks: string[] = []): boolean {
  return (
    marks.includes("AP+") ||
    marks.includes("AP") ||
    marks.includes("FC+") ||
    marks.includes("FC") ||
    ach >= ARCAEA_CLEAR_ACH
  );
}

export function arcaeaRS(
  ach: number,
  lv: number,
  marks: string[] = [],
  title?: string,
): number {
  const achInt = Math.round(ach * 10000);
  const basePotential = arcaeaLevel(lv, title);
  const score = Math.round((achInt / 1010000) * 10000000);

  let potential: number;
  if (score >= 10000000) {
    potential = basePotential + 2.0;
  } else if (score >= 9800000) {
    potential = basePotential + 1.0 + (score - 9800000) / 200000;
  } else {
    potential = basePotential + (score - 9500000) / 300000; // 9.5M 미만 시 음수 가능
  }

  // TRACK COMPLETE 고정 가산
  if (isArcaeaTrackComplete(ach, marks)) potential += 0.2;

  return floor3(potential);
}

// ─── 점수 / 난이도 / 마크 치환 (mai-log scoreConvert.ts 원본) ─────────────────

const SCORE_RANKS = ["SSS+","SSS","SS+","SS","S+","S","AAA","AA","A","BBB","BB","B","C","D"];

export function getScoreRank(ach: number): string {
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

export function getChunithmScoreRank(ach: number): string {
  const score = Math.round(ach * 10000);
  if (score >= 1009000) return "SSS+";
  if (score >= 1007500) return "SSS";
  if (score >= 1005000) return "SS+";
  if (score >= 1000000) return "SS";
  if (score >= 990000) return "S+";
  if (score >= 975000) return "S";
  if (score >= 950000) return "AAA";
  if (score >= 925000) return "AA";
  if (score >= 900000) return "A";
  if (score >= 800000) return "BBB";
  if (score >= 700000) return "BB";
  if (score >= 600000) return "B";
  if (score >= 500000) return "C";
  return "D";
}

// 환산된 SDVX 점수로 랭크를 판정한다 (볼포스의 랭크 보정과 같은 기준).
export function getSdvxScoreRank(ach: number, marks: string[] = []): string {
  return sdvxRankEntry(sdvxScoreOf(ach, marks))[1];
}

export function getArcaeaScoreRank(ach: number): string {
  if (ach >= 99.99) return "EX+";
  if (ach >= 98.98) return "EX";
  if (ach >= 95.95) return "AA";
  if (ach >= 92.92) return "A";
  if (ach >= 89.89) return "B";
  if (ach >= 86.86) return "C";
  return "D";
}

// 달성률 → 각 게임 점수 표기
export function convertScore(
  ach: number,
  game: GameId,
  marks: string[] = [],
): string {
  if (game === "maimai") return ach.toFixed(4) + "%";

  let score: number;
  if (game === "chunithm") {
    score = Math.round(ach * 10000);
  } else if (game === "sdvx") {
    // PUC(AP/AP+)는 만점 고정, 그 외는 선형 보간
    score = sdvxScoreOf(ach, marks);
  } else {
    // arcaea: 선형 보간 (achInt / 1010000) × 10,000,000
    score = Math.round((Math.round(ach * 10000) / 1010000) * 10000000);
  }
  return score.toLocaleString();
}

function getSdvxReMasterName(version: number): string {
  if (version >= 26500) return "NABLA";
  if (version >= 22000) return "EXCEED";
  if (version >= 20000) return "VIVID";
  if (version >= 18000) return "HEAVENLY";
  if (version >= 14000) return "GRAVITY";
  return "INFINITE";
}

export function convertDiff(game: GameId, diff: string, version?: number): string {
  if (game === "maimai") return diff;
  if (game === "chunithm") {
    if (diff === "Re:MASTER") return "ULTIMA";
    return diff;
  }
  if (game === "sdvx") {
    if (diff === "Re:MASTER") return getSdvxReMasterName(version ?? 0);
    if (diff === "MASTER") return "MAXIMUM";
    if (diff === "EXPERT") return "EXHAUST";
    if (diff === "ADVANCED") return "ADVANCED";
    return "NOVICE";
  }
  // arcaea
  if (diff === "Re:MASTER") return "Eternal";
  if (diff === "MASTER") return "Future";
  if (diff === "EXPERT") return "Present";
  return "Past";
}

export function convertMarks(marks: string[], game: GameId): string[] {
  if (game === "maimai") return marks;

  const hasAP = marks.includes("AP+") || marks.includes("AP");
  const hasFC = marks.includes("FC+") || marks.includes("FC");
  const hasFS = ["FSD+", "FSD", "FS+", "FS"].some((m) => marks.includes(m));

  if (game === "chunithm") {
    return marks
      .filter((m) => !["SYNC", "FS", "FS+", "FSD", "FSD+"].includes(m))
      .map((m) => (m === "AP+" ? "AJC" : m === "AP" ? "AJ" : m));
  }
  if (game === "sdvx") {
    if (hasAP) return ["PUC"];
    if (hasFC) return ["UC"];
    if (hasFS) return ["HC"];
    return ["CLEAR"];
  }
  // arcaea
  if (hasAP) return ["PM"];
  if (hasFC) return ["FR"];
  return ["CLEAR"];
}

// 카드 우측에 실제로 찍히는 마크 목록 (스코어랭크 + 클리어 마크)
export function buildDisplayMarks(ach: number, marks: string[], game: GameId): string[] {
  if (game === "sdvx") {
    const rank = getSdvxScoreRank(ach, marks);
    const hasAP = marks.includes("AP+") || marks.includes("AP");
    const hasFC = marks.includes("FC+") || marks.includes("FC");
    const clearMark = hasAP ? "PUC" : hasFC ? "UC" : ach >= 80.8 ? "COMP" : "PLAYED";
    return [rank, clearMark];
  }
  if (game === "arcaea") {
    const rank = getArcaeaScoreRank(ach);
    const hasAP = marks.includes("AP+") || marks.includes("AP");
    const hasFC = marks.includes("FC+") || marks.includes("FC");
    const clearMark = hasAP
      ? "P"
      : hasFC
        ? "F"
        : isArcaeaTrackComplete(ach, marks)
          ? "C"
          : "L";
    return [rank, clearMark];
  }
  const scoreRank = game === "chunithm" ? getChunithmScoreRank(ach) : getScoreRank(ach);
  const baseMarks = [scoreRank, ...marks.filter((m) => !SCORE_RANKS.includes(m))];
  return convertMarks(baseMarks, game);
}

// ─── 색상 팔레트 (mai-log scoreConvert.ts 원본) ───────────────────────────────

export const MAI_CM_COLOR: Record<string, string> = {
  "SSS+":"#d97706","SSS":"#f59e0b","SS+":"#fbbf24","SS":"#fbbf24",
  "S+":"#fb923c","S":"#fb923c","AAA":"#60a5fa","AA":"#60a5fa","A":"#93c5fd",
  "BBB":"#7dd3fc","BB":"#bae6fd","B":"#e0f2fe",
  "C":"#d1d5db","D":"#9ca3af",
  "AP+":"#d946ef","AP":"#d946ef","FC+":"#3b82f6","FC":"#60a5fa",
  "FS+":"#22c55e","FS":"#4ade80","FSD+":"#10b981","FSD":"#34d399",
  "SYNC":"#94a3b8",
};

export const GAME_CM_COLOR: Record<GameId, Record<string, string>> = {
  maimai: MAI_CM_COLOR,
  chunithm: {
    ...MAI_CM_COLOR,
    "AJC":"#ca8a04","AJ":"#f59e0b",
  },
  sdvx: {
    "PUC":"#ca8a04","UC":"#f59e0b","COMP":"#3b82f6","PLAYED":"#6b7280",
    "S":"#d97706","AAA+":"#f59e0b","AAA":"#fbbf24",
    "AA+":"#fb923c","AA":"#fb923c",
    "A+":"#60a5fa","A":"#93c5fd",
    "B":"#4ade80","C":"#9ca3af","D":"#6b7280",
  },
  arcaea: {
    "EX+":"#d97706","EX":"#a855f7","AA":"#c084fc","A":"#d8b4fe",
    "B":"#60a5fa","D":"#6b7280",
    "P":"#ca8a04","F":"#f59e0b","C":"#3b82f6","L":"#6b7280",
  },
};

export const MAI_DIFF_COLOR: Record<string, string> = {
  "BASIC":"#16a34a",
  "ADVANCED":"#ea580c",
  "EXPERT":"#dc2626",
  "MASTER":"#9333ea",
  "Re:MASTER":"#c084fc",
};

export const GAME_DIFF_COLOR: Record<GameId, Record<string, string>> = {
  maimai: MAI_DIFF_COLOR,
  chunithm: {
    "BASIC":"#16a34a","ADVANCED":"#d97706","EXPERT":"#dc2626",
    "MASTER":"#9333ea","ULTIMA":"#555555",
  },
  sdvx: {
    "NOVICE":"#16a34a","ADVANCED":"#2563eb","EXHAUST":"#dc2626","MAXIMUM":"#7c3aed",
    "INFINITE":"#c026d3","GRAVITY":"#ea580c","HEAVENLY":"#0ea5e9",
    "VIVID":"#ec4899","EXCEED":"#d97706","NABLA":"#0d9488",
  },
  arcaea: {
    "Past":"#64748b","Present":"#059669","Future":"#7c3aed","Beyond":"#dc2626",
    "Eternal":"#dc2626",
  },
};

// ─── 게임 설정 (mai-log games.ts 원본 기준) ───────────────────────────────────
// sections: 카드 그리드 구성. count/cols는 모두 5행이 되도록 맞춰 카드 폭을 유지한다.
//   maimai 15@3 + 35@7 / chunithm 20@4 + 30@6 / sdvx 50@10 / arcaea 10@2 + 30@6

export type SelectMode = "newOld" | "top";

export interface GameSection {
  readonly label: string;
  readonly count: number;
  readonly cols: number;
}

export interface GameConfig {
  readonly id: GameId;
  readonly label: string;
  readonly accent: string;
  readonly ratingLabel: string;
  readonly select: SelectMode;
  readonly sections: readonly GameSection[];
  /** 상위 몇 곡에 2배 가중치가 붙는지. 해당 곡의 레이팅 숫자를 강조 표시한다. */
  readonly doubleCount?: number;
  /** 곡 단위 레이팅 (mai-log 원본 공식). title은 곡별 레벨 보정에만 쓰인다. */
  readonly calcRS: (
    ach: number,
    lv: number,
    marks: string[],
    title?: string,
  ) => number;
  /** 선택된 곡들의 RS 합 → 총 레이팅 */
  readonly calcTotal: (rsList: number[]) => number;
  readonly formatRS: (v: number) => string;
  readonly formatTotal: (v: number) => string;
}

const sum = (xs: number[]) => xs.reduce((s, v) => s + v, 0);

// Arcaea 7.0: Best 50 중 상위 10곡은 비중 2배 → 실질 60보면분의 평균이 포텐셜이 된다.
export const ARCAEA_DOUBLE_COUNT = 10;
export const ARCAEA_POTENTIAL_DIVISOR = 60;

// 2배 가중치가 붙은 곡의 레이팅 숫자 색 (기본은 흰색)
export const RS_DEFAULT_COLOR = "#fff";
export const RS_DOUBLE_COLOR = "#fbbf24";

export const GAMES: Record<GameId, GameConfig> = {
  maimai: {
    id: "maimai",
    label: "maimai DX",
    accent: BRAND.accent,
    ratingLabel: "RATING",
    select: "newOld",
    sections: [
      { label: "NEW", count: 15, cols: 3 },
      { label: "OTHERS", count: 35, cols: 7 },
    ],
    // maimai는 캐롤봇 기존 계산식(calcSongRating)을 그대로 쓰므로 여기서는 참조되지 않는다.
    calcRS: () => 0,
    calcTotal: sum,
    formatRS: (v) => String(v),
    formatTotal: (v) => String(v),
  },
  chunithm: {
    id: "chunithm",
    label: "CHUNITHM",
    accent: "#f97316",
    ratingLabel: "RATING",
    select: "newOld",
    sections: [
      { label: "NEW", count: 20, cols: 4 },
      { label: "OTHERS", count: 30, cols: 6 },
    ],
    calcRS: chunithmRS,
    calcTotal: (rs) => floor2(sum(rs) / 50),
    formatRS: (v) => v.toFixed(2),
    formatTotal: (v) => v.toFixed(2),
  },
  sdvx: {
    id: "sdvx",
    label: "SOUND VOLTEX",
    accent: "#38bdf8",
    ratingLabel: "VOLFORCE",
    select: "top",
    sections: [{ label: "VOLFORCE", count: 50, cols: 10 }],
    calcRS: sdvxRS,
    calcTotal: sum,
    // 곡별은 VF × 100으로 표기 (밀리-VF / 1000 × 100 = / 10)
    formatRS: (v) => (v / 10).toFixed(1),
    // 총 VOLFORCE는 밀리-VF → VF (/ 1000)
    formatTotal: (v) => (v / 1000).toFixed(3),
  },
  arcaea: {
    id: "arcaea",
    label: "Arcaea",
    accent: "#a855f7",
    ratingLabel: "POTENTIAL",
    select: "top",
    sections: [{ label: "BEST", count: 50, cols: 10 }],
    doubleCount: ARCAEA_DOUBLE_COUNT,
    calcRS: arcaeaRS,
    // 상위 10곡은 비중 2배 → 실질 60보면분의 평균.
    calcTotal: (rs) => {
      const sorted = [...rs].sort((a, b) => b - a);
      const weighted = sorted.reduce(
        (acc, v, i) => acc + (i < ARCAEA_DOUBLE_COUNT ? v * 2 : v),
        0,
      );
      return floor3(weighted / ARCAEA_POTENTIAL_DIVISOR);
    },
    // 포텐셜은 곡별·총합 모두 소수 3자리까지 표시하고 4자리 이하는 버린다.
    formatRS: (v) => v.toFixed(3),
    formatTotal: (v) => v.toFixed(3),
  },
};

export function isGameId(v: string): v is GameId {
  return (GAME_IDS as string[]).includes(v);
}

// PlayRecord의 fc/sync 필드를 mai-log의 marks 배열 형태로 변환
export function recordMarks(fc: string | undefined, sync: string | undefined): string[] {
  const marks: string[] = [];
  if (fc) marks.push(fc);
  if (sync) marks.push(sync);
  return marks;
}

export type { PlayRecord };

// 카드에 표시할 레벨 (mai-log download/page.tsx의 getDisplayLv 원본)
// 레이팅 공식이 쓰는 환산 스케일과 동일하게 맞춘다.
export function getDisplayLv(lv: number, game: GameId, title?: string): number {
  if (game === "chunithm") return chunithmLevel(lv, title);
  if (game === "sdvx") return Math.round((lv / 15.0) * 20.9 * 10) / 10;
  if (game === "arcaea") return arcaeaLevel(lv, title);
  return lv;
}
