
/* ══════════════════════════════════════════
   NOTIFICATION SETTINGS SYSTEM
══════════════════════════════════════════ */
(function() {
  // All pref keys — value true = enabled, false = disabled
  const NS_KEYS = ["dm","reply","mention","vip","admin","news","lectures","exams","sections"];
  // Default: all enabled
  let _prefs = {};
  NS_KEYS.forEach(k => _prefs[k] = true);

  let _savingTimer = null;

  /* Load prefs from Firestore for current user */
  async function _loadPrefs(uid) {
    if (!uid || !window.db) return;
    try {
      const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
      const snap = await getDoc(doc(window.db, "users", uid, "settings", "notifPrefs"));
      if (snap.exists()) {
        const d = snap.data();
        NS_KEYS.forEach(k => { if (typeof d[k] === "boolean") _prefs[k] = d[k]; });
      }
    } catch(e) {}
    _syncToggles();
  }

  /* Save single pref */
  async function _savePrefs() {
    const uid = window.currentUser?.uid;
    if (!uid || !window.db) return;
    const el = document.getElementById("nsmSaving");
    if (el) { el.style.opacity = "1"; }
    clearTimeout(_savingTimer);
    _savingTimer = setTimeout(async () => {
      try {
        const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
        await setDoc(doc(window.db, "users", uid, "settings", "notifPrefs"), _prefs, { merge: true });
      } catch(e) {}
      if (el) { el.style.opacity = "0"; }
    }, 700);
  }

  function _syncToggles() {
    NS_KEYS.forEach(k => {
      const inp = document.getElementById("nsPref_" + k);
      if (inp) inp.checked = _prefs[k] !== false;
    });
  }

  /* Public API */
  window.openNotifSettings = function() {
    document.getElementById("notifSettingsModal")?.classList.add("open");
    _loadPrefs(window.currentUser?.uid);
    _syncToggles();
  };
  window.closeNotifSettings = function() {
    document.getElementById("notifSettingsModal")?.classList.remove("open");
  };
  window.saveNotifPref = function(key, val) {
    _prefs[key] = val;
    _savePrefs();
  };
  window.notifSetAll = function(enable) {
    NS_KEYS.forEach(k => { _prefs[k] = enable; });
    _syncToggles();
    _savePrefs();
  };

  /* Check if a notif type is allowed for the current user */
  window.isNotifAllowed = function(type) {
    if (!type) return true;
    return _prefs[type] !== false;
  };

  /* Load prefs when auth state changes */
  const _origStart = window._startNotifListener;
  if (typeof _origStart === "function") {
    window._startNotifListener = function(uid) {
      _loadPrefs(uid);
      return _origStart.apply(this, arguments);
    };
  }

  /* Patch showInAppNotif to respect prefs */
  const _origShow = window.showInAppNotif;
  if (typeof _origShow === "function") {
    window.showInAppNotif = function(title, body, data, onClick) {
      const type = window._ianTypeFromData ? window._ianTypeFromData(data) : "default";
      if (type !== "default" && !window.isNotifAllowed(type)) return;
      return _origShow.apply(this, arguments);
    };
  }
})();
