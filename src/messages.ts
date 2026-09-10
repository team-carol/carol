// 봇이 출력하는 사용자 대면 문구의 단일 카탈로그.
//
// 여기 있는 값이 "기본값"이고, 운영 중에는 /관리 페이지에서 키별로 덮어쓸 수 있다
// (bot_messages 테이블). 오버라이드가 없으면 항상 이 기본값이 쓰인다.
//
// 자리표시자는 {name} 형태로 쓴다. 허용 목록은 기본값에서 자동으로 추출되므로
// 키마다 따로 선언하지 않는다 — 오버라이드가 기본값에 없는 변수를 쓰면 거부된다.
//
// 슬래시 명령의 이름·설명은 기동 시 Discord에 등록되는 값이라 런타임 변경이
// 불가능하다. 그래서 여기 넣지 않는다.

export const MESSAGES = {
  // ── 공통 ────────────────────────────────────────────────────────────────
  "common.selfNotRegistered":
    "아직 프로필이 등록되지 않았습니다. `/북마클릿` 명령어로 먼저 등록해주세요.",
  "common.otherNotRegistered": "{user} 님은 아직 프로필을 등록하지 않았습니다.",
  "common.profilePrivate": "{user} 님은 프로필을 비공개로 설정했습니다.",
  "common.adminGuildOnly": "이 명령어는 지정된 서버에서만 사용할 수 있습니다.",

  // ── /레이팅표 ───────────────────────────────────────────────────────────
  "ratingImage.noRecords": "레이팅 기록이 없습니다. 북마클릿을 다시 실행하세요.",
  "ratingImage.snapshotNotice": "📅 {date} 기준 레이팅표",
  "ratingImage.snapshotNoticeFallback": "📅 {actual} 기준 레이팅표 · {date} 에는 갱신 기록이 없어 직전 기록을 표시합니다",
  "ratingImage.snapshotMissing": "{date} 이전의 레이팅표 기록이 없습니다. 조회 가능한 범위: {first} ~ {last}",
  "ratingImage.rewindNotice": "📅 {date} 기준 레이팅표 (추정) · 저장된 기록이 없어 성과 이력으로 역산했습니다",
  "ratingImage.rewindTooOld": "{date} 는 성과 추적 시작({first}) 이전이라 역산할 수 없습니다.",
  "ratingImage.rewindNoData": "{date} 의 레이팅표를 복원할 자료가 없습니다. 저장된 기록도, 역산할 성과 이력도 없습니다.",
  "ratingImage.snapshotNone": "아직 저장된 레이팅표 기록이 없습니다. 동기화하면 그날부터 하루씩 쌓입니다.",
  "ratingImage.snapshotBadDate": "날짜는 YYYY-MM-DD 형식으로 입력해주세요. (예: 2026-09-03)",
  "ratingImage.snapshotGameUnsupported": "과거 날짜 조회는 maimai DX 레이팅표만 지원합니다. 다른 게임 환산은 전체 클리어 기록이 필요한데, 스냅샷은 레이팅 대상 50곡만 보관합니다.",
  "ratingImage.renderFailed": "이미지 생성에 실패했습니다.",

  // ── /공지설정 · 공지 폴링 ───────────────────────────────────────────────
  "news.sourceJp": "maimai でらっくす 공식 (내수판)",
  "news.untitled": "(제목 없음)",
  "newsSettings.title": "공지 알림 설정",
  "newsSettings.jpField": "내수판 (info-maimai.sega.jp)",
  "newsSettings.intlField": "국제판 (maimai.sega.com)",
  "newsSettings.off": "꺼짐",
  "newsSettings.set": "{source} 공지를 {channel} 에 올립니다.",
  "newsSettings.cleared": "{source} 공지 알림을 껐습니다.",
  "newsSettings.notSet": "설정되어 있지 않습니다.",
  "newsSettings.badChannel": "봇이 글을 쓸 수 있는 텍스트 채널을 지정해주세요.",
  "newsSettings.hint": "채널을 지정하면 켜지고, `해제` 옵션으로 끕니다. 새 공지만 올라가며 과거 공지는 올리지 않습니다.",

  // ── 공통 (서버/권한) ────────────────────────────────────────────────────
  "common.guildOnly": "서버에서만 사용 가능합니다.",
  "common.guildAdminOnly": "서버 관리자만 사용 가능합니다.",

  // ── /역할설정 ───────────────────────────────────────────────────────────
  "role.needManageRoles": "봇에 '역할 관리' 권한이 필요합니다.",
  "role.needBookmarklet": "먼저 `/북마클릿`으로 프로필을 등록해주세요.",
  "role.noProfileData": "프로필 데이터가 없습니다. `/북마클릿`으로 동기화해주세요.",
  "role.ratingTooLow": "레이팅이 2000 미만이라 역할이 부여되지 않습니다.",
  "role.memberUnavailable": "멤버 정보를 불러올 수 없습니다.",
  "role.rolePositionTooHigh":
    "\"{role}\" 역할이 봇보다 높거나 같아서 부여할 수 없습니다. 관리자가 역할 순서를 조정해주세요.",
  "role.granted": "레이팅 **{rating}** → **{role}** 역할 부여 완료!",
  "role.failed": "역할 부여 실패: {reason}",
  "role.unknownError": "알 수 없는 오류",

  // ── /서버설정 ───────────────────────────────────────────────────────────
  "serverSettings.title": "⚙️ 서버 설정",
  "serverSettings.autoRoleField": "자동 역할 부여",
  "serverSettings.enabled": "✅ 활성화",
  "serverSettings.disabled": "❌ 비활성화",
  "serverSettings.enableButton": "활성화",
  "serverSettings.disableButton": "비활성화",

  // ── /설정 ───────────────────────────────────────────────────────────────
  "settings.title": "⚙️ 웹 설정",
  "settings.currentServerField": "현재 서버",
  "settings.manageField": "설정 페이지에서 관리",
  "settings.manageBody": "프로필 공개 여부, 프리셋 북마클릿, 추가 북마클릿을 웹에서 관리할 수 있습니다.",
  "settings.termsField": "이용약관",
  "settings.termsBody": "추가 북마클릿 사용 책임과 면책 조항은 이용약관에서 확인할 수 있습니다.",
  "settings.openButton": "웹 설정 열기",
  "settings.termsButton": "이용약관",

  // ── /상태 ───────────────────────────────────────────────────────────────
  "status.title": "서버 상태",
  "status.ping": "핑",
  "status.uptime": "가동 시간",
  "status.version": "버전",
  "status.userCount": "등록 유저",
  "status.userCountValue": "{count}명",
  "status.lastSync": "마지막 동기화",

  // ── /레이팅기준표 ───────────────────────────────────────────────────────
  "ratingTable.title": "레이팅 티어 기준표",
  "ratingTable.footer": "/역할설정 으로 현재 레이팅에 맞는 역할 부여",

  // ── /오늘의곡 ───────────────────────────────────────────────────────────
  "fortune.noSongs": "오늘의 운세를 만들 곡을 찾지 못했습니다. 곡 데이터를 다시 불러와 주세요.",
  "fortune.title": "오늘의 운세",
  "fortune.body": "오늘의 곡은 **{title}** 입니다.",
  "fortune.chartField": "선정 차트",
  "fortune.constantField": "상수",
  "fortune.footer": "기준일: {date}",

  // ── /검색 ───────────────────────────────────────────────────────────────
  "search.failed": "검색에 실패했습니다.",

  // ── /성과 ───────────────────────────────────────────────────────────────
  "achievement.renderFailed": "성과 이미지 생성에 실패했습니다.",
  "achievement.loadFailed": "성과 데이터를 불러오지 못했습니다.",

  // ── /북마클릿 ───────────────────────────────────────────────────────────
  "bookmarklet.title": "🔖 북마클릿 설치",
  "bookmarklet.openButton": "설치 가이드 열기",
  "bookmarklet.body":
    "아래 버튼을 눌러 설치 가이드 페이지를 여세요.\n\n" +
    "**PC** — 초록색 링크를 북마크바로 드래그\n" +
    "**모바일** — 복사 버튼 → 북마크에 붙여넣기",

  // ── 프로필 임베드 ───────────────────────────────────────────────────────
  "embed.noTrophy": "칭호 없음",
  "embed.noName": "이름 없음",
  "embed.profileBody": "**{name}**  ·  **{rating}**\n플레이 {play}/{total}회{stars}",
  "embed.profileFooter": "서버: {server}  ·  마지막 동기화: {synced}",
  "embed.prev": "◀ 이전",
  "embed.next": "다음 ▶",
  "embed.share": "#{index} 공유",

  // ── 최근 플레이 ─────────────────────────────────────────────────────────
  "recent.empty": "기록 없음",
  "recent.achievementField": "달성률",
  "recent.dateField": "플레이일",

  // ── 지방(맵) ────────────────────────────────────────────────────────────
  "map.eventArea": "이벤트 지방",
  "map.normalArea": "일반 지방",
  "map.progress": "진행도: {value}",
  "map.distance": "거리: {value}",
  "map.reward": "보상: {value}",
  "map.unnamedArea": "이름 없는 지방",
  "map.areaFallback": "지방",
  "map.footer": "{server}  ·  {index} / {total}  ·  마지막 동기화: {synced}",
  "map.empty": "지방 진행도 없음\n북마클릿을 다시 실행하면 업데이트됩니다.",
  "map.shareButton": "공유 · {area}",

  // ── 검색 결과 ───────────────────────────────────────────────────────────
  "searchResult.empty": "\"{query}\"{type} 검색 결과 없음",
  "searchResult.author": "\"{query}\"{type} 에 대한 검색 결과",
  "searchResult.regionExclusive": "{version} 전용",
  "searchResult.externalLink": "[▶ 외부출력]({url})",
  "searchResult.genreSuffix": "\n    {genre}",
  "searchResult.versionSuffix": "\n    {version}",

  // ── 레이팅 대상곡 ───────────────────────────────────────────────────────
  "ratingTarget.empty": "레이팅 기록 없음\n북마클릿을 다시 실행하면 업데이트됩니다.",
  "ratingTarget.body": "**신곡 NEW · {newCount}곡**\n{newBlock}\n**구곡 OTHERS · {otherCount}곡**\n{otherBlock}",
  "ratingTarget.footer": "총 {total}곡  ·  RS=곡별 레이팅 점수",

  // ── 프로필 버튼 ─────────────────────────────────────────────────────────
  "profileButton.recent": "최근 플레이",
  "profileButton.ratingTarget": "레이팅 대상곡",
  "profileButton.map": "지방 진행도",

  // ── /목표 ───────────────────────────────────────────────────────────────
  "goal.needCriteriaOrAchievement": "`기준` 선택지 또는 `달성률` 중 하나를 지정하세요.",
  "goal.needRating": "레이팅 목표에는 `레이팅` 값이 필요합니다.",
  "goal.needChartAndDiff": "채보 목표에는 `곡` 과 `난이도` 가 필요합니다.",
  "goal.songNotFound": "`{title}` 곡을 목록에서 찾지 못했습니다. 곡명이 정확한지 확인해주세요.",
  "goal.needLevel": "집계 목표에는 `레벨` 이 필요합니다. (예: 13, 13+, 13-14+)",
  "goal.badLevelFormat": "`레벨` 형식이 올바르지 않습니다. 예: `13`, `13+`, `13-14+`",
  "goal.listTitle": "🎯 {name} 님의 목표",
  "goal.listFooter": "{done}/{total} 완료{page} · 동기화할 때마다 자동 갱신",
  "goal.listFooterPage": " · {index}/{pages}페이지",
  "goal.otherPrivate": "해당 유저는 프로필을 비공개로 설정했습니다.",
  "goal.defaultName": "유저",
  "goal.notFound": "{number}번 목표가 없습니다. `/목표 목록` 에서 번호를 확인해주세요.",
  "goal.limitReached": "목표는 최대 {max}개까지 등록할 수 있습니다. 먼저 `/목표 삭제` 로 정리해주세요.",
  "goal.addedTitle": "🎯 목표 추가됨",
  "goal.progressField": "현재 진행도",
  "goal.progressValue": "`{bar}` {percent}% · {value}{target}{done}",
  "goal.alreadyDone": "  ✅ 이미 달성!",
  "goal.progressNeedsProfile": "`/북마클릿` 으로 프로필을 먼저 등록하면 동기화할 때마다 자동으로 갱신됩니다.",

  // ── /랜덤 ───────────────────────────────────────────────────────────────
  "random.rangeAll": "전체",
  "random.needProfileForPlayFilter": "플레이여부 필터는 프로필이 필요합니다. `/북마클릿`으로 먼저 등록해주세요.",
  "random.noMatch": "조건에 맞는 곡이 없습니다.",
  "random.label": "랜덤",
  "random.fieldGenre": "장르",
  "random.fieldVersion": "버전",

  // ── /곡추천 ─────────────────────────────────────────────────────────────
  "songrec.noRecords": "기록이 없습니다. `/북마클릿`으로 먼저 동기화해주세요.",
  "songrec.noCandidates": "추천할 채보를 찾지 못했습니다.",
  "songrec.notPlayed": "미플레이",
  "songrec.newSong": "신곡",
  "songrec.oldSong": "구곡",

  // ── 공통 (외부 링크) ────────────────────────────────────────────────────
  "common.externalLink": "[▶ 외부출력]({url})",

  // ── /문의 ───────────────────────────────────────────────────────────────
  "report.modalTitle": "문의 작성",
  "report.contentLabel": "제보 내용",
  "report.attachmentLabel": "사진·영상 첨부 (선택)",
  "report.noTitle": "(제목 없음)",
  "report.noSummary": "(요약 없음)",
  "report.previewFooter": "아래에서 생성하면 team-carol/carol 저장소에 이슈가 등록됩니다.",
  "report.tooShortNotice": "제보 내용이 짧아 근거 없는 세부는 생성하지 않았습니다. 취소 후 재현 방법·기대 동작을 더 자세히 적어주시면 더 정확한 이슈가 만들어집니다.",
  "report.createButton": "이슈 생성",
  "report.cancelButton": "취소",
  "report.notConfigured": "제보 기능이 설정되지 않았습니다. 관리자에게 문의해주세요.",
  "report.noChannel": "채널 정보를 확인할 수 없습니다. 서버 채널에서 다시 시도해주세요.",
  "report.expired": "요청이 만료되었습니다. 다시 시도해주세요.",
  "report.expiredRetry": "요청이 만료되었습니다. `/문의` 로 다시 시도해주세요.",
  "report.failed": "오류가 발생했습니다. 잠시 후 다시 시도해주세요.",

  // ── 버튼 상호작용 ───────────────────────────────────────────────────────
  "button.needProfile": "프로필을 먼저 등록하세요.",
  "button.profileNotFound": "프로필을 찾을 수 없습니다.",
  "button.songNotFound": "곡을 찾을 수 없습니다.",
  "button.mapNotFound": "지방 진행도를 찾을 수 없습니다.",
  "button.shareFooter": "{name}의 플레이  ·  공유: {sharer}",
  "button.ownMapOpenOnly": "본인 지방 진행도만 열 수 있습니다.",
  "button.ownMapViewOnly": "본인 지방 진행도만 볼 수 있습니다.",
  "button.ownMapShareOnly": "본인 지방 진행도만 공유할 수 있습니다.",

  // ── 문의 API 오류 ───────────────────────────────────────────────────────
  "issue.timeout": "요청 시간 초과",
  "issue.networkError": "네트워크 오류",
  "issue.badInput": "⚠️ 입력을 확인해주세요. 제보 내용이 비어있거나 형식이 올바르지 않습니다.",
  "issue.draftFailed": "⏳ AI 초안 생성이 일시적으로 실패했습니다. 잠시 후 다시 시도해주세요.",
  "issue.unreachable": "⏳ 제보 서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.",
  "issue.serverError": "❌ 제보 처리 중 서버 오류가 발생했습니다. 관리자에게 문의해주세요.",
  "issue.unknownError": "❌ 알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",

  // ── /상태 (표기 단위) ───────────────────────────────────────────────────
  "status.days": "{value}일",
  "status.hours": "{value}시간",
  "status.minutes": "{value}분",
  "status.pingMeasuring": "측정 중",
  "status.none": "없음",

  // ── 목표 문구 ───────────────────────────────────────────────────────────
  "goalText.orAbove": "{value} 이상",
  "goalText.percentOrAbove": "{value}% 이상",
  "goalText.ratingTarget": "레이팅 {target} 도달",
  "goalText.scopeAll": "전곡",
  "goalText.scopeCount": "{count}개",
  "goalText.noRecord": "미기록",
  "goalText.songCount": "{count}곡",
  "goalText.poolSize": "구간 내 채보 {count}개",
  "goalText.noConstantData": "곡 상수 데이터 없음",

  // ── 개인정보처리방침 고지 ───────────────────────────────────────────────
  "policy.updatedTitle": "**carol 개인정보처리방침이 업데이트되었습니다** (2026년 9월)",
  "policy.updatedBody":
    "비공식 크롬 확장(캐롤익스텐션)을 통한 프로필 동기화 경로가 추가되었습니다. " +
    "확장은 선택 사항이며 직접 설치하고 동기화를 켠 경우에만 동작합니다. " +
    "전송되는 데이터의 종류·목적은 기존 북마클릿과 동일합니다.",

  // ── /관리 (별명·문구 관리) ───────────────────────────────────────────────
  "admin.embedTitle": "🛠 캐롤봇 관리",
  "admin.embedBody":
    "아래 버튼으로 관리 페이지를 엽니다.\n" +
    "곡 별명과 봇 출력 문구를 관리할 수 있습니다.\n\n" +
    "⏳ 링크는 **60분** 후 만료됩니다. (본인만 사용하세요)",
  "admin.buttonLabel": "관리 페이지 열기",
} as const;

