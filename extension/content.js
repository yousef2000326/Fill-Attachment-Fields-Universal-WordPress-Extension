/* =============================================================
 * Fill Attachment Fields — Content Script (Universal WP)
 * -------------------------------------------------------------
 * يعمل على أي موقع ووردبريس (جذر النطاق أو مجلد فرعي).
 * يضيف زر "املأ من عنوان المنتج" داخل لوحة تفاصيل المرفق
 * في مكتبة وسائط ووردبريس، ويملأ حقول المرفق من عنوان المنتج.
 * ============================================================= */

(() => {
  'use strict';

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

  /* ---------- أدوات مساعدة ---------- */

  const loadSettings = () =>
    new Promise((resolve) => {
      try {
        chrome.storage.sync.get(STORAGE_KEY, (data) => {
          resolve({ ...DEFAULT_SETTINGS, ...(data[STORAGE_KEY] || {}) });
        });
      } catch (e) {
        resolve({ ...DEFAULT_SETTINGS });
      }
    });

  const isSiteExcluded = (settings) => {
    try {
      const host = location.hostname;
      return (settings.excludedSites || []).some((s) => s === host || host.endsWith(`.${s}`));
    } catch (e) {
      return false;
    }
  };

  /** التحقق من أن الصفحة هي صفحة تحرير منتج/مقال في ووردبريس */
  const isWpAdminPostPage = () => {
    const p = location.pathname;
    return (
      (p.endsWith('/wp-admin/post.php') || p.includes('/wp-admin/post.php')) ||
      (p.endsWith('/wp-admin/post-new.php') || p.includes('/wp-admin/post-new.php'))
    );
  };

  /** جلب عنوان المنتج الحالي */
  const getPostTitle = () => {
    // ووردبريس القياسي
    const titleInput = document.querySelector('#title');
    if (titleInput && titleInput.value.trim()) return titleInput.value.trim();

    // محاولة احتياطية: بعض القوالب تستخدم حقلًا مختلفًا
    const alt = document.querySelector('input[name="post_title"], #post-title, input#title');
    if (alt && alt.value.trim()) return alt.value.trim();

    return '';
  };

  /** ملء حقول المرفق بناءً على الإعدادات */
  const fillAttachment = (panel, title, settings) => {
    if (!title) return 0;

    // محددات الحقول في مكتبة وسائط ووردبريس
    const fields = [
      { el: panel.querySelector('#attachment-details-alt-text'),     enabled: settings.fillAlt,         name: 'alt' },
      { el: panel.querySelector('#attachment-details-title'),        enabled: settings.fillTitle,       name: 'title' },
      { el: panel.querySelector('#attachment-details-caption'),      enabled: settings.fillCaption,     name: 'caption' },
      { el: panel.querySelector('#attachment-details-description'),  enabled: settings.fillDescription, name: 'description' }
    ];

    let filledCount = 0;
    fields.forEach(({ el, enabled }) => {
      if (!el || !enabled) return;

      // دعم حقول textarea (الوصف)
      el.value = title;

      // إطلاق الأحداث حتى يلتقطها ووردبريس/ريأكت
      ['input', 'change', 'blur'].forEach((evtName) => {
        el.dispatchEvent(new Event(evtName, { bubbles: true }));
      });

      filledCount += 1;
    });

    // تأثير بصري
    panel.classList.add('faf-flash');
    setTimeout(() => panel.classList.remove('faf-flash'), 700);

    return filledCount;
  };

  /** إنشاء زر الملء */
  const createFillButton = (settings) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'faf-btn-wrapper';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = settings.buttonText || 'املأ من عنوان المنتج';
    btn.className = 'faf-fill-btn button button-small button-primary';
    btn.setAttribute('aria-label', settings.buttonText || 'ملء حقول المرفق من عنوان المنتج');

    // أيقونة SVG مدمجة
    btn.insertAdjacentHTML('afterbegin', `
      <svg class="faf-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M4 4h10v4H4z"/>
        <path d="M4 12h16M4 16h12"/>
        <path d="M19 8l3 3-7 7H12v-3l7-7z"/>
      </svg>
    `);

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const title = getPostTitle();
      if (!title) {
        // eslint-disable-next-line no-alert
        alert('لم يتم العثور على عنوان المنتج. تأكد من فتح صفحة تحرير المنتج.');
        return;
      }
      const fresh = await loadSettings();
      const filled = fillAttachment(panel, title, fresh);
      if (filled > 0) {
        reportStats(filled);
      }
    });

    wrapper.appendChild(btn);

    let panel = null;
    return { wrapper, btn, setPanel: (p) => { panel = p; } };
  };

  /** إرسال الإحصائيات للـ background */
  const reportStats = (imageCount) => {
    try {
      chrome.runtime.sendMessage({ type: 'increment-stats', imageCount });
    } catch (e) {
      /* تجاهل */
    }
  };

  /** إضافة الأزرار إلى كل لوحات المرفقات الجاهزة */
  const addButtons = async () => {
    const settings = await loadSettings();
    if (!settings.enabled) return;
    if (isSiteExcluded(settings)) return;

    const panels = document.querySelectorAll('.attachment-details.save-ready');
    panels.forEach((panel) => {
      if (panel.querySelector('.faf-btn-wrapper')) return;

      const { wrapper, btn, setPanel } = createFillButton(settings);
      setPanel(panel);
      panel.insertBefore(wrapper, panel.firstChild);
    });
  };

  /** الملء التلقائي عند رفع صورة جديدة (اختياري) */
  const maybeAutoFill = async (panel) => {
    const settings = await loadSettings();
    if (!settings.enabled || !settings.autoFillOnUpload) return;
    if (isSiteExcluded(settings)) return;

    const title = getPostTitle();
    if (!title) return;

    const filled = fillAttachment(panel, title, settings);
    if (filled > 0) reportStats(filled);
  };

  /* ---------- مراقب الطفرات (debounced) ---------- */

  let debounceTimer = null;
  const observer = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      addButtons();
      // محاولة الملء التلقائي للوحات الجديدة
      document
        .querySelectorAll('.attachment-details.save-ready')
        .forEach((panel) => {
          if (!panel.dataset.fafAutofilled) {
            panel.dataset.fafAutofilled = '1';
            maybeAutoFill(panel);
          }
        });
    }, 200);
  });

  /* ---------- الاستماع لأوامر الخلفية ---------- */

  try {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.action === 'fill-current') {
        // ابحث عن اللوحة الظاهرة حاليًا (آخر لوحة save-ready مرئية)
        const panels = document.querySelectorAll('.attachment-details.save-ready');
        if (!panels.length) {
          sendResponse({ ok: false, reason: 'no-attachment-open' });
          return true;
        }
        // اختر آخر لوحة (عادةً تكون الأخيرة هي النشطة)
        const panel = panels[panels.length - 1];
        const title = getPostTitle();
        if (!title) {
          sendResponse({ ok: false, reason: 'no-title' });
          return true;
        }
        loadSettings().then((settings) => {
          const filled = fillAttachment(panel, title, settings);
          if (filled > 0) reportStats(filled);
          sendResponse({ ok: true, filled });
        });
        return true;
      }

      if (msg.action === 'settings-updated') {
        // إعادة تقييم: لو الإضافة متوقفة أو الموقع محظور، نزيل الأزرار
        loadSettings().then((settings) => {
          if (!settings.enabled || isSiteExcluded(settings)) {
            document.querySelectorAll('.faf-btn-wrapper').forEach((w) => w.remove());
          } else {
            addButtons();
          }
        });
      }
    });
  } catch (e) {
    /* تجاهل */
  }

  /* ---------- بدء التشغيل ---------- */

  const init = async () => {
    if (!isWpAdminPostPage()) return;

    await addButtons();
    observer.observe(document.body, { childList: true, subtree: true });
  };

  init();
})();
