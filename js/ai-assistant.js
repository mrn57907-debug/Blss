/* ══════════════════════════════════════════════════════════════
   ai-assistant.js — منطق المساعد الذكي الكامل
   يعتمد على js/ai-config.js (لازم يُحمَّل قبل الملف ده).
   شاشة العرض (#page-ai-chat) بتستخدم نفس كلاسات شاشة الشات الحقيقية
   (.msg-row, .bubble, .bubble-meta...) بدون أي تعديل عليها.
══════════════════════════════════════════════════════════════ */

// ── حالة القائمة (للعرض في dmsConvList فقط، لا يوجد أي تخزين Firestore) ──
let _aiLastMsg  = "اسأل أي سؤال عن الموقع...";
let _aiLastTime = null;
let _aiUnread   = 0;
let _aiMessages = []; // {who:'in'|'out', text, ts}

window._aiListItem = function () {
  return {
    id: "ai", name: "المساعد الذكي", photo: "", cls: "ai",
    lastMsg: _aiLastMsg, lastTime: _aiLastTime, unread: _aiUnread, isOnline: false,
  };
};

// ── فتح شاشة المساعد ──
window._openAiChat = function () {
  _aiUnread = 0;
  window.showPage?.("page-ai-chat");
  if (!_aiMessages.length) {
    _aiMessages.push({ who: "in", text: "أهلاً بيك! أنا المساعد الذكي، اسألني في أي حاجة.", ts: Date.now() });
  }
  _renderAiMessages();
  window._dmsRerender?.();
  setTimeout(() => { document.getElementById("aiChatInput")?.focus(); }, 200);
};

// ── رسم الرسائل بنفس تصميم فقاعة الشات الحقيقية (msg-row/bubble) ──
function _renderAiMessages() {
  const body = document.getElementById("aiChatBody");
  if (!body) return;
  if (!_aiMessages.length) {
    body.innerHTML = `<div class="empty-state" style="margin:auto;">اسأل المساعد الذكي عن أي حاجة في الموقع <i class="fa-solid fa-sparkles"></i></div>`;
    return;
  }
  const dayDivider = `<div class="date-divider"><span>اليوم</span></div>`;
  body.innerHTML = dayDivider + _aiMessages.map(m => {
    const isMe = m.who === "out";
    const timeStr = new Date(m.ts).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
    return `
      <div class="msg-row ${isMe ? "me" : "other"}">
        <div class="msg-bubble-group">
          <div class="msg-line">
            <div class="bubble ${isMe ? "me" : "other"}">
              <div class="bubble-text">${_escAi(m.text)}</div>
            </div>
          </div>
          <div class="bubble-meta ${isMe ? "" : "other"}">
            <span class="bubble-time">${timeStr}</span>
          </div>
        </div>
      </div>`;
  }).join("");
  body.scrollTop = body.scrollHeight;
}

function _escAi(s) {
  const d = document.createElement("div");
  d.textContent = s || "";
  return d.innerHTML;
}

function _showAiTyping() {
  const body = document.getElementById("aiChatBody");
  if (!body) return;
  const row = document.createElement("div");
  row.className = "msg-row other";
  row.id = "aiTypingRow";
  row.innerHTML = `<div class="msg-bubble-group"><div class="msg-line"><div class="bubble other"><div class="ai-typing"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div></div></div></div>`;
  body.appendChild(row);
  body.scrollTop = body.scrollHeight;
}
function _hideAiTyping() {
  document.getElementById("aiTypingRow")?.remove();
}

// ══ Rate Limiter + معالجة الأخطاء (منقول بنفس المنطق المُرسَل) ══
const AI_COOLDOWN_KEY  = "bliss_ai_cooldown_until";
const AI_RATE_LOG_KEY  = "bliss_ai_request_log";
let aiCooldownUntil = parseInt(localStorage.getItem(AI_COOLDOWN_KEY) || "0", 10) || 0;
let aiCooldownTimer = null;
let aiSending = false;

function setAiSendDisabled(disabled) {
  const btn = document.getElementById("aiSendBtn");
  if (!btn) return;
  btn.style.opacity = disabled ? "0.5" : "";
  btn.style.pointerEvents = disabled ? "none" : "";
}

function startAiCooldown(seconds) {
  aiCooldownUntil = Date.now() + seconds * 1000;
  localStorage.setItem(AI_COOLDOWN_KEY, String(aiCooldownUntil));
  setAiSendDisabled(true);
  if (aiCooldownTimer) clearTimeout(aiCooldownTimer);
  const tick = () => {
    const remaining = Math.ceil((aiCooldownUntil - Date.now()) / 1000);
    const inp = document.getElementById("aiChatInput");
    if (remaining <= 0) {
      setAiSendDisabled(false);
      if (inp) inp.placeholder = "اسأل المساعد الذكي...";
      aiCooldownTimer = null;
      localStorage.removeItem(AI_COOLDOWN_KEY);
      return;
    }
    if (inp) inp.placeholder = `المساعد مشغول، جرب بعد ${remaining} ثانية...`;
    aiCooldownTimer = setTimeout(tick, 1000);
  };
  tick();
}
if (aiCooldownUntil > Date.now()) {
  startAiCooldown(Math.ceil((aiCooldownUntil - Date.now()) / 1000));
}

