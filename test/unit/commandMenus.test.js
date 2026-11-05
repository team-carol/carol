// 명령어 덮어쓰기(/관리 → 명령어)와 /곡추천·/랜덤 조건 인코딩(customId 에 담는 값).
const test = require("node:test");
const assert = require("node:assert/strict");
const co = require("../../dist/commandOverrides.js");
const songrec = require("../../dist/bot/commands/songrec.js");
const random = require("../../dist/bot/commands/random.js");

const DEF = {
  name: "곡추천", description: "기본 설명", type: 1,
  options: [
    { name: "레벨", description: "레벨 설명", type: 3 },
    { name: "필수", description: "필수 설명", type: 3, required: true },
    { name: "user", description: "유저", type: 6 },
  ],
};

test("applyOverride: 이름·설명·옵션 설명을 바꾸고, 순서를 바꿔도 필수 옵션은 앞에", () => {
  const out = co.applyOverride(DEF, { name: "추천", description: "새 설명", order: ["user", "레벨", "필수"], optionDescriptions: { user: "누구" } });
  assert.equal(out.name, "추천");
  assert.equal(out.description, "새 설명");
  assert.deepEqual(out.options.map((o) => o.name), ["필수", "user", "레벨"]);
  assert.equal(out.options[1].description, "누구");
  assert.equal(co.applyOverride(DEF, undefined), DEF);
});

test("validateOverride: 디스코드 이름 규칙·중복·옵션 순서를 검사한다", () => {
  co.setCommandDefinitions([{ key: "곡추천", json: DEF }, { key: "랜덤", json: { name: "랜덤", description: "d", type: 1 } }], async () => {});
  assert.equal(co.validateOverride("곡추천", { name: "추천" }), null);
  assert.ok(co.validateOverride("곡추천", { name: "Song" })); // 대문자
  assert.ok(co.validateOverride("곡추천", { name: "곡 추천" })); // 공백
  assert.ok(co.validateOverride("곡추천", { name: "랜덤" })); // 다른 명령 이름
  assert.ok(co.validateOverride("곡추천", { order: ["레벨", "user"] })); // 옵션 빠짐
  assert.ok(co.validateOverride("곡추천", { description: "" }));
  assert.ok(co.validateOverride("없는명령", {}));
});

test("곡추천 조건: customId 값으로 갔다가 그대로 돌아온다", () => {
  const s = { mode: "l", level: "14+", criterion: "ALL_PERFECT", diff: "MASTER", kind: "DX", category: "new", play: "unplayed", count: 5, target: "123456789012345678" };
  const code = songrec.encodeRecState(s);
  assert.deepEqual(songrec.decodeRecState(code), s);
  assert.ok(`rec:s:cr:${s.target}:${s.target}:${code}`.length <= 100);
  // 레벨이 없으면 레이팅 모드, 이상한 값은 버린다
  assert.equal(songrec.decodeRecState(`l........${s.target}`).mode, "r");
  assert.equal(songrec.decodeRecState("x.1.2.3"), null);
});

test("랜덤 조건: 36진수 사용자 id 와 함께 customId 100자 안에서 돌아온다", () => {
  const s = { min: 13.7, max: 14.5, kind: "ST", diff: "Re:MASTER", genre: "", version: "", plus: "", play: "N", count: 4, target: "987654321098765432", playlist: 1234567890, era: "dx" };
  const code = random.encodeRandomState(s);
  assert.deepEqual(random.decodeRandomState(code), s);
  assert.equal(random.fromB36(random.toB36(s.target)), s.target);
  const key = random.toB36(s.target);
  assert.ok(`rnd:s:mn:${key}:${key}:${code}`.length <= 100);
});

test("maishiftVersionId: 세대·PLUS → maishift 버전 번호", () => {
  const names = require("../../dist/constants.js").VERSION_NAMES;
  const id = (name, plus) => random.maishiftVersionId(names.indexOf(name), plus);
  assert.equal(id("maimai", false), 0);
  assert.equal(id("maimai", true), 1);
  assert.equal(id("FiNALE", false), 12);
  assert.equal(id("でらっくす", false), 13);
  assert.equal(id("でらっくす", true), 14);
  assert.equal(id("CiRCLE", true), 26);
  assert.equal(id("MAGiCAL", false), 27);
  assert.equal(id("MAGiCAL", true), 28);
});
