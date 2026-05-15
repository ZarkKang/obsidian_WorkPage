// ============================================================
// 模块：主插件逻辑 (main.ts)
// 功能：WorkPage 工作台自定义视图，支持多分区卡片展示、
//       按钮快捷操作、命令注册、快速添加任务等
// ============================================================

import {
    Plugin,
    ItemView,
    WorkspaceLeaf,
    TFile,
    setIcon,
    MarkdownRenderer
} from 'obsidian';
import { DEFAULT_SETTINGS, MyPluginSettings, SampleSettingTab, WorkPageButton } from "./settings";

const VIEW_TYPE_WORKPAGE = "work-page-view";

// ============================================================
// 自定义视图：WorkPageView
// ============================================================
class WorkPageView extends ItemView {
    plugin: MyPlugin;

    constructor(leaf: WorkspaceLeaf, plugin: MyPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() { return VIEW_TYPE_WORKPAGE; }
    getDisplayText() { return "WorkPage 工作台"; }

    async onOpen() {
        await this.render();
    }

    // -----------------------------------------------
    // 核心渲染
    // -----------------------------------------------
    async render() {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('workpage-container');

        // 页面头部
        const header = container.createDiv({ cls: 'workpage-header' });
        header.createEl('h2', { text: '我的工作台' });

        // 卡片网格
        const grid = container.createDiv({ cls: 'workpage-grid' });

        for (const section of this.plugin.settings.sections) {
            const sectionEl = grid.createDiv({ cls: 'workpage-section' });

            // ---------- 标题栏 ----------
            const titleEl = sectionEl.createEl('h3', { cls: 'section-title' });
            const iconMap: Record<string, string> = {
                'tasks': 'check-circle',
                'recent_files': 'clock',
                'custom_text': 'file-text',
                'file_list': 'folder-search'
            };
            const iconSpan = titleEl.createSpan({ cls: 'section-icon' });
            setIcon(iconSpan, iconMap[section.type] || 'layout');

            // 动态标题（任务分区加入日期）
            let displayTitle = section.title;
            if (section.type === 'tasks') {
                const moment = (window as any).moment;
                const today = moment().format('YYYY-MM-DD');
                displayTitle = `${section.title} (${today})`;
            }
            titleEl.createSpan({ text: displayTitle });

            // ---------- 内容容器 ----------
            const content = sectionEl.createDiv({ cls: 'section-content' });

            // ---------- 分区类型分发 ----------
            if (section.type === 'tasks') {
                // ========== 今日待办（源自日记文件） ==========
                const loading = content.createEl('p', { text: '加载中...' });
                this.getTodayTasks().then(tasks => {
                    loading.remove();
                    if (tasks.length === 0) {
                        const dailyPlugin = this.app.internalPlugins.getEnabledPluginById('daily-notes');
                        if (!dailyPlugin) {
                            content.createEl('p', { text: '请先启用核心插件“日记”', cls: 'no-data' });
                        } else {
                            content.createEl('p', { text: '今天的日记暂无未完成的任务 ✨', cls: 'no-data' });
                        }
                    } else {
                        const ul = content.createEl('ul', { style: 'list-style:none; padding:0; margin:0;' });
                        tasks.forEach(task => {
                            const li = ul.createEl('li', { cls: 'workpage-list-item' });
                            const icon = li.createSpan({ cls: 'item-icon' });
                            setIcon(icon, 'square');
                            li.createSpan({ text: task.text, cls: 'item-name' });
                            li.onClickEvent(async () => {
                                const leaf = this.app.workspace.getLeaf(false);
                                await leaf.openFile(task.file);
                                const editor = this.app.workspace.activeEditor?.editor;
                                if (editor) {
                                    editor.setCursor({ line: task.line, ch: 0 });
                                }
                            });
                        });
                    }
                });

            } else if (section.type === 'recent_files') {
                // ========== 最近编辑文件 ==========
                const maxFiles = section.maxFiles || 10;
                const sortBy = section.sortBy || 'mtime';
                const sortOrder = section.sortOrder || 'desc';
                const excludeFolders = section.excludeFolders ?
                    section.excludeFolders.split(',').map(f => f.trim().replace(/\/$/, '')) :
                    [];

                let files = this.app.vault.getMarkdownFiles();

                if (excludeFolders.length > 0) {
                    files = files.filter(f => !excludeFolders.some(folder => f.path.startsWith(folder + '/') || f.path.startsWith(folder)));
                }

                files = files.sort((a, b) => {
                    let cmp = sortBy === 'name' ? a.basename.localeCompare(b.basename) : a.stat.mtime - b.stat.mtime;
                    return sortOrder === 'desc' ? -cmp : cmp;
                });

                files = files.slice(0, maxFiles);

                if (files.length === 0) {
                    content.createEl('p', { text: "暂无编辑记录", cls: 'no-data' });
                } else {
                    const listEl = content.createDiv({ cls: 'workpage-recent-list' });
                    files.forEach(file => {
                        const fileItem = listEl.createDiv({ cls: 'workpage-list-item' });
                        const iconSpan = fileItem.createSpan({ cls: 'item-icon' });
                        setIcon(iconSpan, 'file-text');
                        fileItem.createSpan({ text: file.basename, cls: 'item-name' });
                        fileItem.onClickEvent(async () => {
                            await this.app.workspace.getLeaf(false).openFile(file);
                        });
                    });
                }

            } else if (section.type === 'custom_text') {
                // ========== 自定义文本（Markdown） ==========
                const sourcePath = 'WorkPage/custom-text';
                await MarkdownRenderer.renderMarkdown(
                    section.content || "在设置中编辑此内容...",
                    content,
                    sourcePath,
                    this
                );

                // 修复内部链接跳转
                content.querySelectorAll('a.internal-link').forEach(link => {
                    link.addEventListener('click', (event) => {
                        event.preventDefault();
                        const href = link.getAttribute('data-href') || link.getAttribute('href');
                        if (href) this.app.workspace.openLinkText(href, '', false);
                    });
                });

            } else if (section.type === 'file_list') {
                // ========== 动态文件列表 ==========
                const folder = section.folder || '';
                const nameFilter = section.nameFilter || '';
                const sortBy = section.sortBy || 'name';
                const sortOrder = section.sortOrder || 'asc';

                let files = this.app.vault.getMarkdownFiles();

                if (folder) files = files.filter(f => f.path.startsWith(folder));
                if (nameFilter) files = files.filter(f => f.basename.includes(nameFilter));

                files = files.sort((a, b) => {
                    let cmp = sortBy === 'name' ? a.basename.localeCompare(b.basename) : a.stat.mtime - b.stat.mtime;
                    return sortOrder === 'desc' ? -cmp : cmp;
                });

                const maxFiles = section.maxFiles || 20;
                files = files.slice(0, maxFiles);

                if (files.length === 0) {
                    content.createEl('p', { text: '没有匹配的笔记', cls: 'no-data' });
                } else {
                    const listEl = content.createDiv({ cls: 'workpage-recent-list' });
                    files.forEach(file => {
                        const fileItem = listEl.createDiv({ cls: 'workpage-list-item' });
                        const iconSpan = fileItem.createSpan({ cls: 'item-icon' });
                        setIcon(iconSpan, 'file-text');
                        fileItem.createSpan({ text: file.basename, cls: 'item-name' });
                        fileItem.onClickEvent(async () => {
                            await this.app.workspace.getLeaf(false).openFile(file);
                        });
                    });
                }
            } else {
                content.createEl('p', { text: '未知分区类型' });
            }

            // ---------- 按钮栏（在卡片底部） ----------
            if (section.buttons && section.buttons.length > 0) {
                const btnBar = sectionEl.createDiv({ cls: 'workpage-button-bar' });
                section.buttons.forEach(button => {
                    const btn = btnBar.createEl('button', { cls: 'workpage-action-btn' });
                    setIcon(btn.createSpan(), button.icon || 'play');
                    btn.createSpan({ text: button.label });
                    btn.addEventListener('click', () => this.executeButtonAction(button));
                });
            }
        }

        // 在所有分区之后，添加快速任务输入栏
        this.renderQuickAdd(container);
    }

    // -----------------------------------------------
    // 按钮动作分发
    // -----------------------------------------------
    executeButtonAction(button: WorkPageButton) {
        switch (button.action.type) {
            case 'refresh':
                this.render();
                break;
            case 'open-file':
                if (button.action.payload) {
                    this.app.workspace.openLinkText(button.action.payload, '', false);
                }
                break;
            case 'command':
                if (button.action.payload) {
                    (this.app as any).commands.executeCommandById(button.action.payload);
                }
                break;
            case 'add-task':
                this.quickAddTask(button.action.payload || '');
                break;
        }
    }

    // 通过 prompt 快速添加任务
    quickAddTask(defaultText = '') {
        const taskText = prompt('输入任务内容', defaultText);
        if (taskText) this.addTaskToToday(taskText);
    }

    // 实际写入今日日记
    async addTaskToToday(taskText: string) {
        const dailyPlugin = this.app.internalPlugins.getEnabledPluginById('daily-notes');
        if (!dailyPlugin) return;
        const { folder, format } = dailyPlugin.options;
        const moment = (window as any).moment;
        const today = moment().format(format || 'YYYY-MM-DD');
        const filePath = (folder ? `${folder}/` : '') + `${today}.md`;

        let file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) {
            file = await this.app.vault.create(filePath, '');
        }
        const currentContent = await this.app.vault.read(file);
        const newContent = currentContent ? `${currentContent}\n- [ ] ${taskText}` : `- [ ] ${taskText}`;
        await this.app.vault.modify(file, newContent);
        this.render();
    }

