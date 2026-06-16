const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  Notification,
  Tray,
  nativeImage,
  powerMonitor,
  shell,
  screen,
} = require("electron");
const fs = require("fs");
const fsPromises = require("fs/promises");
const path = require("path");
const { pathToFileURL } = require("url");
const dnssd = require("dnssd");

/** Keep in sync with src/components/layout/AppWindow.tsx */
const APP_WINDOW_WIDTH = 1080;
const APP_WINDOW_HEIGHT = 760;
const TRAY_WINDOW_WIDTH = 360;
const TRAY_WINDOW_HEIGHT = 66;
const FALLBACK_TRAY_BUTTON_WIDTH = 30;
const FALLBACK_TRAY_BUTTON_HEIGHT = 24;
const TRAY_ICON_POINT_SIZE = 22;
const LOCAL_WEBSOCKET_PORT = 8080;
const LOCAL_WEBSOCKET_URL = `ws://127.0.0.1:${LOCAL_WEBSOCKET_PORT}`;
const BONJOUR_SERVICE_TYPE = "airspace";
const APP_NAME = "AirSpace";
const LAN_RECEIVER_STALE_MS = 45_000;
const LAN_RECEIVER_SWEEP_MS = 10_000;
const LAN_DISCOVERY_ERROR_MESSAGE =
  "AirSpace could not start local network discovery. Check macOS Local Network permission and try again.";
const PROGRESS_NOTIFICATION_MIN_MS = 900;
const PROGRESS_NOTIFICATION_MIN_DELTA = 5;
const TRAY_POPUP_ARG = "--airspace-tray-popup";
const HIDDEN_RUNTIME_ARG = "--airspace-hidden-runtime";
const APP_ICON_FILENAME = "airspace-app-icon-1024.png";
const FALLBACK_APP_ICON_FILENAME = "airspace-app-icon.png";
const TRAY_GUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const TRAY_ICON_ON_FILENAME = "airspace-tray-icon-template.png";
const TRAY_ICON_OFF_FILENAME = "airspace-tray-icon-off-template.png";

let mainWindow;
let tray = null;
let trayWindow = null;
let dnssdBrowser = null;
let localNetworkingStarted = false;
let publishedReceiverAd = null;
let publishedPresenceKey = "";
let lastReceiverPresence = null;
let lanDiscoveryActive = false;
let lastLanDiscoveryError = null;
let receiverEnabled = false;
let isQuitting = false;
const lanReceivers = new Map();
let lanReceiverSweepTimer = null;
const activeTransferNotifications = new Map();
const lastProgressNotificationByTransfer = new Map();

app.setName(APP_NAME);

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
}

function isTrayPopupLaunch(commandLine = process.argv) {
  return commandLine.includes(TRAY_POPUP_ARG);
}

function isHiddenRuntimeLaunch(commandLine = process.argv) {
  return commandLine.includes(HIDDEN_RUNTIME_ARG);
}

function getLogoAssetPath(filename) {
  return path.join(__dirname, "../src/assets/logo", filename);
}

function getLogoAssetCandidates(filename) {
  return [
    path.join(process.resourcesPath, "assets", "logo", filename),
    path.join(app.getAppPath(), "src", "assets", "logo", filename),
    getLogoAssetPath(filename),
  ].filter((candidate, index, candidates) => candidates.indexOf(candidate) === index);
}

