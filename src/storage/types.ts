export const MAIMAI_SERVERS = ["intl", "jp"] as const;
export type MaimaiServer = (typeof MAIMAI_SERVERS)[number];
export function isMaimaiServer(value: string): value is MaimaiServer { return value === "intl" || value === "jp"; }
export interface CachedProfile { profileKey:string; server:MaimaiServer; friendCode:string; playerName:string; rating:number; ratingMax:number; trophy:string; trophyClass:string; avatar:string; gradeImg:string; stars:string; comment:string; playCount:number; totalPlayCount:number; lastSyncedAt:number; recentJson:string; topJson:string; clearJson:string; mapJson:string; }
export interface ExtraBookmarklet { label:string; code:string; }
export interface OptionPresetInput { name:string; server:MaimaiServer; values:Record<string,string>; labels:Record<string,[string,string]>; }
export interface OptionPresetRow extends OptionPresetInput { id:number; updatedAt:number; }
/** scraper.UserOptionField 와 같은 모양(storage 는 scraper 를 import 하지 않는다). */
export interface UserOptionField { name:string; label:string; desc:string; value:string; options:[string,string][]; }
export interface PatchNoteInput { version:string; title:string; body:string; }
/** publishedAt=0 이면 초안. seen: 공개 후 이 노트를 본 등록 사용자 수(목록 조회 때만 채운다). */
export interface PatchNoteRow extends PatchNoteInput { id:number; publishedAt:number; createdAt:number; updatedAt:number; seen:number; }
export interface OptionSnapshot { server:MaimaiServer; fields:UserOptionField[]; syncedAt:number; }
export interface SongAliasRow { id:number; title:string; alias:string; isTranslation:boolean; }
export interface BotMessageRow { key:string; text:string; }
export interface AchievementPlayEventInput { profileKey:string; discordUserId?:string; playDay:string; chartKey:string; detailIdx?:string; sourceSequence:number; playedAt:number; firstCapturedAt?:number; sourceKind?:string; legacyUpdatedAt?:number; recordJson:string; achievementVal:number; isNewScore?:boolean; ratingUp?:number|null; title?:string; diff?:string; level?:string; musicKind?:string; achievementText?:string; fc?:string; sync?:string; }
export interface AchievementPlayEventLogInput { profileKey:string; sourcePlayId?:string; playedAt:number; chartKey:string; sourceSequence:number; capturedAt?:number; recordJson:string; achievementVal:number; achievementBefore:number; fc:string; sync:string; ratingUp?:number|null; title:string; diff:string; level:string; musicKind:string; achievementText:string; levelConstant?:number|null; }
export interface AchievementPlayEventLogRecord extends AchievementPlayEventLogInput { eventKey:string; payloadHash:string; scoreGain?:number; isMeaningful?:boolean; levelConstant?:number|null; ratingGain?:number; }
export interface DailyAchievementSummary extends AchievementPlayEventLogRecord { achievementGain: number; achievementAfter:number; ratingGain:number; levelConstant?:number|null; }
export interface ChartClearInput { chartKey:string; achievementVal:number; fc:string; sync:string; }
// fcImproved/syncImproved: 이번 동기화에서 콤보/싱크 등급이 실제로 올라갔는지.
// 성과 이벤트에 "이미 갖고 있던" 마크(예: 달성률만 오른 날의 예전 FS)를 붙이지 않기 위함.
export interface ChartClearDiff extends ChartClearInput { achievementBefore:number; fcImproved:boolean; syncImproved:boolean; }
export interface GoalRow { id:number; discordUserId:string; kind:string; specJson:string; label:string; progress:number; currentJson:string; completedAt:number; createdAt:number; updatedAt:number; }
export interface GoalProgressUpdate { id:number; progress:number; currentJson:string; completedAt:number; }
