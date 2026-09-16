// mai-notes.com 메타데이터 클라이언트.
//
// 운영자가 명시한 유일한 조건은 "사이트에 부하가 걸릴 만한 대량 통신을 하지 말 것"
// 이다. 그래서 여기서는:
//   - manifest.json 한 개만 하루 1회 받아온다 (곡 1576개 / 채보 6390개가 한 번에 온다)
//   - ETag 조건부 요청을 보내 내용이 그대로면 304 로 끝낸다
//   - 받은 내용은 DB 에 넣고 이후 조회는 전부 로컬에서 한다
//   - User-Agent 로 누가 부르는지 밝힌다. 익명으로 긁지 않는다.

import { DIFFICULTY_NUMBER, type Manifest } from "./types";

const MANIFEST_URL = "https://mai-notes.com/data/manifest.json";
const TIMEOUT_MS = 30_000;
/** 응답이 비정상적으로 크면 파싱하지 않는다. 실측 약 3.9MB. */
const MAX_BYTES = 32 * 1024 * 1024;

/** 상대 로그에서 캐롤봇을 식별할 수 있게 한다. 문의와 연결되는 연락처를 같이 적는다. */
function userAgent(): string {
  let version = "0.0.0";
  try { version = require("../../package.json").version ?? version; } catch { /* 빌드 위치에 따라 없을 수 있다 */ }
  return `Carolbot/${version} (maimai Discord bot; contact: @roena_smoooch)`;
}

export interface ManifestFetch {
  /** 304 면 changed=false. 이때 manifest 는 없다. */
  changed: boolean;
  etag: string;
  manifest?: Manifest;
}

/** manifest.json 을 받아온다. etag 를 주면 조건부 요청이 된다. */
export async function fetchManifest(etag?: string): Promise<ManifestFetch> {
  const headers: Record<string, string> = { "User-Agent": userAgent(), "Accept": "application/json" };
  if (etag) headers["If-None-Match"] = etag;

  const res = await fetch(MANIFEST_URL, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status === 304) return { changed: false, etag: etag ?? "" };
  if (!res.ok) throw new Error(`manifest HTTP ${res.status}`);

  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) throw new Error(`manifest too large: ${len} bytes`);

  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error(`manifest too large: ${text.length} bytes`);

  const manifest = JSON.parse(text) as Manifest;
  if (!manifest || typeof manifest !== "object" || !Array.isArray(manifest.charts)) {
    throw new Error("manifest shape unexpected");
  }
  return { changed: true, etag: res.headers.get("etag") ?? "", manifest };
}

export interface FlatSong {
  id: string; title: string; artist: string; bpm: string;
  genre: string; version: string; type: string;
}
export interface FlatChart {
  id: string; songId: string; difficulty: number; level: string;
  internalLevel: number; designer: string; hasData: boolean; notes: number;
}

/** manifest 를 DB 에 넣기 좋은 평평한 행으로 바꾼다. 알 수 없는 난이도는 버린다. */
export function flatten(m: Manifest): { songs: FlatSong[]; charts: FlatChart[] } {
  const songs: FlatSong[] = [];
  for (const s of Object.values(m.songs ?? {})) {
    if (!s || !s.id) continue;
    songs.push({
      id: s.id,
      title: s.title ?? "",
      artist: s.artist ?? "",
      bpm: s.bpm ?? "",
      genre: s.genre ?? "",
      version: s.version ?? "",
      type: s.type ?? "",
    });
  }
  const known = new Set(songs.map((s) => s.id));
  const charts: FlatChart[] = [];
  for (const c of m.charts ?? []) {
    if (!c || !c.id) continue;
    const diff = DIFFICULTY_NUMBER[c.difficulty];
    // 모르는 난이도 이름이나 곡이 빠진 채보는 표시할 방법이 없으니 넣지 않는다.
    if (!diff || !known.has(c.song_id)) continue;
    charts.push({
      id: c.id,
      songId: c.song_id,
      difficulty: diff,
      level: c.level ?? "",
      internalLevel: typeof c.internal_level === "number" ? c.internal_level : 0,
      designer: c.notes_designer ?? "",
      hasData: c.has_chart_data === true,
      notes: typeof c.notes === "number" ? c.notes : 0,
    });
  }
  return { songs, charts };
}
