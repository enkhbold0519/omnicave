# CellarOS — production deployment (AWS EC2 + RDS, Docker)

The backend and the database are separate layers. The server runs only the API; it keeps no data.

```
 display (Vercel) / mobile apps / edge agent
            │  https://<SITE_ADDRESS>
            ▼
 ┌──────── EC2 (Docker Compose) ────────┐        ┌──────── RDS ─────────┐
 │ caddy  :80/:443  Let's Encrypt HTTPS │        │ PostgreSQL 17        │
 │   └─► api  FastAPI (../backend)      │──5432─►│ private, daily       │
 └──────────────────────────────────────┘        │ backups kept 7 days  │
                                                 └──────────────────────┘
```

- If the server breaks, start a new one and point it at the same database: nothing is lost.
- The database is not reachable from the internet, only from the server.

| File | Purpose |
|---|---|
| `docker-compose.yml` | the two services on the server (`caddy`, `api`) |
| `Caddyfile` | HTTPS reverse proxy to the API |
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

   Do **not** open 8000. The API is reachable only through Caddy.
3. **Elastic IP**: EC2 → Elastic IPs → Allocate → Associate with the instance.
   The address then survives stop/start. Example below: `3.35.12.34`.

**Host name without a domain:** `3-35-12-34.sslip.io` resolves to `3.35.12.34`, and Let's Encrypt issues a real certificate for it.
With a domain later, add an A record pointing at the Elastic IP, change `SITE_ADDRESS`, then `docker compose up -d`.

## 2. Create the database (RDS, same region as the server)

**RDS → Create database → Standard create**

| Setting | Value |
|---|---|
| Engine | **PostgreSQL**, version **17.x** |
| Template | Free tier or Dev/Test (single instance, no Multi-AZ) |
| DB instance identifier | `omnicave-db` |
| Master username | `cellar` |
| Credentials | Self managed; password of letters and digits only (`openssl rand -hex 24`) |
| Instance class | **db.t4g.micro** |
| Storage | gp3, 20 GB |
| Connectivity → Compute resource | **Connect to an EC2 compute resource** → choose the `cellaros` instance |
| Public access | **No** |
| Additional configuration → Initial database name | **`cellar`** (without it no database is created) |
| Additional configuration → Backup retention | 7 days |

"Connect to an EC2 compute resource" puts the database in the server's network and creates the two security groups
that allow port 5432 **from the server only**. (By hand: give the database a security group whose only inbound rule is
PostgreSQL 5432 with the server's security group as the source.)

When the status is *Available*, copy the **Endpoint** from the database's *Connectivity & security* tab, e.g.
`omnicave-db.abc123xyz.ap-northeast-2.rds.amazonaws.com`.

## 3. Install Docker on the server (once)

```bash
ssh -i cellaros.pem ubuntu@3.35.12.34

curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
exit                        # log in again so the group applies
```

## 4. Get the code and configure

```bash
git clone <repo-url> cellaros && cd cellaros
git checkout test-deployment               # or main once merged
cd deploy
cp .env.production.example .env
nano .env                                   # SITE_ADDRESS, DATABASE_URL (endpoint + password from step 2), OPENAI_API_KEY, ...
chmod 600 .env
```

## 5. Start

```bash
docker compose up -d --build
docker compose ps                           # both services "running" / "healthy"
docker compose logs -f caddy                # wait for "certificate obtained successfully"
curl https://3-35-12-34.sslip.io/api/health
```

The backend creates its tables in the empty database on first start.
API docs: `https://<SITE_ADDRESS>/docs`. The containers restart on their own after a crash or reboot.

## 6. Point the clients at it

| Client | How |
|---|---|
| webOS display (Vercel) | environment variable `VITE_API_BASE=https://3-35-12-34.sslip.io`, then redeploy |
| webOS display (TV package) | `VITE_API_BASE=https://3-35-12-34.sslip.io npm run build` in `webos/wine-cellar-display`, then `npm run webos:package` |
| Kotlin app | `API_BASE=https://3-35-12-34.sslip.io` in `Mobile/Kotlin/local.properties` |
| Edge agent | `python edge_agent.py --server https://3-35-12-34.sslip.io` |

---

## Moving an existing server to RDS (one time)

For a server that still runs the old stack with the database in a `db` container. Do the steps in this order:
the dump must be taken **before** the new compose file arrives, because it no longer has the `db` service.

```bash
cd ~/cellaros/deploy

# 1. stop the API so nothing changes during the move, then dump the old database
docker compose stop api
docker compose exec -T db pg_dump -U cellar --format=custom --no-owner cellar > ~/cellar.dump
ls -lh ~/cellar.dump                        # must not be empty

# 2. load it into RDS (endpoint and password from "Create the database")
docker run --rm -i -e PGPASSWORD='<rds-password>' postgres:17 \
  pg_restore -h <rds-endpoint> -U cellar -d cellar --no-owner --clean --if-exists < ~/cellar.dump

# 3. check that the data arrived
docker run --rm -e PGPASSWORD='<rds-password>' postgres:17 \
  psql -h <rds-endpoint> -U cellar -d cellar -c "select count(*) from users;"

# 4. switch the server to the new stack
git pull
nano .env                                   # add DATABASE_URL (see .env.production.example); POSTGRES_PASSWORD and BACKUP_* are no longer used
docker compose up -d --build --remove-orphans      # removes the old db and backup containers
curl https://<SITE_ADDRESS>/api/health
```

Log in with an existing account to confirm. The old data is still on the server in the Docker volume `cellaros_pgdata`
and in `~/cellar.dump`; once everything works, remove them: `docker volume rm cellaros_pgdata && rm ~/cellar.dump`.

---

## Everyday operations

```bash
# update to the latest code
cd ~/cellaros && git pull && cd deploy && docker compose up -d --build

# logs
docker compose logs -f api

# change settings: edit .env, then
docker compose up -d
```

### Stopping to save money

- **Server:** stop the EC2 instance; the Elastic IP keeps its address (and is still billed).
- **Database:** RDS → Actions → Stop temporarily. AWS **starts it again by itself after 7 days**, so stop it again if it is still not needed.
- Start the database first, then the server. If the API started while the database was down, it keeps restarting until it can connect.

### Backups and restore

- RDS takes a backup every day and keeps 7 days (RDS → the database → *Maintenance & backups*).
- Before a risky change: RDS → Actions → **Take snapshot**.
- Restore: RDS → Automated backups (or Snapshots) → **Restore**. This creates a **new** database instance with a new endpoint;
  put that endpoint into `DATABASE_URL` in `.env`, then `docker compose up -d`.

### Database shell

```bash
docker run --rm -it -e PGPASSWORD='<rds-password>' postgres:17 psql -h <rds-endpoint> -U cellar -d cellar
```

## Notes

- **Schema changes.** The backend creates its tables on first start. A later change to `SCHEMA` in `backend/app/db.py` needs a
  migration in `db.MIGRATIONS` (PostgreSQL data is never reset). The API refuses to start if one is missing.
- **One API worker** on purpose: the sensor simulator and daily briefing run inside the API process.
- **Demo vs real hardware.** `SIMULATE_SENSORS=1` feeds simulated climate data to cellars without a device. Cellars whose device sends telemetry are never simulated.
- **Secrets** live only in `deploy/.env` on the server. It is git-ignored. Never commit it.
- **Local development is unchanged**: with no `DATABASE_URL`, the backend uses SQLite (`uvicorn app.main:app --reload` in `backend/`).
