// src/simai/parse.ts — maidata.txt 파서. 네트워크·DB 없이 전부 검증 가능.
process.env.DATABASE_URL ||= "postgres://placeholder:placeholder@127.0.0.1:5432/placeholder";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseMaidata, parseInote, parseSegments, parseLength, UNKNOWN_DIFFICULTY } = require("../../dist/simai/parse");

// 120 BPM 에서 1박 = 500ms, 한 마디 = 2000ms
const B = 500;

test("헤더: 여러 줄짜리 inote 를 다음 &key= 까지 먹는다", () => {
  const m = parseMaidata([
    "&title=테스트곡",
    "&artist=아티스트",
    "&wholebpm=120",
    "&des=보면제작자",
    "&lv_4=14+",
    "&inote_4=(120){4}",
    "1,2,3,4,",
    "5,6,7,8,",
    "&lv_5=15",
    "&inote_5=(120){4}1,",
  ].join("\n"));

  assert.equal(m.title, "테스트곡");
  assert.equal(m.artist, "아티스트");
  assert.equal(m.bpm, 120);
  assert.equal(m.levels[4], "14+");
  assert.equal(m.levels[5], "15");
  assert.equal(m.designers[4], "보면제작자", "&des= 는 전 난이도 공통");
  assert.equal(m.charts[4].notes.length, 8);
  assert.equal(m.charts[5].notes.length, 1);
  assert.deepEqual(Object.keys(m.charts), ["4", "5"]);
});

test("타이밍: , 한 칸은 4/divisor 박", () => {
  const c = parseInote("(120){4}1,2,3,4,", 120);
  assert.deepEqual(c.notes.map((n) => n.timeMs), [0, B, 2 * B, 3 * B]);
  assert.deepEqual(c.notes.map((n) => n.pos), [1, 2, 3, 4]);

  const c8 = parseInote("(120){8}1,2,3,4,", 120);
  assert.deepEqual(c8.notes.map((n) => n.timeMs), [0, B / 2, B, 1.5 * B], "{8} 은 8분음표 간격");
});

test("타이밍: 중간 BPM 변경이 이후 간격에 반영된다", () => {
  const c = parseInote("(120){4}1,2,(240)3,4,", 120);
  assert.deepEqual(c.notes.map((n) => n.timeMs), [0, 500, 1000, 1250]);
  assert.equal(c.bpm, 120, "표시용 BPM 은 첫 BPM");
  assert.deepEqual(c.bpmEvents.map((e) => e.bpm), [120, 240]);
});

test("&first= 는 전체를 뒤로 민다", () => {
  const c = parseInote("(120){4}1,", 120, 1.5);
  assert.equal(c.notes[0].timeMs, 1500);
});

test("TAP: b=BREAK, x=EX", () => {
  const c = parseInote("(120){4}1,2b,3x,", 120);
  assert.equal(c.notes[0].isBreak, undefined);
  assert.equal(c.notes[1].isBreak, true);
  assert.equal(c.notes[2].isEx, true);
});

test("HOLD: [4:1] 은 1박, [#2.5] 는 절대 2.5초", () => {
  const c = parseInote("(120){4}1h[4:1],2h[#2.5],3h[8:3],", 120);
  assert.equal(c.notes[0].type, "hold");
  assert.equal(c.notes[0].durationMs, B);
  assert.equal(c.notes[1].durationMs, 2500);
  assert.equal(c.notes[2].durationMs, 4 / 8 * 3 * B);
});

test("HOLD: [160#4:1] 은 지정 BPM 으로 계산", () => {
  const c = parseInote("(120){4}1h[240#4:1],", 120);
  assert.equal(c.notes[0].durationMs, 250, "240BPM 의 1박");
});