function firstExistingPath(candidates) {
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

function getAppIconPath() {
  return firstExistingPath([
    ...getLogoAssetCandidates(APP_ICON_FILENAME),
    ...getLogoAssetCandidates(FALLBACK_APP_ICON_FILENAME),
  ]);
}

function getTrayIconPath(enabled) {
  return firstExistingPath([
    ...getLogoAssetCandidates(enabled ? TRAY_ICON_ON_FILENAME : TRAY_ICON_OFF_FILENAME),
    ...getLogoAssetCandidates("airspace-tray-icon-128.png"),
  ]);
}

function createTrayIcon(enabled) {
  const iconPath = getTrayIconPath(enabled);
  let image = nativeImage.createEmpty();

  if (process.platform === "darwin") {
    try {
      image = nativeImage.createFromBuffer(fs.readFileSync(iconPath), {
        scaleFactor: 2,
      });
    } catch {
      image = nativeImage.createFromPath(iconPath).resize({
        width: TRAY_ICON_POINT_SIZE,
        height: TRAY_ICON_POINT_SIZE,
        quality: "best",
      });
    }

    if (image.isEmpty()) {
      image = nativeImage.createFromPath(iconPath).resize({
        width: TRAY_ICON_POINT_SIZE,
        height: TRAY_ICON_POINT_SIZE,
        quality: "best",
      });
    }

    image.setTemplateImage(true);
    return image;
  }

  return nativeImage.createFromPath(iconPath).resize({
    width: 18,
    height: 18,
    quality: "best",
  });
}

function updateTrayIcon() {
  if (!tray) return;

  const nextIcon = createTrayIcon(receiverEnabled);
  if (!nextIcon.isEmpty()) {
    tray.setImage(nextIcon);
  } else {
    console.error("[TRAY] skipped empty tray icon update");
  }

  tray.setToolTip(
    receiverEnabled ? `${APP_NAME}: Discoverable` : `${APP_NAME}: Not discoverable`
  );

  if (process.platform === "darwin") {
    tray.setTitle("");
  }
}

function verifyTrayStatusItem() {
  if (process.platform !== "darwin") return;

  setTimeout(() => {
    if (!tray) {
      createTray();
      return;
    }

    updateTrayIcon();

    const bounds = tray.getBounds();
    if (bounds.width === 0) {
      tray.destroy();
      tray = null;
      createTray();
    }
  }, 1200);
}

function isVisibleTrayBounds(bounds) {
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
    return false;
  }

  const display = screen.getDisplayNearestPoint({
    x: Math.max(bounds.x, 0),
    y: Math.max(bounds.y, 0),
  });
  const { x, y, width } = display.bounds;
  const isHorizontallyVisible = bounds.x >= x && bounds.x + bounds.width <= x + width;
  const isInMenuBar = bounds.y >= y && bounds.y <= y + 48;
  return isHorizontallyVisible && isInMenuBar;
}

function getFallbackTrayButtonBounds() {
  const display = screen.getPrimaryDisplay();
  const x = Math.round(
    display.bounds.x + display.bounds.width * 0.65 - FALLBACK_TRAY_BUTTON_WIDTH / 2
  );

  return {
    x,
    y: display.bounds.y + 3,
    width: FALLBACK_TRAY_BUTTON_WIDTH,
    height: FALLBACK_TRAY_BUTTON_HEIGHT,
  };
}

function configureDockIcon() {
  if (process.platform !== "darwin" || !app.dock) return;

  const appIcon = nativeImage.createFromPath(getAppIconPath());
  if (!appIcon.isEmpty()) {
    app.dock.setIcon(appIcon);
  }
}

function getRuntimeStatePath() {
  return path.join(app.getPath("userData"), "runtime-state.json");
}

function sendToRenderer(channel, payload) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    window.webContents.send(channel, payload);
  }
}

function ensureHiddenRuntimeWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  return createWindow({ initiallyHidden: true });
}

function loadReceiverEnabledPreference() {
  try {
    const raw = fs.readFileSync(getRuntimeStatePath(), "utf8");
    const parsed = JSON.parse(raw);
    return parsed?.receiverEnabled === true;
  } catch {
    return false;
  }
}

function persistReceiverEnabledPreference() {
  try {
    fs.writeFileSync(
      getRuntimeStatePath(),
      JSON.stringify({ receiverEnabled }, null, 2),
      "utf8"
    );
  } catch (error) {
    console.error("[STATE] Failed to persist receiver toggle:", error.message);
  }
}

function getLanReceiverSnapshot() {
  return Array.from(lanReceivers.values()).sort((a, b) =>
    a.username.localeCompare(b.username)
  );
}

