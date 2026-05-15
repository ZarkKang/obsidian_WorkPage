import {
    Plugin,
    ItemView,
    WorkspaceLeaf,
    TFile,
    TFolder,
    setIcon,
    MarkdownRenderer,
    Notice,
} from 'obsidian';
import {
    DEFAULT_SETTINGS,
    DEFAULT_QUICK_ADD,
    MyPluginSettings,
    WorkPageSettingTab,
    WorkPageButton,
    WorkPageSection,
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
        moment: (date?: string) => {
            format: (fmt: string) => string;
            daysInMonth: () => number;
            clone: () => ReturnType<Window['moment']>;
            startOf: (unit: string) => ReturnType<Window['moment']>;
            date: () => number;
            day: () => number;
            month: () => number;
            year: () => number;
            add: (n: number, unit: string) => ReturnType<Window['moment']>;
            subtract: (n: number, unit: string) => ReturnType<Window['moment']>;
            isSame: (other: ReturnType<Window['moment']>, unit?: string) => boolean;
            isAfter: (other: ReturnType<Window['moment']>) => boolean;
        };
    }
}

class WorkPageView extends ItemView {
    plugin: MyPlugin;
    // 日历组件的当前显示月份（保持在重新渲染间不丢失）
    private calendarMonth: ReturnType<Window['moment']> | null = null;

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
        header.createEl('h2', { text: '我的工作台' });

        const qa = this.plugin.settings.quickAdd ?? DEFAULT_QUICK_ADD;
        if (qa.enabled && qa.position === 'top') {
            this.renderQuickAdd(container);
        }

        const grid = container.createDiv({ cls: 'workpage-grid' });

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

        for (const section of this.plugin.settings.sections) {
            const sectionEl = grid.createDiv({ cls: 'workpage-section' });

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

            // ── 分区内容渲染 ──
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

            // ── 快捷按钮 ──
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

        if (!(qa.enabled && qa.position === 'top')) {
            this.renderQuickAdd(container);
        }
    }

