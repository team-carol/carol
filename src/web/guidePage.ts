// 캐롤봇 추가 북마클릿 설치 안내(/sync?code=TOKEN). PC 는 북마크바로 끌어 놓고, 모바일은 코드를 복사해 북마크 주소에 붙인다.

import { BASE_CSS, pageHead, topbar, siteFooter, userNav } from "./theme";

export function guidePage(token: string, bookmarklet: string): string {
  const bmEscaped = bookmarklet.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/`/g, "\\`");
  const card = (step: string, body: string) => `<div class="crl-card"><p class="crl-eyebrow step">Step ${step}</p>${body}</div>`;
  const dxnetLinks = `<a href="https://maimaidx-eng.com/maimai-mobile/" target="_blank">maimai DX NET</a> 또는 <a href="https://maimaidx.jp/maimai-mobile/" target="_blank">maimaiでらっくすNET</a>`;
  const maishiftNote = card("02", `<p>maishift 북마클릿은 캐롤봇 추가 북마클릿을 실행할 때 자동으로 함께 실행됩니다.</p>`);
  return `<!DOCTYPE html><html lang="ko"><head>${pageHead("캐롤봇 추가 북마클릿 설치 · 캐롤봇")}
<style>
${BASE_CSS}
.page{max-width:680px}
.guide-tabs{margin-bottom:16px}
.step{color:var(--crl-accent-soft)}
.hint{margin-top:8px}
.bm{margin:18px 0 4px}
.copy-btn{width:100%;margin-top:16px}
.steps{list-style:none;counter-reset:s;margin-top:4px}
.steps li{counter-increment:s;display:flex;gap:14px;margin-bottom:14px;font-size:15.5px}
.steps li:last-child{margin-bottom:0}
.steps li::before{content:counter(s);flex-shrink:0;width:26px;height:26px;margin-top:1px;background:var(--crl-surface-2);color:var(--crl-accent-soft);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:500}
.pane{display:none}
.pane.is-active{display:block}
</style></head><body>
${topbar(userNav(token, "sync"))}
<main class="page">
<h1 class="crl-heading-2 page-title">캐롤봇 추가 북마클릿 설치</h1>
<p class="crl-body-lg page-lead">프로필·기록은 maishift에서 가져옵니다. 서클·지방·게임 설정처럼 maishift에 없는 정보는 maimai DX NET에서 이 북마클릿을 실행하면 캐롤봇으로 동기화됩니다.</p>
<div class="crl-tabs crl-tabs--contained crl-tabs--fill guide-tabs" role="tablist">
<button class="crl-tab is-active" id="tbPC" role="tab" onclick="sw('PC')">💻 PC</button>
<button class="crl-tab" id="tbMB" role="tab" onclick="sw('MB')">📱 모바일</button>
</div>
<div class="pane is-active" id="tPC">
${card("01", `<p>아래 버튼을 브라우저 북마크바로 드래그하세요.</p>
<a class="crl-btn crl-btn--primary bm" href="${bookmarklet}" draggable="true">캐롤봇 추가</a>
<p class="crl-caption hint">북마크바가 없으면 <code>Ctrl+Shift+B</code></p>`)}
${maishiftNote}
${card("03", `<p>${dxnetLinks}에서 저장한 북마크를 클릭하세요.</p>`)}
</div>
<div class="pane" id="tMB">
${card("01", `<p>아래 버튼으로 북마클릿 코드를 복사하세요.</p>
<button class="crl-btn crl-btn--primary crl-btn--lg copy-btn" onclick="copyBm()">📋 코드 복사</button>
<div class="status ok" id="cpOk"></div>`)}
${maishiftNote}
${card("03", `<ol class="steps">
<li><span><strong>빈 페이지를 북마크 저장</strong> (⭐ 또는 공유 → 북마크 추가)</span></li>
<li><span>북마크 목록을 열고, 방금 저장한 북마크를 <strong>편집</strong></span></li>
<li><span>URL 칸을 모두 지우고, 복사한 코드를 <strong>붙여넣기</strong></span></li>
<li><span>${dxnetLinks}에서 해당 북마크 실행</span></li>
</ol>`)}
</div>
</main>
${siteFooter()}
<script>
function sw(t){
  ['PC','MB'].forEach(function(k){
    document.getElementById('t'+k).classList.toggle('is-active',k===t);
    document.getElementById('tb'+k).classList.toggle('is-active',k===t);
  });
}
function copyBm(){
  var code='${bmEscaped}';
  var out=document.getElementById('cpOk');
  function done(t){out.textContent=t;setTimeout(function(){out.textContent='';},3000);}
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(code).then(function(){done('✅ 복사 완료!');}).catch(fallback);
  } else { fallback(); }
  function fallback(){
    var ta=document.createElement('textarea');
    ta.value=code;ta.style.position='fixed';ta.style.opacity='0';
    document.body.appendChild(ta);ta.focus();ta.select();
    try{document.execCommand('copy');done('✅ 복사 완료!');}
    catch(e){done('❌ 수동 복사 필요');}
    document.body.removeChild(ta);
  }
}
if(/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) sw('MB');
</script>
</body></html>`;
}
