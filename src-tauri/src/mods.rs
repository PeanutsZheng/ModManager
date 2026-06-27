use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::{resolve_path, ModEntry};

/// Category-keyed mod descriptions: { "plugins": { "ModA": "desc..." }, ... }
pub type ModDescriptions = std::collections::HashMap<String, std::collections::HashMap<String, String>>;

const TRASH_DIR_NAME: &str = ".trans";

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

/// Resolve the trash subdirectory for a given base_path.
fn trash_subdir(base_path: &Path) -> PathBuf {
    let exe_dir = std::env::current_exe()
        .expect("Failed to get exe path")
        .parent()
        .expect("Cannot determine exe directory")
        .to_path_buf();
    let trash_root = exe_dir.join(TRASH_DIR_NAME);
    let sub = base_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "default".to_string());
    trash_root.join(sub)
}

#[tauri::command]
pub fn scan_mods(path: &str) -> Result<Vec<ModEntry>, String> {
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
pub fn delete_mod(base_path: &str, name: &str) -> Result<(), String> {
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
pub fn restore_mod(base_path: &str, name: &str) -> Result<(), String> {
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
pub fn purge_mod(base_path: &str, name: &str) -> Result<(), String> {
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

#[tauri::command]
pub fn load_descriptions() -> Result<ModDescriptions, String> {
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
            return Ok(std::collections::HashMap::new());
        }
    }

    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read ModsDescription.json: {}", e))?;

    let map: ModDescriptions =
        serde_json::from_str(&content).map_err(|e| format!("Invalid JSON: {}", e))?;

    Ok(map)
}
