// src/rankImages.ts — 북마클릿이 보낸 단위·클래스 이미지 중 DX NET 형식만 받는다.
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseRankImageItems } = require("../../dist/rankImages.js");

const PNG = "data:image/png;base64,iVBORw0KGgo=";

test("parseRankImageItems: 단위·클래스 이미지를 서버·종류·번호로", () => {
  const out = parseRankImageItems("intl", [
    { url: "https://maimaidx-eng.com/maimai-mobile/img/course/course_rank_15DlEMWlRz.png", data: PNG },
    { url: "https://maimaidx-eng.com/maimai-mobile/img/class/class_rank_s_20OmGGNvGh.png", data: PNG },
  ]);
  assert.deepEqual(out.map((x) => [x.key, x.file]), [
    ["intl:course:15", "course_rank_15DlEMWlRz.png"],
    ["intl:class:20", "class_rank_s_20OmGGNvGh.png"],
  ]);
});

test("parseRankImageItems: 다른 주소·형식은 버린다", () => {
  assert.deepEqual(parseRankImageItems("intl", [
    { url: "https://evil.example/maimai-mobile/img/course/course_rank_15DlEMWlRz.png", data: PNG },
    { url: "https://maimaidx-eng.com/maimai-mobile/img/Icon/39c1bbf3be79bcc5.png", data: PNG },
    { url: "https://maimaidx-eng.com/maimai-mobile/img/course/course_rank_15DlEMWlRz.png", data: "data:text/html;base64,PGI+" },
  ]), []);
  assert.deepEqual(parseRankImageItems("intl", "nope"), []);
});