function broadcastLanReceivers() {
  const snapshot = getLanReceiverSnapshot();
  sendToRenderer("orbitalshare:lan-receivers", snapshot);
}

function broadcastReceiverEnabled() {
  sendToRenderer("orbitalshare:receiver-enabled-changed", receiverEnabled);
}

function reportLanDiscoveryError(scope, error) {
  const detail =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown dnssd error";

  if (typeof detail === "string" && detail.includes("EHOSTUNREACH")) {
    console.log(
      "[NETWORK BLOCK] Router is isolating clients. Please switch to a mobile hotspot for local network testing."
    );
  }

  lastLanDiscoveryError = {
    scope,
    message: LAN_DISCOVERY_ERROR_MESSAGE,
    detail,
    timestamp: Date.now(),
  };
  console.error(`[DNSSD] ${scope}: ${detail}`);
  sendToRenderer("orbitalshare:lan-discovery-error", lastLanDiscoveryError);
}

function pickReachableAddress(addresses = []) {
  return (
    addresses.find(
      (address) =>
        typeof address === "string" &&
        !address.startsWith("127.") &&
        address !== "::1" &&
        !address.startsWith("fe80::")
    ) || null
  );
}

function normalizeLanReceiver(service) {
  const txt = service?.txt ?? {};
  // Abbreviated TXT keys: id, user, avail, type, os (all ≤9 chars for mDNSResponder)
  const deviceId = typeof txt.id === "string" ? txt.id.trim() : "";
  const username = typeof txt.user === "string" ? txt.user.trim() : "";
  const available =
    typeof txt.avail === "string"
      ? txt.avail === "1"
      : Boolean(txt.avail);
  const host = pickReachableAddress(service?.addresses);

  if (!available || !deviceId || !username || !host || !service?.port) {
    return null;
  }

  return {
    deviceId,
    username,
    host,
    port: service.port,
    deviceType:
      txt.type === "desktop" ||
      txt.type === "mobile" ||
      txt.type === "unknown"
        ? txt.type
        : "unknown",
    platform:
      txt.os === "macos" ||
      txt.os === "windows" ||
      txt.os === "linux" ||
      txt.os === "android" ||
      txt.os === "ios" ||
      txt.os === "unknown"
        ? txt.os
        : "unknown",
  };
}

function upsertLanReceiver(service) {
  const normalized = normalizeLanReceiver(service);
  // Meticulous alias: dnssd emits `fullname` — alias it to `fqdn` for consistency
  const serviceFqdn =
    typeof service?.fqdn === "string" ? service.fqdn : null;

  if (!serviceFqdn) return;

  if (!normalized) {
    console.warn("[BONJOUR] Ignored incomplete LAN receiver service", {
      fqdn: serviceFqdn,
      name: service?.name,
      host: service?.host,
      addresses: service?.addresses,
      port: service?.port,
      txt: service?.txt,
    });
    if (lanReceivers.delete(serviceFqdn)) {
      broadcastLanReceivers();
    }
    return;
  }

  lanReceivers.set(serviceFqdn, {
    ...normalized,
    lastSeen: Date.now(),
  });
  broadcastLanReceivers();
}

function removeLanReceiver(service) {
  const serviceFqdn =
    typeof service?.fqdn === "string" ? service.fqdn : null;
  if (!serviceFqdn) return;
  if (lanReceivers.delete(serviceFqdn)) {
    broadcastLanReceivers();
  }
}

function startBonjourDiscovery() {
  if (dnssdBrowser || !lanDiscoveryActive) return true;

  try {
    // Native dnssd.Browser — bypasses JS-layer Bonjour blocks
    dnssdBrowser = new dnssd.Browser(dnssd.tcp(BONJOUR_SERVICE_TYPE));
  } catch (error) {
    reportLanDiscoveryError("browse_start", error);
    return false;
  }

  dnssdBrowser.on("serviceUp", (service) => {
    // Alias fullname → fqdn so upsertLanReceiver can key the Map correctly
    upsertLanReceiver({ ...service, fqdn: service.fullname });
  });

  dnssdBrowser.on("serviceDown", (service) => {
    removeLanReceiver({ ...service, fqdn: service.fullname });
  });

  dnssdBrowser.on("error", (error) => reportLanDiscoveryError("browse", error));

  dnssdBrowser.start();
  startLanReceiverSweep();
  return true;
}

