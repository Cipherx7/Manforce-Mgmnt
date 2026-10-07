/* ============================================================
   DV Events Manpower Management Platform — Operations Command & Allocation
   Designed for: Visibility, Speed, Real-Time Allocation, No Clutter
   ============================================================ */

const API = '/api';

// ─── Global Button Loading State Manager ──────────────────────
let activeFetchCount = 0;
const activeLoadingButtons = new Set();

function checkPendingButtons() {
  if (activeFetchCount > 0) return;
  const now = Date.now();
  activeLoadingButtons.forEach(entry => {
    const remaining = Math.max(0, entry.minUntil - now);
    setTimeout(() => {
      if (activeFetchCount === 0 && entry.btn) {
        entry.btn.classList.remove('loading');
        entry.btn.removeAttribute('aria-busy');
        activeLoadingButtons.delete(entry);
      }
    }, remaining);
  });
}

function setButtonLoading(btn, isLoading) {
  if (!btn) return;
  if (isLoading) {
    btn.classList.add('loading');
    btn.setAttribute('aria-busy', 'true');
    btn.disabled = true;
  } else {
    btn.classList.remove('loading');
    btn.removeAttribute('aria-busy');
    btn.disabled = false;
  }
}

(function () {
  const NO_LOAD_SELECTOR = '[data-no-loading], .menu-trigger, .modal-close, [data-page], #sidebar-toggle, #theme-toggle, #topbar-avatar, #pwd-toggle, [type="checkbox"], [type="radio"]';
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn');
    if (!btn || btn.matches(NO_LOAD_SELECTOR) || btn.classList.contains('loading') || btn.disabled) return;

    btn.classList.add('loading');
    btn.setAttribute('aria-busy', 'true');
    const entry = { btn, minUntil: Date.now() + 450 };
    activeLoadingButtons.add(entry);

    // 10s fallback safety timeout so buttons never get stuck
    setTimeout(() => {
      if (entry.btn) {
        entry.btn.classList.remove('loading');
        entry.btn.removeAttribute('aria-busy');
      }
      activeLoadingButtons.delete(entry);
    }, 10000);

    // Initial check after min visual feedback duration
    setTimeout(() => {
      checkPendingButtons();
    }, 450);
  }, true);
})();

// ─── Auth State ───────────────────────────────────────────────
const auth = {
  token: null,
  user: null,
  isSuperAdmin() { return ['super_admin', 'lead'].includes(this.user?.role); },
  isLead()       { return ['super_admin', 'lead'].includes(this.user?.role); },
  isManager()    { return this.user?.role === 'manager'; },
  can(perm) {
    if (!this.user) return false;
    if (this.isLead()) return true;
    try {
      const perms = typeof this.user.permissions === 'string'
        ? JSON.parse(this.user.permissions) : this.user.permissions || {};
      return !!perms[perm];
    } catch { return false; }
  },
};

// ─── Global State ─────────────────────────────────────────────
const state = {
  currentPage: 'dashboard',
  managers: [],
  categories: [],
  clients: [],
  projects: [],
  resources: [],
  dashboardData: null,
  resourceFilter: {
    status: 'all',
    category_id: '',
    category_ids: [],
    manager_id: '',
    manager_ids: [],
    search: '',
    viewMode: 'list', // 'list' or 'grid'
    activeFilters: [],
    ageRange: '',
    gender: '',
    rateRange: '',
    zone: '',
    zones: [],
    availability: '',
    availabilities: []
  },
  selectedResourceIds: new Set(),
  projectFilter: {
    status: 'all',
    search: '',
    viewMode: 'list' // 'list' or 'grid'
  },
  assignmentFilter: {
    tab: 'active', // 'active' or 'history'
    search: ''
  },
  editTarget: null,
};

// ─── DOM Helpers & Utilities ──────────────────────────────────
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => ctx.querySelectorAll(sel);

async function api(path, method = 'GET', body = null) {
  activeFetchCount++;
  try {
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(auth.token ? { 'Authorization': `Bearer ${auth.token}` } : {}),
      },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(API + path, opts);
    if (res.status === 401) {
      // Session expired — force re-login
      authLogout(false);
      return {};
    }
    const data = await res.json();
    if (!data.success && res.status >= 400) throw new Error(data.error || 'API error');
    return data;
  } finally {
    activeFetchCount = Math.max(0, activeFetchCount - 1);
    if (activeFetchCount === 0) {
      checkPendingButtons();
    }
  }
}

function toast(msg, type = 'info') {
  const container = $('#toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  el.innerHTML = `<span>${icons[type]}</span><span>${msg}</span>`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function calculateAge(dobStr) {
  if (!dobStr) return null;
  const birth = new Date(dobStr);
  if (isNaN(birth.getTime())) return null;
  const diff = Date.now() - birth.getTime();
  const ageDate = new Date(diff);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
}

function badge(status) {
  if (!status) return `<span class="badge badge-available">Available</span>`;
  const normalized = status.toLowerCase();
  const label = normalized.replace(/_/g, ' ');
  return `<span class="badge badge-${normalized}">${label.charAt(0).toUpperCase() + label.slice(1)}</span>`;
}

function statusDot(status) {
  const colors = {
    available: '#059669',
    nominated: '#0284c7',
    pending_approval: '#d97706',
    confirmed: '#7c3aed',
    deployed: '#2563eb',
    released: '#10b981',
    assigned: '#2563eb',
    on_leave: '#d97706',
    unavailable: '#dc2626'
  };
  return `<span style="width:8px;height:8px;border-radius:50%;background:${colors[status]||'#94a3b8'};display:inline-block;margin-right:6px;"></span>`;
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function emptyState(msg = 'No data found') {
  return `<div class="empty-state"><div class="empty-icon">📭</div><p>${msg}</p></div>`;
}

function loadingHTML() {
  return `<div class="loading-overlay"><div class="spinner"></div><span>Loading operations data…</span></div>`;
}

function progressBar(val, max) {
  const pct = max > 0 ? Math.min(100, Math.round((val / max) * 100)) : 0;
  const cls = pct >= 100 ? 'success' : pct >= 60 ? '' : 'warning';
  return `
    <div class="progress-wrap" title="${val}/${max} (${pct}%)">
      <div class="progress-bar ${cls}" style="width:${pct}%"></div>
    </div>
  `;
}

function getInitials(name) {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

// ─── Navigation ───────────────────────────────────────────────
function navigate(page, updateHash = true) {
  const pagePermMap = {
    dashboard:         'view_dashboard',
    resources:         'view_resources',
    'resource-import': 'edit_resources',
    projects:          'view_projects',
    'project-form':    'edit_projects',
    assignments:       'view_assignments',
    managers:          'view_managers',
    reports:           'view_reports',
    clients:           'view_clients',
    availability:      'view_resources',
    users:             'manage_users',
    'user-form':       'manage_users',
    'user-detail':     'manage_users',
    nominations:       'view_assignments',
    attendance:        'view_assignments',
  };
  if (pagePermMap[page] && !auth.can(pagePermMap[page])) {
    toast(`Access restricted: you do not have permission to view this section.`, 'error');
    if (page !== 'dashboard' && auth.can('view_dashboard')) {
      navigate('dashboard');
    }
    return;
  }

  $$('.page').forEach(p => p.classList.remove('active'));
  $$('.nav-item').forEach(n => n.classList.remove('active'));
  $$('.mobile-nav-btn').forEach(n => n.classList.remove('active'));

  const navTarget = (page === 'user-form' || page === 'user-detail') 
    ? 'users' 
    : (page === 'project-form' ? 'projects' : (page === 'resource-import' ? 'resources' : page));
  const pageEl = $(`#page-${page}`);
  const navEl = $(`.nav-item[data-page="${navTarget}"]`);
  const mobileNavEl = $(`.mobile-nav-btn[data-page="${navTarget}"]`);

  if (pageEl) pageEl.classList.add('active');
  if (navEl) navEl.classList.add('active');
  if (mobileNavEl) mobileNavEl.classList.add('active');

  state.currentPage = page;
  try {
    localStorage.setItem('dv_active_page', page);
    if (updateHash && window.location.hash.replace(/^#/, '') !== page) {
      window.location.hash = page;
    }
  } catch {}

  // Title bar update
  const titles = {
    dashboard:         '📊 Dashboard',
    resources:         auth.isLead() ? '👥 All Resources' : '👥 My Resources',
    'resource-import': '📥 Import Resources',
    projects:          '📋 Projects',
    'project-form':    '📋 Event Project',
    assignments:       '🔗 Deployments',
    nominations:       '📝 Nominations',
    attendance:        '📍 Attendance',
    managers:          '👔 Managers',
    reports:           '📈 Reports',
    clients:           '🏢 Clients',
    availability:      '🟢 Availability',
    users:             '🔐 Users & Roles',
    'user-form':       'User Management',
    'user-detail':     'User Profile & Access',
  };
  const titleEl = document.getElementById('topbar-title');
  if (titleEl) titleEl.textContent = titles[page] || page;

  loadPage(page);

  // Close mobile sidebar if open
  closeSidebarDrawer();
}

function loadPage(page) {
  switch (page) {
    case 'dashboard':       loadDashboard(); break;
    case 'resources':       loadResources(); break;
    case 'resource-import': loadResourceImportPage(); break;
    case 'projects':        loadProjects(); break;
    case 'assignments':     loadAssignments(); break;
    case 'nominations':     loadNominations(); break;
    case 'attendance':      loadAttendancePage(); break;
    case 'managers':        loadManagers(); break;
    case 'reports':         loadReports(); break;
    case 'clients':         loadClients(); break;
    case 'availability':    loadAvailability(); break;
    case 'users':           loadUsersPage(); break;
    case 'user-form':       /* rendered by openUserCreatePage / openUserEditPage */ break;
    case 'user-detail':     /* rendered by openUserDetailPage */ break;
    case 'project-form':    /* rendered by openProjectFormPage */ break;
  }
}

// ─── Interactive Pie / Donut Chart Component ───────────────────
const PIE_COLORS = [
  '#4f46e5', // Indigo
  '#0ea5e9', // Sky
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#8b5cf6', // Violet
  '#14b8a6', // Teal
  '#f97316', // Orange
  '#6366f1', // Indigo light
  '#64748b', // Slate
];

function generateCategoryPieSVG(categories, totalStaff, isDonut = true) {
  if (!totalStaff || totalStaff <= 0) {
    return `<div style="padding:40px;text-align:center;color:var(--text-muted)">No category data available</div>`;
  }

  const size = 280;
  const cx = size / 2;
  const cy = size / 2;
  const R = 110;
  const r = isDonut ? 66 : 0;

  // Filter to categories with count > 0
  const activeCats = categories.filter(c => (parseInt(c.total, 10) || 0) > 0);
  if (!activeCats.length) {
    return `<div style="padding:40px;text-align:center;color:var(--text-muted)">No resources recorded</div>`;
  }

  let currentAngle = -90; // Start at 12 o'clock
  let paths = [];

  activeCats.forEach((cat, idx) => {
    const count = parseInt(cat.total, 10) || 0;
    const sliceAngle = (count / totalStaff) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + sliceAngle;
    currentAngle = endAngle;

    const rad = deg => (deg * Math.PI) / 180;
    const x1 = cx + R * Math.cos(rad(startAngle));
    const y1 = cy + R * Math.sin(rad(startAngle));
    const x2 = cx + R * Math.cos(rad(endAngle));
    const y2 = cy + R * Math.sin(rad(endAngle));

    const x3 = cx + r * Math.cos(rad(endAngle));
    const y3 = cy + r * Math.sin(rad(endAngle));
    const x4 = cx + r * Math.cos(rad(startAngle));
    const y4 = cy + r * Math.sin(rad(startAngle));

    const largeArc = sliceAngle > 180 ? 1 : 0;
    const color = PIE_COLORS[idx % PIE_COLORS.length];
    const pct = Math.round((count / totalStaff) * 100);

    let d;
    if (r > 0) {
      d = `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L ${x3.toFixed(2)} ${y3.toFixed(2)} A ${r} ${r} 0 ${largeArc} 0 ${x4.toFixed(2)} ${y4.toFixed(2)} Z`;
    } else {
      d = `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
    }

    paths.push(`
      <path 
        d="${d}" 
        fill="${color}" 
        stroke="#ffffff" 
        stroke-width="2.5"
        class="pie-slice"
        data-cat="${escapeHtml(cat.category)}"
        data-count="${count}"
        data-pct="${pct}"
        data-id="${cat.id || ''}"
        onmouseover="handlePieHover(this, '${escapeHtml(cat.category)}', ${count}, ${pct})"
        onmouseout="handlePieLeave()"
        onclick="filterCategoryAndGo(${cat.id})"
        style="cursor:pointer"
      >
        <title>${cat.category}: ${count} (${pct}%)</title>
      </path>
    `);
  });

  return `
    <div class="pie-svg-container" style="position:relative;display:inline-block;max-width:100%;width:${size}px;height:${size}px">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="overflow:visible;max-width:100%;height:auto">
        <g>${paths.join('')}</g>
      </svg>
      ${isDonut ? `
        <div id="pie-center-content" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;pointer-events:none;width:120px">
          <div id="pie-center-val" style="font-size:1.85rem;font-weight:700;color:var(--text-primary);line-height:1.1;font-feature-settings:'tnum' 1">${totalStaff}</div>
          <div id="pie-center-lbl" style="font-size:0.72rem;font-weight:600;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.8px;margin-top:2px">Total Resources</div>
        </div>
      ` : ''}
    </div>
  `;
}

function handlePieHover(el, name, count, pct) {
  const valEl = document.getElementById('pie-center-val');
  const lblEl = document.getElementById('pie-center-lbl');
  if (valEl && lblEl) {
    valEl.textContent = `${count} (${pct}%)`;
    valEl.style.fontSize = '1.35rem';
    lblEl.textContent = name;
  }
  document.querySelectorAll('.pie-slice').forEach(s => {
    if (s !== el) {
      s.style.opacity = '0.35';
      s.style.transform = 'scale(1)';
    } else {
      s.style.opacity = '1';
      s.style.transform = 'scale(1.04)';
    }
  });
  document.querySelectorAll('.pie-legend-row').forEach(row => {
    if (row.dataset.cat === name) row.classList.add('highlighted');
    else row.classList.remove('highlighted');
  });
}

function handlePieLeave() {
  const valEl = document.getElementById('pie-center-val');
  const lblEl = document.getElementById('pie-center-lbl');
  if (valEl && lblEl) {
    const total = state.dashboardData?.overview?.total_resources || state.resources?.length || '0';
    valEl.textContent = total;
    valEl.style.fontSize = '1.85rem';
    lblEl.textContent = 'Total Resources';
  }
  document.querySelectorAll('.pie-slice').forEach(s => {
    s.style.opacity = '1';
    s.style.transform = 'scale(1)';
  });
  document.querySelectorAll('.pie-legend-row').forEach(row => {
    row.classList.remove('highlighted');
  });
}

function highlightPieSlice(catName) {
  const slice = document.querySelector(`.pie-slice[data-cat="${catName}"]`);
  if (slice) {
    const count = slice.dataset.count;
    const pct = slice.dataset.pct;
    handlePieHover(slice, catName, count, pct);
  }
}

function toggleCategoryViewMode() {
  const pieWrap = document.getElementById('category-pie-container');
  const matrixWrap = document.getElementById('category-matrix-container');
  const btn = document.getElementById('pie-toggle-btn');
  if (!pieWrap || !matrixWrap) return;

  if (pieWrap.style.display === 'none') {
    pieWrap.style.display = 'flex';
    matrixWrap.style.display = 'none';
    if (btn) btn.textContent = 'Switch to Matrix View';
  } else {
    pieWrap.style.display = 'none';
    matrixWrap.style.display = 'block';
    if (btn) btn.textContent = 'Switch to Pie Chart';
  }
}

function renderCategoryPieSection(categories, totalStaff, sectionTitle = '🥧 Resources by Category (Pie Chart)') {
  const activeCats = categories.filter(c => (parseInt(c.total, 10) || 0) > 0);

  return `
    <div class="card mb-3">
      <div class="card-header">
        <div>
          <span class="card-title">${sectionTitle}</span>
          <span class="text-muted text-sm" style="font-weight:400">Roster distribution across ${activeCats.length} active roles</span>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-sm btn-secondary" id="pie-toggle-btn" onclick="toggleCategoryViewMode()">
            Switch to Matrix View
          </button>
        </div>
      </div>
      <div class="card-body">
        <div id="category-pie-container" style="display:flex;align-items:center;justify-content:space-around;gap:36px;flex-wrap:wrap">
          <!-- Pie / Donut Chart Vector -->
          <div style="display:flex;justify-content:center;padding:12px">
            ${generateCategoryPieSVG(categories, totalStaff, true)}
          </div>

          <!-- Interactive Legend & Details List -->
          <div style="flex:1;min-width:min(100%, 300px);max-width:580px">
            <div class="flex justify-between items-center mb-2">
              <span style="font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-muted)">
                Category Share & Availability
              </span>
              <span class="text-sm text-muted">Click row to filter</span>
            </div>
            <div class="pie-legend-grid">
              ${activeCats.map((c, idx) => {
                const color = PIE_COLORS[idx % PIE_COLORS.length];
                const count = parseInt(c.total, 10) || 0;
                const pct = totalStaff > 0 ? Math.round((count / totalStaff) * 100) : 0;
                return `
                  <div 
                    class="pie-legend-row" 
                    data-cat="${escapeHtml(c.category)}"
                    onclick="filterCategoryAndGo(${c.id})"
                    onmouseover="highlightPieSlice('${escapeHtml(c.category)}')"
                    onmouseout="handlePieLeave()"
                    title="Click to view available ${c.category}"
                  >
                    <div class="flex items-center gap-2" style="min-width:130px">
                      <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${color};flex-shrink:0"></span>
                      <strong style="font-size:0.88rem;color:var(--text-primary)">${c.category}</strong>
                    </div>
                    <div class="flex items-center gap-2">
                      <span class="font-mono text-sm" style="color:var(--text-secondary);min-width:55px;text-align:right">
                        ${count} (${pct}%)
                      </span>
                      <span class="cat-avail-pill" style="font-size:0.74rem">${c.available || 0} Avail</span>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>

        <!-- Alternative Matrix View (Hidden by default, toggleable) -->
        <div id="category-matrix-container" style="display:none;margin-top:12px">
          <div class="category-matrix">
            ${categories.map(c => `
              <div class="cat-card" onclick="filterCategoryAndGo(${c.id})" title="Click to view available ${c.category}">
                <div class="cat-title">${c.category}</div>
                <div class="cat-counts">
                  <span class="cat-avail-pill">${c.available || 0} Avail</span>
                  <span class="font-mono text-muted text-sm">${c.assigned || 0} asgn / ${c.total || 0} tot</span>
                </div>
                <div style="margin-top:8px">
                  ${progressBar(c.assigned || 0, c.total || 1)}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
// 1. DASHBOARD — OPERATIONS COMMAND CENTER
// ═══════════════════════════════════════════════════════════════
async function loadDashboard() {
  const content = $('#page-dashboard');
  content.innerHTML = loadingHTML();
  try {
    const { data } = await api('/dashboard');
    state.dashboardData = data;
    const overview = data.overview || {};
    const project_stats = data.project_stats || { active: 0, planned: 0, total_projects: 0, completed: 0, cancelled: 0 };
    const by_category = data.by_category || [];
    const by_project = data.by_project || data.my_projects || [];
    const unfilled_gaps = data.unfilled_gaps || [];
    const recent_activity = data.recent_activity || [];

    const total = parseInt(overview.total_resources, 10) || 0;
    const avail = parseInt(overview.available, 10) || 0;
    const asgn = parseInt(overview.assigned, 10) || parseInt(overview.deployed, 10) || 0;
    const leave = parseInt(overview.on_leave, 10) || 0;
    const unavail = parseInt(overview.unavailable, 10) || 0;
    const utilPct = total > 0 ? Math.round((asgn / total) * 100) : 0;

    // Fetch bench staff if not yet loaded for mobile quick dispatch
    let benchStaff = (state.resources || []).filter(r => r.status === 'available');
    if (!benchStaff.length && avail > 0) {
      try {
        const { data: resData } = await api('/resources?status=available');
        state.resources = resData;
        benchStaff = resData;
      } catch {}
    }

    content.innerHTML = `
      <!-- Mobile Operations Quick Command Hub (Active on mobile <= 768px) -->
      <div class="mobile-command-header">
        <div class="mobile-command-title">
          <span>⚡ Operations Field Command</span>
          <span class="badge" style="background:#ecfdf5;color:#047857;font-size:0.75rem;font-weight:600">Bench: ${avail} Ready</span>
        </div>
        <div class="mobile-action-bar">
          ${auth.can('edit_assignments') ? `
          <button type="button" class="mobile-action-btn primary" onclick="openQuickDeployModal()">
            <span class="m-btn-icon">⚡</span>
            <span>Deploy</span>
          </button>` : ''}
          ${auth.can('edit_resources') ? `
          <button type="button" class="mobile-action-btn secondary" onclick="openQuickWorkerModal()">
            <span class="m-btn-icon">➕</span>
            <span>Add Resource</span>
          </button>` : ''}
          ${auth.can('edit_projects') ? `
          <button type="button" class="mobile-action-btn secondary" onclick="openQuickProjectModal()">
            <span class="m-btn-icon">📋</span>
            <span>New Event</span>
          </button>` : ''}
        </div>
      </div>

      <!-- Operations Header & Quick Alert (Desktop) -->
      <div class="flex justify-between items-center mb-3" style="flex-wrap:wrap;gap:12px">
        <div>
          <h2 style="font-size:1.4rem;font-weight:700;color:var(--text-primary);letter-spacing:-0.4px">
            Operations Command Center
          </h2>
          <p class="text-muted" style="margin-top:2px">
            Live resource visibility & deployment tracking across all active events.
          </p>
        </div>
        <div class="flex gap-2">
          ${auth.can('edit_assignments') ? `<button class="btn btn-primary" onclick="openAssignModal()">⚡ Quick Allocate</button>` : ''}
          ${auth.can('view_reports') ? `<button class="btn btn-secondary" onclick="navigate('reports')">📈 View Reports</button>` : ''}
        </div>
      </div>

      <!-- Pulse Metrics: Know Resource Situation in Seconds -->
      <div class="stats-grid">
        <!-- Available (The Bench) -->
        <div class="stat-card success" style="cursor:pointer" onclick="filterAndGoResources('available')" title="Click to view available resources">
          <div class="stat-label">Available Bench</div>
          <div class="stat-value" style="color:var(--success)">${avail}</div>
          <div class="stat-sub">Ready for immediate deployment</div>
          ${auth.can('edit_assignments') ? `
          <div style="margin-top:10px">
            <span class="btn btn-sm btn-success" style="padding:3px 10px;font-size:0.75rem">⚡ Deploy Resources →</span>
          </div>` : ''}
        </div>

        <!-- Assigned / Active Deployments -->
        <div class="stat-card accent" style="cursor:pointer" onclick="filterAndGoResources('assigned')" title="Click to view deployed resources">
          <div class="stat-label">Currently Deployed</div>
          <div class="stat-value" style="color:var(--accent)">${asgn}</div>
          <div class="stat-sub">${utilPct}% of total resources active</div>
          <div style="margin-top:10px">
            ${progressBar(asgn, total)}
          </div>
        </div>

        <!-- On Leave -->
        <div class="stat-card warning" style="cursor:pointer" onclick="filterAndGoResources('on_leave')">
          <div class="stat-label">On Leave</div>
          <div class="stat-value" style="color:var(--warning)">${leave}</div>
          <div class="stat-sub">Temporary absence</div>
        </div>

        <!-- Unavailable -->
        <div class="stat-card danger" style="cursor:pointer" onclick="filterAndGoResources('unavailable')">
          <div class="stat-label">Unavailable</div>
          <div class="stat-value" style="color:var(--danger)">${unavail}</div>
          <div class="stat-sub">Off-duty / inactive</div>
        </div>

        <!-- Total Resource Capacity -->
        <div class="stat-card" style="cursor:pointer" onclick="filterAndGoResources('all')">
          <div class="stat-label">Total Resources</div>
          <div class="stat-value">${total}</div>
          <div class="stat-sub">${project_stats.active} active · ${project_stats.planned} planned projects</div>
        </div>
      </div>

      <!-- Mobile Ready Bench: Immediate Dispatch -->
      <div class="mobile-bench-section">
        <div class="flex justify-between items-center mb-2">
          <span style="font-weight:700;font-size:0.88rem;color:var(--text-primary)">⚡ Ready Bench (Instant Dispatch)</span>
          <a href="javascript:void(0)" onclick="filterAndGoResources('available')" style="font-size:0.75rem;color:var(--accent);font-weight:600">View All (${avail}) →</a>
        </div>
        <div id="mobile-bench-list">
          ${renderMobileBenchList(benchStaff.slice(0, 4))}
        </div>
      </div>

      <!-- Project-Wise Staffing Deficits Section -->
      ${(() => {
        const projectsWithDeficits = by_project.filter(p => (p.deficit && p.deficit > 0) || (p.category_gaps && p.category_gaps.length > 0));
        if (!projectsWithDeficits.length) return '';
        return `
          <div class="card mb-3" style="border-color:rgba(239, 68, 68, 0.28)">
            <div class="card-header" style="background:rgba(239, 68, 68, 0.05);border-bottom:1px solid var(--border);padding:14px 20px">
              <div class="flex items-center gap-2">
                <span style="font-size:1.15rem">⚠️</span>
                <div>
                  <div style="font-weight:700;font-size:0.98rem;color:var(--text-primary)">
                    Resource Deficit Alert (Project-Wise)
                  </div>
                  <div class="text-muted text-xs" style="margin-top:2px">
                    ${projectsWithDeficits.length} event project${projectsWithDeficits.length > 1 ? 's have' : ' has'} unfilled resource requirements
                  </div>
                </div>
              </div>
            </div>
            <div class="card-body" style="padding:0">
              <div class="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th style="width:25%">Event / Project</th>
                      <th style="width:22%">Client &amp; Location</th>
                      <th style="width:20%">Resource Level</th>
                      <th style="width:23%">Deficit by Role</th>
                      <th style="width:10%;text-align:right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${projectsWithDeficits.map(p => `
                      <tr>
                        <td>
                          <div style="font-weight:700;color:var(--text-primary);font-size:0.92rem">${escapeHtml(p.project)}</div>
                          <div class="text-muted text-xs" style="margin-top:2px">
                            ${p.start_date ? `${formatDate(p.start_date)} – ${formatDate(p.end_date)}` : 'Dates TBD'}
                            ${p.deadline ? ` · <span style="color:var(--warning)">Deadline: ${formatDate(p.deadline)}</span>` : ''}
                          </div>
                        </td>
                        <td>
                          <div style="color:var(--text-primary);font-size:0.88rem">${escapeHtml(p.client || 'Client')}</div>
                          <div class="text-muted text-xs">📍 ${escapeHtml(p.location || 'Location TBD')}</div>
                        </td>
                        <td>
                          <div class="flex items-center gap-2">
                            <span class="badge" style="background:rgba(239, 68, 68, 0.15);color:#ef4444;font-weight:700;font-size:0.78rem">
                              Deficit: ${p.deficit} Resources
                            </span>
                          </div>
                          <div class="text-muted text-xs" style="margin-top:4px">
                            ${p.assigned_count} of ${p.total_required} filled
                          </div>
                        </td>
                        <td>
                          <div style="display:flex;flex-wrap:wrap;gap:6px">
                            ${(p.category_gaps && p.category_gaps.length) ? p.category_gaps.map(g => `
                              <span class="gap-pill" style="font-size:0.76rem;cursor:pointer" onclick="openAssignModal(null, ${p.id})" title="Click to allocate">
                                <strong>${g.gap}</strong> ${escapeHtml(g.category)}
                              </span>
                            `).join('') : `<span class="text-muted text-xs">${p.deficit} positions needed</span>`}
                          </div>
                        </td>
                        <td style="text-align:right">
                          ${auth.can('edit_assignments') ? `
                            <button class="btn btn-sm btn-primary" onclick="openAssignModal(null, ${p.id})" style="display:inline-flex;align-items:center;gap:5px;padding:6px 14px;font-weight:600;font-size:0.82rem;white-space:nowrap">
                              <span>⚡ Allocate</span>
                            </button>
                          ` : ''}
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        `;
      })()}

      <!-- Row: Active Project Deployments (Where They Are Deployed) -->
      <div class="card mb-3">
        <div class="card-header">
          <div class="card-title">
            <span>📍 Active Deployments &amp; Locations</span>
            <span class="text-muted text-sm" style="font-weight:400">Where resources are deployed right now</span>
          </div>
          <button class="btn btn-sm btn-secondary" onclick="navigate('projects')">View All Projects →</button>
        </div>
        <div class="card-body">
          ${by_project.length ? `
            <div class="deployment-grid">
              ${by_project.map(p => `
                <div class="deployment-card">
                  <div>
                    <div class="deployment-head">
                      <div>
                        <div class="deployment-name">${p.project}</div>
                        <div class="deployment-meta">
                          <span>🏢 ${p.client || 'Client'}</span>
                          <span>📍 <strong>${p.location || 'Location TBD'}</strong></span>
                          <span>👔 ${p.manager || 'Unassigned'}</span>
                        </div>
                      </div>
                      ${badge(p.status)}
                    </div>
                  </div>

                  <div class="deployment-meter">
                    <div class="deployment-meter-header">
                      <span style="color:var(--text-secondary)">Resource Level</span>
                      <span class="font-mono" style="color:${(p.deficit && p.deficit > 0) ? '#ef4444' : 'var(--accent)'}">
                        ${p.total_required > 0 ? `${p.assigned_count} / ${p.total_required} Filled` : `${p.assigned_count} Assigned`}
                      </span>
                    </div>
                    ${progressBar(p.assigned_count, p.total_required > 0 ? p.total_required : (p.assigned_count > 0 ? p.assigned_count : 1))}
                    ${(p.deficit && p.deficit > 0) ? `
                      <div class="flex items-center justify-between mt-2">
                        <span style="color:#ef4444;font-size:0.78rem;font-weight:700">⚠️ Deficit: ${p.deficit} Needed</span>
                        ${(p.category_gaps && p.category_gaps.length) ? `
                          <div style="display:flex;flex-wrap:wrap;gap:4px">
                            ${p.category_gaps.slice(0, 2).map(g => `<span class="gap-pill" style="font-size:0.72rem;padding:1px 6px" onclick="openAssignModal(null, ${p.id})">${g.gap} ${escapeHtml(g.category)}</span>`).join('')}
                            ${p.category_gaps.length > 2 ? `<span style="font-size:0.72rem;color:var(--text-muted)">+${p.category_gaps.length - 2}</span>` : ''}
                          </div>
                        ` : ''}
                      </div>
                    ` : ''}
                  </div>

                  <div class="flex justify-between items-center" style="border-top:1px solid var(--border);padding-top:12px;margin-top:8px">
                    <span class="text-sm text-muted">🗓️ ${p.start_date ? `${formatDate(p.start_date)} – ${formatDate(p.end_date)}` : 'Dates TBD'}</span>
                    <div class="flex gap-2">
                      <button class="btn btn-sm btn-secondary" onclick="viewProject(${p.id})">Team</button>
                      ${auth.can('edit_assignments') ? `<button class="btn btn-sm btn-primary" onclick="openAssignModal(null, ${p.id})">⚡ Allocate</button>` : ''}
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : `<div style="padding:24px">${emptyState('No active project deployments currently running.')}</div>`}
        </div>
      </div>

      <!-- Resource Distribution By Category (Interactive Pie / Donut Chart with Mobile Collapse) -->
      <div class="mobile-analytics-toggle" id="mobile-analytics-toggle" onclick="toggleMobileAnalytics()">
        <div class="flex items-center gap-2">
          <span style="font-size:1.15rem">📊</span>
          <span>Resource Distribution &amp; Category Analytics</span>
        </div>
        <span id="mobile-analytics-chevron" style="transition:transform 0.2s">▼</span>
      </div>
      <div id="analytics-section-wrapper" class="mobile-collapsed">
        ${renderCategoryPieSection(by_category, total)}
      </div>

      <!-- Recent Real-Time Operational Log -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">🕒 Real-Time Operations Activity</span>
          <span class="text-muted text-sm">Last 10 status changes</span>
        </div>
        <div class="card-body" style="padding:0">
          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Resource</th>
                  <th>Action / Transition</th>
                  <th>Manager</th>
                  <th>Deployment Notes</th>
                </tr>
              </thead>
              <tbody>
                ${recent_activity && recent_activity.length ? recent_activity.map(a => `
                  <tr>
                    <td class="font-mono text-sm text-muted">${formatDate(a.changed_at)}</td>
                    <td style="font-weight:600;color:var(--text-primary)">${a.resource_name}</td>
                    <td>${badge(a.old_status)} → ${badge(a.new_status)}</td>
                    <td class="text-muted">${a.changed_by || '—'}</td>
                    <td class="text-muted text-sm">${a.notes || '—'}</td>
                  </tr>
                `).join('') : '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted)">No recent operational changes</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    content.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><p>${err.message}</p></div>`;
    toast(err.message, 'error');
  }
}

function filterAndGoResources(status) {
  state.resourceFilter.status = status;
  state.resourceFilter.category_id = '';
  state.resourceFilter.search = '';
  navigate('resources');
}

function filterCategoryAndGo(catId) {
  state.resourceFilter.status = 'available';
  state.resourceFilter.category_id = catId;
  state.resourceFilter.search = '';
  navigate('resources');
}

function quickFillGap(projectName, categoryName) {
  // Preload assign modal for this project
  const prj = state.projects.find(p => p.name === projectName);
  const cat = state.categories.find(c => c.name === categoryName);
  state.resourceFilter.category_id = cat ? cat.id : '';
  state.resourceFilter.status = 'available';
  navigate('resources');
  toast(`Showing available ${categoryName} resources for "${projectName}"`, 'info');
}

function renderMobileBenchList(benchStaff) {
  if (!benchStaff || !benchStaff.length) {
    return `<div style="padding:14px;background:var(--bg-hover);border-radius:10px;text-align:center;font-size:0.82rem;color:var(--text-muted)">No resources currently on the bench.</div>`;
  }
  return benchStaff.map(r => `
    <div class="mobile-bench-item">
      <div class="mobile-bench-info">
        <div class="ops-avatar avail">${getInitials(r.name)}</div>
        <div style="min-width:0;flex:1">
          <div class="mobile-bench-name">${escapeHtml(r.name)}</div>
          <div class="mobile-bench-meta">
            <span>${escapeHtml(r.category_name || 'Resource')}</span>
            ${r.contact_info ? `<span>· 📞 ${escapeHtml(r.contact_info)}</span>` : ''}
          </div>
        </div>
      </div>
      ${auth.can('edit_assignments') ? `
      <button class="btn btn-sm btn-primary" onclick="openQuickDeployModal(${r.id})" style="padding:6px 12px;font-size:0.78rem;flex-shrink:0">
        ⚡ Deploy
      </button>` : ''}
    </div>
  `).join('');
}

function toggleMobileAnalytics() {
  const wrapper = document.getElementById('analytics-section-wrapper');
  const chevron = document.getElementById('mobile-analytics-chevron');
  if (!wrapper) return;
  const isCollapsed = wrapper.classList.contains('mobile-collapsed');
  if (isCollapsed) {
    wrapper.classList.remove('mobile-collapsed');
    if (chevron) chevron.textContent = '▲';
  } else {
    wrapper.classList.add('mobile-collapsed');
    if (chevron) chevron.textContent = '▼';
  }
}

// ═══════════════════════════════════════════════════════════════
// MOBILE QUICK ACTION HANDLERS (FAST ON-SITE FUNCTIONALITY)
// ═══════════════════════════════════════════════════════════════

async function openQuickDeployModal(preselectedWorkerId = null, preselectedProjectId = null) {
  if (!auth.can('edit_assignments')) {
    toast('Access restricted: You do not have permission to deploy resources.', 'error');
    return;
  }
  if (!state.resources.length || !state.projects.length) {
    const [{ data: resources }, { data: projects }] = await Promise.all([
      api('/resources'),
      api('/projects?status=active')
    ]);
    state.resources = resources;
    state.projects = projects;
  }

  const activeProjects = state.projects.filter(p => ['active', 'planned'].includes(p.status));
  const form = document.getElementById('quick-deploy-form');
  if (!form) return;

  form.innerHTML = `
    <div class="form-group">
      <label class="form-label" style="font-weight:600">1. Select Ready Resource *</label>
      <select id="qd-worker" class="form-input" style="font-size:16px">
        <option value="">-- Choose Resource --</option>
        ${state.resources.map(r => {
          const isSelected = preselectedWorkerId && String(r.id) === String(preselectedWorkerId);
          const isAvail = r.status === 'available';
          return `
            <option value="${r.id}" ${isSelected ? 'selected' : (!isAvail ? 'disabled' : '')}>
              ${isAvail ? '🟢' : '⛔'} ${r.name} (${r.category_name || 'Resource'})${!isAvail ? ` [${r.status}]` : ''}
            </option>
          `;
        }).join('')}
      </select>
    </div>

    <div class="form-group">
      <label class="form-label" style="font-weight:600">2. Target Event Project *</label>
      <select id="qd-project" class="form-input" style="font-size:16px">
        <option value="">-- Choose Event --</option>
        ${activeProjects.map(p => {
          const isSelected = preselectedProjectId && String(p.id) === String(preselectedProjectId);
          return `
            <option value="${p.id}" ${isSelected ? 'selected' : ''}>
              📍 ${p.name} (${p.location || 'On-Site'}) · ${p.status.toUpperCase()}
            </option>
          `;
        }).join('')}
      </select>
    </div>

    <div class="form-group">
      <label class="form-label">Deployment Role / Station Note</label>
      <input type="text" id="qd-role" class="form-input" placeholder="e.g. Lead Sound Engineer, Front Stage" style="font-size:16px">
    </div>
  `;

  const submitBtn = document.getElementById('quick-deploy-submit');
  if (submitBtn) {
    submitBtn.onclick = async () => {
      const resource_id = document.getElementById('qd-worker')?.value;
      const project_id = document.getElementById('qd-project')?.value;
      const role_on_project = document.getElementById('qd-role')?.value.trim();

      if (!resource_id || !project_id) {
        toast('Please select both a resource and a project', 'error');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Deploying…';
      try {
        await api('/assignments', 'POST', {
          resource_id,
          project_id,
          role_on_project: role_on_project || 'On-Site Resource',
          notes: 'Quick mobile allocation'
        });
        toast('⚡ Resource deployed to project successfully!', 'success');
        closeModal('quick-deploy-modal');
        if (state.currentPage === 'dashboard') loadDashboard();
        else if (state.currentPage === 'assignments') loadAssignments();
        else if (state.currentPage === 'resources') loadResources();
        else loadDashboard();
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '⚡ Confirm On-Site Deployment';
      }
    };
  }

  showModal('quick-deploy-modal');
}

async function openQuickWorkerModal() {
  if (!auth.can('edit_resources')) {
    toast('Access restricted: You do not have permission to add resources.', 'error');
    return;
  }
  if (!state.categories.length) {
    const { data } = await api('/categories');
    state.categories = data;
  }

  const form = document.getElementById('quick-worker-form');
  if (!form) return;

  const firstCatId = state.categories[0]?.id || '';

  form.innerHTML = `
    <div class="form-group">
      <label class="form-label" style="font-weight:600">Full Name *</label>
      <input type="text" id="qw-name" class="form-input" placeholder="e.g. Arun Sharma" style="font-size:16px" required>
    </div>

    <div class="form-group">
      <label class="form-label" style="font-weight:600">Contact Phone Number *</label>
      <input type="tel" id="qw-phone" class="form-input" placeholder="e.g. 9876543210" style="font-size:16px" required>
    </div>

    <div class="form-group">
      <label class="form-label" style="font-weight:600">Category / Role (Tap to Select) *</label>
      <input type="hidden" id="qw-category-id" value="${firstCatId}">
      <div class="quick-chip-group" id="qw-cat-chips">
        ${state.categories.map((c, i) => `
          <span class="quick-chip ${i === 0 ? 'selected' : ''}" data-cat-id="${c.id}" onclick="selectQuickCategory(this, ${c.id})">
            ${c.name}
          </span>
        `).join('')}
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">Key Skills (Tap to add)</label>
      <div class="quick-chip-group" id="qw-skill-chips">
        <span class="quick-chip" onclick="toggleQuickSkill(this, 'VIP Protocol')">VIP Protocol</span>
        <span class="quick-chip" onclick="toggleQuickSkill(this, 'Soundboard')">Soundboard</span>
        <span class="quick-chip" onclick="toggleQuickSkill(this, 'Lighting Rig')">Lighting Rig</span>
        <span class="quick-chip" onclick="toggleQuickSkill(this, 'First Aid')">First Aid</span>
        <span class="quick-chip" onclick="toggleQuickSkill(this, 'Heavy Lifting')">Heavy Lifting</span>
        <span class="quick-chip" onclick="toggleQuickSkill(this, 'Crowd Control')">Crowd Control</span>
      </div>
      <input type="hidden" id="qw-skills-val" value="">
    </div>

    <div class="form-group">
      <label class="form-label">Daily Rate (₹ INR optional)</label>
      <input type="number" id="qw-rate" class="form-input" placeholder="e.g. 1500" style="font-size:16px">
    </div>
  `;

  const submitBtn = document.getElementById('quick-worker-submit');
  if (submitBtn) {
    submitBtn.onclick = async () => {
      const name = document.getElementById('qw-name')?.value.trim();
      const contact_info = document.getElementById('qw-phone')?.value.trim();
      const category_id = document.getElementById('qw-category-id')?.value;
      const skills = document.getElementById('qw-skills-val')?.value;
      const daily_rate = document.getElementById('qw-rate')?.value;

      if (!name || !contact_info || !category_id) {
        toast('Name, contact phone, and category are required', 'error');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving…';
      try {
        await api('/resources', 'POST', {
          name,
          contact_info,
          category_id,
          status: 'available',
          skills: skills || '',
          notes: daily_rate ? `Daily Rate: ₹${daily_rate}` : 'Quick mobile registered worker'
        });
        toast('➕ Worker registered to Available Bench!', 'success');
        closeModal('quick-worker-modal');
        if (state.currentPage === 'dashboard') loadDashboard();
        else if (state.currentPage === 'resources') loadResources();
        else loadDashboard();
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '➕ Add to Available Bench';
      }
    };
  }

  showModal('quick-worker-modal');
}

function selectQuickCategory(el, catId) {
  document.querySelectorAll('#qw-cat-chips .quick-chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  const input = document.getElementById('qw-category-id');
  if (input) input.value = catId;
}

function toggleQuickSkill(el, skillName) {
  el.classList.toggle('selected');
  const selected = Array.from(document.querySelectorAll('#qw-skill-chips .quick-chip.selected')).map(c => c.textContent.trim());
  const input = document.getElementById('qw-skills-val');
  if (input) input.value = selected.join(', ');
}

async function openQuickProjectModal() {
  if (!auth.can('edit_projects')) {
    toast('Access restricted: You do not have permission to create projects.', 'error');
    return;
  }
  if (!state.clients.length) {
    const { data } = await api('/clients');
    state.clients = data;
  }

  const form = document.getElementById('quick-project-form');
  if (!form) return;
  const today = new Date().toISOString().split('T')[0];

  form.innerHTML = `
    <div class="form-group">
      <label class="form-label" style="font-weight:600">Event / Project Name *</label>
      <input type="text" id="qp-name" class="form-input" placeholder="e.g. Royal Palace Wedding Reception" style="font-size:16px" required>
    </div>

    <div class="form-group">
      <label class="form-label" style="font-weight:600">Client *</label>
      <select id="qp-client" class="form-input" style="font-size:16px">
        <option value="">-- Choose Client --</option>
        ${state.clients.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
      </select>
    </div>

    <div class="form-group">
      <label class="form-label" style="font-weight:600">Venue / Location</label>
      <input type="text" id="qp-location" class="form-input" placeholder="e.g. Taj Lands End, Mumbai" style="font-size:16px">
    </div>

    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Start Date *</label>
        <input type="date" id="qp-start" class="form-input" value="${today}" style="font-size:16px" required>
      </div>
      <div class="form-group">
        <label class="form-label">End Date *</label>
        <input type="date" id="qp-end" class="form-input" value="${today}" style="font-size:16px" required>
      </div>
    </div>
  `;

  const submitBtn = document.getElementById('quick-project-submit');
  if (submitBtn) {
    submitBtn.onclick = async () => {
      const name = document.getElementById('qp-name')?.value.trim();
      const client_id = document.getElementById('qp-client')?.value;
      const location = document.getElementById('qp-location')?.value.trim();
      const start_date = document.getElementById('qp-start')?.value;
      const end_date = document.getElementById('qp-end')?.value;

      if (!name || !client_id || !start_date || !end_date) {
        toast('Name, client, start date and end date are required', 'error');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating…';
      try {
        await api('/projects', 'POST', {
          name,
          client_id,
          location: location || 'On-Site',
          start_date,
          end_date,
          status: 'planned'
        });
        toast('📋 Event Project created successfully!', 'success');
        closeModal('quick-project-modal');
        if (state.currentPage === 'dashboard') loadDashboard();
        else if (state.currentPage === 'projects') loadProjects();
        else loadDashboard();
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '📋 Create Event Project';
      }
    };
  }

  showModal('quick-project-modal');
}


// ═══════════════════════════════════════════════════════════════
// 2. RESOURCE ALLOCATION HUB (SPEED, VISIBILITY, MINIMAL CLICKS)
// ═══════════════════════════════════════════════════════════════
async function loadResources() {
  const content = $('#page-resources');
  content.innerHTML = loadingHTML();
  try {
    const [{ data: resources }, { data: cats }, { data: managers }, { data: projects }] = await Promise.all([
      api('/resources'),
      api('/dashboard/categories'),
      api('/managers'),
      api('/projects')
    ]);
    state.resources = resources;
    state.categories = cats;
    state.managers = managers;
    state.projects = projects;

    renderResourceOperationsView();
  } catch (err) {
    content.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><p>${err.message}</p></div>`;
    toast(err.message, 'error');
  }
}

function getFilteredResources() {
  const rFilter = state.resourceFilter;
  return state.resources.filter(r => {
    // Status filter
    if (rFilter.status !== 'all') {
      if (rFilter.status === 'deployed') {
        if (r.status !== 'deployed' && r.status !== 'assigned') return false;
      } else if (r.status !== rFilter.status) {
        return false;
      }
    }
    // Category filter (supports multi-select and legacy single)
    if (rFilter.category_ids && rFilter.category_ids.length > 0) {
      if (!rFilter.category_ids.includes(String(r.category_id))) return false;
    } else if (rFilter.category_id && String(r.category_id) !== String(rFilter.category_id)) {
      return false;
    }

    // Manager filter (supports multi-select and legacy single)
    if (rFilter.manager_ids && rFilter.manager_ids.length > 0) {
      if (!rFilter.manager_ids.includes(String(r.reporting_manager_id))) return false;
    } else if (rFilter.manager_id && String(r.reporting_manager_id) !== String(rFilter.manager_id)) {
      return false;
    }

    // Dynamic Filter: Age Range
    if (rFilter.ageRange) {
      const age = r.age ? Number(r.age) : (r.dob ? calculateAge(r.dob) : null);
      if (age == null) return false;
      if (rFilter.ageRange === '18-25') {
        if (age < 18 || age > 25) return false;
      } else if (rFilter.ageRange === '26-35') {
        if (age < 26 || age > 35) return false;
      } else if (rFilter.ageRange === '36-45') {
        if (age < 36 || age > 45) return false;
      } else if (rFilter.ageRange === '46+') {
        if (age < 46) return false;
      }
    }

    // Dynamic Filter: Gender
    if (rFilter.gender) {
      if (!r.gender || r.gender.toLowerCase() !== rFilter.gender.toLowerCase()) return false;
    }

    // Dynamic Filter: Daily Rate Range
    if (rFilter.rateRange) {
      const rate = Number(r.rate_amount) || 0;
      if (rFilter.rateRange === '0-1000' && (rate <= 0 || rate > 1000)) return false;
      if (rFilter.rateRange === '1001-2500' && (rate < 1001 || rate > 2500)) return false;
      if (rFilter.rateRange === '2501+' && rate < 2501) return false;
    }

    // Dynamic Filter: Pune Zone / Area (supports multi-select and single)
    if (rFilter.zones && rFilter.zones.length > 0) {
      if (!r.zone || !rFilter.zones.some(z => r.zone.toLowerCase().includes(z.toLowerCase()))) return false;
    } else if (rFilter.zone) {
      if (!r.zone || !r.zone.toLowerCase().includes(rFilter.zone.toLowerCase())) return false;
    }

    // Dynamic Filter: Availability (supports multi-select and single)
    if (rFilter.availabilities && rFilter.availabilities.length > 0) {
      if (!r.availability || !rFilter.availabilities.some(a => r.availability.toLowerCase().includes(a.toLowerCase()))) return false;
    } else if (rFilter.availability) {
      if (!r.availability || !r.availability.toLowerCase().includes(rFilter.availability.toLowerCase())) return false;
    }

    // Search keyword (matches Name, Contact, Alternate Phone, Email, Staff ID, ID Number, Skills, Opted Roles, Zone, Languages, Experience, Project Name, Location)
    if (rFilter.search) {
      const q = rFilter.search.toLowerCase();
      const matchName = r.name && r.name.toLowerCase().includes(q);
      const matchContact = r.contact_info && r.contact_info.toLowerCase().includes(q);
      const matchAlt = r.alternate_phone && r.alternate_phone.toLowerCase().includes(q);
      const matchEmail = r.email && r.email.toLowerCase().includes(q);
      const matchStaffId = r.staff_id && r.staff_id.toLowerCase().includes(q);
      const matchIdNum = r.id_number && r.id_number.toLowerCase().includes(q);
      const matchSkills = r.skills && r.skills.toLowerCase().includes(q);
      const matchRoles = r.opted_roles && r.opted_roles.toLowerCase().includes(q);
      const matchZone = r.zone && r.zone.toLowerCase().includes(q);
      const matchLang = r.languages && r.languages.toLowerCase().includes(q);
      const matchExp = r.experience && r.experience.toLowerCase().includes(q);
      const matchProj = r.current_project_name && r.current_project_name.toLowerCase().includes(q);
      const matchLoc = r.current_project_location && r.current_project_location.toLowerCase().includes(q);
      if (!matchName && !matchContact && !matchAlt && !matchEmail && !matchStaffId && !matchIdNum && !matchSkills && !matchRoles && !matchZone && !matchLang && !matchExp && !matchProj && !matchLoc) return false;
    }
    return true;
  });
}

function renderResourceOperationsView() {
  const content = $('#page-resources');
  const rFilter = state.resourceFilter;

  // Filter staff in memory with full dynamic filter support
  const filtered = getFilteredResources();

  const total = state.resources.length;
  const availCount = state.resources.filter(r => r.status === 'available').length;
  const deployedCount = state.resources.filter(r => r.status === 'deployed' || r.status === 'assigned').length;
  const nominatedCount = state.resources.filter(r => r.status === 'nominated').length;
  const pendingCount = state.resources.filter(r => r.status === 'pending_approval').length;
  const confirmedCount = state.resources.filter(r => r.status === 'confirmed').length;
  const releasedCount = state.resources.filter(r => r.status === 'released').length;
  const canEditRes = auth.can('edit_resources');

  const allFilteredSelected = filtered.length > 0 && filtered.every(r => state.selectedResourceIds.has(r.id));

  content.innerHTML = `
    <!-- Operations Action Bar: Minimal & Professional Header -->
    <div class="flex justify-between items-center mb-2" style="flex-wrap:wrap;gap:12px">
      <div>
        <h2 style="font-size:1.35rem;font-weight:700;color:var(--text-primary)">
          Resources Directory
        </h2>
        <p class="text-muted text-sm">
          Operational resource pool with real-time availability and single-deployment controls.
        </p>
      </div>
      ${canEditRes ? `
        <div class="resource-add-dropdown-wrap">
          <button class="btn btn-primary" id="btn-add-resource-dropdown" onclick="toggleAddResourceDropdown(event)" style="display:inline-flex;align-items:center;gap:6px">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            <span>Add Resource</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="margin-left:2px"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </button>
          <div class="resource-add-dropdown-menu" id="add-resource-dropdown-menu" style="display:none">
            <button type="button" class="resource-add-menu-item" onclick="openResourceModal(); closeAddResourceDropdown();">
              <span class="add-menu-icon">➕</span>
              <div class="add-menu-text">
                <div class="add-menu-title">Add Manually</div>
                <div class="add-menu-desc">Fill out resource details &amp; credentials</div>
              </div>
            </button>
            <button type="button" class="resource-add-menu-item" onclick="navigate('resource-import'); closeAddResourceDropdown();">
              <span class="add-menu-icon">📥</span>
              <div class="add-menu-text">
                <div class="add-menu-title">Import Excel / CSV</div>
                <div class="add-menu-desc">Bulk upload resources via spreadsheet</div>
              </div>
            </button>
          </div>
        </div>
      ` : ''}
    </div>

    <!-- Availability Filter Pills (Clean & Professional) -->
    <div class="pill-filter-group" style="overflow-x:auto;padding-bottom:4px">
      <span class="filter-pill ${rFilter.status === 'all' ? 'active' : ''}" onclick="setResourceStatusFilter('all')">
        All Resources (${total})
      </span>
      <span class="filter-pill active-success ${rFilter.status === 'available' ? 'active' : ''}" onclick="setResourceStatusFilter('available')">
        Available (${availCount})
      </span>
      <span class="filter-pill ${rFilter.status === 'deployed' ? 'active' : ''}" onclick="setResourceStatusFilter('deployed')">
        Deployed (${deployedCount})
      </span>
      <span class="filter-pill ${rFilter.status === 'nominated' ? 'active' : ''}" onclick="setResourceStatusFilter('nominated')">
        Nominated (${nominatedCount})
      </span>
      <span class="filter-pill active-warning ${rFilter.status === 'pending_approval' ? 'active' : ''}" onclick="setResourceStatusFilter('pending_approval')">
        Pending Approval (${pendingCount})
      </span>
      <span class="filter-pill ${rFilter.status === 'confirmed' ? 'active' : ''}" onclick="setResourceStatusFilter('confirmed')">
        Confirmed (${confirmedCount})
      </span>
      <span class="filter-pill active-success ${rFilter.status === 'released' ? 'active' : ''}" onclick="setResourceStatusFilter('released')">
        Released (${releasedCount})
      </span>
    </div>

    <!-- Search & Attribute Filter Bar -->
    <div class="filter-bar" style="flex-wrap:wrap;gap:8px">
      <div class="search-input-wrap">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="search-icon" style="color:var(--text-muted)"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        <input 
          id="ops-search" 
          type="text" 
          placeholder="Search name, phone, zone, role, languages, experience…" 
          value="${rFilter.search}"
          oninput="handleResourceSearch(this.value)"
        >
      </div>

      <!-- Dynamic Multi-Select Filter: Category -->
      ${rFilter.activeFilters && rFilter.activeFilters.includes('category') ? `
        <div class="dynamic-filter-chip multi-filter-chip" id="filter-chip-category">
          <button type="button" class="filter-chip-toggle" onclick="toggleMultiFilterMenu(event, 'category')">
            <span class="filter-chip-label">🏷️ Category:</span>
            <span class="filter-chip-summary">
              ${(rFilter.category_ids && rFilter.category_ids.length > 0) ? (
                rFilter.category_ids.length === 1 ?
                  ((state.categories.find(c => String(c.id) === String(rFilter.category_ids[0])) || {}).name || '1 Selected') :
                  `${rFilter.category_ids.length} Selected`
              ) : (rFilter.category_id ? ((state.categories.find(c => String(c.id) === String(rFilter.category_id)) || {}).name || '1 Selected') : 'All')}
            </span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </button>
          <div class="multi-filter-menu" id="multi-filter-menu-category" style="display:none">
            <div class="multi-filter-menu-actions">
              <button type="button" onclick="selectAllFilterMulti('category')">Select All</button>
              <button type="button" onclick="clearFilterMulti('category')">Clear</button>
            </div>
            <div class="multi-filter-options-list">
              ${state.categories.map(c => `
                <label class="multi-filter-item">
                  <input type="checkbox" value="${c.id}" ${rFilter.category_ids.includes(String(c.id)) ? 'checked' : ''} onchange="toggleFilterMultiOption('category', '${c.id}')">
                  <span>${escapeHtml(c.name)}</span>
                </label>
              `).join('')}
            </div>
          </div>
          <button type="button" class="filter-chip-remove" onclick="removeResourceDynamicFilter('category')" title="Remove category filter">✕</button>
        </div>
      ` : ''}

      <!-- Dynamic Multi-Select Filter: Manager (Available to all) -->
      ${rFilter.activeFilters && rFilter.activeFilters.includes('manager') ? `
        <div class="dynamic-filter-chip multi-filter-chip" id="filter-chip-manager">
          <button type="button" class="filter-chip-toggle" onclick="toggleMultiFilterMenu(event, 'manager')">
            <span class="filter-chip-label">👔 Manager:</span>
            <span class="filter-chip-summary">
              ${(rFilter.manager_ids && rFilter.manager_ids.length > 0) ? (
                rFilter.manager_ids.length === 1 ?
                  ((state.managers.find(m => String(m.id) === String(rFilter.manager_ids[0])) || {}).name || '1 Selected') :
                  `${rFilter.manager_ids.length} Selected`
              ) : (rFilter.manager_id ? ((state.managers.find(m => String(m.id) === String(rFilter.manager_id)) || {}).name || '1 Selected') : 'All')}
            </span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </button>
          <div class="multi-filter-menu" id="multi-filter-menu-manager" style="display:none">
            <div class="multi-filter-menu-actions">
              <button type="button" onclick="selectAllFilterMulti('manager')">Select All</button>
              <button type="button" onclick="clearFilterMulti('manager')">Clear</button>
            </div>
            <div class="multi-filter-options-list">
              ${state.managers.map(m => `
                <label class="multi-filter-item">
                  <input type="checkbox" value="${m.id}" ${rFilter.manager_ids.includes(String(m.id)) ? 'checked' : ''} onchange="toggleFilterMultiOption('manager', '${m.id}')">
                  <span>${escapeHtml(m.name)}</span>
                </label>
              `).join('')}
            </div>
          </div>
          <button type="button" class="filter-chip-remove" onclick="removeResourceDynamicFilter('manager')" title="Remove manager filter">✕</button>
        </div>
      ` : ''}

      <!-- Dynamic Filter: Age Range -->
      ${rFilter.activeFilters && rFilter.activeFilters.includes('age') ? `
        <div class="dynamic-filter-chip">
          <span class="filter-chip-label">🎂 Age:</span>
          <select onchange="setResourceAgeFilter(this.value)">
            <option value="" ${!rFilter.ageRange ? 'selected' : ''}>All Ages</option>
            <option value="18-25" ${rFilter.ageRange === '18-25' ? 'selected' : ''}>18 - 25 yrs</option>
            <option value="26-35" ${rFilter.ageRange === '26-35' ? 'selected' : ''}>26 - 35 yrs</option>
            <option value="36-45" ${rFilter.ageRange === '36-45' ? 'selected' : ''}>36 - 45 yrs</option>
            <option value="46+" ${rFilter.ageRange === '46+' ? 'selected' : ''}>46+ yrs</option>
          </select>
          <button type="button" class="filter-chip-remove" onclick="removeResourceDynamicFilter('age')" title="Remove age filter">✕</button>
        </div>
      ` : ''}

      <!-- Dynamic Filter: Gender -->
      ${rFilter.activeFilters && rFilter.activeFilters.includes('gender') ? `
        <div class="dynamic-filter-chip">
          <span class="filter-chip-label">👤 Gender:</span>
          <select onchange="setResourceGenderFilter(this.value)">
            <option value="" ${!rFilter.gender ? 'selected' : ''}>All Genders</option>
            <option value="male" ${rFilter.gender === 'male' ? 'selected' : ''}>Male</option>
            <option value="female" ${rFilter.gender === 'female' ? 'selected' : ''}>Female</option>
            <option value="other" ${rFilter.gender === 'other' ? 'selected' : ''}>Other</option>
          </select>
          <button type="button" class="filter-chip-remove" onclick="removeResourceDynamicFilter('gender')" title="Remove gender filter">✕</button>
        </div>
      ` : ''}

      <!-- Dynamic Filter: Daily Rate -->
      ${rFilter.activeFilters && rFilter.activeFilters.includes('rate') ? `
        <div class="dynamic-filter-chip">
          <span class="filter-chip-label">💰 Rate:</span>
          <select onchange="setResourceRateFilter(this.value)">
            <option value="" ${!rFilter.rateRange ? 'selected' : ''}>All Rates</option>
            <option value="0-1000" ${rFilter.rateRange === '0-1000' ? 'selected' : ''}>₹0 - ₹1,000 / day</option>
            <option value="1001-2500" ${rFilter.rateRange === '1001-2500' ? 'selected' : ''}>₹1,001 - ₹2,500 / day</option>
            <option value="2501+" ${rFilter.rateRange === '2501+' ? 'selected' : ''}>₹2,501+ / day</option>
          </select>
          <button type="button" class="filter-chip-remove" onclick="removeResourceDynamicFilter('rate')" title="Remove rate filter">✕</button>
        </div>
      ` : ''}

      <!-- Dynamic Multi-Select Filter: Pune Zone / Area -->
      ${rFilter.activeFilters && rFilter.activeFilters.includes('zone') ? `
        <div class="dynamic-filter-chip multi-filter-chip" id="filter-chip-zone">
          <button type="button" class="filter-chip-toggle" onclick="toggleMultiFilterMenu(event, 'zone')">
            <span class="filter-chip-label">📍 Zone:</span>
            <span class="filter-chip-summary">
              ${(rFilter.zones && rFilter.zones.length > 0) ? (
                rFilter.zones.length === 1 ? rFilter.zones[0].split('/')[0].trim() : `${rFilter.zones.length} Selected`
              ) : (rFilter.zone ? rFilter.zone.split('/')[0].trim() : 'All')}
            </span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </button>
          <div class="multi-filter-menu" id="multi-filter-menu-zone" style="display:none">
            <div class="multi-filter-menu-actions">
              <button type="button" onclick="selectAllFilterMulti('zone')">Select All</button>
              <button type="button" onclick="clearFilterMulti('zone')">Clear</button>
            </div>
            <div class="multi-filter-options-list">
              ${[
                'Pimpri-Chinchwad (PCMC) / Nigdi',
                'Camp / Swargate / Deccan / SB Road',
                'Viman Nagar / Kalyani Nagar / Kharadi',
                'Wakad / Hinjawadi / Baner / Aundh',
                'Other'
              ].map(z => `
                <label class="multi-filter-item">
                  <input type="checkbox" value="${z}" ${rFilter.zones.includes(z) ? 'checked' : ''} onchange="toggleFilterMultiOption('zone', '${escapeHtml(z)}')">
                  <span>${escapeHtml(z)}</span>
                </label>
              `).join('')}
            </div>
          </div>
          <button type="button" class="filter-chip-remove" onclick="removeResourceDynamicFilter('zone')" title="Remove zone filter">✕</button>
        </div>
      ` : ''}

      <!-- Dynamic Multi-Select Filter: Availability -->
      ${rFilter.activeFilters && rFilter.activeFilters.includes('availability') ? `
        <div class="dynamic-filter-chip multi-filter-chip" id="filter-chip-availability">
          <button type="button" class="filter-chip-toggle" onclick="toggleMultiFilterMenu(event, 'availability')">
            <span class="filter-chip-label">🗓️ Availability:</span>
            <span class="filter-chip-summary">
              ${(rFilter.availabilities && rFilter.availabilities.length > 0) ? (
                rFilter.availabilities.length === 1 ? rFilter.availabilities[0] : `${rFilter.availabilities.length} Selected`
              ) : (rFilter.availability || 'All')}
            </span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </button>
          <div class="multi-filter-menu" id="multi-filter-menu-availability" style="display:none">
            <div class="multi-filter-menu-actions">
              <button type="button" onclick="selectAllFilterMulti('availability')">Select All</button>
              <button type="button" onclick="clearFilterMulti('availability')">Clear</button>
            </div>
            <div class="multi-filter-options-list">
              ${[
                'Weekdays + Weekends',
                'Always available on weekends (Fri–Sun)',
                'Available on select weekends (advance notice needed)',
                'College student (flexible based on exam calendar)',
                'Weekdays only'
              ].map(a => `
                <label class="multi-filter-item">
                  <input type="checkbox" value="${a}" ${rFilter.availabilities.includes(a) ? 'checked' : ''} onchange="toggleFilterMultiOption('availability', '${escapeHtml(a)}')">
                  <span>${escapeHtml(a)}</span>
                </label>
              `).join('')}
            </div>
          </div>
          <button type="button" class="filter-chip-remove" onclick="removeResourceDynamicFilter('availability')" title="Remove availability filter">✕</button>
        </div>
      ` : ''}

      <!-- Dynamic "＋ Add Filter" Button & Popover -->
      <div style="position:relative;display:inline-block;z-index:90">
        <button 
          type="button" 
          class="btn btn-sm btn-secondary" 
          id="btn-add-filter" 
          onclick="toggleAddFilterMenu(event)"
          style="display:inline-flex;align-items:center;gap:5px;font-weight:600;font-size:0.82rem;padding:6px 12px"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          Add Filter
        </button>
        <div class="filter-menu-popover" id="add-filter-popover" style="display:none">
          <div class="filter-menu-header">Add Filter Criteria</div>
          ${!rFilter.activeFilters || !rFilter.activeFilters.includes('manager') ? `
            <button type="button" class="filter-menu-item" onclick="addResourceDynamicFilter('manager')">
              <span>👔</span> <span>Manager</span>
            </button>` : ''}
          ${!rFilter.activeFilters || !rFilter.activeFilters.includes('category') ? `
            <button type="button" class="filter-menu-item" onclick="addResourceDynamicFilter('category')">
              <span>🏷️</span> <span>Category</span>
            </button>` : ''}
          ${!rFilter.activeFilters || !rFilter.activeFilters.includes('zone') ? `
            <button type="button" class="filter-menu-item" onclick="addResourceDynamicFilter('zone')">
              <span>📍</span> <span>Pune Zone / Area</span>
            </button>` : ''}
          ${!rFilter.activeFilters || !rFilter.activeFilters.includes('availability') ? `
            <button type="button" class="filter-menu-item" onclick="addResourceDynamicFilter('availability')">
              <span>🗓️</span> <span>Weekend Availability</span>
            </button>` : ''}
          ${!rFilter.activeFilters || !rFilter.activeFilters.includes('age') ? `
            <button type="button" class="filter-menu-item" onclick="addResourceDynamicFilter('age')">
              <span>🎂</span> <span>Age Range</span>
            </button>` : ''}
          ${!rFilter.activeFilters || !rFilter.activeFilters.includes('gender') ? `
            <button type="button" class="filter-menu-item" onclick="addResourceDynamicFilter('gender')">
              <span>👤</span> <span>Gender</span>
            </button>` : ''}
          ${!rFilter.activeFilters || !rFilter.activeFilters.includes('rate') ? `
            <button type="button" class="filter-menu-item" onclick="addResourceDynamicFilter('rate')">
              <span>💰</span> <span>Daily Rate</span>
            </button>` : ''}
          ${(rFilter.activeFilters && rFilter.activeFilters.length >= 7) ? `<div style="padding:8px 10px;font-size:0.78rem;color:var(--text-muted)">All filters added</div>` : ''}
        </div>
      </div>

      <!-- View Mode Switcher -->
      <div class="flex gap-1" style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:3px;margin-left:auto">
        <button 
          class="btn btn-sm ${rFilter.viewMode === 'list' ? 'btn-secondary' : ''}" 
          style="${rFilter.viewMode === 'list' ? 'background:var(--accent-light);color:var(--accent);font-weight:600' : 'border:none;background:none;color:var(--text-muted)'}"
          onclick="setResourceViewMode('list')" 
          title="Streamlined Rows"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;vertical-align:middle"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>Rows
        </button>
        <button 
          class="btn btn-sm ${rFilter.viewMode === 'grid' ? 'btn-secondary' : ''}" 
          style="${rFilter.viewMode === 'grid' ? 'background:var(--accent-light);color:var(--accent);font-weight:600' : 'border:none;background:none;color:var(--text-muted)'}"
          onclick="setResourceViewMode('grid')" 
          title="Cards Grid"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;vertical-align:middle"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>Cards
        </button>
      </div>

      ${(rFilter.status !== 'all' || rFilter.category_id || rFilter.manager_id || rFilter.search || rFilter.zone || rFilter.availability || (rFilter.activeFilters && rFilter.activeFilters.length > 0)) ? `
        <button class="btn btn-sm btn-secondary" onclick="resetResourceFilters()" title="Reset Filters">✕ Clear</button>
      ` : ''}
    </div>

    <!-- Active Filter Summary & Bulk Selection Counter -->
    <div class="flex justify-between items-center mb-2" style="flex-wrap:wrap;gap:8px">
      <div class="flex items-center gap-2">
        <label style="display:inline-flex;align-items:center;gap:6px;font-size:0.82rem;font-weight:600;cursor:pointer;user-select:none;color:var(--text-secondary)">
          <input type="checkbox" class="resource-select-cb" id="select-all-filtered-cb" 
            ${allFilteredSelected ? 'checked' : ''} 
            onchange="toggleSelectAllFilteredResources(this.checked)">
          Select All (${filtered.length})
        </label>
        <span class="text-sm text-muted">
          Showing <strong>${filtered.length}</strong> of ${total} resources
          ${rFilter.status !== 'all' ? `· Status: <strong style="text-transform:capitalize">${rFilter.status}</strong>` : ''}
          ${rFilter.zone ? `· Zone: <strong>${escapeHtml(rFilter.zone)}</strong>` : ''}
          ${rFilter.availability ? `· Availability: <strong>${escapeHtml(rFilter.availability)}</strong>` : ''}
          ${rFilter.category_id ? `· Category: <strong>${(state.categories.find(c => String(c.id) === String(rFilter.category_id)) || {}).name || ''}</strong>` : ''}
          ${rFilter.manager_id ? `· Manager: <strong>${(state.managers.find(m => String(m.id) === String(rFilter.manager_id)) || {}).name || ''}</strong>` : ''}
          ${rFilter.ageRange ? `· Age: <strong>${rFilter.ageRange} yrs</strong>` : ''}
          ${rFilter.gender ? `· Gender: <strong>${rFilter.gender}</strong>` : ''}
          ${rFilter.rateRange ? `· Rate: <strong>₹${rFilter.rateRange}</strong>` : ''}
        </span>
      </div>
      ${state.selectedResourceIds.size > 0 ? `
        <div class="text-sm font-semibold" style="color:var(--accent)">
          ${state.selectedResourceIds.size} resource${state.selectedResourceIds.size > 1 ? 's' : ''} selected
        </div>
      ` : ''}
    </div>

    <!-- Operations List (Minimal & Professional UI) -->
    <div id="ops-container">
      ${filtered.length ? (
        rFilter.viewMode === 'list' ? renderOpsRowList(filtered) : renderOpsCardGrid(filtered)
      ) : `
        <div class="card" style="padding:48px 24px;text-align:center">
          ${emptyState('No resources matching your current filters.')}
          <div style="margin-top:12px">
            <button class="btn btn-sm btn-secondary" onclick="resetResourceFilters()">Reset All Filters</button>
          </div>
        </div>
      `}
    </div>

    <!-- Floating AMOLED Bulk Action Bar (when resources are selected) -->
    ${state.selectedResourceIds.size > 0 ? `
      <div id="bulk-action-bar" class="bulk-action-bar">
        <span class="bulk-count-badge">${state.selectedResourceIds.size}</span>
        <span style="font-weight:600;font-size:0.88rem;color:var(--text-primary)">
          ${state.selectedResourceIds.size} resources selected
        </span>
        <div class="bulk-actions-wrap" id="bulk-actions-wrap">
          <button class="btn btn-sm btn-primary" id="bulk-actions-btn" onclick="toggleBulkActionsMenu(event)" style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;box-shadow:0 2px 8px rgba(99,102,241,0.4)">
            <span>⚡</span> Bulk Actions ▾
          </button>
          <div class="bulk-actions-menu" id="bulk-actions-menu">
            ${auth.can('edit_assignments') ? `
              <button type="button" class="bulk-action-item" onclick="openBulkAssignModal(); closeBulkActionsMenu();">
                <span>⚡</span> Bulk Deploy to Project
              </button>
            ` : ''}
            ${auth.can('edit_resources') ? `
              <button type="button" class="bulk-action-item danger" onclick="bulkDeleteSelectedResources(); closeBulkActionsMenu();">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                <span>Delete Selected (${state.selectedResourceIds.size})</span>
              </button>
            ` : ''}
          </div>
        </div>
        <button class="btn btn-sm btn-secondary" onclick="clearResourceSelection()" style="padding:6px 10px">
          ✕ Clear
        </button>
      </div>
    ` : ''}
  `;
}

// Helper to parse comma/parenthesis separated opted roles
function formatCrewOptedRoles(rolesStr) {
  if (!rolesStr) return [];
  return rolesStr.split(/\),\s*|\,(?![^\(]*\))/g).map(s => {
    let clean = s.trim().replace(/\)$/, '');
    if (clean.includes('(')) clean = clean.split('(')[0].trim();
    return clean;
  }).filter(Boolean);
}

// ─── Minimal & Professional Resource Rows (List Mode) ─────────
function renderOpsRowList(workers) {
  return `
    <div class="res-list">
      ${workers.map(r => {
        const initials = getInitials(r.name);
        const isAvail = r.status === 'available' || r.status === 'released';
        const isDeployed = r.status === 'deployed' || r.status === 'assigned';
        const statusLabel = isAvail ? 'Available' : isDeployed ? `Deployed @ ${r.current_project_name || 'Project'}` : r.status.replace(/_/g, ' ');
        const effectiveAge = r.age ? Number(r.age) : (r.dob ? calculateAge(r.dob) : null);
        const cleanPhone = (r.contact_info || '').replace(/[^0-9]/g, '').slice(-10);
        const optedList = formatCrewOptedRoles(r.opted_roles);

        const canEditRes = auth.can('edit_resources');
        const canDeploy = auth.can('edit_assignments');
        const isSelected = state.selectedResourceIds.has(r.id);

        return `
          <div class="res-row ${isSelected ? 'selected-resource' : ''}" id="res-row-${r.id}" onclick="handleOpsRowClick(event, ${r.id})">
            <!-- Select Checkbox -->
            <div class="res-checkbox-wrap" onclick="event.stopPropagation()">
              <input type="checkbox" class="resource-select-cb" ${isSelected ? 'checked' : ''} onchange="toggleResourceSelection(${r.id}, event)" title="Select ${escapeHtml(r.name)}">
            </div>

            <!-- Col 1: Avatar + Name + (Age · Gender) [No Staff ID] -->
            <div class="res-profile-wrap">
              <div class="res-avatar-wrap">
                <div class="res-avatar" style="overflow:hidden">
                  ${r.photo_path ? `<img src="${escapeHtml(r.photo_path)}" alt="${escapeHtml(r.name)}" style="width:100%;height:100%;object-fit:cover" onerror="this.onerror=null;this.parentElement.textContent='${initials}'">` : initials}
                </div>
                <span class="res-status-dot ${r.status}" title="${escapeHtml(statusLabel)}"></span>
              </div>
              <div class="res-identity">
                <div class="flex items-center gap-1.5" style="min-width:0">
                  <span class="res-name" title="${escapeHtml(r.name)}">${escapeHtml(r.name)}</span>
                </div>
                <div class="res-subtext">
                  ${effectiveAge ? `<span>${effectiveAge} yrs</span>` : ''}
                  ${effectiveAge && r.gender ? `<span>·</span>` : ''}
                  ${r.gender ? `<span style="text-transform:capitalize">${escapeHtml(r.gender)}</span>` : ''}
                  ${r.height && r.height.toLowerCase() !== 'na' ? `<span>· 📏 ${escapeHtml(r.height)}</span>` : ''}
                </div>
              </div>
            </div>

            <!-- Col 2: Category & Opted Roles -->
            <div class="res-col-roles">
              <span class="res-cat-badge">${escapeHtml(r.category_name || 'Staff')}</span>
              ${optedList.length ? `
                <div class="res-opted-pills" style="margin-top:4px">
                  ${optedList.slice(0, 2).map(role => `<span class="res-opted-pill" title="${escapeHtml(role)}">${escapeHtml(role)}</span>`).join('')}
                  ${optedList.length > 2 ? `<span class="res-opted-pill more" title="${escapeHtml(optedList.slice(2).join(', '))}">+${optedList.length - 2}</span>` : ''}
                </div>
              ` : (r.skills ? `<div class="text-xs text-muted text-truncate" style="max-width:180px;margin-top:2px">${escapeHtml(r.skills)}</div>` : '')}
            </div>

            <!-- Col 3: Primary Phone ONLY (No area, no alternate phone) -->
            <div class="res-col-contact">
              ${r.contact_info ? `
                <a class="res-phone-link" href="https://wa.me/91${cleanPhone}" target="_blank" onclick="event.stopPropagation()" title="Chat on WhatsApp">
                  <span style="color:#10b981;font-weight:700">📱</span> ${escapeHtml(r.contact_info)}
                </a>
              ` : '—'}
            </div>

            <!-- Col 4: Manager Name in Lead view / Clean Zone in Manager view (No languages!) -->
            <div class="res-col-manager">
              ${auth.isLead() ? `
                <div class="res-mgr-tag" title="Manager: ${escapeHtml(r.manager_name || 'Unassigned Pool')}">
                  <span style="font-size:0.75rem">👔</span>
                  <span class="res-mgr-name">${escapeHtml(r.manager_name || 'Unassigned')}</span>
                </div>
              ` : `
                <div class="res-zone-tag-sub text-xs text-muted" title="Zone">
                  📍 ${escapeHtml(r.zone || 'Pune')}
                </div>
              `}
            </div>

            <!-- Col 5: Status / Deployment (NO Available text tag, only dot!) -->
            <div class="res-col-status">
              ${r.status !== 'available' ? badge(r.status || 'available') : ''}
              ${r.current_project_name ? `<div class="res-proj-tag" title="${escapeHtml(r.current_project_name)}">@ ${escapeHtml(r.current_project_name)}</div>` : ''}
            </div>

            <!-- Col 6: 3-Dots Action Menu -->
            <div class="res-action-wrap" onclick="event.stopPropagation()">
              <div class="user-action-menu-wrap">
                <button type="button" class="user-action-trigger-btn" onclick="toggleResourceActionMenu(event, ${r.id})" aria-label="Resource actions" title="Actions">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="12" r="2"></circle>
                    <circle cx="12" cy="5" r="2"></circle>
                    <circle cx="12" cy="19" r="2"></circle>
                  </svg>
                </button>
                <div class="user-action-dropdown" id="res-menu-${r.id}">
                  <button type="button" class="user-dropdown-item" onclick="viewResource(${r.id})">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                    <span>View Details</span>
                  </button>
                  ${canEditRes ? `
                    <button type="button" class="user-dropdown-item" onclick="openResourceModal(${r.id})">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                      <span>Edit Resource</span>
                    </button>
                  ` : ''}
                  ${canDeploy ? (
                    isAvail ? `
                      <button type="button" class="user-dropdown-item" onclick="openAssignModal(${r.id})">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        <span>Assign to Project</span>
                      </button>
                    ` : isDeployed ? `
                      <button type="button" class="user-dropdown-item" onclick="openReassignModal(${r.id})">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                        <span>Reassign Project</span>
                      </button>
                      <button type="button" class="user-dropdown-item danger" onclick="quickReleaseWorker(${r.id}, '${escapeHtml(r.name)}', '${escapeHtml(r.current_project_name)}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                        <span>Release to Bench</span>
                      </button>
                    ` : ''
                  ) : ''}
                  ${r.contact_info ? `
                    <div class="user-dropdown-divider"></div>
                    <a class="user-dropdown-item" href="tel:${escapeHtml(r.contact_info)}" style="text-decoration:none">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                      <span>Call WhatsApp (${escapeHtml(r.contact_info)})</span>
                    </a>
                  ` : ''}
                  ${r.alternate_phone ? `
                    <a class="user-dropdown-item" href="tel:${escapeHtml(r.alternate_phone)}" style="text-decoration:none">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                      <span>Call Emergency (${escapeHtml(r.alternate_phone)})</span>
                    </a>
                  ` : ''}
                  ${canEditRes ? `
                    <div class="user-dropdown-divider"></div>
                    <button type="button" class="user-dropdown-item danger" onclick="deleteResourceConfirm(${r.id}, '${escapeHtml(r.name)}')">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                      <span>Delete Resource</span>
                    </button>
                  ` : ''}
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ─── Minimal & Professional Resource Cards (Grid View) ─────────
function renderOpsCardGrid(workers) {
  return `
    <div class="res-grid">
      ${workers.map(r => {
        const initials = getInitials(r.name);
        const isAvail = r.status === 'available' || r.status === 'released';
        const isDeployed = r.status === 'deployed' || r.status === 'assigned';
        const statusLabel = isAvail ? 'Available' : isDeployed ? `Deployed @ ${r.current_project_name || 'Project'}` : r.status.replace(/_/g, ' ');
        const effectiveAge = r.age ? Number(r.age) : (r.dob ? calculateAge(r.dob) : null);
        const cleanPhone = (r.contact_info || '').replace(/[^0-9]/g, '').slice(-10);
        const optedList = formatCrewOptedRoles(r.opted_roles);

        const canEditRes = auth.can('edit_resources');
        const canDeploy = auth.can('edit_assignments');
        const isSelected = state.selectedResourceIds.has(r.id);

        return `
          <div class="res-card ${isSelected ? 'selected-resource' : ''}" id="res-card-${r.id}" onclick="handleOpsRowClick(event, ${r.id})">
            <!-- Top: Checkbox, Avatar, Name & Staff ID, 3-dots Menu -->
            <div class="flex justify-between items-start" style="gap:10px">
              <div style="display:flex;align-items:flex-start;gap:10px;min-width:0;flex:1">
                <div onclick="event.stopPropagation()" style="display:flex;align-items:center;padding-top:4px">
                  <input type="checkbox" class="resource-select-cb" ${isSelected ? 'checked' : ''} onchange="toggleResourceSelection(${r.id}, event)" title="Select ${escapeHtml(r.name)}">
                </div>
                <div class="res-profile-wrap" style="flex:1;min-width:0">
                  <div class="res-avatar-wrap">
                    <div class="res-avatar" style="overflow:hidden">
                      ${r.photo_path ? `<img src="${escapeHtml(r.photo_path)}" alt="${escapeHtml(r.name)}" style="width:100%;height:100%;object-fit:cover" onerror="this.onerror=null;this.parentElement.textContent='${initials}'">` : initials}
                    </div>
                    <span class="res-status-dot ${r.status}" title="${escapeHtml(statusLabel)}"></span>
                  </div>
                  <div class="res-identity" style="flex:1;min-width:0">
                    <div class="res-name" title="${escapeHtml(r.name)}">${escapeHtml(r.name)}</div>
                    <div class="flex items-center gap-1.5" style="margin-top:2px;flex-wrap:wrap">
                      ${r.staff_id ? `<span class="res-staff-badge">${escapeHtml(r.staff_id)}</span>` : ''}
                      <span class="text-xs text-muted" style="font-weight:500">
                        ${effectiveAge ? `${effectiveAge} yrs` : ''}
                        ${effectiveAge && r.gender ? '·' : ''}
                        ${r.gender ? `<span style="text-transform:capitalize">${escapeHtml(r.gender)}</span>` : ''}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 3-Dots Action Menu -->
              <div class="res-action-wrap" onclick="event.stopPropagation()">
                <div class="user-action-menu-wrap">
                  <button type="button" class="user-action-trigger-btn" onclick="toggleResourceActionMenu(event, ${r.id})" aria-label="Resource actions" title="Actions">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="12" r="2"></circle>
                      <circle cx="12" cy="5" r="2"></circle>
                      <circle cx="12" cy="19" r="2"></circle>
                    </svg>
                  </button>
                  <div class="user-action-dropdown" id="res-card-menu-${r.id}">
                    <button type="button" class="user-dropdown-item" onclick="viewResource(${r.id})">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                      <span>View Details</span>
                    </button>
                    ${canEditRes ? `
                      <button type="button" class="user-dropdown-item" onclick="openResourceModal(${r.id})">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        <span>Edit Resource</span>
                      </button>
                    ` : ''}
                    ${canDeploy ? (
                      isAvail ? `
                        <button type="button" class="user-dropdown-item" onclick="openAssignModal(${r.id})">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                          <span>Assign to Project</span>
                        </button>
                      ` : isDeployed ? `
                        <button type="button" class="user-dropdown-item" onclick="openReassignModal(${r.id})">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                          <span>Reassign Project</span>
                        </button>
                        <button type="button" class="user-dropdown-item danger" onclick="quickReleaseWorker(${r.id}, '${escapeHtml(r.name)}', '${escapeHtml(r.current_project_name)}')">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                          <span>Release to Bench</span>
                        </button>
                      ` : ''
                    ) : ''}
                    ${r.contact_info ? `
                      <div class="user-dropdown-divider"></div>
                      <a class="user-dropdown-item" href="tel:${escapeHtml(r.contact_info)}" style="text-decoration:none">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                        <span>Call WhatsApp (${escapeHtml(r.contact_info)})</span>
                      </a>
                    ` : ''}
                    ${r.alternate_phone ? `
                      <a class="user-dropdown-item" href="tel:${escapeHtml(r.alternate_phone)}" style="text-decoration:none">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                        <span>Call Emergency (${escapeHtml(r.alternate_phone)})</span>
                      </a>
                    ` : ''}
                    ${canEditRes ? `
                      <div class="user-dropdown-divider"></div>
                      <button type="button" class="user-dropdown-item danger" onclick="deleteResourceConfirm(${r.id}, '${escapeHtml(r.name)}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        <span>Delete Resource</span>
                      </button>
                    ` : ''}
                  </div>
                </div>
              </div>
            </div>

            <!-- Role Badge & Status Row (No Available text tag, only dot!) -->
            <div class="flex items-center justify-between gap-2" style="margin-top:2px;flex-wrap:wrap">
              <span class="res-cat-badge">${escapeHtml(r.category_name || 'Staff')}</span>
              ${r.status !== 'available' ? badge(r.status || 'available') : ''}
            </div>

            <!-- Opted Roles Pills -->
            ${optedList.length ? `
              <div class="res-opted-roles-box">
                <div class="res-opted-roles-title">PREFERRED ROLES:</div>
                <div class="res-opted-pills">
                  ${optedList.slice(0, 3).map(role => `<span class="res-opted-pill" title="${escapeHtml(role)}">${escapeHtml(role)}</span>`).join('')}
                  ${optedList.length > 3 ? `<span class="res-opted-pill more" title="${escapeHtml(optedList.slice(3).join(', '))}">+${optedList.length - 3}</span>` : ''}
                </div>
              </div>
            ` : (r.skills ? `
              <div class="res-opted-roles-box">
                <div class="res-opted-roles-title">SKILLS:</div>
                <div class="text-xs text-muted text-truncate">${escapeHtml(r.skills)}</div>
              </div>
            ` : '')}

            <!-- Key Attributes Grid -->
            <div class="res-card-attrs-grid">
              <div class="res-card-attr-item">
                <span class="res-card-attr-label">Zone</span>
                <span class="res-card-attr-val" title="${escapeHtml(r.zone || 'Pune')}">📍 ${escapeHtml(r.zone || 'Pune')}</span>
              </div>
              <div class="res-card-attr-item">
                <span class="res-card-attr-label">Height</span>
                <span class="res-card-attr-val">📏 ${escapeHtml(r.height && r.height.toLowerCase() !== 'na' ? r.height : '—')}</span>
              </div>
              ${auth.isLead() ? `
                <div class="res-card-attr-item" style="grid-column: span 2">
                  <span class="res-card-attr-label">Manager</span>
                  <span class="res-card-attr-val" style="font-weight:600;color:var(--text-primary)" title="Manager: ${escapeHtml(r.manager_name || 'Unassigned')}">👔 ${escapeHtml(r.manager_name || 'Unassigned')}</span>
                </div>
              ` : ''}
              <div class="res-card-attr-item" style="grid-column: span 2">
                <span class="res-card-attr-label">Availability</span>
                <span class="res-card-attr-val" title="${escapeHtml(r.availability || 'Flexible')}">🗓️ ${escapeHtml(r.availability || 'On notice')}</span>
              </div>
            </div>

            <!-- Direct Contact Bar (WhatsApp + Emergency) -->
            <div class="res-card-contacts-bar">
              ${r.contact_info ? `
                <a class="res-card-contact-btn wa" href="https://wa.me/91${cleanPhone}" target="_blank" onclick="event.stopPropagation()" title="Chat on WhatsApp">
                  <span>💬</span> <span>${escapeHtml(r.contact_info)}</span>
                </a>
              ` : ''}
              ${r.alternate_phone ? `
                <a class="res-card-contact-btn alt" href="tel:${escapeHtml(r.alternate_phone)}" onclick="event.stopPropagation()" title="Emergency Contact Number">
                  <span>🆘</span> <span>${escapeHtml(r.alternate_phone)}</span>
                </a>
              ` : ''}
            </div>

            <!-- Past Experience Snippet -->
            ${r.experience ? `
              <div class="res-card-exp-snippet" title="${escapeHtml(r.experience)}">
                <span class="exp-icon">💼</span>
                <span class="exp-text">${escapeHtml(r.experience.length > 90 ? r.experience.slice(0, 90) + '…' : r.experience)}</span>
              </div>
            ` : ''}

            <!-- Card Bottom: View Details & Quick Assign Button -->
            <div class="res-card-footer">
              <button type="button" class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); viewResource(${r.id})" style="flex:1">
                View Dossier
              </button>
              ${canDeploy && isAvail ? `
                <button type="button" class="btn btn-sm btn-primary" onclick="event.stopPropagation(); openAssignModal(${r.id})" style="flex:1">
                  Deploy ⚡
                </button>
              ` : (isDeployed ? `
                <span class="text-xs text-muted text-truncate" style="flex:1;text-align:right" title="${escapeHtml(r.current_project_name)}">
                  @ ${escapeHtml(r.current_project_name)}
                </span>
              ` : '')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function handleOpsRowClick(event, resourceId) {
  // If clicked directly on the row/card (not inside an interactive button, dropdown, or checkbox)
  if (event.target.closest('.user-action-menu-wrap') || event.target.closest('.resource-select-cb')) return;
  viewResource(resourceId);
}

function closeAllActionMenus() {
  document.querySelectorAll('.user-action-dropdown').forEach(m => {
    m.classList.remove('show');
    m.style.top = '';
    m.style.bottom = '';
  });
  document.querySelectorAll('.user-action-trigger-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.menu-open').forEach(el => el.classList.remove('menu-open'));
}

function toggleResourceActionMenu(event, resourceId) {
  event.stopPropagation();
  const triggerBtn = event.currentTarget;
  const targetMenu = document.getElementById(`res-menu-${resourceId}`) || document.getElementById(`res-card-menu-${resourceId}`);
  const parentRow  = triggerBtn.closest('.res-row') || triggerBtn.closest('.res-card') || triggerBtn.closest('tr');
  const parentWrap = triggerBtn.closest('.user-action-menu-wrap');
  const parentCard = triggerBtn.closest('.card');
  const wasOpen    = targetMenu && targetMenu.classList.contains('show');

  closeAllActionMenus();

  if (targetMenu && !wasOpen) {
    targetMenu.classList.add('show');
    triggerBtn.classList.add('active');
    if (parentRow) parentRow.classList.add('menu-open');
    if (parentWrap) parentWrap.classList.add('menu-open');
    if (parentCard) parentCard.classList.add('menu-open');

    // Flip check based on button position so menu never clips or drops off screen
    const btnRect = triggerBtn.getBoundingClientRect();
    const spaceBelow = window.innerHeight - btnRect.bottom;
    const spaceAbove = btnRect.top;

    if (spaceBelow < 260 && spaceAbove > spaceBelow) {
      targetMenu.style.top = 'auto';
      targetMenu.style.bottom = 'calc(100% + 4px)';
    } else {
      targetMenu.style.top = 'calc(100% + 4px)';
      targetMenu.style.bottom = 'auto';
    }
  }
}

async function deleteResourceConfirm(resourceId, resourceName) {
  if (!auth.can('edit_resources')) {
    toast('Access restricted: You do not have permission to delete resources.', 'error');
    return;
  }
  if (!confirm(`Are you sure you want to permanently delete "${resourceName}"? This cannot be undone.`)) return;
  try {
    await api(`/resources/${resourceId}`, 'DELETE');
    toast(`Resource "${resourceName}" removed successfully.`, 'success');
    state.selectedResourceIds.delete(resourceId);
    loadResources();
  } catch (err) {
    toast(err.message || 'Failed to delete resource.', 'error');
  }
}

function toggleBulkActionsMenu(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('bulk-actions-menu');
  if (menu) menu.classList.toggle('active');
}

function closeBulkActionsMenu() {
  const menu = document.getElementById('bulk-actions-menu');
  if (menu) menu.classList.remove('active');
}

async function bulkDeleteSelectedResources() {
  if (!auth.can('edit_resources')) {
    toast('Access restricted: You do not have permission to delete resources.', 'error');
    return;
  }
  const count = state.selectedResourceIds.size;
  if (!count) {
    toast('No resources selected for deletion.', 'info');
    return;
  }
  if (!confirm(`Are you sure you want to permanently delete these ${count} selected resources? This cannot be undone.`)) {
    return;
  }
  try {
    const ids = Array.from(state.selectedResourceIds);
    const res = await api('/resources/bulk-delete', 'POST', { ids });
    toast(res.message || `Successfully removed ${count} resources.`, 'success');
    state.selectedResourceIds.clear();
    loadResources();
  } catch (err) {
    toast(err.message || 'Failed to delete selected resources.', 'error');
  }
}

function setResourceStatusFilter(status) {
  state.resourceFilter.status = status;
  renderResourceOperationsView();
}

function setResourceCategoryFilter(catId) {
  state.resourceFilter.category_id = catId;
  if (catId && (!state.resourceFilter.activeFilters || !state.resourceFilter.activeFilters.includes('category'))) {
    if (!state.resourceFilter.activeFilters) state.resourceFilter.activeFilters = [];
    state.resourceFilter.activeFilters.push('category');
  }
  renderResourceOperationsView();
}

function setResourceManagerFilter(mgrId) {
  state.resourceFilter.manager_id = mgrId;
  if (mgrId && (!state.resourceFilter.activeFilters || !state.resourceFilter.activeFilters.includes('manager'))) {
    if (!state.resourceFilter.activeFilters) state.resourceFilter.activeFilters = [];
    state.resourceFilter.activeFilters.push('manager');
  }
  renderResourceOperationsView();
}

function setResourceViewMode(mode) {
  state.resourceFilter.viewMode = mode;
  renderResourceOperationsView();
}

let searchDebounceTimer = null;
function handleResourceSearch(val) {
  state.resourceFilter.search = val;
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    renderResourceOperationsView();
    // Maintain focus on search input
    const input = $('#ops-search');
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }, 200);
}

function resetResourceFilters() {
  state.resourceFilter.status = 'all';
  state.resourceFilter.category_id = '';
  state.resourceFilter.category_ids = [];
  state.resourceFilter.manager_id = '';
  state.resourceFilter.manager_ids = [];
  state.resourceFilter.search = '';
  state.resourceFilter.activeFilters = [];
  state.resourceFilter.ageRange = '';
  state.resourceFilter.gender = '';
  state.resourceFilter.rateRange = '';
  state.resourceFilter.zone = '';
  state.resourceFilter.zones = [];
  state.resourceFilter.availability = '';
  state.resourceFilter.availabilities = [];
  state.selectedResourceIds.clear();
  renderResourceOperationsView();
}

// ─── Add Resource Dropdown Handlers ───────────────────────────
function toggleAddResourceDropdown(event) {
  if (event) event.stopPropagation();
  const menu = $('#add-resource-dropdown-menu');
  if (!menu) return;
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

function closeAddResourceDropdown() {
  const menu = $('#add-resource-dropdown-menu');
  if (menu) menu.style.display = 'none';
}

// ─── Dynamic Filter Handlers ──────────────────────────────────
function toggleAddFilterMenu(event) {
  if (event) event.stopPropagation();
  const popover = $('#add-filter-popover');
  if (!popover) return;
  const isShown = popover.style.display !== 'none';
  $$('.multi-filter-menu').forEach(m => m.style.display = 'none');
  popover.style.display = isShown ? 'none' : 'block';
}

function toggleMultiFilterMenu(event, type) {
  if (event) event.stopPropagation();
  const menu = $(`#multi-filter-menu-${type}`);
  if (!menu) return;
  const isShown = menu.style.display !== 'none';
  $$('.multi-filter-menu').forEach(m => m.style.display = 'none');
  const addPop = $('#add-filter-popover');
  if (addPop) addPop.style.display = 'none';
  menu.style.display = isShown ? 'none' : 'block';
}

function toggleFilterMultiOption(type, val) {
  const filterKey = type === 'manager' ? 'manager_ids' :
                    type === 'category' ? 'category_ids' :
                    type === 'zone' ? 'zones' : 'availabilities';
  if (!Array.isArray(state.resourceFilter[filterKey])) {
    state.resourceFilter[filterKey] = [];
  }
  const arr = state.resourceFilter[filterKey];
  const strVal = String(val);
  const idx = arr.indexOf(strVal);
  if (idx > -1) {
    arr.splice(idx, 1);
  } else {
    arr.push(strVal);
  }
  renderResourceOperationsView();
  // Keep the menu open for continuous multi-selection
  const menu = $(`#multi-filter-menu-${type}`);
  if (menu) menu.style.display = 'block';
}

function selectAllFilterMulti(type) {
  if (type === 'manager') {
    state.resourceFilter.manager_ids = state.managers.map(m => String(m.id));
  } else if (type === 'category') {
    state.resourceFilter.category_ids = state.categories.map(c => String(c.id));
  } else if (type === 'zone') {
    state.resourceFilter.zones = [
      'Pimpri-Chinchwad (PCMC) / Nigdi',
      'Camp / Swargate / Deccan / SB Road',
      'Viman Nagar / Kalyani Nagar / Kharadi',
      'Wakad / Hinjawadi / Baner / Aundh',
      'Other'
    ];
  } else if (type === 'availability') {
    state.resourceFilter.availabilities = [
      'Weekdays + Weekends',
      'Always available on weekends (Fri–Sun)',
      'Available on select weekends (advance notice needed)',
      'College student (flexible based on exam calendar)',
      'Weekdays only'
    ];
  }
  renderResourceOperationsView();
  const menu = $(`#multi-filter-menu-${type}`);
  if (menu) menu.style.display = 'block';
}

function clearFilterMulti(type) {
  const filterKey = type === 'manager' ? 'manager_ids' :
                    type === 'category' ? 'category_ids' :
                    type === 'zone' ? 'zones' : 'availabilities';
  state.resourceFilter[filterKey] = [];
  renderResourceOperationsView();
  const menu = $(`#multi-filter-menu-${type}`);
  if (menu) menu.style.display = 'block';
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('#btn-add-resource-dropdown') && !e.target.closest('#add-resource-dropdown-menu')) {
    closeAddResourceDropdown();
  }
  if (!e.target.closest('#btn-add-filter') && !e.target.closest('#add-filter-popover')) {
    const pop = $('#add-filter-popover');
    if (pop) pop.style.display = 'none';
  }
  if (!e.target.closest('.multi-filter-chip')) {
    $$('.multi-filter-menu').forEach(m => m.style.display = 'none');
  }
});

function addResourceDynamicFilter(filterKey) {
  if (!state.resourceFilter.activeFilters) state.resourceFilter.activeFilters = [];
  if (!state.resourceFilter.activeFilters.includes(filterKey)) {
    state.resourceFilter.activeFilters.push(filterKey);
  }
  const pop = $('#add-filter-popover');
  if (pop) pop.style.display = 'none';
  renderResourceOperationsView();
}

function removeResourceDynamicFilter(filterKey) {
  if (!state.resourceFilter.activeFilters) return;
  state.resourceFilter.activeFilters = state.resourceFilter.activeFilters.filter(k => k !== filterKey);
  if (filterKey === 'category') { state.resourceFilter.category_id = ''; state.resourceFilter.category_ids = []; }
  if (filterKey === 'manager') { state.resourceFilter.manager_id = ''; state.resourceFilter.manager_ids = []; }
  if (filterKey === 'age') state.resourceFilter.ageRange = '';
  if (filterKey === 'gender') state.resourceFilter.gender = '';
  if (filterKey === 'rate') state.resourceFilter.rateRange = '';
  if (filterKey === 'zone') { state.resourceFilter.zone = ''; state.resourceFilter.zones = []; }
  if (filterKey === 'availability') { state.resourceFilter.availability = ''; state.resourceFilter.availabilities = []; }
  renderResourceOperationsView();
}

function setResourceAgeFilter(val) {
  state.resourceFilter.ageRange = val;
  renderResourceOperationsView();
}

function setResourceGenderFilter(val) {
  state.resourceFilter.gender = val;
  renderResourceOperationsView();
}

function setResourceRateFilter(val) {
  state.resourceFilter.rateRange = val;
  renderResourceOperationsView();
}

// ─── Resource Multi-Selection Handlers ────────────────────────
function toggleResourceSelection(id, event) {
  if (event) event.stopPropagation();
  const numId = Number(id);
  if (state.selectedResourceIds.has(numId)) {
    state.selectedResourceIds.delete(numId);
  } else {
    state.selectedResourceIds.add(numId);
  }
  renderResourceOperationsView();
}

function toggleSelectAllFilteredResources(selectAll) {
  const filtered = getFilteredResources();
  if (selectAll) {
    filtered.forEach(r => state.selectedResourceIds.add(Number(r.id)));
  } else {
    filtered.forEach(r => state.selectedResourceIds.delete(Number(r.id)));
  }
  renderResourceOperationsView();
}

function clearResourceSelection() {
  state.selectedResourceIds.clear();
  renderResourceOperationsView();
}

// ─── Bulk Deploy to Project Modal ──────────────────────────────
async function openBulkAssignModal() {
  if (!auth.can('edit_assignments')) {
    toast('Access restricted: You do not have permission to deploy resources.', 'error');
    return;
  }
  const selectedWorkers = state.resources.filter(r => state.selectedResourceIds.has(Number(r.id)));
  if (!selectedWorkers.length) {
    toast('No resources selected for bulk deployment.', 'warning');
    return;
  }

  // Ensure active projects are loaded
  if (!state.projects.length) {
    const { data: projects } = await api('/projects?status=active');
    state.projects = projects || [];
  }

  const activeProjects = state.projects.filter(p => ['active', 'planned'].includes(p.status));

  const titleEl = $('#bulk-assign-title');
  if (titleEl) titleEl.textContent = `⚡ Bulk Deploy (${selectedWorkers.length}) Resources`;

  $('#bulk-assign-form').innerHTML = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <span style="font-size:0.85rem;font-weight:600;color:var(--text-primary)">
          Selected Resources (${selectedWorkers.length}):
        </span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;max-height:130px;overflow-y:auto;padding-right:4px">
        ${selectedWorkers.map(w => `
          <span style="display:inline-flex;align-items:center;gap:6px;padding:4px 8px;background:var(--bg-hover);border:1px solid var(--border);border-radius:6px;font-size:0.78rem">
            <span style="width:8px;height:8px;border-radius:50%;background:${w.status === 'available' ? 'var(--success)' : 'var(--warning)'}"></span>
            <strong>${escapeHtml(w.name)}</strong>
            <span style="color:var(--text-muted)">(${escapeHtml(w.category_name || 'Resource')})</span>
          </span>
        `).join('')}
      </div>
    </div>

    <div class="form-group">
      <label>Target Project Deployment *</label>
      <select id="bulk-assign-project">
        <option value="">-- Choose Target Project --</option>
        ${activeProjects.map(p => `
          <option value="${p.id}">
            ${p.name} (📍 ${p.location || 'On-Site'}) · ${p.status.toUpperCase()}
          </option>
        `).join('')}
      </select>
    </div>

    <div class="form-group">
      <label>Deployment Note / Batch Tag</label>
      <input type="text" id="bulk-assign-notes" placeholder="e.g. VIP Event Squad A">
    </div>
  `;

  $('#bulk-assign-save').onclick = submitBulkAssignment;
  showModal('bulk-assign-modal');
}

async function submitBulkAssignment() {
  const project_id = $('#bulk-assign-project')?.value;
  const notes = $('#bulk-assign-notes')?.value;
  const resource_ids = Array.from(state.selectedResourceIds);

  if (!project_id) {
    toast('Please select a target project', 'error');
    return;
  }
  if (!resource_ids.length) {
    toast('No resources selected', 'error');
    return;
  }

  const btn = $('#bulk-assign-save');
  btn.disabled = true;
  btn.textContent = 'Deploying resources…';

  try {
    const res = await api('/assignments/bulk-assign', 'POST', {
      project_id,
      resource_ids,
      assigned_by: auth.user?.manager_id || null,
      notes: notes || null
    });

    toast(res.message || `Successfully deployed ${res.assigned_count} resources`, 'success');
    closeModal('bulk-assign-modal');
    state.selectedResourceIds.clear();
    loadResources();
  } catch (err) {
    toast(err.message || 'Failed to bulk deploy resources', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '⚡ Confirm Bulk Deployment';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// ═══════════════════════════════════════════════════════════════
// 3. REAL-TIME ALLOCATION, REASSIGNMENT & DOUBLE-BOOKING SHIELD
// ═══════════════════════════════════════════════════════════════

// Direct 1-Click Release Action
async function quickReleaseWorker(resourceId, workerName, projectName) {
  if (!auth.can('edit_assignments')) {
    toast('Access restricted: You do not have permission to release resources.', 'error');
    return;
  }
  if (!confirm(`Release ${workerName} from "${projectName}"?\nThey will immediately become Available on the bench.`)) {
    return;
  }
  try {
    await api('/assignments/release', 'POST', { resource_id: resourceId });
    toast(`${workerName} has been released and is now Available`, 'success');
    // Refresh current view
    if (state.currentPage === 'resources') loadResources();
    else if (state.currentPage === 'dashboard') loadDashboard();
    else if (state.currentPage === 'assignments') loadAssignments();
    else if (state.currentPage === 'projects') loadProjects();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// Open Fast Quick-Assign Modal
async function openAssignModal(preselectedResourceId = null, preselectedProjectId = null) {
  if (!auth.can('edit_assignments')) {
    toast('Access restricted: You do not have permission to deploy resources.', 'error');
    return;
  }
  // Ensure we have active projects and resources loaded
  if (!state.projects.length || !state.resources.length) {
    const [{ data: resources }, { data: projects }, { data: managers }] = await Promise.all([
      api('/resources'),
      api('/projects?status=active'),
      api('/managers')
    ]);
    state.resources = resources;
    state.projects = projects;
    state.managers = managers;
  }

  const activeProjects = state.projects.filter(p => ['active', 'planned'].includes(p.status));
  const preselectedWorker = preselectedResourceId
    ? state.resources.find(r => String(r.id) === String(preselectedResourceId))
    : null;

  // Update modal title dynamically
  const titleEl = $('#assign-modal .modal-title');
  if (titleEl) {
    titleEl.innerHTML = preselectedWorker 
      ? `⚡ Deploy <strong>${escapeHtml(preselectedWorker.name)}</strong> to Project` 
      : 'Assign Resource to Project';
  }

  $('#assign-form').innerHTML = `
    <!-- Real-Time Availability & Double-Booking Shield -->
    <div id="assign-validation-banner" class="validation-box ok" style="display:none"></div>

    ${preselectedWorker ? `
      <!-- Single Dedicated Worker Display (No Dropdown) -->
      <input type="hidden" id="assign-resource" value="${preselectedWorker.id}">
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:16px;display:flex;align-items:center;gap:12px">
        <div style="width:42px;height:42px;border-radius:50%;background:var(--accent-glow);color:var(--accent);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1.1rem;overflow:hidden;flex-shrink:0">
          ${preselectedWorker.photo_path ? `<img src="${escapeHtml(preselectedWorker.photo_path)}" style="width:100%;height:100%;object-fit:cover" onerror="this.onerror=null;this.parentElement.textContent='${getInitials(preselectedWorker.name)}'">` : getInitials(preselectedWorker.name)}
        </div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px">
            <strong style="color:var(--text);font-size:0.95rem">${escapeHtml(preselectedWorker.name)}</strong>
            ${badge(preselectedWorker.status)}
          </div>
          <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px">
            <span>ID: <strong>${escapeHtml(preselectedWorker.staff_id || ('#RES-' + preselectedWorker.id))}</strong></span> · 
            <span>Role: <strong>${escapeHtml(preselectedWorker.category_name || 'Resource')}</strong></span>
            ${preselectedWorker.current_project_name ? ` · <span style="color:var(--warning)">Current: ${escapeHtml(preselectedWorker.current_project_name)}</span>` : ''}
          </div>
        </div>
      </div>
    ` : `
      <!-- General Selection Dropdown (Only when opened with no worker preselected) -->
      <div class="form-group">
        <label>Select Resource</label>
        <select id="assign-resource" onchange="validateAssignmentWorker(this.value)">
          <option value="">-- Choose Resource --</option>
          ${state.resources.map(r => {
            const statusIcon = r.status === 'available' ? '🟢' : r.status === 'assigned' ? '🟣' : '🟠';
            const deployTag = r.current_project_name ? ` (Deployed @ ${r.current_project_name})` : '';
            return `<option value="${r.id}">
              ${statusIcon} ${r.name} — ${r.category_name || 'Resource'}${deployTag}
            </option>`;
          }).join('')}
        </select>
      </div>
    `}

    <div class="form-group">
      <label>Target Project Deployment *</label>
      <select id="assign-project" onchange="validateAssignmentProject(this.value)">
        <option value="">-- Choose Project --</option>
        ${activeProjects.map(p => `
          <option value="${p.id}" ${preselectedProjectId && String(p.id) === String(preselectedProjectId) ? 'selected' : ''}>
            ${p.name} (📍 ${p.location || 'On-Site'}) · ${p.status.toUpperCase()}
          </option>
        `).join('')}
      </select>
    </div>

    <div id="project-req-feedback" style="display:none;margin-bottom:16px;padding:10px 14px;background:var(--bg-hover);border:1px solid var(--border);border-radius:8px;font-size:0.84rem"></div>

    <div class="form-row">
      <div class="form-group">
        <label>Deploying Manager</label>
        <select id="assign-by">
          <option value="">Select Manager</option>
          ${state.managers.map(m => `<option value="${m.id}">${m.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Deployment Role / Note</label>
        <input type="text" id="assign-notes" placeholder="e.g. VIP Gate Entry, Lead Guard">
      </div>
    </div>
  `;

  // Trigger initial validation if worker preselected
  const selectedResId = preselectedResourceId || $('#assign-resource')?.value;
  if (selectedResId) validateAssignmentWorker(selectedResId);

  // Trigger project check if project preselected
  const selectedProjId = preselectedProjectId || $('#assign-project')?.value;
  if (selectedProjId) validateAssignmentProject(selectedProjId);

  $('#assign-save').onclick = submitAssignment;
  showModal('assign-modal');
}

function validateAssignmentWorker(resourceId) {
  const banner = $('#assign-validation-banner');
  if (!resourceId) {
    banner.style.display = 'none';
    return;
  }
  const worker = state.resources.find(r => String(r.id) === String(resourceId));
  if (!worker) return;

  banner.style.display = 'flex';
  if (worker.status === 'available' || worker.status === 'released') {
    banner.className = 'validation-box ok';
    banner.innerHTML = `<span>✅</span><span><strong>${worker.name}</strong> is available and ready for deployment.</span>`;
  } else if (worker.status === 'deployed' || worker.status === 'assigned') {
    banner.className = 'validation-box warning';
    banner.innerHTML = `
      <span>⚠️</span>
      <div>
        <strong>Single Active Assignment Rule:</strong> ${worker.name} is currently deployed to <strong>"${worker.current_project_name}"</strong>.<br>
        Deploying to a new project will seamlessly transfer and close the existing assignment.
      </div>
    `;
  } else {
    banner.className = 'validation-box danger';
    banner.innerHTML = `<span>⛔</span><span><strong>${worker.name}</strong> is marked as <strong>${worker.status.replace(/_/g, ' ')}</strong>. Cannot deploy.</span>`;
  }
}

async function validateAssignmentProject(projectId) {
  const feedback = $('#project-req-feedback');
  if (!projectId) {
    feedback.style.display = 'none';
    return;
  }
  const workerId = $('#assign-resource')?.value;
  const worker = state.resources.find(r => String(r.id) === String(workerId));

  try {
    const { data: p } = await api(`/projects/${projectId}`);
    feedback.style.display = 'block';
    if (worker && worker.category_id) {
      const req = p.requirements.find(r => String(r.category_id) === String(worker.category_id));
      if (req) {
        const gap = req.gap;
        feedback.innerHTML = `
          📋 <strong>Requirement Check:</strong> Project requires <strong>${req.required} ${worker.category_name}</strong>. 
          Currently staffed: <strong>${req.assigned}</strong>. 
          ${gap > 0 ? `<span style="color:var(--danger);font-weight:600">(${gap} open position${gap > 1 ? 's' : ''} remaining)</span>` : '<span style="color:var(--success);font-weight:600">(Requirement already fully met)</span>'}
        `;
      } else {
        feedback.innerHTML = `📋 <em>Note: This project does not have a registered requirement for ${worker.category_name}.</em>`;
      }
    } else {
      feedback.innerHTML = `📍 <strong>${p.name}</strong> · Location: ${p.location || 'On-Site'} · Total Staffed: ${p.assigned.length}`;
    }
  } catch (err) {
    feedback.style.display = 'none';
  }
}

async function submitAssignment() {
  const resource_id = $('#assign-resource')?.value;
  const project_id = $('#assign-project')?.value;
  const assigned_by = $('#assign-by')?.value;
  const notes = $('#assign-notes')?.value;

  if (!resource_id || !project_id) {
    toast('Please select both a worker and a project', 'error');
    return;
  }

  const worker = state.resources.find(r => String(r.id) === String(resource_id));
  const isAlreadyDeployed = worker && (worker.status === 'deployed' || worker.status === 'assigned');

  const btn = $('#assign-save');
  btn.disabled = true;
  btn.textContent = isAlreadyDeployed ? 'Transferring…' : 'Allocating…';

  try {
    const endpoint = isAlreadyDeployed ? '/assignments/reassign' : '/assignments/assign';
    const payload = isAlreadyDeployed
      ? { resource_id, new_project_id: project_id, assigned_by: assigned_by || null, notes: notes || null }
      : { resource_id, project_id, assigned_by: assigned_by || null, notes: notes || null };

    const res = await api(endpoint, 'POST', payload);
    toast(res.message, 'success');
    closeModal('assign-modal');
    // Refresh current view
    if (state.currentPage === 'resources') loadResources();
    else if (state.currentPage === 'dashboard') loadDashboard();
    else if (state.currentPage === 'assignments') loadAssignments();
    else if (state.currentPage === 'projects') loadProjects();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '⚡ Confirm Assignment';
  }
}

// ─── Reassign Modal (Fast Atomic Project Transfer) ─────────────
async function openReassignModal(resourceId) {
  if (!auth.can('edit_assignments')) {
    toast('Access restricted: You do not have permission to reassign resources.', 'error');
    return;
  }
  const worker = state.resources.find(r => String(r.id) === String(resourceId));
  if (!worker) return;

  const activeProjects = state.projects.filter(p => ['active', 'planned'].includes(p.status) && p.name !== worker.current_project_name);

  $('#reassign-form').innerHTML = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:16px">
      <div style="font-size:0.75rem;text-transform:uppercase;color:var(--text-muted);font-weight:600">Resource</div>
      <div style="font-size:1.05rem;font-weight:700;color:var(--text-primary);margin-top:2px">
        ${worker.name} <span class="badge" style="background:var(--accent-light);color:var(--accent)">${worker.category_name}</span>
      </div>
      <div style="font-size:0.85rem;color:var(--text-secondary);margin-top:6px">
        Currently deployed at: <strong style="color:var(--accent)">${worker.current_project_name || 'Unassigned'}</strong>
        ${worker.current_project_location ? `(📍 ${worker.current_project_location})` : ''}
      </div>
    </div>

    <div class="validation-box ok">
      <span>🔄</span>
      <span>
        Reassigning will automatically release <strong>${worker.name}</strong> from <em>"${worker.current_project_name}"</em> and deploy them to the target project in one atomic action.
      </span>
    </div>

    <div class="form-group">
      <label>Target Project (Move To)</label>
      <select id="reassign-target-project">
        <option value="">-- Select Target Project --</option>
        ${activeProjects.map(p => `
          <option value="${p.id}">${p.name} (📍 ${p.location || 'Site'}) · ${p.status.toUpperCase()}</option>
        `).join('')}
      </select>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Approving Manager</label>
        <select id="reassign-by">
          <option value="">Select Manager</option>
          ${state.managers.map(m => `<option value="${m.id}">${m.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Reassignment Note</label>
        <input type="text" id="reassign-notes" placeholder="e.g. Urgent VIP coverage requirement">
      </div>
    </div>
  `;

  $('#reassign-save').onclick = async () => {
    const to_project_id = $('#reassign-target-project').value;
    const assigned_by = $('#reassign-by').value;
    const notes = $('#reassign-notes').value;

    if (!to_project_id) {
      toast('Please choose target project to reassign to', 'error');
      return;
    }

    const btn = $('#reassign-save');
    btn.disabled = true;
    btn.textContent = 'Transferring…';

    try {
      const res = await api('/assignments/reassign', 'POST', {
        resource_id: worker.id,
        to_project_id,
        assigned_by: assigned_by || null,
        notes: notes || null
      });
      toast(res.message, 'success');
      closeModal('reassign-modal');
      if (state.currentPage === 'resources') loadResources();
      else if (state.currentPage === 'dashboard') loadDashboard();
      else if (state.currentPage === 'assignments') loadAssignments();
      else if (state.currentPage === 'projects') loadProjects();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '🔄 Transfer Deployment';
    }
  };

  showModal('reassign-modal');
}

// ═══════════════════════════════════════════════════════════════
// 4. PROJECTS OPERATIONS (DEPLOYMENT PROGRESS & GAP FULFILLMENT)
// ═══════════════════════════════════════════════════════════════
async function loadProjects() {
  const content = $('#page-projects');
  content.innerHTML = loadingHTML();
  try {
    const [{ data: projects }, { data: clients }, { data: managers }] = await Promise.all([
      api('/projects'),
      api('/clients'),
      api('/managers')
    ]);
    state.projects = projects;
    state.clients = clients;
    state.managers = managers;

    renderProjectsView();
  } catch (err) {
    content.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><p>${err.message}</p></div>`;
    toast(err.message, 'error');
  }
}

function renderProjectsView() {
  const content = $('#page-projects');
  if (!content) return;

  const projects = state.projects || [];
  const pFilter = state.projectFilter;

  // Filter projects by status and search
  const filtered = projects.filter(p => {
    if (pFilter.status !== 'all' && p.status !== pFilter.status) return false;
    if (pFilter.search) {
      const q = pFilter.search.toLowerCase();
      const matchName = (p.name || '').toLowerCase().includes(q);
      const matchLoc  = (p.location || '').toLowerCase().includes(q);
      const matchClient = (p.client_name || '').toLowerCase().includes(q);
      const matchMgr = (p.manager_name || '').toLowerCase().includes(q);
      if (!matchName && !matchLoc && !matchClient && !matchMgr) return false;
    }
    return true;
  });

  const allCount = projects.length;
  const activeCount = projects.filter(p => p.status === 'active').length;
  const plannedCount = projects.filter(p => p.status === 'planned').length;
  const compCount = projects.filter(p => p.status === 'completed').length;
  const canEditProj = auth.can('edit_projects');

  content.innerHTML = `
    <!-- Topbar & Action Header -->
    <div class="flex justify-between items-center mb-3" style="flex-wrap:wrap;gap:12px">
      <div>
        <h2 style="font-size:1.35rem;font-weight:700;color:var(--text-primary)">
          Project Deployments
        </h2>
        <p class="text-muted text-sm">Site resource requirements, schedules, and active resource delivery.</p>
      </div>
      ${canEditProj ? `
        <button class="btn btn-primary" onclick="openProjectModal()">
          <span>+ Add Project</span>
        </button>
      ` : ''}
    </div>

    <!-- Minimal Filter & Search Toolbar -->
    <div class="card mb-3" style="padding:12px 16px">
      <div class="flex justify-between items-center gap-3" style="flex-wrap:wrap">
        <!-- Status Filter Pills -->
        <div class="flex gap-2 items-center" style="flex-wrap:wrap">
          <button class="filter-pill ${pFilter.status === 'all' ? 'active' : ''}" onclick="setProjectStatusFilter('all')">
            All <span class="pill-count">${allCount}</span>
          </button>
          <button class="filter-pill ${pFilter.status === 'active' ? 'active' : ''}" onclick="setProjectStatusFilter('active')">
            Active <span class="pill-count">${activeCount}</span>
          </button>
          <button class="filter-pill ${pFilter.status === 'planned' ? 'active' : ''}" onclick="setProjectStatusFilter('planned')">
            Planned <span class="pill-count">${plannedCount}</span>
          </button>
          <button class="filter-pill ${pFilter.status === 'completed' ? 'active' : ''}" onclick="setProjectStatusFilter('completed')">
            Completed <span class="pill-count">${compCount}</span>
          </button>
        </div>

        <!-- Search & View Mode Switcher -->
        <div class="flex items-center gap-3" style="flex:1;justify-content:flex-end;min-width:240px">
          <div class="search-input-wrap" style="position:relative;flex:1;max-width:320px">
            <input 
              type="text" 
              class="form-control" 
              style="padding:7px 12px 7px 32px;font-size:0.84rem;height:34px" 
              placeholder="Search projects, client, site..."
              value="${escapeHtml(pFilter.search)}"
              oninput="handleProjectSearch(this.value)"
            >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="position:absolute;left:10px;top:10px;color:var(--text-muted)">
              <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </div>

          <!-- View Mode Toggle -->
          <div class="view-mode-toggle" style="display:flex;background:var(--bg-hover);border-radius:8px;padding:2px;border:1px solid var(--border)">
            <button 
              type="button" 
              class="view-toggle-btn ${pFilter.viewMode === 'list' ? 'active' : ''}" 
              onclick="setProjectViewMode('list')" 
              title="Minimal List View"
              style="padding:5px 9px;border:none;background:${pFilter.viewMode === 'list' ? 'var(--bg-surface)' : 'transparent'};color:${pFilter.viewMode === 'list' ? 'var(--text-primary)' : 'var(--text-muted)'};border-radius:6px;cursor:pointer;display:flex;align-items:center"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
            </button>
            <button 
              type="button" 
              class="view-toggle-btn ${pFilter.viewMode === 'grid' ? 'active' : ''}" 
              onclick="setProjectViewMode('grid')" 
              title="Card Grid View"
              style="padding:5px 9px;border:none;background:${pFilter.viewMode === 'grid' ? 'var(--bg-surface)' : 'transparent'};color:${pFilter.viewMode === 'grid' ? 'var(--text-primary)' : 'var(--text-muted)'};border-radius:6px;cursor:pointer;display:flex;align-items:center"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Projects Container -->
    <div id="projects-container">
      ${filtered.length ? (
        pFilter.viewMode === 'list' ? renderProjectRowList(filtered) : renderProjectCardGrid(filtered)
      ) : `
        <div class="card" style="padding:48px 24px;text-align:center">
          ${emptyState('No projects matching your current filters.')}
          <div style="margin-top:12px">
            <button class="btn btn-sm btn-secondary" onclick="resetProjectFilters()">Reset All Filters</button>
          </div>
        </div>
      `}
    </div>
  `;
}

function renderProjectRowList(projects) {
  return `
    <div class="prj-list">
      ${projects.map(p => {
        const isComp = p.status === 'completed';
        const isActive = p.status === 'active';
        const canDeploy = auth.can('edit_assignments');
        const canEditProj = auth.can('edit_projects');

        return `
          <div class="prj-row" id="prj-row-${p.id}" onclick="handleProjectRowClick(event, ${p.id})">
            <!-- Project Identity -->
            <div class="prj-identity">
              <div class="prj-name-wrap">
                <span class="prj-name">${escapeHtml(p.name)}</span>
                ${badge(p.status)}
              </div>
              <div class="prj-client">${escapeHtml(p.client_name || 'Client Account')}</div>
            </div>

            <!-- Location -->
            <div class="prj-loc-wrap">
              <div class="prj-location">${escapeHtml(p.location || 'Site Location TBD')}</div>
            </div>

            <!-- Schedule -->
            <div class="prj-schedule">
              <div class="prj-dates">${formatDate(p.start_date)} → ${formatDate(p.end_date)}</div>
              <div class="prj-duration">${p.start_date && p.end_date ? calculateDurationDays(p.start_date, p.end_date) : 'Schedule set'}</div>
            </div>

            <!-- Staffing Allocation Meter -->
            <div class="prj-staffing-meter">
              <div class="prj-staff-text">
                <span>Resources</span>
                <span style="color:var(--accent);font-variant-numeric:tabular-nums">${p.total_assigned || 0} Deployed</span>
              </div>
              ${progressBar(p.total_assigned || 0, Math.max(p.total_assigned || 0, 1))}
            </div>

            <!-- 3-Dots Action Menu -->
            <div class="res-action-wrap" onclick="event.stopPropagation()">
              <div class="user-action-menu-wrap">
                <button type="button" class="user-action-trigger-btn" onclick="toggleProjectActionMenu(event, ${p.id})" aria-label="Project actions" title="Actions">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="12" r="2"></circle>
                    <circle cx="12" cy="5" r="2"></circle>
                    <circle cx="12" cy="19" r="2"></circle>
                  </svg>
                </button>
                <div class="user-action-dropdown" id="prj-menu-${p.id}">
                  <button type="button" class="user-dropdown-item" onclick="viewProject(${p.id})">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                    <span>View Team & Details</span>
                  </button>
                  <button type="button" class="user-dropdown-item" onclick="exportProjectPDF(${p.id})">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                    <span>Export PDF Report</span>
                  </button>
                  ${canDeploy ? `
                    <button type="button" class="user-dropdown-item" onclick="openAssignModal(null, ${p.id})">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                      <span>Allocate Resources</span>
                    </button>
                  ` : ''}
                  ${canEditProj ? `
                    <button type="button" class="user-dropdown-item" onclick="openProjectModal(${p.id})">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                      <span>Edit Project</span>
                    </button>
                    <div class="user-dropdown-divider"></div>
                    ${isActive ? `
                      <button type="button" class="user-dropdown-item success" onclick="updateProjectStatus(${p.id}, 'completed')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        <span>Mark as Completed</span>
                      </button>
                    ` : isComp ? `
                      <button type="button" class="user-dropdown-item" onclick="updateProjectStatus(${p.id}, 'active')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>
                        <span>Reopen to Active</span>
                      </button>
                    ` : `
                      <button type="button" class="user-dropdown-item success" onclick="updateProjectStatus(${p.id}, 'active')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                        <span>Set to In Progress</span>
                      </button>
                    `}
                    <div class="user-dropdown-divider"></div>
                    <button type="button" class="user-dropdown-item danger" onclick="deleteProjectConfirm(${p.id}, '${escapeHtml(p.name)}')">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                      <span>Delete Project</span>
                    </button>
                  ` : ''}
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderProjectCardGrid(projects) {
  return `
    <div class="prj-grid">
      ${projects.map(p => {
        const isComp = p.status === 'completed';
        const isActive = p.status === 'active';
        const canDeploy = auth.can('edit_assignments');
        const canEditProj = auth.can('edit_projects');

        return `
          <div class="prj-card" id="prj-card-${p.id}" onclick="handleProjectRowClick(event, ${p.id})">
            <div>
              <div class="flex justify-between items-start gap-2 mb-2">
                <div style="min-width:0">
                  <div class="prj-name">${escapeHtml(p.name)}</div>
                  <div class="prj-client">${escapeHtml(p.client_name || 'Client Account')}</div>
                </div>
                <div class="flex items-center gap-2">
                  ${badge(p.status)}
                  <div class="res-action-wrap" onclick="event.stopPropagation()">
                    <div class="user-action-menu-wrap">
                      <button type="button" class="user-action-trigger-btn" onclick="toggleProjectActionMenu(event, ${p.id})" aria-label="Project actions" title="Actions">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <circle cx="12" cy="12" r="2"></circle>
                          <circle cx="12" cy="5" r="2"></circle>
                          <circle cx="12" cy="19" r="2"></circle>
                        </svg>
                      </button>
                      <div class="user-action-dropdown" id="prj-card-menu-${p.id}">
                        <button type="button" class="user-dropdown-item" onclick="viewProject(${p.id})">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                          <span>View Team & Details</span>
                        </button>
                        <button type="button" class="user-dropdown-item" onclick="exportProjectPDF(${p.id})">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                          <span>Export PDF Report</span>
                        </button>
                        ${canDeploy ? `
                          <button type="button" class="user-dropdown-item" onclick="openAssignModal(null, ${p.id})">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            <span>Allocate Resources</span>
                          </button>
                        ` : ''}
                        ${canEditProj ? `
                          <button type="button" class="user-dropdown-item" onclick="openProjectModal(${p.id})">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            <span>Edit Project</span>
                          </button>
                          <div class="user-dropdown-divider"></div>
                          <button type="button" class="user-dropdown-item danger" onclick="deleteProjectConfirm(${p.id}, '${escapeHtml(p.name)}')">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            <span>Delete Project</span>
                          </button>
                        ` : ''}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="flex flex-col gap-1 text-sm text-secondary mb-3">
                <div class="flex items-center gap-2">
                  <span class="text-muted text-xs">SITE:</span>
                  <span class="font-medium text-xs">${escapeHtml(p.location || 'Location TBD')}</span>
                </div>
              </div>
            </div>

            <div class="prj-staffing-meter">
              <div class="prj-staff-text">
                <span class="text-muted text-xs">Resources Deployed</span>
                <span class="text-xs" style="color:var(--accent)">${p.total_assigned || 0} On-Site</span>
              </div>
              ${progressBar(p.total_assigned || 0, Math.max(p.total_assigned || 0, 1))}
            </div>

            <div class="flex justify-between items-center" style="border-top:1px solid var(--border-subtle);padding-top:10px;font-size:0.76rem;color:var(--text-muted)">
              <span>${formatDate(p.start_date)} → ${formatDate(p.end_date)}</span>
              <span style="color:var(--accent);font-weight:600">View Team →</span>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function handleProjectRowClick(event, projectId) {
  if (event.target.closest('.user-action-menu-wrap') || event.target.closest('.res-action-wrap')) return;
  viewProject(projectId);
}

function setProjectStatusFilter(status) {
  state.projectFilter.status = status;
  renderProjectsView();
}

function setProjectViewMode(mode) {
  state.projectFilter.viewMode = mode;
  renderProjectsView();
}

function handleProjectSearch(val) {
  state.projectFilter.search = val;
  renderProjectsView();
}

function resetProjectFilters() {
  state.projectFilter.status = 'all';
  state.projectFilter.search = '';
  renderProjectsView();
}

function calculateDurationDays(start, end) {
  try {
    const s = new Date(start);
    const e = new Date(end);
    const diff = Math.ceil((e - s) / (1000 * 60 * 60 * 24));
    if (diff > 1) return `${diff} days duration`;
    if (diff === 1) return `1 day event`;
    return '1 day event';
  } catch {
    return 'Schedule set';
  }
}

function toggleProjectActionMenu(event, projectId) {
  event.stopPropagation();
  const triggerBtn = event.currentTarget;
  const targetMenu = document.getElementById(`prj-menu-${projectId}`) || document.getElementById(`prj-card-menu-${projectId}`);
  const parentRow  = triggerBtn.closest('.prj-row') || triggerBtn.closest('.prj-card') || triggerBtn.closest('tr');
  const parentWrap = triggerBtn.closest('.user-action-menu-wrap');
  const parentCard = triggerBtn.closest('.card');
  const wasOpen    = targetMenu && targetMenu.classList.contains('show');

  closeAllActionMenus();

  if (targetMenu && !wasOpen) {
    targetMenu.classList.add('show');
    triggerBtn.classList.add('active');
    if (parentRow) parentRow.classList.add('menu-open');
    if (parentWrap) parentWrap.classList.add('menu-open');
    if (parentCard) parentCard.classList.add('menu-open');

    const btnRect = triggerBtn.getBoundingClientRect();
    const spaceBelow = window.innerHeight - btnRect.bottom;
    const spaceAbove = btnRect.top;

    if (spaceBelow < 260 && spaceAbove > spaceBelow) {
      targetMenu.style.top = 'auto';
      targetMenu.style.bottom = 'calc(100% + 4px)';
    } else {
      targetMenu.style.top = 'calc(100% + 4px)';
      targetMenu.style.bottom = 'auto';
    }
  }
}

async function updateProjectStatus(projectId, newStatus) {
  if (!auth.can('edit_projects')) {
    toast('Access restricted. You do not have permission to update project status.', 'error');
    return;
  }
  try {
    const { data: p } = await api(`/projects/${projectId}`);
    await api(`/projects/${projectId}`, 'PUT', {
      name: p.name,
      client_id: p.client_id,
      location: p.location,
      start_date: p.start_date ? p.start_date.split('T')[0] : null,
      end_date: p.end_date ? p.end_date.split('T')[0] : null,
      status: newStatus,
      project_manager_id: p.project_manager_id,
      notes: p.notes,
      requirements: (p.requirements || []).map(r => ({ category_id: r.category_id, quantity_required: r.required }))
    });
    toast(`Project marked as ${newStatus.replace('_', ' ')}.`, 'success');
    loadProjects();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function deleteProjectConfirm(projectId, projectName) {
  if (!auth.can('edit_projects')) {
    toast('Access restricted. You do not have permission to delete projects.', 'error');
    return;
  }
  if (!confirm(`Are you sure you want to delete project "${projectName}"? This will unassign any active resources on this project.`)) return;
  try {
    await api(`/projects/${projectId}`, 'DELETE');
    toast(`Project "${projectName}" deleted successfully.`, 'success');
    loadProjects();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// Export Project PDF Report
async function exportProjectPDF(projectId) {
  try {
    const { data: p } = await api(`/projects/${projectId}`);
    const allStaff = p.all_project_staff || p.assignment_history || [];
    const activeStaff = (allStaff).filter(a => !a.unassigned_on);

    const statusColor = p.status === 'completed' ? '#1a7a3a' : p.status === 'active' ? '#b76e00' : '#555';
    const statusLabel = (p.status || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    const durDays = p.start_date && p.end_date
      ? Math.max(1, Math.round((new Date(p.end_date) - new Date(p.start_date)) / 86400000) + 1)
      : null;

    const reqRows = (p.requirements || []).map(r => `
      <tr>
        <td>${r.category || '—'}</td>
        <td style="text-align:center">${r.required}</td>
        <td style="text-align:center">${r.assigned}</td>
        <td style="text-align:center;color:${r.gap > 0 ? '#c0392b' : '#1a7a3a'};font-weight:600">${r.gap > 0 ? `-${r.gap} needed` : 'Fulfilled'}</td>
      </tr>
    `).join('');

    const staffRows = allStaff.map((a, i) => {
      const isActive = !a.unassigned_on;
      return `
      <tr style="background:${i % 2 === 0 ? '#fff' : '#f8f8f8'}">
        <td style="font-family:monospace">${a.staff_id || '—'}</td>
        <td><strong>${a.name || a.resource_name || '—'}</strong></td>
        <td>${a.category || '—'}</td>
        <td style="font-family:monospace">${a.contact_info || '—'}</td>
        <td>${a.assigned_on ? new Date(a.assigned_on).toLocaleDateString('en-IN') : '—'}</td>
        <td>${a.unassigned_on ? new Date(a.unassigned_on).toLocaleDateString('en-IN') : '—'}</td>
        <td><span style="display:inline-block;padding:2px 9px;border-radius:4px;font-weight:600;font-size:0.78rem;background:${isActive ? '#fff3e0' : '#e2fae8'};color:${isActive ? '#b76e00' : '#1a7a3a'}">${isActive ? 'Active' : 'Completed'}</span></td>
      </tr>
    `;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Project Report — ${p.name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #1a1a1a; background: #fff; padding: 32px; }
    h1 { font-size: 22px; font-weight: 800; margin-bottom: 2px; }
    h2 { font-size: 14px; font-weight: 700; color: #333; margin: 24px 0 8px; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1.5px solid #e5e5e5; padding-bottom: 5px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 18px; border-bottom: 2px solid #111; margin-bottom: 20px; }
    .logo { font-size: 18px; font-weight: 800; letter-spacing: -0.5px; }
    .logo span { color: #c0392b; }
    .status-pill { display: inline-block; padding: 4px 14px; border-radius: 6px; font-weight: 700; font-size: 12px; background: ${statusColor}22; color: ${statusColor}; border: 1px solid ${statusColor}55; }
    .meta-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px; }
    .meta-box { background: #f7f7f7; border-radius: 6px; padding: 10px 14px; }
    .meta-label { font-size: 10px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 3px; }
    .meta-val { font-weight: 700; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { background: #111; color: #fff; padding: 7px 10px; text-align: left; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
    td { padding: 6px 10px; border-bottom: 1px solid #ececec; vertical-align: middle; }
    .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e5e5; display: flex; justify-content: space-between; font-size: 11px; color: #999; }
    @media print { body { padding: 16px; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">DV <span>Events</span></div>
      <div style="font-size:11px;color:#888;margin-top:2px">Project Dossier &amp; Resource Deployment Report</div>
    </div>
    <div style="text-align:right">
      <div class="status-pill">${statusLabel}</div>
      <div style="font-size:11px;color:#888;margin-top:6px">Generated: ${new Date().toLocaleDateString('en-IN', {day:'2-digit',month:'long',year:'numeric'})}</div>
    </div>
  </div>

  <h1>${p.name}</h1>

  <div class="meta-grid" style="margin-top:16px">
    <div class="meta-box"><div class="meta-label">Client</div><div class="meta-val">${p.client_name || '—'}</div></div>
    <div class="meta-box"><div class="meta-label">Location / Venue</div><div class="meta-val">${p.location || '—'}</div></div>
    <div class="meta-box"><div class="meta-label">Project Lead</div><div class="meta-val">${p.manager_name || '—'}</div></div>
    <div class="meta-box"><div class="meta-label">Start Date</div><div class="meta-val">${p.start_date ? new Date(p.start_date).toLocaleDateString('en-IN', {day:'2-digit',month:'long',year:'numeric'}) : '—'}</div></div>
    <div class="meta-box"><div class="meta-label">End Date</div><div class="meta-val">${p.end_date ? new Date(p.end_date).toLocaleDateString('en-IN', {day:'2-digit',month:'long',year:'numeric'}) : '—'}</div></div>
    <div class="meta-box"><div class="meta-label">Duration</div><div class="meta-val">${durDays ? `${durDays} Day${durDays > 1 ? 's' : ''}` : '—'}</div></div>
    <div class="meta-box"><div class="meta-label">Active Deployed</div><div class="meta-val">${activeStaff.length}</div></div>
    <div class="meta-box"><div class="meta-label">Total Resources</div><div class="meta-val">${allStaff.length}</div></div>
  </div>

  ${p.notes ? `<div style="background:#f7f7f7;border-radius:6px;padding:10px 14px;margin-bottom:20px;font-size:12px"><strong>Notes:</strong> ${p.notes}</div>` : ''}

  ${(p.requirements || []).length ? `
  <h2>Resource Requirements</h2>
  <table>
    <thead><tr><th>Role / Category</th><th style="text-align:center">Required</th><th style="text-align:center">Deployed</th><th style="text-align:center">Status</th></tr></thead>
    <tbody>${reqRows}</tbody>
  </table>
  ` : ''}

  <h2>Resource Deployment Roster</h2>
  ${allStaff.length ? `
  <table>
    <thead><tr><th>Resource ID</th><th>Name</th><th>Role</th><th>Contact</th><th>Deployed</th><th>Released</th><th>Status</th></tr></thead>
    <tbody>${staffRows}</tbody>
  </table>
  ` : '<p style="color:#888;font-size:12px;padding:8px 0">No resources deployed on this project.</p>'}

  <div class="footer">
    <span>DV Events — Confidential Project Report</span>
    <span>${p.name} &bull; ID #${p.id}</span>
  </div>

  <script>window.onload = () => { setTimeout(() => window.print(), 400); }<\/script>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (!win) {
      toast('Popup blocked. Please allow popups to export PDF.', 'error');
      return;
    }
    win.document.write(html);
    win.document.close();
  } catch (err) {
    toast(err.message || 'Failed to generate PDF.', 'error');
  }
}

// ═══════════════════════════════════════════════════════════════
// 5. ASSIGNMENTS VIEW (ACTIVE DEPLOYMENTS LIVE BOARD WITH 3-DOTS)
// ═══════════════════════════════════════════════════════════════
async function loadAssignments() {
  const content = $('#page-assignments');
  content.innerHTML = loadingHTML();
  try {
    const [{ data: assignments }, { data: projects }] = await Promise.all([
      api('/assignments'),
      api('/projects')
    ]);
    state.assignments = assignments;
    state.projects = projects;

    renderAssignmentsView();
  } catch (err) {
    content.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><p>${err.message}</p></div>`;
    toast(err.message, 'error');
  }
}

function renderAssignmentsView() {
  const content = $('#page-assignments');
  if (!content) return;

  const assignments = state.assignments || [];
  const aFilter = state.assignmentFilter;

  const activeOnly = assignments.filter(a => !a.unassigned_on);
  const completed = assignments.filter(a => !!a.unassigned_on);

  const currentList = aFilter.tab === 'active' ? activeOnly : completed;
  const filtered = currentList.filter(a => {
    if (!aFilter.search) return true;
    const q = aFilter.search.toLowerCase();
    return (
      (a.resource_name || '').toLowerCase().includes(q) ||
      (a.category || '').toLowerCase().includes(q) ||
      (a.project_name || '').toLowerCase().includes(q) ||
      (a.location || '').toLowerCase().includes(q) ||
      (a.assigned_by_name || '').toLowerCase().includes(q)
    );
  });

  const uniqueSites = new Set(activeOnly.map(a => a.project_id)).size;

  content.innerHTML = `
    <!-- Header -->
    <div class="flex justify-between items-center mb-3" style="flex-wrap:wrap;gap:12px">
      <div>
        <h2 style="font-size:1.35rem;font-weight:700;color:var(--text-primary)">
          Active Deployments Board
        </h2>
        <p class="text-muted text-sm">Live on-site resources with real-time release and reassignment controls.</p>
      </div>
      ${auth.can('edit_assignments') ? `
      <button class="btn btn-primary" onclick="openAssignModal()">
        <span>+ New Deployment</span>
      </button>` : ''}
    </div>

    <!-- Active Deployments Summary Bar -->
    <div class="stats-grid mb-3">
      <div class="stat-card accent">
        <div class="stat-label">Active Deployments</div>
        <div class="stat-value" style="color:var(--accent)">${activeOnly.length}</div>
        <div class="stat-sub">Resources on live sites</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Active Sites</div>
        <div class="stat-value">${uniqueSites}</div>
        <div class="stat-sub">Active project venues</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Historical Assignments</div>
        <div class="stat-value">${completed.length}</div>
        <div class="stat-sub">Completed deployment records</div>
      </div>
    </div>

    <!-- Filter Toolbar -->
    <div class="card mb-3" style="padding:12px 16px">
      <div class="flex justify-between items-center gap-3" style="flex-wrap:wrap">
        <!-- Tabs -->
        <div class="flex gap-2 items-center">
          <button class="filter-pill ${aFilter.tab === 'active' ? 'active' : ''}" onclick="setAssignmentTab('active')">
            Active Deployments <span class="pill-count">${activeOnly.length}</span>
          </button>
          <button class="filter-pill ${aFilter.tab === 'history' ? 'active' : ''}" onclick="setAssignmentTab('history')">
            Deployment History <span class="pill-count">${completed.length}</span>
          </button>
        </div>

        <!-- Search -->
        <div class="search-input-wrap" style="position:relative;flex:1;max-width:320px;min-width:200px">
          <input 
            type="text" 
            class="form-control" 
            style="padding:7px 12px 7px 32px;font-size:0.84rem;height:34px" 
            placeholder="Search resource, site, role..."
            value="${escapeHtml(aFilter.search)}"
            oninput="handleAssignmentSearch(this.value)"
          >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="position:absolute;left:10px;top:10px;color:var(--text-muted)">
            <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </div>
      </div>
    </div>

    <!-- Deployments Table -->
    <div class="card mb-3">
      <div class="card-header">
        <span class="card-title">${aFilter.tab === 'active' ? 'Active On-Site Resources' : 'Completed Assignment History'} (${filtered.length})</span>
        <span class="text-muted text-sm">${aFilter.tab === 'active' ? 'Real-time site resources' : 'Archived operational records'}</span>
      </div>
      <div class="card-body" style="padding:0">
        <div class="table-wrapper">
          <table class="asgn-table">
            <thead>
              <tr>
                <th>Resource</th>
                <th>Category</th>
                <th>Project / Site</th>
                <th>${aFilter.tab === 'active' ? 'Deployed Since' : 'Deployment Dates'}</th>
                <th>Assigned By</th>
                ${aFilter.tab === 'active' ? '<th style="text-align:right">Actions</th>' : '<th>Notes</th>'}
              </tr>
            </thead>
            <tbody>
              ${filtered.length ? filtered.map(a => {
                const initials = getInitials(a.resource_name);
                const canEditAsgn = auth.can('edit_assignments');
                return `
                  <tr class="asgn-row" id="asgn-row-${a.id}">
                    <td>
                      <div class="asgn-worker-wrap">
                        <div class="asgn-avatar">${initials}</div>
                        <div>
                          <strong style="color:var(--text-primary);font-size:0.9rem">${escapeHtml(a.resource_name)}</strong>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span class="res-cat-badge">${escapeHtml(a.category || 'Resource')}</span>
                    </td>
                    <td>
                      <div style="display:flex;flex-direction:column;gap:2px">
                        <span style="font-weight:600;color:var(--accent);font-size:0.88rem">${escapeHtml(a.project_name)}</span>
                        <span style="font-size:0.76rem;color:var(--text-muted)">${escapeHtml(a.location || 'On-Site')}</span>
                      </div>
                    </td>
                    <td class="font-mono text-sm">
                      ${aFilter.tab === 'active' 
                        ? formatDate(a.assigned_on) 
                        : `${formatDate(a.assigned_on)} → ${formatDate(a.unassigned_on)}`}
                    </td>
                    <td class="text-muted text-sm">${escapeHtml(a.assigned_by_name || '—')}</td>
                    ${aFilter.tab === 'active' ? `
                      <td style="text-align:right" onclick="event.stopPropagation()">
                        <div class="user-action-menu-wrap">
                          <button type="button" class="user-action-trigger-btn" onclick="toggleAssignmentActionMenu(event, ${a.id})" aria-label="Assignment actions" title="Actions">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                              <circle cx="12" cy="12" r="2"></circle>
                              <circle cx="12" cy="5" r="2"></circle>
                              <circle cx="12" cy="19" r="2"></circle>
                            </svg>
                          </button>
                          <div class="user-action-dropdown" id="asgn-menu-${a.id}">
                            ${canEditAsgn ? `
                            <button type="button" class="user-dropdown-item" onclick="openReassignModal(${a.resource_id})">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                              <span>Reassign to Project</span>
                            </button>
                            <button type="button" class="user-dropdown-item danger" onclick="quickReleaseWorker(${a.resource_id}, '${escapeHtml(a.resource_name)}', '${escapeHtml(a.project_name)}')">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                              <span>Release to Bench</span>
                            </button>
                            <div class="user-dropdown-divider"></div>
                            ` : ''}
                            <button type="button" class="user-dropdown-item" onclick="viewResource(${a.resource_id})">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                              <span>View Resource Details</span>
                            </button>
                            <button type="button" class="user-dropdown-item" onclick="viewProject(${a.project_id})">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>
                              <span>View Project Team</span>
                            </button>
                          </div>
                        </div>
                      </td>
                    ` : `
                      <td class="text-muted text-sm">${escapeHtml(a.notes || '—')}</td>
                    `}
                  </tr>
                `;
              }).join('') : `
                <tr>
                  <td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted)">
                    No ${aFilter.tab === 'active' ? 'active' : 'historical'} deployments matching criteria.
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function setAssignmentTab(tab) {
  state.assignmentFilter.tab = tab;
  renderAssignmentsView();
}

function handleAssignmentSearch(val) {
  state.assignmentFilter.search = val;
  renderAssignmentsView();
}

function toggleAssignmentActionMenu(event, assignmentId) {
  event.stopPropagation();
  const triggerBtn = event.currentTarget;
  const targetMenu = document.getElementById(`asgn-menu-${assignmentId}`);
  const parentRow  = triggerBtn.closest('tr');
  const parentTd   = triggerBtn.closest('td');
  const parentCard = triggerBtn.closest('.card');
  const parentWrap = triggerBtn.closest('.user-action-menu-wrap');
  const tableWrap  = triggerBtn.closest('.table-wrapper');
  const wasOpen    = targetMenu && targetMenu.classList.contains('show');

  closeAllActionMenus();

  if (targetMenu && !wasOpen) {
    targetMenu.classList.add('show');
    triggerBtn.classList.add('active');
    if (parentRow) parentRow.classList.add('menu-open');
    if (parentTd) parentTd.classList.add('menu-open');
    if (parentCard) parentCard.classList.add('menu-open');
    if (parentWrap) parentWrap.classList.add('menu-open');
    if (tableWrap) tableWrap.classList.add('menu-open');

    const btnRect = triggerBtn.getBoundingClientRect();
    const spaceBelow = window.innerHeight - btnRect.bottom;
    const spaceAbove = btnRect.top;

    if (spaceBelow < 260 && spaceAbove > spaceBelow) {
      targetMenu.style.top = 'auto';
      targetMenu.style.bottom = 'calc(100% + 4px)';
    } else {
      targetMenu.style.top = 'calc(100% + 4px)';
      targetMenu.style.bottom = 'auto';
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// 6. REPORTS VIEW (OPERATIONAL INTELLIGENCE & FORECASTING)
// ═══════════════════════════════════════════════════════════════
async function loadReports() {
  const content = $('#page-reports');
  content.innerHTML = loadingHTML();
  try {
    const { data } = await api('/dashboard/reports');
    const { summary, category_utilization, client_breakdown, manager_load, staffing_gaps } = data;

    content.innerHTML = `
      <div class="flex justify-between items-center mb-3" style="flex-wrap:wrap;gap:12px">
        <div>
          <h2 style="font-size:1.35rem;font-weight:700;color:var(--text-primary)">
            Operations Analytics & Utilization Report
          </h2>
          <p class="text-muted text-sm">Comprehensive capacity utilization, staffing deficits, and client distribution.</p>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-secondary" onclick="window.print()">🖨️ Print / Export PDF</button>
        </div>
      </div>

      <!-- Top KPI Meters -->
      <div class="stats-grid mb-3">
        <div class="stat-card accent">
          <div class="stat-label">Utilization Rate</div>
          <div class="stat-value" style="color:var(--accent)">${summary.utilization_rate}%</div>
          <div class="stat-sub">${summary.assigned} active / ${summary.total_resources} total resources</div>
          <div style="margin-top:10px">${progressBar(summary.assigned, summary.total_resources)}</div>
        </div>

        <div class="stat-card success">
          <div class="stat-label">Available Bench Capacity</div>
          <div class="stat-value" style="color:var(--success)">${summary.available}</div>
          <div class="stat-sub">Resources ready to deploy</div>
        </div>

        <div class="stat-card warning">
          <div class="stat-label">Open Resource Gaps</div>
          <div class="stat-value" style="color:var(--warning)">${summary.total_gaps}</div>
          <div class="stat-sub">Unfilled requirements across projects</div>
        </div>

        <div class="stat-card danger">
          <div class="stat-label">Inactive / On Leave</div>
          <div class="stat-value" style="color:var(--danger)">${summary.on_leave + summary.unavailable}</div>
          <div class="stat-sub">${summary.on_leave} leave · ${summary.unavailable} off-duty</div>
        </div>
      </div>

      <!-- Category Utilization & Allocation Efficiency with Pie Chart -->
      <div class="card mb-3">
        <div class="card-header">
          <span class="card-title">📦 Category Allocation & Utilization Breakdown</span>
          <span class="text-muted text-sm">Visual share & utilization efficiency by role</span>
        </div>
        <div class="card-body">
          <div style="display:flex;align-items:center;justify-content:space-around;gap:36px;flex-wrap:wrap;margin-bottom:24px;padding-bottom:24px;border-bottom:1px solid var(--border)">
            <div>
              ${generateCategoryPieSVG(category_utilization, summary.total_resources, true)}
            </div>
            <div style="flex:1;min-width:min(100%, 280px);max-width:540px">
              <h4 style="font-size:1.05rem;font-weight:600;margin-bottom:6px;color:var(--text-primary)">Category Roster Share</h4>
              <p class="text-muted text-sm" style="margin-bottom:14px">Distribution of resource capacity across all event specialties.</p>
              <div class="pie-legend-grid">
                ${category_utilization.filter(c => c.total > 0).map((c, idx) => {
                  const color = PIE_COLORS[idx % PIE_COLORS.length];
                  const pct = summary.total_resources > 0 ? Math.round((c.total / summary.total_resources) * 100) : 0;
                  return `
                    <div class="pie-legend-row" style="cursor:default">
                      <div class="flex items-center gap-2">
                        <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${color}"></span>
                        <strong style="font-size:0.85rem">${c.category}</strong>
                      </div>
                      <span class="font-mono text-sm text-muted">${c.total} (${pct}%)</span>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          </div>

          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Total Staff</th>
                  <th>Deployed</th>
                  <th>Available</th>
                  <th>Utilization Rate</th>
                </tr>
              </thead>
              <tbody>
                ${category_utilization.map(c => `
                  <tr>
                    <td><strong>${c.category}</strong></td>
                    <td class="font-mono">${c.total}</td>
                    <td class="font-mono" style="color:var(--accent);font-weight:600">${c.assigned}</td>
                    <td class="font-mono" style="color:var(--success);font-weight:600">${c.available}</td>
                    <td style="min-width:140px">
                      <div class="flex items-center gap-2">
                        <div style="flex:1">${progressBar(c.assigned, c.total)}</div>
                        <span class="font-mono text-sm">${c.utilization_pct}%</span>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Grid 2: Client Distribution & Manager Load -->
      <div class="grid-2 mb-3">
        <!-- Client Distribution -->
        <div class="card">
          <div class="card-header"><span class="card-title">🏢 Client Deployment Distribution</span></div>
          <div class="card-body" style="padding:0">
            <div class="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Projects</th>
                    <th>Staff Deployed</th>
                  </tr>
                </thead>
                <tbody>
                  ${client_breakdown.map(c => `
                    <tr>
                      <td><strong>${c.client_name}</strong></td>
                      <td>${c.active_projects} active / ${c.total_projects} total</td>
                      <td><span class="font-mono" style="color:var(--accent);font-weight:600">${c.current_deployed_staff}</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Manager Team Load -->
        <div class="card">
          <div class="card-header"><span class="card-title">👔 Operations Manager Team Load</span></div>
          <div class="card-body" style="padding:0">
            <div class="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Manager</th>
                    <th>Team Size</th>
                    <th>Deployed</th>
                    <th>Load %</th>
                  </tr>
                </thead>
                <tbody>
                  ${manager_load.map(m => `
                    <tr>
                      <td><strong>${m.manager_name}</strong></td>
                      <td>${m.team_size}</td>
                      <td><span style="color:var(--accent);font-weight:600">${m.assigned}</span></td>
                      <td class="font-mono">${m.load_pct || 0}%</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- Staffing Deficit Master List -->
      ${staffing_gaps && staffing_gaps.length > 0 ? `
        <div class="card">
          <div class="card-header">
            <span class="card-title">⚠️ Open Staffing Requirements by Project</span>
            <span class="badge badge-unavailable">Action Required</span>
          </div>
          <div class="card-body" style="padding:0">
            <div class="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Role Needed</th>
                    <th>Required</th>
                    <th>Staffed</th>
                    <th>Remaining Deficit</th>
                    ${auth.can('edit_assignments') ? '<th>Action</th>' : ''}
                  </tr>
                </thead>
                <tbody>
                  ${staffing_gaps.map(g => `
                    <tr>
                      <td><strong>${g.project}</strong></td>
                      <td>${g.category}</td>
                      <td>${g.quantity_required}</td>
                      <td>${g.assigned}</td>
                      <td><span class="gap-badge gap-crit">-${g.gap}</span></td>
                      ${auth.can('edit_assignments') ? `
                      <td>
                        <button class="btn btn-sm btn-primary" onclick="quickFillGap('${g.project}', '${g.category}')">Allocate</button>
                      </td>` : ''}
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ` : ''}
    `;
  } catch (err) {
    content.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><p>${err.message}</p></div>`;
    toast(err.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════════
// 7. MANAGERS & CLIENTS (DIRECTORY & TEAM OVERSIGHT)
// ═══════════════════════════════════════════════════════════════
async function loadManagers() {
  const content = $('#page-managers');
  content.innerHTML = loadingHTML();
  try {
    const [{ data: managers }, { data: resources }] = await Promise.all([
      api('/managers'),
      api('/resources')
    ]);
    state.managers = managers;
    state.resources = resources;

    renderManagersView();
  } catch (err) {
    content.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><p>${err.message}</p></div>`;
    toast(err.message, 'error');
  }
}

function renderManagersView() {
  const content = $('#page-managers');
  if (!content) return;

  const managers = state.managers || [];
  const resources = state.resources || [];

  // Calculate high-level manpower metrics
  const totalSupervised = managers.reduce((acc, m) => acc + (Number(m.total_resources) || 0), 0);
  const totalAssigned   = managers.reduce((acc, m) => acc + (Number(m.assigned) || 0), 0);
  const totalAvailable  = managers.reduce((acc, m) => acc + (Number(m.available) || 0), 0);
  const totalLeave      = managers.reduce((acc, m) => acc + (Number(m.on_leave) || 0), 0);
  const totalUnavail    = managers.reduce((acc, m) => acc + (Number(m.unavailable) || 0), 0);
  const totalStandby    = totalLeave + totalUnavail;
  const globalUtilPct   = totalSupervised > 0 ? Math.round((totalAssigned / totalSupervised) * 100) : 0;
  const globalAvailPct  = totalSupervised > 0 ? Math.round((totalAvailable / totalSupervised) * 100) : 0;
  const globalLeavePct  = totalSupervised > 0 ? Math.round((totalStandby / totalSupervised) * 100) : 0;

  const MGR_PALETTE = ['#38bdf8', '#34d399', '#a78bfa', '#f59e0b', '#f472b6', '#60a5fa', '#fb923c', '#818cf8'];

  // Map resources and active project tags per manager
  const mgrProjectsMap = {};
  resources.forEach(r => {
    if (r.reporting_manager_id && r.current_project_id && r.status === 'assigned') {
      if (!mgrProjectsMap[r.reporting_manager_id]) mgrProjectsMap[r.reporting_manager_id] = new Set();
      if (r.current_project_name) mgrProjectsMap[r.reporting_manager_id].add(r.current_project_name);
    }
  });

  content.innerHTML = `
    <!-- Header -->
    <div class="flex justify-between items-center mb-3" style="flex-wrap:wrap;gap:12px">
      <div>
        <h2 style="font-size:1.35rem;font-weight:700;color:var(--text-primary)">
          Operations Managers & Leadership
        </h2>
        <p class="text-muted text-sm">Supervisory oversight, team allocation breakdown, and real-time resource capacity.</p>
      </div>
      ${auth.can('edit_managers') ? `
      <button class="btn btn-primary" onclick="openManagerModal()">
        <span>+ Add Manager</span>
      </button>` : ''}
    </div>

    <!-- Pictorial Visual Analytics Section -->
    <div class="card mb-3" style="padding:20px 24px">
      <div class="mgr-visual-header">
        
        <!-- Interactive Pie / Donut Chart -->
        <div style="flex:1;min-width:300px;max-width:440px">
          <div style="font-weight:700;font-size:0.95rem;color:var(--text-primary);margin-bottom:6px">
            Team Distribution by Manager
          </div>
          <div class="text-muted text-xs mb-3">
            Interactive visual representation of supervised resource share across leadership.
          </div>
          <div class="mgr-pie-wrap">
            ${generateManagersPieSVG(managers)}
          </div>
        </div>

        <!-- Legend and Workload Breakdown -->
        <div style="flex:1.2;min-width:290px">
          <div style="font-weight:700;font-size:0.95rem;color:var(--text-primary);margin-bottom:6px">
            Manager Roster Breakdown
          </div>
          <div class="text-muted text-xs mb-3">
            Hover to isolate manager share or click to filter resource directory.
          </div>
          <div class="mgr-legend-grid">
            ${managers.map((m, idx) => {
              const color = MGR_PALETTE[idx % MGR_PALETTE.length];
              const count = Number(m.total_resources) || 0;
              const pct = totalSupervised > 0 ? ((count / totalSupervised) * 100).toFixed(1) : 0;
              return `
                <div 
                  class="mgr-legend-row" 
                  id="mgr-legend-${m.id}" 
                  onmouseenter="handleManagerPieHover(${m.id}, '${escapeHtml(m.name)}', ${count}, '${pct}%', '${color}')" 
                  onmouseleave="handleManagerPieLeave()" 
                  onclick="filterByManagerAndGo(${m.id})"
                  title="Click to view all resources under ${escapeHtml(m.name)}"
                >
                  <div style="display:flex;align-items:center;gap:10px;min-width:0">
                    <span style="width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0;box-shadow:0 0 6px ${color}66"></span>
                    <span style="font-weight:600;font-size:0.86rem;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                      ${escapeHtml(m.name)}
                    </span>
                  </div>
                  <div style="display:flex;align-items:center;gap:12px;font-family:var(--font-mono, monospace)">
                    <span style="font-size:0.82rem;font-weight:600;color:var(--text-secondary)">${count} resources</span>
                    <span class="badge badge-outline" style="font-size:0.75rem;padding:2px 8px">${pct}%</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

      </div>

      <!-- High-Level Capacity Distribution Bar -->
      <div style="border-top:1px solid var(--border);padding-top:16px;margin-top:12px">
        <div class="flex justify-between items-center mb-2" style="flex-wrap:wrap;gap:8px">
          <span style="font-size:0.78rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted)">
            Total Supervised Capacity: ${totalSupervised} Resources
          </span>
          <div class="flex gap-3 text-xs">
            <span style="color:var(--success);font-weight:600">● ${totalAvailable} Available (${globalAvailPct}%)</span>
            <span style="color:var(--accent);font-weight:600">● ${totalAssigned} Deployed (${globalUtilPct}%)</span>
            <span style="color:var(--warning);font-weight:600">● ${totalStandby} Standby (${globalLeavePct}%)</span>
          </div>
        </div>
        <div class="mgr-capacity-bar" style="height:10px">
          <div class="mgr-capacity-seg available" style="width:${globalAvailPct}%;background:var(--success)" title="${totalAvailable} Available"></div>
          <div class="mgr-capacity-seg assigned" style="width:${globalUtilPct}%;background:var(--accent)" title="${totalAssigned} Deployed"></div>
          <div class="mgr-capacity-seg leave" style="width:${globalLeavePct}%;background:var(--warning)" title="${totalStandby} Standby / Leave"></div>
        </div>
      </div>
    </div>

    <!-- Manager Cards Grid -->
    <div class="mgr-grid">
      ${managers.map((m, idx) => {
        const color = MGR_PALETTE[idx % MGR_PALETTE.length];
        const initials = (m.name || 'M').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
        const total = Number(m.total_resources) || 0;
        const avail = Number(m.available) || 0;
        const asgn  = Number(m.assigned) || 0;
        const leave = (Number(m.on_leave) || 0) + (Number(m.unavailable) || 0);

        const availPct = total > 0 ? (avail / total) * 100 : 0;
        const asgnPct  = total > 0 ? (asgn / total) * 100 : 0;
        const leavePct = total > 0 ? (leave / total) * 100 : 0;

        const activeProjects = mgrProjectsMap[m.id] ? Array.from(mgrProjectsMap[m.id]) : [];

        return `
          <div class="mgr-card" onclick="handleManagerCardClick(event, ${m.id})">
            <div>
              <!-- Card Header -->
              <div class="mgr-card-head">
                <div class="mgr-profile-wrap">
                  <div class="mgr-avatar" style="border-color:${color}55;color:${color};background:${color}18">
                    ${initials}
                  </div>
                  <div>
                    <div class="mgr-name">${escapeHtml(m.name)}</div>
                    <div class="mgr-role">${escapeHtml(m.role || 'Operations Lead')}</div>
                    ${m.contact ? `
                      <div class="text-muted text-xs" style="margin-top:2px">
                        📞 ${escapeHtml(m.contact)}
                      </div>
                    ` : ''}
                  </div>
                </div>

                <!-- 3-Dots Action Menu -->
                <div class="user-action-menu-wrap" onclick="event.stopPropagation()">
                  <button type="button" class="user-action-trigger-btn" onclick="toggleManagerActionMenu(event, ${m.id})" aria-label="Manager actions" title="Actions">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="12" r="2"></circle>
                      <circle cx="12" cy="5" r="2"></circle>
                      <circle cx="12" cy="19" r="2"></circle>
                    </svg>
                  </button>
                  <div class="user-action-dropdown" id="mgr-menu-${m.id}">
                    <button type="button" class="user-dropdown-item" onclick="filterByManagerAndGo(${m.id})">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                      <span>View Managed Resources</span>
                    </button>
                    <button type="button" class="user-dropdown-item" onclick="viewManagerTeam(${m.id})">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                      <span>Team Roster Breakdown</span>
                    </button>
                    ${auth.can('edit_managers') ? `
                    <button type="button" class="user-dropdown-item" onclick="openManagerModal(${m.id})">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                      <span>Edit Profile</span>
                    </button>
                    <div class="user-dropdown-divider"></div>
                    <button type="button" class="user-dropdown-item danger" onclick="deleteManagerConfirm(${m.id}, '${escapeHtml(m.name)}')">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                      <span>Delete Manager</span>
                    </button>
                    ` : ''}
                  </div>
                </div>
              </div>

              <!-- Pictorial Capacity Meter -->
              <div class="mgr-capacity-meter mt-3">
                <div class="mgr-capacity-header">
                  <span>Resource Allocation</span>
                  <strong style="color:var(--text-primary);font-family:var(--font-mono, monospace)">${total} Resources</strong>
                </div>
                <div class="mgr-capacity-bar">
                  <div class="mgr-capacity-seg available" style="width:${availPct}%;background:var(--success)" title="${avail} Available"></div>
                  <div class="mgr-capacity-seg assigned" style="width:${asgnPct}%;background:var(--accent)" title="${asgn} Deployed"></div>
                  <div class="mgr-capacity-seg leave" style="width:${leavePct}%;background:var(--warning)" title="${leave} Standby / Leave"></div>
                </div>
                <div class="mgr-stat-chips">
                  <div class="mgr-chip" title="Available for dispatch">
                    <span class="mgr-chip-dot" style="background:var(--success)"></span>
                    <span>${avail} Ready</span>
                  </div>
                  <div class="mgr-chip" title="Active on project sites">
                    <span class="mgr-chip-dot" style="background:var(--accent)"></span>
                    <span>${asgn} Deployed</span>
                  </div>
                  <div class="mgr-chip" title="On leave or off-duty">
                    <span class="mgr-chip-dot" style="background:var(--warning)"></span>
                    <span>${leave} Leave</span>
                  </div>
                </div>
              </div>

              <!-- Active Projects Tags -->
              <div class="mt-3">
                <div class="text-muted text-xs" style="font-weight:600;text-transform:uppercase;letter-spacing:0.4px">
                  Active Deployments
                </div>
                ${activeProjects.length > 0 ? `
                  <div class="mgr-tag-list">
                    ${activeProjects.slice(0, 3).map(proj => `
                      <span class="mgr-tag">📍 ${escapeHtml(proj)}</span>
                    `).join('')}
                    ${activeProjects.length > 3 ? `<span class="mgr-tag">+${activeProjects.length - 3} more</span>` : ''}
                  </div>
                ` : `
                  <div class="text-muted text-xs" style="margin-top:4px">No active project assignments.</div>
                `}
              </div>
            </div>

            <!-- Card Footer -->
            <div class="mgr-card-footer">
              <span>Joined: ${formatDate(m.created_at)}</span>
              <button class="btn btn-sm btn-secondary" onclick="filterByManagerAndGo(${m.id})">
                View Staff →
              </button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function handleManagerCardClick(event, managerId) {
  if (event.target.closest('.user-action-menu-wrap') || event.target.closest('button') || event.target.closest('a')) return;
  viewManagerTeam(managerId);
}

function generateManagersPieSVG(managers) {
  const activeMgrs = managers.filter(m => (Number(m.total_resources) || 0) > 0);
  const totalStaff = managers.reduce((acc, m) => acc + (Number(m.total_resources) || 0), 0);

  const radius = 68;
  const circumference = 2 * Math.PI * radius; // ~427.2566
  const colors = ['#38bdf8', '#34d399', '#a78bfa', '#f59e0b', '#f472b6', '#60a5fa', '#fb923c', '#818cf8'];

  if (!totalStaff || activeMgrs.length === 0) {
    return `
      <svg width="220" height="220" viewBox="0 0 220 220" style="display:block;margin:0 auto">
        <circle cx="110" cy="110" r="${radius}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="24" />
        <g pointer-events="none" style="text-anchor: middle;">
          <text x="110" y="105" fill="var(--text-muted)" font-size="11" font-weight="600">NO STAFF DATA</text>
          <text x="110" y="125" fill="var(--text-primary)" font-size="18" font-weight="700">0 Staff</text>
        </g>
      </svg>
    `;
  }

  let accumulatedOffset = 0;
  const slices = activeMgrs.map((m, idx) => {
    const count = Number(m.total_resources) || 0;
    const pct = ((count / totalStaff) * 100);
    const strokeLength = (count / totalStaff) * circumference;
    const strokeDasharray = `${strokeLength.toFixed(2)} ${circumference.toFixed(2)}`;
    const strokeDashoffset = (-accumulatedOffset).toFixed(2);
    accumulatedOffset += strokeLength;
    const color = colors[idx % colors.length];

    return `
      <circle 
        class="mgr-pie-slice" 
        id="mgr-slice-${m.id}" 
        cx="110" cy="110" r="${radius}" 
        fill="none" 
        stroke="${color}" 
        stroke-width="26" 
        stroke-dasharray="${strokeDasharray}" 
        stroke-dashoffset="${strokeDashoffset}" 
        transform="rotate(-90 110 110)" 
        onmouseenter="handleManagerPieHover(${m.id}, '${escapeHtml(m.name)}', ${count}, '${pct.toFixed(1)}%', '${color}')" 
        onmouseleave="handleManagerPieLeave()" 
        onclick="filterByManagerAndGo(${m.id})"
      />
    `;
  }).join('');

  return `
    <svg width="220" height="220" viewBox="0 0 220 220" style="display:block;margin:0 auto;overflow:visible">
      <circle cx="110" cy="110" r="${radius}" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="26" />
      ${slices}
      <g class="mgr-donut-center" pointer-events="none" style="text-anchor: middle;">
        <text id="mgr-donut-subtitle" x="110" y="98" fill="var(--text-muted)" font-size="10" font-weight="600" letter-spacing="0.5">TOTAL RESOURCES</text>
        <text id="mgr-donut-main" x="110" y="122" fill="var(--text-primary)" font-size="20" font-weight="700" font-family="var(--font-mono, monospace)">${totalStaff}</text>
        <text id="mgr-donut-extra" x="110" y="137" fill="var(--text-secondary)" font-size="10">${managers.length} Managers</text>
      </g>
    </svg>
  `;
}

function handleManagerPieHover(mgrId, name, count, pct, color) {
  const subtitle = document.getElementById('mgr-donut-subtitle');
  const main     = document.getElementById('mgr-donut-main');
  const extra    = document.getElementById('mgr-donut-extra');

  if (subtitle) subtitle.textContent = name.length > 15 ? name.substring(0, 14) + '…' : name;
  if (main) {
    main.textContent = `${count} Resources`;
    main.style.fill = color;
  }
  if (extra) extra.textContent = `${pct} of team`;

  // Highlight pie slices
  document.querySelectorAll('.mgr-pie-slice').forEach(s => {
    if (s.id === `mgr-slice-${mgrId}`) {
      s.classList.add('active');
      s.classList.remove('dimmed');
    } else {
      s.classList.remove('active');
      s.classList.add('dimmed');
    }
  });

  // Highlight legend rows
  document.querySelectorAll('.mgr-legend-row').forEach(row => {
    if (row.id === `mgr-legend-${mgrId}`) {
      row.classList.add('active');
      row.classList.remove('dimmed');
    } else {
      row.classList.remove('active');
      row.classList.add('dimmed');
    }
  });
}

function handleManagerPieLeave() {
  const managers = state.managers || [];
  const totalStaff = managers.reduce((acc, m) => acc + (Number(m.total_resources) || 0), 0);

  const subtitle = document.getElementById('mgr-donut-subtitle');
  const main     = document.getElementById('mgr-donut-main');
  const extra    = document.getElementById('mgr-donut-extra');

  if (subtitle) subtitle.textContent = 'TOTAL RESOURCES';
  if (main) {
    main.textContent = `${totalStaff}`;
    main.style.fill = 'var(--text-primary)';
  }
  if (extra) extra.textContent = `${managers.length} Managers`;

  document.querySelectorAll('.mgr-pie-slice').forEach(s => {
    s.classList.remove('active', 'dimmed');
  });

  document.querySelectorAll('.mgr-legend-row').forEach(row => {
    row.classList.remove('active', 'dimmed');
  });
}

function toggleManagerActionMenu(event, managerId) {
  event.stopPropagation();
  const triggerBtn = event.currentTarget;
  const targetMenu = document.getElementById(`mgr-menu-${managerId}`);
  const parentCard = triggerBtn.closest('.mgr-card') || triggerBtn.closest('.card');
  const parentWrap = triggerBtn.closest('.user-action-menu-wrap');
  const wasOpen    = targetMenu && targetMenu.classList.contains('show');

  closeAllActionMenus();

  if (targetMenu && !wasOpen) {
    targetMenu.classList.add('show');
    triggerBtn.classList.add('active');
    if (parentCard) parentCard.classList.add('menu-open');
    if (parentWrap) parentWrap.classList.add('menu-open');

    const btnRect = triggerBtn.getBoundingClientRect();
    const spaceBelow = window.innerHeight - btnRect.bottom;
    const spaceAbove = btnRect.top;

    if (spaceBelow < 220 && spaceAbove > spaceBelow) {
      targetMenu.style.top = 'auto';
      targetMenu.style.bottom = 'calc(100% + 4px)';
    } else {
      targetMenu.style.top = 'calc(100% + 4px)';
      targetMenu.style.bottom = 'auto';
    }
  }
}

async function deleteManagerConfirm(managerId, managerName) {
  if (!auth.can('edit_managers')) {
    toast('Access restricted: You do not have permission to delete managers.', 'error');
    return;
  }
  if (!confirm(`Are you sure you want to delete manager "${managerName}"? Staff previously assigned to this manager will be moved to unassigned supervisor status.`)) return;
  try {
    await api(`/managers/${managerId}`, 'DELETE');
    toast(`Manager "${managerName}" deleted.`, 'success');
    loadManagers();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function filterByManagerAndGo(mgrId) {
  state.resourceFilter.status = 'all';
  state.resourceFilter.category_id = '';
  state.resourceFilter.manager_id = mgrId ? String(mgrId) : '';
  state.resourceFilter.search = '';
  toast(`Viewing resources under manager`, 'info');
  navigate('resources');
}

async function viewManagerTeam(managerId) {
  try {
    const res = await api(`/managers/${managerId}/team`);
    const { manager, summary, team, project_breakdown } = res.data;

    const modalTitle = document.querySelector('#detail-modal .modal-title');
    if (modalTitle) modalTitle.textContent = `${manager.name} — Team Overview`;

    const body = $('#detail-modal-body');
    if (!body) return;

    body.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding-bottom:14px;border-bottom:1px solid var(--border);margin-bottom:16px;flex-wrap:wrap">
        <div>
          <h3 style="font-size:1.15rem;font-weight:700;color:var(--text-primary)">${escapeHtml(manager.name)}</h3>
          <p class="text-muted text-sm">${escapeHtml(manager.role || 'Operations Manager')} · 📞 ${escapeHtml(manager.contact || 'No contact')}</p>
        </div>
        <div class="flex gap-2">
          ${auth.can('edit_managers') ? `<button class="btn btn-sm btn-secondary" onclick="closeModal('detail-modal');openManagerModal(${manager.id})">Edit Profile</button>` : ''}
          <button class="btn btn-sm btn-primary" onclick="closeModal('detail-modal');filterByManagerAndGo(${manager.id})">Open Directory View</button>
        </div>
      </div>

      <!-- Capacity Stats -->
      <div class="stats-grid mb-3" style="grid-template-columns:repeat(4,1fr)">
        <div class="stat-card">
          <div class="stat-label">Total Staff</div>
          <div class="stat-value">${summary.total || 0}</div>
        </div>
        <div class="stat-card success">
          <div class="stat-label">Available</div>
          <div class="stat-value" style="color:var(--success)">${summary.available || 0}</div>
        </div>
        <div class="stat-card accent">
          <div class="stat-label">Deployed</div>
          <div class="stat-value" style="color:var(--accent)">${summary.assigned || 0}</div>
        </div>
        <div class="stat-card warning">
          <div class="stat-label">On Leave</div>
          <div class="stat-value" style="color:var(--warning)">${summary.on_leave || 0}</div>
        </div>
      </div>

      <!-- Project Deployments -->
      ${project_breakdown && project_breakdown.length > 0 ? `
        <div style="margin-bottom:18px">
          <div style="font-weight:600;font-size:0.85rem;color:var(--text-primary);margin-bottom:8px">Active Project Deployments</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            ${project_breakdown.map(p => `
              <span class="gap-pill" style="cursor:pointer" onclick="closeModal('detail-modal');viewProject(${p.id})">
                📍 <strong>${escapeHtml(p.name)}</strong> · ${p.staff_count} resources
              </span>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Team Members Roster -->
      <div>
        <div style="font-weight:600;font-size:0.85rem;color:var(--text-primary);margin-bottom:8px">Team Roster (${team.length})</div>
        <div class="table-wrapper" style="max-height:280px;overflow-y:auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>Resource</th>
                <th>Category</th>
                <th>Status</th>
                <th>Current Project</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${team.length ? team.map(r => `
                <tr>
                  <td>
                    <div style="display:flex;align-items:center;gap:8px">
                      <span class="res-status-dot ${r.status}" title="${r.status}"></span>
                      <strong style="color:var(--text-primary)">${escapeHtml(r.name)}</strong>
                    </div>
                  </td>
                  <td><span class="badge badge-outline">${escapeHtml(r.category_name || 'Resource')}</span></td>
                  <td>${statusBadge(r.status)}</td>
                  <td>${r.current_project_name ? `📍 ${escapeHtml(r.current_project_name)}` : '<span class="text-muted">—</span>'}</td>
                  <td>
                    <button class="btn btn-sm btn-secondary" onclick="closeModal('detail-modal');viewResource(${r.id})">Profile</button>
                  </td>
                </tr>
              `).join('') : `
                <tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px">No resources currently assigned to this manager.</td></tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;

    showModal('detail-modal');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function loadClients() {
  const content = $('#page-clients');
  content.innerHTML = loadingHTML();
  try {
    const { data: clients } = await api('/clients');
    state.clients = clients;

    content.innerHTML = `
      <div class="flex justify-between items-center mb-3" style="flex-wrap:wrap;gap:12px">
        <div>
          <h2 style="font-size:1.35rem;font-weight:700;color:var(--text-primary)">
            Client Accounts
          </h2>
          <p class="text-muted text-sm">Organizations contracting DV Events for resource & security details.</p>
        </div>
        ${auth.can('edit_clients') ? `<button class="btn btn-primary" onclick="openClientModal()">➕ Add Client</button>` : ''}
      </div>

      <div class="deployment-grid">
        ${clients.map(c => `
          <div class="deployment-card">
            <div>
              <div class="deployment-name">${c.name}</div>
              <div class="deployment-meta">
                <span>📞 ${c.contact_info || '—'}</span>
              </div>
            </div>

            <div style="background:var(--bg-hover);padding:12px;border-radius:10px">
              <div class="flex justify-between text-sm">
                <span>Total Projects:</span>
                <strong class="font-mono">${c.total_projects || 0}</strong>
              </div>
              <div class="flex justify-between text-sm" style="margin-top:4px">
                <span>Active Projects:</span>
                <span style="color:var(--accent);font-weight:600">${c.active_projects || 0}</span>
              </div>
            </div>

            ${(auth.can('edit_clients') || auth.can('edit_projects')) ? `
            <div class="flex justify-between items-center" style="border-top:1px solid var(--border);padding-top:12px">
              ${auth.can('edit_clients') ? `<button class="btn btn-sm btn-secondary" onclick="openClientModal(${c.id})">Edit</button>` : '<div></div>'}
              ${auth.can('edit_projects') ? `<button class="btn btn-sm btn-primary" onclick="openProjectModal(null, ${c.id})">+ New Project</button>` : ''}
            </div>` : ''}
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    content.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><p>${err.message}</p></div>`;
  }
}

// ═══════════════════════════════════════════════════════════════
// 8. DRILLDOWN MODALS & DETAILS
// ═══════════════════════════════════════════════════════════════

// Resource Drilldown Details Modal
async function viewResource(id) {
  try {
    const { data: r } = await api(`/resources/${id}`);
    const isAvail = r.status === 'available' || r.status === 'released';
    const isDeployed = r.status === 'deployed' || r.status === 'assigned';
    const initials = getInitials(r.name);
    const age = calculateAge(r.dob);

    const cleanPhone = (r.contact_info || '').replace(/[^0-9]/g, '').slice(-10);
    const effectiveAge = r.age ? Number(r.age) : (r.dob ? calculateAge(r.dob) : null);
    const optedList = formatCrewOptedRoles(r.opted_roles);

    $('#detail-modal-body').innerHTML = `
      <div class="flex justify-between items-center mb-3" style="border-bottom:1px solid var(--border);padding-bottom:16px">
        <div class="flex items-center gap-3">
          <div class="ops-avatar ${isAvail ? 'avail' : isDeployed ? 'asgn' : 'unavail'}" style="width:58px;height:58px;font-size:1.25rem;overflow:hidden;flex-shrink:0">
            ${r.photo_path ? `<img src="${escapeHtml(r.photo_path)}" alt="${escapeHtml(r.name)}" style="width:100%;height:100%;object-fit:cover" onerror="this.onerror=null;this.parentElement.textContent='${initials}'">` : initials}
          </div>
          <div>
            <div class="flex items-center gap-2" style="flex-wrap:wrap">
              <h3 style="font-size:1.3rem;font-weight:700;margin:0">${escapeHtml(r.name)}</h3>
              ${r.staff_id ? `<span style="font-size:0.75rem;font-family:var(--font-mono,monospace);background:var(--bg-hover);color:var(--text-muted);padding:2px 8px;border-radius:4px;border:1px solid var(--border-subtle);letter-spacing:0.05em">${escapeHtml(r.staff_id)}</span>` : ''}
            </div>
            <div class="text-sm text-muted" style="margin-top:4px;display:flex;flex-wrap:wrap;gap:8px;align-items:center">
              <span>Category: <strong style="color:var(--text-primary)">${escapeHtml(r.category_name || 'Staff')}</strong></span>
              <span>·</span>
              <span>Zone: <strong style="color:var(--text-primary)">📍 ${escapeHtml(r.zone || 'Pune')}</strong></span>
              ${r.email ? `<span>·</span><span>Email: <strong>${escapeHtml(r.email)}</strong></span>` : ''}
            </div>
          </div>
        </div>
        ${badge(r.status)}
      </div>

      <!-- Quick Contact Bar -->
      <div class="res-card-contacts-bar mb-3" style="padding:4px 0">
        ${r.contact_info ? `
          <a class="res-card-contact-btn wa" href="https://wa.me/91${cleanPhone}" target="_blank" title="WhatsApp Chat">
            <span>💬</span> <span>WhatsApp: +91 ${escapeHtml(r.contact_info)}</span>
          </a>
        ` : ''}
        ${r.alternate_phone ? `
          <a class="res-card-contact-btn alt" href="tel:${escapeHtml(r.alternate_phone)}" title="Call Emergency Contact">
            <span>🆘</span> <span>Emergency Contact: ${escapeHtml(r.alternate_phone)}</span>
          </a>
        ` : ''}
      </div>

      <!-- Personal & Physical Attributes Grid -->
      <div class="grid-2 mb-3" style="gap:10px">
        <div style="background:var(--bg-hover);padding:10px 14px;border-radius:8px">
          <div class="text-xs text-muted font-medium">Age / Date of Birth</div>
          <div style="font-weight:600;margin-top:2px">
            ${effectiveAge != null ? `${effectiveAge} yrs` : '—'} ${r.dob ? `<span class="text-muted text-xs font-mono">(${formatDate(r.dob)})</span>` : ''}
          </div>
        </div>
        <div style="background:var(--bg-hover);padding:10px 14px;border-radius:8px">
          <div class="text-xs text-muted font-medium">Gender</div>
          <div style="font-weight:600;margin-top:2px;text-transform:capitalize">${escapeHtml(r.gender || '—')}</div>
        </div>
        <div style="background:var(--bg-hover);padding:10px 14px;border-radius:8px">
          <div class="text-xs text-muted font-medium">Height</div>
          <div style="font-weight:600;margin-top:2px">📏 ${escapeHtml(r.height && r.height.toLowerCase() !== 'na' ? r.height : '—')}</div>
        </div>
        <div style="background:var(--bg-hover);padding:10px 14px;border-radius:8px">
          <div class="text-xs text-muted font-medium">Area of Residence (Pune Zone)</div>
          <div style="font-weight:600;margin-top:2px">📍 ${escapeHtml(r.zone || 'Pune')}</div>
        </div>
        <div style="background:var(--bg-hover);padding:10px 14px;border-radius:8px">
          <div class="text-xs text-muted font-medium">Languages Confidently Spoken</div>
          <div style="font-weight:600;margin-top:2px">🗣️ ${escapeHtml(r.languages || '—')}</div>
        </div>
        <div style="background:var(--bg-hover);padding:10px 14px;border-radius:8px">
          <div class="text-xs text-muted font-medium">Weekend / Overall Availability</div>
          <div style="font-weight:600;margin-top:2px">🗓️ ${escapeHtml(r.availability || 'Flexible')}</div>
        </div>
        <div style="background:var(--bg-hover);padding:10px 14px;border-radius:8px">
          <div class="text-xs text-muted font-medium">Operations Lead / Squad Manager</div>
          <div style="font-weight:600;margin-top:2px">👔 ${escapeHtml(r.manager_name || 'Unassigned / Org Pool')}</div>
        </div>
        <div style="background:var(--bg-hover);padding:10px 14px;border-radius:8px">
          <div class="text-xs text-muted font-medium">Active Deployment</div>
          <div style="font-weight:600;margin-top:2px;color:var(--accent)">
            ${r.current_project_name ? `📍 ${escapeHtml(r.current_project_name)} (${escapeHtml(r.current_project_location || 'Site')})` : (isAvail ? '🟢 Available in Bench Pool' : statusDot(r.status) + ' ' + (r.status.replace(/_/g, ' ')))}
          </div>
        </div>
      </div>

      <!-- Preferred Opted Roles -->
      ${(r.opted_roles || optedList.length) ? `
        <div class="mb-3" style="background:var(--bg-hover);padding:12px 14px;border-radius:8px">
          <div class="text-xs text-muted mb-1.5" style="font-weight:700;letter-spacing:0.04em">OPTED CREW ROLES</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${optedList.map(role => `
              <span class="badge" style="background:rgba(99,102,241,0.12);color:var(--accent);border:1px solid rgba(99,102,241,0.25);font-size:0.78rem;padding:4px 10px">
                ✓ ${escapeHtml(role)}
              </span>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Past Event Experience -->
      ${r.experience ? `
        <div class="mb-3" style="background:var(--bg-hover);padding:12px 14px;border-radius:8px">
          <div class="text-xs text-muted mb-1" style="font-weight:700;letter-spacing:0.04em">PAST EVENT EXPERIENCE</div>
          <p style="font-size:0.88rem;margin:0;line-height:1.45;color:var(--text-primary);white-space:pre-wrap">${escapeHtml(r.experience)}</p>
        </div>
      ` : ''}

      ${r.skills ? `
        <div class="mb-3">
          <div class="text-xs text-muted mb-1" style="font-weight:700;letter-spacing:0.04em">SKILLS & QUALIFICATIONS</div>
          <div class="ops-skills-box">
            ${r.skills.split(',').map(s => `<span class="chip" style="font-size:0.8rem;padding:4px 12px">${escapeHtml(s.trim())}</span>`).join('')}
          </div>
        </div>
      ` : ''}

      ${r.address ? `
        <div class="mb-3" style="background:var(--bg-hover);padding:10px 14px;border-radius:8px">
          <div class="text-xs text-muted mb-1" style="font-weight:700;letter-spacing:0.04em">RESIDENTIAL ADDRESS</div>
          <p style="font-size:0.88rem;margin:0">${escapeHtml(r.address)}</p>
        </div>
      ` : ''}

      <!-- Compensation & Payout Info -->
      <div class="mb-3" style="background:var(--bg-hover);padding:14px;border-radius:10px;border:1px solid var(--border-subtle)">
        <div class="flex justify-between items-center mb-2">
          <div style="font-weight:700;font-size:0.92rem;display:flex;align-items:center;gap:6px">
            <span>💰 Compensation & Payouts</span>
          </div>
          ${auth.isLead() ? `
            <button type="button" class="btn btn-sm btn-secondary" onclick="openAddResourcePaymentModal(${r.id}, '${escapeHtml(r.name).replace(/'/g, "\\'")}', ${r.rate_amount || 0}, '${r.rate_type || 'per_day'}')" style="font-size:0.75rem;padding:3px 10px">
              + Log Payment
            </button>
          ` : ''}
        </div>

        <div class="grid-2 mb-2" style="gap:10px">
          <div style="background:var(--bg-card);padding:10px 12px;border-radius:6px;border:1px solid var(--border)">
            <div class="text-sm text-muted">Standard Compensation Rate</div>
            <div style="font-weight:700;font-size:1rem;color:var(--text-primary);margin-top:2px">
              ${r.rate_amount ? `₹${Number(r.rate_amount).toLocaleString('en-IN')} <span style="font-size:0.78rem;font-weight:500;color:var(--text-muted)">/ ${r.rate_type ? r.rate_type.replace('_', ' ') : 'day'}</span>` : '<span class="text-muted" style="font-size:0.85rem">Not configured</span>'}
            </div>
          </div>
          <div style="background:var(--bg-card);padding:10px 12px;border-radius:6px;border:1px solid var(--border)">
            <div class="text-sm text-muted">Payout / Bank / UPI Details</div>
            <div style="font-weight:600;font-size:0.88rem;color:var(--text-primary);margin-top:2px;font-family:var(--font-mono,monospace)">
              ${r.upi_id ? `📱 UPI: ${escapeHtml(r.upi_id)}` : ''}
              ${r.upi_id && r.bank_details ? '<br>' : ''}
              ${r.bank_details ? `🏦 ${escapeHtml(r.bank_details)}` : (!r.upi_id ? '<span class="text-muted" style="font-size:0.85rem">No payout details provided</span>' : '')}
            </div>
          </div>
        </div>

        <!-- Payment Records Table for this Resource -->
        <div style="font-weight:600;font-size:0.78rem;color:var(--text-muted);letter-spacing:0.04em;text-transform:uppercase;margin:10px 0 6px 0">
          Payment & Compensation History
        </div>
        ${r.payments && r.payments.length ? `
          <div class="table-wrapper" style="border:1px solid var(--border);border-radius:8px">
            <table>
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Rate / Units</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date / Ref</th>
                  ${auth.isLead() ? '<th>Action</th>' : ''}
                </tr>
              </thead>
              <tbody>
                ${r.payments.map(p => {
                  const isPaid = p.payment_status === 'paid';
                  const amt = Number(p.final_amount || p.calculated_amount || 0).toLocaleString('en-IN');
                  return `
                    <tr>
                      <td><strong>${escapeHtml(p.project_name)}</strong></td>
                      <td class="text-sm text-muted">₹${p.rate_amount} · ${p.payable_units || 1} ${p.rate_type ? p.rate_type.replace('_', ' ') : ''}</td>
                      <td style="font-weight:700;color:var(--text-primary)">₹${amt}</td>
                      <td>
                        <span class="badge ${isPaid ? 'badge-available' : 'badge-pending_approval'}" style="font-size:0.72rem">
                          ${isPaid ? 'Paid' : 'Pending'}
                        </span>
                      </td>
                      <td class="font-mono text-sm">
                        ${p.payment_date ? formatDate(p.payment_date) : '—'}
                        ${p.payment_reference ? `<div class="text-muted" style="font-size:0.72rem">${escapeHtml(p.payment_reference)}</div>` : ''}
                      </td>
                      ${auth.isLead() ? `
                        <td>
                          ${!isPaid ? `
                            <button type="button" class="btn btn-sm btn-primary" style="font-size:0.72rem;padding:2px 8px" onclick="quickMarkResourcePaymentPaid(${p.id}, ${r.id})">
                              Mark Paid
                            </button>
                          ` : '<span class="text-muted text-sm">✓ Settled</span>'}
                        </td>
                      ` : ''}
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        ` : '<p class="text-sm text-muted" style="margin:0;font-size:0.85rem">No payment records logged for this resource yet.</p>'}
      </div>

      ${r.notes ? `
        <div class="mb-3" style="background:var(--bg-hover);padding:12px;border-radius:8px">
          <div class="text-sm text-muted mb-1" style="font-weight:600">OPERATIONAL NOTES</div>
          <p style="font-size:0.9rem;margin:0;white-space:pre-wrap">${escapeHtml(r.notes)}</p>
        </div>
      ` : ''}

      <!-- Past Deployment History -->
      <div class="mb-3">
        <div class="text-sm text-muted mb-1" style="font-weight:600">PROJECT DEPLOYMENT HISTORY</div>
        ${r.assignment_history && r.assignment_history.length ? `
          <div class="table-wrapper" style="border:1px solid var(--border);border-radius:8px">
            <table>
              <thead>
                <tr><th>Project</th><th>Deployed</th><th>Released</th><th>Status</th></tr>
              </thead>
              <tbody>
                ${r.assignment_history.map(h => `
                  <tr>
                    <td><strong>${escapeHtml(h.project_name)}</strong></td>
                    <td class="font-mono text-sm">${formatDate(h.assigned_on)}</td>
                    <td class="font-mono text-sm">${h.unassigned_on ? formatDate(h.unassigned_on) : '—'}</td>
                    <td>${h.unassigned_on ? '<span style="font-size:0.72rem;background:#e2fae8;color:#1a7a3a;padding:2px 8px;border-radius:4px;font-weight:600">Completed</span>' : '<span style="font-size:0.72rem;background:#fff3e0;color:#b76e00;padding:2px 8px;border-radius:4px;font-weight:600">Active</span>'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : '<p class="text-sm text-muted">No historical deployments recorded.</p>'}
      </div>

      <!-- Action Footer -->
      ${(auth.can('edit_resources') || auth.can('edit_assignments')) ? `
      <div class="flex justify-between items-center" style="border-top:1px solid var(--border);padding-top:16px">
        ${auth.can('edit_resources') ? `<button class="btn btn-secondary" onclick="closeModal('detail-modal');openResourceModal(${r.id})">Edit Profile</button>` : '<div></div>'}
        <div class="flex gap-2">
          ${auth.can('edit_resources') ? `
            <button class="btn btn-secondary" onclick="closeModal('detail-modal');openResourceModal(${r.id})">Edit</button>
            <button class="btn btn-danger" onclick="closeModal('detail-modal');deleteResourceConfirm(${r.id}, '${escapeHtml(r.name).replace(/'/g, "\\'")}')">Delete</button>
          ` : ''}
          ${auth.can('edit_assignments') ? (isAvail ? `
            <button class="btn btn-primary" onclick="closeModal('detail-modal');openAssignModal(${r.id})">Deploy to Project</button>
          ` : isDeployed ? `
            <button class="btn btn-secondary" onclick="closeModal('detail-modal');openReassignModal(${r.id})">Reassign</button>
            <button class="btn btn-danger" onclick="closeModal('detail-modal');quickReleaseWorker(${r.id}, '${escapeHtml(r.name)}', '${escapeHtml(r.current_project_name || '')}')">
              Release
            </button>
          ` : '') : ''}
        </div>
      </div>` : ''}
    `;

    $('#detail-modal .modal-title').textContent = 'Resource Profile';
    showModal('detail-modal');
  } catch (err) {
    toast(err.message, 'error');
  }
}

// Project Details & Team Drilldown
async function viewProject(id) {
  try {
    const { data: p } = await api(`/projects/${id}`);

    const allStaff = p.all_project_staff || p.assignment_history || [];
    const activeStaff = p.assigned || [];

    $('#detail-modal-body').innerHTML = `
      <div class="flex justify-between items-start mb-3" style="border-bottom:1px solid var(--border);padding-bottom:16px">
        <div style="min-width:0;flex:1">
          <h3 style="font-size:1.3rem;font-weight:700;margin:0">${escapeHtml(p.name)}</h3>
          <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:12px;font-size:0.82rem;color:var(--text-muted)">
            <span><strong style="color:var(--text-primary)">${escapeHtml(p.client_name || 'Client')}</strong></span>
            <span>${escapeHtml(p.location || 'Location TBD')}</span>
            <span>Lead: <strong>${escapeHtml(p.manager_name || 'Unassigned')}</strong></span>
            ${p.start_date ? `<span>${formatDate(p.start_date)} — ${formatDate(p.end_date)}</span>` : ''}
          </div>
        </div>
        <div class="flex items-center gap-2" style="flex-shrink:0">
          ${badge(p.status)}
          <button class="btn btn-sm btn-secondary" onclick="exportProjectPDF(${p.id})" title="Export PDF Report" style="font-size:0.78rem;padding:5px 12px">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;vertical-align:middle"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
            PDF
          </button>
        </div>
      </div>

      <!-- Staffing Requirements vs Deployed Progress -->
      <div class="mb-3">
        <div class="flex justify-between items-center mb-1">
          <div class="text-sm text-muted" style="font-weight:600">RESOURCE REQUIREMENTS STATUS</div>
          ${auth.can('edit_assignments') ? `<button class="btn btn-sm btn-primary" onclick="closeModal('detail-modal');openAssignModal(null, ${p.id})">+ Allocate Resources</button>` : ''}
        </div>
        <div class="table-wrapper" style="border:1px solid var(--border);border-radius:8px">
          <table>
            <thead>
              <tr><th>Role / Category</th><th>Required</th><th>Deployed</th><th>Status / Deficit</th></tr>
            </thead>
            <tbody>
              ${p.requirements && p.requirements.length ? p.requirements.map(r => `
                <tr>
                  <td><strong>${r.category}</strong></td>
                  <td>${r.required}</td>
                  <td><strong style="color:var(--accent)">${r.assigned}</strong></td>
                  <td>
                    ${r.gap > 0 ? `<span class="gap-badge gap-crit">-${r.gap} needed</span>` : `<span class="gap-badge gap-ok">✔ Fulfilled</span>`}
                  </td>
                </tr>
              `).join('') : '<tr><td colspan="4" class="text-muted text-sm" style="text-align:center;padding:12px">No specific resource requirements configured.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <!-- All Project Resources (Active + Historical) -->
      <div class="mb-3">
        <div class="flex justify-between items-center mb-2">
          <div class="text-sm text-muted" style="font-weight:600">PROJECT RESOURCES (${allStaff.length} total)</div>
          ${auth.can('edit_assignments') && p.status !== 'completed' && p.status !== 'cancelled' ? `
            <button class="btn btn-sm btn-primary" onclick="closeModal('detail-modal');openAssignModal(null, ${p.id})" style="font-size:0.78rem">+ Allocate Resources</button>
          ` : ''}
        </div>
        ${allStaff.length ? `
          <div class="table-wrapper" style="border:1px solid var(--border);border-radius:8px">
            <table>
              <thead>
                <tr>
                  <th>Resource ID</th>
                  <th>Resource</th>
                  <th>Role</th>
                  <th>Contact</th>
                  <th>Deployed</th>
                  <th>Released</th>
                  <th>Status</th>
                  ${auth.can('edit_assignments') ? '<th></th>' : ''}
                </tr>
              </thead>
              <tbody>
                ${allStaff.map(a => {
                  const isActive = !a.unassigned_on;
                  return `
                  <tr>
                    <td style="font-family:var(--font-mono,monospace);font-size:0.78rem;color:var(--text-muted)">${escapeHtml(a.staff_id || '—')}</td>
                    <td><strong>${escapeHtml(a.name || a.resource_name || '—')}</strong></td>
                    <td><span style="font-size:0.75rem;background:var(--bg-hover);padding:2px 8px;border-radius:4px">${escapeHtml(a.category || '—')}</span></td>
                    <td style="font-size:0.82rem;color:var(--text-muted)">${escapeHtml(a.contact_info || '—')}</td>
                    <td style="font-size:0.8rem">${formatDate(a.assigned_on)}</td>
                    <td style="font-size:0.8rem">${a.unassigned_on ? formatDate(a.unassigned_on) : '—'}</td>
                    <td>${isActive ? '<span style="font-size:0.72rem;background:#fff3e0;color:#b76e00;padding:2px 8px;border-radius:4px;font-weight:600">Active</span>' : '<span style="font-size:0.72rem;background:#e2fae8;color:#1a7a3a;padding:2px 8px;border-radius:4px;font-weight:600">Completed</span>'}</td>
                    ${auth.can('edit_assignments') ? `
                    <td>${isActive ? `<button class="btn btn-sm btn-danger" style="font-size:0.75rem;padding:3px 10px" onclick="closeModal('detail-modal');quickReleaseWorker(${a.resource_id || a.id}, '${escapeHtml(a.name || a.resource_name || '')}', '${escapeHtml(p.name)}')">
                        Release
                      </button>` : ''}
                    </td>` : ''}
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        ` : '<p class="text-sm text-muted" style="padding:12px;background:var(--bg-hover);border-radius:8px">No resources have been deployed on this project yet.</p>'}
      </div>
    `;

    $('#detail-modal .modal-title').textContent = 'Project Operations Overview';
    showModal('detail-modal');
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════════
// 9. MODALS: RESOURCE, PROJECT, MANAGER, CLIENT CRUD
// ═══════════════════════════════════════════════════════════════

// Resource Modal (Create / Edit)
async function openResourceModal(id = null) {
  if (!auth.can('edit_resources')) {
    toast('Access restricted. You do not have permission to add or edit resources.', 'error');
    return;
  }
  state.editTarget = id;
  const isEdit = !!id;
  let r = {};

  if (isEdit) {
    const res = await api(`/resources/${id}`);
    r = res.data;
  }

  $('#resource-form').innerHTML = `
    ${isEdit && r.staff_id ? `
    <div class="form-group" style="margin-bottom:12px">
      <label style="font-size:0.78rem;font-weight:600;color:var(--text-muted);letter-spacing:0.05em">STAFF ID</label>
      <div style="font-family:var(--font-mono,monospace);font-size:0.95rem;background:var(--bg-hover);padding:8px 12px;border-radius:6px;border:1px solid var(--border-subtle);color:var(--text-primary);letter-spacing:0.06em">${escapeHtml(r.staff_id)}</div>
    </div>
    ` : ''}

    <div class="modal-section-title" style="font-size:0.8rem;font-weight:700;letter-spacing:0.05em;color:var(--text-muted);text-transform:uppercase;margin-bottom:8px">1. Personal & Physical Information</div>

    <div class="form-row">
      <div class="form-group">
        <label>Full Legal Name *</label>
        <input type="text" id="r-name" value="${escapeHtml(r.name || '')}" placeholder="e.g. Purva Gupta">
      </div>
      <div class="form-group">
        <label>Age (Years)</label>
        <input type="number" id="r-age" value="${r.age != null ? r.age : (r.dob ? calculateAge(r.dob) : '')}" placeholder="e.g. 21" min="14" max="99">
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Gender</label>
        <select id="r-gender">
          <option value="">Select Gender</option>
          <option value="male" ${r.gender === 'male' ? 'selected' : ''}>Male</option>
          <option value="female" ${r.gender === 'female' ? 'selected' : ''}>Female</option>
          <option value="other" ${r.gender === 'other' ? 'selected' : ''}>Other</option>
        </select>
      </div>
      <div class="form-group">
        <label>Height (in cm or ft/inches)</label>
        <input type="text" id="r-height" value="${escapeHtml(r.height || '')}" placeholder="e.g. 5.6 ft or 177 cm">
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Date of Birth (Optional)</label>
        <input type="date" id="r-dob" value="${r.dob ? String(r.dob).split('T')[0] : ''}">
      </div>
      <div class="form-group">
        <label>Profile Photo (URL or Google Drive link)</label>
        <input type="text" id="r-photo" value="${escapeHtml(r.photo_path || '')}" placeholder="e.g. https://drive.google.com/open?id=...">
      </div>
    </div>

    <div class="modal-section-title" style="font-size:0.8rem;font-weight:700;letter-spacing:0.05em;color:var(--text-muted);text-transform:uppercase;margin:16px 0 8px 0">2. Contact & Location</div>

    <div class="form-row">
      <div class="form-group">
        <label>WhatsApp Number *</label>
        <input type="text" id="r-contact" value="${escapeHtml(r.contact_info || '')}" placeholder="e.g. 9811223344">
      </div>
      <div class="form-group">
        <label>Alternate Emergency Contact Number</label>
        <input type="text" id="r-alt-contact" value="${escapeHtml(r.alternate_phone || '')}" placeholder="e.g. 9075252606">
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Email Address</label>
        <input type="email" id="r-email" value="${escapeHtml(r.email || '')}" placeholder="e.g. name@gmail.com">
      </div>
      <div class="form-group">
        <label>Area of Residence (Pune Zone)</label>
        <input type="text" id="r-zone" list="pune-zones-list" value="${escapeHtml(r.zone || '')}" placeholder="e.g. Pimpri-Chinchwad (PCMC) / Nigdi">
        <datalist id="pune-zones-list">
          <option value="Pimpri-Chinchwad (PCMC) / Nigdi">
          <option value="Camp / Swargate / Deccan / SB Road">
          <option value="Viman Nagar / Kalyani Nagar / Kharadi">
          <option value="Wakad / Hinjawadi / Baner / Aundh">
          <option value="Other">
        </datalist>
      </div>
    </div>

    <div class="form-group">
      <label>Full Residential Address (Optional)</label>
      <input type="text" id="r-address" value="${escapeHtml(r.address || '')}" placeholder="e.g. Flat 402, Green Avenue, Wakad, Pune">
    </div>

    <div class="modal-section-title" style="font-size:0.8rem;font-weight:700;letter-spacing:0.05em;color:var(--text-muted);text-transform:uppercase;margin:16px 0 8px 0">3. Roles, Availability & Supervision</div>

    <div class="form-row">
      <div class="form-group">
        <label>Primary Category / Role *</label>
        <select id="r-category">
          <option value="">Select Category</option>
          ${state.categories.map(c => `<option value="${c.id}" ${r.category_id === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Operations Lead / Squad Manager</label>
        <select id="r-manager">
          <option value="">Select Manager</option>
          ${state.managers.map(m => `<option value="${m.id}" ${r.reporting_manager_id === m.id ? 'selected' : ''}>${m.name}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="form-group">
      <label>Opted Roles (Preferred roles / choices)</label>
      <input type="text" id="r-opted-roles" value="${escapeHtml(r.opted_roles || '')}" placeholder="e.g. Volunteer / Crowd Facilitation, Host / Emcee, Production & Logistics">
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Languages Confidently Spoken On-Ground</label>
        <input type="text" id="r-languages" value="${escapeHtml(r.languages || '')}" placeholder="e.g. Marathi, Hindi, English">
      </div>
      <div class="form-group">
        <label>Weekend Availability</label>
        <input type="text" id="r-availability" list="crew-avail-list" value="${escapeHtml(r.availability || '')}" placeholder="e.g. Weekdays + Weekends">
        <datalist id="crew-avail-list">
          <option value="Weekdays + Weekends">
          <option value="Always available on weekends (Fri–Sun)">
          <option value="Available on select weekends (advance notice needed)">
          <option value="College student (flexible based on exam calendar)">
          <option value="Weekdays only">
        </datalist>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Current Status</label>
        <select id="r-status">
          <option value="available" ${r.status === 'available' ? 'selected' : ''}>Available</option>
          <option value="nominated" ${r.status === 'nominated' ? 'selected' : ''}>Nominated</option>
          <option value="pending_approval" ${r.status === 'pending_approval' ? 'selected' : ''}>Pending Approval</option>
          <option value="confirmed" ${r.status === 'confirmed' ? 'selected' : ''}>Confirmed</option>
          <option value="deployed" ${(r.status === 'deployed' || r.status === 'assigned') ? 'selected' : ''}>Deployed</option>
          <option value="released" ${r.status === 'released' ? 'selected' : ''}>Released</option>
          <option value="on_leave" ${r.status === 'on_leave' ? 'selected' : ''}>On Leave</option>
          <option value="unavailable" ${r.status === 'unavailable' ? 'selected' : ''}>Unavailable</option>
        </select>
      </div>
      <div class="form-group">
        <label>Skills & Special Qualifications</label>
        <input type="text" id="r-skills" value="${escapeHtml(r.skills || '')}" placeholder="e.g. Crowd control, QR check-in, Mic handling">
      </div>
    </div>

    <div class="form-group">
      <label>Past Event Experience (If any)</label>
      <textarea id="r-experience" rows="2" placeholder="e.g. Volunteer at Pune Festival, registration desk, college fest head...">${escapeHtml(r.experience || '')}</textarea>
    </div>

    <div class="modal-section-title" style="font-size:0.8rem;font-weight:700;letter-spacing:0.05em;color:var(--text-muted);text-transform:uppercase;margin:16px 0 8px 0">4. Identification & Compliance</div>

    <div class="form-row">
      <div class="form-group">
        <label>ID Document Type</label>
        <input type="text" id="r-id-type" value="${escapeHtml(r.id_type || '')}" placeholder="e.g. Aadhaar, Passport, College ID">
      </div>
      <div class="form-group">
        <label>ID Number</label>
        <input type="text" id="r-id-number" value="${escapeHtml(r.id_number || '')}" placeholder="e.g. 1234-5678-9012">
      </div>
    </div>

    <div class="modal-section-title" style="font-size:0.8rem;font-weight:700;letter-spacing:0.05em;color:var(--text-muted);text-transform:uppercase;margin:16px 0 8px 0">5. Compensation & Payout Settings</div>

    <div class="form-row">
      <div class="form-group">
        <label>Pay Rate Type</label>
        <select id="r-rate-type">
          <option value="per_day" ${r.rate_type === 'per_day' ? 'selected' : ''}>Per Day (Daily Rate)</option>
          <option value="per_shift" ${r.rate_type === 'per_shift' ? 'selected' : ''}>Per Shift</option>
          <option value="per_hour" ${r.rate_type === 'per_hour' ? 'selected' : ''}>Per Hour</option>
          <option value="fixed" ${r.rate_type === 'fixed' ? 'selected' : ''}>Fixed Project Rate</option>
        </select>
      </div>
      <div class="form-group">
        <label>Standard Rate (₹)</label>
        <input type="number" id="r-rate-amount" value="${r.rate_amount != null ? r.rate_amount : ''}" placeholder="e.g. 1200" min="0" step="50">
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Bank Account / IFSC Details</label>
        <input type="text" id="r-bank-details" value="${escapeHtml(r.bank_details || '')}" placeholder="e.g. HDFC Bank - A/C 50100..., IFSC HDFC0001234">
      </div>
      <div class="form-group">
        <label>UPI ID (for fast payouts)</label>
        <input type="text" id="r-upi-id" value="${escapeHtml(r.upi_id || '')}" placeholder="e.g. 9811223344@upi or worker@okaxis">
      </div>
    </div>

    <div class="form-group">
      <label>DV Crew Commitment & Operational Notes</label>
      <textarea id="r-notes" rows="2" placeholder="e.g. I agree to the DV Honor Code... Notes on gear, uniform, diet...">${escapeHtml(r.notes || '')}</textarea>
    </div>
  `;

  $('#resource-save').onclick = async () => {
    const ageVal = $('#r-age').value.trim();
    const payload = {
      name: $('#r-name').value.trim(),
      dob: $('#r-dob').value || null,
      age: ageVal !== '' ? parseInt(ageVal, 10) : null,
      gender: $('#r-gender').value || null,
      height: $('#r-height').value.trim() || null,
      contact_info: $('#r-contact').value.trim(),
      alternate_phone: $('#r-alt-contact').value.trim() || null,
      email: $('#r-email').value.trim() || null,
      zone: $('#r-zone').value.trim() || null,
      photo_path: $('#r-photo').value.trim() ? convertGoogleDriveUrl($('#r-photo').value.trim()) : null,
      address: $('#r-address').value.trim() || null,
      category_id: $('#r-category').value,
      opted_roles: $('#r-opted-roles').value.trim() || null,
      languages: $('#r-languages').value.trim() || null,
      availability: $('#r-availability').value.trim() || null,
      experience: $('#r-experience').value.trim() || null,
      status: $('#r-status').value,
      reporting_manager_id: $('#r-manager').value || null,
      skills: $('#r-skills').value.trim() || null,
      id_type: $('#r-id-type').value.trim() || null,
      id_number: $('#r-id-number').value.trim() || null,
      rate_type: $('#r-rate-type').value,
      rate_amount: $('#r-rate-amount').value !== '' ? Number($('#r-rate-amount').value) : null,
      bank_details: $('#r-bank-details').value.trim() || null,
      upi_id: $('#r-upi-id').value.trim() || null,
      notes: $('#r-notes').value.trim() || null
    };
    if (!payload.name || !payload.contact_info || !payload.category_id) {
      toast('Name, contact info, and category are required', 'error');
      return;
    }
    try {
      if (isEdit) {
        await api(`/resources/${id}`, 'PUT', payload);
        toast('Resource updated', 'success');
      } else {
        await api('/resources', 'POST', payload);
        toast('Resource added to roster', 'success');
      }
      closeModal('resource-modal');
      loadResources();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  $('#resource-modal .modal-title').textContent = isEdit ? 'Edit Resource' : 'Add New Resource';
  showModal('resource-modal');
}

// ─── Dedicated Project Form Page (Create / Edit) ───────────────────
function openProjectModal(id = null, preselectedClientId = null) {
  openProjectFormPage(id, preselectedClientId);
}

function calcTotalProjectRequirements() {
  let total = 0;
  $$('.pf-req-input').forEach(input => {
    total += parseInt(input.value, 10) || 0;
  });
  const badge = $('#pf-total-manpower-badge');
  if (badge) {
    badge.textContent = `Total Required: ${total} Resources`;
  }
}

async function openProjectFormPage(id = null, preselectedClientId = null) {
  if (!auth.can('edit_projects')) {
    toast('Access restricted: You do not have permission to create or edit projects.', 'error');
    return;
  }

  // Ensure clients & categories are cached
  if (!state.clients || !state.clients.length) {
    try {
      const { data } = await api('/clients');
      state.clients = data;
    } catch { state.clients = []; }
  }
  if (!state.categories || !state.categories.length) {
    try {
      const { data } = await api('/dashboard/categories');
      state.categories = data;
    } catch { state.categories = []; }
  }

  const isEdit = !!id;
  let p = {};

  if (isEdit) {
    try {
      const res = await api(`/projects/${id}`);
      p = res.data;
    } catch (err) {
      toast(err.message, 'error');
      return;
    }
  }

  const container = $('#page-project-form');
  if (!container) return;

  const clients = state.clients || [];
  const categories = state.categories || [];

  container.innerHTML = `
    <div class="user-page-topbar" style="align-items:flex-start;max-width:980px;margin:0 auto 16px auto">
      <div class="user-page-title-group" style="display:flex;flex-direction:column;align-items:flex-start;gap:12px">
        <button type="button" class="btn btn-secondary btn-sm" onclick="navigate('projects')" style="display:inline-flex;align-items:center;gap:6px">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
          Back to Projects
        </button>
        <div>
          <h2 class="user-page-heading-title" style="margin:0 0 4px 0">${isEdit ? `Edit Project — ${escapeHtml(p.name)}` : 'Create New Project'}</h2>
          <p class="user-page-heading-sub" style="margin:0">${isEdit ? 'Update project parameters, resource quotas, and client liaison details.' : 'Define event dates, location, POC contact details, and resource requirements.'}</p>
        </div>
      </div>
      <div class="user-page-actions" style="margin-top:2px">
        <button type="button" class="btn btn-secondary" onclick="navigate('projects')">Cancel</button>
      </div>
    </div>

    <div class="user-form-page-body" style="padding-top:16px">
      <div class="project-form-wrap">
        <!-- Section 1: Event & Client Overview -->
        <div class="project-form-section">
          <div class="project-form-section-head">
            <h3 class="project-form-section-title">Event &amp; Client Overview</h3>
            <p class="project-form-section-desc">Event identification, venue location, status, and production dates.</p>
          </div>

          <div class="project-form-grid">
            <div class="form-group">
              <label for="pf-name">Project / Event Name *</label>
              <input type="text" id="pf-name" class="form-input" placeholder="e.g. Mercedes-Benz Gala Showcase" value="${escapeHtml(p.name || '')}" required>
            </div>

            <div class="form-group">
              <label for="pf-client">Corporate Client *</label>
              <select id="pf-client" class="form-input" required>
                <option value="">— Select Client —</option>
                ${clients.map(c => `
                  <option value="${c.id}" ${(p.client_id === c.id || (!isEdit && String(c.id) === String(preselectedClientId))) ? 'selected' : ''}>${escapeHtml(c.name)}</option>
                `).join('')}
              </select>
            </div>

            <div class="form-group">
              <label for="pf-location">Location / Venue</label>
              <input type="text" id="pf-location" class="form-input" placeholder="e.g. Grand Hyatt Ballroom, New Delhi" value="${escapeHtml(p.location || '')}">
            </div>

            <div class="form-group">
              <label for="pf-status">Project Status</label>
              <select id="pf-status" class="form-input">
                <option value="planned" ${p.status === 'planned' || !isEdit ? 'selected' : ''}>Planned</option>
                <option value="active" ${p.status === 'active' ? 'selected' : ''}>Active</option>
                <option value="completed" ${p.status === 'completed' ? 'selected' : ''}>Completed</option>
                <option value="cancelled" ${p.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
              </select>
            </div>

            <div class="form-group">
              <label for="pf-start-date">Event Start Date</label>
              <input type="date" id="pf-start-date" class="form-input" value="${p.start_date ? p.start_date.split('T')[0] : ''}">
            </div>

            <div class="form-group">
              <label for="pf-end-date">Event End Date</label>
              <input type="date" id="pf-end-date" class="form-input" value="${p.end_date ? p.end_date.split('T')[0] : ''}">
            </div>

            <div class="form-group">
              <label>Event Shift Hours (Optional)</label>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <input type="time" id="pf-start-time" class="form-input" value="${p.start_time || ''}" title="Shift Start Time">
                <input type="time" id="pf-end-time" class="form-input" value="${p.end_time || ''}" title="Shift End Time">
              </div>
            </div>

            <div class="form-group">
              <label for="pf-deadline">Nomination &amp; Confirmation Deadline</label>
              <input type="date" id="pf-deadline" class="form-input" value="${p.deadline ? p.deadline.split('T')[0] : ''}">
            </div>
          </div>
        </div>

        <!-- Section 2: Point of Contact (POC) Details -->
        <div class="project-form-section">
          <div class="project-form-section-head">
            <h3 class="project-form-section-title">Point of Contact (POC) Details</h3>
            <p class="project-form-section-desc">Client liaison or on-site event coordinator contact details.</p>
          </div>

          <div class="project-form-grid">
            <div class="form-group">
              <label for="pf-poc-name">POC Full Name</label>
              <input type="text" id="pf-poc-name" class="form-input" placeholder="e.g. Sameer Kapoor" value="${escapeHtml(p.poc_name || '')}">
            </div>

            <div class="form-group">
              <label for="pf-poc-phone">POC Phone Number</label>
              <input type="tel" id="pf-poc-phone" class="form-input" placeholder="e.g. +91 98765 43210" value="${escapeHtml(p.poc_phone || '')}">
            </div>

            <div class="form-group" style="grid-column: 1 / -1">
              <label for="pf-poc-email">POC Email Address</label>
              <input type="email" id="pf-poc-email" class="form-input" placeholder="e.g. sameer.kapoor@client.com" value="${escapeHtml(p.poc_email || '')}">
            </div>
          </div>
        </div>

        <!-- Section 3: Resource Quotas & Requirements -->
        <div class="project-form-section">
          <div class="project-form-section-head" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
            <div>
              <h3 class="project-form-section-title">Resource Requirements &amp; Quotas</h3>
              <p class="project-form-section-desc">Specify headcount needed per category to track operational resource deficits.</p>
            </div>
            <div>
              <span class="badge badge-deployed" id="pf-total-manpower-badge" style="font-size:0.85rem;padding:6px 14px;font-weight:700">
                Total Required: 0 Resources
              </span>
            </div>
          </div>

          <div class="project-req-grid">
            ${categories.map(c => {
              const existing = p.requirements ? p.requirements.find(r => r.category_id === c.id) : null;
              const count = existing ? (existing.required || existing.quantity_required || 0) : 0;
              return `
                <div class="project-req-card">
                  <div>
                    <div style="font-weight:600;font-size:0.88rem;color:var(--text-primary)">${escapeHtml(c.name)}</div>
                    <div class="text-muted" style="font-size:0.75rem">Target headcount</div>
                  </div>
                  <input 
                    type="number" 
                    class="form-input pf-req-input" 
                    id="pf-req-${c.id}" 
                    data-cat-id="${c.id}"
                    min="0" 
                    max="999" 
                    value="${count}" 
                    oninput="calcTotalProjectRequirements()"
                    style="width:84px;height:40px;text-align:center;font-weight:700;font-size:0.95rem"
                  >
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Section 4: Event Notes & Instructions -->
        <div class="project-form-section">
          <div class="project-form-section-head">
            <h3 class="project-form-section-title">Event Notes &amp; Special Instructions</h3>
            <p class="project-form-section-desc">Enter special dress code, call times, catering details, or venue instructions.</p>
          </div>

          <div class="form-group" style="margin-bottom:0">
            <textarea id="pf-notes" class="form-input" rows="3" placeholder="Enter special dress code, call times, catering details, or venue instructions...">${escapeHtml(p.notes || '')}</textarea>
          </div>
        </div>

        <!-- Action Footer: Save / Create button at bottom right -->
        <div class="user-form-page-footer">
          <button type="button" class="btn btn-primary" onclick="submitProjectForm(${isEdit ? p.id : 'null'})" style="padding:12px 36px;font-size:0.95rem;font-weight:600">
            ${isEdit ? 'Save Changes' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  `;

  calcTotalProjectRequirements();
  navigate('project-form');
}

async function submitProjectForm(id = null) {
  const name       = $('#pf-name')?.value.trim();
  const client_id  = $('#pf-client')?.value;
  const location   = $('#pf-location')?.value.trim();
  const status     = $('#pf-status')?.value || 'planned';
  const start_date = $('#pf-start-date')?.value || null;
  const end_date   = $('#pf-end-date')?.value || null;
  const start_time = $('#pf-start-time')?.value || null;
  const end_time   = $('#pf-end-time')?.value || null;
  const deadline   = $('#pf-deadline')?.value || null;
  const poc_name   = $('#pf-poc-name')?.value.trim() || null;
  const poc_phone  = $('#pf-poc-phone')?.value.trim() || null;
  const poc_email  = $('#pf-poc-email')?.value.trim() || null;
  const notes      = $('#pf-notes')?.value.trim() || null;

  if (!name || !client_id) {
    toast('Project name and corporate client are required.', 'error');
    return;
  }

  const requirements = [];
  $$('.pf-req-input').forEach(input => {
    const catId = input.dataset.catId;
    const qty = parseInt(input.value, 10) || 0;
    if (catId && qty > 0) {
      requirements.push({ category_id: parseInt(catId, 10), quantity_required: qty });
    }
  });

  const payload = {
    name,
    client_id: parseInt(client_id, 10),
    location: location || null,
    status,
    start_date,
    end_date,
    start_time,
    end_time,
    deadline,
    poc_name,
    poc_phone,
    poc_email,
    notes,
    project_manager_id: null, // No manager assignment needed
    requirements
  };

  try {
    if (id) {
      await api(`/projects/${id}`, 'PUT', payload);
      toast('Project updated successfully.', 'success');
    } else {
      await api('/projects', 'POST', payload);
      toast('Project created successfully.', 'success');
    }
    navigate('projects');
  } catch (err) {
    toast(err.message, 'error');
  }
}

// Manager Modal
async function openManagerModal(id = null) {
  if (!auth.can('edit_managers')) {
    toast('Access restricted: You do not have permission to add or edit managers.', 'error');
    return;
  }
  state.editTarget = id;
  const isEdit = !!id;
  let m = {};
  if (isEdit) {
    const res = await api(`/managers/${id}`);
    m = res.data;
  }

  $('#manager-form').innerHTML = `
    <div class="form-group">
      <label>Manager Name *</label>
      <input type="text" id="m-name" value="${m.name || ''}" placeholder="e.g. Vikram Rathore">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Contact Phone / Email *</label>
        <input type="text" id="m-contact" value="${m.contact || ''}" placeholder="e.g. 9811002233">
      </div>
      <div class="form-group">
        <label>Role</label>
        <input type="text" id="m-role" value="${m.role || 'Operations Manager'}" placeholder="Operations Manager">
      </div>
    </div>
  `;

  $('#manager-save').onclick = async () => {
    const payload = {
      name: $('#m-name').value.trim(),
      contact: $('#m-contact').value.trim(),
      role: $('#m-role').value.trim()
    };
    if (!payload.name) {
      toast('Name is required', 'error');
      return;
    }
    try {
      if (isEdit) {
        await api(`/managers/${id}`, 'PUT', payload);
        toast('Manager updated', 'success');
      } else {
        await api('/managers', 'POST', payload);
        toast('Manager added', 'success');
      }
      closeModal('manager-modal');
      loadManagers();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  showModal('manager-modal');
}

// Client Modal
async function openClientModal(id = null) {
  if (!auth.can('edit_clients')) {
    toast('Access restricted: You do not have permission to add or edit clients.', 'error');
    return;
  }
  state.editTarget = id;
  const isEdit = !!id;
  let c = {};
  if (isEdit) {
    const res = await api(`/clients/${id}`);
    c = res.data;
  }

  $('#client-form').innerHTML = `
    <div class="form-group">
      <label>Client Name *</label>
      <input type="text" id="c-name" value="${c.name || ''}" placeholder="e.g. ITC Hotels Ltd">
    </div>
    <div class="form-group">
      <label>Contact Information</label>
      <input type="text" id="c-contact" value="${c.contact_info || ''}" placeholder="e.g. events@itchotels.in">
    </div>
  `;

  $('#client-save').onclick = async () => {
    const payload = {
      name: $('#c-name').value.trim(),
      contact_info: $('#c-contact').value.trim()
    };
    if (!payload.name) {
      toast('Client name is required', 'error');
      return;
    }
    try {
      if (isEdit) {
        await api(`/clients/${id}`, 'PUT', payload);
        toast('Client updated', 'success');
      } else {
        await api('/clients', 'POST', payload);
        toast('Client added', 'success');
      }
      closeModal('client-modal');
      loadClients();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  showModal('client-modal');
}

// Category Availability Page (Retained for completeness)
async function loadAvailability() {
  const content = $('#page-availability');
  content.innerHTML = loadingHTML();
  try {
    const { data } = await api('/resources/availability');
    content.innerHTML = `
      <div class="mb-3">
        <h3 style="font-weight:700;margin-bottom:6px">🟢 Live Resource Availability by Category</h3>
        <p class="text-muted text-sm">Real-time availability calculated from active deployment records.</p>
      </div>
      <div class="category-matrix mb-3">
        ${data.map(c => `
          <div class="cat-card" onclick="filterCategoryAndGo(${c.category_id})">
            <div class="cat-title">${c.category}</div>
            <div class="cat-counts">
              <span class="cat-avail-pill">${c.available} Avail</span>
              <span class="text-sm font-mono text-muted">${c.assigned} asgn / ${c.total} tot</span>
            </div>
            <div style="margin-top:8px">${progressBar(c.assigned, c.total)}</div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    content.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><p>${err.message}</p></div>`;
  }
}

// ─── Modal Helpers ────────────────────────────────────────────
function showModal(id) {
  $(`#${id}`)?.classList.add('visible');
}

function closeModal(id) {
  $(`#${id}`)?.classList.remove('visible');
}

// ════════════════════════════════════════════════════════════════
// AUTH — Login / Logout / Session
// ════════════════════════════════════════════════════════════════

function showLoginScreen() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app-shell').style.display = 'none';
}

function showAppShell(user) {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-shell').style.display = '';

  const initials = getInitials(user.name);
  const roleColors = { super_admin: '#7c3aed', lead: '#7c3aed', manager: '#4f46e5' };
  const userBg = roleColors[user.role] || '#4f46e5';

  // Update topbar avatar and name
  const topbarAvatar = document.getElementById('topbar-avatar');
  const topbarName   = document.getElementById('topbar-user-name');
  if (topbarAvatar) {
    topbarAvatar.textContent = initials;
    topbarAvatar.style.background = userBg;
  }
  if (topbarName) {
    topbarName.textContent = user.name;
  }

  // Update profile popup details
  const popupAvatar   = document.getElementById('popup-avatar');
  const popupName     = document.getElementById('popup-user-name');
  const popupEmail    = document.getElementById('popup-user-email');
  const popupRole     = document.getElementById('popup-user-role');
  const popupAdminBtn = document.getElementById('popup-admin-btn');
  const popupMgrBtn   = document.getElementById('popup-manager-btn');

  if (popupAvatar) {
    popupAvatar.textContent = initials;
    popupAvatar.style.background = userBg;
  }
  if (popupName) popupName.textContent = user.name;
  if (popupEmail) popupEmail.textContent = user.email || '';
  if (popupRole) {
    const roleLabels = {
      super_admin: '👑 Lead',
      lead: '👑 Lead',
      manager: '👔 Operations Manager'
    };
    popupRole.textContent = roleLabels[user.role] || user.role;
    popupRole.className = `role-badge ${user.role}`;
  }
  const canManageUsers = user.role === 'super_admin' || auth.can('manage_users');
  if (popupAdminBtn) {
    popupAdminBtn.style.display = canManageUsers ? 'flex' : 'none';
  }
  if (popupMgrBtn) {
    popupMgrBtn.style.display = user.role === 'manager' ? 'flex' : 'none';
  }

  // Show admin nav section if super_admin or manage_users
  const adminSection = document.getElementById('admin-nav-section');
  if (adminSection) adminSection.style.display = canManageUsers ? 'block' : 'none';

  // Hide/dim nav items based on permissions
  applyNavPermissions(user);
}

// ════════════════════════════════════════════════════════════════
// PROFILE POPUP / DROPDOWN
// ════════════════════════════════════════════════════════════════

function toggleProfilePopup(e) {
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }
  const popup = document.getElementById('profile-popup');
  if (!popup) return;
  const isVisible = popup.style.display === 'block';
  if (isVisible) {
    closeProfilePopup();
  } else {
    openProfilePopup();
  }
}

function openProfilePopup() {
  const popup = document.getElementById('profile-popup');
  const trigger = document.getElementById('topbar-avatar-btn');
  if (!popup) return;
  popup.style.display = 'block';
  if (trigger) {
    trigger.classList.add('active');
    trigger.setAttribute('aria-expanded', 'true');
  }
}

function closeProfilePopup() {
  const popup = document.getElementById('profile-popup');
  const trigger = document.getElementById('topbar-avatar-btn');
  if (popup) popup.style.display = 'none';
  if (trigger) {
    trigger.classList.remove('active');
    trigger.setAttribute('aria-expanded', 'false');
  }
}

function navigateToUsersFromPopup() {
  closeProfilePopup();
  navigate('users');
}

function navigateToMyResourcesFromPopup() {
  closeProfilePopup();
  if (auth.user && auth.user.manager_id) {
    filterByManagerAndGo(auth.user.manager_id);
  } else {
    navigate('resources');
  }
}

function applyNavPermissions(user) {
  const lead = ['super_admin', 'lead'].includes(user.role);
  const manager = user.role === 'manager';

  // Role-based nav visibility
  document.querySelectorAll('.nav-lead-only').forEach(el => {
    el.style.display = lead ? '' : 'none';
  });
  document.querySelectorAll('.nav-manager-only').forEach(el => {
    el.style.display = manager ? '' : 'none';
  });

  // "All Resources" for lead, "My Resources" for manager
  const navAllResources = document.getElementById('nav-all-resources');
  const navMyResources  = document.getElementById('nav-my-resources');
  if (navAllResources) navAllResources.style.display = lead ? '' : 'none';
  if (navMyResources)  navMyResources.style.display  = manager ? '' : 'none';

  // Nominations label: Lead sees 'Nominations / Approvals'
  const nomLabel = document.getElementById('nav-nominations-label');
  if (nomLabel) nomLabel.textContent = lead ? 'Nominations / Approvals' : 'My Nominations';

  // Admin section: lead or manage_users permission
  const adminSection = document.getElementById('admin-nav-section');
  if (adminSection) {
    let perms = {};
    try { perms = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions || {}; } catch {}
    adminSection.style.display = (lead || perms.manage_users) ? 'block' : 'none';
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const emailEl = document.getElementById('login-email');
  const pwdEl   = document.getElementById('login-password');
  const errEl   = document.getElementById('login-error');
  const btnEl   = document.getElementById('login-btn');

  errEl.style.display = 'none';
  btnEl.disabled = true;
  btnEl.classList.add('loading');
  btnEl.textContent = 'Signing in…';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailEl.value, password: pwdEl.value }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Login failed');

    // Persist session
    auth.token = data.token;
    auth.user  = data.user;
    localStorage.setItem('dv_token', data.token);
    localStorage.setItem('dv_user', JSON.stringify(data.user));

    showAppShell(data.user);
    navigate(getInitialRoute(), true);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  } finally {
    btnEl.disabled = false;
    btnEl.classList.remove('loading');
    btnEl.textContent = 'Sign In →';
  }
}

function handleLogout() {
  closeProfilePopup();
  authLogout(true);
}

function authLogout(notify = true) {
  closeProfilePopup();
  auth.token = null;
  auth.user  = null;
  localStorage.removeItem('dv_token');
  localStorage.removeItem('dv_user');
  localStorage.removeItem('dv_active_page');
  try { history.replaceState(null, '', window.location.pathname); } catch {}
  showLoginScreen();
  if (notify) toast('You have been signed out.', 'info');
}

function toggleLoginPassword() {
  const pwd = document.getElementById('login-password');
  const btn = document.getElementById('pwd-toggle');
  if (!pwd) return;
  if (pwd.type === 'password') { pwd.type = 'text'; btn.textContent = '🙈'; }
  else                         { pwd.type = 'password'; btn.textContent = '👁'; }
}



// ════════════════════════════════════════════════════════════════
// USERS & ROLES PAGE (Super Admin only)
// ════════════════════════════════════════════════════════════════

async function loadUsersPage() {
  if (!auth.isSuperAdmin() && !auth.can('manage_users')) {
    document.getElementById('page-users').innerHTML =
      '<div class="empty-state"><div class="empty-icon">🔒</div><p>Access restricted: You do not have permission to manage users.</p></div>';
    return;
  }

  const content = document.getElementById('page-users');
  content.innerHTML = loadingHTML();

  try {
    const [{ data: users }, { data: managers }] = await Promise.all([
      api('/users'),
      api('/managers'),
    ]);

    state.usersCache = users;
    state.managersCache = managers;

    const roleLabels = { super_admin: 'Lead', lead: 'Lead', manager: 'Operations Manager' };

    content.innerHTML = `
      <div class="flex justify-between items-center mb-3" style="flex-wrap:wrap;gap:12px">
        <div>
          <h2 style="font-size:1.35rem;font-weight:700;color:var(--text-primary)">Users &amp; Access Control</h2>
          <p class="text-muted text-sm">Manage team accounts, organizational roles, and operational scope.</p>
        </div>
        ${(auth.isSuperAdmin() || auth.can('manage_users')) ? `
        <button class="btn btn-primary" onclick="openUserCreatePage()">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          Add User
        </button>` : ''}
      </div>

      <!-- Summary cards -->
      <div class="stats-grid" style="margin-bottom:24px">
        <div class="stat-card">
          <div class="stat-label">Total Users</div>
          <div class="stat-value">${users.length}</div>
          <div class="stat-sub">${users.filter(u => u.is_active).length} active accounts</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Leads / Super Admins</div>
          <div class="stat-value" style="color:var(--accent)">${users.filter(u => u.role === 'super_admin' || u.role === 'lead').length}</div>
          <div class="stat-sub">Full system authority</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Operations Managers</div>
          <div class="stat-value" style="color:var(--accent-2)">${users.filter(u => u.role === 'manager').length}</div>
          <div class="stat-sub">Workforce &amp; team oversight</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">Active Team Members</span>
          <span class="text-muted text-sm">${users.length} accounts registered</span>
        </div>
        <div class="card-body" style="padding:0">
          <div class="users-table-wrap">
            <table class="users-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last Login</th>
                  <th>Access Scope</th>
                  <th style="text-align:right">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${users.map(u => {
                  const ini = getInitials(u.name);
                  const isLead = u.role === 'super_admin' || u.role === 'lead';
                  const isSelf = auth.user?.id === u.id;

                  return `
                    <tr>
                      <td>
                        <div class="flex items-center gap-3">
                          <div class="user-avatar-sm role-${u.role}">${ini}</div>
                          <div>
                            <div style="font-weight:600;color:var(--text-primary);font-size:0.875rem">
                              ${escapeHtml(u.name)}
                              ${isSelf ? '<span style="font-size:0.7rem;background:var(--accent-2-light);color:var(--accent-2);padding:2px 6px;border-radius:10px;margin-left:6px;font-weight:600">You</span>' : ''}
                            </div>
                            <div class="text-muted" style="font-size:0.78rem">${escapeHtml(u.email)}</div>
                          </div>
                        </div>
                      </td>
                      <td><span class="role-badge ${u.role}">${roleLabels[u.role] || u.role}</span></td>
                      <td>
                        <span class="user-status-dot ${u.is_active ? 'active' : 'inactive'}">
                          ${u.is_active ? 'Active' : 'Deactivated'}
                        </span>
                      </td>
                      <td class="text-muted" style="font-size:0.82rem">${u.last_login ? formatDate(u.last_login) : 'Never'}</td>
                      <td>
                        <span class="badge ${isLead ? 'badge-available' : 'badge-deployed'}" style="font-weight:600;font-size:0.75rem">
                          ${isLead ? 'Full Access' : 'Operations &amp; Team'}
                        </span>
                      </td>
                      <td style="text-align:right">
                        <div class="user-action-menu-wrap">
                          <button type="button" class="user-action-trigger-btn" onclick="toggleUserActionMenu(event, ${u.id})" aria-label="User actions" title="Actions">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                              <circle cx="12" cy="12" r="2"></circle>
                              <circle cx="12" cy="5" r="2"></circle>
                              <circle cx="12" cy="19" r="2"></circle>
                            </svg>
                          </button>
                          <div class="user-action-dropdown" id="user-menu-${u.id}">
                            <button type="button" class="user-dropdown-item" onclick="openUserDetailPage(${u.id})">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                              <span>View Details</span>
                            </button>
                            ${(auth.isSuperAdmin() || auth.can('manage_users')) ? `
                            <button type="button" class="user-dropdown-item" onclick="openUserEditPage(${u.id})">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                              <span>Edit User</span>
                            </button>
                            ${!isSelf ? `
                              <div class="user-dropdown-divider"></div>
                              <button type="button" class="user-dropdown-item ${u.is_active ? 'danger' : 'success'}" onclick="toggleUserActive(${u.id}, ${u.is_active}, '${escapeHtml(u.name)}')">
                                ${u.is_active ? `
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
                                  <span>Deactivate User</span>
                                ` : `
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                  <span>Activate User</span>
                                `}
                              </button>
                            ` : ''}
                            ` : ''}
                          </div>
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    content.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><p>${err.message}</p></div>`;
    toast(err.message, 'error');
  }
}

// ─── 3-Dots Action Menu Controller ────────────────────────────
function toggleUserActionMenu(event, userId) {
  event.stopPropagation();
  const triggerBtn = event.currentTarget;
  const targetMenu = document.getElementById(`user-menu-${userId}`);
  const parentRow  = triggerBtn.closest('tr') || triggerBtn.closest('.card');
  const parentTd   = triggerBtn.closest('td');
  const parentCard = triggerBtn.closest('.card');
  const parentWrap = triggerBtn.closest('.user-action-menu-wrap');
  const tableWrap  = triggerBtn.closest('.users-table-wrap') || triggerBtn.closest('.table-wrapper');
  const wasOpen    = targetMenu && targetMenu.classList.contains('show');

  closeAllActionMenus();

  if (targetMenu && !wasOpen) {
    targetMenu.classList.add('show');
    triggerBtn.classList.add('active');
    if (parentRow) parentRow.classList.add('menu-open');
    if (parentTd) parentTd.classList.add('menu-open');
    if (parentCard) parentCard.classList.add('menu-open');
    if (parentWrap) parentWrap.classList.add('menu-open');
    if (tableWrap) tableWrap.classList.add('menu-open');

    // Flip check based on button position so menu never clips or drops off screen
    const btnRect = triggerBtn.getBoundingClientRect();
    const spaceBelow = window.innerHeight - btnRect.bottom;
    const spaceAbove = btnRect.top;

    if (spaceBelow < 260 && spaceAbove > spaceBelow) {
      targetMenu.style.top = 'auto';
      targetMenu.style.bottom = 'calc(100% + 4px)';
    } else {
      targetMenu.style.top = 'calc(100% + 4px)';
      targetMenu.style.bottom = 'auto';
    }
  }
}

// Global click dismiss for action dropdown menus
document.addEventListener('click', (e) => {
  if (e.target.closest('.user-dropdown-item')) {
    closeAllActionMenus();
    return;
  }
  if (!e.target.closest('.user-action-menu-wrap')) {
    closeAllActionMenus();
  }
});

// ─── Professional Permissions Catalog ─────────────────────────
const PERMISSIONS_CATALOG = [
  {
    key: 'view_dashboard',
    name: 'View Operations Dashboard',
    tag: 'dashboard:view',
    category: 'Operations Dashboard',
    canDo: 'Access the main Operations Command Center, track real-time KPIs, and review resource shortage alerts across ongoing events.'
  },
  {
    key: 'view_resources',
    name: 'View Resources Directory',
    tag: 'resources:view',
    category: 'Resource Operations',
    canDo: 'Browse resource records, search qualification skills, view contact numbers, and inspect live deployment states.'
  },
  {
    key: 'edit_resources',
    name: 'Register & Edit Resources',
    tag: 'resources:write',
    category: 'Resource Operations',
    canDo: 'Register new resources, update resource profiles, modify qualification skills and categories, and adjust availability status.'
  },
  {
    key: 'view_projects',
    name: 'View Event Projects',
    tag: 'projects:view',
    category: 'Event Projects',
    canDo: 'Inspect event projects, production schedules, client details, venue locations, and required resource quotas.'
  },
  {
    key: 'edit_projects',
    name: 'Create & Manage Projects',
    tag: 'projects:write',
    category: 'Event Projects',
    canDo: 'Create new event productions, update production schedules, set category resource quotas, and modify project lifecycle states.'
  },
  {
    key: 'view_assignments',
    name: 'View Duty Assignments',
    tag: 'assignments:view',
    category: 'Deployments & Rostering',
    canDo: 'View live on-site resource deployments, duty rosters, assignment notes, and operational team allocations.'
  },
  {
    key: 'edit_assignments',
    name: 'Deploy & Reassign Resources',
    tag: 'assignments:write',
    category: 'Deployments & Rostering',
    canDo: 'Assign available resources from bench to events, reassign resources between projects, and release resources back to bench.'
  },
  {
    key: 'view_reports',
    name: 'View Analytics & Reports',
    tag: 'reports:view',
    category: 'Reports & Analytics',
    canDo: 'Access resource utilization analytics, category distribution charts, deficit history, and export data.'
  },
  {
    key: 'view_managers',
    name: 'View Operations Managers',
    tag: 'managers:view',
    category: 'Operations Managers',
    canDo: 'View the supervisor directory, contact records, and inspect team members managed under each supervisor.'
  },
  {
    key: 'edit_managers',
    name: 'Manage Supervisor Profiles',
    tag: 'managers:write',
    category: 'Operations Managers',
    canDo: 'Register new operations supervisors, update contact details, and reassign departmental oversight responsibilities.'
  },
  {
    key: 'view_clients',
    name: 'View Client Directory',
    tag: 'clients:view',
    category: 'Client Directory',
    canDo: 'View corporate client records, primary billing and liaison contacts, and past production history.'
  },
  {
    key: 'edit_clients',
    name: 'Manage Client Profiles',
    tag: 'clients:write',
    category: 'Client Directory',
    canDo: 'Create new corporate client accounts, update liaison contact information, and maintain enterprise client profiles.'
  },
  {
    key: 'manage_users',
    name: 'Security & Access Control',
    tag: 'admin:users',
    category: 'Security & Administration',
    canDo: 'Provision platform user logins, set roles, configure granular permission switches, and activate or deactivate user accounts.'
  }
];

// Role Defaults Catalog
const PREDEFINED_TEMPLATES = {
  super_admin: {
    label: 'Lead',
    desc: 'Full operational and administrative authority across all modules',
    perms: Object.fromEntries(PERMISSIONS_CATALOG.map(p => [p.key, true]))
  },
  lead: {
    label: 'Lead',
    desc: 'Full operational and administrative authority across all modules',
    perms: Object.fromEntries(PERMISSIONS_CATALOG.map(p => [p.key, true]))
  },
  manager: {
    label: 'Operations Manager',
    desc: 'Operations manager: full access to resources, view-only on projects and clients, no manager tab',
    perms: {
      view_dashboard: true,
      view_resources: true,
      edit_resources: true,
      view_projects: true,
      edit_projects: false,
      view_assignments: true,
      edit_assignments: true,
      view_reports: true,
      view_managers: false,
      edit_managers: false,
      view_clients: true,
      edit_clients: false,
      manage_users: false,
    }
  }
};

// ─── Dedicated User Form Page (Create / Edit) ─────────────────
function openUserCreatePage() {
  openUserFormPage(null);
}

function openUserEditPage(userId) {
  openUserFormPage(userId);
}

async function openUserFormPage(userId = null) {
  if (!auth.isSuperAdmin() && !auth.can('manage_users')) {
    toast('Access restricted: You do not have permission to manage users.', 'error');
    return;
  }

  // Ensure managers list is loaded
  if (!state.managersCache) {
    try {
      const { data: managers } = await api('/managers');
      state.managersCache = managers;
    } catch {
      state.managersCache = [];
    }
  }

  let user = null;
  if (userId) {
    user = (state.usersCache || []).find(u => u.id === userId);
    if (!user) {
      try {
        const { data } = await api(`/users/${userId}`);
        user = data;
      } catch (err) {
        toast(err.message, 'error');
        return;
      }
    }
  }

  const isEdit = !!user;
  const managers = state.managersCache || [];

  // Parse permissions
  let perms = {};
  if (user) {
    try {
      perms = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : (user.permissions || {});
    } catch {
      perms = {};
    }
  } else {
    perms = { ...PREDEFINED_TEMPLATES.manager.perms };
  }
  state.userFormPerms = { ...perms };

  const formContainer = document.getElementById('page-user-form');
  if (!formContainer) return;

  const isLeadUser = user?.role === 'lead' || user?.role === 'super_admin';

  formContainer.innerHTML = `
    <div class="user-page-topbar" style="align-items:flex-start">
      <div class="user-page-title-group" style="display:flex;flex-direction:column;align-items:flex-start;gap:10px">
        <button type="button" class="btn btn-secondary btn-sm" onclick="navigate('users')" style="display:inline-flex;align-items:center;gap:6px">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
          Back to Users
        </button>
        <div>
          <h2 class="user-page-heading-title" style="margin:0 0 4px 0">${isEdit ? `Edit User — ${escapeHtml(user.name)}` : 'Create New User'}</h2>
          <p class="user-page-heading-sub" style="margin:0">${isEdit ? 'Update account credentials and organizational role.' : 'Provision a new team member with either Lead or Operations Manager access.'}</p>
        </div>
      </div>
      <div class="user-page-actions" style="margin-top:2px">
        <button type="button" class="btn btn-secondary" onclick="navigate('users')">Cancel</button>
      </div>
    </div>

    <div class="user-form-page-body">
      <div style="margin-bottom:24px">
        <h3 style="font-size:1.05rem;font-weight:700;color:var(--text-primary);margin:0 0 4px 0">Account Credentials &amp; Organizational Role</h3>
        <p class="text-muted text-sm" style="margin:0">Define user identity, password, and access level across the platform.</p>
      </div>

      <div class="user-form-page-fields">
        <div class="form-group">
          <label class="form-label" style="font-weight:600">Full Name *</label>
          <input type="text" id="uf-name" class="form-input" placeholder="e.g. Vikram Sharma" value="${escapeHtml(user?.name || '')}" required autocomplete="name">
        </div>

        <div class="form-group">
          <label class="form-label" style="font-weight:600">Email Address *</label>
          <input type="email" id="uf-email" class="form-input" placeholder="name@dvevents.com" value="${escapeHtml(user?.email || '')}" required autocomplete="email">
        </div>

        <div class="form-group">
          <label class="form-label" style="font-weight:600">${isEdit ? 'New Password (leave blank to keep current)' : 'Account Password *'}</label>
          <div style="position:relative">
            <input type="password" id="uf-password" class="form-input" placeholder="Minimum 6 characters" ${isEdit ? '' : 'required'} autocomplete="new-password">
            <button type="button" onclick="togglePasswordVisibility('uf-password', this)" class="btn" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--text-muted);padding:4px 6px" title="Toggle visibility">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            </button>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" style="font-weight:600">Organizational Role *</label>
          <select id="uf-role" class="form-input">
            <option value="manager" ${!isLeadUser ? 'selected' : ''}>Operations Manager</option>
            <option value="lead" ${isLeadUser ? 'selected' : ''}>Lead / Super Admin (Full Access)</option>
          </select>
          <div class="text-muted" style="font-size:0.75rem;margin-top:6px">
            Lead holds full administrative authority. Manager manages own resources, view-only on projects &amp; clients.
          </div>
        </div>
      </div>

      <!-- Action Footer: Bottom only has Save / Create User button -->
      <div class="user-form-page-footer">
        <button type="button" class="btn btn-primary" onclick="submitUserForm(${isEdit ? user.id : 'null'})" style="padding:10px 28px;font-size:0.95rem">
          ${isEdit ? 'Save Changes' : 'Create User'}
        </button>
      </div>
    </div>
  `;

  navigate('user-form');
}

// ─── Dedicated User Details Page ──────────────────────────────
async function openUserDetailPage(userId) {
  if (!auth.isSuperAdmin()) {
    toast('Access restricted to Super Admins only.', 'error');
    return;
  }

  let user = (state.usersCache || []).find(u => u.id === userId);
  if (!user) {
    try {
      const { data } = await api(`/users/${userId}`);
      user = data;
    } catch (err) {
      toast(err.message, 'error');
      return;
    }
  }

  const detailContainer = document.getElementById('page-user-detail');
  if (!detailContainer) return;

  let perms = {};
  try {
    perms = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : (user.permissions || {});
  } catch {
    perms = {};
  }

  const ini = getInitials(user.name);
  const grantedCount = Object.values(perms).filter(Boolean).length;
  const roleLabels = { super_admin: 'Lead', lead: 'Lead', manager: 'Operations Manager' };
  const isLead = ['super_admin', 'lead'].includes(user.role);

  detailContainer.innerHTML = `
    <div class="user-page-topbar" style="align-items:flex-start">
      <div class="user-page-title-group" style="display:flex;flex-direction:column;align-items:flex-start;gap:10px">
        <button type="button" class="btn btn-secondary btn-sm" onclick="navigate('users')" style="display:inline-flex;align-items:center;gap:6px">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
          Back to Users
        </button>
        <div>
          <h2 class="user-page-heading-title" style="margin:0 0 4px 0">User Profile &amp; Role Summary</h2>
          <p class="user-page-heading-sub" style="margin:0">Inspect account credentials, organizational role, and operational capabilities.</p>
        </div>
      </div>
      <div class="user-page-actions" style="margin-top:2px">
        <button type="button" class="btn btn-secondary" onclick="openUserEditPage(${user.id})">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          Edit User
        </button>
      </div>
    </div>

    <!-- User Profile Hero -->
    <div class="user-detail-hero">
      <div class="user-detail-profile">
        <div class="user-detail-avatar-lg role-${user.role}">${ini}</div>
        <div>
          <div class="user-detail-name">${escapeHtml(user.name)}</div>
          <div class="user-detail-email">${escapeHtml(user.email)}</div>
          <div class="user-detail-badges">
            <span class="role-badge ${user.role}">${roleLabels[user.role] || user.role}</span>
            <span class="user-status-dot ${user.is_active ? 'active' : 'inactive'}">
              ${user.is_active ? 'Active Account' : 'Deactivated Account'}
            </span>
          </div>
        </div>
      </div>
      <div>
        <span class="badge ${isLead ? 'badge-available' : 'badge-deployed'}" style="font-size:0.85rem;padding:6px 14px;font-weight:700">
          ${isLead ? 'Full System Authority' : 'Operations &amp; Team Scope'}
        </span>
      </div>
    </div>

    <!-- Metadata Grid -->
    <div class="user-detail-grid">
      <div class="user-detail-meta-card">
        <div class="user-detail-meta-label">Organizational Role</div>
        <div class="user-detail-meta-val">${roleLabels[user.role] || user.role}</div>
      </div>
      <div class="user-detail-meta-card">
        <div class="user-detail-meta-label">Account Created</div>
        <div class="user-detail-meta-val">${user.created_at ? formatDate(user.created_at) : '—'}</div>
      </div>
      <div class="user-detail-meta-card">
        <div class="user-detail-meta-label">Last Sign In</div>
        <div class="user-detail-meta-val">${user.last_login ? formatDate(user.last_login) : 'Never'}</div>
      </div>
    </div>

    <!-- Role Scope & Capabilities -->
    <div class="card" style="margin-bottom:32px">
      <div class="card-header">
        <span class="card-title">Role Capabilities &amp; Access Scope</span>
      </div>
      <div class="card-body">
        ${isLead ? `
          <div style="display:flex;flex-direction:column;gap:12px">
            <div style="display:flex;align-items:center;gap:10px">
              <span class="badge badge-available" style="font-weight:700">Full System Access</span>
              <span style="font-size:0.88rem;color:var(--text-primary);font-weight:600">Lead / Super Admin</span>
            </div>
            <p style="font-size:0.84rem;color:var(--text-secondary);margin:0;line-height:1.5">
              This account holds unrestricted administrative and operational authority across all DV Events modules: full resource management &amp; allocation, project creation &amp; modification, resource nomination approvals, client agreements, supervisor assignments, and platform user security.
            </p>
          </div>
        ` : `
          <div style="display:flex;flex-direction:column;gap:14px">
            <div style="display:flex;align-items:center;gap:10px">
              <span class="badge" style="background:rgba(99,102,241,0.12);color:var(--accent);font-weight:700">Operational Access</span>
              <span style="font-size:0.88rem;color:var(--text-primary);font-weight:600">Operations Manager</span>
            </div>
            <div style="grid-template-columns:repeat(auto-fit, minmax(260px, 1fr));gap:12px;display:grid">
              <div style="padding:12px 14px;border:1px solid var(--border);border-radius:10px;background:var(--bg-card)">
                <div style="font-weight:600;font-size:0.84rem;color:var(--text-primary)">👥 Resources Directory</div>
                <div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px">Full management rights over assigned reporting resources.</div>
              </div>
              <div style="padding:12px 14px;border:1px solid var(--border);border-radius:10px;background:var(--bg-card)">
                <div style="font-weight:600;font-size:0.84rem;color:var(--text-primary)">📋 Projects Directory</div>
                <div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px">View-only access to active and planned projects. Editing restricted.</div>
              </div>
              <div style="padding:12px 14px;border:1px solid var(--border);border-radius:10px;background:var(--bg-card)">
                <div style="font-weight:600;font-size:0.84rem;color:var(--text-primary)">🏢 Corporate Clients</div>
                <div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px">Read-only directory access to client and liaison contacts.</div>
              </div>
              <div style="padding:12px 14px;border:1px solid var(--border);border-radius:10px;background:var(--bg-card)">
                <div style="font-weight:600;font-size:0.84rem;color:var(--text-primary)">📍 Live GPS Attendance</div>
                <div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px">Real-time attendance logs and verification for own resources.</div>
              </div>
            </div>
          </div>
        `}
      </div>
    </div>
  `;

  navigate('user-detail');
}

// ─── Permission Toggle & Filter Handlers ──────────────────────
function togglePermSwitch(key) {
  if (!state.userFormPerms) state.userFormPerms = {};
  state.userFormPerms[key] = !state.userFormPerms[key];
  const isGranted = !!state.userFormPerms[key];

  const switchEl = document.getElementById(`perm-switch-${key}`);
  const labelEl  = document.getElementById(`perm-label-${key}`);
  const rowEl    = document.getElementById(`perm-row-${key}`);

  if (switchEl) {
    switchEl.classList.toggle('active', isGranted);
    switchEl.setAttribute('aria-checked', isGranted);
  }
  if (labelEl) {
    labelEl.classList.toggle('active', isGranted);
    labelEl.textContent = isGranted ? 'Allowed' : 'Restricted';
  }
  if (rowEl) {
    rowEl.classList.toggle('is-granted', isGranted);
  }

  // Update category count
  const permItem = PERMISSIONS_CATALOG.find(p => p.key === key);
  if (permItem) {
    updateCategoryCount(permItem.category);
  }

  updatePermCountBadge();
}

function toggleCategoryPerms(category, enableAll) {
  if (!state.userFormPerms) state.userFormPerms = {};
  const catPerms = PERMISSIONS_CATALOG.filter(p => p.category === category);

  catPerms.forEach(p => {
    state.userFormPerms[p.key] = enableAll;
    const switchEl = document.getElementById(`perm-switch-${p.key}`);
    const labelEl  = document.getElementById(`perm-label-${p.key}`);
    const rowEl    = document.getElementById(`perm-row-${p.key}`);

    if (switchEl) {
      switchEl.classList.toggle('active', enableAll);
      switchEl.setAttribute('aria-checked', enableAll);
    }
    if (labelEl) {
      labelEl.classList.toggle('active', enableAll);
      labelEl.textContent = enableAll ? 'Allowed' : 'Restricted';
    }
    if (rowEl) {
      rowEl.classList.toggle('is-granted', enableAll);
    }
  });

  updateCategoryCount(category);
  updatePermCountBadge();
}

function updateCategoryCount(category) {
  const catPerms = PERMISSIONS_CATALOG.filter(p => p.category === category);
  const activeCount = catPerms.filter(p => !!state.userFormPerms[p.key]).length;
  const countEl = document.getElementById(`cat-count-${slugify(category)}`);
  if (countEl) {
    countEl.textContent = `${activeCount}/${catPerms.length}`;
  }
}

function applyPermTemplate(templateKey, btnEl = null) {
  const template = PREDEFINED_TEMPLATES[templateKey];
  if (!template) return;

  state.userFormPerms = { ...template.perms };

  PERMISSIONS_CATALOG.forEach(p => {
    const isGranted = !!state.userFormPerms[p.key];
    const switchEl = document.getElementById(`perm-switch-${p.key}`);
    const labelEl  = document.getElementById(`perm-label-${p.key}`);
    const rowEl    = document.getElementById(`perm-row-${p.key}`);

    if (switchEl) {
      switchEl.classList.toggle('active', isGranted);
      switchEl.setAttribute('aria-checked', isGranted);
    }
    if (labelEl) {
      labelEl.classList.toggle('active', isGranted);
      labelEl.textContent = isGranted ? 'Allowed' : 'Restricted';
    }
    if (rowEl) {
      rowEl.classList.toggle('is-granted', isGranted);
    }
  });

  // Update all category counts
  const categories = [...new Set(PERMISSIONS_CATALOG.map(p => p.category))];
  categories.forEach(c => updateCategoryCount(c));

  updatePermCountBadge();

  if (btnEl) {
    document.querySelectorAll('.perm-preset-pill').forEach(b => b.classList.remove('active'));
    if (templateKey !== 'clear') btnEl.classList.add('active');
  }

  toast(`Applied ${template.label} template.`, 'info');
}



function filterPermList() {
  const q = (document.getElementById('perm-search-input')?.value || '').toLowerCase().trim();
  const cat = document.getElementById('perm-cat-filter')?.value || 'all';

  document.querySelectorAll('.perm-module-group').forEach(groupEl => {
    const groupCat = groupEl.dataset.module;
    const catMatches = (cat === 'all' || groupCat === cat);

    let visibleInGroup = 0;
    groupEl.querySelectorAll('.perm-row').forEach(rowEl => {
      const searchData = rowEl.dataset.search || '';
      const searchMatches = (!q || searchData.includes(q));
      if (catMatches && searchMatches) {
        rowEl.style.display = '';
        visibleInGroup++;
      } else {
        rowEl.style.display = 'none';
      }
    });

    groupEl.style.display = (catMatches && visibleInGroup > 0) ? '' : 'none';
  });
}

function updatePermCountBadge() {
  let count = 0;
  PERMISSIONS_CATALOG.forEach(p => {
    if (state.userFormPerms && state.userFormPerms[p.key]) count++;
  });
  const badge = document.getElementById('perm-count-badge');
  if (badge) {
    badge.textContent = `${count} of ${PERMISSIONS_CATALOG.length} Allowed`;
    badge.className = 'badge ' + (count > 0 ? 'badge-available' : 'badge-completed');
  }
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
  } else {
    input.type = 'password';
    btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
  }
}

// ─── Submit User Form (Create / Edit) ─────────────────────────
async function submitUserForm(userId = null) {
  const name     = document.getElementById('uf-name')?.value.trim();
  const email    = document.getElementById('uf-email')?.value.trim();
  const password = document.getElementById('uf-password')?.value;
  const role     = document.getElementById('uf-role')?.value;

  if (!name || !email || !role) { toast('Full name, email address, and role are required.', 'error'); return; }
  if (!userId && !password)     { toast('Password is required when creating a new user.', 'error'); return; }
  if (password && password.length < 6) { toast('Password must be at least 6 characters.', 'error'); return; }

  try {
    const payload = { name, email, role };
    if (password) payload.password = password;

    if (userId) {
      await api(`/users/${userId}`, 'PUT', payload);
      toast('User account updated successfully.', 'success');
    } else {
      await api('/users', 'POST', payload);
      toast('User account created successfully.', 'success');
    }

    navigate('users');
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ─── Toggle User Active / Deactivate ──────────────────────────
async function toggleUserActive(userId, currentActive, userName) {
  if (!auth.isSuperAdmin() && !auth.can('manage_users')) {
    toast('Access restricted: You do not have permission to manage users.', 'error');
    return;
  }
  const action = currentActive ? 'deactivate' : 'activate';
  if (!confirm(`Are you sure you want to ${action} user "${userName}"?`)) return;
  try {
    if (currentActive) {
      await api(`/users/${userId}`, 'DELETE');
    } else {
      await api(`/users/${userId}`, 'PUT', { is_active: true });
    }
    toast(`User "${userName}" ${action}d successfully.`, 'success');
    loadUsersPage();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ─── Route & Initial Page Detection ───────────────────────────
function getInitialRoute() {
  const hash = window.location.hash.replace(/^#/, '').trim();
  const validPages = [
    'dashboard', 'resources', 'resource-import', 'projects',
    'assignments', 'nominations', 'attendance', 'managers',
    'reports', 'clients', 'availability', 'users', 'user-form', 'user-detail'
  ];
  if (hash && validPages.includes(hash)) return hash;
  try {
    const saved = localStorage.getItem('dv_active_page');
    if (saved && validPages.includes(saved)) return saved;
  } catch {}
  return 'dashboard';
}

// ─── Application Bootstrap ────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Try restoring session from localStorage
  const savedToken = localStorage.getItem('dv_token');
  const savedUser  = localStorage.getItem('dv_user');

  if (savedToken && savedUser) {
    try {
      auth.token = savedToken;
      auth.user  = JSON.parse(savedUser);

      // Verify token is still valid with a quick /me call
      fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${savedToken}` }
      }).then(r => r.json()).then(data => {
        if (data.success) {
          auth.user = data.user;
          localStorage.setItem('dv_user', JSON.stringify(data.user));
          showAppShell(data.user);
          initAppListeners();
          navigate(getInitialRoute(), true);
        } else {
          authLogout(false);
          showLoginScreen();
          initAppListeners();
        }
      }).catch(() => {
        showAppShell(auth.user); // offline/fallback — use cached user
        initAppListeners();
        navigate(getInitialRoute(), true);
      });
    } catch {
      authLogout(false);
      showLoginScreen();
      initAppListeners();
    }
  } else {
    showLoginScreen();
    initAppListeners();
  }
});

let appListenersInitialized = false;

function initAppListeners() {
  if (appListenersInitialized) return;
  appListenersInitialized = true;

  // Handle browser Back / Forward buttons & URL hash changes
  window.addEventListener('hashchange', () => {
    const hashPage = window.location.hash.replace(/^#/, '').trim();
    if (hashPage && hashPage !== state.currentPage) {
      navigate(hashPage, false);
    }
  });

  // Nav Click Listeners
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => navigate(item.dataset.page));
  });

  // Modal Close Buttons
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.modal));
  });

  // Close Modals on Backdrop Click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('visible');
    });
  });

  // ─── Sidebar Drawer / Toggle Controls ─────────────────────────
  document.getElementById('sidebar-toggle')?.addEventListener('click', toggleSidebarDrawer);
  document.getElementById('sidebar-close-btn')?.addEventListener('click', closeSidebarDrawer);
  document.getElementById('sidebar-backdrop')?.addEventListener('click', closeSidebarDrawer);

  try {
    if (localStorage.getItem('sidebar_pinned') === 'true' && window.innerWidth > 900) {
      document.querySelector('.sidebar')?.classList.add('sidebar-pinned');
      document.getElementById('app-shell')?.classList.add('sidebar-pinned');
    }
  } catch {}

  // Close profile popup on click outside
  document.addEventListener('click', (e) => {
    const popup = document.getElementById('profile-popup');
    const trigger = document.getElementById('topbar-avatar-btn');
    if (popup && popup.style.display !== 'none') {
      if (!popup.contains(e.target) && (!trigger || !trigger.contains(e.target))) {
        closeProfilePopup();
      }
    }
    const bulkWrap = document.querySelector('.bulk-actions-wrap');
    if (bulkWrap && !bulkWrap.contains(e.target)) {
      closeBulkActionsMenu();
    }
  });

  // Close profile popup, sidebar drawer & bulk actions menu on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeProfilePopup();
      closeSidebarDrawer();
      closeBulkActionsMenu();
    }
  });

  // Touch swipe-to-close on sidebar
  let touchStartX = 0;
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) {
    sidebar.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].clientX;
    }, { passive: true });
    sidebar.addEventListener('touchend', (e) => {
      const touchEndX = e.changedTouches[0].clientX;
      if (touchStartX - touchEndX > 50) { // Swiped left by at least 50px
        closeSidebarDrawer();
      }
    }, { passive: true });
  }
}

// ─── Global Drawer Helpers ─────────────────────────────────────
function openSidebarDrawer() {
  document.querySelector('.sidebar')?.classList.add('open');
  document.getElementById('sidebar-backdrop')?.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeSidebarDrawer() {
  document.querySelector('.sidebar')?.classList.remove('open');
  document.getElementById('sidebar-backdrop')?.classList.remove('active');
  document.body.style.overflow = '';
}

function toggleSidebarDrawer() {
  if (window.innerWidth <= 900) {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar?.classList.contains('open')) {
      closeSidebarDrawer();
    } else {
      openSidebarDrawer();
    }
  } else {
    toggleSidebarPinned();
  }
}

function toggleSidebarPinned() {
  const sidebar = document.querySelector('.sidebar');
  const shell = document.getElementById('app-shell');
  const isPinned = sidebar?.classList.toggle('sidebar-pinned');
  shell?.classList.toggle('sidebar-pinned', isPinned);
  try {
    localStorage.setItem('sidebar_pinned', isPinned ? 'true' : 'false');
  } catch {}
}


// ═══════════════════════════════════════════════════════════════════
// NOMINATIONS PAGE
// ═══════════════════════════════════════════════════════════════════
async function loadNominations() {
  const el = $('#page-nominations');
  if (!el) return;
  el.innerHTML = `<div class="page-loading">Loading nominations...</div>`;
  try {
    const [nomRes, projRes] = await Promise.all([
      api('/nominations'),
      api('/projects'),
    ]);
    const noms = nomRes.data || [];
    const projects = projRes.data || [];
    const isLead = auth.isLead();
    const statusColors = { nominated:'var(--accent)', pending_approval:'#f59e0b', approved:'#10b981', rejected:'#ef4444' };
    const statusLabels = { nominated:'Nominated', pending_approval:'Pending Approval', approved:'Approved', rejected:'Rejected' };
    el.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">${isLead ? 'Nominations &amp; Approvals' : 'My Nominations'}</h1>
          <p class="page-subtitle">${isLead ? 'Review and approve resource nominations from Managers.' : 'Track nominations you have submitted for projects.'}</p>
        </div>
        ${isLead ? `<div class="page-actions">
          <select id="nom-filter-status" class="form-select form-select-sm" onchange="filterNominations()" style="max-width:160px">
            <option value="">All Status</option><option value="nominated">Nominated</option>
            <option value="pending_approval">Pending Approval</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
          </select>
          <select id="nom-filter-project" class="form-select form-select-sm" onchange="filterNominations()" style="max-width:200px">
            <option value="">All Projects</option>${projects.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
          </select>
        </div>` : ''}
      </div>
      ${!noms.length ? `<div class="empty-state"><div class="empty-icon">📝</div><div class="empty-title">No nominations yet</div><div class="empty-sub">Go to a project and nominate resources for deployment.</div></div>` : `
      <div class="table-wrapper"><table class="data-table">
        <thead><tr><th>Resource</th><th>Project</th><th>Manager</th><th>Status</th><th>Nominated</th>${isLead?'<th>Actions</th>':''}</tr></thead>
        <tbody id="nominations-tbody">
          ${noms.map(n=>`<tr data-nom-id="${n.id}" data-status="${n.status}" data-project="${n.project_id}">
            <td><div style="font-weight:600">${escapeHtml(n.resource_name)}</div><div style="font-size:.78rem;color:var(--text-muted)">${escapeHtml(n.staff_id||'')} · ${escapeHtml(n.category_name||'')}</div></td>
            <td>${escapeHtml(n.project_name)}</td>
            <td>${escapeHtml(n.manager_name||'Lead')}</td>
            <td><span class="status-badge" style="background:${statusColors[n.status]}22;color:${statusColors[n.status]};border:1px solid ${statusColors[n.status]}44">${statusLabels[n.status]||n.status}</span></td>
            <td style="color:var(--text-muted);font-size:.82rem">${new Date(n.created_at).toLocaleDateString('en-IN')}</td>
            ${isLead?`<td>${['nominated','pending_approval'].includes(n.status)?`<div style="display:flex;gap:6px"><button class="btn btn-sm" style="background:#dcfce7;color:#166534;border:1px solid #bbf7d0" onclick="reviewNomination(${n.id},'approved')">Approve</button><button class="btn btn-sm" style="background:#fee2e2;color:#991b1b;border:1px solid #fecaca" onclick="reviewNomination(${n.id},'rejected')">Reject</button></div>`:'—'}</td>`:''}
          </tr>`).join('')}
        </tbody>
      </table></div>`}`;
  } catch(err) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-title">Failed to load nominations</div><div class="empty-sub">${err.message}</div></div>`;
  }
}
function filterNominations() {
  const status=document.getElementById('nom-filter-status')?.value;
  const project=document.getElementById('nom-filter-project')?.value;
  document.querySelectorAll('#nominations-tbody tr').forEach(row=>{
    row.style.display=((!status||row.dataset.status===status)&&(!project||row.dataset.project===project))?'':'none';
  });
}
async function reviewNomination(id,status) {
  if(!confirm(`${status==='approved'?'Approve':'Reject'} this nomination?`)) return;
  try {
    await api(`/nominations/${id}`, 'PUT', { status });
    toast(`Nomination ${status}.`,'success'); loadNominations();
  } catch(err) { toast(err.message||'Failed.','error'); }
}

// ═══════════════════════════════════════════════════════════════════
// ATTENDANCE PAGE
// ═══════════════════════════════════════════════════════════════════
async function loadAttendancePage() {
  const el = $('#page-attendance');
  if (!el) return;
  el.innerHTML = `<div class="page-loading">Loading attendance...</div>`;
  try {
    const data = await api('/attendance');
    const records = data.data || [];
    const isLead = auth.isLead();
    const sc={present:'#10b981',absent:'#ef4444',submitted:'#f59e0b',manual_review:'#8b5cf6'};
    const sl={present:'Present',absent:'Absent',submitted:'Submitted',manual_review:'Manual Review'};
    el.innerHTML = `
      <div class="page-header"><div>
        <h1 class="page-title">Attendance</h1>
        <p class="page-subtitle">Project day attendance and GPS verification.</p>
      </div></div>
      ${!records.length?`<div class="empty-state"><div class="empty-icon">📍</div><div class="empty-title">No attendance records</div><div class="empty-sub">Attendance is submitted by confirmed resources on project day.</div></div>`:`
      <div class="table-wrapper"><table class="data-table">
        <thead><tr><th>Resource</th><th>Project</th><th>Submitted</th><th>Distance</th><th>Status</th>${isLead?'<th>Action</th>':''}</tr></thead>
        <tbody>${records.map(r=>`<tr>
          <td><div style="font-weight:600">${escapeHtml(r.resource_name)}</div><div style="font-size:.78rem;color:var(--text-muted)">${escapeHtml(r.staff_id||'')}</div></td>
          <td>${escapeHtml(r.project_name)}<br><span style="font-size:.78rem;color:var(--text-muted)">${escapeHtml(r.location||'')}</span></td>
          <td style="font-size:.82rem;color:var(--text-muted)">${new Date(r.submitted_at).toLocaleString('en-IN')}</td>
          <td>${r.distance_m!=null?`${r.distance_m}m`:'—'}</td>
          <td><span class="status-badge" style="background:${sc[r.status]}22;color:${sc[r.status]};border:1px solid ${sc[r.status]}44">${sl[r.status]||r.status}</span></td>
          ${isLead?`<td>${['manual_review','submitted'].includes(r.status)?`<div style="display:flex;gap:6px"><button class="btn btn-sm" style="background:#dcfce7;color:#166534;border:1px solid #bbf7d0" onclick="verifyAttendance(${r.id},'present')">Present</button><button class="btn btn-sm" style="background:#fee2e2;color:#991b1b;border:1px solid #fecaca" onclick="verifyAttendance(${r.id},'absent')">Absent</button></div>`:'—'}</td>`:''}
        </tr>`).join('')}</tbody>
      </table></div>`}`;
  } catch(err) {
    el.innerHTML=`<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-title">Failed to load attendance</div><div class="empty-sub">${err.message}</div></div>`;
  }
}
async function verifyAttendance(id,status) {
  try {
    await api(`/attendance/${id}`, 'PUT', { status });
    toast(`Attendance marked as ${status}.`,'success'); loadAttendancePage();
  } catch(err){toast(err.message||'Failed.','error');}
}

// ═══════════════════════════════════════════════════════════════════
// RESOURCE PAYMENT ACTIONS & MODALS
// ═══════════════════════════════════════════════════════════════════
async function quickMarkResourcePaymentPaid(paymentId, resourceId) {
  if (!auth.isLead()) {
    toast('Only Leads can mark payments as paid.', 'error');
    return;
  }
  const ref = prompt('Enter payment transaction reference (optional):', 'TXN-' + Date.now().toString().slice(-6));
  if (ref === null) return;
  try {
    const today = new Date().toISOString().split('T')[0];
    await api(`/payments/${paymentId}`, 'PUT', { payment_status: 'paid', payment_date: today, payment_reference: ref.trim() || null });
    toast('Payment marked as Paid.', 'success');
    viewResource(resourceId);
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function openAddResourcePaymentModal(resourceId, resourceName, defaultRate, defaultRateType) {
  if (!auth.isLead()) {
    toast('Only Leads can record payments.', 'error');
    return;
  }
  if (!state.projects.length) {
    const { data: projs } = await api('/projects');
    state.projects = projs || [];
  }

  const modalHtml = `
    <div id="res-pay-modal" class="modal-backdrop" style="display:flex;z-index:1050">
      <div class="modal" style="max-width:480px">
        <div class="modal-header">
          <div class="modal-title">Record Payment: ${escapeHtml(resourceName)}</div>
          <button type="button" class="modal-close" onclick="$('#res-pay-modal').remove()">×</button>
        </div>
        <div class="modal-body" style="padding:16px 20px">
          <div class="form-group mb-2">
            <label>Project *</label>
            <select id="res-pay-project">
              <option value="">Select Project</option>
              ${state.projects.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-row mb-2">
            <div class="form-group">
              <label>Rate Type</label>
              <select id="res-pay-rate-type" onchange="calculateResourcePayAmount()">
                <option value="per_day" ${defaultRateType === 'per_day' ? 'selected' : ''}>Per Day</option>
                <option value="per_shift" ${defaultRateType === 'per_shift' ? 'selected' : ''}>Per Shift</option>
                <option value="per_hour" ${defaultRateType === 'per_hour' ? 'selected' : ''}>Per Hour</option>
                <option value="fixed" ${defaultRateType === 'fixed' ? 'selected' : ''}>Fixed</option>
              </select>
            </div>
            <div class="form-group">
              <label>Rate (₹) *</label>
              <input type="number" id="res-pay-rate" value="${defaultRate || ''}" placeholder="1200" oninput="calculateResourcePayAmount()">
            </div>
          </div>
          <div class="form-row mb-2">
            <div class="form-group">
              <label>Units Worked</label>
              <input type="number" id="res-pay-units" value="1" min="0.5" step="0.5" oninput="calculateResourcePayAmount()">
            </div>
            <div class="form-group">
              <label>Final Amount (₹) *</label>
              <input type="number" id="res-pay-final" value="${defaultRate || ''}" placeholder="1200">
            </div>
          </div>
          <div class="form-group mb-2">
            <label>Payment Notes / Reference</label>
            <input type="text" id="res-pay-notes" placeholder="e.g. VIP event shift, OT included">
          </div>
        </div>
        <div class="modal-footer" style="display:flex;justify-content:flex-end;gap:8px;padding:12px 20px;border-top:1px solid var(--border)">
          <button type="button" class="btn btn-secondary" onclick="$('#res-pay-modal').remove()">Cancel</button>
          <button type="button" class="btn btn-primary" onclick="submitResourcePayment(${resourceId})">Save Payment</button>
        </div>
      </div>
    </div>
  `;

  const existing = $('#res-pay-modal');
  if (existing) existing.remove();
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function calculateResourcePayAmount() {
  const rate = parseFloat($('#res-pay-rate')?.value) || 0;
  const units = parseFloat($('#res-pay-units')?.value) || 1;
  const type = $('#res-pay-rate-type')?.value;
  const finalEl = $('#res-pay-final');
  if (finalEl) {
    finalEl.value = type === 'fixed' ? rate : Math.round(rate * units);
  }
}

async function submitResourcePayment(resourceId) {
  const projectId = $('#res-pay-project')?.value;
  const rateType = $('#res-pay-rate-type')?.value;
  const rateAmount = parseFloat($('#res-pay-rate')?.value);
  const payableUnits = parseFloat($('#res-pay-units')?.value) || 1;
  const finalAmount = parseFloat($('#res-pay-final')?.value);
  const notes = $('#res-pay-notes')?.value.trim();

  if (!projectId || isNaN(rateAmount) || isNaN(finalAmount)) {
    toast('Project, rate amount, and final amount are required.', 'error');
    return;
  }

  try {
    await api('/payments', 'POST', {
      project_id: projectId,
      resource_id: resourceId,
      rate_type: rateType,
      rate_amount: rateAmount,
      payable_units: payableUnits,
      calculated_amount: rateAmount * payableUnits,
      final_amount: finalAmount,
      notes: notes || null
    });
    toast('Payment record created.', 'success');
    $('#res-pay-modal')?.remove();
    viewResource(resourceId);
  } catch (err) {
    toast(err.message, 'error');
  }
}

// Fallback compatibility alias for apiFetch
const apiFetch = (path, opts = {}) => api(path.replace(/^\/api/, ''), opts.method || 'GET', opts.body ? JSON.parse(opts.body) : null);

// ═══════════════════════════════════════════════════════════════
// RESOURCE BULK IMPORT & FIELD MAPPING MODULE
// ═══════════════════════════════════════════════════════════════

function convertGoogleDriveUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.includes('drive.google.com') || trimmed.includes('docs.google.com') || trimmed.includes('googleusercontent.com')) {
    const m1 = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (m1 && m1[1]) return `https://lh3.googleusercontent.com/d/${m1[1]}`;
    const m2 = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (m2 && m2[1]) return `https://lh3.googleusercontent.com/d/${m2[1]}`;
    const m3 = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (m3 && m3[1]) return `https://lh3.googleusercontent.com/d/${m3[1]}`;
  }
  return trimmed;
}

const IMPORT_SYSTEM_FIELDS = [
  { key: '__skip__', label: '-- Skip / Do Not Import --' },
  { key: 'name', label: '1. Full Legal Name * (Required)', required: true },
  { key: 'contact_info', label: '2. WhatsApp Number * (Required)' },
  { key: 'alternate_phone', label: '3. Alternate Emergency Contact Number' },
  { key: 'email', label: '4. Email Address' },
  { key: 'age', label: '5. Age (Years — auto-calculates DOB)' },
  { key: 'gender', label: '6. Gender (Male / Female / Other)' },
  { key: 'zone', label: '7. Area of Residence (Pune Zone)' },
  { key: 'reporting_manager_id', label: '8. Operations Lead / Squad Manager' },
  { key: 'opted_roles', label: '9. Opted Roles (Preferred roles chosen)' },
  { key: 'height', label: '10. Height (in cm or ft/inches)' },
  { key: 'languages', label: '12. Languages Confidently Spoken On-Ground' },
  { key: 'availability', label: '13. Weekend Availability' },
  { key: 'experience', label: '15. Past Event Experience' },
  { key: 'photo_path', label: '16. Profile Photo (Google Drive / URL)' },
  { key: 'category_id', label: 'Primary Category / Role' },
  { key: 'skills', label: 'Skills & Qualifications' },
  { key: 'dob', label: 'Date of Birth (DOB)' },
  { key: 'address', label: 'Residential Address' },
  { key: 'rate_amount', label: 'Pay Rate Amount' },
  { key: 'rate_type', label: 'Pay Rate Type (per_day, per_shift, etc.)' },
  { key: 'bank_details', label: 'Bank Account Details' },
  { key: 'upi_id', label: 'UPI ID' },
  { key: 'id_type', label: 'Govt ID Type (Aadhaar, PAN, etc.)' },
  { key: 'id_number', label: 'Govt ID Number' },
  { key: 'status', label: 'Status / Availability' },
  { key: 'notes', label: '17. DV Crew Commitment & Notes' }
];

function initResourceImportState() {
  state.resourceImport = {
    step: 1,
    sourceType: 'file', // 'file' or 'paste'
    fileName: '',
    fileSize: '',
    workbook: null,
    sheetNames: [],
    selectedSheet: '',
    headers: [],
    rawRows: [],
    pastedText: '',
    columnMap: {}, // colIndex -> system field key
    defaults: {
      status: 'available',
      category_id: (state.categories && state.categories[0]) ? state.categories[0].id : '',
      reporting_manager_id: ''
    },
    transformedData: [],
    result: null
  };
}

function autoDetectTargetField(headerName) {
  if (!headerName) return '__skip__';
  const raw = String(headerName).trim().toLowerCase();
  // Strip leading numbering e.g. "1. ", "10. ", "16. "
  const h = raw.replace(/^\s*\d+[\.\)\-\:\s]+/, '').replace(/[^a-z0-9]/g, '');

  if (/^(timestamp|submissiontime|createdtime|date)$/.test(h) || h === 'timestamp') return '__skip__';
  if (/commitment|codeofconduct|honorcode|terms|declaration/.test(h)) return 'notes';
  if (/alternate|emergency/.test(h)) return 'alternate_phone';
  if (/whatsapp|mobile|phone|contact|cell/.test(h)) return 'contact_info';
  if (/legalname|fullname|^name|candidatename|staffname|employeename/.test(h)) return 'name';
  if (/photo|picture|drive|avatar|headshot|profilephoto|selfie/.test(h) || /image/.test(raw)) return 'photo_path';
  if (/^age|ageyears|ageinyears/.test(h) || (/\bage\b/.test(raw) && !/image|manage|stage|language/.test(raw))) return 'age';
  if (/dob|dateofbirth|birthdate|birthday|birth/.test(h)) return 'dob';
  if (/gender|sex/.test(h)) return 'gender';
  if (/area.*residence|pune.*zone|zone|residence.*zone|location/.test(h)) return 'zone';
  if (/operations.*lead|squad.*manager|reportingmanager|manager|supervisor|lead/.test(h)) return 'reporting_manager_id';
  if (/roles.*opting|opting.*for|optedroles|preferredroles/.test(h)) return 'opted_roles';
  if (/category|role|designation|department|jobtitle/.test(h)) return 'category_id';
  if (/height/.test(h)) return 'height';
  if (/language/.test(h)) return 'languages';
  if (/weekend.*availability|availability/.test(h)) return 'availability';
  if (/experience|pastevent|pastexperience/.test(h)) return 'experience';
  if (/email|mail|emailaddress/.test(h)) return 'email';
  if (/address|residence/.test(h)) return 'address';
  if (/skill|skills|expertise/.test(h)) return 'skills';
  if (/rate|rateamount|pay|salary|wages/.test(h)) return 'rate_amount';
  if (/upi|upiid|gpay/.test(h)) return 'upi_id';
  if (/idtype|doctype/.test(h)) return 'id_type';
  if (/idnumber|aadhaar|pan|aadhar/.test(h)) return 'id_number';
  if (/note|notes|remark|remarks|comments/.test(h)) return 'notes';
  return '__skip__';
}

function parseDelimitedText(text) {
  if (!text || !text.trim()) return { headers: [], rows: [] };
  const firstLine = text.trim().split(/\r?\n/)[0];
  let delimiter = ',';
  if (firstLine.includes('\t')) delimiter = '\t';
  else if ((firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length) delimiter = ';';

  const rows = [];
  let currentRow = [];
  let currentCell = '';
  let inQuotes = false;
  const len = text.length;

  for (let i = 0; i < len; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') i++; // CRLF
      currentRow.push(currentCell.trim());
      if (currentRow.some(cell => cell !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += char;
    }
  }
  if (currentCell !== '' || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some(cell => cell !== '')) {
      rows.push(currentRow);
    }
  }

  if (!rows.length) return { headers: [], rows: [] };
  const headers = rows[0].map(h => String(h || '').trim());
  const dataRows = rows.slice(1).filter(r => r.some(cell => String(cell || '').trim() !== ''));
  return { headers, rows: dataRows };
}

function formatImportDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    return val.toISOString().split('T')[0];
  }
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const month = dmy[2].padStart(2, '0');
    const year = dmy[3];
    return `${year}-${month}-${day}`;
  }
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  return s;
}

async function loadResourceImportPage() {
  if (!auth.can('edit_resources')) {
    toast('Access restricted: You do not have permission to import resources.', 'error');
    navigate('resources');
    return;
  }

  // Ensure categories are loaded
  if (!state.categories || !state.categories.length) {
    try {
      const { data } = await api('/resources/meta/categories');
      state.categories = data;
    } catch {}
  }

  // Ensure managers are loaded
  if (!state.managersCache || !state.managersCache.length) {
    try {
      const { data } = await api('/managers');
      state.managersCache = data;
    } catch {}
  }

  if (!state.resourceImport) {
    initResourceImportState();
  }

  renderResourceImportPage();
}

function renderResourceImportPage() {
  const container = $('#page-resource-import');
  if (!container) return;
  const imp = state.resourceImport;

  container.innerHTML = `
    <div class="import-container">
      <!-- Topbar Header with Back Button above title -->
      <div class="flex justify-between items-start mb-6" style="flex-wrap:wrap;gap:16px">
        <div style="display:flex;flex-direction:column;align-items:flex-start;gap:12px">
          <button class="btn btn-secondary btn-sm" onclick="navigate('resources')" style="display:inline-flex;align-items:center;gap:6px">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
            Back to Resources
          </button>
          <div>
            <h2 style="font-size:1.4rem;font-weight:700;color:var(--text-primary);margin:0 0 4px 0">
              Bulk Import Resources
            </h2>
            <p class="text-muted text-sm" style="margin:0">
              Onboard resources at scale via Excel (.xlsx, .xls) or CSV files, with automatic Google Drive photo conversion.
            </p>
          </div>
        </div>
      </div>

      <!-- Vertical Stepper & Main Workspace Layout -->
      <div class="import-layout">
        <!-- Left: Vertical Stepper Sidebar Card -->
        <aside class="card import-sidebar">
          <div class="import-v-stepper">
            <!-- Step 1 -->
            <div class="import-v-step ${imp.step === 1 ? 'active' : ''} ${imp.step > 1 ? 'completed' : ''}" ${imp.step > 1 ? 'onclick="impJumpToStep(1)" style="cursor:pointer"' : ''}>
              <div class="import-v-step-indicator">
                <div class="import-v-step-circle">${imp.step > 1 ? '✓' : '1'}</div>
                <div class="import-v-step-line ${imp.step > 1 ? 'completed' : ''}"></div>
              </div>
              <div class="import-v-step-content">
                <div class="import-v-step-num">STEP 1</div>
                <div class="import-v-step-title">Upload or Paste</div>
                <div class="import-v-step-desc">Select Excel/CSV file or paste data</div>
              </div>
            </div>

            <!-- Step 2 -->
            <div class="import-v-step ${imp.step === 2 ? 'active' : ''} ${imp.step > 2 ? 'completed' : ''}" ${imp.step > 2 ? 'onclick="impJumpToStep(2)" style="cursor:pointer"' : ''}>
              <div class="import-v-step-indicator">
                <div class="import-v-step-circle">${imp.step > 2 ? '✓' : '2'}</div>
                <div class="import-v-step-line ${imp.step > 2 ? 'completed' : ''}"></div>
              </div>
              <div class="import-v-step-content">
                <div class="import-v-step-num">STEP 2</div>
                <div class="import-v-step-title">Map Properties</div>
                <div class="import-v-step-desc">Match columns to resource fields</div>
              </div>
            </div>

            <!-- Step 3 -->
            <div class="import-v-step ${imp.step >= 3 ? 'active' : ''} ${imp.step === 4 ? 'completed' : ''}">
              <div class="import-v-step-indicator">
                <div class="import-v-step-circle">${imp.step === 4 ? '✓' : '3'}</div>
              </div>
              <div class="import-v-step-content">
                <div class="import-v-step-num">STEP 3</div>
                <div class="import-v-step-title">Preview &amp; Import</div>
                <div class="import-v-step-desc">Validate records and confirm import</div>
              </div>
            </div>
          </div>

          <div style="border-top:1px solid var(--border);margin:28px 0 20px 0"></div>

          <!-- Sample Templates Box -->
          <div>
            <div style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.04em">Sample Templates</div>
            <p class="text-muted" style="font-size:0.78rem;line-height:1.45;margin:0 0 14px 0">Download templates with standard column headers:</p>
            <div style="display:flex;flex-direction:column;gap:10px">
              <button class="btn btn-sm btn-secondary" onclick="downloadSampleImportCsv()" title="Download CSV template" style="display:flex;align-items:center;justify-content:flex-start;gap:8px;width:100%;font-size:0.8rem;padding:8px 12px">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                Download CSV Sample
              </button>
              <button class="btn btn-sm btn-secondary" onclick="downloadSampleImportExcel()" title="Download Excel template" style="display:flex;align-items:center;justify-content:flex-start;gap:8px;width:100%;font-size:0.8rem;padding:8px 12px">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                Download Excel Sample
              </button>
            </div>
          </div>
        </aside>

        <!-- Right: Dynamic Step View Container -->
        <main class="import-main-content">
          <div id="import-step-view">
            ${renderImportStepContent()}
          </div>
        </main>
      </div>
    </div>
  `;

  attachImportStepListeners();
}

function impJumpToStep(targetStep) {
  const imp = state.resourceImport;
  if (!imp) return;
  if (targetStep < imp.step) {
    imp.step = targetStep;
    renderResourceImportPage();
  }
}

function renderImportStepContent() {
  const imp = state.resourceImport;
  if (imp.step === 1) return renderImportStep1();
  if (imp.step === 2) return renderImportStep2();
  if (imp.step === 3) return renderImportStep3();
  if (imp.step === 4) return renderImportStep4();
  return '';
}

// ─── Step 1: Upload or Paste Source ────────────────────────────
function renderImportStep1() {
  const imp = state.resourceImport;
  const hasRows = imp.rawRows && imp.rawRows.length > 0;

  return `
    <div class="card" style="padding:36px 32px">
      <div class="import-tabs-header">
        <button class="import-tab-btn ${imp.sourceType === 'file' ? 'active' : ''}" onclick="switchImportSourceTab('file')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          Upload Spreadsheet / CSV
        </button>
        <button class="import-tab-btn ${imp.sourceType === 'paste' ? 'active' : ''}" onclick="switchImportSourceTab('paste')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
          Paste CSV / Clipboard Data
        </button>
      </div>

      ${imp.sourceType === 'file' ? `
        <!-- File Drag & Drop Zone -->
        <div class="import-dropzone" id="import-dropzone" onclick="$('#import-file-input').click()">
          <input type="file" id="import-file-input" accept=".xlsx,.xls,.csv,.tsv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" style="display:none" onchange="handleImportFileInput(event)">
          <div class="import-drop-icon" style="font-size:2.4rem;margin-bottom:14px">📂</div>
          <h3 style="font-size:1.15rem;font-weight:700;margin-bottom:8px;color:var(--text-primary)">
            Click to upload or drag &amp; drop your spreadsheet
          </h3>
          <p class="text-muted text-sm" style="margin-bottom:20px;max-width:440px;margin-left:auto;margin-right:auto">
            Supports Microsoft Excel (.xlsx, .xls) and CSV (.csv, .tsv) files
          </p>
          <div class="flex justify-center gap-2" style="flex-wrap:wrap">
            <span class="badge" style="background:var(--bg-hover);color:var(--text-muted);border:1px solid var(--border);padding:4px 10px;font-size:0.75rem">.XLSX</span>
            <span class="badge" style="background:var(--bg-hover);color:var(--text-muted);border:1px solid var(--border);padding:4px 10px;font-size:0.75rem">.XLS</span>
            <span class="badge" style="background:var(--bg-hover);color:var(--text-muted);border:1px solid var(--border);padding:4px 10px;font-size:0.75rem">.CSV</span>
            <span class="badge" style="background:var(--bg-hover);color:var(--text-muted);border:1px solid var(--border);padding:4px 10px;font-size:0.75rem">.TSV</span>
          </div>
        </div>

        ${hasRows ? `
          <div class="card p-4 mt-4" style="background:rgba(16, 185, 129, 0.05);border-color:rgba(16, 185, 129, 0.25)">
            <div class="flex justify-between items-center" style="flex-wrap:wrap;gap:12px">
              <div class="flex items-center gap-3">
                <span style="font-size:1.5rem">📄</span>
                <div>
                  <div style="font-weight:700;color:var(--text-primary)">${escapeHtml(imp.fileName || 'Spreadsheet')}</div>
                  <div class="text-sm text-muted">
                    ${imp.fileSize ? `${imp.fileSize} · ` : ''}
                    <strong style="color:#10b981">${imp.rawRows.length} rows</strong> detected across <strong>${imp.headers.length} columns</strong>
                  </div>
                </div>
              </div>
              ${imp.sheetNames && imp.sheetNames.length > 1 ? `
                <div class="flex items-center gap-2">
                  <label class="text-sm font-medium">Sheet:</label>
                  <select class="form-input text-sm" onchange="handleImportSheetSelect(this.value)" style="width:auto;padding:6px 10px">
                    ${imp.sheetNames.map(s => `<option value="${escapeHtml(s)}" ${s === imp.selectedSheet ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
                  </select>
                </div>
              ` : ''}
            </div>
          </div>
        ` : ''}
      ` : `
        <!-- Paste Data Box -->
        <div>
          <label class="form-label" style="margin-bottom:8px">Paste spreadsheet rows or CSV text</label>
          <textarea class="import-textarea" id="import-paste-textarea" oninput="handleImportPasteInput()" placeholder="Copy rows from Excel, Google Sheets, or CSV and paste them here (Ctrl+V)...&#10;&#10;Full Name, Phone Number, Age, Gender, Photo (Google Drive Link), Category&#10;Aarav Sharma, 9876543210, 26, Male, https://drive.google.com/file/d/..., Security Guard&#10;Priya Patel, 9876543211, 23, Female, https://drive.google.com/file/d/..., Hostess">${escapeHtml(imp.pastedText || '')}</textarea>
          
          <div class="flex justify-between items-center mt-2 text-xs text-muted">
            <span>Delimiters automatically detected (Comma, Tab, Semicolon)</span>
            ${hasRows ? `
              <span class="badge" style="background:#10b981;color:#ffffff;font-size:0.75rem">
                ✓ ${imp.rawRows.length} rows &amp; ${imp.headers.length} columns parsed
              </span>
            ` : ''}
          </div>
        </div>
      `}

      <!-- Google Drive Info Box -->
      <div style="background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:12px;padding:16px 20px;margin-top:24px;display:flex;align-items:flex-start;gap:12px">
        <span style="font-size:1.15rem;flex-shrink:0">💡</span>
        <div style="font-size:0.83rem;line-height:1.45">
          <strong style="color:var(--text-primary)">Google Drive Photo Links Supported:</strong>
          <span class="text-muted">
            If your sheet has a column with Google Drive share links (e.g. <code>https://drive.google.com/file/d/ID/view</code>), DV Events automatically converts them to direct viewable photos so portraits render seamlessly across profiles and rosters.
          </span>
        </div>
      </div>

      <!-- Action Footer -->
      <div class="flex justify-end gap-3" style="margin-top:32px;padding-top:24px;border-top:1px solid var(--border)">
        <button class="btn btn-secondary" onclick="navigate('resources')">Cancel</button>
        <button class="btn btn-primary" onclick="proceedToImportMapping()" ${!hasRows ? 'disabled style="opacity:0.5;cursor:not-allowed"' : ''}>
          Continue to Field Mapping →
        </button>
      </div>
    </div>
  `;
}

function switchImportSourceTab(tab) {
  state.resourceImport.sourceType = tab;
  renderResourceImportPage();
}

function handleImportSheetSelect(sheetName) {
  const imp = state.resourceImport;
  if (!imp.workbook) return;
  imp.selectedSheet = sheetName;
  const worksheet = imp.workbook.Sheets[sheetName];
  if (!worksheet) return;
  const parsed = getRowsFromSheet(worksheet);
  imp.headers = parsed.headers;
  imp.rawRows = parsed.rows;
  imp.columnMap = {};
  imp.headers.forEach((h, idx) => {
    imp.columnMap[idx] = autoDetectTargetField(h);
  });
  renderResourceImportPage();
}

function handleImportFileInput(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  readImportFile(file);
}

function handleImportFileDrop(e) {
  e.preventDefault();
  const dropzone = $('#import-dropzone');
  if (dropzone) dropzone.classList.remove('dragover');
  const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (!file) return;
  readImportFile(file);
}

function readImportFile(file) {
  const imp = state.resourceImport;
  imp.fileName = file.name;
  imp.fileSize = (file.size / 1024).toFixed(1) + ' KB';

  const reader = new FileReader();
  const isExcel = /\.(xlsx|xls)$/i.test(file.name);

  reader.onload = (e) => {
    try {
      if (isExcel) {
        if (typeof XLSX === 'undefined') {
          toast('SheetJS library is still loading. Please try again in a moment.', 'warning');
          return;
        }
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        imp.workbook = workbook;
        imp.sheetNames = workbook.SheetNames || [];
        imp.selectedSheet = imp.sheetNames[0] || 'Sheet1';
        const worksheet = workbook.Sheets[imp.selectedSheet];
        const parsed = getRowsFromSheet(worksheet);
        imp.headers = parsed.headers;
        imp.rawRows = parsed.rows;
      } else {
        const text = e.target.result;
        const parsed = parseDelimitedText(text);
        imp.headers = parsed.headers;
        imp.rawRows = parsed.rows;
        imp.workbook = null;
        imp.sheetNames = [];
      }

      if (!imp.rawRows.length) {
        toast('No rows of data detected in this file.', 'warning');
      } else {
        toast(`Loaded ${imp.rawRows.length} rows with ${imp.headers.length} columns.`, 'success');
      }

      // Pre-populate auto field mapping
      imp.columnMap = {};
      imp.headers.forEach((h, idx) => {
        imp.columnMap[idx] = autoDetectTargetField(h);
      });

      renderResourceImportPage();
    } catch (err) {
      console.error('File parsing error:', err);
      toast('Failed to parse file: ' + err.message, 'error');
    }
  };

  if (isExcel) {
    reader.readAsArrayBuffer(file);
  } else {
    reader.readAsText(file);
  }
}

function getRowsFromSheet(worksheet) {
  if (typeof XLSX === 'undefined') return { headers: [], rows: [] };
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  if (!data || !data.length) return { headers: [], rows: [] };
  const headers = (data[0] || []).map(h => String(h || '').trim());
  const rows = data.slice(1).filter(r => r.some(cell => String(cell || '').trim() !== ''));
  return { headers, rows };
}

function handleImportPasteInput() {
  const imp = state.resourceImport;
  const textarea = $('#import-paste-textarea');
  if (!textarea) return;
  imp.pastedText = textarea.value;
  const parsed = parseDelimitedText(imp.pastedText);
  imp.headers = parsed.headers;
  imp.rawRows = parsed.rows;
  imp.fileName = 'Pasted Data';
  imp.fileSize = '';

  imp.columnMap = {};
  imp.headers.forEach((h, idx) => {
    imp.columnMap[idx] = autoDetectTargetField(h);
  });

  const hasRows = imp.rawRows.length > 0;
  const submitBtn = $('#import-step-view button.btn-primary');
  if (submitBtn) {
    submitBtn.disabled = !hasRows;
    submitBtn.style.opacity = hasRows ? '1' : '0.5';
    submitBtn.style.cursor = hasRows ? 'pointer' : 'not-allowed';
  }
}

function proceedToImportMapping() {
  const imp = state.resourceImport;
  if (!imp.rawRows || !imp.rawRows.length) {
    toast('Please upload a file or paste data before continuing.', 'warning');
    return;
  }
  imp.step = 2;
  renderResourceImportPage();
}

// ─── Step 2: Field Mapping View ────────────────────────────────
function renderImportStep2() {
  const imp = state.resourceImport;
  const categories = state.categories || [];
  const managers = state.managersCache || [];
  const isLeadUser = auth.isLead();

  let mappedCount = 0;
  imp.headers.forEach((_, idx) => {
    if (imp.columnMap[idx] && imp.columnMap[idx] !== '__skip__') mappedCount++;
  });
  const totalHeaders = imp.headers.length || 1;
  const mappedPct = Math.round((mappedCount / totalHeaders) * 100);

  return `
    <div class="card p-6">
      <!-- Upgraded Step 2 Header -->
      <div class="mapping-header-card">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span style="font-size:1.2rem">🧭</span>
            <h3 style="font-size:1.15rem;font-weight:700;color:var(--text-primary);margin:0">
              Map Sheet Columns to Resource Fields
            </h3>
          </div>
          <p class="text-muted text-sm" style="margin:0">
            Match columns from <strong>${escapeHtml(imp.fileName || 'source data')}</strong> (${imp.rawRows.length} rows) to DV Events properties.
          </p>
        </div>
        <div class="flex items-center gap-4" style="flex-wrap:wrap">
          <div>
            <div class="flex items-center justify-between gap-3 text-xs font-semibold" style="color:var(--text-secondary)">
              <span>Mapping Progress</span>
              <span style="color:var(--accent);font-weight:700">${mappedPct}%</span>
            </div>
            <div class="mapping-progress-track">
              <div class="mapping-progress-bar" style="width:${mappedPct}%"></div>
            </div>
          </div>
          <span class="badge" style="background:rgba(99, 102, 241, 0.12);color:var(--accent);font-weight:700;padding:7px 14px;border:1px solid rgba(99, 102, 241, 0.25);font-size:0.82rem">
            ${mappedCount} of ${imp.headers.length} Mapped
          </span>
        </div>
      </div>

      <!-- Mapping Table -->
      <div class="mapping-table-wrap">
        <table class="mapping-table">
          <thead>
            <tr>
              <th style="width:28%">File Column Header</th>
              <th style="width:32%">Sample Value (Row 1 / 2)</th>
              <th style="width:28%">Target Resource Property</th>
              <th style="width:12%;text-align:center">Status</th>
            </tr>
          </thead>
          <tbody>
            ${imp.headers.map((header, idx) => {
              const currentTarget = imp.columnMap[idx] || '__skip__';
              const isMapped = currentTarget !== '__skip__';
              const firstRowVal = (imp.rawRows[0] && imp.rawRows[0][idx] !== undefined) ? String(imp.rawRows[0][idx]).trim() : '';
              const secondRowVal = (!firstRowVal && imp.rawRows[1] && imp.rawRows[1][idx] !== undefined) ? String(imp.rawRows[1][idx]).trim() : '';
              const sampleVal = firstRowVal || secondRowVal || '(empty)';

              return `
                <tr class="${isMapped ? 'is-mapped' : ''}">
                  <td>
                    <div class="flex items-center">
                      <span class="mapping-col-badge">Col ${idx + 1}</span>
                      <span style="font-weight:600;color:var(--text-primary);font-size:0.88rem">
                        ${escapeHtml(header || `Column ${idx + 1}`)}
                      </span>
                    </div>
                  </td>
                  <td>
                    <span class="mapping-preview-chip" title="${escapeHtml(sampleVal)}">
                      ${escapeHtml(sampleVal)}
                    </span>
                  </td>
                  <td>
                    <select class="mapping-select ${isMapped ? 'mapped' : ''}" onchange="handleMappingChange(${idx}, this.value)">
                      ${IMPORT_SYSTEM_FIELDS.map(f => `
                        <option value="${f.key}" ${currentTarget === f.key ? 'selected' : ''}>
                          ${f.label}
                        </option>
                      `).join('')}
                    </select>
                  </td>
                  <td style="text-align:center">
                    <span class="mapping-status-pill ${isMapped ? 'mapped' : 'skipped'}">
                      ${isMapped ? '✓ Mapped' : '○ Skip'}
                    </span>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>

      <!-- Fallback Defaults Card -->
      <div class="card p-5 mt-6" style="background:var(--bg-hover);border:1px solid var(--border);border-radius:12px">
        <div class="flex items-center gap-2 mb-2">
          <span style="font-size:1.1rem">⚙️</span>
          <h4 style="font-size:0.95rem;font-weight:700;margin:0;color:var(--text-primary)">
            Defaults for Unmapped or Blank Fields
          </h4>
        </div>
        <p class="text-xs text-muted" style="margin-bottom:14px">
          These fallback values will be applied to records where the property is missing or unmapped.
        </p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:16px">
          <div>
            <label class="form-label text-xs">Default Initial Status</label>
            <select class="form-input text-sm" id="import-default-status" onchange="state.resourceImport.defaults.status = this.value">
              <option value="available" ${imp.defaults.status === 'available' ? 'selected' : ''}>Available (Bench Pool)</option>
              <option value="nominated" ${imp.defaults.status === 'nominated' ? 'selected' : ''}>Nominated</option>
              <option value="pending_approval" ${imp.defaults.status === 'pending_approval' ? 'selected' : ''}>Pending Approval</option>
              <option value="confirmed" ${imp.defaults.status === 'confirmed' ? 'selected' : ''}>Confirmed</option>
              <option value="deployed" ${imp.defaults.status === 'deployed' ? 'selected' : ''}>Deployed (Active)</option>
              <option value="released" ${imp.defaults.status === 'released' ? 'selected' : ''}>Released</option>
              <option value="unavailable" ${imp.defaults.status === 'unavailable' ? 'selected' : ''}>Unavailable</option>
            </select>
          </div>
          <div>
            <label class="form-label text-xs">Default Category (if unmapped)</label>
            <select class="form-input text-sm" id="import-default-category" onchange="state.resourceImport.defaults.category_id = this.value">
              <option value="">-- None / Select Category --</option>
              ${categories.map(c => `
                <option value="${c.id}" ${String(imp.defaults.category_id) === String(c.id) ? 'selected' : ''}>${escapeHtml(c.name)}</option>
              `).join('')}
            </select>
          </div>
          ${isLeadUser ? `
            <div>
              <label class="form-label text-xs">Default Reporting Manager (Lead only)</label>
              <select class="form-input text-sm" id="import-default-manager" onchange="state.resourceImport.defaults.reporting_manager_id = this.value">
                <option value="">-- Organization Pool (No Manager) --</option>
                ${managers.map(m => `
                  <option value="${m.id}" ${String(imp.defaults.reporting_manager_id) === String(m.id) ? 'selected' : ''}>${escapeHtml(m.name)}</option>
                `).join('')}
              </select>
            </div>
          ` : `
            <div>
              <label class="form-label text-xs">Assigned Manager</label>
              <input type="text" class="form-input text-sm" value="${escapeHtml(auth.user?.name || 'My Profile')}" disabled style="opacity:0.7">
            </div>
          `}
        </div>
      </div>

      <!-- Action Footer -->
      <div class="flex justify-between items-center mt-6 pt-4" style="border-top:1px solid var(--border)">
        <button class="btn btn-secondary" onclick="state.resourceImport.step = 1; renderResourceImportPage()">
          ← Back to Source
        </button>
        <button class="btn btn-primary" onclick="proceedToImportPreview()">
          Preview &amp; Validate Data →
        </button>
      </div>
    </div>
  `;
}

function handleMappingChange(idx, targetKey) {
  state.resourceImport.columnMap[idx] = targetKey;
  renderResourceImportPage();
}

function proceedToImportPreview() {
  const imp = state.resourceImport;
  // Verify at least 'name' is mapped
  const mappedValues = Object.values(imp.columnMap);
  if (!mappedValues.includes('name')) {
    toast('Please map at least the "Full Name" property to proceed.', 'error');
    return;
  }

  // Transform rows based on current column mapping
  const transformed = [];
  const currentYear = new Date().getFullYear();

  for (let rIdx = 0; rIdx < imp.rawRows.length; rIdx++) {
    const rawRow = imp.rawRows[rIdx];
    const record = {
      name: '',
      contact_info: '',
      alternate_phone: null,
      age: null,
      dob: null,
      gender: null,
      zone: null,
      height: null,
      languages: null,
      availability: null,
      experience: null,
      opted_roles: null,
      photo_path: null,
      category_id: imp.defaults.category_id || null,
      skills: null,
      email: null,
      address: null,
      rate_amount: null,
      rate_type: 'per_day',
      bank_details: null,
      upi_id: null,
      id_type: null,
      id_number: null,
      reporting_manager_id: imp.defaults.reporting_manager_id || null,
      status: imp.defaults.status || 'available',
      notes: null,
      _originalRow: rIdx + 1,
      _isGoogleDrive: false
    };

    imp.headers.forEach((_, colIdx) => {
      const target = imp.columnMap[colIdx];
      if (!target || target === '__skip__') return;
      const rawVal = rawRow[colIdx];
      if (rawVal === undefined || rawVal === null) return;
      const strVal = String(rawVal).trim();

      if (target === 'name') record.name = strVal;
      else if (target === 'contact_info') record.contact_info = strVal;
      else if (target === 'alternate_phone') record.alternate_phone = strVal;
      else if (target === 'age') {
        const num = parseInt(strVal.replace(/[^0-9]/g, ''), 10);
        if (!isNaN(num) && num >= 14 && num <= 100) {
          record.age = num;
        }
      }
      else if (target === 'dob') {
        record.dob = formatImportDate(rawVal);
      }
      else if (target === 'gender') {
        const g = strVal.toLowerCase();
        if (g === 'm' || g === 'male' || g === 'man') record.gender = 'male';
        else if (g === 'f' || g === 'female' || g === 'woman') record.gender = 'female';
        else if (g === 'o' || g === 'other' || g === 'non-binary') record.gender = 'other';
        else record.gender = strVal;
      }
      else if (target === 'zone') record.zone = strVal;
      else if (target === 'height') record.height = strVal;
      else if (target === 'languages') record.languages = strVal;
      else if (target === 'availability') record.availability = strVal;
      else if (target === 'experience') record.experience = strVal;
      else if (target === 'opted_roles') record.opted_roles = strVal;
      else if (target === 'photo_path') {
        if (strVal) {
          if (strVal.includes('drive.google.com') || strVal.includes('docs.google.com') || strVal.includes('googleusercontent.com')) {
            record._isGoogleDrive = true;
          }
          record.photo_path = convertGoogleDriveUrl(strVal);
        }
      }
      else if (target === 'category_id') {
        record.category_id = strVal;
      }
      else if (target === 'skills') record.skills = strVal;
      else if (target === 'email') record.email = strVal;
      else if (target === 'address') record.address = strVal;
      else if (target === 'rate_amount') {
        const cleanRate = parseFloat(strVal.replace(/[^0-9.]/g, ''));
        if (!isNaN(cleanRate)) record.rate_amount = cleanRate;
      }
      else if (target === 'rate_type') {
        const rt = strVal.toLowerCase().replace(/\s+/g, '_');
        if (['per_day', 'per_shift', 'per_hour', 'fixed'].includes(rt)) record.rate_type = rt;
      }
      else if (target === 'bank_details') record.bank_details = strVal;
      else if (target === 'upi_id') record.upi_id = strVal;
      else if (target === 'id_type') record.id_type = strVal;
      else if (target === 'id_number') record.id_number = strVal;
      else if (target === 'reporting_manager_id') record.reporting_manager_id = strVal;
      else if (target === 'status') {
        if (strVal) record.status = strVal.toLowerCase().replace(/\s+/g, '_');
      }
      else if (target === 'notes') record.notes = strVal;
    });

    // Auto-match primary category from opted_roles if category_id not explicitly set
    if (record.opted_roles && (!record.category_id || record.category_id === imp.defaults.category_id)) {
      const optLower = record.opted_roles.toLowerCase();
      const matchedCat = (state.categories || []).find(c => {
        const cLower = c.name.toLowerCase();
        const words = cLower.split(/[\/\s]+/).filter(w => w.length > 3);
        return optLower.includes(cLower) || words.some(w => optLower.includes(w));
      });
      if (matchedCat) record.category_id = matchedCat.id;
    }

    // Auto-match manager ID by name (e.g. "Vijay", "Vidhi")
    if (record.reporting_manager_id) {
      const mStr = String(record.reporting_manager_id).trim().toLowerCase();
      const matchedMgr = (state.managersCache || []).find(m => m.name.toLowerCase() === mStr || m.name.toLowerCase().includes(mStr) || mStr.includes(m.name.toLowerCase()));
      if (matchedMgr) record.reporting_manager_id = matchedMgr.id;
    }

    // Auto-calculate DOB from Age if DOB is not provided
    if (!record.dob && record.age) {
      const birthYear = currentYear - record.age;
      record.dob = `${birthYear}-01-01`;
    }

    // Auto-calculate Age from DOB if Age is not provided
    if (record.dob && !record.age) {
      record.age = calculateAge(record.dob);
    }

    transformed.push(record);
  }

  imp.transformedData = transformed;
  imp.step = 3;
  renderResourceImportPage();
}

// ─── Step 3: Preview & Confirm ─────────────────────────────────
function renderImportStep3() {
  const imp = state.resourceImport;
  const items = imp.transformedData || [];
  const validItems = items.filter(i => i.name && i.name.trim());
  const invalidItems = items.filter(i => !i.name || !i.name.trim());
  const withPhotos = items.filter(i => i.photo_path);
  const withDrivePhotos = items.filter(i => i._isGoogleDrive);

  // Preview up to 15 rows
  const previewRows = items.slice(0, 15);

  return `
    <div class="card p-6">
      <div class="flex justify-between items-center mb-5" style="flex-wrap:wrap;gap:12px">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span style="font-size:1.2rem">🔍</span>
            <h3 style="font-size:1.15rem;font-weight:700;color:var(--text-primary);margin:0">
              Preview &amp; Validate Data
            </h3>
          </div>
          <p class="text-muted text-sm" style="margin:0">
            Review parsed resource records before onboarding into your resource pool.
          </p>
        </div>
      </div>

      <!-- Upgraded Stat Badges Grid -->
      <div class="import-kpi-grid">
        <div class="import-kpi-card">
          <div class="import-kpi-icon" style="background:rgba(99, 102, 241, 0.1);color:var(--accent)">📊</div>
          <div>
            <div class="text-xs text-muted font-medium">Total Rows</div>
            <div style="font-size:1.4rem;font-weight:700;color:var(--text-primary)">${items.length}</div>
          </div>
        </div>
        <div class="import-kpi-card" style="border-color:rgba(16, 185, 129, 0.25)">
          <div class="import-kpi-icon" style="background:rgba(16, 185, 129, 0.1);color:#10b981">👥</div>
          <div>
            <div class="text-xs text-muted font-medium">Ready to Import</div>
            <div style="font-size:1.4rem;font-weight:700;color:#10b981">${validItems.length}</div>
          </div>
        </div>
        <div class="import-kpi-card" style="border-color:rgba(59, 130, 246, 0.25)">
          <div class="import-kpi-icon" style="background:rgba(59, 130, 246, 0.1);color:#3b82f6">🖼️</div>
          <div>
            <div class="text-xs text-muted font-medium">Photos Converted</div>
            <div style="font-size:1.4rem;font-weight:700;color:#3b82f6">
              ${withPhotos.length}
              ${withDrivePhotos.length ? `<span class="text-xs font-normal" style="color:var(--text-muted)"> (${withDrivePhotos.length} Drive)</span>` : ''}
            </div>
          </div>
        </div>
        ${invalidItems.length ? `
          <div class="import-kpi-card" style="border-color:rgba(239, 68, 68, 0.25)">
            <div class="import-kpi-icon" style="background:rgba(239, 68, 68, 0.1);color:#ef4444">⚠️</div>
            <div>
              <div class="text-xs text-muted font-medium">Missing Name (Skipped)</div>
              <div style="font-size:1.4rem;font-weight:700;color:#ef4444">${invalidItems.length}</div>
            </div>
          </div>
        ` : `
          <div class="import-kpi-card" style="border-color:rgba(16, 185, 129, 0.25)">
            <div class="import-kpi-icon" style="background:rgba(16, 185, 129, 0.1);color:#10b981">✨</div>
            <div>
              <div class="text-xs text-muted font-medium">Data Integrity</div>
              <div style="font-size:1.15rem;font-weight:700;color:#10b981">100% Valid</div>
            </div>
          </div>
        `}
      </div>

      <!-- Live Preview Table -->
      <div class="import-preview-wrap">
        <table class="import-preview-table">
          <thead>
            <tr>
              <th style="width:40px">#</th>
              <th style="width:45px">Photo</th>
              <th>Full Name &amp; Contact</th>
              <th>Age / Gender / Ht</th>
              <th>Zone (Pune)</th>
              <th>Category &amp; Opted Roles</th>
              <th>Availability</th>
              <th>Status</th>
              <th>Experience</th>
            </tr>
          </thead>
          <tbody>
            ${previewRows.map((r, i) => {
              const initials = getInitials(r.name || '?');
              const hasPhoto = !!r.photo_path;
              const optedList = formatCrewOptedRoles(r.opted_roles);

              return `
                <tr ${!r.name ? 'style="opacity:0.5;background:rgba(239,68,68,0.05)"' : ''}>
                  <td style="color:var(--text-muted);font-size:0.75rem">${i + 1}</td>
                  <td>
                    <div class="import-avatar-thumb">
                      ${hasPhoto ? `
                        <img src="${escapeHtml(r.photo_path)}" alt="${escapeHtml(r.name)}" onerror="this.onerror=null;this.parentElement.textContent='${escapeHtml(initials)}'">
                      ` : initials}
                    </div>
                  </td>
                  <td>
                    <div style="font-weight:700;color:var(--text-primary)">
                      ${escapeHtml(r.name || '(Missing Name)')}
                    </div>
                    <div style="font-size:0.78rem;font-family:var(--font-mono,monospace);color:var(--text-muted);margin-top:2px">
                      📱 ${escapeHtml(r.contact_info || '—')}
                      ${r.alternate_phone ? ` · 🆘 ${escapeHtml(r.alternate_phone)}` : ''}
                    </div>
                  </td>
                  <td>
                    <div style="font-weight:600;font-size:0.82rem">
                      ${r.age ? `${r.age} yrs` : '—'}
                      ${r.gender ? ` · <span style="text-transform:capitalize">${escapeHtml(r.gender)}</span>` : ''}
                    </div>
                    ${r.height && r.height.toLowerCase() !== 'na' ? `<div class="text-xs text-muted">📏 ${escapeHtml(r.height)}</div>` : ''}
                  </td>
                  <td>
                    <span style="font-size:0.8rem;color:var(--text-primary);font-weight:500">
                      📍 ${escapeHtml(r.zone || 'Pune')}
                    </span>
                  </td>
                  <td>
                    <div>
                      <span class="badge" style="background:rgba(99,102,241,0.12);color:var(--accent);font-weight:600">
                        ${escapeHtml(getCategoryName(r.category_id) || 'General Staff')}
                      </span>
                    </div>
                    ${optedList.length ? `
                      <div class="text-xs text-muted" style="margin-top:3px;max-width:200px" title="${escapeHtml(r.opted_roles)}">
                        ${escapeHtml(optedList.slice(0, 2).join(', '))}${optedList.length > 2 ? ` +${optedList.length - 2}` : ''}
                      </div>
                    ` : ''}
                  </td>
                  <td>
                    <div style="font-size:0.8rem;font-weight:500;color:var(--text-primary)">
                      🗓️ ${escapeHtml(r.availability || 'Flexible')}
                    </div>
                  </td>
                  <td>
                    ${badge(r.status || 'available')}
                  </td>
                  <td>
                    ${r.experience ? `
                      <div class="text-xs text-truncate" style="max-width:140px;color:var(--text-muted)" title="${escapeHtml(r.experience)}">
                        💼 ${escapeHtml(r.experience)}
                      </div>
                    ` : '<span class="text-muted text-xs">—</span>'}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>

      ${items.length > 15 ? `
        <div class="text-center text-xs text-muted mt-3">
          Showing first 15 of ${items.length} records. All ${validItems.length} valid records will be imported.
        </div>
      ` : ''}

      <!-- Action Footer -->
      <div class="flex justify-between items-center mt-6 pt-4" style="border-top:1px solid var(--border)">
        <button class="btn btn-secondary" onclick="state.resourceImport.step = 2; renderResourceImportPage()">
          ← Adjust Field Mapping
        </button>
        <button class="btn btn-primary" id="import-execute-btn" onclick="executeResourceBulkImport()" ${!validItems.length ? 'disabled style="opacity:0.5;cursor:not-allowed"' : ''}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          Confirm &amp; Import ${validItems.length} Resources
        </button>
      </div>
    </div>
  `;
}

function getCategoryName(catIdOrName) {
  if (!catIdOrName) return '';
  const cats = state.categories || [];
  const found = cats.find(c => String(c.id) === String(catIdOrName) || c.name.toLowerCase() === String(catIdOrName).toLowerCase());
  return found ? found.name : String(catIdOrName);
}

async function executeResourceBulkImport() {
  const imp = state.resourceImport;
  const items = (imp.transformedData || []).filter(i => i.name && i.name.trim());
  if (!items.length) {
    toast('No valid records to import.', 'error');
    return;
  }

  const btn = $('#import-execute-btn');
  if (btn) {
    btn.disabled = true;
    btn.classList.add('loading');
    btn.innerHTML = `<span class="spinner" style="width:16px;height:16px;margin-right:8px"></span> Importing ${items.length} resources...`;
  }

  try {
    const payload = {
      resources: items,
      default_status: imp.defaults.status,
      default_category_id: imp.defaults.category_id,
      default_manager_id: imp.defaults.reporting_manager_id
    };

    const res = await api('/resources/bulk', 'POST', payload);
    if (!res.success) throw new Error(res.error || 'Import failed');

    imp.result = res;
    imp.step = 4;

    // Invalidate resources cache so updated pool shows up
    state.resourcesLoaded = false;
    toast(`Successfully imported ${res.imported_count} resources!`, 'success');
    renderResourceImportPage();
  } catch (err) {
    console.error('Import execution error:', err);
    toast('Import failed: ' + err.message, 'error');
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('loading');
      btn.innerHTML = `Confirm &amp; Import ${items.length} Resources`;
    }
  }
}

// ─── Step 4: Import Complete Summary ───────────────────────────
function renderImportStep4() {
  const imp = state.resourceImport;
  const res = imp.result || {};
  const importedCount = res.imported_count || 0;
  const skippedCount = res.skipped_count || 0;

  return `
    <div class="card p-8 text-center" style="max-width:640px;margin:0 auto">
      <div style="font-size:3.5rem;margin-bottom:14px">🎉</div>
      <h3 style="font-size:1.5rem;font-weight:700;color:var(--text-primary);margin-bottom:8px">
        Import Successful!
      </h3>
      <p class="text-muted" style="margin-bottom:24px">
        Successfully onboarded <strong style="color:#10b981">${importedCount} resources</strong> into the DV Events organization resource pool.
        ${skippedCount ? `<br><span class="text-xs" style="color:var(--text-muted)">(${skippedCount} invalid rows with missing names were skipped)</span>` : ''}
      </p>

      <div class="flex justify-center gap-3">
        <button class="btn btn-secondary" onclick="initResourceImportState(); renderResourceImportPage()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          Import Another File
        </button>
        <button class="btn btn-primary" onclick="navigate('resources')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
          View Resources Directory →
        </button>
      </div>
    </div>
  `;
}

function attachImportStepListeners() {
  const dropzone = $('#import-dropzone');
  if (dropzone) {
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dragover');
    });
    dropzone.addEventListener('drop', handleImportFileDrop);
  }
}

// ─── Sample Template Generators ────────────────────────────────
function downloadSampleImportCsv() {
  const headers = ['Full Name', 'Phone Number', 'Age', 'Date of Birth', 'Gender', 'Profile Photo (Google Drive Link)', 'Category', 'Skills', 'Email', 'Address', 'Daily Rate', 'ID Type', 'ID Number', 'Notes'];
  const sampleRows = [
    ['Aarav Sharma', '+91 98765 43210', '26', '1998-05-14', 'Male', 'https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OIvE2e14D/view?usp=sharing', 'Bouncer', 'Access control, VIP escort, Crowd management', 'aarav@example.com', 'Andheri West, Mumbai', '2000', 'Aadhaar', '9876 5432 1098', 'Verified bouncer with 3 years event experience'],
    ['Priya Patel', '+91 98765 43211', '23', '2001-08-20', 'Female', 'https://drive.google.com/file/d/1XyZ-98_abc/view', 'Hostess', 'Guest reception, Multilingual, Registration', 'priya.patel@example.com', 'Bandra, Mumbai', '1800', 'PAN', 'ABCDE1234F', 'Fluent in English and Hindi'],
    ['Karan Verma', '+91 98765 43212', '28', '1996-01-10', 'Male', '', 'Bartender', 'Cocktail mixing, Inventory, Cash handling', 'karan.v@example.com', 'Colaba, Mumbai', '2500', 'Aadhaar', '1234 5678 9012', 'Certified mixologist']
  ];

  const csvContent = [headers.join(','), ...sampleRows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'dv_events_resources_template.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Downloaded sample CSV template.', 'info');
}

function downloadSampleImportExcel() {
  if (typeof XLSX === 'undefined') {
    return downloadSampleImportCsv();
  }
  const headers = ['Full Name', 'Phone Number', 'Age', 'Date of Birth', 'Gender', 'Profile Photo (Google Drive Link)', 'Category', 'Skills', 'Email', 'Address', 'Daily Rate', 'ID Type', 'ID Number', 'Notes'];
  const data = [
    headers,
    ['Aarav Sharma', '+91 98765 43210', 26, '1998-05-14', 'Male', 'https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OIvE2e14D/view?usp=sharing', 'Bouncer', 'Access control, VIP escort, Crowd management', 'aarav@example.com', 'Andheri West, Mumbai', 2000, 'Aadhaar', '9876 5432 1098', 'Verified bouncer with 3 years event experience'],
    ['Priya Patel', '+91 98765 43211', 23, '2001-08-20', 'Female', 'https://drive.google.com/file/d/1XyZ-98_abc/view', 'Hostess', 'Guest reception, Multilingual, Registration', 'priya.patel@example.com', 'Bandra, Mumbai', 1800, 'PAN', 'ABCDE1234F', 'Fluent in English and Hindi'],
    ['Karan Verma', '+91 98765 43212', 28, '1996-01-10', 'Male', '', 'Bartender', 'Cocktail mixing, Inventory, Cash handling', 'karan.v@example.com', 'Colaba, Mumbai', 2500, 'Aadhaar', '1234 5678 9012', 'Certified mixologist']
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Resources');
  XLSX.writeFile(wb, 'dv_events_resources_template.xlsx');
  toast('Downloaded sample Excel template.', 'info');
}


