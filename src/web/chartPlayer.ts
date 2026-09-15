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
    슬라이드 중 <span class="mono">p q pp qq s z</span> 는 궤적 모양을 근사해서 그립니다. 타이밍과 시작·도착 위치는 정확합니다.
  </div>
</div>
</div>
<script>
var DATA = ${json};
var CHART = DATA.chart;
var NOTES = CHART.notes;

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
  if (area === 'B') return mir(polRaw(ang(n), R * 0.42));
  if (area === 'D') return mir(polRaw(ang(n) - Math.PI / 8, R * 0.80));
  if (area === 'E') return mir(polRaw(ang(n) - Math.PI / 8, R * 0.42));
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
var PQ_STEP = Math.PI / 4;
function pqSmallP(from, to, isQ){
  var a = btnRaw(from), b = btnRaw(to);
  var via = btnRaw(isQ ? ((from + 2) % 8) + 1 : ((from + 4) % 8) + 1);
  var o = { x: (a.x + via.x) / 2, y: (a.y + via.y) / 2 };
  var rad = Math.sqrt(Math.pow(o.x - CX, 2) + Math.pow(o.y - CY, 2));
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
  var ux = dx / L, uy = dy / L, rad = 0.45 * R;
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
function slidePos(pc, body, elapsed){
  var total = pc.len[pc.len.length-1];
  if (!pc.groups) return atLen(pc.pts, pc.len, total * clamp01(elapsed / (body.durationMs || 1)));
  var acc = 0, seg = 0;
  for (var g = 0; g < pc.groups.length; g++){
    var d = pc.groups[g].durationMs || 1;
    var last = Math.min(seg + pc.groups[g].count - 1, pc.segEnd.length - 1);
    if (elapsed <= acc + d || g === pc.groups.length - 1){
      var L0 = pc.len[seg === 0 ? 0 : pc.segEnd[seg-1]];
      var L1 = pc.len[pc.segEnd[last]];
      return atLen(pc.pts, pc.len, L0 + (L1 - L0) * clamp01((elapsed - acc) / d));
    }
    acc += d; seg = last + 1;
  }
  return pc.pts[pc.pts.length-1];
}

// 궤적은 매 프레임 다시 계산하면 비싸다. 노트별로 한 번만 만들어 캐시한다.
var cache = {};
function cachedPath(note, k){
  var key = note.timeMs + ':' + k + ':' + (mirror ? 'm' : 'n');
  if (!cache[key]){
    var body = note.slides[k];
    var built = pathOf(body);
    var fans = wifiFans(body.segments);
    if (mirror) fans = fans.map(function(f){ return f.map(mir); });
    cache[key] = {
      pts: built.pts, segEnd: built.segEnd, len: pathLen(built.pts),
      fans: fans, groups: body.groups || null,
    };
  }
  return cache[key];
}

// ── 색 ─────────────────────────────────────────────────────────────────────
var C_TAP = '#ff5fae', C_EACH = '#ffd63d', C_BREAK = '#ff9500', C_SLIDE = '#00d4e0', C_TOUCH = '#4fc3f7';
function colorOf(n){
  if (n.isBreak) return C_BREAK;
  if (n.type === 'slide') return C_SLIDE;
  if (n.type === 'touch' || n.type === 'touchHold') return C_TOUCH;
  return n.isEach ? C_EACH : C_TAP;
}

// ── 그리기 ─────────────────────────────────────────────────────────────────
function drawField(){
  ctx.clearRect(0, 0, 920, 920);
  ctx.strokeStyle = '#242424'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(CX, CY, R * 0.42, 0, Math.PI*2); ctx.stroke();
  for (var i = 1; i <= 8; i++){
    var a = ang(i) - Math.PI/8;
    ctx.beginPath();
    ctx.moveTo(CX + Math.cos(a)*R*0.10, CY + Math.sin(a)*R*0.10);
    ctx.lineTo(CX + Math.cos(a)*R, CY + Math.sin(a)*R);
    ctx.stroke();
  }
  ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(CX, CY, R, 0, Math.PI*2); ctx.stroke();
  for (var j = 1; j <= 8; j++){
    var p = btn(j);
    ctx.fillStyle = '#2f2f2f';
    ctx.beginPath(); ctx.arc(p.x, p.y, 21, 0, Math.PI*2); ctx.fill();
  }
}
function ring(x, y, r, color, fill){
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2);
  if (fill){ ctx.fillStyle = fill; ctx.fill(); }
  ctx.strokeStyle = color; ctx.lineWidth = 7; ctx.stroke();
}
function star(x, y, r, color){
  ctx.save(); ctx.translate(x, y); ctx.beginPath();
  for (var i = 0; i < 10; i++){
    var a = (-90 + i*36) * Math.PI/180, rr = (i % 2 === 0) ? r : r * 0.45;
    var fx = Math.cos(a)*rr, fy = Math.sin(a)*rr;
    if (i === 0) ctx.moveTo(fx, fy); else ctx.lineTo(fx, fy);
  }
  ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.stroke(); ctx.restore();
}
function drawGuide(pts){
  ctx.strokeStyle = 'rgba(0,212,224,.22)'; ctx.lineWidth = 16; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke(); ctx.lineCap = 'butt';
}

