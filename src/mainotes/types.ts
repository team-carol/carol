// mai-notes.com 이 공개하는 manifest.json 의 형태.
//
// 이 파일에는 **메타데이터만** 들어 있다(곡 정보, 난이도, 정수, 노트 수).
// simai 본문은 없고, 채보 데이터가 존재하는지 여부만 has_chart_data 로 알려준다.
// 실제 채보를 받아오는 경로는 운영자 허락을 받은 뒤에 붙인다.

/** manifest.json 의 songs 값. 키는 곡 UUID. */
export interface ManifestSong {
  id: string;
  title: string;
  artist: string;
  bpm: string;
  genre: string;
  version: string;
  /** "deluxe" | "standard" — DX 보면인지 스탠다드인지. */
  type: string;
  release_date: string | null;
}

/** manifest.json 의 charts 배열 원소. */
export interface ManifestChart {
  id: string;
  song_id: string;
  /** "BASIC" | "ADVANCED" | "EXPERT" | "MASTER" | "Re:MASTER" */
  difficulty: string;
  level: string;
  internal_level: number | null;
  notes_designer: string | null;
  has_chart_data: boolean;
  notes: number | null;
}

export interface Manifest {
  generated_at: string;
  songs_count: number;
  charts_count: number;
  songs: Record<string, ManifestSong>;
  charts: ManifestChart[];
}

/** 난이도 이름 → 캐롤봇 내부 번호. src/bot/commands/chart.ts 의 DIFF_LABEL 과 같은 값. */
export const DIFFICULTY_NUMBER: Record<string, number> = {
  "BASIC": 1, "ADVANCED": 2, "EXPERT": 3, "MASTER": 4, "Re:MASTER": 5,
};
