/**
 * 디스코드 Activity(보면 플레이어를 디스코드 안에서 띄우기) 공용 상태. 봇과 웹 서버가 같은 프로세스라 메모리에 둔다.
 *
 * - 버튼 응답(LAUNCH_ACTIVITY)에는 Activity 에 넘길 값을 실을 칸이 없다. 그래서 버튼을 누르면
 *   1) 그 채널에 "방금 고른 보면"을 잠깐 걸어 두고(pending, 1분), 2) 응답으로 받은 Activity 인스턴스 ID 에 보면을 묶는다.
 *   Activity 페이지는 주소의 instance_id·channel_id 로 보면을 찾는다(인스턴스 → 없으면 그 채널에 걸어 둔 것).
 * - 봇을 다시 켜면 잊는다. 그때는 페이지가 보면 고르기 화면을 띄운다.
 * - 검색·보면 열기 API 는 진짜 Activity 인스턴스에서만 받는다(verifyInstance — 디스코드에 그 인스턴스가 있는지 봇 토큰으로 묻는다).
 *   mai-notes 본문을 처음 받는 요청이 섞여 있어 아무나 부를 수 있으면 대량 통신이 될 수 있다.
 */
import { CONFIG } from "./config";

/** 애플리케이션 플래그 EMBEDDED(1 << 17). 개발자 포털에서 Activities 를 켜면 선다. */
export const APPLICATION_FLAG_EMBEDDED = 1 << 17;

const PENDING_MS = 60_000;
const INSTANCE_MS = 12 * 60 * 60_000;
const MAX_ENTRIES = 2000;
const VERIFY_OK_MS = 10 * 60_000;
const VERIFY_BAD_MS = 60_000;
/** 같은 인스턴스에서 보면 열기 사이 최소 간격(처음 받는 mai-notes 본문 요청이 몰리지 않게). */
const OPEN_INTERVAL_MS = 3_000;

let available = false;
const instances = new Map<string, { chartId: string; at: number }>();
const pending = new Map<string, { chartId: string; at: number }>();
const verified = new Map<string, { ok: boolean; at: number }>();
const lastOpen = new Map<string, number>();

/** 이 봇 애플리케이션에 Activity 가 켜져 있는지(명령 등록 때 애플리케이션 플래그로 갱신). 꺼져 있으면 버튼을 달지 않는다. */
export function activityAvailable(): boolean {
  return available;
}
export function setActivityAvailable(v: boolean): void {
  available = v;
}

const ID_RE = /^[\w.-]{1,128}$/;
export function isActivityId(v: string): boolean {
  return ID_RE.test(v);
}

function prune(map: Map<string, { at: number }>, ttl: number, now: number): void {
  if (map.size < MAX_ENTRIES) return;
  for (const [k, v] of map) if (now - v.at > ttl) map.delete(k);
  // 그래도 넘치면 오래된 것부터
  while (map.size >= MAX_ENTRIES) map.delete(map.keys().next().value as string);
}

/** 버튼을 누른 직후, Activity 를 띄우기 전에 부른다(응답보다 페이지가 먼저 열려도 찾게). */
export function setPendingChart(channelId: string, chartId: string, now = Date.now()): void {
  prune(pending, PENDING_MS, now);
  pending.set(channelId, { chartId, at: now });
}

/** 인스턴스에 보면을 묶는다(버튼 응답으로 받은 인스턴스, 또는 Activity 안에서 고른 보면). */
export function setInstanceChart(instanceId: string, chartId: string, now = Date.now()): void {
  prune(instances, INSTANCE_MS, now);
  instances.delete(instanceId);
  instances.set(instanceId, { chartId, at: now });
}

/**
 * Activity 페이지가 보여 줄 보면 id 와 그 보면을 고른 시각. 인스턴스에 묶인 것 → 없으면 그 채널에 1분 안에 걸어 둔 것(인스턴스에 묶는다).
 * 페이지는 이 시각이 자기가 열린 뒤면 새 보면으로 넘어간다(이미 열린 Activity 에서 다른 보면 버튼을 누르거나, 같은 인스턴스의 누가 보면을 골랐을 때).
 */
export function chartForInstance(instanceId: string, channelId: string, now = Date.now()): { chartId: string; at: number } | null {
  const bound = instanceId ? instances.get(instanceId) : undefined;
  const p = channelId ? pending.get(channelId) : undefined;
  // 인스턴스에 묶인 것보다 그 채널에 방금 건 것이 새로우면 그것(이미 열린 Activity 에서 다른 보면 버튼을 눌렀는데 응답의 인스턴스가 늦게 오는 경우)
  if (p && now - p.at <= PENDING_MS && (!bound || p.at > bound.at)) {
    if (instanceId) setInstanceChart(instanceId, p.chartId, p.at);
    return { chartId: p.chartId, at: p.at };
  }
  if (bound && now - bound.at <= INSTANCE_MS) return { chartId: bound.chartId, at: bound.at };
  return null;
}

