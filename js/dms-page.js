import { collection, query, where, orderBy, onSnapshot, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ══════════════════════════════════════════
   DMS PAGE — صفحة الدردشات الكاملة
══════════════════════════════════════════ */

let _dmsInit      = false;
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
  if (diff < 86400000) return d.toLocaleTimeString("ar-EG", { hour:"2-digit", minute:"2-digit" });
  if (diff < 604800000) return ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"][d.getDay()];
  return d.toLocaleDateString("ar-EG", { day:"2-digit", month:"2-digit" });
}

/* ── avatar HTML ── */
function _avatar(photo, name, cls) {
  if (cls === "public") return `<div class="dms-conv-avatar dms-conv-avatar-public"><i class="fa-solid fa-graduation-cap"></i></div>`;
  if (cls === "room")   return `<div class="dms-conv-avatar dms-conv-avatar-room"><i class="fa-solid fa-users"></i></div>`;
  if (photo) return `<img class="dms-conv-avatar" src="${photo}" alt="">`;
  const c = (name||"?").charAt(0).toUpperCase();
  return `<div class="dms-conv-avatar dms-conv-avatar-letter">${c}</div>`;
}

/* ── بناء عنصر واحد ── */
function _buildItem(item) {
  const badge = item.unread > 0 ? `<span class="dms-unread-badge">${item.unread > 99 ? "99+" : item.unread}</span>` : "";
  return `
    <div class="dms-conv-item" onclick="_dmsOpenChat('${item.id}','${(item.name||"").replace(/'/g,"\\'")}','${item.photo||""}')">
      ${_avatar(item.photo, item.name, item.cls)}
      <div class="dms-conv-body">
        <div class="dms-conv-row1">
          <span class="dms-conv-name">${item.name}</span>
          <span class="dms-conv-time">${_fmt(item.lastTime)}</span>
        </div>
        <div class="dms-conv-row2">
          <span class="dms-conv-last">${item.lastMsg || "ابدأ المحادثة"}</span>
          <span class="dms-conv-badges">${badge}</span>
        </div>
      </div>
    </div>`;
}

/* ── عرض القائمة ── */
function _render(search) {
  const el = document.getElementById("dmsConvList");
  if (!el) return;
  let items = [..._dmsItems];
  if (_dmsCurFilter === "unread") items = items.filter(i => i.unread > 0);
  if (search) { const s = search.toLowerCase(); items = items.filter(i => i.name.toLowerCase().includes(s)); }
  if (!items.length) {
    el.innerHTML = `<div class="dms-empty"><i class="fa-regular fa-comment-dots"></i><p>لا توجد محادثات</p></div>`;
    return;
  }
  el.innerHTML = items.map(_buildItem).join("");
}

/* ── فتح محادثة ── */
window._dmsOpenChat = function(id, name, photo) {
  window.selectChat(id, name, photo);
};

/* ── فلتر ── */
window._dmsFilter = function(btn, filter) {
  _dmsCurFilter = filter;
  document.querySelectorAll(".dms-chip").forEach(c => c.classList.remove("active"));
  btn.classList.add("active");
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
  if (panel === "rooms") _renderRooms();
};

/* ── بحث ── */
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("dmsSearchToggle")?.addEventListener("click", () => {
    const bar = document.getElementById("dmsSearchBar");
    if (bar) bar.classList.toggle("open");
    if (document.getElementById("dmsSearchBar")?.classList.contains("open"))
      document.getElementById("dmsSearchInp")?.focus();
  });
  document.getElementById("dmsSearchInp")?.addEventListener("input", e => _render(e.target.value));
});

/* ── الغرف ── */
function _renderRooms() {
  const el = document.getElementById("dmsRoomsList");
  if (!el) return;
  if (!_dmsRooms.length) {
    el.innerHTML = `<div class="dms-empty"><i class="fa-solid fa-users"></i><p>لا توجد غرف</p></div>`;
    return;
  }
  el.innerHTML = _dmsRooms.map(r => `
    <div class="dms-conv-item" onclick="_dmsOpenChat('room:${r.id}','${(r.name||"غرفة").replace(/'/g,"\\'")}','${r.photo||""}')">
      ${r.photo ? `<img class="dms-conv-avatar" src="${r.photo}" alt="">` : `<div class="dms-conv-avatar dms-conv-avatar-room"><i class="fa-solid fa-users"></i></div>`}
      <div class="dms-conv-body">
        <div class="dms-conv-row1"><span class="dms-conv-name">${r.name||"غرفة"}</span></div>
        <div class="dms-conv-row2"><span class="dms-conv-last">${r.desc||"غرفة نقاش"}</span></div>
      </div>
    </div>`).join("");
}

