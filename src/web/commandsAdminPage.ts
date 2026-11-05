// 슬래시 명령어 이름·설명·옵션 순서·옵션 설명 관리 페이지(/관리 → 명령어). 저장한 값은 "디스코드에 반영" 또는 봇 재시작 때 올라간다.
// 디자인 토큰은 theme.ts(캐롤봇 랜딩 디자인 시스템)를 따른다.

import { BASE_CSS, ADMIN_CSS, ADMIN_BADGE, pageHead, topbar, adminTabs } from "./theme";

export interface CommandOptionVM { name: string; type: string; required: boolean; defDescription: string; description: string }
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
#q{flex:1;min-width:180px;background:var(--canvas-alt);border:1px solid var(--border);border-radius:12px;padding:11px 14px;color:var(--ink);font-size:15px;outline:none;transition:border-color .15s}
#q::placeholder{color:var(--faint)}
#q:focus{border-color:var(--accent)}
.note{font-size:13px;color:var(--dim);line-height:1.6;margin:0 0 18px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:14px 16px;margin-bottom:10px}
.card.on{border-color:rgba(255,146,148,.55)}
.head{display:flex;gap:8px;align-items:baseline;justify-content:space-between;flex-wrap:wrap}
.key{font-size:12px;color:var(--faint)}
.field{display:flex;gap:8px;align-items:center;margin-top:8px}
.field label{width:46px;flex-shrink:0;font-size:12.5px;color:var(--dim)}
.field input{flex:1;min-width:0;background:var(--canvas-alt);border:1px solid var(--border);border-radius:10px;padding:8px 11px;color:var(--ink);font-size:14px;outline:none;transition:border-color .15s}
.field input:focus{border-color:var(--accent)}
.opts{margin-top:10px;border-top:1px solid var(--border);padding-top:8px}
.opt{display:flex;gap:6px;align-items:center;padding:4px 0}
.opt .nm{width:96px;flex-shrink:0;font-size:13.5px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.opt .ty{font-size:11px;color:var(--faint);width:60px;flex-shrink:0}
.opt .req{font-size:11px;color:var(--accent)}
.opt input{flex:1;min-width:0;background:var(--canvas-alt);border:1px solid var(--border);border-radius:9px;padding:6px 9px;color:var(--ink);font-size:13px;outline:none}
.opt input:focus{border-color:var(--accent)}
.mv{background:var(--surface-2);border:1px solid var(--border);color:var(--muted);border-radius:8px;width:28px;height:28px;cursor:pointer;flex-shrink:0}
.mv:disabled{opacity:.35;cursor:default}
.acts{display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap}
.acts .btn{padding:7px 14px;font-size:13.5px}
.st{font-size:12.5px;color:var(--dim)}
.st.ok{color:var(--ok)}
.st.err{color:var(--err)}
@media (max-width:560px){.opt{flex-wrap:wrap}.opt .nm{width:auto}.opt input{flex-basis:100%}}
</style></head><body>
${topbar(ADMIN_BADGE)}
<main class="page">
${adminTabs(token, "commands")}
<h1 class="admin-title">명령어</h1>
<p class="admin-sub">슬래시 명령어의 이름·설명·옵션 순서·옵션 설명을 바꿉니다. 저장한 뒤 <b>디스코드에 반영</b>을 누르거나 봇을 다시 시작하면 디스코드에 올라갑니다.</p>
<p class="note">· 디스코드 명령 목록은 이름 순으로 보여서 명령어끼리의 순서는 정할 수 없습니다. 이름을 바꾸면 목록 위치도 바뀝니다.<br>· 옵션 이름은 봇이 그 이름으로 값을 읽어서 바꿀 수 없습니다. 필수 옵션은 디스코드 규칙상 늘 앞에 옵니다.<br>· 다른 문구에 적힌 명령어 이름(예: <code>/마이시프트 연동</code>)은 <b>봇 문구</b> 탭에서 같이 고쳐 주세요.</p>
<div class="bar">
<input id="q" placeholder="명령어 검색">
<button class="btn btn-primary" id="sync"${botRunning ? "" : " disabled"}>디스코드에 반영</button>
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
  return '<div class="opt" data-n="'+esc(name)+'"><button class="mv up"'+(k===0?' disabled':'')+'>↑</button><button class="mv down"'+(k===n-1?' disabled':'')+'>↓</button>'
    +'<span class="nm" title="'+esc(name)+'">'+esc(name)+'</span><span class="ty">'+esc(o.type)+(o.required?' <span class="req">필수</span>':'')+'</span>'
    +'<input class="od" maxlength="100" value="'+esc(o.description)+'" placeholder="'+esc(o.defDescription)+'"></div>';
}
function card(r,i){
  return '<div class="card'+(r.changed?' on':'')+'" data-i="'+i+'"><div class="head"><b>/'+esc(r.name)+'</b><span class="key">기본 이름 /'+esc(r.defName)+'</span></div>'
    +'<div class="field"><label>이름</label><input class="nmi" maxlength="32" value="'+esc(r.name)+'" placeholder="'+esc(r.defName)+'"></div>'
    +'<div class="field"><label>설명</label><input class="dsi" maxlength="100" value="'+esc(r.description)+'" placeholder="'+esc(r.defDescription)+'"></div>'
    +(r.order.length?'<div class="opts">'+r.order.map((n,k)=>optRow(r,n,k,r.order.length)).join("")+'</div>':'')
    +'<div class="acts"><button class="btn btn-primary save">저장</button><button class="btn reset">기본값으로</button><span class="st"></span></div></div>';
}
function render(){
  const q=$("q").value.trim().toLowerCase();
  $("list").innerHTML=ROWS.map((r,i)=>(!q||r.name.toLowerCase().includes(q)||r.defName.toLowerCase().includes(q)||r.description.toLowerCase().includes(q))?card(r,i):'').join("")||'<div class="admin-sub">명령어가 없습니다.</div>';
}
function readCard(el){
  const r=ROWS[+el.dataset.i];
  r.name=el.querySelector(".nmi").value.trim()||r.defName;
  r.description=el.querySelector(".dsi").value.trim()||r.defDescription;
  for(const o of el.querySelectorAll(".opt")){ const x=r.options.find(y=>y.name===o.dataset.n); x.description=o.querySelector(".od").value.trim()||x.defDescription; }
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
      :await post('/api/admin/commands',{key:r.key,name:r.name,description:r.description,order:r.order,optionDescriptions:Object.fromEntries(r.options.map(o=>[o.name,o.description]))});
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
