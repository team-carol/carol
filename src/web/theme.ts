// 웹 페이지 공용 디자인 시스템. 캐롤봇 랜딩(team-carol/carol-web, app/globals.css 의 @theme)
// 토큰을 그대로 옮겨 왔다. 페이지는 여기 CSS 변수만 쓰고 색을 직접 박지 않는다.
// 색 값 자체는 src/brand.ts 에 있고, PNG 카드도 같은 값을 쓴다.

import { BRAND } from "../brand";

export const LANDING_URL = "https://www.team-carol.com";
export const BRAND_AVATAR_PATH = "/brand/avatar.png";

/** 페이지 밖(북마클릿 오버레이 등 CSS 변수를 못 쓰는 곳)에서 쓰는 원시 값. */
export const T = BRAND;

export const FONT_SANS = `"Pretendard","Pretendard Variable","Noto Sans JP",-apple-system,BlinkMacSystemFont,system-ui,sans-serif`;
export const FONT_MONO = `"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace`;

/** <head> 공통부: 메타·제목·파비콘·폰트. */
export function pageHead(title: string): string {
  return `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<link rel="icon" type="image/png" href="${BRAND_AVATAR_PATH}">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">`;
}

/** 토큰 + 리셋 + 상단바/푸터/버튼 등 모든 페이지가 공유하는 CSS. 페이지 <style> 맨 앞에 넣는다. */
export const BASE_CSS = `:root{color-scheme:dark;
--canvas:${T.canvas};--canvas-alt:${T.canvasAlt};--surface:${T.surface};--surface-2:${T.surface2};
--border:${T.border};--border-2:${T.border2};
--ink:${T.ink};--ink-2:${T.ink2};--ink-soft:${T.inkSoft};--muted:${T.muted};--dim:${T.dim};--faint:${T.faint};
--accent:${T.accent};--accent-hover:${T.accentHover};--accent-ink:${T.accentInk};--accent-soft:${T.accentSoft};
--hover-2:#332e36;--ok:#4ade80;--err:#f87171;--warn:#fbbf24;
--font-sans:${FONT_SANS};--font-mono:${FONT_MONO};--gutter:clamp(20px,4vw,40px)}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{font-family:var(--font-sans);background:var(--canvas);color:var(--ink-soft);font-size:16px;line-height:1.6;-webkit-font-smoothing:antialiased;text-wrap:pretty;min-height:100vh;display:flex;flex-direction:column}
a{color:var(--accent-soft);text-decoration:none;transition:color .15s}
a:hover{color:var(--accent)}
button,input,select,textarea{font-family:inherit}
button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid #3898ec;outline-offset:2px}
strong,b{color:var(--ink-2);font-weight:600}
code{font-family:var(--font-mono);font-size:.85em;background:var(--surface-2);color:var(--ink-2);padding:2px 6px;border-radius:6px}
.topbar{position:sticky;top:0;z-index:10;border-bottom:1px solid var(--border);background:rgba(26,26,28,.9);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}
.topbar-in{margin:0 auto;max-width:1200px;display:flex;align-items:center;gap:20px;padding:14px var(--gutter)}
.brand{display:flex;align-items:center;gap:10px;font-size:17px;font-weight:500;color:var(--ink)}
.brand:hover{color:var(--ink)}
.brand img{width:30px;height:30px;border-radius:50%;background:#fff;object-fit:cover;box-shadow:0 0 0 1px var(--surface-2)}
.topbar-sp{flex:1}
.topbar-link{font-size:15px;color:var(--muted)}
.topbar-link:hover{color:var(--ink)}
.topbar-link.on{color:var(--accent-soft);font-weight:500}
.page{flex:1;width:100%;margin:0 auto;padding:clamp(40px,7vw,80px) var(--gutter) clamp(56px,8vw,96px)}
.eyebrow{font-size:13px;font-weight:500;color:var(--dim);margin-bottom:10px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:0;border-radius:12px;padding:12px 22px;font-size:15px;font-weight:500;cursor:pointer;text-decoration:none;transition:background-color .15s,box-shadow .15s,color .15s}
.btn-primary{background:var(--accent);color:var(--accent-ink);box-shadow:0 0 0 1px var(--accent)}
.btn-primary:hover{background:var(--accent-hover);color:var(--accent-ink)}
.btn-secondary{background:var(--surface-2);color:var(--ink-2);box-shadow:0 0 0 1px var(--border-2)}
.btn-secondary:hover{background:var(--hover-2);color:var(--ink)}
.btn:disabled{opacity:.45;cursor:not-allowed}
.site-foot{border-top:1px solid var(--surface-2)}
.site-foot-in{margin:0 auto;max-width:1200px;padding:28px var(--gutter) 36px;display:flex;flex-wrap:wrap;align-items:center;gap:10px 20px;font-size:13px;color:var(--faint)}
.site-foot-in a{color:var(--dim)}
.site-foot-in a:hover{color:var(--ink)}
.site-foot-in .sp{flex:1}`;

/** 랜딩과 같은 상단바. right 에는 이미 만든 링크 HTML 을 넣는다. */
export function topbar(right = ""): string {
  return `<nav class="topbar"><div class="topbar-in"><a class="brand" href="${LANDING_URL}"><img src="${BRAND_AVATAR_PATH}" alt="" width="30" height="30">캐롤봇</a><span class="topbar-sp"></span>${right}</div></nav>`;
}

export function siteFooter(): string {
  return `<footer class="site-foot"><div class="site-foot-in"><span>team carol</span><span class="sp"></span><a href="/terms">이용약관</a><a href="/privacy">개인정보처리방침</a><a href="${LANDING_URL}">캐롤봇 홈</a></div></footer>`;
}

/** /관리 페이지(곡 별명·봇 문구·채보 등록) 공용 탭. BASE_CSS 뒤에 ADMIN_CSS 를 같이 넣는다. */
export const ADMIN_CSS = `.page{max-width:880px}
.admin-tabs{display:inline-flex;gap:4px;margin:0 0 28px;padding:4px;background:var(--surface);border:1px solid var(--border);border-radius:14px;flex-wrap:wrap}
.admin-tabs a{background:transparent;color:var(--muted);border-radius:10px;padding:8px 18px;font-size:14.5px;font-weight:500}
.admin-tabs a:hover{color:var(--ink)}
.admin-tabs a.on{background:var(--surface-2);color:var(--ink);box-shadow:0 0 0 1px var(--border-2)}
.admin-title{font-size:clamp(28px,4vw,40px);font-weight:500;color:var(--ink);letter-spacing:-.01em;line-height:1.2;margin-bottom:8px}
.admin-sub{font-size:15px;color:var(--muted);margin-bottom:24px}`;

type AdminTab = "aliases" | "messages" | "import";
const ADMIN_TABS: [AdminTab, string][] = [["aliases", "곡 별명"], ["messages", "봇 문구"], ["import", "채보 등록"]];

export function adminTabs(token: string, active: AdminTab): string {
  return `<div class="admin-tabs">${ADMIN_TABS.map(([id, label]) =>
    `<a${id === active ? ' class="on"' : ""} href="/admin/${id}?code=${token}">${label}</a>`).join("")}</div>`;
}

/** 관리 페이지 상단바 오른쪽 표시. */
export const ADMIN_BADGE = `<span class="topbar-link">관리</span>`;
