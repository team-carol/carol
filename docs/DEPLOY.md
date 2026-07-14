# Remote deployment

Copy `.env.example` to `.env`, replace every placeholder (especially
`POSTGRES_PASSWORD`, `DATABASE_URL`, and `CF_TUNNEL_TOKEN`), then run:

```sh
docker compose up -d
```

Compose starts PostgreSQL with the persistent `carol-postgres` volume, waits
for its health check, and runs `migrate` once. The migration imports the
existing `./data/maimai.db` read-only when present and records completion in
PostgreSQL. The bot starts only after that job succeeds; cloudflared starts
only after the bot health check succeeds. Re-running `up -d` is therefore
safe and does not re-import an already bootstrapped database.

Before a PostgreSQL cutover, stop the old SQLite bot. The migrator copies the
database and any `-wal`/`-shm` sidecars into a private writable staging
directory and backs it up there, then imports that snapshot. It does not write
the read-only source mount; the source must remain offline while the copy is
made. The migrator never reads `profiles.raw_html` and writes it as
an empty cache; `profiles.rating_card_blob` is also cleared. The rebuildable
`map_images` and `song_jackets` cache tables are intentionally skipped. These
caches repopulate during normal sync/use. Raw HTML is never migrated.

For local development, use the workspace build override instead of the GHCR
release image:

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

This keeps the PostgreSQL/migrate/bot topology but does not start cloudflared
unless the `remote-tunnel` profile is explicitly enabled. The plain
`docker compose up -d` command remains the remote GHCR deployment path.

Rollback: stop the stack, retain the Postgres volume, and restore the previous
image tag. To return to SQLite, remove the Postgres services/environment and
run the bot with its normal `DB_DRIVER=sqlite` default. Do not delete the
named volume unless a complete PostgreSQL reset is intended.
