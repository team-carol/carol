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

## Discord Activity (chart player inside Discord)

Optional. Without it the bot works as before and `/보면` shows no "디스코드에서 보기" button.
In the Discord Developer Portal, for each application (dev and production bots are separate):

1. **Activities → Settings**: enable Activities. Discord creates the Entry Point command ("Launch"); `syncCommands` keeps it on every global command sync.
2. **Activities → URL Mappings**: root mapping `/` → the bot's public host without protocol (production: `maimai.team-carol.com`). The page lives at `/activity`; a root request carrying `frame_id` is redirected there.
3. **Activities → Settings → Supported Platforms**: tick iOS and Android to allow mobile.

Then restart the bot or press "디스코드에 반영" in /관리 → 명령어 so it re-reads the application flags.

For local development:

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```
