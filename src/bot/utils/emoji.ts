// 봇 애플리케이션 이모지(난이도·랭크·FC/AP·FS/FDX·DX ✦·ST/DX 배지). 그림은 scripts/make-emoji.js 가 assets/emoji 에 만들고,
// 봇이 시작할 때 아직 없는 이모지를 그 그림으로 올린다(이미지에 assets/emoji 를 넣는다). 개발 봇과 배포 봇은 서로 다른
// 애플리케이션이라 이모지 ID 가 다르므로 이름으로 찾아 둔다. 못 불러왔으면 글자로 대신한다.
import * as fs from "fs";
import * as path from "path";
import type { Client } from "discord.js";

const ASSET_DIR = path.join(__dirname, "..", "..", "..", "assets", "emoji");

let EMOJI = new Map<string, string>();

export async function loadAppEmojis(client: Client): Promise<void> {
  const app = client.application;
  if (!app) return;
  const list = await app.emojis.fetch();
  const map = new Map([...list.values()].filter((e) => e.name).map((e) => [e.name!, e.toString()]));
  // 아직 올리지 않은 그림은 올린다(새 이모지를 추가했거나 새 봇일 때). 그림을 바꿀 때는 이름 끝 번호를 올리므로,
  // assets 에 없는 carol_ 이모지(예전 그림)는 지운다.
  const files = fs.existsSync(ASSET_DIR) ? fs.readdirSync(ASSET_DIR).filter((f) => f.endsWith(".png")) : [];
  const wanted = new Set(files.map((f) => f.replace(/\.png$/, "")));
  let removed = 0;
  if (files.length) {
    for (const e of list.values()) {
      if (!e.name?.startsWith("carol_") || wanted.has(e.name)) continue;
      try {
        await e.delete();
        map.delete(e.name);
        removed++;
      } catch (err) {
        console.error(`[emoji] ${e.name} 지우기 실패:`, (err as Error).message);
      }
    }
  }
  let added = 0;
  for (const file of files) {
    const name = file.replace(/\.png$/, "");
    if (map.has(name)) continue;
    try {
      const e = await app.emojis.create({ attachment: fs.readFileSync(path.join(ASSET_DIR, file)), name });
      map.set(name, e.toString());
      added++;
    } catch (err) {
      console.error(`[emoji] ${name} 올리기 실패:`, (err as Error).message);
    }
  }
  EMOJI = map;
  console.log(`[emoji] 애플리케이션 이모지 ${EMOJI.size}개${added ? ` (새로 올림 ${added}개)` : ""}${removed ? ` (예전 그림 지움 ${removed}개)` : ""}`);
}

function emoji(name: string, fallback: string): string {
  return EMOJI.get(name) ?? fallback;
}

const DIFF: Record<string, [string, string]> = {
  BASIC: ["carol_basic", "BAS"], ADVANCED: ["carol_advanced", "ADV"], EXPERT: ["carol_expert", "EXP"],
  MASTER: ["carol_master", "MAS"], "Re:MASTER": ["carol_remaster2", "Re:M"],
};
const RANK: Record<string, string> = {
  "SSS+": "carol_sssp", SSS: "carol_sss", "SS+": "carol_ssp", SS: "carol_ss", "S+": "carol_sp", S: "carol_s",
  AAA: "carol_aaa", AA: "carol_aa", A: "carol_a", BBB: "carol_bbb", BB: "carol_bb", B: "carol_b", C: "carol_c", D: "carol_d",
};
const COMBO: Record<string, string> = { "AP+": "carol_app", AP: "carol_ap", "FC+": "carol_fcp", FC: "carol_fc" };
const SYNC: Record<string, string> = { "FDX+": "carol_fdxp", FDX: "carol_fdx", "FS+": "carol_fsp", FS: "carol_fs", SYNC: "carol_sync" };

/** 난이도(BASIC~Re:MASTER). 이모지가 없으면 줄인 이름. */
export function diffEmoji(diff: string): string {
  const d = DIFF[diff];
  return d ? emoji(d[0], `**${d[1]}**`) : diff;
}

/** 달성률 랭크("SSS+" 등). 모르는 값은 그대로. */
export function rankEmoji(rank: string): string {
  return RANK[rank] ? emoji(RANK[rank], rank) : rank;
}

/** FC/FC+/AP/AP+. 없으면 "". */
export function comboEmoji(fc: string): string {
  return fc && COMBO[fc] ? emoji(COMBO[fc], fc) : fc;
}

/** SYNC/FS/FS+/FDX/FDX+. 없으면 "". */
export function syncEmoji(sync: string): string {
  return sync && SYNC[sync] ? emoji(SYNC[sync], sync) : sync;
}

/** 투명한 빈칸(점수표에서 없는 마크 자리 채우기). 이모지가 없으면 "". */
export function blankEmoji(): string {
  return emoji("carol_blank", "");
}

