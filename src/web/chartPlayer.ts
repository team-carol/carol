// simai 채보 플레이어 페이지.
//
// 파싱은 서버(src/simai/parse.ts)에서 끝내고, 여기서는 타임라인 JSON 을 받아
// canvas 로 그리기만 한다. 채보 출처가 유저 업로드에서 DB 등록으로 바뀌어도
// 이 파일은 손대지 않는다.
//
// 음원은 서버에 두지 않는다. 유저가 자기 파일을 고르면 브라우저 안에서만
// (object URL) 재생하고, 업로드하지 않는다.

import type { Chart } from "../simai/types";

export interface ChartPlayerData {
  id: string;
  title: string;
  artist: string;
  designer: string;
  level: string;
  difficulty: number;
  chart: Chart;
}

const DIFF_LABEL: Record<number, string> = {
  1: "BASIC", 2: "ADVANCED", 3: "EXPERT", 4: "MASTER", 5: "Re:MASTER",
};
const DIFF_COLOR: Record<number, string> = {
  1: "#16a34a", 2: "#ea580c", 3: "#dc2626", 4: "#9333ea", 5: "#c084fc",
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function chartPlayerPage(data: ChartPlayerData): string {
  const json = JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
  const diffName = DIFF_LABEL[data.difficulty] ?? "";
  const diffColor = DIFF_COLOR[data.difficulty] ?? "#9333ea";
  const s = data.chart.stats;
  const secs = Math.round(data.chart.durationMs / 1000);
  const dur = Math.floor(secs / 60) + ":" + String(secs % 60).padStart(2, "0");

  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(data.title || "채보")} - carolbot</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',system-ui,-apple-system,sans-serif;background:#0d0d0d;color:#ccc;font-size:16px;line-height:1.5;-webkit-font-smoothing:antialiased;display:flex;justify-content:center;min-height:100vh;padding:40px 20px}
.wrap{width:100%;max-width:560px}
.mono{font-family:'JetBrains Mono',ui-monospace,monospace}
.nav{margin-bottom:20px}
.nav a{color:#c084fc;font-size:14px;text-decoration:none}
.nav a:hover{opacity:.8}
.head{margin-bottom:20px}
.badge{display:inline-block;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:500;letter-spacing:.5px;padding:3px 9px;border-radius:6px;background:${diffColor};color:#fff;margin-bottom:10px}
h1{font-size:26px;font-weight:700;color:#fff;letter-spacing:-.3px;line-height:1.25;word-break:break-word}
.sub{font-size:14px;color:#777;margin-top:6px}
.card{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:16px;padding:20px;margin-bottom:16px}
.stage{padding:14px;display:flex;justify-content:center}
canvas{width:100%;max-width:460px;aspect-ratio:1;touch-action:none;display:block}
.bar{display:flex;align-items:center;gap:12px;margin-bottom:14px}
.play{width:46px;height:46px;flex:0 0 46px;border:0;border-radius:50%;background:#9333ea;color:#fff;font-size:17px;cursor:pointer;display:flex;align-items:center;justify-content:center}
.play:hover{background:#a855f7}
.seek{flex:1;height:26px;position:relative;cursor:pointer;display:flex;align-items:center}
.seek-track{width:100%;height:5px;border-radius:3px;background:#2a2a2a;overflow:hidden}
.seek-fill{height:100%;width:0;background:#9333ea}
.time{font-family:'JetBrains Mono',monospace;font-size:12px;color:#888;min-width:84px;text-align:right}
.ctl{display:flex;flex-direction:column;gap:12px}
.row{display:flex;align-items:center;gap:12px;font-size:13px;color:#999}
.row label{flex:0 0 96px;color:#777;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.5px;text-transform:uppercase}
.row input[type=range]{flex:1;accent-color:#9333ea;min-width:0}
.row .val{font-family:'JetBrains Mono',monospace;font-size:12px;color:#ccc;min-width:52px;text-align:right}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chip{border:1px solid #2a2a2a;background:#141414;color:#999;border-radius:8px;padding:6px 11px;font-size:12px;cursor:pointer;font-family:inherit}
.chip:hover{border-color:#3a3a3a;color:#ccc}
.chip.on{border-color:#9333ea;background:#9333ea22;color:#e9d5ff}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.stat{background:#141414;border:1px solid #2a2a2a;border-radius:10px;padding:10px 12px}
.stat .k{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.5px;text-transform:uppercase;color:#666}
.stat .v{font-size:17px;font-weight:600;color:#fff;margin-top:2px}
.note{font-size:12px;color:#5f5f5f;line-height:1.6;margin-top:14px}
.file{font-size:12px;color:#777}
.file input{display:none}
.file span{color:#c084fc;cursor:pointer;text-decoration:underline}
</style></head><body><div class="wrap">
<div class="nav"><a href="/">← carolbot</a></div>
<div class="head">
  ${diffName
    ? `<div class="badge">${esc(diffName)}${data.level ? " " + esc(data.level) : ""}</div>`
    : data.level ? `<div class="badge">Lv.${esc(data.level)}</div>` : ""}
  <h1>${esc(data.title || "(제목 없음)")}</h1>
  <div class="sub">${esc(data.artist || "-")}${data.designer ? " · 보면 " + esc(data.designer) : ""}</div>
</div>

<div class="card stage"><canvas id="cv" width="920" height="920"></canvas></div>

<div class="card">
  <div class="bar">
    <button class="play" id="pp" aria-label="재생/일시정지">▶</button>
    <div class="seek" id="sk"><div class="seek-track"><div class="seek-fill" id="fill"></div></div></div>
    <div class="time mono"><span id="cur">0:00</span> / ${dur}</div>
  </div>
  <div class="ctl">
    <div class="row"><label>노트 속도</label><input type="range" id="spd" min="1" max="12" step="0.5" value="6"><span class="val mono" id="spdv">6.0</span></div>
    <div class="row"><label>재생 배속</label><input type="range" id="rate" min="0.25" max="2" step="0.05" value="1"><span class="val mono" id="ratev">1.00x</span></div>
    <div class="row"><label>표시</label>
      <div class="chips">
        <button class="chip on" id="tSound">타격음</button>
        <button class="chip on" id="tGuide">슬라이드 가이드</button>
        <button class="chip" id="tMirror">미러</button>
      </div>
    </div>
    <div class="row"><label>음원</label>
      <div class="file">
        <label><span id="pickLabel">내 음원 파일 고르기</span><input type="file" id="audio" accept="audio/*"></label>
        — 브라우저 안에서만 재생되고 서버로 올라가지 않습니다.
      </div>
    </div>
  </div>
</div>

<div class="card">
  <div class="stats">
    <div class="stat"><div class="k">TAP</div><div class="v mono">${s.tap}</div></div>
    <div class="stat"><div class="k">HOLD</div><div class="v mono">${s.hold + s.touchHold}</div></div>
    <div class="stat"><div class="k">SLIDE</div><div class="v mono">${s.slide}</div></div>
    <div class="stat"><div class="k">TOUCH</div><div class="v mono">${s.touch}</div></div>
    <div class="stat"><div class="k">BREAK</div><div class="v mono">${s.break}</div></div>
    <div class="stat"><div class="k">TOTAL</div><div class="v mono">${s.total}</div></div>
  </div>
  <div class="note">
    BPM ${data.chart.bpm}${data.chart.bpmAssumed ? " (추정)" : ""} · ${data.chart.measures}마디 · 스페이스바로 재생/정지, ← → 로 1마디 이동.<br>
    ${data.chart.bpmAssumed ? "⚠️ 파일에 BPM 표기가 없어 120으로 가정했습니다. 재생 속도가 실제와 다릅니다.<br>" : ""}
    노트는 <span class="mono">0.25R</span> 지점에서 떠오른 뒤 판정선으로 흘러나갑니다. 슬라이드 궤적은 별이 지나간 화살표부터 사라집니다.
  </div>
</div>
</div>
<script>
var DATA = ${json};
var CHART = DATA.chart;
var NOTES = CHART.notes;
// 궤적 캐시 키에 쓸 고유 번호. 같은 timeMs 를 가진 슬라이드가 둘 이상일 때
// (EACH 슬라이드) 키가 겹쳐서 한쪽이 다른 쪽 경로로 그려지는 버그가 있었다.
for (var _n = 0; _n < NOTES.length; _n++) NOTES[_n].__idx = _n;

var cv = document.getElementById('cv'), ctx = cv.getContext('2d');
var CX = 460, CY = 460, R = 330;

// ── 기하 ───────────────────────────────────────────────────────────────────
// 사양서: "時計の1時の方向にあるボタンを1番として、時計回りに1～8番".
// 미러는 화면을 좌우로 뒤집는 것이므로, 도형은 항상 원래 좌표로 만들고 마지막에
// 점을 세로축 기준으로 뒤집는다. 번호를 9-i 로 바꾸는 방식은 버튼에서는 맞지만
// D/E 센서(버튼 사이 22.5도)에서 한 칸 어긋난다.
var mirror = false;
function ang(i){ return (-90 + 22.5 + (i - 1) * 45) * Math.PI / 180; }
function mir(p){ return mirror ? { x: 2 * CX - p.x, y: p.y } : p; }
function polRaw(a, r){ return { x: CX + Math.cos(a) * r, y: CY + Math.sin(a) * r }; }
function btnRaw(i){ return polRaw(ang(i), R); }
function btn(i){ return mir(btnRaw(i)); }
/** 중심에서 pos 번 버튼 방향으로 반지름 r 인 점 (노트가 날아오는 궤도 위). */
function rayPt(pos, r){ return mir(polRaw(ang(pos), r)); }

// 터치 센서. 사양서: A=버튼에 인접, B=A와 중앙 사이, C=중앙, D=A끼리의 사이,
// E=D보다 안쪽으로 B에 인접. A/B 는 버튼과 같은 각도, D/E 는 22.5도 어긋난 선 위.
function touchPt(area, n){
  if (area === 'A') return mir(polRaw(ang(n), R * 0.80));
  if (area === 'B') return mir(polRaw(ang(n), GROUP_B_R));
  if (area === 'D') return mir(polRaw(ang(n) - Math.PI / 8, R * 0.80));
  if (area === 'E') return mir(polRaw(ang(n) - Math.PI / 8, GROUP_B_R));
  return mir({ x: CX, y: CY });   // C: 구획은 둘이지만 언제나 한가운데 하나로 나온다
}

// ── 슬라이드 궤적 ──────────────────────────────────────────────────────────
// 형상 정의는 전부 사양서 "SLIDE (基本・形状)" 절을 따른다.
function clamp01(v){ return v < 0 ? 0 : v > 1 ? 1 : v; }
function lineP(a, b, n){
  var o = [];
  for (var i = 0; i <= n; i++){ var t = i / n; o.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); }
  return o;
}
function arcP(cx, cy, r, a0, sweep, n){
  var o = [];
  for (var i = 0; i <= n; i++){ var a = a0 + sweep * (i / n); o.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }); }
  return o;
}
function join(out, pts){
  for (var i = out.length ? 1 : 0; i < pts.length; i++) out.push(pts[i]);
  return out;
}

// 「-」直線形
function straightP(from, to){ return [btnRaw(from), btnRaw(to)]; }

// 「>」「<」「^」外周形 — 画面の外側をなぞる
function ringArc(from, to, cw){
  var a0 = ang(from), d = ang(to) - a0;
  while (d <= 0) d += Math.PI * 2;
  if (!cw) d -= Math.PI * 2;
  return arcP(CX, CY, R, a0, d, 28);
}
// 「^」は距離が全体の半分未満のときだけ使え、向きを考えずに短い方を回る
function shortCw(from, to){ var d = (to - from + 8) % 8; return d !== 0 && d <= 4; }
// 「>」=始点から右へ、「<」=始点から左へ。画면 위쪽(1,2,7,8)에서 오른쪽은
// 시계방향, 아래쪽(3~6)에서는 반시계방향이 된다.
function arrowCw(from, right){ return [1, 2, 7, 8].indexOf(from) >= 0 ? right : !right; }

// 「v」V字形 — 始点から中心を経由して終点
function vP(from, to){
  var a = btnRaw(from), b = btnRaw(to);
  if (Math.abs(to - from) === 4) return [a, b];   // 정반대는 중심을 지나는 직선과 같다
  return [a, { x: CX, y: CY }, b];
}

// 「s」「z」稲妻形 — 稲妻を描くように3本の短い直線を繋げて結ぶ
function boltP(from, to, isZ){
  var a = btnRaw(from), b = btnRaw(to);
  var vx = b.x - a.x, vy = b.y - a.y, L = Math.sqrt(vx * vx + vy * vy) || 1;
  var ux = vx / L, uy = vy / L, px = -uy, py = ux, off = 0.4 * R;
  var near = { x: a.x + ux * L * 0.49 + px * off, y: a.y + uy * L * 0.49 + py * off };
  var far  = { x: a.x + ux * L * 0.51 - px * off, y: a.y + uy * L * 0.51 - py * off };
  return isZ ? [a, far, near, b] : [a, near, far, b];
}

// 「p」「q」p字形・q字形 — 中心の周りで円を描くように湾曲しながら結ぶ.
// 진입점은 시작 버튼과 (시작±3)번 버튼의 중점이고, 그 점을 지나는 "중심이 필드
// 한가운데인 원"을 따라 돈 뒤 도착점으로 빠진다.
// MajdataView(MajGeo)의 기하 정의를 그대로 쓴다.
//   CenterRadius = R·cos(3π/8)      — p/q 가 도는 중심원 반지름
//   PPQQRadius   = R·cos(π/8)/2     — pp/qq 원 반지름
//   GroupBRadius = CenterRadius/cos(π/8) — B 구역 노드 반지름
var PQ_ARC_R = R * Math.cos(Math.PI * 3 / 8);
var PQQ_R = R * Math.cos(Math.PI / 8) / 2;
var GROUP_B_R = PQ_ARC_R / Math.cos(Math.PI / 8);
var PQ_STEP = Math.PI / 4;
function pqSmallP(from, to, isQ){
  var a = btnRaw(from), b = btnRaw(to);
  var via = btnRaw(isQ ? ((from + 2) % 8) + 1 : ((from + 4) % 8) + 1);
  var o = { x: (a.x + via.x) / 2, y: (a.y + via.y) / 2 };
  var rad = PQ_ARC_R;   // = R*cos(3π/8), 시작·시작±3 버튼 중점까지의 거리와 같다
  var a0 = Math.atan2(o.y - CY, o.x - CX);
  var d = (to - from + 8) % 8;
  var sweep = isQ ? PQ_STEP * (((d - 4 + 8) % 8) + 1) : -PQ_STEP * (((4 - d + 8) % 8) + 1);
  var exit = { x: CX + Math.cos(a0 + sweep) * rad, y: CY + Math.sin(a0 + sweep) * rad };
  var out = [];
  join(out, lineP(a, o, 4));
  join(out, arcP(CX, CY, rad, a0, sweep, 40));
  join(out, lineP(exit, b, 4));
  return out;
}

// 「pp」「qq」大きなp字形・q字形 — 中心から外周を結んだ直線を直径とした円を描く.
// 돌아가는 양은 시작·도착 간격마다 정해져 있다((to-from)%8 → ×π).
var QQ_SWEEP = [1.25, 1.5, 1.625, 1.875, 2, 2.25, 0.75, 1.125];
function pqBigP(from, to, isQ){
  var a = btnRaw(from), b = btnRaw(to);
  var opp = btnRaw(((from - 1 + 4) % 8) + 1);
  var o = { x: a.x + 0.4 * (opp.x - a.x), y: a.y + 0.4 * (opp.y - a.y) };
  var dx = opp.x - a.x, dy = opp.y - a.y, L = Math.sqrt(dx * dx + dy * dy) || 1;
  var ux = dx / L, uy = dy / L, rad = PQQ_R;
  var cx = o.x + (isQ ? -uy : uy) * rad;
  var cy = o.y + (isQ ? ux : -ux) * rad;
  var a0 = Math.atan2(o.y - cy, o.x - cx);
  var d = (to - from + 8) % 8;
  var sweep = (isQ ? QQ_SWEEP[d] : -QQ_SWEEP[(8 - d) % 8]) * Math.PI;
  var exit = { x: cx + Math.cos(a0 + sweep) * rad, y: cy + Math.sin(a0 + sweep) * rad };
  var out = [];
  join(out, lineP(a, o, 4));
  join(out, arcP(cx, cy, rad, a0, sweep, 40));
  join(out, lineP(exit, b, 4));
  return out;
}

function segPts(seg){
  var t = seg.type;
  if (t === '-') return straightP(seg.from, seg.to);
  if (t === 'v') return vP(seg.from, seg.to);
  if (t === '^') return ringArc(seg.from, seg.to, shortCw(seg.from, seg.to));
  if (t === '>') return ringArc(seg.from, seg.to, arrowCw(seg.from, true));
  if (t === '<') return ringArc(seg.from, seg.to, arrowCw(seg.from, false));
  if (t === 's') return boltP(seg.from, seg.to, false);
  if (t === 'z') return boltP(seg.from, seg.to, true);
  if (t === 'q') return pqSmallP(seg.from, seg.to, true);
  if (t === 'p') return pqSmallP(seg.from, seg.to, false);
  if (t === 'qq') return pqBigP(seg.from, seg.to, true);
  if (t === 'pp') return pqBigP(seg.from, seg.to, false);
  return straightP(seg.from, seg.to);   // 'w': 가운데 줄. 양옆은 wifiFans()
}

// 「w」扇形 — 始点が1点に対し終点が3つ。도착점 양옆(to-1, to+1)까지 퍼진다.
function wifiFans(segments){
  var out = [];
  for (var i = 0; i < segments.length; i++){
    var sg = segments[i];
    if (sg.type !== 'w') continue;
    var a = btnRaw(sg.from);
    out.push([a, btnRaw((sg.to + 6) % 8 + 1)]);
    out.push([a, btnRaw(sg.to % 8 + 1)]);
  }
  return out;
}

function pathOf(body){
  var pts = [], segEnd = [];
  for (var i = 0; i < body.segments.length; i++){
    join(pts, segPts(body.segments[i]));
    segEnd.push(pts.length - 1);
  }
  return { pts: mirror ? pts.map(mir) : pts, segEnd: segEnd };
}
function pathLen(pts){
  var L = [0], t = 0;
  for (var i = 1; i < pts.length; i++){
    t += Math.sqrt(Math.pow(pts[i].x - pts[i-1].x, 2) + Math.pow(pts[i].y - pts[i-1].y, 2));
    L.push(t);
  }
  return L;
}
function atLen(pts, L, d){
  if (d <= 0) return pts[0];
  var total = L[L.length-1];
  if (d >= total) return pts[pts.length-1];
  for (var i = 1; i < L.length; i++){
    if (L[i] >= d){
      var f = (d - L[i-1]) / ((L[i] - L[i-1]) || 1);
      return { x: pts[i-1].x + (pts[i].x - pts[i-1].x)*f, y: pts[i-1].y + (pts[i].y - pts[i-1].y)*f };
    }
  }
  return pts[pts.length-1];
}

// 사양서: "あらゆるSLIDEは必ず始点から終点まで一定のスピードで流れます" —
// 그래서 기본은 호 길이에 비례해 보간한다. 다만 연결 슬라이드에서 구간마다
// 길이를 따로 지정하면 구간별로 속도가 달라지므로 그때는 묶음 단위로 나눈다.
function slideProgressLen(pc, body, elapsed){
  var total = pc.len[pc.len.length-1];
  if (!pc.groups) return total * clamp01(elapsed / (body.durationMs || 1));
  var acc = 0, seg = 0;
  for (var g = 0; g < pc.groups.length; g++){
    var d = pc.groups[g].durationMs || 1;
    var last = Math.min(seg + pc.groups[g].count - 1, pc.segEnd.length - 1);
    if (elapsed <= acc + d || g === pc.groups.length - 1){
      var L0 = pc.len[seg === 0 ? 0 : pc.segEnd[seg-1]];
      var L1 = pc.len[pc.segEnd[last]];
      return L0 + (L1 - L0) * clamp01((elapsed - acc) / d);
    }
    acc += d; seg = last + 1;
  }
  return total;
}
function slidePos(pc, body, elapsed){
  return atLen(pc.pts, pc.len, slideProgressLen(pc, body, elapsed));
}

// 궤적은 매 프레임 다시 계산하면 비싸다. 노트별로 한 번만 만들어 캐시한다.
var cache = {};
function cachedPath(note, k){
  var key = note.__idx + ':' + k + ':' + (mirror ? 'm' : 'n');
  if (!cache[key]){
    var body = note.slides[k];
    var built = pathOf(body);
    var fans = wifiFans(body.segments);
    if (mirror) fans = fans.map(function(f){ return f.map(mir); });
    cache[key] = {
      pts: built.pts, segEnd: built.segEnd, len: pathLen(built.pts),
      // 부채꼴 곁가지도 매 프레임 길이를 재지 않도록 같이 캐시한다.
      fans: fans.map(function(f){ return { pts: f, len: pathLen(f) }; }),
      groups: body.groups || null,
    };
  }
  return cache[key];
}

// ── 색 ─────────────────────────────────────────────────────────────────────
// maimai 의 노트 색: 단일 TAP 은 분홍, EACH 는 노랑, BREAK 는 주황(EACH 여도 안 바뀐다).
// 슬라이드 별도 같은 규칙을 따르고, 궤적 화살표만 하늘색 계열로 따로 간다.
var C_TAP = '#ff4f9d', C_EACH = '#ffd42a', C_BREAK = '#ff9016';
var C_TOUCH = '#39c6f0', C_TOUCH_EACH = '#ffd42a';
var C_ARROW = '#28c8e6', C_ARROW_BREAK = '#ff9016';
var FIELD_BG = '#11111e';
var TAU = Math.PI * 2;

function colorOf(n){
  if (n.isBreak) return C_BREAK;
  if (n.type === 'touch' || n.type === 'touchHold') return n.isEach ? C_TOUCH_EACH : C_TOUCH;
  return n.isEach ? C_EACH : C_TAP;
}

// ── 등장 방식 ───────────────────────────────────────────────────────────────
// maimai 의 노트는 한가운데에서 나오지 않는다. 0.25R 위치에서 커지며 떠오른 뒤
// (전반부), 후반부에 판정선까지 흘러나가고, 판정선을 조금 지나쳐 사라진다.
// MaiNotes 도 같은 모델을 쓴다(BASE_APPROACH_TIME_MS 2250 / ハイスピ).
var APPROACH_BASE = 2250;
var SPAWN_R = 0.25;
// 노트는 판정선을 넘어가지 않는다. 지나쳐 흐르면 정확히 언제 치는지가 흐려진다.
var OVERSHOOT_MS = 0;
function approachMs(){ return APPROACH_BASE / speedIdx; }

/** 반환 null 이면 아직 안 보이거나 이미 지나간 노트. */
function approachAt(lead, ap){
  if (lead > ap || lead < 0) return null;
  var half = ap / 2;
  if (lead > half){
    var f = 1 - (lead - half) / half;
    return { rf: SPAWN_R, alpha: f, grow: f };
  }
  var t = 1 - lead / half;                        // 판정선에 닿으면 정확히 1
  return { rf: SPAWN_R + (1 - SPAWN_R) * t, alpha: 1, grow: 1 };
}

// ── 노트 그리기 ────────────────────────────────────────────────────────────
var NOTE_R = R / 9.5;                  // 판정선에서의 기본 노트 반지름
var ARROW_GAP = Math.PI * R / 32;      // MajGeo.DefaultDistance = 판정원 둘레의 1/64
var FLASH_MS = 130;

/**
 * 판정선에 닿는 순간의 짧은 파열.
 * 노트를 판정선에서 없애면 "언제 치는지"가 오히려 안 보이므로, 사라지는 자리에
 * 한 번 퍼지는 링을 남겨 입력 타이밍을 눈으로 잡을 수 있게 한다.
 */
function hitFlash(x, y, size, color, f){
  ctx.save();
  ctx.globalAlpha = (1 - f) * 0.85;
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.5, size * 0.45 * (1 - f));
  ctx.beginPath(); ctx.arc(x, y, size * (1 + f * 1.05), 0, TAU); ctx.stroke();
  ctx.globalAlpha = (1 - f) * 0.5;
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, size * (1 + f * 1.7), 0, TAU); ctx.stroke();
  ctx.restore();
}

/** TAP: 흰 테두리 + 두꺼운 색 링 + 어두운 구멍 + 가운데 점. */
function noteDonut(x, y, size, color){
  ctx.beginPath(); ctx.arc(x, y, size, 0, TAU);
  ctx.fillStyle = color; ctx.fill();
  ctx.lineWidth = Math.max(1, size * 0.15); ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, size * 0.5, 0, TAU);
  ctx.fillStyle = FIELD_BG; ctx.fill();
  ctx.lineWidth = Math.max(1, size * 0.11); ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, size * 0.17, 0, TAU);
  ctx.fillStyle = color; ctx.fill();
}
/** BREAK 는 바깥으로 네 갈래 반짝임이 더 붙는다. */
function breakSpark(x, y, size, spin){
  ctx.save(); ctx.translate(x, y); ctx.rotate(spin);
  ctx.fillStyle = '#fff2c4';
  for (var i = 0; i < 4; i++){
    ctx.rotate(Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, -size * 1.45); ctx.lineTo(size * 0.2, -size * 1.02);
    ctx.lineTo(0, -size * 0.9); ctx.lineTo(-size * 0.2, -size * 1.02);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
/** EX 노트는 바깥에 흰 후광이 깔린다. */
function exGlow(x, y, size){
  ctx.beginPath(); ctx.arc(x, y, size * 1.3, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fill();
}

/**
 * HOLD 는 실기에서 "늘어난 TAP" 이다. 머리·꼬리가 노트와 같은 폭이고, 몸통
 * 한가운데를 어두운 트랙이 지나며 그 안에 밝은 심지가 한 줄 들어간다.
 */
function holdBody(a, b, size, color){
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#fff'; ctx.lineWidth = size * 2;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  ctx.strokeStyle = color; ctx.lineWidth = size * 2 - Math.max(2, size * 0.3);
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  ctx.strokeStyle = FIELD_BG; ctx.lineWidth = size * 0.92;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.5, size * 0.2);
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  ctx.lineCap = 'butt';
}

/** 슬라이드 별: 흰 별 위에 색 별, 그 안에 별 윤곽이 한 겹 더 들어간 이중 구조. */
function starPath(x, y, outer, inner, rot){
  ctx.beginPath();
  for (var i = 0; i < 10; i++){
    var a = i * Math.PI / 5 - Math.PI / 2 + rot;
    var rr = (i % 2 === 0) ? outer : inner;
    var fx = x + Math.cos(a) * rr, fy = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(fx, fy); else ctx.lineTo(fx, fy);
  }
  ctx.closePath();
}
function starNote(x, y, size, color, spin){
  var rot = spin || 0;
  starPath(x, y, size, size * 0.46, rot);
  ctx.fillStyle = '#fff'; ctx.fill();
  starPath(x, y, size * 0.84, size * 0.39, rot);
  ctx.fillStyle = color; ctx.fill();
  starPath(x, y, size * 0.46, size * 0.21, rot);
  ctx.strokeStyle = 'rgba(255,255,255,.9)';
  ctx.lineWidth = Math.max(1.2, size * 0.09); ctx.stroke();
}

/**
 * TOUCH: 센서 자리에 얇은 목표 링이 먼저 뜨고, 네 장의 연잎이 바깥에서
 * 그 위로 모여든다. spread 1 = 활짝, 0 = 센서 위에 모인 상태(판정 순간).
 */
function touchNote(x, y, size, spread, color){
  ctx.beginPath(); ctx.arc(x, y, size * 0.95, 0, TAU);
  ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 2; ctx.stroke();
  for (var i = 0; i < 4; i++){
    var a = i * Math.PI / 2 - Math.PI / 4;
    var ux = Math.cos(a), uy = Math.sin(a), px = -uy, py = ux;
    var d = size * (0.74 + 2.3 * spread);
    var cx = x + ux * d, cy = y + uy * d;
    var tip = size * 0.8, back = size * 0.6, wide = size * 0.44, waist = size * 0.08;
    ctx.beginPath();
    ctx.moveTo(cx - ux * tip, cy - uy * tip);
    ctx.lineTo(cx + px * wide - ux * waist, cy + py * wide - uy * waist);
    ctx.lineTo(cx + ux * back, cy + uy * back);
    ctx.lineTo(cx - px * wide - ux * waist, cy - py * wide - uy * waist);
    ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
    ctx.lineWidth = Math.max(1.2, size * 0.13); ctx.strokeStyle = '#fff'; ctx.stroke();
  }
}
/** TOUCH HOLD 는 누르고 있는 동안 남은 시간이 굵은 링으로 줄어든다. */
function touchGauge(x, y, size, left, color){
  var rr = size * 1.55, lw = Math.max(3, size * 0.32);
  ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU);
  ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.lineWidth = lw; ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, rr, -Math.PI / 2, -Math.PI / 2 + TAU * left);
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke();
}

/**
 * 슬라이드 궤적. 판정원 둘레 1/64 간격으로 화살촉을 늘어놓고, 별이 지나간
 * 화살촉부터 지운다. 뒤가 오목한 형태라 실기의 화살표 사슬처럼 보인다.
 */
function slideArrows(pc, passedLen, color, alpha){
  var pts = pc.pts, L = pc.len, total = L[L.length - 1];
  if (total < 1) return;
  ctx.save(); ctx.globalAlpha = alpha; ctx.lineJoin = 'round';
  var half = ARROW_GAP * 0.6, wide = ARROW_GAP * 0.5, notch = ARROW_GAP * 0.2;
  for (var d = ARROW_GAP * 0.5; d < total; d += ARROW_GAP){
    if (d < passedLen) continue;
    var p = atLen(pts, L, d), q = atLen(pts, L, Math.min(total, d + 4));
    var vx = q.x - p.x, vy = q.y - p.y, m = Math.sqrt(vx*vx + vy*vy) || 1;
    var ux = vx/m, uy = vy/m, px = -uy, py = ux;
    ctx.beginPath();
    ctx.moveTo(p.x + ux*half, p.y + uy*half);
    ctx.lineTo(p.x - ux*(half - notch) + px*wide, p.y - uy*(half - notch) + py*wide);
    ctx.lineTo(p.x - ux*(half - notch*2.3), p.y - uy*(half - notch*2.3));
    ctx.lineTo(p.x - ux*(half - notch) - px*wide, p.y - uy*(half - notch) - py*wide);
    ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.stroke();
  }
  ctx.restore();
}

// ── 필드 ───────────────────────────────────────────────────────────────────
function drawField(){
  ctx.clearRect(0, 0, 920, 920);
  ctx.beginPath(); ctx.arc(CX, CY, R + 30, 0, TAU);
  ctx.fillStyle = FIELD_BG; ctx.fill();
  // 센서 구획 안내선
  ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(CX, CY, GROUP_B_R, 0, TAU); ctx.stroke();
  for (var i = 1; i <= 8; i++){
    var a = ang(i) - Math.PI / 8;
    ctx.beginPath();
    ctx.moveTo(CX + Math.cos(a) * R * 0.12, CY + Math.sin(a) * R * 0.12);
    ctx.lineTo(CX + Math.cos(a) * R, CY + Math.sin(a) * R);
    ctx.stroke();
  }
  // 판정 링 + 버튼
  ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(CX, CY, R, 0, TAU); ctx.stroke();
  for (var j = 1; j <= 8; j++){
    var p = btn(j);
    ctx.beginPath(); ctx.arc(p.x, p.y, 12, 0, TAU);
    ctx.fillStyle = '#fff'; ctx.fill();
  }
}

// ── 상태 ───────────────────────────────────────────────────────────────────
var END = CHART.durationMs + 1500;
var t = 0, playing = false, last = 0;
var rate = 1, speedIdx = 6, sound = true, guide = true;

// 같은 타이밍의 링 노트들은 maimai 에서 노란 선으로 이어진다(EACH 표시).
var EACH_LINKS = (function(){
  var by = {}, out = [];
  for (var i = 0; i < NOTES.length; i++){
    var n = NOTES[i];
    if (n.type === 'touch' || n.type === 'touchHold') continue;
    var k = String(n.timeMs);
    if (!by[k]) by[k] = [];
    by[k].push(n);
  }
  for (var k2 in by) if (by[k2].length >= 2) out.push(by[k2]);
  return out;
})();

var actx = null, audioEl = null, audioReady = false;
function click(kind){
  if (!sound) return;
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  var o = actx.createOscillator(), g = actx.createGain();
  o.frequency.value = kind === 'break' ? 1500 : kind === 'slide' ? 720 : 1050;
  o.type = 'square';
  g.gain.setValueAtTime(0.14, actx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0008, actx.currentTime + 0.05);
  o.connect(g); g.connect(actx.destination);
  o.start(); o.stop(actx.currentTime + 0.055);
}

function frame(now){
  if (playing){
    var dt = Math.min(120, now - last) * rate;
    last = now;
    var prev = t;
    if (audioReady && !audioEl.paused) t = audioEl.currentTime * 1000;
    else t += dt;
    for (var i = 0; i < NOTES.length; i++){
      var n = NOTES[i];
      if (n.timeMs > prev && n.timeMs <= t) click(n.isBreak ? 'break' : n.type === 'slide' ? 'slide' : 'tap');
    }
    if (t >= END) { t = END; pause(); }
  }
  draw();
  requestAnimationFrame(frame);
}

function draw(){
  drawField();
  var ap = approachMs();
  var spin = t / 260;
  var i, n, st;

  // 1) 슬라이드 궤적 — 노트보다 뒤에 깔린다
  for (i = 0; i < NOTES.length; i++){
    n = NOTES[i];
    if (n.type !== 'slide') continue;
    for (var k = 0; k < n.slides.length; k++){
      var b = n.slides[k];
      var s0 = n.timeMs + b.delayMs, s1 = s0 + b.durationMs;
      if (t < n.timeMs - ap || t > s1 + 100) continue;
      var pc = cachedPath(n, k);
      if (!guide) continue;
      var total = pc.len[pc.len.length - 1];
      var passed = 0, alpha = 0.3;
      if (t >= s0){
        // 별이 지난 만큼 화살표가 사라지고, 남은 화살표는 진하게 보인다
        var gp = slideProgressLen(pc, b, t - s0);
        passed = gp; alpha = 1;
      } else if (t >= n.timeMs){
        alpha = 0.3 + 0.5 * Math.min(1, (t - n.timeMs) / Math.max(1, b.delayMs));
      } else {
        alpha = 0.3 * Math.max(0, 1 - (n.timeMs - t) / ap);
      }
      var acol = b.isBreak ? C_ARROW_BREAK : C_ARROW;
      slideArrows(pc, passed, acol, alpha);
      for (var w = 0; w < pc.fans.length; w++){
        // 곁가지는 본선 진행도에 맞춰 같은 비율만큼 지운다
        var fl = pc.fans[w].len[pc.fans[w].len.length - 1];
        slideArrows(pc.fans[w], fl * (passed / (total || 1)), acol, alpha);
      }
    }
  }

  // 2) EACH 연결선
  ctx.save();
  for (i = 0; i < EACH_LINKS.length; i++){
    var grp = EACH_LINKS[i];
    st = approachAt(grp[0].timeMs - t, ap);
    if (!st) continue;
    ctx.globalAlpha = st.alpha * 0.85;
    ctx.strokeStyle = C_EACH; ctx.lineWidth = 5;
    for (var a2 = 0; a2 < grp.length - 1; a2++){
      var p1 = rayPt(grp[a2].pos, R * st.rf), p2 = rayPt(grp[a2 + 1].pos, R * st.rf);
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }
  }
  ctx.restore();

  // 3) TOUCH / TOUCH HOLD
  for (i = 0; i < NOTES.length; i++){
    n = NOTES[i];
    if (n.type !== 'touch' && n.type !== 'touchHold') continue;
    var tail = n.type === 'touchHold' ? (n.durationMs || 0) : 0;
    var lead = n.timeMs - t;
    var over = t - (n.timeMs + tail);
    if (lead > ap || over > FLASH_MS) continue;
    var tp = touchPt(n.area, n.pos);
    var tsz = NOTE_R * 0.95, tcol = colorOf(n);
    ctx.save();
    if (lead > 0){
      ctx.globalAlpha = Math.min(1, (1 - lead / ap) * 1.8);
      touchNote(tp.x, tp.y, tsz, lead / ap, tcol);
    } else if (tail > 0 && over < 0){
      // 누르고 있는 동안: 모인 상태 유지 + 남은 시간 게이지
      touchNote(tp.x, tp.y, tsz, 0, tcol);
      touchGauge(tp.x, tp.y, tsz, Math.max(0, -over / tail), tcol);
    } else {
      hitFlash(tp.x, tp.y, tsz * 1.1, tcol, Math.max(0, over) / FLASH_MS);
      if (n.hasFirework){
        var fw = Math.max(0, over) / FLASH_MS;
        ctx.globalAlpha = 1 - fw;
        ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 3;
        for (var f2 = 0; f2 < 8; f2++){
          var fa = f2 * Math.PI / 4;
          ctx.beginPath();
          ctx.moveTo(tp.x + Math.cos(fa)*tsz*(1 + fw*1.6), tp.y + Math.sin(fa)*tsz*(1 + fw*1.6));
          ctx.lineTo(tp.x + Math.cos(fa)*tsz*(1.6 + fw*2.4), tp.y + Math.sin(fa)*tsz*(1.6 + fw*2.4));
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  // 4) HOLD → TAP → 슬라이드 별 순으로 (뒤에 깔릴 것부터)
  for (i = 0; i < NOTES.length; i++){
    n = NOTES[i];
    if (n.type !== 'hold') continue;
    var hold = n.durationMs || 0;
    var hLead = n.timeMs - t, tLead = n.timeMs + hold - t;
    if (hLead > ap || -tLead > FLASH_MS) continue;
    var hcol = colorOf(n), hp, tpt;
    if (tLead >= 0){
      // 머리가 판정선을 지난 뒤에도 꼬리가 도착할 때까지 몸통은 남아 있어야 한다.
      var hs = approachAt(hLead, ap);
      var headRf = hs ? hs.rf : 1;
      var size2 = NOTE_R * (hs ? hs.grow : 1);
      var tailRf;
      if (tLead > ap) tailRf = SPAWN_R;              // 꼬리는 아직 나오지 않았다
      else { var ts = approachAt(tLead, ap); tailRf = ts ? ts.rf : 1; }
      if (tailRf > headRf) tailRf = headRf;
      hp = rayPt(n.pos, R * headRf); tpt = rayPt(n.pos, R * tailRf);
      ctx.save(); ctx.globalAlpha = hs ? hs.alpha : 1;
      holdBody(tpt, hp, size2 * 0.92, hcol);
      if (hs){
        // 머리는 판정선에 닿는 순간 사라지고, 그 뒤엔 몸통만 줄어든다.
        if (n.isEx) exGlow(hp.x, hp.y, size2);
        noteDonut(hp.x, hp.y, size2, hcol);
        if (n.isBreak) breakSpark(hp.x, hp.y, size2, spin);
      }
      ctx.restore();
    }
    // 머리 / 꼬리가 판정선에 닿는 순간
    if (hLead <= 0 && -hLead <= FLASH_MS){
      var bp2 = btn(n.pos); hitFlash(bp2.x, bp2.y, NOTE_R * 1.1, hcol, -hLead / FLASH_MS);
    }
    if (tLead <= 0 && -tLead <= FLASH_MS){
      var bp3 = btn(n.pos); hitFlash(bp3.x, bp3.y, NOTE_R * 1.1, hcol, -tLead / FLASH_MS);
    }
  }

  for (i = 0; i < NOTES.length; i++){
    n = NOTES[i];
    if (n.type !== 'tap') continue;
    var col = colorOf(n);
    st = approachAt(n.timeMs - t, ap);
    if (st){
      var p3 = rayPt(n.pos, R * st.rf), sz = NOTE_R * st.grow;
      ctx.save(); ctx.globalAlpha = st.alpha;
      if (n.isEx) exGlow(p3.x, p3.y, sz);
      // '$' 가 붙은 TAP 은 별 모양으로 나온다 ('$$' 는 회전)
      if (n.starTap) starNote(p3.x, p3.y, sz * 1.15, col, n.starTap === 2 ? spin * 2 : 0);
      else noteDonut(p3.x, p3.y, sz, col);
      if (n.isBreak) breakSpark(p3.x, p3.y, sz, spin);
      ctx.restore();
    } else if (t >= n.timeMs && t - n.timeMs <= FLASH_MS){
      var bp = btn(n.pos);
      hitFlash(bp.x, bp.y, NOTE_R * 1.1, col, (t - n.timeMs) / FLASH_MS);
    }
  }

  for (i = 0; i < NOTES.length; i++){
    n = NOTES[i];
    if (n.type !== 'slide') continue;
    // 이동 중인 별
    for (var k2 = 0; k2 < n.slides.length; k2++){
      var b2 = n.slides[k2];
      var m0 = n.timeMs + b2.delayMs, m1 = m0 + b2.durationMs;
      if (t < m0 || t > m1) continue;
      var pc2 = cachedPath(n, k2);
      var mp = slidePos(pc2, b2, t - m0);
      var ahead = slidePos(pc2, b2, Math.min(b2.durationMs, t - m0 + 30));
      starNote(mp.x, mp.y, NOTE_R * 1.08, b2.isBreak ? C_BREAK : colorOf(n),
        Math.atan2(ahead.y - mp.y, ahead.x - mp.x) + Math.PI / 2);
    }
    if (n.starless) continue;
    var scol = colorOf(n);
    var firstEnd = n.timeMs + n.slides[0].delayMs;
    if (t <= firstEnd){
      // 별이 판정선에 닿은 뒤에는 궤적이 출발할 때까지 그 자리에서 기다린다.
      st = (t >= n.timeMs) ? { rf: 1, alpha: 1, grow: 1 } : approachAt(n.timeMs - t, ap);
      if (st){
        var sp = rayPt(n.pos, R * st.rf), ssz = NOTE_R * st.grow;
        ctx.save(); ctx.globalAlpha = st.alpha;
        if (n.isEx) exGlow(sp.x, sp.y, ssz);
        if (n.plainStar) noteDonut(sp.x, sp.y, ssz, scol);
        else starNote(sp.x, sp.y, ssz * 1.12, scol, spin);
        if (n.isBreak) breakSpark(sp.x, sp.y, ssz, spin);
        ctx.restore();
      }
    }
    if (t >= n.timeMs && t - n.timeMs <= FLASH_MS){
      var sbp = btn(n.pos);
      hitFlash(sbp.x, sbp.y, NOTE_R * 1.15, scol, (t - n.timeMs) / FLASH_MS);
    }
  }
  paintBar();
}

// ── 컨트롤 ─────────────────────────────────────────────────────────────────
var ppEl = document.getElementById('pp'), fillEl = document.getElementById('fill'), curEl = document.getElementById('cur');
function fmt(ms){
  var s = Math.max(0, Math.floor(ms/1000));
  return Math.floor(s/60) + ':' + String(s%60).padStart(2,'0');
}
function paintBar(){
  fillEl.style.width = (Math.min(1, t/END) * 100) + '%';
  curEl.textContent = fmt(t);
}
function play(){
  playing = true; last = performance.now(); ppEl.textContent = '❚❚';
  if (actx && actx.state === 'suspended') actx.resume();
  if (audioReady){ audioEl.currentTime = Math.max(0, t/1000); audioEl.playbackRate = rate; audioEl.play(); }
}
function pause(){
  playing = false; ppEl.textContent = '▶';
  if (audioReady) audioEl.pause();
}
ppEl.onclick = function(){ playing ? pause() : play(); };

var sk = document.getElementById('sk');
function seekTo(clientX){
  var r = sk.getBoundingClientRect();
  t = Math.max(0, Math.min(END, (clientX - r.left) / r.width * END));
  if (audioReady) audioEl.currentTime = t/1000;
}
sk.onpointerdown = function(e){ seekTo(e.clientX); sk.setPointerCapture(e.pointerId); sk.onpointermove = function(m){ seekTo(m.clientX); }; };
sk.onpointerup = function(e){ sk.onpointermove = null; sk.releasePointerCapture(e.pointerId); };

var spd = document.getElementById('spd'), spdv = document.getElementById('spdv');
spd.oninput = function(){ speedIdx = parseFloat(spd.value); spdv.textContent = speedIdx.toFixed(1); };
var rateEl = document.getElementById('rate'), ratev = document.getElementById('ratev');
rateEl.oninput = function(){
  rate = parseFloat(rateEl.value); ratev.textContent = rate.toFixed(2) + 'x';
  if (audioReady) audioEl.playbackRate = rate;
};
function toggle(el, get, set){
  el.onclick = function(){ set(!get()); el.classList.toggle('on', get()); };
}
toggle(document.getElementById('tSound'), function(){ return sound; }, function(v){ sound = v; });
toggle(document.getElementById('tGuide'), function(){ return guide; }, function(v){ guide = v; });
toggle(document.getElementById('tMirror'), function(){ return mirror; }, function(v){ mirror = v; cache = {}; });

document.getElementById('audio').onchange = function(e){
  var f = e.target.files && e.target.files[0];
  if (!f) return;
  if (!audioEl) audioEl = new Audio();
  audioEl.src = URL.createObjectURL(f);
  audioEl.playbackRate = rate;
  audioReady = true;
  sound = false;
  document.getElementById('tSound').classList.remove('on');
  document.getElementById('pickLabel').textContent = f.name;
};

// 한 마디 = 4박. BPM 이 바뀌면 마디 길이도 바뀌지만, 이동은 첫 BPM 기준으로 충분하다.
var measureMs = 4 * 60000 / (CHART.bpm || 120);
document.addEventListener('keydown', function(e){
  if (e.target && e.target.tagName === 'INPUT') return;
  if (e.code === 'Space'){ e.preventDefault(); playing ? pause() : play(); }
  else if (e.code === 'ArrowRight'){ t = Math.min(END, t + measureMs); if (audioReady) audioEl.currentTime = t/1000; }
  else if (e.code === 'ArrowLeft'){ t = Math.max(0, t - measureMs); if (audioReady) audioEl.currentTime = t/1000; }
});

requestAnimationFrame(frame);
</script></body></html>`;
}

/** 링크가 죽었을 때(보관 기간 만료 등) 보여주는 안내 페이지. */
export function chartNotFoundPage(title: string, desc: string): string {
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} - carolbot</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',system-ui,sans-serif;background:#0d0d0d;color:#ccc;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center}
h1{font-size:28px;font-weight:700;color:#fff;margin-bottom:10px}
p{font-size:14px;color:#777;margin-bottom:20px}
a{color:#c084fc;font-size:14px;text-decoration:none}
</style></head><body><div><h1>${esc(title)}</h1><p>${esc(desc)}</p><a href="/">← carolbot</a></div></body></html>`;
}
