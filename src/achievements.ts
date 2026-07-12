import type { DailyAchievementRecord } from "./db";
import type { PlayRecord } from "./scraper";

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

export function koreaPlayDayKey(date: Date = new Date()): string {
  const shifted = new Date(date.getTime() + 5 * 60 * 60 * 1000);
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
}

function parseKoreaDateText(dateText: string): Date | null {
  const match = dateText.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = match[4] ? Number(match[4]) : 12;
  const minute = match[5] ? Number(match[5]) : 0;
  return new Date(Date.UTC(year, month - 1, day, hour - 9, minute));
}

export function playDayKeyFromRecordDate(dateText: string, fallback: string): string {
  const parsed = parseKoreaDateText(dateText);
  return parsed ? koreaPlayDayKey(parsed) : fallback;
}

export function recordPlayedAt(dateText: string): number {
  return parseKoreaDateText(dateText)?.getTime() ?? Date.now();
}

export function parseDailyAchievementRows(rows: readonly DailyAchievementRecord[]): PlayRecord[] {
  const records: PlayRecord[] = [];
  for (const row of rows) {
    try {
      const parsed: unknown = JSON.parse(row.recordJson);
      if (!isObjectRecord(parsed)) continue;
      const title = parsed["title"];
      const diff = parsed["diff"];
      if (typeof title !== "string" || typeof diff !== "string") continue;
      const achievement = parsed["achievement"];
      const level = parsed["level"];
      const date = parsed["date"];
      const jacketUrl = parsed["jacketUrl"];
      const musicKind = parsed["musicKind"];
      const achievementVal = parsed["achievementVal"];
      const track = parsed["track"];
      const fc = parsed["fc"];
      const sync = parsed["sync"];
      records.push({
        title,
        achievement: typeof achievement === "string" ? achievement : `${row.achievementVal.toFixed(4)}%`,
        diff,
        level: typeof level === "string" ? level : "?",
        date: typeof date === "string" ? date : "",
        jacketUrl: typeof jacketUrl === "string" ? jacketUrl : "",
        musicKind: typeof musicKind === "string" ? musicKind : "",
        achievementVal: typeof achievementVal === "number" ? achievementVal : row.achievementVal,
        track: typeof track === "number" ? track : 0,
        fc: typeof fc === "string" ? fc : "",
        sync: typeof sync === "string" ? sync : "",
        isNewScore: true,
      });
    } catch (error) {
      if (error instanceof SyntaxError) continue;
      throw error;
    }
  }
  return records;
}
