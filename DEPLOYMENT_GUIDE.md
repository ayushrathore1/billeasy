# BillEasy — Complete Deployment Guide (Free Hosting)

> **Total cost: ₹0** — Everything uses free-tier services.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        GitHub (Free)                            │
│                                                                 │
│  ┌──────────────────┐     ┌──────────────────────────────────┐  │
│  │  GitHub Actions   │     │  GitHub Releases                 │  │
│  │  (CI/CD Build)    │────▶│  BillEasy_x64-setup.exe         │  │
│  │  2000 min/month   │     │  latest.json (auto-updater)     │  │
│  └──────────────────┘     │  ← Vendors download from here    │  │
│                            └──────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
         ┌──────────────────┐           ┌──────────────────────┐
         │  Vendor's PC      │           │  Render.com (Free)   │
         │  BillEasy.exe     │──────────▶│  License Server      │
         │  (Tauri Desktop)  │  validate │  + Admin Dashboard   │
         └──────────────────┘           │  /admin              │
                                        └──────────────────────┘
                                                 ▲
                                                 │
                                        ┌────────┴────────┐
                                        │  You (Admin)    │
                                        │  Browser access │
                                        └─────────────────┘
```

---

## What You Get

| Component | Hosted On | Cost | Purpose |
|-----------|-----------|------|---------|
| **BillEasy Desktop App** | GitHub Releases | Free | `.exe` installer vendors download |
| **CI/CD Pipeline** | GitHub Actions | Free (2000 min/month) | Auto-builds `.exe` on push |
| **License Server** | Render.com | Free | Validates license keys |
| **Admin Dashboard** | Render.com (same server) | Free | Generate & manage license keys |
| **Auto-Updater** | GitHub Releases | Free | Existing installs update automatically |

---

## Step 1: Deploy the License Server on Render.com

### 1.1 — Prepare the License Server

The license server lives in `license-server/` folder. It needs its own GitHub repo.

```bash
# From your project root
cd license-server

# Initialize as a separate git repo
git init
git add .
git commit -m "License server with admin dashboard"
```

### 1.2 — Push to GitHub

1. Go to **https://github.com/new**
2. Repository name: `billeasy-license`
3. Visibility: **Private**
4. Click **Create repository**

```bash
git remote add origin https://github.com/YOUR_USERNAME/billeasy-license.git
git branch -M main
git push -u origin main
```

### 1.3 — Deploy on Render.com

1. Go to **https://render.com** → Sign up (free) with GitHub
2. Click **New** → **Web Service**
3. Connect your `billeasy-license` repo
4. Configure:

| Setting | Value |
|---------|-------|
| **Name** | `billeasy-license` |
| **Region** | Singapore (closest to India) |
| **Runtime** | Node |
| **Build Command** | `npm install` |
| **Start Command** | `node server.js` |
| **Plan** | **Free** |

5. Add **Environment Variable**:

| Key | Value |
|-----|-------|
| `ADMIN_SECRET` | A strong password (e.g. `![alt text](image.png)!`) |
| `PORT` | `10000` (Render default) |
****
6. Click **Deploy Web Service**

### 1.4 — Note Your Server URL

After deploy, Render gives you a URL like:
```
https://billeasy-license.onrender.com
```

**Your admin dashboard** is at:
```
https://billeasy-license.onrender.com/admin
```

> **⚠️ Note:** Free Render tier sleeps after 15 min of inactivity. First request takes ~30s to wake up. This is fine — the BillEasy app shows a spinner during validation, and license validation only happens once per installation.

---

## Step 2: Update BillEasy to Point to Your Server

### 2.1 — Update the License Server URL in Rust

Open `src-tauri/src/commands/license.rs` and update the URL:

```rust
const LICENSE_SERVER_URL: &str = "https://billeasy-license.onrender.com/validate";
```

Replace with your actual Render URL.

### 2.2 — Update CSP in tauri.conf.json

Open `src-tauri/tauri.conf.json` and update the CSP:

```json
"csp": "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://billeasy-license.onrender.com ipc: http://ipc.localhost"
```

Replace with your actual Render URL.

---

## Step 3: Build & Release BillEasy on GitHub

### 3.1 — Create the BillEasy GitHub Repo

```bash
# From your project root (X:\BillEasy)
# Make sure .gitignore exists with:
# node_modules/
# dist/
# target/
# target-dev/
# *.key
# licenses.db

git init
git add .
git commit -m "BillEasy v1.0.0"
```

1. Go to **https://github.com/new**
2. Repository name: `billeasy`
3. Visibility: **Private**
4. Click **Create repository**

```bash
git remote add origin https://github.com/YOUR_USERNAME/billeasy.git
git branch -M main
git push -u origin main
```

### 3.2 — Generate Signing Keys

```bash
npm run tauri signer generate -- -w ~/.tauri/billeasy.key
```

Save the **public key** (long string) and **private key file** contents.

### 3.3 — Add GitHub Secrets

Go to: `https://github.com/YOUR_USERNAME/billeasy/settings/secrets/actions`

