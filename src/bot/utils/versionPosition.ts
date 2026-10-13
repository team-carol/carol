// 버전 폴더 안 위치 "43/79"(게임에서 버전 정렬로 곡을 찾을 때). /검색·/랜덤·곡 상세 카드가 같이 쓴다.
// 국제판은 maishift 곡 창과 같은 값(보면 번호로 받음, 하루 캐시)을 쓴다 — 곡 목록으로 센 총 곡 수가 곡 창보다
// 하나 적게 나와서. 못 받거나 내수판이면 곡 목록(지역별 versionFolderOrder)으로 계산한다.
// 그 지역 최신 세대 곡은 새 곡이 추가되면 순서가 바뀔 수 있어 maishift 처럼 순서 뒤에 "?" 를 붙인다.
import { getTrackId, getVersionPosition } from "../../constants";
import { getTrackPosition } from "../../maishift/track";
import type { MaimaiServer } from "../../scraper";
import { msg } from "../../messages";

const DIFFS = ["MASTER", "EXPERT", "ADVANCED", "BASIC", "Re:MASTER"];

export async function versionPositionText(title: string, musicKind: string, server: MaimaiServer): Promise<string | null> {
  const local = getVersionPosition(title, musicKind, server);
  let order: number | null = local?.order ?? null;
  let total = local?.total ?? 0;
  if (server === "intl") {
    const trackId = DIFFS.map((d) => getTrackId(title, musicKind, d)).find((id) => id !== null) ?? null;
    const live = trackId !== null ? await getTrackPosition(trackId) : null;
    if (live) { order = live.order === null ? null : live.order + 1; total = live.total; }
  }
  if (!total) return null;
  return msg("trackCard.versionPosition", { order: order === null ? "?" : `${order}${local?.tentative ? "?" : ""}`, total });
}
