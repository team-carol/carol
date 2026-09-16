// mai-notes 메타데이터 인덱스.
//
// constants / aliases 와 같은 방식이다: DB 에 사본을 두고, 시작할 때 메모리로
// 올려 조회는 전부 로컬에서 한다. 자동완성은 Discord 가 3초 안에 답을 요구하므로
// 매 입력마다 DB 를 때리지 않는다.

import { replaceMainotesIndex, getMainotesSyncState, getMainotesIndex, setMainotesSyncedNow } from "../storage";
import { normalizeQuery, aliasMatches } from "../aliases";
import { fetchManifest, flatten } from "./client";

export interface IndexedChart {
  id: string;            // mai-notes 채보 UUID
  songId: string;
  title: string;
  artist: string;
  difficulty: number;    // 1..5
  level: string;         // "13+" 등 표기 레벨
  internalLevel: number; // 정수(定数). 없으면 0
  designer: string;
  hasData: boolean;      // mai-notes 가 채보 본문을 가지고 있는지
  notes: number;
  type: string;          // "deluxe" | "standard"
}

let INDEX: IndexedChart[] = [];
/** 정규화한 제목을 미리 만들어 둔다. 자동완성마다 다시 계산하지 않기 위함. */
let NORM: string[] = [];

export function indexSize(): number { return INDEX.length; }
export function getChartById(id: string): IndexedChart | null {
  return INDEX.find((c) => c.id === id) ?? null;
}

/**
 * 곡 이름으로 채보를 찾는다. 별명·번역도 같이 본다.
 * 채보 본문이 있는 것(hasData)을 앞에, 그다음 난이도 높은 순으로 돌려준다.
 */
export function searchCharts(query: string, limit = 25): IndexedChart[] {
  const q = normalizeQuery(query);
  if (!q) {
    return [...INDEX].sort(rank).slice(0, limit);
  }
  const hits: IndexedChart[] = [];
  for (let i = 0; i < INDEX.length; i++) {
    if (NORM[i].includes(q) || aliasMatches(INDEX[i].title, q)) hits.push(INDEX[i]);
  }
  return hits.sort(rank).slice(0, limit);
}

function rank(a: IndexedChart, b: IndexedChart): number {
  if (a.hasData !== b.hasData) return a.hasData ? -1 : 1;
  if (a.title !== b.title) return a.title.localeCompare(b.title);
  return b.difficulty - a.difficulty;
}

/** 인덱스를 통째로 갈아끼운다. DB 로드와 테스트가 같은 통로를 쓴다. */
export function setMainotesIndex(rows: IndexedChart[]): void {
  INDEX = rows;
  NORM = rows.map((r) => normalizeQuery(r.title));
}

/** DB 사본을 메모리로 올린다. 네트워크를 쓰지 않는다. */
export async function loadMainotesIndex(): Promise<void> {
  const rows = (await getMainotesIndex()) as any[];
  setMainotesIndex(rows.map((r) => ({
    id: r.id, songId: r.songId, title: r.title ?? "", artist: r.artist ?? "",
    difficulty: Number(r.difficulty ?? 0), level: r.level ?? "",
    internalLevel: Number(r.internalLevel ?? 0), designer: r.designer ?? "",
    hasData: r.hasData === 1 || r.hasData === true, notes: Number(r.notes ?? 0),
    type: r.type ?? "",
  })));
  const withData = INDEX.filter((c) => c.hasData).length;
  console.log(`[mainotes] 인덱스 ${INDEX.length}개 (채보 데이터 보유 ${withData}개)`);
}

/** 하루 한 번 이상은 부르지 않는다. 상대 서버에 부담을 주지 않기 위한 하한. */
const MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface SyncResult { skipped: boolean; changed: boolean; songs: number; charts: number }

/**
 * manifest.json 을 받아 DB 사본을 교체한다.
 * - 마지막 동기화로부터 24시간이 안 지났으면 아무것도 하지 않는다(force 로 무시 가능)
 * - ETag 가 같으면 304 로 끝나고 본문을 받지 않는다
 */
export async function syncMainotes(force = false): Promise<SyncResult> {
  const state = (await getMainotesSyncState()) as { etag: string; syncedAt: number } | null;
  if (!force && state && Date.now() - state.syncedAt < MIN_INTERVAL_MS) {
    return { skipped: true, changed: false, songs: 0, charts: 0 };
  }

  const res = await fetchManifest(state?.etag || undefined);
  if (!res.changed || !res.manifest) {
    // 내용이 그대로면 다음 24시간 창을 다시 여는 것만 기록한다.
    await setMainotesSyncedNow();
    return { skipped: false, changed: false, songs: 0, charts: 0 };
  }

  const { songs, charts } = flatten(res.manifest);
  await replaceMainotesIndex(songs, charts, res.etag, res.manifest.generated_at ?? "");
  await loadMainotesIndex();
  return { skipped: false, changed: true, songs: songs.length, charts: charts.length };
}
