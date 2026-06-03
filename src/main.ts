import {
    App,
    AbstractInputSuggest,
    Plugin,
    ItemView,
    WorkspaceLeaf,
    TFile,
    TFolder,
    setIcon,
    MarkdownRenderer,
    Notice,
    Platform,
    Modal,
    Setting,
} from 'obsidian';
import {
    DEFAULT_SETTINGS,
    DEFAULT_QUICK_ADD,
    DEFAULT_SIDEBAR_SETTINGS,
    DEFAULT_TODO_SETTINGS,
    MyPluginSettings,
    WorkPageSettingTab,
    WorkPageSection,
    getCurrentSections,
} from './settings';

const VIEW_TYPE_WORKPAGE = 'work-page-view';

class FileSuggest extends AbstractInputSuggest<TFile> {
    private inputEl: HTMLInputElement;

    constructor(app: App, inputEl: HTMLInputElement) {
        super(app, inputEl);
        this.inputEl = inputEl;
    }

    getSuggestions(query: string): TFile[] {
        const lower = query.toLowerCase();
        const files = this.app.vault.getMarkdownFiles();
        return files
            .filter((f) => f.path.toLowerCase().includes(lower))
            .slice(0, 20);
    }

    renderSuggestion(file: TFile, el: HTMLElement): void {
        el.createSpan({ text: file.path });
    }

    selectSuggestion(file: TFile): void {
        this.inputEl.value = file.path;
        this.inputEl.dispatchEvent(new Event('input'));
        this.close();
    }
}

class SectionConfigModal extends Modal {
    plugin: MyPlugin;
    section: WorkPageSection;
    onSave: () => void;

    constructor(app: App, plugin: MyPlugin, section: WorkPageSection, onSave: () => void) {
        super(app);
        this.plugin = plugin;
        this.section = section;
        this.onSave = onSave;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('section-config-modal');
        contentEl.createEl('h2', { text: '分区设置' });

        new Setting(contentEl)
            .setName('分区名称')
            .addText((text) =>
                text
                    .setValue(this.section.title)
                    .onChange(async (v) => {
                        this.section.title = v;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(contentEl)
            .setName('组件类型')
            .addDropdown((drop) =>
                drop
                    .addOption('note', '笔记')
                    .addOption('todo', '今日待办')
                    .addOption('all-todo', '全部待办')
                    .addOption('memo', '备忘便签')
                    .addOption('dashboard', '仪表盘')
                    .addOption('concept', '概念笔记')
                    .setValue(this.section.type)
                    .onChange(async (v: WorkPageSection['type']) => {
                        this.section.type = v;
                        await this.plugin.saveSettings();
                        this.onOpen();
                    })
            );

        new Setting(contentEl)
            .setName('组件跨列大小 (Grid Span)')
            .addSlider((slider) =>
                slider
                    .setLimits(1, 3, 1)
                    .setValue(this.section.gridSpan || 1)
                    .setDynamicTooltip()
                    .onChange(async (v) => {
                        this.section.gridSpan = v;
                        await this.plugin.saveSettings();
                    })
            );

        if (this.section.type === 'note' || this.section.type === 'memo' || this.section.type === 'concept' || this.section.type === 'all-todo') {
            let fileInput: HTMLInputElement;
            new Setting(contentEl)
                .setName(this.section.type === 'all-todo' ? '任务文件夹路径' : '文件路径')
                .setDesc(this.section.type === 'concept' ? '新概念笔记的保存文件夹路径' :
                         this.section.type === 'all-todo' ? '留空使用全局设置，填写后仅扫描该文件夹内的待办任务' :
                         '输入关键词搜索库内笔记文件')
                .addText((text) => {
                    fileInput = text.inputEl;
                    text
                        .setPlaceholder(this.section.type === 'all-todo' ? '例如: Tasks（留空=全局设置）' : '')
                        .setValue(this.section.filePath || '')
                        .onChange(async (v) => {
                            this.section.filePath = v;
                            await this.plugin.saveSettings();
                        });
                });
            if (this.section.type !== 'concept' && this.section.type !== 'all-todo') {
                new FileSuggest(this.app, fileInput!);
            }
        }

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText('删除分区')
                    .setWarning()
                    .onClick(async () => {
                        const sections = getCurrentSections(this.plugin.settings);
                        const idx = sections.findIndex((s) => s.id === this.section.id);
                        if (idx >= 0) {
                            sections.splice(idx, 1);
                            await this.plugin.saveSettings();
                        }
                        this.close();
                        this.onSave();
                    })
            );
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
        this.onSave();
    }
}

declare module 'obsidian' {
    interface App {
        internalPlugins: {
            getEnabledPluginById(id: string): {
                options: { folder: string; format: string };
            } | null;
        };
        commands: {
            executeCommandById(id: string): boolean;
        };
        metadataCache: {
            getTags(): Record<string, number>;
        } & App['metadataCache'];
    }
    interface Window {
        moment: (date?: string, format?: string, strict?: boolean) => {
            format: (fmt: string) => string;
            daysInMonth: () => number;
            clone: () => any;
            startOf: (unit: string) => any;
            date: () => number;
            day: () => number;
            month: () => number;
            year: () => number;
            add: (n: number, unit: string) => any;
            subtract: (n: number, unit: string) => any;
            isSame: (other: any, unit?: string) => boolean;
            isAfter: (other: any) => boolean;
            isoWeek: () => number;
            isValid: () => boolean;
        };
    }
}

class WorkPageView extends ItemView {
    plugin: MyPlugin;
    private calendarMonth: any = null;

    constructor(leaf: WorkspaceLeaf, plugin: MyPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string { return VIEW_TYPE_WORKPAGE; }
    getDisplayText(): string { return 'WorkPage 工作台'; }

    async onOpen(): Promise<void> { await this.render(); }

    async render(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        if (!container) return;
        const scrollTop = container.scrollTop;
        container.empty();
        container.addClass('workpage-container');

        const header = container.createDiv({ cls: 'workpage-header' });
        header.createEl('h2', { text: Platform.isMobile ? '我的工作台 📱' : '我的工作台 🖥️' });

        const qa = this.plugin.settings.quickAdd ?? DEFAULT_QUICK_ADD;
        if (qa.enabled && qa.position === 'top') {
            this.renderQuickAdd(container);
        }

        const mainContainer = container.createDiv({ cls: 'workpage-main-container' });

        if (!Platform.isMobile && this.plugin.settings.sidebar?.enabled) {
            this.renderPageSidebar(mainContainer);
        }

        const grid = mainContainer.createDiv({ cls: 'workpage-grid' });
        grid.style.display = 'grid';
        grid.style.gap = '16px';
        grid.addClass(Platform.isMobile ? 'workpage-grid-mobile' : 'workpage-grid-desktop');

        const iconMap: Record<string, string> = {
            note: 'file-text',
            todo: 'check-circle',
            'all-todo': 'list-checks',
            memo: 'sticky-note',
            dashboard: 'bar-chart-2',
            concept: 'lightbulb',
        };

        const activeSections = getCurrentSections(this.plugin.settings);

        activeSections.forEach(async (section, idx) => {
            const sectionEl = grid.createDiv({ cls: 'workpage-section' });
            sectionEl.setAttribute('draggable', 'true');
            sectionEl.dataset.id = section.id;
            sectionEl.dataset.index = idx.toString();

            if (!Platform.isMobile) {
                const span = Math.min(section.gridSpan || 1, 3);
                sectionEl.style.gridColumn = `span ${span}`;
            }

            sectionEl.addEventListener('dragstart', (e) => {
                sectionEl.addClass('dragging');
                if (e.dataTransfer) {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', section.id);
                }
            });
            sectionEl.addEventListener('dragend', () => {
                sectionEl.removeClass('dragging');
                document.querySelectorAll('.workpage-section').forEach(el => el.removeClass('drag-over'));
            });
            sectionEl.addEventListener('dragover', (e) => {
                e.preventDefault();
                const dragging = document.querySelector('.dragging') as HTMLElement;
                if (dragging === sectionEl) return;
                sectionEl.addClass('drag-over');
            });
            sectionEl.addEventListener('dragleave', () => {
                sectionEl.removeClass('drag-over');
            });
            sectionEl.addEventListener('drop', (e) => {
                e.preventDefault();
                sectionEl.removeClass('drag-over');
                const draggingId = e.dataTransfer?.getData('text/plain');
                if (!draggingId) return;

                const sections = getCurrentSections(this.plugin.settings);
                const fromIdx = sections.findIndex(s => s.id === draggingId);
                const toIdx = idx;
                if (fromIdx < 0 || fromIdx === toIdx) return;

                const [moved] = sections.splice(fromIdx, 1);
                sections.splice(toIdx, 0, moved);
                void this.plugin.saveSettings().then(() => void this.render());
            });

            const titleEl = sectionEl.createEl('h3', { cls: 'section-title' });
            const handleIcon = titleEl.createSpan({ cls: 'section-drag-handle' });
            setIcon(handleIcon, 'grip-vertical');
            const iconSpan = titleEl.createSpan({ cls: 'section-icon' });
            setIcon(iconSpan, iconMap[section.type] || 'layout');

            let displayTitle = section.title;
            if (section.type === 'todo') {
                const today = window.moment().format('YYYY-MM-DD');
                displayTitle = `${section.title} (${today})`;
            }
            titleEl.createSpan({ text: displayTitle });

            const collapseBtn = titleEl.createSpan({ cls: 'section-collapse-btn' });
            setIcon(collapseBtn, section.collapsed ? 'chevron-right' : 'chevron-down');
            if (section.collapsed) {
                sectionEl.addClass('section-collapsed');
            }
            collapseBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const sections = getCurrentSections(this.plugin.settings);
                const target = sections.find(s => s.id === section.id);
                if (target) {
                    target.collapsed = !target.collapsed;
                    if (target.collapsed) {
                        sectionEl.addClass('section-collapsed');
                        setIcon(collapseBtn, 'chevron-right');
                    } else {
                        sectionEl.removeClass('section-collapsed');
                        setIcon(collapseBtn, 'chevron-down');
                    }
                    void this.plugin.saveSettings();
                }
            });

            const gearBtn = titleEl.createSpan({ cls: 'section-gear-btn' });
            setIcon(gearBtn, 'settings');
            gearBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                new SectionConfigModal(this.app, this.plugin, section, () => {
                    void this.render();
                }).open();
            });

            const content = sectionEl.createDiv({ cls: 'section-content' });

            if (section.type === 'todo') {
                await this.renderTodo(content);
            } else if (section.type === 'all-todo') {
                await this.renderAllTodo(content, section);
            } else if (section.type === 'note') {
                await this.renderNote(content, section);
            } else if (section.type === 'memo') {
                this.renderMemo(content, section);
            } else if (section.type === 'dashboard') {
                await this.renderDashboard(content);
            } else if (section.type === 'concept') {
                this.renderConcept(content, section);
            } else {
                content.createEl('p', { text: '未知分区类型' });
            }
        });

