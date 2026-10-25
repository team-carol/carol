// 봇 애플리케이션 이모지(난이도·랭크·FC/AP·FS/FDX·DX ✦). 그림은 scripts/make-emoji.js 가 assets/emoji 에 만들고,
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

/** DX ✦1~5. 0 이면 "". */
export function dxStarEmoji(stars: number): string {
  return stars >= 1 && stars <= 5 ? emoji(`carol_star${stars}`, `✦${stars}`) : "";
}
