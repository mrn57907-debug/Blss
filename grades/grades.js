/**
 * ══════════════════════════════════════════
 *   GRADES MODULE — درجاتي
 *   المرحلة 2: ربط Firebase
 * ══════════════════════════════════════════
 *
 *  هيكل Firestore:
 *  grades/{uid}/records/{yearKey_termKey}
 *
 *  مثال:
 *  grades/ABC123/records/فرقة1_ترم1
 */

(function () {
  "use strict";

  if (window.__gradesModuleLoaded) return;
  window.__gradesModuleLoaded = true;

  /* ─────────────────────────────────────────
     الثوابت
  ───────────────────────────────────────── */
  const SPECIALIZATIONS = [
    "علوم إدارية",
    "نظم معلومات الأعمال",
    "لغات وترجمة فورية",
    "محاسبة",
    "تجارة",
  ];

  const YEARS = [
    "الفرقة الأولى",
    "الفرقة الثانية",
    "الفرقة الثالثة",
    "الفرقة الرابعة",
  ];

  const TERMS = ["الترم الأول", "الترم الثاني", "سمر كورس"];

  const GRADES_LIST = [
    "A+", "A", "B+", "B", "C+", "C", "C-",
    "D+", "D", "D-", "F", "غ", "FX",
  ];

  /* ─────────────────────────────────────────
     الحالة الداخلية
  ───────────────────────────────────────── */
  let _state = {
    step: "form",
    fullName: "",
    specialization: "",
    year: "",
    term: "",
    subjectCount: 0,
    subjects: [],
    isSaving:   false,
    isLoading:  false,
  };

  /* ─────────────────────────────────────────
     Firebase helpers
     نستورد من CDN نفس النسخة الموجودة في index.html
  ───────────────────────────────────────── */
  const _FB_VER = "10.12.0";
  const _FB_BASE = `https://www.gstatic.com/firebasejs/${_FB_VER}/firebase-firestore.js`;

  async function _getFS() {
    // نستخدم window.db الذي عرّضه index.html
    const db = window.db;
    if (!db) throw new Error("Firebase غير متاح");
    const { doc, setDoc, getDoc } = await import(_FB_BASE);
    return { db, doc, setDoc, getDoc };
  }

  /* مفتاح الوثيقة: يفصل كل فرقة+ترم بشكل مستقل */
  function _recordKey(year, term) {
    return (year + "__" + term)
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_\u0600-\u06FF]/g, "");
  }

  /* ─────────────────────────────────────────
     حفظ البيانات
  ───────────────────────────────────────── */
  async function _saveToFirebase() {
    const user = window.currentUser;
    if (!user || !user.uid) {
      _toast("يجب تسجيل الدخول أولاً", "warn");
      return;
    }

    if (_state.isSaving) return;
    _state.isSaving = true;
    _setSaveBtnState(true);

    try {
      const { db, doc, setDoc } = await _getFS();

      const key = _recordKey(_state.year, _state.term);
      const path = doc(db, "grades", user.uid, "records", key);

      const payload = {
        fullName:       _state.fullName,
        specialization: _state.specialization,
        year:           _state.year,
        term:           _state.term,
        subjectCount:   _state.subjectCount,
        subjects:       _state.subjects.map(s => ({
          name:  s.name  || "",
          grade: s.grade || "",
        })),
        updatedAt: Date.now(),
        uid:       user.uid,
      };

      await setDoc(path, payload, { merge: false });

      _toast("تم الحفظ بنجاح ✓", "success");

    } catch (e) {
      console.error("[Grades] خطأ في الحفظ:", e);
      _toast("فشل الحفظ — حاول مرة أخرى", "error");
    } finally {
      _state.isSaving = false;
      _setSaveBtnState(false);
    }
  }

  /* ─────────────────────────────────────────
     استرجاع البيانات
  ───────────────────────────────────────── */
  async function _loadFromFirebase(year, term) {
    const user = window.currentUser;
    if (!user || !user.uid) return null;

    try {
      const { db, doc, getDoc } = await _getFS();
      const key  = _recordKey(year, term);
      const path = doc(db, "grades", user.uid, "records", key);
      const snap = await getDoc(path);
      if (snap.exists()) return snap.data();
    } catch (e) {
      console.error("[Grades] خطأ في الاسترجاع:", e);
    }
    return null;
  }

  /* استرجاع أحدث سجل محفوظ (أي فرقة/ترم) */
  async function _loadLatest() {
    const user = window.currentUser;
    if (!user || !user.uid) return null;

    try {
      const { db } = await _getFS();
      const { collection, query, orderBy, limit, getDocs } =
        await import(_FB_BASE);

      const colRef = collection(db, "grades", user.uid, "records");
      const q = query(colRef, orderBy("updatedAt", "desc"), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) return snap.docs[0].data();
    } catch (e) {
      console.error("[Grades] خطأ في تحميل أحدث سجل:", e);
    }
    return null;
  }

  /* ─────────────────────────────────────────
     تطبيق البيانات المسترجعة على الحالة
  ───────────────────────────────────────── */
  function _applyRecord(data) {
    if (!data) return;
    _state.fullName       = data.fullName       || "";
    _state.specialization = data.specialization || "";
    _state.year           = data.year           || "";
    _state.term           = data.term           || "";
    _state.subjectCount   = data.subjectCount   || 0;
    _state.subjects       = Array.isArray(data.subjects)
      ? data.subjects.map(s => ({ name: s.name || "", grade: s.grade || "" }))
      : [];
  }

  /* ─────────────────────────────────────────
     مساعدات UI
  ───────────────────────────────────────── */
  function _toast(msg, type) {
    if (typeof window.toast === "function") window.toast(msg, type);
  }

  function _setSaveBtnState(loading) {
    const btn = document.getElementById("gr-save-btn");
    if (!btn) return;
    if (loading) {
      btn.disabled = true;
      btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جارٍ الحفظ...`;
    } else {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> حفظ البيانات`;
    }
  }

  function _showFormLoading(root) {
    const body = root.querySelector(".grades-sheet-body");
    if (!body) return;
    body.innerHTML = `
      <div class="grades-loading-state">
        <div class="grades-spinner"></div>
        <div class="grades-loading-text">جارٍ تحميل بياناتك...</div>
      </div>
    `;
  }

  /* ─────────────────────────────────────────
     الوحدة الرئيسية
  ───────────────────────────────────────── */
  const GradesModule = {
    version: "2.0.0",

    open: async function () {
      const root = document.getElementById("grades-app-root");
      if (!root) return;

      const user = window.currentUser;
      if (!user || !user.uid) {
        _toast("يجب تسجيل الدخول أولاً", "warn");
        return;
      }

      // إعادة تهيئة الحالة
      _state = {
        step: "form",
        fullName: "", specialization: "", year: "", term: "",
        subjectCount: 0, subjects: [], isSaving: false, isLoading: true,
      };

      root.classList.add("grades-open");
      root.style.display = "flex";

      // رندر الهيكل أولاً مع مؤشر التحميل
      GradesModule._renderForm(root);
      _showFormLoading(root);

      // استرجاع آخر سجل محفوظ
      try {
        const data = await _loadLatest();
        if (data) {
          _applyRecord(data);
          _toast("تم تحميل بياناتك المحفوظة", "success");
        }
      } catch (e) {
        // لا يوجد سجل سابق — طبيعي
      }

      _state.isLoading = false;
      GradesModule._renderForm(root);
    },

    close: function () {
      const root = document.getElementById("grades-app-root");
      if (!root) return;
      root.classList.remove("grades-open");
      root.style.display = "none";
      root.innerHTML = "";
    },

    /* ── رندر نموذج البيانات الأساسية ── */
    _renderForm: function (root) {
      root.innerHTML = `
        <div class="grades-overlay" onclick="window.GradesModule.close()"></div>
        <div class="grades-sheet">

          <div class="grades-sheet-header">
            <button class="grades-back-btn" onclick="window.GradesModule.close()">
              <i class="fa-solid fa-arrow-right"></i> رجوع
            </button>
            <div class="grades-sheet-title">
              <i class="fa-solid fa-graduation-cap"></i> درجاتي
            </div>
          </div>

          <div class="grades-sheet-body">

            <div class="grades-section-label">
              <i class="fa-solid fa-user-graduate"></i> البيانات الأساسية
            </div>

            <!-- الاسم الثلاثي -->
            <div class="grades-field">
              <label class="grades-label">الاسم الثلاثي</label>
              <input
                id="gr-fullName"
                class="grades-input"
                type="text"
                placeholder="أدخل اسمك الثلاثي"
                maxlength="80"
                value="${_escHtml(_state.fullName)}"
              />
            </div>

            <!-- التخصص -->
            <div class="grades-field">
              <label class="grades-label">التخصص</label>
              <div class="grades-chips">
                ${SPECIALIZATIONS.map(s => `
                  <button
                    class="grades-chip${_state.specialization === s ? " active" : ""}"
                    onclick="window.GradesModule._pick('specialization','${_escAttr(s)}',this)"
                  >${s}</button>
                `).join("")}
              </div>
            </div>

            <!-- الفرقة -->
            <div class="grades-field">
              <label class="grades-label">الفرقة الدراسية</label>
              <div class="grades-chips">
                ${YEARS.map(y => `
                  <button
                    class="grades-chip${_state.year === y ? " active" : ""}"
                    onclick="window.GradesModule._pick('year','${_escAttr(y)}',this)"
                  >${y}</button>
                `).join("")}
              </div>
            </div>

            <!-- الترم -->
            <div class="grades-field">
              <label class="grades-label">الترم</label>
              <div class="grades-chips">
                ${TERMS.map(t => `
                  <button
                    class="grades-chip${_state.term === t ? " active" : ""}"
                    onclick="window.GradesModule._pick('term','${_escAttr(t)}',this)"
                  >${t}</button>
                `).join("")}
              </div>
            </div>

            <!-- عدد المواد -->
            <div class="grades-field">
              <label class="grades-label">عدد المواد</label>
              <div class="grades-count-row">
                <button class="grades-count-btn" onclick="window.GradesModule._changeCount(-1)">
                  <i class="fa-solid fa-minus"></i>
                </button>
                <span id="gr-count-display" class="grades-count-val">${_state.subjectCount}</span>
                <button class="grades-count-btn" onclick="window.GradesModule._changeCount(1)">
                  <i class="fa-solid fa-plus"></i>
                </button>
              </div>
            </div>

            <!-- زر التالي -->
            <button class="grades-btn-primary" onclick="window.GradesModule._goToSubjects()">
              <i class="fa-solid fa-arrow-left"></i> التالي — إدخال المواد
            </button>

          </div>
        </div>
      `;
    },

    /* ── رندر جدول المواد والتقديرات ── */
    _renderSubjects: function (root) {
      const subjectsHtml = _state.subjects.map((s, i) => `
        <div class="grades-subject-card">
          <div class="grades-subject-num">${i + 1}</div>
          <div class="grades-subject-fields">
            <input
              class="grades-input"
              type="text"
              placeholder="اسم المادة"
              maxlength="60"
              value="${_escHtml(s.name)}"
              oninput="window.GradesModule._updateSubject(${i},'name',this.value)"
            />
            <select
              class="grades-select"
              onchange="window.GradesModule._updateSubject(${i},'grade',this.value)"
            >
              <option value="">— التقدير —</option>
              ${GRADES_LIST.map(g => `
                <option value="${g}"${s.grade === g ? " selected" : ""}>${g}</option>
              `).join("")}
            </select>
          </div>
        </div>
      `).join("");

      root.innerHTML = `
        <div class="grades-overlay" onclick="window.GradesModule.close()"></div>
        <div class="grades-sheet">

          <div class="grades-sheet-header">
            <button class="grades-back-btn" onclick="window.GradesModule._backToForm()">
              <i class="fa-solid fa-arrow-right"></i> رجوع
            </button>
            <div class="grades-sheet-title">
              <i class="fa-solid fa-list-check"></i> المواد والتقديرات
            </div>
          </div>

          <div class="grades-sheet-body">

            <!-- ملخص البيانات -->
            <div class="grades-summary-bar">
              <span><i class="fa-solid fa-user"></i> ${_escHtml(_state.fullName) || "—"}</span>
              <span><i class="fa-solid fa-building-columns"></i> ${_escHtml(_state.specialization) || "—"}</span>
              <span><i class="fa-solid fa-layer-group"></i> ${_escHtml(_state.year) || "—"}</span>
              <span><i class="fa-solid fa-calendar"></i> ${_escHtml(_state.term) || "—"}</span>
            </div>

            <div class="grades-section-label">
              <i class="fa-solid fa-book"></i> المواد (${_state.subjectCount})
            </div>

            <div id="gr-subjects-list">
              ${subjectsHtml}
            </div>

            <!-- زر الحفظ -->
            <button
              id="gr-save-btn"
              class="grades-btn-primary grades-btn-save"
              onclick="window.GradesModule._save()"
            >
              <i class="fa-solid fa-floppy-disk"></i> حفظ البيانات
            </button>

          </div>
        </div>
      `;
    },

    /* ── اختيار chip ── */
    _pick: function (field, value, btn) {
      _state[field] = value;
      const group = btn.closest(".grades-chips");
      if (group) {
        group.querySelectorAll(".grades-chip").forEach(c => c.classList.remove("active"));
        btn.classList.add("active");
      }
    },

    /* ── تغيير عدد المواد ── */
    _changeCount: function (delta) {
      const newVal = Math.max(0, Math.min(20, _state.subjectCount + delta));
      _state.subjectCount = newVal;
      const display = document.getElementById("gr-count-display");
      if (display) display.textContent = newVal;
    },

    /* ── الانتقال لصفحة المواد ── */
    _goToSubjects: function () {
      const nameInp = document.getElementById("gr-fullName");
      if (nameInp) _state.fullName = nameInp.value.trim();

      if (!_state.fullName) {
        _shake("gr-fullName");
        _toast("أدخل الاسم الثلاثي", "warn");
        return;
      }
      if (!_state.specialization) { _toast("اختر التخصص", "warn"); return; }
      if (!_state.year)           { _toast("اختر الفرقة الدراسية", "warn"); return; }
      if (!_state.term)           { _toast("اختر الترم", "warn"); return; }
      if (_state.subjectCount < 1){ _toast("حدد عدد المواد (1 على الأقل)", "warn"); return; }

      const existing = _state.subjects;
      _state.subjects = Array.from({ length: _state.subjectCount }, (_, i) => ({
        name:  existing[i]?.name  || "",
        grade: existing[i]?.grade || "",
      }));

      _state.step = "subjects";
      const root = document.getElementById("grades-app-root");
      GradesModule._renderSubjects(root);
    },

    /* ── الرجوع لنموذج البيانات ── */
    _backToForm: function () {
      _state.step = "form";
      const root = document.getElementById("grades-app-root");
      GradesModule._renderForm(root);
    },

    /* ── تحديث مادة ── */
    _updateSubject: function (index, field, value) {
      if (_state.subjects[index]) _state.subjects[index][field] = value;
    },

    /* ── حفظ عبر Firebase ── */
    _save: async function () {
      await _saveToFirebase();
    },

    /* ── تهيئة ── */
    _init: function () {
      if (!document.getElementById("grades-app-root")) {
        console.error("[Grades] grades-app-root غير موجود");
        return;
      }
      console.log("[Grades] ✓ المرحلة 2 جاهزة");
    },
  };

  /* ─────────────────────────────────────────
     دوال مساعدة
  ───────────────────────────────────────── */
  function _escHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // للاستخدام داخل onclick="" حيث نحتاج escaping مختلف
  function _escAttr(str) {
    if (!str) return "";
    return String(str).replace(/'/g, "\\'");
  }

  function _shake(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add("grades-shake");
    setTimeout(() => el.classList.remove("grades-shake"), 500);
  }

  /* ─────────────────────────────────────────
     تعريض على window
  ───────────────────────────────────────── */
  window.GradesModule = GradesModule;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => GradesModule._init());
  } else {
    GradesModule._init();
  }

})();
