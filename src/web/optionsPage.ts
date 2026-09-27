// 게임 설정 페이지(/options?code=TOKEN). 동기화 때 읽어 둔 현재 게임 옵션(user_options)과
// 옵션 프리셋(option_presets)을 보여 주고, 프리셋을 만들고·고치고·지운다.
// DX NET 에 실제로 적용하는 건 서버가 못 한다(세션 비보관) — 옵션 프리셋 북마클릿(/option.js)의 몫.
//
// 주의: 아래 <script> 는 TS 템플릿 리터럴 안이라 백틱·${ 를 쓰지 말고, 역슬래시 이스케이프
// (정규식의 \s 등)도 피한다(템플릿이 먼저 해석해 버린다).

import type { MaimaiServer, OptionPresetRow, OptionSnapshot } from "../storage/types";
import { BASE_CSS, pageHead, topbar, siteFooter, userNav } from "./theme";

export interface OptionsPageData {
  bookmarklet: string;
  snapshots: OptionSnapshot[];
  presets: OptionPresetRow[];
  max: number;
  defaultServer: MaimaiServer;
}

function escAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function optionsPage(token: string, data: OptionsPageData): string {
  const dataJson = JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
  return `<!DOCTYPE html><html lang="ko"><head>${pageHead("게임 설정 · 캐롤봇")}
<style>
${BASE_CSS}
.page{max-width:760px}
h1{font-size:clamp(36px,5vw,52px);font-weight:500;color:var(--ink);letter-spacing:-.01em;line-height:1.15;margin-bottom:12px}
.sub{font-size:15px;color:var(--muted);margin-bottom:32px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:26px 28px;margin-bottom:14px}
.card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px;flex-wrap:wrap}
.card-title{font-size:18px;font-weight:500;color:var(--ink)}
.card-meta{font-size:13px;color:var(--dim);margin-top:2px}
.seg{display:inline-flex;gap:4px;padding:4px;background:var(--canvas-alt);border:1px solid var(--border);border-radius:12px;margin-bottom:14px}
.seg button{background:transparent;border:0;color:var(--muted);border-radius:9px;padding:7px 16px;font-size:14px;font-weight:500;cursor:pointer}
.seg button.on{background:var(--surface-2);color:var(--ink);box-shadow:0 0 0 1px var(--border-2)}
.group{margin-top:18px}
.group:first-child{margin-top:0}
.group-title{font-size:13px;font-weight:500;color:var(--dim);margin-bottom:8px}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
.opt{display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--canvas-alt);border:1px solid var(--border);border-radius:10px;padding:9px 12px;min-width:0}
.opt-l{font-size:12.5px;color:var(--muted);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.opt-v{font-size:13.5px;color:var(--ink-2);font-weight:500;text-align:right;flex-shrink:0;max-width:55%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.opt.diff{border-color:rgba(255,146,148,.45)}
.opt.diff .opt-v{color:var(--accent-soft)}
.opt select{flex-shrink:0;max-width:58%;background:var(--surface);border:1px solid var(--border-2);border-radius:8px;color:var(--ink);font-size:13px;padding:5px 8px;outline:none}
.opt select:focus{border-color:var(--accent)}
.empty{color:var(--faint);font-size:14px;text-align:center;padding:18px 0;line-height:1.7}
.p-item{border-top:1px solid var(--border);padding:16px 0}
.p-item:first-child{border-top:0;padding-top:0}
.p-row{display:flex;align-items:center;gap:12px}
.p-info{flex:1;min-width:0}
.p-name{color:var(--ink);font-size:16px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.p-meta{font-size:13px;color:var(--dim);margin-top:2px}
.p-meta .d{color:var(--accent-soft)}
.p-actions{display:flex;gap:6px;flex-shrink:0}
.sm{background:none;border:1px solid var(--border-2);color:var(--muted);border-radius:10px;padding:6px 14px;font-size:13px;cursor:pointer;transition:border-color .15s,color .15s}
.sm:hover{border-color:var(--ink-soft);color:var(--ink)}
.sm.del:hover{border-color:var(--err);color:var(--err)}
.btn-sm{padding:8px 16px;font-size:14px}
.editor{margin-top:14px;padding:18px;background:var(--canvas);border:1px solid var(--border);border-radius:14px}
.editor .name{width:100%;background:var(--canvas-alt);border:1px solid var(--border);border-radius:12px;padding:11px 14px;color:var(--ink);font-size:15px;outline:none;margin-bottom:6px}
.editor .name:focus{border-color:var(--accent)}
.ed-note{font-size:12.5px;color:var(--dim);margin-bottom:14px}
.ed-foot{display:flex;align-items:center;gap:8px;margin-top:18px;flex-wrap:wrap}
.ed-foot .sp{flex:1}
.linkbtn{background:none;border:0;color:var(--accent-soft);font-size:13px;cursor:pointer;padding:0}
.ed-bar{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--dim);margin:0 0 12px}
.ed-bar.dirty{color:var(--warn)}
.ed-bar.dirty::before{content:'';width:8px;height:8px;border-radius:50%;background:var(--warn);flex-shrink:0}
.opt.dirty{box-shadow:inset 3px 0 0 var(--warn)}
.unsaved{color:var(--warn)}
.fold-head{cursor:pointer;user-select:none;margin-bottom:0}
.fold-head.open{margin-bottom:18px}
.chev{display:inline-block;transition:transform .15s}
.fold-head.open .chev{transform:rotate(180deg)}
.linkbtn:hover{color:var(--accent)}
.install{display:flex;gap:10px;flex-wrap:wrap}
.install .bm{cursor:grab}
.steps{margin:14px 0 0 20px;font-size:14px;color:var(--muted)}
.steps li{margin:4px 0}
.status{font-size:13px;min-height:0;margin-top:10px;text-align:center}
.status:empty{margin-top:0}
.status.ok{color:var(--ok)}
.status.err{color:var(--err)}
@media(max-width:620px){.grid{grid-template-columns:1fr}.card{padding:22px}.editor{padding:14px}}
</style></head><body>
${topbar(userNav(token, "options"))}
<main class="page">
<h1>게임 설정</h1>
<p class="sub">maimai DX NET 게임 옵션을 확인하고, 프리셋으로 만들어 두었다가 한 번에 바꿀 수 있습니다.</p>

<div id="segWrap"></div>

<div class="card">
  <div class="card-head fold-head" id="curHead"><div><div class="card-title">현재 설정</div><div class="card-meta" id="curMeta"></div></div>
  <button class="sm" id="curToggle" type="button"><span id="curToggleText">펼치기</span> <span class="chev">\u25BE</span></button></div>
  <div id="current" hidden></div>
</div>

<div class="card">
  <div class="card-head"><div><div class="card-title">프리셋</div><div class="card-meta" id="pMeta"></div></div>
  <button class="btn btn-primary btn-sm" id="newBtn" onclick="startNew()">+ 새 프리셋</button></div>
  <div id="presets"></div>
  <div class="status" id="pStatus"></div>
</div>

<div class="card">
  <div class="card-head"><div><div class="card-title">프리셋 적용하기</div><div class="card-meta">적용은 DX NET 에서 옵션 프리셋 북마클릿으로 합니다.</div></div></div>
  <div class="install"><a class="btn btn-primary bm" href="${escAttr(data.bookmarklet)}" onclick="return false">캐롤봇 옵션 프리셋</a><button class="btn btn-secondary" onclick="copyBm()">코드 복사</button></div>
  <ol class="steps">
    <li>위 버튼을 북마크바로 드래그합니다. 모바일은 코드를 복사해 북마크 주소에 붙여넣으세요.</li>
    <li>maimai DX NET 아무 페이지에서 북마클릿을 실행합니다.</li>
    <li>프리셋의 <b>적용</b>을 누르면 바뀌는 항목을 보여 주고, 확인하면 DX NET 옵션에 저장합니다.</li>
  </ol>
  <div class="status" id="bmStatus"></div>
</div>
</main>
${siteFooter()}
<script>
var TOKEN=${JSON.stringify(token)};
var D=${dataJson};
var GROUPS=[
  ['속도 · 타이밍',['noteSpeed','touchSpeed','slideSpeed','adjustTiming','judgeTiming']],
  ['플레이',['optionKind','trackSkip','mirrorMode','starRotate','brightness','touchEffect']],
  ['화면 표시',['dispCenter','outFrameType','dispJudge','dispJudgePos','dispJudgeTouchPos','dispChain','submonitorAchieve','dispRate','submonitorAppeal']],
  ['노트 디자인',['tapDesign','holdDesign','slideDesign','starType','outlineDesign']],
  ['사운드',['ansVolume','tapSe','criticalSe','tapHoldVolume','breakSe','breakVolume','exSe','exVolume','slideSe','slideVolume','breakSlideVolume','touchVolume','touchHoldVolume','damageSeVolume']]
];
var SERVER_NAME={intl:'INTERNATIONAL',jp:'JP'};
var view=pickServer();          // 보고 있는 서버(스냅샷 기준)
var editing=null;               // null | {id:number|null, name, server, values, orig:{name, values}}
var curOpen=false;              // 현재 설정 카드는 기본으로 접어 둔다

function pickServer(){
  var has=function(s){return D.snapshots.some(function(x){return x.server===s;});};
  if(has(D.defaultServer))return D.defaultServer;
  return D.snapshots.length?D.snapshots[0].server:D.defaultServer;
}
function snap(server){return D.snapshots.find(function(x){return x.server===server;})||null;}
function catalogFor(server){return snap(server)||D.snapshots[0]||null;}
function esc(s){return String(s).split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;').split('"').join('&quot;');}
function fmt(ts){var d=new Date(ts);function p(n){return String(n).padStart(2,'0');}return d.getFullYear()+'.'+p(d.getMonth()+1)+'.'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes());}
function optText(field,value){for(var i=0;i<field.options.length;i++){if(field.options[i][0]===value)return field.options[i][1];}return null;}

// 필드를 GROUPS 순서로 묶는다. 목록에 없는 새 항목은 '기타'로.
function grouped(fields){
  var byName={},used={},out=[];
  fields.forEach(function(f){byName[f.name]=f;});
  GROUPS.forEach(function(g){var list=g[1].filter(function(n){return byName[n];}).map(function(n){used[n]=1;return byName[n];});if(list.length)out.push([g[0],list]);});
  var rest=fields.filter(function(f){return !used[f.name];});
  if(rest.length)out.push(['기타',rest]);
  return out;
}

function diffCount(preset,s){
  if(!s)return null;
  var n=0;s.fields.forEach(function(f){if(Object.prototype.hasOwnProperty.call(preset.values,f.name)&&preset.values[f.name]!==f.value&&optText(f,preset.values[f.name])!==null)n++;});
  return n;
}

function renderSeg(){
  var w=document.getElementById('segWrap');
  if(D.snapshots.length<2){w.innerHTML='';return;}
  w.innerHTML='<div class="seg">'+['intl','jp'].filter(function(s){return snap(s);}).map(function(s){return '<button class="'+(s===view?'on':'')+'" data-s="'+s+'">'+SERVER_NAME[s]+'</button>';}).join('')+'</div>';
  w.querySelectorAll('button').forEach(function(b){b.onclick=function(){view=this.getAttribute('data-s');render();};});
}

function renderCurrent(){
  var s=snap(view),el=document.getElementById('current'),meta=document.getElementById('curMeta');
  document.getElementById('curHead').className='card-head fold-head'+(curOpen?' open':'');
  document.getElementById('curToggleText').textContent=curOpen?'접기':'펼치기';
  el.hidden=!curOpen;
  if(!s){
    meta.textContent='아직 가져온 설정이 없습니다';
    el.innerHTML='<div class="empty">아직 가져온 게임 설정이 없습니다.<br>프로필 북마클릿으로 동기화하거나, 옵션 프리셋 북마클릿을 DX NET 에서 한 번 실행하면 여기에 표시됩니다.</div>';
    return;
  }
  meta.textContent=SERVER_NAME[s.server]+' · '+fmt(s.syncedAt)+' 기준 · '+s.fields.length+'개 항목';
  el.innerHTML=grouped(s.fields).map(function(g){
    return '<div class="group"><div class="group-title">'+esc(g[0])+'</div><div class="grid">'+g[1].map(function(f){
      return '<div class="opt" title="'+esc(f.desc||f.label)+'"><span class="opt-l">'+esc(f.label)+'</span><span class="opt-v">'+esc(optText(f,f.value)||f.value)+'</span></div>';
    }).join('')+'</div></div>';
  }).join('');
}

function renderPresets(){
  document.getElementById('pMeta').textContent=D.presets.length+'/'+D.max+'개';
  var nb=document.getElementById('newBtn');
  nb.disabled=D.presets.length>=D.max||!catalogFor(view)||(editing&&editing.id===null);
  var el=document.getElementById('presets'),html='';
  if(editing&&editing.id===null)html+='<div class="p-item">'+editorHtml()+'</div>';
  if(!D.presets.length&&!(editing&&editing.id===null)){
    el.innerHTML='<div class="empty">저장된 프리셋이 없습니다.'+(catalogFor(view)?' <b>+ 새 프리셋</b>으로 지금 설정을 저장해 보세요.':'')+'</div>';
    return;
  }
  D.presets.forEach(function(p){
    var n=diffCount(p,snap(view));
    var d=n===null?'':(n?' · <span class="d">현재와 '+n+'개 다름</span>':' · 현재와 같음');
    var tag=editing&&editing.id===p.id?'<span id="dirtyTag"></span>':'';
    html+='<div class="p-item"><div class="p-row"><div class="p-info"><div class="p-name">'+esc(p.name)+'</div><div class="p-meta">'+SERVER_NAME[p.server]+' · '+fmt(p.updatedAt)+d+tag+'</div></div>'
      +'<div class="p-actions"><button class="sm" data-edit="'+p.id+'">'+(editing&&editing.id===p.id?'닫기':'편집')+'</button><button class="sm del" data-del="'+p.id+'">삭제</button></div></div>';
    if(editing&&editing.id===p.id)html+=editorHtml();
    html+='</div>';
  });
  el.innerHTML=html;
  el.querySelectorAll('[data-edit]').forEach(function(b){b.onclick=function(){var id=Number(this.getAttribute('data-edit'));if(!confirmDiscard())return;if(editing&&editing.id===id)editing=null;else startEdit(id);render();};});
  el.querySelectorAll('[data-del]').forEach(function(b){b.onclick=function(){del(Number(this.getAttribute('data-del')));};});
  bindEditor();
}

function editorHtml(){
  var cat=catalogFor(editing.server),cur=snap(editing.server);
  var dirty=dirtyInfo();
  var h='<div class="editor"><div class="ed-bar" id="edBar"></div><input class="name" id="edName" maxlength="30" placeholder="프리셋 이름 (예: 평소, 연습용)" value="'+esc(editing.name)+'">';
  if(!cat){
    h+='<div class="ed-note">동기화된 설정이 없어 이름만 바꿀 수 있습니다. 프로필 북마클릿으로 동기화하면 항목도 편집할 수 있어요.</div>';
  } else {
    h+='<div class="ed-note">'+(cur?'현재 설정과 다른 항목은 분홍 테두리로, 저장하지 않고 바꾼 항목은 왼쪽 노란 막대로 표시됩니다. ':'저장하지 않고 바꾼 항목은 왼쪽 노란 막대로 표시됩니다. ')+'선택지는 '+SERVER_NAME[cat.server]+' 계정에서 고를 수 있는 값입니다.'+(cur?' <button class="linkbtn" id="edFill">현재 설정으로 채우기</button>':'')+'</div>';
    h+=grouped(cat.fields).map(function(g){
      return '<div class="group"><div class="group-title">'+esc(g[0])+'</div><div class="grid">'+g[1].map(function(f){
        var v=Object.prototype.hasOwnProperty.call(editing.values,f.name)?editing.values[f.name]:f.value;
        var known=optText(f,v)!==null;
        var curF=cur?cur.fields.find(function(x){return x.name===f.name;}):null;
        var isDiff=curF&&curF.value!==v;
        return '<label class="opt'+(isDiff?' diff':'')+(dirty.fields[f.name]?' dirty':'')+'" title="'+esc(f.desc||f.label)+'"><span class="opt-l">'+esc(f.label)+'</span><select data-f="'+esc(f.name)+'">'
          +(known?'':'<option value="'+esc(v)+'" selected>(알 수 없는 값 '+esc(v)+')</option>')
          +f.options.map(function(o){return '<option value="'+esc(o[0])+'"'+(o[0]===v?' selected':'')+'>'+esc(o[1])+'</option>';}).join('')
          +'</select></label>';
      }).join('')+'</div></div>';
    }).join('');
  }
  h+='<div class="ed-foot"><span class="sp"></span><button class="btn btn-secondary btn-sm" id="edCancel">취소</button><button class="btn btn-primary btn-sm" id="edSave">저장</button></div></div>';
  return h;
}

function bindEditor(){
  if(!editing)return;
  var nm=document.getElementById('edName');if(!nm)return;
  nm.oninput=function(){editing.name=nm.value;updateDirty();};
  document.querySelectorAll('.editor select[data-f]').forEach(function(s){s.onchange=function(){editing.values[s.getAttribute('data-f')]=s.value;renderPresets();};});
  var fill=document.getElementById('edFill');
  if(fill)fill.onclick=function(){var cur=snap(editing.server);cur.fields.forEach(function(f){editing.values[f.name]=f.value;});renderPresets();};
  document.getElementById('edCancel').onclick=function(){if(!confirmDiscard())return;editing=null;render();};
  document.getElementById('edSave').onclick=save;
  updateDirty();
  if(editing.id===null&&!editing.focused){editing.focused=true;nm.focus();}
}

function copyValues(v){var o={};Object.keys(v).forEach(function(k){o[k]=v[k];});return o;}
function startNew(){
  var cat=catalogFor(view);if(!cat||!confirmDiscard())return;
  var values={};cat.fields.forEach(function(f){values[f.name]=f.value;});
  editing={id:null,name:'',server:cat.server,values:values,orig:{name:'',values:copyValues(values)}};
  render();
}
function startEdit(id){
  var p=D.presets.find(function(x){return x.id===id;});if(!p)return;
  editing={id:id,name:p.name,server:p.server,values:copyValues(p.values),orig:{name:p.name,values:copyValues(p.values)}};
}

// 편집 중인 값이 마지막으로 저장된 값과 얼마나 다른지. 새 프리셋은 저장 전이라 항상 미저장이다.
function dirtyInfo(){
  var out={isNew:false,name:false,fields:{},count:0,any:false};
  if(!editing)return out;
  var o=editing.orig;
  Object.keys(editing.values).forEach(function(k){if(editing.values[k]!==o.values[k]){out.fields[k]=1;out.count++;}});
  out.name=(editing.name||'').trim()!==o.name;
  out.isNew=editing.id===null;
  out.any=out.isNew||out.name||out.count>0;
  return out;
}
function updateDirty(){
  var bar=document.getElementById('edBar');if(!bar)return;
  var d=dirtyInfo(),parts=[];
  if(d.count)parts.push('항목 '+d.count+'개');
  if(d.name&&!d.isNew)parts.push('이름');
  bar.className='ed-bar'+(d.any?' dirty':'');
  bar.textContent=d.isNew?'아직 저장하지 않은 새 프리셋입니다.':(d.any?'저장되지 않은 변경사항이 있습니다 ('+parts.join(', ')+')':'저장된 내용과 같습니다.');
  var tag=document.getElementById('dirtyTag');
  if(tag)tag.innerHTML=d.any?' · <span class="unsaved">저장 안 됨</span>':'';
  var sv=document.getElementById('edSave');if(sv)sv.disabled=!d.any;
}
function confirmDiscard(){
  if(!dirtyInfo().any||(editing.id===null&&!(editing.name||'').trim()&&!dirtyInfo().count))return true;
  return confirm('저장하지 않은 변경사항이 있습니다. 변경사항을 버릴까요?');
}
window.addEventListener('beforeunload',function(e){
  var d=dirtyInfo();
  if(d.any&&!(d.isNew&&!(editing.name||'').trim()&&!d.count)){e.preventDefault();e.returnValue='';}
});
function toggleCurrent(){curOpen=!curOpen;renderCurrent();}
document.getElementById('curHead').onclick=toggleCurrent;

function save(){
  var name=(editing.name||'').trim();
  if(!name){status('pStatus','err','프리셋 이름을 입력해주세요.');return;}
  var cat=catalogFor(editing.server),labels={},values={};
  var orig=editing.id===null?null:D.presets.find(function(x){return x.id===editing.id;});
  Object.keys(editing.values).forEach(function(k){
    var v=editing.values[k];values[k]=v;
    var f=cat?cat.fields.find(function(x){return x.name===k;}):null;
    var t=f?optText(f,v):null;
    if(f&&t!==null)labels[k]=[f.label,t];else if(orig&&orig.labels[k])labels[k]=orig.labels[k];
  });
  var btn=document.getElementById('edSave');btn.disabled=true;
  fetch('/api/option-presets?code='+TOKEN,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:editing.id,name:name,server:editing.server,values:values,labels:labels})})
  .then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error==='duplicate'?'같은 이름의 프리셋이 이미 있습니다.':j.error==='limit'?'프리셋은 최대 '+D.max+'개까지 저장할 수 있습니다.':j.error==='expired'?'링크가 만료됐습니다. Discord 에서 /설정 을 다시 실행해주세요.':'저장 실패');return j;});})
  .then(function(j){
    var i=D.presets.findIndex(function(x){return x.id===j.preset.id;});
    if(i>=0)D.presets[i]=j.preset;else D.presets.push(j.preset);
    editing=null;render();status('pStatus','ok','"'+j.preset.name+'" 저장됨');
  })
  .catch(function(e){btn.disabled=false;status('pStatus','err',e.message||'저장 실패');});
}

function del(id){
  var p=D.presets.find(function(x){return x.id===id;});
  if(!p||!confirm(p.name+' 프리셋을 삭제하시겠습니까?'))return;
  fetch('/api/option-presets/delete?code='+TOKEN,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:id})})
  .then(function(r){if(!r.ok)throw new Error(r.status);return r.json();})
  .then(function(){D.presets=D.presets.filter(function(x){return x.id!==id;});if(editing&&editing.id===id)editing=null;render();status('pStatus','ok','삭제됨');})
  .catch(function(){status('pStatus','err','삭제 실패');});
}

function copyBm(){
  var code=D.bookmarklet;
  function done(ok){status('bmStatus',ok?'ok':'err',ok?'코드를 복사했습니다':'복사하지 못했습니다. 버튼을 길게 눌러 주소를 복사하세요');}
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(code).then(function(){done(true);},fallback);}else fallback();
  function fallback(){var ta=document.createElement('textarea');ta.value=code;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();var ok=false;try{ok=document.execCommand('copy');}catch(e){}document.body.removeChild(ta);done(ok);}
}

var stTimer={};
function status(id,cls,txt){var el=document.getElementById(id);el.className='status '+cls;el.textContent=txt;clearTimeout(stTimer[id]);stTimer[id]=setTimeout(function(){el.textContent='';el.className='status';},3000);}

function render(){renderSeg();renderCurrent();renderPresets();}
render();
</script>
</body></html>`;
}