// ── 상태 ───────────────────────────────────────────────────────────────────
var END = CHART.durationMs + 1500;
var t = 0, playing = false, last = 0;
var rate = 1, speedIdx = 6, sound = true, guide = true;
// 노트 속도: 숫자가 클수록 빨리 날아온다. maimai 의 체감에 맞춰 대략 맞춘 표.
function approachMs(){ return 3200 / speedIdx; }

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
  for (var i = 0; i < NOTES.length; i++){
    var n = NOTES[i];
    var lead = n.timeMs - t;

    if (n.type === 'slide'){
      for (var k = 0; k < n.slides.length; k++){
        var b = n.slides[k];
        var s0 = n.timeMs + b.delayMs, s1 = s0 + b.durationMs;
        if (t < n.timeMs - ap || t > s1 + 120) continue;
        var pc = cachedPath(n, k);
        if (guide && t >= n.timeMs){
          drawGuide(pc.pts);
          for (var w = 0; w < pc.fans.length; w++) drawGuide(pc.fans[w]);
        }
        if (t >= s0 && t <= s1){
          var p = slidePos(pc, b, t - s0);
          star(p.x, p.y, 20, b.isBreak ? C_BREAK : C_SLIDE);
        }
      }
      // 시작 별. '?'/'!' 는 별을 아예 표시하지 않고, '@' 는 일반 TAP 모양으로 바꾼다.
      if (!n.starless){
        var scol = colorOf(n);
        if (lead >= 0 && lead <= ap){
          var pr = 1 - lead / ap, sp = rayPt(n.pos, R * pr);
          if (n.plainStar) ring(sp.x, sp.y, 18, scol);
          else star(sp.x, sp.y, 20 * (0.35 + 0.65*pr), scol);
        } else if (lead < 0 && t < n.timeMs + n.slides[0].delayMs){
          var sp2 = btn(n.pos);
          if (n.plainStar) ring(sp2.x, sp2.y, 18, scol);
          else star(sp2.x, sp2.y, 20, scol);
        }
      }
      continue;
    }

    if (n.type === 'touch' || n.type === 'touchHold'){
      var tail = n.type === 'touchHold' ? (n.durationMs || 0) : 0;
      if (lead > ap || t > n.timeMs + tail + 120) continue;
      var tp = touchPt(n.area, n.pos);
      var prog = lead > 0 ? 1 - lead / ap : 1;
      ctx.globalAlpha = lead > 0 ? Math.min(1, prog * 1.6) : 1;
      ring(tp.x, tp.y, 13 + 13 * prog, colorOf(n));
      ctx.globalAlpha = 1;
      continue;
    }

    // tap / hold
    var holdMs = n.type === 'hold' ? (n.durationMs || 0) : 0;
    if (lead > ap || t > n.timeMs + holdMs + 120) continue;
    var headR = lead > 0 ? R * (1 - lead / ap) : R;
    var head = rayPt(n.pos, Math.max(0, headR));
    var col = colorOf(n);
    if (holdMs > 0){
      var tailLead = (n.timeMs + holdMs) - t;
      var tailR = tailLead > 0 ? R * Math.max(0, 1 - tailLead / ap) : R;
      var tailPt = rayPt(n.pos, Math.max(0, tailR));
      ctx.strokeStyle = col; ctx.lineWidth = 30; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tailPt.x, tailPt.y);
      ctx.lineTo(head.x, head.y);
      ctx.stroke(); ctx.lineCap = 'butt';
    }
    // '$' 로 별 모양이 된 TAP 은 슬라이드 별과 같은 모양으로 그린다.
    if (n.starTap) star(head.x, head.y, 19, col);
    else ring(head.x, head.y, 18, col, n.isEx ? 'rgba(255,255,255,.28)' : null);
    if (n.isBreak){
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(head.x, head.y, 23, 0, Math.PI*2); ctx.stroke();
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
