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

// DX ✦ 랭크 소수점 표시(maishift "DX ✦ 랭크를 소수점 첫째 자리까지 표시"). 다음 단계까지의 진행도를 0.1 단위로.
// 단계: 85% ✦1, 90% ✦2, 93% ✦3, 95% ✦4, 97% ✦5, 98% ✦5.5, 99% ✦6, 100% ✦7. 정수 계산으로 내린다.
const DX_DECIMAL_PCT = [0, 85, 90, 93, 95, 97, 98, 99, 100];
const DX_DECIMAL_TENTHS = [0, 10, 20, 30, 40, 50, 55, 60, 70];

/** DX 점수 → ✦ 랭크(0.1 단위, 0 ~ 7). */
export function dxRankDecimal(score: number, max: number): number {
  if (!(max > 0)) return 0;
  const e = score * 100;
  const t = DX_DECIMAL_PCT.map((p) => max * p);
  let n = 0;
  while (n + 1 < t.length && e >= t[n + 1]) n++;
  if (n === 0) return 0;
  if (n === t.length - 1) return DX_DECIMAL_TENTHS[n] / 10;
  const tenths = DX_DECIMAL_TENTHS[n] + Math.floor(((DX_DECIMAL_TENTHS[n + 1] - DX_DECIMAL_TENTHS[n]) * (e - t[n])) / (t[n + 1] - t[n]));
  return tenths / 10;
}

/**
 * maishift 곡 창의 DX ✦ 랭크(소수점 설정이 꺼졌을 때). 97% 까지는 별 개수와 같고,
 * 그 위는 98% ✦5.5, 99% ✦6, 99.5% ✦6.5, 100% ✦7 로 더 나눈다. S-레이팅 계산에는 쓰지 않는다(그건 dxStars).
 */
export function dxRankStep(percent: number): number {
  return percent >= 100 ? 7 : percent >= 99.5 ? 6.5 : percent >= 99 ? 6 : percent >= 98 ? 5.5 : dxStars(percent);
}

/** ✦ 뒤에 붙일 랭크 글자. decimal 이면 소수점 첫째 자리(5.7), 아니면 maishift 곡 창 단계(5, 5.5, 6, 6.5, 7). */
export function dxRankLabel(score: number, max: number, decimal: boolean): string {
  if (!(max > 0)) return "0";
  return decimal ? dxRankDecimal(score, max).toFixed(1) : String(dxRankStep((score / max) * 100));
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
