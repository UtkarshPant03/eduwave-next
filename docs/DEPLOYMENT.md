# Deployment

Everything below uses free, open-source software. Nothing requires a paid service.

## Modes (`EDUWAVE_ENV`)

| Mode | When | Database | Sample data | HTTPS |
|---|---|---|---|---|
| `development` | `npm run dev` (default) | PGlite | allowed | not needed |
| `local` | a production build on one machine: tests, labs, demos | PGlite or PostgreSQL | allowed | not needed |
| `production` | the default whenever `NODE_ENV=production` | **PostgreSQL required** | **refused** | **required** (`APP_URL=https://…`) |

**Production is secure by default.** The server refuses to start with an unsafe configuration and prints why. It never silently falls back to the local database.

## Requirements

| Component | Minimum |
|---|---|
| Node.js | 20 or newer (tested on 22) |
| PostgreSQL | 15 or newer (tested on 17 and 18) |
| Reverse proxy | Nginx or Caddy, for HTTPS |
| Sizing | One app server with 2 vCPU / 4 GB RAM is comfortable for a department of a few thousand students. Files are stored in PostgreSQL, so size its disk for uploads (8 MB cap per file). |

## Production install

The example uses Ubuntu, Caddy and systemd. Any equivalent works.

```bash
# 1. Database (as postgres)
createuser --pwprompt eduwave_app
createdb --owner eduwave_app eduwave

# 2. App
git clone https://github.com/<you>/eduwave-next.git /opt/eduwave && cd /opt/eduwave
npm ci
cp .env.production.example /etc/eduwave/eduwave.env   # fill in real values; chmod 600
set -a; . /etc/eduwave/eduwave.env; set +a
npm run build
npm run db:migrate
npm run create-admin -- it.office@example.edu "Office of Academic IT"   # prints a one-time password
```

```ini
# /etc/systemd/system/eduwave.service
[Unit]
Description=eduWave LMS
After=network.target

[Service]
WorkingDirectory=/opt/eduwave
EnvironmentFile=/etc/eduwave/eduwave.env
ExecStart=/usr/bin/npm start -- -p 3000
User=eduwave
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```caddyfile
# /etc/caddy/Caddyfile: automatic HTTPS (Let's Encrypt, free)
lms.example.edu {
  reverse_proxy 127.0.0.1:3000
}
```

Set `TRUSTED_PROXY_HOPS=1` when exactly one proxy (Caddy or Nginx) sits in front of the app.

**Never run `npm run db:seed` in production.** It refuses, and the app also refuses to start if the sample accounts exist.

## Updating

```bash
npm run db:backup                     # always first
git pull && npm ci && npm run build
npm run db:migrate                    # stops without changes if existing data violates a new rule (see docs/DATABASE.md)
systemctl restart eduwave
```

## Backups

- **Schedule:** run `npm run db:backup` nightly with cron or systemd timers. It needs the free PostgreSQL client tools (`pg_dump`).
- **Copy off the server:** a backup on the same disk is lost with the disk.
- **Test it:** restore on a spare machine once per term. Details are in `docs/DATABASE.md`.

## Optional services

| Service | How to enable | Notes |
|---|---|---|
| Email (SMTP) | Set `SMTP_HOST`, `SMTP_USER` and `SMTP_PASS`. | Any SMTP server works. |
| Video (Jitsi) | Self-host Jitsi and set `JITSI_DOMAIN`. | Enable JWT authentication for moderated classes. |
| AI (Ollama) | Set `OLLAMA_URL` **before building**. | The navigation is prerendered at build time. |

## Production checklist

| Check | Requirement |
|---|---|
| Database | `EDUWAVE_ENV=production` and a `DATABASE_URL` pointing at PostgreSQL with a dedicated role. |
| Address | `APP_URL` uses `https://`, and the proxy terminates TLS. |
| Client IPs | `TRUSTED_PROXY_HOPS` matches the number of proxies you run. |
| Accounts | The first admin was created with `create-admin`, and no sample data exists. |
| Backups | Nightly, copied off-site, with a tested restore. |
| Server | OS packages are updated, and the database port is not exposed to the internet. |
| CI | Green on the deployed commit (`.github/workflows/ci.yml`). |

## Not provided (yet)

- **Docker image:** not provided, because no Docker environment was available to test one. The systemd steps above are verified only to the extent described in `docs/TESTING.md`.
- **Horizontal scaling:** several app instances can share one PostgreSQL database. Sessions and rate limits live in the database, so no sticky sessions are needed. This has not been load-tested.
