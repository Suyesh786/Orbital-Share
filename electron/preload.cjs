const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("orbitalShareDesktop", {
  getLanReceivers: () => ipcRenderer.invoke("orbitalshare:get-lan-receivers"),
  getLanDiscoveryError: () =>
    ipcRenderer.invoke("orbitalshare:get-lan-discovery-error"),
  setReceiverPresence: (presence) =>
    ipcRenderer.invoke("orbitalshare:set-receiver-presence", presence),
  getReceiverEnabled: () => ipcRenderer.invoke("orbitalshare:get-receiver-enabled"),
  setReceiverEnabled: (enabled) =>
    ipcRenderer.invoke("orbitalshare:set-receiver-enabled", enabled),
  setLanDiscoveryActive: (active) =>
    ipcRenderer.invoke("orbitalshare:set-lan-discovery-active", active),
  getLocalWebSocketUrl: () =>
    ipcRenderer.invoke("orbitalshare:get-local-websocket-url"),
  toggleTrayWindow: () => ipcRenderer.invoke("orbitalshare:toggle-tray-window"),
  showMainWindow: (targetPath) =>
    ipcRenderer.invoke("orbitalshare:show-main-window", targetPath),
  showIncomingTransferNotification: (request) =>
    ipcRenderer.invoke("orbitalshare:notify-incoming-transfer", request),
  showTransferProgressNotification: (progress) =>
    ipcRenderer.invoke("orbitalshare:notify-transfer-progress", progress),
  showTransferCompletedNotification: (summary) =>
    ipcRenderer.invoke("orbitalshare:notify-transfer-complete", summary),
  saveReceivedFilesToDownloads: (files) =>
    ipcRenderer.invoke("orbitalshare:save-received-files", files),
  onLanReceivers(listener) {
    const wrapped = (_event, receivers) => {
      listener(receivers);
    };

    ipcRenderer.on("orbitalshare:lan-receivers", wrapped);
    return () => {
      ipcRenderer.removeListener("orbitalshare:lan-receivers", wrapped);
    };
  },
  onLanDiscoveryError(listener) {
    const wrapped = (_event, payload) => {
      listener(payload);
    };

    ipcRenderer.on("orbitalshare:lan-discovery-error", wrapped);
    return () => {
      ipcRenderer.removeListener("orbitalshare:lan-discovery-error", wrapped);
    };
  },
  onReceiverEnabledChanged(listener) {
    const wrapped = (_event, enabled) => {
      listener(enabled);
    };

    ipcRenderer.on("orbitalshare:receiver-enabled-changed", wrapped);
    return () => {
      ipcRenderer.removeListener("orbitalshare:receiver-enabled-changed", wrapped);
    };
  },
  onNavigateRequest(listener) {
    const wrapped = (_event, targetPath) => {
      listener(targetPath);
    };

    ipcRenderer.on("orbitalshare:navigate", wrapped);
    return () => {
      ipcRenderer.removeListener("orbitalshare:navigate", wrapped);
    };
  },
  onIncomingTransferNotificationAction(listener) {
    const wrapped = (_event, payload) => {
      listener(payload);
    };

    ipcRenderer.on("orbitalshare:incoming-transfer-action", wrapped);
    return () => {
      ipcRenderer.removeListener("orbitalshare:incoming-transfer-action", wrapped);
    };
  },
  onRuntimeResume(listener) {
    const wrapped = (_event, payload) => {
      listener(payload);
    };

    ipcRenderer.on("orbitalshare:runtime-resume", wrapped);
    return () => {
      ipcRenderer.removeListener("orbitalshare:runtime-resume", wrapped);
    };
  },
});