/** 보면 열기 간격 제한. 열어도 되면 true(그 시각을 기록). */
export function allowOpen(instanceId: string, now = Date.now()): boolean {
  const last = lastOpen.get(instanceId);
  if (last !== undefined && now - last < OPEN_INTERVAL_MS) return false;
  if (lastOpen.size >= MAX_ENTRIES) lastOpen.clear();
  lastOpen.set(instanceId, now);
  return true;
}

/** 디스코드에 그 Activity 인스턴스가 지금 있는지(GET /applications/{id}/activity-instances/{instance_id}). 결과는 잠깐 기억한다. */
export async function verifyInstance(instanceId: string, now = Date.now()): Promise<boolean> {
  if (!isActivityId(instanceId) || !CONFIG.clientId || !CONFIG.token) return false;
  const hit = verified.get(instanceId);
  if (hit && now - hit.at < (hit.ok ? VERIFY_OK_MS : VERIFY_BAD_MS)) return hit.ok;
  let ok = false;
  try {
    const res = await fetch(`https://discord.com/api/v10/applications/${CONFIG.clientId}/activity-instances/${encodeURIComponent(instanceId)}`, {
      headers: { Authorization: `Bot ${CONFIG.token}` },
      signal: AbortSignal.timeout(5000),
    });
    ok = res.ok;
    if (!res.ok && res.status !== 404) console.warn(`[activity] 인스턴스 확인 실패: HTTP ${res.status}`);
  } catch (e) {
    console.warn("[activity] 인스턴스 확인 실패:", (e as Error).message);
  }
  if (verified.size >= MAX_ENTRIES) verified.clear();
  verified.set(instanceId, { ok, at: now });
  return ok;
}

/** 덮어쓰기 요청에 다시 실을 수 있는 명령 필드(읽기 전용인 application_id·version 등은 뺀다). */
const ENTRY_POINT_FIELDS = [
  "id", "name", "name_localizations", "description", "description_localizations", "type", "handler",
  "default_member_permissions", "nsfw", "integration_types", "contexts",
] as const;

/**
 * Entry Point 명령의 처리 방식. 1(APP_HANDLER) = 봇이 상호작용을 받아 Activity 를 띄운다(src/bot/index.ts).
 * 2(DISCORD_LAUNCH_ACTIVITY, 디스코드가 만들 때 기본값)면 디스코드가 띄우면서 채널에 "게임 초대" 메시지를 남긴다.
 * 앱 실행 메뉴와 Activity 링크(/검색 "채보 보기")가 이 명령을 거치므로 초대 메시지가 쌓이지 않게 봇이 처리한다.
 * 대신 봇이 꺼져 있으면 열리지 않는다.
 */
export const ENTRY_POINT_APP_HANDLER = 1;

/**
 * 전역 명령 덮어쓰기(PUT) 때 같이 올릴 Entry Point(PRIMARY_ENTRY_POINT, type 4 — 디스코드 이름 "Launch") 명령.
 * Activity 를 켜면 디스코드가 만든다. 덮어쓰기는 모든 종류의 명령을 덮어쓰므로 지금 것을 다시 싣고, 처리 방식만 봇으로 바꾼다.
 */
export function entryPointCommands(existing: Record<string, unknown>[]): Record<string, unknown>[] {
  return existing
    .filter((c) => c.type === 4)
    .map((c) => ({
      ...Object.fromEntries(ENTRY_POINT_FIELDS.filter((k) => c[k] !== undefined && c[k] !== null).map((k) => [k, c[k]])),
      handler: ENTRY_POINT_APP_HANDLER,
    }));
}

/**
 * 디스코드 Activity 링크. 채팅에서 누르면 그 자리에서 Activity 가 열리고(Entry Point 명령을 거친다),
 * customId 는 Activity 페이지 주소의 custom_id 로 온다(src/web/index.ts /activity).
 * 글씨에 걸 때는 주소를 <> 로 감싸 링크 미리보기 카드를 끈다.
 */
export function activityLink(appId: string, customId: string): string {
  return `https://discord.com/activities/${appId}?custom_id=${encodeURIComponent(customId)}`;
}

/** 테스트용 */
export function resetActivityStateForTest(): void {
  instances.clear(); pending.clear(); verified.clear(); lastOpen.clear(); available = false;
}
