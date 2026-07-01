import * as cheerio from "cheerio";

export interface MaimaiProfile {
  playerName: string;
  rating: number;
  ratingMax: number;
  gradeImg: string;
  avatar: string;
  trophy: string;
  trophyClass: string;
  stars: string;
  playCount: number;
  friendCode?: string;
  comment?: string;
}

export interface SearchResult {
  found: boolean;
  profile?: MaimaiProfile;
  message?: string;
}

const BASE = "https://maimaidx-eng.com";

function absUrl(src: string | undefined): string {
  if (!src) return "";
  if (src.startsWith("http")) return src;
  // Strip ALL leading ../ or ./ (e.g. ../../../img/Music/xxx.png → img/Music/xxx.png)
  let clean = src.replace(/^\.\//, "");
  while (clean.startsWith("../")) clean = clean.slice(3);
  if (clean.startsWith("/")) return BASE + clean;
  return BASE + "/maimai-mobile/" + clean;
}

export function parseHome(html: string): Partial<MaimaiProfile> {
  const $ = cheerio.load(html);
  return {
    playerName: $(".name_block").first().text().trim(),
    rating: Number($(".rating_block").first().text().trim()) || 0,
    ratingMax: Number($(".p_r_5").first().text().trim()) || 0,
    avatar: absUrl($("img.w_112.f_l").attr("src") || $("img[src*='Icon']").attr("src") || $(".basic_block img").first().attr("src")),
    trophy: $(".trophy_inner_block span").first().text().trim(),
    trophyClass: ($(".trophy_block").attr("class") || "").split(/\s+/).find(c => c.match(/^trophy_(?!block)/i))?.replace(/^trophy_/i, "").toLowerCase() || "normal",
    gradeImg: absUrl($("img.h_35[src*='class']").attr("src") || $("img.h_35.f_l").last().attr("src")),
    stars: $("img[src*='icon_star']").parent().text().trim().replace(/[^0-9]/g, "") || "0",
    comment: $(".friend_comment_block").text().trim(),
    friendCode: $("input[name=idx]").attr("value"),
  };
}

export function parsePlayerData(html: string): { playCount: number } {
  const $ = cheerio.load(html);
  const body = $("body").text();
  const m = body.match(/(?:total\s*play|play\s*count|プレイ回数)[：:\s]*([\d,]+)/i);
  return { playCount: m ? Number(m[1].replace(/,/g, "")) : 0 };
}

export function parseFriendCode(html: string): string {
  const $ = cheerio.load(html);
  const text = $(".see_through_block").first().text().trim();
  const m = text.match(/(\d{13})/);
  return m ? m[1] : "";
}

export interface PlayRecord {
  title: string;
  achievement: string;
  diff: string;
  level: string;
  date: string;
  jacketUrl: string;
  musicKind: string;
  achievementVal: number;
  track: number;
  fc: string;
  sync: string;
}

const FC_LABELS: Record<string, string> = {
  fc: "FC", fcp: "FC+", ap: "AP", app: "AP+",
};
// 실제 아이콘 파일명 기준: music_icon_sync / fs / fsp / fdx / fdxp
const SYNC_LABELS: Record<string, string> = {
  sync: "SYNC", fs: "FS", fsp: "FS+", fdx: "FDX", fdxp: "FDX+",
};

function iconName(src: string): string {
  const m = src.match(/(?:playlog\/|music_icon_)([^.?/]+)/);
  return m ? m[1] : "";
}

function parseOneRecord($: cheerio.CheerioAPI, el: any): PlayRecord | null {
  const block = $(el).find(".basic_block").first();
  const level = block.find(".playlog_level_icon").text().trim();
  const clone = block.clone();
  clone.find(".w_80").remove();
  const title = clone.text().trim();
  if (!title) return null;
  const ach = $(el).find(".playlog_achievement_txt").text().trim();
  const achNum = parseFloat(ach.replace(/[^\d.]/g, "")) || 0;
  const diffSrc = $(el).find(".playlog_diff").attr("src") || "";
  const diff = diffSrc.includes("remaster") ? "Re:MASTER"
    : diffSrc.includes("master") ? "MASTER"
    : diffSrc.includes("expert") ? "EXPERT"
    : diffSrc.includes("advanced") ? "ADVANCED"
    : "BASIC";
  const jacketUrl = absUrl($(el).find(".music_img").attr("src"));
  const kindSrc = $(el).find(".playlog_music_kind_icon").attr("src") || "";
  const kindFile = kindSrc.split("/").pop() || "";
  const musicKind = kindFile.includes("_dx") ? "DX" : kindFile.includes("_standard") ? "ST" : "";
  const date = $(el).find(".playlog_top_container span").eq(1).text().trim();
  const trackText = $(el).find(".playlog_top_container .red.f_b.v_b").text().trim();
  const track = parseInt(trackText.replace(/[^0-9]/g, "")) || 0;
  const rankImgs = $(el).find("img.h_35.m_5.f_l");
  const fc = FC_LABELS[iconName(rankImgs.eq(0).attr("src") || "")] || "";
  const sync = SYNC_LABELS[iconName(rankImgs.eq(1).attr("src") || "")] || "";
  return { title, achievement: ach || "?", diff, level, date, jacketUrl, musicKind, achievementVal: achNum, track, fc, sync };
}

export function parseRecentRecords(html: string): PlayRecord[] {
  const $ = cheerio.load(html);
  const records: PlayRecord[] = [];
  $(".p_10.t_l.f_0.v_b").each((_, el) => { const r = parseOneRecord($, el); if (r) records.push(r); });
  const recent: PlayRecord[] = [];
  let games = 0;
  for (const r of records) {
    if (r.track <= 1) {
      if (games >= 5) break;
      games++;
    } else if (games === 0) {
      games = 1;
    }
    recent.push(r);
  }
  return recent;
}

export function parseTopSongs(html: string): PlayRecord[] {
  const $ = cheerio.load(html);
  const records: PlayRecord[] = [];
  $(".p_10.t_l.f_0.v_b").each((_, el) => { const r = parseOneRecord($, el); if (r) records.push(r); });
  return records;
}

export function parseMusicScore(html: string): PlayRecord[] {
  const $ = cheerio.load(html);
  const records: PlayRecord[] = [];
  const diffMap: Record<string, string> = {
    "diff_basic.png": "BASIC",
    "diff_advanced.png": "ADVANCED",
    "diff_expert.png": "EXPERT",
    "diff_master.png": "MASTER",
    "diff_remaster.png": "Re:MASTER",
  };
  $("[class*='music_'][class*='_score_back']").each((_, el) => {
    const block = $(el);
    const title = block.find(".music_name_block").text().trim();
    if (!title) return;
    const level = block.find(".music_lv_block").text().trim();
    const achievement = block.find(".music_score_block").text().trim();
    const allImgs = block.find("img");
    const diffImg = (allImgs.eq(0).attr("src") || "").split("/").pop() || "";
    const diff = diffMap[diffImg] || "";
    // .music_kind_icon 위치가 페이지마다 다름: 레이팅 대상 페이지는 블록 내부(form 안),
    // musicGenre(클리어 리스트) 페이지는 블록의 형제. 내부 → 형제 순으로 탐색.
    let kindEl = block.find(".music_kind_icon").first();
    if (!kindEl.length) kindEl = block.nextAll(".music_kind_icon").first();
    if (!kindEl.length) kindEl = block.prevAll(".music_kind_icon").first();
    const kindImg = (kindEl.attr("src") || "").split("/").pop() || "";
    const musicKind = kindImg.includes("_dx") ? "DX" : kindImg.includes("_standard") ? "ST" : "";
    const musicId = block.find("input[name='idx']").val() as string | undefined;
    const jacketUrl = musicId ? `https://maimaidx-eng.com/maimai-mobile/img/Music/${musicId}.png` : "";
    const achMatch = achievement.match(/(\d+\.\d+)/);
    const achievementVal = achMatch ? parseFloat(achMatch[1]) : 0;
    let fc = "";
    let sync = "";
    allImgs.each((_, img) => {
      const src = $(img).attr("src") || "";
      if (!src.includes("music_icon_")) return;
      const name = iconName(src);
      if (!name) return;
      if (!fc && FC_LABELS[name]) fc = FC_LABELS[name];
      else if (!sync && SYNC_LABELS[name]) sync = SYNC_LABELS[name];
    });
    records.push({
      title, achievement, diff, level, jacketUrl, musicKind, achievementVal,
      date: "", track: 0, fc, sync,
    });
  });
  return records;
}

export function parseTop5(html: string): PlayRecord[] {
  const $ = cheerio.load(html);
  const records: PlayRecord[] = [];
  $(".p_10.t_l.f_0.v_b").each((_, el) => { const r = parseOneRecord($, el); if (r) records.push(r); });
  const best = new Map<string, PlayRecord>();
  for (const r of records) {
    const key = r.title + "|" + r.diff + "|" + r.level;
    const existing = best.get(key);
    if (!existing || r.achievementVal > existing.achievementVal) best.set(key, r);
  }
  return Array.from(best.values()).sort((a, b) => b.achievementVal - a.achievementVal).slice(0, 5);
}

// 채보 식별 키: ST/DX는 같은 title+diff라도 별개 채보이므로 musicKind를 포함
export function chartKey(r: Pick<PlayRecord, "title" | "musicKind" | "diff">): string {
  return r.title + "|" + r.musicKind + "|" + r.diff;
}

// 채보별 마크(FC/AP, Sync) 조회 맵. 레이팅 대상 페이지엔 FC/AP·Sync 아이콘이 없어
// clear 기록(clearJson)에서 AP 보너스 판정 및 카드 표시용 마크를 끌어오기 위해 사용.
export interface ChartMarks {
  fc: string;
  sync: string;
}
export function buildMarkMap(records: PlayRecord[]): Map<string, ChartMarks> {
  const m = new Map<string, ChartMarks>();
  for (const r of records) {
    if (r.fc || r.sync) m.set(chartKey(r), { fc: r.fc, sync: r.sync });
  }
  return m;
}

// clearJson 기준으로 레코드의 ST/DX를 보정하는 함수를 만든다.
// 레이팅 대상 페이지는 musicKind 추출이 부정확할 수 있어, 정확한 clear 기록에서
// title+diff로 찾아 보정한다. 같은 title+diff에 ST/DX 둘 다 있으면 달성률로 구분.
export function buildKindResolver(clearRecords: PlayRecord[]): (r: PlayRecord) => string {
  const kindsByTitleDiff = new Map<string, Set<string>>();
  const kindByExact = new Map<string, string>(); // title|diff|achInt -> kind
  for (const r of clearRecords) {
    if (!r.musicKind) continue;
    const td = r.title + "|" + r.diff;
    let set = kindsByTitleDiff.get(td);
    if (!set) { set = new Set(); kindsByTitleDiff.set(td, set); }
    set.add(r.musicKind);
    kindByExact.set(td + "|" + Math.round(r.achievementVal * 10000), r.musicKind);
  }
  return (r: PlayRecord): string => {
    const td = r.title + "|" + r.diff;
    const kinds = kindsByTitleDiff.get(td);
    if (!kinds || kinds.size === 0) return r.musicKind;
    if (kinds.size === 1) return [...kinds][0];
    // ST/DX 둘 다 존재 → 달성률로 정확한 채보 판별
    return kindByExact.get(td + "|" + Math.round(r.achievementVal * 10000)) ?? r.musicKind;
  };
}

export function mergeTopRecords(recordsList: PlayRecord[][]): PlayRecord[] {
  const best = new Map<string, PlayRecord>();
  for (const records of recordsList) {
    for (const r of records) {
      const key = chartKey(r);
      const existing = best.get(key);
      if (!existing || r.achievementVal > existing.achievementVal) best.set(key, r);
    }
  }
  return Array.from(best.values()).sort((a, b) => b.achievementVal - a.achievementVal);
}

export function parseSearchResult(html: string): SearchResult {
  const $ = cheerio.load(html);
  const block = $(".see_through_block");
  if (!block.length) return { found: false, message: "검색 결과 없음" };
  if (block.text().includes("WRONG CODE")) return { found: false, message: "잘못된 코드" };

  const profile = {
    playerName: $(".name_block", block).text().trim(),
    rating: Number($(".rating_block", block).text().trim()) || 0,
    ratingMax: 0,
    gradeImg: absUrl($("img.h_35", block).attr("src")),
    avatar: absUrl($("img.w_112", block).attr("src") || $("img", block).first().attr("src")),
    trophy: $(".trophy_inner_block span", block).text().trim(),
    trophyClass: ($(".trophy_block", block).attr("class") || "").split(/\s+/).find(c => c.match(/^trophy_(?!block)/i))?.replace(/^trophy_/i, "").toLowerCase() || "normal",
    stars: "0",
    playCount: 0,
    friendCode: $("input[name=idx]", block).attr("value"),
  };
  if (!profile.playerName) return { found: false, message: "찾을 수 없음" };
  return { found: true, profile };
}
