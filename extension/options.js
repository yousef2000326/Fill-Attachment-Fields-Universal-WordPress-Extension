/* =============================================================
 * Fill Attachment Fields — Options Page Script
 * ============================================================= */

const STORAGE_KEY = 'faf_settings';

const DEFAULT_SETTINGS = {
  enabled: true,
  fillAlt: true,
  fillTitle: true,
  fillCaption: false,
  fillDescription: false,
  autoFillOnUpload: false,
  theme: 'auto',
  buttonText: 'املأ من عنوان المنتج',
  excludedSites: []
};

const toast = document.getElementById('toast');
let toastTimer = null;

const showToast = (msg, type = 'success') => {
  toast.textContent = msg;
  toast.style.background = type === 'error' ? 'var(--danger)' : 'var(--success)';
  toast.classList.add('visible');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 1800);
};

const load = () =>
  new Promise((resolve) => {
    chrome.storage.sync.get(STORAGE_KEY, (data) => {
      resolve({ ...DEFAULT_SETTINGS, ...(data[STORAGE_KEY] || {}) });
    });
  });

const save = (settings) =>
  new Promise((resolve) => {
    chrome.storage.sync.set({ [STORAGE_KEY]: settings }, resolve);
  });

const loadStats = () =>
  new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'get-stats' }, (stats) => {
      resolve(stats || { totalFilled: 0, totalImages: 0, lastUsed: null, sites: {} });
    });
  });

/* ---------- التنقل بين التبويبات ---------- */
const initTabs = () => {
  const items = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('.tab-section');

  items.forEach((item) => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = item.dataset.tab;
      items.forEach((i) => i.classList.remove('active'));
      sections.forEach((s) => s.classList.remove('active'));
      item.classList.add('active');
      document.getElementById(`tab-${tab}`).classList.add('active');

      if (tab === 'stats') refreshStats();
      if (tab === 'sites') refreshSites();
    });
  });
};

/* ---------- تطبيق المظهر ---------- */
const applyTheme = (theme) => {
  document.body.setAttribute('data-theme', theme);
};

/* ---------- تبويب: عام ---------- */
const initGeneral = async () => {
  const settings = await load();

  document.getElementById('opt-enabled').checked = settings.enabled;
  document.getElementById('opt-autoFillOnUpload').checked = settings.autoFillOnUpload;
  document.getElementById('opt-buttonText').value = settings.buttonText || 'املأ من عنوان المنتج';

  // المظهر
  document.querySelector(`input[name="theme"][value="${settings.theme || 'auto'}"]`).checked = true;
  applyTheme(settings.theme || 'auto');

  // الاستماع للتغييرات
  document.getElementById('opt-enabled').addEventListener('change', async (e) => {
    const current = await load();
    current.enabled = e.target.checked;
    await save(current);
    showToast('تم الحفظ ✓');
  });

  document.getElementById('opt-autoFillOnUpload').addEventListener('change', async (e) => {
    const current = await load();
    current.autoFillOnUpload = e.target.checked;
    await save(current);
    showToast('تم الحفظ ✓');
  });

  let btnTimer = null;
  document.getElementById('opt-buttonText').addEventListener('input', (e) => {
    if (btnTimer) clearTimeout(btnTimer);
    btnTimer = setTimeout(async () => {
      const current = await load();
      current.buttonText = e.target.value.trim() || 'املأ من عنوان المنتج';
      await save(current);
      showToast('تم الحفظ ✓');
    }, 400);
  });

  document.querySelectorAll('input[name="theme"]').forEach((input) => {
    input.addEventListener('change', async (e) => {
      const current = await load();
      current.theme = e.target.value;
      await save(current);
      applyTheme(current.theme);
      showToast('تم الحفظ ✓');
    });
  });
};

/* ---------- تبويب: الحقول ---------- */
const initFields = async () => {
  const settings = await load();
  ['fillAlt', 'fillTitle', 'fillCaption', 'fillDescription'].forEach((key) => {
    const el = document.getElementById(`opt-${key}`);
    el.checked = settings[key];
    el.addEventListener('change', async (e) => {
      const current = await load();
      current[key] = e.target.checked;
      await save(current);
      showToast('تم الحفظ ✓');
    });
  });
};

/* ---------- تبويب: المواقع ---------- */
const refreshSites = async () => {
  const settings = await load();
  const list = document.getElementById('sitesList');
  const empty = document.getElementById('sitesEmpty');
  list.innerHTML = '';

  const sites = settings.excludedSites || [];
  if (sites.length === 0) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  sites.forEach((site) => {
    const item = document.createElement('div');
    item.className = 'site-item';
    item.innerHTML = `
      <span class="site-name">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
        ${escapeHtml(site)}
      </span>
      <button class="site-remove" data-site="${escapeHtml(site)}" title="إزالة">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    `;
    list.appendChild(item);
  });

  list.querySelectorAll('.site-remove').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const site = btn.dataset.site;
      const current = await load();
      current.excludedSites = (current.excludedSites || []).filter((s) => s !== site);
      await save(current);
      refreshSites();
      showToast('تمت الإزالة ✓');
    });
  });
};

const initSites = () => {
  const form = document.getElementById('siteForm');
  const input = document.getElementById('siteInput');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    let site = input.value.trim().toLowerCase();
    if (!site) return;

    // إزالة البروتوكول والمسار
    site = site.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');

    if (!site) {
      showToast('الرجاء إدخال نطاق صحيح', 'error');
      return;
    }

    const current = await load();
    current.excludedSites = current.excludedSites || [];
    if (current.excludedSites.includes(site)) {
      showToast('الموقع موجود بالفعل', 'error');
      return;
    }
    current.excludedSites.push(site);
    await save(current);
    input.value = '';
    refreshSites();
    showToast('تمت الإضافة ✓');
  });
};

/* ---------- تبويب: الإحصائيات ---------- */
const refreshStats = async () => {
  const stats = await loadStats();
  document.getElementById('opt-stat-filled').textContent = stats.totalFilled || 0;
  document.getElementById('opt-stat-images').textContent = stats.totalImages || 0;
  document.getElementById('opt-stat-sites').textContent = Object.keys(stats.sites || {}).length;

  if (stats.lastUsed) {
    const d = new Date(stats.lastUsed);
    document.getElementById('opt-stat-last').textContent = d.toLocaleString('ar-EG', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  }

  // عرض قائمة المواقع
  const sitesCard = document.getElementById('sitesStatsCard');
  const sitesList = document.getElementById('sitesStatsList');
  const entries = Object.entries(stats.sites || {}).sort((a, b) => b[1] - a[1]);

  if (entries.length > 0) {
    sitesCard.style.display = 'block';
    sitesList.innerHTML = entries
      .map(
        ([site, count]) => `
        <div class="site-stat-row">
          <span class="site-stat-name">${escapeHtml(site)}</span>
          <span class="site-stat-count">${count} صورة</span>
        </div>
      `
      )
      .join('');
  } else {
    sitesCard.style.display = 'none';
  }
};

const initStats = () => {
  document.getElementById('resetStats').addEventListener('click', async () => {
    if (!confirm('هل أنت متأكد من تصفير جميع الإحصائيات؟')) return;
    await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'reset-stats' }, resolve);
    });
    refreshStats();
    showToast('تم التصفير ✓');
  });
};

/* ---------- أدوات ---------- */
const escapeHtml = (str) =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

/* ---------- بدء التشغيل ---------- */
document.addEventListener('DOMContentLoaded', async () => {
  initTabs();
  await initGeneral();
  await initFields();
  initSites();
  initStats();
  refreshStats();
  refreshSites();
});
