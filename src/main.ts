import {
    Plugin,
    ItemView,
    WorkspaceLeaf,
    TFile,
    setIcon,
    MarkdownRenderer,
    Notice,
    Platform,
} from 'obsidian';
import {
    DEFAULT_SETTINGS,
    DEFAULT_QUICK_ADD,
    MyPluginSettings,
    WorkPageSettingTab,
    WorkPageButton,
    WorkPageSection,
    getCurrentSections,
} from './settings';

const VIEW_TYPE_WORKPAGE = 'work-page-view';

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
        container.empty();
        container.addClass('workpage-container');

        const header = container.createDiv({ cls: 'workpage-header' });
        header.createEl('h2', { text: Platform.isMobile ? '我的工作台 📱' : '我的工作台 🖥️' });

        const qa = this.plugin.settings.quickAdd ?? DEFAULT_QUICK_ADD;
        if (qa.enabled && qa.position === 'top') {
            this.renderQuickAdd(container);
        }

        // ── 多端响应式网格大小设置实现 ──
        const grid = container.createDiv({ cls: 'workpage-grid' });
        grid.style.display = 'grid';
        grid.style.gap = '16px';
        
        if (Platform.isMobile) {
            grid.style.gridTemplateColumns = '1fr'; 
        } else {
            grid.style.gridTemplateColumns = 'repeat(3, 1fr)'; 
        }

        const iconMap: Record<string, string> = {
            tasks: 'check-circle',
            recent_files: 'clock',
            custom_text: 'file-text',
            file_list: 'folder-search',
            dashboard: 'bar-chart-2',
            calendar: 'calendar',
            scratchpad: 'pencil',
            tag_cloud: 'tag',
        };

        const activeSections = getCurrentSections(this.plugin.settings);

        for (const section of activeSections) {
            const sectionEl = grid.createDiv({ cls: 'workpage-section' });
            
            if (!Platform.isMobile) {
                const span = Math.min(section.gridSpan || 1, 3);
                sectionEl.style.gridColumn = `span ${span}`;
            }

            const titleEl = sectionEl.createEl('h3', { cls: 'section-title' });
            const iconSpan = titleEl.createSpan({ cls: 'section-icon' });
            setIcon(iconSpan, iconMap[section.type] || 'layout');

            let displayTitle = section.title;
            if (section.type === 'tasks') {
                const today = window.moment().format('YYYY-MM-DD');
                displayTitle = `${section.title} (${today})`;
            }
            titleEl.createSpan({ text: displayTitle });

            const content = sectionEl.createDiv({ cls: 'section-content' });

            if (section.type === 'tasks') {
                await this.renderTasks(content);
            } else if (section.type === 'recent_files') {
                this.renderRecentFiles(content, section);
            } else if (section.type === 'custom_text') {
                await this.renderCustomText(content, section);
            } else if (section.type === 'file_list') {
                this.renderFileList(content, section);
            } else if (section.type === 'dashboard') {
                await this.renderDashboard(content);
            } else if (section.type === 'calendar') {
                this.renderCalendar(content, section);
            } else if (section.type === 'scratchpad') {
                this.renderScratchpad(content, section);
            } else if (section.type === 'tag_cloud') {
                this.renderTagCloud(content, section);
            } else {
                content.createEl('p', { text: '未知分区类型' });
            }

            if (section.buttons && section.buttons.length > 0) {
                const btnBar = sectionEl.createDiv({ cls: 'workpage-button-bar' });
                section.buttons.forEach((button) => {
                    const btn = btnBar.createEl('button', { cls: 'workpage-action-btn' });
                    setIcon(btn.createSpan(), button.icon || 'play');
                    btn.createSpan({ text: button.label });
                    btn.addEventListener('click', () => { this.executeButtonAction(button); });
                });
            }
        }

        if (qa.enabled && qa.position !== 'top') {
            this.renderQuickAdd(container);
        }
    }

    private async renderTasks(content: HTMLElement): Promise<void> {
        const loading = content.createEl('p', { text: '加载中...' });
        this.getTodayTasks()
            .then((tasks) => {
                loading.remove();
                if (tasks.length === 0) {
                    const dailyPlugin = this.app.internalPlugins.getEnabledPluginById('daily-notes');
                    if (!dailyPlugin) {
                        content.createEl('p', { text: '请先启用核心插件"日记"', cls: 'no-data' });
                    } else {
                        content.createEl('p', { text: '今天的日记暂无未完成的任务 ✨', cls: 'no-data' });
                    }
                } else {
                    const ul = content.createEl('ul');
                    ul.style.cssText = 'list-style:none; padding:0; margin:0;';
                    tasks.forEach((task) => {
                        const li = ul.createEl('li', { cls: 'workpage-list-item workpage-task-item' });
                        const checkbox = li.createEl('input', { cls: 'workpage-task-checkbox' });
                        checkbox.type = 'checkbox';
                        checkbox.checked = false;
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

                        const displayText = task.text.replace(/^\s*-\s*\[[ xX]?\]\s*/, '').trim();
                        const nameSpan = li.createSpan({ text: displayText, cls: 'item-name workpage-task-text' });
                        nameSpan.addEventListener('click', () => {
                            const leaf = this.app.workspace.getLeaf(false);
                            void leaf.openFile(task.file).then(() => {
                                const editor = this.app.workspace.activeEditor?.editor;
                                if (editor) editor.setCursor({ line: task.line, ch: 0 });
                            });
                        });
                    });
                }
            })
            .catch((error) => {
                console.error('获取任务失败', error);
                loading.remove();
                content.createEl('p', { text: '加载失败', cls: 'no-data' });
            });
    }

    private renderRecentFiles(content: HTMLElement, section: WorkPageSection): void {
        const maxFiles = section.maxFiles || 10;
        const sortBy = section.sortBy || 'mtime';
        const sortOrder = section.sortOrder || 'desc';
        const excludeFolders = section.excludeFolders
            ? section.excludeFolders.split(',').map((f) => f.trim().replace(/\/$/, ''))
            : [];

        let files = this.app.vault.getMarkdownFiles();
        if (excludeFolders.length > 0) {
            files = files.filter(
                (f) => !excludeFolders.some((folder) => f.path.startsWith(`${folder}/`) || f.path.startsWith(folder))
            );
        }
        files = files.sort((a, b) => {
            const cmp = sortBy === 'name' ? a.basename.localeCompare(b.basename) : a.stat.mtime - b.stat.mtime;
            return sortOrder === 'desc' ? -cmp : cmp;
        }).slice(0, maxFiles);

        if (files.length === 0) {
            content.createEl('p', { text: '暂无编辑记录', cls: 'no-data' });
        } else {
            const listEl = content.createDiv({ cls: 'workpage-recent-list' });
            files.forEach((file) => {
                const fileItem = listEl.createDiv({ cls: 'workpage-list-item' });
                setIcon(fileItem.createSpan({ cls: 'item-icon' }), 'file-text');
                fileItem.createSpan({ text: file.basename, cls: 'item-name' });
                fileItem.onClickEvent(() => { void this.app.workspace.getLeaf(false).openFile(file); });
            });
        }
    }

    private async renderCustomText(content: HTMLElement, section: WorkPageSection): Promise<void> {
        await MarkdownRenderer.renderMarkdown(
            section.content || '在设置中编辑此内容...',
            content, 'WorkPage/custom-text', this
        );
        content.querySelectorAll('a.internal-link').forEach((link) => {
            link.addEventListener('click', (event) => {
                event.preventDefault();
                const href = link.getAttribute('data-href') || link.getAttribute('href');
                if (href) void this.app.workspace.openLinkText(href, '', false);
            });
        });
    }

    private renderFileList(content: HTMLElement, section: WorkPageSection): void {
        const folder = section.folder || '';
        const nameFilter = section.nameFilter || '';
        const sortBy = section.sortBy || 'name';
        const sortOrder = section.sortOrder || 'asc';

        let files = this.app.vault.getMarkdownFiles();
        if (folder) files = files.filter((f) => f.path.startsWith(folder));
        if (nameFilter) files = files.filter((f) => f.basename.includes(nameFilter));
        files = files.sort((a, b) => {
            const cmp = sortBy === 'name' ? a.basename.localeCompare(b.basename) : a.stat.mtime - b.stat.mtime;
            return sortOrder === 'desc' ? -cmp : cmp;
        }).slice(0, section.maxFiles || 20);

        if (files.length === 0) {
            content.createEl('p', { text: '没有匹配的笔记', cls: 'no-data' });
        } else {
            const listEl = content.createDiv({ cls: 'workpage-recent-list' });
            files.forEach((file) => {
                const fileItem = listEl.createDiv({ cls: 'workpage-list-item' });
                setIcon(fileItem.createSpan({ cls: 'item-icon' }), 'file-text');
                fileItem.createSpan({ text: file.basename, cls: 'item-name' });
                fileItem.onClickEvent(() => { void this.app.workspace.getLeaf(false).openFile(file); });
            });
        }
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

        // 1. 统计卡片网格
        const statsGrid = content.createDiv({ cls: 'modern-dashboard-grid' });
        const stats = [
            { icon: 'file-plus', label: '今日灵感新建', value: String(createdToday), type: 'create' },
            { icon: 'file-edit', label: '今日知识沉淀', value: String(modifiedToday), type: 'modify' },
            { icon: 'library', label: '全库笔记总数', value: String(totalNotes), type: 'total' },
            { icon: 'check-square', label: '待办任务追踪', value: `${doneTasks}/${totalTasks}`, type: 'task' },
        ];

        stats.forEach(({ icon, label, value, type }) => {
            const card = statsGrid.createDiv({ cls: `modern-stat-card card-${type}` });
            
            // 内部左侧/上方：图标 + 标签
            const metaWrap = card.createDiv({ cls: 'modern-card-meta' });
            const iconEl = metaWrap.createDiv({ cls: 'modern-stat-icon' });
            setIcon(iconEl, icon);
            metaWrap.createDiv({ cls: 'modern-stat-label', text: label });
            
            // 内部右侧/下方：巨幕数字
            card.createDiv({ cls: 'modern-stat-value', text: value });
        });

        // 2. 环形/条形进度模块美化
        const progressContainer = content.createDiv({ cls: 'modern-progress-container' });
        if (totalTasks > 0) {
            const progressInfo = progressContainer.createDiv({ cls: 'modern-progress-info' });
            
            // 左侧文本
            const textGroup = progressInfo.createDiv({ cls: 'modern-progress-text-group' });
            textGroup.createDiv({ cls: 'modern-progress-title' }).setText('今日目标达成率');
            textGroup.createDiv({ cls: 'modern-progress-desc' }).setText(`已关闭 ${doneTasks} 项就绪任务，剩余 ${pendingTasks} 项推进中`);
            
            // 右侧百分比高亮
            progressInfo.createDiv({ cls: 'modern-progress-percentage', text: `${donePercent}%` });

            // 进度条槽
            const bar = progressContainer.createDiv({ cls: 'modern-progress-bar-track' });
            const fill = bar.createDiv({ cls: 'modern-progress-bar-fill' });
            
            // 优雅的填充动画效果触发
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

    private renderCalendar(content: HTMLElement, section: WorkPageSection): void {
        const dailyPlugin = this.app.internalPlugins.getEnabledPluginById('daily-notes');
        if (!dailyPlugin) {
            content.createEl('p', { text: '请先启用核心插件"日记"', cls: 'no-data' });
            return;
        }

        const config = {
            showWeekNumbers: section.calendarConfig?.showWeekNumbers ?? false,
            showYearMonthSelect: section.calendarConfig?.showYearMonthSelect ?? true,
            compactMode: section.calendarConfig?.compactMode ?? false,
            highlightToday: section.calendarConfig?.highlightToday ?? true,
            showTaskCount: section.calendarConfig?.showTaskCount ?? true,
            mondayFirst: section.calendarConfig?.mondayFirst ?? false,
            dateFormat: section.calendarConfig?.dateFormat ?? 'YYYY-MM-DD',
            folderPath: section.calendarConfig?.folderPath ?? '',
        };

        const { folder: globalFolder, format: globalFormat } = dailyPlugin.options;
        const folder = config.folderPath || globalFolder || '';
        const format = config.dateFormat || globalFormat || 'YYYY-MM-DD';

        if (!this.calendarMonth) {
            this.calendarMonth = window.moment().startOf('month');
        }
        const displayMonth = this.calendarMonth.clone();
        const today = window.moment();

        const allFiles = this.app.vault.getMarkdownFiles();
        const dailyData = new Map<string, { hasFile: boolean; taskCount: { total: number; done: number } }>();

        const loadDailyData = async () => {
            for (const file of allFiles) {
                let dateMatch: any = null;
                const fileName = file.basename;
                const relativePath = folder ? file.path.replace(`${folder}/`, '') : file.path;

                let m = window.moment(relativePath.replace(/\.md$/, ''), format, true);
                if (m.isValid()) {
                    dateMatch = m;
                } else {
                    const commonFormats = ['YYYY-MM-DD', 'YYYYMMDD', 'YYYY/MM/DD', 'DD-MM-YYYY', 'MM-DD-YYYY'];
                    for (const fmt of commonFormats) {
                        m = window.moment(fileName, fmt, true);
                        if (m.isValid()) { dateMatch = m; break; }
                    }
                }

                if (dateMatch && dateMatch.isValid()) {
                    const dateStr = dateMatch.format('YYYY-MM-DD');
                    let taskCount = { total: 0, done: 0 };

                    if (config.showTaskCount) {
                        const fileContent = await this.app.vault.read(file);
                        const lines = fileContent.split('\n');
                        for (const line of lines) {
                            if (/^\s*-\s*\[[ xX]?\]/.test(line)) {
                                taskCount.total++;
                                if (/^\s*-\s*\[[xX]\]/.test(line)) taskCount.done++;
                            }
                        }
                    }
                    dailyData.set(dateStr, { hasFile: true, taskCount });
                }
            }
        };

        loadDailyData().then(() => {
            this.renderCalendarContent(content, section, config, folder, format, displayMonth, today, dailyData);
        }).catch(console.error);

        content.empty();
        content.createEl('p', { text: '加载日历中...', cls: 'no-data' });
    }

    private renderCalendarContent(
        content: HTMLElement,
        section: WorkPageSection,
        config: any,
        folder: string,
        format: string,
        displayMonth: any,
        today: any,
        dailyData: Map<string, { hasFile: boolean; taskCount: { total: number; done: number } }>
    ): void {
        content.empty();
        content.addClass('workpage-calendar-container');
        if (config.compactMode) content.addClass('workpage-calendar--compact');

        const cal = content.createDiv({ cls: 'workpage-calendar' });
        const header = cal.createDiv({ cls: 'calendar-header' });
        const navArea = header.createDiv({ cls: 'calendar-nav-area' });

        const prevBtn = navArea.createEl('button', { cls: 'calendar-nav-btn', text: '‹' });
        const monthLabel = navArea.createDiv({ cls: 'calendar-month-label' });
        monthLabel.setText(displayMonth.format('YYYY年MM月'));
        const nextBtn = navArea.createEl('button', { cls: 'calendar-nav-btn', text: '›' });

        if (config.showYearMonthSelect) {
            const selectArea = header.createDiv({ cls: 'calendar-select-area' });
            const yearSelect = selectArea.createEl('select', { cls: 'calendar-year-select' });
            const currentYear = displayMonth.year();
            for (let y = currentYear - 5; y <= currentYear + 5; y++) {
                yearSelect.createEl('option', { value: String(y), text: `${y}年`, selected: y === currentYear });
            }

            const monthSelect = selectArea.createEl('select', { cls: 'calendar-month-select' });
            for (let m = 1; m <= 12; m++) {
                monthSelect.createEl('option', { value: String(m), text: `${m}月`, selected: m === displayMonth.month() + 1 });
            }

            const onSelectChange = () => {
                this.calendarMonth = window.moment().year(parseInt(yearSelect.value)).month(parseInt(monthSelect.value) - 1).startOf('month');
                this.renderCalendar(content, section);
            };
            yearSelect.addEventListener('change', onSelectChange);
            monthSelect.addEventListener('change', onSelectChange);
        }

        prevBtn.addEventListener('click', () => { this.calendarMonth = displayMonth.clone().subtract(1, 'month').startOf('month'); this.renderCalendar(content, section); });
        nextBtn.addEventListener('click', () => { this.calendarMonth = displayMonth.clone().add(1, 'month').startOf('month'); this.renderCalendar(content, section); });

        const quickBtns = cal.createDiv({ cls: 'calendar-quick-btns' });
        const todayBtn = quickBtns.createEl('button', { cls: 'calendar-today-btn', text: '今天' });
        todayBtn.addEventListener('click', () => { this.calendarMonth = window.moment().startOf('month'); this.renderCalendar(content, section); });

        const grid = cal.createDiv({ cls: 'calendar-grid' });
        const weekdays = config.mondayFirst ? ['一', '二', '三', '四', '五', '六', '日'] : ['日', '一', '二', '三', '四', '五', '六'];

        if (config.showWeekNumbers) grid.createDiv({ cls: 'calendar-weekday calendar-weeknum-header', text: '周' });
        weekdays.forEach((d) => grid.createDiv({ cls: 'calendar-weekday', text: d }));

        const firstDay = displayMonth.clone().startOf('month');
        let startPad = firstDay.day();
        if (config.mondayFirst) startPad = startPad === 0 ? 6 : startPad - 1;

        const daysInMonth = displayMonth.daysInMonth();
        const prevMonthDays = displayMonth.clone().subtract(1, 'month').daysInMonth();
        const calendarDays: { date: any; isCurrentMonth: boolean; dayNum: number }[] = [];

        for (let i = 0; i < 42; i++) {
            const dayOffset = i - startPad;
            if (dayOffset < 0) {
                const dNum = prevMonthDays + dayOffset + 1;
                calendarDays.push({ date: displayMonth.clone().subtract(1, 'month').date(dNum), isCurrentMonth: false, dayNum: dNum });
            } else if (dayOffset >= daysInMonth) {
                const dNum = dayOffset - daysInMonth + 1;
                calendarDays.push({ date: displayMonth.clone().add(1, 'month').date(dNum), isCurrentMonth: false, dayNum: dNum });
            } else {
                const dNum = dayOffset + 1;
                calendarDays.push({ date: displayMonth.clone().date(dNum), isCurrentMonth: true, dayNum: dNum });
            }
        }

        for (let i = 0; i < calendarDays.length; i += 7) {
            const weekRow = calendarDays.slice(i, i + 7);
            if (config.showWeekNumbers) {
                const fDate = weekRow.find(d => d.date)?.date;
                grid.createDiv({ cls: 'calendar-weeknum', text: String(fDate ? fDate.isoWeek() : '') });
            }

            for (const day of weekRow) {
                const dateStr = day.date.format('YYYY-MM-DD');
                const isToday = config.highlightToday && today.format('YYYY-MM-DD') === dateStr;
                const hasDaily = dailyData.get(dateStr)?.hasFile || false;
                const taskData = dailyData.get(dateStr);

                const dayEl = grid.createDiv({
                    cls: ['calendar-day', isToday ? 'calendar-day--today' : '', hasDaily ? 'calendar-day--has-daily' : '', !day.isCurrentMonth ? 'calendar-day--other-month' : ''].filter(Boolean).join(' ')
                });

                dayEl.createDiv({ cls: 'calendar-day-number', text: String(day.dayNum) });

                if (config.showTaskCount && taskData && taskData.taskCount.total > 0) {
                    const badge = dayEl.createDiv({ cls: `calendar-task-badge ${taskData.taskCount.done === taskData.taskCount.total ? 'calendar-task-badge--done' : 'calendar-task-badge--pending'}` });
                    badge.createSpan({ text: `${taskData.taskCount.done}/${taskData.taskCount.total}` });
                } else if (hasDaily) {
                    setIcon(dayEl.createDiv({ cls: 'calendar-daily-dot' }), 'file-text');
                }

                if (hasDaily) {
                    dayEl.addClass('calendar-day--clickable');
                    dayEl.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const fPath = `${folder ? `${folder}/` : ''}${day.date.format(format)}.md`;
                        const file = this.app.vault.getAbstractFileByPath(fPath);
                        if (file instanceof TFile) await this.app.workspace.getLeaf(false).openFile(file);
                    });
                }
            }
        }
    }

    private renderScratchpad(content: HTMLElement, section: WorkPageSection): void {
        const target = section.scratchpadTarget || 'daily';
        const wrap = content.createDiv({ cls: 'workpage-scratchpad' });
        const textarea = wrap.createEl('textarea', { cls: 'scratchpad-textarea', placeholder: '随手记录想法，选择保存方式...' });
        const footer = wrap.createDiv({ cls: 'scratchpad-footer' });

        const targetMap: Record<string, string> = { daily: '📅 今日日记', new: '📄 新建笔记', append: '📌 追加文件' };
        footer.createSpan({ cls: 'scratchpad-target-label', text: targetMap[target] || '保存' });

        const saveBtn = footer.createEl('button', { cls: 'scratchpad-save-btn' });
        setIcon(saveBtn.createSpan(), 'save');
        saveBtn.createSpan({ text: '保存' });

        saveBtn.addEventListener('click', () => {
            const text = textarea.value.trim();
            if (!text) return;
            void this.saveScratchpad(text, section).then((success) => {
                if (success) { textarea.value = ''; new Notice('✅ 已保存'); }
            });
        });
    }

    private async saveScratchpad(text: string, section: WorkPageSection): Promise<boolean> {
        const target = section.scratchpadTarget || 'daily';
        if (target === 'daily') {
            const dailyPlugin = this.app.internalPlugins.getEnabledPluginById('daily-notes');
            if (!dailyPlugin) { new Notice('请启用核心插件"日记"'); return false; }
            const { folder, format } = dailyPlugin.options;
            const today = window.moment().format(format || 'YYYY-MM-DD');
            const fPath = `${folder ? `${folder}/` : ''}${today}.md`;
            let file = this.app.vault.getAbstractFileByPath(fPath);
            if (!(file instanceof TFile)) file = await this.app.vault.create(fPath, '');
            const current = await this.app.vault.read(file as TFile);
            await this.app.vault.modify(file as TFile, current ? `${current}\n\n${text}` : text);
            return true;
        }
        if (target === 'new') {
            const newFile = await this.app.vault.create(`草稿-${window.moment().format('YYYYMMDDHHmmss')}.md`, text);
            void this.app.workspace.getLeaf(false).openFile(newFile);
            return true;
        }
        return false;
    }

    private renderTagCloud(content: HTMLElement, section: WorkPageSection): void {
        const allTags = this.app.metadataCache.getTags();
        if (!allTags || Object.keys(allTags).length === 0) {
            content.createEl('p', { text: '仓库中暂无标签', cls: 'no-data' });
            return;
        }
        const sorted = Object.entries(allTags).sort((a, b) => b[1] - a[1]).slice(0, section.tagMaxCount || 30);
        const cloudWrap = content.createDiv({ cls: 'tag-cloud-wrap' });

        sorted.forEach(([tag, count]) => {
            const tagEl = cloudWrap.createSpan({ cls: 'tag-cloud-item', text: `${tag} (${count})` });
            tagEl.addEventListener('click', () => { void this.app.workspace.openLinkText(tag, '', false); });
        });
    }

    // ── 核心改造：新增日期选择控件并支持定向写入 ──
    renderQuickAdd(container: HTMLElement): void {
        const qa = this.plugin.settings.quickAdd ?? DEFAULT_QUICK_ADD;
        if (!qa.enabled) return;

        const quickDiv = container.createDiv({ cls: 'workpage-quick-add' });
        const inputWrap = quickDiv.createDiv({ cls: 'quick-add-input-wrap' });
        
        // 1. 新增原生日期选择器
        const dateInput = inputWrap.createEl('input', { 
            type: 'date', 
            cls: 'quick-add-date' 
        });
        // 默认设置为当天日期 (格式：YYYY-MM-DD)
        dateInput.value = window.moment().format('YYYY-MM-DD');
        
        const input = inputWrap.createEl('input', { type: 'text', placeholder: qa.placeholder, cls: 'quick-add-input' });
        const btn = inputWrap.createEl('button', { cls: 'quick-add-btn', text: qa.buttonText });

        const add = async () => {
            const text = input.value.trim();
            const selectedDate = dateInput.value; // 获取用户设定的日期字符串
            if (!text) return;
            
            await this.addTaskToDate(text, selectedDate);
            input.value = '';
            if (qa.showSuccessNotice) new Notice(`✅ 已成功添加待办至日记 (${selectedDate})`);
            await this.render();
        };
        btn.addEventListener('click', () => { void add(); });
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') void add(); });
    }

    executeButtonAction(button: WorkPageButton): void {
        switch (button.action.type) {
            case 'refresh': void this.render(); break;
            case 'open-file': if (button.action.payload) void this.app.workspace.openLinkText(button.action.payload, '', false); break;
            case 'command': if (button.action.payload) this.app.commands.executeCommandById(button.action.payload); break;
            case 'add-task': this.quickAddTask(button.action.payload || ''); break;
        }
    }

    quickAddTask(defaultText = ''): void {
        const taskText = prompt('输入任务内容', defaultText);
        if (taskText) void this.addTaskToDate(taskText);
    }

    // ── 核心改造：重构支持按特定日期写入对应日记文件 ──
    async addTaskToDate(taskText: string, targetDateStr?: string): Promise<void> {
        const dailyPlugin = this.app.internalPlugins.getEnabledPluginById('daily-notes');
        if (!dailyPlugin) {
            new Notice('错误：请先开启 Obsidian 自带的"日记"核心插件');
            return;
        }

        const { folder, format } = dailyPlugin.options;
        // 如果传入了日期，基于 YYYY-MM-DD 进行解析，否则回退默认至今天
        const targetMoment = targetDateStr ? window.moment(targetDateStr, 'YYYY-MM-DD') : window.moment();
        const dateFileName = targetMoment.format(format || 'YYYY-MM-DD');
        const filePath = `${folder ? `${folder}/` : ''}${dateFileName}.md`;

        let file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) {
            file = await this.app.vault.create(filePath, '');
        }

        const cleanText = taskText.replace(/^\s*-\s*\[[ xX]?\]\s*/, '').trim();
        if (!cleanText) return;

        const currentContent = await this.app.vault.read(file as TFile);
        const newContent = currentContent ? `${currentContent}\n- [ ] ${cleanText}` : `- [ ] ${cleanText}`;
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

    async getTodayTasks(): Promise<{ file: TFile; line: number; text: string }[]> {
        const tasks: { file: TFile; line: number; text: string }[] = [];
        const dailyPlugin = this.app.internalPlugins.getEnabledPluginById('daily-notes');
        if (!dailyPlugin) return tasks;

        const { folder, format } = dailyPlugin.options;
        const today = window.moment().format(format || 'YYYY-MM-DD');
        const filePath = `${folder ? `${folder}/` : ''}${today}.md`;

        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return tasks;

        const content = await this.app.vault.read(file);
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line && /^\s*-\s*\[ \]/.test(line)) {
                tasks.push({ file, line: i, text: line.trim() });
            }
        }
        return tasks;
    }
}

export default class MyPlugin extends Plugin {
    settings: MyPluginSettings;

    async onload(): Promise<void> {
        await this.loadSettings();
        this.registerView(VIEW_TYPE_WORKPAGE, (leaf) => new WorkPageView(leaf, this));
        this.addRibbonIcon('layout', '打开 WorkPage', () => { void this.activateView(); });
        this.addSettingTab(new WorkPageSettingTab(this.app, this));

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
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
        const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_WORKPAGE)[0];
        if (leaf && leaf.view instanceof WorkPageView) {
            await leaf.view.render();
        }
    }
}