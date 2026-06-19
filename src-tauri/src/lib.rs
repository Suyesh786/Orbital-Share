// AirSpace — Tauri v2 Rust Backend
// Ports: Electron main.cjs + server/*.js → pure async Rust
// Preserves 100% identical IPC surface expected by src/lib/electron.ts

#![allow(clippy::too_many_arguments)]

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use futures_util::{SinkExt, StreamExt};
use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use serde::{Deserialize, Serialize};
use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
#[cfg(target_os = "macos")]
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
use tokio::net::TcpListener;
use tokio::sync::mpsc;
use tokio_tungstenite::{
    accept_hdr_async,
    tungstenite::{handshake::server::{Request, Response}, Message},
};
use uuid::Uuid;

// ─── Constants ───────────────────────────────────────────────────────────────

const LOCAL_WS_PORT: u16 = 8080;
const BONJOUR_SERVICE_TYPE: &str = "_airspace._tcp.local.";
const APP_NAME: &str = "AirSpace";
const LAN_RECEIVER_STALE_MS: u64 = 45_000;
const LAN_RECEIVER_SWEEP_MS: u64 = 10_000;
const WS_HEARTBEAT_MS: u64 = 30_000;
const PENDING_REQUEST_TIMEOUT_MS: u64 = 45_000;

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

// ─── IPC Payload Types ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanReceiverService {
    pub device_id: String,
    pub username: String,
    pub host: String,
    pub port: u16,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub device_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub platform: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanDiscoveryErrorPayload {
    pub scope: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceiverPresencePayload {
    pub available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub device_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub device_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub platform: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IncomingTransferRequest {
    pub sender_username: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requester_socket_id: Option<String>,
    pub file_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferProgressPayload {
    pub transfer_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub peer_username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_name: Option<String>,
    pub progress: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferCompletedPayload {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transfer_id: Option<String>,
    pub file_count: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub directory: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileSavePayload {
    pub name: String,
    #[serde(rename = "type")]
    pub mime_type: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileSaveResult {
    pub saved_count: usize,
    pub directory: Option<String>,
}

// ─── LAN Receiver Entry (internal) ───────────────────────────────────────────

#[derive(Debug, Clone)]
struct LanReceiverEntry {
    service: LanReceiverService,
    last_seen: u64,
}

// ─── WebSocket Session State ──────────────────────────────────────────────────

type WsSender = tokio::sync::mpsc::UnboundedSender<Message>;

#[derive(Debug, Clone)]
struct WsClient {
    socket_id: String,
    sender: WsSender,
    username: Option<String>,
    device_id: Option<String>,
    mode: Option<String>, // "sender" | "receiver"
    device_type: Option<String>,
    platform: Option<String>,
    connected_at: u64,
    last_seen: u64,
}

#[derive(Debug, Clone)]
struct TransferSession {
    transfer_id: String,
    session_token: String,
    sender_socket_id: String,
    receiver_socket_id: String,
    sender_username: String,
    receiver_username: String,
    status: String, // "connecting" | "transferring" | "completed" | "cancelled"
    lifecycle_completed: bool,
    metadata_delivered: bool,
}

#[derive(Debug, Clone)]
struct PendingRequest {
    request_id: String,
    requester_socket_id: String,
    sender_username: String,
    sender_device_id: String,
    files: Vec<serde_json::Value>,
    created_at: u64,
    accepting: bool,
}

// ─── Global App State ─────────────────────────────────────────────────────────

#[derive(Default)]
struct AppState {
    receiver_enabled: bool,
    lan_discovery_active: bool,
    last_receiver_presence: Option<ReceiverPresencePayload>,
    last_lan_discovery_error: Option<LanDiscoveryErrorPayload>,
    lan_receivers: HashMap<String, LanReceiverEntry>, // fqdn → entry

    // mDNS control
    mdns_daemon: Option<ServiceDaemon>,
    registered_service_fqdn: Option<String>,

    // WebSocket clients & sessions
    ws_clients: HashMap<String, WsClient>,
    transfer_sessions: HashMap<String, TransferSession>, // transferId → session
    sessions_by_socket: HashMap<String, String>,         // socketId → transferId
    pending_by_receiver: HashMap<String, PendingRequest>, // receiverSocketId → pending
    pending_by_requester: HashMap<String, String>,         // requesterSocketId → receiverSocketId

    // Direct-to-disk streaming
    active_downloads: HashMap<String, std::path::PathBuf>,
}

type SharedState = Arc<Mutex<AppState>>;

// ─── Persistence ─────────────────────────────────────────────────────────────

fn get_state_path(app: &AppHandle) -> std::path::PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| dirs::data_dir().unwrap_or_default().join("AirSpace"))
        .join("runtime-state.json")
}

fn load_receiver_enabled(app: &AppHandle) -> bool {
    let path = get_state_path(app);
    let Ok(raw) = std::fs::read_to_string(&path) else {
        return false;
    };
    let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return false;
    };
    parsed.get("receiverEnabled").and_then(|v| v.as_bool()).unwrap_or(false)
}

fn persist_receiver_enabled(app: &AppHandle, enabled: bool) {
    let path = get_state_path(app);
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(&path, serde_json::json!({ "receiverEnabled": enabled }).to_string());
}

// ─── mDNS Publisher ──────────────────────────────────────────────────────────

fn start_mdns_publisher(state: &mut AppState, presence: &ReceiverPresencePayload) -> bool {
    let device_id = match &presence.device_id {
        Some(id) if !id.trim().is_empty() => id.trim().to_string(),
        _ => return false,
    };
    let username = match &presence.username {
        Some(u) if !u.trim().is_empty() => u.trim().to_string(),
        _ => return false,
    };
    let device_type = presence
        .device_type
        .as_deref()
        .filter(|t| matches!(*t, "desktop" | "mobile" | "unknown"))
        .unwrap_or("unknown")
        .to_string();
    let platform = presence
        .platform
        .as_deref()
        .filter(|p| matches!(*p, "macos" | "windows" | "linux" | "android" | "ios" | "unknown"))
        .unwrap_or("unknown")
        .to_string();

    // Stop any existing publisher
    stop_mdns_publisher(state);

    // Retry daemon creation — macOS briefly locks the mDNS socket after shutdown
    let daemon = {
        let mut result = None;
        for attempt in 1..=3 {
            match ServiceDaemon::new() {
                Ok(d) => { result = Some(d); break; }
                Err(e) => {
                    eprintln!("[mDNS] Daemon init attempt {attempt}/3 failed: {e}");
                    if attempt < 3 {
                        std::thread::sleep(Duration::from_millis(200));
                    }
                }
            }
        }
        match result {
            Some(d) => d,
            None => {
                eprintln!("[mDNS] All 3 daemon creation attempts failed — aborting publisher start");
                return false;
            }
        }
    };

    // TXT keys ≤ 9 chars (Apple mDNSResponder limit)
    let mut properties: HashMap<String, String> = HashMap::new();
    properties.insert("avail".to_string(), "1".to_string());
    // Use short strings for TXT values too
    let id_val = device_id.clone();
    let user_val = username.clone();
    let type_val = device_type.clone();
    let os_val = platform.clone();

    let service_name = format!("{} {}", APP_NAME, &device_id[..device_id.len().min(8)]);

    let host = local_ip_address().unwrap_or_else(|| "127.0.0.1".to_string());

    let service_info = ServiceInfo::new(
        "_airspace._tcp.local.",
        &service_name,
        &format!("{}.local.", gethostname()),
        &*host,
        LOCAL_WS_PORT,
        Some(HashMap::from([
            ("avail".to_string(), "1".to_string()),
            ("id".to_string(), id_val),
            ("user".to_string(), user_val),
            ("type".to_string(), type_val),
            ("os".to_string(), os_val),
        ])),
    );

    match service_info {
        Ok(info) => {
            if let Err(e) = daemon.register(info) {
                eprintln!("[mDNS] Register error: {e}");
                return false;
            }
            let fqdn = format!("{}._airspace._tcp.local.", service_name);
            state.mdns_daemon = Some(daemon);
            state.registered_service_fqdn = Some(fqdn);
            true
        }
        Err(e) => {
            eprintln!("[mDNS] ServiceInfo error: {e}");
            false
        }
    }
}

fn stop_mdns_publisher(state: &mut AppState) {
    if let (Some(daemon), Some(fqdn)) = (
        state.mdns_daemon.take(),
        state.registered_service_fqdn.take(),
    ) {
        let _ = daemon.unregister(&fqdn);
        let _ = daemon.shutdown();
        // Give the OS a moment to release the mDNS socket before any re-registration.
        // Without this, the next ServiceDaemon::new() call on macOS can fail immediately.
        std::thread::sleep(Duration::from_millis(200));
    }
}

fn local_ip_address() -> Option<String> {
    use std::net::UdpSocket;
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    let addr = socket.local_addr().ok()?;
    let ip = addr.ip().to_string();

    // Filter out known virtual bridge / VPN subnets that are not routable on the
    // physical LAN.  If the OS routes us through one of these, fall back to None
    // so the mDNS publisher skips advertisement rather than advertising a dead IP.
    let virtual_prefixes = [
        "172.17.",  // Docker default bridge
        "172.18.",  // Docker user networks
        "172.19.",
        "172.20.",
        "10.211.", // Parallels
        "10.37.",  // Parallels NAT
        "10.212.",
        "192.168.56.",  // VirtualBox host-only
        "192.168.59.",  // Docker Machine
        "100.64.",      // CGNAT / Tailscale
    ];

    for prefix in &virtual_prefixes {
        if ip.starts_with(prefix) {
            eprintln!("[NET] ⚠️  local_ip_address resolved to virtual subnet {ip} — filtering out");
            return None;
        }
    }

    println!("[NET] ✅ local_ip_address resolved to: {ip}");
    Some(ip)
}

fn gethostname() -> String {
    std::process::Command::new("hostname")
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "airspace-host".to_string())
}

// ─── mDNS Browser (background task) ──────────────────────────────────────────

fn spawn_mdns_browser(app_handle: AppHandle, shared_state: SharedState) {
    tauri::async_runtime::spawn(async move {
        // ── Late-joiner fix: retry the browse at 1 s and 4 s so that services
        //    which were already advertising when we started get picked up.
        //    mdns_sd sends a PTR query on browse(), but if the LAN is busy or
        //    the response arrives before our event loop is running we miss it.
        //    Restarting browse forces a fresh query burst.
        let start_browse = |daemon: &ServiceDaemon| -> Option<mdns_sd::Receiver<ServiceEvent>> {
            match daemon.browse(BONJOUR_SERVICE_TYPE) {
                Ok(r) => Some(r),
                Err(e) => {
                    eprintln!("[mDNS] Browse error: {e}");
                    None
                }
            }
        };

        let daemon = match ServiceDaemon::new() {
            Ok(d) => d,
            Err(e) => {
                eprintln!("[mDNS] Browser daemon error: {e}");
                return;
            }
        };

        let receiver = match start_browse(&daemon) {
            Some(r) => r,
            None => return,
        };

        // Stale sweep task
        let sweep_state = shared_state.clone();
        let sweep_app = app_handle.clone();
        tauri::async_runtime::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_millis(LAN_RECEIVER_SWEEP_MS)).await;
                let now = now_ms();
                let changed = {
                    let mut state = sweep_state.lock().unwrap();
                    let before = state.lan_receivers.len();
                    state.lan_receivers.retain(|_, e| now - e.last_seen <= LAN_RECEIVER_STALE_MS);
                    state.lan_receivers.len() != before
                };
                if changed {
                    emit_lan_receivers(&sweep_app, &sweep_state);
                }
            }
        });

        // Main event loop
        loop {
            match receiver.recv_async().await {
                Ok(ServiceEvent::ServiceResolved(info)) => {
                    process_resolved_service(&info, &shared_state, &app_handle);
                }

                Ok(ServiceEvent::ServiceRemoved(_, fullname)) => {
                    // Actively remove the departed device — do NOT rely on the 45s stale sweep.
                    // This ensures the Sender UI clears the receiver within seconds of them turning off.
                    let changed = {
                        let mut state = shared_state.lock().unwrap();
                        state.lan_receivers.remove(&fullname).is_some()
                    };
                    if changed {
                        println!("[mDNS] 🔴 Device departed: {}", &fullname);
                        emit_lan_receivers(&app_handle, &shared_state);
                    }
                }

                Ok(_) => {}

                Err(e) => {
                    eprintln!("[mDNS] Browse recv error: {e}");
                    tokio::time::sleep(Duration::from_secs(5)).await;
                }
            }
        }
    });
}

