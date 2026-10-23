// /스탬프 이미지 카드. maishift 스탬프 카드 페이지와 같은 구성:
// 진행 중인 카드를 파트너·곡·기타로 나눠(남은 출석 일수와 함께) 보상 이미지·이름·스탬프 칸을 보여 주고,
// 완료한 카드는 맨 아래에 보상 이미지만 모은다.
import {
  SURFACE2, BORDER, TEXT, MUTED, CANVAS, INK,
  type El, el, image, pill, panel, remoteDataUrl,
} from "./cardKit";
import { userCardHeader, avatarDataUrl } from "./cardHeader";
import { renderInWorker } from "./renderPool";
import { MAI_DIFF_COLOR } from "../../games";
import { displayTitle } from "../../aliases";
import { stampDisplayName } from "../../nameTranslations";
import type { CachedProfile } from "../../storage/types";
import type { StampCard } from "../../maishift/stamps";
import { msg } from "../../messages";

const WIDTH = 760;
const DIFF: Record<string, string> = { BASIC: "BASIC", ADVANCED: "ADVANCED", EXPERT: "EXPERT", MASTER: "MASTER", RE_MASTER: "Re:MASTER" };

// 파트너 스탬프 색(maishift 와 같은 캐릭터 색). 그 밖의 카드는 보라.
function stampColor(name: string, type: string): string {
  if (type === "PARTNER") {
    const table: [RegExp, string][] = [
      [/ラズ/, "#ffb0b9"], [/シフォン/, "#bed296"], [/ソルト/, "#92d0e7"], [/乙姫/, "#ff8d94"], [/みるく/, "#5ab4ba"],
      [/しゃま/, "#f39601"], [/百合咲ミカ/, "#baa8d1"], [/黒姫/, "#4f454e"], [/らいむっくま＆れもんっくま/, "#d0ed32"],
    ];
    const hit = table.find(([re]) => re.test(name));
    if (hit) return hit[1];
  }
  return "#bf9eff";
}

const slotCache = new Map<string, string>();
/** 스탬프 한 칸. 찍힌 칸은 색 원 + 체크, 빈 칸은 테두리 원. */
function slot(color: string | null, size: number): El {
  const key = color ?? "empty";
  let url = slotCache.get(key);
  if (!url) {
    const svg = color
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="${color}"/><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10.25" fill="none" stroke="${BORDER}" stroke-width="1.5"/></svg>`;
    url = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
    slotCache.set(key, url);
  }
  return image(url, { width: size, height: size, flexShrink: 0 });
}

function slots(c: StampCard): El {
  const color = stampColor(c.displayName, c.type);
  return el("div", { display: "flex", gap: 4, flexWrap: "wrap" }, Array.from({ length: c.maxCount }, (_, i) => slot(i < c.stampCount ? color : null, 18)));
}

/** 곡 스탬프의 보면들(난이도 색 칸 + 상수, 추정이면 "?"). */
function trackChips(c: StampCard): El {
  return el("div", { display: "flex", gap: 3, flexShrink: 0 }, (c.song?.tracks ?? []).map((t) => {
    const diff = DIFF[t.difficulty] ?? t.difficulty;
    return el("div", { display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 22, borderRadius: 6, background: MAI_DIFF_COLOR[diff] ?? SURFACE2 }, [
      el("span", { color: "#fff", fontSize: 11, fontWeight: 800, lineHeight: 1 }, (t.internalLevel / 10).toFixed(1)),
      // 추정 상수는 레이팅표처럼 작은 "?" 를 오른쪽 위에
      ...(t.internalLevelIsAccurate ? [] : [el("span", { color: "#fff", fontSize: 7, fontWeight: 800, lineHeight: 1, marginLeft: 1, position: "relative", top: -3 }, "?")]),
    ]);
  }));
}

// 보상 이미지 칸. 네임플레이트·프레임은 가로로 길어 정사각형에 넣으면 너무 작아진다.
function rewardBox(type: string, height: number): { width: number; height: number } {
  if (type === "NAMEPLATE") return { width: Math.round(height * 2.6), height };
  if (type === "FRAME") return { width: Math.round(height * 1.78), height };
  return { width: height, height };
}

function row(c: StampCard, img: string | null, latestVersion: number | null, translate: boolean, last: boolean, colWidth: number): El {
  const song = c.song?.song;
  const isNew = !!song && latestVersion !== null && song.songVersion === latestVersion;
  const name = song ? displayTitle(song.title || c.displayName, translate) : stampDisplayName(c.displayName, translate);
  return el("div", { display: "flex", alignItems: "center", gap: 14, padding: "9px 0", borderBottom: last ? "none" : `1px solid ${BORDER}` }, [
    // 이미지 칸 폭은 섹션 안에서 같게(이름·스탬프 칸이 줄마다 같은 자리에서 시작하도록).
    el("div", { display: "flex", justifyContent: "center", width: colWidth, flexShrink: 0 }, [
      img ? image(img, { ...rewardBox(c.type, 60), objectFit: "contain" }) : el("div", { ...rewardBox(c.type, 60), borderRadius: 10, background: SURFACE2 }),
    ]),
    el("div", { display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: 7 }, [
      el("div", { display: "flex", alignItems: "center", gap: 6, minWidth: 0 }, [
        ...(song ? [pill(song.type === "DX" ? "DX" : "ST", { background: song.type === "DX" ? "#f97316" : "#3b82f6", color: "#fff", fontSize: 9 })] : []),
        ...(isNew ? [pill(msg("stampCard.newChart"), { background: "rgba(74,222,128,0.18)", color: "#4ade80", fontSize: 9 })] : []),
        el("span", { color: INK, fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, minWidth: 0 }, name),
      ]),
      el("div", { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }, [
        slots(c),
        ...(song ? [trackChips(c)] : []),
      ]),
    ]),
  ]);
}

