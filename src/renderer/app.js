import { loadTasks, saveTasks, loadTheme, saveTheme, loadAlwaysOnTop, loadAppearance, saveAppearance } from './services/storeService.js';
import { createTask, toggleTask, updateTask, deleteTask, listTasks } from './services/taskManager.js';
import { Header } from './components/Header.js';
import { TaskList } from './components/TaskList.js';
import { TaskInput } from './components/TaskInput.js';

function localDateString(date = new Date()) {
    return date.toLocaleDateString('sv-SE');
}

function shiftDate(dateString, days) {
    const date = new Date(`${dateString}T12:00:00`);
    date.setDate(date.getDate() + days);
    return localDateString(date);
}

class AppState {
    constructor() {
        this.tasks = [];
        this.currentTheme = 'dark';
        this.isAlwaysOnTop = true;
        this.selectedDate = localDateString();
        this.showAllDays = false;
        this.appearance = 'midnight';
    }
}

class TodoWidgetApp {
    constructor() {
        this.state = new AppState();
        this.header = null;
        this.taskList = null;
        this.taskInput = null;

        this.init();
    }

    async init() {
        // 1. Load initial data
        this.state.currentTheme = await loadTheme();
        this.state.isAlwaysOnTop = await loadAlwaysOnTop();
        this.state.appearance = await loadAppearance();
        const savedTasks = await loadTasks();
        this.state.tasks = savedTasks || [];

        // 2. Initialize Components
        this.header = new Header({
            onThemeToggle: () => this.toggleTheme(),
            getTaskCount: () => this.getVisibleTasks().filter(t => !t.completed).length,
            getTodayTasks: () => this.state.tasks.filter(task => task.dueDate === localDateString())
        });

        this.taskList = new TaskList('tasksList', {
            onToggle: (id) => this.handleToggleTask(id),
            onDelete: (id) => this.handleDeleteTask(id),
            onEditStart: (id) => this.handleEditStart(id),
            onEditSave: (id, newText) => this.handleEditSave(id, newText),
            onEditCancel: () => this.updateUI() // just re-render to revert
        });

        this.taskInput = new TaskInput({
            onAddTask: (text) => this.handleAddTask(text),
            onClearCompleted: () => this.handleClearCompleted()
        });
        this.setupDayFilter();
        this.setupAppearance();
        this.setupOrganizer();

        // 3. Setup Global Keyboard shortcuts
        this.setupKeyboardShortcuts();

        // 4. Initial Render
        this.updateUI();
        this.header.applyTheme(this.state.currentTheme);
        this.applyAppearance(this.state.appearance);
        this.header.updateAlwaysOnTopButton(this.state.isAlwaysOnTop);

        // Auto-focus on app activation
        window.addEventListener('focus', () => {
            this.taskInput.focus();
        });
        window.addEventListener('load', () => {
            this.taskInput.focus();
        });
    }

    // --- Actions ---

    handleAddTask(text) {
        try {
            const dueDate = this.state.showAllDays ? localDateString() : this.state.selectedDate;
            this.state = createTask(this.state, text, dueDate);
            this.persistTasks();
            this.updateUI();
            
            // Animation for new task
            setTimeout(() => {
                const newTask = this.state.tasks[0]; // createTask puts it at the beginning
                if (newTask) {
                    const el = document.querySelector(`[data-task-id="${newTask.id}"]`);
                    if (el) el.classList.add('slide-in');
                }
            }, 10);
        } catch (error) {
            console.warn('Invalid task:', error.message);
        }
    }

    handleToggleTask(id) {
        this.state = toggleTask(this.state, id);
        this.persistTasks();

        // Animation for completion
        const task = this.state.tasks.find(t => t.id === id);
        const taskElement = document.querySelector(`[data-task-id="${id}"]`);
        if (taskElement && task && task.completed) {
            taskElement.classList.add('task-complete');
            setTimeout(() => {
                if (taskElement) taskElement.classList.remove('task-complete');
            }, 300);
        }
        
        this.updateUI();
    }

    handleDeleteTask(id) {
        const taskElement = document.querySelector(`[data-task-id="${id}"]`);
        if (taskElement) {
            taskElement.classList.add('fade-out');
            setTimeout(() => {
                this.state = deleteTask(this.state, id);
                this.persistTasks();
                this.updateUI();
            }, 200);
        } else {
            this.state = deleteTask(this.state, id);
            this.persistTasks();
            this.updateUI();
        }
    }

    handleEditStart(id) {
        const task = this.state.tasks.find(t => t.id === id);
        if (task) {
            this.taskList.enableEditing(id, task.text);
        }
    }

    handleEditSave(id, newText) {
        if (newText.trim() !== '') {
            this.state = updateTask(this.state, id, { text: newText });
            this.persistTasks();
        }
        this.updateUI();
    }

    handleClearCompleted() {
        const completedTasks = this.getVisibleTasks().filter(t => t.completed);
        if (completedTasks.length === 0) return;

        completedTasks.forEach(task => {
            const taskElement = document.querySelector(`[data-task-id="${task.id}"]`);
            if (taskElement) taskElement.classList.add('fade-out');
        });

        setTimeout(() => {
            completedTasks.forEach(task => {
                this.state = deleteTask(this.state, task.id);
            });
            this.persistTasks();
            this.updateUI();
        }, 200);
    }

    async toggleTheme() {
        this.state.currentTheme = this.state.currentTheme === 'dark' ? 'light' : 'dark';
        await saveTheme(this.state.currentTheme);
        this.header.applyTheme(this.state.currentTheme);
    }

    // --- Core Updates ---

