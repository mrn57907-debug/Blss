import { doc, getDoc, updateDoc, collection, addDoc, onSnapshot, serverTimestamp, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ══════════════════════════════════════════
   POLL SYSTEM — نظام الاستطلاعات
══════════════════════════════════════════ */

// ── بناء HTML بطاقة الاستطلاع ──
function _buildPollHTML(docId, poll, myUid) {
  if (!poll || !poll.question || !Array.isArray(poll.options)) return "";
  const votes   = poll.votes   || {};  // { optionIndex: [uid, ...] }
  const myVote  = _getPollMyVote(votes, myUid); // index or null
  const total   = Object.values(votes).reduce((s, arr) => s + (Array.isArray(arr) ? arr.length : 0), 0);
  const voted   = myVote !== null;

  const optsHTML = poll.options.map((opt, i) => {
    const cnt  = Array.isArray(votes[i]) ? votes[i].length : 0;
    const pct  = total > 0 ? Math.round((cnt / total) * 100) : 0;
    const isMyVote = myVote === i;
    return `<button class="poll-option${voted?" voted":""}${isMyVote?" my-vote":""}"
      onclick="castPollVote('${esc(docId)}',${i})"
      ${voted && !isMyVote ? 'style="cursor:default"' : ""}>
      <div class="poll-bar" style="width:${pct}%"></div>
      <div class="poll-option-inner">
        <div class="poll-opt-left">
          <div class="poll-opt-check">${isMyVote?'<i class="fa-solid fa-check"></i>':""}</div>
          <span class="poll-opt-label">${esc(opt)}</span>
        </div>
        <span class="poll-opt-pct">${voted?pct+"%":""}</span>
      </div>
    </button>`;
  }).join("");

  return `<div class="poll-card" data-poll-id="${esc(docId)}">
    <div class="poll-question"><i class="fa-solid fa-chart-bar"></i>${esc(poll.question)}</div>
    <div class="poll-options-wrap">${optsHTML}</div>
    <div class="poll-footer"><i class="fa-solid fa-users"></i> ${total} مشارك${voted?"":' · اضغط للتصويت'}</div>
  </div>`;
}
window._buildPollHTML = _buildPollHTML;

function _getPollMyVote(votes, myUid) {
  if (!myUid || !votes) return null;
  for (const [idx, arr] of Object.entries(votes)) {
    if (Array.isArray(arr) && arr.includes(myUid)) return Number(idx);
  }
  return null;
}

// ── تحديث بطاقة الاستطلاع في DOM ──
function _refreshPollCard(docId, poll) {
  const card = document.querySelector(`.poll-card[data-poll-id="${docId}"]`);
  if (!card) return;
  const newHTML = _buildPollHTML(docId, poll, currentUser?.uid);
  const tmp = document.createElement("div");
  tmp.innerHTML = newHTML;
  const newCard = tmp.firstElementChild;
  if (newCard) card.replaceWith(newCard);
}

// ── التصويت في الاستطلاع ──
window.castPollVote = async function(docId, optionIndex) {
  if (!currentUser?.uid) return;
  const myUid   = currentUser.uid;
  const colPath = chatColPath(_currentChatId);
  const msgRef  = doc(db, colPath, docId);
  try {
    const snap = await getDoc(msgRef);
    if (!snap.exists()) return;
    const d    = snap.data();
    const poll = d.poll;
    if (!poll) return;
    const votes   = poll.votes || {};
    const myVote  = _getPollMyVote(votes, myUid);
    // إذا صوّت بنفس الخيار لا نفعل شيئاً
    if (myVote === optionIndex) return;
    // إزالة من الخيار السابق إن وجد
    const upd = {};
    if (myVote !== null) {
      upd[`poll.votes.${myVote}`] = arrayRemove(myUid);
    }
    upd[`poll.votes.${optionIndex}`] = arrayUnion(myUid);
    await updateDoc(msgRef, upd);
  } catch(e) { console.warn("castPollVote:", e); }
};

// ── مستمع تحديث الاستطلاعات المعروضة ──
const _pollListeners = {}; // docId → unsub

function _ensurePollListener(docId) {
  if (_pollListeners[docId]) return;
  const colPath = chatColPath(_currentChatId);
  const msgRef  = doc(db, colPath, docId);
  _pollListeners[docId] = onSnapshot(msgRef, snap => {
    if (!snap.exists()) return;
    const d = snap.data();
    if (d.poll) _refreshPollCard(docId, d.poll);
  }, () => {});
}
window._ensurePollListener = _ensurePollListener;

// تنظيف المستمعين عند تغيير الشات
const _origStartChat = typeof startChatListener === "function" ? startChatListener : null;
(function _patchChatForPolls() {
  const _oc = window.selectChat || null;
  if (_oc) {
    const _orig = _oc;
    window.selectChat = function(chatId) {
      Object.values(_pollListeners).forEach(u => { try{u();}catch(e){} });
      Object.keys(_pollListeners).forEach(k => delete _pollListeners[k]);
      return _orig.apply(this, arguments);
    };
  }
})();

// ── Modal ──
window.openPollModal = function() {
  if (_isChatBanned) { toast("أنت محظور من إرسال الرسائل","error"); return; }
  if (_avm.active)   { toast("⛔ لا يمكن الإرسال في وضع المشاهدة","error"); return; }
  // Reset
  document.getElementById("pollQuestion").value = "";
  const list = document.getElementById("pollOptionsList");
  list.innerHTML = `
    <div class="poll-opt-row"><input class="poll-opt-inp" placeholder="الخيار الأول" maxlength="100"></div>
    <div class="poll-opt-row"><input class="poll-opt-inp" placeholder="الخيار الثاني" maxlength="100"></div>
  `;
  document.getElementById("pollAddOptBtn").style.display = "";
  document.getElementById("pollModal").classList.add("open");
  setTimeout(() => document.getElementById("pollQuestion").focus(), 150);
};
window.closePollModal = function() {
  document.getElementById("pollModal").classList.remove("open");
};

window.pollAddOption = function() {
  const list  = document.getElementById("pollOptionsList");
  const count = list.querySelectorAll(".poll-opt-row").length;
  if (count >= 6) { toast("الحد الأقصى 6 خيارات","warn"); return; }
  const row = document.createElement("div");
  row.className = "poll-opt-row";
  row.innerHTML = `
    <input class="poll-opt-inp" placeholder="خيار ${count+1}" maxlength="100">
    <button class="poll-remove-opt" onclick="pollRemoveOption(this)" title="حذف"><i class="fa-solid fa-xmark"></i></button>
  `;
  list.appendChild(row);
  if (list.querySelectorAll(".poll-opt-row").length >= 6) {
    document.getElementById("pollAddOptBtn").style.display = "none";
  }
  row.querySelector("input").focus();
};
window.pollRemoveOption = function(btn) {
  btn.closest(".poll-opt-row").remove();
  document.getElementById("pollAddOptBtn").style.display = "";
};

window.pollSubmit = async function() {
  if (!currentUser) return;
  const question = document.getElementById("pollQuestion").value.trim();
  if (!question) { toast("اكتب سؤال الاستطلاع","warn"); return; }
  const inputs  = document.querySelectorAll("#pollOptionsList .poll-opt-inp");
  const options = Array.from(inputs).map(i => i.value.trim()).filter(Boolean);
  if (options.length < 2) { toast("أضف خيارين على الأقل","warn"); return; }
  if (new Set(options).size !== options.length) { toast("الخيارات يجب أن تكون مختلفة","warn"); return; }

  const btn = document.getElementById("pollSendBtn");
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الإرسال...';

  try {
    const colPath  = chatColPath(_currentChatId);
    const isPrivate = _currentChatId !== "public";
    const msgData = {
      uid:       currentUser.uid,
      name:      currentName,
      photo:     currentPhoto,
      createdAt: serverTimestamp(),
      poll: {
        question,
        options,
        votes: {}   // { 0:[uid,...], 1:[uid,...] }
      },
      ...(isPrivate ? { senderId: currentUser.uid, delivered: false, seen: false }
                    : { time: new Date().toLocaleTimeString("ar-EG",{hour:"2-digit",minute:"2-digit"}) })
    };
    await addDoc(collection(db, colPath), msgData);
    closePollModal();
    toast("✅ تم إرسال الاستطلاع","success");
  } catch(e) {
    toast("فشل إرسال الاستطلاع","error");
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> إرسال الاستطلاع';
  }
};

// إغلاق modal عند النقر خارجه
document.getElementById("pollModal")?.addEventListener("click", function(e) {
  if (e.target === this) closePollModal();
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && document.getElementById("pollModal")?.classList.contains("open")) {
    closePollModal();
  }
});