/// Shared logic: process a resolved mDNS service and add/update the lan_receivers map.
fn process_resolved_service(
    info: &mdns_sd::ServiceInfo,
    shared_state: &SharedState,
    app_handle: &AppHandle,
) {
    let fqdn = info.get_fullname().to_string();
    let txt = info.get_properties().clone();

    let avail = txt.get("avail").map(|p| p.val_str()).unwrap_or("0");
    if avail != "1" {
        return;
    }

    let device_id = match txt.get("id").map(|p| p.val_str().to_string()) {
        Some(id) if !id.is_empty() => id,
        _ => return,
    };
    let username = match txt.get("user").map(|p| p.val_str().to_string()) {
        Some(u) if !u.is_empty() => u,
        _ => return,
    };
    let device_type = txt
        .get("type")
        .map(|p| p.val_str().to_string())
        .filter(|t| matches!(t.as_str(), "desktop" | "mobile" | "unknown"))
        .unwrap_or_else(|| "unknown".to_string());
    let platform = txt
        .get("os")
        .map(|p| p.val_str().to_string())
        .filter(|p| {
            matches!(
                p.as_str(),
                "macos" | "windows" | "linux" | "android" | "ios" | "unknown"
            )
        })
        .unwrap_or_else(|| "unknown".to_string());

    // Strictly prefer IPv4 (contains a dot) to avoid broken connections over
    // IPv6 link-local / global addresses that browsers often refuse for WS.
    let addresses = info.get_addresses();
    let host = addresses
        .iter()
        .find(|a| {
            // Must be IPv4: contains a dot, is not loopback 127.x.x.x
            let s = a.to_string();
            s.contains('.') && !s.starts_with("127.")
        })
        .or_else(|| {
            // Fallback: any non-loopback, non-link-local address
            addresses.iter().find(|a| {
                let s = a.to_string();
                !s.starts_with("127.") && s != "::1" && !s.starts_with("fe80::")
            })
        })
        .map(|a| a.to_string());

    let Some(host) = host else {
        eprintln!("[mDNS] No usable address for {} (addresses: {:?})", fqdn, addresses);
        return;
    };
    let port = info.get_port();

    println!("[mDNS] ✅ Resolved: {} → {}:{} (user={})", fqdn, host, port, username);

    {
        let mut state = shared_state.lock().unwrap();
        state.lan_receivers.insert(
            fqdn,
            LanReceiverEntry {
                service: LanReceiverService {
                    device_id,
                    username,
                    host,
                    port,
                    device_type: Some(device_type),
                    platform: Some(platform),
                },
                last_seen: now_ms(),
            },
        );
    }
    emit_lan_receivers(app_handle, shared_state);
}

