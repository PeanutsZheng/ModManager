use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};

use crate::AppState;

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

/// Launch the game executable. Captures stdout/stderr into a log buffer
/// for later inspection and export. Returns an error if the game is already running.
#[tauri::command]
pub fn launch_game(exe_name: &str, state: tauri::State<'_, Mutex<AppState>>) -> Result<(), String> {
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
#[tauri::command]
pub fn is_game_running(state: tauri::State<'_, Mutex<AppState>>) -> Result<bool, String> {
    let mut app = state.lock().map_err(|e| format!("Lock error: {}", e))?;
    match app.child {
        Some(ref mut child) => match child.try_wait() {
            Ok(Some(_)) => {
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
pub fn get_game_log(state: tauri::State<'_, Mutex<AppState>>) -> Result<Vec<String>, String> {
    let app = state.lock().map_err(|e| format!("Lock error: {}", e))?;
    let buf = app
        .log_buffer
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    Ok(buf.clone())
}
