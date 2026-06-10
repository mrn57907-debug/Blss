import { collection, doc, getDocs, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, where, deleteField, limit } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ══════════════════════════════════════════
   REPORT SYSTEM — نظام التبليغات
══════════════════════════════════════════ */
let _rptContext = null; // { type: "message"|"user", targetUid, targetName, msgId, msgText, chatId }
let _rptSelectedReason = null;
const RPT_COOLDOWN_MS = 30000; // 30s بين بلاغين
let _rptLastTime = 0;

function openReportModal(ctx) {
  if (!currentUser?.uid) { toast("يجب تسجيل الدخول أولاً", "error"); return; }
  if (ctx.targetUid === currentUser.uid) { toast("لا يمكنك التبليغ عن نفسك", "warn"); return; }
  _rptContext = ctx;
  _rptSelectedReason = null;
  // Reset UI
  document.querySelectorAll(".rpt-reason-btn").forEach(b => b.classList.remove("selected"));
  const otherWrap = document.getElementById("rptOtherWrap");
  const otherTxt  = document.getElementById("rptOtherText");
  const submitBtn = document.getElementById("rptSubmitBtn");
  if (otherWrap) otherWrap.style.display = "none";
  if (otherTxt)  otherTxt.value = "";
  if (submitBtn) submitBtn.disabled = true;
  // Target box
  const tbox = document.getElementById("rptTargetBox");
  if (tbox) {
    tbox.classList.add("show");
    if (ctx.type === "message") {
      tbox.innerHTML = `<div class="rpt-target-name"><i class="fa-solid fa-message" style="color:var(--muted);margin-left:6px;"></i>${esc(ctx.targetName)}</div>${ctx.msgText ? `<div class="rpt-target-msg">${esc(ctx.msgText)}</div>` : ""}`;
    } else {
      tbox.innerHTML = `<div class="rpt-target-name"><i class="fa-solid fa-user" style="color:var(--muted);margin-left:6px;"></i>${esc(ctx.targetName)}</div>`;
    }
  }
  const subEl = document.getElementById("rptSubtitle");
  if (subEl) subEl.textContent = ctx.type === "message" ? "تبليغ عن رسالة" : "تبليغ عن مستخدم";
  document.getElementById("reportModalBackdrop").classList.add("show");
  document.body.style.overflow = "hidden";
}
window.openReportModal = openReportModal;

function closeReportModal(e) {
  if (e && e.target !== document.getElementById("reportModalBackdrop")) return;
  document.getElementById("reportModalBackdrop").classList.remove("show");
  document.body.style.overflow = "";
  _rptContext = null;
  _rptSelectedReason = null;
}
window.closeReportModal = closeReportModal;

function selectReportReason(btn) {
  document.querySelectorAll(".rpt-reason-btn").forEach(b => b.classList.remove("selected"));
  btn.classList.add("selected");
  _rptSelectedReason = btn.dataset.reason;
  const otherWrap = document.getElementById("rptOtherWrap");
  if (otherWrap) otherWrap.style.display = _rptSelectedReason === "other" ? "block" : "none";
  const submitBtn = document.getElementById("rptSubmitBtn");
  if (submitBtn) submitBtn.disabled = false;
}
window.selectReportReason = selectReportReason;

