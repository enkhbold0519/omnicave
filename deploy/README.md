# CellarOS — production deployment (AWS EC2 + Docker)

One small server runs the whole backend:

```
 display / mobile apps / edge agent
            │  https://<SITE_ADDRESS>
            ▼
 ┌──────── EC2 (Docker Compose) ────────┐
 │ caddy  :80/:443  Let's Encrypt HTTPS │
 │   └─► api  FastAPI (../backend)      │
 │         └─► db  PostgreSQL 17        │──► volume pgdata
 │ backup  nightly pg_dump, 14 days     │──► ./backups
 └──────────────────────────────────────┘
```

| File | Purpose |
|---|---|
| `docker-compose.yml` | the four services above |
| `Caddyfile` | HTTPS reverse proxy to the API |
| `backup.sh` | nightly backup loop (also `now` for a manual backup) |
| `.env.production.example` | settings template → copy to `.env` |

All commands below run on the server inside `deploy/` unless noted.

---

## 1. Create the server (AWS console, region **Seoul ap-northeast-2**)

1. **EC2 → Launch instance**
   - Name `cellaros`
   - AMI **Ubuntu Server 24.04 LTS** (22.04 works the same)
   - Type **t3.small** (2 vCPU, 2 GB RAM)
   - Key pair: create one, download the `.pem`
   - Storage: **20 GB gp3**
2. **Security group** (inbound rules):

   | Type | Port | Source |
   |---|---|---|
   | SSH | 22 | **My IP** only (add each teammate's IP if needed) |
   | HTTP | 80 | 0.0.0.0/0 (Let's Encrypt check + redirect to https) |
   | HTTPS | 443 | 0.0.0.0/0 |
   | Custom UDP | 443 | 0.0.0.0/0 (optional, HTTP/3) |

   Do **not** open 8000 or 5432. The API and database are reachable only through Caddy.
3. **Elastic IP**: EC2 → Elastic IPs → Allocate → Associate with the instance.
   The address then survives stop/start. Example below: `3.35.12.34`.

**Host name without a domain:** `3-35-12-34.sslip.io` resolves to `3.35.12.34`, and Let's Encrypt issues a real certificate for it.
With a domain later, add an A record pointing at the Elastic IP, change `SITE_ADDRESS`, then `docker compose up -d`.

Rough cost: t3.small + 20 GB + public IPv4 ≈ US$20–25 per month while running. **Stop** the instance when you don't need it (the Elastic IP is still billed).

## 2. Install Docker (once)

```bash
ssh -i cellaros.pem ubuntu@3.35.12.34

curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
exit                        # log in again so the group applies
```

## 3. Get the code and configure

```bash
git clone <repo-url> cellaros && cd cellaros
git checkout webos-further-development     # or main once merged
cd deploy
cp .env.production.example .env
openssl rand -hex 24                        # paste as POSTGRES_PASSWORD
nano .env                                   # SITE_ADDRESS, POSTGRES_PASSWORD, OPENAI_API_KEY, ...
chmod 600 .env
```

## 4. Start

```bash
docker compose up -d --build
docker compose ps                           # all services "running" / "healthy"
docker compose logs -f caddy                # wait for "certificate obtained successfully"
curl https://3-35-12-34.sslip.io/api/health
```

API docs: `https://<SITE_ADDRESS>/docs`. The containers restart on their own after a crash or reboot.

## 5. Point the clients at it

| Client | How |
|---|---|
| webOS display (build) | `cd webos\wine-cellar-display` then `set VITE_API_BASE=https://3-35-12-34.sslip.io` and `npm run webos:deploy` (PowerShell: `$env:VITE_API_BASE="https://..."`) |
| webOS display (no rebuild) | Profile → About → *Server address* |
| Mobile apps | API base URL `https://3-35-12-34.sslip.io` |
| Edge agent | `python edge_agent.py --server https://3-35-12-34.sslip.io` |

## Everyday operations

```bash
# update to the latest code
cd ~/cellaros && git pull && cd deploy && docker compose up -d --build

# logs
docker compose logs -f api

# change settings: edit .env, then
docker compose up -d
```

### Backups

- Every night at `BACKUP_AT` (default 03:00 KST) → `deploy/backups/cellar-YYYY-MM-DD_HHMM.dump`; files older than `BACKUP_KEEP_DAYS` (14) are deleted.
- Backup right now: `docker compose exec backup sh /backup.sh now`
- Copy one to your PC: `scp -i cellaros.pem ubuntu@3.35.12.34:cellaros/deploy/backups/<file>.dump .`
- The backups sit on the same disk as the database. For protection against losing the server, also enable
  **EBS snapshots** (EC2 → Lifecycle Manager → daily policy, keep 7) or copy `backups/` to S3.

### Restore

```bash
docker compose stop api
docker compose exec -T db pg_restore -U cellar -d cellar --clean --if-exists --no-owner < backups/cellar-2026-11-12_0300.dump
docker compose start api
```

### Database shell

```bash
docker compose exec db psql -U cellar cellar
```

## Notes

- **Schema changes.** The backend creates its tables on first start. A later change to `SCHEMA` in `backend/app/db.py` needs a
  migration in `db.MIGRATIONS` (PostgreSQL data is never reset). The API refuses to start if one is missing.
- **One API worker** on purpose: the sensor simulator and daily briefing run inside the API process.
- **Demo vs real hardware.** `SIMULATE_SENSORS=1` feeds simulated climate data to cellars without a device. Cellars whose device sends telemetry are never simulated.
- **Secrets** live only in `deploy/.env` on the server. It is git-ignored. Never commit it.
- **Local development is unchanged**: with no `DATABASE_URL`, the backend uses SQLite (`run-backend.cmd`).