fn emit_lan_receivers(app: &AppHandle, state: &SharedState) {
    let receivers: Vec<LanReceiverService> = {
        let s = state.lock().unwrap();
        let mut list: Vec<_> = s.lan_receivers.values().map(|e| e.service.clone()).collect();
        list.sort_by(|a, b| a.username.cmp(&b.username));
        list
    };
    let _ = app.emit("lan-receivers", &receivers);
}

// ─── WebSocket Relay Server ───────────────────────────────────────────────────

fn spawn_ws_server(app_handle: AppHandle, shared_state: SharedState) {
    tauri::async_runtime::spawn(async move {
        let listener = match TcpListener::bind(format!("0.0.0.0:{}", LOCAL_WS_PORT)).await {
            Ok(l) => l,
            Err(e) => {
                eprintln!("[WS] Failed to bind port {LOCAL_WS_PORT}: {e}");
                return;
            }
        };
        println!("[WS] AirSpace relay server listening on ws://127.0.0.1:{LOCAL_WS_PORT}");

        loop {
            let (tcp_stream, addr) = match listener.accept().await {
                Ok(v) => v,
                Err(e) => {
                    eprintln!("[WS] Accept error: {e}");
                    continue;
                }
            };

            let state = shared_state.clone();
            let app = app_handle.clone();

            tauri::async_runtime::spawn(async move {
                println!("[WS] 🔗 Incoming TCP from {addr} — upgrading to WebSocket");
                let callback = |_req: &Request, response: Response| -> Result<Response, tokio_tungstenite::tungstenite::http::response::Response<Option<String>>> {
                    // Accept all origins blindly to bypass WKWebView mixed-content / custom protocol blocks
                    Ok(response)
                };
                let ws_stream = match accept_hdr_async(tcp_stream, callback).await {
                    Ok(s) => s,
                    Err(e) => {
                        eprintln!("[WS] ❌ Handshake error from {addr}: {e}");
                        return;
                    }
                };

                let (mut ws_sink, mut ws_source) = ws_stream.split();
                let socket_id = Uuid::new_v4().to_string();
                let (tx, mut rx) = mpsc::unbounded_channel::<Message>();

                // Register client
                {
                    let mut s = state.lock().unwrap();
                    s.ws_clients.insert(
                        socket_id.clone(),
                        WsClient {
                            socket_id: socket_id.clone(),
                            sender: tx.clone(),
                            username: None,
                            device_id: None,
                            mode: None,
                            device_type: None,
                            platform: None,
                            connected_at: now_ms(),
                            last_seen: now_ms(),
                        },
                    );
                }

                println!("[WS] ✅ Client connected: socket={} addr={}", &socket_id[..8], addr);

                // Send "connected" message
                let connected_msg = serde_json::json!({
                    "type": "connected",
                    "socketId": socket_id,
                    "timestamp": now_ms()
                });
                let _ = tx.send(Message::Text(connected_msg.to_string()));

                // Writer task: drain the channel into the sink
                let writer_socket_id = socket_id.clone();
                let write_task = tauri::async_runtime::spawn(async move {
                    while let Some(msg) = rx.recv().await {
                        if ws_sink.send(msg).await.is_err() {
                            break;
                        }
                    }
                    println!("[WS] Writer closed: {}", &writer_socket_id[..8]);
                });

                // Heartbeat task
                let hb_tx = tx.clone();
                let hb_socket = socket_id.clone();
                tauri::async_runtime::spawn(async move {
                    loop {
                        tokio::time::sleep(Duration::from_millis(WS_HEARTBEAT_MS)).await;
                        if hb_tx.send(Message::Ping(vec![])).is_err() {
                            break;
                        }
                        println!("[WS] Ping: {}", &hb_socket[..8]);
                    }
                });

                // Reader loop: handle messages
                while let Some(msg_result) = ws_source.next().await {
                    let msg = match msg_result {
                        Ok(m) => m,
                        Err(e) => {
                            eprintln!("[WS] ❌ Read error from {}: {:?}", &socket_id[..8], e);
                            break;
                        }
                    };

                    match msg {
                        Message::Binary(data) => {
                            // Binary chunk relay — fast path
                            if data.first() == Some(&1u8) {
                                relay_binary_chunk(&state, &socket_id, data);
                            }
                        }
                        Message::Text(text) => {
                            let parsed: serde_json::Value = match serde_json::from_str(&text) {
                                Ok(v) => v,
                                Err(e) => {
                                    eprintln!("[WS] ❌ JSON parse error from {}: {} | raw={}", &socket_id[..8], e, &text[..text.len().min(200)]);
                                    continue;
                                }
                            };
                            let msg_type = parsed["type"].as_str().unwrap_or("").to_string();
                            let payload = parsed.get("payload").cloned().unwrap_or(serde_json::Value::Null);

                            println!("[WS] 📨 msg_type='{}' socket={}", msg_type, &socket_id[..8]);

                            handle_ws_message(
                                &state,
                                &app,
                                &socket_id,
                                &tx,
                                &msg_type,
                                payload,
                            );

                            // Update last_seen
                            if let Ok(mut s) = state.lock() {
                                if let Some(client) = s.ws_clients.get_mut(&socket_id) {
                                    client.last_seen = now_ms();
                                }
                            }
                        }
                        Message::Pong(_) => {
                            if let Ok(mut s) = state.lock() {
                                if let Some(client) = s.ws_clients.get_mut(&socket_id) {
                                    client.last_seen = now_ms();
                                }
                            }
                        }
                        Message::Close(_) => break,
                        _ => {}
                    }
                }

                // Cleanup on disconnect
                handle_disconnect(&state, &app, &socket_id);
                write_task.abort();
                println!("[WS] Client disconnected: {}", &socket_id[..8]);
            });
        }
    });
}

fn relay_binary_chunk(state: &SharedState, sender_socket_id: &str, data: Vec<u8>) {
    let tx = {
        let s = state.lock().unwrap();
        let transfer_id = match s.sessions_by_socket.get(sender_socket_id) {
            Some(id) => id.clone(),
            None => return,
        };
        let session = match s.transfer_sessions.get(&transfer_id) {
            Some(sess) => sess.clone(),
            None => return,
        };
        if session.sender_socket_id != sender_socket_id {
            return;
        }
        match s.ws_clients.get(&session.receiver_socket_id) {
            Some(client) => client.sender.clone(),
            None => return,
        }
    };
    let _ = tx.send(Message::Binary(data));
}

fn ws_send(state: &SharedState, socket_id: &str, msg: serde_json::Value) {
    let tx = {
        let s = state.lock().unwrap();
        s.ws_clients.get(socket_id).map(|c| c.sender.clone())
    };
    if let Some(tx) = tx {
        let _ = tx.send(Message::Text(msg.to_string()));
    }
}

fn handle_ws_message(
    state: &SharedState,
    app: &AppHandle,
    socket_id: &str,
    _tx: &WsSender,
    msg_type: &str,
    payload: serde_json::Value,
) {
    match msg_type {
        "register" => handle_register(state, app, socket_id, payload),
        "discover_receivers" => handle_discover_receivers(state, socket_id),
        "transfer_request" => handle_transfer_request(state, app, socket_id, payload),
        "transfer_accept" => handle_transfer_accept(state, socket_id, payload),
        "transfer_reject" => handle_transfer_reject(state, socket_id, payload),
        "transfer_cancel" => handle_transfer_cancel(state, socket_id, payload),
        "transfer_abort" => handle_transfer_abort(state, socket_id, payload),
        "transfer_metadata" => handle_transfer_metadata(state, socket_id, payload),
        "transfer_complete" => handle_transfer_complete(state, socket_id, payload),
        _ => {}
    }
}

