import { toInt } from "@team-carol/design-system";
import { circle } from "@team-carol/design-system/game";
import { CIRCLE_COLORS, type CircleColor } from "../../scraper";

// 서클 클래스 기준(DX NET 서클 랭킹 규칙). 매달 1일, 지난달 순위·포인트로 그달 클래스가 정해진다.
// Purple 이하는 포인트만으로, Bronze 이상은 순위 비율(+10,000 PT 이상)로 정해진다.
export const CIRCLE_STAGE_POINTS: Partial<Record<CircleColor, number>> = {
  purple: 10000, red: 7000, yellow: 4000, green: 2000,
};

// 서클 프로필 색상(DX NET circle_profile_color_*.png). 값은 디자인 시스템 circle 을 쓴다.
// gradient: 카드 이름표·띠, main: 임베드 테두리색(숫자), ink: 이름표 위 글자색.
export const CIRCLE_COLOR_STYLE = Object.fromEntries(
  CIRCLE_COLORS.map((c) => [c, { gradient: circle[c].gradient, main: toInt(circle[c].main), ink: circle[c].ink }]),
) as Record<CircleColor, { gradient: string; main: number; ink: string }>;
