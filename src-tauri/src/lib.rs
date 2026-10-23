use std::collections::BTreeMap;
use tauri::{
    image::Image,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, Position, Size,
};

const SECRET_SERVICE: &str = "Chat Yes";

fn secret_entry(agent_id: &str) -> Result<keyring::Entry, String> {
    if agent_id.trim().is_empty() {
        return Err("Agent id is required".to_string());
    }

    keyring::Entry::new(SECRET_SERVICE, agent_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn agent_secret_get(agent_id: String) -> Result<Option<String>, String> {
    let entry = secret_entry(&agent_id)?;
    match entry.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn agent_secret_set(agent_id: String, secret: String) -> Result<(), String> {
    if secret.trim().is_empty() {
        return Err("Secret is required".to_string());
    }

    secret_entry(&agent_id)?
        .set_password(secret.trim())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn agent_secret_remove(agent_id: String) -> Result<(), String> {
    let entry = secret_entry(&agent_id)?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

fn normalize_font_family_names(names: impl IntoIterator<Item = String>) -> Vec<String> {
    let mut unique = BTreeMap::<String, String>::new();

    for raw_name in names {
        let name = raw_name
            .trim()
            .trim_start_matches('\u{feff}')
            .trim()
            .to_string();
        if name.is_empty() {
            continue;
        }
        unique.entry(name.to_lowercase()).or_insert_with(|| name);
    }

    let mut names = unique.into_values().collect::<Vec<_>>();
    names.sort_by_key(|name| name.to_lowercase());
    names
}

#[cfg(target_os = "windows")]
fn installed_font_families() -> Result<Vec<String>, String> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    const CREATE_NO_WINDOW: u32 = 0x08000000;
    const SCRIPT: &str = r#"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Drawing
$collection = [System.Drawing.Text.InstalledFontCollection]::new()
$collection.Families | ForEach-Object { $_.Name }
"#;

    let output = Command::new("powershell.exe")
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            SCRIPT,
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|error| format!("Failed to start the Windows font reader: {error}"))?;

    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if detail.is_empty() {
            "The Windows font reader exited unexpectedly".to_string()
        } else {
            detail
        });
    }

    let stdout = String::from_utf8(output.stdout)
        .map_err(|error| format!("The Windows font reader returned invalid UTF-8: {error}"))?;
    Ok(normalize_font_family_names(
        stdout.lines().map(ToString::to_string),
    ))
}

#[cfg(target_os = "macos")]
fn installed_font_families() -> Result<Vec<String>, String> {
    use serde_json::Value;
    use std::process::Command;

    fn collect_families(value: &Value, families: &mut Vec<String>) {
        match value {
            Value::Object(entries) => {
                if let Some(Value::String(family)) = entries.get("family") {
                    families.push(family.clone());
                }
                for (key, child) in entries {
                    if key != "family" {
                        collect_families(child, families);
                    }
                }
            }
            Value::Array(items) => {
                for item in items {
                    collect_families(item, families);
                }
            }
            _ => {}
        }
    }

    let output = Command::new("system_profiler")
        .args(["SPFontsDataType", "-json"])
        .output()
        .map_err(|error| format!("Failed to start the macOS font reader: {error}"))?;

    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if detail.is_empty() {
            "The macOS font reader exited unexpectedly".to_string()
        } else {
            detail
        });
    }

    let report: Value = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("Failed to parse the macOS font report: {error}"))?;
    let mut families = Vec::new();
    collect_families(&report, &mut families);
    Ok(normalize_font_family_names(families))
}

#[cfg(all(unix, not(target_os = "macos")))]
fn installed_font_families() -> Result<Vec<String>, String> {
    use std::process::Command;

    let output = Command::new("fc-list")
        .args(["--format=%{family}\\n"])
        .output()
        .map_err(|error| format!("Failed to start fontconfig: {error}"))?;

    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if detail.is_empty() {
            "fontconfig exited unexpectedly".to_string()
        } else {
            detail
        });
    }

    let stdout = String::from_utf8(output.stdout)
        .map_err(|error| format!("fontconfig returned invalid UTF-8: {error}"))?;
    Ok(normalize_font_family_names(
        stdout
            .lines()
            .flat_map(|line| line.split(','))
            .map(ToString::to_string),
    ))
}

#[cfg(not(any(target_os = "windows", target_os = "macos", unix)))]
fn installed_font_families() -> Result<Vec<String>, String> {
    Err("Reading installed fonts is not supported on this platform".to_string())
}

#[tauri::command]
fn list_local_fonts() -> Result<Vec<String>, String> {
    let fonts = installed_font_families()?;
    if fonts.is_empty() {
        return Err("No installed font families were found".to_string());
    }
    Ok(fonts)
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn open_devtools(app: tauri::AppHandle) -> Result<(), String> {
    app.get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?
        .open_devtools();
    Ok(())
}

/// 左键点击托盘图标：显隐主窗口。
///
/// 注意：最小化的窗口 `is_visible()` 仍返回 true，只看可见性会导致
/// 「最小化 → 点托盘 → 仍然最小化」的死循环。必须同时判断最小化状态：
/// - 可见且未最小化 → 隐藏（相当于收起到托盘）
/// - 不可见 或 已最小化 → 取消最小化 + 显示 + 聚焦
fn toggle_main_window(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    let is_visible = window.is_visible().unwrap_or(false);
    let is_minimized = window.is_minimized().unwrap_or(false);

    if is_visible && !is_minimized {
        let _ = window.hide();
    } else {
        // 先恢复再显示，否则窗口会停留在任务栏最小化态
        if is_minimized {
            let _ = window.unminimize();
        }
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let icon = Image::from_bytes(include_bytes!("../icons/32x32.png"))
                .expect("Failed to load tray icon");

            TrayIconBuilder::new()
                .icon(icon)
                .tooltip("Chat Yes")
                .on_tray_icon_event(|tray, event| {
                    let (rx, ry, rw, is_right) = match event {
                        TrayIconEvent::Click {
                            button,
                            button_state: MouseButtonState::Up,
                            rect,
                            ..
                        } => {
                            let (rx, ry) = match &rect.position {
                                Position::Physical(p) => (p.x as f64, p.y as f64),
                                Position::Logical(p) => (p.x, p.y),
                            };
                            let rw = match &rect.size {
                                Size::Physical(s) => s.width as f64,
                                Size::Logical(s) => s.width,
                            };
                            (rx, ry, rw, matches!(button, MouseButton::Right))
                        }
                        _ => return,
                    };

                    if is_right {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.emit(
                                "tray-popup",
                                serde_json::json!({
                                    "x": (rx + rw / 2.0) as i32,
                                    "y": ry as i32,
                                }),
                            );
                        }
                    } else {
                        toggle_main_window(tray.app_handle());
                    }
                })
                .build(app)?;
            Ok(())
        })
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            open_devtools,
            agent_secret_get,
            agent_secret_set,
            agent_secret_remove,
            list_local_fonts
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::normalize_font_family_names;

    #[test]
    fn normalizes_and_sorts_installed_font_families() {
        assert_eq!(
            normalize_font_family_names(vec![
                " Segoe UI ".to_string(),
                "\u{feff}微软雅黑".to_string(),
                "segoe ui".to_string(),
                String::new(),
                "Aptos".to_string(),
            ]),
            vec![
                "Aptos".to_string(),
                "Segoe UI".to_string(),
                "微软雅黑".to_string(),
            ]
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn reads_installed_windows_font_families() {
        let fonts = super::installed_font_families()
            .expect("the Windows font reader should return installed families");
        assert!(!fonts.is_empty());
    }
}