export type MessageKey = keyof typeof MESSAGES;

export const MESSAGE_KEYS = Object.keys(MESSAGES) as MessageKey[];

// 기본값에서 {name} 자리표시자를 뽑는다. 오버라이드 검증의 허용 목록이 된다.
const PLACEHOLDER = /\{([a-zA-Z][a-zA-Z0-9_]*)\}/g;

export function placeholdersOf(text: string): string[] {
  return [...new Set(Array.from(text.matchAll(PLACEHOLDER), (m) => m[1]))];
}

export function defaultOf(key: MessageKey): string {
  return MESSAGES[key];
}

// 오버라이드 캐시. DB에서 loadMessages()로 채운다.
let overrides = new Map<string, string>();

export function applyMessageOverrides(rows: { key: string; text: string }[]): void {
  overrides = new Map(rows.filter((r) => (MESSAGES as Record<string, string>)[r.key] !== undefined).map((r) => [r.key, r.text]));
}

export function getOverride(key: MessageKey): string | null {
  return overrides.get(key) ?? null;
}

export function rawText(key: MessageKey): string {
  return overrides.get(key) ?? MESSAGES[key];
}

/** 문구를 가져와 {name} 자리표시자를 치환한다. 값이 없는 자리표시자는 그대로 둔다. */
export function msg(key: MessageKey, vars?: Record<string, string | number>): string {
  const text = rawText(key);
  if (!vars) return text;
  return text.replace(PLACEHOLDER, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole,
  );
}

