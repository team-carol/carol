// /관리 의 "채보 등록" 탭 (/admin/import?code=token).
// 북마클릿은 window.__carolImport 를 세팅하고 /import.js 를 주입하는 작은 로더다.
// 실제 로직은 importClient.ts(/import.js) 에 있다.
//
// pageToken: /관리 가 준 짧은 토큰(탭 링크용). bmToken: 크롤이 길어 따로 발급한 12h 토큰
// (북마클릿에 심는다). 다른 관리 탭과 같은 룩앤필을 맞춘다.

import { BASE_CSS, ADMIN_CSS, ADMIN_BADGE, pageHead, topbar, adminTabs } from "./theme";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function importBookmarkletPage(baseUrl: string, pageToken: string, bmToken: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  // 북마클릿: 설정 주입 후 /import.js 주입. href 는 큰따옴표라 내부는 작은따옴표만 쓴다.
  const bm =
    "javascript:(function(){window.__carolImport={base:'" + base + "',code:'" + bmToken + "'};" +
    "var s=document.createElement('script');s.src='" + base + "/import.js?t='+Date.now();" +
    "s.onerror=function(){alert('캐롤봇 import.js 로드 실패');};document.body.appendChild(s);})();";

  return `<!doctype html><html lang="ko"><head>${pageHead("채보 등록 · 캐롤봇")}
<style>
${BASE_CSS}
${ADMIN_CSS}
.card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:24px;margin:0 0 14px}
.card-title{display:block;font-size:17px;font-weight:500;color:var(--ink);margin-bottom:6px}
.bm{cursor:grab}
.bm:active{cursor:grabbing}
ol{padding-left:22px;margin-top:6px}li{margin:8px 0;font-size:15px}
a.link{color:var(--accent-soft)}
.warn{color:var(--warn);font-size:13.5px}
.muted{color:var(--dim);font-size:13.5px}
.audit-btns{display:flex;gap:8px;flex-wrap:wrap}
.audit-btns .btn{padding:9px 18px;font-size:14px}
</style></head>
<body>
${topbar(ADMIN_BADGE)}
<main class="page">
  ${adminTabs(pageToken, "import")}
  <h1 class="admin-title">채보 등록</h1>
  <p class="admin-sub">simai wiki 채보를 캐롤봇 DB로 가져옵니다.</p>

  <div class="card">
    <p style="margin:0 0 14px">아래 버튼을 <b>북마크바로 드래그</b>해서 설치하세요.</p>
    <a class="btn btn-primary bm" href="${esc(bm)}" onclick="return false">📥 채보 등록 (캐롤봇)</a>
    <p class="muted" style="margin:14px 0 0">모바일은 이 버튼을 북마크에 추가한 뒤 주소를 편집해 넣으세요. PC 권장.</p>
  </div>

  <div class="card">
    <b class="card-title">사용법</b>
    <ol>
      <li>simai wiki 목록 페이지를 엽니다 —
        <a class="link" href="https://w.atwiki.jp/simai/pages/32.html" target="_blank" rel="noreferrer">공식 채보 데이터(스탠다드)</a> ·
        <a class="link" href="https://w.atwiki.jp/simai/pages/808.html" target="_blank" rel="noreferrer">でらっくす</a>
      </li>
      <li>그 페이지에서 방금 설치한 <b>채보 등록 (캐롤봇)</b> 북마클릿을 클릭합니다.</li>
      <li>오른쪽 아래 패널에서 <b>시작</b>을 누릅니다. 이미 등록된 곡은 자동으로 건너뜁니다.</li>
      <li>곡마다 <code>간격</code>(기본 15초) 만큼 쉬며 진행합니다. <b>일시정지 / 중지</b> 가능하고, 중간에 멈춰도 다음에 이어서 됩니다.</li>
    </ol>
    <p class="warn">· 상대 서버 부담을 줄이려 간격을 둡니다. 너무 짧게 낮추지 마세요.</p>
    <p class="muted">· 이 북마클릿의 토큰은 12시간 뒤 만료됩니다. 만료되면 이 탭을 새로고침해 다시 드래그하세요.</p>
  </div>

  <div class="card">
    <b class="card-title">채보 점검</b>
    <p class="muted" style="margin:6px 0 12px">잘린 채보는 재생 길이가 비정상적으로 짧습니다.
      <b>의심 채보</b>는 짧거나 빈 것만, <b>전체 검사</b>는 등록된 모든 채보의 상태를 보여줍니다.
      잘린 채보는 위 북마클릿에서 <b>「이미 등록된 곡도 다시 가져오기」</b>로 재수집하면 교체됩니다.</p>
    <div class="audit-btns"><button class="btn btn-primary" id="auditBtn">의심 채보 점검</button>
    <button class="btn btn-secondary" id="auditAllBtn">전체 검사</button></div>
    <div id="auditOut" style="margin-top:14px"></div>
  </div>
  <script>
    (function(){
      var TOKEN = ${JSON.stringify(pageToken)};
      var DIFF = {1:"BASIC",2:"ADVANCED",3:"EXPERT",4:"MASTER",5:"Re:MASTER"};
      var btn = document.getElementById("auditBtn"), btnAll = document.getElementById("auditAllBtn"), out = document.getElementById("auditOut");
      function flagLabel(s){
        if(s.flags.indexOf("empty")>=0) return ["노트 없음","var(--err)"];
        if(s.flags.indexOf("short")>=0) return [(s.durationMs/1000).toFixed(1)+"초","var(--warn)"];
        return [(s.durationMs/1000).toFixed(0)+"초","var(--ok)"];
      }
      function run(full){
        btn.disabled = btnAll.disabled = true; out.textContent = "점검 중… (곡이 많으면 몇 초 걸립니다)";
        fetch("/api/admin/simai/audit?code=" + encodeURIComponent(TOKEN) + (full?"&mode=full":""))
          .then(function(r){ return r.json(); })
          .then(function(j){
            btn.disabled = btnAll.disabled = false;
            if(!j || !j.ok){ out.textContent = "점검 실패 (토큰 만료 시 이 탭을 새로고침)"; return; }
            var c = j.counts;
            var summary = "<div style='margin-bottom:8px'>등록 <b>" + c.total + "</b>곡 · "
              + "<span style='color:var(--ok)'>정상 " + c.ok + "</span> · "
              + "<span style='color:var(--warn)'>짧음 " + c.short + "</span> · "
              + "<span style='color:var(--err)'>빈 채보 " + c.empty + "</span></div>";
            if(!j.list.length){ out.innerHTML = summary + "<span style='color:var(--ok)'>표시할 항목이 없습니다.</span>"; return; }
            var rows = j.list.map(function(s){
              var fl = flagLabel(s);
              return "<tr><td style='padding:4px 10px 4px 0'><a href='/chart?id=" + encodeURIComponent(s.id) + "' target='_blank'>" + (s.title||"(제목 없음)") + "</a></td>"
                + "<td style='padding:4px 10px;color:var(--muted)'>" + (DIFF[s.difficulty]||s.difficulty) + (s.level?(" "+s.level):"") + "</td>"
                + "<td style='padding:4px 10px;color:" + fl[1] + "'>" + fl[0] + "</td>"
                + "<td style='padding:4px 10px;color:var(--dim)'>" + (s.notes||0) + "노트</td>"
                + "<td style='padding:4px 0;color:var(--dim)'>p." + (s.page||"?") + "</td></tr>";
            }).join("");
            out.innerHTML = summary + "<div style='overflow:auto;max-height:360px'><table style='border-collapse:collapse;font-size:13px'>" + rows + "</table></div>";
          })
          .catch(function(e){ btn.disabled = btnAll.disabled = false; out.textContent = "점검 실패: " + (e&&e.message||e); });
      }
      btn.onclick = function(){ run(false); };
      btnAll.onclick = function(){ run(true); };
    })();
  </script>
</main></body></html>`;
}
