
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
  const wrap = el?.querySelector(".dms-avatar-wrap");
  if (wrap) {
    wrap.classList.toggle("ring-online", isOnline);
    wrap.classList.toggle("ring-offline", !isOnline);
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
  if (photo) return `<img class="dms-conv-avatar" src="${photo}" alt="">`;
  return `<div class="dms-conv-avatar dms-conv-avatar-letter">${(name||"?").charAt(0).toUpperCase()}</div>`;
}

/* ── بناء عنصر ── */
function _buildItem(item) {
  const badge = item.unread > 0 ? `<span class="dms-unread-badge">${item.unread>99?"99+":item.unread}</span>` : "";
  const safeName = (item.name||"").replace(/'/g,"\\'").replace(/"/g,"&quot;");
  const safePhoto = (item.photo||"").replace(/'/g,"\\'");
  // مؤشر الاتصال (حلقة حول الافاتار) يظهر فقط في المحادثات الخاصة (ليس الشات العام ولا الغرف)
  // نفس قيمة isOnline الموجودة أصلاً — تغيير شكل العرض فقط، بدون أي منطق جديد
  const showPresence = item.cls === "";
  const ringClass = showPresence ? (item.isOnline ? " ring-online" : " ring-offline") : "";
  let extrasHTML = "";
  if (showPresence && typeof window._dmExtrasRender === "function") {
    try { extrasHTML = window._dmExtrasRender(item) || ""; } catch (e) { extrasHTML = ""; }
  }
  return `
    <div class="dms-conv-item" id="dms-item-${item.id}" ${showPresence ? `data-other-id="${item.id}"` : ""} onclick="_dmsOpenChat('${item.id}','${safeName}','${safePhoto}')">
      <div class="dms-avatar-wrap${ringClass}">
        ${_av(item.photo, item.name, item.cls)}
      </div>
      <div class="dms-conv-body">
        <div class="dms-conv-row1">
          <span class="dms-conv-name">${item.name||"مستخدم"}</span>
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

/* ── عرض القائمة ── */
function _render(search) {
  const el = document.getElementById("dmsConvList");
  if (!el) return;
  let items = [..._dmsItems];
  // المحادثات المؤرشفة تُستثنى من كل الفلاتر الأخرى، وتظهر فقط داخل فلتر "الأرشيف"
  const isArchived = (id) => {
    try { return typeof window._dmExtrasIsArchived === "function" ? window._dmExtrasIsArchived(id) : false; }
    catch (e) { return false; }
  };
  if (_dmsCurFilter === "archived") {
    items = items.filter(i => isArchived(i.id));
  } else {
    items = items.filter(i => !isArchived(i.id));
    if (_dmsCurFilter === "unread") items = items.filter(i => i.unread > 0);
  }
  if (search) {
    const s = search.toLowerCase();
    items = items.filter(i => (i.name||"").toLowerCase().includes(s));
  }
  if (!items.length) {
    el.innerHTML = `<div class="dms-empty"><i class="fa-regular fa-comment-dots"></i><p>لا توجد محادثات</p></div>`;
    if (_dmsPresenceObserver) { _dmsPresenceObserver.disconnect(); }
    return;
  }
  el.innerHTML = items.map(_buildItem).join("");
  // بعد كل رسم: أعد ربط مراقب الظهور بالعناصر الجديدة (تفعيل/إلغاء مستمعات الحضور حسب الظهور الفعلي)
  _dmsSetupPresenceObserver();
}

/* ── إعادة رسم فورية (تُستخدم من ملف الإضافات المستقل بعد تحديث حالة تثبيت/مفضلة/كتم) ── */
window._dmsForceRerender = function() {
  _render("");
};

/* ── فتح محادثة ── */
window._dmsOpenChat = function(id, name, photo) {
  window.selectChat(id, name, photo);
};

/* ── تصفير فوري لعداد شخص معيّن عند فتح محادثته (يُستدعى من selectChat) ── */
window._dmsMarkRead = function(otherId) {
  const item = _dmsItems.find(i => i.id === otherId);
  if (item && item.unread) {
    item.unread = 0;
    _render("");
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
  _render("");
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
  if (panel === "rooms") _renderRooms();
};

/* ── الغرف ── */
function _renderRooms() {
  const el = document.getElementById("dmsRoomsList");
  if (!el) return;
  if (!_dmsRooms.length) { el.innerHTML = `<div class="dms-empty"><i class="fa-solid fa-users"></i><p>لا توجد غرف</p></div>`; return; }
  el.innerHTML = _dmsRooms.map(r => `
    <div class="dms-conv-item" onclick="_dmsOpenChat('room:${r.id}','${(r.name||"غرفة").replace(/'/g,"\\'")}','${r.photo||""}')">
      ${r.photo ? `<img class="dms-conv-avatar" src="${r.photo}" alt="">` : `<div class="dms-conv-avatar dms-conv-avatar-room"><i class="fa-solid fa-users"></i></div>`}
      <div class="dms-conv-body">
        <div class="dms-conv-row1"><span class="dms-conv-name">${r.name||"غرفة"}</span></div>
        <div class="dms-conv-row2"><span class="dms-conv-last">${r.desc||"غرفة نقاش"}</span></div>
      </div>
    </div>`).join("");
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
      _render("");
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
    _render("");
    _updateNavBadge();
  }, () => {});

  // الغرف
  onSnapshot(collection(window.db,"rooms"), snap => {
    _dmsRooms = snap.docs.map(d => ({id:d.id,...d.data()}));
    if (_dmsCurTab==="rooms") _renderRooms();
  }, () => {});
};

/* ══ فتح الصفحة ══ */
window._dmsPageInit = function() {
  // reset UI
  _dmsCurFilter = "all";
  _dmsCurTab    = "chats";
  document.querySelectorAll(".dms-chip").forEach((c,i) => c.classList.toggle("active",i===0));
  document.querySelectorAll(".dms-tab").forEach((t,i)  => t.classList.toggle("active",i===3));
  document.querySelectorAll(".dms-panel").forEach((p,i) => p.classList.toggle("active",i===0));
  const filters = document.getElementById("dmsFilters"); if (filters) filters.style.display = "";

  // إن لم تبدأ الـ listeners بعد، ابدأها الآن
  window._dmsStartListeners?.();
  // عرض ما هو محمّل فعلاً (سريع لأن البيانات جاهزة)
  _render("");
};