async function submitReport() {
  if (!currentUser?.uid || !_rptContext || !_rptSelectedReason) return;
  // Anti-spam cooldown
  const now = Date.now();
  if (now - _rptLastTime < RPT_COOLDOWN_MS) {
    toast("يرجى الانتظار قبل إرسال بلاغ آخر", "warn"); return;
  }
  const submitBtn = document.getElementById("rptSubmitBtn");
  if (submitBtn) submitBtn.disabled = true;
  let reason = _rptSelectedReason;
  if (reason === "other") {
    const txt = (document.getElementById("rptOtherText")?.value || "").trim();
    if (!txt) { toast("يرجى كتابة سبب التبليغ", "warn"); if (submitBtn) submitBtn.disabled = false; return; }
    reason = txt;
  }
  // Check duplicate report on same message
  if (_rptContext.msgId) {
    try {
      const dupQ = query(
        collection(db, "reports"),
        where("reporterUid",  "==", currentUser.uid),
        where("msgId",        "==", _rptContext.msgId),
        limit(1)
      );
      const dupSnap = await getDocs(dupQ);
      if (!dupSnap.empty) {
        toast("لقد أرسلت بلاغاً على هذه الرسالة من قبل", "warn");
        if (submitBtn) submitBtn.disabled = false;
        return;
      }
    } catch(_) {}
  }
  try {
    const reportData = {
      reporterUid:    currentUser.uid,
      reporterName:   currentName || currentUser.email || "مجهول",
      targetUid:      _rptContext.targetUid,
      targetName:     _rptContext.targetName || "مجهول",
      msgId:          _rptContext.msgId    || null,
      msgText:        _rptContext.msgText  || null,
      chatId:         _rptContext.chatId   || _currentChatId || null,
      reason:         reason,
      type:           _rptContext.type || "message",
      status:         "open",
      createdAt:      serverTimestamp(),
    };
    await addDoc(collection(db, "reports"), reportData);
    _rptLastTime = Date.now();
    toast("تم إرسال البلاغ بنجاح", "success");
    document.getElementById("reportModalBackdrop").classList.remove("show");
    document.body.style.overflow = "";
    _rptContext = null; _rptSelectedReason = null;
  } catch(e) {
    toast("فشل إرسال البلاغ، حاول مرة أخرى", "error");
    if (submitBtn) submitBtn.disabled = false;
  }
}
window.submitReport = submitReport;

function ctxReport() {
  hideMsgCtxMenu();
  if (!_ctxData || !_ctxDocId) return;
  const targetUid  = _ctxData.uid || _ctxData.senderId || null;
  const targetName = _ctxData.name || _ctxData.senderName || "مستخدم";
  const msgText    = _ctxData.text || null;
  openReportModal({
    type:       "message",
    targetUid:  targetUid,
    targetName: targetName,
    msgId:      _ctxDocId,
    msgText:    msgText,
    chatId:     _currentChatId || null,
  });
}
window.ctxReport = ctxReport;

/* ── Owner: load & display reports ── */
let _ownerReportsAll  = [];
let _ownerReportsFilter = "all";

async function loadOwnerReports() {
  const listEl = document.getElementById("ownerReportsList");
  if (!listEl) return;
  listEl.innerHTML = `<div class="spinner" style="margin:24px auto;"></div>`;
  try {
    const q = query(collection(db, "reports"), orderBy("createdAt", "desc"), limit(100));
    const snap = await getDocs(q);
    _ownerReportsAll = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Count stats
    let open = 0, resolved = 0, rejected = 0;
    _ownerReportsAll.forEach(r => {
      if (r.status === "open" || r.status === "reviewing") open++;
      else if (r.status === "resolved") resolved++;
      else if (r.status === "rejected") rejected++;
    });
    const oEl = document.getElementById("rptStatOpen");
    const dEl = document.getElementById("rptStatDone");
    const rEl = document.getElementById("rptStatRej");
    if (oEl) oEl.textContent = open;
    if (dEl) dEl.textContent = resolved;
    if (rEl) rEl.textContent = rejected;
    const subEl = document.getElementById("rptOwnerSub");
    if (subEl) subEl.textContent = `${_ownerReportsAll.length} بلاغ · ${open} مفتوح`;
    _renderOwnerReports();
  } catch(e) {
    listEl.innerHTML = `<div class="empty-state">فشل تحميل البلاغات</div>`;
  }
}
window.loadOwnerReports = loadOwnerReports;

function filterOwnerReports(btn) {
  document.querySelectorAll(".rpt-admin-tab").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  _ownerReportsFilter = btn.dataset.filter;
  _renderOwnerReports();
}
window.filterOwnerReports = filterOwnerReports;

