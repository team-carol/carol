// src/simai/parse.ts — maidata.txt 파서. 네트워크·DB 없이 전부 검증 가능.
process.env.DATABASE_URL ||= "postgres://placeholder:placeholder@127.0.0.1:5432/placeholder";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseMaidata, parseInote, parseSegments } = require("../../dist/simai/parse");

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

test("의사 EACH(`)는 1ms 씩 밀린다", () => {
  const c = parseInote("(120){4}1`5`3,", 120);
  assert.deepEqual(c.notes.map((n) => n.timeMs), [0, 1, 2]);
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

test("깨진 입력에도 무한루프 없이 끝난다", () => {
  assert.equal(parseInote("(((({{{{,,,,", 120).notes.length, 0);
  assert.equal(parseInote("", 120).notes.length, 0);
  assert.deepEqual(parseMaidata("쓰레기 텍스트").charts, {});
});