    // 底部快速添加栏
    renderQuickAdd(container: HTMLElement) {
        const dailyPlugin = this.app.internalPlugins.getEnabledPluginById('daily-notes');
        if (!dailyPlugin) return;
        const quickDiv = container.createDiv({ cls: 'workpage-quick-add' });
        quickDiv.createEl('span', { text: '快速添加待办：', cls: 'quick-add-label' });
        const input = quickDiv.createEl('input', { type: 'text', placeholder: '输入新任务，回车添加...', cls: 'quick-add-input' });
        const btn = quickDiv.createEl('button', { text: '添加', cls: 'quick-add-btn' });
        const add = async () => {
            const task = input.value.trim();
            if (task) {
                await this.addTaskToToday(task);
                input.value = '';
                this.render();
            }
        };
        btn.addEventListener('click', add);
        input.addEventListener('keypress', (e) => { if (e.key === 'Enter') add(); });
    }

    // -----------------------------------------------
    // 数据获取
    // -----------------------------------------------
    async getTodayTasks(): Promise<{ file: TFile; line: number; text: string }[]> {
        const tasks: { file: TFile; line: number; text: string }[] = [];
        const dailyPlugin = this.app.internalPlugins.getEnabledPluginById('daily-notes');
        if (!dailyPlugin) return tasks;

        const { folder, format } = dailyPlugin.options;
        const moment = (window as any).moment;
        const today = moment().format(format || 'YYYY-MM-DD');
        const filePath = (folder ? `${folder}/` : '') + `${today}.md`;

        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return tasks;

        const content = await this.app.vault.read(file);
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (/^\s*-\s*\[ \]/.test(lines[i])) {
                tasks.push({ file, line: i, text: lines[i].trim() });
            }
        }
        return tasks;
    }

    async getUnfinishedTasks(): Promise<{ file: TFile; line: number; text: string }[]> {
        const tasks: { file: TFile; line: number; text: string }[] = [];
        const files = this.app.vault.getMarkdownFiles();
        for (const file of files) {
            const content = await this.app.vault.read(file);
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
                if (/^\s*-\s*\[ \]/.test(lines[i])) {
                    tasks.push({ file, line: i, text: lines[i].trim() });
                }
            }
        }
        tasks.sort((a, b) => b.file.stat.mtime - a.file.stat.mtime);
        return tasks;
    }
}

