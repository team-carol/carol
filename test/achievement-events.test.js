const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

test("saveAchievementEvent stores canonical per-user song history rows in order", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "carol-achievement-events-"));
  const previousDataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = dataDir;
  const db = require("../dist/db");

  try {
    const profileKey = db.cacheProfile({
      friendCode: "1234567890123",
      playerName: "QA",
      rating: 10000,
      ratingMax: 10000,
      trophy: "",
      trophyClass: "normal",
      avatar: "",
      gradeImg: "",
      stars: "0",
      comment: "",
      totalPlayCount: 10,
    }, 10, "");

    db.saveAchievementEvent(profileKey, "2026-07-13", "song-a:MASTER", JSON.stringify({
      title: "Song A",
      diff: "MASTER",
      achievementVal: 90,
      fc: "",
      sync: "",
    }), 90, 1000, 1001);
    db.saveAchievementEvent(profileKey, "2026-07-13", "song-a:MASTER", JSON.stringify({
      title: "Song A",
      diff: "MASTER",
      achievementVal: 91,
      fc: "FC",
      sync: "",
    }), 91, 2000, 2001);

    const rows = db.getAchievementEvents(profileKey, "2026-07-13");
    assert.equal(rows.length, 2);
    assert.equal(rows[0].achievementVal, 90);
    assert.equal(rows[1].achievementVal, 91);
    assert.equal(rows[1].recordJson.includes('"FC"'), true);

    const canonical = (detailIdx, ratingUp, sourceSequence, playedAt) => db.saveAchievementPlayEvent({
      profileKey, playDay: "2026-07-13", chartKey: "song-a:MASTER", detailIdx,
      sourceSequence, playedAt, recordJson: JSON.stringify({ detailIdx, ratingUp }),
      achievementVal: 95, ratingUp, title: "Song A", diff: "MASTER", fc: "FC", sync: "",
    });
    canonical("play-2", null, 1, 3000);
    canonical("play-1", 12, 2, 3000);
    canonical("play-1", 14, 99, 3000); // same identity: only null -> non-null is allowed
    canonical("play-2", 7, 1, 3000); // idempotent replay
    const eventRows = db.getAchievementPlayEvents(profileKey, "2026-07-13");
    assert.equal(eventRows.length, 2);
    assert.deepEqual(eventRows.map((row) => row.detailIdx), ["play-2", "play-1"]);
    assert.equal(eventRows[0].ratingUp, 7);
    assert.equal(eventRows[1].ratingUp, 12);
  } finally {
    db.closeDb();
    if (previousDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previousDataDir;
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
