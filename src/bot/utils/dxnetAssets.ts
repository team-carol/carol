// DX NET 공용 아이콘(ST/DX 채보 종류 뱃지, 113×32). 카드에 텍스트 대신 게임과 같은 그림을 쓴다.
// 이미지는 국제판·JP 가 같아서 국제판 주소로 받는다. 받은 것만 메모리에 두고, 실패하면 다음 렌더 때 다시 시도한다.

const KIND_ICON_URL: Record<"DX" | "ST", string> = {
  DX: "https://maimaidx-eng.com/maimai-mobile/img/music_dx.png",
  ST: "https://maimaidx-eng.com/maimai-mobile/img/music_standard.png",
};
/** 원본 비율(113:32). 높이만 정하면 너비를 여기서 맞춘다. */
export const KIND_ICON_RATIO = 113 / 32;

const loaded: Partial<Record<"DX" | "ST", string>> = {};

async function load(kind: "DX" | "ST"): Promise<void> {
  if (loaded[kind]) return;
  try {
    const res = await fetch(KIND_ICON_URL[kind]);
    if (res.ok) loaded[kind] = `data:image/png;base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch {
    /* 다음 렌더 때 다시 시도 */
  }
}

/** ST/DX 뱃지 data URL. 못 받은 종류는 빠진다(호출부는 텍스트로 대신 쓴다). */
export async function musicKindIcons(): Promise<Partial<Record<"DX" | "ST", string>>> {
  await Promise.all([load("DX"), load("ST")]);
  return { ...loaded };
}