test("SLIDE: 구간·대기·길이", () => {
  const c = parseInote("(120){4}1-5[8:1],", 120);
  const n = c.notes[0];
  assert.equal(n.type, "slide");
  assert.equal(n.pos, 1);
  assert.equal(n.slides.length, 1);
  assert.deepEqual(n.slides[0].segments, [{ type: "-", from: 1, to: 5 }]);
  assert.equal(n.slides[0].delayMs, B, "대기 기본값은 1박");
  assert.equal(n.slides[0].durationMs, 4 / 8 * 1 * B);
});

test("SLIDE: V 는 직선 두 구간으로 분해된다", () => {
  const c = parseInote("(120){4}1V35[8:1],", 120);
  assert.deepEqual(c.notes[0].slides[0].segments, [
    { type: "-", from: 1, to: 3 },
    { type: "-", from: 3, to: 5 },
  ]);
});

test("SLIDE: * 분기는 별 하나에 궤적 여러 개", () => {
  const c = parseInote("(120){4}1-5[8:1]*-3[8:1],", 120);
  const n = c.notes[0];
  assert.equal(n.slides.length, 2);
  assert.deepEqual(n.slides[0].segments, [{ type: "-", from: 1, to: 5 }]);
  assert.deepEqual(n.slides[1].segments, [{ type: "-", from: 1, to: 3 }], "분기는 같은 출발점");
});

test("SLIDE: 이어진 구간은 앞 도착점이 다음 출발점", () => {
  assert.deepEqual(parseSegments(1, "-3^5"), [
    { type: "-", from: 1, to: 3 },
    { type: "^", from: 3, to: 5 },
  ]);
  assert.deepEqual(parseSegments(2, "pp6"), [{ type: "pp", from: 2, to: 6 }]);
  assert.deepEqual(parseSegments(2, "q6"), [{ type: "q", from: 2, to: 6 }]);
});

test("SLIDE: 별 BREAK 와 궤적 BREAK 를 구분한다", () => {
  const star = parseInote("(120){4}1b-5[8:1],", 120).notes[0];
  assert.equal(star.isBreak, true, "1b- 는 별이 BREAK");
  assert.equal(star.slides[0].isBreak, false);

  const body = parseInote("(120){4}1-5b[8:1],", 120).notes[0];
  assert.equal(body.isBreak, undefined);
  assert.equal(body.slides[0].isBreak, true, "도착 숫자 뒤 b 는 궤적이 BREAK");

  const after = parseInote("(120){4}1-5[8:1]b,", 120).notes[0];
  assert.equal(after.slides[0].isBreak, true, "브래킷 뒤 b 도 궤적 BREAK");
});

test("EACH: / 로 묶으면 isEach", () => {
  const c = parseInote("(120){4}1/5,3,", 120);
  assert.equal(c.notes[0].isEach, true);
  assert.equal(c.notes[1].isEach, true);
  assert.equal(c.notes[0].timeMs, c.notes[1].timeMs);
  assert.equal(c.notes[2].isEach, undefined, "혼자면 EACH 아님");
});

test("EACH: 숫자 붙여쓰기 축약(15)도 동시 탭", () => {
  const c = parseInote("(120){4}15,", 120);
  assert.deepEqual(c.notes.map((n) => n.pos), [1, 5]);
  assert.equal(c.notes[0].isEach, true);
  assert.equal(c.notes[1].timeMs, 0);
});

test("의사 EACH(`)는 1ms 씩 밀리고, EACH 로 치지 않는다", () => {
  const c = parseInote("(120){4}1`5`3,", 120);
  assert.deepEqual(c.notes.map((n) => n.timeMs), [0, 1, 2]);
  // 사양서: "タイミングが同時である、というEACHの条件を満たしていないので、
  // TAPが黄色くなることもなく" — 색이 변하면 안 되므로 isEach 가 붙으면 안 된다.
  assert.deepEqual(c.notes.map((n) => n.isEach), [undefined, undefined, undefined]);

  // 1`2`3/4 → 3 과 4 만 서로 EACH
  const mixed = parseInote("(120){4}1`2`3/4,", 120);
  assert.deepEqual(mixed.notes.map((n) => [n.pos, n.timeMs, !!n.isEach]),
    [[1, 0, false], [2, 1, false], [3, 2, true], [4, 2, true]]);
});

