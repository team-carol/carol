# SRC KNOWLEDGE BASE

## OVERVIEW

Shared TypeScript runtime for persistence, parsing, constants, crypto, fonts, and cross-cutting domain models used by both bot and web.

## STRUCTURE

```
src/
├── bot/        # Discord-facing runtime and commands
├── web/        # HTTP server, bookmarklet, settings UI
├── simai/      # maidata.txt(simai) 파서 — 채보 타임라인 생성. 네트워크/DB 의존 없음
├── mainotes/   # mai-notes.com 메타데이터 인덱스 — 검색용. 채보 본문은 받지 않는다
├── db.ts       # SQLite singleton, schema, migrations, caches, settings
├── scraper.ts  # maimai DX NET HTML parser and PlayRecord model
├── constants.ts # otoge-db constants/jacket metadata and rating math
├── config.ts   # config.json loader + default PORT
├── crypto.ts   # AES-GCM helpers; may write encryptionKey to config.json
├── fonts.ts    # NotoSansJP download/cache for satori
├── aliases.ts  # optional Postgres-backed song aliases
└── auth.ts     # full login/session client, not current sync path
```

## WHERE TO LOOK

| Task | Location | Notes |
|---|---|---|
| Add DB column/setting/cache | `db.ts` | Use additive try/catch migration at top-level. |
| Change sync data model | `scraper.ts`, `db.ts`, `web/index.ts` | Parser -> cache schema -> `/sync` write path. |
| Rating formula/constant lookup | `constants.ts` | International data takes priority over JP data. |
| simai 채보 문법/타이밍 | `simai/parse.ts`, `simai/types.ts` | 순수 함수. 브라우저에는 결과 `Chart` JSON 만 넘긴다 — 파서를 클라이언트로 옮기지 말 것. |
| 채보 공급원 | `simai/source.ts` | `resolveChart("<공급원>:<id>")`. 못 주는 이유는 `ChartUnavailableError.reason` 으로 구분한다. |
| mai-notes 인덱스 | `mainotes/index.ts`, `mainotes/client.ts` | manifest 하루 1회 + ETag 조건부. 조회는 전부 메모리 인덱스에서. |
| Config shape/defaults | `config.ts`, `config.json.example` | Root `config.json`, not env, is canonical. |
| Encryption-key behavior | `crypto.ts` | Blank key writes generated value back to config. |
| Font render failures | `fonts.ts`, `bot/utils/ratingCard.ts` | Fonts cache under `{DATA_DIR}/fonts/`. |
| Legacy login code | `auth.ts` | Keep separate unless explicitly restoring credential login. |

## CONVENTIONS

- Keep shared files framework-free. Web uses raw `http`; bot uses `discord.js`; shared modules should not depend on either unless already established.
- `db.ts` owns all table creation and migrations at import time. Add columns with `ALTER TABLE ... ADD COLUMN` in `try/catch`; never drop/rename.
- Store user-specific web access via `sync_token`; routes resolve it through `findUserBySyncToken`.
- Session settings live on `sessions`: `profile_private`, `extra_bookmarklets`, `preset_bookmarklets`.
- `profile_private` default is public (`0`); `getProfilePrivate()` treats missing/null as public.
- Bookmarklet presets are stored as JSON ID arrays in `preset_bookmarklets`, not as dedicated per-preset columns.
- Constants cache survives restarts in `constants_cache`; network failure at startup should remain non-fatal.

## ANTI-PATTERNS

- Do not persist SEGA credentials or revive `auth.ts` without an explicit product decision.
- Do not validate internal objects defensively when parser/domain contracts already guarantee shape; validate only external JSON/HTML boundaries.
- Do not replace additive schema migration with a framework or destructive migration.
- Do not assume DX NET CSS selectors are stable. Preserve debug dump workflow for scraper failures.
- Do not hardcode production URLs outside `config.json`/`getBaseUrl` flow.

## VALIDATION

```bash
npm run build
npm run dev:web   # local web-only smoke check
```

No unit tests exist. For parser changes, use saved/generated `debug_*.html` snapshots and a local driver or `/sync` manual run.
