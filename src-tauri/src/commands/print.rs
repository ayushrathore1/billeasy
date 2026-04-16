use tauri::Manager;
use crate::models::OrderItem;

/// Reads printer settings from DB.
fn get_printer_config() -> (String, String, bool, bool) {
    if let Some(db) = crate::db::DB.get() {
        if let Ok(conn) = db.lock() {
            let name = conn
                .query_row("SELECT value FROM settings WHERE key='printer_name'", [], |r| r.get::<_, String>(0))
                .unwrap_or_else(|_| "USB001".to_string());
            let ptype = conn
                .query_row("SELECT value FROM settings WHERE key='printer_type'", [], |r| r.get::<_, String>(0))
                .unwrap_or_else(|_| "usb".to_string());
            let has_cutter = conn
                .query_row("SELECT value FROM settings WHERE key='has_cutter'", [], |r| r.get::<_, String>(0))
                .unwrap_or_else(|_| "1".to_string());
            let logo_enabled = conn
                .query_row("SELECT value FROM settings WHERE key='logo_enabled'", [], |r| r.get::<_, String>(0))
                .unwrap_or_else(|_| "0".to_string());
            return (name, ptype, has_cutter == "1", logo_enabled == "1");
        }
    }
    ("USB001".to_string(), "usb".to_string(), true, false)
}

/// Read extra settings from DB
fn get_extra_settings() -> (String, String, f64, String) {
    if let Some(db) = crate::db::DB.get() {
        if let Ok(conn) = db.lock() {
            let tagline = conn.query_row("SELECT value FROM settings WHERE key='shop_tagline'", [], |r| r.get::<_, String>(0)).unwrap_or_default();
            let phone = conn.query_row("SELECT value FROM settings WHERE key='shop_phone'", [], |r| r.get::<_, String>(0)).unwrap_or_default();
            let gst: f64 = conn.query_row("SELECT value FROM settings WHERE key='gst_percent'", [], |r| r.get::<_, String>(0)).unwrap_or_else(|_| "0".to_string()).parse().unwrap_or(0.0);
            let mode = conn.query_row("SELECT value FROM settings WHERE key='payment_mode'", [], |r| r.get::<_, String>(0)).unwrap_or_default();
            return (tagline, phone, gst, mode);
        }
    }
    (String::new(), String::new(), 0.0, String::new())
}

/// Get logo path from app data dir
fn get_logo_path_from_app(app: Option<&tauri::AppHandle>) -> Option<std::path::PathBuf> {
    if let Some(app) = app {
        if let Ok(dir) = app.path().app_data_dir() {
            let path: std::path::PathBuf = dir.join("logo.png");
            if path.exists() {
                return Some(path);
            }
        }
    }
    None
}

/// Build ESC/POS raster image bytes from a PNG file (monochrome bitmap)
fn build_logo_escpos(logo_path: &std::path::Path) -> Option<Vec<u8>> {
    let img = image::open(logo_path).ok()?;
    let gray = img.to_luma8();
    let (w, h) = gray.dimensions();
    let byte_width = ((w + 7) / 8) as usize;
    let mut raster_data: Vec<u8> = Vec::new();
    for y in 0..h {
        for bx in 0..byte_width as u32 {
            let mut byte: u8 = 0;
            for bit in 0..8 {
                let x = bx * 8 + bit;
                if x < w {
                    let pixel = gray.get_pixel(x, y).0[0];
                    if pixel < 128 { byte |= 1 << (7 - bit); }
                }
            }
            raster_data.push(byte);
        }
    }
    let mut cmd: Vec<u8> = Vec::new();
    cmd.extend_from_slice(&[0x1D, 0x76, 0x30, 0x00]);
    cmd.push((byte_width & 0xFF) as u8);
    cmd.push(((byte_width >> 8) & 0xFF) as u8);
    cmd.push((h & 0xFF) as u8);
    cmd.push(((h >> 8) & 0xFF) as u8);
    cmd.extend_from_slice(&raster_data);
    Some(cmd)
}

