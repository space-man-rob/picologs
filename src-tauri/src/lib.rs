// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_websocket::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_single_instance::init(|_, _, _| {}))
        .plugin(tauri_plugin_updater::Builder::new().pubkey("dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVSM1RPY2pRblk5M0NoK0EyV05QM3RlYmFKTTZYYVVCTDhFeGY3eEU1VFJTNncwK1QrbndjWGMwT2tLMUxYMUptWWNYRGZXYlpOVmdBanRrL0U4SnFidExaYlh5V2VPeGdjPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzQ4MjMxNDA1CWZpbGU6cGljb2xvZ3NfMC4xLjBfeDY0X2VuLVVTLm1zaQoxMWhVV3RacXloc3pSNkJ3M0dNejc2eHF6VDFQSlo0VVVEQ09vVFdlKzl3WG5ZOEtIc3Y1OURITWs0U2liRWplL3pKZS9mN3diVlR2MW1wKzBHRzhBdz09Cg==").build())
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
