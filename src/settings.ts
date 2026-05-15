import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import MyPlugin from './main';

export interface WorkPageButton {
    id: string;
    label: string;
    icon: string;
    action: {
        type: 'refresh' | 'open-file' | 'command' | 'add-task';
        payload?: string;
    };
}

export interface WorkPageSection {
    id: string;
    title: string;
    type: 'tasks' | 'recent_files' | 'custom_text' | 'file_list'
        | 'dashboard' | 'calendar' | 'scratchpad' | 'tag_cloud';
    content: string;
    maxFiles?: number;
    sortBy?: 'mtime' | 'name';
    sortOrder?: 'desc' | 'asc';
    excludeFolders?: string;
    folder?: string;
    nameFilter?: string;
    buttons?: WorkPageButton[];
    // scratchpad 专属
    scratchpadTarget?: 'daily' | 'new' | 'append';
    scratchpadFile?: string;
    // tag_cloud 专属
    tagMaxCount?: number;
}

export interface QuickAddSettings {
    enabled: boolean;
    placeholder: string;
    buttonText: string;
    label: string;
    position: 'top' | 'bottom';
    showSuccessNotice: boolean;
}

export interface MyPluginSettings {
    sections: WorkPageSection[];
    openOnStartup: boolean;
    openWhenEmpty: boolean;
    quickAdd: QuickAddSettings;
}

export const DEFAULT_QUICK_ADD: QuickAddSettings = {
    enabled: true,
    placeholder: '输入新任务，回车添加...',
    buttonText: '添加',
    label: '快速添加待办',
    position: 'bottom',
    showSuccessNotice: true,
};

export const DEFAULT_SETTINGS: MyPluginSettings = {
    sections: [
        { id: '1', title: '今日待办', type: 'tasks', content: '' },
        { id: '2', title: '最近编辑', type: 'recent_files', content: '' },
    ],
    openOnStartup: false,
    openWhenEmpty: false,
    quickAdd: { ...DEFAULT_QUICK_ADD },
};

export class WorkPageSettingTab extends PluginSettingTab {
    plugin: MyPlugin;

    constructor(app: App, plugin: MyPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl).setName('WorkPage 布局设置').setHeading();

