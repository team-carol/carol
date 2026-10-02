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

test("parseHome: 단위(course)와 클래스(class) 이미지를 따로 읽는다", () => {
  const html = `<div class="basic_block"><img src="https://maimaidx-eng.com/maimai-mobile/img/course/course_rank_15DlEMWlRz.png" class="h_35 f_l"/>
    <img src="https://maimaidx-eng.com/maimai-mobile/img/class/class_rank_s_20OmGGNvGh.png" class="p_l_10 h_35 f_l"></div>`;
  const home = s.parseHome(html, "intl");
  assert.equal(home.courseImg, "https://maimaidx-eng.com/maimai-mobile/img/course/course_rank_15DlEMWlRz.png");
  assert.equal(home.gradeImg, "https://maimaidx-eng.com/maimai-mobile/img/class/class_rank_s_20OmGGNvGh.png");
  assert.equal(s.parseHome("<div></div>", "intl").courseImg, "");
});

const CIRCLE_HOME = `<div class="wrapper main_wrapper t_c"><div class="m_b_10 f_0"><a href="https://maimaidx-eng.com/maimai-mobile/circle/circleSearch/">s</a></div>
<div class="h_270 p_r"><div class="circle_profile_class"><img src="https://maimaidx-eng.com/maimai-mobile/img/profile/circle_profile_color_red.png"></div><div class="circle_profile_circle_name"><span>ＺＵＮＤＡＭＯＮ</span></div>
<div class="circle_profile_circle_code"><span>ZM7PK1RB</span></div>
<div class="circle_profile_user_name"><span>ＲＯＥＮＡ・∀・</span></div>
<div class="circle_profile_comment"><span>Let's maimai！</span></div></div>
<div class="town_block m_15 m_t_0 p_15 t_l"><div class="circle_totalpoint_block m_t_10"><div class="h_90 p_t_7 f_14 t_c">
<div class="circle_totalpoint_header_for_index"><span class="white f_b f_14">Circle Total Points for September</span></div>
<div class="circle_totalpoint_point f_29 f_b"><span>8,236</span><span class="black">PT</span></div></div></div>
<div class="t_c m_10 f_16"><span class="red">3</span>days until Circle Points reset</div><hr class="hr_line01">
<div class="circle_pointranking_block m_t_10"><div class="h_90 p_t_7 t_c f_20"><div class="circle_pointranking_header"><span class="darkblue f_b f_14">Current Ranking for September</span></div>
<div class="circle_pointranking_point f_29 f_b"><span class="black">Rank</span><span>609</span></div></div></div>
<div class="t_r m_10 m_b_0 f_13">2026/09/30 01:00 update</div></div>
<div class="see_through_block m_15 p_10 p_r t_l f_0"><div class="circle_pointreward_block"><div class="t_c p_t_15 f_15"><span>Next Reward</span><span class="red f_b">764</span><span>PT</span></div></div></div>
<div class="basic_block w_450 m_15 m_t_0 p_10 t_l"><div class="circle_challenge_block p_5 p_t_15">
<img src="https://maimaidx-eng.com/maimai-mobile/img/Music/af4f08eaff72cde9.png" class="w_170 m_5 f_l">
<div class="w_240 f_l t_l"><div class="m_10 m_t_5 t_r f_12 blue">GAME＆VARIETY</div><div class="m_5 f_15 break">コンティニュー！ feat. 藍月なくる</div><hr class="w_100pc"><div class="m_5 f_12 break">lapix</div></div>
<div class="circle_challenge_gauge_frame h_26 m_5 m_t_10 m_b_10 p_r"><div class="circle_challenge_gauge_status h_26 p_a" style="width:9.9628%;"></div></div>
<div class="circle_challenge_achiv_block h_25 w_410 m_5 m_b_10"><div class="circle_challenge_achiv_text h_25 p_t_5 f_r t_c f_b">99.6280%</div></div></div>
<div class="circle_challenge_forecast_block m_t_5 p_5 t_l f_14 t_c"><img src="https://maimaidx-eng.com/maimai-mobile/img/Music/81e682b1c94a1a56.png" class="circle_challenge_forecast_icon"></div></div></div>`;

