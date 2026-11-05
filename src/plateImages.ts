/**
 * 버전 플레이트(真極·祭将…) 이름표 그림. /플레이트 상세 카드가 쓴다.
 * maishift 는 그림을 주지 않고 DX NET 그림 주소에는 임의 문자열이 붙어 있어, LXNS(落雪咖啡屋) 공개 API 문서가
 * 안내하는 게임 자원 주소(https://assets2.lxns.net/maimai/plate/{id}.png)에서 받는다.
 * LXNS 는 자원 요청 빈도를 제한하므로(문서: 자주 요청하지 말 것) 한 장을 처음 쓸 때 한 번만 받아
 * constants_cache(`plate_image:<id>`)에 두고 다시 받지 않는다. 아직 없는 그림(404)·실패는 잠시 다시 묻지 않고 글자로 그린다.
 */
import { getKvCache, saveKvCache } from "./storage";
import { plateImageId, type PlateType } from "./plates";
import { userAgent } from "./mainotes/client";

const BASE_URL = "https://assets2.lxns.net/maimai/plate";
const KV_PREFIX = "plate_image:";
const MAX_BYTES = 1_000_000;
const TIMEOUT_MS = 10_000;
/** 받은 그림을 메모리에 둘 개수(한 장 100~250KB, 한 플레이트 4~5장) */
const MEMORY_LIMIT = 40;
const NOT_FOUND_RETRY_MS = 24 * 60 * 60 * 1000;
const ERROR_RETRY_MS = 10 * 60 * 1000;

const memory = new Map<number, string>();
const retryAt = new Map<number, number>();
const inflight = new Map<number, Promise<string | null>>();

function remember(id: number, data: string): void {
  memory.delete(id);
  memory.set(id, data);
  while (memory.size > MEMORY_LIMIT) memory.delete(memory.keys().next().value!);
}

async function download(id: number): Promise<string | null> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}/${id}.png`, { headers: { "User-Agent": userAgent(), "Accept": "image/png" }, signal: ac.signal });
    if (res.status === 404) {
      retryAt.set(id, Date.now() + NOT_FOUND_RETRY_MS);
      return null;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    // PNG 서명만 받는다(오류 페이지·다른 형식은 저장하지 않음).
    if (buf.length > MAX_BYTES || buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`not a png (${buf.length}B)`);
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch (e) {
    console.warn(`[plate-images] ${id} 받기 실패:`, e instanceof Error ? e.message : e);
    retryAt.set(id, Date.now() + ERROR_RETRY_MS);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function loadOne(id: number): Promise<string | null> {
  const have = memory.get(id);
  if (have) return have;
  const row = await getKvCache(KV_PREFIX + id).catch(() => null);
  if (row?.data) {
    remember(id, row.data);
    return row.data;
  }
  if ((retryAt.get(id) ?? 0) > Date.now()) return null;
  const data = await download(id);
  if (!data) return null;
  retryAt.delete(id);
  remember(id, data);
  await saveKvCache(KV_PREFIX + id, data).catch((e) => console.error("[plate-images] 저장 실패:", e));
  return data;
}

function load(id: number): Promise<string | null> {
  let p = inflight.get(id);
  if (!p) {
    p = loadOne(id).finally(() => inflight.delete(id));
    inflight.set(id, p);
  }
  return p;
}

/** 그 플레이트의 종류별 그림(data URL). 받지 못한 종류는 빠진다. 처음 받는 그림은 두 장씩 받는다. */
export async function getPlateImages(prefix: string, types: PlateType[]): Promise<Partial<Record<PlateType, string>>> {
  const out: Partial<Record<PlateType, string>> = {};
  const queue = types.map((t) => ({ t, id: plateImageId(prefix, t) })).filter((x): x is { t: PlateType; id: number } => x.id !== null);
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const data = await load(job.id);
      if (data) out[job.t] = data;
    }
  };
  await Promise.all([worker(), worker()]);
  return out;
}
