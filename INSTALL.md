# Blixbet v2 — VPS Installation Guide

A full-stack crypto casino:
- **Frontend** — React + Vite + Tailwind + shadcn/ui (`artifacts/blixbet`)
- **Backend** — Express 5 + TypeScript + Drizzle ORM + Socket.IO (`artifacts/api-server`)
- **Database** — PostgreSQL 14+ with `pg_trgm` extension
- **Payments** — NOWPayments (crypto deposits + mass payouts)
- Single Node process serves the API **and** the static frontend in production.

> **Heads-up:** the repo uses **pnpm workspaces**. Do NOT use `npm install` or `yarn install` at the root — the preinstall script will refuse.

---

## 1. VPS Prerequisites

Tested on Ubuntu 22.04 / Debian 12. Adjust apt commands for other distros.

| Requirement | Version | Why |
|---|---|---|
| **Node.js** | 20 LTS or 22 LTS (24 also works) | Backend runtime |
| **pnpm** | 9 or 10 | Workspace package manager |
| **PostgreSQL** | 14+ (16 recommended) | Application database |
| `pg_trgm` extension | bundled with `postgresql-contrib` | Used for username search |
| **Nginx** (or Caddy) | latest | Reverse proxy + TLS |
| RAM | ≥ 2 GB | API + Postgres + Nginx headroom |
| Disk | ≥ 5 GB free | Source + node_modules + logs |

### One-shot install (Ubuntu/Debian)

```bash
# 1. Node 22 LTS via NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt-get install -y nodejs

# 2. pnpm
sudo npm install -g pnpm@10 pm2

# 3. PostgreSQL 16 + contrib (provides pg_trgm)
sudo apt-get install -y postgresql postgresql-contrib

# 4. Nginx + certbot (TLS)
sudo apt-get install -y nginx certbot python3-certbot-nginx

# 5. unzip
sudo apt-get install -y unzip
```

Verify:
```bash
node -v          # v22.x or v20.x
pnpm -v          # 9.x or 10.x
psql --version   # 14+
nginx -v
```

---

## 2. Extract the Zip

```bash
mkdir -p /opt/blixbet
cd /opt/blixbet
unzip ~/blixbetv2.zip       # extracts the project files here
pnpm install                 # installs ALL workspace dependencies
```

`pnpm install` reads `pnpm-workspace.yaml` and installs the deps for every artifact + library in one pass. First run takes ~2–3 min on a 2-core VPS.

> **Security note:** `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (24 h). Do NOT lower this — it protects you against npm supply-chain attacks. Leave it alone.

---

## 3. Create the Database

```bash
sudo -u postgres psql <<'SQL'
CREATE USER blixbet WITH PASSWORD 'CHANGE_ME_STRONG_PASSWORD';
CREATE DATABASE blixbet OWNER blixbet;
GRANT ALL PRIVILEGES ON DATABASE blixbet TO blixbet;
\c blixbet
CREATE EXTENSION IF NOT EXISTS pg_trgm;
SQL
```

The `pg_trgm` extension is required (used for fuzzy username search in the admin panel). Drizzle migrations rely on it being already enabled.

---

## 4. Configure `.env`

Create **`/opt/blixbet/.env`**:

```env
# ── Database ────────────────────────────────────────────────
DATABASE_URL=postgresql://blixbet:CHANGE_ME_STRONG_PASSWORD@127.0.0.1:5432/blixbet

# ── App secrets — generate fresh strong values ──────────────
SESSION_SECRET=__RUN_THE_COMMAND_BELOW_TO_GENERATE__
JWT_SECRET=__RUN_THE_COMMAND_BELOW_TO_GENERATE__

# ── Server ──────────────────────────────────────────────────
PORT=8080
NODE_ENV=production
LOG_LEVEL=info

# ── NOWPayments (crypto deposits + payouts) ─────────────────
# Get these from https://nowpayments.io after creating an account
# and verifying your store/business.
NOWPAYMENTS_API_KEY=your_api_key
NOWPAYMENTS_IPN_SECRET=your_ipn_secret
NOWPAYMENTS_EMAIL=your_account_email
NOWPAYMENTS_PASSWORD=your_account_password

# ── Object storage (avatars, KYC, banner uploads) ───────────
# For a self-hosted VPS, a local folder is the simplest option.
# The directories will be created on first write.
PRIVATE_OBJECT_DIR=/opt/blixbet/storage/private
PUBLIC_OBJECT_SEARCH_PATHS=/opt/blixbet/storage/public
DEFAULT_OBJECT_STORAGE_BUCKET_ID=local
```

Generate strong secrets:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
# run twice — once for SESSION_SECRET, once for JWT_SECRET
```

Lock down the file:
```bash
chmod 600 /opt/blixbet/.env
mkdir -p /opt/blixbet/storage/private /opt/blixbet/storage/public /opt/blixbet/logs
```

---

## 5. Push the Schema

