import * as http from "http";
import * as fs from "fs";
import { parseHome, parsePlayerData, parseFriendCode as parseFC, parseRecentRecords, parseTop5 } from "./scraper";
import { cacheProfile, saveUserSession, getUserSyncToken, findUserBySyncToken, saveAvatarBlob, getAvatarBlob, getSongJacket, saveSongJacket } from "./db";

let baseUrl = "";
export function setBaseUrl(url: string): void { baseUrl = url; }
export function getBaseUrl(port: number): string { return baseUrl || `http://localhost:${port}`; }

export function buildBookmarklet(token: string, port: number): string {
  const server = getBaseUrl(port);
  return `javascript:(function(d){var s=d.createElement('script');s.src='${server}/bookmarklet.js?code=${token}&v='+Math.floor(Date.now()/1e5);d.body.append(s)})(document)`;
}

const bookmarkletJs = `(async()=>{
var e=document,s=e.currentScript.src,u=new URL(s),c=u.searchParams.get('code')||'',v=u.origin;
var x=function(a){return fetch(a).then(function(r){return r.text()})};
var q=['/maimai-mobile/home/','/maimai-mobile/playerData/','/maimai-mobile/record/','/maimai-mobile/friend/userFriendCode/'];
var r=await Promise.all(q.map(x));
var h=r[0],p=r[1],rd=r[2],f=r[3],a='',js=[];
try{
  var m=h.match(/src="(https:[^"]*Icon[^"]*)"/);
  if(m){var b=await fetch(m[1]).then(function(t){return t.blob()});
  a=await new Promise(function(d){var g=new FileReader();g.onload=function(){d(g.result)};g.readAsDataURL(b)})}
}catch(e){}
try{
  var dp=new DOMParser(),d2=dp.parseFromString(rd,'text/html');
  var imgs=d2.querySelectorAll('.music_img');
  for(var i=0;i<Math.min(imgs.length,5);i++){
    try{var src=imgs[i].src;if(src){
      var b2=await fetch(src).then(function(t){return t.blob()});
      var b64=await new Promise(function(d){var g=new FileReader();g.onload=function(){d(g.result)};g.readAsDataURL(b2)});
      js.push({url:src,data:b64});
    }}catch(e2){}
  }
}catch(e){}
await fetch(v+'/sync?code='+c,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({h:h,p:p,r:rd,f:f,a:a,js:js})});
alert('\\uC644\\uB8CC!')
})()`;

