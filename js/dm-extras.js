/* ══════════════════════════════════════════════════════════════
   DM EXTRAS — ملف مستقل بالكامل
   الإضافات: تثبيت المحادثات، المفضلة، كتم المحادثة،
             مؤشر "يسجل رسالة صوتية"، فاصل "الرسائل غير المقروءة"

   ▸ لا يعدّل أي منطق داخل index.html أو dms-page.js
   ▸ يعتمد فقط على نقاط ربط اختيارية (window.X?.()) مضافة مسبقًا
   ▸ يعيد استخدام: window.db, window.currentUser, window._currentChatId,
     window.privateChatId, window._isOnlineVisible ... (بدون تكرار منطقها)
   ▸ كل الحقول الجديدة تُخزَّن على نفس مستند privateChats/{roomId}
     بنفس نمط الحقول الموجودة أصلاً (typing_{uid})
══════════════════════════════════════════════════════════════ */

import {
  collection, query, where, onSnapshot, doc, updateDoc,
  deleteField, serverTimestamp, getDocs, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ══════════════════════════════════════════
   1) حالة عامة (Cache) لكل محادثة: تثبيت / مفضلة / كتم
══════════════════════════════════════════ */
let _exCache   = {};      // otherId → { pinnedAt, fav, mutedUntil, archivedAt }
let _exStarted = false;

function _exRoomId(otherId) {
  return (typeof window.privateChatId === "function") ? window.privateChatId(otherId) : null;
}

function _isMutedNow(entry) {
  if (!entry || !entry.mutedUntil) return false;
  if (entry.mutedUntil === "forever") return true;
  const ms = entry.mutedUntil?.toMillis ? entry.mutedUntil.toMillis() : 0;
  return ms > Date.now();
}

/* ── قراءة الحالة (تُستخدم من dms-page.js و index.html) ── */
window._dmExtrasIsFav = function (otherId) {
  return !!(_exCache[otherId] && _exCache[otherId].fav);
};
window._dmExtrasIsMuted = function (otherId) {
  return _isMutedNow(_exCache[otherId]);
};
window._dmExtrasIsArchived = function (otherId) {
  return !!(_exCache[otherId] && _exCache[otherId].archivedAt);
};

/* ── الترتيب: المثبتة أولاً (الأحدث تثبيتًا أعلى)، وبقية المحادثات كما هي (فرز مستقر) ── */
window._dmExtrasSort = function (items) {
  return [...items].sort((a, b) => {
    const pa = _exCache[a.id]?.pinnedAt?.toMillis?.() || 0;
    const pb = _exCache[b.id]?.pinnedAt?.toMillis?.() || 0;
    if (pa || pb) return pb - pa;
    return 0; // Array.sort مستقر — لا تغيّر ترتيب غير المثبتة
  });
};

/* ── مستمع فوري لحالة (تثبيت/مفضلة/كتم) — قراءة فقط لنفس مستند privateChats الموجود ── */
window._dmExtrasStartListeners = function () {
  if (_exStarted || !window.db || !window.currentUser) return;
  _exStarted = true;
  const uid = window.currentUser.uid;
  const q = query(collection(window.db, "privateChats"), where("participants", "array-contains", uid));
  onSnapshot(q, snap => {
    snap.docChanges().forEach(ch => {
      const d = ch.doc.data();
      const otherId = (d.participants || []).find(p => p !== uid);
      if (!otherId) return;
      if (ch.type === "removed") { delete _exCache[otherId]; return; }
      _exCache[otherId] = {
        pinnedAt:   d[`pinnedAt_${uid}`]   || null,
        fav:        !!d[`fav_${uid}`],
        mutedUntil: d[`mutedUntil_${uid}`] || null,
        archivedAt: d[`archivedAt_${uid}`] || null,
      };
    });
    window._dmsForceRerender?.();
  }, () => {});
};

