use std::path::{Path, PathBuf};

/// A single file entry from the remote manifest.
#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct ManifestFile {
    pub name: String,
    pub path: String,
    #[serde(rename = "type")]
    pub r#type: String,
    pub ext: String,
    pub size: u64,
    #[serde(rename = "lastModified")]
    pub last_modified: String,
    #[serde(rename = "sizeFormatted")]
    pub size_formatted: String,
}

/// A category from the remote manifest.
#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct ManifestCategory {
    pub name: String,
    pub count: u64,
    pub files: Vec<ManifestFile>,
}

/// The full manifest structure.
#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct Manifest {
    #[serde(rename = "generatedAt")]
    pub generated_at: String,
    pub categories: std::collections::HashMap<String, ManifestCategory>,
    #[serde(rename = "totalCount")]
    pub total_count: u64,
}

/// Fetch the remote manifest.json from the static resource site.
#[tauri::command]
pub async fn fetch_manifest() -> Result<Manifest, String> {
    let url = "https://softsuccubus.github.io/ManakaStaticWeb/manifest.json";
    let body = reqwest::Client::new()
        .get(url)
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch manifest: {}", e))?
        .text()
        .await
        .map_err(|e| format!("Failed to read manifest: {}", e))?;

    let manifest: Manifest =
        serde_json::from_str(&body).map_err(|e| format!("Failed to parse manifest: {}", e))?;

    Ok(manifest)
}

/// Download a resource file from the remote static site and install it.
#[tauri::command]
pub async fn download_resource(
    app: tauri::AppHandle,
    category: String,
    file_name: String,
    target_path: String,
) -> Result<(), String> {
    use tauri::Emitter;

    let url = format!(
        "https://softsuccubus.github.io/ManakaStaticWeb/uploads/{}/{}",
        category, file_name
    );

    let exe_dir = std::env::current_exe()
        .map_err(|e| format!("Failed to get exe path: {}", e))?
        .parent()
        .ok_or("Cannot determine exe directory")?
        .to_path_buf();

    let target_dir = if Path::new(&target_path).is_absolute() {
        PathBuf::from(&target_path)
    } else {
        exe_dir.join(&target_path)
    };

    // Ensure target directory exists
    std::fs::create_dir_all(&target_dir)
        .map_err(|e| format!("Failed to create target dir: {}", e))?;

    // Emit progress: downloading
    let _ = app.emit("resource-download-progress", serde_json::json!({
        "stage": "downloading",
        "percent": 0,
        "file": file_name
    }));

    // Download the file
    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Failed to download {}: {}", file_name, e))?;

    let total_size = response.content_length().unwrap_or(0);
    let mut stream = response.bytes_stream();
    use futures_util::StreamExt;

    let mut downloaded: u64 = 0;
    let mut chunks: Vec<u8> = Vec::new();
    let mut last_emitted_percent: u64 = 0;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download error: {}", e))?;
        chunks.extend_from_slice(&chunk);
        downloaded += chunk.len() as u64;

        if total_size > 0 {
            let percent = (downloaded * 100) / total_size;
            if percent >= last_emitted_percent + 5 || percent == 100 {
                last_emitted_percent = percent;
                let _ = app.emit("resource-download-progress", serde_json::json!({
                    "stage": "downloading",
                    "percent": percent,
                    "file": file_name
                }));
            }
        }
    }

    let _ = app.emit("resource-download-progress", serde_json::json!({
        "stage": "downloading",
        "percent": 100,
        "file": file_name
    }));

    // Save the downloaded file as-is to target_path (no extraction)
    let outpath = target_dir.join(&file_name);
    std::fs::write(&outpath, &chunks)
        .map_err(|e| format!("Failed to save file {}: {}", file_name, e))?;

    // If it's a zip, extract based on category rules
    if file_name.to_lowercase().ends_with(".zip") {
        let _ = app.emit("resource-download-progress", serde_json::json!({
            "stage": "extracting",
            "percent": 0,
            "file": file_name
        }));

        let is_plugins = category == "plugins";

        // For plugins: extract directly into target_dir (BepInEx/plugins/), no subfolder
        // For others: extract into a subfolder named after the zip stem
        let extract_dir = if is_plugins {
            target_dir.clone()
        } else {
            let zip_stem = file_name
                .strip_suffix(".zip")
                .or_else(|| file_name.strip_suffix(".ZIP"))
                .unwrap_or(&file_name)
                .to_string();
            target_dir.join(&zip_stem)
        };
        std::fs::create_dir_all(&extract_dir)
            .map_err(|e| format!("Failed to create dir: {}", e))?;

        // Config dir for plugins (redirect .cfg files)
        let config_dir = if is_plugins {
            exe_dir.join("BepInEx").join("config")
        } else {
            PathBuf::new()
        };

        // First pass: detect if zip has a single root directory (only for non-plugins)
        let strip_prefix = if !is_plugins {
            let reader = std::io::Cursor::new(&chunks);
            let mut archive = zip::ZipArchive::new(reader)
                .map_err(|e| format!("Failed to open zip {}: {}", file_name, e))?;

            let mut root_dirs = std::collections::HashSet::new();
            for i in 0..archive.len() {
                let file = archive.by_index(i).map_err(|e| format!("Zip read error: {}", e))?;
                if let Some(path) = file.enclosed_name() {
                    if let Some(first) = path.components().next() {
                        root_dirs.insert(first.as_os_str().to_string_lossy().to_string());
                    }
                }
            }

            if root_dirs.len() == 1 {
                Some(PathBuf::from(root_dirs.into_iter().next().unwrap()))
            } else {
                None
            }
        } else {
            None
        };

        // Second pass: extract
        let reader = std::io::Cursor::new(&chunks);
        let mut archive = zip::ZipArchive::new(reader)
            .map_err(|e| format!("Failed to open zip {}: {}", file_name, e))?;

        let total_files = archive.len();

        for i in 0..total_files {
            let mut file = archive.by_index(i).map_err(|e| format!("Zip read error: {}", e))?;
            let outpath = match file.enclosed_name() {
                Some(path) => {
                    let relative = match &strip_prefix {
                        Some(prefix) => path.strip_prefix(prefix).unwrap_or(path.as_path()),
                        None => path.as_path(),
                    };
                    if relative.as_os_str().is_empty() {
                        continue;
                    }

                    // For plugins: redirect .cfg files to BepInEx/config/
                    if is_plugins {
                        let ext = relative
                            .extension()
                            .map(|e| e.to_string_lossy().to_lowercase())
                            .unwrap_or_default();
                        if ext == "cfg" {
                            let cfg_name = relative.file_name().unwrap_or(relative.as_os_str());
                            std::fs::create_dir_all(&config_dir)
                                .map_err(|e| format!("Failed to create config dir: {}", e))?;
                            config_dir.join(cfg_name)
                        } else {
                            extract_dir.join(relative)
                        }
                    } else {
                        extract_dir.join(relative)
                    }
                }
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
            let _ = app.emit("resource-download-progress", serde_json::json!({
                "stage": "extracting",
                "percent": percent,
                "file": file_name
            }));
        }

        // Delete the zip file after extraction
        std::fs::remove_file(&target_dir.join(&file_name))
            .map_err(|e| format!("Failed to delete zip {}: {}", file_name, e))?;
    }

    let _ = app.emit("resource-download-progress", serde_json::json!({
        "stage": "done",
        "percent": 100,
        "file": file_name
    }));

    Ok(())
}
