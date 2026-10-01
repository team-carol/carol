const test = require("node:test");
const assert = require("node:assert/strict");
const m = require("../../dist/messages");

test("cardTextSignature: 카드 문구 오버라이드가 바뀌면 서명과 DB 캐시 버전이 달라진다", () => {
  m.applyMessageOverrides([]);
  const base = m.cardTextSignature();
  const baseVersion = m.cardCacheVersion(17);
  assert.equal(m.cardTextSignature(), base); // 같은 문구면 그대로
  m.applyMessageOverrides([{ key: "profileCard.clearTitle", text: "클리어" }]);
  assert.notEqual(m.cardTextSignature(), base);
  assert.notEqual(m.cardCacheVersion(17), baseVersion);
  assert.ok(m.cardCacheVersion(17) >= 0 && m.cardCacheVersion(17) <= 0x7fffffff);
  // 카드와 무관한 문구는 서명에 영향이 없다
  m.applyMessageOverrides([{ key: "common.selfNotRegistered", text: "등록 먼저" }]);
  assert.equal(m.cardTextSignature(), base);
  m.applyMessageOverrides([]);
});

test("카드 문구 키는 기본값의 자리표시자를 지킨다", () => {
  assert.equal(m.msg("card.lastSynced", { time: "2026.10.01 09:45" }), "마지막 동기화 2026.10.01 09:45 (KST)");
  assert.equal(m.validateOverride("circleCard.memberPoints", "{points}점"), null);
  assert.match(m.validateOverride("circleCard.memberPoints", "점수"), /빠진 자리표시자/);
});
