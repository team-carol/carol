const test = require("node:test");
const assert = require("node:assert/strict");
const { koreaPlayDayKey } = require("../dist/achievements");

test("achievement day changes at 05:00 KST", () => {
  assert.equal(koreaPlayDayKey(new Date("2026-07-14T19:59:00Z")), "2026-07-14");
  assert.equal(koreaPlayDayKey(new Date("2026-07-14T20:00:00Z")), "2026-07-15");
});
