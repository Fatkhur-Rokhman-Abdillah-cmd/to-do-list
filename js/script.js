/* ============================================================
   TODO APP — script.js
   ------------------------------------------------------------
   Struktur kode:
     1. CONFIG       → konstanta global
     2. STATE        → state aplikasi
     3. STORAGE      → layer localStorage
     4. UTILS        → helper functions
     5. TASK SERVICE → business logic CRUD
     6. RENDERER     → fungsi render UI
     7. EVENTS       → event handler global
     8. PAGES        → controller per halaman
     9. APP          → bootstrap
   ============================================================ */

(() => {
  'use strict';

  /* ==========================================================
     1. CONFIG
     ========================================================== */
  const CONFIG = {
    STORAGE_KEY: 'todo-app/tasks/v1',
    RECENT_LIMIT: 5,
    PRIORITIES: ['low', 'medium', 'high'],
  };

  /* ==========================================================
     2. STATE
     ========================================================== */
  const state = {
    tasks: [],
    filter: { status: 'all', priority: 'all', search: '' },
    editingId: null,
  };

  /* ==========================================================
     3. STORAGE
     ========================================================== */
  const Storage = {
    load() {
      try {
        const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
      } catch (err) {
        console.error('[Storage] Gagal memuat data:', err);
        return [];
      }
    },
    save(tasks) {
      try {
        localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(tasks));
      } catch (err) {
        console.error('[Storage] Gagal menyimpan data:', err);
      }
    },
  };

  /* ==========================================================
     4. UTILS
     ========================================================== */
  const Utils = {
    uid() {
      return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    },
    escapeHtml(str = '') {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    },
    formatDate(iso) {
      if (!iso) return '';
      const d = new Date(iso);
      if (isNaN(d)) return '';
      return d.toLocaleDateString('id-ID', {
        day: '2-digit', month: 'short', year: 'numeric',
      });
    },
    isOverdue(task) {
      if (!task.dueDate || task.completed) return false;
      const today = new Date(); today.setHours(0, 0, 0, 0);
      return new Date(task.dueDate) < today;
    },
    $(sel, root = document) { return root.querySelector(sel); },
    $$(sel, root = document) { return [...root.querySelectorAll(sel)]; },
  };

  /* ==========================================================
     5. TASK SERVICE — satu-satunya pintu untuk ubah data
     ========================================================== */
  const TaskService = {
    list() {
      return [...state.tasks];
    },

    find(id) {
      return state.tasks.find((t) => t.id === id) || null;
    },

    filter() {
      const { status, priority, search } = state.filter;
      const q = search.trim().toLowerCase();

      return state.tasks.filter((t) => {
        if (status === 'active' && t.completed) return false;
        if (status === 'done' && !t.completed) return false;
        if (priority !== 'all' && t.priority !== priority) return false;
        if (q && !t.title.toLowerCase().includes(q)) return false;
        return true;
      });
    },

    create(data) {
      const now = Date.now();
      const task = {
        id: Utils.uid(),
        title: data.title.trim(),
        description: (data.description || '').trim(),
        priority: CONFIG.PRIORITIES.includes(data.priority) ? data.priority : 'medium',
        dueDate: data.dueDate || '',
        completed: false,
        createdAt: now,
        updatedAt: now,
      };
      state.tasks.unshift(task);
      Storage.save(state.tasks);
      return task;
    },

    update(id, patch) {
      const task = this.find(id);
      if (!task) return null;
      Object.assign(task, patch, { updatedAt: Date.now() });
      Storage.save(state.tasks);
      return task;
    },

    remove(id) {
      state.tasks = state.tasks.filter((t) => t.id !== id);
      Storage.save(state.tasks);
    },

    toggle(id) {
      const task = this.find(id);
      if (!task) return null;
      task.completed = !task.completed;
      task.updatedAt = Date.now();
      Storage.save(state.tasks);
      return task;
    },

    stats() {
      const total = state.tasks.length;
      const done = state.tasks.filter((t) => t.completed).length;
      return {
        total,
        done,
        active: total - done,
        progress: total ? Math.round((done / total) * 100) : 0,
      };
    },
  };

  /* ==========================================================
     6. RENDERER — fungsi murni yang menghasilkan HTML
     ========================================================== */
  const Renderer = {
    taskItem(task) {
      const overdue = Utils.isOverdue(task);
      const priorityLabel = {
        low: 'Low', medium: 'Medium', high: 'High',
      }[task.priority] || task.priority;

      return `
        <li class="task-item ${task.completed ? 'completed' : ''}" data-priority="${task.priority}" data-id="${task.id}">
          <input type="checkbox" class="task-checkbox" data-action="toggle" data-id="${task.id}"
                 ${task.completed ? 'checked' : ''} aria-label="Tandai selesai" />

          <div class="task-body">
            <div class="task-title">${Utils.escapeHtml(task.title)}</div>
            ${task.description ? `<div class="task-desc">${Utils.escapeHtml(task.description)}</div>` : ''}
            <div class="task-meta">
              <span class="badge ${task.priority}">${priorityLabel}</span>
              ${task.dueDate ? `<span>📅 ${Utils.formatDate(task.dueDate)}</span>` : ''}
              ${overdue ? '<span class="badge overdue">Overdue</span>' : ''}
            </div>
          </div>

          <div class="task-actions">
            <button class="icon-btn" data-action="edit" data-id="${task.id}" title="Edit">✏️</button>
            <button class="icon-btn danger" data-action="delete" data-id="${task.id}" title="Hapus">🗑️</button>
          </div>
        </li>`;
    },

    taskList(tasks) {
      return tasks.map((t) => this.taskItem(t)).join('');
    },
  };

  /* ==========================================================
     7. EVENTS — event delegation global (sekali saja)
     ========================================================== */
  function bindGlobalEvents() {
    document.addEventListener('click', handleGlobalClick);
  }

  function handleGlobalClick(e) {
    const target = e.target.closest('[data-action]');
    if (!target) return;

    const action = target.dataset.action;
    const id = target.dataset.id;

    switch (action) {
      case 'toggle':
        TaskService.toggle(id);
        refreshCurrentPage();
        break;
      case 'edit':
        window.location.href = `add.html?id=${encodeURIComponent(id)}`;
        break;
      case 'delete':
        if (confirm('Yakin ingin menghapus task ini?')) {
          TaskService.remove(id);
          refreshCurrentPage();
        }
        break;
    }
  }

  function refreshCurrentPage() {
    const page = document.body.dataset.page;
    const controllers = {
      dashboard: Pages.Dashboard,
      tasks: Pages.Tasks,
      form: Pages.Form,
      about: Pages.About,
    };
    controllers[page]?.refresh?.();
  }

  /* ==========================================================
     8. PAGES — controller tiap halaman
     ========================================================== */
  const Pages = {
    /* ---------- DASHBOARD ---------- */
    Dashboard: {
      init() {
        this.refresh();
      },
      refresh() {
        const stats = TaskService.stats();
        Utils.$('[data-stat="total"]').textContent = stats.total;
        Utils.$('[data-stat="active"]').textContent = stats.active;
        Utils.$('[data-stat="done"]').textContent = stats.done;
        Utils.$('[data-stat="progress"]').textContent = stats.progress + '%';
        Utils.$('[data-progress]').style.width = stats.progress + '%';

        const recent = TaskService.list()
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, CONFIG.RECENT_LIMIT);

        const listEl = Utils.$('[data-recent-list]');
        const emptyEl = Utils.$('[data-recent-empty]');

        if (recent.length === 0) {
          listEl.innerHTML = '';
          emptyEl.hidden = false;
        } else {
          listEl.innerHTML = Renderer.taskList(recent);
          emptyEl.hidden = true;
        }
      },
    },

    /* ---------- TASKS ---------- */
    Tasks: {
      init() {
        this.bindFilters();
        this.refresh();
      },
      bindFilters() {
        Utils.$$('[data-filter-status] .tab').forEach((tab) => {
          tab.addEventListener('click', () => {
            Utils.$$('[data-filter-status] .tab').forEach((t) => t.classList.remove('active'));
            tab.classList.add('active');
            state.filter.status = tab.dataset.value;
            this.refresh();
          });
        });

        Utils.$('[data-filter-priority]').addEventListener('change', (e) => {
          state.filter.priority = e.target.value;
          this.refresh();
        });

        let timer;
        Utils.$('[data-filter-search]').addEventListener('input', (e) => {
          clearTimeout(timer);
          timer = setTimeout(() => {
            state.filter.search = e.target.value;
            this.refresh();
          }, 200);
        });
      },
      refresh() {
        const tasks = TaskService.filter();
        const listEl = Utils.$('[data-task-list]');
        const emptyEl = Utils.$('[data-task-empty]');

        if (tasks.length === 0) {
          listEl.innerHTML = '';
          emptyEl.hidden = false;
        } else {
          listEl.innerHTML = Renderer.taskList(tasks);
          emptyEl.hidden = true;
        }
      },
    },

    /* ---------- FORM (ADD / EDIT) ---------- */
    Form: {
      init() {
        this.form = Utils.$('[data-task-form]');
        if (!this.form) return;

        this.titleEl = Utils.$('[data-form-title]');
        this.submitBtn = Utils.$('[data-submit-btn]');

        const params = new URLSearchParams(window.location.search);
        const id = params.get('id');

        if (id) {
          const task = TaskService.find(id);
          if (!task) {
            alert('Task tidak ditemukan.');
            window.location.href = 'tasks.html';
            return;
          }
          state.editingId = id;
          this.fillForm(task);
          this.titleEl.textContent = 'Edit Task';
          this.submitBtn.textContent = 'Update';
        }

        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
      },

      fillForm(task) {
        this.form.title.value = task.title;
        this.form.description.value = task.description;
        this.form.priority.value = task.priority;
        this.form.dueDate.value = task.dueDate;
      },

      handleSubmit(e) {
        e.preventDefault();
        if (!this.validate()) return;

        const data = {
          title: this.form.title.value,
          description: this.form.description.value,
          priority: this.form.priority.value,
          dueDate: this.form.dueDate.value,
        };

        if (state.editingId) {
          TaskService.update(state.editingId, data);
        } else {
          TaskService.create(data);
        }

        window.location.href = 'tasks.html';
      },

      validate() {
        let valid = true;
        const titleInput = this.form.title;
        const errorEl = Utils.$('[data-error="title"]');

        if (!titleInput.value.trim()) {
          titleInput.classList.add('invalid');
          errorEl.textContent = 'Judul wajib diisi.';
          valid = false;
        } else {
          titleInput.classList.remove('invalid');
          errorEl.textContent = '';
        }
        return valid;
      },

      refresh() { /* tidak ada yang perlu di-refresh pada halaman form */ },
    },

    /* ---------- ABOUT ---------- */
    About: {
      init() { /* statis */ },
      refresh() { /* no-op */ },
    },
  };

  /* ==========================================================
     9. APP — bootstrap
     ========================================================== */
  const App = {
    init() {
      state.tasks = Storage.load();
      bindGlobalEvents();

      const page = document.body.dataset.page;
      const controllers = {
        dashboard: Pages.Dashboard,
        tasks: Pages.Tasks,
        form: Pages.Form,
        about: Pages.About,
      };

      const controller = controllers[page];
      if (controller) {
        controller.init();
      } else {
        console.warn('[App] Halaman tidak dikenal:', page);
      }
    },
  };

  document.addEventListener('DOMContentLoaded', () => App.init());
})();
