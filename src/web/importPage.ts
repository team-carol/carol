// /관리 의 "채보 등록" 탭 (/admin/import?code=token).
// 북마클릿은 window.__carolImport 를 세팅하고 /import.js 를 주입하는 작은 로더다.
// 실제 로직은 importClient.ts(/import.js) 에 있다.
//
// pageToken: /관리 가 준 짧은 토큰(탭 링크용). bmToken: 크롤이 길어 따로 발급한 12h 토큰
// (북마클릿에 심는다). 다른 관리 탭과 같은 룩앤필을 맞춘다.

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function importBookmarkletPage(baseUrl: string, pageToken: string, bmToken: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  // 북마클릿: 설정 주입 후 /import.js 주입. href 는 큰따옴표라 내부는 작은따옴표만 쓴다.
  const bm =
    "javascript:(function(){window.__carolImport={base:'" + base + "',code:'" + bmToken + "'};" +
    "var s=document.createElement('script');s.src='" + base + "/import.js?t='+Date.now();" +
    "s.onerror=function(){alert('carol import.js 로드 실패');};document.body.appendChild(s);})();";

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>채보 등록 · carol 관리</title>
<style>
  :root{color-scheme:dark}
  *{box-sizing:border-box}
  body{margin:0;background:#0d0d0d;color:#eee;font:15px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
  .wrap{max-width:760px;margin:0 auto;padding:28px 20px 64px}
  h1{font-size:22px;margin:0 0 4px}
  .sub{color:#888;margin:0 0 20px}
  .tabs{display:flex;gap:8px;margin:0 0 20px}
  .tabs a{flex:0 0 auto;background:#1a1a1a;color:#888;border:1px solid #2a2a2a;border-radius:8px;padding:8px 18px;font-size:14px;font-weight:500;text-decoration:none;transition:all .15s}
  .tabs a:hover{color:#ccc}
  .tabs a.on{background:#9333ea;color:#fff;border-color:#9333ea}
  .card{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:14px;padding:20px;margin:16px 0}
  .bm{display:inline-block;background:#9333ea;color:#fff !important;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px;cursor:grab}
  .bm:active{cursor:grabbing}
  ol{padding-left:20px}li{margin:8px 0}
  code{background:#2a2a2a;padding:1px 6px;border-radius:5px;font-size:13px}
  a.link{color:#c084fc}
  .warn{color:#fbbf24;font-size:13px}
  .muted{color:#888;font-size:13px}
</style></head>
<body><div class="wrap">
  <h1>🛠 캐롤봇 관리</h1>
  <p class="sub">simai wiki 채보를 카롤봇 DB로 가져옵니다.</p>
  <div class="tabs">
    <a href="/admin/aliases?code=${pageToken}">곡 별명</a>
    <a href="/admin/messages?code=${pageToken}">봇 문구</a>
    <a class="on" href="/admin/import?code=${pageToken}">채보 등록</a>
  </div>

  <div class="card">
    <p style="margin:0 0 14px">아래 버튼을 <b>북마크바로 드래그</b>해서 설치하세요.</p>
    <a class="bm" href="${esc(bm)}" onclick="return false">📥 채보 등록 (carol)</a>
    <p class="muted" style="margin:14px 0 0">모바일은 이 버튼을 북마크에 추가한 뒤 주소를 편집해 넣으세요. PC 권장.</p>
  </div>

  <div class="card">
    <b>사용법</b>
    <ol>
      <li>simai wiki 목록 페이지를 엽니다 —
        <a class="link" href="https://w.atwiki.jp/simai/pages/32.html" target="_blank" rel="noreferrer">공식 채보 데이터(스탠다드)</a> ·
        <a class="link" href="https://w.atwiki.jp/simai/pages/808.html" target="_blank" rel="noreferrer">でらっくす</a>
      </li>
      <li>그 페이지에서 방금 설치한 <b>채보 등록 (carol)</b> 북마클릿을 클릭합니다.</li>
      <li>오른쪽 아래 패널에서 <b>시작</b>을 누릅니다. 이미 등록된 곡은 자동으로 건너뜁니다.</li>
      <li>곡마다 <code>간격</code>(기본 15초) 만큼 쉬며 진행합니다. <b>일시정지 / 중지</b> 가능하고, 중간에 멈춰도 다음에 이어서 됩니다.</li>
    </ol>
    <p class="warn">· 상대 서버 부담을 줄이려 간격을 둡니다. 너무 짧게 낮추지 마세요.</p>
    <p class="muted">· 이 북마클릿의 토큰은 12시간 뒤 만료됩니다. 만료되면 이 탭을 새로고침해 다시 드래그하세요.</p>
  </div>

  <div class="card">
    <b>채보 점검</b>
    <p class="muted" style="margin:6px 0 12px">잘린 채보는 재생 길이가 비정상적으로 짧습니다.
      <b>의심 채보</b>는 짧거나 빈 것만, <b>전체 검사</b>는 등록된 모든 채보의 상태를 보여줍니다.
      잘린 채보는 위 북마클릿에서 <b>「이미 등록된 곡도 다시 가져오기」</b>로 재수집하면 교체됩니다.</p>
    <button id="auditBtn" style="padding:9px 18px;border:0;border-radius:9px;background:#2a2a2a;color:#eee;font-weight:600;cursor:pointer">의심 채보 점검</button>
    <button id="auditAllBtn" style="padding:9px 18px;border:1px solid #444;border-radius:9px;background:#1a1a1a;color:#ccc;font-weight:600;cursor:pointer;margin-left:6px">전체 검사</button>
    <div id="auditOut" style="margin-top:14px"></div>
  </div>
  <script>
    (function(){
      var TOKEN = ${JSON.stringify(pageToken)};
      var DIFF = {1:"BASIC",2:"ADVANCED",3:"EXPERT",4:"MASTER",5:"Re:MASTER"};
      var btn = document.getElementById("auditBtn"), btnAll = document.getElementById("auditAllBtn"), out = document.getElementById("auditOut");
      function flagLabel(s){
        if(s.flags.indexOf("empty")>=0) return ["노트 없음","#f66"];
        if(s.flags.indexOf("short")>=0) return [(s.durationMs/1000).toFixed(1)+"초","#fbbf24"];
        return [(s.durationMs/1000).toFixed(0)+"초","#6f6"];
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
              + "<span style='color:#6f6'>정상 " + c.ok + "</span> · "
              + "<span style='color:#fbbf24'>짧음 " + c.short + "</span> · "
              + "<span style='color:#f66'>빈 채보 " + c.empty + "</span></div>";
            if(!j.list.length){ out.innerHTML = summary + "<span style='color:#6f6'>표시할 항목이 없습니다.</span>"; return; }
            var rows = j.list.map(function(s){
              var fl = flagLabel(s);
              return "<tr><td style='padding:4px 10px 4px 0'><a href='/chart?id=" + encodeURIComponent(s.id) + "' target='_blank' style='color:#c084fc'>" + (s.title||"(제목 없음)") + "</a></td>"
                + "<td style='padding:4px 10px;color:#aaa'>" + (DIFF[s.difficulty]||s.difficulty) + (s.level?(" "+s.level):"") + "</td>"
                + "<td style='padding:4px 10px;color:" + fl[1] + "'>" + fl[0] + "</td>"
                + "<td style='padding:4px 10px;color:#888'>" + (s.notes||0) + "노트</td>"
                + "<td style='padding:4px 0;color:#888'>p." + (s.page||"?") + "</td></tr>";
            }).join("");
            out.innerHTML = summary + "<div style='overflow:auto;max-height:360px'><table style='border-collapse:collapse;font-size:13px'>" + rows + "</table></div>";
          })
          .catch(function(e){ btn.disabled = btnAll.disabled = false; out.textContent = "점검 실패: " + (e&&e.message||e); });
      }
      btn.onclick = function(){ run(false); };
      btnAll.onclick = function(){ run(true); };
    })();
  </script>
</div></body></html>`;
}
