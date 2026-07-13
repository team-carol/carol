import { getAllAliases } from "./db";

// 곡명 → 별명 목록 (캐롤 자체 SQLite의 song_aliases 테이블에서 로드)
let aliasMap: Map<string, string[]> = new Map();

// 공백 제거 + 소문자 정규화 (mailog 검색과 동일한 매칭 규칙)
export function normalizeQuery(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "");
}

export function loadAliases(): void {
  const rows = getAllAliases();
  const map = new Map<string, string[]>();
  for (const { title, alias } of rows) {
    const list = map.get(title) ?? [];
    list.push(alias);
    map.set(title, list);
  }
  aliasMap = map;
  console.log(`[aliases] 별명 ${rows.length}개 (곡 ${map.size}개) 로드`);
}

// 해당 곡명의 별명이 정규화된 질의 q를 포함하는지
export function aliasMatches(title: string, q: string): boolean {
  const aliases = aliasMap.get(title);
  if (!aliases) return false;
  return aliases.some((a) => normalizeQuery(a).includes(q));
}
