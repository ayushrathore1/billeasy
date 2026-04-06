use crate::models::{Category, Item};

fn db() -> Result<std::sync::MutexGuard<'static, rusqlite::Connection>, String> {
    crate::db::DB
        .get()
        .ok_or_else(|| "DB not initialised".to_string())?
        .lock()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_categories() -> Result<Vec<Category>, String> {
    let db = db()?;
    let mut stmt = db
        .prepare(
            "SELECT id, name, sort_order, is_active FROM categories ORDER BY sort_order, id",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Category {
                id: row.get(0)?,
                name: row.get(1)?,
                sort_order: row.get(2)?,
                is_active: row.get::<_, i64>(3)? == 1,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_category(name: String) -> Result<Category, String> {
    let db = db()?;
    db.execute(
        "INSERT INTO categories (name, sort_order, is_active) VALUES (?1, 0, 1)",
        rusqlite::params![name],
    )
    .map_err(|e| e.to_string())?;

    let id = db.last_insert_rowid();
    Ok(Category {
        id,
        name,
        sort_order: 0,
        is_active: true,
    })
}

#[tauri::command]
pub fn update_category(id: i64, name: String, is_active: bool, sort_order: i64) -> Result<(), String> {
    let db = db()?;
    db.execute(
        "UPDATE categories SET name=?1, is_active=?2, sort_order=?3 WHERE id=?4",
        rusqlite::params![name, is_active as i64, sort_order, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_category(id: i64) -> Result<(), String> {
    let db = db()?;
    // Soft delete: mark category and its items as inactive
    db.execute(
        "UPDATE categories SET is_active=0 WHERE id=?1",
        rusqlite::params![id],
    )
    .map_err(|e| e.to_string())?;
    db.execute(
        "UPDATE items SET is_active=0 WHERE category_id=?1",
        rusqlite::params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_items(category_id: Option<i64>) -> Result<Vec<Item>, String> {
    let db = db()?;

    let parse_item = |row: &rusqlite::Row| -> rusqlite::Result<Item> {
        Ok(Item {
            id: row.get(0)?,
            category_id: row.get(1)?,
            name: row.get(2)?,
            price: row.get(3)?,
            is_active: row.get::<_, i64>(4)? == 1,
            sort_order: row.get(5)?,
        })
    };

    let mut items = Vec::new();

    if let Some(cid) = category_id {
        let mut stmt = db.prepare(
            "SELECT id, category_id, name, price, is_active, sort_order FROM items WHERE category_id=?1 ORDER BY sort_order, id"
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(rusqlite::params![cid], parse_item)
            .map_err(|e| e.to_string())?;
        for item in rows {
            items.push(item.map_err(|e| e.to_string())?);
        }
    } else {
        let mut stmt = db.prepare(
            "SELECT id, category_id, name, price, is_active, sort_order FROM items ORDER BY sort_order, id"
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], parse_item)
            .map_err(|e| e.to_string())?;
        for item in rows {
            items.push(item.map_err(|e| e.to_string())?);
        }
    }

    Ok(items)
}

#[tauri::command]
pub fn create_item(category_id: i64, name: String, price: f64) -> Result<Item, String> {
    let db = db()?;
    db.execute(
        "INSERT INTO items (category_id, name, price, is_active, sort_order) VALUES (?1, ?2, ?3, 1, 0)",
        rusqlite::params![category_id, name, price],
    )
    .map_err(|e| e.to_string())?;

    let id = db.last_insert_rowid();
    Ok(Item {
        id,
        category_id,
        name,
        price,
        is_active: true,
        sort_order: 0,
    })
}

#[tauri::command]
pub fn update_item(id: i64, name: String, price: f64, is_active: bool) -> Result<(), String> {
    let db = db()?;
    db.execute(
        "UPDATE items SET name=?1, price=?2, is_active=?3 WHERE id=?4",
        rusqlite::params![name, price, is_active as i64, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_item(id: i64) -> Result<(), String> {
    let db = db()?;
    // Soft delete
    db.execute(
        "UPDATE items SET is_active=0 WHERE id=?1",
        rusqlite::params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
