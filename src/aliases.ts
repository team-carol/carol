import { getAllAliases, getTranslationAliases } from "./storage";

// 곡명 → 별명 목록 (캐롤 자체 SQLite의 song_aliases 테이블에서 로드)
let aliasMap: Map<string, string[]> = new Map();
// 곡명 → 한국어 번역 별명 (is_translation = 1로 지정된 것)
let translationMap: Map<string, string> = new Map();

// 공백 제거 + 소문자 정규화 (mailog 검색과 동일한 매칭 규칙)
export function normalizeQuery(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "");
}

export async function loadAliases(): Promise<void> {
  const rows = await getAllAliases();
  const map = new Map<string, string[]>();
  for (const { title, alias } of rows) {
    const list = map.get(title) ?? [];
    list.push(alias);
    map.set(title, list);
  }
  aliasMap = map;
  translationMap = new Map((await getTranslationAliases()).map((t) => [t.title, t.alias]));
  console.log(`[aliases] 별명 ${rows.length}개 (곡 ${map.size}개), 번역 ${translationMap.size}개 로드`);
}

// 해당 곡명의 별명이 정규화된 질의 q를 포함하는지
export function aliasMatches(title: string, q: string): boolean {
  const aliases = aliasMap.get(title);
  if (!aliases) return false;
  return aliases.some((a) => normalizeQuery(a).includes(q));
}

// 곡의 한국어 번역(지정된 것). 없으면 null.
export function getTranslation(title: string): string | null {
  return translationMap.get(title) ?? null;
}

// 제목이 일본어/한자로만 이뤄졌는지 (한글·라틴 문자가 없고, 가나 또는 한자를 포함).
// 한국어 번역이 필요한 곡 판정에 사용.
const KANA_KANJI = /[぀-ヿ㐀-䶿一-鿿豈-﫿]/;
const HANGUL = /[가-힣ᄀ-ᇿ㄰-㆏]/;
const LATIN = /[A-Za-z]/;
export function isTranslatableTitle(title: string): boolean {
  return KANA_KANJI.test(title) && !HANGUL.test(title) && !LATIN.test(title);
}

// 번역 표시 설정이 켜져 있고 번역이 지정돼 있으면 번역으로 치환, 아니면 원제.
export function displayTitle(title: string, translate: boolean): string {
  if (!translate) return title;
  return translationMap.get(title) ?? title;
}