/* ── كتابة حقل واحد على مستند المحادثة (نفس نمط typing_{uid} الموجود) ── */
async function _exSetField(otherId, field, value) {
  const roomId = _exRoomId(otherId);
  if (!roomId || !window.db) { window.toast?.("تعذّر الحفظ — حاول مجددًا"); return false; }
  try {
    const upd = {};
    upd[field] = (value === undefined || value === null) ? deleteField() : value;
    await updateDoc(doc(window.db, "privateChats", roomId), upd);
    return true;
  } catch (e) {
    window.toast?.("تعذّر حفظ التغيير — تحقق من الاتصال");
    return false;
  }
}

/* ══════════════════════════════════════════
   2) أزرار العرض داخل عنصر قائمة "المحادثات"
      (نقطة الربط الوحيدة مع dms-page.js: window._dmExtrasRender)
══════════════════════════════════════════ */
window._dmExtrasRender = function (item) {
  window._dmExtrasStartListeners?.(); // بدء كسول وآمن (idempotent)
  window._dmExtrasBindLongPress?.();  // ربط الضغط المطول مرة واحدة فقط (idempotent)
  const c = _exCache[item.id] || {};
  const pinIcon  = c.pinnedAt        ? `<i class="fa-solid fa-thumbtack dms-ex-badge" title="مثبتة"></i>` : "";
  const favIcon  = c.fav             ? `<i class="fa-solid fa-star dms-ex-badge dms-ex-fav" title="مفضلة"></i>` : "";
  const muteIcon = _isMutedNow(c)    ? `<i class="fa-solid fa-bell-slash dms-ex-badge dms-ex-mute" title="مكتومة"></i>` : "";
  // كل الشارات + الزر داخل عنصر flex واحد فقط — لتفادي أي تعارض مع justify-content
  // الموجودة أصلاً على .dms-conv-row1 (وإلا كانت ستوزَّع كعناصر منفصلة بمسافات غير متوقعة)
  return `<span class="dms-ex-inline">${pinIcon}${favIcon}${muteIcon}</span>`;
};

/* ══════════════════════════════════════════
   2b) الضغط المطول على أي محادثة يفتح القائمة الاحترافية
      (بديل كامل لقائمة "نسخ الاسم" الافتراضية في المتصفح)
══════════════════════════════════════════ */
let _exPressTimer   = null;
let _exPressStartXY = null;

function _exFindItemEl(target) {
  return target?.closest?.(".dms-conv-item[data-other-id]") || null;
}

window._dmExtrasBindLongPress = function () {
  const container = document.getElementById("dmsConvList");
  if (!container || container.dataset.exBound === "1") return;
  container.dataset.exBound = "1";

  const armTimer = (item) => {
    clearTimeout(_exPressTimer);
    _exPressTimer = setTimeout(() => {
      _exPressTimer = null;
      const otherId = item.dataset.otherId;
      if (otherId) {
        if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) {} }
        window._dmExtrasOpenMenu(otherId);
      }
    }, 480);
  };
  const cancelTimer = () => { clearTimeout(_exPressTimer); _exPressTimer = null; _exPressStartXY = null; };
  const checkMove = (x, y) => {
    if (!_exPressStartXY) return;
    if (Math.abs(x - _exPressStartXY.x) > 10 || Math.abs(y - _exPressStartXY.y) > 10) cancelTimer();
  };

  container.addEventListener("touchstart", e => {
    const item = _exFindItemEl(e.target);
    if (!item) return;
    const t = e.touches[0];
    _exPressStartXY = { x: t.clientX, y: t.clientY };
    armTimer(item);
  }, { passive: true });
  container.addEventListener("touchmove", e => {
    const t = e.touches[0];
    checkMove(t.clientX, t.clientY);
  }, { passive: true });
  container.addEventListener("touchend", cancelTimer);
  container.addEventListener("touchcancel", cancelTimer);

  container.addEventListener("mousedown", e => {
    const item = _exFindItemEl(e.target);
    if (!item) return;
    _exPressStartXY = { x: e.clientX, y: e.clientY };
    armTimer(item);
  });
  container.addEventListener("mousemove", e => checkMove(e.clientX, e.clientY));
  container.addEventListener("mouseup", cancelTimer);
  container.addEventListener("mouseleave", cancelTimer);

  // الزر الأيمن / الضغط المطول الذي يستدعي قائمة المتصفح — نمنعه ونعرض قائمتنا بدلاً منه
  container.addEventListener("contextmenu", e => {
    const item = _exFindItemEl(e.target);
    if (!item) return;
    e.preventDefault();
    const otherId = item.dataset.otherId;
    if (otherId) window._dmExtrasOpenMenu(otherId);
  });
};

