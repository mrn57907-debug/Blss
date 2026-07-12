/* ══════════════════════════════════════════════════════════════
   BACK NAV — محرك سجل التنقل الداخلي (زر الرجوع الاحترافي)
   ملف مستقل بالكامل — لا يعدّل أي منطق تنقل موجود.

   الفكرة:
   ▸ كل "فتح" (صفحة/تاب/قسم منتدى/سايدبار...) يُسجَّل كخطوة في سجل
     المتصفح الفعلي (history.pushState) + سجل داخلي يحمل دالة "استعادة"
     تُعيدنا للحالة السابقة تحديدًا.
   ▸ عند الضغط على زر الرجوع الفعلي في الهاتف/المتصفح (popstate)،
     نُنفّذ آخر دالة استعادة مسجّلة بدل الخروج من الموقع.
   ▸ عند الضغط على أزرار "رجوع/إغلاق" داخل الواجهة نفسها، تُفوَّض
     العملية لسجل المتصفح (history.back()) بدل التنفيذ المباشر،
     حتى يبقى الزر الفعلي متزامنًا دائمًا مع أزرار الواجهة.
   ▸ الموقع لا يُغلق فعليًا إلا بعد استهلاك كل خطوات السجل.

   هذا الملف لا يستدعي أي دالة تنقل بنفسه؛ فقط يوفّر window._navPush
   و window._navGoBackIfMatches ليستخدمهما index.html في نقاط ربط
   صغيرة جدًا داخل دوال التنقل الحالية (showPage, goTab, ...).
══════════════════════════════════════════════════════════════ */

