# Remote deployment

Set `POSTGRES_PASSWORD`, `DATABASE_URL`, and `CF_TUNNEL_TOKEN` in `.env`, then:

```sh
docker compose up -d
```

Compose runs PostgreSQL, the bot, and cloudflared. Numbered idempotent
PostgreSQL migrations run during bot startup; `DATABASE_URL` is required.
There is no SQLite import or rollback path.

During a domain migration, `.env` also needs `CF_TUNNEL_TOKEN_OLD` set to the
retiring tunnel's token, and `CF_TUNNEL_TOKEN` rotated to the new tunnel's
token — see `cloudflared-old` in `docker-compose.yml`. Remove both the
`.env` entry and the `cloudflared-old` service once the migration cutoff
(`DOMAIN_MIGRATION_CUTOFF` in `src/web/index.ts`) has passed.

For local development:

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```