        const addBar = container.createDiv({ cls: 'workpage-add-bar' });
        const addBarLabel = addBar.createSpan({ cls: 'add-bar-label', text: '添加分区' });
        const addBarScroll = addBar.createDiv({ cls: 'add-bar-scroll' });

        // 移动端默认折叠添加分区选项
        if (Platform.isMobile) {
            addBar.addClass('add-bar-collapsed');
            addBarLabel.addEventListener('click', () => {
                addBar.classList.toggle('add-bar-collapsed');
            });
        }
        const sectionCategories = [
            {
                name: '📄 内容',
                items: [
                    { type: 'note' as const, icon: 'file-text', label: '笔记' },
                    { type: 'concept' as const, icon: 'lightbulb', label: '概念笔记' },
                    { type: 'dashboard' as const, icon: 'bar-chart-2', label: '仪表盘' },
                ]
            },
            {
                name: '✅ 任务',
                items: [
                    { type: 'todo' as const, icon: 'check-circle', label: '今日待办' },
                    { type: 'all-todo' as const, icon: 'list-checks', label: '全部待办' },
                    { type: 'memo' as const, icon: 'sticky-note', label: '备忘' },
                ]
            },
        ];
        sectionCategories.forEach((category) => {
            const catGroup = addBarScroll.createDiv({ cls: 'add-bar-category' });
            catGroup.createSpan({ cls: 'add-bar-cat-name', text: category.name });
            category.items.forEach(({ type, icon, label }) => {
                const btn = catGroup.createEl('button', { cls: 'add-bar-btn' });
                setIcon(btn.createSpan(), icon);
                btn.createSpan({ text: label });
                btn.addEventListener('click', () => {
                    const newSec: WorkPageSection = { id: Date.now().toString(), title: label, type, content: '', gridSpan: 1 };
                    if (this.plugin.settings.useSeparateLayouts) {
                        if (Platform.isMobile) {
                            this.plugin.settings.mobileSections.push(newSec);
                        } else {
                            this.plugin.settings.desktopSections.push(newSec);
                        }
                    } else {
                        this.plugin.settings.sections.push(newSec);
                    }
                    void this.plugin.saveSettings().then(() => { void this.render(); });
                });
            });
        });

        if (qa.enabled && qa.position !== 'top') {
            this.renderQuickAdd(container);
        }