// ── Reactions ──
const REACTION_EMOJIS = ["❤️","👍","😂","😮","😢","🔥"];

async function ctxReact(emoji) {
  hideMsgCtxMenu();
  if (!_ctxDocId || !currentUser) return;
  await toggleReaction(_ctxDocId, emoji, _currentChatId);
}
window.ctxReact = ctxReact;

async function toggleReaction(docId, emoji, chatId) {
  if (!currentUser?.uid) return;
  const uid = currentUser.uid;
  const colPath = chatColPath(chatId || _currentChatId);
  const msgRef  = doc(db, colPath, docId);
  try {
    // Read current reactions for this emoji to decide add vs remove
    const snap = await getDoc(msgRef);
    if (!snap.exists()) return;
    const existing = snap.data().reactions || {};
    const voters   = existing[emoji] || [];
    const hasVoted = voters.includes(uid);

    // Build update: remove from any previous emoji, add/remove on this one
    const upd = {};
    if (hasVoted) {
      // Toggle off
      upd[`reactions.${emoji}`] = arrayRemove(uid);
    } else {
      // Remove from any other emoji the user had (one reaction per user)
      REACTION_EMOJIS.forEach(e => {
        if (e !== emoji && (existing[e] || []).includes(uid)) {
          upd[`reactions.${e}`] = arrayRemove(uid);
        }
      });
      upd[`reactions.${emoji}`] = arrayUnion(uid);
    }
    await updateDoc(msgRef, upd);
  } catch(e) { console.warn("reaction error:", e); }
}
window.toggleReaction = toggleReaction;

