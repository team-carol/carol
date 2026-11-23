// 디자인 미리보기 서버 (npm run preview). DB·config·Discord 없이 웹 페이지와 북마클릿 오버레이를
// 가짜 데이터로 띄운다. 페이지 함수는 실제 서버와 같은 것을 쓰고, 데이터와 API 응답만 흉내 낸다.
//
//  - 웹 페이지: 설치 안내·설정·게임 설정·관리 탭 6개·약관·채보 플레이어
//  - 북마클릿: 가짜 DX NET 페이지(/maimai-mobile/)에서 추가 북마클릿·옵션 프리셋 북마클릿을,
//    가짜 simai wiki 목록(/simai/pages/32.html)에서 채보 등록 북마클릿을 실제 코드 그대로 실행한다.
//    도메인 확인(maimaidx.jp / maimaidx-eng.com)만 이 서버가 내려줄 때 통과하도록 바꾼다.
//
// 운영 서버(index.ts)는 이 파일을 쓰지 않는다.

import * as http from "http";
import { BASE_CSS, pageHead, topbar, siteFooter } from "./theme";
import { BRAND_AVATAR_PNG } from "./brandAvatar";
import { guidePage } from "./guidePage";
import { settingsPage } from "./settingsPage";
import { optionsPage } from "./optionsPage";
import { aliasAdminPage } from "./aliasAdminPage";
import { artistAliasAdminPage } from "./artistAliasAdminPage";
import { namesAdminPage } from "./namesAdminPage";
import { messagesAdminPage } from "./messagesAdminPage";
import { commandsAdminPage } from "./commandsAdminPage";
import { importBookmarkletPage } from "./importPage";
import { patchNotesAdminPage } from "./patchNotesAdminPage";
import { privacyPage, termsPage } from "./legalPages";
import { chartPlayerPage, chartNotFoundPage } from "./chartPlayer";
import { buildBookmarklet, buildBookmarkletJs, setBaseUrl } from "./bookmarklet";
import { OPTION_CLIENT_JS, buildOptionBookmarklet } from "./optionPreset";
import { IMPORT_CLIENT_JS } from "./importClient";
import { parseMaidata } from "../simai/parse";
import type { Chart } from "../simai/types";
import type { ArtistAliasRow, OptionPresetRow, OptionSnapshot, PatchNoteRow, SongAliasRow, UserOptionField } from "../storage/types";

const PORT = Number(process.env.PREVIEW_PORT) || 3457;
const BASE = `http://localhost:${PORT}`;
const TOKEN = "preview";
setBaseUrl(BASE);

// ─── 가짜 데이터 ───────────────────────────────────────────────────────────

const now = Date.now();
const DAY = 86_400_000;

/** 가짜 DX NET 옵션 페이지의 항목. 옵션 프리셋 북마클릿과 /options 가 같이 쓴다. */
const OPTION_FIELDS: UserOptionField[] = [
  { name: "noteSpeed", label: "노트 속도", desc: "", value: "65", options: [["60", "6.00"], ["65", "6.50"], ["70", "7.00"], ["75", "7.50"]] },
  { name: "touchSpeed", label: "터치 속도", desc: "", value: "60", options: [["55", "5.50"], ["60", "6.00"], ["65", "6.50"]] },
  { name: "adjustTiming", label: "판정 타이밍", desc: "", value: "0", options: [["-2", "-0.2"], ["0", "0.0"], ["2", "+0.2"]] },
  { name: "mirrorMode", label: "미러", desc: "", value: "0", options: [["0", "OFF"], ["1", "좌우"], ["2", "상하"]] },
  { name: "brightness", label: "밝기", desc: "", value: "2", options: [["1", "어둡게"], ["2", "보통"], ["3", "밝게"]] },
  { name: "dispJudge", label: "판정 표시", desc: "", value: "1", options: [["0", "OFF"], ["1", "ON"]] },
  { name: "tapDesign", label: "TAP 디자인", desc: "", value: "0", options: [["0", "기본"], ["1", "클래식"]] },
  { name: "ansVolume", label: "가이드음", desc: "", value: "3", options: [["0", "OFF"], ["3", "3"], ["5", "5"]] },
  { name: "breakSe", label: "BREAK 효과음", desc: "", value: "0", options: [["0", "기본"], ["1", "샤프"]] },
];
const optionValues: Record<string, string> = Object.fromEntries(OPTION_FIELDS.map((f) => [f.name, f.value]));
const optionSnapshot = (): OptionSnapshot => ({
  server: "intl", syncedAt: now - DAY / 3,
  fields: OPTION_FIELDS.map((f) => ({ ...f, value: optionValues[f.name] })),
});