// ═══════════════════════════════════════════════════════════════════════════
// THERMAL PRINT
// ═══════════════════════════════════════════════════════════════════════════

#[tauri::command]
pub fn print_receipt(
    app: tauri::AppHandle,
    order_id: i64,
    items: Vec<OrderItem>,
    total: f64,
    shop_name: String,
    shop_address: String,
    bill_footer: String,
) -> Result<(), String> {
    let (printer_name, printer_type, has_cutter, logo_enabled) = get_printer_config();
    let (shop_tagline, shop_phone, gst_percent, payment_mode) = get_extra_settings();

    let subtotal = total;
    let gst_amount = subtotal * gst_percent / 100.0;
    let grand_total = subtotal + gst_amount;

    let content = build_receipt(
        order_id, &items, subtotal, gst_percent, gst_amount, grand_total,
        &shop_name, &shop_tagline, &shop_address, &shop_phone,
        &bill_footer, &payment_mode,
    );

    let mut raw_bytes: Vec<u8> = Vec::new();
    raw_bytes.extend_from_slice(&[0x1B, 0x40]); // ESC @ init

    if logo_enabled {
        if let Some(logo_path) = get_logo_path_from_app(Some(&app)) {
            if let Some(logo_bytes) = build_logo_escpos(&logo_path) {
                raw_bytes.extend_from_slice(&logo_bytes);
                raw_bytes.extend_from_slice(&[0x1B, 0x61, 0x01]); // center
                raw_bytes.extend_from_slice(b"\r\n");
                raw_bytes.extend_from_slice(&[0x1B, 0x61, 0x00]); // left
            }
        }
    }

    raw_bytes.extend_from_slice(content.as_bytes());

    if has_cutter {
        raw_bytes.extend_from_slice(&[0x1D, 0x56, 0x00]);
    } else {
        raw_bytes.extend_from_slice(b"\r\n\r\n\r\n\r\n\r\n");
    }

    match printer_type.as_str() {
        "bluetooth" => print_via_port(&printer_name, &raw_bytes),
        "network"   => print_via_network(&printer_name, &raw_bytes),
        "name"      => print_via_windows_name(&printer_name, &content),
        _           => print_via_usb(&printer_name, &raw_bytes),
    }
}

fn build_receipt(
    order_id: i64, items: &[OrderItem],
    subtotal: f64, gst_percent: f64, gst_amount: f64, grand_total: f64,
    shop_name: &str, shop_tagline: &str, shop_address: &str, shop_phone: &str,
    bill_footer: &str, payment_mode: &str,
) -> String {
    let w = 40;
    let mut l: Vec<String> = Vec::new();
    let sep = "-".repeat(w);
    let cut = "- - - - - - - - ✂ - - - - - - - -";

    l.push(center(cut, w));
    l.push(String::new());

    l.push(center(shop_name, w));
    if !shop_tagline.is_empty() { l.push(center(shop_tagline, w)); }
    l.push(sep.clone());
    if !shop_address.is_empty() { l.push(center(&format!("📍 {}", shop_address), w)); }
    if !shop_phone.is_empty() { l.push(center(&format!("📞 {}", shop_phone), w)); }
    if !shop_address.is_empty() || !shop_phone.is_empty() { l.push(sep.clone()); }

    let now = chrono::Local::now();
    if order_id > 0 { l.push(format!("Invoice No: {:03}", order_id)); }
    l.push(format!("Date: {}", now.format("%d %b %Y")));
    l.push(format!("Time: {}", now.format("%I:%M %p")));
    l.push(sep.clone());

    l.push(format!("{:<20} {:>5} {:>11}", "Item", "Qty", "Amount"));
    l.push(sep.clone());

    for item in items {
        let name = if item.name.len() > 20 { &item.name[..20] } else { &item.name };
        let lt = item.price * item.qty as f64;
        l.push(format!("{:<20} {:>5} {:>11}", name, item.qty, format!("{:.0}", lt)));
    }
    l.push(sep.clone());

    l.push(format!("{:<28} {:>8}", "Subtotal", format!("{:.0}", subtotal)));
    if gst_percent > 0.0 {
        l.push(format!("{:<28} {:>8}", format!("GST ({:.0}%)", gst_percent), format!("{:.0}", gst_amount)));
    }
    l.push(sep.clone());
    l.push(format!("{:<28} {:>8}", "Grand Total", format!("{:.0}", grand_total)));
    l.push(sep.clone());

    if !payment_mode.is_empty() { l.push(format!("Payment Mode: {}", payment_mode)); l.push(String::new()); }
    if !bill_footer.is_empty() {
        for line in bill_footer.split('\n') { l.push(center(line.trim(), w)); }
    }
    l.push(String::new());
    l.push(center("Powered by Krixov", w));
    l.push(center("www.krixov.com", w));
    l.push(String::new());
    l.push(center(cut, w));
    l.push(String::new());
    l.push(String::new());

    l.join("\r\n")
}

