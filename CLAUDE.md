# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

carol is a Discord bot + raw Node HTTP server for maimai DX NET profiles. Users run a **bookmarklet** in their own logged-in browser; the server ingests the pushed HTML and stores encrypted/session-derived profile data. It never handles SEGA credentials.

There are detailed nested knowledge bases — read the one closest to what you're editing: root `AGENTS.md` (full map), `src/AGENTS.md`, `src/bot/AGENTS.md`, `src/web/AGENTS.md`.

## Commands

```bash
npm run build     # tsc -> dist/  (this IS the validation step; no test/lint/format configured)
npm start         # node dist/bot/index.js
npm run dev       # ts-node src/bot/index.ts  (full bot + web server)
npm run dev:web   # ts-node src/web/dev.ts    (web server only, no Discord client)
docker compose up -d
```

There is no linter or formatter. Validate storage changes with `npm run test:integration` plus manual Discord/web/bookmarklet checks. TypeScript is **strict CommonJS targeting ES2022**.

## Configuration

- Config lives in `config.json` at repo root (copied from `config.json.example`), **not** `.env`. Docker uses `.env` only for `CF_TUNNEL_TOKEN`.
- Empty `encryptionKey` is generated on first start and **written back** to `config.json` — do not overwrite the file after first run.
- `baseUrl` controls bookmarklet URLs. Empty = local `http://localhost:{webPort}`; production must set the tunnel/domain URL.
- `carolIssueBaseUrl` + `carolSharedSecret` enable the `/문의` issue-report flow (`src/bot/issueApi.ts` → carol-issue `/triage/*`). Both must be set or the command is inert (`isConfigured()` guard). `carolIssueGuildId` is the DM fallback `guildId`. These are read-only — never add config write-back for them.

## Architecture

Data flow (feat/maishift): profile/records come from maishift (`src/maishift`). Discord `/북마클릿` issues a bookmarklet → user runs it on maimai DX NET (browser cookies; it also runs the maishift bookmarklet) → friend code/recent plays/maps/options/circle HTML `POST`ed to `/sync` → parsed by `src/scraper.ts` → stored in PostgreSQL via `src/storage/postgres.ts` → shown as Discord embeds / PNG rating cards.

Key entry points:
- `src/bot/index.ts` — registers all slash commands (`COMMANDS`) plus the `이슈로 등록` message context-menu command (`report.contextData`), starts the web server, and in one `InteractionCreate` handler routes slash commands, message context-menu commands, and button `customId`s (`serverset:`, `recent:`, `page:`, `share:`, `rt:`, `search:`, `map*:`, `report:`, `goal:`, `news:`, `circle:`).
- `src/web/index.ts` — owns all HTTP routes and the `/sync` parse/cache pipeline, using **raw `http`** with manual `req.method` + `url.pathname` chains (no Express router).
- `src/storage/postgres.ts` — PostgreSQL storage and numbered migrations; main write path after `/sync`.
- `src/scraper.ts` — Cheerio selectors bound to DX NET markup.
- `src/bot/utils/ratingCard.ts` — satori + resvg PNG rendering (no JSX; uses a local `el()` helper), cached in DB.
- `src/simai/parse.ts` — maidata.txt(simai) 파서. 결과 `Chart` JSON 을 canvas 플레이어가 그대로 소비한다. **파싱은 서버에서만** — 브라우저로 옮기지 말 것(채보 출처가 업로드→DB 로 바뀌어도 이 경계는 유지).
- `src/web/chartRenderer.ts` — 플레이어 그리기 코어를 **JS 소스 문자열**로 보관한다. 브라우저는 `<script>` 에 인라인하고, `/보면` 미리보기 GIF는 같은 문자열을 vm 에 올려 캔버스만 갈아끼운다. 코드를 두 벌 두지 않기 위한 구조이므로 **이 파일 안에서 백틱과 `${` 를 쓰지 말 것.**
- `src/messages.ts` — single catalog of every user-facing bot string (`msg(key, vars)`). Defaults live here; `/관리` → `/admin/messages` writes overrides to `bot_messages`. Slash command/option names and `RATING_ROLES` names are deliberately NOT in the catalog (registered with Discord / looked up by name).

## Project-specific conventions & anti-patterns

