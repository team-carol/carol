// 디스코드 Activity 로 띄우는 보면 플레이어(/activity). 웹 플레이어(chartPlayer.ts)와 같은 그리기 코어(RENDERER_JS)를 쓴다.
// 음원 고르기는 없다(타격음만).
//
// - 디스코드는 개발자 포털 URL 매핑의 루트(/ → 이 서버)를 iframe 으로 연다(주소에 frame_id·instance_id·channel_id 등이 붙는다).
//   루트에 frame_id 가 붙어 오면 /activity 로 보낸다(web/index.ts).
// - Activity 안에서는 모든 요청이 디스코드 프록시를 거치고 CSP 가 걸린다. 외부 CDN(글꼴 등)은 막히므로 쓰지 않고,
//   CSP 가 인라인 스크립트·스타일을 막아도 동작하게 스크립트·CSS 는 모두 같은 서버의 파일로 둔다(인라인 <script>·style 속성 없음).
//   보면 데이터는 실행되지 않는 <script type="application/json"> 에 넣고 player.js 가 읽는다.
// - 보면 고르기·전환은 주소에 chart=<id> 를 붙여 페이지를 다시 연다(그리기 코어는 페이지당 한 번만 돈다).
// - 디스코드 밖(미리보기·브라우저)에서는 SDK 없이 플레이어만 동작한다.

import fs from "fs";
import path from "path";
import { maimaiDifficulty } from "@team-carol/design-system/game";
import { BASE_CSS } from "./theme";
import { RENDERER_JS } from "./chartRenderer";
import { SOUND_JS } from "./chartSound";
import type { ChartPlayerData } from "./chartPlayer";