function _buildReactionChipsHTML(reactions, myUid) {
  if (!reactions || typeof reactions !== "object") return "";
  let html = "";
  REACTION_EMOJIS.forEach(emoji => {
    const voters = reactions[emoji];
    if (!Array.isArray(voters) || voters.length === 0) return;
    const isMine = voters.includes(myUid);
    html += `<span class="reaction-chip${isMine ? " mine" : ""}" data-reaction-chip="${emoji}">
      <span>${emoji}</span>
      <span class="reaction-chip-count">${voters.length}</span>
    </span>`;
  });
  return html ? `<div class="msg-reactions">${html}</div>` : "";
}

function _updateReactionChips(row, docId, reactions) {
  if (!row) return;
  const myUid  = currentUser?.uid;
  const grp    = row.querySelector(".msg-bubble-group");
  if (!grp) return;
  // Remove existing chips container
  const old = grp.querySelector(".msg-reactions");
  if (old) old.remove();
  // Build new
  const html = _buildReactionChipsHTML(reactions, myUid);
  if (html) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    const newEl = tmp.firstElementChild;
    // Patch onclick to use correct docId
    newEl.querySelectorAll(".reaction-chip").forEach(chip => {
      const emoji = chip.dataset.reactionChip;
      chip.onclick = () => toggleReaction(docId, emoji, _currentChatId);
    });
    grp.appendChild(newEl);
  }
}

// ── Edit Message ──
let _editDocId = null;
let _editOrigText = "";

function ctxEdit() {
  hideMsgCtxMenu();
  if (!_ctxDocId || !_ctxData) return;
  if (_ctxData.uid !== currentUser?.uid) return;
  if (!_ctxData.text) return;
  _editDocId = _ctxDocId;
  _editOrigText = _ctxData.text;
  const input = document.getElementById("chatInput");
  if (!input) return;
  input.value = _editOrigText;
  input.focus();
  // Show edit mode bar
  _showEditBar(_editOrigText);
}
window.ctxEdit = ctxEdit;

function _showEditBar(originalText) {
  let bar = document.getElementById("editModeBar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "editModeBar";
    bar.style.cssText = "display:flex;align-items:center;gap:10px;padding:8px 14px;background:rgba(201,169,110,.12);border-top:1.5px solid rgba(201,169,110,.3);font-size:13px;color:var(--gold);font-weight:600;";
    bar.innerHTML = `<i class="fa-solid fa-pen" style="font-size:13px;"></i><span style="flex:1"> </span><button onclick="cancelEdit()" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:18px;padding:0 4px;line-height:1;">&times;</button>`;
    const inputBar = document.querySelector(".chat-input-bar");
    if (inputBar) inputBar.insertBefore(bar, inputBar.firstChild);
  }
  bar.style.display = "flex";
  // Change send button behavior
  const sendBtn = document.getElementById("chatSendBtn");
  if (sendBtn) { sendBtn.setAttribute("data-mode","edit"); }
}

