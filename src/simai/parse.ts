// maidata.txt (simai) 파서.
//
// 문법 레퍼런스는 simai 위키(w.atwiki.jp/simai)지만 Cloudflare 로 막혀 있어,
// 실제로 유통되는 채보가 쓰는 표기를 기준으로 맞췄다. 위키에 없는 관용 표기
// (`*` 분기 슬라이드, `[bpm#x:y]`, `[delay##dur]`, `` ` `` 의사 EACH)까지 받는다.
//
// 파싱은 서버에서만 한다. 브라우저 플레이어에는 결과 Chart 를 JSON 으로 넘긴다.

import type {
  Chart, ChartNote, ChartStats, BpmEvent, Maidata,
  SlideBody, SlideSegment, SlideType, TouchArea,
} from "./types";

/** 한 마디 = 4박(4분음표 4개). beat 필드의 단위. */
const MEASURE_BEATS = 4;
/** 슬라이드 구간 문자. `V` 는 뒤에서 `-` 두 개로 분해한다. */
const SLIDE_CHARS = "-><^vpqszVw";

/** 채보가 비정상적으로 길 때(무한루프성 입력) 멈추는 상한. */
const MAX_NOTES = 20000;

// ── 헤더 ────────────────────────────────────────────────────────────────────

/**
 * `&key=value` 블록으로 쪼갠다. 값은 다음 `&key=` 줄을 만날 때까지 이어진다
 * (`&inote_4=` 는 본문이 수백 줄이라 반드시 여러 줄을 먹어야 한다).
 */
function splitBlocks(text: string): Map<string, string> {
  const out = new Map<string, string>();
  let key = "";
  let buf: string[] = [];
  const flush = () => { if (key) out.set(key, buf.join("\n")); };
  for (const line of text.split(/\r?\n/)) {
    const m = /^&([A-Za-z0-9_]+)\s*=(.*)$/.exec(line);
    if (m) {
      flush();
      key = m[1].toLowerCase();
      buf = [m[2]];
    } else if (key) {
      buf.push(line);
    }
  }
  flush();
  return out;
}

/** simai 주석은 `||` 부터 줄 끝까지. 공백 제거 전에 먼저 걷어내야 한다. */
function stripComments(text: string): string {
  return text.split(/\r?\n/).map((l) => {
    const at = l.indexOf("||");
    return at === -1 ? l : l.slice(0, at);
  }).join("\n");
}

function num(value: string | undefined, fallback: number): number {
  const n = Number((value ?? "").trim());
  return Number.isFinite(n) ? n : fallback;
}

// ── 길이 표기 ───────────────────────────────────────────────────────────────

interface Length {
  /** 별이 뜬 뒤 궤적이 움직이기 시작할 때까지(ms). 슬라이드에서만 의미 있다. */
  delayMs: number;
  durationMs: number;
}

/**
 * `[...]` 안의 길이 표기를 ms 로 바꾼다.
 *
 * - `[8:1]`        현재 BPM 기준 온음표의 1/8
 * - `[160#8:1]`    BPM 을 160 으로 보고 계산
 * - `[#2.5]`       2.5초 (절대)
 * - `[1.5##2.5]`   대기 1.5초 + 길이 2.5초 (슬라이드)
 * - `[8:1##2.5]`   대기는 박 계산, 길이는 2.5초 (슬라이드)
 *
 * 브래킷이 여러 개면(분할 슬라이드의 구간별 길이) 박 길이를 모두 더한다.
 */
