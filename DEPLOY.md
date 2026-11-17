# Deploying Pravaah (प्रवाह) to a GoDaddy Docker VPS

This app is three containers (Postgres + API + web) plus Caddy for HTTPS. The
**Virtual server with Docker** option (4 vCPU / 8 GB) runs it as-is. GoDaddy's
"Node.js hosting" option does **not** fit (single Node app, no Docker, no database).

## 0. What to get from GoDaddy first
1. Developer account + authenticated `gddy` CLI (run one test command).
2. In-store credit: submit your customer ID on the registration form, **choose
   "Virtual server with Docker"**, wait for confirmation.
3. Check out the 4 vCPU / 8 GB VPS ($0 with credit). Generate an SSH key, install it
   on the server, connect.
4. A domain (buy on godaddy.com with credit).
5. Titan Business Email (Pro Light, 1-month term) + a mailbox, e.g. `hello@yourdomain.com`.

## 1. Point the domain at the server
In GoDaddy DNS (or via `gddy`), add an **A record** for your domain → the VPS public IP.
Add a second A record for `www` if you want it. Wait for DNS to propagate
(`dig +short yourdomain.com` should return the VPS IP).

## 2. Install Docker on the VPS
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER" && newgrp docker   # run docker without sudo
docker --version && docker compose version
```

## 3. Get the code onto the server
Either `git clone <your repo>` or copy it up:
```bash
# from your laptop, in the project root:
rsync -az --exclude node_modules --exclude .git ./ user@SERVER_IP:/opt/pravaah/
```

## 4. Create the server `.env`
```bash
cd /opt/pravaah
cp .env.example .env
nano .env
```
Fill in, at minimum:
- `POSTGRES_PASSWORD` — a strong password
- `ASSISTANT_PROVIDER=model` and `ANTHROPIC_API_KEY=...` (a freshly rotated key)
- `DOMAIN=yourdomain.com` and `ACME_EMAIL=you@yourdomain.com`
- `SMTP_HOST=smtpout.secureserver.net`, `SMTP_PORT=465`, `SMTP_USER=hello@yourdomain.com`,
  `SMTP_PASS=<mailbox password>`, `CONTACT_TO=hello@yourdomain.com`

> `.env` is gitignored — keep secrets here, never in the repo.

## 5. Launch
```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f caddy   # watch TLS being issued
```
Caddy automatically obtains a Let's Encrypt certificate for `DOMAIN` (ports 80/443 must
be open in the VPS firewall). Then open **https://yourdomain.com**.

The API applies DB migrations and seeds the sample day on startup.

## 6. Verify
- `https://yourdomain.com` loads over HTTPS (valid padlock).
- Upload three register photos → "Read these registers" (real Claude OCR) → Check → Today.
- Footer → **Contact us** → send a test message → confirm it arrives in your mailbox.
- Send an email *to* `hello@yourdomain.com` from another account and confirm receipt.

## Updating later
```bash
cd /opt/pravaah && git pull    # or rsync again
docker compose -f docker-compose.prod.yml up -d --build
```

## Notes / troubleshooting
- **Firewall:** open TCP 80 and 443 on the VPS. 80 is required for the ACME HTTP challenge.
- **SMTP login rejected:** use GoDaddy's host `smtpout.secureserver.net` (not
  `smtp.titan.email`), port 465, and the **full email address** as the username.
- **Email not configured:** if the SMTP vars are blank, the contact form returns a clear
  "email not configured" message instead of failing silently; the rest of the app still works.
- **Costs:** the app calls the Anthropic API (chat + OCR) on your key — small per request,
  but real spend. Set a budget/alert in the Anthropic console.
- **Local, non-TLS run** (laptop): `docker compose up -d --build` → http://localhost:8088.