function _hideEditBar() {
  const bar = document.getElementById("editModeBar");
  if (bar) bar.style.display = "none";
  _editDocId = null; _editOrigText = "";
  const sendBtn = document.getElementById("chatSendBtn");
  if (sendBtn) sendBtn.removeAttribute("data-mode");
  const input = document.getElementById("chatInput");
  if (input) { input.value = ""; input.focus(); }
  if (typeof window._updateSendVoiceBtns === "function") window._updateSendVoiceBtns();
}
window.cancelEdit = _hideEditBar;

async function _saveEdit() {
  if (!_editDocId || !currentUser) return;
  const input = document.getElementById("chatInput");
  const newText = input ? input.value.trim() : "";
  if (!newText) { toast("لا يمكن حفظ رسالة فارغة", "warn"); return; }
  if (newText === _editOrigText) { _hideEditBar(); return; }
  try {
    const colPath = chatColPath(_currentChatId);
    await updateDoc(doc(db, colPath, _editDocId), {
      text: newText,
      edited: true,
      editedAt: serverTimestamp()
    });
    _hideEditBar();
    toast("تم تعديل الرسالة", "success");
  } catch(e) {
    toast("فشل تعديل الرسالة", "error");
    console.error(e);
  }
}

// Close ctx menu on outside click/scroll/back
let _ctxJustOpened = false;
Object.defineProperty(window, '_ctxJustOpened', {
  get: () => _ctxJustOpened,
  set: v => { _ctxJustOpened = v; },
  configurable: true
});
document.addEventListener("click", (e) => {
  if (_ctxJustOpened) { _ctxJustOpened = false; return; }
  const menu = document.getElementById("msgCtxMenu");
  if (menu && !menu.contains(e.target)) hideMsgCtxMenu();
});
document.addEventListener("scroll", hideMsgCtxMenu, true);
window.addEventListener("popstate", hideMsgCtxMenu);

// ── Long-press on message rows ──
let _lpTimer = null; const LP_DELAY = 480;

function _attachLongPress(row, docId, data) {
  let _fired = false, _moved = false, _sx = 0, _sy = 0, _cx = 0, _cy = 0;
  const MOVE_THRESHOLD = 10;
  const start = (e) => {
    _fired = false; _moved = false;
    _sx = e.touches[0].clientX; _sy = e.touches[0].clientY;
    _cx = _sx; _cy = _sy; // حفظ الإحداثيات لاستخدامها لاحقاً
    _lpTimer = setTimeout(() => {
      if (_moved) return;
      _fired = true;
      navigator.vibrate?.(30);
      // تمرير إحداثيات محفوظة بدل event منتهٍ
      _showCtxAt(_cx, _cy, docId, data);
    }, LP_DELAY);
  };
  const onMove = (e) => {
    if (_moved) return;
    _cx = e.touches[0].clientX; _cy = e.touches[0].clientY;
    const dx = Math.abs(_cx - _sx);
    const dy = Math.abs(_cy - _sy);
    if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) {
      _moved = true;
      clearTimeout(_lpTimer); _lpTimer = null;
    }
  };
  const cancel = () => { clearTimeout(_lpTimer); _lpTimer = null; };
  row.addEventListener("touchstart",  start,  { passive: true });
  row.addEventListener("touchmove",   onMove, { passive: true });
  row.addEventListener("touchend",    cancel);
  row.addEventListener("touchcancel", cancel);
  row.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (!_moved) _showCtxAt(e.clientX || _cx, e.clientY || _cy, docId, data);
  });
}
window._attachLongPress = _attachLongPress;

