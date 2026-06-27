use std::fs;

/// A config file entry found by scan_configs.
#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct ConfigEntry {
    /// File name (e.g. "com.example.plugin.cfg")
    pub name: String,
    /// Relative path from the exe directory (e.g. "BepInEx/config/com.example.plugin.cfg")
    pub rel_path: String,
    /// File size in bytes
    pub size: u64,
}

/// Scan for config files:
/// - All .cfg files in ./BepInEx/config/
/// - NPCBehaviorMod/config.txt if it exists
#[tauri::command]
pub fn scan_configs() -> Result<Vec<ConfigEntry>, String> {
    let exe_dir = std::env::current_exe()
        .map_err(|e| format!("Failed to get exe path: {}", e))?
        .parent()
        .ok_or("Cannot determine exe directory")?
        .to_path_buf();

    let mut entries = Vec::new();

    // Scan BepInEx/config/*.cfg and *.json
    let config_dir = exe_dir.join("BepInEx").join("config");
    if config_dir.exists() && config_dir.is_dir() {
        let read_dir = fs::read_dir(&config_dir)
            .map_err(|e| format!("Failed to read config directory: {}", e))?;
        for entry in read_dir {
            let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
            let name = entry.file_name().to_string_lossy().to_string();
            if name.to_lowercase().ends_with(".cfg") || name.to_lowercase().ends_with(".json") {
                let metadata = entry
                    .metadata()
                    .map_err(|e| format!("Failed to read metadata: {}", e))?;
                if !metadata.is_dir() {
                    let rel = format!("BepInEx/config/{}", name);
                    entries.push(ConfigEntry {
                        name,
                        rel_path: rel,
                        size: metadata.len(),
                    });
                }
            }
        }
    }

    // Check for NPCBehaviorMod/config.txt
    let npc_path = exe_dir.join("NPCBehaviorMod").join("config.txt");
    if npc_path.exists() && npc_path.is_file() {
        let metadata =
            fs::metadata(&npc_path).map_err(|e| format!("Failed to read metadata: {}", e))?;
        entries.push(ConfigEntry {
            name: "config.txt".to_string(),
            rel_path: "NPCBehaviorMod/config.txt".to_string(),
            size: metadata.len(),
        });
    }

    // Sort by name
    entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    Ok(entries)
}

/// Read a config file's content by its relative path.
#[tauri::command]
pub fn read_config(rel_path: &str) -> Result<String, String> {
    let exe_dir = std::env::current_exe()
        .map_err(|e| format!("Failed to get exe path: {}", e))?
        .parent()
        .ok_or("Cannot determine exe directory")?
        .to_path_buf();

    let path = exe_dir.join(rel_path);
    if !path.exists() {
        return Err(format!("Config file not found: {}", rel_path));
    }

    fs::read_to_string(&path).map_err(|e| format!("Failed to read config file: {}", e))
}

/// Write content to a config file by its relative path.
#[tauri::command]
pub fn write_config(rel_path: &str, content: &str) -> Result<(), String> {
    let exe_dir = std::env::current_exe()
        .map_err(|e| format!("Failed to get exe path: {}", e))?
        .parent()
        .ok_or("Cannot determine exe directory")?
        .to_path_buf();

    let path = exe_dir.join(rel_path);
    if !path.exists() {
        return Err(format!("Config file not found: {}", rel_path));
    }

    fs::write(&path, content).map_err(|e| format!("Failed to write config file: {}", e))
}
