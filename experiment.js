(function () {
  const STORAGE_KEY = "hci-scroll-lab-v1";

  function createDatabase() {
    const adjectives = ["Premium", "Minimal", "Eco", "Smart", "Urban", "Nordic", "Compact", "Classic", "Bold", "Rapid"];
    const items = ["Water Bottle", "Headphones", "Desk Lamp", "Notebook", "Backpack", "Wireless Mouse", "Coffee Mug", "Keyboard", "Travel Pouch", "Speaker"];
    const emojis = ["📦", "🎧", "💡", "📓", "🎒", "🖱️", "☕", "⌨️", "🧳", "🔊"];
    const db = [];

    for (let i = 1; i <= 200; i++) {
      const adj = adjectives[(i * 7) % adjectives.length];
      const item = items[(i * 11) % items.length];
      db.push({
        id: i,
        name: `${adj} ${item} #${i}`,
        emoji: emojis[i % emojis.length],
        price: 20 + ((i * 13) % 90)
      });
    }

    return db;
  }

  const DB = createDatabase();
  const TARGET_INDEXES = [37, 84, 142];
  const TARGETS = TARGET_INDEXES.map((i) => ({ index: i, item: DB[i] }));

  function getResults() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }

    try {
      return JSON.parse(raw);
    } catch (_err) {
      return {};
    }
  }

  function saveRoundResult(mode, result) {
    const data = getResults();
    data[mode] = result;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function buildCard(item, index, isTarget, onFound) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "product-card";
    card.setAttribute("data-index", String(index));

    if (isTarget) {
      card.classList.add("target-match");
      card.addEventListener("click", onFound);
    }

    card.innerHTML = `
      <div class="product-emoji">${item.emoji}</div>
      <div class="product-name">${item.name}</div>
      <div class="product-price">$${item.price}.00</div>
    `;

    return card;
  }

  function start(mode) {
    const els = {
      targetName: document.getElementById("targetName"),
      overshootTxt: document.getElementById("overshootTxt"),
      foundTxt: document.getElementById("foundTxt"),
      timerTxt: document.getElementById("timerTxt"),
      fatigueInput: document.getElementById("fatigueInput"),
      fatigueValue: document.getElementById("fatigueValue"),
      startBtn: document.getElementById("startBtn"),
      saveBtn: document.getElementById("saveBtn"),
      nextLink: document.getElementById("nextLink"),
      roundReport: document.getElementById("roundReport"),
      feedContainer: document.getElementById("feedContainer"),
      grid: document.getElementById("productGrid"),
      paginationWrap: document.getElementById("paginationWrap")
    };

    let running = false;
    let timerId = null;
    let startTime = 0;
    let currentTargetIdx = 0;
    let currentPage = 1;
    let loadedCount = 0;
    let overshoots = 0;
    let found = 0;
    let maxPassedIndex = -1;

    const perPage = 20;

    function updateTimer() {
      if (!running) return;
      const sec = (performance.now() - startTime) / 1000;
      els.timerTxt.textContent = `${sec.toFixed(1)}s`;
    }

    function updateStats() {
      els.overshootTxt.textContent = String(overshoots);
      els.foundTxt.textContent = `${found} / ${TARGETS.length}`;
      els.fatigueValue.textContent = String(els.fatigueInput.value);
    }

    function target() {
      return TARGETS[currentTargetIdx];
    }

    function setTargetLabel() {
      if (!target()) {
        els.targetName.textContent = "Completed";
        return;
      }
      els.targetName.textContent = target().item.name;
    }

    function renderPage(page) {
      els.grid.innerHTML = "";
      const startIdx = (page - 1) * perPage;
      const endIdx = Math.min(startIdx + perPage, DB.length);

      for (let i = startIdx; i < endIdx; i++) {
        const isTarget = target() && DB[i].id === target().item.id;
        const card = buildCard(DB[i], i, isTarget, onFoundTarget);
        els.grid.appendChild(card);
      }

      const t = target();
      if (t) {
        const tPage = Math.floor(t.index / perPage) + 1;
        if (page > tPage) {
          overshoots += 1;
          updateStats();
        }
      }

      renderPaginationControls(page);
      els.feedContainer.scrollTop = 0;
    }

    function renderPaginationControls(page) {
      els.paginationWrap.innerHTML = "";
      const totalPages = Math.ceil(DB.length / perPage);
      const wrap = document.createElement("div");
      wrap.className = "pagination-controls";

      for (let p = 1; p <= totalPages; p++) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "page-btn";
        if (p === page) btn.classList.add("active");
        btn.textContent = String(p);
        btn.addEventListener("click", function () {
          currentPage = p;
          renderPage(currentPage);
        });
        wrap.appendChild(btn);
      }

      els.paginationWrap.appendChild(wrap);
    }

    function appendBatch(size) {
      const startIdx = loadedCount;
      const endIdx = Math.min(startIdx + size, DB.length);

      for (let i = startIdx; i < endIdx; i++) {
        const isTarget = target() && DB[i].id === target().item.id;
        const card = buildCard(DB[i], i, isTarget, onFoundTarget);
        els.grid.appendChild(card);
      }

      loadedCount = endIdx;
    }

    function handleInfiniteScroll() {
      if (!running || mode !== "infinite") return;

      const cards = els.grid.querySelectorAll(".product-card");
      const bounds = els.feedContainer.getBoundingClientRect();
      const t = target();

      cards.forEach((card) => {
        const rect = card.getBoundingClientRect();
        if (rect.top < bounds.top) {
          const idx = Number(card.getAttribute("data-index"));
          if (idx > maxPassedIndex) {
            maxPassedIndex = idx;
            if (t && idx > t.index) {
              overshoots += 1;
              updateStats();
            }
          }
        }
      });

      const nearBottom = els.feedContainer.scrollTop + els.feedContainer.clientHeight >= els.feedContainer.scrollHeight - 120;
      if (nearBottom && loadedCount < DB.length) {
        appendBatch(20);
      }
    }

    function onFoundTarget() {
      found += 1;
      currentTargetIdx += 1;
      updateStats();

      if (currentTargetIdx >= TARGETS.length) {
        finishRound();
        return;
      }

      setTargetLabel();
      if (mode === "pagination") {
        currentPage = 1;
        renderPage(currentPage);
      } else {
        els.feedContainer.scrollTop = 0;
      }
    }

    function finishRound() {
      running = false;
      clearInterval(timerId);
      updateTimer();

      const durationSec = Number(((performance.now() - startTime) / 1000).toFixed(1));
      const fatigue = Number(els.fatigueInput.value);

      saveRoundResult(mode, {
        mode,
        overshoots,
        durationSec,
        fatigue,
        found,
        completedAt: new Date().toISOString()
      });

      els.roundReport.hidden = false;
      els.roundReport.innerHTML = `
        <strong>Round Completed</strong>
        <p>Duration: ${durationSec}s</p>
        <p>Overshoots: ${overshoots}</p>
        <p>Fatigue: ${fatigue}/10</p>
      `;

      els.saveBtn.disabled = false;
      els.nextLink.setAttribute("aria-disabled", "false");
      els.nextLink.classList.add("active");
      els.targetName.textContent = "Completed";
    }

    function resetRound() {
      running = true;
      currentTargetIdx = 0;
      currentPage = 1;
      loadedCount = 0;
      overshoots = 0;
      found = 0;
      maxPassedIndex = -1;
      startTime = performance.now();
      clearInterval(timerId);
      timerId = setInterval(updateTimer, 100);
      els.roundReport.hidden = true;
      els.saveBtn.disabled = true;
      els.nextLink.setAttribute("aria-disabled", "true");
      els.nextLink.classList.remove("active");
      els.paginationWrap.innerHTML = "";
      els.feedContainer.scrollTop = 0;
      updateStats();
      setTargetLabel();

      if (mode === "pagination") {
        renderPage(currentPage);
      } else {
        els.grid.innerHTML = "";
        appendBatch(30);
      }
    }

    els.fatigueInput.addEventListener("input", updateStats);

    els.startBtn.addEventListener("click", resetRound);

    els.saveBtn.addEventListener("click", function () {
      const data = getResults()[mode];
      if (!data) return;
      els.roundReport.hidden = false;
      els.roundReport.innerHTML = `
        <strong>Saved</strong>
        <p>Round result saved to local experiment store.</p>
      `;
    });

    els.feedContainer.addEventListener("scroll", handleInfiniteScroll);

    updateStats();
  }

  window.HCIExperiment = { start };
})();
