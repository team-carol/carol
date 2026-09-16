// 채보 플레이어의 그리기 코어.
//
// 브라우저에서는 이 문자열을 <script> 안에 그대로 넣고, 서버에서는 같은 문자열을
// vm 에 올려 캔버스 컨텍스트만 갈아끼워 프레임을 뽑는다(미리보기 GIF 생성).
// 코드를 두 벌 두지 않으려고 원문 그대로 보관한다 — 여기서 ` 와 ${ 는 쓰지 말 것.
//
// 실행 시 필요한 것:
//   전역 DATA  : { id, title, artist, designer, level, difficulty, chart }
//   document.getElementById(...)  : 'cv' 는 getContext('2d') 를 주는 캔버스
//   requestAnimationFrame / performance / window
// 노출되는 것(같은 스코프의 전역): t, draw(), NOTES, END, speedIdx, mirror, guide, sound ...

export const RENDERER_JS = `var CHART = DATA.chart;
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
  if (area === 'A') return mir(polRaw(ang(n), R * (4.1 / MJ_R)));
  if (area === 'B') return mir(polRaw(ang(n), R * (2.3 / MJ_R)));
  if (area === 'D') return mir(polRaw(ang(n) - Math.PI / 8, R * (4.1 / MJ_R)));
  if (area === 'E') return mir(polRaw(ang(n) - Math.PI / 8, R * (3.0 / MJ_R)));
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
  if (from === to){
    // 시작과 도착이 같으면 한 바퀴 ('7<7' 등). 각도차가 0 이라 그냥 두면 사라진다.
    d = cw ? Math.PI * 2 : -Math.PI * 2;
  } else {
    while (d <= 0) d += Math.PI * 2;
    if (!cw) d -= Math.PI * 2;
  }
  return arcP(CX, CY, R, a0, d, 36);
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
  var n = L.length;
  if (d >= L[n-1]) return pts[n-1];
  var lo = 1, hi = n - 1;
  while (lo < hi){ var mid = (lo + hi) >> 1; if (L[mid] >= d) hi = mid; else lo = mid + 1; }
  var f = (d - L[lo-1]) / ((L[lo] - L[lo-1]) || 1);
  return { x: pts[lo-1].x + (pts[lo].x - pts[lo-1].x)*f, y: pts[lo-1].y + (pts[lo].y - pts[lo-1].y)*f };
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
// (x,y) 에서 경로까지 가장 가까운 지점의 호 길이와 거리제곱. 슬라이드 간섭용.
// 직선 슬라이드는 표본점이 몇 개뿐이라 꼭짓점만 보면 빗나간다. 각 선분에 투영한다.
function nearestOnPath(pc, x, y){
  var pts = pc.pts, len = pc.len, best = 1e18, bl = 0;
  for (var i = 0; i < pts.length - 1; i++){
    var ax = pts[i].x, ay = pts[i].y;
    var vx = pts[i+1].x - ax, vy = pts[i+1].y - ay;
    var seg2 = vx * vx + vy * vy || 1;
    var tp = ((x - ax) * vx + (y - ay) * vy) / seg2;
    tp = tp < 0 ? 0 : tp > 1 ? 1 : tp;
    var px = ax + vx * tp, py = ay + vy * tp;
    var dx = x - px, dy = y - py, d2 = dx * dx + dy * dy;
    if (d2 < best){ best = d2; bl = len[i] + (len[i+1] - len[i]) * tp; }
  }
  return { len: bl, dist2: best };
}

// 궤적은 매 프레임 다시 계산하면 비싸다. 노트별로 한 번만 만들어 캐시한다.
var cache = {};
var WIFI_BARS = 11;   // 실기의 wifi_0 ~ wifi_10
/**
 * 한 점이 어느 판정 구역에 속하는지. 실기는 별이 센서를 지날 때마다 그 구역의
 * 궤적이 통째로 사라지므로(MajdataView 는 judgeSensors 단위로 slideBars 를
 * 한꺼번에 끈다), 화살표를 구역 단위로 묶어 두려고 쓴다.
 */
function sensorKey(x, y){
  var dx = x - CX, dy = y - CY;
  var r = Math.sqrt(dx*dx + dy*dy) / R;
  if (r < 0.26) return 'C';
  var k = Math.round((Math.atan2(dy, dx) - ang(1)) / (Math.PI / 4));
  return (r < 0.56 ? 'B' : 'A') + (((k % 8) + 8) % 8);
}
// 별이 센서를 밟았다고 보는 반경. MajdataView 의 starRadius 0.7637 (단위 4.8).
// (MJ_R 은 아래에서 선언되므로 여기서는 값 4.8 을 직접 쓴다)
var STAR_TRIG = R * (0.763736616 / 4.8);
var SENSOR_RAD = { A: R * 0.11, B: R * 0.09, C: R * 0.12 };
function sensorCenter(key){
  if (key === 'C') return { x: CX, y: CY };
  var k = +key.slice(1);
  return polRaw(ang(1) + k * Math.PI / 4, key.charAt(0) === 'A' ? R * 0.854 : R * 0.479);
}
/**
 * 묶음마다 "이 호 길이를 지나면 통째로 사라진다" 는 값을 매긴다.
 *
 * MajdataView 의 판정은 Area.IsFinished => On && Off 다. 즉 별이 그 센서의
 * 감지 원에 들어갔다가(On) 벗어나야(Off) 그 구역 몫이 사라진다. 구역 경계가
 * 아니라 센서 중심 기준이라, 구역을 다 빠져나가기 전에 사라진다.
 *   ON 조건: |별 - 센서중심|² <= 센서반지름² + 별반지름²
 */
function groupBySensor(list, pc){
  var g = 0, prev = null, keys = [], from = [], to = [], rel = [];
  for (var i = 0; i < list.length; i++){
    var k = sensorKey(list[i].x, list[i].y);
    if (prev !== null && k !== prev) g++;
    list[i].g = g; keys[g] = k; prev = k;
    if (from[g] === undefined) from[g] = i;
    to[g] = i;
  }
  var step = list.length > 1 ? list[1].d - list[0].d : 1;
  for (var gi = 0; gi <= g; gi++){
    var c = sensorCenter(keys[gi]);
    var sr = SENSOR_RAD[keys[gi].charAt(0)];
    var th = Math.sqrt(sr * sr + STAR_TRIG * STAR_TRIG);
    var enter = null, leave = null;
    // 왕복해서 같은 구역을 다시 지나는 경로가 있으므로, 반드시 이 묶음이
    // 시작하는 지점부터 훑는다. 처음부터 훑으면 앞선 방문의 이탈 지점을
    // 물려받아 뒤쪽 궤적이 먼저 사라진다.
    for (var j = from[gi]; j < list.length; j++){
      var dx = list[j].x - c.x, dy = list[j].y - c.y;
      if (dx * dx + dy * dy <= th * th){ if (enter === null) enter = list[j].d; }
      else if (enter !== null){ leave = list[j].d; break; }
    }
    // 마지막 구역은 IsLast => On 이라 닿는 순간 끝난다. 나머지는 On && Off.
    var r = (gi === g) ? enter : leave;
    // 감지 원에 한 번도 못 들어간 구역은 그냥 그 묶음이 끝나는 자리에서 지운다.
    // (그대로 두면 소거 지점이 경로 밖으로 밀려 화살표가 영영 남는다.)
    if (r === null || r === undefined) r = list[to[gi]].d + step;
    rel[gi] = r;
  }
  pc.groupStarts = rel;
  pc.sensorGroups = g + 1;   // 센서 구역 수 (간섭의 한 칸 보정 허용치 계산용)
}
/** 화살표를 놓을 지점과 방향을 미리 구해 둔다 (매 프레임 경로를 훑지 않도록). */
function buildArrows(pc){
  var out = [], total = pc.len[pc.len.length - 1];
  for (var d = ARROW_GAP * 0.5; d < total; d += ARROW_GAP){
    var p = atLen(pc.pts, pc.len, d), q = atLen(pc.pts, pc.len, Math.min(total, d + 4));
    var vx = q.x - p.x, vy = q.y - p.y, m = Math.sqrt(vx*vx + vy*vy) || 1;
    out.push({ x: p.x, y: p.y, ux: vx/m, uy: vy/m, d: d });
  }
  groupBySensor(out, pc);
  // 간섭이 순서를 지키되 한 구역만 앞질러도 처리되도록(MajdataPlay 의 second 판정)
  // 허용 호길이 = 평균 구역 길이 * 1.5.
  pc.groupSkipLen = total / Math.max(1, pc.sensorGroups) * 1.5;
  return out;
}
/**
 * 扇形(w)은 화살표가 아니라 "와이파이 아이콘" 처럼 겹겹이 놓인 꺾인 막대다.
 * 세 갈래 위의 같은 진행률 지점을 이어 막대 하나를 만든다.
 */
function buildWifiBars(pc){
  var lines = [pc.fans[0], { pts: pc.pts, len: pc.len }, pc.fans[1]];
  var out = [];
  for (var i = 0; i < WIFI_BARS; i++){
    var f = (i + 1) / (WIFI_BARS + 0.5), row = [];
    for (var j = 0; j < 3; j++){
      var L = lines[j];
      row.push(atLen(L.pts, L.len, L.len[L.len.length - 1] * f));
    }
    out.push({ f: f, pts: row });
  }
  // 가운데 줄 기준으로 구역을 나누고, 화살표와 같은 기준(센서 감지 원을
  // 벗어나는 지점)으로 묶음마다 사라지는 진행률을 매긴다.
  var mid = out.map(function(o){ return { x: o.pts[1].x, y: o.pts[1].y, d: o.f }; });
  var fake = {};
  groupBySensor(mid, fake);
  for (var k = 0; k < out.length; k++){ out[k].g = mid[k].g; out[k].gStart = fake.groupStarts[mid[k].g]; }
  pc.groupSkipLen = (pc.len[pc.len.length - 1] || 1) / Math.max(1, fake.sensorGroups) * 1.5;
  return out;
}
function cachedPath(note, k){
  var key = note.__idx + ':' + k + ':' + (mirror ? 'm' : 'n');
  if (!cache[key]){
    var body = note.slides[k];
    var built = pathOf(body);
    var fans = wifiFans(body.segments);
    if (mirror) fans = fans.map(function(f){ return f.map(mir); });
    var pc = {
      pts: built.pts, segEnd: built.segEnd, len: pathLen(built.pts),
      fans: fans.map(function(f){ return { pts: f, len: pathLen(f) }; }),
      groups: body.groups || null,
    };
    pc.isWifi = pc.fans.length === 2;
    if (pc.isWifi) pc.bars = buildWifiBars(pc);
    else pc.arrows = buildArrows(pc);
    cache[key] = pc;
  }
  return cache[key];
}

// ── 색 ─────────────────────────────────────────────────────────────────────
// maimai 의 노트 색: 단일 TAP 은 분홍, EACH 는 노랑, BREAK 는 주황(EACH 여도 안 바뀐다).
// 슬라이드 별도 같은 규칙을 따르고, 궤적 화살표만 하늘색 계열로 따로 간다.
var C_TAP = '#ff4f9d', C_EACH = '#ffd42a', C_BREAK = '#ff6600';
var C_TOUCH = '#39c6f0', C_TOUCH_EACH = '#ffd42a';
var C_ARROW = '#28c8e6', C_ARROW_BREAK = '#ff6600';
var FIELD_BG = '#11111e';
var TAU = Math.PI * 2;

function colorOf(n){
  if (n.isBreak) return C_BREAK;
  if (n.type === 'touch' || n.type === 'touchHold') return n.isEach ? C_TOUCH_EACH : C_TOUCH;
  // 슬라이드 별은 동시 타이밍이거나 슬라이드끼리 겹칠 때 노랗게 된다.
  return (n.isEach || n.slideEach) ? C_EACH : C_TAP;
}

// ── 등장 방식 ───────────────────────────────────────────────────────────────
// MajdataView 의 낙하 모델을 그대로 옮겼다 (TapBase.Update).
//   distance = timing * speed + 4.8        (4.8 = 판정원 반지름)
//   scale    = distance * 0.4 + 0.51
// 즉 노트는 거리 1.225(= 0.2552R)에 머무른 채 크기 0 에서 1 로 떠오르고,
// 거기서부터 판정선까지 흘러나간다. 크기 0 이 되는 지점이 거리 -1.275 이므로
// 보이는 구간의 41% 가 "떠오르는" 시간, 59% 가 "흐르는" 시간이다.
var MJ_R = 4.8;
var MJ_SPAWN = 1.225;
// MajdataPlay 의 NoteAppearRate 기본값. scale = distance*rate + (1 - rate*1.225) 이므로
// 크기 0 이 되는 거리(= 노트가 처음 나타나는 지점)가 여기서 정해진다.
var NOTE_APPEAR_RATE = 0.265;
var MJ_APPEAR = -(1 - NOTE_APPEAR_RATE * MJ_SPAWN) / NOTE_APPEAR_RATE;   // -2.549
var MJ_TOTAL = MJ_R - MJ_APPEAR;                                          // 7.349
var SPAWN_R = MJ_SPAWN / MJ_R;                                            // 0.2552
var SLIDE_FADE_MS = 200;                  // 알파 0 → 0.55 에 걸리는 시간
var SLIDE_FULL_MS = 50;                   // 별 착지 직전 알파 1 이 되는 구간

/**
 * 화면의 속도 설정(TapSpeed, 기본 6.5)은 내부 속도와 다르다.
 * MajdataPlay 가 쓰는 변환식을 그대로 옮긴다.
 *   NoteSpeed = 107.25 / (71.4184491 * (TapSpeed + 0.9975)^-0.985558604)
 * 7.5 에서 내부 속도 약 12.37 → 접근 시간 7.349/12.37 ≈ 594ms.
 */
function internalSpeed(){
  return 107.25 / (71.4184491 * Math.pow(speedIdx + 0.9975, -0.985558604));
}
function approachMs(){ return MJ_TOTAL * 1000 / internalSpeed(); }
function slideFadeMs(){ return 3926.913 / internalSpeed(); }
// 터치는 변환 없이 설정값을 그대로 쓴다 (TouchSpeed).
function touchWholeMs(){ return 3209.385682 * Math.pow(speedIdx, -0.9549621752); }

/** 링 노트(탭·홀드·별)의 현재 반지름 비율과 크기. null 이면 아직/이미 안 보인다. */
function fall(lead, ap){
  if (lead > ap || lead < 0) return null;
  var du = MJ_APPEAR + MJ_TOTAL * (1 - lead / ap);
  if (du < MJ_SPAWN) return { rf: SPAWN_R, grow: du * NOTE_APPEAR_RATE + (1 - NOTE_APPEAR_RATE * MJ_SPAWN) };
  return { rf: du / MJ_R, grow: 1 };
}

/**
 * TOUCH 의 등장 (TouchDrop.Update).
 * 조각은 처음엔 바깥에 펼쳐진 채 서서히 나타나다가, 판정이 가까워지면
 * 지수적으로 센서 위로 빨려든다.
 */
function touchFall(lead){
  var whole = touchWholeMs();
  if (lead > whole || lead < 0) return null;
  var move = whole * 0.8, disp = whole * 0.2;
  var alpha = lead > move ? Math.max(0, Math.min(1, (whole - lead) / disp)) : 1;
  var off = -Math.exp(-3.2 * lead / move - 0.85) + 0.42;
  off = Math.max(0, Math.min(0.4, off));
  return { alpha: alpha, off: (0.226 + off) / MJ_R, moving: lead <= move };
}

// ── 노트 그리기 ────────────────────────────────────────────────────────────
var NOTE_R = R * 0.107;                // mai-notes 실측: 노트 반지름 / 판정 링 반지름
var STAR_R = NOTE_R * 1.35;            // 별은 뾰족해서 같은 반지름이면 작아 보인다
// 흰 테두리 두께. mai-notes 실측(테두리/노트반지름 ≈ 0.135)에 맞춘 값이고,
// 탭·홀드·별이 모두 같은 절대 두께를 쓴다.
var EDGE_W = NOTE_R * 0.135;
// 가운데 점. 탭과 홀드가 같은 크기여야 한다.
var DOT_R = R * 0.0173;
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

function rgba(hex, a){
  var v = parseInt(hex.slice(1), 16);
  return 'rgba(' + ((v >> 16) & 255) + ',' + ((v >> 8) & 255) + ',' + (v & 255) + ',' + a + ')';
}
/** 미러를 반영해 호를 그린다. 세로축 대칭이므로 각도는 π 에서 뺀다. */
function strokeArc(r, a0, a1){
  ctx.beginPath();
  if (mirror) ctx.arc(CX, CY, r, Math.PI - a1, Math.PI - a0);
  else ctx.arc(CX, CY, r, a0, a1);
  ctx.stroke();
}
/**
 * 노트와 함께 바깥으로 커지는 레인 안내 호 (MajdataView 의 tapLine).
 * 노트마다 하나씩 붙어 있고, 노트 크기가 0.3 을 넘을 때부터 보인다.
 */
// 가이드 호는 레인 한 칸이 아니라 반원 정도를 덮고, 양끝으로 갈수록 사라진다
// (Normal/Each/Break.png 스프라이트 모양).
var LANE_SPAN = Math.PI;
function laneArc(pos, rf, color, alpha){
  var steps = 10, half = LANE_SPAN / 2, c = ang(pos), r = R * rf;
  ctx.save();
  ctx.lineWidth = Math.max(1.5, R * 0.009);
  ctx.strokeStyle = color;
  for (var i = 0; i < steps; i++){
    var f0 = i / steps, f1 = (i + 1) / steps;
    ctx.globalAlpha = alpha * Math.pow(1 - f1, 1.6);
    strokeArc(r, c + half * f0, c + half * f1);
    strokeArc(r, c - half * f1, c - half * f0);
  }
  ctx.restore();
}
/**
 * EACH 노트를 잇는 호 (EachLine1~4 스프라이트).
 * 간격 1~3 칸은 그만큼의 호이고, 정반대(4칸)는 어느 쪽으로 이어도 되므로
 * 스프라이트가 통째로 원이다.
 */
function eachArc(p1, p2, rf, alpha){
  var d = ((p2 - p1) % 8 + 8) % 8;
  if (d === 0) return;
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.strokeStyle = C_EACH; ctx.lineWidth = Math.max(2.5, R * 0.012);
  if (d === 4){
    ctx.beginPath(); ctx.arc(CX, CY, R * rf, 0, TAU); ctx.stroke();
  } else {
    var from = d < 4 ? p1 : p2;
    strokeArc(R * rf, ang(from), ang(from) + Math.min(d, 8 - d) * Math.PI / 4);
  }
  ctx.restore();
}
/** TAP: 흰 테두리 + 두꺼운 색 링 + 어두운 구멍 + 가운데 점. */
function noteDonut(x, y, size, color){
  ctx.beginPath(); ctx.arc(x, y, size, 0, TAU);
  ctx.fillStyle = color; ctx.fill();
  ctx.lineWidth = EDGE_W * (size / NOTE_R); ctx.strokeStyle = '#fff'; ctx.stroke();
  // 색 띠 두께는 홀드 육각형과 같은 값(BAND_W)을 쓴다
  ctx.beginPath(); ctx.arc(x, y, Math.max(size * 0.2, size - BAND_W * (size / NOTE_R)), 0, TAU);
  ctx.fillStyle = FIELD_BG; ctx.fill();
  ctx.lineWidth = EDGE_W * 0.7 * (size / NOTE_R); ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, DOT_R * (size / NOTE_R), 0, TAU);
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
 * HOLD 는 머리와 꼬리에 각각 캡이 있고, 둘을 이은 육각형이 몸통이 된다
 * (mai-notes 의 방식). 캡은 각자의 등장 진행률만큼 커지므로, 머리가 아직
 * 제자리에 있는 동안에는 길이가 늘지 않고 크기만 커진다.
 */
var HOLD_CAP = R / 12.5 * 1.5;   // 캡 반지름 ≈ 0.12R
var HOLD_INNER = 0.62;           // 속을 비우는 비율
// 색 띠(분홍 도넛 / 육각 링)의 두께. 탭과 홀드가 같은 값을 쓴다.
var BAND_W = HOLD_CAP * (1 - HOLD_INNER);

function holdHexPath(a, head, tail, capH, capT, k){
  var m = a + Math.PI / 3, b = a - Math.PI / 3, o = a + Math.PI;
  function at(p, ang2, r){ return mir({ x: p.x + Math.cos(ang2) * r, y: p.y + Math.sin(ang2) * r }); }
  var pts = [
    at(head, a, capH * k), at(head, b, capH * k),
    at(tail, o + Math.PI / 3, capT * k), at(tail, o, capT * k),
    at(tail, o - Math.PI / 3, capT * k), at(head, m, capH * k),
  ];
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (var i = 1; i < 6; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}
function holdBody(pos, headRf, tailRf, capH, capT, color){
  var a = ang(pos);
  var head = polRaw(a, R * headRf), tail = polRaw(a, R * tailRf);
  var k = capH / HOLD_CAP;
  holdHexPath(a, head, tail, capH, capT, 1);
  ctx.fillStyle = color; ctx.fill();
  ctx.lineWidth = EDGE_W * k; ctx.strokeStyle = '#fff'; ctx.stroke();
  holdHexPath(a, head, tail, capH, capT, HOLD_INNER);
  ctx.fillStyle = FIELD_BG; ctx.fill();
  ctx.lineWidth = EDGE_W * 0.7 * k; ctx.strokeStyle = '#fff'; ctx.stroke();
  // 탭처럼 양 끝 한가운데에 점이 하나씩 있다
  var dot = DOT_R * k;
  var hp2 = mir(head), tp2 = mir(tail);
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(hp2.x, hp2.y, dot, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(tp2.x, tp2.y, dot, 0, TAU); ctx.fill();
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
/** '*' 분기 슬라이드의 별은 두 개가 겹친 모양이다 (star_double). */
function starNote(x, y, size, color, spin, dbl){
  var rot = spin || 0;
  if (dbl){
    starPath(x, y, size, size * 0.46, rot + Math.PI / 5);
    ctx.fillStyle = '#fff'; ctx.fill();
    starPath(x, y, size * 0.84, size * 0.39, rot + Math.PI / 5);
    ctx.fillStyle = color; ctx.fill();
  }
  starPath(x, y, size, size * 0.46, rot);
  ctx.fillStyle = '#fff'; ctx.fill();
  starPath(x, y, size * 0.84, size * 0.39, rot);
  ctx.fillStyle = color; ctx.fill();
  starPath(x, y, size * 0.46, size * 0.21, rot);
  ctx.strokeStyle = 'rgba(255,255,255,.9)';
  ctx.lineWidth = EDGE_W * 0.7 * (size / STAR_R); ctx.stroke();
}

/**
 * TOUCH 의 구성은 MajdataView 의 Touch 프리팹을 따랐다.
 *   TouchPart_1~4 (속 빈 삼각 4장) + Touch_Point (가운데 점) + TouchBorder (모서리 브래킷)
 * 조각은 상/하/좌/우에서 센서를 향해 모여든다.
 */
function touchBracket(x, y, r, color, alpha){
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(2, r * 0.14); ctx.lineCap = 'round';
  for (var i = 0; i < 4; i++){
    var c = -Math.PI / 4 + i * Math.PI / 2;
    ctx.beginPath(); ctx.arc(x, y, r, c - Math.PI * 0.16, c + Math.PI * 0.16); ctx.stroke();
  }
  ctx.lineCap = 'butt'; ctx.restore();
}
/** 삼각 조각 하나. 꼭짓점이 센서(안쪽)를 향한다. hollow 면 가운데가 뚫린 삼각 링. */
function touchPetal(cx, cy, ux, uy, size, color, hollow){
  var px = -uy, py = ux;
  function tri(s){
    ctx.beginPath();
    ctx.moveTo(cx - ux * size * 0.9 * s, cy - uy * size * 0.9 * s);
    ctx.lineTo(cx + ux * size * 0.45 * s + px * size * 0.8 * s, cy + uy * size * 0.45 * s + py * size * 0.8 * s);
    ctx.lineTo(cx + ux * size * 0.45 * s - px * size * 0.8 * s, cy + uy * size * 0.45 * s - py * size * 0.8 * s);
    ctx.closePath();
  }
  tri(1); ctx.fillStyle = '#fff'; ctx.fill();
  tri(0.84); ctx.fillStyle = color; ctx.fill();
  if (hollow){
    tri(0.56); ctx.fillStyle = '#fff'; ctx.fill();
    tri(0.44); ctx.fillStyle = FIELD_BG; ctx.fill();
  }
}
function touchNote(x, y, size, offPx, color){
  touchBracket(x, y, size * 1.25, 'rgba(255,255,255,.35)', 1);
  for (var i = 0; i < 4; i++){
    var a = i * Math.PI / 2;
    var ux = Math.cos(a), uy = Math.sin(a);
    touchPetal(x + ux * offPx, y + uy * offPx, ux, uy, size * 0.78, color, true);
  }
  ctx.beginPath(); ctx.arc(x, y, size * 0.22, 0, TAU);
  ctx.fillStyle = color; ctx.fill();
}

/**
 * TOUCH HOLD 는 실기에서 네 조각이 서로 다른 색이고, 테두리도 4색 마름모다.
 * 남은 시간은 부채꼴 마스크로 테두리를 지워서 표현한다(프리팹의 CircleMask 와 같은 방식).
 */
var TH_COLORS = ['#3b8ff0', '#e8622a', '#f5d90a', '#33a852'];
function touchHoldNote(x, y, size, offPx, left){
  var r = size * 2.05;   // 조각 바깥에 오도록
  // 실기에서 테두리는 조각이 모여드는 구간(move)에 들어와야 나타난다.
  if (left < 0){ touchHoldPetals(x, y, size, offPx); return; }
  ctx.save();
  // 남은 시간만큼만 남기는 부채꼴 마스크
  ctx.beginPath(); ctx.moveTo(x, y);
  ctx.arc(x, y, r * 2, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0, Math.min(1, 1 - left)));
  ctx.closePath(); ctx.clip();
  var pts = [];
  for (var i = 0; i < 4; i++){
    var a = -Math.PI / 2 + i * Math.PI / 2;
    pts.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r });
  }
  ctx.lineWidth = Math.max(4, size * 0.36); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (var j = 0; j < 4; j++){
    var p0 = pts[j], p1 = pts[(j + 1) % 4];
    ctx.strokeStyle = TH_COLORS[j];
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
  }
  ctx.restore();
  touchHoldPetals(x, y, size, offPx);
}
function touchHoldPetals(x, y, size, offPx){
  for (var k = 0; k < 4; k++){
    var a2 = k * Math.PI / 2;
    var ux = Math.cos(a2), uy = Math.sin(a2);
    touchPetal(x + ux * offPx, y + uy * offPx, ux, uy, size * 0.78, TH_COLORS[k], false);
  }
  ctx.beginPath(); ctx.arc(x, y, size * 0.22, 0, TAU);
  ctx.fillStyle = '#7fe3ff'; ctx.fill();
}

/**
 * 슬라이드 궤적. 판정원 둘레 1/64 간격으로 화살촉을 늘어놓고, 별이 지나간
 * 화살촉부터 지운다. 뒤가 오목한 형태라 실기의 화살표 사슬처럼 보인다.
 */
/**
 * 슬라이드 궤적의 화살표. 실기 화면에서 재보면 속이 찬 화살촉이 아니라
 * 두께가 일정한 V자 획이다(판정 링 반지름 R 기준: 폭 0.156R, 획 두께 0.049R,
 * V 깊이 0.067R, 간격 0.098R = 판정원 둘레/64).
 * 앞쪽 모서리에 밝은 띠가 한 줄 들어가고 뒤로 그림자가 진다.
 */
var ARW_W = 0.78, ARW_D = 0.67, ARW_T = 0.49;   // ARROW_GAP 배수
function chevronPath(x, y, ux, uy, w, d){
  var px = -uy, py = ux;
  ctx.beginPath();
  ctx.moveTo(x - ux*d/2 + px*w, y - uy*d/2 + py*w);
  ctx.lineTo(x + ux*d/2,        y + uy*d/2);
  ctx.lineTo(x - ux*d/2 - px*w, y - uy*d/2 - py*w);
}
function slideArrows(pc, passedLen, color, alpha){
  var arrows = pc.arrows;
  if (!arrows || !arrows.length) return;
  var w = ARROW_GAP * ARW_W, d = ARROW_GAP * ARW_D, t = ARROW_GAP * ARW_T;
  var hw = t * 0.24, sh = ARROW_GAP * 0.1;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineJoin = 'miter'; ctx.lineCap = 'butt'; ctx.miterLimit = 4;
  for (var i = 0; i < arrows.length; i++){
    var a = arrows[i];
    // 별이 그 구역에 들어선 순간 묶음 전체가 한 번에 사라진다
    if (pc.groupStarts[a.g] <= passedLen) continue;
    // 뒤로 진 그림자
    chevronPath(a.x + sh * 0.5, a.y + sh * 0.8, a.ux, a.uy, w, d);
    ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = t; ctx.stroke();
    // 몸통
    chevronPath(a.x, a.y, a.ux, a.uy, w, d);
    ctx.strokeStyle = color; ctx.lineWidth = t; ctx.stroke();
    // 진행 방향 쪽 모서리를 따라 밝은 띠
    chevronPath(a.x + a.ux * (t - hw) / 2, a.y + a.uy * (t - hw) / 2, a.ux, a.uy, w, d);
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = hw; ctx.stroke();
  }
  ctx.restore();
}

/**
 * 扇形(w) 전용. 겹겹이 놓인 꺾인 막대이고, 모서리는 화살표와 같이 각지게 둔다.
 * 사라지는 것도 화살표와 같은 구역 단위다.
 */
function wifiBars(pc, progress, color, alpha){
  if (!pc.bars) return;
  var w = ARROW_GAP * ARW_T * 1.15, hw = w * 0.24, sh = ARROW_GAP * 0.1;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'butt'; ctx.lineJoin = 'miter'; ctx.miterLimit = 4;
  function bar(q, ox, oy, lw, col){
    ctx.beginPath();
    ctx.moveTo(q[0].x + ox, q[0].y + oy);
    ctx.lineTo(q[1].x + ox, q[1].y + oy);
    ctx.lineTo(q[2].x + ox, q[2].y + oy);
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke();
  }
  for (var i = 0; i < pc.bars.length; i++){
    var b = pc.bars[i];
    if (b.gStart <= progress) continue;
    bar(b.pts, sh * 0.5, sh * 0.8, w, 'rgba(0,0,0,.5)');
    bar(b.pts, 0, 0, w, color);
    // 부채꼴은 바깥으로 퍼지므로 바깥쪽 모서리에 밝은 띠를 둔다
    var c = b.pts[1];
    var ox = c.x - CX, oy = c.y - CY, L = Math.sqrt(ox*ox + oy*oy) || 1;
    bar(b.pts, ox / L * (w - hw) / 2, oy / L * (w - hw) / 2, hw, 'rgba(255,255,255,.85)');
  }
  ctx.restore();
}

// ── 필드 ───────────────────────────────────────────────────────────────────
/** 꼭짓점이 둥근 다각형. pts 는 [x,y] 배열, r 은 모깎기 반지름. */
function roundPoly(pts, r){
  var n = pts.length;
  ctx.beginPath();
  for (var i = 0; i < n; i++){
    var p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    var v1x = p0[0] - p1[0], v1y = p0[1] - p1[1];
    var v2x = p2[0] - p1[0], v2y = p2[1] - p1[1];
    var l1 = Math.sqrt(v1x*v1x + v1y*v1y) || 1, l2 = Math.sqrt(v2x*v2x + v2y*v2y) || 1;
    var c = Math.min(r, l1 / 2, l2 / 2);
    var a = [p1[0] + v1x / l1 * c, p1[1] + v1y / l1 * c];
    var b = [p1[0] + v2x / l2 * c, p1[1] + v2y / l2 * c];
    if (i === 0) ctx.moveTo(a[0], a[1]); else ctx.lineTo(a[0], a[1]);
    ctx.quadraticCurveTo(p1[0], p1[1], b[0], b[1]);
  }
  ctx.closePath();
}
/** 중심 (cx,cy), 회전 rot, 꼭짓점 수 k, 외접반지름 rad 인 정다각형 패드. */
function polyPad(cx, cy, rot, k, rad, round){
  var pts = [];
  for (var i = 0; i < k; i++){
    var a = rot + i * Math.PI * 2 / k;
    pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
  }
  roundPoly(pts, round);
}

/**
 * 배경을 maimai 의 센서 배치로 그린다 (실기에서 판정 라인 디자인을 "센서"로
 * 뒀을 때의 그림). 수치는 실제 센서 그림을 연결 성분으로 재서 맞췄다.
 *   둥근 패드 8개  버튼 각도,      중심 0.442R, 폭 0.305R
 *   사각 패드 8개  22.5도 어긋난 각도, 중심 0.621R, 한 변 0.211R (각도+45도 회전)
 *   점선 방사선 16개  0.76R ~ 0.95R
 */
function drawSensors(){
  var PAD_R = R * 0.442, PAD_A = R * 0.150;
  var SQ_R = R * 0.621, SQ_A = R * 0.142;   // 정사각형 외접반지름 = 한 변/√2
  ctx.strokeStyle = 'rgba(255,255,255,.16)';
  ctx.lineWidth = Math.max(1.5, R * 0.006);
  for (var i = 1; i <= 8; i++){
    var ba = ang(i), da = ang(i) - Math.PI / 8;
    var p = mir(polRaw(ba, PAD_R));
    polyPad(p.x, p.y, ba + Math.PI / 6, 6, PAD_A, R * 0.035); ctx.stroke();
    var q = mir(polRaw(da, SQ_R));
    polyPad(q.x, q.y, da, 4, SQ_A, R * 0.022); ctx.stroke();
  }
  // 바깥으로 뻗는 점선 (A 구역 경계)
  ctx.save();
  ctx.setLineDash([R * 0.018, R * 0.022]);
  ctx.strokeStyle = 'rgba(255,255,255,.13)';
  ctx.lineWidth = Math.max(1, R * 0.005);
  for (var j = 1; j <= 8; j++){
    var angles = [ang(j), ang(j) - Math.PI / 8];
    for (var k = 0; k < 2; k++){
      var a0 = mir(polRaw(angles[k], R * 0.76)), a1 = mir(polRaw(angles[k], R * 0.95));
      ctx.beginPath(); ctx.moveTo(a0.x, a0.y); ctx.lineTo(a1.x, a1.y); ctx.stroke();
    }
  }
  ctx.restore();
}

function drawField(){
  ctx.clearRect(0, 0, 920, 920);
  ctx.beginPath(); ctx.arc(CX, CY, R + 30, 0, TAU);
  ctx.fillStyle = FIELD_BG; ctx.fill();
  drawSensors();
  // 판정 링과 버튼. 타이밍을 읽는 기준이라 센서 위에 남겨 둔다.
  ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = Math.max(1.5, R * 0.012);
  ctx.beginPath(); ctx.arc(CX, CY, R, 0, TAU); ctx.stroke();
  for (var j = 1; j <= 8; j++){
    var p = btn(j);
    ctx.beginPath(); ctx.arc(p.x, p.y, R * 0.026, 0, TAU);
    ctx.fillStyle = '#fff'; ctx.fill();
  }
}

// ── 상태 ───────────────────────────────────────────────────────────────────
var END = CHART.durationMs + 1500;
// 0박부터 시작하는 보면은 첫 탭이 곧장 판정선에 있어 보기 어렵다. 첫 노트가
// 1마디 안에 있으면 그만큼 앞에서(음수 t) 시작해 최소 1마디의 여유를 준다.
// GIF 는 매 프레임 t 를 직접 지정하므로 이 초기값에 영향받지 않는다. 오디오를
// 붙여 재생하면 t 가 오디오에 끌려가 리드인은 자연히 생략된다(원하는 동작).
var FIRST_MS = NOTES.length ? NOTES[0].timeMs : 0;
var MEASURE_MS = 4 * 60000 / (CHART.bpm || 120);
var LEADIN = Math.max(0, MEASURE_MS - FIRST_MS);
// 타임라인 시작점. 리드인이 있으면 음수다. seek/진행바/화살표 모두 이 값을
// 왼쪽 끝으로 삼아, 맨 앞으로 돌려도 리드인이 유지된다.
var T0 = -LEADIN;
var t = T0, playing = false, last = 0;
var rate = 1, speedIdx = 6.5, sound = true, guide = true, interfere = true;
// 슬라이드 간섭: 다른 별이 지나간 슬라이드의 궤적도 지운다. 한 번 지워지면
// 유지되도록(별이 지나갔다가 멀어져도 되살아나지 않게) 슬라이드별 최대 지움
// 길이를 저장한다. 되감기/seek 때 비운다. 순서 보장을 위해 항상 앞에서부터(prefix) 지운다.
var slideErased = {};
var INTERF_R = STAR_R * 1.2;   // 별이 이 반경 안으로 다른 궤적을 지나면 그 지점까지 지운다
// rAF 의 now 는 "지금 합성 중인 프레임" 시각이고 그 내용은 다음 vsync 에 나온다.
// 그래서 t 기준으로 그리면 화면에는 늘 한 프레임 늦게 보인다. 실측한 프레임
// 간격만큼 미리 그려 그 지연을 없앤다. userOffset 은 사용자가 더 미세 조정하는 값.
var frameMs = 16.7, userOffset = 0;

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

// 프레임마다 전 노트를 여러 번 훑으면 물량 채보에서 그대로 프레임이 떨어진다.
// 노트가 시각순이므로 지금 보일 수 있는 구간만 이진 탐색으로 잘라 쓴다.
var TIMES = NOTES.map(function(n){ return n.timeMs; });
var MAX_SPAN = (function(){
  var m = 0;
  for (var i = 0; i < NOTES.length; i++){
    var n = NOTES[i], e = n.durationMs || 0;
    for (var k = 0; n.slides && k < n.slides.length; k++){
      var b = n.slides[k];
      if (b.delayMs + b.durationMs > e) e = b.delayMs + b.durationMs;
    }
    if (e > m) m = e;
  }
  return m;
})();
function firstAtOrAfter(v){
  var lo = 0, hi = TIMES.length;
  while (lo < hi){ var mid = (lo + hi) >> 1; if (TIMES[mid] < v) lo = mid + 1; else hi = mid; }
  return lo;
}

var soundIdx = 0;
var actx = null, audioEl = null, audioReady = false, audioWarm = false;
// 오디오 컨텍스트를 준비한다. 처음엔 거의 안 들리는 톤을 한 번 흘려 출력
// 파이프라인을 깨워, 첫 가이드음이 느리게 나오는 콜드 스타트를 없앤다.
// 반드시 재생 버튼 같은 사용자 제스처에서 먼저 부른다.
function ensureAudio(){
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === 'suspended') actx.resume();
  if (!audioWarm){
    var wg = actx.createGain(); wg.gain.value = 0.0001;
    var wo = actx.createOscillator(); wo.connect(wg); wg.connect(actx.destination);
    wo.start(); wo.stop(actx.currentTime + 0.03);
    audioWarm = true;
  }
  return actx;
}
function click(kind){
  if (!sound) return;
  ensureAudio();
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
    var raw = now - last;
    if (raw > 4 && raw < 40) frameMs = frameMs * 0.9 + raw * 0.1;
    var dt = Math.min(120, raw) * rate;
    last = now;
    var prev = t;
    if (audioReady && !audioEl.paused) t = audioEl.currentTime * 1000;
    else t += dt;
    // 지나간 노트를 가리키는 포인터만 앞으로 민다 (매 프레임 전체를 훑지 않는다)
    if (t < prev){ soundIdx = firstAtOrAfter(t); slideErased = {}; }
    while (soundIdx < NOTES.length && NOTES[soundIdx].timeMs <= t){
      var sn = NOTES[soundIdx];
      if (sn.timeMs > prev) click(sn.isBreak ? 'break' : sn.type === 'slide' ? 'slide' : 'tap');
      soundIdx++;
    }
    if (t >= END) { t = END; pause(); }
  }
  draw();
  requestAnimationFrame(frame);
}

function draw(){
  // 표시 지연 보정: 화면에 나오는 시점 기준으로 그린다.
  var logical = t;
  t += frameMs + userOffset;
  drawNotes();
  t = logical;
  paintBar();
}
function drawNotes(){
  drawField();
  var ap = approachMs();
  var spin = t / 260;
  var i, n, st, k;
  // 지금 화면에 나올 수 있는 노트 구간 [lo, hi).
  // 나중에 오는 노트가 아래에 깔리도록 뒤에서부터 그린다.
  var lo = firstAtOrAfter(t - MAX_SPAN - FLASH_MS - 50);
  var hi = firstAtOrAfter(t + ap + 1);

  // 1) 레인 안내 호 — 노트마다 하나씩 붙어서 함께 커진다 (MajdataView 의 tapLine)
  for (i = hi - 1; i >= lo; i--){
    n = NOTES[i];
    if (n.type === 'touch' || n.type === 'touchHold') continue;
    st = fall(n.timeMs - t, ap);
    if (st){
      if (st.grow > 0.3) laneArc(n.pos, st.rf, colorOf(n), 0.8);
    } else if (n.type === 'hold' && t <= n.timeMs + (n.durationMs || 0)){
      // 홀드는 누르고 있는 동안 레인 호가 판정선에 남는다
      laneArc(n.pos, 1, colorOf(n), 0.8);
    }
  }

  // 2) EACH 연결 호 — 두 노트 사이를 원을 따라 잇고 함께 커진다
  for (i = 0; i < EACH_LINKS.length; i++){
    var grp = EACH_LINKS[i];
    st = fall(grp[0].timeMs - t, ap);
    if (!st || st.grow <= 0.3) continue;
    for (var e = 0; e < grp.length - 1; e++) eachArc(grp[e].pos, grp[e + 1].pos, st.rf, 0.85);
  }

  // 간섭용: 지금 이동 중인 모든 슬라이드 별의 현재 위치를 미리 모은다.
  var interfStars = [];
  if (interfere && guide){
    for (var xi = lo; xi < hi; xi++){
      var xn = NOTES[xi];
      if (xn.type !== 'slide') continue;
      for (var xk = 0; xk < xn.slides.length; xk++){
        var xb = xn.slides[xk];
        var xm0 = xn.timeMs + xb.delayMs, xm1 = xm0 + xb.durationMs;
        if (t < xm0 || t > xm1) continue;
        var xpc = cachedPath(xn, xk);
        var xsp = slidePos(xpc, xb, t - xm0);
        interfStars.push({ x: xsp.x, y: xsp.y, ni: xi });
        if (xpc.isWifi){
          var xpf = clamp01((t - xm0) / (xb.durationMs || 1));
          for (var xf = 0; xf < xpc.fans.length; xf++){
            var xfp = xpc.fans[xf], xft = xfp.len[xfp.len.length - 1];
            var xq = atLen(xfp.pts, xfp.len, xft * xpf);
            interfStars.push({ x: xq.x, y: xq.y, ni: xi });
          }
        }
      }
    }
  }

  // 3) 슬라이드 궤적 — 별이 닿기 한참 전부터 옅게 떠오르고, 착지 직전 또렷해진다
  for (i = hi - 1; i >= lo; i--){
    n = NOTES[i];
    if (n.type !== 'slide') continue;
    var fadeStart = n.timeMs - slideFadeMs();
    if (t < fadeStart || !guide) continue;
    for (k = 0; k < n.slides.length; k++){
      var b = n.slides[k];
      var s0 = n.timeMs + b.delayMs, s1 = s0 + b.durationMs;
      if (t > s1 + 80) continue;
      var pc = cachedPath(n, k);
      var passed = 0, alpha;
      if (t >= s0){ passed = slideProgressLen(pc, b, t - s0); alpha = 1; }
      else if (t >= n.timeMs - SLIDE_FULL_MS) alpha = 1;
      else alpha = 0.55 * Math.min(1, (t - fadeStart) / SLIDE_FADE_MS);
      var acol = b.isBreak ? C_ARROW_BREAK : n.slideEach ? C_EACH : C_ARROW;
      var total = pc.len[pc.len.length - 1] || 1;
      // 다른 별이 이 궤적 위를 지나면 그 지점까지(0~교차점) 함께 지운다. 앞에서부터
      // 지우므로(prefix) "앞 구역이 안 지워지면 뒤도 안 지워짐" 이 저절로 지켜지고,
      // 화살표 하나를 건너뛰어도 그 사이가 메워진다(한 칸 보정). 한 번 지워지면
      // 되살아나지 않도록 슬라이드별 최대 지움 길이를 끈끈하게 유지한다.
      var erased = passed;
      if (interfere){
        var ekey = n.__idx + ':' + k;
        var eLen = slideErased[ekey] || 0;
        // 노트 시각이 지나 "라이브"가 된 슬라이드만 간섭으로 지운다. 아직 흐릿하게
        // 떠오르는 먼 미래 가이드까지 지우면 이질적이라, 그 전에는 건드리지 않는다.
        if (t >= n.timeMs && interfStars.length){
          for (var ei = 0; ei < interfStars.length; ei++){
            if (interfStars[ei].ni === i) continue;    // 자기 별은 passed 로 이미 처리
            var np = nearestOnPath(pc, interfStars[ei].x, interfStars[ei].y);
            if (np.dist2 <= INTERF_R * INTERF_R && np.len > eLen) eLen = np.len;
          }
          slideErased[ekey] = eLen;
        }
        // sticky: 활성 별이 없는 프레임에도 유지해 되살아나지(깜빡이지) 않게 한다.
        // 이 한 줄이 interfStars 유무와 무관하게 항상 적용되는 게 깜빡임 방지의 핵심.
        if (eLen > erased) erased = eLen;
      }
      if (pc.isWifi) wifiBars(pc, erased / total, acol, alpha);
      else slideArrows(pc, erased, acol, alpha);
    }
  }

  // 4) TOUCH / TOUCH HOLD
  for (i = hi - 1; i >= lo; i--){
    n = NOTES[i];
    if (n.type !== 'touch' && n.type !== 'touchHold') continue;
    var tail = n.type === 'touchHold' ? (n.durationMs || 0) : 0;
    var lead = n.timeMs - t, over = t - (n.timeMs + tail);
    if (over > FLASH_MS) continue;
    var tp = touchPt(n.area, n.pos), tsz = NOTE_R * 0.9, tcol = colorOf(n);
    if (lead > 0){
      var tf = touchFall(lead);
      if (!tf) continue;
      ctx.save(); ctx.globalAlpha = tf.alpha;
      if (tail > 0) touchHoldNote(tp.x, tp.y, tsz, R * tf.off, tf.moving ? 1 : -1);
      else touchNote(tp.x, tp.y, tsz, R * tf.off, tcol);
      ctx.restore();
    } else if (tail > 0 && over < 0){
      touchHoldNote(tp.x, tp.y, tsz, R * touchFall(0).off, -over / tail);
    } else {
      ctx.save();
      hitFlash(tp.x, tp.y, tsz * 1.2, tcol, Math.max(0, over) / FLASH_MS);
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
      ctx.restore();
    }
  }

  // 5) HOLD — 머리·꼬리가 각자 커지고, 둘 사이가 몸통이 된다
  for (i = hi - 1; i >= lo; i--){
    n = NOTES[i];
    if (n.type !== 'hold') continue;
    var hold = n.durationMs || 0;
    var hLead = n.timeMs - t, tLead = n.timeMs + hold - t;
    if (hLead > ap || -tLead > FLASH_MS) continue;
    var hcol = colorOf(n);
    if (tLead >= 0){
      var hs = fall(hLead, ap), ts = fall(tLead, ap);
      var headRf = hs ? hs.rf : 1;
      var tailRf = ts ? ts.rf : (tLead > ap ? SPAWN_R : 1);
      if (tailRf > headRf) tailRf = headRf;
      // 몸통 폭은 머리 쪽 성장률을 따른다. 떠오르는 동안에는 머리와 꼬리가 같은
      // 자리라 작은 육각형이 커지기만 하고, 다 커진 뒤부터 길이가 늘어난다.
      var sc = hs ? Math.max(0, Math.min(1, hs.grow)) : 1;
      if (sc > 0.02){
        var cap = HOLD_CAP * sc;
        var hp = mir(polRaw(ang(n.pos), R * headRf));
        if (n.isEx) exGlow(hp.x, hp.y, cap);
        holdBody(n.pos, headRf, tailRf, cap, cap, hcol);
        if (n.isBreak) breakSpark(hp.x, hp.y, cap, spin);
      }
    }
    if (hLead <= 0 && -hLead <= FLASH_MS){
      var bp2 = btn(n.pos); hitFlash(bp2.x, bp2.y, NOTE_R * 1.1, hcol, -hLead / FLASH_MS);
    }
    if (tLead <= 0 && -tLead <= FLASH_MS){
      var bp3 = btn(n.pos); hitFlash(bp3.x, bp3.y, NOTE_R * 1.1, hcol, -tLead / FLASH_MS);
    }
  }

  // 6) TAP
  for (i = hi - 1; i >= lo; i--){
    n = NOTES[i];
    if (n.type !== 'tap') continue;
    var col = colorOf(n);
    st = fall(n.timeMs - t, ap);
    if (st){
      var p3 = rayPt(n.pos, R * st.rf), sz = NOTE_R * st.grow;
      if (n.isEx) exGlow(p3.x, p3.y, sz);
      if (n.starTap) starNote(p3.x, p3.y, STAR_R * st.grow, col, n.starTap === 2 ? spin * 2 : 0);
      else noteDonut(p3.x, p3.y, sz, col);
      if (n.isBreak) breakSpark(p3.x, p3.y, sz, spin);
    } else if (t >= n.timeMs && t - n.timeMs <= FLASH_MS){
      var bp = btn(n.pos);
      hitFlash(bp.x, bp.y, NOTE_R * 1.1, col, (t - n.timeMs) / FLASH_MS);
    }
  }

  // 7) 슬라이드 별
  for (i = hi - 1; i >= lo; i--){
    n = NOTES[i];
    if (n.type !== 'slide') continue;
    var scol = colorOf(n);
    for (k = 0; k < n.slides.length; k++){
      var b2 = n.slides[k];
      var m0 = n.timeMs + b2.delayMs, m1 = m0 + b2.durationMs;
      if (t < m0 || t > m1) continue;
      var pc2 = cachedPath(n, k);
      var scol2 = b2.isBreak ? C_BREAK : scol;
      var mp = slidePos(pc2, b2, t - m0);
      var ahead = slidePos(pc2, b2, Math.min(b2.durationMs, t - m0 + 30));
      starNote(mp.x, mp.y, STAR_R, scol2,
        Math.atan2(ahead.y - mp.y, ahead.x - mp.x) + Math.PI / 2);
      // 扇形(w)은 별이 세 갈래로 동시에 흐른다 (WifiDrop 의 star_slide[0..2])
      var pf = Math.max(0, Math.min(1, (t - m0) / (b2.durationMs || 1)));
      for (var fi = 0; fi < pc2.fans.length; fi++){
        var fp = pc2.fans[fi], ftot = fp.len[fp.len.length - 1];
        var q0 = atLen(fp.pts, fp.len, ftot * pf);
        var q1 = atLen(fp.pts, fp.len, Math.min(ftot, ftot * pf + 12));
        starNote(q0.x, q0.y, STAR_R, scol2,
          Math.atan2(q1.y - q0.y, q1.x - q0.x) + Math.PI / 2);
      }
    }
    if (n.starless) continue;
    var delay = n.slides[0].delayMs;
    if (t < n.timeMs){
      st = fall(n.timeMs - t, ap);
      if (st){
        var sp = rayPt(n.pos, R * st.rf), ssz = NOTE_R * st.grow;
        if (n.isEx) exGlow(sp.x, sp.y, ssz);
        if (n.plainStar) noteDonut(sp.x, sp.y, ssz, scol);
        else starNote(sp.x, sp.y, STAR_R * st.grow, scol, spin, n.starDouble);
        if (n.isBreak) breakSpark(sp.x, sp.y, ssz, spin);
      }
    } else if (t <= n.timeMs + delay){
      // 착지 후 출발까지: 별이 제자리에서 0.5 → 1.5 배로 부풀며 기다린다
      var f3 = delay > 0 ? (t - n.timeMs) / delay : 1;
      var bp4 = btn(n.pos), bsz = NOTE_R * (0.5 + f3);
      if (n.plainStar) noteDonut(bp4.x, bp4.y, NOTE_R, scol);
      else starNote(bp4.x, bp4.y, STAR_R * (0.5 + f3) / 1.5, scol, spin, n.starDouble);
    }
    if (t >= n.timeMs && t - n.timeMs <= FLASH_MS){
      var sbp = btn(n.pos);
      hitFlash(sbp.x, sbp.y, NOTE_R * 1.2, scol, (t - n.timeMs) / FLASH_MS);
    }
  }
}

// ── 컨트롤 ─────────────────────────────────────────────────────────────────
var ppEl = document.getElementById('pp'), fillEl = document.getElementById('fill'), curEl = document.getElementById('cur');
function fmt(ms){
  var s = Math.max(0, Math.floor(ms/1000));
  return Math.floor(s/60) + ':' + String(s%60).padStart(2,'0');
}
function paintBar(){
  fillEl.style.width = (Math.max(0, Math.min(1, (t - T0) / (END - T0))) * 100) + '%';
  curEl.textContent = fmt(t);
}
function play(){
  playing = true; last = performance.now(); ppEl.textContent = '❚❚';
  // 사용자 제스처 시점에 오디오를 미리 깨운다(첫 가이드음 지연 방지).
  if (sound) ensureAudio();
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
  var frac = (clientX - r.left) / r.width;
  t = Math.max(T0, Math.min(END, T0 + frac * (END - T0)));
  soundIdx = firstAtOrAfter(t);
  slideErased = {};
  if (audioReady) audioEl.currentTime = Math.max(0, t/1000);
}
sk.onpointerdown = function(e){ seekTo(e.clientX); sk.setPointerCapture(e.pointerId); sk.onpointermove = function(m){ seekTo(m.clientX); }; };
sk.onpointerup = function(e){ sk.onpointermove = null; sk.releasePointerCapture(e.pointerId); };

var spd = document.getElementById('spd'), spdv = document.getElementById('spdv');
spd.oninput = function(){ speedIdx = parseFloat(spd.value); spdv.textContent = speedIdx.toFixed(2); };
var offEl = document.getElementById('off'), offv = document.getElementById('offv');
offEl.oninput = function(){
  userOffset = parseFloat(offEl.value);
  offv.textContent = (userOffset > 0 ? '+' : '') + userOffset + 'ms';
};
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
toggle(document.getElementById('tInterf'), function(){ return interfere; }, function(v){ interfere = v; slideErased = {}; });
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
  else if (e.code === 'ArrowRight'){ t = Math.min(END, t + measureMs); if (audioReady) audioEl.currentTime = Math.max(0, t/1000); }
  else if (e.code === 'ArrowLeft'){ t = Math.max(T0, t - measureMs); slideErased = {}; if (audioReady) audioEl.currentTime = Math.max(0, t/1000); }
});

requestAnimationFrame(frame);
`;
