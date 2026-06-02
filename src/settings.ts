import { App, PluginSettingTab, Setting, Notice, Platform } from 'obsidian';
import MyPlugin from './main';

export interface QuickAddSettings {
    enabled: boolean;
    placeholder: string;
    buttonText: string;
    label: string;
    position: 'top' | 'bottom';
    showSuccessNotice: boolean;
    fileTemplate: string;
}

export interface SidebarShortcut {
    id: string;
    label: string;
    icon: string;
    type: 'obsidian-command' | 'system-cmd' | 'system-script';
    payload: string;
}

export interface SidebarSettings {
    enabled: boolean;
    collapsed: boolean;
    shortcuts: SidebarShortcut[];
    maxRecentFiles: number;
    autoRefreshRecentFiles: boolean;
}

export interface TodoSettings {
    taskFolderPath: string;
    includeSubfolders: boolean;
}

export interface WorkPageSection {
    id: string;
    title: string;
    type: 'note' | 'todo' | 'memo' | 'dashboard' | 'concept';
    content: string;
    gridSpan?: number;
    filePath?: string;
    collapsed?: boolean;
};

export interface MyPluginSettings {
    sections: WorkPageSection[];
    desktopSections: WorkPageSection[];
    mobileSections: WorkPageSection[];
    useSeparateLayouts: boolean;
    openOnStartup: boolean;
    openWhenEmpty: boolean;
    quickAdd: QuickAddSettings;
    sidebar: SidebarSettings;
    todoSettings: TodoSettings;
}

export const DEFAULT_QUICK_ADD: QuickAddSettings = {
    enabled: true,
    placeholder: '输入新任务，回车添加...',
    buttonText: '添加',
    label: '快速添加待办',
    position: 'bottom',
    showSuccessNotice: true,
    fileTemplate: '',
};

export const DEFAULT_SIDEBAR_SETTINGS: SidebarSettings = {
    enabled: true,
    collapsed: false,
    shortcuts: [
        { id: '1', label: '新建笔记', icon: 'file-plus', type: 'obsidian-command', payload: 'file:create-new' },
        { id: '2', label: '搜索', icon: 'search', type: 'obsidian-command', payload: 'global-search:open' }
    ],
    maxRecentFiles: 15,
    autoRefreshRecentFiles: true
};

export const DEFAULT_TODO_SETTINGS: TodoSettings = {
    taskFolderPath: '',
    includeSubfolders: false,
};

export const DEFAULT_SETTINGS: MyPluginSettings = {
    sections: [
        { id: '1', title: '我的笔记', type: 'note', content: '', gridSpan: 3, filePath: '笔记.md' },
        { id: '2', title: '今日待办', type: 'todo', content: '', gridSpan: 2 },
        { id: '3', title: '备忘', type: 'memo', content: '', gridSpan: 1 },
        { id: '4', title: '今日统计', type: 'dashboard', content: '', gridSpan: 3 },
    ],
    desktopSections: [
        { id: 'd1', title: '今日统计', type: 'dashboard', content: '', gridSpan: 3 },
        { id: 'd2', title: '今日待办', type: 'todo', content: '', gridSpan: 2 },
        { id: 'd3', title: '快速备忘', type: 'memo', content: '', gridSpan: 1 },
        { id: 'd4', title: '笔记页', type: 'note', content: '', gridSpan: 3, filePath: '首页.md' },
    ],
    mobileSections: [
        { id: 'm1', title: '今日统计', type: 'dashboard', content: '', gridSpan: 1 },
        { id: 'm2', title: '今日待办', type: 'todo', content: '', gridSpan: 1 },
        { id: 'm3', title: '快速备忘', type: 'memo', content: '', gridSpan: 1 },
    ],
    useSeparateLayouts: true,
    openOnStartup: false,
    openWhenEmpty: false,
    quickAdd: { ...DEFAULT_QUICK_ADD },
    sidebar: { ...DEFAULT_SIDEBAR_SETTINGS },
    todoSettings: { ...DEFAULT_TODO_SETTINGS },
};

export function getCurrentSections(settings: MyPluginSettings): WorkPageSection[] {
    if (!settings.useSeparateLayouts) {
        return settings.sections || [];
    }
    return Platform.isMobile ? (settings.mobileSections || []) : (settings.desktopSections || []);
}

export class WorkPageSettingTab extends PluginSettingTab {
    plugin: MyPlugin;
    private currentEditMode: 'desktop' | 'mobile' = Platform.isMobile ? 'mobile' : 'desktop';

    constructor(app: App, plugin: MyPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl).setName('WorkPage 核心行为设置').setHeading();

