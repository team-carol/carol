import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

export type MaimaiServer = "intl" | "jp";

const BASE_URLS: Record<MaimaiServer, string> = {
  intl: "https://maimaidx-eng.com",
  jp: "https://maimaidx.jp",
} as const;

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
  totalPlayCount?: number;
  friendCode?: string;
  comment?: string;
}

export interface SearchResult {
  found: boolean;
  profile?: MaimaiProfile;
  message?: string;
}

export function getMaimaiBaseUrl(server: MaimaiServer): string {
  return BASE_URLS[server];
}

function absUrl(src: string | undefined, baseUrl: string): string {
  if (!src) return "";
  if (src.startsWith("http")) return src;
  // Strip ALL leading ../ or ./ (e.g. ../../../img/Music/xxx.png → img/Music/xxx.png)
  let clean = src.replace(/^\.\//, "");
  while (clean.startsWith("../")) clean = clean.slice(3);
  if (clean.startsWith("/")) return baseUrl + clean;
  return baseUrl + "/maimai-mobile/" + clean;
}

export function parseHome(html: string, server: MaimaiServer = "intl"): Partial<MaimaiProfile> {
  const $ = cheerio.load(html);
  const baseUrl = getMaimaiBaseUrl(server);
  return {
    playerName: $(".name_block").first().text().trim(),
    rating: Number($(".rating_block").first().text().trim()) || 0,
    ratingMax: Number($(".p_r_5").first().text().trim()) || 0,
    avatar: absUrl($("img.w_112.f_l").attr("src") || $("img[src*='Icon']").attr("src") || $(".basic_block img").first().attr("src"), baseUrl),
    trophy: $(".trophy_inner_block span").first().text().trim(),
    trophyClass: ($(".trophy_block").attr("class") || "").split(/\s+/).find(c => c.match(/^trophy_(?!block)/i))?.replace(/^trophy_/i, "").toLowerCase() || "normal",
    gradeImg: absUrl($("img.h_35[src*='class']").attr("src") || $("img.h_35.f_l").last().attr("src"), baseUrl),
    stars: $("img[src*='icon_star']").parent().text().trim().replace(/[^0-9]/g, "") || "0",
    comment: $(".friend_comment_block").text().trim(),
    friendCode: $("input[name=idx]").attr("value"),
  };
}

// 플레이 카운트: "現バージョンプレイ回数：N回<br>…累計プレイ回数：M回" (국제판은 영문 라벨).
// 현 버전 / 누적 두 수치를 함께 수집한다.
export function parsePlayerData(html: string): { playCount: number; totalPlayCount: number } {
  const $ = cheerio.load(html);
  // 플레이 회수 라벨을 포함한 leaf div를 찾아 등장 순서대로 [현 버전, 누적] 추출
  let pcText = "";
  $("div").each((_, el) => {
    const $el = $(el);
    if ($el.children("div").length === 0 && /プレイ回数|play\s*count/i.test($el.text())) {
      pcText = $el.text();
      return false;
    }
  });
  const nums = (pcText.match(/[\d,]+/g) || []).map((s) => Number(s.replace(/,/g, "")));
  if (nums.length >= 2) return { playCount: nums[0], totalPlayCount: nums[1] };
  // 폴백: 라벨 매칭 실패 시 body 전체에서 첫 수치를 현/누적 공통으로 사용
  const body = $("body").text();
  const m = body.match(/(?:total\s*play|play\s*count|プレイ回数)[：:\s]*([\d,]+)/i);
  const one = m ? Number(m[1].replace(/,/g, "")) : (nums[0] ?? 0);
  return { playCount: one, totalPlayCount: one };
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

export type MapAreaKind = "normal" | "event";

export interface MapArea {
  readonly kind: MapAreaKind;
  readonly name: string;
  readonly progressText: string;
  readonly progressPercent: number | null;
  readonly distanceText: string;
  readonly rewardText: string;
  readonly imageUrl: string;
  readonly rawText: string;
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

function parseOneRecord($: cheerio.CheerioAPI, el: any, baseUrl: string): PlayRecord | null {
  const block = $(el).find(".basic_block").first();
  const level = block.find(".playlog_level_icon").text().trim();
  const clone = block.clone();
  clone.find(".w_80").remove();
  const rawTitle = clone.text();
  // 전각 공백(U+3000)만인 제목 보존 (trim 시 빈 문자열이 되어 누락 방지)
  const title = rawTitle.trim() || (/　/.test(rawTitle) ? "　" : "");
  if (!title) return null;
  const ach = $(el).find(".playlog_achievement_txt").text().trim();
  const achNum = parseFloat(ach.replace(/[^\d.]/g, "")) || 0;
  const diffSrc = $(el).find(".playlog_diff").attr("src") || "";
  const diff = diffSrc.includes("remaster") ? "Re:MASTER"
    : diffSrc.includes("master") ? "MASTER"
    : diffSrc.includes("expert") ? "EXPERT"
    : diffSrc.includes("advanced") ? "ADVANCED"
    : "BASIC";
  const jacketUrl = absUrl($(el).find(".music_img").attr("src"), baseUrl);
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

export function parseRecentRecords(html: string, server: MaimaiServer = "intl"): PlayRecord[] {
  const $ = cheerio.load(html);
  const baseUrl = getMaimaiBaseUrl(server);
  const records: PlayRecord[] = [];
  $(".p_10.t_l.f_0.v_b").each((_, el) => { const r = parseOneRecord($, el, baseUrl); if (r) records.push(r); });
  const recent: PlayRecord[] = [];
  let games = 0;
  for (const r of records) {
    recent.push(r);
    if (r.track <= 1) {
      games++;
      if (games >= 5) break;
    }
  }
  return recent;
}

export function parseTopSongs(html: string, server: MaimaiServer = "intl"): PlayRecord[] {
  const $ = cheerio.load(html);
  const baseUrl = getMaimaiBaseUrl(server);
  const records: PlayRecord[] = [];
  $(".p_10.t_l.f_0.v_b").each((_, el) => { const r = parseOneRecord($, el, baseUrl); if (r) records.push(r); });
  return records;
}

export function parseMusicScore(html: string, server: MaimaiServer = "intl"): PlayRecord[] {
  const $ = cheerio.load(html);
  const baseUrl = getMaimaiBaseUrl(server);
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
    const rawTitle = block.find(".music_name_block").text();
    // 제목이 전각 공백(U+3000)만인 곡은 trim 시 빈 문자열이 되어 누락됨 → 원본 공백 유지
    const title = rawTitle.trim() || (/　/.test(rawTitle) ? "　" : "");
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
    const jacketUrl = musicId ? `${baseUrl}/maimai-mobile/img/Music/${musicId}.png` : "";
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

export function parseTop5(html: string, server: MaimaiServer = "intl"): PlayRecord[] {
  const $ = cheerio.load(html);
  const baseUrl = getMaimaiBaseUrl(server);
  const records: PlayRecord[] = [];
  $(".p_10.t_l.f_0.v_b").each((_, el) => { const r = parseOneRecord($, el, baseUrl); if (r) records.push(r); });
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

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function textLines($: cheerio.CheerioAPI, el: AnyNode | undefined): string[] {
  if (!el) return [];
  const lines: string[] = [];
  $(el).find("*").addBack().each((_, node) => {
    const block = $(node);
    if (block.children().length > 0) return;
    const text = compactText(block.text());
    if (text) lines.push(text);
  });
  if (lines.length > 0) return Array.from(new Set(lines));
  return $(el).text()
    .split(/\r?\n/)
    .map(compactText)
    .filter((line) => line.length > 0);
}

function firstMatchingLine(lines: readonly string[], pattern: RegExp): string {
  return lines.find((line) => pattern.test(line)) ?? "";
}

function parseMapPercent(text: string): number | null {
  const percent = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (percent) return Number(percent[1]);

  const fraction = text.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (!fraction) return null;

  const current = Number(fraction[1]);
  const total = Number(fraction[2]);
  if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0) return null;
  return Math.max(0, Math.min(100, (current / total) * 100));
}

function mapAreaName(lines: readonly string[]): string {
  const ignored = /^(area|event|map|progress|진행|달성|보상|reward|あと|remaining|남은)/i;
  return lines.find((line) =>
    line.length <= 80
    && !ignored.test(line)
    && !/%/.test(line)
    && !/(km|ｍ|miles?|マイル|マス|칸)/i.test(line)
  ) ?? "이름 없는 지역";
}

function mapCandidateBlocks($: cheerio.CheerioAPI): AnyNode[] {
  const selectors = [
    "[class*='map']",
    "[class*='area']",
    "[class*='event']",
    ".see_through_block",
    ".basic_block",
  ].join(",");
  const blocks: AnyNode[] = [];
  $(selectors).each((_, el) => {
    const text = compactText($(el).text());
    if (text.length < 8 || text.length > 1200) return;
    if (!/(area|event|map|ちほ|進行|距離|あと|km|%|reward|보상|달성|진행)/i.test(text)) return;
    blocks.push(el);
  });
  return blocks;
}

export function parseMapAreas(html: string, kind: MapAreaKind, server: MaimaiServer = "intl"): MapArea[] {
  const $ = cheerio.load(html);
  const baseUrl = getMaimaiBaseUrl(server);
  const seen = new Set<string>();
  const areas: MapArea[] = [];

  for (const block of mapCandidateBlocks($)) {
    const lines = textLines($, block);
    const rawText = compactText(lines.join(" "));
    if (!rawText || seen.has(rawText)) continue;
    seen.add(rawText);

    const progressText = firstMatchingLine(lines, /(\d+(?:\.\d+)?\s*%|\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?)/);
    const distanceText = firstMatchingLine(lines, /(あと|remaining|남은|거리|distance|km|ｍ|miles?|マイル|マス|칸)/i);
    const rewardText = firstMatchingLine(lines, /(reward|보상|報酬|獲得|ゲット|ticket|티켓|icon|plate|칭호|nameplate)/i);
    const imageUrl = absUrl($(block).find("img").first().attr("src"), baseUrl);
    const progressPercent = parseMapPercent(progressText || rawText);

    if (!progressText && !distanceText && progressPercent === null) continue;

    areas.push({
      kind,
      name: mapAreaName(lines),
      progressText,
      progressPercent,
      distanceText,
      rewardText,
      imageUrl,
      rawText,
    });
  }

  if (areas.length > 0) return areas;

  const bodyLines = textLines($, $("body").get(0) ?? $.root().get(0));
  const rawText = compactText(bodyLines.join(" "));
  if (!rawText) return [];
  const progressText = firstMatchingLine(bodyLines, /(\d+(?:\.\d+)?\s*%|\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?)/);
  const distanceText = firstMatchingLine(bodyLines, /(あと|remaining|남은|거리|distance|km|ｍ|miles?|マイル|マス|칸)/i);
  const progressPercent = parseMapPercent(progressText || rawText);
  if (!progressText && !distanceText && progressPercent === null) return [];

  return [{
    kind,
    name: mapAreaName(bodyLines),
    progressText,
    progressPercent,
    distanceText,
    rewardText: firstMatchingLine(bodyLines, /(reward|보상|報酬|獲得|ゲット|ticket|티켓|icon|plate|칭호|nameplate)/i),
    imageUrl: absUrl($("body img").first().attr("src"), baseUrl),
    rawText,
  }];
}

export function parseSearchResult(html: string, server: MaimaiServer = "intl"): SearchResult {
  const $ = cheerio.load(html);
  const baseUrl = getMaimaiBaseUrl(server);
  const block = $(".see_through_block");
  if (!block.length) return { found: false, message: "검색 결과 없음" };
  if (block.text().includes("WRONG CODE")) return { found: false, message: "잘못된 코드" };

  const profile = {
    playerName: $(".name_block", block).text().trim(),
    rating: Number($(".rating_block", block).text().trim()) || 0,
    ratingMax: 0,
    gradeImg: absUrl($("img.h_35", block).attr("src"), baseUrl),
    avatar: absUrl($("img.w_112", block).attr("src") || $("img", block).first().attr("src"), baseUrl),
    trophy: $(".trophy_inner_block span", block).text().trim(),
    trophyClass: ($(".trophy_block", block).attr("class") || "").split(/\s+/).find(c => c.match(/^trophy_(?!block)/i))?.replace(/^trophy_/i, "").toLowerCase() || "normal",
    stars: "0",
    playCount: 0,
    friendCode: $("input[name=idx]", block).attr("value"),
  };
  if (!profile.playerName) return { found: false, message: "찾을 수 없음" };
  return { found: true, profile };
}
