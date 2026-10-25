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
  // maishift 공식 API 에 엔드포인트가 아직 없어 꺼 둔 기능(src/maishift/features.ts)
  "common.featurePaused": "이 기능은 maishift 공식 API 지원을 기다리고 있어 잠시 사용할 수 없습니다.",
  // maishift API 이용 한도(앱 전체 분당 120단위)를 넘었을 때
  "common.rateLimited": "지금 maishift 조회 요청이 많아 처리할 수 없습니다. {minutes}분 뒤에 다시 시도해 주세요.",
  "common.selfNotRegistered":
    "maishift 계정이 연동되어 있지 않습니다. `/마이시프트 연동`으로 먼저 연동해 주세요.\n계속해서 해당 메시지가 출력되면 잠시 후 다시 시도해 주세요.",
  "common.selfMaishiftPrivate": "maishift 프로필이 비공개로 설정되어 있습니다.",
  "common.otherMaishiftPrivate": "{user} 님은 maishift 프로필을 비공개로 설정했습니다.",
  "common.selfRegionMissing": "현재 maishift에 {server} 기록이 없습니다.",
  "common.otherRegionMissing": "{user} 님은 maishift에 {server} 기록이 없습니다.",
  "common.otherNotRegistered": "{user} 님은 아직 maishift 계정을 연동하지 않았습니다.",
  "common.noBookmarklet": "해당 기능은 캐롤봇 추가 북마클릿 실행이 필요합니다. `/북마클릿`으로 설치한 뒤 maimai DX NET에서 실행해 주세요.",
  "common.needCarolBookmarklet": "해당 기능은 캐롤봇 추가 북마클릿 실행이 필요합니다. `/북마클릿`으로 설치한 뒤 maimai DX NET에서 실행해 주세요.",
  "common.adminGuildOnly": "해당 서버에서는 이 명령어를 사용할 수 없습니다.",

  // ── /레이팅표 ───────────────────────────────────────────────────────────
  "ratingImage.noRecords": "maishift에 레이팅 기록이 없습니다.",
  "ratingImage.snapshotNotice": "- {date} 기준 레이팅표 ({uploaded} 갱신)",
  "ratingImage.snapshotMissing": "{date} 이전에 maishift에 저장한 기록이 없습니다. 조회 가능한 범위는 다음과 같습니다.\n```{first} ~ {last}```",
  "ratingImage.snapshotNone": "maishift에 저장된 이전 기록이 없습니다.",
  "ratingImage.snapshotBadDate": "날짜는 YYYY-MM-DD 형식으로 입력해주세요. (예: 2026-09-03)",
  "ratingImage.snapshotGameUnsupported": "이전 기록 조회는 현재 maimai DX와 S-레이팅만 지원합니다.",
  "ratingImage.snapshotFailed": "maishift에서 이전 기록을 불러오는데 실패했습니다. 잠시 뒤에 다시 시도해 주세요.",
  "ratingImage.pastPrivateSelf": "maishift에서 이전 기록 공개 설정이 꺼져 있어 과거 레이팅표를 볼 수 없습니다.",
  "ratingImage.pastPrivate": "{user} 님은 maishift에서 이전 기록을 공개하지 않았습니다.",
  "photo.title": "## {name} 님의 사진관\n{user} ✦ 사진 종류를 고르고 `만들기` 버튼을 누르세요.",
  "photo.titleNotRegistered": "## 사진관\n{user} ✦ {notice}",
  "photo.kindHeading": "### 사진 종류",
  "photo.kindPlaceholder": "만들 사진을 선택하세요",
  "photo.ratingTypeHeading": "### 레이팅 종류",
  "photo.ratingType.maimai": "maimai DX",
  "photo.ratingType.future": "미래시",
  "photo.ratingType.srating": "S-레이팅",
  "photo.ratingType.game": "{game} 변환",
  "photo.dateHeading": "### 날짜",
  "photo.dateLatest": "최신",
  "photo.dateToday": "오늘",
  "photo.dateInput": "직접 입력…",
  "photo.dateModalTitle": "날짜 입력",
  "photo.dateModalLabel": "날짜 (YYYY-MM-DD)",
  "photo.periodHeading": "### 기간",
  "photo.userHeading": "### 유저",
  "photo.userPlaceholder": "사진을 볼 유저를 선택하세요",
  "photo.make": "{kind} 만들기",
  "photo.kind.profile": "프로필",
  "photo.kind.rating": "레이팅표",
  "photo.kind.history": "히스토리",
  "photo.kind.achievement": "성과",
  "photo.kind.stamp": "스탬프",
  "photo.kind.circle": "서클",
  "ratingImage.futureNotice": "- {version} 기준 미래시 레이팅표입니다. (기존 {rating})",
  "ratingImage.futureNone": "현재 미래시가 존재하지 않습니다.",
  "ratingImage.futureWithDate": "미래시는 date 옵션과 함께 실행될 수 없습니다.",
  "ratingImage.futureFailed": "maishift에서 미래시를 불러오는데 실패했습니다. 잠시 뒤에 다시 시도해 주세요.",
  "ratingImage.sRatingNoData": "S-레이팅을 계산할 디럭스코어 기록이 없습니다.",
  "ratingImage.renderFailed": "이미지 생성에 실패했습니다.",

  // ── /보면 (simai 채보 플레이어) ─────────────────────────────────────────
  "chart.tooLarge": "파일이 너무 큽니다. (최대 2MB)",
  "chart.notText": "텍스트 파일(txt)을 올려주세요.",
  "chart.downloadFailed": "첨부 파일을 읽지 못했습니다. 다시 시도해주세요.",
  "chart.parseFailed": "채보를 해석하지 못했습니다. simai 형식의 파일이 맞는지 확인해주세요.",
  "chart.noChart": "파일에서 채보(`&inote_N=`)를 찾지 못했습니다.",
  "chart.emptyChart": "해당 난이도에 노트가 없습니다.",
  "chart.diffMissing": "이 파일에는 {want} 채보가 없습니다. 파일에 존재하는 난이도는 다음과 같습니다: {has}",
  "chart.quota": "올릴 수 있는 채보는 최대 {max}개까지입니다. 업로드 된 채보는 30일 뒤 자동으로 삭제됩니다.",
  "chart.saveFailed": "채보 저장에 실패했습니다. 잠시 후 다시 시도해주세요.",
  "chart.untitled": "(제목 없음)",
  "chart.openLink": "[브라우저에서 재생]({url})",
  "chart.button": "채보 열기",
  "chart.fieldChart": "채보",
  "chart.fieldBpm": "BPM",
  "chart.fieldLength": "길이",
  "chart.fieldNotes": "노트",
  "chart.fieldPreview": "미리보기",
  "chart.previewRange": "{from} 부터 {sec}초",
  "chart.diffUnknown": "난이도 미상",
  "chart.bpmAssumedNote": "파일에 BPM 표기가 없어 실제 BPM과 다를 수 있습니다.",
  "chart.footer": "{user} 님이 업로드 한 채보 (30일 보관)",
  "chart.videoButton": "영상 만들기",
  "chart.videoRendering": "영상을 렌더하고 있습니다. 곡 길이에 따라 1~3분 이상 소요될 수 있습니다.\n완료되면 이 메시지에 링크가 올라옵니다.",
  "chart.videoQueued": "영상 렌더를 대기하고 있습니다.({n}개 남음).\n완료되면 이 메시지에 링크가 올라옵니다.",
  "chart.videoAttached": "**{title}** / 400px 60fps / 가이드음 포함",
  "chart.videoTooBig": "파일이 커서 링크로 대체되었습니다.\n[영상 보기]({url}) / 400px 60fps / 가이드음 포함",
  "chart.videoFailed": "영상 생성에 실패했습니다. 잠시 후 다시 시도해주세요.",
  "chart.footerRegistry": "등록된 채보",
  "chart.footerSource": "채보 출처: {source} · 링크를 아는 사람만 볼 수 있습니다",
  "chart.sourceCredit": "채보: [{designer}]({url}) · simai wiki",
  "chart.sourceCreditMainotes": "채보: [{designer}]({url}) · mai-notes",
  "chart.sourceLinkMainotes": "채보: [mai-notes]({url})",
  "chart.needInput": "재생할 채보를 골라주세요. `곡명` 에 곡 이름을 입력하거나, `파일` 로 maidata.txt 를 올리면 됩니다.",
  "chart.bothInput": "`곡명` 과 `파일` 중 하나만 지정해주세요.",
  "chart.unavailable.not-found": "채보를 찾지 못했습니다. 목록에서 골라주세요.",
  "chart.unavailable.no-data": "목록에는 존재하지만 아직 데이터가 없는 채보입니다.",
  "chart.unavailable.no-permission": "현재 이용할 수 없는 기능입니다.",

  // ── /공지설정 · 공지 폴링 ───────────────────────────────────────────────
  "news.sourceJp": "maimai でらっくす 공식 (japan ver.)",
  "news.untitled": "(제목 없음)",
  "news.titleKo": "{title}",
  "news.viewOriginal": "원문 보기",
  "news.viewTranslated": "번역 보기",
  "news.machineTranslated": "기계 번역된 내용입니다.",
  "news.truncated": "…\n\n(내용이 길어 잘렸습니다. [원문 보기]({url}))",
  "news.detailExpired": "보관 기간이 지난 공지입니다. 임베드 제목의 링크로 원문을 확인해주세요.",
  "news.detailEmpty": "본문을 가져오지 못했습니다. [원문 보기]({url})",
  "news.translationPending": "번역을 준비 중입니다. 잠시 후 다시 눌러주세요. [원문 보기]({url})",
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

  // ── /설정 ───────────────────────────────────────────────────────────────
  "settings.title": "⚙️ 웹 설정",
  "settings.currentServerField": "현재 서버",
  "settings.manageField": "설정 페이지에서 관리",
  "settings.manageBody": "캐롤봇의 개인 설정을 웹에서 관리할 수 있습니다. 프로필, 친구 코드, 이전 기록 공개 여부는 maishift 설정을 따릅니다.",
  "settings.termsField": "이용약관",
  "settings.termsBody": "추가 북마클릿 사용 책임과 면책 조항은 이용약관에서 확인할 수 있습니다.",
  "settings.openButton": "웹 설정 열기",
  "settings.termsButton": "이용약관",

  // ── /게임설정 ────────────────────────────────────────────────────────────
  "circle.private": "{user} 님은 서클 정보를 비공개로 설정했습니다.",
  "circle.notCollected": "서클 정보는 캐롤봇 추가 북마클릿 실행이 필요합니다. `/북마클릿`으로 설치한 뒤 maimai DX NET에서 실행해 주세요.",
  "circle.otherNotCollected": "{user} 님은 아직 서클 정보가 없습니다.",
  "circle.none": "가입한 서클이 없습니다.",
  "circle.otherNone": "{user} 님은 가입한 서클이 없습니다.",
  "circle.privateSelfNote": "서클 공개가 꺼져 있습니다.",
  "circle.codeField": "서클 코드",
  "circle.colorField": "서클 색상",
  "circle.progressField": "이번 달 진행도",
  "circle.progressValue": "**{stage}**",
  "circleColor.rainbow": "Rainbow",
  "circleColor.gold": "Gold",
  "circleColor.silver": "Silver",
  "circleColor.bronze": "Bronze",
  "circleColor.purple": "Purple",
  "circleColor.red": "Red",
  "circleColor.yellow": "Yellow",
  "circleColor.green": "Green",
  "circleColor.white": "White",
  "circle.memberField": "멤버",
  "circle.memberValue": "{count}/{max}명",
  "circle.pointField": "{month}월 서클 포인트",
  "circle.pointValue": "**{points} PT**\n{reset}",
  "circle.resetDays": "초기화까지 D-{days}",
  "circle.resetToday": "초기화까지 D-DAY",
  "circle.rankField": "포인트 순위",
  "circle.rankValue": "**{rank}위**\n{updated} 갱신\n⠀",
  "circle.rewardField": "다음 보상",
  "circle.rewardValue": "{points} PT 남음",
  "circle.challengeField": "서클 챌린지",
  "circle.challengeValue": "**{title}** / {artist}\n달성률 **{achievement}**",
  "circle.forecastField": "다음 주 과제곡 예고",
  "circle.forecastUnknown": "재킷으로 곡을 찾지 못했습니다.",
  "circle.membersButton": "멤버 포인트",
  "circle.challengeButton": "서클 챌린지",
  "circle.membersTitle": "{name} 멤버 포인트",
  "circle.memberLine": "{rank}. **{name}** · __**{points} PT**__ · {rating} {leader}",
  "circle.leaderMark": "👑 ",
  "circle.membersMissing": "멤버 목록을 가져오지 못했습니다.",
  "maishift.linked": "maishift **{handle}** 계정을 연동했습니다. ({name} · {rating})\n이제 캐롤봇에서 해당 계정의 maishift 기록을 사용합니다. maishift에 새 기록을 올리면 몇 분 안에 반영됩니다.",
  "maishift.unlinked": "maishift **{handle}** 계정 연동을 해제했습니다. maishift 기록으로 만든 성과와 목표 진행률도 삭제했습니다.",
  "maishift.notLinked": "연동된 maishift 계정이 없습니다.",
  "maishift.invalidHandle": "maishift 아이디 형식이 올바르지 않습니다. 프로필 주소(maimai.shiftpsh.com/profile/아이디)의 아이디를 입력해 주세요.",
  "maishift.notFound": "maishift에서 **{handle}** 아이디를 찾지 못했습니다. 아이디와 {server} 지역 기록이 있는지 확인해 주세요.",
  "maishift.privateOnLink": "maishift **{handle}** 프로필이 비공개로 설정되어 있어 연동할 수 없습니다. maishift 설정에서 개인 성과 페이지를 공개한 뒤 다시 시도해 주세요.",
  "maishift.unavailable": "maishift에서 정보를 가져오는 데 실패했습니다. 잠시 후 다시 시도해 주세요.",
  "maishift.credit": "maishift 제공",
  "circle.footer": "{player} · {server} · 마지막 동기화 {synced}",

  "gameOptions.title": "🎮 게임 설정",
  "gameOptions.description": "maimai DX NET 게임 옵션을 확인하고, 옵션 프리셋을 만들거나 편집할 수 있습니다. 프리셋을 게임에 적용할 때는 페이지에 안내된 옵션 프리셋 북마클릿을 DX NET에서 실행합니다.",
  "gameOptions.currentField": "가져온 현재 설정",
  "gameOptions.currentLine": "{server} · {time} 기준",
  "gameOptions.currentNone": "아직 가져온 설정이 없습니다. 캐롤봇 추가 북마클릿을 실행하면 현재 설정이 함께 저장됩니다.",
  "gameOptions.presetField": "옵션 프리셋",
  "gameOptions.presetValue": "{count}/{max}개 저장됨",
  "gameOptions.openButton": "게임 설정 열기",

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
  "fortune.body": "오늘의 운세는 **{title}** 입니다.",
  "fortune.chartField": "선정 차트",
  "fortune.constantField": "상수",
  "fortune.footer": "기준일: {date}",

  // ── /레이팅계산기 ─────────────────────────────────────────────────────────
  "ratingcalc.title": "레이팅 계산기",
  "ratingcalc.inputField": "입력",
  "ratingcalc.songRatingField": "레이팅 점수",
  "ratingcalc.totalField": "총합 레이팅 변화",
  "ratingcalc.noProfile": "프로필이 등록되어 있지 않아 레이팅 변환은 계산되지 않습니다.",
  "ratingcalc.currentField": "DX 레이팅",
  "ratingcalc.asNewField": "신곡으로 획득 시",
  "ratingcalc.asOldField": "구곡으로 획득 시",
  "ratingcalc.noChange": "변화 없음",
  "ratingcalc.footer": "DX 레이팅은 실제 데이터와 다를 수 있습니다.",

  // ── /검색 ───────────────────────────────────────────────────────────────
  "search.failed": "검색에 실패했습니다.",

  // ── /성과 ───────────────────────────────────────────────────────────────
  "achievement.pastPrivate": "{user} 님은 maishift에서 이전 기록을 공개하지 않아 성과를 볼 수 없습니다.",
  "achievement.renderFailed": "성과 이미지 생성에 실패했습니다.",
  "achievement.loadFailed": "성과 데이터를 불러오지 못했습니다.",
  // 최근 플레이 기록(50곡)에서 찾지 못한 성과 — 동기화 전에 50곡 넘게 플레이한 경우
  "achievement.unknownPlayTime": "플레이 시각 알 수 없음",

  // ── /북마클릿 ───────────────────────────────────────────────────────────
  "bookmarklet.title": "🔖 캐롤봇 추가 북마클릿 설치",
  "bookmarklet.openButton": "설치 가이드 열기",
  "bookmarklet.body":
    "프로필 및 기록은 maishift에서 가져옵니다(`/마이시프트 연동`).\n서클, 지방, 게임 설정 프리셋과 같은 기능을 사용하려면 캐롤봇 추가 북마클릿을 설치하세요.\n\n아래 버튼을 눌러 설치 가이드 페이지를 여세요.\n\n**PC** — 초록색 링크를 북마크바로 드래그\n**모바일** — 복사 버튼 → 북마크에 붙여넣기",

  // ── 프로필 임베드 ───────────────────────────────────────────────────────
  "embed.noTrophy": "칭호 없음",
  "embed.noName": "이름 없음",
  "embed.profileBody": "**{name}**  ·  **{rating}**\n플레이 {play}/{total}회{stars}",
  "embed.profileFooter": "서버: {server}  ·  마지막 동기화: {synced}",
  "embed.friendCodeField": "친구 코드",
  "embed.circleField": "서클",
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
  "map.empty": "지방 진행도 없음\n캐롤봇 추가 북마클릿을 다시 실행하면 업데이트됩니다.",
  "map.shareButton": "공유 · {area}",

  // ── 검색 결과 ───────────────────────────────────────────────────────────
  "searchResult.empty": "\"{query}\"{type} 검색 결과 없음",
  "searchResult.author": "-# \"{query}\"{type} 에 대한 검색 결과",
  "searchResult.title": "### {title}{kind}",
  "searchResult.regionExclusive": "{version} 전용",
  // 검색 결과 점수표 한 줄. {diff} 난이도 이모지, {constant} 상수, {achievement} 달성률, {marks} 랭크·FC/AP·FS/FDX·DX ✦ 이모지
  "searchResult.row": "{diff} {constant} ✦ **{achievement}** {marks}",
  // 플레이하지 않은 난이도
  "searchResult.rowNotPlayed": "{diff} {constant} ✦ -",
  "searchResult.externalButton": "▶ 외부출력",
  "searchResult.genreSuffix": "\n{genre}",
  "searchResult.versionSuffix": "\n{version}",
  "searchResult.versionPosition": "{version} · {position}",
  "searchResult.detailButton": "상세 보기",
  "stamp.empty": "maishift에 스탬프 카드 정보가 없습니다.",
  "stamp.failed": "maishift에서 스탬프 카드를 불러오지 못했습니다. 잠시 뒤에 다시 시도해 주세요.",
  "trackDetail.expired": "검색이 만료되었습니다. 다시 검색해 주세요.",
  "trackDetail.noTrack": "maishift에서 해당 보면의 정보를 찾지 못했습니다.",
  "trackDetail.failed": "곡 상세 정보를 불러오지 못했습니다. 잠시 뒤에 다시 시도해 주세요.",

  // ── 레이팅 대상곡 ───────────────────────────────────────────────────────
  "ratingTarget.empty": "레이팅 기록이 없습니다.",
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
  "goal.defaultName": "유저",
  "goal.notFound": "{number}번 목표가 없습니다. `/목표 목록` 에서 번호를 확인해주세요.",
  "goal.limitReached": "목표는 최대 {max}개까지 등록할 수 있습니다. 먼저 `/목표 삭제` 로 정리해주세요.",
  "goal.addedTitle": "🎯 목표 추가됨",
  "goal.progressField": "현재 진행도",
  "goal.progressValue": "`{bar}` {percent}% · {value}{target}{done}",
  "goal.alreadyDone": "  ✅ 이미 달성된 목표입니다.",
  "goal.progressNeedsProfile": "`/마이시프트 연동`으로 maishift 계정을 연동하면 자동으로 갱신됩니다.",

  // ── /랜덤 ───────────────────────────────────────────────────────────────
  "random.rangeAll": "전체",
  "random.needProfileForPlayFilter": "플레이여부 필터는 maishift 연동이 필요합니다. `/마이시프트 연동`으로 연동해 주세요.",
  "random.noMatch": "조건에 맞는 곡이 없습니다.",
  "random.label": "랜덤",
  "random.fieldGenre": "장르",
  "random.fieldVersion": "버전",

  // ── /곡추천 ─────────────────────────────────────────────────────────────
  "songrec.noRecords": "기록이 없습니다. maishift에 기록을 올린 뒤 다시 시도해 주세요.",
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
  "report.previewFooter": "아래에서 생성하면 Github team-carol/carol 레포지토리에 이슈가 등록됩니다.",
  "report.tooShortNotice": "제보 내용이 짧아 근거 없는 세부는 생성하지 않았습니다. 취소 후 재현 방법·기대 동작을 더 자세히 적어주시면 더 정확한 이슈가 만들어집니다.",
  "report.createButton": "이슈 생성",
  "report.cancelButton": "취소",
  "report.notConfigured": "제보 기능이 설정되지 않았습니다. 관리자에게 문의해주세요.",
  "report.noChannel": "채널 정보를 확인할 수 없습니다. 서버 채널에서 다시 시도해주세요.",
  "report.expired": "요청이 만료되었습니다. 다시 시도해주세요.",
  "report.expiredRetry": "요청이 만료되었습니다. `/문의` 로 다시 시도해주세요.",
  "report.failed": "오류가 발생했습니다. 잠시 후 다시 시도해주세요.",

  // ── 버튼 상호작용 ───────────────────────────────────────────────────────
  "button.needProfile": "먼저 `/마이시프트 연동`으로 maishift 계정을 연동해 주세요.",
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
  // 봇 프로필의 상태 메시지. 30분마다, 서버에 들어가거나 나갈 때, /관리에서 문구를 바꿀 때 다시 적용한다.
  "status.presence": "v{version} ✦ /마이시프트 연동",

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
  "policy.updatedTitle": "**캐롤봇 개인정보처리방침과 이용약관이 바뀌었습니다** ({date})",
  "policy.updatedBody":
    "이제 플레이 기록은 maishift에서 받고, 캐롤봇 추가 북마클릿은 maishift에 없는 정보(친구 코드, 최근 플레이, 지방, 게임 설정, 서클)만 보냅니다. " +
    "`/마이시프트 해제`를 하면 maishift 정보로 만든 성과와 목표 진행률을 지웁니다. 자세한 내용은 아래 방침을 확인해 주세요.",

  // ── 이미지 카드 (/프로필, /서클, /성과, /레이팅표) ─────────────────────────
  // 카드 그림 안의 글. 바꾸면 캐시된 카드도 다음 요청 때 새 문구로 다시 그린다(cardTextSignature).
  // 게임 용어(난이도, 랭크, FC/AP, ST/DX)와 숫자는 카드 코드에 그대로 둔다.
  "card.createdBy": "Created by",
  "card.lastSynced": "마지막 동기화 {time} (KST)",

  "profileCard.eyebrow": "PLAYER PROFILE · {server}",
  "profileCard.circleChip": "CIRCLE",
  "profileCard.newSum": "신곡 {count}곡 합계",
  "profileCard.oldSum": "구곡 {count}곡 합계",
  "profileCard.average": "평균 {value}",
  "profileCard.playCount": "현재 버전 플레이",
  "profileCard.totalPlayCount": "누적 플레이",
  "profileCard.clearTitle": "클리어 현황",
  "profileCard.clearMeta": "{count}개 채보 플레이",
  "profileCard.rankOther": "그 외",
  "profileCard.ratingTitle": "히스토리",
  "profileCard.ratingEmpty": "동기화 기록이 쌓이면 히스토리가 표시됩니다.",
  "profileCard.ratingLegend": "추정 (성과 기록으로 계산)",
  "profileCard.playsTitle": "플레이 횟수",
  "profileCard.playsMeta": "누적 {total}회 · 현재 버전 {current}회",
  "history.empty": "아직 maishift 히스토리가 없습니다.",
  "history.pastPrivateSelf": "maishift에서 이전 기록 공개 설정이 꺼져 있어 히스토리를 볼 수 없습니다.",
  "history.pastPrivate": "{user} 님은 maishift에서 이전 기록을 공개하지 않았습니다.",
  "history.failed": "히스토리 이미지를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.",
  "history.period.all": "전체",
  "history.period.version": "현재 버전",
  "history.period.365": "최근 1년",
  "history.period.182": "최근 6개월",
  "history.period.91": "최근 3개월",
  "history.period.30": "최근 1개월",
  "history.period.14": "최근 2주",
  "history.period.7": "최근 1주",
  "historyCard.eyebrow": "HISTORY · {server}",
  "historyCard.versionWeek": "{version} {week}주차",
  "historyCard.range": "{from} ~ {to} · {days}일간",
  "historyCard.playCount": "플레이 카운트",
  "historyCard.course": "단위",
  "historyCard.class": "CLASS",
  "historyCard.stars": "투어 멤버",
  "historyCard.ratingTitle": "레이팅",
  "historyCard.playsTitle": "플레이 횟수",
  "historyCard.gapDays": "+{days}일",
  "stampCard.eyebrow": "STAMP CARD · {server}",
  "stampCard.summary": "{count}장 · 완료 {complete}장",
  "stampCard.partner": "파트너",
  "stampCard.songs": "곡",
  "stampCard.others": "기타",
  "stampCard.complete": "COMPLETE",
  "stampCard.completeMeta": "{count}장",
  "stampCard.remaining": "완료까지 {days}일 출석 남음 ({duo}{daysDuo}일)",
  "stampCard.songsRemaining": "전체 완료까지 {total}일, 새 채보 완료까지 {latest}일 출석 남음 ({duo}{totalDuo}일, {latestDuo}일)",
  "stampCard.newChart": "새 채보",
  "trackCard.versionPosition": "{order}/{total}",
  "trackCard.player": "{name} 님의 기록",
  "trackCard.myRecord": "내 기록",
  "trackCard.noRecord": "아직 플레이 기록이 없습니다.",
  "trackCard.achievement": "달성률",
  "trackCard.dxScore": "디럭스코어",
  "trackCard.rating": "레이팅",
  "trackCard.sRating": "S-레이팅 {value}",
  "trackCard.rank": "랭크",
  "trackCard.scoreHistory": "달성률 변화",
  "trackCard.scoreHistoryMeta": "{count}번의 기록 경신",
  "trackCard.scoresHidden": "maishift에서 이전 기록을 공개하지 않았습니다.",
  "trackCard.scoresEmpty": "아직 점수 기록이 없습니다.",
  "trackCard.firstRecord": "초견",
  "trackCard.theory": "이론치",
  "trackCard.levelHistory": "버전별 상수",
  "trackCard.levelsEmpty": "상수 기록이 없습니다.",
  "trackCard.distribution": "레이팅 구간별 달성률 분포",
  "trackCard.distributionMeta": "maishift 사용자 기준 · {date} 집계",
  "trackCard.distEmpty": "분포 정보가 없습니다.",
  "trackCard.people": "{count}명",
  "historyChart.month": "{month}월",
  "historyChart.year": "{year}",
  "profileCard.playsTotal": "누적",
  "profileCard.playsCurrent": "현재 버전",
  "profileCard.recentTitle": "최근 플레이",
  "profileCard.recentMeta": "최근 {count}곡",
  "profileCard.recentEmpty": "최근 플레이 기록이 없습니다.",
  "profileCard.friendCode": "친구 코드 {code}",

  "circleCard.eyebrow": "CIRCLE · {server}",
  "circleCard.code": "{code}",
  "circleCard.monthPoints": "{month}월 서클 포인트",
  "circleCard.resetDays": "초기화까지 D-{days}",
  "circleCard.resetToday": "초기화까지 D-DAY",
  "circleCard.rank": "포인트 순위",
  "circleCard.rankValue": "{rank}위",
  "circleCard.rankUpdated": "{time} 갱신",
  "circleCard.nextReward": "다음 보상까지 PT",
  "circleCard.members": "멤버",
  "circleCard.challengeTitle": "서클 챌린지",
  "circleCard.challengeMeta": "이번 주 과제곡",
  "circleCard.achievement": "서클 달성률",
  "circleCard.nextWeek": "NEXT WEEK",
  "circleCard.forecastNote": "다음 주 예고",
  "circleCard.forecastUnknown": "알 수 없는 곡",
  "circleCard.progressTitle": "이번 달 진행도",
  "circleCard.progressMeta": "포인트 기간 {period}",
  "circleCard.progressStage": "현재 단계",
  "circleCard.progressMyPoints": "내 서클 포인트",
  "circleCard.progressTotal": "서클 합계 포인트",
  "circleCard.ruleRainbow": "상위 10위",
  "circleCard.ruleGold": "상위 20%",
  "circleCard.ruleSilver": "상위 40%",
  "circleCard.ruleBronze": "상위 70%",
  "circleCard.ruleMinPoints": "10,000 PT+",
  "circleCard.rulePurple": "10,000 PT",
  "circleCard.ruleRed": "7,000 PT",
  "circleCard.ruleYellow": "4,000 PT",
  "circleCard.ruleGreen": "2,000 PT",
  "circleCard.ruleWhite": "2,000 PT 미만",
  "circleCard.nextTitle": "다음 단계까지",
  "circleCard.nextPoints": "{stage}까지 {points} PT",
  "circleCard.nextProgress": "{current} / {target} PT",
  "circleCard.nextRank": "{stage}: {rule}",
  "circleCard.nextRankNow": "현재 {rank}위 · {points} PT",
  "circleCard.topStage": "최고 단계",
  "circleCard.membersTitle": "멤버 포인트",
  "circleCard.membersMeta": "{month}월 | 포인트 순",
  "circleCard.membersEmpty": "멤버 목록을 가져오지 못했습니다.",
  "circleCard.leader": "LEADER",
  "circleCard.memberPoints": "{points} PT",
  "circleCard.memberRating": "{rating}",
  "circleCard.syncedBy": "{player} 님의 동기화",

  "achievementCard.eyebrow": "DAILY ACHIEVEMENTS",
  "achievementCard.title": "오늘의 성과",
  "achievementCard.subtitle": "{day} · 한국시간 오전 4시 기준",
  "achievementCard.page": "{page}/{total}페이지",
  "achievementCard.count": "COUNT",
  "achievementCard.ratingGain": "RATING GAIN",
  "achievementCard.emptyTitle": "오늘의 의미 있는 성과가 없습니다",
  "achievementCard.emptyBody": "한국시간 오전 4시부터 다음 오전 4시까지의 성과입니다",
  "achievementCard.ratingUp": "rating +{value}",
  "achievementCard.rating": "rating {value}",
  "achievementCard.ratingUnknown": "rating —",

  "ratingCard.sectionNew": "NEW",
  "ratingCard.sectionOthers": "OTHERS",
  "ratingCard.sectionBest": "BEST",
  "ratingCard.sectionVolforce": "VOLFORCE",
  "ratingCard.sectionSRating": "S-RATING",
  "ratingCard.top": "TOP {count}",
  "ratingCard.avg": "avg",
  "ratingCard.ratingLabel": "RATING",
  "ratingCard.volforceLabel": "VOLFORCE",
  "ratingCard.potentialLabel": "POTENTIAL",
  "ratingCard.sRatingLabel": "S-RATING",
  "ratingCard.futureBadge": "{version} 미래시",

  // ── 패치노트 (관리 페이지에서 게시 → 다음 명령 때 1회) ────────────────────
  "patchNotes.defaultTitle": "📢 캐롤봇 {version} 업데이트",
  "patchNotes.defaultTitleNoVersion": "📢 캐롤봇 업데이트",
  "patchNotes.footer": "이 안내는 한 번만 표시됩니다.",

  // ── /관리 (별명·문구 관리) ───────────────────────────────────────────────
  "admin.embedTitle": "🛠 캐롤봇 관리",
  "admin.embedBody":
    "아래 버튼으로 관리 페이지를 엽니다.\n" +
    "곡 별명 · 봇 출력 문구 · 채보 등록 · 패치노트를 관리할 수 있습니다.\n\n" +
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
  cardSignature = null;
}