function _renderOwnerReports() {
  const listEl = document.getElementById("ownerReportsList");
  if (!listEl) return;
  let data = _ownerReportsAll;
  if (_ownerReportsFilter !== "all") {
    if (_ownerReportsFilter === "open") data = data.filter(r => r.status === "open" || r.status === "reviewing");
    else data = data.filter(r => r.status === _ownerReportsFilter);
  }
  if (!data.length) { listEl.innerHTML = `<div class="empty-state">لا توجد بلاغات</div>`; return; }
  listEl.innerHTML = data.map(r => {
    const statusLabel = { open: "مفتوح", reviewing: "قيد المراجعة", resolved: "معالج", rejected: "مرفوض" }[r.status] || r.status;
    let date = "—";
    try { const ts = r.createdAt?.toDate?.() || new Date(r.createdAt); date = ts.toLocaleDateString("ar-EG", { day:"numeric", month:"short", year:"numeric" }); } catch(_) {}
    const msgBox = r.msgText ? `<div class="rpt-rc-msg-box"><i class="fa-solid fa-quote-right" style="color:var(--muted);margin-left:6px;"></i>${esc(r.msgText)}</div>` : "";
    const hasMsgDelete = r.msgId && r.chatId;
    const delBtnHtml = hasMsgDelete
      ? `<button class="rpt-act-btn del-msg" onclick="ownerDeleteReportedMsg('${esc(r.id)}','${esc(r.chatId)}','${esc(r.msgId)}')"><i class="fa-solid fa-trash"></i> حذف الرسالة</button>`
      : "";
    return `
    <div class="rpt-report-card status-${r.status}" id="rptCard-${r.id}">
      <div class="rpt-rc-hdr">
        <span class="rpt-rc-badge ${r.status}">${statusLabel}</span>
        <span class="rpt-rc-reason">${esc(r.reason)}</span>
        <span class="rpt-rc-date">${date}</span>
      </div>
      <div class="rpt-rc-row">
        <div class="rpt-rc-person">
          <div class="rpt-rc-person-lbl">المبلغ</div>
          <div class="rpt-rc-person-name">${esc(r.reporterName || "—")}</div>
          <div class="rpt-rc-person-uid">${esc(r.reporterUid || "")}</div>
        </div>
        <div class="rpt-rc-person">
          <div class="rpt-rc-person-lbl">المبلغ عنه</div>
          <div class="rpt-rc-person-name">${esc(r.targetName || "—")}</div>
          <div class="rpt-rc-person-uid">${esc(r.targetUid || "")}</div>
        </div>
      </div>
      ${msgBox}
      <div class="rpt-rc-actions">
        <button class="rpt-act-btn resolve"  onclick="updateReportStatus('${r.id}','resolved')"><i class="fa-solid fa-check"></i> قبول</button>
        <button class="rpt-act-btn reject"   onclick="updateReportStatus('${r.id}','rejected')"><i class="fa-solid fa-xmark"></i> رفض</button>
        <button class="rpt-act-btn review"   onclick="updateReportStatus('${r.id}','reviewing')"><i class="fa-solid fa-eye"></i> مراجعة</button>
        ${delBtnHtml}
        <button class="rpt-act-btn profile"  onclick="openProfileViewModal('${esc(r.targetUid)}')"><i class="fa-solid fa-id-card"></i> البروفايل</button>
      </div>
    </div>`;
  }).join("");
}

async function updateReportStatus(reportId, status) {
  try {
    await updateDoc(doc(db, "reports", reportId), { status });
    const idx = _ownerReportsAll.findIndex(r => r.id === reportId);
    if (idx !== -1) _ownerReportsAll[idx].status = status;
    _renderOwnerReports();
    // refresh stats
    let open = 0, resolved = 0, rejected = 0;
    _ownerReportsAll.forEach(r => {
      if (r.status === "open" || r.status === "reviewing") open++;
      else if (r.status === "resolved") resolved++;
      else if (r.status === "rejected") rejected++;
    });
    const oEl = document.getElementById("rptStatOpen");
    const dEl = document.getElementById("rptStatDone");
    const rEl = document.getElementById("rptStatRej");
    if (oEl) oEl.textContent = open;
    if (dEl) dEl.textContent = resolved;
    if (rEl) rEl.textContent = rejected;
    toast("تم تحديث حالة البلاغ", "success");
  } catch(e) { toast("فشل تحديث الحالة", "error"); }
}
window.updateReportStatus = updateReportStatus;