        this.plugin.settings.sections.forEach((section, index) => {
            // ── 分区基础设置 ──
            new Setting(containerEl)
                .setName(`分区 ${index + 1}`)
                .setDesc(`设置 ${section.title} 的显示内容`)
                .addText((text) =>
                    text
                        .setPlaceholder('分区名称')
                        .setValue(section.title)
                        .onChange(async (value) => {
                            section.title = value;
                            await this.plugin.saveSettings();
                        })
                )
                .addDropdown((drop) =>
                    drop
                        .addOption('tasks', '今日待办')
                        .addOption('recent_files', '最近文件')
                        .addOption('custom_text', '自定义文字')
                        .addOption('file_list', '动态文件列表')
                        .addOption('dashboard', '📊 今日统计看板')
                        .addOption('calendar', '📅 日历跳转器')
                        .addOption('scratchpad', '📝 快速草稿纸')
                        .addOption('tag_cloud', '🏷️ 标签聚合器')
                        .setValue(section.type)
                        .onChange(async (value: WorkPageSection['type']) => {
                            section.type = value;
                            await this.plugin.saveSettings();
                            this.display();
                        })
                )
                .addButton((btn) =>
                    btn
                        .setButtonText('删除')
                        .setWarning()
                        .onClick(async () => {
                            this.plugin.settings.sections.splice(index, 1);
                            await this.plugin.saveSettings();
                            this.display();
                        })
                );

            // ── recent_files 专属 ──
            if (section.type === 'recent_files') {
                new Setting(containerEl)
                    .setName('最大显示数量')
                    .setDesc('最近文件列表最多展示几个文件（1~50）')
                    .addSlider((slider) =>
                        slider
                            .setLimits(1, 50, 1)
                            .setValue(section.maxFiles || 10)
                            .setDynamicTooltip()
                            .onChange(async (value) => {
                                section.maxFiles = value;
                                await this.plugin.saveSettings();
                            })
                    );

                new Setting(containerEl)
                    .setName('排序依据')
                    .addDropdown((dropdown) =>
                        dropdown
                            .addOption('mtime', '修改时间')
                            .addOption('name', '文件名')
                            .setValue(section.sortBy || 'mtime')
                            .onChange(async (value: 'mtime' | 'name') => {
                                section.sortBy = value;
                                await this.plugin.saveSettings();
                            })
                    );

                new Setting(containerEl)
                    .setName('排序方向')
                    .addDropdown((dropdown) =>
                        dropdown
                            .addOption('desc', '降序（最新在前）')
                            .addOption('asc', '升序（最旧在前）')
                            .setValue(section.sortOrder || 'desc')
                            .onChange(async (value: 'desc' | 'asc') => {
                                section.sortOrder = value;
                                await this.plugin.saveSettings();
                            })
                    );

                new Setting(containerEl)
                    .setName('排除文件夹')
                    .setDesc('多个文件夹用英文逗号分隔，例如：Archive,Templates')
                    .addText((text) =>
                        text
                            .setPlaceholder('Archive,Templates')
                            .setValue(section.excludeFolders || '')
                            .onChange(async (value) => {
                                section.excludeFolders = value;
                                await this.plugin.saveSettings();
                            })
                    );
            }

            // ── file_list 专属 ──
            if (section.type === 'file_list') {
                new Setting(containerEl)
                    .setName('目标文件夹')
                    .setDesc('留空表示搜索整个仓库')
                    .addText((text) =>
                        text
                            .setValue(section.folder || '')
                            .onChange(async (value) => {
                                section.folder = value;
                                await this.plugin.saveSettings();
                            })
                    );

                new Setting(containerEl)
                    .setName('文件名过滤')
                    .setDesc('只显示文件名包含该文本的笔记')
                    .addText((text) =>
                        text
                            .setValue(section.nameFilter || '')
                            .onChange(async (value) => {
                                section.nameFilter = value;
                                await this.plugin.saveSettings();
                            })
                    );

                new Setting(containerEl)
                    .setName('排序依据')
                    .addDropdown((dropdown) =>
                        dropdown
                            .addOption('name', '文件名')
                            .addOption('mtime', '修改时间')
                            .setValue(section.sortBy || 'name')
                            .onChange(async (value: 'name' | 'mtime') => {
                                section.sortBy = value;
                                await this.plugin.saveSettings();
                            })
                    );

                new Setting(containerEl)
                    .setName('排序方向')
                    .addDropdown((dropdown) =>
                        dropdown
                            .addOption('asc', '升序')
                            .addOption('desc', '降序')
                            .setValue(section.sortOrder || 'asc')
                            .onChange(async (value: 'asc' | 'desc') => {
                                section.sortOrder = value;
                                await this.plugin.saveSettings();
                            })
                    );

                new Setting(containerEl)
                    .setName('最大显示数量')
                    .setDesc('列表最多展示多少个文件（1~50）')
                    .addSlider((slider) =>
                        slider
                            .setLimits(1, 50, 1)
                            .setValue(section.maxFiles || 20)
                            .setDynamicTooltip()
                            .onChange(async (value) => {
                                section.maxFiles = value;
                                await this.plugin.saveSettings();
                            })
                    );
            }

            // ── custom_text 专属 ──
            if (section.type === 'custom_text') {
                new Setting(containerEl)
                    .setName('自定义内容')
                    .addTextArea((text) =>
                        text
                            .setValue(section.content)
                            .onChange(async (value) => {
                                section.content = value;
                                await this.plugin.saveSettings();
                            })
                    );
            }

            // ── scratchpad 专属 ──
            if (section.type === 'scratchpad') {
                new Setting(containerEl)
                    .setName('保存目标')
                    .setDesc('内容保存到哪里')
                    .addDropdown((drop) =>
                        drop
                            .addOption('daily', '追加到今日日记')
                            .addOption('new', '创建新笔记')
                            .addOption('append', '追加到指定文件')
                            .setValue(section.scratchpadTarget || 'daily')
                            .onChange(async (value: 'daily' | 'new' | 'append') => {
                                section.scratchpadTarget = value;
                                await this.plugin.saveSettings();
                                this.display();
                            })
                    );

                if (section.scratchpadTarget === 'append') {
                    new Setting(containerEl)
                        .setName('目标文件路径')
                        .setDesc('例如：Notes/草稿.md')
                        .addText((text) =>
                            text
                                .setPlaceholder('Notes/草稿.md')
                                .setValue(section.scratchpadFile || '')
                                .onChange(async (value) => {
                                    section.scratchpadFile = value;
                                    await this.plugin.saveSettings();
                                })
                        );
                }
            }

            // ── tag_cloud 专属 ──
            if (section.type === 'tag_cloud') {
                new Setting(containerEl)
                    .setName('最多显示标签数')
                    .setDesc('按使用频率排序，显示前 N 个标签（5~100）')
                    .addSlider((slider) =>
                        slider
                            .setLimits(5, 100, 5)
                            .setValue(section.tagMaxCount || 30)
                            .setDynamicTooltip()
                            .onChange(async (value) => {
                                section.tagMaxCount = value;
                                await this.plugin.saveSettings();
                            })
                    );
            }

            // ── 按钮设置（所有类型均可添加） ──
            containerEl.createEl('h4', { text: '快捷按钮' });
            const buttonsContainer = containerEl.createDiv({ cls: 'workpage-buttons-config' });

            if (!section.buttons) section.buttons = [];

            section.buttons.forEach((button, btnIndex) => {
                new Setting(buttonsContainer)
                    .setName(button.label)
                    .setDesc(`动作: ${button.action.type}`)
                    .addText((text) =>
                        text
                            .setValue(button.label)
                            .onChange(async (value) => {
                                button.label = value;
                                await this.plugin.saveSettings();
                            })
                    )
                    .addDropdown((drop) =>
                        drop
                            .addOption('refresh', '刷新')
                            .addOption('open-file', '打开文件')
                            .addOption('command', '命令')
                            .addOption('add-task', '添加任务')
                            .setValue(button.action.type)
                            .onChange(async (value: 'refresh' | 'open-file' | 'command' | 'add-task') => {
                                button.action.type = value;
                                await this.plugin.saveSettings();
                                this.display();
                            })
                    )
                    .addText((text) => {
                        if (button.action.type === 'open-file' || button.action.type === 'command') {
                            text.setValue(button.action.payload || '')
                                .setPlaceholder('路径或命令ID')
                                .onChange(async (value) => {
                                    button.action.payload = value;
                                    await this.plugin.saveSettings();
                                });
                        } else {
                            text.setDisabled(true);
                        }
                    })
                    .addButton((btn) =>
                        btn
                            .setButtonText('删除')
                            .setWarning()
                            .onClick(async () => {
                                section.buttons?.splice(btnIndex, 1);
                                await this.plugin.saveSettings();
                                this.display();
                            })
                    );
            });

            new Setting(buttonsContainer).addButton((btn) =>
                btn
                    .setButtonText('添加按钮')
                    .setCta()
                    .onClick(async () => {
                        section.buttons?.push({
                            id: Date.now().toString(),
                            label: '新按钮',
                            icon: 'play',
                            action: { type: 'refresh' },
                        });
                        await this.plugin.saveSettings();
                        this.display();
                    })
            );

            containerEl.createEl('hr');
        });

