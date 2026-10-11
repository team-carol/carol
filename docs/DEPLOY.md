# Remote deployment

Set `POSTGRES_PASSWORD`, `DATABASE_URL`, and `CF_TUNNEL_TOKEN` in `.env`, then:

```sh
docker compose up -d --remove-orphans
```

Compose runs PostgreSQL, the bot, and cloudflared. Numbered idempotent
PostgreSQL migrations run during bot startup; `DATABASE_URL` is required.
There is no SQLite import or rollback path.

Old-domain support ended on 2026-10-01. The temporary `cloudflared-old`
service has been removed; `--remove-orphans` also removes its existing
`carol-tunnel-old` container when deploying the updated Compose file.
Remove `CF_TUNNEL_TOKEN_OLD` from the deployment host's `.env` and delete
the retired tunnel and its old-domain DNS record in Cloudflare. Keep
`CF_TUNNEL_TOKEN` set to the current domain's tunnel token.

For local development:

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```
