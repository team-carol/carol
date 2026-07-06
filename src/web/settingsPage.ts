import type { ExtraBookmarklet, MaimaiServer } from "../db";
import { BOOKMARKLET_PRESETS } from "./bookmarklet";

export function settingsPage(token: string, isPrivate: boolean, enabledPresetIds: string[], bookmarklets: ExtraBookmarklet[], defaultServer: MaimaiServer): string {
  const presets = BOOKMARKLET_PRESETS.map((preset) => ({ ...preset, enabled: enabledPresetIds.includes(preset.id) }));
  const dataJson = JSON.stringify({ private: isPrivate, presets, bookmarklets, defaultServer })
    .replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
  const tokenJson = JSON.stringify(token);

  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>설정 - carolbot</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',system-ui,-apple-system,sans-serif;background:#0d0d0d;color:#ccc;font-size:16px;line-height:1.5;-webkit-font-smoothing:antialiased;display:flex;justify-content:center;min-height:100vh;padding:80px 24px}
.wrap{width:100%;max-width:600px}
h1{font-size:48px;font-weight:700;color:#fff;letter-spacing:-0.5px;margin-bottom:24px;line-height:1.1}
.mono{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;letter-spacing:.5px;text-transform:uppercase;color:#888;margin-bottom:12px}
.nav{margin-bottom:32px}
.nav a{color:#c084fc;font-size:14px;text-decoration:none;transition:opacity .15s}
.nav a:hover{opacity:.8}
.card{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:16px;padding:28px;margin-bottom:16px}
.section-label{font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.5px;text-transform:uppercase;color:#888;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between}
.toggle-row{display:flex;align-items:center;justify-content:space-between;gap:16px}
.toggle-info{flex:1}
.toggle-title{color:#fff;font-size:15px;font-weight:600;margin-bottom:4px}
.toggle-desc{font-size:13px;color:#666;line-height:1.4}
.toggle{position:relative;width:48px;height:26px;flex-shrink:0}
.toggle input{opacity:0;width:0;height:0;position:absolute}
.toggle .slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:#333;border-radius:26px;transition:.2s}
.toggle .slider::before{content:'';position:absolute;height:20px;width:20px;left:3px;bottom:3px;background:#fff;border-radius:50%;transition:.2s}
.toggle input:checked+.slider{background:#9333ea}
.toggle input:checked+.slider::before{transform:translateX(22px)}
.server-options{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.server-btn{background:#111;border:1px solid #2a2a2a;border-radius:8px;padding:12px 14px;color:#ccc;font-family:inherit;text-align:left;cursor:pointer;transition:all .15s}
.server-btn strong{display:block;color:#fff;font-size:14px;margin-bottom:2px}
.server-btn span{display:block;color:#666;font-size:12px}
.server-btn.active{border-color:#9333ea;background:#20142f;box-shadow:inset 0 0 0 1px rgba(147,51,234,.35)}
.bm-list{list-style:none}
.bm-item{display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid #252525}
.bm-item:last-child{border-bottom:none}
.bm-item-info{flex:1;min-width:0}
.bm-label{color:#fff;font-size:14px;font-weight:500}
.bm-code-preview{font-family:'JetBrains Mono',monospace;font-size:11px;color:#555;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bm-del{background:none;border:1px solid #333;color:#888;border-radius:6px;padding:5px 12px;font-family:inherit;font-size:12px;cursor:pointer;transition:all .15s;flex-shrink:0;margin-left:12px}
.bm-del:hover{border-color:#f87171;color:#f87171}
.add-form{margin-top:16px;padding-top:16px;border-top:1px solid #252525}
.input-group{margin-bottom:12px}
.input-group label{display:block;font-size:11px;color:#888;margin-bottom:6px;font-family:'JetBrains Mono',monospace;letter-spacing:.5px;text-transform:uppercase}
.input-group input,.input-group textarea{width:100%;background:#111;border:1px solid #2a2a2a;border-radius:8px;padding:10px 14px;color:#fff;font-family:inherit;font-size:14px;outline:none;transition:border-color .15s}
.input-group input:focus,.input-group textarea:focus{border-color:#9333ea}
.input-group textarea{resize:vertical;min-height:64px;font-family:'JetBrains Mono',monospace;font-size:12px}
.add-btn{width:100%;background:#9333ea;color:#fff;border:none;border-radius:8px;padding:12px 24px;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;transition:opacity .15s}
.add-btn:active{opacity:.8}
.add-btn:disabled{opacity:.4;cursor:not-allowed}
.status{font-size:13px;text-align:center;min-height:20px;margin-top:8px;transition:opacity .2s}
.status.ok{color:#4ade80}
.status.err{color:#f87171}
.empty{color:#555;font-size:14px;text-align:center;padding:12px 0}
.count{font-weight:400;color:#555}
a{color:#c084fc}
@media(max-width:500px){h1{font-size:36px}body{padding:48px 16px}.card{padding:20px}}
@media(max-width:420px){.server-options{grid-template-columns:1fr}}
</style></head><body>
<div class="wrap">
<p class="mono">carolbot</p>
<h1>설정</h1>
<div class="nav"><a href="/sync?code=${token}">\u2190 북마클릿 설치</a></div>
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
<button class="add-btn" id="addBtn" onclick="addBm()">\uCD94\uAC00</button>
<div class="status" id="bmStatus"></div>
</div>
</div>
</div>
<script>
var TOKEN=${tokenJson};
var DATA=${dataJson};
var MAX_BM=5;

(function init(){
  renderDefaultServer();
  renderPrivacy();
  renderPresetList();
  renderBmList();
})();

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