        if (scrollTop > 0) {
            requestAnimationFrame(() => {
                container.scrollTop = scrollTop;
            });
        }
    }

    private async renderTodo(content: HTMLElement): Promise<void> {
        const loading = content.createEl('p', { text: '加载中...' });
        this.getTodayTasks()
            .then(({ todayTasks, overdueTasks }) => {
                loading.remove();
                const totalCount = todayTasks.length + overdueTasks.length;
                if (totalCount === 0) {
                    const todoSettings = this.plugin.settings.todoSettings;
                    const hasCustomFolder = todoSettings?.taskFolderPath && todoSettings.taskFolderPath.trim() !== '';
                    if (hasCustomFolder) {
                        content.createEl('p', { text: `文件夹 "${todoSettings.taskFolderPath}" 中暂无未完成的任务 ✨`, cls: 'no-data' });
                    } else {
                        const dailyPlugin = this.app.internalPlugins.getEnabledPluginById('daily-notes');
                        if (!dailyPlugin) {
                            content.createEl('p', { text: '请先启用核心插件"日记"或在设置中指定任务文件夹', cls: 'no-data' });
                        } else {
                            content.createEl('p', { text: '今天的日记暂无未完成的任务 ✨', cls: 'no-data' });
                        }
                    }
                    return;
                }

                const renderTaskItem = (task: { file: TFile; line: number; text: string; dueDate?: string | null; isOverdue?: boolean; daysRemaining?: number }, container: HTMLElement) => {
                    const li = container.createEl('li', { cls: 'workpage-list-item workpage-task-item' });
                    const checkbox = li.createEl('input', { cls: 'workpage-task-checkbox' });
                    checkbox.type = 'checkbox';
                    checkbox.checked = false;
                    const nameSpan = li.createSpan({ cls: 'item-name workpage-task-text' });
                    checkbox.addEventListener('change', (e) => {
                        e.stopPropagation();
                        if (checkbox.checked) {
                            nameSpan.addClass('workpage-task-done');
                            setTimeout(() => {
                                void this.completeTask(task.file, task.line).then(() => {
                                    void this.render();
                                });
                            }, 350);
                        }
                    });

                    const parsed = this.parseTaskDueDate(task.text.replace(/^\s*-\s*\[[ xX]?\]\s*/, '').trim());
                    nameSpan.setText(parsed.text);

                    if (task.dueDate) {
                        const dueDateBadge = li.createSpan({ cls: 'task-due-date-badge' });
                        if (task.isOverdue) {
                            dueDateBadge.addClass('urgent');
                            const overdueDays = task.daysRemaining ? Math.abs(task.daysRemaining) : 0;
                            dueDateBadge.setText(`⏰ 逾期${overdueDays}天`);
                        } else if (task.daysRemaining !== undefined && task.daysRemaining === 0) {
                            dueDateBadge.addClass('urgent');
                            dueDateBadge.setText('⏳ 今天截止');
                        } else if (task.daysRemaining !== undefined && task.daysRemaining <= 3) {
                            dueDateBadge.addClass('urgent');
                            dueDateBadge.setText(`⏳ 还剩${task.daysRemaining}天`);
                        } else if (task.daysRemaining !== undefined) {
                            dueDateBadge.setText(`⏳ 还剩${task.daysRemaining}天`);
                        } else {
                            dueDateBadge.setText(`📅 ${task.dueDate}`);
                        }
                    }

                    nameSpan.addEventListener('click', () => {
                        const leaf = this.app.workspace.getLeaf(false);
                        void leaf.openFile(task.file).then(() => {
                            const editor = this.app.workspace.activeEditor?.editor;
                            if (editor) editor.setCursor({ line: task.line, ch: 0 });
                        });
                    });
                };

                if (overdueTasks.length > 0) {
                    const overdueSection = content.createDiv({ cls: 'todo-section overdue-section' });
                    const overdueHeader = overdueSection.createDiv({ cls: 'todo-section-header overdue-header' });
                    overdueHeader.createSpan({ cls: 'todo-section-dot overdue-dot' });
                    overdueHeader.createSpan({ text: `未完成待办 (${overdueTasks.length})`, cls: 'todo-section-title' });

                    const ul = overdueSection.createEl('ul');
                    ul.style.cssText = 'list-style:none; padding:0; margin:0;';
                    overdueTasks.forEach(task => renderTaskItem(task, ul));
                }

                if (todayTasks.length > 0) {
                    const todaySection = content.createDiv({ cls: 'todo-section today-section' });
                    const todayHeader = todaySection.createDiv({ cls: 'todo-section-header today-header' });
                    todayHeader.createSpan({ cls: 'todo-section-dot today-dot' });
                    todayHeader.createSpan({ text: `今日待办 (${todayTasks.length})`, cls: 'todo-section-title' });

                    const ul = todaySection.createEl('ul');
                    ul.style.cssText = 'list-style:none; padding:0; margin:0;';
                    todayTasks.forEach(task => renderTaskItem(task, ul));
                }
            })
            .catch((error) => {
                console.error('获取任务失败', error);
                loading.remove();
                content.createEl('p', { text: '加载失败', cls: 'no-data' });
            });
    }

    private async renderAllTodo(content: HTMLElement, section: WorkPageSection): Promise<void> {
        const loading = content.createEl('p', { text: '加载中...' });
        const allTasks = await this.getAllTasks();
        loading.remove();

        const folderFilter = section.filePath?.trim() || '';

        const filteredTasks = folderFilter
            ? allTasks.filter(t => t.file.path.startsWith(folderFilter + '/') || t.file.path.startsWith(folderFilter))
            : allTasks;

        if (filteredTasks.length === 0) {
            if (folderFilter) {
                content.createEl('p', { text: `文件夹 "${folderFilter}" 中暂无未完成的任务 ✨`, cls: 'no-data' });
            } else {
                const todoSettings = this.plugin.settings.todoSettings;
                const hasCustomFolder = todoSettings?.taskFolderPath && todoSettings.taskFolderPath.trim() !== '';
                if (hasCustomFolder) {
                    content.createEl('p', { text: `文件夹 "${todoSettings.taskFolderPath}" 中暂无未完成的任务 ✨`, cls: 'no-data' });
                } else {
                    content.createEl('p', { text: '暂无未完成的任务 ✨', cls: 'no-data' });
                }
            }
            return;
        }

        const scrollWrap = content.createDiv({ cls: 'all-todo-scroll' });

        const today = window.moment().format('YYYY-MM-DD');
        const todayDate = new Date(today);

        const grouped: Record<string, { file: TFile; line: number; text: string; dueDate: string | null; isOverdue?: boolean; daysRemaining?: number }[]> = {};

        filteredTasks.forEach(task => {
            if (task.dueDate && task.isOverdue) {
                const key = task.dueDate;
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(task);
            } else if (task.dueDate === today) {
                const key = '__today__';
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(task);
            } else if (task.dueDate) {
                const key = task.dueDate;
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(task);
            } else {
                const key = '__nodate__';
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(task);
            }
        });

        const renderTaskItem = (task: { file: TFile; line: number; text: string; dueDate?: string | null; isOverdue?: boolean; daysRemaining?: number }, container: HTMLElement) => {
            const li = container.createEl('li', { cls: 'workpage-list-item workpage-task-item' });
            const checkbox = li.createEl('input', { cls: 'workpage-task-checkbox' });
            checkbox.type = 'checkbox';
            checkbox.checked = false;
            const nameSpan = li.createSpan({ cls: 'item-name workpage-task-text' });
            checkbox.addEventListener('change', (e) => {
                e.stopPropagation();
                if (checkbox.checked) {
                    nameSpan.addClass('workpage-task-done');
                    setTimeout(() => {
                        void this.completeTask(task.file, task.line).then(() => {
                            void this.render();
                        });
                    }, 350);
                }
            });

            const parsed = this.parseTaskDueDate(task.text.replace(/^\s*-\s*\[[ xX]?\]\s*/, '').trim());
            nameSpan.setText(parsed.text);

            if (task.dueDate) {
                const dueDateBadge = li.createSpan({ cls: 'task-due-date-badge' });
                if (task.isOverdue) {
                    dueDateBadge.addClass('urgent');
                    const overdueDays = task.daysRemaining ? Math.abs(task.daysRemaining) : 0;
                    dueDateBadge.setText(`⏰ 逾期${overdueDays}天`);
                } else if (task.daysRemaining !== undefined && task.daysRemaining === 0) {
                    dueDateBadge.addClass('urgent');
                    dueDateBadge.setText('⏳ 今天截止');
                } else if (task.daysRemaining !== undefined && task.daysRemaining <= 3) {
                    dueDateBadge.addClass('urgent');
                    dueDateBadge.setText(`⏳ 还剩${task.daysRemaining}天`);
                } else if (task.daysRemaining !== undefined) {
                    dueDateBadge.setText(`⏳ 还剩${task.daysRemaining}天`);
                } else {
                    dueDateBadge.setText(`📅 ${task.dueDate}`);
                }
            }

            const sourceLabel = li.createSpan({ cls: 'task-source-label' });
            sourceLabel.setText(task.file.basename);

            nameSpan.addEventListener('click', () => {
                const leaf = this.app.workspace.getLeaf(false);
                void leaf.openFile(task.file).then(() => {
                    const editor = this.app.workspace.activeEditor?.editor;
                    if (editor) editor.setCursor({ line: task.line, ch: 0 });
                });
            });
        };

        const dateKeys = Object.keys(grouped).filter(k => k !== '__today__' && k !== '__nodate__').sort();

        const overdueKeys = dateKeys.filter(k => k < today);
        const upcomingKeys = dateKeys.filter(k => k > today);

        const renderDateGroup = (key: string, tasks: typeof filteredTasks, isOverdue: boolean) => {
            const section = scrollWrap.createDiv({ cls: 'todo-section' });
            const header = section.createDiv({ cls: 'todo-section-header' });
            const dot = header.createSpan({ cls: `todo-section-dot ${isOverdue ? 'overdue-dot' : 'upcoming-dot'}` });
            const dateLabel = window.moment(key, 'YYYY-MM-DD').format('MM月DD日 ddd');
            header.createSpan({ text: `${dateLabel} (${tasks.length})`, cls: 'todo-section-title' });
            if (isOverdue) header.addClass('overdue-header');

            const ul = section.createEl('ul');
            ul.style.cssText = 'list-style:none; padding:0; margin:0;';
            tasks.forEach(t => renderTaskItem(t, ul));
        };

        overdueKeys.forEach(key => renderDateGroup(key, grouped[key], true));

        if (grouped['__today__']) {
            const todaySection = scrollWrap.createDiv({ cls: 'todo-section today-section' });
            const todayHeader = todaySection.createDiv({ cls: 'todo-section-header today-header' });
            todayHeader.createSpan({ cls: 'todo-section-dot today-dot' });
            todayHeader.createSpan({ text: `今日待办 (${grouped['__today__'].length})`, cls: 'todo-section-title' });
            const ul = todaySection.createEl('ul');
            ul.style.cssText = 'list-style:none; padding:0; margin:0;';
            grouped['__today__'].forEach(t => renderTaskItem(t, ul));
        }

        upcomingKeys.forEach(key => renderDateGroup(key, grouped[key], false));

        if (grouped['__nodate__']) {
            const noDateSection = scrollWrap.createDiv({ cls: 'todo-section no-date-section' });
            const noDateHeader = noDateSection.createDiv({ cls: 'todo-section-header no-date-header' });
            noDateHeader.createSpan({ cls: 'todo-section-dot no-date-dot' });
            noDateHeader.createSpan({ text: `未设截止日期 (${grouped['__nodate__'].length})`, cls: 'todo-section-title' });
            const ul = noDateSection.createEl('ul');
            ul.style.cssText = 'list-style:none; padding:0; margin:0;';
            grouped['__nodate__'].forEach(t => renderTaskItem(t, ul));
        }
    }

    private async renderNote(content: HTMLElement, section: WorkPageSection): Promise<void> {
        const filePath = section.filePath || '';
        if (!filePath) {
            content.createEl('p', { text: '请在设置中指定笔记文件路径', cls: 'no-data' });
            const btn = content.createEl('button', { cls: 'workpage-action-btn', text: '打开设置' });
            btn.addEventListener('click', () => {
                new SectionConfigModal(this.app, this.plugin, section, () => { void this.render(); }).open();
            });
            return;
        }
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) {
            content.createEl('p', { text: '未找到文件', cls: 'no-data' });
            const btn = content.createEl('button', { cls: 'workpage-action-btn', text: '创建文件' });
            btn.addEventListener('click', async () => {
                const template = this.plugin.settings.quickAdd?.fileTemplate || '';
                const created = await this.app.vault.create(filePath, template);
                new Notice('笔记已创建');
                void this.render();
            });
            return;
        }
        const text = await this.app.vault.read(file);
        const preview = content.createDiv({ cls: 'workpage-note-preview' });
        await MarkdownRenderer.render(this.app, text, preview, filePath, this);
        const editBtn = content.createEl('button', { cls: 'workpage-action-btn', text: '编辑笔记' });
        editBtn.addEventListener('click', () => {
            void this.app.workspace.getLeaf(false).openFile(file);
        });
    }

    private renderMemo(content: HTMLElement, section: WorkPageSection): void {
        const filePath = section.filePath || '备忘.md';
        const wrap = content.createDiv({ cls: 'workpage-memo' });

        const addRow = wrap.createDiv({ cls: 'memo-add-row' });
        const input = addRow.createEl('input', {
            cls: 'memo-add-input',
            placeholder: '添加备忘事项...',
        });
        input.type = 'text';
        const addBtn = addRow.createEl('button', { cls: 'memo-add-btn' });
        setIcon(addBtn.createSpan(), 'plus');
        addBtn.createSpan({ text: '添加' });

        const list = wrap.createDiv({ cls: 'memo-list' });

        const loadMemo = async () => {
            list.empty();
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (!(file instanceof TFile)) {
                list.createEl('p', { text: '暂无备忘事项', cls: 'no-data' });
                return;
            }
            const text = await this.app.vault.read(file);
            const lines = text.split('\n');
            const items = lines
                .map((line, i) => ({ line, i }))
                .filter(({ line }) => /^\s*-\s*\[[ xX]\]/.test(line));

            if (items.length === 0) {
                list.createEl('p', { text: '暂无备忘事项', cls: 'no-data' });
                return;
            }

            items.forEach(({ line, i }) => {
                const isDone = /^\s*-\s*\[[xX]\]/.test(line);
                const itemText = line.replace(/^\s*-\s*\[[ xX]?\]\s*/, '').trim();
                const row = list.createDiv({ cls: 'memo-item' });

                const checkbox = row.createEl('input', { cls: 'memo-item-checkbox' });
                checkbox.type = 'checkbox';
                checkbox.checked = isDone;

                const label = row.createSpan({ text: itemText, cls: 'memo-item-label' });
                if (isDone) label.addClass('memo-item-done');

                const delBtn = row.createEl('button', { cls: 'memo-item-del' });
                setIcon(delBtn, 'trash');

                checkbox.addEventListener('change', async () => {
                    const file = this.app.vault.getAbstractFileByPath(filePath);
                    if (!(file instanceof TFile)) return;
                    const content = await this.app.vault.read(file);
                    const lines = content.split('\n');
                    if (checkbox.checked) {
                        lines[i] = lines[i].replace(/\[[ xX]?\]/, '[x]');
                    } else {
                        lines[i] = lines[i].replace(/\[[xX]\]/, '[ ]');
                    }
                    await this.app.vault.modify(file, lines.join('\n'));
                    await loadMemo();
                });

                delBtn.addEventListener('click', async () => {
                    const file = this.app.vault.getAbstractFileByPath(filePath);
                    if (!(file instanceof TFile)) return;
                    const content = await this.app.vault.read(file);
                    const lines = content.split('\n');
                    lines.splice(i, 1);
                    await this.app.vault.modify(file, lines.join('\n'));
                    await loadMemo();
                });
            });
        };

        const addItem = async () => {
            const text = input.value.trim();
            if (!text) return;
            const entry = `- [ ] ${text}`;
            let targetFile = this.app.vault.getAbstractFileByPath(filePath);
            if (targetFile instanceof TFile) {
                const current = await this.app.vault.read(targetFile);
                await this.app.vault.modify(targetFile, current ? `${current}\n${entry}` : entry);
            } else {
                await this.app.vault.create(filePath, entry);
            }
            input.value = '';
            await loadMemo();
        };

        addBtn.addEventListener('click', () => { void addItem(); });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { void addItem(); }
        });

        void loadMemo();
    }

    private renderConcept(content: HTMLElement, section: WorkPageSection): void {
        const folderPath = section.filePath || '';
        const wrap = content.createDiv({ cls: 'workpage-concept' });

        const titleRow = wrap.createDiv({ cls: 'concept-title-row' });
        const titleInput = titleRow.createEl('input', {
            cls: 'concept-title-input',
            placeholder: '输入概念标题...',
        });
        titleInput.type = 'text';

        const tagsRow = wrap.createDiv({ cls: 'concept-tags-row' });
        const tagsInput = tagsRow.createEl('input', {
            cls: 'concept-tags-input',
            placeholder: '标签 (用 # 或空格分隔，如: #前端 #React)',
        });
        tagsInput.type = 'text';

        const bodyRow = wrap.createDiv({ cls: 'concept-body-row' });
        const bodyInput = bodyRow.createEl('textarea', {
            cls: 'concept-body-input',
            placeholder: '输入概念内容...',
        });

        const actionRow = wrap.createDiv({ cls: 'concept-action-row' });
        const folderHint = actionRow.createSpan({ cls: 'concept-folder-hint' });
        folderHint.setText(folderPath ? `保存至: ${folderPath}/` : '保存至: 库根目录/');

        const createBtn = actionRow.createEl('button', { cls: 'concept-create-btn' });
        setIcon(createBtn.createSpan({ cls: 'concept-create-btn-icon' }), 'plus');
        createBtn.createSpan({ text: '创建概念笔记' });

        const recentList = wrap.createDiv({ cls: 'concept-recent-list' });

        const loadRecent = async () => {
            recentList.empty();
            if (!folderPath) {
                recentList.createEl('p', { text: '设置保存文件夹后可查看最近创建的概念笔记', cls: 'no-data' });
                return;
            }
            const folder = this.app.vault.getAbstractFileByPath(folderPath);
            if (!folder || !('children' in folder)) {
                recentList.createEl('p', { text: '文件夹不存在，创建第一条笔记后将自动创建', cls: 'no-data' });
                return;
            }
            const files = (folder as any).children
                .filter((f: any) => f instanceof TFile && f.extension === 'md')
                .sort((a: any, b: any) => b.stat.mtime - a.stat.mtime)
                .slice(0, 8);
            if (files.length === 0) {
                recentList.createEl('p', { text: '暂无概念笔记', cls: 'no-data' });
                return;
            }
            const header = recentList.createDiv({ cls: 'concept-recent-header' });
            header.createSpan({ text: '最近创建' });

            files.forEach((file: TFile) => {
                const item = recentList.createDiv({ cls: 'concept-recent-item' });
                setIcon(item.createSpan({ cls: 'concept-recent-icon' }), 'lightbulb');
                item.createSpan({ text: file.basename, cls: 'concept-recent-name' });
                item.addEventListener('click', () => {
                    void this.app.workspace.getLeaf(false).openFile(file);
                });
            });
        };

        const createNote = async () => {
            const title = titleInput.value.trim();
            const body = bodyInput.value.trim();
            const tagsRaw = tagsInput.value.trim();

            if (!title) {
                titleInput.addClass('concept-input-error');
                setTimeout(() => titleInput.removeClass('concept-input-error'), 600);
                return;
            }

            const tags = tagsRaw
                .split(/[\s,]+/)
                .map(t => t.startsWith('#') ? t : `#${t}`)
                .filter(t => t.length > 1)
                .join(' ');

            const now = window.moment();
            const timestamp = now.format('YYYYMMDDHHmmss');
            const safeTitle = title.replace(/[\\/:*?"<>|]/g, '-');
            const fileName = `${timestamp} ${safeTitle}.md`;
            const filePath = folderPath ? `${folderPath}/${fileName}` : fileName;

            const frontmatter = [
                '---',
                `title: "${title}"`,
                `date: ${now.format('YYYY-MM-DD')}`,
                `tags: [${tagsRaw.split(/[\s,]+/).filter(t => t.length > 0).map(t => t.replace(/^#/, '')).join(', ')}]`,
                '---',
                '',
            ].join('\n');

            const content = `${frontmatter}${body}`;

            try {
                const folder = folderPath ? this.app.vault.getAbstractFileByPath(folderPath) : null;
                if (folderPath && !folder) {
                    const parts = folderPath.split('/');
                    let currentPath = '';
                    for (const part of parts) {
                        currentPath = currentPath ? `${currentPath}/${part}` : part;
                        const existing = this.app.vault.getAbstractFileByPath(currentPath);
                        if (!existing) {
                            await this.app.vault.createFolder(currentPath);
                        }
                    }
                }
                await this.app.vault.create(filePath, content);
                new Notice(`✅ 概念笔记已创建: ${title}`);
                titleInput.value = '';
                bodyInput.value = '';
                tagsInput.value = '';
                await loadRecent();
            } catch (e) {
                new Notice(`❌ 创建失败: ${e instanceof Error ? e.message : String(e)}`);
            }
        };

        createBtn.addEventListener('click', () => { void createNote(); });
        titleInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { void createNote(); }
        });

        void loadRecent();
    }

    private async renderDashboard(content: HTMLElement): Promise<void> {
        content.addClass('workpage-dashboard-modern');
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayTs = todayStart.getTime();

        const allFiles = this.app.vault.getMarkdownFiles();
        const createdToday = allFiles.filter((f) => f.stat.ctime >= todayTs).length;
        const modifiedToday = allFiles.filter((f) => f.stat.mtime >= todayTs).length;
        const totalNotes = allFiles.length;

        let doneTasks = 0, pendingTasks = 0;
        const dailyPlugin = this.app.internalPlugins.getEnabledPluginById('daily-notes');
        if (dailyPlugin) {
            const { folder, format } = dailyPlugin.options;
            const today = window.moment().format(format || 'YYYY-MM-DD');
            const filePath = `${folder ? `${folder}/` : ''}${today}.md`;
            const dailyFile = this.app.vault.getAbstractFileByPath(filePath);
            if (dailyFile instanceof TFile) {
                const text = await this.app.vault.read(dailyFile);
                doneTasks = (text.match(/^\s*-\s*\[x\]/gim) || []).length;
                pendingTasks = (text.match(/^\s*-\s*\[ \]/gm) || []).length;
            }
        }

        const totalTasks = doneTasks + pendingTasks;
        const donePercent = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

        const statsGrid = content.createDiv({ cls: 'modern-dashboard-grid' });
        const stats = [
            { icon: 'file-plus', label: '今日灵感新建', value: String(createdToday), type: 'create' },
            { icon: 'file-edit', label: '今日知识沉淀', value: String(modifiedToday), type: 'modify' },
            { icon: 'library', label: '全库笔记总数', value: String(totalNotes), type: 'total' },
            { icon: 'check-square', label: '待办任务追踪', value: `${doneTasks}/${totalTasks}`, type: 'task' },
        ];

        stats.forEach(({ icon, label, value, type }) => {
            const card = statsGrid.createDiv({ cls: `modern-stat-card card-${type}` });
            
            const metaWrap = card.createDiv({ cls: 'modern-card-meta' });
            const iconEl = metaWrap.createDiv({ cls: 'modern-stat-icon' });
            setIcon(iconEl, icon);
            metaWrap.createDiv({ cls: 'modern-stat-label', text: label });
            
            card.createDiv({ cls: 'modern-stat-value', text: value });
        });

        const progressContainer = content.createDiv({ cls: 'modern-progress-container' });
        if (totalTasks > 0) {
            const progressInfo = progressContainer.createDiv({ cls: 'modern-progress-info' });
            
            const textGroup = progressInfo.createDiv({ cls: 'modern-progress-text-group' });
            textGroup.createDiv({ cls: 'modern-progress-title' }).setText('今日目标达成率');
            textGroup.createDiv({ cls: 'modern-progress-desc' }).setText(`已关闭 ${doneTasks} 项就绪任务，剩余 ${pendingTasks} 项推进中`);
            
            progressInfo.createDiv({ cls: 'modern-progress-percentage', text: `${donePercent}%` });

            const bar = progressContainer.createDiv({ cls: 'modern-progress-bar-track' });
            const fill = bar.createDiv({ cls: 'modern-progress-bar-fill' });
            
            setTimeout(() => { 
                fill.style.width = `${donePercent}%`; 
                if (donePercent === 100) {
                    fill.addClass('progress-complete');
                }
            }, 100);
        } else {
            const emptyState = progressContainer.createDiv({ cls: 'modern-dashboard-empty' });
            setIcon(emptyState.createDiv({ cls: 'empty-icon' }), 'sparkles');
            emptyState.createDiv({ cls: 'empty-text', text: '今日暂无规划任务，开启轻松的一天吧 ✨' });
        }
    }

    private renderPageSidebar(mainContainer: HTMLElement): void {
        const sidebar = mainContainer.createDiv({ cls: 'workpage-page-sidebar' });
        const settings = this.plugin.settings.sidebar;
        if (!settings) return;

        const collapsed = settings.collapsed;
        if (collapsed) {
            sidebar.addClass('sidebar-collapsed');
        }

        const toggleBtn = sidebar.createDiv({ cls: 'sidebar-toggle-btn' });
        setIcon(toggleBtn, collapsed ? 'chevron-right' : 'chevron-left');
        toggleBtn.addEventListener('click', () => {
            this.plugin.settings.sidebar.collapsed = !this.plugin.settings.sidebar.collapsed;
            void this.plugin.saveSettings();
        });

        const shortcutsSection = sidebar.createDiv({ cls: 'sidebar-section' });
        const shortcutsHeader = shortcutsSection.createDiv({ cls: 'sidebar-section-header' });
        shortcutsHeader.createEl('h3', { text: '⚡ 快捷操作' });
        const shortcutsContainer = shortcutsSection.createDiv({ cls: 'sidebar-shortcuts' });

        if (!settings.shortcuts || settings.shortcuts.length === 0) {
            shortcutsContainer.createEl('p', { text: '暂无快捷操作', cls: 'no-data' });
        } else {
            settings.shortcuts.forEach((shortcut) => {
                const btn = shortcutsContainer.createDiv({ cls: 'sidebar-shortcut-item' });
                setIcon(btn.createSpan({ cls: 'shortcut-icon' }), shortcut.icon);
                btn.createSpan({ text: shortcut.label, cls: 'shortcut-label' });
                btn.addEventListener('click', () => {
                    void this.executePageShortcut(shortcut);
                });
            });
        }

        const recentSection = sidebar.createDiv({ cls: 'sidebar-section' });
        const recentHeader = recentSection.createDiv({ cls: 'sidebar-section-header' });
        recentHeader.createEl('h3', { text: '📄 最近编辑' });
        const refreshBtn = recentHeader.createEl('button', { cls: 'sidebar-refresh-btn', title: '刷新文件列表' });
        setIcon(refreshBtn, 'refresh-cw');
        refreshBtn.addEventListener('click', () => {
            void this.render();
        });

        const recentContainer = recentSection.createDiv({ cls: 'sidebar-recent-files' });
        const maxFiles = settings.maxRecentFiles || 15;
        let files = this.app.vault.getMarkdownFiles();
        files = files.sort((a, b) => b.stat.mtime - a.stat.mtime).slice(0, maxFiles);

        if (files.length === 0) {
            recentContainer.createEl('p', { text: '暂无编辑记录', cls: 'no-data' });
        } else {
            files.forEach((file) => {
                const item = recentContainer.createDiv({ cls: 'sidebar-file-item' });
                setIcon(item.createSpan({ cls: 'file-icon' }), 'file-text');
                item.createSpan({ text: file.basename, cls: 'file-name' });
                item.addEventListener('click', () => {
                    void this.app.workspace.getLeaf(false).openFile(file);
                });
            });
        }
    }

    private async executePageShortcut(shortcut: any): Promise<void> {
        try {
            switch (shortcut.type) {
                case 'obsidian-command':
                    this.app.commands.executeCommandById(shortcut.payload);
                    break;
                case 'system-cmd':
                    await this.executeSystemCmd(shortcut.payload, false);
                    break;
                case 'system-script':
                    await this.executeSystemCmd(shortcut.payload, true);
                    break;
            }
        } catch (error) {
            new Notice(`❌ 执行失败: ${error instanceof Error ? error.message : String(error)}`);
            console.error('快捷操作执行失败:', error);
        }
    }

    private async executeSystemCmd(cmdOrPath: string, isScript: boolean): Promise<void> {
        try {
            const { exec, execFile } = await import('child_process');
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('命令执行超时'));
                }, 30000);

                try {
                    if (isScript) {
                        execFile(cmdOrPath, (error, stdout, stderr) => {
                            clearTimeout(timeout);
                            if (error) {
                                reject(error);
                            } else {
                                if (stdout) new Notice(`✅ ${stdout.substring(0, 100)}`);
                                resolve();
                            }
                        });
                    } else {
                        exec(cmdOrPath, (error, stdout, stderr) => {
                            clearTimeout(timeout);
                            if (error) {
                                reject(error);
                            } else {
                                if (stdout) new Notice(`✅ ${stdout.substring(0, 100)}`);
                                resolve();
                            }
                        });
                    }
                } catch (e) {
                    clearTimeout(timeout);
                    reject(e);
                }
            });
        } catch (e) {
            new Notice('❌ 无法执行系统命令');
            throw e;
        }
    }

    renderQuickAdd(container: HTMLElement): void {
        const qa = this.plugin.settings.quickAdd ?? DEFAULT_QUICK_ADD;
        if (!qa.enabled) return;

        const quickDiv = container.createDiv({ cls: 'workpage-quick-add' });
        const inputWrap = quickDiv.createDiv({ cls: 'quick-add-input-wrap' });

        const dateInput = inputWrap.createEl('input', {
            type: 'date',
            cls: 'quick-add-date'
        });
        dateInput.value = window.moment().format('YYYY-MM-DD');
        dateInput.title = '添加至日期';

        const dueDateInput = inputWrap.createEl('input', {
            type: 'date',
            cls: 'quick-add-due-date'
        });
        dueDateInput.title = '截止日期（可选）';
        dueDateInput.style.cssText = 'opacity:0.7;';

        const input = inputWrap.createEl('input', { type: 'text', placeholder: qa.placeholder, cls: 'quick-add-input' });
        const btn = inputWrap.createEl('button', { cls: 'quick-add-btn', text: qa.buttonText });

        const add = async () => {
            const text = input.value.trim();
            const selectedDate = dateInput.value;
            const dueDate = dueDateInput.value || undefined;
            if (!text) return;

            await this.addTaskToDate(text, selectedDate, dueDate);
            input.value = '';
            dueDateInput.value = '';
            if (qa.showSuccessNotice) {
                let msg = `✅ 已成功添加待办至日记 (${selectedDate})`;
                if (dueDate) msg += `，截止日期: ${dueDate}`;
                new Notice(msg);
            }
            await this.render();
        };
        btn.addEventListener('click', () => { void add(); });
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') void add(); });
    }

    quickAddTask(defaultText = ''): void {
        const modal = new Modal(this.app);
        modal.setTitle('新建任务');
        const contentEl = modal.contentEl;
        contentEl.createEl('label', { text: '任务描述' });
        const taskInput = contentEl.createEl('input', { type: 'text', placeholder: '输入任务内容' });
        taskInput.value = defaultText;
        taskInput.style.cssText = 'width:100%;padding:8px;margin-bottom:12px;';
        contentEl.createEl('label', { text: '添加至（特定日需悬梯）' });
        const targetDateInput = contentEl.createEl('input', { type: 'date' });
        targetDateInput.value = window.moment().format('YYYY-MM-DD');
        targetDateInput.style.cssText = 'width:100%;padding:8px;margin-bottom:12px;';
        contentEl.createEl('label', { text: '截止日期（可选）' });
        const dueDateInput = contentEl.createEl('input', { type: 'date' });
        dueDateInput.style.cssText = 'width:100%;padding:8px;margin-bottom:12px;';
        const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
        buttonContainer.style.cssText = 'display:flex;gap:8px;margin-top:16px;';
        const confirmBtn = buttonContainer.createEl('button', { text: '确定' });
        confirmBtn.style.cssText = 'flex:1;padding:8px;';
        const cancelBtn = buttonContainer.createEl('button', { text: '取消' });
        cancelBtn.style.cssText = 'flex:1;padding:8px;';
        confirmBtn.addEventListener('click', async () => {
            const taskText = taskInput.value.trim();
            if (!taskText) {
                new Notice('请输入任务内容');
                return;
            }
            const dueDate = dueDateInput.value || undefined;
            await this.addTaskToDate(taskText, targetDateInput.value, dueDate);
            new Notice(`✅ 已成功添加待办至日记 (${targetDateInput.value})`);
            modal.close();
            await this.render();
        });
        cancelBtn.addEventListener('click', () => {
            modal.close();
        });
        modal.open();
    }

    async addTaskToDate(taskText: string, targetDateStr?: string, dueDate?: string): Promise<void> {
        const dailyPlugin = this.app.internalPlugins.getEnabledPluginById('daily-notes');
        if (!dailyPlugin) {
            new Notice('错误：请先开启 Obsidian 自带的"日记"核心插件');
            return;
        }

        const { folder, format } = dailyPlugin.options;
        const targetMoment = targetDateStr ? window.moment(targetDateStr, 'YYYY-MM-DD') : window.moment();
        const dateFileName = targetMoment.format(format || 'YYYY-MM-DD');
        const filePath = `${folder ? `${folder}/` : ''}${dateFileName}.md`;
        const template = this.plugin.settings.quickAdd?.fileTemplate || '';

        let file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) {
            file = await this.app.vault.create(filePath, template);
        }

        const cleanText = taskText.replace(/^\s*-\s*\[[ xX]?\]\s*/, '').trim();
        if (!cleanText) return;

        const currentContent = await this.app.vault.read(file as TFile);
        let taskContent = `- [ ] ${cleanText}`;
        if (dueDate) {
            taskContent += ` 📅${dueDate}`;
        }
        const newContent = currentContent ? `${currentContent}\n${taskContent}` : taskContent;
        await this.app.vault.modify(file as TFile, newContent);
    }

    async completeTask(file: TFile, lineIndex: number): Promise<void> {
        const fileContent = await this.app.vault.read(file);
        const lines = fileContent.split('\n');
        const line = lines[lineIndex];
        if (line === undefined) return;
        lines[lineIndex] = line.replace(/^(\s*-\s*)\[ \]/, '$1[x]');
        await this.app.vault.modify(file, lines.join('\n'));
    }

    private parseTaskDueDate(taskText: string): { text: string; dueDate: string | null } {
        const dueMatch = taskText.match(/\s*📅(\d{4}-\d{2}-\d{2})(?:\s|$)/);
        if (dueMatch) {
            const cleanText = taskText.replace(/\s*📅\d{4}-\d{2}-\d{2}(?:\s|$)/, '').trim();
            return { text: cleanText, dueDate: dueMatch[1] };
        }
        return { text: taskText, dueDate: null };
    }

    private sortTasks(tasks: { file: TFile; line: number; text: string; dueDate: string | null; isOverdue?: boolean; daysRemaining?: number }[]): { file: TFile; line: number; text: string; dueDate: string | null; isOverdue?: boolean; daysRemaining?: number }[] {
        const today = window.moment().format('YYYY-MM-DD');
        const todayDate = new Date(today);
        return tasks.sort((a, b) => {
            const aOverdue = a.dueDate && new Date(a.dueDate) < todayDate;
            const bOverdue = b.dueDate && new Date(b.dueDate) < todayDate;
            const aToday = a.dueDate === today;
            const bToday = b.dueDate === today;
            const aNoDate = !a.dueDate;
            const bNoDate = !b.dueDate;

            if (aNoDate && !bNoDate) return 1;
            if (!aNoDate && bNoDate) return -1;
            if (aOverdue && !bOverdue) return -1;
            if (!aOverdue && bOverdue) return 1;
            if (aToday && !bToday && !aOverdue && !bOverdue) return -1;
            if (!aToday && bToday && !aOverdue && !bOverdue) return 1;
            if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) {
                return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
            }
            return 0;
        });
    }

    private async getAllTasks(): Promise<{ file: TFile; line: number; text: string; dueDate: string | null; isOverdue?: boolean; daysRemaining?: number }[]> {
        const tasks: { file: TFile; line: number; text: string; dueDate: string | null; isOverdue?: boolean; daysRemaining?: number }[] = [];
        const todoSettings = this.plugin.settings.todoSettings;
        const taskFolderPath = todoSettings?.taskFolderPath || '';
        const includeSubfolders = todoSettings?.includeSubfolders ?? false;

        let files: TFile[] = [];

        if (taskFolderPath) {
            const folderObj = this.app.vault.getAbstractFileByPath(taskFolderPath);
            if (folderObj && 'children' in folderObj) {
                const collectFiles = (folder: any) => {
                    for (const child of folder.children) {
                        if (child instanceof TFile && child.extension === 'md') {
                            files.push(child);
                        } else if (includeSubfolders && 'children' in child) {
                            collectFiles(child);
                        }
                    }
                };
                collectFiles(folderObj);
            }
        } else {
            const dailyPlugin = this.app.internalPlugins.getEnabledPluginById('daily-notes');
            if (dailyPlugin) {
                const { folder } = dailyPlugin.options;
                const folderPath = folder || '';
                if (folderPath) {
                    const folderObj = this.app.vault.getAbstractFileByPath(folderPath);
                    if (folderObj && 'children' in folderObj) {
                        files = (folderObj as any).children.filter((f: any) => f instanceof TFile && f.extension === 'md');
                    }
                } else {
                    files = this.app.vault.getMarkdownFiles();
                }
            } else {
                files = this.app.vault.getMarkdownFiles();
            }
        }

        const today = window.moment().format('YYYY-MM-DD');
        const todayDate = new Date(today);

        for (const file of files) {
            try {
                const content = await this.app.vault.read(file);
                const lines = content.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    if (line && /^\s*-\s*\[ \]/.test(line)) {
                        const taskText = line.replace(/^\s*-\s*\[[ xX]?\]\s*/, '').trim();
                        const parsed = this.parseTaskDueDate(taskText);
                        const isOverdue = parsed.dueDate && new Date(parsed.dueDate) < todayDate ? true : undefined;
                        let daysRemaining: number | undefined;
                        if (parsed.dueDate) {
                            const dueDate = new Date(parsed.dueDate);
                            const diffTime = dueDate.getTime() - todayDate.getTime();
                            daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        }
                        tasks.push({
                            file,
                            line: i,
                            text: line.trim(),
                            dueDate: parsed.dueDate,
                            isOverdue,
                            daysRemaining,
                        });
                    }
                }
            } catch (e) {
                console.error('Error reading file:', (file as any).path, e);
            }
        }
        return this.sortTasks(tasks);
    }

    async getTodayTasks(): Promise<{
        todayTasks: { file: TFile; line: number; text: string; dueDate?: string | null; isOverdue?: boolean; daysRemaining?: number }[];
        overdueTasks: { file: TFile; line: number; text: string; dueDate?: string | null; isOverdue?: boolean; daysRemaining?: number }[];
    }> {
        const allTasks = await this.getAllTasks();
        const today = window.moment().format('YYYY-MM-DD');
        const todayDate = new Date(today);
        const todoSettings = this.plugin.settings.todoSettings;
        const taskFolderPath = todoSettings?.taskFolderPath || '';

        let filteredTasks = allTasks;

        if (!taskFolderPath) {
            const dailyPlugin = this.app.internalPlugins.getEnabledPluginById('daily-notes');
            if (dailyPlugin) {
                const { folder } = dailyPlugin.options;
                const todayFilePath = `${folder ? `${folder}/` : ''}${today}.md`;
                filteredTasks = allTasks.filter((task) => (task.file as any).path === todayFilePath);
            }
        }

        const todayTasks = filteredTasks.filter(t => !t.isOverdue);
        const overdueTasks = filteredTasks.filter(t => t.isOverdue);

        return { todayTasks, overdueTasks };
    }
}