function stopBonjourDiscovery() {
  if (!dnssdBrowser) return;
  dnssdBrowser.stop();
  dnssdBrowser = null;
  lanReceivers.clear();
  broadcastLanReceivers();
  stopLanReceiverSweep();
}

function startLanReceiverSweep() {
  if (lanReceiverSweepTimer) return;

  lanReceiverSweepTimer = setInterval(() => {
    const now = Date.now();
    let changed = false;

    for (const [serviceFqdn, receiver] of lanReceivers.entries()) {
      if (!receiver?.lastSeen || now - receiver.lastSeen <= LAN_RECEIVER_STALE_MS) {
        continue;
      }

      lanReceivers.delete(serviceFqdn);
      changed = true;
    }

    if (changed) {
      broadcastLanReceivers();
    }
  }, LAN_RECEIVER_SWEEP_MS);

  if (typeof lanReceiverSweepTimer.unref === "function") {
    lanReceiverSweepTimer.unref();
  }
}

function stopLanReceiverSweep() {
  if (!lanReceiverSweepTimer) return;
  clearInterval(lanReceiverSweepTimer);
  lanReceiverSweepTimer = null;
}

function stopPublishedReceiverService() {
  if (!publishedReceiverAd) return;
  publishedReceiverAd.stop();
  publishedReceiverAd = null;
  publishedPresenceKey = "";
}

function setReceiverPresence(presence) {
  if (
    !presence ||
    !presence.available ||
    typeof presence.deviceId !== "string" ||
    typeof presence.username !== "string"
  ) {
    lastReceiverPresence = null;
    stopPublishedReceiverService();
    return true;
  }

  const deviceId = presence.deviceId.trim();
  const username = presence.username.trim();
  if (!deviceId || !username) {
    lastReceiverPresence = null;
    stopPublishedReceiverService();
    return true;
  }

  const deviceType =
    presence.deviceType === "desktop" ||
    presence.deviceType === "mobile" ||
    presence.deviceType === "unknown"
      ? presence.deviceType
      : "unknown";
  const platform =
    presence.platform === "macos" ||
    presence.platform === "windows" ||
    presence.platform === "linux" ||
    presence.platform === "android" ||
    presence.platform === "ios" ||
    presence.platform === "unknown"
      ? presence.platform
      : "unknown";
  const nextPresenceKey = `${deviceId}:${username}:${deviceType}:${platform}`;
  lastReceiverPresence = {
    available: true,
    deviceId,
    username,
    deviceType,
    platform,
  };

  if (publishedReceiverAd && publishedPresenceKey === nextPresenceKey) {
    return true;
  }

  stopPublishedReceiverService();

  try {
    // Native dnssd.Advertisement — registers _airspace._tcp on the LAN
    publishedReceiverAd = new dnssd.Advertisement(
      dnssd.tcp(BONJOUR_SERVICE_TYPE),
      LOCAL_WEBSOCKET_PORT,
      {
        name: `${APP_NAME} ${deviceId}`,
        txt: {
          avail: "1",
          id: deviceId,
          user: username,
          type: deviceType,
          os: platform,
        },
      }
    );

    publishedReceiverAd.on("error", (error) => {
      reportLanDiscoveryError("publish", error);
    });

    publishedReceiverAd.start();
  } catch (error) {
    reportLanDiscoveryError("publish_start", error);
    return false;
  }

  publishedPresenceKey = nextPresenceKey;
  return true;
}

function setLanDiscoveryActive(active) {
  lanDiscoveryActive = active === true;

  if (!lanDiscoveryActive) {
    stopBonjourDiscovery();
    return true;
  }

  return startBonjourDiscovery();
}