/* ══════════════════════════════════════════
   3) قائمة الإجراءات (Action Sheet) — تُبنى ديناميكيًا بالكامل
══════════════════════════════════════════ */
function _exEnsureMenuEl() {
  if (document.getElementById("dmExtrasMenu")) return;
  const el = document.createElement("div");
  el.id = "dmExtrasMenu";
  el.className = "dmex-sheet";
  el.innerHTML = `
    <div class="dmex-backdrop" onclick="window._dmExtrasCloseMenu()"></div>
    <div class="dmex-bar">
      <button class="dmex-close" onclick="window._dmExtrasCloseMenu()"><i class="fa-solid fa-xmark"></i></button>
      <div class="dmex-actions"></div>
    </div>
    <div class="dmex-mute-options"></div>`;
  document.body.appendChild(el);
}

window._dmExtrasOpenMenu = function (otherId) {
  _exEnsureMenuEl();
  const c      = _exCache[otherId] || {};
  const pinned = !!c.pinnedAt;
  const fav    = !!c.fav;
  const muted  = _isMutedNow(c);
  const archived = !!c.archivedAt;
  const menu   = document.getElementById("dmExtrasMenu");

  menu.querySelector(".dmex-actions").innerHTML = `
    <button class="dmex-pill${pinned ? " active" : ""}" onclick="window._dmExtrasTogglePin('${otherId}')">
      <i class="fa-solid fa-thumbtack"></i> ${pinned ? "إلغاء التثبيت" : "تثبيت المحادثة"}
    </button>
    <button class="dmex-pill${fav ? " active" : ""}" onclick="window._dmExtrasToggleFav('${otherId}')">
      <i class="fa-solid fa-star"></i> ${fav ? "إزالة من المفضلة" : "إضافة إلى المفضلة"}
    </button>
    <button class="dmex-pill${archived ? " active" : ""}" onclick="window._dmExtrasToggleArchive('${otherId}')">
      <i class="fa-solid fa-box-archive"></i> ${archived ? "إلغاء الأرشفة" : "أرشفة"}
    </button>
    <button class="dmex-pill${muted ? " active" : ""}" onclick="window._dmExtrasToggleMuteOptions('${otherId}')">
      <i class="fa-solid fa-bell-slash"></i> صامت
    </button>
  `;

  const muteBox = menu.querySelector(".dmex-mute-options");
  muteBox.innerHTML = muted ? `
    <button class="dmex-mute-opt dmex-unmute" onclick="window._dmExtrasSetMute('${otherId}', null)">إلغاء الصامت</button>
  ` : `
    <button class="dmex-mute-opt" onclick="window._dmExtrasSetMute('${otherId}','1h')">لمدة ساعة</button>
    <button class="dmex-mute-opt" onclick="window._dmExtrasSetMute('${otherId}','1d')">لمدة يوم</button>
    <button class="dmex-mute-opt" onclick="window._dmExtrasSetMute('${otherId}','1w')">لمدة أسبوع</button>
    <button class="dmex-mute-opt" onclick="window._dmExtrasSetMute('${otherId}','forever')">دائم</button>
  `;
  muteBox.classList.remove("open");

  menu.classList.add("open");
};
window._dmExtrasToggleMuteOptions = function (otherId) {
  document.querySelector("#dmExtrasMenu .dmex-mute-options")?.classList.toggle("open");
};
window._dmExtrasCloseMenu = function () {
  const menu = document.getElementById("dmExtrasMenu");
  menu?.classList.remove("open");
  menu?.querySelector(".dmex-mute-options")?.classList.remove("open");
};

