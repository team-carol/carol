/**
 * 단위(段位)·클래스 이미지. maishift 는 단위·클래스를 번호로만 주고, DX NET 이미지 파일명에는 번호 뒤에
 * 임의 문자열이 붙어 있어(예: course_rank_15DlEMWlRz.png) 번호로 주소를 만들 수 없다. 파일명은 이미지마다 고정이라
 * 캐롤봇 북마클릿이 홈에서 본 이미지를 "서버·종류·번호" 별로 한 번씩 받아 저장해 두고 모든 사용자가 같이 쓴다.
 * 이미지 자체(공용 게임 이미지)만 저장하고 누구의 것인지는 남기지 않는다.
 */
import { getKvCache, saveKvCache } from "./storage";
import type { MaimaiServer } from "./storage/types";

export type RankKind = "course" | "class";
const KV_KEY = "rank_images";
const MAX_BYTES = 200_000;
// https://maimaidx-eng.com/maimai-mobile/img/course/course_rank_15DlEMWlRz.png
// https://maimaidx-eng.com/maimai-mobile/img/class/class_rank_s_20OmGGNvGh.png
const URL_RE = /^https:\/\/(?:maimaidx-eng\.com|maimaidx\.jp)\/maimai-mobile\/img\/(course|class)\/(?:course_rank_|class_rank_s_)(\d{2})[A-Za-z0-9]+\.png$/;

interface Stored { file: string; data: string }
let images = new Map<string, Stored>();
const keyOf = (server: MaimaiServer, kind: RankKind, rank: number) => `${server}:${kind}:${rank}`;

export async function loadRankImages(): Promise<void> {
  try {
    const row = await getKvCache(KV_KEY);
    images = new Map(row ? (JSON.parse(row.data) as [string, Stored][]) : []);
  } catch (e) {
    console.error("[rank-images] 복원 실패:", e);
  }
}

/** 프로필 카드용 data URL. 아직 아무도 모으지 않은 번호면 "". */
export function rankImage(server: MaimaiServer, kind: RankKind, rank: number | undefined): string {
  if (!rank) return "";
  return images.get(keyOf(server, kind, rank))?.data ?? "";
}

/** 북마클릿이 이미 받은 이미지는 다시 보내지 않게, 저장된 파일명 목록. */
export function knownRankImageFiles(server: MaimaiServer): string[] {
  return [...images].filter(([k]) => k.startsWith(`${server}:`)).map(([, v]) => v.file);
}

/** 북마클릿이 보낸 {url, data} 중 형식이 맞는 DX NET 단위·클래스 이미지만 골라 저장 키를 붙인다. */
export function parseRankImageItems(server: MaimaiServer, items: unknown): { key: string; file: string; data: string }[] {
  if (!Array.isArray(items)) return [];
  const out: { key: string; file: string; data: string }[] = [];
  for (const it of items.slice(0, 4)) {
    const url = typeof it?.url === "string" ? it.url : "";
    const data = typeof it?.data === "string" ? it.data : "";
    const m = url.match(URL_RE);
    if (!m || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data) || data.length > MAX_BYTES) continue;
    out.push({ key: keyOf(server, m[1] as RankKind, Number(m[2])), file: url.split("/").pop()!, data });
  }
  return out;
}

/** 새로 저장한 개수를 돌려준다. */
export async function saveRankImages(server: MaimaiServer, items: unknown): Promise<number> {
  let added = 0;
  for (const { key, file, data } of parseRankImageItems(server, items)) {
    if (images.get(key)?.file === file) continue;
    images.set(key, { file, data });
    added++;
  }
  if (added) await saveKvCache(KV_KEY, JSON.stringify([...images]));
  return added;
}
