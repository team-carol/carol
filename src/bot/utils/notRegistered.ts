// 프로필을 못 받았을 때 안내. 연동은 했지만 고른 서버(지역)에 maishift 기록이 없으면 그 사실을 알린다
// (maishift 는 없는 지역을 요청하면 대표 지역 기록을 주는데, 캐롤봇은 그 기록을 다른 서버 기록으로 보여 주지 않는다).
import { getMaishiftLink } from "../../storage";
import { isProfilePrivate, isRegionMissing, recentMaishiftFailure, MaishiftError } from "../../maishift";
import { msg } from "../../messages";

/** maishift 이용 한도를 넘었으면 "몇 분 뒤 다시 시도" 안내, 아니면 null. */
export function maishiftErrorText(e: unknown): string | null {
  if (e instanceof MaishiftError && e.kind === "rate_limited") {
    return msg("common.rateLimited", { minutes: Math.max(1, Math.ceil((e.retryAfterSec ?? 60) / 60)) });
  }
  return null;
}

export async function notRegisteredNotice(targetId: string, self: boolean): Promise<string> {
  const link = await getMaishiftLink(targetId).catch(() => null);
  const failure = link ? maishiftErrorText(recentMaishiftFailure(link)) : null;
  if (failure) return failure;
  if (link && isProfilePrivate(link)) {
    return self ? msg("common.selfMaishiftPrivate") : msg("common.otherMaishiftPrivate", { user: `<@${targetId}>` });
  }
  if (link && isRegionMissing(link)) {
    const server = link.server === "jp" ? "JAPAN" : "INTERNATIONAL";
    return self ? msg("common.selfRegionMissing", { server }) : msg("common.otherRegionMissing", { user: `<@${targetId}>`, server });
  }
  return self ? msg("common.selfNotRegistered") : msg("common.otherNotRegistered", { user: `<@${targetId}>` });
}