function parseLength(raw: string, bpm: number): Length {
  const beatMs = 60000 / bpm;

  // [delay##duration] — 둘 다 초 단위
  const abs2 = /\[([\d.]+)##([\d.]+)\]/.exec(raw);
  if (abs2) return { delayMs: Number(abs2[1]) * 1000, durationMs: Number(abs2[2]) * 1000 };

  // [#sec] — 길이만 초 단위
  const abs1 = /\[#([\d.]+)\]/.exec(raw);
  if (abs1) return { delayMs: beatMs, durationMs: Number(abs1[1]) * 1000 };

  const ratios = [...raw.matchAll(/\[(?:([\d.]+)#)?([\d.]+):([\d.]+)(?:##([\d.]+))?\]/g)];
  if (ratios.length === 0) return { delayMs: beatMs, durationMs: beatMs };

  let bpmOverride: number | null = null;
  let customMs: number | null = null;
  let beats = 0;
  for (const r of ratios) {
    if (r[1] && bpmOverride === null) bpmOverride = Number(r[1]);
    if (r[4] && customMs === null) customMs = Number(r[4]) * 1000;
    const den = Number(r[2]);
    const numr = Number(r[3]);
    if (den > 0) beats += (MEASURE_BEATS / den) * numr;
  }
  const useBpm = bpmOverride ?? bpm;
  const oneBeat = 60000 / useBpm;
  return {
    delayMs: oneBeat,
    durationMs: customMs !== null ? customMs : oneBeat * beats,
  };
}

// ── 슬라이드 궤적 ───────────────────────────────────────────────────────────

/**
 * `-5`, `>7`, `V35`, `qq2` 처럼 이어진 궤적 표기를 구간 목록으로 푼다.
 * 구간이 여러 개면 앞 구간의 도착점이 다음 구간의 출발점이 된다.
 */
export function parseSegments(start: number, spec: string): SlideSegment[] {
  const out: SlideSegment[] = [];
  let from = start;
  let i = 0;
  while (i < spec.length) {
    const ch = spec[i];
    let type: string;
    if ((ch === "p" || ch === "q") && spec[i + 1] === ch) {
      type = ch + ch;           // pp / qq (바깥쪽으로 크게 도는 곡선)
      i += 2;
    } else if (SLIDE_CHARS.includes(ch)) {
      type = ch;
      i += 1;
    } else {
      i += 1;                   // 알 수 없는 문자는 버린다
      continue;
    }
    let digits = "";
    while (i < spec.length && spec[i] >= "0" && spec[i] <= "9") digits += spec[i++];
    if (!digits) continue;

    if (type === "V") {
      // `V` 는 "꺾어서 두 번 직선". 1V35 = 1→3→5.
      if (digits.length < 2) continue;
      const mid = Number(digits[0]);
      const end = Number(digits.slice(1));
      out.push({ type: "-", from, to: mid });
      out.push({ type: "-", from: mid, to: end });
      from = end;
    } else {
      const end = Number(digits);
      out.push({ type: type as SlideType, from, to: end });
      from = end;
    }
  }
  return out;
}

// ── 노트 ────────────────────────────────────────────────────────────────────

const RE_HOLD = /^(\d)[bx]*h[bx]*((?:\[[^\]]*\])?)[bx]*$/i;
const RE_SLIDE = new RegExp(`^(\\d)([bx]*[${SLIDE_CHARS}*].*)$`, "i");
const RE_TOUCH = /^([ABCDE])(\d*)([hbfx]*)((?:\[[^\]]*\])?)$/i;
const RE_TAP = /^(\d)[bx]*$/i;

interface Ctx {
  bpm: number;
  beat: number;
  timeMs: number;
  isEach: boolean;
  notes: ChartNote[];
}

/** 터치 영역 번호가 유효한지. C 는 번호가 없거나 1/2, 나머지는 1~8. */
function validTouch(area: string, n: number | null): boolean {
  if (area === "C") return n === null || n === 1 || n === 2;
  return n !== null && n >= 1 && n <= 8;
}

function pushNote(ctx: Ctx, note: ChartNote): void {
  if (ctx.notes.length >= MAX_NOTES) return;
  ctx.notes.push(note);
}

/** 그룹 안의 노트 하나(`/` 나 `` ` `` 로 쪼갠 단위)를 해석한다. */
function parseNote(raw: string, ctx: Ctx, timeMs: number): void {
  // l/r 은 "어느 손으로 치는지" 힌트라 판정과 무관하다. 먼저 걷어낸다.
  const text = raw.replace(/[lr]/gi, "").trim();
  if (!text) return;

  const base = {
    timeMs,
    beat: ctx.beat,
    area: "" as TouchArea,
    ...(ctx.isEach ? { isEach: true as const } : {}),
  };

  // HOLD — 1h[4:1]
  const hold = RE_HOLD.exec(text);
  if (hold) {
    const pos = Number(hold[1]);
    if (pos < 1 || pos > 8) return;
    const { durationMs } = parseLength(hold[2], ctx.bpm);
    pushNote(ctx, {
      ...base, type: "hold", pos, durationMs,
      ...(/b/i.test(text) ? { isBreak: true as const } : {}),
      ...(/x/i.test(text) ? { isEx: true as const } : {}),
    });
    return;
  }

  // SLIDE — 1-5[8:1] / 1b-5[8:1] / 1-5[8:1]*-3[8:1]
  const slide = RE_SLIDE.exec(text);
  if (slide && new RegExp(`[${SLIDE_CHARS}]`).test(slide[2])) {
    const pos = Number(slide[1]);
    if (pos < 1 || pos > 8) return;
    const bodies: SlideBody[] = [];
    for (const part of slide[2].split("*")) {
      const spec = part.replace(/\[[^\]]*\]/g, "").replace(/[bx]/gi, "");
      const segments = parseSegments(pos, spec);
      if (segments.length === 0) continue;
      const { delayMs, durationMs } = parseLength(part, ctx.bpm);
      // 궤적 BREAK 는 도착 숫자 뒤(`1-5b[8:1]`) 또는 브래킷 뒤(`1-5[8:1]b`)에 붙는다.
      const isBreak = new RegExp(`[${SLIDE_CHARS}]\\d*b`, "i").test(part) || /\]b/i.test(part);
      bodies.push({ segments, delayMs, durationMs, isBreak });
    }
    if (bodies.length === 0) return;
    // 별 자체가 BREAK 인 경우는 시작 숫자 바로 뒤에 b 가 온다 (`1b-5`).
    const starBreak = new RegExp(`^\\d[x]*b[x]*[${SLIDE_CHARS}]`, "i").test(text);
    pushNote(ctx, {
      ...base, type: "slide", pos, slides: bodies,
      ...(starBreak ? { isBreak: true as const } : {}),
      ...(/^\d[bx]*x/i.test(text) ? { isEx: true as const } : {}),
    });
    return;
  }

  // 동시 탭 축약 — `15` = 1번 + 5번
  if (/^\d{2,}$/.test(text)) {
    const digits = text.split("").map(Number);
    if (digits.every((d) => d >= 1 && d <= 8)) {
      for (const d of digits) {
        pushNote(ctx, { ...base, type: "tap", pos: d, isEach: true });
      }
      return;
    }
  }

  // TOUCH — A1 / C / E4f / B2h[4:1]
  const touch = RE_TOUCH.exec(text);
  if (touch) {
    const area = touch[1].toUpperCase() as Exclude<TouchArea, "">;
    const n = touch[2] ? Number(touch[2]) : null;
    if (!validTouch(area, n)) return;
    const flags = (touch[3] ?? "").toLowerCase();
    const note: ChartNote = {
      ...base,
      type: flags.includes("h") ? "touchHold" : "touch",
      pos: n ?? 1,
      area,
      ...(flags.includes("f") ? { hasFirework: true as const } : {}),
    };
    if (note.type === "touchHold") note.durationMs = parseLength(touch[4], ctx.bpm).durationMs;
    pushNote(ctx, note);
    return;
  }

  // TAP — 1 / 3b / 5x
  const tap = RE_TAP.exec(text);
  if (tap) {
    const pos = Number(tap[1]);
    if (pos < 1 || pos > 8) return;
    pushNote(ctx, {
      ...base,
      type: "tap",
      pos,
      ...(/b/i.test(text) ? { isBreak: true as const } : {}),
      ...(/x/i.test(text) ? { isEx: true as const } : {}),
    });
  }
}

/**
 * 한 박에 놓인 노트 묶음(`1/5`, ``3`4``, `15`)을 해석한다.
 * `` ` `` 는 "의사 EACH" — 동시가 아니라 아주 살짝 뒤에 친다는 뜻이라 1ms 씩 민다.
 */
function parseGroup(text: string, ctx: Ctx): void {
  const parts: { text: string; offset: number }[] = [];
  let cur = "";
  let offset = 0;
  const push = () => { if (cur.trim()) parts.push({ text: cur.trim(), offset }); cur = ""; };
  for (const ch of text) {
    if (ch === "/") { push(); }
    else if (ch === "`") { push(); offset++; }
    else cur += ch;
  }
  push();
  if (parts.length === 0) return;
  ctx.isEach = parts.length > 1;
  for (const p of parts) parseNote(p.text, ctx, ctx.timeMs + p.offset);
}

// ── 본문 ────────────────────────────────────────────────────────────────────

/** `&inote_N=` 본문 하나를 타임라인으로 바꾼다. */
export function parseInote(src: string, defaultBpm: number, offsetSec = 0): Chart {
  const body = stripComments(src).replace(/\s+/g, "");
  const notes: ChartNote[] = [];
  const bpmEvents: BpmEvent[] = [];
  let bpm = defaultBpm > 0 ? defaultBpm : 120;
  let firstBpm: number | null = null;
  let divisor = 4;
  let stepSec = 0;      // {#sec} 지정 시 > 0 (한 칸이 절대 시간)
  let beat = 0;
  let timeMs = offsetSec * 1000;
  let i = 0;

  while (i < body.length) {
    const rest = body.slice(i);

    // (BPM)
    const mb = /^\((\d+(?:\.\d+)?)\)/.exec(rest);
    if (mb) {
      bpm = Number(mb[1]);
      if (firstBpm === null) firstBpm = bpm;
      bpmEvents.push({ beat, timeMs, bpm });
      i += mb[0].length;
      continue;
    }
    // {분할} 또는 {#초}
    const md = /^\{(#?)(\d+(?:\.\d+)?)\}/.exec(rest);
    if (md) {
      if (md[1]) stepSec = Number(md[2]);
      else { divisor = Number(md[2]) || 4; stepSec = 0; }
      i += md[0].length;
      continue;
    }

    // 다음 구분자까지가 이번 박의 노트 묶음
    let group = "";
    while (i < body.length && body[i] !== "," && body[i] !== "(" && body[i] !== "{") {
      group += body[i];
      i++;
    }

    if (group === "E") break;        // 채보 종료 마커
    if (group) {
      parseGroup(group, { bpm, beat, timeMs, isEach: false, notes });
    } else if (i < body.length && body[i] !== ",") {
      i++;                           // 해석 못 한 문자는 버리고 전진 (무한루프 방지)
      continue;
    }

    if (body[i] === ",") {
      const stepBeats = MEASURE_BEATS / divisor;
      timeMs += stepSec > 0 ? stepSec * 1000 : (60000 / bpm) * stepBeats;
      beat += stepBeats;
      i++;
    }
  }

  notes.sort((a, b) => a.timeMs - b.timeMs);
  if (firstBpm === null) firstBpm = bpm;
  if (bpmEvents.length === 0) bpmEvents.push({ beat: 0, timeMs: offsetSec * 1000, bpm: firstBpm });

  return {
    notes,
    bpmEvents,
    bpm: firstBpm,
    durationMs: endOf(notes),
    measures: Math.max(1, Math.ceil(beat / MEASURE_BEATS)),
    stats: countStats(notes),
  };
}

/** 마지막 노트가 완전히 끝나는 시각. 홀드/슬라이드는 꼬리까지 센다. */
function endOf(notes: ChartNote[]): number {
  let end = 0;
  for (const n of notes) {
    let t = n.timeMs + (n.durationMs ?? 0);
    for (const s of n.slides ?? []) t = Math.max(t, n.timeMs + s.delayMs + s.durationMs);
    if (t > end) end = t;
  }
  return end;
}

/**
 * maimai 의 노트 수 표기에 맞춘다: BREAK 는 TAP/HOLD/SLIDE 에서 빼고 따로 센다.
 * 터치 홀드는 HOLD 가 아니라 별도로 둬서 필요하면 합칠 수 있게 한다.
 */
function countStats(notes: ChartNote[]): ChartStats {
  const s: ChartStats = { tap: 0, hold: 0, slide: 0, touch: 0, touchHold: 0, break: 0, total: 0 };
  for (const n of notes) {
    if (n.type === "slide") {
      for (const body of n.slides ?? []) {
        if (body.isBreak) s.break++; else s.slide++;
      }
      // 슬라이드의 별은 BREAK 일 때만 따로 센다(일반 별은 궤적에 포함).
      if (n.isBreak) s.break++;
      continue;
    }
    if (n.isBreak) { s.break++; continue; }
    if (n.type === "tap") s.tap++;
    else if (n.type === "hold") s.hold++;
    else if (n.type === "touch") s.touch++;
    else if (n.type === "touchHold") s.touchHold++;
  }
  s.total = s.tap + s.hold + s.slide + s.touch + s.touchHold + s.break;
  return s;
}

// ── 파일 전체 ───────────────────────────────────────────────────────────────

/** maidata.txt 한 장을 파싱한다. 난이도 본문이 하나도 없으면 charts 가 빈 객체. */
export function parseMaidata(text: string): Maidata {
  const blocks = splitBlocks(text);
  const get = (k: string) => (blocks.get(k) ?? "").trim();

  const wholeBpm = num(get("wholebpm"), 0);
  const offsetSec = num(get("first"), 0);
  const commonDes = get("des");

  const designers: Record<number, string> = {};
  const levels: Record<number, string> = {};
  const charts: Record<number, Chart> = {};

  for (let d = 1; d <= 7; d++) {
    const lv = get(`lv_${d}`);
    if (lv) levels[d] = lv;
    const des = get(`des_${d}`) || commonDes;
    if (des) designers[d] = des;
    const inote = blocks.get(`inote_${d}`);
    if (inote && inote.trim()) charts[d] = parseInote(inote, wholeBpm, offsetSec);
  }

  const firstChart = Object.values(charts)[0];
  return {
    title: get("title"),
    artist: get("artist"),
    designers,
    levels,
    bpm: wholeBpm > 0 ? wholeBpm : (firstChart?.bpm ?? 0),
    offsetSec,
    charts,
  };
}
