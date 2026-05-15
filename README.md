# WorkPage for Obsidian

一个高度可定制的工作台插件，将你的 Obsidian 变成任务与信息中心。

## ✨ 功能

- **多分区卡片布局**：今日待办、最近编辑、自定义 Markdown、动态文件列表。
- **今日待办**：从日记自动提取未完成任务，点击跳转至任务行。
- **最近编辑文件**：按修改时间/文件名排序，支持排除文件夹、自定义显示数量。
- **自定义文本**：完整 Markdown 渲染，代码块高亮、内部链接 `[[link]]` 可点击跳转。
- **动态文件列表**：类似 Dataview，按文件夹、文件名过滤，支持排序和数量控制。
- **快捷按钮**：为每个分区添加自定义操作（刷新、打开文件、执行命令、添加任务），并可在 Obsidian 快捷键设置中绑定。
- **快速添加任务**：底部输入框一键向今日日记追加待办。
- **启动行为**：可选启动时自动打开 WorkPage，或关闭所有标签页后自动显示。
- **模板导入/导出**：备份和分享你的分区布局。

## 📦 安装

### 手动安装
1. 从 [Releases](https://github.com/ZarkKang/obsidian_WorkPage/releases) 下载 `main.js`, `styles.css`, `manifest.json`。
2. 放入 `<仓库根目录>/.obsidian/plugins/workpage/` 文件夹内。
3. 重启 Obsidian，在“设置 → 第三方插件”中启用 **WorkPage**。

### 通过 BRAT 安装
暂不支持，请手动安装。

## 🧩 使用方法

1. 点击左侧功能区图标（布局）打开 WorkPage。
2. 在设置中自由添加/删除分区，并为每个分区配置内容与按钮。
3. 按钮支持的操作：
   - 刷新：重绘当前工作台
   - 打开文件：直接打开指定笔记
   - 命令：执行任意 Obsidian 命令（需输入命令 ID）
   - 添加任务：弹出输入框，将任务写入今日日记
4. 进入 Obsidian“快捷键”设置，搜索 `WorkPage:` 即可为按钮绑定快捷键。

## 🛠️ 开发

```bash
git clone https://github.com/ZarkKang/obsidian_WorkPage.git
cd obsidian_WorkPage
npm install
npm run dev