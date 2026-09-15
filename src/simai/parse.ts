// maidata.txt (simai語) 파서.
//
// 문법 근거는 Celeca 가 정의한 공식 사양서 "simai語の譜面書式"
// (https://w.atwiki.jp/simai/pages/1002.html). 거기 정의된 표기만 취급한다.
//
// 파싱은 서버에서만 한다. 브라우저 플레이어에는 결과 Chart 를 JSON 으로 넘긴다.

import type {
  Chart, ChartNote, ChartStats, BpmEvent, Maidata,
  SlideBody, SlideGroup, SlideSegment, SlideType, TouchArea,
} from "./types";

/** 한 마디 = 4박(4분음표 4개). beat 필드의 단위. */
const MEASURE_BEATS = 4;
/** 슬라이드 구간 문자. `V` 는 뒤에서 `-` 두 개로 분해한다. */
const SLIDE_CHARS = "-><^vpqszVw";
/** 채보가 비정상적으로 길 때(무한루프성 입력) 멈추는 상한. */
const MAX_NOTES = 20000;

/**
 * 길이 표기를 생략한 HOLD(`3h,`) / TOUCH HOLD(`Ch,`) 가 갖는 길이.
 * 사양서: "この記述は内部的には【[1280:1]】の長さを指定したものとして扱われます"
 * — 한순간만 눌리는 의사 TAP 이 된다.
 */
const PSEUDO_TAP_LENGTH = "1280:1";

/**
 * 헤더 없이 본문만 공유돼서 난이도를 알 수 없을 때 쓰는 키.
 * 호출부는 이 값이면 난이도 뱃지를 숨긴다.
 */
export const UNKNOWN_DIFFICULTY = 0;

// ── 헤더 ────────────────────────────────────────────────────────────────────

/** 값이 여러 줄에 걸치는 키. 나머지는 전부 한 줄짜리다. */
const MULTILINE_KEY = /^(inote_\d+|freemsg)$/;

interface Blocks {
  blocks: Map<string, string>;
  /** 어느 `&key=` 에도 속하지 않은 줄들. 헤더 없이 본문만 공유된 경우 여기 담긴다. */
  loose: string;
}

/**
 * `&key=value` 블록으로 쪼갠다.
 *
 * `&inote_4=` 는 본문이 수백 줄이라 다음 `&key=` 까지 이어 먹어야 하지만,
 * `&title=` / `&wholebpm=` 같은 한 줄짜리 키까지 그렇게 먹으면 뒤따르는 채보
 * 본문이 값에 섞여 들어간다(`&wholebpm=160` 뒤에 본문이 오면 BPM 이 NaN 이 됐다).
 * 그래서 멀티라인은 화이트리스트로만 허용하고, 남는 줄은 loose 로 모은다.
 */
