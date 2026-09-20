# Deployment

---

## Before you start

You need a host with Docker and Compose v2, a domain pointed at it, and ports 80
and 443 reachable. Two CPUs and 4 GB of RAM is a sensible starting point;
media proxying is I/O-bound rather than CPU-bound, so bandwidth matters more
than cores.

---

## 1. Get the code and configure it

```bash
git clone <your-repository> anizora
cd anizora
cp .env.example .env
```

Generate three **different** secrets:

```bash
for i in 1 2 3; do
  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
done
```

Edit `.env`:

```env
NODE_ENV=production

SITE_NAME=YourBrand
SITE_URL=https://yourdomain.example
NEXT_PUBLIC_SITE_NAME=YourBrand
NEXT_PUBLIC_SITE_URL=https://yourdomain.example
NEXT_PUBLIC_API_URL=https://yourdomain.example/api
CORS_ORIGINS=https://yourdomain.example

POSTGRES_PASSWORD=<strong password>
DATABASE_URL=postgresql://anizora:<same password>@postgres:5432/anizora?schema=public

JWT_ACCESS_SECRET=<secret 1>
JWT_REFRESH_SECRET=<secret 2>
MEDIA_SIGNING_SECRET=<secret 3>

ADMIN_EMAIL=you@yourdomain.example
ADMIN_PASSWORD=<strong password>

SWAGGER_ENABLED=false

MAIL_DRIVER=smtp
MAIL_HOST=smtp.yourprovider.example
MAIL_PORT=587
MAIL_USER=<smtp user>
MAIL_PASSWORD=<smtp password>
MAIL_FROM_ADDRESS=no-reply@yourdomain.example
```

> `NEXT_PUBLIC_API_URL` points at `/api` on your own domain because nginx puts
> both services behind one origin. That removes CORS from the picture entirely
> and lets media stream from the same host that served the page.

---

## 2. Drive credentials

If you are serving media from Google Drive (see [GOOGLE_DRIVE.md](GOOGLE_DRIVE.md)):

```bash
mkdir -p secrets
# copy your service-account JSON to secrets/google-service-account.json
chmod 600 secrets/google-service-account.json
```

Uncomment the mount in `docker-compose.yml`:

```yaml
backend:
  volumes:
    - uploads-data:/app/storage/uploads
    - ./secrets/google-service-account.json:/run/secrets/google-service-account.json:ro
```

```env
GOOGLE_DRIVE_ENABLED=true
GOOGLE_DRIVE_AUTH_MODE=service_account
GOOGLE_SERVICE_ACCOUNT_FILE=/run/secrets/google-service-account.json
```

`secrets/` is already in `.gitignore`. Keep it that way.

---

## 3. Build and start

```bash
docker compose up --build -d
docker compose ps
docker compose logs -f backend
```

Migrations run automatically from the container entrypoint. To create the
super-admin and (optionally) demo content on the very first start:

```bash
docker compose exec backend npx prisma db seed
```

On a production deployment you usually want the admin account but **not** the
demo catalogue. Sign in, then archive the demo titles from **Admin → Anime**.

---

## 4. TLS

Obtain certificates:

```bash
sudo apt install certbot
sudo certbot certonly --standalone -d yourdomain.example
sudo mkdir -p nginx/certs
sudo cp /etc/letsencrypt/live/yourdomain.example/fullchain.pem nginx/certs/
sudo cp /etc/letsencrypt/live/yourdomain.example/privkey.pem  nginx/certs/
```

Mount them:

```yaml
nginx:
  volumes:
    - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    - ./nginx/conf.d:/etc/nginx/conf.d:ro
    - ./nginx/certs:/etc/nginx/certs:ro
```

Uncomment the `443` server block in `nginx/conf.d/anizora.conf`, copy the
`location` blocks into it, add an HTTP→HTTPS redirect, then:

```bash
docker compose --profile proxy up -d
```

Renewal:

```bash
0 3 * * 1 certbot renew --quiet --deploy-hook "cd /path/to/anizora && docker compose restart nginx"
```

---

## 5. Verify

```bash
curl -fsS https://yourdomain.example/api/health | jq
```

Then check by hand:

- [ ] Homepage loads and the hero rotates
- [ ] Browse filters and pagination work
- [ ] An episode plays, and **seeking works**
- [ ] Quality switching preserves position
- [ ] Audio switching preserves position
- [ ] Subtitles render and the styling controls apply
- [ ] Register, sign in, password reset email arrives
- [ ] Watchlist, rating and comment all persist
- [ ] Admin dashboard loads and shows real numbers
- [ ] `/admin` is rejected for a normal account
- [ ] `robots.txt` and `sitemap.xml` are served

---

## Updating

```bash
git pull
docker compose up --build -d
```

Migrations apply on start. Take a backup first:

```bash
docker compose exec -T postgres pg_dump -U anizora anizora | gzip > pre-deploy.sql.gz
```

---

## Scaling

**Move media off Drive first.** It is the bottleneck that will bite soonest —
Drive enforces per-file download quotas and all of that bandwidth passes through
your server. Object storage plus a CDN is the single highest-impact change, and
[GOOGLE_DRIVE.md](GOOGLE_DRIVE.md) explains that it is a data migration, not a
rewrite.

After that:

```bash
docker compose up -d --scale backend=3
```

The API is stateless — sessions live in the database, not in memory — so it
scales horizontally without further work. Add `REDIS_ENABLED=true` so throttling
and caching are shared across instances. Move PostgreSQL to a managed service
with automated backups when it becomes worth it.

---

## Operations

```bash
docker compose logs -f backend
docker compose logs -f frontend
docker stats
docker compose restart backend
docker compose down          # stop, keep data
docker compose down -v       # stop and DELETE ALL DATA
```

Health endpoints, suitable for an uptime monitor:

- `https://yourdomain.example/api/health` — includes database connectivity
- `https://yourdomain.example/api/healthz` — frontend liveness

---

## Troubleshooting

**Backend restarts in a loop.** Almost always the database. `docker compose logs
backend` will show the migration failure. Check `DATABASE_URL` matches
`POSTGRES_PASSWORD`.

**Frontend shows empty pages.** `NEXT_PUBLIC_API_URL` is wrong, or was changed
without rebuilding — it is compiled into the browser bundle at build time.
`docker compose build frontend --no-cache`.

**CORS errors.** `CORS_ORIGINS` must contain the exact origin including scheme.
Behind nginx on one origin, this should not arise at all.

**Video will not play in production but works locally.** Check
`MEDIA_SIGNING_SECRET` is set and identical across backend instances — a signed
link minted by one instance must verify on another.

**Seeking is broken behind nginx.** `proxy_buffering off` must be set on the
`/api/media/` location. It already is in the supplied config; check it survived
any edits.
