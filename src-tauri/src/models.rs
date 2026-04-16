use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Category {
    pub id: i64,
    pub name: String,
    pub sort_order: i64,
    pub is_active: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Item {
    pub id: i64,
    pub category_id: i64,
    pub name: String,
    pub price: f64,
    pub is_active: bool,
    pub sort_order: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OrderItem {
    pub item_id: i64,
    pub name: String,
    pub price: f64,
    pub qty: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Order {
    pub id: i64,
    pub items: Vec<OrderItem>,
    pub subtotal: f64,
    pub total: f64,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Settings {
    pub shop_name: String,
    pub shop_tagline: String,
    pub shop_address: String,
    pub shop_phone: String,
    pub bill_footer: String,
    pub printer_name: String,
    pub printer_type: String, // "usb" | "bluetooth" | "network" | "name"
    pub logo_enabled: bool,
    pub has_cutter: bool,
    pub gst_percent: f64,
    pub payment_mode: String, // "Cash" | "UPI" | "Card" | ""
}
