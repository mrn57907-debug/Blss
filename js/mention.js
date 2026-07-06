import { collection, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ══════════════════════════════════════════
   MENTION SYSTEM — نظام المنشن @
   ▸ يعمل في الشات العام والغرف
   ▸ بحث بالاسم أو publicId
   ▸ لا يلمس sendMessage أو أي نظام آخر
══════════════════════════════════════════ */

const MENTION_CACHE_TTL = 5 * 60 * 1000; // 5 دقائق
let _mentionUsers    = [];
let _mentionCacheAt  = 0;
let _mentionActive   = false;
let _mentionQuery    = "";
let _mentionStart    = -1; // موضع @ في الـ input
let _activeIndex     = -1;

// ── جلب قائمة المستخدمين مع cache ──
async function _fetchUsers() {
  const now = Date.now();
  if (_mentionUsers.length && now - _mentionCacheAt < MENTION_CACHE_TTL) return _mentionUsers;
  try {
    const snap = await getDocs(query(collection(window.db, "users"), orderBy("name"), limit(200)));
    _mentionUsers = snap.docs
      .map(d => ({ uid: d.id, name: d.data().name || "", photo: d.data().photo || "", publicId: d.data().publicId || "" }))
      .filter(u => u.uid !== window.currentUser?.uid);
    _mentionCacheAt = now;
  } catch(e) {}
  return _mentionUsers;
}

// ── تصفية المستخدمين بالبحث ──
function _filterUsers(q) {
  const s = q.toLowerCase().trim();
  if (!s) return _mentionUsers.slice(0, 20);
  return _mentionUsers.filter(u =>
    u.name.toLowerCase().includes(s) || u.publicId.toLowerCase().includes(s)
  ).slice(0, 20);
}

// ── بناء الـ dropdown ──
function _renderDropdown(users) {
  const el = document.getElementById("mentionDropdown");
  if (!el) return;

  const list = users.length
    ? users.map((u, i) => `
        <div class="mention-item${i === _activeIndex ? " active" : ""}" data-uid="${u.uid}" data-name="${u.name}">
          ${u.photo
            ? `<img class="mention-avatar" src="${u.photo}" alt="">`
            : `<div class="mention-avatar" style="display:flex;align-items:center;justify-content:center;font-size:14px;color:var(--muted);">👤</div>`
          }
          <div>
            <div class="mention-name">${u.name}</div>
            ${u.publicId ? `<div class="mention-id">#${u.publicId}</div>` : ""}
          </div>
        </div>`).join("")
    : `<div class="mention-empty">لا توجد نتائج</div>`;

  el.innerHTML = `
    <div class="mention-search-wrap">
      <i class="fa-solid fa-magnifying-glass"></i>
      <input class="mention-search-inp" id="mentionSearchInp"
        placeholder="ابحث بالاسم أو الرقم..."
        value="${_mentionQuery}"
        autocomplete="off">
    </div>
    <div class="mention-list" id="mentionList">${list}</div>`;

  // ربط البحث
  const inp = document.getElementById("mentionSearchInp");
  if (inp) {
    inp.focus();
    inp.selectionStart = inp.selectionEnd = inp.value.length;
    inp.addEventListener("input", async e => {
      _mentionQuery = e.target.value;
      const users2 = _filterUsers(_mentionQuery);
      _activeIndex = -1;
      _renderDropdown(users2);
    });
    inp.addEventListener("keydown", _onDropdownKey);
  }

  // ربط الكليك
  el.querySelectorAll(".mention-item").forEach(item => {
    item.addEventListener("click", () => _insertMention(item.dataset.name));
  });
}

// ── إدراج المنشن في الـ input ──
function _insertMention(name) {
  const input = document.getElementById("chatInput");
  if (!input) return;
  const val   = input.value;
  const before = val.substring(0, _mentionStart);
  const after  = val.substring(input.selectionStart);
  input.value  = before + "@" + name + " " + after;
  input.focus();
  const pos = (before + "@" + name + " ").length;
  input.setSelectionRange(pos, pos);
  _closeDropdown();
}

// ── إغلاق الـ dropdown ──
function _closeDropdown() {
  _mentionActive = false;
  _mentionQuery  = "";
  _mentionStart  = -1;
  _activeIndex   = -1;
  const el = document.getElementById("mentionDropdown");
  if (el) el.style.display = "none";
}

// ── فتح الـ dropdown ──
async function _openDropdown() {
  _mentionActive = true;
  const el  = document.getElementById("mentionDropdown");
  const bar = document.getElementById("chatInputBar");
  if (!el) return;

  // حساب الموضع بناءً على chatInputBar
  if (bar) {
    const rect = bar.getBoundingClientRect();
    el.style.bottom = (window.innerHeight - rect.top + 6) + "px";
  }

  el.style.display = "flex";
  await _fetchUsers();
  _renderDropdown(_filterUsers(_mentionQuery));
}

// ── التنقل بالكيبورد داخل الـ dropdown ──
function _onDropdownKey(e) {
  const items = document.querySelectorAll("#mentionList .mention-item");
  if (e.key === "ArrowDown") {
    e.preventDefault();
    _activeIndex = Math.min(_activeIndex + 1, items.length - 1);
    _renderDropdown(_filterUsers(_mentionQuery));
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    _activeIndex = Math.max(_activeIndex - 1, 0);
    _renderDropdown(_filterUsers(_mentionQuery));
  } else if (e.key === "Enter" && _activeIndex >= 0) {
    e.preventDefault();
    const active = document.querySelector("#mentionList .mention-item.active");
    if (active) _insertMention(active.dataset.name);
  } else if (e.key === "Escape") {
    _closeDropdown();
  }
}

// ── مراقبة chatInput ──
function _initMention() {
  const input = document.getElementById("chatInput");
  if (!input) { setTimeout(_initMention, 300); return; }

  input.addEventListener("input", async () => {
    const val = input.value;
    const pos = input.selectionStart;

    // ابحث عن @ قبل موضع الكيرسور
    let atPos = -1;
    for (let i = pos - 1; i >= 0; i--) {
      if (val[i] === "@") { atPos = i; break; }
      if (val[i] === " " || val[i] === "\n") break;
    }

    if (atPos !== -1) {
      _mentionStart = atPos;
      _mentionQuery = val.substring(atPos + 1, pos);
      if (!_mentionActive) await _openDropdown();
      else {
        await _fetchUsers();
        _renderDropdown(_filterUsers(_mentionQuery));
      }
    } else {
      if (_mentionActive) _closeDropdown();
    }
  });

  input.addEventListener("keydown", e => {
    if (!_mentionActive) return;
    if (["ArrowDown","ArrowUp","Enter","Escape"].includes(e.key)) {
      _onDropdownKey(e);
    }
  });

  // إغلاق عند الضغط خارج الـ dropdown
  document.addEventListener("click", e => {
    if (_mentionActive &&
        !e.target.closest("#mentionDropdown") &&
        e.target.id !== "chatInput") {
      _closeDropdown();
    }
  });
}

_initMention();
