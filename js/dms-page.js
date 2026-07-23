import { collection, query, where, orderBy, onSnapshot, doc, getDoc, limit } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ── حالة عدّاد غير المقروء لكل محادثة (مستمعات فورية مستقلة — دائمة طوال الجلسة) ── */
let _dmsUnreadMap    = {};  // roomId → عدد غير المقروء (Live)
let _dmsUnreadUnsubs = {};  // roomId → دالة إلغاء الاشتراك

/* ── حالة مؤشر الاتصال (Online Dot) ──
   مستمعات محدودة فقط: المحادثات الظاهرة فعلياً في الشاشة + المحادثة المفتوحة حالياً
   (وليس كل المحادثات — تفاديًا لمئات المستمعات مع القوائم الكبيرة) ── */
let _dmsPresenceUnsubs    = {}; // otherId → دالة إلغاء الاشتراك (النشطة حالياً فقط)
let _dmsPresenceObserver  = null;

/* ── تحديث DOM مباشرة لمؤشر الاتصال (بدون إعادة رسم كامل القائمة) ── */
function _dmsSetOnlineDot(otherId, isOnline) {
  const item = _dmsItems.find(i => i.id === otherId);
  if (item) item.isOnline = isOnline;
  const el = document.getElementById(`dms-item-${otherId}`);
  const ring = el?.querySelector(".dms-avatar-wrap");
  if (ring) {
    ring.classList.toggle("online", isOnline);
    ring.classList.toggle("offline", !isOnline);
  }
}

/* ── مستمع فوري لحالة اتصال مستخدم واحد (idempotent) —
   يعيد استخدام نفس بيانات users/{uid} ونفس دالة الحساب window._isOnlineVisible
   الموجودة أصلاً في نظام حالة الاتصال، دون أي منطق جديد ── */
function _dmsAttachPresenceListener(otherId) {
  if (!otherId || _dmsPresenceUnsubs[otherId]) return; // مرتبط بالفعل
  _dmsPresenceUnsubs[otherId] = onSnapshot(doc(window.db, "users", otherId), snap => {
    if (!snap.exists()) { _dmsSetOnlineDot(otherId, false); return; }
    const isOnline = window._isOnlineVisible ? window._isOnlineVisible(snap.data()) : false;
    _dmsSetOnlineDot(otherId, isOnline);
  }, () => {});
}

/* ── إلغاء مستمع حالة اتصال شخص معيّن (يُستخدم عند خروج العنصر من الشاشة) ── */
function _dmsDetachPresenceListener(otherId) {
  if (_dmsPresenceUnsubs[otherId]) {
    _dmsPresenceUnsubs[otherId]();
    delete _dmsPresenceUnsubs[otherId];
  }
}

/* ── مراقب الظهور (IntersectionObserver) —
   يُشغّل مستمع الحضور فقط للعناصر الظاهرة فعلياً في الشاشة،
   ويُلغيه عند خروجها من العرض — إلا إن كانت المحادثة المفتوحة حالياً ── */
function _dmsSetupPresenceObserver() {
  const container = document.getElementById("dmsConvList");
  if (!container) return;
  if (_dmsPresenceObserver) _dmsPresenceObserver.disconnect();

  _dmsPresenceObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const otherId = entry.target.dataset.otherId;
      if (!otherId) return;
      if (entry.isIntersecting) {
        _dmsAttachPresenceListener(otherId);
      } else if (window._currentChatId !== otherId) {
        // لا تُلغِ مستمع المحادثة المفتوحة حالياً حتى لو خرجت من العرض
        _dmsDetachPresenceListener(otherId);
      }
    });
  }, { root: container, rootMargin: "150px 0px", threshold: 0 });

  container.querySelectorAll(".dms-conv-item[data-other-id]").forEach(el => {
    _dmsPresenceObserver.observe(el);
  });
}

/* ══════════════════════════════════════════
   DMS PAGE — صفحة الدردشات
   ▸ preload فور تسجيل الدخول
   ▸ badge غير مقروء في الـ nav
   ▸ عداد لكل محادثة
══════════════════════════════════════════ */

let _dmsStarted   = false;
let _dmsCurFilter = "all";
let _dmsCurTab    = "chats";
let _dmsUnsubs    = [];
let _dmsItems     = [];
let _dmsRooms     = [];

