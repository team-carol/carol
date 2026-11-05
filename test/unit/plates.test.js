const test = require("node:test");
const assert = require("node:assert/strict");
const { plateDefs, findPlate, plateCharts, meetsPlate, plateProgress, recordMap, heldPlates, defaultPlateType, plateImageId } = require("../../dist/plates.js");

let nextId = 1;
const chart = (title, version, diff = "MASTER", kind = "DX", constant = 13) => ({ id: nextId++, title, kind, diff, level: String(Math.floor(constant)), constant, version });
const rec = (title, diff, achievementVal, fc = "", sync = "", kind = "DX") => ({ title, musicKind: kind, diff, achievementVal, achievement: `${achievementVal}%`, fc, sync, level: "13", date: "", jacketUrl: "", track: 0 });

test("plateDefs: 真(두 버전, 将 없음) → 輝 → 舞(옛 버전 전체, 覇者·Re:MASTER) → 熊 → 최신 직전까지", () => {
  const defs = plateDefs(26); // 국제판 CiRCLE PLUS(26)는 아직 플레이트가 없다
  const prefixes = defs.map((d) => d.prefix);
  assert.equal(prefixes[0], "真");
  assert.deepEqual(defs[0].versions, [0, 1]);
  assert.deepEqual(defs[0].types, ["極", "神", "舞舞"]);
  assert.equal(prefixes.indexOf("舞"), prefixes.indexOf("輝") + 1);
  const mai = findPlate(defs, "舞");
  assert.equal(mai.versions.length, 13);
  assert.ok(mai.reMaster && mai.types.includes("覇者"));
  assert.equal(prefixes[prefixes.length - 1], "丸");
  assert.ok(!prefixes.includes("廻"));
  assert.equal(plateDefs(27).at(-1).prefix, "廻"); // 내수판은 MAGiCAL(27)이 최신
});

test("plateCharts: 버전 플레이트는 BASIC~MASTER, 舞 는 Re:MASTER 까지, 빠지는 곡은 뺀다", () => {
  const defs = plateDefs(26);
  const charts = [
    chart("A", 19, "MASTER"), chart("A", 19, "Re:MASTER"), chart("B", 18, "MASTER"),
    chart("Old", 5, "EXPERT", "ST"), chart("Old", 5, "Re:MASTER", "ST"),
    chart("ジングルベル", 0, "MASTER", "ST"), chart("Plus", 1, "BASIC", "ST"),
  ];
  assert.deepEqual(plateCharts(findPlate(defs, "祭"), charts).map((c) => `${c.title}/${c.diff}`), ["A/MASTER"]);
  assert.deepEqual(plateCharts(findPlate(defs, "舞"), charts).map((c) => `${c.title}/${c.diff}`), ["Old/EXPERT", "Old/Re:MASTER", "Plus/BASIC"]);
  assert.deepEqual(plateCharts(findPlate(defs, "真"), charts).map((c) => c.title), ["Plus"]);
});

test("meetsPlate: 極 FC 이상, 将 SSS 이상, 神 AP 이상, 舞舞 FDX 이상, 覇者 80% 이상", () => {
  const r = (ach, fc, sync) => rec("X", "MASTER", ach, fc, sync);
  assert.deepEqual(["極", "将", "神", "舞舞", "覇者"].map((t) => meetsPlate(t, r(100.2, "FC+", "FS+"))), [true, true, false, false, true]);
  assert.deepEqual(["極", "将", "神", "舞舞", "覇者"].map((t) => meetsPlate(t, r(99.9, "AP", "FDX"))), [true, false, true, true, true]);
  assert.equal(meetsPlate("覇者", r(79.9, "", "")), false);
  assert.equal(meetsPlate("極", undefined), false);
});

test("plateProgress: 종류별 달성 수와 가까운 순 남은 보면, 기본 종류는 남은 보면이 가장 적은 것", () => {
  const def = findPlate(plateDefs(26), "祭");
  const charts = [chart("P", 19, "MASTER", "DX", 14.5), chart("Q", 19, "MASTER", "DX", 13.2), chart("R", 19, "EXPERT", "DX", 11.0), chart("S", 19, "MASTER", "ST", 12.0)];
  const records = recordMap([
    rec("P", "MASTER", 100.6, "FC"),
    rec("Q", "MASTER", 99.5, "AP", "FDX"),
    rec("R", "EXPERT", 100.1, "FC+"),
  ]);
  const p = plateProgress(def, charts, records);
  assert.equal(p.total, 4);
  assert.deepEqual([p.done["極"], p.done["将"], p.done["神"], p.done["舞舞"]], [3, 2, 1, 1]);
  // 将 남은 보면: 친 Q(99.5) 먼저, 안 친 S 뒤
  assert.deepEqual(p.remaining["将"].map((s) => s.chart.title), ["Q", "S"]);
  // 極 남은 보면은 S 하나뿐 → 기본 종류
  assert.equal(defaultPlateType(p), "極");
  assert.equal(heldPlates([p]), 0);
  const all = plateProgress(def, charts.slice(0, 1), records);
  assert.equal(heldPlates([all]), 2); // P 하나뿐인 플레이트: 極·将 완료
});

test("plateImageId: 게임 이름표 번호(LXNS 자원 번호)", () => {
  const cases = [
    ["真", "極", 6101], ["真", "舞舞", 6103], ["真", "将", null],
    ["超", "将", 6105], ["菫", "極", 6132], ["輝", "舞舞", 6147],
    ["舞", "覇者", 6148], ["舞", "極", 6149], ["舞", "舞舞", 6152],
    ["熊", "極", 55101], ["華", "神", 109103], ["爽", "将", 159102], ["祭", "極", 359101], ["鏡", "舞舞", 559104], ["廻", "極", 709101],
    ["祭", "覇者", null], ["?", "極", null],
  ];
  for (const [prefix, type, id] of cases) assert.equal(plateImageId(prefix, type), id, `${prefix}${type}`);
});
