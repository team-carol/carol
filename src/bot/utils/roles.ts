// 레이팅 단계 이름·색(프로필 임베드 색). 디스코드 역할 자동 부여 기능은 2.0.0 에서 없앴다. 카드의 별·다음 단계는 게임 기준 표(ratingCard.ts PLATE_STEPS)를 쓴다.
export const RATING_ROLES: [number, string, number][] = [
  [16750, "무지개(극) IV",  0xab30ff],
  [16500, "무지개(극) III", 0x9b20ff],
  [16250, "무지개(극) II",  0x8b10ff],
  [16000, "무지개(극) I",   0x7b00ef],
  [15750, "무지개 IV",      0xbb70ff],
  [15500, "무지개 III",     0xab50ff],
  [15250, "무지개 II",      0x9b30ff],
  [15000, "무지개 I",       0x8b00ff],
  [14750, "백금 II",        0xd4d4d4],
  [14500, "백금 I",         0xe0e0e0],
  [14250, "금 II",          0xefc600],
  [14000, "금 I",           0xffd700],
  [13000, "은",             0x8c8c8c],
  [12000, "동",             0xcd7f32],
  [10000, "보라",           0xbd5dc7],
  [6000,  "파랑",           0x4d9eea],
  [2000,  "청동",           0x95a5a6],
];

export const tierPrefixes = ["무지개", "백금", "금", "은", "동", "보라", "파랑", "청동", "MAIMAI "];

export function ratingRoleName(r: number): { name: string; color: number } | null {
  for (const [min, name, color] of RATING_ROLES) {
    if (r >= min) return { name, color };
  }
  return null;
}

export function ratingColor(r: number): number {
  return ratingRoleName(r)?.color ?? 0x95a5a6;
}
