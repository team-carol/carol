/**
 * S-레이팅. maishift 사진관의 "S-레이팅"과 같은 규칙(달성률이 아니라 DX 점수로 매긴다).
 * - 보면 하나: 상수² × DX 별 개수(0~5) ÷ 50. DX 별은 DX 점수 비율 85·90·93·95·97% 에서 하나씩 늘어난다.
 * - S-레이팅: 그 값이 큰 보면 50개(같으면 달성률이 높은 순)의 평균. 등급 이름도 평균으로 정한다.
 */
export const S_RATING_COUNT = 50;

export function dxStars(percent: number): number {
  return percent >= 97 ? 5 : percent >= 95 ? 4 : percent >= 93 ? 3 : percent >= 90 ? 2 : percent >= 85 ? 1 : 0;
}

export function chartSRating(constant: number, dxPercent: number): number {
  return (constant * constant * dxStars(dxPercent)) / 50;
}

/** 평균 → 등급 이름(Bronze … Rainbow++ ✦✦). 6 미만은 null. */
export function sRatingTier(mean: number): string | null {
  if (mean < 6) return null;
  if (mean < 9) return "Bronze";
  if (mean < 12) return "Silver";
  const base = mean < 14 ? 12 : mean < 16 ? 14 : mean < 18 ? 16 : mean < 20 ? 18 : 20;
  const stars = "✦".repeat(Math.max(1, Math.min(4, Math.floor((mean - base) / 0.5) + 1)));
  const name = mean < 14 ? "Gold" : mean < 16 ? "Platinum" : mean < 18 ? "Rainbow" : mean < 20 ? "Rainbow+" : "Rainbow++";
  return `${name} ${stars}`;
}

/** 보면 값: 소수 2자리 내림. maishift 와 같은 숫자가 나오도록 부동소수점 보정 없이 그대로 내린다(13.0 ✦5 → 16.89). */
export function formatChartSRating(v: number): string {
  return (Math.floor(v * 100) / 100).toFixed(2);
}

/** S-레이팅(평균): 소수 3자리. */
export function formatSRating(mean: number): string {
  return mean.toFixed(3);
}
