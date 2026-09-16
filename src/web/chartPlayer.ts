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
import { gifWorkerSource, GIF_CLIENT_JS } from "./chartGifClient";

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
.card h2{font-size:13px;font-weight:600;color:#ccc;margin-bottom:14px;font-family:'JetBrains Mono',monospace;letter-spacing:.5px;text-transform:uppercase}
.row input[type=number]{width:72px;background:#141414;border:1px solid #2a2a2a;border-radius:8px;color:#e9d5ff;padding:6px 9px;font-family:'JetBrains Mono',monospace;font-size:13px}
.row select{background:#141414;border:1px solid #2a2a2a;border-radius:8px;color:#e9d5ff;padding:6px 9px;font-family:inherit;font-size:13px}
.row .unit{color:#666;font-size:12px}
.gifbar{display:flex;align-items:center;gap:12px;margin-top:4px;flex-wrap:wrap}
.btn{border:0;border-radius:10px;background:#9333ea;color:#fff;padding:9px 16px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit}
.btn:hover{background:#a855f7}
.btn:disabled{background:#3a2a4a;color:#888;cursor:default}
.gstatus{font-size:12px;color:#888;font-family:'JetBrains Mono',monospace}
.gpreview{margin-top:14px;display:none}
.gpreview img{width:100%;max-width:320px;border-radius:12px;border:1px solid #2a2a2a;display:block}
.gpreview .hint{font-size:11px;color:#5f5f5f;margin-top:6px}
</style></head><body><div class="wrap">
<div class="nav"><a href="/">← carolbot</a></div>
<div class="head">
  ${diffName
    ? '<div class="badge">${esc(diffName)}${data.level ? " " + esc(data.level) : ""}</div>'
    : data.level ? '<div class="badge">Lv.${esc(data.level)}</div>' : ""}
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
    <div class="row"><label>노트 속도</label><input type="range" id="spd" min="1" max="12" step="0.25" value="7.5"><span class="val mono" id="spdv">7.50</span></div>
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
    <div class="row">
      <label>시작</label>
      <input type="number" id="gStart" min="0" step="0.5" value="0"><span class="unit">초</span>
      <button class="chip" id="gHere" type="button">현재 위치</button>
    </div>
    <div class="row">
      <label>길이</label>
      <input type="number" id="gDur" min="1" max="30" step="0.5" value="6"><span class="unit">초 (최대 30)</span>
    </div>
    <div class="row">
      <label>크기</label>
      <select id="gSize">
        <option value="300">300px</option>
        <option value="400" selected>400px</option>
        <option value="500">500px</option>
        <option value="600">600px</option>
        <option value="800">800px</option>
      </select>
      <span class="unit">노트 속도·미러는 위 설정을 따릅니다</span>
    </div>
    <div class="gifbar">
      <button class="btn" id="gMake" type="button">GIF 만들기</button>
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
</div>
<script>
var DATA = ${json};
${RENDERER_JS}
// GIF 생성은 브라우저에서 한다. __RJS 는 렌더러 소스(워커에서 eval), GIF_WORKER_SRC 는
// 워커 전체 소스(gifenc 미탑재 시 null → 서버 폴백). 둘 다 문자열이다.
var __RJS = ${JSON.stringify(RENDERER_JS)};
var GIF_WORKER_SRC = ${JSON.stringify(gifWorkerSource())};
${GIF_CLIENT_JS}</script></body></html>`;
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
