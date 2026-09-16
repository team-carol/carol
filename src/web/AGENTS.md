# WEB KNOWLEDGE BASE

## OVERVIEW

Raw Node HTTP server and browser-facing sync surface: install guide, settings UI/API, bookmarklet JS delivery, maimai DX NET HTML ingestion, and asset endpoints.

## STRUCTURE

```
src/web/
├── index.ts         # http.createServer routes, inline guide pages, /sync ingest
├── bookmarklet.ts   # baseUrl helpers, preset list, generated bookmarklet JS
├── settingsPage.ts  # full settings HTML/CSS/JS string
├── chartPlayer.ts   # simai 채보 플레이어 페이지 껍데기 (HTML/CSS + 컨트롤)
├── chartRenderer.ts # 플레이어 그리기 코어를 담은 JS 문자열 (서버 GIF 생성과 공용)
└── dev.ts           # web-only local entrypoint
```

## WHERE TO LOOK

| Task | Location | Notes |
|---|---|---|
| Add HTTP route | `index.ts` | Follow `if (req.method && url.pathname)` chains. |
| Change install guide | `guidePage()` in `index.ts` | PC/mobile tabs plus settings link and extra bookmarklet guide. |
| Change settings UI | `settingsPage.ts` | Inline HTML/CSS/JS; no framework. |
| Change settings API | `index.ts` settings API block | `/api/settings`, `/privacy`, `/preset`, `/bookmarklet`. |
| Change bookmarklet payload | `bookmarklet.ts` | Huge embedded JS string plus injection marker. |
| Add built-in bookmarklet | `BOOKMARKLET_PRESETS` in `bookmarklet.ts` | Add preset object; state stored as ID in DB. |
| Web-only local preview | `dev.ts` | Starts server without Discord token/login. |
| 채보 플레이어 껍데기 | `chartPlayer.ts` | HTML/CSS와 컨트롤. 그리기 코어는 `chartRenderer.ts` 를 인라인한다. |
| 노트·슬라이드 그리기 | `chartRenderer.ts` | canvas 링 렌더러. **백틱과 `${` 를 쓰지 말 것** (템플릿 문자열로 보관). `/보면` 미리보기 GIF도 이 코드를 vm 에 올려 쓴다. |
| 슬라이드 간섭 | `chartRenderer.ts` (`interfere`, `slideErased`) | 다른 별이 지나간 슬라이드 궤적도 지운다(기본 ON, 칩 `tInterf`). 앞에서부터(prefix)만 지워 순서 보장, 한 번 지우면 유지(seek 시 리셋). `nearestOnPath` 는 선분 투영. GIF 옵션 `interfere` 로 전달. |
| Scrape sync pipeline | `POST /sync` in `index.ts` | Writes debug HTML, parses, caches, saves session/avatar/jackets. |
| Jacket/avatar endpoints | `GET /jacket`, `GET /avatar` in `index.ts` | Cache-first asset responses. |

## ROUTES

| Route | Purpose |
|---|---|
| `GET /sync?code=TOKEN` | Bookmarklet install guide; dev preview allowed when `baseUrl` is empty. |
| `POST /sync?code=TOKEN` | Receives bookmarklet HTML payload and caches profile/session data. |
| `GET /settings?code=TOKEN` | User settings page: profile privacy, presets, extra bookmarklets. |
| `GET /api/settings` | JSON `{ private, presets, bookmarklets }`. |
| `POST /api/settings/privacy` | Toggle profile privacy. |
| `POST /api/settings/preset` | Toggle preset IDs such as `maishift`. |
| `POST /api/settings/bookmarklet` | Add/delete extra bookmarklets, max 5. |
| `GET /bookmarklet.js?code=TOKEN` | Serves generated sync JS with enabled presets/extras. |
| `GET /avatar`, `GET /jacket` | Stored/fetched PNG assets. |
| `GET /chart?id=TOKEN` | simai 채보 플레이어. 토큰을 아는 사람만 열 수 있고 로그인은 요구하지 않는다. |
| `GET /chart/gif?id=TOKEN&start&dur&size&fps&speed&mirror&guide` | **폴백 전용** GIF 생성. OffscreenCanvas/Worker 가 없는 브라우저(구형 Safari 등)만 여기로 온다. 서버에서 옵션 클램프(길이 ≤30초, 크기 ≤800px), 동시 실행 `GIF_MAX_CONCURRENT`(2) 초과 시 429. `/chart` 와 `loadChart()` 공유. |

웹 플레이어의 GIF 생성은 기본적으로 **브라우저에서** 한다(`chartGifClient.ts`): 같은 렌더러(`chartRenderer.ts`)를 Web Worker 안 OffscreenCanvas 에 올리고 gifenc(브라우저 dist 를 워커에 인라인)로 인코딩한다 → 서버 CPU 0. 렌더러는 `__RJS`(문자열)로 워커에 넘겨 eval 하고, DATA/opts 는 postMessage 로 준다. Discord 미리보기(`utils/chartGif.ts`)는 별개로 여전히 서버에서 만든다.
| `GET /privacy`, `GET /terms` | Static legal pages. |

## CONVENTIONS

- Do not introduce Express. `index.ts` intentionally uses Node `http` and manual routing.
- Route auth is `sync_token` query param resolved by `findUserBySyncToken`; production rejects missing/expired tokens with 403.
- `isDev = !CONFIG.baseUrl` allows local `/sync` and `/settings` preview without a token.
- Web pages use inline CSS matching `docs/DESIGN.md`: dark canvas/surface, purple accents, Inter + JetBrains Mono.
- `settingsPage()` serializes data with `<`/`>` escaped before embedding in `<script>`.
- Extra bookmarklets must start with `javascript:` and are capped at 5.
- Preset bookmarklets execute before user extra bookmarklets in generated `/bookmarklet.js`.
- Preset/extra bookmarklet tracking must not override `window.open`; popup bookmarklets such as `maishift` must receive native browser behavior.
- Bookmarklet execution is restricted to `maimaidx.jp` and `maimaidx-eng.com` before DOM work.

## SYNC GOTCHAS

- `/sync` writes `debug_home.html`, `debug_pd.html`, `debug_fc.html`, `debug_record.html`, `debug_rating_target.html` in repo root.
- The old play-count-only `no_change` shortcut was removed; `/sync` should parse/cache posted data even when play count is unchanged.
- `/sync` rejects invalid payloads before caching when profile/friend code/clear/rating-target data is missing or recent-play parsing returns fewer rows than expected.
- Recent-play storage is intentionally capped to the latest 5 games, not 5 songs; duplicate same-song plays must remain separate records.
- `POST /sync` stores recent records, rating target records, clear records, avatar, song jackets, and session friend code.
- DX NET HTML selectors live in `src/scraper.ts`; check debug files first when SEGA layout changes.

## ANTI-PATTERNS

- Do not split web UI into React or templates unless explicitly requested; current surface is TS template strings.
- Do not add a preset-specific DB column/API for each new built-in bookmarklet; use `BOOKMARKLET_PRESETS` + `preset_bookmarklets` IDs.
- Do not move debug dumps into Docker data silently; docs expect repo-root files during dev.
- Do not remove the domain guard from bookmarklet JS.
- Do not let `baseUrl` drift from the public Cloudflare Tunnel URL in production.

## VALIDATION

```bash
npm run build
npm run dev:web
```

Manual QA: open `http://localhost:3456/sync` and `/settings` in local mode; use a real maimai DX NET page for bookmarklet sync behavior.
