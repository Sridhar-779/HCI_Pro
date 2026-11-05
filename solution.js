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

  function loadResults() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};

    try {
      return JSON.parse(raw);
    } catch (_err) {
      return {};
    }
  }

  function formatRound(data, label) {
    if (!data) {
      return `${label}: not completed yet.`;
    }

    return `${label}: ${data.durationSec}s, overshoots ${data.overshoots}, fatigue ${data.fatigue}/10.`;
  }

  function compare(roundA, roundB) {
    if (!roundA || !roundB) {
      return "Run both rounds first. The hybrid design aims to reduce overshoots while preserving browsing flow.";
    }

    const faster = roundA.durationSec < roundB.durationSec ? "Pagination" : "Infinite Scroll";
    const lowerOvershoot = roundA.overshoots < roundB.overshoots ? "Pagination" : "Infinite Scroll";
    const lowerFatigue = roundA.fatigue < roundB.fatigue ? "Pagination" : "Infinite Scroll";

    return `Your data: ${faster} was faster, ${lowerOvershoot} had fewer overshoots, and ${lowerFatigue} felt less fatiguing. Hybrid design introduces pause checkpoints and spatial anchors to reduce scanning fatigue.`;
  }

  function renderSummary() {
    const results = loadResults();
    const pagination = results.pagination;
    const infinite = results.infinite;

    document.getElementById("paginationSummary").textContent = formatRound(pagination, "Pagination");
    document.getElementById("infiniteSummary").textContent = formatRound(infinite, "Infinite Scroll");
    document.getElementById("insightSummary").textContent = compare(pagination, infinite);
  }

  function renderHybridCards(grid, from, to) {
    const end = Math.min(to, DB.length);
    for (let i = from; i < end; i++) {
      const item = DB[i];
      const card = document.createElement("article");
      card.className = "product-card staged";
      card.style.animationDelay = `${(i - from) * 22}ms`;
      card.innerHTML = `
        <div class="product-emoji">${item.emoji}</div>
        <div class="product-name">${item.name}</div>
        <div class="product-price">$${item.price}.00</div>
      `;
      grid.appendChild(card);
    }
  }

  function startHybridDemo() {
    const grid = document.getElementById("hybridGrid");
    const loadBtn = document.getElementById("loadMoreBtn");
    const anchor = document.getElementById("anchorLabel");

    let loaded = 0;

    function updateAnchor() {
      const start = loaded === 0 ? 0 : loaded - 19;
      const end = Math.min(loaded, DB.length);
      anchor.textContent = `Viewing items ${start}-${end} of ${DB.length}`;
    }

    function loadMore() {
      if (loaded >= DB.length) return;

      const skeletons = document.createElement("div");
      skeletons.className = "skeleton-row";
      for (let i = 0; i < 4; i++) {
        const sk = document.createElement("div");
        sk.className = "skeleton-card";
        skeletons.appendChild(sk);
      }
      grid.appendChild(skeletons);

      setTimeout(function () {
        skeletons.remove();
        renderHybridCards(grid, loaded, loaded + 20);
        loaded = Math.min(loaded + 20, DB.length);
        updateAnchor();

        if (loaded >= DB.length) {
          loadBtn.disabled = true;
          loadBtn.textContent = "All Items Loaded";
        }
      }, 380);
    }

    grid.innerHTML = "";
    loadBtn.disabled = false;
    loadBtn.textContent = "Load 20 More";

    loadMore();

    loadBtn.onclick = loadMore;
  }

  document.getElementById("startHybridBtn").addEventListener("click", startHybridDemo);
  document.getElementById("resetResultsBtn").addEventListener("click", function () {
    localStorage.removeItem(STORAGE_KEY);
    renderSummary();
  });

  renderSummary();
})();
