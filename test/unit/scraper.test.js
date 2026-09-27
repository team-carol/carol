// src/scraper.ts — DX NET 마크업 파싱. 여기선 네트워크 없이 검증 가능한 순수 파서만 다룬다.
process.env.DATABASE_URL ||= "postgres://placeholder:placeholder@127.0.0.1:5432/placeholder";

const test = require("node:test");
const assert = require("node:assert/strict");
const s = require("../../dist/scraper");

const detailHtml = (inner) => `<div class="playlog_rating_detail_block">${inner}</div>`;

test("parsePlaylogDetail: 정상 (+N) 파싱", () => {
  assert.equal(s.parsePlaylogDetail(detailHtml("RATING 13234 (+21)")).ratingUp, 21);
  assert.equal(s.parsePlaylogDetail(detailHtml("(+0)")).ratingUp, 0);
});

test("parsePlaylogDetail: (+N) 이 없으면 undefined", () => {
  assert.equal(s.parsePlaylogDetail("<div>no rating here</div>").ratingUp, undefined);
});

test("parsePlaylogDetail: 컨테이너 클래스와 무관하게 페이지 전체에서 찾는다", () => {
  // 레이팅 상세 블록의 클래스명이 바뀌거나 다른 구조로 감싸여 있어도 파싱되어야 한다.
  assert.equal(s.parsePlaylogDetail('<div class="something_else">RATING 13234 (+23)</div>').ratingUp, 23);
  assert.equal(s.parsePlaylogDetail("<body><span>13234</span><span>(+7)</span></body>").ratingUp, 7);
});

test("parsePlaylogDetail: script/style 안의 (+N) 은 무시한다", () => {
  assert.equal(s.parsePlaylogDetail('<script>var x = "(+999)";</script><div>(+12)</div>').ratingUp, 12);
  assert.equal(s.parsePlaylogDetail('<script>var x = "(+12)";</script>').ratingUp, undefined);
});

test("parsePlaylogDetail: 다른 모드 상세 페이지의 비현실적 (+N) 은 버린다", () => {
  // 宴/코스 등에서 (+N) 이 레이팅 증가분이 아닌 값으로 잘못 잡히는 경우
  assert.equal(s.parsePlaylogDetail(detailHtml("(+9999)")).ratingUp, undefined);
  assert.equal(s.parsePlaylogDetail(detailHtml("(+401)")).ratingUp, undefined);
  // 이론상 단일 채보 최대치(약 338) 부근까지는 통과 (신규 유저 첫 플레이 등)
  assert.equal(s.parsePlaylogDetail(detailHtml("(+338)")).ratingUp, 338);
});

test("parseUserOptions: select 값·라벨·설명·선택지를 읽는다", () => {
  const html = `<form action="https://maimaidx-eng.com/maimai-mobile/home/userOption/updateUserOption/update/" method="post">
    <table><tbody><tr><td>TAP SPEED</td><td class="t_r"><select name="noteSpeed"><option value="0">1.00</option><option value="1" selected="selected">1.25</option></select></td></tr>
    <tr><td colspan="2" class="f_11 gray">Setting of the TAP-Ring speed</td></tr></tbody></table>
    <table><tbody><tr><td>MIRROR MODE</td><td><select name="mirrorMode"><option value="0">OFF</option><option value="1">&#8645;</option></select></td></tr></tbody></table>
    <input type="hidden" name="token" value="secret"></form>`;
  const r = s.parseUserOptions(html);
  assert.equal(r.length, 2);
  assert.deepEqual(r[0], { name: "noteSpeed", label: "TAP SPEED", desc: "Setting of the TAP-Ring speed", value: "1", options: [["0", "1.00"], ["1", "1.25"]] });
  assert.equal(r[1].value, "0"); // selected 가 없으면 첫 선택지
  assert.equal(r[1].desc, "");
  assert.ok(!JSON.stringify(r).includes("secret"));
});

test("parseUserOptions: 폼이 없으면 빈 배열", () => {
  assert.deepEqual(s.parseUserOptions("<html><body>ERROR</body></html>"), []);
  assert.deepEqual(s.parseUserOptions(""), []);
});
