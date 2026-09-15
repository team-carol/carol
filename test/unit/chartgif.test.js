// src/bot/utils/chartGif.ts — 구간 선택 로직 (렌더는 네이티브 캔버스라 여기선 제외).
process.env.DATABASE_URL ||= "postgres://placeholder:placeholder@127.0.0.1:5432/placeholder";

const test = require("node:test");
const assert = require("node:assert/strict");
const { densestStart, GIF_DEFAULTS } = require("../../dist/bot/utils/chartGif");
const { parseInote } = require("../../dist/simai/parse");

function chartOf(src) { return parseInote(src, 120); }

test("densestStart: 노트가 가장 몰린 구간을 고른다", () => {
  // 앞은 4분(느슨), 뒤는 16분(빽빽) — 뒤쪽을 골라야 한다
  const c = chartOf("(120){4}1,2,3,4,1,2,3,4,{16}1,2,3,4,5,6,7,8,1,2,3,4,5,6,7,8,");
  const dense = c.notes[8].timeMs;          // 16분이 시작되는 시각
  const s = densestStart(c, 2000);
  assert.ok(s <= dense && s > dense - 2000,
    `빽빽한 구간(${Math.round(dense)}ms) 근처여야 하는데 ${Math.round(s)}ms`);
});

test("densestStart: 균등하면 앞쪽을 고르고, 음수가 되지 않는다", () => {
  const c = chartOf("(120){4}1,2,3,4,5,6,7,8,");
  const s = densestStart(c, 2000);
  assert.equal(s, 0);
});

test("densestStart: 노트가 없으면 0", () => {
  assert.equal(densestStart({ notes: [] }, 2000), 0);
});

test("GIF 기본값이 Discord 첨부 한도 안에서 잡혀 있다", () => {
  assert.ok(GIF_DEFAULTS.durationMs <= 12000, "미리보기는 12초 이하");
  assert.ok(GIF_DEFAULTS.size <= 480, "한 변 480px 이하");
  assert.ok(GIF_DEFAULTS.fps <= 20);
  // 대략적인 상한: 프레임 수 × 한 변² 이 너무 커지면 10MB 를 넘길 수 있다
  const frames = GIF_DEFAULTS.durationMs / 1000 * GIF_DEFAULTS.fps;
  assert.ok(frames * GIF_DEFAULTS.size * GIF_DEFAULTS.size < 3.2e7, "프레임×픽셀 예산 초과");
});