fn handle_register(state: &SharedState, app: &AppHandle, socket_id: &str, payload: serde_json::Value) {
    println!("[WS] 📝 REGISTER attempt from socket={} payload={}", &socket_id[..8], payload);
    let username = payload["username"].as_str().map(|s| s.trim().to_string());
    let device_id = payload["deviceId"].as_str().map(|s| s.trim().to_string());
    let mode = payload["mode"].as_str().map(|s| s.to_string());
    let device_type = payload["deviceType"].as_str().map(|s| s.to_string());
    let platform = payload["platform"].as_str().map(|s| s.to_string());

    let (username, device_id, mode) = match (username, device_id, mode) {
        (Some(u), Some(d), Some(m)) if !u.is_empty() && !d.is_empty() && (m == "sender" || m == "receiver") => (u, d, m),
        _ => {
            eprintln!("[WS] ❌ REGISTER rejected from socket={} — missing/invalid username/deviceId/mode. payload={}", &socket_id[..8], payload);
            return;
        }
    };

    {
        let mut s = state.lock().unwrap();
        if let Some(client) = s.ws_clients.get_mut(socket_id) {
            client.username = Some(username.clone());
            client.device_id = Some(device_id.clone());
            client.mode = Some(mode.clone());
            client.device_type = device_type.clone();
            client.platform = platform.clone();
        }
    }

    let registered_msg = serde_json::json!({
        "type": "registered",
        "payload": {
            "socketId": socket_id,
            "deviceId": device_id,
            "username": username,
            "mode": mode,
            "deviceType": device_type.as_deref().filter(|t| matches!(*t, "desktop" | "mobile" | "unknown")).unwrap_or("unknown"),
            "platform": platform.as_deref().filter(|p| matches!(*p, "macos" | "windows" | "linux" | "android" | "ios" | "unknown")).unwrap_or("unknown"),
        }
    });
    ws_send(state, socket_id, registered_msg);
    broadcast_receivers_updated(state, app);
    println!("[REGISTER] socket={}… mode={} username={}", &socket_id[..8], mode, username);
}

fn handle_discover_receivers(state: &SharedState, socket_id: &str) {
    let receivers_msg = {
        let s = state.lock().unwrap();
        let receivers: Vec<serde_json::Value> = s
            .ws_clients
            .values()
            .filter(|c| {
                c.socket_id != socket_id
                    && c.mode.as_deref() == Some("receiver")
                    && c.device_id.is_some()
                    && c.username.is_some()
            })
            .map(|c| {
                serde_json::json!({
                    "deviceId": c.device_id,
                    "username": c.username,
                    "socketId": c.socket_id,
                    "mode": "receiver",
                    "deviceType": c.device_type.as_deref().unwrap_or("unknown"),
                    "platform": c.platform.as_deref().unwrap_or("unknown"),
                })
            })
            .collect();

        serde_json::json!({
            "type": "receivers_list",
            "payload": receivers
        })
    };
    ws_send(state, socket_id, receivers_msg);
}

fn broadcast_receivers_updated(state: &SharedState, _app: &AppHandle) {
    let senders: Vec<WsSender> = {
        let s = state.lock().unwrap();
        s.ws_clients
            .values()
            .filter(|c| c.mode.as_deref() == Some("sender"))
            .map(|c| c.sender.clone())
            .collect()
    };
    let msg = Message::Text(serde_json::json!({"type": "receivers_updated"}).to_string());
    for tx in senders {
        let _ = tx.send(msg.clone());
    }
}

fn handle_transfer_request(state: &SharedState, app: &AppHandle, requester_id: &str, payload: serde_json::Value) {
    let target_socket_id = payload["targetSocketId"].as_str().unwrap_or("").to_string();
    let target_device_id = payload["targetDeviceId"].as_str().unwrap_or("").to_string();
    let sender_username = match payload["senderUsername"].as_str() {
        Some(u) if !u.trim().is_empty() => u.trim().to_string(),
        _ => { reject_requester(state, requester_id, "Invalid request"); return; }
    };
    let sender_device_id = payload["senderDeviceId"].as_str().unwrap_or("").trim().to_string();
    let files = match payload["files"].as_array() {
        Some(f) => f.clone(),
        None => { reject_requester(state, requester_id, "Invalid request"); return; }
    };

    // Check requester is registered as sender
    {
        let s = state.lock().unwrap();
        let requester = match s.ws_clients.get(requester_id) {
            Some(c) => c.clone(),
            None => { return; }
        };
        if requester.mode.as_deref() != Some("sender") {
            drop(s);
            reject_requester(state, requester_id, "Sender not registered");
            return;
        }
        // Already has pending?
        if s.pending_by_requester.contains_key(requester_id) { return; }
        if s.sessions_by_socket.contains_key(requester_id) { return; }
    }

    // Resolve target
    let receiver_socket_id = {
        let s = state.lock().unwrap();
        if !target_socket_id.is_empty() {
            if s.ws_clients.get(&target_socket_id).map(|c| c.mode.as_deref() == Some("receiver")).unwrap_or(false) {
                Some(target_socket_id.clone())
            } else { None }
        } else if !target_device_id.is_empty() {
            s.ws_clients.values()
                .find(|c| c.device_id.as_deref() == Some(&target_device_id) && c.mode.as_deref() == Some("receiver"))
                .map(|c| c.socket_id.clone())
        } else { None }
    };

    let receiver_socket_id = match receiver_socket_id {
        Some(id) => id,
        None => { reject_requester(state, requester_id, "Receiver unavailable"); return; }
    };

    // Check receiver isn't busy
    {
        let s = state.lock().unwrap();
        if s.pending_by_receiver.contains_key(&receiver_socket_id) {
            drop(s);
            reject_requester(state, requester_id, "Receiver is busy");
            return;
        }
        if s.sessions_by_socket.contains_key(&receiver_socket_id) {
            drop(s);
            reject_requester(state, requester_id, "Receiver is busy");
            return;
        }
    }

    let request_id = Uuid::new_v4().to_string();
    let file_count = files.len() as u64;
    let total_size: u64 = files.iter().filter_map(|f| f["size"].as_u64()).sum();
    let now = now_ms();

    {
        let mut s = state.lock().unwrap();
        s.pending_by_receiver.insert(
            receiver_socket_id.clone(),
            PendingRequest {
                request_id: request_id.clone(),
                requester_socket_id: requester_id.to_string(),
                sender_username: sender_username.clone(),
                sender_device_id: sender_device_id.clone(),
                files: files.clone(),
                created_at: now,
                accepting: false,
            },
        );
        s.pending_by_requester.insert(requester_id.to_string(), receiver_socket_id.clone());
    }

    // Notify receiver
    let notify_msg = serde_json::json!({
        "type": "incoming_transfer_request",
        "payload": {
            "requestId": request_id,
            "requesterSocketId": requester_id,
            "senderUsername": sender_username,
            "senderDeviceId": sender_device_id,
            "files": files,
            "fileCount": file_count,
            "totalSize": total_size,
            "timestamp": now
        }
    });
    ws_send(state, &receiver_socket_id, notify_msg);

    // Show native notification via Tauri custom window
    let app_clone = app.clone();
    let req = IncomingTransferRequest {
        sender_username: sender_username.clone(),
        requester_socket_id: Some(requester_id.to_string()),
        file_count: file_count as u32,
    };
    tauri::async_runtime::spawn(async move {
        do_show_incoming_notification(&app_clone, req);
    });

    // Timeout: expire pending after 45s
    let state_clone = state.clone();
    let receiver_clone = receiver_socket_id.clone();
    let requester_clone = requester_id.to_string();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(PENDING_REQUEST_TIMEOUT_MS)).await;
        let mut s = state_clone.lock().unwrap();
        if let Some(pending) = s.pending_by_receiver.get(&receiver_clone) {
            if pending.requester_socket_id == requester_clone {
                let req_socket = pending.requester_socket_id.clone();
                s.pending_by_receiver.remove(&receiver_clone);
                s.pending_by_requester.remove(&req_socket);
                drop(s);
                // Notify receiver
                ws_send(&state_clone, &receiver_clone, serde_json::json!({
                    "type": "transfer_request_cancelled",
                    "payload": { "requesterSocketId": requester_clone, "reason": "Request timed out" }
                }));
                reject_requester(&state_clone, &requester_clone, "Request timed out");
            }
        }
    });

    println!("[TRANSFER] Request {} from {} → receiver {}", &request_id[..8], sender_username, &receiver_socket_id[..8]);
}