```bash
cd /opt/blixbet
pnpm --filter @workspace/db run push
```

This creates every table the app needs and runs the bundled extension installer. If it complains about a missing extension, recheck step 3.

---

## 6. Build the App

```bash
cd /opt/blixbet
pnpm run build
```

This produces:
- `artifacts/api-server/dist/index.mjs` — bundled Node server
- `artifacts/blixbet/dist/` — static frontend assets served by the API server

---

## 7. Run It

### Option A — PM2 (recommended)

A ready-to-use `ecosystem.config.cjs` is included at the repo root.

```bash
cd /opt/blixbet
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup        # follow the printed command to enable auto-start on reboot
pm2 logs blixbet   # tail logs
pm2 status
```

Restart after code changes: `pm2 restart blixbet`.

### Option B — systemd

Create `/etc/systemd/system/blixbet.service`:
```ini
[Unit]
Description=Blixbet Casino
After=network.target postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/blixbet
EnvironmentFile=/opt/blixbet/.env
ExecStart=/usr/bin/node --enable-source-maps artifacts/api-server/dist/index.mjs
Restart=always
RestartSec=5
StandardOutput=append:/opt/blixbet/logs/out.log
StandardError=append:/opt/blixbet/logs/err.log

[Install]
WantedBy=multi-user.target
```

```bash
sudo chown -R www-data:www-data /opt/blixbet
sudo systemctl daemon-reload
sudo systemctl enable --now blixbet
sudo systemctl status blixbet
```

The server will be listening on `http://127.0.0.1:8080` (the `PORT` from `.env`).

---

## 8. Nginx Reverse Proxy + TLS

