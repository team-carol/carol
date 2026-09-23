import type { AliasSongInfo } from "../constants";
import type { SongAliasRow } from "../storage/types";
import { BASE_CSS, ADMIN_CSS, ADMIN_BADGE, pageHead, topbar, adminTabs } from "./theme";

// 임베드용 JSON 직렬화 (</script> 이스케이프)
function embed(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function aliasAdminPage(token: string, songs: AliasSongInfo[], aliases: SongAliasRow[]): string {
  return `<!DOCTYPE html><html lang="ko"><head>${pageHead("곡 별명 관리 · 캐롤봇")}
<style>
${BASE_CSS}
${ADMIN_CSS}
.page{max-width:960px}
.grid{display:flex;gap:1px;background:var(--border);height:640px;border:1px solid var(--border);border-radius:16px;overflow:hidden}
.col{background:var(--surface);display:flex;flex-direction:column;min-width:0}
.left{width:350px;flex-shrink:0}
.right{flex:1}
.head{padding:12px;border-bottom:1px solid var(--border);display:flex;flex-direction:column;gap:8px}
input,select{padding:9px 12px;background:var(--canvas-alt);border:1px solid var(--border);color:var(--ink);font-size:14px;outline:none;border-radius:10px;width:100%;transition:border-color .15s}
input::placeholder{color:var(--faint)}
input:focus,select:focus{border-color:var(--accent)}
.row{display:flex;gap:8px;align-items:center}
.toggle{padding:7px 12px;background:var(--surface-2);border:0;color:var(--muted);font-size:12.5px;font-weight:500;cursor:pointer;border-radius:24px;white-space:nowrap;transition:background-color .15s,color .15s}
.toggle:hover{color:var(--ink)}
.toggle.on{background:rgba(255,146,148,.14);color:var(--accent-soft);box-shadow:inset 0 0 0 1px rgba(255,146,148,.45)}
select{width:auto;margin-left:auto;cursor:pointer;font-weight:500;font-size:13px}
.list{overflow-y:auto;flex:1}
.empty{padding:24px 12px;font-size:13px;color:var(--faint);text-align:center}
.song{padding:10px 14px;border-bottom:1px solid var(--border);cursor:pointer;border-left:2px solid transparent;transition:background-color .1s}
.song:hover{background:var(--surface-2)}
.song.sel{background:rgba(255,146,148,.08);border-left-color:var(--accent)}
.song .t{display:flex;align-items:center;gap:6px}
.badge{font-size:10px;font-weight:700;color:#fff;background:#e53e3e;padding:1px 5px;border-radius:4px;flex-shrink:0}
.title{font-size:13.5px;color:var(--ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.meta{display:flex;gap:6px;margin-top:2px}
.meta span{font-size:11.5px;color:var(--dim)}
.rhead{padding:14px 18px;border-bottom:1px solid var(--border)}
.rhead .lbl{font-size:12px;color:var(--dim);margin-bottom:3px}
.rhead .name{font-size:15px;font-weight:500;color:var(--ink);word-break:break-all}
.aliases{flex:1;overflow-y:auto;padding:6px 0}
.alias{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 18px;border-bottom:1px solid var(--border)}
.alias.istr{background:rgba(52,211,153,.06)}
.alias .v{font-size:14px;color:var(--ink-2);word-break:break-all;min-width:0}
.trbadge{font-size:10px;font-weight:700;color:var(--canvas);background:#34d399;padding:1px 6px;border-radius:4px;margin-left:6px;vertical-align:middle}
.kobadge{font-size:10px;font-weight:700;color:var(--canvas);background:#34d399;padding:1px 5px;border-radius:4px;flex-shrink:0}
.arow{display:flex;gap:6px;flex-shrink:0}
.tr,.del{padding:3px 11px;background:none;border:1px solid var(--border-2);color:var(--muted);font-size:12px;cursor:pointer;border-radius:8px;transition:border-color .15s,color .15s}
.tr:hover{border-color:#34d399;color:#34d399}
.tr.on{background:#34d399;border-color:#34d399;color:var(--canvas);font-weight:600}
.del:hover{border-color:var(--err);color:var(--err)}
.addbar{padding:12px 18px;border-top:1px solid var(--border)}
.err{font-size:12px;color:var(--err);margin-bottom:6px;min-height:0}
.addrow{display:flex;gap:8px}
.addrow input{flex:1}
.add{padding:9px 18px;font-size:14px;flex-shrink:0}
.placeholder{flex:1;display:flex;align-items:center;justify-content:center;font-size:14px;color:var(--faint)}
@media(max-width:680px){.grid{flex-direction:column;height:auto}.left{width:100%}.list{max-height:280px}.aliases{max-height:240px}}
</style></head><body>
${topbar(ADMIN_BADGE)}
<main class="page">
${adminTabs(token, "aliases")}
<h1 class="admin-title">곡 별명 관리</h1>
<p class="admin-sub">곡 검색에 쓰이는 별명과 한국어 번역 제목을 관리합니다.</p>
<div class="grid">
  <div class="col left">
    <div class="head">
      <input id="q" placeholder="곡 검색">
      <div class="row">
        <button class="toggle" id="jpOnly">JP 전용곡만 (<span id="jpCount">0</span>)</button>
        <select id="sort">
          <option value="title">이름순</option>
          <option value="aliasCount">별명 많은순</option>
          <option value="aliasCountAsc">별명 적은순</option>
          <option value="version">최신 버전순</option>
        </select>
      </div>
    </div>
    <div class="list" id="songList"></div>
  </div>
  <div class="col right" id="rightPane">
    <div class="placeholder">왼쪽에서 곡을 선택하세요</div>
  </div>
</div>
</main>
<script>
const TOKEN = ${embed(token)};
const SONGS = ${embed(songs)};
let ALIASES = ${embed(aliases)};
let selected = null, jpOnly = false, sortKey = "title";

const $ = (id) => document.getElementById(id);

function countMap(){ const m = new Map(); for(const a of ALIASES) m.set(a.title,(m.get(a.title)||0)+1); return m; }
function translatedSet(){ const s = new Set(); for(const a of ALIASES) if(a.isTranslation) s.add(a.title); return s; }

function renderSongs(){
  const cm = countMap();
  const trSet = translatedSet();
  const q = $("q").value.trim().toLowerCase();
  let list = SONGS.filter(s => (!jpOnly || s.region === "jp") && (!q || s.title.toLowerCase().includes(q)));
  list = list.slice().sort((a,b)=>{
    if(sortKey==="aliasCount"){ const d=(cm.get(b.title)||0)-(cm.get(a.title)||0); return d||a.title.localeCompare(b.title); }
    if(sortKey==="aliasCountAsc"){ const d=(cm.get(a.title)||0)-(cm.get(b.title)||0); return d||a.title.localeCompare(b.title); }
    if(sortKey==="version"){ const d=b.version-a.version; return d||a.title.localeCompare(b.title); }
    return a.title.localeCompare(b.title);
  });
  const el = $("songList");
  if(!list.length){ el.innerHTML='<div class="empty">검색 결과 없음</div>'; return; }
  el.innerHTML = list.map(s=>{
    const c = cm.get(s.title)||0;
    const badge = s.region==="jp" ? '<span class="badge">JP</span>' : '';
    const trMark = trSet.has(s.title) ? '<span class="kobadge">번역</span>' : '';
    const meta = [];
    if(sortKey==="version" && s.versionName) meta.push('<span>'+esc(s.versionName)+'</span>');
    if(c>0) meta.push('<span>별명 '+c+'개</span>');
    return '<div class="song'+(selected===s.title?' sel':'')+'" data-t="'+esc(s.title)+'">'
      +'<div class="t">'+badge+trMark+'<span class="title">'+esc(s.title)+'</span></div>'
      +(meta.length?'<div class="meta">'+meta.join('')+'</div>':'')+'</div>';
  }).join('');
  el.querySelectorAll('.song').forEach(n=>n.onclick=()=>{ selected=n.dataset.t; renderSongs(); renderRight(); });
}

function renderRight(){
  const pane = $("rightPane");
  if(!selected){ pane.innerHTML='<div class="placeholder">왼쪽에서 곡을 선택하세요</div>'; return; }
  const mine = ALIASES.filter(a=>a.title===selected);
  const items = mine.length
    ? mine.map(a=>'<div class="alias'+(a.isTranslation?' istr':'')+'"><span class="v">'+esc(a.alias)+(a.isTranslation?' <span class="trbadge">번역</span>':'')+'</span>'
        +'<div class="arow">'
        +'<button class="tr'+(a.isTranslation?' on':'')+'" data-id="'+a.id+'" data-on="'+(a.isTranslation?'0':'1')+'">'+(a.isTranslation?'번역 해제':'번역 지정')+'</button>'
        +'<button class="del" data-id="'+a.id+'">삭제</button>'
        +'</div></div>').join('')
    : '<div class="empty">등록된 별명이 없습니다</div>';
  pane.innerHTML =
    '<div class="rhead"><div class="lbl">선택된 곡</div><div class="name">'+esc(selected)+'</div></div>'
    +'<div class="aliases">'+items+'</div>'
    +'<div class="addbar"><div class="err" id="err"></div><div class="addrow">'
    +'<input id="newAlias" placeholder="새 별명 입력"><button class="btn btn-primary add" id="addBtn" disabled>추가</button>'
    +'</div></div>';
  pane.querySelectorAll('.del').forEach(n=>n.onclick=()=>del(parseInt(n.dataset.id,10)));
  pane.querySelectorAll('.tr').forEach(n=>n.onclick=()=>setTranslation(parseInt(n.dataset.id,10), n.dataset.on==='1'));
  const inp = $("newAlias"), btn = $("addBtn");
  inp.oninput = ()=>{ btn.disabled = !inp.value.trim(); };
  inp.onkeydown = (e)=>{ if(e.key==="Enter") add(); };
  btn.onclick = add;
  inp.focus();
}

async function add(){
  const inp = $("newAlias"); const alias = inp.value.trim();
  if(!selected || !alias) return;
  $("err").textContent="";
  try{
    const res = await fetch('/api/admin/aliases?code='+encodeURIComponent(TOKEN),{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ title: selected, alias })
    });
    const data = await res.json();
    if(!data.ok){ $("err").textContent = data.error || '오류가 발생했습니다'; return; }
    ALIASES.push(data.alias);
    renderSongs(); renderRight();
  }catch{ $("err").textContent='요청 실패'; }
}

async function del(id){
  try{
    const res = await fetch('/api/admin/aliases/delete?code='+encodeURIComponent(TOKEN),{
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id })
    });
    if((await res.json()).ok){ ALIASES = ALIASES.filter(a=>a.id!==id); renderSongs(); renderRight(); }
  }catch{}
}

async function setTranslation(id, on){
  try{
    const res = await fetch('/api/admin/aliases/translation?code='+encodeURIComponent(TOKEN),{
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id, on })
    });
    if(!(await res.json()).ok) return;
    // 곡당 1개: 지정 시 같은 곡의 다른 별명 지정 해제
    for(const a of ALIASES){ if(a.title===selected) a.isTranslation=false; }
    if(on){ const t=ALIASES.find(a=>a.id===id); if(t) t.isTranslation=true; }
    renderSongs(); renderRight();
  }catch{}
}

function esc(s){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

$("q").oninput = renderSongs;
$("sort").onchange = (e)=>{ sortKey=e.target.value; renderSongs(); };
$("jpOnly").onclick = ()=>{ jpOnly=!jpOnly; $("jpOnly").classList.toggle('on',jpOnly); renderSongs(); };
$("jpCount").textContent = SONGS.filter(s=>s.region==="jp").length;
renderSongs();
</script></body></html>`;
}
