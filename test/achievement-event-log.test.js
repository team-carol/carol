const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function event(profileKey, id, playedAt, ratingUp = null, value = 90) {
  return { profileKey, sourcePlayId: id, playedAt, sourceSequence: 1, recordJson: JSON.stringify({ title: id, diff: "MASTER", achievementVal: value }), achievementVal: value, fc: "", sync: "", ratingUp, title: id, diff: "MASTER", level: "10", musicKind: "", achievementText: "" };
}

test("canonical baseline, atomic validation, raw post-baseline events, dedupe and KST range", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "carol-achievement-event-log-"));
  const previous = process.env.DATA_DIR; process.env.DATA_DIR = dataDir;
  const db = require("../dist/db");
  try {
    const profile = db.cacheProfile({ friendCode: "1234567890123", playerName: "QA", rating: 1, ratingMax: 1, trophy: "", trophyClass: "normal", avatar: "", gradeImg: "", stars: "0", totalPlayCount: 2 }, 2, "");
    const baseline = [event(profile, "old-1", Date.UTC(2026, 6, 13, 19)), event(profile, "old-2", Date.UTC(2026, 6, 13, 20))];
    assert.equal(db.saveAchievementPlayEventLogBatch(baseline, 1000), "initialized");
    assert.equal(db.saveAchievementPlayEventLogBatch([event(profile, "new-1", Date.UTC(2026, 6, 14, 19), null, 1), event(profile, "new-2", Date.UTC(2026, 6, 14, 20), 4, 80)]), "ok");
    assert.equal(db.saveAchievementPlayEventLogBatch([event(profile, "new-1", Date.UTC(2026, 6, 14, 19), 9)]), "ok");
    assert.equal(db.saveAchievementPlayEventLogBatch([event(profile, "new-3", Date.UTC(2026, 6, 14, 18), null, 70)]), "ok");
    const rows = db.getAchievementPlayEventLog(profile, Date.UTC(2026, 6, 14, 20), Date.UTC(2026, 6, 15, 20));
    assert.deepEqual(rows.map((row) => row.sourcePlayId), ["new-2"]);
    assert.equal(db.getAchievementPlayEventLog(profile, 0, Date.UTC(2026, 6, 15, 20)).find((r) => r.sourcePlayId === "new-1").ratingUp, 9);
    assert.equal(db.getDailyAchievements(profile, "2026-07-14").length, 2);
    const noRating = JSON.parse(db.getDailyAchievements(profile, "2026-07-14").find((row) => JSON.parse(row.recordJson).title === "new-3").recordJson);
    assert.equal(noRating.ratingUp, undefined);
    const withRating = JSON.parse(db.getDailyAchievements(profile, "2026-07-15")[0].recordJson);
    assert.equal(withRating.ratingUp, 4);
    db.saveDailyAchievement(profile, "2026-07-16", "legacy", JSON.stringify({ title: "legacy", diff: "MASTER" }), 99, Date.UTC(2026, 6, 16, 21));
    assert.equal(db.getDailyAchievements(profile, "2026-07-16").length, 0); // marker means no legacy fallback
    const diffs = ["basic", "advanced", "expert", "master", "remaster"];
    const catalogPages = diffs.map((diff, index) => `<div class="music_${diff}_score_back"><input name="idx" value="catalog-${index}"><div class="music_name_block">Catalog ${index}</div><div class="music_lv_block">10</div><div class="music_score_block">90%</div><img src="/img/diff_${diff}.png"></div>`);
    assert.deepEqual(db.saveChartRecordCatalogBatch(profile, catalogPages, 5000), { rowCount: 5 });
    assert.equal(db.saveChartRecordCatalogBatch(profile, catalogPages, 6000).rowCount, 5);
    assert.equal(db.getChartRecordBaselines(profile).find((row) => row.scoreLocator === "catalog-0").changedAt, 5000);
    const changedPages = catalogPages.slice(); changedPages[0] = changedPages[0].replace("90%", "91%");
    db.saveChartRecordCatalogBatch(profile, changedPages, 7000);
    const changed = db.getChartRecordBaselines(profile).find((row) => row.scoreLocator === "catalog-0");
    assert.equal(changed.changedAt, 7000);
    assert.equal(changed.observedAt, 7000);
    assert.throws(() => db.saveChartRecordCatalogBatch(profile, catalogPages.slice(0, 4)), /five pages/);
    assert.equal(db.getChartRecordBaselines(profile).length, 5);
    assert.throws(() => db.saveAchievementPlayEventLogBatch([event(profile, "bad", 0)]));
    assert.throws(() => db.saveAchievementPlayEventLogBatch([event(profile, "dup", 1), event(profile, "dup", 2)]));
  } finally {
    db.closeDb(); if (previous === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = previous;
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