export default class MyPlugin extends Plugin {
    settings: MyPluginSettings;

    async onload(): Promise<void> {
        await this.loadSettings();
        this.registerView(VIEW_TYPE_WORKPAGE, (leaf) => new WorkPageView(leaf, this));
        this.addRibbonIcon('layout', '打开 WorkPage', () => { void this.activateView(); });
        this.addSettingTab(new WorkPageSettingTab(this.app, this));

        this.addCommand({
            id: 'workpage-go-home',
            name: '回到 WorkPage 主页',
            callback: () => { void this.activateView(); }
        });

        this.registerEvent(
            this.app.vault.on('modify', () => {
                this.app.workspace.getLeavesOfType(VIEW_TYPE_WORKPAGE).forEach((leaf) => {
                    if (leaf.view instanceof WorkPageView) void leaf.view.render();
                });
            })
        );

        if (this.settings.openOnStartup) {
            this.app.workspace.onLayoutReady(() => { void this.activateView(); });
        }
    }

    async activateView(): Promise<void> {
        const { workspace } = this.app;
        let leaf = workspace.getLeavesOfType(VIEW_TYPE_WORKPAGE)[0];
        if (!leaf) {
            leaf = workspace.getLeaf('tab');
            await leaf.setViewState({ type: VIEW_TYPE_WORKPAGE, active: true });
        }
        workspace.revealLeaf(leaf);
    }

    async loadSettings(): Promise<void> {
        const data = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
        if (data?.quickAdd) this.settings.quickAdd = Object.assign({}, DEFAULT_QUICK_ADD, data.quickAdd);
        if (!data?.sidebar) {
            this.settings.sidebar = { ...DEFAULT_SIDEBAR_SETTINGS };
        } else {
            this.settings.sidebar = Object.assign({}, DEFAULT_SIDEBAR_SETTINGS, data.sidebar);
        }
        if (!data?.todoSettings) {
            this.settings.todoSettings = { ...DEFAULT_TODO_SETTINGS };
        } else {
            this.settings.todoSettings = Object.assign({}, DEFAULT_TODO_SETTINGS, data.todoSettings);
        }
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
        const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_WORKPAGE)[0];
        if (leaf && leaf.view instanceof WorkPageView) {
            await leaf.view.render();
        }
    }
}