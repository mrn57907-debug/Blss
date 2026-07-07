import { collection, query, orderBy, limit, onSnapshot, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ══════════════════════════════════════════
   DMS PAGE — صفحة الدردشات الكاملة
   ▸ قائمة محادثات خاصة + شات عام
   ▸ الغرف كـ "مجتمعات"
   ▸ بحث + فلتر (الكل/غير مقروءة/مفضلة)
══════════════════════════════════════════ */

let _dmsInit        = false;
let _dmsCurFilter   = "all";
let _dmsCurTab      = "chats";
let _dmsUnsubs      = [];
let _dmsItems       = [];   // {id, name, photo, lastMsg, lastTime, unread, isPublic, isRoom}
let _dmsRooms       = [];
let _dmsFavs        = JSON.parse(localStorage.getItem("dms_favs") || "[]");

/* ── helpers ── */
function _formatTime(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 86400000) return d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
  if (diff < 604800000) return ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"][d.getDay()];
  return d.toLocaleDateString("ar-EG", { day: "2-digit", month: "2-digit" });
}

function _renderAvatar(photo, name, isPublic) {
  if (isPublic) return `<div class="dms-conv-avatar dms-conv-avatar-public"><i class="fa-solid fa-graduation-cap"></i></div>`;
  if (photo) return `<img class="dms-conv-avatar" src="${photo}" alt="">`;
  const c = (name || "?").charAt(0).toUpperCase();
  return `<div class="dms-conv-avatar dms-conv-avatar-letter">${c}</div>`;
}

/* ── بناء عنصر محادثة ── */
function _buildConvItem(item) {
  const isFav   = _dmsFavs.includes(item.id);
  const badge   = item.unread > 0 ? `<span class="dms-unread-badge">${item.unread}</span>` : "";
  const favIcon = isFav ? `<i class="fa-solid fa-star dms-fav-star"></i>` : "";
  return `
    <div class="dms-conv-item" data-id="${item.id}" data-unread="${item.unread}" data-fav="${isFav}"
         onclick="_dmsOpenChat('${item.id}','${item.name.replace(/'/g,"\\'")}','${item.photo || ""}')">
      ${_renderAvatar(item.photo, item.name, item.isPublic)}
      <div class="dms-conv-body">
        <div class="dms-conv-row1">
          <span class="dms-conv-name">${item.name}</span>
          <span class="dms-conv-time">${_formatTime(item.lastTime)}</span>
        </div>
        <div class="dms-conv-row2">
          <span class="dms-conv-last">${item.lastMsg || ""}</span>
          <span class="dms-conv-badges">${favIcon}${badge}</span>
        </div>
      </div>
    </div>`;
}

/* ── عرض القائمة مع تطبيق الفلتر والبحث ── */
function _renderConvList(search) {
  const el = document.getElementById("dmsConvList");
  if (!el) return;
  let items = [..._dmsItems];

  // فلتر
  if (_dmsCurFilter === "unread") items = items.filter(i => i.unread > 0);
  if (_dmsCurFilter === "fav")    items = items.filter(i => _dmsFavs.includes(i.id));

  // بحث
  if (search) {
    const s = search.toLowerCase();
    items = items.filter(i => i.name.toLowerCase().includes(s));
  }

  if (!items.length) {
    el.innerHTML = `<div class="dms-empty"><i class="fa-regular fa-comment-dots"></i><p>لا توجد محادثات</p></div>`;
    return;
  }
  el.innerHTML = items.map(_buildConvItem).join("");
}

/* ── فتح محادثة ── */
window._dmsOpenChat = function(id, name, photo) {
  if (id === "public") {
    window.selectChat("public", "الشات العام", "");
  } else if (id.startsWith("room:")) {
    window.selectChat(id, name, photo);
  } else {
    window.selectChat(id, name, photo);
  }
};

/* ── تبديل الفلتر ── */
window._dmsFilter = function(btn, filter) {
  _dmsCurFilter = filter;
  document.querySelectorAll(".dms-chip").forEach(c => c.classList.remove("active"));
  btn.classList.add("active");
  _renderConvList(document.getElementById("dmsSearchInp")?.value || "");
};

/* ── بحث ── */
window._dmsSearch = function(q) {
  _renderConvList(q);
};

/* ── تبديل التبويبات ── */
window._dmsSwitchTab = function(btn, panel) {
  _dmsCurTab = panel;
  document.querySelectorAll(".dms-tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".dms-panel").forEach(p => p.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById("dmspanel-" + panel)?.classList.add("active");

  // إظهار/إخفاء الفلاتر
  const filters = document.getElementById("dmsFilters");
  if (filters) filters.style.display = panel === "chats" ? "" : "none";

  if (panel === "rooms") _renderRooms();
};

/* ── search toggle ── */
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("dmsSearchToggle")?.addEventListener("click", () => {
    const bar = document.getElementById("dmsSearchBar");
    if (!bar) return;
    bar.classList.toggle("open");
    if (bar.classList.contains("open")) document.getElementById("dmsSearchInp")?.focus();
  });

  document.getElementById("dmsSearchInp")?.addEventListener("input", e => {
    _dmsSearch(e.target.value);
  });
});

