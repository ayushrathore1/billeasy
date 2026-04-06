# BillEasy — Build & Release Pipeline Implementation Plan
**Version:** 1.0.0  
**Scope:** Packaging the localhost dev app into a distributable Windows .exe with zero cost  
**Prerequisites:** BillEasy is already running in localhost development (Tauri 2 + React + Vite)

---

## Instructions for the AI Agent

You are implementing the build and distribution pipeline for BillEasy, a Tauri 2 desktop billing app. The app already works in localhost development. Your job is to configure everything needed so that pushing to a GitHub branch automatically produces a signed Windows `.exe` installer — at zero cost.

**Rules you must follow without exception:**
1. Follow every phase in order. Do not skip ahead.
2. Do not change the tech stack. Do not suggest alternatives.
3. After every phase, run the Gate Check. If any check fails, fix it before proceeding.
4. Do not modify any application logic (POS screen, database, printing). This plan only touches build configuration and CI/CD files.
5. Every file path in this document is exact. Create files at the exact path shown.
6. Every command in this document is exact. Run them exactly as written.
7. When a value says `YOUR_USERNAME` or `YOUR_SECRET` — these are placeholders. Replace with real values before running.

---

## Table of Contents

1. [Overview & Architecture](#1-overview--architecture)
2. [Phase 1 — Pre-flight Checks](#phase-1--pre-flight-checks)
3. [Phase 2 — Signing Key Generation](#phase-2--signing-key-generation)
4. [Phase 3 — Configure tauri.conf.json for Production](#phase-3--configure-tauriconfjson-for-production)
5. [Phase 4 — Configure Cargo.toml](#phase-4--configure-cargotoml)
6. [Phase 5 — Create GitHub Repository](#phase-5--create-github-repository)
7. [Phase 6 — Add GitHub Secrets](#phase-6--add-github-secrets)
8. [Phase 7 — Create GitHub Actions Workflow](#phase-7--create-github-actions-workflow)
9. [Phase 8 — Configure WebView2 Bootstrapper](#phase-8--configure-webview2-bootstrapper)
10. [Phase 9 — First Release Test](#phase-9--first-release-test)
11. [Phase 10 — Verify the .exe on a Clean Machine](#phase-10--verify-the-exe-on-a-clean-machine)
12. [Phase 11 — Distribution Workflow](#phase-11--distribution-workflow)
13. [Phase 12 — Future Releases (Ongoing)](#phase-12--future-releases-ongoing)
14. [File Reference](#file-reference)
15. [Troubleshooting Reference](#troubleshooting-reference)
16. [SmartScreen Handling Guide for Vendors](#smartscreen-handling-guide-for-vendors)

---

## 1. Overview & Architecture

```
Developer machine (you)
        │
        │  git push origin main:release
        ▼
GitHub Repository (free, private)
        │
        │  triggers automatically
        ▼
GitHub Actions (free Windows server)
        │
        ├── Install Node.js 20
        ├── Install Rust stable
        ├── npm install (frontend deps)
        ├── vite build (React → dist/)
        ├── cargo build --release (Rust backend)
        ├── Bundle → BillEasy_x64-setup.exe
        ├── Sign with your private key
        └── Upload to GitHub Releases
                │
                ▼
        GitHub Releases (free storage)
                │
                ├── BillEasy_1.0.0_x64-setup.exe  ← you share this
                ├── BillEasy_1.0.0_x64_en-US.msi  ← alternative
                └── latest.json  ← auto-updater reads this
                        │
                        ▼
                Existing vendor installs
                see "Update available" banner
```

**Total cost: ₹0**
- GitHub private repo + Actions: free
- GitHub Releases storage: free
- GitHub Actions Windows build minutes: 2,000 free per month (each build uses ~8 minutes)
- Render.com license server: free tier

---

## Phase 1 — Pre-flight Checks

**Goal:** Confirm the existing development setup is complete and correct before touching any build config.

### Task 1.1 — Verify Tauri CLI is installed

```bash
cargo tauri --version
```

Expected output: `tauri-cli 2.x.x`

If not installed:
```bash
cargo install tauri-cli --version "^2.0"
```

### Task 1.2 — Verify the dev build works

```bash
cargo tauri dev
```

The app window must open, license screen or POS screen must appear, no console errors. If this fails, fix the application before proceeding with this plan.

### Task 1.3 — Verify npm build works

```bash
npm run build
```

Expected: a `dist/` folder is created with `index.html` and JS/CSS assets. If this fails, fix Vite config before proceeding.

### Task 1.4 — Verify Rust release build works locally

```bash
cargo build --release --manifest-path src-tauri/Cargo.toml
```

This will take 3–10 minutes on first run. Expected: no errors. Warnings are acceptable.

### Task 1.5 — Check tauri.conf.json has correct paths

Open `src-tauri/tauri.conf.json` and confirm:
```json
{
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:5173",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  }
}
```

If `frontendDist` points somewhere else, fix it now.

### Task 1.6 — Check icons exist

Tauri requires icon files for Windows packaging. Verify this folder exists:
```
src-tauri/icons/
  ├── icon.ico
  ├── icon.png
  ├── 32x32.png
  └── 128x128.png
```

If icons are missing, generate them:
```bash
# Place a 1024x1024 PNG named icon.png in src-tauri/icons/
# Then run:
cargo tauri icon src-tauri/icons/icon.png
```

This auto-generates all required icon sizes.

### Gate Check — Phase 1
- [ ] `cargo tauri --version` shows version 2.x
- [ ] `cargo tauri dev` opens the app window cleanly
- [ ] `npm run build` creates a `dist/` folder
- [ ] `cargo build --release` completes with no errors
- [ ] `frontendDist` in tauri.conf.json points to `../dist`
- [ ] `src-tauri/icons/icon.ico` exists

---

## Phase 2 — Signing Key Generation

**Goal:** Generate a cryptographic key pair. The private key signs your releases. The public key lets the updater verify authenticity. This is done once and never repeated.

### Task 2.1 — Generate the key pair

Run this command on your development machine:

```bash
npm run tauri signer generate -- -w ~/.tauri/billeasy.key
```

You will be prompted for a password. You can press Enter for no password, but setting one is more secure. **Remember this password — you will need it in Phase 6.**

### Task 2.2 — Read and save the output

The command prints something like this:

```
Please enter a password to protect your private key (press Enter for no password):

Your keypair was generated successfully
Private key saved to: /Users/you/.tauri/billeasy.key

Public key: dW50cnVzdGVkIGNvbW1lbnQ6IHRhdXJpIHNlY3JldCBrZXkKUlVTVENSWVBUTzAw...
```

**Copy the entire public key string.** It is long. You need it in Phase 3.

### Task 2.3 — Back up the private key immediately

The private key file is at `~/.tauri/billeasy.key` (on Windows: `C:\Users\YourName\.tauri\billeasy.key`).

Back it up now to at least two locations:
- A USB pen drive stored safely
- Google Drive in a private folder named "BillEasy Keys — DO NOT SHARE"

**If this key is lost, you cannot publish signed updates. You will have to ask every vendor to reinstall from scratch.**

**If this key is leaked, someone can publish fake updates to your vendors.**

### Task 2.4 — Read the private key contents for use in GitHub

Open the key file and copy its entire contents:

On Windows:
```bash
type C:\Users\YourName\.tauri\billeasy.key
```

On Linux/Mac:
```bash
cat ~/.tauri/billeasy.key
```

Copy all output including any header/footer lines. You will paste this into GitHub Secrets in Phase 6.

### Gate Check — Phase 2
- [ ] Key file exists at `~/.tauri/billeasy.key`
- [ ] You have the public key string copied somewhere (Notepad is fine)
- [ ] You have the private key file contents copied
- [ ] Private key is backed up to at least one external location
- [ ] If you set a password, it is written down somewhere safe

---

## Phase 3 — Configure tauri.conf.json for Production

**Goal:** Add production settings — app identifier, updater config, bundle config, and WebView2 handling.

### Task 3.1 — Set the app identifier

In `src-tauri/tauri.conf.json`, ensure this is set:

```json
{
  "productName": "BillEasy",
  "identifier": "com.billeasy.app",
  "version": "1.0.0"
}
```

The identifier must be unique. `com.billeasy.app` is correct unless you have a real domain, in which case reverse it: `com.yourdomain.billeasy`.

### Task 3.2 — Add the updater plugin config

Add the `plugins` section with your public key from Phase 2:

```json
{
  "plugins": {
    "updater": {
      "pubkey": "PASTE_YOUR_PUBLIC_KEY_HERE",
      "endpoints": [
        "https://github.com/YOUR_GITHUB_USERNAME/billeasy/releases/latest/download/latest.json"
      ],
      "dialog": false
    }
  }
}
```

Replace `PASTE_YOUR_PUBLIC_KEY_HERE` with the full public key string from Phase 2, Task 2.2.
Replace `YOUR_GITHUB_USERNAME` with your actual GitHub username.

`"dialog": false` means the updater will not show a native OS dialog — your React UpdateBanner component handles the UI instead.

### Task 3.3 — Add the bundle configuration

Add the `bundle` section:

```json
{
  "bundle": {
    "active": true,
    "targets": ["nsis", "msi"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/icon.ico"
    ],
    "windows": {
      "nsis": {
        "installMode": "perMachine",
        "shortcutName": "BillEasy",
        "createDesktopShortcut": true,
        "createStartMenuShortcut": true
      },
      "webviewInstallMode": {
        "type": "downloadBootstrapper"
      }
    },
    "resources": []
  }
}
```

`"targets": ["nsis", "msi"]` — NSIS produces the user-friendly `.exe` installer. MSI is the alternative. Both are built automatically.

`"installMode": "perMachine"` — installs for all users on the PC, appears in Add/Remove Programs correctly.

`"webviewInstallMode": "downloadBootstrapper"` — if a client's PC is missing WebView2, the installer downloads and installs it silently. This prevents the most common installation failure.

### Task 3.4 — Add the security config

Add or confirm the security section:

```json
{
  "app": {
    "security": {
      "csp": "default-src 'self'; script-src 'self'; connect-src 'self' https://YOUR_LICENSE_SERVER.onrender.com"
    }
  }
}
```

Replace `YOUR_LICENSE_SERVER` with your actual Render.com subdomain.

### Task 3.5 — Complete tauri.conf.json

The final `src-tauri/tauri.conf.json` must look like this (fill in all YOUR_ placeholders):

```json
{
  "productName": "BillEasy",
  "identifier": "com.billeasy.app",
  "version": "1.0.0",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:5173",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [
      {
        "title": "BillEasy",
        "width": 1280,
        "height": 800,
        "minWidth": 1024,
        "minHeight": 700,
        "resizable": true,
        "fullscreen": false
      }
    ],
    "security": {
      "csp": "default-src 'self'; script-src 'self'; connect-src 'self' https://YOUR_LICENSE_SERVER.onrender.com"
    }
  },
  "bundle": {
    "active": true,
    "targets": ["nsis", "msi"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/icon.ico"
    ],
    "windows": {
      "nsis": {
        "installMode": "perMachine",
        "shortcutName": "BillEasy",
        "createDesktopShortcut": true,
        "createStartMenuShortcut": true
      },
      "webviewInstallMode": {
        "type": "downloadBootstrapper"
      }
    }
  },
  "plugins": {
    "updater": {
      "pubkey": "YOUR_FULL_PUBLIC_KEY_STRING",
      "endpoints": [
        "https://github.com/YOUR_GITHUB_USERNAME/billeasy/releases/latest/download/latest.json"
      ],
      "dialog": false
    }
  }
}
```

### Gate Check — Phase 3
- [ ] `identifier` is set to `com.billeasy.app`
- [ ] `version` is `1.0.0`
- [ ] `pubkey` is filled with the real public key from Phase 2
- [ ] `endpoints` URL contains your real GitHub username
- [ ] `webviewInstallMode` is set to `downloadBootstrapper`
- [ ] CSP `connect-src` contains your real license server URL
- [ ] No placeholder text (`YOUR_`) remains in the file

---

## Phase 4 — Configure Cargo.toml

**Goal:** Ensure Cargo.toml version matches tauri.conf.json and all required dependencies are present.

### Task 4.1 — Sync version number

Open `src-tauri/Cargo.toml`. Set the version to match tauri.conf.json exactly:

```toml
[package]
name = "billeasy"
version = "1.0.0"
edition = "2021"
```

These two version numbers — in `Cargo.toml` and `tauri.conf.json` — must always be identical. The GitHub Actions workflow reads the version from `tauri.conf.json` to name the release. If they differ, the build will produce incorrect version labels.

### Task 4.2 — Verify required dependencies

Confirm these dependencies exist in `Cargo.toml`. Add any that are missing:

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-updater = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rusqlite = { version = "0.31", features = ["bundled"] }
tokio = { version = "1", features = ["full"] }
once_cell = "1"
reqwest = { version = "0.12", features = ["json"] }

[target.'cfg(windows)'.dependencies]
winreg = "0.52"

[profile.release]
opt-level = 3
lto = true
codegen-units = 1
panic = "abort"
strip = true
```

The `[profile.release]` section is important:
- `opt-level = 3` — maximum compiler optimisation
- `lto = true` — link-time optimisation, reduces binary size
- `codegen-units = 1` — slower compile, smaller and faster binary
- `panic = "abort"` — no unwinding overhead
- `strip = true` — removes debug symbols, reduces size

### Task 4.3 — Register the updater plugin in main.rs

Open `src-tauri/src/main.rs` and add the updater plugin:

```rust
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // existing setup code...
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // existing commands...
        ])
        .run(tauri::generate_context!())
        .expect("Error while running BillEasy");
}
```

### Gate Check — Phase 4
- [ ] `version` in `Cargo.toml` matches `version` in `tauri.conf.json` exactly
- [ ] `tauri-plugin-updater = "2"` is in `[dependencies]`
- [ ] `[profile.release]` section exists with all five optimisation flags
- [ ] `tauri_plugin_updater::Builder::new().build()` is in `main.rs`
- [ ] `cargo check --manifest-path src-tauri/Cargo.toml` passes with no errors

---

## Phase 5 — Create GitHub Repository

**Goal:** Push your project to a private GitHub repository. This is the trigger point for all automated builds.

### Task 5.1 — Create the repository on GitHub

1. Go to **https://github.com/new**
2. Repository name: `billeasy`
3. Visibility: **Private** (your source code is not public)
4. Do NOT check "Add a README file"
5. Do NOT check "Add .gitignore"
6. Click **Create repository**

### Task 5.2 — Create .gitignore

Create a file named `.gitignore` in the root of your project:

```
# Node
node_modules/
dist/

# Rust
src-tauri/target/

# Environment
.env
.env.local

# OS
.DS_Store
Thumbs.db

# Keys (never commit these)
*.key
*.pem
*.p12
*.pfx
```

The `*.key` line ensures your private signing key can never be accidentally committed.

### Task 5.3 — Initialize git and push

Run these commands from your project root:

```bash
git init
git add .
git commit -m "chore: initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/billeasy.git
git push -u origin main
```

Replace `YOUR_GITHUB_USERNAME` with your real GitHub username.

### Task 5.4 — Create the release branch

```bash
git checkout -b release
git push origin release
git checkout main
```

You are now back on `main`. The `release` branch exists on GitHub but is otherwise identical to `main` right now. Pushing to `release` is what triggers builds. You always develop on `main` and push to `release` only when you want a new build.

### Gate Check — Phase 5
- [ ] Repository exists at `https://github.com/YOUR_USERNAME/billeasy`
- [ ] `.gitignore` is committed and contains `*.key`
- [ ] All project files are on the `main` branch
- [ ] `release` branch exists on GitHub
- [ ] No `node_modules/` or `target/` folders were committed (check on GitHub)
- [ ] No `.key` files were committed

---

## Phase 6 — Add GitHub Secrets

**Goal:** Store your private signing key and its password in GitHub's encrypted secrets store so the Actions workflow can use them without exposing them.

### Task 6.1 — Navigate to secrets

Go to:
```
https://github.com/YOUR_USERNAME/billeasy/settings/secrets/actions
```

Click **New repository secret**.

### Task 6.2 — Add TAURI_SIGNING_PRIVATE_KEY

- Name: `TAURI_SIGNING_PRIVATE_KEY`
- Value: The entire contents of your `~/.tauri/billeasy.key` file

To get the contents on Windows:
```bash
type C:\Users\YourName\.tauri\billeasy.key
```

Copy everything including any lines that start with `#`. Paste it as the secret value.

Click **Add secret**.

### Task 6.3 — Add TAURI_SIGNING_PRIVATE_KEY_PASSWORD

- Name: `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- Value: The password you chose in Phase 2, Task 2.1

If you pressed Enter for no password in Phase 2, still create this secret with an empty value. The workflow requires the secret to exist even if blank.

Click **Add secret**.

### Task 6.4 — Verify secrets exist

Go to:
```
https://github.com/YOUR_USERNAME/billeasy/settings/secrets/actions
```

You should see two secrets listed:
```
TAURI_SIGNING_PRIVATE_KEY          Updated just now
TAURI_SIGNING_PRIVATE_KEY_PASSWORD Updated just now
```

You cannot view secret values after saving — this is correct and expected.

### Task 6.5 — Note: GITHUB_TOKEN is automatic

You do not need to create a `GITHUB_TOKEN` secret. GitHub provides this automatically to every Actions workflow. It is used to upload the built `.exe` to GitHub Releases. Do not create it manually.

### Gate Check — Phase 6
- [ ] `TAURI_SIGNING_PRIVATE_KEY` secret exists in the repository
- [ ] `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` secret exists (even if blank)
- [ ] You have NOT committed the key file to git
- [ ] `GITHUB_TOKEN` is NOT in the secrets list (it is injected automatically)

---

## Phase 7 — Create GitHub Actions Workflow

**Goal:** Create the workflow file that runs on GitHub's servers every time you push to the `release` branch. This is the core of the entire pipeline.

### Task 7.1 — Create the workflow directory

```bash
mkdir -p .github/workflows
```

### Task 7.2 — Create the workflow file

Create the file at exactly this path: `.github/workflows/release.yml`

Write the following content exactly as shown:

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

    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: windows-latest
            target: x86_64-pc-windows-msvc

    runs-on: ${{ matrix.platform }}

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install Rust toolchain
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.target }}

      - name: Cache Rust dependencies
        uses: swatinem/rust-cache@v2
        with:
          workspaces: './src-tauri -> target'
          cache-on-failure: true

      - name: Install frontend dependencies
        run: npm ci

      - name: Build and publish release
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

            ### Installation
            1. Download `BillEasy_x64-setup.exe` below
            2. Right-click the file → Properties → tick Unblock → OK
            3. Double-click to install
            4. If Windows shows a warning, click More info → Run anyway
            5. Enter your license key when prompted

            ### For existing users
            Your app will show an update notification automatically.
          releaseDraft: false
          prerelease: false
          args: --target ${{ matrix.target }}
```

### Task 7.3 — Commit and push the workflow

```bash
git add .github/workflows/release.yml
git commit -m "ci: add GitHub Actions release workflow"
git push origin main
```

Do NOT push to `release` yet. This commits the workflow file to `main` first.

### Task 7.4 — Understanding the workflow steps

Each step and why it exists:

| Step | Purpose |
|---|---|
| `actions/checkout@v4` | Downloads your code onto the GitHub server |
| `setup-node@v4` with `cache: npm` | Installs Node.js and caches npm packages between builds |
| `dtolnay/rust-toolchain@stable` | Installs the Rust compiler |
| `swatinem/rust-cache@v2` | Caches compiled Rust dependencies — cuts build time from 15 min to 5 min after first run |
| `npm ci` | Installs exact npm dependencies from package-lock.json |
| `tauri-apps/tauri-action@v0` | Runs `npm run build` + `cargo tauri build`, signs the output, creates the GitHub Release, uploads all files |

### Task 7.5 — Understanding the version placeholder

`__VERSION__` in the workflow is not a typo. The `tauri-action` reads `version` from `src-tauri/tauri.conf.json` and replaces `__VERSION__` with that value automatically. So if your version is `1.0.0`, the release will be tagged `v1.0.0` and named `BillEasy v1.0.0`.

### Gate Check — Phase 7
- [ ] File exists at `.github/workflows/release.yml`
- [ ] The `on.push.branches` is `[release]` — not `main`
- [ ] `permissions.contents: write` is present — without this, the upload will fail
- [ ] `GITHUB_TOKEN`, `TAURI_SIGNING_PRIVATE_KEY`, and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` are referenced correctly in `env`
- [ ] `releaseDraft: false` — set to true temporarily if you want to review before publishing
- [ ] Workflow file is committed to the `main` branch on GitHub

---

## Phase 8 — Configure WebView2 Bootstrapper

**Goal:** Ensure the installer handles client PCs that are missing WebView2 without failing silently.

This was set in Phase 3 (`"webviewInstallMode": { "type": "downloadBootstrapper" }`). This phase verifies the behavior and handles the edge case of no internet during install.

### Task 8.1 — Understanding the three WebView2 modes

| Mode | Behavior | Use when |
|---|---|---|
| `downloadBootstrapper` | Installer downloads WebView2 at install time if missing | Client always has internet — recommended |
| `embedBootstrapper` | Bootstrapper is embedded in your installer, downloads WebView2 at install time | Client may have slow internet |
| `offlineInstaller` | Full WebView2 installer embedded — no download needed | Client has no internet at install time — increases installer by ~130 MB |

For BillEasy, `downloadBootstrapper` is correct. WebView2 is only needed once. After that, it lives on the client's PC permanently.

### Task 8.2 — Confirm the setting is in tauri.conf.json

Verify this block exists in `src-tauri/tauri.conf.json`:

```json
"windows": {
  "webviewInstallMode": {
    "type": "downloadBootstrapper"
  }
}
```

If it is missing, add it now and commit.

### Task 8.3 — Windows 10/11 reality check

Windows 10 (after 2021 updates) and all Windows 11 machines already have WebView2 installed via Microsoft Edge auto-updates. The bootstrapper will detect this and skip the download entirely. The bootstrapper only activates on machines that genuinely lack WebView2 — typically machines that have never been connected to the internet or have had Windows updates blocked.

### Gate Check — Phase 8
- [ ] `webviewInstallMode.type` is `downloadBootstrapper` in `tauri.conf.json`
- [ ] This setting is inside the `bundle.windows` object, not at the root level

---

## Phase 9 — First Release Test

**Goal:** Trigger your first automated build and confirm a `.exe` file appears in GitHub Releases.

### Task 9.1 — Confirm all previous phases are complete

Before triggering the build, verify:
- `tauri.conf.json` has no placeholder text (`YOUR_` strings)
- `Cargo.toml` version matches `tauri.conf.json` version
- Both secrets exist in GitHub
- Workflow file is committed to `main`
- `.github/workflows/release.yml` is pushed to GitHub

### Task 9.2 — Trigger the first build

```bash
git checkout main
git pull origin main
git push origin main:release
```

This pushes the current `main` branch content to the `release` branch, which triggers the workflow.

### Task 9.3 — Watch the build

1. Go to: `https://github.com/YOUR_USERNAME/billeasy/actions`
2. You will see a workflow run named "Build and Release BillEasy" with a yellow spinning circle
3. Click on it to expand
4. Click on `build-and-release` to see the live log
5. Watch each step complete

Expected timeline:
- Steps 1–4 (checkout, node, rust, cache): ~1–2 minutes
- `npm ci`: ~30 seconds
- `tauri-action` (build + bundle + upload): ~5–8 minutes
- Total: ~8–12 minutes on first run, ~5–7 minutes after cache warms up

### Task 9.4 — Confirm the release was created

1. Go to: `https://github.com/YOUR_USERNAME/billeasy/releases`
2. You should see a release named `BillEasy v1.0.0`
3. Expand it — these files must be present:

```
BillEasy_1.0.0_x64-setup.exe      ← NSIS installer (share this)
BillEasy_1.0.0_x64_en-US.msi      ← MSI installer (alternative)
BillEasy_1.0.0_x64-setup.exe.sig  ← signature file (do not delete)
latest.json                        ← auto-updater manifest (do not delete)
```

### Task 9.5 — Verify latest.json

Download and open `latest.json`. It should look like:

```json
{
  "version": "1.0.0",
  "notes": "BillEasy v1.0.0",
  "pub_date": "2025-03-26T00:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "dW50cnVzdGVkIGNvbW1lbnQ...",
      "url": "https://github.com/YOUR_USERNAME/billeasy/releases/download/v1.0.0/BillEasy_1.0.0_x64-setup.exe"
    }
  }
}
```

The `signature` must not be empty. If it is empty, the signing keys were not passed correctly to the build — go back to Phase 6 and check the secrets.

### Gate Check — Phase 9
- [ ] GitHub Actions workflow ran without errors (green checkmark)
- [ ] `BillEasy_1.0.0_x64-setup.exe` exists in GitHub Releases
- [ ] `latest.json` exists and has a non-empty `signature` field
- [ ] No workflow step shows a red X

---

## Phase 10 — Verify the .exe on a Clean Machine

**Goal:** Install the produced `.exe` on a machine that has none of your development tools. This simulates the client's PC.

### Task 10.1 — Download the installer

From `https://github.com/YOUR_USERNAME/billeasy/releases`:
- Download `BillEasy_1.0.0_x64-setup.exe`

### Task 10.2 — Install on a test machine

The test machine must have:
- Windows 10 or 11 (64-bit)
- No Node.js, no Rust, no VS Code, no Tauri CLI
- Internet connection (for WebView2 if needed, and for license activation)

Steps:
1. Right-click the `.exe` → Properties → tick **Unblock** → OK
2. Double-click to run
3. Windows SmartScreen may appear — click **More info** → **Run anyway**
4. Installer opens — click Next, Install, Finish
5. BillEasy appears on the Desktop
6. Launch it
7. License screen appears
8. Enter a valid license key
9. Main POS screen appears
10. Test a print

### Task 10.3 — Verify app data location

On the test machine, confirm the database was created:
```
C:\Users\USERNAME\AppData\Roaming\BillEasy\billeasy.db
```

This file must exist after first launch.

### Task 10.4 — Verify uninstall

Go to Windows → Settings → Apps → search "BillEasy" → Uninstall.

Confirm:
- App is removed from the Desktop and Start Menu
- `billeasy.db` in AppData is preserved (data must survive uninstall)
- No leftover shortcuts

### Gate Check — Phase 10
- [ ] Installer runs successfully on a machine without development tools
- [ ] App launches and shows the license screen
- [ ] After activation, POS screen appears
- [ ] `billeasy.db` is created in the correct AppData location
- [ ] Uninstall works cleanly
- [ ] Data is preserved after uninstall

---

## Phase 11 — Distribution Workflow

**Goal:** Define the exact process for getting the `.exe` to each vendor after every release.

### Task 11.1 — Download and host the installer

After every release build:
1. Go to GitHub Releases
2. Download `BillEasy_VERSION_x64-setup.exe`
3. Upload it to a shared **Google Drive folder** named "BillEasy Installer"
4. Right-click in Google Drive → Get link → set to "Anyone with the link can view"
5. Copy the shareable link

Keep a separate folder per version:
```
Google Drive/
└── BillEasy Installer/
    ├── v1.0.0/
    │   └── BillEasy_1.0.0_x64-setup.exe
    ├── v1.0.1/
    │   └── BillEasy_1.0.1_x64-setup.exe
    └── Latest → always points vendors to the newest folder
```

### Task 11.2 — WhatsApp message template for new vendors

Copy and send this message when distributing to a new vendor:

```
BillEasy Setup Guide

1. Download the installer:
   [paste Google Drive link]

2. After download, right-click the file
   → Properties → tick the Unblock box → click OK

3. Double-click the installer to run it

4. If Windows shows a warning:
   click "More info" → then "Run anyway"

5. Click Next → Install → Finish

6. BillEasy opens on your desktop

7. Enter your license key:
   BILL-XXXX-XXXX-XXXX
   (needs internet for one minute to activate)

8. Done! Internet not needed after this.

Call me if anything doesn't work.
```

### Task 11.3 — Pen drive installation (recommended for first 10 vendors)

For non-technical vendors, install in person:
1. Copy the `.exe` to a USB pen drive
2. Visit the vendor's shop
3. Plug pen drive into their PC
4. Right-click the `.exe` on the pen drive → Run as administrator
5. SmartScreen → More info → Run anyway
6. Complete the install
7. Launch BillEasy → enter their license key
8. Run a test print before you leave

### Task 11.4 — License key creation before distribution

Before distributing to any vendor, create their license key on the server:

```bash
curl -X POST https://YOUR_LICENSE_SERVER.onrender.com/admin/create \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: YOUR_ADMIN_SECRET" \
  -d '{"vendorName": "Sharma General Store", "months": 12}'
```

Response:
```json
{
  "key": "BILL-A3F2-B891-C44D",
  "vendorName": "Sharma General Store",
  "expiresAt": "2027-03-26"
}
```

Note this key in a simple spreadsheet:

| Vendor Name | Key | Issued | Expires | Machine ID (after activation) |
|---|---|---|---|---|
| Sharma General Store | BILL-A3F2-B891-C44D | 26/03/2026 | 26/03/2027 | (fill after first launch) |

### Gate Check — Phase 11
- [ ] Google Drive folder exists with the installer
- [ ] WhatsApp message template is saved somewhere for reuse
- [ ] License key is created before distributing to each vendor
- [ ] Vendor tracking spreadsheet exists

---

## Phase 12 — Future Releases (Ongoing)

**Goal:** Define the exact process for releasing updates. Follow this every single time without exception.

### Standard release process

**Step 1 — Make and test your changes on `main`**
```bash
# Develop and test on main
cargo tauri dev
# Test everything works
```

**Step 2 — Bump the version in two files**

`src-tauri/tauri.conf.json`:
```json
{ "version": "1.0.1" }
```

`src-tauri/Cargo.toml`:
```toml
[package]
version = "1.0.1"
```

Both must be identical. If they differ, the build will fail or produce a mismatched release.

**Step 3 — Commit everything**
```bash
git add .
git commit -m "release: v1.0.1 — describe what changed"
git push origin main
```

**Step 4 — Trigger the build**
```bash
git push origin main:release
```

**Step 5 — Wait and verify**
- Go to GitHub Actions and watch the build (~8 minutes)
- Confirm the release appears at GitHub Releases
- Confirm `latest.json` version is updated

**Step 6 — Test before distributing**
- Download the new `.exe`
- Install on a test machine
- Verify the fix or feature works
- Only then share with vendors

**Step 7 — Distribute**
- Upload new `.exe` to Google Drive
- Send WhatsApp update message to vendors

**Step 8 — Auto-updater kicks in**
- Vendors who already have BillEasy installed will see the update banner automatically on next launch
- They click "Restart & Update"
- New version installs silently
- They do not need the `.exe` file

### Version numbering rules

Follow semantic versioning strictly:

| Change type | Example | Version bump |
|---|---|---|
| Bug fix | Fixed print crash | 1.0.0 → 1.0.1 |
| New feature | Added order history | 1.0.0 → 1.1.0 |
| Major rewrite | New database schema | 1.0.0 → 2.0.0 |

Never reuse a version number. Never publish two releases with the same version. GitHub Releases will reject it and the build will fail.

### Staged rollout rule (critical for high-volume)

Never release to all vendors simultaneously. Always:
1. Push the release
2. Install on your own test machine first
3. If stable for 24 hours → share with 1–2 trusted vendors
4. If stable for another 24 hours → share with everyone via WhatsApp

This prevents a bad update from breaking billing for all vendors at the same moment.

### Gate Check — Phase 12
- [ ] Version bumped in both files before every release
- [ ] Both version numbers are identical
- [ ] Build is verified on a test machine before distributing
- [ ] `latest.json` in the new release has a higher version than the previous release
- [ ] You never reused a version number

---

## File Reference

Every file this plan creates or modifies:

```
billeasy/
├── .github/
│   └── workflows/
│       └── release.yml          ← CREATED in Phase 7
├── src-tauri/
│   ├── icons/                   ← VERIFIED in Phase 1
│   │   ├── icon.ico
│   │   ├── icon.png
│   │   ├── 32x32.png
│   │   └── 128x128.png
│   ├── src/
│   │   └── main.rs              ← MODIFIED in Phase 4 (updater plugin)
│   ├── Cargo.toml               ← MODIFIED in Phase 4
│   └── tauri.conf.json          ← MODIFIED in Phase 3
└── .gitignore                   ← CREATED in Phase 5
```

Files that must NEVER be committed to git:
```
~/.tauri/billeasy.key            ← private signing key (outside project folder)
```

---

## Troubleshooting Reference

### Build fails: "could not find Cargo.toml"
The workflow cannot find your Rust project. Check that `src-tauri/Cargo.toml` exists and the path matches your project structure.

### Build fails: "TAURI_SIGNING_PRIVATE_KEY not set"
The secret name in GitHub does not match the name in the workflow. Both must be exactly `TAURI_SIGNING_PRIVATE_KEY`. Check spelling and case.

### Build fails: "error: package `billeasy` cannot be built"
A Rust compilation error. The error message will say which file and line. Fix the Rust error locally (`cargo build --release`) and push again.

### Build succeeds but latest.json signature is empty
The signing key was not applied. Reasons:
- Secret value was copied incorrectly (missing lines from the key file)
- Secret name has a typo
- Key password is wrong

Fix: Go to GitHub Secrets → delete and re-add `TAURI_SIGNING_PRIVATE_KEY` with the correct value.

### Installer runs but app shows blank white screen
WebView2 is not installed and the bootstrapper failed (no internet during install). Solution: have the vendor connect to internet and reinstall, or switch to `embedBootstrapper` mode.

### App installs but immediately crashes
Usually a missing Rust panic or database initialisation failure. Check Windows Event Viewer → Application logs for the crash message. Most common cause: the AppData directory could not be created (permissions issue on the client's PC).

### Auto-updater banner never appears
Reasons:
- `latest.json` URL in `tauri.conf.json` is wrong (has wrong GitHub username)
- `latest.json` version is not higher than the installed version
- Client has no internet

Check the URL in `tauri.conf.json` `endpoints` matches exactly: `https://github.com/YOUR_USERNAME/billeasy/releases/latest/download/latest.json`

### SmartScreen blocks install completely
The vendor does not see "More info" — only "Don't run". This happens with Windows 11 Smart App Control (SAC). Solution:
- Instruct vendor to right-click → Properties → Unblock before running
- Or install in person via pen drive (bypasses SAC)
- SAC can only be permanently resolved with a code signing certificate

### GitHub Actions minutes running out
Each build uses ~8 minutes. The free tier gives 2,000 minutes/month = ~250 builds per month. You will never hit this limit with normal development. If you do, reduce build frequency by batching multiple fixes into one release.

---

## SmartScreen Handling Guide for Vendors

Include this as a printed sheet or WhatsApp image when distributing:

### If you see "Windows protected your PC"

```
Step 1: Click "More info" (blue text)

Step 2: Click "Run anyway" button that appears

Step 3: Installation continues normally
```

### If the file is blocked before running

```
Step 1: Right-click the downloaded file
Step 2: Click "Properties"
Step 3: At the bottom, find the "Unblock" checkbox
Step 4: Tick the checkbox
Step 5: Click OK
Step 6: Now double-click to install
```

### Why does this happen?

Windows does not recognise BillEasy yet because it is new software. This warning appears for all new software that has not been downloaded millions of times. It is not a virus. The more people install it, the less often this warning appears over time.

---

*End of BillEasy Build & Release Pipeline Implementation Plan v1.0.0*