function guidePage(token: string, bookmarklet: string): string {
  const bmEscaped = bookmarklet.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/`/g, "\\`");
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>maimai 북마클릿 설치</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#0d0d0d;color:#ccc;display:flex;justify-content:center;align-items:flex-start;min-height:100vh;padding:20px 16px 40px}
.wrap{width:100%;max-width:480px}
h1{color:#fff;font-size:20px;margin-bottom:20px;text-align:center}
.card{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:20px;margin-bottom:12px}
.card h2{color:#fff;font-size:14px;margin-bottom:10px;display:flex;align-items:center;gap:8px}
.card h2 .tag{font-size:11px;background:#333;border-radius:4px;padding:2px 6px;color:#aaa}
.card p{color:#999;font-size:13px;line-height:1.6;margin-bottom:10px}
.card p:last-child{margin-bottom:0}
.bm{display:block;background:#111;border:2px dashed #3a5;border-radius:8px;padding:12px 20px;color:#4caf50;font-size:14px;font-weight:600;cursor:grab;text-decoration:none;text-align:center;margin:10px 0}
.bm:active{opacity:.7}
.copy-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;background:#2e7d32;color:#fff;border:none;border-radius:8px;padding:14px;font-size:15px;font-weight:600;cursor:pointer;margin:10px 0;transition:background .15s}
.copy-btn:active{background:#1b5e20}
.copy-ok{color:#4caf50;font-size:13px;text-align:center;min-height:20px;margin-top:4px}
.steps{counter-reset:s}
.step{counter-increment:s;display:flex;gap:10px;margin-bottom:10px;font-size:13px;color:#bbb;line-height:1.5}
.step::before{content:counter(s);min-width:22px;height:22px;background:#333;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0;margin-top:1px}
.tab{display:none}.tab.active{display:block}
.tabs{display:flex;gap:6px;margin-bottom:16px}
.tabBtn{flex:1;background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:10px;font-size:13px;color:#999;cursor:pointer}
.tabBtn.active{border-color:#4caf50;color:#4caf50;background:#0f1f10}
a{color:#4caf50}
</style></head><body>
<div class="wrap">
<h1>🔖 북마클릿 설치</h1>
<div style="display:flex;gap:6px;margin-bottom:12px">
<button class="tabBtn active" id="tbPC" onclick="sw('PC')">💻 PC</button>
<button class="tabBtn" id="tbMB" onclick="sw('MB')">📱 모바일</button>
</div>

<div class="tab active" id="tPC">
<div class="card">
<h2>1단계 <span class="tag">드래그</span></h2>
<p>초록색 링크를 브라우저 북마크바로 드래그하세요.</p>
<a class="bm" href="${bookmarklet}" draggable="true">⭐ maimai</a>
<p style="font-size:12px;color:#666">북마크바가 없으면 Ctrl+Shift+B 로 표시</p>
</div>
<div class="card">
<h2>2단계 <span class="tag">사용</span></h2>
<p><a href="https://maimaidx-eng.com/maimai-mobile/" target="_blank">maimai DX net</a>에 로그인된 상태에서 저장한 북마크를 클릭하세요.</p>
</div>
</div>

<div class="tab" id="tMB">
<div class="card">
<h2>복사 <span class="tag">필수</span></h2>
<p>아래 버튼으로 북마클릿 코드를 복사하세요.</p>
<button class="copy-btn" onclick="copyBm()">📋 코드 복사하기</button>
<div class="copy-ok" id="cpOk"></div>
</div>
<div class="card">
<h2>북마크에 저장</h2>
<div class="steps">
<div class="step">브라우저에서 <strong>아무 페이지나</strong> 북마크 저장 (⭐ 버튼 또는 공유 → 북마크 추가)</div>
<div class="step">북마크 목록을 열고, 방금 저장한 북마크를 <strong>편집</strong></div>
<div class="step">URL 칸을 모두 지우고, 복사한 코드를 <strong>붙여넣기</strong></div>
<div class="step">저장 후 <a href="https://maimaidx-eng.com/maimai-mobile/" target="_blank">maimai DX net</a>에서 해당 북마크 실행</div>
</div>
</div>
</div>
</div>
<script>
function sw(t){
  document.getElementById('tPC').className='tab'+(t==='PC'?' active':'');
  document.getElementById('tMB').className='tab'+(t==='MB'?' active':'');
  document.getElementById('tbPC').className='tabBtn'+(t==='PC'?' active':'');
  document.getElementById('tbMB').className='tabBtn'+(t==='MB'?' active':'');
}
function copyBm(){
  var code='${bmEscaped}';
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(code).then(function(){
      document.getElementById('cpOk').textContent='✅ 복사 완료!';
      setTimeout(function(){document.getElementById('cpOk').textContent=''},3000);
    }).catch(fallback);
  } else { fallback(); }
  function fallback(){
    var ta=document.createElement('textarea');
    ta.value=code;ta.style.position='fixed';ta.style.opacity='0';
    document.body.appendChild(ta);ta.focus();ta.select();
    try{document.execCommand('copy');document.getElementById('cpOk').textContent='✅ 복사 완료!';}
    catch(e){document.getElementById('cpOk').textContent='❌ 수동 복사 필요';}
    document.body.removeChild(ta);
    setTimeout(function(){document.getElementById('cpOk').textContent=''},3000);
  }
}
// 모바일 자동 감지
if(/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) sw('MB');
</script>
</body></html>`;
}

export function startWebServer(port: number): void {
  const server = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    const url = new URL(req.url || "/", `http://localhost:${port}`);

    if (req.method === "GET" && url.pathname === "/avatar") {
      const uid = url.searchParams.get("user") || "";
      const data = getAvatarBlob(uid);
      if (data) {
        res.writeHead(200, { "content-type": "image/png", "cache-control": "max-age=3600" });
        res.end(data);
      } else {
        res.writeHead(404); res.end();
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/jacket") {
      const musicId = url.searchParams.get("id") || "";
      if (!musicId) { res.writeHead(400); res.end(); return; }
      let imgData = getSongJacket(musicId);
      if (!imgData) {
        try {
          const imgUrl = `https://maimaidx-eng.com/maimai-mobile/img/Music/${musicId}.png`;
          const resp = await fetch(imgUrl);
          if (resp.ok) {
            imgData = Buffer.from(await resp.arrayBuffer());
            saveSongJacket(musicId, imgData);
          }
        } catch (e) {
          console.error("[jacket] fetch failed:", e);
        }
      }
      if (imgData) {
        res.writeHead(200, { "content-type": "image/png", "cache-control": "max-age=86400" });
        res.end(imgData);
      } else {
        res.writeHead(404); res.end();
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/bookmarklet.js") {
      res.writeHead(200, { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-cache" });
      res.end(bookmarkletJs);
      return;
    }

    if (req.method === "GET" && url.pathname === "/privacy") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(`<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>개인정보처리방침 - maimaiDISCORD</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#0d0d0d;color:#ccc;max-width:720px;margin:40px auto;padding:24px;line-height:1.7}
h1{color:#fff;border-bottom:1px solid #333;padding-bottom:12px;margin-bottom:24px}
h2{color:#ddd;margin:28px 0 12px}
p{margin:8px 0}
a{color:#4caf50}
</style></head><body>
<h1>개인정보처리방침</h1>
<p>최종 수정일: 2026년 6월</p>
<h2>1. 수집하는 정보</h2>
<p>본 봇은 Discord 사용자 ID, maimai DX net 프로필 데이터(플레이어명, 레이팅, 칭호, 클래스, 아바타 이미지, 최근 플레이 기록, 재킷 이미지)를 수집합니다.</p>
<h2>2. 수집 방법</h2>
<p>사용자가 브라우저에서 북마클릿을 실행하여 maimai DX net에서 직접 데이터를 서버로 전송합니다. SEGA ID, 비밀번호 등 계정 정보는 절대 수집하지 않습니다.</p>
<h2>3. 데이터 저장</h2>
<p>모든 데이터는 서버 내 SQLite 데이터베이스에 암호화하여 저장됩니다. 아바타 및 재킷 이미지는 base64 인코딩되어 저장됩니다.</p>
<h2>4. 데이터 사용 목적</h2>
<p>Discord에서 maimai DX 프로필을 표시하는 용도로만 사용됩니다.</p>
<h2>5. 제3자 제공</h2>
<p>수집된 데이터를 제3자에게 제공하지 않습니다.</p>
<h2>6. 데이터 삭제</h2>
<p>/프로필 데이터는 북마클릿 재실행 시 덮어쓰기됩니다. 완전한 삭제를 원하시면 봇 관리자에게 요청해 주세요.</p>
</body></html>`);
      return;
    }

    if (req.method === "GET" && url.pathname === "/terms") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(`<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>이용약관 - maimaiDISCORD</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#0d0d0d;color:#ccc;max-width:720px;margin:40px auto;padding:24px;line-height:1.7}
h1{color:#fff;border-bottom:1px solid #333;padding-bottom:12px;margin-bottom:24px}
h2{color:#ddd;margin:28px 0 12px}
p{margin:8px 0}
a{color:#4caf50}
</style></head><body>
<h1>이용약관</h1>
<p>최종 수정일: 2026년 6월</p>
<h2>1. 서비스 설명</h2>
<p>maimaiDISCORD는 Discord에서 SEGA의 아케이드 리듬 게임 「maimai DX」의 공식 웹사이트(maimai DX net) 프로필을 조회할 수 있는 비공식 팬 메이드 봇입니다.</p>
<h2>2. 저작권</h2>
<p>본 서비스는 SEGA와 공식적으로 제휴, 후원 또는 승인되지 않았습니다. maimai DX, maimai DX net 및 관련된 모든 게임 자산, 캐릭터, 음악, 이미지, 상표의 저작권 및 모든 권리는 <strong>SEGA Corporation</strong>에 있습니다. 본 봇은 팬 목적으로만 운영됩니다.</p>
<h2>3. 사용자 책임</h2>
<p>사용자는 maimai DX net에 로그인된 상태에서 북마클릿을 실행하여 데이터를 전송합니다. 이 과정에서 발생하는 모든 책임은 사용자에게 있습니다.</p>
<h2>4. 서비스 중단</h2>
<p>본 서비스는 언제든지 사전 통지 없이 중단될 수 있습니다. 서비스 제공자는 서비스 중단으로 인한 손해에 대해 책임을 지지 않습니다.</p>
<h2>5. 면책 조항</h2>
<p>본 서비스는 "있는 그대로" 제공되며, 어떠한 종류의 명시적 또는 묵시적 보증 없이 제공됩니다.</p>
</body></html>`);
      return;
    }

    if (req.method === "GET" && url.pathname === "/sync") {
      const token = url.searchParams.get("code") || "";
      if (!findUserBySyncToken(token)) { res.writeHead(403); res.end("expired"); return; }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(guidePage(token, buildBookmarklet(token, port)));
      return;
    }

    if (req.method === "POST" && url.pathname === "/sync") {
      const token = url.searchParams.get("code") || "";
      const userId = findUserBySyncToken(token);
      if (!userId) { res.writeHead(403); res.end("expired"); return; }

      const raw = await readBody(req);
      const data = JSON.parse(raw);
      const homeHtml: string = data.h || "";
      const playerHtml: string = data.p || "";
      const fcHtml: string = data.f || "";
      const recordHtml: string = data.r || "";
      const avatarBase64: string = data.a || "";
      console.log(`[web] user=${userId.slice(-6)}, home=${homeHtml.length}B, player=${playerHtml.length}B, record=${recordHtml.length}B, fc=${fcHtml.length}B`);
      fs.writeFileSync("debug_home.html", homeHtml, "utf-8");
      fs.writeFileSync("debug_pd.html", playerHtml, "utf-8");
      fs.writeFileSync("debug_fc.html", fcHtml, "utf-8");
      fs.writeFileSync("debug_record.html", recordHtml, "utf-8");

      try {
        const home = parseHome(homeHtml);
        // home 파싱 실패 시 playerData에서 재시도
        const usePd = !home.playerName && playerHtml;
        const effective = usePd ? parseHome(playerHtml) : home;
        console.log(`[web] parseHome: name="${effective.playerName}", rating=${effective.rating}, fc=${effective.friendCode}, usePd=${usePd}`);
        console.log(`[web] avatar url: ${effective.avatar?.substring(0, 80) || "(empty)"}`);
        console.log(`[web] avatar b64: ${avatarBase64 ? avatarBase64.substring(0, 40) + "..." : "(empty)"}`);
        const { playCount } = parsePlayerData(playerHtml);
        const fcRaw = parseFC(fcHtml);
        const fc = effective.friendCode || (/^\d{13}$/.test(fcRaw) ? fcRaw : "") || token;
        const recentRecords = parseRecentRecords(recordHtml);
        const top5Records = parseTop5(recordHtml);
        console.log(`[web] recentRecords: ${recentRecords.length} songs, top5: ${top5Records.length} unique`);

        cacheProfile({
          playerName: effective.playerName || "???", rating: effective.rating || 0,
          ratingMax: effective.ratingMax || 0, gradeImg: effective.gradeImg || "",
          avatar: effective.avatar || "", trophy: effective.trophy || "",
          trophyClass: effective.trophyClass || "normal", stars: effective.stars || "0",
          playCount: playCount || 0, comment: effective.comment || "", friendCode: fc,
        }, playCount || 0, homeHtml, JSON.stringify({ recent: recentRecords, top5: top5Records }));
        saveUserSession(userId, "{}", fc);

        // base64 아바타 → DB에 저장
        if (avatarBase64 && avatarBase64.startsWith("data:")) {
          const m = avatarBase64.match(/^data:image\/\w+;base64,(.+)$/);
          if (m) saveAvatarBlob(userId, m[1]);
        }
        if (Array.isArray(data.js)) {
          let saved = 0;
          data.js.forEach((j: any) => {
            if (j?.data && j?.url) {
              const m = (j.url as string).match(/\/img\/Music\/([^.]+)\.png/);
              if (m) {
                const b64 = (j.data as string).replace(/^data:image\/\w+;base64,/, "");
                saveSongJacket(m[1], Buffer.from(b64, "base64"));
                saved++;
              }
            }
          });
          console.log(`[web] song jackets saved: ${saved}`);
        }
        console.log(`[web] 저장: ${effective.playerName} ⭐${effective.rating} fc=${fc}`);
        res.writeHead(200); res.end("ok");
      } catch (e) {
        console.error("[web] 동기화 실패:", e);
        res.writeHead(500); res.end("sync error");
      }
      return;
    }

    res.writeHead(404); res.end();
  });

  server.listen(port, () => console.log(`[maimai] 🌐 http://localhost:${port}`));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => r(d)); });
}
