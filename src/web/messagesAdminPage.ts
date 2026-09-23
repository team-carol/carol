// 봇 출력 문구 관리 페이지. 키별 기본값을 보여주고 오버라이드를 저장/복원한다.
// 디자인 토큰은 theme.ts(캐롤봇 랜딩 디자인 시스템)를 따른다.

import { BASE_CSS, ADMIN_CSS, ADMIN_BADGE, pageHead, topbar, adminTabs } from "./theme";

export interface MessageRowVM {
  key: string;
  group: string;
  text: string;        // 현재 적용 중인 문구 (오버라이드 있으면 그 값)
  def: string;         // 코드 기본값
  overridden: boolean;
  vars: string[];      // 허용 자리표시자
}

export function messagesAdminPage(token: string, rows: MessageRowVM[]): string {
  return `<!DOCTYPE html><html lang="ko"><head>${pageHead("봇 문구 관리 · 캐롤봇")}
<style>
${BASE_CSS}
${ADMIN_CSS}
#q{width:100%;background:var(--canvas-alt);border:1px solid var(--border);border-radius:12px;padding:11px 14px;color:var(--ink);font-size:15px;margin-bottom:12px;outline:none;transition:border-color .15s}
#q::placeholder{color:var(--faint)}
#q:focus{border-color:var(--accent)}
.group{font-size:13px;font-weight:500;color:var(--accent-soft);margin:28px 0 10px}
.item{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:16px 18px;margin-bottom:10px}
.item.on{border-color:rgba(255,146,148,.55)}
.k{font-family:var(--font-mono);font-size:12.5px;color:var(--ink-2);word-break:break-all}
.badge{display:inline-block;font-family:var(--font-sans);font-size:11px;font-weight:600;color:var(--accent-ink);background:var(--accent);border-radius:6px;padding:1px 7px;margin-left:8px;vertical-align:middle}
.vars{font-family:var(--font-mono);font-size:11.5px;color:var(--dim);margin-top:4px}
textarea{width:100%;min-height:68px;background:var(--canvas-alt);border:1px solid var(--border);border-radius:12px;padding:11px 12px;color:var(--ink);font-size:14.5px;line-height:1.55;resize:vertical;margin-top:10px;outline:none;transition:border-color .15s}
textarea:focus{border-color:var(--accent)}
.act{display:flex;gap:8px;align-items:center;margin-top:10px}
.act .btn{padding:8px 16px;font-size:13.5px}
.st{font-size:12.5px;margin-left:auto;color:var(--dim)}
.st.ok{color:var(--ok)}
.st.err{color:var(--err)}
.def{font-size:12.5px;color:var(--dim);margin-top:8px;white-space:pre-wrap;word-break:break-word}
</style></head><body>
${topbar(ADMIN_BADGE)}
<main class="page">
${adminTabs(token, "messages")}
<h1 class="admin-title">봇 문구 관리</h1>
<p class="admin-sub">저장하면 즉시 반영됩니다. 슬래시 명령의 이름·설명은 Discord에 기동 시 등록되어 여기서 바꿀 수 없습니다.</p>
<input id="q" placeholder="키 또는 문구 검색">
<div id="list"></div>
</main>
<script>
const TOKEN=${JSON.stringify(token)};
const ROWS=${JSON.stringify(rows)};
const $=id=>document.getElementById(id);
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function render(){
  const q=$("q").value.trim().toLowerCase();
  const rows=ROWS.filter(r=>!q||r.key.toLowerCase().includes(q)||r.text.toLowerCase().includes(q)||r.def.toLowerCase().includes(q));
  let html="",group=null;
  for(const r of rows){
    if(r.group!==group){group=r.group;html+='<div class="group">'+esc(group)+'</div>';}
    html+='<div class="item'+(r.overridden?' on':'')+'" data-key="'+esc(r.key)+'">'
      +'<div class="k">'+esc(r.key)+(r.overridden?'<span class="badge">수정됨</span>':'')+'</div>'
      +(r.vars.length?'<div class="vars">자리표시자: '+r.vars.map(v=>'{'+esc(v)+'}').join(" ")+'</div>':'')
      +'<textarea spellcheck="false">'+esc(r.text)+'</textarea>'
      +'<div class="act"><button class="btn btn-primary save">저장</button>'
      +(r.overridden?'<button class="btn btn-secondary reset">기본값으로</button>':'')
      +'<span class="st"></span></div>'
      +(r.overridden?'<div class="def">기본값: '+esc(r.def)+'</div>':'')
      +'</div>';
  }
  $("list").innerHTML=html||'<div class="admin-sub">일치하는 문구가 없습니다.</div>';
}
async function post(path,body){
  const res=await fetch(path+'?code='+encodeURIComponent(TOKEN),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  return res.json();
}
$("list").addEventListener("click",async e=>{
  const item=e.target.closest(".item"); if(!item)return;
  const key=item.dataset.key, st=item.querySelector(".st"), ta=item.querySelector("textarea");
  const row=ROWS.find(r=>r.key===key);
  if(e.target.classList.contains("save")){
    st.className="st"; st.textContent="저장 중…";
    const d=await post('/api/admin/messages',{key,text:ta.value});
    if(d.ok){ row.text=ta.value; row.overridden=true; st.className="st ok"; st.textContent="저장됨"; setTimeout(render,600); }
    else { st.className="st err"; st.textContent=d.error||'오류'; }
  }
  if(e.target.classList.contains("reset")){
    st.className="st"; st.textContent="복원 중…";
    const d=await post('/api/admin/messages/reset',{key});
    if(d.ok){ row.text=row.def; row.overridden=false; st.className="st ok"; st.textContent="기본값으로 복원됨"; setTimeout(render,600); }
    else { st.className="st err"; st.textContent=d.error||'오류'; }
  }
});
$("q").oninput=render;
render();
</script>
</body></html>`;
}