/* ══ تهيئة الصفحة ══ */
window._dmsPageInit = function() {
  if (!window.db || !window.currentUser) return;

  // reset UI
  document.getElementById("dmsSearchBar")?.classList.remove("open");
  const si = document.getElementById("dmsSearchInp"); if (si) si.value = "";
  _dmsCurFilter = "all";
  _dmsCurTab    = "chats";
  document.querySelectorAll(".dms-chip").forEach((c,i) => c.classList.toggle("active", i===0));
  document.querySelectorAll(".dms-tab").forEach((t,i)  => t.classList.toggle("active", i===3));
  document.querySelectorAll(".dms-panel").forEach((p,i) => p.classList.toggle("active", i===0));
  const filters = document.getElementById("dmsFilters");
  if (filters) filters.style.display = "";

  if (_dmsInit) { _render(""); return; }
  _dmsInit = true;

  const uid = window.currentUser.uid;

  // ── الشات العام ──
  const pubItem = { id:"public", name:"الشات العام", photo:"", cls:"public", lastMsg:"مباشر — الجميع", lastTime:null, unread:0 };
  _dmsItems = [pubItem];
  _render("");

  // ── آخر رسالة في الشات العام ──
  const pubUnsub = onSnapshot(
    query(collection(window.db, "messages"), orderBy("createdAt","desc")),
    snap => {
      const d = snap.docs[0]?.data();
      const p = _dmsItems.find(i => i.id === "public");
      if (p && d) {
        p.lastMsg  = d.text || (d.image ? "📷 صورة" : d.audio ? "🎤 تسجيل" : "");
        p.lastTime = d.createdAt;
      }
      _render(document.getElementById("dmsSearchInp")?.value || "");
    }, () => {}
  );
  _dmsUnsubs.push(pubUnsub);

  // ── المحادثات الخاصة ──
  const privQ = query(
    collection(window.db, "privateChats"),
    where("participants", "array-contains", uid)
  );

  const privUnsub = onSnapshot(privQ, async snap => {
    const privItems = [];

    for (const docSnap of snap.docs) {
      const d        = docSnap.data();
      const otherId  = (d.participants || []).find(p => p !== uid);
      if (!otherId) continue;

      // جلب اسم وصورة المستخدم الآخر
      let name = "مستخدم", photo = "";
      try {
        const uSnap = await getDoc(doc(window.db, "users", otherId));
        if (uSnap.exists()) {
          name  = uSnap.data().name  || "مستخدم";
          photo = uSnap.data().photo || "";
        }
      } catch(e) {}

      // آخر رسالة وعداد غير مقروء
      const lastMsg  = d.lastMessage    || "";
      const lastTime = d.lastMessageAt  || null;
      const unread   = d.unread         || 0;

      privItems.push({ id: otherId, name, photo, cls: "", lastMsg, lastTime, unread });
    }

    // ترتيب حسب آخر رسالة
    privItems.sort((a,b) => {
      const ta = a.lastTime?.toMillis?.() || 0;
      const tb = b.lastTime?.toMillis?.() || 0;
      return tb - ta;
    });

    // دمج مع الشات العام
    const pub = _dmsItems.find(i => i.id === "public") || pubItem;
    _dmsItems = [pub, ...privItems];
    _render(document.getElementById("dmsSearchInp")?.value || "");
  }, () => {});
  _dmsUnsubs.push(privUnsub);

  // ── الغرف ──
  const roomsUnsub = onSnapshot(collection(window.db, "rooms"), snap => {
    _dmsRooms = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (_dmsCurTab === "rooms") _renderRooms();
  }, () => {});
  _dmsUnsubs.push(roomsUnsub);
};
