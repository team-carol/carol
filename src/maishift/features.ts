/**
 * maishift 공식 API 에 아직 엔드포인트가 없어 꺼 둔 기능. 운영자가 엔드포인트를 곧 만들어 주기로 했다(2026-10-21).
 * 꺼져 있는 동안에는 그 데이터를 받던 서버 함수(serverFn.ts)를 부르지 않는다.
 * 엔드포인트가 나오면 그 데이터를 api.ts 로 받게 바꾸고 여기서 켠다.
 */
export const PENDING_FEATURES = {
  /** 미래시 레이팅표(/레이팅표 type:미래시, /사진관 레이팅 종류) */
  future: false,
  /** 스탬프 카드(/스탬프, /사진관 사진 종류) */
  stamps: false,
  /** 곡 상세의 버전별 상수 이력과 달성률 변화 */
  trackHistory: false,
} as const;
