// 히스토리 선 그래프(/프로필 카드·/히스토리 카드 공용). maishift 히스토리 내보내기 그림과 같은 구성:
// 계단 모양 선, 축 두 개(시리즈별 왼쪽/오른쪽 축, 또는 같은 눈금에 다른 라벨), 월 단위 가로 눈금, 버전별 색 표시선.
// 선·격자는 SVG 이미지로 그리고(resvg 가 벡터로 렌더), 축 라벨·값은 satori 텍스트로 올린다
// (중첩 SVG 안의 text 는 글꼴을 못 찾을 수 있어서). 실측끼리 잇는 구간은 실선, 추정이 끼면 점선.
// 값은 다음 측정 전까지 그대로이므로 계단 모양(가로로 이어 가다 다음 점에서 세로로)으로 그린다. 점은 찍지 않는다.
import { BRAND } from "../../brand";
import { ACCENT, BORDER, FAINT, NUM_FONT, type El, el, image } from "./cardKit";
import { msg } from "../../messages";

export const CHART_W = 840;   // 패널 안쪽 폭
const AXIS_W = 40;            // 눈금 라벨 칸
const GAP = 6;
const PAD_X = 8;
const PAD_Y = 14;

export interface ChartPoint { day: string; value: number; estimated?: boolean }
export interface ChartSeries {
  values: ChartPoint[];
  color: string;
  /** 선 아래를 옅게 채운다 */
  fill?: boolean;
  /** 오른쪽 축(자기 눈금)에 그린다. 없으면 왼쪽 축. */
  axis?: "left" | "right";
}
export interface ChartOpts {
  height: number;
  /** 0 부터 시작하는 축 */
  fromZero?: boolean;
  /** 버전 표시(그 버전으로 처음 올린 날) */
  updates?: { day: string; label: string }[];
  /** 마지막 값을 선 위에 숫자로 */
  lastLabel?: boolean;
  /** 마지막 측정 이후에도 값이 그대로였으므로 이 날까지 선을 잇는다 */
  extendTo?: string;
  /** 왼쪽 축만 쓰는 그래프에서, 같은 눈금을 오른쪽에 다른 값으로도 적는다(예: 레이팅 ÷ 50 = 곡 평균) */
  mirror?: { left: (v: number) => string; right: (v: number) => string };
}

export function niceStep(range: number): number {
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000, 20000, 50000];
  return steps.find((s) => range / s <= 4) ?? 50000;
}

/** 버전 표시선 색. 세대마다 하나, 모르면 흐린 색. */
export function versionColor(label: string): string {
  const table: [RegExp, string][] = [
    [/MAGiCAL/i, "#a78bfa"], [/CiRCLE/i, "#f472b6"], [/PRiSM/i, "#60a5fa"], [/BUDDiES/i, "#fb923c"],
    [/FESTiVAL/i, "#facc15"], [/UNiVERSE/i, "#34d399"], [/Splash/i, "#38bdf8"],
  ];
  return table.find(([re]) => re.test(label))?.[1] ?? BRAND.muted;
}

export function lineSwatch(color: string, label: string): El {
  return el("div", { display: "flex", alignItems: "center", gap: 6 }, [
    el("div", { width: 14, height: 2.5, borderRadius: 2, background: color }),
    el("span", {}, label),
  ]);
}

export function dashedSwatch(): El {
  return el("div", { display: "flex", gap: 3 }, [0, 1, 2].map(() => el("div", { width: 5, height: 2, background: ACCENT, opacity: 0.8 })));
}

interface Scale { min: number; max: number; ticks: number[] }
function scaleOf(values: number[], fromZero: boolean): Scale {
  const lo = fromZero ? 0 : Math.min(...values), hi = Math.max(...values);
  const step = niceStep(Math.max(hi - lo, 8) * (fromZero ? 1.1 : 1.3));
  const min = fromZero ? 0 : Math.floor((lo - step * 0.3) / step) * step;
  const max = Math.max(min + step, Math.ceil((hi + (fromZero ? 0 : step * 0.3)) / step) * step);
  const ticks: number[] = [];
  for (let t = min; t <= max + 1e-9; t += step) ticks.push(t);
  return { min, max, ticks };
}

