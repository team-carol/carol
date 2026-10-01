import {
  ACCENT, SURFACE2, BORDER, TEXT, MUTED, CANVAS, INK, SOFT, FAINT, NUM_FONT, TROPHY_STYLE,
  type El, el, image, pill, remoteDataUrl, kstStamp, wordmark, statsPanel, panel,
} from "./cardKit";
import { renderInWorker } from "./renderPool";
import { fetchJacketDataUrl, ratingPlate } from "./ratingCard";
import { alignLeftMargin } from "./textMetrics";
import type { CachedProfile } from "../../storage/types";
import { CIRCLE_COLORS, type CircleInfo, type CircleMember, type CircleColor, type CircleRankEntry } from "../../scraper";
import { signed } from "./circle";
import { getJacketFile, getTitleByJacket } from "../../constants";
import { displayTitle } from "../../aliases";
import { msg, cardTextSignature, type MessageKey } from "../../messages";
import { CIRCLE_COLOR_STYLE, CIRCLE_STAGE_POINTS } from "./circleColors";

// /서클 이미지 카드. /프로필 카드와 같은 부품(cardKit)·토큰을 쓴다.
// 헤더(서클 이름·코드·소개) → 포인트·순위·보상·멤버 수 → 서클 챌린지(+다음 주 예고) → 멤버 포인트(2열).

const CIRCLE_CARD_VERSION = 19;
const CIRCLE_CARD_CACHE_MAX = 32;
const circleCardCache = new Map<string, Buffer>();
const fmt = (n: number) => n.toLocaleString("en-US");

/** DX NET 재킷 URL 을 먼저 쓰고, 실패하면 otoge-db 재킷(같은 파일명)으로. */
async function jacketData(url: string | undefined, title?: string | null): Promise<string | null> {
  const direct = url ? await remoteDataUrl(url) : null;
  if (direct) return direct;
  const file = title ? getJacketFile(title) : url?.split("/").pop() ?? null;
  return file ? fetchJacketDataUrl(file) : null;
}

// DX NET 서클 챌린지 게이지. 멤버 달성률 합계를 1000% 기준으로 채우고, 100% 마다 눈금(9개)이 있다.
function gaugeBar(percent: number): El {
  const width = Math.max(0, Math.min(100, percent));
  return el("div", { display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }, [
    el("div", { display: "flex", position: "relative", height: 10, borderRadius: 99, background: SURFACE2, overflow: "hidden" }, [
      el("div", { position: "absolute", left: 0, top: 0, bottom: 0, width: `${width}%`, background: ACCENT, borderRadius: 99 }),
      ...Array.from({ length: 9 }, (_, i) => el("div", { position: "absolute", top: 0, bottom: 0, left: `${(i + 1) * 10}%`, width: 1, background: CANVAS, opacity: 0.6 })),
    ]),
    el("div", { display: "flex", justifyContent: "space-between", color: FAINT, fontSize: 9 }, [
      el("span", {}, "0%"),
      el("span", {}, "1000%"),
    ]),
  ]);
}

