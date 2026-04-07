#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{
    AppHandle, CustomMenuItem, Manager, RunEvent, SystemTray, SystemTrayEvent, SystemTrayMenu,
};

const COMMAND_TIMEOUT: Duration = Duration::from_secs(20);

struct AppState {
    daemon: Arc<DaemonManager>,
}

struct DaemonManager {
    child: Mutex<Child>,
    writer: Mutex<ChildStdin>,
    pending: Arc<Mutex<HashMap<u64, mpsc::Sender<Result<Value, String>>>>>,
    next_id: AtomicU64,
    quitting: AtomicBool,
}

impl DaemonManager {
    fn spawn(app: &AppHandle) -> Result<Self, String> {
        let script_path = resolve_daemon_script_path(app)?;
        let cwd = resolve_project_root(&script_path).ok_or("cannot resolve project root")?;

        let node_bin = std::env::var("VC_NODE_BIN").unwrap_or_else(|_| {
            if cfg!(target_os = "windows") {
                "node.exe".to_string()
            } else {
                "node".to_string()
            }
        });

        let app_data_dir = app
            .path_resolver()
            .app_data_dir()
            .ok_or("failed to resolve app_data_dir")?;
        std::fs::create_dir_all(&app_data_dir)
            .map_err(|err| format!("create app_data_dir failed: {err}"))?;

        let mut child = Command::new(node_bin)
            .arg(script_path.as_os_str())
            .current_dir(cwd)
            .env("VC_USER_DATA_DIR", app_data_dir.as_os_str())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|err| {
                format!(
                    "failed to spawn node daemon: {err}. ensure Node.js 18.x is installed and on PATH"
                )
            })?;

        let stdin = child.stdin.take().ok_or("failed to capture daemon stdin")?;
        let stdout = child
            .stdout
            .take()
            .ok_or("failed to capture daemon stdout")?;
        let stderr = child
            .stderr
            .take()
            .ok_or("failed to capture daemon stderr")?;

        let pending: Arc<Mutex<HashMap<u64, mpsc::Sender<Result<Value, String>>>>> =
            Arc::new(Mutex::new(HashMap::new()));

        spawn_stdout_reader(app.clone(), Arc::clone(&pending), stdout);
        spawn_stderr_reader(app.clone(), stderr);

        Ok(Self {
            child: Mutex::new(child),
            writer: Mutex::new(stdin),
            pending,
            next_id: AtomicU64::new(1),
            quitting: AtomicBool::new(false),
        })
    }

    fn request(&self, cmd: &str, payload: Value) -> Result<Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let (tx, rx) = mpsc::channel::<Result<Value, String>>();

        {
            let mut pending = self
                .pending
                .lock()
                .map_err(|_| "pending lock poisoned".to_string())?;
            pending.insert(id, tx);
        }

        let message = json!({
          "id": id,
          "cmd": cmd,
          "payload": payload,
        });

        let write_result = self.write_message(&message);

        if let Err(err) = write_result {
            if let Ok(mut pending) = self.pending.lock() {
                pending.remove(&id);
            }
            return Err(err);
        }

        match rx.recv_timeout(COMMAND_TIMEOUT) {
            Ok(result) => result,
            Err(mpsc::RecvTimeoutError::Timeout) => {
                if let Ok(mut pending) = self.pending.lock() {
                    pending.remove(&id);
                }
                Err(format!("daemon request timeout: {cmd}"))
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => Err("daemon disconnected".to_string()),
        }
    }

    fn write_message(&self, message: &Value) -> Result<(), String> {
        let mut writer = self
            .writer
            .lock()
            .map_err(|_| "writer lock poisoned".to_string())?;
        writer
            .write_all(message.to_string().as_bytes())
            .map_err(|err| format!("write daemon stdin failed: {err}"))?;
        writer
            .write_all(b"\n")
            .map_err(|err| format!("write daemon newline failed: {err}"))?;
        writer
            .flush()
            .map_err(|err| format!("flush daemon stdin failed: {err}"))?;
        Ok(())
    }

    fn mark_quitting(&self) {
        self.quitting.store(true, Ordering::SeqCst);
    }

    fn is_quitting(&self) -> bool {
        self.quitting.load(Ordering::SeqCst)
    }

    fn shutdown(&self) {
        self.mark_quitting();
        let _ = self.write_message(&json!({
          "id": 0,
          "cmd": "shutdown",
          "payload": Value::Null,
        }));

        if let Ok(mut child) = self.child.lock() {
            let _ = child.kill();
            let _ = child.wait();
        }

        fail_all_pending(&self.pending, "daemon shutdown");
    }
}

