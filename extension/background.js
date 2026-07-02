/* =============================================================
 * Fill Attachment Fields — Background Service Worker
 * -------------------------------------------------------------
 * المهام:
 *  1) الاستماع لأوامر لوحة المفاتيح وإرسال رسالة للـ content script.
 *  2) تتبّع الإحصائيات (عدد مرات الملء، عدد الصور المملوءة).
 *  3) تحديث شارة الأيقونة (badge) عند تفعيل/تعطيل الإضافة.
 * ============================================================= */

const STORAGE_KEY = 'faf_settings';
const STATS_KEY = 'faf_stats';

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

const DEFAULT_STATS = {
  totalFilled: 0,
  totalImages: 0,
  lastUsed: null,
  sites: {}
};

/** قراءة الإعدادات */
const getSettings = () =>
  new Promise((resolve) => {
    chrome.storage.sync.get(STORAGE_KEY, (data) => {
      resolve({ ...DEFAULT_SETTINGS, ...(data[STORAGE_KEY] || {}) });
    });
  });

/** قراءة الإحصائيات */
const getStats = () =>
  new Promise((resolve) => {
    chrome.storage.local.get(STATS_KEY, (data) => {
      resolve({ ...DEFAULT_STATS, ...(data[STATS_KEY] || {}) });
    });
  });

/** تحديث شارة الأيقونة */
const updateBadge = async () => {
  const settings = await getSettings();
  try {
    if (settings.enabled) {
      await chrome.action.setBadgeText({ text: '' });
    } else {
      await chrome.action.setBadgeText({ text: 'OFF' });
      await chrome.action.setBadgeBackgroundColor({ color: '#d63638' });
    }
  } catch (e) {
    /* تجاهل */
  }
};

/** زيادة عداد الإحصائيات */
const incrementStats = async (hostname, imageCount = 1) => {
  const stats = await getStats();
  stats.totalFilled += 1;
  stats.totalImages += imageCount;
  stats.lastUsed = new Date().toISOString();
  stats.sites[hostname] = (stats.sites[hostname] || 0) + imageCount;
  await chrome.storage.local.set({ [STATS_KEY]: stats });
};

/** الاستماع لأوامر لوحة المفاتيح */
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'fill-current-attachment') return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'fill-current' });
  } catch (e) {
    /* التبويب قد لا يكون صفحة ووردبريس */
  }
});

/** الاستماع لرسائل من content script */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'increment-stats') {
    const hostname = sender?.tab?.url ? new URL(sender.tab.url).hostname : 'unknown';
    incrementStats(hostname, msg.imageCount || 1).then(() => {
      sendResponse({ ok: true });
    });
    return true; // استدعاء غير متزامن
  }

  if (msg.type === 'get-stats') {
    getStats().then(sendResponse);
    return true;
  }

  if (msg.type === 'reset-stats') {
    chrome.storage.local.set({ [STATS_KEY]: { ...DEFAULT_STATS } }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }
});

/** تحديث الشارة عند التثبيت وتحديث الإعدادات */
chrome.runtime.onInstalled.addListener(updateBadge);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes[STORAGE_KEY]) {
    updateBadge();
  }
});

// تحديث الشارة عند بدء التشغيل
updateBadge();