/* ── تنسيق الوقت ── */
function _fmt(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 86400000) return d.toLocaleTimeString("ar-EG",{hour:"2-digit",minute:"2-digit"});
  if (diff < 604800000) return ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"][d.getDay()];
  return d.toLocaleDateString("ar-EG",{day:"2-digit",month:"2-digit"});
}

/* ── avatar ── */
function _av(photo, name, cls) {
  if (cls==="public") return `<div class="dms-conv-avatar dms-conv-avatar-public"><i class="fa-solid fa-graduation-cap"></i></div>`;
  if (cls==="room")   return `<div class="dms-conv-avatar dms-conv-avatar-room"><i class="fa-solid fa-users"></i></div>`;
  if (cls==="ai")     return `<div class="dms-conv-avatar ai-avatar"><i class="fa-solid fa-sparkles"></i></div>`;
  if (photo) return `<img class="dms-conv-avatar" src="${photo}" alt="">`;
  return `<div class="dms-conv-avatar dms-conv-avatar-letter">${(name||"?").charAt(0).toUpperCase()}</div>`;
}

/* ── بناء عنصر ── */
function _buildItem(item) {
  const badge = item.unread > 0 ? `<span class="dms-unread-badge">${item.unread>99?"99+":item.unread}</span>` : "";
  const safeName = (item.name||"").replace(/'/g,"\\'").replace(/"/g,"&quot;");
  const safePhoto = (item.photo||"").replace(/'/g,"\\'");
  // مؤشر الاتصال يظهر فقط في المحادثات الخاصة (ليس الشات العام ولا الغرف)
  const showDot = item.cls === "";
  const ringCls = item.cls === "ai" ? " ai-ring" : (showDot ? (item.isOnline ? " online" : " offline") : "");
  let extrasHTML = "";
  if (showDot && typeof window._dmExtrasRender === "function") {
    try { extrasHTML = window._dmExtrasRender(item) || ""; } catch (e) { extrasHTML = ""; }
  }
  return `
    <div class="dms-conv-item" id="dms-item-${item.id}" ${showDot ? `data-other-id="${item.id}"` : ""} onclick="_dmsOpenChat('${item.id}','${safeName}','${safePhoto}')">
      <div class="dms-avatar-wrap${ringCls}">
        ${_av(item.photo, item.name, item.cls)}
      </div>
      <div class="dms-conv-body">
        <div class="dms-conv-row1">
          <span class="dms-conv-name">${item.name||"مستخدم"}${item.cls==="ai" ? ' <span class="ai-badge">AI</span>' : ""}</span>
          ${extrasHTML}
          <span class="dms-conv-time">${_fmt(item.lastTime)}</span>
        </div>
        <div class="dms-conv-row2">
          <span class="dms-conv-last">${item.lastMsg||"ابدأ المحادثة"}</span>
          <span class="dms-conv-badges">${badge}</span>
        </div>
      </div>
    </div>`;
}

/* ── تحديث badge الـ nav ──
   العدد هنا = عدد المحادثات (الأشخاص) التي بها رسائل غير مقروءة
   وليس مجموع الرسائل غير المقروءة ── */
function _updateNavBadge() {
  const convCount = _dmsItems.filter(i => (i.unread||0) > 0).length;
  const el = document.getElementById("navDmsBadge");
  if (!el) return;
  if (convCount > 0) {
    el.textContent    = convCount > 99 ? "99+" : convCount;
    el.style.display  = "";
  } else {
    el.style.display  = "none";
  }
}

/* ── عرض القائمة (تشمل الدردشات والغرف مدموجة معًا، مرتبة حسب آخر نشاط) ── */
function _render(search) {
  const el = document.getElementById("dmsConvList");
  if (!el) return;
  let items = [..._dmsItems, ..._dmsRooms.map(_roomToItem)];
  if (typeof window._aiListItem === "function") {
    const ai = window._aiListItem();
    if (ai) items.push(ai);
  }
  // إبقاء الشات العام في الأعلى دائمًا. الباقي (دردشات + غرف) يُرتَّب حسب آخر
  // نشاط، مع الحفاظ على أولوية التثبيت/المفضلة (window._dmExtrasSort) لو متاحة
  // — نفس المنطق الموجود أصلاً، بس مطبَّق على القائمة المدموجة بالكامل.
  const pub = items.filter(i => i.id === "public");
  let rest = items.filter(i => i.id !== "public")
    .sort((a,b) => (b.lastTime?.toMillis?.()??0) - (a.lastTime?.toMillis?.()??0));
  if (typeof window._dmExtrasSort === "function") {
    try { rest = window._dmExtrasSort(rest) || rest; } catch (e) {}
  }
  items = [...pub, ...rest];

  // الأرشيف — ميزة جديدة (الوحيدة المضافة فعليًا). المحادثة العامة لا تُؤرشف أبدًا.
  const isArchived = (id) => {
    if (id === "public") return false;
    try { return typeof window._dmExtrasIsArchived === "function" ? window._dmExtrasIsArchived(id) : false; }
    catch (e) { return false; }
  };
  const archCountEl = document.getElementById("dmsArchiveCount");
  if (archCountEl) archCountEl.textContent = items.filter(i => isArchived(i.id)).length;

  if (_dmsCurFilter === "archive") {
    items = items.filter(i => isArchived(i.id));
  } else {
    items = items.filter(i => !isArchived(i.id));
  }

  if (_dmsCurFilter === "unread") items = items.filter(i => i.unread > 0);
  if (_dmsCurFilter === "fav") {
    items = items.filter(i => {
      try { return typeof window._dmExtrasIsFav === "function" ? window._dmExtrasIsFav(i.id) : false; }
      catch (e) { return false; }
    });
  }
  if (search) {
    const s = search.toLowerCase();
    items = items.filter(i => (i.name||"").toLowerCase().includes(s));
  }
  if (!items.length) {
    const emptyMsg = _dmsCurFilter === "archive" ? "لا توجد محادثات مؤرشفة" : "لا توجد محادثات";
    el.innerHTML = `<div class="dms-empty"><i class="fa-regular fa-comment-dots"></i><p>${emptyMsg}</p></div>`;
    if (_dmsPresenceObserver) { _dmsPresenceObserver.disconnect(); }
    return;
  }
  el.innerHTML = items.map(_buildItem).join("");
  // بعد كل رسم: أعد ربط مراقب الظهور بالعناصر الجديدة (تفعيل/إلغاء مستمعات الحضور حسب الظهور الفعلي)
  _dmsSetupPresenceObserver();
  window._dmsRefreshFoldEffects?.();
}

/* ── إعادة رسم فورية (تُستخدم من ملف الإضافات المستقل بعد تحديث حالة تثبيت/مفضلة/كتم) ── */
window._dmsForceRerender = function() {
  _render(document.getElementById("dmsSearchInp")?.value||"");
};

/* ── فتح محادثة ── */
window._dmsOpenChat = function(id, name, photo) {
  if (id === "ai") {
    if (typeof window._openAiChat === "function") window._openAiChat();
    return;
  }
  window.selectChat(id, name, photo);
};

/* ── إعادة رسم القائمة من مصدر خارجي (مثلاً ai-assistant.js لما تتحدث آخر رسالة) ── */
window._dmsRerender = function() {
  _render(document.getElementById("dmsSearchInp")?.value || "");
};

/* ── تصفير فوري لعداد شخص معيّن عند فتح محادثته (يُستدعى من selectChat) ── */
window._dmsMarkRead = function(otherId) {
  const item = _dmsItems.find(i => i.id === otherId);
  if (item && item.unread) {
    item.unread = 0;
    _render(document.getElementById("dmsSearchInp")?.value||"");
    _updateNavBadge();
  }
  // إبقاء مستمع حالة الاتصال فعالاً دائماً طالما المحادثة مفتوحة (حتى لو خرج العنصر من الشاشة)
  _dmsAttachPresenceListener(otherId);
};

/* ── فلتر ── */
window._dmsFilter = function(btn, filter) {
  _dmsCurFilter = filter;
  document.querySelectorAll(".dms-chip").forEach(c => c.classList.remove("active"));
  btn.classList.add("active");
  _render(document.getElementById("dmsSearchInp")?.value || "");
};

/* ── صندوق الأرشيف المستقل ──
   ⚠️ افتراضي مؤقت: فلترة نفس القائمة الحالية (وليس شاشة منفصلة تنزلق من
   الجانب) لأنه الأقرب للكود الموجود فعليًا وأقل مخاطرة. اضغطة ثانية على
   نفس الصندوق ترجع لعرض غير المؤرشف. غيّرها لشاشة منفصلة لو كان هذا
   المطلوب فعليًا. */
window._dmsOpenArchive = function () {
  _dmsCurFilter = _dmsCurFilter === "archive" ? "all" : "archive";
  _render(document.getElementById("dmsSearchInp")?.value || "");
};

/* ── تبويبات ── */
window._dmsSwitchTab = function(btn, panel) {
  _dmsCurTab = panel;
  document.querySelectorAll(".dms-tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".dms-panel").forEach(p => p.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById("dmspanel-" + panel)?.classList.add("active");
  const filters = document.getElementById("dmsFilters");
  if (filters) filters.style.display = panel === "chats" ? "" : "none";
  if (panel === "members" && typeof window.renderMembersList === "function") {
    window.renderMembersList("", "dmsMembersList");
  }
  // خطوة 5.2 — نص placeholder صندوق البحث حسب التاب النشط
  const searchInp = document.getElementById("dmsSearchInp");
  if (searchInp) {
    searchInp.placeholder = panel === "members"
      ? "بحث عن مستخدمين - UID"
      : "البحث عن رسائل أو مستخدمين...";
  }
  // خطوة 5.3 — عنوان الصفحة يتغيّر حسب التاب النشط
  const titleEl = document.querySelector("#page-dms .dms-header-title");
  if (titleEl) {
    titleEl.textContent = panel === "members" ? "المستخدمون" : "الدردشات";
  }
  window._dmsRefreshFoldEffects?.();
};

/* ── بحث ── */
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("dmsSearchToggle")?.addEventListener("click", () => {
    const bar = document.getElementById("dmsSearchBar");
    if (bar) { bar.classList.toggle("open"); if (bar.classList.contains("open")) document.getElementById("dmsSearchInp")?.focus(); }
  });
  document.getElementById("dmsSearchInp")?.addEventListener("input", e => _render(e.target.value));
});

