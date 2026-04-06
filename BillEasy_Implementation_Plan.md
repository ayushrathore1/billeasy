# BillEasy — Complete Implementation Plan
**Version:** 1.0.0  
**Target OS:** Windows 10 / 11  
**Stack:** Tauri 2 + React + SQLite + Rust  
**Status:** Ready for development

---

## ⚠️ Instructions for the Developer

Read this entire document before writing a single line of code. This plan is meant to be followed **strictly and in order**. Do not skip phases, do not reorder tasks, and do not substitute technologies unless a phase explicitly offers an alternative.

Each phase ends with a **Gate Check** — a list of things that must be true before you are allowed to proceed to the next phase. If a gate check fails, fix it before moving forward.

Use this document as your single source of truth. When in doubt about a decision, refer back to the architecture and rationale written here.

**For AI agent usage:** Feed this document to your agent at the start of each session. Tell the agent: *"We are building BillEasy. Follow the implementation plan strictly. We are currently on Phase X, Task Y."* Do not give the agent creative freedom on architecture — it must follow what is written here.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Folder Structure](#3-folder-structure)
4. [Technology Decisions & Rationale](#4-technology-decisions--rationale)
5. [Phase 1 — Project Scaffold](#phase-1--project-scaffold)
6. [Phase 2 — Database Layer](#phase-2--database-layer)
7. [Phase 3 — Backend Commands (Rust)](#phase-3--backend-commands-rust)
8. [Phase 4 — License System](#phase-4--license-system)
9. [Phase 5 — Setup Screen (Menu Builder)](#phase-5--setup-screen-menu-builder)
10. [Phase 6 — POS Screen (Billing)](#phase-6--pos-screen-billing)
11. [Phase 7 — Print Integration](#phase-7--print-integration)
12. [Phase 8 — History Screen](#phase-8--history-screen)
13. [Phase 9 — Auto Updater](#phase-9--auto-updater)
14. [Phase 10 — Build & Distribution](#phase-10--build--distribution)
15. [Data Models](#data-models)
16. [API Contract (Tauri Commands)](#api-contract-tauri-commands)
17. [Security Rules](#security-rules)
18. [SmartScreen Strategy (No Certificate)](#smartscreen-strategy-no-certificate)
19. [Risk Register](#risk-register)
20. [Environment Variables & Config](#environment-variables--config)

---

## 1. Project Overview

BillEasy is a local-first desktop billing application for Windows. It is designed for small shop owners who need to:

- Pre-configure a menu of items with fixed prices
- Allow a cashier to quickly assemble a bill by tapping items
- Print receipts instantly to a USB thermal printer
- Store all data locally on the PC with no internet dependency after activation

The application is distributed as a Windows `.exe` installer. Multiple shop owners (vendors) each install their own copy. Each copy is locked to a single PC via a license key validated once on first launch.

**Performance targets:**
- App startup to billing screen: under 1 second
- Bill print time: under 2 seconds
- Cart clear and reset after print: under 200ms
- Installer file size: under 15 MB

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    TAURI APPLICATION WINDOW                      │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                  REACT FRONTEND (Vite)                    │   │
│  │                                                          │   │
│  │   POS Screen  │  Setup Screen  │  History Screen         │   │
│  │                                                          │   │
│  │   Zustand state store (cart, menu, settings)             │   │
│  │                                                          │   │
│  │   invoke() calls → Tauri IPC bridge                      │   │
│  └──────────────────────────┬───────────────────────────────┘   │
│                             │ Tauri IPC (typed, sandboxed)      │
│  ┌──────────────────────────▼───────────────────────────────┐   │
│  │                   RUST BACKEND (Tauri)                    │   │
│  │                                                          │   │
│  │   Commands: db_query, db_execute, print_receipt,         │   │
│  │             validate_license, check_update               │   │
│  │                                                          │   │
│  │   ┌─────────────┐     ┌──────────────┐                  │   │
│  │   │  SQLite DB   │     │  USB Printer  │                 │   │
│  │   │  (rusqlite)  │     │  (escpos-rs)  │                 │   │
│  │   └─────────────┘     └──────────────┘                  │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
              (HTTP, once at first launch only)
                              │
              ┌───────────────▼──────────────┐
              │   LICENSE SERVER              │
              │   Node.js on Render.com FREE  │
              │   Validates key + machine ID  │
              └──────────────────────────────┘
```

**Key architecture decisions:**
- The React frontend never touches the filesystem or hardware directly
- All system access goes through typed Tauri commands (Rust functions)
- SQLite is the only database — no external services, no ORM overhead
- The license server is contacted exactly once per machine, ever
- After activation, the app works 100% offline forever

---

## 3. Folder Structure

```
billeasy/
├── src-tauri/                    ← Rust backend
│   ├── src/
│   │   ├── main.rs               ← Tauri app entry point
│   │   ├── db.rs                 ← SQLite connection + migrations
│   │   ├── commands/
│   │   │   ├── mod.rs
│   │   │   ├── menu.rs           ← Category + item CRUD commands
│   │   │   ├── orders.rs         ← Order save + history commands
│   │   │   ├── settings.rs       ← Shop settings commands
│   │   │   ├── print.rs          ← USB thermal printer command
│   │   │   ├── license.rs        ← License validate + store command
│   │   │   └── updater.rs        ← Auto-update check command
│   │   └── models.rs             ← Shared Rust structs (serde)
│   ├── Cargo.toml
│   ├── tauri.conf.json           ← Security config, allowlist, window
│   └── icons/                   ← App icons (generated from icon.png)
│
├── src/                          ← React frontend
│   ├── main.jsx                  ← React entry point
│   ├── App.jsx                   ← Router + license gate + update banner
│   ├── pages/
│   │   ├── LicenseScreen.jsx     ← Key entry on first launch
│   │   ├── POS.jsx               ← Main billing screen
│   │   ├── Setup.jsx             ← Menu and item configuration
│   │   └── History.jsx           ← Order history and daily totals
│   ├── components/
│   │   ├── ItemCard.jsx          ← Single item tile with qty stepper
│   │   ├── Cart.jsx              ← Right panel with cart items + total
│   │   ├── CategoryTabs.jsx      ← Horizontal category selector
│   │   ├── PrintButton.jsx       ← Print trigger with loading state
│   │   └── UpdateBanner.jsx      ← Top bar update notification
│   ├── store/
│   │   ├── cartStore.js          ← Zustand: cart items, quantities
│   │   ├── menuStore.js          ← Zustand: categories and items
│   │   └── settingsStore.js      ← Zustand: shop name, footer, etc.
│   └── lib/
│       └── tauri.js              ← invoke() wrapper with error handling
│
├── license-server/               ← Deployed separately on Render.com
│   ├── server.js                 ← Express license validation API
│   ├── package.json
│   └── README.md                 ← Deploy instructions
│
├── package.json                  ← Frontend deps (React, Vite, Zustand)
├── vite.config.js
└── README.md
```

---

## 4. Technology Decisions & Rationale

| Layer | Technology | Version | Rationale |
|---|---|---|---|
| Desktop shell | Tauri | 2.x | 3–10 MB installer, 30 MB RAM, sub-500ms startup, built-in security sandbox |
| UI framework | React | 18.x | Developer familiarity, large ecosystem, fast rendering |
| Build tool | Vite | 5.x | Sub-100ms HMR, fast production builds |
| Styling | Tailwind CSS | 3.x | Utility-first, no runtime overhead, easy large-touch-target design |
| State management | Zustand | 4.x | Minimal boilerplate, no Provider wrapping, fast updates |
| Database | SQLite via rusqlite | — | ACID compliant, single file, zero config, offline-first |
| DB access mode | WAL mode | — | Allows reads during writes, crash-safe |
| Print protocol | ESC/POS via escpos-rs | — | Industry standard, works with Helett H80I and all compatible printers |
| Auto-update | tauri-plugin-updater | 2.x | GitHub Releases integration, prompts user before installing |
| License | Custom Node.js server | — | Simple key-machine binding, free hosting on Render.com |

**What was rejected and why:**

| Rejected | Reason |
|---|---|
| Electron | 150 MB installer, 300 MB RAM, ships full Chromium — overkill |
| .NET WPF | Requires C#, no web skills reuse, not cross-platform |
| PostgreSQL | Requires Windows service, complex setup, can fail to start |
| Web Bluetooth | Disconnects randomly, Chrome-only, unsuitable for high-volume |
| Code signing cert | Costs ₹8,000–₹18,000/year — replaced with pen drive + whitelist strategy |

---

## Phase 1 — Project Scaffold

**Goal:** A working Tauri + React app that opens a window and renders "Hello BillEasy."

### Tasks

**1.1 — Install prerequisites**
```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Node.js LTS (v20+) from nodejs.org

# Install Tauri CLI
cargo install tauri-cli --version "^2.0"

# Verify
rustc --version
node --version
cargo tauri --version
```

**1.2 — Create the project**
```bash
cargo tauri init billeasy
cd billeasy

# When prompted:
# App name: BillEasy
# Window title: BillEasy
# Web assets path: ../dist
# Dev server URL: http://localhost:5173
# Frontend dev command: npm run dev
# Frontend build command: npm run build
```

**1.3 — Install frontend dependencies**
```bash
npm create vite@latest . -- --template react
npm install
npm install zustand @tauri-apps/api tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

**1.4 — Configure Tailwind**

In `tailwind.config.js`:
```js
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: { extend: {} },
  plugins: [],
}
```

In `src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

**1.5 — Configure tauri.conf.json**

Set the following in `src-tauri/tauri.conf.json`:
```json
{
  "productName": "BillEasy",
  "version": "1.0.0",
  "identifier": "com.billeasy.app",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:5173",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [{
      "title": "BillEasy",
      "width": 1280,
      "height": 800,
      "minWidth": 1024,
      "minHeight": 700,
      "resizable": true,
      "fullscreen": false
    }],
    "security": {
      "csp": "default-src 'self'; script-src 'self'; connect-src 'self' https://your-license-server.onrender.com"
    }
  }
}
```

**1.6 — Verify the scaffold**
```bash
cargo tauri dev
```
The app window must open and show a React page without errors.

### Gate Check — Phase 1
- [ ] `cargo tauri dev` opens a window
- [ ] React renders without console errors
- [ ] Tailwind classes work (test with `className="text-red-500"`)
- [ ] Hot module reload works (edit a component, see change without refresh)

---

## Phase 2 — Database Layer

**Goal:** SQLite database initialises on app startup with all tables created. Rust commands for raw SQL exposed to frontend.

### Tasks

**2.1 — Add Rust dependencies**

In `src-tauri/Cargo.toml`:
```toml
[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rusqlite = { version = "0.31", features = ["bundled"] }
tokio = { version = "1", features = ["full"] }
once_cell = "1"
```

**2.2 — Create db.rs**

```rust
// src-tauri/src/db.rs
use rusqlite::{Connection, Result};
use once_cell::sync::OnceCell;
use std::sync::Mutex;

pub static DB: OnceCell<Mutex<Connection>> = OnceCell::new();

pub fn init(app_data_dir: &str) -> Result<()> {
    let path = format!("{}/billeasy.db", app_data_dir);
    let conn = Connection::open(&path)?;

    // Enable WAL mode for crash safety
    conn.execute_batch("PRAGMA journal_mode=WAL;")?;
    conn.execute_batch("PRAGMA foreign_keys=ON;")?;

    // Run migrations
    conn.execute_batch(SCHEMA)?;

    DB.set(Mutex::new(conn))
        .map_err(|_| rusqlite::Error::InvalidQuery)?;

    Ok(())
}

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_active  INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    name        TEXT    NOT NULL,
    price       REAL    NOT NULL CHECK(price >= 0),
    is_active   INTEGER DEFAULT 1,
    sort_order  INTEGER DEFAULT 0,
    FOREIGN KEY(category_id) REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS orders (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    items_json  TEXT    NOT NULL,
    subtotal    REAL    NOT NULL,
    total       REAL    NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS license (
    key         TEXT NOT NULL,
    machine_id  TEXT NOT NULL,
    vendor_name TEXT NOT NULL,
    expires_at  TEXT NOT NULL,
    activated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
";
```

**2.3 — Wire db.rs into main.rs**

```rust
// src-tauri/src/main.rs
mod db;
mod commands;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app.path()
                .app_data_dir()
                .expect("Failed to get app data dir")
                .to_string_lossy()
                .to_string();

            std::fs::create_dir_all(&app_data_dir)
                .expect("Failed to create app data dir");

            db::init(&app_data_dir)
                .expect("Database initialisation failed");

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::menu::get_categories,
            commands::menu::create_category,
            commands::menu::update_category,
            commands::menu::delete_category,
            commands::menu::get_items,
            commands::menu::create_item,
            commands::menu::update_item,
            commands::menu::delete_item,
            commands::orders::save_order,
            commands::orders::get_orders,
            commands::orders::get_summary,
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::print::print_receipt,
            commands::license::validate_license,
            commands::license::get_license_status,
        ])
        .run(tauri::generate_context!())
        .expect("Error while running BillEasy");
}
```

**2.4 — Verify database**

Add a temporary test command:
```rust
#[tauri::command]
fn db_ping() -> String {
    let db = db::DB.get().unwrap().lock().unwrap();
    let count: i64 = db.query_row(
        "SELECT COUNT(*) FROM categories", [], |r| r.get(0)
    ).unwrap_or(0);
    format!("DB OK — {} categories", count)
}
```
Call it from React and verify the response in the browser console.

### Gate Check — Phase 2
- [ ] App starts without panicking
- [ ] `billeasy.db` file is created in `%APPDATA%\BillEasy\`
- [ ] `db_ping` command returns "DB OK — 0 categories"
- [ ] App still starts cleanly on second launch (schema is idempotent)

---

## Phase 3 — Backend Commands (Rust)

**Goal:** All CRUD operations for categories, items, settings, and orders implemented as typed Tauri commands.

### 3.1 — Models (src-tauri/src/models.rs)

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Category {
    pub id: i64,
    pub name: String,
    pub sort_order: i64,
    pub is_active: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Item {
    pub id: i64,
    pub category_id: i64,
    pub name: String,
    pub price: f64,
    pub is_active: bool,
    pub sort_order: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OrderItem {
    pub item_id: i64,
    pub name: String,
    pub price: f64,
    pub qty: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Order {
    pub id: i64,
    pub items: Vec<OrderItem>,
    pub subtotal: f64,
    pub total: f64,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Settings {
    pub shop_name: String,
    pub shop_address: String,
    pub bill_footer: String,
    pub printer_name: String,
}
```

### 3.2 — Menu commands (src-tauri/src/commands/menu.rs)

Implement the following commands. Each must return `Result<T, String>` where the error string is shown directly to the user.

```rust
// Required commands:
#[tauri::command] pub fn get_categories() -> Result<Vec<Category>, String>
#[tauri::command] pub fn create_category(name: String) -> Result<Category, String>
#[tauri::command] pub fn update_category(id: i64, name: String, is_active: bool, sort_order: i64) -> Result<(), String>
#[tauri::command] pub fn delete_category(id: i64) -> Result<(), String>  // soft delete (is_active=0)

#[tauri::command] pub fn get_items(category_id: Option<i64>) -> Result<Vec<Item>, String>
#[tauri::command] pub fn create_item(category_id: i64, name: String, price: f64) -> Result<Item, String>
#[tauri::command] pub fn update_item(id: i64, name: String, price: f64, is_active: bool) -> Result<(), String>
#[tauri::command] pub fn delete_item(id: i64) -> Result<(), String>  // soft delete
```

**Implementation pattern for all commands:**
```rust
#[tauri::command]
pub fn get_categories() -> Result<Vec<Category>, String> {
    let db = crate::db::DB.get()
        .ok_or("DB not initialised")?
        .lock()
        .map_err(|e| e.to_string())?;

    let mut stmt = db.prepare(
        "SELECT id, name, sort_order, is_active FROM categories WHERE is_active=1 ORDER BY sort_order"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map([], |row| {
        Ok(Category {
            id: row.get(0)?,
            name: row.get(1)?,
            sort_order: row.get(2)?,
            is_active: row.get::<_, i64>(3)? == 1,
        })
    }).map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}
```

### 3.3 — Orders commands (src-tauri/src/commands/orders.rs)

```rust
#[tauri::command] pub fn save_order(items: Vec<OrderItem>, subtotal: f64, total: f64) -> Result<i64, String>
// Returns the new order ID

#[tauri::command] pub fn get_orders(date: Option<String>) -> Result<Vec<Order>, String>
// date format: "YYYY-MM-DD" — if None, returns last 100 orders

#[tauri::command]
pub fn get_summary() -> Result<serde_json::Value, String>
// Returns: { today_total, today_count, week_total }
```

### 3.4 — Settings commands (src-tauri/src/commands/settings.rs)

```rust
#[tauri::command] pub fn get_settings() -> Result<Settings, String>
// Returns Settings struct with defaults if not set

#[tauri::command] pub fn save_settings(settings: Settings) -> Result<(), String>
// Upsert each field into the settings key-value table
```

### Gate Check — Phase 3
- [ ] All commands registered in `invoke_handler!` in main.rs
- [ ] `get_categories()` returns empty array `[]` on fresh install
- [ ] `create_category("Tea")` returns `{ id: 1, name: "Tea", ... }`
- [ ] `get_categories()` after creation returns the created category
- [ ] `delete_category(1)` then `get_categories()` returns empty again
- [ ] `save_order(...)` returns an integer ID
- [ ] `get_summary()` returns correct today totals

---

## Phase 4 — License System

**Goal:** On first launch, if no license exists in DB, show the license screen. After entering a valid key, store it and never show again. App works offline after activation.

### 4.1 — License server deployment

The license server lives in `license-server/server.js`. Deploy it to Render.com:

1. Push `license-server/` as a separate GitHub repo
2. Create a new Web Service on Render.com
3. Build command: `npm install`
4. Start command: `node server.js`
5. Add environment variable: `ADMIN_SECRET=<your_secret_here>`
6. Note the deployed URL (e.g. `https://billeasy-license.onrender.com`)
7. Replace `https://your-license-server.onrender.com` in `tauri.conf.json` CSP

### 4.2 — License Rust command (src-tauri/src/commands/license.rs)

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct LicenseStatus {
    pub valid: bool,
    pub vendor_name: Option<String>,
    pub expires_at: Option<String>,
    pub message: Option<String>,
}

#[tauri::command]
pub fn get_license_status() -> Result<LicenseStatus, String> {
    // Read from SQLite license table
    // Check: expires_at > now
    // Return LicenseStatus
}

#[tauri::command]
pub async fn validate_license(key: String, machine_id: String) -> Result<LicenseStatus, String> {
    // 1. POST to license server with key + machine_id
    // 2. If valid: INSERT into license table
    // 3. Return result
    // HTTP client: use reqwest crate
}
```

Add to `Cargo.toml`:
```toml
reqwest = { version = "0.12", features = ["json", "blocking"] }
```

**Machine ID generation:**
Use the Windows registry key `HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Cryptography\MachineGuid` as the machine identifier. This is stable across reboots and reinstalls. Read it using the `winreg` crate:
```toml
[target.'cfg(windows)'.dependencies]
winreg = "0.52"
```

### 4.3 — LicenseScreen.jsx

This React screen is shown when `get_license_status()` returns `{ valid: false }`.

**Behaviour:**
- Input field for the license key (format: `BILL-XXXX-XXXX-XXXX`)
- Auto-uppercase on type
- "Activate" button calls `invoke("validate_license", { key, machineId })`
- Machine ID is retrieved from a Tauri command `get_machine_id()`
- On success: navigate to main app
- On failure: show specific error message from server
- Show a loading spinner during validation (can take up to 8 seconds on cold Render start)

### 4.4 — License gate in App.jsx

```jsx
// App.jsx startup flow:
// 1. Call invoke("get_license_status")
// 2. If valid → show main app (POS screen)
// 3. If not valid → show LicenseScreen
// 4. LicenseScreen calls onActivated() on success → show main app
// Show a neutral loading screen between steps 1 and 2/3
```

### Gate Check — Phase 4
- [ ] Fresh install shows LicenseScreen
- [ ] Entering a wrong key shows a clear error message
- [ ] Entering a valid key (create one on the server) unlocks the app
- [ ] On second launch, LicenseScreen does not appear
- [ ] App works normally after disconnecting internet (offline test)

---

## Phase 5 — Setup Screen (Menu Builder)

**Goal:** The shop owner can create categories, add items with prices, reorder them, and toggle visibility. This screen is used infrequently and does not need to be optimised for speed.

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Setup — Menu Configuration                    [+ New Cat.] │
├──────────────────────┬──────────────────────────────────────┤
│  CATEGORIES          │  ITEMS IN: Cold Drinks               │
│  ─────────────       │  ───────────────────────  [+ Item]   │
│  ▶ Cold Drinks  ✓   │                                      │
│    Snacks       ✓   │  Name          Price   Active  Edit  │
│    Bakery       ✓   │  Mango Juice   ₹40     [ON]   [✎]   │
│    Hot Drinks   ✗   │  Cola          ₹30     [ON]   [✎]   │
│                      │  Lassi         ₹35     [ON]   [✎]   │
│  [+ New Category]    │                                      │
└──────────────────────┴──────────────────────────────────────┘
```

### Components

**CategoryList component:**
- List of all categories from `get_categories()`
- Click to select (highlights the row, loads items on right)
- Toggle button (active/inactive) — calls `update_category`
- Delete button (soft delete) — calls `delete_category`
- Inline rename on double-click

**ItemTable component:**
- Table of items for the selected category
- Inline price editing (click price → number input → blur to save)
- Toggle active/inactive per item
- Delete item
- "Add Item" row at the bottom with name + price inputs

**AddCategoryModal:**
- Simple modal with one input: category name
- Save → `create_category(name)` → refresh list → select new category

### State management

Use `menuStore.js` (Zustand):
```js
const useMenuStore = create((set, get) => ({
  categories: [],
  items: [],
  selectedCategoryId: null,
  
  fetchCategories: async () => { /* invoke get_categories */ },
  fetchItems: async (categoryId) => { /* invoke get_items */ },
  createCategory: async (name) => { /* invoke + refresh */ },
  // ... etc
}))
```

### Gate Check — Phase 5
- [ ] Can create a category and see it appear
- [ ] Can add items to a category with name and price
- [ ] Can edit a price inline
- [ ] Can toggle an item off — it no longer appears in category list
- [ ] Deleting a category hides it from the list
- [ ] Page refreshes (from POS back to Setup) preserve all data

---

## Phase 6 — POS Screen (Billing)

**Goal:** The fastest possible billing interface. A cashier must be able to add items, adjust quantities, and reach the print button without thinking. No mistakes, no slow interactions.

### Layout (1280×800)

```
┌─────────────────────────────────────────────────────────┬──────────────┐
│ [Cold Drinks] [Snacks] [Bakery] [Hot Drinks]            │   CART       │
├─────────────────────────────────────────────────────────┤              │
│                                                         │ Mango Juice  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │ x2      ₹80  │
│  │          │  │          │  │          │             │              │
│  │  Mango   │  │   Cola   │  │  Lassi   │             │ Cola         │
│  │  Juice   │  │          │  │          │             │ x1      ₹30  │
│  │  ₹40     │  │  ₹30     │  │  ₹35     │             │              │
│  │          │  │          │  │          │             │ ─────────── │
│  │ [−] 2 [+]│  │ [−] 1 [+]│  │  [+]    │             │ TOTAL        │
│  └──────────┘  └──────────┘  └──────────┘             │ ₹110         │
│                                                         │              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │              │
│  │          │  │          │  │          │             │              │
│  │  ...     │  │  ...     │  │  ...     │             │ 🖨 Print     │
│  └──────────┘  └──────────┘  └──────────┘             │    & Clear   │
└─────────────────────────────────────────────────────────┴──────────────┘
```

### Design rules (non-negotiable)

1. Item cards must be at least 140×120px — large enough for a finger tap
2. The Print & Clear button must be at least 56px tall and full cart-panel width
3. The quantity display must be at least 24px font size
4. Items with qty > 0 must have a visually distinct card (different background or border)
5. Category tabs must be horizontally scrollable if items overflow
6. No modals during billing — everything is on one screen

### ItemCard component

```jsx
function ItemCard({ item }) {
  const qty = useCartStore(s => s.quantities[item.id] ?? 0)
  const increment = useCartStore(s => s.increment)
  const decrement = useCartStore(s => s.decrement)

  return (
    <div className={`item-card ${qty > 0 ? 'item-card--active' : ''}`}>
      <div className="item-name">{item.name}</div>
      <div className="item-price">₹{item.price}</div>
      {qty === 0 ? (
        <button className="add-btn" onClick={() => increment(item)}>+</button>
      ) : (
        <div className="qty-stepper">
          <button onClick={() => decrement(item.id)}>−</button>
          <span>{qty}</span>
          <button onClick={() => increment(item)}>+</button>
        </div>
      )}
    </div>
  )
}
```

### Cart store (src/store/cartStore.js)

```js
const useCartStore = create((set, get) => ({
  quantities: {},      // { [itemId]: count }
  items: {},           // { [itemId]: { id, name, price } }

  increment: (item) => set(s => ({
    quantities: { ...s.quantities, [item.id]: (s.quantities[item.id] ?? 0) + 1 },
    items: { ...s.items, [item.id]: item }
  })),

  decrement: (itemId) => set(s => {
    const newQty = (s.quantities[itemId] ?? 0) - 1
    const q = { ...s.quantities }
    if (newQty <= 0) delete q[itemId]
    else q[itemId] = newQty
    return { quantities: q }
  }),

  clear: () => set({ quantities: {}, items: {} }),

  getCartItems: () => {
    const s = get()
    return Object.entries(s.quantities)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => ({ ...s.items[id], qty, total: s.items[id].price * qty }))
  },

  getTotal: () => {
    return get().getCartItems().reduce((sum, item) => sum + item.total, 0)
  }
}))
```

### Keyboard shortcut

Bind `Enter` key to the Print & Clear action. This allows cashiers to use just the keyboard:
```jsx
useEffect(() => {
  const handler = (e) => {
    if (e.key === 'Enter' && cartItems.length > 0 && !isPrinting) {
      handlePrintAndClear()
    }
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}, [cartItems, isPrinting])
```

### Print & Clear flow

```
1. Cashier presses "Print & Clear" (or Enter)
2. Button shows loading state, disabled
3. invoke("save_order", { items, subtotal, total })
   → returns orderId
4. invoke("print_receipt", { orderId, items, total, settings })
   → Rust sends to USB printer
5. On success: cartStore.clear()
   → Screen resets instantly
6. On error: show toast "Print failed — check printer"
   → Cart is NOT cleared (so cashier can retry)
```

### Gate Check — Phase 6
- [ ] All active items visible, grouped by category tab
- [ ] Tapping + increases qty, card highlights
- [ ] Tapping − decreases qty, disappears at 0
- [ ] Cart panel shows correct items, qty, per-item total
- [ ] Grand total is correct
- [ ] Enter key triggers print flow
- [ ] Cart clears immediately after successful print
- [ ] If print fails, cart is preserved

---

## Phase 7 — Print Integration

**Goal:** USB thermal printer (Helett H80I, 80mm) receives and prints a formatted ESC/POS receipt.

### 7.1 — Add escpos Rust crate

In `Cargo.toml`:
```toml
escpos = "0.5"
serialport = "4"
```

### 7.2 — print.rs command

```rust
use escpos::driver::*;
use escpos::printer::Printer;
use escpos::utils::*;

#[tauri::command]
pub fn print_receipt(
    order_id: i64,
    items: Vec<crate::models::OrderItem>,
    total: f64,
    shop_name: String,
    shop_address: String,
    bill_footer: String,
) -> Result<(), String> {
    // Find the USB printer port
    // On Windows it will be a path like "USB001" or via the Windows spooler
    let driver = ConsoleDriver::open(true);  // replace with UsbDriver in production
    let mut printer = Printer::new(driver, Protocol::default(), None);

    printer
        .init()
        .map_err(|e| e.to_string())?
        .justify(JustifyMode::CENTER)
        .bold(true)
        .writeln(&shop_name)
        .map_err(|e| e.to_string())?
        .bold(false)
        .writeln(&shop_address)
        .map_err(|e| e.to_string())?
        .writeln(&chrono::Local::now().format("%d/%m/%Y %I:%M %p").to_string())
        .map_err(|e| e.to_string())?
        .writeln(&format!("Bill #{}", order_id))
        .map_err(|e| e.to_string())?
        .writeln("--------------------------------")
        .map_err(|e| e.to_string())?;

    printer.justify(JustifyMode::LEFT).map_err(|e| e.to_string())?;

    for item in &items {
        let line = format!("{:<24} x{} {:>8}",
            &item.name[..item.name.len().min(24)],
            item.qty,
            format!("Rs.{:.0}", item.price * item.qty as f64)
        );
        printer.writeln(&line).map_err(|e| e.to_string())?;
    }

    printer
        .writeln("--------------------------------")
        .map_err(|e| e.to_string())?
        .bold(true)
        .writeln(&format!("{:<24} {:>8}", "TOTAL", format!("Rs.{:.0}", total)))
        .map_err(|e| e.to_string())?
        .bold(false)
        .feed(3)
        .map_err(|e| e.to_string())?
        .justify(JustifyMode::CENTER)
        .map_err(|e| e.to_string())?
        .writeln(&bill_footer)
        .map_err(|e| e.to_string())?
        .feed(2)
        .map_err(|e| e.to_string())?
        .cut(CutMode::Partial)
        .map_err(|e| e.to_string())?
        .print()
        .map_err(|e| e.to_string())
}
```

### 7.3 — Printer setup in Settings

In the Setup screen, add a "Printer" section:
- A text input for the printer name/port
- A "Test Print" button that prints a test receipt
- This value is saved in the `settings` table under key `printer_name`
- Rust reads this from DB at print time

### 7.4 — Fallback print method

If the escpos crate fails to find the printer, fall back to the Windows print spooler:
```rust
// Windows fallback: use the Windows API via std::process::Command
std::process::Command::new("print")
    .arg("/D:USB001")
    .arg(temp_receipt_path)
    .output()
    .map_err(|e| e.to_string())?;
```

### Gate Check — Phase 7
- [ ] Test print button produces a receipt
- [ ] Receipt shows: shop name, address, date, bill number, items, total, footer
- [ ] Receipt is cut cleanly by the auto-cutter
- [ ] Printing takes under 2 seconds
- [ ] A missing printer shows a clear error (not a crash)

---

## Phase 8 — History Screen

**Goal:** The shop owner can see past bills, today's total revenue, and reprint any bill.

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  History                              [Date picker] [Filter]│
├─────────────────────────────────────────────────────────────┤
│  Today: ₹4,280 from 47 bills          This week: ₹28,440   │
├────────────┬──────────────────────────────┬─────────────────┤
│  Time      │  Items                       │  Total   Action │
├────────────┼──────────────────────────────┼─────────────────┤
│  06:32 PM  │  Mango Juice x2, Cola x1     │  ₹110    [🖨]  │
│  06:28 PM  │  Lassi x3, Samosa x2         │  ₹185    [🖨]  │
│  06:15 PM  │  ...                         │  ...     [🖨]  │
└────────────┴──────────────────────────────┴─────────────────┘
```

### Components

**SummaryBar component:**
- Calls `get_summary()` on mount
- Shows today's total + count, week total
- Refreshes when the tab is visited

**OrderTable component:**
- Paginated list of orders (20 per page)
- Reprint button calls `print_receipt` with stored order data
- Date filter (date picker) calls `get_orders({ date })` on change

### Gate Check — Phase 8
- [ ] Today's total is correct after completing bills in Phase 6
- [ ] All bills appear in the list in reverse chronological order
- [ ] Reprint button prints a correct duplicate
- [ ] Date filter works correctly
- [ ] Page loads in under 500ms

---

## Phase 9 — Auto Updater

**Goal:** When a new version is released on GitHub, the app shows an update banner. The vendor chooses when to install.

### 9.1 — Configure tauri-plugin-updater

In `Cargo.toml`:
```toml
[dependencies]
tauri-plugin-updater = "2"
```

In `main.rs`:
```rust
.plugin(tauri_plugin_updater::Builder::new().build())
```

In `tauri.conf.json`:
```json
{
  "plugins": {
    "updater": {
      "pubkey": "YOUR_PUBLIC_KEY_HERE",
      "endpoints": [
        "https://github.com/YOUR_USERNAME/billeasy-releases/releases/latest/download/latest.json"
      ]
    }
  }
}
```

Generate the signing key pair:
```bash
cargo tauri signer generate -w ~/.tauri/billeasy.key
```
The public key goes in `tauri.conf.json`. The private key is used during build to sign releases. **Keep the private key secret. Back it up.**

### 9.2 — Update check flow

```jsx
// In App.jsx, after license check passes:
import { check } from '@tauri-apps/plugin-updater'

useEffect(() => {
  // Check for updates 5 seconds after app loads
  const timer = setTimeout(async () => {
    try {
      const update = await check()
      if (update?.available) {
        setUpdateAvailable(update)
      }
    } catch (e) {
      // Silently ignore — no internet or server down
    }
  }, 5000)
  return () => clearTimeout(timer)
}, [])
```

### 9.3 — UpdateBanner component

```jsx
function UpdateBanner({ update }) {
  const [installing, setInstalling] = useState(false)

  const handleInstall = async () => {
    setInstalling(true)
    await update.downloadAndInstall()
    await relaunch()
  }

  return (
    <div className="update-banner">
      <span>New version {update.version} available</span>
      <button onClick={handleInstall} disabled={installing}>
        {installing ? 'Installing...' : 'Restart & Update'}
      </button>
      <button onClick={() => setUpdateAvailable(null)}>Later</button>
    </div>
  )
}
```

### 9.4 — GitHub release process

When releasing a new version:
```bash
# 1. Update version in src-tauri/tauri.conf.json and Cargo.toml
# 2. Build and sign:
cargo tauri build
# 3. Create GitHub release at: https://github.com/YOUR_USERNAME/billeasy-releases
# 4. Upload: billeasy_X.X.X_x64-setup.exe and latest.json
# The latest.json file is generated by tauri build automatically
```

### Gate Check — Phase 9
- [ ] Build completes without errors
- [ ] Simulate update: change version in `latest.json` on GitHub to a higher number
- [ ] App shows update banner within 5 seconds of launch
- [ ] Clicking "Later" dismisses banner for the session
- [ ] Clicking "Restart & Update" downloads and relaunches the app

---

## Phase 10 — Build & Distribution

**Goal:** A single `.exe` file that any vendor can install on a fresh Windows 10/11 PC.

### 10.1 — Production build

```bash
cargo tauri build
```

Output location:
```
src-tauri/target/release/bundle/nsis/BillEasy_1.0.0_x64-setup.exe
```

Expected file size: 5–15 MB (if bundled with WebView2 bootstrapper) or 3–8 MB (if targeting Windows 10/11 only, which already has WebView2 via Edge).

### 10.2 — WebView2 bundling strategy

Windows 10 and 11 include WebView2 via Microsoft Edge — no extra install needed.

If you must support older Windows, add the WebView2 bootstrapper:
```json
// tauri.conf.json
{
  "bundle": {
    "windows": {
      "webviewInstallMode": {
        "type": "downloadBootstrapper"
      }
    }
  }
}
```

### 10.3 — SmartScreen strategy (no certificate — see next section)

### 10.4 — Distribution workflow

**For first 1–10 vendors (pen drive install):**
1. Copy `BillEasy_1.0.0_x64-setup.exe` to a USB pen drive
2. Visit the vendor's shop
3. Plug in pen drive → right-click → Run as Administrator
4. SmartScreen may appear — click "More info" → "Run anyway"
5. Installer completes in under 30 seconds
6. App launches → vendor enters license key
7. Test a print before you leave

**For remote distribution (Google Drive):**
1. Upload `.exe` to a shared Google Drive folder
2. Share the link via WhatsApp
3. Vendor downloads → right-click → Properties → check "Unblock" → OK
4. Then double-click to run
5. SmartScreen → "More info" → "Run anyway"

**Include a short WhatsApp message with every distribution:**
```
BillEasy installer is ready. Steps:
1. Download the file
2. Right-click → Properties → tick "Unblock" → OK
3. Double-click to install
4. Click "More info" then "Run anyway" if Windows asks
5. Enter your license key: XXXX-XXXX-XXXX-XXXX
Call me if anything doesn't work.
```

### Gate Check — Phase 10
- [ ] `.exe` installs successfully on a fresh Windows 10 machine (not your dev machine)
- [ ] App launches without developer tools or Node.js installed
- [ ] Database is created correctly on first run
- [ ] Printer test works
- [ ] Uninstall via Windows "Add or Remove Programs" leaves no leftover files

---

## Data Models

### settings table
```sql
key   TEXT PRIMARY KEY   -- e.g. "shop_name", "shop_address", "bill_footer", "printer_name"
value TEXT NOT NULL
```

### categories table
```sql
id         INTEGER PRIMARY KEY AUTOINCREMENT
name       TEXT NOT NULL
sort_order INTEGER DEFAULT 0
is_active  INTEGER DEFAULT 1   -- 0 = soft deleted
```

### items table
```sql
id          INTEGER PRIMARY KEY AUTOINCREMENT
category_id INTEGER NOT NULL REFERENCES categories(id)
name        TEXT NOT NULL
price       REAL NOT NULL CHECK(price >= 0)
is_active   INTEGER DEFAULT 1
sort_order  INTEGER DEFAULT 0
```

### orders table
```sql
id         INTEGER PRIMARY KEY AUTOINCREMENT
items_json TEXT NOT NULL   -- JSON array of { item_id, name, price, qty }
subtotal   REAL NOT NULL
total      REAL NOT NULL
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
```

### license table
```sql
key          TEXT NOT NULL
machine_id   TEXT NOT NULL
vendor_name  TEXT NOT NULL
expires_at   TEXT NOT NULL   -- "YYYY-MM-DD"
activated_at DATETIME DEFAULT CURRENT_TIMESTAMP
```

---

## API Contract (Tauri Commands)

Every command follows this contract:
- Returns `Result<T, String>` from Rust
- Frontend receives `T` on success or throws an error string
- Frontend must catch all invoke() calls in try/catch

```
get_categories()                        → Category[]
create_category(name)                   → Category
update_category(id, name, is_active, sort_order) → void
delete_category(id)                     → void

get_items(category_id?)                 → Item[]
create_item(category_id, name, price)   → Item
update_item(id, name, price, is_active) → void
delete_item(id)                         → void

save_order(items, subtotal, total)      → i64 (order ID)
get_orders(date?)                       → Order[]
get_summary()                           → { today_total, today_count, week_total }

get_settings()                          → Settings
save_settings(settings)                 → void

print_receipt(order_id, items, total, shop_name, shop_address, bill_footer) → void

validate_license(key, machine_id)       → LicenseStatus
get_license_status()                    → LicenseStatus
get_machine_id()                        → String

check_update()                          → void
install_update()                        → void
```

---

## Security Rules

These rules must not be violated under any circumstances:

1. **CSP is always on.** Never set `"dangerousDisableAssetCspModification": true` in production.

2. **Allowlist is minimal.** Only enable the Tauri APIs the app actually uses. `shell.execute` must be `false`. `fs` scope must be limited to `$APPDATA/billeasy/*`.

3. **License server is HTTPS only.** Never send the license key over HTTP. The CSP must only allow the specific license server domain.

4. **No `eval()` anywhere** in the React codebase. Tauri's CSP will block it, but do not rely on that — remove it at the source.

5. **Database file is never exposed to the frontend.** The React code never gets a file path. All DB access goes through typed Rust commands.

6. **No shell commands from frontend.** The frontend cannot execute shell commands even if it tries — the allowlist prevents it.

7. **License key must not be logged.** The Rust license command must not log the key value to the console or to any file.

8. **Printer port is configurable, not hardcoded.** Never hardcode `USB001` or any port. It must come from settings.

---

## SmartScreen Strategy (No Certificate)

Since we are not purchasing a code signing certificate, this is the exact strategy for every distribution scenario:

### Scenario A — You install it yourself (best for first 10 vendors)
- Copy `.exe` to a USB pen drive
- Plug in at vendor's shop
- Right-click installer → "Run as administrator"
- If SmartScreen appears: "More info" → "Run anyway"
- Zero cost, zero friction, you control the install

### Scenario B — Vendor downloads from Google Drive
1. Vendor downloads the `.exe`
2. They right-click the downloaded file → Properties
3. At the bottom: check the "Unblock" checkbox → click OK
4. Now double-click to run — SmartScreen still may appear
5. "More info" → "Run anyway"

Include a screenshot guide for this in your WhatsApp message.

### Scenario C — Building reputation over time (free, slow)
SmartScreen reputation builds automatically after approximately 15,000 clean downloads. At that scale, you will have revenue to pay for an OV certificate anyway.

### What NOT to do:
- Do not ask vendors to disable Windows Defender
- Do not ask vendors to disable SmartScreen entirely
- Do not distribute through unofficial channels

---

## Risk Register

| ID | Risk | Probability | Impact | Mitigation |
|---|---|---|---|---|
| R01 | WebView2 not present (Windows 7/8) | Medium | High | State minimum requirement: Windows 10. Add WebView2 bootstrapper to installer. |
| R02 | USB printer on wrong port after plug/unplug | High | Medium | Make printer port configurable in Settings. Add "Test Print" in Setup to verify. |
| R03 | SQLite corruption on power cut | Low | High | WAL mode enabled. Auto-backup to dated file daily. Show "Last backup" indicator. |
| R04 | License server cold start delay (Render free tier) | High | Medium | Show spinner with "Please wait up to 30 seconds" on license screen. Only affects first activation. |
| R05 | Bad update breaks billing at 9AM | Low | Critical | Never auto-install. Always prompt. Test update on one device before publishing to all. |
| R06 | Antivirus false positive on `.exe` | Medium | Medium | Upload to VirusTotal after each build. Share scan link in distribution message. |
| R07 | Vendor loses PC / hard drive fails | Medium | High | Show "Backup your data" reminder monthly. One-click backup to Desktop in Settings. |
| R08 | Private signing key lost | Low | Critical | Back up `~/.tauri/billeasy.key` to encrypted storage immediately after generation. Without it you cannot publish verified updates. |
| R09 | Render.com free tier goes down | Low | Low | After activation, app runs fully offline. Only new activations are affected. |
| R10 | Printer driver conflict after Windows Update | Low | Medium | Document how to reinstall driver. Keep driver installer in the support folder on Google Drive. |

---

## Environment Variables & Config

### Development
```bash
# No environment variables required for development
# All config is in tauri.conf.json and Cargo.toml
cargo tauri dev
```

### License server (Render.com)
```
ADMIN_SECRET=<your_strong_secret_here>   # for admin API endpoints
PORT=3001                                 # auto-set by Render
```

### Build (CI or local)
```bash
# Required for publishing updates to GitHub Releases:
TAURI_SIGNING_PRIVATE_KEY=<contents of ~/.tauri/billeasy.key>
TAURI_SIGNING_PRIVATE_KEY_PASSWORD=<your key password>

# GitHub token for uploading releases:
GITHUB_TOKEN=<personal access token with repo scope>
```

### Config constants in source (not env vars)
```
LICENSE_SERVER_URL  → hardcoded in license.rs (not user-configurable)
UPDATE_CHECK_DELAY  → 5000ms hardcoded in App.jsx
DB_FILENAME         → "billeasy.db" hardcoded in db.rs
```

---

*End of BillEasy Implementation Plan v1.0.0*
