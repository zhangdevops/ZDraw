import { _electron as electron, expect } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';

// 每次测试使用独立用户目录，确保不触碰用户真实草稿。
async function launch(userData: string): Promise<ElectronApplication> {
  const packagedExecutable = process.env.ZDRAW_EXECUTABLE;
  return await electron.launch({
    executablePath: packagedExecutable,
    args: packagedExecutable ? [] : [resolve('out/main/index.js')],
    env: { ...process.env, ZDRAW_USER_DATA: userData },
    timeout: 60000,
  });
}

// 在主进程中替换系统对话框，覆盖真实 IPC 与文件写入流程。
async function saveDialog(app: ElectronApplication, filePath: string): Promise<void> {
  await app.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = async (...args: unknown[]) => {
      Reflect.set(dialog, 'zdrawLastSaveOptions', args.at(-1));
      return { canceled: false, filePath: target };
    };
  }, filePath);
}

// 直接退出 Electron 主进程，跳过窗口关闭保存逻辑；同时清理 Windows 启动包装进程。
async function forceExit(application: ElectronApplication): Promise<void> {
  await application.evaluate(({ app }) => app.exit(0)).catch(() => undefined);
  await application.close().catch(() => undefined);
}

// 通过真实鼠标事件创建矩形，验证画布可交互。
async function drawRectangle(page: Page, offset = 0): Promise<void> {
  await page.keyboard.press('Escape');
  await page.keyboard.press('r');
  await page.mouse.move(360 + offset, 300);
  await page.mouse.down();
  await page.mouse.move(570 + offset, 420, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.press('Escape');
}

// 验证离线绘图、图片、保存重开、导出及退出后的草稿恢复。
async function run(): Promise<void> {
  await mkdir(resolve('work'), { recursive: true });
  const directory = await mkdtemp(resolve('work/smoke-'));
  const userData = join(directory, 'profile');
  const documentPath = join(directory, '测试图纸.excalidraw');
  const legacyPath = join(directory, '旧图纸.zdraw');
  const convertedPath = join(directory, '旧图纸.excalidraw');
  const pngPath = join(directory, 'export.png');
  const svgPath = join(directory, 'export.svg');
  const imagePath = join(directory, 'sample.png');
  const onePixel =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ4kAAAAASUVORK5CYII=';
  await writeFile(imagePath, Buffer.from(onePixel, 'base64'));
  let app = await launch(userData);
  const errors: string[] = [];
  try {
    let page = await app.firstWindow();
    page.on('pageerror', (error) => errors.push(error.message));
    await expect(page.getByText('让想法有个形状')).toBeVisible({ timeout: 60000 });
    await expect(page.locator('.excalidraw canvas').first()).toBeVisible();
    await page.screenshot({ path: resolve('work/zdraw-empty.png') });

    await drawRectangle(page);
    await expect(page.locator('.status-bar')).toContainText('1 个元素');
    await page.keyboard.press('Control+z');
    await expect(page.locator('.status-bar')).toContainText('0 个元素');
    await page.keyboard.press('Control+Shift+z');
    await expect(page.locator('.status-bar')).toContainText('1 个元素');

    await page.keyboard.press('t');
    await page.mouse.click(390, 340);
    await page.keyboard.insertText('你好，ZDraw');
    await page.keyboard.press('Escape');
    await expect(page.locator('.status-bar')).toContainText('2 个元素');

    // 用文件拖入路径测试图片导入，避开 Chromium 原生选择器的自动化限制。
    await page.evaluate((encoded) => {
      const binary = atob(encoded);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      const file = new File([bytes], 'sample.png', { type: 'image/png' });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      document.querySelector('.excalidraw')?.dispatchEvent(
        new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          clientX: 700,
          clientY: 350,
          dataTransfer: transfer,
        })
      );
    }, onePixel);
    await page.keyboard.press('Escape');
    await expect(page.locator('.status-bar')).toContainText('3 个元素');

    await saveDialog(app, documentPath);
    await page.getByRole('button', { name: '保存 Ctrl S', exact: true }).click();
    await expect(page.locator('.document-name')).toHaveText('测试图纸.excalidraw');
    await expect(page.locator('.save-state')).toHaveText('已就绪');
    const saveOptions = await app.evaluate(({ dialog }) =>
      Reflect.get(dialog, 'zdrawLastSaveOptions')
    );
    assert.equal(saveOptions.defaultPath, '未命名图纸.excalidraw');
    assert.deepEqual(saveOptions.filters[0].extensions, ['excalidraw']);
    const stored = JSON.parse(await readFile(documentPath, 'utf8'));
    assert.equal(stored.elements.length, 3);
    assert.equal(Object.keys(stored.files).length, 1);
    assert.ok(stored.elements.some((element: { text?: string }) => element.text === '你好，ZDraw'));

    await saveDialog(app, pngPath);
    await page.getByRole('button', { name: '导出 PNG', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('已导出 PNG');
    assert.equal((await readFile(pngPath)).subarray(1, 4).toString(), 'PNG');

    await saveDialog(app, svgPath);
    await page.getByRole('button', { name: 'SVG', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('已导出 SVG');
    assert.match(await readFile(svgPath, 'utf8'), /<svg/);

    await drawRectangle(page, 300);
    await expect(page.locator('.save-state')).toHaveText('未保存');
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 2, checkboxChecked: false });
    });
    await page.getByRole('button', { name: '新建', exact: true }).click();
    await expect(page.locator('.status-bar')).toContainText('4 个元素');

    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
    });
    await page.getByRole('button', { name: '新建', exact: true }).click();
    await expect(page.locator('.status-bar')).toContainText('0 个元素');

    await app.evaluate(({ dialog }, target) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] });
    }, documentPath);
    await page.getByRole('button', { name: '打开', exact: true }).click();
    await expect(page.locator('.status-bar')).toContainText('3 个元素');
    await expect(page.locator('.document-name')).toHaveText('测试图纸.excalidraw');

    // 验证旧图纸兼容、取消另存为以及转换后保留原文件。
    const legacyContent = await readFile(documentPath, 'utf8');
    await writeFile(legacyPath, legacyContent);
    await app.evaluate(({ dialog }, target) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] });
      dialog.showSaveDialog = async () => ({ canceled: true, filePath: '' });
    }, legacyPath);
    await page.getByRole('button', { name: '打开', exact: true }).click();
    await expect(page.locator('.document-name')).toHaveText('旧图纸.zdraw');
    await page.getByRole('button', { name: '保存 Ctrl S', exact: true }).click();
    await expect(page.getByRole('button', { name: '保存 Ctrl S', exact: true })).toBeEnabled();
    await expect(page.locator('.document-name')).toHaveText('旧图纸.zdraw');
    await saveDialog(app, convertedPath);
    await page.getByRole('button', { name: '保存 Ctrl S', exact: true }).click();
    await expect(page.locator('.document-name')).toHaveText('旧图纸.excalidraw');
    const legacySaveOptions = await app.evaluate(({ dialog }) =>
      Reflect.get(dialog, 'zdrawLastSaveOptions')
    );
    assert.equal(legacySaveOptions.defaultPath, convertedPath);
    assert.equal(await readFile(legacyPath, 'utf8'), legacyContent);
    assert.equal(JSON.parse(await readFile(convertedPath, 'utf8')).elements.length, 3);
    await drawRectangle(page, 270);
    await expect(page.locator('.status-bar')).toContainText('4 个元素');
    await expect(page.getByRole('status')).toHaveText('恢复副本已更新');
    await page.screenshot({ path: resolve('work/zdraw-drawing.png') });

    // 跳过窗口关闭回调，确认自动恢复不是仅在正常关闭时生效。
    await forceExit(app);
    app = await launch(userData);
    page = await app.firstWindow();
    page.on('pageerror', (error) => errors.push(error.message));
    await expect(page.locator('.status-bar')).toContainText('4 个元素', { timeout: 60000 });
    await expect(page.locator('.save-state')).toHaveText('未保存');
    assert.equal(JSON.parse(await readFile(documentPath, 'utf8')).elements.length, 3);

    const externalResources = await page.evaluate(() => {
      return performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter((name) => /^https?:/.test(name));
    });
    assert.deepEqual(externalResources, []);
    assert.deepEqual(errors, []);
    // 正常关闭走完未保存提示和草稿写入，验证窗口可以可靠退出。
    const closed = page.waitForEvent('close');
    await app.evaluate(({ dialog, BrowserWindow }) => {
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
      BrowserWindow.getAllWindows()[0].close();
    });
    await closed;
    console.log(
      'PASS: 绘图、图片、Excalidraw 保存重开、旧 .zdraw 转换与取消、PNG/SVG、异常退出恢复、离线资源'
    );
    console.log(`测试产物：${directory}`);
  } catch (error) {
    // 失败时保留截图，便于定位真实桌面交互问题。
    const page = await app.firstWindow().catch(() => null);
    if (page) {
      await page.screenshot({ path: resolve('work/smoke-failure.png') }).catch(() => undefined);
    }
    throw error;
  } finally {
    await forceExit(app);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
