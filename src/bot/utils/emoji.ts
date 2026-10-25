// 봇 애플리케이션 이모지(랭크·FC/AP·FS/FDX·DX ✦). 그림은 scripts/make-emoji.js 가 만들고
// scripts/upload-emoji.js 가 봇에 올린다. 개발 봇과 배포 봇은 서로 다른 애플리케이션이라 이모지 ID 가 다르므로
// 시작할 때 이름으로 찾아 둔다. 올리지 않았거나 못 불러왔으면 글자로 대신한다.
import type { Client } from "discord.js";

let EMOJI = new Map<string, string>();

export async function loadAppEmojis(client: Client): Promise<void> {
  if (!client.application) return;
  const list = await client.application.emojis.fetch();
  EMOJI = new Map([...list.values()].filter((e) => e.name).map((e) => [e.name!, e.toString()]));
  console.log(`[emoji] 애플리케이션 이모지 ${EMOJI.size}개`);
}

function emoji(name: string, fallback: string): string {
  return EMOJI.get(name) ?? fallback;
}

const RANK: Record<string, string> = {
  "SSS+": "carol_sssp", SSS: "carol_sss", "SS+": "carol_ssp", SS: "carol_ss", "S+": "carol_sp", S: "carol_s",
  AAA: "carol_aaa", AA: "carol_aa", A: "carol_a", BBB: "carol_bbb", BB: "carol_bb", B: "carol_b", C: "carol_c", D: "carol_d",
};
const COMBO: Record<string, string> = { "AP+": "carol_app", AP: "carol_ap", "FC+": "carol_fcp", FC: "carol_fc" };
const SYNC: Record<string, string> = { "FDX+": "carol_fdxp", FDX: "carol_fdx", "FS+": "carol_fsp", FS: "carol_fs", SYNC: "carol_sync" };

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

/** DX ✦1~5. 0 이면 "". */
export function dxStarEmoji(stars: number): string {
  return stars >= 1 && stars <= 5 ? emoji(`carol_star${stars}`, `✦${stars}`) : "";
}
