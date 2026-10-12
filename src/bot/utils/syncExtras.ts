import type { CachedProfile } from "../../storage/types";

/**
 * 캐롤봇 추가 북마클릿(DX NET 에서 실행)이 모은 데이터 — 서클·최근 플레이·지방·게임 설정.
 * 프로필은 maishift 에서 오므로, 이 데이터를 쓰는 부분(최근 플레이 패널·버튼, 지방 버튼, 서클 이름)은
 * 캐롤봇 추가 북마클릿을 실행한 적이 있는 사용자에게만 보인다. 실행한 적이 없으면 프로필 키가 "ms:" 로 시작한다
 * (storage 의 프로필 키 규칙). 이 데이터만 쓰는 명령(/서클, /지방, /게임설정)은 데이터가 없으면 등록을 안내한다.
 */
export function hasCarolSync(profile: Pick<CachedProfile, "profileKey">): boolean {
  return !profile.profileKey.startsWith("ms:");
}