fn spawn_stdout_reader(
    app: AppHandle,
    pending: Arc<Mutex<HashMap<u64, mpsc::Sender<Result<Value, String>>>>>,
    stdout: std::process::ChildStdout,
) {
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line_result in reader.lines() {
            let line = match line_result {
                Ok(line) => line,
                Err(err) => {
                    emit_log(&app, "error", format!("daemon stdout read error: {err}"));
                    break;
                }
            };

            if line.trim().is_empty() {
                continue;
            }

            let parsed: Value = match serde_json::from_str(&line) {
                Ok(value) => value,
                Err(err) => {
                    emit_log(&app, "warn", format!("daemon output parse failed: {err}"));
                    continue;
                }
            };

            handle_daemon_message(&app, &pending, parsed);
        }

        fail_all_pending(&pending, "daemon stdout closed");
        emit_log(&app, "error", "daemon disconnected");
        update_tray_running(&app, false);
    });
}

fn spawn_stderr_reader(app: AppHandle, stderr: std::process::ChildStderr) {
    thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line_result in reader.lines() {
            match line_result {
                Ok(line) if !line.trim().is_empty() => {
                    emit_log(&app, "error", format!("daemon stderr: {line}"));
                }
                Ok(_) => {}
                Err(err) => {
                    emit_log(&app, "error", format!("daemon stderr read error: {err}"));
                    break;
                }
            }
        }
    });
}

fn handle_daemon_message(
    app: &AppHandle,
    pending: &Arc<Mutex<HashMap<u64, mpsc::Sender<Result<Value, String>>>>>,
    message: Value,
) {
    let msg_type = message
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_default();

    if msg_type == "event" {
        if let Some(name) = message.get("name").and_then(Value::as_str) {
            let payload = message.get("payload").cloned().unwrap_or(Value::Null);
            let _ = app.emit_all(name, payload.clone());

            if name == "vc:state" {
                if let Some(running) = payload.get("running").and_then(Value::as_bool) {
                    update_tray_running(app, running);
                }
            }
        }
        return;
    }

    if msg_type == "response" {
        let Some(id) = message.get("id").and_then(Value::as_u64) else {
            return;
        };

        let tx = {
            let mut map = match pending.lock() {
                Ok(map) => map,
                Err(_) => return,
            };
            map.remove(&id)
        };

        if let Some(tx) = tx {
            let ok = message.get("ok").and_then(Value::as_bool).unwrap_or(false);
            if ok {
                let data = message.get("data").cloned().unwrap_or(Value::Null);
                let _ = tx.send(Ok(data));
            } else {
                let error = message
                    .get("error")
                    .and_then(Value::as_str)
                    .unwrap_or("unknown error")
                    .to_string();
                let _ = tx.send(Err(error));
            }
        }
    }
}

fn fail_all_pending(
    pending: &Arc<Mutex<HashMap<u64, mpsc::Sender<Result<Value, String>>>>>,
    reason: &str,
) {
    let senders = {
        let mut map = match pending.lock() {
            Ok(map) => map,
            Err(_) => return,
        };
        let list: Vec<mpsc::Sender<Result<Value, String>>> = map.values().cloned().collect();
        map.clear();
        list
    };

    for tx in senders {
        let _ = tx.send(Err(reason.to_string()));
    }
}

fn resolve_daemon_script_path(app: &AppHandle) -> Result<PathBuf, String> {
    let cwd =
        std::env::current_dir().map_err(|err| format!("resolve current_dir failed: {err}"))?;
    let candidates = [
        cwd.join("node-src/tauri/daemon.js"),
        cwd.join("../node-src/tauri/daemon.js"),
    ];

    for candidate in candidates {
        if candidate.exists() {
            return Ok(candidate);
        }
    }

    if let Some(resource_dir) = app.path_resolver().resource_dir() {
        let candidate = resource_dir.join("node-src/tauri/daemon.js");
        if candidate.exists() {
            return Ok(candidate);
        }
    }

    Err("cannot find node-src/tauri/daemon.js".to_string())
}

fn resolve_project_root(script_path: &PathBuf) -> Option<PathBuf> {
    script_path
        .parent()
        .and_then(|p| p.parent())
        .and_then(|p| p.parent())
        .map(|p| p.to_path_buf())
}

