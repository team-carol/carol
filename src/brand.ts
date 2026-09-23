// 캐롤봇 브랜드 팔레트. 랜딩(team-carol/carol-web, app/globals.css 의 @theme)과 같은 값이다.
// 웹 페이지(src/web/theme.ts)와 PNG 카드(ratingCard.ts, achievementCard.ts)가 함께 쓴다.
// 난이도·FC/AP·DX 같은 게임 고유 색은 여기 넣지 않는다.
export const BRAND = {
  canvas: "#1a1a1c",
  canvasAlt: "#211f24",
  surface: "#242427",
  surface2: "#2e2e33",
  border: "#33333a",
  border2: "#3a353d",
  ink: "#f2edef",
  ink2: "#e8dfe3",
  inkSoft: "#cfc6ca",
  muted: "#b3a8ad",
  dim: "#8a8087",
  faint: "#6f676c",
  accent: "#ff9294",
  accentHover: "#f2787b",
  accentInk: "#3a1e1e",
  accentSoft: "#f2b3bf",
} as const;
