export class Header {
    constructor(callbacks = {}) {
        this.callbacks = callbacks;
        this.alwaysOnTopBtn = document.getElementById('alwaysOnTopBtn');
        this.themeBtn = document.getElementById('themeBtn');
        this.closeBtn = document.getElementById('closeBtn');
        this.titleBar = document.getElementById('titleBar');
        this.compactBar = document.getElementById('compactBar');
        this.compactTime = document.getElementById('compactTime');
        this.compactTask = document.getElementById('compactTask');
        this.compactExpandBtn = document.getElementById('compactExpandBtn');
        
        // Revolving text elements
        this.brandTitle = document.getElementById('brandTitle');
        this.brandTextContainer = document.getElementById('brandTextContainer');
        this.mainContentArea = document.getElementById('mainContentArea');
        
        this.isCompact = false;
        this.isCompactTransitioning = false;
        this.revolveInterval = null;
        this.revolveIndex = 0;
        this.compactTaskIndex = 0;

        this.attachHandlers();
        
        if (this.brandTitle) {
            this.startRevolvingText();
        }
    }

    attachHandlers() {
        if (this.brandTextContainer) {
            this.brandTextContainer.addEventListener('click', () => this.toggleCompactMode());
        }

        if (this.compactExpandBtn) {
            this.compactExpandBtn.addEventListener('click', () => this.toggleCompactMode());
        }

        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => window.electronAPI.closeWindow());
        }

        if (this.alwaysOnTopBtn) {
            this.alwaysOnTopBtn.addEventListener('click', async () => {
                const newState = await window.electronAPI.toggleAlwaysOnTop();
                this.updateAlwaysOnTopButton(newState);
            });
        }

        if (this.themeBtn) {
            this.themeBtn.addEventListener('click', () => {
                if (this.callbacks.onThemeToggle) this.callbacks.onThemeToggle();
            });
        }
    }
    
    startRevolvingText() {
        this.revolveIndex = 0;
        this.updateRevolvingText();
        this.revolveInterval = setInterval(() => {
            this.revolveIndex = (this.revolveIndex + 1) % 4;
            this.updateRevolvingText();
        }, 3000);
    }

    async toggleCompactMode() {
        if (this.isCompactTransitioning) return;
        this.isCompactTransitioning = true;
        const nextCompact = !this.isCompact;

        try {
            if (nextCompact) {
                this.mainContentArea.classList.add('opacity-0', 'pointer-events-none');
                await new Promise(resolve => setTimeout(resolve, 180));
                this.mainContentArea.classList.add('hidden');
                this.titleBar.classList.add('hidden');
                this.compactBar.classList.add('visible');
                await window.electronAPI.setCompactMode(true);
                this.isCompact = true;
                this.brandTextContainer.title = '点击返回完整模式';
            } else {
                await window.electronAPI.setCompactMode(false);
                this.isCompact = false;
                this.compactBar.classList.remove('visible');
                this.titleBar.classList.remove('hidden');
                this.mainContentArea.classList.remove('hidden');
                requestAnimationFrame(() => {
                    this.mainContentArea.classList.remove('opacity-0', 'pointer-events-none');
                });
                this.brandTextContainer.title = '切换紧凑模式';
            }
        } catch (error) {
            this.compactBar.classList.remove('visible');
            this.titleBar.classList.remove('hidden');
            this.mainContentArea.classList.remove('hidden', 'opacity-0', 'pointer-events-none');
            console.error('切换紧凑模式失败：', error);
        } finally {
            this.isCompactTransitioning = false;
        }
    }
    
    updateRevolvingText() {
        if (this.compactTime) {
            this.compactTime.textContent = new Date().toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
        }
        this.updateCompactTask();
        this.brandTitle.style.opacity = '0';
        
        setTimeout(() => {
            switch(this.revolveIndex) {
                case 0:
                    this.brandTitle.innerText = "轻待办";
                    break;
                case 1:
                    const dateOpts = { month: 'long', day: 'numeric', year: 'numeric' };
                    this.brandTitle.innerText = new Date().toLocaleDateString('zh-CN', dateOpts);
                    break;
                case 2:
                    const timeOpts = { hour: 'numeric', minute: '2-digit' };
                    this.brandTitle.innerText = new Date().toLocaleTimeString(undefined, timeOpts);
                    break;
                case 3:
                    const count = this.callbacks.getTaskCount ? this.callbacks.getTaskCount() : 0;
                    this.brandTitle.innerText = count === 0 ? '轻松一下' : `${count} 件待完成`;
                    break;
            }
            
            this.brandTitle.style.opacity = '1';
        }, 150);
    }

    updateCompactTask() {
        if (!this.compactTask) return;
        const tasks = this.callbacks.getTodayTasks ? this.callbacks.getTodayTasks() : [];
        const pending = tasks.filter(task => !task.completed);

        if (pending.length === 0) {
            this.compactTask.textContent = tasks.length > 0 ? '今日已完成' : '今日无待办';
            this.compactTask.title = this.compactTask.textContent;
            this.compactTaskIndex = 0;
            return;
        }

        const task = pending[this.compactTaskIndex % pending.length];
        const displayText = task.text.replace(/^【[^】]+】\s*/, '');
        this.compactTask.textContent = pending.length > 1
            ? `${this.compactTaskIndex % pending.length + 1}/${pending.length} · ${displayText}`
            : displayText;
        this.compactTask.title = task.text;
        this.compactTaskIndex = (this.compactTaskIndex + 1) % pending.length;
    }

    updateAlwaysOnTopButton(isAlwaysOnTop) {
        if (!this.alwaysOnTopBtn) return;
        
        if (isAlwaysOnTop) {
            this.alwaysOnTopBtn.title = '窗口置顶：已开启';
            this.alwaysOnTopBtn.classList.add('bg-blue-500/20', 'text-blue-500');
        } else {
            this.alwaysOnTopBtn.title = '窗口置顶：已关闭';
            this.alwaysOnTopBtn.classList.remove('bg-blue-500/20', 'text-blue-500');
        }
    }

    applyTheme(theme) {
        const html = document.documentElement;
        const app = document.getElementById('app');

        if (theme === 'dark') {
            html.classList.add('dark');
            app.classList.remove('glass-light');
            app.classList.add('glass-dark');
        } else {
            html.classList.remove('dark');
            app.classList.remove('glass-dark');
            app.classList.add('glass-light');
        }
    }
}