let presetSeq = 3;
const presets: OptionPresetRow[] = [
  { id: 1, name: "평소", server: "intl", values: { noteSpeed: "65", mirrorMode: "0" }, labels: { noteSpeed: ["노트 속도", "6.50"], mirrorMode: ["미러", "OFF"] }, updatedAt: now - 2 * DAY },
  { id: 2, name: "연습용", server: "intl", values: { noteSpeed: "75", mirrorMode: "1", brightness: "3" }, labels: { noteSpeed: ["노트 속도", "7.50"], mirrorMode: ["미러", "좌우"], brightness: ["밝기", "밝게"] }, updatedAt: now - DAY },
];

let aliasSeq = 4;
const aliases: SongAliasRow[] = [
  { id: 1, title: "PANDORA PARADOXXX", alias: "판도라", isTranslation: false },
  { id: 2, title: "PANDORA PARADOXXX", alias: "판도라 패러독스", isTranslation: true },
  { id: 3, title: "系ぎて", alias: "츠나기테", isTranslation: false },
];
const SONGS = [
  { title: "PANDORA PARADOXXX", version: 13, versionName: "FiNALE", region: null },
  { title: "系ぎて", version: 18, versionName: "UNiVERSE", region: null },
  { title: "Xaleid◆scopiX", version: 15, versionName: "Splash", region: null },
  { title: "ハードモード", version: 21, versionName: "BUDDiES", region: "jp" as const },
  { title: "Garakuta Doll Play", version: 3, versionName: "GreeN", region: null },
];

const ARTISTS = [
  { artist: "ARForest", songs: ["Xaleid◆scopiX"] },
  { artist: "かめりあ", songs: ["PANDORA PARADOXXX", "ハードモード"] },
  { artist: "じーざす（ワンダフル☆オポチュニティ！）", songs: ["系ぎて"] },
  { artist: "LeaF", songs: ["Garakuta Doll Play"] },
];
let artistAliasSeq = 3;
const artistAliases: ArtistAliasRow[] = [
  { id: 1, artist: "かめりあ", alias: "카메리아", isTranslation: true },
  { id: 2, artist: "かめりあ", alias: "camellia", isTranslation: false },
];

let noteSeq = 4;
let patchNotes: PatchNoteRow[] = [
  { id: 3, version: "2.2.0", title: "", body: "## 새 기능\n- **/곡추천**에 조건 창이 생겼습니다.\n- 명령어 관리 탭\n-# 문의는 /문의", publishedAt: now - DAY, createdAt: now - 2 * DAY, updatedAt: now - DAY, seen: 128 },
  { id: 2, version: "2.2.1", title: "버그 수정", body: "- /플레이트 수가 어긋나던 문제", publishedAt: 0, createdAt: now - DAY / 2, updatedAt: now - DAY / 2, seen: 0 },
  { id: 1, version: "2.1.0", title: "", body: "- /스탬프 추가", publishedAt: now - 30 * DAY, createdAt: now - 31 * DAY, updatedAt: now - 30 * DAY, seen: 342 },
];

