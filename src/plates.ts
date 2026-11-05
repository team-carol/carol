/**
 * 버전 플레이트(極·将·神·舞舞·覇者) 진행도. maishift 곡 목록(지역별 보면, src/constants.ts getRegionCharts)과
 * 사용자의 전체 기록(clearJson)으로 계산한다.
 *
 * - 대상 보면: 그 버전에 추가된 곡(ST·DX 따로)의 BASIC~MASTER. 真 은 maimai·maimai PLUS 두 버전,
 *   舞 는 maimai~FiNALE 모든 옛 버전이고 Re:MASTER 도 들어간다. 覇者 는 舞 에만, 将 는 真 에 없다.
 * - 아직 플레이트가 없는 그 지역 최신 버전은 뺀다(국제판 CiRCLE PLUS 처럼, 다음 버전에서 생긴다).
 * - 대상에서 빠지는 보면은 아래 목록에 둔다. maishift 순회 데이터(보면마다 붙은 플레이트 번호)와 두 지역 모두 보면 단위로
 *   맞췄다(2026-11-05). 대부분 지역마다 수록 시기가 다른 곡(부활·늦은 수록)이다. 옛 버전(真~輝, 舞) 플레이트는 대상이
 *   더 바뀌지 않아 고정 목록으로 두고, 熊 이후 플레이트는 "그 버전에 추가된 곡" 그대로 maishift 와 같다.
 */
import type { PlayRecord } from "./scraper";
import type { RegionChart } from "./constants";
import type { MaimaiServer } from "./storage/types";

export type PlateType = "極" | "将" | "神" | "舞舞" | "覇者";
export const PLATE_TYPES: PlateType[] = ["極", "将", "神", "舞舞", "覇者"];

/** 세대 번호 → 플레이트 한자(maishift 개발자 문서의 표). 0(maimai)의 舞 는 옛 버전 전체 플레이트 이름이다. */
export const VERSION_KANJI = ["舞", "真", "超", "檄", "橙", "暁", "桃", "櫻", "紫", "菫", "白", "雪", "輝", "熊", "華", "爽", "煌", "宙", "星", "祭", "祝", "双", "宴", "鏡", "彩", "丸", "廻"];
const LAST_OLD_VERSION = 12; // FiNALE

/** 모든 플레이트에서 빠지는 곡("제목|ST/DX"). */
const ALWAYS_EXCLUDED = new Set(["全世界共通リズム感テスト|ST"]);
/** 버전 플레이트(真)에서는 빠지고 舞 에는 드는 곡. 계절 곡이다. */
const SEASONAL = "ジングルベル|ST";
/** 그 지역에서 빠지는 곡(그 곡의 버전 플레이트와 舞 모두). 지역마다 수록 시기가 다르다. */
const REGION_EXCLUDED: Record<MaimaiServer, Set<string>> = {
  intl: new Set([
    "ハッピーシンセサイザ|ST", "39|ST", // 真
    "＊ハロー、プラネット。|ST", // 超
    "前前前世|ST", // 菫
  ]),
  jp: new Set(["前前前世|ST"]), // 菫
};
/** 舞: FiNALE 뒤에 추가된 옛 곡 Re:MASTER 는 세지 않는다(두 지역 같음). */
const MAI_LATE_REMASTER = new Set([
  "Backyun! －悪い女－", "Beat of getting entangled", "DADDY MULK -Groove remix-", "Death Scythe", "Dragoon",
  "D✪N’T  ST✪P  R✪CKIN’", "FEEL the BEATS", "FLOWER", "JACKY [Remix]", "LUCIA", "Limit Break", "Link", "Night Fly",
  "Revive The Rave", "SPILL OVER COLORS", "Sky High [Reborn]", "System “Z”", "We Gonna Party", "YA･DA･YO [Reborn]",
  "air's gravity", "planet dancer", "みんなのマイマイマー", "アージェントシンメトリー", "泣き虫O'clock", "源平大戦絵巻テーマソング",
  "言ノ葉カルマ", "記憶、記録",
].map((t) => `${t}|ST`));

