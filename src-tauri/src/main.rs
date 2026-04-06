// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
mod models;
mod commands;

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let app_data_dir = app.path()
                .app_data_dir()
                .expect("Failed to get app data dir")
                .to_string_lossy()
                .to_string();

            std::fs::create_dir_all(&app_data_dir)
                .expect("Failed to create app data dir");

            db::init(&app_data_dir)
                .expect("Database initialisation failed");

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::menu::get_categories,
            commands::menu::create_category,
            commands::menu::update_category,
            commands::menu::delete_category,
            commands::menu::get_items,
            commands::menu::create_item,
            commands::menu::update_item,
            commands::menu::delete_item,
            commands::orders::save_order,
            commands::orders::get_orders,
            commands::orders::get_summary,
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::print::print_receipt,
            commands::license::validate_license,
            commands::license::get_license_status,
            commands::license::get_machine_id,
        ])
        .run(tauri::generate_context!())
        .expect("Error while running BillEasy");
}