fn reject_requester(state: &SharedState, requester_id: &str, reason: &str) {
    ws_send(state, requester_id, serde_json::json!({
        "type": "transfer_request_rejected",
        "payload": { "requesterSocketId": requester_id, "reason": reason }
    }));
}

fn handle_transfer_accept(state: &SharedState, receiver_id: &str, payload: serde_json::Value) {
    let requester_id = match payload["requesterSocketId"].as_str() {
        Some(id) => id.to_string(),
        None => return,
    };

    let pending = {
        let s = state.lock().unwrap();
        s.pending_by_receiver.get(receiver_id).cloned()
    };

    let pending = match pending {
        Some(p) if p.requester_socket_id == requester_id && !p.accepting => p,
        _ => return,
    };

    // Check receiver is registered
    {
        let s = state.lock().unwrap();
        if s.ws_clients.get(receiver_id).and_then(|c| c.mode.as_ref()).map(|m| m.as_str()) != Some("receiver") {
            return;
        }
    }

    let transfer_id = Uuid::new_v4().to_string();
    let session_token = Uuid::new_v4().to_string();

    let (sender_username, receiver_username, receiver_device_id) = {
        let s = state.lock().unwrap();
        let receiver_name = s.ws_clients.get(receiver_id)
            .and_then(|c| c.username.clone())
            .unwrap_or_else(|| "Receiver".to_string());
        let receiver_device_id = s.ws_clients.get(receiver_id)
            .and_then(|c| c.device_id.clone())
            .unwrap_or_default();
        (pending.sender_username.clone(), receiver_name, receiver_device_id)
    };

    {
        let mut s = state.lock().unwrap();
        // Mark as accepting
        if let Some(p) = s.pending_by_receiver.get_mut(receiver_id) {
            p.accepting = true;
        }
        // Create session
        s.transfer_sessions.insert(
            transfer_id.clone(),
            TransferSession {
                transfer_id: transfer_id.clone(),
                session_token: session_token.clone(),
                sender_socket_id: requester_id.clone(),
                receiver_socket_id: receiver_id.to_string(),
                sender_username: sender_username.clone(),
                receiver_username: receiver_username.clone(),
                status: "connecting".to_string(),
                lifecycle_completed: false,
                metadata_delivered: false,
            },
        );
        s.sessions_by_socket.insert(requester_id.clone(), transfer_id.clone());
        s.sessions_by_socket.insert(receiver_id.to_string(), transfer_id.clone());
        // Clear pending
        s.pending_by_receiver.remove(receiver_id);
        s.pending_by_requester.remove(&requester_id);
    }

    let total_bytes: u64 = pending.files.iter().filter_map(|f| f["size"].as_u64()).sum();

    let accepted_payload = serde_json::json!({
        "transferId": transfer_id,
        "sessionToken": session_token,
        "senderSocketId": requester_id,
        "receiverSocketId": receiver_id,
        "senderUsername": sender_username,
        "receiverUsername": receiver_username,
        "senderDeviceId": pending.sender_device_id,
        "receiverDeviceId": receiver_device_id,
        "files": pending.files,
        "totalBytes": total_bytes,
        "status": "connecting",
    });

    ws_send(state, &requester_id, serde_json::json!({ "type": "transfer_request_accepted", "payload": accepted_payload }));
    ws_send(state, receiver_id, serde_json::json!({ "type": "transfer_request_accepted", "payload": accepted_payload }));

    println!("[TRANSFER] Session {} accepted", &transfer_id[..8]);
}

fn handle_transfer_reject(state: &SharedState, receiver_id: &str, payload: serde_json::Value) {
    let requester_id = match payload["requesterSocketId"].as_str() {
        Some(id) => id.to_string(),
        None => return,
    };
    let (pending_exists, req_socket) = {
        let s = state.lock().unwrap();
        let p = s.pending_by_receiver.get(receiver_id);
        (p.is_some() && p.map(|x| x.requester_socket_id.as_str()) == Some(&requester_id), requester_id.clone())
    };
    if !pending_exists { return; }
    {
        let mut s = state.lock().unwrap();
        s.pending_by_receiver.remove(receiver_id);
        s.pending_by_requester.remove(&req_socket);
    }
    reject_requester(state, &req_socket, "Receiver declined");
}

fn handle_transfer_cancel(state: &SharedState, requester_id: &str, payload: serde_json::Value) {
    let target_socket_id = payload["targetSocketId"].as_str().unwrap_or("").to_string();
    let receiver_id = {
        let s = state.lock().unwrap();
        s.pending_by_requester.get(requester_id).cloned()
    };
    let receiver_id = match receiver_id {
        Some(id) if id == target_socket_id || target_socket_id.is_empty() => id,
        _ => return,
    };
    {
        let mut s = state.lock().unwrap();
        s.pending_by_receiver.remove(&receiver_id);
        s.pending_by_requester.remove(requester_id);
    }
    ws_send(state, &receiver_id, serde_json::json!({
        "type": "transfer_request_cancelled",
        "payload": { "requesterSocketId": requester_id, "reason": "Request cancelled" }
    }));
}

fn handle_transfer_abort(state: &SharedState, socket_id: &str, payload: serde_json::Value) {
    let transfer_id = {
        let s = state.lock().unwrap();
        let explicit = payload["transferId"].as_str().map(|s| s.trim().to_string());
        explicit.filter(|id| !id.is_empty())
            .or_else(|| s.sessions_by_socket.get(socket_id).cloned())
    };
    let transfer_id = match transfer_id {
        Some(id) => id,
        None => return,
    };

    let session = {
        let s = state.lock().unwrap();
        s.transfer_sessions.get(&transfer_id).cloned()
    };
    let session = match session {
        Some(s) => s,
        None => return,
    };

    let peer_socket = if socket_id == session.sender_socket_id {
        session.receiver_socket_id.clone()
    } else {
        session.sender_socket_id.clone()
    };
    let reason = if socket_id == session.sender_socket_id {
        "Sender cancelled transfer"
    } else {
        "Receiver cancelled transfer"
    };

    {
        let mut s = state.lock().unwrap();
        s.transfer_sessions.remove(&transfer_id);
        s.sessions_by_socket.remove(&session.sender_socket_id);
        s.sessions_by_socket.remove(&session.receiver_socket_id);
    }

    ws_send(state, &peer_socket, serde_json::json!({
        "type": "transfer_session_closed",
        "payload": { "transferId": transfer_id, "reason": reason, "closedBySocketId": socket_id, "status": "cancelled" }
    }));
}

fn handle_transfer_metadata(state: &SharedState, sender_id: &str, payload: serde_json::Value) {
    let transfer_id = match payload["transferId"].as_str().map(|s| s.trim().to_string()) {
        Some(id) if !id.is_empty() => id,
        _ => return,
    };
    let session_token = payload["sessionToken"].as_str().unwrap_or("").to_string();
    let files = match payload["files"].as_array() {
        Some(f) => f.clone(),
        None => return,
    };
    let total_bytes = payload["totalBytes"].as_u64().unwrap_or_else(|| files.iter().filter_map(|f| f["size"].as_u64()).sum());

    let receiver_id = {
        let mut s = state.lock().unwrap();
        let session = match s.transfer_sessions.get_mut(&transfer_id) {
            Some(sess) if sess.sender_socket_id == sender_id => sess,
            _ => return,
        };
        if session.session_token != session_token { return; }
        session.status = "transferring".to_string();
        session.metadata_delivered = true;
        session.receiver_socket_id.clone()
    };

    ws_send(state, &receiver_id, serde_json::json!({
        "type": "transfer_metadata",
        "payload": { "transferId": transfer_id, "sessionToken": session_token, "files": files, "totalBytes": total_bytes }
    }));
}

