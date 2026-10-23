// 사용자 카드(/히스토리·/스탬프) 공통 머리: 아바타 · 머리글(eyebrow) · 이름 · 보조 줄 | 출처 표기 · 레이팅 플레이트.
// /프로필 카드와 같은 크기·정렬(이름은 머리글과 왼쪽 끝이 맞도록 글자 여백만큼 당긴다).
import { BORDER, MUTED, INK, SURFACE2, type El, el, image, wordmark, creditOf, remoteDataUrl } from "./cardKit";
import { ratingPlate } from "./ratingCard";
import { alignLeftMargin } from "./textMetrics";
import type { CachedProfile } from "../../storage/types";

/** 아바타 이미지(data URL). /설정 아바타가 있으면 그것, 없으면 DX NET 아바타. */
export async function avatarDataUrl(profile: CachedProfile, avatarBuf: Buffer | null): Promise<string | null> {
  return avatarBuf ? `data:image/png;base64,${avatarBuf.toString("base64")}` : remoteDataUrl(profile.avatar);
}

export function userCardHeader(profile: CachedProfile, avatarUrl: string | null, eyebrow: string, sub: string): El {
  const name = profile.playerName || "—";
  const nameShift = alignLeftMargin({ text: name, size: 26 }, { text: eyebrow, size: 10 });
  return el("div", { display: "flex", alignItems: "center", paddingBottom: 18, borderBottom: `1px solid ${BORDER}` }, [
    avatarUrl
      ? image(avatarUrl, { width: 88, height: 88, objectFit: "cover", borderRadius: 16, marginRight: 18, flexShrink: 0 })
      : el("div", { width: 88, height: 88, borderRadius: 16, background: SURFACE2, marginRight: 18, flexShrink: 0 }),
    el("div", { display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: 7 }, [
      el("span", { color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.4 }, eyebrow),
      el("span", { color: INK, fontSize: 26, fontWeight: 800, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginLeft: nameShift }, name),
      el("span", { color: MUTED, fontSize: 12 }, sub),
    ]),
    el("div", { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 16, flexShrink: 0 }, [
      wordmark(creditOf(profile)),
      ratingPlate(profile.rating || 0),
    ]),
  ]);
}