const DIFF_LABEL: Record<number, keyof typeof maimaiDifficulty> = {
  1: "BASIC", 2: "ADVANCED", 3: "EXPERT", 4: "MASTER", 5: "Re:MASTER",
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Activity 페이지. data 가 없으면 보면 고르기 화면(버튼으로 띄운 직후면 잠깐 기다렸다가). */
export function activityPage(opts: { clientId: string; data: ChartPlayerData | null; loadedAt: number }): string {
  const d = opts.data;
  const head = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(d?.title || "보면")} · 캐롤봇</title>
<link rel="stylesheet" href="/activity/app.css"></head>
<body class="act" data-client-id="${esc(opts.clientId)}" data-chart-id="${esc(d?.id ?? "")}" data-loaded-at="${opts.loadedAt}">`;
  const picker = `<div class="picker" id="picker" hidden>
  <div class="phead">
    <input class="crl-input" id="pq" type="search" placeholder="곡명·별명으로 찾기" autocomplete="off" enterkeyhint="search">
    <button class="crl-btn crl-btn--secondary crl-btn--sm" id="pclose" type="button"${d ? "" : " hidden"}>닫기</button>
  </div>
  <div class="pst" id="pst"></div>
  <div class="plist" id="plist"></div>
</div>`;
  const scripts = `<script src="/activity/sdk.js"></script>
<script src="/activity/app.js"></script>`;
  if (!d) {
    return `${head}
<main class="wrap"><div class="empty" id="empty">보면을 불러오는 중…</div></main>
${picker}
${scripts}
</body></html>`;
  }

  const diffName = DIFF_LABEL[d.difficulty] ?? "";
  const json = JSON.stringify(d).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
  const secs = Math.round(d.chart.durationMs / 1000);
  const dur = Math.floor(secs / 60) + ":" + String(secs % 60).padStart(2, "0");
  const badge = diffName
    ? `<span class="badge d${d.difficulty}">${esc(diffName)}${d.level ? " " + esc(d.level) : ""}</span>`
    : d.level ? `<span class="badge">Lv.${esc(d.level)}</span>` : "";
  return `${head}
<main class="wrap">
  <header class="top">
    <div class="meta">
      <div class="ttl">${badge}${esc(d.title || "(제목 없음)")}</div>
      <div class="sub">${esc(d.artist || "-")}${d.designer ? " · 보면 " + esc(d.designer) : ""}</div>
    </div>
    <button class="crl-btn crl-btn--secondary crl-btn--sm" id="popen" type="button">다른 보면</button>
  </header>
  <div class="stage"><canvas id="cv" width="920" height="920"></canvas></div>
  <div class="bar">
    <button class="play" id="pp" type="button" aria-label="재생/일시정지">▶</button>
    <div class="seek" id="sk"><div class="seek-track"><div class="seek-fill" id="fill"></div></div></div>
    <div class="time"><span id="cur">0:00</span> / ${dur}</div>
    <button class="crl-btn crl-btn--secondary crl-btn--sm" id="oopen" type="button" aria-expanded="false">설정</button>
  </div>
  <div class="opts" id="opts" hidden>
    <div class="row"><label for="spd">노트 속도</label><input type="range" id="spd" min="1" max="12" step="0.25" value="6.5"><span class="val" id="spdv">6.50</span></div>
    <div class="row"><label for="rate">재생 배속</label><input type="range" id="rate" min="0.25" max="2" step="0.05" value="1"><span class="val" id="ratev">1.00x</span></div>
    <div class="row"><label for="off">표시 오프셋</label><input type="range" id="off" min="-100" max="100" step="5" value="0"><span class="val" id="offv">0ms</span></div>
    <div class="row"><label for="hvol">타격음 크기</label><input type="range" id="hvol" min="0" max="150" step="5" value="100"><span class="val" id="hvolv">100%</span></div>
    <div class="row"><span class="lbl">표시</span>
      <div class="chips">
        <button class="crl-chip chip on" id="tSound" type="button">타격음</button>
        <button class="crl-chip chip on" id="tGuide" type="button">슬라이드 가이드</button>
        <button class="crl-chip chip" id="tMirror" type="button">미러</button>
      </div>
    </div>
  </div>
</main>
${picker}
<script type="application/json" id="chart-data">${json}</script>
${scripts}
<script src="/activity/player.js"></script>
</body></html>`;
}

const SAFE = (side: string) => `var(--discord-safe-area-inset-${side},env(safe-area-inset-${side},0px))`;

/** /activity/app.css — 디자인 시스템 CSS + Activity 화면. 화면 높이에 맞춰 캔버스를 키운다(컨테이너 단위). */
export const ACTIVITY_CSS = `${BASE_CSS}
html,body.act{height:100%}
body.act{height:100dvh;overflow:hidden;background:var(--crl-canvas);padding:calc(${SAFE("top")} + 10px) calc(${SAFE("right")} + 12px) calc(${SAFE("bottom")} + 10px) calc(${SAFE("left")} + 12px)}
.wrap{flex:1;min-height:0;width:100%;max-width:760px;margin:0 auto;display:flex;flex-direction:column;gap:10px}
.top{display:flex;gap:10px;align-items:center}
.meta{flex:1;min-width:0}
.ttl{font-size:16px;font-weight:500;color:var(--crl-ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sub{font-size:12.5px;color:var(--crl-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
.badge{display:inline-block;font-family:var(--crl-font-mono);font-size:11px;font-weight:500;letter-spacing:.3px;padding:2px 8px;border-radius:var(--crl-radius-inline,6px);background:var(--crl-surface-2);color:var(--crl-ink);margin-right:8px;vertical-align:2px}
${Object.entries(DIFF_LABEL).map(([n, name]) => `.badge.d${n}{background:${maimaiDifficulty[name]}}`).join("\n")}
.stage{flex:1;min-height:160px;container-type:size;display:flex;align-items:center;justify-content:center}
.stage canvas{display:block;width:min(100cqw,100cqh);height:min(100cqw,100cqh);touch-action:none}
.bar{display:flex;align-items:center;gap:10px}
.play{width:42px;height:42px;flex:0 0 42px;border:0;border-radius:50%;background:var(--crl-accent);color:var(--crl-accent-ink);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center}
.play:hover{background:var(--crl-accent-hover)}
.seek{flex:1;height:26px;cursor:pointer;display:flex;align-items:center;touch-action:none}
.seek-track{width:100%;height:5px;border-radius:3px;background:var(--crl-surface-2);overflow:hidden}
.seek-fill{height:100%;width:0;background:var(--crl-accent)}
.time{font-family:var(--crl-font-mono);font-size:12px;color:var(--crl-dim);white-space:nowrap}
.opts{display:flex;flex-direction:column;gap:10px;max-height:42dvh;overflow:auto;background:var(--crl-surface);border:1px solid var(--crl-border);border-radius:var(--crl-radius-card,16px);padding:12px 14px}
.opts[hidden]{display:none}
.row{display:flex;align-items:center;gap:10px;font-size:13.5px;color:var(--crl-muted)}
.row label,.row .lbl{flex:0 0 78px;color:var(--crl-dim);font-size:12.5px;font-weight:500}
.row input[type=range]{flex:1;accent-color:var(--crl-accent);min-width:0}
.row .val{font-family:var(--crl-font-mono);font-size:12px;color:var(--crl-ink-soft);min-width:48px;text-align:right}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chip{border:0;color:var(--crl-muted);font-size:13px;cursor:pointer}
.chip.on{background:color-mix(in srgb,var(--crl-accent) 14%,transparent);color:var(--crl-accent-soft);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--crl-accent) 45%,transparent)}
.empty{flex:1;display:flex;align-items:center;justify-content:center;color:var(--crl-dim);font-size:14px;text-align:center}
.picker{position:fixed;inset:0;z-index:10;background:var(--crl-canvas);display:flex;flex-direction:column;gap:8px;padding:calc(${SAFE("top")} + 10px) calc(${SAFE("right")} + 12px) calc(${SAFE("bottom")} + 10px) calc(${SAFE("left")} + 12px)}
.picker[hidden]{display:none}
.phead{display:flex;gap:8px;align-items:center;width:100%;max-width:760px;margin:0 auto}
.phead .crl-input{flex:1;min-width:0}
.phead [hidden]{display:none}
.pst{font-size:12.5px;color:var(--crl-dim);min-height:18px;width:100%;max-width:760px;margin:0 auto}
.pst.err{color:var(--crl-danger)}
.plist{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:6px;width:100%;max-width:760px;margin:0 auto}
.pitem{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:9px 12px;border-radius:var(--crl-radius-control,10px);background:var(--crl-surface);border:1px solid var(--crl-border);color:var(--crl-ink-soft);cursor:pointer;font:inherit}
.pitem:hover{background:var(--crl-surface-hover)}
.pitem:disabled{opacity:.5;cursor:default}
.pitem .badge{flex:none;margin-right:0;vertical-align:0;min-width:104px;text-align:center}
.pitem .nm{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pitem .ar{display:block;font-size:11.5px;color:var(--crl-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pitem .kd{flex:none;font-family:var(--crl-font-mono);font-size:11px;color:var(--crl-dim)}
@media (max-height:520px){.top .sub{display:none}.wrap{gap:6px}}
`;

/**
 * /activity/app.js — SDK 연결(ready), 설정 펼치기, 보면 고르기.
 * 디스코드 안이면(주소에 frame_id) SDK 로 준비 완료를 알린다. 검색·열기 API 에는 주소의 instance_id·channel_id 를 실어 보낸다.
 */
export const ACTIVITY_APP_JS = `(function(){
var q = new URLSearchParams(location.search);
var inDiscord = q.has('frame_id');
var clientId = document.body.getAttribute('data-client-id') || '';
var hasChart = !!document.getElementById('chart-data');
var current = document.body.getAttribute('data-chart-id') || '';
var loadedAt = Number(document.body.getAttribute('data-loaded-at')) || 0;
function $(id){ return document.getElementById(id); }

if (inDiscord && window.DiscordActivity && clientId){
  try {
    var sdk = new window.DiscordActivity.DiscordSDK(clientId);
    sdk.ready().catch(function(e){ console.warn('[activity] ready 실패', e); });
  } catch (e){ console.warn('[activity] SDK 시작 실패', e); }
}

// 설정 펼치기
var oopen = $('oopen'), opts = $('opts');
if (oopen && opts) oopen.onclick = function(){
  opts.hidden = !opts.hidden;
  oopen.setAttribute('aria-expanded', String(!opts.hidden));
};

function apiQuery(extra){
  var p = new URLSearchParams();
  p.set('instance_id', q.get('instance_id') || '');
  p.set('channel_id', q.get('channel_id') || '');
  for (var k in extra) p.set(k, extra[k]);
  return p.toString();
}
function openChart(id){
  q.set('chart', id);
  location.replace(location.pathname + '?' + q.toString());
}

// ── 보면 고르기 ──
var picker = $('picker'), pq = $('pq'), plist = $('plist'), pst = $('pst'), pclose = $('pclose'), popen = $('popen');
var DIFF = { 1: 'BASIC', 2: 'ADVANCED', 3: 'EXPERT', 4: 'MASTER', 5: 'Re:MASTER' };
var timer = null, seq = 0, busy = false;
function status(text, err){ pst.textContent = text || ''; pst.className = err ? 'pst err' : 'pst'; }
function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function showPicker(){
  picker.hidden = false;
  if (!pq.value) status('곡명이나 별명을 입력하세요.');
  setTimeout(function(){ pq.focus(); }, 0);
}
if (popen) popen.onclick = showPicker;
if (pclose) pclose.onclick = function(){ picker.hidden = true; };
function search(){
  var text = pq.value.trim();
  if (!text){ plist.innerHTML = ''; status('곡명이나 별명을 입력하세요.'); return; }
  var my = ++seq;
  status('찾는 중…');
  fetch('/api/activity/search?' + apiQuery({ q: text })).then(function(r){ return r.json(); }).then(function(d){
    if (my !== seq) return;
    if (!d.ok){ plist.innerHTML = ''; status(d.error || '검색하지 못했습니다.', true); return; }
    if (!d.items.length){ plist.innerHTML = ''; status('찾는 보면이 없습니다.'); return; }
    status('');
    plist.innerHTML = d.items.map(function(it){
      var dn = DIFF[it.difficulty] || '?';
      var kind = it.type === 'deluxe' ? 'DX' : it.type === 'standard' ? 'ST' : '';
      return '<button class="pitem" type="button" data-key="' + esc(it.key) + '">'
        + '<span class="badge d' + it.difficulty + '">' + esc(dn) + (it.level ? ' ' + esc(it.level) : '') + '</span>'
        + '<span class="nm">' + esc(it.title) + '<span class="ar">' + esc(it.artist || '') + '</span></span>'
        + (kind ? '<span class="kd">' + kind + '</span>' : '') + '</button>';
    }).join('');
  }).catch(function(){ if (my === seq) status('검색하지 못했습니다.', true); });
}
pq.addEventListener('input', function(){ clearTimeout(timer); timer = setTimeout(search, 250); });
pq.addEventListener('keydown', function(e){ if (e.key === 'Enter'){ clearTimeout(timer); search(); } });
plist.addEventListener('click', function(e){
  var b = e.target.closest ? e.target.closest('.pitem') : null;
  if (!b || busy) return;
  busy = true; b.disabled = true;
  status('보면을 여는 중…');
  fetch('/api/activity/open?' + apiQuery({}), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: b.getAttribute('data-key') }) })
    .then(function(r){ return r.json(); })
    .then(function(d){
      if (d.ok){ openChart(d.id); return; }
      busy = false; b.disabled = false; status(d.error || '보면을 열지 못했습니다.', true);
    })
    .catch(function(){ busy = false; b.disabled = false; status('보면을 열지 못했습니다.', true); });
});

// 이 페이지가 열린 뒤 이 인스턴스에 다른 보면이 걸리면(다른 보면 버튼, 같은 Activity 의 누가 고름) 그 보면으로 넘어간다.
if (hasChart && inDiscord) setInterval(function(){
  if (document.visibilityState !== 'visible' || !picker.hidden) return;
  fetch('/api/activity/state?' + apiQuery({})).then(function(r){ return r.json(); }).then(function(d){
    if (d && d.chart && d.chart !== current && d.at > loadedAt) openChart(d.chart);
  }).catch(function(){});
}, 3000);

// 보면 없이 열렸으면: 버튼으로 띄운 직후일 수 있어 잠깐 기다렸다가 없으면 고르기 화면.
if (!hasChart){
  var tries = 0;
  (function poll(){
    fetch('/api/activity/state?' + apiQuery({})).then(function(r){ return r.json(); }).then(function(d){
      if (d && d.chart){ openChart(d.chart); return; }
      if (++tries < 4) return setTimeout(poll, 700);
      $('empty').textContent = '';
      showPicker();
    }).catch(function(){ $('empty').textContent = ''; showPicker(); });
  })();
}
})();
`;

/** /activity/player.js — 페이지에 실린 보면 데이터를 읽고 웹 플레이어와 같은 타격음·그리기 코어를 돌린다(타격음 파일은 /chart/sounds/hit.wav). */
export const ACTIVITY_PLAYER_JS = `var DATA = JSON.parse(document.getElementById('chart-data').textContent);
${SOUND_JS}
${RENDERER_JS}`;

let sdkCache: string | null | undefined;
/** 빌드 때 묶은 Embedded App SDK(scripts/build-activity-sdk.js → dist/web/activity-sdk.js). 없으면 null. */
function activitySdk(): string | null {
  if (sdkCache !== undefined) return sdkCache;
  for (const p of [path.join(__dirname, "activity-sdk.js"), path.resolve(process.cwd(), "dist/web/activity-sdk.js")]) {
    try { sdkCache = fs.readFileSync(p, "utf8"); return sdkCache; } catch { /* 다음 */ }
  }
  console.warn("[activity] SDK 번들이 없습니다. npm run build 로 만드세요.");
  sdkCache = null;
  return null;
}

/** /activity/* 정적 파일. 모르는 경로면 null. */
export function activityAsset(pathname: string): { type: string; body: string } | null {
  if (pathname === "/activity/app.css") return { type: "text/css; charset=utf-8", body: ACTIVITY_CSS };
  if (pathname === "/activity/app.js") return { type: "text/javascript; charset=utf-8", body: ACTIVITY_APP_JS };
  if (pathname === "/activity/player.js") return { type: "text/javascript; charset=utf-8", body: ACTIVITY_PLAYER_JS };
  if (pathname === "/activity/sdk.js") {
    const sdk = activitySdk();
    // 없으면 빈 스크립트(디스코드 밖에서는 없어도 플레이어가 돈다)
    return { type: "text/javascript; charset=utf-8", body: sdk ?? "/* sdk missing */" };
  }
  return null;
}