fn handle_transfer_complete(state: &SharedState, receiver_id: &str, payload: serde_json::Value) {
    let transfer_id = match payload["transferId"].as_str().map(|s| s.trim().to_string()) {
        Some(id) if !id.is_empty() => id,
        _ => return,
    };
    let session_token = payload["sessionToken"].as_str().unwrap_or("").to_string();

    let (sender_id, tok) = {
        let s = state.lock().unwrap();
        let session = match s.transfer_sessions.get(&transfer_id) {
            Some(sess) if sess.receiver_socket_id == receiver_id => sess.clone(),
            _ => return,
        };
        (session.sender_socket_id.clone(), session.session_token.clone())
    };

    if tok != session_token { return; }

    {
        let mut s = state.lock().unwrap();
        if let Some(sess) = s.transfer_sessions.get_mut(&transfer_id) {
            sess.lifecycle_completed = true;
        }
        s.transfer_sessions.remove(&transfer_id);
        s.sessions_by_socket.remove(&sender_id);
        s.sessions_by_socket.remove(receiver_id);
    }

    let completed_payload = serde_json::json!({
        "transferId": transfer_id,
        "sessionToken": session_token,
        "status": "completed"
    });
    ws_send(state, &sender_id, serde_json::json!({ "type": "transfer_session_completed", "payload": completed_payload }));
    ws_send(state, receiver_id, serde_json::json!({ "type": "transfer_session_completed", "payload": completed_payload }));
    println!("[TRANSFER] Completed {}…", &transfer_id[..8]);
}

fn handle_disconnect(state: &SharedState, app: &AppHandle, socket_id: &str) {
    // Clean up active session
    let session = {
        let s = state.lock().unwrap();
        s.sessions_by_socket.get(socket_id)
            .and_then(|tid| s.transfer_sessions.get(tid))
            .cloned()
    };
    if let Some(session) = session {
        let peer = if socket_id == session.sender_socket_id {
            session.receiver_socket_id.clone()
        } else {
            session.sender_socket_id.clone()
        };
        {
            let mut s = state.lock().unwrap();
            s.transfer_sessions.remove(&session.transfer_id);
            s.sessions_by_socket.remove(&session.sender_socket_id);
            s.sessions_by_socket.remove(&session.receiver_socket_id);
        }
        ws_send(state, &peer, serde_json::json!({
            "type": "transfer_session_closed",
            "payload": { "transferId": session.transfer_id, "reason": "Peer disconnected", "closedBySocketId": socket_id, "status": "cancelled" }
        }));
    }

    // Clean up pending as receiver
    let pending_as_receiver = {
        let s = state.lock().unwrap();
        s.pending_by_receiver.get(socket_id).cloned()
    };
    if let Some(pending) = pending_as_receiver {
        {
            let mut s = state.lock().unwrap();
            s.pending_by_receiver.remove(socket_id);
            s.pending_by_requester.remove(&pending.requester_socket_id);
        }
        reject_requester(state, &pending.requester_socket_id, "Receiver disconnected");
    }

    // Clean up pending as requester
    let receiver_for_requester = {
        let s = state.lock().unwrap();
        s.pending_by_requester.get(socket_id).cloned()
    };
    if let Some(receiver_id) = receiver_for_requester {
        {
            let mut s = state.lock().unwrap();
            s.pending_by_receiver.remove(&receiver_id);
            s.pending_by_requester.remove(socket_id);
        }
        ws_send(state, &receiver_id, serde_json::json!({
            "type": "transfer_request_cancelled",
            "payload": { "requesterSocketId": socket_id, "reason": "Sender disconnected" }
        }));
    }

    // Remove client
    {
        let mut s = state.lock().unwrap();
        s.ws_clients.remove(socket_id);
    }
    broadcast_receivers_updated(state, app);
}

// ─── Notification Window (Agent 4) ───────────────────────────────────────────

fn do_show_incoming_notification(app: &AppHandle, request: IncomingTransferRequest) {
    let label = format!("notification-{}", now_ms());

    // Calculate top-right corner of primary monitor
    let (x, y) = {
        if let Some(monitor) = app.primary_monitor().ok().flatten() {
            let size = monitor.size();
            let pos = monitor.position();
            let scale = monitor.scale_factor();
            let physical_width = size.width;
            let logical_width = (physical_width as f64 / scale) as i32;
            let notif_x = pos.x + logical_width - 370;
            let notif_y = pos.y + 20;
            (notif_x, notif_y)
        } else {
            (1550, 20)
        }
    };

    let _ = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("/#/notification".into()))
        .title("AirSpace Notification")
        .inner_size(350.0, 120.0)
        .position(x as f64, y as f64)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .build();

    // Send the payload to the new window via a global event
    let _ = app.emit("notification-incoming-transfer", &request);
}

// ─── Tray Icon ────────────────────────────────────────────────────────────────

fn update_tray(app: &AppHandle, enabled: bool) {
    if let Some(tray) = app.tray_by_id("airspace-tray-v2") {
        let base_path = if enabled {
            "src/assets/logo/airspace-tray-icon-template.png"
        } else {
            "src/assets/logo/airspace-tray-icon-off-template.png"
        };
        let resource_dir = match app.path().resource_dir() {
            Ok(dir) => dir,
            Err(e) => {
                eprintln!("[Tray] Warning: Failed to get resource_dir: {}", e);
                std::path::PathBuf::new()
            }
        };
        
        let mut icon_path = resource_dir.join(format!("_up_/{}", base_path));
        if !icon_path.exists() {
            icon_path = resource_dir.join(base_path);
        }
        if !icon_path.exists() {
            icon_path = std::path::PathBuf::from(format!("../{}", base_path));
        }

        match std::fs::read(&icon_path) {
            Ok(icon_bytes) => {
                match Image::from_bytes(&icon_bytes) {
                    Ok(img) => {
                        let _ = tray.set_icon(Some(img));
                        // Always re-assert template mode so macOS renders it correctly
                        let _ = tray.set_icon_as_template(true);
                    }
                    Err(e) => eprintln!("[Tray] Warning: Failed to decode tray icon {:?}: {}", icon_path, e),
                }
            }
            Err(e) => eprintln!("[Tray] Warning: Failed to read tray icon at {:?}: {}", icon_path, e),
        }
        let tooltip = if enabled {
            format!("{APP_NAME}: Discoverable")
        } else {
            format!("{APP_NAME}: Not discoverable")
        };
        let _ = tray.set_tooltip(Some(&tooltip));
    }
}

// ─── Tauri Commands ───────────────────────────────────────────────────────────

#[tauri::command]
fn get_lan_receivers(state: tauri::State<SharedState>) -> Vec<LanReceiverService> {
    let s = state.lock().unwrap();
    let mut list: Vec<_> = s.lan_receivers.values().map(|e| e.service.clone()).collect();
    list.sort_by(|a, b| a.username.cmp(&b.username));
    list
}

#[tauri::command]
fn get_lan_discovery_error(state: tauri::State<SharedState>) -> Option<LanDiscoveryErrorPayload> {
    state.lock().unwrap().last_lan_discovery_error.clone()
}

