// 운영자 채보 등록 북마클릿 설치·안내 페이지 (/admin/import?code=token).
// 북마클릿은 window.__carolImport 를 세팅하고 /import.js 를 주입하는 작은 로더다.
// 실제 로직은 importClient.ts(/import.js) 에 있다.

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function importBookmarkletPage(baseUrl: string, token: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  // 북마클릿: 설정 주입 후 /import.js 주입. href 는 큰따옴표라 내부는 작은따옴표만 쓴다.
  const bm =
    "javascript:(function(){window.__carolImport={base:'" + base + "',code:'" + token + "'};" +
    "var s=document.createElement('script');s.src='" + base + "/import.js?t='+Date.now();" +
    "s.onerror=function(){alert('carol import.js 로드 실패');};document.body.appendChild(s);})();";

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>채보 등록 · carol</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;background:#0d0d0d;color:#eee;font:15px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
  .wrap{max-width:680px;margin:0 auto;padding:32px 20px 64px}
  h1{font-size:22px;margin:0 0 4px}
  .sub{color:#888;margin:0 0 28px}
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
  <h1>simai wiki 채보 등록</h1>
  <p class="sub">atwiki(simai) 공식 채보 데이터를 카롤봇 DB로 가져옵니다. 운영자 전용.</p>

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
    <p class="muted">· 이 링크(토큰)는 12시간 뒤 만료됩니다. 만료되면 <code>/채보가져오기</code> 로 다시 여세요.</p>
  </div>
</div></body></html>`;
}