Create `/etc/nginx/sites-available/blixbet`:

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Allow large avatar / KYC uploads
    client_max_body_size 25M;

    location / {
        proxy_pass         http://127.0.0.1:8080;
        proxy_http_version 1.1;

        # Required for Socket.IO + the Crash WebSocket
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";

        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   X-Forwarded-Host  $host;

        # Long timeout for live game sockets
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
```

Enable + reload + add HTTPS:
```bash
sudo ln -s /etc/nginx/sites-available/blixbet /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Certbot will rewrite the server block to add HTTPS (port 443) automatically.

---

## 9. Configure NOWPayments IPN

Once your domain is live over HTTPS, set the IPN callback in the NOWPayments dashboard to:

```
https://yourdomain.com/api/payment/nowpayments/ipn   # deposits
https://yourdomain.com/api/payout/ipn                # payouts
```

These webhooks are signed with `NOWPAYMENTS_IPN_SECRET`; the server verifies the signature and rejects anything else.

---

## 10. First Admin Account

1. Open `https://yourdomain.com`, click **Register**, create your first account.
2. Promote it to admin from `psql`:

   ```bash
   sudo -u postgres psql -d blixbet -c \
     "UPDATE users SET role='admin' WHERE username='your_username';"
   ```

3. Refresh the page. The **Admin** menu link will now be visible.
4. From the admin panel:
   - **Settings** → set min/max deposit, withdrawal limits, fees, branding text, socials.
   - **Roles** → fine-grained permissions for sub-admins (25 distinct permissions).
   - **Games** → adjust min/max bet per game (changes broadcast in real time over WS).
   - **Payment** → verify NOWPayments connection.

---

## 11. Updating to a Newer Build

```bash
cd /opt/blixbet
# back up the .env first!
cp .env .env.backup

# unzip the new release on top (keep storage/, logs/, .env)
unzip -o ~/blixbetv2-new.zip

pnpm install                                    # in case deps changed
pnpm --filter @workspace/db run push            # in case schema changed
pnpm run build
pm2 restart blixbet                             # or: systemctl restart blixbet
```

---

## 12. What's in This Build (v2)

The v2 release includes everything in v1 plus:

- **Crypto deposit UX overhaul** — grouped multi-network currency selector (USDT TRC20 / ERC20 / BEP20 etc. collapsed under a single token), real NOWPayments error messages instead of generic "Network error", deposit min auto-fills from admin settings, no rate-limit blocking for first-time deposits.
- **Admin: Resend Failed Payouts** — every withdrawal whose NOWPayments payout came back `REJECTED`, `FAILED`, or `EXPIRED` (and hasn't been refunded) gets a **↻ Resend Payout** button. Re-attempts the on-chain transfer; archives the previous attempt into `metadata.payout_history[]`; refuses if the user has already been refunded so funds can never be sent twice.
- **Admin: real-time game config + platform settings** — bet limits, branding, socials, fees update across every connected client within ~1 second via Socket.IO `/public` namespace.
- **Admin: Players hard-delete + bonus tracking** — granular delete that wipes a user across every dependent table inside one DB transaction; per-user `totalBonusClaimed` pill in the players table.
- **Admin: 25 granular permissions** for sub-admin roles.
- **Real-money safety** — all currency arithmetic uses integer cents (`lib/currency.ts`); ACID-compliant wallet transactions; secure single-use bet sessions; comprehensive rate-limit tiers.
- **Mobile improvements** — withdrawal-locked notice spacing, deposit modal alignment, full-screen modals, mobile-friendly admin tables.

---

## 13. Folder Map

```
/opt/blixbet/
├── artifacts/
│   ├── api-server/        ← Express + Socket.IO + Drizzle
│   │   ├── src/routes/    ← REST endpoints (wallet, payout, admin, games…)
│   │   ├── src/lib/       ← game RNG, NOWPayments client, currency math…
│   │   └── dist/          ← built bundle (created by pnpm run build)
│   ├── blixbet/           ← React + Vite frontend
│   │   ├── src/pages/     ← Home, Crash, Mines, Admin, Profile, Rewards…
│   │   ├── src/components/← Shared UI + Deposit/Withdraw modals
│   │   └── dist/          ← built static assets (served by the API server)
│   └── mockup-sandbox/    ← optional component playground (not deployed)
├── lib/
│   ├── db/                ← Drizzle schema + migration entry point
│   ├── api-spec/          ← OpenAPI contract
│   ├── api-zod/           ← generated Zod validators
│   └── api-client-react/  ← generated React Query hooks
├── scripts/               ← one-off utility scripts
├── storage/               ← (created by you) local object storage
│   ├── private/           ← KYC docs, internal uploads
│   └── public/            ← avatars, banners
├── logs/                  ← (created by you) PM2/systemd logs
├── ecosystem.config.cjs   ← PM2 config
├── .env                   ← (created by you) secrets — chmod 600
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml         ← commit/keep this so installs are reproducible
└── INSTALL.md             ← you are here
```

---

## 14. Common Issues

**`pnpm install` fails with "Use pnpm instead"**
You ran `npm install`. Use `pnpm install`.

**`relation "users" does not exist` after deploy**
You forgot step 5. Run `pnpm --filter @workspace/db run push`.

**`pg_trgm` extension errors on schema push**
Step 3 was skipped. Run `CREATE EXTENSION pg_trgm;` against the database as a Postgres superuser.

**WebSocket disconnects / Crash game frozen**
Your reverse proxy is missing the `Upgrade` / `Connection: upgrade` headers. Re-check the Nginx block in step 8 and reload Nginx.

**Crypto deposits show "Configuration error"**
NOWPayments env vars are missing or wrong. Verify `.env`, then `pm2 restart blixbet`.

**NOWPayments IPN never arrives**
The IPN URL in the NOWPayments dashboard must point at your **public HTTPS** URL (step 9). Localhost / IP-only URLs won't work because NOWPayments servers can't reach them.

**Port 8080 already in use**
Change `PORT` in `.env` (and `ecosystem.config.cjs`'s `env.PORT`) and the Nginx `proxy_pass`. Reload all three.

**Admin panel says "Forbidden" everywhere**
You haven't been promoted to `admin` yet (step 10) or the JWT issued before promotion is cached — log out and log back in.

**Memory grows over time**
PM2 is configured with `max_memory_restart: 512M` — it will auto-restart if the process exceeds 512 MB. Adjust in `ecosystem.config.cjs` if your VPS has more headroom.

**Failed payout — money "stuck"**
With v2 you no longer have to manually refund. Open **Admin → Withdrawals**, find the row with the red `REJECTED`/`FAILED`/`EXPIRED` payout pill, and click **↻ Resend Payout**. The retry only fires while the user's balance is still debited; once an IPN refund has run, the button is hidden.

---

## 15. Backups

Daily Postgres dump + storage rsync (cron — `crontab -e`):

```cron
15 3 * * *  pg_dump -U blixbet -h 127.0.0.1 blixbet | gzip > /var/backups/blixbet-$(date +\%F).sql.gz
30 3 * * *  rsync -a /opt/blixbet/storage/ /var/backups/blixbet-storage/
```

Keep at least 7 days of dumps off the VPS (S3, Backblaze B2, etc.).

---

## 16. Security Checklist

- [ ] `.env` is `chmod 600`, owned by the service user.
- [ ] Default Postgres password changed; `pg_hba.conf` only allows local connections (or IP-restricted).
- [ ] UFW / iptables: only 22, 80, 443 open to the world.
- [ ] HTTPS via Let's Encrypt (step 8) — auto-renews via certbot's systemd timer.
- [ ] Admin account uses a strong password; consider a sub-admin role for daily ops instead of using the root admin.
- [ ] NOWPayments IPN secret kept private; rotate if leaked.
- [ ] PM2/systemd is started as a non-root user (`www-data` in the example).
- [ ] Backups verified by doing a test restore at least once.

---

That's it. After step 8 the casino is live at `https://yourdomain.com`. Tail logs with `pm2 logs blixbet` (or `journalctl -u blixbet -f`) and watch the admin panel for activity.
