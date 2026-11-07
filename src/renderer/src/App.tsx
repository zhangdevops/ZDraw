import { useEffect, useRef, useState } from 'react';
import {
  Excalidraw,
  MainMenu,
  exportToBlob,
  exportToSvg,
  loadFromBlob,
  serializeAsJSON,
} from '@excalidraw/excalidraw';
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { DocumentAction, Draft } from '../../shared/types';

interface EditorSession {
  id: number;
  initialData: ExcalidrawInitialDataState;
}

// 统一显示文件名，同时兼容 Windows 和其他平台路径。
function fileName(filePath: string | null): string {
  if (!filePath) {
    return '未命名图纸';
  }
  return filePath.split(/[\\/]/).pop() ?? '未命名图纸';
}

// 将底层错误转换为可读提示，文件保存失败时保留当前画布。
function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function App() {
  // 文档快照使用引用保存，避免每次指针移动都触发 React 渲染。
  const api = useRef<ExcalidrawImperativeAPI | null>(null);
  const content = useRef('');
  const savedContent = useRef<string | null>(null);
  const activePath = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locked = useRef(false);
  const booted = useRef(false);
  const sessionNumber = useRef(0);
  const [session, setSession] = useState<EditorSession | null>(null);
  const [documentName, setDocumentName] = useState('未命名图纸');
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState('正在加载本地画布…');
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);

  async function exitFullScreen(): Promise<void> {
    // 通过桌面接口退出全屏，失败时向用户显示原因。
    try {
      await window.zdraw.exitFullScreen();
    } catch (cause) {
      setError(`退出全屏失败：${errorMessage(cause)}`);
    }
  }

  useEffect(() => {
    // 先订阅再获取初始状态，避免菜单切换与初始化发生竞争。
    let active = true;
    let receivedChange = false;
    const unsubscribe = window.zdraw.onFullScreenChange((value) => {
      receivedChange = true;
      setFullScreen(value);
    });
    void window.zdraw
      .isFullScreen()
      .then((value) => {
        if (active && !receivedChange) {
          setFullScreen(value);
        }
      })
      .catch((cause) => {
        if (active) {
          setError(`获取全屏状态失败：${errorMessage(cause)}`);
        }
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  function updateDirty(value: boolean): void {
    // 同步界面与原生窗口的保存状态。
    dirtyRef.current = value;
    setDirty(value);
    window.zdraw.setDirty(value);
    const prefix = value ? '● ' : '';
    window.zdraw.setTitle(`${prefix}${fileName(activePath.current)} — ZDraw`);
  }

  async function flushDraft(): Promise<void> {
    // 关闭、切换文档和自动保存共用一条草稿写入路径。
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (!content.current) {
      return;
    }
    const draft: Draft = {
      content: content.current,
      filePath: activePath.current,
      dirty: dirtyRef.current,
      updatedAt: new Date().toISOString(),
    };
    await window.zdraw.writeDraft(draft);
    setStatus('恢复副本已更新');
  }

  function onChange(
    elements: readonly ExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles
  ): void {
    // 序列化图形及内嵌图片，忽略仅与选中状态有关的变化。
    const next = serializeAsJSON(elements, appState, files, 'local');
    if (next === content.current) {
      return;
    }
    const initialChange = !content.current;
    content.current = next;
    if (initialChange && !dirtyRef.current) {
      savedContent.current = next;
    }
    updateDirty(next !== savedContent.current);
    setCount(elements.filter((element) => !element.isDeleted).length);
    setStatus('正在更新恢复副本…');
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => {
      void flushDraft().catch((cause) => {
        setError(`自动恢复副本保存失败：${errorMessage(cause)}`);
        setStatus('恢复副本保存失败');
      });
    }, 700);
  }

  async function installDocument(
    data: ExcalidrawInitialDataState,
    filePath: string | null,
    isDirty: boolean
  ): Promise<void> {
    // 更换编辑器实例，避免上一个文档的撤销历史和图片残留。
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    await window.zdraw.setActiveDocument(filePath);
    activePath.current = filePath;
    content.current = '';
    savedContent.current = null;
    api.current = null;
    sessionNumber.current += 1;
    setDocumentName(fileName(filePath));
    updateDirty(isDirty);
    setCount(0);
    setSession({ id: sessionNumber.current, initialData: data });
  }

  async function save(saveAs = false): Promise<boolean> {
    // 保存调用时的快照，编辑中产生的新变更仍保持未保存状态。
    if (!content.current) {
      return false;
    }
    const snapshot = content.current;
    const filePath = await window.zdraw.saveDocument(snapshot, saveAs);
    if (!filePath) {
      return false;
    }
    activePath.current = filePath;
    savedContent.current = snapshot;
    setDocumentName(fileName(filePath));
    updateDirty(content.current !== snapshot);
    await flushDraft();
    setStatus('图纸已保存到本地');
    return true;
  }

  async function mayLeave(): Promise<boolean> {
    // 新建、打开和退出时保护尚未正式保存的编辑。
    if (!dirtyRef.current) {
      return true;
    }
    const answer = await window.zdraw.confirmDiscard();
    if (answer === 'cancel') {
      return false;
    }
    if (answer === 'save') {
      return await save();
    }
    return true;
  }

  async function exportImage(format: 'png' | 'svg'): Promise<void> {
    // 使用编辑器导出接口，保留内嵌图片并采用白色背景。
    const editor = api.current;
    if (!editor) {
      return;
    }
    const elements = editor.getSceneElements();
    if (elements.length === 0) {
      setStatus('先在画布上画点内容，再导出图片');
      return;
    }
    const options = {
      elements,
      appState: { ...editor.getAppState(), exportBackground: true, exportWithDarkMode: false },
      files: editor.getFiles(),
    };
    let data: Uint8Array;
    if (format === 'png') {
      const blob = await exportToBlob({ ...options, mimeType: 'image/png' });
      data = new Uint8Array(await blob.arrayBuffer());
    } else {
      const svg = await exportToSvg(options);
      data = new TextEncoder().encode(svg.outerHTML);
    }
    const filePath = await window.zdraw.exportDocument(format, data);
    if (filePath) {
      setStatus(`已导出 ${format.toUpperCase()}：${fileName(filePath)}`);
    }
  }

  async function execute(action: DocumentAction | 'close'): Promise<void> {
    // 阻止重复弹窗和文档命令交叉执行。
    if (locked.current || !booted.current) {
      return;
    }
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      if (action === 'save' || action === 'saveAs') {
        await save(action === 'saveAs');
      } else if (action === 'png' || action === 'svg') {
        await exportImage(action);
      } else if (action === 'open') {
        if (!(await mayLeave())) {
          return;
        }
        const opened = await window.zdraw.openDocument();
        if (!opened) {
          return;
        }
        const restored = await loadFromBlob(new Blob([opened.content]), null, null);
        await installDocument(restored, opened.filePath, false);
        setStatus('已打开本地图纸');
      } else if (action === 'new') {
        if (!(await mayLeave())) {
          return;
        }
        await installDocument(
          { elements: [], appState: { viewBackgroundColor: '#ffffff' } },
          null,
          false
        );
        setStatus('新图纸已就绪');
      } else if (action === 'close') {
        if (!(await mayLeave())) {
          return;
        }
        await flushDraft();
        window.zdraw.closeReady();
      }
    } catch (cause) {
      setError(errorMessage(cause));
      setStatus('操作未完成，当前图纸仍保留');
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  useEffect(() => {
    // 启动时恢复上次工作，不自动覆盖正式图纸文件。
    async function initialize(): Promise<void> {
      try {
        const draft = await window.zdraw.readDraft();
        if (draft) {
          const restored = await loadFromBlob(new Blob([draft.content]), null, null);
          await installDocument(restored, draft.filePath, draft.dirty);
          setStatus('已恢复上次工作');
        } else {
          await installDocument(
            { elements: [], appState: { viewBackgroundColor: '#ffffff' } },
            null,
            false
          );
          setStatus('本地画布已就绪');
        }
      } catch (cause) {
        setError(errorMessage(cause));
        await installDocument({ elements: [] }, null, false);
      }
      booted.current = true;
    }
    void initialize();
  }, []);

  useEffect(() => {
    // 原生菜单和标题栏按钮使用相同的文档操作。
    const removeAction = window.zdraw.onAction((action) => {
      void execute(action);
    });
    const removeClose = window.zdraw.onCloseRequest(() => {
      void execute('close');
    });
    return () => {
      removeAction();
      removeClose();
    };
  });

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand" aria-label="ZDraw 离线白板">
          <img className="brand-mark" src="./zdraw.svg" alt="" />
          <div>
            <strong>ZDraw</strong>
            <span>把想法，画出来。</span>
          </div>
        </div>
        <div className="document-info" title={activePath.current ?? '尚未保存到文件'}>
          <span className={`document-dot ${dirty ? 'unsaved' : ''}`} />
          <span className="document-name">{documentName}</span>
          <span className="save-state">{dirty ? '未保存' : '已就绪'}</span>
        </div>
        <div className="header-actions">
          <button disabled={busy || !session} onClick={() => void execute('new')}>
            新建
          </button>
          <button disabled={busy || !session} onClick={() => void execute('open')}>
            打开
          </button>
          <button
            className="primary"
            disabled={busy || !session}
            onClick={() => void execute('save')}
          >
            保存 <kbd>Ctrl S</kbd>
          </button>
          <span className="action-divider" />
          <button disabled={busy || !session} onClick={() => void execute('png')}>
            导出 PNG
          </button>
          <button disabled={busy || !session} onClick={() => void execute('svg')}>
            SVG
          </button>
          {fullScreen && (
            <button
              className="fullscreen-exit"
              onClick={() => void exitFullScreen()}
              title="退出全屏（Esc）"
              aria-label="退出全屏"
            >
              退出全屏 <kbd>Esc</kbd>
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button onClick={() => setError(null)}>关闭提示</button>
        </div>
      )}

      <section className="canvas-shell" aria-label="绘图画布">
        {session && (
          <Excalidraw
            key={session.id}
            initialData={session.initialData}
            excalidrawAPI={(editor) => {
              api.current = editor;
            }}
            onChange={onChange}
            langCode="zh-CN"
            theme="light"
            name={documentName.replace(/\.(zdraw|excalidraw)$/i, '')}
            autoFocus
            handleKeyboardGlobally
            validateEmbeddable={false}
            onLinkOpen={(_element, event) => {
              event.preventDefault();
            }}
            UIOptions={{
              canvasActions: {
                loadScene: false,
                saveToActiveFile: false,
                export: false,
                toggleTheme: false,
              },
            }}
          >
            <MainMenu>
              <MainMenu.Item onSelect={() => void execute('new')}>新建图纸</MainMenu.Item>
              <MainMenu.Item onSelect={() => void execute('open')}>打开本地图纸</MainMenu.Item>
              <MainMenu.Item onSelect={() => void execute('saveAs')}>另存为…</MainMenu.Item>
              <MainMenu.Separator />
              <MainMenu.DefaultItems.ChangeCanvasBackground />
            </MainMenu>
          </Excalidraw>
        )}
        {session && count === 0 && (
          <div className="empty-hint" aria-hidden="true">
            <div className="hint-sketch">
              <span className="sketch-box" />
              <span className="sketch-line">→</span>
              <span className="sketch-circle" />
            </div>
            <h1>让想法有个形状</h1>
            <p>画一个框，连一条线。从这里开始。</p>
            <div className="hint-keys">
              <span>
                <kbd>R</kbd> 矩形
              </span>
              <span>
                <kbd>A</kbd> 箭头
              </span>
              <span>
                <kbd>T</kbd> 文字
              </span>
              <span>
                <kbd>P</kbd> 自由画笔
              </span>
            </div>
          </div>
        )}
      </section>

      <footer className="status-bar">
        <div className="offline-label">
          <span /> 完全离线 · 文件留在本机
        </div>
        <div className="status-message" role="status">
          {status}
        </div>
        <div>
          {count} 个元素<span className="footer-divider">/</span>按住空格拖动画布
        </div>
      </footer>
    </main>
  );
}
