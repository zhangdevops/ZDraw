import { app, BrowserWindow, dialog, ipcMain, Menu, session } from 'electron';
import { join } from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import {
  atomicWrite,
  DraftStore,
  MAX_DOCUMENT_BYTES,
  toExcalidrawPath,
  validateDocument,
} from './storage';
import type { DocumentAction, Draft } from '../shared/types';

let window: BrowserWindow;
let activePath: string | null = null;
let dirty = false;
let mayClose = false;
let closePending = false;
const authorizedPaths = new Set<string>();

// 只接受应用主窗口发起的本地操作。
function assertSender(event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent): void {
  if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
    throw new Error('无效的窗口请求。');
  }
}

// 从原生菜单向画布发送文档命令。
function sendAction(action: DocumentAction): void {
  window.webContents.send('document:action', action);
}

// 注册限定的文件接口，不向页面暴露任意文件系统访问。
function registerHandlers(drafts: DraftStore): void {
  ipcMain.handle('window:is-full-screen', (event) => {
    assertSender(event);
    return window.isFullScreen();
  });
  ipcMain.handle('window:exit-full-screen', (event) => {
    assertSender(event);
    window.setFullScreen(false);
  });
  ipcMain.handle('document:open', async (event) => {
    assertSender(event);
    const result = await dialog.showOpenDialog(window, {
      title: '打开图纸',
      filters: [
        { name: '支持的图纸', extensions: ['excalidraw', 'zdraw'] },
        { name: 'Excalidraw 图纸', extensions: ['excalidraw'] },
        { name: 'ZDraw 旧版图纸', extensions: ['zdraw'] },
      ],
      properties: ['openFile'],
    });
    if (result.canceled) {
      return null;
    }
    const filePath = result.filePaths[0];
    const info = await stat(filePath);
    if (info.size > MAX_DOCUMENT_BYTES) {
      throw new Error('暂不支持超过 100 MB 的图纸。');
    }
    const content = await readFile(filePath, 'utf8');
    validateDocument(content);
    authorizedPaths.add(filePath);
    return { filePath, content };
  });

  ipcMain.handle('document:activate', (event, filePath: string | null) => {
    assertSender(event);
    if (filePath !== null && !authorizedPaths.has(filePath)) {
      throw new Error('文件尚未由用户打开。');
    }
    activePath = filePath;
  });

  ipcMain.handle('document:save', async (event, content: string, saveAs: boolean) => {
    assertSender(event);
    validateDocument(content);
    let filePath = activePath;
    if (saveAs || !filePath || !/\.excalidraw$/i.test(filePath)) {
      const result = await dialog.showSaveDialog(window, {
        title: '保存图纸',
        defaultPath: activePath ? toExcalidrawPath(activePath) : '未命名图纸.excalidraw',
        filters: [{ name: 'Excalidraw 图纸', extensions: ['excalidraw'] }],
      });
      if (result.canceled || !result.filePath) {
        return null;
      }
      filePath = toExcalidrawPath(result.filePath);
      if (filePath !== result.filePath) {
        const targetExists = await stat(filePath).then(
          () => true,
          (error: NodeJS.ErrnoException) => {
            if (error.code === 'ENOENT') {
              return false;
            }
            throw error;
          }
        );
        if (targetExists) {
          const confirmation = await dialog.showMessageBox(window, {
            type: 'warning',
            title: '替换已有图纸',
            message: '目标 Excalidraw 文件已存在，是否替换？',
            detail: filePath,
            buttons: ['替换', '取消'],
            defaultId: 1,
            cancelId: 1,
          });
          if (confirmation.response !== 0) {
            return null;
          }
        }
      }
    }
    await atomicWrite(filePath, content);
    activePath = filePath;
    authorizedPaths.add(filePath);
    return filePath;
  });

  ipcMain.handle('document:export', async (event, format: 'png' | 'svg', data: Uint8Array) => {
    assertSender(event);
    if (!['png', 'svg'].includes(format) || !(data instanceof Uint8Array)) {
      throw new Error('不支持的导出格式。');
    }
    if (data.byteLength > MAX_DOCUMENT_BYTES) {
      throw new Error('导出文件超过 100 MB。');
    }
    const result = await dialog.showSaveDialog(window, {
      title: `导出 ${format.toUpperCase()}`,
      defaultPath: `ZDraw.${format}`,
      filters: [{ name: format.toUpperCase(), extensions: [format] }],
    });
    if (result.canceled || !result.filePath) {
      return null;
    }
    await atomicWrite(result.filePath, data);
    return result.filePath;
  });

  ipcMain.handle('draft:read', async (event) => {
    assertSender(event);
    const draft = await drafts.read();
    if (draft?.filePath) {
      authorizedPaths.add(draft.filePath);
      activePath = draft.filePath;
    }
    return draft;
  });

  ipcMain.handle('draft:write', async (event, draft: Draft) => {
    assertSender(event);
    await drafts.write({ ...draft, filePath: activePath });
  });

  ipcMain.handle('document:confirm-discard', async (event) => {
    assertSender(event);
    const result = await dialog.showMessageBox(window, {
      type: 'question',
      title: '保存更改',
      message: '当前图纸有未保存的更改。',
      detail: '是否先保存到图纸文件？选择“不保存”不会更新图纸文件；关闭时仍保留恢复副本。',
      buttons: ['保存', '不保存', '取消'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    });
    return ['save', 'discard', 'cancel'][result.response];
  });

  ipcMain.on('document:dirty', (event, value: boolean) => {
    assertSender(event);
    dirty = Boolean(value);
  });
  ipcMain.on('window:title', (event, title: string) => {
    assertSender(event);
    window.setTitle(String(title).slice(0, 300));
  });
  ipcMain.on('window:close-ready', (event) => {
    assertSender(event);
    mayClose = true;
    window.close();
  });
}

// 构建中文菜单，文件快捷键统一进入应用保存流程。
function createMenu(): void {
  const menu = Menu.buildFromTemplate([
    {
      label: '文件',
      submenu: [
        { label: '新建图纸', accelerator: 'CmdOrCtrl+N', click: () => sendAction('new') },
        { label: '打开图纸…', accelerator: 'CmdOrCtrl+O', click: () => sendAction('open') },
        { type: 'separator' },
        { label: '保存', accelerator: 'CmdOrCtrl+S', click: () => sendAction('save') },
        { label: '另存为…', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendAction('saveAs') },
        { type: 'separator' },
        { label: '导出 PNG…', click: () => sendAction('png') },
        { label: '导出 SVG…', click: () => sendAction('svg') },
        { type: 'separator' },
        { label: '退出', role: 'close' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '全屏', role: 'togglefullscreen' },
        { label: '开发者工具', role: 'toggleDevTools' },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);
}

// 加载打包后的本地界面，并禁止生产版本访问外部网络。
async function createWindow(): Promise<void> {
  window = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: '#f7f8fa',
    title: 'ZDraw',
    icon: join(app.getAppPath(), 'build', 'icon.ico'),
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.on('enter-full-screen', () => {
    window.webContents.send('window:full-screen-change', true);
  });
  window.on('leave-full-screen', () => {
    window.webContents.send('window:full-screen-change', false);
  });
  window.webContents.on('before-input-event', (event, input) => {
    // 全屏时优先退出窗口全屏，避免同一个 Esc 继续取消画布中的编辑。
    if (input.type === 'keyDown' && input.key === 'Escape' && window.isFullScreen()) {
      event.preventDefault();
      window.setFullScreen(false);
    }
  });
  window.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
  window.on('close', (event) => {
    if (mayClose) {
      return;
    }
    event.preventDefault();
    if (!closePending) {
      closePending = true;
      window.webContents.send('window:close-request', dirty);
      setTimeout(() => {
        closePending = false;
      }, 1000);
    }
  });
  window.once('ready-to-show', () => {
    window.show();
  });
  const developmentUrl = process.env.ELECTRON_RENDERER_URL;
  if (developmentUrl) {
    await window.loadURL(developmentUrl);
  } else {
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      const external = /^(https?|wss?):/i.test(details.url);
      callback({ cancel: external });
    });
    await window.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

// 初始化单实例桌面应用和草稿目录。
async function start(): Promise<void> {
  if (process.env.ZDRAW_USER_DATA) {
    app.setPath('userData', process.env.ZDRAW_USER_DATA);
  }
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  app.on('second-instance', () => {
    if (window?.isMinimized()) {
      window.restore();
    }
    window?.focus();
  });
  await app.whenReady();
  app.setAppUserModelId('com.zdraw.desktop');
  const drafts = new DraftStore(join(app.getPath('userData'), 'recovery', 'current.json'));
  registerHandlers(drafts);
  createMenu();
  await createWindow();
}

app.on('window-all-closed', () => {
  app.quit();
});

start().catch((error) => {
  dialog.showErrorBox('ZDraw 启动失败', String(error));
  app.exit(1);
});
