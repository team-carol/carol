import * as http from "http";
import * as fs from "fs";
import { gunzip } from "zlib";
import { promisify } from "util";
import { parseHome, parsePlayerData, parseFriendCode as parseFC, parseRecentRecords, parsePlaylogHistory, parseTop5, parseTopSongs, parseMusicScore, mergeTopRecords, getMaimaiBaseUrl, parseMapAreas, parsePlaylogDetail } from "../scraper";
import { cacheProfile, getCachedProfile, saveUserSession, getUserSyncToken, findUserBySyncToken, getUserFriendCodeForServer, saveAvatarBlob, getAvatarBlob, getSongJacket, saveSongJacket, getExtraBookmarklets, getProfilePrivate, setProfilePrivate, addExtraBookmarklet, removeExtraBookmarklet, getEnabledBookmarkletPresetIds, setBookmarkletPresetEnabled, getUserDefaultServer, setUserDefaultServer, isMaimaiServer, getMapImage, saveMapImage, saveAchievementPlayEventLogBatch, getAllAliases, addAlias, deleteAlias, setAliasTranslation, getTranslateTitles, setTranslateTitles, getRegisteredUserCount, getAchievementMinimum, setAchievementMinimum } from "../storage";
import { buildBookmarkletJs, setBaseUrl, getBaseUrl, buildBookmarklet, BOOKMARKLET_PRESETS, getBookmarkletPresets } from "./bookmarklet";
import { computeRatingTarget, getAllSongTitles } from "../constants";
import { settingsPage } from "./settingsPage";
import { aliasAdminPage } from "./aliasAdminPage";
import { isValidAdminToken } from "./adminAuth";
import { loadAliases } from "../aliases";
import { CONFIG } from "../config";
import { hasValidRecordDate, recordPlayedAt } from "../achievements";

const isDev = !CONFIG.baseUrl;
const DISCORD_INVITE_BASE_URL = "https://discord.com/oauth2/authorize";
const DISCORD_INVITE_PERMISSIONS = "2415938560";
const DISCORD_INVITE_INTEGRATION_TYPE = "0";
const gunzipAsync = promisify(gunzip);
const MAX_SYNC_BYTES = 20_000_000;

export { setBaseUrl, getBaseUrl, buildBookmarklet };

// 길드 수는 Discord client에서만 알 수 있어 지연 게터로 주입받는다 (요청 시 호출).
let getGuildCount: (() => number) | null = null;
export function setGuildCountProvider(fn: () => number): void { getGuildCount = fn; }

function discordInviteUrl(): string | null {
  const configuredUrl = CONFIG.discordInviteUrl?.trim();
  if (configuredUrl) return configuredUrl;

  const clientId = CONFIG.clientId.trim();
  if (!clientId) return null;

  const params = new URLSearchParams({
    client_id: clientId,
    permissions: DISCORD_INVITE_PERMISSIONS,
    integration_type: DISCORD_INVITE_INTEGRATION_TYPE,
    scope: "applications.commands bot",
  });
  return `${DISCORD_INVITE_BASE_URL}?${params.toString()}`;
}

async function cacheMapImages(areas: readonly { imageUrl: string }[], server: string): Promise<number> {
  const uniqueUrls = Array.from(new Set(areas.map((area) => area.imageUrl).filter((url) => url.length > 0)));
  let saved = 0;
  for (const imageUrl of uniqueUrls) {
    if (await getMapImage(imageUrl)) continue;
    try {
      const resp = await fetch(imageUrl);
      if (!resp.ok) continue;
      await saveMapImage(imageUrl, Buffer.from(await resp.arrayBuffer()));
      saved++;
    } catch (e) {
      console.warn(`[web] map image fetch failed (${server}): ${imageUrl}`, e instanceof Error ? e.message : e);
    }
  }
  return saved;
}

