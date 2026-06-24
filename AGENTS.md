# AGENTS.md — carol

Discord bot that exposes maimai DX NET profiles via a bookmarklet. No SEGA credentials stored; users push HTML from their own browser session.

## Developer Commands

```bash
npm run build   # tsc → dist/
npm start       # node dist/bot/index.js (production)
npm run dev     # ts-node src/bot/index.ts (dev, no compile step)
```

No test runner, no linter, no formatter configured.

## Config

`config.json` in the repo root (copied from `config.json.example`). **Not `.env`.**

```jsonc
{
  "token": "DISCORD_BOT_TOKEN",
  "clientId": "APPLICATION_ID",
  "guildId": "optional — guild-scoped commands if set",
  "webPort": 3456,
  "encryptionKey": "leave empty to auto-generate",
  "baseUrl": "https://your-domain.com"   // required in prod; omit for local
}
```

- If `encryptionKey` is empty, the bot generates one on first start and **writes it back into `config.json`**. Don't overwrite the file after first run.
- `baseUrl` controls the bookmarklet URL. Omitting it defaults to `http://localhost:{webPort}`, which breaks the browser→server sync in production.

Docker also needs `.env` with `CF_TUNNEL_TOKEN` (Cloudflare tunnel token).

## Architecture

```
src/bot/index.ts  ←── entry point: Discord client + HTTP server startup
  │
  ├── bot/commands/   slash command handlers (프로필, 북마클릿, 검색, 레이팅기준표, 레이팅표, 설정)
  └── bot/utils/
        embeds.ts     discord.js EmbedBuilder helpers, jacket fetch logic
        ratingCard.ts satori (JSX-free) + @resvg/resvg-js → PNG; render cached by lastSyncedAt
        roles.ts      rating-tier → Discord role mapping & auto-assign logic

src/web/index.ts  ←── Node http server (not Express) on webPort
  │     GET /sync          serves bookmarklet install guide page
  │     POST /sync         receives HTML payload from bookmarklet, parses & caches
  │                        (rejects with "no_change" if playCount unchanged)
  │     GET /avatar        serves stored avatar PNG by Discord user ID
  │     GET /jacket        serves song jacket PNG by music ID (fetches from SEGA if not cached)
  │     GET /bookmarklet.js serves the inline bookmarklet JS
  │     GET /privacy       privacy policy page
  │     GET /terms         terms of service page
  └── web/bookmarklet.ts  bookmarkletJs constant, buildBookmarklet, setBaseUrl, getBaseUrl

src/ (shared)
  config.ts    config.json reader
  constants.ts song level constants from otoge-db.net; persisted to DB (constants_cache table)
  crypto.ts    AES-256-GCM encrypt/decrypt
  db.ts        better-sqlite3; tables: profiles, sessions, jackets, guild_settings, song_jackets, constants_cache
  fonts.ts     NotoSansJP download/cache for satori
  scraper.ts   cheerio parsing of maimai DX net HTML pages
  auth.ts      MaimaiSession (full HTTP login) — NOT used in current flow

docs/
  DESIGN.md    design token reference (dark theme, extracted from ratingCard.ts)
```

## Database

SQLite file at `maimai.db` (dev root) or `/app/data/maimai.db` (Docker, via `DATA_DIR` env).

**Schema migrations use try/catch `ALTER TABLE ADD COLUMN`** — no migration framework. When adding a column, follow the existing pattern at the bottom of `db.ts`:

```ts
try { db.exec("ALTER TABLE profiles ADD COLUMN new_col TEXT DEFAULT ''"); } catch (_) {}
```

Do not use DROP/RENAME; schema is additive only.

Tables:
- `profiles` — maimai player data; includes `rating_card_blob BLOB` and `rating_card_synced_at INTEGER` for PNG render cache (auto-cleared for profiles not synced in 7+ days)
- `sessions` — Discord user ↔ friend_code + encrypted cookie + sync_token + avatar_blob
- `jackets` — per-user indexed recent jacket base64 (not used for rating card)
- `guild_settings` — per-guild auto-role toggle
- `song_jackets` — shared song jacket PNGs keyed by music_id / otoge-db filename
- `constants_cache` — serialized song constant + jacket maps from otoge-db.net, survives restarts

## Rating Card Cache GC

