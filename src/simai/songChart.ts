// /검색 결과의 곡·난이도 → 보면 플레이어에 띄울 채보. "채보 보기" 링크(디스코드 Activity 링크, src/activity.ts activityLink)가 쓴다.
// 링크의 custom_id 는 곡 고르기 값(constants.ts songPickValue — 종류·제목의 해시)과 난이도 번호뿐이라 짧고(메시지 글자 수 한도),
// 봇을 다시 켜도 같은 곡으로 풀린다. 채보는 그때그때 검색 인덱스(mai-notes + 운영자 등록분)에서 찾는다.

import { songPickValue, resolveSongPick } from "../constants";
import { normalizeQuery } from "../aliases";
import { searchAllCharts, type ChartHit } from "./chartSearch";

const KIND_TYPE: Record<string, string> = { DX: "deluxe", ST: "standard" };

/**
 * 곡(카탈로그 제목·종류 "ST"/"DX")의 난이도(1..5)별 채보. 검색 인덱스에 본문이 있는 것만.
 * 같은 종류를 먼저 쓰고, 종류를 모르는 채보(등록분)는 그 난이도에 같은 종류가 없을 때만 쓴다.
 */
export function songCharts(title: string, musicKind: string): Map<number, ChartHit> {
  const nt = normalizeQuery(title);
  const want = KIND_TYPE[musicKind] ?? "";
  const out = new Map<number, ChartHit>();
  if (!nt) return out;
  for (const h of searchAllCharts(title, 200)) {
    if (normalizeQuery(h.title) !== nt || !(h.difficulty >= 1 && h.difficulty <= 5)) continue;
    if (want && h.type && h.type !== want) continue;
    const have = out.get(h.difficulty);
    if (!have || (have.type !== want && h.type === want)) out.set(h.difficulty, h);
  }
  return out;
}

/** "채보 보기" 링크의 custom_id: "s" + 곡 해시 10자 + 난이도 번호. */
export function songChartId(title: string, musicKind: string, difficulty: number): string {
  return `s${songPickValue(title, musicKind).slice(1)}${difficulty}`;
}

/** custom_id → 채보(검색 키는 .key). 모르는 곡·채보가 없는 난이도·다른 모양이면 null. */
export function resolveSongChartId(customId: string): ChartHit | null {
  const m = /^s([0-9a-f]{10})([1-5])$/.exec(customId);
  if (!m) return null;
  const song = resolveSongPick(`#${m[1]}`);
  if (!song) return null;
  return songCharts(song.title, song.musicKind).get(Number(m[2])) ?? null;
}
