use tauri::Manager;
use crate::models::OrderItem;
use std::sync::OnceLock;
use std::sync::Mutex;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

// ═══════════════════════════════════════════════════════════════════════════
// LOGO CACHE — loaded once, reused per print
// ═══════════════════════════════════════════════════════════════════════════

static LOGO_CACHE: OnceLock<Mutex<Option<Vec<u8>>>> = OnceLock::new();

fn get_cached_logo(app: Option<&tauri::AppHandle>, force_reload: bool) -> Option<Vec<u8>> {
    let cache = LOGO_CACHE.get_or_init(|| Mutex::new(None));
    let mut guard = cache.lock().ok()?;

    if guard.is_some() && !force_reload {
        return guard.clone();
    }

    // Load and cache
    if let Some(app) = app {
        if let Ok(dir) = app.path().app_data_dir() {
            let path = dir.join("logo.png");
            if path.exists() {
                if let Some(bytes) = build_raster_image_from_file(&path, 360) {
                    *guard = Some(bytes.clone());
                    return Some(bytes);
                }
            }
        }
    }
    *guard = None;
    None
}

/// Invalidate logo cache (called when logo is changed/deleted)
pub fn invalidate_logo_cache() {
    if let Some(cache) = LOGO_CACHE.get() {
        if let Ok(mut guard) = cache.lock() {
            *guard = None;
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// ESC/POS COMMAND BUILDER
// ═══════════════════════════════════════════════════════════════════════════

struct EscPos {
    buf: Vec<u8>,
    width: usize, // character width (32 for 58mm, 48 for 80mm)
}

impl EscPos {
    fn new(width: usize) -> Self {
        let mut ep = EscPos { buf: Vec::with_capacity(4096), width };
        ep.cmd(&[0x1B, 0x40]); // ESC @ — initialize printer
        ep.cmd(&[0x1B, 0x74, 0x00]); // ESC t 0 — PC437 codepage
        ep
    }

    /// Raw bytes
    fn cmd(&mut self, bytes: &[u8]) {
        self.buf.extend_from_slice(bytes);
    }

    /// Print text (UTF-8 safe, converts to printer-friendly encoding)
    fn text(&mut self, s: &str) {
        // ESC/POS printers accept ASCII; replace non-ASCII gracefully
        for ch in s.chars() {
            if ch.is_ascii() {
                self.buf.push(ch as u8);
            } else {
                // Common substitutions for thermal printers
                match ch {
                    '₹' => self.buf.extend_from_slice(b"Rs."),
                    '✂' => self.buf.extend_from_slice(b"--"),
                    '❤' | '♥' => self.buf.extend_from_slice(b"<3"),
                    '📍' => self.buf.extend_from_slice(b"@"),
                    '📞' => self.buf.extend_from_slice(b"Ph:"),
                    _ => self.buf.push(b'?'),
                }
            }
        }
    }

    fn newline(&mut self) {
        self.cmd(&[0x0A]); // LF
    }

    fn feed(&mut self, lines: u8) {
        self.cmd(&[0x1B, 0x64, lines]); // ESC d n — feed n lines
    }

    // ── Alignment ──

    fn align_left(&mut self)   { self.cmd(&[0x1B, 0x61, 0x00]); }
    fn align_center(&mut self) { self.cmd(&[0x1B, 0x61, 0x01]); }
    #[allow(dead_code)]
    fn align_right(&mut self)  { self.cmd(&[0x1B, 0x61, 0x02]); }

    // ── Text Style ──

    fn bold_on(&mut self)  { self.cmd(&[0x1B, 0x45, 0x01]); }
    fn bold_off(&mut self) { self.cmd(&[0x1B, 0x45, 0x00]); }

    /// Double height + width (for grand total)
    fn double_size_on(&mut self)  { self.cmd(&[0x1D, 0x21, 0x11]); }
    fn double_size_off(&mut self) { self.cmd(&[0x1D, 0x21, 0x00]); }

    /// Double height only
    fn double_height_on(&mut self)  { self.cmd(&[0x1D, 0x21, 0x01]); }
    fn double_height_off(&mut self) { self.cmd(&[0x1D, 0x21, 0x00]); }

    // ── Dividers ──

    fn divider(&mut self) {
        let line = "-".repeat(self.width);
        self.text(&line);
        self.newline();
    }

    #[allow(dead_code)]
    fn thin_divider(&mut self) {
        let line = ".".repeat(self.width);
        self.text(&line);
        self.newline();
    }

    // ── Column Formatting ──

    /// Print a row: left-aligned name, center qty, right-aligned amount
    /// Handles multi-line wrapping for long item names
    fn item_row(&mut self, name: &str, qty: i64, amount: f64) {
        let qty_str = format!("x{}", qty);
        let amt_str = format!("{:.0}", amount);

        // Reserve space: qty(5) + gap(1) + amount(8) = 14 chars for right side
        let right_part = format!("{:>5} {:>8}", qty_str, amt_str);
        let name_max = self.width.saturating_sub(right_part.len() + 1);

        if name.len() <= name_max {
            // Single line
            let padded_name = format!("{:<w$}", name, w = name_max);
            self.text(&padded_name);
            self.text(" ");
            self.text(&right_part);
            self.newline();
        } else {
            // Multi-line: first line with amount, continuation lines indented
            let first_line = &name[..name_max];
            let rest = &name[name_max..];
            let padded = format!("{:<w$}", first_line, w = name_max);
            self.text(&padded);
            self.text(" ");
            self.text(&right_part);
            self.newline();

            // Wrap remaining name chars in chunks
            for chunk in rest.as_bytes().chunks(self.width - 2) {
                self.text("  "); // indent
                if let Ok(s) = std::str::from_utf8(chunk) {
                    self.text(s);
                }
                self.newline();
            }
        }
    }

    /// Print a summary row (e.g., "Subtotal     1234")
    fn summary_row(&mut self, label: &str, amount: &str) {
        let amt_width = 10;
        let label_width = self.width.saturating_sub(amt_width);
        let line = format!("{:<lw$}{:>aw$}", label, amount, lw = label_width, aw = amt_width);
        self.text(&line);
        self.newline();
    }

    /// Print centered text
    fn center_text(&mut self, s: &str) {
        self.align_center();
        self.text(s);
        self.newline();
        self.align_left();
    }

    /// Print centered bold text
    #[allow(dead_code)]
    fn center_bold(&mut self, s: &str) {
        self.align_center();
        self.bold_on();
        self.text(s);
        self.newline();
        self.bold_off();
        self.align_left();
    }

    // ── Raster Image ──

    fn raster_image(&mut self, data: &[u8]) {
        self.align_center();
        self.buf.extend_from_slice(data);
        self.newline();
        self.align_left();
    }

    // ── Cut ──

    #[allow(dead_code)]
    fn full_cut(&mut self) {
        self.feed(3);
        self.cmd(&[0x1D, 0x56, 0x00]); // GS V 0 — full cut
    }

    fn partial_cut(&mut self) {
        self.feed(3);
        self.cmd(&[0x1D, 0x56, 0x01]); // GS V 1 — partial cut
    }

    fn finish(self) -> Vec<u8> {
        self.buf
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// RASTER IMAGE CONVERSION (logo + QR code)
// ═══════════════════════════════════════════════════════════════════════════

/// Convert an image file to ESC/POS raster bitmap bytes (GS v 0)
fn build_raster_image_from_file(path: &std::path::Path, max_width: u32) -> Option<Vec<u8>> {
    let img = image::open(path).ok()?;
    let img = if img.width() > max_width {
        img.resize(max_width, 9999, image::imageops::FilterType::Lanczos3)
    } else {
        img
    };
    build_raster_from_image(&img.to_luma8())
}

/// Convert a grayscale image to ESC/POS raster bytes (GS v 0)
fn build_raster_from_image(gray: &image::GrayImage) -> Option<Vec<u8>> {
    let (w, h) = gray.dimensions();
    if w == 0 || h == 0 { return None; }

    let byte_width = ((w + 7) / 8) as usize;
    let mut raster_data: Vec<u8> = Vec::with_capacity(byte_width * h as usize);

    for y in 0..h {
        for bx in 0..byte_width as u32 {
            let mut byte: u8 = 0;
            for bit in 0..8u32 {
                let x = bx * 8 + bit;
                if x < w {
                    let pixel = gray.get_pixel(x, y).0[0];
                    if pixel < 128 {
                        byte |= 1 << (7 - bit);
                    }
                }
            }
            raster_data.push(byte);
        }
    }

    let mut cmd: Vec<u8> = Vec::new();
    // GS v 0 — print raster bit image
    cmd.extend_from_slice(&[0x1D, 0x76, 0x30, 0x00]);
    cmd.push((byte_width & 0xFF) as u8);
    cmd.push(((byte_width >> 8) & 0xFF) as u8);
    cmd.push((h & 0xFF) as u8);
    cmd.push(((h >> 8) & 0xFF) as u8);
    cmd.extend_from_slice(&raster_data);
    Some(cmd)
}

/// Generate a QR code as raster image bytes for thermal printing
fn build_qr_raster(url: &str, module_size: u32) -> Option<Vec<u8>> {
    use qrcode::QrCode;

    let code = QrCode::new(url.as_bytes()).ok()?;
    let img = code.render::<image::Luma<u8>>()
        .quiet_zone(true)
        .min_dimensions(module_size, module_size)
        .max_dimensions(module_size, module_size)
        .build();

    build_raster_from_image(&img)
}

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

fn get_printer_config() -> (String, String, bool, bool) {
    if let Some(db) = crate::db::DB.get() {
        if let Ok(conn) = db.lock() {
            let name = conn.query_row("SELECT value FROM settings WHERE key='printer_name'", [], |r| r.get::<_, String>(0)).unwrap_or_else(|_| "USB001".to_string());
            let ptype = conn.query_row("SELECT value FROM settings WHERE key='printer_type'", [], |r| r.get::<_, String>(0)).unwrap_or_else(|_| "usb".to_string());
            let has_cutter = conn.query_row("SELECT value FROM settings WHERE key='has_cutter'", [], |r| r.get::<_, String>(0)).unwrap_or_else(|_| "1".to_string());
            let logo_enabled = conn.query_row("SELECT value FROM settings WHERE key='logo_enabled'", [], |r| r.get::<_, String>(0)).unwrap_or_else(|_| "0".to_string());
            return (name, ptype, has_cutter == "1", logo_enabled == "1");
        }
    }
    ("USB001".to_string(), "usb".to_string(), true, false)
}

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


// ═══════════════════════════════════════════════════════════════════════════
// MAIN RECEIPT BUILDER — Full ESC/POS binary stream
// ═══════════════════════════════════════════════════════════════════════════

fn build_escpos_receipt(
    app: &tauri::AppHandle,
    order_id: i64,
    items: &[OrderItem],
    subtotal: f64,
    gst_percent: f64,
    gst_amount: f64,
    grand_total: f64,
    shop_name: &str,
    shop_tagline: &str,
    shop_address: &str,
    shop_phone: &str,
    bill_footer: &str,
    payment_mode: &str,
    logo_enabled: bool,
    has_cutter: bool,
) -> Vec<u8> {
    let w = 32; // 58mm thermal — 32 chars; use 48 for 80mm
    let mut ep = EscPos::new(w);

    // ── LOGO (cached) ──
    if logo_enabled {
        if let Some(logo_data) = get_cached_logo(Some(app), false) {
            ep.raster_image(&logo_data);
            ep.feed(1);
        }
    }

    // ── SHOP HEADER (centered, bold) ──
    ep.align_center();
    ep.bold_on();
    ep.double_height_on();
    ep.text(shop_name);
    ep.newline();
    ep.double_height_off();
    ep.bold_off();

    if !shop_tagline.is_empty() {
        ep.text(shop_tagline);
        ep.newline();
    }
    ep.align_left();

    ep.divider();

    // ── Address / Phone ──
    if !shop_address.is_empty() {
        ep.center_text(shop_address);
    }
    if !shop_phone.is_empty() {
        ep.center_text(&format!("Ph: {}", shop_phone));
    }
    if !shop_address.is_empty() || !shop_phone.is_empty() {
        ep.divider();
    }

    // ── Invoice details ──
    let now = chrono::Local::now();
    if order_id > 0 {
        ep.text(&format!("Bill No: {:03}", order_id));
        ep.newline();
    }
    ep.text(&format!("Date: {}", now.format("%d %b %Y")));
    ep.newline();
    ep.text(&format!("Time: {}", now.format("%I:%M %p")));
    ep.newline();

    ep.divider();

    // ── Item table header ──
    ep.bold_on();
    let hdr_name_w = w.saturating_sub(14);
    let header = format!("{:<nw$} {:>5} {:>8}", "ITEM", "QTY", "AMT", nw = hdr_name_w);
    ep.text(&header);
    ep.newline();
    ep.bold_off();
    ep.divider();

    // ── Items ──
    for item in items {
        let line_total = item.price * item.qty as f64;
        ep.item_row(&item.name, item.qty, line_total);
    }

    ep.divider();

    // ── Subtotal / Tax ──
    ep.summary_row("Subtotal", &format!("{:.0}", subtotal));

    if gst_percent > 0.0 {
        ep.summary_row(&format!("GST ({:.0}%)", gst_percent), &format!("{:.0}", gst_amount));
    }

    ep.divider();

    // ── GRAND TOTAL (bold + double size) ──
    ep.bold_on();
    ep.double_size_on();
    ep.align_center();
    ep.text(&format!("TOTAL: Rs.{:.0}", grand_total));
    ep.newline();
    ep.double_size_off();
    ep.bold_off();
    ep.align_left();

    ep.divider();

    // ── Payment mode ──
    if !payment_mode.is_empty() {
        ep.text(&format!("Paid via: {}", payment_mode));
        ep.newline();
        ep.feed(1);
    }

    // ── Footer / Thank you message ──
    if !bill_footer.is_empty() {
        for line in bill_footer.split('\n') {
            let trimmed = line.trim();
            if !trimmed.is_empty() {
                ep.center_text(trimmed);
            }
        }
        ep.feed(1);
    }

    // ── Branding ──
    ep.align_center();
    ep.text("Powered by Krixov");
    ep.newline();
    ep.text("www.krixov.com");
    ep.newline();
    ep.feed(1);

    // ── QR Code ──
    ep.text("Scan to visit");
    ep.newline();
    if let Some(qr_data) = build_qr_raster("https://www.krixov.com", 200) {
        ep.raster_image(&qr_data);
    }
    ep.align_left();

    ep.feed(1);

    // ── Cut ──
    if has_cutter {
        ep.partial_cut();
    } else {
        ep.feed(5);
    }

    ep.finish()
}

/// Build a plain-text fallback receipt (for virtual printers like PDF/XPS)
fn build_text_receipt(
    order_id: i64, items: &[OrderItem],
    subtotal: f64, gst_percent: f64, gst_amount: f64, grand_total: f64,
    shop_name: &str, shop_tagline: &str, shop_address: &str, shop_phone: &str,
    bill_footer: &str, payment_mode: &str,
) -> String {
    let w = 40;
    let mut l: Vec<String> = Vec::new();

    l.push(center_str(shop_name, w));
    if !shop_tagline.is_empty() { l.push(center_str(shop_tagline, w)); }
    l.push("-".repeat(w));
    if !shop_address.is_empty() { l.push(center_str(shop_address, w)); }
    if !shop_phone.is_empty() { l.push(center_str(&format!("Ph: {}", shop_phone), w)); }
    if !shop_address.is_empty() || !shop_phone.is_empty() { l.push("-".repeat(w)); }

    let now = chrono::Local::now();
    if order_id > 0 { l.push(format!("Bill No: {:03}", order_id)); }
    l.push(format!("Date: {}", now.format("%d %b %Y")));
    l.push(format!("Time: {}", now.format("%I:%M %p")));
    l.push("-".repeat(w));

    l.push(format!("{:<20} {:>5} {:>11}", "ITEM", "QTY", "AMOUNT"));
    l.push("-".repeat(w));

    for item in items {
        let name = if item.name.len() > 20 { &item.name[..20] } else { &item.name };
        let lt = item.price * item.qty as f64;
        l.push(format!("{:<20} {:>5} {:>11}", name, item.qty, format!("{:.0}", lt)));
    }
    l.push("-".repeat(w));

    l.push(format!("{:<28} {:>8}", "Subtotal", format!("{:.0}", subtotal)));
    if gst_percent > 0.0 {
        l.push(format!("{:<28} {:>8}", format!("GST ({:.0}%)", gst_percent), format!("{:.0}", gst_amount)));
    }
    l.push("-".repeat(w));
    l.push(format!("{:<28} {:>8}", "GRAND TOTAL", format!("Rs.{:.0}", grand_total)));
    l.push("-".repeat(w));

    if !payment_mode.is_empty() { l.push(format!("Paid via: {}", payment_mode)); l.push(String::new()); }
    if !bill_footer.is_empty() {
        for line in bill_footer.split('\n') { l.push(center_str(line.trim(), w)); }
    }
    l.push(String::new());
    l.push(center_str("Powered by Krixov", w));
    l.push(center_str("www.krixov.com", w));
    l.push(String::new());
    l.push(String::new());

    l.join("\r\n")
}

fn center_str(text: &str, width: usize) -> String {
    let len = text.chars().count();
    if len >= width { return text.to_string(); }
    let pad = (width - len) / 2;
    format!("{}{}", " ".repeat(pad), text)
}

// ═══════════════════════════════════════════════════════════════════════════
// THERMAL PRINT — Main command
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

    // For "name" type, detect if it's a virtual printer (PDF, XPS, etc.)
    // Virtual printers can't handle raw ESC/POS binary
    if printer_type == "name" {
        let name_lower = printer_name.to_lowercase();
        let is_virtual = name_lower.contains("pdf")
            || name_lower.contains("xps")
            || name_lower.contains("onenote")
            || name_lower.contains("fax")
            || name_lower.contains("microsoft print");

        if is_virtual {
            // Virtual printer → use text-mode printing
            let text = build_text_receipt(
                order_id, &items, subtotal, gst_percent, gst_amount, grand_total,
                &shop_name, &shop_tagline, &shop_address, &shop_phone,
                &bill_footer, &payment_mode,
            );
            return print_via_windows_name(&printer_name, &text);
        }

        // Real thermal printer connected via Windows driver → try raw ESC/POS
        let raw_bytes = build_escpos_receipt(
            &app, order_id, &items,
            subtotal, gst_percent, gst_amount, grand_total,
            &shop_name, &shop_tagline, &shop_address, &shop_phone,
            &bill_footer, &payment_mode,
            logo_enabled, has_cutter,
        );

        // Try raw ESC/POS first; if it fails, fall back to text
        match print_raw_via_windows_spooler(&printer_name, &raw_bytes) {
            Ok(()) => return Ok(()),
            Err(_) => {
                let text = build_text_receipt(
                    order_id, &items, subtotal, gst_percent, gst_amount, grand_total,
                    &shop_name, &shop_tagline, &shop_address, &shop_phone,
                    &bill_footer, &payment_mode,
                );
                return print_via_windows_name(&printer_name, &text);
            }
        }
    }

    // USB / Bluetooth / Network — always full ESC/POS binary
    let raw_bytes = build_escpos_receipt(
        &app, order_id, &items,
        subtotal, gst_percent, gst_amount, grand_total,
        &shop_name, &shop_tagline, &shop_address, &shop_phone,
        &bill_footer, &payment_mode,
        logo_enabled, has_cutter,
    );

    match printer_type.as_str() {
        "bluetooth" => print_via_port(&printer_name, &raw_bytes),
        "network"   => print_via_network(&printer_name, &raw_bytes),
        _           => print_via_usb(&printer_name, &raw_bytes),
    }
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

    let invoice = if order_id > 0 { format!("Bill No: {:03}", order_id) } else { String::new() };
    let tagline = if !shop_tagline.is_empty() { format!("<div class='tagline'>{}</div>", html_escape(&shop_tagline)) } else { String::new() };
    let addr = if !shop_address.is_empty() { format!("<div class='contact'>{}</div>", html_escape(&shop_address)) } else { String::new() };
    let phone = if !shop_phone.is_empty() { format!("<div class='contact'>Ph: {}</div>", html_escape(&shop_phone)) } else { String::new() };
    let gst_row = if gst_percent > 0.0 { format!("<div class='row'><span>GST ({:.0}%)</span><span>{:.0}</span></div>", gst_percent, gst_amount) } else { String::new() };
    let pay = if !payment_mode.is_empty() { format!("<div class='pay'>Paid via: {}</div>", html_escape(&payment_mode)) } else { String::new() };
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
.cut::after{{content:'';position:absolute;top:-10px;right:10px;font-size:14px;background:#fff;color:#888;padding:0 4px}}
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
<div class="total"><span>Grand Total</span><span>Rs.{grand_total:.0}</span></div>
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

/// Send raw ESC/POS binary data through the Windows print spooler.
/// This allows images (logo, QR code) and ESC/POS commands to work
/// on any Windows-named printer that supports ESC/POS.
fn print_raw_via_windows_spooler(printer_name: &str, data: &[u8]) -> Result<(), String> {
    // Write raw bytes to temp file
    let temp_path = std::env::temp_dir().join("billeasy_receipt.bin");
    std::fs::write(&temp_path, data).map_err(|e| e.to_string())?;
    let temp_str = temp_path.to_string_lossy().to_string();

    // PowerShell script that uses P/Invoke to send raw data via winspool.drv
    let ps_script = format!(r#"
Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;

public class RawPrinter {{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public struct DOCINFOA {{
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }}

    [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Ansi)]
    public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);
    [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Ansi)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, ref DOCINFOA di);
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    public static bool SendRawData(string printerName, byte[] data) {{
        IntPtr hPrinter;
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) return false;

        DOCINFOA di = new DOCINFOA();
        di.pDocName = "BillEasy Receipt";
        di.pDataType = "RAW";

        if (!StartDocPrinter(hPrinter, 1, ref di)) {{ ClosePrinter(hPrinter); return false; }}
        if (!StartPagePrinter(hPrinter)) {{ EndDocPrinter(hPrinter); ClosePrinter(hPrinter); return false; }}

        IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(data.Length);
        Marshal.Copy(data, 0, pUnmanagedBytes, data.Length);
        int written;
        bool ok = WritePrinter(hPrinter, pUnmanagedBytes, data.Length, out written);
        Marshal.FreeCoTaskMem(pUnmanagedBytes);

        EndPagePrinter(hPrinter);
        EndDocPrinter(hPrinter);
        ClosePrinter(hPrinter);
        return ok;
    }}
}}
"@

$bytes = [System.IO.File]::ReadAllBytes('{temp_file}')
$result = [RawPrinter]::SendRawData('{printer}', $bytes)
if (-not $result) {{ throw "Raw print failed for printer '{printer}'" }}
"#,
        temp_file = temp_str.replace('\'', "''").replace('\\', "\\\\"),
        printer = printer_name.replace('\'', "''"),
    );

    let mut cmd = std::process::Command::new("powershell");
    cmd.args(["-NoProfile", "-NonInteractive", "-Command", &ps_script]);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let output = cmd.output()
        .map_err(|e| format!("Cannot run PowerShell: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let err = String::from_utf8_lossy(&output.stderr).to_string();
        Err(format!("Raw print failed on '{}': {}", printer_name, err.trim()))
    }
}

/// Text-mode printing for virtual printers (PDF, XPS, etc.)
fn print_via_windows_name(printer_name: &str, content: &str) -> Result<(), String> {
    let temp_path = std::env::temp_dir().join("billeasy_receipt.txt");
    std::fs::write(&temp_path, content).map_err(|e| e.to_string())?;
    let temp_str = temp_path.to_string_lossy().to_string();
    let ps_script = format!(
        "Get-Content -Path '{}' -Raw | Out-Printer -Name '{}'",
        temp_str.replace('\'', "''"), printer_name.replace('\'', "''")
    );
    let mut cmd = std::process::Command::new("powershell");
    cmd.args(["-NoProfile", "-NonInteractive", "-Command", &ps_script]);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let output = cmd.output()
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
    let mut cmd = std::process::Command::new("powershell");
    cmd.args(["-NoProfile", "-Command",
        "Get-Printer | Select-Object Name, DriverName, PortName | ConvertTo-Json -Compress"]);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let output = cmd.output()
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
