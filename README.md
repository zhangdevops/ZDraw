# ZDraw

基于 Electron、React、TypeScript 和 Excalidraw 的中文离线白板，Excalidraw 固定为 0.18.1。

第一版面向 Windows x64，所有字体和前端资源随安装包分发。

## 第一版功能

- 矩形、椭圆、菱形、线条、箭头、自由画笔、文字和本地图片。
- 选择、移动、缩放、旋转、多选、组合、复制粘贴、撤销与重做（由 Excalidraw 提供）。
- 新建、打开、保存、另存为 `.excalidraw` 图纸，图片内嵌保存；兼容打开此前保存的 `.zdraw` 图纸。
- 编辑停止约 700 毫秒后更新本地恢复副本，启动恢复上次工作。
- 新建、打开、关闭时提醒保存尚未保存的更改。
- PNG / SVG 导出，中文界面与原生文件菜单。
- 全屏时右上角显示“退出全屏”按钮，支持 Esc 退出；非全屏时 Esc 保持画布原有功能。

暂不包含多页、多文档标签、云同步、协作、AI、在线素材库和应用自动更新。图纸和导出文件暂限制为 100 MB。Excalidraw 的在线链接及嵌入网页在离线模式下不可用。

## 保存和恢复

`Ctrl+S` 保存，`Ctrl+Shift+S` 另存为，`Ctrl+O` 打开，`Ctrl+N` 新建。图片及图形保存在同一个 `.excalidraw` 文件中，可以与 Excalidraw 交换使用。

打开旧 `.zdraw` 文件（包括从旧恢复副本打开）后，首次保存会显示 `.excalidraw` 另存为对话框，不直接覆盖旧文件。取消保存会继续保留当前画布。


## 打包

当前版本 0.1.0 的输出：

- `release/0.1.0/ZDraw-0.1.0-win-x64-setup.exe`：安装程序。
- `release/0.1.0/win-unpacked/`：免安装运行目录，双击其中的 `ZDraw.exe`。分享时需要压缩整个目录，不能只发送这个 EXE。

安装包目前未进行代码签名。源码支持的目标为 Windows x64。


## 许可证与致谢

ZDraw 自身代码采用 [MIT License](LICENSE)，版权署名为 `Copyright (c) 2026 ZDraw`。

ZDraw 基于 [Excalidraw](https://github.com/excalidraw/excalidraw)、Electron 和 React 构建，是独立的桌面应用项目。第三方代码和字体保留各自的版权及许可，不因 ZDraw 采用 MIT 而改变。

- [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt)：第三方依赖许可汇总，由 `npm run notices` 生成。
- [licenses/](licenses/)：Excalidraw 编辑器及字体的补充许可文件。
- Electron / Chromium 的许可文件随发行目录分发。

重新分发源码或应用时，请保留相应的版权和许可声明。