    // ════════════════════════════════════════════════════
    //  既有分区渲染
    // ════════════════════════════════════════════════════

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
                const iconSpan = fileItem.createSpan({ cls: 'item-icon' });
                setIcon(iconSpan, 'file-text');
                fileItem.createSpan({ text: file.basename, cls: 'item-name' });
                fileItem.onClickEvent(() => { void this.app.workspace.getLeaf(false).openFile(file); });
            });
        }
    }

    private async renderCustomText(content: HTMLElement, section: WorkPageSection): Promise<void> {
        const sourcePath = 'WorkPage/custom-text';
        await MarkdownRenderer.renderMarkdown(
            section.content || '在设置中编辑此内容...',
            content, sourcePath, this
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

    // ════════════════════════════════════════════════════
    //  新分区 1：今日统计看板 Dashboard
    // ════════════════════════════════════════════════════

    private async renderDashboard(content: HTMLElement): Promise<void> {
        content.addClass('workpage-dashboard');

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayTs = todayStart.getTime();

        const allFiles = this.app.vault.getMarkdownFiles();

        // 今日创建 / 修改
        const createdToday = allFiles.filter((f) => f.stat.ctime >= todayTs).length;
        const modifiedToday = allFiles.filter((f) => f.stat.mtime >= todayTs).length;
        const totalNotes = allFiles.length;

        // 任务完成度（扫描今日日记）
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

        // 渲染统计卡片
        const statsGrid = content.createDiv({ cls: 'dashboard-stats-grid' });

        const stats = [
            { icon: 'file-plus', label: '今日新建', value: String(createdToday), color: 'accent' },
            { icon: 'file-edit', label: '今日修改', value: String(modifiedToday), color: 'green' },
            { icon: 'library', label: '笔记总数', value: String(totalNotes), color: 'purple' },
            { icon: 'check-square', label: '任务完成', value: `${doneTasks}/${totalTasks}`, color: 'orange' },
        ];

        stats.forEach(({ icon, label, value, color }) => {
            const card = statsGrid.createDiv({ cls: `dashboard-stat-card dashboard-stat-card--${color}` });
            const iconEl = card.createDiv({ cls: 'dashboard-stat-icon' });
            setIcon(iconEl, icon);
            card.createDiv({ cls: 'dashboard-stat-value', text: value });
            card.createDiv({ cls: 'dashboard-stat-label', text: label });
        });

        // 任务进度条
        if (totalTasks > 0) {
            const progressWrap = content.createDiv({ cls: 'dashboard-progress-wrap' });
            progressWrap.createDiv({ cls: 'dashboard-progress-label' })
                .setText(`今日任务完成度 ${donePercent}%（${doneTasks}/${totalTasks}）`);
            const bar = progressWrap.createDiv({ cls: 'dashboard-progress-bar' });
            const fill = bar.createDiv({ cls: 'dashboard-progress-fill' });
            // 用 setTimeout 触发 CSS transition
            setTimeout(() => {
                fill.style.width = `${donePercent}%`;
            }, 50);
        } else {
            content.createEl('p', { text: '今日日记暂无任务记录', cls: 'no-data' });
        }
    }

    // ════════════════════════════════════════════════════
    //  新分区 2：日历跳转器 Calendar
    // ════════════════════════════════════════════════════

    private renderCalendar(content: HTMLElement, _section: WorkPageSection): void {
        const dailyPlugin = this.app.internalPlugins.getEnabledPluginById('daily-notes');
        if (!dailyPlugin) {
            content.createEl('p', { text: '请先启用核心插件"日记"', cls: 'no-data' });
            return;
        }
        const { folder, format } = dailyPlugin.options;
        const fmt = format || 'YYYY-MM-DD';

        // 当前显示月份，保持翻页状态
        if (!this.calendarMonth) {
            this.calendarMonth = window.moment().startOf('month');
        }
        const displayMonth = this.calendarMonth;
        const today = window.moment();

        // 已有日记集合（快速查询）
        const allFiles = this.app.vault.getMarkdownFiles();
        const dailyDates = new Set<string>();
        allFiles.forEach((f) => {
            const base = folder ? f.path.replace(`${folder}/`, '') : f.basename;
            // 用文件名反解日期
            const m = window.moment(base.replace(/\.md$/, ''), fmt, true);
            if (m && m.format(fmt) === base.replace(/\.md$/, '')) {
                dailyDates.add(m.format('YYYY-MM-DD'));
            }
        });

        const cal = content.createDiv({ cls: 'workpage-calendar' });

        // 月份导航栏
        const nav = cal.createDiv({ cls: 'calendar-nav' });
        const prevBtn = nav.createEl('button', { cls: 'calendar-nav-btn', text: '‹' });
        const monthLabel = nav.createDiv({ cls: 'calendar-month-label' });
        monthLabel.setText(displayMonth.format('YYYY年MM月'));
        const nextBtn = nav.createEl('button', { cls: 'calendar-nav-btn', text: '›' });

        prevBtn.addEventListener('click', () => {
            this.calendarMonth = displayMonth.subtract(1, 'month').startOf('month');
            content.empty();
            this.renderCalendar(content, _section);
        });
        nextBtn.addEventListener('click', () => {
            this.calendarMonth = displayMonth.add(1, 'month').startOf('month');
            content.empty();
            this.renderCalendar(content, _section);
        });

        // 星期头
        const grid = cal.createDiv({ cls: 'calendar-grid' });
        ['日', '一', '二', '三', '四', '五', '六'].forEach((d) => {
            grid.createDiv({ cls: 'calendar-weekday', text: d });
        });

        // 第一天是星期几（0=日）
        const firstDay = displayMonth.clone().startOf('month');
        const startPad = firstDay.day(); // 0~6
        const daysInMonth = displayMonth.daysInMonth();

        // 空白填充
        for (let i = 0; i < startPad; i++) {
            grid.createDiv({ cls: 'calendar-day calendar-day--empty' });
        }

        // 日期格子
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = displayMonth.clone().date(d).format('YYYY-MM-DD') as unknown as string;
            // moment 的 .date() 返回 number，需手动格式化
            const paddedD = String(d).padStart(2, '0');
            const fullDate = `${displayMonth.format('YYYY')}-${displayMonth.format('MM')}-${paddedD}`;

            const isToday = today.format('YYYY-MM-DD') === fullDate;
            const hasDaily = dailyDates.has(fullDate);

            const dayEl = grid.createDiv({
                cls: [
                    'calendar-day',
                    isToday ? 'calendar-day--today' : '',
                    hasDaily ? 'calendar-day--has-daily' : '',
                ].filter(Boolean).join(' '),
                text: String(d),
            });

            if (hasDaily) {
                dayEl.setAttribute('title', `打开 ${fullDate} 的日记`);
                dayEl.addEventListener('click', () => {
                    const filePath = `${folder ? `${folder}/` : ''}${fullDate}.md`;
                    const file = this.app.vault.getAbstractFileByPath(filePath);
                    if (file instanceof TFile) {
                        void this.app.workspace.getLeaf(false).openFile(file);
                    }
                });
            }
        }

        // 今日日记快捷按钮
        const todayBtn = cal.createEl('button', { cls: 'calendar-today-btn', text: '跳到今天' });
        todayBtn.addEventListener('click', () => {
            const todayStr = today.format(fmt);
            const filePath = `${folder ? `${folder}/` : ''}${todayStr}.md`;
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (file instanceof TFile) {
                void this.app.workspace.getLeaf(false).openFile(file);
            } else {
                // 今天没有日记，重置日历到今月
                this.calendarMonth = window.moment().startOf('month');
                content.empty();
                this.renderCalendar(content, _section);
            }
        });
    }

    // ════════════════════════════════════════════════════
    //  新分区 3：快速草稿纸 Scratchpad
    // ════════════════════════════════════════════════════

    private renderScratchpad(content: HTMLElement, section: WorkPageSection): void {
        const target = section.scratchpadTarget || 'daily';
        const wrap = content.createDiv({ cls: 'workpage-scratchpad' });

        const textarea = wrap.createEl('textarea', {
            cls: 'scratchpad-textarea',
            placeholder: '随手记录想法，选择保存方式...',
        });

        const footer = wrap.createDiv({ cls: 'scratchpad-footer' });

        // 目标选择器（仅当 target = append 时显示路径输入）
        const targetLabel = footer.createSpan({ cls: 'scratchpad-target-label' });
        const targetMap: Record<string, string> = {
            daily: '📅 今日日记',
            new: '📄 新建笔记',
            append: '📌 追加到文件',
        };
        targetLabel.setText(targetMap[target] || '保存');

        const saveBtn = footer.createEl('button', { cls: 'scratchpad-save-btn' });
        setIcon(saveBtn.createSpan({ cls: 'scratchpad-btn-icon' }), 'save');
        saveBtn.createSpan({ text: '保存' });

        const clearBtn = footer.createEl('button', { cls: 'scratchpad-clear-btn' });
        setIcon(clearBtn.createSpan({ cls: 'scratchpad-btn-icon' }), 'trash-2');
        clearBtn.createSpan({ text: '清空' });

        clearBtn.addEventListener('click', () => {
            textarea.value = '';
            textarea.focus();
        });

        saveBtn.addEventListener('click', () => {
            const text = textarea.value.trim();
            if (!text) {
                textarea.addClass('scratchpad-textarea--shake');
                setTimeout(() => textarea.removeClass('scratchpad-textarea--shake'), 400);
                return;
            }
            void this.saveScratchpad(text, section).then((success) => {
                if (success) {
                    textarea.value = '';
                    new Notice('✅ 已保存');
                }
            });
        });

        // Ctrl/Cmd+Enter 快捷保存
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                saveBtn.click();
            }
        });
    }

    private async saveScratchpad(text: string, section: WorkPageSection): Promise<boolean> {
        const target = section.scratchpadTarget || 'daily';

        if (target === 'daily') {
            const dailyPlugin = this.app.internalPlugins.getEnabledPluginById('daily-notes');
            if (!dailyPlugin) { new Notice('请先启用核心插件"日记"'); return false; }
            const { folder, format } = dailyPlugin.options;
            const today = window.moment().format(format || 'YYYY-MM-DD');
            const filePath = `${folder ? `${folder}/` : ''}${today}.md`;
            const abstractFile = this.app.vault.getAbstractFileByPath(filePath);
            let file: TFile;
            if (abstractFile instanceof TFile) {
                file = abstractFile;
            } else {
                file = await this.app.vault.create(filePath, '');
            }
            const current = await this.app.vault.read(file);
            await this.app.vault.modify(file, current ? `${current}\n\n${text}` : text);
            return true;
        }

        if (target === 'new') {
            const timestamp = window.moment().format('YYYYMMDDHHmmss');
            const newPath = `草稿-${timestamp}.md`;
            const newFile = await this.app.vault.create(newPath, text);
            void this.app.workspace.getLeaf(false).openFile(newFile);
            return true;
        }

        if (target === 'append') {
            const filePath = section.scratchpadFile || '';
            if (!filePath) { new Notice('请在设置中填写目标文件路径'); return false; }
            const abstractFile = this.app.vault.getAbstractFileByPath(filePath);
            let file: TFile;
            if (abstractFile instanceof TFile) {
                file = abstractFile;
            } else {
                // 确保文件夹存在
                const parts = filePath.split('/');
                parts.pop();
                if (parts.length > 0) {
                    const folderPath = parts.join('/');
                    if (!this.app.vault.getAbstractFileByPath(folderPath)) {
                        await this.app.vault.createFolder(folderPath);
                    }
                }
                file = await this.app.vault.create(filePath, '');
            }
            const current = await this.app.vault.read(file);
            await this.app.vault.modify(file, current ? `${current}\n\n${text}` : text);
            return true;
        }

        return false;
    }

    // ════════════════════════════════════════════════════
    //  新分区 4：标签聚合器 Tag Cloud
    // ════════════════════════════════════════════════════

    private renderTagCloud(content: HTMLElement, section: WorkPageSection): void {
        const maxCount = section.tagMaxCount || 30;
        const allTags = this.app.metadataCache.getTags();

        if (!allTags || Object.keys(allTags).length === 0) {
            content.createEl('p', { text: '仓库中暂无标签', cls: 'no-data' });
            return;
        }

        // 按频率排序，取前 N
        const sorted = Object.entries(allTags)
            .sort((a, b) => b[1] - a[1])
            .slice(0, maxCount);

        const maxVal = sorted[0]?.[1] ?? 1;
        const minVal = sorted[sorted.length - 1]?.[1] ?? 1;

        // 详情区域（点击标签后显示文件列表）
        const cloudWrap = content.createDiv({ cls: 'tag-cloud-wrap' });
        const detailWrap = content.createDiv({ cls: 'tag-cloud-detail' });
        let activeTag = '';

        sorted.forEach(([tag, count]) => {
            // 字号线性映射 0.75em ~ 1.4em
            const ratio = maxVal === minVal ? 0.5 : (count - minVal) / (maxVal - minVal);
            const fontSize = 0.78 + ratio * 0.7;

            const tagEl = cloudWrap.createSpan({ cls: 'tag-cloud-item', text: tag });
            tagEl.style.fontSize = `${fontSize.toFixed(2)}em`;
            tagEl.setAttribute('title', `${count} 篇笔记`);

            tagEl.addEventListener('click', () => {
                if (activeTag === tag) {
                    // 再次点击同一标签，收起
                    activeTag = '';
                    detailWrap.empty();
                    detailWrap.style.display = 'none';
                    tagEl.removeClass('tag-cloud-item--active');
                    return;
                }
                // 移除其他 active
                cloudWrap.querySelectorAll('.tag-cloud-item--active').forEach((el) => el.removeClass('tag-cloud-item--active'));
                tagEl.addClass('tag-cloud-item--active');
                activeTag = tag;

                // 查找包含该标签的文件
                const files = this.app.vault.getMarkdownFiles().filter((f) => {
                    const cache = this.app.metadataCache.getFileCache(f);
                    if (!cache) return false;
                    const fileTags = cache.tags?.map((t) => t.tag) ?? [];
                    const frontmatterTags: string[] = [];
                    const fm = cache.frontmatter?.tags;
                    if (Array.isArray(fm)) fm.forEach((t) => frontmatterTags.push(`#${t}`));
                    else if (typeof fm === 'string') frontmatterTags.push(`#${fm}`);
                    return [...fileTags, ...frontmatterTags].includes(tag);
                });

                detailWrap.empty();
                detailWrap.style.display = 'block';
                detailWrap.createDiv({ cls: 'tag-detail-header', text: `${tag}（${files.length} 篇）` });

                if (files.length === 0) {
                    detailWrap.createEl('p', { text: '无匹配笔记', cls: 'no-data' });
                } else {
                    const list = detailWrap.createDiv({ cls: 'tag-detail-list' });
                    files.slice(0, 20).forEach((f) => {
                        const item = list.createDiv({ cls: 'workpage-list-item' });
                        setIcon(item.createSpan({ cls: 'item-icon' }), 'file-text');
                        item.createSpan({ text: f.basename, cls: 'item-name' });
                        item.addEventListener('click', () => {
                            void this.app.workspace.getLeaf(false).openFile(f);
                        });
                    });
                    if (files.length > 20) {
                        detailWrap.createEl('p', { text: `还有 ${files.length - 20} 篇未显示...`, cls: 'no-data' });
                    }
                }
            });
        });

        // 初始隐藏详情
        detailWrap.style.display = 'none';
    }

    // ════════════════════════════════════════════════════
    //  快速添加栏
    // ════════════════════════════════════════════════════

    renderQuickAdd(container: HTMLElement): void {
        const qa = this.plugin.settings.quickAdd ?? DEFAULT_QUICK_ADD;
        if (!qa.enabled) return;

        const dailyPlugin = this.app.internalPlugins.getEnabledPluginById('daily-notes');
        if (!dailyPlugin) return;

        const quickDiv = container.createDiv({ cls: 'workpage-quick-add' });

        const labelWrap = quickDiv.createDiv({ cls: 'quick-add-label-wrap' });
        const labelIcon = labelWrap.createSpan({ cls: 'quick-add-label-icon' });
        setIcon(labelIcon, 'circle-plus');
        labelWrap.createSpan({ text: qa.label || '快速添加待办', cls: 'quick-add-label' });

        const inputWrap = quickDiv.createDiv({ cls: 'quick-add-input-wrap' });
        const input = inputWrap.createEl('input', {
            type: 'text',
            placeholder: qa.placeholder || '输入新任务，回车添加...',
            cls: 'quick-add-input',
        });
        const btn = inputWrap.createEl('button', { cls: 'quick-add-btn' });
        setIcon(btn.createSpan({ cls: 'quick-add-btn-icon' }), 'send');
        btn.createSpan({ text: qa.buttonText || '添加', cls: 'quick-add-btn-text' });

        const add = async (): Promise<void> => {
            const task = input.value.trim();
            if (!task) {
                input.addClass('quick-add-input--shake');
                setTimeout(() => input.removeClass('quick-add-input--shake'), 400);
                return;
            }
            btn.setAttr('disabled', 'true');
            btn.addClass('quick-add-btn--loading');
            try {
                await this.addTaskToToday(task);
                input.value = '';
                if (qa.showSuccessNotice) new Notice(`✅ 已添加：${task}`);
                btn.addClass('quick-add-btn--success');
                setTimeout(() => btn.removeClass('quick-add-btn--success'), 800);
            } finally {
                btn.removeAttribute('disabled');
                btn.removeClass('quick-add-btn--loading');
                await this.render();
            }
        };

        btn.addEventListener('click', () => { void add(); });
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') void add(); });
    }

    // ════════════════════════════════════════════════════
    //  工具方法
    // ════════════════════════════════════════════════════

    executeButtonAction(button: WorkPageButton): void {
        switch (button.action.type) {
            case 'refresh': void this.render(); break;
            case 'open-file':
                if (button.action.payload) void this.app.workspace.openLinkText(button.action.payload, '', false);
                break;
            case 'command':
                if (button.action.payload) this.app.commands.executeCommandById(button.action.payload);
                break;
            case 'add-task':
                this.quickAddTask(button.action.payload || '');
                break;
        }
    }

    quickAddTask(defaultText = ''): void {
        const taskText = prompt('输入任务内容', defaultText);
        if (taskText) void this.addTaskToToday(taskText);
    }

    async addTaskToToday(taskText: string): Promise<void> {
        const dailyPlugin = this.app.internalPlugins.getEnabledPluginById('daily-notes');
        if (!dailyPlugin) return;

        const { folder, format } = dailyPlugin.options;
        const today = window.moment().format(format || 'YYYY-MM-DD');
        const filePath = `${folder ? `${folder}/` : ''}${today}.md`;

        const abstractFile = this.app.vault.getAbstractFileByPath(filePath);
        let file: TFile;
        if (abstractFile instanceof TFile) {
            file = abstractFile;
        } else {
            file = await this.app.vault.create(filePath, '');
        }

        // 去掉用户可能自行输入的任务前缀，避免出现 "- [ ] - [ ] xxx"
        const cleanText = taskText.replace(/^\s*-\s*\[[ xX]?\]\s*/, '').trim();
        if (!cleanText) return;

        const currentContent = await this.app.vault.read(file);
        const newContent = currentContent ? `${currentContent}\n- [ ] ${cleanText}` : `- [ ] ${cleanText}`;
        await this.app.vault.modify(file, newContent);
        await this.render();
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

    async getUnfinishedTasks(): Promise<{ file: TFile; line: number; text: string }[]> {
        const tasks: { file: TFile; line: number; text: string }[] = [];
        const files = this.app.vault.getMarkdownFiles();
        for (const file of files) {
            const content = await this.app.vault.read(file);
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line && /^\s*-\s*\[ \]/.test(line)) {
                    tasks.push({ file, line: i, text: line.trim() });
                }
            }
        }
        tasks.sort((a, b) => b.file.stat.mtime - a.file.stat.mtime);
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

        if (this.settings.openWhenEmpty) {
            this.registerEvent(
                this.app.workspace.on('active-leaf-change', () => {
                    setTimeout(() => this.checkAndShowWorkPage(), 100);
                })
            );
            this.registerEvent(
                this.app.workspace.on('layout-change', () => {
                    setTimeout(() => this.checkAndShowWorkPage(), 100);
                })
            );
        }

        this.settings.sections.forEach((section) => {
            section.buttons?.forEach((button) => {
                const commandId = `workpage:${section.id}-${button.id}`;
                this.addCommand({
                    id: commandId,
                    name: `WorkPage: ${section.title} - ${button.label}`,
                    callback: () => {
                        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_WORKPAGE);
                        const firstLeaf = leaves[0];
                        if (firstLeaf && firstLeaf.view instanceof WorkPageView) {
                            firstLeaf.view.executeButtonAction(button);
                        } else {
                            void this.activateView().then(() => {
                                setTimeout(() => {
                                    const newLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_WORKPAGE);
                                    const newFirstLeaf = newLeaves[0];
                                    if (newFirstLeaf && newFirstLeaf.view instanceof WorkPageView) {
                                        newFirstLeaf.view.executeButtonAction(button);
                                    }
                                }, 200);
                            });
                        }
                    },
                });
            });
        });
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

    checkAndShowWorkPage(): void {
        const markdownLeaves = this.app.workspace.getLeavesOfType('markdown');
        const hasAnyFileOpen = markdownLeaves.some((leaf) => {
            const view = leaf.view;
            return view && 'file' in view && view.file !== null;
        });
        if (!hasAnyFileOpen && this.app.workspace.getLeavesOfType(VIEW_TYPE_WORKPAGE).length === 0) {
            const emptyLeaf = this.app.workspace.getLeavesOfType('empty')[0];
            if (emptyLeaf) {
                void emptyLeaf.setViewState({ type: VIEW_TYPE_WORKPAGE });
            } else {
                void this.activateView();
            }
        }
    }

    async loadSettings(): Promise<void> {
        const data = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
        this.settings.quickAdd = Object.assign({}, DEFAULT_QUICK_ADD, data?.quickAdd);
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
        const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_WORKPAGE)[0];
        if (leaf && leaf.view instanceof WorkPageView) {
            await leaf.view.render();
        }
    }
}