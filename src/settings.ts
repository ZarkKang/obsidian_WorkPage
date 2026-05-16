import { App, PluginSettingTab, Setting, Notice, Platform } from 'obsidian';
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

export interface CalendarConfig {
    compactMode?: boolean;
    mondayFirst?: boolean;
    showWeekNumbers?: boolean;
    showYearMonthSelect?: boolean;
    highlightToday?: boolean;
    showTaskCount?: boolean;
    dateFormat?: string;
    folderPath?: string;
}

export interface QuickAddSettings {
    enabled: boolean;
    placeholder: string;
    buttonText: string;
    label: string;
    position: 'top' | 'bottom';
    showSuccessNotice: boolean;
}

export interface WorkPageSection {
    id: string;
    title: string;
    type: 'tasks' | 'recent_files' | 'custom_text' | 'file_list'
        | 'dashboard' | 'calendar' | 'scratchpad' | 'tag_cloud';
    content: string;
    gridSpan?: number;          // 分区跨度列数 (1~3)
    maxFiles?: number;          // 最大显示数量
    sortBy?: 'mtime' | 'name'; // 排序字段
    sortOrder?: 'desc' | 'asc'; // 排序方向
    excludeFolders?: string;    // 排除的文件夹
    folder?: string;            // 目标文件夹路径
    nameFilter?: string;        // 过滤关键字
    buttons?: WorkPageButton[];
    scratchpadTarget?: 'daily' | 'new' | 'append'; // 草稿保存目标
    scratchpadFile?: string;     // 草稿目标文件
    tagMaxCount?: number;       // 最大标签数
    calendarConfig?: CalendarConfig; // 日历专属配置
}

export interface MyPluginSettings {
    sections: WorkPageSection[];        // 单一布局数据（向下兼容）
    desktopSections: WorkPageSection[]; // 电脑端专用独立布局数据
    mobileSections: WorkPageSection[];  // 手机端专用独立布局数据
    useSeparateLayouts: boolean;        // 是否分端管理布局
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
        { id: '1', title: '今日待办', type: 'tasks', content: '', gridSpan: 1 },
        { id: '2', title: '最近编辑', type: 'recent_files', content: '', gridSpan: 1 },
    ],
    // 电脑端精美多列默认界面
    desktopSections: [
        { id: 'd1', title: '今日统计看板', type: 'dashboard', content: '', gridSpan: 3 },
        { id: 'd2', title: '今日待办任务', type: 'tasks', content: '', gridSpan: 1 },
        { id: 'd3', title: '日历跳转器', type: 'calendar', content: '', gridSpan: 1 },
        { id: 'd4', title: '随手草稿纸', type: 'scratchpad', content: '', gridSpan: 1 },
        { id: 'd5', title: '最近编辑笔记', type: 'recent_files', content: '', gridSpan: 2 },
        { id: 'd6', title: '常用标签云', type: 'tag_cloud', content: '', gridSpan: 1 },
    ],
    // 手机端紧凑单列默认界面
    mobileSections: [
        { id: 'm1', title: '今日看板', type: 'dashboard', content: '', gridSpan: 1 },
        { id: 'm2', title: '今日待办', type: 'tasks', content: '', gridSpan: 1 },
        { id: 'm3', title: '随手草稿', type: 'scratchpad', content: '', gridSpan: 1 },
        { id: 'm4', title: '最近编辑', type: 'recent_files', content: '', gridSpan: 1 },
    ],
    useSeparateLayouts: true, // 默认启用双端界面分离
    openOnStartup: false,
    openWhenEmpty: false,
    quickAdd: { ...DEFAULT_QUICK_ADD },
};

