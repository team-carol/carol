// src/web/optionPreset.ts — /option.js 구문 유효성 + 저장 요청 검증.
const test = require("node:test");
const assert = require("node:assert/strict");
const op = require("../../dist/web/optionPreset.js");

test("OPTION_CLIENT_JS: 구문상 유효한 JS", () => {
  assert.doesNotThrow(() => new Function(op.OPTION_CLIENT_JS));
});

test("buildOptionBookmarklet: 서버·토큰을 담은 javascript: 링크", () => {
  const code = op.buildOptionBookmarklet("https://carol.example", "abc123");
  assert.match(code, /^javascript:/);
  assert.ok(code.includes("https://carol.example/option.js?code=abc123"));
});

test("sanitizeOptionPreset: 정상 입력은 이름 정리 + 라벨 유지", () => {
  const r = op.sanitizeOptionPreset({ name: "  평소   설정 ", server: "intl", values: { noteSpeed: "26", mirrorMode: "0" }, labels: { noteSpeed: ["TAP SPEED", "7.50"] } });
  assert.deepEqual(r, { name: "평소 설정", server: "intl", values: { noteSpeed: "26", mirrorMode: "0" }, labels: { noteSpeed: ["TAP SPEED", "7.50"] } });
});

test("sanitizeOptionPreset: token·이상한 키/값·빈 값·잘못된 서버는 거부", () => {
  const base = { name: "a", server: "jp", values: { noteSpeed: "1" } };
  assert.ok(op.sanitizeOptionPreset(base));
  assert.equal(op.sanitizeOptionPreset({ ...base, values: { token: "x" } }), null);
  assert.equal(op.sanitizeOptionPreset({ ...base, values: { "a b": "1" } }), null);
  assert.equal(op.sanitizeOptionPreset({ ...base, values: { noteSpeed: "<x>" } }), null);
  assert.equal(op.sanitizeOptionPreset({ ...base, values: {} }), null);
  assert.equal(op.sanitizeOptionPreset({ ...base, server: "kr" }), null);
  assert.equal(op.sanitizeOptionPreset({ ...base, name: "x".repeat(31) }), null);
  assert.equal(op.sanitizeOptionPreset({ ...base, name: "   " }), null);
});

const pn = require("../../dist/patchNotes.js");
test("sanitizePatchNote: 본문 필수·길이 제한, 공백 정리", () => {
  assert.deepEqual(pn.sanitizePatchNote({ version: " 1.10.0 ", title: "  새   기능 ", body: "a\r\nb " }), { version: "1.10.0", title: "새 기능", body: "a\nb" });
  assert.equal(pn.sanitizePatchNote({ version: "", title: "", body: "   " }), null);
  assert.equal(pn.sanitizePatchNote({ body: "x".repeat(pn.PATCH_NOTE_BODY_MAX + 1) }), null);
  assert.equal(pn.sanitizePatchNote(null), null);
});