// 2인 플레이 아이콘(maishift 와 같은 사람 둘 아이콘). 문구의 {duo} 자리에 들어간다.
const DUO = "\u0000";
let duoIconUrl: string | null = null;
function duoIcon(): El {
  if (!duoIconUrl) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${MUTED}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0"/><path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0 -3 -3.85"/></svg>`;
    duoIconUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  }
  // 글자(숫자) 몸통과 높이가 맞도록 1px 내리고, 앞뒤 여백은 괄호·숫자 쪽 모두 같게.
  return image(duoIconUrl, { width: 11, height: 11, margin: "1px 3px 0 0" });
}
function withDuoIcon(text: string): El {
  const parts = text.split(DUO);
  return el("div", { display: "flex", alignItems: "center" }, parts.flatMap((p, i) => [
    ...(p ? [el("span", { lineHeight: 1 }, p)] : []),
    ...(i < parts.length - 1 ? [duoIcon()] : []),
  ]));
}

const remainingOf = (list: StampCard[]) => list.reduce((a, c) => a + Math.max(0, c.maxCount - c.stampCount), 0);

export async function renderStampCard(profile: CachedProfile, avatarBuf: Buffer | null, cards: StampCard[], latestVersion: number | null, translate: boolean): Promise<Buffer> {
  const open = cards.filter((c) => !c.complete);
  const partners = open.filter((c) => c.type === "PARTNER");
  const songs = open.filter((c) => c.type === "SONG");
  const others = open.filter((c) => c.type !== "PARTNER" && c.type !== "SONG");
  const done = cards.filter((c) => c.complete);

  const urls = [...new Set(cards.map((c) => c.imageUrl).filter(Boolean))];
  const imgs = new Map<string, string | null>(await Promise.all(urls.map(async (u) => [u, await remoteDataUrl(u)] as [string, string | null])));
  const avatarUrl = await avatarDataUrl(profile, avatarBuf);

  const section = (title: string, meta: string | El, list: StampCard[]) => {
    const colWidth = Math.max(...list.map((c) => rewardBox(c.type, 60).width));
    return panel(title, meta, [el("div", { display: "flex", flexDirection: "column" }, list.map((c, i) => row(c, imgs.get(c.imageUrl) ?? null, latestVersion, translate, i === list.length - 1, colWidth)))]);
  };
  const days = (list: StampCard[]) => { const d = remainingOf(list); return withDuoIcon(msg("stampCard.remaining", { days: d, daysDuo: Math.ceil(d / 2), duo: DUO })); };
  const songTotal = remainingOf(songs);
  const songLatest = remainingOf(songs.filter((c) => latestVersion !== null && c.song?.song.songVersion === latestVersion));

  const serverLabel = profile.server === "jp" ? "JP" : "INTERNATIONAL";
  const head = userCardHeader(profile, avatarUrl, msg("stampCard.eyebrow", { server: serverLabel }), msg("stampCard.summary", { count: cards.length, complete: done.length }));

  const root = el("div", { display: "flex", flexDirection: "column", width: WIDTH, background: CANVAS, padding: 24, color: TEXT, fontFamily: "Noto Sans JP" }, [
    head,
    ...(partners.length ? [section(msg("stampCard.partner"), days(partners), partners)] : []),
    ...(songs.length ? [section(msg("stampCard.songs"), withDuoIcon(msg("stampCard.songsRemaining", { total: songTotal, latest: songLatest, totalDuo: Math.ceil(songTotal / 2), latestDuo: Math.ceil(songLatest / 2), duo: DUO })), songs)] : []),
    ...(others.length ? [section(msg("stampCard.others"), days(others), others)] : []),
    ...(done.length ? [panel(msg("stampCard.complete"), msg("stampCard.completeMeta", { count: done.length }), [
      el("div", { display: "flex", flexWrap: "wrap", gap: 8 }, done.map((c) => {
        const img = imgs.get(c.imageUrl) ?? null;
        return img ? image(img, { ...rewardBox(c.type, 56), objectFit: "contain" }) : el("div", { ...rewardBox(c.type, 56), borderRadius: 10, background: SURFACE2 });
      })),
    ])] : []),
  ]);
  return renderInWorker(root, WIDTH);
}