// 策略导出助手：获取或判定当前终端应渲染的分区
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

        // 如果开启双端分立，允许在设置界面内手动切换配置的目标端
        let activeSections = this.plugin.settings.sections;
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
            activeSections = this.currentEditMode === 'mobile' ? this.plugin.settings.mobileSections : this.plugin.settings.desktopSections;
        }

        containerEl.createEl('h3', { text: `当前布局分区管理 (${this.plugin.settings.useSeparateLayouts ? (this.currentEditMode === 'mobile' ? '手机端' : '电脑端') : '通用全局'})` });

        activeSections.forEach((section, index) => {
            const secHeader = containerEl.createEl('h4', { text: `分区 ${index + 1}: ${section.title || '未命名'}` });
            secHeader.style.marginTop = '20px';

            // ── 分区基础设置 ──
            new Setting(containerEl)
                .setName('名称与组件类型')
                .setDesc('修改分区标题及展示的组件')
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
                            // 重置对应专属属性的初值
                            if (value === 'calendar' && !section.calendarConfig) section.calendarConfig = {};
                            await this.plugin.saveSettings();
                            this.display();
                        })
                )
                .addButton((btn) =>
                    btn
                        .setButtonText('删除分区')
                        .setWarning()
                        .onClick(async () => {
                            if (this.plugin.settings.useSeparateLayouts) {
                                if (this.currentEditMode === 'mobile') this.plugin.settings.mobileSections.splice(index, 1);
                                else this.plugin.settings.desktopSections.splice(index, 1);
                            } else {
                                this.plugin.settings.sections.splice(index, 1);
                            }
                            await this.plugin.saveSettings();
                            this.display();
                        })
                );

            // ── 分区尺寸/跨度设置（大小配置） ──
            new Setting(containerEl)
                .setName('组件跨列大小 (Grid Span)')
                .setDesc('在电脑端网格系统内占用的列宽（1~3列。注：手机端始终会自动紧凑平铺为1列）')
                .addSlider((slider) =>
                    slider
                        .setLimits(1, 3, 1)
                        .setValue(section.gridSpan || 1)
                        .setDynamicTooltip()
                        .onChange(async (value) => {
                            section.gridSpan = value;
                            await this.plugin.saveSettings();
                        })
                );

            // ── recent_files 专属 ──
            if (section.type === 'recent_files') {
                new Setting(containerEl)
                    .setName('最大显示数量')
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
                            .addOption('desc', '降序')
                            .addOption('asc', '升序')
                            .setValue(section.sortOrder || 'desc')
                            .onChange(async (value: 'desc' | 'asc') => {
                                section.sortOrder = value;
                                await this.plugin.saveSettings();
                            })
                    );

                new Setting(containerEl)
                    .setName('排除文件夹')
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
                    .addText((text) =>
                        text
                            .setValue(section.nameFilter || '')
                            .onChange(async (value) => {
                                section.nameFilter = value;
                                await this.plugin.saveSettings();
                            })
                    );

                new Setting(containerEl)
                    .setName('最大显示数量')
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
                    .setName('自定义 Markdown 内容')
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

            // ── calendar 专属（已正确修复挪回此处展示视图控件） ──
            if (section.type === 'calendar') {
                if (!section.calendarConfig) section.calendarConfig = {};

                new Setting(containerEl)
                    .setName('日历显示密度')
                    .addDropdown((drop) =>
                        drop
                            .addOption('normal', '标准模式')
                            .addOption('compact', '紧凑模式')
                            .setValue(section.calendarConfig.compactMode ? 'compact' : 'normal')
                            .onChange(async (value) => {
                                section.calendarConfig!.compactMode = value === 'compact';
                                await this.plugin.saveSettings();
                            })
                    );

                new Setting(containerEl)
                    .setName('周一作为第一天')
                    .addToggle((toggle) =>
                        toggle
                            .setValue(section.calendarConfig?.mondayFirst ?? false)
                            .onChange(async (value) => {
                                section.calendarConfig!.mondayFirst = value;
                                await this.plugin.saveSettings();
                            })
                    );

                new Setting(containerEl)
                    .setName('显示周数')
                    .addToggle((toggle) =>
                        toggle
                            .setValue(section.calendarConfig?.showWeekNumbers ?? false)
                            .onChange(async (value) => {
                                section.calendarConfig!.showWeekNumbers = value;
                                await this.plugin.saveSettings();
                            })
                    );

                new Setting(containerEl)
                    .setName('显示任务统计进度')
                    .addToggle((toggle) =>
                        toggle
                            .setValue(section.calendarConfig?.showTaskCount ?? true)
                            .onChange(async (value) => {
                                section.calendarConfig!.showTaskCount = value;
                                await this.plugin.saveSettings();
                            })
                    );

                new Setting(containerEl)
                    .setName('自定义日记文件夹路径')
                    .setDesc('留空则直接读取日记基础核心设置路径')
                    .addText((text) =>
                        text
                            .setPlaceholder('日记/每日')
                            .setValue(section.calendarConfig?.folderPath || '')
                            .onChange(async (value) => {
                                section.calendarConfig!.folderPath = value;
                                await this.plugin.saveSettings();
                            })
                    );
            }

            // ── 快捷按钮配置 ──
            const btnWrap = containerEl.createDiv();
            btnWrap.createEl('h5', { text: '⚙️ 区域快捷按钮配置' });
            if (!section.buttons) section.buttons = [];

            section.buttons.forEach((button, btnIndex) => {
                new Setting(btnWrap)
                    .setName(`动作按钮: ${button.label || '未命名'}`)
                    .addText((t) => t.setValue(button.label).setPlaceholder('按钮标签名称').onChange(async (v) => { button.label = v; await this.plugin.saveSettings(); }))
                    .addDropdown((d) => d
                        .addOption('refresh', '刷新')
                        .addOption('open-file', '打开文件')
                        .addOption('command', '运行命令')
                        .addOption('add-task', '添加待办任务')
                        .setValue(button.action.type)
                        .onChange(async (v: any) => { button.action.type = v; await this.plugin.saveSettings(); this.display(); })
                    )
                    .addText((t) => {
                        t.setValue(button.action.payload || '').setPlaceholder('动作参数(路径/命令ID)').onChange(async (v) => { button.action.payload = v; await this.plugin.saveSettings(); });
                        if (button.action.type !== 'open-file' && button.action.type !== 'command') t.setDisabled(true);
                    })
                    .addButton((b) => b.setButtonText('删除按钮').setWarning().onClick(async () => { section.buttons?.splice(btnIndex, 1); await this.plugin.saveSettings(); this.display(); }));
            });

            new Setting(btnWrap).addButton((b) => b.setButtonText('+ 新增关联动作按钮').setCta().onClick(async () => {
                section.buttons!.push({ id: Date.now().toString(), label: '新行动', icon: 'play', action: { type: 'refresh' } });
                await this.plugin.saveSettings();
                this.display();
            }));

            containerEl.createEl('hr');
        });

        // ── 添加新分区 ──
        new Setting(containerEl).addButton((btn) =>
            btn
                .setButtonText('+ 创建新页面分区')
                .setCta()
                .onClick(async () => {
                    const newSec: WorkPageSection = { id: Date.now().toString(), title: '未命名分区', type: 'custom_text', content: '', gridSpan: 1 };
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

        // ── 快速添加待办设置 ──
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
        }

        // ── 启动行为与模板 ──
        new Setting(containerEl).setName('全局环境与模板行为').setHeading();
        new Setting(containerEl).setName('软件启动时默认打开 WorkPage').addToggle((t) => t.setValue(this.plugin.settings.openOnStartup).onChange(async (v) => { this.plugin.settings.openOnStartup = v; await this.plugin.saveSettings(); }));
        new Setting(containerEl).setName('没有活跃标签页时强制回归 WorkPage').addToggle((t) => t.setValue(this.plugin.settings.openWhenEmpty).onChange(async (v) => { this.plugin.settings.openWhenEmpty = v; await this.plugin.saveSettings(); }));

        new Setting(containerEl)
            .setName('配置布局导出与备份')
            .addButton((b) => b.setButtonText('备份导出配置文件').onClick(() => this.exportTemplate()))
            .addButton((b) => b.setButtonText('导入还原备份配置').onClick(() => this.importTemplate()));
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