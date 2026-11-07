import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi, DocumentAction, Draft } from '../shared/types';

// 通过白名单桥接文件功能，保持画布与 Node.js 环境隔离。
const api: DesktopApi = {
  openDocument: () => ipcRenderer.invoke('document:open'),
  saveDocument: (content, saveAs) => ipcRenderer.invoke('document:save', content, saveAs),
  exportDocument: (format, data) => ipcRenderer.invoke('document:export', format, data),
  readDraft: () => ipcRenderer.invoke('draft:read'),
  writeDraft: (draft: Draft) => ipcRenderer.invoke('draft:write', draft),
  setActiveDocument: (filePath) => ipcRenderer.invoke('document:activate', filePath),
  confirmDiscard: () => ipcRenderer.invoke('document:confirm-discard'),
  setDirty: (dirty) => ipcRenderer.send('document:dirty', dirty),
  setTitle: (title) => ipcRenderer.send('window:title', title),
  closeReady: () => ipcRenderer.send('window:close-ready'),
  isFullScreen: () => ipcRenderer.invoke('window:is-full-screen'),
  exitFullScreen: () => ipcRenderer.invoke('window:exit-full-screen'),
  onFullScreenChange: (callback) => {
    // 同步菜单或 F11 引起的窗口状态变化。
    const listener = (_event: Electron.IpcRendererEvent, fullScreen: boolean) => {
      callback(fullScreen);
    };
    ipcRenderer.on('window:full-screen-change', listener);
    return () => ipcRenderer.removeListener('window:full-screen-change', listener);
  },
  onAction: (callback) => {
    // 返回清理函数，防止组件重挂载后重复处理菜单命令。
    const listener = (_event: Electron.IpcRendererEvent, action: DocumentAction) => {
      callback(action);
    };
    ipcRenderer.on('document:action', listener);
    return () => ipcRenderer.removeListener('document:action', listener);
  },
  onCloseRequest: (callback) => {
    // 由界面先保存恢复副本，再允许窗口关闭。
    const listener = () => callback();
    ipcRenderer.on('window:close-request', listener);
    return () => ipcRenderer.removeListener('window:close-request', listener);
  },
};

contextBridge.exposeInMainWorld('zdraw', api);