fn center(text: &str, width: usize) -> String {
    let len = text.chars().count();
    if len >= width { return text.to_string(); }
    let pad = (width - len) / 2;
    format!("{}{}", " ".repeat(pad), text)
}

// ═══════════════════════════════════════════════════════════════════════════
// HTML RECEIPT (for PDF / Windows printing)
// ═══════════════════════════════════════════════════════════════════════════

#[tauri::command]
pub fn generate_receipt_html(
    app: tauri::AppHandle,
    order_id: i64,
    items: Vec<OrderItem>,
    total: f64,
    shop_name: String,
    shop_address: String,
    bill_footer: String,
) -> Result<String, String> {
    let (_pn, _pt, _hc, logo_enabled) = get_printer_config();
    let (shop_tagline, shop_phone, gst_percent, payment_mode) = get_extra_settings();

    let logo_data_uri = if logo_enabled { get_logo_data_uri(&app) } else { None };

    let now = chrono::Local::now();
    let date_str = now.format("%d %b %Y").to_string();
    let time_str = now.format("%I:%M %p").to_string();

    let subtotal = total;
    let gst_amount = subtotal * gst_percent / 100.0;
    let grand_total = subtotal + gst_amount;

    let mut items_html = String::new();
    for item in &items {
        let lt = item.price * item.qty as f64;
        items_html.push_str(&format!(
            "<tr><td>{}</td><td class=\"r\">{}</td><td class=\"r\">{:.0}</td></tr>\n",
            html_escape(&item.name), item.qty, lt,
        ));
    }

    let invoice = if order_id > 0 { format!("Invoice No: {:03}", order_id) } else { String::new() };
    let tagline = if !shop_tagline.is_empty() { format!("<div class='tagline'>{}</div>", html_escape(&shop_tagline)) } else { String::new() };
    let addr = if !shop_address.is_empty() { format!("<div class='contact'>📍 {}</div>", html_escape(&shop_address)) } else { String::new() };
    let phone = if !shop_phone.is_empty() { format!("<div class='contact'>📞 {}</div>", html_escape(&shop_phone)) } else { String::new() };
    let gst_row = if gst_percent > 0.0 { format!("<div class='row'><span>GST ({:.0}%)</span><span>{:.0}</span></div>", gst_percent, gst_amount) } else { String::new() };
    let pay = if !payment_mode.is_empty() { format!("<div class='pay'>Payment Mode: {}</div>", html_escape(&payment_mode)) } else { String::new() };
    let footer = if !bill_footer.is_empty() { format!("<div class='footer'>{}</div>", html_escape(&bill_footer).replace('\n', "<br/>")) } else { String::new() };

    let watermark = if let Some(ref uri) = logo_data_uri {
        format!(r#"<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:60%;height:60%;background:url('{}') center/contain no-repeat;opacity:0.07;z-index:0;pointer-events:none"></div>"#, uri)
    } else { String::new() };

    let html = format!(r#"<!DOCTYPE html>
<html><head><meta charset="UTF-8"/>
<style>
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap');
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:'JetBrains Mono','Courier New',monospace;background:#f0f0f0;display:flex;justify-content:center;padding:16px;color:#111}}
.w{{width:320px;background:#fff;box-shadow:0 2px 24px rgba(0,0,0,.12)}}
.cut{{border:0;border-top:2px dashed #888;margin:0;position:relative}}
.cut::after{{content:'✂';position:absolute;top:-10px;right:10px;font-size:14px;background:#fff;color:#888;padding:0 4px}}
.body{{position:relative;padding:18px 16px;overflow:hidden}}
.body>*{{position:relative;z-index:1}}
.name{{text-align:center;font-size:18px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:2px}}
.tagline{{text-align:center;font-size:10px;color:#555;font-style:italic;margin-bottom:4px}}
.d{{border:0;border-top:1px dashed #555;margin:8px 0}}
.contact{{text-align:center;font-size:9.5px;color:#444;margin:2px 0}}
.meta{{font-size:10px;color:#222;margin:2px 0}}
table{{width:100%;border-collapse:collapse;font-size:10.5px;margin:4px 0}}
th{{text-align:left;font-weight:600;padding:4px 0;font-size:9.5px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px dashed #555}}
th.r,td.r{{text-align:right}}
td{{padding:4px 0}}
.row{{display:flex;justify-content:space-between;font-size:10.5px;padding:2px 0}}
.total{{display:flex;justify-content:space-between;font-size:15px;font-weight:700;padding:6px 0}}
.pay{{font-size:10px;margin-top:6px}}
.footer{{text-align:center;font-size:9.5px;color:#555;margin-top:10px;line-height:1.6}}
.brand{{text-align:center;margin-top:12px;padding-top:8px;border-top:1px dashed #ccc}}
.brand b{{font-size:9px;letter-spacing:.5px;color:#222}}
.brand small{{font-size:8px;color:#888;display:block;margin-top:1px}}
@media print{{body{{background:#fff;padding:0}}.w{{box-shadow:none;width:100%;max-width:320px}}}}
</style></head><body>
<div class="w">
<hr class="cut"/>
<div class="body">
{watermark}
<div class="name">{shop_name}</div>
{tagline}
<hr class="d"/>
{addr}
{phone}
<hr class="d"/>
<div class="meta">{invoice}</div>
<div class="meta">Date: {date_str}</div>
<div class="meta">Time: {time_str}</div>
<hr class="d"/>
<table><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Amount</th></tr></thead><tbody>
{items_html}
</tbody></table>
<hr class="d"/>
<div class="row"><span>Subtotal</span><span>{subtotal:.0}</span></div>
{gst_row}
<hr class="d"/>
<div class="total"><span>Grand Total</span><span>{grand_total:.0}</span></div>
<hr class="d"/>
{pay}
{footer}
<div class="brand"><b>Powered by Krixov</b><small>www.krixov.com</small></div>
</div>
<hr class="cut"/>
</div>
</body></html>"#,
        watermark = watermark,
        shop_name = html_escape(&shop_name),
        tagline = tagline,
        addr = addr,
        phone = phone,
        invoice = invoice,
        date_str = date_str,
        time_str = time_str,
        items_html = items_html,
        subtotal = subtotal,
        gst_row = gst_row,
        grand_total = grand_total,
        pay = pay,
        footer = footer,
    );

    Ok(html)
}

fn get_logo_data_uri(app: &tauri::AppHandle) -> Option<String> {
    use base64::Engine;
    let app_dir = app.path().app_data_dir().ok()?;
    let logo_path = app_dir.join("logo.png");
    if !logo_path.exists() { return None; }
    let bytes = std::fs::read(&logo_path).ok()?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Some(format!("data:image/png;base64,{}", b64))
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

// ═══════════════════════════════════════════════════════════════════════════
// PRINTER TRANSPORT FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

fn print_via_usb(port: &str, data: &[u8]) -> Result<(), String> {
    use std::io::Write;
    let path = format!("\\\\.\\{}", port);
    let mut f = std::fs::OpenOptions::new().write(true).open(&path)
        .map_err(|e| format!("Cannot open USB port {}: {}", port, e))?;
    f.write_all(data).map_err(|e| format!("USB write failed: {}", e))?;
    f.flush().map_err(|e| format!("USB flush failed: {}", e))?;
    Ok(())
}

fn print_via_port(port: &str, data: &[u8]) -> Result<(), String> {
    use std::io::Write;
    let path = format!("\\\\.\\{}", port);
    let mut f = std::fs::OpenOptions::new().write(true).open(&path)
        .map_err(|e| format!("Cannot open Bluetooth port {}: {}", port, e))?;
    f.write_all(data).map_err(|e| format!("Bluetooth write failed: {}", e))?;
    f.flush().map_err(|e| format!("Bluetooth flush failed: {}", e))?;
    Ok(())
}

fn print_via_network(address: &str, data: &[u8]) -> Result<(), String> {
    use std::io::Write;
    use std::net::TcpStream;
    let addr = if address.contains(':') { address.to_string() } else { format!("{}:9100", address) };
    let mut stream = TcpStream::connect(&addr)
        .map_err(|e| format!("Cannot connect to network printer {}: {}", addr, e))?;
    stream.set_write_timeout(Some(std::time::Duration::from_secs(10))).ok();
    stream.write_all(data).map_err(|e| format!("Network write failed: {}", e))?;
    stream.flush().map_err(|e| format!("Network flush failed: {}", e))?;
    Ok(())
}

fn print_via_windows_name(printer_name: &str, content: &str) -> Result<(), String> {
    let temp_path = std::env::temp_dir().join("billeasy_receipt.txt");
    std::fs::write(&temp_path, content).map_err(|e| e.to_string())?;
    let temp_str = temp_path.to_string_lossy().to_string();
    let ps_script = format!(
        "Get-Content -Path '{}' -Raw | Out-Printer -Name '{}'",
        temp_str.replace('\'', "''"), printer_name.replace('\'', "''")
    );
    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &ps_script])
        .output()
        .map_err(|e| format!("Cannot run PowerShell: {}", e))?;
    if output.status.success() {
        Ok(())
    } else {
        let err = String::from_utf8_lossy(&output.stderr).to_string();
        Err(format!("Print failed on '{}': {}", printer_name, err.trim()))
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// PRINTER DETECTION
// ═══════════════════════════════════════════════════════════════════════════

#[tauri::command]
pub fn list_printers() -> Result<Vec<PrinterInfo>, String> {
    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command",
            "Get-Printer | Select-Object Name, DriverName, PortName | ConvertTo-Json -Compress"])
        .output()
        .map_err(|e| format!("Failed to run Get-Printer: {}", e))?;
    if !output.status.success() {
        return Err(format!("Get-Printer failed: {}", String::from_utf8_lossy(&output.stderr)));
    }
    let raw = String::from_utf8_lossy(&output.stdout);
    let trimmed = raw.trim();
    if trimmed.is_empty() { return Ok(Vec::new()); }
    if trimmed.starts_with('[') {
        serde_json::from_str::<Vec<PrinterInfo>>(trimmed).map_err(|e| format!("Parse error: {}", e))
    } else {
        let s: PrinterInfo = serde_json::from_str(trimmed).map_err(|e| format!("Parse error: {}", e))?;
        Ok(vec![s])
    }
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct PrinterInfo {
    #[serde(alias = "Name", default)]  pub name: String,
    #[serde(alias = "DriverName", default)]  pub driver: String,
    #[serde(alias = "PortName", default)]  pub port_name: String,
}
