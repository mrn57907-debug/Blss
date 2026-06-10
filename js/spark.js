(function() {
const SPARK_CFG = {
    'vip-7':  {dot:'rgba(255,210,60,.85)',  streak:'rgba(255,195,40,.6)',  n:4, speed:1.8},
  'vip-8':  {dot:'rgba(255,220,80,.88)',  streak:'rgba(255,205,50,.65)', n:5, speed:1.5},
  'vip-9':  {dot:'rgba(255,235,100,.9)',  streak:'rgba(255,220,70,.7)',  n:5, speed:1.2},
  'vip-10': {dot:'rgba(255,248,140,.92)', streak:'rgba(255,230,80,.72)', n:6, speed:1.0},
  'svip-1': {dot:'rgba(255,245,180,.88)', streak:'rgba(255,235,140,.6)', n:4, speed:2.0},
  'svip-2': {dot:'rgba(255,248,190,.9)',  streak:'rgba(255,240,150,.62)',n:4, speed:1.8},
  'svip-3': {dot:'rgba(255,252,200,.9)',  streak:'rgba(255,244,160,.65)',n:5, speed:1.6},
  'svip-4': {dot:'rgba(255,254,215,.92)', streak:'rgba(255,248,170,.68)',n:5, speed:1.5},
  'svip-5': {dot:'rgba(255,255,225,.92)', streak:'rgba(255,252,180,.7)', n:5, speed:1.4},
  'svip-6': {dot:'rgba(255,255,235,.93)', streak:'rgba(255,254,190,.72)',n:5, speed:1.2},
  'svip-7': {dot:'rgba(255,255,245,.94)', streak:'rgba(255,255,200,.74)',n:6, speed:1.1},
  'svip-8': {dot:'rgba(255,255,252,.95)', streak:'rgba(240,248,255,.76)',n:6, speed:0.95},
  'svip-9': {dot:'rgba(255,255,255,.95)', streak:'rgba(220,235,255,.78)',n:6, speed:0.8},
  'svip-10':{dot:'rgba(255,255,255,.96)', streak:'rgba(200,220,255,.8)', n:7, speed:0.65},
};

function _fireOneSpark(el, cfg) {
  const isStreak = Math.random() > 0.55;
  const sp = document.createElement('span');
  sp.className = 'ltng-sp ' + (isStreak ? 'streak' : 'dot');
  sp.style.background = isStreak ? cfg.streak : cfg.dot;
  const angle = Math.random() * Math.PI * 2;
  const r     = 6 + Math.random() * 10;
  sp.style.setProperty('--tx', Math.round(Math.cos(angle)*r) + 'px');
  sp.style.setProperty('--ty', Math.round(Math.sin(angle)*r) + 'px');
  sp.style.left = (20 + Math.random() * 60) + '%';
  sp.style.top  = (15 + Math.random() * 70) + '%';
  const dur = (0.5 + Math.random() * 0.6) / cfg.speed;
  sp.style.animation = (isStreak ? 'spkLine' : 'spkPop') + ' ' + dur.toFixed(2) + 's ease-out forwards';
  el.appendChild(sp);
  sp.addEventListener('animationend', () => sp.remove(), { once: true });
}

function _attachSparksToEl(el, cls) {
  const cfg = SPARK_CFG[cls];
  if (!cfg) return;
  let tid = null;
  function loop() {
    for (let i = 0; i < cfg.n; i++) {
      setTimeout(() => { if (el.isConnected) _fireOneSpark(el, cfg); }, i * (120 / cfg.n));
    }
    tid = setTimeout(loop, (800 + Math.random() * 600) * cfg.speed);
  }
  loop();
  const obs = new MutationObserver(() => {
    if (!el.isConnected) { clearTimeout(tid); obs.disconnect(); }
  });
  obs.observe(document.body, { childList: true, subtree: true });
}

function _initSparks() {
  document.querySelectorAll('.vip-text').forEach(el => {
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.style.overflow = 'visible';
    for (const cls of Object.keys(SPARK_CFG)) {
      if (el.classList.contains(cls)) { _attachSparksToEl(el, cls); break; }
    }
  });
}

/* مراقبة عناصر جديدة (رسائل شات جديدة) */
(function _watchNewVipText() {
  const _seen = new WeakSet();
  let _pending = false;
  new MutationObserver(() => {
    if (_pending) return; _pending = true;
    requestAnimationFrame(() => {
      _pending = false;
      document.querySelectorAll('.vip-text').forEach(el => {
        if (_seen.has(el)) return; _seen.add(el);
        if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
        el.style.overflow = 'visible';
        for (const cls of Object.keys(SPARK_CFG)) {
          if (el.classList.contains(cls)) { _attachSparksToEl(el, cls); break; }
        }
      });
    });
  }).observe(document.body, { childList: true, subtree: true });
})();

/* تشغيل أولي */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _initSparks);
} else {
  setTimeout(_initSparks, 300);
}
})();
