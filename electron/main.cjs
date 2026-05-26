const { app, BrowserWindow } = require('electron');
const path = require('path');

/** Keep in sync with src/components/layout/AppWindow.tsx */
const APP_WINDOW_WIDTH = 1080;
const APP_WINDOW_HEIGHT = 760;

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: APP_WINDOW_WIDTH,
    height: APP_WINDOW_HEIGHT,
    minWidth: APP_WINDOW_WIDTH,
    minHeight: APP_WINDOW_HEIGHT,

    backgroundColor: '#08090c',

    titleBarStyle: 'hiddenInset',

    trafficLightPosition: {
      x: 18,
      y: 16,
    },

    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const isDev = !app.isPackaged;

  if (isDev) {
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
