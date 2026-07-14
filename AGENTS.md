# PROJECT KNOWLEDGE BASE

**Generated:** 2026-06-29
**Commit:** ce12773
**Branch:** master

## OVERVIEW

carol is a Discord bot plus raw Node HTTP server for maimai DX NET profiles. Users run a bookmarklet in their own logged-in browser; the server stores encrypted/session-derived profile data, never SEGA credentials.

## STRUCTURE

```
carol/
├── src/                 # shared TS runtime: DB, scraping, constants, crypto, fonts
│   ├── bot/             # Discord client, slash commands, embeds, roles, PNG cards
│   └── web/             # raw http server, bookmarklet JS, settings pages/APIs
├── docs/                # deployment/setup/design references
├── .github/workflows/   # master -> GHCR image -> GCP VM deploy
├── Dockerfile           # node:22-slim two-stage TS build
└── docker-compose.yml   # PostgreSQL + bot + cloudflared tunnel
```

## WHERE TO LOOK

| Task | Location | Notes |
|---|---|---|
| Bot startup / command registration | `src/bot/index.ts` | Also starts the web server and routes button `customId`s. |
| Slash command behavior | `src/bot/commands/` | Korean command names; modules export `data` + `execute`. |
| Recent/search/rating embeds | `src/bot/utils/embeds.ts` | Button builders and paginated embed assembly. |
| Rating-card PNG | `src/bot/utils/ratingCard.ts` | satori + resvg, no JSX; DB render cache by sync time/version. |
| Auto role tiers | `src/bot/utils/roles.ts` | Guild auto-role toggle is `/서버설정`, not user `/설정`. |
| Web routes / sync ingest | `src/web/index.ts` | Manual `req.method` + `url.pathname` chains. |
| Bookmarklet source | `src/web/bookmarklet.ts` | Embedded JS string; preset bookmarklets injected before extras. |
| Web settings UI | `src/web/settingsPage.ts` | Inline HTML/CSS/JS, no React/templates. |
| DB schema/storage | `src/storage/postgres.ts` | PostgreSQL storage and numbered migrations. |
| maimai parsing | `src/scraper.ts` | Cheerio selectors tied to DX NET markup. |
| Song constants/jackets | `src/constants.ts` | otoge-db cache; startup network failure is non-fatal. |
| Visual tokens | `docs/DESIGN.md` | Dark theme shared by web and rating card. |
| Deploy/runbook | `docs/DEPLOY.md`, `docs/SETUP.md` | Cloudflare tunnel + GCP VM workflow. |

## CODE MAP

TypeScript LSP was unavailable in this workspace, and codegraph is not indexed. Centrality below is based on direct file inspection.

| Symbol / File | Type | Location | Role |
|---|---|---|---|
| `COMMANDS` | registry | `src/bot/index.ts` | Registers all slash commands through Discord REST. |
| `client.on(Events.InteractionCreate)` | router | `src/bot/index.ts` | Dispatches commands plus `serverset:`, `recent:`, `page:`, `share:`, `rt:`, `search:` buttons. |
| `startWebServer` | entry | `src/web/index.ts` | Owns all HTTP routes and `/sync` parse/cache pipeline. |
| `guidePage` | HTML generator | `src/web/index.ts` | `/sync` install UI for PC/mobile plus settings link. |
| `settingsPage` | HTML generator | `src/web/settingsPage.ts` | Privacy, preset bookmarklets, extra bookmarklet CRUD. |
| `buildBookmarkletJs` | generator | `src/web/bookmarklet.ts` | Wraps embedded sync JS and evaluates enabled extra scripts. |
| `BOOKMARKLET_PRESETS` | config list | `src/web/bookmarklet.ts` | Built-in bookmarklets; first preset is `maishift`. |
| `cacheProfile` / `saveUserSession` | persistence | `src/storage/postgres.ts` | Main write path after `/sync`. |
| `getUserSyncToken` / `findUserBySyncToken` | auth link | `src/storage/postgres.ts` | Token-based web access for `/sync` and `/settings`. |
| `parseHome` / `parseMusicScore` | scraper | `src/scraper.ts` | CSS-selector parsing of DX NET HTML. |
| `renderRatingCard` | PNG render | `src/bot/utils/ratingCard.ts` | Rating image generation and cache population. |

## CONVENTIONS

- Config is `config.json` in repo root, copied from `config.json.example`; not `.env`. Docker also needs `.env` only for `CF_TUNNEL_TOKEN`.
- Empty `encryptionKey` is generated on first start and written back to `config.json`; do not overwrite the file after first run.
- `baseUrl` controls bookmarklet URLs. Empty means local `http://localhost:{webPort}`; production must set the tunnel/domain URL.
- TypeScript is strict CommonJS targeting ES2022. Build output, declarations, and maps go to `dist/`.
- Runtime storage is PostgreSQL through `DATABASE_URL`; migrations in `src/storage/postgres.ts` are numbered and immutable once released.
- Slash commands use Korean names. User `/설정` links to web settings; guild auto-role lives in `/서버설정`.
- Web UI is inline string HTML/CSS/JS. Match `docs/DESIGN.md`: `#0d0d0d` canvas, `#1a1a1a` surface, `#2a2a2a` border, `#9333ea` accent, Inter + JetBrains Mono.
- Rating-card UI uses satori without JSX via the local `el()` helper and NotoSansJP fonts cached under `{DATA_DIR}/fonts/`.

## ANTI-PATTERNS (THIS PROJECT)

- Do not store SEGA credentials. Bookmarklet-pushed HTML/cookies are the only current sync path.
- Do not reintroduce SQLite runtime storage, SQLite import tooling, or the removed catalog baseline crawler.
- Do not import Express or routers for web routes; `src/web/index.ts` intentionally uses raw `http` and manual route chains.
- Do not change `customId` formats casually; builder code and `src/bot/index.ts` router must change together.
- Do not rely on `auth.ts` for the current flow; it is a full login/session client but not wired into bookmarklet sync.
- Do not treat DX NET selectors as stable. On scraping breakage, inspect `debug_home.html`, `debug_pd.html`, `debug_fc.html`, `debug_record.html`, `debug_rating_target.html`.
- Do not re-render rating cards unnecessarily; `rating_card_blob` is cached until `lastSyncedAt` or card version changes.

## COMMANDS

```bash
npm run build     # tsc -> dist/
npm start         # node dist/bot/index.js
npm run dev       # ts-node src/bot/index.ts
npm run dev:web   # ts-node src/web/dev.ts, no Discord client
docker compose up -d
```

No linter or formatter is configured. Validation is `npm run test:integration` plus manual Discord/web/bookmarklet checks.

## NOTES

- `POST /sync` returns HTTP 200 body `no_change` when play count matches cached data and `clearJson` is non-empty; empty `clearJson` bypasses the guard.
- Debug HTML files are dev artifacts written to repo root, not Docker `/app/data`.
- Runtime state is PostgreSQL; local SQLite files are migration archives only.
- GitHub Actions triggers on `master`, builds/pushes GHCR image, then SSHes to GCP VM and runs `docker compose pull && docker compose up -d && docker image prune -f`.
- `.dockerignore` excludes config, DB/data, debug HTML, `.git`, and local generated artifacts from images.
