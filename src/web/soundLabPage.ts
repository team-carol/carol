// 효과음 비교 페이지(미리보기 전용, npm run preview → /sounds).
// TAP·BREAK·SLIDE·TOUCH·EX 마다 소리를 골라(합성음 chartSound.ts, 또는 CC0 후보 파일 data/sound-candidates) 조합하고,
// 그 조합을 데모 보면에 붙여 들어 본다. 정한 조합은 나중에 웹 플레이어·Activity·풀영상이 같이 쓴다.

import { BASE_CSS, pageHead, topbar } from "./theme";
import { RENDERER_JS } from "./chartRenderer";
import { SOUND_JS } from "./chartSound";
import type { ChartPlayerData } from "./chartPlayer";

export interface SoundFile { id: string; pack: string; name: string }

const SYNTH_SETS: [string, string][] = [["beep", "지금 소리"], ["click", "A 클릭"], ["clap", "B 박수"], ["wood", "C 나무"]];
const KINDS: [string, string][] = [["tap", "TAP"], ["break", "BREAK"], ["slide", "SLIDE"], ["touch", "TOUCH"]];
export const SOUND_PACKS: Record<string, string> = {
  interface: "Kenney Interface Sounds",
  "ui-audio": "Kenney UI Audio",
  impact: "Kenney Impact Sounds",
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function soundLabPage(data: ChartPlayerData, files: SoundFile[]): string {
  const json = JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
  const synthOpts = `<optgroup label="합성음">${SYNTH_SETS.map(([set, sn]) =>
    KINDS.map(([k, kn]) => `<option value="synth:${set}:${k}">${sn} · ${kn}</option>`).join("")).join("")}</optgroup>`;
  const packs = Object.keys(SOUND_PACKS).filter((p) => files.some((f) => f.pack === p));
  const fileOpts = packs.map((p) => `<optgroup label="${esc(SOUND_PACKS[p])}">${
    files.filter((f) => f.pack === p).map((f) => `<option value="file:${esc(f.id)}">${esc(f.name)}</option>`).join("")}</optgroup>`).join("");
  const rows = [...KINDS, ["ex", "EX"] as [string, string]].map(([k, kn]) => `<div class="mix" data-kind="${k}">
    <span class="kn">${kn}</span>
    <select class="crl-input src">${k === "ex" ? `<option value="same">TAP·BREAK 소리 그대로</option>` : ""}${synthOpts}${fileOpts}</select>
    <input type="range" class="gain" min="0" max="2" step="0.05" value="1" aria-label="${kn} 크기"><span class="gv">100%</span>
    <button class="crl-btn crl-btn--secondary crl-btn--sm hear" type="button">▶</button>
  </div>`).join("");
  const browse = packs.map((p) => `<h3>${esc(SOUND_PACKS[p])}</h3><div class="files">${
    files.filter((f) => f.pack === p).map((f) => `<div class="f" data-id="${esc(f.id)}"><button class="crl-btn crl-btn--secondary crl-btn--sm pl" type="button">▶ ${esc(f.name.replace(/\.(wav|ogg)$/, ""))}</button>${
      [...KINDS, ["ex", "EX"]].map(([k, kn]) => `<button class="as" type="button" data-to="${k}" title="${kn} 에 넣기">${kn[0]}${k === "touch" ? "c" : ""}</button>`).join("")}</div>`).join("")}</div>`).join("");

  return `<!DOCTYPE html><html lang="ko"><head>${pageHead("효과음 비교 · 캐롤봇")}
<style>
${BASE_CSS}
.page{max-width:820px}
.crl-card h2{font-size:17px;font-weight:500;color:var(--crl-ink);margin-bottom:12px}
.crl-card h3{font-size:13px;font-weight:500;color:var(--crl-dim);margin:14px 0 8px}
.lead{font-size:13.5px;color:var(--crl-muted);line-height:1.7;margin-bottom:18px}
.mix{display:flex;align-items:center;gap:10px;padding:6px 0;border-top:1px solid var(--crl-border)}
.mix:first-child{border-top:0}
.mix .kn{flex:0 0 58px;font-family:var(--crl-font-mono);font-size:12px;color:var(--crl-ink-soft)}
.mix select{flex:1;min-width:0;padding:6px 30px 6px 9px;font-size:13px}
.mix .gain{flex:0 0 110px;accent-color:var(--crl-accent)}
.mix .gv{flex:0 0 42px;font-family:var(--crl-font-mono);font-size:11.5px;color:var(--crl-dim);text-align:right}
.row{display:flex;align-items:center;gap:12px;font-size:14px;color:var(--crl-muted);margin-top:12px}
.row label{flex:0 0 84px;color:var(--crl-dim);font-size:13px;font-weight:500}
.row input[type=range]{flex:1;accent-color:var(--crl-accent);min-width:0}
.row .val{font-family:var(--crl-font-mono);font-size:12px;color:var(--crl-ink-soft);min-width:52px;text-align:right}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chip{border:0;color:var(--crl-muted);font-size:13px;cursor:pointer}
.chip.on{background:color-mix(in srgb,var(--crl-accent) 14%,transparent);color:var(--crl-accent-soft);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--crl-accent) 45%,transparent)}
.stage{display:flex;justify-content:center;margin:14px 0}
canvas{width:100%;max-width:400px;aspect-ratio:1;touch-action:none;display:block}
.bar{display:flex;align-items:center;gap:12px}
.play{width:44px;height:44px;flex:0 0 44px;border:0;border-radius:50%;background:var(--crl-accent);color:var(--crl-accent-ink);font-size:16px;cursor:pointer}
.seek{flex:1;height:26px;cursor:pointer;display:flex;align-items:center}
.seek-track{width:100%;height:5px;border-radius:3px;background:var(--crl-surface-2);overflow:hidden}
.seek-fill{height:100%;width:0;background:var(--crl-accent)}
.time{font-family:var(--crl-font-mono);font-size:12px;color:var(--crl-dim)}
.files{display:flex;flex-wrap:wrap;gap:6px}
.f{display:flex;align-items:center;gap:2px;background:var(--crl-canvas-alt);border:1px solid var(--crl-border);border-radius:var(--crl-radius-control,10px);padding:3px}
.f .pl{font-family:var(--crl-font-mono);font-size:11.5px}
.as{border:0;background:transparent;color:var(--crl-dim);font-family:var(--crl-font-mono);font-size:10.5px;padding:4px 5px;border-radius:6px;cursor:pointer}
.as:hover{background:var(--crl-surface-2);color:var(--crl-accent-soft)}
pre{background:var(--crl-canvas-alt);border:1px solid var(--crl-border);border-radius:var(--crl-radius-control,10px);padding:10px 12px;font-family:var(--crl-font-mono);font-size:12px;color:var(--crl-ink-soft);white-space:pre-wrap;margin-top:8px}
.note{font-size:12px;color:var(--crl-faint);margin-top:10px;line-height:1.6}
.hidden{display:none}
</style></head><body>
${topbar()}
<main class="page">
<h1 class="crl-heading-2 page-title">효과음 비교</h1>
<p class="lead">노트 종류마다 소리를 골라 조합을 만들고, 아래 데모 보면에 붙여 들어 봅니다. ▶ 로 하나씩 들을 수 있고, 맨 아래 파일 목록에서 들어 보고 T·B·S·Tc·E 를 눌러 바로 넣을 수도 있습니다.
같은 순간의 같은 소리는 한 번만 내고, 겹쳐도 깨지지 않게 크기를 눌러 줍니다("지금 소리" 모드는 지금 그대로). 고른 조합은 이 브라우저에 기억됩니다.</p>

<div class="crl-card">
  <h2>조합 만들기</h2>
  <div id="mixer">${rows}</div>
  <div class="row"><label for="vol">전체 볼륨</label><input type="range" id="vol" min="0" max="1" step="0.05" value="0.7"><span class="val" id="volv">70%</span></div>
  <pre id="out"></pre>
</div>

<div class="crl-card">
  <h2>보면에 붙여 듣기</h2>
  <div class="chips" id="mode"><button class="crl-chip chip on" type="button" data-mode="mix">고른 조합</button><button class="crl-chip chip" type="button" data-mode="beep">지금 소리</button></div>
  <div class="stage"><canvas id="cv" width="920" height="920"></canvas></div>
  <div class="bar">
    <button class="play" id="pp" type="button" aria-label="재생/일시정지">▶</button>
    <div class="seek" id="sk"><div class="seek-track"><div class="seek-fill" id="fill"></div></div></div>
    <div class="time"><span id="cur">0:00</span></div>
  </div>
  <div class="row"><label for="rate">재생 배속</label><input type="range" id="rate" min="0.25" max="2" step="0.05" value="1"><span class="val" id="ratev">1.00x</span></div>
  <div class="hidden">
    <input type="range" id="spd" min="1" max="12" step="0.25" value="6.5"><span id="spdv"></span>
    <input type="range" id="off" min="-100" max="100" step="5" value="0"><span id="offv"></span>
    <button id="tSound" class="on"></button><button id="tGuide" class="on"></button><button id="tMirror"></button>
  </div>
</div>

<div class="crl-card">
  <h2>후보 파일 모두 듣기</h2>
  ${browse || '<div class="note">후보 파일이 없습니다. data/sound-candidates/ 에 받아 두면 여기에 나옵니다.</div>'}
  <div class="note">모두 CC0(퍼블릭 도메인)입니다. Kenney(kenney.nl)의 팩을 GitHub 사본에서 받았습니다.</div>
</div>
</main>
<script>
var DATA = ${json};
${RENDERER_JS}
${SOUND_JS}
(function(){
  var DEFAULTS = { tap: { src: 'file:interface/click_003.wav', gain: 1 }, 'break': { src: 'file:impact/impact_glass_medium_000.ogg', gain: 1 },
    slide: { src: 'file:interface/maximize_003.wav', gain: 1 }, touch: { src: 'synth:clap:tap', gain: 1 }, ex: { src: 'same', gain: 1 } };
  var MIX = {}, MODE = 'mix', VOL = 0.7;
  try { var saved = JSON.parse(localStorage.getItem('carol-sound-lab') || 'null'); if (saved && saved.mix) MIX = saved.mix; if (saved && saved.vol !== undefined) VOL = saved.vol; } catch (e) {}
  for (var k in DEFAULTS) if (!MIX[k]) MIX[k] = DEFAULTS[k];
  function save(){ try { localStorage.setItem('carol-sound-lab', JSON.stringify({ mix: MIX, vol: VOL })); } catch (e) {} }

  var actx = null, master = null, synthCache = {}, fileCache = {}, lastAt = {};
  function ac(){
    if (!actx){
      actx = new (window.AudioContext || window.webkitAudioContext)();
      var comp = actx.createDynamicsCompressor();
      comp.threshold.value = -8; comp.knee.value = 6; comp.ratio.value = 6; comp.attack.value = 0.001; comp.release.value = 0.08;
      master = actx.createGain(); master.gain.value = VOL;
      master.connect(comp); comp.connect(actx.destination);
      // 고른 파일은 미리 풀어 둔다(재생 중 첫 소리가 늦지 않게)
      for (var kk in MIX) if (MIX[kk].src !== 'same') bufferOf(MIX[kk].src, false).catch(function(){});
    }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  function synthBuf(set, kind, ex){
    var key = set + '|' + kind + '|' + (ex ? 1 : 0);
    if (!synthCache[key]){
      var pcm = carolSynth(set, kind, ex, actx.sampleRate);
      var b = actx.createBuffer(1, pcm.length, actx.sampleRate);
      b.getChannelData(0).set(pcm);
      synthCache[key] = b;
    }
    return synthCache[key];
  }
  // src: 'synth:<set>:<kind>' | 'file:<pack>/<name>'. 합성음은 바로, 파일은 받아서 푼 뒤(처음 한 번).
  function bufferOf(src, ex){
    if (src.indexOf('synth:') === 0){ var p = src.split(':'); return Promise.resolve(synthBuf(p[1], p[2], ex)); }
    if (src.indexOf('file:') !== 0) return Promise.reject(new Error('unknown source ' + src));
    var id = src.slice(5);
    if (!fileCache[id]) fileCache[id] = fetch('/sounds/files/' + id).then(function(r){ return r.arrayBuffer(); }).then(function(a){ return actx.decodeAudioData(a); });
    return fileCache[id];
  }
  function playSrc(src, gain, ex, when){
    ac();
    bufferOf(src, ex).then(function(buf){
      var s = actx.createBufferSource(), g = actx.createGain();
      s.buffer = buf; g.gain.value = gain;
      s.connect(g); g.connect(master);
      s.start(when || 0);
    }).catch(function(e){ console.warn('[sound] 재생 실패', src, e); });
  }
  function playKind(kind, isEx){
    var m = MIX[kind] || MIX.tap;
    if (isEx && MIX.ex.src !== 'same') m = MIX.ex;
    playSrc(m.src, m.gain, isEx, 0);
  }

  // ── 조합 만들기 ──
  var mixer = document.getElementById('mixer'), out = document.getElementById('out');
  function show(){
    var lines = [];
    var rowsEl = mixer.querySelectorAll('.mix');
    for (var i = 0; i < rowsEl.length; i++){
      var el = rowsEl[i], k = el.getAttribute('data-kind'), m = MIX[k];
      el.querySelector('.src').value = m.src;
      el.querySelector('.gain').value = m.gain;
      el.querySelector('.gv').textContent = Math.round(m.gain * 100) + '%';
      var label = el.querySelector('.src').selectedOptions[0];
      lines.push((k === 'break' ? 'BREAK' : k.toUpperCase()) + ': ' + (label ? (label.parentNode.label ? label.parentNode.label + ' / ' : '') + label.textContent : m.src) + ' x' + m.gain.toFixed(2));
    }
    out.textContent = lines.join('\\n');
  }
  mixer.addEventListener('change', function(e){
    var el = e.target.closest('.mix'); if (!el || !e.target.classList.contains('src')) return;
    MIX[el.getAttribute('data-kind')].src = e.target.value; save(); show();
    if (actx && e.target.value !== 'same') bufferOf(e.target.value, false).catch(function(){});
  });
  mixer.addEventListener('input', function(e){
    var el = e.target.closest('.mix'); if (!el || !e.target.classList.contains('gain')) return;
    MIX[el.getAttribute('data-kind')].gain = parseFloat(e.target.value); save(); show();
  });
  mixer.addEventListener('click', function(e){
    var el = e.target.closest('.mix'); if (!el || !e.target.classList.contains('hear')) return;
    var k = el.getAttribute('data-kind');
    if (k === 'ex') playKind('tap', true); else playKind(k, false);
  });
  var vol = document.getElementById('vol'), volv = document.getElementById('volv');
  vol.value = VOL; volv.textContent = Math.round(VOL * 100) + '%';
  vol.oninput = function(){ VOL = parseFloat(vol.value); volv.textContent = Math.round(VOL * 100) + '%'; if (master) master.gain.value = VOL; save(); };

  // ── 후보 파일 목록 ──
  document.addEventListener('click', function(e){
    var f = e.target.closest('.f'); if (!f) return;
    var id = f.getAttribute('data-id');
    if (e.target.classList.contains('pl')) playSrc('file:' + id, 1, false, 0);
    else if (e.target.classList.contains('as')){
      var to = e.target.getAttribute('data-to');
      MIX[to].src = 'file:' + id; save(); show(); playSrc('file:' + id, MIX[to].gain, false, 0);
    }
  });

  // ── 보면에 붙여 듣기 ──
  document.getElementById('mode').addEventListener('click', function(e){
    var b = e.target.closest('button[data-mode]'); if (!b) return;
    MODE = b.getAttribute('data-mode');
    var all = document.querySelectorAll('#mode .chip');
    for (var i = 0; i < all.length; i++) all[i].classList.toggle('on', all[i] === b);
  });
  document.getElementById('pp').addEventListener('click', ac);
  click = function(kind, isEx, note){
    if (!sound) return;
    ac();
    var k = kind === 'tap' && note && (note.type === 'touch' || note.type === 'touchHold') ? 'touch' : kind;
    if (MODE === 'beep'){ playSrc('synth:beep:' + k, 1, !!isEx, 0); return; }
    var now = actx.currentTime;
    if (lastAt[k] !== undefined && now - lastAt[k] < 0.012) return;
    lastAt[k] = now;
    playKind(k, !!isEx);
  };
  show();
})();
</script></body></html>`;
}
