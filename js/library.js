import { collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ══════════════════════════════════════════
   LIBRARY SYSTEM — مكتبة المحاضرات
   Groups lectures by subject, subject cards,
   detail view, search, favourites
══════════════════════════════════════════ */

// Favourites stored in localStorage
const LIB_FAV_KEY = "_lib_favs_";

function _libGetFavs() {
  try { return JSON.parse(localStorage.getItem(LIB_FAV_KEY + (currentUser?.uid||"")) || "{}"); } catch(e) { return {}; }
}
function _libSaveFavs(obj) {
  try { localStorage.setItem(LIB_FAV_KEY + (currentUser?.uid||""), JSON.stringify(obj)); } catch(e) {}
}

// Detect domain from URL for icon
function _libDomainIcon(url) {
  if (!url) return { icon: "fa-solid fa-link", color: "#60a5fa", label: "" };
  try {
    const h = new URL(url).hostname.replace("www.","");
    if (/youtube\.com|youtu\.be/.test(h))   return { icon: "fa-brands fa-youtube",     color: "#ff4444", label: "YouTube" };
    if (/facebook\.com|fb\.com/.test(h))    return { icon: "fa-brands fa-facebook",    color: "#1877f2", label: "Facebook" };
    if (/drive\.google\.com/.test(h))       return { icon: "fa-brands fa-google-drive",color: "#34a853", label: "Google Drive" };
    if (/docs\.google\.com/.test(h))        return { icon: "fa-brands fa-google",      color: "#4285f4", label: "Google Docs" };
    if (/zoom\.us/.test(h))                 return { icon: "fa-solid fa-video",         color: "#2d8cff", label: "Zoom" };
    if (/teams\.microsoft\.com/.test(h))    return { icon: "fa-brands fa-microsoft",   color: "#6264a7", label: "Teams" };
    if (/mega\.nz|mega\.io/.test(h))        return { icon: "fa-solid fa-cloud",         color: "#d9272e", label: "MEGA" };
    if (/dropbox\.com/.test(h))             return { icon: "fa-brands fa-dropbox",     color: "#0061ff", label: "Dropbox" };
    if (/github\.com/.test(h))              return { icon: "fa-brands fa-github",      color: "#e8edf5", label: "GitHub" };
    if (/telegram\.me|t\.me/.test(h))       return { icon: "fa-brands fa-telegram",    color: "#26a5e4", label: "Telegram" };
    if (/whatsapp\.com/.test(h))            return { icon: "fa-brands fa-whatsapp",    color: "#25d366", label: "WhatsApp" };
    if (/instagram\.com/.test(h))           return { icon: "fa-brands fa-instagram",   color: "#e1306c", label: "Instagram" };
    return { icon: "fa-solid fa-link", color: "#60a5fa", label: h };
  } catch(e) { return { icon: "fa-solid fa-link", color: "#60a5fa", label: "" }; }
}

// Subject colour palette (cycles)
const _LIB_COLORS = [
  { bg:"rgba(59,130,246,.15)",  border:"rgba(59,130,246,.3)",  text:"#60a5fa",   icon:"fa-solid fa-calculator" },
  { bg:"rgba(139,92,246,.15)",  border:"rgba(139,92,246,.3)",  text:"#a78bfa",   icon:"fa-solid fa-code" },
  { bg:"rgba(20,184,166,.15)",  border:"rgba(20,184,166,.3)",  text:"#2dd4bf",   icon:"fa-solid fa-database" },
  { bg:"rgba(249,115,22,.15)",  border:"rgba(249,115,22,.3)",  text:"#fb923c",   icon:"fa-solid fa-network-wired" },
  { bg:"rgba(201,169,110,.15)", border:"rgba(201,169,110,.3)", text:"#c9a96e",   icon:"fa-solid fa-book" },
  { bg:"rgba(236,72,153,.15)",  border:"rgba(236,72,153,.3)",  text:"#f472b6",   icon:"fa-solid fa-flask" },
  { bg:"rgba(34,197,94,.15)",   border:"rgba(34,197,94,.3)",   text:"#4ade80",   icon:"fa-solid fa-leaf" },
  { bg:"rgba(239,68,68,.15)",   border:"rgba(239,68,68,.3)",   text:"#fca5a5",   icon:"fa-solid fa-atom" },
];

let _libAllDocs = []; // cache of all lecture docs
let _libCurSubject = null;

function _libColorFor(subject) {
  // deterministic colour based on subject name hash
  let h = 0;
  for (let i = 0; i < (subject||"").length; i++) h = (h * 31 + subject.charCodeAt(i)) & 0xffff;
  return _LIB_COLORS[h % _LIB_COLORS.length];
}

function _libRenderSubjectGrid(docs, query) {
  const grid = document.getElementById("libSubjectGrid");
  if (!grid) return;

  // Group by subject (case-insensitive trim)
  const groups = {};
  docs.forEach(d => {
    const subj = (d.subject || d.title || "عام").trim();
    const key  = subj.toLowerCase();
    if (!groups[key]) groups[key] = { subject: subj, items: [] };
    groups[key].items.push(d);
  });

  const favs = _libGetFavs();
  const keys = Object.keys(groups);

  if (!keys.length) {
    grid.innerHTML = query
      ? `<div class="empty-state" style="grid-column:1/-1">لا توجد نتائج للبحث</div>`
      : `<div class="empty-state" style="grid-column:1/-1">لم تُضَف محاضرات بعد</div>`;
    return;
  }

  grid.innerHTML = "";
  keys.sort().forEach((key, idx) => {
    const g   = groups[key];
    const col = _libColorFor(g.subject);
    const isFav = !!favs["subj_" + key];
    const card  = document.createElement("div");
    card.className = "lib-subject-card";
    card.innerHTML = `
      <div class="lib-subject-card-top">
        <div class="lib-subject-icon" style="background:${col.bg};border-color:${col.border};color:${col.text}">
          <i class="${col.icon}"></i>
        </div>
        <button class="lib-subject-fav-btn${isFav ? " active" : ""}" data-subj="${key}" title="${isFav ? "إزالة من المفضلة" : "حفظ في المفضلة"}">
          <i class="fa-${isFav ? "solid" : "regular"} fa-bookmark"></i>
        </button>
      </div>
      <div class="lib-subject-name">${esc(g.subject)}</div>
      <div class="lib-subject-count">${g.items.length} ${g.items.length === 1 ? "محاضرة" : "محاضرات"}</div>
    `;
    card.querySelector(".lib-subject-fav-btn").addEventListener("click", e => {
      e.stopPropagation();
      const f2 = _libGetFavs();
      const sk = "subj_" + key;
      if (f2[sk]) { delete f2[sk]; } else { f2[sk] = g.subject; }
      _libSaveFavs(f2);
      _libUpdateFavCount();
      _libRenderSubjectGrid(_libAllDocs, _libCurrentQuery);
    });
    card.addEventListener("click", () => _libOpenSubject(g.subject, g.items, col));
    grid.appendChild(card);
  });
}

let _libCurrentQuery = "";

function _libOpenSubject(subject, items, col) {
  _libCurSubject = subject;
  document.getElementById("libSubjectGrid").style.display  = "none";
  document.getElementById("libSubjectDetail").style.display = "";
  document.getElementById("libFavView").style.display       = "none";
  document.getElementById("libDetailIcon").innerHTML = `<i class="${col.icon}"></i>`;
  document.getElementById("libDetailIcon").style.cssText    = `background:${col.bg};border-color:${col.border};color:${col.text}`;
  document.getElementById("libDetailName").textContent      = subject;
  document.getElementById("libDetailCount").textContent     = items.length + " " + (items.length === 1 ? "محاضرة" : "محاضرات");

  const favs = _libGetFavs();
  const isFav = !!favs["subj_" + subject.toLowerCase()];
  const fb = document.getElementById("libFavSubjectBtn");
  fb.classList.toggle("active", isFav);
  fb.querySelector("i").className = `fa-${isFav ? "solid" : "regular"} fa-bookmark`;

  _libRenderItems(items, document.getElementById("libItemsList"));
}

function _libRenderItems(items, container) {
  if (!container) return;
  container.innerHTML = "";
  if (!items.length) {
    container.innerHTML = `<div class="empty-state">لا توجد محاضرات في هذه المادة</div>`;
    return;
  }
  items.forEach(d => {
    const el = _libBuildItemCard(d);
    container.appendChild(el);
  });
}

function _libBuildItemCard(d) {
  const favs = _libGetFavs();
  const isFav = !!favs["lec_" + d._id];

  const div = document.createElement("div");
  div.className = "lib-item-card";

  let contentHTML = "";
  const ctype = d.contentType || (d.pdf ? "pdf" : "link");

  if (ctype === "pdf" || d.pdf) {
    const pdfUrl = d.pdf || d.url || "";
    contentHTML = `
      <a class="lib-item-link" href="${esc(pdfUrl)}" target="_blank" rel="noopener">
        <span class="lib-item-link-icon" style="background:rgba(239,68,68,.15);color:#fca5a5;border-color:rgba(239,68,68,.25)"><i class="fa-solid fa-file-pdf"></i></span>
        <span class="lib-item-link-label">فتح PDF</span>
        <i class="fa-solid fa-arrow-up-right-from-square lib-item-link-ext"></i>
      </a>`;
  } else if (ctype === "link" || d.url) {
    const url    = d.url || "";
    const { icon, color, label } = _libDomainIcon(url);
    contentHTML = `
      <a class="lib-item-link" href="${esc(url)}" target="_blank" rel="noopener">
        <span class="lib-item-link-icon" style="background:${color}22;color:${color};border-color:${color}44"><i class="${icon}"></i></span>
        <span class="lib-item-link-label">${label || "فتح الرابط"}</span>
        <i class="fa-solid fa-arrow-up-right-from-square lib-item-link-ext"></i>
      </a>`;
  } else if (ctype === "text" || d.text) {
    const txt = d.text || "";
    contentHTML = `<div class="lib-item-text">${esc(txt)}</div>`;
  }

  const ts = d.createdAt ? (d.createdAt.toDate?.() || new Date(d.createdAt)).toLocaleDateString("ar-EG",{day:"numeric",month:"short",year:"numeric"}) : "";

  div.innerHTML = `
    <div class="lib-item-hdr">
      <div class="lib-item-title">${esc(d.title || "بدون عنوان")}</div>
      <button class="lib-item-fav-btn${isFav ? " active" : ""}" title="${isFav ? "إزالة" : "حفظ"}">
        <i class="fa-${isFav ? "solid" : "regular"} fa-bookmark"></i>
      </button>
    </div>
    ${d.description ? `<div class="lib-item-desc">${esc(d.description)}</div>` : ""}
    ${contentHTML}
    <div class="lib-item-footer">
      ${ts ? `<span class="lib-item-date"><i class="fa-regular fa-clock"></i> ${ts}</span>` : ""}
      ${isAdmin() ? `<button class="lib-item-del-btn"><i class="fa-solid fa-trash-can"></i> حذف</button>` : ""}
    </div>
  `;

  div.querySelector(".lib-item-fav-btn").addEventListener("click", () => {
    const f2 = _libGetFavs();
    const fk = "lec_" + d._id;
    if (f2[fk]) { delete f2[fk]; } else { f2[fk] = { ...d }; }
    _libSaveFavs(f2);
    _libUpdateFavCount();
    const btn = div.querySelector(".lib-item-fav-btn");
    const isnow = !!_libGetFavs()[fk];
    btn.classList.toggle("active", isnow);
    btn.querySelector("i").className = `fa-${isnow ? "solid" : "regular"} fa-bookmark`;
  });

  div.querySelector(".lib-item-del-btn")?.addEventListener("click", () => {
    deleteItem("lectures", d._id, null);
    div.style.opacity = "0.4";
    setTimeout(() => { div.remove(); _libReload(); }, 600);
  });

  return div;
}

function _libUpdateFavCount() {
  const favs = _libGetFavs();
  const lecFavs = Object.keys(favs).filter(k => k.startsWith("lec_")).length;
  const cnt = document.getElementById("libFavCount");
  const btn = document.getElementById("libFavBtn");
  if (!cnt || !btn) return;
  if (lecFavs > 0) {
    cnt.style.display = "";
    cnt.textContent = lecFavs;
    btn.classList.add("has-favs");
  } else {
    cnt.style.display = "none";
    btn.classList.remove("has-favs");
  }
}

window._libBackToGrid = function() {
  _libCurSubject = null;
  document.getElementById("libSubjectDetail").style.display = "none";
  document.getElementById("libSubjectGrid").style.display   = "";
  document.getElementById("libFavView").style.display       = "none";
};

window._libToggleFavView = function() {
  const fv = document.getElementById("libFavView");
  const sg = document.getElementById("libSubjectGrid");
  const sd = document.getElementById("libSubjectDetail");
  const isOpen = fv && fv.style.display !== "none";
  if (isOpen) {
    fv.style.display = "none";
    sg.style.display = "";
    sd.style.display = "none";
    _libCurSubject   = null;
  } else {
    fv.style.display  = "";
    sg.style.display  = "none";
    sd.style.display  = "none";
    _libCurSubject    = null;
    _libRenderFavList();
  }
};

window._libCloseFavView = function() {
  document.getElementById("libFavView").style.display       = "none";
  document.getElementById("libSubjectGrid").style.display   = "";
  document.getElementById("libSubjectDetail").style.display = "none";
};

function _libRenderFavList() {
  const favs  = _libGetFavs();
  const list  = document.getElementById("libFavList");
  if (!list) return;
  const items = Object.keys(favs)
    .filter(k => k.startsWith("lec_"))
    .map(k => favs[k]);
  list.innerHTML = "";
  if (!items.length) {
    list.innerHTML = `<div class="empty-state">لا توجد محاضرات في المفضلة بعد</div>`;
    return;
  }
  items.forEach(d => list.appendChild(_libBuildItemCard(d)));
}

window._libToggleFavSubject = function() {
  if (!_libCurSubject) return;
  const favs = _libGetFavs();
  const key  = "subj_" + _libCurSubject.toLowerCase();
  if (favs[key]) { delete favs[key]; } else { favs[key] = _libCurSubject; }
  _libSaveFavs(favs);
  const fb   = document.getElementById("libFavSubjectBtn");
  const isnow = !!_libGetFavs()[key];
  fb.classList.toggle("active", isnow);
  fb.querySelector("i").className = `fa-${isnow ? "solid" : "regular"} fa-bookmark`;
};

// Search
window._libClearSearch = function() {
  const inp = document.getElementById("libSearchInp");
  if (inp) { inp.value = ""; inp.dispatchEvent(new Event("input")); }
};

function _libFilterDocs(docs, q) {
  if (!q) return docs;
  const lq = q.toLowerCase();
  return docs.filter(d =>
    (d.subject||"").toLowerCase().includes(lq) ||
    (d.title||"").toLowerCase().includes(lq) ||
    (d.description||"").toLowerCase().includes(lq) ||
    (d.text||"").toLowerCase().includes(lq)
  );
}

function _libInitSearch() {
  const inp = document.getElementById("libSearchInp");
  const clr = document.getElementById("libSearchClear");
  if (!inp) return;
  inp.addEventListener("input", () => {
    const q = inp.value.trim();
    _libCurrentQuery = q;
    if (clr) clr.style.display = q ? "" : "none";
    // If in detail view, go back to grid first
    if (_libCurSubject) _libBackToGrid();
    document.getElementById("libFavView").style.display = "none";
    document.getElementById("libSubjectGrid").style.display = "";
    const filtered = _libFilterDocs(_libAllDocs, q);
    _libRenderSubjectGrid(filtered, q);
  });
}

// Main load function — replaces old loadLectures for library view
function _libReload() {
  loadLectures();
}

async function loadLectures() {
  const grid   = document.getElementById("libSubjectGrid");
  const detail = document.getElementById("libSubjectDetail");
  const fav    = document.getElementById("libFavView");
  if (grid)   grid.innerHTML = `<div style="grid-column:1/-1"><div class="spinner"></div></div>`;
  if (detail) detail.style.display = "none";
  if (fav)    fav.style.display    = "none";

  // Show/reset grid
  if (grid) grid.style.display = "";
  _libCurSubject = null;

  try {
    const snap = await getDocs(query(collection(db, "lectures"), orderBy("createdAt","desc")));
    _libAllDocs  = [];
    snap.forEach(d => _libAllDocs.push({ _id: d.id, ...d.data() }));
    _libCurrentQuery = (document.getElementById("libSearchInp")?.value || "").trim();
    const filtered = _libFilterDocs(_libAllDocs, _libCurrentQuery);
    _libRenderSubjectGrid(filtered, _libCurrentQuery);
    _libUpdateFavCount();
    // Init search once
    if (!document.getElementById("libSearchInp")?._libInited) {
      const inp = document.getElementById("libSearchInp");
      if (inp) { inp._libInited = true; _libInitSearch(); }
    }
    // Also keep legacy lecturesList empty (hidden)
    const legacy = document.getElementById("lecturesList");
    if (legacy) legacy.innerHTML = "";
  } catch(e) {
    if (grid) grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">خطأ في التحميل</div>`;
    console.error(e);
  }
}

// Sync content type fields (admin/owner forms)
window._syncLecFields = function(prefix) {
  const type = document.getElementById(prefix + "Type")?.value || "link";
  ["Link","Pdf","Text"].forEach(t => {
    const el = document.getElementById(prefix + "Field" + t);
    if (el) el.style.display = (type.toLowerCase() === t.toLowerCase()) ? "" : "none";
  });
};

window.loadLectures = loadLectures;