/* ── دوال الكتابة الفعلية ── */
window._dmExtrasTogglePin = async function (otherId) {
  const uid = window.currentUser?.uid; if (!uid) return;
  const pinned = !!(_exCache[otherId] && _exCache[otherId].pinnedAt);
  const ok = await _exSetField(otherId, `pinnedAt_${uid}`, pinned ? null : serverTimestamp());
  if (ok) window.toast?.(pinned ? "تم إلغاء تثبيت المحادثة" : "تم تثبيت المحادثة");
  window._dmExtrasCloseMenu();
};

window._dmExtrasToggleFav = async function (otherId) {
  const uid = window.currentUser?.uid; if (!uid) return;
  const fav = !!(_exCache[otherId] && _exCache[otherId].fav);
  const ok = await _exSetField(otherId, `fav_${uid}`, fav ? null : true);
  if (ok) {
    window.toast?.(fav ? "تمت الإزالة من المفضلة" : "تمت الإضافة إلى المفضلة");
    // الانتقال مباشرة لقسم "مفضلة" عند الإضافة (وليس عند الإزالة) — بإعادة استخدام فلتر الواجهة الموجود أصلاً
    if (!fav) {
      const chip = document.querySelector('.dms-chip[data-filter="fav"]');
      if (chip && typeof window._dmsFilter === "function") window._dmsFilter(chip, "fav");
    }
  }
  window._dmExtrasCloseMenu();
};

window._dmExtrasToggleArchive = async function (otherId) {
  const uid = window.currentUser?.uid; if (!uid) return;
  const archived = !!(_exCache[otherId] && _exCache[otherId].archivedAt);
  const ok = await _exSetField(otherId, `archivedAt_${uid}`, archived ? null : serverTimestamp());
  if (ok) window.toast?.(archived ? "تم إلغاء أرشفة المحادثة" : "تم أرشفة المحادثة");
  window._dmExtrasCloseMenu();
};

function _futureTs(ms) { return Timestamp.fromMillis(Date.now() + ms); }

window._dmExtrasSetMute = async function (otherId, dur) {
  const uid = window.currentUser?.uid; if (!uid) return;
  let val = null, label = "تم إلغاء كتم المحادثة";
  if (dur === "forever") { val = "forever"; label = "تم كتم المحادثة بشكل دائم"; }
  else if (dur === "1h") { val = _futureTs(60 * 60 * 1000); label = "تم كتم المحادثة لمدة ساعة"; }
  else if (dur === "1d") { val = _futureTs(24 * 60 * 60 * 1000); label = "تم كتم المحادثة لمدة يوم"; }
  else if (dur === "1w") { val = _futureTs(7 * 24 * 60 * 60 * 1000); label = "تم كتم المحادثة لمدة أسبوع"; }
  const ok = await _exSetField(otherId, `mutedUntil_${uid}`, val);
  if (ok) window.toast?.(label);
  window._dmExtrasCloseMenu();
};

/* ══════════════════════════════════════════
   4) مؤشر "يسجل رسالة صوتية" — نفس نمط typing_{uid} بحقل recording_{uid} مستقل
      لا يكتب أبدًا فوق عنصر #chatTopOnline — فقط يُخفيه مؤقتًا ويظهر عنصره الخاص
══════════════════════════════════════════ */
let _exRecUnsub = null;

function _exEnsureRecEl() {
  let el = document.getElementById("dmExtrasRecStatus");
  if (!el) {
    const host = document.querySelector(".chat-header-info .status");
    if (!host) return null;
    el = document.createElement("span");
    el.id = "dmExtrasRecStatus";
    el.style.display = "none";
    el.innerHTML = '<span style="color:var(--gold, #c9a96e);animation:pulse 1s infinite;">🎤 يسجل رسالة صوتية...</span>';
    host.appendChild(el);
  }
  return el;
}