/* ── تحويل بيانات الغرفة لنفس شكل عنصر المحادثة، عشان تندمج في نفس القائمة ── */
function _roomToItem(r) {
  return {
    id: "room:" + r.id, name: r.name || "غرفة", photo: r.photo || "", cls: "room",
    lastMsg: r.desc || "غرفة نقاش", lastTime: r.lastMessageAt || r.createdAt || null,
    unread: 0, isOnline: false
  };
}

/* ══ PRELOAD — يبدأ فور تسجيل الدخول ══ */
window._dmsStartListeners = function() {
  if (_dmsStarted || !window.db || !window.currentUser) return;
  _dmsStarted = true;
  const uid = window.currentUser.uid;

  // cache أسماء المستخدمين لتجنب getDoc متكررة
  const _nameCache = {};
  async function _getUser(uid) {
    if (_nameCache[uid]) return _nameCache[uid];
    try {
      const s = await getDoc(doc(window.db, "users", uid));
      const u = s.exists() ? { name: s.data().name||"مستخدم", photo: s.data().photo||"" } : { name:"مستخدم", photo:"" };
      _nameCache[uid] = u;
      return u;
    } catch(e) { return { name:"مستخدم", photo:"" }; }
  }

  // الشات العام
  const pubItem = { id:"public", name:"الشات العام", photo:"", cls:"public", lastMsg:"مباشر — الجميع", lastTime:null, unread:0 };
  _dmsItems = [pubItem];

  onSnapshot(query(collection(window.db,"messages"), orderBy("createdAt","desc"), limit(1)), snap => {
    const d = snap.docs[0]?.data();
    const p = _dmsItems.find(i => i.id==="public");
    if (p && d) { p.lastMsg = d.text||(d.image?"📷 صورة":d.audio?"🎤 تسجيل":""); p.lastTime = d.createdAt; }
    _render(""); _updateNavBadge();
  }, () => {});

  // ── مستمع فوري لعدد غير المقروء الخاص بمحادثة واحدة (idempotent) ──
  function _dmsAttachUnreadListener(roomId, otherId) {
    if (_dmsUnreadUnsubs[roomId]) return; // مرتبط بالفعل
    const uQ = query(
      collection(window.db, `privateChats/${roomId}/messages`),
      where("seen","==",false)
    );
    _dmsUnreadUnsubs[roomId] = onSnapshot(uQ, uSnap => {
      // إذا كانت المحادثة مفتوحة حالياً مع نفس الشخص: لا تُحسب كغير مقروءة
      const cnt = (window._currentChatId === otherId)
        ? 0
        : uSnap.docs.filter(m => m.data().uid !== uid).length;
      _dmsUnreadMap[roomId] = cnt;
      const item = _dmsItems.find(i => i.id === otherId);
      if (item) item.unread = cnt;
      _render(document.getElementById("dmsSearchInp")?.value||"");
      _updateNavBadge();
    }, () => {});
  }

  // ── تحديث DOM مباشرة لمؤشر الاتصال (بدون إعادة رسم كامل القائمة) ──
  // (الدوال منقولة لمستوى الملف: _dmsSetOnlineDot, _dmsAttachPresenceListener, _dmsDetachPresenceListener, _dmsSetupPresenceObserver)

  // المحادثات الخاصة
  const privQ = query(collection(window.db,"privateChats"), where("participants","array-contains",uid));
  onSnapshot(privQ, async snap => {
    const items = [];
    const activeRoomIds  = new Set();
    const activeOtherIds = new Set();
    for (const ds of snap.docs) {
      const d       = ds.data();
      const roomId  = ds.id;
      const otherId = (d.participants||[]).find(p => p !== uid);
      if (!otherId) continue;
      activeRoomIds.add(roomId);
      activeOtherIds.add(otherId);
      const u = await _getUser(otherId);

      const existing = _dmsItems.find(i => i.id === otherId);
      items.push({
        id: otherId, name: u.name, photo: u.photo, cls: "",
        lastMsg:  d.lastMessage   || "",
        lastTime: d.lastMessageAt || null,
        unread:   _dmsUnreadMap[roomId] || 0,
        isOnline: existing?.isOnline || false
      });

      // عدّاد غير المقروء: مستمع فوري دائم لكل المحادثات (بلا استثناء)
      _dmsAttachUnreadListener(roomId, otherId);
      // حالة الاتصال: تُفعَّل فقط عبر IntersectionObserver بعد الرسم (أو إذا كانت المحادثة مفتوحة حالياً)
    }

    // تنظيف مستمعي غير المقروء للغرف التي لم تعد موجودة (محادثة محذوفة مثلاً)
    Object.keys(_dmsUnreadUnsubs).forEach(rid => {
      if (!activeRoomIds.has(rid)) {
        _dmsUnreadUnsubs[rid]();
        delete _dmsUnreadUnsubs[rid];
        delete _dmsUnreadMap[rid];
      }
    });
    // تنظيف مستمعي الحضور للمستخدمين الذين لم تعد لديهم محادثة معنا إطلاقاً
    Object.keys(_dmsPresenceUnsubs).forEach(oid => {
      if (!activeOtherIds.has(oid)) {
        _dmsPresenceUnsubs[oid]();
        delete _dmsPresenceUnsubs[oid];
      }
    });

    items.sort((a,b) => (b.lastTime?.toMillis?.()??0) - (a.lastTime?.toMillis?.()??0));
    if (typeof window._dmExtrasSort === "function") {
      try { items = window._dmExtrasSort(items) || items; } catch (e) {}
    }
    const pub = _dmsItems.find(i => i.id==="public") || pubItem;
    _dmsItems = [pub, ...items];
    _render(document.getElementById("dmsSearchInp")?.value||"");
    _updateNavBadge();
  }, () => {});

  // الغرف — تُدمَج الآن داخل نفس قائمة الدردشات (بدل تبويب مستقل)
  onSnapshot(collection(window.db,"rooms"), snap => {
    _dmsRooms = snap.docs.map(d => ({id:d.id,...d.data()}));
    _render(document.getElementById("dmsSearchInp")?.value||"");
  }, () => {});
};