/** 오버라이드 유효성 검사. 문제가 없으면 null, 있으면 사유 문자열. */
export function validateOverride(key: MessageKey, text: string): string | null {
  if (typeof text !== "string") return "문자열이 아닙니다";
  if (!text.trim()) return "빈 문구는 저장할 수 없습니다";
  // Discord 임베드 설명 상한(4096)을 넘지 않게 막는다.
  if (text.length > 4000) return `너무 깁니다 (${text.length}자 / 최대 4000자)`;
  const allowed = new Set(placeholdersOf(MESSAGES[key]));
  const used = placeholdersOf(text);
  const unknown = used.filter((v) => !allowed.has(v));
  if (unknown.length) {
    return `기본값에 없는 자리표시자입니다: ${unknown.map((v) => `{${v}}`).join(", ")}`;
  }
  const missing = [...allowed].filter((v) => !used.includes(v));
  if (missing.length) {
    return `빠진 자리표시자가 있습니다: ${missing.map((v) => `{${v}}`).join(", ")}`;
  }
  return null;
}

// DB의 오버라이드를 읽어 캐시에 반영한다. 기동 시와 문구 수정 직후에 호출한다.
export async function loadMessages(): Promise<void> {
  const { getMessageOverrides } = await import("./storage");
  const rows = await getMessageOverrides();
  applyMessageOverrides(rows);
  console.log(`[messages] 문구 ${MESSAGE_KEYS.length}개 중 오버라이드 ${overrides.size}개 로드`);
}
