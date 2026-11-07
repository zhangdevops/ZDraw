import { createRoot } from 'react-dom/client';
import '@excalidraw/excalidraw/index.css';
import './styles.css';

// 在编辑器模块加载前指定本地字体路径。
window.EXCALIDRAW_ASSET_PATH = new URL('./', window.location.href).href;

async function mount(): Promise<void> {
  // 动态加载确保画布初始化时已经获得离线资源路径。
  const { App } = await import('./App');
  const root = document.getElementById('root');
  if (!root) {
    throw new Error('应用挂载节点不存在。');
  }
  createRoot(root).render(<App />);
}

void mount();