(function () {
  let _navStack     = [];   // { tag, restore } — كل عنصر يمثل خطوة رجوع واحدة
  let _isRestoring  = false;
  let _backPending  = false; // true بين استدعاء history.back() ووصول popstate الخاص بها فعليًا

  // نقطة أساس لسجل المتصفح إن لم تكن موجودة (أول تحميل للموقع)
  if (!history.state || typeof history.state.navDepth !== "number") {
    history.replaceState({ navDepth: 0 }, "");
  }

  /* تسجيل خطوة "فتح" جديدة — تُستدعى من نقاط الربط داخل دوال الفتح.
     إن كانت هناك history.back() معلّقة (إغلاق سريع جدًا تبعه فتح فوري)، نؤجّل
     التسجيل جزءًا من الثانية حتى تستقر حالة سجل المتصفح، لتفادي تعارض التوقيت
     بين pushState وback() غير المتزامنة. */
  function _navPush(tag, restoreFn) {
    if (_isRestoring) return;
    if (_backPending) { setTimeout(() => _navPush(tag, restoreFn), 30); return; }
    _navStack.push({ tag, restore: restoreFn });
    history.pushState({ navDepth: _navStack.length }, "");
  }

  /* تُستدعى من دوال "الإغلاق/الرجوع" اليدوية داخل الواجهة (صفحات/تابات/سايدبار).
     إن كانت أعلى خطوة في السجل تطابق نفس الشاشة المطلوب إغلاقها،
     تُفوَّض العملية لسجل المتصفح (history.back()) وتُعيد true
     (فتتولى popstate تنفيذ الإغلاق الفعلي عبر دالة الاستعادة المخزّنة).
     إن لم توجد مطابقة، تُعيد false ليُكمل الكود الأصلي عمله كما كان
     تمامًا (سلوك المشروع الحالي بدون أي تغيير). */
  function _navGoBackIfMatches(tag) {
    if (_isRestoring) return false;
    const top = _navStack[_navStack.length - 1];
    if (top && top.tag === tag) {
      _backPending = true;
      history.back();
      return true;
    }
    return false;
  }

  /* تُستدعى فقط من مراقب النوافذ المنبثقة أدناه: الإغلاق الفعلي حدث بالفعل
     (المستخدم ضغط زر إغلاق النافذة نفسها)، فنزيل خطوتها من السجل الداخلي
     فورًا (بدل انتظار popstate غير المتزامن) لضمان عدم تكرار التسجيل لو أُعيد
     فتح نفس النافذة بسرعة قبل وصول popstate. */
  function _navConsumeManualClose(tag) {
    if (_isRestoring) return;
    const top = _navStack[_navStack.length - 1];
    if (top && top.tag === tag) {
      _navStack.pop();
      _backPending = true;
      history.back();
    }
  }

  window.addEventListener("popstate", (e) => {
    _backPending = false;
    const targetDepth = (e.state && typeof e.state.navDepth === "number") ? e.state.navDepth : 0;
    _isRestoring = true;
    try {
      while (_navStack.length > targetDepth) {
        const step = _navStack.pop();
        try { step.restore(); } catch (err) {}
      }
    } finally {
      _isRestoring = false;
    }
  });

  window._navPush            = _navPush;
  window._navGoBackIfMatches = _navGoBackIfMatches;

  /* ══════════════════════════════════════════════════════════════
     مراقبة تلقائية وعامة لكل النوافذ المنبثقة (Modals)
     ▸ لا تلمس كود أي نافذة إطلاقًا — تراقب فقط ظهور/اختفاء كلاس الفتح
       الخاص بها (class القائم بالفعل في كل نافذة: show/open/...)
       وتستخدم دالة الإغلاق الحقيقية الخاصة بها من السجل أدناه.
     ▸ لإضافة نافذة جديدة مستقبلًا: أضف سطرًا واحدًا فقط في _MODAL_REGISTRY
       (id العنصر + اسم كلاس الفتح + دالة الإغلاق الحقيقية).
  ══════════════════════════════════════════════════════════════ */
  const _MODAL_REGISTRY = {
    "modalBackdrop":        { openClass: "show",        close: () => document.getElementById("modalCancel")?.click() },
    "profileViewModal":     { openClass: "show",        close: () => document.getElementById("profileViewModal")?.classList.remove("show") },
    "vipAssignModal":       { openClass: "show",        close: () => window.closeVipModal?.() },
    "fwdBackdrop":          { openClass: "show",        close: () => window.closeFwdModal?.() },
    "reportModalBackdrop":  { openClass: "show",        close: () => window.closeReportModal?.() },
    "pollModal":            { openClass: "open",        close: () => window.closePollModal?.() },
    "settingsModal":        { openClass: "open",        close: () => window.closeSettingsModal?.() },
    "grades-app-root":      { openClass: "grades-open", close: () => window.GradesModule?.close?.() },
  };

  let _modalVisible = {};

  function _isModalOpen(id) {
    const el = document.getElementById(id);
    const entry = _MODAL_REGISTRY[id];
    if (!el || !entry) return false;
    return el.classList.contains(entry.openClass);
  }

  function _checkModal(id) {
    const now = _isModalOpen(id);
    const was = !!_modalVisible[id];
    if (now === was) return;
    _modalVisible[id] = now;
    if (_isRestoring) return; // التغيير ناتج عن استعادة تلقائية بالفعل — لا تُسجَّل/تُستهلك مرة أخرى
    if (now) {
      _navPush(`modal:${id}`, _MODAL_REGISTRY[id].close);
    } else {
      // أُغلقت يدويًا (زر إغلاق/نقر خارج النافذة) — إزالة فورية من السجل الداخلي
      // + استهلاك خطوة سجل المتصفح المطابقة، لمنع أي تكرار لو أُعيد فتحها بسرعة
      _navConsumeManualClose(`modal:${id}`);
    }
  }

  function _startModalWatch() {
    const observer = new MutationObserver((mutations) => {
      const seen = new Set();
      mutations.forEach(m => {
        const id = m.target.id;
        if (id && _MODAL_REGISTRY[id] && !seen.has(id)) { seen.add(id); _checkModal(id); }
      });
    });
    Object.keys(_MODAL_REGISTRY).forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        _modalVisible[id] = _isModalOpen(id);
        observer.observe(el, { attributes: true, attributeFilter: ["class", "style"] });
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _startModalWatch);
  } else {
    _startModalWatch();
  }
})();
