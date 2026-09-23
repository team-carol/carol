import type { ExtraBookmarklet, MaimaiServer } from "../storage/types";
import { BOOKMARKLET_PRESETS } from "./bookmarklet";
import { BASE_CSS, pageHead, topbar, siteFooter } from "./theme";

export function settingsPage(token: string, isPrivate: boolean, enabledPresetIds: string[], bookmarklets: ExtraBookmarklet[], defaultServer: MaimaiServer, translate = false): string {
  const presets = BOOKMARKLET_PRESETS.map((preset) => ({ ...preset, enabled: enabledPresetIds.includes(preset.id) }));
  const dataJson = JSON.stringify({ private: isPrivate, presets, bookmarklets, defaultServer, translate })
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
.toggle{position:relative;width:48px;height:28px;flex-shrink:0}
.toggle input{opacity:0;width:0;height:0;position:absolute}
.toggle .slider{position:absolute;cursor:pointer;inset:0;background:var(--surface-2);box-shadow:inset 0 0 0 1px var(--border-2);border-radius:28px;transition:.2s}
.toggle .slider::before{content:'';position:absolute;height:22px;width:22px;left:3px;top:3px;background:var(--ink-2);border-radius:50%;transition:.2s}
.toggle input:checked+.slider{background:var(--accent);box-shadow:none}
.toggle input:checked+.slider::before{transform:translateX(20px);background:#fff}
.toggle input:focus-visible+.slider{outline:2px solid #3898ec;outline-offset:2px}
.server-options{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.server-btn{background:var(--canvas-alt);border:1px solid var(--border);border-radius:12px;padding:14px 16px;color:var(--ink-soft);text-align:left;cursor:pointer;transition:border-color .15s,background-color .15s}
.server-btn:hover{border-color:var(--border-2);background:var(--surface-2)}
.server-btn strong{display:block;color:var(--ink);font-size:15px;font-weight:500;margin-bottom:2px}
.server-btn span{display:block;color:var(--dim);font-size:13px}
.server-btn.active{border-color:var(--accent);background:rgba(255,146,148,.08)}
.server-btn.active strong{color:var(--accent-soft)}
.bm-list{list-style:none}
.bm-item{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 0;border-top:1px solid var(--border)}
.bm-item:first-child{border-top:none;padding-top:0}
.bm-item-info{flex:1;min-width:0}
.bm-label{color:var(--ink);font-size:15px;font-weight:500}
.bm-code-preview{font-family:var(--font-mono);font-size:11.5px;color:var(--faint);margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bm-del{background:none;border:1px solid var(--border-2);color:var(--muted);border-radius:10px;padding:6px 14px;font-size:13px;cursor:pointer;transition:border-color .15s,color .15s;flex-shrink:0}
.bm-del:hover{border-color:var(--err);color:var(--err)}
.add-form{margin-top:18px;padding-top:18px;border-top:1px solid var(--border)}
.input-group{margin-bottom:12px}
.input-group label{display:block;font-size:13px;font-weight:500;color:var(--dim);margin-bottom:6px}
.input-group input,.input-group textarea{width:100%;background:var(--canvas-alt);border:1px solid var(--border);border-radius:12px;padding:11px 14px;color:var(--ink);font-size:15px;outline:none;transition:border-color .15s}
.input-group input:focus,.input-group textarea:focus{border-color:var(--accent)}
.input-group input::placeholder,.input-group textarea::placeholder{color:var(--faint)}
.input-group textarea{resize:vertical;min-height:72px;font-family:var(--font-mono);font-size:12.5px}
.add-btn{width:100%;margin-top:4px}
.achievement-filter{display:flex;align-items:end;gap:10px}
.achievement-filter .input-group{flex:1;margin-bottom:0}
.filter-save{padding:11px 20px}
.status{font-size:13px;text-align:center;min-height:20px;margin-top:8px;transition:opacity .2s}
.status:empty{min-height:0;margin-top:0}
.status.ok{color:var(--ok)}
.status.err{color:var(--err)}
.empty{color:var(--faint);font-size:14px;text-align:center;padding:12px 0}
.count{font-weight:400;color:var(--faint)}
@media(max-width:560px){.card{padding:22px}}
@media(max-width:420px){.server-options{grid-template-columns:1fr}}
</style></head><body>
${topbar(`<a class="topbar-link" href="/sync?code=${token}">북마클릿 설치</a><a class="topbar-link on" href="/settings?code=${token}">설정</a>`)}
<main class="page">
<h1>설정</h1>
<div class="nav"><a class="back" href="/sync?code=${token}">\u2190 북마클릿 설치</a></div>
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
<div class="toggle-row">
<div class="toggle-info">
<div class="toggle-title" id="privTitle"></div>
<div class="toggle-desc" id="privDesc"></div>
</div>
<label class="toggle"><input type="checkbox" id="privToggle" onchange="togglePrivacy()"><span class="slider"></span></label>
</div>
<div class="status" id="privStatus"></div>
</div>
<div class="card">
<p class="section-label">곡 제목 한국어 번역</p>
<div class="toggle-row">
<div class="toggle-info">
<div class="toggle-title">일본어·한자 곡 번역 표시</div>
<div class="toggle-desc">제목이 일본어/한자로만 된 곡을 한국어 번역으로 표시합니다. 번역이 등록된 곡에만 적용됩니다.</div>
</div>
<label class="toggle"><input type="checkbox" id="transToggle" onchange="toggleTranslate()"><span class="slider"></span></label>
</div>
<div class="status" id="transStatus"></div>
</div>
<div class="card">
<p class="section-label">오늘의 성과 필터</p>
<div class="toggle-desc" style="margin-bottom:14px">이 기준 이상 오른 기록만 표시합니다. FC/FS 이상 플레이는 기준보다 낮아도 계속 표시됩니다.</div>
<div class="achievement-filter"><div class="input-group"><label for="achievementMin">최소 달성률 (%)</label><input id="achievementMin" type="number" min="0" max="101" step="0.0001" value="95.0000"></div><button class="btn btn-primary filter-save" id="achievementSave" onclick="saveAchievementFilter()">저장</button></div>
<div class="status" id="achievementStatus"></div>
</div>
<div class="card">
<p class="section-label">프리셋 북마클릿 <span class="count" id="presetCount"></span></p>
<ul class="bm-list" id="presetList"></ul>
<div class="status" id="presetStatus"></div>
</div>
<div class="card">
<p class="section-label">추가 북마클릿 <span class="count" id="bmCount"></span></p>
<ul class="bm-list" id="bmList"></ul>
<div class="add-form" id="addForm">
<div class="input-group"><label>이름</label><input type="text" id="bmName" placeholder="\uC608: \uC2A4\uCF54\uC5B4 \uD45C\uC2DC" maxlength="30"></div>
<div class="input-group"><label>코드</label><textarea id="bmCode" placeholder="javascript:..."></textarea></div>
<button class="btn btn-primary add-btn" id="addBtn" onclick="addBm()">\uCD94\uAC00</button>
<div class="status" id="bmStatus"></div>
</div>
</div>
</main>
${siteFooter()}
<script>
var TOKEN=${tokenJson};
var DATA=${dataJson};
var MAX_BM=5;

(function init(){
  renderDefaultServer();
  renderPrivacy();
  renderTranslate();
  loadAchievementFilter();
  renderPresetList();
  renderBmList();
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

function renderPrivacy(){
  var cb=document.getElementById('privToggle');
  var t=document.getElementById('privTitle');
  var d=document.getElementById('privDesc');
  cb.checked=!DATA.private;
  if(DATA.private){
    t.textContent='\uD83D\uDD12 \uBE44\uACF5\uAC1C';
    d.textContent='\uB2E4\uB978 \uC0AC\uB78C\uC774 \uB0B4 \uD504\uB85C\uD544/\uAC80\uC0C9/\uB808\uC774\uD305\uD45C\uB97C \uC870\uD68C\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.';
  } else {
    t.textContent='\uD83C\uDF10 \uACF5\uAC1C';
    d.textContent='\uB2E4\uB978 \uC0AC\uB78C\uC774 \uB0B4 \uD504\uB85C\uD544\uC744 \uC870\uD68C\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.';
  }
}

function renderBmList(){
  var list=document.getElementById('bmList');
  var countEl=document.getElementById('bmCount');
  countEl.textContent=DATA.bookmarklets.length+'/'+MAX_BM;
  if(DATA.bookmarklets.length===0){
    list.innerHTML='<li class="empty">\uB4F1\uB85D\uB41C \uCD94\uAC00 \uBD81\uB9C8\uD074\uB9BF\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</li>';
    return;
  }
  var html='';
  DATA.bookmarklets.forEach(function(bm,i){
    var label=esc(bm.label);
    var preview=esc(bm.code.length>55?bm.code.substring(0,55)+'...':bm.code);
    html+='<li class="bm-item"><div class="bm-item-info"><div class="bm-label">'+label+'</div><div class="bm-code-preview">'+preview+'</div></div><button class="bm-del" data-i="'+i+'">\uC0AD\uC81C</button></li>';
  });
  list.innerHTML=html;
  list.querySelectorAll('.bm-del').forEach(function(btn){
    btn.onclick=function(){deleteBm(parseInt(this.getAttribute('data-i'),10));};
  });
}

function renderTranslate(){
  document.getElementById('transToggle').checked=!!DATA.translate;
}

function toggleTranslate(){
  var cb=document.getElementById('transToggle');
  var want=cb.checked;
  fetch('/api/settings/translate?code='+TOKEN,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({translate:want})})
  .then(function(r){if(!r.ok)throw new Error(r.status);return r.json();})
  .then(function(){DATA.translate=want;showStatus('transStatus','ok','저장됨');})
  .catch(function(){cb.checked=!cb.checked;showStatus('transStatus','err','저장 실패');});
}

function togglePrivacy(){
  var cb=document.getElementById('privToggle');
  var wantPrivate=!cb.checked;
  fetch('/api/settings/privacy?code='+TOKEN,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({private:wantPrivate})})
  .then(function(r){if(!r.ok)throw new Error(r.status);return r.text();})
  .then(function(){
    DATA.private=wantPrivate;
    renderPrivacy();
    showStatus('privStatus','ok','\uC800\uC7A5\uB428');
  })
  .catch(function(){cb.checked=!cb.checked;showStatus('privStatus','err','\uC800\uC7A5 \uC2E4\uD328');});
}

function renderPresetList(){
  var list=document.getElementById('presetList');
  var countEl=document.getElementById('presetCount');
  var enabled=DATA.presets.filter(function(p){return p.enabled;}).length;
  countEl.textContent=enabled+'/'+DATA.presets.length;
  if(DATA.presets.length===0){list.innerHTML='<li class="empty">사용 가능한 프리셋이 없습니다.</li>';return;}
  var html='';
  DATA.presets.forEach(function(p){
    var code=esc(p.code.length>70?p.code.substring(0,70)+'...':p.code);
    html+='<li class="bm-item"><div class="bm-item-info"><div class="bm-label">'+esc(p.label)+'</div><div class="toggle-desc">'+esc(p.description)+'</div><div class="bm-code-preview">'+code+'</div></div><label class="toggle"><input type="checkbox" data-preset="'+esc(p.id)+'" '+(p.enabled?'checked':'')+'><span class="slider"></span></label></li>';
  });
  list.innerHTML=html;
  list.querySelectorAll('input[data-preset]').forEach(function(input){
    input.onchange=function(){togglePreset(this.getAttribute('data-preset'),this);};
  });
}

function togglePreset(id,cb){
  var enabled=cb.checked;
  fetch('/api/settings/preset?code='+TOKEN,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({presetId:id,enabled:enabled})})
  .then(function(r){if(!r.ok)throw new Error(r.status);return r.json();})
  .then(function(){
    var preset=DATA.presets.find(function(p){return p.id===id;});
    if(preset)preset.enabled=enabled;
    renderPresetList();
    showStatus('presetStatus','ok','저장됨');
  })
  .catch(function(){cb.checked=!cb.checked;showStatus('presetStatus','err','저장 실패');});
}

function addBm(){
  var nameEl=document.getElementById('bmName');
  var codeEl=document.getElementById('bmCode');
  var name=nameEl.value.trim();
  var code=codeEl.value.trim();
  if(!name||!code){showStatus('bmStatus','err','\uC774\uB984\uACFC \uCF54\uB4DC\uB97C \uBAA8\uB450 \uC785\uB825\uD574\uC8FC\uC138\uC694.');return;}
  if(!code.startsWith('javascript:')){showStatus('bmStatus','err','\uCF54\uB4DC\uB294 javascript: \uB85C \uC2DC\uC791\uD574\uC57C \uD569\uB2C8\uB2E4.');return;}
  var exists=DATA.bookmarklets.some(function(b){return b.label===name;});
  if(!exists&&DATA.bookmarklets.length>=MAX_BM){showStatus('bmStatus','err','\uCD5C\uB300 '+MAX_BM+'\uAC1C\uAE4C\uC9C0 \uB4F1\uB85D\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.');return;}
  document.getElementById('addBtn').disabled=true;
  fetch('/api/settings/bookmarklet?code='+TOKEN,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'add',label:name,code:code})})
  .then(function(r){if(!r.ok)return r.text().then(function(t){throw new Error(t);});return r.text();})
  .then(function(){
    var idx=DATA.bookmarklets.findIndex(function(b){return b.label===name;});
    if(idx>=0)DATA.bookmarklets[idx]={label:name,code:code};
    else DATA.bookmarklets.push({label:name,code:code});
    nameEl.value='';codeEl.value='';
    renderBmList();
    document.getElementById('addBtn').disabled=false;
    showStatus('bmStatus','ok','\uCD94\uAC00\uB428');
  })
  .catch(function(e){document.getElementById('addBtn').disabled=false;showStatus('bmStatus','err',e.message||'\uCD94\uAC00 \uC2E4\uD328');});
}

function deleteBm(idx){
  var bm=DATA.bookmarklets[idx];
  if(!bm)return;
  if(!confirm(bm.label+' \uBD81\uB9C8\uD074\uB9BF\uC744 \uC0AD\uC81C\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?'))return;
  fetch('/api/settings/bookmarklet?code='+TOKEN,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'delete',label:bm.label})})
  .then(function(r){if(!r.ok)throw new Error(r.status);return r.text();})
  .then(function(){
    DATA.bookmarklets.splice(idx,1);
    renderBmList();
    showStatus('bmStatus','ok','\uC0AD\uC81C\uB428');
  })
  .catch(function(){showStatus('bmStatus','err','\uC0AD\uC81C \uC2E4\uD328');});
}

function showStatus(id,cls,txt){
  var el=document.getElementById(id);el.className='status '+cls;el.textContent=txt;
  setTimeout(function(){el.style.opacity='0';setTimeout(function(){el.textContent='';el.className='status';el.style.opacity='1';},200);},2500);
}

function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
</script>
</body></html>`;
}
