// 웹 플레이어의 GIF 생성을 브라우저에서 하기 위한 조각들.
//
// 서버(Discord 미리보기)와 같은 렌더러(chartRenderer.ts)를 브라우저 Web Worker 안
// OffscreenCanvas 에 올려 프레임을 뽑고, gifenc(순수 JS)로 인코딩한다. 서버 CPU 를
// 전혀 쓰지 않는다. OffscreenCanvas 나 Worker 가 없는 브라우저(구형 Safari 등)에서는
// 페이지 쪽 컨트롤러가 서버 /chart/gif 로 폴백한다.
//
// (백틱과 ${ 를 쓰지 말 것 — 여기서 만든 문자열은 chartPlayerPage 의 템플릿 리터럴
//  안에 인라인된다.)

import * as fs from "fs";

/** gifenc 브라우저용 소스. 워커에 인라인한다. 없으면 클라이언트 생성 자체를 끈다. */
function readGifenc(): string | null {
  try {
    const p = require.resolve("gifenc/dist/gifenc.js");
    return fs.readFileSync(p, "utf8");
  } catch (e) {
    console.error("[chartGifClient] gifenc 소스를 읽지 못했습니다:", e);
    return null;
  }
}

const GIFENC_SRC = readGifenc();

/** 워커 안에서 브라우저 DOM 흉내를 내는 최소 대역. 서버 makeSandbox 와 같은 역할. */
const WORKER_STUB = [
  "var window = self;",
  "function __el(){ return { style:{}, classList:{toggle:function(){},add:function(){},remove:function(){}},",
  "  getBoundingClientRect:function(){return {left:0,width:100};}, setPointerCapture:function(){},",
  "  releasePointerCapture:function(){}, textContent:'', value:'1', files:null, scrollIntoView:function(){},",
  "  addEventListener:function(){}, appendChild:function(){}, removeChild:function(){}, remove:function(){} }; }",
  "var document = {",
  "  getElementById:function(id){ if(id==='cv'){ return { getContext:function(){ return self.__CTX; }, width:920, height:920, style:{}, addEventListener:function(){} }; } return __el(); },",
  "  querySelector:function(){ return __el(); }, querySelectorAll:function(){ return []; },",
  "  addEventListener:function(){}, createElement:function(){ return __el(); }, body:__el() };",
  "var requestAnimationFrame = function(){ return 0; };",
  "var cancelAnimationFrame = function(){};",
  "var performance = self.performance || { now:function(){ return 0; } };",
  "function Audio(){ return { play:function(){}, pause:function(){}, addEventListener:function(){} }; }",
  "var exports = {};",
].join("\n");

/** 워커의 메시지 루프. 매 요청마다 크기에 맞춰 OffscreenCanvas 를 만들고 렌더러를 다시 eval 한다. */
const WORKER_LOOP = [
  "var SRC = 920;",
  "var GIFEncoder = exports.GIFEncoder, quantize = exports.quantize, applyPalette = exports.applyPalette;",
  "onmessage = function(e){",
  "  try {",
  "    var d = e.data, opts = d.opts;",
  "    self.DATA = d.data;",
  "    var canvas = new OffscreenCanvas(opts.size, opts.size);",
  "    var ctx2 = canvas.getContext('2d');",
  "    ctx2.scale(opts.size / SRC, opts.size / SRC);",
  "    self.__CTX = ctx2;",
  "    (0, eval)(d.rendererSrc);",              // 렌더러가 self.__CTX 를 잡고 self.t/self.draw 등을 정의
  "    self.sound = false;",
  "    self.speedIdx = opts.speed; self.mirror = opts.mirror; self.guide = opts.guide;",
  "    var frames = Math.max(1, Math.round(opts.durationMs / 1000 * opts.fps));",
  "    var delay = Math.round(1000 / opts.fps);",
  "    function renderFrame(fi){",
  "      self.t = opts.startMs + (fi / opts.fps) * 1000;",
  "      self.draw();",
  "      ctx2.save(); ctx2.globalCompositeOperation = 'destination-over';",
  "      ctx2.fillStyle = '#1a1a1a'; ctx2.fillRect(0, 0, SRC, SRC); ctx2.restore();",
  "      return ctx2.getImageData(0, 0, opts.size, opts.size).data;",
  "    }",
  // 팔레트는 첫 프레임 하나가 아니라 클립 전체에서 뽑은 표본으로 만든다.
  // 시작이 빈 화면(리드인)이거나 노트가 적으면 그 색이 팔레트에 빠져 노트가
  // 회색으로 뭉개지기 때문이다.
  "    var sampleN = Math.min(frames, 16);",
  "    var chunks = [];",
  "    for (var s = 0; s < sampleN; s++){",
  "      var fi = sampleN <= 1 ? 0 : Math.round(s * (frames - 1) / (sampleN - 1));",
  "      chunks.push(renderFrame(fi));",
  "    }",
  "    var totalLen = 0; for (var c1 = 0; c1 < chunks.length; c1++) totalLen += chunks[c1].length;",
  "    var merged = new Uint8Array(totalLen); var mo = 0;",
  "    for (var c2 = 0; c2 < chunks.length; c2++){ merged.set(chunks[c2], mo); mo += chunks[c2].length; }",
  "    var palette = quantize(merged, 128);",
  "    chunks = null; merged = null;",
  "    var enc = GIFEncoder();",
  "    for (var i = 0; i < frames; i++){",
  "      var rgba = renderFrame(i);",
  "      var idx = applyPalette(rgba, palette);",
  "      enc.writeFrame(idx, opts.size, opts.size, { palette: i === 0 ? palette : undefined, delay: delay });",
  "      if (i % 8 === 0) postMessage({ progress: (i + 1) / frames });",
  "    }",
  "    enc.finish();",
  "    var bytes = enc.bytes();",
  "    postMessage({ done: true, gif: bytes.buffer }, [bytes.buffer]);",
  "  } catch (err) {",
  "    postMessage({ error: String((err && err.message) || err) });",
  "  }",
  "};",
].join("\n");

