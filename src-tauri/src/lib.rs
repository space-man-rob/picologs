use tauri::Emitter;
use tauri::Manager;
use tauri::menu::{Menu, MenuItemBuilder};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn find_star_citizen_logs() -> Result<Vec<String>, String> {
    #[cfg(windows)]
    {
        use std::path::PathBuf;
        use winreg::enums::*;
        use winreg::RegKey;

        let mut paths = Vec::new();

        // Try to find installation path from registry
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);

        // Try App Paths registry key
        if let Ok(app_paths) = hklm.open_subkey("SOFTWARE\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\StarCitizen Launcher.exe") {
            if let Ok(path) = app_paths.get_value::<String, _>("Path") {
                // Path points to the launcher directory, need to find StarCitizen folder
                let launcher_path = PathBuf::from(path);
                if let Some(parent) = launcher_path.parent() {
                    let sc_path = parent.join("StarCitizen");

                    // Check for LIVE, PTU, and HOTFIX environments
                    for env in &["LIVE", "PTU", "HOTFIX"] {
                        let log_path = sc_path.join(env).join("Game.log");
                        if log_path.exists() {
                            paths.push(log_path.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }

        // Try Cloud Imperium Games registry key
        if paths.is_empty() {
            if let Ok(cig_key) = hklm.open_subkey("SOFTWARE\\Wow6432Node\\Cloud Imperium Games\\StarCitizen Launcher.exe") {
                if let Ok(path) = cig_key.get_value::<String, _>("InstallLocation") {
                    let install_path = PathBuf::from(path);
                    let sc_path = install_path.join("StarCitizen");

                    for env in &["LIVE", "PTU", "HOTFIX"] {
                        let log_path = sc_path.join(env).join("Game.log");
                        if log_path.exists() {
                            paths.push(log_path.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }

        // Fallback to %APPDATA% path (where logs are actually stored)
        if paths.is_empty() {
            if let Ok(appdata) = std::env::var("APPDATA") {
                let sc_appdata = PathBuf::from(appdata)
                    .join("Roberts Space Industries")
                    .join("StarCitizen");

                for env in &["LIVE", "PTU", "HOTFIX"] {
                    let log_path = sc_appdata.join(env).join("Game.log");
                    if log_path.exists() {
                        paths.push(log_path.to_string_lossy().to_string());
                    }
                }

                // If no logs found but directory exists, return the directory path
                if paths.is_empty() && sc_appdata.exists() {
                    paths.push(sc_appdata.to_string_lossy().to_string());
                }
            }
        }

        if paths.is_empty() {
            Err("Could not find Star Citizen installation or logs".to_string())
        } else {
            Ok(paths)
        }
    }

    #[cfg(not(windows))]
    {
        Err("Star Citizen is only available on Windows".to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_websocket::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // When a second instance tries to launch with a deep link, forward it to the first instance
            if let Some(url) = args.get(1) {
                println!("Received deep link in second instance: {}", url);
                // Emit to all windows
                let _ = app.emit_to("main", "deep-link-received", url);
                println!("Emitted deep-link-received event");
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().pubkey("dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDdCRDA5MjA5MDI3NUI1NEIKUldSTHRYVUNDWkxRZTBsSWpYbmd2SGprNmVmTHpwaW5PTGFCUFdtdXNpOCszWmdjOXF4S2RaaTMK").build())
        .setup(|app| {
            // Open devtools in debug builds for easier debugging
            #[cfg(debug_assertions)]
            {
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
            }

            // Create Help menu items
            let terms = MenuItemBuilder::with_id("terms", "Terms of Service").build(app)?;
            let privacy = MenuItemBuilder::with_id("privacy", "Privacy Policy").build(app)?;

            // Get the default menu
            let menu = Menu::default(app.handle())?;

            // Find and modify the existing Help submenu
            if let Ok(items) = menu.items() {
                for item in items {
                    if let Some(submenu) = item.as_submenu() {
                        if let Ok(text) = submenu.text() {
                            if text == "Help" {
                                // Add separator and our items to the existing Help menu
                                submenu.append(
                                    &tauri::menu::PredefinedMenuItem::separator(app)?
                                )?;
                                submenu.append(&terms)?;
                                submenu.append(&privacy)?;
                                break;
                            }
                        }
                    }
                }
            }

            app.set_menu(menu)?;

            // Handle menu events
            app.on_menu_event(move |_app_handle, event| {
                match event.id().as_ref() {
                    "terms" => {
                        let _ = tauri_plugin_opener::open_url("https://picologs.com/terms", None::<&str>);
                    }
                    "privacy" => {
                        let _ = tauri_plugin_opener::open_url("https://picologs.com/privacy", None::<&str>);
                    }
                    _ => {}
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet, find_star_citizen_logs])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
