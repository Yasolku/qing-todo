const { app, BrowserWindow, Menu, Tray, ipcMain, screen, nativeImage, protocol, net } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { randomUUID } = require('crypto');
const Store = require('electron-store');

protocol.registerSchemesAsPrivileged([{
  scheme: 'qing-todo',
  privileges: { standard: true, secure: true, codeCache: true }
}]);

const ALLOWED_STORE_KEYS = new Set(['tasks', 'theme', 'alwaysOnTop', 'appearance']);
const MAX_TASKS = 500;
const MAX_TASK_LENGTH = 300;
const APP_ROOT = path.resolve(__dirname, '..');
const PROTOCOL_ROOTS = [
  path.join(APP_ROOT, 'src', 'renderer'),
  path.join(APP_ROOT, 'assets')
];

// Initialize store for settings
const store = new Store({
  defaults: {
    windowBounds: { width: 320, height: 480, x: 100, y: 100 },
    alwaysOnTop: true,
    theme: 'dark',
    appearance: 'midnight',
    tasks: []
  }
});

function sanitizeTasks(value) {
  if (!Array.isArray(value)) return [];

  const seenIds = new Set();
  return value.slice(0, MAX_TASKS).flatMap(task => {
    if (!task || typeof task !== 'object') return [];
    if (typeof task.text !== 'string') return [];

    const text = task.text.trim().slice(0, MAX_TASK_LENGTH);
    if (!text) return [];

    const suppliedId = typeof task.id === 'string' ? task.id : '';
    const id = /^[A-Za-z0-9_-]{1,100}$/.test(suppliedId) && !seenIds.has(suppliedId)
      ? suppliedId
      : randomUUID();
    seenIds.add(id);

    const createdDate = typeof task.createdAt === 'string' && !Number.isNaN(Date.parse(task.createdAt))
      ? new Date(task.createdAt).toLocaleDateString('sv-SE')
      : new Date().toLocaleDateString('sv-SE');
    const dueDate = typeof task.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(task.dueDate)
      ? task.dueDate
      : createdDate;

    return [{
      id,
      text,
      completed: task.completed === true,
      createdAt: typeof task.createdAt === 'string' ? task.createdAt : new Date().toISOString(),
      completedAt: typeof task.completedAt === 'string' ? task.completedAt : null,
      dueDate
    }];
  });
}

function normalizeBounds(bounds) {
  const workArea = screen.getPrimaryDisplay().workArea;
  const raw = bounds && typeof bounds === 'object' ? bounds : {};
  const width = Math.min(400, Math.max(280, Number(raw.width) || 320));
  const height = Math.min(workArea.height, Math.max(400, Number(raw.height) || 480));
  const x = Math.min(workArea.x + workArea.width - width, Math.max(workArea.x, Number(raw.x) || workArea.x + 100));
  const y = Math.min(workArea.y + workArea.height - height, Math.max(workArea.y, Number(raw.y) || workArea.y + 100));
  return { width, height, x, y };
}

function registerAppProtocol() {
  protocol.handle('qing-todo', request => {
    const requestUrl = new URL(request.url);
    if (requestUrl.hostname !== 'app') return new Response('Not found', { status: 404 });

    const relativePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '');
    const resolvedPath = path.resolve(APP_ROOT, relativePath);
    const isAllowedResource = PROTOCOL_ROOTS.some(root =>
      resolvedPath === root || resolvedPath.startsWith(`${root}${path.sep}`)
    );
    if (!isAllowedResource) {
      return new Response('Forbidden', { status: 403 });
    }
    return net.fetch(pathToFileURL(resolvedPath).href);
  });
}

let mainWindow;
let tray;
let isQuitting = false;
let savedHeight = 480;
const COMPACT_HEIGHT = 84;
let trustedRendererUrl = null;

function assertTrustedSender(event) {
  const senderUrl = event.senderFrame?.url;
  if (!trustedRendererUrl || senderUrl !== trustedRendererUrl) {
    throw new Error('Rejected IPC call from an untrusted renderer');
  }
}

