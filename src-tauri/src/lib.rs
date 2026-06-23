use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct ModDescription {
    pub description: String,
    #[serde(rename = "In")]
    pub r#in: String,
}

const TRASH_DIR_NAME: &str = ".trans";

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct ModEntry {
    name: String,
    is_dir: bool,
    size: u64,
    deleted: bool,
    deleted_at: Option<u64>,
}

/// Global app state: holds the running game process and a shared log buffer.
struct AppState {
    child: Option<Child>,
    log_buffer: Arc<Mutex<Vec<String>>>,
}

impl AppState {
    fn new() -> Self {
        Self {
            child: None,
            log_buffer: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

/// Resolve the trash subdirectory for a given base_path.
/// The trash root is always under the exe directory (not inside the mod folder),
/// so the game's mod loader won't recursively scan deleted dlls.
/// Inside the trash, entries are grouped by the last component of base_path
/// to avoid name collisions across different mod pages.
fn trash_subdir(base_path: &Path) -> PathBuf {
    let exe_dir = std::env::current_exe()
        .expect("Failed to get exe path")
        .parent()
        .expect("Cannot determine exe directory")
        .to_path_buf();
    let trash_root = exe_dir.join(TRASH_DIR_NAME);
    // Use the last component of base_path as sub-directory
    let sub = base_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "default".to_string());
    trash_root.join(sub)
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

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

/// Drain a child process stream (stdout/stderr) line by line into the shared log buffer.
/// Runs on a background thread so it doesn't block the main thread.
fn drain_stream<T: std::io::Read>(stream: T, label: &str, log_buffer: Arc<Mutex<Vec<String>>>) {
    let reader = BufReader::new(stream);
    let prefix = label.to_string();
    for line in reader.lines().map_while(Result::ok) {
        if let Ok(mut buf) = log_buffer.lock() {
            buf.push(format!("[{}] {}", prefix, line));
            // Keep buffer from growing unbounded (keep last 1000 lines)
            if buf.len() > 1000 {
                let drain = buf.len() - 800;
                buf.drain(0..drain);
            }
        }
    }
}

#[tauri::command]
fn scan_mods(path: &str) -> Result<Vec<ModEntry>, String> {
    let dir = resolve_path(path)?;
    if !dir.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }

    let mut entries = Vec::new();

    // Scan live entries
    let read_dir = fs::read_dir(&dir).map_err(|e| format!("Failed to read directory: {}", e))?;
    for entry in read_dir {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let name = entry.file_name().to_string_lossy().to_string();
        let metadata = entry
            .metadata()
            .map_err(|e| format!("Failed to read metadata: {}", e))?;
        entries.push(ModEntry {
            name,
            is_dir: metadata.is_dir(),
            size: metadata.len(),
            deleted: false,
            deleted_at: None,
        });
    }

    // Scan trashed entries (from exe-root trash subdirectory)
    let trash = trash_subdir(&dir);
    if trash.exists() && trash.is_dir() {
        let trash_read =
            fs::read_dir(&trash).map_err(|e| format!("Failed to read trash directory: {}", e))?;
        for entry in trash_read {
            let entry = entry.map_err(|e| format!("Failed to read trash entry: {}", e))?;
            let raw_name = entry.file_name().to_string_lossy().to_string();
            let (deleted_at, name) = raw_name
                .find("__")
                .map(|pos| {
                    let ts: u64 = raw_name[..pos].parse().unwrap_or(0);
                    let original = raw_name[pos + 2..].to_string();
                    (Some(ts), original)
                })
                .unwrap_or((None, raw_name));
            let metadata = entry
                .metadata()
                .map_err(|e| format!("Failed to read metadata: {}", e))?;
            entries.push(ModEntry {
                name,
                is_dir: metadata.is_dir(),
                size: metadata.len(),
                deleted: true,
                deleted_at,
            });
        }
    }

    entries.sort_by(|a, b| {
        let a_rank = match (a.deleted, a.is_dir) {
            (false, true) => 0,
            (false, false) => 1,
            (true, true) => 2,
            (true, false) => 3,
        };
        let b_rank = match (b.deleted, b.is_dir) {
            (false, true) => 0,
            (false, false) => 1,
            (true, true) => 2,
            (true, false) => 3,
        };
        a_rank
            .cmp(&b_rank)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

#[tauri::command]
fn delete_mod(base_path: &str, name: &str) -> Result<(), String> {
    let dir = resolve_path(base_path)?;
    let src = dir.join(name);
    if !src.exists() {
        return Err(format!("File not found: {}", name));
    }

    let trash = trash_subdir(&dir);
    fs::create_dir_all(&trash).map_err(|e| format!("Failed to create trash directory: {}", e))?;

    let trash_name = format!("{}__{}", now_secs(), name);
    let dest = trash.join(&trash_name);

    fs::rename(&src, &dest).map_err(|e| format!("Failed to move to trash: {}", e))?;

    Ok(())
}

#[tauri::command]
fn restore_mod(base_path: &str, name: &str) -> Result<(), String> {
    let dir = resolve_path(base_path)?;
    let trash = trash_subdir(&dir);
    if !trash.exists() {
        return Err("Trash directory does not exist".into());
    }

    let read_dir = fs::read_dir(&trash).map_err(|e| format!("Failed to read trash: {}", e))?;
    for entry in read_dir {
        let entry = entry.map_err(|e| format!("Failed to read trash entry: {}", e))?;
        let raw_name = entry.file_name().to_string_lossy().to_string();
        if let Some(pos) = raw_name.find("__") {
            let original = &raw_name[pos + 2..];
            if original == name {
                let dest = dir.join(name);
                fs::rename(entry.path(), &dest).map_err(|e| format!("Failed to restore: {}", e))?;
                return Ok(());
            }
        }
    }

    Err(format!("Trashed file not found: {}", name))
}

/// Permanently delete a mod from the trash.
#[tauri::command]
fn purge_mod(base_path: &str, name: &str) -> Result<(), String> {
    let dir = resolve_path(base_path)?;
    let trash = trash_subdir(&dir);
    if !trash.exists() {
        return Err("Trash directory does not exist".into());
    }

    let read_dir = fs::read_dir(&trash).map_err(|e| format!("Failed to read trash: {}", e))?;
    for entry in read_dir {
        let entry = entry.map_err(|e| format!("Failed to read trash entry: {}", e))?;
        let raw_name = entry.file_name().to_string_lossy().to_string();
        if let Some(pos) = raw_name.find("__") {
            let original = &raw_name[pos + 2..];
            if original == name {
                let path = entry.path();
                if path.is_dir() {
                    fs::remove_dir_all(&path)
                        .map_err(|e| format!("Failed to purge directory: {}", e))?;
                } else {
                    fs::remove_file(&path).map_err(|e| format!("Failed to purge file: {}", e))?;
                }
                return Ok(());
            }
        }
    }

    Err(format!("Trashed file not found: {}", name))
}

/// Launch the game executable. Captures stdout/stderr into a log buffer
/// for later inspection and export. Returns an error if the game is already running.
#[tauri::command]
fn launch_game(exe_name: &str, state: tauri::State<'_, Mutex<AppState>>) -> Result<(), String> {
    let exe_dir = std::env::current_exe()
        .map_err(|e| format!("Failed to get exe path: {}", e))?
        .parent()
        .ok_or("Cannot determine exe directory")?
        .to_path_buf();

    let exe_path = exe_dir.join(exe_name);
    if !exe_path.exists() {
        return Err(format!("Game executable not found: {}", exe_path.display()));
    }

    // Check if a previous process is still running
    {
        let mut app = state.lock().map_err(|e| format!("Lock error: {}", e))?;
        if let Some(ref mut child) = app.child {
            match child.try_wait() {
                Ok(Some(_)) | Err(_) => {
                    // Process has exited or errored — clean up
                    app.child = None;
                }
                Ok(None) => {
                    return Err("Game is already running".into());
                }
            }
        }
        // Clear previous logs
        if let Ok(mut buf) = app.log_buffer.lock() {
            buf.clear();
        };
    }

    // Spawn with piped stdout/stderr
    let mut child = Command::new(&exe_path)
        .current_dir(&exe_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to launch game: {}", e))?;

    // Get the shared log buffer Arc for the drain threads
    let log_buffer = {
        let app = state.lock().map_err(|e| format!("Lock error: {}", e))?;
        Arc::clone(&app.log_buffer)
    };

    // Drain stdout on a background thread
    if let Some(stdout) = child.stdout.take() {
        let buf = Arc::clone(&log_buffer);
        std::thread::spawn(move || {
            drain_stream(stdout, "STDOUT", buf);
        });
    }

    // Drain stderr on a background thread
    if let Some(stderr) = child.stderr.take() {
        let buf = Arc::clone(&log_buffer);
        std::thread::spawn(move || {
            drain_stream(stderr, "STDERR", buf);
        });
    }

    // Store the child handle
    {
        let mut app = state.lock().map_err(|e| format!("Lock error: {}", e))?;
        app.child = Some(child);
    }

    Ok(())
}

/// Check if the game process is still running.
/// Returns true if the process is alive, false if it has exited or was never launched.
#[tauri::command]
fn is_game_running(state: tauri::State<'_, Mutex<AppState>>) -> Result<bool, String> {
    let mut app = state.lock().map_err(|e| format!("Lock error: {}", e))?;
    match app.child {
        Some(ref mut child) => match child.try_wait() {
            Ok(Some(_)) => {
                // Process has exited
                app.child = None;
                Ok(false)
            }
            Ok(None) => Ok(true),
            Err(_) => {
                app.child = None;
                Ok(false)
            }
        },
        None => Ok(false),
    }
}

/// Get the game process log (stdout + stderr) captured since launch.
#[tauri::command]
fn get_game_log(state: tauri::State<'_, Mutex<AppState>>) -> Result<Vec<String>, String> {
    let app = state.lock().map_err(|e| format!("Lock error: {}", e))?;
    let buf = app
        .log_buffer
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    Ok(buf.clone())
}

/// Kill the game process if it is running.
#[tauri::command]
fn kill_game(state: tauri::State<'_, Mutex<AppState>>) -> Result<(), String> {
    let mut app = state.lock().map_err(|e| format!("Lock error: {}", e))?;
    if let Some(ref mut child) = app.child {
        child
            .kill()
            .map_err(|e| format!("Failed to kill game: {}", e))?;
        app.child = None;
    }
    Ok(())
}

#[tauri::command]
fn load_descriptions() -> Result<HashMap<String, ModDescription>, String> {
    let exe_dir = std::env::current_exe()
        .map_err(|e| format!("Failed to get exe path: {}", e))?
        .parent()
        .ok_or("Cannot determine exe directory")?
        .to_path_buf();

    let mut path = exe_dir.join("ModsDescription.json");
    if !path.exists() {
        let cwd = std::env::current_dir()
            .unwrap_or_default()
            .join("ModsDescription.json");
        if cwd.exists() {
            path = cwd;
        } else {
            return Ok(HashMap::new());
        }
    }

    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read ModsDescription.json: {}", e))?;

    let map: HashMap<String, ModDescription> =
        serde_json::from_str(&content).map_err(|e| format!("Invalid JSON: {}", e))?;

    Ok(map)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = Mutex::new(AppState::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            scan_mods,
            delete_mod,
            restore_mod,
            purge_mod,
            launch_game,
            is_game_running,
            get_game_log,
            kill_game,
            load_descriptions
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