/* ── بناء قائمة الغرف ── */
function _renderRooms() {
  const el = document.getElementById("dmsRoomsList");
  if (!el || !_dmsRooms.length) {
    if (el) el.innerHTML = `<div class="dms-empty"><i class="fa-solid fa-users"></i><p>لا توجد غرف</p></div>`;
    return;
  }
  el.innerHTML = _dmsRooms.map(r => `
    <div class="dms-conv-item" onclick="_dmsOpenChat('room:${r.id}','${(r.name||"غرفة").replace(/'/g,"\\'")}','${r.photo||""}')">
      ${r.photo
        ? `<img class="dms-conv-avatar" src="${r.photo}" alt="">`
        : `<div class="dms-conv-avatar dms-conv-avatar-room"><i class="fa-solid fa-users"></i></div>`
      }
      <div class="dms-conv-body">
        <div class="dms-conv-row1">
          <span class="dms-conv-name">${r.name || "غرفة"}</span>
        </div>
        <div class="dms-conv-row2">
          <span class="dms-conv-last">${r.desc || "غرفة نقاش"}</span>
        </div>
      </div>
    </div>`).join("");
}

/* ── تهيئة الصفحة ── */
window._dmsPageInit = async function() {
  if (!window.db || !window.currentUser) return;

  // إعادة تعيين البحث والتبويب
  const searchBar = document.getElementById("dmsSearchBar");
  if (searchBar) searchBar.style.display = "none";
  const searchInp = document.getElementById("dmsSearchInp");
  if (searchInp) searchInp.value = "";
  _dmsCurFilter = "all";
  _dmsCurTab    = "chats";
  document.querySelectorAll(".dms-chip").forEach((c,i) => c.classList.toggle("active", i===0));
  document.querySelectorAll(".dms-tab").forEach((t,i)  => t.classList.toggle("active", i===0));
  document.querySelectorAll(".dms-panel").forEach((p,i) => p.classList.toggle("active", i===0));
  const filters = document.getElementById("dmsFilters");
  if (filters) filters.style.display = "";

  if (_dmsInit) { _renderConvList(""); return; }
  _dmsInit = true;

  const uid = window.currentUser.uid;

  // الشات العام أولاً
  _dmsItems = [{
    id: "public", name: "الشات العام", photo: "", isPublic: true,
    lastMsg: "مباشر — الجميع", lastTime: null, unread: 0
  }];
  _renderConvList("");

  // جلب آخر رسالة في الشات العام
  const pubUnsub = onSnapshot(
    query(collection(window.db, "messages"), orderBy("createdAt","desc"), limit(1)),
    snap => {
      const d = snap.docs[0]?.data();
      const pub = _dmsItems.find(i => i.id === "public");
      if (pub && d) { pub.lastMsg = d.text || (d.image?"صورة":d.audio?"تسجيل":""); pub.lastTime = d.createdAt; }
      _renderConvList(document.getElementById("dmsSearchInp")?.value || "");
    }, () => {}
  );
  _dmsUnsubs.push(pubUnsub);

  // المحادثات الخاصة — onSnapshot على privateChats
  const chatsUnsub = onSnapshot(
    query(collection(window.db, "privateChats"), orderBy("lastAt","desc"), limit(50)),
    async snap => {
      const privItems = [];
      for (const docSnap of snap.docs) {
        const d = docSnap.data();
        if (!d.participants?.includes(uid)) continue;
        const otherId = d.participants.find(p => p !== uid);
        if (!otherId) continue;
        // جلب بيانات المستخدم
        let name = "مستخدم", photo = "";
        try {
          const uSnap = await getDoc(doc(window.db, "users", otherId));
          if (uSnap.exists()) { name = uSnap.data().name || "مستخدم"; photo = uSnap.data().photo || ""; }
        } catch(e) {}
        privItems.push({
          id: otherId, name, photo, isPublic: false,
          lastMsg: d.lastMsg || "", lastTime: d.lastAt || null,
          unread: d[`unread_${uid}`] || 0
        });
      }
      // دمج مع الشات العام
      _dmsItems = [
        _dmsItems.find(i => i.id === "public") || { id:"public", name:"الشات العام", photo:"", isPublic:true, lastMsg:"", lastTime:null, unread:0 },
        ...privItems
      ];
      _renderConvList(document.getElementById("dmsSearchInp")?.value || "");
    }, () => {}
  );
  _dmsUnsubs.push(chatsUnsub);

  // الغرف
  try {
    const roomsSnap = await getDoc ? null : null;
    const roomsUnsub = onSnapshot(collection(window.db, "rooms"), snap => {
      _dmsRooms = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (_dmsCurTab === "rooms") _renderRooms();
    }, () => {});
    _dmsUnsubs.push(roomsUnsub);
  } catch(e) {}
};