function guidePage(token: string, bookmarklet: string): string {
  const bmEscaped = bookmarklet.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/`/g, "\\`");
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>북마클릿 설치 - carolbot</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',system-ui,-apple-system,sans-serif;background:#0d0d0d;color:#ccc;font-size:16px;line-height:1.5;-webkit-font-smoothing:antialiased;display:flex;justify-content:center;min-height:100vh;padding:80px 24px}
.wrap{width:100%;max-width:600px}
h1{font-size:48px;font-weight:700;color:#fff;letter-spacing:-0.5px;margin-bottom:40px;line-height:1.1}
.mono{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;letter-spacing:.5px;text-transform:uppercase;color:#888;margin-bottom:12px}
.tabs{display:flex;gap:8px;margin-bottom:24px}
.tabBtn{flex:1;background:#1a1a1a;color:#888;border:1px solid #2a2a2a;border-radius:8px;padding:10px 20px;font-family:inherit;font-size:14px;font-weight:500;cursor:pointer;transition:all .15s}
.tabBtn.active{background:#9333ea;color:#fff;border-color:#9333ea}
.settingsLink{display:inline-flex;align-items:center;justify-content:center;gap:6px;background:#111;color:#c084fc;border:1px solid #9333ea;border-radius:8px;padding:10px 16px;font-size:14px;font-weight:500;text-decoration:none;transition:all .15s;white-space:nowrap}
.settingsLink:hover{background:#1a1a1a;color:#fff;box-shadow:inset 0 0 0 1px #9333ea}
.card{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:16px;padding:28px;margin-bottom:16px}
.bm{display:inline-flex;align-items:center;gap:8px;background:#9333ea;color:#fff;border-radius:8px;padding:12px 24px;font-size:15px;font-weight:600;text-decoration:none;cursor:grab;margin:16px 0 6px;transition:opacity .15s}
.bm:active{opacity:.8}
.copy-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;background:#9333ea;color:#fff;border:none;border-radius:8px;padding:14px 24px;font-family:inherit;font-size:15px;font-weight:600;cursor:pointer;margin:12px 0;transition:opacity .15s}
.copy-btn:active{opacity:.8}
.copy-ok{color:#4ade80;font-size:13px;text-align:center;min-height:18px;margin-top:6px}
.steps{list-style:none;counter-reset:s}
.step{counter-increment:s;display:flex;gap:14px;margin-bottom:14px;font-size:15px;line-height:1.5}
.step::before{content:counter(s);flex-shrink:0;width:26px;height:26px;background:#9333ea;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:400}
a{color:#c084fc}
.tab{display:none}
.tab.active{display:block}
code{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:13px;background:#252525;color:#ccc;padding:2px 6px;border-radius:4px}
.extra{margin-top:40px;padding-top:32px;border-top:1px solid #2a2a2a}
.extra h2{font-size:22px;color:#fff;margin-bottom:10px;letter-spacing:-.2px}
.extraIntro{font-size:15px;color:#aaa;margin-bottom:16px;line-height:1.6}
.extraActions{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.extraCard{background:#151515;border:1px solid #2a2a2a;border-radius:12px;padding:16px;text-decoration:none;color:#ccc;transition:all .15s}
.extraCard:hover{border-color:#9333ea;background:#1a1a1a}
.extraCard strong{display:block;color:#fff;font-size:15px;margin-bottom:6px}
.extraCard span{display:block;color:#777;font-size:13px;line-height:1.5}
@media(max-width:500px){h1{font-size:36px}body{padding:48px 16px}.tabs{gap:6px}.tabBtn,.settingsLink{padding:10px 12px}.card{padding:20px}.extraActions{grid-template-columns:1fr}}
</style></head><body>
<div class="wrap">
<p class="mono">carolbot</p>
<h1>북마클릿<br>설치</h1>
<div class="tabs">
<button class="tabBtn active" id="tbPC" onclick="sw('PC')">💻 PC</button>
<button class="tabBtn" id="tbMB" onclick="sw('MB')">📱 모바일</button>
<a class="settingsLink" href="/settings?code=${token}">⚙️ 설정</a>
</div>
<div class="tab active" id="tPC">
<div class="card">
<p class="mono">Step 01</p>
<p>아래 버튼을 브라우저 북마크바로 드래그하세요.</p>
<a class="bm" href="${bookmarklet}" draggable="true">Carol Bot</a>
<p style="font-size:13px;color:#666;margin-top:6px">북마크바가 없으면 <code>Ctrl+Shift+B</code></p>
</div>
<div class="card">
<p class="mono">Step 02</p>
<p><a href="/settings?code=${token}">설정</a> 페이지에서 프리셋 북마클릿을 설정하세요.</p>
<p style="font-size:13px;color:#666;margin-top:6px">캐롤봇 동기화 시 함께 실행할 외부 북마클릿(예: maishift)을 켜고 끌 수 있습니다.</p>
</div>
<div class="card">
<p class="mono">Step 03</p>
<p><a href="https://maimaidx-eng.com/maimai-mobile/" target="_blank">maimai DX NET</a> 또는 <a href="https://maimaidx.jp/maimai-mobile/" target="_blank">maimaiでらっくすNET</a>에서 저장한 북마크를 클릭하세요.</p>
</div>
</div>
<div class="tab" id="tMB">
<div class="card">
<p class="mono">Step 01</p>
<p>아래 버튼으로 북마클릿 코드를 복사하세요.</p>
<button class="copy-btn" onclick="copyBm()">📋 코드 복사</button>
<div class="copy-ok" id="cpOk"></div>
</div>
<div class="card">
<p class="mono">Step 02</p>
<p><a href="/settings?code=${token}">설정</a> 페이지에서 프리셋 북마클릿을 설정하세요.</p>
<p style="font-size:13px;color:#666;margin-top:6px">캐롤봇 동기화 시 함께 실행할 외부 북마클릿(예: maishift)을 켜고 끌 수 있습니다.</p>
</div>
<div class="card">
<p class="mono">Step 03</p>
<ol class="steps">
<li class="step"><strong>빈 페이지를 북마크 저장</strong> (⭐ 또는 공유 → 북마크 추가)</li>
<li class="step">북마크 목록을 열고, 방금 저장한 북마크를 <strong>편집</strong></li>
<li class="step">URL 칸을 모두 지우고, 복사한 코드를 <strong>붙여넣기</strong></li>
<li class="step"><a href="https://maimaidx-eng.com/maimai-mobile/" target="_blank">maimai DX NET</a> 또는 <a href="https://maimaidx.jp/maimai-mobile/" target="_blank">maimaiでらっくすNET</a>에서 해당 북마크 실행</li>
</ol>
</div>
</div>
<div class="extra">
<p class="mono">추가 북마클릿</p>
<h2>사설 북마클릿 관리</h2>
<p class="extraIntro">여러 계정이나 서버를 쓰는 경우, 설정 페이지에서 북마클릿을 최대 <strong>5개</strong>까지 추가로 등록할 수 있습니다.</p>
<div class="extraActions">
<a class="extraCard" href="/settings?code=${token}"><strong>추가</strong><span>이름과 코드를 입력해 새 북마클릿 등록</span></a>
<a class="extraCard" href="/settings?code=${token}"><strong>삭제</strong><span>등록된 목록에서 필요 없는 북마클릿 제거</span></a>
<div class="extraCard"><strong>사용</strong><span>기본 북마클릿처럼 maimai DX net에서 실행</span></div>
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
      setTimeout(function(){document.getElementById('cpOk').textContent='';},3000);
    }).catch(fallback);
  } else { fallback(); }
  function fallback(){
    var ta=document.createElement('textarea');
    ta.value=code;ta.style.position='fixed';ta.style.opacity='0';
    document.body.appendChild(ta);ta.focus();ta.select();
    try{document.execCommand('copy');document.getElementById('cpOk').textContent='✅ 복사 완료!';}
    catch(e){document.getElementById('cpOk').textContent='❌ 수동 복사 필요';}
    document.body.removeChild(ta);
    setTimeout(function(){document.getElementById('cpOk').textContent='';},3000);
  }
}
if(/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) sw('MB');
</script>
</body></html>`;
}

export function startWebServer(port: number): void {
  const server = http.createServer((req, res) => { void (async () => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    const url = new URL(req.url || "/", `http://localhost:${port}`);

    if (req.method === "GET" && url.pathname === "/invite") {
      const targetUrl = discordInviteUrl();
      if (!targetUrl) { res.writeHead(500); res.end("missing_client_id"); return; }
      res.writeHead(302, { Location: targetUrl, "cache-control": "no-cache" });
      res.end();
      return;
    }

    // 랜딩페이지용 통계 (carol-web의 STATS_URL 대상)
    if (req.method === "GET" && url.pathname === "/api/stats") {
      const userCount = await getRegisteredUserCount();
      const serverCount = getGuildCount ? getGuildCount() : 0;
      const version =
        process.env.RELEASE_VERSION?.trim() ||
        process.env.BUILD_VERSION?.trim() ||
        "local";
      res.writeHead(200, {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=300",
      });
      res.end(JSON.stringify({ userCount, serverCount, version }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/avatar") {
      const uid = url.searchParams.get("user") || "";
      const serverParam = url.searchParams.get("server") || "";
      const server = isMaimaiServer(serverParam) ? serverParam : undefined;
      const data = await getAvatarBlob(uid, server);
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
      let imgData = await getSongJacket(musicId);
      if (!imgData) {
        try {
          const origins = [getMaimaiBaseUrl("intl"), getMaimaiBaseUrl("jp")];
          for (const origin of origins) {
            const resp = await fetch(`${origin}/maimai-mobile/img/Music/${musicId}.png`);
            if (!resp.ok) continue;
            imgData = Buffer.from(await resp.arrayBuffer());
            await saveSongJacket(musicId, imgData);
            break;
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
      const code = url.searchParams.get("code") ?? "";
      const userId = code ? await findUserBySyncToken(code) : null;
      const extras = userId ? await getExtraBookmarklets(userId) : [];
      const presetIds = userId ? await getEnabledBookmarkletPresetIds(userId) : [];
      const bookmarklets = [...getBookmarkletPresets(presetIds), ...extras];
      res.end(buildBookmarkletJs(bookmarklets));
      return;
    }

    if (req.method === "GET" && url.pathname === "/privacy") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(`<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>개인정보처리방침 - carolbot</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#0d0d0d;color:#ccc;max-width:720px;margin:40px auto;padding:24px;line-height:1.7}
h1{color:#fff;border-bottom:1px solid #2a2a2a;padding-bottom:12px;margin-bottom:24px}
h2{color:#ddd;margin:28px 0 12px}
p{margin:8px 0}
a{color:#c084fc}
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
<title>이용약관 - carolbot</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#0d0d0d;color:#ccc;max-width:720px;margin:40px auto;padding:24px;line-height:1.7}
h1{color:#fff;border-bottom:1px solid #2a2a2a;padding-bottom:12px;margin-bottom:24px}
h2{color:#ddd;margin:28px 0 12px}
p{margin:8px 0}
a{color:#c084fc}
</style></head><body>
<h1>이용약관</h1>
<p>최종 수정일: 2026년 6월</p>
<h2>1. 서비스 설명</h2>
<p>carolbot은 Discord에서 SEGA의 아케이드 리듬 게임 「maimai DX」의 공식 웹사이트(maimai DX net) 프로필을 조회할 수 있는 비공식 팬 메이드 봇입니다.</p>
<h2>2. 저작권</h2>
<p>본 서비스는 SEGA와 공식적으로 제휴, 후원 또는 승인되지 않았습니다. maimai DX, maimai DX net 및 관련된 모든 게임 자산, 캐릭터, 음악, 이미지, 상표의 저작권 및 모든 권리는 <strong>SEGA Corporation</strong>에 있습니다. 본 봇은 팬 목적으로만 운영됩니다.</p>
	<h2>3. 사용자 책임</h2>
	<p>사용자는 maimai DX net에 로그인된 상태에서 북마클릿을 실행하여 데이터를 전송합니다. 이 과정에서 발생하는 모든 책임은 사용자에게 있습니다.</p>
	<h2>4. 추가 북마클릿 사용 책임</h2>
	<p>사용자가 직접 추가하거나 활성화한 외부 북마클릿, 프리셋 외 스크립트, 제3자 제공 코드의 실행 여부와 결과는 전적으로 사용자 본인의 판단과 책임에 따릅니다. carolbot은 해당 스크립트를 작성, 검증, 통제하지 않으며, 그로 인해 발생하는 데이터 손실, 계정 문제, 보안 사고, 서비스 이용 제한, 기타 손해에 대해 책임을 지지 않습니다.</p>
	<h2>5. 서비스 중단</h2>
	<p>본 서비스는 언제든지 사전 통지 없이 중단될 수 있습니다. 서비스 제공자는 서비스 중단으로 인한 손해에 대해 책임을 지지 않습니다.</p>
	<h2>6. 면책 조항</h2>
	<p>본 서비스는 "있는 그대로" 제공되며, 어떠한 종류의 명시적 또는 묵시적 보증 없이 제공됩니다.</p>
	</body></html>`);
      return;
    }

    if (req.method === "GET" && url.pathname === "/sync") {
      const token = url.searchParams.get("code") || "";
      const userId = await findUserBySyncToken(token);
      if (!userId && !isDev) { res.writeHead(403); res.end("expired"); return; }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(guidePage(token, userId ? buildBookmarklet(token, port) : buildBookmarklet("preview", port)));
      return;
    }

    if (req.method === "GET" && url.pathname === "/settings") {
      const token = url.searchParams.get("code") || "";
      const userId = await findUserBySyncToken(token);
      if (!userId && !isDev) { res.writeHead(403); res.end("expired"); return; }
      const isPrivate = userId ? await getProfilePrivate(userId) : false;
      const presetIds = userId ? await getEnabledBookmarkletPresetIds(userId) : [];
      const bookmarklets = userId ? await getExtraBookmarklets(userId) : [];
      const defaultServer = userId ? await getUserDefaultServer(userId) : "intl";
      const translate = userId ? await getTranslateTitles(userId) : false;
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(settingsPage(token, isPrivate, presetIds, bookmarklets, defaultServer, translate));
      return;
    }

    // ─── 곡 별명 관리 (관리자, /별명 명령으로 발급한 토큰 필요) ──────────────
    if (req.method === "GET" && url.pathname === "/admin/aliases") {
      const token = url.searchParams.get("code") || "";
      if (!isValidAdminToken(token)) { res.writeHead(403); res.end("expired"); return; }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(aliasAdminPage(token, getAllSongTitles(), await getAllAliases()));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/aliases") {
      const token = url.searchParams.get("code") || "";
      if (!isValidAdminToken(token)) { res.writeHead(403, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: false, error: "expired" })); return; }
      try {
        const body = JSON.parse(await readBody(req));
        const title = typeof body.title === "string" ? body.title : "";
        const alias = (typeof body.alias === "string" ? body.alias : "").trim();
        if (!title || !alias) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "곡과 별명을 모두 입력하세요" }));
          return;
        }
        const created = await addAlias(title, alias);
        if (!created) {
          res.writeHead(409, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "이미 존재하는 별명입니다" }));
          return;
        }
        await loadAliases();
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, alias: created }));
      } catch {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "invalid_body" }));
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/aliases/delete") {
      const token = url.searchParams.get("code") || "";
      if (!isValidAdminToken(token)) { res.writeHead(403, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: false, error: "expired" })); return; }
      try {
        const body = JSON.parse(await readBody(req));
        const id = typeof body.id === "number" ? body.id : parseInt(body.id, 10);
        if (!Number.isInteger(id)) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "invalid_id" }));
          return;
        }
        const removed = await deleteAlias(id);
        if (removed) await loadAliases();
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: removed }));
      } catch {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "invalid_body" }));
      }
      return;
    }

    // 별명을 해당 곡의 한국어 번역으로 지정/해제 (곡당 1개)
    if (req.method === "POST" && url.pathname === "/api/admin/aliases/translation") {
      const token = url.searchParams.get("code") || "";
      if (!isValidAdminToken(token)) { res.writeHead(403, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: false, error: "expired" })); return; }
      try {
        const body = JSON.parse(await readBody(req));
        const id = typeof body.id === "number" ? body.id : parseInt(body.id, 10);
        const on = !!body.on;
        if (!Number.isInteger(id)) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "invalid_id" }));
          return;
        }
        const title = await setAliasTranslation(id, on);
        if (title === null) {
          res.writeHead(404, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "not_found" }));
          return;
        }
        await loadAliases();
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, title, on }));
      } catch {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "invalid_body" }));
      }
      return;
    }

    // ─── Settings API ─────────────────────────────────────────────────────
    if (req.method === "GET" && url.pathname === "/api/settings") {
      const token = url.searchParams.get("code") || "";
      const userId = await findUserBySyncToken(token);
      if (!userId) { res.writeHead(403, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "expired" })); return; }
      const isPrivate = await getProfilePrivate(userId);
      const presets = await getEnabledBookmarkletPresetIds(userId);
      const bookmarklets = await getExtraBookmarklets(userId);
      const defaultServer = await getUserDefaultServer(userId);
      const translate = await getTranslateTitles(userId);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ private: isPrivate, presets, bookmarklets, defaultServer, translate, minimumAchievement: await getAchievementMinimum(userId) }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/settings/achievement-filter") {
      const token=url.searchParams.get("code")||"", userId=await findUserBySyncToken(token);
      if(!userId){res.writeHead(403,{"content-type":"application/json"});res.end(JSON.stringify({error:"expired"}));return;}
      try { const body=JSON.parse(await readBody(req)); const value=body.minimumAchievement; if(typeof value!=="number"||!Number.isFinite(value)||value<0||value>101){res.writeHead(400,{"content-type":"application/json"});res.end(JSON.stringify({error:"invalid_minimum_achievement"}));return;} await setAchievementMinimum(userId,value); res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({minimumAchievement:value})); } catch {res.writeHead(400,{"content-type":"application/json"});res.end(JSON.stringify({error:"invalid_body"}));}
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/settings/translate") {
      const token = url.searchParams.get("code") || "";
      const userId = await findUserBySyncToken(token);
      if (!userId) { res.writeHead(403, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "expired" })); return; }
      try {
        const body = JSON.parse(await readBody(req));
        const value = !!body.translate;
        await setTranslateTitles(userId, value);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ translate: value }));
      } catch {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_body" }));
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/settings/privacy") {
      const token = url.searchParams.get("code") || "";
      const userId = await findUserBySyncToken(token);
      if (!userId) { res.writeHead(403, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "expired" })); return; }
      try {
        const body = JSON.parse(await readBody(req));
        const value = !!body.private;
        await setProfilePrivate(userId, value);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ private: value }));
      } catch {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_body" }));
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/settings/default-server") {
      const token = url.searchParams.get("code") || "";
      const userId = await findUserBySyncToken(token);
      if (!userId) { res.writeHead(403, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "expired" })); return; }
      try {
        const body = JSON.parse(await readBody(req));
        const server = typeof body.server === "string" ? body.server : "";
        if (!isMaimaiServer(server)) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "invalid_server" }));
          return;
        }
        await setUserDefaultServer(userId, server);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ defaultServer: server }));
      } catch {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_body" }));
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/settings/preset") {
      const token = url.searchParams.get("code") || "";
      const userId = await findUserBySyncToken(token);
      if (!userId) { res.writeHead(403, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "expired" })); return; }
      try {
        const body = JSON.parse(await readBody(req));
        const presetId = (body.presetId || "").trim();
        if (!BOOKMARKLET_PRESETS.some((preset) => preset.id === presetId)) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "invalid_preset" }));
          return;
        }
        const enabled = !!body.enabled;
        await setBookmarkletPresetEnabled(userId, presetId, enabled);
        const presets = await getEnabledBookmarkletPresetIds(userId);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ presets }));
      } catch {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_body" }));
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/settings/bookmarklet") {
      const token = url.searchParams.get("code") || "";
      const userId = await findUserBySyncToken(token);
      if (!userId) { res.writeHead(403, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "expired" })); return; }
      try {
        const body = JSON.parse(await readBody(req));
        const action: string = body.action;
        if (action === "add") {
          const label = (body.label || "").trim();
          const code = (body.code || "").trim();
          if (!label || !code) {
            res.writeHead(400, { "content-type": "application/json" });
            res.end(JSON.stringify({ error: "missing_fields" }));
            return;
          }
          const existing = await getExtraBookmarklets(userId);
          if (existing.length >= 5) {
            res.writeHead(400, { "content-type": "application/json" });
            res.end(JSON.stringify({ error: "max_reached" }));
            return;
          }
          if (existing.some((b: { label: string }) => b.label === label)) {
            res.writeHead(400, { "content-type": "application/json" });
            res.end(JSON.stringify({ error: "duplicate_label" }));
            return;
          }
          await addExtraBookmarklet(userId, label, code);
        } else if (action === "delete") {
          const label = (body.label || "").trim();
          if (!label) {
            res.writeHead(400, { "content-type": "application/json" });
            res.end(JSON.stringify({ error: "missing_fields" }));
            return;
          }
          await removeExtraBookmarklet(userId, label);
        } else {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "invalid_action" }));
          return;
        }
        const bookmarklets = await getExtraBookmarklets(userId);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ bookmarklets }));
      } catch {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_body" }));
      }
      return;
    }



    if (req.method === "POST" && url.pathname === "/sync") {
      const token = url.searchParams.get("code") || "";
      const userId = await findUserBySyncToken(token);
      const isPreview = isDev && token === "preview" && !userId;
      if (!userId && !isPreview) { res.writeHead(403); res.end("expired"); return; }
      const syncUserId = userId || "preview";

      let raw: string;
      try { raw = await readSyncBody(req); } catch (error) {
        const message = error instanceof Error ? error.message : "invalid_body";
        res.writeHead(message === "body_too_large" ? 413 : 400); res.end(message); return;
      }
      let data: any;
      try { data = JSON.parse(raw); } catch { res.writeHead(400); res.end("invalid_json"); return; }
      const syncServer = typeof data.server === "string" && isMaimaiServer(data.server) ? data.server : "intl";
      const homeHtml: string = data.h || "";
      const playerHtml: string = data.p || "";
      const fcHtml: string = data.f || "";
      const recordHtml: string = data.r || "";
      const ratingTargetHtml: string = data.rt || "";
      const top4Html: string = data.tb4 || "";
      const top3Html: string = data.tb3 || "";
      const top2Html: string = data.tb2 || "";
      const top1Html: string = data.tb1 || "";
      const top0Html: string = data.tb0 || "";
      const mapHtml: string = data.m || "";
      const eventMapHtml: string = data.em || "";
      const avatarBase64: string = data.a || "";
      const detailPayloads = Array.isArray(data.dt) ? data.dt : [];
      console.log(`[web] user=${syncUserId.slice(-6)}, server=${syncServer}, home=${homeHtml.length}B, player=${playerHtml.length}B, record=${recordHtml.length}B, ratingTarget=${ratingTargetHtml.length}B, fc=${fcHtml.length}B, top4=${top4Html.length}B, top3=${top3Html.length}B, top2=${top2Html.length}B, top1=${top1Html.length}B, top0=${top0Html.length}B, map=${mapHtml.length}B, eventMap=${eventMapHtml.length}B`);
      if (isDev) {
        fs.writeFileSync("debug_home.html", homeHtml, "utf-8");
        fs.writeFileSync("debug_pd.html", playerHtml, "utf-8");
        fs.writeFileSync("debug_fc.html", fcHtml, "utf-8");
        fs.writeFileSync("debug_record.html", recordHtml, "utf-8");
        fs.writeFileSync("debug_rating_target.html", ratingTargetHtml, "utf-8");
        fs.writeFileSync("debug_map.html", mapHtml, "utf-8");
        fs.writeFileSync("debug_event_map.html", eventMapHtml, "utf-8");
        detailPayloads.forEach((detail: unknown, idx: number) => {
          if (!detail || typeof detail !== "object") return;
          const html = "html" in detail && typeof detail.html === "string" ? detail.html : "";
          if (!html) return;
          fs.writeFileSync(`debug_detail_${idx}.html`, html, "utf-8");
        });
      }

      try {
        const home = parseHome(homeHtml, syncServer);
        const usePd = !home.playerName && playerHtml;
        const effective = usePd ? parseHome(playerHtml, syncServer) : home;
        console.log(`[web] parseHome: name="${effective.playerName}", rating=${effective.rating}, fc=${effective.friendCode}, usePd=${usePd}`);
        console.log(`[web] avatar url: ${effective.avatar?.substring(0, 80) || "(empty)"}`);
        console.log(`[web] avatar b64: ${avatarBase64 ? avatarBase64.substring(0, 40) + "..." : "(empty)"}`);
        const { playCount, totalPlayCount } = parsePlayerData(playerHtml);
        const fcRaw = parseFC(fcHtml);
        // 친구코드 우선순위: 13자리인 값만 채택. home의 input[name=idx]는
        // 내수판에서 페이지 인덱스("0")를 반환하므로 13자리 검증을 통과한 값만 사용한다.
        const fc = [effective.friendCode, fcRaw].find((v) => v && /^\d{13}$/.test(v)) || token;

        const recentRecords = parseRecentRecords(recordHtml, syncServer);
        const historyRecords = parsePlaylogHistory(recordHtml, syncServer);
        const detailMap = new Map<string, string>();
        for (const detail of detailPayloads) {
          if (!detail || typeof detail !== "object") continue;
          const idx = "idx" in detail && typeof detail.idx === "string" ? detail.idx : "";
          const html = "html" in detail && typeof detail.html === "string" ? detail.html : "";
          if (!idx || !html) continue;
          detailMap.set(idx, html);
        }
        const enrichedRecentRecords = recentRecords.map((record) => {
          const detailHtml = record.detailIdx ? detailMap.get(record.detailIdx) : undefined;
          return detailHtml ? { ...record, ...parsePlaylogDetail(detailHtml) } : record;
        });
        const enrichedHistoryRecords = historyRecords.map((record) => {
          const detailHtml = record.detailIdx ? detailMap.get(record.detailIdx) : undefined;
          return detailHtml ? { ...record, ...parsePlaylogDetail(detailHtml) } : record;
        });
        const clearHtmls = [top4Html, top3Html, top2Html, top1Html, top0Html].filter((h) => h);
        const clearRecords = clearHtmls.length > 0 ? mergeTopRecords(clearHtmls.map((h) => parseMusicScore(h, syncServer))) : [];
        // 내수판(JP)은 레이팅 대상 페이지 수집에 유료 코스가 필요하므로,
        // 전체 기록에서 레이팅 대상(신곡 15 + 구곡 35)을 직접 추론한다.
        const topRecords = syncServer === "jp"
          ? computeRatingTarget(clearRecords, syncServer)
          : ratingTargetHtml
            ? parseMusicScore(ratingTargetHtml, syncServer)
            : parseTop5(recordHtml, syncServer);
        const mapAreas = [
          ...parseMapAreas(mapHtml, "normal", syncServer),
          ...parseMapAreas(eventMapHtml, "event", syncServer),
        ];
        const emptyFc = clearRecords.filter((r) => !r.fc).length;
        const expectedRecentRecords = Math.min(Math.max(playCount || 1, 1), 5);
        console.log(`[web] recentRecords: ${enrichedRecentRecords.length} songs, historyRecords: ${enrichedHistoryRecords.length} songs, top: ${topRecords.length} (rating target), clear: ${clearRecords.length} (empty fc: ${emptyFc}), mapAreas: ${mapAreas.length}, detailPayloads: ${detailMap.size}`);

        if (!effective.playerName || !/^\d{13}$/.test(fc) || enrichedRecentRecords.length < expectedRecentRecords || clearRecords.length === 0 || topRecords.length === 0) {
          console.warn("[web] invalid sync payload", {
            hasName: !!effective.playerName,
            hasFriendCode: /^\d{13}$/.test(fc),
            recent: enrichedRecentRecords.length,
            expectedRecent: expectedRecentRecords,
            clear: clearRecords.length,
            top: topRecords.length,
            recordBytes: recordHtml.length,
            clearBytes: clearHtmls.reduce((sum, html) => sum + html.length, 0),
          });
          res.writeHead(400); res.end("invalid_sync_payload");
          return;
        }

        if (isPreview) {
          res.writeHead(200);
          res.end("preview_ok");
          return;
        }

        const preexistingProfile = (await getCachedProfile(`${syncServer}:${fc}`)) !== null;
        const savedProfileKey = await cacheProfile({
          playerName: effective.playerName || "???", rating: effective.rating || 0,
          ratingMax: effective.ratingMax || 0, gradeImg: effective.gradeImg || "",
          avatar: effective.avatar || "", trophy: effective.trophy || "",
          trophyClass: effective.trophyClass || "normal", stars: effective.stars || "0",
          playCount: playCount || 0, totalPlayCount: totalPlayCount || 0, comment: effective.comment || "", friendCode: fc,
        }, playCount || 0, JSON.stringify(enrichedRecentRecords), JSON.stringify(topRecords), JSON.stringify(clearRecords), syncServer, JSON.stringify(mapAreas));
        const syncStamp = Date.now();
        const canonicalBatch = enrichedHistoryRecords.map((record, index) => {
          if (!record.detailIdx || !hasValidRecordDate(record.date)) {
            throw new Error("canonical history missing source identity or timestamp");
          }
          return {
            profileKey: savedProfileKey, sourcePlayId: record.detailIdx, chartKey: `${record.title}|${record.musicKind}|${record.diff}`,
            playedAt: recordPlayedAt(record.date), sourceSequence: enrichedHistoryRecords.length - index,
            capturedAt: syncStamp, recordJson: JSON.stringify(record), achievementVal: record.achievementVal,
            fc: record.fc, sync: record.sync, ratingUp: record.ratingUp, isNewScore: record.isNewScore,
            title: record.title, diff: record.diff, level: record.level,
            musicKind: record.musicKind, achievementText: record.achievement,
          };
        });
        const canonicalStatus = await saveAchievementPlayEventLogBatch(canonicalBatch, syncStamp, preexistingProfile);
        await saveUserSession(syncUserId, "{}", savedProfileKey, syncServer);

        const savedMapImages = await cacheMapImages(mapAreas, syncServer);
        console.log(`[web] map images saved: ${savedMapImages}`);

        // base64 아바타 → DB에 저장
        if (avatarBase64 && avatarBase64.startsWith("data:")) {
          const m = avatarBase64.match(/^data:image\/\w+;base64,(.+)$/);
          if (m) await saveAvatarBlob(syncUserId, syncServer, m[1]);
        }
        if (Array.isArray(data.js)) {
          let saved = 0;
          for (const j of data.js) {
            if (j && typeof j === "object" && "data" in j && "url" in j && typeof j.data === "string" && typeof j.url === "string") {
              const m = j.url.match(/\/img\/Music\/([^.]+)\.png/);
              if (m) {
                const b64 = j.data.replace(/^data:image\/\w+;base64,/, "");
                await saveSongJacket(m[1], Buffer.from(b64, "base64"));
                saved++;
              }
            }
          }
          console.log(`[web] song jackets saved: ${saved}`);
        }
        console.log(`[web] 저장: ${effective.playerName} ⭐${effective.rating} server=${syncServer} fc=${fc} canonical=${canonicalStatus}`);
        res.writeHead(200); res.end(canonicalStatus);
      } catch (e) {
        console.error("[web] 동기화 실패:", e);
        res.writeHead(500); res.end("sync error");
      }
      return;
    }

    res.writeHead(404); res.end();
  })().catch((error: unknown) => {
    console.error("[web] request failed:", error);
    if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    if (!res.writableEnded) res.end("internal_server_error");
  }); });

  server.on("error", (error) => console.error("[web] server error:", error));
  server.listen(port, () => console.log(`[maimai] 🌐 http://localhost:${port}`));
}

