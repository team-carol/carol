# BOT KNOWLEDGE BASE

## OVERVIEW

Discord-facing layer: client startup, Korean slash commands, button routing, embeds, role automation, and rating-card PNG responses.

## STRUCTURE

```
src/bot/
├── index.ts       # Discord client entry, command registration, button router
├── commands/      # slash command modules: data + execute
└── utils/         # embeds, rating card renderer, auto-role helpers
```

## WHERE TO LOOK

| Task | Location | Notes |
|---|---|---|
| Add/remove slash command | `index.ts`, `commands/*.ts` | Export `data` and `execute`; add to `COMMANDS`. |
| Bookmarklet install command | `commands/bookmarklet.ts` | Links to `/sync?code=...`. |
| User web settings command | `commands/settings.ts` | Only links to `/settings?code=...`; no privacy buttons. |
| 패치노트 1회 표시 | `index.ts` `maybeSendPatchNotes`, `src/patchNotes.ts` | 관리 탭에서 게시한 노트를 게시 뒤 첫 슬래시 명령에 ephemeral 팔로업으로 1회. 대상은 세션이 있는 사용자, `sessions.patch_ack` 이후·30일 이내 게시분 최신 3개. 새 세션은 생성 시각이 ack 기본값이라 가입 전 노트는 안 본다. |
| 게임 설정 안내 | `commands/gameOptions.ts` | `/게임설정` 은 `/options?code=...` 링크와 스냅샷 시각·프리셋 개수만 보여 준다. 적용은 웹/`/option.js` 북마클릿 몫(봇은 DX NET 세션이 없다). |
| 이미지 카드 문구 | `src/messages.ts` (`card.*`, `profileCard.*`, `circleCard.*`, `circleColor.*`, `achievementCard.*`, `ratingCard.*`) | 카드 그림 안의 글도 `msg()` 로 가져와 `/관리` 문구 페이지에서 고칠 수 있다. 문구가 바뀌면 `cardTextSignature()` 가 바뀌어 메모리 캐시 키와 레이팅표 DB 캐시 버전(`cardCacheVersion`)이 달라져 다시 그린다. 게임 용어(난이도·랭크·FC/AP·ST/DX)는 코드에 그대로 둔다. |
| 서클 | `commands/circle.ts`, `utils/circle.ts`, `utils/circleCard.ts` | `/서클 [형식]` 은 `profiles.circle_json`(동기화 때 `parseCircle`)을 이미지 카드(기본, 멤버 포인트 포함)나 임베드로. 다음 주 과제곡 예고는 재킷만 오므로 `getTitleByJacket`(카탈로그 재킷이 DX NET 파일명이다)으로 곡명을 찾는다. 카드 부품은 `/프로필` 과 `utils/cardKit.ts` 를 같이 쓴다. 서클 프로필 색상(`circle_profile_color_*.png` → `CircleInfo.color`)은 `utils/circleColors.ts` 의 그라디언트로 카드 이름표·띠, 임베드 테두리색에 쓴다. 이번 달 진행도는 서클 랭킹 페이지(북마클릿 `cr`)의 피라미드 이미지 이름(`circle_ranking_youebest_<색>.png`)에서 읽어 `CircleInfo.progress` 로 둔다. 버튼 `circle:members:<userId>`(멤버 포인트 목록)·`circle:challenge:<userId>`(누른 사람 기록으로 과제곡 `searchResultEmbeds`)는 서클이 공개면 채널에 공개 답장. 과제곡 제목은 보는 사람의 번역 설정을 따른다. `''`=수집 전, `null`=미가입. `sessions.circle_public`(기본 공개)이 꺼져 있으면 남은 못 보고 본인은 ephemeral. `/프로필` 서클 이름도 같은 설정을 따른다. |
| Guild auto-role setting | `commands/serverSettings.ts` | Admin-only `/서버설정`; button IDs are `serverset:*`. |
| Profile display | `commands/profile.ts`, `utils/embeds.ts` | Uses cached profile and privacy checks. |
| Search command | `commands/search.ts`, `utils/embeds.ts` | `search:{userId}:{encodedQuery}:{pageIdx}` buttons. |
| Rating table/image | `commands/ratingimage.ts` | `/레이팅표` uses PNG cache (maimai DX only). `type` option: maimai DX, S-레이팅 (`src/sRating.ts`, maishift DX scores), other-game conversion (`src/games.ts`). |
| Bot status | `commands/status.ts` | Operational counts/timestamps. |
| simai 채보 업로드 | `commands/chart.ts`, `src/simai/parse.ts` | `/보면` 이 maidata.txt 첨부를 파싱해 `simai_charts` 에 저장하고 `/chart?id=` 링크를 준다. 결과는 Components V2 컨테이너(제목·아티스트·버전/장르·재킷, 난이도·상수·BPM 범위, 노트 수·DX 스코어·TAP GREAT/BREAK PERFECT 1개당 손실, 내 기록, 미리보기 GIF, 버튼: 영상 만들기·브라우저에서 재생·외부출력). 구분자는 ✦ 대신 ` / `. 업로드본은 30일 뒤 `runSimaiChartGC` 가 정리. |
| `/보면` 곡 검색 | `commands/chart.ts` 의 `autocomplete()` | `곡` 옵션은 mai-notes 인덱스를 메모리에서 찾는다. 자동완성은 3초 제한이라 DB/네트워크를 타면 안 된다. `InteractionCreate` 의 `isAutocomplete()` 분기가 제일 먼저 실행된다. |
| 채보 미리보기 GIF | `utils/chartGif.ts`, `utils/gifWorker.ts` | 웹 플레이어와 같은 렌더러(`web/chartRenderer.ts`)를 vm 에 올려 @napi-rs/canvas 로 프레임을 뽑고 gifenc 로 묶는다. 동기 작업이라 반드시 워커에서 돌린다(`renderChartGifAsync`). `GifOptions` 에 mirror·guide 도 있어 웹 `/chart/gif` 가 페이지 설정 그대로 내보낸다. |
| 채보 풀영상(MP4) | `utils/chartVideo.ts`, `utils/chartVideoWorker.ts`, `utils/chartVideoQueue.ts` | `/보면` 의 `영상 만들기` 버튼(`chartvid:<id>`)이 요청. 400px/60fps/속도6.5/미러없음 고정 + 가이드음(오프라인 PCM 합성 → AAC). 프레임을 ffmpeg stdin 으로 백프레셔 흘려보내 인코딩. 워커에서 돌리고 큐 동시성 1. 완료본은 `DATA_DIR/renders/<id>.mp4`, DB `chart_videos` 에 상태·경로. 웹 `/chart/video?id=` 로 Range 서빙. 원본 채보 만료 시 `runSimaiChartGC` 가 고아 영상도 정리. |
| Goal tracking | `commands/goal.ts`, `src/goals.ts` | `/목표 [user]` 하나로 목록을 보여 주고 유형별 추가 버튼(누르면 바로 입력 창 하나 — 곡명·숫자 칸과 난이도·타입·기준 선택 메뉴를 `LabelBuilder` 로 한 창에, 곡을 못 찾거나 여러 곡이 걸리면 추가하지 않고 비슷한 곡을 보여 줌)·삭제 버튼(본인에게만 보이는 메뉴; 남의 목록에서 누르면 누른 사람 자신의 목표, 자기 목록에서 누르면 추가·삭제 뒤 공개 목록도 고침); specs evaluated against cached profile + re-scored on every `/sync`. `spec.baseline` (목표 수립 시 현재값)이 있으면 진행률 바는 그 시점부터의 상대치; `progressPercent`/`progressBar` 는 미달성 목표를 100%/꽉 찬 바로 표시하지 않음. 목록 완료 개수는 라이브 평가 기준. |
| 다시 뽑기·조건 메뉴 | `commands/songrec.ts`, `commands/random.ts`, `utils/reroll.ts`, `utils/songCard.ts` | `/곡추천`·`/랜덤` 은 옵션 없이 조건 창(본인에게만 보이는 V2 메뉴)이 먼저 뜨고, 그 창은 직전에 뽑은 조건(`sessions.command_presets`, 마이그레이션 33, 명령별 customId 조건 문자열; 대상 유저는 늘 본인부터)으로 열리며, 결과 아래 다시 뽑기(`rec:re:`/`rnd:re:`, 주인만 — 새 결과를 올리고 원래 메시지 삭제)·조건 바꾸기(`…:menu:`, 본인에게만 보이는 V2 메뉴, 뽑기 버튼이 새 결과를 올리고 그 메뉴를 연 결과를 지움). 조건은 customId 에만 둔다(`encodeRecState`·`encodeRandomState`, /랜덤 은 100자 한도 때문에 사용자 id 를 36진수로). /랜덤 상수·플레이리스트 직접 입력은 모달(`rnd:mod:`·`rnd:pmod:`), 버전은 무인판·PLUS 를 한 목록으로 하되 선택지 25개 한도 때문에 옛 버전/DX 버전을 한쪽씩 보여 준다(`era`, 조건 창 표시용). 레벨·상수 선택지는 높은 값부터. 곡 수 1~5, 5곡이면 작은 글 위 구분선을 빼 컴포넌트 40개 안. |
| 결과 전환 | `commands/plate.ts`, `commands/chart.ts` | `/플레이트` 이미지 아래 버전 선택 메뉴 하나(선택지 25개 한도라 옛 버전/DX 버전을 한쪽씩, 맨 아래 항목으로 넘김 — 넘길 때는 이미지는 두고 메뉴만 바꾼다), 종류 버튼·전체 보기(`plate:v:<누른 사람>:<대상>:<목록 o|d>:<한자>:<종류>`, `plate:t|o:…`). `/보면` 은 같은 곡·종류의 다른 난이도 버튼(`chartd:<누른 사람>:<검색 키>`, 검색 인덱스에 본문이 있는 보면만). 주인이 누르면 그 메시지를 바꾸고, 다른 사람이면 그 사람에게만 새로 보여 준다. |
| 명령어 관리 | `src/commandOverrides.ts`, `web/commandsAdminPage.ts` | `/관리` → 명령어 탭: 이름·설명·옵션 순서·옵션 설명을 `constants_cache`(`command_overrides`)에 두고, 등록할 때(`index.ts` `syncCommands`, 시작·관리 페이지 "디스코드에 반영") 입힌다. 라우팅은 올린 이름 → 명령 키(`keyForName`). 옵션 이름은 코드가 읽는 값이라 못 바꾸고, 디스코드는 명령을 이름 순으로 보여 줘 명령 순서는 못 정한다. 필수 옵션은 늘 앞. |
| Role assignment | `utils/roles.ts` | Rating-tier roles, guild setting gate. |
| Rating card renderer | `utils/ratingCard.ts` | Largest file; satori element helper, no JSX. |
| 프로필 카드 | `utils/profileCard.ts` | `/프로필` 기본 응답(이미지). 레이팅 플레이트·신곡/구곡 합(`ratingBreakdown`)·카탈로그 재킷(`jacketFileUrl`)은 `ratingCard.ts` 것을 재사용. `형식:임베드` 는 기존 `profileEmb`. 메모리 캐시 키에 lastSyncedAt 포함. |
| 히스토리 명령 | `commands/history.ts`, `utils/historyCard.ts`, `src/historyStats.ts` | `/히스토리 [user] [기간]` — maishift 히스토리 내보내기 그림과 같은 정보: 업로드 시각·버전 주차, 기간(끝은 마지막 업로드), 레이팅(축: 곡 평균 ÷50 / 레이팅)·플레이 횟수(누적 / 현재 버전) 계단 그래프, 달성 기록(maishift 규칙: 레이팅 최근 4 + 주요 단계 3, 플레이 횟수 4개 이하가 되는 단위). 그래프는 `utils/historyChart.ts` 를 `/프로필` 카드와 같이 쓴다. |
| maishift 통계 | `src/maishift/stats.ts` | 레이팅 분포(`/프로필` 상위 %)·레벨별 보면 분포(`/곡추천` 가중)·클리어 비율(`/곡추천 레벨:`)·플레이트 난이도·보유(`/플레이트`)·공개 플레이리스트. 모두에게 같은 값이라 지역·조건별로 12시간 기억(지나면 있는 값을 먼저 쓰고 뒤에서 새로), 남은 한도가 (비용 + 40) 보다 적으면 새로 받지 않고 통계 없이 답한다. 보면 번호는 지역마다 달라 `constants.ts` `getRegionChart`/`getRegionChartByKey` 로 바꾼다. |
| 플레이트 | `commands/plate.ts`, `utils/plateCard.ts`, `src/plates.ts` | `/플레이트 [버전] [종류]`. 대상 보면은 그 버전에 추가된 곡(ST·DX 따로)의 BASIC~MASTER(真=maimai+PLUS, 舞=maimai~FiNALE 전체 + Re:MASTER, 将 은 真 에 없고 覇者 는 舞 에만), 그 지역 최신 버전은 아직 플레이트가 없다. 빠지는 보면은 지역별 고정 목록(`REGION_EXCLUDED`·`MAI_LATE_REMASTER`, maishift 순회 데이터와 보면 단위로 맞춤 — `plateDefs(latest, server)` 로 지역을 넘겨야 적용된다). 그래도 maishift 대상 보면 수와 다르면 상세 카드에 적는다. 상세 카드는 종류마다 이름표 그림(`src/plateImages.ts`, LXNS 공개 자원을 번호 `plateImageId` 로 처음 볼 때 한 번 받아 `constants_cache` `plate_image:<id>` 에 둠)과 진행을 한 줄씩 그리고, 그림을 못 받으면 이름 글자로 그린다. |
| 플레이리스트 | `commands/playlist.ts`, `utils/playlistCard.ts`, `commands/random.ts` | `/플레이리스트 이름` 카드와 `/랜덤 플레이리스트:`. 공개 목록을 나열하는 API 가 없어(`/me/playlists` 는 OAuth) 캐롤봇에서 한 번 연 목록의 이름·주인·보면 수를 `src/maishift/playlistIndex.ts` 가 `constants_cache`(`maishift_playlists`)에 기억해 두 옵션의 자동완성으로 보여 준다(처음 보는 번호는 "불러오기" 선택지, 고르지 않고 입력한 이름도 찾음). 번호·주소는 `parsePlaylistId`, 없거나 비공개면 `playlist.notFound` 이고 기억에서 지운다(180일 안 열린 목록도 잊음). |
| 히스토리 그래프 | `src/ratingHistory.ts`, `profileCard.ts` `ratingChartPanel` | maishift 연동이면 `maishiftDays`/`maishiftSeries` 로 첫 업로드부터 오늘까지 전체 기간(maishift 히스토리 = 업로드마다 실제 값, 추정 없음, 점 없이 선만)을 그리고, 버전 표시는 히스토리의 versionId 가 바뀐 첫 업로드 날. 아래 별도 패널 `playCountPanel` 에 누적·현재 버전 플레이 횟수 두 선을 같은 가로축으로. 아니면 최근 90일, 실측=`rating_snapshots`(실선, 실측점 사이는 추정 없이 바로 잇는다), 추정=첫 실측 이전 구간만 성과 로그를 그날 끝까지 되돌린 계산값을 **다음 실측일 기준으로 보정**(점선). 마지막 동기화 이후는 점 없음. 버전 업데이트 날 세로선. 선은 SVG 이미지, 라벨은 satori 텍스트. |