export interface PlateDef {
  /** 플레이트 한자(예: "祭") */
  prefix: string;
  /** 지역. 지역마다 빠지는 곡이 달라 대상 보면을 셀 때 쓴다(자동완성처럼 모르면 없음). */
  server?: MaimaiServer;
  /** 대상 곡이 추가된 세대 번호들 */
  versions: number[];
  types: PlateType[];
  /** Re:MASTER 도 대상인지(舞) */
  reMaster: boolean;
  /** stats/plates firstGaps 의 version(真 1, 舞 0, 나머지는 그 버전) */
  statVersion: number;
}

/** 그 지역에 있는 플레이트(최신 버전 제외). 真 → 輝, 舞, 熊 → 최신 직전 순. */
export function plateDefs(latestVersion: number | null, server?: MaimaiServer): PlateDef[] {
  const defs: PlateDef[] = [{ prefix: "真", server, versions: [0, 1], types: ["極", "神", "舞舞"], reMaster: false, statVersion: 1 }];
  for (let v = 2; v <= LAST_OLD_VERSION; v++) defs.push({ prefix: VERSION_KANJI[v], server, versions: [v], types: ["極", "将", "神", "舞舞"], reMaster: false, statVersion: v });
  defs.push({ prefix: "舞", server, versions: Array.from({ length: LAST_OLD_VERSION + 1 }, (_, i) => i), types: ["極", "将", "神", "舞舞", "覇者"], reMaster: true, statVersion: 0 });
  const last = latestVersion ?? VERSION_KANJI.length;
  for (let v = LAST_OLD_VERSION + 1; v < last && v < VERSION_KANJI.length; v++) defs.push({ prefix: VERSION_KANJI[v], server, versions: [v], types: ["極", "将", "神", "舞舞"], reMaster: false, statVersion: v });
  return defs;
}

export function findPlate(defs: PlateDef[], prefix: string): PlateDef | null {
  return defs.find((d) => d.prefix === prefix) ?? null;
}

/** 그 플레이트의 대상 보면. */
export function plateCharts(def: PlateDef, charts: RegionChart[]): RegionChart[] {
  const region = def.server ? REGION_EXCLUDED[def.server] : null;
  return charts.filter((c) => {
    if (!def.versions.includes(c.version)) return false;
    const song = `${c.title}|${c.kind}`;
    if (ALWAYS_EXCLUDED.has(song) || region?.has(song)) return false;
    if (def.reMaster) return c.diff !== "Re:MASTER" || !MAI_LATE_REMASTER.has(song);
    return c.diff !== "Re:MASTER" && song !== SEASONAL;
  });
}

const FC_OK = new Set(["FC", "FC+", "AP", "AP+"]);
const AP_OK = new Set(["AP", "AP+"]);
const FDX_OK = new Set(["FDX", "FDX+"]);

/** 기록이 그 플레이트 조건을 넘었는지. 極 FC 이상, 将 SSS(100%) 이상, 神 AP 이상, 舞舞 FDX 이상, 覇者 클리어(80%) 이상. */
export function meetsPlate(type: PlateType, r: PlayRecord | undefined): boolean {
  if (!r || !(r.achievementVal > 0)) return false;
  switch (type) {
    case "極": return FC_OK.has(r.fc);
    case "将": return r.achievementVal >= 100;
    case "神": return AP_OK.has(r.fc);
    case "舞舞": return FDX_OK.has(r.sync);
    case "覇者": return r.achievementVal >= 80;
  }
}

export interface PlateChartState { chart: RegionChart; record: PlayRecord | undefined }
export interface PlateProgress {
  def: PlateDef;
  total: number;
  /** 종류별 조건을 넘은 보면 수(그 플레이트에 없는 종류는 없음) */
  done: Partial<Record<PlateType, number>>;
  /** 종류별 아직 못 넘은 보면. 가까운 것부터(친 보면은 달성률 높은 순, 안 친 보면은 상수 낮은 순). */
  remaining: Partial<Record<PlateType, PlateChartState[]>>;
}

const keyOf = (c: { title: string; kind: string; diff: string }) => `${c.title}|${c.kind}|${c.diff}`;