// ── Swipe-to-Reply (Event Delegation — covers ALL messages past & future) ──
function _attachSwipeReply(row, docId, data) {
  const group = row.querySelector(".msg-bubble-group");
  if (!group) return;

  // Prevent duplicate icons on re-renders
  if (group.querySelector(".swipe-reply-icon")) return;

  // Append icon element (visual only — no listeners here)
  const icon = document.createElement("div");
  icon.className = "swipe-reply-icon";
  icon.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>`;
  group.appendChild(icon);

  // Store reply metadata on the row — read by the delegated handler
  row.dataset.swipeDocId = docId;
  try {
    row.dataset.swipeData = JSON.stringify({
      name:     data.name      || "",
      text:     data.text      || "",
      image:    data.image     || "",
      audio:    data.audio     ? true : false,
      pdf:      data.pdf       ? true : false,
      file:     data.file      ? true : false,
      fileName: data.fileName  || "",
    });
  } catch(e) { row.dataset.swipeData = "{}"; }
}
window._attachSwipeReply = _attachSwipeReply;

// ── Single delegated swipe handler — init once per container ──────────────
// Handles ALL .msg-row elements inside the container, including future ones.
function _initSwipeDelegation(container) {
  if (!container || container._swipeDelegated) return;
  container._swipeDelegated = true;

  const THRESHOLD = 65, TRIGGER = 52;

  // Per-gesture state
  let _row = null, _group = null, _icon = null, _isMe = false;
  let _startX = 0, _startY = 0, _dirLocked = false, _isHoriz = false;
  let _dragging = false, _triggered = false;

  function _resetSwipe() {
    _dragging = false;
    if (_group) {
      _group.style.transition = "transform .32s cubic-bezier(.34,1.4,.64,1)";
      _group.style.transform  = "";
    }
    if (_icon) {
      _icon.style.transition = "opacity .25s, transform .25s";
      _icon.style.opacity    = "0";
      _icon.style.transform  = "translateY(-50%) scale(0)";
    }
    const g = _group, ic = _icon;
    setTimeout(() => {
      if (g)  { g.style.transition  = ""; }
      if (ic) { ic.style.transition = ""; }
    }, 380);
    _row = _group = _icon = null;
    _dirLocked = _isHoriz = _dragging = _triggered = false;
  }

  function _applyDist(dist) {
    if (!_group) return;
    const prog = Math.min(dist / TRIGGER, 1);
    // WhatsApp: all messages slide RIGHT
    _group.style.transform = `translateX(${dist}px)`;
    if (_icon) {
      _icon.style.opacity   = prog;
      _icon.style.transform = `translateY(-50%) scale(${prog})`;
    }
  }

  container.addEventListener("touchstart", e => {
    const row = e.target.closest(".msg-row[data-swipe-doc-id]");
    if (!row) return;
    const group = row.querySelector(".msg-bubble-group");
    if (!group) return;
    _row      = row;
    _group    = group;
    _icon     = group.querySelector(".swipe-reply-icon");
    _isMe     = row.classList.contains("me");
    _startX   = e.touches[0].clientX;
    _startY   = e.touches[0].clientY;
    _dirLocked = false; _isHoriz = false; _dragging = false; _triggered = false;
    group.style.transition = "none";
    if (_icon) _icon.style.transition = "none";
  }, { passive: true });

  container.addEventListener("touchmove", e => {
    if (!_group) return;
    const rawDx = e.touches[0].clientX - _startX;
    const dy    = e.touches[0].clientY - _startY;
    // WhatsApp: always swipe RIGHT to reply (RTL: drag right = positive rawDx)
    const dx = rawDx;

    if (!_dirLocked) {
      if (Math.abs(rawDx) < 5 && Math.abs(dy) < 5) return;
      _dirLocked = true;
      _isHoriz   = Math.abs(rawDx) > Math.abs(dy) * 1.2;
    }
    if (!_isHoriz || dx < 5) return;

    _dragging = true;
    const dist = Math.min(dx, THRESHOLD);
    _applyDist(dist);

    if (!_triggered && dist >= TRIGGER) {
      _triggered = true;
      navigator.vibrate?.(25);
      try {
        const d = JSON.parse(_row.dataset.swipeData || "{}");
        setReply({ docId: _row.dataset.swipeDocId, ...d });
      } catch(err) {}
    }
  }, { passive: true });

  function _onEnd() {
    if (_dragging) _resetSwipe();
    else { _row = _group = _icon = null; }
  }
  container.addEventListener("touchend",    _onEnd, { passive: true });
  container.addEventListener("touchcancel", _onEnd, { passive: true });
}
window._initSwipeDelegation = _initSwipeDelegation;

// ── Cleanup hook for logout (called from core) ──
window._cleanupPollListeners = () => {
  Object.values(_pollListeners).forEach(u => { try{u();}catch(e){} });
  Object.keys(_pollListeners).forEach(k => delete _pollListeners[k]);
};

// Intercept chatSendBtn click for edit mode
(function() {
  const btn = document.getElementById("chatSendBtn");
  const input = document.getElementById("chatInput");
  if (!btn || !input) return;
  const _origClick = btn.onclick;
  btn.addEventListener("click", async function(e) {
    if (btn.getAttribute("data-mode") === "edit") {
      e.stopImmediatePropagation();
      await _saveEdit();
    }
  }, true); // capture phase — fires before other listeners
  input.addEventListener("keydown", function(e) {
    if (e.key === "Enter" && !e.shiftKey && _editDocId) {
      e.preventDefault(); e.stopImmediatePropagation();
      _saveEdit();
    }
    if (e.key === "Escape" && _editDocId) { cancelEdit(); }
  }, true);
})();