function setReceiverEnabled(nextValue) {
  const normalized = nextValue === true;
  if (receiverEnabled === normalized) {
    return true;
  }

  receiverEnabled = normalized;
  persistReceiverEnabledPreference();

  if (receiverEnabled) {
    ensureHiddenRuntimeWindow();
  }

  if (!receiverEnabled) {
    lastReceiverPresence = null;
    stopPublishedReceiverService();
  }

  updateTrayIcon();
  broadcastReceiverEnabled();
  return true;
}

function buildTrayContextMenu() {
  return Menu.buildFromTemplate([
    {
      label: `Open ${APP_NAME}`,
      click: () => showMainWindow(),
    },
    {
      label: receiverEnabled ? "Turn Receiving Off" : "Turn Receiving On",
      click: () => setReceiverEnabled(!receiverEnabled),
    },
    { type: "separator" },
    {
      label: `Quit ${APP_NAME}`,
      click: () => app.quit(),
    },
  ]);
}

function configureLoginItem() {
  if (process.platform !== "darwin" || !app.isPackaged) return;

  try {
    const settings = app.getLoginItemSettings();
    if (settings.openAtLogin) return;

    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true,
      args: [HIDDEN_RUNTIME_ARG],
    });
  } catch (error) {
    console.error("[LOGIN] Failed to configure login item:", error.message);
  }
}

function getAppEntryUrl(hash = "") {
  const normalizedHash = hash ? `#${hash.replace(/^#?/, "")}` : "";
  if (!app.isPackaged) {
    const devUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
    return `${devUrl}${normalizedHash}`;
  }

  return `${pathToFileURL(path.join(__dirname, "../dist/index.html")).href}${normalizedHash}`;
}

