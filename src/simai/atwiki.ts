// simai wiki(atwiki, w.atwiki.jp/simai) 채보를 받아들이는 서버측 로직.
//
// 실제 추출(브라우저 DOM 파싱)은 운영자 북마클릿에서 한다 — atwiki 는 Cloudflare
// 봇 차단 뒤라 서버가 직접 크롤링할 수 없고, 운영자의 실제 브라우저 세션만 통과한다.
// 북마클릿이 곡 페이지에서 아래 AtwikiSong 형태로 뽑아 /api/admin/simai/import 로
// 보내면, 여기서 simai maidata 로 재구성해 parse.ts 로 검증하고 저장한다.
//
// 재배포는 운영자 판단(비상용 · 커뮤니티가 다운로드/사용을 장려하는 전사 프로젝트)이며,
// 출처(원본 페이지 URL)와 제작자를 항상 표기해 크레딧을 남긴다.

/** 북마클릿이 곡 페이지 하나에서 뽑아 보내는 구조. */
export interface AtwikiChartInput {
  /** carol 내부 난이도 번호. 1=BASIC … 5=Re:MASTER (EASY 는 담지 않는다). */
  diff: number;
  level: string;
  designer: string;
  /** 해당 난이도의 simai 본문(줄바꿈 포함, 보통 (bpm) 으로 시작하고 E 로 끝난다). */
  notes: string;
}
export interface AtwikiSongInput {
  page: number;
  title: string;
  artist: string;
  bpm: number;
  charts: AtwikiChartInput[];
}

const ID_PREFIX = "atwiki";
export const ATWIKI_DIFF_NAMES: Record<number, string> = {
  1: "BASIC", 2: "ADVANCED", 3: "EXPERT", 4: "MASTER", 5: "Re:MASTER",
};

/** simai_charts 의 기본키. 페이지 하나에 난이도별로 한 행씩 들어간다. */
export function atwikiChartId(page: number, diff: number): string {
  return `${ID_PREFIX}-${page}-${diff}`;
}
export function parseAtwikiId(id: string): { page: number; diff: number } | null {
  const m = /^atwiki-(\d+)-(\d+)$/.exec(id);
  if (!m) return null;
  return { page: Number(m[1]), diff: Number(m[2]) };
}
/** 원본 페이지 URL 은 id 에서 되살린다(별도 컬럼 없이 크레딧 링크를 만든다). */
export function atwikiSourceUrl(page: number): string {
  return `https://w.atwiki.jp/simai/pages/${page}.html`;
}
export function atwikiSourceUrlFromId(id: string): string | null {
  const p = parseAtwikiId(id);
  return p ? atwikiSourceUrl(p.page) : null;
}

// 본문이 비정상적으로 크거나(파싱 폭주 방지) CJK 가 섞이면(코멘트 오수집) 거른다.
const MAX_NOTES = 100_000;
const CJK = /[぀-ヿ㐀-鿿豈-﫿ｦ-ﾟ]/;

function isValidNotes(s: string): boolean {
  const t = s.trim();
  if (!t || t.length > MAX_NOTES) return false;
  if (CJK.test(t)) return false;            // 코멘트/설명이 섞여 들어온 경우
  return /[{(]/.test(t) && /[,{]/.test(t);  // simai 토큰
}

export interface SanitizedSong {
  page: number;
  title: string;
  artist: string;
  bpm: number;
  charts: { diff: number; level: string; designer: string; notes: string }[];
}

/** 북마클릿 입력을 검증·정돈한다. 하나도 쓸 만한 채보가 없으면 null. */
export function sanitizeSong(raw: unknown): SanitizedSong | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const page = Number(r.page);
  if (!Number.isInteger(page) || page <= 0) return null;
  // 〈スタンダード〉/〈でらっくす〉 등 변형 구분자를 제거(별명 DB 매칭). 클라이언트에서
  // 이미 떼지만 서버에서도 방어적으로 한 번 더.
  const title = String(r.title ?? "").replace(/〈[^〉]*〉/g, "").trim().slice(0, 200);
  const artist = String(r.artist ?? "").trim().slice(0, 200);
  const bpm = Number(r.bpm) || 0;
  if (!Array.isArray(r.charts)) return null;

  const charts: SanitizedSong["charts"] = [];
  const seen = new Set<number>();
  for (const c of r.charts as unknown[]) {
    if (!c || typeof c !== "object") continue;
    const cc = c as Record<string, unknown>;
    const diff = Number(cc.diff);
    if (!Number.isInteger(diff) || diff < 1 || diff > 5 || seen.has(diff)) continue;
    const notes = String(cc.notes ?? "");
    if (!isValidNotes(notes)) continue;
    seen.add(diff);
    charts.push({
      diff,
      level: String(cc.level ?? "").trim().slice(0, 20),
      designer: String(cc.designer ?? "").trim().slice(0, 200),
      notes: notes.trim(),
    });
  }
  if (charts.length === 0) return null;
  charts.sort((a, b) => a.diff - b.diff);
  return { page, title, artist, bpm, charts };
}

/**
 * 정돈된 곡을 simai maidata 텍스트로 재구성한다. 난이도별 &lv_/&des_/&inote_ 블록을
 * 쌓는다. inote_N 은 다음 &key= 까지 이어 읽히므로(멀티라인) 각 블록 끝에 둔다.
 */
export function buildMaidata(song: SanitizedSong): string {
  const lines: string[] = [];
  lines.push(`&title=${song.title}`);
  if (song.artist) lines.push(`&artist=${song.artist}`);
  if (song.bpm > 0) lines.push(`&wholebpm=${song.bpm}`);
  for (const c of song.charts) {
    if (c.level) lines.push(`&lv_${c.diff}=${c.level}`);
    if (c.designer) lines.push(`&des_${c.diff}=${c.designer}`);
    lines.push(`&inote_${c.diff}=${c.notes}`);
  }
  return lines.join("\n") + "\n";
}
