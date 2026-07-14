const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCatalogScoreList } = require("../dist/scraper");

function page(idx = "opaque-1", diff = "basic") {
  return `<div class="music_${diff}_score_back"><input name="idx" value="${idx}"><div class="music_name_block">Catalog Song</div><div class="music_lv_block">10</div><div class="music_score_block">98.7654%</div><img src="/img/diff_${diff}.png"><img src="/img/music_icon_fc.png"></div>`;
}
function pageWith(title, score) {
  return `<div class="music_basic_score_back"><input name="idx" value="opaque-title"><div class="music_name_block">${title}</div><div class="music_lv_block">10</div><div class="music_score_block">${score}</div><img src="/img/diff_basic.png"></div>`;
}

test("catalog parser extracts opaque locator and rejects duplicates/truncated pages", () => {
  const row = parseCatalogScoreList(page(), "BASIC")[0];
  assert.equal(row.scoreLocator, "opaque-1");
  assert.equal(row.diff, "BASIC");
  assert.equal(row.achievementVal, 98.7654);
  assert.equal(row.fc, "FC");
  assert.throws(() => parseCatalogScoreList(page("same") + page("same"), "BASIC"));
  assert.throws(() => parseCatalogScoreList(`${page()}<div>Page 1 of 2</div>`, "BASIC"));
  assert.deepEqual(parseCatalogScoreList(`<form action="/maimai-mobile/musicSort/search/"><div class="music_sort">0 results</div></form>`, "BASIC"), []);
  assert.equal(parseCatalogScoreList(pageWith("　", "95%"), "BASIC")[0].title, "　");
  assert.throws(() => parseCatalogScoreList(`<form action="/maimai-mobile/musicSort/search/">login required</form>`, "BASIC"));
  assert.throws(() => parseCatalogScoreList(pageWith("Bad", "—"), "BASIC"));
  assert.throws(() => parseCatalogScoreList(pageWith("Bad", "102%"), "BASIC"));
});