const circleMember = (name, trophyClass, rating, points, leader) => `<div class="see_through_block p_r m_15 m_t_5 p_10 t_l f_0">${leader ? '<img src="https://maimaidx-eng.com/maimai-mobile/img/circle/circle_leader_icon.png" class="circle_member_leader">' : ""}
<div class="basic_block p_10 f_0"><img src="https://maimaidx-eng.com/maimai-mobile/img/Icon/a.png" class="w_112 f_l"><div class="p_l_10 f_l"><div class="trophy_block trophy_${trophyClass} p_3 t_c f_0"><div class="trophy_inner_block f_13"><span>칭호</span></div></div>
<div class="m_b_5"><div class="name_block t_l f_l f_16">${name}</div><div class="f_r t_r f_0"><div class="p_r p_3"><div class="rating_block">${rating}</div></div></div></div>
<div class="circle_member_point_block f_15"><div class="p_t_10 p_r_10 t_r">${points} PT</div></div></div></div></div>`;
const CIRCLE_MEMBERS = `<div class="wrapper main_wrapper t_c"><div class="m_15 m_t_0 m_b_0"><div class="basic_block m_3 p_5 f_11 l_h_10 t_c"><span class="f_13">Circle Members</span><span class="f_14 f_b">2</span>/20</div></div>
${circleMember("ＤＩＧＩ", "Gold", 16089, "1,200", true)}${circleMember("ＢＩＴ", "Silver", 13928, "1,970", false)}</div>`;

test("parseCircle: 서클 홈과 멤버 목록을 읽는다", () => {
  const c = s.parseCircle(CIRCLE_HOME, CIRCLE_MEMBERS);
  assert.equal(c.name, "ＺＵＮＤＡＭＯＮ");
  assert.equal(c.code, "ZM7PK1RB");
  assert.equal(c.color, "red");
  assert.equal(c.comment, "Let's maimai！");
  assert.equal(c.monthPoints, 8236);
  assert.equal(c.daysToReset, 3);
  assert.equal(c.rank, 609);
  assert.equal(c.rankUpdatedAt, "2026/09/30 01:00");
  assert.equal(c.nextRewardPoints, 764);
  assert.deepEqual(c.challenge, { title: "コンティニュー！ feat. 藍月なくる", artist: "lapix", genre: "GAME＆VARIETY", jacket: "https://maimaidx-eng.com/maimai-mobile/img/Music/af4f08eaff72cde9.png", achievement: "99.6280%", gauge: 9.9628 });
  assert.equal(c.forecastJacket, "https://maimaidx-eng.com/maimai-mobile/img/Music/81e682b1c94a1a56.png");
  assert.equal(c.memberCount, 2);
  assert.equal(c.memberMax, 20);
  assert.deepEqual(c.members, [
    { name: "ＤＩＧＩ", rating: 16089, trophy: "칭호", trophyClass: "gold", points: 1200, leader: true, icon: "https://maimaidx-eng.com/maimai-mobile/img/Icon/a.png" },
    { name: "ＢＩＴ", rating: 13928, trophy: "칭호", trophyClass: "silver", points: 1970, leader: false, icon: "https://maimaidx-eng.com/maimai-mobile/img/Icon/a.png" },
  ]);
});

test("parseCircle: 멤버 페이지가 없으면 목록만 비운다", () => {
  const c = s.parseCircle(CIRCLE_HOME, "");
  assert.equal(c.name, "ＺＵＮＤＡＭＯＮ");
  assert.equal(c.memberCount, null);
  assert.deepEqual(c.members, []);
});

test("parseCircle: 미가입이면 null, 판단할 수 없으면 undefined", () => {
  const noCircle = `<div class="wrapper main_wrapper t_c"><a href="https://maimaidx-eng.com/maimai-mobile/circle/circleSearch/">s</a><div>Not in a circle</div></div>`;
  assert.equal(s.parseCircle(noCircle), null);
  assert.equal(s.parseCircle(""), undefined);
  assert.equal(s.parseCircle("<html><body>ERROR CODE：100001</body></html>"), undefined);
});

test("parseCircle: 서클 랭킹 페이지에서 이번 달 진행도·기간·내 포인트를 읽는다", () => {
  const ranking = `<div class="wrapper main_wrapper t_c"><div class="circle_ranking_season_top white"><p class="circle_ranking_season_top_txt">October 2026</p></div>
<div class="circle_ranking_season_bottom white"><p class="circle_ranking_season_bottom_txt">Point Period 2026/10/01～2026/10/31</p></div>
<div class="circle_ranking_yourpoint_block m_t_5 p_r"><span class="circle_ranking_yourpoint_text f_16 p_a">1,234 PT</span></div>
<img src="https://maimaidx-eng.com/maimai-mobile/img/circle/circle_ranking_youebest_green.png" class="w_450"></div>`;
  const c = s.parseCircle(CIRCLE_HOME, CIRCLE_MEMBERS, "intl", ranking);
  assert.equal(c.progress, "green");
  assert.equal(c.period, "2026/10/01～2026/10/31");
  assert.equal(c.myPoints, 1234);
  const none = s.parseCircle(CIRCLE_HOME, CIRCLE_MEMBERS);
  assert.equal(none.progress, undefined);
  assert.equal(none.period, undefined);
});