test("길이 표기: 사양서의 모든 형태", () => {
  const B = 500;                       // 120BPM 1박
  const len = (raw) => parseLength(raw, 120);
  assert.deepEqual(len("8:3"), { delayMs: B, durationMs: 4 / 8 * 3 * B }, "[8:3]");
  assert.deepEqual(len("160#8:3"), { delayMs: 375, durationMs: 4 / 8 * 3 * 375 }, "[160#8:3] 은 대기도 BPM160");
  assert.deepEqual(len("160#2"), { delayMs: 375, durationMs: 2000 }, "[160#2] = BPM160 대기 + 2초");
  assert.deepEqual(len("#5.678"), { delayMs: B, durationMs: 5678 }, "[#5.678] = 절대 5.678초");
  assert.deepEqual(len("3##1.5"), { delayMs: 3000, durationMs: 1500 }, "[3##1.5] = 3초 대기 + 1.5초");
  assert.deepEqual(len("3##8:3"), { delayMs: 3000, durationMs: 4 / 8 * 3 * B }, "[3##8:3] = 3초 대기 + 현재 BPM");
  assert.deepEqual(len("3##160#8:3"), { delayMs: 3000, durationMs: 4 / 8 * 3 * 375 }, "[3##160#8:3]");
});

test("길이를 생략한 HOLD/TOUCH HOLD 는 [1280:1] 의사 TAP", () => {
  // 사양서: "この記述は内部的には【[1280:1]】の長さを指定したものとして扱われます"
  const expected = 4 / 1280 * 1 * 500;
  assert.equal(parseInote("(120){4}3h,", 120).notes[0].durationMs, expected);
  const ch = parseInote("(120){4}Ch,", 120).notes[0];
  assert.equal(ch.type, "touchHold");
  assert.equal(ch.durationMs, expected);
});

test("연결 SLIDE: 구간별 속도를 지정하면 묶음으로 나눈다", () => {
  const c = parseInote("(120){4}1-4[2:1]q7[2:1]-2[1:1],", 120);
  const b = c.notes[0].slides[0];
  assert.deepEqual(b.segments, [
    { type: "-", from: 1, to: 4 },
    { type: "q", from: 4, to: 7 },
    { type: "-", from: 7, to: 2 },
  ]);
  assert.deepEqual(b.groups, [
    { count: 1, durationMs: 1000 },
    { count: 1, durationMs: 1000 },
    { count: 1, durationMs: 2000 },
  ]);
  assert.equal(b.durationMs, 4000, "전체 길이는 구간 합");

  // 길이를 하나만 쓰면 전체가 일정 속도 → groups 없음
  const whole = parseInote("(120){4}1-4q7-2[1:2],", 120).notes[0].slides[0];
  assert.equal(whole.groups, undefined);
  assert.equal(whole.durationMs, 4 * 2 * 500, "온음표 2개분");
  assert.equal(whole.segments.length, 3);
});

test("동시작 SLIDE(*)는 EACH 로 취급된다", () => {
  const n = parseInote("(120){4}1-4[4:3]*-6[8:5],", 120).notes[0];
  assert.equal(n.slides.length, 2);
  assert.equal(n.isEach, true, "사양서: 이들 SLIDE 는 EACH 로 취급");
  assert.equal(n.slides[0].durationMs, 4 / 4 * 3 * 500);
  assert.equal(n.slides[1].durationMs, 4 / 8 * 5 * 500);
});

