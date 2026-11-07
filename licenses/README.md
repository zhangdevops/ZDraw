# 第三方许可来源

此目录中的第三方代码和字体保留原有版权与许可证。ZDraw 根目录的 MIT 许可证不覆盖这些组件的原有条款。

- `excalidraw-MIT.txt`：Excalidraw 0.18.1 的 MIT 许可证。
- `font-ComicShanns.txt`、`font-Excalifont.txt`、`font-Xiaolai.txt`：来自 Excalidraw 字体模块的原始元数据；Xiaolai 补充了完整 OFL 1.1 正文。
- `font-Assistant.txt`、`font-Lilita.txt`、`font-Nunito.txt`、`font-Virgil.txt`：保留 `@excalidraw/excalidraw@0.18.1` 所附 WOFF2 字体中的版权、版本信息及完整 OFL 1.1 正文。
- `font-Cascadia.txt`：来自 Microsoft Cascadia Code 的 [v2005.15 许可证](https://github.com/microsoft/cascadia-code/blob/v2005.15/LICENSE)，对应所附字体的 2005.150 版本。
- `font-Liberation.txt`：来自 Liberation Fonts [2.1.5 发布版](https://github.com/liberationfonts/liberation-fonts/releases/tag/2.1.5)的 OFL 1.1 许可证。

## Liberation Sans

SDK 自带的 Liberation Sans 字体元数据版本为 1.05。ZDraw 构建时使用 `build/fonts/LiberationSans-Regular.woff2` 替换它，目标文件路径保持不变，以便继续打开使用旧字体名称的图纸。

该文件由上游 2.1.5 发行包中的 `LiberationSans-Regular.ttf` 使用 fontTools 转换为 WOFF2，未编辑字形。其字体度量或渲染可能与旧版本存在差异。

原始下载地址：https://github.com/liberationfonts/liberation-fonts/files/7261482/liberation-fonts-ttf-2.1.5.tar.gz

字体文件已保存在源码中，正常开发和打包无需 Python 或 fontTools。其他字体仍由固定版本的 npm 依赖提供。
