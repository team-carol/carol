// /관리 의 "패치노트" 탭(/admin/patch-notes?code=token). 패치노트를 작성·게시하면
// 등록 사용자가 그 뒤 처음 쓰는 명령에 본인만 보이게 1회 표시된다(src/patchNotes.ts).
// 다른 관리 탭과 같은 룩앤필(theme.ts)을 따른다.

import type { PatchNoteRow } from "../storage/types";
import { BASE_CSS, ADMIN_CSS, ADMIN_BADGE, pageHead, topbar, adminTabs } from "./theme";
import { PATCH_NOTE_BODY_MAX, PATCH_NOTE_WINDOW_MS } from "../patchNotes";

export function patchNotesAdminPage(token: string, notes: PatchNoteRow[], version: string): string {
  const data = JSON.stringify({ token, notes, version, max: PATCH_NOTE_BODY_MAX, windowDays: Math.round(PATCH_NOTE_WINDOW_MS / 86400000) })
    .replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
  return `<!DOCTYPE html><html lang="ko"><head>${pageHead("패치노트 · 캐롤봇")}
<style>
${BASE_CSS}
${ADMIN_CSS}
.card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:22px 24px;margin-bottom:14px}
.ed-title{font-size:17px;font-weight:500;color:var(--ink);margin-bottom:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.dirty{font-size:12.5px;font-weight:500;color:var(--warn)}
.row2{display:grid;grid-template-columns:140px 1fr;gap:10px;margin-bottom:10px}
.field label{display:block;font-size:12.5px;font-weight:500;color:var(--dim);margin-bottom:5px}
.field input,.field textarea{width:100%;background:var(--canvas-alt);border:1px solid var(--border);border-radius:12px;padding:10px 13px;color:var(--ink);font-size:14.5px;outline:none;transition:border-color .15s}
.field input:focus,.field textarea:focus{border-color:var(--accent)}
.field input::placeholder,.field textarea::placeholder{color:var(--faint)}
.field textarea{min-height:220px;resize:vertical;line-height:1.6;font-family:var(--font-sans)}
.hint{display:flex;justify-content:space-between;gap:12px;font-size:12px;color:var(--dim);margin-top:5px}
.hint .over{color:var(--err)}
.pv-label{font-size:12.5px;font-weight:500;color:var(--dim);margin:16px 0 6px}
.pv{background:#2b2d31;border-radius:6px;border-left:4px solid #ff9294;padding:10px 14px 12px;font-family:"gg sans","Noto Sans KR",var(--font-sans);color:#dbdee1;font-size:14px;line-height:1.45}
.pv-t{font-weight:700;color:#f2f3f5;font-size:15px;margin-bottom:6px}
.pv-b{white-space:normal;word-break:break-word}
.pv-b h1{font-size:19px;margin:6px 0 4px;color:#f2f3f5}.pv-b h2{font-size:17px;margin:6px 0 4px;color:#f2f3f5}.pv-b h3{font-size:15px;margin:6px 0 4px;color:#f2f3f5}
.pv-b ul{margin:2px 0 2px 20px}.pv-b li{margin:1px 0}
.pv-b code{background:#1e1f22;color:#dbdee1;border-radius:4px;padding:1px 4px;font-size:.85em}
.pv-b blockquote{border-left:3px solid #4e5058;padding-left:10px;margin:2px 0}
.pv-b .sub{font-size:12px;color:#949ba4}
.pv-b a{color:#00a8fc}
.pv-f{font-size:12px;color:#949ba4;margin-top:8px}
.acts{display:flex;gap:8px;align-items:center;margin-top:16px;flex-wrap:wrap}
.acts .sp{flex:1}
.acts .btn{padding:9px 18px;font-size:14px}
.st{font-size:13px;color:var(--dim)}.st.ok{color:var(--ok)}.st.err{color:var(--err)}
.list-title{font-size:13px;font-weight:500;color:var(--dim);margin:26px 0 10px}
.note{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:16px 18px;margin-bottom:10px}
.note.editing{border-color:rgba(255,146,148,.55)}
.n-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.badge{font-size:11.5px;font-weight:600;border-radius:999px;padding:2px 9px}
.badge.pub{background:rgba(74,222,128,.14);color:var(--ok)}
.badge.draft{background:var(--surface-2);color:var(--muted)}
.badge.old{background:var(--surface-2);color:var(--faint)}
.n-name{flex:1;min-width:0;color:var(--ink);font-size:15.5px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.n-meta{font-size:12.5px;color:var(--dim);margin-top:4px}
.n-body{font-size:13px;color:var(--muted);margin-top:6px;white-space:pre-wrap;max-height:3.2em;overflow:hidden}
.n-acts{display:flex;gap:6px;flex-shrink:0}
.sm{background:none;border:1px solid var(--border-2);color:var(--muted);border-radius:10px;padding:5px 12px;font-size:13px;cursor:pointer;transition:border-color .15s,color .15s}
.sm:hover{border-color:var(--ink-soft);color:var(--ink)}
.sm.del:hover{border-color:var(--err);color:var(--err)}
.empty{color:var(--faint);font-size:14px;text-align:center;padding:18px 0}
@media(max-width:560px){.row2{grid-template-columns:1fr}.card{padding:18px}}
</style></head><body>
${topbar(ADMIN_BADGE)}
<main class="page">
  ${adminTabs(token, "patch-notes")}
  <h1 class="admin-title">패치노트</h1>
  <p class="admin-sub" id="sub"></p>
  <div class="card" id="editor"></div>
  <div class="list-title" id="listTitle"></div>
  <div id="list"></div>
</main>
<script>var D=${data};</script>
<script>${PATCH_ADMIN_JS}</script>
</body></html>`;
}