/** 가로 눈금: 75일보다 길면 매달 1일(많으면 몇 달 건너), 짧으면 날짜. 1월은 연도로 적는다. */
function xTicks(days: string[], firstI: number, lastI: number): { day: string; label: string }[] {
  const range = days.slice(firstI, lastI + 1);
  if (lastI - firstI > 75) {
    const months = range.filter((d) => d.endsWith("-01"));
    const every = Math.max(1, Math.ceil(months.length / 9));
    return months
      .filter((d) => (Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7)) - 1) % every === 0)
      .map((d) => ({ day: d, label: d.slice(5, 7) === "01" ? msg("historyChart.year", { year: d.slice(0, 4) }) : msg("historyChart.month", { month: Number(d.slice(5, 7)) }) }));
  }
  const every = Math.max(1, Math.ceil((lastI - firstI) / 7));
  const out: { day: string; label: string }[] = [];
  for (let i = firstI; i <= lastI; i += every) out.push({ day: days[i], label: `${Number(days[i].slice(5, 7))}.${Number(days[i].slice(8, 10))}` });
  return out;
}

/**
 * 날짜를 가로축으로 하는 선 그래프. 가로축은 첫 시리즈의 첫 점 ~ 마지막 점(extendTo 가 있으면 그날까지).
 * 같은 days·같은 점 날짜로 그리면 여러 패널의 가로축이 위아래로 맞는다.
 */