const SAMPLE_MAIDATA = `&title=Preview Song
&artist=team carol
&wholebpm=150
&lv_4=13+
&des_4=carol
&inote_4=(150){4}1,2,3,4,{8}5,6,7,8,{4}1-5[4:1],3b,B3,C,{4}1h[4:1],5,E1,2/6,{8}1,2,3,4,5,6,7,8,{4}8>4[4:1],,1b,5b,E
`;
const sampleChart = parseMaidata(SAMPLE_MAIDATA).charts[4] as Chart;

// ─── 가짜 DX NET / simai wiki ─────────────────────────────────────────────

type Scenario = "ok" | "partial" | "nochange" | "init";
const SCENARIOS: [Scenario, string][] = [["ok", "성공"], ["partial", "일부 실패"], ["nochange", "이미 최신"], ["init", "첫 동기화"]];

function scenarioOf(req: http.IncomingMessage): Scenario {
  const m = /(?:^|;\s*)preview_scenario=(\w+)/.exec(req.headers.cookie ?? "");
  return (SCENARIOS.find(([s]) => s === m?.[1])?.[0]) ?? "ok";
}

/** 실제 북마클릿 코드에서 도메인 확인만 통과시킨다(미리보기 서버가 내려줄 때만). */
function allowPreviewHost(js: string): string {
  const guard = "var h=location.hostname";
  if (!js.includes(guard)) throw new Error("bookmarklet host guard not found");
  return js.replace(guard, "var h='maimaidx-eng.com'");
}

