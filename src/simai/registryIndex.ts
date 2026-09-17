// 운영자 등록분(simai_charts.source='registry') 의 검색 인덱스.
//
// mai-notes 인덱스와 같은 방식: DB 를 메모리로 올려 /보면 곡명 자동완성이 네트워크·DB
// 를 타지 않고 즉시 답한다(Discord 자동완성 3초 제한). import 로 채보가 늘면 다시 올린다.

import { listRegistryCharts } from "../storage";
import { normalizeQuery, aliasMatches } from "../aliases";

export interface RegistryChart {
  id: string;        // 예: atwiki-592-4 → registry:<id> 로 /보면 이 가져온다
  title: string;
  artist: string;
  designer: string;
  difficulty: number;
  level: string;
}

let INDEX: RegistryChart[] = [];
let NORM: string[] = [];

export function registrySize(): number { return INDEX.length; }

export function setRegistryIndex(rows: RegistryChart[]): void {
  INDEX = rows;
  NORM = rows.map((r) => normalizeQuery(r.title));
}

/** DB 사본을 메모리로 올린다. 시작 시 1회 + import 성공 시마다. */
export async function loadRegistryIndex(): Promise<void> {
  const rows = (await listRegistryCharts()) as any[];
  setRegistryIndex(rows.map((r) => ({
    id: r.id,
    title: r.title ?? "",
    artist: r.artist ?? "",
    designer: r.designer ?? "",
    difficulty: Number(r.difficulty ?? 0),
    level: r.level ?? "",
  })));
  console.log(`[registry] 채보 인덱스 ${INDEX.length}개`);
}

function rank(a: RegistryChart, b: RegistryChart): number {
  if (a.title !== b.title) return a.title.localeCompare(b.title);
  return b.difficulty - a.difficulty;
}

/** 곡 이름·별명·번역으로 채보를 찾는다. 난이도 높은 순. */
export function searchRegistry(query: string, limit = 25): RegistryChart[] {
  const q = normalizeQuery(query);
  if (!q) return [...INDEX].sort(rank).slice(0, limit);
  const hits: RegistryChart[] = [];
  for (let i = 0; i < INDEX.length; i++) {
    if (NORM[i].includes(q) || aliasMatches(INDEX[i].title, q)) hits.push(INDEX[i]);
  }
  return hits.sort(rank).slice(0, limit);
}