// ============================================================
// 插件主类
// ============================================================
export default class MyPlugin extends Plugin {
    settings: MyPluginSettings;

    async onload() {
        await this.loadSettings();

        this.registerView(VIEW_TYPE_WORKPAGE, (leaf) => new WorkPageView(leaf, this));

        this.addRibbonIcon('layout', '打开 WorkPage', () => this.activateView());

        this.addSettingTab(new SampleSettingTab(this.app, this));

        // 监听 vault 修改 → 刷新
        this.registerEvent(
            this.app.vault.on('modify', () => {
                this.app.workspace.getLeavesOfType(VIEW_TYPE_WORKPAGE).forEach(leaf => {
                    if (leaf.view instanceof WorkPageView) leaf.view.render();
                });
            })
        );

        // 启动时自动打开
        if (this.settings.openOnStartup) {
            this.app.workspace.onLayoutReady(() => this.activateView());
        }

        // 无标签页时自动打开
        if (this.settings.openWhenEmpty) {
            this.registerEvent(this.app.workspace.on('active-leaf-change', () => setTimeout(() => this.checkAndShowWorkPage(), 100)));
            this.registerEvent(this.app.workspace.on('layout-change', () => setTimeout(() => this.checkAndShowWorkPage(), 100)));
        }

        // 注册按钮命令（支持快捷键）
        this.settings.sections.forEach(section => {
            section.buttons?.forEach(button => {
                const commandId = `workpage:${section.id}-${button.id}`;
                this.addCommand({
                    id: commandId,
                    name: `WorkPage: ${section.title} - ${button.label}`,
                    callback: () => {
                        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_WORKPAGE);
                        if (leaves.length > 0) {
                            (leaves[0].view as WorkPageView).executeButtonAction(button);
                        } else {
                            this.activateView().then(() => {
                                setTimeout(() => {
                                    const newLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_WORKPAGE);
                                    if (newLeaves.length > 0) (newLeaves[0].view as WorkPageView).executeButtonAction(button);
                                }, 200);
                            });
                        }
                    }
                });
            });
        });
    }

    // 激活视图
    async activateView() {
        const { workspace } = this.app;
        let leaf = workspace.getLeavesOfType(VIEW_TYPE_WORKPAGE)[0];
        if (!leaf) {
            leaf = workspace.getLeaf('tab');
            await leaf.setViewState({ type: VIEW_TYPE_WORKPAGE, active: true });
        }
        workspace.revealLeaf(leaf);
    }

    // 检查并显示工作台（当所有标签页关闭时）
    checkAndShowWorkPage() {
        const markdownLeaves = this.app.workspace.getLeavesOfType('markdown');
        const hasAnyFileOpen = markdownLeaves.some(leaf => {
            const view = leaf.view;
            return view && 'file' in view && view.file !== null;
        });

        if (!hasAnyFileOpen && this.app.workspace.getLeavesOfType(VIEW_TYPE_WORKPAGE).length === 0) {
            const activeLeaf = this.app.workspace.activeLeaf;
            if (activeLeaf && activeLeaf.view?.getViewType() === 'empty') {
                activeLeaf.setViewState({ type: VIEW_TYPE_WORKPAGE });
            } else {
                this.activateView();
            }
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_WORKPAGE)[0];
        if (leaf) (leaf.view as WorkPageView).render();
    }
}