Add two secrets:

| Secret Name | Value |
|-------------|-------|
| `TAURI_SIGNING_PRIVATE_KEY` | Contents of `~/.tauri/billeasy.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password you set (or empty) |

### 3.4 — Add Updater Config to tauri.conf.json

Add to `src-tauri/tauri.conf.json`:

```json
{
  "plugins": {
    "updater": {
      "pubkey": "YOUR_PUBLIC_KEY_HERE",
      "endpoints": [
        "https://github.com/YOUR_USERNAME/billeasy/releases/latest/download/latest.json"
      ],
      "dialog": false
    }
  }
}
```

### 3.5 — Create GitHub Actions Workflow

Create `.github/workflows/release.yml`:

```yaml
name: Build and Release BillEasy

on:
  push:
    branches:
      - release

jobs:
  build-and-release:
    permissions:
      contents: write

    runs-on: windows-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: x86_64-pc-windows-msvc

      - name: Cache Rust
        uses: swatinem/rust-cache@v2
        with:
          workspaces: './src-tauri -> target'

      - name: Install dependencies
        run: npm ci

      - name: Build and Release
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        with:
          tagName: v__VERSION__
          releaseName: 'BillEasy v__VERSION__'
          releaseBody: |
            ## BillEasy v__VERSION__

            ### Download & Install
            1. Download **BillEasy_x64-setup.exe** below
            2. Right-click → Properties → Unblock → OK
            3. Double-click to install
            4. Enter your license key when prompted

            ### Existing Users
            Your app will show an update notification automatically.
          releaseDraft: false
          prerelease: false
          args: --target x86_64-pc-windows-msvc
```

### 3.6 — Trigger a Build

```bash
git add .
git commit -m "ci: add release workflow"
git push origin main

# When ready to build:
git push origin main:release
```

GitHub Actions will build the `.exe` in ~8 minutes and create a release.

### 3.7 — Get the Download Link

After the build completes, go to:
```
https://github.com/YOUR_USERNAME/billeasy/releases/latest
```

The download link for vendors will be:
```
https://github.com/YOUR_USERNAME/billeasy/releases/latest/download/BillEasy_1.0.0_x64-setup.exe
```

> **💡 Tip:** For a cleaner download link, you can create a redirect from a free service like bit.ly:
> `https://bit.ly/billeasy-download` → your GitHub Releases URL

---

## Step 4: Day-to-Day Workflow

### Onboarding a New Vendor

```
1. Open admin dashboard: https://billeasy-license.onrender.com/admin
2. Enter your admin secret
3. Type vendor name → click "Generate Key"
4. Copy the generated key (e.g. BILL-A1B2-C3D4-E5F6)
5. Share the download link + license key with the vendor
6. Vendor installs & enters the key → done!
```

### Managing Licenses

| Action | How |
|--------|-----|
| **Disable a vendor** | Click "Disable" next to their key in the dashboard |
| **Re-enable** | Click "Enable" on a disabled key |
| **Move to new PC** | Click "Unbind" to detach the machine binding |
| **Delete permanently** | Click the 🗑 delete button |

### Releasing Updates

```bash
# 1. Make your changes on main branch
git add .
git commit -m "feat: new feature description"
git push origin main

# 2. When ready to release, bump version in:
#    - src-tauri/tauri.conf.json  → "version": "1.1.0"
#    - src-tauri/Cargo.toml       → version = "1.1.0"

# 3. Push to release branch to trigger build
git push origin main:release
```

Existing installations will see the update banner automatically.

---

## Step 5: Troubleshooting

### "Render server takes 30s to respond"
This is normal on the free tier. The BillEasy app shows a spinner. License validation only happens ONCE per installation — after that the app works 100% offline.

### "Windows SmartScreen warning"
This happens because the `.exe` is not signed with an EV certificate (₹50,000+/year). Tell vendors:
1. Right-click the `.exe` → Properties → Unblock
2. If SmartScreen appears: Click "More info" → "Run anyway"

### "Vendor switched PCs"
Open the admin dashboard → click "Unbind" on their license key → they can now activate on the new PC.

### "Version mismatch errors"
Always keep `version` in `tauri.conf.json` and `Cargo.toml` identical.

---

## Quick Reference

| What | Where |
|------|-------|
| **Admin Dashboard** | `https://billeasy-license.onrender.com/admin` |
| **Download Link** | `https://github.com/YOUR_USERNAME/billeasy/releases/latest` |
| **License Server Health** | `https://billeasy-license.onrender.com/health` |
| **Build Status** | `https://github.com/YOUR_USERNAME/billeasy/actions` |
| **Admin Secret** | Set as `ADMIN_SECRET` env var on Render |

---

## Security Checklist

- [ ] `ADMIN_SECRET` is a strong password (not "changeme")
- [ ] Tauri signing key is backed up to USB + cloud
- [ ] GitHub repo is **private**
- [ ] No `.key` files committed to git
- [ ] CSP in `tauri.conf.json` only allows your license server URL
