// simai 채보의 파싱 결과 타입.
//
// 파싱은 서버(여기)에서만 하고, 브라우저 플레이어에는 아래 Chart 를 JSON 으로
// 그대로 넘긴다. 채보 출처(유저 업로드 / 나중에 DB 등록)가 바뀌어도 이 타입이
// 경계라서 플레이어 쪽은 손대지 않는다.

/** 슬라이드 궤적 한 구간의 모양. `V` 는 파싱 단계에서 `-` 두 개로 분해된다. */
export type SlideType = "-" | "^" | "<" | ">" | "v" | "p" | "q" | "pp" | "qq" | "s" | "z" | "w";

export interface SlideSegment {
  type: SlideType;
  /** 시작 버튼 1~8 */
  from: number;
  /** 도착 버튼 1~8 */
  to: number;
}

/**
 * 슬라이드 하나. `1-5[8:1]*-3[8:1]` 처럼 `*` 로 이어붙인 분기 슬라이드는
 * 별(star) 하나에 SlideBody 가 여러 개 달린 형태가 된다.
 */
export interface SlideBody {
  segments: SlideSegment[];
  /** 별이 뜬 뒤 궤적이 실제로 움직이기 시작할 때까지의 대기(ms). 기본 1박. */
  delayMs: number;
  /** 궤적이 출발해서 도착할 때까지 걸리는 시간(ms). */
  durationMs: number;
  /** 슬라이드 자체가 BREAK 인지 (별이 아니라 궤적 판정). */
  isBreak: boolean;
}

/** 터치 영역. 빈 문자열이면 링 버튼(1~8) 노트. */
export type TouchArea = "" | "A" | "B" | "C" | "D" | "E";

export type NoteType = "tap" | "hold" | "slide" | "touch" | "touchHold";

export interface ChartNote {
  type: NoteType;
  /** 채보 시작점 기준 절대 시각(ms). `&first=` 오프셋이 이미 반영돼 있다. */
  timeMs: number;
  /** 4분음표 1개 = 1, 즉 한 마디 = 4 인 박 단위 위치. 마디 계산용. */
  beat: number;
  /** 링 버튼은 1~8. 터치는 영역 안에서의 번호(C 는 1). */
  pos: number;
  area: TouchArea;
  isBreak?: boolean;
  isEx?: boolean;
  /** 같은 타이밍에 2개 이상 (EACH) 인지. 노트 색이 달라진다. */
  isEach?: boolean;
  /** 터치 노트의 불꽃(`f`) 연출. */
  hasFirework?: boolean;
  /** hold / touchHold 의 길이(ms). */
  durationMs?: number;
  /** slide 전용. `*` 분기가 없으면 길이 1. */
  slides?: SlideBody[];
}

export interface BpmEvent {
  timeMs: number;
  beat: number;
  bpm: number;
}

export interface ChartStats {
  tap: number;
  hold: number;
  slide: number;
  touch: number;
  touchHold: number;
  break: number;
  /** maimai 의 "총 노트 수" 기준(슬라이드는 별+궤적을 각각 세지 않고 궤적 수로 센다). */
  total: number;
}

export interface Chart {
  notes: ChartNote[];
  bpmEvents: BpmEvent[];
  /** 첫 BPM. 표시용. */
  bpm: number;
  /** 마지막 노트가 끝나는 시각(ms). 플레이어 길이 계산용. */
  durationMs: number;
  /** 마디 수(1-based, 마지막 노트가 속한 마디). */
  measures: number;
  stats: ChartStats;
}

/** maidata.txt 한 장에 들어있는 메타 + 난이도별 채보. */
export interface Maidata {
  title: string;
  artist: string;
  /** 난이도별 제작자. `&des=` 만 있으면 전 난이도 공통. */
  designers: Record<number, string>;
  levels: Record<number, string>;
  /** `&wholebpm=` 또는 첫 `(bpm)` 에서 얻은 값. */
  bpm: number;
  /** `&first=` 오프셋(초). */
  offsetSec: number;
  /** 난이도 번호(1~7) → 채보. 보통 1=EASY … 5=Re:MASTER. */
  charts: Record<number, Chart>;
}