/**
 * 여러 칸으로 잘라 이어 붙이는 이모지(넓은 배지, 칸 이름 끝이 _a, _b, _c …). 한 칸이라도 없으면 null.
 * 칸 사이에 word joiner(U+2060)를 넣어, 긴 제목이 줄바꿈될 때 칸 사이에서 갈라지지 않게 한다(넘치면 통째로 다음 줄).
 * 이어지는 이모지는 꼭 이 함수로 만든다.
 */
function tiledEmoji(base: string, count: number): string | null {
  const tiles = Array.from({ length: count }, (_, i) => EMOJI.get(`${base}_${String.fromCharCode(97 + i)}`));
  return tiles.every(Boolean) ? tiles.join("\u2060") : null;
}

const DIFF_BADGE: Record<string, [string, number]> = {
  BASIC: ["carol_bas", 3], ADVANCED: ["carol_adv", 4], EXPERT: ["carol_exp", 3], MASTER: ["carol_mas", 4], "Re:MASTER": ["carol_rem", 4],
};

/**
 * 난이도 이름 배지(DX NET 난이도 그림을 여러 칸으로 이어 붙인 이모지). 못 불러왔으면 한 칸 약자(diffEmoji).
 * width: 칸 수를 이만큼으로 맞춘다(모자라면 투명 빈칸을 붙인다). 배지 뒤 글을 줄마다 같은 자리에 둘 때 쓴다.
 */
export function diffBadgeEmoji(diff: string, width = 0): string {
  const b = DIFF_BADGE[diff];
  const badge = b && tiledEmoji(b[0], b[1]);
  if (!badge) return diffEmoji(diff);
  const blank = blankEmoji();
  const pad = blank ? Math.max(0, width - b[1]) : 0;
  return [badge, ...Array<string>(pad).fill(blank)].join("\u2060");
}

const KIND: Record<string, string> = { DX: "carol_dx", ST: "carol_st" };

/**
 * ST/DX 배지(/성과 카드와 같은 DX NET 배지를 세 칸으로 잘라 이어 붙인 이모지). 한 칸이라도 없으면 "[DX]" 처럼 글자로.
 * embed: 임베드 제목용. 임베드 제목은 이모지가 글자보다 낮게 앉아서 배지를 위로 올려 그린 것을 쓴다.
 */
export function kindEmoji(kind: string, embed = false): string {
  const base = KIND[kind] && KIND[kind] + (embed ? "e" : "");
  if (!base) return kind ? `[${kind}]` : "";
  return tiledEmoji(base, 3) ?? `[${kind}]`;
}

/** 임베드 제목(최대 256자)의 "곡명 배지". 이모지 코드가 길어 256자를 넘으면 "[DX]" 글자로. */
export function titleWithKind(title: string, kind: string): string {
  const withBadge = `${title} ${kindEmoji(kind, true)}`;
  return withBadge.length <= 256 ? withBadge : `${title} [${kind}]`.slice(0, 256);
}

/** DX ✦1~5. 0 이면 "". */
export function dxStarEmoji(stars: number): string {
  return stars >= 1 && stars <= 5 ? emoji(`carol_star${stars}`, `✦${stars}`) : "";
}

// 기록 마크 아이콘(DX NET 기록 페이지와 같은 그림. 랭크는 플레이 기록 페이지 큰 그림 carol_m3_*, 칩은 carol_m2_*,
// DX ✦ 는 carol_m_*). 랭크는 세 칸, 나머지는 한 칸.
// 못 불러왔으면 위의 캐롤봇 마크로.
const iconKey = (v: string) => v.toLowerCase().replace(/\+/g, "p"); // "SSS+" → "sssp", "FDX+" → "fdxp"

/** 달성률 랭크 아이콘(세 칸). */
export function rankIcon(rank: string): string {
  return RANK[rank] ? tiledEmoji(`carol_m3_${iconKey(rank)}`, 3) ?? rankEmoji(rank) : rank;
}

/** FC/FC+/AP/AP+ 아이콘. 없으면 "". */
export function comboIcon(fc: string): string {
  return fc && COMBO[fc] ? tiledEmoji(`carol_m2_${iconKey(fc)}`, 1) ?? comboEmoji(fc) : fc;
}

/** SYNC/FS/FS+/FDX/FDX+ 아이콘. 없으면 "". */
export function syncIcon(sync: string): string {
  return sync && SYNC[sync] ? tiledEmoji(`carol_m2_${iconKey(sync)}`, 1) ?? syncEmoji(sync) : sync;
}

/** DX ✦1~5 아이콘. 0 이면 "". */
export function dxStarIcon(stars: number): string {
  return stars >= 1 && stars <= 5 ? tiledEmoji(`carol_m_star${stars}`, 1) ?? dxStarEmoji(stars) : "";
}
