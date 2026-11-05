/**
 * 캐롤봇에서 한 번이라도 연 maishift 공개 플레이리스트의 이름·주인·보면 수. /플레이리스트·/랜덤 자동완성이 쓴다.
 * maishift API 에는 공개 플레이리스트 목록이 없어(본인 목록 /me/playlists 는 OAuth 필요) 번호만으로는 무슨 목록인지
 * 알 수 없으므로, 누가 번호로 연 목록을 기억해 두고 다음부터 이름으로 고르게 한다. 공개 목록의 공개 정보만 둔다.
 * 비공개로 바뀌었거나 지워졌으면(받을 때 not_found/private) 잊고, 오래 아무도 열지 않은 목록도 잊는다.
 */
import { getKvCache, saveKvCache } from "../storage";
import { getPlaylist, parsePlaylistId, type Playlist } from "./stats";
import { MaishiftError } from "./serverFn";
import { msg } from "../messages";

export interface KnownPlaylist {
  id: number;
  title: string;
  owner: string;
  region: string;
  count: number;
  /** 마지막으로 연 시각(ms) */
  seenAt: number;
  /** 연 횟수 */
  uses: number;
}

const KV_KEY = "maishift_playlists";
const MAX_ENTRIES = 500;
const FORGET_AFTER_MS = 180 * 24 * 60 * 60 * 1000;

let known: Map<number, KnownPlaylist> | null = null;
let loading: Promise<Map<number, KnownPlaylist>> | null = null;

async function load(): Promise<Map<number, KnownPlaylist>> {
  if (known) return known;
  loading ??= (async () => {
    const map = new Map<number, KnownPlaylist>();
    try {
      const row = await getKvCache(KV_KEY);
      const cutoff = Date.now() - FORGET_AFTER_MS;
      for (const p of row ? (JSON.parse(row.data) as KnownPlaylist[]) : []) if (p && p.seenAt >= cutoff) map.set(p.id, p);
    } catch (e) {
      console.error("[playlist-index] 복원 실패:", e);
    }
    known = map;
    return map;
  })();
  return loading;
}

async function save(map: Map<number, KnownPlaylist>): Promise<void> {
  const list = [...map.values()].sort((a, b) => b.seenAt - a.seenAt).slice(0, MAX_ENTRIES);
  if (list.length < map.size) for (const id of [...map.keys()]) if (!list.some((p) => p.id === id)) map.delete(id);
  await saveKvCache(KV_KEY, JSON.stringify(list)).catch((e) => console.error("[playlist-index] 저장 실패:", e));
}

/** 플레이리스트를 받고(maishift 캐시 10분) 이름을 기억한다. 비공개·없는 목록이면 잊고 오류를 그대로 던진다. */
export async function openPlaylist(id: number): Promise<Playlist> {
  const map = await load();
  try {
    const list = await getPlaylist(id);
    const prev = map.get(id);
    map.set(id, { id, title: list.title, owner: list.owner.handle, region: list.region, count: list.items.length, seenAt: Date.now(), uses: (prev?.uses ?? 0) + 1 });
    await save(map);
    return list;
  } catch (e) {
    if (e instanceof MaishiftError && (e.kind === "not_found" || e.kind === "private") && map.delete(id)) await save(map);
    throw e;
  }
}

const norm = (s: string) => s.normalize("NFKC").toLowerCase().replace(/\s+/g, "");

/** 검색어에 맞는 기억해 둔 목록. 많이 연 것 → 최근에 연 것 순. 검색어가 없으면 전부. */
export function matchPlaylists(list: KnownPlaylist[], query: string, limit = 25): KnownPlaylist[] {
  const q = norm(query.replace(/^#/, ""));
  const id = parsePlaylistId(query);
  return list
    .filter((p) => !q || p.id === id || norm(p.title).includes(q) || norm(p.owner).includes(q))
    .sort((a, b) => Number(b.id === id) - Number(a.id === id) || b.uses - a.uses || b.seenAt - a.seenAt)
    .slice(0, limit);
}

export async function searchPlaylists(query: string, limit = 25): Promise<KnownPlaylist[]> {
  return matchPlaylists([...(await load()).values()], query, limit);
}

const choiceName = (s: string) => (s.length > 100 ? `${s.slice(0, 99)}…` : s);

/**
 * 자동완성 선택지: 기억해 둔 목록을 "이름 — 주인 · N보면 (#번호)" 로. 처음 보는 번호·주소를 입력 중이면 맨 위에
 * "그 번호 불러오기" 를 둔다. 값은 번호.
 */
export async function playlistChoices(query: string): Promise<{ name: string; value: string }[]> {
  const hits = await searchPlaylists(query, 25);
  const out = hits.map((p) => ({ name: choiceName(msg("playlist.choice", { title: p.title, owner: p.owner, count: p.count, id: p.id })), value: String(p.id) }));
  const id = parsePlaylistId(query);
  if (id && !hits.some((p) => p.id === id)) out.unshift({ name: choiceName(msg("playlist.choiceNew", { id })), value: String(id) });
  return out.slice(0, 25);
}

/**
 * 옵션 값 → 플레이리스트 번호. 자동완성에서 고르면 번호가 오고, 고르지 않고 입력했으면 번호·주소로 읽고,
 * 그것도 아니면 기억해 둔 목록의 이름으로 찾는다(가장 많이 연 것). 못 찾으면 null.
 */
export async function resolvePlaylistInput(input: string): Promise<number | null> {
  const id = parsePlaylistId(input);
  if (id) return id;
  const q = norm(input);
  if (!q) return null;
  return (await searchPlaylists(input, 1))[0]?.id ?? null;
}
