use tauri::Manager;
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

fn get_bool_setting(db: &rusqlite::Connection, key: &str, default: bool) -> bool {
    let val = get_setting(db, key, if default { "1" } else { "0" });
    val == "1" || val == "true"
}

#[tauri::command]
pub fn get_settings() -> Result<Settings, String> {
    let db = db()?;
    let gst_str = get_setting(&db, "gst_percent", "0");
    let gst: f64 = gst_str.parse().unwrap_or(0.0);
    Ok(Settings {
        shop_name: get_setting(&db, "shop_name", "My Shop"),
        shop_tagline: get_setting(&db, "shop_tagline", ""),
        shop_address: get_setting(&db, "shop_address", ""),
        shop_phone: get_setting(&db, "shop_phone", ""),
        bill_footer: get_setting(&db, "bill_footer", "Thank you for being our customer ❤️"),
        printer_name: get_setting(&db, "printer_name", "USB001"),
        printer_type: get_setting(&db, "printer_type", "usb"),
        logo_enabled: get_bool_setting(&db, "logo_enabled", false),
        has_cutter: get_bool_setting(&db, "has_cutter", true),
        gst_percent: gst,
        payment_mode: get_setting(&db, "payment_mode", ""),
    })
}

#[tauri::command]
pub fn save_settings(settings: Settings) -> Result<(), String> {
    let db = db()?;

    let pairs: Vec<(&str, String)> = vec![
        ("shop_name", settings.shop_name),
        ("shop_tagline", settings.shop_tagline),
        ("shop_address", settings.shop_address),
        ("shop_phone", settings.shop_phone),
        ("bill_footer", settings.bill_footer),
        ("printer_name", settings.printer_name),
        ("printer_type", settings.printer_type),
        ("logo_enabled", if settings.logo_enabled { "1".to_string() } else { "0".to_string() }),
        ("has_cutter", if settings.has_cutter { "1".to_string() } else { "0".to_string() }),
        ("gst_percent", format!("{}", settings.gst_percent)),
        ("payment_mode", settings.payment_mode),
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

/// Save an uploaded logo image (base64-encoded PNG/JPG) to disk.
/// Returns the absolute path where it was saved.
#[tauri::command]
pub fn save_logo(app: tauri::AppHandle, base64_data: String) -> Result<String, String> {
    use base64::Engine;

    let app_dir = app.path()
        .app_data_dir()
        .map_err(|e| format!("Cannot get app data dir: {}", e))?;

    std::fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;

    let logo_path = app_dir.join("logo.png");

    // Decode base64 → raw bytes
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&base64_data)
        .map_err(|e| format!("Invalid base64 data: {}", e))?;

    // Load as image and save as PNG (normalise format)
    let img = image::load_from_memory(&bytes)
        .map_err(|e| format!("Cannot decode image: {}", e))?;

    // Resize to max 384px wide (58mm thermal) while keeping aspect ratio
    let img = if img.width() > 384 {
        img.resize(384, 384, image::imageops::FilterType::Lanczos3)
    } else {
        img
    };

    img.save(&logo_path)
        .map_err(|e| format!("Cannot save logo: {}", e))?;

    // Also enable logo in settings
    if let Ok(db) = db() {
        let _ = db.execute(
            "INSERT INTO settings (key, value) VALUES ('logo_enabled', '1')
             ON CONFLICT(key) DO UPDATE SET value='1'",
            [],
        );
    }

    Ok(logo_path.to_string_lossy().to_string())
}

/// Get the logo as a base64 data URI (for display in the webview)
#[tauri::command]
pub fn get_logo(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use base64::Engine;

    let app_dir = app.path()
        .app_data_dir()
        .map_err(|e| format!("Cannot get app data dir: {}", e))?;
    let logo_path = app_dir.join("logo.png");

    if !logo_path.exists() {
        return Ok(None);
    }

    let bytes = std::fs::read(&logo_path).map_err(|e| e.to_string())?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(Some(format!("data:image/png;base64,{}", b64)))
}

/// Delete the logo file from disk
#[tauri::command]
pub fn delete_logo(app: tauri::AppHandle) -> Result<(), String> {
    let app_dir = app.path()
        .app_data_dir()
        .map_err(|e| format!("Cannot get app data dir: {}", e))?;
    let logo_path = app_dir.join("logo.png");

    if logo_path.exists() {
        std::fs::remove_file(&logo_path).map_err(|e| e.to_string())?;
    }

    // Disable logo in settings
    if let Ok(db) = db() {
        let _ = db.execute(
            "INSERT INTO settings (key, value) VALUES ('logo_enabled', '0')
             ON CONFLICT(key) DO UPDATE SET value='0'",
            [],
        );
    }

    Ok(())
}
