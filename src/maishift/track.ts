/**
 * maishift 곡 상세(곡 카드를 누르면 나오는 창과 같은 정보). /검색 의 "상세" 버튼이 쓴다.
 * 보면 하나에 요청 네 개(내 기록 변화·버전별 상수·분포·버전 안 순서)라, 보면 정보는 하루, 기록 변화는 5분 둔다.
 */
import { callServerFn, FN } from "./serverFn";

export interface TrackScore { at: number; achievement: number; dxScore: number; dxMax: number; combo: string; sync: string }
export interface TrackLevel { versionId: number; constant: number }
/** 레이팅 구간 하나. counts 는 랭크별 인원(AAA 미만 … SSS+, 서로 겹치지 않음). */
export interface TrackDistBucket { min: number; max: number; total: number; counts: Record<string, number> }
export interface TrackInfo { levels: TrackLevel[]; dist: TrackDistBucket[]; distAt: number | null }
export interface TrackPosition { order: number | null; total: number }

const INFO_TTL_MS = 24 * 60 * 60 * 1000;
const SCORES_TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 300;
const infoCache = new Map<number, { at: number; info: TrackInfo }>();
const scoresCache = new Map<string, { at: number; scores: TrackScore[] | null }>();
const positionCache = new Map<number, { at: number; pos: TrackPosition | null }>();

function remember<K, V>(m: Map<K, V>, k: K, v: V): void {
  m.delete(k);
  m.set(k, v);
  while (m.size > MAX_ENTRIES) m.delete(m.keys().next().value!);
}

/** 버전 폴더 안 순서(order 는 0부터, 모르면 null). /검색·/랜덤·곡 상세가 같이 쓴다. 하루 둔다. */
export async function getTrackPosition(trackId: number): Promise<TrackPosition | null> {
  const have = positionCache.get(trackId);
  if (have && Date.now() - have.at < INFO_TTL_MS) return have.pos;
  try {
    const p = await callServerFn<TrackPosition>(FN.trackPosition, { trackId });
    const pos = p && p.total > 0 ? { order: p.order ?? null, total: p.total } : null;
    remember(positionCache, trackId, { at: Date.now(), pos });
    return pos;
  } catch (e) {
    console.error(`[maishift] track ${trackId} 순서:`, (e as Error).message);
    return null;
  }
}

/** 버전별 상수·분포. 하나가 실패해도 나머지는 보여 준다. */
export async function getTrackInfo(trackId: number): Promise<TrackInfo> {
  const have = infoCache.get(trackId);
  if (have && Date.now() - have.at < INFO_TTL_MS) return have.info;
  const soft = <T>(p: Promise<T>, label: string): Promise<T | null> => p.catch((e) => {
    console.error(`[maishift] track ${trackId} ${label}:`, (e as Error).message);
    return null;
  });
  const [levels, dist] = await Promise.all([
    soft(callServerFn<{ versionId: number; internalLevel: number }[]>(FN.trackLevels, { trackId }), "상수"),
    soft(callServerFn<{ buckets: { coarse: TrackDistBucket[] }; computedAt?: string }>(FN.trackDist, { trackId }), "분포"),
  ]);
  const info: TrackInfo = {
    levels: (levels ?? []).map((l) => ({ versionId: l.versionId, constant: l.internalLevel / 10 })).sort((a, b) => a.versionId - b.versionId),
    dist: dist?.buckets?.coarse ?? [],
    distAt: dist?.computedAt ? Date.parse(dist.computedAt) || null : null,
  };
  // 전부 실패했으면 캐시하지 않는다(다음에 다시 시도).
  if (levels || dist) remember(infoCache, trackId, { at: Date.now(), info });
  return info;
}

/** 그 아이디의 보면 기록 변화 캐시를 지운다(프로필이 비공개로 바뀌었을 때). */
export function forgetTrackScores(handle: string): void {
  for (const k of [...scoresCache.keys()]) if (k.startsWith(`${handle.toLowerCase()}#`)) scoresCache.delete(k);
}

/** 그 사용자의 보면 기록 변화(업로드마다 한 점, 시간순). 이전 기록 비공개 등으로 못 받으면 null. */
export async function getTrackScores(trackId: number, handle: string): Promise<TrackScore[] | null> {
  const key = `${handle.toLowerCase()}#${trackId}`;
  const have = scoresCache.get(key);
  if (have && Date.now() - have.at < SCORES_TTL_MS) return have.scores;
  let scores: TrackScore[] | null = null;
  try {
    const list = await callServerFn<{ recordedAt: string; achievement: number; dxScore: number; dxMax: number; combo: string; sync: string }[]>(FN.trackScores, { trackId, handle });
    scores = (Array.isArray(list) ? list : [])
      .map((s) => ({ at: Date.parse(s.recordedAt), achievement: s.achievement / 10000, dxScore: s.dxScore, dxMax: s.dxMax, combo: s.combo, sync: s.sync }))
      .filter((s) => Number.isFinite(s.at))
      .sort((a, b) => a.at - b.at);
  } catch (e) {
    console.error(`[maishift] track ${trackId} 기록 변화:`, (e as Error).message);
  }
  remember(scoresCache, key, { at: Date.now(), scores });
  return scores;
}
