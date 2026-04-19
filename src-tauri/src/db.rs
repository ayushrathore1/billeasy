use rusqlite::{Connection, Result};
use once_cell::sync::OnceCell;
use std::sync::Mutex;

pub static DB: OnceCell<Mutex<Connection>> = OnceCell::new();

/// Path to the Documents/BillEasy/ folder (survives uninstalls)
pub static DATA_DIR: OnceCell<String> = OnceCell::new();

/// Determine the persistent data directory: Documents/BillEasy/
/// This folder survives app uninstall/reinstall.
/// Falls back to app_data_dir if Documents is unavailable.
fn get_persistent_dir(fallback: &str) -> String {
    // Try the user's Documents folder first
    if let Some(docs) = dirs::document_dir() {
        let dir = docs.join("BillEasy");
        if std::fs::create_dir_all(&dir).is_ok() {
            return dir.to_string_lossy().to_string();
        }
    }
    // Fallback to Tauri's app data dir (still works, just less visible)
    fallback.to_string()
}

pub fn init(app_data_dir: &str) -> Result<()> {
    let persistent_dir = get_persistent_dir(app_data_dir);
    let persistent_db_path = format!("{}/billeasy.db", persistent_dir);
    let old_db_path = format!("{}/billeasy.db", app_data_dir);

    // Migration: if DB exists in old location but NOT in persistent dir, copy it
    if std::path::Path::new(&old_db_path).exists()
       && !std::path::Path::new(&persistent_db_path).exists()
    {
        let _ = std::fs::copy(&old_db_path, &persistent_db_path);
    }

    // Open from persistent directory (Documents/BillEasy/)
    let conn = Connection::open(&persistent_db_path)?;

    // Enable WAL mode for crash safety and concurrent reads
    conn.execute_batch("PRAGMA journal_mode=WAL;")?;
    conn.execute_batch("PRAGMA foreign_keys=ON;")?;
    conn.execute_batch("PRAGMA synchronous=NORMAL;")?;

    // Run schema migrations (idempotent)
    conn.execute_batch(SCHEMA)?;

    // Safe column migrations (ignore errors if column already exists)
    let _ = conn.execute_batch("ALTER TABLE items ADD COLUMN image_url TEXT DEFAULT '';");

    // Seed default menu on first install (only if no categories exist)
    seed_default_menu(&conn);

    // Store persistent dir for CSV export
    let _ = DATA_DIR.set(persistent_dir);

    DB.set(Mutex::new(conn))
        .map_err(|_| rusqlite::Error::InvalidQuery)?;

    Ok(())
}

