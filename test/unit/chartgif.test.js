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

test("densePreviewRange: 밀도 높은 구간이 길면 길이도 길어진다(최대 20초)", () => {
  const { densePreviewRange } = require("../../dist/bot/utils/chartGif");
  // 30초 내내 16분음표로 빽빽 → 고밀도 구간이 길다 → 20초(최대)에 수렴
  let body = "(120){16}";
  for (let i = 0; i < 30 * 8; i++) body += (i % 8 + 1) + ",";  // 30초분(120bpm, 16분=0.125s → 8/박... 넉넉히)
  const c = chartOf(body);
  const r = densePreviewRange(c, 12000, 20000);
  assert.equal(r.durationMs, 20000, "길게 이어지면 최대 20초");
});

test("densePreviewRange: 짧은 밀집 뒤 성긴 구간이면 최소 12초", () => {
  const { densePreviewRange } = require("../../dist/bot/utils/chartGif");
  // 앞 2초만 빽빽, 이후 길게 성김
  let body = "(120){16}1,2,3,4,5,6,7,8,1,2,3,4,5,6,7,8,{1}1,,,,,,,,,,,,,,,,";
  const c = chartOf(body);
  const r = densePreviewRange(c, 12000, 20000);
  assert.ok(r.durationMs <= 13000, "밀집 구간이 짧으면 최소 12초 근처: " + r.durationMs);
});

test("densePreviewRange: 빈 채보는 최소 길이", () => {
  const { densePreviewRange } = require("../../dist/bot/utils/chartGif");
  assert.deepEqual(densePreviewRange({ notes: [], durationMs: 0 }, 12000, 20000), { startMs: 0, durationMs: 12000 });
});
