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
| Guild auto-role setting | `commands/serverSettings.ts` | Admin-only `/서버설정`; button IDs are `serverset:*`. |
| Profile display | `commands/profile.ts`, `utils/embeds.ts` | Uses cached profile and privacy checks. |
| Search command | `commands/search.ts`, `utils/embeds.ts` | `search:{userId}:{encodedQuery}:{pageIdx}` buttons. |
| Rating table/image | `commands/ratingtable.ts`, `commands/ratingimage.ts` | `/레이팅표` uses PNG cache. |
| Bot status | `commands/status.ts` | Operational counts/timestamps. |
| simai 채보 업로드 | `commands/chart.ts`, `src/simai/parse.ts` | `/보면` 이 maidata.txt 첨부를 파싱해 `simai_charts` 에 저장하고 `/chart?id=` 링크를 준다. 업로드본은 30일 뒤 `runSimaiChartGC` 가 정리. |
| `/보면` 곡 검색 | `commands/chart.ts` 의 `autocomplete()` | `곡` 옵션은 mai-notes 인덱스를 메모리에서 찾는다. 자동완성은 3초 제한이라 DB/네트워크를 타면 안 된다. `InteractionCreate` 의 `isAutocomplete()` 분기가 제일 먼저 실행된다. |
| 채보 미리보기 GIF | `utils/chartGif.ts`, `utils/gifWorker.ts` | 웹 플레이어와 같은 렌더러(`web/chartRenderer.ts`)를 vm 에 올려 @napi-rs/canvas 로 프레임을 뽑고 gifenc 로 묶는다. 동기 작업이라 반드시 워커에서 돌린다(`renderChartGifAsync`). |
| Goal tracking | `commands/goal.ts`, `src/goals.ts` | `/목표` 추가/목록/삭제; specs evaluated against cached profile + re-scored on every `/sync`. `spec.baseline` (목표 수립 시 현재값)이 있으면 진행률 바는 그 시점부터의 상대치; `progressPercent`/`progressBar` 는 미달성 목표를 100%/꽉 찬 바로 표시하지 않음. `/목표 목록` 완료 개수는 라이브 평가 기준. |
| Role assignment | `utils/roles.ts` | Rating-tier roles, guild setting gate. |
| Rating card renderer | `utils/ratingCard.ts` | Largest file; satori element helper, no JSX. |

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