function fakePage(title: string, body: string): string {
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;font:14px/1.6 system-ui,sans-serif;background:#e9f2fb;color:#222}
.bar{background:#3a7bd5;color:#fff;padding:10px 16px;font-weight:700}.wrap{max-width:720px;margin:0 auto;padding:16px}
.box{background:#fff;border-radius:10px;padding:14px 16px;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,.12)}
button,select{font:inherit}.run{display:flex;gap:8px;flex-wrap:wrap}.run button{padding:8px 14px;border-radius:8px;border:1px solid #3a7bd5;background:#fff;color:#3a7bd5;cursor:pointer}
.run button.main{background:#3a7bd5;color:#fff}.muted{color:#667;font-size:12px}table{border-collapse:collapse}td{padding:4px 10px 4px 0}</style>
</head><body><div class="bar">${title} <span style="font-weight:400;opacity:.8">· 캐롤봇 디자인 미리보기용 가짜 페이지</span></div><div class="wrap">${body}</div></body></html>`;
}

function dxnetHome(scenario: Scenario): string {
  return fakePage("maimai DX NET (preview)", `
<div class="box"><b>북마클릿 실행</b>
<p class="muted">실제 북마클릿 코드를 그대로 실행합니다. DX NET 페이지 요청과 캐롤봇 /sync 응답은 이 서버가 흉내 냅니다.</p>
<div class="run">
<button class="main" onclick="runScript('/bookmarklet.js?code=${TOKEN}')">캐롤봇 추가 북마클릿</button>
<button onclick="runScript('/bookmarklet.js?code=${TOKEN}&notice=1')">+ 공지·만료 안내 포함</button>
<button onclick="runScript('/option.js?code=${TOKEN}')">옵션 프리셋 북마클릿</button>
</div>
<p style="margin:12px 0 0">동기화 결과: <select id="sc" onchange="document.cookie='preview_scenario='+this.value+';path=/';">
${SCENARIOS.map(([s, l]) => `<option value="${s}"${s === scenario ? " selected" : ""}>${l}</option>`).join("")}</select></p>
</div>
<div class="box"><b>PLAYER</b><p>preview_player · RATING 15,000</p><p class="muted">이 영역은 오버레이 뒤 배경을 보기 위한 자리입니다.</p></div>
<div class="box"><a href="/maimai-mobile/home/userOption/updateUserOption/">옵션 설정 페이지</a> · <a href="/">미리보기 목록</a></div>
<script>
document.cookie='preview_scenario='+document.getElementById('sc').value+';path=/';
function runScript(src){var s=document.createElement('script');s.src=src+(src.indexOf('?')>-1?'&':'?')+'v='+Date.now();document.body.append(s);}
</script>`);
}

function dxnetOptionPage(): string {
  const rows = OPTION_FIELDS.map((f) => `<tr><td>${f.label}</td><td><select name="${f.name}">${f.options.map(([v, l]) =>
    `<option value="${v}"${optionValues[f.name] === v ? " selected" : ""}>${l}</option>`).join("")}</select></td></tr>`).join("");
  return fakePage("オプション設定 (preview)", `<div class="box"><form method="post" action="/maimai-mobile/home/userOption/updateUserOption/update/">
<input type="hidden" name="token" value="preview-csrf"><table>${rows}</table><p><button type="submit">保存</button></p></form></div>
<div class="box run"><button class="main" onclick="var s=document.createElement('script');s.src='/option.js?code=${TOKEN}&v='+Date.now();document.body.append(s)">옵션 프리셋 북마클릿 실행</button> <a href="/maimai-mobile/">DX NET 홈</a></div>`);
}

const WIKI_SONGS = [
  { page: 1001, title: "Preview Song A" },
  { page: 1002, title: "Preview Song B" },
  { page: 1003, title: "Preview Song C" },
];

function wikiList(): string {
  return fakePage("simai wiki 公式譜面データ (preview)", `<div class="box" id="wikibody"><h2>公式譜面データ（スタンダード）</h2><ul>
${WIKI_SONGS.map((s) => `<li><a href="/simai/pages/${s.page}.html">${s.title}</a> <a href="/simai/pages/31.html">13</a></li>`).join("")}</ul></div>
<div class="box run"><button class="main" onclick="window.__carolImport={base:location.origin,code:'${TOKEN}'};var s=document.createElement('script');s.src='/import.js?t='+Date.now();document.body.append(s)">채보 등록 북마클릿 실행</button> <a href="/">미리보기 목록</a></div>`);
}

function wikiSong(page: number): string {
  const song = WIKI_SONGS.find((s) => s.page === page) ?? { page, title: `Song ${page}` };
  return `<!DOCTYPE html><html><head><title>${song.title}〈スタンダード〉 - simai</title></head><body><div id="wikibody">
<table><tr><th>アーティスト</th><td>team carol</td></tr></table>
<table><tr><th>BPM</th><th>BASIC</th><th>MASTER</th></tr><tr><td>150</td><td>3</td><td>13+</td></tr></table>
<h2>BASIC</h2><div>(150){4}1,2,3,4,E</div><h2>MASTER</h2><div>(150){8}1,2,3,4,5,6,7,8,{4}1-5[4:1],,,,E</div>
</div></body></html>`;
}

// ─── 미리보기 목록 ───────────────────────────────────────────────────────

function indexPage(): string {
  const groups: [string, [string, string][]][] = [
    ["사용자 페이지", [["/sync", "추가 북마클릿 설치 안내"], ["/settings", "설정"], ["/options", "게임 설정"]]],
    ["관리 페이지", [["/admin/aliases", "곡 별명"], ["/admin/artists", "아티스트 별명"], ["/admin/names", "이름 번역"], ["/admin/messages", "봇 문구"], ["/admin/commands", "명령어"], ["/admin/import", "채보 등록"], ["/admin/patch-notes", "패치노트"]]],
    ["공개 페이지", [["/chart", "채보 플레이어"], ["/chart/missing", "채보 없음"], ["/terms", "이용약관"], ["/privacy", "개인정보처리방침"]]],
    ["북마클릿 오버레이", [["/maimai-mobile/", "가짜 DX NET — 추가 북마클릿·옵션 프리셋"], ["/maimai-mobile/home/userOption/updateUserOption/", "가짜 DX NET 옵션 페이지"], ["/simai/pages/32.html", "가짜 simai wiki — 채보 등록"]]],
  ];
  return `<!DOCTYPE html><html lang="ko"><head>${pageHead("디자인 미리보기 · 캐롤봇")}
<style>${BASE_CSS}
.page{max-width:var(--crl-container-narrow)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}
.grid .crl-card{margin:0}
.links{display:flex;flex-direction:column;gap:6px;margin-top:12px}</style></head><body>
${topbar(`<span class="crl-tag crl-tag--accent">PREVIEW</span>`)}
<main class="page">
<h1 class="crl-heading-2 page-title">디자인 미리보기</h1>
<p class="crl-body-lg page-lead">DB 없이 가짜 데이터로 띄운 화면입니다. 저장 버튼은 메모리에만 반영되고, 서버를 끄면 사라집니다.</p>
<div class="grid">${groups.map(([title, links]) => `<div class="crl-card"><div class="crl-eyebrow">${title}</div><div class="links">${links.map(([href, label]) => `<a href="${href}">${label}</a>`).join("")}</div></div>`).join("")}</div>
</main>${siteFooter()}</body></html>`;
}

// ─── 서버 ────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (min: number, max: number) => sleep(min + Math.random() * (max - min));

async function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return {}; }
}

function send(res: http.ServerResponse, status: number, type: string, body: string | Buffer): void {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}
const html = (res: http.ServerResponse, body: string, status = 200) => send(res, status, "text/html; charset=utf-8", body);
const js = (res: http.ServerResponse, body: string) => send(res, 200, "application/javascript; charset=utf-8", body);
const json = (res: http.ServerResponse, body: unknown, status = 200) => send(res, status, "application/json; charset=utf-8", JSON.stringify(body));

async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url || "/", BASE);
  const path = url.pathname;
  const get = req.method === "GET", post = req.method === "POST";

  // 웹 페이지
  if (get && path === "/") return html(res, indexPage());
  if (get && path === "/brand/avatar.png") return send(res, 200, "image/png", BRAND_AVATAR_PNG);
  if (get && path === "/sync") return html(res, guidePage(TOKEN, buildBookmarklet(TOKEN, PORT)));
  if (get && path === "/settings") return html(res, settingsPage(TOKEN, "intl", true, true, false, true));
  if (get && path === "/options") return html(res, optionsPage(TOKEN, { bookmarklet: buildOptionBookmarklet(BASE, TOKEN), snapshots: [optionSnapshot()], presets, max: 10, defaultServer: "intl" }));
  if (get && path === "/admin/aliases") return html(res, aliasAdminPage(TOKEN, SONGS, aliases));
  if (get && path === "/admin/artists") return html(res, artistAliasAdminPage(TOKEN, ARTISTS, artistAliases));
  if (get && path === "/admin/names") return html(res, namesAdminPage(TOKEN, [
    { kind: "area", source: "メトロポリス地方", ko: "메트로폴리스 지방", imageUrl: "" },
    { kind: "area", source: "スカイストリート地方", ko: "", imageUrl: "" },
    { kind: "stamp", source: "でらっくすスタンプ", ko: "", imageUrl: "" },
  ]));
  if (get && path === "/admin/messages") return html(res, messagesAdminPage(TOKEN, [
    { key: "common.rateLimited", group: "공통", text: "maishift 이용 한도를 넘었습니다. {minutes}분 뒤 다시 시도해 주세요.", def: "maishift 이용 한도를 넘었습니다. {minutes}분 뒤 다시 시도해 주세요.", overridden: false, vars: ["minutes"] },
    { key: "common.notRegistered", group: "공통", text: "먼저 /마이시프트 연동 으로 아이디를 등록해 주세요!", def: "먼저 /마이시프트 연동 으로 아이디를 등록해 주세요.", overridden: true, vars: [] },
    { key: "card.createdBy", group: "PNG 카드", text: "created by", def: "created by", overridden: false, vars: [] },
  ]));
  if (get && path === "/admin/commands") return html(res, commandsAdminPage(TOKEN, [
    { key: "search", defName: "검색", name: "검색", defDescription: "곡을 검색합니다", description: "곡을 검색합니다", changed: false, order: ["곡명", "난이도"],
      options: [{ name: "곡명", type: "STRING", required: true, defDescription: "곡 이름이나 별명", description: "곡 이름이나 별명" }, { name: "난이도", type: "STRING", required: false, defDescription: "난이도", description: "" }] },
    { key: "profile", defName: "프로필", name: "내프로필", defDescription: "프로필을 봅니다", description: "내 프로필 카드", changed: true, order: [], options: [] },
  ], true));
  if (get && path === "/admin/import") return html(res, importBookmarkletPage(BASE, TOKEN, TOKEN));
  if (get && path === "/admin/patch-notes") return html(res, patchNotesAdminPage(TOKEN, patchNotes, "2.2.0"));
  if (get && path === "/terms") return html(res, termsPage());
  if (get && path === "/privacy") return html(res, privacyPage());
  if (get && path === "/chart") return html(res, chartPlayerPage({ id: "preview", title: "Preview Song", artist: "team carol", designer: "carol", level: "13+", difficulty: 4, chart: sampleChart }));
  if (get && path === "/chart/missing") return html(res, chartNotFoundPage("채보를 찾을 수 없습니다", "링크가 잘못됐거나, 업로드된 채보의 보관 기간이 지났습니다."), 404);

  // 북마클릿 스크립트
  if (get && path === "/bookmarklet.js") {
    const notice = url.searchParams.get("notice") === "1";
    return js(res, allowPreviewHost(buildBookmarkletJs([], { policyNotice: notice, deprecationCutoff: notice ? "2026-12-31" : undefined, knownRankImages: { intl: [], jp: [] } })));
  }
  if (get && path === "/option.js") return js(res, allowPreviewHost(OPTION_CLIENT_JS));
  if (get && path === "/import.js") return js(res, IMPORT_CLIENT_JS);

  // 가짜 DX NET
  const scenario = scenarioOf(req);
  if (get && (path === "/maimai-mobile/" || path === "/maimai-mobile")) {
    res.setHeader("set-cookie", "_t=preview; path=/");
    return html(res, dxnetHome(scenario));
  }
  if (get && path === "/maimai-mobile/home/userOption/updateUserOption/") { await jitter(200, 500); return html(res, dxnetOptionPage()); }
  if (post && path === "/maimai-mobile/home/userOption/updateUserOption/update/") {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    for (const [k, v] of new URLSearchParams(Buffer.concat(chunks).toString("utf8"))) if (k in optionValues) optionValues[k] = v;
    await jitter(300, 600);
    return html(res, dxnetOptionPage());
  }
  if (get && path.startsWith("/maimai-mobile/")) {
    await jitter(250, 900);
    if (scenario === "partial" && path.includes("/circle/circleRanking/")) return send(res, 500, "text/plain", "error");
    if (path === "/maimai-mobile/record/") return html(res, fakePage("record", `<div class="p_10 t_l f_0 v_b playlog_top_container">PLAY LOG</div>`.repeat(5)));
    if (path === "/maimai-mobile/friend/userFriendCode/") return html(res, fakePage("friend code", "<div class='box'>1234567890123</div>"));
    return html(res, fakePage(path, `<div class="box">${path}</div>`.repeat(20)));
  }

  // 가짜 simai wiki
  if (get && path === "/simai/pages/32.html") return html(res, wikiList());
  const wm = /^\/simai\/pages\/(\d+)\.html$/.exec(path);
  if (get && wm) return html(res, wikiSong(Number(wm[1])));

  // 캐롤봇 API 흉내
  if (post && path === "/sync") {
    await jitter(600, 1200);
    if (scenario === "partial") return send(res, 500, "text/plain", "preview_error");
    return send(res, 200, "text/plain", scenario === "nochange" ? "no_change" : scenario === "init" ? "initialized" : "ok");
  }
  if (get && path === "/api/settings") return json(res, { minimumAchievement: 95 });
  if (get && path === "/api/option-presets") return json(res, { presets, max: 10 });
  if (post && path === "/api/option-presets") {
    const b = await readJson(req);
    const id = typeof b.id === "number" ? b.id : presets.find((p) => p.name === b.name)?.id;
    const row: OptionPresetRow = { id: id ?? presetSeq++, name: String(b.name), server: b.server === "jp" ? "jp" : "intl", values: (b.values ?? {}) as Record<string, string>, labels: (b.labels ?? {}) as Record<string, [string, string]>, updatedAt: Date.now() };
    const i = presets.findIndex((p) => p.id === row.id);
    if (i >= 0) presets[i] = row; else presets.push(row);
    return json(res, { ok: true, preset: row });
  }
  if (post && path === "/api/option-presets/delete") {
    const b = await readJson(req);
    const i = presets.findIndex((p) => p.id === b.id);
    if (i >= 0) presets.splice(i, 1);
    return json(res, { ok: true });
  }
  if (post && path === "/api/admin/aliases") {
    const b = await readJson(req);
    const alias: SongAliasRow = { id: aliasSeq++, title: String(b.title), alias: String(b.alias), isTranslation: false };
    aliases.push(alias);
    return json(res, { ok: true, alias });
  }
  if (post && path === "/api/admin/artists") {
    const b = await readJson(req);
    const alias: ArtistAliasRow = { id: artistAliasSeq++, artist: String(b.artist), alias: String(b.alias), isTranslation: false };
    artistAliases.push(alias);
    return json(res, { ok: true, alias });
  }
  if (post && path === "/api/admin/names") { const b = await readJson(req); return json(res, { ok: true, ko: String(b.ko ?? "") }); }
  if (post && path === "/api/admin/patch-notes") {
    const b = await readJson(req);
    const id = typeof b.id === "number" ? b.id : noteSeq++;
    const prev = patchNotes.find((n) => n.id === id);
    const note: PatchNoteRow = { id, version: String(b.version ?? ""), title: String(b.title ?? ""), body: String(b.body ?? ""), publishedAt: b.publish ? Date.now() : prev?.publishedAt ?? 0, createdAt: prev?.createdAt ?? Date.now(), updatedAt: Date.now(), seen: prev?.seen ?? 0 };
    patchNotes = [note, ...patchNotes.filter((n) => n.id !== id)];
    return json(res, { ok: true, note, notes: patchNotes });
  }
  if (post && (path === "/api/admin/patch-notes/publish" || path === "/api/admin/patch-notes/delete")) {
    const b = await readJson(req);
    if (path.endsWith("/delete")) patchNotes = patchNotes.filter((n) => n.id !== b.id);
    else patchNotes = patchNotes.map((n) => n.id === b.id ? { ...n, publishedAt: b.publish ? Date.now() : 0 } : n);
    return json(res, { ok: true, notes: patchNotes });
  }
  if (get && path === "/api/admin/simai/known-pages") return json(res, { pages: [WIKI_SONGS[0].page] });
  if (post && path === "/api/admin/simai/import") { await jitter(200, 500); return json(res, { ok: true, saved: [1, 4] }); }
  if (get && path === "/api/admin/simai/audit") {
    return json(res, { ok: true, counts: { total: 3, ok: 1, short: 1, empty: 1 }, list: [
      { id: "preview", title: "Preview Song", difficulty: 4, level: "13+", flags: ["short"], durationMs: 8400, notes: 28, page: 1001 },
      { id: "preview", title: "Empty Song", difficulty: 3, level: "11", flags: ["empty"], durationMs: 0, notes: 0, page: 1002 },
    ] });
  }
  if (post && path.startsWith("/api/")) return json(res, { ok: true });

  html(res, chartNotFoundPage("미리보기에 없는 주소", `${path} 는 미리보기 서버가 흉내 내지 않습니다.`), 404);
}

http.createServer((req, res) => {
  handle(req, res).catch((e: unknown) => {
    console.error("[preview]", e);
    if (!res.headersSent) send(res, 500, "text/plain; charset=utf-8", String(e));
  });
}).listen(PORT, () => console.log(`[preview] 디자인 미리보기: ${BASE}/`));
