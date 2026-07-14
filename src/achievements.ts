function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function koreaPlayDayKey(date: Date = new Date()): string {
  // Achievement days begin at 04:00 KST (19:00 UTC on the prior date).
  const shifted = new Date(date.getTime() + 5 * 60 * 60 * 1000);
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
}

export function koreaPlayDayRange(playDay: string): { from: number; to: number } {
  const [year, month, day] = playDay.split("-").map(Number);
  const from = Date.UTC(year, month - 1, day, -5);
  return { from, to: from + 24 * 60 * 60 * 1000 };
}

function parseKoreaDateText(dateText: string): Date | null {
  const match = dateText.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = match[4] ? Number(match[4]) : 12;
  const minute = match[5] ? Number(match[5]) : 0;
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const parsed = new Date(Date.UTC(year, month - 1, day, hour - 9, minute));
  const shifted = new Date(parsed.getTime() + 9 * 60 * 60 * 1000);
  return shifted.getUTCFullYear() === year && shifted.getUTCMonth() === month - 1 && shifted.getUTCDate() === day
    && shifted.getUTCHours() === hour && shifted.getUTCMinutes() === minute ? parsed : null;
}

export function playDayKeyFromRecordDate(dateText: string, fallback: string): string {
  const parsed = parseKoreaDateText(dateText);
  return parsed ? koreaPlayDayKey(parsed) : fallback;
}

export function recordPlayedAt(dateText: string): number {
  return parseKoreaDateText(dateText)?.getTime() ?? Date.now();
}

export function hasValidRecordDate(dateText: string): boolean {
  return parseKoreaDateText(dateText) !== null;
}