        new Setting(containerEl)
            .setName('分立电脑/手机布局')
            .setDesc('开启后，桌面电脑与移动手机将分别展现完全不同的工作台布局与默认组件。')
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.useSeparateLayouts ?? true)
                    .onChange(async (value) => {
                        this.plugin.settings.useSeparateLayouts = value;
                        await this.plugin.saveSettings();
                        this.display();
                    })
            );

        if (this.plugin.settings.useSeparateLayouts) {
            new Setting(containerEl)
                .setName('当前正在配置的界面')
                .setDesc('选择你打算自定义哪个终端的工作台布局')
                .addDropdown((drop) =>
                    drop
                        .addOption('desktop', '🖥️ 电脑端布局配置')
                        .addOption('mobile', '📱 手机端布局配置')
                        .setValue(this.currentEditMode)
                        .onChange((value: 'desktop' | 'mobile') => {
                            this.currentEditMode = value;
                            this.display();
                        })
                );
        }

        containerEl.createEl('h3', { text: '布局分区管理' });
        containerEl.createEl('p', {
            text: '分区设置已集成到工作台页面上。点击任意分区标题右侧的齿轮按钮，即可在弹窗中编辑该分区的全部配置。',
            cls: 'setting-item-description'
        });

        new Setting(containerEl).addButton((btn) =>
            btn
                .setButtonText('+ 创建新页面分区')
                .setCta()
                .onClick(async () => {
                    const newSec: WorkPageSection = { id: Date.now().toString(), title: '未命名分区', type: 'note', content: '', gridSpan: 1 };
                    if (this.plugin.settings.useSeparateLayouts) {
                        if (this.currentEditMode === 'mobile') this.plugin.settings.mobileSections.push(newSec);
                        else this.plugin.settings.desktopSections.push(newSec);
                    } else {
                        this.plugin.settings.sections.push(newSec);
                    }
                    await this.plugin.saveSettings();
                    this.display();
                })
        );

        containerEl.createEl('hr');

        new Setting(containerEl).setName('工作台快速添加栏配置').setHeading();
        new Setting(containerEl)
            .setName('启用顶部/底部快速添加输入框')
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.quickAdd?.enabled ?? true)
                    .onChange(async (value) => {
                        this.plugin.settings.quickAdd.enabled = value;
                        await this.plugin.saveSettings();
                        this.display();
                    })
            );

        if (this.plugin.settings.quickAdd?.enabled) {
            new Setting(containerEl)
                .setName('显示摆放位置')
                .addDropdown((drop) => drop.addOption('bottom', '容器底部').addOption('top', '容器顶部').setValue(this.plugin.settings.quickAdd.position).onChange(async (v: any) => { this.plugin.settings.quickAdd.position = v; await this.plugin.saveSettings(); }));

            new Setting(containerEl)
                .setName('创建新文件默认模板内容')
                .setDesc('创建新笔记或草稿时的初始模板内容（支持 Markdown）')
                .addTextArea((text) =>
                    text
                        .setPlaceholder('输入模板内容，如：# 标题\n\n## 内容')
                        .setValue(this.plugin.settings.quickAdd.fileTemplate || '')
                        .onChange(async (value) => {
                            this.plugin.settings.quickAdd.fileTemplate = value;
                            await this.plugin.saveSettings();
                        })
                );
        }

        new Setting(containerEl).setName('全局环境与启动行为').setHeading();
        new Setting(containerEl).setName('软件启动时默认打开 WorkPage').addToggle((t) => t.setValue(this.plugin.settings.openOnStartup).onChange(async (v) => { this.plugin.settings.openOnStartup = v; await this.plugin.saveSettings(); }));
        new Setting(containerEl).setName('没有活跃标签页时强制回归 WorkPage').addToggle((t) => t.setValue(this.plugin.settings.openWhenEmpty).onChange(async (v) => { this.plugin.settings.openWhenEmpty = v; await this.plugin.saveSettings(); }));

        new Setting(containerEl).setName('今日待办设置').setHeading();
        new Setting(containerEl)
            .setName('任务检索文件夹路径')
            .setDesc('留空则使用日记插件默认文件夹。填写路径后，仅扫描该文件夹内的笔记文件查找待办任务。')
            .addText((text) =>
                text
                    .setPlaceholder('例如: Tasks 或 任务')
                    .setValue(this.plugin.settings.todoSettings?.taskFolderPath || '')
                    .onChange(async (value) => {
                        if (!this.plugin.settings.todoSettings) this.plugin.settings.todoSettings = { ...DEFAULT_TODO_SETTINGS };
                        this.plugin.settings.todoSettings.taskFolderPath = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('包含子文件夹')
            .setDesc('启用后，递归扫描任务文件夹下的所有子文件夹')
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.todoSettings?.includeSubfolders ?? false)
                    .onChange(async (value) => {
                        if (!this.plugin.settings.todoSettings) this.plugin.settings.todoSettings = { ...DEFAULT_TODO_SETTINGS };
                        this.plugin.settings.todoSettings.includeSubfolders = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('配置布局导出与备份')
            .addButton((b) => b.setButtonText('备份导出配置文件').onClick(() => this.exportTemplate()))
            .addButton((b) => b.setButtonText('导入还原备份配置').onClick(() => this.importTemplate()));

        new Setting(containerEl).setName('左侧工作台侧栏配置').setHeading();
        new Setting(containerEl)
            .setName('启用左侧工作台侧栏')
            .setDesc('在页面左侧显示快捷操作和最近编辑文件')
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.sidebar?.enabled ?? true)
                    .onChange(async (value) => {
                        if (!this.plugin.settings.sidebar) this.plugin.settings.sidebar = { ...DEFAULT_SIDEBAR_SETTINGS };
                        this.plugin.settings.sidebar.enabled = value;
                        await this.plugin.saveSettings();
                        this.display();
                    })
            );

        if (this.plugin.settings.sidebar?.enabled) {
            new Setting(containerEl)
                .setName('最近文件显示数量')
                .setDesc('侧边栏中显示的最近编辑文件数量')
                .addSlider((slider) =>
                    slider
                        .setLimits(5, 30, 1)
                        .setValue(this.plugin.settings.sidebar?.maxRecentFiles ?? 15)
                        .setDynamicTooltip()
                        .onChange(async (value) => {
                            this.plugin.settings.sidebar!.maxRecentFiles = value;
                            await this.plugin.saveSettings();
                        })
                );

            new Setting(containerEl)
                .setName('文件修改时自动刷新')
                .setDesc('启用后，最近文件列表会在文件修改时自动更新')
                .addToggle((toggle) =>
                    toggle
                        .setValue(this.plugin.settings.sidebar?.autoRefreshRecentFiles ?? true)
                        .onChange(async (value) => {
                            this.plugin.settings.sidebar!.autoRefreshRecentFiles = value;
                            await this.plugin.saveSettings();
                        })
                );

            const shortcutsWrap = containerEl.createDiv();
            shortcutsWrap.createEl('h5', { text: '⚡ 快捷操作配置' });

            this.plugin.settings.sidebar?.shortcuts.forEach((shortcut, idx) => {
                const typeMap: Record<string, string> = {
                    'obsidian-command': 'Obsidian命令',
                    'system-cmd': '系统cmd命令',
                    'system-script': '系统脚本文件'
                };
                const placeholderMap: Record<string, string> = {
                    'obsidian-command': 'file:create-new',
                    'system-cmd': 'echo hello',
                    'system-script': '/path/to/script.sh'
                };

                new Setting(shortcutsWrap)
                    .setName(`操作 ${idx + 1}: ${shortcut.label}`)
                    .addText((t) =>
                        t
                            .setValue(shortcut.label ?? '')
                            .setPlaceholder('按钮标签')
                            .onChange(async (v) => {
                                shortcut.label = v;
                                await this.plugin.saveSettings();
                            })
                    )
                    .addDropdown((d) =>
                        d
                            .addOption('obsidian-command', typeMap['obsidian-command'])
                            .addOption('system-cmd', typeMap['system-cmd'])
                            .addOption('system-script', typeMap['system-script'])
                            .setValue(shortcut.type ?? 'obsidian-command')
                            .onChange(async (v: any) => {
                                shortcut.type = v;
                                await this.plugin.saveSettings();
                                this.display();
                            })
                    )
                    .addText((t) =>
                        t
                            .setValue(shortcut.payload ?? '')
                            .setPlaceholder(placeholderMap[shortcut.type ?? 'obsidian-command'])
                            .onChange(async (v) => {
                                shortcut.payload = v;
                                await this.plugin.saveSettings();
                            })
                    )
                    .addButton((b) =>
                        b
                            .setButtonText('删除')
                            .setWarning()
                            .onClick(async () => {
                                this.plugin.settings.sidebar?.shortcuts.splice(idx, 1);
                                await this.plugin.saveSettings();
                                this.display();
                            })
                    );
            });

            new Setting(shortcutsWrap).addButton((b) =>
                b
                    .setButtonText('+ 新增快捷操作')
                    .setCta()
                    .onClick(async () => {
                        this.plugin.settings.sidebar!.shortcuts.push({
                            id: Date.now().toString(),
                            label: '新操作',
                            icon: 'play',
                            type: 'obsidian-command',
                            payload: ''
                        });
                        await this.plugin.saveSettings();
                        this.display();
                    })
            );
        }
    }

    private exportTemplate(): void {
        const data = { _version: 2, settings: this.plugin.settings };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'workpage-layout-backup.json';
        a.click();
        URL.revokeObjectURL(url);
        new Notice('WorkPage 备份配置下载成功！');
    }

    private importTemplate(): void {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return;
            try {
                const text = await file.text();
                const data = JSON.parse(text);
                if (data.settings) {
                    this.plugin.settings = Object.assign({}, this.plugin.settings, data.settings);
                    await this.plugin.saveSettings();
                    this.display();
                    new Notice('工作台多端配置文件恢复成功！');
                } else {
                    throw new Error('不合法的备份格式');
                }
            } catch (e) {
                new Notice('导入失败：' + e.message);
            }
        };
        input.click();
    }
}