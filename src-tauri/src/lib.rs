use std::path::{Path, PathBuf};
use std::process::Child;
use std::sync::{Arc, Mutex};

use tokio_util::sync::CancellationToken;

mod bepinex;
mod config;
mod game;
mod mods;
mod resource;

/* ===== Shared types ===== */

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct ModEntry {
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
    pub deleted: bool,
    pub deleted_at: Option<u64>,
}

/* ===== Shared app state ===== */

/// Global app state: holds the running game process, a shared log buffer, and a BepInEx download cancellation token.
struct AppState {
    child: Option<Child>,
    log_buffer: Arc<Mutex<Vec<String>>>,
    be_cancel: Arc<CancellationToken>,
}

impl AppState {
    fn new() -> Self {
        Self {
            child: None,
            log_buffer: Arc::new(Mutex::new(Vec::new())),
            be_cancel: Arc::new(CancellationToken::new()),
        }
    }
}

/* ===== Shared helpers ===== */

/// Resolve a path: if relative, resolve against the exe's parent directory.
fn resolve_path(path: &str) -> Result<PathBuf, String> {
    let p = Path::new(path);
    if p.is_absolute() {
        if !p.exists() {
            return Err(format!("Path does not exist: {}", path));
        }
        Ok(p.to_path_buf())
    } else {
        let exe_dir = std::env::current_exe()
            .map_err(|e| format!("Failed to get exe path: {}", e))?
            .parent()
            .ok_or("Cannot determine exe directory")?
            .to_path_buf();
        let resolved = exe_dir.join(p);
        if !resolved.exists() {
            return Err(format!(
                "Path does not exist: {} (resolved to {})",
                path,
                resolved.display()
            ));
        }
        Ok(resolved)
    }
}

/* ===== App entry point ===== */

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = Mutex::new(AppState::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            // Mods
            mods::scan_mods,
            mods::delete_mod,
            mods::restore_mod,
            mods::purge_mod,
            mods::load_descriptions,
            // Game
            game::launch_game,
            game::is_game_running,
            game::get_game_log,

            // Config
            config::scan_configs,
            config::read_config,
            config::write_config,
            // BepInEx
            bepinex::check_bepinex,
            bepinex::remove_bepinex,
            bepinex::fetch_bepinex_builds,
            bepinex::get_installed_bepinex_version,
            bepinex::download_bepinex,
            bepinex::cancel_bepinex_download,
            bepinex::reset_bepinex_cancel_token,
            // Resource
            resource::fetch_manifest,
            resource::download_resource,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