#[tauri::command]
fn set_receiver_presence(
    state: tauri::State<SharedState>,
    presence: ReceiverPresencePayload,
) -> bool {
    let mut s = state.lock().unwrap();
    if !presence.available
        || presence.device_id.as_deref().map(|id| id.trim().is_empty()).unwrap_or(true)
        || presence.username.as_deref().map(|u| u.trim().is_empty()).unwrap_or(true)
    {
        s.last_receiver_presence = None;
        stop_mdns_publisher(&mut s);
        return true;
    }
    s.last_receiver_presence = Some(presence.clone());
    start_mdns_publisher(&mut s, &presence)
}

#[tauri::command]
fn get_receiver_enabled(state: tauri::State<SharedState>) -> bool {
    state.lock().unwrap().receiver_enabled
}

#[tauri::command]
fn set_receiver_enabled(
    app: AppHandle,
    state: tauri::State<SharedState>,
    enabled: bool,
) -> bool {
    let changed = {
        let mut s = state.lock().unwrap();
        if s.receiver_enabled == enabled {
            return true;
        }
        s.receiver_enabled = enabled;
        if !enabled {
            s.last_receiver_presence = None;
            stop_mdns_publisher(&mut s);
        }
        true
    };
    if changed {
        persist_receiver_enabled(&app, enabled);
        update_tray(&app, enabled);
        let _ = app.emit("receiver-enabled-changed", enabled);
    }
    true
}

#[tauri::command]
fn set_lan_discovery_active(
    app: AppHandle,
    state: tauri::State<SharedState>,
    active: bool,
) -> bool {
    let mut s = state.lock().unwrap();
    s.lan_discovery_active = active;
    if !active {
        // Do NOT clear s.lan_receivers here — the mDNS browser task keeps running
        // in the background regardless of this flag, and clearing the cache means
        // the next "active=true" sees an empty list until the peer's mDNS service
        // happens to re-announce (can take minutes). Only emit a transient empty
        // list so the UI can hide stale entries while inactive; keep the real
        // cache warm so re-activating shows known devices immediately.
        drop(s);
        let _ = app.emit("lan-receivers", Vec::<LanReceiverService>::new());
    }
    true
}

#[tauri::command]
fn get_local_websocket_url() -> String {
    format!("ws://127.0.0.1:{LOCAL_WS_PORT}")
}

#[tauri::command]
fn show_main_window(app: AppHandle, target_path: Option<String>) -> bool {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
        if let Some(path) = target_path {
            if !path.is_empty() {
                let _ = app.emit("navigate", path);
            }
        }
        return true;
    }
    false
}

#[tauri::command]
fn show_incoming_transfer_notification(
    app: AppHandle,
    request: IncomingTransferRequest,
) -> bool {
    do_show_incoming_notification(&app, request);
    true
}

#[tauri::command]
fn show_transfer_progress_notification(
    app: AppHandle,
    progress: TransferProgressPayload,
) -> bool {
    let _ = app.emit("transfer-progress-notification", &progress);
    true
}

#[tauri::command]
fn show_transfer_completed_notification(
    app: AppHandle,
    summary: TransferCompletedPayload,
) -> bool {
    let _ = app.emit("transfer-completed-notification", &summary);
    // Open downloads dir
    if let Some(dir) = &summary.directory {
        let _ = open::that(dir);
    } else {
        let _ = dirs::download_dir().map(|d| open::that(d));
    }
    true
}

#[tauri::command]
async fn init_file_download(state: tauri::State<'_, SharedState>, file_id: String, file_name: String) -> Result<String, String> {
    let downloads_dir = dirs::download_dir().ok_or("Cannot find Downloads directory")?;
    let base_path = downloads_dir.join(&file_name);
    let target_path = get_unique_download_path(&base_path);
    
    tokio::fs::File::create(&target_path)
        .await
        .map_err(|e| format!("Failed to create file: {e}"))?;
        
    let mut s = state.lock().unwrap();
    s.active_downloads.insert(file_id, target_path.clone());
    
    Ok(target_path.to_string_lossy().into_owned())
}

#[tauri::command]
async fn append_file_chunk(state: tauri::State<'_, SharedState>, file_id: String, chunk: Vec<u8>) -> Result<(), String> {
    let path = {
        let s = state.lock().unwrap();
        s.active_downloads.get(&file_id).cloned()
    };
    let path = path.ok_or("File download not initialized or already finalized")?;
    
    use tokio::io::AsyncWriteExt;
    let mut file = tokio::fs::OpenOptions::new()
        .append(true)
        .open(&path)
        .await
        .map_err(|e| format!("Failed to open file for appending: {e}"))?;
        
    file.write_all(&chunk)
        .await
        .map_err(|e| format!("Failed to write chunk: {e}"))?;
        
    file.flush()
        .await
        .map_err(|e| format!("Failed to flush file: {e}"))?;
        
    Ok(())
}

#[tauri::command]
async fn finalize_file_download(state: tauri::State<'_, SharedState>, file_id: String) -> Result<String, String> {
    let path = {
        let mut s = state.lock().unwrap();
        s.active_downloads.remove(&file_id)
    };
    let path = path.ok_or("File not found in active downloads")?;
    Ok(path.to_string_lossy().into_owned())
}

fn get_unique_download_path(base: &std::path::Path) -> std::path::PathBuf {
    if !base.exists() {
        return base.to_path_buf();
    }
    let stem = base.file_stem().unwrap_or_default().to_string_lossy();
    let ext = base.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    let parent = base.parent().unwrap_or(std::path::Path::new("."));
    let mut attempt = 1u32;
    loop {
        let candidate = parent.join(format!("{} ({}){}", stem, attempt, ext));
        if !candidate.exists() {
            return candidate;
        }
        attempt += 1;
    }
}

