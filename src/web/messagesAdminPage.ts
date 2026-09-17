// 봇 출력 문구 관리 페이지. 키별 기본값을 보여주고 오버라이드를 저장/복원한다.
// 디자인 토큰은 docs/DESIGN.md 및 별명 관리 페이지와 맞춘다.

export interface MessageRowVM {
  key: string;
  group: string;
  text: string;        // 현재 적용 중인 문구 (오버라이드 있으면 그 값)
  def: string;         // 코드 기본값
  overridden: boolean;
  vars: string[];      // 허용 자리표시자
}

export function messagesAdminPage(token: string, rows: MessageRowVM[]): string {
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>봇 문구 관리 - carolbot</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',system-ui,-apple-system,sans-serif;background:#0d0d0d;color:#ccc;font-size:16px;line-height:1.5;-webkit-font-smoothing:antialiased;display:flex;justify-content:center;min-height:100vh;padding:48px 24px}
.wrap{width:100%;max-width:820px}
.mono{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;letter-spacing:.5px;text-transform:uppercase;color:#888;margin-bottom:12px}
h1{font-size:34px;font-weight:700;color:#fff;letter-spacing:-.5px;margin-bottom:8px}
.sub{font-size:14px;color:#777;margin-bottom:20px}
.tabs{display:flex;gap:8px;margin:0 0 20px}
.tabs a{flex:0 0 auto;background:#1a1a1a;color:#888;border:1px solid #2a2a2a;border-radius:8px;padding:8px 18px;font-size:14px;font-weight:500;text-decoration:none;transition:all .15s}
.tabs a:hover{color:#ccc}
.tabs a.on{background:#9333ea;color:#fff;border-color:#9333ea}
#q{width:100%;background:#151515;border:1px solid #2a2a2a;border-radius:8px;padding:10px 12px;color:#ccc;font-family:inherit;font-size:14px;margin-bottom:16px}
#q:focus{outline:none;border-color:#9333ea}
.group{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;letter-spacing:.5px;text-transform:uppercase;color:#9333ea;margin:22px 0 8px}
.item{background:#151515;border:1px solid #2a2a2a;border-radius:10px;padding:14px;margin-bottom:10px}
.item.on{border-color:#9333ea}
.k{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px;color:#ccc;word-break:break-all}
.badge{display:inline-block;font-size:10px;font-weight:700;color:#fff;background:#9333ea;border-radius:4px;padding:1px 6px;margin-left:6px;vertical-align:middle}
.vars{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;color:#777;margin-top:4px}
textarea{width:100%;min-height:64px;background:#0f0f0f;border:1px solid #2a2a2a;border-radius:8px;padding:10px;color:#ddd;font-family:inherit;font-size:14px;line-height:1.5;resize:vertical;margin-top:8px}
textarea:focus{outline:none;border-color:#9333ea}
.act{display:flex;gap:8px;align-items:center;margin-top:8px}
button{background:#9333ea;color:#fff;border:none;border-radius:8px;padding:8px 16px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:opacity .15s}
button:active{opacity:.8}
button.ghost{background:#1f1f1f;color:#aaa;border:1px solid #2a2a2a}
.st{font-size:12px;margin-left:auto}
.st.ok{color:#4ade80}
.st.err{color:#f87171}
.def{font-size:12px;color:#666;margin-top:6px;white-space:pre-wrap;word-break:break-word}
</style></head><body>
<div class="wrap">
<p class="mono">carolbot · admin</p>
<div class="tabs"><a href="/admin/aliases?code=${token}">곡 별명</a><a class="on" href="/admin/messages?code=${token}">봇 문구</a><a href="/admin/import?code=${token}">채보 등록</a></div>
<h1>봇 문구 관리</h1>
<p class="sub">저장하면 즉시 반영됩니다. 슬래시 명령의 이름·설명은 Discord에 기동 시 등록되어 여기서 바꿀 수 없습니다.</p>
<input id="q" placeholder="키 또는 문구 검색">
<div id="list"></div>
</div>
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
      +'<div class="act"><button class="save">저장</button>'
      +(r.overridden?'<button class="ghost reset">기본값으로</button>':'')
      +'<span class="st"></span></div>'
      +(r.overridden?'<div class="def">기본값: '+esc(r.def)+'</div>':'')
      +'</div>';
  }
  $("list").innerHTML=html||'<div class="sub">일치하는 문구가 없습니다.</div>';
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