function splitBlocks(text: string): Blocks {
  const blocks = new Map<string, string>();
  const loose: string[] = [];
  let key = "";
  let buf: string[] = [];
  const flush = () => { if (key) blocks.set(key, buf.join("\n")); key = ""; buf = []; };
  for (const line of text.split(/\r?\n/)) {
    const m = /^&([A-Za-z0-9_]+)\s*=(.*)$/.exec(line);
    if (m) {
      flush();
      const k = m[1].toLowerCase();
      if (MULTILINE_KEY.test(k)) { key = k; buf = [m[2]]; }
      else blocks.set(k, m[2]);
      continue;
    }
    if (key) buf.push(line);
    else loose.push(line);
  }
  flush();
  return { blocks, loose: loose.join("\n") };
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
 * `[...]` 안쪽(대괄호 제외) 길이 표기를 ms 로 바꾼다. 사양서의 전체 문법은
 *
 *     [ (대기초##)? (BPM#)? (음표길이 | 초) ]   또는   [#초]
 *
 * 이고, 실제 예시는 다음과 같다.
 *
 * - `[8:3]`          현재 BPM 의 8분음표 3개분
 * - `[160#8:3]`      BPM160 의 8분음표 3개분 (대기도 BPM160 의 1박)
 * - `[160#2]`        BPM160 의 대기 후 2초간 이동
 * - `[#5.678]`       5.678초 (HOLD 의 절대 길이 지정)
 * - `[3##1.5]`       3초 대기 후 1.5초간 이동
 * - `[3##8:3]`       3초 대기 후 현재 BPM 의 8분음표 3개분
 * - `[3##160#8:3]`   3초 대기 후 BPM160 의 8분음표 3개분
 */
export function parseLength(inner: string, bpm: number): Length {
  const oneBeatNow = 60000 / bpm;
  let rest = inner.trim();
  let delayMs: number | null = null;

  const dd = rest.indexOf("##");
  if (dd >= 0) {
    delayMs = num(rest.slice(0, dd), 0) * 1000;
    rest = rest.slice(dd + 2);
  }

  // `[#초]` — `#` 앞이 비어 있으면 길이를 초로 직접 지정한 것.
  if (rest.startsWith("#")) {
    return { delayMs: delayMs ?? oneBeatNow, durationMs: num(rest.slice(1), 0) * 1000 };
  }

  let useBpm = bpm;
  const hash = rest.indexOf("#");
  if (hash >= 0) {
    useBpm = num(rest.slice(0, hash), 0) || bpm;
    rest = rest.slice(hash + 1);
  }
  const oneBeat = 60000 / useBpm;

  let durationMs: number;
  const colon = rest.indexOf(":");
  if (colon >= 0) {
    const den = num(rest.slice(0, colon), 0);
    const cnt = num(rest.slice(colon + 1), 0);
    durationMs = den > 0 ? (MEASURE_BEATS / den) * cnt * oneBeat : oneBeat;
  } else if (rest) {
    durationMs = num(rest, 0) * 1000;   // 초 단위
  } else {
    durationMs = oneBeat;
  }
  if (!Number.isFinite(durationMs) || durationMs < 0) durationMs = oneBeat;
  return { delayMs: delayMs ?? oneBeat, durationMs };
}

// ── 슬라이드 궤적 ───────────────────────────────────────────────────────────

interface RawSeg {
  type: string;
  digits: string;
  /** 이 구간에 붙은 `[...]` 안쪽. 없으면 빈 문자열. */
  bracket: string;
}

/** `-4[2:1]q7[2:1]-2[1:1]` 처럼 이어 붙은 궤적 표기를 구간 단위로 훑는다. */
function scanSegments(spec: string): RawSeg[] {
  const out: RawSeg[] = [];
  let i = 0;
  while (i < spec.length) {
    const ch = spec[i];
    let type: string;
    if ((ch === "p" || ch === "q") && spec[i + 1] === ch) { type = ch + ch; i += 2; }
    else if (SLIDE_CHARS.includes(ch)) { type = ch; i += 1; }
    else { i += 1; continue; }

    let digits = "";
    while (i < spec.length && spec[i] >= "0" && spec[i] <= "9") digits += spec[i++];
    // 도착 숫자와 `[` 사이에 BREAK/EX 표기가 낄 수 있다 (`-5b[8:1]`).
    while (i < spec.length && /[bx]/i.test(spec[i])) i++;

    let bracket = "";
    if (spec[i] === "[") {
      const close = spec.indexOf("]", i);
      if (close > i) { bracket = spec.slice(i + 1, close); i = close + 1; }
      else i = spec.length;
    }
    if (digits) out.push({ type, digits, bracket });
  }
  return out;
}

/**
 * 이어 붙은 궤적을 구간 목록으로 푼다. 앞 구간의 도착점이 다음 구간의 출발점이 된다.
 * `V`(큰 V자형)는 "始点→通過点→終点" 이므로 직선 두 개로 분해한다.
 */
export function parseSegments(start: number, spec: string): SlideSegment[] {
  return buildSegments(start, scanSegments(spec)).segments;
}

function buildSegments(start: number, raws: RawSeg[]): { segments: SlideSegment[]; spans: number[] } {
  const segments: SlideSegment[] = [];
  const spans: number[] = [];
  let from = start;
  for (const r of raws) {
    const before = segments.length;
    if (r.type === "V") {
      if (r.digits.length < 2) continue;
      const mid = Number(r.digits[0]);
      const end = Number(r.digits.slice(1));
      segments.push({ type: "-", from, to: mid });
      segments.push({ type: "-", from: mid, to: end });
      from = end;
    } else {
      const end = Number(r.digits);
      if (!(end >= 1 && end <= 8)) continue;
      segments.push({ type: r.type as SlideType, from, to: end });
      from = end;
    }
    spans.push(segments.length - before);
  }
  return { segments, spans };
}

// ── 노트 ────────────────────────────────────────────────────────────────────

// 사양서: "「x」、「h」、「b」が2文字以上併記される場合、どのような順番で書いても構いません"
const RE_HOLD = /^(\d)([bxh]*)(?:\[([^\]]*)\])?([bxh]*)$/i;
const RE_SLIDE = new RegExp(`^(\\d)([bx@?!]*)([${SLIDE_CHARS}].*)$`, "i");
const RE_TOUCH = /^([ABCDE])(\d*)([hbfx]*)(?:\[([^\]]*)\])?([hbfx]*)$/i;
const RE_TAP = /^(\d)([bx$]*)$/i;

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

  // HOLD — 1h[4:1] / 5hb[2:1] / 3hx[4:1] / 1h(길이 생략 = 의사 TAP)
  const hold = RE_HOLD.exec(text);
  if (hold && /h/i.test(hold[2] + hold[4])) {
    const pos = Number(hold[1]);
    if (pos < 1 || pos > 8) return;
    const flags = hold[2] + hold[4];
    const { durationMs } = parseLength(hold[3] ?? PSEUDO_TAP_LENGTH, ctx.bpm);
    pushNote(ctx, {
      ...base, type: "hold", pos, durationMs,
      ...(/b/i.test(flags) ? { isBreak: true as const } : {}),
      ...(/x/i.test(flags) ? { isEx: true as const } : {}),
    });
    return;
  }

  // SLIDE — 1-5[8:1] / 1-4[4:3]*-6[8:5] / 1-4q7-2[1:2] / 1@-5 / 1?-5 / 1!-5
  const slide = RE_SLIDE.exec(text);
  if (slide) {
    const pos = Number(slide[1]);
    if (pos < 1 || pos > 8) return;
    const flags = slide[2];
    const bodies: SlideBody[] = [];
    // `*` 는 같은 별에서 뻗어나가는 동시작 슬라이드(同始点SLIDE).
    for (const part of slide[3].split("*")) {
      const raws = scanSegments(part);
      const { segments, spans } = buildSegments(pos, raws);
      if (segments.length === 0) continue;

      // 구간마다 길이가 붙어 있으면 구간별 속도, 아니면 마지막 하나가 전체 길이.
      const perSegment = raws.length > 1 && raws.every((r) => r.bracket);
      const first = parseLength(raws[0]?.bracket ?? "", ctx.bpm);
      let durationMs: number;
      let groups: SlideGroup[] | undefined;
      if (perSegment) {
        groups = raws.map((r, i) => ({
          count: spans[i] ?? 1,
          durationMs: parseLength(r.bracket, ctx.bpm).durationMs,
        }));
        durationMs = groups.reduce((a, g) => a + g.durationMs, 0);
      } else {
        const last = [...raws].reverse().find((r) => r.bracket);
        durationMs = parseLength(last?.bracket ?? "", ctx.bpm).durationMs;
      }
      // 사양서: BREAK SLIDE 는 마지막 `]` 뒤에 b. 도착 숫자 뒤에 붙이는 표기도 받아준다.
      const isBreak = /\]\s*b/i.test(part) || new RegExp(`[${SLIDE_CHARS}]\\d+b`, "i").test(part);
      bodies.push({
        segments, delayMs: first.delayMs, durationMs, isBreak,
        ...(groups ? { groups } : {}),
      });
    }
    if (bodies.length === 0) return;
    // 동시작 슬라이드는 사양서상 EACH 로 취급된다.
    const each = ctx.isEach || bodies.length > 1;
    pushNote(ctx, {
      ...base, type: "slide", pos, slides: bodies,
      ...(each ? { isEach: true as const } : {}),
      ...(/b/i.test(flags) ? { isBreak: true as const } : {}),
      ...(/x/i.test(flags) ? { isEx: true as const } : {}),
      ...(flags.includes("@") ? { plainStar: true as const } : {}),
      ...(flags.includes("!") ? { starless: "none" as const }
        : flags.includes("?") ? { starless: "fade" as const } : {}),
    });
    return;
  }

  // TAP 끼리의 EACH 축약 — `15` = 1번 + 5번 (TAP 이외가 섞이면 `/` 를 써야 한다)
  if (/^\d{2,}$/.test(text)) {
    const digits = text.split("").map(Number);
    if (digits.every((d) => d >= 1 && d <= 8)) {
      for (const d of digits) pushNote(ctx, { ...base, type: "tap", pos: d, isEach: true });
      return;
    }
  }

  // TOUCH — C / B1 / E4f / Chf[1:2] / Ch(길이 생략 = 의사 TOUCH)
  const touch = RE_TOUCH.exec(text);
  if (touch) {
    const area = touch[1].toUpperCase() as Exclude<TouchArea, "">;
    const n = touch[2] ? Number(touch[2]) : null;
    if (!validTouch(area, n)) return;
    const flags = (touch[3] + touch[5]).toLowerCase();
    const isHold = flags.includes("h");
    const note: ChartNote = {
      ...base,
      type: isHold ? "touchHold" : "touch",
      // C1/C2 로 써도 사양서상 한가운데 하나로 취급된다.
      pos: area === "C" ? 1 : (n ?? 1),
      area,
      ...(flags.includes("f") ? { hasFirework: true as const } : {}),
    };
    if (isHold) note.durationMs = parseLength(touch[4] ?? PSEUDO_TAP_LENGTH, ctx.bpm).durationMs;
    pushNote(ctx, note);
    return;
  }

  // TAP — 1 / 3b / 5x / 1$ (별 모양) / 1$$ (회전하는 별)
  const tap = RE_TAP.exec(text);
  if (tap) {
    const pos = Number(tap[1]);
    if (pos < 1 || pos > 8) return;
    const flags = tap[2];
    const stars = (flags.match(/\$/g) ?? []).length;
    pushNote(ctx, {
      ...base, type: "tap", pos,
      ...(/b/i.test(flags) ? { isBreak: true as const } : {}),
      ...(/x/i.test(flags) ? { isEx: true as const } : {}),
      ...(stars > 0 ? { starTap: (stars >= 2 ? 2 : 1) as 1 | 2 } : {}),
    });
  }
}