/// Seed the default menu on first install. Only runs if categories table is empty.
/// All items are fully editable by the user through the Setup page.
fn seed_default_menu(conn: &Connection) {
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM categories", [], |r| r.get(0))
        .unwrap_or(0);
    if count > 0 {
        return; // Already has data — don't overwrite
    }

    let menu: &[(&str, &[(&str, f64)])] = &[
        ("Chinese", &[
            ("Chilly Paneer", 100.0),
            ("Honey Chilli Potato", 120.0),
            ("Garlic Chili Potato", 130.0),
            ("Chili Potato", 80.0),
            ("Singapore Noodles", 100.0),
            ("Chili Garlic Noodles", 90.0),
            ("Hakka Noodles", 80.0),
            ("Veg Noodles", 60.0),
        ]),
        ("Mojito", &[
            ("Classic Mojito", 70.0),
            ("Black Cobra", 80.0),
            ("Blue Ocean", 80.0),
            ("Virgin Mojito", 80.0),
            ("Apple Peach Mojito", 80.0),
            ("Watermelon Mojito", 80.0),
            ("Blackcurrant Mojito", 80.0),
            ("Strawberry Mojito", 80.0),
        ]),
        ("Wrap", &[
            ("Veg Wrap", 70.0),
            ("Paneer Wrap", 80.0),
            ("SPB Wrap", 90.0),
        ]),
        ("Pasta", &[
            ("Red Sauce Pasta", 60.0),
            ("White Sauce Pasta", 70.0),
            ("Cheese Red Pasta", 80.0),
            ("Tandoori Sauce Pasta", 80.0),
            ("Makhani Sauce Pasta", 80.0),
            ("Pink Sauce Pasta", 80.0),
        ]),
        ("French Fries", &[
            ("Salt Fries", 50.0),
            ("Masala Fries", 50.0),
            ("Peri Peri Fries", 60.0),
            ("Cheese Loaded Fries", 70.0),
            ("Tandoori Fries", 80.0),
        ]),
        ("Coffee & Shakes", &[
            ("Vanilla Shake", 60.0),
            ("Strawberry Shake", 60.0),
            ("Butterscotch Shake", 60.0),
            ("Pineapple Shake", 60.0),
            ("Oreo Shake", 60.0),
            ("Cold Coffee", 60.0),
            ("KitKat Shake", 80.0),
            ("Blueberry Shake", 80.0),
            ("Rajbhog Shake", 100.0),
            ("American Nuts Shake", 100.0),
            ("Kesar Pista Shake", 100.0),
            ("Rose Milk Shake", 100.0),
            ("Pan Shake", 100.0),
            ("Black Current Shake", 100.0),
            ("Anjeer Shake", 110.0),
            ("Cold Coffee with Ice Cream", 70.0),
            ("Papaya Shake", 50.0),
            ("Mango Shake", 60.0),
            ("Chocolate Shake", 60.0),
        ]),
        ("Sandwich", &[
            ("Veg Sandwich", 70.0),
            ("Paneer Sandwich", 80.0),
            ("Corn Mayo Sandwich", 80.0),
            ("Tandoori Sandwich", 80.0),
            ("Paneer Special Sandwich", 90.0),
            ("Sev Onion Sandwich", 80.0),
            ("Tandoori Paneer Corn Sandwich", 100.0),
            ("Pizza Sandwich", 120.0),
        ]),
        ("Maggi", &[
            ("Plain Maggi", 50.0),
            ("Veg Maggi", 60.0),
            ("Paneer Maggi", 70.0),
            ("Tandoori Maggi", 70.0),
            ("Corn Cheese Maggi", 70.0),
            ("Cheese Butter Maggi", 70.0),
            ("Butter Maggi", 60.0),
            ("Pizza Maggi", 80.0),
            ("Pizza Paneer Maggi", 90.0),
            ("Tandoori Paneer Maggi", 90.0),
        ]),
        ("Pizza", &[
            ("OTC Pizza", 120.0),
            ("Sweet Corn Pizza", 140.0),
            ("Paneer Pizza", 170.0),
            ("Double Cheese Pizza", 200.0),
            ("Four In One Pizza", 230.0),
            ("Golden Baby Pizza", 250.0),
            ("Extra Cheese Loaded Pizza", 270.0),
            ("Tandoori Paneer Pizza", 290.0),
            ("Makhani Pizza", 220.0),
            ("Makhani Paneer Pizza", 250.0),
            ("Tandoori Pizza", 220.0),
            ("SPB Special Pizza", 300.0),
        ]),
        ("Burger", &[
            ("Aloo Tikki Burger", 50.0),
            ("Veg Burger", 60.0),
            ("Veg Paneer Burger", 60.0),
            ("Veg Cheese Burger", 60.0),
            ("Tandoori Burger", 70.0),
            ("Schezwan Burger", 70.0),
            ("Makhani Burger", 70.0),
            ("Makhani Paneer Burger", 80.0),
            ("Tandoori Paneer Burger", 80.0),
            ("Chilly Burger", 60.0),
            ("Mexican Burger", 60.0),
            ("SPB Special Burger", 80.0),
        ]),
        ("Patties", &[
            ("Plain Masala Patties", 15.0),
            ("Masala Patties", 25.0),
            ("Paneer Patties", 35.0),
            ("Tandoori Patties", 40.0),
            ("Cheese Patties", 40.0),
            ("Cheese Tandoori Patties", 50.0),
            ("Cheese Paneer Patties", 50.0),
            ("Cheese Tandoori Paneer Patties", 60.0),
            ("Tandoori Paneer Patties", 50.0),
            ("Tandoori Mayo Patties", 50.0),
            ("Cheese Tandoori Paneer Mayo", 70.0),
            ("Mayonnaise Patties", 25.0),
        ]),
        ("Pastries", &[
            ("Vanilla Pastry", 30.0),
            ("Butterscotch Pastry", 40.0),
            ("Black Forest Pastry", 40.0),
            ("Dark Chocolate Pastry", 50.0),
        ]),
        ("Cakes", &[
            ("Vanilla Cake 1 Pound", 200.0),
            ("Vanilla Cake 2 Pound", 380.0),
            ("Strawberry Cake 1 Pound", 220.0),
            ("Strawberry Cake 2 Pound", 420.0),
            ("Butterscotch Cake 1 Pound", 250.0),
            ("Butterscotch Cake 2 Pound", 460.0),
            ("Black Forest Cake 1 Pound", 270.0),
            ("Black Forest Cake 2 Pound", 480.0),
            ("Dark Chocolate Cake 1 Pound", 300.0),
            ("Dark Chocolate Cake 2 Pound", 550.0),
        ]),
        ("Momos", &[
            ("Veg Momos", 60.0),
            ("Veg Fried Momos", 70.0),
            ("Paneer Steam Momos", 80.0),
            ("Paneer Fried Momos", 90.0),
            ("Veg Kurkure Momos", 80.0),
            ("Tandoori Veg Fried Momos", 100.0),
            ("Paneer Kurkure Momos", 100.0),
            ("Tandoori Paneer Fried Momos", 120.0),
            ("Veg Tandoori Momos", 80.0),
            ("Veg Afghani Momos", 90.0),
            ("Paneer Tandoori Momos", 100.0),
            ("Paneer Afghani Momos", 120.0),
            ("Paneer Gravy Momos", 130.0),
        ]),
    ];

    for (sort, (cat_name, items)) in menu.iter().enumerate() {
        let r = conn.execute(
            "INSERT INTO categories (name, sort_order, is_active) VALUES (?1, ?2, 1)",
            rusqlite::params![cat_name, sort as i64],
        );
        if r.is_err() { continue; }
        let cat_id = conn.last_insert_rowid();

        for (isort, (item_name, price)) in items.iter().enumerate() {
            let _ = conn.execute(
                "INSERT INTO items (category_id, name, price, is_active, sort_order) VALUES (?1, ?2, ?3, 1, ?4)",
                rusqlite::params![cat_id, item_name, price, isort as i64],
            );
        }
    }
}

/// Get the path to the CSV orders file
pub fn get_csv_path() -> String {
    let dir = DATA_DIR.get().map(|s| s.as_str()).unwrap_or(".");
    format!("{}/BillEasy_Orders.csv", dir)
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