function getRequestLog() {
  try {
    const cfg = window._aiConfig;
    const log = JSON.parse(localStorage.getItem(AI_RATE_LOG_KEY) || "[]");
    return log.filter(ts => ts > Date.now() - cfg.rateWindowMs);
  } catch { return []; }
}
function recordRequest() {
  const log = getRequestLog();
  log.push(Date.now());
  localStorage.setItem(AI_RATE_LOG_KEY, JSON.stringify(log));
}
function delay(ms) { return new Promise(res => setTimeout(res, ms)); }

async function waitForRateLimitSlot() {
  const cfg = window._aiConfig;
  let log = getRequestLog();
  while (log.length >= cfg.rateSafeLimit) {
    const waitMs = Math.max(0, (log[0] + cfg.rateWindowMs) - Date.now()) + 250;
    const inp = document.getElementById("aiChatInput");
    if (inp) inp.placeholder = `طلبك في قائمة الانتظار، هيتبعت تلقائي بعد ${Math.ceil(waitMs / 1000)} ثانية...`;
    await delay(Math.min(waitMs, 1000));
    log = getRequestLog();
  }
  const inp = document.getElementById("aiChatInput");
  if (inp) inp.placeholder = "اسأل المساعد الذكي...";
}

async function askGemini(promptText) {
  const cfg = window._aiConfig;
  let response;
  try {
    response = await fetch(cfg.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: cfg.systemInstruction }] },
        contents: [{ parts: [{ text: promptText }] }],
      }),
    });
  } catch (networkErr) {
    throw new Error("تعذّر الوصول للشبكة: " + (networkErr?.message || networkErr));
  }
  const rawText = await response.text();
  let data;
  try { data = JSON.parse(rawText); }
  catch { throw new Error(`رد غير متوقع (status ${response.status}): ` + rawText.slice(0, 200)); }
  if (!response.ok) {
    throw new Error(`Gemini API error (status ${response.status}): ${data?.error?.message || JSON.stringify(data)}`);
  }
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("رد غير متوقع من Gemini: " + JSON.stringify(data).slice(0, 300));
  return text;
}

async function askGeminiWithRetry(text) {
  await waitForRateLimitSlot();
  try {
    recordRequest();
    return await askGemini(text);
  } catch (err) {
    if (err?.message?.includes("status 503")) {
      await delay(3000);
      recordRequest();
      return await askGemini(text);
    }
    throw err;
  }
}

// ══ الإرسال ══
window._sendToAI = function () {
  if (aiSending) return;
  if (Date.now() < aiCooldownUntil) return;
  const inp = document.getElementById("aiChatInput");
  const text = (inp?.value || "").trim();
  if (!text) return;

  aiSending = true;
  setAiSendDisabled(true);

  _aiMessages.push({ who: "out", text, ts: Date.now() });
  _aiLastMsg = text; _aiLastTime = { toMillis: () => Date.now() };
  _renderAiMessages();
  window._dmsRerender?.();
  if (inp) inp.value = "";

  // المساعد موقوف لحد ما يتحط مفتاح API حقيقي في js/ai-config.js
  if (!window._aiConfig?.isConfigured) {
    setTimeout(() => {
      const reply = "المساعد الذكي لسه مش مفعّل حاليًا — هيشتغل تلقائيًا بمجرد إضافة مفتاح API في ملف الإعدادات الخاص بيه.";
      _aiMessages.push({ who: "in", text: reply, ts: Date.now() });
      _aiLastMsg = reply; _aiLastTime = { toMillis: () => Date.now() };
      _renderAiMessages();
      window._dmsRerender?.();
      aiSending = false;
      setAiSendDisabled(false);
    }, 400);
    return;
  }

  setTimeout(() => { _showAiTyping(); }, 300);
  setTimeout(async () => {
    try {
      const reply = await askGeminiWithRetry(text);
      _hideAiTyping();
      _aiMessages.push({ who: "in", text: reply, ts: Date.now() });
      _aiLastMsg = reply; _aiLastTime = { toMillis: () => Date.now() };
      _renderAiMessages();
    } catch (err) {
      _hideAiTyping();
      const msg = err?.message || "";
      console.error("Gemini error:", msg || err);
      let errText;
      if (msg.includes("status 429")) {
        const match = msg.match(/retry in ([\d.]+)s/i);
        const waitSec = match ? Math.ceil(parseFloat(match[1])) : 30;
        errText = `⏳ المساعد وصل للحد المسموح به من الطلبات دلوقتي، جرب تاني بعد ${waitSec} ثانية.`;
        startAiCooldown(waitSec);
      } else if (msg.includes("status 503")) {
        errText = "⚠️ في ضغط عالي على المساعد الذكي دلوقتي، جرب تاني بعد شوية.";
      } else {
        errText = "⚠️ " + (msg || "خطأ غير معروف");
      }
      _aiMessages.push({ who: "in", text: errText, ts: Date.now() });
      _aiLastMsg = errText; _aiLastTime = { toMillis: () => Date.now() };
      _renderAiMessages();
    } finally {
      aiSending = false;
      window._dmsRerender?.();
      if (Date.now() >= aiCooldownUntil) setAiSendDisabled(false);
    }
  }, 700);
};

// ── ربط زر الإرسال + Enter ──
document.addEventListener("DOMContentLoaded", () => {
  const inp = document.getElementById("aiChatInput");
  inp?.addEventListener("keydown", e => { if (e.key === "Enter") window._sendToAI(); });
});
