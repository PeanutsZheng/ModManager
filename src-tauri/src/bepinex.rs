use std::fs;
use std::sync::{Arc, Mutex};

use crate::AppState;

/// Required BepInEx framework entries (relative to exe directory).
const BEPINEX_REQUIRED: &[&str] = &[
    "BepInEx",
    "dotnet",
    ".doorstop_version",
    "doorstop_config.ini",
    "winhttp.dll",
];

/// BepInEx framework check result.
#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct BepInExCheckResult {
    /// List of missing items (relative paths)
    pub missing: Vec<String>,
    /// true if all required items exist
    pub ok: bool,
}

/// A single BepInEx build artifact.
#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct BepInExArtifact {
    /// Display name (e.g. "BepInEx IL2CPP win-x64 6.0.0-be.783")
    pub name: String,
    /// Download URL
    pub url: String,
    /// Version string (e.g. "6.0.0-be.783+c58c42d")
    pub version: String,
    /// Build number
    pub build_number: u64,
}

/// Check if the BepInEx mod framework is properly installed.
#[tauri::command]
pub fn check_bepinex() -> Result<BepInExCheckResult, String> {
    let exe_dir = std::env::current_exe()
        .map_err(|e| format!("Failed to get exe path: {}", e))?
        .parent()
        .ok_or("Cannot determine exe directory")?
        .to_path_buf();

    let mut missing = Vec::new();

    for &item in BEPINEX_REQUIRED {
        let path = exe_dir.join(item);
        if !path.exists() {
            missing.push(item.to_string());
        }
    }

    let ok = missing.is_empty();

    Ok(BepInExCheckResult { missing, ok })
}

/// Remove the BepInEx mod framework from the game directory.
#[tauri::command]
pub fn remove_bepinex() -> Result<(), String> {
    let exe_dir = std::env::current_exe()
        .map_err(|e| format!("Failed to get exe path: {}", e))?
        .parent()
        .ok_or("Cannot determine exe directory")?
        .to_path_buf();

    // Directories inside BepInEx/ that should be preserved (user mods & configs)
    let preserve_dirs: &[&str] = &["plugins", "config"];

    for &item in BEPINEX_REQUIRED {
        let path = exe_dir.join(item);
        if !path.exists() {
            continue;
        }

        if item == "BepInEx" && path.is_dir() {
            // Selectively remove BepInEx contents, preserving plugins/ and config/
            let entries = fs::read_dir(&path)
                .map_err(|e| format!("Failed to read BepInEx directory: {}", e))?;
            for entry in entries {
                let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
                let name = entry.file_name().to_string_lossy().to_string();
                if preserve_dirs.contains(&name.as_str()) {
                    continue; // Keep user mods and configs
                }
                let entry_path = entry.path();
                if entry_path.is_dir() {
                    fs::remove_dir_all(&entry_path)
                        .map_err(|e| format!("Failed to remove BepInEx/{}: {}", name, e))?;
                } else {
                    fs::remove_file(&entry_path)
                        .map_err(|e| format!("Failed to remove BepInEx/{}: {}", name, e))?;
                }
            }
        } else if path.is_dir() {
            fs::remove_dir_all(&path)
                .map_err(|e| format!("Failed to remove {}: {}", item, e))?;
        } else {
            fs::remove_file(&path)
                .map_err(|e| format!("Failed to remove {}: {}", item, e))?;
        }
    }

    Ok(())
}