/* ══════════════════════════════════════════
   تأثير الطي/التصغير ثلاثي الأبعاد عند السكرول — نفس آلية التصميم
   المرجعي بالحرف (perspective + scale + rotateX + opacity حسب المسافة
   من حافة الحاوية العلوية/السفلية). Scroll-driven بالكامل، بدون تأخير.
   Reusable: بتتوصل على أي حاوية سكرول + أي selector للعناصر جواها.
══════════════════════════════════════════ */
const _dmsFoldAttached = new Set();

function _dmsAttachFoldEffect(panelEl, itemSelector) {
  if (!panelEl || _dmsFoldAttached.has(panelEl)) return () => {};
  _dmsFoldAttached.add(panelEl);

  const topZone = 60;
  const bottomZone = 110;
  let ticking = false;

  function update() {
    const panelRect = panelEl.getBoundingClientRect();
    const items = panelEl.querySelectorAll(itemSelector);
    items.forEach(item => {
      const r = item.getBoundingClientRect();
      const centerY = r.top + r.height / 2;
      const distTop = centerY - panelRect.top;
      const distBottom = panelRect.bottom - centerY;

      let scale = 1, opacity = 1, translateY = 0, rotate = 0;

      if (distTop < topZone) {
        const t = Math.max(0, Math.min(1, distTop / topZone));
        scale = 0.82 + 0.18 * t;
        opacity = Math.max(0.05, t);
        translateY = (1 - t) * -10;
        rotate = (1 - t) * -10;
      } else if (distBottom < bottomZone) {
        const t = Math.max(0, Math.min(1, distBottom / bottomZone));
        scale = 0.82 + 0.18 * t;
        opacity = Math.max(0.05, t);
        translateY = (1 - t) * 10;
        rotate = (1 - t) * 10;
      }

      item.style.transform = `perspective(700px) scale(${scale}) translateY(${translateY}px) rotateX(${rotate}deg)`;
      item.style.opacity = opacity;
    });
    ticking = false;
  }

  panelEl.addEventListener("scroll", () => {
    if (!ticking) { requestAnimationFrame(update); ticking = true; }
  }, { passive: true });

  update();
  setTimeout(update, 60);
  return update;
}