function challengePanel(circle: CircleInfo, translate: boolean, jacket: string | null, forecast: { title: string | null; jacket: string | null } | null): El {
  const ch = circle.challenge!;
  const left = el("div", { display: "flex", flex: 1, minWidth: 0, alignItems: "center" }, [
    jacket
      ? image(jacket, { width: 112, height: 112, borderRadius: 12, objectFit: "cover", flexShrink: 0, marginRight: 16 })
      : el("div", { width: 112, height: 112, borderRadius: 12, background: SURFACE2, flexShrink: 0, marginRight: 16 }),
    el("div", { display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: 6 }, [
      ch.genre ? el("span", { color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.4 }, ch.genre) : el("span", {}, ""),
      el("span", { color: INK, fontSize: 18, fontWeight: 700, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, displayTitle(ch.title, translate)),
      el("span", { color: MUTED, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, ch.artist || " "),
      el("div", { display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }, [
        el("span", { color: MUTED, fontSize: 11 }, msg("circleCard.achievement")),
        el("span", { color: SOFT, fontFamily: NUM_FONT, fontSize: 26, fontWeight: 700, lineHeight: 1 }, ch.achievement || "—"),
      ]),
      ...(ch.gauge !== undefined ? [gaugeBar(ch.gauge)] : []),
    ]),
  ]);
  if (!forecast) return panel(msg("circleCard.challengeTitle"), msg("circleCard.challengeMeta"), [left]);
  const right = el("div", {
    display: "flex", flexDirection: "column", alignItems: "center", width: 200, flexShrink: 0,
    marginLeft: 16, paddingLeft: 16, borderLeft: `1px solid ${BORDER}`, gap: 8,
  }, [
    el("span", { color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.4 }, msg("circleCard.nextWeek")),
    forecast.jacket
      ? image(forecast.jacket, { width: 72, height: 72, borderRadius: 10, objectFit: "cover" })
      : el("div", { width: 72, height: 72, borderRadius: 10, background: SURFACE2 }),
    el("span", { color: TEXT, fontSize: 12, fontWeight: 700, maxWidth: 184, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
      forecast.title ? displayTitle(forecast.title, translate) : msg("circleCard.forecastUnknown")),
    el("span", { color: FAINT, fontSize: 10 }, msg("circleCard.forecastNote")),
  ]);
  return panel(msg("circleCard.challengeTitle"), msg("circleCard.challengeMeta"), [el("div", { display: "flex", alignItems: "center" }, [left, right])]);
}

// 이번 달 진행도. DX NET 서클 랭킹 피라미드처럼 위(Rainbow)가 좁고 아래(White)가 넓은 계단 모양.
// 띠마다 오른쪽에 단계 조건을 붙이고, 현재·다음 단계만 밝게 한다. 오른쪽에는 다음 단계까지 남은 양.
const RULE_KEYS: Record<CircleColor, MessageKey> = {
  rainbow: "circleCard.ruleRainbow", gold: "circleCard.ruleGold", silver: "circleCard.ruleSilver", bronze: "circleCard.ruleBronze",
  purple: "circleCard.rulePurple", red: "circleCard.ruleRed", yellow: "circleCard.ruleYellow", green: "circleCard.ruleGreen", white: "circleCard.ruleWhite",
};

// Gold·Silver·Bronze 는 순위 비율에 더해 10,000 PT 이상이어야 한다. 이 조건은 작게 덧붙인다.
const RANK_STAGES: CircleColor[] = ["gold", "silver", "bronze"];
const minPointsNote = (c: CircleColor, fontSize: number, color: string): El[] =>
  RANK_STAGES.includes(c) ? [el("span", { color, fontSize, lineHeight: 1 }, msg("circleCard.ruleMinPoints"))] : [];

function nextStageBlock(circle: CircleInfo, stage: CircleColor): El {
  const idx = CIRCLE_COLORS.indexOf(stage);
  const next = idx > 0 ? CIRCLE_COLORS[idx - 1] : null;
  const title = el("span", { color: MUTED, fontSize: 11 }, msg("circleCard.nextTitle"));
  if (!next) return el("div", { display: "flex", flexDirection: "column", gap: 8 }, [title, el("span", { color: INK, fontSize: 15, fontWeight: 700 }, msg("circleCard.topStage"))]);
  const nextName = msg(`circleColor.${next}`);
  const target = CIRCLE_STAGE_POINTS[next];
  const points = circle.monthPoints ?? 0;
  if (target !== undefined) {
    // Purple 이하: 포인트 기준이라 남은 포인트와 막대로.
    const ratio = Math.max(0, Math.min(1, points / target));
    return el("div", { display: "flex", flexDirection: "column", gap: 8 }, [
      title,
      el("span", { color: INK, fontSize: 16, fontWeight: 700 }, msg("circleCard.nextPoints", { stage: nextName, points: fmt(Math.max(0, target - points)) })),
      el("div", { display: "flex", position: "relative", height: 10, borderRadius: 99, background: SURFACE2, overflow: "hidden" }, [
        el("div", { position: "absolute", left: 0, top: 0, bottom: 0, width: `${ratio * 100}%`, borderRadius: 99, backgroundImage: CIRCLE_COLOR_STYLE[next].gradient }),
      ]),
      el("span", { color: FAINT, fontFamily: NUM_FONT, fontSize: 11 }, msg("circleCard.nextProgress", { current: fmt(points), target: fmt(target) })),
    ]);
  }
  // Bronze 이상: 순위 비율로 정해져 포인트만으로는 알 수 없다. 조건과 지금 순위를 글로.
  return el("div", { display: "flex", flexDirection: "column", gap: 8 }, [
    title,
    el("div", { display: "flex", alignItems: "baseline", gap: 8 }, [
      el("span", { color: INK, fontSize: 16, fontWeight: 700, lineHeight: 1 }, msg("circleCard.nextRank", { stage: nextName, rule: msg(RULE_KEYS[next]) })),
      ...minPointsNote(next, 11, MUTED),
    ]),
    el("span", { color: FAINT, fontSize: 11 }, msg("circleCard.nextRankNow", { rank: circle.rank === null ? "—" : fmt(circle.rank), points: fmt(points) })),
  ]);
}

function progressPanel(circle: CircleInfo, stage: CircleColor): El {
  const BAND_H = 20, MIN_W = 44, MAX_W = 300;
  const n = CIRCLE_COLORS.length;
  const stageIdx = CIRCLE_COLORS.indexOf(stage);
  const pyramid = el("div", { display: "flex", flexDirection: "column", flexShrink: 0, gap: 3 },
    CIRCLE_COLORS.map((c, i) => {
      const on = c === stage;
      const isNext = i === stageIdx - 1;
      const w = Math.round(MIN_W + ((MAX_W - MIN_W) * i) / (n - 1));
      return el("div", { display: "flex", alignItems: "center" }, [
        el("div", { display: "flex", justifyContent: "center", width: MAX_W, flexShrink: 0 }, [
          el("div", {
            width: w, height: BAND_H, borderRadius: 4, backgroundImage: CIRCLE_COLOR_STYLE[c].gradient,
            // 현재 단계는 테두리 없이 밝기만으로 구분한다.
            opacity: on ? 1 : isNext ? 0.55 : 0.22,
          }),
        ]),
        el("div", { display: "flex", alignItems: "baseline", gap: 6, width: 190, marginLeft: 14 }, [
          // 글자 크기가 섞여 있어 줄 높이를 모두 1로 맞춰야 기준선이 어긋나지 않는다.
          el("span", { color: on ? INK : isNext ? TEXT : FAINT, fontSize: 11, fontWeight: 700, width: 52, lineHeight: 1 }, msg(`circleColor.${c}`)),
          el("span", { color: on ? TEXT : isNext ? MUTED : FAINT, fontSize: 10, lineHeight: 1 }, msg(RULE_KEYS[c])),
          ...minPointsNote(c, 8, FAINT),
        ]),
      ]);
    }));
  const style = CIRCLE_COLOR_STYLE[stage];
  const info = el("div", { display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: 20, paddingLeft: 20, borderLeft: `1px solid ${BORDER}` }, [
    el("div", { display: "flex", flexDirection: "column", gap: 8 }, [
      el("span", { color: MUTED, fontSize: 11 }, msg("circleCard.progressStage")),
      pill(msg(`circleColor.${stage}`), { backgroundImage: style.gradient, color: style.ink, fontSize: 16, padding: "6px 18px", alignSelf: "flex-start" }),
    ]),
    nextStageBlock(circle, stage),
    ...(circle.myPoints !== undefined
      ? [el("div", { display: "flex", alignItems: "baseline", gap: 8 }, [
          el("span", { color: MUTED, fontSize: 11 }, msg("circleCard.progressMyPoints")),
          el("span", { color: INK, fontFamily: NUM_FONT, fontSize: 15, fontWeight: 700 }, `${fmt(circle.myPoints)} PT`),
        ])]
      : []),
  ]);
  return panel(msg("circleCard.progressTitle"), circle.period ? msg("circleCard.progressMeta", { period: circle.period }) : "", [
    el("div", { display: "flex", alignItems: "center" }, [pyramid, info]),
    ...(circle.neighbors?.length ? [neighborsBlock(circle.neighbors)] : []),
  ]);
}

// 순위 주변: 피라미드 아래에 가로로. 오른쪽으로 갈수록 순위가 높다(바로 아래 · 내 서클 · 바로 위).
// 남의 서클에는 내 서클과의 포인트 차이.
function neighborsBlock(entries: CircleRankEntry[]): El {
  const self = entries.find((e) => e.self);
  return el("div", { display: "flex", flexDirection: "column", marginTop: 14, paddingTop: 12, borderTop: `1px solid ${BORDER}`, gap: 8 }, [
    el("span", { color: MUTED, fontSize: 11 }, msg("circleCard.neighborsTitle")),
    el("div", { display: "flex", gap: 10 }, [...entries].sort((a, b) => b.rank - a.rank).map((e) => el("div", {
      display: "flex", flexDirection: "column", gap: 6, padding: "10px 12px", borderRadius: 10, flex: 1, minWidth: 0,
      border: `1px solid ${BORDER}`, ...(e.self ? { background: SURFACE2 } : {}),
    }, [
      el("span", { color: e.self ? SOFT : MUTED, fontFamily: NUM_FONT, fontSize: 12, fontWeight: 700, lineHeight: 1 }, msg("circleCard.neighborRank", { rank: fmt(e.rank) })),
      el("span", { color: e.self ? INK : TEXT, fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, e.name),
      el("div", { display: "flex", alignItems: "baseline", gap: 8 }, [
        el("span", { color: INK, fontFamily: NUM_FONT, fontSize: 15, fontWeight: 700, lineHeight: 1 }, msg("circleCard.neighborPoints", { points: fmt(e.points) })),
        ...(!e.self && self ? [el("span", { color: FAINT, fontSize: 11, lineHeight: 1 }, signed(e.points - self.points))] : []),
      ]),
    ]))),
  ]);
}

// 1~3위 메달 색(게임 랭킹의 금·은·동)
const MEDAL = ["#f2c94c", "#c3ccd4", "#c77d43"];

function trophyBand(m: CircleMember, maxWidth: number | string | undefined, fontSize: number): El {
  const trophyStyle = TROPHY_STYLE[m.trophyClass] ?? TROPHY_STYLE.normal;
  // 칭호 문구가 비어 있어도(공백 칭호) 게임처럼 등급 색 띠는 보여 준다.
  return pill(m.trophy || "\u00a0", {
    ...trophyStyle, fontSize, padding: "2px 8px", maxWidth: maxWidth ?? 220, minWidth: 0, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
    ...(m.trophy ? {} : { width: 120 }),
  });
}

// 1~3위: 아이콘 왼쪽, 정보 오른쪽, 아래 줄에 포인트·레이팅. 메달색은 칸 위쪽 띠·아이콘 테두리·순위 글자에.
// 위쪽 띠는 border-top 대신 곧은 막대를 깔고 칸의 둥근 모서리로 잘라(overflow hidden) 모서리에서 휘지 않게 한다.
// 1위 칸은 조금 더 넓고 크다. 칸 높이가 달라도 포인트 줄은 칸 아래에 맞춘다.
const MEDAL_LABEL = ["1ST", "2ND", "3RD"];
function podiumCard(m: CircleMember, rank: number, icon: string | null): El {
  const medal = MEDAL[rank - 1];
  const first = rank === 1;
  const size = first ? 72 : 64;
  const label = MEDAL_LABEL[rank - 1];
  const labelSize = first ? 14 : 12;
  const nameSize = first ? 18 : 15;
  return el("div", {
    display: "flex", flexDirection: "column", flex: first ? 1.3 : 1, minWidth: 0,
    borderRadius: 14, background: CANVAS, border: `1px solid ${BORDER}`, overflow: "hidden",
  }, [
    el("div", { height: first ? 4 : 3, background: medal, flexShrink: 0 }),
    el("div", { display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1, gap: 16, padding: 16 }, [
    el("div", { display: "flex", alignItems: "center", gap: 14, minWidth: 0 }, [
      icon
        ? image(icon, { width: size, height: size, borderRadius: 12, objectFit: "cover", border: `2px solid ${medal}`, flexShrink: 0 })
        : el("div", { width: size, height: size, borderRadius: 12, background: SURFACE2, border: `2px solid ${medal}`, flexShrink: 0 }),
      el("div", { display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: 6 }, [
        el("div", { display: "flex", alignItems: "center", gap: 6 }, [
          el("span", { color: medal, fontFamily: NUM_FONT, fontSize: labelSize, fontWeight: 700, letterSpacing: 0.8, lineHeight: 1 }, label),
          m.leader ? pill(msg("circleCard.leader"), { background: ACCENT, color: CANVAS, fontSize: 8, padding: "2px 6px" }) : el("span", {}, ""),
        ]),
        // 전각 영문 이름은 첫 글자 왼쪽 여백만큼 밀려 보여 위 줄(순위)과 잉크 시작을 맞춘다.
        el("span", {
          color: INK, fontSize: nameSize, fontWeight: 700, lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          marginLeft: alignLeftMargin({ text: m.name, size: nameSize }, { text: label, size: labelSize }),
        }, m.name),
        // 남은 폭 안에서만 늘어나게(긴 칭호는 말줄임).
        el("div", { display: "flex", minWidth: 0 }, [trophyBand(m, "100%", 9)]),
      ]),
    ]),
    el("div", { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }, [
      el("span", { color: INK, fontFamily: NUM_FONT, fontSize: first ? 24 : 20, fontWeight: 700, lineHeight: 1 }, msg("circleCard.memberPoints", { points: fmt(m.points) })),
      m.rating ? ratingPlate(m.rating, first ? 0.46 : 0.4) : el("span", {}, ""),
    ]),
    ]),
  ]);
}

// 멤버 포인트 패널: 1~3위 시상대 + 4위 이하 두 열(왼쪽 열을 위에서 아래로 먼저 채운다).
function membersPanel(members: CircleMember[], month: number, icons: (string | null)[]): El {
  if (!members.length) return panel(msg("circleCard.membersTitle"), msg("circleCard.membersMeta", { month }), [el("span", { color: MUTED, fontSize: 12, padding: "12px 0" }, msg("circleCard.membersEmpty"))]);
  const top = members.slice(0, 3);
  const rest = members.slice(3);
  const half = Math.ceil(rest.length / 2);
  const column = (list: CircleMember[], offset: number) =>
    el("div", { display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }, list.map((m, i) => memberRow(m, offset + i + 1)));
  return panel(msg("circleCard.membersTitle"), msg("circleCard.membersMeta", { month }), [
    el("div", { display: "flex", gap: 10 }, top.map((m, i) => podiumCard(m, i + 1, icons[i] ?? null))),
    ...(rest.length
      ? [el("div", { display: "flex", gap: 16, marginTop: 12 }, [column(rest.slice(0, half), 3), column(rest.slice(half), 3 + half)])]
      : []),
  ]);
}

function memberRow(m: CircleMember, rank: number): El {
  return el("div", {
    display: "flex", alignItems: "center", width: "100%", padding: "9px 10px", borderTop: `1px solid ${BORDER}`,
  }, [
    el("span", { width: 26, color: rank <= 3 ? SOFT : FAINT, fontFamily: NUM_FONT, fontSize: 15, fontWeight: 700, flexShrink: 0 }, String(rank)),
    el("div", { display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: 4 }, [
      el("div", { display: "flex", alignItems: "center", gap: 6, minWidth: 0 }, [
        el("span", { color: INK, fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 1, minWidth: 0 }, m.name),
        m.leader ? pill(msg("circleCard.leader"), { background: ACCENT, color: CANVAS, fontSize: 8, padding: "2px 6px" }) : el("span", {}, ""),
      ]),
      // 가로 flex 로 감싸 띠가 열 너비만큼 늘어나지 않게 한다.
      el("div", { display: "flex" }, [trophyBand(m, undefined, 9)]),
    ]),
    el("div", { display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0, marginLeft: 8, gap: 3 }, [
      el("span", { color: INK, fontFamily: NUM_FONT, fontSize: 15, fontWeight: 700, lineHeight: 1 }, msg("circleCard.memberPoints", { points: fmt(m.points) })),
      el("span", { color: MUTED, fontSize: 10 }, m.rating ? msg("circleCard.memberRating", { rating: m.rating }) : " "),
    ]),
  ]);
}

export async function renderCircleCard(circle: CircleInfo, profile: CachedProfile, opts: { translate?: boolean } = {}): Promise<Buffer> {
  const translate = !!opts.translate;
  const cacheKey = [profile.profileKey, profile.lastSyncedAt, translate ? 1 : 0, CIRCLE_CARD_VERSION, cardTextSignature()].join("|");
  const memo = circleCardCache.get(cacheKey);
  if (memo) return memo;

  const forecastTitle = circle.forecastJacket ? getTitleByJacket(circle.forecastJacket) : null;
  // 동점이면 DX NET 순서(리더가 맨 앞)를 유지한다.
  const members = circle.members.map((m, i) => ({ m, i })).sort((a, b) => b.m.points - a.m.points || a.i - b.i).map(({ m }) => m);
  const topIcons = await Promise.all(members.slice(0, 3).map((m) => (m.icon ? remoteDataUrl(m.icon) : Promise.resolve(null))));
  const [challengeJacket, forecastJacket] = await Promise.all([
    circle.challenge ? jacketData(circle.challenge.jacket, circle.challenge.title) : Promise.resolve(null),
    circle.forecastJacket ? jacketData(circle.forecastJacket, forecastTitle) : Promise.resolve(null),
  ]);

  const serverLabel = profile.server === "jp" ? "JP" : "INTERNATIONAL";
  const colorStyle = circle.color ? CIRCLE_COLOR_STYLE[circle.color] : null;
  const eyebrow = msg("circleCard.eyebrow", { server: serverLabel });
  const synced = new Date(profile.lastSyncedAt);
  const month = Number(synced.toLocaleString("en-US", { timeZone: "Asia/Seoul", month: "numeric" }));
  const reset = circle.daysToReset === null ? undefined : circle.daysToReset === 0 ? msg("circleCard.resetToday") : msg("circleCard.resetDays", { days: circle.daysToReset });

  const width = 920;
  const root = el("div", {
    display: "flex", flexDirection: "column", width,
    background: CANVAS, padding: 24, color: TEXT, fontFamily: "Noto Sans JP",
  }, [
    // 헤더. 서클 색상이 있으면 아래 경계선을 그 색 띠로.
    el("div", { display: "flex", alignItems: "flex-start", paddingBottom: 18, ...(colorStyle ? {} : { borderBottom: `1px solid ${BORDER}` }) }, [
      el("div", { display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: 8 }, [
        el("span", { color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.4 }, eyebrow),
        el("span", {
          color: INK, fontSize: 30, fontWeight: 800, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          marginLeft: alignLeftMargin({ text: circle.name, size: 30 }, { text: eyebrow, size: 10 }),
        }, circle.name),
        el("div", { display: "flex", alignItems: "center", gap: 10 }, [
          // 서클 프로필 색상 이름표(게임의 이름판 색)
          colorStyle ? pill(msg(`circleColor.${circle.color!}`), { backgroundImage: colorStyle.gradient, color: colorStyle.ink, fontSize: 11, padding: "4px 12px", letterSpacing: 0.4 }) : el("span", {}, ""),
          circle.code ? pill(msg("circleCard.code", { code: circle.code }), { background: SURFACE2, color: TEXT, fontSize: 11, padding: "4px 11px", letterSpacing: 0.6 }) : el("span", {}, ""),
          circle.comment ? el("span", { color: MUTED, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 560 }, circle.comment) : el("span", {}, ""),
        ]),
      ]),
      wordmark(),
    ]),
    ...(colorStyle ? [el("div", { height: 3, borderRadius: 99, backgroundImage: colorStyle.gradient })] : []),
    statsPanel([
      { value: circle.monthPoints === null ? "—" : fmt(circle.monthPoints), label: msg("circleCard.monthPoints", { month }), sub: reset },
      { value: circle.rank === null ? "—" : msg("circleCard.rankValue", { rank: fmt(circle.rank) }), label: msg("circleCard.rank"), sub: circle.rankUpdatedAt ? msg("circleCard.rankUpdated", { time: circle.rankUpdatedAt }) : undefined },
      { value: circle.nextRewardPoints === null ? "—" : fmt(circle.nextRewardPoints), label: msg("circleCard.nextReward") },
      { value: circle.memberCount === null ? "—" : `${circle.memberCount}/${circle.memberMax ?? "?"}`, label: msg("circleCard.members") },
    ]),
    ...(circle.progress ? [progressPanel(circle, circle.progress)] : []),
    ...(circle.challenge
      ? [challengePanel(circle, translate, challengeJacket, circle.forecastJacket ? { title: forecastTitle, jacket: forecastJacket } : null)]
      : []),
    membersPanel(members, month, topIcons),
    // 푸터
    el("div", { display: "flex", justifyContent: "space-between", marginTop: 14, color: MUTED, fontSize: 11 }, [
      el("span", {}, msg("circleCard.syncedBy", { player: profile.playerName || "—" })),
      el("span", {}, msg("card.lastSynced", { time: kstStamp(profile.lastSyncedAt) })),
    ]),
  ]);

  const png = await renderInWorker(root, width);
  if (circleCardCache.size >= CIRCLE_CARD_CACHE_MAX) {
    const oldest = circleCardCache.keys().next().value;
    if (oldest !== undefined) circleCardCache.delete(oldest);
  }
  circleCardCache.set(cacheKey, png);
  return png;
}