function _exStartRecordingListener(chatId) {
  if (_exRecUnsub) { _exRecUnsub(); _exRecUnsub = null; }
  if (!chatId || chatId === "public" || chatId.startsWith("room:") || !window.db) {
    // استعادة العرض الطبيعي (يحسم أي حالة إخفاء متبقية من محادثة خاصة سابقة)
    const overlay = document.getElementById("dmExtrasRecStatus");
    const orig    = document.getElementById("chatTopOnline");
    if (overlay) overlay.style.display = "none";
    if (orig)    orig.style.display    = "";
    return;
  }
  const roomId = _exRoomId(chatId);
  if (!roomId) return;
  _exRecUnsub = onSnapshot(doc(window.db, "privateChats", roomId), snap => {
    if (window._currentChatId !== chatId) return;
    if (!snap.exists()) return;
    const data = snap.data();
    const uid  = window.currentUser?.uid;
    const someoneRecording = Object.keys(data).some(k =>
      k.startsWith("recording_") && k !== ("recording_" + uid) && data[k] === true
    );
    const overlay = _exEnsureRecEl();
    const orig    = document.getElementById("chatTopOnline");
    if (!overlay || !orig) return;
    if (someoneRecording) {
      orig.style.display    = "none";
      overlay.style.display = "inline";
    } else {
      overlay.style.display = "none";
      orig.style.display    = "";
    }
  }, () => {});
}

/* ── كتابة إشارة التسجيل (تُستدعى من نقاط الربط في index.html) ── */
let _exRecFlagOn = false;
window._dmExtrasSetRecording = function (isRecording) {
  const uid = window.currentUser?.uid;
  const cid = window._currentChatId;
  if (!uid || !cid || cid === "public" || cid.startsWith("room:") || !window.db) return;
  if (isRecording === _exRecFlagOn) return;
  _exRecFlagOn = isRecording;
  const roomId = _exRoomId(cid);
  if (!roomId) return;
  const upd = {};
  upd[`recording_${uid}`] = isRecording ? true : deleteField();
  updateDoc(doc(window.db, "privateChats", roomId), upd).catch(() => {});
};

/* ══════════════════════════════════════════
   5) فاصل "الرسائل غير المقروءة"
      يُقرأ فقط من نفس بيانات seen==false الموجودة، بدون أي كتابة إضافية
══════════════════════════════════════════ */
let _exDividerObserver   = null;
let _exDividerUnreadUnsub = null;

function _exRemoveDivider() {
  document.getElementById("dmExtrasUnreadDivider")?.remove();
  if (_exDividerObserver)   { _exDividerObserver.disconnect();   _exDividerObserver = null; }
  if (_exDividerUnreadUnsub){ _exDividerUnreadUnsub();           _exDividerUnreadUnsub = null; }
}

function _exInsertDividerIfReady(anchorId) {
  const row = document.getElementById(`msg-${anchorId}`);
  const container = document.getElementById("chatMessages");
  if (!row || !container || document.getElementById("dmExtrasUnreadDivider")) return false;
  const divider = document.createElement("div");
  divider.className = "dm-extras-unread-divider";
  divider.id = "dmExtrasUnreadDivider";
  divider.innerHTML = `<span>الرسائل غير المقروءة</span>`;
  container.insertBefore(divider, row);
  return true;
}

