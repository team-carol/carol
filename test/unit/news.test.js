// src/news.ts — 공지 피드 파싱 (네트워크 없이 검증 가능한 순수 파서만).
process.env.DATABASE_URL ||= "postgres://placeholder:placeholder@127.0.0.1:5432/placeholder";

const test = require("node:test");
const assert = require("node:assert/strict");
const n = require("../../dist/news");

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
  <item>
    <title>9/17(木)「超かぐや姫！ちほー」オープン！</title>
    <link>https://info-maimai.sega.jp/9577/</link>
    <pubDate>Thu, 10 Sep 2026 02:59:46 +0000</pubDate>
    <guid isPermaLink="false">https://info-maimai.sega.jp/?p=9577</guid>
    <description><![CDATA[<p>9/17(木)、新バージョン稼働と同時に、  コラボイベント開催決定！</p>]]></description>
  </item>
  <item>
    <title>9/4(金) 新曲追加！</title>
    <link>https://info-maimai.sega.jp/9369/</link>
    <pubDate>Thu, 03 Sep 2026 02:59:32 +0000</pubDate>
    <guid isPermaLink="false">https://info-maimai.sega.jp/?p=9369</guid>
    <description><![CDATA[新曲が追加されます]]></description>
  </item>
</channel>
</rss>`;

test("parseJpFeed: guid를 id로, 제목/링크/발행일/요약을 뽑는다", () => {
  const items = n.parseJpFeed(FEED);
  assert.equal(items.length, 2);
  assert.equal(items[0].id, "https://info-maimai.sega.jp/?p=9577");
  assert.equal(items[0].url, "https://info-maimai.sega.jp/9577/");
  assert.equal(items[0].title, "9/17(木)「超かぐや姫！ちほー」オープン！");
  assert.equal(items[0].publishedAt, Date.parse("Thu, 10 Sep 2026 02:59:46 +0000"));
  // description 의 HTML 태그는 벗기고 공백을 정리한다
  assert.equal(items[0].summary, "9/17(木)、新バージョン稼働と同時に、 コラボイベント開催決定！");
});

test("parseJpFeed: 항목이 없거나 guid가 없으면 건너뛴다", () => {
  assert.deepEqual(n.parseJpFeed("<rss><channel></channel></rss>"), []);
  const noGuid = `<rss><channel><item><title>x</title></item></channel></rss>`;
  assert.deepEqual(n.parseJpFeed(noGuid), []);
});

test("parseIntlBanners: image 경로로 배너 이미지 URL을 만든다", () => {
  const items = n.parseIntlBanners(JSON.stringify([
    { link: "/download/2026-09-04-2", image: "/download/2026-09-04-2/pop" },
    { link: "/download/2026-08-21", image: "/download/2026-08-21/pop" },
  ]));
  assert.equal(items.length, 2);
  assert.equal(items[0].id, "/download/2026-09-04-2/pop");
  // 사이트의 top.js 와 동일한 조립 규칙 (경로가 겹쳐 보이지만 이게 실제 URL)
  assert.equal(
    items[0].imageUrl,
    "https://maimai.sega.com/assets/img/download/pop/download/2026-09-04-2/pop.jpg",
  );
  assert.equal(items[0].title, undefined, "국제판은 이미지만");
});

test("parseIntlBanners: 배열이 아니거나 image 없는 항목은 무시", () => {
  assert.deepEqual(n.parseIntlBanners("{}"), []);
  assert.deepEqual(n.parseIntlBanners(JSON.stringify([{ link: "/x" }, null, 3])), []);
});

test("isNewsSource", () => {
  assert.equal(n.isNewsSource("jp"), true);
  assert.equal(n.isNewsSource("intl"), true);
  assert.equal(n.isNewsSource("kr"), false);
});