function readBody(req: http.IncomingMessage, maxBytes = 20_000_000): Promise<string> {
  return new Promise((resolve, reject) => { let d = ""; let size = 0; req.on("data", (c) => { size += c.length; if (size > maxBytes) { reject(new Error("body_too_large")); req.destroy(); return; } d += c; }); req.on("end", () => resolve(d)); req.on("error", reject); });
}

async function readSyncBody(req: http.IncomingMessage): Promise<string> {
  const body = Buffer.from(await readBodyBuffer(req, MAX_SYNC_BYTES));
  if (String(req.headers["content-encoding"] || "").toLowerCase() !== "gzip") return body.toString("utf8");
  try {
    const decoded = await gunzipAsync(body, { maxOutputLength: MAX_SYNC_BYTES });
    if (decoded.length > MAX_SYNC_BYTES) throw new Error("body_too_large");
    return decoded.toString("utf8");
  } catch (error) {
    if (error instanceof Error && error.message === "body_too_large") throw error;
    throw new Error("invalid_gzip");
  }
}

function readBodyBuffer(req: http.IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []; let size = 0;
    req.on("data", (chunk: Buffer) => { size += chunk.length; if (size > maxBytes) { reject(new Error("body_too_large")); req.destroy(); return; } chunks.push(chunk); });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
