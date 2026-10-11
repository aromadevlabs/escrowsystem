# Quantix Escrow System

Protect, license and distribute your FiveM scripts — the way FiveM's own asset
escrow works, but on your own server. Upload a resource, choose which files
buyers can see, lock the rest behind AES‑256 encryption, and share access to
buyers by their **Discord ID**. Login is **Discord‑only**.

> Engineered beyond expectations. — Quantix Labs

---

## What it does

- **Discord‑only login** (OAuth2). Access is gated by **one Discord role** (your
  "dev team" role) in your server — anyone with the role gets the creator pages;
  everyone else only sees their buyer vault.
- **Create Escrow Asset** — upload a resource `.zip`, pick which `.lua` files
  stay visible (configs, locales) and which get encrypted.
- **Grant / Share Assets** — give a buyer access by Discord ID. Each grant gets
  its own license key. Share the same asset with many Discord IDs at once.
- **Granted Assets** — see every license, its status and server lock; revoke or
  restore instantly.
- **Buyer Vault** — buyers sign in with Discord and download their resource; the
  license and loader are already inside.
- **Runtime protection** — the protected Lua never ships to disk. A loader in the
  buyer's resource validates the license with your server and streams the
  protected code into memory. Revoking a license stops it on the next restart.
- **Server lock** — a license binds to the first server that runs it.

No database server and **no npm packages** to install — it runs on Node's
built‑in modules only. Data is stored in `storage/` (JSON + encrypted blobs).

---

## Requirements

- Node.js 18.17 or newer (`node -v`)
- A Discord application (free): <https://discord.com/developers/applications>
- A public URL for production (any VPS, or a tunnel like Cloudflare Tunnel).
  Buyers' FiveM servers must be able to reach it.

---

## Setup

```bash
# 1. Generate secrets and a starter .env
npm run setup

# 2. Open .env and fill in the Discord + team fields (see below)

# 3. Start it
npm start
```

Then open the BASE_URL you set (default `http://localhost:3000`).

### Discord application

1. Go to the Discord Developer Portal → **New Application**.
2. **OAuth2 → Redirects**, add:  `<BASE_URL>/auth/discord/callback`
   (e.g. `https://escrow.yourdomain.com/auth/discord/callback`).
3. Copy the **Client ID** and **Client Secret** into `.env`.
4. Access is by **role**, so the app reads the signed-in user's roles in your
   server (OAuth scope `guilds.members.read` — no bot needed). In `.env` set:
   - `DISCORD_GUILD_ID` — your server ID (Developer Mode → right-click server →
     Copy Server ID).
   - `TEAM_ROLE_ID` — your dev team role ID (Server Settings → Roles →
     right-click the role → Copy Role ID). Pre-filled with `1477017944398757971`.

### `.env` fields

| Key | What it is |
| --- | --- |
| `BASE_URL` | Public URL of this app. Must match the Discord redirect. |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | From your Discord app. |
| `DISCORD_GUILD_ID` | The server your dev team role lives in. |
| `TEAM_ROLE_ID` | The dev team role. Anyone with it gets the creator pages. |
| `MASTER_KEY` | 64‑hex‑char key that encrypts every asset. **Back it up. Never change it** — doing so makes stored assets unreadable. |
| `SESSION_SECRET` | Signs login sessions. |
| `MAX_UPLOAD_MB` | Max resource zip size (default 50). |
| `LICENSE_RECHECK_SECONDS` | How often buyer servers re‑validate (default 1800). |

> **Find your Discord ID:** Discord → Settings → Advanced → turn on Developer
> Mode, then right‑click your name → **Copy User ID**.

---

## How selling works

1. **You** (team) open *Create Escrow Asset*, drop in your resource `.zip`,
   leave `config`/`locale` files visible, and publish. The code is encrypted.
2. A buyer pays you (Tebex, PayPal, etc. — Quantix doesn't handle payment).
3. **You** open *Grant* or *Share*, paste the buyer's Discord ID, and grant.
4. **The buyer** signs in with Discord, opens *My Vault*, and downloads the
   resource. It contains the visible files, the loader, and a `license.cfg`.
5. In their `server.cfg`:
   ```
   exec @<resource>/license.cfg
   ensure <resource>
   ```
6. On start, the loader validates the license and loads the protected code into
   memory. If you revoke the license, it stops working on the next restart.

---

## Project layout

```
quantix-escrow/
  src/
    server.js        HTTP server + routes/API
    config.js        .env loading + validation
    auth.js          Discord OAuth2, sessions
    assets.js        upload, encrypt, vault, packaging
    grants.js        grants / licenses / sharing
    manifest.js      fxmanifest.lua parsing + generation
    package.js       builds the buyer download zip
    setup.js         generates .env + secrets
    lib/             crypto, zip, store, http, multipart (all dependency‑free)
  pages/             login / create / grant / granted / vault (HTML)
  public/            css, js, images (banner + logo)
  loader/            qx_server.lua, qx_client.lua (ship inside buyer resources)
  storage/           data.json + encrypted asset blobs (created at runtime)
```

---

## Security notes

- Protected Lua is stored encrypted (AES‑256‑GCM, per‑asset key wrapped by
  `MASTER_KEY`) and is never written to a buyer's disk.
- Determined buyers can still capture code that runs on their own machine — this
  raises the bar the same way FiveM escrow does; it is not unbreakable DRM.
- Run behind HTTPS in production and set `TRUST_PROXY=1` behind a reverse proxy.
- `storage/` and `.env` hold your secrets and assets — keep them off public git
  and in your backups.

---

## Production

- Put it behind nginx/Caddy/Cloudflare with TLS, `BASE_URL=https://…`,
  `TRUST_PROXY=1`.
- Keep it running with `pm2 start src/server.js --name quantix-escrow` or a
  systemd service.
- Back up `storage/` and `.env` regularly.

Built by Quantix Labs.
