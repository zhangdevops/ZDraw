import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// 将画布字体复制到本地，确保首次启动也不依赖网络。
function copyOfflineFonts() {
  const target = resolve('src/renderer/public/fonts');
  mkdirSync(target, { recursive: true });
  cpSync(resolve('node_modules/@excalidraw/excalidraw/dist/prod/fonts'), target, {
    recursive: true,
  });
  // 使用许可文件齐全的 OFL 版 Liberation Sans，替换 SDK 随附的旧版字体。
  cpSync(
    resolve('build/fonts/LiberationSans-Regular.woff2'),
    resolve(target, 'Liberation/LiberationSans-Regular.woff2')
  );
}

copyOfflineFonts();
cpSync(resolve('build/icon.svg'), resolve('src/renderer/public/zdraw.svg'));

// 固定版本 SDK 会无条件注册 CDN 备用字体；构建前将备用地址也指向本地。
function prepareOfflineFallback(): void {
  for (const mode of ['dev', 'prod']) {
    const directory = resolve(`node_modules/@excalidraw/excalidraw/dist/${mode}`);
    let prepared = false;
    for (const file of readdirSync(directory)) {
      if (!file.endsWith('.js')) {
        continue;
      }
      const filePath = resolve(directory, file);
      const source = readFileSync(filePath, 'utf8');
      if (source.includes('ZDraw offline fallback')) {
        prepared = true;
        continue;
      }
      const pattern = /("ASSETS_FALLBACK_URL",\s*)`https:\/\/esm\.sh\/[\s\S]*?\/dist\/prod\/`/;
      if (pattern.test(source)) {
        const replacement = '$1window.EXCALIDRAW_ASSET_PATH /* ZDraw offline fallback */';
        writeFileSync(filePath, source.replace(pattern, replacement));
        prepared = true;
      }
    }
    if (!prepared) {
      throw new Error('Excalidraw 字体结构发生变化，请重新检查离线资源配置。');
    }
  }
}

prepareOfflineFallback();

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [
      react(),
      {
        name: 'zdraw-development-csp',
        transformIndexHtml(html, context) {
          // 仅开发模式允许 Vite 注入热更新脚本，发行版本保持严格策略。
          if (context.server) {
            return html.replace(
              "script-src 'self' 'wasm-unsafe-eval'",
              "script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline'"
            );
          }
          return html;
        },
      },
    ],
    build: {
      chunkSizeWarningLimit: 5000,
    },
  },
});