let _dmsUpdateChatsFold = null;
let _dmsUpdateMembersFold = null;
window._dmsRefreshFoldEffects = function () {
  const chatsPanel   = document.getElementById("dmspanel-chats");
  const membersPanel = document.getElementById("dmspanel-members");
  if (chatsPanel && !_dmsUpdateChatsFold) {
    _dmsUpdateChatsFold = _dmsAttachFoldEffect(chatsPanel, ".dms-conv-item");
  }
  if (membersPanel && !_dmsUpdateMembersFold) {
    _dmsUpdateMembersFold = _dmsAttachFoldEffect(membersPanel, ".dm-item");
  }
  _dmsUpdateChatsFold?.();
  _dmsUpdateMembersFold?.();
  setTimeout(() => { _dmsUpdateChatsFold?.(); _dmsUpdateMembersFold?.(); }, 80);
};

/* ══ فتح الصفحة ══ */
window._dmsPageInit = function() {
  // reset UI
  const si = document.getElementById("dmsSearchInp"); if (si) { si.value = ""; si.placeholder = "البحث عن رسائل أو مستخدمين..."; }
  const titleEl = document.querySelector("#page-dms .dms-header-title"); if (titleEl) titleEl.textContent = "الدردشات";
  _dmsCurFilter = "all";
  _dmsCurTab    = "chats";
  document.querySelectorAll(".dms-chip").forEach((c,i) => c.classList.toggle("active",i===0));
  document.querySelectorAll(".dms-tab").forEach((t,i)  => t.classList.toggle("active",i===0));
  document.querySelectorAll(".dms-panel").forEach((p,i) => p.classList.toggle("active",i===0));
  const filters = document.getElementById("dmsFilters"); if (filters) filters.style.display = "";

  // إن لم تبدأ الـ listeners بعد، ابدأها الآن
  window._dmsStartListeners?.();
  // عرض ما هو محمّل فعلاً (سريع لأن البيانات جاهزة)
  _render("");
  window._dmsRefreshFoldEffects();
};
