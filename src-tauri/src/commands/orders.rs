use crate::models::{Order, OrderItem};
use serde_json;

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

    Ok(db.last_insert_rowid())
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