export function lineChart(days: string[], series: ChartSeries[], opts: ChartOpts): El {
  const index = new Map(days.map((d, i) => [d, i]));
  // 마지막 측정 뒤로 선을 잇는다(값은 그대로).
  const extended = series.map((s) => {
    const last = s.values[s.values.length - 1];
    return opts.extendTo && last && opts.extendTo > last.day ? { ...s, values: [...s.values, { ...last, day: opts.extendTo, estimated: last.estimated }] } : s;
  });
  const main = extended[0].values;
  const hasRight = extended.some((s) => s.axis === "right") || !!opts.mirror;
  const plotW = CHART_W - AXIS_W * (hasRight ? 2 : 1) - GAP * (hasRight ? 2 : 1);
  const firstI = index.get(main[0].day) ?? 0;
  const lastI = index.get(main[main.length - 1].day) ?? firstI;
  const span = Math.max(1, lastI - firstI);
  const single = main.length === 1;
  const xOf = (day: string) => single ? plotW / 2 : PAD_X + (((index.get(day) ?? firstI) - firstI) / span) * (plotW - 2 * PAD_X);

  const H = opts.height;
  const left = scaleOf(extended.filter((s) => s.axis !== "right").flatMap((s) => s.values.map((v) => v.value)), !!opts.fromZero);
  const rightValues = extended.filter((s) => s.axis === "right").flatMap((s) => s.values.map((v) => v.value));
  const right = rightValues.length ? scaleOf(rightValues, !!opts.fromZero) : null;
  const yOf = (sc: Scale) => (v: number) => PAD_Y + (1 - (v - sc.min) / (sc.max - sc.min)) * (H - 2 * PAD_Y);
  const yLeft = yOf(left), yRight = right ? yOf(right) : yLeft;

  const ticksX = single ? [] : xTicks(days, firstI, lastI);
  const svg: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${plotW}" height="${H}" viewBox="0 0 ${plotW} ${H}">`,
    ...left.ticks.map((t) => `<line x1="0" x2="${plotW}" y1="${yLeft(t).toFixed(1)}" y2="${yLeft(t).toFixed(1)}" stroke="${BORDER}" stroke-width="1"/>`),
    ...ticksX.map((t) => `<line x1="${xOf(t.day).toFixed(1)}" x2="${xOf(t.day).toFixed(1)}" y1="0" y2="${H}" stroke="${BORDER}" stroke-width="1" stroke-dasharray="3 4"/>`),
  ];
  extended.forEach((s, si) => {
    const y = s.axis === "right" ? yRight : yLeft;
    const pts = s.values.map((v) => ({ ...v, x: +xOf(v.day).toFixed(1), y: +y(v.value).toFixed(1) }));
    if (pts.length < 2) return;
    if (s.fill) {
      const bottom = (s.axis === "right" ? yRight(right!.min) : yLeft(left.min)).toFixed(1);
      svg.push(`<defs><linearGradient id="fill${si}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.color}" stop-opacity="0.22"/><stop offset="1" stop-color="${s.color}" stop-opacity="0"/></linearGradient></defs>`);
      const steps = pts.map((p, i) => (i ? `L${p.x},${pts[i - 1].y} L${p.x},${p.y}` : `L${p.x},${p.y}`)).join(" ");
      svg.push(`<path d="M${pts[0].x},${bottom} ${steps} L${pts[pts.length - 1].x},${bottom} Z" fill="url(#fill${si})"/>`);
    }
    // 실측 구간은 한 줄(path)로, 추정이 낀 구간만 점선으로 따로 그린다.
    let solid = `M${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if (a.estimated || b.estimated) {
        svg.push(`<path d="M${a.x},${a.y} L${b.x},${a.y} L${b.x},${b.y}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-dasharray="6 5" stroke-opacity="0.75"/>`);
        solid += ` M${b.x},${b.y}`;
      } else {
        solid += ` L${b.x},${a.y} L${b.x},${b.y}`;
      }
    }
    svg.push(`<path d="${solid}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="miter" stroke-linecap="square"/>`);
  });
  // 버전 표시: 그래프에 보이는 기간 안에 있을 때만. 이름은 가로축 아래에 같은 색으로.
  const firstDay = main[0].day, lastDay = main[main.length - 1].day;
  const marks = single ? [] : (opts.updates ?? []).filter((u) => u.day > firstDay && u.day <= lastDay).map((u) => ({ ...u, x: +xOf(u.day).toFixed(1), color: versionColor(u.label) }));
  for (const m of marks) svg.push(`<line x1="${m.x}" x2="${m.x}" y1="0" y2="${H}" stroke="${m.color}" stroke-width="1.5" stroke-opacity="0.85"/>`);
  svg.push("</svg>");
  const svgUrl = `data:image/svg+xml;base64,${Buffer.from(svg.join("")).toString("base64")}`;

  const fmt = (v: number) => (v >= 10000 ? `${+(v / 1000).toFixed(1)}k` : String(v));
  const axisCol = (ticks: number[], y: (v: number) => number, label: (v: number) => string, align: "left" | "right", color: string = FAINT) =>
    el("div", { display: "flex", position: "relative", width: AXIS_W, height: H, flexShrink: 0 }, ticks.map((t) =>
      el("span", { position: "absolute", [align]: 0, top: y(t) - 6, color, fontFamily: NUM_FONT, fontSize: 10, lineHeight: 1 }, label(t))));
  const rightSeries = extended.find((s) => s.axis === "right");
  const lastMain = main[main.length - 1];
  const lastX = xOf(lastMain.day), lastY = yLeft(lastMain.value);

  // 그래프 아래 라벨 줄(가로 눈금·버전 이름). 왼쪽 축 폭까지 포함한 한 영역에서 x 를 직접 계산해 그래프와 맞춘다.
  const offset = AXIS_W + GAP;
  const below = (items: { x: number; label: string; color: string; bold?: boolean }[]) =>
    el("div", { display: "flex", position: "relative", height: 14, width: CHART_W }, items.map((it) =>
      // 글자 가운데가 x 에 오도록 고정 폭 상자 안에서 가운데 정렬(span 의 textAlign 은 먹지 않는다).
      el("div", { display: "flex", justifyContent: "center", position: "absolute", top: 0, left: offset + Math.max(-offset, Math.min(CHART_W - offset - 72, it.x - 36)), width: 72 }, [
        el("span", { color: it.color, fontSize: 10, fontWeight: it.bold ? 700 : 400, lineHeight: 1, whiteSpace: "nowrap" }, it.label),
      ])));

  return el("div", { display: "flex", flexDirection: "column" }, [
    el("div", { display: "flex", gap: GAP }, [
      axisCol(left.ticks, yLeft, opts.mirror?.left ?? fmt, "right"),
      el("div", { display: "flex", position: "relative", width: plotW, height: H }, [
        image(svgUrl, { width: plotW, height: H }),
        ...(opts.lastLabel ? [el("span", {
          position: "absolute", top: Math.max(0, lastY - 20), left: Math.max(0, Math.min(plotW - 56, lastX - 50)), width: 56, textAlign: "right",
          color: extended[0].color, fontFamily: NUM_FONT, fontSize: 13, fontWeight: 700, lineHeight: 1,
        }, String(lastMain.value))] : []),
      ]),
      ...(opts.mirror ? [axisCol(left.ticks, yLeft, opts.mirror.right, "left")] : []),
      ...(right ? [axisCol(right.ticks, yRight, fmt, "left", rightSeries?.color ?? FAINT)] : []),
    ]),
    el("div", { display: "flex", marginTop: 6 }, [below(ticksX.map((t) => ({ x: xOf(t.day), label: t.label, color: FAINT })))]),
    ...(marks.length ? [el("div", { display: "flex", marginTop: 4 }, [below(marks.map((m) => ({ x: m.x, label: m.label, color: m.color, bold: true })))])] : []),
  ]);
}
