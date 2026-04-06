use crate::models::OrderItem;

/// Reads printer settings from DB.
/// printer_name = the port/name (e.g. "USB001", "COM3", "POS-58")
/// printer_type = "usb" | "bluetooth" | "network" | "name"
fn get_printer_config() -> (String, String) {
    if let Some(db) = crate::db::DB.get() {
        if let Ok(conn) = db.lock() {
            let name = conn
                .query_row("SELECT value FROM settings WHERE key='printer_name'", [], |r| r.get::<_, String>(0))
                .unwrap_or_else(|_| "USB001".to_string());
            let ptype = conn
                .query_row("SELECT value FROM settings WHERE key='printer_type'", [], |r| r.get::<_, String>(0))
                .unwrap_or_else(|_| "usb".to_string());
            return (name, ptype);
        }
    }
    ("USB001".to_string(), "usb".to_string())
}

#[tauri::command]
pub fn print_receipt(
    order_id: i64,
    items: Vec<OrderItem>,
    total: f64,
    shop_name: String,
    shop_address: String,
    bill_footer: String,
) -> Result<(), String> {
    let (printer_name, printer_type) = get_printer_config();
    let content = build_receipt(order_id, &items, total, &shop_name, &shop_address, &bill_footer);

    // ESC/POS init + paper cut commands
    let mut raw_bytes: Vec<u8> = Vec::new();
    raw_bytes.extend_from_slice(&[0x1B, 0x40]); // ESC @ — initialise printer
    raw_bytes.extend_from_slice(content.as_bytes());
    raw_bytes.extend_from_slice(&[0x1D, 0x56, 0x00]); // GS V 0 — full cut

    match printer_type.as_str() {
        "bluetooth" => print_via_port(&printer_name, &raw_bytes),   // COM3, COM4 etc
        "network"   => print_via_network(&printer_name, &raw_bytes), // IP:PORT
        "name"      => print_via_windows_name(&printer_name, &content), // Shared printer name
        _           => print_via_usb(&printer_name, &raw_bytes),    // USB port (default)
    }
}

/// Build formatted receipt text (32-char wide for 58mm thermal, 48-char for 80mm)
fn build_receipt(
    order_id: i64,
    items: &[OrderItem],
    total: f64,
    shop_name: &str,
    shop_address: &str,
    bill_footer: &str,
) -> String {
    let w = 32; // columns for 58mm paper
    let mut lines: Vec<String> = Vec::new();
    let sep = "-".repeat(w);

    // Header
    lines.push(center(shop_name, w));
    if !shop_address.is_empty() {
        lines.push(center(shop_address, w));
    }

    let now = chrono::Local::now();
    lines.push(center(&now.format("%d/%m/%Y %I:%M %p").to_string(), w));
    if order_id > 0 {
        lines.push(center(&format!("Bill #{}", order_id), w));
    }
    lines.push(sep.clone());

    // Items
    for item in items {
        let name = if item.name.len() > 18 {
            &item.name[..18]
        } else {
            &item.name
        };
        let line_total = item.price * item.qty as f64;
        lines.push(format!(
            "{:<18} x{:<2} {:>8}",
            name,
            item.qty,
            format!("Rs.{:.0}", line_total)
        ));
    }

    lines.push(sep.clone());
    lines.push(format!(
        "{:<22} {:>9}",
        "TOTAL",
        format!("Rs.{:.0}", total)
    ));
    lines.push(sep);
    lines.push(String::new());

    if !bill_footer.is_empty() {
        lines.push(center(bill_footer, w));
    }

    // Feed lines for paper to tear
    lines.push(String::new());
    lines.push(String::new());
    lines.push(String::new());

    lines.join("\r\n")
}

fn center(text: &str, width: usize) -> String {
    if text.len() >= width {
        return text.to_string();
    }
    let pad = (width - text.len()) / 2;
    format!("{}{}", " ".repeat(pad), text)
}

// ─── USB Port (direct write to \\.\USB001 etc) ────────────────────────────
fn print_via_usb(port: &str, data: &[u8]) -> Result<(), String> {
    use std::io::Write;
    let path = format!("\\\\.\\{}", port);
    let mut f = std::fs::OpenOptions::new()
        .write(true)
        .open(&path)
        .map_err(|e| format!("Cannot open USB port {}: {}. Go to Setup → Printer to change.", port, e))?;
    f.write_all(data).map_err(|e| format!("USB write failed: {}", e))?;
    f.flush().map_err(|e| format!("USB flush failed: {}", e))?;
    Ok(())
}

// ─── Bluetooth (COM port — same as serial) ────────────────────────────────
fn print_via_port(port: &str, data: &[u8]) -> Result<(), String> {
    use std::io::Write;
    let path = format!("\\\\.\\{}", port); // \\.\COM3 etc
    let mut f = std::fs::OpenOptions::new()
        .write(true)
        .open(&path)
        .map_err(|e| format!("Cannot open Bluetooth port {}: {}. Pair the printer first in Windows Settings → Bluetooth.", port, e))?;
    f.write_all(data).map_err(|e| format!("Bluetooth write failed: {}", e))?;
    f.flush().map_err(|e| format!("Bluetooth flush failed: {}", e))?;
    Ok(())
}

// ─── Network (TCP raw socket — IP:PORT, default port 9100) ────────────────
fn print_via_network(address: &str, data: &[u8]) -> Result<(), String> {
    use std::io::Write;
    use std::net::TcpStream;

    let addr = if address.contains(':') {
        address.to_string()
    } else {
        format!("{}:9100", address) // default RAW print port
    };

    let mut stream = TcpStream::connect(&addr)
        .map_err(|e| format!("Cannot connect to network printer {}: {}", addr, e))?;
    stream.set_write_timeout(Some(std::time::Duration::from_secs(10)))
        .map_err(|e| format!("Timeout setup failed: {}", e))?;
    stream.write_all(data).map_err(|e| format!("Network write failed: {}", e))?;
    stream.flush().map_err(|e| format!("Network flush failed: {}", e))?;
    Ok(())
}

// ─── Windows shared printer name (print via spooler) ──────────────────────
fn print_via_windows_name(printer_name: &str, content: &str) -> Result<(), String> {
    let temp_path = std::env::temp_dir().join("billeasy_receipt.txt");
    std::fs::write(&temp_path, content).map_err(|e| e.to_string())?;

    let output = std::process::Command::new("cmd")
        .args([
            "/C",
            "print",
            &format!("/D:{}", printer_name),
            temp_path.to_str().unwrap_or(""),
        ])
        .output()
        .map_err(|e| format!("Cannot run print command: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let err = String::from_utf8_lossy(&output.stderr).to_string();
        Err(format!("Print spooler error: {}", err))
    }
}