/** 워커 전체 소스. gifenc 를 못 읽었으면 null 이고, 이때 페이지는 서버 폴백을 쓴다. */
export function gifWorkerSource(): string | null {
  if (!GIFENC_SRC) return null;
  return WORKER_STUB + "\n" + GIFENC_SRC + "\n" + WORKER_LOOP;
}

/**
 * 페이지 쪽 컨트롤러. 전역 __RJS(렌더러 소스 문자열), GIF_WORKER_SRC, DATA, speedIdx,
 * mirror, guide, t 를 읽는다. GIF_WORKER_SRC 가 있고 OffscreenCanvas/Worker 가 되면
 * 브라우저에서 만들고, 아니면 /chart/gif 로 폴백한다.
 */
export const GIF_CLIENT_JS = [
  "(function(){",
  "  var mk = document.getElementById('gMake');",
  "  var st = document.getElementById('gStatus');",
  "  var pv = document.getElementById('gPreview');",
  "  var img = document.getElementById('gImg');",
  "  if(!mk) return;",
  "  var canClient = typeof OffscreenCanvas !== 'undefined' && typeof Worker !== 'undefined'",
  "    && typeof GIF_WORKER_SRC === 'string' && GIF_WORKER_SRC;",
  "  var worker = null, workerUrl = null;",
  "  function getWorker(){",
  "    if (worker) return worker;",
  "    workerUrl = URL.createObjectURL(new Blob([GIF_WORKER_SRC], { type: 'text/javascript' }));",
  "    worker = new Worker(workerUrl);",
  "    return worker;",
  "  }",
  "  var lastUrl = null, busy = false;",
  "  function finish(blob){",
  "    if (lastUrl) URL.revokeObjectURL(lastUrl);",
  "    lastUrl = URL.createObjectURL(blob);",
  "    var a = document.createElement('a');",
  "    a.href = lastUrl; a.download = (DATA.title || 'chart') + '.gif';",
  "    document.body.appendChild(a); a.click(); a.remove();",
  "    img.src = lastUrl; pv.style.display = 'block';",
  "    st.textContent = '완료 · ' + (blob.size / 1048576).toFixed(1) + 'MB';",
  "    mk.disabled = false; busy = false;",
  "  }",
  "  function fail(msg){ st.textContent = msg || '실패'; mk.disabled = false; busy = false; }",
  "  function opts(){",
  "    var start = parseFloat(document.getElementById('gStart').value) || 0;",
  "    var dur = Math.min(30, Math.max(1, parseFloat(document.getElementById('gDur').value) || 6));",
  "    var size = parseInt(document.getElementById('gSize').value, 10) || 400;",
  "    return { startMs: start * 1000, durationMs: dur * 1000, size: size, fps: 15,",
  "      speed: speedIdx, mirror: !!mirror, guide: !!guide };",
  "  }",
  "  mk.onclick = function(){",
  "    if (busy) return; busy = true; mk.disabled = true;",
  "    var o = opts();",
  "    if (canClient){",
  "      st.textContent = '브라우저에서 만드는 중… 0%';",
  "      var w = getWorker();",
  "      w.onmessage = function(ev){",
  "        var m = ev.data;",
  "        if (m.progress !== undefined){ st.textContent = '브라우저에서 만드는 중… ' + Math.round(m.progress * 100) + '%'; }",
  "        else if (m.done){ finish(new Blob([m.gif], { type: 'image/gif' })); }",
  "        else if (m.error){ fail('생성 실패: ' + m.error); }",
  "      };",
  "      w.onerror = function(){ fail('워커 오류'); };",
  "      w.postMessage({ rendererSrc: __RJS, data: DATA, opts: o });",
  "    } else {",
  "      st.textContent = '서버에서 만드는 중…';",
  "      var q = '?id=' + encodeURIComponent(DATA.id) + '&start=' + (o.startMs/1000) + '&dur=' + (o.durationMs/1000)",
  "        + '&size=' + o.size + '&fps=15&speed=' + o.speed + '&mirror=' + (o.mirror?'1':'0') + '&guide=' + (o.guide?'1':'0');",
  "      fetch('/chart/gif' + q).then(function(r){",
  "        if (r.status === 429) throw new Error('서버가 잠시 바쁩니다. 다시 눌러주세요.');",
  "        if (!r.ok) throw new Error('생성에 실패했습니다.');",
  "        return r.blob();",
  "      }).then(finish).catch(function(e){ fail(e.message); });",
  "    }",
  "  };",
  "})();",
].join("\n");