`rating_card_blob` (per-profile PNG) is cleared automatically for profiles whose `last_synced_at` is older than 7 days. Triggered on bot startup and every 24h via `setInterval`. The next `/레이팅표` request re-renders and re-saves. Implemented in [src/db.ts](file:///C:/Users/bitbyte08/Documents/maimai/src/db.ts) (`clearRatingCardCacheForInactive`) and wired in [src/bot/index.ts](file:///C:/Users/bitbyte08/Documents/maimai/src/bot/index.ts) (`runRatingCardGC`).

## TypeScript

- `strict: true`, `target: ES2022`, `module: commonjs`
- Output goes to `dist/`. The `dist/` dir is in `.gitignore`; Docker builds it during image build.
- `resolveJsonModule: true` — `config.json` is imported directly via `require("../config.json")` in `config.ts`

## Web Server Quirk

`src/web/index.ts` uses Node's built-in `http` module, not Express. Route matching is manual `if` chains on `req.method + url.pathname`. Add new routes by following that pattern, not by importing a router.

## HTML Scraping

`scraper.ts` CSS selectors target maimai DX net's HTML structure (e.g., `.name_block`, `.rating_block`, `.trophy_inner_block`). These **will break if SEGA updates their page layout**. When scraping issues occur, check the debug HTML files written to repo root on each sync:

- `debug_home.html`, `debug_pd.html`, `debug_fc.html`, `debug_record.html`, `debug_rating_target.html`

These are dev artifacts written by `web/index.ts`'s POST `/sync` handler. They exist in the working directory, not in Docker's `/app/data`.

## Rating Image Rendering

`src/bot/utils/ratingCard.ts` uses `satori` (no JSX — manual `el()` helper) + `@resvg/resvg-js` to produce PNG. The rendered PNG is cached in `profiles.rating_card_blob` (keyed by `rating_card_synced_at`) and reused until `lastSyncedAt` changes — i.e., the user runs the bookmarklet again. Fonts are fetched from jsDelivr on first render and cached to `{DATA_DIR}/fonts/`. If fonts are missing, the first rating image request will download them; subsequent calls use the cache.

## Song Constants

`src/constants.ts` fetches from `otoge-db.net` at startup and every 24h. International data takes priority over JP data. Constants are persisted to the `constants_cache` DB table and survive restarts — startup skips the network fetch if the cached data is < 24h old. Network failure at startup is non-fatal (logged, falls back to DB cache or empty map). Without constants, rating score calculations fall back to the display level string (less accurate).

## Design System

See `docs/DESIGN.md` for the full design token reference. All web UI in `src/web/` uses the dark theme defined there:

- **Canvas**: `#0d0d0d`  **Surface**: `#1a1a1a`  **Border**: `#2a2a2a`
- **Accent**: `#9333ea`
- **Font**: Inter + JetBrains Mono (web), NotoSansJP (satori/PNG)

## Discord Commands

All slash command names are Korean (`/프로필`, `/북마클릿`, `/검색`, `/레이팅기준표`, `/레이팅표`). The `설정` command handles a guild-level auto-role toggle. `/검색` searches the user's stored clear records by case-insensitive title substring (paginated 5 per page, with jacket thumbnails). Commands are registered globally unless `guildId` is set in config (guild-scope = instant update, useful for dev).

## Docker & Deployment

```bash
# Local Docker
docker compose up -d   # runs bot + cloudflared tunnel

# Production (GCP VM)
cd ~/carol
git pull origin master
docker compose pull
docker compose up -d
docker image prune -f
```

- Volume: `./data` → `/app/data` (DB + fonts persisted here)
- `config.json` is mounted read-only into the container
- Healthcheck hits `http://localhost:3456/` and expects 404 (any non-error response)

**CI/CD**: push to `master` → GitHub Actions builds image → pushes to GHCR → SSH into GCP VM → `docker compose pull && up -d`.

Required GitHub secrets: `GCP_HOST`, `GCP_USER`, `GCP_SSH_KEY`.

## Key Constraints

- **No SEGA credentials** are ever stored. Session cookies come from the user's own browser via bookmarklet; the bot only stores the opaque encrypted blob.
- `auth.ts` (`MaimaiSession`) is a full HTTP session/login implementation but is **not used** in the current bot flow — bookmarklet push is the only sync mechanism.
- Button interaction `customId` format is load-bearing: `recent:{userId}:{gameIdx}`, `page:{userId}:{gameIdx}`, `share:{userId}:{gameIdx}:{songIdx}`, `rt:{userId}`, `search:{userId}:{encodedQuery}:{pageIdx}`, `settings:{...}`. Changing the format requires updating both the builder (commands/utils) and the router in `bot/index.ts`. Search query is URL-encoded to safely handle colons and non-ASCII characters.
- POST `/sync` returns `"no_change"` (HTTP 200) if the incoming playCount matches the cached value, skipping re-parse, re-render, and DB writes.
