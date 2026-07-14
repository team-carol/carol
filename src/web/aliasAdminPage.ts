import type { AliasSongInfo } from "../constants";
import type { SongAliasRow } from "../storage/types";

// 임베드용 JSON 직렬화 (</script> 이스케이프)
function embed(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function aliasAdminPage(token: string, songs: AliasSongInfo[], aliases: SongAliasRow[]): string {
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>곡 별명 관리 - carolbot</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',system-ui,-apple-system,sans-serif;background:#0d0d0d;color:#ccc;font-size:16px;line-height:1.5;-webkit-font-smoothing:antialiased;display:flex;justify-content:center;min-height:100vh;padding:48px 24px}
.wrap{width:100%;max-width:820px}
.mono{font-family:ui-monospace,'JetBrains Mono',monospace;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#777;margin-bottom:6px}
h1{font-size:24px;font-weight:800;color:#fff;letter-spacing:-.02em;margin-bottom:24px}
.grid{display:flex;gap:1px;background:#2a2a2a;height:620px;border:1px solid #2a2a2a;border-radius:12px;overflow:hidden}
.col{background:#141414;display:flex;flex-direction:column;min-width:0}
.left{width:340px;flex-shrink:0}
.right{flex:1}
.head{padding:10px 12px;border-bottom:1px solid #2a2a2a;display:flex;flex-direction:column;gap:8px}
input,select{padding:8px 10px;background:#1a1a1a;border:1px solid #2a2a2a;color:#eee;font-size:13px;font-family:inherit;outline:none;border-radius:6px;width:100%}
input:focus,select:focus{border-color:#9333ea}
.row{display:flex;gap:8px;align-items:center}
.toggle{padding:6px 10px;background:none;border:1px solid #2a2a2a;color:#888;font-family:inherit;font-size:11px;font-weight:700;cursor:pointer;border-radius:6px;white-space:nowrap}
.toggle.on{background:#9333ea;border-color:#9333ea;color:#fff}
select{width:auto;margin-left:auto;cursor:pointer;font-weight:600;font-size:12px}
.list{overflow-y:auto;flex:1}
.empty{padding:24px 12px;font-size:12px;color:#666;text-align:center}
.song{padding:9px 12px;border-bottom:1px solid #202020;cursor:pointer;border-left:2px solid transparent}
.song:hover{background:#1a1a1a}
.song.sel{background:#1c1424;border-left-color:#9333ea}
.song .t{display:flex;align-items:center;gap:6px}
.badge{font-size:9px;font-weight:800;color:#fff;background:#e53e3e;padding:1px 4px;border-radius:3px;flex-shrink:0}
.title{font-size:12px;color:#e5e5e5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.meta{display:flex;gap:6px;margin-top:2px}
.meta span{font-size:10px;color:#777}
.rhead{padding:12px 16px;border-bottom:1px solid #2a2a2a}
.rhead .lbl{font-size:10px;color:#777;margin-bottom:3px}
.rhead .name{font-size:13px;font-weight:700;color:#fff;word-break:break-all}
.aliases{flex:1;overflow-y:auto;padding:6px 0}
.alias{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 16px;border-bottom:1px solid #202020}
.alias.istr{background:#141c17}
.alias .v{font-size:13px;color:#e5e5e5;word-break:break-all;min-width:0}
.trbadge{font-size:9px;font-weight:800;color:#0d0d0d;background:#34d399;padding:1px 5px;border-radius:3px;margin-left:6px;vertical-align:middle}
.kobadge{font-size:9px;font-weight:800;color:#0d0d0d;background:#34d399;padding:1px 4px;border-radius:3px;flex-shrink:0}
.arow{display:flex;gap:6px;flex-shrink:0}
.tr{padding:2px 10px;background:none;border:1px solid #2a2a2a;color:#999;font-family:inherit;font-size:11px;cursor:pointer;border-radius:5px}
.tr:hover{border-color:#34d399;color:#34d399}
.tr.on{background:#34d399;border-color:#34d399;color:#0d0d0d;font-weight:700}
.del{padding:2px 10px;background:none;border:1px solid #2a2a2a;color:#999;font-family:inherit;font-size:11px;cursor:pointer;border-radius:5px}
.del:hover{border-color:#e53e3e;color:#e53e3e}
.addbar{padding:12px 16px;border-top:1px solid #2a2a2a}
.err{font-size:11px;color:#e53e3e;margin-bottom:6px;min-height:0}
.addrow{display:flex;gap:8px}
.addrow input{flex:1}
.add{padding:8px 16px;background:#9333ea;color:#fff;border:none;font-family:inherit;font-weight:700;font-size:12px;cursor:pointer;border-radius:6px;flex-shrink:0}
.add:disabled{opacity:.4;cursor:default}
.placeholder{flex:1;display:flex;align-items:center;justify-content:center;font-size:13px;color:#666}
@media(max-width:640px){.grid{flex-direction:column;height:auto}.left{width:100%}.list{max-height:260px}.aliases{max-height:220px}}
</style></head><body>
<div class="wrap">
<p class="mono">carolbot · admin</p>
<h1>곡 별명 관리</h1>
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
</div>
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
    +'<input id="newAlias" placeholder="새 별명 입력"><button class="add" id="addBtn" disabled>추가</button>'
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