async function ownerDeleteReportedMsg(reportId, chatId, msgId) {
  if (!chatId || !msgId) return;
  try {
    let msgRef;
    if (chatId === "public") {
      msgRef = doc(db, "messages", msgId);
    } else if (chatId.includes("_")) {
      msgRef = doc(db, "privateChats", chatId, "messages", msgId);
    } else {
      msgRef = doc(db, "rooms", chatId, "messages", msgId);
    }
    await updateDoc(msgRef, { deleted: true, text: "تم حذف هذه الرسالة", image: deleteField(), audio: deleteField(), pdf: deleteField(), fileUrl: deleteField() });
    await updateDoc(doc(db, "reports", reportId), { status: "resolved" });
    const idx = _ownerReportsAll.findIndex(r => r.id === reportId);
    if (idx !== -1) _ownerReportsAll[idx].status = "resolved";
    _renderOwnerReports();
    toast("تم حذف الرسالة وإغلاق البلاغ", "success");
  } catch(e) { toast("فشل حذف الرسالة", "error"); }
}
window.ownerDeleteReportedMsg = ownerDeleteReportedMsg;

/* ══════════════════════════════════════════
   ADMIN REPORTS — نظام التبليغات للأدمن
   صلاحيات الأدمن فقط — بدون أدوات المالك
══════════════════════════════════════════ */
let _adminReportsAll    = [];
let _adminReportsFilter = "all";

async function loadAdminReports() {
  if (!isAdmin()) return;
  const listEl = document.getElementById("adminReportsList");
  if (!listEl) return;
  listEl.innerHTML = `<div class="spinner" style="margin:24px auto;"></div>`;
  try {
    const q = query(collection(db, "reports"), orderBy("createdAt", "desc"), limit(100));
    const snap = await getDocs(q);
    _adminReportsAll = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    let open = 0, resolved = 0, rejected = 0;
    _adminReportsAll.forEach(r => {
      if (r.status === "open" || r.status === "reviewing") open++;
      else if (r.status === "resolved") resolved++;
      else if (r.status === "rejected") rejected++;
    });
    const oEl = document.getElementById("rptAdminStatOpen");
    const dEl = document.getElementById("rptAdminStatDone");
    const rEl = document.getElementById("rptAdminStatRej");
    if (oEl) oEl.textContent = open;
    if (dEl) dEl.textContent = resolved;
    if (rEl) rEl.textContent = rejected;
    const subEl = document.getElementById("rptAdminSub");
    if (subEl) subEl.textContent = `${_adminReportsAll.length} بلاغ · ${open} مفتوح`;
    _renderAdminReports();
  } catch(e) {
    listEl.innerHTML = `<div class="empty-state">فشل تحميل البلاغات</div>`;
  }
}
window.loadAdminReports = loadAdminReports;

function filterAdminReports(btn) {
  document.querySelectorAll("#page-admin .rpt-admin-tab").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  _adminReportsFilter = btn.dataset.filter;
  _renderAdminReports();
}
window.filterAdminReports = filterAdminReports;

