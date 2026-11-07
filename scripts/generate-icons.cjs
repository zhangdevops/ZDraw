const { chromium } = require('@playwright/test');
const fs = require('node:fs/promises');

// 从同一份矢量标识生成多分辨率 Windows 图标，避免字体或缩放差异。
async function generateIcons() {
  const svg = await fs.readFile('build/icon.svg', 'utf8');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
  const images = [];
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    for (const size of sizes) {
      await page.setViewportSize({ width: size, height: size });
      await page.setContent(
        `<style>html,body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>${svg}`
      );
      images.push(await page.screenshot({ omitBackground: true }));
    }
  } finally {
    await browser.close();
  }

  // ICO 目录引用 PNG 帧，覆盖标题栏、任务栏、快捷方式和大图标视图。
  const header = Buffer.alloc(6 + sizes.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  for (let index = 0; index < sizes.length; index += 1) {
    const entry = 6 + index * 16;
    const size = sizes[index];
    header[entry] = size === 256 ? 0 : size;
    header[entry + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(images[index].length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += images[index].length;
  }
  await fs.writeFile('build/icon.ico', Buffer.concat([header, ...images]));
  await fs.writeFile('build/icon.png', images[images.length - 1]);
  console.log('Generated ZDraw icons (16–256 px).');
}

generateIcons().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
