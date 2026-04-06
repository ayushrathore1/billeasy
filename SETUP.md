# BillEasy — Dev Setup Guide

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥ 18 | [nodejs.org](https://nodejs.org) |
| Rust | ≥ 1.70 | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| MSYS2 + MinGW64 | latest | [msys2.org](https://www.msys2.org) |

### MSYS2 Setup (Windows only)

After installing MSYS2, open the **MSYS2 MinGW64** terminal and run:

```bash
pacman -S --noconfirm mingw-w64-x86_64-gcc mingw-w64-x86_64-make
```

Then switch Rust to the GNU toolchain:

```bash
rustup target add x86_64-pc-windows-gnu
rustup default stable-x86_64-pc-windows-gnu
```

---

## Quick Start

### Option 1 — Double-click

Run **`run.bat`** from the project root. It handles everything automatically.

### Option 2 — Terminal

```bash
# 1. Install npm dependencies
npm install

# 2. Set PATH (Git Bash / MSYS2)
export PATH="$PATH:/c/msys64/mingw64/bin:/c/Program Files/nodejs:$HOME/.cargo/bin"

# 3. Avoid rust-analyzer file locks
export CARGO_TARGET_DIR="X:/BillEasy/src-tauri/target-dev"

# 4. Launch dev server (Vite + Cargo)
npm run tauri -- dev
```

> **First build** compiles ~475 Rust crates and takes **5–10 minutes**.  
> Subsequent rebuilds are near-instant.

---

## Killing Stale Processes

If the app won't start or ports are in use:

### Kill everything (CMD)

```cmd
taskkill /F /IM node.exe
taskkill /F /IM cargo.exe
taskkill /F /IM rustc.exe
taskkill /F /IM billeasy.exe
```

### Kill everything (PowerShell)

```powershell
Stop-Process -Name node,cargo,rustc,billeasy -Force -ErrorAction SilentlyContinue
```

### Kill everything (Git Bash)

```bash
taskkill //F //IM node.exe //T 2>/dev/null
taskkill //F //IM cargo.exe //T 2>/dev/null
taskkill //F //IM rustc.exe //T 2>/dev/null
```

### Free port 5173 specifically

```powershell
# Find what's using port 5173
Get-NetTCPConnection -LocalPort 5173 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

---

## Common Issues

| Problem | Fix |
|---------|-----|
| `Port 5173 is already in use` | Kill node processes (see above) |
| `os error 32` (file locked) | Set `CARGO_TARGET_DIR` or kill rust-analyzer |
| `can't find library billeasy_lib` | Ensure `[lib]` section is removed from `src-tauri/Cargo.toml` |
| `no method named path` | Add `use tauri::Manager;` to `main.rs` |
| `gcc: command not found` | Install MinGW64 via MSYS2 `pacman` |
| `cl.exe not found` | Switch to GNU toolchain (see prerequisites) |

---

## Project Structure

```
BillEasy/
├── run.bat                 # One-click dev launcher
├── package.json            # Frontend deps
├── vite.config.js          # Vite config
├── tailwind.config.js      # Tailwind theme
├── index.html              # Entry HTML
├── src/                    # React frontend
│   ├── App.jsx             # Root (license gate + tabs)
│   ├── pages/              # POS, Setup, History, LicenseScreen
│   ├── components/         # ItemCard, Cart, CategoryTabs, UpdateBanner
│   ├── store/              # Zustand stores (cart, menu, settings)
│   └── lib/tauri.js        # Typed invoke() wrapper
├── src-tauri/              # Rust backend
│   ├── Cargo.toml
│   ├── tauri.conf.json     # Window size, CSP, bundle config
│   └── src/
│       ├── main.rs         # App entry + command registration
│       ├── db.rs           # SQLite (WAL mode, migrations)
│       ├── models.rs       # Shared data types
│       └── commands/       # menu, orders, settings, print, license
└── license-server/         # Express license validation server
```