/// Fetch available BepInEx IL2CPP win-x64 builds from the bleeding edge page.
#[tauri::command]
pub async fn fetch_bepinex_builds() -> Result<Vec<BepInExArtifact>, String> {
    let url = "https://builds.bepinex.dev/projects/bepinex_be";
    let body = reqwest::Client::new()
        .get(url)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch BepInEx builds: {}", e))?
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    // Parse the HTML to find IL2CPP win-x64 download links.
    let il2cpp_x64_re = regex::Regex::new(
        r#"href="(/[^"]*IL2CPP[^"]*win-x64[^"]*\.zip)""#
    ).unwrap();

    // Extract version from filename
    let version_re = regex::Regex::new(
        r#"(\d+\.\d+\.\d+-be\.\d+[^\"]*)\.zip"#
    ).unwrap();

    // Extract build number from path like /builds/783/download/
    let build_re = regex::Regex::new(r#"/builds/(\d+)/download/"#).unwrap();

    let mut artifacts: Vec<BepInExArtifact> = Vec::new();
    let mut seen_urls = std::collections::HashSet::new();

    for cap in il2cpp_x64_re.captures_iter(&body) {
        let path = &cap[1];
        if seen_urls.contains(path) {
            continue;
        }
        seen_urls.insert(path.to_string());

        let full_url = format!("https://builds.bepinex.dev{}", path);

        let version = version_re
            .captures(path)
            .map(|c| c[1].to_string())
            .unwrap_or_else(|| "unknown".to_string());

        // Strip commit hash after '+' or '%2B' (URL-encoded '+')
        let version = version
            .split('+')
            .next()
            .unwrap_or(&version)
            .split("%2B")
            .next()
            .unwrap_or(&version)
            .to_string();

        let build_number: u64 = build_re
            .captures(path)
            .and_then(|c| c[1].parse().ok())
            .unwrap_or(0);

        artifacts.push(BepInExArtifact {
            name: format!("BepInEx IL2CPP win-x64 {}", version),
            url: full_url,
            version,
            build_number,
        });
    }

    // Sort by build number descending (latest first)
    artifacts.sort_by(|a, b| b.build_number.cmp(&a.build_number));

    // Keep at most 5 results
    artifacts.truncate(5);

    Ok(artifacts)
}

/// Read the installed BepInEx version from the log file.
#[tauri::command]
pub fn get_installed_bepinex_version() -> Result<Option<String>, String> {
    let exe_dir = std::env::current_exe()
        .map_err(|e| format!("Failed to get exe path: {}", e))?
        .parent()
        .ok_or("Cannot determine exe directory")?
        .to_path_buf();

    // Check LogOutput.log first, then LogOutput.txt
    for log_name in &["BepInEx/LogOutput.log", "BepInEx/LogOutput.txt"] {
        let log_path = exe_dir.join(log_name);
        if log_path.exists() {
            let content = fs::read_to_string(&log_path)
                .map_err(|e| format!("Failed to read log: {}", e))?;
            let re = regex::Regex::new(r"BepInEx (\d+\.\d+\.\d+[^\s\]]+)").unwrap();
            if let Some(cap) = re.captures(&content) {
                let raw_version = cap[1].to_string();
                let version = raw_version.split('+').next().unwrap_or(&raw_version).to_string();
                return Ok(Some(version));
            }
        }
    }

    Ok(None)
}

/// Download and install a BepInEx build.
/// Checks a cancellation token on each chunk/file; returns error if cancelled.
#[tauri::command]
pub async fn download_bepinex(
    app: tauri::AppHandle,
    url: String,
    state: tauri::State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    use tauri::Emitter;

    // Clone the cancel token so we don't hold the lock during download
    let cancel = {
        let app_state = state.lock().map_err(|e| format!("Lock error: {}", e))?;
        Arc::clone(&app_state.be_cancel)
    };

    let exe_dir = std::env::current_exe()
        .map_err(|e| format!("Failed to get exe path: {}", e))?
        .parent()
        .ok_or("Cannot determine exe directory")?
        .to_path_buf();

    // Emit progress: downloading
    let _ = app.emit("bepinex-download-progress", serde_json::json!({
        "stage": "downloading",
        "percent": 0
    }));

    // Download the zip
    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Failed to download: {}", e))?;

    let total_size = response.content_length().unwrap_or(0);
    let mut stream = response.bytes_stream();
    use futures_util::StreamExt;

    let mut downloaded: u64 = 0;
    let mut chunks: Vec<u8> = Vec::new();
    let mut last_emitted_percent: u64 = 0;

    while let Some(chunk) = stream.next().await {
        // Check cancellation
        if cancel.is_cancelled() {
            let _ = app.emit("bepinex-download-progress", serde_json::json!({
                "stage": "cancelled",
                "percent": 0
            }));
            return Err("Download cancelled".to_string());
        }

        let chunk = chunk.map_err(|e| format!("Download error: {}", e))?;
        chunks.extend_from_slice(&chunk);
        downloaded += chunk.len() as u64;

        if total_size > 0 {
            let percent = (downloaded * 100) / total_size;
            if percent >= last_emitted_percent + 5 || percent == 100 {
                last_emitted_percent = percent;
                let _ = app.emit("bepinex-download-progress", serde_json::json!({
                    "stage": "downloading",
                    "percent": percent
                }));
            }
        }
    }

    // Check cancellation before extraction
    if cancel.is_cancelled() {
        let _ = app.emit("bepinex-download-progress", serde_json::json!({
            "stage": "cancelled",
            "percent": 0
        }));
        return Err("Download cancelled".to_string());
    }

    let _ = app.emit("bepinex-download-progress", serde_json::json!({
        "stage": "downloading",
        "percent": 100
    }));

    // Extract the zip
    let _ = app.emit("bepinex-download-progress", serde_json::json!({
        "stage": "extracting",
        "percent": 0
    }));

    let reader = std::io::Cursor::new(&chunks);
    let mut archive = zip::ZipArchive::new(reader)
        .map_err(|e| format!("Failed to open zip: {}", e))?;

    let total_files = archive.len();
    for i in 0..total_files {
        // Check cancellation during extraction
        if cancel.is_cancelled() {
            let _ = app.emit("bepinex-download-progress", serde_json::json!({
                "stage": "cancelled",
                "percent": 0
            }));
            return Err("Download cancelled".to_string());
        }

        let mut file = archive.by_index(i).map_err(|e| format!("Zip read error: {}", e))?;
        let outpath = match file.enclosed_name() {
            Some(path) => exe_dir.join(path),
            None => continue,
        };

        if file.is_dir() {
            std::fs::create_dir_all(&outpath)
                .map_err(|e| format!("Failed to create dir: {}", e))?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    std::fs::create_dir_all(p)
                        .map_err(|e| format!("Failed to create dir: {}", e))?;
                }
            }
            let mut outfile = std::fs::File::create(&outpath)
                .map_err(|e| format!("Failed to create file: {}", e))?;
            std::io::copy(&mut file, &mut outfile)
                .map_err(|e| format!("Failed to write file: {}", e))?;
        }

        let percent = ((i as u64 + 1) * 100) / total_files as u64;
        let _ = app.emit("bepinex-download-progress", serde_json::json!({
            "stage": "extracting",
            "percent": percent
        }));
    }

    let _ = app.emit("bepinex-download-progress", serde_json::json!({
        "stage": "done",
        "percent": 100
    }));

    Ok(())
}

/// Cancel an in-progress BepInEx download.
#[tauri::command]
pub fn cancel_bepinex_download(state: tauri::State<'_, Mutex<AppState>>) -> Result<(), String> {
    let app_state = state.lock().map_err(|e| format!("Lock error: {}", e))?;
    app_state.be_cancel.cancel();
    Ok(())
}

/// Reset the BepInEx download cancellation token for a new download.
/// CancellationToken cannot be un-cancelled, so we replace it with a fresh one.
#[tauri::command]
pub fn reset_bepinex_cancel_token(state: tauri::State<'_, Mutex<AppState>>) -> Result<(), String> {
    let mut app_state = state.lock().map_err(|e| format!("Lock error: {}", e))?;
    app_state.be_cancel = Arc::new(tokio_util::sync::CancellationToken::new());
    Ok(())
}
