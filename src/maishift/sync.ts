/**
 * maishift 전체 기록을 새로 받았을 때(업로드 시각이 바뀌었거나 처음 받았을 때) 캐롤봇 쪽 파생 데이터를 갱신한다.
 * - 성과: chart_clears(직전 기록)와 비교해 오른 보면만 이벤트로 남긴다. 비교 기준이 없으면(첫 비교) 기준만 채운다.
 *   플레이 시각·레이팅 상승분(+N)은 캐롤봇 북마클릿이 모은 최근 플레이 기록에서 같은 보면을 찾아 붙인다.
 * - 레이팅 스냅샷(/레이팅이미지 날짜 조회용), 목표 진행률.
 * chart_clears 비교는 DB 기준이라 같은 기록을 다시 받아도 이벤트가 두 번 생기지 않는다.
 */
import { chartKey, type PlayRecord } from "../scraper";
import {
  getMaishiftUsers, getStoredProfile, hasChartClears, copyChartClears, upsertChartClears, saveAchievementPlayEventLogBatch,
  listGoals, updateGoalProgress, maishiftProfileKey, type MaishiftLink,
} from "../storage";
import { hasValidRecordDate, recordPlayedAt, koreaPlayDayKey } from "../achievements";
import { evaluateGoal, GOAL_KINDS, type GoalKind } from "../goals";

export interface MaishiftUpdate {
  link: MaishiftLink;
  /** 플레이한 모든 보면 */
  records: PlayRecord[];
  /** 레이팅 대상(신곡 15 → 구곡 35) */
  top: PlayRecord[];
  rating: number;
  /** maishift 업로드 시각 */
  uploadedAt: number;
}

/** 캐롤봇 북마클릿이 저장한 최근 플레이 기록(플레이 시각·상세 포함). recent_json = { recent, history }. */
function playHistoryOf(recentJson: string | undefined): PlayRecord[] {
  try {
    const x = JSON.parse(recentJson || "[]");
    return Array.isArray(x?.history) ? x.history : [];
  } catch {
    return [];
  }
}

async function applyForUser(u: MaishiftUpdate, discordUserId: string, profileKey: string): Promise<void> {
  const now = Date.now();
  let had = await hasChartClears(profileKey);
  // 추가 북마클릿을 처음 실행하면 프로필 키가 maishift 키에서 친구 코드 키로 바뀐다. 그동안 쌓은 비교 기준을 옮겨
  // 이번 업로드의 성과를 놓치지 않게 한다.
  const msKey = maishiftProfileKey(u.link);
  if (!had && profileKey !== msKey && await hasChartClears(msKey)) {
    await copyChartClears(msKey, profileKey);
    had = true;
  }
  const diffs = await upsertChartClears(profileKey, u.records.map((r) => ({ chartKey: chartKey(r), achievementVal: r.achievementVal, fc: r.fc, sync: r.sync })));
  if (had && diffs.length) {
    const stored = profileKey.startsWith("ms:") ? null : await getStoredProfile(profileKey);
    const historyByChart = new Map<string, PlayRecord[]>();
    for (const r of playHistoryOf(stored?.recentJson)) {
      const k = chartKey(r);
      const list = historyByChart.get(k);
      if (list) list.push(r); else historyByChart.set(k, [r]);
    }
    const byChart = new Map(u.records.map((r) => [chartKey(r), r]));
    const events = diffs.map((d, idx) => {
      const candidates = historyByChart.get(d.chartKey) ?? [];
      const match = candidates.find((r) => Math.abs(r.achievementVal - d.achievementVal) < 0.00005)
        ?? candidates.reduce<PlayRecord | undefined>((best, r) => (!best || r.achievementVal > best.achievementVal ? r : best), undefined);
      // 최근 플레이에서 못 찾으면 maishift 업로드 시각을 플레이 시각으로 쓴다.
      const playedAt = match && hasValidRecordDate(match.date) ? recordPlayedAt(match.date) : u.uploadedAt;
      const source = byChart.get(d.chartKey)!;
      return {
        profileKey,
        sourcePlayId: match?.detailIdx ?? `clear:${d.chartKey}:${d.achievementVal.toFixed(4)}:${u.uploadedAt}`,
        chartKey: d.chartKey, playedAt, sourceSequence: idx, capturedAt: now,
        recordJson: JSON.stringify(match ?? source), achievementVal: d.achievementVal, achievementBefore: d.achievementBefore,
        // 이번에 새로 얻은 마크만 기록한다. 달성률만 오른 날엔 예전 FC/FS 를 붙이지 않음.
        fc: d.fcImproved ? d.fc : "", sync: d.syncImproved ? d.sync : "", ratingUp: match?.ratingUp,
        title: source.title, diff: source.diff, level: source.level, musicKind: source.musicKind,
        achievementText: match?.achievement ?? `${d.achievementVal.toFixed(4)}%`,
        sourceKind: "maishift",
      };
    });
    await saveAchievementPlayEventLogBatch(events, now);
    console.log(`[maishift] 성과 ${events.length}건 key=${profileKey}`);
  }

  const goals = await listGoals(discordUserId);
  for (const goal of goals) {
    try {
      const spec = JSON.parse(goal.specJson);
      if (!GOAL_KINDS.includes(spec?.kind as GoalKind)) continue;
      const evaluation = evaluateGoal(spec, { profile: { rating: u.rating, clearJson: "[]", server: u.link.server }, clearRecords: u.records });
      await updateGoalProgress(
        goal.id,
        evaluation.progress,
        JSON.stringify({ valueText: evaluation.valueText, targetText: evaluation.targetText, detail: evaluation.detail, at: now }),
        evaluation.done ? now : 0,
      );
    } catch (e) {
      console.warn(`[maishift] 목표 평가 실패 goalId=${goal.id}:`, (e as Error).message);
    }
  }
}

/** 이 maishift 아이디를 연동한 모든 사용자에게 반영한다. 실패해도 프로필 조회에는 영향이 없게 호출부에서 잡는다. */
export async function applyMaishiftUpdate(u: MaishiftUpdate): Promise<void> {
  for (const user of await getMaishiftUsers(u.link.handle, u.link.server)) {
    try {
      await applyForUser(u, user.discordUserId, user.profileKey || maishiftProfileKey(u.link));
    } catch (e) {
      console.error(`[maishift] 기록 반영 실패 user=${user.discordUserId.slice(-6)}:`, e);
    }
  }
}