function showMainWindow(targetPath = "") {
  if (process.platform === "darwin" && app.dock) {
    app.dock.show();
  }

  if (!mainWindow) {
    createWindow();
  }

  if (!mainWindow) return;

  if (targetPath) {
    mainWindow.webContents.send("orbitalshare:navigate", targetPath);
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
}

function createTrayWindow() {
  if (trayWindow) return trayWindow;

  trayWindow = new BrowserWindow({
    width: TRAY_WINDOW_WIDTH,
    height: TRAY_WINDOW_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    movable: false,
    transparent: true,
    hasShadow: true,
    backgroundColor: "#00000000",
    skipTaskbar: true,
    alwaysOnTop: true,
    vibrancy: "popover",
    visualEffectState: "active",
    hiddenInMissionControl: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  trayWindow.loadURL(getAppEntryUrl("/tray"));

  trayWindow.on("blur", () => {
    trayWindow?.hide();
  });

  trayWindow.on("closed", () => {
    trayWindow = null;
  });

  return trayWindow;
}

function getTrayAnchorBounds(anchorBounds) {
  if (isVisibleTrayBounds(anchorBounds)) {
    return anchorBounds;
  }

  const currentTrayBounds = tray?.getBounds();
  if (isVisibleTrayBounds(currentTrayBounds)) {
    return currentTrayBounds;
  }

  return getFallbackTrayButtonBounds();
}

function positionTrayWindow(anchorBounds) {
  if (!tray || !trayWindow) return;

  const trayBounds = getTrayAnchorBounds(anchorBounds);
  const display = screen.getDisplayNearestPoint({
    x: Math.round(trayBounds.x + trayBounds.width / 2),
    y: Math.round(trayBounds.y + trayBounds.height / 2),
  });
  const { x: workX, y: workY, width: workWidth } = display.workArea;
  const x = Math.min(
    Math.max(
      Math.round(trayBounds.x + trayBounds.width / 2 - TRAY_WINDOW_WIDTH / 2),
      workX + 8
    ),
    workX + workWidth - TRAY_WINDOW_WIDTH - 8
  );
  const y = workY + 6;

  trayWindow.setPosition(x, y, false);
}

function toggleTrayWindow(anchorBounds) {
  const nextTrayWindow = createTrayWindow();

  if (nextTrayWindow.isVisible()) {
    nextTrayWindow.hide();
    return;
  }

  positionTrayWindow(anchorBounds);
  nextTrayWindow.show();
  nextTrayWindow.focus();
}

function showTrayPopupOnly() {
  if (process.platform === "darwin" && app.dock) {
    app.dock.hide();
  }

  setTimeout(() => {
    toggleTrayWindow(getFallbackTrayButtonBounds());
  }, 250);
}

function createTray() {
  if (tray) return tray;

  try {
    const initialIcon = createTrayIcon(receiverEnabled);
    if (initialIcon.isEmpty()) {
      console.error("[TRAY] initial tray icon is empty");
    }

    tray = new Tray(initialIcon, TRAY_GUID);
  } catch (error) {
    console.error("[TRAY] failed to create tray", error);
    return null;
  }

  tray.setIgnoreDoubleClickEvents(true);
  updateTrayIcon();
  tray.on("click", (_event, bounds) => {
    toggleTrayWindow(bounds);
  });
  tray.on("right-click", () => {
    tray?.popUpContextMenu(buildTrayContextMenu());
  });

  return tray;
}

function formatIncomingTransferBody(request) {
  const fileCount = Number.isFinite(request?.fileCount) ? request.fileCount : 0;
  const fileLabel = fileCount === 1 ? "1 file" : `${fileCount} files`;
  const sender = typeof request?.senderUsername === "string"
    ? request.senderUsername
    : "A nearby device";

  return `${sender} wants to send ${fileLabel}`;
}

function showIncomingTransferNotification(request) {
  if (!Notification.isSupported()) {
    return false;
  }

  if (mainWindow?.isVisible() && mainWindow?.isFocused()) {
    return false;
  }

  const notification = new Notification({
    id: `airspace-incoming-${request?.requesterSocketId ?? Date.now()}`,
    groupId: "airspace-transfers",
    title: APP_NAME,
    body: formatIncomingTransferBody(request),
    icon: getAppIconPath(),
    silent: false,
    actions: [
      { type: "button", text: "Accept" },
      { type: "button", text: "Decline" },
    ],
    closeButtonText: "Dismiss",
  });

  notification.on("action", (details) => {
    const actionIndex = details?.actionIndex ?? -1;
    sendToRenderer("orbitalshare:incoming-transfer-action", {
      requesterSocketId: request?.requesterSocketId,
      action: actionIndex === 0 ? "accept" : "decline",
    });
  });

  notification.on("click", () => {
    showMainWindow("/waiting");
  });

  notification.show();
  return true;
}

function showTransferProgressNotification(progress) {
  if (!Notification.isSupported()) {
    return false;
  }

  if (mainWindow?.isVisible() && mainWindow?.isFocused()) {
    return false;
  }

  const transferId =
    typeof progress?.transferId === "string" ? progress.transferId : "";
  if (!transferId) return false;

  const percent = Math.max(
    0,
    Math.min(100, Math.round(Number(progress.progress) || 0))
  );
  const now = Date.now();
  const previous = lastProgressNotificationByTransfer.get(transferId);

  if (
    previous &&
    percent < 100 &&
    now - previous.timestamp < PROGRESS_NOTIFICATION_MIN_MS &&
    Math.abs(percent - previous.percent) < PROGRESS_NOTIFICATION_MIN_DELTA
  ) {
    return false;
  }

  lastProgressNotificationByTransfer.set(transferId, {
    timestamp: now,
    percent,
  });

  const sender =
    typeof progress?.peerUsername === "string" && progress.peerUsername
      ? progress.peerUsername
      : "nearby device";
  const fileName =
    typeof progress?.fileName === "string" && progress.fileName
      ? ` • ${progress.fileName}`
      : "";

  const existing = activeTransferNotifications.get(transferId);
  existing?.close();

  const notification = new Notification({
    id: `airspace-transfer-progress-${transferId}`,
    groupId: "airspace-transfers",
    title: `Receiving from ${sender}`,
    body: `${percent}% received${fileName}`,
    icon: getAppIconPath(),
    silent: true,
  });

  activeTransferNotifications.set(transferId, notification);
  notification.show();
  return true;
}

function showTransferCompletedNotification(summary) {
  if (!Notification.isSupported()) {
    return false;
  }

  const transferId =
    typeof summary?.transferId === "string" ? summary.transferId : "";
  if (transferId) {
    activeTransferNotifications.get(transferId)?.close();
    activeTransferNotifications.delete(transferId);
    lastProgressNotificationByTransfer.delete(transferId);
  }

  if (mainWindow?.isVisible() && mainWindow?.isFocused()) {
    return false;
  }

  const fileCount = Number.isFinite(summary?.fileCount) ? summary.fileCount : 0;
  const fileLabel = fileCount === 1 ? "1 file" : `${fileCount} files`;
  const directory =
    typeof summary?.directory === "string" && summary.directory
      ? summary.directory
      : app.getPath("downloads");

  const notification = new Notification({
    id: transferId
      ? `airspace-transfer-complete-${transferId}`
      : `airspace-transfer-complete-${Date.now()}`,
    groupId: "airspace-transfers",
    title: "Transfer complete",
    body: `${fileLabel} saved to Downloads`,
    icon: getAppIconPath(),
    silent: false,
    actions: [{ type: "button", text: "Show in Downloads" }],
  });

  notification.on("action", () => {
    void shell.openPath(directory);
  });

  notification.on("click", () => {
    void shell.openPath(directory);
  });

  notification.show();
  return true;
}

async function getUniqueDownloadPath(downloadsDirectory, filename) {
  const parsed = path.parse(filename);
  let attempt = 0;

  while (true) {
    const suffix = attempt === 0 ? "" : ` (${attempt})`;
    const candidate = path.join(
      downloadsDirectory,
      `${parsed.name}${suffix}${parsed.ext}`
    );

    try {
      await fsPromises.access(candidate);
      attempt += 1;
    } catch {
      return candidate;
    }
  }
}

async function saveReceivedFilesToDownloads(files) {
  const downloadsDirectory = app.getPath("downloads");
  let savedCount = 0;

  for (const file of Array.isArray(files) ? files : []) {
    if (!file || typeof file !== "object" || typeof file.name !== "string") {
      continue;
    }

    const bytes =
      file.bytes instanceof ArrayBuffer
        ? Buffer.from(file.bytes)
        : ArrayBuffer.isView(file.bytes)
          ? Buffer.from(file.bytes.buffer, file.bytes.byteOffset, file.bytes.byteLength)
          : null;

    if (!bytes) {
      continue;
    }

    const targetPath = await getUniqueDownloadPath(downloadsDirectory, file.name);
    await fsPromises.writeFile(targetPath, bytes);
    savedCount += 1;
  }

  return {
    savedCount,
    directory: downloadsDirectory,
  };
}

async function startLocalNetworking() {
  if (localNetworkingStarted) return true;

  const serverEntry = path.join(__dirname, "../server/server.js");
  await import(pathToFileURL(serverEntry).href);
  localNetworkingStarted = true;
  return true;
}

function createWindow(options = {}) {
  const initiallyHidden = options.initiallyHidden === true;
  mainWindow = new BrowserWindow({
    width: APP_WINDOW_WIDTH,
    height: APP_WINDOW_HEIGHT,
    minWidth: APP_WINDOW_WIDTH,
    minHeight: APP_WINDOW_HEIGHT,
    show: !initiallyHidden,

    backgroundColor: "#08090c",
    title: APP_NAME,
    icon: getAppIconPath(),

    titleBarStyle: "hiddenInset",

    trafficLightPosition: {
      x: 18,
      y: 16,
    },

    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  mainWindow.loadURL(getAppEntryUrl());

  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ─── IPC Handlers ───────────────────────────────────────────────────────────
// All channel names use the orbitalshare: prefix intentionally — these are
// internal app-to-renderer strings, not network identifiers. The network
// service type (BONJOUR_SERVICE_TYPE = "airspace") is separate.

ipcMain.handle("orbitalshare:get-lan-receivers", () => getLanReceiverSnapshot());
ipcMain.handle("orbitalshare:get-lan-discovery-error", () => lastLanDiscoveryError);
ipcMain.handle("orbitalshare:set-receiver-presence", (_event, presence) =>
  setReceiverPresence(presence)
);
ipcMain.handle("orbitalshare:get-receiver-enabled", () => receiverEnabled);
ipcMain.handle("orbitalshare:set-receiver-enabled", (_event, enabled) =>
  setReceiverEnabled(enabled)
);
ipcMain.handle("orbitalshare:set-lan-discovery-active", (_event, active) =>
  setLanDiscoveryActive(active)
);
ipcMain.handle("orbitalshare:get-local-websocket-url", () => LOCAL_WEBSOCKET_URL);
ipcMain.handle("orbitalshare:toggle-tray-window", () => {
  toggleTrayWindow(getFallbackTrayButtonBounds());
  return true;
});
ipcMain.handle("orbitalshare:show-main-window", (_event, targetPath) => {
  showMainWindow(typeof targetPath === "string" ? targetPath : "");
  return true;
});
ipcMain.handle("orbitalshare:notify-incoming-transfer", (_event, request) =>
  showIncomingTransferNotification(request)
);
ipcMain.handle("orbitalshare:notify-transfer-progress", (_event, progress) =>
  showTransferProgressNotification(progress)
);
ipcMain.handle("orbitalshare:notify-transfer-complete", (_event, summary) =>
  showTransferCompletedNotification(summary)
);
ipcMain.handle("orbitalshare:save-received-files", (_event, files) =>
  saveReceivedFilesToDownloads(files)
);

// ─── Platform Signals ────────────────────────────────────────────────────────

if (process.platform === "darwin") {
  process.on("SIGUSR2", () => {
    toggleTrayWindow(getFallbackTrayButtonBounds());
  });
}

app.on("second-instance", (_event, commandLine) => {
  if (isTrayPopupLaunch(commandLine)) {
    showTrayPopupOnly();
    return;
  }

  showMainWindow();
});

// ─── App Lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  const shouldOpenTrayPopupOnly = isTrayPopupLaunch();
  const loginSettings =
    process.platform === "darwin" ? app.getLoginItemSettings() : {};
  const shouldOpenHiddenRuntime =
    isHiddenRuntimeLaunch() ||
    loginSettings.wasOpenedAsHidden === true ||
    loginSettings.wasOpenedAtLogin === true;

  configureDockIcon();
  configureLoginItem();
  receiverEnabled = loadReceiverEnabledPreference();
  createTray();
  verifyTrayStatusItem();

  if (shouldOpenTrayPopupOnly) {
    ensureHiddenRuntimeWindow();
    await startLocalNetworking();
    showTrayPopupOnly();
  } else if (shouldOpenHiddenRuntime) {
    ensureHiddenRuntimeWindow();
    await startLocalNetworking();
  } else {
    createWindow();
    await startLocalNetworking();
  }

  broadcastReceiverEnabled();

  app.on("activate", () => {
    if (!mainWindow) {
      createWindow();
      return;
    }

    showMainWindow();
  });
});

// ─── Power Monitor ───────────────────────────────────────────────────────────

if (powerMonitor) {
  powerMonitor.on("resume", () => {
    verifyTrayStatusItem();

    if (lanDiscoveryActive) {
      stopBonjourDiscovery();
      startBonjourDiscovery();
    }

    if (receiverEnabled && lastReceiverPresence) {
      stopPublishedReceiverService();
      setReceiverPresence(lastReceiverPresence);
    }

    sendToRenderer("orbitalshare:runtime-resume", {
      receiverEnabled,
      lanDiscoveryActive,
    });
  });
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

app.on("before-quit", () => {
  isQuitting = true;
  stopPublishedReceiverService();
  stopBonjourDiscovery();
  stopLanReceiverSweep();
  localNetworkingStarted = false;
  trayWindow?.destroy();
  trayWindow = null;
  tray?.destroy();
  tray = null;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
