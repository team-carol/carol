// /보면·/운세 의 채보 검색. mai-notes(본문이 있는 보면)와 운영자 등록분(simai wiki 등, registry)을 함께 찾는다.
// 같은 곡·같은 종류(ST/DX)·같은 난이도가 양쪽에 있으면 mai-notes 것을 쓴다.
// 두 인덱스 모두 메모리에 있어 네트워크·DB 를 타지 않는다(Discord 자동완성 3초 제한).

import { searchCharts, indexSize } from "../mainotes";
import { searchRegistry, registrySize } from "./registryIndex";
import { makeChartKey } from "./source";
import { normalizeQuery } from "../aliases";

export interface ChartHit {
  /** resolveChart 에 넘기는 키("mainotes:<uuid>" / "registry:<id>") */
  key: string;
  source: "mainotes" | "registry";
  title: string;
  artist: string;
  /** 1..5 */
  difficulty: number;
  level: string;
  /** "standard" | "deluxe" | "" */
  type: string;
}

/** 합치기 전에 각 인덱스에서 넉넉히 뽑는 수. 겹치는 것을 빼고도 limit 을 채우려는 것. */
const WIDE = 500;

export function chartIndexSize(): number {
  return indexSize() + registrySize();
}

function rank(a: ChartHit, b: ChartHit): number {
  if (a.title !== b.title) return a.title.localeCompare(b.title);
  if (a.difficulty !== b.difficulty) return b.difficulty - a.difficulty;
  return a.type.localeCompare(b.type);
}

export function searchAllCharts(query: string, limit = 25): ChartHit[] {
  const mainotes: ChartHit[] = searchCharts(query, WIDE)
    .filter((c) => c.hasData)
    .map((c) => ({ key: makeChartKey("mainotes", c.id), source: "mainotes", title: c.title, artist: c.artist, difficulty: c.difficulty, level: c.level, type: c.type }));
  // 같은 곡·난이도에서 mai-notes 가 가진 종류. 등록분의 종류가 비어 있으면(모름) 어느 종류든 겹친 것으로 본다.
  const have = new Map<string, Set<string>>();
  for (const c of mainotes) {
    const k = `${normalizeQuery(c.title)}|${c.difficulty}`;
    (have.get(k) ?? have.set(k, new Set()).get(k)!).add(c.type);
  }
  const registry: ChartHit[] = searchRegistry(query, WIDE)
    .filter((c) => {
      const types = have.get(`${normalizeQuery(c.title)}|${c.difficulty}`);
      return !types || (c.type !== "" && !types.has(c.type));
    })
    .map((c) => ({ key: makeChartKey("registry", c.id), source: "registry", title: c.title, artist: c.artist, difficulty: c.difficulty, level: c.level, type: c.type }));
  return [...mainotes, ...registry].sort(rank).slice(0, limit);
}
