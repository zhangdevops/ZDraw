# ZDraw

基于 Electron、React、TypeScript 和 Excalidraw 的中文离线白板，Excalidraw 版本为 0.18.1。

第一版面向 Windows x64，所有字体和前端资源随安装包分发。


## 下载与使用

当前版本为 **v0.1.0**，适用于 **Windows x64（64 位）**。两种版本的绘图功能相同，均无需安装 Node.js 或启动本地服务，运行后即可离线绘图。

| 版本 | 下载 | 使用方式 |
| --- | --- | --- |
| 安装版 | [ZDraw-0.1.0-win-x64-setup.exe](https://github.com/zhangdevops/ZDraw/releases/download/v0.1.0/ZDraw-0.1.0-win-x64-setup.exe) | 按安装向导安装，适合日常使用 |
| 免安装版 | [ZDraw-0.1.0-win-x64-portable.zip](https://github.com/zhangdevops/ZDraw/releases/download/v0.1.0/ZDraw-0.1.0-win-x64-portable.zip) | 完整解压后直接运行 |

完整版本说明和文件校验值见 [v0.1.0 发布页面](https://github.com/zhangdevops/ZDraw/releases/tag/v0.1.0)。页面中的 `Source code (zip)` 和 `Source code (tar.gz)` 是开发源码，普通使用请选择上表中的安装包或免安装 ZIP。

### 安装版

1. 下载并双击 `ZDraw-0.1.0-win-x64-setup.exe`。
2. 按向导选择安装位置并完成安装。
3. 从桌面快捷方式或开始菜单启动 **ZDraw**。

### 免安装版

1. 下载 `ZDraw-0.1.0-win-x64-portable.zip`。
2. 右键选择“全部解压缩”，解压到一个固定目录。
3. 打开解压后的 `ZDraw-0.1.0-win-x64` 文件夹，双击 `ZDraw.exe`。

请先完整解压再运行，不要直接在压缩包预览中启动。移动或分享时需要保留整个文件夹及其中的配套文件，不能只复制 `ZDraw.exe`。

### 开始绘图

1. 在工具栏选择图形、文字或画笔，在画布上绘制内容，也可以添加本地图片。
2. 按 `Ctrl+S` 将图纸保存为 `.excalidraw` 文件；下次按 `Ctrl+O` 打开继续编辑。
3. 需要分享图片时，通过界面按钮或“文件”菜单导出 PNG / SVG。
4. 进入全屏后，可点击右上角“退出全屏”或按 `Esc` 返回。

安装包目前未进行代码签名。当前版本不支持应用内自动更新，后续版本可从 [Releases 页面](https://github.com/zhangdevops/ZDraw/releases)下载。


## 许可证与致谢

ZDraw 自身代码采用 [MIT License](LICENSE)，版权署名为 `Copyright (c) 2026 ZDraw`。

ZDraw 基于 [Excalidraw](https://github.com/excalidraw/excalidraw)、Electron 和 React 构建，是独立的桌面应用项目。第三方代码和字体保留各自的版权及许可，不因 ZDraw 采用 MIT 而改变。

- [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt)：第三方依赖许可汇总，由 `npm run notices` 生成。
- [licenses/](licenses/)：Excalidraw 编辑器及字体的补充许可文件。
- Electron / Chromium 的许可文件随发行目录分发。

重新分发源码或应用时，请保留相应的版权和许可声明。
