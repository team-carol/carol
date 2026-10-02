import type { CircleColor } from "../../scraper";

// 서클 클래스 기준(DX NET 서클 랭킹 규칙). 매달 1일, 지난달 순위·포인트로 그달 클래스가 정해진다.
// Purple 이하는 포인트만으로, Bronze 이상은 순위 비율(+10,000 PT 이상)로 정해진다.
export const CIRCLE_STAGE_POINTS: Partial<Record<CircleColor, number>> = {
  purple: 10000, red: 7000, yellow: 4000, green: 2000,
};

// 서클 프로필 색상(DX NET circle_profile_color_*.png). 게임 안 피라미드 그림의 띠 색을 따라 잡았다.
// gradient: 카드 이름표·띠, main: 임베드 테두리색, ink: 이름표 위 글자색.
export const CIRCLE_COLOR_STYLE: Record<CircleColor, { gradient: string; main: number; ink: string }> = {
  rainbow: { gradient: "linear-gradient(90deg, #ff8fb1, #ffd36e, #8be8a8, #7ec8ff, #c59bff)", main: 0xc59bff, ink: "#1a1a1c" },
  gold: { gradient: "linear-gradient(90deg, #e8b93a, #fff3b0, #e8b93a)", main: 0xf2c94c, ink: "#1a1a1c" },
  silver: { gradient: "linear-gradient(90deg, #6cb8e6, #e8f7ff, #6cb8e6)", main: 0x8fd3f4, ink: "#1a1a1c" },
  bronze: { gradient: "linear-gradient(90deg, #7a3e22, #d99a6c, #7a3e22)", main: 0xb06a43, ink: "#fff7f0" },
  purple: { gradient: "linear-gradient(90deg, #b06ee8, #ead5ff, #b06ee8)", main: 0xc48af5, ink: "#1a1a1c" },
  red: { gradient: "linear-gradient(90deg, #e9546f, #ffd6de, #e9546f)", main: 0xef6f86, ink: "#1a1a1c" },
  yellow: { gradient: "linear-gradient(90deg, #f2c94c, #fff4c2, #f2c94c)", main: 0xf7d66b, ink: "#1a1a1c" },
  green: { gradient: "linear-gradient(90deg, #5fcfa9, #d6fff0, #5fcfa9)", main: 0x7fe0bf, ink: "#1a1a1c" },
  white: { gradient: "linear-gradient(90deg, #cfd9e2, #ffffff, #cfd9e2)", main: 0xdfe7ee, ink: "#1a1a1c" },
};
