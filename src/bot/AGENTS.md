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
| Bookmarklet install command | `commands/bookmarklet.ts` | Links to `/sync?code=...`; also extra bookmarklet CRUD. |
| User web settings command | `commands/settings.ts` | Only links to `/settings?code=...`; no privacy buttons. |
| 패치노트 1회 표시 | `index.ts` `maybeSendPatchNotes`, `src/patchNotes.ts` | 관리 탭에서 게시한 노트를 게시 뒤 첫 슬래시 명령에 ephemeral 팔로업으로 1회. 대상은 세션이 있는 사용자, `sessions.patch_ack` 이후·30일 이내 게시분 최신 3개. 새 세션은 생성 시각이 ack 기본값이라 가입 전 노트는 안 본다. |
| 게임 설정 안내 | `commands/gameOptions.ts` | `/게임설정` 은 `/options?code=...` 링크와 스냅샷 시각·프리셋 개수만 보여 준다. 적용은 웹/`/option.js` 북마클릿 몫(봇은 DX NET 세션이 없다). |
| 이미지 카드 문구 | `src/messages.ts` (`card.*`, `profileCard.*`, `circleCard.*`, `circleColor.*`, `achievementCard.*`, `ratingCard.*`) | 카드 그림 안의 글도 `msg()` 로 가져와 `/관리` 문구 페이지에서 고칠 수 있다. 문구가 바뀌면 `cardTextSignature()` 가 바뀌어 메모리 캐시 키와 레이팅표 DB 캐시 버전(`cardCacheVersion`)이 달라져 다시 그린다. 게임 용어(난이도·랭크·FC/AP·ST/DX)는 코드에 그대로 둔다. |
| 서클 | `commands/circle.ts`, `utils/circle.ts`, `utils/circleCard.ts` | `/서클 [형식]` 은 `profiles.circle_json`(동기화 때 `parseCircle`)을 이미지 카드(기본, 멤버 포인트 포함)나 임베드로. 다음 주 과제곡 예고는 재킷만 오므로 `getTitleByJacket`(otoge-db 와 재킷 파일명이 같다)으로 곡명을 찾는다. 카드 부품은 `/프로필` 과 `utils/cardKit.ts` 를 같이 쓴다. 서클 프로필 색상(`circle_profile_color_*.png` → `CircleInfo.color`)은 `utils/circleColors.ts` 의 그라디언트로 카드 이름표·띠, 임베드 테두리색에 쓴다. 이번 달 진행도는 서클 랭킹 페이지(북마클릿 `cr`)의 피라미드 이미지 이름(`circle_ranking_youebest_<색>.png`)에서 읽어 `CircleInfo.progress` 로 둔다. 버튼 `circle:members:<userId>`(멤버 포인트 목록)·`circle:challenge:<userId>`(누른 사람 기록으로 과제곡 `searchResultEmbeds`)는 서클이 공개면 채널에 공개 답장. 과제곡 제목은 보는 사람의 번역 설정을 따른다. `''`=수집 전, `null`=미가입. `sessions.circle_public`(기본 공개)이 꺼져 있으면 남은 못 보고 본인은 ephemeral. `/프로필` 서클 이름도 같은 설정을 따른다. |
| Guild auto-role setting | `commands/serverSettings.ts` | Admin-only `/서버설정`; button IDs are `serverset:*`. |
| Profile display | `commands/profile.ts`, `utils/embeds.ts` | Uses cached profile and privacy checks. |
| Search command | `commands/search.ts`, `utils/embeds.ts` | `search:{userId}:{encodedQuery}:{pageIdx}` buttons. |
| Rating table/image | `commands/ratingtable.ts`, `commands/ratingimage.ts` | `/레이팅표` uses PNG cache. |
| Bot status | `commands/status.ts` | Operational counts/timestamps. |
| simai 채보 업로드 | `commands/chart.ts`, `src/simai/parse.ts` | `/보면` 이 maidata.txt 첨부를 파싱해 `simai_charts` 에 저장하고 `/chart?id=` 링크를 준다. 업로드본은 30일 뒤 `runSimaiChartGC` 가 정리. |
| `/보면` 곡 검색 | `commands/chart.ts` 의 `autocomplete()` | `곡` 옵션은 mai-notes 인덱스를 메모리에서 찾는다. 자동완성은 3초 제한이라 DB/네트워크를 타면 안 된다. `InteractionCreate` 의 `isAutocomplete()` 분기가 제일 먼저 실행된다. |
| 채보 미리보기 GIF | `utils/chartGif.ts`, `utils/gifWorker.ts` | 웹 플레이어와 같은 렌더러(`web/chartRenderer.ts`)를 vm 에 올려 @napi-rs/canvas 로 프레임을 뽑고 gifenc 로 묶는다. 동기 작업이라 반드시 워커에서 돌린다(`renderChartGifAsync`). `GifOptions` 에 mirror·guide 도 있어 웹 `/chart/gif` 가 페이지 설정 그대로 내보낸다. |
| 채보 풀영상(MP4) | `utils/chartVideo.ts`, `utils/chartVideoWorker.ts`, `utils/chartVideoQueue.ts` | `/보면` 의 `영상 만들기` 버튼(`chartvid:<id>`)이 요청. 400px/60fps/속도6.5/미러없음 고정 + 가이드음(오프라인 PCM 합성 → AAC). 프레임을 ffmpeg stdin 으로 백프레셔 흘려보내 인코딩. 워커에서 돌리고 큐 동시성 1. 완료본은 `DATA_DIR/renders/<id>.mp4`, DB `chart_videos` 에 상태·경로. 웹 `/chart/video?id=` 로 Range 서빙. 원본 채보 만료 시 `runSimaiChartGC` 가 고아 영상도 정리. |
| Goal tracking | `commands/goal.ts`, `src/goals.ts` | `/목표` 추가/목록/삭제; specs evaluated against cached profile + re-scored on every `/sync`. `spec.baseline` (목표 수립 시 현재값)이 있으면 진행률 바는 그 시점부터의 상대치; `progressPercent`/`progressBar` 는 미달성 목표를 100%/꽉 찬 바로 표시하지 않음. `/목표 목록` 완료 개수는 라이브 평가 기준. |
| Role assignment | `utils/roles.ts` | Rating-tier roles, guild setting gate. |
| Rating card renderer | `utils/ratingCard.ts` | Largest file; satori element helper, no JSX. |
| 프로필 카드 | `utils/profileCard.ts` | `/프로필` 기본 응답(이미지). 레이팅 플레이트·신곡/구곡 합(`ratingBreakdown`)·otoge-db 자켓은 `ratingCard.ts` 것을 재사용. `형식:임베드` 는 기존 `profileEmb`. 메모리 캐시 키에 lastSyncedAt 포함. |
| 레이팅 추이 그래프 | `src/ratingHistory.ts`, `profileCard.ts` `ratingChartPanel` | 최근 90일. 실측=`rating_snapshots`(실선, 실측점 사이는 추정 없이 바로 잇는다), 추정=첫 실측 이전 구간만 성과 로그를 그날 끝까지 되돌린 계산값을 **다음 실측일 기준으로 보정**(점선). 마지막 동기화 이후는 점 없음. 버전 업데이트 날 세로선. 선은 SVG 이미지, 라벨은 satori 텍스트. |

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