test("특수 표기: $ $$ @ ? !", () => {
  const c = parseInote("(120){4}1$,2$$,3@-7[8:1],4?-8[8:1],5!-1[8:1],", 120);
  assert.equal(c.notes[0].starTap, 1, "$ = 별 모양 TAP");
  assert.equal(c.notes[1].starTap, 2, "$$ = 회전하는 별");
  assert.equal(c.notes[2].plainStar, true, "@ = 슬라이드 별을 일반 TAP 으로");
  assert.equal(c.notes[3].starless, "fade", "? = 별 없음(이동하는 별은 페이드인)");
  assert.equal(c.notes[4].starless, "none", "! = 별 없음(출발 순간 등장)");
  // 별 표기가 붙어도 슬라이드는 정상 처리된다
  assert.equal(c.notes[2].slides[0].segments.length, 1);
});

test("b/h/x 는 순서가 자유롭고, TOUCH 의 h/f 도 마찬가지", () => {
  for (const src of ["5hb[2:1]", "5bh[2:1]", "5hxb[2:1]", "5bxh[2:1]"]) {
    const n = parseInote("(120){4}" + src + ",", 120).notes[0];
    assert.equal(n.type, "hold", src);
    assert.equal(n.isBreak, true, src + " 는 BREAK");
  }
  assert.equal(parseInote("(120){4}7bxh[4:1],", 120).notes[0].isEx, true, "EX-BREAK HOLD");
  for (const src of ["Chf[1:2]", "Cfh[1:2]"]) {
    const n = parseInote("(120){4}" + src + ",", 120).notes[0];
    assert.equal(n.type, "touchHold", src);
    assert.equal(n.hasFirework, true, src);
    assert.equal(n.durationMs, 4 * 2 * 500, src);
  }
});

test("C1/C2 는 사양서상 C 와 같은 한가운데 하나", () => {
  const c = parseInote("(120){4}C,C1,C2,", 120);
  assert.deepEqual(c.notes.map((n) => [n.area, n.pos]), [["C", 1], ["C", 1], ["C", 1]]);
});

test("TOUCH: 영역/번호/불꽃/홀드", () => {
  const c = parseInote("(120){4}C,E4f,B2h[4:1],A8,", 120);
  assert.deepEqual(c.notes.map((n) => [n.type, n.area, n.pos]), [
    ["touch", "C", 1],
    ["touch", "E", 4],
    ["touchHold", "B", 2],
    ["touch", "A", 8],
  ]);
  assert.equal(c.notes[1].hasFirework, true);
  assert.equal(c.notes[2].durationMs, B);
});

test("TOUCH: 영역별 번호 범위를 벗어나면 버린다", () => {
  assert.equal(parseInote("(120){4}C5,", 120).notes.length, 0, "C 는 1/2 만");
  assert.equal(parseInote("(120){4}A9,", 120).notes.length, 0);
  assert.equal(parseInote("(120){4}A,", 120).notes.length, 0, "A 는 번호 필수");
});

test("주석(||)과 E 종료 마커", () => {
  const c = parseInote("(120){4}1, || 여기는 주석 2,\n3,\nE\n9,", 120);
  assert.deepEqual(c.notes.map((n) => n.pos), [1, 3], "주석 뒤와 E 뒤는 무시");
});

test("l/r 손 표기는 판정과 무관하므로 무시한다", () => {
  const c = parseInote("(120){4}1l,5r,", 120);
  assert.deepEqual(c.notes.map((n) => [n.type, n.pos]), [["tap", 1], ["tap", 5]]);
});

test("stats: BREAK 는 TAP/SLIDE 에서 빼고 따로 센다", () => {
  const c = parseInote("(120){4}1,2b,3h[4:1],4-8[8:1],C,5-1b[8:1],", 120);
  assert.deepEqual(c.stats, {
    tap: 1, hold: 1, slide: 1, touch: 1, touchHold: 0, break: 2, total: 6,
  });
});

test("durationMs: 홀드·슬라이드 꼬리까지 센다", () => {
  const c = parseInote("(120){4}1h[4:1],", 120);
  assert.equal(c.durationMs, B);
  const s = parseInote("(120){4}1-5[4:1],", 120);
  assert.equal(s.durationMs, B + B, "대기 1박 + 길이 1박");
});