- 업로드된 simai 채보(`simai_charts`, `source='upload'`)는 30일 뒤 자동 삭제된다. 운영자 등록분(`source='registry'`)은 GC 대상이 아니다.
- **mai-notes 채보 본문 fetch 는 기본 꺼짐(`config.mainotesFetchCharts`, 기본 false).** `src/mainotes/` 는 `manifest.json`(메타데이터) 을 하루 1회 ETag 조건부로 받아 검색 인덱스를 만든다. 채보 본문은 `https://mai-notes.com/data/charts/<UUID>.txt`(manifest 와 같은 공개 /data/ 경로)에서 받아 `simai_charts`(source='mainotes')에 캐시하고 다시 받지 않는다 — 단, **플래그가 켜졌을 때만**. mai-notes 이용약관 제7조와 운영자 문의 답변 대기 때문에 커밋 기본값은 반드시 false 여야 하고, 지금은 테스트용으로만 로컬 config.json 에서 켠다. 거절되면 `src/mainotes/` 를 지우고 `src/bot/index.ts` 의 `registerChartSource(mainotesSource)` 한 줄을 빼면 된다.
- mai-notes 운영자가 요구한 유일한 조건은 **대량 통신 금지**다. 요청 하한(24시간)·ETag·User-Agent 식별은 `src/mainotes/client.ts` 와 `index.ts` 에 있다. 이 셋을 약화시키지 말 것.
- **maishift 연동(임시, `feat/maishift` — 공식 API 전까지 배포하지 않음). 프로필은 maishift 에서만 온다.** `/마이시프트 연동 아이디:` 로 `sessions.maishift_handle` 을 저장한다. 연동하지 않은 사용자는 미등록으로 본다(캐롤봇 프로필로 돌아가지 않음). `storage` 의 `getCachedProfile`/`getUserFriendCode`/`loadUserSession` 이 `src/maishift` overlay 로 maishift 프로필·레이팅 대상·전체 기록·히스토리를 채우고, 캐롤봇 북마클릿이 모은 부가 데이터(서클·최근 플레이·지방)는 **그 사용자가 직접 동기화한 친구 코드 행에서만** 붙인다(남의 아이디를 연동해도 그 사람의 캐롤봇 데이터는 안 보이게). 프로필 키는 그 서버의 캐롤봇 친구 코드 키, 없으면 `ms:<server>:<handle>`. maishift 데이터는 메모리에만 둔다. 단위·클래스 이미지는 maishift 가 번호만 주므로, 캐롤봇 북마클릿이 DX NET 홈에서 본 이미지만(HTML 은 안 보냄, 이미 저장된 파일명은 건너뜀) 보내 `src/rankImages.ts` 가 서버·종류·번호별로 `constants_cache`(`rank_images`)에 저장해 모두가 같이 쓴다. 성과·레이팅 스냅샷·목표는 maishift 전체 기록을 새로 받을 때 `src/maishift/sync.ts` 가 `chart_clears` 와 비교해 만든다(플레이 시각·+N 은 캐롤봇 최근 플레이 이력으로 매칭). 캐롤봇 북마클릿(사용자에게는 "캐롤봇 추가 북마클릿", 사용자가 직접 등록하는 외부 북마클릿은 "사설 북마클릿")은 친구 코드·최근 플레이·상세·지방·게임 설정·서클만 보내고(`/sync` → `saveSyncExtras`), maishift 업로드를 기다리지 않으므로 동기화 30초·90초 뒤 maishift 를 확인한다. 처음 받는 maishift 조회가 3초를 넘길 수 있어 `src/bot/utils/slowAck.ts` 가 명령·버튼 디스패치에서 2.3초에 대신 defer 한다(비공개 응답은 공개 대기 메시지를 지우고 비공개 followUp). maishift 데이터는 **공식 API**(`src/maishift/api.ts`, `config.maishiftApiKey` 를 `X-API-Key` 로, 앱마다 분당 120단위 한도를 남은 양 헤더·429 `Retry-After` 로 지킨다)로 받는다: 곡 목록·버전(`/songs`·`/versions`), 프로필(`/profiles/{handle}`), 전체 기록·레이팅 대상(`/records` 의 `best`), 업로드 목록·이전 기록(`/snapshots`), 보면 분포(`/charts/{id}/distribution`). API 에 없는 것(미래시, 히스토리의 플레이 횟수, 스탬프, 보면 상수 이력·기록 변화)만 아직 서버 함수(`src/maishift/serverFn.ts` `FN`, 해시는 maishift 배포 때 바뀔 수 있음)로 받는다. 운영자가 이 엔드포인트를 곧 만들어 주기로 했다(2026-10-21). 버전 폴더 안 순서("Splash 8/60")는 maishift 데이터가 어긋나 있어 maishift 도 보여 주지 않으므로 지금은 표시하지 않는다(`versionPositionText` 가 null). 고쳐지면 API `/songs` 에 들어올 예정이고, 그때 `catalog.ts` `toCatalog` 에 순서를 넘기면 된다. 재킷은 운영자 권고대로 비영리 팬 프로젝트임을 밝히고 쓴다(이용약관). API 개발자 약관: 출처와 SEGA 와 무관한 비공식 앱임을 표시, 비상업, 재킷은 API 주소로만, 이용을 그만둔 플레이어 데이터는 삭제. 운영자 조건: 부하 최소, 출처 표기(`maishift.credit`). `/마이시프트 해제`(`unlinkMaishift`)는 maishift 에서 받아 만든 데이터만 지운다: 친구 코드 키의 비교 기준·레이팅표 캐시·maishift 성과(`source_kind='maishift'`), 목표 진행률, 그리고 `ms:` 키 데이터는 같은 아이디를 연동한 사람이 남지 않았을 때만. 캐롤봇 북마클릿 데이터와 그때의 성과는 남긴다. 캐롤봇 추가 북마클릿 데이터를 쓰는 프로필 표시(최근 플레이 패널·버튼, 지방 버튼, 서클 이름)는 그 북마클릿을 실행한 사용자에게만 보이고(`src/bot/utils/syncExtras.ts` `hasCarolSync` — 프로필 키가 `ms:` 가 아니면 실행한 것), 그 데이터만 쓰는 명령(/서클·/지방·/게임설정)은 데이터가 없으면 추가 북마클릿 등록을 안내한다. 공개 여부는 maishift 설정을 따른다: 프로필(비공개면 maishift 가 "User record is not public." 을 주고, 캐롤봇은 `MaishiftError` kind `private` 로 받아 그 아이디의 메모리 캐시(프로필·이전 기록·스탬프·곡 기록 변화)를 모두 지우고 비공개 안내), 친구 코드(`maishiftFriendCode` — maishift 가 공개한 값만 표시), 이전 기록(`maishiftPastPublic` — 다른 사람의 /성과·과거 레이팅표). 캐롤봇 쪽 공개 설정은 서클(추가 북마클릿 데이터)만 남았다. /성과 는 maishift 키와 캐롤봇 친구 코드 키의 성과를 합쳐 보고(`achievementProfileKeys`), 추가 북마클릿을 처음 실행해 키가 바뀌면 비교 기준(`chart_clears`)을 복사한다. 응답 전에 `settleMaishiftRecords` 로 방금 올린 기록의 반영을 기다린다(최대 8초). 추가 북마클릿을 실행하지 않은 사용자의 성과 카드는 플레이 시각·레이팅 상승분 없이 달성률 변화·FC/FS 만 그린다. 과거 레이팅표(`/레이팅표 date`)는 캐롤봇이 저장하지 않고 maishift 이전 기록(API `/snapshots` 업로드 목록 → `/snapshots/{id}`)을 받으며, 상수도 그 시점 값(`PlayRecord.constant`)을 쓴다. 이전 기록에는 그때의 이름·칭호·아이콘이 없어 지금 값을 쓴다. /검색 결과의 "N번 상세" 버튼(`trk:`/`trkd:`, `src/bot/utils/trackDetail.ts`)은 maishift 곡 창과 같은 정보(내 기록·달성률 변화·버전별 상수·레이팅 구간별 분포)를 `src/maishift/track.ts` 로 받아 `trackCard.ts` 가 그린다(보면 번호는 카탈로그 `getTrackId`). /스탬프 는 maishift 스탬프 카드(`FN.stamps`, `src/maishift/stamps.ts` 5분 캐시)를 `stampCard.ts` 가 그린다. 곡명 번역은 캐롤봇 번역 별명이 우선이고 없으면 maishift 한국어 번역. 검색(`aliasMatches`)에서는 maishift 번역도 늘 별명처럼 찾는다. 곡·상수 카탈로그(`src/constants.ts`)도 maishift 곡 목록(ASIA·JAPAN)을 하루 한 번 받는다. 레이팅 신곡 범위(현재 버전 + 바로 이전 버전)와 새 버전 이름도 그 곡 목록의 지역별 `availableVersions`(출시 시각)로 계산하므로 새 버전이 나와도 코드를 고치지 않는다(`NEW_SONG_WINDOWS` 표는 곡 목록을 받기 전에만 쓰는 대체값). 宴(우타게)은 없다.
- **지방 이름·스탬프 카드 이름 번역**(`src/nameTranslations.ts`, `name_translations` 테이블, `/관리` → 이름 번역 `src/web/namesAdminPage.ts`): 봇이 처음 본 이름(/sync 의 지방, /스탬프 의 곡 외 카드)을 `ko=''` 로 쌓고 운영자가 채운다. 지방은 끝 번호를 뗀 이름이 키이고 보여 줄 때 번호를 다시 붙인다. 곡명 번역과 같은 사용자 설정(`translate_titles`)을 따른다. 중국판(LXNS) 칭호 목록은 내수판과 1년 이상 차이 나서 쓰지 않기로 했다.
- **/사진관**(`src/bot/commands/photo.ts`, 옵션 없음)은 이미지 명령(레이팅표·프로필·히스토리·성과·스탬프·서클)을 모은 Components V2 컨테이너 메뉴로, 실행한 사람에게만 보인다(비공개). 만든 이미지는 채널에 공개로 보낸다. 사진 종류·유저 선택 메뉴로 고르고 맨 아래 "만들기" 버튼을 누르면 그때 각 명령의 `show()` 로 이미지를 만들어 새 메시지로 보낸다. 명령어의 추가 옵션은 사진 종류에 따라 선택 메뉴로 생긴다(레이팅표: 레이팅 종류·날짜, 히스토리: 기간, 성과: 날짜. 프로필·서클은 이미지로만). 날짜 목록은 maishift 업로드한 날·성과가 있는 날이고, "직접 입력"을 고르면 모달이 뜬다(메시지에는 텍스트 입력을 못 넣는다). 고른 값은 메시지 컴포넌트에만 둔다(customId 끝의 `<종류>.<옵션1>.<옵션2>`). 기존 명령은 그대로 두었다. 주인이 아닌 사람이 고르면 그 사람에게만 새 메뉴를 띄운다. V2 메시지는 content·embeds 를 같이 못 쓰고, `slowAck` 은 늦은 응답에서도 `IsComponentsV2` 플래그를 남긴다.
- **/검색 결과**(`searchResultEmbeds`, 이름은 예전 그대로)는 Components V2 다: 검색어 한 줄 → 곡마다 컨테이너(제목·재킷 썸네일·지역/장르/버전, 코드 블록 점수표, `trk:` 상세·외부 출력 링크 버튼, 띠 색은 DX 주황·ST 파랑) → 페이지 버튼. 응답할 때 `flags: IsComponentsV2` 가 결과에 들어 있고, V2 메시지에는 content 를 다시 넣을 수 없다.
- **Slash commands use Korean names.** User `/설정` links to web settings; guild auto-role config is `/서버설정`, not `/설정`.
- **User-facing strings go through `msg()` from `src/messages.ts`** — do not inline new Korean output text in commands. This includes text drawn inside PNG cards (`card.*`/`profileCard.*`/`circleCard.*`/`achievementCard.*`/`ratingCard.*` keys); card caches include `cardTextSignature()` so admin edits re-render. Fonts for PNG cards must be registered under distinct family names (satori does not fall back within one family); see `src/fonts.ts` `FONT_STACK`.
- **PostgreSQL migrations are numbered and immutable after release.** Do not reintroduce SQLite runtime storage or the removed catalog baseline crawler.
- **Web UI is inline string HTML/CSS/JS** in `src/web/index.ts` / `src/web/settingsPage.ts` — no React/templates. Web pages use the carol-web (landing) design system from `src/web/theme.ts`: `BASE_CSS` CSS variables (`--canvas #1a1a1c`, `--surface #242427`, `--border #33333a`, `--accent #ff9294`), Pretendard, shared `pageHead()`/`topbar()`/`siteFooter()`/`.btn-primary`. Use the variables — don't hard-code colors. Raw values live in `src/brand.ts` (`BRAND`), which the PNG rating/achievement cards also use; game colors (difficulty, FC/AP, DX) stay separate.
- **Do not change `customId` formats casually** — the builder code (`src/bot/utils/embeds.ts`) and the router in `src/bot/index.ts` must change together.
- `src/auth.ts` is a full login/session client but is **not** wired into the current bookmarklet sync flow — don't rely on it.
- **Never store SEGA credentials.** Bookmarklet-pushed HTML/cookies are the only sync path.
- DX NET selectors are not stable. On scraping breakage, inspect the dev-artifact `debug_*.html` files written to repo root (`debug_home.html`, `debug_pd.html`, `debug_fc.html`, `debug_record.html`, `debug_rating_target.html`).
- Don't re-render rating cards unnecessarily; `rating_card_blob` is cached until `lastSyncedAt` or the card version changes.

## Deploy

Push to `master` → GitHub Actions builds/pushes a GHCR image → SSHes to a GCP VM and runs `docker compose pull && docker compose up -d && docker image prune -f`. Runtime state is PostgreSQL via `DATABASE_URL`. See `docs/DEPLOY.md` and `docs/SETUP.md`.