function _renderAdminReports() {
  const listEl = document.getElementById("adminReportsList");
  if (!listEl) return;
  let data = _adminReportsAll;
  if (_adminReportsFilter !== "all") {
    if (_adminReportsFilter === "open") data = data.filter(r => r.status === "open" || r.status === "reviewing");
    else data = data.filter(r => r.status === _adminReportsFilter);
  }
  if (!data.length) { listEl.innerHTML = `<div class="empty-state">لا توجد بلاغات</div>`; return; }
  listEl.innerHTML = data.map(r => {
    const statusLabel = { open: "مفتوح", reviewing: "قيد المراجعة", resolved: "معالج", rejected: "مرفوض" }[r.status] || r.status;
    let date = "—";
    try { const ts = r.createdAt?.toDate?.() || new Date(r.createdAt); date = ts.toLocaleDateString("ar-EG", { day:"numeric", month:"short", year:"numeric" }); } catch(_) {}
    const msgBox = r.msgText ? `<div class="rpt-rc-msg-box"><i class="fa-solid fa-quote-right" style="color:var(--muted);margin-left:6px;"></i>${esc(r.msgText)}</div>` : "";
    // الأدمن يستطيع حذف الرسالة إذا كانت صلاحياته تسمح (isAdmin)
    const hasMsgDelete = r.msgId && r.chatId;
    const delBtnHtml = hasMsgDelete
      ? `<button class="rpt-act-btn del-msg" onclick="adminDeleteReportedMsg('${esc(r.id)}','${esc(r.chatId)}','${esc(r.msgId)}')"><i class="fa-solid fa-trash"></i> حذف الرسالة</button>`
      : "";
    return `
    <div class="rpt-report-card status-${r.status}" id="rptAdminCard-${r.id}">
      <div class="rpt-rc-hdr">
        <span class="rpt-rc-badge ${r.status}">${statusLabel}</span>
        <span class="rpt-rc-reason">${esc(r.reason)}</span>
        <span class="rpt-rc-date">${date}</span>
      </div>
      <div class="rpt-rc-row">
        <div class="rpt-rc-person">
          <div class="rpt-rc-person-lbl">المبلغ</div>
          <div class="rpt-rc-person-name">${esc(r.reporterName || "—")}</div>
          <div class="rpt-rc-person-uid">${esc(r.reporterUid || "")}</div>
        </div>
        <div class="rpt-rc-person">
          <div class="rpt-rc-person-lbl">المبلغ عنه</div>
          <div class="rpt-rc-person-name">${esc(r.targetName || "—")}</div>
          <div class="rpt-rc-person-uid">${esc(r.targetUid || "")}</div>
        </div>
      </div>
      ${msgBox}
      <div class="rpt-rc-actions">
        <button class="rpt-act-btn resolve"  onclick="adminUpdateReportStatus('${r.id}','resolved')"><i class="fa-solid fa-check"></i> قبول</button>
        <button class="rpt-act-btn reject"   onclick="adminUpdateReportStatus('${r.id}','rejected')"><i class="fa-solid fa-xmark"></i> رفض</button>
        <button class="rpt-act-btn review"   onclick="adminUpdateReportStatus('${r.id}','reviewing')"><i class="fa-solid fa-eye"></i> مراجعة</button>
        ${delBtnHtml}
        <button class="rpt-act-btn profile"  onclick="openProfileViewModal('${esc(r.targetUid)}')"><i class="fa-solid fa-id-card"></i> البروفايل</button>
      </div>
    </div>`;
  }).join("");
}

async function adminUpdateReportStatus(reportId, status) {
  if (!isAdmin()) return;
  try {
    await updateDoc(doc(db, "reports", reportId), { status });
    const idx = _adminReportsAll.findIndex(r => r.id === reportId);
    if (idx !== -1) _adminReportsAll[idx].status = status;
    _renderAdminReports();
    let open = 0, resolved = 0, rejected = 0;
    _adminReportsAll.forEach(r => {
      if (r.status === "open" || r.status === "reviewing") open++;
      else if (r.status === "resolved") resolved++;
      else if (r.status === "rejected") rejected++;
    });
    const oEl = document.getElementById("rptAdminStatOpen");
    const dEl = document.getElementById("rptAdminStatDone");
    const rEl = document.getElementById("rptAdminStatRej");
    if (oEl) oEl.textContent = open;
    if (dEl) dEl.textContent = resolved;
    if (rEl) rEl.textContent = rejected;
    toast("تم تحديث حالة البلاغ", "success");
  } catch(e) { toast("فشل تحديث الحالة", "error"); }
}
window.adminUpdateReportStatus = adminUpdateReportStatus;

async function adminDeleteReportedMsg(reportId, chatId, msgId) {
  if (!isAdmin() || !chatId || !msgId) return;
  try {
    let msgRef;
    if (chatId === "public") {
      msgRef = doc(db, "messages", msgId);
    } else if (chatId.includes("_")) {
      msgRef = doc(db, "privateChats", chatId, "messages", msgId);
    } else {
      msgRef = doc(db, "rooms", chatId, "messages", msgId);
    }
    await updateDoc(msgRef, { deleted: true, text: "تم حذف هذه الرسالة", image: deleteField(), audio: deleteField(), pdf: deleteField(), fileUrl: deleteField() });
    await updateDoc(doc(db, "reports", reportId), { status: "resolved" });
    const idx = _adminReportsAll.findIndex(r => r.id === reportId);
    if (idx !== -1) _adminReportsAll[idx].status = "resolved";
    _renderAdminReports();
    toast("تم حذف الرسالة وإغلاق البلاغ", "success");
  } catch(e) { toast("فشل حذف الرسالة", "error"); }
}
window.adminDeleteReportedMsg = adminDeleteReportedMsg;

