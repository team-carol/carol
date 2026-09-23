// simai 채보 플레이어 페이지.
//
// 파싱은 서버(src/simai/parse.ts)에서 끝내고, 여기서는 타임라인 JSON 을 받아
// canvas 로 그리기만 한다. 채보 출처가 유저 업로드에서 DB 등록으로 바뀌어도
// 이 파일은 손대지 않는다.
//
// 음원은 서버에 두지 않는다. 유저가 자기 파일을 고르면 브라우저 안에서만
// (object URL) 재생하고, 업로드하지 않는다.

import type { Chart } from "../simai/types";
import { RENDERER_JS } from "./chartRenderer";
import { gifWorkerSource, GIF_CLIENT_JS, GIF_RANGE_JS } from "./chartGifClient";
import { BASE_CSS, pageHead, topbar, siteFooter, LANDING_URL } from "./theme";

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
  const diffColor = DIFF_COLOR[data.difficulty] ?? "var(--surface-2)";
  const s = data.chart.stats;
  const secs = Math.round(data.chart.durationMs / 1000);
  const dur = Math.floor(secs / 60) + ":" + String(secs % 60).padStart(2, "0");

  return `<!DOCTYPE html><html lang="ko"><head>${pageHead(esc(data.title || "채보") + " · 캐롤봇")}
<style>
${BASE_CSS}
.page{max-width:600px;padding-top:clamp(28px,5vw,48px)}
.mono{font-family:var(--font-mono)}
.head{margin-bottom:22px}
.badge{display:inline-block;font-family:var(--font-mono);font-size:11.5px;font-weight:500;letter-spacing:.4px;padding:4px 10px;border-radius:8px;background:${diffColor};color:#fff;margin-bottom:12px}
h1{font-size:clamp(26px,4vw,34px);font-weight:500;color:var(--ink);letter-spacing:-.01em;line-height:1.25;word-break:break-word}
.sub{font-size:15px;color:var(--muted);margin-top:6px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:22px;margin-bottom:14px}
.stage{padding:14px;display:flex;justify-content:center}
canvas{width:100%;max-width:480px;aspect-ratio:1;touch-action:none;display:block}
.bar{display:flex;align-items:center;gap:12px;margin-bottom:16px}
.play{width:46px;height:46px;flex:0 0 46px;border:0;border-radius:50%;background:var(--accent);color:var(--accent-ink);font-size:17px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background-color .15s}
.play:hover{background:var(--accent-hover)}
.seek{flex:1;height:26px;position:relative;cursor:pointer;display:flex;align-items:center}
.seek-track{width:100%;height:5px;border-radius:3px;background:var(--surface-2);overflow:hidden}
.seek-fill{height:100%;width:0;background:var(--accent)}
.time{font-family:var(--font-mono);font-size:12px;color:var(--dim);min-width:84px;text-align:right}
.ctl{display:flex;flex-direction:column;gap:12px}
.row{display:flex;align-items:center;gap:12px;font-size:14px;color:var(--muted)}
.row label{flex:0 0 96px;color:var(--dim);font-size:13px;font-weight:500}
.row input[type=range]{flex:1;accent-color:var(--accent);min-width:0}
.row .val{font-family:var(--font-mono);font-size:12px;color:var(--ink-soft);min-width:52px;text-align:right}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chip{border:0;background:var(--surface-2);color:var(--muted);border-radius:24px;padding:6px 14px;font-size:13.5px;cursor:pointer;transition:background-color .15s,color .15s}
.chip:hover{color:var(--ink)}
.chip.on{background:rgba(255,146,148,.14);color:var(--accent-soft);box-shadow:inset 0 0 0 1px rgba(255,146,148,.45)}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.stat{background:var(--canvas-alt);border:1px solid var(--border);border-radius:12px;padding:10px 12px}
.stat .k{font-size:12px;font-weight:500;color:var(--dim)}
.stat .v{font-size:18px;font-weight:500;color:var(--ink);margin-top:2px}
.note{font-size:13px;color:var(--dim);line-height:1.65;margin-top:14px}
.file{font-size:13px;color:var(--dim)}
.file input{display:none}
.file span{color:var(--accent-soft);cursor:pointer;text-decoration:underline}
.file label{flex:none;font-size:inherit;font-weight:inherit;color:inherit}
.card h2{font-size:17px;font-weight:500;color:var(--ink);margin-bottom:14px}
.row input[type=number]{width:72px;background:var(--canvas-alt);border:1px solid var(--border);border-radius:10px;color:var(--ink);padding:6px 9px;font-family:var(--font-mono);font-size:13px}
.row select{background:var(--canvas-alt);border:1px solid var(--border);border-radius:10px;color:var(--ink);padding:6px 9px;font-size:13.5px}
.row .unit{color:var(--dim);font-size:12.5px}
.gifbar{display:flex;align-items:center;gap:12px;margin-top:4px;flex-wrap:wrap}
.btn{padding:10px 18px;font-size:14px}
.btn:disabled{background:var(--surface-2);color:var(--dim);box-shadow:none;opacity:1;cursor:default}
.gstatus{font-size:12px;color:var(--dim);font-family:var(--font-mono)}
.gpreview{margin-top:14px;display:none}
.gpreview img{width:100%;max-width:320px;border-radius:12px;border:1px solid var(--border);display:block}
.gpreview .hint{font-size:12px;color:var(--dim);margin-top:6px}
.rangebar{position:relative;flex:1;height:34px;min-width:0;cursor:pointer;touch-action:none;user-select:none}
.rb-track{position:absolute;top:14px;left:0;right:0;height:6px;border-radius:3px;background:var(--surface-2)}
.rb-sel{position:absolute;top:14px;height:6px;background:var(--accent);border-radius:3px}
.rb-play{position:absolute;top:7px;width:2px;height:20px;background:#fff;opacity:.55;pointer-events:none}
.rb-h{position:absolute;top:5px;width:12px;height:24px;margin-left:-6px;background:var(--accent-soft);border:1px solid #fff5f6;border-radius:4px;cursor:ew-resize;box-shadow:0 1px 3px rgba(0,0,0,.45)}
.rb-h:hover{background:#fff5f6}
@media(max-width:480px){.row label{flex-basis:78px}}
</style></head><body>
${topbar()}
<main class="page">
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
    <div class="row"><label>노트 속도</label><input type="range" id="spd" min="1" max="12" step="0.25" value="6.5"><span class="val mono" id="spdv">6.50</span></div>
    <div class="row"><label>재생 배속</label><input type="range" id="rate" min="0.25" max="2" step="0.05" value="1"><span class="val mono" id="ratev">1.00x</span></div>
    <div class="row"><label>표시 오프셋</label><input type="range" id="off" min="-100" max="100" step="5" value="0"><span class="val mono" id="offv">0ms</span></div>
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
  <h2>GIF 내보내기</h2>
  <div class="ctl">
    <input type="hidden" id="gStart" value="0">
    <input type="hidden" id="gDur" value="6">
    <div class="row">
      <label>구간</label>
      <div class="rangebar" id="rb">
        <div class="rb-track"></div>
        <div class="rb-sel" id="rbSel"></div>
        <div class="rb-play" id="rbPlay"></div>
        <div class="rb-h" id="rbL"></div>
        <div class="rb-h" id="rbR"></div>
      </div>
    </div>
    <div class="row"><label></label><span class="unit" id="rbInfo">0:00 ~ 0:06 · 6.0초 (드래그로 조정, 최대 60초)</span></div>
    <div class="row">
      <label>크기</label>
      <select id="gSize">
        <option value="300">300px</option>
        <option value="400" selected>400px</option>
        <option value="500">500px</option>
        <option value="600">600px</option>
        <option value="800">800px</option>
      </select>
      <label style="flex:0 0 auto">FPS</label>
      <select id="gFps">
        <option value="15" selected>15</option>
        <option value="20">20</option>
        <option value="25">25</option>
        <option value="30">30</option>
      </select>
      <span class="unit">노트 속도·미러는 위 설정</span>
    </div>
    <div class="gifbar">
      <button class="btn btn-primary" id="gMake" type="button">GIF 만들기</button>
      <span class="gstatus" id="gStatus"></span>
    </div>
    <div class="gpreview" id="gPreview">
      <img id="gImg" alt="생성된 GIF">
      <div class="hint">다운로드가 자동으로 시작됩니다. 이미지를 길게 눌러(우클릭) 저장할 수도 있습니다.</div>
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
</main>
${siteFooter()}
<script>
var DATA = ${json};
${RENDERER_JS}
// GIF 생성은 브라우저에서 한다. __RJS 는 렌더러 소스(워커에서 eval), GIF_WORKER_SRC 는
// 워커 전체 소스(gifenc 미탑재 시 null → 서버 폴백). 둘 다 문자열이다.
var __RJS = ${JSON.stringify(RENDERER_JS)};
var GIF_WORKER_SRC = ${JSON.stringify(gifWorkerSource())};
${GIF_RANGE_JS}
${GIF_CLIENT_JS}</script></body></html>`;
}

/** 링크가 죽었을 때(보관 기간 만료 등) 보여주는 안내 페이지. */
export function chartNotFoundPage(title: string, desc: string): string {
  return `<!DOCTYPE html><html lang="ko"><head>${pageHead(esc(title) + " · 캐롤봇")}
<style>
${BASE_CSS}
.page{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;max-width:560px}
h1{font-size:clamp(28px,4vw,36px);font-weight:500;color:var(--ink);line-height:1.2;margin-bottom:12px}
p{font-size:15.5px;color:var(--muted);margin-bottom:28px}
</style></head><body>${topbar()}<main class="page"><h1>${esc(title)}</h1><p>${esc(desc)}</p><a class="btn btn-secondary" href="${LANDING_URL}">캐롤봇 홈으로</a></main>${siteFooter()}</body></html>`;
}