// 규칙: String.raw 라 역슬래시는 그대로 나간다. 백틱과 달러-중괄호는 쓰지 말 것.
const PATCH_ADMIN_JS = String.raw`
(function(){
  var $=function(id){return document.getElementById(id);};
  var DAY=86400000;
  var ed=blank();          // 편집 중인 노트 {id, version, title, body}
  var saved=snapshotOf(ed); // 마지막으로 저장된 상태(미저장 표시용)
  $('sub').textContent='게시한 패치노트는 그 뒤 처음 명령어를 쓰는 등록 사용자에게 본인만 보이게 한 번 표시됩니다. 게시한 지 '+D.windowDays+'일이 지나면 더 이상 표시되지 않습니다.';

  function blank(){return {id:null,version:D.version||'',title:'',body:''};}
  function snapshotOf(n){return JSON.stringify([n.version,n.title,n.body]);}
  function isDirty(){return snapshotOf(ed)!==saved;}
  function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function fmt(ts){var d=new Date(ts);function p(n){return String(n).padStart(2,'0');}return d.getFullYear()+'.'+p(d.getMonth()+1)+'.'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes());}
  function cur(){return ed.id===null?null:D.notes.find(function(n){return n.id===ed.id;})||null;}
  function defaultTitle(v){return v?'📢 캐롤봇 '+v+' 업데이트':'📢 캐롤봇 업데이트';}

  // Discord 마크다운의 자주 쓰는 부분만 흉내 낸 미리보기.
  function inline(s){
    return s.replace(/\x60([^\x60]+)\x60/g,'<code>$1</code>')
      .replace(/\*\*(.+?)\*\*/g,'<b>$1</b>')
      .replace(/__(.+?)__/g,'<u>$1</u>')
      .replace(/~~(.+?)~~/g,'<s>$1</s>')
      .replace(/(^|[^*])\*([^*\s][^*]*?)\*/g,'$1<i>$2</i>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,'<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  }
  function md(text){
    var out=[],list=false;
    esc(text).split('\n').forEach(function(line){
      var m;
      if((m=line.match(/^\s*[-*] (.*)$/))&&!/^-# /.test(line)){if(!list){out.push('<ul>');list=true;}out.push('<li>'+inline(m[1])+'</li>');return;}
      if(list){out.push('</ul>');list=false;}
      if((m=line.match(/^(#{1,3}) (.*)$/)))out.push('<h'+m[1].length+'>'+inline(m[2])+'</h'+m[1].length+'>');
      else if((m=line.match(/^-# (.*)$/)))out.push('<div class="sub">'+inline(m[1])+'</div>');
      else if((m=line.match(/^&gt; ?(.*)$/)))out.push('<blockquote>'+inline(m[1])+'</blockquote>');
      else out.push(line?inline(line)+'<br>':'<br>');
    });
    if(list)out.push('</ul>');
    return out.join('');
  }

  function renderEditor(){
    var c=cur(),pub=c&&c.publishedAt>0;
    var h='<div class="ed-title">'+(ed.id===null?'새 패치노트':'패치노트 편집')+'<span class="dirty" id="dirty"></span></div>'
      +'<div class="row2"><div class="field"><label>버전</label><input id="fVer" maxlength="30" placeholder="예: 1.10.0"></div>'
      +'<div class="field"><label>제목</label><input id="fTitle" maxlength="200"></div></div>'
      +'<div class="field"><label>본문 (Discord 마크다운)</label><textarea id="fBody" placeholder="예:\n## 새 기능\n- /게임설정 명령어가 추가되었습니다."></textarea>'
      +'<div class="hint"><span>**굵게**, *기울임*, - 목록, ## 제목, [링크](https://…) 를 쓸 수 있습니다.</span><span id="cnt"></span></div></div>'
      +'<div class="pv-label">미리보기</div><div class="pv"><div class="pv-t" id="pvT"></div><div class="pv-b" id="pvB"></div><div class="pv-f">이 안내는 한 번만 표시됩니다.</div></div>'
      +'<div class="acts">'+(ed.id!==null?'<button class="btn btn-secondary" id="bNew">새로 작성</button>':'')+'<span class="st" id="st"></span><span class="sp"></span>'
      +(pub?'<button class="btn btn-primary" id="bSave">저장</button>'
           :'<button class="btn btn-secondary" id="bSave">초안 저장</button><button class="btn btn-primary" id="bPub">게시</button>')
      +'</div>';
    $('editor').innerHTML=h;
    $('fVer').value=ed.version;$('fTitle').value=ed.title;$('fBody').value=ed.body;
    ['fVer','fTitle','fBody'].forEach(function(id){$(id).oninput=function(){ed.version=$('fVer').value;ed.title=$('fTitle').value;ed.body=$('fBody').value;updateLive();};});
    $('bSave').onclick=function(){save(false);};
    if($('bPub'))$('bPub').onclick=function(){save(true);};
    if($('bNew'))$('bNew').onclick=function(){if(!confirmDiscard())return;ed=blank();saved=snapshotOf(ed);render();};
    updateLive();
  }

  function updateLive(){
    $('fTitle').placeholder='비워 두면 "'+defaultTitle(ed.version.trim())+'"';
    $('pvT').textContent=ed.title.trim()||defaultTitle(ed.version.trim());
    $('pvB').innerHTML=ed.body.trim()?md(ed.body.trim()):'<span style="color:#949ba4">본문을 입력하면 여기에 미리보기가 표시됩니다.</span>';
    var n=ed.body.trim().length;
    $('cnt').innerHTML='<span class="'+(n>D.max?'over':'')+'">'+n+' / '+D.max+'</span>';
    var dirty=isDirty()&&(ed.id!==null||ed.body.trim()||ed.title.trim());
    $('dirty').textContent=dirty?'● 저장되지 않은 변경사항이 있습니다':'';
    var c=cur(); if(c&&c.publishedAt>0) $('bSave').disabled=!isDirty();
  }

  function renderList(){
    $('listTitle').textContent='작성한 패치노트 '+D.notes.length+'개';
    if(!D.notes.length){$('list').innerHTML='<div class="empty">아직 작성한 패치노트가 없습니다.</div>';return;}
    var now=Date.now();
    $('list').innerHTML=D.notes.map(function(n){
      var pub=n.publishedAt>0, expired=pub&&now-n.publishedAt>D.windowDays*DAY;
      var badge=pub?(expired?'<span class="badge old">표시 기간 끝남</span>':'<span class="badge pub">게시됨</span>'):'<span class="badge draft">초안</span>';
      var meta=pub?fmt(n.publishedAt)+' 게시 · '+n.seen+'명에게 표시됨':fmt(n.updatedAt)+' 저장';
      return '<div class="note'+(ed.id===n.id?' editing':'')+'"><div class="n-top">'+badge+'<div class="n-name">'+esc(n.title||defaultTitle(n.version))+'</div>'
        +'<div class="n-acts"><button class="sm" data-edit="'+n.id+'">편집</button>'
        +(pub?'<button class="sm" data-pub="'+n.id+'" data-v="0">게시 취소</button>':'<button class="sm" data-pub="'+n.id+'" data-v="1">게시</button>')
        +'<button class="sm del" data-del="'+n.id+'">삭제</button></div></div>'
        +'<div class="n-meta">'+(n.version?'v'+esc(n.version)+' · ':'')+meta+'</div><div class="n-body">'+esc(n.body)+'</div></div>';
    }).join('');
    document.querySelectorAll('[data-edit]').forEach(function(b){b.onclick=function(){
      var n=D.notes.find(function(x){return x.id===Number(b.getAttribute('data-edit'));});
      if(!n||!confirmDiscard())return;
      ed={id:n.id,version:n.version,title:n.title,body:n.body};saved=snapshotOf(ed);render();window.scrollTo(0,0);
    };});
    document.querySelectorAll('[data-pub]').forEach(function(b){b.onclick=function(){
      var on=b.getAttribute('data-v')==='1', n=D.notes.find(function(x){return x.id===Number(b.getAttribute('data-pub'));});
      var q=on?'게시할까요? 등록 사용자가 다음 명령어를 쓸 때 표시됩니다. 전에 게시했다가 취소한 노트라면, 이미 본 사용자에게도 다시 표시됩니다.':'게시를 취소할까요? 아직 보지 않은 사용자에게는 더 이상 표시되지 않습니다.';
      if(!confirm(q))return;
      api('/api/admin/patch-notes/publish',{id:n.id,publish:on},on?'게시했습니다':'게시를 취소했습니다');
    };});
    document.querySelectorAll('[data-del]').forEach(function(b){b.onclick=function(){
      var id=Number(b.getAttribute('data-del'));
      if(!confirm('이 패치노트를 삭제할까요?'))return;
      api('/api/admin/patch-notes/delete',{id:id},'삭제했습니다',function(){if(ed.id===id){ed=blank();saved=snapshotOf(ed);}});
    };});
  }

  function status(cls,t){var s=$('st');if(!s)return;s.className='st '+cls;s.textContent=t;clearTimeout(status.t);status.t=setTimeout(function(){s.textContent='';},3000);}

  function api(path,body,okText,after){
    return fetch(path+'?code='+encodeURIComponent(D.token),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      .then(function(r){return r.json().then(function(j){if(!r.ok||!j.ok)throw new Error(j.error||('HTTP '+r.status));return j;});})
      .then(function(j){D.notes=j.notes;if(after)after(j);render();status('ok',okText);return j;})
      .catch(function(e){status('err',e.message==='expired'?'관리 링크가 만료됐습니다. /관리 로 다시 여세요.':(e.message||'실패'));});
  }

  function save(publish){
    if(!ed.body.trim()){status('err','본문을 입력해주세요.');return;}
    if(ed.body.trim().length>D.max){status('err','본문은 '+D.max+'자까지 쓸 수 있습니다.');return;}
    if(publish&&!confirm('게시할까요? 등록 사용자가 다음 명령어를 쓸 때 본인에게만 한 번 표시됩니다.'))return;
    api('/api/admin/patch-notes',{id:ed.id,version:ed.version,title:ed.title,body:ed.body,publish:publish},publish?'게시했습니다':'저장했습니다',function(j){
      ed={id:j.note.id,version:j.note.version,title:j.note.title,body:j.note.body};saved=snapshotOf(ed);
    });
  }

  function confirmDiscard(){
    if(!isDirty()||(ed.id===null&&!ed.body.trim()&&!ed.title.trim()))return true;
    return confirm('저장하지 않은 변경사항이 있습니다. 변경사항을 버릴까요?');
  }
  window.addEventListener('beforeunload',function(e){if(isDirty()&&(ed.id!==null||ed.body.trim()||ed.title.trim())){e.preventDefault();e.returnValue='';}});

  function render(){renderEditor();renderList();}
  render();
})();
`;