test("헤더가 하나도 없이 본문만 공유돼도 읽는다", () => {
  const m = parseMaidata("(160){8}\n1,2,3,4,5,6,7,8,\nE");
  assert.deepEqual(Object.keys(m.charts), [String(UNKNOWN_DIFFICULTY)], "난이도 미상 키로 들어간다");
  const c = m.charts[UNKNOWN_DIFFICULTY];
  assert.equal(c.notes.length, 8);
  assert.equal(c.bpm, 160);
  assert.equal(c.bpmAssumed, undefined, "(160) 이 있으므로 추정 아님");
});

test("&inote_N= 없이 헤더 일부 + 본문 조합도 읽는다", () => {
  const m = parseMaidata("&title=곡\n&artist=아무개\n&wholebpm=160\n&des=제작자\n1,2,3,4,\nE");
  assert.equal(m.title, "곡");
  assert.equal(m.bpm, 160, "&wholebpm= 뒤에 본문이 와도 값이 섞이지 않는다");
  const c = m.charts[UNKNOWN_DIFFICULTY];
  assert.equal(c.notes.length, 4);
  assert.equal(c.notes[1].timeMs, 60000 / 160, "wholebpm 이 타이밍에 실제로 반영된다");
  assert.equal(m.designers[UNKNOWN_DIFFICULTY], "제작자", "&des= 는 본문 폴백에도 붙는다");
});

test("&lv_N= 이 딱 하나면 본문 폴백도 그 난이도로 본다", () => {
  const m = parseMaidata("&lv_4=14+\n(160){4}1,2,");
  assert.deepEqual(Object.keys(m.charts), ["4"]);
  assert.equal(m.levels[4], "14+");

  // 여러 개면 어느 쪽인지 알 수 없으므로 미상으로 둔다
  const two = parseMaidata("&lv_4=14+\n&lv_5=15\n(160){4}1,2,");
  assert.deepEqual(Object.keys(two.charts), [String(UNKNOWN_DIFFICULTY)]);
});

test("BPM 표기가 아예 없으면 120 을 가정하고 표시한다", () => {
  const m = parseMaidata("1,2,3,4,");
  const c = m.charts[UNKNOWN_DIFFICULTY];
  assert.equal(c.bpm, 120);
  assert.equal(c.bpmAssumed, true);
  assert.equal(c.notes[1].timeMs, 500);

  // &wholebpm= 이 있으면 추정이 아니다
  assert.equal(parseMaidata("&wholebpm=160\n1,2,").charts[UNKNOWN_DIFFICULTY].bpmAssumed, undefined);
  // (bpm) 지시자만 있어도 추정이 아니다
  assert.equal(parseInote("(160){4}1,2,", 0).bpmAssumed, undefined);
});

test("&inote_N= 이 하나라도 있으면 본문 폴백을 쓰지 않는다", () => {
  const m = parseMaidata("&wholebpm=160\n&inote_4=(160){4}1,2,3,4,");
  assert.deepEqual(Object.keys(m.charts), ["4"], "선언된 채보만 쓴다");
  assert.equal(m.charts[4].notes.length, 4);
});

test("한 줄짜리 키는 다음 줄을 먹지 않는다", () => {
  const m = parseMaidata("&title=제목\n두 번째 줄\n&artist=아티스트\n&inote_4=(120){4}1,");
  assert.equal(m.title, "제목", "title 에 다음 줄이 붙지 않는다");
  assert.equal(m.artist, "아티스트");
});

test("깨진 입력에도 무한루프 없이 끝난다", () => {
  assert.equal(parseInote("(((({{{{,,,,", 120).notes.length, 0);
  assert.equal(parseInote("", 120).notes.length, 0);
  assert.deepEqual(parseMaidata("쓰레기 텍스트").charts, {});
});
