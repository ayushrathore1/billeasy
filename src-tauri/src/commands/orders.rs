use crate::models::{Order, OrderItem};
use serde_json;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn db() -> Result<std::sync::MutexGuard<'static, rusqlite::Connection>, String> {
    crate::db::DB
        .get()
        .ok_or_else(|| "DB not initialised".to_string())?
        .lock()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_order(items: Vec<OrderItem>, subtotal: f64, total: f64) -> Result<i64, String> {
    let db = db()?;
    let items_json = serde_json::to_string(&items).map_err(|e| e.to_string())?;

    db.execute(
        "INSERT INTO orders (items_json, subtotal, total) VALUES (?1, ?2, ?3)",
        rusqlite::params![items_json, subtotal, total],
    )
    .map_err(|e| e.to_string())?;

    let order_id = db.last_insert_rowid();

    // Append to CSV file (non-blocking — errors are silently ignored)
    let _ = append_to_csv(order_id, &items, subtotal, total);

    Ok(order_id)
}

// ═══════════════════════════════════════════════════════════════════════════
// CSV EXPORT — auto-appends each order to Documents/BillEasy/BillEasy_Orders.csv
// ═══════════════════════════════════════════════════════════════════════════

fn append_to_csv(order_id: i64, items: &[OrderItem], subtotal: f64, total: f64) -> Result<(), String> {
    use std::io::Write;

    let csv_path = crate::db::get_csv_path();
    let file_exists = std::path::Path::new(&csv_path).exists();

    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&csv_path)
        .map_err(|e| e.to_string())?;

    // Write header if file is new
    if !file_exists {
        writeln!(file, "Order ID,Date,Time,Item Name,Quantity,Unit Price,Line Total,Subtotal,Grand Total")
            .map_err(|e| e.to_string())?;
    }

    let now = chrono::Local::now();
    let date_str = now.format("%d/%m/%Y").to_string();
    let time_str = now.format("%I:%M %p").to_string();

    for item in items {
        let line_total = item.price * item.qty as f64;
        // Escape item names that may contain commas
        let safe_name = if item.name.contains(',') || item.name.contains('"') {
            format!("\"{}\"", item.name.replace('"', "\"\""))
        } else {
            item.name.clone()
        };
        writeln!(
            file,
            "{},{},{},{},{},{:.2},{:.2},{:.2},{:.2}",
            order_id, date_str, time_str, safe_name, item.qty, item.price, line_total, subtotal, total
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Open the CSV orders file in the default application (Excel)
#[tauri::command]
pub fn open_orders_csv() -> Result<(), String> {
    let csv_path = crate::db::get_csv_path();

    if !std::path::Path::new(&csv_path).exists() {
        return Err("No orders file found yet. Complete at least one order first.".to_string());
    }

    // Open with default application (Excel on most Windows systems)
    #[cfg(windows)]
    {
        let mut cmd = std::process::Command::new("cmd");
        cmd.args(["/C", "start", "", &csv_path]);
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd.spawn().map_err(|e| format!("Cannot open file: {}", e))?;
    }

    #[cfg(not(windows))]
    {
        std::process::Command::new("xdg-open")
            .arg(&csv_path)
            .spawn()
            .map_err(|e| format!("Cannot open file: {}", e))?;
    }

    Ok(())
}

/// Return CSV file path and data directory info
#[tauri::command]
pub fn get_data_info() -> Result<serde_json::Value, String> {
    let csv_path = crate::db::get_csv_path();
    let data_dir = crate::db::DATA_DIR.get().map(|s| s.as_str()).unwrap_or(".");
    let csv_exists = std::path::Path::new(&csv_path).exists();

    Ok(serde_json::json!({
        "csv_path": csv_path,
        "data_dir": data_dir,
        "csv_exists": csv_exists,
    }))
}

#[tauri::command]
pub fn get_orders(date: Option<String>) -> Result<Vec<Order>, String> {
    let db = db()?;

    let (sql, param_date): (&str, Option<String>) = if date.is_some() {
        (
            "SELECT id, items_json, subtotal, total, created_at FROM orders WHERE date(created_at)=?1 ORDER BY id DESC LIMIT 100",
            date,
        )
    } else {
        (
            "SELECT id, items_json, subtotal, total, created_at FROM orders ORDER BY id DESC LIMIT 100",
            None,
        )
    };

    let mut stmt = db.prepare(sql).map_err(|e| e.to_string())?;

    let parse_row = |row: &rusqlite::Row| -> rusqlite::Result<Order> {
        let items_json: String = row.get(1)?;
        let items: Vec<OrderItem> = serde_json::from_str(&items_json).unwrap_or_default();
        Ok(Order {
            id: row.get(0)?,
            items,
            subtotal: row.get(2)?,
            total: row.get(3)?,
            created_at: row.get(4)?,
        })
    };

    let rows = if let Some(d) = param_date {
        stmt.query_map(rusqlite::params![d], parse_row)
            .map_err(|e| e.to_string())?
    } else {
        stmt.query_map([], parse_row)
            .map_err(|e| e.to_string())?
    };

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_summary() -> Result<serde_json::Value, String> {
    let db = db()?;

    let today_total: f64 = db
        .query_row(
            "SELECT COALESCE(SUM(total), 0) FROM orders WHERE date(created_at) = date('now', 'localtime')",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    let today_count: i64 = db
        .query_row(
            "SELECT COUNT(*) FROM orders WHERE date(created_at) = date('now', 'localtime')",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    let week_total: f64 = db
        .query_row(
            "SELECT COALESCE(SUM(total), 0) FROM orders WHERE created_at >= datetime('now', '-7 days', 'localtime')",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "today_total": today_total,
        "today_count": today_count,
        "week_total": week_total,
    }))
}
