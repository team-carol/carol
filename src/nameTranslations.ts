/**
 * 지방 이름·스탬프 카드 이름의 한국어 번역(/관리 → 이름 번역). 곡명 번역과 같은 설정(/설정 한국어 번역)을 따른다.
 * 봇이 본 이름은 번역이 비어 있는 채로 DB 에 쌓아 두고, 운영자가 관리 화면에서 채운다.
 */
import { listNameTranslations, noteNames, listStoredAreas } from "./storage";

export type NameKind = "area" | "stamp";
export const NAME_KINDS: NameKind[] = ["area", "stamp"];

const translations = new Map<string, string>();
// 이미 DB 에 있는 이름. 같은 이름을 매번 INSERT 하지 않도록.
const known = new Set<string>();
const keyOf = (kind: NameKind, source: string) => `${kind}\u0000${source}`;

/**
 * 지방 이름은 "メトロポリスちほー7" 처럼 끝 번호만 다른 이름이 이어진다. 번역은 번호를 뗀 이름에 한 번만 달고,
 * 보여 줄 때 번호를 다시 붙인다.
 */
export function splitAreaName(name: string): { base: string; number: string } {
  const m = name.match(/^(.*?)\s*([0-9０-９]+)$/);
  return m && m[1] ? { base: m[1], number: m[2].replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)) } : { base: name, number: "" };
}

export async function loadNameTranslations(): Promise<void> {
  const rows = await listNameTranslations();
  translations.clear();
  known.clear();
  for (const r of rows) {
    known.add(keyOf(r.kind as NameKind, r.source));
    if (r.ko) translations.set(keyOf(r.kind as NameKind, r.source), r.ko);
  }
  console.log(`[names] 이름 ${rows.length}개, 번역 ${translations.size}개 로드`);
}

/** 번역 기능 이전에 동기화한 사용자의 지방 이름까지 관리 화면에 보이도록, 저장된 지방 진행도에서 한 번 모은다. */
export async function backfillAreaNames(): Promise<void> {
  await noteAreaNames(await listStoredAreas());
}

async function note(kind: NameKind, items: { source: string; imageUrl: string }[]): Promise<void> {
  const fresh = new Map<string, { source: string; imageUrl: string }>();
  for (const it of items) if (it.source && !known.has(keyOf(kind, it.source)) && !fresh.has(it.source)) fresh.set(it.source, it);
  if (!fresh.size) return;
  await noteNames(kind, [...fresh.values()]);
  for (const s of fresh.keys()) known.add(keyOf(kind, s));
}

export function noteAreaNames(areas: { name: string; imageUrl: string }[]): Promise<void> {
  return note("area", areas.map((a) => ({ source: splitAreaName(a.name).base, imageUrl: a.imageUrl })));
}

/** 곡 스탬프 카드는 곡명 번역을 쓰므로 그 밖의 카드만 모은다. */
export function noteStampNames(cards: { displayName: string; imageUrl: string; type: string }[]): Promise<void> {
  return note("stamp", cards.filter((c) => c.type !== "SONG").map((c) => ({ source: c.displayName, imageUrl: c.imageUrl })));
}

export function areaDisplayName(name: string, translate: boolean): string {
  if (!translate || !name) return name;
  const { base, number } = splitAreaName(name);
  const ko = translations.get(keyOf("area", base));
  return ko ? (number ? `${ko} ${number}` : ko) : name;
}

export function stampDisplayName(name: string, translate: boolean): string {
  return (translate && translations.get(keyOf("stamp", name))) || name;
}

export function setNameTranslationCache(kind: NameKind, source: string, ko: string): void {
  if (ko) translations.set(keyOf(kind, source), ko);
  else translations.delete(keyOf(kind, source));
}
