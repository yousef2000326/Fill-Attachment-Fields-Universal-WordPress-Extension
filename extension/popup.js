/* =============================================================
 * Fill Attachment Fields — Popup Script
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

const FIELDS = [
  'enabled',
  'fillAlt',
  'fillTitle',
  'fillCaption',
  'fillDescription',
  'autoFillOnUpload'
];

const statusToast = document.getElementById('statusToast');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
let toastTimer = null;

const showToast = (msg, type = 'success') => {
  statusToast.textContent = msg;
  statusToast.style.background = type === 'error' ? 'var(--danger)' : 'var(--success)';
  statusToast.classList.add('visible');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    statusToast.classList.remove('visible');
  }, 1800);
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
    try {
      chrome.runtime.sendMessage({ type: 'get-stats' }, (stats) => {
        resolve(stats || { totalFilled: 0, totalImages: 0, sites: {} });
      });
    } catch (e) {
      resolve({ totalFilled: 0, totalImages: 0, sites: {} });
    }
  });

const updateStatsUI = async () => {
  const stats = await loadStats();
  document.getElementById('statFilled').textContent = stats.totalFilled || 0;
  document.getElementById('statImages').textContent = stats.totalImages || 0;
  document.getElementById('statSites').textContent = Object.keys(stats.sites || {}).length;
};

const applyTheme = (theme) => {
  document.body.setAttribute('data-theme', theme);
};

const updateEnabledUI = (enabled) => {
  if (enabled) {
    statusDot.classList.remove('off');
    statusText.textContent = 'الإضافة تعمل على جميع مواقع ووردبريس';
  } else {
    statusDot.classList.add('off');
    statusText.textContent = 'الإضافة متوقفة مؤقتًا';
  }
};

const init = async () => {
  const settings = await load();

  // تطبيق المظهر
  applyTheme(settings.theme || 'auto');

  // تعبئة عناصر الواجهة بالقيم الحالية
  FIELDS.forEach((key) => {
    const el = document.getElementById(key);
    if (!el) return;
    el.checked = !!settings[key];

    el.addEventListener('change', async () => {
      const current = await load();
      current[key] = el.checked;
      await save(current);
      showToast('تم الحفظ ✓');

      if (key === 'enabled') {
        updateEnabledUI(el.checked);
        updateSubFieldsState(el.checked);
      }

      // إعلام الـ content script بتحديث الإعدادات
      notifyContentScript();
    });
  });

  // نص الزر
  const btnTextInput = document.getElementById('buttonText');
  btnTextInput.value = settings.buttonText || 'املأ من عنوان المنتج';
  let btnTextTimer = null;
  btnTextInput.addEventListener('input', async () => {
    if (btnTextTimer) clearTimeout(btnTextTimer);
    btnTextTimer = setTimeout(async () => {
      const current = await load();
      current.buttonText = btnTextInput.value.trim() || 'املأ من عنوان المنتج';
      await save(current);
      showToast('تم الحفظ ✓');
      notifyContentScript();
    }, 400);
  });

  // تفعيل/تعطيل الحقول الفرعية
  const enabledEl = document.getElementById('enabled');
  const updateSubFieldsState = (enabled) => {
    ['fillAlt', 'fillTitle', 'fillCaption', 'fillDescription', 'autoFillOnUpload'].forEach((k) => {
      const el = document.getElementById(k);
      if (el) el.disabled = !enabled;
    });
    btnTextInput.disabled = !enabled;
  };
  updateSubFieldsState(enabledEl.checked);
  updateEnabledUI(enabledEl.checked);

  // زر تبديل المظهر
  const themeToggle = document.getElementById('themeToggle');
  themeToggle.addEventListener('click', async () => {
    const current = await load();
    const currentTheme = current.theme || 'auto';
    const next = currentTheme === 'light' ? 'dark' : currentTheme === 'dark' ? 'auto' : 'light';
    current.theme = next;
    await save(current);
    applyTheme(next);
    showToast(`المظهر: ${next === 'auto' ? 'تلقائي' : next === 'dark' ? 'ليلي' : 'نهاري'}`);
  });

  // زر فتح صفحة الإعدادات الكاملة
  document.getElementById('openOptions').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // تحديث الإحصائيات
  updateStatsUI();
};

const notifyContentScript = () => {
  try {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'settings-updated' }).catch(() => {});
      }
    });
  } catch (e) {
    /* تجاهل */
  }
};

document.addEventListener('DOMContentLoaded', init);