    setupDayFilter() {
        this.prevDayBtn = document.getElementById('prevDayBtn');
        this.nextDayBtn = document.getElementById('nextDayBtn');
        this.todayBtn = document.getElementById('todayBtn');
        this.allDaysBtn = document.getElementById('allDaysBtn');

        this.prevDayBtn?.addEventListener('click', () => this.selectRelativeDay(-1));
        this.nextDayBtn?.addEventListener('click', () => this.selectRelativeDay(1));
        this.todayBtn?.addEventListener('click', () => {
            this.state.selectedDate = localDateString();
            this.state.showAllDays = false;
            this.updateUI();
        });
        this.allDaysBtn?.addEventListener('click', () => {
            this.state.showAllDays = !this.state.showAllDays;
            this.updateUI();
        });
    }

    setupAppearance() {
        const panel = document.getElementById('appearancePanel');
        document.getElementById('appearanceBtn')?.addEventListener('click', () => panel?.classList.toggle('hidden'));
        panel?.querySelectorAll('[data-appearance]').forEach(button => button.addEventListener('click', async () => {
            this.state.appearance = button.dataset.appearance;
            this.applyAppearance(this.state.appearance);
            await saveAppearance(this.state.appearance);
            panel.classList.add('hidden');
        }));
        document.getElementById('customBackground')?.addEventListener('input', async event => {
            this.state.appearance = 'custom';
            this.applyAppearance('custom', event.target.value);
            localStorage.setItem('qing-todo:custom-background', event.target.value);
            await saveAppearance('custom');
        });
    }

    applyAppearance(name, color) {
        const app = document.getElementById('app');
        app.dataset.appearance = name;
        if (name === 'custom') {
            const value = color || localStorage.getItem('qing-todo:custom-background') || '#8b5cf6';
            app.style.setProperty('--app-background', `linear-gradient(145deg, ${value}, color-mix(in srgb, ${value} 45%, #111827))`);
        } else {
            app.style.removeProperty('--app-background');
        }
    }

    setupOrganizer() {
        const panel = document.getElementById('organizePanel');
        const input = document.getElementById('organizeInput');
        document.getElementById('organizeBtn')?.addEventListener('click', () => {
            panel.classList.remove('hidden');
            input.focus();
        });
        document.getElementById('closeOrganizeBtn')?.addEventListener('click', () => panel.classList.add('hidden'));
        document.getElementById('organizeConfirmBtn')?.addEventListener('click', () => {
            const items = splitIntoTasks(input.value);
            if (!items.length) return;
            const dueDate = this.state.showAllDays ? localDateString() : this.state.selectedDate;
            items.slice(0, 50).reverse().forEach(text => { this.state = createTask(this.state, text, dueDate); });
            this.persistTasks();
            input.value = '';
            panel.classList.add('hidden');
            this.updateUI();
        });
    }

    selectRelativeDay(days) {
        this.state.selectedDate = shiftDate(this.state.selectedDate, days);
        this.state.showAllDays = false;
        this.updateUI();
    }

    getVisibleTasks() {
        if (this.state.showAllDays) return this.state.tasks;
        return this.state.tasks.filter(task => task.dueDate === this.state.selectedDate);
    }

    updateDayFilter() {
        if (!this.todayBtn || !this.allDaysBtn) return;
        const date = new Date(`${this.state.selectedDate}T12:00:00`);
        const label = new Intl.DateTimeFormat('zh-CN', {
            month: 'long',
            day: 'numeric',
            weekday: 'short'
        }).format(date);
        const isToday = this.state.selectedDate === localDateString();
        this.todayBtn.textContent = this.state.showAllDays ? '全部日期' : (isToday ? `今天 · ${label}` : label);
        this.allDaysBtn.classList.toggle('active', this.state.showAllDays);
    }

    updateUI() {
        const visibleTasks = this.getVisibleTasks();
        this.taskList.render(visibleTasks, { showDate: this.state.showAllDays });
        this.taskList.updateEmptyState(visibleTasks.length);
        this.taskInput.updateStats(visibleTasks);
        this.updateDayFilter();
        this.header?.updateCompactTask();
    }

    async persistTasks() {
        await saveTasks(this.state.tasks);
    }

    // --- Shortcuts ---

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + N: Focus on input
            if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
                e.preventDefault();
                this.taskInput.focus();
            }

            // Escape: Clear input
            if (e.key === 'Escape') {
                const inputEl = document.getElementById('taskInput');
                if (inputEl && inputEl.value) {
                    inputEl.value = '';
                }
            }

            // Ctrl/Cmd + Shift + C: Clear completed tasks
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
                e.preventDefault();
                this.handleClearCompleted();
            }

            // Ctrl/Cmd + T: Toggle theme
            if ((e.ctrlKey || e.metaKey) && e.key === 't') {
                e.preventDefault();
                this.toggleTheme();
            }
        });
    }
}

export function splitIntoTasks(raw) {
    if (typeof raw !== 'string') return [];
    return raw
        .replace(/\r/g, '')
        .replace(/(?:^|\n)\s*(?:[-*•]|\d+[.)、])\s*/g, '\n')
        .replace(/[。！？!?；;]+/g, '\n')
        .replace(/(?:，|,)?\s*(?:然后|接着|随后|之后|最后|再去|并且)\s*/g, '\n')
        .split(/\n+/)
        .map(item => item.trim().replace(/^[，,、：:]|[，,、：:]$/g, ''))
        .filter(item => item.length >= 2)
        .map(item => item.slice(0, 300));
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.todoWidget = new TodoWidgetApp();
});

