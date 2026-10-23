// 버전 폴더 안 위치 "43/79"(게임에서 버전 정렬로 곡을 찾을 때). /검색·/랜덤·곡 상세 카드가 같이 쓴다.
// 곡 목록의 지역별 버전 폴더 순서(catalog.ts folders)로 계산한다. 그 지역 최신 세대 곡은 새 곡이 추가되면
// 순서가 바뀔 수 있어 maishift 처럼 순서 뒤에 "?" 를 붙인다.
// 지금은 표시하지 않는다: maishift 의 순서 데이터가 CiRCLE PLUS 에서 어긋나 maishift 도 보여 주지 않고 있고,
// 공식 API 에도 아직 없다. 운영자가 고친 뒤 API(/songs)에 넣어 주기로 했으므로, 그때 catalog.ts toCatalog 에
// folderOrders 를 채우면 다시 나온다.
import { getVersionPosition } from "../../constants";
import type { MaimaiServer } from "../../scraper";
import { msg } from "../../messages";

export async function versionPositionText(title: string, musicKind: string, server: MaimaiServer): Promise<string | null> {
  const local = getVersionPosition(title, musicKind, server);
  if (!local?.total) return null;
  return msg("trackCard.versionPosition", { order: `${local.order}${local.tentative ? "?" : ""}`, total: local.total });
}
