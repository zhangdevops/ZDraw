import { _electron as electron, expect } from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';

// 使用真实 Electron 窗口验证全屏状态和画布键盘行为。
async function run(): Promise<void> {
  await mkdir(resolve('work'), { recursive: true });
  const userData = await mkdtemp(resolve('work/fullscreen-'));
  const executablePath = process.env.ZDRAW_EXECUTABLE;
  const application = await electron.launch({
    executablePath,
    args: executablePath ? [] : [resolve('out/main/index.js')],
    env: { ...process.env, ZDRAW_USER_DATA: userData },
    timeout: 60000,
  });
  try {
    const page = await application.firstWindow();
    await expect(page.getByText('让想法有个形状')).toBeVisible();
    const exitButton = page.getByRole('button', { name: '退出全屏', exact: true });
    await expect(exitButton).toBeHidden();

    // 使用原生窗口进入全屏，与系统菜单切换走相同的状态事件。
    await application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setFullScreen(true);
    });
    await expect(exitButton).toBeVisible();
    await page.screenshot({ path: resolve('work/zdraw-fullscreen.png') });
    await exitButton.click();
    await expect
      .poll(() =>
        application.evaluate(({ BrowserWindow }) => {
          return BrowserWindow.getAllWindows()[0].isFullScreen();
        })
      )
      .toBe(false);
    await expect(exitButton).toBeHidden();

    // Esc 退出全屏时不把按键继续传入画布，保留正在编辑的文字。
    await page.keyboard.press('t');
    await page.mouse.click(450, 350);
    await page.keyboard.insertText('全屏切换测试');
    const textEditor = page.locator('textarea.excalidraw-wysiwyg');
    await expect(textEditor).toBeVisible();
    await application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setFullScreen(true);
    });
    await expect(exitButton).toBeVisible();
    await application.evaluate(({ BrowserWindow }) => {
      // 从原生窗口发送按键，覆盖主进程 before-input-event，而非仅发送网页事件。
      const contents = BrowserWindow.getAllWindows()[0].webContents;
      contents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
      contents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
    });
    await expect
      .poll(() =>
        application.evaluate(({ BrowserWindow }) => {
          return BrowserWindow.getAllWindows()[0].isFullScreen();
        })
      )
      .toBe(false);
    await expect(exitButton).toBeHidden();
    await expect(textEditor).toBeVisible();
    await expect(textEditor).toHaveValue('全屏切换测试');

    // 非全屏时再次 Esc，仍由编辑器结束文字编辑。
    await application.evaluate(({ BrowserWindow }) => {
      const contents = BrowserWindow.getAllWindows()[0].webContents;
      contents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
      contents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
    });
    await expect(textEditor).toBeHidden();
    await expect(page.locator('.status-bar')).toContainText('1 个元素');
    console.log('PASS: 全屏按钮显隐、按钮退出、Esc 退出、保留正在编辑的文字、非全屏 Esc');
  } finally {
    await application.evaluate(({ app }) => app.exit(0)).catch(() => undefined);
    await application.close().catch(() => undefined);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