// 이미지 카드 문구의 서명. 카드 캐시 키(메모리)와 레이팅표 DB 캐시 버전에 섞어, 문구를 바꾸면 다시 그리게 한다.
const CARD_KEY_PREFIXES = ["card.", "profileCard.", "circleCard.", "circleColor.", "achievementCard.", "ratingCard.", "trackCard.", "stampCard."];
let cardSignature: number | null = null;

function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 카드 문구(기본값+오버라이드)의 32비트 해시. 오버라이드가 바뀔 때만 다시 계산한다. */
export function cardTextSignature(): number {
  if (cardSignature === null) {
    const text = MESSAGE_KEYS.filter((k) => CARD_KEY_PREFIXES.some((p) => k.startsWith(p))).map((k) => `${k}=${rawText(k)}`).join("\n");
    cardSignature = fnv1a(text);
  }
  return cardSignature;
}

/** DB 캐시처럼 정수 버전 한 칸만 있는 곳용: 카드 버전과 문구 서명을 합친 양의 int32. */
export function cardCacheVersion(base: number): number {
  return fnv1a(`${base}|${cardTextSignature()}`) & 0x7fffffff;
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
// 문구를 다시 읽은 뒤 바로 다시 그려야 하는 곳(봇 상태 메시지 등)이 등록한다.
const reloadListeners: (() => void)[] = [];
export function onMessagesReloaded(fn: () => void): void { reloadListeners.push(fn); }

export async function loadMessages(): Promise<void> {
  const { getMessageOverrides } = await import("./storage");
  const rows = await getMessageOverrides();
  applyMessageOverrides(rows);
  console.log(`[messages] 문구 ${MESSAGE_KEYS.length}개 중 오버라이드 ${overrides.size}개 로드`);
  for (const fn of reloadListeners) {
    try { fn(); } catch (e) { console.error("[messages] 다시 읽은 뒤 처리 실패:", e); }
  }
}