const rankRow = (rank, name, pt) => {
  const top = { 1: "rank_first", 2: "rank_second", 3: "rank_third" }[rank];
  const imgs = top
    ? `<img src="https://maimaidx-eng.com/maimai-mobile/img/ranking/${top}.png" class="f_r">`
    // 오른쪽 정렬이라 DOM 에는 일의 자리부터
    : `<div class="p_5">${String(rank).split("").reverse().map((d) => `<img src="https://maimaidx-eng.com/maimai-mobile/img/ranking/rank_num_${d}.png" class="f_r">`).join("")}</div>`;
  const cls = top ? "ranking_top" : "ranking";
  return `<div class="${cls}_block f_0"><div class="${cls}_inner_block p_r"><div class="ranking_rank_block f_l">${imgs}</div>
<div class="f_l p_t_10 p_l_10 f_15">${name}</div><div class="p_t_10 p_r_10 f_r f_14">${pt} PT</div><div class="clearfix"></div></div></div>`;
};
const rankingPage = (rows) => `<div class="wrapper main_wrapper t_c"><div class="circle_ranking_season_bottom white"><p class="circle_ranking_season_bottom_txt">Point Period 2026/10/01～2026/10/31</p></div>
<img src="https://maimaidx-eng.com/maimai-mobile/img/circle/circle_ranking_youebest_red.png" class="w_450">
<div class="ranking_title_block t_l white"><div class="m_b_5 f_b f_15 break">Circle Ranking</div><span class="f_b f_12">2026/10/02 01:00 update</span></div>${rows}</div>`;

test("parseCircleRankingTable: 1~3위 이미지와 숫자 이미지(일의 자리부터)로 순위를 읽는다", () => {
  const t = s.parseCircleRankingTable(rankingPage(rankRow(1, "☆Ｌｏｎｇｋａｎｇ☆", 2896) + rankRow(4, "ＦＤＸ", 2187) + rankRow(97, "Ｓｔｒｅｇｇｅｒｓ", 903) + rankRow(100, "ｈａｚｕｋｉ", 887)));
  assert.deepEqual(t.map((e) => [e.rank, e.name, e.points]), [[1, "☆Ｌｏｎｇｋａｎｇ☆", 2896], [4, "ＦＤＸ", 2187], [97, "Ｓｔｒｅｇｇｅｒｓ", 903], [100, "ｈａｚｕｋｉ", 887]]);
});

test("parseCircle: 순위표 안에 내 서클이 있으면 바로 위·아래 서클을 neighbors 로", () => {
  const rows = rankRow(10, "ＡＢＯＶＥ", 1500) + rankRow(11, "ＺＵＮＤＡＭＯＮ", 1400) + rankRow(12, "ＢＥＬＯＷ", 1300) + rankRow(100, "ＬＡＳＴ", 887);
  const c = s.parseCircle(CIRCLE_HOME, CIRCLE_MEMBERS, "intl", rankingPage(rows));
  assert.deepEqual(c.neighbors, [
    { rank: 10, name: "ＡＢＯＶＥ", points: 1500 },
    { rank: 11, name: "ＺＵＮＤＡＭＯＮ", points: 1400, self: true },
    { rank: 12, name: "ＢＥＬＯＷ", points: 1300 },
  ]);
  assert.deepEqual(c.rankCutoff, { rank: 100, points: 887 });
});

test("parseCircle: 순위표 밖(순위 없음·100위 밖)이면 neighbors 없이 커트라인만, 빈 순위표면 둘 다 없음", () => {
  const out = s.parseCircle(CIRCLE_HOME, CIRCLE_MEMBERS, "intl", rankingPage(rankRow(1, "ＴＯＰ", 2896) + rankRow(100, "ＬＡＳＴ", 887)));
  assert.equal(out.neighbors, undefined);
  assert.deepEqual(out.rankCutoff, { rank: 100, points: 887 });
  const empty = s.parseCircle(CIRCLE_HOME, CIRCLE_MEMBERS, "intl", rankingPage('<div class="container p_10"><div class="p_5 f_14">Data is preparing.</div></div>'));
  assert.equal(empty.neighbors, undefined);
  assert.equal(empty.rankCutoff, undefined);
});
