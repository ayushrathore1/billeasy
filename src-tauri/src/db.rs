use rusqlite::{Connection, Result};
use once_cell::sync::OnceCell;
use std::sync::Mutex;

pub static DB: OnceCell<Mutex<Connection>> = OnceCell::new();

pub fn init(app_data_dir: &str) -> Result<()> {
    let path = format!("{}/billeasy.db", app_data_dir);
    let conn = Connection::open(&path)?;

    // Enable WAL mode for crash safety and concurrent reads
    conn.execute_batch("PRAGMA journal_mode=WAL;")?;
    conn.execute_batch("PRAGMA foreign_keys=ON;")?;
    conn.execute_batch("PRAGMA synchronous=NORMAL;")?;

    // Run schema migrations (idempotent)
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
    key          TEXT NOT NULL,
    machine_id   TEXT NOT NULL,
    vendor_name  TEXT NOT NULL,
    expires_at   TEXT NOT NULL,
    activated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
";
