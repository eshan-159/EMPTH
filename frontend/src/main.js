import './env.js';
import { app, BrowserWindow, globalShortcut, ipcMain, screen, systemPreferences, Tray, Menu, nativeImage } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRELOAD_PATH = path.join(__dirname, 'preload.cjs');

const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL || 'http://127.0.0.1:3001';
const SHORTCUT = process.env.ELECTRON_SHORTCUT || 'CommandOrControl+Space';
const FALLBACK_SHORTCUT = 'CommandOrControl+Shift+Space';
const EXTRA_SHORTCUT = 'CommandOrControl+Alt+Space';

let win;
let bubbleWin; // Floating persistent icon
let tray = null;
let suppressBlurHideUntil = 0;
let hasShownOnce = false;

function getWindowBounds(overrideHeight) {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const width = 720;
  // Use existing height if override not provided
  const height = overrideHeight || (win ? win.getBounds().height : 110);
  const x = Math.round(display.workArea.x + (display.workArea.width - width) / 2);
  const y = Math.round(display.workArea.y + 90);
  return { x, y, width, height };
}

function createBubble() {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  
  // Create a small floating window (40x40) in bottom-right corner
  bubbleWin = new BrowserWindow({
    width: 60,
    height: 60,
    x: width - 80,
    y: height - 80,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    movable: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false // Simplest for this tiny widget
    }
  });

  // Load a simple HTML with an icon that clicks to toggleWindow
  const html = `
    <html>
      <body style="margin:0; overflow:hidden; background: transparent;">
        <div style="
          width: 50px; 
          height: 50px; 
          background: #ff4444; 
          border-radius: 50%; 
          cursor: pointer; 
          border: 2px solid white; 
          box-shadow: 0 4px 6px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-family: system-ui;
          font-weight: bold;
          font-size: 24px;
        " onclick="require('electron').ipcRenderer.send('empth:toggle')">
          E
        </div>
      </body>
    </html>
  `;
  bubbleWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  bubbleWin.setAlwaysOnTop(true, 'floating');
  bubbleWin.setVisibleOnAllWorkspaces(true);
}


async function createWindow() {
  win = new BrowserWindow({
    ...getWindowBounds(),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: true,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: false, // Show in dock/taskbar so user can find it
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setAlwaysOnTop(true, 'floating');

  await win.loadFile(path.join(app.getAppPath(), 'renderer/index.html'));

  win.on('blur', () => {
    // behave like Spotlight: hide when losing focus
    if (!win?.isVisible()) return;
    if (Date.now() < suppressBlurHideUntil) return;
    win.hide();
  });
}

function createTray() {
  const iconPath = path.join(app.getAppPath(), 'icon.png');
  // fallback to base64 if file missing
  let icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) {
    icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAALEgAACxIB0t1+/AAAABZ0RVh0Q3JlYXRpb24gVGltZQAwMy8xOS8yNhPvOF4AAAAcdEVYdFNvZnR3YXJlAE1hY3JvbWVkaWEgRmlyZXdvcmtzIDQuNjaUpTIAAAA7SURBVHic7ckxAQAAAMKg9U9tCy8gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIA3A6QAAAFO7OIDAAAAAElFTkSuQmCC' // Blue 32x32
    );
  }
  
  // Resize to 16x16 (Mac standard) or 22x22
  icon = icon.resize({ width: 22, height: 22 });
  icon.setTemplateImage(false);

  // IMPORTANT: Assign to global tray variable
  tray = new Tray(icon);
  tray.setToolTip('Empth Assistant');
  tray.setTitle(' Empth'); // Add text to make it more visible
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Assistant', click: toggleWindow },
    { type: 'separator' },
    { label: 'Quit Empth', click: () => app.quit() }
  ]);
  
  tray.setContextMenu(contextMenu);
  
  // Toggle on click as well
  tray.on('click', toggleWindow);
}

function toggleWindow() {
  if (!win) return;
  if (win.isVisible()) {
    win.hide();
    return;
  }

  if (!hasShownOnce) {
    // On first launch, macOS may not grant focus immediately; avoid instant blur-hide.
    suppressBlurHideUntil = Date.now() + 5000;
    hasShownOnce = true;
  } else {
    suppressBlurHideUntil = Date.now() + 600;
  }
  win.setBounds(getWindowBounds());
  app.focus({ steal: true });
  win.show();
  win.focus();
  win.webContents.send('empth:shown');
}

app.whenReady().then(async () => {
  if (process.platform === 'darwin') {
    try {
      await systemPreferences.askForMediaAccess('microphone');
    } catch {
      // ignore
    }
  }

  ipcMain.handle('empth:get-config', async () => ({ backendBaseUrl: BACKEND_BASE_URL }));
  ipcMain.handle('empth:hide', async () => win?.hide());
  ipcMain.handle('empth:resize', async (e, height) => {
    if (win && !win.isDestroyed()) {
      win.setBounds(getWindowBounds(height));
    }
  });
  // Listen for bubble click
  ipcMain.on('empth:toggle', () => toggleWindow());

  await createWindow();
  createTray();
  createBubble(); // Add the bubble

  // Show app in Dock as well, to ensure user can find it
  if (process.platform === 'darwin') {
    app.dock.show();
  }

  const primaryOk = globalShortcut.register(SHORTCUT, toggleWindow);
  const fallbackOk = globalShortcut.register(FALLBACK_SHORTCUT, toggleWindow);
  const extraOk = globalShortcut.register(EXTRA_SHORTCUT, toggleWindow);
  console.log(`[empth] Backend: ${BACKEND_BASE_URL}`);
  console.log(`[empth] Shortcut primary (${SHORTCUT}): ${primaryOk ? 'OK' : 'FAILED'}`);
  console.log(`[empth] Shortcut fallback (${FALLBACK_SHORTCUT}): ${fallbackOk ? 'OK' : 'FAILED'}`);
  console.log(`[empth] Shortcut extra (${EXTRA_SHORTCUT}): ${extraOk ? 'OK' : 'FAILED'}`);

  // Show once on launch so you can verify the UI even if shortcuts are blocked.
  setTimeout(() => toggleWindow(), 250);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else toggleWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
