import { getAllAliases, getTranslationAliases, getAllArtistAliases, getArtistTranslationAliases } from "./storage";

// 곡명 → 별명 목록 (캐롤 자체 SQLite의 song_aliases 테이블에서 로드)
let aliasMap: Map<string, string[]> = new Map();
// 곡명 → 한국어 번역 별명 (is_translation = 1로 지정된 것)
let translationMap: Map<string, string> = new Map();
// 곡명 → 외부(maishift) 한국어 번역. 표시는 캐롤봇 번역 별명이 없는 곡에만 쓰고, 검색에는 별명처럼 늘 쓴다.
let externalTranslationMap: Map<string, string> = new Map();
export function setExternalTranslations(map: Map<string, string>): void { externalTranslationMap = map; }

// 공백 제거 + 소문자 정규화 (mailog 검색과 동일한 매칭 규칙)
export function normalizeQuery(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "");
}

/**
 * /검색 이스터에그: 검색어 맨 앞의 "근"을 뗀 검색어. 그대로는 맞는 곡이 없을 때만 이걸로 다시 찾는다
 * ("근나리 해저담" → "나리 해저담"). 맨 앞이 "근"이 아니거나 떼면 아무것도 안 남으면 null.
 */
export function withoutGeunPrefix(query: string): string | null {
  const s = query.trim();
  if (!s.startsWith("근")) return null;
  return s.slice(1).trim() || null;
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

// 해당 곡명의 별명이 정규화된 질의 q를 포함하는지. maishift 한국어 번역도 별명처럼 찾는다.
export function aliasMatches(title: string, q: string): boolean {
  const external = externalTranslationMap.get(title);
  if (external && normalizeQuery(external).includes(q)) return true;
  const aliases = aliasMap.get(title);
  if (!aliases) return false;
  return aliases.some((a) => normalizeQuery(a).includes(q));
}

// 곡의 한국어 번역. 캐롤봇 번역 별명이 우선이고, 없으면 maishift 번역. 둘 다 없으면 null.
export function getTranslation(title: string): string | null {
  return translationMap.get(title) ?? externalTranslationMap.get(title) ?? null;
}

// 제목이 일본어/한자로만 이뤄졌는지 (한글·라틴 문자가 없고, 가나 또는 한자를 포함).
// 한국어 번역이 필요한 곡 판정에 사용.
const KANA_KANJI = /[぀-ヿ㐀-䶿一-鿿豈-﫿]/;
const HANGUL = /[가-힣ᄀ-ᇿ㄰-㆏]/;
const LATIN = /[A-Za-z]/;
export function isTranslatableTitle(title: string): boolean {
  return KANA_KANJI.test(title) && !HANGUL.test(title) && !LATIN.test(title);
}

// 번역 표시 설정이 켜져 있고 번역이 있으면 번역으로 치환, 아니면 원제.
export function displayTitle(title: string, translate: boolean): string {
  if (!translate) return title;
  return getTranslation(title) ?? title;
}

// ─── 아티스트 별명·번역 (/관리 → 아티스트 별명, artist_aliases) ─────────────────
// 키는 카탈로그(maishift 곡 목록)의 아티스트 문자열 그대로다("A feat. B" 도 한 덩어리).
let artistAliasMap: Map<string, string[]> = new Map();
let artistTranslationMap: Map<string, string> = new Map();

export async function loadArtistAliases(): Promise<void> {
  const rows = await getAllArtistAliases();
  const map = new Map<string, string[]>();
  for (const { artist, alias } of rows) map.set(artist, [...(map.get(artist) ?? []), alias]);
  artistAliasMap = map;
  artistTranslationMap = new Map((await getArtistTranslationAliases()).map((t) => [t.artist, t.alias]));
  console.log(`[aliases] 아티스트 별명 ${rows.length}개 (아티스트 ${map.size}명), 번역 ${artistTranslationMap.size}개 로드`);
}

/** 테스트용: DB 없이 아티스트 별명·번역을 넣는다. */
export function setArtistAliasesForTest(aliases: Map<string, string[]>, translations: Map<string, string>): void {
  artistAliasMap = aliases;
  artistTranslationMap = translations;
}

/** 아티스트 이름이나 그 별명(번역 포함)이 정규화된 질의 q 를 포함하는지. */
export function artistMatches(artist: string, q: string): boolean {
  if (!q) return false;
  if (normalizeQuery(artist).includes(q)) return true;
  return (artistAliasMap.get(artist) ?? []).some((a) => normalizeQuery(a).includes(q));
}

export function getArtistTranslation(artist: string): string | null {
  return artistTranslationMap.get(artist) ?? null;
}

// 아티스트명 번역 설정(/설정, translate_artists)이 켜져 있고 번역이 있으면 번역, 아니면 원래 이름.
export function displayArtist(artist: string, translate: boolean): string {
  if (!translate) return artist;
  return getArtistTranslation(artist) ?? artist;
}
