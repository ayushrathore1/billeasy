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
            image_url: row.get::<_, String>(6).unwrap_or_default(),
        })
    };

    let mut items = Vec::new();

    if let Some(cid) = category_id {
        let mut stmt = db.prepare(
            "SELECT id, category_id, name, price, is_active, sort_order, image_url FROM items WHERE category_id=?1 ORDER BY sort_order, id"
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(rusqlite::params![cid], parse_item)
            .map_err(|e| e.to_string())?;
        for item in rows {
            items.push(item.map_err(|e| e.to_string())?);
        }
    } else {
        let mut stmt = db.prepare(
            "SELECT id, category_id, name, price, is_active, sort_order, image_url FROM items ORDER BY sort_order, id"
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
pub fn create_item(category_id: i64, name: String, price: f64, image_url: Option<String>) -> Result<Item, String> {
    let db = db()?;
    let img = image_url.unwrap_or_default();
    db.execute(
        "INSERT INTO items (category_id, name, price, is_active, sort_order, image_url) VALUES (?1, ?2, ?3, 1, 0, ?4)",
        rusqlite::params![category_id, name, price, img],
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
        image_url: img,
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
pub fn update_item_image(id: i64, image_url: String) -> Result<(), String> {
    let db = db()?;
    db.execute(
        "UPDATE items SET image_url=?1 WHERE id=?2",
        rusqlite::params![image_url, id],
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

/// Reset menu to default items (clears existing and seeds fresh)
#[tauri::command]
pub fn seed_default_menu() -> Result<String, String> {
    let db = db()?;
    db.execute("DELETE FROM items", []).map_err(|e| e.to_string())?;
    db.execute("DELETE FROM categories", []).map_err(|e| e.to_string())?;

    let menu: &[(&str, &[(&str, f64)])] = &[
        ("Chinese", &[("Chilly Paneer",100.0),("Honey Chilli Potato",120.0),("Garlic Chili Potato",130.0),("Chili Potato",80.0),("Singapore Noodles",100.0),("Chili Garlic Noodles",90.0),("Hakka Noodles",80.0),("Veg Noodles",60.0)]),
        ("Mojito", &[("Classic Mojito",70.0),("Black Cobra",80.0),("Blue Ocean",80.0),("Virgin Mojito",80.0),("Apple Peach Mojito",80.0),("Watermelon Mojito",80.0),("Blackcurrant Mojito",80.0),("Strawberry Mojito",80.0)]),
        ("Wrap", &[("Veg Wrap",70.0),("Paneer Wrap",80.0),("SPB Wrap",90.0)]),
        ("Pasta", &[("Red Sauce Pasta",60.0),("White Sauce Pasta",70.0),("Cheese Red Pasta",80.0),("Tandoori Sauce Pasta",80.0),("Makhani Sauce Pasta",80.0),("Pink Sauce Pasta",80.0)]),
        ("French Fries", &[("Salt Fries",50.0),("Masala Fries",50.0),("Peri Peri Fries",60.0),("Cheese Loaded Fries",70.0),("Tandoori Fries",80.0)]),
        ("Coffee & Shakes", &[("Vanilla Shake",60.0),("Strawberry Shake",60.0),("Butterscotch Shake",60.0),("Pineapple Shake",60.0),("Oreo Shake",60.0),("Cold Coffee",60.0),("KitKat Shake",80.0),("Blueberry Shake",80.0),("Rajbhog Shake",100.0),("American Nuts Shake",100.0),("Kesar Pista Shake",100.0),("Rose Milk Shake",100.0),("Pan Shake",100.0),("Black Current Shake",100.0),("Anjeer Shake",110.0),("Cold Coffee with Ice Cream",70.0),("Papaya Shake",50.0),("Mango Shake",60.0),("Chocolate Shake",60.0)]),
        ("Sandwich", &[("Veg Sandwich",70.0),("Paneer Sandwich",80.0),("Corn Mayo Sandwich",80.0),("Tandoori Sandwich",80.0),("Paneer Special Sandwich",90.0),("Sev Onion Sandwich",80.0),("Tandoori Paneer Corn Sandwich",100.0),("Pizza Sandwich",120.0)]),
        ("Maggi", &[("Plain Maggi",50.0),("Veg Maggi",60.0),("Paneer Maggi",70.0),("Tandoori Maggi",70.0),("Corn Cheese Maggi",70.0),("Cheese Butter Maggi",70.0),("Butter Maggi",60.0),("Pizza Maggi",80.0),("Pizza Paneer Maggi",90.0),("Tandoori Paneer Maggi",90.0)]),
        ("Pizza", &[("OTC Pizza",120.0),("Sweet Corn Pizza",140.0),("Paneer Pizza",170.0),("Double Cheese Pizza",200.0),("Four In One Pizza",230.0),("Golden Baby Pizza",250.0),("Extra Cheese Loaded Pizza",270.0),("Tandoori Paneer Pizza",290.0),("Makhani Pizza",220.0),("Makhani Paneer Pizza",250.0),("Tandoori Pizza",220.0),("SPB Special Pizza",300.0)]),
        ("Burger", &[("Aloo Tikki Burger",50.0),("Veg Burger",60.0),("Veg Paneer Burger",60.0),("Veg Cheese Burger",60.0),("Tandoori Burger",70.0),("Schezwan Burger",70.0),("Makhani Burger",70.0),("Makhani Paneer Burger",80.0),("Tandoori Paneer Burger",80.0),("Chilly Burger",60.0),("Mexican Burger",60.0),("SPB Special Burger",80.0)]),
        ("Patties", &[("Plain Masala Patties",15.0),("Masala Patties",25.0),("Paneer Patties",35.0),("Tandoori Patties",40.0),("Cheese Patties",40.0),("Cheese Tandoori Patties",50.0),("Cheese Paneer Patties",50.0),("Cheese Tandoori Paneer Patties",60.0),("Tandoori Paneer Patties",50.0),("Tandoori Mayo Patties",50.0),("Cheese Tandoori Paneer Mayo",70.0),("Mayonnaise Patties",25.0)]),
        ("Pastries", &[("Vanilla Pastry",30.0),("Butterscotch Pastry",40.0),("Black Forest Pastry",40.0),("Dark Chocolate Pastry",50.0)]),
        ("Cakes", &[("Vanilla Cake 1 Pound",200.0),("Vanilla Cake 2 Pound",380.0),("Strawberry Cake 1 Pound",220.0),("Strawberry Cake 2 Pound",420.0),("Butterscotch Cake 1 Pound",250.0),("Butterscotch Cake 2 Pound",460.0),("Black Forest Cake 1 Pound",270.0),("Black Forest Cake 2 Pound",480.0),("Dark Chocolate Cake 1 Pound",300.0),("Dark Chocolate Cake 2 Pound",550.0)]),
        ("Momos", &[("Veg Momos",60.0),("Veg Fried Momos",70.0),("Paneer Steam Momos",80.0),("Paneer Fried Momos",90.0),("Veg Kurkure Momos",80.0),("Tandoori Veg Fried Momos",100.0),("Paneer Kurkure Momos",100.0),("Tandoori Paneer Fried Momos",120.0),("Veg Tandoori Momos",80.0),("Veg Afghani Momos",90.0),("Paneer Tandoori Momos",100.0),("Paneer Afghani Momos",120.0),("Paneer Gravy Momos",130.0)]),
    ];

    let mut total = 0;
    for (sort, (cat, items)) in menu.iter().enumerate() {
        if db.execute("INSERT INTO categories (name, sort_order, is_active) VALUES (?1, ?2, 1)", rusqlite::params![cat, sort as i64]).is_err() { continue; }
        let cid = db.last_insert_rowid();
        for (is, (name, price)) in items.iter().enumerate() {
            let _ = db.execute("INSERT INTO items (category_id, name, price, is_active, sort_order) VALUES (?1, ?2, ?3, 1, ?4)", rusqlite::params![cid, name, price, is as i64]);
            total += 1;
        }
    }
    Ok(format!("Seeded {} categories, {} items", menu.len(), total))
}
