use crate::models::Settings;

fn db() -> Result<std::sync::MutexGuard<'static, rusqlite::Connection>, String> {
    crate::db::DB
        .get()
        .ok_or_else(|| "DB not initialised".to_string())?
        .lock()
        .map_err(|e| e.to_string())
}

fn get_setting(db: &rusqlite::Connection, key: &str, default: &str) -> String {
    db.query_row(
        "SELECT value FROM settings WHERE key=?1",
        rusqlite::params![key],
        |r| r.get::<_, String>(0),
    )
    .unwrap_or_else(|_| default.to_string())
}

#[tauri::command]
pub fn get_settings() -> Result<Settings, String> {
    let db = db()?;
    Ok(Settings {
        shop_name: get_setting(&db, "shop_name", "My Shop"),
        shop_address: get_setting(&db, "shop_address", ""),
        bill_footer: get_setting(&db, "bill_footer", "Thank you! Visit again."),
        printer_name: get_setting(&db, "printer_name", "USB001"),
        printer_type: get_setting(&db, "printer_type", "usb"),
    })
}

#[tauri::command]
pub fn save_settings(settings: Settings) -> Result<(), String> {
    let db = db()?;

    let pairs = [
        ("shop_name", &settings.shop_name),
        ("shop_address", &settings.shop_address),
        ("bill_footer", &settings.bill_footer),
        ("printer_name", &settings.printer_name),
        ("printer_type", &settings.printer_type),
    ];

    for (key, value) in &pairs {
        db.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            rusqlite::params![key, value],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}