function createWindow() {
  // Get stored window bounds or use defaults
  const bounds = normalizeBounds(store.get('windowBounds'));
  const alwaysOnTop = store.get('alwaysOnTop', true);

  // Create the browser window
  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 280,
    maxWidth: 400,
    minHeight: 400,
    frame: false,
    transparent: true,
    alwaysOnTop: alwaysOnTop,
    resizable: true,
    skipTaskbar: false,
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'), // Set application icon
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Load the app
  const rendererUrl = 'qing-todo://app/src/renderer/index.html';
  trustedRendererUrl = rendererUrl;
  mainWindow.loadURL(rendererUrl);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (targetUrl !== rendererUrl) event.preventDefault();
  });

  // Aggressively enforce always on top and workspaces
  if (alwaysOnTop) {
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
  }
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Handle window events
  mainWindow.on('close', (event) => {
    // Save window bounds
    if (mainWindow) {
      const bounds = mainWindow.getBounds();
      store.set('windowBounds', bounds);
    }

    if (!isQuitting) {
      isQuitting = true;
      app.quit();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Make window draggable from anywhere
  mainWindow.setMovable(true);

  // Development tools
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

function createTray() {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.ico');
  let trayIcon;

  try {
    trayIcon = nativeImage.createFromPath(iconPath);

    if (trayIcon.isEmpty()) {
      console.log('No valid icon found for tray');
      return;
    }

    tray = new Tray(trayIcon);

    const contextMenu = Menu.buildFromTemplate([
      {
        label: '显示轻待办',
        click: () => {
          if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
        }
      },
      {
        label: '退出',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]);

    tray.setToolTip('轻待办');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
      }
    });

  } catch (error) {
    console.error('Failed to create tray:', error);
  }
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, focus our existing window instead.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });

  // App event handlers
  app.whenReady().then(() => {
    app.setAppUserModelId('app.qingtodo.desktop');
    registerAppProtocol();
    if (process.platform === 'darwin') {
    app.dock.hide();
  }
  
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      // Keep running in tray
    }
  });
}

// IPC handlers
ipcMain.handle('get-store-value', (event, key, defaultValue) => {
  assertTrustedSender(event);
  if (!ALLOWED_STORE_KEYS.has(key)) throw new Error('Unsupported store key');
  return store.get(key, defaultValue);
});

ipcMain.handle('set-store-value', (event, key, value) => {
  assertTrustedSender(event);
  if (!ALLOWED_STORE_KEYS.has(key)) throw new Error('Unsupported store key');
  if (key === 'tasks') store.set(key, sanitizeTasks(value));
  if (key === 'theme' && (value === 'dark' || value === 'light')) store.set(key, value);
  if (key === 'alwaysOnTop' && typeof value === 'boolean') store.set(key, value);
  if (key === 'appearance' && ['midnight', 'snow', 'rose', 'ocean', 'sunset', 'custom'].includes(value)) store.set(key, value);
  return true;
});

ipcMain.handle('toggle-always-on-top', (event) => {
  assertTrustedSender(event);
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  const current = mainWindow.isAlwaysOnTop();
  if (!current) {
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
  } else {
    mainWindow.setAlwaysOnTop(false);
  }
  store.set('alwaysOnTop', !current);
  return !current;
});

ipcMain.handle('close-window', (event) => {
  assertTrustedSender(event);
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
});

ipcMain.handle('set-compact-mode', (event, isCompact) => {
  assertTrustedSender(event);
  if (!mainWindow || mainWindow.isDestroyed() || typeof isCompact !== 'boolean') return;
  const bounds = mainWindow.getBounds();
  if (isCompact) {
    savedHeight = bounds.height;
    mainWindow.setMinimumSize(280, COMPACT_HEIGHT);
    mainWindow.setMaximumSize(400, COMPACT_HEIGHT);
    mainWindow.setSize(bounds.width, COMPACT_HEIGHT, false);
    mainWindow.setResizable(false);
  } else {
    mainWindow.setResizable(true);
    mainWindow.setMaximumSize(400, 10000);
    mainWindow.setMinimumSize(280, 400);
    mainWindow.setSize(bounds.width, Math.max(400, savedHeight), false);
  }
  return isCompact;
});

