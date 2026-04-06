use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct LicenseStatus {
    pub valid: bool,
    pub vendor_name: Option<String>,
    pub expires_at: Option<String>,
    pub message: Option<String>,
}

fn db() -> Result<std::sync::MutexGuard<'static, rusqlite::Connection>, String> {
    crate::db::DB
        .get()
        .ok_or_else(|| "DB not initialised".to_string())?
        .lock()
        .map_err(|e| e.to_string())
}

/// Hardcoded offline dev/test keys — no server needed
const DEV_KEYS: &[&str] = &[
    "BILL-TEST-DEMO-2025",
    "BILL-DEV0-DEV0-DEV0",
];

fn is_dev_key(key: &str) -> bool {
    DEV_KEYS.iter().any(|k| k.eq_ignore_ascii_case(key))
}

#[tauri::command]
pub fn get_license_status() -> Result<LicenseStatus, String> {
    let db = db()?;

    let result = db.query_row(
        "SELECT key, machine_id, vendor_name, expires_at FROM license LIMIT 1",
        [],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        },
    );

    match result {
        Ok((key, _machine_id, vendor_name, expires_at)) => {
            // Dev keys never expire
            if is_dev_key(&key) {
                return Ok(LicenseStatus {
                    valid: true,
                    vendor_name: Some(vendor_name),
                    expires_at: Some("2099-12-31".to_string()),
                    message: None,
                });
            }

            // Check expiry for production keys
            let not_expired = chrono::NaiveDate::parse_from_str(&expires_at, "%Y-%m-%d")
                .ok()
                .map(|d| d.and_hms_opt(23, 59, 59).unwrap())
                .map(|dt| chrono::Local::now().naive_local() < dt)
                .unwrap_or(false);

            if not_expired {
                Ok(LicenseStatus {
                    valid: true,
                    vendor_name: Some(vendor_name),
                    expires_at: Some(expires_at),
                    message: None,
                })
            } else {
                Ok(LicenseStatus {
                    valid: false,
                    vendor_name: Some(vendor_name),
                    expires_at: Some(expires_at),
                    message: Some("License has expired. Please renew.".to_string()),
                })
            }
        }
        Err(_) => Ok(LicenseStatus {
            valid: false,
            vendor_name: None,
            expires_at: None,
            message: Some("No license found. Please activate.".to_string()),
        }),
    }
}

#[tauri::command]
pub fn get_machine_id() -> Result<String, String> {
    get_machine_id_impl()
}

#[cfg(windows)]
fn get_machine_id_impl() -> Result<String, String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let crypto = hklm
        .open_subkey("SOFTWARE\\Microsoft\\Cryptography")
        .map_err(|e| format!("Failed to read registry: {}", e))?;

    let guid: String = crypto
        .get_value("MachineGuid")
        .map_err(|e| format!("MachineGuid not found: {}", e))?;

    Ok(guid)
}

#[cfg(not(windows))]
fn get_machine_id_impl() -> Result<String, String> {
    Ok("dev-machine-id-0000-0000".to_string())
}

#[derive(Debug, Deserialize)]
struct ServerResponse {
    valid: bool,
    vendor_name: Option<String>,
    expires_at: Option<String>,
    message: Option<String>,
}

#[tauri::command]
pub async fn validate_license(key: String, machine_id: String) -> Result<LicenseStatus, String> {
    // ─── Offline dev key bypass ────────────────────────────────────────
    if is_dev_key(&key) {
        let vendor_name = "Developer (Test License)".to_string();
        let expires_at = "2099-12-31".to_string();

        // Store in DB so get_license_status works on next startup
        let db = db()?;
        db.execute("DELETE FROM license", []).map_err(|e| e.to_string())?;
        db.execute(
            "INSERT INTO license (key, machine_id, vendor_name, expires_at) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![key, machine_id, vendor_name, expires_at],
        )
        .map_err(|e| e.to_string())?;

        return Ok(LicenseStatus {
            valid: true,
            vendor_name: Some(vendor_name),
            expires_at: Some(expires_at),
            message: None,
        });
    }

    // ─── Production license validation via server ─────────────────────
    const LICENSE_SERVER_URL: &str = "https://license-server-a1ti.onrender.com/validate";

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .post(LICENSE_SERVER_URL)
        .json(&serde_json::json!({
            "key": key,
            "machine_id": machine_id,
        }))
        .send()
        .await
        .map_err(|e| format!("Cannot reach license server: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Server error {}: {}", status, body));
    }

    let server_resp: ServerResponse = resp.json().await.map_err(|e| e.to_string())?;

    if server_resp.valid {
        let vendor_name = server_resp.vendor_name.clone().unwrap_or_default();
        let expires_at = server_resp.expires_at.clone().unwrap_or_default();

        let db = db()?;
        db.execute("DELETE FROM license", []).map_err(|e| e.to_string())?;
        db.execute(
            "INSERT INTO license (key, machine_id, vendor_name, expires_at) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![key, machine_id, vendor_name, expires_at],
        )
        .map_err(|e| e.to_string())?;

        Ok(LicenseStatus {
            valid: true,
            vendor_name: Some(vendor_name),
            expires_at: Some(expires_at),
            message: None,
        })
    } else {
        Ok(LicenseStatus {
            valid: false,
            vendor_name: None,
            expires_at: None,
            message: server_resp.message.or(Some("Invalid license key.".to_string())),
        })
    }
}
