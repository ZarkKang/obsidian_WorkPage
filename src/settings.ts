import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import MyPlugin from './main';

export interface WorkPageButton {
    id: string;
    label: string;
    icon: string;
    action: {
        type: 'refresh' | 'open-file' | 'command' | 'add-task';
        payload?: string; // 对于 open-file: 文件路径; command: 命令ID; add-task: 默认任务文本(可选)
    };
}

export interface WorkPageSection {
    id: string;
    title: string;
    type: 'tasks' | 'recent_files' | 'custom_text' | 'file_list';
    content: string;

    sortBy?: 'mtime' | 'name';
    sortOrder?: 'desc' | 'asc';
    excludeFolders?: string;   // 用于 recent_files
    folder?: string;           // 用于 file_list
    nameFilter?: string;       // 用于 file_list
    buttons?: WorkPageButton[];
}

export interface MyPluginSettings {
    sections: WorkPageSection[];
}

export class SampleSettingTab extends PluginSettingTab {
    plugin: MyPlugin;

    constructor(app: App, plugin: MyPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        const buttonsContainer = containerEl.createDiv({ cls: 'workpage-buttons-config' });

        containerEl.empty();
        containerEl.createEl('h2', { text: 'WorkPage 布局设置' });
        containerEl.createEl('h4', { text: '快捷按钮' });
        // 遍历每个分区进行设置
        this.plugin.settings.sections.forEach((section, index) => {
            // ---------- 分区基本设置（名称、类型、删除） ----------
            new Setting(containerEl)
                .setName(`分区 ${index + 1}`)
                .setDesc(`设置 ${section.title} 的显示内容`)
                .addText(text => text
                    .setPlaceholder('分区名称')
                    .setValue(section.title)
                    .onChange(async (value) => {
                        section.title = value;
                        await this.plugin.saveSettings();
                    }))
                .addDropdown(drop => drop
                    .addOption('tasks', '今日待办')
                    .addOption('recent_files', '最近文件')
                    .addOption('custom_text', '自定义文字')
                    .addOption('file_list', '动态文件列表')
                    .setValue(section.type)
                    .onChange(async (value: any) => {
                        section.type = value;
                        await this.plugin.saveSettings();
                        this.display(); // 刷新界面
                    }))
                .addButton(btn => btn
                    .setButtonText("删除")
                    .setWarning()
                    .onClick(async () => {
                        this.plugin.settings.sections.splice(index, 1);
                        await this.plugin.saveSettings();
                        this.display();
                    }));

            // ---------- recent_files 专属设置 ----------
            if (section.type === 'recent_files') {
                // 最大文件数
                new Setting(containerEl)
                    .setName('最大显示数量')
                    .setDesc('最近文件列表最多展示几个文件（1~50）')
                    .addSlider(slider => slider
                        .setLimits(1, 50, 1)
                        .setValue(section.maxFiles || 10)
                        .onChange(async (value) => {
                            section.maxFiles = value;
                            await this.plugin.saveSettings();
                        }));

                // 排序依据
                new Setting(containerEl)
                    .setName('排序依据')
                    .addDropdown(dropdown => dropdown
                        .addOption('mtime', '修改时间')
                        .addOption('name', '文件名')
                        .setValue(section.sortBy || 'mtime')
                        .onChange(async (value: 'mtime' | 'name') => {
                            section.sortBy = value;
                            await this.plugin.saveSettings();
                        }));

                // 排序方向
                new Setting(containerEl)
                    .setName('排序方向')
                    .addDropdown(dropdown => dropdown
                        .addOption('desc', '降序（最新在前）')
                        .addOption('asc', '升序（最旧在前）')
                        .setValue(section.sortOrder || 'desc')
                        .onChange(async (value: 'desc' | 'asc') => {
                            section.sortOrder = value;
                            await this.plugin.saveSettings();
                        }));

                // 排除文件夹
                new Setting(containerEl)
                    .setName('排除文件夹')
                    .setDesc('跳过这些文件夹中的文件，多个文件夹用英文逗号分隔，例如：Archive,Templates')
                    .addText(text => text
                        .setPlaceholder('Archive,Templates')
                        .setValue(section.excludeFolders || '')
                        .onChange(async (value) => {
                            section.excludeFolders = value;
                            await this.plugin.saveSettings();
                        }));
            }

            // ---------- file_list 专属设置 ----------
            if (section.type === 'file_list') {
                // 目标文件夹
                new Setting(containerEl)
                    .setName('目标文件夹')
                    .setDesc('留空表示搜索整个仓库（例如输入 Areas）')
                    .addText(text => text
                        .setValue(section.folder || '')
                        .onChange(async (value) => {
                            section.folder = value;
                            await this.plugin.saveSettings();
                        }));


                new Setting(containerEl)
                    .setName('最大显示数量')
                    .setDesc('列表最多展示多少个文件（1~50）')
                    .addSlider(slider => slider
                        .setLimits(1, 50, 1)
                        .setValue(section.maxFiles || 20)   // 默认20
                        .onChange(async (value) => {
                            section.maxFiles = value;
                            await this.plugin.saveSettings();
                        }));
                // 文件名过滤
                new Setting(containerEl)
                    .setName('文件名过滤')
                    .setDesc('只显示文件名包含该文本的笔记（例如 MOC）')
                    .addText(text => text
                        .setValue(section.nameFilter || '')
                        .onChange(async (value) => {
                            section.nameFilter = value;
                            await this.plugin.saveSettings();
                        }));

                // 排序依据
                new Setting(containerEl)
                    .setName('排序依据')
                    .addDropdown(dropdown => dropdown
                        .addOption('name', '文件名')
                        .addOption('mtime', '修改时间')
                        .setValue(section.sortBy || 'name')
                        .onChange(async (value: 'name' | 'mtime') => {
                            section.sortBy = value;
                            await this.plugin.saveSettings();
                        }));

                // 排序方向
                new Setting(containerEl)
                    .setName('排序方向')
                    .addDropdown(dropdown => dropdown
                        .addOption('asc', '升序')
                        .addOption('desc', '降序')
                        .setValue(section.sortOrder || 'asc')
                        .onChange(async (value: 'asc' | 'desc') => {
                            section.sortOrder = value;
                            await this.plugin.saveSettings();
                        }));
            }

            // ---------- custom_text 专属设置 ----------
            if (section.type === 'custom_text') {
                new Setting(containerEl)
                    .setName('自定义内容')
                    .addTextArea(text => text
                        .setValue(section.content)
                        .onChange(async (value) => {
                            section.content = value;
                            await this.plugin.saveSettings();
                        }));
            }

            // ---------- 按钮设置 ----------



            if (!section.buttons) section.buttons = [];

            // 已有按钮列表
            section.buttons.forEach((button, btnIndex) => {
                new Setting(buttonsContainer)
                    .setName(button.label)
                    .setDesc(`动作: ${button.action.type}`)
                    .addText(text => text
                        .setValue(button.label)
                        .onChange(async (value) => {
                            button.label = value;
                            await this.plugin.saveSettings();
                        }))
                    .addDropdown(drop => drop
                        .addOption('refresh', '刷新')
                        .addOption('open-file', '打开文件')
                        .addOption('command', '命令')
                        .addOption('add-task', '添加任务')
                        .setValue(button.action.type)
                        .onChange(async (value: any) => {
                            button.action.type = value;
                            await this.plugin.saveSettings();
                            this.display();
                        }))
                    .addText(text => {
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
                    .addButton(btn => btn
                        .setButtonText('删除')
                        .setWarning()
                        .onClick(async () => {
                            section.buttons?.splice(btnIndex, 1);
                            await this.plugin.saveSettings();
                            this.display();
                        }));
            });

                // 添加按钮
                new Setting(buttonsContainer)
                    .addButton(btn => btn
                        .setButtonText('添加按钮')
                        .setCta()
                        .onClick(async () => {
                            section.buttons?.push({
                                id: Date.now().toString(),
                                label: '新按钮',
                                icon: 'play',
                                action: { type: 'refresh' }
                            });
                            await this.plugin.saveSettings();
                            this.display();
                        }));

            containerEl.createEl('hr'); // 视觉分隔
        });

                // 模板导入导出
                new Setting(containerEl)
                    .setName('导入/导出模板')
                    .setDesc('备份或恢复分区布局')
                    .addButton(btn => btn
                        .setButtonText('导出模板')
                        .onClick(() => this.exportTemplate()))
                    .addButton(btn => btn
                        .setButtonText('导入模板')
                        .onClick(() => this.importTemplate()));

        // ========== 启动行为（放在所有分区设置之后） ==========
            containerEl.createEl('h2', { text: '启动行为' });

                new Setting(containerEl)
                    .setName('启动时自动打开 WorkPage')
                    .setDesc('Obsidian 启动后自动在工作区打开 WorkPage')
                    .addToggle(toggle => toggle
                        .setValue(this.plugin.settings.openOnStartup)
                        .onChange(async (value) => {
                            this.plugin.settings.openOnStartup = value;
                            await this.plugin.saveSettings();
                        }));

                new Setting(containerEl)
                    .setName('无标签页时显示 WorkPage')
                    .setDesc('关闭所有笔记后自动切换至 WorkPage')
                    .addToggle(toggle => toggle
                        .setValue(this.plugin.settings.openWhenEmpty)
                        .onChange(async (value) => {
                            this.plugin.settings.openWhenEmpty = value;
                            await this.plugin.saveSettings();
                        }));

                // ========== 添加新分区按钮 ==========
                new Setting(containerEl)
                    .addButton(btn => btn
                        .setButtonText("添加新分区")
                        .setCta()
                        .onClick(async () => {
                            this.plugin.settings.sections.push({
                                id: Date.now().toString(),
                                title: '新分区',
                                type: 'custom_text',
                                content: ''
                            });
                            await this.plugin.saveSettings();
                            this.display();
                        }));
    }

    private exportTemplate() {
        const data = {
            _version: 1,
            sections: this.plugin.settings.sections
        };
        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'workpage-template.json';
        a.click();
        URL.revokeObjectURL(url);
        new Notice('模板已导出');
    }

    private importTemplate() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return;
            try {
                const text = await file.text();
                const data = JSON.parse(text);
                if (!data.sections || !Array.isArray(data.sections)) {
                    throw new Error('无效的模板文件：缺少 sections 字段');
                }
                // 验证每个分区必须的基本字段
                for (const section of data.sections) {
                    if (!section.id || !section.title || !section.type) {
                        throw new Error('模板文件格式错误：每个分区必须包含 id、title、type');
                    }
                }
                // 替换当前分区设置
                this.plugin.settings.sections = data.sections;
                await this.plugin.saveSettings();
                this.display(); // 刷新界面
                new Notice('模板导入成功');
            } catch (e: any) {
                new Notice('导入失败：' + e.message);
            }
        };
        input.click();
    }
}

export interface MyPluginSettings {
    sections: WorkPageSection[];
    openOnStartup: boolean;   // 启动时自动打开 WorkPage
    openWhenEmpty: boolean;   // 没有标签页时自动显示 WorkPage
}

export const DEFAULT_SETTINGS: MyPluginSettings = {
    sections: [
        { id: '1', title: '今日待办', type: 'tasks', content: '' },
        { id: '2', title: '最近编辑', type: 'recent_files', content: '' }
    ],
    openOnStartup: false,
    openWhenEmpty: false
};

export interface WorkPageSection {
    id: string;
    title: string;
    type: 'tasks' | 'recent_files' | 'custom_text' | 'file_list';
    content: string;

    // ---- 以下用于 recent_files 分区 ----

    maxFiles?: number;          // 最大显示数量
    sortBy?: 'mtime' | 'name';
    sortOrder?: 'desc' | 'asc';
    excludeFolders?: string;
    folder?: string;
    nameFilter?: string;
    buttons?: WorkPageButton[];
    
    // ---- 其他类型专属属性（如 file_list 已有）保持不动 ----
    
}