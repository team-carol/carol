const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

test("getDailyAchievements excludes post-init score changes without new score or performance mark", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "carol-achievement-filter-"));
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
    const base = {
      achievement: "90.0000%",
      diff: "MASTER",
      level: "13",
      date: "2026/07/12 12:00",
      jacketUrl: "",
      musicKind: "SD",
      track: 1,
      fc: "",
      sync: "",
      isNewScore: false,
      isBaseSnapshot: true,
    };
    const save = (chartKey, playDay, updatedAt, record) => {
      db.saveDailyAchievementSnapshot(profileKey, playDay, chartKey, JSON.stringify(record), record.achievementVal, updatedAt, updatedAt);
    };

    save("lower", "2026-07-12", 100, { ...base, title: "Lower", achievementVal: 90 });
    save("lower", "2026-07-13", 200, { ...base, title: "Lower", achievementVal: 89, date: "2026/07/13 12:00", isBaseSnapshot: false });
    save("higher", "2026-07-12", 300, { ...base, title: "Higher", achievementVal: 90 });
    save("higher", "2026-07-13", 400, { ...base, title: "Higher", achievementVal: 91, date: "2026/07/13 12:00", isBaseSnapshot: false });
    save("new-score", "2026-07-13", 500, { ...base, title: "New score", achievementVal: 80, date: "2026/07/13 12:00", isNewScore: true, isBaseSnapshot: false });
    save("fc", "2026-07-13", 600, { ...base, title: "FC", achievementVal: 80, date: "2026/07/13 12:00", fc: "FC", isBaseSnapshot: false });
    save("lower-new-score", "2026-07-12", 700, { ...base, title: "Lower new score", achievementVal: 90 });
    save("lower-new-score", "2026-07-13", 800, { ...base, title: "Lower new score", achievementVal: 89, date: "2026/07/13 12:00", isNewScore: true, isBaseSnapshot: false });
    save("higher-new-score", "2026-07-12", 900, { ...base, title: "Higher new score", achievementVal: 90 });
    save("higher-new-score", "2026-07-13", 1000, { ...base, title: "Higher new score", achievementVal: 91, date: "2026/07/13 12:00", isNewScore: true, isBaseSnapshot: false });

    assert.equal(db.getDailyAchievementSnapshots(profileKey, "2026-07-13").length, 6);
    const rows = db.getDailyAchievements(profileKey, "2026-07-13");
    const titles = rows.map((row) => JSON.parse(row.recordJson).title).sort();
    assert.deepEqual(titles, ["FC", "Higher new score", "New score"]);
  } finally {
    db.closeDb();
    if (previousDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previousDataDir;
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
