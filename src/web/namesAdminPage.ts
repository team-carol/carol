// 지방 이름·스탬프 카드 이름 번역 관리 페이지. 봇이 본 이름이 번역 대기로 쌓이고, 여기서 한국어 이름을 채운다.
// 디자인 토큰은 theme.ts(캐롤봇 랜딩 디자인 시스템)를 따른다.

import { BASE_CSS, ADMIN_CSS, ADMIN_BADGE, pageHead, topbar, adminTabs } from "./theme";
import type { NameTranslationRow } from "../storage/types";

export function namesAdminPage(token: string, rows: NameTranslationRow[]): string {
  return `<!DOCTYPE html><html lang="ko"><head>${pageHead("이름 번역 · 캐롤봇")}
<style>
${BASE_CSS}
${ADMIN_CSS}
.bar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.seg{display:flex;gap:4px;background:var(--canvas-alt);border:1px solid var(--border);border-radius:12px;padding:4px}
.seg button{background:transparent;border:0;color:var(--muted);border-radius:9px;padding:7px 14px;font-size:14px;cursor:pointer}
.seg button.on{background:var(--surface-2);color:var(--ink);box-shadow:0 0 0 1px var(--border-2)}
#q{flex:1;min-width:180px;background:var(--canvas-alt);border:1px solid var(--border);border-radius:12px;padding:11px 14px;color:var(--ink);font-size:15px;outline:none;transition:border-color .15s}
#q::placeholder{color:var(--faint)}
#q:focus{border-color:var(--accent)}
.count{font-size:13px;color:var(--dim);margin:4px 0 12px}
.item{display:flex;gap:14px;align-items:center;background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:12px 14px;margin-bottom:8px}
.item.on{border-color:rgba(255,146,148,.55)}
.thumb{width:64px;height:64px;flex-shrink:0;border-radius:10px;background:var(--canvas-alt);object-fit:contain}
.body{flex:1;min-width:0}
.src{font-size:14.5px;color:var(--ink);word-break:break-word}
.row{display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap}
.row input{flex:1;min-width:160px;background:var(--canvas-alt);border:1px solid var(--border);border-radius:10px;padding:8px 11px;color:var(--ink);font-size:14.5px;outline:none;transition:border-color .15s}
.row input:focus{border-color:var(--accent)}
.row .btn{padding:7px 14px;font-size:13.5px}
.st{font-size:12.5px;color:var(--dim)}
.st.ok{color:var(--ok)}
.st.err{color:var(--err)}
</style></head><body>
${topbar(ADMIN_BADGE)}
<main class="page">
${adminTabs(token, "names")}
<h1 class="admin-title">이름 번역</h1>
<p class="admin-sub">봇이 처음 본 지방 이름과 스탬프 카드 이름이 여기에 쌓입니다. 저장하면 바로 반영되고, 비워서 저장하면 번역을 지웁니다. 사용자가 /설정에서 한국어 번역을 켰을 때만 보입니다.</p>
<div class="bar">
<div class="seg" id="kind"><button data-k="area" class="on">지방</button><button data-k="stamp">스탬프 카드</button></div>
<div class="seg" id="state"><button data-s="todo" class="on">번역 안 됨</button><button data-s="all">전체</button></div>
<input id="q" placeholder="이름 검색">
</div>
<div class="count" id="count"></div>
<div id="list"></div>
</main>
<script>
const TOKEN=${JSON.stringify(token)};
const ROWS=${JSON.stringify(rows).replace(/</g, "\\u003c")};
const HINT={area:'지방 이름은 끝 번호를 뗀 이름으로 모읍니다. 번역에도 번호를 빼고 쓰면, 보여 줄 때 번호가 뒤에 붙습니다(예: 메트로폴리스 지방 → 메트로폴리스 지방 7).',stamp:'곡 스탬프 카드는 곡명 번역을 쓰므로 여기에 없습니다.'};
let kind="area",state="todo";
const $=id=>document.getElementById(id);
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function render(){
  const q=$("q").value.trim().toLowerCase();
  const all=ROWS.filter(r=>r.kind===kind);
  const rows=all.filter(r=>(state==="all"||!r.ko)&&(!q||r.source.toLowerCase().includes(q)||r.ko.toLowerCase().includes(q)));
  $("count").textContent=HINT[kind]+' 번역 '+all.filter(r=>r.ko).length+' / '+all.length;
  $("list").innerHTML=rows.map((r,i)=>'<div class="item'+(r.ko?' on':'')+'" data-i="'+ROWS.indexOf(r)+'">'
    +(r.imageUrl?'<img class="thumb" loading="lazy" referrerpolicy="no-referrer" src="'+esc(r.imageUrl)+'" alt="">':'<div class="thumb"></div>')
    +'<div class="body"><div class="src">'+esc(r.source)+'</div>'
    +'<div class="row"><input value="'+esc(r.ko)+'" placeholder="한국어 이름" maxlength="100"><button class="btn btn-primary save">저장</button><span class="st"></span></div></div></div>').join("")
    ||'<div class="admin-sub">'+(state==="todo"&&all.length?'모든 이름을 번역했습니다.':'아직 모인 이름이 없습니다.')+'</div>';
}
async function save(item){
  const r=ROWS[+item.dataset.i], st=item.querySelector(".st"), input=item.querySelector("input");
  st.className="st"; st.textContent="저장 중…";
  try{
    const res=await fetch('/api/admin/names?code='+encodeURIComponent(TOKEN),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:r.kind,source:r.source,ko:input.value})});
    const d=await res.json();
    if(d.ok){ r.ko=d.ko; st.className="st ok"; st.textContent=d.ko?"저장됨":"번역 지움"; item.classList.toggle("on",!!d.ko); }
    else { st.className="st err"; st.textContent=d.error||'오류'; }
  }catch(e){ st.className="st err"; st.textContent='오류'; }
}
$("list").addEventListener("click",e=>{ if(e.target.classList.contains("save")) save(e.target.closest(".item")); });
$("list").addEventListener("keydown",e=>{ if(e.key==="Enter"&&e.target.tagName==="INPUT"&&!e.isComposing) save(e.target.closest(".item")); });
function seg(id,attr,set){ $(id).addEventListener("click",e=>{ const b=e.target.closest("button"); if(!b)return; set(b.dataset[attr]); for(const x of $(id).children)x.classList.toggle("on",x===b); render(); }); }
seg("kind","k",v=>kind=v); seg("state","s",v=>state=v);
$("q").oninput=render;
render();
</script>
</body></html>`;
}
