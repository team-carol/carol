import type { MaimaiServer } from "../storage/types";
import { BASE_CSS, pageHead, topbar, siteFooter, userNav } from "./theme";

export function settingsPage(token: string, defaultServer: MaimaiServer, translate = false, circlePublic = true, dxDecimal = false): string {
  const dataJson = JSON.stringify({ defaultServer, translate, circlePublic, dxDecimal })
    .replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
  const tokenJson = JSON.stringify(token);

  return `<!DOCTYPE html><html lang="ko"><head>${pageHead("설정 · 캐롤봇")}
<style>
${BASE_CSS}
.page{max-width:680px}
.nav{margin-bottom:36px}
.back{font-size:14px;color:var(--accent-soft)}
.back:hover{color:var(--accent)}
h1{font-size:clamp(36px,5vw,52px);font-weight:500;color:var(--ink);letter-spacing:-.01em;line-height:1.15;margin-bottom:12px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:26px 28px;margin-bottom:14px}
.section-label{font-size:13px;font-weight:500;color:var(--dim);margin-bottom:16px;display:flex;align-items:center;justify-content:space-between}
.toggle-row{display:flex;align-items:center;justify-content:space-between;gap:16px}
.toggle-info{flex:1}
.toggle-title{color:var(--ink);font-size:16px;font-weight:500;margin-bottom:4px}
.toggle-desc{font-size:14px;color:var(--muted);line-height:1.55}
.ms-link{display:inline-block;margin-top:10px;font-size:14px;font-weight:600;color:var(--accent);text-decoration:none}
.ms-link:hover{text-decoration:underline}
.toggle{position:relative;width:48px;height:28px;flex-shrink:0}
.toggle input{opacity:0;width:0;height:0;position:absolute}
.toggle .slider{position:absolute;cursor:pointer;inset:0;background:var(--surface-2);box-shadow:inset 0 0 0 1px var(--border-2);border-radius:28px;transition:.2s}
.toggle .slider::before{content:'';position:absolute;height:22px;width:22px;left:3px;top:3px;background:var(--ink-2);border-radius:50%;transition:.2s}
.toggle input:checked+.slider{background:var(--accent);box-shadow:none}
.toggle input:checked+.slider::before{transform:translateX(20px);background:#fff}
.toggle input:disabled+.slider{cursor:not-allowed;opacity:.6}
.toggle input:focus-visible+.slider{outline:2px solid #3898ec;outline-offset:2px}
.server-options{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.server-btn{background:var(--canvas-alt);border:1px solid var(--border);border-radius:12px;padding:14px 16px;color:var(--ink-soft);text-align:left;cursor:pointer;transition:border-color .15s,background-color .15s}
.server-btn:hover{border-color:var(--border-2);background:var(--surface-2)}
.server-btn strong{display:block;color:var(--ink);font-size:15px;font-weight:500;margin-bottom:2px}
.server-btn span{display:block;color:var(--dim);font-size:13px}
.server-btn.active{border-color:var(--accent);background:rgba(255,146,148,.08)}
.server-btn.active strong{color:var(--accent-soft)}
.input-group{margin-bottom:12px}
.input-group label{display:block;font-size:13px;font-weight:500;color:var(--dim);margin-bottom:6px}
.input-group input,.input-group input:focus{border-color:var(--accent)}
.input-group input::placeholder{color:var(--faint)}
.achievement-filter{display:flex;align-items:end;gap:10px}
.achievement-filter .input-group{flex:1;margin-bottom:0}
.filter-save{padding:11px 20px}
.status{font-size:13px;text-align:center;min-height:20px;margin-top:8px;transition:opacity .2s}
.status:empty{min-height:0;margin-top:0}
.status.ok{color:var(--ok)}
.status.err{color:var(--err)}
.link-card{display:flex;align-items:center;gap:16px;transition:border-color .15s}
.link-card:hover{border-color:var(--border-2)}
.link-arrow{font-size:20px;color:var(--accent-soft)}
@media(max-width:560px){.card{padding:22px}}
@media(max-width:420px){.server-options{grid-template-columns:1fr}}
</style></head><body>
${topbar(userNav(token, "settings"))}
<main class="page">
<h1>설정</h1>
<div class="nav"><a class="back" href="/sync?code=${token}">\u2190 캐롤봇 추가 북마클릿</a></div>
<div class="card">
<p class="section-label">기본 서버</p>
<div class="server-options">
<button class="server-btn" id="serverIntl" onclick="setDefaultServer('intl')"><strong>INTERNATIONAL</strong><span>maimaidx-eng.com</span></button>
<button class="server-btn" id="serverJp" onclick="setDefaultServer('jp')"><strong>JP</strong><span>maimaidx.jp</span></button>
</div>
<div class="status" id="serverStatus"></div>
</div>
<div class="card">
<p class="section-label">프로필 공개 여부</p>
<div class="toggle-desc">프로필, 친구 코드, 이전 기록의 공개 여부는 maishift 설정을 따릅니다.</div>
<a class="ms-link" href="https://maimai.shiftpsh.com/settings" target="_blank" rel="noopener">maishift 설정 열기 →</a>
</div>
<div class="card">
<p class="section-label">서클 공개 여부</p>
<div class="toggle-row">
<div class="toggle-info">
<div class="toggle-title" id="circleTitle"></div>
<div class="toggle-desc" id="circleDesc"></div>
</div>
<label class="toggle"><input type="checkbox" id="circleToggle" onchange="toggleCircle()"><span class="slider"></span></label>
</div>
<div class="status" id="circleStatus"></div>
</div>
<div class="card">
<p class="section-label">한국어 번역</p>
<div class="toggle-row">
<div class="toggle-info">
<div class="toggle-title">곡 제목, 지방, 스탬프 카드 번역 표시</div>
<div class="toggle-desc">일본어 및 한자로 된 곡 제목과 지방 이름, 스탬프 카드 이름을 한국어로 번역합니다.</div>
</div>
<label class="toggle"><input type="checkbox" id="transToggle" onchange="toggleTranslate()"><span class="slider"></span></label>
</div>
<div class="status" id="transStatus"></div>
</div>
<div class="card">
<p class="section-label">DX ✦ 랭크 표시</p>
<div class="toggle-row">
<div class="toggle-info">
<div class="toggle-title">DX ✦ 랭크를 소수점 첫째 자리까지 표시</div>
<div class="toggle-desc">곡 상세에서 DX ✦ 랭크를 ✦5.7과 같이 표시합니다.</div>
</div>
<label class="toggle"><input type="checkbox" id="dxDecToggle" onchange="toggleDxDecimal()"><span class="slider"></span></label>
</div>
<div class="status" id="dxDecStatus"></div>
</div>
<div class="card">
<p class="section-label">오늘의 성과 필터</p>
<div class="toggle-desc" style="margin-bottom:14px">이 기준 이상 오른 기록만 표시합니다. FC/FS 이상 플레이는 기준보다 낮아도 계속 표시됩니다.</div>
<div class="achievement-filter"><div class="input-group"><label for="achievementMin">최소 달성률 (%)</label><input id="achievementMin" type="number" min="0" max="101" step="0.0001" value="95.0000"></div><button class="btn btn-primary filter-save" id="achievementSave" onclick="saveAchievementFilter()">저장</button></div>
<div class="status" id="achievementStatus"></div>
</div>
<a class="card link-card" href="/options?code=${token}">
<div class="toggle-info"><div class="toggle-title">게임 설정</div>
<div class="toggle-desc">maimai DX NET 게임 옵션을 확인하고, 프리셋으로 저장해 두었다가 한 번에 적용할 수 있습니다.</div></div>
<span class="link-arrow">\u2192</span>
</a>
</main>
${siteFooter()}
<script>
var TOKEN=${tokenJson};
var DATA=${dataJson};

(function init(){
  renderDefaultServer();
  renderTranslate();
  renderDxDecimal();
  renderCircle();
  loadAchievementFilter();
})();


function renderAchievementFilter(){
  var value=Number(DATA.minimumAchievement);
  document.getElementById('achievementMin').value=(Number.isFinite(value)?value:95).toFixed(4);
}

function loadAchievementFilter(){
  renderAchievementFilter();
  fetch('/api/settings?code='+TOKEN).then(function(r){if(!r.ok)throw new Error(r.status);return r.json();}).then(function(data){
    if(typeof data.minimumAchievement==='number'&&Number.isFinite(data.minimumAchievement)){DATA.minimumAchievement=data.minimumAchievement;renderAchievementFilter();}
  }).catch(function(){});
}

function saveAchievementFilter(){
  var input=document.getElementById('achievementMin'), save=document.getElementById('achievementSave'), next=Number(input.value), previous=Number(DATA.minimumAchievement);
  if(!Number.isFinite(next)||next<0||next>101){showStatus('achievementStatus','err','0~101 사이의 값을 입력해주세요.');renderAchievementFilter();return;}
  save.disabled=true;
  fetch('/api/settings/achievement-filter?code='+TOKEN,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({minimumAchievement:next})})
  .then(function(r){if(!r.ok)throw new Error(r.status);return r.json();})
  .then(function(){DATA.minimumAchievement=next;renderAchievementFilter();showStatus('achievementStatus','ok','저장됨');})
  .catch(function(){DATA.minimumAchievement=Number.isFinite(previous)?previous:95;renderAchievementFilter();showStatus('achievementStatus','err','저장 실패');})
  .then(function(){save.disabled=false;});
}

function renderDefaultServer(){
  document.getElementById('serverIntl').className='server-btn'+(DATA.defaultServer==='intl'?' active':'');
  document.getElementById('serverJp').className='server-btn'+(DATA.defaultServer==='jp'?' active':'');
}

function setDefaultServer(server){
  var prev=DATA.defaultServer;
  DATA.defaultServer=server;
  renderDefaultServer();
  fetch('/api/settings/default-server?code='+TOKEN,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({server:server})})
  .then(function(r){if(!r.ok)throw new Error(r.status);return r.json();})
  .then(function(){showStatus('serverStatus','ok','저장됨');})
  .catch(function(){DATA.defaultServer=prev;renderDefaultServer();showStatus('serverStatus','err','저장 실패');});
}


function renderCircle(){
  var on=DATA.circlePublic!==false;
  document.getElementById('circleToggle').checked=on;
  document.getElementById('circleTitle').textContent=on?'공개':'비공개';
  document.getElementById('circleDesc').textContent=on
    ?'/프로필에 서클 이름이 표시되고, 다른 사람도 /서클로 내 서클 정보를 볼 수 있습니다.'
    :'/프로필에 서클 이름을 표시하지 않고, /서클은 나만 볼 수 있습니다.';
}

function toggleCircle(){
  var cb=document.getElementById('circleToggle');
  var want=cb.checked;
  fetch('/api/settings/circle?code='+TOKEN,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({public:want})})
  .then(function(r){if(!r.ok)throw new Error(r.status);return r.json();})
  .then(function(){DATA.circlePublic=want;renderCircle();showStatus('circleStatus','ok','저장됨');})
  .catch(function(){cb.checked=!want;showStatus('circleStatus','err','저장 실패');});
}

function renderTranslate(){
  document.getElementById('transToggle').checked=!!DATA.translate;
}

function renderDxDecimal(){
  document.getElementById('dxDecToggle').checked=!!DATA.dxDecimal;
}

function toggleDxDecimal(){
  var cb=document.getElementById('dxDecToggle');
  var want=cb.checked;
  fetch('/api/settings/dx-decimal?code='+TOKEN,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({decimal:want})})
  .then(function(r){if(!r.ok)throw new Error(r.status);return r.json();})
  .then(function(){DATA.dxDecimal=want;showStatus('dxDecStatus','ok','저장됨');})
  .catch(function(){cb.checked=!cb.checked;showStatus('dxDecStatus','err','저장 실패');});
}

function toggleTranslate(){
  var cb=document.getElementById('transToggle');
  var want=cb.checked;
  fetch('/api/settings/translate?code='+TOKEN,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({translate:want})})
  .then(function(r){if(!r.ok)throw new Error(r.status);return r.json();})
  .then(function(){DATA.translate=want;showStatus('transStatus','ok','저장됨');})
  .catch(function(){cb.checked=!cb.checked;showStatus('transStatus','err','저장 실패');});
}


function showStatus(id,cls,txt){
  var el=document.getElementById(id);el.className='status '+cls;el.textContent=txt;
  setTimeout(function(){el.style.opacity='0';setTimeout(function(){el.textContent='';el.className='status';el.style.opacity='1';},200);},2500);
}

</script>
</body></html>`;
}