export function recordMap(records: PlayRecord[]): Map<string, PlayRecord> {
  return new Map(records.map((r) => [`${r.title}|${r.musicKind === "DX" ? "DX" : "ST"}|${r.diff}`, r]));
}

function closestFirst(a: PlateChartState, b: PlateChartState): number {
  const pa = a.record?.achievementVal ?? 0, pb = b.record?.achievementVal ?? 0;
  if ((pa > 0) !== (pb > 0)) return pa > 0 ? -1 : 1;
  if (pa > 0) return pb - pa || a.chart.constant - b.chart.constant;
  return a.chart.constant - b.chart.constant || a.chart.title.localeCompare(b.chart.title);
}

export function plateProgress(def: PlateDef, charts: RegionChart[], records: Map<string, PlayRecord>): PlateProgress {
  const targets = plateCharts(def, charts);
  const done: Partial<Record<PlateType, number>> = {};
  const remaining: Partial<Record<PlateType, PlateChartState[]>> = {};
  for (const type of def.types) {
    const left: PlateChartState[] = [];
    for (const chart of targets) {
      const record = records.get(keyOf(chart));
      if (!meetsPlate(type, record)) left.push({ chart, record });
    }
    left.sort(closestFirst);
    done[type] = targets.length - left.length;
    remaining[type] = left;
  }
  return { def, total: targets.length, done, remaining };
}

/** 다 채운 플레이트 종류 수(대상 보면이 없는 플레이트는 세지 않는다). */
export function heldPlates(list: PlateProgress[]): number {
  return list.reduce((n, p) => n + (p.total > 0 ? p.def.types.filter((t) => p.done[t] === p.total).length : 0), 0);
}

/** 상세 카드에 기본으로 보여 줄 종류: 남은 보면이 가장 적은(0 은 빼고) 종류. 다 채웠으면 첫 종류. */
const OLD_OFFSET: Partial<Record<PlateType, number>> = { 極: 0, 将: 1, 神: 2, 舞舞: 3 };
const DX_OFFSET: Partial<Record<PlateType, number>> = { 極: 101, 将: 102, 神: 103, 舞舞: 104 };

/**
 * 게임 안 이름표 번호(LXNS 자원 번호와 같다, src/plateImages.ts). 없는 조합(真将, 舞 밖의 覇者)은 null.
 * - 舞: 覇者 6148, 極 6149, 将 6150, 神 6151, 舞舞 6152 / 真: 極 6101, 神 6102, 舞舞 6103
 * - 超(2)~輝(12): 6104 부터 버전마다 極·将·神·舞舞 네 개씩
 * - 熊(13) 55xxx, 華(14) 109xxx, 爽(15) 159xxx 부터 버전마다 +50 (祭 359101 = 祭極). 새 버전도 같은 규칙을 따른다고 본다.
 */
export function plateImageId(prefix: string, type: PlateType): number | null {
  const v = VERSION_KANJI.indexOf(prefix);
  if (v < 0) return null;
  if (v === 0) return ({ 覇者: 6148, 極: 6149, 将: 6150, 神: 6151, 舞舞: 6152 } as Record<PlateType, number>)[type] ?? null;
  if (v === 1) return ({ 極: 6101, 神: 6102, 舞舞: 6103 } as Partial<Record<PlateType, number>>)[type] ?? null;
  if (v <= LAST_OLD_VERSION) {
    const o = OLD_OFFSET[type];
    return o === undefined ? null : 6104 + (v - 2) * 4 + o;
  }
  const o = DX_OFFSET[type];
  if (o === undefined) return null;
  const series = v === 13 ? 55 : v === 14 ? 109 : 159 + (v - 15) * 50;
  return series * 1000 + o;
}

export function defaultPlateType(p: PlateProgress): PlateType {
  const open = p.def.types.filter((t) => (p.remaining[t]?.length ?? 0) > 0);
  if (!open.length) return p.def.types[0];
  return open.reduce((best, t) => ((p.remaining[t]!.length < p.remaining[best]!.length) ? t : best));
}