/**
 * 한 박에 놓인 노트 묶음을 해석한다.
 *
 * `/` 로 이어진 것은 EACH(노란색). `` ` `` 는 의사 EACH 로, 사양서상 뒤쪽 노트가
 * 0.001초씩 밀리며 "동시가 아니므로" 노란색이 되지 않는다. 그래서 `` ` `` 로 나뉜
 * 묶음마다 따로 EACH 여부를 판정한다 (``1`2`3/4`` 이면 3·4 만 EACH).
 */
function parseGroup(text: string, ctx: Ctx): void {
  const buckets: string[][] = [[]];
  let cur = "";
  const push = () => {
    const t = cur.trim();
    if (t) buckets[buckets.length - 1].push(t);
    cur = "";
  };
  for (const ch of text) {
    if (ch === "/") push();
    else if (ch === "`") { push(); buckets.push([]); }
    else cur += ch;
  }
  push();
  for (let offset = 0; offset < buckets.length; offset++) {
    const bucket = buckets[offset];
    ctx.isEach = bucket.length > 1;
    for (const part of bucket) parseNote(part, ctx, ctx.timeMs + offset);
  }
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
  let stepSec = 0;      // {#초} 지정 시 > 0 (한 칸이 절대 시간)
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
  // BPM 을 어디에서도 못 찾았으면 120 을 가정한 것이다. 재생 속도가 실제와
  // 다르다는 뜻이라 호출부가 안내할 수 있게 표시해 둔다.
  const bpmAssumed = !(defaultBpm > 0) && firstBpm === null;
  if (firstBpm === null) firstBpm = bpm;
  if (bpmEvents.length === 0) bpmEvents.push({ beat: 0, timeMs: offsetSec * 1000, bpm: firstBpm });

  return {
    notes,
    bpmEvents,
    bpm: firstBpm,
    durationMs: endOf(notes),
    measures: Math.max(1, Math.ceil(beat / MEASURE_BEATS)),
    stats: countStats(notes),
    ...(bpmAssumed ? { bpmAssumed: true as const } : {}),
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
 * 터치 홀드는 사양서상 리ザ루트에서 HOLD 로 집계되지만, 여기서는 나눠 두고
 * 표시 단계에서 합친다.
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
  const { blocks, loose } = splitBlocks(text);
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

  // 공유될 때 `&inote_N=` 없이 채보 본문만 붙여넣는 경우가 많다. 선언된 채보가
  // 하나도 없으면 남은 줄(loose)을 본문으로 보고 한 번 더 시도한다.
  // 난이도는 `&lv_N=` 이 딱 하나일 때만 그걸로 보고, 아니면 UNKNOWN_DIFFICULTY.
  if (Object.keys(charts).length === 0 && loose.trim()) {
    const bare = parseInote(loose, wholeBpm, offsetSec);
    if (bare.notes.length > 0) {
      const declared = Object.keys(levels).map(Number);
      const key = declared.length === 1 ? declared[0] : UNKNOWN_DIFFICULTY;
      charts[key] = bare;
      if (!designers[key] && commonDes) designers[key] = commonDes;
    }
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