function _exWatchAndInsertDivider(chatId, roomId, anchorId) {
  const container = document.getElementById("chatMessages");
  if (!container) return;

  if (!_exInsertDividerIfReady(anchorId)) {
    _exDividerObserver = new MutationObserver(() => {
      if (window._currentChatId !== chatId) { _exDividerObserver?.disconnect(); _exDividerObserver = null; return; }
      if (_exInsertDividerIfReady(anchorId)) { _exDividerObserver?.disconnect(); _exDividerObserver = null; }
    });
    _exDividerObserver.observe(container, { childList: true });
  }
  // ملاحظة: الفاصل يبقى ظاهرًا طوال مدة فتح هذه المحادثة، ويُزال تلقائيًا فقط
  // عند مغادرتها (عبر _dmExtrasOnChatOpen عند فتح أي محادثة أخرى) — وليس لحظة
  // انقلاب seen=true، لأن ذلك يحدث فوريًا عند الفتح أصلاً في هذا المشروع
  // (قد لا يُلاحَظ الفاصل إطلاقًا لو اختفى خلال أجزاء من الثانية).
}

async function _exCaptureUnreadDivider(chatId) {
  if (!chatId || chatId === "public" || chatId.startsWith("room:") || !window.db) return;
  const roomId = _exRoomId(chatId);
  if (!roomId) return;
  try {
    const uQ = query(collection(window.db, `privateChats/${roomId}/messages`), where("seen", "==", false));
    const snap = await getDocs(uQ);
    const others = snap.docs.filter(d => d.data().uid !== window.currentUser?.uid);
    if (!others.length) return;
    others.sort((a, b) => (a.data().createdAt?.toMillis?.() ?? 0) - (b.data().createdAt?.toMillis?.() ?? 0));
    _exWatchAndInsertDivider(chatId, roomId, others[0].id);
  } catch (e) {}
}

/* ══════════════════════════════════════════
   6) نقطة الدخول الموحّدة — تُستدعى من selectChat في index.html
══════════════════════════════════════════ */
window._dmExtrasOnChatOpen = function (chatId) {
  _exRemoveDivider();
  _exCaptureUnreadDivider(chatId);
  _exStartRecordingListener(chatId);
};

/* ══════════════════════════════════════════
   9) منع التحديد/النسخ على مستوى الموقع بالكامل
      استثناء: أي حقل كتابة (input/textarea/contenteditable) يبقى كما هو تمامًا
      لا يؤثر على الأزرار أو الضغط المطول الخاص بقائمة المحادثات (click/touch لا علاقة له بـ selection)
══════════════════════════════════════════ */
function _exIsEditableTarget(el) {
  if (!el) return false;
  const sel = 'input, textarea, [contenteditable="true"], [contenteditable=""]';
  return (el.matches && el.matches(sel)) || (el.closest && !!el.closest(sel));
}

document.addEventListener("contextmenu", e => {
  if (_exIsEditableTarget(e.target)) return;
  e.preventDefault();
}, true);

document.addEventListener("selectstart", e => {
  if (_exIsEditableTarget(e.target)) return;
  e.preventDefault();
});

document.addEventListener("copy", e => {
  if (_exIsEditableTarget(e.target)) return;
  e.preventDefault();
});

document.addEventListener("dragstart", e => {
  if (_exIsEditableTarget(e.target)) return;
  e.preventDefault();
});

