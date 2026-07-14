# Remote deployment

Set `POSTGRES_PASSWORD`, `DATABASE_URL`, and `CF_TUNNEL_TOKEN` in `.env`, then:

```sh
docker compose up -d
```

Compose runs PostgreSQL, the bot, and cloudflared. Numbered idempotent
PostgreSQL migrations run during bot startup; `DATABASE_URL` is required.
There is no SQLite import or rollback path.

For local development:

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```
