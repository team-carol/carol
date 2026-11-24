// 슬래시 명령어 이름·설명·옵션 이름·옵션 순서·옵션 설명 관리 페이지(/관리 → 명령어). 저장한 값은 "디스코드에 반영" 또는 봇 재시작 때 올라간다.
// 디자인 토큰은 theme.ts(캐롤봇 랜딩 디자인 시스템)를 따른다.

import { BASE_CSS, ADMIN_CSS, ADMIN_BADGE, pageHead, topbar, adminTabs } from "./theme";

/** name: 코드의 원래 이름(키), shownName: 디스코드에 보일 이름(바꾸지 않았으면 name). */
export interface CommandOptionVM { name: string; shownName: string; type: string; required: boolean; defDescription: string; description: string }
export interface CommandRowVM {
  key: string;
  defName: string;
  name: string;
  defDescription: string;
  description: string;
  options: CommandOptionVM[];
  /** 지금 순서(옵션 이름) */
  order: string[];
  changed: boolean;
}

export function commandsAdminPage(token: string, rows: CommandRowVM[], botRunning: boolean): string {
  return `<!DOCTYPE html><html lang="ko"><head>${pageHead("명령어 · 캐롤봇")}
<style>
${BASE_CSS}
${ADMIN_CSS}
.bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px}
#q{flex:1;width:auto;min-width:180px;font-size:15px}
.note{font-size:13px;color:var(--crl-dim);line-height:1.6;margin:0 0 18px}
.page .card{padding:14px 16px;margin-bottom:10px}
.head{display:flex;gap:8px;align-items:baseline;justify-content:space-between;flex-wrap:wrap}
.key{font-size:12px;color:var(--crl-faint)}
.field{display:flex;gap:8px;align-items:center;margin-top:8px}
.field label{width:46px;flex-shrink:0;font-size:12.5px;color:var(--crl-dim)}
.field .crl-input{flex:1;min-width:0}
.opts{margin-top:10px;border-top:1px solid var(--crl-border);padding-top:8px}
.opt{display:flex;gap:6px;align-items:center;padding:4px 0}
.opt .crl-input.onm{width:120px;flex:0 0 120px}
.opt .ty{font-size:11px;color:var(--crl-faint);width:60px;flex-shrink:0}
.opt .req{font-size:11px;color:var(--crl-accent)}
.opt .crl-input{flex:1;min-width:0;padding:6px 9px;font-size:13px}
.mv{background:var(--crl-surface-2);border:1px solid var(--crl-border);color:var(--crl-muted);border-radius:var(--crl-radius-small);width:28px;height:28px;cursor:pointer;flex-shrink:0}
.mv:disabled{opacity:.35;cursor:default}
.acts{display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap}
@media (max-width:560px){.opt{flex-wrap:wrap}.opt .od{flex-basis:100%}}
</style></head><body>
${topbar(ADMIN_BADGE)}
<main class="page">
${adminTabs(token, "commands")}
<h1 class="crl-heading-2 page-title">명령어</h1>
<p class="admin-sub">슬래시 명령어의 이름·설명·옵션 이름·옵션 순서·옵션 설명을 바꿉니다. 저장한 뒤 <b>디스코드에 반영</b>을 누르거나 봇을 다시 시작하면 디스코드에 올라갑니다.</p>
<p class="note">· 디스코드 명령 목록은 이름 순으로 보여서 명령어끼리의 순서는 정할 수 없습니다. 이름을 바꾸면 목록 위치도 바뀝니다.<br>· 옵션 이름을 바꿔도 봇은 원래 이름으로 알아듣습니다(하위 명령 안의 옵션 이름은 바꿀 수 없습니다). 필수 옵션은 디스코드 규칙상 늘 앞에 옵니다.<br>· 다른 문구에 적힌 명령어·옵션 이름(예: <code>/마이시프트 연동 아이디:</code>)은 <b>봇 문구</b> 탭에서 같이 고쳐 주세요.</p>
<div class="bar">
<input class="crl-input" id="q" placeholder="명령어 검색">
<button class="crl-btn crl-btn--primary" id="sync"${botRunning ? "" : " disabled"}>디스코드에 반영</button>
<span class="st" id="syncst">${botRunning ? "" : "봇이 실행 중이 아니라 다음 시작 때 반영됩니다"}</span>
</div>
<div id="list"></div>
</main>
<script>
const TOKEN=${JSON.stringify(token)};
const ROWS=${JSON.stringify(rows).replace(/</g, "\\u003c")};
const $=id=>document.getElementById(id);
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function optRow(r,name,k,n){
  const o=r.options.find(x=>x.name===name);
  if(!o)return ''; // 모르는 옵션 한 줄 때문에 목록 전체가 안 그려지지 않게
  return '<div class="opt" data-n="'+esc(name)+'"><button class="mv up"'+(k===0?' disabled':'')+'>↑</button><button class="mv down"'+(k===n-1?' disabled':'')+'>↓</button>'
    +'<input class="crl-input onm" maxlength="32" value="'+esc(o.shownName)+'" placeholder="'+esc(name)+'" title="원래 이름: '+esc(name)+'"><span class="ty">'+esc(o.type)+(o.required?' <span class="req">필수</span>':'')+'</span>'
    +'<input class="crl-input od" maxlength="100" value="'+esc(o.description)+'" placeholder="'+esc(o.defDescription)+'"></div>';
}
function card(r,i){
  return '<div class="crl-card card'+(r.changed?' is-on':'')+'" data-i="'+i+'"><div class="head"><b>/'+esc(r.name)+'</b><span class="key">기본 이름 /'+esc(r.defName)+'</span></div>'
    +'<div class="field"><label>이름</label><input class="crl-input nmi" maxlength="32" value="'+esc(r.name)+'" placeholder="'+esc(r.defName)+'"></div>'
    +'<div class="field"><label>설명</label><input class="crl-input dsi" maxlength="100" value="'+esc(r.description)+'" placeholder="'+esc(r.defDescription)+'"></div>'
    +(r.order.length?'<div class="opts">'+r.order.map((n,k)=>optRow(r,n,k,r.order.length)).join("")+'</div>':'')
    +'<div class="acts"><button class="crl-btn crl-btn--primary crl-btn--sm save">저장</button><button class="crl-btn crl-btn--secondary crl-btn--sm reset">기본값으로</button><span class="st"></span></div></div>';
}
function render(){
  const q=$("q").value.trim().toLowerCase();
  $("list").innerHTML=ROWS.map((r,i)=>(!q||r.name.toLowerCase().includes(q)||r.defName.toLowerCase().includes(q)||r.description.toLowerCase().includes(q))?card(r,i):'').join("")||'<div class="admin-sub">명령어가 없습니다.</div>';
}
function readCard(el){
  const r=ROWS[+el.dataset.i];
  r.name=el.querySelector(".nmi").value.trim()||r.defName;
  r.description=el.querySelector(".dsi").value.trim()||r.defDescription;
  for(const o of el.querySelectorAll(".opt")){ const x=r.options.find(y=>y.name===o.dataset.n); x.shownName=o.querySelector(".onm").value.trim()||x.name; x.description=o.querySelector(".od").value.trim()||x.defDescription; }
  return r;
}
async function post(path,body){
  const res=await fetch(path+'?code='+encodeURIComponent(TOKEN),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  return res.json();
}
async function save(el,reset){
  const r=readCard(el), st=el.querySelector(".st");
  st.className="st"; st.textContent="저장 중…";
  try{
    const d=reset?await post('/api/admin/commands',{key:r.key,reset:true})
      :await post('/api/admin/commands',{key:r.key,name:r.name,description:r.description,order:r.order,optionDescriptions:Object.fromEntries(r.options.map(o=>[o.name,o.description])),optionNames:Object.fromEntries(r.options.map(o=>[o.name,o.shownName]))});
    if(!d.ok){ st.className="st err"; st.textContent=d.error||'오류'; return; }
    Object.assign(r,d.row); render();
    const again=document.querySelector('.card[data-i="'+el.dataset.i+'"] .st'); if(again){ again.className="st ok"; again.textContent=reset?"기본값으로 되돌림":"저장됨 · 디스코드에 반영을 눌러 주세요"; }
  }catch(e){ st.className="st err"; st.textContent='오류'; }
}
$("list").addEventListener("click",e=>{
  const el=e.target.closest(".card"); if(!el)return;
  if(e.target.classList.contains("save")) return save(el,false);
  if(e.target.classList.contains("reset")) return save(el,true);
  if(e.target.classList.contains("mv")){
    const r=readCard(el), n=e.target.closest(".opt").dataset.n, k=r.order.indexOf(n), j=e.target.classList.contains("up")?k-1:k+1;
    if(j<0||j>=r.order.length)return;
    [r.order[k],r.order[j]]=[r.order[j],r.order[k]]; render();
  }
});
$("sync").onclick=async()=>{
  const st=$("syncst"); st.className="st"; st.textContent="반영 중…";
  try{ const d=await post('/api/admin/commands/sync',{}); st.className=d.ok?"st ok":"st err"; st.textContent=d.ok?"디스코드에 반영했습니다":(d.error||'오류'); }
  catch(e){ st.className="st err"; st.textContent='오류'; }
};
$("q").oninput=render;
render();
</script>
</body></html>`;
}
