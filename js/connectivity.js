/* ══════════════════════════════════════════
   INTERNET CONNECTIVITY DETECTION
   ↳ Shows banner on disconnect, hides on reconnect
══════════════════════════════════════════ */
(function() {
  /* ── Create the offline banner element ── */
  const banner = document.createElement("div");
  banner.id = "_offlineBanner";
  banner.style.cssText = [
    "position:fixed",
    "bottom:0","left:0","right:0",
    "z-index:999999",
    "background:linear-gradient(135deg,#1a0a0a,#2d0f0f)",
    "color:#fca5a5",
    "text-align:center",
    "font-family:inherit",
    "font-size:14px",
    "font-weight:700",
    "padding:12px 16px",
    "border-top:1.5px solid rgba(239,68,68,.4)",
    "box-shadow:0 -4px 24px rgba(239,68,68,.2)",
    "display:none",
    "align-items:center",
    "justify-content:center",
    "gap:10px",
    "transition:opacity .3s ease,transform .3s ease",
    "opacity:0",
    "transform:translateY(100%)"
  ].join(";");
  banner.innerHTML = '<i class="fa-solid fa-wifi" style="opacity:.7"></i> <span>لا يوجد اتصال بالإنترنت — يُرجى التحقق من شبكتك</span>';
  document.body.appendChild(banner);

  let _bannerVisible = false;
  let _reconnectTimer = null;

  function _showBanner() {
    if (_bannerVisible) return;
    _bannerVisible = true;
    banner.style.display = "flex";
    requestAnimationFrame(() => requestAnimationFrame(() => {
      banner.style.opacity = "1";
      banner.style.transform = "translateY(0)";
    }));
  }

  function _hideBanner() {
    if (!_bannerVisible) return;
    banner.style.opacity = "0";
    banner.style.transform = "translateY(100%)";
    setTimeout(() => {
      banner.style.display = "none";
      _bannerVisible = false;
    }, 320);
  }

  function _onOffline() {
    clearTimeout(_reconnectTimer);
    _showBanner();
  }

  function _onOnline() {
    clearTimeout(_reconnectTimer);
    _reconnectTimer = setTimeout(_hideBanner, 900);
  }

  window.addEventListener("offline", _onOffline);
  window.addEventListener("online",  _onOnline);

  /* Check initial state in case page loaded while offline */
  if (!navigator.onLine) _showBanner();
})();