        // ── 快速添加待办设置 ──
        new Setting(containerEl).setName('快速添加待办').setHeading();

        new Setting(containerEl)
            .setName('启用快速添加栏')
            .setDesc('在工作台显示快速添加待办输入框')
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.quickAdd?.enabled ?? true)
                    .onChange(async (value) => {
                        this.plugin.settings.quickAdd.enabled = value;
                        await this.plugin.saveSettings();
                        this.display();
                    })
            );

        if (this.plugin.settings.quickAdd?.enabled !== false) {
            new Setting(containerEl)
                .setName('显示位置')
                .setDesc('快速添加栏出现在工作台的位置')
                .addDropdown((drop) =>
                    drop
                        .addOption('bottom', '底部（默认）')
                        .addOption('top', '顶部')
                        .setValue(this.plugin.settings.quickAdd?.position ?? 'bottom')
                        .onChange(async (value: 'top' | 'bottom') => {
                            this.plugin.settings.quickAdd.position = value;
                            await this.plugin.saveSettings();
                        })
                );

            new Setting(containerEl)
                .setName('标签文字')
                .setDesc('输入框左侧显示的提示文字')
                .addText((text) =>
                    text
                        .setPlaceholder('快速添加待办')
                        .setValue(this.plugin.settings.quickAdd?.label ?? '快速添加待办')
                        .onChange(async (value) => {
                            this.plugin.settings.quickAdd.label = value;
                            await this.plugin.saveSettings();
                        })
                );

            new Setting(containerEl)
                .setName('输入框占位符')
                .setDesc('输入框为空时显示的提示文字')
                .addText((text) =>
                    text
                        .setPlaceholder('输入新任务，回车添加...')
                        .setValue(this.plugin.settings.quickAdd?.placeholder ?? '输入新任务，回车添加...')
                        .onChange(async (value) => {
                            this.plugin.settings.quickAdd.placeholder = value;
                            await this.plugin.saveSettings();
                        })
                );

            new Setting(containerEl)
                .setName('按钮文字')
                .setDesc('添加按钮上显示的文字')
                .addText((text) =>
                    text
                        .setPlaceholder('添加')
                        .setValue(this.plugin.settings.quickAdd?.buttonText ?? '添加')
                        .onChange(async (value) => {
                            this.plugin.settings.quickAdd.buttonText = value;
                            await this.plugin.saveSettings();
                        })
                );

            new Setting(containerEl)
                .setName('添加成功通知')
                .setDesc('任务添加成功后是否弹出通知')
                .addToggle((toggle) =>
                    toggle
                        .setValue(this.plugin.settings.quickAdd?.showSuccessNotice ?? true)
                        .onChange(async (value) => {
                            this.plugin.settings.quickAdd.showSuccessNotice = value;
                            await this.plugin.saveSettings();
                        })
                );
        }

        // ── 启动行为 ──
        new Setting(containerEl).setName('启动行为').setHeading();

        new Setting(containerEl)
            .setName('启动时自动打开 WorkPage')
            .setDesc('Obsidian 启动后自动在工作区打开 WorkPage')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.openOnStartup).onChange(async (value) => {
                    this.plugin.settings.openOnStartup = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('无标签页时显示 WorkPage')
            .setDesc('关闭所有笔记后自动切换至 WorkPage')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.openWhenEmpty).onChange(async (value) => {
                    this.plugin.settings.openWhenEmpty = value;
                    await this.plugin.saveSettings();
                })
            );

        // ── 模板导入/导出 ──
        new Setting(containerEl).setName('导入/导出模板').setHeading();

        new Setting(containerEl)
            .setName('模板操作')
            .setDesc('备份或恢复分区布局')
            .addButton((btn) =>
                btn.setButtonText('导出模板').onClick(() => {
                    this.exportTemplate();
                })
            )
            .addButton((btn) =>
                btn.setButtonText('导入模板').onClick(() => {
                    this.importTemplate();
                })
            );

        // ── 添加新分区 ──
        new Setting(containerEl).addButton((btn) =>
            btn
                .setButtonText('添加新分区')
                .setCta()
                .onClick(async () => {
                    this.plugin.settings.sections.push({
                        id: Date.now().toString(),
                        title: '新分区',
                        type: 'custom_text',
                        content: '',
                    });
                    await this.plugin.saveSettings();
                    this.display();
                })
        );
    }

    private exportTemplate(): void {
        const data = { _version: 1, sections: this.plugin.settings.sections };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'workpage-template.json';
        a.click();
        URL.revokeObjectURL(url);
        new Notice('模板已导出');
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
                const data = JSON.parse(text) as { sections?: WorkPageSection[] };
                if (!data.sections || !Array.isArray(data.sections)) {
                    throw new Error('无效的模板文件：缺少 sections 字段');
                }
                for (const section of data.sections) {
                    if (!section.id || !section.title || !section.type) {
                        throw new Error('模板文件格式错误：每个分区必须包含 id、title、type');
                    }
                }
                this.plugin.settings.sections = data.sections;
                await this.plugin.saveSettings();
                this.display();
                new Notice('模板导入成功');
            } catch (error) {
                const message = error instanceof Error ? error.message : '未知错误';
                new Notice(`导入失败：${message}`);
            }
        };
        input.click();
    }
}