/**
 * GIF 구간 선택 바 컨트롤러. 영상 편집기처럼 재생 구간 위에서 양쪽 핸들을 끌어
 * 시작·길이를 정한다. 값은 숨은 입력 #gStart/#gDur(초)에 써서 GIF_CLIENT_JS 가
 * 그대로 읽는다. 전역 t(현재 재생 위치)와 DATA(곡 길이)를 읽는다.
 * (백틱과 ${ 를 쓰지 말 것 — chartPlayerPage 템플릿 안에 인라인된다.)
 */
export const GIF_RANGE_JS = [
  "(function(){",
  "  var rb = document.getElementById('rb'); if(!rb) return;",
  "  var sel = document.getElementById('rbSel'), hl = document.getElementById('rbL'), hr = document.getElementById('rbR');",
  "  var play = document.getElementById('rbPlay'), info = document.getElementById('rbInfo');",
  "  var gS = document.getElementById('gStart'), gD = document.getElementById('gDur');",
  "  var dur = (DATA.chart && DATA.chart.durationMs) || 1;",
  "  var MAXLEN = Math.min(30000, dur), MINLEN = Math.min(1000, dur);",
  "  var startMs = 0, lenMs = Math.min(6000, MAXLEN);",
  "  function fmt(ms){ var s = Math.max(0, Math.round(ms/1000)); return Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); }",
  "  function W(){ return rb.clientWidth || 1; }",
  "  function clampAll(){ if(lenMs>MAXLEN)lenMs=MAXLEN; if(lenMs<MINLEN)lenMs=MINLEN; if(startMs<0)startMs=0; if(startMs+lenMs>dur)startMs=dur-lenMs; if(startMs<0)startMs=0; }",
  "  function render(){ var w=W(); var x0=startMs/dur*w, x1=(startMs+lenMs)/dur*w;",
  "    sel.style.left=x0+'px'; sel.style.width=Math.max(0,x1-x0)+'px'; hl.style.left=x0+'px'; hr.style.left=x1+'px';",
  "    gS.value=(startMs/1000).toFixed(2); gD.value=(lenMs/1000).toFixed(2);",
  "    info.textContent = fmt(startMs)+' ~ '+fmt(startMs+lenMs)+' · '+(lenMs/1000).toFixed(1)+'초'; }",
  "  function posMs(clientX){ var r=rb.getBoundingClientRect(); return Math.max(0, Math.min(dur, (clientX-r.left)/r.width*dur)); }",
  "  var drag = null;",
  "  function start(e, which){ drag={which:which, x:e.clientX, s:startMs, l:lenMs}; try{rb.setPointerCapture(e.pointerId);}catch(_){} e.preventDefault(); e.stopPropagation(); }",
  "  hl.addEventListener('pointerdown', function(e){ start(e,'L'); });",
  "  hr.addEventListener('pointerdown', function(e){ start(e,'R'); });",
  "  rb.addEventListener('pointerdown', function(e){ var m=posMs(e.clientX);",
  "    if(!(m>=startMs && m<=startMs+lenMs)){ startMs=m-lenMs/2; clampAll(); render(); } start(e,'M'); });",
  "  rb.addEventListener('pointermove', function(e){ if(!drag) return; var m=posMs(e.clientX);",
  "    if(drag.which==='L'){ var end=drag.s+drag.l; startMs=Math.min(m, end-MINLEN); lenMs=end-startMs; }",
  "    else if(drag.which==='R'){ lenMs=Math.max(MINLEN, m-startMs); }",
  "    else { startMs = drag.s + (e.clientX-drag.x)/W()*dur; }",
  "    clampAll(); render(); });",
  "  function end(e){ drag=null; try{rb.releasePointerCapture(e.pointerId);}catch(_){} }",
  "  rb.addEventListener('pointerup', end); rb.addEventListener('pointercancel', end);",
  "  function tick(){ var pt = (typeof t !== 'undefined') ? Math.max(0, Math.min(dur, t)) : 0;",
  "    play.style.left = (pt/dur*W())+'px'; requestAnimationFrame(tick); }",
  "  window.addEventListener('resize', render);",
  "  clampAll(); render(); requestAnimationFrame(tick);",
  "})();",
].join("\n");
