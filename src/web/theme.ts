// 웹 페이지 공용 디자인. 토큰·리셋·컴포넌트(crl-*)는 @team-carol/design-system 의 CSS 를 그대로 넣고,
// 여기에는 디자인 시스템에 없는 캐롤봇 전용 조각(페이지 틀, 상태 문구, 토글 스위치 등)만 둔다.
// 페이지 CSS 는 var(--crl-*) 토큰만 쓰고 색을 직접 박지 않는다. 토큰이 맞지 않으면 디자인 시스템 저장소에서 고친다.

import { color, fontFamily, fontUrls, withAlpha } from "@team-carol/design-system";
import { carolCss } from "@team-carol/design-system/css";

export const LANDING_URL = "https://www.team-carol.com";
export const BRAND_AVATAR_PATH = "/brand/avatar.png";

/** 페이지 밖(북마클릿 오버레이 등 CSS 변수를 못 쓰는 곳)에서 쓰는 원시 색 값. */
export const T = color;

/** 인라인 style="..." 속성 안에 넣을 수 있게 따옴표를 뺀 글꼴 목록. */
export const OVERLAY_FONT_SANS = fontFamily.sans.replace(/"/g, "");
export const OVERLAY_FONT_MONO = fontFamily.mono.replace(/"/g, "");

/**
 * 북마클릿 오버레이(옵션 프리셋·채보 등록)가 쓰는 색·글꼴. 오버레이 JS 는 String.raw 라 ${ 를 못 쓰므로
 * 소스 안의 OVERLAY_THEME_PLACEHOLDER 자리를 withOverlayTheme() 로 이 JSON 으로 바꿔 넣는다.
 */
const OVERLAY_THEME = {
  bg: color.surface, border: color.border, line: color.surface2, strong: color.borderStrong,
  ink: color.ink, text: color.inkSoft, muted: color.muted, dim: color.dim, faint: color.faint,
  accent: color.accent, accentInk: color.accentInk, soft: color.accentSoft, field: color.canvas,
  ok: color.success, err: color.danger, warn: color.warning,
  glow: withAlpha(color.accent, 0.14), sans: OVERLAY_FONT_SANS, mono: OVERLAY_FONT_MONO,
};
const OVERLAY_THEME_PLACEHOLDER = "__CAROL_OVERLAY_THEME__";
export function withOverlayTheme(js: string): string {
  if (!js.includes(OVERLAY_THEME_PLACEHOLDER)) throw new Error("overlay theme placeholder missing");
  return js.split(OVERLAY_THEME_PLACEHOLDER).join(JSON.stringify(OVERLAY_THEME));
}

/** <head> 공통부: 메타·제목·파비콘·폰트. */
export function pageHead(title: string): string {
  return `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<link rel="icon" type="image/png" href="${BRAND_AVATAR_PATH}">
<link rel="stylesheet" href="${fontUrls.pretendard}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${fontUrls.googleFonts}" rel="stylesheet">`;
}

/** 디자인 시스템 CSS + 모든 페이지가 공유하는 캐롤봇 전용 CSS. 페이지 <style> 맨 앞에 넣는다. */
export const BASE_CSS = `${carolCss}
body{min-height:100vh;display:flex;flex-direction:column}
ol,ul{margin:0;padding:0}
.page{flex:1;width:100%;margin:0 auto;padding:clamp(40px,7vw,80px) var(--crl-gutter) clamp(56px,8vw,96px)}
.page-title{margin-bottom:12px}
.page-lead{margin-bottom:32px}
.page .crl-card{margin-bottom:14px}
.crl-card.is-on{border-color:color-mix(in srgb,var(--crl-accent) 55%,transparent)}
.crl-tabs--fill{display:flex}
.crl-tabs--fill .crl-tab{flex:1}
.crl-btn--danger:hover:not(:disabled){color:var(--crl-danger);box-shadow:0 0 0 1px var(--crl-danger-border)}
.sp{flex:1}
.bm{cursor:grab}
.bm:active{cursor:grabbing}
.status{font-size:13px;text-align:center;min-height:20px;margin-top:8px;color:var(--crl-dim);transition:opacity .2s}
.status:empty{min-height:0;margin-top:0}
.st{font-size:12.5px;color:var(--crl-dim)}
.status.ok,.st.ok{color:var(--crl-success)}
.status.err,.st.err{color:var(--crl-danger)}
.empty{color:var(--crl-faint);font-size:14px;text-align:center;padding:18px 0;line-height:1.7}
.switch{position:relative;width:48px;height:28px;flex-shrink:0}
.switch input{opacity:0;width:0;height:0;position:absolute}
.switch .slider{position:absolute;cursor:pointer;inset:0;background:var(--crl-surface-2);box-shadow:inset 0 0 0 1px var(--crl-border-strong);border-radius:var(--crl-radius-pill);transition:.2s}
.switch .slider::before{content:'';position:absolute;height:22px;width:22px;left:3px;top:3px;background:var(--crl-ink-2);border-radius:50%;transition:.2s}
.switch input:checked+.slider{background:var(--crl-accent);box-shadow:none}
.switch input:checked+.slider::before{transform:translateX(20px);background:var(--crl-ink)}
.switch input:disabled+.slider{cursor:not-allowed;opacity:.6}
.switch input:focus-visible+.slider{outline:2px solid var(--crl-focus);outline-offset:2px}
@media(max-width:560px){.page .crl-card{padding:22px}}`;

/** 랜딩과 같은 상단바. right 에는 이미 만든 링크 HTML 을 넣는다. */
export function topbar(right = ""): string {
  return `<header class="crl-topbar"><div class="crl-topbar__inner"><a class="crl-brand" href="${LANDING_URL}"><img class="crl-brand__mark" src="${BRAND_AVATAR_PATH}" alt="" width="30" height="30">캐롤봇</a><span class="crl-topbar__spacer"></span>${right}</div></header>`;
}

/** 사용자 페이지(북마클릿 설치·게임 설정·설정) 상단바 오른쪽 링크. */
export function userNav(token: string, active: "sync" | "options" | "settings"): string {
  const items: [typeof active, string, string][] = [["sync", "/sync", "추가 북마클릿"], ["options", "/options", "게임 설정"], ["settings", "/settings", "설정"]];
  return items.map(([id, path, label]) =>
    `<a class="crl-topbar__link"${id === active ? ' aria-current="page"' : ""} href="${path}?code=${token}">${label}</a>`).join("");
}

export function siteFooter(): string {
  return `<footer class="crl-footer"><div class="crl-footer__inner"><span>team carol</span><span class="sp"></span><a href="/terms">이용약관</a><a href="/privacy">개인정보처리방침</a><a href="${LANDING_URL}">캐롤봇 홈</a></div></footer>`;
}

/** /관리 페이지(곡 별명·봇 문구·채보 등록) 공용. BASE_CSS 뒤에 ADMIN_CSS 를 같이 넣는다. */
export const ADMIN_CSS = `.page{max-width:var(--crl-container-narrow)}
.admin-tabs{margin:0 0 28px}
.admin-sub{font-size:var(--crl-type-body-sm-size);line-height:var(--crl-type-body-sm-line-height);color:var(--crl-muted);margin-bottom:24px}`;

type AdminTab = "aliases" | "artists" | "names" | "messages" | "commands" | "import" | "patch-notes";
const ADMIN_TABS: [AdminTab, string][] = [["aliases", "곡 별명"], ["artists", "아티스트 별명"], ["names", "이름 번역"], ["messages", "봇 문구"], ["commands", "명령어"], ["import", "채보 등록"], ["patch-notes", "패치노트"]];

export function adminTabs(token: string, active: AdminTab): string {
  return `<nav class="crl-tabs crl-tabs--contained admin-tabs">${ADMIN_TABS.map(([id, label]) =>
    `<a class="crl-tab${id === active ? " is-active" : ""}" href="/admin/${id}?code=${token}">${label}</a>`).join("")}</nav>`;
}

/** 관리 페이지 상단바 오른쪽 표시. */
export const ADMIN_BADGE = `<span class="crl-topbar__link">관리</span>`;
