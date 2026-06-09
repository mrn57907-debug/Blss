
/**
 * ══════════════════════════════════════════
 *   GRADES MODULE — درجاتي
 *   المرحلة 1: الواجهة الأساسية
 * ══════════════════════════════════════════
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

  const GRADES = [
    "A+", "A", "B+", "B", "C+", "C", "C-",
    "D+", "D", "D-", "F", "غ", "FX",
  ];

  /* ─────────────────────────────────────────
     الحالة الداخلية
  ───────────────────────────────────────── */
  let _state = {
    step: "form",       // "form" | "subjects"
    fullName: "",
    specialization: "",
    year: "",
    term: "",
    subjectCount: 0,
    subjects: [],       // [{ name, grade }]
  };

  /* ─────────────────────────────────────────
     الوحدة الرئيسية
  ───────────────────────────────────────── */
  const GradesModule = {
    version: "1.0.0",

    open: function () {
      const root = document.getElementById("grades-app-root");
      if (!root) return;

      const user = window.currentUser;
      if (!user || !user.uid) {
        if (typeof window.toast === "function")
          window.toast("يجب تسجيل الدخول أولاً", "warn");
        return;
      }

      _state = {
        step: "form",
        fullName: "", specialization: "", year: "", term: "",
        subjectCount: 0, subjects: [],
      };

      root.classList.add("grades-open");
      root.style.display = "flex";
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
                    onclick="window.GradesModule._pick('specialization', '${_escHtml(s)}', this)"
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
                    onclick="window.GradesModule._pick('year', '${_escHtml(y)}', this)"
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
                    onclick="window.GradesModule._pick('term', '${_escHtml(t)}', this)"
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
      // بناء قائمة المواد من الحالة
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
              oninput="window.GradesModule._updateSubject(${i}, 'name', this.value)"
            />
            <select
              class="grades-select"
              onchange="window.GradesModule._updateSubject(${i}, 'grade', this.value)"
            >
              <option value="">— التقدير —</option>
              ${GRADES.map(g => `
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
            <button class="grades-btn-primary grades-btn-save" onclick="window.GradesModule._save()">
              <i class="fa-solid fa-floppy-disk"></i> حفظ البيانات
            </button>

          </div>
        </div>
      `;
    },

    /* ── اختيار chip ── */
    _pick: function (field, value, btn) {
      _state[field] = value;
      // تحديث الـ chips بصرياً
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
      // التحقق من البيانات
      const nameInp = document.getElementById("gr-fullName");
      if (nameInp) _state.fullName = nameInp.value.trim();

      if (!_state.fullName) {
        _shake("gr-fullName");
        if (typeof window.toast === "function")
          window.toast("أدخل الاسم الثلاثي", "warn");
        return;
      }
      if (!_state.specialization) {
        if (typeof window.toast === "function")
          window.toast("اختر التخصص", "warn");
        return;
      }
      if (!_state.year) {
        if (typeof window.toast === "function")
          window.toast("اختر الفرقة الدراسية", "warn");
        return;
      }
      if (!_state.term) {
        if (typeof window.toast === "function")
          window.toast("اختر الترم", "warn");
        return;
      }
      if (_state.subjectCount < 1) {
        if (typeof window.toast === "function")
          window.toast("حدد عدد المواد (1 على الأقل)", "warn");
        return;
      }

      // بناء مصفوفة المواد مع الحفاظ على البيانات المدخلة مسبقاً
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
      if (_state.subjects[index]) {
        _state.subjects[index][field] = value;
      }
    },

    /* ── حفظ (المرحلة 1: رسالة فقط) ── */
    _save: function () {
      if (typeof window.toast === "function") {
        window.toast("سيتم تفعيل الحفظ في المرحلة الثانية", "warn");
      }
    },

    /* ── تهيئة ── */
    _init: function () {
      const root = document.getElementById("grades-app-root");
      if (!root) {
        console.error("[Grades] grades-app-root غير موجود");
        return;
      }
      console.log("[Grades] ✓ المرحلة 1 جاهزة");
    },
  };

  /* ─────────────────────────────────────────
     دوال مساعدة
  ───────────────────────────────────────── */
  function _escHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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
