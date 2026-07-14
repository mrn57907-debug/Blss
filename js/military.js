/**
 * ══════════════════════════════════════════
 *   MILITARY SERVICE MODULE — الخدمة العسكرية
 *   مكتبة مواد (فيديو/PDF/صوت) — كل التحكم للمالك، المشاهدة والتحميل للجميع
 *
 *   ▸ ملف مستقل بالكامل — لا يعدّل أي منطق في أي نظام آخر
 *   ▸ نفس معمارية grades.js تمامًا (استيراد ديناميكي لـ Firestore،
 *     window.MilitaryModule.open/close، جذر ثابت في index.html)
 *   ▸ يعيد استخدام: window.db, window.currentUser, window.isOwner,
 *     window.toast، وبيانات Cloudinary العامة المستخدمة أصلاً في المشروع
 * ══════════════════════════════════════════
 */

(function () {
  "use strict";

  if (window.__militaryModuleLoaded) return;
  window.__militaryModuleLoaded = true;

  /* ─────────────────────────────────────────
     Firebase — نفس نمط الاستيراد الديناميكي المستخدم في grades.js
  ───────────────────────────────────────── */
  const _FB = "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
  async function _getFS() {
    const db = window.db;
    if (!db) throw new Error("Firebase غير متاح");
    return { db, ...(await import(_FB)) };
  }

  /* ─────────────────────────────────────────
     Cloudinary — نفس بيانات الحساب المستخدمة أصلاً في المشروع (chat uploads)
     ملاحظة: بدون قيد منع الفيديو الموجود في دالة الشات uploadToCloudinary،
     لأن هذه المكتبة مخصصة لرفع الفيديوهات التعليمية عمدًا
  ───────────────────────────────────────── */
  const CLOUD_NAME     = "dnbvvfita";
  const UPLOAD_PRESET  = "university_upload";

  function _detectType(file) {
    const t = file.type || "";
    const n = (file.name || "").toLowerCase();
    if (t.startsWith("video/")) return "video";
    if (t === "application/pdf" || n.endsWith(".pdf")) return "pdf";
    if (t.startsWith("audio/")) return "audio";
    return "other";
  }
  function _typeIcon(type) {
    return { video: "fa-solid fa-video", pdf: "fa-solid fa-file-pdf", audio: "fa-solid fa-headphones" }[type] || "fa-solid fa-file-lines";
  }
  function _typeLabel(type) {
    return { video: "فيديو", pdf: "PDF", audio: "صوتي" }[type] || "ملف";
  }
  function _fmtSize(bytes) {
    if (!bytes) return "";
    const kb = bytes / 1024;
    if (kb < 1024) return kb.toFixed(0) + " KB";
    return (kb / 1024).toFixed(1) + " MB";
  }
  function _esc(s) {
    return (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  // رابط تحميل فعلي (يجبر المتصفح على التحميل بدل الفتح) عبر علم fl_attachment في Cloudinary
  // (خاصية download العادية في HTML لا تعمل بشكل موثوق مع روابط من نطاق مختلف)
  function _downloadUrl(url) {
    return url.includes("/upload/") ? url.replace("/upload/", "/upload/fl_attachment/") : url;
  }

  function _uploadWithProgress(file, onProgress) {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", UPLOAD_PRESET);
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener("progress", (e) => {
        if (!e.lengthComputable) return;
        onProgress(Math.round((e.loaded / e.total) * 100));
      });
      xhr.addEventListener("load", () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (!data.secure_url) {
            reject(new Error(data?.error?.message || "فشل الرفع"));
            return;
          }
          resolve(data); // نُعيد الاستجابة كاملة (تحتوي public_id, resource_type, secure_url)
        } catch (e) { reject(e); }
      });
      xhr.addEventListener("error", () => reject(new Error("خطأ في الشبكة")));
      xhr.addEventListener("abort", () => reject(new Error("تم الإلغاء")));
      xhr.open("POST", `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`);
      xhr.send(formData);
    });
  }

  /* ─────────────────────────────────────────
     الحالة
  ───────────────────────────────────────── */
  let _unsub     = null;
  let _materials = [];
  let _curFilter = "all";   // all | video | pdf | audio | other
  let _curSearch = "";

  function _root() { return document.getElementById("military-app-root"); }
  function _isOwnerUser() { return !!(window.isOwner && window.isOwner()); }

  /* ─────────────────────────────────────────
     الترتيب: المثبَّت أولًا (الأحدث تثبيتًا أعلى)، ثم حسب sortOrder تنازليًا
     (sortOrder الافتراضي = وقت الإنشاء بالمللي ثانية، فتظهر الأحدث أولًا تلقائيًا،
     ويستخدمه المالك أيضًا لإعادة الترتيب اليدوي عبر التبديل بين عنصرين متجاورين)
  ───────────────────────────────────────── */
  function _sortMaterials(list) {
    return [...list].sort((a, b) => {
      const pa = a.pinnedAt ? 1 : 0, pb = b.pinnedAt ? 1 : 0;
      if (pa !== pb) return pb - pa;
      if (pa && pb) {
        const ta = a.pinnedAt?.toMillis?.() || 0, tb = b.pinnedAt?.toMillis?.() || 0;
        if (ta !== tb) return tb - ta;
      }
      return (b.sortOrder || 0) - (a.sortOrder || 0);
    });
  }

  /* ─────────────────────────────────────────
     الاستماع الفوري لقائمة المواد (Firestore)
  ───────────────────────────────────────── */
  async function _startListener() {
    if (_unsub) return;
    try {
      const { db, collection, onSnapshot } = await _getFS();
      _unsub = onSnapshot(collection(db, "militaryMaterials"), snap => {
        _materials = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        _renderList();
      }, () => {
        const body = document.getElementById("milBody");
        if (body) body.innerHTML = `<div class="mil-empty-state"><div class="mil-empty-title">تعذّر تحميل المواد</div></div>`;
      });
    } catch (e) {
      const body = document.getElementById("milBody");
      if (body) body.innerHTML = `<div class="mil-empty-state"><div class="mil-empty-title">تعذّر تحميل المواد</div></div>`;
    }
  }

  /* ─────────────────────────────────────────
     بناء الواجهة (Bottom Sheet — نفس أسلوب grades.js البصري)
  ───────────────────────────────────────── */
  function _buildShell() {
    const root = _root();
    if (!root) return;
    const isOwner = _isOwnerUser();
    root.innerHTML = `
      <div class="mil-overlay" onclick="window.MilitaryModule.close()"></div>
      <div class="mil-sheet">
        <div class="mil-sheet-header">
          <button class="mil-back-btn" onclick="window.MilitaryModule.close()"><i class="fa-solid fa-arrow-right"></i> رجوع</button>
          <div class="mil-sheet-title"><i class="fa-solid fa-shield-halved"></i> الخدمة العسكرية</div>
          ${isOwner ? `
          <button class="mil-add-btn" id="milAddBtn" onclick="window.MilitaryModule._openUploadForm()">
            <i class="fa-solid fa-plus"></i>
          </button>` : ""}
        </div>
        <div class="mil-sheet-body-wrap">
          <div class="mil-toolbar">
            <div class="mil-search-box">
              <i class="fa-solid fa-magnifying-glass"></i>
              <input type="text" id="milSearchInp" placeholder="ابحث في المواد..." oninput="window.MilitaryModule._onSearch(this.value)">
            </div>
            <div class="mil-chips" id="milChips">
              <button class="mil-chip active" data-f="all" onclick="window.MilitaryModule._onFilter(this,'all')">الكل</button>
              <button class="mil-chip" data-f="video" onclick="window.MilitaryModule._onFilter(this,'video')"><i class="fa-solid fa-video"></i> فيديو</button>
              <button class="mil-chip" data-f="pdf" onclick="window.MilitaryModule._onFilter(this,'pdf')"><i class="fa-solid fa-file-pdf"></i> PDF</button>
              <button class="mil-chip" data-f="audio" onclick="window.MilitaryModule._onFilter(this,'audio')"><i class="fa-solid fa-headphones"></i> صوتي</button>
            </div>
          </div>
          <div class="mil-sheet-body" id="milBody">
            <div class="mil-loading-state">
              <div class="mil-spinner"></div>
              <span class="mil-loading-text">جارِ التحميل...</span>
            </div>
          </div>
        </div>
      </div>`;
  }

  window.MilitaryModule._onSearch = function (val) {
    _curSearch = (val || "").trim().toLowerCase();
    _renderList();
  };
  window.MilitaryModule._onFilter = function (btn, f) {
    _curFilter = f;
    document.querySelectorAll("#milChips .mil-chip").forEach(c => c.classList.toggle("active", c === btn));
    _renderList();
  };

  /* ─────────────────────────────────────────
     عرض القائمة
     ▸ المستخدم العادي: فتح/تحميل/بحث/تصفح فقط
     ▸ المالك فقط: رفع/تعديل/حذف/تثبيت/إعادة ترتيب
     ▸ الوسائط لا تُشغَّل إلا عند الضغط عليها (زر "تشغيل"/"عرض PDF")
  ───────────────────────────────────────── */
  function _renderList() {
    const body = document.getElementById("milBody");
    if (!body) return;
    const uploadCardOpen = document.getElementById("milUploadCard");
    const uploadHTML = uploadCardOpen ? uploadCardOpen.outerHTML : "";

    const sorted = _sortMaterials(_materials);
    let items = sorted;
    if (_curFilter !== "all") items = items.filter(m => m.type === _curFilter);
    if (_curSearch) items = items.filter(m =>
      (m.title || m.fileName || "").toLowerCase().includes(_curSearch) ||
      (m.description || "").toLowerCase().includes(_curSearch)
    );

    if (!items.length) {
      body.innerHTML = uploadHTML + `
        <div class="mil-empty-state">
          <div class="mil-empty-icon"><i class="fa-solid fa-shield-halved"></i></div>
          <div class="mil-empty-title">${_materials.length ? "لا توجد نتائج مطابقة" : "لا توجد مواد بعد"}</div>
          <div class="mil-empty-sub">${!_materials.length && _isOwnerUser() ? "اضغط زر + لإضافة أول مادة" : ""}</div>
        </div>`;
      return;
    }

    const isOwner = _isOwnerUser();
    // إعادة الترتيب اليدوي مسموحة فقط في العرض الكامل بدون فلترة/بحث (لتفادي التباس التجاور)
    const canReorder = isOwner && _curFilter === "all" && !_curSearch;

    body.innerHTML = uploadHTML + items.map((m, idx) => `
      <div class="mil-card${m.pinnedAt ? " pinned" : ""}" id="mil-card-${m.id}">
        ${m.pinnedAt ? `<div class="mil-pin-badge"><i class="fa-solid fa-thumbtack"></i> مثبَّتة</div>` : ""}
        <div class="mil-card-row">
          <div class="mil-card-icon"><i class="${_typeIcon(m.type)}"></i></div>
          <div class="mil-card-info">
            <div class="mil-card-title">${_esc(m.title || m.fileName || "مادة")}</div>
            <div class="mil-card-meta">${_typeLabel(m.type)}${m.size ? " · " + _fmtSize(m.size) : ""}</div>
            ${m.description ? `<div class="mil-card-desc">${_esc(m.description)}</div>` : ""}
          </div>
        </div>

        <div class="mil-card-player" id="mil-player-${m.id}">
          <button class="mil-play-btn" onclick="window.MilitaryModule._openPlayer('${m.id}')">
            <i class="fa-solid fa-play"></i> ${m.type === "pdf" ? "فتح المستند" : "تشغيل"}
          </button>
        </div>

        <div class="mil-card-actions">
          <a class="mil-icon-btn" href="${_downloadUrl(m.url)}" title="تحميل"><i class="fa-solid fa-download"></i></a>
          ${isOwner ? `
            <button class="mil-icon-btn" onclick="window.MilitaryModule._togglePin('${m.id}')" title="${m.pinnedAt ? "إلغاء التثبيت" : "تثبيت"}"><i class="fa-solid fa-thumbtack"></i></button>
            <button class="mil-icon-btn" onclick="window.MilitaryModule._openEditForm('${m.id}')" title="تعديل"><i class="fa-solid fa-pen"></i></button>
            ${canReorder ? `
            <button class="mil-icon-btn" onclick="window.MilitaryModule._moveItem('${m.id}','up')" title="تحريك لأعلى" ${idx === 0 ? "disabled" : ""}><i class="fa-solid fa-arrow-up"></i></button>
            <button class="mil-icon-btn" onclick="window.MilitaryModule._moveItem('${m.id}','down')" title="تحريك لأسفل" ${idx === items.length - 1 ? "disabled" : ""}><i class="fa-solid fa-arrow-down"></i></button>
            ` : ""}
            <button class="mil-icon-btn mil-danger" onclick="window.MilitaryModule._delete('${m.id}')" title="حذف"><i class="fa-solid fa-trash"></i></button>
          ` : ""}
        </div>
      </div>
    `).join("");
  }

  /* ─────────────────────────────────────────
     تشغيل/عرض المادة داخل الموقع فقط عند الضغط (وليس تلقائيًا للجميع)
  ───────────────────────────────────────── */
  window.MilitaryModule._openPlayer = function (id) {
    const m = _materials.find(x => x.id === id);
    const holder = document.getElementById(`mil-player-${id}`);
    if (!m || !holder) return;
    if (m.type === "video") {
      holder.innerHTML = `<video class="mil-inline-media" controls autoplay src="${m.url}"></video>`;
    } else if (m.type === "audio") {
      holder.innerHTML = `<audio class="mil-inline-audio" controls autoplay src="${m.url}"></audio>`;
    } else if (m.type === "pdf") {
      holder.innerHTML = `<iframe class="mil-inline-pdf" src="${m.url}"></iframe>`;
    } else {
      window.open(m.url, "_blank", "noopener");
    }
  };

  /* ─────────────────────────────────────────
     نموذج الرفع (المالك فقط)
  ───────────────────────────────────────── */
  window.MilitaryModule = window.MilitaryModule || {};

  window.MilitaryModule._openUploadForm = function () {
    if (!_isOwnerUser()) return;
    if (document.getElementById("milUploadCard")) return;
    const body = document.getElementById("milBody");
    if (!body) return;
    body.insertAdjacentHTML("afterbegin", `
      <div class="mil-upload-card" id="milUploadCard">
        <div class="mil-upload-title"><i class="fa-solid fa-cloud-arrow-up"></i> إضافة مادة جديدة</div>
        <input type="text" id="milTitleInp" class="mil-input" placeholder="عنوان المادة (اختياري)">
        <textarea id="milDescInp" class="mil-input mil-textarea" placeholder="وصف مختصر (اختياري)" rows="2"></textarea>
        <label class="mil-file-label">
          <i class="fa-solid fa-paperclip"></i>
          <span id="milFileLabelText">اختر ملفًا (فيديو / PDF / صوت / أي ملف)</span>
          <input type="file" id="milFileInp" class="mil-file-inp-hidden">
        </label>
        <div class="mil-progress" id="milProgress" style="display:none">
          <div class="mil-progress-bar" id="milProgressBar"></div>
        </div>
        <div class="mil-upload-actions">
          <button class="mil-btn-primary" id="milSubmitBtn" onclick="window.MilitaryModule._submitUpload()">رفع</button>
          <button class="mil-btn-cancel" onclick="document.getElementById('milUploadCard').remove()">إلغاء</button>
        </div>
      </div>`);
    const fileInp = document.getElementById("milFileInp");
    const labelText = document.getElementById("milFileLabelText");
    if (fileInp && labelText) {
      fileInp.addEventListener("change", () => {
        labelText.textContent = fileInp.files[0] ? fileInp.files[0].name : "اختر ملفًا (فيديو / PDF / صوت / أي ملف)";
      });
    }
  };

  window.MilitaryModule._submitUpload = async function () {
    if (!_isOwnerUser()) return;
    const fileInp   = document.getElementById("milFileInp");
    const titleInp  = document.getElementById("milTitleInp");
    const descInp   = document.getElementById("milDescInp");
    const submitBtn = document.getElementById("milSubmitBtn");
    const file = fileInp && fileInp.files[0];
    if (!file) { window.toast?.("اختر ملفًا أولاً", "error"); return; }

    const progWrap = document.getElementById("milProgress");
    const progBar  = document.getElementById("milProgressBar");
    if (progWrap) progWrap.style.display = "block";
    if (submitBtn) submitBtn.disabled = true;

    try {
      const cloudData = await _uploadWithProgress(file, pct => { if (progBar) progBar.style.width = pct + "%"; });
      const { db, collection, addDoc, serverTimestamp } = await _getFS();
      await addDoc(collection(db, "militaryMaterials"), {
        title:        (titleInp && titleInp.value.trim()) || file.name,
        description:  (descInp && descInp.value.trim()) || "",
        type:         _detectType(file),
        url:          cloudData.secure_url,
        fileName:     file.name,
        mimeType:     file.type || "",
        size:         file.size || 0,
        sortOrder:    Date.now(),
        pinnedAt:     null,
        // نُخزّن هذين الحقلين الآن (لا يُستخدَمان بعد) تجهيزًا لأي حذف فعلي من Cloudinary
        // مستقبلًا عبر Cloud Function — لأن حذف الملف الفعلي يتطلب API secret لا يجوز
        // وضعه في كود العميل (انظر ملاحظة الأمان في التقرير)
        cloudPublicId:     cloudData.public_id || "",
        cloudResourceType: cloudData.resource_type || "",
        createdAt:    serverTimestamp(),
        createdBy:    window.currentUser?.uid || ""
      });
      window.toast?.("تمت الإضافة بنجاح ✓");
      document.getElementById("milUploadCard")?.remove();
    } catch (e) {
      window.toast?.("تعذر رفع الملف. قد يكون السبب حدود حساب Cloudinary أو إعدادات الحساب أو نوع الملف.", "error");
      if (submitBtn) submitBtn.disabled = false;
      if (progWrap) progWrap.style.display = "none";
    }
  };

  /* ─────────────────────────────────────────
     تعديل الاسم/الوصف (المالك فقط)
  ───────────────────────────────────────── */
  window.MilitaryModule._openEditForm = function (id) {
    if (!_isOwnerUser()) return;
    const m = _materials.find(x => x.id === id);
    const card = document.getElementById(`mil-card-${id}`);
    if (!m || !card || document.getElementById(`mil-edit-${id}`)) return;
    card.insertAdjacentHTML("beforeend", `
      <div class="mil-upload-card mil-edit-card" id="mil-edit-${id}">
        <div class="mil-upload-title"><i class="fa-solid fa-pen"></i> تعديل المادة</div>
        <input type="text" id="mil-edit-title-${id}" class="mil-input" placeholder="عنوان المادة" value="${_esc(m.title || "")}">
        <textarea id="mil-edit-desc-${id}" class="mil-input mil-textarea" placeholder="وصف مختصر" rows="2">${_esc(m.description || "")}</textarea>
        <div class="mil-upload-actions">
          <button class="mil-btn-primary" onclick="window.MilitaryModule._saveEdit('${id}')">حفظ</button>
          <button class="mil-btn-cancel" onclick="document.getElementById('mil-edit-${id}').remove()">إلغاء</button>
        </div>
      </div>`);
  };

  window.MilitaryModule._saveEdit = async function (id) {
    if (!_isOwnerUser()) return;
    const titleInp = document.getElementById(`mil-edit-title-${id}`);
    const descInp  = document.getElementById(`mil-edit-desc-${id}`);
    const newTitle = (titleInp && titleInp.value.trim()) || "";
    if (!newTitle) { window.toast?.("العنوان مطلوب", "error"); return; }
    try {
      const { db, doc, updateDoc } = await _getFS();
      await updateDoc(doc(db, "militaryMaterials", id), {
        title: newTitle,
        description: (descInp && descInp.value.trim()) || ""
      });
      window.toast?.("تم الحفظ ✓");
      document.getElementById(`mil-edit-${id}`)?.remove();
    } catch (e) {
      window.toast?.("فشل الحفظ", "error");
    }
  };

  /* ─────────────────────────────────────────
     تثبيت (المالك فقط)
  ───────────────────────────────────────── */
  window.MilitaryModule._togglePin = async function (id) {
    if (!_isOwnerUser()) return;
    const m = _materials.find(x => x.id === id);
    if (!m) return;
    try {
      const { db, doc, updateDoc, serverTimestamp, deleteField } = await _getFS();
      await updateDoc(doc(db, "militaryMaterials", id), {
        pinnedAt: m.pinnedAt ? deleteField() : serverTimestamp()
      });
      window.toast?.(m.pinnedAt ? "تم إلغاء التثبيت" : "تم التثبيت");
    } catch (e) {
      window.toast?.("فشل التنفيذ", "error");
    }
  };

  /* ─────────────────────────────────────────
     إعادة الترتيب اليدوي (المالك فقط) — تبديل sortOrder مع العنصر المجاور
  ───────────────────────────────────────── */
  window.MilitaryModule._moveItem = async function (id, dir) {
    if (!_isOwnerUser()) return;
    const sorted = _sortMaterials(_materials);
    const i = sorted.findIndex(x => x.id === id);
    const j = dir === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= sorted.length) return;
    const a = sorted[i], b = sorted[j];
    try {
      const { db, doc, updateDoc } = await _getFS();
      const aOrder = a.sortOrder || 0, bOrder = b.sortOrder || 0;
      await Promise.all([
        updateDoc(doc(db, "militaryMaterials", a.id), { sortOrder: bOrder }),
        updateDoc(doc(db, "militaryMaterials", b.id), { sortOrder: aOrder })
      ]);
    } catch (e) {
      window.toast?.("فشل تغيير الترتيب", "error");
    }
  };

  /* ─────────────────────────────────────────
     حذف (المالك فقط)
  ───────────────────────────────────────── */
  window.MilitaryModule._delete = async function (id) {
    if (!_isOwnerUser()) return;
    if (!window.confirm("حذف هذه المادة من القائمة نهائيًا؟\n(ملاحظة: الملف نفسه يبقى محفوظًا على Cloudinary حاليًا، ولا يُحذف تلقائيًا)")) return;
    try {
      const { db, doc, deleteDoc } = await _getFS();
      await deleteDoc(doc(db, "militaryMaterials", id));
      window.toast?.("تم الحذف من القائمة");
    } catch (e) {
      window.toast?.("فشل الحذف", "error");
    }
  };

  /* ─────────────────────────────────────────
     فتح/إغلاق — نفس نمط GradesModule.open/close تمامًا
     (يمنحها دعم زر الرجوع تلقائيًا عبر _MODAL_REGISTRY في back-nav.js)
  ───────────────────────────────────────── */
  window.MilitaryModule.open = function () {
    const root = _root();
    if (!root) return;
    root.classList.add("military-open");
    root.style.display = "flex";
    _buildShell();
    _startListener();
  };

  window.MilitaryModule.close = function () {
    const root = _root();
    if (!root) return;
    root.classList.remove("military-open");
    root.style.display = "none";
    root.innerHTML = "";
    if (_unsub) { _unsub(); _unsub = null; }
  };

})();
