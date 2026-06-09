/* ══════════════════════════════════════════
   CHAT SEARCH SYSTEM
   ▸ Searches loaded messages in DOM (no extra Firebase reads)
   ▸ Highlights matches, navigates prev/next
   ▸ Works across public, DM, and rooms
══════════════════════════════════════════ */
(function() {
  let _srchQuery    = "";
  let _srchMatches  = []; // Array of {hlEl} DOM span elements
  let _srchIdx      = -1;
  let _srchTimer    = null;
  // Original text cache per bubble-text node: WeakMap<TextNode, string>
  const _origText   = new WeakMap();

  /* ── Public API ── */
  window.toggleChatSearch = function() {
    const bar = document.getElementById("chatSearchBar");
    if (!bar) return;
    if (bar.classList.contains("open")) {
      closeChatSearch();
    } else {
      bar.classList.add("open");
      const inp = document.getElementById("chatSearchInput");
      if (inp) { inp.value = ""; inp.focus(); }
      _updateCount();
    }
  };

  window.closeChatSearch = function() {
    const bar = document.getElementById("chatSearchBar");
    if (bar) bar.classList.remove("open");
    _clearHighlights();
    _srchQuery   = "";
    _srchMatches = [];
    _srchIdx     = -1;
    _updateCount();
    const inp = document.getElementById("chatSearchInput");
    if (inp) inp.value = "";
  };

  window.onChatSearch = function(val) {
    clearTimeout(_srchTimer);
    _srchTimer = setTimeout(() => {
      _srchQuery = (val || "").trim().toLowerCase();
      _runSearch();
    }, 120);
  };

  window.chatSearchNext = function() {
    if (!_srchMatches.length) return;
    _srchIdx = (_srchIdx + 1) % _srchMatches.length;
    _scrollToMatch();
    _updateCount();
  };

  window.chatSearchPrev = function() {
    if (!_srchMatches.length) return;
    _srchIdx = (_srchIdx - 1 + _srchMatches.length) % _srchMatches.length;
    _scrollToMatch();
    _updateCount();
  };

  /* ── Internal ── */
  function _runSearch() {
    _clearHighlights();
    _srchMatches = [];
    _srchIdx     = -1;

    if (_srchQuery.length < 1) { _updateCount(); return; }

    const container = document.getElementById("chatMessages");
    if (!container) { _updateCount(); return; }

    // Only search inside .bubble-text elements (avoids touching meta/time/badges)
    const bubbleTexts = container.querySelectorAll(".bubble-text");
    bubbleTexts.forEach(btEl => {
      _highlightInEl(btEl, _srchQuery);
    });

    // Collect all highlight spans created
    _srchMatches = Array.from(
      container.querySelectorAll(".srch-hl")
    );

    if (_srchMatches.length > 0) {
      _srchIdx = 0;
      _scrollToMatch();
    }
    _updateCount();
  }

  function _highlightInEl(el, query) {
    // Walk only text nodes — safe, doesn't break HTML structure
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
    const nodes  = [];
    let node;
    while ((node = walker.nextNode())) nodes.push(node);

    nodes.forEach(tn => {
      const text = tn.nodeValue;
      if (!text) return;
      const lower = text.toLowerCase();
      let idx = lower.indexOf(query);
      if (idx === -1) return;

      const frag = document.createDocumentFragment();
      let last = 0;
      while (idx !== -1) {
        if (idx > last) frag.appendChild(document.createTextNode(text.slice(last, idx)));
        const span = document.createElement("span");
        span.className = "srch-hl";
        span.textContent = text.slice(idx, idx + query.length);
        frag.appendChild(span);
        last = idx + query.length;
        idx  = lower.indexOf(query, last);
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      tn.parentNode.replaceChild(frag, tn);
    });
  }

  function _clearHighlights() {
    // Replace each srch-hl span with its text content in-place
    const container = document.getElementById("chatMessages");
    if (!container) return;
    container.querySelectorAll(".srch-hl").forEach(span => {
      span.replaceWith(document.createTextNode(span.textContent));
    });
    // Merge adjacent text nodes to keep DOM clean
    container.querySelectorAll(".bubble-text").forEach(el => el.normalize());
  }

  function _scrollToMatch() {
    // Remove active from all
    _srchMatches.forEach(el => el.classList.remove("srch-hl-active"));
    const cur = _srchMatches[_srchIdx];
    if (!cur) return;
    cur.classList.add("srch-hl-active");
    cur.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function _updateCount() {
    const countEl = document.getElementById("chatSearchCount");
    const prevBtn = document.getElementById("srchPrevBtn");
    const nextBtn = document.getElementById("srchNextBtn");
    if (!countEl) return;
    const total = _srchMatches.length;
    if (total === 0) {
      countEl.textContent = _srchQuery ? "لا نتائج" : "0 / 0";
    } else {
      countEl.textContent = `${_srchIdx + 1} / ${total}`;
    }
    if (prevBtn) prevBtn.disabled = total < 2;
    if (nextBtn) nextBtn.disabled = total < 2;
  }

  /* ── Re-run search after new messages arrive (real-time) ── */
  // Patch: observe chatMessages mutations to re-highlight new nodes
  const _srchObserver = new MutationObserver(() => {
    if (_srchQuery) {
      clearTimeout(_srchTimer);
      _srchTimer = setTimeout(_runSearch, 180);
    }
  });
  // Start observing once DOM is ready
  document.addEventListener("DOMContentLoaded", () => {
    const container = document.getElementById("chatMessages");
    if (container) _srchObserver.observe(container, { childList: true, subtree: false });
  });
  // Also start immediately if DOM already loaded
  const _chatMsgEl = document.getElementById("chatMessages");
  if (_chatMsgEl) _srchObserver.observe(_chatMsgEl, { childList: true, subtree: false });

  /* ── Close search when switching chats ── */
  const _origOpenChat = window.openChat;
  if (typeof _origOpenChat === "function") {
    window.openChat = function(...args) {
      closeChatSearch();
      return _origOpenChat.apply(this, args);
    };
  }
})();
