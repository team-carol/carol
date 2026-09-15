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

Data flow: Discord `/북마클릿` issues a bookmarklet → user runs it on maimai DX NET (browser cookies) → collected HTML `POST`ed to `/sync` → parsed by `src/scraper.ts` → stored in PostgreSQL via `src/storage/postgres.ts` → shown as Discord embeds / PNG rating cards.

Key entry points:
- `src/bot/index.ts` — registers all slash commands (`COMMANDS`) plus the `이슈로 등록` message context-menu command (`report.contextData`), starts the web server, and in one `InteractionCreate` handler routes slash commands, message context-menu commands, and button `customId`s (`serverset:`, `recent:`, `page:`, `share:`, `rt:`, `search:`, `map*:`, `report:`, `goal:`, `news:`).
- `src/web/index.ts` — owns all HTTP routes and the `/sync` parse/cache pipeline, using **raw `http`** with manual `req.method` + `url.pathname` chains (no Express router).
- `src/storage/postgres.ts` — PostgreSQL storage and numbered migrations; main write path after `/sync`.
- `src/scraper.ts` — Cheerio selectors bound to DX NET markup.
- `src/bot/utils/ratingCard.ts` — satori + resvg PNG rendering (no JSX; uses a local `el()` helper), cached in DB.
- `src/simai/parse.ts` — maidata.txt(simai) 파서. 결과 `Chart` JSON 을 canvas 플레이어가 그대로 소비한다. **파싱은 서버에서만** — 브라우저로 옮기지 말 것(채보 출처가 업로드→DB 로 바뀌어도 이 경계는 유지).
- `src/web/chartRenderer.ts` — 플레이어 그리기 코어를 **JS 소스 문자열**로 보관한다. 브라우저는 `<script>` 에 인라인하고, `/보면` 미리보기 GIF는 같은 문자열을 vm 에 올려 캔버스만 갈아끼운다. 코드를 두 벌 두지 않기 위한 구조이므로 **이 파일 안에서 백틱과 `${` 를 쓰지 말 것.**
- `src/messages.ts` — single catalog of every user-facing bot string (`msg(key, vars)`). Defaults live here; `/관리` → `/admin/messages` writes overrides to `bot_messages`. Slash command/option names and `RATING_ROLES` names are deliberately NOT in the catalog (registered with Discord / looked up by name).

## Project-specific conventions & anti-patterns

- 업로드된 simai 채보(`simai_charts`, `source='upload'`)는 30일 뒤 자동 삭제된다. 운영자 등록분(`source='registry'`)은 GC 대상이 아니다.
- **Slash commands use Korean names.** User `/설정` links to web settings; guild auto-role config is `/서버설정`, not `/설정`.
- **User-facing strings go through `msg()` from `src/messages.ts`** — do not inline new Korean output text in commands. Fonts for PNG cards must be registered under distinct family names (satori does not fall back within one family); see `src/fonts.ts` `FONT_STACK`.
- **PostgreSQL migrations are numbered and immutable after release.** Do not reintroduce SQLite runtime storage or the removed catalog baseline crawler.
- **Web UI is inline string HTML/CSS/JS** in `src/web/index.ts` / `src/web/settingsPage.ts` — no React/templates. Match `docs/DESIGN.md` tokens: `#0d0d0d` canvas, `#1a1a1a` surface, `#2a2a2a` border, `#9333ea` accent, Inter + JetBrains Mono.
- **Do not change `customId` formats casually** — the builder code (`src/bot/utils/embeds.ts`) and the router in `src/bot/index.ts` must change together.
- `src/auth.ts` is a full login/session client but is **not** wired into the current bookmarklet sync flow — don't rely on it.
- **Never store SEGA credentials.** Bookmarklet-pushed HTML/cookies are the only sync path.
- DX NET selectors are not stable. On scraping breakage, inspect the dev-artifact `debug_*.html` files written to repo root (`debug_home.html`, `debug_pd.html`, `debug_fc.html`, `debug_record.html`, `debug_rating_target.html`).
- Don't re-render rating cards unnecessarily; `rating_card_blob` is cached until `lastSyncedAt` or the card version changes.

## Deploy

Push to `master` → GitHub Actions builds/pushes a GHCR image → SSHes to a GCP VM and runs `docker compose pull && docker compose up -d && docker image prune -f`. Runtime state is PostgreSQL via `DATABASE_URL`. See `docs/DEPLOY.md` and `docs/SETUP.md`.