/* ══════════════════════════════════════════
   10) الأنماط (CSS) — تُحقن مرة واحدة فقط، ذاتية الاحتواء بالكامل
══════════════════════════════════════════ */
(function _exInjectStyles() {
  if (document.getElementById("dmExtrasStyles")) return;
  const style = document.createElement("style");
  style.id = "dmExtrasStyles";
  style.textContent = `
    .dms-ex-badge { font-size: 12px; opacity: .85; }
    .dms-ex-badge.dms-ex-fav  { color: #ffc94d; }
    .dms-ex-badge.dms-ex-mute { color: var(--muted, #8d8d94); }
    .dms-ex-inline {
      display: flex; align-items: center; gap: 4px;
      margin-inline-start: auto; margin-inline-end: 6px; flex-shrink: 0;
    }

    /* ── شريط الإجراءات (الضغط المطوّل) — نفس نمط "الزجاج الشفاف" المستخدم
       أصلاً في الفقاعة السفلية وشرائح الفلترة، مش Bottom-Sheet قديم ── */
    .dmex-sheet { position: fixed; inset: 0; z-index: 9999; display: none; pointer-events: none; }
    .dmex-sheet.open { display: block; }
    .dmex-backdrop { position: absolute; inset: 0; pointer-events: auto; }
    .dmex-bar {
      position: absolute; top: 84px; left: 20px; right: 20px;
      display: flex; align-items: center; gap: 8px;
      background: rgba(20,20,22,0.18);
      backdrop-filter: blur(10px) saturate(150%);
      -webkit-backdrop-filter: blur(10px) saturate(150%);
      border: 1px solid var(--panel-border, rgba(255,255,255,.07));
      border-radius: 14px;
      padding: 8px 10px;
      pointer-events: auto;
      font-family: 'Cairo', system-ui, sans-serif;
      animation: dmexBarIn .18s ease;
    }
    @keyframes dmexBarIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
    .dmex-close {
      width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0;
      background: rgba(255,255,255,.06); border: none; color: var(--muted, #8d8d94);
      display: flex; align-items: center; justify-content: center; cursor: pointer;
    }
    .dmex-actions { display: flex; align-items: center; gap: 6px; flex: 1; overflow-x: auto; }
    .dmex-pill {
      display: flex; align-items: center; gap: 6px; flex-shrink: 0;
      background: rgba(255,255,255,.05);
      border: 1px solid var(--panel-border, rgba(255,255,255,.07));
      border-radius: 12px; padding: 7px 12px;
      font-size: 13px; font-family: inherit; color: var(--text, #f2f2f4); cursor: pointer;
      white-space: nowrap;
    }
    .dmex-pill i { color: var(--gold, #e0b23c); font-size: 12.5px; }
    .dmex-pill.active { background: rgba(224,178,60,.15); border-color: rgba(224,178,60,.4); color: var(--gold, #e0b23c); }
    .dmex-pill.active i { color: var(--gold, #e0b23c); }

    .dmex-mute-options {
      position: absolute; top: 138px; left: 20px; right: 20px;
      display: none; flex-direction: column; gap: 4px;
      background: rgba(20,20,22,0.18);
      backdrop-filter: blur(10px) saturate(150%);
      -webkit-backdrop-filter: blur(10px) saturate(150%);
      border: 1px solid var(--panel-border, rgba(255,255,255,.07));
      border-radius: 14px; padding: 8px;
      pointer-events: auto;
      font-family: 'Cairo', system-ui, sans-serif;
    }
    .dmex-mute-options.open { display: flex; }
    .dmex-mute-opt {
      background: transparent; border: none; text-align: right;
      color: var(--text, #f2f2f4); font-size: 14px; font-family: inherit;
      padding: 9px 12px; border-radius: 10px; cursor: pointer;
    }
    .dmex-mute-opt:active { background: rgba(255,255,255,.05); }
    .dmex-unmute { color: #e07b7b; }

    /* ── فاصل الرسائل غير المقروءة ── */
    .dm-extras-unread-divider {
      display: flex; align-items: center; gap: 10px;
      margin: 14px 10px; color: var(--gold, #e0b23c); font-size: 12px;
      opacity: 0; animation: dmexFadeIn .25s ease forwards;
    }
    .dm-extras-unread-divider::before,
    .dm-extras-unread-divider::after {
      content: ""; flex: 1; height: 1px; background: rgba(224,178,60,.35);
    }
    @keyframes dmexFadeIn { to { opacity: 1; } }

    /* ── منع التحديد/النسخ على مستوى الموقع (باستثناء حقول الكتابة) ── */
    body, body * {
      -webkit-user-select: none !important;
      -moz-user-select: none !important;
      user-select: none !important;
      -webkit-touch-callout: none !important;
    }
    input, textarea, [contenteditable="true"], [contenteditable=""] {
      -webkit-user-select: text !important;
      -moz-user-select: text !important;
      user-select: text !important;
      -webkit-touch-callout: default !important;
    }
  `;
  document.head.appendChild(style);
})();