fn emit_log(app: &AppHandle, level: &str, message: impl Into<String>) {
    let payload = json!({
      "ts": now_unix_ms(),
      "level": level,
      "message": message.into(),
    });
    let _ = app.emit_all("vc:log", payload);
}

fn now_unix_ms() -> u128 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn update_tray_running(app: &AppHandle, running: bool) {
    let tray = app.tray_handle();
    let _ = tray.get_item("start").set_enabled(!running);
    let _ = tray.get_item("stop").set_enabled(running);
}

#[tauri::command]
fn vc_get_state(state: tauri::State<AppState>) -> Result<Value, String> {
    state.daemon.request("get_state", Value::Null)
}

#[tauri::command]
fn vc_save_config(state: tauri::State<AppState>, payload: Value) -> Result<Value, String> {
    state.daemon.request("save_config", payload)
}

#[tauri::command]
fn vc_start(app: AppHandle, state: tauri::State<AppState>) -> Result<Value, String> {
    let data = state.daemon.request("start", Value::Null)?;
    if let Some(running) = data.get("running").and_then(Value::as_bool) {
        update_tray_running(&app, running);
    }
    Ok(data)
}

#[tauri::command]
fn vc_stop(app: AppHandle, state: tauri::State<AppState>) -> Result<Value, String> {
    let data = state.daemon.request("stop", Value::Null)?;
    if let Some(running) = data.get("running").and_then(Value::as_bool) {
        update_tray_running(&app, running);
    }
    Ok(data)
}

fn main() {
    let tray_menu = SystemTrayMenu::new()
        .add_item(CustomMenuItem::new("open", "打开面板"))
        .add_native_item(tauri::SystemTrayMenuItem::Separator)
        .add_item(CustomMenuItem::new("start", "启动监听"))
        .add_item(CustomMenuItem::new("stop", "停止监听").disabled())
        .add_native_item(tauri::SystemTrayMenuItem::Separator)
        .add_item(CustomMenuItem::new("quit", "退出"));

    tauri::Builder::default()
        .system_tray(SystemTray::new().with_menu(tray_menu))
        .setup(|app| {
            let app_handle = app.handle();
            let daemon = DaemonManager::spawn(&app_handle)
                .map_err(|err| -> Box<dyn std::error::Error> { err.into() })?;
            let daemon = Arc::new(daemon);

            if let Ok(data) = daemon.request("get_state", Value::Null) {
                if let Some(running) = data.get("running").and_then(Value::as_bool) {
                    update_tray_running(&app_handle, running);
                }
            }

            app.manage(AppState { daemon });
            Ok(())
        })
        .on_system_tray_event(|app, event| {
            if let SystemTrayEvent::MenuItemClick { id, .. } = event {
                match id.as_str() {
                    "open" => {
                        if let Some(window) = app.get_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "start" => {
                        if let Some(state) = app.try_state::<AppState>() {
                            match state.daemon.request("start", Value::Null) {
                                Ok(data) => {
                                    if let Some(running) =
                                        data.get("running").and_then(Value::as_bool)
                                    {
                                        update_tray_running(app, running);
                                    }
                                }
                                Err(err) => emit_log(app, "error", format!("start failed: {err}")),
                            }
                        }
                    }
                    "stop" => {
                        if let Some(state) = app.try_state::<AppState>() {
                            match state.daemon.request("stop", Value::Null) {
                                Ok(data) => {
                                    if let Some(running) =
                                        data.get("running").and_then(Value::as_bool)
                                    {
                                        update_tray_running(app, running);
                                    }
                                }
                                Err(err) => emit_log(app, "error", format!("stop failed: {err}")),
                            }
                        }
                    }
                    "quit" => {
                        if let Some(state) = app.try_state::<AppState>() {
                            state.daemon.shutdown();
                        }
                        app.exit(0);
                    }
                    _ => {}
                }
            }
        })
        .on_window_event(|event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event.event() {
                if let Some(state) = event.window().app_handle().try_state::<AppState>() {
                    if !state.daemon.is_quitting() {
                        api.prevent_close();
                        let _ = event.window().hide();
                    }
                }
            }
        })
        .on_run_event(|app, event| {
            if matches!(event, RunEvent::Exit | RunEvent::ExitRequested { .. }) {
                if let Some(state) = app.try_state::<AppState>() {
                    if !state.daemon.is_quitting() {
                        state.daemon.shutdown();
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            vc_get_state,
            vc_save_config,
            vc_start,
            vc_stop
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
