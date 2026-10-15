// src/web/bookmarklet.ts — 서빙되는 북마클릿 JS 문자열. 구문 유효성 + 핵심 구조 검증.
// (모듈 자체는 import가 없어 DB 불필요)
const test = require("node:test");
const assert = require("node:assert/strict");
const bm = require("../../dist/web/bookmarklet.js");

test("buildBookmarkletJs: 프리셋 없이 구문상 유효한 JS", () => {
  const code = bm.buildBookmarkletJs([]);
  assert.doesNotThrow(() => new Function(code));
  assert.ok(code.length > 5000);
});

test("buildBookmarkletJs: 추가 북마클릿 주입해도 유효 + 라벨은 런타임 이스케이프", () => {
  const code = bm.buildBookmarkletJs([{ label: "acc & <b>", code: "javascript:void(0)" }]);
  assert.doesNotThrow(() => new Function(code));
  // 라벨은 JSON으로 임베드되고, HTML 이스케이프는 브라우저 실행 시점에 이뤄진다.
  assert.ok(code.includes(JSON.stringify("acc & <b>")));
  assert.ok(code.includes(".replace(/&/g,'&amp;')"));
});

test("수집 파이프라인 핵심 식별자 존재", () => {
  const code = bm.buildBookmarkletJs([]);
  for (const id of ["runPool", "fetchPage", "PAGE_CONCURRENCY", "SYNC_UPLOAD_TIMEOUT", "collectCore", "postSync"]) {
    assert.ok(code.includes(id), `missing: ${id}`);
  }
  // 옛 순차 헬퍼는 제거됨
  assert.ok(!/\bfunction xf\(/.test(code));
});

test("도메인 가드 유지 (maimaidx.jp / maimaidx-eng.com 외 실행 차단)", () => {
  const code = bm.buildBookmarkletJs([]);
  assert.ok(code.includes("maimaidx.jp"));
  assert.ok(code.includes("maimaidx-eng.com"));
});

test("buildBookmarklet: javascript: 스킴 로더", () => {
  const out = bm.buildBookmarklet("tok123", 3456);
  assert.ok(out.startsWith("javascript:"));
  assert.ok(out.includes("/bookmarklet.js?code=tok123"));
});

test("MAISHIFT_BOOKMARKLET: maishift 북마클릿을 불러오는 javascript: 코드", () => {
  assert.equal(bm.MAISHIFT_BOOKMARKLET.label, "maishift");
  assert.ok(bm.MAISHIFT_BOOKMARKLET.code.startsWith("javascript:"));
  assert.ok(bm.MAISHIFT_BOOKMARKLET.code.includes("https://maimai.shiftpsh.com/bookmarklet.js"));
});
