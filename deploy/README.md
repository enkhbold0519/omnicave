# OmniCave production deployment

Runs the backend on AWS: an EC2 server with Docker (Caddy for HTTPS in front of the API) and a private PostgreSQL
database on RDS. The server holds no data, so it can be replaced at any time without losing anything.

## Requirements
- An AWS account (region: Seoul, ap-northeast-2)
- An EC2 instance: Ubuntu 24.04, t3.small, 20 GB, with an Elastic IP; ports 22 (your IP), 80 and 443 open
- An RDS database: PostgreSQL 17, db.t4g.micro, not public, connected to the EC2 instance, initial database `cellar`

## Setup
1. On the server, install Docker and get the code:
   ```bash
   curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker ubuntu   # then log in again
   git clone https://github.com/enkhbold0519/omnicave.git cellaros && cd cellaros/deploy
   ```
2. Create the settings file and fill in `SITE_ADDRESS`, `DATABASE_URL` and the AI settings:
   ```bash
   cp .env.production.example .env && chmod 600 .env && nano .env
   ```
   Without a domain, use sslip.io: the IP `3.35.12.34` becomes `3-35-12-34.sslip.io`.
3. Start it and check:
   ```bash
   docker compose up -d --build
   curl https://<SITE_ADDRESS>/api/health
   ```
4. Point the clients at `https://<SITE_ADDRESS>`: `VITE_API_BASE` for the display (Vercel), `API_BASE` in
   `mobile/Kotlin/local.properties` for the Android app. Both need a rebuild after a change.

## Files
| File | What |
|---|---|
| `docker-compose.yml` | The two services: `caddy` (HTTPS) and `api` (built from `../backend`) |
| `Caddyfile` | HTTPS reverse proxy to the API, certificates from Let's Encrypt |
| `.env.production.example` | Settings template for `.env`, which stays on the server and is never committed |

## Notes
- **Update:** `cd ~/cellaros && git pull && cd deploy && docker compose up -d --build`
- **Logs:** `docker compose logs -f api`
- **Backups:** RDS keeps daily backups for 7 days. Restoring creates a new database; put its endpoint into `DATABASE_URL`.
- **Saving money:** stop the server and the database when idle; start the database first. AWS restarts a stopped database after 7 days.
- **Don't rename** the Docker project (`name: cellaros`): Caddy's certificates are stored in its volume.