// ─── App Entry Point ──────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let shared_state: SharedState = Arc::new(Mutex::new(AppState::default()));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(shared_state.clone())
        .setup(move |app| {
            let app_handle = app.handle().clone();
            let state = shared_state.clone();

            // Load persisted receiver_enabled preference
            let receiver_enabled = load_receiver_enabled(&app_handle);
            {
                let mut s = state.lock().unwrap();
                s.receiver_enabled = receiver_enabled;
            }

            // ── Apply native macOS vibrancy effects ──
            #[cfg(target_os = "macos")]
            {
                if let Some(main_win) = app.get_webview_window("main") {
                    println!("[Setup] Applying Popover vibrancy to main window");
                    match apply_vibrancy(
                        &main_win,
                        NSVisualEffectMaterial::Popover,
                        None,
                        Some(13.0),
                    ) {
                        Ok(_) => println!("[Setup] ✅ Main window vibrancy applied successfully"),
                        Err(e) => eprintln!("[Setup] ❌ Main window vibrancy failed: {:?}", e),
                    }
                } else {
                    eprintln!("[Setup] ❌ Could not find 'main' window for vibrancy");
                }
                if let Some(tray_win) = app.get_webview_window("tray") {
                    println!("[Setup] Applying HudWindow vibrancy to tray window");
                    match apply_vibrancy(
                        &tray_win,
                        NSVisualEffectMaterial::HudWindow,
                        None,
                        Some(18.0),
                    ) {
                        Ok(_) => println!("[Setup] ✅ Tray window vibrancy applied successfully"),
                        Err(e) => eprintln!("[Setup] ❌ Tray window vibrancy failed: {:?}", e),
                    }
                } else {
                    eprintln!("[Setup] ⚠️  Could not find 'tray' window for vibrancy (expected — it starts hidden)");
                }
            }

            // ── Hide-on-Close: intercept main window close to keep app alive in tray ──
            if let Some(main_win) = app.get_webview_window("main") {
                let win_clone = main_win.clone();
                main_win.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        println!("[Window] Close requested → hiding window instead of destroying");
                        api.prevent_close();
                        let _ = win_clone.hide();
                    }
                });
                println!("[Setup] ✅ Hide-on-close handler installed for main window");
            }

            // ── Build system tray ──
            let open_item = MenuItem::with_id(app, "open", format!("Open {APP_NAME}"), true, None::<&str>);
            let toggle_label = if receiver_enabled { "Turn Receiving Off" } else { "Turn Receiving On" };
            let toggle_item = MenuItem::with_id(app, "toggle-receiving", toggle_label, true, None::<&str>);
            let separator = PredefinedMenuItem::separator(app);
            let quit_item = MenuItem::with_id(app, "quit", format!("Quit {APP_NAME}"), true, None::<&str>);
            
            let menu = match (open_item, toggle_item, separator, quit_item) {
                (Ok(o), Ok(t), Ok(s), Ok(q)) => Menu::with_items(app, &[&o, &t, &s, &q]).ok(),
                _ => None,
            };

            // Load tray icon
            let resource_dir = match app_handle.path().resource_dir() {
                Ok(dir) => dir,
                Err(e) => {
                    eprintln!("[Tray] Warning: Failed to get resource_dir: {}", e);
                    std::path::PathBuf::new()
                }
            };

            let base_path = if receiver_enabled { "src/assets/logo/airspace-tray-icon-template.png" } else { "src/assets/logo/airspace-tray-icon-off-template.png" };
            let mut tray_icon_path = resource_dir.join(format!("_up_/{}", base_path));
            if !tray_icon_path.exists() {
                tray_icon_path = resource_dir.join(base_path);
            }
            if !tray_icon_path.exists() {
                tray_icon_path = std::path::PathBuf::from(format!("../{}", base_path));
            }

            let mut tray_builder = TrayIconBuilder::with_id("airspace-tray-v2")
                .tooltip(if receiver_enabled { format!("{APP_NAME}: Discoverable") } else { format!("{APP_NAME}: Not discoverable") })
                .show_menu_on_left_click(false);
            
            if let Some(m) = &menu {
                tray_builder = tray_builder.menu(m);
            }

            match std::fs::read(&tray_icon_path) {
                Ok(bytes) => {
                    match Image::from_bytes(&bytes) {
                        Ok(img) => {
                            tray_builder = tray_builder.icon(img).icon_as_template(true);
                        }
                        Err(e) => eprintln!("[Tray] Warning: Failed to decode tray icon {:?}: {}", tray_icon_path, e),
                    }
                }
                Err(e) => eprintln!("[Tray] Warning: Failed to read tray icon at {:?}: {}", tray_icon_path, e),
            }

            let state_for_tray = state.clone();
            let app_for_tray = app_handle.clone();

            let tray_builder = tray_builder
                .on_tray_icon_event(move |_tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        rect,
                        ..
                    } = event
                    {
                        // Emit the toggle event for any frontend listener
                        let _ = app_for_tray.emit("toggle-tray-window", ());

                        if let Some(window) = app_for_tray.get_webview_window("tray") {
                            let currently_visible = window.is_visible().unwrap_or(false);
                            println!("[Tray] Left-click -> tray window visible={}", currently_visible);
                            if currently_visible {
                                println!("[Tray] Hiding tray popup");
                                let _ = window.hide();
                            } else {
                                let scale_factor = window.scale_factor().unwrap_or(1.0);
                                println!("[Tray] Showing tray popup (scale_factor={})", scale_factor);
                                // Tray window logical width — must match tauri.conf.json (280)
                                let window_width = 280.0_f64;

                                let new_position = match rect.position {
                                    tauri::Position::Physical(p) => {
                                        let tray_w = match rect.size {
                                            tauri::Size::Physical(s) => s.width as f64,
                                            tauri::Size::Logical(s) => s.width * scale_factor,
                                        };
                                        let tray_h = match rect.size {
                                            tauri::Size::Physical(s) => s.height as f64,
                                            tauri::Size::Logical(s) => s.height * scale_factor,
                                        };
                                        let window_width_px = window_width * scale_factor;
                                        // Center-align window under tray icon, 8px gap below menu bar
                                        let x = p.x as f64 - (window_width_px / 2.0) + (tray_w / 2.0);
                                        let y = p.y as f64 + tray_h + (8.0 * scale_factor);
                                        tauri::Position::Physical(tauri::PhysicalPosition::new(
                                            x.round() as i32,
                                            y.round() as i32,
                                        ))
                                    }
                                    tauri::Position::Logical(l) => {
                                        let tray_w = match rect.size {
                                            tauri::Size::Logical(s) => s.width,
                                            tauri::Size::Physical(s) => s.width as f64 / scale_factor,
                                        };
                                        let tray_h = match rect.size {
                                            tauri::Size::Logical(s) => s.height,
                                            tauri::Size::Physical(s) => s.height as f64 / scale_factor,
                                        };
                                        let x = l.x - (window_width / 2.0) + (tray_w / 2.0);
                                        let y = l.y + tray_h + 8.0;
                                        tauri::Position::Logical(tauri::LogicalPosition::new(x, y))
                                    }
                                };
                                let _ = window.set_position(new_position);
                                let _ = window.show();
                                let _ = window.set_focus();
                                println!("[Tray] ✅ Tray popup shown and focused");
                            }
                        }
                    }
                })
                .on_menu_event({
                    let app_for_menu = app_handle.clone();
                    let state_for_menu = state_for_tray.clone();
                    move |_app, event| {
                        match event.id.as_ref() {
                            "open" => {
                                if let Some(window) = app_for_menu.get_webview_window("main") {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                            "toggle-receiving" => {
                                let next_enabled = {
                                    let mut s = state_for_menu.lock().unwrap();
                                    s.receiver_enabled = !s.receiver_enabled;
                                    s.receiver_enabled
                                };
                                if !next_enabled {
                                    let mut s = state_for_menu.lock().unwrap();
                                    s.last_receiver_presence = None;
                                    stop_mdns_publisher(&mut s);
                                }
                                persist_receiver_enabled(&app_for_menu, next_enabled);
                                update_tray(&app_for_menu, next_enabled);
                                let _ = app_for_menu.emit("receiver-enabled-changed", next_enabled);
                            }
                            "quit" => {
                                app_for_menu.exit(0);
                            }
                            _ => {}
                        }
                    }
                });

            if let Err(e) = tray_builder.build(app) {
                eprintln!("[Tray] Warning: Failed to build system tray: {}", e);
            }

            // ── Start mDNS browser ──
            spawn_mdns_browser(app_handle.clone(), state.clone());

            // ── Start WebSocket relay server ──
            spawn_ws_server(app_handle.clone(), state.clone());

            // ── Emit initial state ──
            let _ = app_handle.emit("receiver-enabled-changed", receiver_enabled);

            println!("[Setup] ✅ AirSpace setup complete — tray active, app running in background");
            println!("[Setup] receiver_enabled={}", receiver_enabled);

            Ok(())
        })
        .plugin(tauri_plugin_websocket::init())
        .invoke_handler(tauri::generate_handler![
            get_lan_receivers,
            get_lan_discovery_error,
            set_receiver_presence,
            get_receiver_enabled,
            set_receiver_enabled,
            set_lan_discovery_active,
            get_local_websocket_url,
            show_main_window,
            show_incoming_transfer_notification,
            show_transfer_progress_notification,
            show_transfer_completed_notification,
            init_file_download,
            append_file_chunk,
            finalize_file_download,
        ])
        .build(tauri::generate_context!())
        .expect("error while building AirSpace")
        .run(|app_handle, event| {
            #[allow(clippy::single_match)]
            match event {
                // Fired on macOS when the user clicks the Dock icon while all
                // windows are hidden. Re-show the main window so the app is
                // never "stuck" in the background.
                tauri::RunEvent::Reopen { has_visible_windows, .. } => {
                    if !has_visible_windows {
                        println!("[Dock] Reopen event -> showing main window");
                        if let Some(win) = app_handle.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                            println!("[Dock] Main window restored");
                        }
                    }
                }
                _ => {}
            }
        });
}