## CONVENTIONS

- Slash command names are Korean and user-facing text is mostly Korean.
- Command modules follow `export const data = new SlashCommandBuilder()` plus `export async function execute(...)`.
- Register commands in `src/bot/index.ts` through the `COMMANDS` array. Guild-scoped registration happens when `CONFIG.guildId` is set.
- Button routing is centralized in `src/bot/index.ts`, prefix-based, and load-bearing.
- Privacy and bookmarklet preset management are web settings now; Discord `/설정` should remain a link-only 안내 command.
- Use `MessageFlags.Ephemeral` for private setup/settings/error replies.
- Rating-card cache is invalidated by `lastSyncedAt` and `CARD_VERSION`; bump version when layout/calculation changes.

## CUSTOM ID NAMESPACES

| Prefix | Owner | Format |
|---|---|---|
| `serverset:` | `commands/serverSettings.ts` | `serverset:autorole:on/off` |
| `recent:` | recent embed buttons | `recent:{userId}:{gameIdx}` |
| `page:` | recent pagination | `page:{userId}:{gameIdx}` |
| `share:` | recent share button | `share:{userId}:{gameIdx}:{songIdx}` |
| `rt:` | rating table button | `rt:{userId}` |
| `search:` | search pagination | `search:{userId}:{encodedQuery}:{pageIdx}` |
| `goal:` | `commands/goal.ts` goal list pagination | `goal:{ownerId}:{pageIdx}` (`goal:{ownerId}:page` = inert page counter) |
| `chartvid:` | `index.ts` 풀영상 버튼 | `chartvid:{chartId}` |

## ANTI-PATTERNS

- Do not create a new button namespace without adding router handling in `index.ts`.
- Do not alter `customId` field order unless every builder and parser changes together.
- Do not put user profile privacy buttons back into Discord `/설정`; use `/settings` web page.
- Do not render rating-card JSX; this codebase uses manual `el()` objects for satori.
- Do not bypass privacy checks when showing another user's cached profile/search/rating data.

## VALIDATION

```bash
npm run build
npm run dev
```

Manual QA: run slash commands in a dev guild (`guildId` set for instant command updates), exercise buttons after changing any `customId` builder/router pair.
