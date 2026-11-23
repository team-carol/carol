// 아티스트 별명·한국어 번역 관리(/관리 → 아티스트 별명). 곡 별명 페이지(aliasAdminPage.ts)와 같은 두 칸 구성.
// 별명은 /검색(검색어·자동완성)에서 아티스트로 곡을 찾을 때 쓰이고, 번역으로 지정한 별명은 /설정 "아티스트명 번역"을 켠 사용자에게 이름 대신 보인다.
import type { ArtistInfo } from "../constants";
import type { ArtistAliasRow } from "../storage/types";
import { BASE_CSS, ADMIN_CSS, ADMIN_BADGE, pageHead, topbar, adminTabs } from "./theme";

function embed(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function artistAliasAdminPage(token: string, artists: ArtistInfo[], aliases: ArtistAliasRow[]): string {
  return `<!DOCTYPE html><html lang="ko"><head>${pageHead("아티스트 별명 관리 · 캐롤봇")}
<style>
${BASE_CSS}
${ADMIN_CSS}
.page{max-width:960px}
.grid{display:flex;gap:1px;background:var(--crl-border);height:640px;border:1px solid var(--crl-border);border-radius:var(--crl-radius-card);overflow:hidden}
.col{background:var(--crl-surface);display:flex;flex-direction:column;min-width:0}
.left{width:350px;flex-shrink:0}
.right{flex:1}
.head{padding:12px;border-bottom:1px solid var(--crl-border);display:flex;flex-direction:column;gap:8px}
.row{display:flex;gap:8px;align-items:center}
.toggle{border:0;color:var(--crl-muted);font-size:12.5px;font-weight:500;cursor:pointer;white-space:nowrap}
.toggle:hover{color:var(--crl-ink)}
.toggle.on{background:color-mix(in srgb,var(--crl-accent) 14%,transparent);color:var(--crl-accent-soft);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--crl-accent) 45%,transparent)}
select.crl-input{width:auto;margin-left:auto;cursor:pointer;font-weight:500;font-size:13px}
.list{overflow-y:auto;flex:1}
.empty{padding:24px 12px;font-size:13px;color:var(--crl-faint);text-align:center}
.item{padding:10px 14px;border-bottom:1px solid var(--crl-border);cursor:pointer;border-left:2px solid transparent;transition:background-color .1s}
.item:hover{background:var(--crl-surface-2)}
.item.sel{background:color-mix(in srgb,var(--crl-accent) 8%,transparent);border-left-color:var(--crl-accent)}
.item .t{display:flex;align-items:center;gap:6px}
.item .crl-tag{flex-shrink:0}
.name1{font-size:13.5px;color:var(--crl-ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.meta{display:flex;gap:6px;margin-top:2px}
.meta span{font-size:11.5px;color:var(--crl-dim)}
.rhead{padding:14px 18px;border-bottom:1px solid var(--crl-border)}
.rhead .lbl{font-size:12px;color:var(--crl-dim);margin-bottom:3px}
.rhead .name{font-size:15px;font-weight:500;color:var(--crl-ink);word-break:break-all}
.rhead .songs{font-size:12px;color:var(--crl-dim);margin-top:6px;line-height:1.5;word-break:break-all}
.aliases{flex:1;overflow-y:auto;padding:6px 0}
.alias{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 18px;border-bottom:1px solid var(--crl-border)}
.alias.istr{background:color-mix(in srgb,var(--crl-success) 6%,transparent)}
.alias .v{font-size:14px;color:var(--crl-ink-2);word-break:break-all;min-width:0}
.alias .crl-tag{margin-left:6px;vertical-align:middle}
.arow{display:flex;gap:6px;flex-shrink:0}
.arow .crl-btn{padding:3px 11px;font-size:12px;border-radius:var(--crl-radius-small)}
.tr:hover:not(:disabled){color:var(--crl-success);box-shadow:0 0 0 1px var(--crl-success-border)}
.tr.on{background:var(--crl-success-bg);color:var(--crl-success);box-shadow:0 0 0 1px var(--crl-success-border)}
.addbar{padding:12px 18px;border-top:1px solid var(--crl-border)}
.err{font-size:12px;color:var(--crl-danger);margin-bottom:6px;min-height:0}
.addrow{display:flex;gap:8px}
.addrow .crl-input{flex:1}
.add{flex-shrink:0}
.placeholder{flex:1;display:flex;align-items:center;justify-content:center;font-size:14px;color:var(--crl-faint)}
@media(max-width:680px){.grid{flex-direction:column;height:auto}.left{width:100%}.list{max-height:280px}.aliases{max-height:240px}}
</style></head><body>
${topbar(ADMIN_BADGE)}
<main class="page">
${adminTabs(token, "artists")}
<h1 class="crl-heading-2 page-title">아티스트 별명 관리</h1>
<p class="admin-sub">/검색에서 아티스트로 곡을 찾을 때 쓰이는 별명과 한국어 번역 이름을 관리합니다. 번역으로 지정한 별명은 /설정에서 아티스트명 번역을 켠 사용자에게 원래 이름 대신 보입니다.</p>
<div class="grid">
  <div class="col left">
    <div class="head">
      <input class="crl-input" id="q" placeholder="아티스트·곡 검색">
      <div class="row">
        <button class="crl-chip toggle" id="noTr">번역 없는 아티스트만</button>
        <select class="crl-input" id="sort">
          <option value="name">이름순</option>
          <option value="songs">곡 많은순</option>
          <option value="aliasCount">별명 많은순</option>
        </select>
      </div>
    </div>
    <div class="list" id="list"></div>
  </div>
  <div class="col right" id="rightPane">
    <div class="placeholder">왼쪽에서 아티스트를 선택하세요</div>
  </div>
</div>
</main>
<script>
const TOKEN = ${embed(token)};
const ARTISTS = ${embed(artists)};
let ALIASES = ${embed(aliases)};
let selected = null, noTr = false, sortKey = "name";
const $ = (id) => document.getElementById(id);
const api = (path) => '/api/admin/artists' + path + '?code=' + encodeURIComponent(TOKEN);

function countMap(){ const m = new Map(); for(const a of ALIASES) m.set(a.artist,(m.get(a.artist)||0)+1); return m; }
function translatedSet(){ const s = new Set(); for(const a of ALIASES) if(a.isTranslation) s.add(a.artist); return s; }

function renderList(){
  const cm = countMap(), trSet = translatedSet();
  const q = $("q").value.trim().toLowerCase();
  let list = ARTISTS.filter(x => (!noTr || !trSet.has(x.artist))
    && (!q || x.artist.toLowerCase().includes(q) || x.songs.some(t => t.toLowerCase().includes(q)) || ALIASES.some(a => a.artist === x.artist && a.alias.toLowerCase().includes(q))));
  list = list.slice().sort((a,b)=>{
    if(sortKey==="songs"){ const d=b.songs.length-a.songs.length; return d||a.artist.localeCompare(b.artist); }
    if(sortKey==="aliasCount"){ const d=(cm.get(b.artist)||0)-(cm.get(a.artist)||0); return d||a.artist.localeCompare(b.artist); }
    return a.artist.localeCompare(b.artist);
  });
  const el = $("list");
  if(!list.length){ el.innerHTML='<div class="empty">검색 결과 없음</div>'; return; }
  el.innerHTML = list.map(x=>{
    const c = cm.get(x.artist)||0;
    const tr = ALIASES.find(a => a.artist === x.artist && a.isTranslation);
    const meta = ['<span>곡 '+x.songs.length+'개</span>'];
    if(c>0) meta.push('<span>별명 '+c+'개</span>');
    if(tr) meta.push('<span>→ '+esc(tr.alias)+'</span>');
    return '<div class="item'+(selected===x.artist?' sel':'')+'" data-a="'+esc(x.artist)+'">'
      +'<div class="t">'+(tr?'<span class="crl-tag crl-tag--success">번역</span>':'')+'<span class="name1">'+esc(x.artist)+'</span></div>'
      +'<div class="meta">'+meta.join('')+'</div></div>';
  }).join('');
  el.querySelectorAll('.item').forEach(n=>n.onclick=()=>{ selected=n.dataset.a; renderList(); renderRight(); });
}

function renderRight(){
  const pane = $("rightPane");
  if(selected===null){ pane.innerHTML='<div class="placeholder">왼쪽에서 아티스트를 선택하세요</div>'; return; }
  const info = ARTISTS.find(x => x.artist === selected);
  const songs = info ? info.songs : [];
  const mine = ALIASES.filter(a=>a.artist===selected);
  const items = mine.length
    ? mine.map(a=>'<div class="alias'+(a.isTranslation?' istr':'')+'"><span class="v">'+esc(a.alias)+(a.isTranslation?' <span class="crl-tag crl-tag--success">번역</span>':'')+'</span>'
        +'<div class="arow">'
        +'<button class="crl-btn crl-btn--secondary tr'+(a.isTranslation?' on':'')+'" data-id="'+a.id+'" data-on="'+(a.isTranslation?'0':'1')+'">'+(a.isTranslation?'번역 해제':'번역 지정')+'</button>'
        +'<button class="crl-btn crl-btn--secondary crl-btn--danger del" data-id="'+a.id+'">삭제</button>'
        +'</div></div>').join('')
    : '<div class="empty">등록된 별명이 없습니다</div>';
  const shown = songs.slice(0, 8).map(esc).join(' · ') + (songs.length > 8 ? ' 외 ' + (songs.length - 8) + '곡' : '');
  pane.innerHTML =
    '<div class="rhead"><div class="lbl">선택된 아티스트</div><div class="name">'+esc(selected)+'</div>'
    +(shown?'<div class="songs">'+shown+'</div>':'')+'</div>'
    +'<div class="aliases">'+items+'</div>'
    +'<div class="addbar"><div class="err" id="err"></div><div class="addrow">'
    +'<input class="crl-input" id="newAlias" placeholder="새 별명 입력"><button class="crl-btn crl-btn--primary add" id="addBtn" disabled>추가</button>'
    +'</div></div>';
  pane.querySelectorAll('.del').forEach(n=>n.onclick=()=>del(parseInt(n.dataset.id,10)));
  pane.querySelectorAll('.tr').forEach(n=>n.onclick=()=>setTranslation(parseInt(n.dataset.id,10), n.dataset.on==='1'));
  const inp = $("newAlias"), btn = $("addBtn");
  inp.oninput = ()=>{ btn.disabled = !inp.value.trim(); };
  inp.onkeydown = (e)=>{ if(e.key==="Enter") add(); };
  btn.onclick = add;
  inp.focus();
}

async function post(path, body){
  const res = await fetch(api(path), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  return res.json();
}

async function add(){
  const inp = $("newAlias"); const alias = inp.value.trim();
  if(selected===null || !alias) return;
  $("err").textContent="";
  try{
    const data = await post('', { artist: selected, alias });
    if(!data.ok){ $("err").textContent = data.error || '오류가 발생했습니다'; return; }
    ALIASES.push(data.alias);
    renderList(); renderRight();
  }catch{ $("err").textContent='요청 실패'; }
}

async function del(id){
  try{
    if((await post('/delete', { id })).ok){ ALIASES = ALIASES.filter(a=>a.id!==id); renderList(); renderRight(); }
  }catch{}
}

async function setTranslation(id, on){
  try{
    if(!(await post('/translation', { id, on })).ok) return;
    // 아티스트당 1개: 지정하면 같은 아티스트의 다른 별명은 해제
    for(const a of ALIASES){ if(a.artist===selected) a.isTranslation=false; }
    if(on){ const t=ALIASES.find(a=>a.id===id); if(t) t.isTranslation=true; }
    renderList(); renderRight();
  }catch{}
}

function esc(s){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

$("q").oninput = renderList;
$("sort").onchange = (e)=>{ sortKey=e.target.value; renderList(); };
$("noTr").onclick = ()=>{ noTr=!noTr; $("noTr").classList.toggle('on',noTr); renderList(); };
renderList();
</script></body></html>`;
}
