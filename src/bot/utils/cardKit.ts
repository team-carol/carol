import { BRAND } from "../../brand";

// PNG 카드(/프로필, /서클) 공용 부품. 색은 랜딩(carol-web) 토큰(src/brand.ts)을 따른다.

export const ACCENT = BRAND.accent;
export const SURFACE = BRAND.surface;
export const SURFACE2 = BRAND.surface2;
export const BORDER = BRAND.border;
export const TEXT = BRAND.inkSoft;
export const MUTED = BRAND.dim;
export const CANVAS = BRAND.canvas;
export const INK = BRAND.ink;

// DX NET 칭호 등급(trophy_*) 색. 레인보우는 그라디언트.
export const TROPHY_STYLE: Record<string, Record<string, unknown>> = {
  normal: { background: SURFACE2, color: TEXT },
  bronze: { background: "#c77d43", color: "#1a1a1c" },
  silver: { background: "#c3ccd4", color: "#1a1a1c" },
  gold: { background: "#f2c94c", color: "#1a1a1c" },
  rainbow: { backgroundImage: "linear-gradient(90deg, #ff9294, #fbbf24, #4ade80, #60a5fa, #c084fc)", color: "#1a1a1c" },
};

export const SOFT = BRAND.accentSoft;
export const FAINT = BRAND.faint;
export const NUM_FONT = "Pretendard"; // 랜딩 수치 표기와 같은 글꼴(fonts.ts 에 700 으로 등록됨)

export type El = { type: string; props: { style: Record<string, unknown>; children?: unknown; src?: string } };

export function el(type: string, style: Record<string, unknown>, children?: unknown): El {
  return { type, props: { style, children } };
}

export function image(src: string, style: Record<string, unknown>): El {
  return { type: "img", props: { src, style } };
}

export function pill(text: string, style: Record<string, unknown>): El {
  return el("span", { fontSize: 10, fontWeight: 700, borderRadius: 99, padding: "3px 9px", lineHeight: 1.2, flexShrink: 0, ...style }, text);
}

// DX NET 이미지(아바타 URL·클래스·재킷)를 data URL 로. 실패는 null 로 기억한다.
const remoteImageCache = new Map<string, string | null>();
export async function remoteDataUrl(url: string): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  const memo = remoteImageCache.get(url);
  if (memo !== undefined) return memo;
  let data: string | null = null;
  try {
    const res = await fetch(url);
    if (res.ok) data = `data:${res.headers.get("content-type") || "image/png"};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch {
    data = null;
  }
  remoteImageCache.set(url, data);
  return data;
}

export function kstStamp(ms: number): string {
  const d = new Date(ms + 9 * 60 * 60 * 1000).toISOString();
  return `${d.slice(0, 10).replace(/-/g, ".")} ${d.slice(11, 16)}`;
}

export function wordmark(): El {
  return el("div", { display: "flex", alignItems: "baseline" }, [
    el("span", { fontSize: 13, fontWeight: 700, color: MUTED, marginRight: 6 }, "Created by"),
    el("span", { fontSize: 13, fontWeight: 800, color: INK }, "carol"),
    el("span", { fontSize: 13, fontWeight: 800, color: ACCENT }, "bot"),
  ]);
}

// 랜딩 Stats 섹션처럼 박스 없이 큰 숫자(accent-soft) + 라벨. 칸 사이는 세로선으로만 나눈다.
export function statsPanel(items: { value: string; label: string; sub?: string }[]): El {
  return el("div", {
    display: "flex", marginTop: 16,
    background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "18px 0",
  }, items.map((it, i) => el("div", {
    // 보조 줄(평균)이 없는 칸도 숫자·라벨이 세로 가운데에 오도록 빈 줄을 넣지 않고 가운데 정렬한다.
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 7,
    ...(i > 0 ? { borderLeft: `1px solid ${BORDER}` } : {}),
  }, [
    el("span", { color: SOFT, fontFamily: NUM_FONT, fontSize: 28, fontWeight: 700, lineHeight: 1 }, it.value),
    el("span", { color: MUTED, fontSize: 11 }, it.label),
    ...(it.sub ? [el("span", { color: FAINT, fontSize: 10, lineHeight: 1 }, it.sub)] : []),
  ])));
}

export function panel(title: string, meta: string, children: El[]): El {
  return el("div", {
    display: "flex", flexDirection: "column",
    background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "14px 16px", marginTop: 12,
  }, [
    el("div", { display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }, [
      el("span", { color: INK, fontSize: 14, fontWeight: 700 }, title),
      el("span", { color: MUTED, fontSize: 10 }, meta),
    ]),
    ...children,
  ]);
}

