const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

test("storage facade loads SQLite lazily and returns promises", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "carol-storage-contract-"));
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = dir;
  try {
    const storage = require("../dist/storage");
    const initialized = storage.initializeStorage();
    assert.equal(typeof initialized.then, "function");
    await initialized;
    const profiles = storage.getAllCachedProfiles();
    assert.equal(typeof profiles.then, "function");
    assert.deepEqual(await profiles, []);
    await storage.closeStorage();
  } finally {
    if (previous === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
