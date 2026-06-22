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
  const m = body.match(/(?:total\s*play|play\s*count)[：:\s]*([\d,]+)/i);
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
const SYNC_LABELS: Record<string, string> = {
  fs: "FS", fsp: "FS+", fsd: "FSD", fsdp: "FSD+",
};

function iconName(src: string): string {
  const m = src.match(/playlog\/([^.?]+)/);
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
  const musicKind = kindFile.includes("_dx") ? "DX" : kindFile.includes("_standard") ? "STA" : "";
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
  return records;
}

export function parseTopSongs(html: string): PlayRecord[] {
  const $ = cheerio.load(html);
  const records: PlayRecord[] = [];
  $(".p_10.t_l.f_0.v_b").each((_, el) => { const r = parseOneRecord($, el); if (r) records.push(r); });
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

export function mergeTopRecords(recordsList: PlayRecord[][]): PlayRecord[] {
  const best = new Map<string, PlayRecord>();
  for (const records of recordsList) {
    for (const r of records) {
      const existing = best.get(r.title);
      if (!existing || r.achievementVal > existing.achievementVal) best.set(r.title, r);
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
