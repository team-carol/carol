/**
 * maishift 스탬프 카드(/profile/<id>/stamp 페이지와 같은 데이터). /스탬프 가 쓴다.
 * 업로드할 때만 바뀌므로 아이디·지역마다 5분 둔다.
 */
import { callServerFn, FN, type MaishiftRegion } from "./serverFn";

export type StampType = "PARTNER" | "SONG" | "ICON" | "NAMEPLATE" | "FRAME" | string;
export interface StampTrack { difficulty: string; internalLevel: number; internalLevelIsAccurate: boolean }
export interface StampCard {
  name: string;
  type: StampType;
  /** 보상 이미지(DX NET) */
  imageUrl: string;
  displayName: string;
  complete: boolean;
  stampCount: number;
  maxCount: number;
  /** 곡 스탬프면 곡과 보면들 */
  song: { song: { title: string; type: string; songVersion: number; jacketUrl: string }; tracks: StampTrack[] } | null;
}

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; cards: StampCard[] }>();

/** 그 아이디의 스탬프 캐시를 지운다(프로필이 비공개로 바뀌었을 때). */
export function forgetStampCards(handle: string): void {
  for (const k of [...cache.keys()]) if (k.endsWith(`:${handle.toLowerCase()}`)) cache.delete(k);
}

export async function getStampCards(handle: string, region: MaishiftRegion): Promise<StampCard[]> {
  const key = `${region}:${handle.toLowerCase()}`;
  const have = cache.get(key);
  if (have && Date.now() - have.at < TTL_MS) return have.cards;
  const res = await callServerFn<StampCard[] | Record<string, StampCard>>(FN.stamps, { handle, region });
  // seroval 배열이 객체(0,1,2…)로 풀릴 수 있어 값만 모은다.
  const cards = (Array.isArray(res) ? res : Object.values(res ?? {})).filter((c): c is StampCard => !!c && typeof c.displayName === "string");
  cache.set(key, { at: Date.now(), cards });
  while (cache.size > 200) cache.delete(cache.keys().next().value!);
  return cards;
}
